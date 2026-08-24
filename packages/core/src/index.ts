/**
 * @cd/core —— 数据层（零运行时依赖）。
 *
 * D1：包骨架。
 * D2：可变文本模型（TextModel / applyEdits / createModel 注册表）、事件系统（Emitter/Event）、
 *      基础类型（Position/Range/Selection）、行 hash。
 * 后续：自研 diff 引擎、光标/选区模型、撤销重做栈（EditStack）。
 *
 * 依赖方向铁律：core 不 import 任何 @cd/*（scripts/check-deps.mjs 强制）。
 */

/** @cd/core 版本号（与 package.json 同步维护） */
export const CORE_VERSION = '0.2.0'

export {
  TextModel,
  createModel,
  getModel,
  disposeModel,
  hashLine,
  normalizeEOL,
} from './text-model'
export type { ModelContentChange, ModelContentChangedEvent } from './text-model'
export { Emitter, createEmitter } from './event'
export type { Event, Listener, Disposable } from './event'
export {
  createPosition,
  createRange,
  createSelection,
  isEmptyRange,
  comparePositions,
  getSelectionRange,
  isReversed,
  isCollapsed,
} from './types'
export type { Position, Range, Selection, TextEdit } from './types'
