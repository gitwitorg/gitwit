import { Socket } from "socket.io"
import { ConnectionManager } from "./ConnectionManager"
import { LockManager } from "../utils/lock"
import { Project } from "./Project"

function broadcastToProject(
  connections: ConnectionManager,
  projectId: string,
  event: string,
  payload: unknown,
) {
  connections.connectionsForProject(projectId).forEach((s: Socket) => {
    s.emit(event, payload)
  })
}

type ServerContext = {
  dokkuClient: any | null
  gitClient: any | null
}

type ConnectionInfo = {
  userId: string
  isOwner: boolean
  socket: Socket
}

type SocketHandler = (options: any) => Promise<any> | any

export const createProjectHandlers = (
  project: Project,
  connection: ConnectionInfo,
  context: ServerContext,
  connections: ConnectionManager,
) => {
  const { dokkuClient, gitClient } = context
  const lockManager = new LockManager()
  const projectId = project.projectId

  // Extract port number from a string
  function extractPortNumber(inputString: string): number | null {
    const cleanedString = inputString.replace(/\x1B\[[0-9;]*m/g, "")
    const regex = /http:\/\/localhost:(\d+)/
    const match = cleanedString.match(regex)
    return match ? parseInt(match[1]) : null
  }

  // Handle listing apps
  const handleListApps: SocketHandler = async () => {
    if (!dokkuClient)
      throw new Error("Failed to retrieve apps list: No Dokku client")
    return { success: true, apps: await dokkuClient.listApps() }
  }

  // Handle getting app creation timestamp
  const handleGetAppCreatedAt: SocketHandler = async ({
    appName,
  }: {
    appName: string
  }) => {
    if (!dokkuClient) {
      throw new Error(
        "Failed to retrieve app creation timestamp: No Dokku client",
      )
    }
    return {
      success: true,
      createdAt: await dokkuClient.getAppCreatedAt(appName),
    }
  }

  // Handle checking if an app exists
  const handleAppExists: SocketHandler = async ({
    appName,
  }: {
    appName: string
  }) => {
    if (!dokkuClient) {
      console.log("Failed to check app existence: No Dokku client")
      return { success: false }
    }
    if (!dokkuClient.isConnected) {
      console.log(
        "Failed to check app existence: The Dokku client is not connected",
      )
      return { success: false }
    }
    return {
      success: true,
      exists: await dokkuClient.appExists(appName),
    }
  }

  // Handle deploying code
  const handleDeploy: SocketHandler = async () => {
    if (!gitClient) throw new Error("No git client")
    if (!project.fileManager) throw new Error("No file manager")

    const tarBase64 = await project.fileManager.getFilesForDownload()
    await gitClient.pushFiles(tarBase64, project.projectId)
    return { success: true }
  }

  // Handle creating a terminal session
  const handleCreateTerminal: SocketHandler = async ({
    id,
  }: {
    id: string
  }) => {
    await lockManager.acquireLock(projectId, async () => {
      await project.terminalManager?.createTerminal(
        id,
        (responseString: string) => {
          broadcastToProject(connections, projectId, "terminalResponse", {
            id,
            data: responseString,
          })
          const port = extractPortNumber(responseString)
          if (port && project.container && !project.previewURL) {
            const url = "https://" + project.container.getHost(port)
            project.setPreview(url, id)
            broadcastToProject(connections, projectId, "previewState", {
              url,
              runTerminalId: id,
            })
          }
        },
      )
      broadcastToProject(connections, projectId, "terminalCreated", { id })
    })
  }

  // Handle resizing a terminal
  const handleResizeTerminal: SocketHandler = ({
    dimensions,
  }: {
    dimensions: { cols: number; rows: number }
  }) => {
    project.terminalManager?.resizeTerminal(dimensions)
  }

  // Handle sending data to a terminal
  const handleTerminalData: SocketHandler = ({
    id,
    data,
  }: {
    id: string
    data: string
  }) => {
    return project.terminalManager?.sendTerminalData(id, data)
  }

  // Handle closing a terminal
  const handleCloseTerminal: SocketHandler = async ({ id }: { id: string }) => {
    const wasRunTerminal = project.runTerminalId === id
    await project.terminalManager?.closeTerminal(id)
    broadcastToProject(connections, projectId, "terminalClosed", { id })
    if (wasRunTerminal) {
      project.clearPreview()
      broadcastToProject(connections, projectId, "previewState", {
        url: null,
        runTerminalId: null,
      })
    }
  }

  // Send initial synced state to the requesting client (called when client receives "ready" to avoid race with listener setup)
  const handleGetInitialState: SocketHandler = () => {
    const ids = project.terminalManager?.getTerminalIds() ?? []
    connection.socket.emit("terminalState", { ids })
    connection.socket.emit("previewState", {
      url: project.previewURL,
      runTerminalId: project.runTerminalId,
    })
  }

  // Handle stopping the preview server (kills dev server, closes preview terminal)
  const handleStopPreview: SocketHandler = async () => {
    const runId = project.runTerminalId
    if (!runId) return
    await project.killDevServers()
    await project.terminalManager?.closeTerminal(runId)
    project.clearPreview()
    broadcastToProject(connections, projectId, "terminalClosed", { id: runId })
    broadcastToProject(connections, projectId, "previewState", {
      url: null,
      runTerminalId: null,
    })
  }

  // Return all handlers as a map of event names to handler functions
  return {
    listApps: handleListApps,
    getAppCreatedAt: handleGetAppCreatedAt,
    appExists: handleAppExists,
    deploy: handleDeploy,
    createTerminal: handleCreateTerminal,
    resizeTerminal: handleResizeTerminal,
    terminalData: handleTerminalData,
    closeTerminal: handleCloseTerminal,
    stopPreview: handleStopPreview,
    getInitialState: handleGetInitialState,
  }
}
