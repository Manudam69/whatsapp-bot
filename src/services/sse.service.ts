import { Response } from 'express'

export type SseEventType =
  | 'report:created'
  | 'report:updated'
  | 'report:archived'
  | 'dashboard:refresh'
  | 'schedule:created'
  | 'schedule:updated'
  | 'schedule:deleted'
  | 'message:created'
  | 'message:updated'
  | 'message:deleted'
  | 'image:created'
  | 'image:updated'
  | 'image:deleted'

class SseService {
  private readonly clients = new Map<string, Set<Response>>()

  addClient(clientId: string, res: Response): void {
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, new Set())
    }
    this.clients.get(clientId)!.add(res)
  }

  removeClient(clientId: string, res: Response): void {
    const clientSet = this.clients.get(clientId)
    if (!clientSet) return
    clientSet.delete(res)
    if (clientSet.size === 0) {
      this.clients.delete(clientId)
    }
  }

  emit(clientId: string, event: SseEventType, data?: unknown): void {
    const clientSet = this.clients.get(clientId)
    if (!clientSet || clientSet.size === 0) return

    const message = `event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`
    const dead: Response[] = []

    clientSet.forEach((res) => {
      try {
        res.write(message)
      } catch {
        dead.push(res)
      }
    })

    dead.forEach((res) => {
      clientSet.delete(res)
    })

    if (clientSet.size === 0) {
      this.clients.delete(clientId)
    }
  }
}

export const sseService = new SseService()
