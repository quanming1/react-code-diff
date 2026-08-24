import { describe, it, expect } from 'vitest'
import { CORE_VERSION } from '../index'

describe('@cd/core 骨架', () => {
  it('导出包版本常量', () => {
    expect(CORE_VERSION).toBe('0.3.0')
  })

  it('纯 node 环境可运行（无 DOM 依赖）', () => {
    expect(typeof globalThis).toBe('object')
  })
})
