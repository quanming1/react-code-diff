/**
 * @cd/view gutter（FR4.5）——行号槽 + glyph margin（断点/诊断图标）。
 *
 * - 行号（on/off/relative）；宽度按最大行数自适应
 * - glyph margin：断点红点、诊断错误/警告图标
 * - 当前行高亮（跟随光标，D5 接入）
 * - 与内容区同步滚动（同一 translateY）
 */

export interface GutterOptions {
  lineNumbers?: 'on' | 'off' | 'relative'
  glyphMargin?: boolean
  /** 行号槽宽度（px，按最大行数 digits 自适应） */
  gutterWidth?: number
}

export class Gutter {
  private readonly _domNode: HTMLDivElement
  private _options: Required<GutterOptions>
  private _lineCount = 0
  private _currentLine = 0
  private readonly _markers = new Map<number, string>() // line → marker class

  constructor(options: GutterOptions = {}) {
    this._options = {
      lineNumbers: options.lineNumbers ?? 'on',
      glyphMargin: options.glyphMargin ?? true,
      gutterWidth: options.gutterWidth ?? 40,
    }
    this._domNode = document.createElement('div')
    this._domNode.className = 'cd-gutter'
    this._domNode.style.position = 'absolute'
    this._domNode.style.top = '0'
    this._domNode.style.left = '0'
    this._domNode.style.userSelect = 'none'
    this._updateWidth()
  }

  getDomNode(): HTMLDivElement {
    return this._domNode
  }

  setOptions(options: GutterOptions): void {
    this._options = { ...this._options, ...options }
    this._updateWidth()
    this._render()
  }

  setLineCount(count: number): void {
    this._lineCount = count
    this._updateWidth()
    this._render()
  }

  /** 设置/清除某行 marker（glyph margin 图标 class） */
  setMarker(line: number, markerClass: string | null): void {
    if (markerClass) this._markers.set(line, markerClass)
    else this._markers.delete(line)
    this._render()
  }

  /** 设置当前行（高亮；0 = 无） */
  setCurrentLine(line: number): void {
    if (this._currentLine === line) return
    this._currentLine = line
    this._render()
  }

  /** 滚动同步（translateY） */
  setOffsetY(offsetY: number): void {
    this._domNode.style.transform = `translateY(${offsetY}px)`
  }

  private _updateWidth(): void {
    const digits = String(Math.max(this._lineCount, 1)).length
    const w = this._options.gutterWidth > 0
      ? this._options.gutterWidth
      : digits * 8 + 24
    this._domNode.style.width = `${w}px`
  }

  private _render(): void {
    const sb: string[] = []
    const mode = this._options.lineNumbers
    const glyphMargin = this._options.glyphMargin
    for (let line = 1; line <= this._lineCount; line++) {
      const marker = this._markers.get(line)
      const isCurrent = line === this._currentLine
      const cls = ['cd-gutter-row']
      if (isCurrent) cls.push('cd-gutter-row-current')
      const num = mode === 'on' ? String(line)
        : mode === 'relative' ? (isCurrent ? String(line) : String(Math.abs(line - this._currentLine)))
        : ''
      sb.push(
        `<div class="${cls.join(' ')}" data-line="${line}">` +
        (glyphMargin ? `<span class="cd-gutter-glyph${marker ? ' ' + marker : ''}"></span>` : '') +
        `<span class="cd-gutter-num">${num}</span>` +
        `</div>`
      )
    }
    this._domNode.innerHTML = sb.join('')
  }
}
