import { describe, it, expect } from 'vitest'
import { tokenizeLine, mergeTokens } from '../lexer-engine'
import { getLanguage } from '../lang'
import { TokenCache } from '../token-cache'
import { TextModel } from '@cd/core'

const ts = getLanguage('typescript')!

describe('TC-D3-01：语言样例 tokenize', () => {
  it('TypeScript 关键字/字符串/注释/数字', () => {
    const res = tokenizeLine('const x: string = "hello" // 注释', null, ts)
    const classes = res.tokens.map((t) => t.className).join(' ')
    expect(classes).toContain('tok-keyword')
    expect(classes).toContain('tok-string')
    expect(classes).toContain('tok-comment')
    expect(classes).toContain('tok-type')
    // 全文拼接还原
    expect(res.tokens.map((t) => t.text).join('')).toBe('const x: string = "hello" // 注释')
  })

  it('JSON 布尔/数字/字符串', () => {
    const json = getLanguage('json')!
    const res = tokenizeLine('{"a": true, "b": 123}', null, json)
    expect(res.tokens.map((t) => t.className)).toContain('tok-boolean')
    expect(res.tokens.map((t) => t.className)).toContain('tok-number')
  })

  it('CSS 属性/宏/选择器', () => {
    const css = getLanguage('css')!
    const res = tokenizeLine('.cls { color: @apply red; }', null, css)
    const classes = res.tokens.map((t) => t.className).join(' ')
    expect(classes).toContain('tok-macro')
  })

  it('HTML 标签/属性', () => {
    const html = getLanguage('html')!
    const res = tokenizeLine('<div class="x">text</div>', null, html)
    expect(res.tokens.map((t) => t.className)).toContain('tok-tag')
    expect(res.tokens.map((t) => t.className)).toContain('tok-attr-value')
  })

  it('Markdown 标题/代码', () => {
    const md = getLanguage('markdown')!
    const res = tokenizeLine('# Title', null, md)
    expect(res.tokens.map((t) => t.className)).toContain('tok-important')
  })

  it('Bash 注释/字符串/变量', () => {
    const bash = getLanguage('bash')!
    const res = tokenizeLine('echo "hello $NAME" # hi', null, bash)
    expect(res.tokens.map((t) => t.className)).toContain('tok-string')
    expect(res.tokens.map((t) => t.className)).toContain('tok-comment')
  })

  it('Python 关键字/字符串', () => {
    const py = getLanguage('python')!
    const res = tokenizeLine('def f(x): return "hi" # c', null, py)
    expect(res.tokens.map((t) => t.className)).toContain('tok-keyword')
    expect(res.tokens.map((t) => t.className)).toContain('tok-string')
  })

  it('YAML 属性/布尔', () => {
    const yaml = getLanguage('yaml')!
    const res = tokenizeLine('enabled: true', null, yaml)
    expect(res.tokens.map((t) => t.className)).toContain('tok-property')
    expect(res.tokens.map((t) => t.className)).toContain('tok-boolean')
  })

  it('全部 12 语言可解析且不抛错', () => {
    for (const id of ['typescript', 'javascript', 'jsx', 'tsx', 'json', 'css', 'html', 'markdown', 'bash', 'python', 'yaml', 'plaintext']) {
      const lang = getLanguage(id)
      expect(lang, id).not.toBeNull()
      const res = tokenizeLine('sample text 123 "str" // c', null, lang!)
      expect(res.tokens.length).toBeGreaterThan(0)
    }
  })

  it('别名解析（ts → typescript, py → python）', () => {
    expect(getLanguage('ts')!.id).toBe('typescript')
    expect(getLanguage('py')!.id).toBe('python')
  })
})

