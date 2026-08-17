# Changelog

## Unreleased

- Perf: wrap mode scroll performance (C1) — canvas-measured char advance (ASCII/CJK double-width via `char-metrics.ts`) replaces the `0.6` heuristic in wrap line-height estimation, gutter width and split column widths now use real measured values; first-scroll average frame time drops from 586ms to 17ms (parity with nowrap), estimate error vs converged height 0%
- Perf: virtual-v2 skips the DOM measurement loop entirely when heights are uniform (non-wrap); measured row heights survive estimate-array rebuilds (`syncHeightsToBit`), and a width signature invalidates stale measurements on resize

- Feature: line reveal & range highlight (B1) — new `revealLine` / `revealEndLine` / `revealNonce` props scroll the view to a target new-file line (centered) and paint a VSCode-style highlight band across the `[revealLine, revealEndLine]` range (line numbers bolded, 2px left accent, light/dark themes)
- Feature: reveal auto-expands collapsed sections (`showDiffOnly`) covering the target range before jumping; works in preview / unified / split modes
- Fix: `virtual-v2.scrollToIndex` assignment could be clamped to 0 when the scrollable height had not committed yet (e.g. right after expanding a collapsed section) — now verifies the landed offset and retries on subsequent frames (max 10)
- Fix: scroll containers no longer stretch to viewport height when content is shorter (B2) — table/wrapper height now equals real content height, removing the misleading blank area below short diffs (Diff Only with folded sections)
- Fix: demo app no longer force-stretches `CodeDiff` with `flex: 1` — `flex: 0 1 auto` lets the component shrink to content height when short and scroll within the available space when tall (B2)

## 1.2.0

- Breaking: removed `LayoutConfig.gutterMinWidth` and `DiffConfig.ignoreWhitespace` config fields — update custom configs that set these
- Feature: virtual scroll V2 (Monaco-inspired ref + rAF architecture) — `scrollTop` lives in a ref, React state only updates when the visible range actually changes, eliminating per-pixel re-renders
- Feature: `prefix-sum.ts` (MutablePrefixSum / Binary Indexed Tree) — single row height changes are O(log n) instead of O(n) full rebuild; `virtual-v2.ts` is now the active engine in `CodeDiff`
- Feature: `Ctrl+F` (Windows/Linux) / `Command+F` (macOS) opens, focuses, and selects the in-diff search query on the active `CodeDiff` in preview, split, and unified modes
- Feature: search shortcuts remain available with a hidden toolbar; `Escape` clears the query first, then closes search and restores diff focus
- Feature: `hotkey-manager.ts` — instance-aware hotkey registration with document-level singleton; only the focused `CodeDiff` responds, outside-click deactivates
- Feature: OneLight token theme for light mode (24 new token-type CSS variables: symbol, tag, number, char, attr-value, operator, method, builtin, constant, important, entity, decorator, annotation, namespace, generic, module, maybe-class-name, parameter, interpolation, interpolation-punctuation, property-access, script-punctuation, script)
- Feature: default toolbar replaces copy buttons with wrap / split-unified / diff-only toggles (internal state); `renderToolbar` API exposes `wrapLines`/`viewMode`/`showDiffOnly` + setters
- Feature: `inlineDiffLineLimit` now counts changed lines (not total file lines), so inline diff engages more reliably on large files with few changes
- Refactor: `diff-engine` no longer pairs removed+added into `modified` rows — removed and added lines are emitted as contiguous blocks; inline diff still computed where lengths align
- Fix: `normalize('')` returns `noTrailingNewline: true` (was `false`)
- Perf: `refractor` language registration moved to lazy `ensureLangsRegistered()` (no top-level `register` calls)

## 1.1.7

- Feature: `renderToolbar` API enhanced with setter functions (`onSetWrapLines`, `onSetViewMode`, `onSetShowDiffOnly`) for direct control (not just toggle)
- Docs: added `CHANGELOG.md` and `AGENTS.md` with publish workflow instructions

## 1.1.6

- Fix: context row hover shows gray background (was missing)
- Fix: removed/added row hover uses `brightness(0.92)` to deepen red/green
- Fix: removed JS `style.background` hover override that caused gray flash

## 1.1.5

- Fix: `effectiveWrap`/`effectiveViewMode` leftover references causing runtime error
- Fix: `cd-collapse` text left-aligned (was centered)
- Fix: hover no longer turns gray — context rows get `var(--cd-line-hover)`, diff rows get `brightness(0.92)`
- Fix: removed unused `mergeInlineParts` function and `ReactNode` import
- Fix: `copy` icon made optional in `IconsConfig`
- Feature: default toolbar now has wrap / split-unified / diff-only toggle buttons (internal state)
- Feature: `renderToolbar` API enhanced with `onSetWrapLines`, `onSetViewMode`, `onSetShowDiffOnly` setters
- Feature: toolbar config flags `showWrapToggle`, `showViewModeToggle`, `showDiffOnlyToggle`
- Feature: new icons in config: `wrap`, `split`, `unified`, `diffOnly`

## 1.1.4

- Fix: unified mode no longer alternates red/green — removed/added lines grouped into contiguous blocks
- Fix: `inlineDiffLineLimit` now counts changed lines (not total file size)
- Fix: removed JS hover `style.background` override, switched to CSS `filter: brightness(0.92)`
- Feature: default toolbar replaces copy buttons with wrap / split-unified / diff-only toggles
- Feature: internal state for `wrapLines`, `viewMode`, `showDiffOnly` (toggle from toolbar)

## 1.1.3

- Fix: scroll-to-top bug when expanding collapsed sections
- Fix: `autoScrollToFirstChange` only fires once on diff ready, not on expand/collapse
- Refactor: deleted `SplitRow`, `sparse-line-heights`, unified V1/V2 interface
- Fix: `normalize('')` returns `noTrailingNewline: true`
- Perf: `refractor.register` moved to lazy init
- Perf: virtual scroll BIT incremental sync, dirty guard on measurement

## 1.1.2

- Fix: DiffOnly toggle freeze — BIT operation moved from render to useEffect

## 1.1.1

- Fix: expanding collapsed section no longer jumps to top

## 1.1.0

- Feature: V2 virtual scroll with BIT (binary indexed tree) for O(log n) updates
- Feature: sparse line heights, prefix-sum module
- Feature: dynamic measurement with measured/estimated hybrid heights
- Feature: split mode with independent horizontal scrollbars
- Feature: hover sync across split columns via JS highlight
- Feature: OneLight token theme with per-token CSS variables (37 types)
- Feature: `renderToolbar` prop for custom toolbar
- Feature: async diff computation for large files (>30KB threshold)

## 1.0.9

- Fix: width adaptation when resizing container (`width: 100%, minWidth: contentWidth`)

## 1.0.2 - 1.0.8

- Initial releases with virtual scroll, wrap mode, split/unified/preview modes
