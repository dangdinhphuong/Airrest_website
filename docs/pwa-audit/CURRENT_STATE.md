# CURRENT_STATE — Hiện trạng Airrest Web

> Ngày audit: 2026-11-14. Chỉ đọc source/config, **chưa chạy app, chưa đo trên trình duyệt**.
> Quy ước đường dẫn: `W` = `apps/web/src`. Nhãn bằng chứng: **[SRC]** đọc trực tiếp từ source; **[AGENT]** do subagent báo, đã kiểm lại một phần (ghi rõ); **[PLAT]** kiến thức nền tảng, chưa kiểm chứng tại đây.

## 1. Workspace đã xác minh

| Hạng mục | Kết quả |
|---|---|
| Thư mục audit | `/home/phuongdd/data/vietq/dotnet/apps/newsroom-planning/dev-self-test-reports/Airrest_website` (do người dùng chỉ định) |
| Git | **Không có `.git` riêng.** Git root là `dotnet/apps/newsroom-planning`, nhánh `fix/walo-bugs-2026-11-14`. Thư mục này bị `.gitignore` của repo cha bỏ qua (`.gitignore:41` `dev-self-test-reports/`) nên **mọi thay đổi trong đây, kể cả các báo cáo này, không vào git** |
| Bản sao khác | `/home/phuongdd/data/Airrest_website` (repo riêng, remote `github.com/dangdinhphuong/Airrest_website`, nhánh `main`, commit cuối 2026-11-12). **Đã lệch nhiều so với bản đang audit**: 169 file chỉ có ở một bên, 268 file khác nội dung (trong phần source, không tính `node_modules`/`docs`/`dist`). Không đồng bộ, không copy |
| Dự án khác | `/home/phuongdd/data/AIRREST` là Next.js sinh từ Figma Make, repo khác — **không liên quan** |
| `docs/pwa-audit/` trước khi ghi | Chưa tồn tại → không ghi đè |

**Hệ quả:** kết luận trong bộ báo cáo chỉ đúng cho bản trong monorepo. Nếu sau này triển khai, cần quyết định bản nào là nguồn chính (xem `RISKS.md` R-01).

## 2. Công nghệ thực tế [SRC]

| Lớp | Giá trị | Bằng chứng |
|---|---|---|
| Monorepo | npm workspaces: `apps/*`, `packages/*`, `backend` | `package.json` gốc |
| Frontend | React `^18.3.1`, Vite `^6.0.5`, `type: module` | `apps/web/package.json` |
| CSS | Tailwind CSS `^4.3.5` qua `@tailwindcss/vite`, **prefix `tw:`** ở khu người dùng; CSS thường (`styles.css` 1673 dòng, `forms.css`, `user.css`, `user-reset.css`) ở khu nhân sự và Login | `W/main.jsx`, `W/user.css:4-5` |
| Icon / thư viện | `lucide-react`, `leaflet 1.9.4`, `gsap` + `@gsap/react`, `socket.io-client 4.8.4`, `tesseract.js 7.0.0`, `zxing-wasm 3.1.6` | `apps/web/package.json` |
| Router | **Không có thư viện router.** Tự đồng bộ `state.screen` với `location.hash` bằng `pushState`/`popstate`; ngoại lệ `pathname` `/payment/result` (VNPay trả về) | `W/state/store.jsx:40-56` |
| State | `useReducer` + Context (`AppProvider`) | `W/state/store.jsx` |
| API client | `@airrest/api-client` (`packages/api-client`) dựng trong `W/lib/api.js`; base URL từ `VITE_API_BASE_URL` | `W/lib/api.js:11,28` |
| Backend | Express + Postgres, thư mục `backend/` (có cả `backend/api` và `backend/src` — hai cây mã, [AGENT]: `server.ts` dùng `backend/api`) | `backend/` |
| Deploy | `render.yaml`: web = static site (`apps/web/dist`, rewrite `/* → /index.html`), api = node service; `docker-compose.yml` cho dev | `render.yaml:52-58` |
| Test | `vitest` chỉ ở backend; web có vài file `*.test.js` cho logic thuần (`bcbp`, `ticketText`, `cart`, `botEngine`, `user`, `data`, `hourlyWindow`). Chưa có test e2e/viewport trong audit này | `backend/package.json`, `W/**/*.test.js` |
| `apps/mobile` | Chỉ có `README.md`, không có mã ứng dụng | `ls apps/mobile` |

