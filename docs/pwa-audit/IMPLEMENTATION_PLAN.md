# IMPLEMENTATION_PLAN — Lộ trình triển khai (đề xuất, chờ phê duyệt)

> **Chưa có dòng code nào được sửa.** Kế hoạch chia phase độc lập, có thể dừng sau bất kỳ phase nào mà không phá thứ trước đó.
> **Không ước lượng effort/thời gian** vì chưa có đủ bằng chứng (chưa chạy trình duyệt, chưa đo asset, chưa có thông tin năng lực nhóm).
> Đường dẫn tính từ `apps/web/` trừ khi ghi khác.

## Phase 0 — Quyết định cần trả lời trước khi bắt đầu (không phải code)

| # | Câu hỏi | Vì sao cần |
|---|---|---|
| Q1 | Bản nào là nguồn chính: bản trong monorepo (đã audit) hay `/home/phuongdd/data/Airrest_website` (repo GitHub, đã lệch 169/268 file)? | `RISKS.md` R-01 |
| Q2 | Sửa code ở thư mục bị `.gitignore` của repo cha — chuyển sang nơi có versioning không? | R-02 |
| Q3 | Nhóm tài khoản nhân sự nào thực sự dùng điện thoại? | Quyết định có làm bottom nav khách sạn/quản trị không (R-03) |
| Q4 | Chấp nhận phiên nhân sự mất khi mở lại app (token chỉ trong bộ nhớ)? Có muốn đổi — đó là thay đổi bảo mật riêng, ngoài lộ trình | `PWA_READINESS.md` mục 10 |
| Q5 | Có cần offline quét vé không (cache 23MB OCR)? | Phase 4 |
| Q6 | Có muốn push notification không? Cần backend mới (VAPID, bảng subscription) — **ngoài phạm vi này** | C-06 |
| Q7 | Được phép thêm dependency `vite-plugin-pwa` (MIT)? Hay muốn SW viết tay | `ARCHITECTURE.md` mục 6 |
| Q8 | Thiết kế/nguồn icon PNG 192/512/maskable/180? | Phase 3 |

Phase 1 và 2 không phụ thuộc Q4–Q8; chỉ Phase 2 phụ thuộc Q3.

## Phase 1 — Nền responsive

- **Mục tiêu:** desktop/tablet/mobile ổn định, một thang breakpoint, touch target đạt chuẩn.
- **Phạm vi:** (a) `index.html`: `viewport-fit=cover`. (b) Thang breakpoint `640/768/1024` + gộp dần `@media`. (c) Touch target ≥44px ≤1023px. (d) Rà `data-label` mọi bảng. (e) Chữ ≥11px. (f) `PayerDelay` thêm `max-h` + cuộn. (g) `Select.jsx` clamp. (h) Cấu hình cảm ứng Leaflet. (i) Dọn CSS chết.
- **File dự kiến:** `index.html`, `src/styles.css`, `src/forms.css`, `src/user.css`, `src/components/Select.jsx`, `src/components/admin/PayerDelay.jsx`, `src/components/hotel/{Bookings,Rooms,Fleet,Shuttle,Inventory,Changes,TripMap}.jsx`, `src/components/admin/kit.jsx`, `src/screens/user/{UserSite,TripMap,ShuttleTracker,RoomRow,GuestsPicker,BookingModal,BookingActions}.jsx`.
- **Dependencies:** Q1, Q2. Nên có **bộ ảnh chụp viewport trước khi sửa** làm đường chuẩn (xem Phase 5).
- **Rủi ro:** T-01, T-02, T-03, T-06.
- **Acceptance criteria:**
  1. Không có overflow ngang ở 375/430/768/1024/1280 trên các màn trong `RESPONSIVE_AUDIT.md` mục 3.
  2. Mọi điều khiển tương tác ≥44×44 CSS px ở ≤1023px.
  3. Mỗi `<td>` trong chế độ thẻ có nhãn hoặc là hành động rõ nghĩa.
  4. Không còn khối `@media` ngoài thang (trừ ngoại lệ có chú thích).
  5. Desktop ≥1280: ảnh chụp trước/sau giống nhau (ngoài sai khác có chủ đích).
