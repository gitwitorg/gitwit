"use client"

import { useSocket } from "@/context/SocketContext"
import { useTerminal } from "@/context/TerminalContext"
import { Terminal } from "@xterm/xterm"
import { IDockviewPanelProps } from "dockview"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import EditorTerminal from "../../terminals/terminal"

export interface TerminalPanelParams {}

export function TerminalPanel(props: IDockviewPanelProps<TerminalPanelParams>) {
  const terminalId = props.api.id.split("-")[1] // Extract terminal ID from panel ID
  const { terminals, setTerminals } = useTerminal()
  const { socket, isReady } = useSocket()

  const term = terminals.find((t) => t.id === terminalId)

  const [isActive, setIsActive] = useState(() => props.api.isActive)
  useEffect(() => {
    const disposable = props.api.onDidActiveChange(() => {
      setIsActive(props.api.isActive)
    })
    return () => disposable.dispose()
  }, [props.api])

  // Auto-focus terminal when it becomes active
  useEffect(() => {
    if (term && isActive) {
      term.terminal?.focus()
    }
  }, [term, isActive])

  if (!term || !socket || !isReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Connecting to terminal...</span>
        </div>
      </div>
    )
  }

  return (
    <EditorTerminal
      socket={socket}
      id={term.id}
      term={term.terminal}
      setTerm={(t: Terminal) => {
        setTerminals((prev) =>
          prev.map((term) =>
            term.id === terminalId ? { ...term, terminal: t } : term,
          ),
        )
      }}
      visible
      isActive={isActive}
      initialScreen={term.initialScreen}
    />
  )
}
