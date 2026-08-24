/**
 * @cd/view View（FR4.6）——命令式渲染主类。
 *
 * 职责：
 * - 持有 DOM 容器 + 行池（ViewLine 对象池复用）+ BIT + TokenCache
 * - setModel(model)：清行池 → 全脏 → 重渲染可见行（tab 切换核心；滚动复位可配置）
 * - rAF 渲染循环：数据事件 → 标记受影响行脏 → 合并 → 仅脏行重渲
 * - 滚动：监听容器 scroll → BIT 查可见行 → 平移 transform + 行池同步
 * - 行池：ViewLine 对象复用（DOM 节点不销毁重建，input.equals 短路保留）
 *   首版正确优先：滚动时全量重建可见行集合（但复用 ViewLine 对象）；
 *   首尾局部 splice 优化留待后续（性能测量驱动）。
 *
 * React 不参与行渲染——View 是纯命令式（D7 用 ref 挂载）。
 */

import { TextModel, type Event, type ModelContentChangedEvent } from '@cd/core'
import { TokenCache, getLanguage, type FlatToken } from '@cd/tokenizer'
import { VisibleLinesCollection } from './visible-lines'
import { PrefixSum, computeVisibleRange, type VisibleRange } from './virtual'
import { ViewLine } from './view-line'

export interface ViewOptions {
  /** 行高（px，等宽非 wrap 场景） */
  lineHeight?: number
  overscan?: number
  /** setModel 时是否复位滚动到顶部（默认 true） */
  resetScrollOnSetModel?: boolean
}

export interface ViewModelLike {
  getLineCount(): number
  getLineContent(line: number): string
  getLineHash(line: number): number
  onDidChangeContent: Event<ModelContentChangedEvent>
}

/** 行渲染数据源（token 获取，供 View 使用；默认走 TokenCache） */
export interface TokenProvider {
  getLineTokens(line: number, model: ViewModelLike): FlatToken[]
}

export class View {
  private readonly _container: HTMLDivElement
  private readonly _linesContent: HTMLDivElement
  private readonly _collection: VisibleLinesCollection
  /** 空闲 ViewLine 池（复用 DOM 节点） */
  private readonly _pool: ViewLine[] = []
  private _bit: PrefixSum = new PrefixSum(0)
  private readonly _tokenCache: TokenCache
  private readonly _options: Required<ViewOptions>

  private _model: ViewModelLike | null = null
  private _langId = 'plaintext'
  private _range: VisibleRange = { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 }
  private _rafId = 0
  private _disposables: Array<() => void> = []
  /** 装饰签名回调（D4b 扩展） */
  private _decorationForLine: (line: number) => string = () => ''

  constructor(options: ViewOptions = {}) {
    this._options = {
      lineHeight: options.lineHeight ?? 20,
      overscan: options.overscan ?? 8,
      resetScrollOnSetModel: options.resetScrollOnSetModel ?? true,
    }
    this._container = document.createElement('div')
    this._container.className = 'cd-view'
    this._container.style.position = 'relative'
    this._container.style.overflow = 'hidden'
    this._linesContent = document.createElement('div')
    this._linesContent.className = 'cd-view-lines'
    this._linesContent.style.position = 'absolute'
    this._linesContent.style.top = '0'
    this._linesContent.style.left = '0'
    this._linesContent.style.width = '100%'
    this._container.appendChild(this._linesContent)

    this._collection = new VisibleLinesCollection()
    this._tokenCache = new TokenCache()
    this._tokenCache.setLanguage(getLanguage(this._langId))

    this._container.addEventListener('scroll', () => this._onScroll(), { passive: true })
  }

  getDomNode(): HTMLDivElement {
    return this._container
  }

  getLineCount(): number {
    return this._model?.getLineCount() ?? 0
  }

  setLanguage(langId: string): void {
    this._langId = langId
    this._tokenCache.setLanguage(getLanguage(langId))
    this._invalidateAll()
  }

  /** 装饰签名（D4b：reveal/搜索/断点/诊断）；变化时对应行重渲 */
  setDecorationProvider(fn: (line: number) => string): void {
    this._decorationForLine = fn
    this._invalidateAll()
  }

  /**
   * 设置 model（tab 切换核心）。
   * 清行池 → 全脏 → 重算可见行 → rAF 渲染；行池对象复用（容器不重建）。
   */
  setModel(model: ViewModelLike | null): void {
    this._disposeModelListeners()
    this._model = model
    this._bit = new PrefixSum(model ? model.getLineCount() : 0)
    if (model) {
      this._bit.init(new Array(model.getLineCount()).fill(this._options.lineHeight))
      this._tokenCache.setLineCount(model.getLineCount())
    } else {
      this._tokenCache.clear()
    }
    if (this._options.resetScrollOnSetModel) {
      this._container.scrollTop = 0
    }
    this._collection.flush()
    this._invalidateAll()
    // 同步行池（建立可见行集合）
    this._onScroll()

    if (model) {
      const off = model.onDidChangeContent(() => this._onModelContentChanged())
      this._disposables.push(off)
    }
  }

