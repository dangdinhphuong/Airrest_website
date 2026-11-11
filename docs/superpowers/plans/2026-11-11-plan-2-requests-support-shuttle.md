# Airrest Plan 2 — Yêu cầu đổi/hủy, Hỗ trợ, Xe đưa đón Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách (không tài khoản) gửi được yêu cầu hủy/đổi ngày, ticket hỗ trợ, yêu cầu xe đưa đón và tra cứu lại bằng mã + SĐT; khách sạn/admin xử lý bằng permission; FE các màn tương ứng chạy API thật thay mock.

**Architecture:** Ba module độc lập kiểu hiện có (router mỏng → service → SQL thuần), mỗi module một migration (005 change_requests, 006 support, 007 shuttle). Quyết định có điều kiện (phí hủy, giá xe) là hàm thuần trong `packages/business-logic` đọc tham số từ `system_configs`; mọi ghi dữ liệu trong `withTransaction` + `writeAudit`; hoàn tiền chỉ tạo bản ghi `refunds` PENDING (không gọi VNPay).

**Tech Stack:** Node 22, Express 5, zod 3, `pg` (SQL thuần), vitest + supertest (`RUN_DB_TESTS=1`), React/Vite (FE), npm workspaces (`backend`, `packages/*`, `apps/web`).

**Spec:** `docs/superpowers/specs/2026-11-11-airrest-remaining-flows-design.md` (mục 4: D3, D4, D5, D9; mục 5: ràng buộc). Tham chiếu nghiệp vụ: `docs/srs/SRS_V2_NenTang_Airrest.md` mục 3.5, 3.8, 3.11; `docs/srs/BA_PHAN_TICH_NGHIEP_VU_V2.md` mục 5 (mẫu phí hủy).

Quy ước lệnh (chạy từ thư mục `backend/` trừ khi ghi khác): test đơn vị `npx vitest run tests/<file>`; test tích hợp `RUN_DB_TESTS=1 npx vitest run tests/<file>`; kiểu `npm run typecheck`. Git theo CLAUDE.md: `git pull` (merge) trước khi sửa, không rebase; commit message tiếng Anh, thêm trailer attribution theo cấu hình repo.

## Global Constraints

(Trích nguyên văn từ spec mục 5.)

- Stack hiện có: Node 22 + Express 5 + zod 3 + `pg` (SQL thuần), vitest + supertest, React/Vite. Không thêm ORM.
- Migration SQL thuần `backend/database/migrations/00N_*.sql`, tiếp theo là **003**. Mỗi luồng một file, theo thứ tự. Mỗi file kèm cập nhật `docs/postgres/README.md`.
- Mọi ghi dữ liệu đi qua transaction `withTransaction` và gọi `writeAudit` cùng transaction.
- Route khách (không đăng nhập) dùng `strictRateLimit` và `Idempotency-Key` với thao tác tạo.
- Id là uuid; phân trang keyset theo `seq`.
- Mỗi route mới phải cập nhật `api/openapi.ts` (Swagger) và file Postman.
- Sự kiện thay đổi booking đi qua `bookingEvents` để Socket.io đẩy tới giao diện.
- Test: mỗi luồng có test tích hợp (`RUN_DB_TESTS=1`); trạng thái cuối `npm run typecheck` sạch.
- Không in/lưu bí mật; `.env` là bí mật.

Ràng buộc thêm của plan này (từ yêu cầu giao việc): migration của plan này đánh số **005, 006, 007** (003-004 thuộc Plan 1); thanh toán/VNPay tạm dừng nên không gọi cổng, chỗ cần hoàn tiền chỉ `INSERT refunds ... status 'PENDING'`; mọi luồng phải chạy khi thanh toán tắt (đặt `AT_HOTEL`).

## Review Focus

Năm nhóm đầu vào/lỗi dễ cắn nhất mà các bước chức năng ít nghĩ tới. Mỗi dòng có test đặt tên rõ trong task sở hữu (chạy lại các test này khi review).

1. **Trùng/lặp yêu cầu cho cùng booking** (hai yêu cầu hủy song song; bấm duyệt hai lần song song; gửi lại cùng `Idempotency-Key`): Task 3 (`đồng thời 2 yêu cầu hủy cùng booking: 1 thành công, 1 REQUEST_ALREADY_PENDING`, `Idempotency-Key lặp trả lại kết quả cũ`), Task 4 (`duyệt hủy hai lần song song chỉ tạo 1 lệnh hoàn`).
2. **Hủy/đổi khi booking không còn ở trạng thái cho phép** (CHECKED_IN, CHECKED_OUT, CANCELLED, REJECTED, EXPIRED, NO_SHOW; hoặc booking chuyển CHECKED_IN sau khi khách đã gửi yêu cầu): Task 3 (`hủy đơn đã CHECKED_IN -> 409 BOOKING_NOT_CANCELLABLE`), Task 4 (`duyệt khi booking đã CHECKED_IN -> 409, không nhả phòng, không tạo hoàn`).
3. **Phí hủy tại đúng mốc giờ** (đúng 24h/2h, lệch 1 ms, check-in đã qua, duyệt muộn không đổi phí vì mốc tính lúc gửi — BR-CXL-03): Task 2 (bảng mốc đơn vị), Task 3 (`mốc đúng 24h trước check-in (STANDARD) -> miễn phí; lệch 1ms -> giữ 50%`), Task 4 (`phí lấy từ báo giá lúc gửi, không tính lại lúc duyệt`).
4. **Đoán mã của người khác** (đúng mã sai SĐT, mã ticket/booking không tồn tại phải cho cùng một phản hồi 404; vượt 10 lần/phút → 429; khách sạn A thao tác yêu cầu/xe của khách sạn B → 404; ghi chú nội bộ ticket không lộ cho khách): Task 3, 6, 7, 9 (`sai SĐT và mã không tồn tại cho cùng body 404`, `rate limit 429 sau 10 lần dò`, `khách sạn khác -> 404`, `ghi chú nội bộ không có trong tra cứu của khách`).
5. **Yêu cầu xe không hợp lệ** (booking CANCELLED/REJECTED/EXPIRED/PENDING_PAYMENT; giờ đón ngoài khoảng lưu trú; sân bay khách sạn không phục vụ; vượt `maxKm`; trùng yêu cầu đang hoạt động; booking bị hủy sau khi đã có xe → xe tự CANCELLED; phụ thu đêm đúng 22:00/06:00 giờ VN): Task 8 (`...409 BOOKING_NOT_ELIGIBLE`, `422 PICKUP_OUT_OF_STAY_WINDOW`, `422 AIRPORT_NOT_SERVED`, `422 SHUTTLE_OUT_OF_RANGE`, `409 SHUTTLE_ALREADY_REQUESTED`, bảng mốc phụ thu), Task 9 (`duyệt hủy booking -> xe REQUESTED/ASSIGNED thành CANCELLED`).

## Interfaces dùng chung giữa các task (đồng bộ tên)

| Tên | Nơi | Ghi chú |
|---|---|---|
| `PERM.REQUEST_HANDLE='request:handle'`, `PERM.SUPPORT_HANDLE='support:handle'`, `PERM.SHUTTLE_HANDLE='shuttle:handle'` | `backend/config/permissions.ts` | Task 1 |
| Config key `cancellation.fee` | `backend/config/configKeys.ts` | Task 1; dùng ở Task 3, 5 |
| `cancellationQuote()`, `changeQuote()` | `packages/business-logic/src/cancellation.ts` | Task 2 |
| `shuttlePrice()` | `packages/business-logic/src/shuttle.ts` | Task 8 |
| Bảng `change_requests` / `support_tickets`, `support_messages` / `shuttle_requests` | migration 005 / 006 / 007 | Task 3 / 6 / 8 |
| `services/changeRequests/changeRequests.service.ts`, `services/support/support.service.ts`, `services/shuttle/shuttle.service.ts` | backend | |
| `cancelShuttlesForBooking(tx, bookingId, actor, note, requestId?)` | shuttle.service | Task 9 tạo; Task 4 gọi; Plan 1 (reject/expire) nên gọi |
| Helper test `backend/tests/support/flows.ts` | backend | Task 1 |
| Router: `/v1/change-requests` (khách), `/v1/hotel/change-requests` (nhân sự, cả admin có `hotel:scope:all`), `/v1/support`, `/v1/admin/support`, `/v1/shuttle-requests`, `/v1/hotel/shuttle-requests` | `backend/api/modules/*` | |

**Consumes từ Plan 1 (giả định theo spec, chưa đọc plan 1):**
- Booking có các trạng thái `PENDING`, `CONFIRMED`, `REJECTED`, `EXPIRED` (đã có sẵn trong CHECK của `bookings.status`; Plan 1 làm cho chúng thực sự được dùng). Test của plan này **không** dựa vào hành vi Plan 1: đặt trạng thái bằng helper SQL `setStatus`.
- Nhả phòng qua `room_reservations.state = 'RELEASED'` (đã có trong CHECK).
- `services/rooms/availability.ts` xuất `isRoomAvailable(tx: Db, a: { roomTypeId: string; from: Date; to: Date; qty: number; excludeBookingId?: string; now?: Date }): Promise<boolean>` có trừ `room_blocks` (spec D7). Task 5 bước 0 kiểm tra; nếu Plan 1 chưa xuất ra hàm đúng chữ ký này, tạo wrapper mỏng cùng tên trong `services/rooms/availability.ts` bằng cách tái dùng `canBook`/`isActive` và trừ `room_blocks` theo cấu trúc bảng Plan 1 (đọc `003/004_*.sql`).
- `emitBookingChange` (đã có). Plan 1 có thể mở rộng payload; không phá chữ ký.
- Gộp file dùng chung (`permissions.ts`, `roles.ts`, `modules/index.ts`, `admin.router.ts`, `openapi.ts`, Postman, `packages/validation/src/index.ts`, `docs/postgres/README.md`): chỉ **thêm dòng**, không sắp xếp lại; xung đột khi merge giải quyết bằng giữ cả hai phía.

**Produces cho plan khác:** `cancelShuttlesForBooking` (Plan 1 gọi khi reject/EXPIRED để xe không mồ côi); số liệu dashboard (Plan 3): `change_requests.status='PENDING'`, `support_tickets.status IN ('OPEN','IN_PROGRESS')`, `shuttle_requests.status`.

---

### Task 1: Nền tảng — quyền, cấu hình phí hủy, helper test

**Files:**
- Modify: `backend/config/permissions.ts`, `backend/config/roles.ts`, `backend/config/configKeys.ts`, `backend/database/scripts/seed.ts` (vai trò `reception`), `backend/lib/codes.ts`, `backend/api/middleware/rateLimit.ts` (không sửa logic; chỉ kiểm tra), `backend/api/openapi.ts` (tag mới)
- Create: `backend/tests/support/flows.ts`
- Test: `backend/tests/foundations.integration.test.ts`

