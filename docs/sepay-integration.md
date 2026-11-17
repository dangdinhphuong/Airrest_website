# Tích hợp cổng thanh toán SePay

Tài liệu SePay: https://developer.sepay.vn/vi/cong-thanh-toan (form checkout: `/cong-thanh-toan/API/don-hang/form-thanh-toan`, IPN: `/cong-thanh-toan/IPN`).

## Luồng
1. Khách chọn **SePay** ở bước đặt phòng → backend tạo đơn `PENDING_PAYMENT` + bản ghi `payments` (method `SEPAY`, `txn_ref` = `order_invoice_number`).
2. Link thanh toán = `GET <api>/v1/payments/sepay/checkout/<paymentId>`: trang tự gửi **form POST có chữ ký** sang `SEPAY_CHECKOUT_URL`. Chữ ký = Base64(HMAC-SHA256(`SEPAY_SECRET_KEY`, `field=value,...`)) ký **theo đúng thứ tự trường trong form** (như SDK `sepay-pg-node`, xem `docs/senpay_sdk.md`): operation, payment_method, order_invoice_number, order_amount, currency, order_description, success_url, error_url, cancel_url, merchant. Đã đối chiếu: form + chữ ký trùng khớp hoàn toàn với SDK.
3. Khách thanh toán trên SePay, được đưa về `SEPAY_RETURN_URL?gateway=sepay&orderId=...&status=success|error|cancel` (chỉ là gợi ý hiển thị).
4. **IPN** `POST <api>/v1/payments/sepay/ipn` (header `X-Secret-Key`) mới là nguồn sự thật: `ORDER_PAID` + `CAPTURED/APPROVED` + số tiền khớp → đơn `CONFIRMED` (hoặc `PENDING` nếu khách sạn duyệt tay), ghi sổ cái. Nhận lặp không ghi thêm (idempotent).

## Cấu hình
| Biến | Ý nghĩa |
|---|---|
| `SEPAY_ENABLED=true` | bật cổng ở bước đặt phòng |
| `SEPAY_MODE=live` | `mock` chỉ để dev (production cấm) |
| `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY` | lấy ở SePay (khóa merchant, ký form) |
| `SEPAY_IPN_SECRET` | khóa IPN, **khác** khóa merchant; đặt cùng giá trị ở SePay (Cổng thanh toán > Cấu hình > IPN, xác thực SECRET_KEY). Thiếu khi live: backend không khởi động / từ chối mọi IPN |
| `SEPAY_IPN_URL` | URL công khai của API, dạng `https://<api>/v1/payments/sepay/ipn`; origin dùng cho link checkout |
| `SEPAY_RETURN_URL` | `https://<web>/payment/result` |
| `SEPAY_PAYMENT_METHOD` | mặc định `BANK_TRANSFER` (QR chuyển khoản); `CARD` = thẻ; `NAPAS_BANK_TRANSFER` (SePay bắt buộc trường `payment_method`) |
| `SEPAY_CHECKOUT_URL` | mặc định production `https://pay.sepay.vn/v1/checkout/init`; khi thử bằng sandbox đặt theo URL sandbox trong tài liệu SePay |

## Giới hạn đã biết
- **Hoàn tiền:** SePay chưa có API hoàn trong tích hợp này → lệnh hoàn của đơn SePay chuyển thẳng `MANUAL_REQUIRED` cho kế toán hoàn tay.
- **Đối soát:** không có API truy vấn giao dịch → giao dịch treo chờ IPN; quá hạn giữ chỗ mà tiền về muộn thì hệ thống tạo lệnh hoàn 100% (như MoMo/VNPay).
- `TRANSACTION_VOID`: chỉ ghi vết, không tự đảo đơn; kế toán đối soát tay.
- SePay không nêu cơ chế gọi lại IPN trong tài liệu; backend luôn trả 200 khi đã tiếp nhận (kể cả mã đơn lạ), 401 khi sai khóa.
