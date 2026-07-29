import { describe, it, expect } from 'vitest'
import {
  computeDiff,
  findChangeBlocks,
  buildVisibleRows,
  computeSearchMatches,
  computePreviewSearchMatches,
} from '../code-diff/diff-engine'
import type { DiffRow } from '../code-diff/types'

const defaultOpts = {
  inlineDiffEnabled: true,
  inlineDiffLineLimit: 2000,
  inlineDiffCharLimit: 20_000,
}

// ============================================================
// computeDiff
// ============================================================

describe('computeDiff', () => {
  it('returns 0 rows for two empty strings', () => {
    const result = computeDiff('', '', defaultOpts)
    expect(result.rows).toHaveLength(0)
    expect(result.stats.additions).toBe(0)
    expect(result.stats.deletions).toBe(0)
    expect(result.oldNoNewline).toBe(true)
    expect(result.newNoNewline).toBe(true)
  })

  it('returns all context rows when old and new are identical', () => {
    const code = 'line1\nline2\nline3\n'
    const result = computeDiff(code, code, defaultOpts)
    expect(result.rows).toHaveLength(3)
    result.rows.forEach((row) => {
      expect(row.type).toBe('context')
      expect(row.left).not.toBeNull()
      expect(row.right).not.toBeNull()
      expect(row.left!.content).toBe(row.right!.content)
    })
    expect(result.stats.additions).toBe(0)
    expect(result.stats.deletions).toBe(0)
  })

  it('assigns correct line numbers for context rows', () => {
    const code = 'a\nb\nc\n'
    const result = computeDiff(code, code, defaultOpts)
    expect(result.rows[0].left!.lineNumber).toBe(1)
    expect(result.rows[1].left!.lineNumber).toBe(2)
    expect(result.rows[2].left!.lineNumber).toBe(3)
    expect(result.rows[0].right!.lineNumber).toBe(1)
    expect(result.rows[2].right!.lineNumber).toBe(3)
  })

  it('detects pure additions (new lines added)', () => {
    const old = 'a\nb\n'
    const newCode = 'a\nb\nc\nd\n'
    const result = computeDiff(old, newCode, defaultOpts)
    const addedRows = result.rows.filter((r) => r.type === 'added')
    expect(addedRows).toHaveLength(2)
    expect(addedRows[0].right!.content).toBe('c')
    expect(addedRows[0].left).toBeNull()
    expect(addedRows[1].right!.content).toBe('d')
    expect(result.stats.additions).toBe(2)
  })

  it('detects pure removals (lines deleted)', () => {
    const old = 'a\nb\nc\n'
    const newCode = 'a\n'
    const result = computeDiff(old, newCode, defaultOpts)
    const removedRows = result.rows.filter((r) => r.type === 'removed')
    expect(removedRows).toHaveLength(2)
    expect(removedRows[0].left!.content).toBe('b')
    expect(removedRows[0].right).toBeNull()
    expect(removedRows[1].left!.content).toBe('c')
    expect(result.stats.deletions).toBe(2)
  })

  it('emits removed+added lines separately with inline parts', () => {
    const old = 'const x = 1\n'
    const newCode = 'const x = 2\n'
    const result = computeDiff(old, newCode, defaultOpts)
    expect(result.rows).toHaveLength(2)
    const removedRow = result.rows[0]
    const addedRow = result.rows[1]
    expect(removedRow.type).toBe('removed')
    expect(addedRow.type).toBe('added')
    expect(removedRow.left).not.toBeNull()
    expect(addedRow.right).not.toBeNull()

    // Inline parts should distinguish "1" vs "2"
    const oldParts = removedRow.left!.parts
    const newParts = addedRow.right!.parts
    expect(oldParts.some((p) => p.type === 'removed')).toBe(true)
    expect(newParts.some((p) => p.type === 'added')).toBe(true)
    // Normal parts should exist (the "const x = " prefix)
    expect(oldParts.some((p) => p.type === 'normal')).toBe(true)
    expect(newParts.some((p) => p.type === 'normal')).toBe(true)
  })

  it('produces only normal parts when inline diff is disabled', () => {
    const old = 'const x = 1\n'
    const newCode = 'const x = 2\n'
    const result = computeDiff(old, newCode, {
      ...defaultOpts,
      inlineDiffEnabled: false,
    })
    const removedRow = result.rows[0]
    expect(removedRow.type).toBe('removed')
    expect(removedRow.left!.parts.every((p) => p.type === 'normal')).toBe(true)
    const addedRow = result.rows[1]
    expect(addedRow.type).toBe('added')
    expect(addedRow.right!.parts.every((p) => p.type === 'normal')).toBe(true)
  })

  it('handles \r\n line endings', () => {
    const old = 'line1\r\nline2\r\n'
    const newCode = 'line1\r\nline3\r\n'
    const result = computeDiff(old, newCode, defaultOpts)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].type).toBe('context')
    expect(result.rows[0].left!.content).toBe('line1')
    expect(result.rows[1].type).toBe('removed')
    expect(result.rows[1].left!.content).toBe('line2')
    expect(result.rows[2].type).toBe('added')
    expect(result.rows[2].right!.content).toBe('line3')
  })

  it('marks noNewline flag when old text has no trailing newline', () => {
    const old = 'a\nb' // no trailing \n
    const newCode = 'a\nb\n'
    const result = computeDiff(old, newCode, defaultOpts)
    expect(result.oldNoNewline).toBe(true)
    expect(result.newNoNewline).toBe(false)
    // The last row with a left side should have noNewline set
    const lastLeftRow = [...result.rows].reverse().find((r) => r.left)
    expect(lastLeftRow!.left!.noNewline).toBe(true)
  })

  it('marks noNewline flag when new text has no trailing newline', () => {
    const old = 'a\nb\n'
    const newCode = 'a\nb' // no trailing \n
    const result = computeDiff(old, newCode, defaultOpts)
    expect(result.oldNoNewline).toBe(false)
    expect(result.newNoNewline).toBe(true)
    const lastRightRow = [...result.rows].reverse().find((r) => r.right)
    expect(lastRightRow!.right!.noNewline).toBe(true)
  })

  it('counts additions and deletions correctly for mixed changes', () => {
    const old = 'a\nb\nc\nd\n'
    const newCode = 'a\nX\nc\nY\n'
    const result = computeDiff(old, newCode, defaultOpts)
    // b→X is modified (1 add + 1 del), d→Y is modified (1 add + 1 del)
    expect(result.stats.additions).toBe(2)
    expect(result.stats.deletions).toBe(2)
  })

  it('handles asymmetric removed+added pairs (more removed than added)', () => {
    const old = 'a\nb\nc\n'
    const newCode = 'a\nx\n'
    const result = computeDiff(old, newCode, defaultOpts)
    // b→x: removed then added, c: removed only
    const removed = result.rows.filter((r) => r.type === 'removed')
    const added = result.rows.filter((r) => r.type === 'added')
    expect(removed.length).toBeGreaterThanOrEqual(2)
    expect(added.length).toBeGreaterThanOrEqual(1)
    expect(result.stats.deletions).toBeGreaterThanOrEqual(2)
  })

  it('respects inlineDiffLineLimit to disable inline diff for large inputs', () => {
    const old = 'const x = 1\n'
    const newCode = 'const x = 2\n'
    // changed lines = 2 (1 removed + 1 added), limit = 1 → inline disabled
    const result = computeDiff(old, newCode, {
      ...defaultOpts,
      inlineDiffLineLimit: 1,
    })
    const removedRow = result.rows[0]
    expect(removedRow.type).toBe('removed')
    expect(removedRow.left!.parts.every((p) => p.type === 'normal')).toBe(true)
  })

  it('respects inlineDiffCharLimit to disable inline diff for long lines', () => {
    const old = 'const x = 11111111111\n' // 20 chars
    const newCode = 'const x = 22222222222\n'
    // char limit = 5 → each line exceeds → inline disabled
    const result = computeDiff(old, newCode, {
      ...defaultOpts,
      inlineDiffCharLimit: 5,
    })
    const removedRow = result.rows[0]
    expect(removedRow.type).toBe('removed')
    expect(removedRow.left!.parts.every((p) => p.type === 'normal')).toBe(true)
  })
})