**Interfaces:**
- Produces: `PERM.REQUEST_HANDLE | SUPPORT_HANDLE | SHUTTLE_HANDLE`; `CONFIG_KEYS['cancellation.fee']`; `generateTicketCode(): string` (`SP-` + 8 ký tự Crockford, dùng chung bảng chữ của `generateBookingCode`).
- Giá trị `cancellation.fee` (mặc định theo BA §5, chờ PO xác nhận): schema `{ FLEXIBLE, STANDARD, NON_REFUNDABLE }`, mỗi phần tử là `{ freeHours: int(0..720)|null, partialHours: int(0..720)|null, partialBps: int(0..10000), lateBps: int(0..10000), base: 'FIRST_NIGHT'|'ALL_NIGHTS' }`. Mặc định: `FLEXIBLE {freeHours:2, partialHours:null, partialBps:0, lateBps:10000, base:'FIRST_NIGHT'}`, `STANDARD {freeHours:24, partialHours:2, partialBps:5000, lateBps:10000, base:'FIRST_NIGHT'}`, `NON_REFUNDABLE {freeHours:null, partialHours:null, partialBps:10000, lateBps:10000, base:'ALL_NIGHTS'}`. `writePerm: PERM.ADMIN_CONFIG_WRITE`. Ngữ nghĩa `null` = không có cửa sổ đó.
- Gán quyền (D9, chỉ theo permission): `HOTEL_OWNER_ROLE` + `reception` (seed): `request:handle`, `shuttle:handle`; `ADMIN_ROLES.SYSADMIN`: cả ba; `SUPPORT`: `support:handle`; `OPS`: `shuttle:handle` **và** `hotel:scope:all` (để dùng cùng router `/v1/hotel/shuttle-requests` mà không bị `hotelScope` chặn; OPS không có `booking:read` nên không mở thêm route đặt phòng).
- Helper test (`flows.ts`): `guestIp(n: number): Record<string,string>` (header `X-Forwarded-For: 10.9.0.n`, app đã `trust proxy 1` nên mỗi n là một bucket rate limit); `createBookingVia(app, o: { hotelId; roomTypeId; phone?; paymentMethod?: 'AT_HOTEL'|'VNPAY'; qty? }): Promise<{ id: string; code: string; phone: string }>` (gọi `POST /v1/bookings` kèm `Idempotency-Key` ngẫu nhiên; đặt `from` = 10 ngày sau, 1 đêm); `setStay(bookingId, from: Date, nights = 1)` (cập nhật `bookings.stay`, `stay_from`, và `room_reservations.starts_at/ends_at`); `setStatus(bookingId, status)` (cập nhật `bookings.status` và đồng bộ `room_reservations.state`: CONFIRMED→CONFIRMED, CHECKED_IN→CHECKED_IN, PENDING→HOLD); `payBooking(app, code)` (đọc `txn_ref` từ `payments`, gọi `POST /v1/payments/vnpay/dev-simulate {orderId}`; dùng cho đơn VNPAY để có `paid_vnd` + payment SUCCEEDED); `mkStaff(o: { hotelId?: string; permissions: string[]; email: string }): Promise<{ id: string; headers: { Authorization: string } }>` (tạo role khách sạn hoặc dùng role hệ thống theo `adminRole`, tạo account, ký `signAccountToken`).

- [ ] **Step 1: Viết test thất bại** — `foundations.integration.test.ts`:
  - `it('cấu hình cancellation.fee có mặc định đúng và parse được')`: `CONFIG_KEYS['cancellation.fee'].schema.parse(default)` không ném; `default.STANDARD.freeHours === 24`.
  - `it('GET /v1/admin/configs liệt kê cancellation.fee ở version 0')` (token SYSADMIN): `items.find(i=>i.key==='cancellation.fee')` toMatchObject `{ version: 0, isDefault: true }`.
  - `it('vai trò được gán đúng quyền mới')`: sau `freshDb({roles:true})`, `roles` có `SUPPORT` chứa `support:handle` và **không** chứa `request:handle`; `OPS` chứa `shuttle:handle` và `hotel:scope:all`; `hotel_owner` chứa `request:handle` và `shuttle:handle`; `SYSADMIN` chứa cả ba.
  - `it('generateTicketCode đúng định dạng')`: khớp `/^SP-[0-9A-HJKMNP-TV-Z]{8}$/`.
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/foundations.integration.test.ts` → FAIL (`cancellation.fee` undefined, `generateTicketCode` is not a function).
- [ ] **Step 3: Implement** — thêm 3 mã vào `PERM`; thêm key `cancellation.fee` vào `CONFIG_KEYS` (đặt cạnh `cancellation.limits`, có comment BA §5); sửa `roles.ts` theo bảng gán quyền; sửa `seed.ts`: `INSERT roles reception ... ON CONFLICT ... DO UPDATE SET permissions = EXCLUDED.permissions` (hiện chỉ `SET name = roles.name` nên DB cũ không nhận quyền mới) kèm thêm 2 quyền; refactor `codes.ts` thành hàm nội bộ `gen(prefix)` + export `generateBookingCode` (giữ nguyên hành vi) và `generateTicketCode`; viết `flows.ts`; thêm các tag `Requests (khách)`, `Requests (nhân sự)`, `Support (khách)`, `Admin · Support`, `Shuttle (khách)`, `Shuttle (nhân sự)` vào `openapi.tags`.
- [ ] **Step 4: Chạy pass** — cùng lệnh → PASS; chạy toàn bộ `RUN_DB_TESTS=1 npx vitest run` để chắc test admin/booking cũ vẫn xanh (đặc biệt test đếm quyền/khóa cấu hình); `npm run typecheck` sạch.
- [ ] **Step 5: Commit** — `feat(config): add request/support/shuttle permissions, cancellation.fee config, test flows helper`.

**Deliverable:** test nền tảng xanh + `flows.ts` dùng được cho mọi task sau.

---

### Task 2: Hàm thuần tính phí hủy và chênh lệch đổi ngày

**Files:**
- Create: `packages/business-logic/src/cancellation.ts`
- Modify: `packages/business-logic/src/index.ts` (thêm `export * from './cancellation';`)
- Test: `backend/tests/cancellation.unit.test.ts`

**Interfaces:**
- Consumes: `ServiceFeeParams`, `serviceFee` từ `pricing.ts`.
- Produces:
  - `export interface CancellationTier { freeHours: number|null; partialHours: number|null; partialBps: number; lateBps: number; base: 'FIRST_NIGHT'|'ALL_NIGHTS' }`
  - `cancellationQuote(i: { tier: CancellationTier; checkInAt: Date; now: Date; roomVnd: number; nights: number; serviceFeeVnd: number; totalVnd: number; paidVnd: number; refundedVnd: number }): { tier: 'FREE'|'PARTIAL'|'LATE'; hoursBefore: number; keepVnd: number; refundVnd: number }`
  - `changeQuote(i: { unitPriceVnd: number; qty: number; oldNights: number; newNights: number; oldTotalVnd: number; fee: ServiceFeeParams }): { newRoomVnd: number; newServiceFeeVnd: number; newTotalVnd: number; diffVnd: number }` (`diffVnd = newTotalVnd - oldTotalVnd`; giá đơn vị giữ theo đơn gốc — spec D3).
- Thuật toán cố định (không suy ra từ tên): `hoursBefore = (checkInAt - now)/3.6e6` (có thể âm). Chọn bậc: `freeHours!==null && hoursBefore >= freeHours` → FREE (keep 0); else `partialHours!==null && hoursBefore >= partialHours` → PARTIAL với `bps=partialBps`; else LATE với `bps=lateBps`. Cơ sở giữ: `base==='ALL_NIGHTS' ? roomVnd : Math.round(roomVnd / nights)`; `keepRoom = Math.round(base * bps / 10000)`. BR-CXL-06: `keepVnd = keepRoom + (keepRoom > 0 ? serviceFeeVnd : 0)` (phí dịch vụ không hoàn khi hủy có phạt). `refundVnd = max(0, min(paidVnd - refundedVnd, totalVnd - keepVnd))`.

- [ ] **Step 1: Viết test thất bại** — `cancellation.unit.test.ts`, đơn gốc phòng 600.000 × 1 đêm, phí DV 12.000, tổng 612.000, đã thu 612.000, `now` cố định, `checkInAt = now + h`:
  - `STANDARD h=30` → `{tier:'FREE', keepVnd:0, refundVnd:612000}`.
  - `STANDARD đúng 24h` → `FREE`; `STANDARD 24h - 1ms` → `{tier:'PARTIAL', keepVnd:312000, refundVnd:300000}`.
  - `STANDARD đúng 2h` → `PARTIAL`; `2h - 1ms` → `{tier:'LATE', keepVnd:612000, refundVnd:0}`.
  - `FLEXIBLE đúng 2h` → `FREE`; `FLEXIBLE 2h - 1ms` → `LATE` keep 612000.
  - `check-in đã qua (h = -1)` → `LATE`, `refundVnd 0`.
  - `NON_REFUNDABLE h=500` → `LATE`... (freeHours null, partialHours null) keepVnd 612000 refund 0.
  - `đơn 3 đêm (room 1.800.000, fee 36.000, total 1.836.000), STANDARD h=10` → `base FIRST_NIGHT` keepRoom 300.000, `keepVnd 336000`, `refundVnd 1500000`.
  - `chưa thu tiền (paidVnd 0)` → `refundVnd 0` nhưng `keepVnd` vẫn tính (để báo giá cho đơn trả tại khách sạn).
  - `đã hoàn một phần (refundedVnd 100000, paid 612000)` → `refundVnd ≤ 512000`.
  - `changeQuote 3 đêm -> 2 đêm, unit 600000 qty 1, fee {bps:200,minVnd:10000,roundToVnd:1000}` → `{newRoomVnd:1200000,newServiceFeeVnd:24000,newTotalVnd:1224000,diffVnd:-612000}`; `1 đêm -> 3 đêm` → `diffVnd:+1224000`.
- [ ] **Step 2: Chạy xem fail** — `npx vitest run tests/cancellation.unit.test.ts` → FAIL (module/exports chưa có).
- [ ] **Step 3: Implement** — theo thuật toán đã cố định ở trên; không đọc DB, không `new Date()` (nhận `now` qua tham số).
- [ ] **Step 4: Chạy pass** — cùng lệnh → PASS; `npm run typecheck` sạch.
- [ ] **Step 5: Commit** — `feat(business-logic): cancellation fee and date-change quote`.

**Deliverable:** bảng mốc giờ (24h/2h/±1ms) được khóa bằng test đơn vị.

---

### Task 3: Migration 005 + khách gửi yêu cầu hủy/đổi và tra cứu

**Files:**
- Create: `backend/database/migrations/005_change_requests.sql`, `packages/validation/src/changeRequests.ts`, `backend/services/changeRequests/changeRequests.service.ts`, `backend/api/modules/changeRequests/changeRequests.router.ts`
- Modify: `packages/validation/src/index.ts`, `packages/shared-types/src/index.ts` (thêm `ChangeRequestStatus`, `ChangeRequestType`), `backend/database/types.ts` (`ChangeRequestDoc`; mở rộng `RefundDoc['reasonCode']` thêm `'CANCEL_APPROVED' | 'CHANGE_DOWNSIZE'`), `backend/api/modules/index.ts`, `backend/api/openapi.ts`, `backend/docs/Airrest_Admin_API.postman_collection.json`, `docs/postgres/README.md`
- Test: `backend/tests/changeRequests.integration.test.ts`

**Interfaces:**
- Consumes: `lookupBooking(code, phone)` (404 chung `BOOKING_NOT_FOUND`), `getConfig('cancellation.fee')`, `getConfig('pricing.serviceFee')`, `cancellationQuote`, `changeQuote` (Task 2), `idempotent`, `strictRateLimit`, `validate`, `emitBookingChange`, `writeAudit`, `actorOf`.
- Bảng `change_requests`: `id uuid PK`, `seq bigint identity unique`, `booking_id uuid NOT NULL → bookings`, `hotel_id uuid NOT NULL → hotels`, `type text CHECK ('CANCEL','CHANGE')`, `status text CHECK ('PENDING','APPROVED','REJECTED')`, `reason_code text NOT NULL`, `reason_note text`, `new_from timestamptz`, `new_to timestamptz` (CHECK: `(type='CHANGE') = (new_from IS NOT NULL AND new_to IS NOT NULL)`), `quote jsonb NOT NULL`, `requested_by jsonb NOT NULL`, `decided_by jsonb`, `decided_at timestamptz`, `decision_note text`, `created_at`, `updated_at`. Index: `UNIQUE (booking_id) WHERE status='PENDING'` (tên `change_requests_one_pending`), `(hotel_id, status, seq DESC)`, `(booking_id, seq DESC)`.
- Validation (`changeRequests.ts`): `REASON_CODES = ['CHANGE_OF_PLAN','FLIGHT_CANCELLED','FLIGHT_RESCHEDULED','HEALTH','OTHER']` (BR-CXL-01; `OTHER` bắt buộc `reasonNote` ≥ 3 ký tự); `cancelQuoteBody = lookupBody`; `createChangeRequestBody` = union theo `type`: `{code, phone, type:'CANCEL', reasonCode, reasonNote?}` hoặc `{code, phone, type:'CHANGE', reasonCode, reasonNote?, newFrom: coerce.date, newTo: coerce.date}` với `newTo > newFrom` và `newFrom` không ở quá khứ (cùng quy tắc `createBookingBody`); `reasonNote` ≤ 500; `decideBody {note?: ≤500}`; `rejectBody {note: min(3) max(500)}`; `staffRequestsQuery {status?: 'PENDING'|'APPROVED'|'REJECTED', limit, cursor}` (kiểu `staffListQuery`).
- Service: `quoteCancellation(code, phone): Promise<{ bookingCode; status; tier; hoursBefore; keepVnd; refundVnd; template }>`; `createChangeRequest(input, requestId?): Promise<ChangeRequestDoc>`; `listGuestRequests(code, phone): Promise<GuestRequestView[]>` với `GuestRequestView = { id, type, status, reasonCode, newFrom?, newTo?, quote, decisionNote?, decidedAt?, createdAt, refund?: { status, amountVnd, dueAt } }` (JOIN `refunds.key = 'cancel:' || cr.id`; **không** có `hotelId`, `decided_by`).
- Quy tắc nghiệp vụ trong `createChangeRequest` (một transaction, khóa `bookings` hàng `FOR UPDATE`): booking CANCEL hợp lệ khi `status IN ('PENDING_PAYMENT','PENDING','CONFIRMED')`, CHANGE khi `status IN ('PENDING','CONFIRMED')`, ngược lại `409 BOOKING_NOT_CANCELLABLE` / `409 BOOKING_NOT_CHANGEABLE`; đã có yêu cầu PENDING → `409 REQUEST_ALREADY_PENDING` (bắt cả `isDuplicateKey` của index một phần); CHANGE với ngày mới trùng ngày cũ → `422 CHANGE_SAME_DATES`; CHANGE của đơn có `hotels.policy.cancellationTemplate='NON_REFUNDABLE'` mà check-in còn < 24h → `409 CHANGE_NOT_ALLOWED` (BR-CXL-07); báo giá lưu vào `quote` **tại thời điểm gửi** (BR-CXL-03): CANCEL → `{kind:'CANCEL', template, configVersion, ...cancellationQuote}`, CHANGE → `{kind:'CHANGE', newNights, ...changeQuote}` với `fee` lấy từ `pricing.serviceFee` hiện hành; `requested_by = {type:'GUEST'}`; audit `CHANGE_REQUEST.CREATE` (có `hotelId`, `bookingId`); sau commit `emitBookingChange` với trạng thái booking hiện tại, `isNew:false` (để lễ tân thấy realtime).
- Route khách (mount `/v1/change-requests`, mọi route `strictRateLimit`): `POST /quote` (body `lookupBody`) → `200 { quote }`; `POST /` (`idempotent('changeRequest.create')`) → `201 { request }`; `POST /lookup` (body `lookupBody`) → `200 { requests }`.

- [ ] **Step 1: Viết test thất bại** — `changeRequests.integration.test.ts` (`freshDb({roles:true})`; khách sạn `mkHotel` template FLEXIBLE và một khách sạn `STANDARD`, `mkRoomType`; mỗi test dùng `guestIp(n)` riêng):
  - `it('báo giá hủy: STANDARD còn 30h -> hoàn 100%')`: `createBookingVia` VNPAY + `payBooking`, `setStay(id, now+30h)`; `POST /v1/change-requests/quote` → `200`, `quote.tier === 'FREE'`, `quote.refundVnd === paidVnd`.
  - `it('mốc đúng 24h trước check-in (STANDARD) -> miễn phí; lệch 1ms -> giữ 50%')`: `vi.useFakeTimers({ toFake: ['Date'] })`, `setStay(id, T)`, `vi.setSystemTime(T - 24h)` → quote FREE; `vi.setSystemTime(T - 24h + 1)` → `tier 'PARTIAL'`, `keepVnd === 312000` (với giá phòng 600k); `vi.useRealTimers()` ở `afterEach`.
  - `it('tạo yêu cầu hủy: 201, lưu quote lúc gửi, audit CHANGE_REQUEST.CREATE')`: `body.request.status === 'PENDING'`; `count('audit_logs', "action = 'CHANGE_REQUEST.CREATE'") === 1`; response không có `hotelId`, `decidedBy`.
  - `it('đồng thời 2 yêu cầu hủy cùng booking: 1 thành công, 1 REQUEST_ALREADY_PENDING')`: `Promise.all` hai request khác `Idempotency-Key` → statuses sort `[201, 409]`, `error.code === 'REQUEST_ALREADY_PENDING'`, `count('change_requests') === 1`.
  - `it('Idempotency-Key lặp trả lại kết quả cũ')`: cùng key + body → lần 2 header `idempotent-replay: true`, cùng `request.id`; thiếu key → `400 IDEMPOTENCY_KEY_REQUIRED`.
  - `it('hủy đơn đã CHECKED_IN -> 409 BOOKING_NOT_CANCELLABLE')` và lặp cho `CHECKED_OUT`, `CANCELLED`, `REJECTED`, `EXPIRED`, `NO_SHOW` (vòng lặp dùng `setStatus`/UPDATE trực tiếp); không tạo bản ghi `change_requests`.
  - `it('đổi ngày đơn CHECKED_IN -> 409 BOOKING_NOT_CHANGEABLE')`; `it('đổi ngày trùng ngày cũ -> 422 CHANGE_SAME_DATES')`; `it('đổi ngày của gói NON_REFUNDABLE còn <24h -> 409 CHANGE_NOT_ALLOWED')`; `it('OTHER không có reasonNote -> 422 VALIDATION_ERROR')`; `it('newTo <= newFrom -> 422')`.
  - `it('sai SĐT và mã không tồn tại cho cùng body 404')`: so sánh `res.body.error` hai trường hợp bằng nhau (`BOOKING_NOT_FOUND`) ở cả `/quote`, `/` và `/lookup`.
  - `it('rate limit 429 sau 10 lần dò')`: 11 lần `POST /lookup` từ `guestIp(99)` → lần thứ 11 `429`, `error.code === 'RATE_LIMITED'`.
  - `it('tra cứu: khách thấy yêu cầu của mình, không thấy của booking khác cùng SĐT khác')`.
  - `it('phát sự kiện bookingEvents khi gửi yêu cầu')`: lắng nghe `bookingEvents.on('change')` → nhận `{code, hotelId}`.
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/changeRequests.integration.test.ts` → FAIL (404 route `/v1/change-requests/...`, bảng không tồn tại).
- [ ] **Step 3: Implement** — viết migration 005 (comment tiếng Việt theo phong cách 001); thêm `ChangeRequestDoc` (camelCase) và union reasonCode; service + router theo các quy tắc ở Interfaces; gắn `v1Router.use('/change-requests', guestChangeRequestsRouter)` ở `modules/index.ts`; `openapi.ts`: path `/v1/change-requests`, `/v1/change-requests/quote`, `/v1/change-requests/lookup` (tag `Requests (khách)`, `public: true`, header `Idempotency-Key` cho POST `/`) + schema `CreateChangeRequest`; Postman: thêm folder `7. Khách: đổi/hủy booking` với 3 request (dùng biến `{{bookingCode}}`, `{{guestPhone}}`; thêm hai biến vào `variable`); `docs/postgres/README.md`: thêm dòng bảng `change_requests` (mục đích, index một phần, quote jsonb lưu mốc lúc gửi).
- [ ] **Step 4: Chạy pass** — cùng lệnh → PASS; `npm run typecheck` sạch; chạy lại `tests/booking.integration.test.ts` để chắc không vỡ.
- [ ] **Step 5: Commit** — `feat(requests): change_requests migration and guest cancel/change request API`.

