import { describe, it, expect } from 'vitest'
import { TextModel, CursorsController, EditStack } from '@cd/core'
import { InputHandler } from '../input-handler'
import { ViewCursors } from '../view-cursors'

function setup(text: string) {
  const model = new TextModel(text, 'e')
  const cursors = new CursorsController(model)
  const editStack = new EditStack(model)
  const host = document.createElement('div')
  const events: string[] = []
  const handler = new InputHandler(host, {
    onDidEdit: (sels) => events.push(`edit:${sels.length}`),
    onDidMoveCursor: (sels) => events.push(`move:${sels[0].active.line}:${sels[0].active.column}`),
    onUndoRedoStateChange: (st) => events.push(`ur:${st.canUndo ? 'u' : ''}${st.canRedo ? 'r' : ''}`),
  })
  handler.attach(model, cursors, editStack)
  return { model, cursors, editStack, host, events, handler }
}

function fireKey(host: HTMLElement, key: string, opts: { shift?: boolean; ctrl?: boolean } = {}) {
  host.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: opts.shift, ctrlKey: opts.ctrl, bubbles: true, cancelable: true }))
}

describe('InputHandler（TC-D5-01 字符输入）', () => {
  it('输入字符插入到光标', () => {
    const { model, host } = setup('abc')
    // 光标在 (1,1)
    fireKey(host, 'x')
    expect(model.getValue()).toBe('xabc')
    fireKey(host, 'y')
    expect(model.getValue()).toBe('xyabc')
  })

  it('Enter 插入换行', () => {
    const { model, host, cursors } = setup('ab')
    cursors.moveTo(1, 2)
    fireKey(host, 'Enter')
    expect(model.getValue()).toBe('a\nb')
  })

  it('Backspace 删除字符（含跨行）', () => {
    const { model, host, cursors } = setup('ab\ncd')
    cursors.moveTo(2, 1)
    fireKey(host, 'Backspace')
    expect(model.getValue()).toBe('abcd')
  })

  it('Delete 删除字符（含跨行）', () => {
    const { model, host, cursors } = setup('ab\ncd')
    cursors.moveTo(1, 3)
    fireKey(host, 'Delete')
    expect(model.getValue()).toBe('ab\ncd'.replace('b\n', 'b'))
    // 实际：删 (1,3) 的换行 → 'abcd'
    expect(model.getValue()).toBe('abcd')
  })

  it('有选区时输入替换选区', () => {
    const { model, host, cursors } = setup('abcdef')
    cursors.setSelections([{ anchor: { line: 1, column: 2 }, active: { line: 1, column: 5 } }])
    fireKey(host, 'X')
    expect(model.getValue()).toBe('aXef')
  })
})

describe('InputHandler（TC-D5-02 IME）', () => {
  it('组合期不落盘，compositionend 一次落盘', () => {
    const { model, host } = setup('')
    host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    // 组合期间 keydown 吞掉
    fireKey(host, 'a')
    fireKey(host, 'b')
    expect(model.getValue()).toBe('')
    // 组合结束一次落盘
    host.dispatchEvent(new CompositionEvent('compositionend', { data: '中文', bubbles: true }))
    expect(model.getValue()).toBe('中文')
  })
})

describe('InputHandler（TC-D5-03 undo/redo）', () => {
  it('Ctrl+Z / Ctrl+Shift+Z 还原/重做', () => {
    const { model, host } = setup('')
    fireKey(host, 'a')
    fireKey(host, 'b')
    fireKey(host, 'c')
    expect(model.getValue()).toBe('abc')
    fireKey(host, 'z', { ctrl: true })
    expect(model.getValue()).toBe('') // 连续输入合并成一次 undo
    fireKey(host, 'z', { ctrl: true })
    expect(model.getValue()).toBe('') // 已到空
    fireKey(host, 'z', { ctrl: true, shift: true })
    expect(model.getValue()).toBe('abc')
    fireKey(host, 'z', { ctrl: true, shift: true })
    expect(model.getValue()).toBe('abc') // 无更多 redo
  })
})

describe('InputHandler（TC-D5-04 选区操作 + Tab）', () => {
  it('Tab 缩进 / Shift+Tab 反缩进（多行）', () => {
    const { model, host, cursors } = setup('a\nb\nc')
    cursors.setSelections([{ anchor: { line: 1, column: 1 }, active: { line: 3, column: 2 } }])
    fireKey(host, 'Tab')
    expect(model.getValue()).toBe('  a\n  b\n  c')
    fireKey(host, 'Tab', { shift: true })
    expect(model.getValue()).toBe('a\nb\nc')
  })

  it('Ctrl+A 全选 + 输入替换', () => {
    const { model, host } = setup('hello')
    fireKey(host, 'a', { ctrl: true })
    fireKey(host, 'X')
    expect(model.getValue()).toBe('X')
  })
})

describe('InputHandler 光标移动（TC-D5-06 自动滚动关联）', () => {
  it('方向键移动触发 onDidMoveCursor', () => {
    const { cursors, host, events } = setup('abc\ndef')
    cursors.moveTo(1, 2)
    fireKey(host, 'ArrowRight')
    expect(cursors.getPrimarySelection().active).toEqual({ line: 1, column: 3 })
    fireKey(host, 'ArrowDown')
    expect(cursors.getPrimarySelection().active).toEqual({ line: 2, column: 3 })
    expect(events.some((e) => e.startsWith('move:'))).toBe(true)
  })

  it('Shift+方向扩展选区', () => {
    const { cursors, host } = setup('abcdef')
    cursors.moveTo(1, 2)
    fireKey(host, 'ArrowRight', { shift: true })
    fireKey(host, 'ArrowRight', { shift: true })
    const sel = cursors.getPrimarySelection()
    expect(sel.anchor).toEqual({ line: 1, column: 2 })
    expect(sel.active).toEqual({ line: 1, column: 4 })
  })
})

describe('ViewCursors（FR5.1 光标渲染）', () => {
  it('渲染光标 + 选区 overlay', () => {
    const vc = new ViewCursors()
    vc.update({
      selections: [
        { anchor: { line: 1, column: 1 }, active: { line: 1, column: 1 } },
        { anchor: { line: 2, column: 3 }, active: { line: 2, column: 3 } },
      ],
      lineHeight: 20,
      charWidth: 8,
      getColumnX: (_l, c) => (c - 1) * 8,
      focused: true,
    })
    expect(vc.getCursorCount()).toBe(2)
    expect(vc.getDomNode().querySelectorAll('.cd-cursor').length).toBe(2)
    expect(vc.getDomNode().querySelectorAll('.cd-cursor-focused').length).toBe(2)
  })

  it('选区渲染（非空选区）', () => {
    const vc = new ViewCursors()
    vc.update({
      selections: [{ anchor: { line: 1, column: 2 }, active: { line: 1, column: 5 } }],
      lineHeight: 20,
      charWidth: 8,
      getColumnX: (_l, c) => (c - 1) * 8,
      focused: true,
    })
    expect(vc.getDomNode().querySelectorAll('.cd-selection').length).toBe(1)
    expect(vc.getCursorCount()).toBe(0)
  })

  it('跨行选区多 block', () => {
    const vc = new ViewCursors()
    vc.update({
      selections: [{ anchor: { line: 1, column: 3 }, active: { line: 3, column: 2 } }],
      lineHeight: 20,
      charWidth: 8,
      getColumnX: (_l, c) => (c - 1) * 8,
      focused: false,
    })
    expect(vc.getDomNode().querySelectorAll('.cd-selection').length).toBe(3)
  })
})
