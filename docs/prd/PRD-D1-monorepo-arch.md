# PRD-D1: Monaco 式架构重构总纲（monorepo 分包 + 数据渲染分离 + 全自研）

> 本文档是 D 组（Monaco 式架构重构）的**总纲**：定义整体目标、包划分、分层架构、事件模型、渲染管线与对外契约。
> 各子阶段（D2~D6）开工前各自独立撰写细化 PRD，本文档是它们的架构依据。

## 元信息

| 字段 | 值 |
|---|---|
| 阶段 | D1（总纲，覆盖 D1~D6 架构定义） |
| 名称 | Monaco 式架构重构总纲 |
| 状态 | 草稿 → 评审 → approved |
| 创建日期 | 2026-08-18 |
| 关联文档 | docs/TODO.yaml（D 组）；docs/prd/PRD-TEMPLATE.md；AGENTS.md |

## 1. 背景与目标

### 背景

当前 `@jiang_quan_ming/react-code-diff`（1.3.0）是单包 React 组件：
- 数据（diff 结果、token 高亮）与渲染（React 组件树）**耦合**，props 一变 → 全树重渲染 → 可见行 DOM 全量重建。
- 高亮依赖 refractor（Prism），在渲染期**全量同步 tokenize**，无缓存、无增量。
- 消费端（ftre-desktop）多 tab 切换 diff 时，每个 tab 一套完整 DOM，切换即销毁重建，DOM 数量与切换延迟随文件增大线性恶化。

参考 VSCode Monaco 的核心思想：**数据与渲染严格分离**——TextModel（纯数据）+ ViewModel（投影/视口）+ View（命令式 DOM 行池）。切 tab = `setModel()` 换数据源，View 行池常驻复用，DOM 数量恒定（= 可见行 × 常量）。

### 目标

将 code_diff 重构为 **monorepo 多包架构**：
1. **全自研**：文本模型、diff 引擎、词法高亮引擎全部自研（零运行时外部依赖），不再依赖 `diff` / `refractor`。
2. **数据/渲染分离**：core（数据）+ tokenizer（数据）+ view（命令式渲染）+ react（React 壳）。切 tab / 换 props 只换数据，DOM 池复用。
3. **对外 API 零破坏**：`@jiang_quan_ming/react-code-diff` 对外组件 props 与 1.3.0 完全兼容，消费端（ftre-desktop）换包不改代码。

### 非目标

- **不做 Monaco 全功能**：无编辑/光标/选区输入、无撤销重做、无 minimap、无断点/诊断 gutter。
- **不兼容 TextMate/Monarch 语法定义**：自研词法引擎使用自定义规则格式（受 Monarch 启发但独立实现），不承诺加载 .tmLanguage/.monarch 文件。
- **不做浏览器老版本兼容**：目标现代 Chromium/WebKit/Firefox（与消费端 Electron 一致）。
- **不在 D 组内引入 React 19 之外的框架**：view 层纯 TS + DOM API。
- **不改变视觉样式**：重构前后 demo 视觉一致（OneLight/Dark 主题、三视图、折叠、reveal、搜索高亮）。

## 2. 需求范围

### 2.1 功能需求

#### FR1：monorepo 工程骨架（D1）
- [ ] FR1.1 pnpm workspace，包划分：`@cd/core` / `@cd/tokenizer` / `@cd/view` / `@cd/react`，根 `package.json` 只做编排。
- [ ] FR1.2 统一工具链：根 `test` / `typecheck` / `build` 命令覆盖全部包；vitest 单仓多 project 配置。
- [ ] FR1.3 现有 `src/code-diff` 在 D1 期间保持可运行（D 组完成后移除），demo 不中断。
- [ ] FR1.4 依赖方向严格单向：core ← tokenizer ← view ← react；禁止反向/跨层依赖（lint 强制）。

#### FR2：core 数据层（D2）
- [ ] FR2.1 自研文本模型：分块行缓冲（PieceTree 简化版或 chunked line array），行访问/行数 O(log n)~O(1)，行 hash 支持增量失效。
- [ ] FR2.2 自研 diff 引擎：Myers O(ND) + 启发式优化（对齐 Monaco `DefaultLinesDiffComputer` 思路），输出行级映射（changed/added/removed/context + 行号）。
- [ ] FR2.3 事件系统：`Emitter<T>` / `Event<T>`（Monaco 风格），数据变更事件化（内容、token、decoration 三类独立事件）。
- [ ] FR2.4 数据模型：`DiffModel`（old/new 文本 + diff 结果 + 行数据 + 装饰数据）纯 TS 无 DOM，可缓存（内容 hash → model 复用）。

