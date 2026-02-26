import { useEditor } from "@/context/editor-context"
import { useSocket } from "@/context/SocketContext"
import { useTerminal } from "@/context/TerminalContext"
import {
  DockviewDidDropEvent,
  DockviewDndOverlayEvent,
  DockviewReact,
  GridviewReact,
  IDockviewPanelProps,
  IGridviewPanelProps,
  Orientation,
  themeDark,
  themeLight,
} from "dockview"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useRef, type FunctionComponent } from "react"
import { useEditorSocket } from "../hooks/useEditorSocket"
import { ChatPanel } from "./components/chat-panel"
import { EditorPanel } from "./components/editor-panel"
import { PreviewPanel } from "./components/preview-panel"
import { TerminalRightHeaderActions } from "./components/right-header-actions"
import { SideBarPanel } from "./components/sidebar-panel"
import { tabComponents } from "./components/tab-components"
import { TerminalPanel } from "./components/terminal-panel"
import { MainWatermark, TerminalWatermark } from "./components/watermark"
import { useChatPanelHandlers } from "./hooks/useChatPanelHandlers"
import { handleTerminalDrop, loadDefaultGridviewLayout } from "./utils"
import { useGlobalShortcut } from "./utils/shortcuts"

type PanelCollection<T> = Record<string, FunctionComponent<T>>

interface DockProps {}

