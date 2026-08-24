/**
 * @cd/react token 样式注入——库自包含语法高亮色（消费端零配置）。
 *
 * 挂载时注入 `.tok-*` 颜色 CSS 到 document.head（幂等）；
 * 主题变化时更新对应 style 标签内容。
 */

import { buildTokenCss } from '@cd/tokenizer'

const STYLE_ID = 'cd-token-theme'

/** 注入/更新 token 主题 CSS（按 theme 幂等更新） */
export function ensureTokenCss(theme: 'light' | 'dark'): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  const css = buildTokenCss(theme)
  if (style.textContent !== css) {
    style.textContent = css
  }
}