## 3. Cấu trúc frontend [SRC]

```
apps/web/src
├── main.jsx            # StrictMode; <ConfigError/> nếu thiếu VITE_API_BASE_URL
├── App.jsx             # Shell: chọn Login / UserSite / khung nhân sự
├── state/store.jsx     # reducer + đồng bộ hash + khôi phục phiên khách
├── lib/                # api, socket, useRealtime, access, perms, adminNav, hotelNav, shellNav, ocr, bcbp...
├── components/         # Layout (Header/AppNav/Breadcrumb/Footer), Common, Select, PriceRange, ApiBanner
│   ├── admin/          # Accounts, Bookings, Flights, Hotels, Payments, Roles, PayerDelay, Dashboard, kit...
│   ├── hotel/          # Bookings, Rooms, Inventory, Profile, Changes, Shuttle, Fleet, Trips, TripMap, kit...
│   └── partner/        # ui.jsx
├── screens/            # Login, Admin, Hotel
│   └── user/           # UserSite, Home, Stays, Pages(Detail/Track/Support/Account/Payment), BookingModal, BookingActions, ShuttleTracker, ScanTicket, ChatBot, TripMap...
└── styles.css, forms.css, user.css, user-reset.css
```

## 4. Routing và ba "khung" giao diện [SRC]

`moduleOf(screen)` (`W/lib/shellNav.js`) chia thành 3 module. `App.jsx` chọn khung:

| Khung | Màn hình (`state.screen`) | Layout |
|---|---|---|
| Login | `login` | Trang đầy đủ, không dùng khung ứng dụng (`App.jsx`) |
| Người dùng cuối | `home, stays, detail, track, support, account, payment` | `UserSite` (header sticky, nav ngang từ `md`, **bottom bar 4 tab dưới `md`**, ChatBot) |
| Nhân sự: khách sạn | `hotel` | `Header` + `AppNav` (drawer/panel) + `.feed` |
| Nhân sự: quản trị | `admin` | như trên |

Danh sách `SCREENS` hợp lệ: `home, stays, support, track, account, login, hotel, admin` (`store.jsx:38`); `detail` chỉ hợp lệ khi có `propertyId`.

## 5. Nhóm người dùng và phân quyền — chỉ theo bằng chứng [SRC]

- **Không có tên vai trò trong logic truy cập.** `W/lib/perms.js` ghi rõ: *"Truy cập chỉ dựa trên quyền, không chặn theo tên vai trò"*, đồng bộ với `backend/config/permissions.ts`.
- `W/lib/access.js`:
  - `visibleTabs(session, tabs)`: tab hiện khi có **đủ mọi quyền** trong `need` và (nếu có `any`) ít nhất một quyền trong `any`.
  - `areasOf(session)`: `admin` nếu có ≥1 tab quản trị; `hotel` nếu có `session.hotelId` **và** ≥1 tab khách sạn. Một tài khoản có thể có cả hai khu vực (`App.jsx` có liên kết "Chuyển sang …").
  - Ghi chú trong file: phân quyền ở FE chỉ để ẩn/hiện; backend tự kiểm quyền mỗi route.
- **Menu khách sạn** (`W/lib/hotelNav.js`, 9 tab): `overview, bookings, inventory, rooms` cần `booking:read`; `profile` cần `room:manage`; `changes` cần `request:handle`; `shuttle` cần một trong `fleet:manage`/`shuttle:handle`; `fleet` cần `fleet:manage`; `trips` cần `trip:drive`.
- **Menu quản trị** (`W/lib/adminNav.js`, 10 tab): `dashboard, hotels, bookings, support, accounts, configs, flights, payments, payerDelay, audit`, mỗi tab một quyền riêng.
- **Người dùng cuối** (hành khách): không dùng permission; có phiên "khách" (xem mục 6).
- **Không suy diễn vai trò.** Code không nêu ai là "lễ tân", "tài xế"... ngoài tên permission (ví dụ `trip:drive`). Việc nhóm nào dùng điện thoại là **câu hỏi chưa có bằng chứng** (xem `IMPLEMENTATION_PLAN.md`, mục Câu hỏi mở).

## 6. Xác thực và phiên [SRC]

