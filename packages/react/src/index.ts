/**
 * @cd/react —— 对外 React 集成。
 *
 * - CodeDiff：diff 查看器（props 与 1.3.0 兼容）
 * - CodeEditor：完整编辑器（Monaco 式 API）
 * - model-registry：createModel/getModel/setModelLanguage/disposeModel
 * - diagnostics：setModelMarkers（owner 隔离）
 *
 * 依赖方向铁律：react 仅依赖 @cd/core + @cd/tokenizer + @cd/view。
 */

export { CodeDiff } from './CodeDiff'
export type { CodeDiffProps, ViewMode, Theme } from './CodeDiff'
export { CodeEditor } from './CodeEditor'
export type { CodeEditorProps, CodeEditorHandle } from './CodeEditor'
export { createModel, getModel, setModelLanguage, disposeModel } from './model-registry'
export { TextModel } from '@cd/core'
export { setModelMarkers, getModelMarkers, getMarkersForLine, clearModelMarkers, severityToClass } from './diagnostics'
export type { Marker, MarkerSeverity } from './diagnostics'