#### FR3：tokenizer 全自研（D3）
- [ ] FR3.1 词法引擎：规则驱动状态机（正则规则表 + 状态栈），支持嵌套状态（字符串/注释/模板串/JSX 混合）。
- [ ] FR3.2 按行 tokenize + 跨行状态持久化（字符串跨行、块注释跨行、模板跨行在后续行继续正确着色）。
- [ ] FR3.3 行级 token 缓存：行内容 hash → token 数组；命中不重算；单行失效只影响该行及其后跨行状态链。
- [ ] FR3.4 语言定义（首发）：typescript / javascript / jsx / tsx / json / css / html / markdown / bash / python / yaml / plaintext；注册表可扩展。
- [ ] FR3.5 主题映射：token type → CSS class（沿用现有 OneLight/Dark token 色板），输出 FlatToken 兼容结构。

#### FR4：view 命令式渲染层（D4）
- [ ] FR4.1 行池：`ViewLine` 对象池常驻，滚动纯 transform 平移；可见行集合变化走首尾局部 insert/delete（Monaco `RenderedLinesCollection` 风格）。
- [ ] FR4.2 脏标记渲染：数据事件 → 受影响行标记脏 → rAF 合并 → 仅脏行重渲染（StringBuilder 拼 HTML 一次性 innerHTML）。
- [ ] FR4.3 虚拟滚动：BIT 前缀和 + 滚动 ref（复用 virtual-v2 经验，纯命令式，React 不参与滚动）。
- [ ] FR4.4 装饰层：reveal 高亮带 / 搜索高亮 / inline diff 着色作为**装饰数据**叠加，不触发整行重渲染。
- [ ] FR4.5 `setModel(model)`：换数据源 → 清行池 → 全脏 → 重渲染可见行；DOM 容器与行池复用（tab 切换核心）。
- [ ] FR4.6 三视图：unified / split / preview 在 view 层实现（split 双列 = 两个 view 实例共享 model）。

#### FR5：react 壳（D5）
- [ ] FR5.1 `CodeDiff` 对外组件 props 与 1.3.0 **完全兼容**（含 revealLine/revealEndLine/revealNonce/renderToolbar/onLineClick 等全部现有 props）。
- [ ] FR5.2 内部 `useRef` 挂载 View 实例；props 变化 → 增量 `setModel`/配置更新（React 只渲染外壳与工具栏）。
- [ ] FR5.3 工具栏/搜索框/切换按钮保持 React 组件（现有 Toolbar/SearchBar 迁移），与 view 层通过事件/命令交互。
- [ ] FR5.4 diff 结果缓存：相同 old/new 内容直接复用 DiffModel，切换零重算。

#### FR6：性能与验收（D6）
- [ ] FR6.1 基准工具：playwright 脚本采集 DOM 节点数 / tab 切换耗时 / 滚动帧率，前后对比数据入 PR。
- [ ] FR6.2 量化目标（demo Large Data 2000 行 tsx）：DOM 节点数 = 可见行 × 常量（±10%）；tab 切换（setModel）< 16ms；滚动平均帧 ≤ 17ms。
- [ ] FR6.3 功能等价：重构后三视图/折叠/reveal/搜索/换行/diff-only 行为与 1.3.0 视觉一致（demo 手动 + 截图对比）。
- [ ] FR6.4 消费端迁移：ftre-desktop 换包（pnpm workspace 或 registry 发布），FileRenderer 零代码改动跑通。

### 2.2 非功能需求

- **性能**：见 FR6.2；tokenize 全量异步不阻塞首帧（大文件先纯文本渲染再逐行补高亮）。
- **兼容性**：对外包名保持 `@jiang_quan_ming/react-code-diff`（react 包发布名不变）；内部包可私有或发布。
- **可测试性**：core/tokenizer 纯逻辑 node 环境 vitest（现有模式）；view 层 DOM 测试用 playwright（无 jsdom 依赖）。
- **体积**：core+tokenizer 零运行时依赖；react 包 peerDependencies react/react-dom。

## 3. 技术方案

### 3.1 包结构与依赖

