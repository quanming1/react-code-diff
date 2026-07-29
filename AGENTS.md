# AGENTS.md

## Project: @jiang_quan_ming/react-code-diff

React code diff viewer with virtual scroll, split/unified/preview modes, syntax highlighting, inline diff, search.

## Dev Commands

- `npm run dev` — start demo app (App.tsx)
- `npm run build:lib` — build library dist
- `npm test` — run vitest
- `npx tsc --noEmit` — typecheck

## Publish Workflow

**Before publishing, you MUST update CHANGELOG.md:**

1. Run tests: `npx vitest run`
2. Run typecheck: `npx tsc --noEmit`
3. Build: `npm run build:lib`
4. Bump version in `package.json`
5. **Add a new entry to the top of `CHANGELOG.md`** with the version number and all changes
6. Publish: `npm publish --registry https://registry.npmjs.org --access public`
7. Sync to consumer (`E:\binn\ftre-desktop`): update `pnpm-lock.yaml` (3 spots: resolution, specifier+version, package entry) + `pnpm install --frozen-lockfile`

## Key Files

- `src/code-diff/CodeDiff.tsx` — main component, virtual scroll, toolbar, split/unified/preview rendering
- `src/code-diff/diff-engine.ts` — computeDiff, buildVisibleRows, findChangeBlocks, search
- `src/code-diff/CodeDiff.css` — all styling
- `src/code-diff/types.ts` — TypeScript interfaces (CodeDiffProps, ToolbarRenderProps, etc.)
- `src/code-diff/default-config.tsx` — theme colors, token colors, default config
- `vite.lib.config.ts` — library build config (external: react, react-dom, react/jsx-runtime)
- `CHANGELOG.md` — version history (MUST update on every publish)
