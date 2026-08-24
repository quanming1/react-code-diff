/**
 * @cd/tokenizer 主题映射（FR3.5）——token type → CSS class。
 * 沿用现有 OneLight/Dark 色板语义（class 前缀 tok-，CSS 在消费端定义）。
 */

import type { TokenType } from './lexer-engine'

/** token type → CSS class 名 */
export function tokenTypeToClass(type: TokenType | undefined): string {
  return type ? `tok-${type}` : ''
}

/** 内置 token 色板（供 demo/测试快速使用；消费端可用自定义 CSS 覆盖） */
export const tokenColors: Record<TokenType, string> = {
  keyword: '#c678dd',
  type: '#e5c07b',
  string: '#98c379',
  comment: '#7f848e',
  number: '#d19a66',
  regex: '#d19a66',
  function: '#61afef',
  variable: '#abb2bf',
  property: '#e06c75',
  operator: '#56b6c2',
  punctuation: '#abb2bf',
  tag: '#e06c75',
  'attr-name': '#d19a66',
  'attr-value': '#98c379',
  plain: '#abb2bf',
  template: '#98c379',
  macro: '#c678dd',
  boolean: '#d19a66',
  constant: '#d19a66',
  parameter: '#abb2bf',
  'class-name': '#e5c07b',
  important: '#e06c75',
}
