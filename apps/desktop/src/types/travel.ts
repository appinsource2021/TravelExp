export interface Month {
  _id: string
  year: number
  month: number
  personName: string
  totalCost: number
  mailSent: boolean
  /** Son seyahat bitiminden delayMinutes sonra sunucu maili kendisi gönderir */
  autoSend?: { enabled: boolean; delayMinutes: number; lastError?: string }
  createdAt: string
}

/**
 * Bir gönderen hesabı. SMTP gönderir, IMAP ise gönderilen mailin kopyasını
 * kullanıcının kendi "Gönderilmiş" klasörüne yazar.
 *
 * Şifreler sunucudan ASLA gelmez — yalnızca `*PassSet` ile kayıtlı olup
 * olmadıkları bildirilir. `*Pass` alanları sadece yazma yönünde kullanılır.
 */
export interface MailAccount {
  _id: string
  label: string
  fromName: string
  isDefault: boolean

  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassSet?: boolean
  smtpPass?: string

  saveToSent: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapPassSet?: boolean
  imapPass?: string
  sentFolder: string
}

export interface MailLog {
  _id: string
  monthLabel: string
  fromAddress: string
  accountLabel: string
  to: string[]
  subject: string
  ok: boolean
  error: string
  /** SMTP'nin teslim için kabul ettiği adresler */
  accepted?: string[]
  /** SMTP'nin reddettiği adresler */
  rejected?: string[]
  savedToSent: boolean
  sentFolder: string
  saveError: string
  createdAt: string
}

export interface Settings {
  minCost: number
  maxCost: number
  emailTo: string[]
  emailFrom: string
  subjectPattern: string
  bodyText: string

  mailAccounts: MailAccount[]

  /** AI'a her ay üretiminde eklenen serbest metin yönerge */
  aiHint: string
  /** Bütçe aralığına izin verilen sapma (%) */
  aiTolerance: number

  // Eskiye dönük tek hesap alanları — sunucu bunları ilk erişimde
  // mailAccounts'a taşır, arayüzde artık düzenlenmez.
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassSet?: boolean
  smtpPass?: string
}

export interface Position {
  _id: string
  monthId: string
  date: string
  startTime: string
  endTime: string
  totalHours: string
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

export interface Destination {
  _id: string
  address: string
  km: number
  active: boolean
}

export interface Profile {
  homeAddress: string
  firma: string
  name: string
  surname: string
  birthDate: string
}

export const MONTH_NAMES = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'
]

export const REISEZWECK_OPTIONS = ['Business','Meeting','Training','Conference','Kundenbesuch','Sonstige']
