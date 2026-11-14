# PWA_READINESS — Mức sẵn sàng PWA

> Chỉ đọc source/config. **Không tạo manifest, service worker hay đổi cấu hình.**
> Nhãn: **[SRC]** đọc trực tiếp từ source · **[AGENT]** subagent báo (đã kiểm lại ở chỗ ghi) · **[PLAT]** hành vi nền tảng, *chưa kiểm chứng tại đây, cần thử trên thiết bị thật*.
> Android = Chrome/Chromium; iOS = Safari (mọi trình duyệt iOS dùng WebKit).

## 1. Kết luận ngắn

**Mức sẵn sàng: thấp về artefact, trung bình về nền.** Chưa có thành phần PWA nào (manifest, service worker, icon, meta iOS). Nền thì thuận lợi: static host có HTTPS, tên file Vite có hash, web/API khác origin nên service worker dễ cô lập, và **phần lớn API là dữ liệu cá nhân → đúng ra phải NetworkOnly**, nên phạm vi offline hợp lý là *app shell + trang tĩnh + (có thể) quét vé*.

Rủi ro lớn nhất không nằm ở kỹ thuật PWA mà ở **dữ liệu nhạy cảm và phiên đăng nhập** (mục 5, 6).

## 2. Hiện trạng từng yêu cầu

| Yêu cầu | Hiện trạng | Bằng chứng |
|---|---|---|
| Web App Manifest | **Chưa có**; không có `<link rel="manifest">` | `index.html`, `public/` [SRC] |
| Service Worker / plugin | **Chưa có**; không `vite-plugin-pwa`/`workbox` | `apps/web/package.json`, `rg` không khớp [SRC] |
| Icon ứng dụng | **Chưa có** PNG 192/512/maskable; chỉ `favicon.svg` | `public/` chỉ có `favicon.svg`, `images/`, `ocr/` [SRC] |
| `theme-color` | Có `#0b45c6` | `index.html` [SRC] |
| `apple-touch-icon`, `apple-mobile-web-app-*` | **Chưa có** | `index.html` [SRC] |
| `viewport-fit=cover` | **Chưa có** → `env(safe-area-inset-*)` = 0 trên iOS | `index.html:5` [SRC] |
| Safe area trong CSS | Đã dùng `env(safe-area-inset-bottom)` | `styles.css:1521`, `UserSite.jsx:84`, `BookingModal.jsx` [SRC] |
| Phát hiện chế độ standalone | **Chưa có** (`display-mode: standalone`, `navigator.standalone`) | `rg` [AGENT] |
| Màn hình chờ (splash) | Chưa có | — |
| Offline fallback | Chưa có; `ApiBanner` chỉ thăm dò `/health`, phân biệt `down`/`cors`, **không dùng `navigator.onLine`** | `components/ApiBanner.jsx` [AGENT] |
| Push | **Chưa có** (không `web-push`/VAPID/subscription; không dùng Notification API) | `rg` backend + web [AGENT] |

> Tài liệu `docs/PHAN_TICH_HE_THONG_AIRREST.md:251,475` nhắc màn `Reminder.jsx` dùng Notification API, nhưng **file đó không có trong `apps/web/src`** — tài liệu lệch mã nguồn [AGENT].

## 3. HTTPS, hosting, phạm vi service worker

| Điểm | Kết quả |
|---|---|
| Hosting web | `render.yaml`: `runtime: static`, `staticPublishPath: apps/web/dist`, rewrite `/* → /index.html` (`render.yaml:52-58`) [SRC] |
| HTTPS | URL `https://airrest-website.onrender.com` (`index.html` og:url); Render cấp HTTPS cho `*.onrender.com` [PLAT]; `localhost` là secure context [PLAT] |
| Scope SW | SW đặt ở `apps/web/public/sw.js` sẽ phục vụ ở gốc `/` → scope `/` khả thi [AGENT] |
| Header tuỳ chỉnh | `render.yaml` **chưa có khối `headers:`** [SRC, đã kiểm] → cần thêm `Cache-Control: no-cache` cho `/sw.js`, `index.html`, manifest trước khi bật SW |
| Rewrite SPA | Có nguy cơ trả `index.html` thay vì 404 cho file thiếu (ví dụ nhầm đường dẫn `sw.js`) — kiểm thực tế khi triển khai [PLAT] |
| Web ↔ API | Khác origin (`VITE_API_BASE_URL`, `CORS_ORIGINS`); backend dùng `helmet` + `cors({credentials:true})` (`backend/api/app.ts:40-41`) [AGENT] |
| CSP cho web | **Không có** (helmet chỉ áp cho API) [AGENT] |
| Đường dẫn VNPay | Quay về `pathname` `/payment/result` (`store.jsx:40`) — phải nằm trong scope SW và không bị SW chặn [SRC] |

## 4. Khả năng cài đặt

