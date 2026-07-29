# CodeDiff Search Hotkey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前激活的 `CodeDiff` 实例增加 `Ctrl+F` / `⌘F` 搜索热键，并实现聚焦全选、多实例隔离和两级 Escape。

**Architecture:** 新建无 React 依赖的单例 Hotkey Manager，集中维护注册实例、激活实例与唯一的 document 监听器。`CodeDiff` 只负责激活上报与搜索 UI 动作，现有 Preview/Diff 搜索引擎保持不变。

**Tech Stack:** React 19、TypeScript 6、Vitest 4、Vite 8、浏览器 Keyboard/Pointer/Focus API。

## Global Constraints

- 仅当前激活实例拦截 `Ctrl+F` / `⌘F`；无激活实例时保留浏览器默认搜索。
- `showToolbar={false}` 和 `toolbar.showSearch=false` 不禁用热键。
- 热键重复触发时聚焦并全选已有关键词。
- Escape 有关键词时清空，无关键词时关闭并恢复根节点焦点。
- 不新增运行时依赖，不改变公共 Props，不提交现有工作区改动。

---

### Task 1: Hotkey Manager

**Files:**
- Create: `src/code-diff/hotkey-manager.ts`
- Create: `src/__tests__/hotkey-manager.test.ts`

**Interfaces:**
- Produces: `registerHotkeyInstance(id: symbol, handlers: HotkeyHandlers): () => void`
- Produces: `activateHotkeyInstance(id: symbol): void`
- Produces: `deactivateHotkeyInstance(id: symbol): void`
- Produces: `resetHotkeyManagerForTests(): void`

- [ ] **Step 1: Write failing manager tests**

Use a fake document event target and verify Ctrl/Meta triggering, modifier/repeat rejection, active-instance transfer, default prevention, unregister behavior, and listener teardown.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/__tests__/hotkey-manager.test.ts`
Expected: FAIL because `hotkey-manager.ts` does not exist.

- [ ] **Step 3: Implement minimal manager**

Implement a module-level `Map<symbol, HotkeyHandlers>`, `activeInstanceId`, and one `document` keydown listener. Match `f` case-insensitively when exactly one of Ctrl/Meta is present and Alt/Shift/repeat are false; call `preventDefault()` only after finding an active handler.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/__tests__/hotkey-manager.test.ts`
Expected: all manager tests PASS.

### Task 2: CodeDiff Integration

**Files:**
- Modify: `src/code-diff/CodeDiff.tsx`
- Modify: `src/code-diff/CodeDiff.css` only if focus styling needs suppression/clarification

**Interfaces:**
- Consumes manager registration and activation functions from Task 1.
- Produces internal `openSearch()` and `closeSearch()` callbacks shared by toolbar, hotkey, and SearchBar.

- [ ] **Step 1: Add component-facing behavior tests where possible without a new DOM dependency**

Keep manager behavior automated in Vitest and define browser smoke-test assertions for focus/select/Escape/multi-instance behavior. Do not add jsdom/testing-library solely for this feature.

- [ ] **Step 2: Integrate the manager**

Create a stable per-instance symbol with `useRef`, register `search.open` in an Effect, activate on root `pointerdown`/`focus`, deactivate on document pointerdown outside, and unregister on unmount.

- [ ] **Step 3: Centralize search opening**

Replace inline toolbar focus logic with `openSearch()`. Use a search input ref plus `requestAnimationFrame` to focus and call `select()` after opening; when already open, focus/select immediately.

- [ ] **Step 4: Implement two-level Escape**

Pass `onClose` into `SearchBar`: non-empty query clears it; empty query closes the bar and focuses the `tabIndex={-1}` root.

- [ ] **Step 5: Run typecheck and focused tests**

Run: `npx tsc --noEmit && npx vitest run src/__tests__/hotkey-manager.test.ts`
Expected: typecheck and tests PASS.

### Task 3: Documentation and Validation

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Documents activation scope, `Ctrl+F` / `⌘F`, hidden-toolbar behavior, and Escape semantics.

- [ ] **Step 1: Update user documentation and changelog**

Add the shortcut behavior to the Search section and an Unreleased changelog entry without changing package version.

- [ ] **Step 2: Run complete validation**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build:lib`.
Expected: all tests and typecheck/build pass; lint has no new errors or warnings attributable to the hotkey files.

- [ ] **Step 3: Browser smoke test**

Verify Preview, Split, Unified, hidden toolbar, repeated shortcut selection, two-level Escape, inactive native browser search, and two-instance activation behavior. Record anything not mechanically verifiable.

- [ ] **Step 4: Clean temporary output and inspect Git state**

Run `git diff --check` and `git status --short`; remove temporary test/build files and preserve all pre-existing user changes.
