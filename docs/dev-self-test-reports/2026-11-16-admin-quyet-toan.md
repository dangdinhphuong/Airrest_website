# Báo cáo self-test: Admin + Quyết toán hàng tháng (2026-11-16)

Người test: tester tự động (dev-self-test). Chỉ test và báo cáo, KHÔNG sửa code ứng dụng.

## 1. Môi trường

- Postgres nhúng RIÊNG cổng 54343 (DB `airrest`, thư mục tạm trong scratchpad), migration 001..027 đã áp (+ seed, seedAccounts, seedFleet). Không chạm Supabase, không chạm DB cổng 54329.
- Backend: `node --import tsx api/server.ts`, cổng 3143, KHÔNG nạp `backend/.env` (env truyền tay: DATABASE_URL trỏ 54343, JWT_SECRET/DATA_ENC_KEY test, sweep tắt). Web: bản build với VITE_API_BASE_URL=http://localhost:3143 phục vụ bằng `vite preview` cổng 5143.
- Tài khoản: theo TAI_KHOAN_THU.md (mật khẩu chung ChangeMe123!). Đăng nhập thật qua /v1/auth/login (giãn cách do giới hạn 10/phút/IP).
- Dữ liệu dựng thêm: giá hợp đồng payer x KS (VNA-HAN-01 10%, VNA-HAN-02 12,5%, VJ-HAN-01 8%), chuyến bay thật + lô + 10 đơn payer kỳ 2026-10 (CONFIRMED/CHECKED_OUT/NO_SHOW/CANCELLED/PENDING, đơn simulated, lô simulated, đơn lệch kỳ ở ranh giới 00:30 giờ VN) + yêu cầu xe; offer chờ xác nhận có hành khách có email.
- Thao tác trực tiếp DB chỉ để dựng dữ liệu và đẩy `dispute_deadline` về quá khứ (mô phỏng hết hạn 5 ngày); mọi kết quả kiểm tra đều lấy từ API/UI.
- Giới hạn: transport email là chế độ dev (SMTP_URL không đặt) nên "SENT" nghĩa là worker đã xử lý và ghi log, chưa phát SMTP thật.

## 2. Tổng hợp

| Nhóm | Total | Pass | Fail |
|---|---:|---:|---:|
| A.Ma trận quyền | 267 | 267 | 0 |
| B.Admin chức năng | 67 | 67 | 0 |
| B.Admin bảo mật | 39 | 38 | 1 |
| C.Quyết toán | 119 | 115 | 4 |
| D.Email outbox | 17 | 17 | 0 |
| E.UI Playwright | 51 | 50 | 1 |
| **Tổng** | **560** | **554** | **6** |

## 3. Danh sách FAIL và nguyên nhân gốc

| Case | Nội dung | Actual | Nguyên nhân gốc |
|---|---|---|---|
| ST-89 | Điều chỉnh: bookingId/hotelId không tồn tại (FK) phải trả 4xx, không 500 | 500 INTERNAL_ERROR | Lỗi thật (độ nghiêm trọng thấp-trung bình). POST /admin/payer-statements/adjustments với bookingId/hotelId không tồn tại: INSERT payer_statement_lines vi phạm FK (payer_statement_lines_booking_id_fkey) không được bắt nên trả 500 INTERNAL_ERROR (log API ghi DatabaseError). Cần kiểm tồn tại hoặc map lỗi FK sang 404/422 trong services/settlement/statements.ts (addPayerAdjustment). |
| ST-90 | Điều chỉnh số rất lớn (9.007.199.254.740.991) — không có trần số tiền | 201 (chấp nhận số tiền 9e15 VND, chưa có trần nghiệp vụ) | Thiếu ràng buộc nghiệp vụ: amountVnd điều chỉnh chỉ cần là số nguyên an toàn, nhận được 9.007.199.254.740.991 VND (chỉ cần quyền admin:payer:manage). Nên đặt trần hợp lý (và cân nhắc four-eyes cho số lớn) vì cộng dồn nhiều khoản có thể vượt 2^53 và mất chính xác khi đọc bigint về number. |
| PO-16 | Khách sạn xem bảng chi trả của chính mình (API hotel-side) | 404,404,404 (cả ba đường dẫn đều 404: chưa có API/UI cho khách sạn xem payout) | Thiếu tính năng: không có API nào cho khách sạn xem bảng chi trả của chính mình (/hotel/payouts, /hotel/settlements... đều 404; payouts chỉ có ở /admin/hotel-payouts đòi quyền admin). UI khách sạn cũng không có màn chi trả. Cần xác nhận với PO đây là phạm vi GĐ sau hay thiếu. |
| PO-36 | Điều chỉnh: bookingId không tồn tại (FK) phải trả 4xx, không 500 | 500 INTERNAL_ERROR | Cùng nguyên nhân với ST-89 nhưng ở services/settlement/payouts.ts (addHotelAdjustment): FK hotel_payout_lines_booking_id_fkey -> 500. |
| UI-GAP-admin-settle | Admin có màn tạo/gửi/khóa bảng kê tháng và chi trả KS (UI) | KHÔNG có tab nào (menu admin chỉ: tổng quan, KS, đơn, hỗ trợ, tài khoản, cấu hình, chuyến bay, thanh toán, nhật ký). Các API /admin/payers, /admin/payer-statements, /admin/hotel-payouts chưa có UI; khách sạn cũng chưa có màn xem chi trả. | Thiếu tính năng UI: menu quản trị không có tab cho đơn vị chi trả (adminPayers), bảng kê tháng phía admin (tạo/gửi/khóa/mở lại/điều chỉnh) và chi trả khách sạn. Các API đã có và chạy đúng nhưng chỉ dùng được qua API. Tab "Bảng kê tháng" hiện có chỉ dành cho nhân viên đơn vị chi trả. |
| SEC-15 | Token còn hiệu lực sau khi đăng xuất (không có thu hồi phía server) | token cũ vẫn 200 (JWT stateless 1h, không có /auth/logout). Rủi ro thấp: cần blacklist/jti nếu muốn thu hồi tức thì. | Rủi ro thấp: JWT không có thu hồi phía server, không có /auth/logout; token cũ vẫn dùng được tới khi hết hạn 1 giờ sau khi đăng xuất. Khóa tài khoản thì có hiệu lực ngay (đã test AD-ACC-22). |

### Ghi chú hành vi (PASS nhưng cần PO/dev biết)

- FINANCE (Kế toán) chỉ có admin:payer:read + admin:payment:manage: đọc/khóa/mở lại bảng kê, khóa/ghi nhận trả KS được, nhưng KHÔNG tạo/gửi/điều chỉnh bảng kê hay tạo bảng chi trả (cần admin:payer:manage, chỉ SYSADMIN có). Khớp comment trong router, nhưng quy trình thực tế cần SYSADMIN chạy generate/send. (ST-01, PO-01, ST-41, PO-31)
- Nhân viên trạm của đơn vị chi trả (nv1.vna.han) xem được toàn bộ bảng kê của đơn vị (gồm mã đơn/nhóm/chuyến của trạm khác), vì phạm vi bảng kê theo đơn vị, không theo trạm. Cần PO xác nhận. (ST-53)
- Mở lại (reopen) bảng kê đã LOCKED được phép bởi FINANCE chỉ với lý do + audit; kỳ đã chốt có thể sửa lại. Theo thiết kế, nhưng nên cân nhắc four-eyes. (ST-91)
- Email: group-summary không gắn booking_id (chỉ có dedupe_key), nên tra outbox theo đơn không thấy thư tổng hợp. Thư được enqueue SAU commit xác nhận; 5 request xác nhận song song chỉ sinh đúng 3 thư. (EM-07, EM-09)
- Đối soát 3 chiều khớp: tổng bảng kê payer 2.203.332 - net trả KS 1.724.000 - hoa hồng 209.332 = tiền xe Airrest giữ 270.000; hoa hồng hai phía bằng nhau. (PO-07)
- Chốt kỳ: hạn khiếu nại 5 ngày, lock trước hạn bị chặn (409 DISPUTE_WINDOW_OPEN); khi test hạn đã được đẩy về quá khứ bằng SQL.

## 4. Ảnh chụp UI

Thư mục `docs/dev-self-test-reports/2026-11-16-admin-quyet-toan-shots/` (mỗi tab theo vai trò: <vai trò>-<tab>.png, payer-statements-*.png, xss-*.png).

## 5. Chi tiết từng case

### A.Ma trận quyền