- **Test cases:** chụp từng màn × 5 viewport; nhấn thử nút/nút đóng/−+ trên thiết bị cảm ứng; mở popup `Select` sát mép phải và khi bàn phím ảo mở; kéo bản đồ trong trang cuộn.
- **Definition of Done:** acceptance 1–5 đạt, ảnh chụp lưu cạnh báo cáo, không test hiện có nào hỏng (`vitest` backend + test web).

## Phase 2 — Mobile app-like UX

- **Mục tiêu:** trải nghiệm gần app trên <768px, không đổi desktop.
- **Phạm vi:** (a) Component `BottomNav` dùng chung, nhận `items` từ `visibleTabs`. (b) Khách sạn: ≤4 mục + "Thêm"; ẩn khi ≤1 mục. (c) Quản trị: giữ drawer, thêm tìm/nhóm. (d) Bộ chuyển khu vực ở đầu drawer. (e) Modal hợp nhất: <640 bottom sheet, ≥640 dialog giữa; focus trap + `Escape`. (f) Thanh hành động dính cho form dài. (g) Chip trạng thái thống nhất. (h) Trạng thái active cho bottom bar người dùng. (i) Loading/empty/error rà theo màn.
- **File dự kiến:** `src/components/Layout.jsx`, `src/App.jsx`, `src/lib/hotelNav.js`, `src/lib/adminNav.js`, `src/components/hotel/kit.jsx`, `src/components/Common.jsx`, `src/screens/user/UserSite.jsx`, các modal `tw:`.
- **Dependencies:** Phase 1 (thang breakpoint, touch target); **Q3**.
- **Rủi ro:** R-03, hồi quy phân quyền, `data-testid` dùng chung với test.
- **Acceptance criteria:**
  1. Bottom nav chỉ hiện tab nằm trong `visibleTabs(session, …)`.
  2. Tài khoản chỉ có `trip:drive` không thấy thanh nav thừa.
  3. Back trình duyệt/Android khớp quy ước push/replace đã thống nhất; sau đăng nhập/thanh toán không quay lại trạng thái cũ.
  4. Modal có focus trap, `Escape`, `max-h`, cuộn nội bộ.
  5. Desktop không đổi.
- **Test cases:** đăng nhập lần lượt các tài khoản với tập permission khác nhau và so sánh số mục nav; mở modal dài ở 375×667 và có bàn phím ảo; luồng đặt phòng → thanh toán → back.
- **DoD:** acceptance đạt; test phân quyền ở mức UI (có thể dùng Playwright, đã có trong skill `dev-self-test`) pass; không đổi logic `access.js`/`perms.js`.

## Phase 3 — Nền PWA

- **Mục tiêu:** cài được, chạy standalone, chưa offline sâu.
- **Phạm vi:** manifest; icon 192/512/maskable + apple-touch-icon; meta iOS; phát hiện standalone; hướng dẫn cài iOS/Android trong app; `render.yaml` thêm `headers` (`no-cache` cho `/sw.js`, `/index.html`, manifest); cấu hình PWA (theo Q7).
- **File dự kiến:** `public/manifest.webmanifest`, `public/icons/*`, `index.html`, `vite.config.js`, `package.json` (nếu Q7 đồng ý), `../render.yaml`, một component hướng dẫn cài.
- **Dependencies:** Q7, Q8; Phase 1 (`viewport-fit=cover`); **kill switch SW** chuẩn bị sẵn (xem Phase 4).
- **Rủi ro:** T-07, S-02, C-01, C-02.
- **Acceptance criteria:**
  1. Lighthouse "Installable" đạt trên bản HTTPS đã deploy.
  2. Android Chrome: nút cài hoạt động, mở ở chế độ standalone, thanh trạng thái đúng `theme-color`.
  3. iOS Safari: thêm vào Màn hình chính cho icon đúng, mở không có thanh địa chỉ, safe-area đúng (không bị tai thỏ/home indicator che).
  4. Luồng VNPay/MoMo `/payment/result` vẫn hoạt động.
