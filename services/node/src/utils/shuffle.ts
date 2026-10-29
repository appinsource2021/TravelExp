import type { IDestination } from '../models/destination.model'

const VERPFLEGUNG = 14
const KM_PRICE = 0.30
const UEBERNACHTUNG = 20

const REISEZWECK_OPTIONS = ['Business', 'Meeting', 'Training', 'Conference', 'Kundenbesuch', 'Sonstige']

interface ShuffleInput {
  year: number
  month: number
  destinations: IDestination[]
  homeAddress: string
  prevMonthDays: number[]
  minCost: number
  maxCost: number
  prevDestSequences?: string[][]
}

interface GeneratedPosition {
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

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${pad(h)}:${pad(m)}`
}

function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function positionCost(dest: IDestination): number {
  return VERPFLEGUNG + dest.km * KM_PRICE
}

function overnightCost(dest: IDestination): number {
  // overnight = 2 rows: normal row + return row with UEBERNACHTUNG
  return positionCost(dest) + VERPFLEGUNG + UEBERNACHTUNG + dest.km * KM_PRICE
}

/**
 * Bir seyahatin PLANI — para hesabı içermez, yalnızca "hangi gün nereye".
 *
 * AI yolu yalnızca bunu üretir; ödenek, km ve toplam tutar aşağıdaki
 * `buildPositionsFromPlan` tarafından deterministik olarak hesaplanır.
 * Yasal hesabın AI'ın eline bırakılmaması bilinçli bir tercihtir.
 */
export interface TripPlan {
  /** Ayın günü (1-31) */
  day: number
  /** Destinasyonun adresi — kayıtlı adreslerden biri olmalı */
  destination: string
  reisezweck: string
  isOvernight: boolean
}

/**
 * Plandan gerçek pozisyon satırlarını üretir.
 *
 * Klasik `generatePositions` ile BİREBİR aynı hesap kurallarını uygular:
 * yemek götürüsü, konaklama götürüsü, km × kmPrice, gecelik seyahatin
 * iki satıra bölünmesi. Saatler gerçekçi olsun diye rastgele oynatılır.
 */
export function buildPositionsFromPlan(
  plan: TripPlan[],
  opts: { year: number; month: number; destinations: IDestination[]; homeAddress: string }
): GeneratedPosition[] {
  const { year, month, destinations, homeAddress } = opts
  const daysInMonth = getDaysInMonth(year, month)
  const byAddress = new Map(destinations.map(d => [d.address, d]))

  const calcTravelMin = (km: number) => {
    const base = Math.round((km / 90) * 60)
    return Math.max(20, base + Math.round(base * (randomInt(-15, 15) / 100)))
  }

  const positions: GeneratedPosition[] = []
  let sortOrder = 0

  for (const trip of plan) {
    const dest = byAddress.get(trip.destination)
    if (!dest) continue          // bilinmeyen adres — atla (doğrulama zaten yakalar)

    let day = Math.min(Math.max(trip.day, 1), daysInMonth)
    const reisezweck = trip.reisezweck || pickRandom(REISEZWECK_OPTIONS)

    // Gecelik seyahatin iki günü de ay içinde ve hafta içi olmalı. Son gün ya da
    // Cuma başlayan plan (dönüş ertesi aya / Cumartesi'ye düşerdi) geriye kaydırılır.
    const weekend = (d: number) => isWeekend(new Date(year, month - 1, d))
    if (trip.isOvernight) {
      while (day > 1 && (day + 1 > daysInMonth || weekend(day) || weekend(day + 1))) day--
    }

    if (trip.isOvernight) {
      positions.push({
        date: formatDate(new Date(year, month - 1, day)),
        startTime: '08:00', endTime: '23:59',
        totalHours: minutesToHHMM(23 * 60 + 59 - 8 * 60),
        destination: dest.address, reisezweck,
        verpflegungPauschal: VERPFLEGUNG, uebernachtungPauschal: 0,
        km: dest.km, kmPrice: KM_PRICE,
        fahrkostenTatsaechlich: parseFloat((dest.km * KM_PRICE).toFixed(2)),
        gesamt: parseFloat(positionCost(dest).toFixed(2)),
        isOvernight: true, sortOrder: sortOrder++,
      })
      const day2 = day + 1
      const arriveMin = randomInt(7 * 60, 9 * 60) + calcTravelMin(dest.km)
      positions.push({
        date: formatDate(new Date(year, month - 1, day2)),
        startTime: '00:00', endTime: minutesToHHMM(arriveMin),
        totalHours: minutesToHHMM(arriveMin),
        destination: homeAddress, reisezweck,
        verpflegungPauschal: VERPFLEGUNG, uebernachtungPauschal: UEBERNACHTUNG,
        km: dest.km, kmPrice: KM_PRICE,
        fahrkostenTatsaechlich: parseFloat((dest.km * KM_PRICE).toFixed(2)),
        gesamt: parseFloat((VERPFLEGUNG + UEBERNACHTUNG + dest.km * KM_PRICE).toFixed(2)),
        isOvernight: true, sortOrder: sortOrder++,
      })
    } else {
      const travelMin = calcTravelMin(dest.km)
      const endMin = Math.min(8 * 60 + travelMin + randomInt(60, 5 * 60) + travelMin, 22 * 60 - 1)
      const endTime = minutesToHHMM(endMin)
      positions.push({
        date: formatDate(new Date(year, month - 1, day)),
        startTime: '08:00', endTime,
        totalHours: minutesToHHMM(diffMinutes('08:00', endTime)),
        destination: dest.address, reisezweck,
        verpflegungPauschal: VERPFLEGUNG, uebernachtungPauschal: 0,
        km: dest.km, kmPrice: KM_PRICE,
        fahrkostenTatsaechlich: parseFloat((dest.km * KM_PRICE).toFixed(2)),
        gesamt: parseFloat(positionCost(dest).toFixed(2)),
        isOvernight: false, sortOrder: sortOrder++,
      })
    }
  }

  positions.sort((a, b) => {
    const parse = (d: string) => {
      const [dd, mm, yy] = d.split('.').map(Number)
      return new Date(2000 + yy, mm - 1, dd).getTime()
    }
    return parse(a.date) - parse(b.date)
  })
  positions.forEach((p, i) => { p.sortOrder = i })

  return positions
}

/** Bir planın toplam tutarı — doğrulama için */
export function planTotal(positions: GeneratedPosition[]): number {
  return parseFloat(positions.reduce((s, p) => s + p.gesamt, 0).toFixed(2))
}

export function generatePositions(input: ShuffleInput): GeneratedPosition[] {
  const { year, month, destinations, homeAddress, prevMonthDays, minCost, maxCost, prevDestSequences } = input
  const daysInMonth = getDaysInMonth(year, month)

  // Hafta içi günleri topla
  const weekdays: number[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (!isWeekend(date)) weekdays.push(d)
  }

  // Destinasyonları round-robin hazırla
  const buildDestSequence = (count: number) => {
    const seq: IDestination[] = []
    for (let i = 0; i < count; i++) {
      seq.push(destinations[i % destinations.length])
    }
    return shuffleArray(seq)
  }

  // Kaç pozisyon lazım olduğunu tahmin et (ortalama maliyet üzerinden)
  const avgCost = destinations.reduce((s, d) => s + positionCost(d), 0) / destinations.length
  const estimatedCount = Math.ceil(maxCost / avgCost) + 5  // fazladan gün hazırla

  let destSeq = buildDestSequence(estimatedCount)

  // Önceki aylarla benzerlik kontrolü
  if (prevDestSequences && prevDestSequences.length > 0) {
    const similarity = (a: string[], b: string[]) => {
      const len = Math.min(a.length, b.length)
      let matches = 0
      for (let i = 0; i < len; i++) if (a[i] === b[i]) matches++
      return len > 0 ? matches / len : 0
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      const seq = destSeq.map(d => d.address)
      const maxSim = Math.max(...prevDestSequences.map(prev => similarity(prev, seq)))
      if (maxSim < 0.6) break
      destSeq = buildDestSequence(estimatedCount)
    }
  }

  const cheapestDest = destinations.reduce((a, b) => a.km < b.km ? a : b)

  // ── 1. Aşama: hangi seyahatler — bütçe dolana kadar ────────────
  // Günler burada seçilmez; önce kaç seyahat gerektiği bilinmeli ki
  // 2. aşamada bunlar aya eşit yayılabilsin.
  interface Trip { dest: IDestination; overnight: boolean; reisezweck: string }
  const trips: Trip[] = []
  let totalCost = 0
  let daysNeeded = 0

  // Overnight için 1 rastgele slot (ortalardan biri)
  const overnightSlot = randomInt(2, Math.max(2, Math.min(8, estimatedCount - 7)))

  for (let i = 0; totalCost < minCost && daysNeeded < weekdays.length; i++) {
    const rrDest = destSeq[i] ?? destinations[i % destinations.length]
    const reisezweck = Math.random() < 0.85 ? 'Business' : pickRandom(REISEZWECK_OPTIONS)

    // Overnight: sadece maxCost içinde sığıyorsa ekle, yoksa normal pozisyon yap
    if (i === overnightSlot && totalCost + overnightCost(rrDest) <= maxCost) {
      trips.push({ dest: rrDest, overnight: true, reisezweck })
      totalCost += overnightCost(rrDest)
      daysNeeded += 2
    } else {
      const dest = totalCost + positionCost(rrDest) > maxCost ? cheapestDest : rrDest
      trips.push({ dest, overnight: false, reisezweck })
      totalCost += positionCost(dest)
      daysNeeded += 1
    }
  }

  // ── 2. Aşama: günleri aya yay ──────────────────────────────────
  // Hafta içi günler seyahat sayısı kadar ardışık dilime bölünür, her
  // dilimden bir gün seçilir → seyahatler ayın başından sonuna dağılır.
  // Dilim içinde önceki ayda kullanılmamış günler tercih edilir.
  const tripDays: number[] = []
  const taken = new Set<number>()
  const n = trips.length

  for (let j = 0; j < n; j++) {
    const bucket = weekdays.slice(Math.floor(j * weekdays.length / n), Math.floor((j + 1) * weekdays.length / n))
    // Gecelik seyahatin dönüşü ertesi gün — ay içinde ve boş olmalı
    // Cuma başlayan gecelik Cumartesi dönerdi — hafta sonu yok
    const fits = (d: number) => !taken.has(d) &&
      (!trips[j].overnight || (d < daysInMonth && !taken.has(d + 1)
        && !isWeekend(new Date(year, month - 1, d + 1))))
    let candidates = bucket.filter(fits)
    if (candidates.length === 0) {
      // Dilim dolu (ör. son dilim yalnızca ayın son günü) → gecelik normale döner
      trips[j].overnight = false
      candidates = bucket.filter(d => !taken.has(d))
    }
    const fresh = candidates.filter(d => !prevMonthDays.includes(d))
    const pool = fresh.length > 0 ? fresh : candidates
    // Dilimin ortasına yakın günler — komşu dilimlerin uçları yan yana gelip
    // arada büyük boşluk kalmasın. En yakın 2 gün arasından rastgele seçilir.
    const mid = (bucket[0] + bucket[bucket.length - 1]) / 2
    const near = [...pool].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid)).slice(0, 2)
    const day = pickRandom(near)
    tripDays.push(day)
    taken.add(day)
    if (trips[j].overnight) taken.add(day + 1)
  }

  // km'ye göre seyahat süresi: ortalama 90 km/s, ±%15 rastgele varyasyon
  const calcTravelMin = (km: number) => {
    const base = Math.round((km / 90) * 60)
    const jitter = Math.round(base * (randomInt(-15, 15) / 100))
    return Math.max(20, base + jitter)
  }

  // ── 3. Aşama: satırları üret ───────────────────────────────────
  const positions: GeneratedPosition[] = []
  let sortOrder = 0

  trips.forEach((trip, j) => {
    const day = tripDays[j]
    const { dest, reisezweck } = trip

    if (trip.overnight) {
      const travelMin = calcTravelMin(dest.km)
      // Gün 1: 08:00 gidiş → akşam geç saate kadar → 23:59
      positions.push({
        date: formatDate(new Date(year, month - 1, day)),
        startTime: '08:00', endTime: '23:59',
        totalHours: minutesToHHMM(23 * 60 + 59 - 8 * 60),
        destination: dest.address, reisezweck,
        verpflegungPauschal: VERPFLEGUNG, uebernachtungPauschal: 0,
        km: dest.km, kmPrice: KM_PRICE,
        fahrkostenTatsaechlich: parseFloat((dest.km * KM_PRICE).toFixed(2)),
        gesamt: parseFloat(positionCost(dest).toFixed(2)),
        isOvernight: true, sortOrder: sortOrder++,
      })
      // Gün 2: 00:00 → sabah hareket (07-09) + seyahat süresi = eve varış
      const departMin = randomInt(7 * 60, 9 * 60)   // 07:00-09:00 arası hareket
      const arriveMin = departMin + travelMin
      const row2Cost = VERPFLEGUNG + UEBERNACHTUNG + dest.km * KM_PRICE
      positions.push({
        date: formatDate(new Date(year, month - 1, day + 1)),
        startTime: '00:00', endTime: minutesToHHMM(arriveMin),
        totalHours: minutesToHHMM(arriveMin),
        destination: homeAddress, reisezweck,
        verpflegungPauschal: VERPFLEGUNG, uebernachtungPauschal: UEBERNACHTUNG,
        km: dest.km, kmPrice: KM_PRICE,
        fahrkostenTatsaechlich: parseFloat((dest.km * KM_PRICE).toFixed(2)),
        gesamt: parseFloat(row2Cost.toFixed(2)),
        isOvernight: true, sortOrder: sortOrder++,
      })
    } else {
      // Normal pozisyon: gidiş + toplantı (1-5 saat) + dönüş
      const cost = positionCost(dest)
      const travelMin = calcTravelMin(dest.km)
      const meetingMin = randomInt(60, 5 * 60)   // 1-5 saat toplantı
      const endTotalMin = 8 * 60 + travelMin + meetingMin + travelMin
      // 22:00'dan geç olmasın
      const cappedEndMin = Math.min(endTotalMin, 22 * 60 - 1)
      const endTime = minutesToHHMM(cappedEndMin)
      positions.push({
        date: formatDate(new Date(year, month - 1, day)),
        startTime: '08:00', endTime,
        totalHours: minutesToHHMM(diffMinutes('08:00', endTime)),
        destination: dest.address, reisezweck,
        verpflegungPauschal: VERPFLEGUNG, uebernachtungPauschal: 0,
        km: dest.km, kmPrice: KM_PRICE,
        fahrkostenTatsaechlich: parseFloat((dest.km * KM_PRICE).toFixed(2)),
        gesamt: parseFloat(cost.toFixed(2)),
        isOvernight: false, sortOrder: sortOrder++,
      })
    }
  })

  // Tarihe göre eskiden yeniye sırala ve sortOrder'ı güncelle
  positions.sort((a, b) => {
    const parse = (d: string) => {
      const [day, month, year] = d.split('.').map(Number)
      return new Date(2000 + year, month - 1, day).getTime()
    }
    return parse(a.date) - parse(b.date)
  })
  positions.forEach((p, i) => { p.sortOrder = i })

  return positions
}

export function extractDays(positions: GeneratedPosition[]): number[] {
  return [...new Set(positions.map(p => parseInt(p.date.split('.')[0])))]
}