**Deliverable:** khách gửi/tra cứu được yêu cầu hủy-đổi, báo giá đúng mốc, chống trùng và dò mã.

---

### Task 4: Nhân sự duyệt/từ chối yêu cầu HỦY (nhả phòng, lệnh hoàn PENDING)

**Files:**
- Modify: `backend/services/changeRequests/changeRequests.service.ts`, `backend/api/modules/changeRequests/changeRequests.router.ts` (thêm `hotelChangeRequestsRouter`), `backend/api/modules/index.ts`, `backend/api/openapi.ts`, Postman, `docs/postgres/README.md` (mục lệnh hoàn do hủy: `reason_code='CANCEL_APPROVED'`, `key='cancel:<requestId>'`)
- Test: `backend/tests/changeRequests.integration.test.ts` (thêm `describe('xử lý yêu cầu hủy')`)

**Interfaces:**
- Consumes: `hotelScope(auth)` (từ `bookings.service`), `newVnpOrder` (chỉ để dựng `refunds.gateway` NOT NULL — không gọi cổng), `emitBookingChange`.
- Produces (service): `listStaffRequests(auth: AuthContext, q: StaffRequestsQuery): Promise<{ items: StaffRequestView[]; nextCursor: number|null }>` (JOIN bookings lấy `bookingCode`, `guestName`, `stay`; lọc `hotel_id` bằng scope; keyset `seq <`), `approveRequest(auth, id, note: string|undefined, requestId?)`, `rejectRequest(auth, id, note: string, requestId?)`.
- Route (mount `/v1/hotel/change-requests`, `authenticate` + `requirePermission(PERM.REQUEST_HANDLE)`): `GET /` (query `staffRequestsQuery`), `POST /:id/approve` (body `decideBody`), `POST /:id/reject` (body `rejectBody`), params `idParams`. Admin có `hotel:scope:all` dùng cùng route (xem tài khoản thấy mọi khách sạn).
- `approveRequest` cho `type='CANCEL'` trong **một** `withTransaction`: (1) `SELECT ... FROM change_requests WHERE id=$1 [AND hotel_id=$scope] FOR UPDATE` — không thấy → `404 REQUEST_NOT_FOUND` (không phân biệt khác khách sạn); (2) nếu đã `APPROVED` → trả lại kết quả cũ (200, BR-CXL-12); nếu `REJECTED` → `409 REQUEST_ALREADY_DECIDED`; (3) khóa `bookings` hàng; `status` không còn trong `('PENDING_PAYMENT','PENDING','CONFIRMED')` → `409 BOOKING_NOT_CANCELLABLE` (yêu cầu vẫn PENDING để nhân sự từ chối); (4) `UPDATE bookings SET status='CANCELLED', status_history = status_history || [{from,to,at,by,reasonCode}], v=v+1, updated_at`; (5) `UPDATE room_reservations SET state='RELEASED' WHERE booking_id=$1 AND state IN ('HOLD','CONFIRMED')`; (6) hoàn tiền: `refundVnd = min(quote.refundVnd, paid_vnd - refunded_vnd)`; nếu `> 0` và tồn tại `payments` SUCCEEDED mới nhất của đơn → `INSERT refunds (id, booking_id, hotel_id, payment_id, key='cancel:'||requestId, amount_vnd, reason_code='CANCEL_APPROVED', method='VNPAY', status='PENDING', gateway=newVnpOrder('RF'+code), due_at = now + 24h, ...)` — **không gọi `processRefund`**; đơn trả tại khách sạn/chưa thu → không tạo; (7) `UPDATE change_requests SET status='APPROVED', decided_by, decided_at, decision_note`; (8) `writeAudit` `CHANGE_REQUEST.APPROVE` (after: `{refundId?, refundVnd, keepVnd}`) và `BOOKING.CANCEL`; (9) sau commit `emitBookingChange` trạng thái `CANCELLED`, `isNew:false`.
- `rejectRequest`: chỉ khi `PENDING` (đã `REJECTED` → trả lại kết quả cũ; đã `APPROVED` → 409), cập nhật `REJECTED`, `decision_note`, audit `CHANGE_REQUEST.REJECT`, emit sự kiện booking (trạng thái không đổi). Không đổi booking.
- Cascade xe (FR-CXL-11) thêm ở Task 9 (bảng `shuttle_requests` chưa có ở task này).

