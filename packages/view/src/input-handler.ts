/**
 * @cd/view 输入处理（FR5.2/5.3）——键盘/IME/剪贴板 → applyEdits + EditStack + CursorsController。
 *
 * 职责：
 * - 监听容器的 keydown / compositionstart/update/end / paste
 * - 普通字符 → 插入到光标处（多光标：每个光标插入）
 * - Backspace/Delete → 删除（有选区删选区，无选区删字符）
 * - Enter → 插入换行（保留缩进）
 * - Tab/Shift+Tab → 缩进/反缩进（多行选区整行缩进）
 * - 方向键/Home/End/PageUp/PageDown → CursorsController 移动（Shift 扩展）
 * - Ctrl+Z / Ctrl+Shift+Z → undo/redo
 * - IME：组合期不落盘，compositionend 一次落盘
 * - 每次编辑 → EditStack.pushEdit（合并同向输入）
 */

import type { TextModel, Selection, Position } from '@cd/core'
import { EditStack, CursorsController, getSelectionRange, isCollapsed } from '@cd/core'

export interface InputHandlerOptions {
  /** 是否可编辑（readOnly 时不挂监听） */
  readOnly?: boolean
  /** 行高/字符宽（光标定位用） */
  lineHeight?: number
  charWidth?: number
}

export interface InputHandlerCallbacks {
  /** 编辑后回调（View 重渲 + 光标同步） */
  onDidEdit: (selections: Selection[]) => void
  /** 光标移动回调（滚动跟随） */
  onDidMoveCursor: (selections: Selection[]) => void
  /** undo/redo 状态变化（UI 按钮） */
  onUndoRedoStateChange: (state: { canUndo: boolean; canRedo: boolean }) => void
}

export class InputHandler {
  private _model: TextModel | null = null
  private _cursors: CursorsController | null = null
  private _editStack: EditStack | null = null
  private _readOnly: boolean
  private _compositionText = ''
  private _composing = false

  constructor(
    private readonly _target: HTMLElement,
    private readonly _cb: InputHandlerCallbacks,
    options: InputHandlerOptions = {},
  ) {
    this._readOnly = options.readOnly ?? false
  }

  attach(model: TextModel, cursors: CursorsController, editStack: EditStack): void {
    this.detach()
    this._model = model
    this._cursors = cursors
    this._editStack = editStack
    if (this._readOnly) return
    this._target.addEventListener('keydown', this._onKeyDown)
    this._target.addEventListener('compositionstart', this._onCompositionStart)
    this._target.addEventListener('compositionend', this._onCompositionEnd)
    this._target.addEventListener('paste', this._onPaste)
  }

  detach(): void {
    this._target.removeEventListener('keydown', this._onKeyDown)
    this._target.removeEventListener('compositionstart', this._onCompositionStart)
    this._target.removeEventListener('compositionend', this._onCompositionEnd)
    this._target.removeEventListener('paste', this._onPaste)
    this._model = null
    this._cursors = null
    this._editStack = null
  }

  setReadOnly(v: boolean): void {
    this._readOnly = v
    if (this._readOnly) this.detach()
  }

