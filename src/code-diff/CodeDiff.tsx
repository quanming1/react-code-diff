import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect, memo } from 'react'
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
import { computeDiff, findChangeBlocks, buildVisibleRows, computeSearchMatches, computePreviewSearchMatches } from './diff-engine'
import type { DiffResult } from './diff-engine'
import {
  highlightToLines,
  getTokenForLine,
} from './highlight-engine'
import { mergeSegments } from './segment-merger'
import { mergeConfig, colorsToCssVars } from './config-merger'
import { useVirtualScroll } from './virtual'
import './CodeDiff.css'

const ASYNC_DIFF_THRESHOLD = 30_000

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
    autoScrollToFirstChange = true,
  } = props

  const config: CodeDiffConfig = useMemo(
    () => mergeConfig(partialConfig),
    [partialConfig]
  )

  const diffOptions = useMemo(
    () => ({
      inlineDiffEnabled: highlightInlineChanges,
      inlineDiffLineLimit: config.diff.inlineDiffLineLimit,
      inlineDiffCharLimit: config.diff.inlineDiffCharLimit,
    }),
    [highlightInlineChanges, config.diff.inlineDiffLineLimit, config.diff.inlineDiffCharLimit]
  )

  const needsAsyncDiff = oldValue.length + newValue.length > ASYNC_DIFF_THRESHOLD

  const [asyncDiff, setAsyncDiff] = useState<DiffResult | null>(null)

  useEffect(() => {
    if (viewMode === 'preview') return
    if (!needsAsyncDiff) return
    setAsyncDiff(null)
    let cancelled = false
    const id = setTimeout(() => {
      if (cancelled) return
      setAsyncDiff(computeDiff(oldValue, newValue, diffOptions))
    }, 0)
    return () => { cancelled = true; clearTimeout(id) }
  }, [oldValue, newValue, needsAsyncDiff, viewMode, diffOptions])

  const diffResult = useMemo<DiffResult | null>(() => {
    if (viewMode === 'preview') return null
    if (needsAsyncDiff) return asyncDiff
    return computeDiff(oldValue, newValue, diffOptions)
  }, [oldValue, newValue, needsAsyncDiff, viewMode, diffOptions, asyncDiff])

  const diffReady = diffResult !== null

  useEffect(() => {
    if (diffResult) onDiffComputed?.(diffResult.stats)
  }, [diffResult, onDiffComputed])

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
    () => diffResult ? buildVisibleRows(diffResult.rows, showDiffOnly, contextLines, expandedSections) : [],
    [diffResult, showDiffOnly, contextLines, expandedSections]
  )

  const changeBlocks = useMemo(
    () => diffResult ? findChangeBlocks(diffResult.rows) : [],
    [diffResult]
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

  const previewLines = useMemo(() => {
    if (newValue === '') return []
    return newValue.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  }, [newValue])

  const scrollRef = useRef<HTMLDivElement>(null)
  const internalRatio = useRef<number | null>(null)

  const effectiveRatio = splitRatio ?? internalRatio.current ?? 0.5

  const maxLineNumDigits = useMemo(() => {
    let maxNum = previewLines.length
    if (diffResult) {
      for (const row of diffResult.rows) {
        if (row.left?.lineNumber && row.left.lineNumber > maxNum) maxNum = row.left.lineNumber
        if (row.right?.lineNumber && row.right.lineNumber > maxNum) maxNum = row.right.lineNumber
      }
    }
    return Math.max(String(maxNum).length, 3)
  }, [previewLines.length, diffResult])

  const [containerWidth, setContainerWidth] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const contentWidth = useMemo(() => {
    const visualLen = (s: string): number => {
      let len = 0
      for (let i = 0; i < s.length; i++) {
        len = s.charCodeAt(i) === 9 ? Math.ceil((len + 1) / 4) * 4 : len + 1
      }
      return len
    }
    let maxLen = 0
    const rows = diffReady ? diffResult?.rows : null
    if (rows) {
      for (const row of rows) {
        if (row.left) maxLen = Math.max(maxLen, visualLen(row.left.content))
        if (row.right) maxLen = Math.max(maxLen, visualLen(row.right.content))
      }
    } else {
      for (const line of previewLines) maxLen = Math.max(maxLen, visualLen(line))
    }
    const charW = config.font.size * 0.6
    const gutterW = (maxLineNumDigits + 2) * charW + 20
    const codeW = maxLen * charW + config.layout.codePaddingRight + 8
    return Math.ceil(gutterW + codeW)
  }, [diffReady, diffResult, previewLines, maxLineNumDigits, config.font.size, config.layout.codePaddingRight])

  const ROW_HEIGHT = config.font.lineHeight
  const COLLAPSE_HEIGHT = 28

  const rowHeights = useMemo(() => {
    if (!wrapLines) {
      if (viewMode === 'preview' || !diffReady) {
        return previewLines.map(() => ROW_HEIGHT)
      }
      return visibleRows.map((dr) => (dr.kind === 'collapsed' ? COLLAPSE_HEIGHT : ROW_HEIGHT))
    }

    const charW = config.font.size * 0.6
    const gutterW = (maxLineNumDigits + 2) * charW + 20
    const availW = viewMode === 'split'
      ? containerWidth * Math.min(effectiveRatio, 1 - effectiveRatio) - gutterW - config.layout.codePaddingRight
      : containerWidth - gutterW - config.layout.codePaddingRight
    const charsPerLine = Math.max(1, Math.floor(availW / charW))

    const visualLen = (s: string): number => {
      let len = 0
      for (let i = 0; i < s.length; i++) {
        len = s.charCodeAt(i) === 9 ? Math.ceil((len + 1) / 4) * 4 : len + 1
      }
      return len
    }

    if (viewMode === 'preview' || !diffReady) {
      return previewLines.map((line) => Math.max(1, Math.ceil(visualLen(line) / charsPerLine)) * ROW_HEIGHT)
    }
    return visibleRows.map((dr) => {
      if (dr.kind === 'collapsed') return COLLAPSE_HEIGHT
      const content = dr.row.right?.content ?? dr.row.left?.content ?? ''
      return Math.max(1, Math.ceil(visualLen(content) / charsPerLine)) * ROW_HEIGHT
    })
  }, [wrapLines, containerWidth, viewMode, diffReady, previewLines, visibleRows, ROW_HEIGHT, COLLAPSE_HEIGHT, config.font.size, config.layout.codePaddingRight, maxLineNumDigits, effectiveRatio])

  const virtualEnabled = true
  const virtual = useVirtualScroll({
    scrollRef,
    rowHeights,
    enabled: virtualEnabled,
  })
  const scrollToIndexRef = useRef(virtual.scrollToIndex)
  scrollToIndexRef.current = virtual.scrollToIndex

  // ── Split horizontal scroll (custom scrollbar) ──
  const leftColRef = useRef<HTMLDivElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)
  const [leftColW, setLeftColW] = useState(0)
  const [rightColW, setRightColW] = useState(0)
  const [scrollLeftL, setScrollLeftL] = useState(0)
  const [scrollLeftR, setScrollLeftR] = useState(0)

  useLayoutEffect(() => {
    const measure = () => {
      if (leftColRef.current) setLeftColW(leftColRef.current.clientWidth)
      if (rightColRef.current) setRightColW(rightColRef.current.clientWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (leftColRef.current) ro.observe(leftColRef.current)
    if (rightColRef.current) ro.observe(rightColRef.current)
    return () => ro.disconnect()
  }, [viewMode, diffReady])

  useEffect(() => {
    setScrollLeftL(0)
    setScrollLeftR(0)
  }, [oldValue, newValue, viewMode])

  const makeThumbDrag = useCallback((isLeft: boolean) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const colW = isLeft ? leftColW : rightColW
    const contentW = contentWidth
    const maxScroll = contentW - colW
    if (maxScroll <= 0) return
    const trackW = colW
    const thumbW = Math.max(20, (colW / contentW) * trackW)
    const maxThumbLeft = trackW - thumbW
    const startX = e.clientX
    const startScroll = isLeft ? scrollLeftL : scrollLeftR
    const setScroll = isLeft ? setScrollLeftL : setScrollLeftR

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX
      const newScroll = Math.max(0, Math.min(maxScroll, startScroll + (delta / maxThumbLeft) * maxScroll))
      setScroll(newScroll)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [leftColW, rightColW, contentWidth, scrollLeftL, scrollLeftR])

  const makeWheelHandler = useCallback((isLeft: boolean) => (e: React.WheelEvent) => {
    const colW = isLeft ? leftColW : rightColW
    const contentW = contentWidth
    const maxScroll = contentW - colW
    if (maxScroll <= 0) return
    const delta = e.deltaX || (e.shiftKey ? e.deltaY : 0)
    if (delta === 0) return
    e.preventDefault()
    const setScroll = isLeft ? setScrollLeftL : setScrollLeftR
    setScroll(prev => Math.max(0, Math.min(maxScroll, prev + delta)))
  }, [leftColW, rightColW, contentWidth])

  const findVisibleIndex = useCallback(
    (originalIndex: number): number => {
      if (viewMode === 'preview' || !diffReady) return originalIndex
      for (let i = 0; i < visibleRows.length; i++) {
        const dr = visibleRows[i]
        if (dr.kind === 'row' && dr.originalIndex === originalIndex) return i
      }
      return -1
    },
    [viewMode, diffReady, visibleRows],
  )

  const matches = useMemo(
    () => {
      const all = (viewMode === 'preview' || !diffReady)
        ? computePreviewSearchMatches(previewLines, debouncedQuery, caseSensitive)
        : computeSearchMatches(diffResult!.rows, debouncedQuery, caseSensitive)
      return all.slice(0, config.search.maxResults)
    },
    [diffResult, diffReady, viewMode, previewLines, debouncedQuery, caseSensitive, config.search.maxResults]
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

  useLayoutEffect(() => {
    if (!autoScrollToFirstChange) return
    if (!diffReady || viewMode === 'preview') return
    if (changeBlocks.length === 0) return
    const firstBlock = changeBlocks[0]
    const vi = findVisibleIndex(firstBlock.startIndex)
    if (vi < 0) return
    const raf = requestAnimationFrame(() => {
      scrollToIndexRef.current(vi, 'center')
    })
    return () => cancelAnimationFrame(raf)
  }, [autoScrollToFirstChange, diffReady, viewMode, changeBlocks, findVisibleIndex])

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
    const m = matches[currentMatch]
    const vi = findVisibleIndex(m.rowIndex)
    if (vi >= 0) scrollToIndexRef.current(vi, 'center')
  }, [currentMatch, matches, findVisibleIndex])

  const navigateChange = useCallback(
    (dir: 'prev' | 'next') => {
      if (changeBlocks.length === 0) return
      const next =
        dir === 'next'
          ? (currentChange + 1) % changeBlocks.length
          : (currentChange - 1 + changeBlocks.length) % changeBlocks.length
      setCurrentChange(next)
      const block = changeBlocks[next]
      const vi = findVisibleIndex(block.startIndex)
      if (vi >= 0) scrollToIndexRef.current(vi, 'center')
    },
    [currentChange, changeBlocks, findVisibleIndex]
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
  const draggingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

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
    '--cd-gutter-width': `${maxLineNumDigits}ch`,
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
    stats: diffResult?.stats ?? { additions: 0, deletions: 0 },
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
            stats={diffResult?.stats ?? { additions: 0, deletions: 0 }}
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
        {viewMode === 'preview' || !diffReady ? (
          newValue.length === 0 ? (
            <div className="cd-empty">{config.texts.noContent}</div>
          ) : (
            <div className="cd-table cd-unified" style={{ height: virtual.totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: contentWidth || undefined, transform: `translateY(${virtual.offsetY}px)` }}>
                {previewLines!.slice(virtual.startIndex, virtual.endIndex).map((line, i) => {
                  const idx = virtual.startIndex + i
                  return (
                    <PreviewRow
                      key={`preview-${idx}`}
                      line={line}
                      lineIndex={idx}
                      highlightLines={newHighlight}
                      showLineNumbers={showLineNumbers}
                      matches={matches}
                      currentMatch={currentMatch}
                      onRowClick={handleRowClick}
                    />
                  )
                })}
              </div>
            </div>
          )
        ) : diffResult!.rows.length === 0 ? (
          <div className="cd-empty">{config.texts.noContent}</div>
        ) : viewMode === 'split' ? (
          <div className="cd-split-wrapper" style={{ height: virtual.totalHeight, position: 'relative', display: 'flex' }}>
              <div ref={leftColRef} className="cd-split-col" style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'var(--cd-split-basis, 50%)' }} onWheel={makeWheelHandler(true)}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: contentWidth || undefined, transform: `translate(${-scrollLeftL}px, ${virtual.offsetY}px)` }}>
                  {visibleRows.slice(virtual.startIndex, virtual.endIndex).map((dr, i) => {
                    const vi = virtual.startIndex + i
                    return dr.kind === 'collapsed' ? (
                      <div key={`collapse-${dr.sectionId}-${vi}`} className="cd-collapse" onClick={() => toggleExpanded(dr.sectionId)}>
                        {config.icons.collapse}
                        <span>{config.texts.showHidden.replace('{count}', String(dr.count))}</span>
                      </div>
                    ) : (
                      <div key={`row-${dr.originalIndex}`} className="cd-row" data-type={dr.row.type} data-row-index={dr.originalIndex} onClick={() => handleRowClick(dr.row, dr.originalIndex)}>
                        <SideView side="left" rowType={dr.row.type} diffSide={dr.row.left} highlightLines={oldHighlight} lineNumber={dr.row.left?.lineNumber ?? null} showLineNumbers={showLineNumbers} rowIndex={dr.originalIndex} matches={matches} currentMatch={currentMatch} />
                      </div>
                    )
                  })}
                </div>
              </div>
              <div ref={rightColRef} className="cd-split-col" style={{ flexGrow: 1, flexShrink: 0, flexBasis: 0 }} onWheel={makeWheelHandler(false)}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: contentWidth || undefined, transform: `translate(${-scrollLeftR}px, ${virtual.offsetY}px)` }}>
                  {visibleRows.slice(virtual.startIndex, virtual.endIndex).map((dr, i) => {
                    const vi = virtual.startIndex + i
                    return dr.kind === 'collapsed' ? (
                      <div key={`collapse-${dr.sectionId}-${vi}`} style={{ height: COLLAPSE_HEIGHT }} />
                    ) : (
                      <div key={`row-${dr.originalIndex}`} className="cd-row" data-type={dr.row.type} data-row-index={dr.originalIndex} onClick={() => handleRowClick(dr.row, dr.originalIndex)}>
                        <SideView side="right" rowType={dr.row.type} diffSide={dr.row.right} highlightLines={newHighlight} lineNumber={dr.row.right?.lineNumber ?? null} showLineNumbers={showLineNumbers} rowIndex={dr.originalIndex} matches={matches} currentMatch={currentMatch} />
                      </div>
                    )
                  })}
                </div>
              </div>
            {resizableSplit && (
              <div className="cd-split-handle" onPointerDown={onHandlePointerDown} />
            )}
          </div>
        ) : (
          <div className="cd-table cd-unified" style={{ height: virtual.totalHeight, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: contentWidth || undefined, transform: `translateY(${virtual.offsetY}px)` }}>
              {visibleRows.slice(virtual.startIndex, virtual.endIndex).map((dr, i) => {
                const vi = virtual.startIndex + i
                return dr.kind === 'collapsed' ? (
                  <div key={`collapse-${dr.sectionId}-${vi}`} className="cd-collapse" onClick={() => toggleExpanded(dr.sectionId)}>
                    {config.icons.collapse}
                    <span>{config.texts.showHidden.replace('{count}', String(dr.count))}</span>
                  </div>
                ) : (
                  <UnifiedRow key={`row-${dr.originalIndex}`} row={dr.row} rowIndex={dr.originalIndex} showLineNumbers={showLineNumbers} oldHighlight={oldHighlight} newHighlight={newHighlight} matches={matches} currentMatch={currentMatch} onRowClick={handleRowClick} />
                )
              })}
            </div>
          </div>
        )}
      </div>
      {viewMode === 'split' && diffReady && contentWidth > leftColW && leftColW > 0 && (
        <div className="cd-hscrollbar" style={{ left: 0, width: leftColW }}>
          <div
            className="cd-hscrollbar-thumb"
            style={{
              width: `${Math.max(20, (leftColW / contentWidth) * 100)}%`,
              left: `${(scrollLeftL / (contentWidth - leftColW)) * (100 - Math.max(20, (leftColW / contentWidth) * 100))}%`,
            }}
            onPointerDown={makeThumbDrag(true)}
          />
        </div>
      )}
      {viewMode === 'split' && diffReady && contentWidth > rightColW && rightColW > 0 && (
        <div className="cd-hscrollbar" style={{ left: leftColW, width: rightColW }}>
          <div
            className="cd-hscrollbar-thumb"
            style={{
              width: `${Math.max(20, (rightColW / contentWidth) * 100)}%`,
              left: `${(scrollLeftR / (contentWidth - rightColW)) * (100 - Math.max(20, (rightColW / contentWidth) * 100))}%`,
            }}
            onPointerDown={makeThumbDrag(false)}
          />
        </div>
      )}
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

