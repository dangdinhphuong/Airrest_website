#!/bin/sh
# Build APK debug: web (apps/web) -> apps/mobile/www -> Gradle. Xuất ra dist-android/airrest-debug.apk ở gốc monorepo.
# Web build ra thư mục riêng (www), KHÔNG đụng apps/web/dist mà web-prod đang phục vụ.
set -eu
cd "$(dirname "$0")/../.."
[ -d node_modules/@capacitor/cli ] || npm install
(cd apps/web && node scripts/copy-ocr-assets.mjs \
  && VITE_API_BASE_URL="${APP_API_URL:-https://airrest.dpdns.org}" npx vite build --configLoader runner --outDir ../mobile/www --emptyOutDir)
cd apps/mobile
npx cap sync android
(cd android && ./gradlew assembleDebug)
mkdir -p ../../dist-android
cp android/app/build/outputs/apk/debug/app-debug.apk ../../dist-android/airrest-debug.apk
echo "APK: dist-android/airrest-debug.apk"
