import { describe, it, expect } from 'vitest'
import { mergeSegments } from '../code-diff/segment-merger'
import type { FlatToken, InlinePart, SearchMatch } from '../code-diff/types'

// ============================================================
// mergeSegments — the core "three-dimensional range intersection" engine
// ============================================================

describe('mergeSegments', () => {
  it('returns a single normal segment when no tokens, no diff parts, no matches', () => {
    const text = 'hello'
    const segments = mergeSegments(text, [], [], [], -1, 'right', 0)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('hello')
    expect(segments[0].syntaxClass).toBe('')
    expect(segments[0].diffType).toBe('normal')
    expect(segments[0].searchMatch).toBe(false)
    expect(segments[0].searchCurrent).toBe(false)
  })

  it('splits by syntax tokens only (no diff, no search)', () => {
    const text = 'const x'
    // Two tokens: "const " (keyword) and "x" (function)
    const tokens: FlatToken[] = [
      { text: 'const ', className: 'token keyword' },
      { text: 'x', className: 'token function' },
    ]
    const segments = mergeSegments(text, tokens, [], [], -1, 'right', 0)
    // Should reconstruct the full text
    expect(segments.map((s) => s.text).join('')).toBe('const x')
    // First segment should have keyword class
    expect(segments[0].syntaxClass).toBe('token keyword')
    // Last segment should have function class
    const last = segments[segments.length - 1]
    expect(last.syntaxClass).toBe('token function')
    expect(last.text).toBe('x')
    // All diffType normal
    expect(segments.every((s) => s.diffType === 'normal')).toBe(true)
  })

  it('splits by diff parts only (no syntax, no search)', () => {
    const text = 'abc'
    const diffParts: InlinePart[] = [
      { value: 'a', type: 'normal' },
      { value: 'b', type: 'added' },
      { value: 'c', type: 'normal' },
    ]
    const segments = mergeSegments(text, [], diffParts, [], -1, 'right', 0)
    expect(segments.map((s) => s.text).join('')).toBe('abc')
    expect(segments[0]).toMatchObject({ text: 'a', diffType: 'normal' })
    expect(segments[1]).toMatchObject({ text: 'b', diffType: 'added' })
    expect(segments[2]).toMatchObject({ text: 'c', diffType: 'normal' })
  })

  it('splits by search matches only (no syntax, no diff)', () => {
    const text = 'hello world hello'
    const matches: SearchMatch[] = [
      { rowIndex: 0, side: 'right', start: 0, end: 5 },
      { rowIndex: 0, side: 'right', start: 12, end: 17 },
    ]
    // currentMatch = 0 → first match is current
    const segments = mergeSegments(text, [], [], matches, 0, 'right', 0)
    // Should produce segments: [hello][ space world ][hello]
    const matchSegs = segments.filter((s) => s.searchMatch)
    expect(matchSegs).toHaveLength(2)
    const currentSegs = segments.filter((s) => s.searchCurrent)
    expect(currentSegs).toHaveLength(1)
    expect(currentSegs[0].text).toBe('hello')
    // Full text reconstruction
    expect(segments.map((s) => s.text).join('')).toBe('hello world hello')
  })

  it('combines syntax + diff (overlapping boundaries)', () => {
    // Text: "x = 1"
    // Tokens: "x" (function), " = " (punctuation), "1" (number)
    // Diff: "1" is added (from "x = " to "x = 1")
    const text = 'x = 1'
    const tokens: FlatToken[] = [
      { text: 'x', className: 'token function' },
      { text: ' = ', className: 'token operator' },
      { text: '1', className: 'token number' },
    ]
    const diffParts: InlinePart[] = [
      { value: 'x = ', type: 'normal' },
      { value: '1', type: 'added' },
    ]
    const segments = mergeSegments(text, tokens, diffParts, [], -1, 'right', 0)
    // Full reconstruction
    expect(segments.map((s) => s.text).join('')).toBe('x = 1')
    // The "1" segment should have both number syntax AND added diff type
    const oneSeg = segments.find((s) => s.text === '1')
    expect(oneSeg).toBeDefined()
    expect(oneSeg!.syntaxClass).toBe('token number')
    expect(oneSeg!.diffType).toBe('added')
  })

  it('combines all three: syntax + diff + search on the same region', () => {
    const text = 'foo'
    // Token: "foo" keyword
    const tokens: FlatToken[] = [{ text: 'foo', className: 'token keyword' }]
    // Diff: "foo" is added
    const diffParts: InlinePart[] = [{ value: 'foo', type: 'added' }]
    // Search: match on "foo"
    const matches: SearchMatch[] = [{ rowIndex: 0, side: 'right', start: 0, end: 3 }]
    const segments = mergeSegments(text, tokens, diffParts, matches, 0, 'right', 0)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('foo')
    expect(segments[0].syntaxClass).toBe('token keyword')
    expect(segments[0].diffType).toBe('added')
    expect(segments[0].searchMatch).toBe(true)
    expect(segments[0].searchCurrent).toBe(true)
  })

  it('marks only the current match as searchCurrent', () => {
    const text = 'aa aa'
    const matches: SearchMatch[] = [
      { rowIndex: 0, side: 'right', start: 0, end: 2 },
      { rowIndex: 0, side: 'right', start: 3, end: 5 },
    ]
    // currentMatch = 1 → second match is current
    const segments = mergeSegments(text, [], [], matches, 1, 'right', 0)
    const matchSegs = segments.filter((s) => s.searchMatch)
    expect(matchSegs).toHaveLength(2)
    const currentSegs = segments.filter((s) => s.searchCurrent)
    expect(currentSegs).toHaveLength(1)
    expect(currentSegs[0].text).toBe('aa')
    // The current one should be the second occurrence (start at index 3)
    // Reconstruct and check position
    let pos = 0
    for (const seg of segments) {
      if (seg.searchCurrent) {
        expect(pos).toBe(3) // second "aa" starts at index 3
      }
      pos += seg.text.length
    }
  })

  it('ignores matches on different rows or sides', () => {
    const text = 'hello'
    const matches: SearchMatch[] = [
      { rowIndex: 5, side: 'right', start: 0, end: 5 }, // wrong row
      { rowIndex: 0, side: 'left', start: 0, end: 5 },  // wrong side
    ]
    const segments = mergeSegments(text, [], [], matches, 0, 'right', 0)
    // No matches should apply
    expect(segments.every((s) => !s.searchMatch)).toBe(true)
  })

  it('handles empty text', () => {
    const segments = mergeSegments('', [], [], [], -1, 'right', 0)
    expect(segments).toHaveLength(0)
  })

  it('handles empty tokens array with diff parts', () => {
    const text = 'abc'
    const diffParts: InlinePart[] = [{ value: 'abc', type: 'removed' }]
    const segments = mergeSegments(text, [], diffParts, [], -1, 'left', 0)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('abc')
    expect(segments[0].diffType).toBe('removed')
  })

  it('preserves full text reconstruction for complex inputs', () => {
    const text = 'const greet = (name) => `Hello, ${name}!`'
    // Just verify that no matter how we slice it, text reconstructs
    const tokens: FlatToken[] = [
      { text: 'const', className: 'token keyword' },
      { text: ' greet = ', className: 'token function' },
      { text: '(name)', className: 'token punctuation' },
      { text: ' => ', className: 'token operator' },
      { text: '`Hello, ${name}!`', className: 'token string' },
    ]
    const diffParts: InlinePart[] = [
      { value: 'const greet = (name) => ', type: 'normal' },
      { value: '`Hello, ${name}!`', type: 'added' },
    ]
    const segments = mergeSegments(text, tokens, diffParts, [], -1, 'right', 0)
    expect(segments.map((s) => s.text).join('')).toBe(text)
  })

  it('handles tokens and diff parts with misaligned boundaries', () => {
    // Token boundaries at 0,3,7; diff boundaries at 0,5,7
    // Text: "abcdefg" → token: "abc"(kw) "defg"(str); diff: "abcde"(normal) "fg"(removed)
    const text = 'abcdefg'
    const tokens: FlatToken[] = [
      { text: 'abc', className: 'token keyword' },
      { text: 'defg', className: 'token string' },
    ]
    const diffParts: InlinePart[] = [
      { value: 'abcde', type: 'normal' },
      { value: 'fg', type: 'removed' },
    ]
    const segments = mergeSegments(text, tokens, diffParts, [], -1, 'left', 0)
    expect(segments.map((s) => s.text).join('')).toBe('abcdefg')
    // At boundary 3-5: "de" is in keyword-token range AND normal-diff range
    // Actually "abc"(0-3) keyword, "de"(3-5) string, "fg"(5-7) string
    // Diff: "abcde"(0-5) normal, "fg"(5-7) removed
    // So segment "de"(3-5): syntaxClass=string, diffType=normal
    // segment "fg"(5-7): syntaxClass=string, diffType=removed
    const fgSeg = segments.find((s) => s.text === 'fg')
    expect(fgSeg).toBeDefined()
    expect(fgSeg!.syntaxClass).toBe('token string')
    expect(fgSeg!.diffType).toBe('removed')
  })

  it('returns no search flags when currentMatchIdx is -1 and there are matches', () => {
    const text = 'foo'
    const matches: SearchMatch[] = [{ rowIndex: 0, side: 'right', start: 0, end: 3 }]
    const segments = mergeSegments(text, [], [], matches, -1, 'right', 0)
    // With -1, searchMatch should still be true but searchCurrent false
    const fooSeg = segments.find((s) => s.text === 'foo')
    expect(fooSeg).toBeDefined()
    expect(fooSeg!.searchMatch).toBe(true)
    expect(fooSeg!.searchCurrent).toBe(false)
  })
})