- [ ] **Step 1: Viết test thất bại** — thêm vào `changeRequests.integration.test.ts` (staff dùng `mkStaff({ hotelId, permissions:[PERM.REQUEST_HANDLE] })`):
  - `it('thiếu quyền -> 403; không token -> 401')` cho `GET /v1/hotel/change-requests`.
  - `it('lễ tân chỉ thấy yêu cầu của khách sạn mình')`: hai khách sạn, mỗi bên một yêu cầu → mỗi token chỉ thấy 1; admin (`SYSADMIN`) thấy cả 2; phân trang `limit=1` trả `nextCursor`.
  - `it('khách sạn khác duyệt/từ chối -> 404 REQUEST_NOT_FOUND')`, booking vẫn nguyên trạng.
  - `it('duyệt hủy đơn đã thu tiền: booking CANCELLED, phòng RELEASED, tạo 1 refund PENDING đúng số tiền')`: `expect(booking.status).toBe('CANCELLED')`; `one("SELECT state FROM room_reservations WHERE booking_id=$1")` = `'RELEASED'`; `refunds` có 1 dòng `{status:'PENDING', reasonCode:'CANCEL_APPROVED', amountVnd: quote.refundVnd, key:'cancel:<id>'}`; `refunds.due_at > now`; **không có** thay đổi `bookings.refunded_vnd` (chưa thực thi); audit có `CHANGE_REQUEST.APPROVE` và `BOOKING.CANCEL` cùng `request_id`.
  - `it('duyệt hủy đơn trả tại khách sạn: CANCELLED, không tạo refund')`: `count('refunds') === 0`.
  - `it('phí lấy từ báo giá lúc gửi, không tính lại lúc duyệt')`: gửi yêu cầu ở `vi.setSystemTime(T-24h+1)` (PARTIAL 50%, đơn STANDARD đã thu), khôi phục `useRealTimers`, duyệt → `refund.amountVnd === 300000`; không phải 612000 và không phải 0 dù hiện tại lệch mốc.
  - `it('duyệt hủy hai lần song song chỉ tạo 1 lệnh hoàn')`: `Promise.all` hai `approve` → cả hai `200`, `count('refunds') === 1`, `count('audit_logs', "action='CHANGE_REQUEST.APPROVE'") === 1`.
  - `it('duyệt rồi từ chối (hoặc ngược lại) -> 409 REQUEST_ALREADY_DECIDED')`.
  - `it('duyệt khi booking đã CHECKED_IN -> 409, không nhả phòng, không tạo hoàn')`: tạo yêu cầu khi CONFIRMED, `setStatus(id,'CHECKED_IN')`, duyệt → `409 BOOKING_NOT_CANCELLABLE`; `room_reservations.state === 'CHECKED_IN'`, `count('refunds') === 0`, yêu cầu còn `PENDING`.
  - `it('từ chối bắt buộc lý do ≥3 ký tự -> 422; từ chối thành công: booking không đổi, khách thấy decisionNote qua /lookup, không thấy decidedBy')`.
  - `it('sau khi duyệt hủy, khách đặt lại phòng đó được (phòng đã nhả)')`: hotel 1 phòng → sau approve, `POST /v1/bookings` cùng khoảng ngày → `201`.
  - `it('phát bookingEvents CANCELLED sau commit')`.
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/changeRequests.integration.test.ts` → FAIL (404 các route `/v1/hotel/change-requests`).
- [ ] **Step 3: Implement** — theo Interfaces; `listStaffRequests` dùng `hotelScope`; giữ mọi cập nhật ở trạng thái điều kiện (`WHERE id=$1 AND status='PENDING'`) làm tuyến phòng thủ thứ hai sau `FOR UPDATE`; cập nhật openapi (4 path + schema `DecideRequest`, tag `Requests (nhân sự)`, `perm: 'request:handle'`), Postman folder `8. Nhân sự: xử lý đổi/hủy`.
- [ ] **Step 4: Chạy pass** — cùng lệnh PASS; `npm run typecheck`; chạy `tests/payments.integration.test.ts` xác nhận `reconcile` không bị ảnh hưởng (lệnh hoàn mới `due_at` trong tương lai).
- [ ] **Step 5: Commit** — `feat(requests): hotel/admin approve or reject cancel requests with room release and pending refund`.

**Deliverable:** vòng đời hủy end-to-end có kiểm chứng (nhả phòng, hoàn PENDING, audit, idempotent, đúng phạm vi khách sạn).

---

### Task 5: Duyệt yêu cầu ĐỔI NGÀY (kiểm tồn lại, chênh lệch giá)

**Files:**
- Modify: `backend/services/changeRequests/changeRequests.service.ts`, `backend/api/openapi.ts` (không route mới; cập nhật mô tả `approve` có `type=CHANGE`), Postman (thêm request mẫu duyệt đổi)
- Create (chỉ nếu Plan 1 chưa có hàm đúng chữ ký): `backend/services/rooms/availability.ts`
- Test: `backend/tests/changeRequests.integration.test.ts` (thêm `describe('xử lý yêu cầu đổi ngày')`)

**Interfaces:**
- Consumes: `isRoomAvailable(tx, {roomTypeId, from, to, qty, excludeBookingId, now?})` từ Plan 1 (xem mục Consumes phía trên); `changeQuote`.
- Produces: `approveRequest` xử lý thêm `type='CHANGE'` trong cùng transaction: khóa `room_types` hàng (`SELECT 1 FROM room_types WHERE id=$1 FOR UPDATE`) rồi `isRoomAvailable(..., excludeBookingId: bookingId)` với khoảng mới `[newFrom, newTo + cleaningBufferMin]`; không còn → `409 SOLD_OUT` (không đổi gì, yêu cầu vẫn PENDING); còn → cập nhật **cùng hàng** `room_reservations` (`starts_at`, `ends_at`, giữ `state`) — giữ chỗ mới và nhả chỗ cũ là một thao tác nguyên tử, khách không bao giờ mất phòng giữa chừng; cập nhật `bookings`: `stay` (from/to/nights mới), `stay_from`, `lines[0].subtotalVnd`, `pricing.roomVnd/serviceFeeVnd/totalVnd` theo `changeQuote` đã lưu ở `quote` (giá đơn vị gốc `lines[0].unitPriceVnd`), `change_count + 1`, `status_history` ghi `reasonCode`; `diffVnd > 0` và `paid_vnd > 0` → `409 CHANGE_NEEDS_PAYMENT` (VNPay tạm dừng, không thu thêm được; khách/lễ tân từ chối hoặc đặt mới); `diffVnd < 0` và `paid_vnd > 0` → `INSERT refunds ... amount = min(-diffVnd, paid - refunded)`, `reason_code='CHANGE_DOWNSIZE'`, `key='change:'||requestId`, `PENDING`; đơn chưa thu: chỉ cập nhật giá. Audit `CHANGE_REQUEST.APPROVE` + `BOOKING.CHANGE` (before/after stay + totalVnd); emit sự kiện booking.
- Nếu `quote.newTotalVnd` lệch do cấu hình phí thay đổi sau lúc gửi: dùng số đã lưu ở `quote` (nhất quán với BR-CXL-03).

- [ ] **Step 0 (kiểm tra giả định Plan 1):** `rg "export (async )?function isRoomAvailable" backend/services` — có thì dùng nguyên; không thì tạo `services/rooms/availability.ts` với đúng chữ ký, đọc `room_reservations` (loại `booking_id = excludeBookingId`, giữ điều kiện HOLD còn hạn như `createBooking`) và `room_blocks` (theo `003/004_*.sql` của Plan 1), tái dùng `canBook`/`isActive`; ghi vào "Phát hiện" nếu phải tạo.
- [ ] **Step 1: Viết test thất bại:**
  - `it('đổi sang ngày còn phòng: stay/pricing/reservation cập nhật, change_count=1')`: đơn 1 đêm trả tại khách sạn → đổi 2 đêm: `booking.stay.nights === 2`, `pricing.roomVnd === 1_200_000`, `pricing.totalVnd === 1_224_000`, `room_reservations.ends_at` khớp, `change_count === 1`.
  - `it('đổi sang ngày hết phòng -> 409 SOLD_OUT, đơn gốc và reservation giữ nguyên, yêu cầu còn PENDING')` (khách sạn 1 phòng, đơn khác chiếm ngày mới).
  - `it('đổi trong khoảng trùng chính đơn của mình không tự tranh với mình')`: dời 1 ngày (khoảng mới chồng khoảng cũ) trong khách sạn 1 phòng → `200` (nhờ `excludeBookingId`).
  - `it('đổi ngày bị block (room_blocks) -> 409 SOLD_OUT')` (tạo block bằng SQL theo schema Plan 1; nếu Plan 1 chưa merge thì bỏ qua `it.skip` kèm TODO — ghi rõ trong báo cáo).
  - `it('đổi thành nhiều đêm hơn khi đã thu tiền -> 409 CHANGE_NEEDS_PAYMENT, không đổi gì')`.
  - `it('đổi ít đêm hơn khi đã thu tiền -> tạo refund CHANGE_DOWNSIZE PENDING đúng chênh lệch')`: 3→2 đêm, `amountVnd === 612000`.
  - `it('hai yêu cầu đổi/hủy song song cho hai booking cùng phòng cuối: không bán trùng')` (hai đơn khác nhau cùng đổi sang một ngày với 1 phòng → đúng 1 `200`, 1 `409 SOLD_OUT`).
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/changeRequests.integration.test.ts -t "đổi"` → FAIL (duyệt CHANGE hiện trả lỗi/ chưa xử lý).
- [ ] **Step 3: Implement** — nhánh `CHANGE` trong `approveRequest` theo Interfaces (một hàm nội bộ `applyChange(tx, req, booking, now)` để tách khỏi nhánh CANCEL).
- [ ] **Step 4: Chạy pass** — cả file `changeRequests.integration.test.ts` PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(requests): approve date-change requests with availability recheck and price delta`.

**Deliverable:** đổi ngày an toàn (không mất phòng, không bán trùng, giá = gốc + chênh lệch).

---

### Task 6: Migration 006 + khách gửi ticket hỗ trợ và tra cứu

**Files:**
- Create: `backend/database/migrations/006_support.sql`, `packages/validation/src/support.ts`, `backend/services/support/support.service.ts`, `backend/api/modules/support/support.router.ts`
- Modify: `packages/validation/src/index.ts`, `packages/shared-types/src/index.ts` (`TicketStatus`), `backend/database/types.ts` (`SupportTicketDoc`, `SupportMessageDoc`), `backend/api/modules/index.ts`, `backend/api/openapi.ts`, Postman, `docs/postgres/README.md`
- Test: `backend/tests/support.integration.test.ts`

**Interfaces:**
- Consumes: `generateTicketCode`, `lookupBooking`, `toE164VN` qua schema `phone`, `idempotent`, `strictRateLimit`, `writeAudit`.
- Bảng `support_tickets`: `id uuid PK`, `seq bigint identity unique`, `code text NOT NULL UNIQUE`, `booking_id uuid → bookings` (null được), `hotel_id uuid` (null; sao từ booking để lọc/dashboard), `contact jsonb NOT NULL` (`{fullName?, phone, email?}` — phone E.164), `subject text NOT NULL`, `status text CHECK ('OPEN','IN_PROGRESS','RESOLVED') DEFAULT 'OPEN'`, `assignee_id uuid → accounts`, `resolved_at`, `created_at`, `updated_at`; index `(status, seq DESC)`, `((contact->>'phone'), code)`, `(booking_id)`. Bảng `support_messages`: `id uuid PK`, `seq bigint identity unique`, `ticket_id uuid NOT NULL → support_tickets ON DELETE CASCADE`, `author jsonb NOT NULL` (Actor + `name?`), `body text NOT NULL`, `internal boolean NOT NULL DEFAULT false`, `created_at`; index `(ticket_id, seq)`.
- Validation: `createTicketBody {bookingCode?: lookup code regex, phone, fullName?: 2..100, email?, subject: trim 3..150, message: trim 3..2000}`; `ticketLookupBody {code: /^SP-[0-9A-Z]{8}$/ (uppercase), phone}`; `ticketReplyBody = ticketLookupBody + {message: 3..2000}`.
- Service: `createTicket(input, requestId?): Promise<{ code; status }>` — nếu có `bookingCode` phải khớp **mã + SĐT** (dùng `lookupBooking`, sai → `404 BOOKING_NOT_FOUND` cùng thông điệp tra cứu) ; tạo ticket + message đầu (`author {type:'GUEST'}`) + audit `SUPPORT.CREATE` (`bookingId`, `hotelId` nếu có) trong một transaction; retry khi trùng `code` như `createBooking`. `lookupTicket(code, phone): Promise<GuestTicketView>` với `{ code, subject, status, createdAt, resolvedAt?, bookingCode?, messages: Array<{ from: 'GUEST'|'STAFF'; body; createdAt }> }` — chỉ `internal=false`; sai mã hoặc sai SĐT → `404 TICKET_NOT_FOUND` (cùng body). `guestReply(code, phone, message, requestId?)`: ticket `RESOLVED` → `409 TICKET_RESOLVED`; ngược lại thêm message `GUEST`, nếu ticket `IN_PROGRESS` giữ nguyên, audit `SUPPORT.REPLY`.
- Route khách (mount `/v1/support`, `strictRateLimit` mọi route): `POST /` (`idempotent('support.create')`) → `201 { ticket: { code, status } }`; `POST /lookup` → `200 { ticket }`; `POST /reply` (`idempotent('support.reply')`) → `201 { ticket }`.

- [ ] **Step 1: Viết test thất bại** — `support.integration.test.ts`:
  - `it('khách tạo ticket gắn booking bằng mã+SĐT: 201, code SP-xxxxxxxx, có message đầu, audit SUPPORT.CREATE')`.
  - `it('tạo ticket không gắn booking (chỉ SĐT): 201, booking_id null')`.
  - `it('gắn booking với SĐT sai -> 404 BOOKING_NOT_FOUND và không tạo ticket')`: `count('support_tickets') === 0`.
  - `it('validate: subject rỗng/message quá 2000 ký tự/SĐT sai -> 422')`.
  - `it('Idempotency-Key lặp -> cùng ticket, count = 1; thiếu key -> 400')`.
  - `it('tra cứu đúng mã+SĐT trả ticket và tin nhắn; sai SĐT và mã không tồn tại cho cùng body 404 TICKET_NOT_FOUND')`.
  - `it('khách khác (SĐT khác) không đọc được ticket dù biết mã')`.
  - `it('rate limit 429 sau 10 lần dò mã ticket')` (11 lần từ `guestIp(98)`).
  - `it('khách trả lời thêm: message được thêm; ticket RESOLVED -> 409 TICKET_RESOLVED')`.
  - `it('ghi chú nội bộ không có trong tra cứu của khách')`: chèn trực tiếp message `internal=true` bằng SQL → `lookup` không chứa nội dung đó (kiểm cả `JSON.stringify(body)`).
  - `it('thông tin liên hệ khách được chuẩn hóa E.164')`: `contact.phone === '+84912345678'`? (khớp định dạng `toE164VN` thực tế; assert bằng `toE164VN('0912345678')`).
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/support.integration.test.ts` → FAIL (route/bảng chưa có).
- [ ] **Step 3: Implement** — migration + types + service + router + mount `v1Router.use('/support', supportRouter)`; `openapi.ts`: 3 path tag `Support (khách)` + schema `CreateTicket`; Postman folder `9. Khách: hỗ trợ`; `docs/postgres/README.md` dòng hai bảng; **không** dùng `GET /v1/support/:code` (SĐT không để trên URL — xem "Phát hiện").
- [ ] **Step 4: Chạy pass** — PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(support): support tickets migration and guest create/lookup/reply API`.

**Deliverable:** khách tạo, xem lại, trả lời ticket bằng mã + SĐT; không dò được ticket người khác.

---

### Task 7: Admin xử lý ticket (`support:handle`)

**Files:**
- Create: `backend/api/modules/admin/support.router.ts`
- Modify: `backend/services/support/support.service.ts`, `backend/api/modules/admin/admin.router.ts` (thêm `adminRouter.use(adminSupportRouter)`), `packages/validation/src/support.ts`, `backend/api/openapi.ts`, Postman
- Test: `backend/tests/support.integration.test.ts` (thêm `describe('admin xử lý ticket')`)

**Interfaces:**
- Produces (service): `listTickets(q: { status?; assignee?: 'me'|uuid; limit; cursor }, auth): Promise<{ items; nextCursor }>` (keyset `seq <`, mới nhất trước; item có `code, subject, status, bookingCode?, contactPhoneMasked, assigneeId?, createdAt`), `getTicketAdmin(id): Promise<{ ticket; messages (cả internal) }>`, `updateTicket(auth, id, patch: { status?: 'IN_PROGRESS'|'RESOLVED'; assigneeId?: string }, requestId?)`, `addStaffMessage(auth, id, { message; internal: boolean }, requestId?)`.
- Route (mount trong `adminRouter`, `requirePermission(PERM.SUPPORT_HANDLE)`): `GET /support`, `GET /support/:id`, `PATCH /support/:id`, `POST /support/:id/messages`. Validation: `ticketListQuery`, `ticketPatchBody` (`status` enum `['IN_PROGRESS','RESOLVED']`, `assigneeId` uuid, ít nhất một trường), `staffMessageBody {message 1..2000, internal: boolean default false}`.
- Máy trạng thái bằng cập nhật có điều kiện: `OPEN→IN_PROGRESS`, `IN_PROGRESS→RESOLVED` (ghi `resolved_at`); mọi chuyển khác (`OPEN→RESOLVED`, `RESOLVED→*`) → `409 INVALID_TRANSITION`. `IN_PROGRESS` mà chưa có assignee thì gán chính người thao tác. `assigneeId` phải là tài khoản `type='ADMIN'` ACTIVE, ngược lại `422 ASSIGNEE_INVALID`. Mọi thay đổi `writeAudit` (`SUPPORT.STATUS`, `SUPPORT.ASSIGN`, `SUPPORT.REPLY` / `SUPPORT.NOTE`) cùng transaction.
- Quyền gán: `SUPPORT`, `SYSADMIN` (Task 1). Tài khoản khách sạn **không** có `support:handle`.

- [ ] **Step 1: Viết test thất bại:**
  - `it('không token -> 401; lễ tân/OPS (thiếu support:handle) -> 403; SUPPORT -> 200')`.
  - `it('danh sách lọc theo status, phân trang keyset theo seq, mới nhất trước')`.
  - `it('PATCH OPEN->IN_PROGRESS gán assignee mặc định = người thao tác; IN_PROGRESS->RESOLVED có resolved_at')`; `it('OPEN->RESOLVED và RESOLVED->IN_PROGRESS -> 409 INVALID_TRANSITION')`.
  - `it('hai admin PATCH IN_PROGRESS song song: một 200, một 409')`.
  - `it('assigneeId là tài khoản khách sạn/khóa -> 422 ASSIGNEE_INVALID')`.
  - `it('admin trả lời công khai: khách thấy ở /v1/support/lookup từ STAFF; ghi chú internal: khách không thấy nhưng admin GET /support/:id thấy')`.
  - `it('mọi thao tác có audit cùng request_id')`: đếm `audit_logs` theo `entity_type='support_ticket'`.
  - `it('ticket đã RESOLVED: admin vẫn thêm được ghi chú internal, nhưng tin công khai -> 409 TICKET_RESOLVED')` (khớp quy tắc khách).
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/support.integration.test.ts -t "admin"` → FAIL (404).
- [ ] **Step 3: Implement** — theo Interfaces; mask SĐT bằng hàm cục bộ nhỏ (giữ 3 số cuối) vì danh sách không cần SĐT đầy đủ; openapi tag `Admin · Support` (4 path, `perm: 'support:handle'`); Postman folder `10. Admin: hỗ trợ`.
- [ ] **Step 4: Chạy pass** — cả `support.integration.test.ts` PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(support): admin ticket queue, status machine, replies and internal notes`.

**Deliverable:** hàng đợi ticket cho CSKH có phân quyền, máy trạng thái, nhật ký.

---

### Task 8: Migration 007 + giá xe + khách yêu cầu xe

**Files:**
- Create: `backend/database/migrations/007_shuttle.sql`, `packages/business-logic/src/shuttle.ts`, `packages/validation/src/shuttle.ts`, `backend/services/shuttle/shuttle.service.ts`, `backend/api/modules/shuttle/shuttle.router.ts`
- Modify: `packages/business-logic/src/index.ts`, `packages/validation/src/index.ts`, `packages/shared-types/src/index.ts` (`ShuttleStatus`), `backend/database/types.ts` (`ShuttleRequestDoc`), `backend/api/modules/index.ts`, `backend/api/openapi.ts`, Postman, `docs/postgres/README.md`
- Test: `backend/tests/shuttle.unit.test.ts`, `backend/tests/shuttle.integration.test.ts`

**Interfaces:**
- Consumes: `getConfig('pricing.shuttle')` (P-08: `{baseVnd, baseKm, perKmVnd, nightSurchargeBps, maxKm}`), `hotels.airports [{iata,km,minutes}]`, `lookupBooking`, `idempotent`, `strictRateLimit`.
- `shuttlePrice(cfg: PricingShuttleCfg, km: number, pickupAt: Date): { priceVnd: number; night: boolean } | null` — `null` khi `km > cfg.maxKm`. Công thức cố định: `billable = Math.max(0, Math.ceil(km) - cfg.baseKm)`; `price = cfg.baseVnd + billable * cfg.perKmVnd`; `night` = giờ địa phương Việt Nam (UTC+7) của `pickupAt` thuộc `[22:00, 06:00)` (22:00 inclusive, 06:00 exclusive); nếu `night` thì `price += Math.round(price * cfg.nightSurchargeBps / 10000)`. Không làm tròn thêm.
- Bảng `shuttle_requests`: `id uuid PK`, `seq bigint identity unique`, `booking_id uuid NOT NULL → bookings`, `hotel_id uuid NOT NULL → hotels`, `direction text CHECK ('TO_HOTEL','TO_AIRPORT')`, `airport_iata text NOT NULL`, `distance_km double precision NOT NULL`, `pickup_at timestamptz NOT NULL`, `location text` (≤200), `note text` (≤300), `price_vnd bigint NOT NULL CHECK (>= 0)`, `config_version integer NOT NULL`, `status text CHECK ('REQUESTED','ASSIGNED','DONE','CANCELLED') DEFAULT 'REQUESTED'`, `driver jsonb` (`{name, phone}`), `assigned_at`, `completed_at`, `cancelled_at`, `cancel_note text`, `created_at`, `updated_at`. Index: `UNIQUE (booking_id, direction) WHERE status IN ('REQUESTED','ASSIGNED')`, `(hotel_id, status, seq DESC)`, `(booking_id, seq DESC)`.
- Validation: `shuttleQuoteBody {code, phone, direction, airport: /^[A-Za-z]{3}$/ → upper, pickupAt: coerce.date}`; `createShuttleBody = shuttleQuoteBody + {location?: ≤200, note?: ≤300}`; `shuttleCancelBody = lookupBody`.
- Service: `quoteShuttle(input): Promise<{ priceVnd; distanceKm; night; configVersion }>`; `createShuttleRequest(input, requestId?): Promise<ShuttleGuestView>`; `listGuestShuttles(code, phone): Promise<ShuttleGuestView[]>`; `cancelShuttleByGuest(id, code, phone, requestId?)`. `ShuttleGuestView = { id; direction; airport; pickupAt; location?; note?; priceVnd; status; driver?: { name; phone }; updatedAt }` (không `hotelId`).
- Quy tắc (trong transaction, khóa `bookings` hàng): booking phải `status IN ('PENDING','CONFIRMED','CHECKED_IN')` (BR-SHT-03: không có xe độc lập; không xe cho đơn đã hủy/từ chối/hết hạn/chờ thanh toán) → ngược lại `409 BOOKING_NOT_ELIGIBLE`; `airport` phải có trong `hotels.airports` → `422 AIRPORT_NOT_SERVED`; `km > maxKm` → `422 SHUTTLE_OUT_OF_RANGE`; `pickupAt` phải trong `[stay.from − 24h, stay.to + 24h]` và `≥ now` → `422 PICKUP_OUT_OF_STAY_WINDOW`; trùng `(booking, direction)` đang hoạt động → `409 SHUTTLE_ALREADY_REQUESTED` (bắt `isDuplicateKey`); lưu `price_vnd` và `config_version` lúc tạo. Giá xe **không** cộng vào `bookings.pricing` (xem "Phát hiện"). Hủy bởi khách: chỉ `REQUESTED|ASSIGNED` → `CANCELLED` (ngược lại `409 SHUTTLE_NOT_CANCELLABLE`); sai mã/SĐT hoặc xe không thuộc booking đó → `404 SHUTTLE_NOT_FOUND`. Audit `SHUTTLE.REQUEST`, `SHUTTLE.CANCEL` (có `hotelId`, `bookingId`).
- Route khách (mount `/v1/shuttle-requests`, `strictRateLimit`): `POST /quote`, `POST /` (`idempotent('shuttle.create')`, `201 { shuttle }`), `POST /lookup` (body `lookupBody` → `{ shuttles }`), `POST /:id/cancel` (body `shuttleCancelBody`).

- [ ] **Step 1: Viết test thất bại:**
  - `shuttle.unit.test.ts` (cấu hình mặc định P-08, `pickupAt` tính theo UTC+7): `km 3 ban ngày → 60000`; `km 3.1 → ceil 4 → 70000`; `km 6.5 → 100000`; `km 25 → 280000`; `km 25.1 → null`; mốc phụ thu: `21:59 → night false`, `22:00 → night true (100000 → 120000)`, `05:59 → true`, `06:00 → false` (đổi sang UTC: `T - 7h`).
  - `shuttle.integration.test.ts`:
    - `it('quote: khách sạn HAN 6.5km giờ ban ngày = 100000, phụ thu đêm = 120000')` (khách sạn `mkHotel` có `airports HAN km 5` → chỉnh `UPDATE hotels SET airports` để 6.5km).
    - `it('tạo yêu cầu xe: 201 REQUESTED, lưu price_vnd + config_version, audit SHUTTLE.REQUEST')`; giá đổi sau khi tạo (đặt config mới) không làm đổi `price_vnd` đã lưu.
    - `it('booking CANCELLED/REJECTED/EXPIRED/PENDING_PAYMENT/CHECKED_OUT/NO_SHOW -> 409 BOOKING_NOT_ELIGIBLE')` (vòng lặp).
    - `it('giờ đón ngoài khoảng lưu trú hoặc ở quá khứ -> 422 PICKUP_OUT_OF_STAY_WINDOW')`.
    - `it('sân bay khách sạn không phục vụ -> 422 AIRPORT_NOT_SERVED')`; `it('vượt maxKm -> 422 SHUTTLE_OUT_OF_RANGE')` (đặt km 30).
    - `it('trùng yêu cầu đang hoạt động cùng chiều -> 409 SHUTTLE_ALREADY_REQUESTED; sau khi hủy được tạo lại; chiều TO_AIRPORT riêng')`; `it('hai request song song cùng chiều: 1×201, 1×409')`.
    - `it('Idempotency-Key lặp trả lại cùng yêu cầu')`.
    - `it('khách hủy REQUESTED -> CANCELLED; đã DONE/CANCELLED -> 409 SHUTTLE_NOT_CANCELLABLE; sai SĐT hoặc id của booking khác -> 404')`.
    - `it('rate limit 429 sau 10 lần dò')`.
    - `it('lookup chỉ trả xe của booking đó, không lộ hotelId')`.
- [ ] **Step 2: Chạy xem fail** — `npx vitest run tests/shuttle.unit.test.ts` và `RUN_DB_TESTS=1 npx vitest run tests/shuttle.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** — theo Interfaces; `openapi.ts` 4 path tag `Shuttle (khách)` + schema `CreateShuttle`; Postman folder `11. Khách: xe đưa đón`; `docs/postgres/README.md` thêm `shuttle_requests` + ghi chú `distance_km` lấy từ `hotels.airports` (không gọi định tuyến).
- [ ] **Step 4: Chạy pass** — hai file PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(shuttle): shuttle_requests migration, price config and guest shuttle API`.

**Deliverable:** khách báo giá + yêu cầu + hủy xe, giá theo cấu hình xe có sẵn, chặn các đầu vào sai.

---

### Task 9: Vận hành xe (gán tài xế tay, hoàn tất, hủy) + cascade khi hủy booking

**Files:**
- Modify: `backend/services/shuttle/shuttle.service.ts`, `backend/api/modules/shuttle/shuttle.router.ts` (thêm `hotelShuttleRouter`), `backend/api/modules/index.ts`, `packages/validation/src/shuttle.ts`, `backend/services/changeRequests/changeRequests.service.ts` (gọi cascade khi duyệt hủy), `backend/api/openapi.ts`, Postman
- Test: `backend/tests/shuttle.integration.test.ts` (thêm `describe('vận hành xe')`), `backend/tests/changeRequests.integration.test.ts` (thêm 1 test cascade)

**Interfaces:**
- Produces (service): `listStaffShuttles(auth, q: { status?; limit; cursor })` (`hotelScope`, keyset `seq <`, kèm `bookingCode`, `guestName`), `assignShuttle(auth, id, { driverName; driverPhone }, requestId?)`, `completeShuttle(auth, id, requestId?)`, `cancelShuttleByStaff(auth, id, note: string, requestId?)`, `cancelShuttlesForBooking(tx: Db, bookingId: string, actor: Actor, note: string, requestId?): Promise<number>` (huỷ mọi xe `REQUESTED|ASSIGNED` của booking trong **cùng** transaction của caller, ghi audit `SHUTTLE.CANCEL` từng xe, trả về số xe bị hủy).
- Route (mount `/v1/hotel/shuttle-requests`, `authenticate` + `requirePermission(PERM.SHUTTLE_HANDLE)`): `GET /`, `POST /:id/assign` (body `{ driverName: 2..100, driverPhone: phone (E.164) }`), `POST /:id/complete`, `POST /:id/cancel` (body `rejectBody`: note ≥3).
- Máy trạng thái bằng UPDATE có điều kiện: `REQUESTED→ASSIGNED` (gán, ghi `driver`, `assigned_at`; **chỉ khi booking `CONFIRMED|CHECKED_IN`**, SRS 3.5 — ngược lại `409 BOOKING_NOT_CONFIRMED`), có thể gán lại tài xế khi đang `ASSIGNED` (đổi tên/SĐT, audit), `ASSIGNED→DONE` (`completed_at`), `REQUESTED|ASSIGNED→CANCELLED`; mọi chuyển khác `409 INVALID_TRANSITION`. Hạn chế phạm vi khách sạn bằng `hotelScope` (xe khách sạn khác → `404 SHUTTLE_NOT_FOUND`). OPS/admin dùng cùng route nhờ `hotel:scope:all` (Task 1).
- `approveRequest` (Task 4) gọi `cancelShuttlesForBooking(tx, bookingId, actorOf(auth), 'Booking đã hủy', requestId)` trước khi commit nhánh CANCEL.

- [ ] **Step 1: Viết test thất bại:**
  - `it('thiếu quyền shuttle:handle -> 403; lễ tân khách sạn khác -> 404 khi gán/hoàn tất/hủy xe')`; `it('OPS (admin) thấy xe của mọi khách sạn')`.
  - `it('danh sách lọc theo status, keyset phân trang')`.
  - `it('gán tài xế: REQUESTED->ASSIGNED, khách thấy driver.name/phone ở /lookup, audit SHUTTLE.ASSIGN')`; `it('SĐT tài xế sai -> 422')`; `it('gán khi booking còn PENDING -> 409 BOOKING_NOT_CONFIRMED')`.
  - `it('hoàn tất: ASSIGNED->DONE; hoàn tất khi REQUESTED -> 409 INVALID_TRANSITION; hoàn tất lần 2 -> 409')`.
  - `it('hai nhân sự gán song song: một thành công, một INVALID_TRANSITION hoặc ghi đè hợp lệ nhưng audit đủ hai')` — chọn hành vi đã định (gán lại khi ASSIGNED được phép → cả hai 200, `driver` là của request sau; assert theo thứ tự audit).
  - `it('hủy bởi nhân sự cần note; xe CANCELLED khách thấy status')`.
  - `it('duyệt hủy booking -> xe REQUESTED/ASSIGNED thành CANCELLED, xe DONE giữ nguyên')` (trong `changeRequests.integration.test.ts`): sau approve, `shuttle_requests` của booking có `status='CANCELLED'`, `cancelled_at` không null; audit `SHUTTLE.CANCEL` cùng transaction (cùng `request_id`).
  - `it('cancelShuttlesForBooking trả về số xe và không ảnh hưởng booking khác')` (gọi trực tiếp trong `withTransaction`).
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/shuttle.integration.test.ts tests/changeRequests.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** — theo Interfaces; openapi 4 path tag `Shuttle (nhân sự)` (`perm: 'shuttle:handle'`); Postman folder `12. Nhân sự: xe đưa đón`.
- [ ] **Step 4: Chạy pass** — hai file PASS; chạy cả bộ `RUN_DB_TESTS=1 npx vitest run`; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(shuttle): staff shuttle operations and cascade cancel on booking cancellation`.

