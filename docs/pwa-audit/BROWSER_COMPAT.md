# BROWSER_COMPAT — Trình duyệt và kích thước cần hỗ trợ

> Ngày: 2026-11-14. Cập nhật theo câu trả lời của chủ sản phẩm: **chỉ khách hàng dùng điện thoại; nhân sự chỉ dùng desktop/tablet; khách dùng cả Android và iOS, có thể không dùng Chrome.**
> Nhãn: **[SRC]** đã đo/đọc trong repo · **[PLAT]** kiến thức nền tảng (số phiên bản trình duyệt lấy từ trí nhớ về caniuse/tài liệu Tailwind, **chưa tra cứu tại đây** — cần xác minh trước khi cam kết).

## 1. Phạm vi thiết bị

| Nhóm | Thiết bị | Trình duyệt |
|---|---|---|
| Khách hàng (khu `#/home`, `stays`, `detail`, `track`, `support`, `account`, `payment`, `login`) | Điện thoại **Android và iOS**, tablet | Chrome, Safari, và trình duyệt khác. **Mọi trình duyệt trên iOS đều dùng WebKit** (kể cả Chrome iOS) [PLAT] → "không dùng Chrome" nghĩa là phải kiểm Safari/WebKit |
| Nhân sự (khách sạn, quản trị) | Desktop, tablet | Không yêu cầu điện thoại → **không làm bottom nav nhân sự** |

## 2. Tính năng trình duyệt mà bản build đang dùng [SRC]

Đếm trong CSS build (`vite build`, Vite 6.4.6, Tailwind 4.3.5, **không đặt `build.target`/browserslist**, dùng mặc định của Vite):

| Tính năng | Số lần trong CSS build | Chrome tối thiểu | Safari/iOS tối thiểu | Nguồn phiên bản |
|---|---|---|---|---|
| `oklch()` | 37 | 111 | 15.4 | [PLAT] |
| `color-mix()` | 26 | 111 | 16.2 | [PLAT] |
| `@property` | 54 | 85 | **16.4** | [PLAT] |
| `:has()` | 4 | 105 | 15.4 | [PLAT] |
| `dvh` | 6 | 108 | 15.4 | [PLAT] |
| `@layer` | 1 | 99 | 15.4 | [PLAT] |
| `backdrop-filter` | 12 | 76 | 9+ (có tiền tố cũ) | [PLAT] |
| `env(safe-area-inset-*)` | 3 | 69 | 11.1 | [PLAT] |

**Kết luận (cần xác minh):** mức sàn thực tế do Tailwind v4 quyết định — **Chrome ≥ 111, Safari/iOS ≥ 16.4**; tài liệu Tailwind v4 cũng nêu mức tương tự [PLAT]. Dưới mức đó dự kiến lệch màu hoặc mất hiệu ứng (chưa thử trên máy cũ). iOS 16.4 ra mắt 3/2023 [PLAT]; thiết bị không lên được iOS 16.4 (iPhone 7 trở xuống) sẽ nằm ngoài hỗ trợ.

Thêm: Vite 6 mặc định nhắm `baseline-widely-available` (khoảng Chrome 107, Safari 16) [PLAT] — thấp hơn mức sàn CSS ở trên, nên mức sàn hiệu dụng vẫn là 111/16.4.

## 3. Kích thước màn hình đã đo (Chrome headless, chỉ trang khách) [SRC]

| Viewport | Tràn ngang | Chữ <11px | Nguồn |
|---|---|---|---|
| 320×568 | 0 | 0 | `baseline/phones/` |
| 360×800 | 0 | 0 | `baseline/phones/` |
| 393×852 | 0 | 0 | `baseline/phones/` |
| 412×915 | 0 | 0 | `baseline/phones/` |
| 375×812, 430×932 | 0 | 0 (trừ `public-stays` còn 2) | `baseline/after-extra/` |
| 768×1024, 1024×768, 1280×800 | 0 | — | `baseline/after-extra/` |

Ma trận kiểm thử đề xuất cho khách: **320, 360, 375, 393, 412, 430** (điện thoại) + **768, 1024** (tablet). Tablet dọc 768 là điểm chuyển `md` của khu khách.

## 4. Những gì CHƯA kiểm chứng

