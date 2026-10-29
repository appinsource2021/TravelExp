---
name: deploy-ops
description: Sunucuya dosya gönderme, Docker konteynerleri, rsync/SSH, Plesk ve dışarıdan erişim konularında kullanılır. "deploy", "sunucuya gönder", "docker", "konteyner", "loglar", "siteye erişemiyorum", "port kapalı" konuları buraya aittir.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Deploy ve Sunucu Agent'ı

Sorumluluk alanın: kodun sunucuya taşınması ve orada çalışır durumda kalması.

## Sunucu

| | |
|---|---|
| SSH | `ssh appinsource` → 217.160.215.57 (`~/.ssh/config`) |
| Kullanıcı | `appinsource`, home: `/home/appinsource` |
| Hedef | `/home/appinsource/TravelExp/` |
| Docker | 29.7.1 — **sudo gerekmez**, kullanıcı `docker` grubunda |
| Panel | **Plesk 18.0.79** (Debian 13), 80/443'ü `apache2` yönetir |
| sudo | **Yok** — sistem düzeyi değişiklik yapamazsın |

## Deploy

```bash
./deploy.sh              # gönder + docker compose up -d --build
./deploy.sh --no-restart # sadece dosya gönder
./deploy.sh --dry-run    # ne gideceğini göster (önce bunu çalıştır)
./deploy.sh --with-env   # .env'leri de gönder (varsayılan: gönderilmez)
```

Mantık: **"her şeyi gönder, üretilebilir olanı gönderme."** Hariç tutulanlar
`node_modules`, `ios/Pods`, `ios/build*`, `.git`, `.expo`, `.env`, `*.log`.
Böylece 2.6 GB yerine ~2.6 MB aktarılır.

Masaüstü arayüzünde değişiklik yaptıysan **önce** `npm --prefix apps/desktop run build`
çalıştır; nginx `dist/` klasörünü sunar, kaynağı değil.

## Servisler

```
travelexpenses_mongo     MongoDB 7      (dışarı port açmaz)
travelexpenses_node      Fastify        :3007
travelexpenses_desktop   nginx          :8055 → 80
```

```bash
ssh appinsource "cd TravelExp && docker compose ps"
ssh appinsource "cd TravelExp && docker compose logs -f node --tail=50"
ssh appinsource "cd TravelExp && docker compose restart node"
```

## ⚠️ Bilinen sorun: dışarıdan erişilemiyor

Uygulama sunucu **içinden** çalışır (`curl localhost:8055` → 200) ama **dışarıdan**
erişilemez. Ölçülen durum:

| Port | Dışarıdan |
|---|---|
| 22, 80, 443 | açık |
| 8055, 3007 | **kapalı** |

Sebep: Plesk sunucularında 80/443 dışındaki portlar varsayılan olarak kapalıdır ve
80/443'ü zaten `apache2` tutmaktadır.

İki çözüm — **ikisi de panel/root yetkisi ister, SSH kullanıcısıyla yapılamaz:**

1. **Önerilen — Plesk'te subdomain + reverse proxy.** Subdomain oluştur →
   *Apache & nginx Settings* → ek nginx direktifi:
   ```nginx
   location / {
       proxy_pass http://127.0.0.1:8055;
       proxy_set_header Host $host;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```
   `Upgrade`/`Connection` başlıkları WebSocket için zorunludur — atlanırsa QR
   eşleşmesi çalışmaz. Let's Encrypt ile ücretsiz HTTPS gelir.

2. Plesk Firewall'dan 8055'i açmak — daha hızlı ama SSL'siz.

Bu adımı kullanıcı yapmalıdır. Kendin `sudo` denemeye kalkma, yetki yok.

## ⚠️ rsync tek yönlüdür

`deploy.sh` yalnızca yerelden sunucuya iter, geri çekmez. İki bilgisayardan deploy
edilirse **son gönderen kazanır** ve `--delete` yüzünden diğerinin dosyaları silinir.

Proje kökü git deposu **değildir** (yalnızca `apps/native/` kendi deposuna sahiptir).
Çok makineli çalışma için önce git'e geçilmelidir; sunucuda git 2.47.3 kurulu.

Başka bir makinede çalışılıyorsa, deploy etmeden önce sunucudaki halin daha yeni olup
olmadığını kontrol et:
```bash
ssh appinsource "cd TravelExp && find . -newer docker-compose.yml -type f | head"
```

## Sırlar

`docker-compose.yml` içinde SMTP şifresi ve `COOKIE_SECRET` düz metin duruyor ve bu
dosya sunucuya gidiyor. `.env`'e taşınmalı. Sırları belge veya mesajlara kopyalama.
