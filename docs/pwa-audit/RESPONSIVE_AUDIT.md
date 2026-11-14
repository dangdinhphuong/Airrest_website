# RESPONSIVE_AUDIT — Đánh giá responsive

> Phạm vi: `apps/web/src`. Chỉ đọc source/CSS, **chưa chạy app, chưa đo viewport nào**.
> Nhãn: **PASS** đã hỗ trợ · **PARTIAL** có nhưng còn hạn chế · **FAIL** chưa đáp ứng, *chỉ gán khi CSS/source tự chứng minh* · **NOT VERIFIED** nguy cơ cần kiểm thử trình duyệt.
> Cột "Chứng minh": **[SRC]** = đã tự kiểm ở source (số dòng đã đối chiếu); **[AGENT]** = subagent báo, số dòng có thể lệch ±vài dòng, cần xem lại khi sửa.
> Viewport tham chiếu: Mobile 375/430 · Tablet 768/1024 · Desktop ≥1280.

## 1. Kết luận ngắn

Giao diện **đã có nền responsive khá** (viewport meta đúng, drawer nhân sự, bottom bar người dùng, bảng→thẻ, modal dạng bottom sheet), nên không cần viết lại. Vấn đề chính là **nhất quán và chi tiết**, không phải thiếu nền:

1. Hai hệ CSS song song với breakpoint lệch nhau.
2. Touch target dưới 44px ở nút dùng chung (đã chứng minh bằng CSS).
3. Bảng→thẻ phụ thuộc `data-label`, chưa đảm bảo đủ.
4. Một số chi tiết chưa kiểm chứng được nếu không mở trình duyệt.

**Chưa có finding nào đủ điều kiện gán FAIL tuyệt đối.** Điểm gần FAIL nhất là touch target (mục F6) — vi phạm chuẩn 44px nhưng vẫn dùng được.

## 2. Hai hệ CSS và breakpoint — PARTIAL

| Nhánh | Hệ CSS | Mốc dùng |
|---|---|---|
| Nhân sự + Login | `styles.css` (class thường) | `@media` ở **600, 640, 720, 768, 860, 900, 960, 992, 1024, 1080, 1100px** [SRC, đã liệt kê bằng `rg`] |
| Người dùng cuối | Tailwind v4, prefix `tw:` | `sm`=640, `md`=768, `lg`=1024, `xl`; riêng `user.css` dùng `47.99rem`/`48rem` (=768) [SRC] |
| JS | — | Không có `matchMedia`/`innerWidth` cho layout; `gsap.matchMedia` chỉ dùng cho `prefers-reduced-motion`; `Select.jsx` dùng `window.innerHeight` để đặt popup [AGENT] |

- ~40 khối `@media` với 11 giá trị khác nhau trong `styles.css`. Cặp mốc lẻ như `719/720`, `767/768`, `959/960`, `1023/1024` nằm cạnh nhau.
- Hệ quả: ở 768–1023px nhánh nhân sự vẫn là drawer, còn nhánh người dùng đã chuyển sang layout `md`.
- **Đề xuất:** chốt thang `640 / 768 / 1024` (trùng Tailwind) — xem `ARCHITECTURE.md` mục 2.

## 3. Bảng tổng hợp màn hình × viewport

