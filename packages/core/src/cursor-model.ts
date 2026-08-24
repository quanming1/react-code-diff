/**
 * @cd/core 光标/选区模型（FR2.4）。
 *
 * CursorsController：多光标（主 + 次要），基于 TextModel 行结构做移动/选择/钳制。
 * - 位置一律钳制到 [1, 行数] × [1, 行末+1]
 * - 移动命令：moveUp/Down/Left/Right、行首/行尾/文件首/文件尾、PageUp/PageDown（可带 shift 扩展选区）
 * - 选区：anchor（锚点）+ active（活动端），支持反向选区（active 在 anchor 之前）
 */

import type { TextModel } from './text-model'
import { createSelection, getSelectionRange, type Position, type Selection } from './types'

export class CursorsController {
  private _selections: Selection[] = []

  constructor(private readonly _model: TextModel) {
    // 初始：文件开头单光标
    this._selections = [createSelection({ line: 1, column: 1 }, { line: 1, column: 1 })]
  }

  getSelections(): Selection[] {
    return this._selections
  }

  getPrimarySelection(): Selection {
    return this._selections[this._selections.length - 1]
  }

  setSelections(selections: Selection[]): void {
    this._selections = selections.length > 0 ? selections : [createSelection({ line: 1, column: 1 }, { line: 1, column: 1 })]
    // 全部钳制
    this._selections = this._selections.map((s) => this._clampSelection(s))
  }

  // ── 钳制 ──

  private _clampPosition(pos: Position): Position {
    const line = Math.min(Math.max(1, pos.line), this._model.getLineCount())
    const maxCol = this._model.getLineMaxColumn(line)
    return { line, column: Math.min(Math.max(1, pos.column), maxCol) }
  }

  private _clampSelection(sel: Selection): Selection {
    return { anchor: this._clampPosition(sel.anchor), active: this._clampPosition(sel.active) }
  }

  // ── 基础移动（保持/清除选区）──

  /** 把主光标移到指定位置（keepSelection=false 时折叠选区） */
  moveTo(line: number, column: number, keepSelection = false): void {
    const target = this._clampPosition({ line, column })
    const primary = this.getPrimarySelection()
    const next: Selection = keepSelection
      ? createSelection(primary.anchor, target)
      : createSelection(target, target)
    this._selections[this._selections.length - 1] = next
  }

  private _movePrimary(transform: (p: Position) => Position, keepSelection: boolean): void {
    const primary = this.getPrimarySelection()
    const active = this._clampPosition(transform(primary.active))
    this._selections[this._selections.length - 1] = keepSelection
      ? createSelection(primary.anchor, active)
      : createSelection(active, active)
  }

  moveLeft(keepSelection = false): void {
    this._movePrimary((p) => {
      if (p.column > 1) return { line: p.line, column: p.column - 1 }
      if (p.line > 1) {
        const prevLine = p.line - 1
        return { line: prevLine, column: this._model.getLineMaxColumn(prevLine) }
      }
      return p
    }, keepSelection)
  }

  moveRight(keepSelection = false): void {
    this._movePrimary((p) => {
      const maxCol = this._model.getLineMaxColumn(p.line)
      if (p.column < maxCol) return { line: p.line, column: p.column + 1 }
      if (p.line < this._model.getLineCount()) return { line: p.line + 1, column: 1 }
      return p
    }, keepSelection)
  }

  moveUp(keepSelection = false): void {
    this._movePrimary((p) => (p.line > 1 ? { line: p.line - 1, column: p.column } : p), keepSelection)
  }

  moveDown(keepSelection = false): void {
    this._movePrimary((p) => (p.line < this._model.getLineCount() ? { line: p.line + 1, column: p.column } : p), keepSelection)
  }

  moveToLineStart(keepSelection = false): void {
    this._movePrimary((p) => ({ line: p.line, column: 1 }), keepSelection)
  }

  moveToLineEnd(keepSelection = false): void {
    this._movePrimary((p) => ({ line: p.line, column: this._model.getLineMaxColumn(p.line) }), keepSelection)
  }

  moveToFileStart(keepSelection = false): void {
    this._movePrimary(() => ({ line: 1, column: 1 }), keepSelection)
  }

  moveToFileEnd(keepSelection = false): void {
    this._movePrimary(() => ({ line: this._model.getLineCount(), column: this._model.getLineMaxColumn(this._model.getLineCount()) }), keepSelection)
  }

  /** PageUp/PageDown：按行数翻页（近似视口行数，编辑器语义） */
  movePageUp(linesPerPage: number, keepSelection = false): void {
    this._movePrimary((p) => ({ line: Math.max(1, p.line - linesPerPage), column: p.column }), keepSelection)
  }

  movePageDown(linesPerPage: number, keepSelection = false): void {
    this._movePrimary((p) => ({ line: Math.min(this._model.getLineCount(), p.line + linesPerPage), column: p.column }), keepSelection)
  }

  /** 上下移动时保持目标列（列记忆，Monaco 语义：同一行号内尽量保持列） */
  moveUpPreserveColumn(keepSelection = false): void {
    this._movePrimary((p) => (p.line > 1 ? { line: p.line - 1, column: p.column } : p), keepSelection)
  }

  // ── 查询 ──

  /** 规范选区（anchor ≤ active） */
  getSelectionRange(): ReturnType<typeof getSelectionRange> {
    return getSelectionRange(this.getPrimarySelection())
  }

  /** 是否为反向选区 */
  isReversed(): boolean {
    return this.getPrimarySelection().active.line < this.getPrimarySelection().anchor.line ||
      (this.getPrimarySelection().active.line === this.getPrimarySelection().anchor.line &&
        this.getPrimarySelection().active.column < this.getPrimarySelection().anchor.column)
  }

  /** 光标是否在给定位置（任一光标） */
  hasCursorAt(pos: Position): boolean {
    return this._selections.some((s) => s.active.line === pos.line && s.active.column === pos.column)
  }
}
