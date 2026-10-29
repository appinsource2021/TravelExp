/**
 * Bir ayın belgesi (mail/PDF) ancak son seyahat bittikten sonra çıkarılabilir —
 * henüz yaşanmamış bir seyahat için masraf beyanı gönderilemez.
 *
 * Saatler Almanya saatidir (Europe/Berlin). Sunucu UTC'de çalıştığı için
 * karşılaştırma "YYYY-MM-DD HH:MM" metinleri üzerinden, Berlin duvar saatiyle yapılır.
 */

const TZ = 'Europe/Berlin'

/** DD.MM.YY + HH:MM → "YYYY-MM-DD HH:MM" (metin olarak sıralanabilir) */
function toKey(date: string, time: string) {
  const [dd, mm, yy] = date.split('.')
  return `20${yy}-${mm}-${dd} ${time}`
}

/** Şu anın Berlin saatindeki karşılığı, aynı biçimde */
export function berlinNowKey(now = new Date()) {
  // sv-SE yerel ayarı "2026-09-28 14:05:00" biçimini verir
  return now.toLocaleString('sv-SE', { timeZone: TZ, hour12: false }).slice(0, 16)
}

/** Son seyahatin bitiş anı; pozisyon yoksa null */
export function lastTripEnd(positions: Array<{ date: string; endTime: string }>) {
  if (positions.length === 0) return null
  const keys = positions.map(p => toKey(p.date, p.endTime)).sort()
  const key = keys[keys.length - 1]
  const [d, t] = key.split(' ')
  const [y, m, day] = d.split('-')
  return { key, date: `${day}.${m}.${y.slice(2)}`, time: t }
}

/** Belge henüz çıkarılamıyorsa kilidin kalkacağı an, çıkarılabiliyorsa null */
export function documentLockedUntil(positions: Array<{ date: string; endTime: string }>, now = new Date()) {
  const end = lastTripEnd(positions)
  if (!end || berlinNowKey(now) >= end.key) return null
  return end
}

/** "YYYY-MM-DD HH:MM" duvar saatine dakika ekler (otomatik gönderim zamanı için) */
export function addMinutesToKey(key: string, minutes: number) {
  const d = new Date(`${key.replace(' ', 'T')}:00Z`)
  d.setUTCMinutes(d.getUTCMinutes() + minutes)
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

/** "YYYY-MM-DD HH:MM" → { date: DD.MM.YY, time: HH:MM } */
export function splitKey(key: string) {
  const [d, time] = key.split(' ')
  const [y, m, day] = d.split('-')
  return { date: `${day}.${m}.${y.slice(2)}`, time }
}
