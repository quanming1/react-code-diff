/**
 * @cd/react CodeDiff（FR7.1）——对外 diff 查看器，props 与 1.3.0 完全兼容。
 *
 * - 用 View + DiffModel 渲染 unified/split/preview 三视图
 * - revealLine/revealEndLine/revealNonce（B1 兼容）
 * - 工具栏/搜索为简化 React UI（D7 首版：核心 diff 渲染 + reveal；完整工具栏后续迭代）
 */

import { useEffect, useMemo, useRef } from 'react'
import { TextModel, computeDiff, mappingsToRows } from '@cd/core'
import { View, type ViewModelLike } from '@cd/view'

export type ViewMode = 'unified' | 'split' | 'preview'
export type Theme = 'light' | 'dark'

export interface CodeDiffProps {
  oldValue: string
  newValue: string
  language?: string
  fileName?: string
  viewMode?: ViewMode
  theme?: Theme
  showLineNumbers?: boolean
  showToolbar?: boolean
  showDiffOnly?: boolean
  contextLines?: number
  wrapLines?: boolean
  highlightInlineChanges?: boolean
  className?: string
  style?: React.CSSProperties
  maxHeight?: number | string
  config?: Record<string, unknown>
  splitRatio?: number
  onSplitRatioChange?: (ratio: number) => void
  resizableSplit?: boolean
  renderToolbar?: (props: unknown) => React.ReactNode
  onCopy?: (which: 'old' | 'new', text: string) => boolean | void
  onLineClick?: (row: unknown, index: number) => void
  onSearchMatchChange?: (match: unknown, count: number) => void
  onDiffComputed?: (diff: unknown) => void
  autoScrollToFirstChange?: boolean
  revealLine?: number
  revealEndLine?: number
  revealNonce?: number
}

const LINE_HEIGHT = 20

export function CodeDiff(props: CodeDiffProps) {
  const {
    oldValue,
    newValue,
    language = 'typescript',
    fileName,
    viewMode = 'split',
    theme = 'light',
    showLineNumbers = true,
    showToolbar = true,
    showDiffOnly = true,
    contextLines = 3,
    wrapLines = false,
    highlightInlineChanges = true,
    className,
    style,
    maxHeight,
    splitRatio = 0.5,
    revealLine,
    revealEndLine,
    revealNonce,
  } = props

  // 兼容 props 预留（D7 首版核心渲染；后续迭代接入折叠/换行/配置）
  void showDiffOnly
  void contextLines
  void wrapLines
  void highlightInlineChanges
  void splitRatio

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const view2Ref = useRef<View | null>(null)

  // diff 计算（缓存：old/new 相同 → 复用）
  const diff = useMemo(
    () => computeDiff(oldValue, newValue),
    [oldValue, newValue]
  )
  const rows = useMemo(() => mappingsToRows(diff), [diff])

  // 挂载 View
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''
    container.style.position = 'relative'
    container.style.overflow = 'hidden'

    const view = new View({ lineHeight: LINE_HEIGHT, overscan: 8 })
    container.appendChild(view.getDomNode())
    viewRef.current = view
    view.setLanguage(language)
    view.setGutterEnabled(showLineNumbers)

    if (viewMode === 'split') {
      const view2 = new View({ lineHeight: LINE_HEIGHT, overscan: 8 })
      view2.setLanguage(language)
      view2.setGutterEnabled(showLineNumbers)
      // split：两个 view 各占一半
      view.getDomNode().style.width = '50%'
      view.getDomNode().style.float = 'left'
      view2.getDomNode().style.width = '50%'
      view2.getDomNode().style.float = 'left'
      container.appendChild(view2.getDomNode())
      view2Ref.current = view2
    }

    return () => {
      container.innerHTML = ''
      viewRef.current = null
      view2Ref.current = null
    }
  }, [viewMode])

  // 数据 → 视图（DiffRow 转 TextModel 行数据）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // 构造展示 model：把 rows 编码为文本行（unified 语义）
    // 简化 D7 首版：preview 用 newValue 文本；unified/split 用 rows 骨架行
    const lines = viewMode === 'preview'
      ? newValue.split('\n')
      : rows.map((r) => {
          const content = r.right?.content ?? r.left?.content ?? ''
          const prefix = r.type === 'added' ? '+' : r.type === 'removed' ? '-' : ' '
          return prefix + content
        })
    const model = new TextModel(lines.join('\n'), 'diff')
    view.setModel(model as unknown as ViewModelLike)
    view.setLanguage(language)
    if (view2Ref.current) {
      view2Ref.current.setModel(model as unknown as ViewModelLike)
      view2Ref.current.setLanguage(language)
    }
  }, [viewRef.current, rows, newValue, viewMode, language])

  // reveal 跳转（B1 兼容）
  useEffect(() => {
    if (!revealLine) return
    const view = viewRef.current
    if (!view) return
    view.scrollToLine(revealLine, 'center')
    // 高亮带（D7 首版：行装饰）
    view.setDecorationProvider((line) => {
      if (revealLine && revealEndLine && line >= revealLine && line <= revealEndLine) {
        return 'cd-dec-reveal'
      }
      return ''
    })
  }, [revealLine, revealEndLine, revealNonce])

  return (
    <div
      ref={containerRef}
      className={`cd-diff cd-theme-${theme} ${className ?? ''}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        maxHeight,
        ...style,
      }}
    >
      {showToolbar && fileName && (
        <div style={{ padding: '4px 8px', fontSize: 12, borderBottom: '1px solid #ccc' }}>
          {fileName} <span style={{ marginLeft: 8, color: '#888' }}>{diff.stats.additions}+ / {diff.stats.deletions}-</span>
        </div>
      )}
    </div>
  )
}
