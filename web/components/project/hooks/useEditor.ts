import { useSocket } from "@/context/SocketContext"
import {
  configureEditorKeybindings,
  defaultCompilerOptions,
} from "@/lib/monaco/config"
import { debounce } from "@/lib/utils"
import { useEditor as useEditorContext } from "@/context/editor-context"
import { useTerminal } from "@/context/TerminalContext"
import { fileRouter } from "@/lib/api"
import { useAppStore } from "@/store/context"
import { BeforeMount, OnMount } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import { useCallback, useEffect, useRef, useState } from "react"
import { enableEditorShortcuts } from "../layout/utils/shortcuts"
import { useFileTree } from "./useFile"
import { loadAndApplyTSConfig } from "./lib/tsconfig-loader"
import {
  useGenerateWidgetEffect,
  useSuggestionWidgetEffect,
} from "./useEditorWidgets"

export interface UseEditorProps {
  fileId: string
  projectId: string
}

export interface GenerateState {
  show: boolean
  id: string
  line: number
  widget: monaco.editor.IContentWidget | undefined
  pref: monaco.editor.ContentWidgetPositionPreference[]
  width: number
}

export interface DecorationsState {
  options: monaco.editor.IModelDeltaDecoration[]
  instance: monaco.editor.IEditorDecorationsCollection | undefined
}

