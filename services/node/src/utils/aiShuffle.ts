import Anthropic from '@anthropic-ai/sdk'
import type { IDestination } from '../models/destination.model'
import {
  buildPositionsFromPlan, planTotal,
  type TripPlan,
} from './shuffle'

/**
 * AI destekli ay üretimi.
 *
 * AI YALNIZCA PLANI SEÇER — hangi gün, hangi adres, hangi amaç, gecelik mi.
 * Ödenek, km ve toplam tutar `buildPositionsFromPlan` tarafından deterministik
 * hesaplanır. Yasal hesabı modele bırakmıyoruz; model sadece çeşitlilik üretir.
 *
 * Anahtar tanımlı değilse ya da model geçerli bir plan üretemezse çağıran taraf
 * klasik `generatePositions`'a döner — AI hiçbir zaman tek yol değildir.
 */

const MODEL = 'claude-opus-5'

export class AiUnavailableError extends Error {}

export interface AiShuffleInput {
  year: number
  month: number
  destinations: IDestination[]
  homeAddress: string
  minCost: number
  maxCost: number
  /** Kullanıcının Ayarlar'da yazdığı serbest metin yönerge */
  hint?: string
  /** Bütçe aralığına izin verilen sapma yüzdesi (0 = kesin) */
  tolerance?: number
  /** Önceki ayların özeti — tekrarı önlemek için modele verilir */
  history: Array<{
    label: string                  // "Haziran 2026"
    /** O ayın toplam tutarı — "aynı tutarı tekrarlama" diyebilmesi için şart */
    total: number
    trips: Array<{ day: number; destination: string; isOvernight: boolean }>
  }>
}

/** Modelin döndüreceği yapı — schema ile zorlanır */
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: {
      type: 'string',
      description: 'Bu planı neden böyle kurduğunun bir cümlelik özeti (Türkçe).',
    },
    trips: {
      type: 'array',
      description: 'Seyahatler, tarih sırasına göre.',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer', description: 'Ayın günü (1-31). Hafta içi olmalı.' },
          destination: { type: 'string', description: 'Kayıtlı adreslerden BİRİ, birebir aynı yazımla.' },
          reisezweck: {
            type: 'string',
            enum: ['Business', 'Meeting', 'Training', 'Conference', 'Kundenbesuch', 'Sonstige'],
          },
          isOvernight: { type: 'boolean', description: 'Gecelik konaklama içeriyor mu.' },
        },
        required: ['day', 'destination', 'reisezweck', 'isOvernight'],
        additionalProperties: false,
      },
    },
  },
  required: ['reasoning', 'trips'],
  additionalProperties: false,
} as const

/** Tolerans uygulanmış alt/üst sınır — doğrulama ve prompt aynı değeri kullanır */
const effMin = (i: AiShuffleInput) => i.minCost * (1 - (i.tolerance ?? 0) / 100)
const effMax = (i: AiShuffleInput) => i.maxCost * (1 + (i.tolerance ?? 0) / 100)

function buildPrompt(input: AiShuffleInput, seed: number): string {
  // Maliyetleri BİZ hesaplayıp veriyoruz — modele aritmetik yaptırmak
  // güvenilmez ve yanlış formül tüm planı kaydırıyor.
  const VERPFLEGUNG = 14, KM_PRICE = 0.30, UEBERNACHTUNG = 20
  const tripCost = (km: number) => VERPFLEGUNG + km * KM_PRICE
  const overnightCost = (km: number) => tripCost(km) + VERPFLEGUNG + UEBERNACHTUNG + km * KM_PRICE

  const destLines = input.destinations
    .map(d => `- "${d.address}" — ${d.km} km · normal seyahat ${tripCost(d.km).toFixed(2)} € · gecelik ${overnightCost(d.km).toFixed(2)} €`)
    .join('\n')

  // Kaç seyahat gerektiğini de söyle — model sayıyı kendi tahmin etmesin
  const costs = input.destinations.map(d => tripCost(d.km))
  const avg = costs.reduce((a, b) => a + b, 0) / costs.length
  const minTrips = Math.ceil(input.minCost / avg)
  const maxTrips = Math.floor(input.maxCost / Math.min(...costs))

  const historyText = input.history.length === 0
    ? '(önceki ay kaydı yok)'
    : input.history.map(h => {
        const trips = h.trips
          .map(t => `${t.day}. gün → ${t.destination}${t.isOvernight ? ' (gecelik)' : ''}`)
          .join('; ')
        return `${h.label} — toplam ${h.total.toFixed(2)} €: ${trips || '(kayıt yok)'}`
      }).join('\n')

  return `Bir çalışanın ${input.month}/${input.year} ayı için seyahat planı kur.

## Kayıtlı adresler
${destLines}

## Önceki ayların planları
${historyText}

## Kurallar
1. Yalnızca HAFTA İÇİ günler (Pazartesi-Cuma). Hafta sonu ve resmi tatil yok.
2. Önceki aylarla AYNI ÖRÜNTÜYÜ TEKRARLAMA: aynı günlerde aynı adreslere gitme,
   adreslerin sırasını birebir tekrarlama. Bir önceki aya en çok, üç ay öncesine
   en az dikkat et.
3. Adresleri dengeli dağıt — hepsi tek bir adrese yığılmasın.
3b. TOPLAM TUTARI da tekrarlama: yukarıda her ayın toplamı yazılı. Adres
   karışımını değiştirerek bu tutarlardan belirgin şekilde farklı bir toplama
   ulaş — aralığın içinde kalmak şartıyla.
4. Gecelik konaklama nadirdir: ayda en fazla 1-2 tane, uzak adresler için.
   Gecelik seçtiğin günün ertesi günü de ayın içinde ve HAFTA İÇİ kalmalı —
   Cuma günü gecelik başlatma (dönüş Cumartesi'ye düşer).
5. Aynı güne birden fazla seyahat koyma. Gecelik seyahatin dönüş günü de dolu sayılır.
6. Seyahatleri AYIN TAMAMINA YAY: ayın ilk ve son haftasında da seyahat olsun,
   aralar mümkün olduğunca eşit olsun; ayın bir bölümüne yığıp sonunu boş bırakma.

## Bütçe hedefi
Toplam **${input.minCost} € – ${input.maxCost} €** arasında olmalı. Bu ZORUNLU.${
  (input.tolerance ?? 0) > 0
    ? ` (%${input.tolerance} sapmaya izin var — yani ${effMin(input).toFixed(0)} € – ${effMax(input).toFixed(0)} € kabul edilir.)`
    : ''}

Her adresin tam tutarı yukarıda yazılı — topla ve aralığa girecek şekilde seç.
Bu aralığa ulaşmak için kabaca **${minTrips}–${maxTrips} seyahat** gerekir; daha az
seyahatle hedefe ulaşamazsın. Seçtiğin seyahatlerin tutarlarını zihninden topla ve
aralığın içinde kaldığından emin ol.

${input.hint?.trim() ? `
## Kullanıcının ek yönergeleri
Bunlar uygulamanın sahibi tarafından yazıldı; yukarıdaki kurallarla çelişmediği
sürece bunlara UY. Çelişirse bütçe aralığı ve "yalnızca kayıtlı adresler" kuralı
her zaman önceliklidir.

${input.hint.trim()}
` : ''}
## Çeşitlilik
Çeşitlilik tohumu: **${seed}**. Modelde rastgelelik yoktur; aynı girdiyle hep aynı
planı üretirsin. Bu sayıyı kullanarak — kurallara ve bütçeye uymak şartıyla —
her çağrıda FARKLI ama geçerli bir plan kur: gün seçimini kaydır, adres
karışımını değiştir, amaçları değiştir.

Tarih sırasına göre üret.`
}