| ID | Kết quả | Case | Input | Expected | Actual |
|---|:--:|---|---|---|---|
| MX-01-sys | PASS | GET /admin/accounts bởi sysadmin1 | GET /admin/accounts token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-01-ops | PASS | GET /admin/accounts bởi ops1 | GET /admin/accounts token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-01-sup | PASS | GET /admin/accounts bởi support1 | GET /admin/accounts token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-01-fin | PASS | GET /admin/accounts bởi finance1 | GET /admin/accounts token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-01-anon | PASS | GET /admin/accounts không token | GET /admin/accounts không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-02-sys | PASS | PATCH /admin/accounts/:id bởi sysadmin1 | PATCH /admin/accounts/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 ACCOUNT_NOT_FOUND |
| MX-02-ops | PASS | PATCH /admin/accounts/:id bởi ops1 | PATCH /admin/accounts/:id token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-02-sup | PASS | PATCH /admin/accounts/:id bởi support1 | PATCH /admin/accounts/:id token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-02-fin | PASS | PATCH /admin/accounts/:id bởi finance1 | PATCH /admin/accounts/:id token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-02-anon | PASS | PATCH /admin/accounts/:id không token | PATCH /admin/accounts/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-03-sys | PASS | POST /admin/accounts (body rỗng) bởi sysadmin1 | POST /admin/accounts token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-03-ops | PASS | POST /admin/accounts (body rỗng) bởi ops1 | POST /admin/accounts token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-03-sup | PASS | POST /admin/accounts (body rỗng) bởi support1 | POST /admin/accounts token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-03-fin | PASS | POST /admin/accounts (body rỗng) bởi finance1 | POST /admin/accounts token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-03-anon | PASS | POST /admin/accounts (body rỗng) không token | POST /admin/accounts không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-04-sys | PASS | GET /admin/roles bởi sysadmin1 | GET /admin/roles token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-04-ops | PASS | GET /admin/roles bởi ops1 | GET /admin/roles token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-04-sup | PASS | GET /admin/roles bởi support1 | GET /admin/roles token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-04-fin | PASS | GET /admin/roles bởi finance1 | GET /admin/roles token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-04-anon | PASS | GET /admin/roles không token | GET /admin/roles không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-05-sys | PASS | GET /admin/permissions bởi sysadmin1 | GET /admin/permissions token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-05-ops | PASS | GET /admin/permissions bởi ops1 | GET /admin/permissions token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-05-sup | PASS | GET /admin/permissions bởi support1 | GET /admin/permissions token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-05-fin | PASS | GET /admin/permissions bởi finance1 | GET /admin/permissions token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-05-anon | PASS | GET /admin/permissions không token | GET /admin/permissions không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-06-sys | PASS | POST /admin/roles (body rỗng) bởi sysadmin1 | POST /admin/roles token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-06-ops | PASS | POST /admin/roles (body rỗng) bởi ops1 | POST /admin/roles token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-06-sup | PASS | POST /admin/roles (body rỗng) bởi support1 | POST /admin/roles token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-06-fin | PASS | POST /admin/roles (body rỗng) bởi finance1 | POST /admin/roles token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-06-anon | PASS | POST /admin/roles (body rỗng) không token | POST /admin/roles không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-07-sys | PASS | DELETE /admin/roles/:id bởi sysadmin1 | DELETE /admin/roles/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 ROLE_NOT_FOUND |
| MX-07-ops | PASS | DELETE /admin/roles/:id bởi ops1 | DELETE /admin/roles/:id token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-07-sup | PASS | DELETE /admin/roles/:id bởi support1 | DELETE /admin/roles/:id token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-07-fin | PASS | DELETE /admin/roles/:id bởi finance1 | DELETE /admin/roles/:id token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-07-anon | PASS | DELETE /admin/roles/:id không token | DELETE /admin/roles/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-08-sys | PASS | GET /admin/hotels bởi sysadmin1 | GET /admin/hotels token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-08-ops | PASS | GET /admin/hotels bởi ops1 | GET /admin/hotels token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-08-sup | PASS | GET /admin/hotels bởi support1 | GET /admin/hotels token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-08-fin | PASS | GET /admin/hotels bởi finance1 | GET /admin/hotels token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-08-anon | PASS | GET /admin/hotels không token | GET /admin/hotels không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-09-sys | PASS | GET /admin/hotels/:id bởi sysadmin1 | GET /admin/hotels/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-09-ops | PASS | GET /admin/hotels/:id bởi ops1 | GET /admin/hotels/:id token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-09-sup | PASS | GET /admin/hotels/:id bởi support1 | GET /admin/hotels/:id token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-09-fin | PASS | GET /admin/hotels/:id bởi finance1 | GET /admin/hotels/:id token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-09-anon | PASS | GET /admin/hotels/:id không token | GET /admin/hotels/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-10-sys | PASS | POST /admin/hotels (body rỗng) bởi sysadmin1 | POST /admin/hotels token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-10-ops | PASS | POST /admin/hotels (body rỗng) bởi ops1 | POST /admin/hotels token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-10-sup | PASS | POST /admin/hotels (body rỗng) bởi support1 | POST /admin/hotels token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-10-fin | PASS | POST /admin/hotels (body rỗng) bởi finance1 | POST /admin/hotels token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-10-anon | PASS | POST /admin/hotels (body rỗng) không token | POST /admin/hotels không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-11-sys | PASS | PATCH /admin/hotels/:id bởi sysadmin1 | PATCH /admin/hotels/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-11-ops | PASS | PATCH /admin/hotels/:id bởi ops1 | PATCH /admin/hotels/:id token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-11-sup | PASS | PATCH /admin/hotels/:id bởi support1 | PATCH /admin/hotels/:id token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-11-fin | PASS | PATCH /admin/hotels/:id bởi finance1 | PATCH /admin/hotels/:id token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-11-anon | PASS | PATCH /admin/hotels/:id không token | PATCH /admin/hotels/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-12-sys | PASS | POST /admin/hotels/:id/approve bởi sysadmin1 | POST /admin/hotels/:id/approve token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-12-ops | PASS | POST /admin/hotels/:id/approve bởi ops1 | POST /admin/hotels/:id/approve token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-12-sup | PASS | POST /admin/hotels/:id/approve bởi support1 | POST /admin/hotels/:id/approve token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-12-fin | PASS | POST /admin/hotels/:id/approve bởi finance1 | POST /admin/hotels/:id/approve token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-12-anon | PASS | POST /admin/hotels/:id/approve không token | POST /admin/hotels/:id/approve không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-13-sys | PASS | POST /admin/hotels/:id/suspend bởi sysadmin1 | POST /admin/hotels/:id/suspend token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-13-ops | PASS | POST /admin/hotels/:id/suspend bởi ops1 | POST /admin/hotels/:id/suspend token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-13-sup | PASS | POST /admin/hotels/:id/suspend bởi support1 | POST /admin/hotels/:id/suspend token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-13-fin | PASS | POST /admin/hotels/:id/suspend bởi finance1 | POST /admin/hotels/:id/suspend token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-13-anon | PASS | POST /admin/hotels/:id/suspend không token | POST /admin/hotels/:id/suspend không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-14-sys | PASS | PUT /admin/hotels/:id/payout-account bởi sysadmin1 | PUT /admin/hotels/:id/payout-account token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-14-ops | PASS | PUT /admin/hotels/:id/payout-account bởi ops1 | PUT /admin/hotels/:id/payout-account token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-14-sup | PASS | PUT /admin/hotels/:id/payout-account bởi support1 | PUT /admin/hotels/:id/payout-account token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-14-fin | PASS | PUT /admin/hotels/:id/payout-account bởi finance1 | PUT /admin/hotels/:id/payout-account token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-14-anon | PASS | PUT /admin/hotels/:id/payout-account không token | PUT /admin/hotels/:id/payout-account không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-15-sys | PASS | POST /admin/hotels/:id/payout-account/approve bởi sysadmin1 | POST /admin/hotels/:id/payout-account/approve token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-15-ops | PASS | POST /admin/hotels/:id/payout-account/approve bởi ops1 | POST /admin/hotels/:id/payout-account/approve token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-15-sup | PASS | POST /admin/hotels/:id/payout-account/approve bởi support1 | POST /admin/hotels/:id/payout-account/approve token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-15-fin | PASS | POST /admin/hotels/:id/payout-account/approve bởi finance1 | POST /admin/hotels/:id/payout-account/approve token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-15-anon | PASS | POST /admin/hotels/:id/payout-account/approve không token | POST /admin/hotels/:id/payout-account/approve không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-16-sys | PASS | POST /admin/hotels/:id/payout-account/reject bởi sysadmin1 | POST /admin/hotels/:id/payout-account/reject token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-16-ops | PASS | POST /admin/hotels/:id/payout-account/reject bởi ops1 | POST /admin/hotels/:id/payout-account/reject token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-16-sup | PASS | POST /admin/hotels/:id/payout-account/reject bởi support1 | POST /admin/hotels/:id/payout-account/reject token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-16-fin | PASS | POST /admin/hotels/:id/payout-account/reject bởi finance1 | POST /admin/hotels/:id/payout-account/reject token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-16-anon | PASS | POST /admin/hotels/:id/payout-account/reject không token | POST /admin/hotels/:id/payout-account/reject không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-17-sys | PASS | GET /admin/hotels/:id/stats bởi sysadmin1 | GET /admin/hotels/:id/stats token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-17-ops | PASS | GET /admin/hotels/:id/stats bởi ops1 | GET /admin/hotels/:id/stats token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-17-sup | PASS | GET /admin/hotels/:id/stats bởi support1 | GET /admin/hotels/:id/stats token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-17-fin | PASS | GET /admin/hotels/:id/stats bởi finance1 | GET /admin/hotels/:id/stats token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 HOTEL_NOT_FOUND |
| MX-17-anon | PASS | GET /admin/hotels/:id/stats không token | GET /admin/hotels/:id/stats không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-18-sys | PASS | POST /admin/media/upload-url (body rỗng) bởi sysadmin1 | POST /admin/media/upload-url token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-18-ops | PASS | POST /admin/media/upload-url (body rỗng) bởi ops1 | POST /admin/media/upload-url token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-18-sup | PASS | POST /admin/media/upload-url (body rỗng) bởi support1 | POST /admin/media/upload-url token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-18-fin | PASS | POST /admin/media/upload-url (body rỗng) bởi finance1 | POST /admin/media/upload-url token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-18-anon | PASS | POST /admin/media/upload-url (body rỗng) không token | POST /admin/media/upload-url không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-19-sys | PASS | GET /admin/configs bởi sysadmin1 | GET /admin/configs token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-19-ops | PASS | GET /admin/configs bởi ops1 | GET /admin/configs token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-19-sup | PASS | GET /admin/configs bởi support1 | GET /admin/configs token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-19-fin | PASS | GET /admin/configs bởi finance1 | GET /admin/configs token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-19-anon | PASS | GET /admin/configs không token | GET /admin/configs không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-20-sys | PASS | GET /admin/configs/:key/versions bởi sysadmin1 | GET /admin/configs/settlement/versions token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-20-ops | PASS | GET /admin/configs/:key/versions bởi ops1 | GET /admin/configs/settlement/versions token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-20-sup | PASS | GET /admin/configs/:key/versions bởi support1 | GET /admin/configs/settlement/versions token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-20-fin | PASS | GET /admin/configs/:key/versions bởi finance1 | GET /admin/configs/settlement/versions token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-20-anon | PASS | GET /admin/configs/:key/versions không token | GET /admin/configs/settlement/versions không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-21-sys | PASS | PUT /admin/configs/pricing.serviceFee (config:write) bởi sysadmin1 | PUT /admin/configs/pricing.serviceFee token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-21-ops | PASS | PUT /admin/configs/pricing.serviceFee (config:write) bởi ops1 | PUT /admin/configs/pricing.serviceFee token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-21-sup | PASS | PUT /admin/configs/pricing.serviceFee (config:write) bởi support1 | PUT /admin/configs/pricing.serviceFee token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-21-fin | PASS | PUT /admin/configs/pricing.serviceFee (config:write) bởi finance1 | PUT /admin/configs/pricing.serviceFee token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-21-anon | PASS | PUT /admin/configs/pricing.serviceFee (config:write) không token | PUT /admin/configs/pricing.serviceFee không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-22-sys | PASS | PUT /admin/configs/pricing.shuttle (config:shuttle) bởi sysadmin1 | PUT /admin/configs/pricing.shuttle token SYS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-22-ops | PASS | PUT /admin/configs/pricing.shuttle (config:shuttle) bởi ops1 | PUT /admin/configs/pricing.shuttle token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-22-sup | PASS | PUT /admin/configs/pricing.shuttle (config:shuttle) bởi support1 | PUT /admin/configs/pricing.shuttle token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-22-fin | PASS | PUT /admin/configs/pricing.shuttle (config:shuttle) bởi finance1 | PUT /admin/configs/pricing.shuttle token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-22-anon | PASS | PUT /admin/configs/pricing.shuttle (config:shuttle) không token | PUT /admin/configs/pricing.shuttle không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-23-sys | PASS | PUT /admin/configs/settlement (config:finance) bởi sysadmin1 | PUT /admin/configs/settlement token SYS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-23-ops | PASS | PUT /admin/configs/settlement (config:finance) bởi ops1 | PUT /admin/configs/settlement token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-23-sup | PASS | PUT /admin/configs/settlement (config:finance) bởi support1 | PUT /admin/configs/settlement token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-23-fin | PASS | PUT /admin/configs/settlement (config:finance) bởi finance1 | PUT /admin/configs/settlement token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-23-anon | PASS | PUT /admin/configs/settlement (config:finance) không token | PUT /admin/configs/settlement không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-24-sys | PASS | GET /admin/audit-logs bởi sysadmin1 | GET /admin/audit-logs token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-24-ops | PASS | GET /admin/audit-logs bởi ops1 | GET /admin/audit-logs token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-24-sup | PASS | GET /admin/audit-logs bởi support1 | GET /admin/audit-logs token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-24-fin | PASS | GET /admin/audit-logs bởi finance1 | GET /admin/audit-logs token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-24-anon | PASS | GET /admin/audit-logs không token | GET /admin/audit-logs không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-25-sys | PASS | GET /admin/payments bởi sysadmin1 | GET /admin/payments token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-25-ops | PASS | GET /admin/payments bởi ops1 | GET /admin/payments token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-25-sup | PASS | GET /admin/payments bởi support1 | GET /admin/payments token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-25-fin | PASS | GET /admin/payments bởi finance1 | GET /admin/payments token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-25-anon | PASS | GET /admin/payments không token | GET /admin/payments không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-26-sys | PASS | GET /admin/refunds bởi sysadmin1 | GET /admin/refunds token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-26-ops | PASS | GET /admin/refunds bởi ops1 | GET /admin/refunds token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-26-sup | PASS | GET /admin/refunds bởi support1 | GET /admin/refunds token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-26-fin | PASS | GET /admin/refunds bởi finance1 | GET /admin/refunds token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-26-anon | PASS | GET /admin/refunds không token | GET /admin/refunds không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-27-sys | PASS | POST /admin/refunds/:id/retry bởi sysadmin1 | POST /admin/refunds/:id/retry token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 409 INVALID_STATE |
| MX-27-ops | PASS | POST /admin/refunds/:id/retry bởi ops1 | POST /admin/refunds/:id/retry token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-27-sup | PASS | POST /admin/refunds/:id/retry bởi support1 | POST /admin/refunds/:id/retry token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-27-fin | PASS | POST /admin/refunds/:id/retry bởi finance1 | POST /admin/refunds/:id/retry token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 409 INVALID_STATE |
| MX-27-anon | PASS | POST /admin/refunds/:id/retry không token | POST /admin/refunds/:id/retry không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-28-sys | PASS | GET /admin/bookings bởi sysadmin1 | GET /admin/bookings token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-28-ops | PASS | GET /admin/bookings bởi ops1 | GET /admin/bookings token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-28-sup | PASS | GET /admin/bookings bởi support1 | GET /admin/bookings token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-28-fin | PASS | GET /admin/bookings bởi finance1 | GET /admin/bookings token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-28-anon | PASS | GET /admin/bookings không token | GET /admin/bookings không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-29-sys | PASS | GET /admin/bookings/:id bởi sysadmin1 | GET /admin/bookings/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 BOOKING_NOT_FOUND |
| MX-29-ops | PASS | GET /admin/bookings/:id bởi ops1 | GET /admin/bookings/:id token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 BOOKING_NOT_FOUND |
| MX-29-sup | PASS | GET /admin/bookings/:id bởi support1 | GET /admin/bookings/:id token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 BOOKING_NOT_FOUND |
| MX-29-fin | PASS | GET /admin/bookings/:id bởi finance1 | GET /admin/bookings/:id token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 BOOKING_NOT_FOUND |
| MX-29-anon | PASS | GET /admin/bookings/:id không token | GET /admin/bookings/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-30-sys | PASS | GET /admin/support bởi sysadmin1 | GET /admin/support token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-30-ops | PASS | GET /admin/support bởi ops1 | GET /admin/support token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-30-sup | PASS | GET /admin/support bởi support1 | GET /admin/support token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-30-fin | PASS | GET /admin/support bởi finance1 | GET /admin/support token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-30-anon | PASS | GET /admin/support không token | GET /admin/support không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-31-sys | PASS | PATCH /admin/support/:id bởi sysadmin1 | PATCH /admin/support/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 TICKET_NOT_FOUND |
| MX-31-ops | PASS | PATCH /admin/support/:id bởi ops1 | PATCH /admin/support/:id token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-31-sup | PASS | PATCH /admin/support/:id bởi support1 | PATCH /admin/support/:id token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 TICKET_NOT_FOUND |
| MX-31-fin | PASS | PATCH /admin/support/:id bởi finance1 | PATCH /admin/support/:id token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-31-anon | PASS | PATCH /admin/support/:id không token | PATCH /admin/support/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-32-sys | PASS | GET /admin/flights bởi sysadmin1 | GET /admin/flights token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-32-ops | PASS | GET /admin/flights bởi ops1 | GET /admin/flights token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-32-sup | PASS | GET /admin/flights bởi support1 | GET /admin/flights token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-32-fin | PASS | GET /admin/flights bởi finance1 | GET /admin/flights token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-32-anon | PASS | GET /admin/flights không token | GET /admin/flights không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-33-sys | PASS | DELETE /admin/flights/:id bởi sysadmin1 | DELETE /admin/flights/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 FLIGHT_NOT_FOUND |
| MX-33-ops | PASS | DELETE /admin/flights/:id bởi ops1 | DELETE /admin/flights/:id token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 FLIGHT_NOT_FOUND |
| MX-33-sup | PASS | DELETE /admin/flights/:id bởi support1 | DELETE /admin/flights/:id token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-33-fin | PASS | DELETE /admin/flights/:id bởi finance1 | DELETE /admin/flights/:id token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-33-anon | PASS | DELETE /admin/flights/:id không token | DELETE /admin/flights/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-34-sys | PASS | GET /admin/dashboard bởi sysadmin1 | GET /admin/dashboard token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-34-ops | PASS | GET /admin/dashboard bởi ops1 | GET /admin/dashboard token OPS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-34-sup | PASS | GET /admin/dashboard bởi support1 | GET /admin/dashboard token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-34-fin | PASS | GET /admin/dashboard bởi finance1 | GET /admin/dashboard token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-34-anon | PASS | GET /admin/dashboard không token | GET /admin/dashboard không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-35-sys | PASS | GET /admin/payers bởi sysadmin1 | GET /admin/payers token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-35-ops | PASS | GET /admin/payers bởi ops1 | GET /admin/payers token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-35-sup | PASS | GET /admin/payers bởi support1 | GET /admin/payers token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-35-fin | PASS | GET /admin/payers bởi finance1 | GET /admin/payers token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-35-anon | PASS | GET /admin/payers không token | GET /admin/payers không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-36-sys | PASS | GET /admin/payers/:id bởi sysadmin1 | GET /admin/payers/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 NOT_FOUND |
| MX-36-ops | PASS | GET /admin/payers/:id bởi ops1 | GET /admin/payers/:id token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-36-sup | PASS | GET /admin/payers/:id bởi support1 | GET /admin/payers/:id token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-36-fin | PASS | GET /admin/payers/:id bởi finance1 | GET /admin/payers/:id token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 NOT_FOUND |
| MX-36-anon | PASS | GET /admin/payers/:id không token | GET /admin/payers/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-37-sys | PASS | POST /admin/payers (body rỗng) bởi sysadmin1 | POST /admin/payers token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-37-ops | PASS | POST /admin/payers (body rỗng) bởi ops1 | POST /admin/payers token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-37-sup | PASS | POST /admin/payers (body rỗng) bởi support1 | POST /admin/payers token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-37-fin | PASS | POST /admin/payers (body rỗng) bởi finance1 | POST /admin/payers token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-37-anon | PASS | POST /admin/payers (body rỗng) không token | POST /admin/payers không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-38-sys | PASS | PATCH /admin/payers/:id bởi sysadmin1 | PATCH /admin/payers/:id token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 NOT_FOUND |
| MX-38-ops | PASS | PATCH /admin/payers/:id bởi ops1 | PATCH /admin/payers/:id token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-38-sup | PASS | PATCH /admin/payers/:id bởi support1 | PATCH /admin/payers/:id token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-38-fin | PASS | PATCH /admin/payers/:id bởi finance1 | PATCH /admin/payers/:id token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-38-anon | PASS | PATCH /admin/payers/:id không token | PATCH /admin/payers/:id không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-39-sys | PASS | GET /admin/payers/:id/api-keys bởi sysadmin1 | GET /admin/payers/:id/api-keys token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 NOT_FOUND |
| MX-39-ops | PASS | GET /admin/payers/:id/api-keys bởi ops1 | GET /admin/payers/:id/api-keys token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-39-sup | PASS | GET /admin/payers/:id/api-keys bởi support1 | GET /admin/payers/:id/api-keys token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-39-fin | PASS | GET /admin/payers/:id/api-keys bởi finance1 | GET /admin/payers/:id/api-keys token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 NOT_FOUND |
| MX-39-anon | PASS | GET /admin/payers/:id/api-keys không token | GET /admin/payers/:id/api-keys không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-40-sys | PASS | GET /admin/payer-statements bởi sysadmin1 | GET /admin/payer-statements token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-40-ops | PASS | GET /admin/payer-statements bởi ops1 | GET /admin/payer-statements token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-40-sup | PASS | GET /admin/payer-statements bởi support1 | GET /admin/payer-statements token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-40-fin | PASS | GET /admin/payer-statements bởi finance1 | GET /admin/payer-statements token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-40-anon | PASS | GET /admin/payer-statements không token | GET /admin/payer-statements không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-41-sys | PASS | POST /admin/payer-statements/generate (payer sai) bởi sysadmin1 | POST /admin/payer-statements/generate token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 PAYER_NOT_FOUND |
| MX-41-ops | PASS | POST /admin/payer-statements/generate (payer sai) bởi ops1 | POST /admin/payer-statements/generate token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-41-sup | PASS | POST /admin/payer-statements/generate (payer sai) bởi support1 | POST /admin/payer-statements/generate token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-41-fin | PASS | POST /admin/payer-statements/generate (payer sai) bởi finance1 | POST /admin/payer-statements/generate token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-41-anon | PASS | POST /admin/payer-statements/generate (payer sai) không token | POST /admin/payer-statements/generate không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-42-sys | PASS | POST /admin/payer-statements/:id/send bởi sysadmin1 | POST /admin/payer-statements/:id/send token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 STATEMENT_NOT_FOUND |
| MX-42-ops | PASS | POST /admin/payer-statements/:id/send bởi ops1 | POST /admin/payer-statements/:id/send token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-42-sup | PASS | POST /admin/payer-statements/:id/send bởi support1 | POST /admin/payer-statements/:id/send token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-42-fin | PASS | POST /admin/payer-statements/:id/send bởi finance1 | POST /admin/payer-statements/:id/send token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-42-anon | PASS | POST /admin/payer-statements/:id/send không token | POST /admin/payer-statements/:id/send không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-43-sys | PASS | POST /admin/payer-statements/:id/lock bởi sysadmin1 | POST /admin/payer-statements/:id/lock token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 STATEMENT_NOT_FOUND |
| MX-43-ops | PASS | POST /admin/payer-statements/:id/lock bởi ops1 | POST /admin/payer-statements/:id/lock token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-43-sup | PASS | POST /admin/payer-statements/:id/lock bởi support1 | POST /admin/payer-statements/:id/lock token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-43-fin | PASS | POST /admin/payer-statements/:id/lock bởi finance1 | POST /admin/payer-statements/:id/lock token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 STATEMENT_NOT_FOUND |
| MX-43-anon | PASS | POST /admin/payer-statements/:id/lock không token | POST /admin/payer-statements/:id/lock không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-44-sys | PASS | POST /admin/payer-statements/:id/reopen bởi sysadmin1 | POST /admin/payer-statements/:id/reopen token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 STATEMENT_NOT_FOUND |
| MX-44-ops | PASS | POST /admin/payer-statements/:id/reopen bởi ops1 | POST /admin/payer-statements/:id/reopen token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-44-sup | PASS | POST /admin/payer-statements/:id/reopen bởi support1 | POST /admin/payer-statements/:id/reopen token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-44-fin | PASS | POST /admin/payer-statements/:id/reopen bởi finance1 | POST /admin/payer-statements/:id/reopen token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 STATEMENT_NOT_FOUND |
| MX-44-anon | PASS | POST /admin/payer-statements/:id/reopen không token | POST /admin/payer-statements/:id/reopen không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-45-sys | PASS | GET /admin/hotel-payouts bởi sysadmin1 | GET /admin/hotel-payouts token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-45-ops | PASS | GET /admin/hotel-payouts bởi ops1 | GET /admin/hotel-payouts token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-45-sup | PASS | GET /admin/hotel-payouts bởi support1 | GET /admin/hotel-payouts token SUP | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-45-fin | PASS | GET /admin/hotel-payouts bởi finance1 | GET /admin/hotel-payouts token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 200 |
| MX-45-anon | PASS | GET /admin/hotel-payouts không token | GET /admin/hotel-payouts không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-46-sys | PASS | POST /admin/hotel-payouts/generate (kỳ sai) bởi sysadmin1 | POST /admin/hotel-payouts/generate token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 422 VALIDATION_ERROR |
| MX-46-ops | PASS | POST /admin/hotel-payouts/generate (kỳ sai) bởi ops1 | POST /admin/hotel-payouts/generate token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-46-sup | PASS | POST /admin/hotel-payouts/generate (kỳ sai) bởi support1 | POST /admin/hotel-payouts/generate token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-46-fin | PASS | POST /admin/hotel-payouts/generate (kỳ sai) bởi finance1 | POST /admin/hotel-payouts/generate token FIN | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-46-anon | PASS | POST /admin/hotel-payouts/generate (kỳ sai) không token | POST /admin/hotel-payouts/generate không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-47-sys | PASS | POST /admin/hotel-payouts/:id/lock bởi sysadmin1 | POST /admin/hotel-payouts/:id/lock token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 PAYOUT_NOT_FOUND |
| MX-47-ops | PASS | POST /admin/hotel-payouts/:id/lock bởi ops1 | POST /admin/hotel-payouts/:id/lock token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-47-sup | PASS | POST /admin/hotel-payouts/:id/lock bởi support1 | POST /admin/hotel-payouts/:id/lock token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-47-fin | PASS | POST /admin/hotel-payouts/:id/lock bởi finance1 | POST /admin/hotel-payouts/:id/lock token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 PAYOUT_NOT_FOUND |
| MX-47-anon | PASS | POST /admin/hotel-payouts/:id/lock không token | POST /admin/hotel-payouts/:id/lock không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-48-sys | PASS | POST /admin/hotel-payouts/:id/paid bởi sysadmin1 | POST /admin/hotel-payouts/:id/paid token SYS | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 PAYOUT_NOT_FOUND |
| MX-48-ops | PASS | POST /admin/hotel-payouts/:id/paid bởi ops1 | POST /admin/hotel-payouts/:id/paid token OPS | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-48-sup | PASS | POST /admin/hotel-payouts/:id/paid bởi support1 | POST /admin/hotel-payouts/:id/paid token SUP | 403 FORBIDDEN | 403 FORBIDDEN |
| MX-48-fin | PASS | POST /admin/hotel-payouts/:id/paid bởi finance1 | POST /admin/hotel-payouts/:id/paid token FIN | không 401/403 (được qua cổng quyền: 2xx/404/409/422...) | 404 PAYOUT_NOT_FOUND |
| MX-48-anon | PASS | POST /admin/hotel-payouts/:id/paid không token | POST /admin/hotel-payouts/:id/paid không Authorization | 401 | 401 UNAUTHENTICATED |
| MX-BAD-token rác | PASS | GET /admin/accounts token rác | Authorization: Bearer abc.def.ghi... | 401 INVALID_TOKEN | 401 INVALID_TOKEN |
| MX-BAD-token cắt cụt | PASS | GET /admin/accounts token cắt cụt | Authorization: Bearer eyJhbGciOiJIUzI1NiIs... | 401 INVALID_TOKEN | 401 INVALID_TOKEN |
| MX-X-chu1-/admin/accounts | PASS | khách sạn (chủ KS) gọi /admin/accounts | GET /admin/accounts token chu1 | 403 | 403 FORBIDDEN |
| MX-X-chu1-/admin/dashboard | PASS | khách sạn (chủ KS) gọi /admin/dashboard | GET /admin/dashboard token chu1 | 403 | 403 FORBIDDEN |
| MX-X-chu1-/admin/payer-statements | PASS | khách sạn (chủ KS) gọi /admin/payer-statements | GET /admin/payer-statements token chu1 | 403 | 403 FORBIDDEN |
| MX-X-chu1-/admin/hotel-payouts | PASS | khách sạn (chủ KS) gọi /admin/hotel-payouts | GET /admin/hotel-payouts token chu1 | 403 | 403 FORBIDDEN |
| MX-X-chu1-/admin/payers | PASS | khách sạn (chủ KS) gọi /admin/payers | GET /admin/payers token chu1 | 403 | 403 FORBIDDEN |
| MX-X-letan1-/admin/accounts | PASS | lễ tân KS gọi /admin/accounts | GET /admin/accounts token letan1 | 403 | 403 FORBIDDEN |
| MX-X-letan1-/admin/dashboard | PASS | lễ tân KS gọi /admin/dashboard | GET /admin/dashboard token letan1 | 403 | 403 FORBIDDEN |
| MX-X-letan1-/admin/payer-statements | PASS | lễ tân KS gọi /admin/payer-statements | GET /admin/payer-statements token letan1 | 403 | 403 FORBIDDEN |
| MX-X-letan1-/admin/hotel-payouts | PASS | lễ tân KS gọi /admin/hotel-payouts | GET /admin/hotel-payouts token letan1 | 403 | 403 FORBIDDEN |
| MX-X-letan1-/admin/payers | PASS | lễ tân KS gọi /admin/payers | GET /admin/payers token letan1 | 403 | 403 FORBIDDEN |
| MX-X-vna-/admin/accounts | PASS | payer cấp đơn vị gọi /admin/accounts | GET /admin/accounts token vna | 403 | 403 FORBIDDEN |
| MX-X-vna-/admin/dashboard | PASS | payer cấp đơn vị gọi /admin/dashboard | GET /admin/dashboard token vna | 403 | 403 FORBIDDEN |
| MX-X-vna-/admin/payer-statements | PASS | payer cấp đơn vị gọi /admin/payer-statements | GET /admin/payer-statements token vna | 403 | 403 FORBIDDEN |
| MX-X-vna-/admin/hotel-payouts | PASS | payer cấp đơn vị gọi /admin/hotel-payouts | GET /admin/hotel-payouts token vna | 403 | 403 FORBIDDEN |
| MX-X-vna-/admin/payers | PASS | payer cấp đơn vị gọi /admin/payers | GET /admin/payers token vna | 403 | 403 FORBIDDEN |
| MX-X-vnahan-/admin/accounts | PASS | nhân viên payer trạm gọi /admin/accounts | GET /admin/accounts token vnahan | 403 | 403 FORBIDDEN |
| MX-X-vnahan-/admin/dashboard | PASS | nhân viên payer trạm gọi /admin/dashboard | GET /admin/dashboard token vnahan | 403 | 403 FORBIDDEN |
| MX-X-vnahan-/admin/payer-statements | PASS | nhân viên payer trạm gọi /admin/payer-statements | GET /admin/payer-statements token vnahan | 403 | 403 FORBIDDEN |
| MX-X-vnahan-/admin/hotel-payouts | PASS | nhân viên payer trạm gọi /admin/hotel-payouts | GET /admin/hotel-payouts token vnahan | 403 | 403 FORBIDDEN |
| MX-X-vnahan-/admin/payers | PASS | nhân viên payer trạm gọi /admin/payers | GET /admin/payers token vnahan | 403 | 403 FORBIDDEN |
| MX-X-khach-/admin/accounts | PASS | khách (passenger) gọi /admin/accounts | GET /admin/accounts token khach | 403 | 403 FORBIDDEN |
| MX-X-khach-/admin/dashboard | PASS | khách (passenger) gọi /admin/dashboard | GET /admin/dashboard token khach | 403 | 403 FORBIDDEN |
| MX-X-khach-/admin/payer-statements | PASS | khách (passenger) gọi /admin/payer-statements | GET /admin/payer-statements token khach | 403 | 403 FORBIDDEN |
| MX-X-khach-/admin/hotel-payouts | PASS | khách (passenger) gọi /admin/hotel-payouts | GET /admin/hotel-payouts token khach | 403 | 403 FORBIDDEN |
| MX-X-khach-/admin/payers | PASS | khách (passenger) gọi /admin/payers | GET /admin/payers token khach | 403 | 403 FORBIDDEN |

