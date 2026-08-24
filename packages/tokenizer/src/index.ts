/**
 * @cd/tokenizer —— 全自研词法引擎（零运行时依赖）。
 *
 * - lexer-engine：规则驱动状态机（emit/push/pop + 状态栈 + 跨行）
 * - lang：12 语言定义（ts/js/jsx/tsx/json/css/html/markdown/bash/python/yaml/plaintext）
 * - token-cache：行级缓存 + 编辑增量失效（重放最近快照）
 * - theme：token type → CSS class
 *
 * 依赖方向铁律：tokenizer 仅依赖 @cd/core（scripts/check-deps.mjs 强制）。
 */

export { tokenizeLine, mergeTokens } from './lexer-engine'
export type { LanguageDef, LexerRule, FlatToken, TokenType, TokenizeLineResult } from './lexer-engine'
export { TokenCache } from './token-cache'
export { tokenTypeToClass, tokenColors, lightTokenColors, darkTokenColors, buildTokenCss } from './theme'
export { registerLanguage, getLanguage, hasLanguage, listLanguages } from './lang'
