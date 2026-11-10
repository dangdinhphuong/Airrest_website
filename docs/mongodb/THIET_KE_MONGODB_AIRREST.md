# Thiết kế cơ sở dữ liệu MongoDB — Nền tảng Airrest (v1.0-draft)

Ngày: 2026-11-09 · Căn cứ: [SRS_V2_NenTang_Airrest.md](../srs/SRS_V2_NenTang_Airrest.md) (v2.3) và [BA_PHAN_TICH_NGHIEP_VU_V2.md](../srs/BA_PHAN_TICH_NGHIEP_VU_V2.md) · Công nghệ theo tài liệu gốc: Node.js + Socket.io + MongoDB.

> **Chưa kiểm chứng:** schema, index và pipeline trong tài liệu này viết tay, **chưa chạy thử trên MongoDB thật**. Cần chạy script khởi tạo trên môi trường dev, đo `explain()` với dữ liệu giả lập trước khi chốt. Các con số quy mô là giả định.
> **Phạm vi:** thiết kế dữ liệu (collection, trường, index, ràng buộc, giao dịch, vòng đời dữ liệu). Không gồm code ứng dụng.

---

## 1. Yêu cầu nền tảng quyết định thiết kế

| # | Yêu cầu từ nghiệp vụ | Hệ quả thiết kế |
|---|---|---|
| R1 | **Không bán vượt tồn** (NFR-03, FR-BKG-10), bán cả **theo giờ và theo đêm** (BA §3.2) | Tồn tính theo **khoảng thời gian**, không theo ngày; kiểm tra + ghi trong **một transaction** có khóa tuần tự theo loại phòng (mục 5.1) |
| R2 | **Tiền chính xác, không sai số**, đối soát 1–1 (NFR-10) | Số tiền là số nguyên VND (`NumberLong`), sổ cái **chỉ thêm** (`ledger_entries`), không dùng số thực |
| R3 | **Idempotent** cho thanh toán, hoàn, hủy (FR-PAY-03, BR-CXL-12) | Khóa duy nhất theo `momo.orderId`, `idempotencyKey`, `refund.key`; callback lặp không sinh bản ghi thứ hai |
| R4 | **Thời gian thực**: tồn phòng, trạng thái đơn, vị trí xe (NFR-02) | Replica set + **Change Streams** → Socket.io; vị trí xe dùng time-series, throttle 5–10 giây |
| R5 | **Tìm khách sạn gần sân bay**, sắp theo khoảng cách | `2dsphere` + khoảng cách sân bay tính sẵn trong `hotels.airports[]` |
| R6 | **Khóa giá tại thời điểm đặt** (BA §10), đổi cấu hình không ảnh hưởng đơn cũ | Mỗi đơn lưu **ảnh chụp** giá, chính sách hủy, tham số (`pricing`, `policySnapshot`) |
| R7 | **Truy vết bất biến** (FR-ADM-09), lưu 24 tháng + lưu trữ ≥ 5 năm | `audit_logs` chỉ thêm; DB role không có quyền sửa/xóa; chuỗi băm tùy chọn |
| R8 | **Dữ liệu nhạy cảm** (CCCD, tài khoản ngân hàng) và hạn lưu vết vị trí (NFR-04, OQ-2-09) | Mã hóa cấp trường (CSFLE/Queryable Encryption), TTL cho dữ liệu vị trí/OTP/phiên |
| R9 | **Hai phía xem cùng một đơn** (khách vãng lai, khách sạn, admin) với quyền khác nhau | Đơn tham chiếu `hotelId` ở gốc để lọc quyền; thông tin liên lạc khách sạn ẩn đến sau xác nhận (lọc ở tầng API) |
| R10 | Đơn trải qua nhiều bước (hủy/đổi/hoàn/tranh chấp) | Bộ **máy trạng thái** bảo vệ bằng cập nhật có điều kiện (`findOneAndUpdate` lọc trạng thái hiện tại) + `v` (optimistic) |

Yêu cầu hạ tầng: **MongoDB ≥ 6.0 chạy replica set** (transaction, change streams, time-series, TTL). Bản thử một nút không dùng được cho tính năng đặt phòng.

---

## 2. Phân tích tính năng → mẫu truy cập → quyết định lưu trữ

Cột "Nhất quán": **T** = cần transaction nhiều tài liệu; **A** = một tài liệu nguyên tử đủ; **E** = chấp nhận nhất quán sau cùng.

| Mô-đun / FR | Đọc chính | Ghi chính | Nhất quán | Quyết định |
|---|---|---|---|---|
| **FLT** tra cứu chuyến bay (FLT-01…07) | Tra theo (mã chuyến, ngày) rất nhiều lần, trùng lặp | Ghi cache; theo dõi chuyến cho đơn đang hoạt động | E | `flight_cache` có TTL (tránh gọi vendor lặp); `flight_watches` cho đơn cần cập nhật; sân bay tĩnh ở `airports` |
| **SRC** tìm khách sạn (SRC-01…08) | Quét theo vị trí/sân bay, lọc giá/tiện ích, **tính tồn theo khoảng thời gian** — đọc nặng nhất hệ thống | Hiếm (khách sạn sửa) | E (hiển thị) → T (lúc đặt) | `hotels` + `room_types` tách riêng; tìm kiếm tính tồn bằng aggregate trên `room_reservations`; kiểm tra lại chắc chắn trong transaction lúc đặt |
| **SRC-05** đánh giá | Đọc theo khách sạn, sắp theo thời gian | Ghi sau check-out, 1 đơn 1 đánh giá | A | `reviews` riêng; điểm trung bình giữ sẵn trong `hotels.rating` |
| **BKG** đặt phòng (BKG-01…11) | Tra theo mã đơn, SĐT, userId; hàng đợi theo hạn | Tạo đơn + giữ chỗ + (tạo thanh toán) | **T** | `bookings` (tài liệu lớn, có nhúng dòng phòng, ảnh chụp giá, lịch sử trạng thái) + `room_reservations` (đơn vị tính tồn) |
| **PAY** thanh toán (PAY-01…07) | Theo đơn; đối soát theo ngày | Callback MoMo lặp, đổi trạng thái | **T** + idempotent | `payments` (1 đơn nhiều giao dịch: thanh toán, thu thêm khi đổi), `ledger_entries` ghi sổ |
| **SHT** xe (SHT-01…08) | Hàng đợi chưa phân theo giờ đón; xe/đơn của tài xế; theo dõi theo khách | Cập nhật trạng thái chặng; vị trí mỗi 5–10 s | A (chặng), E (vị trí) | **Mỗi chặng là một tài liệu** (`shuttle_legs`) vì truy vấn theo chặng; vị trí vào time-series `vehicle_locations`, vị trí mới nhất nhúng ở `drivers` |
| **USR** hồ sơ (USR-01…07) | Theo SĐT/userId | Hợp nhất đơn vãng lai theo SĐT | A | `users` (yêu thích nhúng — giới hạn 200), `otp_sessions`, `sessions` |
| **NTF** thông báo (NTF-01…04) | Danh sách theo người nhận | Sinh khối lượng lớn, gửi lại | E | `notifications` (TTL 180 ngày) + `outbox_events` (gửi tin đáng tin cậy) |
| **SUP** hỗ trợ (SUP-01…06) | Hàng đợi theo trạng thái/SLA; lịch sử tin nhắn | Tin nhắn tăng không giới hạn | A | `support_tickets` + `ticket_messages` (**tách**, không nhúng vì không giới hạn); `emergency_requests` riêng vì SLA 5 phút; `chat_sessions` + `chat_messages` |
| **HTL** cổng khách sạn (HTL-01…12) | Đơn của khách sạn realtime, trạng thái phòng, tổng quan hôm nay | Check-in/out, trạng thái dọn | A/T | `rooms` (phòng vật lý + trạng thái), `room_types`; truy vấn luôn lọc `hotelId` đứng đầu index |
| **HTL-09/ADM-11** đối soát phí | Tổng hợp theo tháng/khách sạn | Chạy job cuối tháng | A | `settlements` sinh từ `ledger_entries`; `clawbacks` (khoản truy thu) |
| **ADM** quản trị (ADM-01…17) | Dashboard KPI, hàng đợi, báo cáo | Cấu hình có phiên bản | A | `system_configs` versioned; báo cáo bằng aggregate (xem mục 9); `audit_logs` |
| **CXL/RFD/DSP** hủy–đổi–hoàn | Hàng đợi theo trạng thái/SLA | Nhiều bước liên đới (nhả phòng, hủy xe, tạo hoàn, dừng chi) | **T** | `change_requests`, `refunds`, `payouts`, `disputes`, `clawbacks`; thao tác hủy/đổi chạy trong transaction (mục 5.4–5.5) |

### 2.1 Nhúng hay tham chiếu — nguyên tắc áp dụng

1. **Nhúng** khi dữ liệu luôn đọc cùng nhau, kích thước **có giới hạn cứng** và đổi cùng vòng đời: dòng phòng trong đơn, lịch sử trạng thái đơn (< 30 phần tử), danh sách ảnh, tiện ích, khoảng cách tới sân bay, tiers chính sách.
2. **Tham chiếu** khi tập hợp **không giới hạn** hoặc truy vấn độc lập: tin nhắn ticket, vị trí xe, thông báo, nhật ký, giao dịch.
3. **Ảnh chụp (snapshot) thay vì join** với dữ liệu có thể đổi nhưng cần giữ nguyên lịch sử: tên/địa chỉ khách sạn, giá, chính sách trong đơn; thông tin khách trong đơn.
4. **Số liệu thống kê giữ sẵn** (rating, điểm sự cố) cập nhật bằng `$inc` trong cùng transaction với sự kiện gốc; có job đối chiếu định kỳ.

