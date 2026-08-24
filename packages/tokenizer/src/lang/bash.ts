/** Bash 词法定义（FR3.4） */
import type { LanguageDef } from '../lexer-engine'

export const bashLang: LanguageDef = {
  id: 'bash',
  start: 'root',
  states: {
    root: [
      { regex: /^\s*#![^\n]*/, action: 'emit', tokenType: 'macro' },
      { regex: /#+[^\n]*/, action: 'emit', tokenType: 'comment' },
      { regex: /\s+/, action: 'emit' },
      { regex: /"(?:[^"\\]|\\.)*"/, action: 'emit', tokenType: 'string' },
      { regex: /'(?:[^'\\]|\\.)*'/, action: 'emit', tokenType: 'string' },
      { regex: /`[^`]*`/, action: 'emit', tokenType: 'string' },
      { regex: /\$(?:[A-Za-z_][\w]*|\{[^}]*\}|\(\([^)]*\)\)|\([^)]*\))/, action: 'emit', tokenType: 'variable' },
      { regex: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|select|until|time|coproc)\b/, action: 'emit', tokenType: 'keyword' },
      { regex: /\b(?:echo|cd|ls|rm|mv|cp|mkdir|cat|grep|sed|awk|export|source|alias|sudo|chmod|chown|curl|wget|git|npm|pnpm|yarn|node|python|python3|pip|pip3|docker|kubectl)\b/, action: 'emit', tokenType: 'function' },
      { regex: /-{1,2}[a-zA-Z-]+/, action: 'emit', tokenType: 'constant' },
      { regex: /\b\d+\b/, action: 'emit', tokenType: 'number' },
      { regex: /[|&;<>()]/, action: 'emit', tokenType: 'operator' },
      { regex: /[^\s]+/, action: 'emit' },
    ],
  },
}
