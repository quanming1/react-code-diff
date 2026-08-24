/**
 * @cd/react 模型注册表（FR7.3）——Monaco 式全局注册表。
 */

import { TextModel, createModel as coreCreateModel, getModel as coreGetModel, disposeModel as coreDisposeModel } from '@cd/core'

export { TextModel }

/** 创建 model 并注册（同名 uri 复用） */
export function createModel(value: string, language?: string, uri?: string): TextModel {
  return coreCreateModel(value, language, uri)
}

/** 按 uri 取 model */
export function getModel(uri: string): TextModel | null {
  return coreGetModel(uri)
}

/** 设置 model 语言（变更语言时消费端应重建 token 缓存） */
export function setModelLanguage(_model: TextModel, _language: string): void {
  // TextModel 当前不持有语言；语言由 View/CodeEditor 层管理
  // 预留：后续 model 增加 language 字段后接线
}

/** 注销 model */
export function disposeModel(uri: string): void {
  coreDisposeModel(uri)
}
