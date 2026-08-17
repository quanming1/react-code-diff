# PRD-C1: wrap 模式滚动性能优化（估算精确化 + 消除测量级联）

## 元信息

| 项 | 值 |
|---|---|
| 阶段 id | C1 |
| 状态 | approved |
| 类型 | perf |
| 影响模块 | `src/code-diff/char-metrics.ts`（新增）、`src/code-diff/CodeDiff.tsx`、`src/code-diff/virtual-v2.ts` |
| 关联 | A3（virtual-v2 架构）、A1（wrap 布局） |

## 背景与问题

`wrapLines` 开启后滚动明显卡顿。实测（demo Large Data ~2000 行 tsx、unified、Diff Only 关闭、程序化分帧滚动 2000px）：

| 场景 | 平均帧耗时 | 卡顿帧（>25ms） |
|---|---|---|
| 不换行 | 151ms | 12/81 |
| wrap 首次滚动 | 586ms | 47/81 |
| wrap 二次滚动（测量已收敛） | 107ms | 11/81 |

### 根因

wrap 模式行高依赖折行数，`rowHeights` 用估算公式预测：

```
charW = (font.size + 1) * 0.6          // ① 等宽 advance 纯近似
visualLen(s)                            // ② CJK/全角按 1 倍宽计（真实为 2 倍）
gutterW = digits * (font.size * 0.6) + 16  // ③ 行号槽宽度近似（ch 单位）
split availW = containerWidth * min(ratio, 1-ratio)  // ④ 列宽推算而非实测
```

估算 ≠ 实测 → `virtual-v2` 的 DOM 测量布局效应每个新见行都触发 `bit.set` → rAF → `setRange` → 重渲染 → 再测量，形成级联；每次重渲染伴随整窗行重挂载（wrap 下每行 span 数更多）。首次滚动 2000px 内持续级联（wrap#1 与 wrap#2 差 5.5 倍即为证据：二滚时 BIT 已是实测值，`prev === height` 成立，零级联）。

次要问题：
- 非 wrap 模式高度恒定且精确，但测量布局效应仍每帧遍历 children 读 `offsetHeight`（强制同步布局）。
- split 双列 `minHeight` 无条件写入（即使值未变）。
- `rowHeights` 因 `containerWidth` 微变重建时，effect 会把 BIT 中已收敛的实测值重置回估算值（拖 split 手柄时反复级联）。

## 目标

wrap 首次滚动性能逼近不换行模式；消除测量级联；不改变任何渲染行为与视觉。

## 需求范围（FR）

### FR1 字符宽度精确度量（char-metrics）

新增 `src/code-diff/char-metrics.ts`：

- `measureCharMetrics(fontFamily, codeFontSize, gutterFontSize)`：canvas `measureText` 实测半角（`'0'`）与全角（CJK 样本）advance，返回 `{ halfWidth, fullWidth, gutterCharWidth }`；无 canvas 环境（SSR/测试）返回 `null`。
- `visualWidth(s, halfWidth, fullWidth, tabSize=4)`：按字符 code point 加权求宽度（ASCII→half；全角区段→full；tab→下一 4 半角倍数），供折行数估算。
- `isFullWidth(code)`：East Asian Wide/Fullwidth 区段判定（纯函数，可单测）。
- 回退：metrics 为 `null` 时沿用现有 0.6 近似（行为不劣化）。

### FR2 估算公式精确化（CodeDiff rowHeights）

wrap 分支估算改用 FR1 度量：

- `charW` → `metrics.halfWidth`（回退 0.6 近似）；`visualLen` → `visualWidth`（CJK 双宽）。
- `gutterW` → `metrics.gutterCharWidth * digits + 16`（对齐 CSS `ch` 单位；回退近似）。
- split 的 `availW` 优先用实测列宽 `leftColW`/`rightColW`（未测出时回退 ratio 推算）。

### FR3 消除测量级联（virtual-v2）

- opts 新增 `variableHeights: boolean`：`false`（非 wrap）时跳过 DOM 测量布局效应（高度恒定，估算即精确）；`true` 行为不变。
- 测量收敛保护：`rowHeights` 数组重建同步 BIT 时，已实测行（`measuredHeights` 有值）保留实测值，不被估算覆盖。
- 新增 `clearMeasured()`：宽度真变时由组件调用，显式作废收敛缓存重测。
- split `minHeight` 只在值变化时写 DOM（先读后写）。

## 非目标

- 不改变 wrap 折行 CSS 行为（`pre-wrap` + `break-all` 不动）。
- 不优化 hover 状态渲染、搜索高亮等与本阶段无关路径。
- 不处理 dev 模式 React 本身开销（生产构建下绝对值都会更低，本阶段以相对值验收）。

## 技术方案

### 为什么估==实就能消级联

`virtual-v2` 测量布局效应仅在 `measuredRef` 中缓存值与 DOM `offsetHeight` 不同时才 `bit.set` + 触发重渲染。估算精确后（等宽字体 + `break-all` 折行 ⇒ 折行数 = `ceil(visualWidth / availW)`），新见行首次渲染即 `prev === height`，级联归零——即 nowrap 现状（其估算恒等于真实）。

### 度量时机

metrics 在 `containerWidth` 首次可用时于 layout effect 中测量（依赖 `config.font.family` / `config.font.size`），存 state；字体配置不变则只测一次。

### 宽度变化语义

`containerWidth` / `leftColW` / `rightColW` 变化 → 调用 `clearMeasured()` + `rowHeights` 重算（新估算）→ BIT 全量按估算重置 → 可见行重测收敛。拖 split 手柄期间 ResizeObserver 高频触发，仅可见行（~30 行）参与重测，成本可控。

## 验收标准（AC）

- **AC1** demo Large Data、unified、wrap 首次滚动（同基准脚本）：平均帧耗时 ≤ nowrap 的 1.5 倍。
- **AC2** wrap 开启后 `scrollHeight` 与收敛后值差 < 1%（估算首次即接近真实，无大幅跳动）。
- **AC3** 非 wrap 模式跳过 DOM 测量：滚动期间测量布局效应零 `bit.set`（代码路径 + 单测）。
- **AC4** vitest 全量通过；新增 char-metrics（`visualWidth`/`isFullWidth`/回退）与 virtual-v2（`variableHeights=false` 跳过、`clearMeasured`、实测保留）单测。
- **AC5** 无行为回归：preview/unified/split × wrap/nowrap × reveal 跳转高亮正常（demo 手动验证）。

## 测试计划

- 单测：`char-metrics.test.ts`（全角区段边界：0x1100/0x2E80/0xFF01/tab 步进/emoji 代理对/空串；canvas 缺失返回 null）；`virtual-v2` 新用例（uniform 跳过测量、clearMeasured 后重测、估算重建不覆盖实测）。
- 基准：PRD 背景同款脚本，修复前后对照（表格留档于 PR）。
- 回归：vitest 全量 + demo 三视图手动。

## 变更记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-08-17 | 初版（诊断数据 + FR1-FR3 + AC1-AC5） | approved |
