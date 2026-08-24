/**
 * @cd/tokenizer 主题映射（FR3.5）——token type → CSS class + 颜色。
 *
 * - tokenTypeToClass：token type → `tok-*` class
 * - buildTokenCss：生成 `.tok-*` 颜色规则（light/dark 两套，对齐旧版 refractor 色板）
 * - 消费端可注入自定义 CSS 覆盖（class 名不变）
 */

import type { TokenType } from './lexer-engine'

/** token type → CSS class 名 */
export function tokenTypeToClass(type: TokenType | undefined): string {
  return type ? `tok-${type}` : ''
}

/** light 主题色板（对齐旧版 lightTokens：OneLight） */
export const lightTokenColors: Record<TokenType, string> = {
  keyword: '#a626a4',
  type: '#c18401',
  string: '#50a14f',
  comment: '#a0a1a7',
  number: '#986801',
  regex: '#50a14f',
  function: '#4078f2',
  variable: '#e05654',
  property: '#986801',
  operator: '#383a42',
  punctuation: '#383a42',
  tag: '#e45649',
  'attr-name': '#986801',
  'attr-value': '#50a14f',
  plain: '#383a42',
  template: '#50a14f',
  macro: '#a626a4',
  boolean: '#986801',
  constant: '#986801',
  parameter: '#e05654',
  'class-name': '#c18401',
  important: '#986801',
}

/** dark 主题色板（对齐旧版 darkTokens：GitHub Dark） */
export const darkTokenColors: Record<TokenType, string> = {
  keyword: '#ff7b72',
  type: '#ffa657',
  string: '#a5d6ff',
  comment: '#8b949e',
  number: '#79c0ff',
  regex: '#a5d6ff',
  function: '#d2a8ff',
  variable: '#ffa657',
  property: '#7ee787',
  operator: '#ff7b72',
  punctuation: '#c9d1d9',
  tag: '#7ee787',
  'attr-name': '#79c0ff',
  'attr-value': '#a5d6ff',
  plain: '#c9d1d9',
  template: '#a5d6ff',
  macro: '#d2a8ff',
  boolean: '#79c0ff',
  constant: '#ffa657',
  parameter: '#ffa657',
  'class-name': '#ffa657',
  important: '#a5d6ff',
}

/** 内置 token 色板（兼容旧导出名） */
export const tokenColors: Record<TokenType, string> = lightTokenColors

/**
 * 生成 `.tok-*` 颜色 CSS（light/dark 两套）。
 * 消费端可注入到 <style>，或自行覆盖。
 */
export function buildTokenCss(theme: 'light' | 'dark' = 'light'): string {
  const colors = theme === 'dark' ? darkTokenColors : lightTokenColors
  const sb: string[] = []
  for (const [type, color] of Object.entries(colors) as Array<[TokenType, string]>) {
    sb.push(`.tok-${type}{color:${color}}`)
  }
  return sb.join('\n')
}
