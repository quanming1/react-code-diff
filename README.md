# react-code-diff

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6.svg)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vite.dev)
[![Tests](https://img.shields.io/badge/Tests-78%20passed-brightgreen.svg)](#)

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

## How to use

### View modes

```tsx
// Side-by-side (default) — drag the divider to resize
<CodeDiff oldValue={old} newValue={new} viewMode="split" />

// Unified — old and new stacked in a single column
<CodeDiff oldValue={old} newValue={new} viewMode="unified" />
```

### Theme switching

Pass `theme` directly, or wire it to state for a toggle:

```tsx
function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  return (
    <>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        Toggle theme
      </button>
      <CodeDiff oldValue={old} newValue={new} theme={theme} />
    </>
  )
}
```

### Show only changes with context

`showDiffOnly` collapses long unchanged sections to a "show N hidden lines" bar, keeping only changes and `contextLines` lines around them:

```tsx
<CodeDiff
  oldValue={old}
  newValue={new}
  showDiffOnly           // collapse unchanged context (default: true)
  contextLines={5}       // show 5 lines of context around each change
/>
```

### Inline word-level diff

When `highlightInlineChanges` is on (default), modified lines highlight the exact words that changed:

```tsx
<CodeDiff
  oldValue={old}
  newValue={new}
  highlightInlineChanges  // highlight added/removed words within a line
  wrapLines               // soft-wrap long lines instead of horizontal scroll
/>
```

### Controlled resizable split

Track the divider ratio in state to persist it across renders or sync multiple views:

```tsx
const [ratio, setRatio] = useState(0.5)

<CodeDiff
  oldValue={old}
  newValue={new}
  viewMode="split"
  splitRatio={ratio}
  onSplitRatioChange={setRatio}   // called on drag end
  resizableSplit                  // enable dragging (default: true)
/>
```

### Search in diff

The built-in search bar (toggle via the search icon in the toolbar) supports case-sensitive matching and prev/next navigation. Listen to match changes:

```tsx
<CodeDiff
  oldValue={old}
  newValue={new}
  onSearchMatchChange={(match, total) => {
    console.log(`${match ? match.rowIndex : 'none'} / ${total} matches`)
  }}
/>
```

### Copy buttons

The toolbar ships copy buttons for old and new code. Intercept them to use a custom clipboard or track analytics:

```tsx
<CodeDiff
  oldValue={old}
  newValue={new}
  onCopy={(which, text) => {
    // return false to prevent the default clipboard write
    // return true to skip it (you handled it)
    trackCopy(which)
  }}
/>
```

### Custom toolbar

Replace the entire toolbar with your own via `renderToolbar`:

```tsx
import type { ToolbarRenderProps } from 'react-code-diff'

<CodeDiff
  oldValue={old}
  newValue={new}
  renderToolbar={(props: ToolbarRenderProps) => (
    <div className="my-toolbar">
      <span>{props.fileName}</span>
      <span>+{props.stats.additions} -{props.stats.deletions}</span>
      <button onClick={() => props.onCopy('new')}>Copy new</button>
    </div>
  )}
/>
```

`ToolbarRenderProps` exposes `fileName`, `language`, `stats`, `searchOpen`, `onToggleSearch`, `onCopy`, `copied`, `changeCount`, `onNavigateChange`, and `config`.

### Line click handling

```tsx
<CodeDiff
  oldValue={old}
  newValue={new}
  onLineClick={(row, index) => {
    console.log('Clicked line', index, row.type)
  }}
/>
```

### Diff stats callback

Get the addition/deletion counts after diff computation:

```tsx
<CodeDiff
  oldValue={old}
  newValue={new}
  onDiffComputed={(stats) => {
    console.log(`${stats.additions} additions, ${stats.deletions} deletions`)
  }}
/>
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

## Testing

```bash
pnpm test      # run all unit tests (vitest)
pnpm test:watch  # watch mode
pnpm lint      # oxlint
pnpm build     # tsc + vite build
```

The three core engines — `diff-engine`, `highlight-engine`, and `segment-merger` — have full unit test coverage (78 tests) covering edge cases: empty strings, no trailing newline, CRLF, inline diff limits, context folding/expansion, search case sensitivity, token inheritance across lines, and three-way range intersection.

## Supported Languages

Syntax highlighting uses refractor, which bundles Prism grammars. Common aliases work out of the box: `js`/`javascript`, `ts`/`typescript`, `jsx`, `tsx`, `py`/`python`, `go`, `rs`/`rust`, `java`, `json`, `css`, `scss`, `sql`, `yaml`, `toml`, `md`/`markdown`, `bash`/`sh`, `c#`/`cs`, `c++`, `html`/`xml`, `docker`, and more.

Unsupported or unknown languages fall back to plain text (no crash).

## License

[MIT](./LICENSE) © quanming1