// ============================================================
// findChangeBlocks
// ============================================================

describe('findChangeBlocks', () => {
  it('returns empty array when all rows are context', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'a', parts: [] }, right: { lineNumber: 1, content: 'a', parts: [] } },
      { type: 'context', left: { lineNumber: 2, content: 'b', parts: [] }, right: { lineNumber: 2, content: 'b', parts: [] } },
    ]
    expect(findChangeBlocks(rows)).toEqual([])
  })

  it('finds a single contiguous change block', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'a', parts: [] }, right: { lineNumber: 1, content: 'a', parts: [] } },
      { type: 'added', left: null, right: { lineNumber: 2, content: 'b', parts: [] } },
      { type: 'added', left: null, right: { lineNumber: 3, content: 'c', parts: [] } },
      { type: 'context', left: { lineNumber: 2, content: 'd', parts: [] }, right: { lineNumber: 4, content: 'd', parts: [] } },
    ]
    const blocks = findChangeBlocks(rows)
    expect(blocks).toEqual([{ startIndex: 1, endIndex: 2 }])
  })

  it('finds multiple separate change blocks', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'a', parts: [] }, right: { lineNumber: 1, content: 'a', parts: [] } },
      { type: 'added', left: null, right: { lineNumber: 2, content: 'b', parts: [] } },
      { type: 'context', left: { lineNumber: 2, content: 'c', parts: [] }, right: { lineNumber: 3, content: 'c', parts: [] } },
      { type: 'removed', left: { lineNumber: 3, content: 'd', parts: [] }, right: null },
    ]
    const blocks = findChangeBlocks(rows)
    expect(blocks).toEqual([
      { startIndex: 1, endIndex: 1 },
      { startIndex: 3, endIndex: 3 },
    ])
  })

  it('handles all-change rows as one block', () => {
    const rows: DiffRow[] = [
      { type: 'added', left: null, right: { lineNumber: 1, content: 'a', parts: [] } },
      { type: 'removed', left: { lineNumber: 1, content: 'b', parts: [] }, right: null },
    ]
    const blocks = findChangeBlocks(rows)
    expect(blocks).toEqual([{ startIndex: 0, endIndex: 1 }])
  })
})