export function Dock(_props: DockProps) {
  const { resolvedTheme } = useTheme()
  const { gridRef, dockRef, terminalRef } = useEditor()
  const { isReady: isSocketReady } = useSocket()
  const { terminals, creatingTerminal, createNewTerminal } = useTerminal()
  const prevTerminalIdsRef = useRef<Set<string>>(new Set())
  const hasAttemptedInitialCreateRef = useRef(false)
  const chatHandlers = useChatPanelHandlers()

  useEditorSocket()
  useGlobalShortcut()

  // Handler to accept drag events from file explorer and terminal panels
  const handleDockUnhandledDragOver = useCallback(
    (event: DockviewDndOverlayEvent) => {
      // Accept all drags - this allows dropping into empty containers
      event.accept()
    },
    [],
  )

  // Handler for terminal panel drops from terminal container to dock
  const handleDockDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      const result = handleTerminalDrop({
        event,
        sourceContainerRef: terminalRef,
        targetContainerRef: dockRef,
      })

      if (result.handled) {
        // Terminal was moved from terminal dock to somewhere else → hide terminal dock when empty
        queueMicrotask(() => {
          if (terminalRef.current?.panels.length === 0) {
            gridRef.current?.getPanel("terminal")?.api.setVisible(false)
          }
        })
      }
    },
    [terminalRef, dockRef, gridRef],
  )

  // Handler for terminal panel drops from dock back to terminal container
  const handleTerminalDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      const result = handleTerminalDrop({
        event,
        sourceContainerRef: dockRef,
        targetContainerRef: terminalRef,
      })

      if (result.handled) {
        // Drop handled
      }
    },
    [dockRef, terminalRef],
  )

  // Sync terminal tabs to dock panels. Run when terminals change or when either dock becomes ready (avoids refresh race).
  const syncTerminalPanels = useCallback(() => {
    if (terminals.length === 0) return
    const ref = terminalRef.current
    const dock = dockRef.current
    if (!ref || !dock) return
    terminals.forEach((term) => {
      const id = `terminal-${term.id}`
      if (!ref.getPanel(id) && !dock.getPanel(id)) {
        ref.addPanel({
          id,
          component: "terminal",
          title: "Shell",
          tabComponent: "terminal",
        })
      }
    })
    const hasPanelsInTerminalDock = ref.panels.length > 0
    const allInMainDock = terminals.every((t) => dock.getPanel(`terminal-${t.id}`) != null)
    const terminalGridPanel = gridRef.current?.getPanel("terminal")
    if (
      terminalGridPanel &&
      !terminalGridPanel.api.isVisible &&
      hasPanelsInTerminalDock &&
      !allInMainDock
    ) {
      terminalGridPanel.api.setVisible(true)
    }
  }, [terminals, gridRef, terminalRef, dockRef])

  // components
  const dockComponents: PanelCollection<IDockviewPanelProps> = {
    terminal: TerminalPanel,
    editor: EditorPanel,
    preview: PreviewPanel,
  }
  const terminalComponents: PanelCollection<IDockviewPanelProps> = {
    terminal: TerminalPanel,
  }
  const gridComponents: PanelCollection<IGridviewPanelProps> = {
    dock: (_props: IGridviewPanelProps) => {
      const { resolvedTheme } = useTheme()

      return (
        <DockviewReact
          theme={resolvedTheme === "dark" ? themeDark : themeLight}
          tabComponents={tabComponents}
          watermarkComponent={MainWatermark}
          components={dockComponents}
          onReady={(event) => {
            dockRef.current = event.api
            event.api.onUnhandledDragOverEvent(handleDockUnhandledDragOver)
            syncTerminalPanels()
          }}
          onDidDrop={handleDockDidDrop}
        />
      )
    },

    terminal: (_props: IGridviewPanelProps) => {
      const { resolvedTheme } = useTheme()

      return (
        <DockviewReact
          theme={resolvedTheme === "dark" ? themeDark : themeLight}
          tabComponents={tabComponents}
          watermarkComponent={TerminalWatermark}
          components={terminalComponents}
          rightHeaderActionsComponent={TerminalRightHeaderActions}
          onReady={(event) => {
            terminalRef.current = event.api
            event.api.onUnhandledDragOverEvent(handleDockUnhandledDragOver)
            syncTerminalPanels()
          }}
          onDidDrop={handleTerminalDidDrop}
        />
      )
    },
    sidebar: SideBarPanel,
    chat: (props: IGridviewPanelProps) => (
      <ChatPanel
        {...props}
        params={{
          onApplyCode: chatHandlers.onApplyCode,
          onRejectCode: chatHandlers.onRejectCode,
          precomputeMergeForFile: chatHandlers.precomputeMergeForFile,
          applyPrecomputedMerge: chatHandlers.applyPrecomputedMerge,
          restoreOriginalFile: chatHandlers.restoreOriginalFile,
          getCurrentFileContent: chatHandlers.getCurrentFileContent,
          onOpenFile: chatHandlers.onOpenFile,
        }}
      />
    ),
  }

  useEffect(() => {
    if (resolvedTheme) {
      gridRef.current
        ?.getPanel("dock")
        ?.api.updateParameters({ theme: resolvedTheme })
    }
  }, [resolvedTheme, gridRef])

  // Create one terminal on first load only if project has none (once per session; don't auto-create after user closes last tab)
  useEffect(() => {
    if (!isSocketReady || hasAttemptedInitialCreateRef.current) return
    const t = setTimeout(() => {
      hasAttemptedInitialCreateRef.current = true
      if (creatingTerminal || terminals.length > 0) return
      if (!terminalRef.current) return
      if (terminalRef.current.panels.length > 0) return
      createNewTerminal().then((id) => {
        if (!id) return
        const ref = terminalRef.current
        const dock = dockRef.current
        const panelId = `terminal-${id}`
        if (ref?.getPanel(panelId) || dock?.getPanel(panelId)) return
        ref?.addPanel({
          id: panelId,
          component: "terminal",
          title: "Shell",
          tabComponent: "terminal",
        })
      })
    }, 400)
    return () => clearTimeout(t)
  }, [isSocketReady, terminals.length, creatingTerminal])

  useEffect(() => {
    syncTerminalPanels()
  }, [syncTerminalPanels])

  // When a terminal is removed (e.g. terminalClosed from server), close its panel in both containers so tabs stay in sync
  useEffect(() => {
    const ref = terminalRef.current
    const dock = dockRef.current
    if (!ref) return
    const currentIds = new Set(terminals.map((t) => t.id))
    prevTerminalIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        const panelId = `terminal-${id}`
        ref.getPanel(panelId)?.api.close()
        dock?.getPanel(panelId)?.api.close()
      }
    })
    prevTerminalIdsRef.current = currentIds
    if (terminals.length === 0 && gridRef.current) {
      const terminalGridPanel = gridRef.current.getPanel("terminal")
      if (terminalGridPanel?.api.isVisible) {
        terminalGridPanel.api.setVisible(false)
      }
    }
  }, [terminals, terminalRef, dockRef, gridRef])

  return (
    <div className="max-h-full overflow-hidden w-full h-full">
      <GridviewReact
        orientation={Orientation.HORIZONTAL}
        components={gridComponents}
        className={
          (resolvedTheme === "dark" ? themeDark : themeLight).className
        }
        proportionalLayout={false}
        onReady={(event) => {
          gridRef.current = event.api
          loadDefaultGridviewLayout({
            grid: event.api,
          })
        }}
      />
    </div>
  )
}
