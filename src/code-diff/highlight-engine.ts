import { refractor } from 'refractor'
import jsxLang from 'refractor/jsx'
import tsxLang from 'refractor/tsx'
import type { FlatToken } from './types'

let langsRegistered = false
function ensureLangsRegistered() {
  if (langsRegistered) return
  langsRegistered = true
  refractor.register(jsxLang)
  refractor.register(tsxLang)
}

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  sh: 'bash',
  shell: 'bash',
  py: 'python',
  rs: 'rust',
  yml: 'yaml',
  md: 'markdown',
  'c#': 'csharp',
  cs: 'csharp',
  'c++': 'cpp',
  kt: 'kotlin',
  rb: 'ruby',
  php: 'php',
  go: 'go',
  java: 'java',
  json: 'json',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  yaml: 'yaml',
  toml: 'toml',
  dockerfile: 'docker',
  docker: 'docker',
  plaintext: 'plaintext',
  text: 'plaintext',
  txt: 'plaintext',
}

export function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim()
  return LANG_ALIASES[normalized] ?? normalized
}

export function isLanguageSupported(lang: string): boolean {
  ensureLangsRegistered()
  return refractor.registered(resolveLanguage(lang))
}

interface HastNode {
  type: string
  tagName?: string
  properties?: { className?: string[] }
  value?: string
  children?: HastNode[]
}

const HIGHLIGHT_CHAR_LIMIT = 500_000

export function shouldHighlight(oldLen: number, newLen: number): boolean {
  return oldLen + newLen <= HIGHLIGHT_CHAR_LIMIT
}

export function highlightToLines(
  code: string,
  language: string
): FlatToken[][] | null {
  ensureLangsRegistered()
  const resolved = resolveLanguage(language)
  if (resolved === 'plaintext' || resolved === 'text') return null
  if (!refractor.registered(resolved)) return null

  try {
    const tree = refractor.highlight(code, resolved) as unknown as HastNode
    return flattenToLines(tree)
  } catch {
    return null
  }
}

function flattenToLines(root: HastNode): FlatToken[][] {
  const lines: FlatToken[][] = [[]]

  function visit(node: HastNode, inheritedClass: string): void {
    if (node.type === 'text') {
      const text = node.value ?? ''
      if (text === '') return
      const parts = text.split('\n')
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) lines.push([])
        if (parts[i] !== '') {
          lines[lines.length - 1].push({ text: parts[i], className: inheritedClass })
        }
      }
    } else if (node.type === 'element' || node.type === 'root') {
      const classArr = node.properties?.className
      const className = classArr && classArr.length > 0 ? classArr.join(' ') : inheritedClass
      for (const child of node.children ?? []) {
        visit(child, className)
      }
    }
  }

  visit(root, '')
  return lines
}

export function getTokenForLine(
  highlightLines: FlatToken[][] | null,
  lineIndex: number
): FlatToken[] {
  if (!highlightLines || lineIndex < 0 || lineIndex >= highlightLines.length) {
    return []
  }
  return highlightLines[lineIndex] ?? []
}

const PREWARM_LANGS = [
  ['const x: string = "hello"', 'typescript'],
  ['const x = 1', 'javascript'],
  ['{"k":1}', 'json'],
  ['key: value', 'yaml'],
  ['echo hello', 'bash'],
  ['x = 1', 'python'],
] as const

export function prewarm() {
  for (const [code, lang] of PREWARM_LANGS) {
    highlightToLines(code, lang)
  }
}