- **Test cases:** cài trên Android + iPhone thật; khởi chạy từ icon; thanh toán thử (sandbox) và quay về app.
- **DoD:** acceptance đạt trên thiết bị thật; `RISKS.md` T-07/C-05 được cập nhật bằng kết quả thực tế.

## Phase 4 — Offline và độ tin cậy

- **Mục tiêu:** service worker an toàn, offline ở mức vỏ ứng dụng, cô lập dữ liệu người dùng.
- **Phạm vi:** SW với **allowlist GET công khai + mặc định NetworkOnly** (bảng ở `PWA_READINESS.md` mục 5); precache asset có hash (loại `public/ocr`); trang offline; banner `navigator.onLine`; cập nhật kiểu `prompt` và chặn tải lại khi đang giao dịch; xóa cache khi logout nếu có; **kill switch**; (tuỳ Q5) runtime cache asset OCR/zxing.
- **File dự kiến:** cấu hình SW (`vite.config.js` hoặc `public/sw.js`), `src/components/ApiBanner.jsx`, `src/main.jsx` (đăng ký), `src/state/store.jsx` (hook logout nếu cần), trang `offline.html`.
- **Dependencies:** Phase 3; Q4, Q5.
- **Rủi ro:** S-01, S-02, S-06, S-07, T-07, T-08, T-09.
- **Acceptance criteria:**
  1. DevTools → Cache Storage **không chứa** bất kỳ response nào có `Authorization` hoặc thuộc nhóm cá nhân.
  2. Đăng nhập tài khoản A → logout → đăng nhập B trên cùng thiết bị: không thấy dữ liệu của A ở bất kỳ nơi nào do SW giữ.
  3. Tắt mạng: mở app thấy vỏ + trang/banner offline, không treo; mọi hành động cần mạng báo rõ.
  4. Phát hành bản mới: người dùng thấy banner "tải lại", không tự reload giữa giao dịch.
  5. Kill switch gỡ được SW khỏi máy thử.
- **Test cases:** kiểm tra Cache Storage sau luồng đăng nhập/đặt phòng/thanh toán; hai tài khoản liên tiếp; offline toggle; bump version rồi mở app đã cài; thử kill switch.
- **DoD:** acceptance đạt; có tài liệu runbook (cách gỡ SW, cách đọc cache).

## Phase 5 — Kiểm thử và tối ưu

- **Mục tiêu:** bằng chứng đo được cho toàn bộ kết quả; thay "NOT VERIFIED" bằng PASS/FAIL.
- **Phạm vi:** bộ ảnh chụp/viewport tự động (Playwright) ở 375/430/768/1024/1280; Lighthouse (PWA, Performance, Accessibility); axe; thử Chrome/Safari/Firefox; thử thiết bị iOS và Android thật; đo kích thước build và asset cache; cập nhật các báo cáo `pwa-audit` bằng kết quả.
- **Dependencies:** nên **chạy trước Phase 1** để có đường chuẩn, rồi chạy lại sau mỗi phase; cần môi trường chạy an toàn (xem ghi chú bên dưới).
- **Rủi ro:** R-04; chạy app có thể chạm DB thật nếu không cô lập.
- **Acceptance criteria:**
  1. Mọi mục NOT VERIFIED trong `RESPONSIVE_AUDIT.md` có kết quả.
  2. Lighthouse: Installable đạt; Accessibility và Performance có số liệu ghi lại (không đặt ngưỡng tuỳ tiện khi chưa có đường chuẩn).
  3. Kết quả iOS và Android thật được ghi riêng.
- **Test cases:** theo `RESPONSIVE_AUDIT.md` mục 6 và các test case Phase 1–4.
- **DoD:** báo cáo được cập nhật bằng số liệu thật; phát hiện mới đưa vào `RISKS.md`.
- **Ghi chú môi trường:** `backend/.env` trỏ **Supabase thật**; mọi lần chạy thử phải ghi đè `DATABASE_URL` sang Postgres nhúng (`npm run dev:db`, cổng 54329) và API cổng khác; build kiểm tra dùng `npx vite build --configLoader runner --outDir <thư mục tạm>` do Docker để `.vite-temp` thuộc root.