### 2.2 Ước lượng quy mô (giả định để chọn index/đối chiếu)

| Đối tượng | Giai đoạn đầu | Sau 1 năm |
|---|---|---|
| Khách sạn / loại phòng | 20–40 / 100–200 | 200 / 1.000 |
| Đơn đặt/ngày (đỉnh sự cố) | 200 (1.000) | 2.000 (10.000) |
| `bookings` tích lũy | 70K/năm | 700K/năm |
| `vehicle_locations` | 20 xe × 1 điểm/10 s | giữ 30 ngày (TTL) |
| `audit_logs` | ~20 bản ghi/đơn | ~15M/năm |

Kích thước này thoải mái trên một replica set; **chưa cần sharding** (mục 10).

---

## 3. Quy ước chung

| Hạng mục | Quy ước |
|---|---|
| Tên | collection `snake_case` số nhiều; trường `camelCase`; enum `UPPER_SNAKE_CASE` |
| `_id` | `ObjectId`; mã nghiệp vụ hiển thị (Booking Code, mã ticket) là trường riêng có unique index |
| Thời gian | `Date` (UTC). Hiển thị theo ICT ở tầng giao diện. Khoảng lưu trú dùng nửa mở `[from, to)` |
| Tiền | **`NumberLong` VND**, không thập phân; trường tiền kết thúc bằng `Vnd` hoặc nằm trong object tiền; tỷ lệ % lưu số nguyên phần vạn (`bps`: 2% = 200) tránh số thực |
| Số điện thoại | Lưu dạng chuẩn hóa E.164 (`+84…`) ở `phone`; bản gốc nhập không lưu |
| Trường chung | `createdAt`, `updatedAt`; `v` (số nguyên tăng dần, khóa lạc quan) cho tài liệu có nhiều tác nhân sửa (đơn, hoàn, ticket) |
| Xóa | Dữ liệu tài chính/đơn: **không xóa**, dùng trạng thái. Hồ sơ cá nhân: ẩn danh hóa (`anonymizedAt`) theo FR-USR-07 |
| Người thực hiện | Object `actor`: `{ type: GUEST\|USER\|HOTEL\|ADMIN\|DRIVER\|SYSTEM, id, role }` |
| Địa lý | GeoJSON `Point`: `{ type:"Point", coordinates:[lng, lat] }` |
| Mã hóa | Trường có hậu tố `Enc` là dữ liệu mã hóa cấp trường (mục 8) |
| Validation | `$jsonSchema` ở mức `moderate`/`error` cho collection tài chính (mục 11) |

---

## 4. Danh mục collection (42)

| Nhóm | Collection |
|---|---|
| Danh tính | `users`, `accounts`, `roles`, `sessions`, `otp_sessions` |
| Khách sạn | `hotels`, `room_types`, `rooms`, `room_reservations`, `inventory_locks`, `hotel_incidents` |
| Chuyến bay | `airports`, `flight_cache`, `flight_watches` |
| Đặt phòng | `bookings`, `change_requests` |
| Tiền | `payments`, `refunds`, `payouts`, `ledger_entries`, `settlements`, `clawbacks`, `vouchers`, `disputes` |
| Xe | `vehicles`, `drivers`, `shuttle_legs`, `vehicle_locations` |
| Hỗ trợ | `support_tickets`, `ticket_messages`, `emergency_requests`, `chat_sessions`, `chat_messages` |
| Khác | `reviews`, `notifications`, `notification_templates`, `files`, `system_configs`, `audit_logs`, `idempotency_keys`, `outbox_events`, `counters` |

Dưới đây mỗi collection: **mục đích**, **trường**, **index**, **ghi chú**. Trường có `?` là tùy chọn.

---

## 5. Thiết kế chi tiết

### 5.1 Tồn phòng — phần khó nhất (R1)

**Bài toán:** một loại phòng có `totalRooms` phòng; đơn đặt có khoảng thời gian bất kỳ (gói 3h, 6h, qua đêm…); hai khách đặt cùng lúc phòng cuối cùng chỉ một người thành công.

**Phương án đã loại:**
- *Lưới theo ngày* (`inventory_days`: total/booked/held): đơn giản nhưng **không biểu diễn được gói giờ** và khoảng đệm dọn phòng.
- *Lưới theo giờ* (mỗi loại phòng × mỗi giờ × 60 ngày): chính xác nhưng 1.440 tài liệu/loại phòng; mỗi đơn qua đêm cập nhật ~12 tài liệu; phình dữ liệu.

**Phương án chọn:** collection `room_reservations` — mỗi dòng phòng của một đơn là một khoảng `[from, to)`. Còn chỗ hay không = **số phòng đồng thời lớn nhất** trong khoảng yêu cầu ≤ `totalRooms − phòng bị khóa`.

```text
room_reservations
{
  _id, hotelId, roomTypeId,
  kind:  "BOOKING" | "BLOCK",            // BLOCK = khách sạn khóa/bảo trì
  bookingId?, bookingLineNo?,
  qty: 1,                                 // số phòng của dòng này
  from: ISODate, to: ISODate,             // đã cộng khoảng đệm dọn phòng vào `to`
  state: "HOLD" | "CONFIRMED" | "CHECKED_IN" | "RELEASED" | "COMPLETED",
  holdExpiresAt?: ISODate,                // chỉ khi HOLD
  releasedReason?, createdAt, updatedAt
}
```
**Hoạt động** = `state ∈ {CONFIRMED, CHECKED_IN}` hoặc (`HOLD` và `holdExpiresAt > now`). Dòng hết hạn coi như trống ngay cả khi job chưa dọn.

**Index:**
```js
db.room_reservations.createIndex({ roomTypeId: 1, state: 1, from: 1, to: 1 })
db.room_reservations.createIndex({ bookingId: 1 })
db.room_reservations.createIndex({ state: 1, holdExpiresAt: 1 },
  { partialFilterExpression: { state: "HOLD" } })          // job nhả hết hạn
db.room_reservations.createIndex({ hotelId: 1, from: 1 })  // tổng quan hôm nay (HTL-07)
```

**Vì sao không dùng tổng `qty` các đoạn giao nhau:** A(0–12h), B(12–24h), C(6–18h): C giao với cả A và B nên tổng = 2, nhưng không lúc nào quá 1 phòng đang bị chiếm trước C. Cộng tổng làm **từ chối oan** các đơn hợp lệ. Cách đúng là **sweep-line** trên tập đoạn giao nhau (thường dưới 50 phần tử): tạo sự kiện +qty tại `from`, −qty tại `to`, sắp xếp (trả trước, nhận sau tại cùng thời điểm — khớp BR-BKG-02: check-out 5:30 và check-in 5:30 không xung đột), lấy max cộng dồn.

**Chống tranh chấp:** transaction mở đầu bằng ghi vào `inventory_locks`:
```text
inventory_locks { _id: roomTypeId, seq: NumberLong }   // $inc seq: 1  (upsert)
```
Hai transaction cùng loại phòng cùng ghi `_id` này → một bên nhận `WriteConflict`/`TransientTransactionError` và **tự động chạy lại** (driver `withTransaction`), lúc chạy lại sẽ thấy đơn kia và đủ/hết phòng đúng. Khác loại phòng không chặn nhau. Mức: `readConcern: "snapshot"`, `writeConcern: { w: "majority" }`.

**Tìm kiếm (không cần chắc chắn tuyệt đối):** aggregate theo lô loại phòng của các khách sạn ứng viên, lấy các đoạn giao nhau, tính còn lại ở tầng ứng dụng bằng cùng hàm sweep-line (xem mục 9.1). Kết quả hiển thị là **ước lượng**; lúc đặt luôn kiểm tra lại trong transaction → khách có thể thấy "vừa hết phòng" (FR-SRC-06), không bao giờ bị bán vượt. Nếu tải tìm kiếm lớn: thêm bộ đệm tồn (Redis) cập nhật từ Change Stream của `room_reservations`.

**Dọn dẹp:** job mỗi phút chuyển `HOLD` hết hạn → `RELEASED` (`releasedReason: "HOLD_EXPIRED"`) và đơn tương ứng → `EXPIRED`.

---

### 5.2 Danh tính và phân quyền

#### `users` — khách đã đăng ký (FR-USR)
```text
{
  _id, phone (E.164, unique), phoneVerifiedAt, email?, emailVerifiedAt?,
  profile: { fullName?, avatarFileId?, nationalIdEnc?, nationalIdLast4?, bankEnc?, bankLabel? },
  favoriteHotelIds: [ObjectId]  (≤ 200),
  prefs: { notifyPromo: bool, channels: ["EMAIL","SMS","PUSH"], lang: "vi" },
  lastGuestForm?: { fullName, email },        // FR-USR-03: lấy từ đơn đầu
  status: "ACTIVE" | "LOCKED" | "ANONYMIZED",
  anonymizedAt?, createdAt, updatedAt, lastLoginAt
}
Index: { phone: 1 } unique;  { email: 1 } unique + partial (email tồn tại)
```
Khách **vãng lai không có tài liệu ở đây**; dữ liệu của họ nằm trong `bookings.guest`. Khi đăng ký/đăng nhập bằng OTP, chạy `bookings.updateMany({ "guest.phone": phone, userId: null }, { $set: { userId } })` (FR-USR-05).

