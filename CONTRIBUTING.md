# Contributing to react-code-diff

Thanks for your interest in contributing! This guide covers the basics.

## Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/yarn

## Getting Started

```bash
git clone https://github.com/quanming1/react-code-diff.git
cd react-code-diff
pnpm install
pnpm dev      # start the demo at localhost:5173
```

## Project Structure

```
src/
├── code-diff/          # the component library (the actual library)
│   ├── CodeDiff.tsx        # main component + sub-components (Toolbar, SearchBar, rows)
│   ├── CodeDiff.css        # component styles (CSS variables driven)
│   ├── types.ts            # all types & config interfaces
│   ├── diff-engine.ts      # line/word diff computation, collapse, search
│   ├── highlight-engine.ts # refractor syntax highlighting + flatten to lines
│   ├── segment-merger.ts   # merge syntax/diff/search ranges into render segments
│   ├── config-merger.ts    # deep-merge config + colors → CSS vars
│   ├── default-config.tsx  # default theme, font, layout, icons, texts
│   └── index.ts           # public exports
├── App.tsx             # demo app
└── main.tsx            # Vite entry
```

The three-engine architecture (diff → highlight → segment-merge) keeps each concern isolated and testable. When changing behavior, try to modify the relevant engine rather than the rendering layer.

## Development Workflow

1. **Fork & branch** — create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
2. **Code** — follow the existing style (TypeScript, functional components, no class components). Keep changes focused.
3. **Lint** — ensure it passes:
   ```bash
   pnpm lint
   ```
4. **Build** — make sure the build succeeds:
   ```bash
   pnpm build
   ```
5. **Test** — run the demo (`pnpm dev`) and verify your change visually in both `split` and `unified` modes, `dark` and `light` themes.
6. **Commit** — use clear, conventional commit messages:
   ```
   feat: add word-wrap toggle
   fix: incorrect line number on unified view
   refactor: simplify segment merger
   docs: update README props table
   ```
7. **Pull Request** — open a PR against `main`. Describe what changed and why. Include screenshots if the UI changed.

## Coding Conventions

- **TypeScript strict** — no `any` unless absolutely necessary; prefer proper types from `types.ts`.
- **CSS variables** — all colors/fonts/layout go through `--cd-*` CSS variables. Never hardcode colors in components.
- **Performance** — keep heavy computations in `useMemo`; avoid re-rendering rows unnecessarily (see how split-drag uses direct DOM manipulation as a reference).
- **No new dependencies** — prefer using what's already installed. If a new dep is truly needed, justify it in the PR.

## Reporting Bugs

Open an [issue](https://github.com/quanming1/react-code-diff/issues) with:

1. A minimal reproduction (old/new code strings + props used)
2. Expected vs actual behavior
3. Browser and React version

## License

By contributing, you agree your contributions will be licensed under the [MIT License](./LICENSE).
