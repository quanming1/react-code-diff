/**
 * 依赖方向检查（D1，FR1.4）——强制单向依赖：
 *
 *   core ← tokenizer ← view ← react
 *
 * 规则：
 *   core      — 不 import 任何 @cd/*
 *   tokenizer — 仅允许 @cd/core
 *   view      — 仅允许 @cd/core, @cd/tokenizer
 *   react     — 仅允许 @cd/core, @cd/tokenizer, @cd/view
 *
 * 用法：node scripts/check-deps.mjs
 * 违规时 exit 1（CI / lint 门禁）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES_DIR = join(ROOT, 'packages')

const ALLOWED = {
  core: [],
  tokenizer: ['@cd/core'],
  view: ['@cd/core', '@cd/tokenizer'],
  react: ['@cd/core', '@cd/tokenizer', '@cd/view'],
}

// 静态 import / export ... from，以及动态 import()
const STATIC_IMPORT_RE = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](@cd\/[^'"]+)['"]/g
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"](@cd\/[^'"]+)['"]\s*\)/g

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'coverage') continue
      walk(p, out)
    } else if (/\.(ts|tsx|mjs|js)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

let failed = false

for (const [pkg, allowed] of Object.entries(ALLOWED)) {
  const dir = join(PACKAGES_DIR, pkg)
  if (!existsSync(dir)) continue

  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf-8')
    const found = new Set()
    for (const m of src.matchAll(STATIC_IMPORT_RE)) found.add(m[1])
    for (const m of src.matchAll(DYNAMIC_IMPORT_RE)) found.add(m[1])

    for (const dep of found) {
      if (!allowed.includes(dep)) {
        failed = true
        const rel = relative(ROOT, file).replace(/\\/g, '/')
        console.error(
          `[依赖方向违规] ${pkg} 包 ${rel} 引用了 ${dep}` +
          (allowed.length ? `（仅允许: ${allowed.join(', ')}）` : '（core 不允许引用任何 @cd/*）')
        )
      }
    }
  }
}

if (failed) {
  console.error('依赖方向检查失败：core ← tokenizer ← view ← react 被违反')
  process.exit(1)
}

console.log('依赖方向检查通过：core ← tokenizer ← view ← react 单向依赖成立')