#### `accounts` — tài khoản nội bộ (chủ/nhân viên khách sạn, tài xế, admin)
```text
{
  _id, type: "HOTEL" | "DRIVER" | "ADMIN",
  email (unique), phone?, passwordHash, mfa?: { type, secretEnc, enabled },
  fullName, status: "INVITED" | "ACTIVE" | "LOCKED",
  hotelId?,                     // bắt buộc với HOTEL, DRIVER
  roleIds: [ObjectId],          // → roles
  isOwner?: bool,               // chủ khách sạn (chỉ 1)
  adminRole?: "OPS" | "SUPPORT" | "FINANCE" | "SYSADMIN",
  lastLoginAt, failedLogins, lockedUntil?, createdBy, createdAt, updatedAt
}
Index: { email: 1 } unique;  { hotelId: 1, type: 1, status: 1 }
```

#### `roles` — vai trò + quyền (HTL-10, ADM-13, ma trận BA §3.6b)
```text
{ _id, scope: "SYSTEM" | "HOTEL", hotelId?, name, key,
  permissions: ["booking:read","booking:checkin","room:housekeeping", ...],
  system: bool, createdAt, updatedAt }
Index: { hotelId: 1, key: 1 } unique
```
Vai trò hệ thống (lễ tân, buồng phòng, kế toán KS; OPS, SUPPORT, FINANCE, SYSADMIN) được seed (`system: true`, không sửa). Chủ khách sạn tạo thêm vai trò riêng trong phạm vi `hotelId`.

#### `sessions` và `otp_sessions`
```text
sessions:     { _id, subjectType, subjectId, refreshHash, device, ip, expireAt, revokedAt? }
              Index: { expireAt: 1 } TTL 0;  { subjectId: 1, subjectType: 1 }
otp_sessions: { _id, phone, purpose: "LOGIN"|"VERIFY_BOOKING", codeHash, attempts, expireAt, createdAt }
              Index: { expireAt: 1 } TTL 0;  { phone: 1, createdAt: -1 }
```

---

### 5.3 Khách sạn, phòng

#### `hotels` (FR-HTL-01/02, ADM-01)
```text
{
  _id, code (unique), name, slug,
  status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "HIDDEN_DEBT",
  ownerAccountId,
  description, images: [{ fileId, url, order, caption? }] (≤ 30),
  address: { line, ward, district, city, country },
  location: GeoJSON Point,
  airports: [{ iata: "HAN", km: 7.2, minutes: 15, nearTerminal?: "T2" }],   // R5
  amenities: ["WIFI","BREAKFAST","SHUTTLE","LAUNDRY","24H_RECEPTION"],
  reception: { is24h: bool, hours?: [{ dow, open, close }] },               // BR-BKG-03 cũ / giờ nhận khách
  contact: { phone, email? },
  policy: { cancellationTemplate: "FLEXIBLE"|"STANDARD"|"NON_REFUNDABLE",
            cleaningBufferMin: 0, noShowGraceMin: 60, checkInFrom?, checkOutUntil? },
  approval: { manual: bool, manualUntil?: Date },      // OQ-2-02: duyệt tay ≤ 90 ngày
  shuttle: { enabled: bool, maxKm: 25, vehicleCount?: number },
  payoutAccount: { type: "MOMO"|"BANK", labelMasked, detailsEnc, verifiedAt?, changedAt, pendingChange?: {...} },
  rating: { avg: Double, count: Int, sumStars: Int },  // cập nhật bằng $inc
  incidentScore: Int,                                  // BR-CXL-11, BA §3.4
  stats: { cancelByHotel30d?, ... } ,                  // job cập nhật (tùy chọn)
  searchText?: string,                                 // dạng không dấu, phục vụ tìm theo tên
  createdAt, updatedAt, approvedAt?, approvedBy?
}
Index:
  { location: "2dsphere" }
  { status: 1, "airports.iata": 1, "airports.km": 1 }          // danh sách theo sân bay
  { code: 1 } unique
  { ownerAccountId: 1 }
  { status: 1, incidentScore: -1 }                             // Admin xem khách sạn rủi ro
```
`payoutAccount` đổi → ghi `pendingChange` và chờ Admin duyệt (FR-ADM-15), không đổi trực tiếp.

#### `room_types`
```text
{
  _id, hotelId, name, description,
  capacity: { adults, children? }, bedType, areaM2?,
  images: [...], amenities: [...],
  totalRooms: Int,                                   // số phòng bán được của loại này
  sell: {
    night?:  { checkInTime: "14:00", checkOutTime: "12:00" },
    hourly?: { packages: [{ hours: 3, priceVnd }, { hours: 6, priceVnd }] }
  },
  pricing: {
    baseNightVnd?: NumberLong,
    rules: [{ from: Date, to: Date, dow?: [..], priceVnd, label }]   // ghi đè theo ngày (≤ 50)
  },
  active: bool, order, createdAt, updatedAt
}
Index: { hotelId: 1, active: 1, order: 1 }
```
`totalRooms` là **trần bán**, không bằng số phòng vật lý nếu khách sạn giữ phòng không bán.

#### `rooms` — phòng vật lý + trạng thái dọn (HTL-07/11)
```text
{
  _id, hotelId, roomTypeId, number, floor,
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "DIRTY" | "CLEANING" | "OUT_OF_ORDER",
  bookingId?, statusAt, statusBy: actor,
  note?, createdAt, updatedAt
}
Index: { hotelId: 1, number: 1 } unique;  { hotelId: 1, status: 1 };  { roomTypeId: 1, status: 1 }
```
Luồng: `AVAILABLE → RESERVED → OCCUPIED → DIRTY → CLEANING → AVAILABLE` (BA §3.5). Phòng được **gán lúc check-in** (đơn ghi `lines[].assignedRoomIds`). `OUT_OF_ORDER` kéo theo tạo `room_reservations` kind `BLOCK` để trừ tồn.

#### `hotel_incidents` (điểm sự cố, BR-CXL-11)
```text
{ _id, hotelId, bookingId, kind: "NO_ROOM"|"ROOM_FAULT"|"HOTEL_CANCEL"|"OVERBOOK"|"LATE_CONFIRM",
  points: Int, reason, createdBy: actor, createdAt }
Index: { hotelId: 1, createdAt: -1 }
```

---

### 5.4 Đơn đặt phòng

#### `bookings` (FR-BKG, CXL) — tài liệu trung tâm
```text
{
  _id,
  code: "AR-7K3M9QXD",                    // Booking Code, unique
  status: "PENDING_PAYMENT"|"PENDING"|"CONFIRMED"|"CHECKED_IN"|"CHECKED_OUT"
          |"CANCELLED"|"REJECTED"|"EXPIRED"|"NO_SHOW",
  hotelId, userId?,                       // vãng lai: userId null

  guest:        { fullName, phone (E.164), email? },        // người liên hệ/đặt
  occupant?:    { fullName, phone },                        // người nhận phòng khác (E7)
  hotelSnapshot:{ name, addressLine, phone, location },     // chụp lúc đặt (R6)

  stay: { type: "NIGHT"|"HOURLY", from: Date, to: Date, nights?: Int, hours?: Int },
  lines: [{                                                // ≤ 10 dòng (E8)
    lineNo, roomTypeId, roomTypeName, qty, unitPriceVnd, subtotalVnd,
    reservationId,                                         // → room_reservations
    assignedRoomIds: [ObjectId]
  }],

  flight?: { code, date, originIata, destIata, scheduledDep, estimatedDep,
             status, delayMin?, snapshotAt, source },
  suggestion?: { rule: "BR-FLT-03", side: "ORIGIN"|"DEST" },

  shuttle: { tripType: "NONE"|"ONE_WAY"|"ROUND_TRIP",
             pickup?: { address, location, note? },
             legCount: 0|1|2 },                            // chi tiết ở shuttle_legs

  pricing: {                                                // chụp lúc đặt (R6)
    roomVnd, shuttleVnd, serviceFeeVnd, discountVnd, totalVnd,
    params: { serviceFeeBps: 200, serviceFeeMinVnd: 10000,
              shuttle: { baseVnd: 60000, perKmVnd: 10000, freeKm: 3, nightPct: 20, maxKm: 25 },
              configVersions: { pricing: 7 } },
    voucherId?
  },
  policySnapshot: { template: "STANDARD",
                    tiers: [{ minHoursBefore: 24, keepPct: 0 },
                            { minHoursBefore: 2, keepPct: 50 },
                            { minHoursBefore: 0, keepPct: 100 }],
                    freeIfFlightDisrupted: true },

  payment: { method: "MOMO"|"AT_HOTEL",
             status: "UNPAID"|"PAID"|"COLLECTED_AT_HOTEL"|"PARTIALLY_REFUNDED"|"REFUNDED"|"FAILED",
             paidVnd: 0, refundedVnd: 0 },

  approval?: { required: bool, requestedAt, remindedAt?, escalatedAt?, decidedBy?, decidedAt?, rejectReasonCode?, rejectNote? },
  expiresAt?: Date,                       // hạn giữ chỗ / hạn duyệt (BA §3.3, P-03/P-04)

  cancellation?: { by: "GUEST"|"HOTEL"|"ADMIN"|"SYSTEM", reasonCode, note?, at,
                   keptVnd, refundVnd, serviceFeeRefunded: bool, requestId? },
  linkedBookingId?,                       // đổi khách sạn (X5)
  changeCount: 0,                         // BR-CXL-07

  checkedInAt?, checkedOutAt?, actualCheckOutAt?,
  noShowAt?,
  flags: { disputeOpen: bool, payoutHeld: bool, needsCall: bool },
  statusHistory: [{ from, to, at, by: actor, reasonCode?, note? }],   // < 30 phần tử
  source: { channel: "WEB"|"ADMIN"|"HOTEL", utm?: {...} },
  v: Int, createdAt, updatedAt
}
```

