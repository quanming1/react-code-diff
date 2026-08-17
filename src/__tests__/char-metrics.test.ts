import { describe, it, expect } from 'vitest'
import { isFullWidth, visualWidth, measureCharMetrics } from '../code-diff/char-metrics'
import { MutablePrefixSum } from '../code-diff/prefix-sum'
import { syncHeightsToBit } from '../code-diff/virtual-v2'

// ── isFullWidth：East Asian Wide / Fullwidth 区段边界（C1-FR1）──

describe('isFullWidth', () => {
  it('ASCII / Latin-1 为半角', () => {
    expect(isFullWidth(0x41)).toBe(false) // A
    expect(isFullWidth(0x30)).toBe(false) // 0
    expect(isFullWidth(0x7e)).toBe(false) // ~
  })

  it('CJK 统一表意为全角', () => {
    expect(isFullWidth(0x4e00)).toBe(true) // 一
    expect(isFullWidth(0x9fff)).toBe(true)
  })

  it('区段边界：边界内全角、紧邻区段外半角', () => {
    // CJK 统一表意 [0x4E00, 0x9FFF]
    expect(isFullWidth(0x4dff)).toBe(false)
    expect(isFullWidth(0x4e00)).toBe(true)
    expect(isFullWidth(0x9fff)).toBe(true)
    expect(isFullWidth(0xa000)).toBe(true) // 彝文起点
    // 全角形式 [0xFF00, 0xFF60]
    expect(isFullWidth(0xff00)).toBe(true)
    expect(isFullWidth(0xff60)).toBe(true)
    expect(isFullWidth(0xff61)).toBe(false) // 半角句号
    // 全角符号 [0xFFE0, 0xFFE6]
    expect(isFullWidth(0xffdf)).toBe(false)
    expect(isFullWidth(0xffe0)).toBe(true)
    expect(isFullWidth(0xffe6)).toBe(true)
    expect(isFullWidth(0xffe7)).toBe(false)
  })

  it('谚文音节为全角', () => {
    expect(isFullWidth(0xac00)).toBe(true) // 가
    expect(isFullWidth(0xd7a3)).toBe(true)
  })
})

// ── visualWidth：按 advance 加权的文本渲染宽度（C1-FR1）──

describe('visualWidth', () => {
  const HALF = 7.8
  const FULL = 15.6

  it('空串为 0', () => {
    expect(visualWidth('', HALF, FULL)).toBe(0)
  })

  it('纯 ASCII 按 halfWidth 累加', () => {
    expect(visualWidth('abcd', HALF, FULL)).toBe(4 * HALF)
  })

  it('CJK 按 fullWidth 累加（旧估算按 1 倍宽计是 wrap 级联根因之一）', () => {
    expect(visualWidth('中文字', HALF, FULL)).toBe(3 * FULL)
  })

  it('混合文本按字符类别加权', () => {
    expect(visualWidth('a中b', HALF, FULL)).toBe(2 * HALF + FULL)
  })

  it('tab 推进到下一个 4 半角倍数处', () => {
    // 从 0：tab → 4*half；再 tab → 8*half
    expect(visualWidth('\t', HALF, FULL)).toBe(4 * HALF)
    expect(visualWidth('\t\t', HALF, FULL)).toBe(8 * HALF)
    // 已有 2 半角宽：tab 补齐到 4
    expect(visualWidth('ab\t', HALF, FULL)).toBe(4 * HALF)
  })

  it('emoji 代理对按一个全角码点计（不重复计数）', () => {
    // U+1F600 = 😀，占 2 个 code unit
    expect(visualWidth('\u{1F600}', HALF, FULL)).toBe(FULL)
    expect(visualWidth('a\u{1F600}b', HALF, FULL)).toBe(2 * HALF + FULL)
  })

  it('孤立高代理按半角兜底不越界', () => {
    expect(visualWidth('\uD83D', HALF, FULL)).toBe(HALF)
  })
})

// ── measureCharMetrics：无 canvas 环境回退（C1-FR1）──

describe('measureCharMetrics', () => {
  it('node 环境（无 document）返回 null，调用方回退近似公式', () => {
    expect(measureCharMetrics('monospace', 14, 13)).toBeNull()
  })
})

// ── syncHeightsToBit：实测收敛保护（C1-FR3）──

describe('syncHeightsToBit', () => {
  it('估算数组重建不覆盖已实测行（覆盖回归核心场景）', () => {
    const bit = new MutablePrefixSum(2)
    bit.init([20, 20])
    bit.set(0, 60) // 模拟测量循环已把行 0 收敛为 60
    const measured = new Map<number, number>([[0, 60]])

    // 估算数组重建（值仍为 [20,20]）→ 实测优先，BIT 不回退
    const changed = syncHeightsToBit(bit, [20, 20], measured)

    expect(changed).toBe(false)
    expect(bit.get(0)).toBe(60)
  })

  it('无实测行按估算同步并报告变化', () => {
    const bit = new MutablePrefixSum(2)
    bit.init([20, 20])
    const changed = syncHeightsToBit(bit, [30, 20], new Map())
    expect(changed).toBe(true)
    expect(bit.get(0)).toBe(30)
    expect(bit.get(1)).toBe(20)
  })

  it('估算与 BIT 完全一致时报告无变化（零额外重算）', () => {
    const bit = new MutablePrefixSum(3)
    bit.init([20, 40, 20])
    const changed = syncHeightsToBit(bit, [20, 40, 20], new Map())
    expect(changed).toBe(false)
  })

  it('行数变化时 resize 并报告变化', () => {
    const bit = new MutablePrefixSum(2)
    bit.init([20, 20])
    const changed = syncHeightsToBit(bit, [20, 20, 25], new Map())
    expect(changed).toBe(true)
    expect(bit.size).toBe(3)
    expect(bit.get(2)).toBe(25)
    expect(bit.total()).toBe(65)
  })

  it('实测保留后总高与 BIT 一致', () => {
    const bit = new MutablePrefixSum(2)
    bit.init([20, 20])
    const measured = new Map<number, number>([[0, 60]])
    syncHeightsToBit(bit, [20, 20], measured)
    expect(bit.get(0)).toBe(60)
    expect(bit.total()).toBe(80)
  })
})