| Màn hình / thành phần | Mobile | Tablet | Desktop | Ghi chú |
|---|---|---|---|---|
| Login (`screens/Login.jsx`) | PARTIAL | PARTIAL | PASS | F1 |
| Khung nhân sự (Header/AppNav/feed) | PARTIAL | PARTIAL | PASS | F2 |
| Màn quản trị có bảng (`admin/kit.jsx`) | PARTIAL | NOT VERIFIED | PASS | F3 |
| Màn khách sạn có bảng | PARTIAL | NOT VERIFIED | PASS | F3 |
| Form khách sạn `.grid-2` | PASS | PASS | PASS | [AGENT] |
| Khung người dùng (header + bottom bar) | PASS (F7 chữ 9px) | PASS | PASS | |
| `Home` | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | chưa đọc kỹ |
| `Stays` + thanh giỏ phòng | PARTIAL | NOT VERIFIED | PASS | F5 |
| `BookingModal` | PASS | PASS | PASS | bottom sheet, `dvh`, thanh hành động dính |
| `BookingActions`, `ScanTicket` (modal) | PASS | PASS | PASS | [AGENT] |
| `PayerDelay` (modal admin) | PARTIAL | NOT VERIFIED | PASS | F8 |
| `Select.jsx` popup | PARTIAL | PARTIAL | PASS | F4 |
| `PriceRange.jsx` | PARTIAL | PASS | PASS | F9 |
| `GuestsPicker` | PARTIAL | PASS | PASS | F10 |
| Bản đồ Leaflet (2 `TripMap`, `ShuttleTracker`) | PARTIAL | NOT VERIFIED | NOT VERIFIED | F11, F12 |
| `ChatBot` | PASS | PASS | PASS | [AGENT] |
| Touch target chung | PARTIAL | PARTIAL | n/a | F6 |

## 4. Chi tiết

### F6 — Touch target dưới 44px · PARTIAL · [SRC, đã kiểm]
Các lớp dùng chung bị ghi đè xuống dưới 44px:

| Lớp | Giá trị gốc | Bị ghi đè | Dòng `styles.css` |
|---|---|---|---|
| `.btn` | `min-height: 44px` | **40px** | `:67` → `:556` |
| `.btn-sm` | 36px | **32px** | `:72` → `:557` |
| `.link-btn` | — | `min-height: 28px` | `:75` |
| `.icon-btn` (nút đóng Notice `×`) | — | **28×28** | `:78` |
| `.menu-btn` | — | 44×44 (**đạt**) | `:520` |

- Ô nhập dùng `--ctl-h: 44px` (`forms.css:5`) → **PASS**.
- `tw:size-10` (=40px) xuất hiện ở `BookingActions`, `BookingModal` (×2), `ChatBot`, `GuestsPicker`, `Home` [SRC, đếm bằng `rg`]; theo [AGENT] gồm nút −/+ và nút đóng modal.
- Không phát hiện tương tác **chỉ có ở hover** [AGENT]; tooltip của `AppNav` chỉ là phụ, nhãn đã hiện sẵn.
- **Giải pháp:** nâng lên 44px ở ≤1023px (hoặc mở rộng vùng chạm bằng padding/pseudo-element để không đổi hình dạng desktop). **Tiêu chí:** mọi điều khiển tương tác ≥44×44 CSS px ở viewport ≤1023.

### F3 — Bảng → thẻ phụ thuộc `data-label` · PARTIAL
- Tốt [SRC]: `.table-wrap` cuộn ngang; ≤719px bảng chuyển thành thẻ (`styles.css:239`).
- Rủi ro [SRC, đếm `rg`]: số `<td>` lớn hơn số `data-label` ở vài file — `Bookings.jsx` 9 td / 7 nhãn, `Rooms.jsx` 10/9, `Fleet.jsx` 12/10, `Shuttle.jsx` 16/15. Khác biệt có thể là ô thao tác không cần nhãn; **NOT VERIFIED** cho tới khi mở từng màn.
- Các màn `admin/*` ngoài `kit.jsx` **không có `data-label`**; chưa đọc từng file để biết có dùng bảng hay danh sách.
- `thead` bị ẩn bằng `left:-9999px` thay vì kỹ thuật `sr-only` [AGENT].
- **Giải pháp:** rà từng `<td>`; với bảng nhiều cột chọn 2–3 trường chính cho thẻ. **Tiêu chí:** mỗi ô trong chế độ thẻ có nhãn hoặc là hành động rõ nghĩa; không ô nào mất ngữ cảnh.

