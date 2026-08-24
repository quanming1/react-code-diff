/**
 * @cd/view minimap（FR6.1/6.2/6.4）——canvas 缩略渲染。
 *
 * - 行 → 像素列采样（token 色），每行 2px（可配）
 * - renderCharacters：字符级（用 token 色画短竖线）或纯色块（整行底色）
 * - 视口框（当前可见区域矩形）+ 滚动同步
 * - 点击/拖拽视口框 → 主视图定位（回调）
 * - 脏区增量重绘（仅受影响行区域）——首版正确优先：全量重绘但节流 rAF
 * - 性能：50K 行 canvas 采样（每行 2px）不拖垮滚动
 */

import type { FlatToken } from '@cd/tokenizer'

export interface MinimapOptions {
  enabled?: boolean
  renderCharacters?: boolean
  maxColumn?: number
  /** 每行像素高 */
  lineHeight?: number
  /** 字符像素宽 */
  charWidth?: number
  width?: number
}

export interface MinimapLineData {
  /** 行号（1-based） */
  line: number
  /** token 数据（className 前缀 tok- 映射色板） */
  tokens: FlatToken[]
  /** 断点/诊断标记（className） */
  markerClass?: string
}

export interface MinimapCallbacks {
  /** 点击/拖拽 → 主视图定位到行 */
  onRevealLine: (line: number) => void
}

const DEFAULT_COLORS: Record<string, string> = {
  'tok-keyword': '#c678dd',
  'tok-type': '#e5c07b',
  'tok-string': '#98c379',
  'tok-comment': '#7f848e',
  'tok-number': '#d19a66',
  'tok-regex': '#d19a66',
  'tok-function': '#61afef',
  'tok-variable': '#abb2bf',
  'tok-property': '#e06c75',
  'tok-operator': '#56b6c2',
  'tok-punctuation': '#abb2bf',
  'tok-tag': '#e06c75',
  'tok-attr-name': '#d19a66',
  'tok-attr-value': '#98c379',
  'tok-plain': '#abb2bf',
  'tok-template': '#98c379',
  'tok-macro': '#c678dd',
  'tok-boolean': '#d19a66',
  'tok-constant': '#d19a66',
  'tok-parameter': '#abb2bf',
  'tok-class-name': '#e5c07b',
  'tok-important': '#e06c75',
}

export class Minimap {
  private readonly _container: HTMLDivElement
  private readonly _canvas: HTMLCanvasElement
  private readonly _ctx: CanvasRenderingContext2D | null
  private readonly _viewportBox: HTMLDivElement
  private _options: Required<MinimapOptions>
  private _lineCount = 0
  private _scrollTop = 0
  private _viewportHeight = 0
  private _totalHeight = 0
  private _dirty = true
  private _rafId = 0
  /** 行数据缓存（供渲染） */
  private _lineData: Array<MinimapLineData | null> = []
  private _colorMap: Record<string, string> = { ...DEFAULT_COLORS }
  /** 拖动状态 */
  private _dragging = false

  constructor(private readonly _cb: MinimapCallbacks, options: MinimapOptions = {}) {
    this._options = {
      enabled: options.enabled ?? true,
      renderCharacters: options.renderCharacters ?? true,
      maxColumn: options.maxColumn ?? 80,
      lineHeight: options.lineHeight ?? 2,
      charWidth: options.charWidth ?? 1,
      width: options.width ?? 80,
    }
    this._container = document.createElement('div')
    this._container.className = 'cd-minimap'
    this._container.style.position = 'absolute'
    this._container.style.right = '0'
    this._container.style.top = '0'
    this._container.style.bottom = '0'
    this._container.style.width = `${this._options.width}px`
    this._container.style.overflow = 'hidden'
    this._container.style.display = this._options.enabled ? 'block' : 'none'

    this._canvas = document.createElement('canvas')
    this._canvas.width = this._options.width
    this._ctx = this._canvas.getContext('2d')
    this._container.appendChild(this._canvas)

    this._viewportBox = document.createElement('div')
    this._viewportBox.className = 'cd-minimap-viewport'
    this._viewportBox.style.position = 'absolute'
    this._viewportBox.style.border = '1px solid rgba(120,120,120,0.5)'
    this._viewportBox.style.background = 'rgba(120,120,120,0.1)'
    this._viewportBox.style.pointerEvents = 'none'
    this._container.appendChild(this._viewportBox)

    this._container.addEventListener('pointerdown', this._onPointerDown)
    this._container.addEventListener('pointermove', this._onPointerMove)
    this._container.addEventListener('pointerup', this._onPointerUp)
  }

