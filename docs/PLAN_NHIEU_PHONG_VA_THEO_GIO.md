# Kế hoạch: đặt nhiều loại phòng và đặt theo giờ

## Giai đoạn 1: một đơn nhiều loại phòng (đã làm backend, không migration)

Hợp đồng chi tiết: `backend/README.md` (mục "Đơn nhiều loại phòng") và `backend/api/openapi.ts`.

Request `POST /v1/bookings` (Idempotency-Key bắt buộc như cũ):
```json
{ "hotelId": "...", "from": "2026-12-01T14:00:00Z", "to": "2026-12-03T12:00:00Z", "guests": 5, "children": 1,
  "rooms": [{ "roomTypeId": "<Standard>", "qty": 2 }, { "roomTypeId": "<Deluxe>", "qty": 1 }],
  "paymentMethod": "AT_HOTEL", "guest": { "fullName": "A", "phone": "0912345678" } }
```
Response `booking.lines[]` = `{ lineNo, roomTypeId, roomTypeName, qty, unitPriceVnd, subtotalVnd }`; tóm tắt cũ `roomTypeName` ("Standard +1 loại khác") và `qty` (tổng phòng).
Lỗi: 409 `SOLD_OUT` + `details.soldOut[]` (cả đơn bị từ chối), 422 `GUESTS_EXCEED_CAPACITY` (`details.maxGuests` = Σ capacity × qty), 422 trùng `roomTypeId` / gửi lẫn `rooms` với `roomTypeId`, 404 `ROOM_TYPE_NOT_FOUND`.
Quy tắc: 1..10 dòng, qty 1..5 mỗi dòng, chung ngày + chung số khách; tổng = Σ dòng + xe + phí dịch vụ trên (phòng + xe); hủy/reject/expire/đổi ngày áp dụng cho cả đơn; input cũ `roomTypeId` + `qty` vẫn chạy.

## Giai đoạn 2: đặt theo giờ (đã làm toàn luồng, không migration)

Hợp đồng chi tiết: `backend/README.md` (mục "Đặt phòng theo giờ") và `backend/api/openapi.ts`.
- Cấu hình theo loại phòng trong `room_types.pricing.hourly` (`firstHourVnd`, `nextHourVnd`, `minHours`, `maxHours`, `cleaningMin`, `openFromHour/openToHour` tùy chọn). Giá = giờ đầu + (giờ − 1) × giờ tiếp theo, nhân số phòng.
- `rooms:[{roomTypeId, qty, kind?:'NIGHT'|'HOURLY', startsAt?, hours?}]`; đơn trộn đêm + giờ (`stay.type` NIGHT | HOURLY | MIXED); tồn chặn `[giờ vào, giờ ra + dọn phòng)`, cùng thứ tự khóa id.
- Xe bám giờ đến của đơn, hủy/hoàn/phí xe theo tổng dòng như cũ. Đổi ngày đơn có dòng giờ chưa hỗ trợ (422 `CHANGE_NOT_SUPPORTED_HOURLY`).
- Giao diện: công tắc Đêm | Giờ trên dòng phòng (#/stays), giỏ trộn, hotel portal (form loại phòng, chi tiết đơn), tra cứu, chatbot. Đặt đơn giờ 5 lần bấm từ danh sách đến xác nhận.
- Chưa làm: đổi giờ vào, gợi ý khách sạn thay thế theo giờ, lịch tồn theo giờ (màn tồn phòng vẫn theo ngày, đỉnh đồng thời đã tính cả đơn giờ).
