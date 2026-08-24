/**
 * TypeScript / JavaScript 词法定义（FR3.4）。
 * 共享规则基座；tsx/jsx 在 jsx.ts 扩展。
 */

import type { LanguageDef, LexerRule } from '../lexer-engine'

// ── 通用规则（多个状态复用）──

/** 行注释 */
const lineComment: LexerRule = {
  regex: /\/\/[^\n]*/,
  action: 'emit',
  tokenType: 'comment',
}

/** 块注释开始 → 进入 comment-block 状态 */
const blockCommentStart: LexerRule = {
  regex: /\/\*/,
  action: 'push',
  tokenType: 'comment',
  nextState: 'comment-block',
}

/** 空白 */
const whitespace: LexerRule = { regex: /\s+/, action: 'emit' }

/** 数字 */
const number: LexerRule = {
  regex: /\b(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/,
  action: 'emit',
  tokenType: 'number',
}

/** 关键字 */
const keyword: LexerRule = {
  regex: /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|delete|typeof|instanceof|in|of|class|extends|super|this|import|from|export|default|async|await|yield|try|catch|finally|throw|interface|type|enum|namespace|module|declare|public|private|protected|readonly|static|abstract|implements|as|satisfies|keyof|infer|is|never|unknown|any|void|undefined|null|true|false|get|set|with|debugger|using|await)\b/,
  action: 'emit',
  tokenType: 'keyword',
}

/** 类型关键字（TS 类型位置） */
const typeKeyword: LexerRule = {
  regex: /\b(?:string|number|boolean|object|symbol|bigint|Record|Partial|Required|Readonly|Pick|Omit|Exclude|Extract|NonNullable|ReturnType|Parameters|Promise|Array|Map|Set|WeakMap|WeakSet)\b/,
  action: 'emit',
  tokenType: 'type',
}

/** 布尔字面量 */
const boolean: LexerRule = {
  regex: /\b(?:true|false)\b/,
  action: 'emit',
  tokenType: 'boolean',
}

/** 字符串（单双引号，可转义）→ 进入 string 状态跨行 */
const stringStart: LexerRule = {
  regex: /["']/,
  action: 'push',
  tokenType: 'string',
  nextState: 'string',
}

/** 模板串开始 → 进入 template 状态（支持 ${} 嵌套后续可扩展） */
const templateStart: LexerRule = {
  regex: /`/,
  action: 'push',
  tokenType: 'template',
  nextState: 'template',
}

/** 正则字面量开始（启发式：前一个非空 token 不是标识符/数字/右括号） */
const regexStart: LexerRule = {
  regex: /\/(?![/*])/,
  action: 'push',
  tokenType: 'regex',
  nextState: 'regex',
}

/** 函数名（标识符后跟 ( ） */
const functionName: LexerRule = {
  regex: /\b([A-Za-z_$][\w$]*)(?=\s*\()/,
  action: 'emit',
  tokenType: 'function',
}

/** 标识符 */
const identifier: LexerRule = {
  regex: /[A-Za-z_$][\w$]*/,
  action: 'emit',
  tokenType: 'variable',
}

/** 属性访问（.name → property） */
const propertyAccess: LexerRule = {
  regex: /\.([A-Za-z_$][\w$]*)/,
  action: 'emit',
  tokenType: 'property',
}

/** 运算符 */
const operator: LexerRule = {
  regex: /(?:=>|->|\+\+|--|&&|\|\||\?\?|\?\.|===|!==|==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|&&=|\|\|=|\?\?=|\*\*|\*\*=|\?\s*:|[-+*/%<>&|^!~?:=]+)/,
  action: 'emit',
  tokenType: 'operator',
}

/** 标点 */
const punctuation: LexerRule = {
  regex: /[{}()[\].,;]/,
  action: 'emit',
  tokenType: 'punctuation',
}

// ── 子状态规则 ──

/** 字符串内部（跨行，直到未转义引号） */
const stringState: LexerRule[] = [
  { regex: /\\(?:[\\'"bfnrtv]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n)/, action: 'emit', tokenType: 'string' },
  { regex: /["']/, action: 'pop', tokenType: 'string' },
  { regex: /[^"']+/, action: 'emit', tokenType: 'string' },
]

/** 块注释内部（跨行，直到星号斜杠结束） */
const commentBlockState: LexerRule[] = [
  { regex: /\*\//, action: 'pop', tokenType: 'comment' },
  { regex: /[^*]+/, action: 'emit', tokenType: 'comment' },
  { regex: /\*/ , action: 'emit', tokenType: 'comment' },
]

/** 模板串内部（跨行，${ 进入嵌套可后续扩展为简单处理） */
const templateState: LexerRule[] = [
  { regex: /`/, action: 'pop', tokenType: 'template' },
  { regex: /\$\{/, action: 'emit', tokenType: 'operator' },
  { regex: /[^`$]+/, action: 'emit', tokenType: 'template' },
  { regex: /\$/, action: 'emit', tokenType: 'template' },
]

/** 正则内部（跨行，直到未转义 /） */
const regexState: LexerRule[] = [
  { regex: /\\(?:\\|\/|[^\n])/, action: 'emit', tokenType: 'regex' },
  { regex: /\/(?:[gimsuy]+)?/, action: 'pop', tokenType: 'regex' },
  { regex: /\[(?:[^\]\\]|\\.)*\]/, action: 'emit', tokenType: 'regex' },
  { regex: /[^/\\\[]+/, action: 'emit', tokenType: 'regex' },
]

// ── 组装 ──

export const typescriptLang: LanguageDef = {
  id: 'typescript',
  start: 'root',
  states: {
    root: [
      lineComment,
      blockCommentStart,
      whitespace,
      number,
      keyword,
      typeKeyword,
      boolean,
      stringStart,
      templateStart,
      regexStart,
      functionName,
      propertyAccess,
      identifier,
      operator,
      punctuation,
    ],
    'string': stringState,
    'comment-block': commentBlockState,
    'template': templateState,
    'regex': regexState,
  },
}

export const javascriptLang: LanguageDef = {
  id: 'javascript',
  start: 'root',
  states: {
    root: [
      lineComment,
      blockCommentStart,
      whitespace,
      number,
      keyword,
      boolean,
      stringStart,
      templateStart,
      regexStart,
      functionName,
      propertyAccess,
      identifier,
      operator,
      punctuation,
    ],
    'string': stringState,
    'comment-block': commentBlockState,
    'template': templateState,
    'regex': regexState,
  },
}
