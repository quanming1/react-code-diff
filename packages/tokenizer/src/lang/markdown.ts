/** Markdown 词法定义（FR3.4）：标题/强调/代码/链接（简化，行内状态） */
import type { LanguageDef } from '../lexer-engine'

export const markdownLang: LanguageDef = {
  id: 'markdown',
  start: 'root',
  states: {
    root: [
      { regex: /^#{1,6}\s+[^\n]*/, action: 'emit', tokenType: 'important' },
      { regex: /^\s*```[^\n]*/, action: 'emit', tokenType: 'macro' },
      { regex: /^\s*~~~[^\n]*/, action: 'emit', tokenType: 'macro' },
      { regex: /^\s*[-*+]\s+/, action: 'emit', tokenType: 'operator' },
      { regex: /^\s*\d+\.\s+/, action: 'emit', tokenType: 'number' },
      { regex: /^\s*>+/, action: 'emit', tokenType: 'operator' },
      { regex: /\[[^\]]*\]\([^)]*\)/, action: 'emit', tokenType: 'string' },
      { regex: /!\[[^\]]*\]\([^)]*\)/, action: 'emit', tokenType: 'string' },
      { regex: /`[^`]*`/, action: 'emit', tokenType: 'macro' },
      { regex: /\*\*[^*]+\*\*|__[^_]+__/, action: 'emit', tokenType: 'important' },
      { regex: /\*[^*]+\*|_[^_]+_/, action: 'emit', tokenType: 'variable' },
      { regex: /~~[^~]+~~/, action: 'emit', tokenType: 'comment' },
      { regex: /[^\n]+/, action: 'emit' },
    ],
  },
}
