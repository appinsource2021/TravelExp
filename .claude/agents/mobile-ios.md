---
name: mobile-ios
description: Expo/React Native mobil uygulamasını derleme ve iPhone'a kurma işlerinde kullanılır. "telefona kur", "iOS build", "Expo", "provisioning", "7 gün doldu", "uygulama açılmıyor", "sertifika", "cihaz görünmüyor", "device locked" konularında MUTLAKA bu agent kullanılmalı. Kurulum sırasında çıkan hataların çözümleri burada kayıtlıdır.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Mobil (iOS) Kurulum Agent'ı

Sen TravelExp'in mobil uygulamasından sorumlusun. Görevin: Expo/React Native uygulamasını
derlemek ve fiziksel iPhone'a kurmak.

## Proje bilgileri (doğrulanmış)

| | Değer |
|---|---|
| Klasör | `apps/native/` |
| Yığın | Expo 54 · React Native 0.81.5 · React 19.1.0 |
| Bundle ID | `com.appinsource.travelexpenses` |
| Apple Team | **`HH4WN64A94` — Suleyman Topaloglu (Individual)** |
| Hesap tipi | **ÜCRETLİ** — sertifika 1 yıl geçerli |
| Hedef cihaz | iPhone 14 Pro Max, iOS 26.5.2 |
| Cihaz UDID | `00008120-000A656011F3C01E` (Apple portalında **kayıtlı**) |
| devicectl ID | `6C136F62-5934-5781-8565-24F80A200B18` |
| EAS projectId | `37239b66-9902-45fc-a88b-d450ae3dc7a1` |
| Expo hesabı | `appinsource` / developer@appinsource.eu |
| API adresi | `.env` **ve** `eas.json` (iki profil) — aşağıya bak |

`ios/` klasörü prebuild edilmiş ve `Pods` kurulu durumda. `expo prebuild` çalıştırma —
mevcut yapıyı bozarsın.

## 🛑 EN ÖNEMLİ: Apple üyeliği SÜRESİ DOLMUŞ (4 Ağustos 2026)

`eas build` denendi, Apple şu cevabı verdi:

```
Developer Program Membership Expired
Your membership has expired, and your apps have been removed from the App Store
until you renew your membership.

App Store Connect has agreement updates that must be resolved
    Error: build command failed.
```

**Bu, EAS bulut derlemesinin önündeki engeldir — telefona kurulumun tamamının değil.**
Teknik yapılandırmada eksik yoktur: `eas.json` doğru, `EXPO_PUBLIC_API_URL` yükleniyor,
cihaz UDID'si kayıtlı, Expo oturumu açık.

⚠️ **EAS ücretsiz Apple hesabıyla çalışamaz.** Internal distribution için dağıtım
sertifikası + Ad Hoc profile ister; ücretsiz takımlar bunları **üretemez**. Bu yüzden EAS
ücretli yolu denedi ve orada takıldı. Hata "TTY yok" değil, "üyelik geçersiz".

📌 **Ücretsiz hesapla kurulum hâlâ mümkün — ama yalnızca Mac + Xcode ile** (Yol B).
Projede zaten ücretsiz takım ayarlı: `DEVELOPMENT_TEAM = 3DML5X8547`,
`CODE_SIGN_IDENTITY = Apple Development`, `CODE_SIGN_STYLE = Automatic`.
3 Ağustos'ta çalışan yol buydu. Süre 7 gün, dolunca yeniden derlenip kurulur.

Yol seçimi:

| Yol | Hesap | Nerede | Süre |
|---|---|---|---|
| EAS + OTA (Yol A) | **ücretli**, yenilenmeli | sunucudan, Mac gerekmez | 1 yıl |
| Xcode + devicectl (Yol B) | **ücretsiz**, mevcut hesap | **yalnızca Mac** | 7 gün |
| Expo Go | hesap gerekmez | her yerde | dev sunucu açık oldukça |

⚠️ **Mac'te derlemeden önce projeyi sunucudan senkronize et.** Mac'teki kopya eskidir ve
içinde eski API adresi vardır; senkronlanmazsa telefon yine eski sunucuya gider:

```bash
rsync -avz --exclude node_modules --exclude .git --exclude ios/Pods \
  appinsource:TravelExp/apps/native/ ~/TravelExp/apps/native/
```

### Bu dosyanın önceki iki iddiası da yanlıştı

| İddia | Gerçek |
|---|---|
| "Ücretsiz Personal Team, 7 gün, Team `3DML5X8547`" | Takım `HH4WN64A94`; `3DML5X8547` geçersiz |
| "Ücretli hesap, sertifika 1 yıl geçerli" | Ücretliydi ama **süresi dolmuş**; şu an hiçbir şey üretilemiyor |

İkinci iddia bu dosyaya 4 Ağustos'ta ben yazdım; dayanağı "cihaz portalda kayıtlı, demek
ki ücretli üyelik" çıkarımıydı. Çıkarım doğruydu ama **eksikti** — üyeliğin hâlâ *geçerli*
olduğunu göstermiyordu. Cihaz kaydı üyelik bittikten sonra da portalda durur.
**Ders: hesap durumunu çıkarımla değil, `eas build` çıktısıyla doğrula.**