| Điều kiện cài | Có chưa |
|---|---|
| HTTPS | Có (deploy) |
| Manifest hợp lệ (name, icons 192/512, `start_url`, `display`) | **Chưa** |
| Service worker | **Chưa** (Chrome hiện không bắt buộc SW để hiện nút cài, nhưng cần cho offline [PLAT]) |
| Android: `beforeinstallprompt` | Chưa xử lý |
| iOS: Thêm vào Màn hình chính (thủ công, không có `beforeinstallprompt`) | Chưa có hướng dẫn trong app; thiếu icon/meta iOS |

## 5. Phân loại tài nguyên và chiến lược cache an toàn

Nguyên tắc: **allowlist GET công khai**; mọi request có `Authorization` hoặc thuộc nhóm cá nhân là **NetworkOnly** và không bao giờ vào Cache Storage.

| Tài nguyên | Loại | Chiến lược đề xuất |
|---|---|---|
| `/assets/*-<hash>.js\|css`, `zxing_reader.wasm` (`?url`, có hash) | Tĩnh, bất biến | Precache / CacheFirst |
| `index.html`, `/sw.js`, manifest | Vỏ ứng dụng | NetworkFirst; HTTP `no-cache`; **sw.js không bao giờ để HTTP cache giữ** |
| `/favicon.svg`, `/images/*` (không hash) | Tĩnh | StaleWhileRevalidate (hoặc đổi tên có hash) |
| `/ocr/*` (`worker.min.js`, `tesseract-core-*`, `eng.traineddata.gz`) — **23MB tổng, 3 biến thể core, mỗi máy chỉ dùng 1** | Tĩnh lớn, không hash | **Không precache**; runtime cache theo yêu cầu (CacheFirst) cho file thật sự được tải |
| Google Fonts | Bên thứ ba | SWR (CSS) + CacheFirst giới hạn số mục (woff2) |
| Tile OpenStreetMap | Bên thứ ba | **NetworkOnly** (chính sách tile OSM không cho tải trước hàng loạt) [PLAT] |
| Ảnh khách sạn trên R2 (cross-origin) | Bên thứ ba | Chỉ cache nếu có CORS (tránh opaque response phình quota) [PLAT] |
| `GET /v1/hotels`, `/hotels/:id`, `/airports`, `/payments/methods` | Công khai nhưng đổi (giá, tồn) | SWR/NetworkFirst TTL ngắn — **chưa xác minh là công khai** |
| `GET /v1/hotels/:id/hourly-slots`, `/v1/flights/:code` | Thời gian thực | NetworkOnly |
| `POST /v1/bookings`, `/quote`, `/lookup`, shuttle/change/support/payments/payer | Giao dịch, PII | NetworkOnly (POST vốn không cache). **Không dùng Background Sync ghi lại đơn** — dù `data/user.js` đã có `idempotencyKey` |
| `/v1/auth/*`, `/me`, `PATCH /me/password` | Xác thực | NetworkOnly, tuyệt đối không cache |
| `GET /v1/me/bookings`, `/v1/track/shuttle`, `/v1/payer/*` | Theo người dùng | NetworkOnly |
| Cổng hotel (`bookings`, `profile`, `drivers`, `vehicles`, `inventory`…), cổng admin (`roles`, `accounts`, `audit`, `payments`…), `/v1/driver/trips*` | Nhân sự, nhạy cảm | NetworkOnly |
| Socket.IO (`/socket.io/`, ws) | Realtime | Loại khỏi routing của SW |
| `/health`, `/docs`, `/openapi.json` | Hạ tầng | NetworkOnly |

Chưa xác minh được toàn bộ endpoint trong các wrapper `${A}`/`${H}` của `api.js` — danh sách trên là những gì thấy được.

## 6. Bảo mật khi thêm SW — ranked

1. **CAO — cache nhầm API có Bearer** (me/bookings, hotel/admin/driver, payer, track): Cache Storage **không bị xóa khi logout**; thiết bị dùng chung có thể thấy dữ liệu người trước. Giảm thiểu: allowlist + mặc định NetworkOnly; nếu sau này có cache dữ liệu, `caches.delete` khi logout.
2. **CAO — `sw.js`/`index.html` bị cache HTTP/CDN** → client kẹt bản cũ gọi API mới. Cần header `no-cache` (hiện chưa có khối `headers:` trong `render.yaml`).
3. **TRUNG — PII còn trong `localStorage`**: `airrest.guest` (họ tên + SĐT) và `airrest.cart` không bị xóa ở reducer `logout` (`store.jsx`, không thấy xóa) [AGENT, khớp với kiểm tra `rg removeItem`: chỉ `cart.js` quản lý]. Đã tồn tại từ trước PWA, nhưng bản cài đặt làm nó bền hơn.
4. **TRUNG — token Bearer 1h, không refresh, không CSP cho web**; `sessionStorage` đọc được nếu có XSS.
5. **THẤP–TRUNG — vá `window.fetch`** để lấy token nhân sự (`useRealtime.js`): mong manh nếu thêm lớp chặn fetch.
6. **THẤP — opaque response** cross-origin làm phình quota; ToS tile OSM.
7. Ảnh vé máy bay: OCR chạy cục bộ, ảnh không rời máy (`ocr.js`) → **không được đưa vào cache/IndexedDB**.

