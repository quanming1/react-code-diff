# CodeDiff 搜索热键设计

## 目标

为 `CodeDiff` 建立可扩展的内部热键系统，并实现第一个命令：在 Preview、Split、Unified 模式下，当前激活的组件实例通过 `Ctrl+F`（Windows/Linux）或 `⌘F`（macOS）打开代码搜索。

## 交互规则

- 用户在某个 `CodeDiff` 内发生 `pointerdown` 或 `focusin` 后，该实例成为当前激活实例。
- 点击组件外部后，不再有激活实例，浏览器原生查找保持可用。
- 多个 `CodeDiff` 同时存在时，只有最近激活的实例响应热键。
- 搜索栏未打开时，热键打开搜索栏、聚焦输入框并全选已有关键词。
- 搜索栏已打开时，重复热键重新聚焦并全选关键词，不关闭搜索栏。
- `Enter` 跳到下一个结果，`Shift+Enter` 跳到上一个结果。
- `Escape` 分两级处理：关键词非空时清空；关键词为空时关闭搜索栏，并把焦点还给当前 `CodeDiff` 根节点。
- `showToolbar={false}` 或 `toolbar.showSearch=false` 只影响工具栏，不禁用搜索热键。
- 切换 Preview、Split、Unified 时保留搜索栏和关键词，继续使用各模式已有的搜索计算。

## 架构

新增内部模块 `src/code-diff/hotkey-manager.ts`。模块维护全局唯一的激活实例，并在第一个实例注册时添加一个 `document.keydown` 监听器，在最后一个实例注销时移除监听器。

数据流：

```text
document keydown
  → HotkeyManager
  → 当前 active CodeDiff 实例
  → 匹配 Ctrl/⌘ + F
  → preventDefault
  → CodeDiff.openSearch()
```

Manager 不依赖 React，只保存实例 ID 与命令回调。React 组件在 Effect 中注册和注销，通过根节点的 `pointerdown` 与 `focusin` 报告激活，通过 document pointerdown 判断组件外点击并清除激活。

首版仅定义稳定命令 `search.open`，不增加公共 Props、快捷键重映射或禁用配置。后续有实际需求时再扩展公共 `hotkeys` 配置。

## 组件改动

`CodeDiff.tsx` 提取统一的搜索动作：

- `openSearch()`：打开搜索栏，并在提交 DOM 后聚焦、全选输入框。
- 工具栏、自定义工具栏和热键统一调用该动作。
- 根节点添加 `tabIndex={-1}`，只用于 Escape 关闭后的程序化焦点恢复，不进入 Tab 顺序。
- `SearchBar` 增加关闭回调；Escape 根据查询是否为空决定清空或关闭。

## 键盘匹配规则

仅以下组合触发 `search.open`：

- `Ctrl+F` 或 `Meta+F`
- 不含 `Alt`
- 不含 `Shift`
- 非自动重复事件

只有命令被激活实例实际处理时才调用 `preventDefault()`。未激活任何实例时不拦截浏览器。

## 生命周期与兼容性

- Manager 仅在组件 Effect 阶段访问 `document`，SSR 导入安全。
- 注册、注销必须幂等，适配 React Strict Mode 的重复 Effect 生命周期。
- 激活实例卸载时清除激活状态与旧回调。
- 最后一个实例卸载时移除全局监听器，避免泄漏。

## 测试

### Manager 单元测试

- 首个实例注册与最后实例注销。
- A/B 实例激活权转移。
- 只有激活实例收到命令。
- 未激活时不阻止默认行为。
- `Ctrl+F`、`Meta+F` 触发。
- `Alt`、`Shift`、自动重复及其他按键不触发。
- 激活实例注销后旧回调不再执行。

### 组件交互测试

- Preview、Split、Unified 都能打开搜索。
- 首次与重复热键均聚焦并全选关键词。
- 隐藏工具栏或搜索按钮时仍可使用。
- Escape 先清空，再关闭并恢复根节点焦点。
- 多实例只打开当前激活实例。

### 回归验证

- 完整 Vitest 测试通过。
- `npx tsc --noEmit` 通过。
- `npm run lint` 无新增错误。
- `npm run build:lib` 通过。
- 手动验证组件未激活时浏览器原生查找不被拦截。
