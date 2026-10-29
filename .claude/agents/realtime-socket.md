---
name: realtime-socket
description: WebSocket bağlantısı, masaüstü-telefon canlı senkronu ve bağlantı kopması konularında kullanılır. "QR okundu ama ekran değişmiyor", "senkron olmuyor", "bağlantı kopuyor", "socket" konuları buraya aittir.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Gerçek Zamanlı Senkron Agent'ı

Sorumluluk alanın: masaüstü ile telefon arasındaki canlı bağlantı.

## Dosyalar

| Dosya | İş |
|---|---|
| `services/node/src/routes/socket.route.ts` | `/socket` uç noktası |
| `services/node/src/plugins/socket-registry.ts` | Açık bağlantıların kaydı |
| `services/node/src/index.ts` | `@fastify/websocket` kaydı |
| `apps/desktop/src/context/AppContext.tsx` | İstemci tarafı bağlantı durumu |

## Kritik: `/socket` önek dışındadır

`index.ts` içinde `authRoute` ve `travelRoute` `{ prefix: '/api' }` ile kaydedilir,
**`socketRoute` kaydedilmez**. Yani doğru adres `/socket`'tir, `/api/socket` değil.

nginx yapılandırmasında da ayrı bir blok vardır ve `Upgrade`/`Connection` başlıklarını
iletmesi şarttır (`apps/desktop/nginx.conf`):

```nginx
location /socket {
    proxy_pass http://$upstream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Bu başlıklar eksikse bağlantı sessizce HTTP'ye düşer ve senkron çalışmaz. Reverse proxy
(Plesk subdomain) kurarken bu bloğu taşımayı unutma — atlanırsa QR eşleşmesi çalışmaz.

## Bağlantı ömrü

`docker-compose.yml` içindeki iki değer davranışı belirler:

- `HEARTBEAT_TIMEOUT_MS` (60000) — canlılık sinyali aralığı
- `IDLE_TIMEOUT_MS` (600000) — boşta kalma sınırı

"Bağlantı kendiliğinden kopuyor" şikâyetinde bu iki değere bak.

## Tanı sırası

1. Bağlantı kuruluyor mu: tarayıcı konsolunda WebSocket durumu
2. Sunucu logu: `ssh appinsource "cd TravelExp && docker compose logs node -f"`
3. nginx `Upgrade` başlığını iletiyor mu
4. `deviceUUID` iki tarafta aynı mı — eşleşme buna dayanır (`auth-session`)

## Dikkat

- `socket-registry` açık bağlantıları bellekte tutar; konteyner yeniden başlatıldığında
  tüm bağlantılar düşer, istemcilerin yeniden bağlanması beklenir.
- Bağlantı kopması çoğu zaman **ağ/proxy** kaynaklıdır, kod kaynaklı değil. Koda
  dokunmadan önce proxy başlıklarını doğrula.
