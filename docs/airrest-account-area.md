# Khu tài khoản khách (2026-11-17)

## Thay đổi so với trước
- **Đăng ký** nhận: email (bắt buộc, duy nhất không phân biệt hoa/thường), tên đăng nhập, họ và tên, mật khẩu. Bỏ ô nhập lại mật khẩu.
  - **Đổi BR-002** ("Airrest không thu thông tin liên hệ ở tài khoản"): nay thu email. SĐT vẫn không thu ở tài khoản. Tên đăng nhập vẫn không được chứa `@` hoặc dãy ≥ 6 chữ số.
  - Email lưu ở `accounts.contact_email` (migration `031_account_extras.sql`), **không** dùng cột `email` vì đó là định danh đăng nhập của nhân sự (`accounts_identity_check` giữ nguyên). Tài khoản cũ không có email (hiển thị "Chưa có email").
- **Header** (khi đã đăng nhập): chuông thông báo (số chưa đọc), tim yêu thích (số lượng), tên đăng nhập sổ xuống menu: Hồ sơ cá nhân, Đơn đặt phòng, Mã giảm giá, Khiếu nại, Đăng xuất.
- **Trang tài khoản** `/tai-khoan/<mục>` có thanh bên: `ho-so`, `don-dat-phong`, `ma-giam-gia`, `khieu-nai`; thêm `thong-bao` và `yeu-thich` mở từ header.
- **Tra cứu booking** chưa đăng nhập chỉ cần mã (xem trạng thái); SĐT chỉ hỏi khi cần thanh toán, hủy, đổi, xem xe.

## Quyết định BA
| Mục | Quyết định | Lý do |
|---|---|---|
| Thông báo | Không có bảng riêng: lấy từ `bookings.status_history` của đơn gắn tài khoản (60 ngày, tối đa 50). Chưa đọc = sau `accounts.notif_seen_at` | Trạng thái đơn đổi ở nhiều nơi; móc từng nơi dễ sót |
| Yêu thích | Bảng `passenger_favorites`; tim ở trang chi tiết khách sạn. Chưa có tim trên thẻ danh sách | Thẻ là nút lồng nút, cần làm lại bố cục |
| Mã giảm giá | Bảng `vouchers` (vận hành tạo, chưa có màn quản trị). Khách xem và sao chép mã | **Chưa áp mã ở bước đặt phòng**: cần quy tắc cộng dồn, ngân sách, hoàn tiền khi hủy |
| Hồ sơ | Hiển thị email, chưa cho sửa email | Đổi email cần xác minh |

## Cần làm tiếp (cần quyết định)
- Màn quản trị tạo/tắt voucher và áp mã ở checkout (`pricing.discountVnd` đã có sẵn trong đơn).
- Xác minh email (gửi thư), quên mật khẩu qua email.
- Thông báo đẩy/email khi đơn đổi trạng thái.
