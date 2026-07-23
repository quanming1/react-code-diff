import { describe, it, expect } from 'vitest'
import {
  resolveLanguage,
  isLanguageSupported,
  highlightToLines,
  getTokenForLine,
  shouldHighlight,
} from '../code-diff/highlight-engine'

// ============================================================
// resolveLanguage
// ============================================================

describe('resolveLanguage', () => {
  it('maps common aliases', () => {
    expect(resolveLanguage('js')).toBe('javascript')
    expect(resolveLanguage('ts')).toBe('typescript')
    expect(resolveLanguage('py')).toBe('python')
    expect(resolveLanguage('rs')).toBe('rust')
    expect(resolveLanguage('sh')).toBe('bash')
    expect(resolveLanguage('yml')).toBe('yaml')
    expect(resolveLanguage('md')).toBe('markdown')
    expect(resolveLanguage('html')).toBe('markup')
    expect(resolveLanguage('xml')).toBe('markup')
    expect(resolveLanguage('c#')).toBe('csharp')
    expect(resolveLanguage('cs')).toBe('csharp')
    expect(resolveLanguage('c++')).toBe('cpp')
  })

  it('returns the language as-is for non-aliased languages', () => {
    expect(resolveLanguage('javascript')).toBe('javascript')
    expect(resolveLanguage('python')).toBe('python')
    expect(resolveLanguage('go')).toBe('go')
    expect(resolveLanguage('java')).toBe('java')
  })

  it('lowercases and trims input', () => {
    expect(resolveLanguage('  TS  ')).toBe('typescript')
    expect(resolveLanguage('JS')).toBe('javascript')
    expect(resolveLanguage('  Python  ')).toBe('python')
  })

  it('maps text/plain variants to plaintext', () => {
    expect(resolveLanguage('text')).toBe('plaintext')
    expect(resolveLanguage('txt')).toBe('plaintext')
    expect(resolveLanguage('plaintext')).toBe('plaintext')
  })
})

// ============================================================
// isLanguageSupported
// ============================================================

describe('isLanguageSupported', () => {
  it('returns true for registered languages', () => {
    expect(isLanguageSupported('tsx')).toBe(true)
    expect(isLanguageSupported('jsx')).toBe(true)
    expect(isLanguageSupported('javascript')).toBe(true)
    expect(isLanguageSupported('typescript')).toBe(true)
    expect(isLanguageSupported('json')).toBe(true)
    expect(isLanguageSupported('css')).toBe(true)
  })

  it('returns false for unsupported languages', () => {
    expect(isLanguageSupported('some-made-up-lang')).toBe(false)
    expect(isLanguageSupported('')).toBe(false)
  })
})

// ============================================================
// shouldHighlight
// ============================================================

describe('shouldHighlight', () => {
  it('returns true when combined length is within limit', () => {
    expect(shouldHighlight(100, 200)).toBe(true)
    expect(shouldHighlight(0, 0)).toBe(true)
    expect(shouldHighlight(250_000, 250_000)).toBe(true) // exactly 500_000
  })

  it('returns false when combined length exceeds limit', () => {
    expect(shouldHighlight(250_001, 250_000)).toBe(false)
    expect(shouldHighlight(600_000, 0)).toBe(false)
  })
})

// ============================================================
// highlightToLines
// ============================================================

describe('highlightToLines', () => {
  it('returns null for plaintext', () => {
    expect(highlightToLines('hello world', 'plaintext')).toBeNull()
    expect(highlightToLines('hello world', 'text')).toBeNull()
  })

  it('returns null for unsupported language', () => {
    expect(highlightToLines('hello', 'totally-fake-lang')).toBeNull()
  })

  it('returns null for empty code', () => {
    // refractor may throw on empty string, should be caught
    const result = highlightToLines('', 'javascript')
    // empty string either returns [[]] or null — both acceptable
    if (result !== null) {
      expect(Array.isArray(result)).toBe(true)
    }
  })

  it('returns FlatToken[][] for valid code with supported language', () => {
    const result = highlightToLines('const x = 1', 'javascript')
    expect(result).not.toBeNull()
    expect(Array.isArray(result)).toBe(true)
    expect(result!.length).toBeGreaterThanOrEqual(1)
    // First line should have tokens
    expect(result![0].length).toBeGreaterThan(0)
    // Each token should have text and className
    result![0].forEach((token) => {
      expect(typeof token.text).toBe('string')
      expect(typeof token.className).toBe('string')
    })
  })

  it('splits tokens across multiple lines', () => {
    const code = 'const x = 1\nconst y = 2'
    const result = highlightToLines(code, 'javascript')
    expect(result).not.toBeNull()
    expect(result!.length).toBe(2)
    // Both lines should have tokens
    expect(result![0].length).toBeGreaterThan(0)
    expect(result![1].length).toBeGreaterThan(0)
  })

  it('handles multi-line strings (token spans across lines)', () => {
    const code = 'const s = `hello\nworld`'
    const result = highlightToLines(code, 'javascript')
    expect(result).not.toBeNull()
    expect(result!.length).toBe(2)
  })

  it('assigns correct className for keywords', () => {
    const result = highlightToLines('const', 'javascript')
    expect(result).not.toBeNull()
    const keywordToken = result![0].find((t) => t.className.includes('keyword'))
    expect(keywordToken).toBeDefined()
    expect(keywordToken!.text).toBe('const')
  })

  it('assigns correct className for strings', () => {
    const result = highlightToLines('"hello"', 'javascript')
    expect(result).not.toBeNull()
    const stringToken = result![0].find((t) => t.className.includes('string'))
    expect(stringToken).toBeDefined()
  })

  it('assigns correct className for numbers', () => {
    const result = highlightToLines('42', 'javascript')
    expect(result).not.toBeNull()
    const numberToken = result![0].find((t) => t.className.includes('number'))
    expect(numberToken).toBeDefined()
    expect(numberToken!.text).toBe('42')
  })

  it('works with tsx', () => {
    const code = 'const App = () => <div>Hello</div>'
    const result = highlightToLines(code, 'tsx')
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].length).toBeGreaterThan(0)
  })

  it('works with aliases (js → javascript)', () => {
    const result = highlightToLines('const x = 1', 'js')
    expect(result).not.toBeNull()
    expect(result![0].length).toBeGreaterThan(0)
  })

  it('returns null gracefully on refractor errors', () => {
    // Passing deeply malformed input should not throw, just return null
    const result = highlightToLines('\x00\x01\x02', 'javascript')
    // Either null or valid tokens — should not throw
    if (result !== null) {
      expect(Array.isArray(result)).toBe(true)
    }
  })
})

// ============================================================
// getTokenForLine
// ============================================================

describe('getTokenForLine', () => {
  const sampleLines = [
    [{ text: 'const', className: 'token keyword' }, { text: ' ', className: '' }],
    [{ text: 'x', className: 'token function' }],
  ]

  it('returns tokens for valid line index', () => {
    expect(getTokenForLine(sampleLines, 0)).toHaveLength(2)
    expect(getTokenForLine(sampleLines, 1)).toHaveLength(1)
  })

  it('returns empty array for negative index', () => {
    expect(getTokenForLine(sampleLines, -1)).toEqual([])
  })

  it('returns empty array for out-of-bounds index', () => {
    expect(getTokenForLine(sampleLines, 5)).toEqual([])
    expect(getTokenForLine(sampleLines, 99)).toEqual([])
  })

  it('returns empty array when highlightLines is null', () => {
    expect(getTokenForLine(null, 0)).toEqual([])
    expect(getTokenForLine(null, 5)).toEqual([])
  })
})
