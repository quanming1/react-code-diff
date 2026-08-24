/** YAML 词法定义（FR3.4） */
import type { LanguageDef } from '../lexer-engine'

export const yamlLang: LanguageDef = {
  id: 'yaml',
  start: 'root',
  states: {
    root: [
      { regex: /#+[^\n]*/, action: 'emit', tokenType: 'comment' },
      { regex: /\s+/, action: 'emit' },
      { regex: /^---\s*$/, action: 'emit', tokenType: 'macro' },
      { regex: /^\.\.\.\s*$/, action: 'emit', tokenType: 'macro' },
      { regex: /[A-Za-z_][\w.-]*(?=\s*:)/, action: 'emit', tokenType: 'property' },
      { regex: /[|>][+-]?/, action: 'emit', tokenType: 'operator' },
      { regex: /["][^"]*["]|['][^']*[']/, action: 'emit', tokenType: 'string' },
      { regex: /\b(?:true|false|null|yes|no|on|off)\b/i, action: 'emit', tokenType: 'boolean' },
      { regex: /-?\b\d+(?:\.\d+)?\b/, action: 'emit', tokenType: 'number' },
      { regex: /[&*][A-Za-z_][\w-]*/, action: 'emit', tokenType: 'constant' },
      { regex: /[?:,-]/, action: 'emit', tokenType: 'punctuation' },
      { regex: /[^\n]+/, action: 'emit' },
    ],
  },
}
