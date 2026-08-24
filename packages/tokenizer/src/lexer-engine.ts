/**
 * @cd/tokenizer 词法引擎（FR3.1）——规则驱动状态机。
 *
 * 设计：
 * - LanguageDef：{ id, start, states: Record<state, LexerRule[]> }
 * - LexerRule：{ regex(锚定 ^), action: emit|push|pop, tokenType?, nextState?, popCount? }
 * - 状态栈：字符串/注释/模板/JSX 进子状态；pop 返回；#pop N 计数
 * - 逐行 tokenize：输入行 + 进入时状态栈快照 → 输出 token 数组 + 新状态栈
 * - tokenizeLine 是纯函数（无状态），状态由调用方持有（token-cache 管理）
 */

/** 语法 token 类型（映射到 CSS class，见 theme.ts） */
export type TokenType =
  | 'keyword' | 'type' | 'string' | 'comment' | 'number' | 'regex'
  | 'function' | 'variable' | 'property' | 'operator' | 'punctuation'
  | 'tag' | 'attr-name' | 'attr-value' | 'plain' | 'template' | 'macro'
  | 'boolean' | 'constant' | 'parameter' | 'class-name' | 'important'

export interface LexerRule {
  /** 锚定匹配（内部自动加 ^，调用方无需写） */
  regex: RegExp
  /** emit：产出 token 留在当前状态；push：进子状态（nextState 必填）；pop：返回上层 */
  action: 'emit' | 'push' | 'pop'
  tokenType?: TokenType
  nextState?: string
  /** pop 时一次弹出 N 层（默认 1） */
  popCount?: number
}

export interface LanguageDef {
  id: string
  start: string
  states: Record<string, LexerRule[]>
}

/** 扁平 token（与现有 segment-merger 兼容：text + className） */
export interface FlatToken {
  text: string
  className: string
}

/** 行 tokenize 结果 */
export interface TokenizeLineResult {
  tokens: FlatToken[]
  /** 行结束后的状态栈（供下一行使用） */
  stateStack: string[]
  /** 是否以未闭合状态结束（跨行 token 续行） */
  inProgress: boolean
}

const EMPTY: string[] = []

/**
 * tokenize 一行。
 * @param line 行内容（不含换行符）
 * @param stateStack 进入本行时的状态栈（顶层在末尾）
 * @param lang 语言定义
 */
export function tokenizeLine(line: string, stateStack: string[] | null, lang: LanguageDef): TokenizeLineResult {
  const stack = stateStack && stateStack.length > 0 ? stateStack.slice() : [lang.start]
  const tokens: FlatToken[] = []
  let pos = 0
  let inProgress = false
  const n = line.length

  while (pos < n) {
    const state = stack[stack.length - 1]
    const rules = lang.states[state]
    if (!rules || rules.length === 0) {
      // 未知状态：整行剩余当 plain
      tokens.push({ text: line.slice(pos), className: '' })
      pos = n
      break
    }

    let matched = false
    for (const rule of rules) {
      // 锚定匹配：从当前 pos 开始（m.index 必须为 0，否则跳着匹配后续内容）
      rule.regex.lastIndex = 0
      const m = rule.regex.exec(line.slice(pos))
      if (!m || m.index !== 0) continue
      const text = m[0]
      if (text === '') continue
      matched = true

      switch (rule.action) {
        case 'emit': {
          tokens.push({ text, className: rule.tokenType ? `tok-${rule.tokenType}` : '' })
          pos += text.length
          break
        }
        case 'push': {
          // push 的 token（如字符串开始符）带类型；进入子状态后继续从 pos 开始（不消费？）
          // 设计：push 动作消费当前匹配文本作为 token，然后进入子状态
          tokens.push({ text, className: rule.tokenType ? `tok-${rule.tokenType}` : '' })
          stack.push(rule.nextState ?? lang.start)
          pos += text.length
          break
        }
        case 'pop': {
          const cnt = rule.popCount ?? 1
          const nPop = Math.min(cnt, stack.length - 1)
          // pop 的 token（如字符串结束符/注释结束符）带类型
          tokens.push({ text, className: rule.tokenType ? `tok-${rule.tokenType}` : '' })
          for (let i = 0; i < nPop; i++) stack.pop()
          pos += text.length
          break
        }
      }
      break // 每条规则尝试一次，命中即出
    }

    if (!matched) {
      // 无规则命中：消费 1 字符为 plain（防死循环），但若处于 push 后 pos 未前进…
      tokens.push({ text: line[pos], className: '' })
      pos++
    }
  }

  // 行结束时若状态栈还有非起始状态 → 跨行未闭合
  inProgress = stack.length > 1 || stack[0] !== lang.start
  // 但 stack 顶层回到 start 且只有一层 → 未闭合（如普通文本里的引号没配对）
  return { tokens, stateStack: stack, inProgress }
}

/** 合并 FlatToken 数组（相邻同 class 合并，减小 DOM） */
export function mergeTokens(tokens: FlatToken[]): FlatToken[] {
  const out: FlatToken[] = []
  for (const t of tokens) {
    const last = out[out.length - 1]
    if (last && last.className === t.className) {
      last.text += t.text
    } else {
      out.push({ text: t.text, className: t.className })
    }
  }
  return out
}

export { EMPTY }
