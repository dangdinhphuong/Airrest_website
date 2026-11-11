# Airrest — chỉ mục kế hoạch các luồng còn lại

Ngày: 2026-11-11 · Trạng thái: **chờ duyệt** (chưa chạy task nào)
Thiết kế gốc: [../specs/2026-11-11-airrest-remaining-flows-design.md](../specs/2026-11-11-airrest-remaining-flows-design.md)

## 1. Ba plan

| Plan | Nội dung | Task | Migration |
|---|---|---|---|
| [Plan 1](2026-11-11-plan-1-rooms-and-booking-ops.md) | Quản lý phòng (CRUD loại phòng, tồn theo ngày, khóa phòng); xác nhận/từ chối booking, gợi ý khách sạn thay thế, hết hạn chờ xác nhận, admin xem toàn bộ booking | 12 | 003, 004 |
| [Plan 2](2026-11-11-plan-2-requests-support-shuttle.md) | Yêu cầu đổi/hủy + phí hủy; hỗ trợ (ticket); xe đưa đón; FE khách và nhân sự | 13 | 005, 006, 007 |
| [Plan 3](2026-11-11-plan-3-flights-dashboard-fe.md) | Chuyến bay (tra cứu, admin sửa); dashboard; nối FE–API xuyên suốt; test E2E; dọn mock | 12 | 008 |

Thanh toán VNPay tạm dừng nên không nằm trong plan nào.

## 2. Thứ tự thực hiện đề xuất

1. **Nền chung (làm một lần):** `packages/api-client` + đăng nhập FE thật + giữ token. Hiện **ba plan cùng định nghĩa phần này** (Plan 1 Task 5, Plan 2 Task 10, Plan 3 Task 7–8). Chỉ giữ một: Plan 1 Task 5 là chủ; Plan 2 Task 10 và Plan 3 Task 7–8 chỉ được *mở rộng* nó, không tạo lại.
2. **Plan 1** (Task 1–4 phòng, rồi Task 7–11 booking). Đây là lõi, các plan khác phụ thuộc.
3. **Plan 2** sau Plan 1 Task 9 (cần trạng thái booking và nhả phòng). Task hỗ trợ và xe (6–9) độc lập, làm song song được.
4. **Plan 3** Task 1–4 (chuyến bay) làm song song được ngay từ đầu. Task 5 (dashboard) làm sau Plan 1–2 vì đọc bảng của chúng.
5. FE từng luồng nối sau khi BE luồng đó xong; Plan 3 Task 11–12 (dọn mock, E2E) làm cuối.

## 3. Điểm trùng/lệch giữa các plan (tôi đã đối chiếu)

| # | Vấn đề | Đề xuất |
|---|---|---|
| a | `api-client` và đăng nhập FE bị định nghĩa ba lần | Xem mục 2.1. |
| b | **Lệnh hoàn tiền chờ:** Plan 1 đặt `due_at='infinity'`, Plan 2 đặt `now + 24h`. Với Plan 2, đối soát tay sau 24h sẽ **gọi cổng thanh toán thật**, trái ý "thanh toán tạm dừng" | Dùng `'infinity'` ở cả hai plan. Lệnh hoàn chỉ chạy khi luồng thanh toán được mở lại và có bước kích hoạt. Cần sửa Plan 2 Task 4/5. |
| c | Tên mã quyền, mã trạng thái, tên route giữa Plan 1–2 và Plan 3 Task 5/12 | Task 5 và Task 12 của Plan 3 phải đối chiếu schema thật sau khi Plan 1–2 merge (đã ghi trong plan). |
| d | `hotel:scope:all` chỉ SYSADMIN có; OPS/SUPPORT/FINANCE bị 403 khi xem booking toàn hệ thống | Xem câu hỏi 5 bên dưới. |
| e | Số migration | 003–004 / 005–007 / 008, không trùng. |

## 4. Câu hỏi cần bạn quyết (theo mức ảnh hưởng)

1. **Duyệt tay mặc định:** khách sạn mới mặc định bật duyệt tay vĩnh viễn, hay giới hạn 90 ngày theo SRS (OQ-2-02)? Đề xuất: **vĩnh viễn** cho đến khi khách sạn tắt (đúng yêu cầu "lễ tân phải xác nhận").
2. **Hủy booking:** khách sạn duyệt mọi yêu cầu hủy (theo spec), hay khách tự hủy ngay trong khung miễn phí (theo SRS FR-CXL-02)? Đề xuất: **khách sạn duyệt**, như bạn đã chốt "phải xác nhận".
3. **Giá khi đổi ngày:** giữ giá gốc + chênh lệch (spec D3) hay dùng giá hiện tại của phòng mới (SRS BR-CXL-07)? Đề xuất: **theo spec D3**.
4. **Phí hủy:** thêm khóa cấu hình `cancellation.fee` với giá trị mặc định theo BA §5 (Linh hoạt miễn phí đến 2 giờ; Tiêu chuẩn miễn phí ≥24 giờ, 24→2 giờ giữ 50%, dưới 2 giờ giữ 100%; Không hoàn giữ 100%), phí dịch vụ không hoàn. Bạn đồng ý chứ?
5. **Admin xem toàn bộ booking:** cấp `hotel:scope:all` cho OPS/SUPPORT/FINANCE, hay thêm mã quyền mới `admin:booking:read`? Đề xuất: **thêm `admin:booking:read`** (rõ ràng, ít ảnh hưởng chỗ khác).
6. **Realtime:** FE chưa có client Socket.io, "lễ tân thấy đơn realtime" mới ở mức nút Làm mới. Có thêm một task Socket.io cho FE không? Đề xuất: **có**, một task nhỏ cuối Plan 1.
7. **Phạm vi FE:** hiện FE là mock theo mô hình khác (8 vai trò, giờ mô phỏng, đặt không SĐT). Các plan chỉ nối khu vực khách sạn/admin và các màn có API. Màn khách và `PickupsTab`, `MonitorTab`, `QualityTab` vẫn mock gắn nhãn "Mô phỏng". Đồng ý, hay cần plan riêng dựng lại FE khách?
8. **Phụ trợ nhỏ (tôi sẽ chọn mặc định nếu bạn không phản đối):** `room_blocks` bảng mới theo spec; confirm/reject dùng `POST`; tra cứu ticket bằng `POST /support/lookup` (SĐT không nằm trên URL); giá xe lưu riêng, không cộng vào tổng đơn; trạng thái xe 4 mốc; chuyến bay có tham số `?date=`; ngưỡng trễ `>` theo cấu hình.

## 5. Rủi ro đã biết
- Plan viết khi chưa chạy code: số dòng ở mục "Modify" là ước lượng, người thực hiện kiểm lại bằng `rg`.
- `strictRateLimit` dùng chung một bộ đếm 10 lần/phút/IP cho nhiều route khách, dễ chạm 429 khi thao tác liên tục.
- Tên bảng/route giữa các plan chưa được kiểm chéo bằng code, chỉ bằng đọc.
- FE không có test runner, nghiệm thu FE bằng `build:web` và kịch bản thủ công.

## 6. Cách thực hiện
Sau khi bạn duyệt, chọn một: **Subagent-driven** (mỗi task một agent + một reviewer, kỹ nhất, tốn nhất) hoặc **Native** (tôi làm từng task trong phiên này, một lượt review cuối, rẻ và nhanh hơn).
