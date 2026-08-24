import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeDiff, mappingsToRows, myersDiff, type DiffRowLike } from '../diff-engine'
// 旧实现（仅测试对比用，dev 依赖）
import { computeDiff as legacyComputeDiff } from '../../../../src/code-diff/diff-engine'
import type { DiffRow } from '../../../../src/code-diff/types'

const ROOT = resolve(__dirname, '../../../../')

function readDemo(name: string): string {
  return readFileSync(resolve(ROOT, 'src', name), 'utf-8')
}

/** 把旧 rows 抽成可比骨架（忽略 parts/noNewline） */
function legacyRowsToSkeleton(rows: DiffRow[]): Array<{ type: string; leftLine: number | null; rightLine: number | null; left: string | null; right: string | null }> {
  return rows.map((r) => ({
    type: r.type,
    leftLine: r.left?.lineNumber ?? null,
    rightLine: r.right?.lineNumber ?? null,
    left: r.left?.content ?? null,
    right: r.right?.content ?? null,
  }))
}

function newRowsToSkeleton(rows: DiffRowLike[]): Array<{ type: string; leftLine: number | null; rightLine: number | null; left: string | null; right: string | null }> {
  return rows.map((r) => ({
    type: r.type,
    leftLine: r.left?.lineNumber ?? null,
    rightLine: r.right?.lineNumber ?? null,
    left: r.left?.content ?? null,
    right: r.right?.content ?? null,
  }))
}

/** 核心对比：新旧实现逐行一致 */
function assertSameDiff(oldText: string, newText: string, label: string): void {
  const legacy = legacyComputeDiff(oldText, newText, {
    inlineDiffEnabled: true,
    inlineDiffLineLimit: 2000,
    inlineDiffCharLimit: 20_000,
  })
  const mine = computeDiff(oldText, newText)
  const legacySkeleton = legacyRowsToSkeleton(legacy.rows)
  const mySkeleton = newRowsToSkeleton(mappingsToRows(mine))
  expect(mySkeleton, `${label}: rows 骨架一致`).toEqual(legacySkeleton)
  // stats
  expect(mine.stats.additions, `${label}: additions`).toBe(legacy.stats.additions)
  expect(mine.stats.deletions, `${label}: deletions`).toBe(legacy.stats.deletions)
}

describe('myersDiff 核心', () => {
  it('空 vs 空 → 无操作', () => {
    expect(myersDiff([], [])).toEqual([])
  })

  it('完全相同 → 全 eq', () => {
    const ops = myersDiff([1, 2, 3], [1, 2, 3])
    expect(ops).toEqual(['eq', 'eq', 'eq'])
  })

  it('全部删除 → 全 del', () => {
    expect(myersDiff([1, 2], [])).toEqual(['del', 'del'])
  })

  it('全部新增 → 全 ins', () => {
    expect(myersDiff([], [1, 2])).toEqual(['ins', 'ins'])
  })

  it('插入一行 → del/ins 混合（保持稳定顺序）', () => {
    const ops = myersDiff([1, 3], [1, 2, 3])
    // Myers 允许 del+ins 或 ins+del，但我们的实现「插入优先」→ [1, ins, 3]
    expect(ops).toEqual(['eq', 'ins', 'eq'])
  })

  it('修改一行（删+增）', () => {
    const ops = myersDiff([1, 2, 3], [1, 9, 3])
    expect(ops).toEqual(['eq', 'del', 'ins', 'eq'])
  })

  it('大数组性能：1000 行 diff 快速完成', () => {
    const a = Array.from({ length: 1000 }, (_, i) => i)
    const b = a.slice()
    b.splice(500, 1, 9999)
    const ops = myersDiff(a, b)
    expect(ops.filter((o) => o === 'eq').length).toBeGreaterThan(990)
  })
})

