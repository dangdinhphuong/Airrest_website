# Đường chuẩn responsive (trước Phase 1)

Chụp ngày 2026-11-14 bằng Chrome headless (Playwright từ cache `npx`, không cài vào project) trên **bản build riêng** trỏ API cục bộ cổng 3100, DB `airrest_baseline` (Postgres nhúng, seed từ `backend/database/scripts/seed.ts`). API chạy **không nạp `backend/.env`** (biến giả), nên không chạm Supabase thật và không đụng DB `airrest` của dev.

- `before/<rộng>x<cao>/<màn>.png`: 100 ảnh, 5 viewport (375×812, 430×932, 768×1024, 1024×768, 1280×800) × 20 màn.
- `before/metrics.json`: số đo từng màn (tràn ngang, điều khiển <44px, chữ <11px).
- Màn nhân sự đăng nhập bằng tài khoản seed `letan@demo.airrest.vn` (khách sạn) và `admin@demo.airrest.vn` (quản trị). Chỉ các tab mà tài khoản đó có quyền mới được chụp: **chưa có** `hotel-profile`, `hotel-fleet`, `hotel-trips`, `admin-payerDelay`.

## Kết quả đo (trước khi sửa)

| Chỉ số | Kết quả |
|---|---|
| Tràn ngang (`scrollWidth > clientWidth`) | **0/100** màn |
| Điều khiển tương tác < 44px (tỉ lệ trên tổng) | 375: 51% · 430: 51% · 768: 44% · 1024: 39% · 1280: 43% |
| Lớp hay gặp nhất ở 375 | `[open-booking]`, `[open-ticket]`, `button.link-btn`, `[logo]`, `[partner-entry]`, `[logout]`, `[open-hotel]` |
| Chữ < 11px ở 375 | `public-stays` 89, `public-home` 58, `public-track` 7, `public-support` 6; các màn nhân sự 0 |

## Quan sát bằng mắt (ảnh 375px)
- Khung nhân sự (hamburger, breadcrumb) và bảng→thẻ (`admin-hotels`) hiển thị đúng.
- Nút robot ChatBot nổi đè lên checkbox "Thuê theo giờ" ở `public-stays`: **không phải lỗi** (nút nổi chủ đích, dự án đã dời sang trái bằng quy tắc `:has` để tránh nút −/+ ở mép phải).
- Thanh dưới người dùng có 4 tab nhưng không thấy rõ tab đang chọn.

Ghi chú: số đo "< 44px" tính cả logo/nút đăng xuất trên header và liên kết dạng chữ, nên nặng hơn "nút" thuần. Đo chỉ phản ánh trạng thái tại thời điểm chụp, không phải mọi trạng thái (modal, popup `Select`, bàn phím ảo chưa được chụp).


## Cỡ điện thoại Android (chỉ trang khách)
Chụp thêm 320×568, 360×800, 393×852, 412×915 (`phones/`): tràn ngang 0/20, chữ <11px 0. Xem `../BROWSER_COMPAT.md`.


## Ghi chú `ios-input16/`
Chụp 3 cỡ (375, 390, 430) × 5 trang khách sau khi thêm quy tắc font 16px cho ô nhập: tràn ngang **0/15**, mọi ô nhập = 16px (đo bằng `getComputedStyle`).
**Lưu ý:** 15 ảnh này có **dải đỏ "API chặn trang này (CORS)" ở đầu trang**. Đó là lỗi môi trường thử, không phải của app: API mới không khởi động được vì cổng 3100 còn một API cũ từ lượt trước (`EADDRINUSE`); API cũ đó nhiều khả năng đã bị giới hạn tốc độ (rate limit) nên `ApiBanner` báo CORS. Dải này làm nội dung lệch xuống ~125px nhưng không ảnh hưởng số đo cỡ chữ/tràn ngang. Bài học khi chạy lại: kiểm tra cổng 3100/5175 trống trước khi khởi động.
