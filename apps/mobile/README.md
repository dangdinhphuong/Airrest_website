# apps/mobile

Vỏ Capacitor (Android) đóng gói `apps/web` thành APK debug. Không có code giao diện riêng: dùng bản build của `apps/web`.

- Docker: `docker compose up -d` chạy service `apk-builder`, ghi `dist-android/airrest-debug.apk` (chạy một lần rồi thoát; xem log: `docker compose logs apk-builder`).
- Địa chỉ API nhúng vào APK: biến `APP_API_URL` (mặc định `https://airrest.dpdns.org`).
- App chỉ dùng được khi API và tunnel công khai đang chạy. CORS_ORIGINS của api phải có `https://localhost`.
- Web build ra `apps/mobile/www` (không đụng `apps/web/dist`).
