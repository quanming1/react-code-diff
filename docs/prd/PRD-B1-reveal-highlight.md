# PRD-B1-reveal-highlight

## 元信息

| 字段 | 值 |
|---|---|
| 阶段 | B1 |
| 名称 | 行号跳转与区间高亮（revealLine / revealEndLine） |
| 状态 | approved |
| 创建日期 | 2026-08-17 |
| 定稿日期 | 2026-08-17 |
| 关联文档 | docs/TODO.yaml 阶段 B1；AGENTS.md；消费方 ftre-desktop FileTab（revealLine/revealEndLine/revealNonce） |

## 1. 背景与目标

- **背景**：消费方（ftre-desktop Inspector 的文件预览）已携带 `revealLine` / `revealEndLine` / `revealNonce` 字段，但本库无对应能力。两类场景缺失：① 点击 AI 消息中的 `file://…#L42` 链接，预览应跳到第 42 行；② read 工具读了 100-200 行，预览应像 VSCode 一样高亮这段行区间并定位到起始行。
- **目标**：新增三个 props——`revealLine`（跳转定位）、`revealEndLine`（高亮区间结束）、`revealNonce`（复用触发器）；跳转用虚拟滚动 `scrollToIndex` 居中定位，高亮呈现 VSCode 风格半透明色带（内容区 + 行号槽 + 左侧 accent）。
- **非目标**：不做持续选中/多区间、不做编辑态、不做高亮颜色配置化（用内置 light/dark 两套；消费方需要自定义时后续再加 config）。

## 2. 需求范围

### 2.1 功能需求

- [ ] FR1：`revealLine`（1-based 新文件行号）传入时，滚动定位到该行并**垂直居中**；三视图（preview / unified / split）均支持。
- [ ] FR2：`revealEndLine` 传入时，`[revealLine, revealEndLine]` 形成连续高亮带（行号槽数字加粗着色；内容行半透明金色 overlay + 左缘 2px accent）；未传时仅高亮 `revealLine` 单行。
- [ ] FR3：`revealNonce` 变化（或 revealLine/revealEndLine 变化）重新触发定位；`revealLine` 传 `undefined` 清除高亮带。
- [ ] FR4：行号越界自动钳制到 `[1, 新文件总行数]`；`end < start` 时交换；均为纯函数可测。
- [ ] FR5：diff 视图（showDiffOnly 折叠态）目标行在折叠区段内时，**自动展开**该区段再定位；preview 视图无折叠直接定位。
- [ ] FR6：diff 视图行号映射优先取 `right.lineNumber`（新文件），仅删除行场景回退 `left.lineNumber`。

### 2.2 非功能需求

- 性能：定位复用现有 `scrollToIndex`（前缀和 BIT，O(log n)）；高亮判定为行渲染时的 O(1) 区间比较，不引入每行回调分配。
- 兼容性：纯增量 props，无破坏性变更；未传时行为与现有完全一致。
- 主题：light/dark 两套高亮色，跟随现有 `data-theme`。

## 3. 技术方案

- **`src/code-diff/reveal.ts`（新，纯逻辑）**：
  - `normalizeRevealRange(revealLine, revealEndLine, totalLines)` → `{start, end} | null`（null=清除）；钳制/交换规则 FR4。
  - `findRowIndexByLineNumber(rows, line)` → `originalIndex`（FR6 优先级）。
  - `findSectionsForRange(rows, showDiffOnly, contextLines, fromIdx, toIdx)` → `number[]`（重放 buildVisibleRows 的 sectionId 算法，返回与行区间相交的折叠区段 id，用于 FR5 自动展开）。
- **`types.ts`**：CodeDiffProps 增加 `revealLine?: number; revealEndLine?: number; revealNonce?: number`。
- **`CodeDiff.tsx`**：
  - `revealRange = useMemo(normalizeRevealRange(...))`；
  - 定位 `useLayoutEffect`（依赖 revealLine/revealEndLine/revealNonce/diffReady/viewMode/visibleRows）：preview → `vi = start-1` 直接定位；diff → FR5 展开（`setExpandedSections` 合并）+ `findVisibleIndex` + `scrollToIndex(vi, 'center')`，rAF 一帧后执行；
  - 行渲染：PreviewRow / UnifiedRow / SideView 增加 `revealRange` prop，行号命中区间时行容器加 `cd-reveal-band` class、gutter 加 `cd-reveal-gutter` class。
- **`CodeDiff.css`**：`.cd-reveal-band` 用 `background-image: linear-gradient(半透明金)` 叠加在 diff 底色之上（不遮蔽 added/removed 色）；左缘 `box-shadow: inset 2px 0 0` accent；`.cd-reveal-gutter` 数字加粗 + accent 色；dark 主题降不透明度。

## 4. 接口定义

```ts
/** 定位与高亮：滚动到新文件第 revealLine 行（1-based），居中显示 */
revealLine?: number
/** 高亮区间结束行（含，1-based）；缺省时仅高亮 revealLine 单行 */
revealEndLine?: number
/** 递增触发重新定位（内容不变复用组件时递增即可） */
revealNonce?: number
```

## 5. 验收标准

- [ ] AC1：preview 视图传 `revealLine=100` → 滚动到第 100 行且居中，该行带高亮。
- [ ] AC2：`revealLine=100 revealEndLine=200` → 100~200 连续色带，定位在 100；行号槽同步高亮。
- [ ] AC3：`revealNonce` 递增（行不变）→ 重新滚动定位。
- [ ] AC4：越界（revealLine=99999）钳制到最后一行；end<start 自动交换。
- [ ] AC5：showDiffOnly 折叠场景目标行在折叠段内 → 该段自动展开并定位。
- [ ] AC6：`npx vitest run` 全过（含 reveal 新用例）；`npx tsc --noEmit` 零错误；demo 手动验证通过。

## 6. 测试计划

- 单元（`src/code-diff/__tests__/reveal.test.ts`，node 纯逻辑）：normalizeRevealRange（正常/交换/钳制/清除/单行）、findRowIndexByLineNumber（新文件优先/仅删除行回退/不存在）、findSectionsForRange（无折叠返回空/单段/跨段）。
- 手动：demo 应用加「跳转 100-200」按钮，preview 与 split+showDiffOnly 两种场景各验一次。

## 7. 变更记录

| 日期 | 变更内容 | 理由 |
|---|---|---|
| 2026-08-17 | 初始定稿 | — |
