/** Plaintext 词法定义（FR3.4）：无高亮 */
import type { LanguageDef } from '../lexer-engine'

export const plaintextLang: LanguageDef = {
  id: 'plaintext',
  start: 'root',
  states: {
    root: [{ regex: /[^\n]+/, action: 'emit' }],
  },
}