const SplitRow = memo(function SplitRow(props: RowProps) {
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
})

// --- Unified Row ---

const UnifiedRow = memo(function UnifiedRow(props: RowProps) {
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
})

// --- Preview Row ---

interface PreviewRowProps {
  line: string
  lineIndex: number
  highlightLines: ReturnType<typeof highlightToLines>
  showLineNumbers: boolean
  matches: SearchMatch[]
  currentMatch: number
  onRowClick: (row: DiffRow, index: number) => void
}

const PreviewRow = memo(function PreviewRow(props: PreviewRowProps) {
  const { line, lineIndex, highlightLines, showLineNumbers, matches, currentMatch, onRowClick } = props
  const tokens = getTokenForLine(highlightLines, lineIndex)
  const segments = mergeSegments(
    line,
    tokens,
    [{ value: line, type: 'normal' as const }],
    matches,
    currentMatch,
    'right',
    lineIndex,
  )

  const previewRow: DiffRow = {
    type: 'context',
    left: null,
    right: { lineNumber: lineIndex + 1, content: line, parts: [{ value: line, type: 'normal' }] },
  }

  return (
    <div
      key={`preview-${lineIndex}`}
      className="cd-row"
      data-type="context"
      data-row-index={lineIndex}
      onClick={() => onRowClick(previewRow, lineIndex)}
    >
      <div className="cd-side cd-side-right" style={{ flex: '1 1 100%' }}>
        {showLineNumbers && (
          <div className="cd-gutter">
            <span className="cd-line-num">{lineIndex + 1}</span>
            <span className="cd-sign">&nbsp;</span>
          </div>
        )}
        <code className="cd-code">
          {segments.map((seg, idx) => (
            <CodeSegment key={idx} segment={seg} matchIndex={getMatchIndex(matches, lineIndex, 'right', seg)} />
          ))}
        </code>
      </div>
    </div>
  )
})

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

const SideView = memo(function SideView(props: SideViewProps) {
  const { side, rowType, diffSide, highlightLines, lineNumber, showLineNumbers, rowIndex, matches, currentMatch } = props

  if (!diffSide) {
    return (
      <div className={`cd-side cd-side-${side} cd-side-empty`}>
        {showLineNumbers && (
          <div className="cd-gutter">
            <span className="cd-line-num-empty">&nbsp;</span>
            <span className="cd-sign">&nbsp;</span>
          </div>
        )}
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
})

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

const CodeSegment = memo(function CodeSegment({ segment, matchIndex }: CodeSegmentProps) {
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
})

export type { InlinePart }
