# Airrest — Plan 1: Quản lý phòng + Vận hành booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (Luồng 2) Khách sạn quản lý loại phòng, xem tồn kho theo ngày và khóa/bảo trì phòng; (Luồng 1) lễ tân xác nhận/từ chối booking (từ chối kèm lý do + tối đa 3 khách sạn thay thế), admin xem toàn bộ booking, đơn quá hạn chờ xác nhận tự `EXPIRED` và nhả phòng. FE các màn tương ứng chạy bằng API thật.

**Architecture:** Giữ nguyên kiến trúc hiện có: router (`api/modules/*`) mỏng → service (`services/*`) → SQL thuần qua `db`/`withTransaction`; mọi ghi dữ liệu nằm trong một transaction cùng `writeAudit`, tranh chấp phòng được tuần tự hóa bằng `SELECT ... FOR UPDATE` trên dòng `room_types` (đúng như `createBooking`). Tồn phòng = `room_reservations` đang hoạt động + `room_blocks` mới, cùng đi qua một hàm đọc dùng chung (`loadActiveIntervals`) và sweep-line `canBook` đã có trong `@airrest/business-logic`; không có cổng thanh toán, chỗ cần hoàn tiền chỉ ghi `refunds` PENDING.

**Tech Stack:** Node 22, Express 5, zod 3, `pg` SQL thuần, vitest + supertest (+ `embedded-postgres`), React 18/Vite 6 (apps/web, hiện toàn mock), npm workspaces (`packages/{validation,business-logic,shared-types,api-client,utils}`).

**Spec:** `docs/superpowers/specs/2026-11-11-airrest-remaining-flows-design.md` (mục 4: D1, D2, D7, D9; mục 5: ràng buộc). Đối chiếu: `docs/BACKEND_TASKS.md` #15, #16, #17; SRS 3.3 (BKG), 3.9 (HTL: FR-HTL-03, 07, 11), 3.10 (ADM: FR-ADM-03, 04).

> Mọi đường dẫn bên dưới tính từ gốc monorepo `Airrest_website/` (`backend/...`, `packages/...`, `apps/web/...`, `docs/...`). Lệnh test chạy trong `backend/`.
> Quy ước chung: trước khi bắt đầu chạy `git pull` (merge, KHÔNG `--rebase`). Commit message tiếng Anh dạng `feat(airrest): ...`, kết thúc bằng dòng attribution `Co-Authored-By: ...` do môi trường cấp. Mỗi task: `cd backend && npm run typecheck` sạch trước khi commit.
> Lệnh test DB: `cd backend && RUN_DB_TESTS=1 npx vitest run tests/<file>.test.ts` (tự bật Postgres nhúng). Test thuần không cần DB: `npx vitest run tests/unit.test.ts`.

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

Ràng buộc bổ sung từ spec (mục 2, 4) áp dụng cho plan này: không gọi cổng thanh toán (`VNPAY_ENABLED=false` vẫn chạy được luồng đặt trả tại khách sạn); quyền chỉ theo permission, không theo tên vai trò (D9); mã quyền mới của plan này chỉ gồm `booking:decide` và `room:manage`.

## Review Focus

Các loại input/lỗi dễ cắn nhất; mỗi dòng có test bắt buộc nằm ở task sở hữu.

1. **Đặt phòng và khóa phòng đồng thời lên phòng cuối** (Promise.all một `POST /v1/bookings` + một `POST /v1/hotel/room-blocks`): đúng một bên thành công, bên kia 409, không bán vượt tồn. Test: Task 4.
2. **Khóa phòng đè lên đơn đang giữ**: đơn `HOLD` chưa hết hạn / `CONFIRMED` / `CHECKED_IN` chặn khóa (409 `BLOCK_CONFLICT`); `HOLD` đã quá `hold_expires_at` thì không chặn; khóa đã gỡ (`released_at`) không trừ tồn. Test: Task 4.
3. **Xác nhận đơn đã hết hạn chờ** (`expires_at <= now` nhưng job quét chưa chạy, phòng có thể đã bán cho người khác): confirm trả 409 `BOOKING_EXPIRED`, đơn chuyển `EXPIRED`, phòng nhả, không có `CONFIRMED` ma. Test: Task 9 (và lazy-expire khi tra cứu ở Task 10).
4. **Xác nhận/từ chối đồng thời hoặc bấm lặp cùng một đơn** (Promise.all confirm + reject, hoặc reject hai lần): đúng một thắng, bản còn lại 409 `INVALID_STATE`; đơn đã thu tiền chỉ sinh đúng một `refunds` PENDING (khóa `refunds.key`). Test: Task 9.
5. **Giảm `total_rooms` / ngừng loại phòng khi còn đơn hoặc khóa trong tương lai**: không cho hạ dưới đỉnh số phòng đang bị giữ/đặt/khóa (409 `ROOM_TOTAL_BELOW_RESERVED`), không cho ngừng loại phòng còn đơn hoạt động (409 `ROOM_TYPE_IN_USE`). Test: Task 3.
6. **Cách ly khách sạn**: nhân viên khách sạn A thao tác loại phòng/khóa/đơn của khách sạn B nhận 404 (không lộ tồn tại); tham số `hotelId` bị bỏ qua với token khách sạn, chỉ có hiệu lực khi có `hotel:scope:all`. Test: Task 3, 4, 9, 11.

---

## Phụ thuộc giữa các task

```
T1 (migration 003, types, helper test)
 ├─ T2 (hàm thuần tồn theo ngày)
 ├─ T3 (CRUD loại phòng)  ── T4 (tồn theo ngày + khóa phòng + createBooking trừ khóa)
 │                              └─ T5 (api-client + nền FE đăng nhập thật) ── T6 (FE phòng/tồn)
 └─ T7 (migration 004, quyền booking:decide, mặc định duyệt tay)
      └─ T8 (gợi ý khách sạn thay thế) ── T9 (xác nhận/từ chối) ── T10 (hết hạn chờ xác nhận)
                                              └─ T11 (admin + khách sạn xem booking) ── T12 (FE booking)
```

T4 phải xong trước T8 (gợi ý phải trừ khóa phòng). T5 dùng chung cho T6 và T12.

---

## Luồng 2 — Quản lý phòng

### Task 1: Migration 003 (cột loại phòng + bảng `room_blocks`), kiểu TS, tài liệu DB, helper test

**Files:**
- Create: `backend/database/migrations/003_rooms.sql`
- Modify: `backend/database/types.ts` (`RoomTypeDoc` dòng 74-81; thêm `RoomBlockDoc` ngay sau `RoomReservationDoc` dòng ~96)
- Modify: `docs/postgres/README.md` (thêm dòng `room_blocks` và ghi chú cột mới của `room_types` vào bảng ở đầu file; sửa dòng `inventory_locks`... giữ nguyên)
- Modify: `backend/tests/support/db.ts` (`mkRoomType` dòng 175-179; thêm `mkStaff`, `mkAdmin`)
- Test: `backend/tests/rooms.migration.integration.test.ts`

