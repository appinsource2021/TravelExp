export type AuthStatus = 'idle' | 'waiting' | 'authenticated' | 'rejected'

export interface User {
  name: string
  surname: string
}

export interface WsMessage {
  event: string
  payload?: unknown
}
