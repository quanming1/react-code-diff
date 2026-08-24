/** CSS 词法定义（FR3.4） */
import type { LanguageDef } from '../lexer-engine'

export const cssLang: LanguageDef = {
  id: 'css',
  start: 'root',
  states: {
    root: [
      { regex: /\s+/, action: 'emit' },
      { regex: /\/\*/, action: 'push', tokenType: 'comment', nextState: 'comment' },
      { regex: /\/\/[^\n]*/, action: 'emit', tokenType: 'comment' },
      { regex: /@[a-z-]+/, action: 'emit', tokenType: 'macro' },
      { regex: /#[0-9a-fA-F]{3,8}\b/, action: 'emit', tokenType: 'number' },
      { regex: /\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms|deg|fr)?\b/, action: 'emit', tokenType: 'number' },
      { regex: /"[^"]*"|'[^']*'/, action: 'emit', tokenType: 'string' },
      { regex: /[a-zA-Z-]+(?=\s*:)/, action: 'emit', tokenType: 'property' },
      { regex: /[a-zA-Z-]+/, action: 'emit', tokenType: 'variable' },
      { regex: /[{}();:,]/, action: 'emit', tokenType: 'punctuation' },
      { regex: /[>+~*=^$|]+/, action: 'emit', tokenType: 'operator' },
    ],
    comment: [
      { regex: /\*\//, action: 'pop', tokenType: 'comment' },
      { regex: /[^*]+/, action: 'emit', tokenType: 'comment' },
      { regex: /\*/, action: 'emit', tokenType: 'comment' },
    ],
  },
}
