# react-code-diff

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6.svg)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vite.dev)

A high-performance React component for rendering **GitHub-style code diffs** with syntax highlighting, inline word-level diff, in-diff search, collapsible context, resizable split view, and full theming support.

Built on [`diff`](https://github.com/kpdecker/jsdiff) for diff computation and [`refractor`](https://github.com/wooorm/refractor) (Prism-based) for syntax highlighting.

## Features

- **Split & Unified views** — GitHub-style side-by-side or unified diff layout
- **Syntax highlighting** — 40+ languages via refractor (Prism), token colors fully themeable
- **Inline word-level diff** — highlights the exact words/characters that changed within a modified line
- **In-diff search** — debounced search with match navigation, case-sensitivity toggle, and auto-scroll
- **Collapsible context** — GitHub-style "show N hidden lines" folding with configurable context lines
- **Change navigation** — jump between changed blocks with prev/next buttons
- **Resizable split** — drag the divider to adjust left/right ratio (direct DOM, no re-renders during drag)
- **Light & Dark themes** — GitHub Primer-inspired palettes, switch via a single prop
- **Fully configurable** — deep-mergeable config covering colors, fonts, layout, icons, texts, toolbar, and diff behavior
- **Custom toolbar** — render your own toolbar via the `renderToolbar` prop
- **Copy to clipboard** — one-click copy of old/new code
- **Large file protection** — auto-disables inline diff / highlighting above configurable char/line limits
- **No trailing newline indicator** — shows `\ No newline at end of file` when appropriate
- **TypeScript** — fully typed, ships types out of the box

## Screenshot

> _Add a screenshot or GIF here after first release._

## Installation

```bash
npm install react-code-diff
# or
pnpm add react-code-diff
# or
yarn add react-code-diff
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

## Quick Start

```tsx
import { useState } from 'react'
import { CodeDiff } from 'react-code-diff'

const OLD = `function greet(name) {
  return 'Hello, ' + name
}`

const NEW = `function greet(name: string) {
  return \`Hello, \${name}!\`
}`

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  return (
    <CodeDiff
      oldValue={OLD}
      newValue={NEW}
      language="tsx"
      fileName="greet.ts"
      viewMode="split"       // 'split' | 'unified'
      theme={theme}          // 'dark' | 'light'
      showDiffOnly            // collapse unchanged context
      contextLines={3}        // lines of context around changes
      wrapLines={false}       // soft-wrap long lines
      highlightInlineChanges  // word-level inline diff
      maxHeight="70vh"
    />
  )
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `oldValue` | `string` | — | Old code (required) |
| `newValue` | `string` | — | New code (required) |
| `language` | `string` | `'typescript'` | Language for syntax highlighting (aliases supported, e.g. `ts`, `js`, `py`) |
| `fileName` | `string` | — | File name shown in the toolbar |
| `viewMode` | `'split' \| 'unified'` | `'split'` | Diff layout mode |
| `theme` | `'light' \| 'dark'` | `'dark'` | Color theme |
| `showLineNumbers` | `boolean` | `true` | Show line number gutter |
| `showToolbar` | `boolean` | `true` | Show the built-in toolbar |
| `showDiffOnly` | `boolean` | `true` | Collapse unchanged context to only show changes + N context lines |
| `contextLines` | `number` | `3` | Context lines around each change block (used when `showDiffOnly`) |
| `wrapLines` | `boolean` | `false` | Soft-wrap long lines |
| `highlightInlineChanges` | `boolean` | `true` | Enable word-level inline diff on modified lines |
| `maxHeight` | `number \| string` | — | Max height of the scroll area (e.g. `500`, `'70vh'`) |
| `resizableSplit` | `boolean` | `true` | Enable drag-to-resize in split mode |
| `splitRatio` | `number` | `0.5` | Initial left/right ratio (0–1), controlled |
| `onSplitRatioChange` | `(ratio: number) => void` | — | Called when the user finishes dragging the divider |
| `config` | `PartialConfig` | — | Deep-merged over the default config (see below) |
| `renderToolbar` | `(props: ToolbarRenderProps) => ReactNode` | — | Custom toolbar renderer |
| `onCopy` | `(which, text) => void \| boolean` | — | Intercept copy; return `false` to prevent, `true` to skip default |
| `onLineClick` | `(row, index) => void` | — | Called when a diff row is clicked |
| `onSearchMatchChange` | `(match, total) => void` | — | Called when the active search match changes |
| `onDiffComputed` | `(stats) => void` | — | Called with `{ additions, deletions }` after diff is computed |
| `className` | `string` | — | Extra class on the root element |
| `style` | `React.CSSProperties` | — | Inline styles on the root element |

## Configuration

Pass a `config` prop to override any part of the default config. Overrides are **deep-merged**, so you only need to specify what you want to change.

```tsx
import { CodeDiff, mergeConfig } from 'react-code-diff'

const config = mergeConfig({
  font: {
    family: "'Fira Code', monospace",
    size: 14,
  },
  colors: {
    dark: {
      addedBg: 'rgba(46, 160, 67, 0.25)',
    },
  },
  toolbar: {
    showLanguage: false,
  },
})

<CodeDiff oldValue={OLD} newValue={NEW} config={config} />
```

### Config structure

```ts
interface CodeDiffConfig {
  font: FontConfig            // family, size, lineHeight
  layout: LayoutConfig        // borderRadius, gutterMinWidth, ...
  diff: DiffConfig            // inlineDiffLineLimit, char limits, ignoreWhitespace
  search: SearchConfig        // debounceMs, maxResults
  toolbar: ToolbarConfig      // show flags for each toolbar element
  icons: IconsConfig          // Lucide icons, replaceable
  texts: TextsConfig          // UI strings (i18n-friendly)
  colors: {
    dark: ThemeColors
    light: ThemeColors
  }
}
```

Each color object covers backgrounds, added/removed colors, gutter, search highlight, collapse, toolbar, accent, and a full set of syntax token colors — all exposed as CSS variables at runtime.

## Themes

Two built-in themes ship out of the box, both GitHub-Primer-inspired:

- `theme="dark"` — dark background (`#0d1117`)
- `theme="light"` — light background (`#ffffff`)

Switching is zero-JS-cost: the component sets CSS variables on the root element, so theme changes never re-render rows.

To customize colors, override the `colors.dark` / `colors.light` entries in `config`.

## Supported Languages

Syntax highlighting uses refractor, which bundles Prism grammars. Common aliases work out of the box: `js`/`javascript`, `ts`/`typescript`, `jsx`, `tsx`, `py`/`python`, `go`, `rs`/`rust`, `java`, `json`, `css`, `scss`, `sql`, `yaml`, `toml`, `md`/`markdown`, `bash`/`sh`, `c#`/`cs`, `c++`, `html`/`xml`, `docker`, and more.

Unsupported or unknown languages fall back to plain text (no crash).

## License

[MIT](./LICENSE) © quanming1
