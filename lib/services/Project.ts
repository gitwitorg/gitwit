import { templateConfigs } from "@gitwit/templates"
import { Sandbox as Container } from "e2b"
import { CONTAINER_TIMEOUT } from "../utils/constants"
import { FileManager } from "./FileManager"
import { TerminalManager } from "./TerminalManager"
// Database imports

// Load the database credentials
import { db, schema } from "@gitwit/db"
import "dotenv/config"
import { eq } from "drizzle-orm"

// Initialize database

export class Project {
  // Project properties:
  projectId: string
  type: string | null = null
  fileManager: FileManager | null = null
  terminalManager: TerminalManager | null = null
  container: Container | null = null
  containerId: string | null = null

  // Preview server state (one per project, synced across all clients)
  previewURL: string | null = null
  runTerminalId: string | null = null

  constructor(projectId: string) {
    this.projectId = projectId
  }

  setPreview(url: string, runTerminalId: string): void {
    this.previewURL = url
    this.runTerminalId = runTerminalId
  }

  clearPreview(): void {
    this.previewURL = null
    this.runTerminalId = null
  }

  /**
   * Kill all known dev server processes in the container (e.g. npm run dev, yarn dev, pnpm dev, vite, next, etc.)
   */
  async killDevServers(): Promise<void> {
    if (!this.container) return
    // Gather all dev server patterns (template + common)
    const patterns = [
      this.type && templateConfigs[this.type]?.runCommand,
      "vite",
      "next",
      "nodemon",
      "webpack serve",
      "parcel",
      "gulp",
      "python -m http.server",
      "node ",
      "npm ",
    ].filter(Boolean)

    let psOutput = ""
    try {
      const result = await this.container.commands.run("ps aux")
      psOutput = result.stdout || ""
    } catch {}

    const lines = psOutput.split("\n")
    const killed: string[] = []
    const seenPids = new Set<string>()

    for (const line of lines) {
      for (const pattern of patterns) {
        if (pattern && line.includes(pattern)) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[1]
          if (pid && pid !== "PID" && !seenPids.has(pid)) {
            try {
              await this.container.commands.run(`kill -9 ${pid}`)
              killed.push(`${pattern} (pid ${pid})`)
              seenPids.add(pid)
            } catch {}
          }
        }
      }
    }

    if (killed.length) {
      console.log(
        `[killDevServers] Killed processes for project ${this.projectId}:\n${killed.join("\n")}`,
      )
    } else {
      console.log(
        `[killDevServers] No dev server processes found to kill for project ${this.projectId}`,
      )
    }
  }
  async createContainer(): Promise<Container> {
    console.log("Creating container for ", this.projectId)
    const templateTypes = [
      "vanillajs",
      "reactjs",
      "nextjs",
      "streamlit",
      "php",
      "empty",
    ]
    const template = templateTypes.includes(this.type ?? "")
      ? `gitwit-${this.type}`
      : `base`
    this.container = await Container.create(template, {
      timeoutMs: CONTAINER_TIMEOUT,
      autoPause: true,
    })
    this.containerId = this.container.sandboxId
    console.log("Created container ", this.containerId)

    // Save the container ID for this project so it can be accessed later
    await db
      .update(schema.sandbox)
      .set({ containerId: this.containerId })
      .where(eq(schema.sandbox.id, this.projectId))

    return this.container
  }

  async connectToContainer(containerId: string): Promise<Container> {
    this.container = await Container.connect(containerId, {
      timeoutMs: CONTAINER_TIMEOUT,
      autoPause: true,
    })
    return this.container
  }

  async initialize() {
    // Fetch project data from the database
    const dbProject = await db.query.sandbox.findFirst({
      where: (sandbox, { eq }) => eq(sandbox.id, this.projectId),
    })

    if (!dbProject) {
      throw new Error("Project not found")
    }

    // Load type and containerId from database
    this.type = dbProject.type
    this.containerId = dbProject.containerId

    // Acquire a lock to ensure exclusive access to the container
    const container = this.containerId
      ? await this.connectToContainer(this.containerId)
      : await this.createContainer()

    if (!(await container.isRunning())) {
      throw new Error("Container is not running")
    }

    // Initialize the terminal manager if it hasn't been set up yet
    if (!this.terminalManager) {
      this.terminalManager = new TerminalManager(container)
    }

    // Initialize the file manager if it hasn't been set up yet
    if (!this.fileManager) {
      this.fileManager = new FileManager(container)
    }
  }

  // Called when the last client disconnects from the project
  async disconnect() {
    this.clearPreview()
    await this.killDevServers()
    // Close all terminals managed by the terminal manager
    await this.terminalManager?.closeAllTerminals()
    // This way the terminal manager will be set up again if we reconnect
    this.terminalManager = null
    // Close all file watchers managed by the file manager
    await this.fileManager?.stopWatching()
    // This way the file manager will be set up again if we reconnect
    this.fileManager = null
  }
}
