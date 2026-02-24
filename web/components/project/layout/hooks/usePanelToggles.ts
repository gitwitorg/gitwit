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
  const { gridRef, terminalRef } = useEditor()
  const { creatingTerminal, createNewTerminal } = useTerminal()
  const { isReady: isSocketReady } = useSocket()

  return useCallback(() => {
    const panel = gridRef.current?.getPanel("terminal")
    if (!panel) return

    const isVisible = panel.api.isVisible
    panel.api.setVisible(!isVisible)

    if (!isVisible && isSocketReady) {
      const existingTerminals = Boolean(terminalRef.current?.panels.length)
      if (!existingTerminals && !creatingTerminal) {
        createNewTerminal().then((id) => {
          if (!id) return
          const ref = terminalRef.current
          if (ref?.getPanel(`terminal-${id}`)) return
          ref?.addPanel({
            id: `terminal-${id}`,
            component: "terminal",
            title: "Shell",
            tabComponent: "terminal",
          })
        })
      }
    }
  }, [gridRef, terminalRef, isSocketReady, creatingTerminal, createNewTerminal])
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
