# TravelExp

Alman seyahat masrafı (Reisekosten) takip sistemi. Çalışan bir aya ait seyahatlerini
kaydeder; sistem yol/konaklama/yemek ödeneklerini hesaplar, PDF üretir ve e-posta ile
gönderir.

## Mimari

Üç parça, tek MongoDB:

```
apps/desktop  React + Vite         → nginx :80/:443 (ana arayüz, TLS burada biter)
apps/native   Expo / React Native  → iPhone         (QR tarayıcı + kayıt)
services/node Fastify + WebSocket  → :3007          (API)
services/mongo MongoDB 7                             (veri)
```

Canlı adres: **https://upbeat-margulis.217-160-215-57.plesk.page**

nginx hem SPA'yı sunar hem de `/api` → node, `/socket` → WebSocket yönlendirmesini yapar
(`apps/desktop/nginx.conf`). Dışarıya yalnızca nginx bakar; node doğrudan açık değildir.

**Eşleşme akışı — projenin can damarı:**

1. Desktop bir QR gösterir (`QRScreen.tsx`)
2. Telefon QR'ı tarar (`ScannerScreen.tsx`)
3. Telefon e-posta doğrulaması yapar (`EmailScreen` → `VerifyScreen` → `RegisterScreen`)
4. Eşleşme `deviceUUID` üzerinden kurulur, oturum çerezle taşınır
5. İki taraf WebSocket (`/socket`) ile canlı senkron kalır

`deviceUUID` neredeyse tüm modellerde bulunan ortak anahtardır — kullanıcıyı değil
**cihazı** temsil eder. Veri sorgularken bunu atlama.

## API yüzeyi

Tümü `/api` öneki altında (`services/node/src/index.ts`):

| Route | Dosya | İş |
|---|---|---|
| `/auth/session`, `/auth/session/verify` | `auth.route.ts` | Oturum, e-posta doğrulama |
| `/destinations` | `travel.route.ts` | Kayıtlı adresler + km |
| `/profile` | `travel.route.ts` | Kişi/firma bilgisi |
| `/months` | `travel.route.ts` | Aylar ve pozisyonlar |
| `/settings`, `/settings/smtp/test` | `travel.route.ts` | Ayarlar, SMTP testi |
| `/socket` | `socket.route.ts` | WebSocket (önek YOK) |

## Veri modeli

`month` (bir kişinin bir ayı) → içinde çok sayıda `position` (tek bir seyahat).
Hesaplama alanları Almanca isimlidir ve anlamları yasal karşılıklarıdır:

- `verpflegungPauschal` — yemek götürü ödeneği
- `uebernachtungPauschal` — konaklama götürü ödeneği
- `fahrkostenTatsaechlich` — gerçekleşen yol gideri
- `reisezweck` — seyahat amacı
- `km` × `kmPrice` — kilometre bazlı hesap

Bu isimleri İngilizceye çevirme; veritabanı, API ve arayüz bu adlara bağlı.

## Komutlar

```bash
# Desktop geliştirme
npm --prefix apps/desktop run dev
npm --prefix apps/desktop run build      # dist/ üretir, nginx bunu sunar

# Mobil (detay için mobile-ios agent'ına bak)
cd apps/native && npx expo start

# Deploy (tüm proje → sunucu)
./deploy.sh                 # gönder + docker compose up -d --build
./deploy.sh --no-restart    # sadece dosya gönder
./deploy.sh --dry-run       # ne gideceğini göster

# Sunucu
ssh appinsource
ssh appinsource "cd TravelExp && docker compose ps"
ssh appinsource "cd TravelExp && docker compose logs -f node"
```

VS Code'da `Cmd+Shift+B` deploy'u çalıştırır (`.vscode/tasks.json`).

## Sunucu

| | |
|---|---|
| Host | `appinsource` → 217.160.215.57 (`~/.ssh/config`) |
| Genel adres | `upbeat-margulis.217-160-215-57.plesk.page` (Plesk'in ücretsiz hostname'i) |
| Hedef | `/home/appinsource/TravelExp/` |
| Docker | 29.7.1, sudo'suz kullanılabiliyor |
| Panel | **Plesk 18.0.79** — yalnızca **8443/8880**'de (`sw-cp-serverd`) |
| `apache2` | **durduruldu** (4 Ağustos 2026); 80/443 artık docker nginx'te |
| Dışarı açık portlar | 22, 80 (→301 https), 443, 8055, 3007 |
| SSH kullanıcısı | `appinsource` sudo yetkisi **yok**; sistem işleri için `root` gerekir |

### Erişim ve TLS

Dışarıdan erişim **açık ve HTTPS'li**. Sertifika Let's Encrypt (webroot doğrulama,
`certbot/certbot` docker imajı), otomatik yenileme `/etc/cron.d/travelexp-certbot`.
Sertifika dosyaları `certbot/conf/live/<hostname>/` altında, nginx'e read-only mount.

