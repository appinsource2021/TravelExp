import mongoose, { Schema, Document } from 'mongoose'

export interface IMonth extends Document {
  deviceUUID: string
  year: number
  month: number
  personName: string
  totalCost: number
  mailSent: boolean
  /** Pozisyonlar nasıl üretildi — 'ai' ise Claude planladı */
  generatedBy: 'manual' | 'shuffle' | 'ai'
  /** AI'ın planı neden böyle kurduğuna dair tek cümlelik özeti */
  generatedNote: string
  /** Son seyahat bittikten `delayMinutes` sonra mail sunucu tarafından gönderilir */
  autoSend: {
    enabled: boolean
    delayMinutes: number
    /** Tarayıcıda üretilen PDF; pozisyon değişince boşaltılır, sayfa yeniden yükler */
    pdfBase64: string
    pdfFilename: string
    lastError: string
  }
  createdAt: Date
}

const MonthSchema = new Schema<IMonth>({
  deviceUUID: { type: String, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  personName: { type: String, required: true },
  totalCost: { type: Number, default: 0 },
  mailSent: { type: Boolean, default: false },
  generatedBy: { type: String, enum: ['manual', 'shuffle', 'ai'], default: 'manual' },
  generatedNote: { type: String, default: '' },
  autoSend: {
    enabled: { type: Boolean, default: false },
    delayMinutes: { type: Number, default: 45 },
    // Yüzlerce KB — ay listesinde taşınmasın; gerektiğinde '+autoSend.pdfBase64'
    pdfBase64: { type: String, default: '', select: false },
    pdfFilename: { type: String, default: '' },
    lastError: { type: String, default: '' },
  },
  createdAt: { type: Date, default: Date.now },
})

MonthSchema.index({ deviceUUID: 1, year: 1, month: 1 }, { unique: true })

export const MonthModel = mongoose.model<IMonth>('Month', MonthSchema)