**Deliverable:** vòng đời xe REQUESTED→ASSIGNED→DONE|CANCELLED chạy được, không để xe mồ côi khi booking bị hủy.

---

### Task 10: API client dùng chung + test hợp đồng với server thật

**Files:**
- Create: `packages/api-client/src/http.ts` (dùng lại nếu Plan 1 đã tạo: `rg "createApiClient|apiFetch" packages/api-client apps/web/src` trước), `packages/api-client/src/changeRequests.ts`, `packages/api-client/src/support.ts`, `packages/api-client/src/shuttle.ts`
- Modify: `packages/api-client/src/index.ts` (export), `packages/api-client/package.json` (không thêm dependency), `backend/package.json` (thêm `"@airrest/api-client": "*"` vào dependencies để test import được)
- Test: `backend/tests/apiClient.contract.test.ts`

**Interfaces:**
- Produces: `createApiClient(o: { baseUrl: string; getToken?: () => string | null }): ApiClient`; lỗi ném `ApiError extends Error { status: number; code: string; details?: unknown }` (map từ `{ error: {code,message} }`). Hàm tạo (POST tạo) tự gắn `Idempotency-Key: crypto.randomUUID()` (có thể truyền `idempotencyKey` để thử lại cùng key). Các method (tên chính xác, dùng ở Task 11-12):
  - Khách: `quoteCancellation({code,phone})`, `createChangeRequest(body)`, `lookupChangeRequests({code,phone})`, `createSupportTicket(body)`, `lookupSupportTicket({code,phone})`, `replySupportTicket({code,phone,message})`, `quoteShuttle(body)`, `createShuttleRequest(body)`, `lookupShuttles({code,phone})`, `cancelShuttle(id,{code,phone})`.
  - Nhân sự (cần `getToken`): `listChangeRequests(q)`, `approveChangeRequest(id,{note?})`, `rejectChangeRequest(id,{note})`, `listSupportTickets(q)`, `getSupportTicket(id)`, `updateSupportTicket(id,patch)`, `addSupportMessage(id,{message,internal})`, `listShuttleRequests(q)`, `assignShuttle(id,{driverName,driverPhone})`, `completeShuttle(id)`, `cancelShuttleStaff(id,{note})`.
  - Kiểu response dùng `@airrest/shared-types` (thêm `ChangeRequestView`, `TicketView`, `ShuttleView` nếu chưa có ở Task 3/6/8).

