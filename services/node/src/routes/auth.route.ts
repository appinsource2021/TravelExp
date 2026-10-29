import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { createHash, timingSafeEqual } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { UserModel, type IUser } from '../models/user.model'
import { SessionModel } from '../models/session.model'
import { VerificationModel } from '../models/verification.model'
import { MonthModel } from '../models/month.model'
import { ProfileModel } from '../models/profile.model'
import { SettingsModel } from '../models/settings.model'
import { getSession } from '../utils/getSession'
import { sendVerificationCode } from '../utils/mailer'
import type { ScanPayload, RegisterPayload, EmailRequestPayload, EmailVerifyPayload } from '../types'

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7)
const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Web'de QR yerine sabit kodla giriş. Kod .env'de; boşsa özellik kapalı.
const WEB_LOGIN_CODE = process.env.WEB_LOGIN_CODE?.trim() ?? ''
// Kodla hangi hesaba girileceği. Boşsa ve tek kullanıcı varsa o kullanılır.
const WEB_LOGIN_EMAIL = process.env.WEB_LOGIN_EMAIL?.trim().toLowerCase() ?? ''
// Deneme sınırı genel tutulur: istekler nginx'ten geldiği için IP ayırt edilemiyor
const CODE_MAX_FAILS = 10
const CODE_LOCK_MINUTES = 15
let codeFails: number[] = []

const sha256 = (s: string) => createHash('sha256').update(s).digest()

function codeMatches(input: string) {
  return timingSafeEqual(sha256(input), sha256(WEB_LOGIN_CODE))
}

async function findCodeLoginUser() {
  if (WEB_LOGIN_EMAIL) return UserModel.findOne({ email: WEB_LOGIN_EMAIL })
  const users = await UserModel.find().limit(2)
  return users.length === 1 ? users[0] : null
}

/** Oturum açıp masaüstü tarayıcıya bildirir */
async function grantSession(app: FastifyInstance, socketId: string, deviceUUID: string, user: IUser) {
  const token = uuidv4()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS)

  await SessionModel.create({
    token,
    deviceUUID,
    user: { name: user.name, surname: user.surname },
    expiresAt,
  })

  app.socketRegistry.send(socketId, 'auth:success', {
    token,
    user: { name: user.name, surname: user.surname },
  })
}

/**
 * Hesabın tüm verisini yeni cihaz kimliğine taşır.
 * Cihaz kimliği iOS güncellemesinde değiştiği için hesap e-postaya bağlıdır;
 * kimlik değiştiğinde veri kaybolmasın diye burada devrediyoruz.
 */
async function moveDataToDevice(oldUUID: string, newUUID: string) {
  if (oldUUID === newUUID) return

  // Hedef kimlikte artık kayıt varsa temizle — unique index çakışmasın
  await Promise.all([
    ProfileModel.deleteMany({ deviceUUID: newUUID }),
    SettingsModel.deleteMany({ deviceUUID: newUUID }),
  ])

  await Promise.all([
    MonthModel.updateMany({ deviceUUID: oldUUID }, { $set: { deviceUUID: newUUID } }),
    ProfileModel.updateMany({ deviceUUID: oldUUID }, { $set: { deviceUUID: newUUID } }),
    SettingsModel.updateMany({ deviceUUID: oldUUID }, { $set: { deviceUUID: newUUID } }),
    SessionModel.deleteMany({ deviceUUID: oldUUID }),
  ])
}

