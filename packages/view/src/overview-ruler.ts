/**
 * @cd/view overview ruler（FR6.3）——右侧概览条。
 *
 * - 断点/诊断/搜索/光标投影（色点）
 * - 点击定位（回调）
 * - 可开关
 */

export interface OverviewRulerOptions {
  enabled?: boolean
  width?: number
}

export interface RulerMarker {
  /** 1-based 行 */
  line: number
  type: 'breakpoint' | 'diagnostic-error' | 'diagnostic-warning' | 'search' | 'cursor'
}

const MARKER_COLORS: Record<RulerMarker['type'], string> = {
  breakpoint: '#e06c75',
  'diagnostic-error': '#f14c4c',
  'diagnostic-warning': '#d19a66',
  search: '#61afef',
  cursor: '#abb2bf',
}

export class OverviewRuler {
  private readonly _container: HTMLDivElement
  private _options: Required<OverviewRulerOptions>
  private _lineCount = 0
  private _markers: RulerMarker[] = []

  constructor(private readonly _onRevealLine: (line: number) => void, options: OverviewRulerOptions = {}) {
    this._options = {
      enabled: options.enabled ?? true,
      width: options.width ?? 10,
    }
    this._container = document.createElement('div')
    this._container.className = 'cd-overview-ruler'
    this._container.style.position = 'absolute'
    this._container.style.right = '0'
    this._container.style.top = '0'
    this._container.style.bottom = '0'
    this._container.style.width = `${this._options.width}px`
    this._container.style.cursor = 'pointer'
    this._container.style.display = this._options.enabled ? 'block' : 'none'
    this._container.addEventListener('pointerdown', this._onPointerDown)
  }

  getDomNode(): HTMLDivElement {
    return this._container
  }

  setOptions(options: OverviewRulerOptions): void {
    this._options = { ...this._options, ...options }
    this._container.style.display = this._options.enabled ? 'block' : 'none'
    this._container.style.width = `${this._options.width}px`
    this._render()
  }

  setLineCount(count: number): void {
    this._lineCount = count
    this._render()
  }

  /** 全量设置 markers（delta 简化：每次全量替换） */
  setMarkers(markers: RulerMarker[]): void {
    this._markers = markers
    this._render()
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if (!this._options.enabled) return
    const rect = this._container.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    const line = Math.max(1, Math.min(this._lineCount, Math.floor(ratio * this._lineCount) + 1))
    this._onRevealLine(line)
  }

  private _render(): void {
    const h = this._container.clientHeight || 400
    this._container.innerHTML = ''
    if (this._lineCount === 0) return
    const pixelPerLine = h / this._lineCount
    for (const m of this._markers) {
      const dot = document.createElement('div')
      dot.className = `cd-ruler-marker cd-ruler-${m.type}`
      dot.style.position = 'absolute'
      dot.style.left = '2px'
      dot.style.right = '2px'
      dot.style.height = `${Math.max(2, pixelPerLine)}px`
      dot.style.top = `${(m.line - 1) * pixelPerLine}px`
      dot.style.background = MARKER_COLORS[m.type]
      dot.setAttribute('data-line', String(m.line))
      this._container.appendChild(dot)
    }
  }
}
