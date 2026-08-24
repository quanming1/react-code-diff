/**
 * @cd/view —— 命令式渲染层。
 *
 * - ViewLine：行 DOM + 脏标记 + input.equals 短路
 * - VisibleLinesCollection：Monaco 风格行池（首尾局部 insert/delete）
 * - PrefixSum / computeVisibleRange：BIT 虚拟滚动
 * - View：setModel / rAF 渲染循环 / 三视图（split 用双实例）
 *
 * 依赖方向铁律：view 仅依赖 @cd/core + @cd/tokenizer（scripts/check-deps.mjs 强制）。
 */

export { ViewLine, renderLineHtml, escapeHtml } from './view-line'
export type { ViewLineInput } from './view-line'
export { VisibleLinesCollection } from './visible-lines'
export { PrefixSum, computeVisibleRange } from './virtual'
export type { VisibleRange } from './virtual'
export { View } from './view'
export type { ViewOptions, ViewModelLike, TokenProvider } from './view'