## Thứ tự và thay đổi so với đề xuất ban đầu

Giữ thứ tự 1→5. Điều chỉnh theo audit:
- `viewport-fit=cover` đưa vào **Phase 1** (rẻ, không rủi ro, mở khoá safe-area cho Phase 2–3).
- **Phase 5 bắt đầu sớm** (đường chuẩn viewport) thay vì chỉ ở cuối.
- Header `no-cache` và kill switch SW được chuẩn bị **trước** khi đăng ký SW lần đầu.
- Push notification bị **loại khỏi lộ trình** vì cần backend mới.

## Việc cần làm trước nếu được duyệt

1. Trả lời Q1–Q8 (tối thiểu Q1, Q2 để bắt đầu).
2. Duyệt hoặc điều chỉnh phạm vi từng phase.
3. Quyết định chạy Phase 5 ở chế độ đường chuẩn trước.


---

## Trạng thái Phase 1 (cập nhật 2026-11-14)

**Đã làm** (bản sao lưu: `/home/phuongdd/data/Airrest_website.backup-20261114.tar.gz`, quyền 600, có chứa `.env`):

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| a. `viewport-fit=cover` | Xong | `apps/web/index.html` |
| b. Touch target ≥44px | Xong (≤1023px) | `styles.css` cuối file; `size-10`→`size-11` ở `GuestsPicker`, `BookingModal` (×2), `BookingActions`, `Home` |
| c. `thead` dùng `sr-only`; rà `data-label` | Xong | Không cần thêm `data-label` (xem `RESPONSIVE_AUDIT.md`) |
| d. Chữ 9–10px → 11px | Xong | `UserSite`, `Stays`, `RoomRow` (đợt 1) rồi `Home`, `Pages`, `BookingModal`, `ShuttleTracker`, `ChatBot` (đợt 2, theo quyết định tự chủ). Không còn `text-[8–10px]` trong `src` |
| e. `PayerDelay` `max-h` + cuộn | Xong | |
| f. `Select` kẹp mép + mục 44px | Xong | |
| g. Leaflet cảm ứng | Xong, **chỉ bản user** | `screens/user/TripMap.jsx` (`dragging: !L.Browser.mobile`). **Không đổi** `components/hotel/TripMap.jsx` vì tài xế dùng bản đồ đó và có thể cần kéo bằng một ngón |
| h. Gộp breakpoint | **Hoãn** | Theo đề xuất, làm sau khi có đường chuẩn |
| i. Xoá CSS chết | Xong, **một phần** | Chỉ `.mobile-nav` (3 dòng). Các lớp khác chưa xoá vì nằm chung dòng với selector đang dùng |

**Kiểm chứng:** diff với bản sao lưu cho thấy chỉ 11 file `src` + `index.html` thay đổi; build thành công; đo trước/sau trên 100 màn (ảnh trong `baseline/before` và `baseline/after`).
**Chưa kiểm chứng:** thiết bị iOS/Android thật, modal/popup/bàn phím ảo, Lighthouse/axe.
**Tác dụng phụ có chủ đích:** `size-10→size-11` và chữ 10→11px áp dụng ở **mọi** viewport (kể cả desktop) vì dùng class Tailwind không theo breakpoint; ảnh desktop khu người dùng đổi nhẹ.
**Đợt 2 (tự quyết định):** thanh dưới người dùng có `aria-current` cho cả 4 tab và tab "Nơi nghỉ" sáng khi ở `stays`/`detail` (trước đây không có trạng thái active); chữ nhỏ ở 375px `public-home` 58→0, `public-track` 7→0, `public-support` 6→0 (`public-stays` còn 2). Đo lại 100 màn: tràn ngang 0/100, điều khiển <44px ở 375px vẫn 14%. Ảnh: `baseline/after-extra/`.
**Đính chính:** robot ChatBot nổi trên cột checkbox ở `stays` **không phải lỗi** (xem `RESPONSIVE_AUDIT.md`), nên không sửa.
**Việc còn lại:** (h) gộp breakpoint (hoãn có chủ đích); 14% điều khiển <44px ở 375px (`tw:min-h-9`, nút ngoài các lớp đã xử lý, `input`); các điểm NOT VERIFIED (modal, popup, bàn phím ảo, thiết bị thật).