/**
 * Modelden plan ister, doğrular, pozisyonları üretir.
 *
 * Bütçe tutmazsa bir kez daha dener (modele ne kadar saptığını söyleyerek).
 * İki denemede de tutmazsa hata fırlatır — çağıran klasik üretime düşer.
 */
export async function generatePositionsWithAi(input: AiShuffleInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new AiUnavailableError('ANTHROPIC_API_KEY tanımlı değil')
  }
  if (input.destinations.length === 0) {
    throw new AiUnavailableError('Aktif adres yok')
  }

  const client = new Anthropic({ apiKey })
  const validAddresses = new Set(input.destinations.map(d => d.address))

  // Model deterministiktir — aynı girdiye hep aynı yanıtı verir. Klasik shuffle
  // rastgeleydi; aynı davranışı korumak için prompt'a bir tohum katıyoruz.
  const seed = Math.floor(Math.random() * 1_000_000)

  let feedback = ''
  let lastTotal = 0

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: PLAN_SCHEMA },
      },
      messages: [{ role: 'user', content: buildPrompt(input, seed) + feedback }],
    })

    // Güvenlik sınıflandırıcısı reddettiyse içerik boş gelir
    if (response.stop_reason === 'refusal') {
      throw new AiUnavailableError('Model isteği reddetti')
    }

    const text = response.content.find(b => b.type === 'text')
    if (!text || text.type !== 'text') {
      throw new AiUnavailableError('Model boş yanıt döndü')
    }

    let parsed: { reasoning: string; trips: TripPlan[] }
    try {
      parsed = JSON.parse(text.text)
    } catch {
      throw new AiUnavailableError('Model geçersiz JSON döndü')
    }

    // Bilinmeyen adresleri ayıkla — schema adresin GEÇERLİ olduğunu garanti etmez
    const trips = (parsed.trips ?? []).filter(t => validAddresses.has(t.destination))
    if (trips.length === 0) {
      throw new AiUnavailableError('Model geçerli seyahat üretemedi')
    }

    const positions = buildPositionsFromPlan(trips, {
      year: input.year,
      month: input.month,
      destinations: input.destinations,
      homeAddress: input.homeAddress,
    })
    const total = planTotal(positions)
    lastTotal = total

    if (total >= effMin(input) && total <= effMax(input)) {
      return { positions, total, reasoning: parsed.reasoning ?? '', attempts: attempt }
    }

    // Bütçe tutmadı — modele sapmayı söyleyip bir kez daha dene
    const direction = total < effMin(input) ? 'DÜŞÜK' : 'YÜKSEK'
    feedback = `\n\n## Önceki denemen\nToplam ${total} € çıktı — hedef aralığa göre çok ${direction}.`
      + ` ${total < effMin(input) ? 'Daha fazla seyahat ekle ya da daha uzak adresler seç.' : 'Seyahat sayısını azalt ya da daha yakın adresler seç.'}`
  }

  throw new AiUnavailableError(
    `Bütçe aralığı tutturulamadı (son deneme: ${lastTotal} €, hedef ${input.minCost}-${input.maxCost} €)`
  )
}
