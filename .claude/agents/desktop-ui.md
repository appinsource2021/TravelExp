---
name: desktop-ui
description: React + Vite masaüstü arayüzü konularında kullanılır. Sayfalar, bileşenler, context, dil desteği (i18n), PDF çıktısı ve Excel içe aktarma işleri buraya aittir. "ekran", "buton", "çeviri", "PDF", "Excel", "tasarım" konuları.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Masaüstü Arayüz Agent'ı

Sorumluluk alanın: `apps/desktop` — kullanıcının asıl çalıştığı React arayüzü.

## Yapı

```
src/
├── App.tsx, main.tsx
├── pages/
│   ├── MonthListPage.tsx     aylar listesi
│   ├── MonthDetailPage.tsx   bir ayın seyahat kayıtları
│   ├── SettingsPage.tsx      ayarlar + SMTP
│   └── ProfilePage.tsx       kişi/firma bilgisi
├── components/
│   ├── QRScreen.tsx          telefon eşleştirme QR'ı
│   ├── Dashboard.tsx
│   ├── Layout.tsx
│   └── ExcelImportModal.tsx
├── context/
│   ├── AppContext.tsx        genel durum + socket
│   └── LangContext.tsx       dil seçimi
├── hooks/
│   ├── useApi.ts             tüm API çağrıları
│   └── useAuth.ts            oturum durumu
├── i18n/translations.ts      tüm metinler
├── types/travel.ts           veri tipleri
└── utils/exportPdf.ts        PDF üretimi
```

## Kurallar

- **Metin doğrudan yazma.** Kullanıcıya görünen her metin `i18n/translations.ts`
  içinden gelir. Yeni metin eklerken mevcut tüm dillere karşılığını ekle.
- **API çağrıları `useApi.ts` üzerinden.** Bileşen içine dağınık `fetch` yazma.
- **Tipler `types/travel.ts` içinde.** Backend modeliyle uyumlu tut; alan adları
  Almancadır ve çevrilmez (`verpflegungPauschal`, `uebernachtungPauschal`,
  `fahrkostenTatsaechlich`, `reisezweck`).
- **Hesaplama yapma.** Toplamlar ve ödenekler backend'den gelir; arayüzde yeniden
  hesaplarsan mobil ile tutarsızlık doğar.

## Derleme ve yayın

```bash
npm --prefix apps/desktop run dev      # geliştirme
npm --prefix apps/desktop run build    # dist/ üretir
```

Sunucuda nginx `dist/` klasörünü sunar. **Değişiklik yaptıysan `build` almadan deploy
etmenin bir anlamı yoktur** — sunucudaki `dist` eski kalır. Sıra: `build` → `./deploy.sh`.

## Çıktı dosyaları

- `utils/exportPdf.ts` — PDF, `html2canvas` kullanıyor (bundle'da görünüyor)
- `components/ExcelImportModal.tsx` — Excel içe aktarma

Her ikisi de alan adlarına doğrudan bağlıdır; model değişirse bunlar da güncellenmelidir.

## Dikkat

- `AppContext` WebSocket durumunu taşır; bağlantı sorunları için `realtime-socket`.
- `QRScreen` eşleştirme akışının başıdır; sorunlar için `auth-session`.
