#!/usr/bin/env bash
# TravelExp — iPhone'a 7 günlük test kurulumu
#
# BU BETİK MAC'TE ÇALIŞIR, sunucuda değil. iOS imzalama yalnızca macOS'ta mümkündür.
#
# Ücretsiz Apple hesabı (Personal Team) ile imzalar; profil 7 gün geçerlidir.
# Süre dolunca bu betiği yeniden çalıştırmak yeterlidir.
#
# Kullanım:
#   ./install-iphone.sh              -> senkronize et + derle + kur
#   ./install-iphone.sh --no-sync    -> sunucudan çekme, mevcut kodu derle
#   ./install-iphone.sh --build-only -> derle ama telefona kurma

# POSIX sh ile çağrılırsa (sh install-iphone.sh) bash'e devret — aşağıdaki
# [[ ... ]] söz dizimi dash'te yoktur ve kontroller sessizce atlanır.
# shellcheck disable=SC2128
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

# Yanlış makinede çalıştırma en olası hata: bu betik MAC'te çalışır.
if [ "$(uname)" != "Darwin" ]; then
  echo "───────────────────────────────────────────────────────────────" >&2
  echo " Bu betik MAC'te çalışır — şu an $(uname) üzerindesiniz." >&2
  echo "" >&2
  echo " iOS derlemesi Apple'ın araçlarını (xcodebuild, devicectl)" >&2
  echo " gerektirir ve bunlar yalnızca macOS'ta bulunur." >&2
  echo "" >&2
  echo " Mac'inizde:" >&2
  echo "   scp appinsource:TravelExp/install-iphone.sh ~/" >&2
  echo "   chmod +x ~/install-iphone.sh && ~/install-iphone.sh" >&2
  echo "───────────────────────────────────────────────────────────────" >&2
  exit 1
fi

set -euo pipefail

# Açık user@ip kullanılır: "appinsource" kısayolu yalnızca bazı makinelerin
# ~/.ssh/config dosyasında tanımlıdır, Mac'te çözülemeyebilir.
REMOTE="${REMOTE:-appinsource@217.160.215.57}"
LOCAL="${LOCAL:-$HOME/TravelExp/apps/native}"
DEVICE="${DEVICE:-6C136F62-5934-5781-8565-24F80A200B18}"
EXPECTED_API="https://upbeat-margulis.217-160-215-57.plesk.page/api"

SYNC=1
INSTALL=1
for arg in "$@"; do
  case "$arg" in
    --no-sync)    SYNC=0 ;;
    --build-only) INSTALL=0 ;;
    *) echo "Bilinmeyen parametre: $arg" >&2; exit 1 ;;
  esac
done

command -v xcodebuild >/dev/null || { echo "HATA: xcodebuild yok. Xcode kurun." >&2; exit 1; }

# ── 1. Sunucudan senkronize et ────────────────────────────────────────
# Mac'teki kopya eskiyse içinde eski API adresi kalır ve telefon yanlış
# sunucuya gider. Dün yaşanan arızanın sebebi tam olarak buydu.
if [[ "$SYNC" -eq 1 ]]; then
  echo "==> Sunucudan senkronize ediliyor"
  mkdir -p "$LOCAL"
  rsync -avz --exclude node_modules --exclude .git --exclude ios/Pods \
    --exclude 'ios/build*' --exclude .expo \
    "${REMOTE}:TravelExp/apps/native/" "${LOCAL}/"
fi

# ── 1b. Bağımlılıklar ─────────────────────────────────────────────────
# node_modules ve Pods senkronizasyondan hariç tutulur (sunucuda üretilir,
# Mac'e taşınmaz). Hedef dizin yeniyse bunlar yoktur; derleme çökmeden kur.
if [[ ! -d "${LOCAL}/node_modules" ]]; then
  echo "==> node_modules yok, kuruluyor"
  ( cd "$LOCAL" && npm install )
fi

if [[ ! -d "${LOCAL}/ios/Pods" ]]; then
  echo "==> Pods yok, kuruluyor"
  command -v pod >/dev/null || {
    echo "HATA: CocoaPods yok. Kurmak için: sudo gem install cocoapods" >&2; exit 1; }
  ( cd "${LOCAL}/ios" && pod install )
fi

# ── 2. API adresini doğrula ───────────────────────────────────────────
# Bu değer derleme anında bundle'a gömülür; yanlışsa kurulum boşa gider.
API=$(grep -h '^EXPO_PUBLIC_API_URL=' "${LOCAL}/.env" 2>/dev/null | cut -d= -f2- || true)
echo "==> API adresi : ${API:-<BULUNAMADI>}"
if [[ "$API" != "$EXPECTED_API" ]]; then
  echo "UYARI: Beklenen adres bu değil:" >&2
  echo "       beklenen: $EXPECTED_API" >&2
  echo "       bulunan : ${API:-<yok>}" >&2
  read -r -p "Yine de devam edilsin mi? [e/H] " yn
  [[ "$yn" == "e" || "$yn" == "E" ]] || exit 1
fi

# ── 3. Release derlemesi ──────────────────────────────────────────────
# -allowProvisioningUpdates: ücretsiz takım için 7 günlük profili Xcode üretir.
echo "==> Derleniyor (ilk sefer 5-10 dk sürebilir)"
cd "${LOCAL}/ios"
xcodebuild -workspace travelexpenses.xcworkspace \
  -scheme travelexpenses \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build-release \
  -allowProvisioningUpdates \
  build

APP="build-release/Build/Products/Release-iphoneos/travelexpenses.app"
[[ -d "$APP" ]] || { echo "HATA: .app üretilmedi" >&2; exit 1; }

# JS bundle gömülü olmalı, yoksa uygulama Metro'ya bağımlı kalır
if [[ -f "$APP/main.jsbundle" ]]; then
  echo "==> Bundle gömülü: $(du -h "$APP/main.jsbundle" | cut -f1)"
else
  echo "UYARI: main.jsbundle yok — uygulama tek başına çalışmayabilir." >&2
fi

[[ "$INSTALL" -eq 1 ]] || { echo "==> Derleme bitti (kurulum atlandı)"; exit 0; }

# ── 4. Telefona kur ───────────────────────────────────────────────────
# En sık hata: telefon kilitliyse kAMDMobileImageMounterDeviceLocked.
# Tek sebebi ekran kilidi; kodla çözülmez.
echo "==> Telefona kuruluyor — İPHONE'UN KİLİDİ AÇIK OLSUN"
xcrun devicectl device install app --device "$DEVICE" "$APP"

cat <<'EOF'

==> Bitti.

Son adım telefonda:
  Ayarlar → Genel → VPN ve Cihaz Yönetimi → geliştirici sertifikasına güven

Profil 7 gün geçerlidir. Süre dolunca bu betiği tekrar çalıştırın.
EOF