### F1 — Login · PARTIAL
- Cột navy có hình tròn `position:absolute` ở `top/right:-80px`; **cha `.auth-navy-col` đã có `overflow: hidden`** (`styles.css:1413-1421`) → rủi ro tràn do hình tròn **không còn** (đã loại trừ, sửa lại nhận định ban đầu của subagent).
- Còn lại: `min-height:100vh` (`.auth-split-wrapper`) có thể cao hơn vùng nhìn thấy trên iOS khi thanh địa chỉ hiện — **NOT VERIFIED**; dùng `!important` để ẩn cột navy ≤959px [AGENT].
- **Giải pháp:** `dvh` cho min-height; bỏ `!important`. **Tiêu chí:** Login không cuộn dọc thừa khi bàn phím ảo mở ở 375×667.

### F2 — Khung nhân sự · PARTIAL
- Drawer ≤1023px, nút menu 44px, có `aria-expanded`; ≤767px panel ẩn bằng `translateX(-100%) + visibility:hidden` [AGENT]. Ở 768–1023px vẫn là drawer, không phải panel cố định.
- Nguy cơ ở 375px khi tên tài khoản dài đẩy nút đăng xuất — tên đã ẩn ≤719 (`.hide-sm`), nên rủi ro thấp. **NOT VERIFIED.**
- Nút đăng xuất chỉ là icon 16px trong `.btn` 40px (xem F6).

### F4 — `Select.jsx` · PARTIAL · NOT VERIFIED
- Popup `position:fixed`, đặt `left = r.left`, `width = max(r.width, 200)`, tính chiều cao từ `window.innerHeight`; **không clamp mép phải** và không theo dõi `visualViewport` khi bàn phím ảo mở [AGENT].
- **Giải pháp:** clamp theo `innerWidth`, nghe `visualViewport`, mục danh sách ≥44px trên mobile. Hoặc dùng `<select>` gốc trên màn cảm ứng.

### F5 — `Stays` + thanh giỏ · PARTIAL
- Thanh giỏ `fixed bottom-16 / md:bottom-0` xếp trên bottom bar; padding trang `8.5rem` (4rem + 4.5rem) — khớp [SRC `user.css:14-16`].
- Nút chat dời trái bằng `:has([data-testid="room-row"])` (`user.css:10-13`) — **phụ thuộc `data-testid` và `:has()`**, mong manh [SRC].

### F7 — Chữ 9–10px · PARTIAL
Bottom bar `text-[9px]` (`UserSite.jsx:22`); `text-[10px]` ở `Stays`, `RoomRow`, `UserSite`; tổng ~37 chỗ `text-[8-10px]` trong khu người dùng [AGENT]. Đề xuất tối thiểu 11–12px.

### F8 — `PayerDelay` modal · PARTIAL
`PayerDelay.jsx:27`: `fixed inset-0 grid place-items-center p-4`, thẻ `card tw:w-full tw:max-w-md` **không có `max-h` + `overflow-y:auto`** [SRC]. Hiện chỉ có 1 trường nhập nên rủi ro thấp; vẫn nên theo mẫu `BookingModal`.

### F9–F12 — chi tiết nhỏ · PARTIAL · NOT VERIFIED
- F9 `PriceRange`: thumb 22px (webkit)/18px (Firefox), hai thumb có thể chồng khi `lo≈hi`.
- F10 `GuestsPicker`: `min-w-[260px]`, rủi ro thấp.
- F11 Leaflet: `L.map(...)` chỉ truyền `zoomControl`/`attributionControl` (`screens/user/TripMap.jsx:23`, `components/hotel/TripMap.jsx:19` [SRC]) — **không cấu hình điều khiển cảm ứng**, nguy cơ "bẫy cuộn" khi bản đồ nằm trong trang cuộn. `components/hotel/TripMap` nhận chiều cao qua prop, không responsive.
- F12 `ShuttleTracker`: số cột stepper = số bước (inline style), có thể chật ở 375px nếu ≥5 bước.

## 5. Khác

