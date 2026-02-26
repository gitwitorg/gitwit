"use client"

import { DockviewApi, GridviewApi } from "dockview"
import * as monaco from "monaco-editor"
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { ImperativePanelHandle } from "react-resizable-panels"

// --- Editor Handlers (per-file handler registry) ---

interface EditorHandlers {
  handleApplyCode: (
    mergedCode: string,
    originalCode: string,
  ) => monaco.editor.IEditorDecorationsCollection | null
  editorRef: monaco.editor.IStandaloneCodeEditor | null
  hasActiveWidgets: () => boolean
  acceptAll: () => void
  rejectAll: () => void
  forceClearAllDecorations: () => void
}

// --- Merged context type ---

interface EditorContextType {
  // Dockview refs (from ContainerContext)
  gridRef: React.MutableRefObject<GridviewApi | undefined>
  dockRef: React.MutableRefObject<DockviewApi | undefined>
  terminalRef: React.MutableRefObject<DockviewApi | undefined>

  // Layout state (from EditorLayoutContext)
  isHorizontalLayout: boolean
  isPreviewCollapsed: boolean
  isAIChatOpen: boolean
  previewURL: string
  togglePreviewPanel: () => void
  toggleLayout: () => void
  toggleAIChat: () => void
  loadPreviewURL: (url: string | null) => void
  setIsAIChatOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsPreviewCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  previewPanelRef: React.RefObject<ImperativePanelHandle>

  // Handler registry (from EditorHandlersContext)
  registerHandlers: (fileId: string, handlers: EditorHandlers) => void
  unregisterHandlers: (fileId: string) => void
  getHandlers: (fileId: string) => EditorHandlers | undefined
}

const EditorContext = createContext<EditorContextType | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  // Dockview refs
  const gridRef = useRef<GridviewApi>()
  const dockRef = useRef<DockviewApi>()
  const terminalRef = useRef<DockviewApi>()

  // Layout state
  const [isHorizontalLayout, setIsHorizontalLayout] = useState(false)
  const [previousLayout, setPreviousLayout] = useState(false)
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(true)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [previewURL, setPreviewURL] = useState("")
  const previewPanelRef = useRef<ImperativePanelHandle>(null)

  const togglePreviewPanel = useCallback(() => {
    if (isPreviewCollapsed) {
      previewPanelRef.current?.expand()
      setIsPreviewCollapsed(false)
    } else {
      previewPanelRef.current?.collapse()
      setIsPreviewCollapsed(true)
    }
  }, [isPreviewCollapsed])

  const toggleLayout = useCallback(() => {
    if (!isAIChatOpen) {
      setIsHorizontalLayout((prev) => !prev)
    }
  }, [isAIChatOpen])

  const toggleAIChat = useCallback(() => {
    const chatPanel = gridRef.current?.getPanel("chat")
    if (chatPanel) {
      const isVisible = chatPanel.api.isVisible
      chatPanel.api.setVisible(!isVisible)
    }
    setIsAIChatOpen((prev) => !prev)
  }, [gridRef])

  useEffect(() => {
    if (isAIChatOpen) {
      setPreviousLayout(isHorizontalLayout)
      setIsHorizontalLayout(true)
    } else {
      setIsHorizontalLayout(previousLayout)
    }
  }, [isAIChatOpen, previousLayout])

  const loadPreviewURL = useCallback((url: string | null) => {
    setPreviewURL(url ?? "")
  }, [])

  // Handler registry
  const handlersMap = useRef<Map<string, EditorHandlers>>(new Map())

  const registerHandlers = useCallback(
    (fileId: string, handlers: EditorHandlers) => {
      handlersMap.current.set(fileId, handlers)
    },
    [],
  )

  const unregisterHandlers = useCallback((fileId: string) => {
    handlersMap.current.delete(fileId)
  }, [])

  const getHandlers = useCallback((fileId: string) => {
    return handlersMap.current.get(fileId)
  }, [])

  return (
    <EditorContext.Provider
      value={{
        gridRef,
        dockRef,
        terminalRef,
        isHorizontalLayout,
        isPreviewCollapsed,
        isAIChatOpen,
        previewURL,
        togglePreviewPanel,
        toggleLayout,
        toggleAIChat,
        loadPreviewURL,
        setIsAIChatOpen,
        setIsPreviewCollapsed,
        previewPanelRef,
        registerHandlers,
        unregisterHandlers,
        getHandlers,
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}

export function useEditor() {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider")
  }
  return context
}
