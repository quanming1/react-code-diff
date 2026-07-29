/**
 * Performance benchmark: V1 (dense array + binary search) vs V2 (BIT + rAF).
 *
 * Measures three critical operations:
 * 1. Initialize prefix sums (O(n) for both, but V2 uses Float64Array)
 * 2. Query: findIndex(scrollTop) — V1: binary search on array, V2: BIT search
 * 3. Update: change one row's height — V1: O(n) rebuild, V2: O(log n) BIT set
 *
 * Run: npx tsx src/__tests__/benchmark.ts
 */

import { describe, it, expect } from 'vitest'
import { MutablePrefixSum } from '../code-diff/prefix-sum'

function fmt(n: number): string {
  if (n < 1) return `${(n * 1000).toFixed(1)}μs`
  if (n < 1000) return `${n.toFixed(2)}ms`
  return `${(n / 1000).toFixed(2)}s`
}

function bench(label: string, fn: () => void, iterations: number = 1000): number {
  // Warmup
  for (let i = 0; i < 10; i++) fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const total = performance.now() - start
  const perOp = total / iterations
  console.log(`  ${label}: ${fmt(perOp)}/op (${iterations} iterations)`)
  return perOp
}

// ── V1: Dense array + binary search + full rebuild on update ──

class V1PrefixSum {
  offsets: number[]
  heights: number[]

  constructor(heights: number[]) {
    this.heights = heights
    this.offsets = new Array(heights.length + 1)
    this.rebuild()
  }

  rebuild() {
    let acc = 0
    for (let i = 0; i < this.heights.length; i++) {
      this.offsets[i] = acc
      acc += this.heights[i]
    }
    this.offsets[this.heights.length] = acc
  }

  findIndex(scrollTop: number): number {
    let lo = 0, hi = this.offsets.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.offsets[mid] < scrollTop) lo = mid + 1
      else hi = mid
    }
    return Math.max(0, lo - 1)
  }

  set(index: number, value: number) {
    this.heights[index] = value
    this.rebuild() // O(n) — the V1 bottleneck
  }

  query(index: number): number {
    return this.offsets[index]
  }
}

// ── Benchmark runner ──

function runBenchmark(size: number) {
  console.log(`\n=== ${size.toLocaleString()} rows ===`)
  const heights = new Array(size).fill(20)

  // Add some variable heights (5% of rows)
  for (let i = 0; i < size; i += 20) {
    heights[i] = 40 + Math.floor(Math.random() * 60)
  }

  // 1. Initialize
  console.log('  --- Initialize ---')
  const v1InitTime = bench('V1 init (array)', () => {
    new V1PrefixSum(heights)
  }, 100)
  const v2InitTime = bench('V2 init (BIT)', () => {
    const bit = new MutablePrefixSum(size)
    bit.init(heights)
  }, 100)

  // Create instances for query/update benchmarks
  const v1 = new V1PrefixSum(heights)
  const v2 = new MutablePrefixSum(size)
  v2.init(heights)

  // 2. Query: findIndex (simulates scroll)
  const scrollPositions = Array.from({ length: 200 }, () =>
    Math.floor(Math.random() * (size * 20)),
  )

  console.log('  --- Query (findIndex for scroll) ---')
  const v1QueryTime = bench('V1 findIndex (binary search)', () => {
    for (const pos of scrollPositions) {
      v1.findIndex(pos)
    }
  }, 500)
  const v2QueryTime = bench('V2 findIndex (BIT search)', () => {
    for (const pos of scrollPositions) {
      v2.findIndex(pos)
    }
  }, 500)

  // 3. Update: change one row's height
  console.log('  --- Update (change one row height) ---')
  const v1UpdateTime = bench('V1 set + rebuild O(n)', () => {
    v1.set(Math.floor(Math.random() * size), 60)
  }, 100)
  const v2UpdateTime = bench('V2 set O(log n)', () => {
    v2.set(Math.floor(Math.random() * size), 60)
  }, 1000)

  // Summary
  console.log('  --- Summary ---')
  console.log(`  Init:     V1 ${fmt(v1InitTime)} → V2 ${fmt(v2InitTime)} (${(v1InitTime / v2InitTime).toFixed(1)}x)`)
  console.log(`  Query:    V1 ${fmt(v1QueryTime)} → V2 ${fmt(v2QueryTime)} (${(v1QueryTime / v2QueryTime).toFixed(1)}x)`)
  console.log(`  Update:   V1 ${fmt(v1UpdateTime)} → V2 ${fmt(v2UpdateTime)} (${(v1UpdateTime / v2UpdateTime).toFixed(1)}x)`)
}

describe('Performance benchmark', () => {
  it('V1 vs V2 comparison', () => {

runBenchmark(10_000)
runBenchmark(50_000)
runBenchmark(100_000)

console.log('\n✅ Benchmark complete.')
console.log('\nKey takeaways:')
console.log('  - V2 update is O(log n) vs V1 O(n) — the bigger the document, the bigger the speedup')
console.log('  - V2 query uses BIT binary search (no array allocation)')
console.log('  - V2 scroll path: NO React re-render per pixel (not measurable here, but architecturally eliminates the main bottleneck)')

// Verify V2 is faster than V1 for updates on large documents
const largeHeights = new Array(100_000).fill(20)
const v1Large = new V1PrefixSum(largeHeights)
const v2Large = new MutablePrefixSum(100_000)
v2Large.init(largeHeights)

const v1UpdateMs = bench('V1 update 100K', () => v1Large.set(50000, 60), 50)
const v2UpdateMs = bench('V2 update 100K', () => v2Large.set(50000, 60), 1000)

expect(v2UpdateMs).toBeLessThan(v1UpdateMs)
  })
})
