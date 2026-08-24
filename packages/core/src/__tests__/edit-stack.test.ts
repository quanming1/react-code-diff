import { describe, it, expect } from 'vitest'
import { TextModel } from '../text-model'
import { EditStack, canMerge } from '../edit-stack'
import { createSelection } from '../types'

function makeModel(value: string): TextModel {
  return new TextModel(value, 'e')
}

const SEL1 = createSelection({ line: 1, column: 1 }, { line: 1, column: 1 })

/** 辅助：模拟一次输入编辑（插入 1 字符到 col）并记录进栈 */
function typeChar(stack: EditStack, model: TextModel, col: number, ch: string): void {
  const before = model.getValue()
  model.applyEdits([{ range: { start: { line: 1, column: col }, end: { line: 1, column: col } }, text: ch }])
  const after = model.getValue()
  stack.pushEdit(before, SEL1, after, createSelection({ line: 1, column: col + 1 }, { line: 1, column: col + 1 }))
}

describe('EditStack（TC-D2-04）', () => {
  it('undo/redo 逐级还原（不合并的编辑序列）', () => {
    const m = makeModel('hello')
    const s = new EditStack(m)
    typeChar(s, m, 6, '!')  // hello → hello!
    // 反向操作（删除）不合并
    const before = m.getValue()
    m.applyEdits([{ range: { start: { line: 1, column: 6 }, end: { line: 1, column: 7 } }, text: '' }])
    const after = m.getValue()
    s.pushEdit(before, SEL1, after, SEL1)  // hello! → hello
    expect(m.getValue()).toBe('hello')

    expect(s.undo()).toBe(true)   // 撤删除 → hello!
    expect(m.getValue()).toBe('hello!')
    expect(s.undo()).toBe(true)   // 撤插入 → hello
    expect(m.getValue()).toBe('hello')
    expect(s.undo()).toBe(false)

    expect(s.redo()).toBe(true)
    expect(m.getValue()).toBe('hello!')
    expect(s.redo()).toBe(true)
    expect(m.getValue()).toBe('hello')
    expect(s.redo()).toBe(false)
  })

  it('连续同向输入合并为一次 undo', () => {
    const m = makeModel('a')
    const s = new EditStack(m)
    typeChar(s, m, 2, 'b')
    typeChar(s, m, 3, 'c')
    typeChar(s, m, 4, 'd')
    expect(m.getValue()).toBe('abcd')
    // 合并 → 一次 undo 回到 'a'
    expect(s.undo()).toBe(true)
    expect(m.getValue()).toBe('a')
    // 一次 redo 全回来
    expect(s.redo()).toBe(true)
    expect(m.getValue()).toBe('abcd')
  })

  it('不同方向不合并（插 vs 删）', () => {
    const m = makeModel('abc')
    const s = new EditStack(m)
    typeChar(s, m, 2, 'X') // 插入
    // 删除（删 col2 的 X）
    const before = m.getValue()
    m.applyEdits([{ range: { start: { line: 1, column: 2 }, end: { line: 1, column: 3 } }, text: '' }])
    const after = m.getValue()
    s.pushEdit(before, SEL1, after, SEL1)
    // 两步各自成组 → 两次 undo 还原
    expect(s.undo()).toBe(true)
    expect(m.getValue()).toBe('aXbc')
    expect(s.undo()).toBe(true)
    expect(m.getValue()).toBe('abc')
  })

  it('非连续插入不合并（中间有其他编辑）', () => {
    const m = makeModel('a')
    const s = new EditStack(m)
    typeChar(s, m, 2, 'b')
    // 中断：先 undo 再重新输入 → 不合并
    s.undo()
    expect(m.getValue()).toBe('a')
    typeChar(s, m, 2, 'c')
    // 此时 undo 应回到 'a'（'c' 是新组）
    expect(s.undo()).toBe(true)
    expect(m.getValue()).toBe('a')
    // 'b' 组已被新编辑清出 redo 栈（pushEdit 清空 redo 是正确设计）
    expect(s.undo()).toBe(false)
  })

  it('新编辑清空 redo 栈', () => {
    const m = makeModel('a')
    const s = new EditStack(m)
    typeChar(s, m, 2, 'b')
    s.undo()
    expect(m.getValue()).toBe('a')
    expect(s.canRedo()).toBe(true)
    // 新编辑 → redo 被清
    typeChar(s, m, 2, 'z')
    expect(s.canRedo()).toBe(false)
    expect(s.canUndo()).toBe(true)
  })

  it('onDidChangeUndoRedoState 事件驱动（canUndo/canRedo）', () => {
    const m = makeModel('a')
    const s = new EditStack(m)
    const states: Array<{ canUndo: boolean; canRedo: boolean }> = []
    s.onDidChangeUndoRedoState((st) => states.push({ ...st }))
    typeChar(s, m, 2, 'b')
    expect(states[states.length - 1]).toEqual({ canUndo: true, canRedo: false })
    s.undo()
    expect(states[states.length - 1]).toEqual({ canUndo: false, canRedo: true })
    s.redo()
    expect(states[states.length - 1]).toEqual({ canUndo: true, canRedo: false })
  })

  it('undo/redo 恢复光标（onDidRestoreSelection）', () => {
    const m = makeModel('abc')
    const s = new EditStack(m)
    typeChar(s, m, 4, 'd')
    let restored: unknown = null
    s.onDidRestoreSelection((sel) => { restored = sel })
    s.undo()
    expect(restored).not.toBeNull()
    expect((restored as { active: { line: number; column: number } }).active).toEqual({ line: 1, column: 1 })
  })

  it('undo 后光标钳制到新结构（行数变化）', () => {
    const m = makeModel('a\nb\nc')
    const s = new EditStack(m)
    // 全文件替换为 1 行
    const before = m.getValue()
    m.applyEdits([{ range: { start: { line: 1, column: 1 }, end: { line: 3, column: 2 } }, text: 'one' }])
    s.pushEdit(before, createSelection({ line: 3, column: 2 }, { line: 3, column: 2 }), 'one', createSelection({ line: 1, column: 4 }, { line: 1, column: 4 }))
    let restoredLine: number | null = null
    s.onDidRestoreSelection((sel) => { restoredLine = sel.anchor.line })
    s.undo()
    // 光标 [3,2] 应钳制到恢复后的 3 行结构
    expect(restoredLine).toBe(3)
  })

  it('10 步混合编辑 undo/redo 全序列还原', () => {
    const m = makeModel('')
    const s = new EditStack(m)
    // 混合：插字符、换行、删字符、插入
    const steps: Array<{ r: { line: number; column: number }; e?: { line: number; column: number }; t: string }> = [
      { r: { line: 1, column: 1 }, t: 'a' },
      { r: { line: 1, column: 2 }, t: 'b' },
      { r: { line: 1, column: 3 }, t: '\n' },
      { r: { line: 2, column: 1 }, t: 'c' },
      { r: { line: 2, column: 2 }, t: 'd' },
      { r: { line: 2, column: 3 }, t: 'e' },
      { r: { line: 2, column: 2 }, e: { line: 2, column: 3 }, t: '' }, // 删 d
      { r: { line: 2, column: 1 }, t: 'x' },
      { r: { line: 2, column: 2 }, t: 'y' },
      { r: { line: 1, column: 2 }, t: 'Z' },
    ]
    for (const st of steps) {
      const b = m.getValue()
      const end = st.e ?? st.r
      m.applyEdits([{ range: { start: st.r, end }, text: st.t }])
      s.pushEdit(b, SEL1, m.getValue(), SEL1)
    }
    const finalValue = m.getValue()
    // 追踪：行2 步骤 4-9：c → cd → cde → ce（删d）→ xce → xyce
    expect(finalValue).toBe('aZb\nxyce')
    // 连续插入合并成 3 组：组1（步骤1-6: ''→'ab\ncde'）、组3（步骤7 删d）、组4（步骤8-10: xy+Z）
    const states: string[] = []
    while (s.canUndo()) { s.undo(); states.push(m.getValue()) }
    expect(states).toEqual(['ab\nce', 'ab\ncde', ''])
    expect(m.getValue()).toBe('')
    // 逐步 redo 回最终（中间状态逆序）
    const redoStates: string[] = []
    while (s.canRedo()) { s.redo(); redoStates.push(m.getValue()) }
    expect(redoStates).toEqual(['ab\ncde', 'ab\nce', 'aZb\nxyce'])
    expect(m.getValue()).toBe(finalValue)
  })
})