## 7. Offline

| Khả thi | Cần ghi rõ "đang offline" |
|---|---|
| App shell, trang tĩnh/ảnh; bước **đọc vé** (OCR + barcode cục bộ) *nếu* asset OCR/zxing đã nằm trong cache | Danh sách khách sạn/giá/tồn phòng, đặt phòng, thanh toán (VNPay/MoMo redirect ngoài), theo dõi xe (realtime/polling 7s), cổng hotel/admin/driver, đăng nhập |

Bước tra chuyến bay (`/v1/flights/:code`) vẫn cần mạng. Socket có trạng thái `offline` và dự phòng polling (`socket.js`, `useRealtime.js`) [AGENT].

## 8. Chiến lược cập nhật

- Vite tạo tên file có hash → an toàn cho precache/CacheFirst.
- `index.html` phải NetworkFirst/no-cache để không kẹt bản cũ.
- `VITE_API_BASE_URL` được nhúng lúc build (`render.yaml`).
- API có tiền tố `/v1` nhưng **không thấy cơ chế version/min-client** [AGENT] → cần luồng "có bản mới → tải lại" do người dùng bấm (kiểu `prompt`), **không tự reload**. Lý do: tải lại làm mất token nhân sự trong bộ nhớ và có thể ngắt giữa lúc đặt phòng/thanh toán.

## 9. Android vs iOS

| Mục | Android (Chrome) | iOS (Safari) | Nguồn |
|---|---|---|---|
| Cài đặt | `beforeinstallprompt`, popup/banner cài | Thủ công: Chia sẻ → Thêm vào Màn hình chính; **không có** `beforeinstallprompt` | [PLAT] |
| Icon | Manifest icons (cần 192/512, maskable) | Cần `apple-touch-icon`; manifest được dùng nhiều hơn từ iOS 16.4 | [PLAT]; repo thiếu cả hai [SRC] |
| Safe area | `env()` có giá trị sẵn khi cần | Cần `viewport-fit=cover` | [PLAT]; repo thiếu [SRC] |
| Standalone | `matchMedia('(display-mode: standalone)')` | thêm `navigator.standalone` | [PLAT] |
| Push | Hỗ trợ cả trong trình duyệt | Chỉ khi **đã cài** và iOS ≥ 16.4 | [PLAT]; repo chưa có hạ tầng push [SRC] |
| Lưu trữ | Quota lớn; có thể bị dọn khi thiếu bộ nhớ | Safari có thể xóa dữ liệu script sau ~7 ngày không dùng với site chưa cài; quy tắc này không áp cho app đã cài | [PLAT] |
| Camera trong standalone | `getUserMedia` hoạt động | Từng có lỗi cũ trên iOS PWA; **phải thử máy thật** | [PLAT] |
| Thanh toán redirect | Có thể mở ra ngoài scope | Có thể mở trình duyệt/overlay; `/payment/result` phải thuộc scope | [PLAT] + `store.jsx:40` [SRC] |
| `sessionStorage` khi đóng app | Mất | Mất | [SRC suy luận từ `api.js:14`] → khách phải đăng nhập lại mỗi lần mở app |

## 10. Phiên đăng nhập trong PWA đã cài — điểm cần quyết định

- **Nhân sự:** token chỉ nằm trong bộ nhớ (`api.js:16`, `auth.js:1`) → mở lại app hoặc hệ điều hành đóng app nền là **phải đăng nhập lại**. Đây là thiết kế bảo mật chủ ý; PWA không tự cải thiện được. Việc có đổi hay không là **quyết định của chủ sản phẩm**, ngoài phạm vi audit (không đổi auth).
- **Khách:** `sessionStorage` cũng mất khi đóng app.

## 11. Chưa xác minh

Chưa build/chạy; chưa kiểm header thực tế của Render (route precedence, `Cache-Control`); chưa kiểm router backend để biết GET nào công khai; chưa thử bất kỳ thiết bị iOS/Android nào; chưa kiểm tra xóa guest token khi logout khách ở mức từng dòng (đoạn `store.jsx:74-75` cho thấy xóa khi `state.user` về null).


---

## Cập nhật 2026-11-14: manifest và icon đã có (chưa có service worker)

Bảng ở mục 2 đã lỗi thời cho các dòng sau (xem `IMPLEMENTATION_PLAN.md`, "Trạng thái Phase 3"):

| Yêu cầu | Trạng thái mới |
|---|---|
| Web App Manifest | **Có** — `public/manifest.webmanifest`, Chrome đọc 0 lỗi |
| Icon PNG 192/512/maskable | **Có** — `public/icons/*` |
| `apple-touch-icon`, `apple-mobile-web-app-*` | **Có** — `public/apple-touch-icon.png`, `index.html` |
| `viewport-fit=cover` | **Có** (từ Phase 1) |
| Service worker, offline, header `no-cache`, standalone detection, hướng dẫn cài | **Vẫn chưa** |
| Installability (Chrome) | Chỉ còn báo `in-incognito` do phiên kiểm thử ẩn danh |
