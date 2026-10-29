export interface WsMessage {
  event: string
  payload?: unknown
}

export interface ScanPayload {
  socketId: string
  deviceUUID: string
}

export interface EmailRequestPayload {
  email: string
  deviceUUID: string
}

export interface EmailVerifyPayload {
  email: string
  code: string
  deviceUUID: string
  socketId?: string
}

export interface RegisterPayload {
  deviceUUID: string
  email: string
  name: string
  surname: string
  dob: string
  socketId?: string
}
