import { describe, it, expect } from 'vitest'
import { MutablePrefixSum } from '../code-diff/prefix-sum'

/**
 * Virtual scroll V2 integration tests.
 *
 * The V2 hook's computeRange() logic is built on MutablePrefixSum's
 * findIndex() and query() methods. These tests simulate scroll scenarios
 * to verify the range computation produces correct startIndex/endIndex/offsetY.
 */

// Simulates the V2 computeRange() logic for uniform-height rows
function computeRangeUniform(
  bit: MutablePrefixSum,
  scrollTop: number,
  viewportH: number,
  total: number,
  overscan: number = 8,
) {
  if (total === 0 || viewportH === 0) {
    return { startIndex: 0, endIndex: Math.min(total, 1), offsetY: 0, totalHeight: bit.total() }
  }
  const lastBefore = bit.findIndex(scrollTop)
  let start = Math.max(0, lastBefore + 1)
  start = Math.max(0, start - overscan)
  const bottom = scrollTop + viewportH
  const lastVisible = bit.findIndex(bottom)
  let end = Math.min(total, lastVisible + 1 + overscan)
  if (end <= start) end = Math.min(total, start + 1)
  const offsetY = start > 0 ? bit.query(start - 1) : 0
  return { startIndex: start, endIndex: end, offsetY, totalHeight: bit.total() }
}

describe('VirtualScroll V2 — range computation', () => {
  const ROW_H = 20
  const VIEWPORT_H = 400 // 20 rows visible

  describe('uniform-height rows', () => {
    it('computes correct range at scrollTop=0', () => {
      const total = 1000
      const bit = new MutablePrefixSum(total)
      bit.init(new Array(total).fill(ROW_H))

      const range = computeRangeUniform(bit, 0, VIEWPORT_H, total)
      // At scrollTop=0: first visible row is 0, with overscan the start is 0
      expect(range.startIndex).toBe(0)
      // Viewport shows 20 rows (0-19), findIndex(400) = 19, end = 19+1+8 = 28
      expect(range.endIndex).toBe(28)
      expect(range.offsetY).toBe(0)
      expect(range.totalHeight).toBe(20_000)
    })

    it('computes correct range when scrolled to middle', () => {
      const total = 1000
      const bit = new MutablePrefixSum(total)
      bit.init(new Array(total).fill(ROW_H))

      // Scroll to row 50 (offset 1000)
      const range = computeRangeUniform(bit, 1000, VIEWPORT_H, total)
      // findIndex(1000) = 49 (query(49) = 1000 <= 1000), start = 50 - 8 = 42
      expect(range.startIndex).toBe(42)
      // findIndex(1400) = 69 (query(69) = 1400), end = 70 + 8 = 78
      expect(range.endIndex).toBe(78)
      expect(range.offsetY).toBe(42 * ROW_H) // 840
    })

    it('computes correct range at end of document', () => {
      const total = 100
      const bit = new MutablePrefixSum(total)
      bit.init(new Array(total).fill(ROW_H))

      // Scroll to bottom: scrollTop = total - viewportH = 2000 - 400 = 1600
      const range = computeRangeUniform(bit, 1600, VIEWPORT_H, total)
      // findIndex(1600) = 79, start = 80 - 8 = 72
      expect(range.startIndex).toBe(72)
      // findIndex(2000) = 99, end = min(100, 100+8) = 100
      expect(range.endIndex).toBe(100)
      expect(range.offsetY).toBe(72 * ROW_H)
    })

    it('handles overscan correctly at boundaries', () => {
      const total = 30
      const bit = new MutablePrefixSum(total)
      bit.init(new Array(total).fill(ROW_H))

      const range = computeRangeUniform(bit, 0, VIEWPORT_H, total)
      // findIndex(0) = -1 (no prefix sum <= 0... wait, query(0)=20 > 0)
      // Actually findIndex(0) returns 0 because target < 0 returns -1, but 0 >= 0
      // Let me check: findIndex(0): pos=0, sum=0, check tree[1]=20, 0+20 <= 0? No. pos=0.
      // Returns 0. start = max(0, 0+1-8) = 0.
      expect(range.startIndex).toBe(0)
      // findIndex(400) = 19, end = min(30, 20+8) = 28
      expect(range.endIndex).toBe(28)
    })

    it('handles empty document', () => {
      const bit = new MutablePrefixSum(0)
      const range = computeRangeUniform(bit, 0, VIEWPORT_H, 0)
      expect(range.startIndex).toBe(0)
      expect(range.endIndex).toBe(0)
      expect(range.offsetY).toBe(0)
      expect(range.totalHeight).toBe(0)
    })

    it('handles single row', () => {
      const bit = new MutablePrefixSum(1)
      bit.init([ROW_H])
      const range = computeRangeUniform(bit, 0, VIEWPORT_H, 1)
      expect(range.startIndex).toBe(0)
      expect(range.endIndex).toBe(1)
      expect(range.offsetY).toBe(0)
    })
  })

  describe('variable-height rows (wrap mode simulation)', () => {
    it('computes correct range with variable heights', () => {
      const total = 50
      const heights = new Array(total).fill(ROW_H)
      // Row 10 is 60px (3x normal), row 25 is 100px (5x normal)
      heights[10] = 60
      heights[25] = 100

      const bit = new MutablePrefixSum(total)
      bit.init(heights)

      // Scroll to row 10's offset: 10 * 20 = 200
      const range = computeRangeUniform(bit, 200, VIEWPORT_H, total)
      // findIndex(200) = 9 (query(9) = 200), start = 10 - 8 = 2
      expect(range.startIndex).toBe(2)
      // offsetY = query(1) = 40 (offset of row 2)
      expect(range.offsetY).toBe(40)
    })

    it('handles height update via BIT set()', () => {
      const total = 100
      const bit = new MutablePrefixSum(total)
      bit.init(new Array(total).fill(ROW_H))

      // Update row 50 from 20 to 80
      bit.set(50, 80)

      // After update, total height should be 100*20 + 60 = 2060
      expect(bit.total()).toBe(2060)

      // Offset of row 51 = query(50) = 50*20 + 60 = 1060
      // Wait, query(50) includes row 50's height: 50*20 + 80 = 1080? No...
      // query(50) = sum of rows 0-50 = 51 rows * 20 + (80-20) = 1020 + 60 = 1080
      // Hmm, let me recalculate: rows 0-49 are 20 each = 1000, row 50 is 80
      // query(50) = 1000 + 80 = 1080
      expect(bit.query(50)).toBe(1080)

      // Scroll to row 50
      const range = computeRangeUniform(bit, 1000, VIEWPORT_H, total)
      // findIndex(1000) = 49 (query(49) = 1000), start = 50 - 8 = 42
      expect(range.startIndex).toBe(42)
    })
  })

  describe('large document performance', () => {
    it('computes range efficiently for 100K rows', () => {
      const total = 100_000
      const bit = new MutablePrefixSum(total)
      bit.init(new Array(total).fill(ROW_H))

      // Simulate scrolling to various positions
      const positions = [0, 100_000, 500_000, 1_000_000, 1_500_000, 1_999_980]

      for (const scrollTop of positions) {
        const range = computeRangeUniform(bit, scrollTop, VIEWPORT_H, total)
        // Basic sanity checks
        expect(range.startIndex).toBeGreaterThanOrEqual(0)
        expect(range.startIndex).toBeLessThan(total)
        expect(range.endIndex).toBeGreaterThan(range.startIndex)
        expect(range.endIndex).toBeLessThanOrEqual(total)
        expect(range.offsetY).toBeGreaterThanOrEqual(0)
      }
    })
  })
})
