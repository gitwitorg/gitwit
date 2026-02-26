"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { io, Socket } from "socket.io-client"

interface SocketContextType {
  socket: Socket | null
  isReady: boolean
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export const SocketProvider: React.FC<{
  children: React.ReactNode
  token: string | null
  userId: string
  sandboxId: string
}> = ({ children, token, userId, sandboxId }) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const newSocket = io(
      `${process.env.NEXT_PUBLIC_SERVER_URL}?userId=${userId}&sandboxId=${sandboxId}`,
      {
        auth: {
          token,
          sandboxId,
        },
      },
    )

    newSocket.on("ready", () => {
      setIsReady(true)
      // Defer so TerminalContext's useEffect can register listeners first
      setTimeout(() => newSocket.emit("getInitialState"), 0)
    })

    newSocket.on("disconnect", () => {
      setIsReady(false)
    })

    newSocket.on("connect_error", () => {
      setIsReady(false)
    })

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [])

  const value = {
    socket,
    isReady,
  }

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  )
}

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider")
  }
  return context
}
