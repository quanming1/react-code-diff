import { describe, it, expect } from 'vitest'
import { TextModel, createModel, getModel, disposeModel, hashLine, normalizeEOL } from '../text-model'

/** 构造 n 行文本：line 1 / line 2 / ... */
function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')
}

describe('TextModel 行访问（TC-D2-01）', () => {
  it('10K 行随机行访问正确', () => {
    const m = new TextModel(makeLines(10_000), 't1')
    expect(m.getLineCount()).toBe(10_000)
    // 随机抽样验证（首/中/尾/随机）
    const samples = [1, 2, 100, 5_000, 9_999, 10_000, 7_777]
    for (const l of samples) {
      expect(m.getLineContent(l)).toBe(`line ${l}`)
    }
  })

  it('空文本为 1 行空行（编辑器语义）', () => {
    const m = new TextModel('', 't2')
    expect(m.getLineCount()).toBe(1)
    expect(m.getLineContent(1)).toBe('')
  })

  it('区间读：单行片段', () => {
    const m = new TextModel('hello world', 't3')
    expect(m.getValueInRange({ start: { line: 1, column: 1 }, end: { line: 1, column: 6 } })).toBe('hello')
  })

  it('区间读：跨行（含换行）', () => {
    const m = new TextModel('a\nb\nc\nd', 't4')
    expect(m.getValueInRange({ start: { line: 1, column: 1 }, end: { line: 3, column: 2 } })).toBe('a\nb\nc')
  })

  it('区间读：越界钳制', () => {
    const m = new TextModel('ab', 't5')
    expect(m.getValueInRange({ start: { line: 1, column: 1 }, end: { line: 99, column: 99 } })).toBe('ab')
  })

  it('行 hash：同内容同 hash、不同内容不同', () => {
    const m = new TextModel('foo\nbar\nfoo', 't6')
    expect(m.getLineHash(1)).toBe(m.getLineHash(3))
    expect(m.getLineHash(1)).not.toBe(m.getLineHash(2))
  })

  it('行 hash：缓存（连续取同值）', () => {
    const m = new TextModel('x', 't7')
    expect(m.getLineHash(1)).toBe(hashLine('x'))
  })

  it('>50K 行惰性分块（不预切）', () => {
    const m = new TextModel(makeLines(60_000), 't8')
    expect(m.getLineCount()).toBe(60_000)
    expect(m.getLineContent(60_000)).toBe('line 60000')
    expect(m.getLineContent(1)).toBe('line 1')
  })
})

