import { useEditor } from "@/context/editor-context"
import { useSocket } from "@/context/SocketContext"
import { useTerminal } from "@/context/TerminalContext"
import { useCallback } from "react"

export function useToggleSidebar() {
  const { gridRef } = useEditor()
  return useCallback(() => {
    const panel = gridRef.current?.getPanel("sidebar")
    if (panel) {
      panel.api.setVisible(!panel.api.isVisible)
    }
  }, [gridRef])
}

export function useToggleTerminal() {
  const { gridRef, terminalRef, dockRef } = useEditor()
  const { creatingTerminal, createNewTerminal } = useTerminal()
  const { isReady: isSocketReady } = useSocket()

  return useCallback(() => {
    const panel = gridRef.current?.getPanel("terminal")
    if (!panel) return

    const isVisible = panel.api.isVisible
    panel.api.setVisible(!isVisible)

    if (!isVisible && isSocketReady) {
      const ref = terminalRef.current
      const dock = dockRef.current
      const existingInTerminal = ref?.panels.length ?? 0
      const existingInDock = dock?.panels.filter((p) => p.id.startsWith("terminal-")).length ?? 0
      if (existingInTerminal === 0 && existingInDock === 0 && !creatingTerminal) {
        createNewTerminal().then((id) => {
          if (!id) return
          const panelId = `terminal-${id}`
          if (ref?.getPanel(panelId) || dock?.getPanel(panelId)) return
          ref?.addPanel({
            id: panelId,
            component: "terminal",
            title: "Shell",
            tabComponent: "terminal",
          })
        })
      }
    }
  }, [gridRef, terminalRef, dockRef, isSocketReady, creatingTerminal, createNewTerminal])
}

export function useToggleChat() {
  const { gridRef } = useEditor()
  return useCallback(() => {
    const panel = gridRef.current?.getPanel("chat")
    if (panel) {
      panel.api.setVisible(!panel.api.isVisible)
    }
  }, [gridRef])
}
