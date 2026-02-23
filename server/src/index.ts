import dotenv from "dotenv"
import path from "path"

// Load parent .env first
// Then load local .env to override
dotenv.config({ path: path.resolve(__dirname, "../../.env") })
dotenv.config({ path: path.resolve(__dirname, "../.env") })

import cors from "cors"
import express, { Express } from "express"
import fs from "fs"
import { createServer } from "http"
import { Server, Socket } from "socket.io"

import { ConnectionManager } from "@gitwit/lib/services/ConnectionManager"
import { DokkuClient } from "@gitwit/lib/services/DokkuClient"
import { Project } from "@gitwit/lib/services/Project"
import { createProjectHandlers } from "@gitwit/lib/services/ProjectHandlers"
import { SecureGitClient } from "@gitwit/lib/services/SecureGitClient"
import { TFile, TFolder } from "@gitwit/lib/utils/types"
import { socketAuth } from "./middleware/socketAuth"

// Log errors and send a notification to the client
export const handleErrors = (message: string, error: any, socket: Socket) => {
  console.error(message, error)
  socket.emit("error", `${message} ${error.message ?? error}`)
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
  // Do not exit the process
})

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
  // Do not exit the process
})

// Initialize containers and managers
const connections = new ConnectionManager()
const projectCache = new Map<string, Project>()
const projectCreationPromises = new Map<string, Promise<Project>>()

async function getOrCreateProject(projectId: string): Promise<Project> {
  let existing = projectCache.get(projectId)
  if (existing) return existing
  let promise = projectCreationPromises.get(projectId)
  if (!promise) {
    promise = (async () => {
      let project = projectCache.get(projectId)
      if (!project) {
        project = new Project(projectId)
        await project.initialize()
        projectCache.set(projectId, project)
      }
      return project
    })()
    projectCreationPromises.set(projectId, promise)
  }
  return promise
}

// Initialize Express app and create HTTP server
const app: Express = express()
const port = process.env.PORT || 4000
app.use(cors())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow connections from any origin
  },
})

// Middleware for socket authentication
io.use(socketAuth) // Use the new socketAuth middleware

// Check for required environment variables
if (!process.env.DOKKU_HOST)
  console.warn("Environment variable DOKKU_HOST is not defined")
if (!process.env.DOKKU_USERNAME)
  console.warn("Environment variable DOKKU_USERNAME is not defined")
if (!process.env.DOKKU_KEY)
  console.warn("Environment variable DOKKU_KEY is not defined")

// Initialize Dokku client
const dokkuClient =
  process.env.DOKKU_HOST && process.env.DOKKU_KEY && process.env.DOKKU_USERNAME
    ? new DokkuClient({
        host: process.env.DOKKU_HOST,
        username: process.env.DOKKU_USERNAME,
        privateKey: fs.readFileSync(process.env.DOKKU_KEY),
      })
    : null
dokkuClient?.connect()

// Initialize Git client used to deploy Dokku apps
const gitClient =
  process.env.DOKKU_HOST && process.env.DOKKU_KEY
    ? new SecureGitClient(
        `dokku@${process.env.DOKKU_HOST}`,
        process.env.DOKKU_KEY,
      )
    : null

// Handle a client connecting to the server
io.on("connection", async (socket) => {
  try {
    // This data comes is added by our authentication middleware
    const data = socket.data as {
      userId: string
      projectId: string
      isOwner: boolean
    }

    // Register the connection
    connections.addConnectionForProject(socket, data.projectId)

    try {
      // This callback recieves an update when the file list changes, and notifies all relevant connections.
      const sendFileNotifications = (files: (TFolder | TFile)[]) => {
        connections
          .connectionsForProject(data.projectId)
          .forEach((socket: Socket) => {
            socket.emit("refreshFiles", files)
          })
      }

      // Get or create project (serialized so concurrent connections share one project)
      const project = await getOrCreateProject(data.projectId)
      await project.fileManager?.startWatching(sendFileNotifications)

      // Register event handlers for the project
      const handlers = createProjectHandlers(
        project,
        {
          userId: data.userId,
          isOwner: data.isOwner,
          socket,
        },
        {
          dokkuClient,
          gitClient,
        },
        connections,
      )

      // For each event handler, listen on the socket for that event
      Object.entries(handlers).forEach(([event, handler]) => {
        const typedHandler = handler as (options: any) => Promise<any>
        socket.on(
          event,
          async (options: any, callback?: (response: any) => void) => {
            try {
              const result = await typedHandler(options)
              callback?.(result)
            } catch (e: any) {
              handleErrors(`Error processing event "${event}":`, e, socket)
            }
          },
        )
      })

      socket.emit("ready")
      // Initial terminal/preview state is sent when client emits getInitialState (avoids race with client listeners)

      // Handle disconnection event
      socket.on("disconnect", async () => {
        try {
          connections.removeConnectionForProject(socket, data.projectId)
          if (connections.connectionsForProject(data.projectId).size === 0) {
            await project.disconnect()
            projectCache.delete(data.projectId)
            projectCreationPromises.delete(data.projectId)
          }
        } catch (e: any) {
          handleErrors("Error disconnecting:", e, socket)
        }
      })
    } catch (e: any) {
      handleErrors(`Error initializing project ${data.projectId}:`, e, socket)
    }
  } catch (e: any) {
    handleErrors("Error connecting:", e, socket)
  }
})

// Start the server
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