**Index:**
```js
db.bookings.createIndex({ code: 1 }, { unique: true })                       // FR-BKG-08
db.bookings.createIndex({ "guest.phone": 1, status: 1, createdAt: -1 })      // đơn hoạt động theo SĐT (SHT-03)
db.bookings.createIndex({ userId: 1, createdAt: -1 }, { partialFilterExpression: { userId: { $exists: true } } })
db.bookings.createIndex({ hotelId: 1, status: 1, "stay.from": 1 })           // đơn realtime/tổng quan KS
db.bookings.createIndex({ hotelId: 1, createdAt: -1 })
db.bookings.createIndex({ status: 1, expiresAt: 1 },
  { partialFilterExpression: { status: { $in: ["PENDING_PAYMENT", "PENDING"] } } })  // job hết hạn
db.bookings.createIndex({ status: 1, "stay.from": 1 },
  { partialFilterExpression: { status: "CONFIRMED" } })                       // job NO_SHOW
db.bookings.createIndex({ "flight.code": 1, "flight.date": 1, status: 1 })   // theo dõi chuyến
db.bookings.createIndex({ "flags.needsCall": 1 }, { partialFilterExpression: { "flags.needsCall": true } })
db.bookings.createIndex({ status: 1, createdAt: -1 })                        // Admin danh sách
```

**Quy tắc trạng thái** (cập nhật nguyên tử, từ chối nếu trạng thái hiện tại không hợp lệ):
```js
db.bookings.findOneAndUpdate(
  { _id, status: { $in: ["PENDING", "CONFIRMED"] }, v },        // chỉ hủy được từ các trạng thái này
  { $set: { status: "CANCELLED", cancellation: {...}, updatedAt: now },
    $push: { statusHistory: { from, to: "CANCELLED", at: now, by, reasonCode } },
    $inc: { v: 1 } })
```
Bảng chuyển hợp lệ theo SRS §3.3 được cài ở tầng ứng dụng; `v` và bộ lọc trạng thái bảo đảm không ghi đè lẫn nhau.

**Bảo mật truy cập:** API tra cứu bằng `code` luôn yêu cầu SĐT/email khớp `guest.phone/email`; khách sạn truy vấn luôn kèm `hotelId` của tài khoản (không bao giờ lấy từ tham số người dùng).

#### `change_requests` — yêu cầu hủy/đổi (DR-17; FR-CXL-02…07)
```text
{
  _id, bookingId, hotelId,
  type: "CANCEL"|"PARTIAL_CANCEL"|"CHANGE"|"SWITCH_HOTEL"|"EARLY_CHECKOUT",
  scenario: "X1".."X12",
  requestedBy: actor, reasonCode, note?, evidenceFileIds: [ObjectId],
  payload?: { newFrom?, newTo?, newRoomTypeId?, removeLines?, shuttle?: {...}, newPickupAt? },
  quote: { keepVnd, refundVnd, extraChargeVnd?, serviceFeeAdjustVnd, tierApplied, computedAt },  // BR-CXL-03: khóa lúc gửi
  status: "SUBMITTED"|"AUTO_APPROVED"|"UNDER_REVIEW"|"APPROVED"|"REJECTED"|"EXECUTED"|"WITHDRAWN"|"EXPIRED_REVIEW",
  review?: { by: actor, at, decision, note },
  dueAt?: Date,                                  // SLA xét duyệt (P-18)
  executedAt?, refundId?, newBookingId?,
  statusHistory: [...], v, createdAt, updatedAt
}
Index: { bookingId: 1, createdAt: -1 };  { status: 1, dueAt: 1 };  { hotelId: 1, status: 1, createdAt: -1 }
```

---

### 5.5 Thanh toán, hoàn, chi trả, sổ cái

#### `payments` — giao dịch thu (FR-PAY)
```text
{
  _id, bookingId, hotelId, purpose: "BOOKING"|"CHANGE_TOPUP",
  method: "MOMO"|"AT_HOTEL", amountVnd,
  status: "INITIATED"|"PENDING"|"SUCCEEDED"|"FAILED"|"EXPIRED"|"COLLECTED",
  idempotencyKey (unique),
  momo?: { partnerCode, orderId (unique), requestId, transId?, payUrl?, deeplink?, resultCode?,
           message?, signatureOk?: bool, expiresAt?, queriedAt? },
  collected?: { by: actor, at, note? },           // thu tại khách sạn (FR-PAY-07)
  callbacks: [{ at, raw, signatureOk }],          // ≤ 10; bản đầy đủ ở collection log nếu cần
  anomaly?: { kind: "AMOUNT_MISMATCH"|"LATE_SUCCESS"|"DUPLICATE", handledAt? },
  v, createdAt, updatedAt
}
Index: { idempotencyKey: 1 } unique;  { "momo.orderId": 1 } unique partial (có momo.orderId);
       { bookingId: 1, createdAt: -1 };  { status: 1, createdAt: 1 }   // job truy vấn trạng thái treo
```
**Callback MoMo (R3):** `findOneAndUpdate({ "momo.orderId": id, status: { $in: ["INITIATED","PENDING"] } }, {$set: SUCCEEDED...})`; nếu không khớp bản ghi nào (đã xử lý) → trả `204` và **không** ghi gì thêm. Kiểm tra chữ ký và `amount == payment.amountVnd` trước khi cập nhật; lệch → `anomaly`, giữ đơn chờ xử lý (BR-PAY-01). Thanh toán thành công **sau khi** đơn `EXPIRED`/`CANCELLED` → tạo `refunds` 100% tự động (BR-CXL-14).

#### `refunds` — lệnh hoàn (DR-18; FR-RFD)
```text
{
  _id, bookingId, hotelId, paymentId, changeRequestId?, disputeId?,
  key (unique),                                   // `${bookingId}:${nguồn}:${seq}` chống hoàn kép (BR-CXL-12)
  amountVnd, reasonCode, scenario,
  method: "MOMO"|"MANUAL_TRANSFER"|"HOTEL_CASH",
  status: "PENDING"|"PROCESSING"|"REFUNDED"|"FAILED"|"MANUAL_REQUIRED"|"WRITTEN_OFF"|"CANCELLED",
  attempts: [{ at, result, code?, message? }],     // ≤ 5
  momo?: { refundTransId?, resultCode? },
  manual?: { claimTokenHash, claimExpiresAt, accountEnc?, accountLabelMasked?, paidBy?, paidAt?, proofFileId?, approvedBy? },
  dueAt: Date,                                     // ≤ 24h (BR-CXL-13)
  clawbackId?,                                     // nếu đã chi cho khách sạn (FR-RFD-08)
  v, createdAt, updatedAt, completedAt?
}
Index: { key: 1 } unique;  { bookingId: 1 };  { status: 1, dueAt: 1 };  { paymentId: 1 }
```
**Ràng buộc "tổng hoàn ≤ tổng đã thu" (FR-RFD-04):** thực hiện trong transaction: `bookings.payment.refundedVnd + amount ≤ paidVnd` dùng điều kiện trong `updateOne` (`$expr`) — nếu không thỏa, không tạo lệnh.

#### `payouts` — lệnh chi cho khách sạn (FR-PAY-04, BR-PAY-04)
```text
{
  _id, hotelId, bookingId (unique), amountVnd,          // = giá phòng + xe thực giữ (không hoa hồng)
  status: "SCHEDULED"|"HELD"|"PENDING_APPROVAL"|"APPROVED"|"PAID"|"FAILED"|"CANCELLED",
  eligibleAt: Date,                                     // CHECKED_OUT + 24h (P-10)
  heldReason?: "DISPUTE"|"COMPLAINT"|"ANOMALY", disputeId?,
  createdBy: actor, approvedBy?: actor,                 // four-eyes: createdBy ≠ approvedBy
  paidAt?, momoTransId?, failure?, v, createdAt, updatedAt
}
Index: { bookingId: 1 } unique;  { status: 1, eligibleAt: 1 };  { hotelId: 1, status: 1 }
```
Job quét `status: "SCHEDULED", eligibleAt ≤ now` rồi chuyển `PENDING_APPROVAL` nếu `amountVnd` vượt ngưỡng (P-12) hoặc `APPROVED`. Tranh chấp mở → `HELD`.

