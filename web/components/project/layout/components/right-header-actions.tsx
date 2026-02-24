"use client"

import { Button } from "@/components/ui/button"
import { useEditor } from "@/context/editor-context"
import { useSocket } from "@/context/SocketContext"
import { useTerminal } from "@/context/TerminalContext"
import { MAX_TERMINALS } from "@/lib/constants"
import { IDockviewHeaderActionsProps } from "dockview"
import { Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

/**
 * Right header actions component for Dockview groups.
 * Shows a plus button specifically for the terminal group to add new terminal tabs.
 */
export function TerminalRightHeaderActions(props: IDockviewHeaderActionsProps) {
  const { group, containerApi } = props
  const { dockRef } = useEditor()
  const { isReady: isSocketReady } = useSocket()

  const { createNewTerminal } = useTerminal()
  const [isCreating, setIsCreating] = useState(false)

  const handleAddTerminal = () => {
    // Count existing terminal panels across this container and the dock (user may have moved some)
    const here = containerApi.panels.filter((p) => p.id.startsWith("terminal-")).length
    const inDock = dockRef.current?.panels.filter((p) => p.id.startsWith("terminal-")).length ?? 0
    if (here + inDock >= MAX_TERMINALS) {
      toast.error("You reached the maximum # of terminals.")
      return
    }

    setIsCreating(true)
    createNewTerminal()
      .then((id) => {
        if (!id) return
        const panelId = `terminal-${id}`
        if (containerApi.getPanel(panelId) || dockRef.current?.getPanel(panelId)) return
        containerApi.addPanel({
          id: panelId,
          component: "terminal",
          title: "Shell",
          tabComponent: "terminal",
          params: {
            terminalRef: { current: containerApi },
          },
          position: {
            referenceGroup: group.id,
          },
        })
      })
      .finally(() => {
        setIsCreating(false)
      })
  }

  return (
    <div className="flex items-center h-full px-1">
      <Button
        onClick={handleAddTerminal}
        size="smIcon"
        variant="ghost"
        className="h-6 w-6 p-0 hover:bg-muted"
        title="New Terminal"
        disabled={isCreating || !isSocketReady}
      >
        {isCreating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
