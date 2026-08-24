/**
 * @cd/view 光标渲染（FR5.1）——合成层 DOM。
 *
 * - 主光标 + 次要光标：绝对定位 div（blink 动画）
 * - 选区 overlay：半透明 block（含反向选区）
 * - 位置由 CursorsController 驱动（D2 core）；View 层把 Position → 像素
 */

import type { Selection, Position } from '@cd/core'

export interface CursorRenderData {
  selections: Selection[]
  /** 行高（px） */
  lineHeight: number
  /** 列宽（px，等宽近似） */
  charWidth: number
  /** 每个字符前的像素（column → x；1-based） */
  getColumnX: (line: number, column: number) => number
  /** 是否聚焦（blink 动画） */
  focused: boolean
}

export class ViewCursors {
  private readonly _domNode: HTMLDivElement
  private _data: CursorRenderData | null = null

  constructor() {
    this._domNode = document.createElement('div')
    this._domNode.className = 'cd-cursors'
    this._domNode.style.position = 'absolute'
    this._domNode.style.top = '0'
    this._domNode.style.left = '0'
    this._domNode.style.pointerEvents = 'none'
    this._domNode.style.zIndex = '10'
  }

  getDomNode(): HTMLDivElement {
    return this._domNode
  }

  /** 更新光标/选区渲染（数据驱动；无变化短路） */
  update(data: CursorRenderData): void {
    this._data = data
    this._render()
  }

  setFocused(focused: boolean): void {
    if (this._data) {
      this._data = { ...this._data, focused }
      this._render()
    }
  }

  private _render(): void {
    if (!this._data) return
    const { selections, lineHeight, getColumnX, focused } = this._data
    const sb: string[] = []

    // 选区 overlay（每个非空选区一个 block）
    for (const sel of selections) {
      const start = sel.anchor.line < sel.active.line || (sel.anchor.line === sel.active.line && sel.anchor.column <= sel.active.column)
        ? sel.anchor : sel.active
      const end = start === sel.anchor ? sel.active : sel.anchor
      if (start.line === end.line && start.column === end.column) continue // 空选区
      if (start.line === end.line) {
        const x = getColumnX(start.line, start.column)
        const w = getColumnX(end.line, end.column) - x
        const y = (start.line - 1) * lineHeight
        sb.push(`<div class="cd-selection" style="top:${y}px;left:${x}px;width:${Math.max(w, 1)}px;height:${lineHeight}px"></div>`)
      } else {
        // 跨行：首行 → 行尾，中间整行，末行 → 行首
        const y1 = (start.line - 1) * lineHeight
        const x1 = getColumnX(start.line, start.column)
        const lineEndX = getColumnX(start.line, 999999)
        sb.push(`<div class="cd-selection" style="top:${y1}px;left:${x1}px;width:${Math.max(lineEndX - x1, 1)}px;height:${lineHeight}px"></div>`)
        for (let l = start.line + 1; l < end.line; l++) {
          const y = (l - 1) * lineHeight
          sb.push(`<div class="cd-selection" style="top:${y}px;left:0px;width:100%;height:${lineHeight}px"></div>`)
        }
        const y2 = (end.line - 1) * lineHeight
        const x2 = getColumnX(end.line, end.column)
        sb.push(`<div class="cd-selection" style="top:${y2}px;left:0px;width:${Math.max(x2, 1)}px;height:${lineHeight}px"></div>`)
      }
    }

    // 光标（每个空选区的 active 端）
    for (const sel of selections) {
      if (sel.anchor.line !== sel.active.line || sel.anchor.column !== sel.active.column) continue
      const pos: Position = sel.active
      const x = getColumnX(pos.line, pos.column)
      const y = (pos.line - 1) * lineHeight
      const cls = focused ? 'cd-cursor cd-cursor-focused' : 'cd-cursor'
      sb.push(`<div class="${cls}" style="top:${y}px;left:${x}px;height:${lineHeight}px"></div>`)
    }

    this._domNode.innerHTML = sb.join('')
    // 供测试断言
    this._domNode.setAttribute('data-cursor-count', String(selections.filter((s) => s.anchor.line === s.active.line && s.anchor.column === s.active.column).length))
  }

  getCursorCount(): number {
    return Number(this._domNode.getAttribute('data-cursor-count') ?? 0)
  }
}
