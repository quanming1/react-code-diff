import { describe, it, expect, beforeEach } from 'vitest'
import { VisibleLinesCollection } from '../visible-lines'
import { ViewLine, renderLineHtml } from '../view-line'
import { PrefixSum, computeVisibleRange } from '../virtual'
import { View } from '../view'
import { TextModel } from '@cd/core'

describe('VisibleLinesCollection（TC-D4-02 行池）', () => {
  let coll: VisibleLinesCollection
  beforeEach(() => {
    coll = new VisibleLinesCollection()
    // 初始 10 行（行 1..10）
    coll.set(1, Array.from({ length: 10 }, () => new ViewLine()))
  })

  it('初始状态', () => {
    expect(coll.getStartLineNumber()).toBe(1)
    expect(coll.getEndLineNumber()).toBe(10)
    expect(coll.getCount()).toBe(10)
  })

  it('删除视口上方的行 → 只平移 start，返回 null', () => {
    // 视口为行 5..14
    coll.set(5, Array.from({ length: 10 }, () => new ViewLine()))
    const removed = coll.onLinesDeleted(1, 3)
    expect(removed).toBeNull()
    expect(coll.getStartLineNumber()).toBe(2)
    expect(coll.getEndLineNumber()).toBe(11)
  })

  it('删除视口下方的行 → 不动', () => {
    const removed = coll.onLinesDeleted(11, 20)
    expect(removed).toBeNull()
    expect(coll.getStartLineNumber()).toBe(1)
    expect(coll.getCount()).toBe(10)
  })

  it('删除视口内行 → splice 局部返回被删行', () => {
    const removed = coll.onLinesDeleted(3, 5)
    expect(removed).toHaveLength(3)
    expect(coll.getStartLineNumber()).toBe(1)
    expect(coll.getCount()).toBe(7)
    // 行 6 现在在池中索引 2（原行 3 的位置被删后）
    expect(coll.getLine(6)).not.toBeNull()
  })

  it('删除跨越视口上方边界 → 平移 + splice', () => {
    const removed = coll.onLinesDeleted(1, 4)
    expect(removed).toHaveLength(4)
    expect(coll.getStartLineNumber()).toBe(1)
    expect(coll.getCount()).toBe(6)
  })

  it('插入视口上方 → 平移 start', () => {
    const removed = coll.onLinesInserted(1, 3)
    expect(removed).toBeNull()
    expect(coll.getStartLineNumber()).toBe(4)
    expect(coll.getCount()).toBe(10)
  })

  it('插入视口内 → splice + 挤出尾部', () => {
    const removed = coll.onLinesInserted(5, 6)
    expect(removed).toHaveLength(2)
    expect(coll.getCount()).toBe(10)
    expect(coll.getStartLineNumber()).toBe(1)
  })

  it('onLinesChanged 标记脏（仅视口内）', () => {
    const line3 = coll.getLine(3)!
    const line9 = coll.getLine(9)!
    // 先渲染清脏
    const input = { content: 'x', tokens: [{ text: 'x', className: '' }], lineNumber: 3, decorationClass: '' }
    line3.render(input)
    line9.render({ ...input, lineNumber: 9 })
    expect(line3.isDirty()).toBe(false)
    const notified = coll.onLinesChanged(3, 1)
    expect(notified).toBe(true)
    expect(line3.isDirty()).toBe(true)
    expect(line9.isDirty()).toBe(false)
  })
})