**Interfaces:**
- Produces (SQL, `room_types`): thêm `code text` (nullable, unique theo `(hotel_id, code)` khi khác null), `capacity int NOT NULL DEFAULT 2 CHECK 1..10`, `beds int NOT NULL DEFAULT 1 CHECK 1..10`, `area_m2 int NOT NULL DEFAULT 0 CHECK >= 0`, `retired_at timestamptz` (null = chưa ngừng dùng), `created_at`, `updated_at timestamptz NOT NULL DEFAULT now()`. Backfill `code` cho dòng cũ = `upper(left(replace(id::text,'-',''),6))`. `active=false` + `retired_at IS NULL` = "tạm ngừng bán"; `retired_at` khác null = "ngừng dùng" (luôn kèm `active=false`).
- Produces (SQL, bảng mới `room_blocks`): `id uuid PK DEFAULT gen_random_uuid()`, `seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE`, `hotel_id uuid NOT NULL REFERENCES hotels`, `room_type_id uuid NOT NULL REFERENCES room_types`, `kind text NOT NULL CHECK IN ('LOCK','MAINTENANCE')`, `qty int NOT NULL CHECK > 0`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NOT NULL CHECK (ends_at > starts_at)`, `reason text NOT NULL`, `created_by jsonb NOT NULL` (Actor), `released_at timestamptz`, `released_by jsonb`, `created_at timestamptz NOT NULL DEFAULT now()`. Index `(room_type_id, starts_at, ends_at) WHERE released_at IS NULL` và `(hotel_id, seq DESC)`.
- Produces (TS): `RoomTypeDoc` thêm `code?: string; capacity: number; beds: number; areaM2: number; retiredAt?: Date; createdAt: Date; updatedAt: Date`. `RoomBlockDoc { id; seq; hotelId; roomTypeId; kind: 'LOCK'|'MAINTENANCE'; qty; startsAt: Date; endsAt: Date; reason; createdBy: Actor; releasedAt?: Date; releasedBy?: Actor; createdAt }`.
- Produces (helper test, `tests/support/db.ts`):
  - `mkRoomType(hotelId: string, totalRooms: number, baseNightVnd = 600_000, o?: { code?: string; name?: string; active?: boolean }): Promise<string>` (chữ ký cũ vẫn chạy; thêm tham số thứ 4 tùy chọn, tự sinh `code` duy nhất).
  - `mkStaff(hotelId: string, permissions: string[], email?: string): Promise<{ id: string; token: string }>` — tạo role HOTEL scope + account HOTEL ACTIVE rồi trả `signAccountToken({ sub, accountType: 'HOTEL' })`.
  - `mkAdmin(permissions: string[], email?: string): Promise<{ id: string; token: string }>` — tạo role SYSTEM + account ADMIN, `accountType: 'ADMIN'`.

- [ ] **Step 1: Viết test thất bại** `backend/tests/rooms.migration.integration.test.ts` (dùng `run = process.env.RUN_DB_TESTS ? describe : describe.skip`, `freshDb()` như `booking.integration.test.ts`):
  - `it('room_types có cột mới và code duy nhất theo khách sạn')`: tạo hotel + `mkRoomType(h, 3, 600000, { code: 'DLX' })`; `await expect(mkRoomType(h, 2, 500000, { code: 'DLX' })).rejects.toMatchObject({ code: '23505' })`; cùng `code 'DLX'` ở hotel khác thì OK.
  - `it('room_blocks từ chối ends_at <= starts_at và qty <= 0')`: `INSERT` trực tiếp, `rejects.toMatchObject({ code: '23514' })` cho cả hai.
  - `it('migration chạy lại không đổi dữ liệu và backfill code')`: chèn `room_types` bằng SQL thô không có `code` trước khi áp 003 là không khả thi trong `freshDb` → thay bằng: `await db.query("INSERT INTO room_types (hotel_id,name,total_rooms,pricing) VALUES ($1,'X',1,'{\"baseNightVnd\":1}')")` rồi `expect(row.capacity).toBe(2)` và `retiredAt` undefined.
  - `it('mkStaff trả token dùng được')`: gọi `GET /v1/hotel/bookings` với token của `mkStaff(h, [PERM.BOOKING_READ])` → 200 (kiểm helper hoạt động).
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/rooms.migration.integration.test.ts` → FAIL: `column "code" of relation "room_types" does not exist` / `mkStaff is not a function`.
- [ ] **Step 3: Implement**: tạo `003_rooms.sql` theo đặc tả cột ở trên (một transaction do `runMigrations` bọc sẵn; không sửa `001`/`002`); cập nhật `types.ts`; cập nhật `mkRoomType` + thêm `mkStaff`/`mkAdmin` vào `support/db.ts` (dùng `signAccountToken` từ `lib/jwt`, `hashPassword` đã import); cập nhật `docs/postgres/README.md` (bảng `room_blocks`, cột mới `room_types`, nhắc `kind='BLOCK'` của `room_reservations` không còn dùng cho khóa phòng, xem mục "Phát hiện/mâu thuẫn" #1).
- [ ] **Step 4: Chạy pass**: lệnh ở Step 2 → PASS; chạy thêm `RUN_DB_TESTS=1 npx vitest run` toàn bộ → các test cũ vẫn xanh (đặc biệt `booking.integration`, `admin.integration`, `payments.integration` dùng `mkRoomType`).
- [ ] **Step 5: Commit**: `feat(airrest): migration 003 room types columns and room_blocks`.

**Deliverable:** DB có `room_blocks` + cột loại phòng mới; helper `mkStaff/mkAdmin/mkRoomType` dùng được cho mọi task sau; test migration xanh, test cũ không vỡ.

---

### Task 2: Hàm thuần tính tồn theo ngày (`dailyAvailability`, `dayWindow`)

**Files:**
- Modify: `packages/business-logic/src/inventory.ts` (thêm cuối file, sau `canBook` dòng 46-47)
- Modify: `packages/business-logic/src/index.ts` nếu chưa `export *` từ `inventory` (kiểm bằng `rg "inventory" packages/business-logic/src/index.ts`)
- Test: `backend/tests/unit.test.ts` (thêm `describe('tồn phòng theo ngày')`, dùng helper `t()`/`iv()` sẵn có)

**Interfaces:**
- Produces:
  - `dayWindow(date: string): { from: Date; to: Date }` — `date` dạng `YYYY-MM-DD`, ngày theo giờ Việt Nam: `[00:00+07:00, 00:00+07:00 hôm sau)`. Ném `Error` nếu chuỗi sai định dạng hoặc ngày không tồn tại (ví dụ `2026-02-30`).
  - `interface DayAvailability { date: string; physical: number; held: number; booked: number; blocked: number; sellable: number }`.
  - `dailyAvailability(total: number, reservations: ReservationLike[], blocks: Interval[], dates: string[], now: Date): DayAvailability[]`.
- Quy tắc cố định: với mỗi ngày, cửa sổ = `dayWindow(date)`; `held` = `maxConcurrent` của các đơn `HOLD` chưa hết hạn (`isActive`); `booked` = `maxConcurrent` của `CONFIRMED`/`CHECKED_IN`; `blocked` = `maxConcurrent(blocks)`; `sellable = max(0, total - maxConcurrent(tất cả đoạn hoạt động + blocks))` (không cộng ba cột, vì đỉnh của từng loại có thể lệch giờ); `physical = total`. Đoạn nửa mở `[from, to)` như hàm hiện có (check-out 12:00 và check-in 12:00 không xung đột).
- Consumes: `maxConcurrent`, `isActive`, `Interval`, `ReservationLike` (cùng file).

- [ ] **Step 1: Viết test thất bại** trong `unit.test.ts`:
  - `dayWindow('2026-11-10')` → `from.toISOString() === '2026-11-09T17:00:00.000Z'`, `to.toISOString() === '2026-11-10T17:00:00.000Z'`; `expect(() => dayWindow('2026-02-30')).toThrow()`; `expect(() => dayWindow('10/11/2026')).toThrow()`.
  - Đơn `CONFIRMED` từ 14:00 ngày 10 đến 12:00 ngày 11 (giờ VN) với total 2: ngày 10 → `{booked:1, sellable:1}`, ngày 11 → `{booked:1, sellable:1}`, ngày 12 → `{booked:0, sellable:2}`.
  - `HOLD` hết hạn (`holdExpiresAt < now`) không được đếm: `held === 0`, `sellable === total`.
  - Khóa `qty 2` trên total 2 → `blocked 2, sellable 0`; khóa + đơn không bao giờ làm `sellable` âm: total 1, một đơn và một khóa chồng nhau → `sellable === 0` (không `-1`).
  - Đơn `CONFIRMED` 14:00-18:00 và khóa 20:00-23:00 cùng ngày, total 1: `booked 1, blocked 1, sellable 1`? Không: đỉnh đồng thời = 1 nên `sellable === 0`. Test khẳng định `sellable === 0` (đỉnh chung, không phải tổng 2).
- [ ] **Step 2: Chạy xem fail**: `npx vitest run tests/unit.test.ts` → FAIL: `dayWindow is not a function` (import không có).
- [ ] **Step 3: Implement** hai hàm trong `inventory.ts` theo quy tắc cố định ở trên (chỉ dùng `Date.UTC` và `maxConcurrent`; không thêm thư viện ngày giờ). Re-export qua `index.ts` nếu cần.
- [ ] **Step 4: Chạy pass**: `npx vitest run tests/unit.test.ts` → PASS toàn bộ (kể cả test sweep-line cũ).
- [ ] **Step 5: Commit**: `feat(airrest): daily room availability pure functions`.

**Deliverable:** hàm thuần có test, không cần DB; là nền cho API tồn theo ngày (Task 4).

---

### Task 3: CRUD loại phòng (`/v1/hotel/room-types`) + quyền `room:manage`

**Files:**
- Create: `packages/validation/src/rooms.ts`; Modify: `packages/validation/src/index.ts` (thêm `export * from './rooms';`)
- Create: `backend/services/rooms/rooms.service.ts`
- Create: `backend/api/modules/rooms/rooms.router.ts` (xuất `roomTypesRouter`; Task 4 thêm `roomBlocksRouter` vào cùng file)
- Modify: `backend/api/modules/index.ts` (thêm `v1Router.use('/hotel/room-types', roomTypesRouter);` sau dòng `/hotel/bookings`)
- Modify: `backend/config/permissions.ts` (dòng 3-22: thêm `ROOM_MANAGE: 'room:manage'` cạnh `BOOKING_CHECKIN`)
- Modify: `backend/config/roles.ts` (`SYSADMIN.permissions` dòng 23-37 thêm `PERM.ROOM_MANAGE`; `HOTEL_OWNER_ROLE` dòng 42 thêm `PERM.ROOM_MANAGE`)
- Modify: `backend/database/scripts/seed.ts` (dòng 40: quyền vai trò `reception` giữ `BOOKING_READ, BOOKING_CHECKIN`; KHÔNG cấp `room:manage`)
- Modify: `backend/api/openapi.ts` (thêm tag `Rooms (khách sạn)` ở danh sách tag dòng ~58 và path `/v1/hotel/room-types`, `/v1/hotel/room-types/{id}`)
- Modify: `backend/docs/Airrest_Admin_API.postman_collection.json` (thêm folder `7. Quản lý phòng (HTL)`; item dùng `{{baseUrl}}`, bearer `{{token}}`, biến mới `roomTypeId` đã có sẵn trong `variable`)
- Test: `backend/tests/rooms.integration.test.ts`

**Interfaces:**
- Consumes: `hotelScope(auth)` từ `services/bookings/bookings.service.ts` (không đổi), `writeAudit`, `actorOf`, `withTransaction`, `PERM`, `loadActiveIntervals` KHÔNG dùng ở task này (đỉnh tính trực tiếp, xem dưới), `maxConcurrent`.
- Produces (zod, `@airrest/validation`):
  - `createRoomTypeBody = { code: /^[A-Z0-9]{2,8}$/, name: trim 2..100, capacity: int 1..10, beds: int 1..10, areaM2: int 0..500 default 0, totalRooms: int 0..500, baseNightVnd: int 1000..100_000_000 }`
  - `patchRoomTypeBody` = các trường trên trừ `code` (bất biến), mọi trường optional, thêm `active?: boolean`; rỗng → 422.
  - `hotelTargetQuery = { hotelId?: uuid }`, `roomTypeListQuery = hotelTargetQuery & { includeRetired?: 'true'|'false' → boolean }`.
- Produces (service, `services/rooms/rooms.service.ts`):
  - `resolveHotelId(auth: AuthContext, hotelId?: string): string` — token khách sạn: luôn dùng `auth.hotelId` và BỎ QUA `hotelId` truyền vào; có `HOTEL_SCOPE_ALL`: bắt buộc `hotelId`, thiếu → `AppError(422,'HOTEL_ID_REQUIRED')`.
  - `listRoomTypes(auth, q): Promise<RoomTypeDoc[]>` (mặc định loại `retired_at IS NOT NULL`)
  - `createRoomType(auth, hotelId?, body, requestId?): Promise<RoomTypeDoc>` — trùng `code` trong khách sạn → `AppError(409,'ROOM_CODE_TAKEN')` (bắt `isDuplicateKey`); audit `ROOM_TYPE.CREATE`.
  - `updateRoomType(auth, hotelId?, id, patch, requestId?)` — trong transaction: `SELECT ... FOR UPDATE` dòng `room_types` (khóa cùng khóa với `createBooking`); không thuộc khách sạn → `404 ROOM_TYPE_NOT_FOUND`; đã `retired` → `409 ROOM_TYPE_RETIRED`; nếu `totalRooms` giảm: tính đỉnh = `maxConcurrent` của (đơn hoạt động `HOLD` chưa hết hạn/`CONFIRMED`/`CHECKED_IN` kết thúc sau `now`) + (khóa chưa gỡ kết thúc sau `now`, bảng `room_blocks` của Task 1) trong cửa sổ `[now, now + 5 năm]`; nếu `totalRooms < đỉnh` → `409 ROOM_TOTAL_BELOW_RESERVED` với `details: { peak }`. Đổi giá chỉ ảnh hưởng đơn mới (đơn cũ giữ `lines[].unitPriceVnd`). Audit `ROOM_TYPE.UPDATE` có `before/after`.
  - `retireRoomType(auth, hotelId?, id, requestId?)` — nếu còn đơn hoạt động hoặc khóa chưa gỡ kết thúc sau `now` → `409 ROOM_TYPE_IN_USE`; ngược lại `active=false, retired_at=now`; audit `ROOM_TYPE.RETIRE`. Gọi lại khi đã retired → `409 ROOM_TYPE_RETIRED`.
- Produces (route, tất cả cần `authenticate` — gắn trong router giống `hotelBookingsRouter`):
  - `GET /v1/hotel/room-types?hotelId&includeRetired` — `requirePermission(PERM.BOOKING_READ)` → `{ items: RoomTypeDoc[] }`
  - `POST /v1/hotel/room-types` — `ROOM_MANAGE`, body `createRoomTypeBody` + `hotelId?` ở query → `201 { roomType }`
  - `PATCH /v1/hotel/room-types/:id` — `ROOM_MANAGE` → `{ roomType }`
  - `DELETE /v1/hotel/room-types/:id` — `ROOM_MANAGE` → `{ roomType }` (ngừng dùng, mềm)
- Lỗi chuẩn `AppError(status, code, message)`; validate lỗi → 422 `VALIDATION_ERROR` (hành vi sẵn có của `validate`).

- [ ] **Step 1: Viết test thất bại** `tests/rooms.integration.test.ts` (`freshDb()`, hotel `H1`, hotel `H2`, `mkStaff(H1, [BOOKING_READ, ROOM_MANAGE])`, `mkStaff(H2, [...])`, `mkStaff(H1, [BOOKING_READ])` chỉ đọc, `mkAdmin([HOTEL_SCOPE_ALL, ROOM_MANAGE, BOOKING_READ])`):
  - `tạo loại phòng: 201, code in hoa, audit ROOM_TYPE.CREATE cùng transaction` — `expect(res.status).toBe(201); expect(res.body.roomType).toMatchObject({ code: 'DLX', totalRooms: 5, pricing: { baseNightVnd: 700000 }, active: true }); expect(await count('audit_logs', "action='ROOM_TYPE.CREATE'")).toBe(1)`.
  - `trùng code trong cùng khách sạn → 409 ROOM_CODE_TAKEN; khách sạn khác dùng lại code → 201`.
  - `validation: code chữ thường 'dlx' / totalRooms -1 / baseNightVnd 0 / capacity 11 → 422 VALIDATION_ERROR`.
  - `chỉ-đọc (không room:manage) POST → 403; GET → 200`.
  - Cách ly: `staffH2` PATCH/DELETE loại phòng của H1 → `404`; `staffH1` gửi `?hotelId=<H2>` vẫn chỉ thấy/tạo ở H1 (khẳng định `res.body.roomType.hotelId === H1`).
  - Admin: không có `hotelId` → 422 `HOTEL_ID_REQUIRED`; có `?hotelId=H2` → 201 đúng H2.
  - **Review Focus 5**: loại phòng total 3, có đơn `CONFIRMED` qty 2 trùng một đêm tương lai (tạo qua `POST /v1/bookings` hotel `manual:false`) → PATCH `totalRooms: 1` → `409 ROOM_TOTAL_BELOW_RESERVED`, `details.peak === 2`; PATCH `totalRooms: 2` → 200; đơn `HOLD` đã hết hạn (`UPDATE room_reservations SET hold_expires_at = now() - interval '1 minute'`) KHÔNG tính vào đỉnh → PATCH hạ được; DELETE khi còn đơn hoạt động → `409 ROOM_TYPE_IN_USE`, `active` vẫn `true`.
  - `đổi giá không đổi đơn cũ`: tạo đơn rồi PATCH `baseNightVnd` → `lookup` đơn cũ vẫn `roomVnd` cũ; đơn mới theo giá mới.
  - `DELETE → active=false, retiredAt có giá trị; GET mặc định không trả; ?includeRetired=true có trả; GET /v1/hotels/:id (công khai) không còn thấy; POST /v1/bookings vào loại đó → 404 ROOM_TYPE_NOT_FOUND`; DELETE lần 2 → 409 `ROOM_TYPE_RETIRED`.
  - `PATCH active:false (tạm ngừng bán) không hủy đơn đã xác nhận`: đơn cũ vẫn `CONFIRMED`; đặt mới bị 404.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/rooms.integration.test.ts` → FAIL: `expected 404 to be 201` (route chưa có) / `PERM.ROOM_MANAGE` undefined.
- [ ] **Step 3: Implement** theo Interfaces (router mỏng giống `hotels.router.ts`/`bookings.router.ts`: `validate({...})` rồi gọi service; service dùng `withTransaction`). Đỉnh đồng thời gọi `maxConcurrent` với các đoạn `{from,to,qty}` lấy bằng một câu SQL cho `room_reservations` và một câu cho `room_blocks`. Cập nhật `permissions.ts`, `roles.ts` (cả `ensureSystemRoles` tự đồng bộ vì đọc từ `ADMIN_ROLES`/`HOTEL_OWNER_ROLE`), `openapi.ts` (schema `RoomType`, `CreateRoomType`; mỗi path có `perm`, các mã 404/409/422), Postman (5 request: list, create, patch, retire, create-trùng-code; thêm `pm.collectionVariables.set('roomTypeId', ...)` ở test script request create nếu collection đang dùng kiểu đó — xem item "Tạo khách sạn + tài khoản chủ" để theo đúng mẫu). Xác nhận JSON hợp lệ: `node -e "JSON.parse(require('fs').readFileSync('docs/Airrest_Admin_API.postman_collection.json','utf8'))"`.
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `npm run typecheck` sạch; `RUN_DB_TESTS=1 npx vitest run tests/admin.integration.test.ts tests/booking.integration.test.ts` vẫn xanh.
- [ ] **Step 5: Commit**: `feat(airrest): room type CRUD with room:manage permission`.

**Deliverable:** hotel owner/admin tạo-sửa-ngừng loại phòng qua API, có cách ly khách sạn, chặn hạ tồn dưới số đang giữ; Swagger + Postman + quyền đã cập nhật.

---

### Task 4: Tồn theo ngày + khóa/bảo trì phòng + đặt phòng trừ khóa

**Files:**
- Create: `backend/services/rooms/availability.ts` (hàm đọc dùng chung)
- Modify: `backend/services/rooms/rooms.service.ts` (thêm hàm tồn/khóa)
- Modify: `backend/api/modules/rooms/rooms.router.ts` (thêm `roomBlocksRouter`, route tồn trong `roomTypesRouter`)
- Modify: `backend/api/modules/index.ts` (thêm `v1Router.use('/hotel/room-blocks', roomBlocksRouter);`)
- Modify: `packages/validation/src/rooms.ts` (thêm schema tồn/khóa)
- Modify: `backend/services/bookings/bookings.service.ts` (thay truy vấn tồn dòng 82-93 trong `createBooking`)
- Modify: `backend/api/modules/admin/hotels.router.ts` (stats: truy vấn `reservations` ~dòng 336-340 và `blockedNow` dòng 363)
- Modify: `backend/api/openapi.ts`, `backend/docs/Airrest_Admin_API.postman_collection.json`, `docs/postgres/README.md` (ghi chú: tồn = reservations + room_blocks)
- Test: `backend/tests/room-blocks.integration.test.ts`

**Interfaces:**
- Produces (`services/rooms/availability.ts`):
  - `loadActiveIntervals(tx: Db, roomTypeId: string, from: Date, to: Date, now: Date): Promise<{ reservations: ReservationLike[]; blocks: Interval[] }>` — reservations: `state IN ('CONFIRMED','CHECKED_IN') OR (state='HOLD' AND hold_expires_at > now)`, giao với `[from,to)`; blocks: `released_at IS NULL` giao với `[from,to)`. KHÔNG khóa; người gọi tự `FOR UPDATE room_types` trước.
  - `intervalsForCheck(r: { reservations: ReservationLike[]; blocks: Interval[] }, now: Date): Interval[]` = `reservations.filter(isActive)` ∪ `blocks` (đúng đầu vào của `canBook`).
- Produces (zod): `inventoryQuery = { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', hotelId? }` (refine `to >= from`, tối đa 62 ngày, ngày không tồn tại → 422); `createBlockBody = { roomTypeId: uuid, kind: 'LOCK'|'MAINTENANCE', qty?: int 1..500, from: coerce.date, to: coerce.date, reason: trim 3..200 }` (refine `to > from`); `blockListQuery = { roomTypeId?: uuid, active?: boolean (mặc định true), from?: date, to?: date, limit, cursor, hotelId? }`.
- Produces (service):
  - `getInventory(auth, hotelId?, roomTypeId, from: string, to: string, now = new Date()): Promise<DayAvailability[]>` (dùng `dailyAvailability` Task 2; `from..to` bao gồm cả hai đầu; loại phòng không thuộc khách sạn → 404).
  - `createBlock(auth, hotelId?, body, requestId?): Promise<RoomBlockDoc>` — transaction: `SELECT ... FOR UPDATE room_types` → `loadActiveIntervals` → nếu `qty` có: `canBook(total, intervalsForCheck(...), {from,to,qty})` sai → `409 BLOCK_CONFLICT` (`details: { remaining }`); nếu `qty` bỏ trống ("đóng bán"): `qty = remainingRooms(...)`, bằng 0 → `409 NOTHING_TO_BLOCK`. Loại phòng đã retired → `409 ROOM_TYPE_RETIRED`. Ghi `room_blocks` + audit `ROOM_BLOCK.CREATE` (`before`: remaining, `after`: block). Đơn hiện có KHÔNG bị hủy (chỉ khóa phần còn trống).
  - `releaseBlock(auth, hotelId?, blockId, requestId?)` — `UPDATE ... SET released_at=now(), released_by WHERE id AND released_at IS NULL AND hotel_id=...`; không có → `404 ROOM_BLOCK_NOT_FOUND`; đã gỡ → `409 ROOM_BLOCK_RELEASED`; audit `ROOM_BLOCK.RELEASE`.
  - `listBlocks(auth, q)` keyset theo `seq DESC` → `{ items, nextCursor }`.
- Produces (route):
  - `GET /v1/hotel/room-types/:id/inventory?from=&to=` — `BOOKING_READ` → `{ roomTypeId, days: DayAvailability[] }`
  - `POST /v1/hotel/room-blocks` — `ROOM_MANAGE` → `201 { block }`
  - `GET /v1/hotel/room-blocks` — `BOOKING_READ`
  - `DELETE /v1/hotel/room-blocks/:id` — `ROOM_MANAGE` → `{ block }`
- Thay đổi `createBooking`: sau `FOR UPDATE room_types`, gọi `loadActiveIntervals(tx, roomType.id, resFrom, resTo, now)` rồi `canBook(roomType.totalRooms, intervalsForCheck(r, now), {...})`; lỗi hết phòng giữ nguyên `409 SOLD_OUT`. Stats khách sạn: `blockedNow` đếm từ `room_blocks` đang hiệu lực tại `now`; `availableNow` trừ cả khóa (hành vi kiểm cũ ở `admin.integration.test.ts` dòng 273 không đổi).

- [ ] **Step 1: Viết test thất bại** `tests/room-blocks.integration.test.ts` (setup như Task 3: `H1`, loại phòng `total = 1` tên `rt1`, và `total = 3` tên `rt3`):
  - `getInventory`: đơn CONFIRMED qty 1 đêm D (14:00 D → 12:00 D+1) + khóa 1 phòng ngày D+3 trên `rt3` → `GET .../inventory?from=D&to=D+4` trả 5 ngày, ngày D: `{booked:1, sellable:2}`, D+3: `{blocked:1, sellable:2}`; `to < from` → 422; khoảng 63 ngày → 422; `2026-02-30` → 422; loại phòng của khách sạn khác → 404.
  - `khóa không qty = đóng bán`: `rt3` có 1 đơn CONFIRMED → POST block không `qty` → `201`, `block.qty === 2` (phần còn trống); `POST /v1/bookings` vào khoảng đó → `409 SOLD_OUT`; đơn cũ vẫn `CONFIRMED`.
  - **Review Focus 2**: `rt1` (total 1): (a) đơn HOLD chưa hết hạn (hotel `manual:true`) → POST block `qty 1` → `409 BLOCK_CONFLICT`; (b) `UPDATE room_reservations SET hold_expires_at = now()-interval '1 min'` → POST block → `201` (hold hết hạn không chặn); (c) đơn `CONFIRMED` và `CHECKED_IN` (cập nhật trực tiếp `state`) → `409 BLOCK_CONFLICT`; (d) khóa chồng khóa: block thứ hai cùng khoảng → `409`; (e) `DELETE` block rồi đặt phòng → `201` (khóa đã gỡ không trừ tồn); (f) khoảng liền kề không chồng (block đến 12:00, đơn đến từ 12:00) → cả hai OK.
  - **Review Focus 1**: `rt1`, `Promise.all([POST /v1/bookings (Idempotency-Key riêng), POST /v1/hotel/room-blocks qty 1 cùng khoảng])` → mảng status sắp xếp `[201, 409]`; `count('bookings') + count('room_blocks')` tổng đúng 1; lặp 5 lần vòng (reset dữ liệu mỗi lần) để bắt race.
  - `đặt phòng bị khóa: khóa MAINTENANCE qty 1 trên rt1 → POST /v1/bookings 409 SOLD_OUT với code 'SOLD_OUT'`; sau `DELETE` block → 201.
  - Validation/quyền: `qty 0`, `reason` 1 ký tự, `to <= from`, `kind 'X'` → 422; chỉ-đọc POST → 403; `staffH2` DELETE block của H1 → 404; DELETE lần 2 → 409 `ROOM_BLOCK_RELEASED`; audit có `ROOM_BLOCK.CREATE` và `ROOM_BLOCK.RELEASE`.
  - Stats: `GET /v1/admin/hotels/:id/stats` sau khi có block đang hiệu lực → `rooms.blockedNow === 1`, `availableNow` đã trừ.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/room-blocks.integration.test.ts` → FAIL: `expected 404 to be 201` (route khóa chưa có); test đặt-phòng-bị-khóa FAIL `expected 201 to be 409`.
- [ ] **Step 3: Implement** theo Interfaces. `createBooking` chỉ thay đoạn đọc tồn (giữ nguyên tạo mã, idempotency, audit). `createBlock` và `createBooking` dùng cùng khóa `FOR UPDATE room_types` nên Review Focus 1 được tuần tự hóa. Cập nhật openapi (4 path mới), Postman (folder `7. Quản lý phòng (HTL)` thêm: tồn theo ngày, khóa, đóng bán không qty, gỡ khóa), README DB.
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `RUN_DB_TESTS=1 npx vitest run` toàn bộ xanh; `npm run typecheck` sạch.
- [ ] **Step 5: Commit**: `feat(airrest): daily inventory and room blocks, bookings respect blocks`.

**Deliverable:** API tồn kho theo ngày và khóa/bảo trì hoạt động, `createBooking` không bán phòng đang bị khóa, race đặt-vs-khóa được chứng minh bằng test.

---

### Task 5: `@airrest/api-client` + nền FE đăng nhập thật cho khu vực khách sạn

**Files:**
- Modify: `packages/api-client/src/index.ts` (hiện chỉ `export {}`)
- Modify: `backend/package.json` (thêm `"@airrest/api-client": "*"` vào `dependencies` để test import được)
- Modify: `apps/web/vite.config.js` (thêm `server.proxy` `'/v1'` → `http://localhost:3000`)
- Create: `apps/web/src/lib/api.js` (khởi tạo client, đọc `import.meta.env.VITE_API_URL ?? ''`)
- Modify: `apps/web/src/screens/Login.jsx` (`submitLogin`, dòng ~50-63: nhánh tài khoản API)
- Modify: `apps/web/src/state/store.jsx` (reducer `login` dòng ~43; session có thêm `token`, `permissions`, `hotelId`, `source: 'api'`)
- Modify: `apps/web/src/lib/rbac.js` (thêm `hasPerm(session, perm)`)
- Test: `backend/tests/apiClient.integration.test.ts`

**Interfaces:**
- Produces (`createApiClient(opts: { baseUrl: string; getToken?: () => string | undefined; fetch?: typeof fetch }): ApiClient`). Mọi hàm ném `ApiError { status: number; code: string; message: string; details?: unknown }` khi `!res.ok` (đọc `{ error: { code, message, details } }`), trả JSON khi ok. Hàm của Task 5:
  - `login(email: string, password: string): Promise<{ token: string; account: { id; fullName; type: 'HOTEL'|'ADMIN'|'DRIVER'; permissions: string[] }; hotelId?: string }>` — gọi `POST /v1/auth/login` rồi `GET /v1/auth/me` (lấy `auth.hotelId`), gộp kết quả.
  - `listRoomTypes(q?: { hotelId?: string; includeRetired?: boolean })`, `createRoomType(body, q?)`, `updateRoomType(id, patch, q?)`, `retireRoomType(id, q?)`, `getInventory(roomTypeId, from: string, to: string, q?)`, `listRoomBlocks(q?)`, `createRoomBlock(body, q?)`, `releaseRoomBlock(id, q?)` — ánh xạ đúng route Task 3-4. (Task 12 bổ sung hàm booking.)
- Kiểu: dùng `RoomTypeDoc`/`DayAvailability` khai báo lại dạng interface JSON-thuần trong api-client (không import từ `backend/`; `DayAvailability` import từ `@airrest/business-logic`).
- Session FE (reducer `login`): `{ id: account.id, role: <'manager' nếu có room:manage, ngược lại 'staff'; 'admin' nếu type ADMIN>, propertyId, tenantId: hotelId, token, permissions, source: 'api' }`. Cổng vào `Hotel.jsx`/`Admin.jsx` vẫn theo `ROLE_META[role].area`. `hasPerm(session, 'room:manage')` dùng cho các tab đã nối API; các tab còn mock vẫn dùng `can()`.

- [ ] **Step 1: Viết test thất bại** `backend/tests/apiClient.integration.test.ts`: dựng `createServer(createApp())`, `listen(0)`, `baseUrl = http://localhost:${port}`; tạo hotel + `mkStaff` có mật khẩu (`mkAccount` với `password`) → `client = createApiClient({ baseUrl, getToken: () => token })`:
  - `login trả token + permissions + hotelId` (`expect(r.hotelId).toBe(hotelId)`; `expect(r.account.permissions).toContain('room:manage')`).
  - `sai mật khẩu → ApiError status 401 code INVALID_CREDENTIALS`.
  - `createRoomType → listRoomTypes → updateRoomType → getInventory(7 ngày) → createRoomBlock → releaseRoomBlock → retireRoomType` chạy trọn vòng không lỗi; `expect(inv.days).toHaveLength(7)`.
  - `409 ROOM_TOTAL_BELOW_RESERVED được ném thành ApiError có code đúng và details.peak`.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/apiClient.integration.test.ts` → FAIL: `createApiClient is not a function`.
- [ ] **Step 3: Implement** client bằng `fetch` toàn cục (Node 22 có sẵn; không thêm thư viện), không lưu token vào `localStorage` (FE hiện cố ý giữ trong bộ nhớ — `store.jsx` ghi chú D-18): token nằm trong `state.session.token`, `getToken` đọc từ store qua `lib/api.js` (`setTokenProvider`). `Login.jsx`: nếu nhập chuỗi có `@` → gọi `login` API (hiển thị `error.message` khi lỗi, hiện thông báo "Đang kết nối"), nếu không có `@` thì giữ nhánh mock cũ cho khách `nguoidung`; ghi chú trong UI rằng tài khoản email là tài khoản thật. Bỏ `startSession` mock cho nhánh API.
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `npm run build:web` (từ gốc) → build thành công; `npm run typecheck` sạch.
- [ ] **Step 5: Commit**: `feat(airrest): api-client and real partner login in web`.

**Deliverable:** client API có test chạy với server thật; FE đăng nhập được bằng tài khoản email thật, session mang token + permissions.

---

### Task 6: FE nối API cho "Loại phòng" và "Tồn phòng"

**Files:**
- Modify: `apps/web/src/components/partner/HotelTabs2.jsx` — `TypesPane` (dòng 26-80), `InventoryTab` (dòng 151-204), `RoomsTab` (dòng 13-24: ẩn sub-tab `prices`/`policy` khi `session.source === 'api'`)
- Create: `apps/web/src/lib/useAsync.js` (hook `useAsync(fn, deps) → { data, error, loading, reload }`)
- Modify: `apps/web/src/screens/Hotel.jsx` (dòng 38-46: với `session.source === 'api'` dựng `p` tối thiểu `{ id: session.tenantId, name: 'Khách sạn của bạn' }` thay vì `getProperty`)
- Test: build + kịch bản kiểm thủ công có script (không có framework test FE trong repo; xem Step 1)

**Interfaces:**
- Consumes: `createApiClient` (Task 5) qua `lib/api.js`; `hasPerm(session, 'room:manage')` cho nút Thêm/Sửa/Ngừng và form khóa; `BOOKING_READ` đủ để xem.
- Ánh xạ trường FE ↔ API: `id`→`code`, `name`, `capacity`, `beds`, `area`→`areaM2`, `rooms`→`totalRooms`, giá cơ bản thêm vào form `baseNightVnd`; trạng thái `selling` = `active && !retiredAt`, `paused` = `!active && !retiredAt`, `retired` = `retiredAt`. Nút "Tạm ngừng/Mở bán" → `updateRoomType(id, { active })`; "Ngừng dùng" → `retireRoomType(id)`. Lỗi API hiển thị bằng `error.message` ở `data-testid="types-msg"` (giữ test id cũ), riêng `ROOM_TOTAL_BELOW_RESERVED` hiện kèm `details.peak`.
- Bảng tồn: gọi `getInventory(roomTypeId, hôm nay, hôm nay+13)` (giữ `DAYS = 14`), cột `Phòng vật lý`=`physical`, `Đã giữ chỗ`=`held`, `Đã đặt`=`booked`, `Không khả dụng`=`blocked`, `Có thể bán`=`sellable`. Cột "Bán hôm đó" bỏ (không có khái niệm đóng bán riêng).
- Form "Đóng/mở bán" thay bằng "Khóa phòng": chọn loại khóa (`LOCK`/`MAINTENANCE`), từ/đến ngày (đổi sang `ISO 00:00+07:00`), số phòng (bỏ trống = đóng bán toàn bộ phần còn trống), lý do → `createRoomBlock`; danh sách khóa đang hiệu lực (`listRoomBlocks`) có nút "Gỡ khóa" → `releaseRoomBlock`. Lỗi `BLOCK_CONFLICT` hiển thị "Còn {remaining} phòng trống, không đủ để khóa".

- [ ] **Step 1: Định nghĩa kiểm thử (viết trước)** — tạo `docs/superpowers/plans/` KHÔNG thêm tài liệu; thay vào đó thêm script smoke `backend/scripts/seed-smoke-rooms.ts`? Không — tránh file thừa. Kiểm thử của task: (a) `npm run build:web` phải qua; (b) kịch bản thủ công có tiêu chí PASS cụ thể, chạy với `npm run db:seed && npm run dev:api` + `npm run dev:web`: đăng nhập `letan@demo.airrest.vn` (không có `room:manage`) → tab "Phòng và giá" thấy danh sách nhưng KHÔNG có nút Thêm/Sửa; đăng nhập chủ khách sạn (tạo qua `POST /v1/admin/hotels`) → Thêm loại phòng `DLX` → bảng hiện dòng mới; sửa `totalRooms` xuống dưới số đang đặt → thấy thông báo "dưới số đang giữ (peak N)"; tab "Tồn phòng" hiện 14 dòng khớp `GET .../inventory`; khóa 1 phòng → cột "Không khả dụng" = 1 và `Có thể bán` giảm 1; gỡ khóa → trở lại. Ghi kết quả từng bước vào mô tả commit.
- [ ] **Step 2: Chạy xem fail**: trước khi sửa, đăng nhập tài khoản API và mở tab "Phòng và giá": màn vẫn hiện dữ liệu mock (`typesOf`) → FAIL tiêu chí "hiện dữ liệu từ API" (so sánh với `GET /v1/hotel/room-types` bằng curl).
- [ ] **Step 3: Implement** theo Interfaces: thay `typesOf/saveRoomType/setTypeStatus/dayInventory/setClosed/setBlackout` bằng gọi API trong `TypesPane`/`InventoryTab` khi `session.source === 'api'`; phần mock cũ cho `source !== 'api'` được XÓA khỏi hai component này (spec: không còn mock cho luồng này) — các hàm mock còn được `PricesPane`, `OverviewTab` dùng nên KHÔNG xóa khỏi `mock/partner.js`. `PricesPane`/`PolicyPane` (giá theo ngày, điều kiện lưu trú) chưa có API: ẩn khi `source === 'api'` và ghi chú trong UI "Giá theo ngày: chưa có API" (xem mục mâu thuẫn #5).
- [ ] **Step 4: Chạy pass**: `npm run build:web` PASS; chạy lại kịch bản Step 1, mọi tiêu chí PASS.
- [ ] **Step 5: Commit**: `feat(airrest): wire room types and inventory tabs to API`.

**Deliverable:** hai tab FE chạy bằng API thật (loại phòng CRUD, tồn theo ngày, khóa/gỡ khóa), có kịch bản nghiệm thu thủ công với tiêu chí PASS.

---

## Luồng 1 — Vận hành booking

### Task 7: Migration 004 (`booking_decisions`), quyền `booking:decide`, mặc định duyệt tay, hạn giữ chỗ theo cấu hình

**Files:**
- Create: `backend/database/migrations/004_booking_decisions.sql`
- Modify: `backend/database/types.ts` (thêm `BookingDecisionDoc`; `RefundDoc.reasonCode` dòng 195 thêm `'HOTEL_REJECTED' | 'HOTEL_NO_RESPONSE'`)
- Modify: `backend/config/permissions.ts` (thêm `BOOKING_DECIDE: 'booking:decide'`), `backend/config/roles.ts` (`SYSADMIN` dòng 23-37 và `HOTEL_OWNER_ROLE` dòng 42 thêm `PERM.BOOKING_DECIDE`), `backend/database/scripts/seed.ts` (dòng 40 vai trò `reception`: thêm `PERM.BOOKING_DECIDE`; seed hotel demo dòng 18 đổi `approval` thành `{"manual":true}`; xem mâu thuẫn #3, #4)
- Modify: `backend/api/modules/admin/hotels.router.ts` (dòng 137: INSERT khách sạn mới dùng `'{"manual":true}'`)
- Modify: `backend/services/bookings/bookings.service.ts` (export `approvalHoldMs(): Promise<number>`; dòng 72 và 99-100 trong `createBooking`: đơn chờ duyệt dùng `approvalExpireMin` thay `HOLD_MS`)
- Modify: `backend/services/payments/payments.service.ts` (dòng 10 import và dòng 165: `holdUntil` dùng `approvalHoldMs()`)
- Modify: `packages/validation/src/bookings.ts` (`staffListQuery.status` dòng 88: thêm `PENDING_PAYMENT`, `REJECTED`, `EXPIRED`)
- Modify: `docs/postgres/README.md`
- Test: `backend/tests/booking-decisions.migration.integration.test.ts`

**Interfaces:**
- Produces (SQL `booking_decisions`): `booking_id uuid PRIMARY KEY REFERENCES bookings(id)`, `decision text NOT NULL CHECK IN ('CONFIRMED','REJECTED','EXPIRED')`, `reason text` (bắt buộc khi `REJECTED` qua `CHECK (decision <> 'REJECTED' OR (reason IS NOT NULL AND length(btrim(reason)) >= 3))`), `decided_by jsonb NOT NULL` (Actor), `decided_at timestamptz NOT NULL DEFAULT now()`, `alternatives jsonb NOT NULL DEFAULT '[]'`. Thêm một câu `UPDATE roles SET permissions = permissions || ARRAY['booking:decide'] WHERE hotel_id IS NOT NULL AND 'booking:checkin' = ANY(permissions) AND NOT ('booking:decide' = ANY(permissions))` để vai trò lễ tân đã tồn tại của các khách sạn được quyền mới (xem mâu thuẫn #4).
- Produces (TS): `BookingDecisionDoc { bookingId: string; decision: 'CONFIRMED'|'REJECTED'|'EXPIRED'; reason?: string; decidedBy: Actor; decidedAt: Date; alternatives: Alternative[] }` với `Alternative` định nghĩa ở Task 8 (khai báo `type Alternative` trong `database/types.ts` ngay tại task này để các task sau dùng chung): `{ hotelId: string; hotelName: string; roomTypeId: string; roomTypeName: string; baseNightVnd: number; airport: string; km: number }`.
- Produces: `approvalHoldMs(): Promise<number>` = `(await getConfig('booking.hold')).value.approvalExpireMin * 60_000`; `HOLD_MS` giữ nguyên export (không xóa, tránh vỡ import khác) nhưng không dùng cho đơn chờ duyệt nữa.
- Hành vi: khách sạn tạo mới (admin `POST /v1/admin/hotels`) có `approval.manual === true` KHÔNG kèm `manualUntil`; `PATCH approval` vẫn giữ giới hạn 90 ngày của `checkApproval` (không đổi). `createBooking` chỉ đọc `hotel.approval.manual` như cũ.

- [ ] **Step 1: Viết test thất bại** `booking-decisions.migration.integration.test.ts`:
  - `booking_decisions: INSERT decision 'REJECTED' không reason → lỗi 23514; reason 'ab' → 23514; reason 'hết phòng' OK`.
  - `decision 'X' → 23514`; trùng `booking_id` → `23505`.
  - `khách sạn tạo qua POST /v1/admin/hotels có approval.manual true` (dùng `mkAdmin([ADMIN_HOTEL_MANAGE, ...])` + `ensureSystemRoles`; body tạo khách sạn theo `createBody` trong `hotels.router.ts` dòng 47-62; `expect(res.body.hotel.approval).toEqual({ manual: true })`).
  - `đơn chờ duyệt dùng approvalExpireMin`: hotel `manual:true`, đặt `AT_HOTEL` → `bookings.expires_at - created_at` ≈ 20 phút (`approvalExpireMin` mặc định 20, sai số < 5s); sau khi `PUT /v1/admin/configs/booking.hold` đổi `approvalExpireMin: 30` (cần `admin:config:write`; dùng đúng body của test cấu hình trong `admin.integration.test.ts`) thì đơn mới ≈ 30 phút.
  - `status=REJECTED / EXPIRED / PENDING_PAYMENT hợp lệ ở GET /v1/hotel/bookings` (200, không 422).
  - `reception role cũ được thêm booking:decide`: chèn role HOTEL có `booking:checkin` TRƯỚC, chạy lại `runMigrations`? Migration đã áp rồi → thay bằng kiểm tra `ensure` ở seed không khả thi; test chỉ kiểm tra câu UPDATE bằng cách chạy lại thân SQL phần UPDATE (đọc file, tách câu cuối) trên role vừa chèn → có `booking:decide`, chạy lần 2 không nhân đôi.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/booking-decisions.migration.integration.test.ts` → FAIL: `relation "booking_decisions" does not exist`.
- [ ] **Step 3: Implement** theo Files/Interfaces. `payments.service.ts` chỉ đổi dòng tính `holdUntil` (bất kỳ chỗ nào khác giữ nguyên). Cập nhật README DB (bảng `booking_decisions`, ghi chú mặc định duyệt tay).
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `RUN_DB_TESTS=1 npx vitest run tests/payments.integration.test.ts tests/booking.integration.test.ts tests/admin.integration.test.ts` xanh (đặc biệt test VNPay + duyệt tay dùng `HOLD_MS`: sửa kỳ vọng thời gian nếu có, dùng `approvalExpireMin`); `npm run typecheck` sạch.
- [ ] **Step 5: Commit**: `feat(airrest): migration 004 booking_decisions, booking:decide, default manual approval`.

**Deliverable:** nền dữ liệu + quyền + mặc định cho luồng xác nhận; hạn chờ xác nhận lấy từ cấu hình `booking.hold.approvalExpireMin`.

---

### Task 8: Gợi ý tối đa 3 khách sạn thay thế (`suggestAlternatives`)

**Files:**
- Create: `backend/services/bookings/alternatives.ts`
- Test: `backend/tests/alternatives.integration.test.ts`

**Interfaces:**
- Consumes: `loadActiveIntervals`, `intervalsForCheck` (Task 4), `canBook` (`@airrest/business-logic`), `Alternative` (Task 7), `HotelDoc.airports`.
- Produces: `suggestAlternatives(tx: Db, input: { hotelId: string; from: Date; to: Date; qty: number; now: Date }, limit = 3): Promise<Alternative[]>`.
- Thuật toán cố định (suy ra từ D2/FR-23, ghi rõ để không mơ hồ): lấy `airports` của khách sạn bị từ chối; ứng viên = khách sạn `status='ACTIVE'`, `id <> hotelId`, có ít nhất một `iata` trùng (`airports ?|` không áp dụng cho jsonb mảng object → dùng `EXISTS (SELECT 1 FROM jsonb_array_elements(airports) a WHERE a->>'iata' = ANY($iatas))`); mỗi ứng viên lấy `km` nhỏ nhất ở các sân bay trùng; với mỗi ứng viên duyệt loại phòng `active AND retired_at IS NULL`, mỗi khách sạn chỉ lấy MỘT loại phòng còn đủ `qty` (loại có `baseNightVnd` thấp nhất trong các loại đủ chỗ), kiểm bằng `canBook(total, intervalsForCheck(loadActiveIntervals(...)), {from,to,qty})` (có tính khóa phòng và HOLD chưa hết hạn; cửa sổ kiểm = `[from, to + cleaningBufferMin của ứng viên)`). Sắp xếp `km ASC, baseNightVnd ASC, hotelName ASC`, cắt `limit`. Chỉ đọc, không khóa, không ghi.

- [ ] **Step 1: Viết test thất bại**:
  - 5 khách sạn ACTIVE cùng sân bay HAN còn phòng → trả đúng 3, đúng thứ tự gần nhất trước; mỗi phần tử có đủ trường `Alternative`.
  - Loại trừ: chính khách sạn gốc; `status='SUSPENDED'`; sân bay khác (`SGN`); khách sạn hết phòng (đơn CONFIRMED phủ kín); khách sạn có khóa `LOCK` kín phòng; khách sạn chỉ còn loại phòng `active=false` hoặc `retired_at` khác null; loại phòng đủ `qty=1` nhưng yêu cầu `qty=3` → loại.
  - Đơn `HOLD` đã hết hạn không làm khách sạn bị loại; `HOLD` còn hạn thì loại.
  - Khách sạn gốc có hai sân bay (HAN, SGN): ứng viên trùng một trong hai đều được; `airport` trả về là sân bay có `km` nhỏ nhất của ứng viên trong các sân bay trùng.
  - Không ứng viên → `[]` (không ném lỗi).
  - Chọn loại phòng rẻ nhất trong các loại còn đủ chỗ; hai khách sạn cùng `km` sắp theo giá rồi tên.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/alternatives.integration.test.ts` → FAIL: `Cannot find module '../services/bookings/alternatives'`.
- [ ] **Step 3: Implement** `suggestAlternatives` theo thuật toán cố định ở trên; một câu SQL lấy danh sách ứng viên + loại phòng (`LIMIT 50` ứng viên gần nhất để chặn chi phí), phần kiểm tồn lặp trong bộ nhớ.
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `npm run typecheck` sạch.
- [ ] **Step 5: Commit**: `feat(airrest): alternative hotel suggestions for rejected bookings`.

**Deliverable:** hàm gợi ý tối đa 3 khách sạn thay thế, được kiểm bằng test với khóa/giữ chỗ/sân bay.

---

### Task 9: Khách sạn/admin xác nhận và từ chối booking (+ hoàn tiền PENDING, + khách thấy kết quả)

**Files:**
- Modify: `backend/services/bookings/bookings.service.ts` (thêm `confirmBooking`, `rejectBooking`; mở rộng `toGuestView` dòng 20-36 với `decision`; thêm `lookupBooking` kèm `decision` dòng 169-173)
- Modify: `backend/api/modules/bookings/bookings.router.ts` (thêm 2 route vào `hotelBookingsRouter` sau check-in; truyền decision vào `lookup` response)
- Modify: `packages/validation/src/bookings.ts` (thêm `rejectBookingBody`)
- Modify: `backend/api/openapi.ts` (`/v1/hotel/bookings/{id}/confirm`, `/reject`; schema `BookingDecision`, sửa `/v1/bookings/lookup` trả `decision`), `backend/docs/Airrest_Admin_API.postman_collection.json` (folder `8. Xác nhận / từ chối booking`)
- Test: `backend/tests/booking-decisions.integration.test.ts`

**Interfaces:**
- Consumes: `hotelScope`, `suggestAlternatives` (Task 8), `PERM.BOOKING_DECIDE` (Task 7), `emitBookingChange`, `writeAudit`, `bookingFromRow`, bảng `refunds`/`payments`.
- Produces (zod): `rejectBookingBody = { reason: string trim 3..500 }`.
- Produces (service):
  - `confirmBooking(auth: AuthContext, bookingId: string, requestId?: string): Promise<BookingDoc>`
  - `rejectBooking(auth: AuthContext, bookingId: string, input: { reason: string }, requestId?: string): Promise<{ booking: BookingDoc; alternatives: Alternative[] }>`
- Produces (route, `authenticate` đã gắn ở `hotelBookingsRouter`):
  - `POST /v1/hotel/bookings/:id/confirm` — `requirePermission(PERM.BOOKING_DECIDE)` → `200 { booking }`
  - `POST /v1/hotel/bookings/:id/reject` — `requirePermission(PERM.BOOKING_DECIDE)`, body `rejectBookingBody` → `200 { booking, alternatives }`
  - Admin dùng cùng route nếu có `booking:decide` + `hotel:scope:all` (`hotelScope` trả `{}`) — đây là "admin duyệt/từ chối thay" của FR-ADM-04; ghi `actor` ADMIN trong audit và lịch sử.
- Mã lỗi: đơn không tồn tại hoặc ngoài phạm vi khách sạn → `404 BOOKING_NOT_FOUND`; trạng thái khác `PENDING` → `409 INVALID_STATE`; hết hạn chờ → `409 BOOKING_EXPIRED`.
- Thuật toán cố định (cả hai hàm), trong MỘT `withTransaction`:
  1. `SELECT * FROM bookings WHERE id=$1 AND ($scope::uuid IS NULL OR hotel_id=$scope) FOR UPDATE`; không có → 404.
  2. `status <> 'PENDING'` → 409 `INVALID_STATE`.
  3. Nếu `expires_at IS NOT NULL AND expires_at <= now`: chạy `expireOne` ngay trong transaction này (đơn → `EXPIRED`, `room_reservations` HOLD → `RELEASED`, audit `BOOKING.EXPIRE` `reasonCode HOLD_EXPIRED`, `booking_decisions` `EXPIRED`; đã thu tiền thì sinh refund như dưới), COMMIT rồi trả `409 BOOKING_EXPIRED` (cách làm: hàm trả cờ `expired` ra ngoài transaction rồi mới ném lỗi, để không rollback việc chuyển trạng thái).
  4. confirm: `UPDATE bookings SET status='CONFIRMED', expires_at=NULL, updated_at, status_history || {from:'PENDING',to:'CONFIRMED',at,by:actorOf(auth)}, v=v+1`; `UPDATE room_reservations SET state='CONFIRMED', hold_expires_at=NULL WHERE booking_id AND state='HOLD'` (nếu 0 dòng bị cập nhật → phòng đã nhả bất thường: ném `409 BOOKING_EXPIRED` và rollback, không xác nhận); upsert `booking_decisions(CONFIRMED)`; audit `BOOKING.CONFIRM`.
  5. reject: trạng thái `REJECTED`, history có `reasonCode: 'HOTEL_REJECTED'`; reservation HOLD → `RELEASED`; `alternatives = suggestAlternatives(tx, {hotelId, from: stay.from, to: stay.to, qty: Σ lines.qty, now})` (tính SAU khi nhả phòng); upsert `booking_decisions(REJECTED, reason, alternatives)`; audit `BOOKING.REJECT` có `reasonNote = reason`.
  6. Nếu `payment_status='PAID' AND paid_vnd > 0` (đơn VNPay đã trả, chỉ ở nhánh reject và `EXPIRED`): `INSERT INTO refunds (...) VALUES (...) ON CONFLICT (key) DO NOTHING` với `key = 'DECISION:' || booking.id`, `payment_id` = payment `SUCCEEDED` của đơn, `amount_vnd = paid_vnd`, `reason_code = 'HOTEL_REJECTED'` (hoặc `'HOTEL_NO_RESPONSE'` khi hết hạn), `method 'VNPAY'`, `status 'PENDING'`, `due_at = 'infinity'` (để `reconcilePayments` KHÔNG tự gọi cổng; xem mâu thuẫn #2), `gateway` theo `newRefund` hiện có; audit `REFUND.CREATE`. Không ghi sổ cái, không gọi VNPay.
  7. Sau commit: `emitBookingChange({ code, status, hotelId, updatedAt, isNew:false })`.
- Khách: `toGuestView` thêm `decision?: { status: 'CONFIRMED'|'REJECTED'|'EXPIRED'; reason?: string; decidedAt: Date; alternatives: Alternative[] }` chỉ khi có bản ghi (lookup join `booking_decisions`); không lộ `decidedBy`.

- [ ] **Step 1: Viết test thất bại** `booking-decisions.integration.test.ts` (hotel `H1` `manual:true`, loại phòng total 1 và total 3; `mkStaff(H1,[BOOKING_READ, BOOKING_DECIDE])`; `mkStaff(H2, ...)`; `mkStaff(H1,[BOOKING_READ])` chỉ đọc; `mkAdmin([BOOKING_DECIDE, HOTEL_SCOPE_ALL, BOOKING_READ])`; helper nội bộ `book(phone)` gọi `POST /v1/bookings`):
  - `đơn mới của KS manual:true vào PENDING + HOLD`; `confirm → 200, status CONFIRMED, expires_at NULL, room_reservations.state='CONFIRMED', audit BOOKING.CONFIRM, booking_decisions CONFIRMED`; `lookup` của khách thấy `status CONFIRMED` và `decision.status === 'CONFIRMED'`; `emitBookingChange` được gọi (nghe `bookingEvents.on('change')` → nhận `{status:'CONFIRMED', isNew:false}`).
  - `đơn của KS manual:false vẫn CONFIRMED ngay (công tắc hotel.approval.manual)` và `confirm` đơn đó → 409 `INVALID_STATE`.
  - `reject không lý do / lý do 2 ký tự → 422`; `reject hợp lệ → 200`, `status REJECTED`, reservation `RELEASED`, `alternatives` tối đa 3 (tạo thêm 4 khách sạn ứng viên cùng HAN), `lookup` khách thấy `decision.reason` và `decision.alternatives` (khi đó `GET /v1/bookings/lookup` response KHÔNG chứa `decidedBy`); phòng được nhả: đặt mới vào cùng khoảng → 201.
  - Quyền: chỉ-đọc → 403 cho cả confirm/reject; khách sạn H2 → 404 (không lộ); token khách (GUEST) → 403; không token → 401; admin có `HOTEL_SCOPE_ALL + BOOKING_DECIDE` xác nhận đơn của H1 → 200 và `audit.actor.type === 'ADMIN'`.
  - **Review Focus 4**: `Promise.all([confirm, reject])` cùng đơn → `[200,409]` sắp xếp, đơn kết thúc đúng một trạng thái cuối khớp với bên thắng; `reject` hai lần liên tiếp → lần 2 `409 INVALID_STATE`; trong 10 lần lặp không có hai dòng `booking_decisions`.
  - Đơn VNPay đã trả (`paymentMethod:'VNPAY'`, sau đó `POST /v1/payments/vnpay/dev-simulate { orderId: <payments.txn_ref>, resultCode: 0 }` → đơn `PENDING`, `payment_status 'PAID'`): `reject` → đúng 1 dòng `refunds` `status 'PENDING'`, `amount_vnd === paid_vnd`, `reason_code 'HOTEL_REJECTED'`, `due_at` = infinity; gọi `POST /v1/admin/payments/reconcile` sau đó → refund vẫn `PENDING` (không bị xử lý); `reject` lặp (race) vẫn chỉ 1 refund; đơn `AT_HOTEL` reject → 0 refund.
  - **Review Focus 3**: đơn `PENDING` bị `UPDATE bookings SET expires_at = now() - interval '1 minute'` và `UPDATE room_reservations SET hold_expires_at = now() - interval '1 minute'` (giả lập job chưa chạy), rồi KHÁCH KHÁC đặt cùng phòng cuối → 201 (vì hold đã lỡ hạn) → lễ tân `confirm` đơn cũ → `409 BOOKING_EXPIRED`, đơn cũ `EXPIRED` (đã commit, không rollback), phòng của đơn mới KHÔNG bị ảnh hưởng, `count('room_reservations', "state='CONFIRMED'") === 0 hoặc đúng số đơn hợp lệ`; `reject` đơn quá hạn cũng `409 BOOKING_EXPIRED`; đơn VNPay đã trả quá hạn → refund PENDING `HOTEL_NO_RESPONSE`.
  - `confirm` khi khách đã bị khóa phòng chen vào sau hold: hold còn hạn nên khóa bị chặn (đã phủ ở Task 4), test xác nhận lại bằng `confirm` vẫn 200.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/booking-decisions.integration.test.ts` → FAIL: `expected 404 to be 200` (route chưa có).
- [ ] **Step 3: Implement** theo thuật toán cố định; router mỏng gọi service; cập nhật openapi (2 path + schema `decision` trong lookup) và Postman (confirm, reject, reject-thiếu-lý-do; thêm biến `bookingId`). Dùng lại `isDuplicateKey`/`ON CONFLICT` thay vì khóa mới.
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `RUN_DB_TESTS=1 npx vitest run` toàn bộ xanh; `npm run typecheck` sạch.
- [ ] **Step 5: Commit**: `feat(airrest): hotel confirm and reject bookings with alternatives and pending refunds`.

**Deliverable:** lễ tân/admin xác nhận hoặc từ chối đơn (lý do bắt buộc, tối đa 3 gợi ý, refund PENDING nếu đã thu tiền), khách tra cứu thấy kết quả; các race Review Focus 3-4 có test.

---

### Task 10: Quét đơn hết hạn chờ xác nhận (EXPIRED + nhả phòng)

**Files:**
- Modify: `backend/services/bookings/bookings.service.ts` (thêm `expireOne`, `expireOverdueBookings`; dùng lại ở `confirmBooking`/`rejectBooking` Task 9; `lookupBooking` dòng 169-173 gọi lazy-expire)
- Modify: `backend/services/payments/payments.service.ts` (`reconcilePayments` dòng ~280-320: gọi `expireOverdueBookings`, cộng vào `out.expiredBookings`)
- Modify: `backend/api/server.ts` (dòng ~14-17: `setInterval` quét; dọn trong `shutdown` dòng ~25)
- Modify: `backend/config/env.ts` (thêm `BOOKING_EXPIRY_SWEEP_SEC`: int, mặc định 60, `0` = tắt)
- Modify: `backend/README.md` (mục "Giới hạn đã biết": thay câu "chưa có scheduler" cho phần hết hạn đơn chờ duyệt bằng mô tả mới; bảng env nếu có)
- Test: `backend/tests/booking-expiry.integration.test.ts`

**Interfaces:**
- Produces: `expireOne(tx: Db, bookingId: string, actor: Actor, now: Date, requestId?: string): Promise<{ code: string; status: 'EXPIRED'; hotelId: string } | null>` — `UPDATE bookings SET status='EXPIRED' ... WHERE id=$1 AND status='PENDING' AND expires_at <= $now` (điều kiện trong câu UPDATE); trả `null` nếu không khớp; nhả `room_reservations` HOLD → `RELEASED`; `booking_decisions(EXPIRED)`; audit `BOOKING.EXPIRE` `reasonCode 'HOLD_EXPIRED'`; đơn đã thu tiền → refund PENDING giống Task 9 bước 6 (`HOTEL_NO_RESPONSE`). Tách phần "tạo refund PENDING nếu đã thu tiền" thành hàm dùng chung `createDecisionRefund(tx, booking, reasonCode, now)` và Task 9 gọi lại hàm này.
- Produces: `expireOverdueBookings(actor: Actor, requestId?: string, now = new Date()): Promise<{ expired: number }>` — chọn `id` của đơn `status='PENDING' AND expires_at <= now ORDER BY expires_at LIMIT 200`, mỗi đơn một transaction (`expireOne`), `emitBookingChange` sau commit. Actor mặc định `{ type: 'SYSTEM' }`.
- `lookupBooking(code, phone)`: nếu đơn `PENDING` và `expiresAt <= now` → chạy `expireOne` rồi đọc lại; khách luôn thấy `EXPIRED` ngay cả trước khi job chạy.
- `server.ts`: `const sweep = env.BOOKING_EXPIRY_SWEEP_SEC > 0 ? setInterval(() => expireOverdueBookings({type:'SYSTEM'}).catch(log), sec*1000) : undefined; sweep?.unref()`; `clearInterval` khi `shutdown`. Chạy nhiều tiến trình an toàn nhờ điều kiện trong UPDATE.

- [ ] **Step 1: Viết test thất bại** `booking-expiry.integration.test.ts`:
  - 3 đơn `PENDING` của KS `manual:true`: 2 đơn bị `UPDATE ... expires_at = now() - interval '1 minute'`, 1 đơn còn hạn → `expireOverdueBookings` trả `{ expired: 2 }`; hai đơn `EXPIRED`, reservation `RELEASED`, `booking_decisions` `EXPIRED`, audit `BOOKING.EXPIRE` có `actor.type 'SYSTEM'`; đơn còn hạn không đổi; chạy lần 2 → `{ expired: 0 }` (idempotent).
  - Nhả phòng thật sự: `rt1` total 1, đơn quá hạn bị quét → đặt phòng mới cùng khoảng → 201.
  - Đơn `CONFIRMED` / `CHECKED_IN` / `PENDING_PAYMENT` có `expires_at` quá khứ không bị đụng (PENDING_PAYMENT thuộc luồng payments).
  - Đơn VNPay đã trả + quá hạn chờ duyệt → 1 refund `PENDING`, `reason_code 'HOTEL_NO_RESPONSE'`; quét hai lần vẫn 1 refund.
  - Phát sự kiện: lắng nghe `bookingEvents` nhận `{ status: 'EXPIRED', isNew: false }` cho mỗi đơn.
  - Race: `Promise.all([expireOverdueBookings, expireOverdueBookings, confirm])` trên cùng đơn quá hạn → đơn kết thúc `EXPIRED` đúng một lần (1 audit `BOOKING.EXPIRE`), confirm trả 409.
  - `lookup` đơn quá hạn chưa quét → response `status 'EXPIRED'` và `decision.status 'EXPIRED'`.
  - `POST /v1/admin/payments/reconcile` (admin `admin:payment:manage`) trả `expiredBookings` bao gồm các đơn chờ duyệt quá hạn.
  - Validation env: `BOOKING_EXPIRY_SWEEP_SEC` âm → env parse lỗi (kiểm bằng unit gọi schema nếu `env.ts` export; nếu không export thì bỏ dòng này và ghi `shortcut` trong code).
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/booking-expiry.integration.test.ts` → FAIL: `expireOverdueBookings is not a function`.
- [ ] **Step 3: Implement** theo Interfaces; refactor `confirmBooking/rejectBooking` (Task 9) dùng `expireOne`/`createDecisionRefund` (chỉ đổi chỗ gọi, không đổi hành vi — chạy lại test Task 9 để chứng minh).
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `RUN_DB_TESTS=1 npx vitest run` toàn bộ xanh; `npm run typecheck` sạch. Smoke tay: `BOOKING_EXPIRY_SWEEP_SEC=5 npm run dev:api`, tạo đơn, hạ `expires_at` bằng SQL, đợi ≤ 5s thấy đơn `EXPIRED` trong `GET /v1/hotel/bookings`.
- [ ] **Step 5: Commit**: `feat(airrest): expire overdue pending bookings and release rooms`.

**Deliverable:** đơn chờ xác nhận quá hạn tự `EXPIRED`, nhả phòng, khách thấy kết quả tức thì khi tra cứu; hoàn tiền chỉ ghi PENDING.

---

### Task 11: Admin xem toàn bộ booking + chi tiết booking (khách sạn và admin)

**Files:**
- Modify: `backend/services/bookings/bookings.service.ts` (`listHotelBookings` dòng 176-190 mở rộng bộ lọc; thêm `getBookingDetail`)
- Modify: `backend/api/modules/bookings/bookings.router.ts` (thêm `GET /:id` vào `hotelBookingsRouter`)
- Create: `backend/api/modules/admin/bookings.router.ts`; Modify: `backend/api/modules/admin/admin.router.ts` (thêm `adminRouter.use(adminBookingsRouter)` dòng ~19)
- Modify: `packages/validation/src/bookings.ts` (`staffListQuery` thêm `code?`, `from?`, `to?`; thêm `adminBookingListQuery = staffListQuery.extend({ hotelId?: uuid })`)
- Modify: `backend/api/openapi.ts` (tag `Admin · Booking`; `/v1/admin/bookings`, `/v1/admin/bookings/{id}`, `/v1/hotel/bookings/{id}`; thêm tham số lọc cho `/v1/hotel/bookings`), `backend/docs/Airrest_Admin_API.postman_collection.json` (folder `9. Admin xem booking`)
- Test: `backend/tests/booking-admin-list.integration.test.ts`

**Interfaces:**
- Produces (zod): `code?: string trim upper 2..12` (khớp tiền tố mã, `ILIKE escapeLike(code) || '%'`), `from?: coerce.date`, `to?: coerce.date` (lọc `stay_from >= from AND stay_from < to`, `to <= from` → 422), `status` gồm đủ 9 trạng thái (Task 7).
- Produces (service):
  - `listBookings(auth: AuthContext, q: AdminBookingListQuery): Promise<{ items: BookingDoc[]; nextCursor: number | null }>` — thay thế `listHotelBookings` (giữ tên cũ làm alias để không đổi import hiện có); `hotelScope(auth)` bắt buộc; `q.hotelId` chỉ có hiệu lực khi scope là "tất cả", ngược lại bị bỏ qua; keyset `seq < cursor`, `ORDER BY seq DESC`, mặc định không kèm `statusHistory`.
  - `getBookingDetail(auth: AuthContext, id: string): Promise<{ booking: BookingDoc; decision?: BookingDecisionDoc }>` — kèm `statusHistory` + `decision`; ngoài phạm vi/không có → `404 BOOKING_NOT_FOUND`.
- Produces (route):
  - `GET /v1/hotel/bookings?status&code&from&to&limit&cursor` — `BOOKING_READ` (đã có, mở rộng lọc)
  - `GET /v1/hotel/bookings/:id` — `BOOKING_READ`
  - `GET /v1/admin/bookings?hotelId&status&code&from&to&limit&cursor` — `requirePermission(PERM.BOOKING_READ, PERM.HOTEL_SCOPE_ALL)`
  - `GET /v1/admin/bookings/:id` — cùng quyền
- Ghi chú: SUPPORT/FINANCE hiện có `booking:read` nhưng không có `hotel:scope:all` nên bị 403 ở route admin (xem mâu thuẫn #6); không thêm mã quyền mới.

- [ ] **Step 1: Viết test thất bại** `booking-admin-list.integration.test.ts` (2 khách sạn H1/H2, 25 đơn rải trạng thái bằng `POST /v1/bookings` + `confirm`/`reject`/`check-in`/UPDATE trực tiếp):
  - Admin (`BOOKING_READ + HOTEL_SCOPE_ALL`) `GET /v1/admin/bookings?limit=10` → 10 đơn mới nhất trước; theo `nextCursor` đi hết 25 đơn: không trùng, không sót, `seq` giảm dần; `nextCursor` cuối là `null`.
  - Lọc `status=REJECTED`, `hotelId=H2`, `code=AR-AB` (tiền tố), `from/to` theo ngày lưu trú, kết hợp nhiều bộ lọc; `code` chứa `%`/`_` không khớp bừa (kiểm bằng `code=%` → 0 kết quả hoặc 422).
  - `to <= from` → 422; `limit=101` → 422; `cursor=-1` → 422; `status=FOO` → 422.
  - Quyền: token KS (không `hotel:scope:all`) gọi `/v1/admin/bookings` → 403; `mkAdmin([BOOKING_READ])` (kiểu SUPPORT, không scope all) → 403; không token → 401; token KS gọi `/v1/hotel/bookings?hotelId=<H2>` → chỉ thấy H1 (bỏ qua `hotelId`).
  - Chi tiết: `GET /v1/admin/bookings/:id` có `booking.statusHistory` (đủ các bước `PENDING→REJECTED`) và `decision.reason`; `GET /v1/hotel/bookings/:id` của KS khác → 404; id không phải uuid → 422.
  - List không kèm `statusHistory` (giữ hành vi cũ); `guest.phone` hiện đầy đủ cho admin (quyền đã được kiểm).
  - Test cũ `booking.integration.test.ts` (list lễ tân) vẫn xanh.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/booking-admin-list.integration.test.ts` → FAIL: `expected 404 to be 200` (route admin chưa có).
- [ ] **Step 3: Implement** theo Interfaces: dựng `WHERE` bằng helper `add()` sẵn có ở `listHotelBookings` (dòng 180); router admin mỏng, cùng mẫu `auditRouter`. Cập nhật openapi, Postman.
- [ ] **Step 4: Chạy pass**: lệnh Step 2 → PASS; `RUN_DB_TESTS=1 npx vitest run` xanh; `npm run typecheck` sạch.
- [ ] **Step 5: Commit**: `feat(airrest): admin booking list and booking detail endpoints`.

**Deliverable:** admin xem/lọc/phân trang toàn bộ booking, cả hai cổng xem chi tiết có lịch sử trạng thái và quyết định.

---

### Task 12: FE nối API cho Đặt phòng (khách sạn), Tổng quan và Admin

**Files:**
- Modify: `packages/api-client/src/index.ts` (thêm `listHotelBookings(q)`, `getHotelBooking(id)`, `confirmBooking(id)`, `rejectBooking(id, reason)`, `listAdminBookings(q)`, `getAdminBooking(id)`)
- Modify: `apps/web/src/components/partner/HotelTabs1.jsx` — `BookingsTab` (dòng 37-99), `OverviewTab` (dòng 12-35: KPI chờ/đã xác nhận)
- Modify: `apps/web/src/components/partner/ui.jsx` (`BOOKING_STATUS` dòng 7: thêm `expired`, `cancelled`, `checked_in`, `checked_out`, `no_show`, `pending_payment` và ánh xạ khóa API chữ hoa)
- Modify: `apps/web/src/components/partner/AdminTabs3.jsx` — `MonitorTab` (dòng 10-80: cảnh báo đơn chờ xác nhận lâu), `ReportsTab` (dòng 183-210: phần báo cáo "Đặt phòng" chỉ đếm theo `status`)
- Modify: `apps/web/src/lib/partnerNav.js` (`adminNav` dòng 25-37: thêm tab `['bookings','Đặt phòng','Đặt phòng',CalendarCheck2, hasPerm(...)]` cho tài khoản API có `booking:read` + `hotel:scope:all`), `apps/web/src/screens/Admin.jsx` (dòng 33-43: render tab mới bằng `BookingsTab` ở chế độ `scope="admin"`)
- Test: build + kịch bản nghiệm thu thủ công (như Task 6); phần api-client có test ở `backend/tests/apiClient.integration.test.ts` (mở rộng)

**Interfaces:**
- Consumes: Task 5 (`createApiClient`, session có `token`/`permissions`), Task 9 và 11 (route).
- `BookingsTab` khi `session.source === 'api'`: lấy danh sách bằng `listHotelBookings({ status, code, limit: 30, cursor })` (nút "Tải thêm" dùng `nextCursor`); cột: mã, tên khách (`guest.fullName`, che tên nếu không có quyền xem nhạy cảm giữ logic `canV` hiện có), loại phòng (`lines[0].roomTypeName`), ngày (`stay.from`·`stay.nights`), cách trả (`payment.method`), trạng thái; nút **Xác nhận** (chỉ khi `PENDING` và `hasPerm('booking:decide')`) → `confirmBooking`; nút **Từ chối** (dùng `ReasonAction` sẵn có, lý do bắt buộc ≥ 3 ký tự) → `rejectBooking`, sau đó hiện hộp "Đã gợi ý N khách sạn thay thế" liệt kê `alternatives` (tên, loại phòng, giá, km). Lỗi `BOOKING_EXPIRED` → thông báo "Đơn đã hết hạn chờ xác nhận, phòng đã được nhả" và tải lại danh sách; `INVALID_STATE` → "Đơn đã được xử lý bởi người khác" và tải lại. Bỏ nhánh "Xác nhận lại sau khi từ chối" (state machine không cho `REJECTED → CONFIRMED`) và bỏ từ chối đơn `CONFIRMED` (thuộc luồng hủy, Plan sau). Chi tiết đơn: `getHotelBooking(id)` hiển thị `statusHistory` và `decision`.
- Realtime: giữ phạm vi plan này ở mức tải lại khi vào tab và nút "Làm mới" (Socket.io `hotel:{hotelId}:orders` đã có ở BE nhưng FE chưa có client socket — xem mâu thuẫn #7); `socket.io-client` chỉ thêm nếu người dùng duyệt.
- Admin tab "Đặt phòng": `listAdminBookings({ hotelId?, status?, code?, from?, to?, cursor })`, chi tiết `getAdminBooking`; admin có `booking:decide` dùng được nút Xác nhận/Từ chối (cùng route hotel).

- [ ] **Step 1: Định nghĩa kiểm thử (viết trước)**: (a) mở rộng `apiClient.integration.test.ts`: `confirmBooking`, `rejectBooking` (kiểm `alternatives` là mảng ≤ 3, lỗi `409 BOOKING_EXPIRED` thành `ApiError`), `listAdminBookings` phân trang theo `nextCursor`; (b) kịch bản thủ công với tiêu chí PASS: khách đặt phòng bằng `curl POST /v1/bookings` vào KS `manual:true` → lễ tân mở tab "Đặt phòng" thấy đơn `PENDING` (sau "Làm mới") → Xác nhận → pill "Đã xác nhận" và `POST /v1/bookings/lookup` của khách trả `CONFIRMED`; đơn khác → Từ chối không lý do: nút Xác nhận từ chối bị chặn với thông báo lỗi trường; có lý do: hiện hộp gợi ý và pill "Đã từ chối"; hạ `expires_at` bằng SQL rồi bấm Xác nhận → thấy thông báo hết hạn, đơn thành "Hết hạn"; đăng nhập `admin@demo.airrest.vn` → tab "Đặt phòng" liệt kê đơn của mọi khách sạn, lọc theo trạng thái hoạt động.
- [ ] **Step 2: Chạy xem fail**: `RUN_DB_TESTS=1 npx vitest run tests/apiClient.integration.test.ts` → FAIL: `client.confirmBooking is not a function`; FE: tab "Đặt phòng" với tài khoản API vẫn hiện danh sách mock `b.propertyId` (không trùng dữ liệu `GET /v1/hotel/bookings`).
- [ ] **Step 3: Implement** theo Interfaces: thêm hàm api-client; sửa các component để nhánh `source === 'api'` dùng API và nhánh mock cũ của các màn này bị xóa (hàm `setBookingStatus/addBooking` trong `mock/partner.js` vẫn còn vì luồng khách `Booking.jsx` và `PickupsTab` dùng chúng — ngoài phạm vi plan này, xem mâu thuẫn #8).
- [ ] **Step 4: Chạy pass**: `RUN_DB_TESTS=1 npx vitest run tests/apiClient.integration.test.ts` PASS; `npm run build:web` PASS; chạy lại kịch bản Step 1, mọi tiêu chí PASS; `npm run typecheck` sạch.
- [ ] **Step 5: Commit**: `feat(airrest): wire booking tabs to confirm/reject and admin list API`.

**Deliverable:** lễ tân xác nhận/từ chối đơn thật trên FE (kèm gợi ý thay thế), admin có tab xem toàn bộ booking, Tổng quan/Giám sát dùng số liệu API.

---

## Kiểm tra bao phủ spec (tự rà)

| Yêu cầu spec | Task |
|---|---|
| D1: `PENDING` mặc định, `CONFIRMED` sau xác nhận, `REJECTED`, `EXPIRED` quá hạn + nhả phòng, giữ công tắc `hotel.approval.manual`, KS mới mặc định bật | T7 (mặc định, hạn cấu hình), T9 (confirm/reject), T10 (EXPIRED) |
| D2: từ chối bắt buộc lý do, tối đa 3 KS thay thế còn phòng cùng sân bay, đã thu tiền → `refunds` PENDING chưa thực thi | T8, T9 (+T10 cho hết hạn) |
| D7: CRUD loại phòng riêng, tồn theo `room_reservations` + bảng `room_blocks`, kiểm tồn khi đặt trừ cả khóa | T1, T3, T4 |
| D9: quyền chỉ theo permission, mã mới `booking:decide`, `room:manage`, gán trong seed | T3 (`room:manage`), T7 (`booking:decide`) |
| Admin xem toàn bộ booking (BACKEND_TASKS #16) | T11 |
| Realtime qua `bookingEvents` | T9, T10 (phát sau commit) |
| Swagger + Postman + `docs/postgres/README.md` mỗi task có route/bảng mới | T1, T3, T4, T7, T9, T11 |
| FE nối API (không còn mock cho luồng) | T5, T6, T12 |
| Test tích hợp `RUN_DB_TESTS=1`, typecheck sạch | mọi task |
| Thanh toán/VNPay không gọi cổng | T9/T10 (`due_at = infinity`, không ledger, không gọi `processRefund`) |

---

## Phát hiện/mâu thuẫn

1. **Spec D7 (`room_blocks`) vs code/thiết kế gốc**: `room_reservations` đã có `kind CHECK ('BOOKING','BLOCK')` và `docs/mongodb/THIET_KE_MONGODB_AIRREST.md:121,272` dự kiến khóa phòng là `kind='BLOCK'`; code `hotels.router.ts` stats (dòng 336-340, 363) đã đọc `kind='BLOCK'`, nhưng chưa nơi nào ghi `BLOCK` và bảng đó thiếu cột lý do/loại khóa/người tạo. Plan theo spec (bảng `room_blocks` riêng, Task 1) và chuyển stats sang bảng mới (Task 4); `kind='BLOCK'` thành cột chết. Phương án nhẹ hơn: thêm cột `reason`/`block_kind` vào `room_reservations` và bỏ bảng mới. **Cần người dùng chọn.**
2. **"Chưa thực thi hoàn tiền" vs `reconcilePayments`**: `payments.service.ts` dòng ~310 tự xử lý mọi `refunds PENDING` có `due_at <= now` (gọi VNPay mock/live). Để thỏa "chỉ tạo bản ghi PENDING", plan đặt `due_at = 'infinity'` cho lệnh hoàn do từ chối/hết hạn. Khi bật hoàn tiền thật cần một bước đặt lại `due_at` (ngoài phạm vi). Ngoài ra `RefundDoc.reasonCode` (types.ts:195) chỉ có `LATE_PAYMENT|DUPLICATE_PAYMENT`, plan thêm `HOTEL_REJECTED|HOTEL_NO_RESPONSE`.
3. **D1 "khách sạn mới mặc định bật duyệt tay" vs OQ-2-02 (duyệt tay tối đa 90 ngày, `checkApproval` ở hotels.router.ts:89-95)**: plan chèn `{"manual":true}` không có `manualUntil` khi tạo khách sạn, nhưng mọi `PATCH approval` vẫn bị giới hạn 90 ngày và `createBooking` bỏ qua `manualUntil` hoàn toàn (kể cả hiện tại). Cần chốt: duyệt tay vĩnh viễn mặc định (spec) hay hết hạn sau 90 ngày (SRS OQ-2-02)?
4. **Dữ liệu hiện có**: spec chỉ nói khách sạn MỚI mặc định bật; plan không đổi `hotels.approval` của khách sạn cũ, chỉ (a) đổi seed hotel demo sang `manual:true` và (b) thêm `booking:decide` vào các role HOTEL đang có `booking:checkin` (migration 004). Cần xác nhận (b) có chấp nhận được hay chỉ cấp qua seed/tay.
5. **FE `PricesPane`/`PolicyPane` (giá theo ngày, điều kiện lưu trú) và "đóng/mở bán"** không có tương đương ở BE (BE chỉ có `pricing.baseNightVnd`; không có giá theo ngày). Plan: gộp giá cơ bản vào form loại phòng, ẩn hai sub-tab khi dùng API, thay "Đóng/mở bán" bằng "Khóa phòng" (không `qty` = khóa phần còn trống). Cần người dùng duyệt thay đổi UX này hoặc mở thêm task giá theo ngày.
6. **Quyền xem toàn bộ booking của admin**: spec D9 không có mã quyền mới cho việc này; plan dùng `booking:read` + `hotel:scope:all` nên chỉ SYSADMIN xem được; SUPPORT/FINANCE/OPS (có `booking:read` nhưng không có scope-all, hoặc không có `booking:read`) bị 403. Cần chốt: cấp `hotel:scope:all` cho SUPPORT/FINANCE, hay thêm mã `admin:booking:read` (trái "tối thiểu")?
7. **Realtime FE**: BE đã phát `order:new`/`order:updated` (README Socket.io) nhưng FE chưa có `socket.io-client` và không có client nào; "lễ tân thấy đơn realtime" (spec mục 6) trong plan này chỉ đạt mức làm mới thủ công. Thêm socket client là một task nhỏ riêng nếu được duyệt.
8. **FE là mô phỏng bay-trước, mô hình khác BE**: FE dùng giờ mô phỏng theo phút, đặt chỗ không SĐT (`screens/Booking.jsx`), quyền theo 8 vai trò (`lib/rbac.js`), đăng nhập mock mật khẩu `Demo@2026`. Plan chỉ nối khu vực khách sạn/quản trị (đăng nhập email thật, `hasPerm`). Màn khách (`Booking.jsx`, `Stays.jsx`, `Status.jsx`) và `PickupsTab` vẫn mock — chưa có API khách tìm/đặt phòng trên FE; cần Plan riêng. Cũng chưa có framework test FE, nghiệm thu FE bằng `build:web` + kịch bản thủ công.
9. **Sai khác nhỏ so với `BACKEND_TASKS.md`**: tài liệu đề xuất `PATCH /v1/hotel/bookings/:id/confirm|reject`; plan dùng `POST` cho nhất quán với `check-in`. `staffListQuery.status` hiện thiếu `REJECTED/EXPIRED/PENDING_PAYMENT` (sửa ở Task 7). Postman collection có biến `hotelId` kiểu ObjectId cũ (`650000000000000000000001`) — không thuộc plan, nên cập nhật khi chạy Postman.
10. **Mã lỗi khác check-in**: `check-in` trả 409 cho đơn không thấy/ngoài phạm vi (test `booking.integration.test.ts:107`), còn confirm/reject trả 404 `BOOKING_NOT_FOUND` để phân biệt với `INVALID_STATE`. Giữ check-in như cũ (không refactor ngoài phạm vi).
