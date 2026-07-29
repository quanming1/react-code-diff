import { describe, it, expect } from 'vitest'
import { MutablePrefixSum } from '../code-diff/prefix-sum'

// ============================================================
// MutablePrefixSum — Binary Indexed Tree (Fenwick Tree)
// ============================================================

describe('MutablePrefixSum', () => {
  describe('init + query', () => {
    it('computes prefix sums correctly after init', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])

      expect(ps.query(0)).toBe(10)
      expect(ps.query(1)).toBe(30)
      expect(ps.query(2)).toBe(60)
      expect(ps.query(3)).toBe(100)
      expect(ps.query(4)).toBe(150)
    })

    it('handles single element', () => {
      const ps = new MutablePrefixSum(1)
      ps.init([42])
      expect(ps.query(0)).toBe(42)
      expect(ps.total()).toBe(42)
    })

    it('handles all zeros', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([0, 0, 0, 0, 0])
      expect(ps.query(0)).toBe(0)
      expect(ps.total()).toBe(0)
    })

    it('returns 0 for negative index', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])
      expect(ps.query(-1)).toBe(0)
      expect(ps.query(-100)).toBe(0)
    })

    it('clamps out-of-bounds index to last element', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      expect(ps.query(99)).toBe(60) // clamped to index 2
    })
  })

  describe('total', () => {
    it('returns sum of all elements', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])
      expect(ps.total()).toBe(150)
    })

    it('returns 0 for empty', () => {
      const ps = new MutablePrefixSum(0)
      expect(ps.total()).toBe(0)
    })
  })

  describe('set (replace value)', () => {
    it('replaces a value and updates prefix sums', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])

      ps.set(2, 100) // replace 30 with 100

      expect(ps.query(0)).toBe(10)
      expect(ps.query(1)).toBe(30)
      expect(ps.query(2)).toBe(130) // 10 + 20 + 100
      expect(ps.query(3)).toBe(170)
      expect(ps.query(4)).toBe(220)
      expect(ps.total()).toBe(220)
    })

    it('setting the same value is a no-op', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])

      ps.set(2, 30) // same value
      expect(ps.query(2)).toBe(60)
      expect(ps.total()).toBe(150)
    })

    it('setting to 0 works', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      ps.set(1, 0)
      expect(ps.query(0)).toBe(10)
      expect(ps.query(1)).toBe(10)
      expect(ps.query(2)).toBe(40)
    })

    it('setting first element works', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      ps.set(0, 100)
      expect(ps.query(0)).toBe(100)
      expect(ps.total()).toBe(150)
    })

    it('setting last element works', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      ps.set(2, 100)
      expect(ps.query(2)).toBe(130)
      expect(ps.total()).toBe(130)
    })
  })

  describe('add (delta update)', () => {
    it('adds a delta to an existing value', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])

      ps.add(2, 10) // 30 → 40

      expect(ps.query(2)).toBe(70) // 10 + 20 + 40
      expect(ps.total()).toBe(160)
    })

    it('adding negative delta decreases', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      ps.add(1, -5) // 20 → 15
      expect(ps.query(1)).toBe(25) // 10 + 15
      expect(ps.total()).toBe(55)
    })
  })

  describe('queryRange', () => {
    it('computes sum in a range', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])

      expect(ps.queryRange(0, 2)).toBe(60) // 10+20+30
      expect(ps.queryRange(2, 4)).toBe(120) // 30+40+50
      expect(ps.queryRange(1, 3)).toBe(90) // 20+30+40
      expect(ps.queryRange(0, 4)).toBe(150) // all
      expect(ps.queryRange(2, 2)).toBe(30) // single element
    })

    it('returns 0 for invalid range', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      expect(ps.queryRange(2, 1)).toBe(0) // start > end
    })
  })

  describe('findIndex (BIT binary search)', () => {
    it('finds the index for a given prefix sum target', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])
      // Prefix sums: 10, 30, 60, 100, 150

      expect(ps.findIndex(0)).toBe(0) // before first sum
      expect(ps.findIndex(5)).toBe(0) // before first sum (5 < 10)
      expect(ps.findIndex(10)).toBe(0) // exactly at first sum
      expect(ps.findIndex(15)).toBe(0) // between 10 and 30
      expect(ps.findIndex(29)).toBe(0) // still between 10 and 30
      expect(ps.findIndex(30)).toBe(1) // exactly at second sum
      expect(ps.findIndex(35)).toBe(1) // between 30 and 60
      expect(ps.findIndex(59)).toBe(1) // still between 30 and 60
      expect(ps.findIndex(60)).toBe(2) // exactly at third sum
      expect(ps.findIndex(100)).toBe(3)
      expect(ps.findIndex(150)).toBe(4) // exactly at total
      expect(ps.findIndex(999)).toBe(4) // beyond total → last index
    })

    it('returns -1 for negative target', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      expect(ps.findIndex(-1)).toBe(-1)
    })

    it('handles large arrays efficiently', () => {
      const size = 100_000
      const ps = new MutablePrefixSum(size)
      const values = new Array(size).fill(20) // all 20px
      ps.init(values)

      // findIndex returns the largest index where prefix sum <= target
      // query(49) = 50 * 20 = 1000, so findIndex(1000) = 49
      expect(ps.findIndex(1000)).toBe(49)
      // query(99_998) = 99_999 * 20 = 1_999_980, so findIndex(1_999_980) = 99_998
      expect(ps.findIndex(1_999_980)).toBe(99_998)
      // Beyond total → last index
      expect(ps.findIndex(2_000_000)).toBe(99_999)
    })

    it('handles single element', () => {
      const ps = new MutablePrefixSum(1)
      ps.init([42])
      expect(ps.findIndex(0)).toBe(0)
      expect(ps.findIndex(42)).toBe(0)
      expect(ps.findIndex(100)).toBe(0)
    })
  })

  describe('get (raw value)', () => {
    it('returns the raw value at an index', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      expect(ps.get(0)).toBe(10)
      expect(ps.get(1)).toBe(20)
      expect(ps.get(2)).toBe(30)
    })

    it('returns 0 for out of bounds', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      expect(ps.get(-1)).toBe(0)
      expect(ps.get(99)).toBe(0)
    })

    it('reflects updates after set', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      ps.set(1, 50)
      expect(ps.get(1)).toBe(50)
    })
  })

  describe('resize', () => {
    it('preserves existing values on resize', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      ps.resize(5)
      expect(ps.get(0)).toBe(10)
      expect(ps.get(1)).toBe(20)
      expect(ps.get(2)).toBe(30)
      expect(ps.get(3)).toBe(0) // new, zero-filled
      expect(ps.get(4)).toBe(0)
      expect(ps.total()).toBe(60)
    })

    it('shrinking truncates', () => {
      const ps = new MutablePrefixSum(5)
      ps.init([10, 20, 30, 40, 50])
      ps.resize(3)
      expect(ps.get(0)).toBe(10)
      expect(ps.get(1)).toBe(20)
      expect(ps.get(2)).toBe(30)
      expect(ps.total()).toBe(60)
    })
  })

  describe('clear', () => {
    it('sets all values to zero', () => {
      const ps = new MutablePrefixSum(3)
      ps.init([10, 20, 30])
      ps.clear()
      expect(ps.query(0)).toBe(0)
      expect(ps.query(2)).toBe(0)
      expect(ps.total()).toBe(0)
    })
  })
})
