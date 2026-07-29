import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface VirtualScrollResult {
  startIndex: number
  endIndex: number
  offsetY: number
  totalHeight: number
  bigNumbersDelta: number
  scrollToIndex: (index: number, align?: 'center' | 'nearest') => void
  measureRef: RefObject<HTMLDivElement | null>
  measureRef2: RefObject<HTMLDivElement | null>
}

export function useVirtualScroll(opts: {
  scrollRef: RefObject<HTMLDivElement | null>
  rowHeights: number[]
  enabled: boolean
  overscan?: number
}): VirtualScrollResult {
  const { scrollRef, rowHeights, enabled } = opts
  const overscan = opts.overscan ?? 8
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)

  const measureRef = useRef<HTMLDivElement>(null)
  const measureRef2 = useRef<HTMLDivElement>(null)
  const measuredRef = useRef<Map<number, number>>(new Map())
  const [measureVersion, setMeasureVersion] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setScrollTop(el.scrollTop)
      })
    }
    const measure = () => setViewportH(el.clientHeight)
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [scrollRef])

  const total = rowHeights.length

  const prevTotalRef = useRef(0)
  useEffect(() => {
    if (prevTotalRef.current !== total) {
      measuredRef.current.clear()
      setMeasureVersion(v => v + 1)
      prevTotalRef.current = total
    }
  }, [total])

  const effectiveHeights = useMemo(() => {
    void measureVersion
    if (measuredRef.current.size === 0) return rowHeights
    return rowHeights.map((h, i) => measuredRef.current.get(i) ?? h)
  }, [rowHeights, measureVersion])

  const offsets = useMemo(() => {
    const arr: number[] = new Array(total + 1)
    let acc = 0
    for (let i = 0; i < total; i++) {
      arr[i] = acc
      acc += effectiveHeights[i] ?? 0
    }
    arr[total] = acc
    return arr
  }, [effectiveHeights, total])

  const range = useMemo(() => {
    if (!enabled || total === 0) {
      return { startIndex: 0, endIndex: total, offsetY: 0, totalHeight: offsets[total] }
    }
    const totalHeight = offsets[total]
    if (viewportH === 0) {
      return { startIndex: 0, endIndex: Math.min(total, 1), offsetY: 0, totalHeight }
    }
    let lo = 0, hi = total
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (offsets[mid] < scrollTop) lo = mid + 1
      else hi = mid
    }
    let start = Math.max(0, lo - 1)
    start = Math.max(0, start - overscan)
    const bottom = scrollTop + viewportH
    lo = start; hi = total
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (offsets[mid] < bottom) lo = mid + 1
      else hi = mid
    }
    let end = Math.min(total, lo + overscan)
    if (end <= start) end = Math.min(total, start + 1)
    return { startIndex: start, endIndex: end, offsetY: offsets[start], totalHeight }
  }, [enabled, total, offsets, scrollTop, viewportH, overscan])

  useLayoutEffect(() => {
    const container = measureRef.current
    const container2 = measureRef2.current
    if (!container || !enabled || total === 0) return

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

      const rowIndex = range.startIndex + i
      if (rowIndex < total) {
        const prev = measuredRef.current.get(rowIndex)
        if (prev !== height) {
          measuredRef.current.set(rowIndex, height)
          changed = true
        }
      }
    }

    if (changed) {
      setMeasureVersion(v => v + 1)
    }
  }, [range.startIndex, range.endIndex, enabled, total])

  const scrollToIndex = useCallback(
    (index: number, align: 'center' | 'nearest' = 'center') => {
      const el = scrollRef.current
      if (!el) return
      const clamped = Math.max(0, Math.min(total - 1, index))
      const top = offsets[clamped] ?? 0
      const h = effectiveHeights[clamped] ?? rowHeights[clamped] ?? 0
      if (align === 'center') {
        el.scrollTop = top - el.clientHeight / 2 + h / 2
      } else {
        const viewTop = el.scrollTop
        const viewBottom = viewTop + el.clientHeight
        if (top < viewTop) {
          el.scrollTop = top
        } else if (top + h > viewBottom) {
          el.scrollTop = top + h - el.clientHeight
        }
      }
    },
    [scrollRef, offsets, effectiveHeights, rowHeights, total],
  )

  return { ...range, bigNumbersDelta: 0, scrollToIndex, measureRef, measureRef2 }
}
