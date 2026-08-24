# PRD-D1: Monaco 式架构重构总纲（monorepo 分包 + 数据渲染分离 + 全自研，含完整编辑器能力）

> 本文档是 D 组（Monaco 式架构重构）的**总纲**：定义整体目标、包划分、分层架构、事件模型、渲染管线与对外契约。
> 各子阶段（D2~D8）开工前各自独立撰写细化 PRD，本文档是它们的架构依据。
> 2026-08-18 范围升级：从「diff 查看器」扩展为「完整可编辑代码编辑器 + diff」（见变更记录）。

## 元信息

| 字段 | 值 |
|---|---|
| 阶段 | D1（总纲，覆盖 D1~D8 架构定义） |
| 名称 | Monaco 式架构重构总纲（完整编辑器能力） |
| 状态 | 草稿 → 评审 → approved |
| 创建日期 | 2026-08-18 |
| 关联文档 | docs/TODO.yaml（D 组）；docs/prd/PRD-TEMPLATE.md；AGENTS.md |

## 1. 背景与目标

### 背景

当前 `@jiang_quan_ming/react-code-diff`（1.3.0）是单包 React 组件：
- 数据（diff 结果、token 高亮）与渲染（React 组件树）**耦合**，props 一变 → 全树重渲染 → 可见行 DOM 全量重建。
- 高亮依赖 refractor（Prism），在渲染期**全量同步 tokenize**，无缓存、无增量。
- 无编辑能力：消费端（ftre-desktop）需要「可编辑的代码 + diff 对照」场景（如 AI 生成代码的编辑/对比），现组件无法支撑。
- 消费端多 tab 切换 diff 时，每个 tab 一套完整 DOM，切换即销毁重建，DOM 数量与切换延迟随文件增大线性恶化。

参考 VSCode Monaco 的核心思想：**数据与渲染严格分离**——TextModel（纯数据）+ ViewModel（投影/视口）+ View（命令式 DOM 行池）。切 tab = `setModel()` 换数据源，View 行池常驻复用，DOM 数量恒定（= 可见行 × 常量）。Monaco 同时提供完整编辑能力（光标/选区/输入/撤销重做）与 minimap/gutter（断点/诊断）——这些**全部纳入本重构目标**。

### 目标

将 code_diff 重构为 **monorepo 多包架构的完整代码编辑器 + diff**：
1. **全自研**：文本模型、diff 引擎、词法高亮引擎、光标/编辑/撤销重做、minimap、gutter 全部自研（零运行时外部依赖），不依赖 `diff` / `refractor`。
2. **数据/渲染分离**：core（数据）+ tokenizer（数据）+ view（命令式渲染）+ react（React 壳）。切 tab / 换 props 只换数据，DOM 池复用。
3. **双组件**：`CodeDiff`（diff 查看器，props 与 1.3.0 完全兼容）+ `CodeEditor`（完整编辑器：编辑/光标/选区/撤销重做/minimap/gutter）。
4. **对外 API 零破坏**：`@jiang_quan_ming/react-code-diff` 对外组件 props 与 1.3.0 完全兼容，消费端换包不改代码。

### 非目标（范围边界，收窄后）

- **不做多语言服务（LSP）**：不实现语义级分析（跳转定义/补全/重命名/诊断来源），诊断数据由消费端通过 API 注入。
- **不做远程/协作**：无 OT/CRDT、无多用户同步。
- **不做插件系统**：无 Monaco 式 contribution 点，能力以内置 + 配置化为主。
- **不承诺加载 .tmLanguage/.monarch 文件**：自研词法引擎使用自定义规则格式。
- **不做浏览器老版本兼容**：目标现代 Chromium/WebKit/Firefox（与消费端 Electron 一致）。
- **不改变现有视觉样式**：CodeDiff 重构前后视觉一致（OneLight/Dark 主题、三视图、折叠、reveal、搜索高亮）。

## 2. 需求范围

### 2.1 功能需求

#### FR1：monorepo 工程骨架（D1）
- [ ] FR1.1 pnpm workspace，包划分：`@cd/core` / `@cd/tokenizer` / `@cd/view` / `@cd/react`，根 `package.json` 只做编排。
- [ ] FR1.2 统一工具链：根 `test` / `typecheck` / `build` 命令覆盖全部包；vitest 单仓多 project 配置。
- [ ] FR1.3 现有 `src/code-diff` 在 D1 期间保持可运行（D 组完成后移除），demo 不中断。
- [ ] FR1.4 依赖方向严格单向：core ← tokenizer ← view ← react；禁止反向/跨层依赖（lint 强制）。