describe('TextModel.applyEdits（TC-D2-02）', () => {
  it('单行替换', () => {
    const m = new TextModel('hello world', 'e1')
    m.applyEdits([{ range: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }, text: 'goodbye' }])
    expect(m.getValue()).toBe('goodbye world')
    expect(m.getVersionId()).toBe(1)
  })

  it('纯插入（空 range）', () => {
    const m = new TextModel('abc', 'e2')
    m.applyEdits([{ range: { start: { line: 1, column: 2 }, end: { line: 1, column: 2 } }, text: 'X' }])
    expect(m.getValue()).toBe('aXbc')
  })

  it('纯删除（空 text）', () => {
    const m = new TextModel('abcdef', 'e3')
    m.applyEdits([{ range: { start: { line: 1, column: 2 }, end: { line: 1, column: 5 } }, text: '' }])
    expect(m.getValue()).toBe('aef')
  })

  it('跨行删除', () => {
    const m = new TextModel('a\nb\nc\nd', 'e4')
    m.applyEdits([{ range: { start: { line: 2, column: 1 }, end: { line: 3, column: 2 } }, text: '' }])
    expect(m.getValue()).toBe('a\nd')
    expect(m.getLineCount()).toBe(2)
  })

  it('跨行替换为多行', () => {
    const m = new TextModel('a\nb\nc', 'e5')
    m.applyEdits([{ range: { start: { line: 1, column: 1 }, end: { line: 3, column: 2 } }, text: 'x\ny\nz' }])
    expect(m.getValue()).toBe('x\ny\nz')
    expect(m.getLineCount()).toBe(3)
  })

  it('文件尾插入（含新行）', () => {
    const m = new TextModel('a\nb', 'e6')
    const maxCol = m.getLineMaxColumn(2)
    m.applyEdits([{ range: { start: { line: 2, column: maxCol }, end: { line: 2, column: maxCol } }, text: '\nc' }])
    expect(m.getValue()).toBe('a\nb\nc')
    expect(m.getLineCount()).toBe(3)
  })

  it('空区间插入（空文本边界）', () => {
    const m = new TextModel('', 'e7')
    m.applyEdits([{ range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, text: 'hi' }])
    expect(m.getValue()).toBe('hi')
  })

  it('批量编辑：单调递增多 edit', () => {
    const m = new TextModel('abcdef', 'e8')
    // 位置基于旧文本：编辑 1: [1,2)-(1,3) 删 'b'；编辑 2: [1,4)-(1,6) 删 'de'
    m.applyEdits([
      { range: { start: { line: 1, column: 2 }, end: { line: 1, column: 3 } }, text: '' },
      { range: { start: { line: 1, column: 4 }, end: { line: 1, column: 6 } }, text: '' },
    ])
    expect(m.getValue()).toBe('acf')
    expect(m.getVersionId()).toBe(1)
  })

  it('编辑后行 hash 失效重算', () => {
    const m = new TextModel('foo\nbar\nbaz', 'e9')
    const h1 = m.getLineHash(2)
    m.applyEdits([{ range: { start: { line: 2, column: 1 }, end: { line: 2, column: 4 } }, text: 'qux' }])
    expect(m.getLineHash(2)).not.toBe(h1)
    expect(m.getLineHash(2)).toBe(hashLine('qux'))
  })

  it('大量插入触发块分裂后结构正确', () => {
    const m = new TextModel(makeLines(100), 'e10')
    // 在行 50 后插入 300 行 → 触发分裂（>256）
    const insertLines = Array.from({ length: 300 }, (_, i) => `ins ${i}`).join('\n')
    const maxCol = m.getLineMaxColumn(50)
    m.applyEdits([{ range: { start: { line: 50, column: maxCol }, end: { line: 50, column: maxCol } }, text: '\n' + insertLines }])
    expect(m.getLineCount()).toBe(400)
    expect(m.getLineContent(51)).toBe('ins 0')
    // 新行区间：行 51..351 为 'ins 0'..'ins 299'（301 项替换行 50 后的行 51 起）
    expect(m.getLineContent(349)).toBe('ins 298')
    expect(m.getLineContent(350)).toBe('ins 299')
    // 原尾部：行 351..400 = 'line 51'..'line 100'
    expect(m.getLineContent(351)).toBe('line 51')
    expect(m.getLineContent(400)).toBe('line 100')
    // 随机抽样
    expect(m.getLineContent(100)).toBe('ins 49')
  })

  it('大量删除触发块合并后结构正确', () => {
    const m = new TextModel(makeLines(500), 'e11')
    // 删除行 100~400（跨多块；端点在行首/行尾 → 整行删除语义）
    m.applyEdits([{ range: { start: { line: 100, column: 1 }, end: { line: 400, column: 100 } }, text: '' }])
    expect(m.getLineCount()).toBe(199)
    expect(m.getLineContent(99)).toBe('line 99')
    expect(m.getLineContent(100)).toBe('line 401')
    expect(m.getLineContent(199)).toBe('line 500')
  })

  it('CRLF 归一化', () => {
    const m = new TextModel('a\r\nb\rc', 'e12')
    expect(m.getLineCount()).toBe(3)
    expect(m.getLineContent(1)).toBe('a')
    expect(m.getLineContent(2)).toBe('b')
    expect(m.getLineContent(3)).toBe('c')
  })
})

describe('TextModel 事件（TC-D2-06 关联）', () => {
  it('applyEdits 触发 onDidChangeContent（含 changes 描述）', () => {
    const m = new TextModel('abc', 'ev1')
    let got: { versionId: number; changes: unknown[] } | null = null
    m.onDidChangeContent((e) => { got = e })
    m.applyEdits([{ range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, text: 'X' }])
    expect(got).not.toBeNull()
    expect(got!.versionId).toBe(1)
    expect(got!.changes).toHaveLength(1)
    expect(got!.changes[0]).toMatchObject({ rangeOffset: 0, rangeLength: 1, text: 'X' })
  })

  it('取消订阅后不再触发', () => {
    const m = new TextModel('a', 'ev2')
    let count = 0
    const off = m.onDidChangeContent(() => { count++ })
    m.applyEdits([{ range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, text: 'x' }])
    off()
    m.applyEdits([{ range: { start: { line: 1, column: 2 }, end: { line: 1, column: 2 } }, text: 'y' }])
    expect(count).toBe(1)
  })

  it('getValue 反映全部编辑', () => {
    const m = new TextModel('a', 'ev3')
    m.applyEdits([{ range: { start: { line: 1, column: 2 }, end: { line: 1, column: 2 } }, text: 'b' }])
    m.applyEdits([{ range: { start: { line: 1, column: 3 }, end: { line: 1, column: 3 } }, text: 'c' }])
    expect(m.getValue()).toBe('abc')
    expect(m.getVersionId()).toBe(2)
  })
})

describe('uri 注册表（FR2.6 雏形）', () => {
  it('createModel / getModel / disposeModel 生命周期', () => {
    const m1 = createModel('x', 'plaintext', 'uri://demo/1')
    expect(getModel('uri://demo/1')).toBe(m1)
    // 同名 uri 复用
    const m2 = createModel('y', 'plaintext', 'uri://demo/1')
    expect(m2).toBe(m1)
    disposeModel('uri://demo/1')
    expect(getModel('uri://demo/1')).toBeNull()
  })
})

describe('normalizeEOL', () => {
  it('统一为 LF', () => {
    expect(normalizeEOL('a\r\nb\rc')).toBe('a\nb\nc')
  })
})