#### `ledger_entries` — sổ cái chỉ thêm (R2, FR-PAY-06, NFR-10)
```text
{
  _id, ts, bookingId?, hotelId?, ref: { type: "PAYMENT"|"REFUND"|"PAYOUT"|"CLAWBACK"|"SETTLEMENT", id },
  account: "CUSTOMER_PAID"          // tiền khách trả (MoMo)
         | "HOTEL_PAYABLE"           // Airrest nợ khách sạn
         | "AIRREST_REVENUE"         // phí dịch vụ đơn đã ghi nhận
         | "HOTEL_FEE_RECEIVABLE"    // khách sạn nợ Airrest (phí DV thu hộ, đơn trả tại KS)
         | "CUSTOMER_REFUNDABLE"     // Airrest nợ khách (hoàn)
         | "HOTEL_CLAWBACK",         // khoản truy thu từ khách sạn
  amountVnd: NumberLong (có dấu),    // + tăng, − giảm
  memo?, settlementId?, createdBy: actor
}
Index: { bookingId: 1, ts: 1 };  { hotelId: 1, account: 1, ts: 1 };  { "ref.type": 1, "ref.id": 1 };  { settlementId: 1 }
```
Quy tắc: **không update/delete**; sửa sai bằng bút toán đảo. Khi một sự kiện tiền xảy ra, ghi đủ các dòng trong **cùng transaction** với thay đổi trạng thái. Ví dụ đơn 836.000 đ trả MoMo (BA §4.2): `CUSTOMER_PAID +836000`, `HOTEL_PAYABLE +820000`, `AIRREST_REVENUE +16000`. Kiểm tra cân bằng (job đối soát ngày): với mỗi đơn, `CUSTOMER_PAID` = `HOTEL_PAYABLE + AIRREST_REVENUE + CUSTOMER_REFUNDABLE` (dấu theo quy ước ứng dụng).

#### `settlements` — đối soát phí dịch vụ tháng (HTL-09, ADM-11)
```text
{
  _id, hotelId, period: "2026-11",
  summary: { atHotelOrders: Int, serviceFeeCollectedVnd,            // khách sạn nợ Airrest
             onlinePayableVnd,                                      // Airrest nợ khách sạn (đã đủ điều kiện, chưa chi)
             clawbacksVnd },                                        // truy thu từ refund
  netVnd: NumberLong, direction: "AIRREST_PAYS_HOTEL"|"HOTEL_PAYS_AIRREST"|"ZERO",
  status: "DRAFT"|"SENT"|"CONFIRMED"|"PAID"|"OVERDUE"|"SETTLED_BY_OFFSET",
  items: [{ bookingId, type, amountVnd }]  (≤ 500; vượt thì lưu ở settlement_items),
  dueAt, sentAt?, paidAt?, momoTransId?, reminders: [Date],
  createdBy: actor, v, createdAt, updatedAt
}
Index: { hotelId: 1, period: 1 } unique;  { status: 1, dueAt: 1 }
```
Khách sạn trễ hạn (P-11): job chuyển `OVERDUE`; sau 15 ngày đặt `hotels.status = "HIDDEN_DEBT"`.

#### `clawbacks` — truy thu từ khách sạn (DR-20, BR-CXL-10)
```text
{ _id, hotelId, bookingId, refundId, amountVnd, cause: "HOTEL_FAULT"|"CUSTOMER_PENALTY_RETURN",
  status: "OPEN"|"SETTLED"|"WAIVED", settlementId?, createdBy, createdAt, updatedAt }
Index: { hotelId: 1, status: 1 };  { refundId: 1 } unique
```

#### `disputes` — tranh chấp (DR-19; FR-DSP)
```text
{
  _id, code, bookingId, hotelId, openedBy: actor,
  kind: "REFUND_DECISION"|"POST_STAY_ISSUE"|"CHARGEBACK",
  description, evidenceFileIds: [...],
  hotelResponse?: { by, at, text, fileIds? }, hotelDueAt,
  status: "OPEN"|"AWAITING_HOTEL"|"INVESTIGATING"|"RESOLVED_REFUND"|"RESOLVED_DENIED"|"CLOSED",
  decision?: { by: actor, at, outcome, refundVnd?, reason (bắt buộc) },
  assigneeId?, slaDueAt, chargeback?: { channel, caseRef, openedAt, dueAt },
  v, createdAt, updatedAt, closedAt?
}
Index: { code: 1 } unique;  { bookingId: 1 };  { status: 1, slaDueAt: 1 };  { hotelId: 1, status: 1 }
```
Tạo tranh chấp (transaction): thêm `disputes`, `bookings.flags.disputeOpen = true`, `payouts.status = HELD`.

#### `vouchers` (FR-RFD-07 bồi thường)
```text
{ _id, code (unique), type: "AMOUNT"|"PERCENT", valueVnd?|pct?, source: "COMPENSATION"|"PROMO",
  ownerPhone? | ownerUserId?, originBookingId?, costBearer: "HOTEL"|"AIRREST",
  status: "ACTIVE"|"USED"|"EXPIRED"|"VOID", expiresAt, usedBookingId?, createdBy, createdAt }
Index: { code: 1 } unique;  { ownerPhone: 1, status: 1 };  { expiresAt: 1 }
```

---

### 5.6 Xe đưa đón

#### `vehicles`, `drivers`
```text
vehicles: { _id, hotelId, plate (unique), type, seats, active, createdAt }
          Index: { plate: 1 } unique;  { hotelId: 1, active: 1 }
drivers:  { _id, accountId, hotelId, fullName, phone, vehicleId?,
            status: "OFFLINE"|"ONLINE"|"BUSY",
            lastLocation?: { loc: GeoJSON, at: Date, speed?, heading? },   // bản mới nhất
            currentLegId?, createdAt, updatedAt }
          Index: { hotelId: 1, status: 1 };  { accountId: 1 } unique;  { "lastLocation.loc": "2dsphere" }
```

#### `shuttle_legs` — mỗi chặng một tài liệu (FR-SHT)
```text
{
  _id, bookingId, hotelId, legNo: 1|2,
  direction: "TO_HOTEL" | "FROM_HOTEL",
  pickup:  { address, location, note? },
  dropoff: { address, location },
  scheduledAt: Date, distanceKm: Double, routeMeters?: Int,
  priceVnd: NumberLong, nightSurcharge: bool,
  status: "REQUESTED"|"ASSIGNED"|"ON_THE_WAY"|"ARRIVED"|"PICKED_UP"|"COMPLETED"|"CANCELLED"|"FAILED",
  driverId?, vehicleId?, assignedAt?, assignedBy?, offerExpiresAt?,         // tài xế có 3 phút nhận
  etaAt?, arrivedAt?, pickedUpAt?, completedAt?,
  verify: { codeHash, last4Phone },                                         // BA §3.6 mục 4
  failure?: { reason, at, by },
  trackingVisibleFrom?, trackingVisibleUntil?,                              // BR-SHT-01
  offers: [{ driverId, at, result: "ACCEPTED"|"DECLINED"|"TIMEOUT" }],      // ≤ 5
  history: [...],
  v, createdAt, updatedAt
}
Index:
  { hotelId: 1, status: 1, scheduledAt: 1 }          // hàng đợi cần phân xe (SHT-04, ADM-07)
  { driverId: 1, status: 1, scheduledAt: 1 }         // xe của tài xế
  { bookingId: 1, legNo: 1 } unique
  { status: 1, scheduledAt: 1 }                      // cảnh báo ETA+10'
```
**Phân xe an toàn:** `findOneAndUpdate({ _id: legId, status: "REQUESTED" }, { $set: { status: "ASSIGNED", driverId, vehicleId, ... } })` kèm cập nhật `drivers.currentLegId` trong transaction; từ chối nếu tài xế đã `BUSY`.

#### `vehicle_locations` — time-series (R4, BR-SHT-01)
```js
db.createCollection("vehicle_locations", {
  timeseries: { timeField: "ts", metaField: "meta", granularity: "seconds" },
  expireAfterSeconds: 2592000            // 30 ngày (P-14)
})
// tài liệu: { ts, meta: { legId, driverId }, loc: GeoJSON, speed, heading, accuracy }
db.vehicle_locations.createIndex({ "meta.legId": 1, ts: -1 })
```
Chiến lược ghi: tài xế gửi vị trí mỗi 5–10 giây → ghi `vehicle_locations` **và** `$set drivers.lastLocation`. Socket.io phát tới phòng `leg:{legId}` ngay khi nhận (không phải đợi Change Stream). Khách chỉ đăng ký phòng khi `trackingVisibleFrom ≤ now ≤ trackingVisibleUntil`.

---

### 5.7 Hỗ trợ

```text
support_tickets: {
  _id, code (unique), source: "FORM"|"CHATBOT"|"ADMIN", type: "BOOKING"|"COMPLAINT"|"PAYMENT"|"SHUTTLE"|"OTHER",
  bookingId?, hotelId?, userId?, contact: { name, phone, email? },
  subject, status: "NEW"|"IN_PROGRESS"|"RESOLVED"|"CLOSED", priority: "NORMAL"|"HIGH"|"URGENT",
  assigneeId?, chatSessionId?,
  sla: { firstResponseDueAt, resolveDueAt, firstRespondedAt? },
  lastMessageAt, messageCount, satisfaction?: { score, at },
  v, createdAt, updatedAt, closedAt? }
  Index: { code: 1 } unique;  { status: 1, priority: -1, "sla.firstResponseDueAt": 1 };
         { assigneeId: 1, status: 1 };  { bookingId: 1 };  { "contact.phone": 1, createdAt: -1 }

ticket_messages: { _id, ticketId, sender: actor, body, attachments: [fileId], internal: bool, createdAt }
  Index: { ticketId: 1, createdAt: 1 }

emergency_requests: {                                    // FR-SUP-01, ADM-05; SLA gọi lại ≤ 5 phút
  _id, phone, name?, bookingId?, location?: GeoJSON, accuracyM?, addressText?,
  locationConsent: bool, note?,
  status: "NEW"|"CALLING"|"CALLED_BACK"|"RESOLVED", assigneeId?,
  callLog: [{ at, by, result }], slaDueAt, callbackAt?, resolvedAt?, createdAt, updatedAt,
  locationPurgeAt: Date }                                // = createdAt + 90 ngày; job $unset location
  Index: { status: 1, slaDueAt: 1 };  { phone: 1, createdAt: -1 };  { locationPurgeAt: 1 } partial (location tồn tại)

chat_sessions: { _id, anonTokenHash?, userId?, phone?, status: "BOT"|"HANDED_OFF"|"CLOSED", ticketId?, createdAt, lastAt }
  Index: { lastAt: 1 } TTL 15552000 (180 ngày);  { userId: 1 }
chat_messages: { _id, sessionId, role: "USER"|"BOT"|"AGENT", text, ts }
  Index: { sessionId: 1, ts: 1 };  { ts: 1 } TTL 15552000
```

