import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { MutablePrefixSum } from './prefix-sum'

/**
 * Virtual scroll V2 — ref + rAF architecture (Monaco-inspired).
 *
 * Key improvements over V1:
 * - scrollTop lives in a ref, NOT in React state → no re-render per scroll pixel
 * - React state only updates when startIndex/endIndex actually change
 * - MutablePrefixSum (BIT) for O(log n) height queries and updates
 * - No full O(n) prefix-sum array rebuild on height changes
 * - bigNumbersDelta: reduces transform values every 500K px (Monaco STEP_SIZE)
 * - Measurement debounce via rAF: max 1 re-render per frame
 *
 * Interface matches V1 (measureRef/measureRef2) for easy swapping.
 */

export interface VirtualScrollV2Result {
  startIndex: number
  endIndex: number
  offsetY: number
  totalHeight: number
  bigNumbersDelta: number
  scrollToIndex: (index: number, align?: 'center' | 'nearest') => void
  measureRef: RefObject<HTMLDivElement | null>
  measureRef2: RefObject<HTMLDivElement | null>
}

interface ScrollRange {
  startIndex: number
  endIndex: number
  offsetY: number
  totalHeight: number
  bigNumbersDelta: number
}

const EMPTY_RANGE: ScrollRange = {
  startIndex: 0,
  endIndex: 0,
  offsetY: 0,
  totalHeight: 0,
  bigNumbersDelta: 0,
}

// Monaco: "IE cannot handle units above ~1,533,908 px, so every 500k bring numbers down"
const STEP_SIZE = 500_000

