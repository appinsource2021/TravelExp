# TravelExp — Debug & Çözüm Notları

## 1. Expo — Serversiz Çalıştırma

**Sorun:** `expo start` ile yüklenen uygulama Metro server'a bağımlı. PC kapanınca "No script URL provided" hatası.

**Çözüm:** Release build alınır, JS bundle uygulamanın içine gömülür.
```bash
npx expo run:ios --configuration Release --device
```

---

## 2. iOS — Code Signing Hatası

**Sorun:** `CommandError: No code signing certificates are available to use.`

**Çözüm:** Xcode → Project → Signing & Capabilities → Automatically manage signing → Team seç (ücretsiz Apple ID yeterli). Sonra Xcode'dan ▶ Run veya `--device` ile build.

---

## 3. iOS — Simulator Bulunamadı

**Sorun:** `CommandError: No iOS devices available in Simulator.app`

**Çözüm:** Xcode → Settings → Platforms → iOS → Get ile simulator indir. Veya:
```bash
xcodebuild -downloadPlatform iOS
```

---

## 4. Port Yapılandırması

| Servis | Port |
|--------|------|
| Node BE | 3007 |
| Desktop FE (nginx) | 8055 |

**Değişiklikler:**
- `services/node/.env` → `PORT=3007`
- `apps/desktop/vite.config.ts` → `port: 8055`
- `docker-compose.yml` → `3007:3007`, `8055:80`

---

## 5. FE → BE Bağlantısı (Relative URL)

**Sorun:** FE'de hardcoded IP (`192.168.2.212:3001`) vardı. Ortam değişince çalışmıyordu.

**Çözüm:** Relative URL kullan — nginx aynı origin'den proxy yapar.
```ts
// useApi.ts
const API = import.meta.env.VITE_API_URL ?? '/api'

// useAuth.ts
const WS_URL = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/socket`
const API_URL = import.meta.env.VITE_API_URL ?? '/api'
```

**Not:** `apps/desktop/.env` içindeki eski hardcoded değerler temizlendi — boş bırakıldı.

---

## 6. Desktop Deploy — Static Build + nginx Mount

**Sorun:** Desktop Dockerfile build içinde yapıyordu, sunucuya tüm kaynak kopyalanması gerekiyordu.

**Çözüm:** Lokal build alınır, sadece `dist/` klasörü sunucuya kopyalanır. nginx image'ı direkt mount eder.

```yaml
# docker-compose.yml
desktop:
  image: nginx:alpine
  volumes:
    - ./apps/desktop/dist:/usr/share/nginx/html:ro
    - ./apps/desktop/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

**Deploy akışı:**
```bash
# Lokal
cd apps/desktop && npm run build

# Sunucuya kopyala
scp -r apps/desktop/dist root@<IP>:/home/TravelExp/apps/desktop/dist
scp apps/desktop/nginx.conf root@<IP>:/home/TravelExp/apps/desktop/nginx.conf

# Sunucuda
docker compose up -d
```

---

## 7. nginx — "host not found in upstream node"

**Sorun:** nginx başlarken `node` container'ını DNS'te bulamıyor ve crash yapıyor.

**Çözüm:** Docker internal resolver kullan — hostname startup'ta değil, istek geldiğinde çözümlenir.
```nginx
resolver 127.0.0.11 valid=10s;
set $upstream node:3007;
```

---

## 8. nginx — nginx.conf Klasör Olarak Oluştu

**Sorun:** Sunucuda `scp` ile kopyalanmadan önce klasör oluşturulunca `nginx.conf` dizin oldu.
```
drwxr-xr-x nginx.conf/   ← olmamalı
```

**Çözüm:**
```bash
rm -rf /home/TravelExp/apps/desktop/nginx.conf
cat > /home/TravelExp/apps/desktop/nginx.conf << 'EOF'
# nginx içeriği buraya
EOF
```

---

## 9. Node Dockerfile — `tsc: Permission denied`

**Sorun:** `npm ci --omit=dev` ile dev bağımlılıkları kurulmadığı için `tsc` bulunamıyordu. Ayrıca `.dockerignore` yoktu.

**Çözüm:** Multi-stage build + `COPY . .` sonrası chmod.
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN chmod -R +x node_modules/.bin && npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3007
CMD ["node", "dist/index.js"]
```

`.dockerignore`:
```
node_modules
dist
.env
```

---

## 10. iOS — ATS HTTP Engellemesi

**Sorun:** iOS Release build'de `http://` adreslerine bağlantı ATS tarafından engelleniyor. Hata: `Network request failed`.

**Çözüm:** `ios/travelexpenses/Info.plist` düzenlendi:
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

`app.json` güncellendi (prebuild için):
```json
"ios": {
  "infoPlist": {
    "NSAppTransportSecurity": {
      "NSAllowsArbitraryLoads": true
    }
  }
}
```

Prebuild ile uygulamak için:
```bash
npx expo prebuild --platform ios --clean
npx expo run:ios --configuration Release --device
```

---

## 11. Native — API URL Yapılandırması

**Sorun:** Native app'te hardcoded `localhost:3001` vardı.

**Çözüm:** `apps/native/.env`:
```
EXPO_PUBLIC_API_URL=http://<SUNUCU_IP>:8055/api
```

Native, nginx üzerinden değil direkt sunucuya bağlanır (mobil cihaz farklı ağdan erişir).