---

## Cập nhật phạm vi (2026-11-14, sau câu trả lời của chủ sản phẩm)

**Q3 đã trả lời:** chỉ **khách hàng** dùng điện thoại; nhân sự chỉ dùng desktop/tablet. Khách dùng **cả Android và iOS** và **có thể không dùng Chrome** (xem `BROWSER_COMPAT.md`).

| Hạng mục | Thay đổi |
|---|---|
| **Phase 2 — bottom nav khách sạn/quản trị** | **Huỷ.** Nhân sự không dùng điện thoại; giữ drawer hiện có cho tablet. `ARCHITECTURE.md` mục 3 các dòng "Khách sạn/Quản trị/Hai khu vực" ở cột Mobile không còn áp dụng |
| **Phase 2 — khu khách hàng** | Thu hẹp còn: thanh dưới khách (đã có `aria-current` + tab active), vùng chạm ≥44px ở trang khách, modal → bottom sheet, thanh hành động dính. Bộ lọc/`Select`/popup cần chụp thêm |
| Vùng chạm nhân sự ≤1023px (đã làm ở Phase 1) | Vẫn có lợi cho tablet; **không mở rộng thêm** cho mobile nhân sự |
| iOS | **Quay lại phạm vi cho khách:** `PWA_READINESS.md` mục 9 và `RISKS.md` C-01…C-05 áp dụng cho khách hàng |
| Trình duyệt | Không chỉ Chrome: cần Safari/WebKit (mức sàn dự kiến Chrome ≥111, Safari/iOS ≥16.4, **cần xác minh**) |
| Q3, R-03 | Đã giải quyết |

**Kiểm thử điện thoại (đã đo):** 320/360/393/412 (chỉ trang khách) cùng 375/430: không tràn ngang, không chữ <11px. Ở 375px các trang khách còn 64/152 điều khiển <44px (trước: 77/152); nhiều ô là dương tính giả (`.ui-bare` nằm trong khung `.ui-box` đã đủ 44px). Chưa xác định chính xác từng nút còn lại → cần một lượt đo từng phần tử nếu muốn xử lý tiếp.

**Còn mở:** Q4–Q8 (phiên nhân sự trong PWA — nay ít liên quan vì nhân sự không dùng PWA; offline quét vé; push; thêm `vite-plugin-pwa`; icon). Phase 3 (manifest, `apple-touch-icon`, meta iOS) trở nên **quan trọng hơn** vì khách dùng iOS và iOS không có popup cài.


**Cập nhật iOS (không có thiết bị iOS):** rà mã nguồn tìm lỗi iOS kinh điển; đã sửa lỗi tự phóng to khi chạm ô nhập (font 16px ≤767px) và thêm `-webkit-text-size-adjust`. Các mục cần thiết bị iOS thật vẫn **NOT VERIFIED** — xem `BROWSER_COMPAT.md` mục 6. Trước khi cam kết hỗ trợ iOS cần ít nhất một lượt thử trên iPhone thật do người khác thực hiện.


---

## Trạng thái Phase 3 — phần an toàn (cập nhật 2026-11-14)

**Đã làm (không có service worker):**

| Việc | File |
|---|---|
| Manifest (`display: standalone`, `start_url`/`scope` `/`, `theme_color` `#0b45c6`, `lang: vi`, 3 icon) | `apps/web/public/manifest.webmanifest` |
| Icon `any` 192 và 512, `maskable` 512 (lề an toàn rộng hơn), `apple-touch-icon` 180 | `apps/web/public/icons/*`, `apps/web/public/apple-touch-icon.png` |
| Thẻ `<link rel=manifest>`, `apple-touch-icon`, `mobile-web-app-capable`, `apple-mobile-web-app-capable/title/status-bar-style=default` | `apps/web/index.html` |