- **Chưa chạy bất kỳ WebKit/Safari/iOS nào.** Máy chỉ có Chromium trong cache Playwright; WebKit chưa cài. Ngay cả WebKit trên Linux cũng chỉ **gần đúng** iOS Safari (khác thanh địa chỉ động, safe-area, bàn phím ảo, camera).
- Chưa kiểm phiên bản Chrome/Safari cũ hơn mức sàn; chưa thử Android WebView, Samsung Internet, Firefox.
- Bảng phiên bản ở mục 2 là trí nhớ, chưa tra caniuse.
- `dvh`/safe-area/`viewport-fit=cover` mới kiểm ở mức source và Chromium.

## 5. Hệ quả cho kế hoạch

- **iOS quay lại phạm vi cho khách** — các mục iOS ở `PWA_READINESS.md` mục 9 và `RISKS.md` (C-01 đến C-05) áp dụng cho khách hàng: cài thủ công, cần `apple-touch-icon` + meta iOS, `viewport-fit=cover` (đã thêm), push chỉ khi đã cài (iOS ≥16.4), nguy cơ Safari xóa dữ liệu sau ~7 ngày không dùng, camera quét vé trong chế độ standalone phải thử máy thật.
- **Thử iOS thật là bắt buộc** trước khi cam kết; không dùng dịch vụ trả phí (BrowserStack…) theo nguyên tắc dự án. Phương án miễn phí: iPhone/iPad thật, hoặc WebKit của Playwright để bắt lỗi layout sơ bộ.
- **Kiểm "phiên bản Chrome":** cách nhẹ nhất là kiểm tra thủ công `chrome://version` ở thiết bị thử, và ghi lại phiên bản đã test vào báo cáo. Nếu muốn app tự cảnh báo trình duyệt quá cũ (<111/16.4), đó là một tính năng riêng cần quyết định (có thể gây khó chịu cho khách).


## 6. Rà soát iOS bằng mã nguồn (không có thiết bị iOS, không cài được WebKit)

Chủ sản phẩm **không có thiết bị iOS**, và việc cài WebKit của Playwright bị hệ thống chặn nên **chưa chạy bất kỳ WebKit nào**. Dưới đây là những gì rà được từ mã nguồn; các hành vi iOS là kiến thức nền tảng **[PLAT]**, chưa thử.

| # | Điểm kiểm tra | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | `<video>` camera quét vé có `muted playsInline` (điều kiện để chạy inline trên iOS) | **PASS** | `ScanTicket.jsx:132` [SRC] |
| 2 | Ô nhập <16px làm iOS tự phóng to trang khi chạm | **Đã sửa.** Trước: ô nhập mặc định 14px (`forms.css:22`), chỉ hộp thoại ≤639px được 16px (`forms.css:82`) nên bộ lọc `stays`, tìm chuyến bay, đăng nhập, tra cứu booking bị. Sau: quy tắc ≤767px ép 16px (`styles.css`, cuối file). Đo ở 375px: **mọi ô nhập trên 5 trang khách = 16px** | [SRC] + hành vi iOS [PLAT] |
| 3 | `-webkit-text-size-adjust` (iOS xoay ngang tự phóng chữ) | Đã thêm `html { -webkit-text-size-adjust: 100% }` | [SRC] |
| 4 | `min-h-screen`/`100vh` với thanh địa chỉ động của Safari | Chỉ dùng làm `min-height` → rủi ro thấp (có thể cuộn thừa vài chục px) | [SRC] |
| 5 | `input type=date/datetime-local` (iOS hiển thị bộ chọn riêng, kích thước/placeholder khác Chrome) | **NOT VERIFIED** — dùng ở `BookingModal`, `Stays` | [SRC] có dùng; hành vi [PLAT] |
| 6 | API mới: `.at()` (Safari 15.4), `replaceAll` (13.1), `navigator.clipboard` (có dự phòng `execCommand`) | Trong mức sàn Safari 16.4 | `ChatBot.jsx:107`, `BookingModal.jsx:174`, `screens/user/data.js:63` [SRC] |
| 7 | Tiền tố `-webkit-backdrop-filter` | Chưa kiểm bản build | — |
| 8 | Camera trong chế độ standalone (đã cài), thanh toán VNPay/MoMo quay về `/payment/result`, safe-area thực tế | **NOT VERIFIED**, cần thiết bị thật | [PLAT] |

**Rủi ro còn lại:** không có thiết bị iOS thì các mục 5, 7, 8 và toàn bộ hành vi WebKit thật vẫn **chưa được kiểm chứng**. Khuyến nghị: nhờ một người dùng/đồng nghiệp có iPhone chạy bản deploy thử và đối chiếu danh sách ở mục 2–3 của file này, hoặc chấp nhận rủi ro có ghi nhận. Không dùng dịch vụ trả phí (BrowserStack…) theo nguyên tắc dự án.
