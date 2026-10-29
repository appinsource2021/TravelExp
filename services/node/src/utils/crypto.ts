import crypto from 'node:crypto'

/**
 * SMTP şifreleri veritabanında düz metin durmasın diye AES-256-GCM ile saklanır.
 * Anahtar COOKIE_SECRET'ten türetilir — o değişirse kayıtlı şifreler çözülemez,
 * kullanıcı şifresini ayarlardan yeniden girer.
 */
const KEY = crypto.createHash('sha256').update(process.env.COOKIE_SECRET ?? 'changeme').digest()
const PREFIX = 'v1'

export function encrypt(plain: string): string {
  if (!plain) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

export function decrypt(payload: string): string {
  if (!payload) return ''
  const parts = payload.split(':')
  // Şifrelenmemiş eski kayıtlar olduğu gibi döner
  if (parts.length !== 4 || parts[0] !== PREFIX) return payload

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(parts[1], 'base64'))
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}