```
E:\code_diff\
├── pnpm-workspace.yaml          # packages/*
├── package.json                 # 根：workspace 编排 + 统一脚本
├── packages/
│   ├── core/        @cd/core        # 文本模型 / diff 引擎 / 事件 / 类型（零依赖）
│   ├── tokenizer/   @cd/tokenizer   # 词法引擎 / 语言定义 / token 缓存 / 主题（依赖 core 类型）
│   ├── view/        @cd/view        # 行池 / 虚拟滚动 / 渲染器 / View / 装饰（依赖 core+tokenizer）
│   └── react/       @cd/react       # CodeDiff 组件 / 工具栏 / hooks（依赖 view；对外 = 主包）
├── demo/                          # demo 应用（引用 @cd/react 源码）
└── src/                           # 遗留单包（D 组完成后移除）
```

依赖方向（lint 强制单向）：
```
core ← tokenizer ← view ← react
```

### 3.2 数据流（事件驱动）

```
DiffModel (core)
  ├─ onDidChangeContent     → tokenizer 失效对应行 → 行级重 tokenize
  ├─ onDidChangeTokens      → view 标记受影响行脏
  └─ onDidChangeDecorations → view 装饰层更新（不整行重渲）

View (view)
  ├─ 滚动事件 → BIT 查可见行 → transform 平移 / 首尾换行
  ├─ rAF 渲染循环 → 脏行 StringBuilder → innerHTML
  └─ setModel(newModel) → 清行池 + 全脏 + 重渲染可见行
```

### 3.3 关键设计

#### 文本模型（core，FR2.1）
- 分块不可变行数组：`{ chunks: string[], lineStarts: Uint32Array }`（简化 PieceTree），行访问 O(1)、区间读 O(1)。
- 行 hash（每行独立）支持 diff 复用与 token 失效判定。
- 大文件（>50K 行）走惰性分块：行内容按需从块切片，不预切。

#### diff 引擎（core，FR2.2）
- Myers 差分（O(ND)）对齐 Monaco 的 `DefaultLinesDiffComputer`：
  - 行 hash 预处理 + 等值行快速跳过（common prefix/suffix trim）
  - Myers 核心 + 启发式优化（Monaco `heuristicSequenceOptimizations` 思路：移动块识别可后置）
  - 输出：`LineRangeMapping[]`（原文件区间 ↔ 新文件区间），展示层据此生成 DiffRow 序列。
- 兼容现有语义：changed（一段删 + 一段增配对）/ added / removed / context + 行号映射。

#### 词法引擎（tokenizer，FR3）
- 规则表格式（受 Monarch 启发）：
  ```ts
  interface LexerRule {
    regex: RegExp        // 锚定匹配（^）
    action: 'push' | 'pop' | 'emit' | 'stay'
    tokenType?: string   // 如 'keyword' / 'string' / 'comment'
    nextState?: string   // push 时的目标状态
  }
  interface LanguageDef {
    id: string
    start: string            // 初始状态
    states: Record<string, LexerRule[]>
  }
  ```
- 状态栈：字符串/注释/模板/JSX 进入子状态，`pop` 返回；支持 `#pop` 计数。
- 跨行：tokenize 从行首开始，但每行携带「进入时的状态栈快照」；行失效时从**前一个有快照的行**重放（Monaco 同款策略：state 缓存）。
- 输出：`FlatToken[]`（`{ text, className }`），与现有 segment-merger 兼容。

#### 渲染管线（view，FR4）
- `ViewLine`：一行一个 DOM 节点（`div.view-line`），内部 `renderLine()` 拼 HTML；`_isMaybeInvalid` 脏标记；`input.equals()` 短路（同输入不重渲）。
- `VisibleLinesCollection`：`[rendLineNumberStart, lines[]]`；滚动/行集合变化时首尾 splice（复用 Monaco 的 `onLinesDeleted/onLinesInserted` 逻辑）。
- 渲染：`StringBuilder`（字符串数组 join）→ 一次 `innerHTML`，避免逐节点操作。
- 装饰：reveal 带/搜索高亮 = `DecorationStore`（区间集合）→ 渲染时叠加 class，不重写行内容。
- split 视图：左右两个 View 实例共享同一 DiffModel，各自独立滚动。

#### setModel（FR4.5 / FR5.2）
```ts
view.setModel(model: DiffModel | null): void
// 内部：flush 行池 → 全行标记脏 → 重算可见行 → rAF 渲染 → 滚动复位（可配置保持）
```
React 壳：`props.oldValue/newValue` 变化 → `useMemo` 产 DiffModel（hash 缓存）→ `view.setModel()`。

