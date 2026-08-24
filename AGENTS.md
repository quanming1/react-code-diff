# AGENTS.md

## Project: @jiang_quan_ming/react-code-diff

React code diff viewer with virtual scroll, split/unified/preview modes, syntax highlighting, inline diff, search.

## 规范体系（Rondo 方法）

动手前必读三份文档：

1. **docs/PROCESS.md** — PRD 驱动六步闭环（立项→评审→开发→验证→收尾→发布）
2. **docs/TODO.yaml** — 阶段唯一事实源（commit hook 消费；阶段 id 是 feat/fix 提交 scope 的校验依据）
3. **docs/prd/** — PRD 目录（先 PRD 后开发；从 PRD-TEMPLATE.md 复制）

## 工作方式

- 严格按 docs/TODO.yaml 的阶段顺序推进，不跳步、不越权
- 动手前先读相关文档与现有代码，遵循已有模式；不另起一套并行模式
- 不引入未声明的依赖；只改任务范围内的文件
- 改动前确认当前分支：日常开发在 `feature/<阶段>-<任务>` 分支，develop 只 pull 永不本地提交

## Git 强制（全 PR 流）

- `main` 永不直接提交；`develop` 只接受 GitHub PR 合入，本地禁止 merge
- `feat/fix` 的 scope 必须是 TODO 真实阶段 id，且与分支名阶段 id 交叉校验
- `feat` 提交暂存必须包含对应阶段 PRD
- 规范不靠自觉，全部由 `.githooks/` 本地 hook 强制（clone 后执行一次 `git config core.hooksPath .githooks`）

## 提交规范

`<type>(<scope>): <subject>`，subject 中文。

- type 白名单：feat / fix / prd / todos / docs / refactor / test / style / chore / perf
- feat / fix / prd / todos：scope = TODO 阶段 id（如 B1）
- 其他 type：scope = 模块名（core / engine / virtual / hotkey / theme / demo / docs / hooks / release）
- 一条提交只做一件事

## Dev Commands

- `npm run dev` — start demo app (App.tsx)
- `npm run build:lib` — build library dist（当前单包 dist；D 组完成后迁移至 packages/react）
- `npm test` — run vitest（多 project：legacy src + 各 packages）
- `pnpm typecheck` — 全量类型检查（`tsc -b` + 各包 `tsc --noEmit`；注意根 tsconfig 是 solution 风格，`tsc --noEmit` 不追踪 references，勿用）
- `pnpm lint` — oxlint + 依赖方向检查（scripts/check-deps.mjs：core ← tokenizer ← view ← react 单向）

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