describe('canMerge', () => {
  it('连续插入合并', () => {
    expect(canMerge(
      { valueBefore: 'a', selectionBefore: SEL1, valueAfter: 'ab', selectionAfter: SEL1, steps: 1 },
      { valueBefore: 'ab', selectionBefore: SEL1, valueAfter: 'abc', selectionAfter: SEL1, steps: 1 },
    )).toBe(true)
  })

  it('连续删除合并', () => {
    expect(canMerge(
      { valueBefore: 'abc', selectionBefore: SEL1, valueAfter: 'ab', selectionAfter: SEL1, steps: 1 },
      { valueBefore: 'ab', selectionBefore: SEL1, valueAfter: 'a', selectionAfter: SEL1, steps: 1 },
    )).toBe(true)
  })

  it('插删方向不一致不合并', () => {
    expect(canMerge(
      { valueBefore: 'a', selectionBefore: SEL1, valueAfter: 'ab', selectionAfter: SEL1, steps: 1 },
      { valueBefore: 'ab', selectionBefore: SEL1, valueAfter: 'a', selectionAfter: SEL1, steps: 1 },
    )).toBe(false)
  })

  it('内容不衔接不合并', () => {
    expect(canMerge(
      { valueBefore: 'a', selectionBefore: SEL1, valueAfter: 'ab', selectionAfter: SEL1, steps: 1 },
      { valueBefore: 'ac', selectionBefore: SEL1, valueAfter: 'acd', selectionAfter: SEL1, steps: 1 },
    )).toBe(false)
  })

  it('超过 1000 步不合并', () => {
    expect(canMerge(
      { valueBefore: 'a', selectionBefore: SEL1, valueAfter: 'ab', selectionAfter: SEL1, steps: 1000 },
      { valueBefore: 'ab', selectionBefore: SEL1, valueAfter: 'abc', selectionAfter: SEL1, steps: 1 },
    )).toBe(false)
  })
})
