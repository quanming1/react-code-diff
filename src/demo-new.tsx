/**
 * D8 demo —— 迁移到 @cd/react 新架构。
 * 保留旧对照：/ 走新 CodeDiff，/legacy 走旧组件（对比用）。
 */
import React from 'react'
import { CodeDiff, CodeEditor, createModel, setModelMarkers } from '../packages/react/src/index'
import largeFile from './demo-large?raw'
import editBefore from './demo-edit-before.txt?raw'
import editAfter from './demo-edit-after.txt?raw'

const OLD_CODE = largeFile
const NEW_CODE = largeFile
  .replace('import React, { Component } from "react";', 'import React, { Component, useMemo, useCallback } from "react";')

export default function DemoApp() {
  const [viewMode, setViewMode] = React.useState<'unified' | 'split' | 'preview'>('unified')
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')
  const [useEditData, setUseEditData] = React.useState(true)
  const [reveal, setReveal] = React.useState<{ line: number; end: number; nonce: number } | null>(null)

  const oldVal = useEditData ? editBefore : OLD_CODE
  const newVal = useEditData ? editAfter : NEW_CODE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #ddd' }}>
        <button onClick={() => setUseEditData((v) => !v)}>{useEditData ? 'Edit Data' : 'Large Data'}</button>
        {(['preview', 'split', 'unified'] as const).map((m) => (
          <button key={m} style={viewMode === m ? { fontWeight: 'bold' } : {}} onClick={() => setViewMode(m)}>{m}</button>
        ))}
        <button onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>{theme}</button>
        <button onClick={() => setReveal((r) => ({ line: 100, end: 200, nonce: (r?.nonce ?? 0) + 1 }))}>跳转 100-200</button>
        <button onClick={() => setReveal(null)}>清除</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CodeDiff
          oldValue={oldVal}
          newValue={newVal}
          language="tsx"
          fileName={useEditData ? 'SummaryCreatePage.tsx' : 'SummaryDetailPage.tsx'}
          viewMode={viewMode}
          theme={theme}
          showDiffOnly={true}
          contextLines={3}
          revealLine={reveal?.line}
          revealEndLine={reveal ? reveal.end : undefined}
          revealNonce={reveal?.nonce}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ padding: 8, borderTop: '1px solid #ddd', fontSize: 12 }}>
        <b>CodeEditor demo</b>（可编辑 + minimap + 诊断注入）：
      </div>
      <EditorDemo />
    </div>
  )
}

function EditorDemo() {
  const model = React.useMemo(() => createModel('const x = 1\n// 编辑我\nconst y = 2\n', 'typescript', 'uri://demo/editor'), [])
  React.useEffect(() => {
    setModelMarkers(model, 'demo', [{ severity: 'warning', message: 'demo warning', line: 3 }])
  }, [model])
  const [val, setVal] = React.useState('')
  const editorRef = React.useRef<React.ComponentRef<typeof CodeEditor>>(null)
  return (
    <div style={{ height: 180 }}>
      <CodeEditor
        model={model}
        language="typescript"
        theme="light"
        minimap={{ enabled: true }}
        onChange={(v) => setVal(v)}
        ref={editorRef}
        style={{ width: '100%', height: '100%' }}
      />
      <div style={{ fontSize: 11, color: '#888' }}>onChange 已触发 {val.length > 0 ? '✓' : ''}</div>
    </div>
  )
}