describe('ViewLine（TC-D4-03 脏渲染）', () => {
  it('首次渲染产生 DOM，二次同输入短路不动', () => {
    const vl = new ViewLine()
    const input = { content: 'abc', tokens: [{ text: 'abc', className: '' }], lineNumber: 1, decorationClass: '' }
    const r1 = vl.render(input)
    expect(r1).toBe(true)
    expect(vl.getDomNode().innerHTML).toContain('abc')
    const html = vl.getDomNode().innerHTML
    const r2 = vl.render(input)
    expect(r2).toBe(false) // 短路
    expect(vl.getDomNode().innerHTML).toBe(html)
  })

  it('内容变化重渲', () => {
    const vl = new ViewLine()
    vl.render({ content: 'a', tokens: [{ text: 'a', className: '' }], lineNumber: 1, decorationClass: '' })
    const r = vl.render({ content: 'b', tokens: [{ text: 'b', className: '' }], lineNumber: 1, decorationClass: '' })
    expect(r).toBe(true)
    expect(vl.getDomNode().innerHTML).toContain('b')
  })

  it('HTML 转义', () => {
    const html = renderLineHtml({ content: '<script>', tokens: [{ text: '<script>', className: '' }], lineNumber: 1, decorationClass: '' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('PrefixSum / computeVisibleRange（TC-D4-01 关联）', () => {
  it('uniform 行高 BIT 查询', () => {
    const bit = new PrefixSum(100, new Array(100).fill(20))
    expect(bit.total()).toBe(2000)
    expect(bit.query(49)).toBe(1000)
    expect(bit.findIndex(1000)).toBe(49)
  })

  it('可见范围计算（含 overscan）', () => {
    const bit = new PrefixSum(100, new Array(100).fill(20))
    const r = computeVisibleRange(bit, 0, 400, 8)
    expect(r.startIndex).toBe(0)
    expect(r.endIndex).toBe(28) // 20 可见 + 8 overscan
    expect(r.offsetY).toBe(0)
  })

  it('滚动到中部范围正确', () => {
    const bit = new PrefixSum(100, new Array(100).fill(20))
    const r = computeVisibleRange(bit, 1000, 400, 8)
    expect(r.startIndex).toBe(42) // 50 - 8
    expect(r.offsetY).toBe(42 * 20)
  })
})

describe('View（TC-D4-01/04 setModel + DOM 恒定）', () => {
  function flushRaf(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  it('setModel 渲染可见行', async () => {
    const model = new TextModel(Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join('\n'), 'v')
    const view = new View({ lineHeight: 20 })
    // jsdom 无真实布局，clientHeight=0 → 只渲染 1 行；手动设高度
    Object.defineProperty(view.getDomNode(), 'clientHeight', { value: 400, configurable: true })
    view.setModel(model)
    await flushRaf()
    const rows = view.getDomNode().querySelectorAll('.view-line')
    expect(rows.length).toBeGreaterThan(0)
    // 内容渲染
    expect(rows[0].innerHTML).toContain('line1')
  })

  it('setModel A→B→A 行池复用（DOM 数不回涨）', async () => {
    const mk = (n: number) => new TextModel(Array.from({ length: n }, (_, i) => `l${i + 1}`).join('\n'), 'v')
    const modelA = mk(50)
    const modelB = mk(80)
    const view = new View({ lineHeight: 20 })
    Object.defineProperty(view.getDomNode(), 'clientHeight', { value: 400, configurable: true })
    view.setModel(modelA)
    await flushRaf()
    const countA = view.getDomNode().querySelectorAll('.view-line').length
    view.setModel(modelB)
    await flushRaf()
    const countB = view.getDomNode().querySelectorAll('.view-line').length
    view.setModel(modelA)
    await flushRaf()
    const countA2 = view.getDomNode().querySelectorAll('.view-line').length
    // 可见行数恒定（= 20 可见 + overscan）
    expect(countA).toBe(countB)
    expect(countA2).toBe(countA)
    expect(countA).toBeGreaterThan(0)
  })

  it('滚动后可见行更新（DOM 平移/换行）', async () => {
    const model = new TextModel(Array.from({ length: 100 }, (_, i) => `l${i + 1}`).join('\n'), 'v')
    const view = new View({ lineHeight: 20 })
    Object.defineProperty(view.getDomNode(), 'clientHeight', { value: 400, configurable: true })
    view.setModel(model)
    await flushRaf()
    // 滚动到行 50
    view.scrollToLine(50, 'nearest')
    await flushRaf()
    const rows = [...view.getDomNode().querySelectorAll('.view-line')]
    expect(rows.length).toBeGreaterThan(0)
    // 至少有一行渲染 l50
    const texts = rows.map((r) => r.innerHTML)
    expect(texts.some((t) => t.includes('l50'))).toBe(true)
  })

  it('内容变更后重渲（模型编辑）', async () => {
    const model = new TextModel('aaa\nbbb\nccc', 'v')
    const view = new View({ lineHeight: 20 })
    Object.defineProperty(view.getDomNode(), 'clientHeight', { value: 400, configurable: true })
    view.setModel(model)
    await flushRaf()
    // 编辑第 1 行
    model.applyEdits([{ range: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }, text: 'XXX' }])
    await flushRaf()
    const rows = [...view.getDomNode().querySelectorAll('.view-line')]
    expect(rows[0].innerHTML).toContain('XXX')
  })
})