- [ ] **Step 1: Viết test thất bại** — `apiClient.contract.test.ts`: dựng `createServer(createApp())` nghe cổng 0 (như `booking.integration.test.ts`), `createApiClient({ baseUrl, getToken })`, `freshDb({roles:true})`, dữ liệu qua `flows.ts`:
  - `it('khách: quote -> tạo yêu cầu hủy -> lookup thấy PENDING')`; `it('nhân sự: list -> approve; khách lookup thấy APPROVED + refund')`.
  - `it('ticket: create -> staff reply -> khách lookup thấy tin STAFF')`.
  - `it('xe: quote -> create -> assign -> lookup thấy driver; cancel sau DONE ném ApiError code SHUTTLE_NOT_CANCELLABLE')`.
  - `it('ApiError mang status/code đúng (404 BOOKING_NOT_FOUND, 409 REQUEST_ALREADY_PENDING)')`.
  - `it('createChangeRequest gửi cùng idempotencyKey hai lần -> cùng id')`.
- [ ] **Step 2: Chạy xem fail** — `RUN_DB_TESTS=1 npx vitest run tests/apiClient.contract.test.ts` → FAIL (`createApiClient` không tồn tại).
- [ ] **Step 3: Implement** — dùng `fetch` toàn cục (Node 22 và trình duyệt), không thêm thư viện; mỗi file module trả một nhóm hàm gom vào `createApiClient`; mọi `POST` dùng `Content-Type: application/json`.
- [ ] **Step 4: Chạy pass** — PASS; `npm run typecheck` (backend) và `npm run build -w @airrest/web` (kiểm tra bundle FE import được package).
- [ ] **Step 5: Commit** — `feat(api-client): typed client for requests, support and shuttle with contract test`.

