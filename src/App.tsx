import { useState } from 'react'
import { CodeDiff } from './code-diff'
import type { ViewMode, Theme } from './code-diff'
import './App.css'
import largeFile from './demo-large?raw'
import editBefore from './demo-edit-before.txt?raw'
import editAfter from './demo-edit-after.txt?raw'

const OLD_CODE = largeFile

const NEW_CODE = largeFile
  .replace('import React, { Component } from "react";', 'import React, { Component, useMemo, useCallback } from "react";')
  .replace('import { ChevronDown, Check, X } from "lucide-react";', 'import { ChevronDown, Check, X, Zap, Star } from "lucide-react";')
  .replace('import * as api from "../api/summaryApi";', 'import * as api from "../api/summaryApi";\nimport { useDebounce } from "../hooks/useDebounce";\nimport { trackEvent } from "../utils/analytics";')
  .replace('const SUMMARY_INPUT_MAX_LENGTH', 'const SUMMARY_INPUT_MAX_LENGTH = 2000 // TODO: make configurable')
  .replace('// RefineSection 已移除', '// RefineSection 已移除 — 反馈修改改为在智能总结 chat 里引用总结迭代\n// NOTE: re-enabled in v2 for direct editing support')

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('unified')
  const [theme, setTheme] = useState<Theme>('light')
  const [wrapLines, setWrapLines] = useState(false)
  const [showDiffOnly, setShowDiffOnly] = useState(true)
  const [useEditData, setUseEditData] = useState(true)
  // B1 demo：跳转 100-200 行（nonce 递增可重复触发同一区间）
  const [reveal, setReveal] = useState<{ line: number; end: number; nonce: number } | null>(null)

  const oldVal = useEditData ? editBefore : OLD_CODE
  const newVal = useEditData ? editAfter : NEW_CODE

  return (
    <div className="demo-app">
      <div className="demo-controls">
        <button
          className={useEditData ? 'demo-btn active' : 'demo-btn'}
          onClick={() => setUseEditData((v) => !v)}
        >
          {useEditData ? 'Edit Data' : 'Large Data'}
        </button>
        <div className="demo-btn-group">
          <button
            className={viewMode === 'preview' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
          <button
            className={viewMode === 'split' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button
            className={viewMode === 'unified' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setViewMode('unified')}
          >
            Unified
          </button>
        </div>
        <div className="demo-btn-group">
          <button
            className={theme === 'dark' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setTheme('dark')}
          >
            Dark
          </button>
          <button
            className={theme === 'light' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setTheme('light')}
          >
            Light
          </button>
        </div>
        <button
          className={wrapLines ? 'demo-btn active' : 'demo-btn'}
          onClick={() => setWrapLines((v) => !v)}
        >
          Wrap
        </button>
        <button
          className={showDiffOnly ? 'demo-btn active' : 'demo-btn'}
          onClick={() => setShowDiffOnly((v) => !v)}
        >
          Diff Only
        </button>
        <div className="demo-btn-group">
          <button
            className={reveal ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setReveal(r => ({ line: 100, end: 200, nonce: (r?.nonce ?? 0) + 1 }))}
          >
            跳转 100-200
          </button>
          <button
            className={reveal && reveal.end === reveal.line ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setReveal(r => ({ line: 42, end: 42, nonce: (r?.nonce ?? 0) + 1 }))}
          >
            跳转 L42
          </button>
          <button
            className="demo-btn"
            onClick={() => setReveal(null)}
          >
            清除
          </button>
        </div>
      </div>

      <CodeDiff
        oldValue={oldVal}
        newValue={newVal}
        language="tsx"
        fileName={useEditData ? 'SummaryCreatePage.tsx' : 'SummaryDetailPage.tsx'}
        viewMode={viewMode}
        theme={theme}
        wrapLines={wrapLines}
        showDiffOnly={showDiffOnly}
        contextLines={3}
        revealLine={reveal?.line}
        revealEndLine={reveal ? reveal.end : undefined}
        revealNonce={reveal?.nonce}
        style={{ flex: '0 1 auto', minHeight: 0 }}
      />
    </div>
  )
}

export default App