  // ── 事件 ──

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (!this._model || !this._cursors || !this._editStack) return
    // IME 组合期吞掉（组合键由 compositionend 处理）
    if (this._composing) return
    if (e.ctrlKey || e.metaKey) {
      this._handleCtrlKey(e)
      return
    }
    switch (e.key) {
      case 'Backspace': e.preventDefault(); this._deleteBefore(); break
      case 'Delete': e.preventDefault(); this._deleteAfter(); break
      case 'Enter': e.preventDefault(); this._insertText('\n'); break
      case 'Tab': e.preventDefault(); this._handleTab(e.shiftKey); break
      case 'ArrowLeft': e.preventDefault(); this._move('left', e.shiftKey); break
      case 'ArrowRight': e.preventDefault(); this._move('right', e.shiftKey); break
      case 'ArrowUp': e.preventDefault(); this._move('up', e.shiftKey); break
      case 'ArrowDown': e.preventDefault(); this._move('down', e.shiftKey); break
      case 'Home': e.preventDefault(); this._move('home', e.shiftKey); break
      case 'End': e.preventDefault(); this._move('end', e.shiftKey); break
      case 'PageUp': e.preventDefault(); this._move('pageup', e.shiftKey); break
      case 'PageDown': e.preventDefault(); this._move('pagedown', e.shiftKey); break
      default:
        // 可打印字符（不含修饰键组合）
        if (e.key.length === 1 && !e.altKey) {
          e.preventDefault()
          this._insertText(e.key)
        }
    }
  }

  private _handleCtrlKey(e: KeyboardEvent): void {
    const key = e.key.toLowerCase()
    if (key === 'z') {
      e.preventDefault()
      if (e.shiftKey) this._editStack!.redo()
      else this._editStack!.undo()
      this._cb.onUndoRedoStateChange(this._editStack!.getUndoRedoState())
      this._syncCursors()
    } else if (key === 'y') {
      e.preventDefault()
      this._editStack!.redo()
      this._cb.onUndoRedoStateChange(this._editStack!.getUndoRedoState())
      this._syncCursors()
    } else if (key === 'a') {
      e.preventDefault()
      this._selectAll()
    } else if (key === 'c' || key === 'x') {
      // 复制/剪切（有选区才处理；剪贴板 API）
      const sel = this._cursors!.getSelectionRange()
      if (!isCollapsed(this._cursors!.getPrimarySelection())) {
        const text = this._model!.getValueInRange(sel)
        void navigator.clipboard?.writeText(text)
        if (key === 'x') {
          this._deleteSelection()
        }
      }
    }
  }

  private _onCompositionStart = (): void => {
    this._compositionText = ''
    this._composing = true
  }

  private _onCompositionEnd = (e: CompositionEvent): void => {
    if (!this._model || !this._cursors || !this._editStack) return
    const text = e.data ?? this._compositionText
    this._compositionText = ''
    this._composing = false
    if (text) this._insertText(text)
  }

  private _onPaste = (e: ClipboardEvent): void => {
    if (!this._model || !this._cursors || !this._editStack) return
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      this._insertText(text)
    }
  }

  // ── 编辑操作 ──

  private _insertText(text: string): void {
    if (!this._model || !this._cursors || !this._editStack) return
    const selections = this._cursors.getSelections()
    // 多光标：每个光标位置插入（逆序避免位移）
    const edits = selections
      .map((sel) => {
        const range = getSelectionRange(sel)
        return { range, text }
      })
      .sort((a, b) => (b.range.start.line - a.range.start.line) || (b.range.start.column - a.range.start.column))
    const before = this._model.getValue()
    this._model.applyEdits(edits)
    // 新光标：每个插入点之后
    const newSelections = selections.map((sel) => {
      const range = getSelectionRange(sel)
      const delta = text.split('\n').length - 1
      const lastLine = range.start.line + delta
      const lastCol = delta === 0 ? range.start.column + text.length : text.length - text.lastIndexOf('\n')
      return { anchor: { line: lastLine, column: lastCol }, active: { line: lastLine, column: lastCol } }
    })
    this._cursors.setSelections(newSelections)
    this._editStack.pushEdit(before, selections[0], this._model.getValue(), newSelections[0])
    this._cb.onDidEdit(this._cursors.getSelections())
    this._cb.onUndoRedoStateChange(this._editStack.getUndoRedoState())
  }

  private _deleteBefore(): void {
    if (!this._model || !this._cursors || !this._editStack) return
    const sel = this._cursors.getPrimarySelection()
    if (!isCollapsed(sel)) {
      this._deleteSelection()
      return
    }
    const pos = sel.active
    let range: { start: Position; end: Position }
    if (pos.column > 1) {
      range = { start: { line: pos.line, column: pos.column - 1 }, end: { line: pos.line, column: pos.column } }
    } else if (pos.line > 1) {
      const prevMax = this._model.getLineMaxColumn(pos.line - 1)
      range = { start: { line: pos.line - 1, column: prevMax }, end: { line: pos.line, column: 1 } }
    } else {
      return
    }
    this._applySingleEdit(range, '')
  }

  private _deleteAfter(): void {
    if (!this._model || !this._cursors || !this._editStack) return
    const sel = this._cursors.getPrimarySelection()
    if (!isCollapsed(sel)) {
      this._deleteSelection()
      return
    }
    const pos = sel.active
    const maxCol = this._model.getLineMaxColumn(pos.line)
    let range: { start: Position; end: Position }
    if (pos.column < maxCol) {
      range = { start: pos, end: { line: pos.line, column: pos.column + 1 } }
    } else if (pos.line < this._model.getLineCount()) {
      range = { start: pos, end: { line: pos.line + 1, column: 1 } }
    } else {
      return
    }
    this._applySingleEdit(range, '')
  }

  private _deleteSelection(): void {
    if (!this._model || !this._cursors || !this._editStack) return
    const sel = this._cursors.getPrimarySelection()
    const range = getSelectionRange(sel)
    this._applySingleEdit(range, '')
  }

  private _applySingleEdit(range: { start: Position; end: Position }, text: string): void {
    if (!this._model || !this._cursors || !this._editStack) return
    const before = this._model.getValue()
    this._model.applyEdits([{ range, text }])
    const newPos: Position = text === '' ? { ...range.start } : { line: range.start.line, column: range.start.column + text.length }
    const newSel = { anchor: newPos, active: newPos }
    this._cursors.setSelections([newSel])
    this._editStack.pushEdit(before, this._cursors.getPrimarySelection(), this._model.getValue(), newSel)
    this._cb.onDidEdit(this._cursors.getSelections())
    this._cb.onUndoRedoStateChange(this._editStack.getUndoRedoState())
  }

  private _handleTab(shift: boolean): void {
    if (!this._model || !this._cursors || !this._editStack) return
    const sel = this._cursors.getPrimarySelection()
    const range = getSelectionRange(sel)
    if (range.start.line === range.end.line && isCollapsed(this._cursors.getPrimarySelection())) {
      // 单光标：插入 2 空格（或 shift 反缩进）
      if (shift) {
        const pos = sel.active
        const line = this._model.getLineContent(pos.line)
        const indent = line.match(/^ {1,2}|\t/)?.[0] ?? ''
        if (indent) this._applySingleEdit({ start: { line: pos.line, column: 1 }, end: { line: pos.line, column: 1 + indent.length } }, '')
      } else {
        this._insertText('  ')
      }
      return
    }
    // 多行选区：整行缩进/反缩进
    const edits = []
    const indentText = shift ? '' : '  '
    for (let l = range.start.line; l <= range.end.line; l++) {
      if (shift) {
        const line = this._model.getLineContent(l)
        const m = line.match(/^ {1,2}|\t/)
        if (m) edits.push({ range: { start: { line: l, column: 1 }, end: { line: l, column: 1 + m[0].length } }, text: '' })
      } else {
        edits.push({ range: { start: { line: l, column: 1 }, end: { line: l, column: 1 } }, text: indentText })
      }
    }
    if (edits.length === 0) return
    const before = this._model.getValue()
    this._model.applyEdits(edits)
    this._editStack.pushEdit(before, sel, this._model.getValue(), sel)
    this._cb.onDidEdit(this._cursors.getSelections())
    this._cb.onUndoRedoStateChange(this._editStack.getUndoRedoState())
  }

  private _move(dir: 'left' | 'right' | 'up' | 'down' | 'home' | 'end' | 'pageup' | 'pagedown', shift: boolean): void {
    if (!this._cursors) return
    const c = this._cursors
    switch (dir) {
      case 'left': c.moveLeft(shift); break
      case 'right': c.moveRight(shift); break
      case 'up': c.moveUp(shift); break
      case 'down': c.moveDown(shift); break
      case 'home': c.moveToLineStart(shift); break
      case 'end': c.moveToLineEnd(shift); break
      case 'pageup': c.movePageUp(10, shift); break
      case 'pagedown': c.movePageDown(10, shift); break
    }
    this._cb.onDidMoveCursor(c.getSelections())
  }

  private _selectAll(): void {
    if (!this._cursors || !this._model) return
    const maxLine = this._model.getLineCount()
    const maxCol = this._model.getLineMaxColumn(maxLine)
    this._cursors.setSelections([{ anchor: { line: 1, column: 1 }, active: { line: maxLine, column: maxCol } }])
    this._cb.onDidMoveCursor(this._cursors.getSelections())
  }

  private _syncCursors(): void {
    if (!this._cursors) return
    this._cb.onDidMoveCursor(this._cursors.getSelections())
  }
}