⚠️ **Erişim testini sunucunun kendi içinden yapma.** `curl http://217.160.215.57/` sunucu
içinden 200 döner ama bu hiçbir şey kanıtlamaz — trafik dışarı çıkmadan geri döner.
Gerçek bir dış makineden ölç:

```bash
ssh -i ~/.ssh/travelexp_migrate root@212.132.127.65 \
  "curl -s -o /dev/null -w '%{http_code}\n' https://upbeat-margulis.217-160-215-57.plesk.page/"
```

⚠️ **`nginx.conf`'ta `http2` bilerek kapalı.** HTTP/2'de `Upgrade` başlığı yoktur; açılırsa
`/socket` handshake'i düz GET'e dönüşür ve node **404** verir. Açma.

⚠️ **`nginx.conf` tek dosya olarak bind-mount edilmiş.** İçeriğini değiştirmek konteyneri
tetiklemez ve `docker compose up -d` "Running" deyip geçer. Değişikliğin geçmesi için
`docker compose up -d --force-recreate desktop` gerekir.

`apache2` **durduruldu ve boot'tan kaldırıldı** (`inactive` + `disabled`, symlink yok).

⚠️ Bu ders pahalıya mal oldu: 4 Ağustos'ta sunucu yeniden başladı, `apache2` o sırada hâlâ
`enabled` olduğu için 80/443'ü kaptı, `travelexpenses_desktop` portlara bağlanamayıp
`Exited (255)` ile düştü ve **site kapandı**. Apache'yi tekrar `enable` etme.

📌 Boot'ta port çakışması yaşanırsa konteyner bozuk bir ara durumda kalabilir: `docker port`
boş döner, `docker inspect` ise doğru `PortBindings` gösterir. `up -d` bunu düzeltmez —
`docker compose up -d --force-recreate desktop` gerekir.

## Deploy mantığı

`deploy.sh` "her şeyi gönder, üretilebilir olanı gönderme" ilkesiyle çalışır.
Hariç tutulanlar: `node_modules`, `ios/Pods`, `ios/build*`, `.git`, `.expo`, `.env`,
**`certbot`**. Bu sayede 2.6 GB yerine ~2.6 MB aktarılır.

⚠️ **`certbot/` hariç tutulması hayati.** Sertifikalar sunucuda üretilir, yerelde yoktur;
hariç tutulmazsa `--delete` onları siler → nginx açılmaz → **site komple düşer.**

Deploy sonunda `desktop` konteyneri bilerek `--force-recreate` ile yeniden yaratılır —
`nginx.conf` tek dosya bind-mount olduğu için `up -d` tek başına değişikliği görmez.

⚠️ **rsync tek yönlüdür.** İki farklı bilgisayardan deploy edilirse "son gönderen kazanır"
ve `--delete` yüzünden diğerinin dosyaları silinebilir. Proje kökü henüz git deposu
değildir (yalnızca `apps/native/` kendi deposuna sahiptir). Çok makineli çalışma
planlanıyorsa önce git'e geçilmelidir.

## Bilinen sorunlar

- **`COOKIE_SECRET` hâlâ varsayılan** (`supersecretchangeme`). Artık `.env`'de,
  ama değeri değiştirilmeli. ⚠️ Değiştirmek TÜM oturumları düşürür **ve** kayıtlı
  SMTP/IMAP şifrelerini çözülemez hale getirir (`utils/crypto.ts` anahtarı bundan
  türetiyor) — şifreler ayarlardan yeniden girilmeli.
- **Sahiplik kontrolü eksik olan route'lar** (`travel.route.ts`): `POST /months/:id/shuffle`,
  `POST /months/:monthId/positions/bulk`, `POST /months/:id/send-email` oturum istiyor ama
  ayın **kendi cihazına ait olduğunu** doğrulamıyor. Şu an tek kullanıcı olduğu için
  sömürülebilir değil; `loadOwnedMonth()` yardımcısı hazır, eklenmesi birkaç dakika.
- **Proje kökü git deposu değil** — yalnızca `apps/native/` kendi deposuna sahip.

> **4 Ağustos 2026'da kapatılan açıklar:** `/destinations` (GET/POST/PATCH/DELETE) —
> ortak veri olduğu için yalnızca oturum şartı. `DELETE /months/:id`,
> `GET /months/:monthId/positions`, `PUT /positions/:id` — bunlar cihaza bağlı veri
> olduğu için oturum **+ sahiplik** (`loadOwnedMonth`) kontrolü aldı.

📌 `loadOwnedMonth()` "yok" ile "senin değil" ayrımını dışarı sızdırmaz; geçersiz id,
olmayan ay ve başkasının ayı hepsi **404** döner. Geçersiz ObjectId'de CastError ile
çökmemesi için `Types.ObjectId.isValid` ile korunur.

