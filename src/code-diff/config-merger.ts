import type {
  CodeDiffConfig,
  PartialConfig,
  ThemeColors,
} from './types'
import { defaultConfig } from './default-config'

function mergeDeep<T>(base: T, override: Partial<T> | undefined): T {
  if (override === undefined) return base
  if (typeof base !== 'object' || base === null) {
    return (override ?? base) as T
  }
  if (Array.isArray(base)) return (override ?? base) as T

  const result = { ...base }
  for (const key in override) {
    const b = (base as Record<string, unknown>)[key]
    const o = (override as Record<string, unknown>)[key]
    if (
      typeof b === 'object' &&
      b !== null &&
      !Array.isArray(b) &&
      typeof o === 'object' &&
      o !== null
    ) {
      (result as Record<string, unknown>)[key] = mergeDeep(
        b as Record<string, unknown>,
        o as Partial<Record<string, unknown>>
      )
    } else if (o !== undefined) {
      (result as Record<string, unknown>)[key] = o
    }
  }
  return result
}

function mergeColors(
  baseColors: { dark: ThemeColors; light: ThemeColors },
  override?: { dark?: Partial<ThemeColors>; light?: Partial<ThemeColors> }
): { dark: ThemeColors; light: ThemeColors } {
  if (!override) return baseColors
  return {
    dark: mergeDeep(baseColors.dark, override.dark),
    light: mergeDeep(baseColors.light, override.light),
  }
}

export function mergeConfig(
  partial?: PartialConfig
): CodeDiffConfig {
  if (!partial) return defaultConfig

  const merged: CodeDiffConfig = {
    font: mergeDeep(defaultConfig.font, partial.font),
    layout: mergeDeep(defaultConfig.layout, partial.layout),
    diff: mergeDeep(defaultConfig.diff, partial.diff),
    search: mergeDeep(defaultConfig.search, partial.search),
    toolbar: mergeDeep(defaultConfig.toolbar, partial.toolbar),
    icons: { ...defaultConfig.icons, ...partial.icons },
    texts: mergeDeep(defaultConfig.texts, partial.texts),
    colors: mergeColors(defaultConfig.colors, partial.colors),
  }

  return merged
}

export function colorsToCssVars(colors: ThemeColors): Record<string, string> {
  return {
    '--cd-bg': colors.bg,
    '--cd-bg-secondary': colors.bgSecondary,
    '--cd-border': colors.border,
    '--cd-text': colors.text,
    '--cd-muted': colors.muted,
    '--cd-line-hover': colors.lineHover,
    '--cd-added-bg': colors.addedBg,
    '--cd-added-strong': colors.addedStrong,
    '--cd-added-text': colors.addedText,
    '--cd-removed-bg': colors.removedBg,
    '--cd-removed-strong': colors.removedStrong,
    '--cd-removed-text': colors.removedText,
    '--cd-gutter-bg': colors.gutterBg,
    '--cd-gutter-text': colors.gutterText,
    '--cd-search-bg': colors.searchBg,
    '--cd-search-current': colors.searchCurrent,
    '--cd-search-current-text': colors.searchCurrentText,
    '--cd-collapse-bg': colors.collapseBg,
    '--cd-collapse-text': colors.collapseText,
    '--cd-toolbar-bg': colors.toolbarBg,
    '--cd-toolbar-border': colors.toolbarBorder,
    '--cd-accent': colors.accent,
    '--cd-token-comment': colors.tokens.comment,
    '--cd-token-punctuation': colors.tokens.punctuation,
    '--cd-token-property': colors.tokens.property,
    '--cd-token-boolean': colors.tokens.boolean,
    '--cd-token-string': colors.tokens.string,
    '--cd-token-keyword': colors.tokens.keyword,
    '--cd-token-function': colors.tokens.function,
    '--cd-token-class-name': colors.tokens.className,
    '--cd-token-variable': colors.tokens.variable,
    '--cd-token-regex': colors.tokens.regex,
    '--cd-token-attr-name': colors.tokens.attrName,
    '--cd-token-selector': colors.tokens.selector,
  }
}
