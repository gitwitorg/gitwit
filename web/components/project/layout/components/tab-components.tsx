import { useFileTree } from "@/components/project/hooks/useFile"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useEditor } from "@/context/editor-context"
import { useProjectContext } from "@/context/project-context"
import { useTerminal } from "@/context/TerminalContext"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/context"
import { DockviewPanelApi, IDockviewPanelHeaderProps } from "dockview"
import { SquareTerminal, TvMinimal, XIcon } from "lucide-react"
import Image from "next/image"
import React from "react"
import { getIconForFile } from "vscode-icons-js"
import { EditorPanelParams } from "./editor-panel"
const DEFAULT_FILE_ICON = "/icons/default_file.svg"

export const tabComponents = {
  editor: (props: IDockviewPanelHeaderProps<EditorPanelParams>) => {
    const {
      api,
      params: { saved },
    } = props
    const title = api.title
    const draft = useAppStore((s) => s.drafts[api.id])
    const {
      project: { id: projectId },
    } = useProjectContext()
    const setDraft = useAppStore((s) => s.setDraft)
    const [imgSrc, setImgSrc] = React.useState(() =>
      title ? `/icons/${getIconForFile(title)}` : `/icons/plaintext.svg`,
    )
    const { saveFile: rawSaveFile } = useFileTree()

    const [alertOpen, setAlertOpen] = React.useState(false)
    const saveFile = React.useCallback(() => {
      rawSaveFile(
        {
          fileId: api.id,
          projectId,
          content: draft || "",
        },
        {
          onSuccess: () => {
            api.close()
          },
        },
      )

      setAlertOpen(false)
    }, [draft, projectId, api.id, rawSaveFile])
    const cancel = React.useCallback(() => {
      setAlertOpen(false)
    }, [])
    const resetDraft = React.useCallback(() => {
      setDraft(api.id, undefined)
      api.close()
    }, [api.id, setDraft])
    const handleImageError = React.useCallback(() => {
      setImgSrc(DEFAULT_FILE_ICON)
    }, [])
    const closeActionOverride = React.useCallback(() => {
      if (draft !== undefined) {
        // There are unsaved changes
        setAlertOpen(true)
      } else {
        api.close()
      }
    }, [api, draft])
    return (
      <>
        <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Do you want to save the changes you made to {title}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your changes will be lost if you don't save them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancel}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={resetDraft}>
                Don't save
              </AlertDialogAction>
              <AlertDialogAction onClick={saveFile}>Save</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DockviewDefaultTab
          {...props}
          icon={
            <Image
              src={imgSrc}
              alt="File Icon"
              width={14}
              height={14}
              onError={handleImageError}
            />
          }
          saved={saved}
          closeActionOverride={closeActionOverride}
        />
      </>
    )
  },
  terminal: (props: IDockviewPanelHeaderProps) => {
    const { gridRef, terminalRef } = useEditor()
    const { api } = props
    const terminalId = api.id.split("-")[1] // Extract terminal ID from panel ID

    const { terminals, closeTerminal, setActiveTerminalId, isPreviewTerminal } =
      useTerminal()
    const isPreview = isPreviewTerminal(terminalId)
    const closeActionOverride = React.useCallback(() => {
      if (isPreview) return // Preview terminal can only be closed via Stop
      const terminal = terminals.find((t) => t.id === terminalId)
      if (terminal?.terminal) {
        terminal.terminal.dispose()
      }

      api.close()
      if (terminalRef.current?.panels.length === 1) {
        const terminalGridPanel = gridRef.current?.getPanel("terminal")
        if (terminalGridPanel) {
          terminalGridPanel.api.setVisible(false)
        }
      }
      closeTerminal(terminalId)
    }, [
      api,
      terminalId,
      terminals,
      closeTerminal,
      gridRef,
      terminalRef,
      isPreview,
    ])
    return (
      <DockviewDefaultTab
        {...props}
        title="Shell"
        closeActionOverride={closeActionOverride}
        icon={<SquareTerminal className="size-3.5" />}
        hideClose={isPreview}
      />
    )
  },
  preview: (props: IDockviewPanelHeaderProps) => {
    return (
      <DockviewDefaultTab
        {...props}
        title="Preview"
        icon={<TvMinimal className="size-3.5" />}
      />
    )
  },
}

function useTitle(api: DockviewPanelApi): string | undefined {
  const [title, setTitle] = React.useState<string | undefined>(api.title)

  React.useEffect(() => {
    const disposable = api.onDidTitleChange((event) => {
      setTitle(event.title)
    })

    // Depending on the order in which React effects are run, the title may already be out of sync (cf. issue #1003).
    if (title !== api.title) {
      setTitle(api.title)
    }

    return () => {
      disposable.dispose()
    }
  }, [api])

  return title
}

export type IDockviewDefaultTabProps = IDockviewPanelHeaderProps &
  React.HtmlHTMLAttributes<HTMLDivElement> & {
    hideClose?: boolean
    closeActionOverride?: () => void
    icon: React.ReactNode
    saved?: boolean
  }

export const DockviewDefaultTab: React.FunctionComponent<
  IDockviewDefaultTabProps
> = ({
  api,
  containerApi: _containerApi,
  params: _params,
  icon,
  saved = true,
  hideClose,
  closeActionOverride,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  tabLocation,
  ...rest
}) => {
  const title = useTitle(api)

  const isMiddleMouseButton = React.useRef<boolean>(false)

  const onClose = React.useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      event.preventDefault()

      if (closeActionOverride) {
        closeActionOverride()
      } else {
        api.close()
      }
    },
    [api, closeActionOverride],
  )

  const onBtnPointerDown = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
  }, [])

  const _onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      isMiddleMouseButton.current = event.button === 1
      onPointerDown?.(event)
    },
    [onPointerDown],
  )

  const _onPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isMiddleMouseButton && event.button === 1 && !hideClose) {
        isMiddleMouseButton.current = false
        onClose(event)
      }

      onPointerUp?.(event)
    },
    [onPointerUp, onClose, hideClose],
  )

  const _onPointerLeave = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      isMiddleMouseButton.current = false
      onPointerLeave?.(event)
    },
    [onPointerLeave],
  )

  return (
    <div
      data-testid="dockview-dv-default-tab flex item-center"
      {...rest}
      onPointerDown={_onPointerDown}
      onPointerUp={_onPointerUp}
      onPointerLeave={_onPointerLeave}
      className="dv-default-tab"
    >
      <div className="flex items-center gap-1">
        {icon}
        <span className="dv-default-tab-content text-xs">{title}</span>
      </div>
      {!hideClose && (
        <div
          className={cn(
            "dv-default-tab-action group",

            !saved && "!visible",
          )}
          onPointerDown={onBtnPointerDown}
          onClick={onClose}
        >
          {saved ? (
            <XIcon className="size-3" />
          ) : (
            <>
              <XIcon className="size-3 group-hover:block hidden" />
              <div className="group-hover:hidden grid place-items-center size-3">
                <div className="size-2 rounded-full bg-foreground" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