> **Düzeltilenler (4 Ağustos 2026):** "8055/3007 dışarıya kapalı" ve "7 günlük iOS sınırı"
> maddeleri artık geçerli değil. Portlar açıldı, HTTPS kuruldu; Apple hesabı ücretli
> çıktı (detay: `mobile-ios` agent'ı). `apps/native/.env` yeni sunucuyu gösteriyor.

## Sırlar ve `.env`

Sırlar proje kökündeki **`.env`** dosyasındadır; `docker-compose.yml` onu
`env_file` ile node konteynerine aktarır. Dosya `600` izinlidir, git'e girmez ve
`deploy.sh` tarafından hariç tutulur — **sunucudaki kopya yereldekinden bağımsızdır.**

| Değişken | Not |
|---|---|
| `ANTHROPIC_API_KEY` | AI ile ay üretimi. Boşsa özellik sessizce kapalı. |
| `COOKIE_SECRET` | Oturum + SMTP/IMAP şifre şifrelemesi. Değiştirmek ikisini de bozar. |
| `SMTP_*` | Sunucunun ortak gönderim hesabı |

Değişiklikten sonra: `docker compose up -d --force-recreate node`

## AI ile ay üretimi

Ay detayında **"✨ AI ile Üret"** düğmesi. `POST /months/:id/shuffle` gövdesine
`{ "useAi": true }` gider.

📌 **AI parayı hesaplamaz.** Model yalnızca *planı* seçer (gün, adres, amaç,
gecelik mi); ödenek/km/toplam hesabı `buildPositionsFromPlan` içinde deterministik
yapılır — klasik shuffle ile birebir aynı kurallar. Yasal hesap modele bırakılmadı.

- Model `claude-opus-5`, structured outputs ile şemaya zorlanmış plan döner
- Önceki **5 ayın** özeti modele verilir, tekrarı önlemesi istenir
- Bütçe tutmazsa modele sapma bildirilip **bir kez** daha denenir
- Herhangi bir aksilikte (anahtar yok, red, geçersiz JSON, bütçe tutmadı)
  **sessizce klasik üretime düşülür** — düğme her hâlükârda çalışır, yanıttaki
  `aiError` alanı sebebi söyler ve arayüz bunu kullanıcıya gösterir
- Eski pozisyonlar ancak yeni plan hazır olduktan sonra silinir
- Sonuç `month.generatedBy` (`manual`/`shuffle`/`ai`) ve `generatedNote` olarak saklanır

⚠️ Klasik shuffle **zaten** önceki ayın günlerini eliyor ve destinasyon dizilerini
benzerlik skoruyla karşılaştırıp tekrarı önlüyordu (`shuffle.ts`). AI'ın kattığı
şey daha fazla aya bakabilmek, resmi tatilleri bilmek ve daha iyi çeşitlilik.

### Ayarlar → AI Yönergeleri

`settings.aiHint` — kullanıcının yazdığı serbest metin, HER üretimde prompt'a
eklenir. `settings.aiTolerance` (%0-25) bütçe aralığını genişletir; **hem prompt
hem doğrulama aynı `effMin`/`effMax` değerini kullanır** — biri gevşeyip diğeri
sıkı kalırsa model geçse bile sonuç reddedilir.

📌 Prompt kurarken modele **aritmetik yaptırma.** İlk sürümde maliyet formülünü
prompt'a yanlış yazmıştım (`km × 2 × 0,30`, oysa kod `km × 0,30`); model seyahat
başı tutarı iki katı sanıp bütçeyi tutturamadı. Artık her adresin **tam tutarı**
hesaplanıp prompt'a yazılıyor.

📌 Modele **önceki ayların toplam tutarı** da gönderilir — yoksa "aynı tutarı
tekrarlama" yönergesi işlemez, model neyi tekrarladığını bilemez.

📌 Model deterministiktir: aynı girdiye hep aynı planı verir. Klasik shuffle
rastgeleydi. Aynı davranışı korumak için prompt'a bir **çeşitlilik tohumu**
(rastgele sayı) katılıyor.

📌 Çeşitlilik adres sayısıyla sınırlı: iki adres varsa ulaşılabilir toplam sayısı
azdır, tutarlar zaman zaman tekrar eder. Daha çok adres = daha çok çeşitlilik.

## Agent'lar

`.claude/agents/` altındadır. Konusuna göre ilgili agent'ı kullan:

| Agent | Alanı |
|---|---|
| `travelexp-architect` | Genel mimari, birden çok katmana dokunan işler |
| `auth-session` | Oturum, QR eşleşme, e-posta doğrulama, cihaz kimliği |
| `months-positions` | Aylar, seyahat kayıtları, ödenek hesapları |
| `settings-smtp` | Ayarlar, SMTP, e-posta gönderimi |
| `profile-destinations` | Profil, adresler, km tanımları |
| `realtime-socket` | WebSocket, canlı senkron |
| `desktop-ui` | React arayüzü, i18n, PDF/Excel |
| `mobile-ios` | Expo derleme ve **telefona kurulum** |
| `deploy-ops` | Docker, rsync, sunucu, Plesk |
