import { useEffect, useRef, useState, useCallback } from 'react'
import type { AuthStatus, User, WsMessage } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/socket`
const API_URL = import.meta.env.VITE_API_URL ?? '/api'
const HEARTBEAT_INTERVAL = 30_000
const TOKEN_KEY = 'te_session_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [socketId, setSocketId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startHeartbeat = useCallback((ws: WebSocket) => {
    heartbeatRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'heartbeat' }))
      }
    }, HEARTBEAT_INTERVAL)
  }, [])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => { startHeartbeat(ws) }

    ws.onmessage = (e) => {
      const msg: WsMessage = JSON.parse(e.data)

      if (msg.event === 'connected') {
        const { socketId } = msg.payload as { socketId: string }
        setSocketId(socketId)
        setStatus('waiting')
      }

      if (msg.event === 'auth:success') {
        const { token, user } = msg.payload as { token: string; user: User }
        localStorage.setItem(TOKEN_KEY, token)
        setUser(user)
        setStatus('authenticated')
        stopHeartbeat()
      }

      if (msg.event === 'auth:unregistered') {
        setStatus('rejected')
      }
    }

    ws.onclose = () => {
      stopHeartbeat()
      setSocketId(null)
    }
  }, [startHeartbeat, stopHeartbeat])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) { connect(); return }

    fetch(`${API_URL}/auth/session/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setUser(data.user)
          setStatus('authenticated')
        } else {
          localStorage.removeItem(TOKEN_KEY)
          connect()
        }
      })
      .catch(() => connect())
  }, [connect])

  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    await fetch(`${API_URL}/auth/session`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    localStorage.removeItem(TOKEN_KEY)
    wsRef.current?.close()
    setUser(null)
    setStatus('idle')
    connect()
  }, [connect])

  return { status, socketId, user, logout }
}
