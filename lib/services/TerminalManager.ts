import { Sandbox as Container } from "e2b"
import { Terminal } from "./Terminal"

const MAX_SCREEN_BUFFER_CHARS = 50_000

export class TerminalManager {
  private container: Container
  private terminals: Record<string, Terminal> = {}
  private screenBuffers: Record<string, string> = {}

  constructor(container: Container) {
    this.container = container
  }

  async createTerminal(
    id: string,
    onData: (responseString: string) => void,
  ): Promise<void> {
    if (this.terminals[id]) {
      return
    }

    this.screenBuffers[id] = ""
    const pushData = (responseString: string) => {
      let buf = this.screenBuffers[id]
      if (buf !== undefined) {
        buf += responseString
        if (buf.length > MAX_SCREEN_BUFFER_CHARS) {
          buf = buf.slice(-MAX_SCREEN_BUFFER_CHARS)
        }
        this.screenBuffers[id] = buf
      }
      onData(responseString)
    }

    this.terminals[id] = new Terminal(this.container)
    await this.terminals[id].init({
      onData: pushData,
      cols: 80,
      rows: 20,
    })

    const defaultDirectory = "/home/user/project"
    const defaultCommands = [
      `cd "${defaultDirectory}"`,
      "export PS1='user> '",
      "clear",
    ]
    for (const command of defaultCommands) {
      await this.terminals[id].sendData(command + "\r")
    }

    console.log("Created terminal", id)
  }

  async resizeTerminal(
    id: string,
    dimensions: { cols: number; rows: number },
  ): Promise<void> {
    this.terminals[id]?.resize(dimensions)
  }

  async sendTerminalData(id: string, data: string): Promise<void> {
    if (!this.terminals[id]) {
      return
    }

    await this.terminals[id].sendData(data)
  }

  async closeTerminal(id: string): Promise<void> {
    if (!this.terminals[id]) {
      return
    }

    await this.terminals[id].close()
    delete this.terminals[id]
    delete this.screenBuffers[id]
  }

  async closeAllTerminals(): Promise<void> {
    await Promise.all(
      Object.entries(this.terminals).map(async ([key, terminal]) => {
        await terminal.close()
        delete this.terminals[key]
        delete this.screenBuffers[key]
      }),
    )
  }

  getTerminalIds(): string[] {
    return Object.keys(this.terminals)
  }

  getScreenBuffers(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const id of Object.keys(this.terminals)) {
      const buf = this.screenBuffers[id]
      if (buf) out[id] = buf
    }
    return out
  }
}