### B.Admin chức năng

| ID | Kết quả | Case | Input | Expected | Actual |
|---|:--:|---|---|---|---|
| AD-ACC-01 | PASS | Tạo tài khoản admin OPS hợp lệ | POST /admin/accounts {email qa-un1ffy@airrest.mo, adminRole OPS} | 201, không lộ passwordHash | 201 {"id":"8386b01b-7841-43a0-a18c-5d173d1e2520","seq":122,"email":"qa-un1ffy@airrest.mo","fullName":"QA Ops","type":"ADMIN" |
| AD-ACC-02 | PASS | Email trùng | POST /admin/accounts cùng email (viết hoa) | 409 EMAIL_EXISTS | 409 EMAIL_EXISTS |
| AD-ACC-03 | PASS | Mật khẩu 11 ký tự | POST /admin/accounts {"email":"aun1ffy@airrest.mo","fullName":"QA","adminRole":"OPS","password":"Short-12345"} | 422 | 422 VALIDATION_ERROR |
| AD-ACC-04 | PASS | Email sai định dạng | POST /admin/accounts {"email":"khong-phai-email","fullName":"QA","adminRole":"OPS","password":"QaTest-Pass-12345"} | 422 | 422 VALIDATION_ERROR |
| AD-ACC-05 | PASS | Gửi cả adminRole và roleId | POST /admin/accounts {"email":"bun1ffy@airrest.mo","fullName":"QA","adminRole":"OPS","roleId":"00000000-0000-4000-8000-00 | 422 | 422 VALIDATION_ERROR |
| AD-ACC-06 | PASS | adminRole không tồn tại (ROOT) | POST /admin/accounts {"email":"cun1ffy@airrest.mo","fullName":"QA","adminRole":"ROOT","password":"QaTest-Pass-12345"} | 422 | 422 VALIDATION_ERROR |
| AD-ACC-07 | PASS | Thiếu fullName | POST /admin/accounts {"email":"dun1ffy@airrest.mo","adminRole":"OPS","password":"QaTest-Pass-12345"} | 422 | 422 VALIDATION_ERROR |
| AD-ACC-08 | PASS | Tên 1 ký tự | POST /admin/accounts {"email":"eun1ffy@airrest.mo","fullName":"A","adminRole":"OPS","password":"QaTest-Pass-12345"} | 422 | 422 VALIDATION_ERROR |
| AD-ACC-13 | PASS | Danh sách lọc theo adminRole=FINANCE | GET /admin/accounts?adminRole=FINANCE | 4 tài khoản FINANCE (finance1..3 + taichinh@ từ seed cũ) | 200 n=4 |
| AD-ACC-14 | PASS | limit vượt trần (limit=100000) | GET /admin/accounts?limit=100000 | 422 (hoặc kẹp trần), không 500 | 422 VALIDATION_ERROR n=undefined |
| AD-ACC-15 | PASS | Tự khóa chính mình | PATCH /admin/accounts/<sysadmin1> {status:LOCKED} | 409 CANNOT_MODIFY_SELF | 409 CANNOT_MODIFY_SELF |
| AD-ACC-16 | PASS | PATCH body rỗng | PATCH {} | 422 | 422 VALIDATION_ERROR |
| AD-ACC-17 | PASS | Đổi vai trò OPS -> SUPPORT cho tài khoản mới | PATCH {adminRole:SUPPORT} | 200, adminRole=SUPPORT | 200 SUPPORT |
| AD-ACC-18 | PASS | ID không phải UUID | PATCH /admin/accounts/abc | 422 | 422 VALIDATION_ERROR |
| AD-ACC-19 | PASS | Reset mật khẩu < 12 ký tự | POST reset-password {password:"short"} | 422 | 422 VALIDATION_ERROR |
| AD-ACC-20 | PASS | Reset mật khẩu hợp lệ | POST reset-password {password:QaTest-Pass-67890} | 204 + audit ACCOUNT.RESET_PASSWORD không chứa mật khẩu | 204 audit=2 |
| AD-ACC-21 | PASS | Đăng nhập bằng mật khẩu vừa reset; mật khẩu cũ không còn hiệu lực | POST /auth/login | 200 với mật khẩu mới | 200 |
| AD-ACC-22 | PASS | Khóa tài khoản -> token cũ bị từ chối ngay | PATCH LOCKED rồi GET /admin/dashboard bằng token cũ | trước khóa 200 (SUPPORT có dashboard), sau khóa 401/403 | trước 200, patch 200, sau 401 ACCOUNT_INACTIVE |
| AD-ROLE-01 | PASS | Tạo vai trò tùy chỉnh (account:manage + dashboard) | POST /admin/roles | 201 | 201 |
| AD-ROLE-02 | PASS | Quyền không có trong danh mục | POST /admin/roles perms [foo:bar] | 422 UNKNOWN_PERMISSION | 422 UNKNOWN_PERMISSION |
| AD-ROLE-03 | PASS | Danh sách quyền rỗng | POST /admin/roles perms [] | 422 | 422 VALIDATION_ERROR |
| AD-ROLE-04 | PASS | Trùng tên vai trò (không phân biệt hoa thường) | POST /admin/roles name upper | 409 ROLE_NAME_TAKEN | 409 ROLE_NAME_TAKEN |
| AD-ROLE-05 | PASS | Xóa vai trò đang được gán | DELETE /admin/roles/<role mgr> | 409 ROLE_IN_USE | 409 ROLE_IN_USE |
| AD-ROLE-06 | PASS | Sửa vai trò hệ thống (OPS) | PATCH /admin/roles/<OPS id> | 404/409 (bất biến) | 409 ROLE_SYSTEM_IMMUTABLE |
| AD-ROLE-08 | PASS | Danh sách vai trò chỉ gồm vai trò admin (không lộ hotel_owner/payer_staff) | GET /admin/roles | không chứa key hotel_owner, payer_staff, hotel_driver | OPS,SUPPORT,FINANCE,SYSADMIN,custom_c68af5d46244,custom_4584a6243d96,custom_5b887098b42a |
| AD-ROLE-09 | PASS | Xóa role không dùng | DELETE role XSS vừa tạo | 204 | 204 |
| AD-HOT-01 | PASS | Tạo khách sạn hợp lệ | POST /admin/hotels | 201, status DRAFT/PENDING | 201 status=PENDING_APPROVAL |
| AD-HOT-02 | PASS | Mã khách sạn chữ thường | POST code "qa-low" | 422 | 422 VALIDATION_ERROR |
| AD-HOT-03 | PASS | Trùng mã khách sạn | POST cùng code | 409 | 409 HOTEL_CODE_EXISTS |
| AD-HOT-04 | PASS | Mật khẩu chủ KS yếu | owner.password 5 ký tự | 422 | 422 VALIDATION_ERROR |
| AD-HOT-05 | PASS | Sân bay không có trong danh mục | airports iata ZZZ | 422 | 422 VALIDATION_ERROR |
| AD-HOT-06 | PASS | Tọa độ ngoài miền (lat=200) | location lat 200 | 422 | 422 VALIDATION_ERROR |
| AD-HOT-08 | PASS | Duyệt KS vừa tạo (PENDING_APPROVAL) -> ACTIVE | POST /hotels/:id/approve | 200 status ACTIVE | 200 ACTIVE |
| AD-HOT-08b | PASS | Duyệt lại KS đã ACTIVE -> sai trạng thái | POST approve lần 2 | 409 | 409 INVALID_STATE |
| AD-HOT-09 | PASS | Tạm ngưng thiếu lý do | POST suspend {} | 422 | 422 VALIDATION_ERROR |
| AD-HOT-10 | PASS | Danh sách KS có lọc q/airport | GET /admin/hotels?airport=han&q=Sao | 200 có Sao Mai | 200 n=1 |
| AD-HOT-12 | PASS | Đề xuất đổi TK nhận tiền (sys1) -> 202 pending | PUT payout-account BANK | 202, pendingChange.labelMasked ****6789, không lộ số đầy đủ | 202 |
| AD-HOT-13 | PASS | Đề xuất chồng khi đang có đề xuất chờ | PUT lần 2 | 409 PENDING_CHANGE_EXISTS | 409 PENDING_CHANGE_EXISTS |
| AD-HOT-16 | PASS | Four-eyes: finance1 duyệt đề xuất của sys1 | finance1 approve | 200, payoutAccount.labelMasked = "TK ****6789", không còn pendingChange | 200 {"type":"BANK","labelMasked":"TK ****6789","verifiedAt":"2026-11-16T02:01:46.026Z","changedAt":"2026-11-16T02:01:46.026Z"} |
| AD-HOT-17 | PASS | Duyệt khi không còn đề xuất | finance1 approve lần 2 | 409 NO_PENDING_CHANGE | 409 NO_PENDING_CHANGE |
| AD-HOT-18 | PASS | Số tài khoản BANK sai định dạng | PUT accountNo "12ab" | 422 | 422 VALIDATION_ERROR |
| AD-HOT-19 | PASS | Đề xuất rồi từ chối (finance reject có lý do) | PUT MOMO rồi reject | 200, pendingChange bị xoá | 200 |
| AD-HOT-20 | PASS | Audit ghi vết đề xuất/duyệt TK nhận tiền, không lộ số TK | GET audit-logs?entityType=hotel&entityId=:id | có HOTEL.PAYOUT_ACCOUNT.REQUEST/CHANGE/REJECT, không chứa 123456789 | HOTEL.PAYOUT_ACCOUNT.REJECT,HOTEL.PAYOUT_ACCOUNT.REQUEST,HOTEL.PAYOUT_ACCOUNT.CHANGE,HOTEL.PAYOUT_ACCOUNT.REQUEST,HOTEL.APPROVE,HOTEL.CREATE |
| AD-CFG-01 | PASS | FINANCE đổi settlement hợp lệ | PUT /configs/settlement {dueDays:8,hideAfterDays:16} reason | 201 (tạo phiên bản mới) | 201 |
| AD-CFG-02 | PASS | Giá trị ngoài miền (dueDays 999) | PUT settlement dueDays 999 | 422 | 422 VALIDATION_ERROR |
| AD-CFG-03 | PASS | Hiệu lực ở quá khứ | PUT effectiveFrom 2020-01-01 | 422 EFFECTIVE_FROM_IN_PAST | 422 EFFECTIVE_FROM_IN_PAST |
| AD-CFG-04 | PASS | Thiếu reason | PUT không reason | 422 | 422 VALIDATION_ERROR |
| AD-CFG-05 | PASS | Khóa cấu hình lạ: người có quyền ghi biết 404 | PUT /configs/khong.co fin | 404 | 404 CONFIG_KEY_UNKNOWN |
| AD-CFG-07 | PASS | Lịch sử phiên bản có bản mới | GET /configs/settlement/versions | 200, có 2+ phiên bản (default + vừa đặt) | 200 n=3 |
| AD-AUD-01 | PASS | Audit lọc entityId thiếu entityType | GET audit-logs?entityId=x | 422 | 422 VALIDATION_ERROR |
| AD-PAY-01 | PASS | Danh sách giao dịch (SUPPORT đọc) | GET /admin/payments?limit=5 | 200 {items,nextCursor} | 200 n=0 |
| AD-PAY-02 | PASS | method sai giá trị | GET /admin/payments?method=PAYPAL | 422 | 422 VALIDATION_ERROR |
| AD-PAY-03 | PASS | Đối soát thủ công (finance) | POST /admin/payments/reconcile | 200 | 200 {"queried":0,"settled":0,"failed":0,"expiredBookings":0,"refundsProcessed":0} |
| AD-BKG-01 | PASS | Danh sách booking admin (OPS) | GET /admin/bookings?limit=5 | 200 | 200 n=5 |
| AD-SUP-01 | PASS | Danh sách ticket (SUPPORT) | GET /admin/support | 200 | 200 n=30 |
| AD-FLT-01 | PASS | Danh sách chuyến bay (OPS) | GET /admin/flights?code=VN9001 | 200 có VN9001 | 200 n=1 |
| AD-FLT-02 | PASS | Mã chuyến bay sai định dạng | GET /admin/flights?code=!! | 422 | 422 VALIDATION_ERROR |
| AD-FLT-03 | PASS | Tạo chuyến bay thiếu trường | POST /admin/flights {} | 422 | 422 VALIDATION_ERROR |
| AD-DSH-01 | PASS | Dashboard từ-đến | GET /admin/dashboard | 200 | 200 {"asOf":"2026-11-16T02:01:46.324Z","range":{"from":"2026-10-17T02:01:46.324Z","to":"2026-11-16T02:01 |
| AD-DSH-02 | PASS | Dashboard tham số ngày sai | GET /admin/dashboard?from=abc | 422 | 422 VALIDATION_ERROR |
| AD-PYR-01 | PASS | Danh sách đơn vị chi trả (FINANCE đọc) | GET /admin/payers | 200 có VNA, VJ, SAGS | 200 n=5 |
| AD-PYR-02 | PASS | Tạo đơn vị chi trả thiếu Idempotency-Key | POST /admin/payers body hợp lệ không key | 400 IDEMPOTENCY_KEY_REQUIRED | 400 IDEMPOTENCY_KEY_REQUIRED {"error":{"code":"IDEMPOTENCY_KEY_REQUIRED","message":"Thiếu header Idempotency-Key (8–128 ký tự)","requestId":"7564fabe |
| AD-PYR-03 | PASS | FINANCE tạo đơn vị chi trả (chỉ có payer:read) | POST /admin/payers fin | 403 | 403 FORBIDDEN |
| AD-PYR-04 | PASS | Tạo đơn vị chi trả hợp lệ | POST /admin/payers | 201 | 201 {"payer":{"id":"0f67ac7f-e2de-49fe-92dc-1c5fd4894bf5","seq":6,"code":"QAUN1","name":"QA Payer un1ffy","kind":"AIRLINE","status":"ACTIVE","sharedRoomPolicy":"PRI |
| AD-PYR-07 | PASS | Tạo nhân viên payer mật khẩu yếu | POST staff password 5 | 422 | 422 VALIDATION_ERROR |
| AD-PYR-08 | PASS | Danh sách nhân viên payer không lộ passwordHash | GET /admin/payers/:id/staff | không chứa passwordHash | 200 |
| AD-PYR-09 | PASS | Hợp đồng giá: commission_pct ngoài miền | PUT hotel-rates commissionPct 150 | 422 | 422 VALIDATION_ERROR {"error":{"code":"VALIDATION_ERROR","message":"Dữ liệu không hợp lệ","details":[{"code":"too_big","maximum":100,"type":" |

### B.Admin bảo mật

| ID | Kết quả | Case | Input | Expected | Actual |
|---|:--:|---|---|---|---|
| AD-ACC-09 | PASS | XSS trong fullName được lưu nguyên văn dạng chuỗi (UI phải escape) | POST fullName `<img src=x onerror=alert(1)>` | 201 và API trả JSON (Content-Type json, không render HTML) | 201 ct=application/json; charset=utf-8 |
| AD-ACC-10 | PASS | SQLi trong q: `' OR 1=1 --` | GET /admin/accounts?q=' OR 1=1 -- | 200, không 500, không trả toàn bộ | 200 items=0 |
| AD-ACC-11 | PASS | SQLi dạng stacked query trong q | q=x'; DROP TABLE accounts; -- | 200, bảng accounts vẫn còn | 200 / list 200 n=20 |
| AD-ACC-12 | PASS | Ký tự % trong q được escape (không match tất cả) | GET /admin/accounts?q=%25 | 200, items=0 | 200 n=0 |
| AD-ESC-00 | PASS | Tài khoản vai trò tùy chỉnh đăng nhập được | login mgr | 200 | create 201 login 200 |
| AD-ESC-01 | PASS | Leo thang: tạo role chứa admin:payer:manage khi bản thân không có | POST /admin/roles perms [admin:payer:manage] | 403 PERMISSION_ESCALATION | 403 PERMISSION_ESCALATION |
| AD-ESC-02 | PASS | Leo thang: tạo tài khoản SYSADMIN | POST /admin/accounts adminRole SYSADMIN | 403 PERMISSION_ESCALATION | 403 PERMISSION_ESCALATION |
| AD-ESC-03 | PASS | Leo thang: tạo tài khoản FINANCE (quyền chưa có) | POST /admin/accounts adminRole FINANCE | 403 | 403 PERMISSION_ESCALATION |
| AD-ESC-04 | PASS | Reset mật khẩu của SYSADMIN bởi người thấp quyền | POST /admin/accounts/<sysadmin2>/reset-password | 403 | 403 PERMISSION_ESCALATION |
| AD-ESC-05 | PASS | Nâng quyền chính vai trò mình (PATCH role đang dùng thêm payer:manage) | PATCH /admin/roles/<role của mình> perms +admin:payer:manage | 403/409 (không được) | 403 PERMISSION_ESCALATION |
| AD-ESC-06 | PASS | Khóa SYSADMIN khác bởi người thấp quyền | PATCH /admin/accounts/<sysadmin2> LOCKED | 403 | 403 PERMISSION_ESCALATION |
| AD-ESC-07 | PASS | Mass-assignment: gửi field lạ permissions vào POST /admin/accounts | POST body + {permissions:[...]} | không cấp thêm quyền (201 bỏ qua hoặc 422) | 201 type=ADMIN |
| AD-ROLE-07 | PASS | XSS trong tên vai trò | POST name `<script>alert(1)</script>` | 201, lưu nguyên văn; UI escape (kiểm ở phần UI) | 201 |
| AD-HOT-07 | PASS | SQLi trong tên KS (tham số hóa) | name "x'); DROP TABLE hotels;--" | 201 hoặc 409, bảng hotels còn | 201 list 200 |
| AD-HOT-11 | PASS | GET hotel không lộ detailsEnc / tài khoản nhận tiền chi tiết | GET /admin/hotels/:id | không có detailsEnc/accountNo | 200 |
| AD-HOT-14 | PASS | Four-eyes: người đề xuất tự duyệt | sys1 POST payout-account/approve | 403 FOUR_EYES_REQUIRED | 403 FOUR_EYES_REQUIRED |
| AD-HOT-15 | PASS | Four-eyes: SUPPORT duyệt (thiếu quyền) | support1 approve | 403 FORBIDDEN | 403 FORBIDDEN |
| AD-CFG-06 | PASS | Khóa cấu hình lạ: người không có quyền ghi (SUPPORT) chỉ thấy 403 | PUT /configs/khong.co sup | 403 | 403 FORBIDDEN |
| AD-CFG-08 | PASS | Prototype pollution trong value | PUT value {"__proto__":{"x":1},dueDays:8,hideAfterDays:16} | 201/422, không crash, giá trị lưu không chứa __proto__/polluted | 201 |
| AD-AUD-02 | PASS | Không có API sửa/xóa audit | DELETE/PATCH/POST /admin/audit-logs | 404 (không tồn tại) | 404,404,404,404 |
| AD-AUD-03 | PASS | SQLi trong action filter | action=' OR '1'='1 | 200 items=0 | 200 n=0 |
| AD-BKG-02 | PASS | Booking admin không lộ thông tin thẻ/ hash | GET /admin/bookings | không chứa password/detailsEnc/passwordHash | 200 |
| AD-PYR-05 | PASS | XSS tên đơn vị | POST name `<svg onload=alert(1)>` | 201/422, JSON | 201 |
| AD-PYR-06 | PASS | API key đơn vị chi trả: tạo trả key 1 lần, danh sách không lộ key | POST api-keys rồi GET | POST 201 có key; GET không chứa key/ hash đầy đủ | create 201 list 200 keyReturned=true |
| SEC-01 | PASS | JWT alg=none | token header {alg:none} + claims sysadmin1 | 401 | 401 INVALID_TOKEN |
| SEC-02 | PASS | JWT ký sai khóa | HS256 secret "wrong" | 401 | 401 INVALID_TOKEN |
| SEC-03 | PASS | JWT hết hạn | exp trong quá khứ (khóa đúng của môi trường test) | 401 | 401 INVALID_TOKEN |
| SEC-04 | PASS | JWT hợp lệ nhưng sub là tài khoản không tồn tại | ký đúng, sub uuid lạ | 401/403 | 401 ACCOUNT_INACTIVE |
| SEC-05 | PASS | JWT tự nâng accountType ADMIN trong claim cho tài khoản payer (quyền lấy từ DB) | ký đúng, sub=dv.vna, accountType=ADMIN | 403 (quyền theo DB, không theo claim) | 403 FORBIDDEN |
| SEC-06 | PASS | JSON hỏng | POST /admin/accounts rawBody "{bad" | 400/422, không 500 | 400 INVALID_JSON |
| SEC-07 | PASS | Body quá lớn (2MB) | POST /admin/roles name 2MB | 413 (không 500) | 413 PAYLOAD_TOO_LARGE |
| SEC-08 | PASS | Content-Type text/plain | POST generate với text/plain | 4xx, không 500 | 422 |
| SEC-09 | PASS | CORS: origin lạ không được phản hồi Access-Control-Allow-Origin | GET /admin/dashboard Origin: https://evil.example | không có ACAO cho origin lạ | null |
| SEC-10 | PASS | Header bảo mật cơ bản | GET /admin/dashboard | không có X-Powered-By; có X-Content-Type-Options | xpb=null xcto=nosniff |
| SEC-11 | PASS | Route admin không tồn tại | GET /admin/khong-co (có/không token) | 404 / 401 | 404,401 |
| SEC-12 | PASS | Đăng nhập sai mật khẩu / email không tồn tại cho cùng thông báo | POST /auth/login | 401 INVALID_CREDENTIALS cả hai (không lộ email tồn tại) | 401/401 "Email hoặc mật khẩu không đúng" |
| SEC-13 | PASS | SQLi ở email đăng nhập | email "' OR 1=1--" | 422/401, không 500 | 422 VALIDATION_ERROR |
| SEC-14 | PASS | Khóa brute-force: đăng nhập sai liên tiếp bị giới hạn (429) | 12 lần POST /auth/login sai | xuất hiện 429 RATE_LIMITED | 401,401,401,401,401,401,401,429,429,429,429,429 |
| SEC-15 | **FAIL** | Token còn hiệu lực sau khi đăng xuất (không có thu hồi phía server) | đăng xuất UI rồi gọi lại /admin/dashboard bằng token cũ | token cũ bị từ chối (khuyến nghị) | token cũ vẫn 200 (JWT stateless 1h, không có /auth/logout). Rủi ro thấp: cần blacklist/jti nếu muốn thu hồi tức thì. |

### C.Quyết toán

| ID | Kết quả | Case | Input | Expected | Actual |
|---|:--:|---|---|---|---|
| ST-01 | PASS | FINANCE không được tạo bảng kê (thiếu admin:payer:manage) | POST /admin/payer-statements/generate token finance1 | 403 | 403 FORBIDDEN |
| ST-02 | PASS | SUPPORT/OPS không được tạo bảng kê | generate bởi support1, ops1 | 403,403 | 403,403 |
| ST-03 | PASS | Không token | generate không Authorization | 401 | 401 UNAUTHENTICATED |
| ST-04 | PASS | Thiếu Idempotency-Key | generate hợp lệ nhưng không header key | 400 IDEMPOTENCY_KEY_REQUIRED | 400 IDEMPOTENCY_KEY_REQUIRED |
| ST-05 | PASS | Idempotency-Key quá ngắn (<8) | key "abc" | 400 | 400 IDEMPOTENCY_KEY_REQUIRED |
| ST-06-2026-13 | PASS | Kỳ không hợp lệ "2026-13" | generate period=2026-13 | 422 | 422 VALIDATION_ERROR |
| ST-06-202610 | PASS | Kỳ không hợp lệ "202610" | generate period=202610 | 422 | 422 VALIDATION_ERROR |
| ST-06-abc | PASS | Kỳ không hợp lệ "abc" | generate period=abc | 422 | 422 VALIDATION_ERROR |
| ST-06-2026-00 | PASS | Kỳ không hợp lệ "2026-00" | generate period=2026-00 | 422 | 422 VALIDATION_ERROR |
| ST-06-2026-1 | PASS | Kỳ không hợp lệ "2026-1" | generate period=2026-1 | 422 | 422 VALIDATION_ERROR |
| ST-06-2026-10' | PASS | Kỳ không hợp lệ "2026-10'; DROP TABLE" | generate period=2026-10'; DROP TABLE payer_statements;-- | 422 | 422 VALIDATION_ERROR |
| ST-06- | PASS | Kỳ không hợp lệ "" | generate period= | 422 | 422 VALIDATION_ERROR |
| ST-07 | PASS | payerId không phải UUID | payerId "abc" | 422 | 422 VALIDATION_ERROR |
| ST-08 | PASS | Đơn vị không tồn tại | payerId uuid lạ | 404 PAYER_NOT_FOUND | 404 PAYER_NOT_FOUND |
| ST-09 | PASS | Field thừa bị từ chối (strict, chống mass-assignment) | body + totalVnd:1 | 422 | 422 VALIDATION_ERROR |
| ST-10 | PASS | 5 request generate song song (khác key) cho VNA 2026-10 | 5x POST generate parallel | cả 5 đều 200, chỉ 1 bảng kê (payer,period), 6 dòng (không nhân đôi) | 200,200,200,200,200 rows=1 lines=6 |
| ST-11 | PASS | Số tiền bảng kê VNA 2026-10 | generate VNA 2026-10 | room 1,733,332 · xe 270,000 · tổng 2,003,332 · hoa hồng 193,332 · 6 dòng · DRAFT; loại: hủy/chờ/simulated/lô simulated/khác kỳ; NO_SHOW tính; ranh giới 00:30 VN 01/10 thuộc T10 | {"st":"DRAFT","room":1733332,"shuttle":270000,"total":2003332,"comm":193332,"n":6,"unchanged":true} |
| ST-12 | PASS | Tổng = SUM dòng; hoa hồng floor từng dòng | GET /admin/payer-statements/:id | Σamount=total; ROOM commission {10000,33333,50000,99999}; mọi dòng flight VN9001 | n=6 Σ=2003332 comm=10000,33333,50000,99999 |
| ST-13 | PASS | Generate lặp (DRAFT) không đổi version | generate lần nữa | unchanged=true, version không tăng | unchanged=true v=2/2 |
| ST-14 | PASS | Idempotency: cùng key + cùng body trả lại kết quả cũ | 2 lần generate cùng Idempotency-Key | lần 2 có header Idempotent-Replay: true, body giống | replay=true |
| ST-15 | PASS | Idempotency: cùng key khác body | key cũ, payerId khác | 422 IDEMPOTENCY_KEY_REUSED | 422 IDEMPOTENCY_KEY_REUSED |
| ST-16 | PASS | Idempotency tách theo người dùng | cùng key, sysadmin2 vs sysadmin1 | sys2 không bị replay của sys1 (200 không có Idempotent-Replay) | 200 replay=null |
| ST-17 | PASS | Bảng kê VJ 2026-10 | generate VJ | room 200,000 · hoa hồng 16,000 (8%) · xe 0 · tổng 200,000 · 1 dòng | {"room":200000,"comm":16000,"total":200000,"n":1} |
| ST-18 | PASS | Cách ly đơn vị: bảng kê VNA không chứa đơn của VJ (200,000) | đối chiếu dòng | không có dòng amount=200000 trong VNA | 333333,500000,799999,100000,120000,150000 |
| ST-19 | PASS | Kỳ trống: tạo bảng kê SAGS 2026-10 | generate SAGS | 200, total 0, 0 dòng | {"total":0,"n":0} |
| ST-20 | PASS | Lọc danh sách theo payerId+period+status | GET ?payerId=VNA&period=2026-10&status=DRAFT | 1 bảng kê | n=1 |
| ST-21 | PASS | Phân trang con trỏ limit=1 | GET ?limit=1 rồi after=nextCursor | trang 2 khác trang 1, không trùng | 306fac vs 8a166c |
| ST-22 | PASS | Tham số lọc sai | status=HACK, period=2026-1, after=-1, limit=0 | 422 cho từng tham số | 422,422,422,422,422 |
| ST-23 | PASS | SQLi trong status/period | period=' OR 1=1-- | 422, không 500 | 422 VALIDATION_ERROR |
| ST-24 | PASS | GET bảng kê id lạ / không phải UUID | GET /:id uuid lạ; GET /abc | 404; 422 | 404,422 |
| ST-25 | PASS | SUPPORT không đọc được bảng kê (thiếu admin:payer:read) | GET list bởi support1 | 403 | 403 FORBIDDEN |
| ST-26 | PASS | CSV admin: BOM, header, dòng TOTAL, có cột commission | GET /:id/csv | text/csv, bắt đầu BOM+header 8 cột, dòng TOTAL = 2003332, attachment | 200 kind,booking_code,group_code,flight_code,hotel,amount_vnd,commission_vnd,memo \| TOTAL,,,,,2003332,193332,Vietnam Airlines (thử) 2026-10 (DRAFT) |
| ST-30 | PASS | Payer không thấy bản nháp trong danh sách | dv.vna GET /payer/statements | 200, items không chứa DRAFT (0 dòng) | 200 n=0 |
| ST-31 | PASS | Payer GET bản nháp theo id -> 404 (không lộ tồn tại) | dv.vna GET /payer/statements/:id(DRAFT) | 404 | 404 STATEMENT_NOT_FOUND |
| ST-32 | PASS | Payer không gọi được API admin bảng kê | dv.vna GET /admin/payer-statements, POST generate | 403 | 403,403 |
| ST-33 | PASS | Payer không gọi được lock/send/reopen admin | dv.vna POST send/lock/reopen | 403 x3 | 403,403,403 |
| ST-34 | PASS | Khách sạn / khách không đọc /payer/statements | chu.han01, khach01 | 403 | 403,403,401 |
| ST-40 | PASS | Gửi kỳ chưa kết thúc (2026-11 đang chạy) | generate VNA 2026-11 rồi send | 409 PERIOD_NOT_ENDED | 409 PERIOD_NOT_ENDED |
| ST-41 | PASS | Gửi bởi FINANCE (thiếu payer:manage) | finance1 POST send | 403 | 403 FORBIDDEN |
| ST-42 | PASS | Khóa bảng kê DRAFT | finance1 lock khi DRAFT | 409 STATEMENT_NOT_LOCKABLE | 409 STATEMENT_NOT_LOCKABLE |
| ST-43 | PASS | Double submit: 5 request gửi song song (khác key) | 5x POST send cùng bảng kê | đúng 1 request 200, 4 request 409; trạng thái SENT, version +1 | 200,409,409,409,409 status=SENT v 2->3 hạn khiếu nại=5d |
| ST-44 | PASS | Tạo lại bảng kê đã SENT bị chặn | generate VNA 2026-10 khi SENT | 409 STATEMENT_NOT_DRAFT | 409 STATEMENT_NOT_DRAFT |
| ST-45 | PASS | Khóa trước hạn khiếu nại | finance1 lock ngay sau gửi | 409 DISPUTE_WINDOW_OPEN | 409 DISPUTE_WINDOW_OPEN |
| ST-50 | PASS | Payer thấy bảng kê SENT của đơn vị mình, KHÔNG thấy hoa hồng | dv.vna GET list + detail + CSV | list có 1 (SENT); không chuỗi commissionVnd trong list/detail; CSV 7 cột | list=1 commissionInJson=false csvHead=kind,booking_code,group_code,flight_code,hotel,amount_vnd,memo |
| ST-51 | PASS | IDOR: payer VJ đọc bảng kê VNA | dv.vj GET /payer/statements/:idVNA (detail, csv) | 404 (không phải 403, không lộ tồn tại) | 404,404 |
| ST-52 | PASS | IDOR: payer VJ không thấy bảng kê VNA trong danh sách | dv.vj GET list | 0 dòng (VJ chưa gửi) | n=0 |
| ST-53 | PASS | Nhân viên trạm của VNA (nv1.vna.han) đọc bảng kê đơn vị | nv1.vna.han GET list/detail | 200 (router: phạm vi theo đơn vị, không theo trạm) - ghi nhận | 200 n=1 |
| ST-54 | PASS | Payer không gửi payerId để đổi phạm vi | dv.vj GET /payer/statements?payerId=VNA | bỏ qua/422, không rò dữ liệu VNA | 200 n=0 |
| ST-55 | PASS | Payer lọc theo period sai | GET ?period=2026-13 | 422 | 422 VALIDATION_ERROR |
| ST-56 | PASS | Payer không lộ lockedBy/ID nội bộ | dv.vna GET detail | không chứa lockedBy (UUID tài khoản admin) | id,seq,payerId,period,status,roomVnd,shuttleVnd,upgradeDeltaVnd,adjustmentVnd,totalVnd,lineCount,sentAt,disputeDeadline,version,createdAt,updatedAt,payerName |
| ST-60 | PASS | Khiếu nại lý do < 5 ký tự | dispute reason "ab" | 422 | 422 VALIDATION_ERROR |
| ST-61 | PASS | Khiếu nại thiếu Idempotency-Key | dispute hợp lệ không key | 400 | 400 IDEMPOTENCY_KEY_REQUIRED |
| ST-62 | PASS | IDOR: payer VJ khiếu nại bảng kê VNA | dv.vj POST dispute :idVNA | 404 | 404 STATEMENT_NOT_FOUND |
| ST-63 | PASS | Khiếu nại có field lạ | dispute + status:LOCKED | 422 | 422 VALIDATION_ERROR |
| ST-64 | PASS | Khiếu nại > 1000 ký tự | reason 1001 ký tự | 422 | 422 VALIDATION_ERROR |
| ST-65 | PASS | Khiếu nại hợp lệ (có payload XSS trong lý do) | dispute reason <script>alert("xss")</script> Sai số tiền | 200 DISPUTED, lưu nguyên văn, response không có commission | 200 DISPUTED |
| ST-66 | PASS | Khiếu nại lần 2 | dispute khi đã DISPUTED | 409 STATEMENT_NOT_DISPUTABLE | 409 STATEMENT_NOT_DISPUTABLE |
| ST-67 | PASS | Khóa bảng kê đang tranh chấp | finance1 lock | 409 STATEMENT_NOT_LOCKABLE | 409 STATEMENT_NOT_LOCKABLE |
| ST-68 | PASS | Admin thấy lý do khiếu nại | finance1 GET /:id | status DISPUTED, disputeReason có nội dung | DISPUTED |
| ST-69 | PASS | Mở lại thiếu lý do / lý do ngắn | reopen {} và {reason:"ab"} | 422 | 422,422 |
| ST-70 | PASS | Mở lại bởi SUPPORT / OPS | reopen bởi support1, ops1 | 403 | 403,403 |
| ST-71 | PASS | FINANCE mở lại về nháp, xóa dữ liệu gửi/khiếu nại | finance1 reopen {reason} | 200 DRAFT, sentAt/disputeDeadline/disputeReason = null | 200 DRAFT |
| ST-72 | PASS | Mở lại bảng kê đã là nháp | reopen khi DRAFT | 409 STATEMENT_ALREADY_DRAFT | 409 STATEMENT_ALREADY_DRAFT |
| ST-73 | PASS | Payer lại không thấy bản nháp sau khi mở lại | dv.vna GET list/detail | 0 dòng, detail 404 | n=0 detail=404 |
| ST-74 | PASS | Khiếu nại quá hạn 5 ngày (mô phỏng hạn đã qua bằng SQL) | dv.vj dispute VJ sau hạn | 409 DISPUTE_WINDOW_CLOSED | 409 DISPUTE_WINDOW_CLOSED |
| ST-75 | PASS | SUPPORT/OPS không khóa được bảng kê | lock bởi support1, ops1 (VJ sau hạn) | 403 | 403,403 |
| ST-76 | PASS | Double submit khóa: 5 request song song | 5x POST lock (VJ, hết hạn) | 1x200 + 4x409; LOCKED, locked_by = finance1 | 200,409,409,409,409 LOCKED |
| ST-77 | PASS | Khiếu nại bảng kê đã LOCKED | dv.vj dispute VJ(LOCKED) | 409 STATEMENT_NOT_DISPUTABLE | 409 STATEMENT_NOT_DISPUTABLE |
| ST-78 | PASS | Generate lại kỳ LOCKED: trả nguyên trạng, không sửa | generate VJ 2026-10 | 200 unchanged=true, status LOCKED | 200 LOCKED |
| ST-80 | PASS | Điều chỉnh kỳ chưa khóa (VNA T10 đang SENT) | POST adjustments VNA 2026-10 -50000 | 409 PERIOD_NOT_LOCKED | 409 PERIOD_NOT_LOCKED |
| ST-81 | PASS | Điều chỉnh với số tiền 0 | adjustments amountVnd=0 | 422 | 422 VALIDATION_ERROR |
| ST-82 | PASS | Điều chỉnh với số thập phân | adjustments amountVnd=1.5 | 422 | 422 VALIDATION_ERROR |
| ST-83 | PASS | Điều chỉnh với số dạng chuỗi | adjustments amountVnd=5000 | 422 | 422 VALIDATION_ERROR |
| ST-84 | PASS | Điều chỉnh với vượt số nguyên an toàn | adjustments amountVnd=1000000000000000000 | 422 | 422 INVALID_AMOUNT |
| ST-85 | PASS | Điều chỉnh memo quá ngắn / quá dài | memo "ab" và 301 ký tự | 422 | 422,422 |
| ST-86 | PASS | FINANCE điều chỉnh (thiếu payer:manage) | finance1 POST adjustments | 403 | 403 FORBIDDEN |
| ST-87 | PASS | Điều chỉnh sau khóa VJ: dòng ADJUSTMENT sang kỳ kế (2026-11) DRAFT, T10 giữ nguyên | adjustments VJ 2026-10 amount -50000 memo công thức CSV | 200/201; kỳ 2026-11 VJ DRAFT có 1 dòng ADJUSTMENT -50000; T10 vẫn total 200000 LOCKED | 201 T10=200000/LOCKED T11={"id":"4ebe6941-bed7-457e-b4fc-b133235ae13e","totalVnd":"-50000","adjustmentVnd":"-50000","status":"DRAFT","lineCount":1} |
| ST-88 | PASS | CSV chống formula injection (ô bắt đầu bằng =) | GET csv VJ T11 | ô memo bắt đầu bằng dấu nháy đơn '= | ADJUSTMENT,,,,,-50000,0,"[Kỳ 2026-10] =HYPERLINK(""http://evil"",""x"")" |
| ST-89 | **FAIL** | Điều chỉnh: bookingId/hotelId không tồn tại (FK) phải trả 4xx, không 500 | adjustments VJ T10 với bookingId uuid lạ | 404/409/422 (không 500) | 500 INTERNAL_ERROR |
| ST-90 | **FAIL** | Điều chỉnh số rất lớn (9.007.199.254.740.991) — không có trần số tiền | SAGS T10 LOCKED rồi adjustments MAX_SAFE | bị từ chối hoặc có trần hợp lý (khuyến nghị) | 201 (chấp nhận số tiền 9e15 VND, chưa có trần nghiệp vụ) |
| ST-91 | PASS | Mở lại kỳ LOCKED (finance) có lý do -> DRAFT, locked_by xóa | reopen VJ T10 | 200 DRAFT, lockedAt null (hành vi theo thiết kế, có audit) | 200 |
| ST-92 | PASS | Audit ghi đủ GENERATE/SEND/LOCK/REOPEN/DISPUTE/ADJUST kèm actor | GET /admin/audit-logs?entityType=payer_statement | có các action PAYER_STATEMENT.*, actor.id đúng | PAYER_STATEMENT.REOPEN,PAYER_STATEMENT.ADJUST,PAYER_STATEMENT.LOCK,PAYER_STATEMENT.SEND,PAYER_STATEMENT.DISPUTE,PAYER_STATEMENT.GENERATE |
| PO-01 | PASS | FINANCE/SUPPORT/OPS không tạo được bảng chi trả KS | generate bởi fin, sup, ops | 403 x3 | 403,403,403 |
| PO-02 | PASS | Không token / thiếu Idempotency-Key / kỳ sai / field thừa | generate các biến thể | 401 / 400 / 422 / 422 | 401,400,422,422 |
| PO-03 | PASS | 5 request generate song song cho 2026-10 (khác key) | 5x POST /admin/hotel-payouts/generate | cả 5 đều 200; mỗi (hotel,kỳ) đúng 1 bảng; không nhân đôi dòng | 200,200,200,200,200 hotels=2 lines=5 |
| PO-04 | PASS | Số tiền chi trả Sao Mai (HAN-01) T10 | generate 2026-10 | gross 1,133,333 · hoa hồng 109,333 · net 1,024,000 · 4 dòng (VNA 3 + VJ 1; không tính tiền xe) | {"g":1133333,"c":109333,"n":1024000,"k":4} |
| PO-05 | PASS | Số tiền chi trả Trăng Non (HAN-02) T10 (NO_SHOW vẫn tính) | generate 2026-10 | gross 799,999 · hoa hồng 99,999 (12.5% floor) · net 700,000 | {"g":799999,"c":99999,"n":700000} |
| PO-06 | PASS | Mỗi dòng net = gross - hoa hồng; tổng dòng = tổng bảng | GET /admin/hotel-payouts/:id | đúng cả 2 bảng | true,true |
| PO-07 | PASS | Đối soát 3 chiều: Σ bảng kê(payer) − Σ chi trả KS(net) − Σ hoa hồng = tiền xe Airrest giữ | tổng hợp VNA+VJ T10 vs HAN-01+HAN-02 | 2,203,332 − 1,724,000 − 209,332 = 270,000; Σ hoa hồng 2 phía bằng nhau | payer=2203332 hotelNet=1724000 comm=209332/209332 shuttle=270000 |
| PO-08 | PASS | Bảng chi trả không chứa dữ liệu simulated / hủy / chờ / kỳ khác | đếm tổng dòng T10 | 5 dòng (VNA:4 gồm 3 KS... = H1:3+1 VJ, H2:1) | lines=5 |
| PO-09 | PASS | Generate lặp không đổi version | generate lần nữa | version bằng lần trước | v 2/2 |
| PO-10 | PASS | Idempotency generate: cùng key trả replay | 2 lần cùng key | Idempotent-Replay: true | true |
| PO-11 | PASS | Danh sách: SUPPORT đọc được (admin:payment:read), lọc hotelId/status/period | GET ?hotelId&status=DRAFT&period | 200, 1 bảng | n=1 |
| PO-12 | PASS | Tham số lọc sai | status=PAYED, period=2026-1, hotelId=x | 422 | 422,422,422 |
| PO-13 | PASS | Chi tiết id lạ -> 404; id sai định dạng -> 422 | GET /:id | 404 / 422 | 404,422 |
| PO-14 | PASS | IDOR: chủ KS (HAN-01), lễ tân, chủ HAN-02 đọc bảng chi trả qua API admin | GET /admin/hotel-payouts/:idHAN01 bởi chu.han01, letan.han01, chu.han02 | 403 cả 3 | 403,403,403 |
| PO-15 | PASS | Payer không đọc bảng chi trả KS (lộ giá net/hoa hồng) | dv.vna GET /admin/hotel-payouts | 403 | 403 FORBIDDEN |
| PO-16 | **FAIL** | Khách sạn xem bảng chi trả của chính mình (API hotel-side) | GET /hotel/payouts, /hotel/settlements, /hotel/stats?payouts bằng chu.han01 | tồn tại endpoint hotel đọc payout (200) và chỉ thấy của HAN-01 | 404,404,404 (cả ba đường dẫn đều 404: chưa có API/UI cho khách sạn xem payout) |
| PO-17 | PASS | Khóa chi trả bởi SUPPORT/OPS/payer | lock bởi sup, ops, dv.vna | 403 | 403,403,403 |
| PO-18 | PASS | Ghi nhận đã trả khi chưa khóa (DRAFT) | finance1 POST paid {paymentRef} | 409 PAYOUT_NOT_LOCKED | 409 PAYOUT_NOT_LOCKED |
| PO-19 | PASS | Double submit khóa: 5 request song song | 5x lock H1 | 1x200 + 4x409; LOCKED | 200,409,409,409,409 LOCKED |
| PO-20 | PASS | Tạo lại bảng đã LOCKED không đổi số | generate 2026-10 sau khi H1 LOCKED | H1 vẫn LOCKED, net không đổi | LOCKED 1024000 |
| PO-21 | PASS | paymentRef không hợp lệ | paid {paymentRef:"ab"}, {}, +field lạ | 422 x3 | 422,422,422 |
| PO-22 | PASS | Double submit ghi nhận đã trả: 5 request song song | 5x paid cùng paymentRef | 1x200 + 4x409; PAID, paid_by=finance1, payment_ref lưu | 200,409,409,409,409 PAID |
| PO-23 | PASS | Ghi nhận trả lần nữa | paid khi đã PAID | 409 PAYOUT_NOT_LOCKED | 409 PAYOUT_NOT_LOCKED |
| PO-24 | PASS | Khóa lại bảng đã PAID | lock khi PAID | 409 PAYOUT_NOT_DRAFT | 409 PAYOUT_NOT_DRAFT |
| PO-30 | PASS | Điều chỉnh kỳ chưa khóa / chưa có bảng | adjust HAN-02 kỳ 2026-10 khi DRAFT | 409 PERIOD_NOT_LOCKED | 409 PERIOD_NOT_LOCKED |
| PO-31 | PASS | FINANCE điều chỉnh (thiếu payer:manage) | fin POST adjustments | 403 | 403 FORBIDDEN |
| PO-32 | PASS | Điều chỉnh với số tiền 0 | amountVnd=0 | 422 | 422 VALIDATION_ERROR |
| PO-33 | PASS | Điều chỉnh với số thập phân | amountVnd=2.5 | 422 | 422 VALIDATION_ERROR |
| PO-34 | PASS | Điều chỉnh với số dạng chuỗi | amountVnd=1000 | 422 | 422 VALIDATION_ERROR |
| PO-35 | PASS | Điều chỉnh với vượt an toàn | amountVnd=1000000000000000000 | 422 | 422 INVALID_AMOUNT |
| PO-36 | **FAIL** | Điều chỉnh: bookingId không tồn tại (FK) phải trả 4xx, không 500 | adjust bookingId uuid lạ | 404/409/422 | 500 INTERNAL_ERROR |
| PO-37 | PASS | Điều chỉnh HAN-02 -800,000 sau khóa -> sang kỳ 2026-11, T10 giữ nguyên | adjust (truy thu KS) | 201; T10 net 700,000 LOCKED; T11 DRAFT net -800,000 | 201 T10=700000/LOCKED T11={"id":"3dd1fb9a-123d-42f2-aff1-77c55183b497","netVnd":"-800000","status":"DRAFT","lineCount":1} |
| PO-38 | PASS | Chi trả số tiền âm bị chặn | lock T11 HAN-02 rồi paid | 409 PAYOUT_NOT_PAYABLE | 409 PAYOUT_NOT_PAYABLE |
| PO-39 | PASS | Điều chỉnh kỳ đã PAID (HAN-01) -> sang kỳ kế DRAFT | adjust HAN-01 T10 +50,000 | 201; dòng ADJUSTMENT ở 2026-11 của HAN-01 (T10 PAID giữ nguyên) | 201 T10=PAID/1024000 |
| PO-40 | PASS | Audit chi trả KS đầy đủ | GET audit entityType=hotel_payout | GENERATE/LOCK/PAID/ADJUST | HOTEL_PAYOUT.ADJUST,HOTEL_PAYOUT.LOCK,HOTEL_PAYOUT.PAID,HOTEL_PAYOUT.GENERATE |
| PO-41 | PASS | Audit PAID có paymentRef và actor finance1 | audit HOTEL_PAYOUT.PAID | actor.id = finance1 | {"id":"575f793d-8d37-4192-a9a8-af12c5528b2b","type":"ADMIN"} |
| PO-50 | PASS | CSV: tên đơn vị bắt đầu bằng "=" bị vô hiệu công thức | tạo payer name "=1+1+cmd" -> generate -> CSV | ô TOTAL memo bắt đầu bằng '= | TOTAL,,,,,0,0,'=1+1+cmd\|calc 2026-10 (DRAFT) |

### D.Email outbox

| ID | Kết quả | Case | Input | Expected | Actual |
|---|:--:|---|---|---|---|
| EM-01 | PASS | Offer PENDING: chưa có email nào trong outbox, kể cả sau khi worker chạy | đếm email_outbox của booking offer A (đợi 12s cho worker 10s/lần) | 0 thư | offerA=0 tổng outbox=10 |
| EM-02 | PASS | Xác nhận không token / token khách / payer | POST /hotel/delay-offers/:id/confirm | 401 / 403 / 403 | 401,403,403 |
| EM-03 | PASS | IDOR: khách sạn HAN-02 xác nhận offer của HAN-01 | chu.han02 confirm offer A | 404/403, offer vẫn PENDING, không có thư | 404 OFFER_NOT_FOUND offer=PENDING |
| EM-04 | PASS | Validation roomNumbers: rỗng / thiếu / field lạ / chuỗi rỗng | confirm với body sai | 422 x4, vẫn PENDING, 0 thư | 422,422,422,422 PENDING |
| EM-05 | PASS | Số phòng không khớp số lượng (offer qty=1, gửi 3 phòng) | confirm roomNumbers 3 phần tử | 4xx, vẫn PENDING, 0 thư | 422 ROOM_NUMBERS_MISMATCH offer=PENDING |
| EM-06 | PASS | Từ chối offer: không sinh email | chu.han01 reject offer REJ rồi đợi worker | 0 thư cho booking REJ, offer REJECTED | 200 offer=REJECTED mails=0 |
| EM-07 | PASS | Double submit: 5 request xác nhận song song | 5x confirm offer A phòng 305 | 1x200 + 4x409; đúng 3 thư (2 room-confirmed + 1 group-summary), không trùng | 200,409,409,409,409 mails=3 {"room-confirmed":2,"group-summary":1} |
| EM-08 | PASS | Người nhận đúng: mỗi hành khách có email 1 thư, đại diện nhận thêm tổng hợp | đọc outbox offer A | rep.mail@ (room-confirmed + group-summary), pax.mail@ (room-confirmed) | group-summary:rep.mail@example.com \| room-confirmed:pax.mail@example.com \| room-confirmed:rep.mail@example.com |
| EM-09 | PASS | Nội dung thư: có số phòng 305, tên KS, mã đơn; thư CHỈ ghi nhận SAU thời điểm xác nhận | so created_at thư với responded_at của offer | created_at >= responded_at; body chứa 305 + tên KS Sao Mai | responded=2026-11-16T02:09:14.144Z first mail=2026-11-16T02:09:14.325Z |
| EM-10 | PASS | Idempotent: xác nhận lại không sinh thêm thư | confirm lần 6 sau đó | 409, số thư vẫn 3 | 409 INVALID_STATE mails=3 |
| EM-11 | PASS | Worker xử lý outbox: thư chuyển PENDING -> SENT (transport dev = ghi log, không gửi SMTP thật) | đợi worker rồi đọc status | cả 3 thư SENT, attempts=1, sent_at có giá trị | SENT/1,SENT/1,SENT/1 (lưu ý: SMTP_URL không đặt nên SENT = đã ghi log, chưa phát SMTP thật) |
| EM-12 | PASS | XSS: tên hành khách <script> không lọt nguyên văn vào body_html | confirm offer XSS, đọc body_html | body_html không chứa "<script>"; chứa &lt;script&gt; | 200 mails=2 htmlHasScript=false escaped=true |
| EM-13 | PASS | Thư không lộ dữ liệu nhạy cảm (giá hợp đồng/hoa hồng) | quét body 3 thư offer A | không chứa "hoa hồng", "commission", "hợp đồng", số tiền bảng kê | ok |
| EM-14 | PASS | Payer gửi lại email xác nhận (resend) khi chưa xác nhận bị chặn | dv.vna resend pax của offer REJ | 409 OFFER_NOT_CONFIRMED hoặc 404/403 | 409 OFFER_NOT_CONFIRMED |
| EM-15 | PASS | Payer gửi lại email sau khi đã xác nhận: giới hạn 3 lần/giờ | dv.vna resend 4 lần cho pax.mail | 3 lần đầu 200, lần 4 là 429 RESEND_LIMIT | 200,200,200,429 |
| EM-16 | PASS | IDOR: payer VJ gửi lại email của pax thuộc VNA | dv.vj resend pax.mail | 404 | 404 PASSENGER_NOT_FOUND |
| EM-17 | PASS | Không có API đọc outbox cho người ngoài (admin/hotel/payer) | GET /admin/email-outbox, /admin/emails | 404 | 404,404,404 |

### E.UI Playwright

| ID | Kết quả | Case | Input | Expected | Actual |
|---|:--:|---|---|---|---|
| UI-sysadmin1-login | PASS | Đăng nhập UI sysadmin1 | Nhập email + mật khẩu, bấm Đăng nhập | vào cổng quản trị, không lỗi | tabs=dashboard,hotels,bookings,support,accounts,configs,flights,payments,audit |
| UI-sysadmin1-tabs | PASS | Menu hiển thị đúng quyền (sysadmin1) | so sánh danh sách tab với ma trận quyền | dashboard,hotels,bookings,support,accounts,configs,flights,payments,audit | dashboard,hotels,bookings,support,accounts,configs,flights,payments,audit |
| UI-sysadmin1-dashboard | PASS | Tab "dashboard" (sysadmin1) tải được, không lỗi console/API | click tab-dashboard, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=736 |
| UI-sysadmin1-hotels | PASS | Tab "hotels" (sysadmin1) tải được, không lỗi console/API | click tab-hotels, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=1609 |
| UI-sysadmin1-bookings | PASS | Tab "bookings" (sysadmin1) tải được, không lỗi console/API | click tab-bookings, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=3045 |
| UI-sysadmin1-support | PASS | Tab "support" (sysadmin1) tải được, không lỗi console/API | click tab-support, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=2616 |
| UI-sysadmin1-accounts | PASS | Tab "accounts" (sysadmin1) tải được, không lỗi console/API | click tab-accounts, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=2553 |
| UI-sysadmin1-configs | PASS | Tab "configs" (sysadmin1) tải được, không lỗi console/API | click tab-configs, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=2175 |
| UI-sysadmin1-flights | PASS | Tab "flights" (sysadmin1) tải được, không lỗi console/API | click tab-flights, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=3240 |
| UI-sysadmin1-payments | PASS | Tab "payments" (sysadmin1) tải được, không lỗi console/API | click tab-payments, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=203 |
| UI-sysadmin1-audit | PASS | Tab "audit" (sysadmin1) tải được, không lỗi console/API | click tab-audit, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=1640 |
| UI-sysadmin1-hidden | PASS | Tab ngoài quyền không có trong DOM (sysadmin1) | payerStatements,payerDelay | không có phần tử tab-* | 0,0 |
| UI-ops1-login | PASS | Đăng nhập UI ops1 | Nhập email + mật khẩu, bấm Đăng nhập | vào cổng quản trị, không lỗi | tabs=dashboard,hotels,bookings,configs,flights |
| UI-ops1-tabs | PASS | Menu hiển thị đúng quyền (ops1) | so sánh danh sách tab với ma trận quyền | dashboard,hotels,bookings,configs,flights | dashboard,hotels,bookings,configs,flights |
| UI-ops1-dashboard | PASS | Tab "dashboard" (ops1) tải được, không lỗi console/API | click tab-dashboard, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=736 |
| UI-ops1-hotels | PASS | Tab "hotels" (ops1) tải được, không lỗi console/API | click tab-hotels, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=1593 |
| UI-ops1-bookings | PASS | Tab "bookings" (ops1) tải được, không lỗi console/API | click tab-bookings, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=3037 |
| UI-ops1-configs | PASS | Tab "configs" (ops1) tải được, không lỗi console/API | click tab-configs, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=2355 |
| UI-ops1-flights | PASS | Tab "flights" (ops1) tải được, không lỗi console/API | click tab-flights, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=3240 |
| UI-ops1-hidden | PASS | Tab ngoài quyền không có trong DOM (ops1) | accounts,payerStatements,payerDelay | không có phần tử tab-* | 0,0,0 |
| UI-support1-login | PASS | Đăng nhập UI support1 | Nhập email + mật khẩu, bấm Đăng nhập | vào cổng quản trị, không lỗi | tabs=dashboard,hotels,bookings,support,configs,payments,audit |
| UI-support1-tabs | PASS | Menu hiển thị đúng quyền (support1) | so sánh danh sách tab với ma trận quyền | dashboard,hotels,bookings,support,configs,payments,audit | dashboard,hotels,bookings,support,configs,payments,audit |
| UI-support1-dashboard | PASS | Tab "dashboard" (support1) tải được, không lỗi console/API | click tab-dashboard, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=736 |
| UI-support1-hotels | PASS | Tab "hotels" (support1) tải được, không lỗi console/API | click tab-hotels, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=1593 |
| UI-support1-bookings | PASS | Tab "bookings" (support1) tải được, không lỗi console/API | click tab-bookings, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=3037 |
| UI-support1-support | PASS | Tab "support" (support1) tải được, không lỗi console/API | click tab-support, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=2616 |
| UI-support1-configs | PASS | Tab "configs" (support1) tải được, không lỗi console/API | click tab-configs, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=2385 |
| UI-support1-payments | PASS | Tab "payments" (support1) tải được, không lỗi console/API | click tab-payments, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=187 |
| UI-support1-audit | PASS | Tab "audit" (support1) tải được, không lỗi console/API | click tab-audit, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=1623 |
| UI-support1-hidden | PASS | Tab ngoài quyền không có trong DOM (support1) | accounts,payerStatements,payerDelay | không có phần tử tab-* | 0,0,0 |
| UI-finance1-login | PASS | Đăng nhập UI finance1 | Nhập email + mật khẩu, bấm Đăng nhập | vào cổng quản trị, không lỗi | tabs=dashboard,hotels,bookings,configs,payments,audit |
| UI-finance1-tabs | PASS | Menu hiển thị đúng quyền (finance1) | so sánh danh sách tab với ma trận quyền | dashboard,hotels,bookings,configs,payments,audit | dashboard,hotels,bookings,configs,payments,audit |
| UI-finance1-dashboard | PASS | Tab "dashboard" (finance1) tải được, không lỗi console/API | click tab-dashboard, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=736 |
| UI-finance1-hotels | PASS | Tab "hotels" (finance1) tải được, không lỗi console/API | click tab-hotels, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=1593 |
| UI-finance1-bookings | PASS | Tab "bookings" (finance1) tải được, không lỗi console/API | click tab-bookings, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=3022 |
| UI-finance1-configs | PASS | Tab "configs" (finance1) tải được, không lỗi console/API | click tab-configs, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=2340 |
| UI-finance1-payments | PASS | Tab "payments" (finance1) tải được, không lỗi console/API | click tab-payments, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=203 |
| UI-finance1-audit | PASS | Tab "audit" (finance1) tải được, không lỗi console/API | click tab-audit, chờ tải, chụp ảnh | không API 4xx/5xx, không console error, không pageerror, có nội dung | bad=[] console=[] page=[] textLen=1632 |
| UI-finance1-hidden | PASS | Tab ngoài quyền không có trong DOM (finance1) | accounts,payerStatements,payerDelay | không có phần tử tab-* | 0,0,0 |
| UI-XSS-accounts | PASS | XSS: tên tài khoản <img onerror> hiển thị dạng text, không thực thi | mở tab Tài khoản, tìm "img src=x" | không có hộp thoại alert, không có thẻ img[src=x] được chèn; văn bản hiện nguyên | img[src=x]=0 dialogs=0 chứaChuỗi=true |
| UI-XSS-hotels | PASS | Tab Khách sạn: tên có dấu nháy/SQL hiển thị nguyên văn | mở tab Khách sạn | không lỗi; không dialog | dialogs=0 |
| UI-SYS-logout | PASS | Đăng xuất | bấm logout | quay về màn không đăng nhập, API admin sau đó 401 | Về trang đăng nhập (#/login), header hiện "Đăng nhập" (chạy lại độc lập, e2.mjs) |
| UI-PAYER-tabs | PASS | Payer cấp đơn vị chỉ thấy tab Delay + Bảng kê | đăng nhập dv.vna | payerDelay,payerStatements | payerDelay,payerStatements |
| UI-PAYER-list | PASS | Danh sách bảng kê chỉ có kỳ 2026-10 của VNA (SENT), không có bản nháp | mở tab Bảng kê tháng | 1 dòng 2026-10, tổng 2.003.332 | Quản trị Bảng kê tháng Bảng kê tháng Bảng kê Airrest gửi cho đơn vị của bạn. Bảng kê nháp chưa hiển thị. Kỳ Trạng thái Tổng tiền Số dòng Gửi lúc Hạn khiếu nại 2026-10 Đã gửi 2.003.332đ 6 09:04:44 16/11/2026 09:04:44 21/1 |
| UI-PAYER-detail | PASS | Chi tiết: tổng 2.003.332, 6 dòng, không hiển thị hoa hồng | mở chi tiết | có "Tổng cộng: 2.003.332", không chữ "hoa hồng"/commission | rows=6 không lộ |
| UI-PAYER-csv | PASS | Tải CSV | bấm Tải CSV | tải được file .csv, không lỗi | bang-ke.csv ﻿kind,booking_code,group_code,flight_code,hotel,amount_vnd,memo |
| UI-PAYER-dispute-short | PASS | Khiếu nại lý do quá ngắn: báo lỗi phía client, không gọi API | mở form, nhập "ab", gửi | hiện thông báo lỗi, không có POST /dispute | posted=false |
| UI-PAYER-dispute-xss | PASS | Khiếu nại với payload XSS: gửi được, hiển thị escape, không thực thi | nhập <img src=x onerror=alert(1)> Sai tiền, gửi; bấm 2 lần liên tiếp (double submit) | DISPUTED; đúng 1 POST /dispute thành công; không dialog | posts=200 img=0 dialogs=0 hiểnThịLýDo=true |
| UI-PAYER-console | PASS | Payer: không console error/pageerror (trừ 409 hợp lệ khi bấm đúp) | tổng kết phiên payer | pageerror=0 | console=[] page=[] bad=[] |
| UI-PAYER-VJ | PASS | IDOR trên UI: payer VJ không thấy bảng kê VNA (và bản nháp VJ) | dv.vj mở Bảng kê tháng | trạng thái trống "Chưa có bảng kê" | Quản trị Bảng kê tháng Bảng kê tháng Bảng kê Airrest gửi cho đơn vị của bạn. Bảng kê nháp chưa hiển thị. Chưa có bảng kê Chưa có bảng kê nào được gửi cho đơn vị |
| UI-GAP-admin-settle | **FAIL** | Admin có màn tạo/gửi/khóa bảng kê tháng và chi trả KS (UI) | xem menu sysadmin1/finance1 | có tab quản trị bảng kê / chi trả KS / đơn vị chi trả | KHÔNG có tab nào (menu admin chỉ: tổng quan, KS, đơn, hỗ trợ, tài khoản, cấu hình, chuyến bay, thanh toán, nhật ký). Các API /admin/payers, /admin/payer-statements, /admin/hotel-payouts chưa có UI; khách sạn cũng chưa có màn xem chi trả. |

