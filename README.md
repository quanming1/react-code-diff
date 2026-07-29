# react-code-diff

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@jiang_quan_ming/react-code-diff.svg)](https://www.npmjs.com/package/@jiang_quan_ming/react-code-diff)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6.svg)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vite.dev)
[![Tests](https://img.shields.io/badge/Tests-78%20passed-brightgreen.svg)](#)

A high-performance React component for rendering **GitHub-style code diffs** with syntax highlighting, inline word-level diff, in-diff search, collapsible context, resizable split view, and full theming support.

Built on [`diff`](https://github.com/kpdecker/jsdiff) for diff computation and [`refractor`](https://github.com/wooorm/refractor) (Prism-based) for syntax highlighting.

## Features

- **Split & Unified views** â€?GitHub-style side-by-side or unified diff layout
- **Syntax highlighting** â€?40+ languages via refractor (Prism), token colors fully themeable
- **Inline word-level diff** â€?highlights the exact words/characters that changed within a modified line
- **In-diff search** â€?debounced search with match navigation, case-sensitivity toggle, and auto-scroll
- **Collapsible context** â€?GitHub-style "show N hidden lines" folding with configurable context lines
- **Change navigation** â€?jump between changed blocks with prev/next buttons
- **Resizable split** â€?drag the divider to adjust left/right ratio (direct DOM, no re-renders during drag)
- **Light & Dark themes** â€?GitHub Primer-inspired palettes, switch via a single prop
- **Fully configurable** â€?deep-mergeable config covering colors, fonts, layout, icons, texts, toolbar, and diff behavior
- **Custom toolbar** â€?render your own toolbar via the `renderToolbar` prop
- **Copy to clipboard** â€?one-click copy of old/new code
- **Large file protection** â€?auto-disables inline diff / highlighting above configurable char/line limits
- **No trailing newline indicator** â€?shows `\ No newline at end of file` when appropriate
- **TypeScript** â€?fully typed, ships types out of the box

## Screenshot

> _Add a screenshot or GIF here after first release._

## Installation

```bash
npm install @jiang_quan_ming/react-code-diff
# or
pnpm add @jiang_quan_ming/react-code-diff
# or
yarn add @jiang_quan_ming/react-code-diff
```

Then import the component and its styles:

```tsx
import { CodeDiff } from '@jiang_quan_ming/react-code-diff'
import '@jiang_quan_ming/react-code-diff/style.css'
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

## Quick Start

```tsx
import { useState } from 'react'
import { CodeDiff } from '@jiang_quan_ming/react-code-diff'
import '@jiang_quan_ming/react-code-diff/style.css'

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
// Side-by-side (default) â€?drag the divider to resize
<CodeDiff oldValue={old} newValue={new} viewMode="split" />

// Unified â€?old and new stacked in a single column
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

The built-in search bar (toggle via the search icon in the toolbar) supports case-sensitive matching and prev/next navigation. After clicking or focusing a `CodeDiff`, press `Ctrl+F` (Windows/Linux) or `Command+F` (macOS) to open its search and select the current query. This shortcut also works when the toolbar or search button is hidden; when no `CodeDiff` is active, the browser's native find remains available. Press `Escape` once to clear a non-empty query, then again to close search and return focus to the diff.

Listen to match changes:

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
import type { ToolbarRenderProps } from '@jiang_quan_ming/react-code-diff'

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
| `oldValue` | `string` | â€?| Old code (required) |
| `newValue` | `string` | â€?| New code (required) |
| `language` | `string` | `'typescript'` | Language for syntax highlighting (aliases supported, e.g. `ts`, `js`, `py`) |
| `fileName` | `string` | â€?| File name shown in the toolbar |
| `viewMode` | `'split' \| 'unified'` | `'split'` | Diff layout mode |
| `theme` | `'light' \| 'dark'` | `'dark'` | Color theme |
| `showLineNumbers` | `boolean` | `true` | Show line number gutter |
| `showToolbar` | `boolean` | `true` | Show the built-in toolbar |
| `showDiffOnly` | `boolean` | `true` | Collapse unchanged context to only show changes + N context lines |
| `contextLines` | `number` | `3` | Context lines around each change block (used when `showDiffOnly`) |
| `wrapLines` | `boolean` | `false` | Soft-wrap long lines |
| `highlightInlineChanges` | `boolean` | `true` | Enable word-level inline diff on modified lines |
| `maxHeight` | `number \| string` | â€?| Max height of the scroll area (e.g. `500`, `'70vh'`) |
| `resizableSplit` | `boolean` | `true` | Enable drag-to-resize in split mode |
| `splitRatio` | `number` | `0.5` | Initial left/right ratio (0â€?), controlled |
| `onSplitRatioChange` | `(ratio: number) => void` | â€?| Called when the user finishes dragging the divider |
| `config` | `PartialConfig` | â€?| Deep-merged over the default config (see below) |
| `renderToolbar` | `(props: ToolbarRenderProps) => ReactNode` | â€?| Custom toolbar renderer |
| `onCopy` | `(which, text) => void \| boolean` | â€?| Intercept copy; return `false` to prevent, `true` to skip default |
| `onLineClick` | `(row, index) => void` | â€?| Called when a diff row is clicked |
| `onSearchMatchChange` | `(match, total) => void` | â€?| Called when the active search match changes |
| `onDiffComputed` | `(stats) => void` | â€?| Called with `{ additions, deletions }` after diff is computed |
| `className` | `string` | â€?| Extra class on the root element |
| `style` | `React.CSSProperties` | â€?| Inline styles on the root element |

## Configuration

Pass a `config` prop to override any part of the default config. Overrides are **deep-merged**, so you only need to specify what you want to change.

```tsx
import { CodeDiff, mergeConfig } from '@jiang_quan_ming/react-code-diff'

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

Each color object covers backgrounds, added/removed colors, gutter, search highlight, collapse, toolbar, accent, and a full set of syntax token colors â€?all exposed as CSS variables at runtime.

## Themes

Two built-in themes ship out of the box, both GitHub-Primer-inspired:

- `theme="dark"` â€?dark background (`#0d1117`)
- `theme="light"` â€?light background (`#ffffff`)

Switching is zero-JS-cost: the component sets CSS variables on the root element, so theme changes never re-render rows.

To customize colors, override the `colors.dark` / `colors.light` entries in `config`.

## Testing

```bash
pnpm test      # run all unit tests (vitest)
pnpm test:watch  # watch mode
pnpm lint      # oxlint
pnpm build     # tsc + vite build
```

The three core engines -- `diff-engine`, `highlight-engine`, and `segment-merger` -- have full unit test coverage (78 tests) covering edge cases: empty strings, no trailing newline, CRLF, inline diff limits, context folding/expansion, search case sensitivity, token inheritance across lines, and three-way range intersection.

## Publishing to npm

This project uses a separate Vite library-mode config (`vite.lib.config.ts`) to build the publishable bundle. The demo app (`vite.config.ts`) is for development only.

### Build the library

```bash
pnpm build:lib
```

This runs `vite build --config vite.lib.config.ts`, which produces:

- `dist/index.js` -- ESM bundle (react/react-dom/diff/lucide-react/refractor externalized)
- `dist/style.css` -- component styles
- `dist/*.d.ts` -- TypeScript type declarations (via `vite-plugin-dts`)

### Verify the package contents

```bash
npm pack --dry-run
```

Confirm the tarball only contains `dist/`, `README.md`, `LICENSE`, and `package.json` -- no source, demo, or `node_modules`.

### Publish

```bash
# Bump version in package.json first (npm version patch/minor/major)

# Publish to the official npm registry
npm publish --registry https://registry.npmjs.org/ --access public
```

> **Note:** If your default registry is set to a mirror (e.g. npmmirror), you must pass `--registry https://registry.npmjs.org/` explicitly.

> **2FA:** If your npm account has two-factor authentication enabled, either pass `--otp <code>` with a 6-digit code from your authenticator app, or create a Granular Access Token with "Bypass 2FA" enabled at [npmjs.com/settings](https://www.npmjs.com/settings) -> Access Tokens -> Generate New Token.

### Version bumping

```bash
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.0 -> 1.1.0
npm version major   # 1.0.0 -> 2.0.0
```

Then `pnpm build:lib && npm publish --registry https://registry.npmjs.org/ --access public`.

## Supported Languages

Syntax highlighting uses refractor, which bundles Prism grammars. Common aliases work out of the box: `js`/`javascript`, `ts`/`typescript`, `jsx`, `tsx`, `py`/`python`, `go`, `rs`/`rust`, `java`, `json`, `css`, `scss`, `sql`, `yaml`, `toml`, `md`/`markdown`, `bash`/`sh`, `c#`/`cs`, `c++`, `html`/`xml`, `docker`, and more.

Unsupported or unknown languages fall back to plain text (no crash).

## License

[MIT](./LICENSE) Â© quanming1