**Deliverable:** FE có client đã được kiểm chứng với server thật; mọi form chỉ gọi client này.

---

### Task 11: FE khách — hủy/đổi, hỗ trợ, xe đưa đón bằng API thật

**Files:**
- Create: `apps/web/src/lib/api.js` (nếu Plan 1 chưa tạo: `export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? '' })`), `apps/web/src/components/GuestRequests.jsx`, `apps/web/src/components/GuestSupportForm.jsx`, `apps/web/src/components/TicketLookup.jsx`
- Modify: `apps/web/src/components/BookingLive.jsx` (thay `requestPickup`, `pickups`, `createCase` bằng API; thêm khối hủy/đổi), `apps/web/src/screens/Support.jsx` (thêm mục "Tra cứu yêu cầu hỗ trợ" dùng `TicketLookup`), `apps/web/src/mock/partner.js` (xóa phần mock khách của luồng này sau khi hết nơi dùng: `requestPickup`; hạt giống `pickups` chỉ xóa ở Task 12), `apps/web/vite.config.js` (thêm `server.proxy['/v1'] = 'http://localhost:3000'` cho dev, giữ `preview.allowedHosts`), `apps/web/.env.example` nếu có
- Test: build `npm run build -w @airrest/web`; kịch bản tay bên dưới; hợp đồng đã được khóa ở Task 10

**Interfaces:**
- Consumes: `api.*` (Task 10). Thông tin khách: `BookingLive` nhận `booking` có `code`; SĐT lấy từ `booking.phone` nếu có (kết quả tra cứu/đặt phòng thật của Plan 1), **nếu không có** component hiển thị ô nhập SĐT (`data-testid="guest-phone"`) và dùng giá trị đó cho mọi lời gọi. Mã lỗi `error.code` → thông điệp tiếng Việt trong một bảng `ERROR_TEXT` cục bộ (BOOKING_NOT_FOUND, BOOKING_NOT_CANCELLABLE, REQUEST_ALREADY_PENDING, BOOKING_NOT_ELIGIBLE, SHUTTLE_ALREADY_REQUESTED, PICKUP_OUT_OF_STAY_WINDOW, RATE_LIMITED, ...); không dựa vào `message`.
- `GuestRequests({ code, phone })`: gọi `quoteCancellation` hiển thị khoản giữ/hoàn/mốc (`data-testid="cancel-quote"`), form lý do (`reasonCode` select + `reasonNote`), nút `data-testid="cancel-submit"` (xác nhận hai bước), form đổi ngày (`newFrom`, `newTo`, `data-testid="change-submit"`), danh sách yêu cầu và trạng thái (`data-testid="request-status"`), ẩn nút khi đã có yêu cầu `PENDING`.
- `GuestSupportForm({ code, phone })` thay nút `createCase` (`data-testid="guest-case-btn"` giữ nguyên để không vỡ kịch bản cũ; thêm `subject`, `message`); hiển thị mã ticket `SP-...` sau khi gửi (`data-testid="guest-case-done"`). `TicketLookup`: ô mã + SĐT → `lookupSupportTicket`, hiển thị trạng thái và tin nhắn, ô trả lời (`replySupportTicket`), xử lý 404 chung bằng một thông điệp.
- Khối xe trong `BookingLive`: nút `request-pickup` gọi `quoteShuttle` hiển thị giá trước, rồi `createShuttleRequest`; trạng thái xe lấy từ `lookupShuttles`; **bước tiến trình rút gọn còn 3 mốc `REQUESTED → ASSIGNED → DONE` (+ `CANCELLED`)**, hiển thị tên/SĐT tài xế khi `ASSIGNED`; nút huỷ xe. Cập nhật `PICKUP_FLOW`/`PICKUP_LABEL` dùng chung cho khớp (đồng bộ Task 12).

- [ ] **Step 1: Viết kịch bản kiểm thử tay (làm trước khi code, ghi vào mô tả commit):** khởi động `docker compose --profile local up -d db` (hoặc DB Supabase dev), `npm run db:migrate && npm run db:seed`, `npm run dev:api`, `npm run dev:web`; tạo booking thật qua UI Plan 1 hoặc `curl POST /v1/bookings`. Kỳ vọng ban đầu (trước khi code): nút hủy không tồn tại, `guest-case-btn` tạo ca mock không có mã `SP-`.
- [ ] **Step 2: Chạy xem fail** — `npm run build -w @airrest/web` hiện xanh (không thể "fail" bằng build); kịch bản tay mục 1-5 dưới đây thất bại (không thấy `cancel-quote`, không thấy mã `SP-`).
- [ ] **Step 3: Implement** — theo Interfaces; `rg "requestPickup|createCase|pickups" apps/web/src` để xác định mọi chỗ dùng và chỉ xóa mock khi không còn nơi nào dùng (`createCase` còn được `CasesTab` dùng đến Task 12); không đụng `lib/request.js`/`REQ_STATUS` (đó là luồng "đề nghị hãng", không thuộc plan này).
- [ ] **Step 4: Chạy pass** — `npm run build -w @airrest/web` xanh; kịch bản tay: (1) booking CONFIRMED → mở panel → `cancel-quote` có số tiền đúng; (2) gửi hủy → `request-status` = "Chờ duyệt"; gửi lần 2 → thông điệp "đã có yêu cầu đang chờ"; (3) gửi ticket → hiện `SP-xxxxxxxx` → tra cứu ở màn Trợ giúp bằng mã + SĐT đúng thấy nội dung, sai SĐT thấy thông điệp chung; (4) yêu cầu xe → thấy giá → `REQUESTED`; (5) booking CANCELLED → khối xe/hủy hiển thị trạng thái đúng và không cho tạo xe mới (nhận `BOOKING_NOT_ELIGIBLE`). Chụp ghi chú kết quả vào mô tả PR.
- [ ] **Step 5: Commit** — `feat(web): guest cancel/change, support ticket and shuttle request wired to real API`.

**Deliverable:** màn khách của 3 luồng chạy bằng API thật; build xanh + kịch bản tay đạt.

---

### Task 12: FE nhân sự — tab Yêu cầu, Hỗ trợ, Đón khách bằng API thật

**Files:**
- Create: `apps/web/src/components/partner/RequestsTab.jsx`
- Modify: `apps/web/src/components/partner/AdminTabs3.jsx` (`CasesTab` → API ticket; `MonitorTab`/`StatsTab` bỏ đếm `pickups` mock hoặc đọc từ API), `apps/web/src/components/partner/HotelTabs3.jsx` (`PickupsTab` → API xe), `apps/web/src/screens/Hotel.jsx`, `apps/web/src/screens/Admin.jsx`, `apps/web/src/App.jsx` (bộ đếm `pickups` ở dòng nav), `apps/web/src/lib/partnerNav.js` (thêm mục `requests`), `apps/web/src/lib/rbac.js` (`RESOURCES.request`, `PERMS.request`: admin/manager/staff `RA`), `apps/web/src/mock/partner.js` (xóa `pickups` seed, `requestPickup`, `setPickupStatus`, `cases` mock và hàm `createCase/setCaseStatus/addCaseNote` khi hết nơi dùng — giữ catalog `case_categories` nếu còn được UI cấu hình dùng)
- Test: build + kịch bản tay

**Interfaces:**
- Consumes: `api.*` nhân sự (Task 10) cần token. **Giả định Plan 1:** đã có token đăng nhập thật cho cổng nhân sự (`getToken()` ở `apps/web/src/lib/api.js`/session). Step 0 kiểm tra: `rg "auth/login|getToken" apps/web/src`; nếu chưa có, thêm tối thiểu vào `Login.jsx` lời gọi `POST /v1/auth/login` lưu token trong bộ nhớ (không `localStorage`) và nối vào `createApiClient({ getToken })` — ghi nhận trong báo cáo vì đây là việc chung với Plan 1.
- `RequestsTab({ session })` (dùng cho cả Hotel và Admin): bảng yêu cầu theo `listChangeRequests` (lọc trạng thái, phân trang "Tải thêm" bằng `nextCursor`), hiển thị loại, mã booking, lý do, báo giá (giữ/hoàn), thao tác duyệt (`data-testid="request-approve"`) và từ chối với lý do (`request-reject`); hiển thị mã lỗi `BOOKING_NOT_CANCELLABLE`/`SOLD_OUT`/`CHANGE_NEEDS_PAYMENT` bằng thông điệp tiếng Việt.
- `CasesTab`: danh sách `listSupportTickets` (lọc trạng thái), chi tiết `getSupportTicket` (tin nhắn + ghi chú nội bộ đánh dấu riêng), nút chuyển trạng thái chỉ hiện nước đi hợp lệ (OPEN→IN_PROGRESS→RESOLVED), trả lời/ghi chú (`addSupportMessage`); giữ `data-testid` hiện có (`cases-table`, `cases-msg`).
- `PickupsTab`: `listShuttleRequests`; nút `pickup-next` thành "Gán tài xế" (form tên + SĐT, `assignShuttle`) rồi "Hoàn tất" (`completeShuttle`); `pickup-fail` thành "Hủy xe" (`cancelShuttleStaff` kèm lý do); `PICKUP_FLOW/LABEL/NEXT` ở `mock/partner.js` rút còn `REQUESTED/ASSIGNED/DONE/CANCELLED` (đồng bộ Task 11).