export function useVirtualScrollV2(opts: {
  scrollRef: RefObject<HTMLDivElement | null>
  rowHeights: number[]
  defaultLineHeight: number
  enabled: boolean
  overscan?: number
}): VirtualScrollV2Result {
  const { scrollRef, rowHeights, defaultLineHeight, enabled } = opts
  const overscan = opts.overscan ?? 8

  // ── Refs: scroll state that does NOT trigger React re-render ──
  const scrollTopRef = useRef(0)
  const viewportHRef = useRef(0)
  const rafRef = useRef(0)
  const measureRafRef = useRef(0)

  // ── MutablePrefixSum: O(log n) prefix sums, O(log n) updates ──
  const bitRef = useRef<MutablePrefixSum | null>(null)
  const totalRef = useRef(rowHeights.length)
  // Track if BIT needs sync (set in render, consumed in useEffect)
  const bitDirtyRef = useRef(true)
  const prevHeightsRef = useRef<number[]>([])

  // Lazy-init BIT on first render only (O(n) but only once)
  if (bitRef.current === null) {
    bitRef.current = new MutablePrefixSum(rowHeights.length)
    bitRef.current.init(rowHeights)
    totalRef.current = rowHeights.length
    prevHeightsRef.current = rowHeights
  }

  // Mark BIT dirty when row count changes (don't resize in render phase!)
  if (totalRef.current !== rowHeights.length) {
    bitDirtyRef.current = true
  }

  // Fallback totalHeight for render phase before BIT syncs
  const fallbackTotalHeight = rowHeights.length * defaultLineHeight

  // ── React state: ONLY the visible range triggers re-render ──
  const [range, setRange] = useState<ScrollRange>(EMPTY_RANGE)

  // ── Refs for DOM measurement ──
  const measureRef = useRef<HTMLDivElement>(null)
  const measureRef2 = useRef<HTMLDivElement>(null)
  const measuredRef = useRef<Map<number, number>>(new Map())

  // ── Compute visible range from scrollTop (O(log n) via BIT) ──
  const computeRange = useCallback((): ScrollRange => {
    const bit = bitRef.current
    if (!bit || !enabled || totalRef.current === 0) {
      return {
        startIndex: 0,
        endIndex: totalRef.current,
        offsetY: 0,
        totalHeight: bit ? bit.total() : fallbackTotalHeight,
        bigNumbersDelta: 0,
      }
    }

    // If BIT is dirty (row count changed), use fallback totalHeight
    const total = totalRef.current
    const totalHeight = bitDirtyRef.current ? fallbackTotalHeight : bit.total()
    const scrollTop = scrollTopRef.current
    const viewportH = viewportHRef.current

    if (viewportH === 0) {
      return { startIndex: 0, endIndex: Math.min(total, 1), offsetY: 0, totalHeight, bigNumbersDelta: 0 }
    }

    // If BIT is dirty, compute range with uniform heights (no BIT queries)
    if (bitDirtyRef.current) {
      const start = Math.max(0, Math.floor(scrollTop / defaultLineHeight) - overscan)
      const endVisible = Math.ceil((scrollTop + viewportH) / defaultLineHeight)
      const end = Math.min(total, endVisible + overscan)
      const offsetY = start * defaultLineHeight
      return { startIndex: start, endIndex: end, offsetY, totalHeight, bigNumbersDelta: 0 }
    }

    // O(log n): find the row at or before scrollTop
    const lastBefore = bit.findIndex(scrollTop)
    let start = Math.max(0, lastBefore + 1)
    start = Math.max(0, start - overscan)

    // O(log n): find the row at or before scrollTop + viewportH
    const bottom = scrollTop + viewportH
    const lastVisible = bit.findIndex(bottom)
    let end = Math.min(total, lastVisible + 1 + overscan)
    if (end <= start) end = Math.min(total, start + 1)

    // offsetY = vertical offset of the first visible row
    const offsetY = start > 0 ? bit.query(start - 1) : 0

    // bigNumbersDelta: reduce transform magnitude for large documents
    let bigNumbersDelta = 0
    if (offsetY >= STEP_SIZE) {
      bigNumbersDelta = Math.floor(offsetY / STEP_SIZE) * STEP_SIZE
      if (defaultLineHeight > 0) {
        bigNumbersDelta = Math.floor(bigNumbersDelta / defaultLineHeight) * defaultLineHeight
      }
    }

    return { startIndex: start, endIndex: end, offsetY, totalHeight, bigNumbersDelta }
  }, [enabled, overscan, defaultLineHeight, fallbackTotalHeight])

  // ── Scroll handler: rAF, NO setState unless range changes ──
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let currentRange: ScrollRange = EMPTY_RANGE

    const onScroll = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        scrollTopRef.current = el.scrollTop

        const newRange = computeRange()
        if (
          newRange.startIndex !== currentRange.startIndex ||
          newRange.endIndex !== currentRange.endIndex
        ) {
          currentRange = newRange
          setRange(newRange)
        }
        // Range unchanged → NO React re-render.
        // Browser native scroll handles the visual movement.
      })
    }

    const measure = () => {
      viewportHRef.current = el.clientHeight
      const newRange = computeRange()
      currentRange = newRange
      setRange(newRange)
    }

    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [scrollRef, computeRange])

  // ── When rowHeights change, sync BIT incrementally (not full init!) ──
  useEffect(() => {
    const bit = bitRef.current
    if (!bit) return

    const prev = prevHeightsRef.current
    const n = rowHeights.length

    // Resize if needed
    if (bit.size !== n) {
      bit.resize(n)
    }

    // Incremental sync: only update entries that actually changed
    let changed = false
    for (let i = 0; i < n; i++) {
      if (prev[i] !== rowHeights[i]) {
        bit.set(i, rowHeights[i])
        changed = true
      }
    }
    prevHeightsRef.current = rowHeights
    totalRef.current = n
    bitDirtyRef.current = false

    // Recompute range after BIT sync
    if (changed || bit.size !== n) {
      const newRange = computeRange()
      setRange(newRange)
    }
  }, [rowHeights, computeRange])

  // ── DOM measurement (for wrap mode variable heights) ──
  // Debounced to rAF: max 1 re-render per frame, no cascade
  // Skip writing to BIT when dirty — range may be a fallback with wrong indices
  useLayoutEffect(() => {
    const container = measureRef.current
    const container2 = measureRef2.current
    if (!container || !enabled || totalRef.current === 0) return
    if (bitDirtyRef.current) return // BIT not synced yet — don't write stale measurements

    const rangeStart = range.startIndex
    const children = container.children
    const children2 = container2?.children
    let changed = false

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      let height = child.offsetHeight

      if (children2 && i < children2.length) {
        const child2 = children2[i] as HTMLElement
        const h2 = child2.offsetHeight
        const maxH = Math.max(height, h2)
        child.style.minHeight = maxH + 'px'
        child2.style.minHeight = maxH + 'px'
        height = maxH
      }

      const rowIndex = rangeStart + i
      if (rowIndex < totalRef.current) {
        const prev = measuredRef.current.get(rowIndex)
        if (prev !== height) {
          measuredRef.current.set(rowIndex, height)
          bitRef.current?.set(rowIndex, height) // O(log n) update
          changed = true
        }
      }
    }

    // Debounce: schedule recompute on next frame, max once per frame
    if (changed && !measureRafRef.current) {
      measureRafRef.current = requestAnimationFrame(() => {
        measureRafRef.current = 0
        const newRange = computeRange()
        setRange((prev) => {
          if (
            prev.startIndex === newRange.startIndex &&
            prev.endIndex === newRange.endIndex &&
            prev.offsetY === newRange.offsetY
          ) {
            return prev
          }
          return newRange
        })
      })
    }
  }, [range.startIndex, range.endIndex, enabled, computeRange])

  // Cleanup measurement rAF on unmount
  useEffect(() => {
    return () => {
      if (measureRafRef.current) cancelAnimationFrame(measureRafRef.current)
    }
  }, [])

  // ── scrollToIndex ──
  // 赋值可能被浏览器钳制为 0：目标 offset 超过当前 scrollHeight 时（如展开折叠段后
  // totalHeight 尚未提交），scrollTop 赋值无效。校验落位结果，未达则下一帧重试。
  const scrollToIndex = useCallback(
    (index: number, align: 'center' | 'nearest' = 'center') => {
      const el = scrollRef.current
      const bit = bitRef.current
      if (!el || !bit) return

      const apply = (attempt: number) => {
        const total = totalRef.current
        const clamped = Math.max(0, Math.min(total - 1, index))

        // If BIT is dirty (row count changed, not yet synced), use fallback uniform heights
        const top = bitDirtyRef.current
          ? clamped * defaultLineHeight
          : (clamped > 0 ? bit.query(clamped - 1) : 0)
        const h = bitDirtyRef.current ? defaultLineHeight : bit.get(clamped)

        let target: number
        if (align === 'center') {
          target = top - el.clientHeight / 2 + h / 2
        } else {
          const viewTop = el.scrollTop
          const viewBottom = viewTop + el.clientHeight
          if (top < viewTop) {
            target = top
          } else if (top + h > viewBottom) {
            target = top + h - el.clientHeight
          } else {
            return // 已可见，无需滚动
          }
        }

        el.scrollTop = Math.max(0, target)
        // 布局未提交导致钳制（目标 > 0 但落位 ≈ 0，或仍差得远）→ 下一帧重试（至多 10 帧）
        const landed = el.scrollTop
        if (
          attempt < 10 &&
          target > 1 &&
          Math.abs(landed - Math.max(0, target)) > 1
        ) {
          requestAnimationFrame(() => apply(attempt + 1))
        }
      }

      apply(0)
    },
    [scrollRef],
  )

  return {
    startIndex: range.startIndex,
    endIndex: range.endIndex,
    offsetY: range.offsetY,
    totalHeight: range.totalHeight,
    bigNumbersDelta: range.bigNumbersDelta,
    scrollToIndex,
    measureRef,
    measureRef2,
  }
}
