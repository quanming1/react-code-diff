import { describe, it, expect } from 'vitest'
import { DecorationStore } from '../decoration-store'
import { Gutter } from '../gutter'
import { View } from '../view'
import { TextModel } from '@cd/core'

describe('DecorationStore（TC-D4-07 装饰叠加）', () => {
  it('deltaDecorations 增删（Monaco 语义）', () => {
    const s = new DecorationStore()
    const ids = s.deltaDecorations([], [
      { line: 1, type: 'reveal' },
      { line: 2, type: 'breakpoint' },
    ])
    expect(ids).toHaveLength(2)
    expect(s.getLineDecorations(1).map((d) => d.type)).toEqual(['reveal'])
    expect(s.getLineDecorations(2).map((d) => d.type)).toEqual(['breakpoint'])
    // 替换：删 1 增 3
    const ids2 = s.deltaDecorations(ids, [{ line: 3, type: 'search' }])
    expect(ids2).toHaveLength(1)
    expect(s.getLineDecorations(1)).toEqual([])
    expect(s.getLineDecorations(3).map((d) => d.type)).toEqual(['search'])
  })

  it('同行多装饰叠加（reveal + 搜索 + 断点共存）', () => {
    const s = new DecorationStore()
    s.deltaDecorations([], [
      { line: 5, type: 'reveal' },
      { line: 5, type: 'search' },
      { line: 5, type: 'breakpoint' },
    ])
    const decs = s.getLineDecorations(5)
    expect(decs).toHaveLength(3)
    const cls = s.getLineDecorationClass(5)
    expect(cls).toContain('cd-dec-reveal')
    expect(cls).toContain('cd-dec-search')
    expect(cls).toContain('cd-dec-breakpoint')
  })

  it('getBreakpointLines / isBreakpoint', () => {
    const s = new DecorationStore()
    s.deltaDecorations([], [
      { line: 2, type: 'breakpoint' },
      { line: 8, type: 'breakpoint' },
      { line: 3, type: 'search' },
    ])
    expect(s.getBreakpointLines()).toEqual([2, 8])
    expect(s.isBreakpoint(2)).toBe(true)
    expect(s.isBreakpoint(3)).toBe(false)
  })

  it('clearLine / clearAll', () => {
    const s = new DecorationStore()
    s.deltaDecorations([], [
      { line: 1, type: 'search' },
      { line: 2, type: 'search' },
    ])
    s.clearLine(1)
    expect(s.getLineDecorations(1)).toEqual([])
    expect(s.getLineDecorations(2)).toHaveLength(1)
    s.clearAll()
    expect(s.getLineDecorations(2)).toEqual([])
  })
})

describe('Gutter（FUNC-11 断点/诊断图标）', () => {
  it('行号渲染 on/off/relative', () => {
    const g = new Gutter({ lineNumbers: 'on', glyphMargin: false })
    g.setLineCount(3)
    g.setOffsetY(0)
    const nums = [...g.getDomNode().querySelectorAll('.cd-gutter-num')].map((e) => e.textContent)
    expect(nums).toEqual(['1', '2', '3'])
  })

  it('断点 marker 渲染 glyph', () => {
    const g = new Gutter({ lineNumbers: 'on', glyphMargin: true })
    g.setLineCount(3)
    g.setMarker(2, 'cd-marker-breakpoint')
    const row2 = g.getDomNode().querySelector('[data-line="2"] .cd-gutter-glyph')
    expect(row2?.className).toContain('cd-marker-breakpoint')
    // 清除
    g.setMarker(2, null)
    const row2b = g.getDomNode().querySelector('[data-line="2"] .cd-gutter-glyph')
    expect(row2b?.className).not.toContain('cd-marker-breakpoint')
  })

  it('当前行高亮 class', () => {
    const g = new Gutter({ lineNumbers: 'on' })
    g.setLineCount(3)
    g.setCurrentLine(2)
    const row2 = g.getDomNode().querySelector('[data-line="2"]')
    expect(row2?.className).toContain('cd-gutter-row-current')
    const row1 = g.getDomNode().querySelector('[data-line="1"]')
    expect(row1?.className).not.toContain('cd-gutter-row-current')
  })

  it('行数变化宽度自适应', () => {
    const g = new Gutter({ lineNumbers: 'on', glyphMargin: false, gutterWidth: 0 })
    g.setLineCount(9)
    const w9 = g.getDomNode().style.width
    g.setLineCount(1000)
    const w1000 = g.getDomNode().style.width
    expect(parseInt(w1000)).toBeGreaterThan(parseInt(w9))
  })
})

describe('View + 装饰/gutter 集成（FUNC-02/03/04 关联）', () => {
  function flushRaf(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  it('setDecorationProvider 装饰 class 叠加到行', async () => {
    const model = new TextModel('a\nb\nc\nd', 'v')
    const view = new View({ lineHeight: 20 })
    Object.defineProperty(view.getDomNode(), 'clientHeight', { value: 400, configurable: true })
    view.setDecorationProvider((line) => (line === 2 ? 'cd-dec-reveal' : ''))
    view.setModel(model)
    await flushRaf()
    const rows = [...view.getDomNode().querySelectorAll('.view-line')]
    // 行 2 有装饰 class
    const row2 = rows.find((r) => r.innerHTML.includes('b'))
    expect(row2?.className).toContain('cd-dec-reveal')
  })

  it('setGutterEnabled 渲染行号槽', async () => {
    const model = new TextModel(Array.from({ length: 50 }, (_, i) => `l${i + 1}`).join('\n'), 'v')
    const view = new View({ lineHeight: 20 })
    Object.defineProperty(view.getDomNode(), 'clientHeight', { value: 400, configurable: true })
    view.setGutterEnabled(true)
    view.setModel(model)
    await flushRaf()
    const gutter = view.getDomNode().querySelector('.cd-gutter') as HTMLDivElement | null
    expect(gutter).not.toBeNull()
    expect(gutter!.style.display).not.toBe('none')
    const rows = gutter!.querySelectorAll('.cd-gutter-row')
    expect(rows.length).toBeGreaterThan(0)
    // 首行号 = 1
    expect(rows[0]?.getAttribute('data-line')).toBe('1')
  })

  it('setGutterMarker 断点红点', async () => {
    const model = new TextModel('a\nb\nc', 'v')
    const view = new View({ lineHeight: 20 })
    Object.defineProperty(view.getDomNode(), 'clientHeight', { value: 400, configurable: true })
    view.setGutterEnabled(true)
    view.setModel(model)
    await flushRaf()
    view.setGutterMarker(2, 'cd-marker-breakpoint')
    const row2 = view.getDomNode().querySelector('[data-line="2"] .cd-gutter-glyph')
    expect(row2?.className).toContain('cd-marker-breakpoint')
  })
})
