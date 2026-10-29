import mongoose, { Schema, Document } from 'mongoose'

export interface IDestination extends Document {
  address: string
  km: number
  active: boolean
}

const DestinationSchema = new Schema<IDestination>({
  address: { type: String, required: true },
  km: { type: Number, required: true },
  active: { type: Boolean, default: true },
})

export const DestinationModel = mongoose.model<IDestination>('Destination', DestinationSchema)
