/**
 * @cd/react 诊断 API（FR7.6 关联 / FUNC-15）——setModelMarkers。
 *
 * 消费端注入错误/警告 → View gutter 图标 + 波浪线装饰。
 * owner 隔离：多来源（lint/编译/自定义）不互清。
 */

import type { TextModel } from '@cd/core'

export type MarkerSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface Marker {
  severity: MarkerSeverity
  message: string
  line: number
  column?: number
  endLine?: number
  endColumn?: number
}

/** 全局 markers 存储：model → owner → markers */
const markersStore = new Map<TextModel, Map<string, Marker[]>>()

/** 设置/更新某 owner 的 markers（替换该 owner 全部） */
export function setModelMarkers(model: TextModel, owner: string, markers: Marker[]): void {
  let owners = markersStore.get(model)
  if (!owners) {
    owners = new Map()
    markersStore.set(model, owners)
  }
  if (markers.length === 0) {
    owners.delete(owner)
    if (owners.size === 0) markersStore.delete(model)
  } else {
    owners.set(owner, markers)
  }
}

/** 取 model 全部 markers（合并所有 owner） */
export function getModelMarkers(model: TextModel): Marker[] {
  const owners = markersStore.get(model)
  if (!owners) return []
  return [...owners.values()].flat()
}

/** 取某行 markers */
export function getMarkersForLine(model: TextModel, line: number): Marker[] {
  return getModelMarkers(model).filter((m) => m.line === line)
}

/** 清除某 model 全部 markers */
export function clearModelMarkers(model: TextModel): void {
  markersStore.delete(model)
}

/** 严重度 → 装饰类型/gutter class */
export function severityToClass(severity: MarkerSeverity): string {
  switch (severity) {
    case 'error': return 'cd-marker-diagnostic-error'
    case 'warning': return 'cd-marker-diagnostic-warning'
    case 'info': return 'cd-marker-diagnostic-info'
    case 'hint': return 'cd-marker-diagnostic-hint'
  }
}
