# Kurulum Durumu ve Yapılacaklar

**Tarih:** 4 Ağustos 2026
**Sunucu:** `217.160.215.57` (yeni) · eski sunucu `212.132.127.65` hâlâ çalışıyor
**Hedef:** Web + API yeni sunucuda dışarıya açık çalışsın, mobil uygulama iPhone'a Release olarak kurulsun

---

## Özet — nerede kaldık

Sunucu tarafı hazır ve veri taşındı. Tek engel kaldı:

| # | Engel | Kim çözecek | Durum |
|---|---|---|---|
| 1 | 80 portu Apache'de; web/API dışarıdan erişilemiyor | **root** (Apache durdurulacak) | ✅ **çözüldü — 4 Ağustos 2026** |
| 2 | EAS'te iOS sertifikası yok; bir kerelik interaktif üretim gerekiyor | **kullanıcı** (TTY'li oturum) | bekliyor |

Engel 1 çözülmeden engel 2'yi çözmek anlamsız: uygulama kurulsa bile sunucuya bağlanamaz.

### 4 Ağustos 2026 — Adım 1→4 tamamlandı (root oturumu)

| Adım | Yapılan | Doğrulama |
|---|---|---|
| 1 | `service apache2 stop` | `:80` ve `:443` boşaldı; Plesk paneli 8443'te (`sw-cp-serverd`) etkilenmedi |
| 2 | `docker compose up -d` | `travelexpenses_desktop` → `0.0.0.0:80->80` **ve** `8055->80` |
| 3 | Dış makineden (`212.132.127.65`) ölçüm | `web:200` · `api:200` · `/api/months:401` (oturum istiyor, doğru) · `/socket:101` (WebSocket upgrade OK) |
| 4 | `.env` + `eas.json` → `http://217.160.215.57/api` | JSON doğrulandı; `apps/native` commit `72fecf5` |

✅ **`apache2` boot'tan kaldırıldı** (`update-rc.d apache2 disable`) — `inactive` + `disabled`.

⚠️ Bu, teorik bir risk değildi: **4 Ağustos 16:41'de sunucu yeniden başladı**, apache o an
hâlâ `enabled` olduğu için 80/443'ü kaptı, `travelexpenses_desktop` `Exited (255)` ile
düştü ve site kapandı. Apache durdurulup konteyner `--force-recreate` ile yeniden
yaratılarak geri getirildi; ardından apache kalıcı olarak devre dışı bırakıldı.

📌 Boot'ta port çakışması olursa konteyner bozuk bir ara durumda kalır: `docker port` boş
döner ama `docker inspect` doğru `PortBindings` gösterir ve `up -d` bunu düzeltmez.
Çözüm: `docker compose up -d --force-recreate desktop`.

