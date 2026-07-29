import { diffLines, diffWordsWithSpace } from 'diff'
import type { DiffRow, DiffSide, DiffStats, InlinePart, DisplayRow, SearchMatch } from './types'

interface DiffChange {
  value: string
  added: boolean
  removed: boolean
  count: number
}

export interface DiffResult {
  rows: DiffRow[]
  stats: DiffStats
  oldNoNewline: boolean
  newNoNewline: boolean
}

export interface DiffOptions {
  inlineDiffEnabled: boolean
  inlineDiffLineLimit: number
  inlineDiffCharLimit: number
}

function normalize(text: string): { lines: string[]; noTrailingNewline: boolean } {
  if (text === '') return { lines: [], noTrailingNewline: true }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const noTrailingNewline = !normalized.endsWith('\n')
  const lines = normalized.split('\n')
  if (!noTrailingNewline && lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return { lines, noTrailingNewline }
}

function splitChangeValue(value: string): string[] {
  if (value === '') return []
  const lines = value.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

function computeInlineDiff(
  oldLine: string,
  newLine: string
): { old: InlinePart[]; new: InlinePart[] } {
  const changes = diffWordsWithSpace(oldLine, newLine) as DiffChange[]
  const oldParts: InlinePart[] = []
  const newParts: InlinePart[] = []

  for (const change of changes) {
    if (change.added) {
      newParts.push({ value: change.value, type: 'added' })
    } else if (change.removed) {
      oldParts.push({ value: change.value, type: 'removed' })
    } else {
      oldParts.push({ value: change.value, type: 'normal' })
      newParts.push({ value: change.value, type: 'normal' })
    }
  }

  return { old: oldParts, new: newParts }
}

function makeSide(lineNumber: number, content: string, parts?: InlinePart[]): DiffSide {
  return {
    lineNumber,
    content,
    parts: parts ?? [{ value: content, type: 'normal' as const }],
  }
}

export function computeDiff(oldText: string, newText: string, options: DiffOptions): DiffResult {
  const oldNorm = normalize(oldText)
  const newNorm = normalize(newText)

  const oldStr = oldNorm.lines.join('\n') + (oldNorm.noTrailingNewline ? '' : '\n')
  const newStr = newNorm.lines.join('\n') + (newNorm.noTrailingNewline ? '' : '\n')

  const changes = diffLines(oldStr, newStr, { oneChangePerToken: false }) as DiffChange[]

  const rows: DiffRow[] = []
  let oldLineNum = 0
  let newLineNum = 0
  let additions = 0
  let deletions = 0

  let changedLines = 0
  for (const ch of changes) {
    if (ch.added || ch.removed) changedLines += ch.count
  }
  const inlineEnabled =
    options.inlineDiffEnabled && changedLines <= options.inlineDiffLineLimit

  let i = 0
  while (i < changes.length) {
    const change = changes[i]

    if (!change.added && !change.removed) {
      const lines = splitChangeValue(change.value)
      for (const line of lines) {
        oldLineNum++
        newLineNum++
        rows.push({
          type: 'context',
          left: makeSide(oldLineNum, line),
          right: makeSide(newLineNum, line),
        })
      }
      i++
    } else if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
      const removedLines = splitChangeValue(change.value)
      const addedLines = splitChangeValue(changes[i + 1].value)

      // Emit all removed lines first (grouped together)
      for (let j = 0; j < removedLines.length; j++) {
        oldLineNum++
        const canInline =
          inlineEnabled &&
          j < addedLines.length &&
          removedLines[j].length <= options.inlineDiffCharLimit &&
          addedLines[j].length <= options.inlineDiffCharLimit
        const inline = canInline
          ? computeInlineDiff(removedLines[j], addedLines[j])
          : null
        rows.push({
          type: 'removed',
          left: makeSide(oldLineNum, removedLines[j], inline?.old),
          right: null,
        })
        deletions++
      }

      // Then emit all added lines (grouped together)
      for (let j = 0; j < addedLines.length; j++) {
        newLineNum++
        const canInline =
          inlineEnabled &&
          j < removedLines.length &&
          removedLines[j].length <= options.inlineDiffCharLimit &&
          addedLines[j].length <= options.inlineDiffCharLimit
        const inline = canInline
          ? computeInlineDiff(removedLines[j], addedLines[j])
          : null
        rows.push({
          type: 'added',
          left: null,
          right: makeSide(newLineNum, addedLines[j], inline?.new),
        })
        additions++
      }
      i += 2
    } else if (change.removed) {
      const lines = splitChangeValue(change.value)
      for (const line of lines) {
        oldLineNum++
        rows.push({
          type: 'removed',
          left: makeSide(oldLineNum, line),
          right: null,
        })
        deletions++
      }
      i++
    } else {
      const lines = splitChangeValue(change.value)
      for (const line of lines) {
        newLineNum++
        rows.push({
          type: 'added',
          left: null,
          right: makeSide(newLineNum, line),
        })
        additions++
      }
      i++
    }
  }

  if (oldNorm.noTrailingNewline) {
    for (let r = rows.length - 1; r >= 0; r--) {
      if (rows[r].left) {
        rows[r].left!.noNewline = true
        break
      }
    }
  }
  if (newNorm.noTrailingNewline) {
    for (let r = rows.length - 1; r >= 0; r--) {
      if (rows[r].right) {
        rows[r].right!.noNewline = true
        break
      }
    }
  }

  return {
    rows,
    stats: { additions, deletions },
    oldNoNewline: oldNorm.noTrailingNewline,
    newNoNewline: newNorm.noTrailingNewline,
  }
}

export function findChangeBlocks(
  rows: DiffRow[]
): Array<{ startIndex: number; endIndex: number }> {
  const blocks: Array<{ startIndex: number; endIndex: number }> = []
  let i = 0
  while (i < rows.length) {
    if (rows[i].type !== 'context') {
      const start = i
      while (i < rows.length && rows[i].type !== 'context') {
        i++
      }
      blocks.push({ startIndex: start, endIndex: i - 1 })
    } else {
      i++
    }
  }
  return blocks
}

export function buildVisibleRows(
  rows: DiffRow[],
  showDiffOnly: boolean,
  contextLines: number,
  expandedSections: Set<number>
): DisplayRow[] {
  if (!showDiffOnly || rows.length === 0) {
    return rows.map((row, idx) => ({ kind: 'row' as const, row, originalIndex: idx }))
  }

  const changeIndices = new Set<number>()
  rows.forEach((row, idx) => {
    if (row.type !== 'context') changeIndices.add(idx)
  })

  if (changeIndices.size === 0) {
    return rows.map((row, idx) => ({ kind: 'row' as const, row, originalIndex: idx }))
  }

  const visibleIndices = new Set<number>()
  for (const idx of changeIndices) {
    const start = Math.max(0, idx - contextLines)
    const end = Math.min(rows.length - 1, idx + contextLines)
    for (let j = start; j <= end; j++) {
      visibleIndices.add(j)
    }
  }

  const result: DisplayRow[] = []
  let sectionId = 0
  let i = 0
  while (i < rows.length) {
    if (visibleIndices.has(i)) {
      result.push({ kind: 'row', row: rows[i], originalIndex: i })
      i++
    } else {
      let end = i
      while (end < rows.length && !visibleIndices.has(end)) {
        end++
      }
      if (expandedSections.has(sectionId)) {
        for (let j = i; j < end; j++) {
          result.push({ kind: 'row', row: rows[j], originalIndex: j })
        }
      } else {
        result.push({ kind: 'collapsed', count: end - i, sectionId })
      }
      sectionId++
      i = end
    }
  }

  return result
}

export function computeSearchMatches(
  rows: DiffRow[],
  query: string,
  caseSensitive: boolean
): SearchMatch[] {
  if (!query) return []
  const searchStr = caseSensitive ? query : query.toLowerCase()
  const matches: SearchMatch[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    if (row.left) {
      const content = caseSensitive ? row.left.content : row.left.content.toLowerCase()
      let idx = 0
      while ((idx = content.indexOf(searchStr, idx)) !== -1) {
        matches.push({ rowIndex: i, side: 'left', start: idx, end: idx + searchStr.length })
        idx += searchStr.length
      }
    }

    if (row.right) {
      const content = caseSensitive ? row.right.content : row.right.content.toLowerCase()
      let idx = 0
      while ((idx = content.indexOf(searchStr, idx)) !== -1) {
        matches.push({ rowIndex: i, side: 'right', start: idx, end: idx + searchStr.length })
        idx += searchStr.length
      }
    }
  }

  return matches
}

export function computePreviewSearchMatches(
  lines: string[],
  query: string,
  caseSensitive: boolean
): SearchMatch[] {
  if (!query) return []
  const searchStr = caseSensitive ? query : query.toLowerCase()
  const matches: SearchMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    const content = caseSensitive ? lines[i] : lines[i].toLowerCase()
    let idx = 0
    while ((idx = content.indexOf(searchStr, idx)) !== -1) {
      matches.push({ rowIndex: i, side: 'right' as const, start: idx, end: idx + searchStr.length })
      idx += searchStr.length
    }
  }

  return matches
}