// ============================================================
// buildVisibleRows
// ============================================================

describe('buildVisibleRows', () => {
  function makeContextRows(n: number): DiffRow[] {
    return Array.from({ length: n }, (_, i) => ({
      type: 'context' as const,
      left: { lineNumber: i + 1, content: `line${i}`, parts: [] },
      right: { lineNumber: i + 1, content: `line${i}`, parts: [] },
    }))
  }

  it('returns all rows when showDiffOnly is false', () => {
    const rows = makeContextRows(5)
    const visible = buildVisibleRows(rows, false, 3, new Set())
    expect(visible).toHaveLength(5)
    expect(visible.every((r) => r.kind === 'row')).toBe(true)
  })

  it('returns all rows when there are no changes (showDiffOnly true)', () => {
    const rows = makeContextRows(5)
    const visible = buildVisibleRows(rows, true, 3, new Set())
    expect(visible).toHaveLength(5)
  })

  it('collapses unchanged context outside the context window', () => {
    // 10 rows, row index 5 is a change
    const rows: DiffRow[] = makeContextRows(10)
    rows[5] = { type: 'added', left: null, right: { lineNumber: 6, content: 'NEW', parts: [] } }

    const visible = buildVisibleRows(rows, true, 1, new Set())
    // context=1: visible indices = {4,5,6} → rows 0-3 collapsed, 4-6 visible, 7-9 collapsed
    const collapsed = visible.filter((r) => r.kind === 'collapsed')
    const rowKind = visible.filter((r) => r.kind === 'row')
    expect(collapsed.length).toBe(2)
    expect(rowKind.length).toBe(3)
    expect(collapsed[0].count).toBe(4) // rows 0-3
    expect(collapsed[1].count).toBe(3) // rows 7-9
  })

  it('expands collapsed sections when sectionId is in expandedSections', () => {
    const rows: DiffRow[] = makeContextRows(10)
    rows[5] = { type: 'added', left: null, right: { lineNumber: 6, content: 'NEW', parts: [] } }

    const visible = buildVisibleRows(rows, true, 1, new Set([0]))
    // section 0 (rows 0-3) is expanded
    const collapsed = visible.filter((r) => r.kind === 'collapsed')
    const rowKind = visible.filter((r) => r.kind === 'row')
    expect(collapsed.length).toBe(1) // only section 1 (rows 7-9) still collapsed
    expect(collapsed[0].count).toBe(3)
    expect(rowKind.length).toBe(7) // 4 expanded + 3 visible
  })

  it('does not collapse when context window covers entire file', () => {
    const rows: DiffRow[] = makeContextRows(3)
    rows[1] = { type: 'added', left: null, right: { lineNumber: 2, content: 'NEW', parts: [] } }

    const visible = buildVisibleRows(rows, true, 5, new Set())
    expect(visible.every((r) => r.kind === 'row')).toBe(true)
    expect(visible).toHaveLength(3)
  })

  it('preserves originalIndex in row kind', () => {
    const rows: DiffRow[] = makeContextRows(3)
    const visible = buildVisibleRows(rows, false, 3, new Set())
    expect((visible[0] as { originalIndex: number }).originalIndex).toBe(0)
    expect((visible[2] as { originalIndex: number }).originalIndex).toBe(2)
  })
})

// ============================================================
// computeSearchMatches
// ============================================================

