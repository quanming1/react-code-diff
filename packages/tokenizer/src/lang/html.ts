/** HTML 词法定义（FR3.4）：标签/属性/注释；内嵌 JS/CSS 不展开（简化） */
import type { LanguageDef } from '../lexer-engine'

export const htmlLang: LanguageDef = {
  id: 'html',
  start: 'root',
  states: {
    root: [
      { regex: /<!--/, action: 'push', tokenType: 'comment', nextState: 'comment' },
      { regex: /<!DOCTYPE[^>]*>/i, action: 'emit', tokenType: 'macro' },
      { regex: /<\/?[a-zA-Z][a-zA-Z0-9-]*/, action: 'emit', tokenType: 'tag' },
      { regex: /\/?>/, action: 'emit', tokenType: 'tag' },
      { regex: /\s+/, action: 'emit' },
      { regex: /[a-zA-Z-]+(?==)/, action: 'emit', tokenType: 'attr-name' },
      { regex: /"[^"]*"|'[^']*'/, action: 'emit', tokenType: 'attr-value' },
      { regex: /[=]/, action: 'emit', tokenType: 'operator' },
      { regex: /&[a-zA-Z#0-9]+;/, action: 'emit', tokenType: 'constant' },
      { regex: /[^<]+/, action: 'emit' },
      { regex: /</, action: 'emit', tokenType: 'punctuation' },
    ],
    comment: [
      { regex: /-->/, action: 'pop', tokenType: 'comment' },
      { regex: /[^-]+/, action: 'emit', tokenType: 'comment' },
      { regex: /-/, action: 'emit', tokenType: 'comment' },
    ],
  },
}
