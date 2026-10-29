import mongoose, { Schema, Document, Types } from 'mongoose'

/**
 * Bir gönderen hesabı: mailin hangi kutudan çıkacağını ve kopyasının nereye
 * yazılacağını tanımlar.
 *
 * SMTP göndermeyi yapar; IMAP ise gönderilen mailin bir kopyasını kullanıcının
 * kendi "Gönderilmiş" klasörüne yazar. SMTP tek başına bunu YAPMAZ — bu yüzden
 * uygulamadan çıkan mailler kullanıcının kendi kutusunda görünmüyordu.
 */
export interface IMailAccount extends Types.Subdocument {
  label: string
  fromName: string
  isDefault: boolean

  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string

  // Gönderilmiş kopyası (opsiyonel). Boşsa SMTP bilgileri kullanılır.
  saveToSent: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapPass: string
  sentFolder: string
}

const MailAccountSchema = new Schema<IMailAccount>({
  label: { type: String, required: true },
  fromName: { type: String, default: '' },
  isDefault: { type: Boolean, default: false },

  smtpHost: { type: String, default: '' },
  smtpPort: { type: Number, default: 587 },
  smtpSecure: { type: Boolean, default: false },
  smtpUser: { type: String, default: '' },
  // AES-256-GCM ile şifreli saklanır, asla düz metin dönülmez
  smtpPass: { type: String, default: '' },

  saveToSent: { type: Boolean, default: false },
  imapHost: { type: String, default: '' },
  imapPort: { type: Number, default: 993 },
  imapSecure: { type: Boolean, default: true },
  imapUser: { type: String, default: '' },
  imapPass: { type: String, default: '' },
  // Sunucudan sunucuya değişir: 'Sent', 'INBOX.Sent', 'Gesendete Elemente'...
  // Boş bırakılırsa gönderim sırasında otomatik bulunmaya çalışılır.
  sentFolder: { type: String, default: '' },
})

export interface ISettings extends Document {
  deviceUUID: string
  minCost: number
  maxCost: number
  emailTo: string[]
  emailFrom: string
  subjectPattern: string
  bodyText: string

  mailAccounts: Types.DocumentArray<IMailAccount>

  /** AI'a her ay üretiminde eklenen serbest metin yönerge */
  aiHint: string
  /** Bütçe aralığına izin verilen sapma (%). 0 = kesin aralık. */
  aiTolerance: number

  // ── Eskiye dönük tek hesap alanları ──────────────────────────────
  // mailAccounts boşsa bunlar kullanılır. Yeni kayıt yapılmaz; ayarlar
  // ilk açılışta otomatik olarak mailAccounts'a taşınır (migrateLegacySmtp).
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
}

const SettingsSchema = new Schema<ISettings>({
  deviceUUID: { type: String, required: true, unique: true },
  minCost: { type: Number, default: 1300 },
  maxCost: { type: Number, default: 1400 },
  emailTo: { type: [String], default: [] },
  emailFrom: { type: String, default: '' },
  subjectPattern: { type: String, default: 'Reisekosten {#Name} {#Year}-{#Month}' },
  bodyText: { type: String, default: 'Anbei die Reisekostenabrechnung für {#Month} {#Year}.' },

  mailAccounts: { type: [MailAccountSchema], default: [] },

  aiHint: { type: String, default: '', maxlength: 4000 },
  aiTolerance: { type: Number, default: 0, min: 0, max: 25 },

  smtpHost: { type: String, default: '' },
  smtpPort: { type: Number, default: 587 },
  smtpSecure: { type: Boolean, default: false },
  smtpUser: { type: String, default: '' },
  smtpPass: { type: String, default: '' },
})

export const SettingsModel = mongoose.model<ISettings>('Settings', SettingsSchema)
