/**
 * @cd/view VisibleLinesCollection（FR4.1）——Monaco 风格行池。
 *
 * - 维护 [rendLineNumberStart, lines[]]（rendLineNumberStart 为 1-based 首个渲染行号）
 * - 滚动/行集合变化：首尾局部 insert/delete（splice），不做全量重建
 * - 语义对齐 Monaco RenderedLinesCollection：
 *   - onLinesDeleted / onLinesInserted / onLinesChanged
 *   - 删除/插入在视口上方 → 只平移 rendLineNumberStart
 *   - 删除/插入在视口内 → splice 局部行，返回被移除的行（调用方负责 DOM 移除）
 */

import { ViewLine } from './view-line'

export class VisibleLinesCollection {
  private _lines: ViewLine[] = []
  private _rendLineNumberStart = 1
  private readonly _lineFactory: () => ViewLine

  constructor(lineFactory: () => ViewLine = () => new ViewLine()) {
    this._lineFactory = lineFactory
  }

  getStartLineNumber(): number {
    return this._rendLineNumberStart
  }

  getEndLineNumber(): number {
    return this._rendLineNumberStart + this._lines.length - 1
  }

  getCount(): number {
    return this._lines.length
  }

  getLine(lineNumber: number): ViewLine | null {
    const idx = lineNumber - this._rendLineNumberStart
    if (idx < 0 || idx >= this._lines.length) return null
    return this._lines[idx]
  }

  /** 全量设置（setModel 时清行池 + 重建） */
  set(rendLineNumberStart: number, lines: ViewLine[]): void {
    this._rendLineNumberStart = rendLineNumberStart
    this._lines = lines
  }

  flush(): void {
    this._lines = []
    this._rendLineNumberStart = 1
  }

  /**
   * 行删除事件。返回被移除且仍在池中的行（调用方负责从 DOM 移除）。
   * 与 Monaco 语义一致：
   * - 删除区完全在视口上方 → 平移 start，返回 null
   * - 删除区在视口下方 → 不动，返回 null
   * - 删除区与视口相交 → splice 局部，返回被删行
   */
  onLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number): ViewLine[] | null {
    if (this.getCount() === 0) return null
    const start = this.getStartLineNumber()
    const end = this.getEndLineNumber()

    if (deleteToLineNumber < start) {
      // 全在视口上方
      const cnt = deleteToLineNumber - deleteFromLineNumber + 1
      this._rendLineNumberStart -= cnt
      return null
    }
    if (deleteFromLineNumber > end) return null

    // 计算相交区
    const from = Math.max(deleteFromLineNumber, start)
    const to = Math.min(deleteToLineNumber, end)
    const delIdx = from - this._rendLineNumberStart
    const delCount = to - from + 1
    const removed = this._lines.splice(delIdx, delCount)

    // 删除区延伸到视口上方 → start 平移
    if (deleteFromLineNumber < start) {
      this._rendLineNumberStart = deleteFromLineNumber
    }
    return removed
  }

  /**
   * 行插入事件。返回被挤出视口的行（调用方负责 DOM 移除）。
   */
  onLinesInserted(insertFromLineNumber: number, insertToLineNumber: number): ViewLine[] | null {
    if (this.getCount() === 0) return null
    const insertCnt = insertToLineNumber - insertFromLineNumber + 1
    const start = this.getStartLineNumber()
    const end = this.getEndLineNumber()

    if (insertFromLineNumber <= start) {
      // 插入在视口上方 → start 平移
      this._rendLineNumberStart += insertCnt
      return null
    }
    if (insertFromLineNumber > end) return null

    // 插入在视口内：splice 新行，挤出尾部
    const newLines: ViewLine[] = []
    for (let i = 0; i < insertCnt; i++) newLines.push(this._lineFactory())
    const insertIdx = insertFromLineNumber - this._rendLineNumberStart
    const before = this._lines.slice(0, insertIdx)
    const after = this._lines.slice(insertIdx, this._lines.length - insertCnt)
    const removed = this._lines.slice(this._lines.length - insertCnt)
    this._lines = before.concat(newLines).concat(after)
    return removed
  }

  /** 行内容/数据变化 → 标记脏（不重建 DOM 节点） */
  onLinesChanged(changeFromLineNumber: number, changeCount: number): boolean {
    const start = this.getStartLineNumber()
    const end = this.getEndLineNumber()
    let notified = false
    for (let l = changeFromLineNumber; l < changeFromLineNumber + changeCount; l++) {
      if (l >= start && l <= end) {
        this.getLine(l)?.markDirty()
        notified = true
      }
    }
    return notified
  }

  /** 全部标记脏（setModel 换数据源） */
  markAllDirty(): void {
    for (const line of this._lines) line.markDirty()
  }
}
