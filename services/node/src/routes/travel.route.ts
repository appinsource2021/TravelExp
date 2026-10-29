import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify'
import { Types, type Document } from 'mongoose'
import type { IPosition } from '../models/position.model'
import { MonthModel, type IMonth } from '../models/month.model'
import { PositionModel } from '../models/position.model'
import { DestinationModel } from '../models/destination.model'
import { ProfileModel } from '../models/profile.model'
import { UserModel } from '../models/user.model'
import { getSession } from '../utils/getSession'
import { generatePositions, extractDays } from '../utils/shuffle'
import { generatePositionsWithAi } from '../utils/aiShuffle'
import { SettingsModel, type ISettings, type IMailAccount } from '../models/settings.model'
import { MailLogModel } from '../models/maillog.model'
import { MONTH_NAMES_TR } from '../utils/monthNames'
import { documentLockedUntil, lastTripEnd, berlinNowKey, addMinutesToKey } from '../utils/tripEnd'

const AUTO_SEND_DELAYS = [15, 30, 45, 60]
import { encrypt } from '../utils/crypto'
import {
  pickAccount, buildTransporter, senderAddress,
  buildRawMessage, saveToSentFolder, testImap,
} from '../utils/mail'

/**
 * Eski tek-SMTP ayarını hesap listesine taşır (bir kez).
 *
 * Eskiden gönderen hesap `settings` üzerinde tek bir alan kümesiydi. Artık
 * birden çok hesap tanımlanabiliyor. Kullanıcı hiçbir şey kaybetmesin diye
 * mevcut ayar ilk erişimde otomatik olarak listeye aktarılır.
 */
async function migrateLegacySmtp(s: ISettings): Promise<ISettings> {
  if (s.mailAccounts?.length || !s.smtpHost || !s.smtpUser) return s

  s.mailAccounts.push({
    label: s.smtpUser,
    fromName: '',
    isDefault: true,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpSecure: s.smtpSecure,
    smtpUser: s.smtpUser,
    smtpPass: s.smtpPass,
    saveToSent: false,
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    imapUser: '',
    imapPass: '',
    sentFolder: '',
  } as IMailAccount)

  await s.save()
  return s
}

/** Şifreler asla dışarı verilmez; yalnızca "tanımlı mı" bilgisi döner. */
const publicAccount = (a: IMailAccount) => ({
  _id: String(a._id),
  label: a.label,
  fromName: a.fromName,
  isDefault: a.isDefault,
  smtpHost: a.smtpHost, smtpPort: a.smtpPort, smtpSecure: a.smtpSecure,
  smtpUser: a.smtpUser, smtpPassSet: Boolean(a.smtpPass),
  saveToSent: a.saveToSent,
  imapHost: a.imapHost, imapPort: a.imapPort, imapSecure: a.imapSecure,
  imapUser: a.imapUser, imapPassSet: Boolean(a.imapPass),
  sentFolder: a.sentFolder,
})

/**
 * Hesap gövdesini şemaya yazar. Şifre alanları yalnızca YENİ bir değer
 * geldiğinde güncellenir — boş gönderilirse kayıtlı şifre korunur.
 */
function applyAccountBody(acc: IMailAccount, body: Record<string, unknown>) {
  const str = (k: string) => typeof body[k] === 'string' ? body[k] as string : undefined
  const num = (k: string) => typeof body[k] === 'number' ? body[k] as number : undefined
  const bool = (k: string) => typeof body[k] === 'boolean' ? body[k] as boolean : undefined

  acc.label = str('label') ?? acc.label
  acc.fromName = str('fromName') ?? acc.fromName
  acc.smtpHost = str('smtpHost') ?? acc.smtpHost
  acc.smtpPort = num('smtpPort') ?? acc.smtpPort
  acc.smtpSecure = bool('smtpSecure') ?? acc.smtpSecure
  acc.smtpUser = str('smtpUser') ?? acc.smtpUser
  acc.saveToSent = bool('saveToSent') ?? acc.saveToSent
  acc.imapHost = str('imapHost') ?? acc.imapHost
  acc.imapPort = num('imapPort') ?? acc.imapPort
  acc.imapSecure = bool('imapSecure') ?? acc.imapSecure
  acc.imapUser = str('imapUser') ?? acc.imapUser
  acc.sentFolder = str('sentFolder') ?? acc.sentFolder

  const smtpPass = str('smtpPass')
  if (smtpPass) acc.smtpPass = encrypt(smtpPass)

  const imapPass = str('imapPass')
  if (imapPass) acc.imapPass = encrypt(imapPass)
}

