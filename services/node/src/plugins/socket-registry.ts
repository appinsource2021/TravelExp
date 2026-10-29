import fp from 'fastify-plugin'
import type { WebSocket } from '@fastify/websocket'

declare module 'fastify' {
  interface FastifyInstance {
    socketRegistry: SocketRegistry
  }
}

export class SocketRegistry {
  private sockets = new Map<string, WebSocket>()

  add(socketId: string, ws: WebSocket) {
    this.sockets.set(socketId, ws)
  }

  remove(socketId: string) {
    this.sockets.delete(socketId)
  }

  send(socketId: string, event: string, payload?: unknown): boolean {
    const ws = this.sockets.get(socketId)
    if (!ws) return false
    ws.send(JSON.stringify({ event, payload }))
    return true
  }

  has(socketId: string): boolean {
    return this.sockets.has(socketId)
  }
}

export default fp(async (app) => {
  app.decorate('socketRegistry', new SocketRegistry())
})
