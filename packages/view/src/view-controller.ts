/**
 * @cd/view 命令路由（FR5.3）——键盘命令注册表。
 *
 * 简化：InputHandler 已内联处理键位；本文件提供命令抽象（供工具栏/外部触发）。
 */

export type EditorCommand =
  | 'undo' | 'redo'
  | 'moveLeft' | 'moveRight' | 'moveUp' | 'moveDown'
  | 'moveToLineStart' | 'moveToLineEnd'
  | 'moveToFileStart' | 'moveToFileEnd'
  | 'selectAll'

export interface CommandExecutor {
  execute(command: EditorCommand, args?: unknown): boolean
}

/** 从 InputHandler 派生的命令执行器（D5 首版：透传给 handler 的扩展点） */
export class ViewController implements CommandExecutor {
  private readonly _handlers = new Map<EditorCommand, () => boolean>()

  register(command: EditorCommand, fn: () => boolean): void {
    this._handlers.set(command, fn)
  }

  execute(command: EditorCommand): boolean {
    const fn = this._handlers.get(command)
    return fn ? fn() : false
  }

  has(command: EditorCommand): boolean {
    return this._handlers.has(command)
  }
}
