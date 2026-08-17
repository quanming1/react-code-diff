# PRD-B2-no-stretch

## 元信息

| 字段 | 值 |
|---|---|
| 阶段 | B2 |
| 名称 | 移除滚动区人工撑高（短 diff 视口空白对齐真实内容） |
| 状态 | 已验收 |
| 创建日期 | 2026-08-17 |
| 定稿日期 | 2026-08-17 |
| 验收日期 | 2026-08-17 |
| 关联文档 | docs/TODO.yaml 阶段 B2；上游引入 commit fc756c6（virtual scroll V2） |

## 1. 背景与目标

- **背景**：V2 把三个滚动区容器写死为 `Math.max(virtual.totalHeight, scrollClientHeight)`——短 diff（Diff Only 折叠后内容 < 视口高）时把 table 人工撑到视口高，内容底部出现大片透明占位（用户实测 562px 容器装 428px 内容）。该撑高无任何功能（背景全透明、不可交互），却让 DOM 尺寸失真、看起来像布局 bug。
- **目标**：滚动区高度一律等于真实内容高（`virtual.totalHeight`），消除视口空白误导。
- **非目标**：不改虚拟滚动计算逻辑（virtual-v2.ts）、不改长文档行为。

## 2. 需求范围

### 2.1 功能需求

- [ ] FR1：preview / unified / split 三视图的滚动区容器高度统一改为 `virtual.totalHeight`（删除 `scrollClientHeight` 撑高参与）。
- [ ] FR2：`scrollClientHeight` state 及其 ResizeObserver 采集若因此不再被消费，一并删除（不留死状态）。
- [ ] FR3：长文档（totalHeight > 视口）行为完全不变——仍可正常滚动、虚拟窗口、reveal 跳转。

### 2.2 非功能需求

- 兼容性：纯内部布局行为，无 API 变更。
- 回归面：reveal 跳转（B1）依赖 scrollTop 落位校验，撑高移除后 scrollHeight 变小不影响长文档；短文档无跳转场景。

## 3. 技术方案

- `CodeDiff.tsx` 三处 `Math.max(virtual.totalHeight, scrollClientHeight)` → `virtual.totalHeight`；
- 删除 `scrollClientHeight` state + measure 中的 `setScrollClientHeight`（ResizeObserver 保留，`containerWidth` 仍需要）。

## 4. 接口定义

无（内部变更）。

## 5. 验收标准

- [ ] AC1：demo（Edit Data，Diff Only）加载后 `.cd-table` 高度 ≈ 渲染层内容高（Playwright 断言，容差 2px），视口剩余区域为 `.cd-scroll` 底色。
- [ ] AC2：Large Data 长文档滚动/搜索/B1 跳转均正常（手动 + e2e 冒烟）。
- [ ] AC3：vitest 140 全过；tsc 零错误。

## 6. 测试计划

- Playwright e2e：短 diff 高度断言 + 「跳转 100-200」在 Large Data 下仍居中定位。
- 手动：demo 三视图 + Diff Only 开关 + Dark 主题过一遍。

## 7. 变更记录

| 日期 | 变更内容 | 理由 |
|---|---|---|
| 2026-08-17 | 初始定稿 | — |
| 2026-08-17 | 开发实施 + 验收：AC1 实测 table 428=内容 428（gap 0，修复前 562/428）；AC2 Large Data 长文档滚动 + B1 跳转 100-200 居中定位 + split/preview 视图均正常 | — |
