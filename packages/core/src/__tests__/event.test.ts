import { describe, it, expect } from 'vitest'
import { Emitter, createEmitter } from '../event'

describe('Emitter / Event（TC-D2-06）', () => {
  it('订阅与触发', () => {
    const e = new Emitter<number>()
    const got: number[] = []
    e.on((v) => got.push(v))
    e.fire(1)
    e.fire(2)
    expect(got).toEqual([1, 2])
  })

  it('取消订阅后不再触发（幂等）', () => {
    const e = new Emitter<number>()
    let count = 0
    const off = e.on(() => { count++ })
    e.fire(0)
    off()
    off() // 幂等
    e.fire(0)
    expect(count).toBe(1)
  })

  it('once 一次性订阅', () => {
    const e = new Emitter<string>()
    const got: string[] = []
    e.once((v) => got.push(v))
    e.fire('a')
    e.fire('b')
    expect(got).toEqual(['a'])
  })

  it('异常隔离：监听器抛错不影响其他监听器', () => {
    const e = new Emitter<number>()
    const got: number[] = []
    const errs: unknown[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => { errs.push(args[0]) }
    try {
      e.on(() => { throw new Error('boom') })
      e.on((v) => got.push(v))
      e.fire(1)
    } finally {
      console.error = orig
    }
    expect(got).toEqual([1])
    expect(errs.length).toBe(1)
  })

  it('回调中增删订阅不影响本轮快照', () => {
    const e = new Emitter<number>()
    const order: string[] = []
    const offA = e.on(() => { order.push('a') })
    e.on(() => { order.push('b'); offA() })
    e.on(() => { order.push('c') })
    e.fire(0)
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('hasListeners / dispose', () => {
    const e = new Emitter<number>()
    expect(e.hasListeners()).toBe(false)
    const off = e.on(() => {})
    expect(e.hasListeners()).toBe(true)
    off()
    expect(e.hasListeners()).toBe(false)
    e.on(() => {})
    e.dispose()
    expect(e.hasListeners()).toBe(false)
    // dispose 后 fire 不抛错
    e.fire(1)
  })

  it('createEmitter 返回 emitter + event 双端', () => {
    const { emitter, event } = createEmitter<number>()
    const got: number[] = []
    const off = event((v) => got.push(v))
    emitter.fire(42)
    expect(got).toEqual([42])
    off()
    emitter.fire(43)
    expect(got).toEqual([42])
  })
})
