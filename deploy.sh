#!/usr/bin/env bash
# TravelExp deploy — projenin tamamını SSH/rsync ile sunucuya gönderir.
#
# Mantık: "her şeyi gönder, üretilebilir olanı gönderme".
# node_modules, Pods ve iOS derleme çıktıları sunucuda npm/pod ile
# yeniden üretilebildiği için aktarılmaz (~2.5 GB tasarruf).
#
# Kullanım:
#   ./deploy.sh              -> gönder + docker compose up -d --build
#   ./deploy.sh --no-restart -> sadece dosyaları gönder
#   ./deploy.sh --dry-run    -> hiçbir şey göndermeden ne olacağını göster
#   ./deploy.sh --with-env   -> .env dosyalarını da gönder (dikkatli kullanın)
#
# Sunucu/hedef değiştirmek için:
#   REMOTE=appinsource DEST=TravelExp ./deploy.sh

set -euo pipefail

REMOTE="${REMOTE:-appinsource}"     # ~/.ssh/config içindeki Host adı
DEST="${DEST:-TravelExp}"           # home altındaki hedef klasör
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RSYNC_FLAGS=(-avz --delete --human-readable)
RESTART=1
WITH_ENV=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)    RSYNC_FLAGS+=(--dry-run); RESTART=0 ;;
    --no-restart) RESTART=0 ;;
    --with-env)   WITH_ENV=1 ;;
    *) echo "Bilinmeyen parametre: $arg" >&2; exit 1 ;;
  esac
done

# Sunucuda yeniden üretilebilen ya da oraya ait olmayan her şey
EXCLUDES=(
  --exclude 'node_modules'
  --exclude '.git'
  --exclude '.DS_Store'
  --exclude '.expo'
  --exclude 'ios/Pods'
  --exclude 'ios/build'
  --exclude 'ios/build-release'
  --exclude 'ios/DerivedData'
  --exclude 'android/build'
  --exclude 'android/.gradle'
  --exclude '*.log'
  # Let's Encrypt sertifikalari SUNUCUDA uretilir ve yerelde yoktur.
  # Haric tutulmazsa --delete bunlari siler -> nginx acilmaz -> site komple duser.
  --exclude 'certbot'
)

# .env'ler ortama göre değişir; sunucudaki kopya yerelden farklı olmalıdır.
# Bilinçli olarak istenmedikçe gönderilmez.
if [[ "$WITH_ENV" -eq 0 ]]; then
  EXCLUDES+=(--exclude '.env')
fi

echo "==> Kaynak : ${ROOT}"
echo "==> Hedef  : ${REMOTE}:~/${DEST}/"
[[ "$WITH_ENV" -eq 1 ]] && echo "==> UYARI  : .env dosyaları da gönderiliyor"

ssh "$REMOTE" "mkdir -p '${DEST}'"

rsync "${RSYNC_FLAGS[@]}" "${EXCLUDES[@]}" "${ROOT}/" "${REMOTE}:${DEST}/"

if [[ "$RESTART" -eq 1 ]]; then
  echo "==> Konteynerler yeniden başlatılıyor"
  ssh "$REMOTE" "cd '${DEST}' && docker compose up -d --build"
  # nginx.conf tek DOSYA olarak bind-mount edilmis; rsync dosyayi yeni inode ile
  # degistirdigi icin konteyner eski konfigi gormeye devam eder ve 'up -d' bunu
  # fark etmez. Web konteynerini bilerek yeniden yaratiyoruz (~2 sn).
  ssh "$REMOTE" "cd '${DEST}' && docker compose up -d --force-recreate desktop"
  ssh "$REMOTE" "cd '${DEST}' && docker compose ps"
fi

echo "==> Bitti"
