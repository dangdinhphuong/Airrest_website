# ARCHITECTURE — Kiến trúc mục tiêu (đề xuất, chưa triển khai)

> Hướng: **incremental migration** trên chính stack hiện tại (React 18 + Vite 6 + Tailwind 4). Không đổi backend/API/DB/auth/nghiệp vụ. Mỗi mục có: file/module, giải pháp, chi phí (số file/phụ thuộc — **không ước giờ công**), tác động, tiêu chí nghiệm thu.

## 1. Nguyên tắc

1. Giữ nguyên desktop; mọi thay đổi mobile nằm sau breakpoint hoặc `display-mode`.
2. Tái dùng thứ đã có: drawer `AppNav`, bottom bar `UserSite`, `visibleTabs`, `data-label` bảng→thẻ, modal dạng bottom sheet của `BookingModal`.
3. PWA chỉ cache **vỏ ứng dụng và tài nguyên tĩnh**; mọi API cá nhân là NetworkOnly.
4. Không giả định PWA chỉ dành cho mobile: manifest/SW áp cho mọi thiết bị; chỉ *giao diện app-like* gắn với màn nhỏ hoặc `display-mode: standalone`.

## 2. Chiến lược breakpoint

- **Thang thống nhất:** `640 / 768 / 1024` (= `sm / md / lg` Tailwind). "Mobile" = `<768`, "Tablet" = `768–1023`, "Desktop" = `≥1024`.
- Hiện `styles.css` có 11 giá trị (600, 640, 720, 768, 860, 900, 960, 992, 1024, 1080, 1100) → gộp dần về thang trên, **từng khối một, kèm kiểm tra viewport**; không gộp hàng loạt.
- Nhạy cảm: mốc `719/720` đang điều khiển bảng→thẻ (`styles.css:239`). Đổi sang 767/768 làm bảng→thẻ áp dụng thêm ở 720–767px; cần quyết định có chấp nhận.
- Khai báo thang ở một nơi (biến CSS/`@theme` của Tailwind v4) để hai hệ CSS cùng tham chiếu.
- **File:** `styles.css`, `forms.css`, `user.css`; **Chi phí:** ~40 khối `@media`; **Tác động:** có thể đổi layout ở dải 720–1100px; **Nghiệm thu:** ảnh chụp trước/sau ở 375/768/1024/1280 không có hồi quy, không còn mốc ngoài thang (trừ ngoại lệ có ghi chú).

## 3. Kiến trúc điều hướng mobile (theo permission, không theo tên vai trò)

| Khung | Mobile (<768) | Tablet | Desktop |
|---|---|---|---|
| Người dùng cuối | Bottom bar 4 tab (đã có, `UserSite.jsx:84`) | Nav ngang `md` | Nav ngang |
| Khách sạn | Bottom bar **tối đa 4 mục + "Thêm"** (sheet) lấy từ `visibleTabs(sess, hotelTabs)`; ẩn khi ≤1 mục | Drawer (hiện tại) | Panel cố định (hiện tại) |
| Quản trị | **Drawer** làm chính (hiện tại); bottom bar tuỳ chọn | Drawer | Panel cố định |
| Hai khu vực | Bộ chuyển khu vực ở đầu drawer/sheet | như trên | Liên kết hiện tại |

Quy tắc chọn mục cho bottom bar khách sạn: lấy các tab còn lại sau `visibleTabs`, ưu tiên theo một danh sách thứ tự **được chủ sản phẩm xác nhận** (chưa có bằng chứng ai dùng điện thoại). Thành phần mới đề xuất: một component `BottomNav` nhận `items` từ `visibleTabs` — dùng chung cho khách sạn/quản trị, tránh viết ba bản.

- **File:** `components/Layout.jsx`, `App.jsx` (truyền `items`), `lib/hotelNav.js`/`adminNav.js` (có thể thêm trường `priority`); **Tác động:** thêm padding đáy cho `.feed-in` (đã có `72px`, `styles.css:548`); **Nghiệm thu:** với tài khoản chỉ có `trip:drive` không hiện thanh nav thừa; tab không có quyền không bao giờ xuất hiện; back của trình duyệt vẫn đúng.

## 4. Thành phần responsive dùng chung

| Thành phần | Thay đổi | File |
|---|---|---|
| Nút/ điều khiển | Vùng chạm ≥44px ≤1023px (padding hoặc pseudo-element) | `styles.css:67,72,75,78,556,557`, `tw:size-10` |
| Bảng | Đủ `data-label`; thead dùng kỹ thuật `sr-only`; gợi ý cuộn ngang ở 720–1023 | `components/hotel/*`, `admin/kit.jsx`; thêm `data-label` cho các màn `admin/*` nếu dùng bảng |
| Modal | Hợp nhất: <640 bottom sheet, ≥640 dialog giữa; luôn `max-h` + cuộn nội bộ; focus trap + `Escape` | `PayerDelay.jsx`, các modal `tw:` |
| `Select` | Clamp theo `innerWidth`, theo dõi `visualViewport`, mục ≥44px; hoặc `<select>` gốc trên cảm ứng | `components/Select.jsx` |
| Bản đồ | Cấu hình tương tác cảm ứng (tránh bẫy cuộn), chiều cao responsive | hai `TripMap.jsx` |
| Chữ | Nhãn ≥11px | `UserSite.jsx:22` và các `text-[9-10px]` |
| Safe area | `viewport-fit=cover` + dùng `env()` ở header/bottom bar | `index.html`, `Layout.jsx`, `styles.css` |
| CSS chết | Xoá `.mobile-nav` và nhóm lớp không dùng (sau khi xác nhận lại) | `styles.css` |

## 5. Kiến trúc PWA

