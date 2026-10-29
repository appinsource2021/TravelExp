import mongoose, { Schema, Document } from 'mongoose'

export interface IPosition extends Document {
  monthId: mongoose.Types.ObjectId
  date: string           // DD.MM.YY
  startTime: string      // HH:MM
  endTime: string        // HH:MM
  totalHours: string     // HH:MM
  destination: string
  reisezweck: string
  verpflegungPauschal: number
  uebernachtungPauschal: number
  km: number
  kmPrice: number
  fahrkostenTatsaechlich: number
  gesamt: number
  isOvernight: boolean
  sortOrder: number
}

const PositionSchema = new Schema<IPosition>({
  monthId: { type: Schema.Types.ObjectId, ref: 'Month', required: true },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  totalHours: { type: String, required: true },
  destination: { type: String, required: true },
  reisezweck: { type: String, default: 'Business' },
  verpflegungPauschal: { type: Number, default: 14 },
  uebernachtungPauschal: { type: Number, default: 0 },
  km: { type: Number, required: true },
  kmPrice: { type: Number, default: 0.30 },
  fahrkostenTatsaechlich: { type: Number, required: true },
  gesamt: { type: Number, required: true },
  isOvernight: { type: Boolean, default: false },
  sortOrder: { type: Number, required: true },
})

export const PositionModel = mongoose.model<IPosition>('Position', PositionSchema)
