import type { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const HEARTBEAT_TIMEOUT = Number(process.env.HEARTBEAT_TIMEOUT_MS ?? 60000)
const IDLE_TIMEOUT = Number(process.env.IDLE_TIMEOUT_MS ?? 600000)

const socketRoute: FastifyPluginAsync = async (app) => {
  app.get('/socket', { websocket: true }, (ws) => {
    const socketId = uuidv4()
    app.socketRegistry.add(socketId, ws)

    ws.send(JSON.stringify({ event: 'connected', payload: { socketId } }))

    let heartbeatTimer = setTimeout(() => ws.close(), HEARTBEAT_TIMEOUT)
    let idleTimer = setTimeout(() => ws.close(), IDLE_TIMEOUT)

    const resetIdleTimer = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => ws.close(), IDLE_TIMEOUT)
    }

    ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString())

      if (msg.event === 'heartbeat') {
        clearTimeout(heartbeatTimer)
        heartbeatTimer = setTimeout(() => ws.close(), HEARTBEAT_TIMEOUT)
        resetIdleTimer()
      }
    })

    ws.on('close', () => {
      clearTimeout(heartbeatTimer)
      clearTimeout(idleTimer)
      app.socketRegistry.remove(socketId)
    })
  })
}

export default socketRoute
