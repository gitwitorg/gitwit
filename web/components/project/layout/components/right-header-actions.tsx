"use client"

import { Button } from "@/components/ui/button"
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
  const { isReady: isSocketReady } = useSocket()

  const { createNewTerminal } = useTerminal()
  const [isCreating, setIsCreating] = useState(false)

  const handleAddTerminal = () => {
    // Count existing terminal panels across all groups
    const allTerminalPanels = containerApi.panels.filter((p) =>
      p.id.startsWith("terminal-"),
    )

    // Check max terminals limit
    if (allTerminalPanels.length >= MAX_TERMINALS) {
      toast.error("You reached the maximum # of terminals.")
      return
    }

    setIsCreating(true)
    createNewTerminal()
      .then((id) => {
        if (!id) return
        containerApi.addPanel({
          id: `terminal-${id}`,
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
