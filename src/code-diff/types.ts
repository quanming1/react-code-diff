import type { ReactNode } from 'react'

export type ViewMode = 'split' | 'unified' | 'preview'
export type Theme = 'light' | 'dark'

export type DiffRowType = 'context' | 'added' | 'removed' | 'modified'

export interface InlinePart {
  value: string
  type: 'normal' | 'added' | 'removed'
}

export interface DiffSide {
  lineNumber: number | null
  content: string
  parts: InlinePart[]
  noNewline?: boolean
}

export interface DiffRow {
  type: DiffRowType
  left: DiffSide | null
  right: DiffSide | null
}

export interface DiffStats {
  additions: number
  deletions: number
}

export interface SearchMatch {
  rowIndex: number
  side: 'left' | 'right'
  start: number
  end: number
}

export interface FlatToken {
  text: string
  className: string
}

export interface TextSegment {
  text: string
  syntaxClass: string
  diffType: 'normal' | 'added' | 'removed'
  searchMatch: boolean
  searchCurrent: boolean
}

export type DisplayRow =
  | { kind: 'row'; row: DiffRow; originalIndex: number }
  | { kind: 'collapsed'; count: number; sectionId: number }

// ============================================================
// Config system
// ============================================================

export interface ThemeColors {
  bg: string
  bgSecondary: string
  border: string
  text: string
  muted: string
  lineHover: string

  addedBg: string
  addedStrong: string
  addedText: string
  removedBg: string
  removedStrong: string
  removedText: string

  gutterBg: string
  gutterText: string

  searchBg: string
  searchCurrent: string
  searchCurrentText: string

  collapseBg: string
  collapseText: string

  toolbarBg: string
  toolbarBorder: string

  accent: string

  tokens: ThemeTokenColors
}

export interface ThemeTokenColors {
  comment: string
  prolog: string
  doctype: string
  cdata: string
  punctuation: string
  property: string
  symbol: string
  tag: string
  boolean: string
  number: string
  string: string
  char: string
  attrValue: string
  keyword: string
  operator: string
  function: string
  method: string
  className: string
  builtin: string
  variable: string
  constant: string
  regex: string
  important: string
  attrName: string
  selector: string
  entity: string
}

export interface FontConfig {
  family: string
  size: number
  lineHeight: number
}

export interface LayoutConfig {
  borderRadius: number
  gutterMinWidth: string
  signMinWidth: string
  codePaddingRight: number
  toolbarHeight: number
}

export interface DiffConfig {
  inlineDiffLineLimit: number
  inlineDiffCharLimit: number
  highlightCharLimit: number
  ignoreWhitespace: boolean
}

export interface SearchConfig {
  debounceMs: number
  maxResults: number
}

export interface ToolbarConfig {
  showFileName: boolean
  showLanguage: boolean
  showStats: boolean
  showSearch: boolean
  showCopy: boolean
  showCopyOld: boolean
  showCopyNew: boolean
  showChangeNavigation: boolean
}

export interface IconsConfig {
  file: ReactNode
  search: ReactNode
  copy: ReactNode
  check: ReactNode
  chevronUp: ReactNode
  chevronDown: ReactNode
  caseSensitive: ReactNode
  collapse: ReactNode
}

export interface TextsConfig {
  searchPlaceholder: string
  noResults: string
  noContent: string
  changes: string
  showHidden: string
  noNewline: string
  copyOld: string
  copyNew: string
}

export interface CodeDiffConfig {
  font: FontConfig
  layout: LayoutConfig
  diff: DiffConfig
  search: SearchConfig
  toolbar: ToolbarConfig
  icons: IconsConfig
  texts: TextsConfig
  colors: {
    dark: ThemeColors
    light: ThemeColors
  }
}

export type PartialConfig = {
  [K in keyof CodeDiffConfig]?:
    K extends 'colors'
      ? { dark?: Partial<ThemeColors>; light?: Partial<ThemeColors> }
      : Partial<CodeDiffConfig[K]>
}

export interface ToolbarRenderProps {
  fileName?: string
  language: string
  stats: DiffStats
  searchOpen: boolean
  onToggleSearch: () => void
  onCopy: (which: 'old' | 'new') => void
  copied: 'old' | 'new' | null
  changeCount: number
  onNavigateChange: (dir: 'prev' | 'next') => void
  config: CodeDiffConfig
}

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
  config?: PartialConfig
  splitRatio?: number
  onSplitRatioChange?: (ratio: number) => void
  resizableSplit?: boolean
  renderToolbar?: (props: ToolbarRenderProps) => ReactNode
  onCopy?: (which: 'old' | 'new', text: string) => void | boolean
  onLineClick?: (row: DiffRow, index: number) => void
  onSearchMatchChange?: (match: SearchMatch | null, total: number) => void
  onDiffComputed?: (stats: DiffStats) => void
  autoScrollToFirstChange?: boolean
}
