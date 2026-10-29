import mongoose, { Schema, Document } from 'mongoose'

export interface IProfile extends Document {
  deviceUUID: string
  homeAddress: string
  firma: string
  name: string
  surname: string
  birthDate: string
}

const ProfileSchema = new Schema<IProfile>({
  deviceUUID: { type: String, required: true, unique: true },
  homeAddress: { type: String, default: '' },
  firma: { type: String, default: 'Norm Services GmbH' },
  name: { type: String, default: '' },
  surname: { type: String, default: '' },
  birthDate: { type: String, default: '' },
})

export const ProfileModel = mongoose.model<IProfile>('Profile', ProfileSchema)