---

### 5.8 Chuyến bay

```text
airports:      { _id: "HAN", name, city, location, timezone, terminals: ["T1","T2"], active }

flight_cache:  { _id, key: "VN123|2026-11-10" (unique), data: {...đã chuẩn hóa}, provider, fetchedAt,
                 expireAt }                       // TTL: 5–15 phút tùy gần giờ bay; stale-while-revalidate ở ứng dụng
               Index: { key: 1 } unique;  { expireAt: 1 } TTL 0

flight_watches:{ _id, bookingId (unique), key, lastStatusHash, lastCheckedAt, nextCheckAt, active }
               Index: { active: 1, nextCheckAt: 1 }       // job FLT-07 quét
```
`bookings.flight` chỉ là **ảnh chụp tại lúc đặt**; đổi giờ bay sau đó lưu ở `flight_watches` + thông báo, không ghi đè lịch sử.

---

### 5.9 Đánh giá, thông báo, tệp

```text
reviews: { _id, bookingId (unique), hotelId, userId?, guestName, rating: 1..5, comment?,
           status: "PUBLISHED"|"HIDDEN", reply?: { by, text, at }, createdAt }
         Index: { bookingId: 1 } unique;  { hotelId: 1, status: 1, createdAt: -1 }
         // chỉ tạo khi bookings.status = CHECKED_OUT; cập nhật hotels.rating bằng $inc trong cùng transaction

notifications: { _id, recipient: { type: "USER"|"GUEST"|"HOTEL"|"ADMIN", id?, phone?, email? },
                 type, templateKey, payload, channels: [{ channel, status: "PENDING"|"SENT"|"FAILED", sentAt?, attempts, error? }],
                 readAt?, dedupeKey (unique), bookingId?, createdAt, expireAt }
               Index: { dedupeKey: 1 } unique;  { "recipient.id": 1, createdAt: -1 };  { "recipient.phone": 1, createdAt: -1 };
                      { expireAt: 1 } TTL 0   // 180 ngày
notification_templates: { _id, key, channel, lang, subject?, body, version, active }  Index: { key: 1, channel: 1, lang: 1, version: -1 }

files: { _id, ownerType, ownerId, purpose: "HOTEL_IMAGE"|"EVIDENCE"|"AVATAR"|"PAYOUT_PROOF",
         storageKey, mime, sizeBytes, sha256, scan: "PENDING"|"CLEAN"|"INFECTED", createdBy: actor, createdAt }
       Index: { ownerType: 1, ownerId: 1 };  { sha256: 1 }
```
`dedupeKey` (vd `BOOKING_CONFIRMED:{bookingId}:SMS`) bảo đảm **không gửi trùng** (NFR-09).

---

### 5.10 Cấu hình, nhật ký, hạ tầng

#### `system_configs` — có phiên bản (FR-ADM-12, BA §10)
```text
{ _id, key: "pricing.shuttle" | "pricing.serviceFee" | "flight.thresholds" | "booking.hold" | "cancellation.limits" | "retention" ...,
  version: Int, value: {...}, effectiveFrom: Date, status: "ACTIVE"|"SCHEDULED"|"RETIRED",
  changedBy: actor, reason?, createdAt }
Index: { key: 1, version: -1 } unique;  { key: 1, effectiveFrom: -1 }
```
Hiện hành = phiên bản có `effectiveFrom` lớn nhất ≤ now. Cache ở ứng dụng, làm mới khi có Change Stream. Đơn lưu `pricing.params.configVersions` để tái hiện giá cũ.

#### `audit_logs` — bất biến (R7, FR-ADM-09)
```text
{ _id, ts, requestId, actor: { type, id, role, ip, ua },
  action: "BOOKING.CANCEL"|"PAYOUT.APPROVE"|"CONFIG.UPDATE"|"HOTEL.PAYOUT_ACCOUNT.CHANGE"|...,
  entity: { type, id }, hotelId?, bookingId?, userPhoneMasked?,
  before?: {...}, after?: {...}, reasonCode?, reasonNote?,
  prevHash?, hash? }                                   // chuỗi băm tùy chọn (Should)
Index: { "entity.type": 1, "entity.id": 1, ts: -1 };  { "actor.id": 1, ts: -1 };
       { hotelId: 1, ts: -1 };  { bookingId: 1, ts: -1 };  { action: 1, ts: -1 };  { ts: -1 }
```
Chỉ cấp quyền `insert, find` cho role ứng dụng. Ghi **cùng transaction** với thay đổi nghiệp vụ nhạy cảm (tiền, trạng thái đơn, cấu hình); các sự kiện khác ghi bất đồng bộ qua `outbox_events`. Dữ liệu cũ hơn 24 tháng: xuất sang lưu trữ lạnh rồi xóa khỏi collection (job; không dùng TTL tự xóa vì phải lưu ≥ 5 năm).

#### `idempotency_keys`, `outbox_events`, `counters`
```text
idempotency_keys: { _id, key, scope, requestHash, status: "IN_PROGRESS"|"DONE", response?, createdAt, expireAt }
                  Index: { scope: 1, key: 1 } unique;  { expireAt: 1 } TTL 0      // 48 giờ
outbox_events:    { _id, type, aggregate: { type, id }, payload, status: "PENDING"|"DONE"|"DEAD", attempts, nextAttemptAt, createdAt, doneAt? }
                  Index: { status: 1, nextAttemptAt: 1 };  { doneAt: 1 } TTL 604800 (7 ngày, partial status DONE)
counters:         { _id: "ticket:20261109", seq: Int }   // mã ticket TK-20261109-0007
```
**Outbox:** thao tác nghiệp vụ ghi `outbox_events` trong cùng transaction; worker đọc và gửi SMS/email/đẩy Socket.io, thử lại tăng dần, quá số lần → `DEAD` + cảnh báo. Bảo đảm "ghi đơn xong thì chắc chắn có thông báo" kể cả khi tiến trình sập.

---

## 6. Các transaction chính (đảm bảo nhất quán)

Mọi transaction dùng `readConcern: snapshot`, `writeConcern: majority`, `withTransaction` (tự chạy lại lỗi tạm thời), thời gian ≤ 2 giây.

| # | Nghiệp vụ | Các bước trong transaction |
|---|---|---|
| **T1** Tạo đơn (FR-BKG-06/07/10/11) | 1) kiểm tra `idempotency_keys`; 2) `$inc inventory_locks[roomTypeId]`; 3) đọc `room_reservations` giao nhau + `room_types.totalRooms`, **sweep-line**; 4) nếu hết → abort (trả "hết phòng"); 5) insert `room_reservations` (`HOLD` hoặc `CONFIRMED` tùy hình thức); 6) insert `bookings` (`PENDING_PAYMENT`/`CONFIRMED`/`PENDING`); 7) insert `payments` (MoMo khởi tạo) ; 8) insert `shuttle_legs`; 9) `outbox_events`; 10) `audit_logs`; 11) cập nhật `idempotency_keys.response` |
| **T2** MoMo thành công (FR-PAY-03) | 1) cập nhật `payments` có điều kiện trạng thái; 2) `bookings` → `CONFIRMED` (từ `PENDING_PAYMENT`) và `payment.paidVnd`; 3) `room_reservations` `HOLD → CONFIRMED`, bỏ `holdExpiresAt`; 4) `ledger_entries` (3 dòng); 5) `outbox_events`. Nếu đơn đã `EXPIRED`/`CANCELLED` → tạo `refunds` 100% thay vì bước 2–3 |
| **T3** Hết hạn giữ/duyệt (job) | `bookings` `PENDING_PAYMENT/PENDING → EXPIRED` có điều kiện `expiresAt ≤ now`; `room_reservations → RELEASED`; hủy `shuttle_legs`; nếu đã có `payments` thành công → `refunds` |
| **T4** Hủy tự phục vụ (FR-CXL-02, BR-CXL-02…06) | 1) khóa tài liệu đơn bằng cập nhật có điều kiện (`status`, `v`); 2) **tính lại báo giá** từ `policySnapshot` tại thời điểm hiện tại (không tin số client); 3) `room_reservations → RELEASED`; 4) `shuttle_legs` theo trạng thái (BR-CXL-05); 5) tạo `refunds` (nếu có hoàn) và kiểm tra tổng hoàn ≤ đã thu; 6) `ledger_entries` đảo; 7) `payouts → CANCELLED` nếu có; 8) `change_requests` (EXECUTED) nếu có; 9) `outbox_events`, `audit_logs` |
| **T5** Đổi đơn (FR-CXL-05, BR-CXL-07) | 1) `$inc inventory_locks` của loại phòng **mới** (và cũ nếu cùng khóa theo thứ tự `_id` tăng dần để tránh deadlock); 2) kiểm tra còn chỗ **sau khi tính loại trừ đơn hiện tại**; 3) insert `room_reservations` mới (`HOLD`/`CONFIRMED`); 4) nếu thu thêm: tạo `payments` (`CHANGE_TOPUP`) và **commit** tạm trạng thái "chờ thanh toán chênh lệch" — chỉ khi thanh toán xong mới chạy T5b (nhả cũ, cập nhật đơn); 5) T5b: `room_reservations` cũ → `RELEASED`, cập nhật `bookings.lines/pricing/stay`, `changeCount + 1`, điều chỉnh `shuttle_legs`; hoàn chênh lệch nếu giảm. Giữ chỗ mới thất bại → đơn cũ giữ nguyên |
| **T6** Khách sạn hủy/sự cố (FR-CXL-08) | Như T4 với `by: HOTEL`, hoàn 100%; thêm `hotel_incidents` + `$inc hotels.incidentScore`; tạo thông báo gợi ý ≤ 3 khách sạn thay |
| **T7** Check-out (FR-HTL-04) | `bookings → CHECKED_OUT`; `rooms → DIRTY`; `room_reservations → COMPLETED`; tạo `payouts` (`SCHEDULED`, `eligibleAt = now + 24h`) nếu đơn MoMo; `ledger_entries` cho đơn tại KS (`HOTEL_FEE_RECEIVABLE`); mở quyền đánh giá |
| **T8** Mở tranh chấp (FR-DSP-01) | insert `disputes`; `bookings.flags.disputeOpen`; `payouts → HELD`; `outbox_events` (gọi khách sạn phản hồi 24h) |
| **T9** Hoàn khi đã chi cho khách sạn (BR-CXL-10) | tạo `refunds` + `clawbacks` (`OPEN`) + `ledger_entries` (`CUSTOMER_REFUNDABLE`, `HOTEL_CLAWBACK`) cùng transaction |

