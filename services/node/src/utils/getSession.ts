import type { FastifyRequest } from 'fastify'
import { SessionModel } from '../models/session.model'

export async function getSession(req: FastifyRequest) {
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ')
    ? auth.slice(7)
    : req.cookies?.session_token

  if (!token) return null
  return SessionModel.findOne({ token })
}