📌 Adım 4'te fark edilen: `eas.json`'daki `env` blokları çalışma kopyasında **silinmişti**
(commit'lenmemiş bir gerileme). Geri konuldu — build sadece `.env`'e bırakılmamalı.

### 4 Ağustos 2026 — HTTPS açıldı

Plesk'e ait ücretsiz hostname dışarıdan çözülüyor ve Let's Encrypt için geçerli bir alan
adı sayılıyor — **alan adı satın almaya gerek kalmadı**:

```
upbeat-margulis.217-160-215-57.plesk.page  →  217.160.215.57
```

| Ne | Nasıl |
|---|---|
| Sertifika | Let's Encrypt, `certbot/certbot` docker imajı, webroot doğrulama. **Süre: 2026-11-02** |
| Sertifika yolu | `certbot/conf/live/<hostname>/` — nginx'e read-only mount |
| 80 portu | `/.well-known/acme-challenge/` hariç her şey **301 → https** |
| 443 portu | TLS 1.2/1.3, SPA + `/api` + `/socket` |
| Otomatik yenileme | `/etc/cron.d/travelexp-certbot` — günde 2 kez `renew` + `nginx -s reload` |

Dışarıdan doğrulandı (sertifika doğrulaması **açık**, `-k` yok):
`web:200` · `api:200` · `/api/months:401` · `wss:101` · CN eşleşiyor.

⚠️ **`http2` bilerek KAPALI.** HTTP/2'de `Upgrade` başlığı yoktur; `/socket` handshake'i düz
GET'e dönüşüp node'dan **404** alıyordu. Tarayıcılar `wss://` için ayrı bir HTTP/1.1 bağlantısı
açtığı için pratikte sorun çıkmazdı, ama uygulamanın can damarı bu bağlantı. `nginx.conf`
içindeki açıklamayı silmeyin.

📌 **Desktop yeniden derlenmedi, gerekmedi.** [`useAuth.ts:4`](apps/desktop/src/hooks/useAuth.ts#L4)
`location.protocol`'den `wss://` türetiyor, API çağrıları relative (`/api`). Bundle'da gömülü
adres yok.

### Mobil taraf HTTPS'e alındı (commit `31358dd`)

| Dosya | Değişiklik |
|---|---|
| `.env` + `eas.json` (dev & preview) | `https://upbeat-margulis.217-160-215-57.plesk.page/api` |
| `ios/travelexpenses/Info.plist` | `NSAllowsArbitraryLoads` → `NSAllowsLocalNetworking` |
| `app.json` | aynı ATS değişikliği (senkron kalsın diye) |

⚠️ **Bare `ios/` projesi var** — EAS build `app.json`'ı değil `ios/travelexpenses/Info.plist`'i
okur. ATS'i sadece `app.json`'da değiştirmek **hiçbir işe yaramaz**. (`expo prebuild` hâlâ yasak.)

`NSAllowsLocalNetworking` seçildi çünkü `development` profili dev client ile Metro'ya LAN
üzerinden düz `http` ile bağlanıyor; ATS tamamen kapatılsaydı dev build'ler kırılırdı.
Dev client yine de şikâyet ederse tek satırlık geri dönüş: `NSAllowsArbitraryLoads` `true`.

### 🛑 4 Ağustos 2026 — Adım 5 BLOKE: Apple üyeliği süresi dolmuş

`eas build --platform ios --profile preview` çalıştırıldı, Apple reddetti:

```
Developer Program Membership Expired
App Store Connect has agreement updates that must be resolved
```

Engel 2 sanıldığı gibi "TTY yok" değilmiş — **asıl engel Apple hesabının durumu.**
Sunucu ve yapılandırma tarafında eksik yok.

⚠️ Ama bu **yalnızca EAS'i** bloke eder. EAS ücretsiz Apple hesabıyla çalışamaz (internal
distribution dağıtım sertifikası ister, ücretsiz takımlar üretemez), bu yüzden ücretli
yolu deneyip takıldı.

📌 **Ücretsiz hesapla 7 günlük kurulum hâlâ mümkün — ama yalnızca Mac + Xcode ile.**
Projede zaten ücretsiz takım ayarlı (`DEVELOPMENT_TEAM = 3DML5X8547`, `Apple Development`,
`Automatic`); 3 Ağustos'ta çalışan yol buydu. 99 USD yalnızca sunucudan derleme ve OTA
kurulum isteniyorsa gerekir. Adımlar: `mobile-ios.md` → Yol B.

⚠️ Mac'te derlemeden önce projeyi sunucudan **senkronize et** — Mac'teki kopyada eski API
adresi var, senkronlanmazsa telefon yine eski sunucuya gider.

⚠️ **Bu belgede daha önce "hesap ücretli, sertifika 1 yıl geçerli" yazıyordu — yanlıştı.**
Dayanağı "cihaz portalda kayıtlı" çıkarımıydı; cihaz kaydı üyelik bittikten sonra da
durduğu için bu, üyeliğin *geçerli* olduğunu göstermiyor. Hesap durumu çıkarımla değil
`eas build` çıktısıyla doğrulanmalı.

### Üyelik yenilenene kadar çalışan yol: Expo Go

Tüm bağımlılıklar Expo Go içinde hazır (özel native modül yok). `npx expo start --tunnel`
ile dev sunucu açılır, Expo Go'ya `exp://<tunel>` girilir. Kalıcı değil ama Apple hesabı,
sertifika ve 2FA gerektirmez — bugün belge çıkarmak için yeterli.

**Sıradaki:** Apple üyeliğinin yenilenmesi (kullanıcı) → Adım 5 → Adım 6.

---

## Tamamlananlar

| İş | Sonuç |
|---|---|
| Docker (mongo + node + nginx) | Ayakta, `docker compose ps` üçünü de `Up` gösteriyor |
| Web derlemesi | `apps/desktop` kaynaktan derlendi (Vite, 241 modül, hatasız) |
| Veri aktarımı | Eski sunucudan `mongodump` → yeni sunucuya `mongorestore --drop`, **86 doküman, 0 hata** |
| Node.js | `~/.local/node` altına kuruldu (sudo'suz), **v24.19.0** |
| eas-cli | **21.5.0**, giriş yapılmış: `appinsource` / developer@appinsource.eu |
| `apps/native` bağımlılıkları | 352 paket kurulu |
| Git deposu | `apps/native` içinde oluşturuldu (EAS şart koşuyor), tek commit |
| API adresi | `apps/native/.env` + `eas.json` (preview & development profilleri) |
| Kod düzeltmesi | `ScannerScreen.tsx` — sunucu hatasını "başarılı" sayan hata giderildi |

### Aktarılan veri (kaynak = hedef, birebir)

```
months 10 · positions 70 · destinations 2 · users 1 · profiles 1 · settings 1 · sessions 1
```

Eski sunucudaki veriye dokunulmadı; yalnızca okundu.

---

## Kritik bulgu 1 — portlar dışarıya kapalı

Gerçek bir dış makineden (`212.132.127.65` → `217.160.215.57`) ölçüldü:

| Port | Dışarıdan |
|---|---|
| 8055 (web) | **ULAŞILAMIYOR** |
| 3007 (API) | **ULAŞILAMIYOR** |
| 80 | 200 (Apache) |
| 443 | 303 (Plesk `sw-cp-server`) |
| 22 | Açık |

⚠️ **Sunucunun kendi içinden `curl http://217.160.215.57:8055` yapmak yanıltıcıdır** — trafik dışarı
çıkmadan geri döner ve 200 verir. Erişim testi mutlaka başka bir makineden yapılmalıdır.

`CLAUDE.md` bunu zaten yazıyordu: *"8055 ve 3007 KAPALI"*.

### Çözüm (seçilen yol)

Yeni bir nginx kurmaya gerek yok — `travelexpenses_desktop` konteyneri zaten nginx ve
`apps/desktop/nginx.conf` içinde `/api` → node, `/socket` → WebSocket yönlendirmeleri hazır.
Tek yapılacak: bu konteyneri **80 portuna** almak.

`docker-compose.yml` buna göre güncellendi (8055 de korundu):

```yaml
  desktop:
    ports:
      - '80:80'
      - '8055:80'
```

---

## Kritik bulgu 2 — Apple hesabı ücretli, 7 gün sınırı YOK

`.claude/agents/mobile-ios.md` "ücretsiz Personal Team, 7 gün sınırı, Team `3DML5X8547`" diyor.
**Bu bilgi eskimiş.** `eas device:list` ile doğrulandı:

```
UDID           00008120-000A656011F3C01E     ← hedef iPhone, ZATEN KAYITLI
Apple Team ID  HH4WN64A94 = Suleyman Topaloglu (Individual)
```

Expo hesabına bağlı takımlar:

| Takım | ID |
|---|---|
| Adler Direction GmbH (Company/Organization) | `9Z2735KD32` |
| Norm Services GmbH (Company/Organization) | `W3H24VCYK9` |
| **Suleyman Topaloglu (Individual)** | **`HH4WN64A94`** |

Apple ücretsiz takımları daima `(Personal Team)` diye adlandırır ve **cihaz kaydı yapamazlar**.
Cihazın portalda kayıtlı olması `HH4WN64A94`'ün ücretli üyelik olduğunu gösteriyor.

**Sonuçları:** sertifika 1 yıl geçerli (7 günde bir yeniden kurma derdi yok) · kurulum
telefondan Safari ile OTA yapılabilir · **Mac gerekmiyor**.

> `mobile-ios.md` bu bilgiyle güncellenmeli.

---

## Yapılacaklar

### Adım 1 — 80 portunu boşalt (root)

```bash
systemctl stop apache2
systemctl disable apache2
ss -tlnp | grep ':80 '        # çıktı BOŞ olmalı
```

Plesk paneli 443'te ayrı çalışır, ona dokunulmuyor — panel erişimi kaybolmaz.
Plesk'i tamamen kaldırmak bu hedef için gereksiz.

### Adım 2 — nginx'i 80'e al

```bash
cd /home/appinsource/TravelExp
docker compose up -d
docker compose ps
```

### Adım 3 — dışarıdan doğrula (zorunlu)

Kendi içinden test **etme**. Gerçek dış makineden:

```bash
ssh -i ~/.ssh/travelexp_migrate root@212.132.127.65 \
  "curl -s -o /dev/null -w 'web:%{http_code}\n' http://217.160.215.57/ ;
   curl -s -o /dev/null -w 'api:%{http_code}\n' http://217.160.215.57/api/destinations"
```

Beklenen: `web:200` · `api:200`

### Adım 4 — adresleri güncelle

```bash
echo 'EXPO_PUBLIC_API_URL=http://217.160.215.57/api' > apps/native/.env
# eas.json içindeki iki EXPO_PUBLIC_API_URL değeri de aynı yapılacak
cd apps/native && git add -A && git commit -m "API adresi 80 portuna alindi"
```

⚠️ Bu değer **derleme anında** bundle'a gömülür. Değiştirildiyse uygulama **yeniden
derlenip yeniden kurulmalıdır**; `.env`'i değiştirmek tek başına hiçbir şey yapmaz.

### Adım 5 — EAS sertifikası (bir kerelik, TTY gerekli)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /home/appinsource/TravelExp/apps/native
eas build --platform ios --profile preview
```

- Apple ID + parola + 2FA kodu istenecek
- Takım olarak **Suleyman Topaloglu (HH4WN64A94)** seçilecek
- Dağıtım tipi **Ad Hoc**, cihaz olarak `00008120-000A656011F3C01E` işaretlenecek

**Neden interaktif olmak zorunda:** eas-cli'ın
`credentials/ios/actions/SetUpInternalProvisioningProfile.js` (satır 54–66) dosyasında
non-interactive dal Apple kimlik doğrulamasını **hiç denemiyor**; Expo veritabanında hazır
ad-hoc credential yoksa anında hata veriyor. `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` /
`EXPO_ASC_ISSUER_ID` ortam değişkenleri bu yolu **etkilemiyor** (denendi, aynı hata).

Sertifika bir kez üretilip Expo sunucusuna kaydedildikten sonra bütün build'ler otomatik:

```bash
eas build --platform ios --profile preview --non-interactive
```

### Adım 6 — telefona kurulum

Build bitince EAS bir QR + URL verir → iPhone'da **Safari** ile aç → Install →
*Ayarlar → Genel → VPN ve Cihaz Yönetimi* → sertifikaya güven.

---

## Doğrulama ölçütü

Kurulum başarılı sayılır ancak şu gerçekleşirse:

1. Masaüstü web QR gösterir
2. Telefon QR'ı okur
3. **Yeni sunucunun loglarında** `POST /api/auth/scan` görünür:
   ```bash
   docker logs travelexpenses_node --since 5m | grep auth/scan
   ```
4. Web ekranı tepki verir (eşleşme kurulur)

Bugün 3. madde **0** kez gerçekleşti — telefon eski sunucuya gidiyordu.

---

## Bugün teşhis edilen arıza (referans)

**Belirti:** Telefon "giriş başarılı" diyor, web tarafında hiçbir tepki yok.

**Sebep zinciri:**

1. Telefondaki uygulama taşınmadan önce derlenmiş → içinde **eski** API adresi gömülü
2. QR'ın içinde masaüstünün `socketId`'si var; sunucu `socketRegistry.has(socketId)` ile
   soketi **kendi üzerinde** arıyor (`auth.route.ts:64`)
3. Telefon, yeni sunucunun socketId'sini eski sunucuya götürdü → eski sunucu tanımadı → **400**
4. Uygulama `res.ok`'ı kontrol etmediği için 400'ü başarı sayıp "success" ekranını açtı

**Log kanıtı:** yeni sunucuda `auth/*` isteği **0**, WebSocket bağlantısı **2** (web);
eski sunucuda `POST /api/auth/scan` → **400**, WebSocket **0**.

**Düzeltildi:** `ScannerScreen.tsx` artık `res.ok`'ı kontrol edip sunucunun hata mesajını
gösteriyor. Bu düzeltme bir sonraki derlemede etkili olacak.

---

## Ortam notları

| | |
|---|---|
| Node | `~/.local/node/bin` — her oturumda `export PATH="$HOME/.local/node/bin:$PATH"` |
| eas-cli | 21.5.0, giriş: `appinsource` (`~/.expo/state.json`) |
| Eski sunucu SSH | `ssh -i ~/.ssh/travelexp_migrate root@212.132.127.65` |
| Git | Yalnızca `apps/native` bir depo; proje kökü değil |
| Bundle ID | `com.appinsource.travelexpenses` |
| EAS projectId | `37239b66-9902-45fc-a88b-d450ae3dc7a1` |

`expo prebuild` **çalıştırma** — mevcut `ios/` yapısını bozar (`mobile-ios.md` uyarısı).

---

## Açık kalan konular

- ✅ **`/api/destinations` kapatıldı (4 Ağustos 2026).** Dört ucun (GET/POST/PATCH/DELETE)
  hepsi artık oturum istiyor. Dışarıdan doğrulandı: oturumsuz `401`, geçerli Bearer ile
  `200` + veri. Desktop `Authorization: Bearer` gönderdiği için Ayarlar sayfası etkilenmedi.
- ✅ **`DELETE /months/:id`, `GET /months/:monthId/positions`, `PUT /positions/:id`
  kapatıldı (4 Ağustos 2026).** Bunlar cihaza bağlı veri olduğu için oturum **+ sahiplik**
  kontrolü aldı (`loadOwnedMonth`). Dışarıdan doğrulandı: oturumsuz `401`, geçerli oturum
  `200`, olmayan/bozuk id `404`. Veri sağlam: 10 ay · 70 pozisyon.
- ⚠️ **Sahiplik kontrolü eksik kalanlar:** `/shuffle`, `/positions/bulk`, `/send-email`
  oturum istiyor ama ayın sahibi mi diye bakmıyor. Tek kullanıcı olduğu için şu an
  sömürülebilir değil.
- **Sırlar düz metin:** `docker-compose.yml` içinde `SMTP_PASS` ve
  `COOKIE_SECRET: supersecretchangeme` açık yazılı.
- **HTTPS yok.** iOS şimdilik kabul ediyor (`NSAllowsArbitraryLoads: true`). Alan adı +
  Let's Encrypt eklenirse uygulama yeniden derlenmeli.
- Aktarım için üretilen SSH anahtarı eski sunucunun `root` hesabında duruyor; gerekmiyorsa
  oradaki `~/.ssh/authorized_keys` satırı silinmeli.
- `.claude/agents/mobile-ios.md` güncellenmeli (ücretsiz team / 7 gün bilgisi yanlış).