| Loại phiên | Nơi lưu | Bằng chứng |
|---|---|---|
| Nhân sự (khách sạn/quản trị/lái xe) | **Chỉ biến bộ nhớ** `token`; không ghi storage. Tải lại trang là mất phiên | `W/lib/api.js:13-16`, `W/data/auth.js:1` |
| Khách (hành khách) | `sessionStorage` khóa `airrest.guest.token`; khôi phục sau reload qua `/v1/auth/me`, xóa khi 401/403 hoặc khi `state.user` về null | `W/lib/api.js:14-15`, `W/state/store.jsx:64-75` |
| Chuyển token | Header `Authorization: Bearer` (không dùng cookie/httpOnly) | `W/lib/api.js:28`, `packages/api-client` |
| Hai phiên loại trừ nhau | Có token nhân sự thì bỏ phiên khách | `W/lib/api.js:21-22` |
| Hết hạn | JWT mặc định 1h, không có refresh token [AGENT: `backend/config/env.ts:12`]. 401 → `onUnauthorized` → đăng xuất | `W/lib/api.js:28`, `store.jsx:62` |
| Realtime | `socket.io` với `auth.token`; phòng do server quyết định theo token | `W/lib/socket.js` |
| localStorage còn lại | `airrest.cart` (giỏ phòng) và `airrest.guest` (họ tên + SĐT khách) | `W/screens/user/cart.js:8-9,93` |

Ghi chú: [AGENT] `useRealtime.js` lấy token nhân sự bằng cách vá tạm `window.fetch` — cách này mong manh nếu sau này thêm lớp chặn fetch (xem `RISKS.md`).

## 7. Giao diện di động đã có sẵn [SRC]

- **Khu người dùng:** bottom bar 4 cột, cố định, ẩn từ `md`, có `env(safe-area-inset-bottom)` (`W/screens/user/UserSite.jsx:84`).
- **Khu nhân sự:** nút menu 44×44 (`styles.css:520`) mở drawer `AppNav` (`W/components/Layout.jsx`), có `aria-expanded`/`aria-controls`.
- **Bảng → thẻ trên mobile:** có quy tắc ở `styles.css` khối `@media (max-width: 719px)` (`:239`), cần `data-label` ở từng `<td>`; `data-label` chỉ có ở `components/hotel/*` và `components/admin/kit.jsx`.
- **Modal:** các modal người dùng dùng `dvh` và cuộn nội bộ (`BookingModal`, `BookingActions`, `ScanTicket`, `ChatBot`) [AGENT].
- **CSS chết:** `.mobile-nav` (`styles.css:312-314`) không được `.jsx` nào dùng [SRC, đã kiểm]; [AGENT] báo thêm `.stays-split`, `.stays-map`, `.header-search`, `.airrest-mobile-bar`, `.airrest-modal-dialog`, `.simtools` — đã kiểm lại: không có trong `*.jsx`.

## 8. Phụ thuộc trình duyệt/thiết bị [SRC, trừ ghi chú]

- Camera: `getUserMedia({facingMode: 'environment'})` + `<input type="file" accept="image/*">` dự phòng (`ScanTicket.jsx`).
- OCR chạy cục bộ bằng tesseract.js; asset ở `public/ocr` (**23MB** tổng, đã đo); barcode bằng `zxing-wasm` (nhập `?url`, có hash).
- Bản đồ Leaflet, tile từ `tile.openstreetmap.org` (`TripMap.jsx` ở cả `screens/user` và `components/hotel`).
- Clipboard (có dự phòng `execCommand`), file input (`Fleet.jsx`, `Profile.jsx`), WebSocket.
- **Không** dùng geolocation, Notification, push [AGENT, `rg` không khớp].
- Font Be Vietnam Pro tải từ Google Fonts (`index.html`).
- `index.html` có `viewport` (`width=device-width, initial-scale=1.0`) và `theme-color`; **không** có `viewport-fit=cover`, manifest, apple-touch-icon.

## 9. Điều chưa xác minh

- Chưa chạy app, chưa mở trên trình duyệt/thiết bị nào.
- Chưa đọc từng dòng `Home.jsx`, `Pages.jsx`, `Login.jsx`, `Stays.jsx`.
- Chưa kiểm router backend để biết GET `/v1/hotels`, `/v1/airports`, `/v1/flights/:code` có thật sự công khai.
- Chưa đọc `apps/web/.env` (cố ý, vì có thể chứa thông tin nhạy cảm).
