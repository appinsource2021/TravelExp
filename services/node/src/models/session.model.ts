import mongoose, { Schema, Document } from 'mongoose'

export interface ISession extends Document {
  token: string
  deviceUUID: string
  user: { name: string; surname: string }
  expiresAt: Date
  lastSeen: Date
}

const SessionSchema = new Schema<ISession>({
  token: { type: String, required: true, unique: true },
  deviceUUID: { type: String, required: true },
  user: {
    name: { type: String, required: true },
    surname: { type: String, required: true },
  },
  expiresAt: { type: Date, required: true },
  lastSeen: { type: Date, default: Date.now },
})

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const SessionModel = mongoose.model<ISession>('Session', SessionSchema)