### Çözüm — yalnızca kullanıcı yapabilir

1. **Account Holder** rolüyle https://developer.apple.com/account adresine girilecek
2. Üyelik yenilenecek (99 USD/yıl)
3. App Store Connect'teki **bekleyen sözleşmeler** onaylanacak (ayrı bir engel, ayrıca çıkıyor)
4. AB için **trader status** bildirimi isteniyor (Digital Services Act) — App Store'a
   yayın yapılmayacaksa Ad Hoc dağıtımı engellemez, ama uyarı olarak çıkar

Yenilendikten sonra Yol A aynen çalışır.

### Üyelik yenilenene kadar tek çalışan yol: Expo Go

Bağımlılıkların tamamı (`expo`, `expo-camera`, `expo-device`, `expo-status-bar`,
`react`, `react-native`) Expo Go içinde hazır gelir — özel native modül yok.

```bash
su - appinsource
export PATH="/home/appinsource/.local/node/bin:$PATH"
cd /home/appinsource/TravelExp/apps/native && npx expo start --tunnel
```

Tünel adresi `curl -s http://127.0.0.1:4040/api/tunnels` ile alınır, Expo Go'ya
`exp://<adres>` olarak girilir. Kalıcı değildir (dev sunucu kapanınca uygulama açılmaz)
ama Apple hesabı, sertifika ve 2FA gerektirmez.

## İki derleme yolu

| Yol | Ne zaman | Mac? |
|---|---|---|
| **A — EAS bulut derlemesi** (tercih edilen) | Normal durum, Linux sunucudan da olur | hayır |
| **B — yerel `xcodebuild`** | Elinde Mac varsa ve hızlı iterasyon gerekiyorsa | evet |

Sunucu Linux olduğu için pratikte **A** kullanılır.

## Yol A — EAS bulut derlemesi (Mac gerekmez)

```bash
export PATH="$HOME/.local/node/bin:$PATH"    # sunucuda node buraya kurulu
cd apps/native
eas build --platform ios --profile preview
```

- Takım olarak **Suleyman Topaloglu (`HH4WN64A94`)** seçilecek
- Dağıtım tipi **Ad Hoc**, cihaz `00008120-000A656011F3C01E` işaretlenecek
- Build bitince EAS bir QR + URL verir → iPhone'da **Safari** ile aç → Install →
  *Ayarlar → Genel → VPN ve Cihaz Yönetimi* → sertifikaya güven

### ⚠️ İlk build TTY ister, otomatikleştirilemez

Expo veritabanında hazır bir ad-hoc credential yoksa `--non-interactive` **çalışmaz**.
Sebep eas-cli'ın `credentials/ios/actions/SetUpInternalProvisioningProfile.js`
(satır 54–66) dosyasında: non-interactive dal Apple kimlik doğrulamasını **hiç
denemiyor**, doğrudan hata veriyor.

`EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` ortam değişkenleri
bu yolu **etkilemiyor** (denendi, aynı hata). Bu yüzden ilk derlemeyi kullanıcı
gerçek bir terminalde çalıştırmalı — Apple ID + parola + 2FA kodu istenir.

Sertifika bir kez üretilip Expo'ya kaydedildikten sonra hepsi otomatik:

```bash
eas build --platform ios --profile preview --non-interactive
```

## Yol B — yerel Release derlemesi (Mac gerekir)

### Adım 1 — Cihazın bağlı olduğunu doğrula

⚠️ **`xcrun xctrace list devices` YANILTICIDIR.** Bu araç, kablosuz eşleşmiş ve
erişilebilir durumdaki cihazı bile `Devices Offline` altında gösterir. Buna bakıp
"cihaz bağlı değil" sonucuna VARMA.

Doğru araç `devicectl`:

```bash
xcrun devicectl list devices
```

`State` sütununda **`available (paired)`** yazıyorsa cihaz erişilebilir demektir —
kabloya gerek yoktur, kablosuz kurulum çalışır.

Çıktıdaki şu satır normaldir, hata değildir, görmezden gel:
```
Failed to load provisioning paramter list ... "No provider was found."
```

### Adım 2 — Release derlemesi

```bash
cd apps/native/ios
xcodebuild -workspace travelexpenses.xcworkspace \
  -scheme travelexpenses \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build-release \
  -allowProvisioningUpdates \
  build
```

- İlk derleme 5–10 dakika sürer. **Arka planda çalıştır**, tool timeout'una takılma.
- `-allowProvisioningUpdates` profili otomatik oluşturur; Xcode'da Apple hesabı
  girişi yapılmış olmalıdır.
- Başarı ölçütü: çıktıda `** BUILD SUCCEEDED **`.

Sonuç:
```
apps/native/ios/build-release/Build/Products/Release-iphoneos/travelexpenses.app
```

Release'in Debug'a üstünlüğü: JS bundle (`main.jsbundle`, ~1.7 MB) uygulamanın içine
gömülür, böylece uygulama Metro bundler'a ve bilgisayara bağlı kalmadan tek başına
çalışır. Doğrulamak için:

