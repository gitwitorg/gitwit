"use client"

import { Button } from "@/components/ui/button"
import { useEditor } from "@/context/editor-context"
import { useTerminal } from "@/context/TerminalContext"
import { Sandbox } from "@/lib/types"
import { templateConfigs } from "@gitwit/templates"
import { LoaderCircle, Play, StopCircle } from "lucide-react"
import { toast } from "sonner"

export default function RunButtonModal({
  isRunning,
  sandboxData,
}: {
  isRunning: boolean
  sandboxData: Sandbox
}) {
  const { gridRef } = useEditor()
  const {
    createNewTerminal,
    stopPreview,
    terminals,
    creatingTerminal,
    closingTerminal,
  } = useTerminal()
  const isTransitioning = creatingTerminal || !!closingTerminal

  const handleRun = async () => {
    if (isTransitioning) return

    if (isRunning) {
      stopPreview()
      return
    }

    if (terminals.length >= 4) {
      toast.error("You've reached the maximum number of terminals.")
      return
    }

    const command =
      templateConfigs[sandboxData.type]?.runCommand || "npm run dev"
    try {
      const terminalPanel = gridRef.current?.getPanel("terminal")
      if (terminalPanel && !terminalPanel.api.isVisible) {
        terminalPanel.api.setVisible(true)
      }

      await createNewTerminal(command)
      // Panel is added by the sync effect in terminals/index when state updates
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create terminal",
      )
    }
  }

  return (
    <Button variant="outline" onClick={handleRun} disabled={isTransitioning}>
      {isTransitioning ? (
        <LoaderCircle className="size-4 mr-2 animate-spin" />
      ) : isRunning ? (
        <StopCircle className="size-4 mr-2" />
      ) : (
        <Play className="size-4 mr-2" />
      )}
      {isRunning ? "Stop" : "Run"}
    </Button>
  )
}
