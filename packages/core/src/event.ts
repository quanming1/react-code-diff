/**
 * @cd/core 事件系统（Monaco 风格，零依赖）。
 *
 * - Emitter<T>：可触发的事件源；on() 返回一次性取消订阅函数。
 * - Event<T>：只读监听器类型（把「可订阅」与「可触发」分离，核心是只暴露 Event 给外部）。
 * - 异常隔离：单个监听器抛错不影响其他监听器（Monaco 的 invokeListener 语义）。
 * - 一次性：ListenerOnce 包装，触发后自动取消。
 */

export type Listener<T> = (event: T) => void

/** 取消订阅函数（调用后不再触发；幂等） */
export type Disposable = () => void

/** 只读事件（对外暴露类型：只能订阅，不能触发） */
export type Event<T> = (listener: Listener<T>) => Disposable

interface ListenerEntry<T> {
  listener: Listener<T>
  once: boolean
}

export class Emitter<T> {
  private _listeners: ListenerEntry<T>[] | null = null

  /** 订阅事件，返回取消函数（幂等） */
  on(listener: Listener<T>): Disposable {
    const entry: ListenerEntry<T> = { listener, once: false }
    ;(this._listeners ??= []).push(entry)
    let removed = false
    return () => {
      if (removed || !this._listeners) return
      removed = true
      const i = this._listeners.indexOf(entry)
      if (i >= 0) this._listeners.splice(i, 1)
    }
  }

  /** 一次性订阅：触发一次后自动取消 */
  once(listener: Listener<T>): Disposable {
    const entry: ListenerEntry<T> = { listener, once: true }
    ;(this._listeners ??= []).push(entry)
    let removed = false
    return () => {
      if (removed || !this._listeners) return
      removed = true
      const i = this._listeners.indexOf(entry)
      if (i >= 0) this._listeners.splice(i, 1)
    }
  }

  /** 触发事件；单个监听器抛错不影响其他监听器 */
  fire(event: T): void {
    if (!this._listeners || this._listeners.length === 0) return
    // 快照：允许监听器在回调中增删订阅不影响本轮
    const snapshot = this._listeners.slice()
    for (const entry of snapshot) {
      try {
        entry.listener(event)
      } catch (err) {
        // 异常隔离：打印但不中断其他监听器
        console.error('[Emitter] listener error:', err)
      }
      if (entry.once) {
        const i = this._listeners.indexOf(entry)
        if (i >= 0) this._listeners.splice(i, 1)
      }
    }
  }

  /** 是否还有订阅者 */
  hasListeners(): boolean {
    return !!this._listeners && this._listeners.length > 0
  }

  /** 清空全部订阅 */
  dispose(): void {
    this._listeners = null
  }

  /** 暴露只读事件视图 */
  get event(): Event<T> {
    return (listener) => this.on(listener)
  }
}

/** 便捷工厂：返回 [emitter, event]（需要同时持有触发端与订阅端时用） */
export function createEmitter<T>(): { emitter: Emitter<T>; event: Event<T> } {
  const emitter = new Emitter<T>()
  return { emitter, event: emitter.event }
}
