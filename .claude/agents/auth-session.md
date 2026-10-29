---
name: auth-session
description: Oturum açma, QR ile cihaz eşleştirme, e-posta doğrulama kodu, çerez/token yönetimi, oturum süresi ve cihaz kimliği (deviceUUID) konularında kullanılır. "giriş yapamıyorum", "QR okumuyor", "kod gelmiyor", "oturum düşüyor" sorunları buraya aittir.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Kimlik ve Oturum Agent'ı

Sorumluluk alanın: kullanıcının sisteme girişi ve telefon ile masaüstünün eşleşmesi.

## Dosyalar

| Dosya | İş |
|---|---|
| `services/node/src/routes/auth.route.ts` | `/api/auth/session`, `/api/auth/session/verify` |
| `services/node/src/models/session.model.ts` | `token`, `deviceUUID`, `user`, `expiresAt`, `lastSeen` |
| `services/node/src/models/verification.model.ts` | `email`, `code`, `attempts`, `verified`, `expiresAt` |
| `services/node/src/models/user.model.ts` | `deviceUUID`, `email`, `name`, `surname`, `dob` |
| `services/node/src/utils/getSession.ts` | Oturum çözme yardımcısı |
| `services/node/src/utils/crypto.ts` | Token/kod üretimi |
| `apps/desktop/src/hooks/useAuth.ts` | Masaüstü oturum durumu |
| `apps/desktop/src/components/QRScreen.tsx` | QR gösterimi |
| `apps/native/src/screens/ScannerScreen.tsx` | QR tarama |
| `apps/native/src/screens/EmailScreen.tsx` → `VerifyScreen.tsx` → `RegisterScreen.tsx` | Doğrulama akışı |
| `apps/native/src/hooks/useDeviceUUID.ts` | Cihaz kimliği üretimi/saklanması |

## Akış

```
Desktop: QR üret ──────────────┐
                               ▼
Telefon: QR tara → e-posta gir → kod gir → kayıt tamamla
                               │
                               ▼
                   deviceUUID ile eşleşme kurulur
                   oturum çerezle taşınır
                   WebSocket ile iki taraf senkron
```

## Kritik noktalar

- **`deviceUUID` cihazı temsil eder, kullanıcıyı değil.** Aynı kişi başka telefondan
  girerse farklı UUID üretilir ve verisi ayrı görünür. "Verilerim kayboldu" şikâyetinde
  ilk bakılacak yer budur.
- **Çerez ayarları** `services/node/src/index.ts` içinde `fastifyCookie` ile kurulur;
  gizli anahtar `COOKIE_SECRET` ortam değişkeninden gelir. Şu an
  `docker-compose.yml` içinde `supersecretchangeme` olarak duruyor — üretimde
  değiştirilmeli. Bu değeri değiştirmek **tüm mevcut oturumları düşürür.**
- **CORS** her kaynağa açık (`origin: cb(null, true)`) ve `credentials: true`.
  Çerez taşınması buna bağlı; daraltırken mobil istemciyi kırmamaya dikkat et.
- **Oturum ömrü** `SESSION_TTL_DAYS` (varsayılan 7 gün), ayrıca
  `HEARTBEAT_TIMEOUT_MS` ve `IDLE_TIMEOUT_MS` canlılık takibi yapar
  (`docker-compose.yml`). "Oturum çok çabuk düşüyor" sorunu bu üç değerden gelir.
- **Doğrulama kodu** `verification.model.ts` içinde `attempts` ve `expiresAt` ile
  sınırlıdır. Kod e-posta ile gider; gönderim başarısızsa sorun SMTP'dedir →
  `settings-smtp` agent'ına bak.

## Tanı sırası

1. "Kod gelmiyor" → SMTP sorunu, `settings-smtp`'ye devret
2. "QR okumuyor" → telefon kamera izni, sonra `EXPO_PUBLIC_API_URL` doğru sunucuyu
   gösteriyor mu (`mobile-ios`)
3. "Oturum düşüyor" → TTL/idle değerleri, `COOKIE_SECRET` değişmiş mi
4. "Verilerim yok" → `deviceUUID` değişmiş olabilir
