import { useEditor } from "@/context/editor-context"
import { useSocket } from "@/context/SocketContext"
import { useCallback, useEffect } from "react"
import { toast } from "sonner"

export const useEditorSocket = () => {
  const { socket } = useSocket()
  const { dockRef, loadPreviewURL } = useEditor()

  const openOrUpdatePreviewPanel = useCallback(
    (url: string) => {
      const previewPanel = dockRef.current?.getPanel("preview")
      if (previewPanel) {
        previewPanel.api.updateParameters({ src: url })
        previewPanel.api.setActive()
        return
      }

      const groups = dockRef.current?.groups
      if (groups?.length === 1) {
        dockRef.current?.addPanel({
          id: "preview",
          component: "preview",
          title: "Preview",
          tabComponent: "preview",
          params: { src: url },
          renderer: "always",
          position: {
            referenceGroup: groups[0].id,
            direction: "right",
          },
        })
      } else {
        dockRef.current?.addPanel({
          id: "preview",
          component: "preview",
          title: "Preview",
          renderer: "always",
          tabComponent: "preview",
          params: { src: url },
        })
      }
    },
    [dockRef],
  )

  const handlePreviewState = useCallback(
    ({ url }: { url: string | null; runTerminalId: string | null }) => {
      loadPreviewURL(url)
      if (url) {
        openOrUpdatePreviewPanel(url)
      } else {
        const previewPanel = dockRef.current?.getPanel("preview")
        previewPanel?.api.close()
      }
    },
    [loadPreviewURL, openOrUpdatePreviewPanel, dockRef],
  )

  // Register socket event listeners
  useEffect(() => {
    if (!socket) return

    const onError = (message: string) => {
      toast.error(message)
    }

    socket.on("error", onError)
    socket.on("previewState", handlePreviewState)

    return () => {
      socket.off("error", onError)
      socket.off("previewState", handlePreviewState)
    }
  }, [socket, handlePreviewState])

  return {
    socket,
  }
}