describe('computeSearchMatches', () => {
  it('returns empty for empty query', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'hello world', parts: [] }, right: { lineNumber: 1, content: 'hello world', parts: [] } },
    ]
    expect(computeSearchMatches(rows, '', false)).toEqual([])
  })

  it('finds matches on left and right sides', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'foo bar', parts: [] }, right: { lineNumber: 1, content: 'foo baz', parts: [] } },
    ]
    const matches = computeSearchMatches(rows, 'foo', false)
    expect(matches).toHaveLength(2) // left + right
    expect(matches[0].side).toBe('left')
    expect(matches[1].side).toBe('right')
    expect(matches[0].start).toBe(0)
    expect(matches[0].end).toBe(3)
  })

  it('finds multiple matches on the same line', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'a_a_a', parts: [] }, right: null },
    ]
    const matches = computeSearchMatches(rows, 'a', false)
    expect(matches).toHaveLength(3)
    expect(matches[0].start).toBe(0)
    expect(matches[1].start).toBe(2)
    expect(matches[2].start).toBe(4)
  })

  it('respects caseSensitive=false (case-insensitive)', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'Hello HELLO', parts: [] }, right: null },
    ]
    const matches = computeSearchMatches(rows, 'hello', false)
    expect(matches).toHaveLength(2)
  })

  it('respects caseSensitive=true (case-sensitive)', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'Hello HELLO', parts: [] }, right: null },
    ]
    const matches = computeSearchMatches(rows, 'hello', true)
    expect(matches).toHaveLength(0)
  })

  it('matches across multiple rows', () => {
    const rows: DiffRow[] = [
      { type: 'context', left: { lineNumber: 1, content: 'foo', parts: [] }, right: { lineNumber: 1, content: 'foo', parts: [] } },
      { type: 'context', left: { lineNumber: 2, content: 'bar', parts: [] }, right: { lineNumber: 2, content: 'foo', parts: [] } },
    ]
    const matches = computeSearchMatches(rows, 'foo', false)
    expect(matches).toHaveLength(3) // row0 left, row0 right, row1 right
    expect(matches[0].rowIndex).toBe(0)
    expect(matches[2].rowIndex).toBe(1)
  })
})

// ============================================================
// computePreviewSearchMatches
// ============================================================

describe('computePreviewSearchMatches', () => {
  it('returns empty for empty query', () => {
    expect(computePreviewSearchMatches(['hello world'], '', false)).toEqual([])
  })

  it('returns empty for empty lines array', () => {
    expect(computePreviewSearchMatches([], 'foo', false)).toEqual([])
  })

  it('finds a single match on a single line', () => {
    const matches = computePreviewSearchMatches(['hello world'], 'world', false)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ rowIndex: 0, side: 'right', start: 6, end: 11 })
  })

  it('finds multiple matches on the same line', () => {
    const matches = computePreviewSearchMatches(['a_a_a'], 'a', false)
    expect(matches).toHaveLength(3)
    expect(matches[0].start).toBe(0)
    expect(matches[1].start).toBe(2)
    expect(matches[2].start).toBe(4)
  })

  it('finds matches across multiple lines', () => {
    const matches = computePreviewSearchMatches(['foo bar', 'baz foo', 'qux'], 'foo', false)
    expect(matches).toHaveLength(2)
    expect(matches[0].rowIndex).toBe(0)
    expect(matches[0].start).toBe(0)
    expect(matches[1].rowIndex).toBe(1)
    expect(matches[1].start).toBe(4)
  })

  it('is case-insensitive by default', () => {
    const matches = computePreviewSearchMatches(['Hello HELLO'], 'hello', false)
    expect(matches).toHaveLength(2)
  })

  it('respects caseSensitive=true', () => {
    const matches = computePreviewSearchMatches(['Hello HELLO'], 'hello', true)
    expect(matches).toHaveLength(0)
  })

  it('respects caseSensitive=true with correct case', () => {
    const matches = computePreviewSearchMatches(['Hello HELLO'], 'Hello', true)
    expect(matches).toHaveLength(1)
    expect(matches[0].start).toBe(0)
  })

  it('always reports side as right', () => {
    const matches = computePreviewSearchMatches(['foo foo'], 'foo', false)
    expect(matches).toHaveLength(2)
    expect(matches.every((m) => m.side === 'right')).toBe(true)
  })

  it('handles empty lines within the array', () => {
    const matches = computePreviewSearchMatches(['foo', '', 'foo'], 'foo', false)
    expect(matches).toHaveLength(2)
    expect(matches[0].rowIndex).toBe(0)
    expect(matches[1].rowIndex).toBe(2)
  })

  it('handles overlapping query gracefully (non-overlapping search)', () => {
    // 'aaa' searching 'aa' should find 1 match (indexOf advances past consumed chars)
    const matches = computePreviewSearchMatches(['aaa'], 'aa', false)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ rowIndex: 0, side: 'right', start: 0, end: 2 })
  })
})
