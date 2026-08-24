/**
 * @cd/core —— 数据层（零运行时依赖）。
 *
 * D1 阶段为空骨架包：仅建立包结构、导出约定与工具链。
 * D2 起承载：可变文本模型（TextModel / applyEdits）、自研 diff 引擎、
 * 事件系统（Emitter/Event）、光标/选区模型、撤销重做栈（EditStack）。
 *
 * 依赖方向铁律：core 不 import 任何 @cd/*（scripts/check-deps.mjs 强制）。
 */

/** @cd/core 版本号（与 package.json 同步维护） */
export const CORE_VERSION = '0.1.0'
