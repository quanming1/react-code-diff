/**
 * @cd/core 可变文本模型（FR2.1 / FR2.6）。
 *
 * 结构：分块行缓冲（chunked line buffer）。
 * - 行按块存储：Block = { lines: string[], hashes: (number|null)[] }
 * - 块大小约束 [MIN_BLOCK, MAX_BLOCK]：插入超限分裂、删除合并/移除空块
 * - 行访问：按块起始行号二分定位 → O(log B) ≈ O(log n)（块内 O(1)）
 * - 区间读：定位起止块拼接 → O(行数)
 * - applyEdits：区间替换/插入/删除 → 局部块操作 + 受影响行 hash 失效 → 版本号 + 事件
 * - 大文件惰性：初始化不分块预切（整串存单块，访问时按需切片），>50K 行走同样结构
 *   （无需特殊路径——块结构天然惰性，行内容只在 getLineContent 时切片）
 * - uri 注册表雏形：createModel / getModel / disposeModel（Monaco 式）
 */

import { Emitter, type Event } from './event'
import { comparePositions, type Position, type Range, type TextEdit } from './types'

/** 单块行数下限/上限（保持块均衡，二分效率稳定） */
const MIN_BLOCK_LINES = 64
const MAX_BLOCK_LINES = 256

interface Block {
  lines: string[]
  /** 与 lines 平行：行 hash（null = 失效未算） */
  hashes: (number | null)[]
}

/** 单次内容变更的描述（Monaco IModelContentChange 简化版） */
export interface ModelContentChange {
  /** 变更在旧文本中的区间（1-based） */
  range: Range
  /** 变更在旧文本中的绝对偏移 */
  rangeOffset: number
  /** 旧区间长度 */
  rangeLength: number
  /** 新文本 */
  text: string
}

/** 内容变更事件负载 */
export interface ModelContentChangedEvent {
  versionId: number
  changes: ModelContentChange[]
}

/** FNV-1a 32bit 行 hash（快速、非加密；diff 与 token 失效共用） */
export function hashLine(content: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h
}