#### FR2：core 数据层（D2）
- [ ] FR2.1 自研**可变**文本模型：分块行缓冲（PieceTree 简化版或 chunked line array），行访问/行数 O(log n)~O(1)，行 hash 支持增量失效；`applyEdits()` 支持区间替换/插入/删除，增量维护行结构与 hash。
- [ ] FR2.2 自研 diff 引擎：Myers O(ND) + 启发式优化（对齐 Monaco `DefaultLinesDiffComputer` 思路），输出行级映射（changed/added/removed/context + 行号）；支持「编辑后实时重算 diff」场景（编辑模式）。
- [ ] FR2.3 事件系统：`Emitter<T>` / `Event<T>`（Monaco 风格），数据变更事件化（内容、token、decoration、光标四类独立事件）。
- [ ] FR2.4 光标/选区数据模型：`Selection`（起始/结束 Position）、多光标（次要光标集合）、`CursorsController`（移动/选择/约束到行内）。
- [ ] FR2.5 **撤销/重做栈**：`EditStack`（快照 + 分组 + 合并同字符输入），`undo()` / `redo()` 支持跨编辑会话；`onDidChangeUndoRedoState` 事件（供 UI 禁用/启用按钮）。
- [ ] FR2.6 数据模型：`TextModel`（uri 标识，Monaco 式）+ `DiffModel`（old/new model + diff 结果）纯 TS 无 DOM，可缓存（内容 hash → model 复用）。

#### FR3：tokenizer 全自研（D3）
- [ ] FR3.1 词法引擎：规则驱动状态机（正则规则表 + 状态栈），支持嵌套状态（字符串/注释/模板串/JSX 混合）。
- [ ] FR3.2 按行 tokenize + 跨行状态持久化（字符串跨行、块注释跨行、模板跨行在后续行继续正确着色）。
- [ ] FR3.3 行级 token 缓存：行内容 hash → token 数组；命中不重算；单行失效只影响该行及其后跨行状态链；**编辑后增量失效**（D5 依赖）。
- [ ] FR3.4 语言定义（首发）：typescript / javascript / jsx / tsx / json / css / html / markdown / bash / python / yaml / plaintext；注册表可扩展。
- [ ] FR3.5 主题映射：token type → CSS class（沿用现有 OneLight/Dark token 色板），输出 FlatToken 兼容结构。

#### FR4：view 命令式渲染层（D4）
- [ ] FR4.1 行池：`ViewLine` 对象池常驻，滚动纯 transform 平移；可见行集合变化走首尾局部 insert/delete（Monaco `RenderedLinesCollection` 风格）。
- [ ] FR4.2 脏标记渲染：数据事件 → 受影响行标记脏 → rAF 合并 → 仅脏行重渲染（StringBuilder 拼 HTML 一次性 innerHTML）。
- [ ] FR4.3 虚拟滚动：BIT 前缀和 + 滚动 ref（复用 virtual-v2 经验，纯命令式，React 不参与滚动）。
- [ ] FR4.4 装饰层（DecorationStore）：reveal 高亮带 / 搜索高亮 / inline diff 着色 / **断点标记 / 诊断（错误/警告波浪线 + gutter 图标）** 作为**装饰数据**叠加，不触发整行重渲染。
- [ ] FR4.5 **gutter**：行号槽 + glyph margin（断点红点、诊断错误/警告图标）+ 行号着色（当前行高亮）；宽度按行数自适应。
- [ ] FR4.6 `setModel(model)`：换数据源 → 清行池 → 全脏 → 重渲染可见行；DOM 容器与行池复用（tab 切换核心）。
- [ ] FR4.7 三视图：unified / split / preview 在 view 层实现（split 双列 = 两个 view 实例共享 model）；**split 两侧均可编辑（编辑模式）**。

#### FR5：编辑能力（D5）
- [ ] FR5.1 光标渲染：主光标 + 次要光标（合成层 DOM，blink 动画），选区 overlay（半透明覆盖，随选择范围更新）。
- [ ] FR5.2 输入处理：键盘（字符/退格/删除/回车/Tab）、IME 组合输入、剪贴板（复制/剪切/粘贴，含跨选区）、拖放文本；→ 统一走 `applyEdits()` + EditStack。
- [ ] FR5.3 命令路由：移动（方向键/Home/End/PageUp/PageDown/Ctrl+Home/End）、选择（Shift 组合）、删除词/行、缩进/反缩进（Tab/Shift+Tab，多行时整行缩进）、撤销/重做（Ctrl+Z/Ctrl+Shift+Z）。
- [ ] FR5.4 编辑模式 diff：CodeEditor 编辑后，CodeDiff 侧实时重算（防抖 200ms，对齐 Monaco diff 语义）；仅可见/变更区域重算。
- [ ] FR5.5 自动滚动：光标移出视口时自动滚动（光标可见性保持）；输入时光标跟随。

#### FR6：minimap + 概览（D6）
- [ ] FR6.1 minimap：canvas 缩略渲染（每像素行压缩），渲染内容与主视图一致（token 色）；视口框（当前可见区域矩形）+ 滚动同步（滚动/拖拽定位）。
- [ ] FR6.2 minimap 投影：diff 变更带（added/removed 色块）、断点/诊断标记、搜索匹配点投影到 minimap。
- [ ] FR6.3 overview ruler（右侧概览条）：断点/诊断/搜索/光标位置投影（点击定位），可开关。
- [ ] FR6.4 性能：minimap 增量渲染（仅脏区域重绘）；大文件（>10K 行）canvas 采样渲染不卡滚动。

