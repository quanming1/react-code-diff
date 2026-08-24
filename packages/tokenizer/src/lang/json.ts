/** JSON 词法定义（FR3.4） */
import type { LanguageDef } from '../lexer-engine'

export const jsonLang: LanguageDef = {
  id: 'json',
  start: 'root',
  states: {
    root: [
      { regex: /\s+/, action: 'emit' },
      { regex: /"(?:[^"\\]|\\.)*"/, action: 'emit', tokenType: 'string' },
      { regex: /\b(?:true|false|null)\b/, action: 'emit', tokenType: 'boolean' },
      { regex: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, action: 'emit', tokenType: 'number' },
      { regex: /[{}\[\],:]/, action: 'emit', tokenType: 'punctuation' },
    ],
  },
}
