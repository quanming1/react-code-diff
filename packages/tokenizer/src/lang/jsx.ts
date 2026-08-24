/**
 * JSX / TSX 词法定义（FR3.4）。
 * 继承 TypeScript 规则基座，扩展 JSX 标签/组件/属性规则。
 * 简化：JSX 块内文本与表达式嵌套不做完整解析（首版覆盖常见渲染）。
 */

import type { LanguageDef, LexerRule } from '../lexer-engine'
import { typescriptLang } from './typescript'

function extendWithJsx(base: LanguageDef, id: string): LanguageDef {
  const root: LexerRule[] = [
    // JSX 标签（首字母大写 = 组件；小写 = 原生元素）
    { regex: /<\/?[A-Z][A-Za-z0-9.]*(?:\s*\/)?>/, action: 'emit', tokenType: 'tag' },
    { regex: /<\/?[a-z][a-z0-9-]*(?:\s*\/)?>/, action: 'emit', tokenType: 'tag' },
    // JSX 属性
    { regex: /[A-Za-z_$][\w$]*(?==)/, action: 'emit', tokenType: 'attr-name' },
    { regex: /{/, action: 'emit', tokenType: 'punctuation' },
    { regex: /}/, action: 'emit', tokenType: 'punctuation' },
    ...base.states.root,
  ]
  return {
    id,
    start: 'root',
    states: { ...base.states, root },
  }
}

export const jsxLang: LanguageDef = extendWithJsx(typescriptLang, 'jsx')
export const tsxLang: LanguageDef = extendWithJsx(typescriptLang, 'tsx')