/** 新行文本 split（兼容 \r\n / \r / \n，Monaco 归一化语义） */
export function normalizeEOL(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export class TextModel {
  readonly uri: string

  private _blocks: Block[] = []
  /** 每块的起始行号（1-based；结构变更后重算，O(块数)） */
  private _blockStartLines: number[] = []
  private _lineCount = 0
  private _versionId = 0

  private readonly _onDidChangeContent: Emitter<ModelContentChangedEvent>
  readonly onDidChangeContent: Event<ModelContentChangedEvent>

  constructor(value: string, uri: string, _language?: string) {
    this.uri = uri
    this._onDidChangeContent = new Emitter()
    this.onDidChangeContent = this._onDidChangeContent.event
    this._setValue(normalizeEOL(value))
  }

  // ── 结构维护 ──

  private _rebuildBlockStarts(): void {
    const starts: number[] = []
    let acc = 1
    for (const b of this._blocks) {
      starts.push(acc)
      acc += b.lines.length
    }
    this._blockStartLines = starts
  }

  /** 定位行 → 块索引（二分） */
  private _locateBlock(line: number): number {
    const starts = this._blockStartLines
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= line) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  private _setValue(text: string): void {
    const lines = text === '' ? [] : text.split('\n')
    // 空文本保留 1 行空行（编辑器语义：至少一行）
    const body = lines.length === 0 ? [''] : lines
    this._blocks = [this._makeBlock(body)]
    this._lineCount = body.length
    this._rebuildBlockStarts()
    this._versionId = 0
  }

  private _makeBlock(lines: string[]): Block {
    return { lines, hashes: lines.map(() => null) }
  }

  /** 分裂超限块 */
  private _maybeSplit(blockIdx: number): void {
    const b = this._blocks[blockIdx]
    if (b.lines.length <= MAX_BLOCK_LINES) return
    const half = b.lines.length >> 1
    this._blocks.splice(blockIdx + 1, 0, this._makeBlock(b.lines.slice(half)))
    b.lines.length = half
    b.hashes.length = half
  }

  /** 合并过小块（与前后相邻块合并到下限附近） */
  private _maybeMerge(blockIdx: number): void {
    const b = this._blocks[blockIdx]
    if (b.lines.length >= MIN_BLOCK_LINES) return
    // 优先与前一合并
    if (blockIdx > 0 && this._blocks[blockIdx - 1].lines.length + b.lines.length <= MAX_BLOCK_LINES) {
      const prev = this._blocks[blockIdx - 1]
      prev.lines.push(...b.lines)
      prev.hashes.push(...b.hashes)
      this._blocks.splice(blockIdx, 1)
    } else if (blockIdx + 1 < this._blocks.length && b.lines.length + this._blocks[blockIdx + 1].lines.length <= MAX_BLOCK_LINES) {
      const next = this._blocks[blockIdx + 1]
      b.lines.push(...next.lines)
      b.hashes.push(...next.hashes)
      this._blocks.splice(blockIdx + 1, 1)
    }
  }

  /** 在块结构上执行「单区间替换」（locate 已算好） */
  private _applySingleEdit(startBlock: number, startLineInBlock: number, startCol: number, endBlock: number, endLineInBlock: number, endCol: number, newText: string): void {
    // 归一化新文本 → 新行
    const newLines = newText === '' ? [] : newText.split('\n')

    // 整行删除判定（Monaco 语义：C1==1 删行首前缀整行；C2==行尾删该行后缀整行）
    const startIsLineStart = startCol === 1
    const endIsLineEnd = endCol === this._blocks[endBlock].lines[endLineInBlock].length + 1
    const startPrefix = startIsLineStart ? '' : this._blocks[startBlock].lines[startLineInBlock].slice(0, startCol - 1)
    const endSuffix = endIsLineEnd ? '' : this._blocks[endBlock].lines[endLineInBlock].slice(endCol - 1)

    if (startBlock === endBlock) {
      const b = this._blocks[startBlock]
      if (newLines.length === 0) {
        if (startIsLineStart && endIsLineEnd) {
          // 整行区间删除：直接删行，不留空行
          b.lines.splice(startLineInBlock, endLineInBlock - startLineInBlock + 1)
          b.hashes.splice(startLineInBlock, endLineInBlock - startLineInBlock + 1)
        } else {
          // 部分行删除：前缀 + 后缀拼接
          const merged = startPrefix + endSuffix
          b.lines.splice(startLineInBlock, endLineInBlock - startLineInBlock + 1, merged)
          b.hashes.splice(startLineInBlock, endLineInBlock - startLineInBlock + 1, null)
        }
        if (b.lines.length === 0) {
          // 文件唯一行被删 → 保持至少 1 空行（编辑器语义）
          b.lines.push('')
          b.hashes.push(null)
        }
      } else {
        const middle = newLines.length === 1
          ? [startPrefix + newLines[0] + endSuffix]
          : [startPrefix + newLines[0], ...newLines.slice(1, -1), newLines[newLines.length - 1] + endSuffix]
        b.lines.splice(startLineInBlock, endLineInBlock - startLineInBlock + 1, ...middle)
        b.hashes.splice(startLineInBlock, endLineInBlock - startLineInBlock + 1, ...middle.map(() => null))
      }
      this._maybeSplit(startBlock)
      return
    }

    // 跨块：start 块截断 + 中间块移除 + end 块截断
    const startB = this._blocks[startBlock]
    const endB = this._blocks[endBlock]

    let headLines: string[]
    if (newLines.length === 0) {
      headLines = [startPrefix + endSuffix]
    } else if (newLines.length === 1) {
      headLines = [startPrefix + newLines[0] + endSuffix]
    } else {
      headLines = [startPrefix + newLines[0], ...newLines.slice(1, -1), newLines[newLines.length - 1] + endSuffix]
    }

    // start 块：保留 [0, startLineInBlock)（该行前缀进 headLines）
    startB.lines.length = startLineInBlock
    startB.hashes.length = startLineInBlock
    startB.lines.push(...headLines)
    startB.hashes.push(...headLines.map(() => null))

    // 移除 startBlock+1 .. endBlock-1 的整块
    this._blocks.splice(startBlock + 1, endBlock - startBlock - 1)

    // end 块：保留 [endLineInBlock+1, end)（该行后缀进 headLines）
    const endRemaining = endB.lines.slice(endLineInBlock + 1)
    const endHashes = endB.hashes.slice(endLineInBlock + 1)
    if (endRemaining.length > 0) {
      endB.lines = endRemaining
      endB.hashes = endHashes
      this._blocks.splice(startBlock + 1, 0, endB)
    }
    this._maybeSplit(startBlock)
  }

  // ── 公共 API ──

  /** 行数（≥1：空文本也是 1 行空行） */
  getLineCount(): number {
    return this._lineCount
  }

  /** 当前版本号（每次 applyEdits +1） */
  getVersionId(): number {
    return this._versionId
  }

  /** 行内容（1-based；越界返回 ''） */
  getLineContent(line: number): string {
    if (line < 1 || line > this._lineCount) return ''
    const bi = this._locateBlock(line)
    return this._blocks[bi].lines[line - this._blockStartLines[bi]]
  }

  /** 行 hash（1-based；按需计算 + 块内缓存） */
  getLineHash(line: number): number {
    if (line < 1 || line > this._lineCount) return 0
    const bi = this._locateBlock(line)
    const li = line - this._blockStartLines[bi]
    const b = this._blocks[bi]
    let h = b.hashes[li]
    if (h === null) {
      h = hashLine(b.lines[li])
      b.hashes[li] = h
    }
    return h
  }

  /** 全量文本（区间读全量：O(n)） */
  getValue(): string {
    return this.getValueInRange({ start: { line: 1, column: 1 }, end: { line: this._lineCount, column: this.getLineMaxColumn(this._lineCount) } })
  }

  /** 行最大列（行长度 + 1） */
  getLineMaxColumn(line: number): number {
    return this.getLineContent(line).length + 1
  }

  /** 区间读（1-based 闭区间） */
  getValueInRange(range: Range): string {
    const { start, end } = range
    if (comparePositions(start, end) > 0) return ''
    const startLine = Math.max(1, start.line)
    const endLine = Math.min(this._lineCount, end.line)
    if (startLine > endLine) return ''

    const parts: string[] = []
    const startContent = this.getLineContent(startLine)
    const endContent = this.getLineContent(endLine)
    if (startLine === endLine) {
      return startContent.slice(start.column - 1, end.column - 1)
    }
    parts.push(startContent.slice(start.column - 1))
    for (let l = startLine + 1; l < endLine; l++) {
      parts.push(this.getLineContent(l))
    }
    parts.push(endContent.slice(0, end.column - 1))
    return parts.join('\n')
  }

  /**
   * 应用批量编辑（FR2.1）。
   * 约束：edits 单调递增（按 start 位置升序）、互不重叠；空 range = 插入；空 text = 删除。
   * 效果：行结构局部更新、受影响行 hash 失效、versionId+1、fire onDidChangeContent。
   */
  applyEdits(edits: TextEdit[]): void {
    if (edits.length === 0) return
    const changes: ModelContentChange[] = []

    // Monaco 语义：edits 的 range 全部基于旧文本坐标 → 必须从后往前应用
    // （靠前的 edit 坐标不受靠后 edit 的影响），changes 按原序输出。
    for (let ei = edits.length - 1; ei >= 0; ei--) {
      const edit = edits[ei]
      const { range, text } = edit
      // 规范化：range 超出边界钳制
      const startLine = Math.min(Math.max(1, range.start.line), this._lineCount)
      const endLine = Math.min(Math.max(1, range.end.line), this._lineCount)
      const startCol = Math.min(Math.max(1, range.start.column), this.getLineMaxColumn(startLine))
      const endCol = Math.min(Math.max(1, range.end.column), this.getLineMaxColumn(endLine))
      const normRange: Range = { start: { line: startLine, column: startCol }, end: { line: endLine, column: endCol } }
      const oldText = this.getValueInRange(normRange)
      const rangeOffset = this._offsetAt(normRange.start)

      const sb = this._locateBlock(startLine)
      const eb = this._locateBlock(endLine)
      const sli = startLine - this._blockStartLines[sb]
      const eli = endLine - this._blockStartLines[eb]
      this._applySingleEdit(sb, sli, startCol, eb, eli, endCol, text)

      changes.push({ range: normRange, rangeOffset, rangeLength: oldText.length, text })
    }

    // 结构变更后重算块起始行 + 行数（O(块数)）
    this._lineCount = this._blocks.reduce((acc, b) => acc + b.lines.length, 0)
    this._rebuildBlockStarts()
    // 合并过小块（从后往前避免索引漂移）
    for (let i = this._blocks.length - 1; i >= 0; i--) {
      this._maybeMerge(i)
    }
    // 合并后行数/起始行不变（合并不改总行数），无需重算

    this._versionId++
    // changes 按原序输出（逆序执行后反转）
    changes.reverse()
    this._onDidChangeContent.fire({ versionId: this._versionId, changes })
  }

  /** Position → 绝对偏移（1-based；O(行) 近似——按行累加，块级优化：跨块累加块行数） */
  private _offsetAt(pos: Position): number {
    let offset = 0
    const bi = this._locateBlock(pos.line)
    const startLine = this._blockStartLines[bi]
    // 块前全部行（含换行符）
    for (let i = 0; i < bi; i++) {
      for (const line of this._blocks[i].lines) offset += line.length + 1
    }
    // 块内到目标行
    for (let l = startLine; l < pos.line; l++) {
      offset += this.getLineContent(l).length + 1
    }
    return offset + (pos.column - 1)
  }

  dispose(): void {
    this._onDidChangeContent.dispose()
  }
}

// ── uri 注册表（Monaco 式雏形，FR2.6）──

const modelRegistry = new Map<string, TextModel>()

/** 创建 model 并注册（同名 uri 复用已有实例） */
export function createModel(value: string, language?: string, uri?: string): TextModel {
  const key = uri ?? `model:${modelRegistry.size}`
  const existing = modelRegistry.get(key)
  if (existing) return existing
  const model = new TextModel(value, key, language)
  modelRegistry.set(key, model)
  return model
}

/** 按 uri 取 model */
export function getModel(uri: string): TextModel | null {
  return modelRegistry.get(uri) ?? null
}

/** 注销 model */
export function disposeModel(uri: string): void {
  const model = modelRegistry.get(uri)
  if (model) {
    model.dispose()
    modelRegistry.delete(uri)
  }
}