#### FR7：react 包（D7）
- [ ] FR7.1 `CodeDiff` 对外组件 props 与 1.3.0 **完全兼容**（含 revealLine/revealEndLine/revealNonce/renderToolbar/onLineClick 等全部现有 props）。
- [ ] FR7.2 **`CodeEditor` 新组件**：Monaco 式 API——`model`（uri 或 TextModel）/ `language` / `theme` / `readOnly` / `onDidChangeContent` / `onDidChangeCursorPosition` / `onDidChangeSelection` / `undo`/`redo`/`focus` 命令（ref 暴露）。
- [ ] FR7.3 模型注册表：`createModel(value, language, uri)` / `getModel(uri)` / `setModelLanguage`（Monaco 式全局注册表，跨组件共享 model）。
- [ ] FR7.4 内部 `useRef` 挂载 View 实例；props 变化 → 增量 `setModel`/配置更新（React 只渲染外壳与工具栏）。
- [ ] FR7.5 工具栏/搜索框/切换按钮保持 React 组件（现有 Toolbar/SearchBar 迁移），与 view 层通过事件/命令交互。
- [ ] FR7.6 diff 结果缓存：相同 old/new 内容直接复用 DiffModel，切换零重算。

#### FR8：性能与验收（D8）
- [ ] FR8.1 基准工具：playwright 脚本采集 DOM 节点数 / tab 切换耗时 / 滚动帧率 / **输入延迟**，前后对比数据入 PR。
- [ ] FR8.2 量化目标（demo Large Data 2000 行 tsx）：DOM 节点数 = 可见行 × 常量（±10%）；tab 切换（setModel）< 16ms；滚动平均帧 ≤ 17ms；**输入到渲染延迟 < 50ms**。
- [ ] FR8.3 功能等价：重构后 CodeDiff 三视图/折叠/reveal/搜索/换行/diff-only 行为与 1.3.0 视觉一致（demo 手动 + 截图对比）；CodeEditor 编辑/撤销重做/minimap/gutter 功能正确。
- [ ] FR8.4 消费端迁移：ftre-desktop 换包（pnpm workspace 或 registry 发布），FileRenderer 零代码改动跑通 CodeDiff；CodeEditor 供新场景接入。

### 2.2 非功能需求

- **性能**：见 FR8.2；tokenize 全量异步不阻塞首帧（大文件先纯文本渲染再逐行补高亮）；编辑时仅受影响行增量处理。
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
│   ├── core/        @cd/core        # 文本模型 / diff / 事件 / 光标 / 撤销重做 / 类型（零依赖）
│   ├── tokenizer/   @cd/tokenizer   # 词法引擎 / 语言定义 / token 缓存 / 主题（依赖 core 类型）
│   ├── view/        @cd/view        # 行池 / 滚动 / 渲染 / 光标渲染 / 输入 / minimap / gutter（依赖 core+tokenizer）
│   └── react/       @cd/react       # CodeDiff + CodeEditor / 工具栏 / 模型注册表（依赖 view；对外 = 主包）
├── demo/                          # demo 应用（引用 @cd/react 源码）
└── src/                           # 遗留单包（D 组完成后移除）
```

依赖方向（lint 强制单向）：
```
core ← tokenizer ← view ← react
```

### 3.2 数据流（事件驱动）

```
TextModel (core)
  ├─ applyEdits() → 内容变更事件
  │    ├─ tokenizer 失效受影响行 → 增量重 tokenize → tokens 事件
  │    ├─ EditStack 记录 → undo/redo 可用
  │    └─ （diff 模式）DiffModel 防抖重算 → diff 事件
  └─ onDidChangeContent / onDidChangeTokens / onDidChangeDecorations / onDidChangeCursor
         ↓
View (view)
  ├─ 滚动事件 → BIT 查可见行 → transform 平移 / 首尾换行
  ├─ rAF 渲染循环 → 脏行 StringBuilder → innerHTML
  ├─ 光标渲染（合成层）→ 输入处理 → applyEdits 闭环
  ├─ minimap / overview ruler → 增量重绘
  └─ setModel(newModel) → 清行池 + 全脏 + 重渲染可见行
