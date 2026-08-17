/** B1 reveal 纯逻辑：区间归一化 / 行号定位 / 折叠区段求解 */
import { describe, it, expect } from 'vitest'
import {
  normalizeRevealRange,
  isLineInReveal,
  findRowIndexByLineNumber,
  findSectionsForRange,
} from '../reveal'
import { computeDiff } from '../diff-engine'
import type { DiffRow } from '../types'

function row(line: number, type: DiffRow['type'] = 'context', oldLine?: number): DiffRow {
  return {
    type,
    left: oldLine != null ? { lineNumber: oldLine, content: `old${oldLine}`, parts: [] } : (type === 'removed' ? { lineNumber: line, content: `old${line}`, parts: [] } : null),
    right: type === 'removed' ? null : { lineNumber: line, content: `new${line}`, parts: [] },
  }
}

describe('normalizeRevealRange', () => {
  it('undefined revealLine → null（清除）', () => {
    expect(normalizeRevealRange(undefined, undefined, 100)).toBeNull()
    expect(normalizeRevealRange(NaN, 10, 100)).toBeNull()
  })

  it('无 endLine → 单行区间', () => {
    expect(normalizeRevealRange(42, undefined, 100)).toEqual({ start: 42, end: 42 })
  })

  it('end < start 自动交换', () => {
    expect(normalizeRevealRange(200, 100, 1000)).toEqual({ start: 100, end: 200 })
  })

  it('越界钳制到 [1, totalLines]', () => {
    expect(normalizeRevealRange(99999, 100000, 500)).toEqual({ start: 500, end: 500 })
    expect(normalizeRevealRange(0, -5, 500)).toEqual({ start: 1, end: 1 })
    expect(normalizeRevealRange(10, 99999, 500)).toEqual({ start: 10, end: 500 })
  })

  it('空内容 → null', () => {
    expect(normalizeRevealRange(1, 5, 0)).toBeNull()
  })
})

describe('isLineInReveal', () => {
  const range = { start: 100, end: 200 }
  it('区间内 true，区间外 false', () => {
    expect(isLineInReveal(range, 100)).toBe(true)
    expect(isLineInReveal(range, 150)).toBe(true)
    expect(isLineInReveal(range, 200)).toBe(true)
    expect(isLineInReveal(range, 99)).toBe(false)
    expect(isLineInReveal(range, 201)).toBe(false)
  })
  it('null range / null line → false', () => {
    expect(isLineInReveal(null, 100)).toBe(false)
    expect(isLineInReveal(range, null)).toBe(false)
    expect(isLineInReveal(range, undefined)).toBe(false)
  })
})

describe('findRowIndexByLineNumber', () => {
  it('优先 right.lineNumber（新文件）', () => {
    const rows: DiffRow[] = [
      row(1), row(2),
      { type: 'modified', left: { lineNumber: 3, content: 'a', parts: [] }, right: { lineNumber: 3, content: 'b', parts: [] } },
      row(4),
    ]
    expect(findRowIndexByLineNumber(rows, 3)).toBe(2)
    expect(findRowIndexByLineNumber(rows, 4)).toBe(3)
  })

  it('纯删除行回退 left.lineNumber', () => {
    const rows = [row(1), row(2, 'removed', 2), row(3)]
    expect(findRowIndexByLineNumber(rows, 2)).toBe(1)
  })

  it('不存在返回 -1', () => {
    expect(findRowIndexByLineNumber([row(1), row(2)], 99)).toBe(-1)
  })
})

describe('findSectionsForRange', () => {
  it('showDiffOnly=false → 无折叠区段', () => {
    const rows = [row(1), row(2), row(3)]
    expect(findSectionsForRange(rows, false, 3, 1, 3)).toEqual([])
  })

  it('computeDiff 真实数据：远离变更的区间落在折叠段内', () => {
    const oldText = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n')
    const newText = oldText.replace('line 20\n', 'line 20 CHANGED\n').replace('line 35\n', 'line 35 CHANGED\n')
    const result = computeDiff(oldText, newText, { inlineDiffEnabled: false, inlineDiffLineLimit: 2000, inlineDiffCharLimit: 20_000 })
    // showDiffOnly + contextLines=3：变更带之外被折叠；第 5~14 行应落在某折叠段
    const sections = findSectionsForRange(result.rows, true, 3, 5, 14)
    expect(sections.length).toBe(1)
    // 覆盖变更带上下文的行（18~23）不折叠 → 空数组
    expect(findSectionsForRange(result.rows, true, 3, 20, 23)).toEqual([])
  })
})
