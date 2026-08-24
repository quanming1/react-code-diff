/**
 * @cd/view 虚拟滚动（FR4.3）——BIT 前缀和 + 视口行范围计算。
 *
 * 纯命令式（React 不参与滚动）；View 持有 BIT 实例，滚动时查询可见行。
 * 行高固定（等宽字体无 wrap）场景用 uniform 快速路径。
 */

/** 轻量 BIT（Fenwick Tree）——O(log n) 前缀和/更新 */
export class PrefixSum {
  private _tree: Float64Array
  private _size: number

  constructor(size: number, initial?: number[]) {
    this._size = size
    this._tree = new Float64Array(size + 1)
    if (initial) this.init(initial)
  }

  get size(): number {
    return this._size
  }

  init(values: ArrayLike<number>): void {
    const n = this._size
    this._tree = new Float64Array(n + 1)
    for (let i = 1; i <= n; i++) this._tree[i] = values[i - 1]
    for (let i = 1; i <= n; i++) {
      const p = i + (i & -i)
      if (p <= n) this._tree[p] += this._tree[i]
    }
  }

  set(index: number, value: number): void {
    const old = this.query(index) - this.query(index - 1)
    const delta = value - old
    let i = index + 1
    while (i <= this._size) {
      this._tree[i] += delta
      i += i & -i
    }
  }

  query(index: number): number {
    if (index < 0) return 0
    if (index >= this._size) index = this._size - 1
    let sum = 0
    let i = index + 1
    while (i > 0) {
      sum += this._tree[i]
      i -= i & -i
    }
    return sum
  }

  total(): number {
    return this.query(this._size - 1)
  }

  /** 找最大 i 使 query(i) <= target（BIT 二分） */
  findIndex(target: number): number {
    if (this._size === 0) return -1
    if (target <= 0) return -1
    let pos = 0
    let sum = 0
    let blockSize = 1 << Math.floor(Math.log2(this._size))
    while (blockSize > 0) {
      const next = pos + blockSize
      if (next <= this._size && sum + this._tree[next] <= target) {
        pos = next
        sum += this._tree[pos]
      }
      blockSize >>= 1
    }
    return pos - 1
  }
}

export interface VisibleRange {
  startIndex: number
  endIndex: number
  offsetY: number
  totalHeight: number
}

/** 计算可见行范围（scrollTop + viewportH，含 overscan） */
export function computeVisibleRange(
  bit: PrefixSum,
  scrollTop: number,
  viewportH: number,
  overscan = 8,
): VisibleRange {
  const total = bit.size
  if (total === 0) return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 }
  const totalHeight = bit.total()
  if (viewportH <= 0) return { startIndex: 0, endIndex: Math.min(total, 1), offsetY: 0, totalHeight }

  const lastBefore = bit.findIndex(scrollTop)
  let start = Math.max(0, lastBefore + 1)
  start = Math.max(0, start - overscan)

  const bottom = scrollTop + viewportH
  const lastVisible = bit.findIndex(bottom)
  let end = Math.min(total, lastVisible + 1 + overscan)
  if (end <= start) end = Math.min(total, start + 1)

  const offsetY = start > 0 ? bit.query(start - 1) : 0
  return { startIndex: start, endIndex: end, offsetY, totalHeight }
}