describe('computeDiff 基本语义', () => {
  it('相同文本 → 无 mapping，全 context', () => {
    const r = computeDiff('a\nb\nc', 'a\nb\nc')
    expect(r.mappings).toEqual([])
    expect(r.stats).toEqual({ additions: 0, deletions: 0 })
    expect(mappingsToRows(r).every((row) => row.type === 'context')).toBe(true)
  })

  it('纯新增 → added mapping', () => {
    const r = computeDiff('', 'x\ny')
    expect(r.mappings).toHaveLength(1)
    expect(r.mappings[0].oldRange).toEqual({ startLineNumber: 1, endLineNumberExclusive: 1 })
    expect(r.mappings[0].newRange).toEqual({ startLineNumber: 1, endLineNumberExclusive: 3 })
    expect(r.stats).toEqual({ additions: 2, deletions: 0 })
  })

  it('纯删除 → removed mapping', () => {
    const r = computeDiff('x\ny', '')
    expect(r.mappings).toHaveLength(1)
    expect(r.mappings[0].oldRange).toEqual({ startLineNumber: 1, endLineNumberExclusive: 3 })
    expect(r.mappings[0].newRange).toEqual({ startLineNumber: 1, endLineNumberExclusive: 1 })
    expect(r.stats).toEqual({ additions: 0, deletions: 2 })
  })

  it('文件头/中/尾修改', () => {
    const r = computeDiff('a\nb\nc\nd\ne', 'a\nB\nc\nd\nE')
    expect(r.mappings).toHaveLength(2)
    expect(r.stats).toEqual({ additions: 2, deletions: 2 })
  })

  it('CRLF 归一化', () => {
    const r = computeDiff('a\r\nb', 'a\nb')
    expect(r.mappings).toEqual([])
  })

  it('行号映射：修改后新文件行号正确', () => {
    const r = computeDiff('line1\nline2\nline3', 'line1\nCHANGED\nline3')
    const rows = mappingsToRows(r)
    const removed = rows.find((row) => row.type === 'removed')
    const added = rows.find((row) => row.type === 'added')
    expect(removed?.left?.lineNumber).toBe(2)
    expect(added?.right?.lineNumber).toBe(2)
  })
})

describe('TC-D2-03：与旧实现逐行一致（快照）', () => {
  it('demo-edit-before/after 一致', () => {
    const oldText = readDemo('demo-edit-before.txt')
    const newText = readDemo('demo-edit-after.txt')
    assertSameDiff(oldText, newText, 'demo-edit')
  }, 30_000)

  it('demo-large 自比对一致（抽取变更前后）', () => {
    const large = readDemo('demo-large.tsx')
    // 构造一个小变更（替换一行）验证大文件上的行号/内容一致
    const modified = large.replace('const SUMMARY_INPUT_MAX_LENGTH', 'const SUMMARY_INPUT_MAX_LENGTH_CHANGED')
    assertSameDiff(large, modified, 'demo-large-modified')
  }, 30_000)

  it('空文本 vs 单行', () => {
    assertSameDiff('', 'hello', 'empty-single')
    assertSameDiff('hello', '', 'single-empty')
  })

  it('单行 vs 单行（改/同/删）', () => {
    assertSameDiff('abc', 'abc', 'same-single')
    assertSameDiff('abc', 'abd', 'change-single')
    assertSameDiff('abc', 'a', 'shrink-single')
  })

  it('混合场景：多块变更 + 上下文', () => {
    const oldText = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n')
    const newText = oldText
      .replace('line 10\n', 'line 10 CHANGED\n')
      .replace('line 20\n', '')
      .replace('line 30\n', 'line 30\nline 30.5\n')
      .replace('line 45\n', 'line 45 CHANGED\n')
    assertSameDiff(oldText, newText, 'multi-block')
  })

  it('大量删除（跨块）', () => {
    const oldText = Array.from({ length: 200 }, (_, i) => `l${i}`).join('\n')
    const newText = Array.from({ length: 200 }, (_, i) => `l${i}`).filter((_, i) => i < 50 || i >= 150).join('\n')
    assertSameDiff(oldText, newText, 'big-delete')
  })

  it('大量插入（跨块）', () => {
    const oldText = Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n')
    const newText = oldText + '\n' + Array.from({ length: 150 }, (_, i) => `new${i}`).join('\n')
    assertSameDiff(oldText, newText, 'big-insert')
  })

  it('行重复场景（hash 相同行的区分）', () => {
    const oldText = 'x\nx\nx\ny\nx\nx'
    const newText = 'x\nx\ny\nx\nx\nx'
    assertSameDiff(oldText, newText, 'dup-lines')
  })
})