  getModel(): ViewModelLike | null {
    return this._model
  }

  /** 滚动到某行（居中/就近） */
  scrollToLine(line: number, align: 'center' | 'nearest' = 'center'): void {
    if (!this._model) return
    const total = this._model.getLineCount()
    const clamped = Math.max(1, Math.min(total, line))
    const h = this._options.lineHeight
    const top = (clamped - 1) * h
    const target = align === 'center'
      ? top - this._container.clientHeight / 2 + h / 2
      : top
    this._container.scrollTop = Math.max(0, target)
    this._onScroll()
  }

  getScrollTop(): number {
    return this._container.scrollTop
  }

  /** 渲染当前所有可见行（测试/调试用，同步） */
  renderNow(): void {
    this._render()
  }

  // ── 内部 ──

  private _disposeModelListeners(): void {
    for (const d of this._disposables) d()
    this._disposables = []
  }

  private _invalidateAll(): void {
    const coll = this._collection
    const start = coll.getStartLineNumber()
    const end = coll.getEndLineNumber()
    for (let l = start; l <= end; l++) coll.getLine(l)?.markDirty()
    this._scheduleRender()
  }

  private _onModelContentChanged(): void {
    if (!this._model) return
    const lineCount = this._model.getLineCount()
    this._bit = new PrefixSum(lineCount)
    this._bit.init(new Array(lineCount).fill(this._options.lineHeight))
    this._tokenCache.setLineCount(lineCount)
    // 简化：内容变化全量标记脏（D5 编辑高频场景可增量；D4 首版正确优先）
    this._invalidateAll()
    // 行数可能变化 → 重新同步可见范围
    this._onScroll()
  }

  private _onScroll(): void {
    if (!this._model) return
    const scrollTop = this._container.scrollTop
    const viewportH = this._container.clientHeight
    const newRange = computeVisibleRange(this._bit, scrollTop, viewportH, this._options.overscan)
    this._range = newRange
    this._syncCollection(newRange)
    this._scheduleRender()
  }

  private _acquireLine(): ViewLine {
    return this._pool.pop() ?? new ViewLine()
  }

  private _releaseLine(vl: ViewLine): void {
    vl.getDomNode().remove()
    this._pool.push(vl)
  }

  /** 同步行池到目标可见范围（正确优先：全量重建集合但复用 ViewLine 对象） */
  private _syncCollection(range: VisibleRange): void {
    const coll = this._collection
    // 释放旧行（回到池中）
    const start = coll.getStartLineNumber()
    const end = coll.getEndLineNumber()
    if (coll.getCount() > 0) {
      for (let l = start; l <= end; l++) {
        const vl = coll.getLine(l)
        if (vl) this._releaseLine(vl)
      }
    }
    coll.flush()
    this._linesContent.innerHTML = ''
    const lines: ViewLine[] = []
    for (let i = range.startIndex; i < range.endIndex; i++) {
      const vl = this._acquireLine()
      vl.markDirty()
      lines.push(vl)
    }
    coll.set(range.startIndex + 1, lines)
    for (const l of lines) this._linesContent.appendChild(l.getDomNode())
  }

  private _scheduleRender(): void {
    if (this._rafId) return
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0
      this._render()
    })
  }

  /** 渲染循环：只重渲脏行（rAF 合并） */
  private _render(): void {
    if (!this._model) return
    const coll = this._collection
    const start = coll.getStartLineNumber()
    const end = coll.getEndLineNumber()
    for (let line = start; line <= end; line++) {
      const vl = coll.getLine(line)
      if (!vl || !vl.isDirty()) continue
      const content = this._model.getLineContent(line)
      const lang = getLanguage(this._langId) ?? getLanguage('plaintext')!
      const tokens = this._tokenCache.getLineTokens(line, this._model, lang)
      const deco = this._decorationForLine(line)
      vl.render({ content, tokens, lineNumber: line, decorationClass: deco })
      vl.updateDecorations(deco)
    }
    // 平移容器（滚动位置）+ 总高度
    this._linesContent.style.transform = `translateY(${this._range.offsetY}px)`
    this._linesContent.style.height = `${this._range.totalHeight}px`
  }
}

export { TextModel }
