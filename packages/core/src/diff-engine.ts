/**
 * @cd/core 自研 diff 引擎（FR2.2）。
 *
 * 算法：行 hash 预处理（FNV-1a）+ common prefix/suffix trim + Myers O(ND) 核心。
 * 输出：LineRangeMapping[]（旧区间 ↔ 新区间，1-based），展示层据此生成 DiffRow。
 *
 * 编辑模式预留：computeModelDiff(oldModel, newModel) 基于 TextModel 实例，
 * 监听 newModel 变更防抖重算（防抖调度由上层 D5/D7 接线）。
 */

import type { TextModel } from './text-model'
import { hashLine } from './text-model'

/** 行区间（1-based；空区间 start === end，表示插入点） */
export interface LineRange {
  startLineNumber: number
  endLineNumberExclusive: number
}

export function isEmptyLineRange(r: LineRange): boolean {
  return r.startLineNumber >= r.endLineNumberExclusive
}

/** 旧区间 ↔ 新区间映射 */
export interface LineRangeMapping {
  /** 旧文件区间（空 = 纯新增） */
  oldRange: LineRange
  /** 新文件区间（空 = 纯删除） */
  newRange: LineRange
}

export interface DiffStats {
  additions: number
  deletions: number
}

export interface DiffResult {
  mappings: LineRangeMapping[]
  stats: DiffStats
  /** 归一化后的旧/新行（供展示层展开） */
  oldLines: string[]
  newLines: string[]
  oldNoNewline: boolean
  newNoNewline: boolean
}

type Op = 'eq' | 'ins' | 'del'

/** Myers O(ND) 最短编辑脚本（输入为行 hash 数组） */
export function myersDiff(a: number[], b: number[]): Op[] {
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max
  const v = new Int32Array(2 * max + 1)
  const trace: Int32Array[] = []
  v[offset + 1] = 0

  for (let d = 0; d <= max; d++) {
    trace[d] = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        // 从 k+1 向下（插入优先，保证输出稳定）
        x = v[offset + k + 1]
      } else {
        // 从 k-1 向右（删除）
        x = v[offset + k - 1] + 1
      }
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        if (d === 0) {
          // 完全相等：无编辑，返回全 eq
          return new Array(n).fill('eq')
        }
        return backtrack(trace, a.length, b.length, d, offset)
      }
    }
  }
  // 不可达（d 最大到 n+m 必完成）
  return []
}

function backtrack(trace: Int32Array[], n: number, m: number, dMax: number, offset: number): Op[] {
  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = dMax; d >= 1; d--) {
    // trace[d] 保存的是「d 层开始前」的 v = d-1 层结果，用于定位 d 层前驱
    const V = trace[d]
    const k = x - y
    let prevK: number
    if (k === -d || (k !== d && V[offset + k - 1] < V[offset + k + 1])) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = V[offset + prevK]
    const prevY = prevX - prevK
    // snake（相等）回溯
    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push('eq')
    }
    // 恰一步差异
    if (x === prevX) {
      y--
      ops.push('ins')
    } else {
      x--
      ops.push('del')
    }
  }
  // d=0 层：纯 snake 从 (0,0) 到起点（头部相等行）
  while (x > 0 && y > 0) {
    x--
    y--
    ops.push('eq')
  }
  return ops.reverse()
}

/**
 * 计算两个文本的 diff。
 * 流程：normalize EOL → split 行 → 行 hash → prefix/suffix trim → Myers 核心 → 组装 mappings。
 */
