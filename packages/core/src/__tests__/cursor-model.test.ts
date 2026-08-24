import { describe, it, expect } from 'vitest'
import { TextModel } from '../text-model'
import { CursorsController } from '../cursor-model'
import { getSelectionRange, isReversed } from '../types'

function makeModel(n: number): TextModel {
  return new TextModel(Array.from({ length: n }, (_, i) => `line${i + 1}`).join('\n'), 'c')
}

describe('CursorsController（TC-D2-05）', () => {
  it('初始：文件开头单光标', () => {
    const c = new CursorsController(makeModel(3))
    const sel = c.getPrimarySelection()
    expect(sel.anchor).toEqual({ line: 1, column: 1 })
    expect(sel.active).toEqual({ line: 1, column: 1 })
    expect(c.getSelections()).toHaveLength(1)
  })

  it('moveRight：行内移动 + 行尾跨行', () => {
    const m = makeModel(2)
    const c = new CursorsController(m)
    // line1 = 'line1'（5 字符，maxCol=6）
    c.moveRight()
    expect(c.getPrimarySelection().active).toEqual({ line: 1, column: 2 })
    // 移到行尾（col 6）再右移 → 下一行 col 1
    c.moveTo(1, 6)
    c.moveRight()
    expect(c.getPrimarySelection().active).toEqual({ line: 2, column: 1 })
  })

  it('moveLeft：行首跨上一行行尾', () => {
    const c = new CursorsController(makeModel(2))
    c.moveTo(2, 1)
    c.moveLeft()
    expect(c.getPrimarySelection().active).toEqual({ line: 1, column: 6 })
  })

  it('moveUp/Down：行间移动保持列', () => {
    const c = new CursorsController(makeModel(3))
    c.moveTo(2, 3)
    c.moveUp()
    expect(c.getPrimarySelection().active).toEqual({ line: 1, column: 3 })
    c.moveDown()
    c.moveDown()
    expect(c.getPrimarySelection().active).toEqual({ line: 3, column: 3 })
  })

  it('越界钳制：列超行尾、行越界', () => {
    const c = new CursorsController(makeModel(2))
    c.moveTo(1, 999)
    expect(c.getPrimarySelection().active).toEqual({ line: 1, column: 6 })
    c.moveTo(999, 1)
    expect(c.getPrimarySelection().active).toEqual({ line: 2, column: 1 })
    c.moveTo(0, 0)
    expect(c.getPrimarySelection().active).toEqual({ line: 1, column: 1 })
  })

  it('moveToLineStart / LineEnd / FileStart / FileEnd', () => {
    const c = new CursorsController(makeModel(3))
    c.moveTo(2, 4)
    c.moveToLineStart()
    expect(c.getPrimarySelection().active).toEqual({ line: 2, column: 1 })
    c.moveToLineEnd()
    expect(c.getPrimarySelection().active).toEqual({ line: 2, column: 6 })
    c.moveToFileStart()
    expect(c.getPrimarySelection().active).toEqual({ line: 1, column: 1 })
    c.moveToFileEnd()
    expect(c.getPrimarySelection().active).toEqual({ line: 3, column: 6 })
  })

  it('PageUp/PageDown 按行数翻页', () => {
    const c = new CursorsController(makeModel(10))
    c.moveTo(5, 2)
    c.movePageDown(3)
    expect(c.getPrimarySelection().active).toEqual({ line: 8, column: 2 })
    c.movePageUp(5)
    expect(c.getPrimarySelection().active).toEqual({ line: 3, column: 2 })
  })

  it('keepSelection：shift 扩展选区（正向/反向）', () => {
    const c = new CursorsController(makeModel(3))
    c.moveTo(2, 2)
    // shift + 右 3 次 → 选区 [2,2)~(2,5)
    c.moveRight(true)
    c.moveRight(true)
    c.moveRight(true)
    const sel = c.getPrimarySelection()
    expect(getSelectionRange(sel)).toEqual({ start: { line: 2, column: 2 }, end: { line: 2, column: 5 } })
    expect(isReversed(sel)).toBe(false)
    // 反向：shift + 左回退超过锚点
    c.moveLeft(true)
    c.moveLeft(true)
    c.moveLeft(true)
    c.moveLeft(true)
    const sel2 = c.getPrimarySelection()
    expect(getSelectionRange(sel2)).toEqual({ start: { line: 2, column: 1 }, end: { line: 2, column: 2 } })
    expect(isReversed(sel2)).toBe(true)
  })

  it('反向选区上下跨行', () => {
    const c = new CursorsController(makeModel(3))
    c.moveTo(2, 1)
    c.moveUp(true) // 选区 anchor=[2,1] active=[1,1] → 反向
    const sel = c.getPrimarySelection()
    expect(isReversed(sel)).toBe(true)
    expect(getSelectionRange(sel)).toEqual({ start: { line: 1, column: 1 }, end: { line: 2, column: 1 } })
  })

  it('多光标：setSelections + hasCursorAt', () => {
    const c = new CursorsController(makeModel(3))
    c.setSelections([
      { anchor: { line: 1, column: 1 }, active: { line: 1, column: 1 } },
      { anchor: { line: 2, column: 1 }, active: { line: 2, column: 1 } },
      { anchor: { line: 3, column: 1 }, active: { line: 3, column: 1 } },
    ])
    expect(c.getSelections()).toHaveLength(3)
    expect(c.hasCursorAt({ line: 2, column: 1 })).toBe(true)
    expect(c.hasCursorAt({ line: 2, column: 5 })).toBe(false)
    // 主光标 = 最后一个
    expect(c.getPrimarySelection().active).toEqual({ line: 3, column: 1 })
  })

  it('setSelections 空数组兜底为文件头', () => {
    const c = new CursorsController(makeModel(3))
    c.setSelections([])
    expect(c.getSelections()).toHaveLength(1)
    expect(c.getPrimarySelection().active).toEqual({ line: 1, column: 1 })
  })
})