```

### 3.3 关键设计

#### 文本模型（core，FR2.1）
- 分块可变行数组：`{ chunks: string[], lineStarts: Uint32Array }`（简化 PieceTree），行访问 O(1)、区间读 O(1)。
- `applyEdits(edits: { range, text }[])`：区间替换 → 行结构局部重建（受影响块重切），行 hash 增量更新；一次调用合并多编辑（Monaco 事务语义）。
- 行 hash（每行独立）支持 diff 复用与 token 失效判定。
- 大文件（>50K 行）走惰性分块：行内容按需从块切片，不预切。

#### diff 引擎（core，FR2.2）
- Myers 差分（O(ND)）对齐 Monaco 的 `DefaultLinesDiffComputer`：
  - 行 hash 预处理 + 等值行快速跳过（common prefix/suffix trim）
  - Myers 核心 + 启发式优化（Monaco `heuristicSequenceOptimizations` 思路：移动块识别可后置）
  - 输出：`LineRangeMapping[]`（原文件区间 ↔ 新文件区间），展示层据此生成 DiffRow 序列。
- 编辑模式：old model 不可变（基线），new model 可变；内容变更 → 防抖 200ms 重算 diff（对齐 Monaco 行为）。

#### 撤销/重做（core，FR2.5）
- `EditStack`：编辑记录为 `{ beforeState, afterState }` 快照（内容 + 光标位置）；同字符连续输入合并（Monaco `isInsertion` 合并规则：同位置同向输入合并为一次 undo）。
- `undo()` / `redo()` 恢复内容与光标；`onDidChangeUndoRedoState` 事件驱动 UI。

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
- 编辑增量：`applyEdits` 后从编辑行向前找最近快照重放（受编辑影响的行数通常为 1-3 行）。
- 输出：`FlatToken[]`（`{ text, className }`），与现有 segment-merger 兼容。

#### 渲染管线（view，FR4）
- `ViewLine`：一行一个 DOM 节点（`div.view-line`），内部 `renderLine()` 拼 HTML；`_isMaybeInvalid` 脏标记；`input.equals()` 短路（同输入不重渲）。
- `VisibleLinesCollection`：`[rendLineNumberStart, lines[]]`；滚动/行集合变化时首尾 splice（复用 Monaco 的 `onLinesDeleted/onLinesInserted` 逻辑）。
- 渲染：`StringBuilder`（字符串数组 join）→ 一次 `innerHTML`，避免逐节点操作。
- 装饰：reveal 带/搜索高亮/断点/诊断 = `DecorationStore`（区间集合）→ 渲染时叠加 class/图标，不重写行内容。
- gutter：行号槽 + glyph margin（断点红点/诊断图标），宽度随行数自适应，滚动与内容同步。
- split 视图：左右两个 View 实例共享同一 DiffModel，各自独立滚动/光标/编辑。

#### 编辑与光标（view，FR5）
- `ViewCursors`：合成层（absolute div）渲染光标（blink）与选区（半透明 block）；位置由 CursorsController 驱动。
- `InputHandler`：keydown/IME（compositionstart/update/end）/剪贴板/拖放 → 统一 `applyEdits` + 光标更新。
- 命令路由：`ViewController` 注册键盘命令（移动/选择/删除/缩进/撤销重做），与 Monaco `ViewCommands` 对齐（常用键位）。

#### minimap（view，FR6）
- canvas 渲染：行 → 像素列采样（token 色），每行 2-3px；`renderAllLines` 增量重绘（脏行区域）。
- 视口框：当前可见区域矩形，滚动同步（scrollTop 变化 → 框位移）；拖拽框/点击 → 主视图跳转。
- 投影：diff 变更带（added/removed 色块）/断点/诊断/搜索匹配 → minimap 色点。
- overview ruler：右侧竖条，同样投影 + 光标线。

#### setModel（FR4.6 / FR7.4）
```ts
view.setModel(model: DiffModel | TextModel | null): void
// 内部：flush 行池 → 全行标记脏 → 重算可见行 → rAF 渲染 → 滚动复位（可配置保持）
```
React 壳：`props.oldValue/newValue` 变化 → `useMemo` 产 DiffModel（hash 缓存）→ `view.setModel()`。

### 3.4 对外 API（react 包）

**CodeDiff** props 与 1.3.0 完全一致（兼容清单即现有 types.ts 导出）：
oldValue / newValue / language / fileName / viewMode / theme / showLineNumbers / showToolbar / showDiffOnly / contextLines / wrapLines / highlightInlineChanges / className / style / maxHeight / config / splitRatio / onSplitRatioChange / resizableSplit / renderToolbar / onCopy / onLineClick / onSearchMatchChange / onDiffComputed / autoScrollToFirstChange / revealLine / revealEndLine / revealNonce。

**CodeEditor**（新，Monaco 式）：
```ts
interface CodeEditorProps {
  model: string | URI | TextModel   // 值或 model 引用（受控模式用 value + onChange）
  value?: string                    // 受控值（可选；与 model 二选一）
  language?: string
  theme?: 'light' | 'dark'
  readOnly?: boolean
  minimap?: { enabled?: boolean; renderCharacters?: boolean; maxColumn?: number }
  lineNumbers?: 'on' | 'off' | 'relative'
  glyphMargin?: boolean             // 断点/诊断 gutter
  onChange?: (value: string) => void
  onDidChangeCursorPosition?: (pos: Position) => void
  onDidChangeSelection?: (sel: Selection) => void
  onDidChangeMarkers?: (markers: Marker[]) => void  // 诊断注入
  className?: string; style?: CSSProperties
}
interface CodeEditorHandle {
  undo(): void; redo(): void; focus(): void
  getValue(): string; setValue(v: string): void
  getPosition(): Position; setPosition(p: Position): void
  revealLine(line: number): void
}
```

**模型注册表**（Monaco 式）：
```ts
createModel(value: string, language?: string, uri?: string): TextModel
getModel(uri: string): TextModel | null
setModelLanguage(model: TextModel, language: string): void
disposeModel(uri: string): void
```

**诊断 API**（消费端注入）：
```ts
setModelMarkers(model: TextModel, owner: string, markers: Marker[]): void
// Marker = { severity: 'error' | 'warning' | 'info' | 'hint'; message: string; line: number; column?: number; endLine?: number; endColumn?: number }
```

### 3.5 迁移路径

1. D1：建 workspace + core 空包 + 工具链（本阶段）
2. D2：core 实现（文本模型/事件/diff/光标/撤销重做）+ 测试（不动现有代码）
3. D3：tokenizer 实现 + 语言定义 + 测试
4. D4：view 渲染层 + gutter + 装饰（demo 侧并行接入）
5. D5：编辑能力（光标/输入/命令/撤销重做 UI）
6. D6：minimap + overview ruler
7. D7：react 壳（CodeDiff + CodeEditor + 模型注册表）+ setModel + tab 演示
8. D8：基准对比 + 移除旧 src/code-diff + 桌面端消费迁移 + 发布 2.0.0

## 4. 接口定义

### 包级导出（D1 阶段落地）

| 包 | 导出 | 备注 |
|---|---|---|
| @cd/core | `TextModel` / `createModel` / `computeDiff` / `Emitter` / `Event` / `EditStack` / `CursorsController` / `Selection` / `Position` / `DiffModel` / `Marker` / 类型 | 纯 TS |
| @cd/tokenizer | `createLexer` / `LanguageRegistry` / `tokenizeLine` / `TokenCache` / 内置语言 | 纯 TS |
| @cd/view | `View` / `ViewLine` / `VisibleLinesCollection` / `DecorationStore` / `Minimap` / `OverviewRuler` / `Gutter` / `InputHandler` | DOM |
| @cd/react | `CodeDiff` / `CodeEditor` / `createModel` / `getModel` / `setModelMarkers` / 主题 config / 类型 | 对外主包 |

### 兼容契约（FR7.1）

- `@jiang_quan_ming/react-code-diff` 包名、`CodeDiff` 组件、全部现有 props 语义不变。
- CSS 类名（`.cd-*`）保持兼容（消费端可能有定制样式覆盖）。
- `CodeEditor` 为纯新增 API，不影响现有消费。

## 5. 验收标准（摘要）

> 本章是验收的**执行入口**（每条 AC 可勾选）。量化指标与逐条测试用例的完整明细见 **第 6 章「验收指标与测试用例明细」**（指标表 + TC 用例表，按阶段编号）。

- [ ] AC1：`pnpm install` 一次装齐；根 `pnpm test` / `pnpm typecheck` / `pnpm build` 全部通过（D1）。
- [ ] AC2：core 包被 view 包 import 且 lint 通过；反向依赖被 lint 拒绝（D1）。
- [ ] AC3：demo（现有）在 D1 完成后照常 `npm run dev` 运行，功能不变（D1）。
- [ ] AC4（D2）：diff 引擎在 demo-edit-before/after 与 demo-large 上与现 `diff` 包输出逐行一致（vitest 快照）；applyEdits 后行 hash 与行结构正确；undo/redo 序列正确（vitest）。
- [ ] AC5（D3）：typescript 样本高亮与 refractor 视觉等价（playwright 截图对比）；跨行字符串/注释/模板正确；编辑后增量重 tokenize（vitest）。
- [ ] AC6（D4）：滚动 2000px 期间 DOM 节点数恒定；行集合变化仅首尾 splice（playwright 断言）；gutter 断点红点/诊断图标渲染正确。
- [ ] AC7（D5）：可编辑文本、光标移动/选区/复制粘贴/undo-redo 快捷键/IME 中文输入正确（playwright 交互测试）；编辑后 diff 实时更新。
- [ ] AC8（D6）：minimap 渲染正确、滚动同步、diff 高亮带/断点/诊断投影可见；点击/拖拽定位；overview ruler 正常。
- [ ] AC9（D7）：桌面端 FileRenderer 换包后零代码改动跑通 CodeDiff；CodeEditor 可编辑 + 事件回调 + 模型注册表 + setModelMarkers 正常。
- [ ] AC10（D8）：PERF-01~10 全部达标（见 6.1）；FUNC-01~15 / COMP-01~03 全部通过；TC 全量绿。

## 6. 验收指标与测试用例明细

### 6.1 性能指标（PERF，量化目标）

> 统一在 D8 验收；各前置阶段（D2~D7）自行预跑，不达标即回开发。测量环境：demo Large Data（2000 行 tsx，unified，Diff Only 关）；Chromium headless。

| 编号 | 指标 | 目标值 | 样本/场景 | 测量方法 | 工具 | 对应 FR |
|---|---|---|---|---|---|---|
| PERF-01 | DOM 节点数 | = 可见行 × 常量 ±10% | 滚动全程（0→2000px→0） | 逐帧统计 `.view-line, .view-line *` 节点数，取 max；对比重构前基线 | playwright | FR4.1/FR8.2 |
| PERF-02 | tab 切换耗时 | < 16ms（p95） | 两个 2000 行 model 来回切换 20 次 | `performance.now()` 包 `setModel()` + 下一帧渲染，取 p95 | playwright | FR4.6/FR8.2 |
| PERF-03 | 滚动平均帧 | ≤ 17ms | 程序化滚动 2000px（100 帧） | rAF 帧间隔均值 | playwright | FR8.2 |
| PERF-04 | 滚动卡顿帧 | 0 帧 > 25ms | 同上 | 帧间隔 >25ms 计数 | playwright | FR8.2 |
| PERF-05 | 输入延迟 | < 50ms（p95） | 2000 行文件中部行输入 20 字符 | keydown → DOM 文本更新（MutationObserver）时间差 | playwright | FR5/FR8.2 |
| PERF-06 | 首屏渲染 | < 100ms | 2000 行文件纯文本首帧 | 挂载 → 首次 paint（PerformanceObserver） | playwright | FR8.2 |
| PERF-07 | 大文件交互 | 50K 行可流畅滚动 | 50K 行生成文件 | 滚动帧率 ≥ 50fps；无白屏 | playwright | FR2.1/FR8.2 |
| PERF-08 | 单行编辑 tokenize | ≤ 2ms | 2000 行 tsx 中部行改 1 字符 | `performance.mark` 包 tokenize（增量路径） | playwright | FR3.3/FR5 |
| PERF-09 | 编辑模式 diff 重算 | ≤ 30ms | 2000 行文件编辑 1 行，防抖 200ms 后 | `performance.mark` 包 computeDiff | playwright | FR2.2/FR5.4 |
| PERF-10 | 内存/泄漏 | 10 次 setModel 后 DOM 数不回涨 | 反复切换 10 个 model | 切换前后 DOM 计数对比 + heap 粗采样 | playwright | FR4.6/FR7 |

**失败处理**：任一 PERF 未达标 → PR 标记性能回归，回开发优化后重测；基准结果（前后对比表）必须附在对应 PR body。

### 6.2 功能指标（FUNC，按能力域）

| 编号 | 能力 | 通过标准 | 阶段 | 验证方式 |
|---|---|---|---|---|
| FUNC-01 | 三视图 | unified/split/preview 渲染正确、互相切换无异常 | D4 | playwright |
| FUNC-02 | 折叠 | Diff Only 折叠段计数正确、点击展开/收起、reveal 自动展开 | D4 | playwright |
| FUNC-03 | 搜索 | Ctrl+F 打开/聚焦、高亮、上下跳转、大小写切换、Esc 关闭 | D4 | playwright |
| FUNC-04 | reveal | 跳转居中、区间高亮带、行号加粗、清除（nonce 重触发） | D4 | playwright |
| FUNC-05 | 换行 | wrap 开/关渲染正确、横向滚动/纵向滚动正常 | D4 | playwright |
| FUNC-06 | 编辑输入 | 字符/退格/删除/回车/Tab 正确落盘 | D5 | playwright |
| FUNC-07 | IME | 中文拼音组合期不落盘、确认后一次落盘 | D5 | playwright |
| FUNC-08 | 撤销/重做 | Ctrl+Z / Ctrl+Shift+Z 序列正确；连续输入合并为一次 undo；按钮 disabled 状态同步 | D5 | playwright |
| FUNC-09 | 光标/选区 | 方向键移动、Shift 扩展选区、多光标、选区渲染（含反向选区） | D5 | playwright |
| FUNC-10 | 编辑模式 diff | 编辑 new 侧后防抖 200ms diff 实时更新（行号/变更带） | D5 | playwright |
| FUNC-11 | gutter | 行号正确；断点红点（glyph margin）、诊断错误/警告图标渲染；点击断点 toggle 事件 | D4 | playwright |
| FUNC-12 | minimap | 渲染正确（token 色块）、滚动同步、点击/拖拽定位、视口框跟随 | D6 | playwright 截图+交互 |
| FUNC-13 | minimap 投影 | diff 变更带 / 断点 / 诊断 / 搜索匹配点投影可见 | D6 | playwright |
| FUNC-14 | overview ruler | 断点/诊断/搜索/光标投影、点击定位 | D6 | playwright |
| FUNC-15 | 诊断注入 | `setModelMarkers` 注入 error/warning → 波浪线 + gutter 图标；owner 隔离（多来源不互清） | D7 | playwright |
| FUNC-16 | 模型注册表 | createModel/getModel/setModelLanguage/disposeModel 生命周期正确；同名 uri 复用 | D7 | vitest |

### 6.3 兼容性指标（COMP）

| 编号 | 指标 | 通过标准 | 验证方式 |
|---|---|---|---|
| COMP-01 | CodeDiff props 兼容 | 1.3.0 全量 props 矩阵（含 revealLine/revealEndLine/revealNonce/renderToolbar/onLineClick 等）逐一可用 | playwright 断言 + 手动 |
| COMP-02 | CSS 类名兼容 | `.cd-*` 类名保持（消费端样式覆盖不破）；`.cd-reveal-band` 等新类名正常 | playwright 断言 class |
| COMP-03 | 桌面端零改动 | ftre-desktop FileRenderer 换包后：编译通过 + CodeDiff 功能手测通过 | 桌面端手测 |
| COMP-04 | 视觉等价 | 重构前后 demo 截图对比（三视图 × 主题 × wrap）：无肉眼差异 | playwright 截图 diff |

### 6.4 测试用例清单（TC）

> 编号规则：TC-<阶段>-<序号>；类型：单测（node vitest）/ 交互（playwright）/ 基准（playwright 脚本）/ 手动。所有 TC 全绿 = 对应阶段可收尾。

#### D1 骨架

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D1-01 | workspace 安装 | 根 `pnpm install` | 一次装齐，无 peer 冲突 | 命令 |
| TC-D1-02 | 根命令覆盖 | `pnpm test` / `pnpm typecheck` / `pnpm build` | 全部通过（覆盖全部包） | 命令 |
| TC-D1-03 | 依赖方向 lint | 故意在 view 包 import core 的反向链 | lint 拒绝（报错退出） | 单测 |
| TC-D1-04 | 旧代码存活 | `npm run dev` | demo 照常运行、功能不变 | 手动 |

#### D2 core 数据层

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D2-01 | 文本模型行访问 | 构造 10K 行模型；随机行读/区间读/行数 | 内容与行号正确；O(1)~O(log n) | 单测 |
| TC-D2-02 | applyEdits | 区间替换/插入/删除（含跨行、文件尾、空区间） | 行结构与行 hash 增量正确 | 单测 |
| TC-D2-03 | diff 一致性 | demo-edit-before/after、demo-large、空文本、单行 | 与现 `diff` 包输出逐行一致（快照） | 单测 |
| TC-D2-04 | undo/redo 序列 | 10 步混合编辑；连续输入合并；undo 到空再 redo | 逐级还原正确；合并生效；undo/redo 状态事件 | 单测 |
| TC-D2-05 | 光标模型 | 移动/越界钳制/多行跳转/选区反向 | 位置与选区正确 | 单测 |
| TC-D2-06 | Emitter 生命周期 | 订阅/触发/取消/异常隔离 | 事件正确、取消后不再触发、异常不中断 | 单测 |

#### D3 tokenizer

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D3-01 | 语言样例 | 12 种语言各代表样本 tokenize | 与 refractor 输出视觉等价（截图对比） | 截图 |
| TC-D3-02 | 跨行状态 | 多行字符串/块注释/模板串/JSX 嵌套 | 续行着色正确、状态栈还原 | 单测 |
| TC-D3-03 | 缓存命中 | 同内容行二次 tokenize | 命中缓存零重算（计数器断言） | 单测 |
| TC-D3-04 | 编辑增量 | 中部行改 1 字符 | 仅受影响行重 tokenize，跨行链正确 | 单测 |

#### D4 view 渲染层

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D4-01 | 行池复用 | 滚动 0→2000px→0 全程 | DOM 节点数恒定（PERF-01） | 基准 |
| TC-D4-02 | 首尾 splice | 快速滚动跨越 500 行 | 仅首尾增减行（insert/delete 计数） | 交互 |
| TC-D4-03 | 脏渲染 | 改一行数据（装饰/内容） | 仅该行 DOM 更新，其余不动 | 交互 |
| TC-D4-04 | setModel | 切换 model A→B→A | 行池复用、内容正确、滚动复位/保持按配置 | 交互 |
| TC-D4-05 | gutter | 注入断点/诊断到 3 行 | 红点/图标/行号正确渲染 | 交互 |
| TC-D4-06 | 三视图切换 | unified↔split↔preview | 渲染正确、滚动各自独立 | 交互 |
| TC-D4-07 | 装饰叠加 | reveal + 搜索 + 断点同区 | 三装饰共存不冲突 | 交互 |

#### D5 编辑能力

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D5-01 | 字符输入 | 逐字输入 100 字符（含回车/Tab/退格） | 内容 + 渲染 + 光标正确 | 交互 |
| TC-D5-02 | IME | 中文拼音组合输入（compositionstart/update/end） | 组合期不落盘、确认后一次落盘 | 交互 |
| TC-D5-03 | 撤销重做快捷键 | Ctrl+Z ×5 / Ctrl+Shift+Z ×5 | 内容与光标逐步还原/重做 | 交互 |
| TC-D5-04 | 选区操作 | Shift+方向 选 3 行 → Delete；Ctrl+X/Ctrl+V | 内容正确、undo 可还原 | 交互 |
| TC-D5-05 | 编辑模式 diff | new 侧编辑 1 行 → 等待防抖 | diff 更新（行号/变更带/统计） | 交互 |
| TC-D5-06 | 自动滚动 | 光标移出视口（PageDown 连按） | 视口跟随光标 | 交互 |
| TC-D5-07 | 多光标 | 创建次要光标（Alt+Click）并输入 | 多位置同时插入、渲染正确 | 交互 |

#### D6 minimap / ruler

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D6-01 | minimap 渲染 | 打开 minimap（2000 行 + 50K 行） | 色块正确、无白屏、canvas 尺寸合理 | 交互+截图 |
| TC-D6-02 | 滚动同步 | 滚动主视图 | 视口框跟随、minimap 内容同步 | 交互 |
| TC-D6-03 | 点击/拖拽定位 | 点击 minimap 中部 / 拖拽视口框 | 主视图跳转到对应位置 | 交互 |
| TC-D6-04 | 投影 | 有 diff/断点/诊断/搜索时 | 各类色点/标记投影可见 | 交互 |
| TC-D6-05 | overview ruler | 有断点/诊断/搜索/光标 | 投影正确、点击定位 | 交互 |
| TC-D6-06 | minimap 性能 | 50K 行滚动 | 滚动帧率不因 minimap 明显下降（≥ 45fps） | 基准 |

#### D7 react 包

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D7-01 | CodeDiff props 矩阵 | 1.3.0 全量 props 逐一生效 | 全部可用（COMP-01） | 交互 |
| TC-D7-02 | CodeEditor 受控 | value + onChange 双向 | 外部改 value 同步、内部编辑回调 | 交互 |
| TC-D7-03 | 模型注册表 | create/get/setLanguage/dispose 序列 | 生命周期正确、同名 uri 复用 | 单测 |
| TC-D7-04 | 诊断渲染 | setModelMarkers 注入 error/warning | 波浪线 + gutter 图标 + owner 隔离 | 交互 |
| TC-D7-05 | tab 切换 | 双 model 切换 20 次 | DOM 复用、耗时达标（PERF-02） | 基准 |
| TC-D7-06 | 工具栏 | 搜索/折叠/视图/换行按钮 | 与 view 层命令联通 | 交互 |

#### D8 验收

| 编号 | 用例 | 步骤 | 预期 | 类型 |
|---|---|---|---|---|
| TC-D8-01 | 全量基准 | 跑 PERF-01~10 脚本 | 全部达标，数据入 PR | 基准 |
| TC-D8-02 | 视觉回归 | 重构前后截图对比（三视图 × 主题 × wrap） | 无肉眼差异（COMP-04） | 截图 |
| TC-D8-03 | 桌面端迁移 | ftre-desktop 换包 | 编译通过 + 功能手测通过（COMP-03） | 手动 |
| TC-D8-04 | 全量 vitest | `pnpm test` | 全绿 | 命令 |
| TC-D8-05 | 旧代码移除 | 删除 src/code-diff | 构建/测试无引用残留 | 命令 |

### 6.5 验收执行流程

1. 每个阶段收尾：跑本阶段 TC（单测 + 交互）→ 全绿 → PR 附 TC 结果表。
2. D4/D5/D6 涉及性能指标的阶段：预跑对应 PERF，未达标回开发。
3. D8 终验：PERF-01~10 + FUNC + COMP + TC 全量 → 结果表入发布 PR → 发布 2.0.0。

## 7. 变更记录

| 日期 | 变更内容 | 理由 |
|---|---|---|
| 2026-08-18 | 初始定稿 | 用户决策：全自研 + monorepo 分包（方案 A 拒绝，选方案 B 全自研） |
| 2026-08-18 | **范围升级**：纳入编辑/光标/选区/撤销重做/minimap/断点诊断 gutter；新增 CodeEditor 组件、模型注册表、诊断 API；D 组重排为 D1-D8 | 用户决策：不做 Monaco 全功能 → 全都要，PRD 更宏伟 |
| 2026-08-18 | **新增第 6 章「验收指标与测试用例明细」**：PERF-01~10 性能指标表（量化目标/样本/测量方法）、FUNC-01~16 功能指标表、COMP-01~04 兼容性指标表、TC-D1~D8 全量测试用例清单（48 条）、验收执行流程；第 5 章改为摘要入口 | 用户要求：验收指标与测试 case 单独成章、可执行可勾选 |
| 2026-08-18 | D1 阶段实施：pnpm workspace 骨架 + @cd/core 空包 + 统一工具链（test/typecheck/build/lint:deps）+ vitest 多 project | D1 开发落地，TC-D1-01~04 验收通过（159 测试全绿、demo 不中断、依赖方向 lint 门禁生效） |
| 2026-08-18 | D2 第一部分实施：可变文本模型（分块行缓冲 + applyEdits 逆序批量 + 行 hash + createModel 注册表雏形）+ Emitter/Event 事件系统 + Position/Range/Selection 类型 | FR2.1/2.3/2.6 落地，TC-D2-01/02/06 通过（34 core 测试全绿、tsc -b 零错误） |
| 2026-08-18 | D2 第二部分实施：自研 diff 引擎（Myers O(ND) + prefix trim + no-newline-EOF 语义）+ 光标模型（CursorsController）+ 撤销重做栈（EditStack，同向合并） | FR2.2/2.4/2.5 落地，TC-D2-03（与旧 `diff` 包逐行一致）/04/05 通过（core 80 测试全绿、237 全量） |
| 2026-08-18 | D3 实施：@cd/tokenizer 全自研词法引擎（规则驱动状态机 emit/push/pop + 状态栈跨行）+ 12 语言定义 + 行级 token 缓存（编辑增量失效重放）+ 主题映射 | FR3.1~3.5 落地，TC-D3-01~04 通过（tokenizer 18 测试全绿、255 全量） |
