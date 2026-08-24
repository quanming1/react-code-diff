/** Python 词法定义（FR3.4） */
import type { LanguageDef } from '../lexer-engine'

export const pythonLang: LanguageDef = {
  id: 'python',
  start: 'root',
  states: {
    root: [
      { regex: /#+[^\n]*/, action: 'emit', tokenType: 'comment' },
      { regex: /\s+/, action: 'emit' },
      { regex: /"""[\s\S]*?"""|'''[\s\S]*?'''/, action: 'emit', tokenType: 'string' },
      { regex: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, action: 'emit', tokenType: 'string' },
      { regex: /f"(?:[^"\\]|\\.)*"|f'(?:[^'\\]|\\.)*'/, action: 'emit', tokenType: 'string' },
      { regex: /\b(?:def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|assert|del|in|is|not|and|or|None|True|False|async|await|match|case)\b/, action: 'emit', tokenType: 'keyword' },
      { regex: /\b(?:int|float|str|bool|list|dict|set|tuple|object|type|super|self|print|len|range|enumerate|zip|map|filter|sum|min|max|abs|sorted|reversed|isinstance|issubclass|hasattr|getattr|setattr)\b/, action: 'emit', tokenType: 'function' },
      { regex: /\b\d+(?:\.\d+)?[jJ]?\b/, action: 'emit', tokenType: 'number' },
      { regex: /@[A-Za-z_][\w]*/, action: 'emit', tokenType: 'macro' },
      { regex: /[A-Za-z_][\w]*(?=\s*\()/, action: 'emit', tokenType: 'function' },
      { regex: /[A-Za-z_][\w]*/, action: 'emit', tokenType: 'variable' },
      { regex: /[=+\-*/%<>!&|^~:]+/, action: 'emit', tokenType: 'operator' },
      { regex: /[{}()[\],.]/, action: 'emit', tokenType: 'punctuation' },
    ],
  },
}