**Icon:** nền xanh `#1262e8` đặc, vuông, không trong suốt, máy bay trắng (icon `Plane` của `lucide-react`, giấy phép ISC) — đúng logo trong app (`logo-mark`). **Không dùng `favicon.svg`**: file đó là ngôi sao trắng trên nền xám đen, không phải logo thương hiệu. Hệ quả: biểu tượng tab trình duyệt (xám) và biểu tượng app cài (xanh) đang **khác nhau**; đổi favicon là quyết định thiết kế của chủ sản phẩm, chưa làm.

**Kiểm chứng (Chrome qua DevTools, `localhost`):** `Page.getAppManifest` → 0 lỗi phân tích; không tài nguyên 4xx; `Page.getInstallabilityErrors` → chỉ `in-incognito` (phiên Playwright ẩn danh, không phải lỗi app). Build có đủ `manifest.webmanifest`, `icons/*`, `apple-touch-icon.png`.

**Chưa làm / chưa kiểm chứng:**
- **Service worker, offline, cập nhật, kill switch** (Phase 4) — cố ý, vì khó gỡ khỏi máy người dùng.
- Khối `headers:` trong `render.yaml` (`no-cache`): chỉ cần khi có service worker; chưa đụng cấu hình deploy.
- Giao diện hướng dẫn cài iOS ("Chia sẻ → Thêm vào Màn hình chính"), xử lý `beforeinstallprompt` (Android), phát hiện `display-mode: standalone`.
- `Content-Type` của `manifest.webmanifest` trên **Render** chưa kiểm (máy chủ thử trả `application/manifest+json`, không phản ánh Render).
- **iOS hoàn toàn chưa thử** (không có thiết bị): `apple-touch-icon`, tên app, thanh trạng thái, safe-area khi cài là kiến thức nền tảng.
- Header/bottom bar chưa xử lý `safe-area-inset-top/left/right`; `status-bar-style=default` được chọn để tránh cần xử lý đó.
- Chưa thử cài thật trên Android.

**Tác động:** từ khi deploy, Chrome/Android có thể hiện gợi ý "Cài đặt ứng dụng" cho **mọi** người dùng (kể cả nhân sự trên desktop). Manifest áp dụng cho cả site; đây là hành vi chấp nhận được nhưng cần biết.


---

## Test lại (2026-11-15)

- **Test đơn vị web:** 14 file, **101 test qua**. Chạy: `cd apps/web && npx --no-install vitest run --root . --dir src --configLoader runner` (cần `--configLoader runner` vì `.vite-temp` thuộc root do Docker). *Đính chính:* trước đó tôi ghi "không có runner cho `apps/web`" — sai; các test này chỉ phủ logic (giỏ, bot, vé, nhãn…), **không phủ giao diện/CSS**, nên không kiểm được các thay đổi responsive.
- **Đo lại 100 màn** (`baseline/retest/`, API khởi động sạch, không dải CORS): tràn ngang **0/100**; điều khiển <44px: 375 và 430 là 51%→14%, 768 là 44%→15%, 1024 là 39%→33%, 1280 là 43%→40%; chữ <11px ở 375: `public-home` 58→0, `public-stays` 89→2.
- **Manifest:** Chrome đọc 0 lỗi, không tài nguyên 4xx, installability chỉ báo `in-incognito`.
- **Build:** thành công.

## Cập nhật 2026-11-16: định tuyến theo đường dẫn + trang chi tiết khách sạn
- Định tuyến đổi từ hash (`#/stays`) sang đường dẫn thật: `lib/routes.js` (`/`, `/noi-nghi`, `/khach-san/<id>`, `/tra-cuu`, `/ho-tro`, `/tai-khoan`, `/dang-nhap`, `/doi-tac/khach-san[/<tab>]`, `/quan-tri[/<tab>]`, `/payment/result`). Link hash cũ vẫn mở được (đổi sang link chuẩn). Cần rewrite SPA ở máy chủ: Render đã có (`render.yaml`), `vite` dev tự fallback.
- Trang `/khach-san/<id>` tải lại được và chia sẻ được; có nút "Sao chép liên kết".
- Kiểm bằng Chrome: vào thẳng từng link, Back/Forward, link hash cũ, đường lạ -> trang chủ, khách sạn không tồn tại -> thông báo.
