/**
 * MutablePrefixSum — Binary Indexed Tree (Fenwick Tree) for O(log n) updates + queries.
 *
 * In the V1 virtual scroll, every time a single row height changed, we rebuilt
 * the entire prefix-sum array (O(n)). With a BIT, updating one row's height
 * and querying the accumulated height at any index are both O(log n).
 *
 * The BIT stores deltas at each index. query(i) returns the sum of entries
 * [0..i] (inclusive, 0-indexed). update(i, delta) adds delta to position i.
 *
 * For our use case:
 *   - Initialize with row heights → prefix sums give vertical offsets
 *   - When a row's measured height differs from estimate, call update() with the diff
 *   - No full rebuild needed
 */

export class MutablePrefixSum {
  private _tree: Float64Array
  private _size: number
  private _values: Float64Array

  constructor(size: number) {
    this._size = size
    // BIT is 1-indexed internally; allocate size+1
    this._tree = new Float64Array(size + 1)
    this._values = new Float64Array(size)
  }

  get size(): number {
    return this._size
  }

  /**
   * Initialize the BIT with individual values.
   * O(n) — faster than n individual update() calls.
   */
  init(values: ArrayLike<number>): void {
    const n = this._size
    // Copy values
    for (let i = 0; i < n && i < values.length; i++) {
      this._values[i] = values[i]
    }
    // Build tree in O(n): put values in, then propagate
    for (let i = 1; i <= n; i++) {
      this._tree[i] = this._values[i - 1]
    }
    for (let i = 1; i <= n; i++) {
      const parent = i + (i & -i)
      if (parent <= n) {
        this._tree[parent] += this._tree[i]
      }
    }
  }

  /**
   * Set the value at a specific index (replaces, doesn't add).
   * Internally computes delta = newValue - oldValue and calls _add.
   * O(log n).
   */
  set(index: number, value: number): void {
    if (index < 0 || index >= this._size) return
    const delta = value - this._values[index]
    this._values[index] = value
    this._add(index, delta)
  }

  /**
   * Add a delta to the value at index.
   * O(log n).
   */
  add(index: number, delta: number): void {
    if (index < 0 || index >= this._size) return
    this._values[index] += delta
    this._add(index, delta)
  }

  private _add(index: number, delta: number): void {
    // BIT is 1-indexed
    let i = index + 1
    while (i <= this._size) {
      this._tree[i] += delta
      i += i & -i // Move to next responsible node
    }
  }

  /**
   * Query the prefix sum [0..index] (inclusive).
   * Returns the accumulated value from position 0 through index.
   * O(log n).
   */
  query(index: number): number {
    if (index < 0) return 0
    if (index >= this._size) index = this._size - 1

    let sum = 0
    let i = index + 1
    while (i > 0) {
      sum += this._tree[i]
      i -= i & -i // Move to parent node
    }
    return sum
  }

  /**
   * Query the sum in range [start..end] (inclusive).
   * O(log n).
   */
  queryRange(start: number, end: number): number {
    if (start > end) return 0
    const endSum = this.query(end)
    const startSum = start > 0 ? this.query(start - 1) : 0
    return endSum - startSum
  }

  /**
   * Get the total sum (all entries).
   * O(log n).
   */
  total(): number {
    return this.query(this._size - 1)
  }

  /**
   * Binary search: find the largest index i such that query(i) <= target.
   *
   * This is the BIT search operation — O(log n), no binary search needed.
   * Used to find which row corresponds to a given vertical offset (scrollTop).
   *
   * Returns the index, or -1 if target < 0, or size-1 if target >= total.
   */
  findIndex(target: number): number {
    if (target < 0) return -1
    if (this._size === 0) return -1

    // BIT binary search: find the position where prefix sum crosses target
    let pos = 0
    let sum = 0
    // Start from the highest power of 2 <= size
    let logSize = 0
    let temp = this._size
    while (temp > 1) {
      temp >>= 1
      logSize++
    }
    let blockSize = 1 << logSize

    while (blockSize > 0) {
      const nextPos = pos + blockSize
      if (nextPos <= this._size && sum + this._tree[nextPos] <= target) {
        pos = nextPos
        sum += this._tree[pos]
      }
      blockSize >>= 1
    }

    // pos is the 1-indexed position; convert to 0-indexed
    // This is the largest index where prefix sum <= target
    if (pos === 0) return 0 // target is before the first element's accumulated sum
    return pos - 1
  }

  /**
   * Get the raw value at a specific index.
   * O(1).
   */
  get(index: number): number {
    if (index < 0 || index >= this._size) return 0
    return this._values[index]
  }

  /**
   * Resize the BIT. Preserves existing values, zero-fills new entries.
   * O(n) — but only called when the row count changes (infrequent).
   */
  resize(newSize: number): void {
    const oldValues = Array.from(this._values)
    this._size = newSize
    this._tree = new Float64Array(newSize + 1)
    this._values = new Float64Array(newSize)
    for (let i = 0; i < newSize && i < oldValues.length; i++) {
      this._values[i] = oldValues[i]
    }
    // Rebuild tree
    for (let i = 1; i <= newSize; i++) {
      this._tree[i] = this._values[i - 1]
    }
    for (let i = 1; i <= newSize; i++) {
      const parent = i + (i & -i)
      if (parent <= newSize) {
        this._tree[parent] += this._tree[i]
      }
    }
  }

  /**
   * Clear all values to zero.
   * O(n).
   */
  clear(): void {
    this._tree.fill(0)
    this._values.fill(0)
  }
}