| Mục | Kết quả |
|---|---|
| Viewport meta | PASS — `width=device-width, initial-scale=1.0`, không chặn zoom (`index.html:5`) |
| `viewport-fit=cover` | **Thiếu** → `env(safe-area-inset-*)` sẽ = 0 trên iOS dù CSS đã dùng `env()` (`styles.css:1521`, `UserSite.jsx:84`, `BookingModal.jsx`) |
| Overflow ngang toàn cục | Không có `overflow-x:hidden` toàn cục (không che lỗi, cũng không có lưới an toàn) [AGENT] |
| `100vh` | `.feed`, `.auth-split-wrapper`, `min-h-screen` — chỉ là `min-height`, tác động iOS thấp, NOT VERIFIED |
| Dashboard | `admin/Dashboard.jsx` dùng `.stat-grid` 2 cột mobile / 3 cột ≥720; **không có thư viện biểu đồ** nên không có biểu đồ cần đánh giá [AGENT] |
| Ảnh | `img{max-width:100%;height:auto}` ở `user-reset.css`; ảnh chính `object-cover` trong khung cố định [AGENT] |
| Reduced motion | Có (`styles.css:103,594`, gsap `matchMedia`) nhưng chưa phủ mọi chỗ |
| CSS chết | `.mobile-nav` và nhóm lớp ở `CURRENT_STATE.md` mục 7 — dọn để tránh nhầm |

## 6. Việc cần làm bằng trình duyệt (chưa làm trong audit này)

Chụp/đo ở 375, 430, 768, 1024, 1280 cho: Login, mỗi tab Admin/Hotel có bảng, `Stays`, `Home`, `BookingModal`, `PayerDelay`, `TripMap`, `ShuttleTracker`. Kiểm: tràn ngang, ngắt dòng, chồng lấn, popup `Select` khi bàn phím ảo, `:has()`, `dvh`/safe-area trên iOS thật. Công cụ gợi ý đã có trong repo: Playwright (skill `dev-self-test`); Lighthouse/axe chưa chạy.


---

## Cập nhật sau khi đo thật (2026-11-14, Phase 1)

Đã chạy app thật và đo bằng Chrome headless ở 5 viewport × 20 màn (xem `baseline/README.md`). Một số mục NOT VERIFIED nay có số liệu:

| Mục | Kết quả đo |
|---|---|
| Tràn ngang | **0/100 màn** ở cả trước và sau khi sửa → các màn đã chụp không bị tràn ngang |
| F3 bảng → thẻ | Ô `<td>` thiếu `data-label` chỉ là **ô nút thao tác** và dòng chi tiết (`Bookings`, `Rooms`, `Fleet`, `Shuttle`, `Inventory`, `Changes`), không cần nhãn → rủi ro **thấp hơn** dự đoán. `admin-hotels` ở 375px hiển thị đúng dạng thẻ |
| F1 Login | `.auth-navy-col` có `overflow:hidden`; Login ở 375px hiển thị đúng |
| F6 touch target | 375/430: 51% → **14%** điều khiển <44px; 768: 44% → 15%. ≥1024px **cố ý không đổi** (37–41% còn lại) |
| F7 chữ nhỏ | `public-stays` 89 → 2 (375px). `public-home` 58 → 53: chưa sửa vì ngoài 3 file đã duyệt |
| ~~Phát hiện mới~~ **Đính chính** | Ban đầu tôi ghi robot ChatBot "đè checkbox" là lỗi. Đọc lại code: quy tắc `:has([data-testid="room-row"])` **có** áp dụng ở `stays` và dời robot sang trái để khỏi che nút −/+ ở mép phải. Đó là hành vi nút nổi có chủ đích của dự án, đánh đổi giữa hai bên; **không phải lỗi, không sửa** |

Chưa chụp: modal, popup `Select`, bàn phím ảo, tab `hotel-profile/fleet/trips` và `admin-payerDelay` (tài khoản seed không có quyền). F4, F8–F12 vẫn **NOT VERIFIED** về hành vi (chỉ đã sửa theo source).