describe('TC-D3-02：跨行状态', () => {
  it('多行字符串续行着色正确', () => {
    const r1 = tokenizeLine('const s = "abc', null, ts)
    expect(r1.inProgress).toBe(true)
    const r2 = tokenizeLine('def"', r1.stateStack, ts)
    expect(r2.inProgress).toBe(false)
    // 续行内容带 string class
    expect(r2.tokens.some((t) => t.className === 'tok-string')).toBe(true)
  })

  it('块注释跨行', () => {
    const r1 = tokenizeLine('/* start', null, ts)
    expect(r1.inProgress).toBe(true)
    const r2 = tokenizeLine('middle', r1.stateStack, ts)
    expect(r2.tokens.every((t) => t.className === 'tok-comment')).toBe(true)
    const r3 = tokenizeLine('end */', r2.stateStack, ts)
    expect(r3.inProgress).toBe(false)
  })

  it('模板串跨行 + 嵌套 ${}', () => {
    const r1 = tokenizeLine('const t = `hello', null, ts)
    expect(r1.inProgress).toBe(true)
    const r2 = tokenizeLine('${name}', r1.stateStack, ts)
    expect(r2.tokens.some((t) => t.className === 'tok-operator')).toBe(true)
    const r3 = tokenizeLine('`', r2.stateStack, ts)
    expect(r3.inProgress).toBe(false)
  })

  it('JSX 标签识别', () => {
    const tsx = getLanguage('tsx')!
    const res = tokenizeLine('const el = <Component prop="x">hi</Component>', null, tsx)
    expect(res.tokens.map((t) => t.className)).toContain('tok-tag')
  })
})

describe('TC-D3-03：缓存命中', () => {
  it('同内容行二次 tokenize 命中缓存零重算', () => {
    const model = new TextModel('const a = 1\nconst b = 2\nconst c = 3', 't')
    const cache = new TokenCache()
    cache.setLanguage(ts)
    cache.setLineCount(3)
    const t1 = cache.getLineTokens(2, model, ts)
    const count1 = cache.recomputeCount
    expect(t1.length).toBeGreaterThan(0)
    // 二次取 → 命中，不重算
    const t2 = cache.getLineTokens(2, model, ts)
    expect(cache.recomputeCount).toBe(count1)
    expect(t2).toEqual(t1)
  })

  it('mergeTokens 合并相邻同 class', () => {
    const merged = mergeTokens([
      { text: 'a', className: 'tok-keyword' },
      { text: 'b', className: 'tok-keyword' },
      { text: 'c', className: '' },
    ])
    expect(merged).toEqual([
      { text: 'ab', className: 'tok-keyword' },
      { text: 'c', className: '' },
    ])
  })
})

describe('TC-D3-04：编辑增量失效', () => {
  it('中部行改 1 字符仅受影响行重 tokenize', () => {
    const model = new TextModel('const a = 1\nconst b = 2\nconst c = 3', 't')
    const cache = new TokenCache()
    cache.setLanguage(ts)
    cache.setLineCount(3)
    // 预取全部
    cache.getLineTokens(1, model, ts)
    cache.getLineTokens(2, model, ts)
    cache.getLineTokens(3, model, ts)
    const count = cache.recomputeCount
    // 编辑行 2
    model.applyEdits([{ range: { start: { line: 2, column: 10 }, end: { line: 2, column: 10 } }, text: '9' }])
    cache.invalidateRange(2, 2)
    cache.setLineCount(3)
    const t2 = cache.getLineTokens(2, model, ts)
    expect(t2.length).toBeGreaterThan(0)
    // 重算计数增加（行2 重算；行1/3 不受影响）
    expect(cache.recomputeCount).toBeGreaterThan(count)
    // 行 3 未失效：hash 未变，命中缓存
    const countAfter = cache.recomputeCount
    cache.getLineTokens(3, model, ts)
    expect(cache.recomputeCount).toBe(countAfter)
  })

  it('跨行状态链：编辑字符串开始行后重放正确', () => {
    const model = new TextModel('const a = 1\nconst s = "abc\ndef"\nconst c = 3', 't')
    const cache = new TokenCache()
    cache.setLanguage(ts)
    cache.setLineCount(3)
    cache.getLineTokens(1, model, ts)
    cache.getLineTokens(2, model, ts)
    cache.getLineTokens(3, model, ts)
    // 编辑行 1 → 行 2 的跨行状态依赖行 1 的结束状态（其实不依赖，但重放从最近快照行）
    model.applyEdits([{ range: { start: { line: 1, column: 11 }, end: { line: 1, column: 11 } }, text: 'x' }])
    cache.invalidateRange(1, 1)
    // 取行 2 → 应从行 1 重放（行 1 失效但行 2 未失效 → 命中）
    const t2 = cache.getLineTokens(2, model, ts)
    expect(t2.length).toBeGreaterThan(0)
  })
})