**Không cần transaction** (một tài liệu đủ nguyên tử): đổi trạng thái chặng xe, cập nhật vị trí, thêm tin nhắn ticket, đánh dấu thông báo đã đọc, đổi trạng thái phòng vật lý.

**Thứ tự khóa để tránh deadlock:** luôn lấy `inventory_locks` theo `_id` tăng dần khi cần nhiều loại phòng (đơn nhiều dòng).

---

## 7. Thời gian thực (Socket.io + Change Streams)

| Phòng (room) Socket.io | Người nghe | Nguồn sự kiện | Nội dung |
|---|---|---|---|
| `booking:{code}` | Khách (đã xác minh SĐT/mã) | Change Stream `bookings` (update `status`) | Trạng thái đơn, thông báo |
| `hotel:{hotelId}:orders` | Nhân viên khách sạn | Change Stream `bookings` insert/update theo `hotelId`; `change_requests` | Đơn mới, yêu cầu hủy/đổi, âm báo |
| `hotel:{hotelId}:rooms` | Lễ tân/buồng phòng | `rooms`, `room_reservations` | Trạng thái phòng, tồn |
| `leg:{legId}` | Khách + điều phối + khách sạn | Tài xế gửi trực tiếp; trạng thái từ `shuttle_legs` | Vị trí, ETA, trạng thái |
| `driver:{driverId}` | Tài xế | `shuttle_legs` (gán mới) | Đơn được giao, hạn 3 phút nhận |
| `admin:alerts` | Admin | `emergency_requests`, `disputes`, `refunds` (FAILED), `shuttle_legs` (cảnh báo ETA) | Cảnh báo khẩn (FR-ADM-02) |
| `search:{roomTypeId}` (tùy chọn) | Người đang xem chi tiết | `room_reservations` | Số phòng còn (FR-SRC-01) |

**Quy tắc:** xác thực khi vào phòng (JWT/phiên), kiểm tra quyền theo `hotelId`; Change Stream mở bằng `$match` hẹp (chỉ trường cần), giữ resume token để không mất sự kiện khi khởi động lại; khi nhiều bản ứng dụng chạy song song dùng adapter (Redis) để phát sự kiện.

---

## 8. Bảo mật và quyền riêng tư dữ liệu (R8)

| Dữ liệu | Biện pháp |
|---|---|
| CCCD (`users.profile.nationalIdEnc`), tài khoản nhận tiền (`hotels.payoutAccount.detailsEnc`, `users.profile.bankEnc`, `refunds.manual.accountEnc`), bí mật MFA | **Mã hóa cấp trường** (CSFLE, khóa dữ liệu theo loại, khóa chủ ở KMS). Trường tra cứu dùng bản che (`nationalIdLast4`, `labelMasked`) |
| SĐT, email | Không mã hóa cấp trường (cần tra cứu); kiểm soát bằng quyền + che khi hiển thị + không ghi vào log ứng dụng |
| Vị trí xe | TTL 30 ngày (`vehicle_locations`) |
| Vị trí khẩn cấp | Job `$unset location` sau 90 ngày (`locationPurgeAt`); lưu cờ `locationConsent` |
| CCCD tại check-in | Chỉ thu khi khai báo lưu trú (OQ-2-09); không lưu ở bước đặt phòng |
| Tài khoản DB | Ít nhất 4 vai trò: `app_rw` (ứng dụng, **không có** `update/delete` trên `audit_logs`, `ledger_entries`), `audit_ro`, `report_ro` (đọc từ secondary), `ops_admin` (hạ tầng) |
| Mạng/đường truyền | TLS bắt buộc, danh sách IP cho phép, xác thực SCRAM/x.509 |
| Sao lưu | Snapshot hằng ngày + oplog PITR ≥ 7 ngày; thử khôi phục định kỳ; bản sao lưu cũng mã hóa |
| Xóa/ẩn danh (FR-USR-07) | Ẩn danh `users` (xóa PII, giữ `_id`); `bookings.guest` giữ phần bắt buộc cho đối soát theo luật kế toán, che phần còn lại sau hạn pháp lý |
| Chống lạm dụng | Giới hạn tốc độ ở API; đếm đặt–hủy theo SĐT trong `bookings` (FR-CXL-13) |

---

## 9. Truy vấn mẫu cho các màn hình trọng yếu

### 9.1 Tìm khách sạn còn phòng theo sân bay (FR-SRC-01/02)
```js
// Bước 1: khách sạn ứng viên (lọc, phân trang, sắp theo km)
const hotels = db.hotels.find({
  status: "ACTIVE", "airports.iata": "HAN",
  amenities: { $all: ["SHUTTLE"] }
}).sort({ "airports.km": 1 }).limit(30)

// Bước 2: loại phòng của các khách sạn đó (đã lọc giá nếu cần)
const rts = db.room_types.find({ hotelId: { $in: ids }, active: true })

// Bước 3: các đoạn đặt giao với [from,to) — một aggregate cho cả lô
db.room_reservations.aggregate([
  { $match: {
      roomTypeId: { $in: rtIds },
      from: { $lt: to }, to: { $gt: from },
      $or: [ { state: { $in: ["CONFIRMED", "CHECKED_IN"] } },
             { state: "HOLD", holdExpiresAt: { $gt: now } } ] } },
  { $project: { roomTypeId: 1, from: 1, to: 1, qty: 1 } }
])
// Bước 4 (ứng dụng): sweep-line theo từng roomTypeId → số phòng tối thiểu còn lại → lọc hotelId có ≥ 1 phòng
```

### 9.2 Tra cứu đơn khách vãng lai (FR-BKG-08, SHT-03)
```js
db.bookings.findOne({ code, $or: [{ "guest.phone": phoneE164 }, { "guest.email": email }] })
db.bookings.find({ "guest.phone": phoneE164, status: { $in: ["CONFIRMED","CHECKED_IN"] } }).sort({ "stay.from": 1 })
```

### 9.3 Hàng đợi phân xe (FR-ADM-07, SHT-04)
```js
db.shuttle_legs.find({ status: "REQUESTED", scheduledAt: { $lte: in2Hours } }).sort({ scheduledAt: 1 })
```

### 9.4 Tổng quan khách sạn hôm nay (FR-HTL-07)
```js
db.bookings.find({ hotelId, status: "CONFIRMED", "stay.from": { $gte: startOfDay, $lt: endOfDay } })   // sắp check-in
db.bookings.find({ hotelId, status: "CHECKED_IN", "stay.to":   { $gte: startOfDay, $lt: endOfDay } })   // sắp check-out
db.rooms.aggregate([{ $match: { hotelId } }, { $group: { _id: "$status", n: { $sum: 1 } } }])
```

### 9.5 Dashboard Admin (FR-ADM-02)
```js
db.bookings.aggregate([ { $match: { createdAt: { $gte: today } } },
  { $group: { _id: "$status", n: { $sum: 1 }, totalVnd: { $sum: "$pricing.totalVnd" } } } ])
```
Báo cáo nặng (FR-ADM-10/17) chạy trên **secondary** (`readPreference: secondaryPreferred`) hoặc bảng tổng hợp ngày `daily_stats` (có thể thêm sau khi đo tải).

### 9.6 Đối soát phí tháng (FR-ADM-11)
```js
db.ledger_entries.aggregate([
  { $match: { hotelId, ts: { $gte: monthStart, $lt: monthEnd }, account: { $in: ["HOTEL_FEE_RECEIVABLE","HOTEL_PAYABLE","HOTEL_CLAWBACK"] } } },
  { $group: { _id: "$account", sumVnd: { $sum: "$amountVnd" } } } ])
```

