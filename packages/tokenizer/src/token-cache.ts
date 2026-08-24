/**
 * @cd/tokenizer 行级 token 缓存（FR3.3）——编辑增量失效。
 *
 * 结构：
 * - 每行缓存：{ hash, tokens, stateStack（进入该行时的状态）, inProgress }
 * - 行失效：内容 hash 变了 → 该行重 tokenize；并向前找最近「无跨行依赖」的快照行重放
 * - 重放策略（Monaco 同款）：编辑行 E 失效 → 从 E 往前找最近一行的 stateStack
 *   （该行的进入状态即其后各行的依赖），从那一行重新 tokenize 到失效行。
 * - 计数器：供测试断言「命中缓存零重算」。
 */

import { tokenizeLine, mergeTokens, type FlatToken, type LanguageDef } from './lexer-engine'

interface LineCacheEntry {
  /** 行内容 hash（来自 core hashLine） */
  hash: number
  /** 进入该行时的状态栈快照 */
  stateStack: string[]
  /** 该行结束时的状态栈 */
  endStateStack: string[]
  /** token 结果（已 merge） */
  tokens: FlatToken[]
  inProgress: boolean
}

export class TokenCache {
  private _lines: (LineCacheEntry | null)[] = []
  private _lang: LanguageDef | null = null
  /** 重算计数器（测试断言用） */
  recomputeCount = 0

  /** 绑定语言（切换语言 → 全清） */
  setLanguage(lang: LanguageDef | null): void {
    if (this._lang === lang) return
    this._lang = lang
    this.clear()
  }

  clear(): void {
    this._lines = []
    this.recomputeCount = 0
  }

  /** 行数变化（模型插入/删除行后同步） */
  setLineCount(count: number): void {
    if (this._lines.length === count) return
    if (this._lines.length < count) {
      // 增长：清空新增区（新行未 tokenize）
      const prev = this._lines.length
      this._lines.length = count
      for (let i = prev; i < count; i++) this._lines[i] = null
    } else {
      // 缩短：直接截断
      this._lines.length = count
    }
  }

  /** 行 hash 失效（编辑后由调用方标记；重放时按需重算） */
  invalidateLine(line: number): void {
    const i = line - 1
    if (i < 0 || i >= this._lines.length) return
    this._lines[i] = null
  }

  /** 编辑后的失效：从编辑行开始，标记受影响行（含跨行状态链） */
  invalidateRange(startLine: number, endLine: number): void {
    for (let l = startLine; l <= endLine; l++) this.invalidateLine(l)
  }

  /**
   * 取行 token；未缓存则重算。
   * 重算时从「最近有效快照行」开始重放（保证跨行状态正确）。
   */
  getLineTokens(line: number, model: { getLineContent: (l: number) => string; getLineHash: (l: number) => number }, lang: LanguageDef): FlatToken[] {
    const i = line - 1
    if (i < 0 || i >= this._lines.length) return []
    const cached = this._lines[i]
    const hash = model.getLineHash(line)
    if (cached && cached.hash === hash) return cached.tokens

    // 未命中：找最近有效快照行（进入状态已知的行）
    let replayFrom = i
    while (replayFrom > 0 && !this._lines[replayFrom]) replayFrom--
    // replayFrom 的有效条目提供进入状态；若没有，从第 1 行开始
    const startEntry = this._lines[replayFrom]
    let stateStack = startEntry ? startEntry.endStateStack.slice() : [lang.start]
    if (!startEntry && replayFrom === 0 && i > 0) {
      // 第 1 行本身无效 → 从头
      stateStack = [lang.start]
      replayFrom = -1
    }

    // 从 replayFrom+1 重放到 line
    for (let l = replayFrom + 1; l <= i; l++) {
      const content = model.getLineContent(l + 1)
      const res = tokenizeLine(content, stateStack, lang)
      const entry: LineCacheEntry = {
        hash: model.getLineHash(l + 1),
        stateStack: stateStack.slice(),
        endStateStack: res.stateStack,
        tokens: mergeTokens(res.tokens),
        inProgress: res.inProgress,
      }
      stateStack = res.stateStack
      this._lines[l] = entry
      this.recomputeCount++
    }
    return this._lines[i]?.tokens ?? []
  }

  /** 全量预计算（大文件懒加载：先纯文本，再逐行补） */
  prefetchAll(model: { getLineContent: (l: number) => string; getLineHash: (l: number) => number }, lang: LanguageDef): void {
    let stateStack: string[] = [lang.start]
    const n = this._lines.length
    for (let i = 0; i < n; i++) {
      const content = model.getLineContent(i + 1)
      const res = tokenizeLine(content, stateStack, lang)
      this._lines[i] = {
        hash: model.getLineHash(i + 1),
        stateStack: stateStack.slice(),
        endStateStack: res.stateStack,
        tokens: mergeTokens(res.tokens),
        inProgress: res.inProgress,
      }
      stateStack = res.stateStack
      this.recomputeCount++
    }
  }
}
