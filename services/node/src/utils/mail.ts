import nodemailer, { type TransportOptions } from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { ImapFlow } from 'imapflow'
import { decrypt } from './crypto'
import type { ISettings, IMailAccount } from '../models/settings.model'

/**
 * Gönderim için kullanılacak hesabı seçer.
 *
 * Sıra: istenen hesap → varsayılan işaretli hesap → ilk hesap → (hiç hesap
 * yoksa) eski tek-SMTP alanlarından türetilmiş sanal hesap → sunucunun ortak
 * SMTP'si. Böylece hesap tanımlamamış eski kullanıcılar da çalışmaya devam eder.
 */
export function pickAccount(s: ISettings | null, accountId?: string): IMailAccount | null {
  if (!s) return null

  if (s.mailAccounts?.length) {
    if (accountId) {
      const found = s.mailAccounts.id(accountId)
      if (found) return found
    }
    return s.mailAccounts.find(a => a.isDefault) ?? s.mailAccounts[0]
  }

  // Eskiye dönük: hesap listesi boşsa tek-SMTP alanlarını hesap gibi kullan
  if (s.smtpHost && s.smtpUser) {
    return {
      label: s.smtpUser, fromName: '', isDefault: true,
      smtpHost: s.smtpHost, smtpPort: s.smtpPort, smtpSecure: s.smtpSecure,
      smtpUser: s.smtpUser, smtpPass: s.smtpPass,
      saveToSent: false,
      imapHost: '', imapPort: 993, imapSecure: true,
      imapUser: '', imapPass: '', sentFolder: '',
    } as IMailAccount
  }

  return null
}

/** Hesap yoksa sunucunun ortak SMTP'sine düşer (eski davranış). */
export function buildTransporter(acc: IMailAccount | null) {
  const host = acc ? acc.smtpHost : process.env.SMTP_HOST
  const port = acc ? acc.smtpPort : Number(process.env.SMTP_PORT ?? 587)
  const secure = acc ? acc.smtpSecure : false
  const user = acc ? acc.smtpUser : process.env.SMTP_USER
  const pass = acc ? decrypt(acc.smtpPass) : process.env.SMTP_PASS

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { type: 'LOGIN', user, pass },
    tls: { rejectUnauthorized: false },
  } as TransportOptions)
}

/** Maildeki görünen gönderen adresi */
export function senderAddress(acc: IMailAccount | null, fallback = ''): string {
  if (acc?.smtpUser) {
    return acc.fromName ? `"${acc.fromName}" <${acc.smtpUser}>` : acc.smtpUser
  }
  return process.env.SMTP_USER ?? fallback
}

/**
 * Gönderilmiş klasörünü bulur.
 *
 * Klasör adı sunucudan sunucuya değişir ('Sent', 'INBOX.Sent', Almanca
 * kutularda 'Gesendete Elemente'...). IMAP'in SPECIAL-USE eklentisi `\Sent`
 * bayrağını verir; önce ona bakarız, yoksa yaygın isimleri deneriz.
 */
async function resolveSentFolder(client: ImapFlow, preferred: string): Promise<string> {
  if (preferred) return preferred

  const list = await client.list()

  const flagged = list.find(m => m.specialUse === '\\Sent')
  if (flagged) return flagged.path

  const common = ['Sent', 'INBOX.Sent', 'Sent Items', 'Sent Messages', 'Gesendete Elemente']
  const hit = list.find(m => common.some(c => c.toLowerCase() === m.path.toLowerCase()))
  return hit ? hit.path : 'Sent'
}

export interface SaveResult {
  saved: boolean
  folder: string
  error: string
}

/**
 * Gönderilen mailin bir kopyasını kullanıcının kendi "Gönderilmiş" klasörüne yazar.
 *
 * SMTP gönderimi bunu yapmaz — mail alıcıya gider ama gönderenin kutusunda
 * hiçbir iz kalmaz. Outlook/Thunderbird gibi istemciler de aynı şeyi ayrıca
 * IMAP APPEND ile yapar.
 *
 * ⚠️ Bu adım başarısız olsa bile mail GÖNDERİLMİŞTİR. Bu yüzden hata fırlatmaz,
 * sonucu döndürür — çağıran taraf gönderimi başarısız saymamalıdır.
 */
export async function saveToSentFolder(acc: IMailAccount, raw: Buffer): Promise<SaveResult> {
  const host = acc.imapHost || ''
  if (!host) return { saved: false, folder: '', error: 'IMAP sunucusu tanımlı değil' }

  const client = new ImapFlow({
    host,
    port: acc.imapPort || 993,
    secure: acc.imapSecure !== false,
    auth: {
      user: acc.imapUser || acc.smtpUser,
      pass: decrypt(acc.imapPass || acc.smtpPass),
    },
    tls: { rejectUnauthorized: false },
    logger: false,
  })

  try {
    await client.connect()
    const folder = await resolveSentFolder(client, acc.sentFolder)
    await client.append(folder, raw, ['\\Seen'])
    return { saved: true, folder, error: '' }
  } catch (err) {
    return { saved: false, folder: acc.sentFolder, error: (err as Error).message }
  } finally {
    try { await client.logout() } catch { /* bağlantı zaten kopmuş olabilir */ }
  }
}

/** IMAP bağlantısını dener ve bulunan Gönderilmiş klasörünü söyler. */
export async function testImap(acc: IMailAccount): Promise<{ ok: boolean; message: string }> {
  const host = acc.imapHost || ''
  if (!host) return { ok: false, message: 'IMAP sunucusu tanımlı değil' }

  const client = new ImapFlow({
    host,
    port: acc.imapPort || 993,
    secure: acc.imapSecure !== false,
    auth: {
      user: acc.imapUser || acc.smtpUser,
      pass: decrypt(acc.imapPass || acc.smtpPass),
    },
    tls: { rejectUnauthorized: false },
    logger: false,
  })

  try {
    await client.connect()
    const folder = await resolveSentFolder(client, acc.sentFolder)
    return { ok: true, message: `Bağlantı başarılı — Gönderilmiş klasörü: "${folder}"` }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  } finally {
    try { await client.logout() } catch { /* yoksay */ }
  }
}

export interface BuiltMessage {
  raw: Buffer
  messageId: string
}

/**
 * Mailin ham MIME içeriğini bir kez üretir.
 *
 * Aynı baytlar hem SMTP ile gönderilir hem de Gönderilmiş klasörüne yazılır;
 * böylece kullanıcının kutusundaki kopya, alıcıya giden mailin birebir aynısı
 * olur (aynı Message-ID dahil).
 */
export async function buildRawMessage(opts: {
  from: string
  replyTo?: string
  to: string[]
  subject: string
  text: string
  attachments?: Array<{ filename: string; content: string; encoding: string }>
}): Promise<BuiltMessage> {
  const composer = new MailComposer({
    from: opts.from,
    replyTo: opts.replyTo || opts.from,
    to: opts.to.join(', '),
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  })

  const mail = composer.compile()
  const messageId = mail.messageId()
  const raw = await mail.build()
  return { raw, messageId }
}
