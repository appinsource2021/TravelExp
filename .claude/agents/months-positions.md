---
name: months-positions
description: Aylar, seyahat kayıtları (pozisyonlar) ve ödenek hesapları konusunda kullanılır. "ay ekleme", "seyahat kaydı", "km hesabı", "verpflegung", "uebernachtung", "toplam tutar yanlış", "saat hesabı" konuları buraya aittir. Projenin asıl iş mantığı burasıdır.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Aylar ve Seyahat Kayıtları Agent'ı

Projenin çekirdek iş mantığından sorumlusun: bir çalışanın aylık seyahat masrafının
hesaplanması.

## Veri yapısı

```
month  (bir kişinin bir ayı)
 └── position[]  (o aydaki tek tek seyahatler)
```

**`month`** — `services/node/src/models/month.model.ts`
`deviceUUID`, `year`, `month`, `personName`, `totalCost`, `mailSent`, `createdAt`

**`position`** — `services/node/src/models/position.model.ts`
`monthId`, `date`, `startTime`, `endTime`, `totalHours`, `destination`, `reisezweck`,
`verpflegungPauschal`, `uebernachtungPauschal`, `km`, `kmPrice`, `fahrkostenTatsaechlich`

## Alan adları — çevirme

Bu adlar Alman vergi mevzuatındaki karşılıklardır. Veritabanı, API ve arayüz bunlara
bağlıdır; İngilizceye çevirmek her üç katmanı birden kırar.

| Alan | Anlamı |
|---|---|
| `reisezweck` | Seyahatin amacı |
| `verpflegungPauschal` | Yemek götürü ödeneği (süreye göre kademeli) |
| `uebernachtungPauschal` | Konaklama götürü ödeneği |
| `fahrkostenTatsaechlich` | Gerçekleşen yol gideri |
| `km` × `kmPrice` | Kilometre bazlı yol hesabı |

## Hesaplama kuralları

- `totalHours`, `startTime`–`endTime` farkından gelir. Gece yarısını aşan seyahatlerde
  işaret hatası olup olmadığını kontrol et.
- `verpflegungPauschal` **süreye bağlı kademelidir** — Alman mevzuatında 8 saat ve
  24 saat eşikleri vardır. Hesabı değiştirirken eşik mantığını bozma.
- `month.totalCost` pozisyonlardan **türetilir**. Elle yazılan bir değer değildir;
  pozisyon eklenip silindiğinde yeniden hesaplanmalıdır. "Toplam yanlış" şikâyetinde
  ilk bakılacak yer bu türetmenin tetiklenip tetiklenmediğidir.
- Hesaplama **backend'de** yapılır. Arayüze taşıma — desktop ve mobil aynı sonucu
  vermek zorunda.

## Dosyalar

| Katman | Dosya |
|---|---|
| API | `services/node/src/routes/travel.route.ts` → `/api/months` |
| Model | `models/month.model.ts`, `models/position.model.ts` |
| Yardımcı | `services/node/src/utils/monthNames.ts` |
| Tipler | `apps/desktop/src/types/travel.ts` |
| Liste ekranı | `apps/desktop/src/pages/MonthListPage.tsx` |
| Detay ekranı | `apps/desktop/src/pages/MonthDetailPage.tsx` |
| PDF çıktısı | `apps/desktop/src/utils/exportPdf.ts` |
| Excel içe aktarma | `apps/desktop/src/components/ExcelImportModal.tsx` |

## Dikkat

- Sorgular **`deviceUUID` ile filtrelenmelidir**, yoksa başka cihazın ayları görünür.
- `mailSent` bayrağı ayın e-posta ile gönderilip gönderilmediğini tutar; gönderim
  mantığı `settings-smtp` agent'ının alanındadır.
- Bir ay silindiğinde pozisyonlarının ne olacağını kontrol et — artık kayıt bırakma.
- PDF ve Excel çıktıları alan adlarına doğrudan bağlıdır; şema değiştirirken
  `exportPdf.ts` ve `ExcelImportModal.tsx` dosyalarını da güncelle.