  getDomNode(): HTMLDivElement {
    return this._container
  }

  setOptions(options: MinimapOptions): void {
    this._options = { ...this._options, ...options }
    this._container.style.display = this._options.enabled ? 'block' : 'none'
    this._container.style.width = `${this._options.width}px`
    this._canvas.width = this._options.width
    this._dirty = true
    this._scheduleRender()
  }

  setColors(colors: Record<string, string>): void {
    this._colorMap = { ...DEFAULT_COLORS, ...colors }
    this._dirty = true
    this._scheduleRender()
  }

  /** 更新行数据（断点/诊断变化时调用） */
  setLineData(line: number, data: MinimapLineData | null): void {
    if (this._lineData.length < line) this._lineData.length = line
    this._lineData[line - 1] = data
    this._dirty = true
    this._scheduleRender()
  }

  setLineCount(count: number): void {
    this._lineCount = count
    this._lineData.length = count
    if (this._canvas.height !== count * this._options.lineHeight) {
      this._canvas.height = Math.max(1, count * this._options.lineHeight)
    }
    this._dirty = true
    this._scheduleRender()
  }

  /** 滚动同步（主视图 scrollTop → 视口框位移 + 内容不变，仅框移动） */
  setScroll(scrollTop: number, viewportHeight: number, totalHeight: number): void {
    this._scrollTop = scrollTop
    this._viewportHeight = viewportHeight
    this._totalHeight = totalHeight
    this._updateViewportBox()
    // 内容渲染与滚动无关（canvas 是全文缩略）→ 不需重绘
  }

  private _updateViewportBox(): void {
    const canvasH = this._canvas.height
    if (canvasH <= 0 || this._totalHeight <= 0) {
      this._viewportBox.style.display = 'none'
      return
    }
    const ratio = canvasH / this._totalHeight
    const boxTop = this._scrollTop * ratio
    const boxH = Math.max(8, this._viewportHeight * ratio)
    this._viewportBox.style.display = 'block'
    this._viewportBox.style.top = `${boxTop}px`
    this._viewportBox.style.height = `${boxH}px`
  }

  private _scheduleRender(): void {
    if (!this._dirty || this._rafId) return
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0
      this._render()
    })
  }

  /** 渲染（rAF 合并；首版全量重绘，50K 行 canvas 采样仍快） */
  private _render(): void {
    if (!this._dirty) return
    this._dirty = false
    const ctx = this._ctx
    if (!ctx) return
    const { lineHeight, charWidth, maxColumn } = this._options
    const w = this._canvas.width
    ctx.clearRect(0, 0, w, this._canvas.height)

    for (let i = 0; i < this._lineCount; i++) {
      const data = this._lineData[i]
      const y = i * lineHeight
      // 断点/诊断标记色
      if (data?.markerClass) {
        ctx.fillStyle = data.markerClass.includes('breakpoint') ? '#e06c75' : '#d19a66'
        ctx.fillRect(0, y, 2, lineHeight)
      }
      if (!data || !data.tokens || data.tokens.length === 0) continue
      // 采样：前 maxColumn 字符用 token 色画竖线
      let x = 2
      for (const t of data.tokens) {
        if (x >= w) break
        const color = this._colorMap[t.className] ?? '#abb2bf'
        ctx.fillStyle = color
        // 每个 token 画一段（按字符数估算宽度）
        const len = Math.min(t.text.length, maxColumn)
        const segW = Math.min(len * charWidth, w - x)
        if (segW > 0) {
          ctx.fillRect(x, y, segW, lineHeight)
          x += segW
        }
        if (x >= w) break
      }
      // 行尾填充底色（暗）
      if (x < w) {
        ctx.fillStyle = 'rgba(120,120,120,0.12)'
        ctx.fillRect(x, y, w - x, lineHeight)
      }
    }
  }

  // ── 交互：点击/拖拽定位 ──

  private _posToLine(clientY: number): number {
    const rect = this._container.getBoundingClientRect()
    const y = clientY - rect.top
    const line = Math.floor(y / this._options.lineHeight) + 1
    return Math.max(1, Math.min(this._lineCount, line))
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if (!this._options.enabled) return
    const line = this._posToLine(e.clientY)
    this._dragging = true
    this._container.setPointerCapture(e.pointerId)
    this._cb.onRevealLine(line)
  }

  private _onPointerMove = (e: PointerEvent): void => {
    if (!this._dragging) return
    const line = this._posToLine(e.clientY)
    this._cb.onRevealLine(line)
  }

  private _onPointerUp = (): void => {
    this._dragging = false
  }
}
