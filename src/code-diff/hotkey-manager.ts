export interface HotkeyHandlers {
  openSearch: () => void
}

interface KeyboardEventLike extends Event {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

export interface HotkeyManager {
  register: (id: symbol, handlers: HotkeyHandlers) => () => void
  activate: (id: symbol) => void
  deactivate: (id: symbol) => void
  dispose: () => void
}

export function createHotkeyManager(target: EventTarget): HotkeyManager {
  const registrations = new Map<symbol, HotkeyHandlers>()
  let activeId: symbol | null = null
  let listening = false

  const onKeyDown = (rawEvent: Event) => {
    const event = rawEvent as KeyboardEventLike
    const hasSinglePrimaryModifier = event.ctrlKey !== event.metaKey
    const opensSearch =
      event.key.toLowerCase() === 'f' &&
      hasSinglePrimaryModifier &&
      !event.altKey &&
      !event.shiftKey &&
      !event.repeat

    if (!opensSearch || activeId === null) return
    const handlers = registrations.get(activeId)
    if (!handlers) return

    event.preventDefault()
    handlers.openSearch()
  }

  const ensureListening = () => {
    if (listening) return
    target.addEventListener('keydown', onKeyDown)
    listening = true
  }

  const stopListening = () => {
    if (!listening) return
    target.removeEventListener('keydown', onKeyDown)
    listening = false
  }

  const register = (id: symbol, handlers: HotkeyHandlers) => {
    registrations.set(id, handlers)
    ensureListening()
    let registered = true

    return () => {
      if (!registered) return
      registered = false
      registrations.delete(id)
      if (activeId === id) activeId = null
      if (registrations.size === 0) stopListening()
    }
  }

  const activate = (id: symbol) => {
    if (registrations.has(id)) activeId = id
  }

  const deactivate = (id: symbol) => {
    if (activeId === id) activeId = null
  }

  const dispose = () => {
    activeId = null
    registrations.clear()
    stopListening()
  }

  return { register, activate, deactivate, dispose }
}

let documentManager: HotkeyManager | null = null

function getDocumentManager(): HotkeyManager | null {
  if (typeof document === 'undefined') return null
  documentManager ??= createHotkeyManager(document)
  return documentManager
}

export function registerHotkeyInstance(id: symbol, handlers: HotkeyHandlers): () => void {
  return getDocumentManager()?.register(id, handlers) ?? (() => {})
}

export function activateHotkeyInstance(id: symbol): void {
  getDocumentManager()?.activate(id)
}

export function deactivateHotkeyInstance(id: symbol): void {
  documentManager?.deactivate(id)
}

export function resetHotkeyManagerForTests(): void {
  documentManager?.dispose()
  documentManager = null
}
