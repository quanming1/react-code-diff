/**
 * reveal.ts —— 行号跳转与区间高亮的纯逻辑（B1）。
 *
 * 全部为纯函数：区间归一化、行号→行索引定位、折叠区段求解。
 * 虚拟滚动定位与 DOM 渲染在 CodeDiff.tsx 接线。
 */
import type { DiffRow } from './types'

/** 归一化后的高亮区间（新文件行号，1-based，含端点） */
export interface RevealRange {
  start: number
  end: number
}

/**
 * 归一化 reveal props → 区间；revealLine 为空/非法时返回 null（清除高亮）。
 *
 * - 钳制到 [1, totalLines]；totalLines <= 0 视为无内容返回 null
 * - end < start 自动交换
 * - revealEndLine 缺省时仅高亮单行
 */
export function normalizeRevealRange(
  revealLine: number | undefined,
  revealEndLine: number | undefined,
  totalLines: number,
): RevealRange | null {
  if (revealLine == null || !Number.isFinite(revealLine)) return null
  if (totalLines <= 0) return null
  const start0 = Math.min(Math.max(Math.round(revealLine), 1), totalLines)
  const endRaw = revealEndLine == null || !Number.isFinite(revealEndLine)
    ? start0
    : Math.round(revealEndLine)
  const end0 = Math.min(Math.max(endRaw, 1), totalLines)
  return {
    start: Math.min(start0, end0),
    end: Math.max(start0, end0),
  }
}

/** 区间是否覆盖某行号（range 为 null 恒 false） */
export function isLineInReveal(range: RevealRange | null, line: number | null | undefined): boolean {
  if (range == null || line == null) return false
  return line >= range.start && line <= range.end
}

/**
 * 按新文件行号定位 diff 行索引（originalIndex）。
 *
 * 优先 right.lineNumber（新文件）；找不到时回退 left.lineNumber
 * （目标行为纯删除行的场景）。不存在返回 -1。
 */
export function findRowIndexByLineNumber(rows: DiffRow[], line: number): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.right?.lineNumber === line) return i
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.left?.lineNumber === line) return i
  }
  return -1
}

/**
 * 求与行号区间相交的折叠区段 id 集合（用于定位前自动展开）。
 *
 * 重放 buildVisibleRows 的 sectionId 划分算法：
 * showDiffOnly 时不可见连续行段依次编号，返回覆盖 [fromLine, toLine]
 * （新文件行号）的区段 id；无折叠（showDiffOnly=false 或无相交）返回空数组。
 */
export function findSectionsForRange(
  rows: DiffRow[],
  showDiffOnly: boolean,
  contextLines: number,
  fromLine: number,
  toLine: number,
): number[] {
  if (!showDiffOnly || rows.length === 0) return []

  const changeIndices = new Set<number>()
  rows.forEach((row, idx) => {
    if (row.type !== 'context') changeIndices.add(idx)
  })
  if (changeIndices.size === 0) return []

  const visible = new Set<number>()
  for (const idx of changeIndices) {
    const s = Math.max(0, idx - contextLines)
    const e = Math.min(rows.length - 1, idx + contextLines)
    for (let j = s; j <= e; j++) visible.add(j)
  }

  const result: number[] = []
  let sectionId = 0
  let i = 0
  while (i < rows.length) {
    if (visible.has(i)) {
      i++
      continue
    }
    let end = i
    while (end < rows.length && !visible.has(end)) end++
    // 该折叠区段 [i, end) 内是否有新文件行号落入 [fromLine, toLine]
    let intersects = false
    for (let j = i; j < end; j++) {
      const ln = rows[j].right?.lineNumber
      if (ln != null && ln >= fromLine && ln <= toLine) {
        intersects = true
        break
      }
    }
    if (intersects) result.push(sectionId)
    sectionId++
    i = end
  }
  return result
}
