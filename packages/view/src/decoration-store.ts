/**
 * @cd/view 装饰层（FR4.4）——区间装饰集合，Monaco deltaDecorations 语义。
 *
 * - 装饰 = 数据（区间 + 选项），渲染时合成 class/图标，不重写行内容
 * - deltaDecorations(oldIds, newDecorations) → 新 ids（增量更新）
 * - 查询：行号 → 该行装饰签名（View 渲染时叠加 class）
 * - 类型：reveal 高亮带 / 搜索高亮 / inline diff / 断点 / 诊断
 */

export type DecorationType =
  | 'reveal'          // 区间高亮带（行级）
  | 'search'          // 搜索匹配（行级）
  | 'inline-add'      // inline diff 新增
  | 'inline-del'      // inline diff 删除
  | 'breakpoint'      // 断点（glyph margin 红点）
  | 'diagnostic-error' // 诊断错误（波浪线 + gutter 图标）
  | 'diagnostic-warning' // 诊断警告
  | 'diagnostic-info'   // 诊断信息

export interface LineDecoration {
  /** 1-based 行号 */
  line: number
  type: DecorationType
  /** 附加数据（诊断消息等） */
  message?: string
}

export interface DecorationOptions {
  /** 行号（1-based） */
  line: number
  type: DecorationType
  message?: string
}

export class DecorationStore {
  private _decorations = new Map<number, Map<number, LineDecoration>>()
  private _nextId = 1
  private readonly _idToLine = new Map<number, number>()

  /**
   * delta 更新（Monaco 语义）：oldIds 对应的装饰被移除，newDecorations 新增。
   * 返回新 ids。
   */
  deltaDecorations(oldIds: number[], newDecorations: DecorationOptions[]): number[] {
    // 移除旧的
    for (const id of oldIds) {
      const line = this._idToLine.get(id)
      if (line != null) {
        this._idToLine.delete(id)
        const lineMap = this._decorations.get(line)
        if (lineMap) {
          lineMap.delete(id)
          if (lineMap.size === 0) this._decorations.delete(line)
        }
      }
    }
    // 新增
    const newIds: number[] = []
    for (const dec of newDecorations) {
      const id = this._nextId++
      let lineMap = this._decorations.get(dec.line)
      if (!lineMap) {
        lineMap = new Map()
        this._decorations.set(dec.line, lineMap)
      }
      lineMap.set(id, { line: dec.line, type: dec.type, message: dec.message })
      this._idToLine.set(id, dec.line)
      newIds.push(id)
    }
    return newIds
  }

  /** 清除某行全部装饰 */
  clearLine(line: number): void {
    const lineMap = this._decorations.get(line)
    if (lineMap) {
      for (const id of lineMap.keys()) this._idToLine.delete(id)
      this._decorations.delete(line)
    }
  }

  /** 清除全部 */
  clearAll(): void {
    this._decorations.clear()
    this._idToLine.clear()
  }

  /** 某行的全部装饰（按插入序） */
  getLineDecorations(line: number): LineDecoration[] {
    const lineMap = this._decorations.get(line)
    if (!lineMap) return []
    return [...lineMap.values()]
  }

  /** 行装饰签名（View 渲染时叠加 class；空 = 无装饰） */
  getLineDecorationClass(line: number): string {
    const decs = this.getLineDecorations(line)
    if (decs.length === 0) return ''
    const classes = decs.map((d) => `cd-dec-${d.type}`)
    return classes.join(' ')
  }

  /** 查询所有断点行 */
  getBreakpointLines(): number[] {
    const lines: number[] = []
    for (const [line, map] of this._decorations) {
      for (const dec of map.values()) {
        if (dec.type === 'breakpoint') {
          lines.push(line)
          break
        }
      }
    }
    return lines
  }

  /** 查询某行是否为断点 */
  isBreakpoint(line: number): boolean {
    return this.getLineDecorations(line).some((d) => d.type === 'breakpoint')
  }
}
