import type { FlatToken, InlinePart, TextSegment, SearchMatch } from './types'

interface Range {
  start: number
  end: number
}

export function mergeSegments(
  text: string,
  tokens: FlatToken[],
  diffParts: InlinePart[],
  matches: SearchMatch[],
  currentMatchIdx: number,
  side: 'left' | 'right',
  rowIndex: number
): TextSegment[] {
  const boundaries = new Set<number>([0, text.length])

  const tokenRanges: Array<Range & { className: string }> = []
  let pos = 0
  for (const token of tokens) {
    const start = pos
    const end = pos + token.text.length
    tokenRanges.push({ start, end, className: token.className })
    boundaries.add(start)
    boundaries.add(end)
    pos = end
  }

  const diffRanges: Array<Range & { type: 'normal' | 'added' | 'removed' }> = []
  pos = 0
  for (const part of diffParts) {
    const start = pos
    const end = pos + part.value.length
    diffRanges.push({ start, end, type: part.type })
    boundaries.add(start)
    boundaries.add(end)
    pos = end
  }

  const rowMatches: Array<Range & { matchIdx: number }> = []
  for (let mi = 0; mi < matches.length; mi++) {
    const m = matches[mi]
    if (m.rowIndex === rowIndex && m.side === side) {
      rowMatches.push({ start: m.start, end: m.end, matchIdx: mi })
      boundaries.add(m.start)
      boundaries.add(m.end)
    }
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b)
  const segments: TextSegment[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (start >= end) continue

    const segText = text.slice(start, end)

    let syntaxClass = ''
    for (const tr of tokenRanges) {
      if (start >= tr.start && end <= tr.end) {
        syntaxClass = tr.className
        break
      }
    }

    let diffType: 'normal' | 'added' | 'removed' = 'normal'
    for (const dr of diffRanges) {
      if (start >= dr.start && end <= dr.end) {
        diffType = dr.type
        break
      }
    }

    let searchMatch = false
    let searchCurrent = false
    for (const rm of rowMatches) {
      if (start >= rm.start && end <= rm.end) {
        searchMatch = true
        if (rm.matchIdx === currentMatchIdx) {
          searchCurrent = true
        }
        break
      }
    }

    segments.push({ text: segText, syntaxClass, diffType, searchMatch, searchCurrent })
  }

  return segments
}
