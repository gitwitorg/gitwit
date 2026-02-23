import { Sandbox as Container } from "e2b"
import { Terminal } from "./Terminal"

export class TerminalManager {
  private container: Container
  private terminals: Record<string, Terminal> = {}

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

    this.terminals[id] = new Terminal(this.container)
    await this.terminals[id].init({
      onData,
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
  }

  async closeAllTerminals(): Promise<void> {
    await Promise.all(
      Object.entries(this.terminals).map(async ([key, terminal]) => {
        await terminal.close()
        delete this.terminals[key]
      }),
    )
  }

  getTerminalIds(): string[] {
    return Object.keys(this.terminals)
  }
}
