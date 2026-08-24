/**
 * @cd/view ViewLine（FR4.1/4.2）——一行一个持久 DOM 节点。
 *
 * - 脏标记 _isMaybeInvalid：数据变化 → 标记脏 → rAF 渲染循环只重渲脏行
 * - input.equals() 短路：渲染输入（内容/token/装饰签名）相同 → 不动 DOM
 * - renderHtml()：StringBuilder 拼 HTML → innerHTML（renderer.ts 提供 StringBuilder）
 */

import type { FlatToken } from '@cd/tokenizer'

/** 行渲染输入（equals 比较用；变化才重渲） */
export interface ViewLineInput {
  content: string
  tokens: FlatToken[]
  lineNumber: number
  /** 装饰签名（reveal/搜索/断点/诊断等 class 变化时重渲） */
  decorationClass: string
}

export class ViewLine {
  static readonly CLASS_NAME = 'view-line'

  private _domNode: HTMLDivElement
  private _input: ViewLineInput | null = null
  private _isMaybeInvalid = true

  constructor() {
    this._domNode = document.createElement('div')
    this._domNode.className = ViewLine.CLASS_NAME
    this._domNode.style.height = '20px'
    this._domNode.style.lineHeight = '20px'
    this._domNode.style.whiteSpace = 'pre'
  }

  getDomNode(): HTMLDivElement {
    return this._domNode
  }

  markDirty(): void {
    this._isMaybeInvalid = true
  }

  isDirty(): boolean {
    return this._isMaybeInvalid
  }

  /** 用给定输入渲染；输入与上次相同 → 短路不动 DOM（返回 false） */
  render(input: ViewLineInput): boolean {
    if (!this._isMaybeInvalid && this._input && inputsEqual(this._input, input)) {
      return false
    }
    this._isMaybeInvalid = false
    this._input = input
    this._domNode.innerHTML = renderLineHtml(input)
    this._domNode.className = ViewLine.CLASS_NAME + (input.decorationClass ? ' ' + input.decorationClass : '')
    return true
  }

  /** 仅更新装饰（不动内容/token）——轻量路径 */
  updateDecorations(decorationClass: string): boolean {
    if (!this._input || this._input.decorationClass === decorationClass) return false
    this._input = { ...this._input, decorationClass }
    this._domNode.className = ViewLine.CLASS_NAME + (decorationClass ? ' ' + decorationClass : '')
    return true
  }
}

function inputsEqual(a: ViewLineInput, b: ViewLineInput): boolean {
  if (a.content !== b.content || a.lineNumber !== b.lineNumber || a.decorationClass !== b.decorationClass) return false
  if (a.tokens.length !== b.tokens.length) return false
  for (let i = 0; i < a.tokens.length; i++) {
    if (a.tokens[i].text !== b.tokens[i].text || a.tokens[i].className !== b.tokens[i].className) return false
  }
  return true
}

/** 行 HTML：token span（含 class） */
export function renderLineHtml(input: ViewLineInput): string {
  const { tokens } = input
  if (tokens.length === 0) {
    return '<span class="cd-code-text">&nbsp;</span>'
  }
  const sb: string[] = []
  for (const t of tokens) {
    if (t.text === '') continue
    if (t.className) {
      sb.push(`<span class="cd-code-text ${t.className}">`)
      sb.push(escapeHtml(t.text))
      sb.push('</span>')
    } else {
      sb.push(`<span class="cd-code-text">`)
      sb.push(escapeHtml(t.text))
      sb.push('</span>')
    }
  }
  return sb.join('')
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