const authRoute: FastifyPluginAsync = async (app) => {
  // ── QR tarandı: cihaz tanınıyorsa doğrudan giriş, tanınmıyorsa e-posta akışı ──
  app.post<{ Body: ScanPayload }>('/auth/scan', async (req, reply) => {
    const { socketId, deviceUUID } = req.body

    if (!app.socketRegistry.has(socketId)) {
      return reply.code(400).send({ error: 'Geçersiz veya süresi dolmuş oturum' })
    }

    const user = await UserModel.findOne({ deviceUUID })

    if (!user) {
      app.socketRegistry.send(socketId, 'auth:unregistered', { deviceUUID })
      return reply.send({ registered: false })
    }

    await grantSession(app, socketId, deviceUUID, user)
    return reply.send({ registered: true })
  })

  // ── Web'de kodla giriş: telefon yerine .env'deki WEB_LOGIN_CODE ──
  app.post<{ Body: { code?: string; socketId?: string } }>('/auth/code', async (req, reply) => {
    if (!WEB_LOGIN_CODE) {
      return reply.code(404).send({ error: 'Kodla giriş kapalı' })
    }

    const { socketId } = req.body
    if (!socketId || !app.socketRegistry.has(socketId)) {
      return reply.code(400).send({ error: 'Geçersiz veya süresi dolmuş oturum' })
    }

    const now = Date.now()
    codeFails = codeFails.filter(t => now - t < CODE_LOCK_MINUTES * 60 * 1000)
    if (codeFails.length >= CODE_MAX_FAILS) {
      return reply.code(429).send({ error: `Çok fazla hatalı deneme, ${CODE_LOCK_MINUTES} dakika sonra tekrar deneyin` })
    }

    if (!codeMatches(String(req.body.code ?? '').trim())) {
      codeFails.push(now)
      app.log.warn('Kodla giriş: hatalı kod')
      return reply.code(401).send({ error: 'Kod hatalı' })
    }

    const user = await findCodeLoginUser()
    if (!user) {
      app.log.error('Kodla giriş: hesap bulunamadı (WEB_LOGIN_EMAIL ayarlanmalı)')
      return reply.code(500).send({ error: 'Kodla giriş için hesap ayarlanmamış' })
    }

    codeFails = []
    await grantSession(app, socketId, user.deviceUUID, user)
    return reply.send({ success: true })
  })

  // ── E-postaya doğrulama kodu gönder ──
  app.post<{ Body: EmailRequestPayload }>('/auth/email/request', async (req, reply) => {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const { deviceUUID } = req.body

    if (!EMAIL_REGEX.test(email)) {
      return reply.code(400).send({ error: 'Geçersiz e-posta adresi' })
    }
    if (!deviceUUID) {
      return reply.code(400).send({ error: 'Cihaz kimliği eksik' })
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000)

    await VerificationModel.deleteMany({ email })
    await VerificationModel.create({ email, code, deviceUUID, expiresAt })

    try {
      await sendVerificationCode(email, code)
    } catch (err) {
      app.log.error({ err }, 'Doğrulama kodu gönderilemedi')
      await VerificationModel.deleteMany({ email })
      return reply.code(502).send({ error: 'E-posta gönderilemedi, tekrar deneyin' })
    }

    return reply.send({ success: true, expiresInMinutes: CODE_TTL_MINUTES })
  })

  // ── Kodu doğrula: hesap varsa cihazı devret, yoksa kayda yönlendir ──
  app.post<{ Body: EmailVerifyPayload }>('/auth/email/verify', async (req, reply) => {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const { code, deviceUUID, socketId } = req.body

    const record = await VerificationModel.findOne({ email, deviceUUID })
    if (!record) {
      return reply.code(400).send({ error: 'Kod bulunamadı, yeni kod isteyin' })
    }
    if (record.expiresAt.getTime() < Date.now()) {
      await VerificationModel.deleteMany({ email })
      return reply.code(410).send({ error: 'Kodun süresi doldu, yeni kod isteyin' })
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await VerificationModel.deleteMany({ email })
      return reply.code(429).send({ error: 'Çok fazla hatalı deneme, yeni kod isteyin' })
    }
    if (record.code !== String(code ?? '').trim()) {
      record.attempts += 1
      await record.save()
      return reply.code(401).send({ error: 'Kod hatalı', remaining: MAX_ATTEMPTS - record.attempts })
    }

    record.verified = true
    await record.save()

    const user = await UserModel.findOne({ email })

    // Bu e-posta kayıtlı değil → ad/soyad/doğum tarihi istenecek
    if (!user) {
      return reply.send({ verified: true, registered: false })
    }

    // Kayıtlı hesap → veriyi bu cihaza devret ve oturum aç
    await moveDataToDevice(user.deviceUUID, deviceUUID)
    user.deviceUUID = deviceUUID
    await user.save()
    await VerificationModel.deleteMany({ email })

    if (socketId && app.socketRegistry.has(socketId)) {
      await grantSession(app, socketId, deviceUUID, user)
    }

    return reply.send({
      verified: true,
      registered: true,
      user: { name: user.name, surname: user.surname },
    })
  })

  // ── Yeni hesap: yalnızca e-postası doğrulanmış cihaz kayıt olabilir ──
  app.post<{ Body: RegisterPayload }>('/auth/register', async (req, reply) => {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const { deviceUUID, name, surname, dob, socketId } = req.body

    const record = await VerificationModel.findOne({ email, deviceUUID, verified: true })
    if (!record) {
      return reply.code(401).send({ error: 'E-posta doğrulanmadı' })
    }
    if (!name?.trim() || !surname?.trim() || !dob?.trim()) {
      return reply.code(400).send({ error: 'Ad, soyad ve doğum tarihi zorunludur' })
    }

    if (await UserModel.findOne({ email })) {
      return reply.code(409).send({ error: 'Bu e-posta zaten kayıtlı' })
    }

    // Aynı cihazda e-postasız eski bir kayıt varsa onu devral — veri kaybolmasın
    const orphan = await UserModel.findOne({ deviceUUID, email: { $exists: false } })
    if (orphan) {
      orphan.email = email
      orphan.name = name.trim()
      orphan.surname = surname.trim()
      orphan.dob = dob.trim()
      await orphan.save()
    } else {
      await UserModel.create({ deviceUUID, email, name: name.trim(), surname: surname.trim(), dob: dob.trim() })
    }

    await VerificationModel.deleteMany({ email })

    const user = await UserModel.findOne({ email })
    if (user && socketId && app.socketRegistry.has(socketId)) {
      await grantSession(app, socketId, deviceUUID, user)
    }

    return reply.code(201).send({ success: true, loggedIn: Boolean(user && socketId) })
  })

  app.get('/auth/session/verify', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.code(401).send({ valid: false })

    session.lastSeen = new Date()
    await session.save()

    return reply.send({ valid: true, user: session.user })
  })

  app.delete('/auth/session', async (req, reply) => {
    const session = await getSession(req)
    if (session) await SessionModel.deleteOne({ _id: session._id })
    return reply.send({ success: true })
  })
}

export default authRoute
