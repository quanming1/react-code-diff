import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type {
  CodeDiffProps,
  CodeDiffConfig,
  DiffRow,
  DiffSide,
  DiffStats,
  SearchMatch,
  TextSegment,
  InlinePart,
  ToolbarRenderProps,
} from './types'
import { computeDiff, findChangeBlocks, buildVisibleRows, computeSearchMatches } from './diff-engine'
import {
  highlightToLines,
  getTokenForLine,
} from './highlight-engine'
import { mergeSegments } from './segment-merger'
import { mergeConfig, colorsToCssVars } from './config-merger'
import './CodeDiff.css'

export function CodeDiff(props: CodeDiffProps) {
  const {
    oldValue,
    newValue,
    language = 'typescript',
    fileName,
    viewMode = 'split',
    theme = 'dark',
    showLineNumbers = true,
    showToolbar = true,
    showDiffOnly = true,
    contextLines = 3,
    wrapLines = false,
    highlightInlineChanges = true,
    className,
    style,
    maxHeight,
    config: partialConfig,
    splitRatio,
    onSplitRatioChange,
    resizableSplit = true,
    renderToolbar,
    onCopy,
    onLineClick,
    onSearchMatchChange,
    onDiffComputed,
  } = props

  const config: CodeDiffConfig = useMemo(
    () => mergeConfig(partialConfig),
    [partialConfig]
  )

  const diffResult = useMemo(
    () =>
      computeDiff(oldValue, newValue, {
        inlineDiffEnabled: highlightInlineChanges,
        inlineDiffLineLimit: config.diff.inlineDiffLineLimit,
        inlineDiffCharLimit: config.diff.inlineDiffCharLimit,
      }),
    [oldValue, newValue, highlightInlineChanges, config.diff.inlineDiffLineLimit, config.diff.inlineDiffCharLimit]
  )

  useEffect(() => {
    onDiffComputed?.(diffResult.stats)
  }, [diffResult.stats, onDiffComputed])

  const canHighlight = oldValue.length + newValue.length <= config.diff.highlightCharLimit
  const oldHighlight = useMemo(
    () => (canHighlight ? highlightToLines(oldValue, language) : null),
    [oldValue, language, canHighlight]
  )
  const newHighlight = useMemo(
    () => (canHighlight ? highlightToLines(newValue, language) : null),
    [newValue, language, canHighlight]
  )

  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())
  useEffect(() => {
    setExpandedSections(new Set())
  }, [oldValue, newValue, showDiffOnly, contextLines])

  const visibleRows = useMemo(
    () => buildVisibleRows(diffResult.rows, showDiffOnly, contextLines, expandedSections),
    [diffResult.rows, showDiffOnly, contextLines, expandedSections]
  )

  const changeBlocks = useMemo(
    () => findChangeBlocks(diffResult.rows),
    [diffResult.rows]
  )

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [currentMatch, setCurrentMatch] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchQuery)
      setCurrentMatch(0)
    }, config.search.debounceMs)
    return () => clearTimeout(t)
  }, [searchQuery, config.search.debounceMs])

  const matches = useMemo(
    () => computeSearchMatches(diffResult.rows, debouncedQuery, caseSensitive).slice(0, config.search.maxResults),
    [diffResult.rows, debouncedQuery, caseSensitive, config.search.maxResults]
  )

  useEffect(() => {
    if (onSearchMatchChange) {
      onSearchMatchChange(
        matches.length > 0 ? matches[currentMatch] ?? null : null,
        matches.length
      )
    }
  }, [currentMatch, matches, onSearchMatchChange])

  const [currentChange, setCurrentChange] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const navigateMatch = useCallback(
    (dir: 'prev' | 'next') => {
      if (matches.length === 0) return
      const next =
        dir === 'next'
          ? (currentMatch + 1) % matches.length
          : (currentMatch - 1 + matches.length) % matches.length
      setCurrentMatch(next)
    },
    [currentMatch, matches.length]
  )

  useEffect(() => {
    if (matches.length === 0) return
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-match-id='${currentMatch}']`
    )
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [currentMatch, matches.length])

  const navigateChange = useCallback(
    (dir: 'prev' | 'next') => {
      if (changeBlocks.length === 0) return
      const next =
        dir === 'next'
          ? (currentChange + 1) % changeBlocks.length
          : (currentChange - 1 + changeBlocks.length) % changeBlocks.length
      setCurrentChange(next)
      const block = changeBlocks[next]
      const el = scrollRef.current?.querySelector<HTMLElement>(
        `[data-row-index='${block.startIndex}']`
      )
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    },
    [currentChange, changeBlocks]
  )

  const [copied, setCopied] = useState<'old' | 'new' | null>(null)
  const handleCopy = useCallback(
    (which: 'old' | 'new') => {
      const text = which === 'old' ? oldValue : newValue
      const result = onCopy?.(which, text)
      if (result === false) return
      if (result !== true) {
        navigator.clipboard.writeText(text)
      }
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    },
    [oldValue, newValue, onCopy]
  )

  const toggleExpanded = useCallback((sectionId: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])

  // Split drag — direct DOM manipulation, no React re-render during drag
  const internalRatio = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const effectiveRatio = splitRatio ?? internalRatio.current ?? 0.5

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!resizableSplit || viewMode !== 'split' || draggingRef.current) return
      e.preventDefault()
      draggingRef.current = true

      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      el.setAttribute('data-dragging', 'true')
      const rootEl = rootRef.current
      if (!rootEl) return

      const onMove = (ev: PointerEvent) => {
        const rect = rootEl.getBoundingClientRect()
        const ratio = (ev.clientX - rect.left) / rect.width
        const clamped = Math.min(0.9, Math.max(0.1, ratio))
        rootEl.style.setProperty('--cd-split-basis', `${clamped * 100}%`)
        internalRatio.current = clamped
      }

      const cleanup = () => {
        draggingRef.current = false
        el.removeAttribute('data-dragging')
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', cleanup)
        el.removeEventListener('pointercancel', cleanup)
        cleanupRef.current = null
        if (onSplitRatioChange && internalRatio.current !== null) {
          onSplitRatioChange(internalRatio.current)
        }
      }

      cleanupRef.current = cleanup
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', cleanup)
      el.addEventListener('pointercancel', cleanup)
    },
    [resizableSplit, viewMode, onSplitRatioChange]
  )

  const colorVars = useMemo(
    () => colorsToCssVars(config.colors[theme]),
    [config.colors, theme]
  )

  const cssVars = {
    ...colorVars,
    '--cd-font-family': config.font.family,
    '--cd-font-size': `${config.font.size}px`,
    '--cd-line-height': `${config.font.lineHeight}px`,
    '--cd-border-radius': `${config.layout.borderRadius}px`,
    '--cd-gutter-min-width': config.layout.gutterMinWidth,
    '--cd-sign-min-width': config.layout.signMinWidth,
    '--cd-code-padding-right': `${config.layout.codePaddingRight}px`,
    '--cd-toolbar-height': `${config.layout.toolbarHeight}px`,
    '--cd-split-basis': `${effectiveRatio * 100}%`,
  }

  const mergedStyle: React.CSSProperties = {
    ...cssVars as React.CSSProperties,
    ...style,
    ...(maxHeight !== undefined
      ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
      : {}),
  }

  const handleRowClick = useCallback(
    (row: DiffRow, index: number) => {
      onLineClick?.(row, index)
    },
    [onLineClick]
  )

  const tb = config.toolbar

  const toolbarProps: ToolbarRenderProps = {
    fileName,
    language,
    stats: diffResult.stats,
    searchOpen,
    onToggleSearch: () => {
      setSearchOpen((v) => !v)
      if (!searchOpen) setTimeout(() => {
        const input = scrollRef.current?.closest('.cd-root')?.querySelector<HTMLInputElement>('.cd-search-input')
        input?.focus()
      }, 0)
    },
    onCopy: handleCopy,
    copied,
    changeCount: changeBlocks.length,
    onNavigateChange: navigateChange,
    config,
  }

  return (
    <div
      ref={rootRef}
      className={`cd-root ${className ?? ''}`}
      data-theme={theme}
      data-wrap={wrapLines}
      style={mergedStyle}
    >
      {showToolbar && (
        renderToolbar ? (
          <div className="cd-toolbar-custom">{renderToolbar(toolbarProps)}</div>
        ) : (
          <Toolbar
            fileName={fileName}
            language={language}
            stats={diffResult.stats}
            searchOpen={searchOpen}
            onToggleSearch={toolbarProps.onToggleSearch}
            onCopy={handleCopy}
            copied={copied}
            changeBlocks={changeBlocks}
            onNavigateChange={navigateChange}
            icons={config.icons}
            texts={config.texts}
            toolbarConfig={tb}
          />
        )
      )}
      {searchOpen && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          caseSensitive={caseSensitive}
          onToggleCase={() => setCaseSensitive((v) => !v)}
          matchCount={matches.length}
          currentIndex={matches.length > 0 ? currentMatch + 1 : 0}
          onPrev={() => navigateMatch('prev')}
          onNext={() => navigateMatch('next')}
          icons={config.icons}
          texts={config.texts}
        />
      )}
      <div className="cd-scroll" ref={scrollRef}>
        {diffResult.rows.length === 0 ? (
          <div className="cd-empty">{config.texts.noContent}</div>
        ) : (
          <div className={`cd-table ${viewMode === 'split' ? 'cd-split' : 'cd-unified'}`}>
            {visibleRows.map((dr) =>
              dr.kind === 'collapsed' ? (
                <div
                  key={`collapse-${dr.sectionId}`}
                  className="cd-collapse"
                  onClick={() => toggleExpanded(dr.sectionId)}
                >
                  {config.icons.collapse}
                  <span>{config.texts.showHidden.replace('{count}', String(dr.count))}</span>
                </div>
              ) : viewMode === 'split' ? (
                <SplitRow
                  key={`row-${dr.originalIndex}`}
                  row={dr.row}
                  rowIndex={dr.originalIndex}
                  showLineNumbers={showLineNumbers}
                  oldHighlight={oldHighlight}
                  newHighlight={newHighlight}
                  matches={matches}
                  currentMatch={currentMatch}
                  onRowClick={handleRowClick}
                />
              ) : (
                <UnifiedRow
                  key={`row-${dr.originalIndex}`}
                  row={dr.row}
                  rowIndex={dr.originalIndex}
                  showLineNumbers={showLineNumbers}
                  oldHighlight={oldHighlight}
                  newHighlight={newHighlight}
                  matches={matches}
                  currentMatch={currentMatch}
                  onRowClick={handleRowClick}
                />
              )
            )}
            {viewMode === 'split' && resizableSplit && (
              <div
                className="cd-split-handle"
                onPointerDown={onHandlePointerDown}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Toolbar ---

interface ToolbarProps {
  fileName?: string
  language: string
  stats: DiffStats
  searchOpen: boolean
  onToggleSearch: () => void
  onCopy: (which: 'old' | 'new') => void
  copied: 'old' | 'new' | null
  changeBlocks: Array<{ startIndex: number; endIndex: number }>
  onNavigateChange: (dir: 'prev' | 'next') => void
  icons: CodeDiffConfig['icons']
  texts: CodeDiffConfig['texts']
  toolbarConfig: CodeDiffConfig['toolbar']
}

function Toolbar(props: ToolbarProps) {
  const { tb } = { tb: props.toolbarConfig }
  return (
    <div className="cd-toolbar">
      <div className="cd-toolbar-left">
        <span className="cd-file-icon">{props.icons.file}</span>
        {tb.showFileName && props.fileName && (
          <span className="cd-file-name">{props.fileName}</span>
        )}
        {tb.showLanguage && <span className="cd-lang-tag">{props.language}</span>}
        {tb.showStats && (
          <div className="cd-stats">
            <span className="cd-stat-add">+{props.stats.additions}</span>
            <span className="cd-stat-del">-{props.stats.deletions}</span>
          </div>
        )}
      </div>
      <div className="cd-toolbar-right">
        {tb.showChangeNavigation && props.changeBlocks.length > 0 && (
          <>
            <button className="cd-btn" onClick={() => props.onNavigateChange('prev')} title="Previous change">
              {props.icons.chevronUp}
            </button>
            <span style={{ color: 'var(--cd-muted)', fontSize: '11px', padding: '0 4px' }}>
              {props.changeBlocks.length} {props.texts.changes}
            </span>
            <button className="cd-btn" onClick={() => props.onNavigateChange('next')} title="Next change">
              {props.icons.chevronDown}
            </button>
          </>
        )}
        {tb.showSearch && (
          <button className="cd-btn" onClick={props.onToggleSearch} data-active={props.searchOpen} title="Search">
            {props.icons.search}
          </button>
        )}
        {tb.showCopy && tb.showCopyOld && (
          <button className="cd-btn" onClick={() => props.onCopy('old')} title={props.texts.copyOld}>
            {props.copied === 'old' ? <span className="cd-copied">{props.icons.check}</span> : props.icons.copy}
          </button>
        )}
        {tb.showCopy && tb.showCopyNew && (
          <button className="cd-btn" onClick={() => props.onCopy('new')} title={props.texts.copyNew}>
            {props.copied === 'new' ? <span className="cd-copied">{props.icons.check}</span> : props.icons.copy}
          </button>
        )}
      </div>
    </div>
  )
}

// --- SearchBar ---

interface SearchBarProps {
  query: string
  onQueryChange: (v: string) => void
  caseSensitive: boolean
  onToggleCase: () => void
  matchCount: number
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  icons: CodeDiffConfig['icons']
  texts: CodeDiffConfig['texts']
}

function SearchBar(props: SearchBarProps) {
  return (
    <div className="cd-search-bar">
      <input
        className="cd-search-input"
        type="text"
        placeholder={props.texts.searchPlaceholder}
        value={props.query}
        onChange={(e) => props.onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) props.onPrev()
            else props.onNext()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            props.onQueryChange('')
          }
        }}
      />
      <button className="cd-btn" onClick={props.onToggleCase} data-active={props.caseSensitive} title="Case sensitive">
        {props.icons.caseSensitive}
      </button>
      <span className="cd-search-info">
        {props.matchCount > 0
          ? `${props.currentIndex}/${props.matchCount}`
          : props.query
            ? props.texts.noResults
            : ''}
      </span>
      <button className="cd-btn" onClick={props.onPrev} title="Previous match" disabled={props.matchCount === 0}>
        {props.icons.chevronUp}
      </button>
      <button className="cd-btn" onClick={props.onNext} title="Next match" disabled={props.matchCount === 0}>
        {props.icons.chevronDown}
      </button>
    </div>
  )
}

// --- Split Row ---

interface RowProps {
  row: DiffRow
  rowIndex: number
  showLineNumbers: boolean
  oldHighlight: ReturnType<typeof highlightToLines>
  newHighlight: ReturnType<typeof highlightToLines>
  matches: SearchMatch[]
  currentMatch: number
  onRowClick: (row: DiffRow, index: number) => void
}

function SplitRow(props: RowProps) {
  const { row, rowIndex, showLineNumbers, oldHighlight, newHighlight, matches, currentMatch, onRowClick } = props

  return (
    <div
      className="cd-row"
      data-type={row.type}
      data-row-index={rowIndex}
      onClick={() => onRowClick(row, rowIndex)}
    >
      <SideView
        side="left"
        rowType={row.type}
        diffSide={row.left}
        highlightLines={oldHighlight}
        lineNumber={row.left?.lineNumber ?? null}
        showLineNumbers={showLineNumbers}
        rowIndex={rowIndex}
        matches={matches}
        currentMatch={currentMatch}
      />
      <SideView
        side="right"
        rowType={row.type}
        diffSide={row.right}
        highlightLines={newHighlight}
        lineNumber={row.right?.lineNumber ?? null}
        showLineNumbers={showLineNumbers}
        rowIndex={rowIndex}
        matches={matches}
        currentMatch={currentMatch}
      />
    </div>
  )
}

// --- Unified Row ---

function UnifiedRow(props: RowProps) {
  const { row, rowIndex, showLineNumbers, oldHighlight, newHighlight, matches, currentMatch, onRowClick } = props

  if (row.type === 'modified' && row.left && row.right) {
    return (
      <>
        <div className="cd-row" data-type="removed" data-row-index={rowIndex} onClick={() => onRowClick(row, rowIndex)}>
          <SideView
            side="left"
            rowType="removed"
            diffSide={row.left}
            highlightLines={oldHighlight}
            lineNumber={row.left.lineNumber}
            showLineNumbers={showLineNumbers}
            rowIndex={rowIndex}
            matches={matches}
            currentMatch={currentMatch}
          />
        </div>
        <div className="cd-row" data-type="added">
          <SideView
            side="right"
            rowType="added"
            diffSide={row.right}
            highlightLines={newHighlight}
            lineNumber={row.right.lineNumber}
            showLineNumbers={showLineNumbers}
            rowIndex={rowIndex}
            matches={matches}
            currentMatch={currentMatch}
          />
        </div>
      </>
    )
  }

  const isRemoved = row.type === 'removed'
  const diffSide = isRemoved ? row.left : row.right
  const highlight = isRemoved ? oldHighlight : newHighlight
  const lineNumber = diffSide?.lineNumber ?? null
  const side: 'left' | 'right' = isRemoved ? 'left' : 'right'

  return (
    <div className="cd-row" data-type={row.type} data-row-index={rowIndex} onClick={() => onRowClick(row, rowIndex)}>
      <SideView
        side={side}
        rowType={row.type}
        diffSide={diffSide}
        highlightLines={highlight}
        lineNumber={lineNumber}
        showLineNumbers={showLineNumbers}
        rowIndex={rowIndex}
        matches={matches}
        currentMatch={currentMatch}
      />
    </div>
  )
}

// --- Side View ---

interface SideViewProps {
  side: 'left' | 'right'
  rowType: string
  diffSide: DiffSide | null
  highlightLines: ReturnType<typeof highlightToLines>
  lineNumber: number | null
  showLineNumbers: boolean
  rowIndex: number
  matches: SearchMatch[]
  currentMatch: number
}

function SideView(props: SideViewProps) {
  const { side, rowType, diffSide, highlightLines, lineNumber, showLineNumbers, rowIndex, matches, currentMatch } = props

  if (!diffSide) {
    return (
      <div className={`cd-side cd-side-${side}`}>
        {showLineNumbers && (
          <div className="cd-gutter">
            <span className="cd-line-num-empty">&nbsp;</span>
            <span className="cd-sign">&nbsp;</span>
          </div>
        )}
        <code className="cd-code">&nbsp;</code>
      </div>
    )
  }

  const lineIdx = (lineNumber ?? 1) - 1
  const tokens = getTokenForLine(highlightLines, lineIdx)
  const segments = mergeSegments(
    diffSide.content,
    tokens,
    diffSide.parts,
    matches,
    currentMatch,
    side,
    rowIndex
  )

  const sign =
    rowType === 'added' ? '+' : rowType === 'removed' ? '-' : rowType === 'modified' ? (side === 'left' ? '-' : '+') : ' '

  return (
    <div className={`cd-side cd-side-${side}`}>
      {showLineNumbers && (
        <div className="cd-gutter">
          <span className="cd-line-num">{lineNumber ?? ''}</span>
          <span
            className={`cd-sign ${rowType === 'added' || (rowType === 'modified' && side === 'right') ? 'cd-sign-add' : rowType === 'removed' || (rowType === 'modified' && side === 'left') ? 'cd-sign-del' : ''}`}
          >
            {sign}
          </span>
        </div>
      )}
      <code className="cd-code">
        {segments.map((seg, idx) => (
          <CodeSegment key={idx} segment={seg} matchIndex={getMatchIndex(matches, rowIndex, side, seg)} />
        ))}
        {diffSide.noNewline && <span className="cd-no-newline">{diffSide.noNewline ? '\\ No newline at end of file' : ''}</span>}
      </code>
    </div>
  )
}

function getMatchIndex(
  matches: SearchMatch[],
  rowIndex: number,
  side: 'left' | 'right',
  seg: TextSegment
): number {
  if (!seg.searchMatch) return -1
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (m.rowIndex === rowIndex && m.side === side) {
      if (seg.searchCurrent) return i
    }
  }
  return -1
}

// --- Code Segment ---

interface CodeSegmentProps {
  segment: TextSegment
  matchIndex: number
}

function CodeSegment({ segment, matchIndex }: CodeSegmentProps) {
  const classes: string[] = []

  if (segment.syntaxClass) {
    classes.push(segment.syntaxClass)
  }
  if (segment.diffType === 'added') {
    classes.push('cd-inline-add')
  } else if (segment.diffType === 'removed') {
    classes.push('cd-inline-del')
  }
  if (segment.searchCurrent) {
    classes.push('cd-search-current')
  } else if (segment.searchMatch) {
    classes.push('cd-search-match')
  }

  const className = classes.length > 0 ? classes.join(' ') : undefined
  const dataAttr = matchIndex >= 0 ? { 'data-match-id': matchIndex } : undefined

  if (segment.text === '') return null

  return (
    <span className={className} {...dataAttr}>
      {segment.text}
    </span>
  )
}

export type { InlinePart }
