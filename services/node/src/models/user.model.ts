import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  deviceUUID: string
  email?: string
  name: string
  surname: string
  dob: string
  createdAt: Date
}

const UserSchema = new Schema<IUser>({
  deviceUUID: { type: String, required: true, unique: true },
  // Hesabın asıl kimliği e-postadır; deviceUUID sadece o an bağlı cihazı gösterir
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  name: { type: String, required: true },
  surname: { type: String, required: true },
  dob: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
})

export const UserModel = mongoose.model<IUser>('User', UserSchema)