### 5.1 Manifest và icon
- `public/manifest.webmanifest`: `name`, `short_name`, `start_url`, `scope`, `display: standalone`, `theme_color` (`#0b45c6`, đã có), `background_color`, `lang: vi`, icons.
- **Lưu ý `start_url`/hash routing:** app dùng `#/screen`; chọn `start_url` ổn định (`/`) và kiểm lại luồng `/payment/result`.
- Icon: PNG 192/512 + maskable 512 + `apple-touch-icon` 180. Hiện **chưa có**; cần thiết kế/xuất từ logo — **không tự sinh bằng dịch vụ trả phí**.
- `index.html`: thêm `<link rel="manifest">`, `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `viewport-fit=cover`.

### 5.2 Service worker — vòng đời và cache

| Thành phần | Quyết định |
|---|---|
| Công cụ | Đề xuất `vite-plugin-pwa` (xem mục 6). Phương án thay thế: SW viết tay |
| Đăng ký | Sau `load`; `registerType: 'prompt'` — **không tự reload** (tránh mất token nhân sự trong bộ nhớ và ngắt giao dịch) |
| Precache | Chỉ asset Vite có hash + `index.html` + icon + trang offline. **Loại `public/ocr/*` (23MB)** khỏi precache |
| Runtime cache | Theo bảng ở `PWA_READINESS.md` mục 5: allowlist GET công khai; ảnh/font CacheFirst có giới hạn; OCR assets cache khi thực sự được tải |
| Mặc định | **NetworkOnly** cho mọi request có `Authorization` và mọi đường dẫn thuộc nhóm cá nhân (`/api/v1/me`, `/api/v1/auth`, `/api/v1/track`, `/api/v1/payer`, cổng hotel/admin/driver, bookings, shuttle, support…) |
| Điều hướng | `NavigationPreload`/NetworkFirst cho `index.html`; fallback trang offline; **không** fallback cho `/payment/result` |
| Socket.IO | Không đi qua SW |
| Logout | Nếu có bất kỳ cache dữ liệu nào, xóa khi logout (`caches.delete`); mặc định không có |
| Cập nhật | Hiện banner "Có bản mới – Tải lại" do người dùng bấm; chặn nút khi đang ở giữa đặt phòng/thanh toán |
| Header host | `render.yaml` thêm `headers` `Cache-Control: no-cache` cho `/sw.js`, `/index.html`, `/manifest.webmanifest` |

### 5.3 Offline
- Trang offline tĩnh + banner trạng thái dựa trên `navigator.onLine` (bổ sung cho `ApiBanner`, vốn chỉ thăm dò `/health`).
- Không cho phép đặt phòng/thanh toán offline; không dùng Background Sync cho giao dịch.
- Quét vé offline là **tuỳ chọn**: chỉ khi asset OCR + zxing đã nằm trong cache; bước tra chuyến bay vẫn cần mạng.

### 5.4 Standalone và iOS
- Phát hiện `matchMedia('(display-mode: standalone)')` và `navigator.standalone`; trong standalone: ẩn thành phần thừa (ví dụ gợi ý cài), chừa safe-area.
- Hướng dẫn cài iOS (Chia sẻ → Thêm vào Màn hình chính) hiển thị trong app vì iOS không có `beforeinstallprompt`; Android dùng `beforeinstallprompt`.

## 6. Thư viện đề xuất (chỉ khi có lý do)

| Thư viện | Mục đích | Ưu | Nhược | Kích thước/chi phí | License | Thay thế |
|---|---|---|---|---|---|---|
| `vite-plugin-pwa` (dựa Workbox) | Sinh manifest + SW + precache theo build Vite | Tự lấy danh sách file có hash; hỗ trợ `prompt` update; không cần tự quản manifest build | Thêm dependency và cấu hình; SW sinh tự động khó đọc hơn SW tay | **Chưa đo** — cần đo sau khi cài (ngoài phạm vi audit) | MIT [PLAT, xác minh lại khi cài] | SW viết tay (không dependency, nhưng phải tự sinh danh sách precache hash) |
| (Không thêm thư viện router, state, UI) | — | — | — | — | — | Giữ hash-routing và Context hiện có |

Không đề xuất thư viện bottom sheet, push hay biểu đồ ở giai đoạn này. Push cần backend mới (VAPID, bảng subscription) → **ngoài phạm vi** (xem `RISKS.md`).

## 7. Xác thực và phiên khi chạy PWA

- Không đổi cơ chế auth. Token nhân sự vẫn chỉ trong bộ nhớ → mở lại app = đăng nhập lại; token khách trong `sessionStorage` → mất khi đóng app.
- SW không được đọc/ghi token và không cache response có `Authorization`.
- Quyết định "có muốn giữ phiên nhân sự qua lần mở app" là **câu hỏi cho chủ sản phẩm** và là thay đổi bảo mật riêng, không nằm trong lộ trình này.

## 8. Tương thích Android / iOS

Xem bảng chi tiết ở `PWA_READINESS.md` mục 9. Tóm tắt: Android có popup cài + push; iOS cài thủ công, push chỉ khi đã cài (iOS ≥ 16.4), cần icon/meta riêng và `viewport-fit=cover`, lưu trữ có thể bị dọn. Mọi mục iOS **phải thử trên thiết bị thật**.

## 9. Tái sử dụng kiến trúc hiện tại

Giữ nguyên: routing hash + reducer, `lib/access.js`/`perms.js`, `api-client`, ba khung giao diện, `AppNav`, bottom bar người dùng, modal `BookingModal`, `data-label` bảng→thẻ, token CSS ở `forms.css`. Thay đổi mới tập trung ở: `index.html`, `public/` (manifest, icon), `Layout.jsx` (+ `BottomNav`), nhóm lớp CSS dùng chung, `render.yaml` (headers), và một cấu hình PWA.