---

## 10. Vòng đời dữ liệu và mở rộng

| Collection | Giữ | Cách xử lý |
|---|---|---|
| `bookings`, `payments`, `refunds`, `payouts`, `ledger_entries`, `settlements`, `disputes` | Theo luật kế toán (xác nhận kế toán, thường dài) | Không xóa; sau ≥ 24 tháng có thể chuyển sang collection/DB lưu trữ, giữ đủ để đối soát |
| `audit_logs` | 24 tháng nóng; ≥ 5 năm lưu trữ | Job xuất lạnh theo tháng |
| `vehicle_locations` | 30 ngày | TTL |
| `emergency_requests.location` | 90 ngày | Job `$unset` |
| `notifications`, `chat_*` | 180 ngày | TTL |
| `otp_sessions`, `sessions`, `idempotency_keys`, `flight_cache` | Vài phút → vài ngày | TTL |
| `outbox_events` | 7 ngày sau khi xong | TTL (partial) |
| `room_reservations` | Hoàn tất > 12 tháng | Dọn/lưu trữ để index gọn |

**Sharding:** chưa cần giai đoạn đầu. Nếu cần: `vehicle_locations` và `audit_logs` là ứng viên đầu tiên (khóa `{meta.legId, ts}` / `{hotelId, ts}`); `bookings` khóa `{hotelId, _id}` (đa số truy vấn đã kèm `hotelId`; tra theo `code` cần index toàn cục — cân nhắc khi vào quy mô lớn).

**Job nền (lịch):**

| Job | Chu kỳ | Collection chính |
|---|---|---|
| Nhả giữ chỗ/đơn hết hạn (T3) | 1 phút | `bookings`, `room_reservations` |
| Đánh dấu `NO_SHOW` | 5 phút | `bookings` |
| Truy vấn giao dịch MoMo treo (> 15 phút) | 5 phút | `payments` |
| Phát hiện lệnh hoàn quá hạn/thử lại hoàn | 10 phút | `refunds` |
| Sinh/duyệt lệnh chi đủ điều kiện | 15 phút | `payouts` |
| Theo dõi đổi giờ chuyến bay | 5–15 phút | `flight_watches` |
| Cảnh báo xe không đến (ETA+10') / chưa phân | 1 phút | `shuttle_legs` |
| Chốt đối soát phí tháng | Hằng tháng | `settlements`, `ledger_entries`, `clawbacks` |
| Đối soát ngày (cân bằng sổ cái, khớp MoMo) | Hằng ngày | `payments`, `ledger_entries` |
| Dọn vị trí khẩn cấp, lưu trữ nhật ký | Hằng ngày/tháng | `emergency_requests`, `audit_logs` |
| Cập nhật thống kê (`hotels.stats`, `rating`) kiểm tra chéo | Hằng ngày | `hotels`, `reviews` |

---

## 11. Mẫu validation (`$jsonSchema`) cho collection tài chính

Chỉ minh họa cho `payments`; áp tương tự cho `bookings`, `refunds`, `payouts`, `ledger_entries`. Dùng `validationLevel: "strict"`, `validationAction: "error"` ở môi trường chính thức.

```js
db.createCollection("payments", {
  validator: { $jsonSchema: {
    bsonType: "object",
    required: ["bookingId","hotelId","purpose","method","amountVnd","status","idempotencyKey","createdAt"],
    properties: {
      amountVnd: { bsonType: ["long","int"], minimum: 1 },
      method:    { enum: ["MOMO","AT_HOTEL"] },
      purpose:   { enum: ["BOOKING","CHANGE_TOPUP"] },
      status:    { enum: ["INITIATED","PENDING","SUCCEEDED","FAILED","EXPIRED","COLLECTED"] },
      idempotencyKey: { bsonType: "string", minLength: 8 }
    } } },
  validationLevel: "strict", validationAction: "error"
})
db.payments.createIndex({ idempotencyKey: 1 }, { unique: true })
db.payments.createIndex({ "momo.orderId": 1 }, { unique: true, partialFilterExpression: { "momo.orderId": { $exists: true } } })
```
Ví dụ ràng buộc `ledger_entries`: `amountVnd` kiểu `long` khác 0, `account` thuộc danh sách enum, `ref.type` bắt buộc.

---

## 12. Đối chiếu yêu cầu ↔ dữ liệu

| Yêu cầu | Collection |
|---|---|
| FR-FLT | `airports`, `flight_cache`, `flight_watches`, `bookings.flight` |
| FR-SRC | `hotels`, `room_types`, `room_reservations`, `reviews`, `users.favoriteHotelIds` |
| FR-BKG, BR-BKG | `bookings`, `room_reservations`, `inventory_locks`, `idempotency_keys` |
| FR-PAY, BR-PAY | `payments`, `ledger_entries`, `payouts`, `settlements` |
| FR-SHT, BR-SHT | `shuttle_legs`, `drivers`, `vehicles`, `vehicle_locations` |
| FR-USR | `users`, `otp_sessions`, `sessions` |
| FR-NTF | `notifications`, `notification_templates`, `outbox_events` |
| FR-SUP | `support_tickets`, `ticket_messages`, `emergency_requests`, `chat_sessions`, `chat_messages` |
| FR-HTL | `hotels`, `room_types`, `rooms`, `accounts`, `roles`, `settlements`, `bookings` |
| FR-ADM | `system_configs`, `audit_logs`, `accounts`, `roles`, `settlements`, `disputes` |
| FR-CXL / RFD / DSP, BR-CXL | `change_requests`, `refunds`, `clawbacks`, `payouts`, `disputes`, `vouchers`, `hotel_incidents` |
| DR-01…DR-20 | DR-01 `flight_cache`/`bookings.flight`; DR-02 `hotels`; DR-03 `room_types`/`rooms`; DR-04 `room_reservations`; DR-05/06 `bookings`; DR-07 `payments`/`refunds`/`payouts`; DR-08 `shuttle_legs`/`vehicles`/`drivers`; DR-09 `users`; DR-10 `accounts`/`roles`; DR-11 `support_tickets`/`emergency_requests`; DR-12 `reviews`; DR-13 `notifications`; DR-14 `settlements`; DR-15 `audit_logs`; DR-16 `system_configs`; DR-17 `change_requests`; DR-18 `refunds`; DR-19 `disputes`; DR-20 `clawbacks` |

---

## 13. Rủi ro thiết kế và điều cần xác nhận

| # | Rủi ro / điểm cần quyết | Đề xuất |
|---|---|---|
| D1 | **Tính tồn bằng sweep-line ở ứng dụng** phức tạp hơn bộ đếm; sai logic → bán vượt hoặc từ chối oan | Viết thư viện dùng chung + bộ test thuộc tính (property test) với hàng nghìn tổ hợp khoảng; chạy kiểm tra chéo hằng ngày: không thời điểm nào số phòng đang giữ > `totalRooms` |
| D2 | `inventory_locks` tạo **điểm nghẽn theo loại phòng** khi sự cố hàng loạt | Chấp nhận (vài trăm đơn/loại phòng/phút là thoải mái); đo; nếu cần chia khóa theo ngày |
| D3 | Tài liệu `bookings` lớn (nhúng nhiều) → cập nhật tốn | Giữ nhúng có giới hạn: `lines ≤ 10`, `statusHistory < 30`; vượt thì tách |
| D4 | Hợp nhất đơn vãng lai theo SĐT có thể gắn nhầm khi SĐT đổi chủ | Chỉ hợp nhất sau OTP; lưu `mergedAt`, cho phép tách lại qua Admin |
| D5 | CSFLE hạn chế truy vấn trên trường mã hóa | Giữ bản che (`last4`, `labelMasked`) cho tra cứu; truy cập bản đầy đủ chỉ qua API có quyền + audit |
| D6 | Sổ cái và `payments/refunds` có thể lệch nếu ghi sót | Mọi ghi tiền đi qua **một** hàm dịch vụ chung có transaction; job đối soát ngày cảnh báo lệch |
| D7 | Phiên bản MongoDB/hạ tầng (replica set, KMS) chưa chốt | Chọn trước khi dựng môi trường; Atlas hoặc tự quản trị đều đáp ứng |
| D8 | Tìm kiếm theo tên có dấu tiếng Việt | Lưu `searchText` không dấu + text index, hoặc dùng Atlas Search (analyzer tiếng Việt) nếu có |
| D9 | Tính tồn cho **gói giờ** phụ thuộc quy tắc kinh doanh (khoảng đệm, giờ nhận khách) | Bám BA §3.2 và P-13; xác nhận với 2–3 khách sạn thật trước khi chốt |
| D10 | Mô hình tiền "giữ hộ" (OQ-2-05) chưa qua pháp lý; `payouts`/`ledger` thiết kế theo mô hình đó | Nếu pháp lý yêu cầu tách tiền ngay tại cổng, bỏ `payouts` online, giữ `ledger_entries` và `settlements` |

**Việc làm tiếp theo gợi ý:** (1) PO/BA xác nhận mục 5.1 và 13; (2) viết script khởi tạo (`createCollection` + validator + index) và chạy thử trên replica set dev; (3) sinh dữ liệu giả 1.000 phòng/100.000 đơn để đo `explain()` cho các truy vấn mục 9; (4) viết thư viện tồn phòng + test thuộc tính; (5) cập nhật tài liệu này theo kết quả đo.