- [ ] **Step 1: Viết kịch bản kiểm thử tay** (đăng nhập `letan@demo.airrest.vn`, `admin@demo.airrest.vn`; seed đã gồm quyền mới nhờ Task 1): dữ liệu từ kịch bản Task 11 làm đầu vào.
- [ ] **Step 2: Chạy xem fail** — trước khi code: tab `requests` không tồn tại; `PickupsTab` vẫn hiển thị xe mẫu mock `XD-S001`.
- [ ] **Step 3: Implement** — theo Interfaces; trước khi xóa mock chạy `rg "pickups|cases|setPickupStatus|createCase|setCaseStatus|addCaseNote" apps/web/src` và sửa mọi chỗ dùng (App.jsx dòng đếm nav, Hotel.jsx `counts`, `AdminTabs3` KPI/monitor); nút cũ `data-testid` giữ nguyên nơi còn hợp lý.
- [ ] **Step 4: Chạy pass** — `npm run build -w @airrest/web` xanh; kịch bản tay: (1) lễ tân thấy yêu cầu hủy của khách ở tab "Yêu cầu", duyệt → khách tải lại thấy "Đã duyệt" và booking `CANCELLED`; từ chối thiếu lý do bị chặn; (2) admin thấy yêu cầu của mọi khách sạn; (3) CSKH xử lý ticket OPEN→IN_PROGRESS→RESOLVED, tin trả lời công khai hiện ở trang tra cứu khách, ghi chú nội bộ thì không; (4) lễ tân gán tài xế cho xe, khách thấy tên/SĐT; (5) không còn xe `XD-S001` mẫu.
- [ ] **Step 5: Commit** — `feat(web): staff requests, support queue and shuttle operations wired to real API; remove related mock`.

**Deliverable:** các tab nhân sự của 3 luồng chạy bằng API thật, mock tương ứng đã gỡ.

---

### Task 13: Rà soát cuối — đồng bộ tài liệu, Postman/Swagger, hồi quy

**Files:**
- Create: `backend/tests/docs.sync.test.ts`
- Modify: `backend/README.md` (bảng API: thêm các route của Task 3-9 theo định dạng bảng hiện có; mục "Giới hạn đã biết": hoàn tiền hủy chỉ tạo PENDING, giá xe chưa cộng vào booking, đổi ngày không thu thêm), `docs/BACKEND_TASKS.md` (dòng #8, 9, 11, 18, 20, 21 → "Có", ghi chú route; mục 3.2-3.4 đánh dấu đã làm theo spec D3-D5), `docs/postgres/README.md` (kiểm tra đủ 4 bảng + ghi chú `refunds.reason_code` mới)
- Test: `backend/tests/docs.sync.test.ts` (không cần DB)

**Interfaces:**
- Test đọc `openapi.paths` và `backend/docs/Airrest_Admin_API.postman_collection.json`; với mọi path bắt đầu bằng `/v1/change-requests`, `/v1/hotel/change-requests`, `/v1/support`, `/v1/admin/support`, `/v1/shuttle-requests`, `/v1/hotel/shuttle-requests` kiểm tra tồn tại ít nhất một request Postman có `url.raw` chứa path đó (đã thay `{id}` bằng `:id` hoặc biến); và quét `router.stack` của `createApp()` để mọi route đã mount của các tiền tố trên đều có trong `openapi.paths` (không route nào thiếu Swagger).

- [ ] **Step 1: Viết test thất bại:** `it('mọi route của plan 2 có trong openapi')`, `it('mọi path openapi của plan 2 có request Postman')`, `it('không route nào của plan 2 thiếu requirePermission/strictRateLimit đúng loại')` (route khách: `strictRateLimit` có trong stack; route nhân sự: có `authenticate`) — kiểm bằng tên handler/`stack`.
- [ ] **Step 2: Chạy xem fail** — `npx vitest run tests/docs.sync.test.ts` → FAIL nếu còn route thiếu (bước này cũng là bước phát hiện sót từ Task 3-9).
- [ ] **Step 3: Implement** — bổ sung phần thiếu (openapi/Postman/README); không đổi logic.
- [ ] **Step 4: Chạy pass & hồi quy tổng** — `npx vitest run tests/docs.sync.test.ts` PASS; `RUN_DB_TESTS=1 npx vitest run` toàn bộ xanh (booking, payments, admin, mới); `npm run typecheck` sạch; `npm run build -w @airrest/web` xanh; chạy lại `npm run db:migrate` hai lần trên DB sạch (idempotent qua `schema_migrations`); chạy `rg -n "TODO|FIXME" backend/services/changeRequests backend/services/support backend/services/shuttle` không còn mục dở dang (trừ `it.skip` giả định room_blocks nếu Plan 1 chưa merge — liệt kê trong báo cáo); SonarQube theo CLAUDE.md nếu pipeline có.
- [ ] **Step 5: Commit** — `docs: sync swagger, postman, db docs and readme for requests/support/shuttle`.

**Deliverable:** bộ test hồi quy toàn bộ xanh; tài liệu API/DB khớp code.

---

## Tự rà phủ spec

| Yêu cầu spec | Task |
|---|---|
| D3 khách gửi hủy/đổi bằng mã + SĐT, không tài khoản | 3 |
| D3 khách sạn duyệt, admin duyệt thay (permission, không theo tên vai trò) | 1, 4 |
| D3 phí hủy theo cấu hình (miễn phí trước N giờ, sau đó phần trăm) | 1 (`cancellation.fee`), 2, 3 |
| D3 duyệt hủy → CANCELLED, nhả phòng, refunds PENDING nếu đã thu | 4 |
| D3 đổi = đổi ngày, kiểm tồn lại, giá gốc + chênh lệch | 2, 5 |
| D4 `support_tickets` + `support_messages`, khách gửi có/không booking, tra lại bằng mã + SĐT | 6 |
| D4 admin `support:handle`, OPEN→IN_PROGRESS→RESOLVED, không realtime | 7 |
| D5 `shuttle_requests` gắn booking, REQUESTED→ASSIGNED→DONE/CANCELLED, giá theo cấu hình xe, gán tài xế tay | 8, 9 |
| D9 `request:handle`, `support:handle`, `shuttle:handle` + gán vào vai trò trong seed | 1 |
| Ràng buộc: migration 00N, transaction + audit, strictRateLimit + Idempotency-Key, uuid + keyset `seq`, openapi + Postman, `bookingEvents`, test tích hợp, typecheck | mọi task; kiểm bởi Task 13 |
| FE nối API thay mock | 10, 11, 12 |
| Không gọi cổng thanh toán | 4, 5 (chỉ `INSERT refunds PENDING`) |

Không phủ trong plan này (cố ý): rút yêu cầu (WITHDRAWN), hủy một phần, miễn phí ngoại lệ có bằng chứng, tự phục vụ hủy ngay, chat bot/SOS (SRS FR-SUP-01/02), trạng thái xe `ON_THE_WAY/ARRIVED/PICKED_UP/FAILED`, theo dõi vị trí xe, hủy booking do khách sạn từ chối/EXPIRED (thuộc Plan 1; chỉ cung cấp `cancelShuttlesForBooking`).

## Phát hiện/mâu thuẫn

1. **Không có config `cancellation`.** Spec D3 nói "cấu hình `cancellation`", nhưng `configKeys.ts` chỉ có `cancellation.limits` (mẫu mặc định, khung tối đa). Plan thêm khóa mới `cancellation.fee` (Task 1) với giá trị mặc định lấy từ BA §5 (Linh hoạt: miễn phí đến 2h; Tiêu chuẩn: ≥24h miễn phí, 24h→2h giữ 50%, <2h giữ 100%; Không hoàn: giữ 100%). Giá trị này là đề xuất, chờ PO xác nhận (BA chưa chốt hẳn).
2. **Phí dịch vụ khi hủy có phạt** (OQ-2-16 chưa chốt): plan chọn **không hoàn** phí DV khi có phạt (BR-CXL-06), hoàn khi miễn phí.
3. **Spec D3 vs SRS BR-CXL-07:** spec "giá giữ theo đơn gốc cộng chênh lệch"; SRS "giá đổi dùng bảng giá hiện tại, không mang giá cũ". Plan theo spec (giữ `unitPriceVnd` gốc, chênh lệch do số đêm đổi + phí DV tính lại).
4. **Spec D3 vs SRS FR-CXL-02/F1:** spec bắt khách sạn duyệt mọi hủy; SRS cho tự phục vụ hủy ngay trong khung miễn phí. Plan theo spec (mọi hủy vào hàng đợi duyệt), nhưng quote/phí đã sẵn để sau này bật auto-approve.
5. **Hoàn tiền PENDING có thể bị `reconcile` xử lý:** `reconcilePayments` lấy mọi `refunds` PENDING có `due_at <= now` rồi gọi `vnpayGateway.refund` (mock hoặc live). Plan đặt `due_at = now + 24h` (BR-CXL-13) nên lần đối soát tay trong 24h đầu không đụng; sau 24h `reconcile` vẫn sẽ xử lý. Để tuyệt đối "chưa thực thi" cần sửa luồng payments (bị cấm trong phạm vi) — **cần quyết định**.
6. **Đổi ngày tăng giá khi đã thu tiền:** không thể thu thêm (VNPay tạm dừng) → `409 CHANGE_NEEDS_PAYMENT`. Đổi giảm giá chỉ tạo `refunds` PENDING.
7. **Giá xe không cộng vào `bookings.pricing`/`totalVnd`:** lưu ở `shuttle_requests.price_vnd` (tránh động đến tiền đã thu và phí DV). SRS/BA coi xe là một phần đơn → **cần quyết định** có cộng vào tổng đơn không.
8. **Trạng thái xe:** spec 4 trạng thái; SRS 6 (+`FAILED`); FE mock `PICKUP_FLOW` 5 mốc (`enroute`, `picked`). Plan theo spec; FE rút còn `REQUESTED/ASSIGNED/DONE/CANCELLED`.
9. **MVP.md vs spec:** FR-17 (gọi xe) "đã loại", FR-16 (hỗ trợ 24/7) "Could"; spec đã đưa xe và hỗ trợ vào phạm vi → plan chỉ làm phần ticket/yêu cầu xe thủ công, không chat/SOS/bản đồ.
10. **Route tra cứu ticket:** `BACKEND_TASKS.md` ghi `GET /v1/support/:code`; plan dùng `POST /v1/support/lookup` (mã + SĐT trong body) để SĐT không lộ trong URL/log, cùng kiểu `/v1/bookings/lookup`.
11. **`strictRateLimit` dùng chung một bộ đếm 10 lần/phút/IP** cho mọi route dùng nó (login, lookup, payments link và các route mới): một khách vừa báo giá, gửi yêu cầu, tra cứu có thể chạm 429. Plan không đổi (đúng spec); test dùng `X-Forwarded-For` để tách bucket. Có thể cần tách giới hạn theo nhóm.
12. **`SUPPORT`/`OPS` không có `hotel:scope:all`** nên `hotelScope()` sẽ từ chối họ ở các route theo khách sạn. Plan thêm `hotel:scope:all` cho `OPS` (xe) và để `SUPPORT` chỉ dùng route admin không cần scope; `reception` trong `seed.ts` dùng `ON CONFLICT ... SET name = roles.name` nên DB cũ không nhận quyền mới — Task 1 sửa.
13. **Danh mục lý do hủy** (BR-CXL-01 "cấu hình") đang hằng số trong `packages/validation` (`REASON_CODES`), chưa vào `system_configs`.
14. **FE:** `packages/api-client` rỗng; mock dùng mã `DC-xxxx` và thời gian mô phỏng theo phút, còn BE dùng `AR-XXXXXXXX` và thời gian thật; cổng nhân sự FE dùng phiên mock, chưa đăng nhập API. Task 11-12 phụ thuộc phần FE đăng nhập/lookup booking thật của Plan 1 (có bước 0 kiểm tra và phương án tối thiểu). FE không có test runner nên deliverable FE là build xanh + kịch bản tay + test hợp đồng Task 10.
15. **Giả định Plan 1:** `isRoomAvailable` (có trừ `room_blocks`) — Task 5 bước 0 kiểm tra/tạo wrapper; test khóa phòng có thể `it.skip` nếu Plan 1 chưa merge.
