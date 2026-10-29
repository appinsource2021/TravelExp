---
name: settings-smtp
description: Ayarlar sayfası, SMTP yapılandırması ve e-posta gönderimi konularında kullanılır. "mail gitmiyor", "SMTP testi başarısız", "doğrulama kodu gelmiyor", "mail şablonu", "min/max tutar" konuları buraya aittir.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Ayarlar ve E-posta Agent'ı

Sorumluluk alanın: cihaz bazlı ayarlar ve tüm e-posta gönderimi.

## Model

`services/node/src/models/settings.model.ts` — **cihaz başına tek kayıt** (`deviceUUID`)

| Alan | İş |
|---|---|
| `minCost`, `maxCost` | Tutar sınırları |
| `emailTo`, `emailFrom` | Gönderim adresleri |
| `subjectPattern`, `bodyText` | Mail şablonu |
| `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass` | SMTP bağlantısı |

## Dosyalar

| Katman | Dosya |
|---|---|
| API | `services/node/src/routes/travel.route.ts` → `/api/settings`, `/api/settings/smtp/test` |
| Gönderim | `services/node/src/utils/mailer.ts` |
| Arayüz | `apps/desktop/src/pages/SettingsPage.tsx` |

## İki ayrı SMTP kaynağı var — karıştırma

Bu, hata ayıklarken en çok zaman kaybettiren noktadır:

1. **Sistem SMTP'si** — `docker-compose.yml` içindeki `SMTP_*` ortam değişkenleri
   (sağlayıcı: 1&1 / IONOS, port 587).
   **Doğrulama kodu e-postaları** bunu kullanır.
2. **Kullanıcı SMTP'si** — `settings.model.ts` içindeki alanlar.
   **Ay raporu gönderimi** bunu kullanır.

"Doğrulama kodu gelmiyor" → 1. kaynağa bak. "Ay raporu gitmiyor" → 2. kaynağa bak.

## Tanı sırası

1. `/api/settings/smtp/test` uç noktasını çalıştır — en hızlı geri bildirim
2. Sunucu loglarına bak: `ssh appinsource "cd TravelExp && docker compose logs node --tail=50"`
3. Port/güvenlik uyumu: 587 → `smtpSecure: false` (STARTTLS), 465 → `smtpSecure: true`.
   Yanlış eşleşme sessiz zaman aşımına yol açar.
4. Sunucunun dışarı 587/465 açıp açamadığını kontrol et — Plesk sunucularında giden
   posta portları kapalı olabilir.

## Güvenlik uyarısı

`docker-compose.yml` içinde SMTP şifresi ve `COOKIE_SECRET` **düz metin** duruyor ve bu
dosya sunucuya gönderiliyor. Bu değerler `.env`'e taşınmalı, `.env` ise deploy'dan
hariç tutulmalıdır (`deploy.sh` zaten `.env`'i dışlar). Kullanıcıya bunu hatırlat ama
izinsiz taşıma — çalışan yapılandırmayı bozabilir.

Sırları belge, mesaj veya kod yorumlarına **kopyalama**; yalnızca bulundukları dosyaya
işaret et.

`settings.model.ts` içindeki `smtpPass` veritabanında saklanır. API yanıtlarında bu
alanın istemciye dönmediğinden emin ol.