export function computeDiff(oldText: string, newText: string): DiffResult {
  const oldNorm = normalizeLines(oldText)
  const newNorm = normalizeLines(newText)
  const oldLines = oldNorm.lines
  const newLines = newNorm.lines

  const oldHashes = oldLines.map(hashLine)
  const newHashes = newLines.map(hashLine)
  // no-newline-at-EOF 语义（对齐 jsdiff）：无尾换行的末行 hash 加标记，
  // 使其与「同内容但带尾换行」的行不匹配（旧实现行为，diff 语义不能变）
  if (oldNorm.noTrailingNewline && oldLines.length > 0) {
    oldHashes[oldLines.length - 1] = hashLine(oldLines[oldLines.length - 1] + '\u0000')
  }
  if (newNorm.noTrailingNewline && newLines.length > 0) {
    newHashes[newLines.length - 1] = hashLine(newLines[newLines.length - 1] + '\u0000')
  }

  // common prefix trim（对齐 jsdiff 的 seed extractCommon 行为；
  // 注意：不做 suffix trim——jsdiff 把后缀匹配交给 Myers 自己决定，
  // 贪心 trim 后缀会改变重复行场景下的匹配偏好（TC-D2-03 dup-lines 验证））
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldHashes[start] === newHashes[start]) start++

  const ops: Op[] = []
  if (start < oldLines.length || start < newLines.length) {
    const core = myersDiff(oldHashes.slice(start), newHashes.slice(start))
    // 前缀相等 + 核心（后缀由 Myers 自然处理为 eq）
    for (let i = 0; i < start; i++) ops.push('eq')
    ops.push(...core)
  } else {
    // 完全相等
    for (let i = 0; i < oldLines.length; i++) ops.push('eq')
  }

  // ops → mappings
  const mappings: LineRangeMapping[] = []
  let oldLine = 1
  let newLine = 1
  let i = 0
  const n = ops.length
  while (i < n) {
    if (ops[i] === 'eq') {
      oldLine++
      newLine++
      i++
      continue
    }
    // 变化块：连续的 del/ins
    const oldStart = oldLine
    const newStart = newLine
    while (i < n && ops[i] !== 'eq') {
      if (ops[i] === 'del') oldLine++
      else newLine++
      i++
    }
    mappings.push({
      oldRange: { startLineNumber: oldStart, endLineNumberExclusive: oldLine },
      newRange: { startLineNumber: newStart, endLineNumberExclusive: newLine },
    })
  }

  return {
    mappings,
    stats: {
      additions: countOp(ops, 'ins'),
      deletions: countOp(ops, 'del'),
    },
    oldLines,
    newLines,
    oldNoNewline: oldNorm.noTrailingNewline,
    newNoNewline: newNorm.noTrailingNewline,
  }
}

function countOp(ops: Op[], target: Op): number {
  let n = 0
  for (const op of ops) if (op === target) n++
  return n
}

/**
 * 基于 TextModel 的 diff（编辑模式预留，FR2.2）。
 * 调用方负责防抖调度；这里每次调用全量重算。
 */
export function computeModelDiff(oldModel: TextModel, newModel: TextModel): DiffResult {
  const oldLines: string[] = []
  for (let l = 1; l <= oldModel.getLineCount(); l++) oldLines.push(oldModel.getLineContent(l))
  const newLines: string[] = []
  for (let l = 1; l <= newModel.getLineCount(); l++) newLines.push(newModel.getLineContent(l))
  return computeDiff(oldLines.join('\n'), newLines.join('\n'))
}

// ── 展示层辅助 ──

/** 展示行（与旧引擎 DiffRow 兼容的骨架：type + 双侧行号/内容） */
export interface DiffRowLike {
  type: 'context' | 'removed' | 'added'
  left: { lineNumber: number; content: string } | null
  right: { lineNumber: number; content: string } | null
}

/**
 * mappings → 展示行序列（unified 语义）：
 * - mapping 之间为 context 行（双侧行号相同）
 * - changed mapping：先 removed 行（left），再 added 行（right）
 * - 纯 added / 纯 removed 同理
 */
export function mappingsToRows(diff: DiffResult): DiffRowLike[] {
  const { mappings, oldLines, newLines } = diff
  const rows: DiffRowLike[] = []
  let oldLine = 1
  let newLine = 1

  for (const m of mappings) {
    // context：mapping 前的间隙
    while (oldLine < m.oldRange.startLineNumber) {
      rows.push({
        type: 'context',
        left: { lineNumber: oldLine, content: oldLines[oldLine - 1] },
        right: { lineNumber: newLine, content: newLines[newLine - 1] },
      })
      oldLine++
      newLine++
    }
    // removed（旧区间）
    for (let l = m.oldRange.startLineNumber; l < m.oldRange.endLineNumberExclusive; l++) {
      rows.push({ type: 'removed', left: { lineNumber: l, content: oldLines[l - 1] }, right: null })
      oldLine++
    }
    // added（新区间）
    for (let l = m.newRange.startLineNumber; l < m.newRange.endLineNumberExclusive; l++) {
      rows.push({ type: 'added', left: null, right: { lineNumber: l, content: newLines[l - 1] } })
      newLine++
    }
  }
  // 尾部 context
  while (oldLine <= oldLines.length) {
    rows.push({
      type: 'context',
      left: { lineNumber: oldLine, content: oldLines[oldLine - 1] },
      right: { lineNumber: newLine, content: newLines[newLine - 1] },
    })
    oldLine++
    newLine++
  }
  return rows
}

// ── 内部工具 ──

function normalizeLines(text: string): { lines: string[]; noTrailingNewline: boolean } {
  if (text === '') return { lines: [], noTrailingNewline: true }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const noTrailingNewline = !normalized.endsWith('\n')
  const lines = normalized.split('\n')
  if (!noTrailingNewline && lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return { lines, noTrailingNewline }
}
