/**
 * @cd/react CodeEditor（FR7.2）——完整编辑器组件（Monaco 式 API）。
 *
 * - model | value 双模式：传 model（引用）或受控 value + onChange
 * - language / theme / readOnly / minimap / lineNumbers / glyphMargin
 * - ref 暴露：undo/redo/focus/getValue/setValue/getPosition/setPosition/revealLine
 * - 事件：onDidChangeContent / onDidChangeCursorPosition / onDidChangeSelection
 * - 内部：useRef 挂载 View + InputHandler + CursorsController + EditStack
 */

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { TextModel, CursorsController, EditStack, type Selection, type Position } from '@cd/core'
import { View, InputHandler, ViewCursors, Minimap, OverviewRuler, type ViewModelLike } from '@cd/view'
import { getModelMarkers, severityToClass, type Marker } from './diagnostics'

export interface CodeEditorProps {
  /** model 引用（与 value 二选一；优先） */
  model?: TextModel | string
  /** 受控值（与 model 二选一） */
  value?: string
  language?: string
  theme?: 'light' | 'dark'
  readOnly?: boolean
  minimap?: { enabled?: boolean; renderCharacters?: boolean; maxColumn?: number }
  lineNumbers?: 'on' | 'off' | 'relative'
  glyphMargin?: boolean
  onChange?: (value: string) => void
  onDidChangeCursorPosition?: (pos: Position) => void
  onDidChangeSelection?: (sel: Selection) => void
  onDidChangeMarkers?: (markers: Marker[]) => void
  className?: string
  style?: React.CSSProperties
}

export interface CodeEditorHandle {
  undo(): void
  redo(): void
  focus(): void
  getValue(): string
  setValue(v: string): void
  getPosition(): Position
  setPosition(p: Position): void
  revealLine(line: number): void
}

