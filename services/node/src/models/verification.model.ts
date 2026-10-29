import mongoose, { Schema, Document } from 'mongoose'

export interface IVerification extends Document {
  email: string
  code: string
  deviceUUID: string
  attempts: number
  verified: boolean
  expiresAt: Date
  createdAt: Date
}

const VerificationSchema = new Schema<IVerification>({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  code: { type: String, required: true },
  deviceUUID: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
})

// Süresi dolan kodlar kendiliğinden silinir
VerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const VerificationModel = mongoose.model<IVerification>('Verification', VerificationSchema)
