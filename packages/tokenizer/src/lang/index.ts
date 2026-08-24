/**
 * 语言注册表（FR3.4）——可扩展，别名解析。
 */

import type { LanguageDef } from '../lexer-engine'
import { typescriptLang, javascriptLang } from './typescript'
import { jsxLang, tsxLang } from './jsx'
import { jsonLang } from './json'
import { cssLang } from './css'
import { htmlLang } from './html'
import { markdownLang } from './markdown'
import { bashLang } from './bash'
import { pythonLang } from './python'
import { yamlLang } from './yaml'
import { plaintextLang } from './plaintext'

const registry = new Map<string, LanguageDef>()
const aliases = new Map<string, string>()

export function registerLanguage(lang: LanguageDef, aliasList: string[] = []): void {
  registry.set(lang.id, lang)
  for (const alias of aliasList) {
    aliases.set(alias.toLowerCase(), lang.id)
  }
}

export function getLanguage(idOrAlias: string): LanguageDef | null {
  const key = idOrAlias.toLowerCase()
  const id = aliases.get(key) ?? key
  return registry.get(id) ?? null
}

export function hasLanguage(idOrAlias: string): boolean {
  return getLanguage(idOrAlias) !== null
}

export function listLanguages(): string[] {
  return [...registry.keys()]
}

// 注册内置语言（别名对齐 refractor/常用命名）
registerLanguage(typescriptLang, ['ts'])
registerLanguage(javascriptLang, ['js'])
registerLanguage(jsxLang, [])
registerLanguage(tsxLang, [])
registerLanguage(jsonLang, [])
registerLanguage(cssLang, ['scss', 'less'])
registerLanguage(htmlLang, ['xml', 'svg'])
registerLanguage(markdownLang, ['md'])
registerLanguage(bashLang, ['sh', 'shell', 'zsh'])
registerLanguage(pythonLang, ['py'])
registerLanguage(yamlLang, ['yml'])
registerLanguage(plaintextLang, ['text', 'txt', 'plain'])