export const useEditor = ({ projectId, fileId }: UseEditorProps) => {
  const { saveFile, fileTree: files = [] } = useFileTree()
  const { terminalRef, dockRef, gridRef } = useEditorContext()
  const { creatingTerminal, createNewTerminal } = useTerminal()
  const draft = useAppStore((s) => s.drafts[fileId ?? ""])
  const { data: serverFileContent = "" } = fileRouter.fileContent.useQuery({
    enabled: !!fileId,
    variables: { fileId, projectId },
    select(data) {
      return data.data
    },
  })
  // Editor state - Locally managed
  const [editorRef, setEditorRef] = useState<
    monaco.editor.IStandaloneCodeEditor | undefined
  >(undefined)
  const [cursorLine, setCursorLine] = useState(0)
  const [isSelected, setIsSelected] = useState(false)
  const [showSuggestion, setShowSuggestion] = useState(false)
  const { socket } = useSocket()

  // AI Copilot state
  const [generate, setGenerate] = useState<GenerateState>({
    show: false,
    line: 0,
    id: "",
    widget: undefined,
    pref: [],
    width: 0,
  })

  const [decorations, setDecorations] = useState<DecorationsState>({
    options: [],
    instance: undefined,
  })

  // Refs
  const monacoRef = useRef<typeof monaco | null>(null)
  const generateRef = useRef<HTMLDivElement>(null)
  const suggestionRef = useRef<HTMLDivElement>(null)
  const generateWidgetRef = useRef<HTMLDivElement>(null)
  const lastCopiedRangeRef = useRef<{
    startLine: number
    endLine: number
  } | null>(null)

  // Debounced selection handler
  const debouncedSetIsSelected = useRef(
    debounce((value: boolean) => {
      setIsSelected(value)
    }, 800),
  ).current

  // Helper function to fetch file content
  const fetchFileContent = useCallback(
    (fileId: string): Promise<string> => {
      if (!socket) return Promise.resolve("")
      return new Promise((resolve) => {
        socket.emit("getFile", { fileId }, (content: string) => {
          resolve(content)
        })
      })
    },
    [socket],
  )

  // Load and merge TSConfig
  const loadTSConfig = useCallback(
    async (
      files: Parameters<typeof loadAndApplyTSConfig>[0],
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof monaco,
    ) => {
      await loadAndApplyTSConfig(files, monacoInstance, fetchFileContent)

      // Track cursor selection for AIChat context
      editor.onDidChangeCursorSelection(() => {
        const selection = editor.getSelection()
        if (!selection) return
        lastCopiedRangeRef.current = {
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
        }
      })
    },
    [fetchFileContent],
  )

  // Pre-mount editor keybindings
  const handleEditorWillMount: BeforeMount = useCallback((monaco) => {
    configureEditorKeybindings(monaco)
  }, [])

  // AI edit handler
  const handleAiEdit = useCallback(
    (editor?: monaco.editor.ICodeEditor) => {
      const e = editor ?? editorRef
      if (!e || typeof e.getSelection !== "function") return

      const selection = e.getSelection()
      if (!selection) return

      const pos = selection.getPosition()
      const start = selection.getStartPosition()
      const end = selection.getEndPosition()
      let pref: monaco.editor.ContentWidgetPositionPreference
      let id = ""
      const isMultiline = start.lineNumber !== end.lineNumber

      if (isMultiline) {
        if (pos.lineNumber <= start.lineNumber) {
          pref = monaco.editor.ContentWidgetPositionPreference.ABOVE
        } else {
          pref = monaco.editor.ContentWidgetPositionPreference.BELOW
        }
      } else {
        pref = monaco.editor.ContentWidgetPositionPreference.ABOVE
      }

      e.changeViewZones(function (changeAccessor) {
        if (!generateRef.current) return
        if (pref === monaco.editor.ContentWidgetPositionPreference.ABOVE) {
          id = changeAccessor.addZone({
            afterLineNumber: start.lineNumber - 1,
            heightInLines: 2,
            domNode: generateRef.current,
          })
        }
      })

      setGenerate((prev) => {
        return {
          ...prev,
          show: true,
          pref: [pref],
          id,
        }
      })
    },
    [editorRef, generateRef, setGenerate],
  )

  // Post-mount editor keybindings and actions
  const handleEditorMount: OnMount = useCallback(
    async (editor, monaco) => {
      setEditorRef(editor)
      monacoRef.current = monaco

      /**
       * Sync all the models to the worker eagerly.
       * This enables intelliSense for all files without needing an `addExtraLib` call.
       */
      monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)
      monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true)

      monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
        defaultCompilerOptions,
      )
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
        defaultCompilerOptions,
      )

      // Set up editor event handlers (register before loadTSConfig which may be async)
      editor.onDidChangeCursorPosition((e) => {
        setIsSelected(false)
        const selection = editor.getSelection()
        if (selection !== null) {
          const hasSelection = !selection.isEmpty()
          debouncedSetIsSelected(hasSelection)
          setShowSuggestion(hasSelection)
        }
        const { column, lineNumber } = e.position
        if (lineNumber === cursorLine) return
        setCursorLine(lineNumber)

        const model = editor.getModel()
        const endColumn = model?.getLineContent(lineNumber).length || 0

        setDecorations((prev) => {
          return {
            ...prev,
            options: [
              {
                range: new monaco.Range(
                  lineNumber,
                  column,
                  lineNumber,
                  endColumn,
                ),
                options: {
                  afterContentClassName: "inline-decoration",
                },
              },
            ],
          }
        })
      })

      editor.onDidBlurEditorText(() => {
        setDecorations((prev) => {
          return {
            ...prev,
            options: [],
          }
        })
      })

      editor.addAction({
        id: "generate",
        label: "Generate",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG],
        precondition:
          "editorTextFocus && !suggestWidgetVisible && !renameInputVisible && !inSnippetMode && !quickFixWidgetVisible",
        run: (editor) => handleAiEdit(editor),
      })

      // Load TSConfig async (non-blocking — cursor handlers already registered above)
      await loadTSConfig(files, editor, monaco)
    },
    [files, loadTSConfig, cursorLine, handleAiEdit, debouncedSetIsSelected],
  )

  // Editor shortcuts effect
  useEffect(() => {
    if (editorRef && monacoRef.current) {
      enableEditorShortcuts({
        monaco: editorRef,
        gridRef,
        terminalRef,
        dockRef,
        isCreatingTerminal: creatingTerminal,
        createNewTerminal,
        saveFile: () => {
          if (draft == undefined || serverFileContent === draft) return
          saveFile({
            fileId,
            projectId,
            content: draft,
          })
        },
      })
    }
  }, [
    editorRef,
    fileId,
    saveFile,
    gridRef,
    terminalRef,
    dockRef,
    draft,
    serverFileContent,
    creatingTerminal,
  ])

  // Widget effects (extracted into useEditorWidgets.ts)
  useGenerateWidgetEffect(
    editorRef,
    generate,
    setGenerate,
    cursorLine,
    generateRef,
    generateWidgetRef,
    setShowSuggestion,
  )
  useSuggestionWidgetEffect(editorRef, isSelected, suggestionRef)

  // Decorations effect for generate widget tips
  useEffect(() => {
    if (decorations.options.length === 0) {
      decorations.instance?.clear()
    }

    const model = editorRef?.getModel()
    // added this because it was giving client side exception - Illegal value for lineNumber when opening an empty file
    if (model) {
      const totalLines = model.getLineCount()
      // Check if the cursorLine is a valid number, If cursorLine is out of bounds, we fall back to 1 (the first line) as a default safe value.
      const lineNumber =
        cursorLine > 0 && cursorLine <= totalLines ? cursorLine : 1 // fallback to a valid line number
      // If for some reason the content doesn't exist, we use an empty string as a fallback.
      const line = model.getLineContent(lineNumber) ?? ""
      // Check if the line is not empty or only whitespace (i.e., `.trim()` removes spaces).
      // If the line has content, we clear any decorations using the instance of the `decorations` object.
      // Decorations refer to editor highlights, underlines, or markers, so this clears those if conditions are met.
      if (line.trim() !== "") {
        decorations.instance?.clear()
        return
      }
    }

    if (decorations.instance) {
      decorations.instance.set(decorations.options)
    } else {
      const instance = editorRef?.createDecorationsCollection()
      instance?.set(decorations.options)

      setDecorations((prev) => {
        return {
          ...prev,
          instance,
        }
      })
    }
  }, [decorations.options, cursorLine, editorRef])

  return {
    // Editor state
    editorRef,
    monacoRef,
    cursorLine,
    isSelected,
    showSuggestion,

    // Generate/AI state
    generate,
    setGenerate,
    decorations,
    setDecorations,

    // Refs
    generateRef,
    suggestionRef,
    generateWidgetRef,
    lastCopiedRangeRef,

    // Handlers
    handleEditorWillMount,
    handleEditorMount,
    handleAiEdit,

    // Internal setters
    setEditorRef,
    setCursorLine,
    setIsSelected,
    setShowSuggestion,
  }
}
