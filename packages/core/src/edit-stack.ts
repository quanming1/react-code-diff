/**
 * @cd/core 撤销/重做栈（FR2.5）。
 *
 * 设计：
 * - 快照式：每个编辑组保存 before/after 的 { value, selection }（D2 阶段全量快照，
 *   正确优先；D5 输入高频场景可优化为 delta 存储）。
 * - 合并：连续「同字符输入」（insert 型：after 比 before 多 1 字符且插入点连续；
 *   delete 型：少 1 字符）自动合并为同一 undo 组（Monaco isInsertion 语义）。
 * - 事件：onDidChangeUndoRedoState（canUndo/canRedo 变化 → UI 按钮状态）。
 * - undo/redo 通过 applyEdits 恢复内容 + 恢复光标；恢复过程不重新入栈。
 */

import { Emitter, type Event } from './event'
import type { TextModel } from './text-model'
import type { Selection } from './types'

interface EditStackEntry {
  valueBefore: string
  selectionBefore: Selection
  valueAfter: string
  selectionAfter: Selection
  /** 该组包含的编辑步数（合并累计；=1 表示未合并） */
  steps: number
}

export interface UndoRedoState {
  canUndo: boolean
  canRedo: boolean
}

const INSERT_CHAR_LIMIT = 1000

export class EditStack {
  private readonly _undoStack: EditStackEntry[] = []
  private readonly _redoStack: EditStackEntry[] = []

  private readonly _onDidChangeUndoRedoState: Emitter<UndoRedoState>
  readonly onDidChangeUndoRedoState: Event<UndoRedoState>
  private readonly _model: TextModel

  constructor(model: TextModel) {
    this._model = model
    this._onDidChangeUndoRedoState = new Emitter()
    this.onDidChangeUndoRedoState = this._onDidChangeUndoRedoState.event
  }

  canUndo(): boolean {
    return this._undoStack.length > 0
  }

  canRedo(): boolean {
    return this._redoStack.length > 0
  }

  getUndoRedoState(): UndoRedoState {
    return { canUndo: this.canUndo(), canRedo: this.canRedo() }
  }

  /**
   * 记录一次编辑（在编辑完成后调用）。
   * @param selectionBefore 编辑前光标
   * @param selectionAfter  编辑后光标
   * @param valueBefore     编辑前文本（通常为 model.getValue()）
   * @param valueAfter      编辑后文本
   */
  pushEdit(valueBefore: string, selectionBefore: Selection, valueAfter: string, selectionAfter: Selection): void {
    const entry: EditStackEntry = {
      valueBefore,
      selectionBefore,
      valueAfter,
      selectionAfter,
      steps: 1,
    }

    const prev = this._undoStack[this._undoStack.length - 1]
    if (prev && canMerge(prev, entry)) {
      // 合并：更新 prev 的 after（before 保持 = 首步 before）
      prev.valueAfter = entry.valueAfter
      prev.selectionAfter = entry.selectionAfter
      prev.steps++
    } else {
      this._undoStack.push(entry)
    }
    // 新编辑清空 redo 栈
    this._redoStack.length = 0
    this._fire()
  }

  undo(): boolean {
    const entry = this._undoStack.pop()
    if (!entry) return false
    // 恢复 before 状态（内容 + 光标），不重新入栈
    this._replaceValue(entry.valueBefore, entry.selectionBefore)
    this._redoStack.push(entry)
    this._fire()
    return true
  }

  redo(): boolean {
    const entry = this._redoStack.pop()
    if (!entry) return false
    this._replaceValue(entry.valueAfter, entry.selectionAfter)
    this._undoStack.push(entry)
    this._fire()
    return true
  }

  /** 重置（内容外部变更 / model 切换） */
  clear(): void {
    this._undoStack.length = 0
    this._redoStack.length = 0
    this._fire()
  }

  private _replaceValue(value: string, selection: Selection): void {
    // 全文替换：range = 全文件 → text = value
    const lineCount = this._model.getLineCount()
    const range = {
      start: { line: 1, column: 1 },
      end: { line: lineCount, column: this._model.getLineMaxColumn(lineCount) },
    }
    this._model.applyEdits([{ range, text: value }])
    // 光标恢复（钳制到新结构）
    const maxLine = this._model.getLineCount()
    const sel: Selection = {
      anchor: {
        line: Math.min(selection.anchor.line, maxLine),
        column: Math.min(selection.anchor.column, this._model.getLineMaxColumn(Math.min(selection.anchor.line, maxLine))),
      },
      active: {
        line: Math.min(selection.active.line, maxLine),
        column: Math.min(selection.active.column, this._model.getLineMaxColumn(Math.min(selection.active.line, maxLine))),
      },
    }
    this._onDidRestoreSelection.fire(sel)
  }

  // ── 光标恢复事件（供 View 层把光标移回）──
  private readonly _onDidRestoreSelection: Emitter<Selection> = new Emitter()
  readonly onDidRestoreSelection: Event<Selection> = this._onDidRestoreSelection.event

  private _fire(): void {
    this._onDidChangeUndoRedoState.fire(this.getUndoRedoState())
  }
}

/**
 * 合并判定（Monaco isInsertion 语义简化版）：
 * - 同方向（都是插入组 或 都是删除组）
 * - 步数小于 INSERT_CHAR_LIMIT（防超大合并）
 * - 插入型：组内累计插入字符数 === steps（纯插入组，无删除混入），且 next 是插入
 * - 删除型：组内累计删除字符数 === steps（纯删除组），且 next 是删除
 * - 内容衔接：prev.valueAfter === next.valueBefore
 */
export function canMerge(prev: EditStackEntry, next: EditStackEntry): boolean {
  if (prev.steps >= INSERT_CHAR_LIMIT) return false
  const prevInsertCount = prev.valueAfter.length - prev.valueBefore.length
  const prevDeleteCount = prev.valueBefore.length - prev.valueAfter.length
  const prevIsInsertGroup = prevInsertCount > 0 && prevInsertCount === prev.steps
  const prevIsDeleteGroup = prevDeleteCount > 0 && prevDeleteCount === prev.steps
  const nextIsInsert = next.valueAfter.length === next.valueBefore.length + 1
  const nextIsDelete = next.valueAfter.length === next.valueBefore.length - 1

  // 方向一致（组方向与单步方向）
  if (!((prevIsInsertGroup && nextIsInsert) || (prevIsDeleteGroup && nextIsDelete))) return false
  // 连续：prev.after === next.before（内容衔接）
  if (prev.valueAfter !== next.valueBefore) return false
  return true
}
