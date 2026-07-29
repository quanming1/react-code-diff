import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createHotkeyManager,
  resetHotkeyManagerForTests,
} from '../code-diff/hotkey-manager'

class FakeKeyboardEvent extends Event {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly repeat: boolean

  constructor(init: {
    key?: string
    ctrlKey?: boolean
    metaKey?: boolean
    altKey?: boolean
    shiftKey?: boolean
    repeat?: boolean
  } = {}) {
    super('keydown', { cancelable: true })
    this.key = init.key ?? 'f'
    this.ctrlKey = init.ctrlKey ?? false
    this.metaKey = init.metaKey ?? false
    this.altKey = init.altKey ?? false
    this.shiftKey = init.shiftKey ?? false
    this.repeat = init.repeat ?? false
  }
}

function keydown(
  target: EventTarget,
  init: ConstructorParameters<typeof FakeKeyboardEvent>[0] = {},
): FakeKeyboardEvent {
  const event = new FakeKeyboardEvent(init)
  target.dispatchEvent(event)
  return event
}

describe('hotkey manager', () => {
  afterEach(() => {
    resetHotkeyManagerForTests()
  })

  it.each([
    { name: 'Ctrl+F', init: { ctrlKey: true } },
    { name: 'Meta+F', init: { metaKey: true } },
    { name: 'uppercase Ctrl+F', init: { ctrlKey: true, key: 'F' } },
  ])('dispatches $name to the active instance', ({ init }) => {
    const target = new EventTarget()
    const manager = createHotkeyManager(target)
    const id = Symbol('diff')
    const openSearch = vi.fn()
    manager.register(id, { openSearch })
    manager.activate(id)

    const event = keydown(target, init)

    expect(openSearch).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('dispatches only to the most recently activated instance', () => {
    const target = new EventTarget()
    const manager = createHotkeyManager(target)
    const firstId = Symbol('first')
    const secondId = Symbol('second')
    const first = vi.fn()
    const second = vi.fn()
    manager.register(firstId, { openSearch: first })
    manager.register(secondId, { openSearch: second })

    manager.activate(firstId)
    manager.activate(secondId)
    keydown(target, { ctrlKey: true })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('preserves browser find when no instance is active', () => {
    const target = new EventTarget()
    const manager = createHotkeyManager(target)
    const id = Symbol('diff')
    const openSearch = vi.fn()
    manager.register(id, { openSearch })

    const event = keydown(target, { ctrlKey: true })

    expect(openSearch).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    { name: 'plain F', init: {} },
    { name: 'Alt+Ctrl+F', init: { ctrlKey: true, altKey: true } },
    { name: 'Shift+Ctrl+F', init: { ctrlKey: true, shiftKey: true } },
    { name: 'repeated Ctrl+F', init: { ctrlKey: true, repeat: true } },
    { name: 'Ctrl+G', init: { ctrlKey: true, key: 'g' } },
    { name: 'Ctrl+Meta+F', init: { ctrlKey: true, metaKey: true } },
  ])('ignores $name', ({ init }) => {
    const target = new EventTarget()
    const manager = createHotkeyManager(target)
    const id = Symbol('diff')
    const openSearch = vi.fn()
    manager.register(id, { openSearch })
    manager.activate(id)

    const event = keydown(target, init)

    expect(openSearch).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('deactivates only when the matching instance owns activation', () => {
    const target = new EventTarget()
    const manager = createHotkeyManager(target)
    const firstId = Symbol('first')
    const secondId = Symbol('second')
    const first = vi.fn()
    const second = vi.fn()
    manager.register(firstId, { openSearch: first })
    manager.register(secondId, { openSearch: second })
    manager.activate(secondId)

    manager.deactivate(firstId)
    keydown(target, { ctrlKey: true })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('does not invoke an instance after it unregisters', () => {
    const target = new EventTarget()
    const manager = createHotkeyManager(target)
    const id = Symbol('diff')
    const openSearch = vi.fn()
    const unregister = manager.register(id, { openSearch })
    manager.activate(id)

    unregister()
    const event = keydown(target, { ctrlKey: true })

    expect(openSearch).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('supports idempotent unregister calls and listener cleanup', () => {
    const target = new EventTarget()
    const manager = createHotkeyManager(target)
    const id = Symbol('diff')
    const openSearch = vi.fn()
    const unregister = manager.register(id, { openSearch })
    manager.activate(id)

    expect(() => {
      unregister()
      unregister()
      manager.dispose()
      manager.dispose()
    }).not.toThrow()

    keydown(target, { ctrlKey: true })
    expect(openSearch).not.toHaveBeenCalled()
  })
})
