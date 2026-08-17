/**
 * char-metrics — 精确字符宽度度量（C1）。
 *
 * wrap 模式行高由折行数决定，折行数 ≈ ceil(文本渲染宽 / 可用宽)。
 * 旧估算用 `(size+1)*0.6` 近似等宽 advance、CJK 按 1 倍宽计，与真实渲染
 * 偏差大，导致 virtual-v2 的「估算→实测」级联重渲染（wrap 首滚卡顿根因）。
 *
 * 这里用 canvas measureText 以真实字体/字号实测：
 * - halfWidth：ASCII 半角 advance（等宽字体下所有 ASCII 同宽）
 * - fullWidth：CJK/全角 advance
 * - gutterCharWidth：行号槽字号（--cd-font-size，无 +1）下 '0' 的 advance，
 *   对齐 CSS 的 ch 单位
 *
 * 无 canvas 环境（SSR / node 测试）返回 null，调用方回退旧近似公式。
 */

export interface CharMetrics {
  /** ASCII 半角 advance（px，code 字号下） */
  halfWidth: number
  /** CJK/全角 advance（px，code 字号下） */
  fullWidth: number
  /** 行号槽 '0' advance（px，gutter 字号下） */
  gutterCharWidth: number
}

/** East Asian Wide / Fullwidth 判定（UAX #11 的 W/F 区段，纯函数可单测） */
export function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo 初声
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首 / 注音 / 假名补充（不含 0x303f）
    (code >= 0x3041 && code <= 0x33ff) || // 假名 / CJK 注点 / 互补
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意
    (code >= 0xa000 && code <= 0xa4cf) || // 彝文
    (code >= 0xa960 && code <= 0xa97f) || // Hangul Jamo Extended-A
    (code >= 0xac00 && code <= 0xd7a3) || // 谚文音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xfe10 && code <= 0xfe19) || // 竖排形式
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK 兼容形式 / 小形式变体
    (code >= 0xff00 && code <= 0xff60) || // 全角形式
    (code >= 0xffe0 && code <= 0xffe6) || // 全角符号
    (code >= 0x1f300 && code <= 0x1f64f) || // emoji 杂项符号（近似全角）
    (code >= 0x1f900 && code <= 0x1f9ff) || // emoji 补充
    (code >= 0x20000 && code <= 0x3fffd) // CJK 扩展 B+
  )
}

/**
 * 文本渲染宽度（px）。按 code point 迭代（代理对合并），全角按 fullWidth、
 * 其余按 halfWidth 加权；tab 推进到下一个 tabSize 半角倍数处（与现有估算的
 * 4 半角约定一致；CSS 未设 tab-size 时浏览器默认 8，本库沿用 4 近似）。
 */
export function visualWidth(
  s: string,
  halfWidth: number,
  fullWidth: number,
  tabSize = 4,
): number {
  const tabStep = halfWidth * tabSize
  let w = 0
  let i = 0
  const n = s.length
  while (i < n) {
    const cu = s.charCodeAt(i)
    if (cu === 9) {
      w = (Math.floor(w / tabStep) + 1) * tabStep
      i++
      continue
    }
    let cp = cu
    i++
    if (cu >= 0xd800 && cu <= 0xdbff && i < n) {
      const lo = s.charCodeAt(i)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = (cu - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000
        i++
      }
    }
    w += isFullWidth(cp) ? fullWidth : halfWidth
  }
  return w
}

let cachedCtx: CanvasRenderingContext2D | null | undefined
function getCtx(): CanvasRenderingContext2D | null {
  if (cachedCtx !== undefined) return cachedCtx
  try {
    cachedCtx = document.createElement('canvas').getContext('2d')
  } catch {
    cachedCtx = null
  }
  return cachedCtx
}

const metricsCache = new Map<string, CharMetrics | null>()

/**
 * 以真实字体栈 + 字号实测字符 advance。
 * codeFontSize：.cd-code 实际字号（config.font.size + 1，CSS calc(+1px)）。
 * gutterFontSize：行号槽字号（config.font.size）。
 * 结果按 `${family}|${codeSize}|${gutterSize}` 缓存（同配置只测一次）。
 */
export function measureCharMetrics(
  fontFamily: string,
  codeFontSize: number,
  gutterFontSize: number,
): CharMetrics | null {
  const key = `${fontFamily}|${codeFontSize}|${gutterFontSize}`
  if (metricsCache.has(key)) return metricsCache.get(key)!

  const ctx = getCtx()
  let result: CharMetrics | null = null
  if (ctx) {
    ctx.font = `${codeFontSize}px ${fontFamily}`
    const half = ctx.measureText('0').width
    const full = ctx.measureText('\u4e2d').width // 「中」
    ctx.font = `${gutterFontSize}px ${fontFamily}`
    const gutter = ctx.measureText('0').width
    if (half > 0) {
      result = {
        halfWidth: half,
        fullWidth: full > 0 ? full : half * 2,
        gutterCharWidth: gutter > 0 ? gutter : half,
      }
    }
  }
  metricsCache.set(key, result)
  return result
}
