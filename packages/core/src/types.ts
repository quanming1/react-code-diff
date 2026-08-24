/**
 * @cd/core 基础类型（纯数据，无 DOM 依赖）。
 *
 * 语义对齐 Monaco 但独立实现：
 * - Position：1-based 行列（行 1..n、列 1..len+1）
 * - Range：两个 Position 的闭区间 [start, end]（列 1-based，含端点）
 * - Selection：有向区间（anchor 锚点 + active 活动端，支持反向选区）
 */

/** 1-based 行列位置（列 1..行末字符数+1，光标可位于行尾后一列） */
export interface Position {
  /** 行号，1-based */
  line: number
  /** 列号，1-based（最大 = 该行长度 + 1） */
  column: number
}

export function createPosition(line: number, column: number): Position {
  return { line, column }
}

/** 闭区间 [start, end]（1-based，含端点；start ≤ end 按字典序） */
export interface Range {
  start: Position
  end: Position
}

export function createRange(start: Position, end: Position): Range {
  return { start, end }
}

/** 空区间（光标位置）：start === end */
export function isEmptyRange(range: Range): boolean {
  return range.start.line === range.end.line && range.start.column === range.end.column
}

/** range 的字典序比较（-1 / 0 / 1） */
export function comparePositions(a: Position, b: Position): number {
  if (a.line !== b.line) return a.line < b.line ? -1 : 1
  if (a.column !== b.column) return a.column < b.column ? -1 : 1
  return 0
}

/**
 * 选区：anchor（锚点）+ active（活动端）。
 * active 在 anchor 之前 = 反向选区；getRange 返回规范区间（start ≤ end）。
 */
export interface Selection {
  anchor: Position
  active: Position
}

export function createSelection(anchor: Position, active: Position): Selection {
  return { anchor, active }
}

/** 规范区间：start = min(anchor, active)，end = max(...) */
export function getSelectionRange(sel: Selection): Range {
  return comparePositions(sel.anchor, sel.active) <= 0
    ? { start: sel.anchor, end: sel.active }
    : { start: sel.active, end: sel.anchor }
}

/** 是否为反向选区（active 在 anchor 之前） */
export function isReversed(sel: Selection): boolean {
  return comparePositions(sel.active, sel.anchor) < 0
}

/** 空选区（光标）：anchor === active */
export function isCollapsed(sel: Selection): boolean {
  return isEmptyRange(getSelectionRange(sel))
}

/** 单调递增编辑区间（applyEdits 输入要求：按位置升序、互不重叠） */
export interface TextEdit {
  /** 要替换的区间（空区间 = 纯插入） */
  range: Range
  /** 替换后的文本（空串 = 纯删除） */
  text: string
}
