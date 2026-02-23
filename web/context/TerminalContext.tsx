"use client"

import { useSocket } from "@/context/SocketContext"
import {
  closeTerminal as closeTerminalHelper,
  createTerminal as createTerminalHelper,
  stopPreview as stopPreviewApi,
} from "@/lib/api/terminal"
import { MAX_TERMINALS } from "@/lib/constants"
import { Terminal } from "@xterm/xterm"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

// Grace period in ms - ignore prompts within this time after sending command
const PROMPT_GRACE_PERIOD = 550

interface TerminalState {
  id: string
  terminal: Terminal | null
  isBusy: boolean
}

interface TerminalContextType {
  terminals: TerminalState[]
  setTerminals: React.Dispatch<React.SetStateAction<TerminalState[]>>
  activeTerminalId: string
  setActiveTerminalId: React.Dispatch<React.SetStateAction<string>>
  creatingTerminal: boolean
  setCreatingTerminal: React.Dispatch<React.SetStateAction<boolean>>
  closingTerminal: string
  runTerminalId: string | null
  createNewTerminal: (command?: string) => Promise<string | null>
  closeTerminal: (id: string) => Promise<void>
  stopPreview: () => void
  isPreviewTerminal: (id: string) => boolean
  deploy: (callback: () => void) => void
  getAppExists:
    | ((appName: string) => Promise<{ success: boolean; exists?: boolean }>)
    | null
  isTerminalBusy: (id: string) => boolean
  isActiveTerminalBusy: boolean
  setTerminalBusy: (id: string, busy: boolean) => void
  sendCommandToTerminal: (id: string, command: string) => void
  terminalExists: (id: string) => boolean
}

const TerminalContext = createContext<TerminalContextType | undefined>(
  undefined,
)