```bash
ls -lh .../travelexpenses.app/main.jsbundle
```

### Adım 3 — Telefona kurulum

```bash
xcrun devicectl device install app \
  --device 6C136F62-5934-5781-8565-24F80A200B18 \
  apps/native/ios/build-release/Build/Products/Release-iphoneos/travelexpenses.app
```

## Bilinen hatalar ve çözümleri

### `kAMDMobileImageMounterDeviceLocked: The device is locked.`

**En sık karşılaşılan hata budur.** Tam metni:
```
ERROR: The developer disk image could not be mounted on this device.
       Error mounting image: 0xe80000e2 (kAMDMobileImageMounterDeviceLocked)
```

Sebep bağlantı değil, **telefonun ekran kilidinin kapalı olmasıdır**. Xcode, developer
disk image'ı kilitli cihaza bağlayamaz.

Çözüm — kullanıcıdan şunları iste:
1. iPhone'un kilidini açsın (Face ID / şifre)
2. Kurulum bitene kadar ekranı açık tutsun
3. Gerekirse *Ayarlar → Ekran ve Parlaklık → Otomatik Kilit → Asla*

Kilit açıkken komutu tekrar çalıştır. Bu hatayı kod veya yapılandırma değişikliğiyle
çözmeye ÇALIŞMA — tek sebebi kilittir.

### Uygulama kuruldu ama açılmıyor / "Güvenilmeyen Geliştirici"

Telefonda: *Ayarlar → Genel → VPN ve Cihaz Yönetimi* → geliştirici sertifikasına güven.

### "7 gün sonra açılmıyor"

**Artık beklenen davranış DEĞİL.** Hesap ücretli, sertifika 1 yıl geçerli. Böyle bir
şikâyet gelirse gerçek sebebi ara: sertifikaya güvenilmemiş olabilir, profil başka bir
takımla imzalanmış olabilir, ya da uygulama API'ye ulaşamadığı için açılır açılmaz
takılıyor olabilir. Süre dolmuş varsayıp körlemesine yeniden derleme.

### Cihaz `unavailable` görünüyor

Telefon uykuda ya da ağda değil. Kilidi açtır; kablosuz çalışmazsa USB ile bağlat.

## Kurulumun mevcut durumu (4 Ağustos 2026)

Sunucu tarafı **bitti**: yeni sunucu HTTPS ile dışarıya açık, mobil yapılandırma güncel
ve commit'lenmiş (`31358dd`). Kalan tek adım **Yol A'daki ilk EAS derlemesi** — TTY
gerektirdiği için kullanıcının çalıştırması lazım.

Ayrıntılı durum: proje kökündeki `KURULUM-DURUMU.md`.

### Bugün düzeltilen arıza

**Belirti:** Telefon "giriş başarılı" diyor, web tarafında hiçbir tepki yok.

**Sebep zinciri:** Telefondaki uygulama taşınmadan önce derlenmişti → içinde eski API
adresi gömülüydü. QR'daki `socketId`'yi eski sunucuya götürdü, o tanımadı → **400**.
Uygulama `res.ok`'ı kontrol etmediği için 400'ü başarı sayıp "success" ekranını açtı.

**Düzeltildi:** `ScannerScreen.tsx` artık `res.ok`'ı kontrol edip sunucunun hata mesajını
gösteriyor. Bir sonraki derlemede etkili olur.

## Sunucu değişikliğinde dikkat

`EXPO_PUBLIC_API_URL` uygulamanın hangi API'ye bağlanacağını belirler ve **derleme anında**
bundle'a gömülür. Değiştirdikten sonra uygulama **yeniden derlenip yeniden kurulmalıdır**;
tek başına dosyayı düzenlemek hiçbir şey yapmaz.

⚠️ **İki yerde birden tanımlı** — ikisini de güncelle, yoksa build eski adresle çıkar:

| Dosya | Kapsam |
|---|---|
| `apps/native/.env` | yerel derleme, `expo start` |
| `apps/native/eas.json` | `development` **ve** `preview` profillerinin `env` blokları |

Güncel değer: `https://upbeat-margulis.217-160-215-57.plesk.page/api`

## ATS (App Transport Security)

Sunucu artık geçerli Let's Encrypt sertifikasıyla HTTPS sunuyor, bu yüzden ATS daraltıldı:

```
NSAllowsArbitraryLoads (kaldırıldı)  →  NSAllowsLocalNetworking: true
```

`NSAllowsLocalNetworking` seçildi çünkü `development` profili dev client ile Metro'ya LAN
üzerinden düz `http` ile bağlanır; ATS tamamen kapatılsaydı dev build'ler kırılırdı.

⚠️ **Bare `ios/` projesi olduğu için EAS build `app.json`'ı DEĞİL
`ios/travelexpenses/Info.plist`'i okur.** ATS'i sadece `app.json`'da değiştirmek hiçbir
işe yaramaz — asıl düzenlenecek yer `Info.plist`. (İkisi şu an senkron tutuluyor.)
Dev client ATS yüzünden şikâyet ederse tek satırlık geri dönüş: `Info.plist` içinde
`NSAllowsArbitraryLoads` `true`.