/**
 * Ay kayıtları cihaza bağlıdır (`deviceUUID`). Bir cihazın başka bir cihazın ayına
 * erişmesini engeller. Geçersiz id, olmayan ay ve başkasının ayı aynı sonucu verir —
 * "yok" ile "senin değil" ayrımı dışarı sızdırılmaz.
 */
async function loadOwnedMonth(monthId: string, deviceUUID: string) {
  if (!Types.ObjectId.isValid(monthId)) return null
  const month = await MonthModel.findById(monthId)
  if (!month || month.deviceUUID !== deviceUUID) return null
  return month
}

type MailResult = { code: number; body: Record<string, unknown> }

/**
 * Bir ayın masraf beyanını mail olarak gönderir. Elle gönderim (route) ve
 * otomatik gönderim (zamanlayıcı) aynı yoldan geçer: bitiş kilidi, alıcı
 * kontrolü ve gönderim geçmişi ikisinde de birebir aynıdır.
 */
async function deliverMonthMail(
  log: FastifyBaseLogger, month: IMonth, deviceUUID: string,
  pdfBase64: string, pdfFilename: string, accountId?: string,
): Promise<MailResult> {
  // Son seyahat bitmeden masraf beyanı gönderilemez
  const lockedUntil = documentLockedUntil(await PositionModel.find({ monthId: month._id }))
  if (lockedUntil) {
    return {
      code: 409,
      body: {
        error: `Son seyahat ${lockedUntil.date} ${lockedUntil.time}'da bitiyor. Mail ancak bundan sonra gönderilebilir.`,
        lockedUntil,
      },
    }
  }

  const sett = await SettingsModel.findOne({ deviceUUID: deviceUUID })
  if (!sett || sett.emailTo.length === 0) {
    return { code: 400, body: { error: 'Ayarlarda alıcı e-posta adresi eksik' } }
  }

  const monthName = MONTH_NAMES_TR[month.month - 1]
  const replaceTpl = (tpl: string) =>
    tpl
      .replace(/\{#Year\}/g, String(month.year))
      .replace(/\{#Month\}/g, monthName)
      .replace(/\{#Name\}/g, month.personName)

  const subject = replaceTpl(sett.subjectPattern || 'Reisekosten {#Name} {#Year}-{#Month}')
  const body = replaceTpl(sett.bodyText || 'Anbei die Reisekostenabrechnung.')

  await migrateLegacySmtp(sett)
  const acc = pickAccount(sett, accountId)
  const from = senderAddress(acc)

  // Her deneme — başarılı ya da başarısız — geçmişe yazılır.
  const logBase = {
    deviceUUID: deviceUUID,
    monthId: month._id,
    monthLabel: `${monthName} ${month.year}`,
    fromAddress: from,
    accountLabel: acc?.label ?? 'Sunucu SMTP',
    to: sett.emailTo,
    subject,
  }

  // Ham MIME bir kez üretilir: SMTP'ye giden baytlarla Gönderilmiş
  // klasörüne yazılan baytlar birebir aynı olsun diye (Message-ID dahil).
  const { raw, messageId } = await buildRawMessage({
    from,
    replyTo: sett.emailFrom || from,
    to: sett.emailTo,
    subject,
    text: body,
    attachments: [{
      filename: pdfFilename,
      content: pdfBase64,
      encoding: 'base64',
    }],
  })

  const transporter = buildTransporter(acc)

  let info
  try {
    await transporter.verify()
    info = await transporter.sendMail({
      envelope: { from: acc?.smtpUser || process.env.SMTP_USER || '', to: sett.emailTo },
      raw,
    } as Parameters<typeof transporter.sendMail>[0])
  } catch (err) {
    const msg = (err as Error).message
    await MailLogModel.create({ ...logBase, ok: false, error: msg, messageId })
    log.error({ err: msg }, 'Email failed')
    return { code: 500, body: { error: msg } }
  }

  if (info.rejected && info.rejected.length > 0) {
    const msg = `Alıcı reddedildi: ${info.rejected.join(', ')}`
    await MailLogModel.create({ ...logBase, ok: false, error: msg, messageId })
    return { code: 500, body: { error: msg } }
  }

  // Gönderilmiş klasörüne kopyalama AYRI bir adımdır ve başarısız olsa bile
  // mail gönderilmiştir — bu yüzden gönderimi başarısız saymıyoruz.
  let save = { saved: false, folder: '', error: '' }
  if (acc?.saveToSent) {
    save = await saveToSentFolder(acc, raw)
    if (!save.saved) log.warn({ err: save.error }, 'Sent klasörüne yazılamadı')
  }

  await MailLogModel.create({
    ...logBase, ok: true, messageId,
    // SMTP'nin adres bazında kabul/ret listesi — "kime ulaştı" sorusunun cevabı
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    savedToSent: save.saved, sentFolder: save.folder, saveError: save.error,
  })

  log.info({ messageId, accepted: info.accepted, savedToSent: save.saved }, 'Email sent')

  // Gönderildi → otomatik gönderim kapanır, saklanan PDF'e artık gerek yok
  await MonthModel.findByIdAndUpdate(month._id, {
    mailSent: true,
    'autoSend.enabled': false, 'autoSend.pdfBase64': '', 'autoSend.lastError': '',
  })

  return {
    code: 200,
    body: {
      success: true,
      messageId,
      accepted: info.accepted,
      from,
      savedToSent: save.saved,
      sentFolder: save.folder,
      saveError: save.error,
    },
  }
}

const travelRoute: FastifyPluginAsync = async (app) => {

  // ── Destinations ────────────────────────────────────────────
  // Destinations cihaza bağlı değildir, ortak veridir — bu yüzden sahiplik
  // filtresi yok, yalnızca geçerli oturum şartı aranır.
  app.get('/destinations', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    return reply.send(await DestinationModel.find())
  })

  app.post<{ Body: { address: string; km: number } }>('/destinations', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    return reply.code(201).send(await DestinationModel.create(req.body))
  })

  app.patch<{ Params: { id: string }; Body: { active: boolean } }>('/destinations/:id/toggle', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const dest = await DestinationModel.findByIdAndUpdate(req.params.id, { active: req.body.active }, { new: true })
    return reply.send(dest)
  })

  app.delete<{ Params: { id: string } }>('/destinations/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    await DestinationModel.findByIdAndDelete(req.params.id)
    return reply.send({ success: true })
  })

  // ── Profile ──────────────────────────────────────────────────
  app.get('/profile', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    let profile = await ProfileModel.findOne({ deviceUUID: session.deviceUUID })
    if (!profile) profile = await ProfileModel.create({ deviceUUID: session.deviceUUID })
    return reply.send(profile)
  })

  app.put<{ Body: { homeAddress: string; firma: string } }>('/profile', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const profile = await ProfileModel.findOneAndUpdate(
      { deviceUUID: session.deviceUUID },
      { $set: req.body },
      { new: true, upsert: true }
    )
    return reply.send(profile)
  })

  // ── Months ───────────────────────────────────────────────────
  app.get('/months', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    return reply.send(
      await MonthModel.find({ deviceUUID: session.deviceUUID }).sort({ year: -1, month: -1 })
    )
  })

  app.post<{ Body: { year: number; month: number } }>('/months', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const user = await UserModel.findOne({ deviceUUID: session.deviceUUID })
    const personName = user ? `${user.name} ${user.surname}` : 'Bilinmiyor'

    const month = await MonthModel.create({
      deviceUUID: session.deviceUUID,
      year: req.body.year,
      month: req.body.month,
      personName,
      totalCost: 0,
    })
    return reply.code(201).send(month)
  })

  // ── Settings ─────────────────────────────────────────────────
  /** Şifre asla dışarı verilmez; yalnızca "ayarlı mı" bilgisi döner */
  const publicSettings = (s: ISettings) => ({
    minCost: s.minCost, maxCost: s.maxCost,
    emailTo: s.emailTo, emailFrom: s.emailFrom,
    subjectPattern: s.subjectPattern, bodyText: s.bodyText,
    smtpHost: s.smtpHost, smtpPort: s.smtpPort,
    smtpSecure: s.smtpSecure, smtpUser: s.smtpUser,
    smtpPassSet: Boolean(s.smtpPass),
    mailAccounts: (s.mailAccounts ?? []).map(publicAccount),
    aiHint: s.aiHint, aiTolerance: s.aiTolerance,
  })

  app.get('/settings', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })
    let s = await SettingsModel.findOne({ deviceUUID: session.deviceUUID })
    if (!s) s = await SettingsModel.create({ deviceUUID: session.deviceUUID })
    await migrateLegacySmtp(s)
    return reply.send(publicSettings(s))
  })

  app.put<{ Body: Partial<Record<string, unknown>> }>('/settings', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    // mailAccounts BİLEREK ayıklanır: arayüz ayarları geri gönderirken hesapları
    // da yollar, ama o kopyada şifreler yoktur (publicAccount onları gizler).
    // $set ile yazılsaydı kayıtlı SMTP/IMAP şifreleri silinirdi.
    // Hesaplar yalnızca /settings/accounts route'larından yönetilir.
    const { smtpPass, smtpPassSet, mailAccounts, ...rest } = req.body as Record<string, unknown>
    const update: Record<string, unknown> = { ...rest }

    // Şifre alanı yalnızca yeni bir değer geldiğinde güncellenir;
    // boş gönderilirse kayıtlı şifre korunur
    if (typeof smtpPass === 'string' && smtpPass.length > 0) {
      update.smtpPass = encrypt(smtpPass)
    }

    const s = await SettingsModel.findOneAndUpdate(
      { deviceUUID: session.deviceUUID },
      { $set: update },
      { new: true, upsert: true }
    )
    return reply.send(publicSettings(s!))
  })

  // ── Gönderen hesapları ───────────────────────────────────────
  /** Oturumun ayar kaydını getirir, yoksa oluşturur, eski SMTP'yi taşır. */
  async function loadSettings(deviceUUID: string) {
    let s = await SettingsModel.findOne({ deviceUUID })
    if (!s) s = await SettingsModel.create({ deviceUUID })
    return migrateLegacySmtp(s)
  }

  app.post<{ Body: Record<string, unknown> }>('/settings/accounts', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const s = await loadSettings(session.deviceUUID)
    const acc = s.mailAccounts.create({ label: String(req.body.label ?? 'Yeni hesap') })
    applyAccountBody(acc, req.body)
    // İlk hesap otomatik varsayılan olur
    if (s.mailAccounts.length === 0) acc.isDefault = true
    s.mailAccounts.push(acc)
    await s.save()

    return reply.code(201).send(publicAccount(acc))
  })

  app.put<{ Params: { accId: string }; Body: Record<string, unknown> }>(
    '/settings/accounts/:accId', async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.code(401).send({ error: 'Unauthorized' })

      const s = await loadSettings(session.deviceUUID)
      const acc = Types.ObjectId.isValid(req.params.accId) ? s.mailAccounts.id(req.params.accId) : null
      if (!acc) return reply.code(404).send({ error: 'Hesap bulunamadı' })

      applyAccountBody(acc, req.body)

      // Varsayılan tektir: bu hesap varsayılan yapıldıysa diğerleri düşer
      if (req.body.isDefault === true) {
        s.mailAccounts.forEach(a => { a.isDefault = String(a._id) === String(acc._id) })
      }

      await s.save()
      return reply.send(publicAccount(acc))
    })

  app.delete<{ Params: { accId: string } }>('/settings/accounts/:accId', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const s = await loadSettings(session.deviceUUID)
    const acc = Types.ObjectId.isValid(req.params.accId) ? s.mailAccounts.id(req.params.accId) : null
    if (!acc) return reply.code(404).send({ error: 'Hesap bulunamadı' })

    const wasDefault = acc.isDefault
    acc.deleteOne()
    // Varsayılan silindiyse listede biri varsayılansız kalmasın
    if (wasDefault && s.mailAccounts.length > 0) s.mailAccounts[0].isDefault = true
    await s.save()

    return reply.send({ success: true })
  })

  // ── Bağlantı testleri ────────────────────────────────────────
  /** Hesap id'si verilirse o hesap, verilmezse varsayılan hesap denenir. */
  app.post<{ Body: { accountId?: string } }>('/settings/smtp/test', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const s = await loadSettings(session.deviceUUID)
    const acc = pickAccount(s, req.body?.accountId)
    if (!acc?.smtpHost || !acc.smtpUser) {
      return reply.code(400).send({ ok: false, error: 'SMTP bilgileri eksik' })
    }

    try {
      await buildTransporter(acc).verify()
      return reply.send({ ok: true, message: `${acc.smtpUser} ile bağlantı başarılı` })
    } catch (err) {
      return reply.code(400).send({ ok: false, error: (err as Error).message })
    }
  })

  app.post<{ Body: { accountId?: string } }>('/settings/imap/test', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const s = await loadSettings(session.deviceUUID)
    const acc = pickAccount(s, req.body?.accountId)
    if (!acc?.imapHost) {
      return reply.code(400).send({ ok: false, error: 'IMAP bilgileri eksik' })
    }

    const res = await testImap(acc)
    return res.ok ? reply.send(res) : reply.code(400).send({ ok: false, error: res.message })
  })

  // ── Bir ayın gönderim geçmişi ────────────────────────────────
  // Ay detayında "bu ay kimlere gitti" sorusunu cevaplar.
  app.get<{ Params: { monthId: string } }>('/months/:monthId/mail-log', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const month = await loadOwnedMonth(req.params.monthId, session.deviceUUID)
    if (!month) return reply.code(404).send({ error: 'Month not found' })

    return reply.send(
      await MailLogModel.find({ deviceUUID: session.deviceUUID, monthId: month._id })
        .sort({ createdAt: -1 })
    )
  })

  // ── Gönderim geçmişi ─────────────────────────────────────────
  app.get<{ Querystring: { limit?: string } }>('/mail-log', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const logs = await MailLogModel
      .find({ deviceUUID: session.deviceUUID })
      .sort({ createdAt: -1 })
      .limit(limit)

    return reply.send(logs)
  })

  // ── Send Email ───────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { pdfBase64: string; pdfFilename: string; accountId?: string }
  }>('/months/:id/send-email', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const month = await loadOwnedMonth(req.params.id, session.deviceUUID)
    if (!month) return reply.code(404).send({ error: 'Month not found' })

    const res = await deliverMonthMail(
      app.log, month, session.deviceUUID,
      req.body.pdfBase64, req.body.pdfFilename, req.body.accountId,
    )
    return reply.code(res.code).send(res.body)
  })

  // ── Otomatik gönderim ────────────────────────────────────────
  // Son seyahatin bitişinden delayMinutes sonra sunucu maili kendisi gönderir.
  // PDF tarayıcıda üretildiği için sayfa onu buraya yükler; pozisyonlar
  // değişince PDF boşaltılır ve sayfa güncelini yeniden yükler.
  app.put<{
    Params: { id: string }
    Body: { enabled: boolean; delayMinutes: number; pdfBase64?: string; pdfFilename?: string }
  }>('/months/:id/auto-send', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const month = await loadOwnedMonth(req.params.id, session.deviceUUID)
    if (!month) return reply.code(404).send({ error: 'Month not found' })
    if (month.mailSent) return reply.code(409).send({ error: 'Bu ayın maili zaten gönderildi' })

    const { enabled, delayMinutes, pdfBase64, pdfFilename } = req.body
    if (!AUTO_SEND_DELAYS.includes(delayMinutes)) {
      return reply.code(400).send({ error: `Bekleme süresi ${AUTO_SEND_DELAYS.join('/')} dakika olmalı` })
    }
    if (enabled && !pdfBase64) {
      return reply.code(400).send({ error: 'Otomatik gönderim için PDF gerekli' })
    }

    month.autoSend.enabled = Boolean(enabled)
    month.autoSend.delayMinutes = delayMinutes
    month.autoSend.pdfBase64 = enabled ? pdfBase64! : ''
    month.autoSend.pdfFilename = enabled ? (pdfFilename ?? '') : ''
    month.autoSend.lastError = ''
    await month.save()

    return reply.send({
      autoSend: { enabled: month.autoSend.enabled, delayMinutes, lastError: '' },
    })
  })

  // Her dakika: vakti gelen ayları gönder
  let ticking = false
  const autoSendTick = async () => {
    if (ticking) return
    ticking = true
    try {
      const candidates = await MonthModel.find({ 'autoSend.enabled': true, mailSent: false })
      for (const m of candidates) {
        const end = lastTripEnd(await PositionModel.find({ monthId: m._id }))
        if (!end || berlinNowKey() < addMinutesToKey(end.key, m.autoSend.delayMinutes)) continue

        // Önce sahiplen: ikinci bir tick ya da elle gönderim aynı ayı tekrar göndermesin
        const claimed = await MonthModel.findOneAndUpdate(
          { _id: m._id, 'autoSend.enabled': true, mailSent: false },
          { $set: { 'autoSend.enabled': false } },
        ).select('+autoSend.pdfBase64')
        if (!claimed) continue

        if (!claimed.autoSend.pdfBase64) {
          const msg = 'PDF güncel değil — ay sayfasını açıp otomatik gönderimi yeniden açın'
          await MonthModel.updateOne({ _id: m._id }, { $set: { 'autoSend.lastError': msg } })
          app.log.warn({ monthId: String(m._id) }, msg)
          continue
        }

        const res = await deliverMonthMail(
          app.log, claimed, claimed.deviceUUID,
          claimed.autoSend.pdfBase64, claimed.autoSend.pdfFilename,
        )
        if (res.code === 200) {
          app.log.info({ monthId: String(m._id) }, 'Otomatik mail gönderildi')
        } else {
          await MonthModel.updateOne({ _id: m._id }, { $set: { 'autoSend.lastError': String(res.body.error) } })
          app.log.error({ monthId: String(m._id), err: res.body.error }, 'Otomatik mail gönderilemedi')
        }
      }
    } catch (err) {
      app.log.error({ err: (err as Error).message }, 'Otomatik gönderim turu başarısız')
    } finally {
      ticking = false
    }
  }
  const autoSendTimer = setInterval(autoSendTick, 60_000)
  app.addHook('onClose', async () => clearInterval(autoSendTimer))

  app.delete<{ Params: { id: string } }>('/months/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const month = await loadOwnedMonth(req.params.id, session.deviceUUID)
    if (!month) return reply.code(404).send({ error: 'Month not found' })

    await MonthModel.findByIdAndDelete(month._id)
    await PositionModel.deleteMany({ monthId: month._id })
    return reply.send({ success: true })
  })

  // ── Positions ────────────────────────────────────────────────
  app.get<{ Params: { monthId: string } }>('/months/:monthId/positions', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const month = await loadOwnedMonth(req.params.monthId, session.deviceUUID)
    if (!month) return reply.code(404).send({ error: 'Month not found' })

    return reply.send(
      await PositionModel.find({ monthId: month._id }).sort({ sortOrder: 1 })
    )
  })

  app.post<{ Params: { monthId: string }; Body: { useAi?: boolean } }>('/months/:monthId/shuffle', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const month = await MonthModel.findById(req.params.monthId)
    if (!month) return reply.code(404).send({ error: 'Month not found' })

    const destinations = await DestinationModel.find({ active: { $ne: false } })
    if (destinations.length === 0) return reply.code(400).send({ error: 'Settings\'te en az bir adres aktif olmalı' })

    const profile = await ProfileModel.findOne({ deviceUUID: session.deviceUUID })
    // `||` bilerek: profil var ama ev adresi BOŞ olabiliyor. `??` boş metni
    // geçirir, gecelik seyahatin dönüş satırı destination'sız kalır ve
    // Position doğrulaması "destination is required" ile 500 verir.
    const homeAddress = profile?.homeAddress || 'Home'

    const sett = await SettingsModel.findOne({ deviceUUID: session.deviceUUID })
    const minCost = sett?.minCost ?? 1300
    const maxCost = sett?.maxCost ?? 1400

    const allPrevMonths = await MonthModel.find({
      deviceUUID: session.deviceUUID,
      _id: { $ne: month._id },
    })

    let prevMonthDays: number[] = []
    const prevDestSequences: string[][] = []

    for (const pm of allPrevMonths) {
      const prevPositions = await PositionModel.find({ monthId: pm._id }).sort({ sortOrder: 1 })
      if (prevPositions.length === 0) continue
      prevMonthDays = [...new Set([...prevMonthDays, ...prevPositions.map(p => parseInt(p.date.split('.')[0]))])]
      prevDestSequences.push(prevPositions.map(p => p.destination))
    }

    // ── AI yolu (opsiyonel) ────────────────────────────────────
    // İstenirse plan Claude'a kurdurulur. AI yalnızca gün/adres/amaç seçer;
    // para hesabı her iki yolda da aynı deterministik koddan geçer.
    // Herhangi bir aksilikte sessizce klasik üretime düşülür — AI hiçbir
    // zaman tek yol değildir, "üret" düğmesi her hâlükârda çalışır.
    let generated
    let generatedBy: 'shuffle' | 'ai' = 'shuffle'
    let generatedNote = ''
    let aiError = ''

    if (req.body?.useAi) {
      // Son 5 ayın özeti — modele tekrardan kaçınması için verilir
      const recent = [...allPrevMonths]
        .sort((a, b) => (b.year - a.year) || (b.month - a.month))
        .slice(0, 5)

      const history = []
      for (const pm of recent) {
        const pos = await PositionModel.find({ monthId: pm._id }).sort({ sortOrder: 1 })
        history.push({
          label: `${MONTH_NAMES_TR[pm.month - 1]} ${pm.year}`,
          total: pm.totalCost ?? 0,
          trips: pos.map(p => ({
            day: parseInt(p.date.split('.')[0]),
            destination: p.destination,
            isOvernight: p.isOvernight,
          })),
        })
      }

      try {
        const ai = await generatePositionsWithAi({
          year: month.year, month: month.month,
          destinations, homeAddress, minCost, maxCost, history,
          hint: sett?.aiHint ?? '',
          tolerance: sett?.aiTolerance ?? 0,
        })
        generated = ai.positions
        generatedBy = 'ai'
        generatedNote = ai.reasoning
        app.log.info({ total: ai.total, attempts: ai.attempts }, 'AI ile ay üretildi')
      } catch (err) {
        aiError = (err as Error).message
        app.log.warn({ err: aiError }, 'AI üretimi başarısız, klasik üretime dönülüyor')
      }
    }

    if (!generated) {
      generated = generatePositions({
        year: month.year, month: month.month,
        destinations, homeAddress, prevMonthDays, minCost, maxCost,
        prevDestSequences,
      })
    }

    // Eski pozisyonlar ANCAK yeni plan hazır olduktan sonra silinir —
    // AI hata verirse kullanıcı verisiz kalmasın.
    await PositionModel.deleteMany({ monthId: month._id })
    await PositionModel.insertMany(generated.map(p => ({ ...p, monthId: month._id })))

    const total = parseFloat(generated.reduce((s, p) => s + p.gesamt, 0).toFixed(2))
    month.totalCost = total
    month.generatedBy = generatedBy
    month.generatedNote = generatedNote
    // Yeni plan → otomatik gönderim için saklanan PDF eskidi
    month.autoSend.pdfBase64 = ''
    await month.save()

    return reply.send({
      positions: await PositionModel.find({ monthId: month._id }).sort({ sortOrder: 1 }),
      total,
      generatedBy,
      generatedNote,
      aiError,
    })
  })

  app.post<{
    Params: { monthId: string }
    Body: { positions: Array<Omit<IPosition, 'monthId' | keyof Document>> }
  }>('/months/:monthId/positions/bulk', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })

    const month = await MonthModel.findById(req.params.monthId)
    if (!month) return reply.code(404).send({ error: 'Month not found' })

    await PositionModel.deleteMany({ monthId: month._id })

    const docs = req.body.positions.map((p, i) => ({ ...p, monthId: month._id, sortOrder: i }))
    await PositionModel.insertMany(docs)

    const all = await PositionModel.find({ monthId: month._id }).sort({ sortOrder: 1 })
    const total = parseFloat(all.reduce((s, p) => s + p.gesamt, 0).toFixed(2))
    // Pozisyonlar değişti → otomatik gönderim için saklanan PDF eskidi
    await MonthModel.findByIdAndUpdate(month._id, { totalCost: total, 'autoSend.pdfBase64': '' })

    return reply.code(201).send({ positions: all, total })
  })

  app.put<{ Params: { id: string }; Body: Partial<{ reisezweck: string; date: string }> }>(
    '/positions/:id', async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.code(401).send({ error: 'Unauthorized' })

      // Pozisyonun sahipliği bagli oldugu ay uzerinden dogrulanir.
      // Once oku, sahipligi kanitla, ANCAK ONDAN SONRA yaz.
      if (!Types.ObjectId.isValid(req.params.id)) {
        return reply.code(404).send({ error: 'Not found' })
      }
      const existing = await PositionModel.findById(req.params.id)
      if (!existing) return reply.code(404).send({ error: 'Not found' })

      const owned = await loadOwnedMonth(String(existing.monthId), session.deviceUUID)
      if (!owned) return reply.code(404).send({ error: 'Not found' })

      const update: Partial<{ reisezweck: string; date: string }> = {}
      if (req.body.reisezweck !== undefined) update.reisezweck = req.body.reisezweck

      if (req.body.date !== undefined) {
        // Gönderilmiş PDF'teki tarihler sonradan değişmesin
        if (owned.mailSent) {
          return reply.code(409).send({ error: 'Mail gönderildi, tarih artık değiştirilemez' })
        }
        const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(req.body.date)
        const day = m ? Number(m[1]) : 0
        const daysInMonth = new Date(owned.year, owned.month, 0).getDate()
        if (!m || Number(m[2]) !== owned.month || Number(m[3]) !== owned.year % 100 || day < 1 || day > daysInMonth) {
          return reply.code(400).send({ error: 'Tarih bu ayın içinde olmalı (GG.AA.YY)' })
        }
        update.date = req.body.date
      }

      const position = await PositionModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
      if (!position) return reply.code(404).send({ error: 'Not found' })

      // Tarih değiştiyse satırları tarihe göre yeniden sırala (aynı gün içindeki sıra korunur)
      if (update.date) {
        const all = await PositionModel.find({ monthId: position.monthId }).sort({ sortOrder: 1 })
        const dayOf = (d: string) => Number(d.slice(0, 2))
        const sorted = all
          .map((p, i) => ({ p, i }))
          .sort((a, b) => dayOf(a.p.date) - dayOf(b.p.date) || a.i - b.i)
        await PositionModel.bulkWrite(sorted.map(({ p }, i) => ({
          updateOne: { filter: { _id: p._id }, update: { $set: { sortOrder: i } } },
        })))
      }

      const positions = await PositionModel.find({ monthId: position.monthId })
      const total = parseFloat(positions.reduce((s, p) => s + p.gesamt, 0).toFixed(2))
      // Pozisyon değişti → otomatik gönderim için saklanan PDF eskidi
      await MonthModel.findByIdAndUpdate(position.monthId, { totalCost: total, 'autoSend.pdfBase64': '' })

      return reply.send(position)
    }
  )
}

export default travelRoute