const LINE_HEIGHT = 20

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(props, ref) {
  const {
    model: modelProp,
    value,
    language = 'plaintext',
    theme = 'light',
    readOnly = false,
    minimap,
    lineNumbers = 'on',
    glyphMargin = true,
    onChange,
    onDidChangeCursorPosition,
    onDidChangeSelection,
    onDidChangeMarkers,
    className,
    style,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const cursorsRef = useRef<CursorsController | null>(null)
  const editStackRef = useRef<EditStack | null>(null)
  const handlerRef = useRef<InputHandler | null>(null)
  const viewCursorsRef = useRef<ViewCursors | null>(null)
  const modelRef = useRef<TextModel | null>(null)

  // 创建/解析 model
  useEffect(() => {
    let model: TextModel
    if (modelProp instanceof TextModel) {
      model = modelProp
    } else if (typeof modelProp === 'string') {
      // uri → getModel；无则新建
      model = getModelByUri(modelProp) ?? createModelFromUri(modelProp)
    } else {
      model = new TextModel(value ?? '', `editor:${Math.random().toString(36).slice(2)}`)
    }
    modelRef.current = model
    return () => {
      // 仅清理自建 model（引用 model 不销毁）
      if (!(modelProp instanceof TextModel)) {
        // noop：注册表 model 由消费端 dispose
      }
    }
  }, [modelProp])

  // 挂载 View
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''

    const view = new View({ lineHeight: LINE_HEIGHT, overscan: 8 })
    container.appendChild(view.getDomNode())
    viewRef.current = view
    view.setLanguage(language)
    view.setGutterEnabled(true, { lineNumbers, glyphMargin })
    // minimap
    if (minimap && (minimap.enabled ?? false)) {
      const mm = new Minimap({ onRevealLine: (l) => view.scrollToLine(l, 'center') }, {
        enabled: true,
        renderCharacters: minimap.renderCharacters ?? true,
        maxColumn: minimap.maxColumn ?? 80,
      })
      container.appendChild(mm.getDomNode())
    }
    // overview ruler
    const ruler = new OverviewRuler((l) => view.scrollToLine(l, 'center'), { enabled: true })
    container.appendChild(ruler.getDomNode())

    // 光标层
    const vc = new ViewCursors()
    container.appendChild(vc.getDomNode())
    viewCursorsRef.current = vc

    return () => {
      container.innerHTML = ''
      viewRef.current = null
    }
  }, []) // 仅挂载一次

  // model 变化 → view.setModel + 编辑栈
  // 回调经 ref 稳定引用，避免每次渲染重建 EditStack（否则 undo 栈被清空）
  const cbRef = useRef({ onChange, onDidChangeCursorPosition, onDidChangeSelection })
  cbRef.current = { onChange, onDidChangeCursorPosition, onDidChangeSelection }

  useEffect(() => {
    const view = viewRef.current
    const model = modelRef.current
    if (!view || !model) return
    view.setModel(model as unknown as ViewModelLike)
    cursorsRef.current = new CursorsController(model)
    editStackRef.current = new EditStack(model)
    const handler = new InputHandler(containerRef.current!, {
      onDidEdit: (sels) => {
        if (cbRef.current.onChange) cbRef.current.onChange(model.getValue())
        cbRef.current.onDidChangeSelection?.(sels[0])
        updateCursors(view, cursorsRef.current!, viewCursorsRef.current!, model)
      },
      onDidMoveCursor: (sels) => {
        cbRef.current.onDidChangeCursorPosition?.(sels[0].active)
        cbRef.current.onDidChangeSelection?.(sels[0])
        updateCursors(view, cursorsRef.current!, viewCursorsRef.current!, model)
      },
      onUndoRedoStateChange: () => {},
    }, { readOnly })
    handler.attach(model, cursorsRef.current, editStackRef.current)
    handlerRef.current = handler
    return () => {
      handler.detach()
    }
  }, [modelRef.current, language, readOnly])

  // value 受控（外部变化 → 同步 model）
  useEffect(() => {
    const model = modelRef.current
    if (!model || modelProp instanceof TextModel || typeof modelProp === 'string') return
    if (value !== undefined && value !== model.getValue()) {
      const lineCount = model.getLineCount()
      model.applyEdits([{
        range: { start: { line: 1, column: 1 }, end: { line: lineCount, column: model.getLineMaxColumn(lineCount) } },
        text: value,
      }])
      viewRef.current?.setModel(model as unknown as ViewModelLike)
    }
  }, [value])

  // 语言变化
  useEffect(() => {
    viewRef.current?.setLanguage(language)
  }, [language])

  // 诊断 → gutter marker
  useEffect(() => {
    const model = modelRef.current
    const view = viewRef.current
    if (!model || !view) return
    const markers = getModelMarkers(model)
    // 清旧
    const allLines = new Set<number>()
    markers.forEach((m) => allLines.add(m.line))
    allLines.forEach((l) => view.setGutterMarker(l, null))
    // 设新
    markers.forEach((m) => view.setGutterMarker(m.line, severityToClass(m.severity)))
    onDidChangeMarkers?.(markers)
  }, [modelRef.current, onDidChangeMarkers])

  useImperativeHandle(ref, () => ({
    undo: () => { editStackRef.current?.undo(); },
    redo: () => { editStackRef.current?.redo(); },
    focus: () => containerRef.current?.focus(),
    getValue: () => modelRef.current?.getValue() ?? '',
    setValue: (v: string) => {
      const model = modelRef.current
      if (!model) return
      const lineCount = model.getLineCount()
      model.applyEdits([{
        range: { start: { line: 1, column: 1 }, end: { line: lineCount, column: model.getLineMaxColumn(lineCount) } },
        text: v,
      }])
      viewRef.current?.setModel(model as unknown as ViewModelLike)
    },
    getPosition: () => cursorsRef.current?.getPrimarySelection().active ?? { line: 1, column: 1 },
    setPosition: (p: Position) => cursorsRef.current?.moveTo(p.line, p.column),
    revealLine: (line: number) => viewRef.current?.scrollToLine(line, 'center'),
  }), [])

  return (
    <div
      ref={containerRef}
      className={`cd-editor cd-theme-${theme} ${className ?? ''}`}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
      tabIndex={0}
    />
  )
})

function updateCursors(
  view: View,
  cursors: CursorsController,
  vc: ViewCursors | null,
  model: TextModel,
): void {
  if (!vc) return
  const selections = cursors.getSelections()
  const maxCol = model.getLineMaxColumn(cursors.getPrimarySelection().active.line)
  vc.update({
    selections,
    lineHeight: LINE_HEIGHT,
    charWidth: 8,
    getColumnX: (_l, c) => Math.min(c - 1, maxCol) * 8,
    focused: true,
  })
  // 光标行可见性
  const line = cursors.getPrimarySelection().active.line
  view.scrollToLine(line, 'nearest')
}

// 注册表辅助（复用 model-registry）
import { getModel as getModelByUri, createModel as createModelFromUri } from './model-registry'

export { TextModel }