const errorMap = {
  MAX_TERMINALS: "You reached the maximum # of terminals.",
  CREATE_FAILED: "Failed to create new terminal",
  CREATE_NO_SOCKET: "Failed to create new terminal: No socket connection",
  UNKNOWN_ERROR: "An unknown error occurred while creating a new terminal",
  CREATE_IN_PROGRESS: "A terminal is already being created. Please wait.",
}

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { socket, isReady: isSocketReady } = useSocket()
  const [terminals, setTerminals] = useState<TerminalState[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string>("")
  const [creatingTerminal, setCreatingTerminal] = useState<boolean>(false)
  const [closingTerminal, setClosingTerminal] = useState<string>("")
  const [runTerminalId, setRunTerminalId] = useState<string | null>(null)

  // Synced from server: terminal list and preview state
  useEffect(() => {
    if (!socket) return
    const onTerminalCreated = ({ id }: { id: string }) => {
      setTerminals((prev) =>
        prev.some((t) => t.id === id)
          ? prev
          : [...prev, { id, terminal: null, isBusy: false }],
      )
    }
    const onTerminalClosed = ({ id }: { id: string }) => {
      delete commandSentAtRef.current[id]
      setTerminals((prev) => prev.filter((t) => t.id !== id))
      setActiveTerminalId((prev) => (prev === id ? "" : prev))
    }
    const onTerminalState = ({ ids }: { ids: string[] }) => {
      setTerminals((prev) => {
        const existing = new Set(prev.map((t) => t.id))
        const toAdd = ids
          .filter((id) => !existing.has(id))
          .map((id) => ({ id, terminal: null as Terminal | null, isBusy: false }))
        return toAdd.length ? [...prev, ...toAdd] : prev
      })
    }
    const onPreviewState = ({
      url,
      runTerminalId: rid,
    }: {
      url: string | null
      runTerminalId: string | null
    }) => {
      setRunTerminalId(rid)
    }
    socket.on("terminalCreated", onTerminalCreated)
    socket.on("terminalClosed", onTerminalClosed)
    socket.on("terminalState", onTerminalState)
    socket.on("previewState", onPreviewState)
    return () => {
      socket.off("terminalCreated", onTerminalCreated)
      socket.off("terminalClosed", onTerminalClosed)
      socket.off("terminalState", onTerminalState)
      socket.off("previewState", onPreviewState)
    }
  }, [socket])

  // Track when commands were sent to ignore prompts that arrive too quickly
  // (the existing prompt before command runs)
  const commandSentAtRef = useRef<Record<string, number>>({})

  // Listen for terminal responses to detect busy/idle state
  useEffect(() => {
    if (!socket) return

    const handleTerminalResponse = (response: { id: string; data: string }) => {
      const { id, data } = response
      const trimmedData = data.trimEnd()
      const endsWithPrompt = trimmedData.endsWith("user>")

      if (endsWithPrompt) {
        // Ignore prompts that arrive too quickly after a command was sent
        // (this is the existing prompt before the command runs)
        const sentAt = commandSentAtRef.current[id]
        if (sentAt && Date.now() - sentAt < PROMPT_GRACE_PERIOD) {
          return
        }
        // Clear the timestamp and mark as idle
        delete commandSentAtRef.current[id]
        setTerminals((prev) =>
          prev.map((t) => (t.id === id ? { ...t, isBusy: false } : t)),
        )
      }
    }

    socket.on("terminalResponse", handleTerminalResponse)
    return () => {
      socket.off("terminalResponse", handleTerminalResponse)
    }
  }, [socket])

  const setTerminalBusy = useCallback((id: string, busy: boolean) => {
    setTerminals((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isBusy: busy } : t)),
    )
  }, [])

  const isTerminalBusy = useCallback(
    (id: string) => terminals.find((t) => t.id === id)?.isBusy ?? false,
    [terminals],
  )

  const isActiveTerminalBusy =
    terminals.find((t) => t.id === activeTerminalId)?.isBusy ?? false

  const terminalExists = useCallback(
    (id: string) => terminals.some((t) => t.id === id),
    [terminals],
  )

  const stopPreview = useCallback(() => {
    if (socket) stopPreviewApi(socket)
  }, [socket])

  const isPreviewTerminal = useCallback(
    (id: string) => runTerminalId === id,
    [runTerminalId],
  )

  const sendCommandToTerminal = useCallback(
    (id: string, command: string) => {
      if (!socket) return
      if (!terminalExists(id)) return

      // Record when command was sent to ignore prompts arriving too quickly
      commandSentAtRef.current[id] = Date.now()
      // Mark terminal as busy
      setTerminalBusy(id, true)
      // Send command with newline
      socket.emit("terminalData", { id, data: command + "\n" })
      // Switch to that terminal
      setActiveTerminalId(id)
    },
    [socket, terminalExists, setTerminalBusy, setActiveTerminalId],
  )

  const createNewTerminal = async (
    command?: string,
  ): Promise<string | null> => {
    if (
      !socket ||
      !isSocketReady ||
      creatingTerminal ||
      terminals.length >= MAX_TERMINALS
    ) {
      toast.error(
        terminals.length >= MAX_TERMINALS
          ? errorMap.MAX_TERMINALS
          : creatingTerminal
            ? errorMap.CREATE_IN_PROGRESS
            : errorMap.CREATE_NO_SOCKET,
      )

      return null
    }
    try {
      const id = await createTerminalHelper({
        setTerminals: setTerminals as React.Dispatch<
          React.SetStateAction<{ id: string; terminal: Terminal | null }[]>
        >,
        setActiveTerminalId,
        setCreatingTerminal,
        command,
        socket,
        // Mark terminal as busy if a command is provided
        onCreated: command
          ? (id: string) => {
              commandSentAtRef.current[id] = Date.now()
              setTerminalBusy(id, true)
            }
          : undefined,
      })
      return id
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create new terminal",
      )
      return null
    }
  }

  const closeTerminal = async (id: string): Promise<void> => {
    if (!socket) return
    if (closingTerminal) return // Guard against closing while another close is in progress
    const terminalToClose = terminals.find((term) => term.id === id)
    if (terminalToClose) {
      // Clean up timestamp
      delete commandSentAtRef.current[id]
      await closeTerminalHelper({
        term: terminalToClose,
        terminals,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTerminals: setTerminals as any,
        setActiveTerminalId,
        setClosingTerminal,
        socket,
        activeTerminalId,
      })
    }
  }

  const deploy = (callback: () => void) => {
    if (!socket) console.error("Couldn't deploy: No socket")
    socket?.emit("deploy", {}, () => {
      callback()
    })
  }

  const getAppExists = async (
    appName: string,
  ): Promise<{ success: boolean; exists?: boolean }> => {
    if (!socket) {
      console.error("Couldn't check if app exists: No socket")
      return { success: false }
    }
    const response: { success: boolean; exists?: boolean } = await new Promise(
      (resolve) => socket.emit("getAppExists", { appName }, resolve),
    )
    return response
  }

  const value = {
    terminals,
    setTerminals,
    activeTerminalId,
    setActiveTerminalId,
    creatingTerminal,
    setCreatingTerminal,
    closingTerminal,
    runTerminalId,
    createNewTerminal,
    closeTerminal,
    stopPreview,
    isPreviewTerminal,
    deploy,
    getAppExists: isSocketReady ? getAppExists : null,
    isTerminalBusy,
    isActiveTerminalBusy,
    setTerminalBusy,
    sendCommandToTerminal,
    terminalExists,
  }

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  )
}

export const useTerminal = (): TerminalContextType => {
  const context = useContext(TerminalContext)
  if (!context) {
    throw new Error("useTerminal must be used within a TerminalProvider")
  }
  return context
}