### 3.4 对外 API（react 包）

`CodeDiff` props 与 1.3.0 完全一致（兼容清单即现有 types.ts 导出）：
oldValue / newValue / language / fileName / viewMode / theme / showLineNumbers / showToolbar / showDiffOnly / contextLines / wrapLines / highlightInlineChanges / className / style / maxHeight / config / splitRatio / onSplitRatioChange / resizableSplit / renderToolbar / onCopy / onLineClick / onSearchMatchChange / onDiffComputed / autoScrollToFirstChange / revealLine / revealEndLine / revealNonce。

新增（可选，向后兼容）：`initialScrollTop`（可选）。

### 3.5 迁移路径

1. D1：建 workspace + core 空包 + 工具链（本阶段）
2. D2：core 实现 + 测试（不动现有代码）
3. D3：tokenizer 实现 + 语言定义 + 测试
4. D4：view 实现 + demo 侧并行接入（demo 先切到新 view，保留旧组件对照）
5. D5：react 壳（对外 API 不变）+ setModel + tab 演示
6. D6：基准对比 + 移除旧 src/code-diff + 桌面端消费迁移 + 发布 2.0.0

## 4. 接口定义

### 包级导出（D1 阶段落地）

| 包 | 导出 | 备注 |
|---|---|---|
| @cd/core | `TextModel` / `computeDiff` / `Emitter` / `Event` / `DiffModel` / 类型 | 纯 TS |
| @cd/tokenizer | `createLexer` / `LanguageRegistry` / `tokenizeLine` / `TokenCache` / 内置语言 | 纯 TS |
| @cd/view | `View` / `ViewLine` / `VisibleLinesCollection` / `DecorationStore` | DOM |
| @cd/react | `CodeDiff`（默认）/ `CodeDiffProps` / `ToolbarRenderProps` / 主题 config | 对外主包 |

### 兼容契约（FR5.1）

- `@jiang_quan_ming/react-code-diff` 包名、`CodeDiff` 组件、全部现有 props 语义不变。
- CSS 类名（`.cd-*`）保持兼容（消费端可能有定制样式覆盖）。

## 5. 验收标准

- [ ] AC1：`pnpm install` 一次装齐；根 `pnpm test` / `pnpm typecheck` / `pnpm build` 全部通过（D1）。
- [ ] AC2：core 包被 view 包 import 且 lint 通过；反向依赖被 lint 拒绝（D1）。
- [ ] AC3：demo（现有）在 D1 完成后照常 `npm run dev` 运行，功能不变（D1）。
- [ ] AC4（D2）：diff 引擎在 demo-edit-before/after 与 demo-large 上与现 `diff` 包输出逐行一致（vitest 快照）。
- [ ] AC5（D3）：typescript 样本高亮与 refractor 视觉等价（playwright 截图对比）；跨行字符串/注释/模板正确（vitest）。
- [ ] AC6（D4）：滚动 2000px 期间 DOM 节点数恒定；行集合变化仅首尾 splice（playwright 断言）。
- [ ] AC7（D5）：桌面端 FileRenderer 换包后零代码改动跑通（功能手测）。
- [ ] AC8（D6）：tab 切换 < 16ms；DOM 节点数 = 可见行 × 常量 ±10%；滚动帧 ≤ 17ms；vitest 全量通过；视觉回归一致。

## 6. 测试计划

- **core**（node vitest）：文本模型行访问/区间/大文件；diff 引擎与现实现逐行一致性快照；Emitter 生命周期。
- **tokenizer**（node vitest）：各语言规则样例（含跨行状态、嵌套、空行）；token 缓存命中/失效；注册表。
- **view**（playwright）：行池复用断言（DOM 数恒定）；脏渲染（改一行只重建一行）；setModel 复用；三视图。
- **react**（playwright）：props 兼容矩阵；tab 切换 demo；reveal/搜索/折叠回归。
- **基准**（playwright 脚本）：FR6.1 指标采集，结果入 PR body。

## 7. 变更记录

| 日期 | 变更内容 | 理由 |
|---|---|---|
| 2026-08-18 | 初始定稿 | 用户决策：全自研 + monorepo 分包（方案 A 拒绝，选方案 B 全自研） |
