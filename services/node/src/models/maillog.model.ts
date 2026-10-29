import mongoose, { Schema, Document, Types } from 'mongoose'

/**
 * Gönderim geçmişi: her mail denemesi — başarılı ya da başarısız — buraya yazılır.
 *
 * Amaç "hangi ay, ne zaman, hangi hesaptan, kime gitti" sorusunu uygulama içinden
 * cevaplayabilmek. Ayın üzerindeki `mailSent` bayrağı yalnızca "gitti mi" der,
 * detay tutmaz.
 *
 * Mail gövdesi ve ek (PDF) BURAYA YAZILMAZ — yalnızca üstveri tutulur.
 */
export interface IMailLog extends Document {
  deviceUUID: string
  monthId: Types.ObjectId | null
  monthLabel: string

  fromAddress: string
  accountLabel: string
  to: string[]
  subject: string

  ok: boolean
  error: string
  messageId: string

  /** SMTP sunucusunun teslim için KABUL ettiği adresler */
  accepted: string[]
  /** SMTP sunucusunun REDDETTİĞİ adresler */
  rejected: string[]

  // Gönderilmiş klasörüne kopyalama ayrı bir adım; gönderim başarılı olsa bile
  // bu başarısız olabilir. O yüzden ayrı tutulur.
  savedToSent: boolean
  sentFolder: string
  saveError: string
}

const MailLogSchema = new Schema<IMailLog>({
  deviceUUID: { type: String, required: true, index: true },
  monthId: { type: Schema.Types.ObjectId, ref: 'Month', default: null },
  monthLabel: { type: String, default: '' },

  fromAddress: { type: String, default: '' },
  accountLabel: { type: String, default: '' },
  to: { type: [String], default: [] },
  subject: { type: String, default: '' },

  ok: { type: Boolean, default: false },
  error: { type: String, default: '' },
  messageId: { type: String, default: '' },

  accepted: { type: [String], default: [] },
  rejected: { type: [String], default: [] },

  savedToSent: { type: Boolean, default: false },
  sentFolder: { type: String, default: '' },
  saveError: { type: String, default: '' },
}, { timestamps: true })

MailLogSchema.index({ deviceUUID: 1, createdAt: -1 })

export const MailLogModel = mongoose.model<IMailLog>('MailLog', MailLogSchema)
