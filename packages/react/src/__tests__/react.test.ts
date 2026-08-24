import { describe, it, expect } from 'vitest'
import { TextModel, createModel, getModel, disposeModel, setModelMarkers, getModelMarkers, getMarkersForLine, severityToClass, clearModelMarkers } from '../index'

describe('模型注册表（TC-D7-03）', () => {
  it('createModel / getModel / disposeModel 生命周期', () => {
    const m = createModel('x', 'plaintext', 'uri://d7/1')
    expect(getModel('uri://d7/1')).toBe(m)
    // 同名 uri 复用
    expect(createModel('y', 'plaintext', 'uri://d7/1')).toBe(m)
    disposeModel('uri://d7/1')
    expect(getModel('uri://d7/1')).toBeNull()
  })

  it('TextModel 可编辑（applyEdits）', () => {
    const m = new TextModel('abc', 'uri://d7/2')
    m.applyEdits([{ range: { start: { line: 1, column: 2 }, end: { line: 1, column: 2 } }, text: 'X' }])
    expect(m.getValue()).toBe('aXbc')
  })
})

describe('诊断 API（TC-D7-04 / FUNC-15）', () => {
  it('setModelMarkers 注入 + owner 隔离', () => {
    const m = new TextModel('a\nb\nc', 'uri://d7/d1')
    setModelMarkers(m, 'lint', [
      { severity: 'error', message: 'lint err', line: 1 },
      { severity: 'warning', message: 'lint warn', line: 2 },
    ])
    setModelMarkers(m, 'compile', [
      { severity: 'error', message: 'compile err', line: 3 },
    ])
    const all = getModelMarkers(m)
    expect(all).toHaveLength(3)
    // owner 隔离：更新 lint 不影响 compile
    setModelMarkers(m, 'lint', [{ severity: 'info', message: 'lint info', line: 1 }])
    expect(getModelMarkers(m)).toHaveLength(2)
    expect(getModelMarkers(m).some((x) => x.message === 'compile err')).toBe(true)
    // 按行查
    expect(getMarkersForLine(m, 1)).toHaveLength(1)
    expect(getMarkersForLine(m, 3)).toHaveLength(1)
    // 清空
    clearModelMarkers(m)
    expect(getModelMarkers(m)).toHaveLength(0)
  })

  it('severityToClass 映射', () => {
    expect(severityToClass('error')).toBe('cd-marker-diagnostic-error')
    expect(severityToClass('warning')).toBe('cd-marker-diagnostic-warning')
    expect(severityToClass('info')).toBe('cd-marker-diagnostic-info')
  })
})
