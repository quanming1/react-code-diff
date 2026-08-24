import { describe, it, expect, vi, beforeAll } from 'vitest'
import { Minimap } from '../minimap'
import { OverviewRuler } from '../overview-ruler'

// jsdom 无 canvas 实现 → mock getContext 返回 stub
beforeAll(() => {
  const ctxStub = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4).fill(200) })),
  }
  vi.stubGlobal('PointerEvent', MouseEvent)
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

describe('Minimap（TC-D6-01/02/03）', () => {
  function flushRaf(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  it('渲染 canvas 不白屏（2000 行）', async () => {
    const revealed: number[] = []
    const mm = new Minimap({ onRevealLine: (l) => revealed.push(l) }, { width: 80, lineHeight: 2 })
    mm.setLineCount(2000)
    // 填充行数据
    for (let i = 1; i <= 2000; i++) {
      mm.setLineData(i, { line: i, tokens: [{ text: 'x', className: 'tok-keyword' }] })
    }
    await flushRaf()
    const canvas = mm.getDomNode().querySelector('canvas') as HTMLCanvasElement
    expect(canvas).not.toBeNull()
    expect(canvas.height).toBe(2000 * 2)
    // 非全透明（有绘制内容）
    const ctx = canvas.getContext('2d')!
    const pixel = ctx.getImageData(0, 0, 80, 2).data
    expect(pixel.some((v) => v > 0)).toBe(true)
  })

  it('滚动同步：视口框位移', () => {
    const mm = new Minimap({ onRevealLine: () => {} }, { width: 80, lineHeight: 2 })
    mm.setLineCount(1000) // canvas 高 2000
    mm.setScroll(0, 400, 20_000) // totalHeight 20000 → ratio 0.1
    const box = mm.getDomNode().querySelector('.cd-minimap-viewport') as HTMLDivElement
    expect(box.style.top).toBe('0px')
    mm.setScroll(10_000, 400, 20_000)
    expect(box.style.top).toBe('1000px') // 10000 * 0.1
  })

  it('点击定位回调', () => {
    const revealed: number[] = []
    const mm = new Minimap({ onRevealLine: (l) => revealed.push(l) }, { width: 80, lineHeight: 2 })
    mm.setLineCount(100)
    // 模拟 pointerdown 在 y=100 → line 51
    const dom = mm.getDomNode()
    dom.setPointerCapture = () => {} // jsdom 无此方法
    dom.getBoundingClientRect = () => ({ top: 0, left: 0, width: 80, height: 200, right: 80, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    dom.dispatchEvent(new MouseEvent('pointerdown', { clientY: 100, bubbles: true }))
    expect(revealed[0]).toBe(51)
  })

  it('50K 行 canvas 高度正确（不拖垮）', () => {
    const mm = new Minimap({ onRevealLine: () => {} }, { width: 80, lineHeight: 2 })
    mm.setLineCount(50_000)
    const canvas = mm.getDomNode().querySelector('canvas') as HTMLCanvasElement
    expect(canvas.height).toBe(100_000)
  })

  it('断点标记色块', async () => {
    const mm = new Minimap({ onRevealLine: () => {} }, { width: 80, lineHeight: 2 })
    mm.setLineCount(10)
    mm.setLineData(3, { line: 3, tokens: [], markerClass: 'cd-marker-breakpoint' })
    await flushRaf()
    const ctx = (mm.getDomNode().querySelector('canvas') as HTMLCanvasElement).getContext('2d')!
    const pixel = ctx.getImageData(0, 3 * 2, 2, 2).data
    expect(pixel[0]).toBeGreaterThan(100) // 红色分量
  })
})

describe('OverviewRuler（TC-D6-05）', () => {
  it('markers 投影渲染', () => {
    const revealed: number[] = []
    const ruler = new OverviewRuler((l) => revealed.push(l), { width: 10 })
    ruler.setLineCount(100)
    ruler.setMarkers([
      { line: 5, type: 'breakpoint' },
      { line: 20, type: 'diagnostic-error' },
      { line: 50, type: 'search' },
    ])
    const dots = ruler.getDomNode().querySelectorAll('.cd-ruler-marker')
    expect(dots.length).toBe(3)
    expect(dots[0].getAttribute('data-line')).toBe('5')
    expect(dots[0].className).toContain('cd-ruler-breakpoint')
    expect(dots[1].className).toContain('cd-ruler-diagnostic-error')
    expect(dots[2].className).toContain('cd-ruler-search')
  })

  it('点击定位回调', () => {
    const revealed: number[] = []
    const ruler = new OverviewRuler((l) => revealed.push(l), { width: 10 })
    ruler.setLineCount(100)
    const dom = ruler.getDomNode()
    dom.getBoundingClientRect = () => ({ top: 0, left: 0, width: 10, height: 400, right: 10, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    // y=200 → 中间 → line 51
    dom.dispatchEvent(new MouseEvent('pointerdown', { clientY: 200, bubbles: true }))
    expect(revealed[0]).toBe(51)
  })

  it('可开关', () => {
    const ruler = new OverviewRuler(() => {}, { enabled: true })
    expect(ruler.getDomNode().style.display).toBe('block')
    ruler.setOptions({ enabled: false })
    expect(ruler.getDomNode().style.display).toBe('none')
  })
})
