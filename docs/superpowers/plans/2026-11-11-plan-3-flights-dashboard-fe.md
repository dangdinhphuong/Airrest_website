# Airrest Plan 3 — Chuyến bay, Dashboard, nối FE–API và E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm xong Luồng 6a (chuyến bay mô phỏng + admin chỉnh tay), Luồng 6b (dashboard admin toàn hệ thống + mở rộng thống kê khách sạn) và Luồng 7 (lớp gọi API dùng chung ở FE, đăng nhập/token thật, dọn mock, một kịch bản E2E API đặt → xác nhận → hủy). Thanh toán/VNPay không đụng.

**Architecture:** Backend thêm bảng `flights` + `flight_changes` (migration 008), service `services/flights/` và `services/dashboard/` theo mẫu `hotels.router.ts` (route công khai) và `admin/hotels.router.ts` (route admin có quyền). FE dùng lại khung `packages/api-client` (đang trống) làm lớp fetch duy nhất, có bộ chuyển đổi ISO ↔ "phút tuyệt đối" để giữ nguyên toàn bộ logic thời gian hiện có của FE (`lib/domain.js`, `lib/time.js`).

**Tech Stack:** Node 22, Express 5, zod 3, `pg` SQL thuần, vitest + supertest (backend, test DB bằng `npm run test:db`), React 18 + Vite 6 (FE, không có test runner riêng), npm workspaces (`packages/*` là mã TS nguồn, không build).

**Spec:** `docs/superpowers/specs/2026-11-11-airrest-remaining-flows-design.md` (mục 4: D6, D8, D9; mục 5: ràng buộc). Đối chiếu: `docs/BACKEND_TASKS.md` (#2, #3, #13), `docs/srs/SRS_V2_NenTang_Airrest.md` (3.1 FLT, BR-FLT-01…05, 3.10 ADM-02/08), `docs/MVP.md` (MB-01, 02, 04, 08).

**Điều kiện đầu vào:** Plan 1 (migration 003-004) và Plan 2 (005-007) đã merge. Task 5 cần các bảng `support_tickets`, `shuttle_requests`, `change_requests` và các trạng thái `PENDING`/`REJECTED`/`EXPIRED` của booking. Task 12 cần các route xác nhận/hủy của Plan 1-2 (xem Task 12 để biết cách đối chiếu tên route).

**Quy ước chạy lệnh** (từ gốc `Airrest_website/`): test cần DB `npm run test:db -w @airrest/backend -- <file>`; test không cần DB `npm test -w @airrest/backend -- <file>`; kiểm kiểu `npm run typecheck`; build FE `npm run build:web`. Test DB bị `skip` nếu thiếu `RUN_DB_TESTS`, nên bước "chạy xem fail" của test DB luôn dùng `test:db`.

---

## Global Constraints

Trích nguyên văn spec mục 5:

- Stack hiện có: Node 22 + Express 5 + zod 3 + `pg` (SQL thuần), vitest + supertest, React/Vite. Không thêm ORM.
- Migration SQL thuần `backend/database/migrations/00N_*.sql`, tiếp theo là **003**. Mỗi luồng một file, theo thứ tự. Mỗi file kèm cập nhật `docs/postgres/README.md`.
- Mọi ghi dữ liệu đi qua transaction `withTransaction` và gọi `writeAudit` cùng transaction.
- Route khách (không đăng nhập) dùng `strictRateLimit` và `Idempotency-Key` với thao tác tạo.
- Id là uuid; phân trang keyset theo `seq`.
- Mỗi route mới phải cập nhật `api/openapi.ts` (Swagger) và file Postman.
- Sự kiện thay đổi booking đi qua `bookingEvents` để Socket.io đẩy tới giao diện.
- Test: mỗi luồng có test tích hợp (`RUN_DB_TESTS=1`); trạng thái cuối `npm run typecheck` sạch.
- Không in/lưu bí mật; `.env` là bí mật.

Ràng buộc bổ sung của plan này (suy ra từ spec mục 2, 3 và D9, không thêm yêu cầu mới):
- Migration của plan này là **008_flights.sql**; chỉ thêm 2 mã quyền: `flight:manage`, `admin:dashboard:read` (D9). Chỉ truy cập theo permission, không chặn theo tên vai trò.
- Mọi luồng chạy được khi `VNPAY_ENABLED=false`; không task nào gọi cổng thanh toán.
- Không dùng API chuyến bay ngoài. Mọi phản hồi chuyến bay mang `simulated: true`.
- Không rebase (`git pull` kiểu merge); mỗi task một commit.

---

## Review Focus

Các input/lỗi dễ cắn nhất mà các task thường bỏ sót. Mỗi dòng có test nằm trong task sở hữu (ghi trong ngoặc).

1. **Mã chuyến bay chữ thường / sai định dạng** (`vn218`, `V218`, `VN12345`, `VN 218`, `VN218'--`). Server chuẩn hóa chữ hoa rồi mới kiểm `^[A-Z]{2}[0-9]{1,4}$`; sai thì 422, không chạm DB. (Task 3: `flights.public.test.ts` "định dạng mã"; Task 1: ràng buộc CHECK ở DB.)
2. **Chuyến bị hủy**: `newDepartureAt`, `effectiveDepartureAt`, `delayMinutes` đều `null`, có `cancelledAt`; admin không đặt được giờ mới cho chuyến hủy; khôi phục chuyến hủy phải xóa `cancelledAt`. (Task 3 DTO hủy; Task 4 PATCH hủy/khôi phục.)
3. **Múi giờ và qua nửa đêm**: chậm từ 23:20 sang 06:00 hôm sau không đổi `flightDate` (tính theo giờ khởi hành dự kiến, múi `Asia/Ho_Chi_Minh`); giờ gửi lên có offset `+00:00` hay `+07:00` đều lưu đúng một thời điểm; FE quy ra "phút tuyệt đối" > 1440 đúng như mock (VN218: 1400 → 1800). (Task 1 cột sinh `flight_date`; Task 4 PATCH offset; Task 7 bộ chuyển đổi.)
4. **Dashboard khi chưa có dữ liệu**: đủ khóa trạng thái bằng 0, `trend` đủ số ngày bằng 0, không `null`/`NaN`/lỗi chia 0. FE hiển thị trạng thái rỗng. (Task 5 "DB rỗng"; Task 10 trạng thái rỗng.)
5. **Khoảng ngày sai**: `from > to`, `from = to`, khoảng > 92 ngày, ngày không tồn tại (`2026-02-30`), chuỗi rác → 422 mã ổn định, cho cả dashboard lẫn stats khách sạn. (Task 5, Task 6.)
6. **Ngưỡng trễ biên**: chậm đúng 300 phút (5 giờ) chưa vượt ngưỡng, 301 phút thì vượt (BR-FLT-01 "chậm > 5 giờ"); đổi `flight.thresholds` có hiệu lực ngay. (Task 3.)
7. **Sửa chuyến bay không đổi gì / hai admin sửa đồng thời**: không ghi `flight_changes` thừa, đồng thời thì khóa dòng, bản đến sau thấy trạng thái mới. (Task 4.)
8. **Rate limit công khai**: request thứ 11 trong 1 phút bị 429 `RATE_LIMITED`. (Task 3: `flights.ratelimit.test.ts`.)

---

## Cấu trúc file (tổng quan)

Backend tạo mới: `database/migrations/008_flights.sql`, `services/flights/flights.service.ts`, `services/flights/flightSeed.ts`, `services/flights/flightSeedData.ts`, `api/modules/flights/flights.router.ts`, `api/modules/admin/flights.router.ts`, `services/dashboard/dashboard.service.ts`, `api/modules/admin/dashboard.router.ts`, `tests/flights.*.test.ts`, `tests/dashboard.*.test.ts`, `tests/apiClient.test.ts`, `tests/e2e.booking-flow.test.ts`.
Backend sửa: `database/types.ts`, `database/scripts/seed.ts`, `config/permissions.ts`, `config/roles.ts`, `api/modules/index.ts`, `api/modules/admin/admin.router.ts`, `api/modules/admin/hotels.router.ts`, `api/modules/auth/auth.router.ts`, `api/modules/bookings/bookings.router.ts` (hoặc router `hotel/*` mà Plan 1 đã dùng), `api/openapi.ts`, `tests/support/db.ts`, `docs/Airrest_Admin_API.postman_collection.json`, `README.md`.
Packages: `shared-types/src/index.ts` (thêm `flights.ts`), `validation/src/flights.ts`, `api-client/src/*`.
FE: `apps/web/src/lib/api.js`, `lib/flightsApi.js`, `components/partner/FlightsTab.jsx`, và sửa `Login.jsx`, `store.jsx`, `App.jsx`, `Home.jsx`, `SimTools.jsx`, `Admin.jsx`, `lib/partnerNav.js`, `mock/service.js`, các tab Overview/Reports.

---

### Task 1: Migration 008, kiểu dữ liệu, kiểu dùng chung

**Files:**
- Create: `backend/database/migrations/008_flights.sql`
- Create: `packages/shared-types/src/flights.ts`
- Create: `packages/validation/src/flights.ts`
- Modify: `backend/database/types.ts` (thêm `FlightDoc`, `FlightChangeDoc`)
- Modify: `packages/shared-types/src/index.ts`, `packages/validation/src/index.ts` (export thêm)
- Modify: `docs/postgres/README.md` (thêm 2 dòng bảng `flights`, `flight_changes` và ghi chú cột sinh `flight_date`)
- Test: `backend/tests/flights.schema.test.ts`

**Interfaces:**
- Produces (shared-types): `FLIGHT_CODE_RE = /^[A-Z]{2}[0-9]{1,4}$/`; `type FlightStatus = 'ONTIME' | 'DELAYED' | 'CANCELLED'`; `type FlightCause = 'AIRLINE' | 'FORCE' | 'UNKNOWN'`; `type FlightScenario = 'approve' | 'reject' | 'hotelfull' | 'noreply'`; `interface FlightDto` (định nghĩa đầy đủ ở Task 3, đặt ở đây để FE/BE/api-client dùng chung).
- Produces (validation): `flightCodeSchema` (`z.string().transform(toUpperCase).pipe(z.string().regex(FLIGHT_CODE_RE))`), `flightDateSchema` (`YYYY-MM-DD`, kiểm ngày lịch hợp lệ), `updateFlightBodySchema` (Task 4 dùng).
- Produces (DB), bảng `flights`: `id uuid pk default gen_random_uuid()`, `seq bigint identity unique`, `code text not null check (code ~ '^[A-Z]{2}[0-9]{1,4}$')`, `airline text not null`, `origin char(3) not null`, `dest char(3)`, `sched_dep timestamptz not null`, `flight_date date GENERATED ALWAYS AS ((sched_dep AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) STORED`, `new_dep timestamptz`, `status text check in ('ONTIME','DELAYED','CANCELLED')`, `cause text check in ('AIRLINE','FORCE','UNKNOWN') default 'UNKNOWN'`, `cancelled_at timestamptz`, `distance_km integer`, `sim_scenario text check in ('approve','reject','hotelfull','noreply') default 'approve'`, `created_at`, `updated_at timestamptz default now()`; `UNIQUE (code, flight_date)`; ràng buộc nhất quán `CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))`, `CHECK (status <> 'CANCELLED' OR new_dep IS NULL)`, `CHECK (status <> 'ONTIME' OR new_dep IS NULL)`; index `(flight_date, code)`.
- Produces (DB), bảng `flight_changes`: `id uuid pk`, `seq bigint identity unique`, `flight_id uuid not null references flights(id)`, `from_dep timestamptz`, `to_dep timestamptz` (giờ bay hiệu lực trước/sau, null khi hủy hoặc chưa biết), `status_before`, `status_after`, `cause_before`, `cause_after` (text), `reason text not null`, `changed_by jsonb not null` (Actor), `created_at timestamptz default now()`; index `(flight_id, seq DESC)`.

- [ ] **Step 1: Viết test thất bại** `backend/tests/flights.schema.test.ts` (`run = process.env.RUN_DB_TESTS ? describe : describe.skip`, `beforeAll(freshDb)`, `afterAll(closeDb)`):
  - `it('mã chữ thường bị CHECK chặn')`: chèn `code='vn218'` trực tiếp → `await expect(...).rejects.toMatchObject({ code: '23514' })`.
  - `it('flight_date tính theo giờ Việt Nam')`: chèn `sched_dep='2026-11-11T17:30:00Z'` (= 00:30 ngày 12 giờ VN) → `expect(row.flightDate).toBe('2026-11-12')` (đặt `types.setTypeParser` hoặc `to_char(flight_date,'YYYY-MM-DD')` trong câu SQL của test).
  - `it('trùng (code, flight_date) -> 23505')`.
  - `it('hủy phải có cancelled_at và không có new_dep')`: `status='CANCELLED'` thiếu `cancelled_at` → `23514`; `status='CANCELLED', new_dep` khác null → `23514`.
  - `it('flight_changes tham chiếu flights')`: chèn `flight_id` ngẫu nhiên → `23503`.
  - Test thuần (không DB) trong cùng file: `expect(flightCodeSchema.safeParse('vn218').data).toBe('VN218')`; `expect(flightCodeSchema.safeParse('VN12345').success).toBe(false)`; `expect(flightDateSchema.safeParse('2026-02-30').success).toBe(false)`.
- [ ] **Step 2: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/flights.schema.test.ts`. Mong đợi: FAIL (`relation "flights" does not exist`, và không resolve được `flightCodeSchema`).
- [ ] **Step 3: Implement:** viết `008_flights.sql` đúng cột/ràng buộc ở Interfaces (SQL thuần, không sửa file cũ); `shared-types/flights.ts`; `validation/flights.ts` (`flightDateSchema` dùng regex `^\d{4}-\d{2}-\d{2}$` rồi `new Date(\`${s}T00:00:00Z\`).toISOString().startsWith(s)` để loại ngày không tồn tại); thêm `FlightDoc`/`FlightChangeDoc` vào `types.ts` (camelCase, `flightDate: string`); cập nhật `docs/postgres/README.md`.
- [ ] **Step 4: Chạy pass:** lệnh Step 2, tất cả PASS; thêm `npm run typecheck` sạch.
- [ ] **Step 5: Commit:** `git add backend/database packages docs/postgres backend/tests/flights.schema.test.ts && git commit -m "feat(flights): migration 008 flights + flight_changes, kiểu dùng chung"`.

**Deliverable test được:** `flights.schema.test.ts` xanh; `npm run db:migrate` áp được 008 trên DB trống và chạy lại không lỗi.

---

### Task 2: Dữ liệu mẫu chuyến bay (seed từ mock FE)

**Files:**
- Create: `backend/services/flights/flightSeedData.ts`, `backend/services/flights/flightSeed.ts`
- Modify: `backend/database/scripts/seed.ts` (gọi `seedFlights` sau phần tài khoản)
- Test: `backend/tests/flights.seed.test.ts`

**Interfaces:**
- Consumes: bảng `flights` (Task 1); nguồn dữ liệu `apps/web/src/mock/flights.js` (20 chuyến, `mk(code, {...})`).
- Produces: `FLIGHT_SEED: ReadonlyArray<{ code; origin; dest; dayOffset; status: FlightStatus; cause: FlightCause; schedMin; newMin: number | null; cancelledMin?: number; updatedMin; distanceKm; scenario: FlightScenario }>` (đúng 20 dòng, chép 1:1 từ mock, `airline` mọi dòng = `'Hãng mô phỏng'`).
- Produces: `seedFlights(tx: Db, now?: Date): Promise<number>` trả số dòng thực sự chèn. `export const vnDayStart = (now: Date): Date` (00:00 Asia/Ho_Chi_Minh của ngày VN chứa `now`; VN là UTC+7 không DST nên tính bằng số học `Date.UTC`).

Quy tắc quy đổi (cố định): `sched_dep = dayStart + (schedMin + dayOffset*1440) phút`; `new_dep` và `cancelled_at` tương tự; `updated_at = dayStart + updatedMin phút` (không cộng `dayOffset`, vì `updatedMin` trong mock đã là giá trị tuyệt đối). Lý do cộng `dayOffset`: mock có `QH120` (`dayOffset: 1`) và `VN702` (`dayOffset: -1`) nhưng `schedDep` lại nằm ngày 0, nếu không cộng thì `flight_date` sai. Trạng thái: `delayed→DELAYED`, `ontime→ONTIME` (`new_dep = NULL`), `cancelled→CANCELLED` (`new_dep = NULL`, `cancelled_at` từ `cancelledMin`, mock không có thì dùng `updatedMin`). Chèn bằng `ON CONFLICT (code, flight_date) DO NOTHING` để chạy lại `db:seed` không ghi đè chỉnh sửa của admin.

- [ ] **Step 1: Viết test thất bại** `flights.seed.test.ts`:
  - `it('chèn đúng 20 chuyến')`: `expect(await seedFlights(db, NOW)).toBe(20)` với `NOW = new Date('2026-11-11T05:00:00Z')`.
  - `it('VN218 chậm qua đêm: flight_date là hôm nay, giờ mới là 06:00 hôm sau')`: `schedDep` = `2026-11-11T16:20:00Z` (23:20 VN), `newDep` = `2026-11-11T23:00:00Z`, `flightDate` = `'2026-11-11'`.
  - `it('QH120 dayOffset 1 -> flight_date ngày mai; VN702 dayOffset -1 -> hôm qua')`.
  - `it('QH321 hủy: new_dep null, cancelled_at có giá trị'); it('QH555 chậm chưa biết giờ: DELAYED + new_dep null'); it('VN300 đúng giờ')`.
  - `it('chạy lại không nhân đôi và không ghi đè')`: `UPDATE flights SET cause='FORCE' WHERE code='VN123'`, gọi `seedFlights` lần 2 → trả `0`, `count('flights') === 20`, `cause` vẫn `FORCE`.
  - `it('mã mẫu trong SAMPLE_CODES của FE đều có')`: 7 mã `VN218 VJ456 QH321 VN111 VN123 QH555 VN300`.
- [ ] **Step 2: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/flights.seed.test.ts`. Mong đợi: FAIL, không resolve được `seedFlights`.
- [ ] **Step 3: Implement:** `flightSeedData.ts` (bảng 20 dòng) + `flightSeed.ts` theo quy tắc trên; trong `seed.ts` gọi `seedFlights(db)` và in số chuyến chèn. Ghi chú trong code: seed bám ngày chạy, chạy lại ở ngày khác sẽ tạo thêm bộ chuyến cho ngày đó (`shortcut`: không dọn bộ cũ, xóa tay hoặc làm job khi cần).
- [ ] **Step 4: Chạy pass:** lệnh Step 2 PASS; `npm run db:seed -w @airrest/backend` chạy hai lần liên tiếp không lỗi (kiểm tay).
- [ ] **Step 5: Commit:** `git commit -m "feat(flights): seed 20 chuyến bay mô phỏng từ dữ liệu mock FE"`.

**Deliverable test được:** `flights.seed.test.ts` xanh; sau `db:seed`, `SELECT count(*) FROM flights` ≥ 20.

---

### Task 3: `GET /v1/flights/:code` công khai

**Files:**
- Create: `backend/services/flights/flights.service.ts`, `backend/api/modules/flights/flights.router.ts`
- Modify: `backend/api/modules/index.ts` (`v1Router.use('/flights', flightsRouter)`), `backend/api/openapi.ts` (tag `Flights (công khai)`, path `/v1/flights/{code}`, schema `Flight`), `docs/Airrest_Admin_API.postman_collection.json` (folder "7. Chuyến bay (công khai)"), `backend/tests/support/db.ts` (thêm `mkFlight`), `backend/README.md` (1 dòng bảng API)
- Test: `backend/tests/flights.public.test.ts` (DB), `backend/tests/flights.ratelimit.test.ts` (không DB)

**Interfaces:**
- Consumes: `flightCodeSchema`, `flightDateSchema` (Task 1); `getConfig('flight.thresholds')` (`services/systemConfig.ts`); `strictRateLimit`, `validate`, `AppError`.
- Produces (`FlightDto`, trong `shared-types/flights.ts`):
  `{ id: string; code: string; flightDate: string; airline: string; origin: string; dest: string | null; scheduledDepartureAt: string; newDepartureAt: string | null; effectiveDepartureAt: string | null; status: FlightStatus; cause: FlightCause; cancelledAt: string | null; distanceKm: number | null; delayMinutes: number | null; delayedOverThreshold: boolean; lastChange: { fromAt: string; toAt: string; at: string } | null; simScenario: FlightScenario; updatedAt: string; asOf: string; simulated: true }` (mọi thời điểm là ISO 8601 UTC).
  `effectiveDepartureAt` = `null` nếu `CANCELLED`; `newDepartureAt` nếu `DELAYED` (có thể `null` = chưa biết giờ mới); `scheduledDepartureAt` nếu `ONTIME`. `delayMinutes` = `round((new - sched) / 60000)` chỉ khi `DELAYED` và có `new_dep`, còn lại `null`. `delayedOverThreshold` = `delayMinutes > delayHours * 60`. `lastChange` = dòng `flight_changes` mới nhất có cả `from_dep`, `to_dep` khác null và khác nhau (cho banner "Giờ bay đã đổi").
- Produces (service): `toFlightDto(row: FlightDoc, o: { delayHours: number; lastChange: LastChange | null; now: Date }): FlightDto`; `getFlight(code: string, date: string | undefined, now?: Date): Promise<FlightDto>`; `vnToday(now: Date): string` (`YYYY-MM-DD` giờ VN).
- Produces (route): `GET /v1/flights/:code?date=YYYY-MM-DD` — công khai, `strictRateLimit`, `validate({ params, query })`; `date` mặc định là `vnToday`; 404 `FLIGHT_NOT_FOUND`; 422 `VALIDATION_ERROR`. Không có `Idempotency-Key` (route chỉ đọc).
- Produces (test helper): `mkFlight(o: { code?; schedDep?: Date; newDep?: Date | null; status?: FlightStatus; cause?: FlightCause; delayHours?: never }): Promise<string>` trong `tests/support/db.ts`.

- [ ] **Step 1: Viết test thất bại** `flights.public.test.ts` (tối đa 10 lời gọi HTTP công khai trong file vì `strictRateLimit` = 10/phút theo tiến trình; các ca còn lại gọi thẳng `getFlight`/`toFlightDto`):
  - `it('định dạng mã')` (gọi `getFlight`/validate, không qua HTTP): `'vn218'` → thành công như `'VN218'`; `'V218'`, `'VN12345'`, `'VN 218'`, `"VN218'--"`, `'123'` → `ZodError`/422 và **không** truy vấn DB (spy `db.query` không được gọi).
  - `it('HTTP 200 chuyến chậm')`: `request(app).get('/v1/flights/vn218?date=2026-11-11')` → 200, `body.code === 'VN218'`, `body.simulated === true`, `body.status === 'DELAYED'`, `body.delayMinutes === 400`, `body.effectiveDepartureAt === body.newDepartureAt`, `body.lastChange === null`.
  - `it('404 khác ngày')`: cùng mã, `date=2026-11-13` → 404, `body.error.code === 'FLIGHT_NOT_FOUND'`.
  - `it('date sai -> 422')`: `date=2026-02-30` và `date=abc`.
  - `it('chuyến hủy')`: `QH321` → `status 'CANCELLED'`, `newDepartureAt/effectiveDepartureAt/delayMinutes` đều `null`, `cancelledAt` khác `null`, `delayedOverThreshold === false`.
  - `it('chậm chưa biết giờ mới')`: `QH555` → `newDepartureAt === null`, `delayMinutes === null`, `status 'DELAYED'`.
  - `it('ngưỡng biên')` (qua `toFlightDto`, `delayHours = 5`): chậm 300 phút → `delayedOverThreshold === false`; 301 phút → `true`; cập nhật `flight.thresholds` lên 6 giờ bằng `setConfig`/`INSERT INTO system_configs` rồi `getFlight` lại: 301 phút → `false`.
  - `it('qua nửa đêm')`: chuyến `sched 23:20 VN`, `new 06:00 VN hôm sau` → `flightDate` ngày hôm trước-của-new, tra bằng `date` của ngày sched thì thấy, tra bằng ngày của `new_dep` thì 404.
  - `it('lastChange')`: chèn 1 dòng `flight_changes` (from/to khác nhau) → `body.lastChange.toAt` đúng; chèn thêm dòng hủy (to null) không làm mất `lastChange`.
  - `it('không lộ trường nội bộ')`: `expect(body).not.toHaveProperty('seq')`.
  `flights.ratelimit.test.ts`: gửi 11 lần `GET /v1/flights/XX` (mã sai → 422 trước khi chạm DB) rồi `expect(res11.status).toBe(429)` và `res11.body.error.code === 'RATE_LIMITED'` (10 lần đầu `toBe(422)`).
- [ ] **Step 2: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/flights.public.test.ts` và `npm test -w @airrest/backend -- tests/flights.ratelimit.test.ts`. Mong đợi: FAIL (404 NOT_FOUND vì chưa có route, hoặc không import được service).
- [ ] **Step 3: Implement:** `flights.service.ts`, router (theo mẫu `hotels.router.ts`: `validate`, `AppError`, `db.query`), gắn route, thêm `mkFlight`, openapi + Postman (request "Tra chuyến bay VN218" có test script `pm.expect(j.simulated).to.eql(true)`), dòng README `GET /v1/flights/:code`.
- [ ] **Step 4: Chạy pass:** hai lệnh Step 2 PASS; `npm run typecheck` sạch; `GET /docs` hiển thị path mới.
- [ ] **Step 5: Commit:** `git commit -m "feat(flights): GET /v1/flights/:code công khai (mô phỏng)"`.

**Deliverable test được:** `curl 'http://localhost:3000/v1/flights/vn218'` (sau `db:seed`) trả 200 với `simulated: true`; hai file test xanh.

---

### Task 4: Admin sửa giờ/trạng thái chuyến bay + lịch sử

**Files:**
- Create: `backend/api/modules/admin/flights.router.ts`
- Modify: `backend/services/flights/flights.service.ts` (thêm `updateFlight`, `listFlights`, `listFlightChanges`), `backend/config/permissions.ts` (`FLIGHT_MANAGE: 'flight:manage'`), `backend/config/roles.ts` (gán `flight:manage` cho `OPS` và `SYSADMIN`), `backend/api/modules/admin/admin.router.ts` (`adminRouter.use(adminFlightsRouter)`), `packages/validation/src/flights.ts` (`updateFlightBodySchema`), `backend/api/openapi.ts` (tag `Admin · Chuyến bay`), Postman (folder "7b. Admin chuyến bay"), `backend/README.md` (bảng API + dòng quyền)
- Test: `backend/tests/flights.admin.test.ts`

**Interfaces:**
- Consumes: `FlightDto`, `toFlightDto` (Task 3); `withTransaction`, `writeAudit`, `actorOf`; `requirePermission(PERM.FLIGHT_MANAGE)`; `idParams`, `seqCursor`, `limitQuery`.
- Produces: `updateFlightBodySchema = z.object({ status: z.enum(['ONTIME','DELAYED','CANCELLED']), newDepartureAt: z.string().datetime({ offset: true }).nullable().optional(), cause: z.enum(['AIRLINE','FORCE','UNKNOWN']).optional(), reason: z.string().trim().min(3).max(200) })` (kiểu `UpdateFlightBody`).
- Produces (routes, cần `flight:manage`):
  - `GET /v1/admin/flights?code=&date=&status=&limit=&cursor=` → `{ items: Array<FlightDto & { seq: number }>, nextCursor: number | null }` (keyset `seq > cursor`).
  - `PATCH /v1/admin/flights/:id` body `UpdateFlightBody` → `200 { flight: FlightDto, change: { id: string; fromAt: string | null; toAt: string | null; statusBefore: FlightStatus; statusAfter: FlightStatus; reason: string; createdAt: string } }`.
  - `GET /v1/admin/flights/:id/changes?limit=&cursor=` → `{ items: change[], nextCursor }`, mới nhất trước.
- Produces (service): `updateFlight(auth: AuthContext, id: string, body: UpdateFlightBody, requestId?: string): Promise<{ flight: FlightDto; change: ... }>`.
- Quy tắc (cố định): `DELAYED` → `newDepartureAt` tùy chọn (`null` hoặc thiếu = chưa biết giờ mới), nếu có phải **>** `sched_dep` (422 `FLIGHT_TIME_INVALID`); `ONTIME` và `CANCELLED` mà có `newDepartureAt` khác null → 422 `FLIGHT_TIME_INVALID`; `CANCELLED` đặt `cancelled_at = now()`, rời `CANCELLED` thì xóa `cancelled_at`; `cause` thiếu thì giữ cũ; không đổi gì (trạng thái, giờ hiệu lực, nguyên nhân giống hệt) → 409 `FLIGHT_UNCHANGED`, không ghi `flight_changes`/audit; chuyến không tồn tại → 404 `FLIGHT_NOT_FOUND`. Trong transaction: `SELECT ... FOR UPDATE` dòng `flights`, cập nhật + `updated_at = now()`, chèn `flight_changes`, `writeAudit({ action: 'FLIGHT.UPDATE', entity: { type: 'flight', id }, before, after, reasonNote: reason }, tx)`.

- [ ] **Step 1: Viết test thất bại** `flights.admin.test.ts` (token qua `signAccountToken`, vai trò `OPS`, `SYSADMIN`, `SUPPORT` bằng `mkAccount` + `systemRoleId`):
  - `it('không token 401; SUPPORT (không có flight:manage) 403; OPS 200')` trên `GET /v1/admin/flights`.
  - `it('đổi giờ qua nửa đêm')`: chuyến sched 23:20 VN, PATCH `{ status:'DELAYED', newDepartureAt:'2026-11-12T06:00:00+07:00', reason:'Chậm kỹ thuật' }` → `change.toAt === '2026-11-11T23:00:00.000Z'`; sau đó `flight.flightDate` **không đổi**.
  - `it('offset khác nhau cùng một thời điểm')`: gửi `'2026-11-11T23:00:00+00:00'` rồi `'2026-11-12T06:00:00+07:00'` → lần hai 409 `FLIGHT_UNCHANGED`.
  - `it('giờ mới <= giờ dự kiến -> 422 FLIGHT_TIME_INVALID')`, `it('ONTIME kèm newDepartureAt -> 422')`, `it('thiếu reason -> 422 VALIDATION_ERROR')`.
  - `it('hủy rồi khôi phục')`: PATCH `CANCELLED` → `flight.cancelledAt` khác null, `effectiveDepartureAt === null`; PATCH `CANCELLED` kèm `newDepartureAt` → 422; PATCH `DELAYED` + giờ mới → `cancelledAt === null`.
  - `it('không đổi gì -> 409 và không có hàng thừa')`: `count('flight_changes')` giữ nguyên, `count('audit_logs', "action='FLIGHT.UPDATE'")` giữ nguyên.
  - `it('audit cùng transaction')`: sau PATCH thành công có đúng 1 dòng `audit_logs` `FLIGHT.UPDATE` với `reason_note`, `before.status`, `after.status`.
  - `it('hai PATCH đồng thời')`: `Promise.all` hai PATCH cùng chuyến khác giờ → một bên 200 cuối cùng, `flight_changes` có đúng 2 dòng và `from_dep` của dòng thứ hai bằng `to_dep` của dòng thứ nhất (không đọc giá trị cũ).
  - `it('lịch sử phân trang')`: tạo 3 thay đổi, `limit=2` → `nextCursor` khác null, trang 2 còn 1; `GET /v1/flights/:code` công khai thấy `lastChange` khớp thay đổi mới nhất.
  - `it('id không phải uuid -> 422'); it('id không tồn tại -> 404')`.
- [ ] **Step 2: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/flights.admin.test.ts`. Mong đợi: FAIL (404 vì chưa có route, hoặc `PERM.FLIGHT_MANAGE` undefined).
- [ ] **Step 3: Implement:** service + router + quyền + vai trò + schema + openapi + Postman + README. Test seed vai trò: `ensureSystemRoles` đã đồng bộ quyền mới, thêm assertion `ADMIN_ROLES.OPS.permissions` chứa `flight:manage` và `SUPPORT` thì không.
- [ ] **Step 4: Chạy pass:** lệnh Step 2 PASS; chạy thêm `npm run test:db -w @airrest/backend -- tests/admin.integration.test.ts` để chắc không làm hỏng test vai trò sẵn có; `npm run typecheck` sạch.
- [ ] **Step 5: Commit:** `git commit -m "feat(flights): admin sửa giờ/trạng thái chuyến bay, lịch sử, quyền flight:manage"`.

**Deliverable test được:** admin OPS gọi PATCH → khách `GET /v1/flights/:code` thấy giờ mới + `lastChange`; có dòng nhật ký `FLIGHT.UPDATE` ở `GET /v1/admin/audit-logs`.

---

### Task 5: Dashboard toàn hệ thống `GET /v1/admin/dashboard`

**Files:**
- Create: `backend/services/dashboard/dashboard.service.ts`, `backend/api/modules/admin/dashboard.router.ts`
- Modify: `backend/config/permissions.ts` (`ADMIN_DASHBOARD_READ: 'admin:dashboard:read'`), `backend/config/roles.ts` (gán cho `OPS`, `SUPPORT`, `FINANCE`, `SYSADMIN`), `backend/api/modules/admin/admin.router.ts`, `backend/api/openapi.ts` (tag `Admin · Dashboard`), Postman (folder "8. Dashboard"), `backend/README.md`
- Test: `backend/tests/dashboard.admin.test.ts`

**Interfaces:**
- Consumes: bảng `bookings`, `hotels`, và của Plan 1-2: `support_tickets(status)`, `shuttle_requests(status)`, `change_requests(status)`; `BookingStatus` (`shared-types`); `idParams` không dùng.
- Produces (service, dùng lại ở Task 6): `export interface DateRange { from: Date; to: Date }`; `resolveRange(q: { from?: Date; to?: Date }, now?: Date): DateRange` (mặc định 30 ngày gần nhất; ném `AppError(422, 'INVALID_RANGE')` nếu `from >= to`, `AppError(422, 'RANGE_TOO_LARGE')` nếu `to - from` > 92 ngày); `bookingCountsByStatus(db: Db, r: DateRange, hotelId?: string): Promise<Record<BookingStatus, { count: number; totalVnd: number }>>` (đủ mọi khóa, không có thì 0; lọc `created_at`); `bookingMoneyByStatus(db: Db, r: DateRange, hotelId?: string)` (cùng công thức với `/admin/hotels/:id/stats`: lọc `stay_from`, cộng `pricing.roomVnd + shuttleVnd` và `serviceFeeVnd`); `bookingTrend(db: Db, r: DateRange, hotelId?: string): Promise<Array<{ date: string; count: number }>>` (một phần tử mỗi ngày giờ VN, dùng `generate_series`, ngày không có đơn = 0).
- Produces (route): `GET /v1/admin/dashboard?from=&to=` quyền `admin:dashboard:read` →
  `{ asOf, range: { from, to }, bookings: { total, byStatus, pendingApproval, trend }, revenue: { realized: { hotelShareVnd, serviceFeeVnd }, expected: { hotelShareVnd, serviceFeeVnd } }, hotels: { byStatus: Record<HotelStatus, number>, pendingApproval }, support: { open, inProgress }, shuttle: { requested, assigned }, changeRequests: { pending } }`. `pendingApproval` (booking) = số đơn `PENDING` hiện tại (không phụ thuộc khoảng); `revenue.realized` = `CHECKED_OUT`, `expected` = `CONFIRMED` + `CHECKED_IN`.

- [ ] **Step 1: Viết test thất bại** `dashboard.admin.test.ts`:
  - `it('đổi tên bảng phụ thuộc: kiểm tồn tại')`: `SELECT to_regclass('support_tickets'), to_regclass('shuttle_requests'), to_regclass('change_requests')` đều khác null (nếu Plan 1-2 đặt tên khác, sửa service ở Step 3, không sửa test này).
  - `it('quyền')`: không token 401; admin chỉ có `booking:read` 403; `FINANCE` 200.
  - `it('DB rỗng')`: sau `freshDb`, `GET /v1/admin/dashboard` → 200, `body.bookings.total === 0`, mọi khóa của `BookingStatus` có trong `byStatus` với `{ count: 0, totalVnd: 0 }`, `body.bookings.trend.length === 30` hoặc 31 (đúng bằng số ngày của khoảng mặc định) và mọi `count === 0`, `body.revenue.realized.hotelShareVnd === 0`, `body.support.open === 0`, `Number.isFinite` đúng cho mọi số.
  - `it('đếm đúng theo trạng thái')`: chèn bằng helper đơn `PENDING`, `CONFIRMED`, `CANCELLED`, `CHECKED_OUT` (qua `createBooking` hoặc `INSERT` trực tiếp) và ticket/xe/yêu cầu đổi hủy theo trạng thái → các số `pendingApproval`, `support.open`, `shuttle.requested`, `changeRequests.pending` khớp.
  - `it('doanh thu khớp /admin/hotels/:id/stats')`: một khách sạn, cùng `from/to` → `revenue.realized` của dashboard bằng `revenue.realized` của stats.
  - `it('trend theo ngày giờ VN')`: đơn tạo lúc `2026-11-11T17:30:00Z` (00:30 ngày 12 VN) được tính vào `date: '2026-11-12'`.
  - `it('khoảng ngày sai')` (bảng tham số): `from>to`, `from=to`, 93 ngày, `from=2026-02-30`, `from=abc` → 422 và `body.error.code` lần lượt `INVALID_RANGE`, `INVALID_RANGE`, `RANGE_TOO_LARGE`, `VALIDATION_ERROR`, `VALIDATION_ERROR`; đúng 92 ngày → 200.
- [ ] **Step 2: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/dashboard.admin.test.ts`. Mong đợi: FAIL (404 `NOT_FOUND`).
- [ ] **Step 3: Implement:** service + router (`validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) })`; `z.coerce.date` với chuỗi rác cho `Invalid Date` nên dùng `.refine(d => !Number.isNaN(d.getTime()))` để ra `VALIDATION_ERROR`), truy vấn song song bằng `Promise.all`, tất cả chỉ đọc nên không cần transaction/audit (đúng spec D8 "không bảng mới"). Quyền, openapi, Postman, README.
- [ ] **Step 4: Chạy pass:** lệnh Step 2 PASS; `npm run typecheck` sạch.
- [ ] **Step 5: Commit:** `git commit -m "feat(dashboard): GET /v1/admin/dashboard + quyền admin:dashboard:read"`.

**Deliverable test được:** đăng nhập `admin@demo.airrest.vn` và `GET /v1/admin/dashboard` trả số liệu đủ khóa; test xanh.

---

### Task 6: Mở rộng thống kê khách sạn + `GET /v1/hotel/stats`

**Files:**
- Create: `backend/services/dashboard/hotelStats.ts`
- Modify: `backend/api/modules/admin/hotels.router.ts` (route `/hotels/:id/stats` chỉ còn gọi `getHotelStats`), router `/v1/hotel/*` của Plan 1 (nếu chưa có file riêng thì thêm vào `bookings.router.ts`, cạnh `hotelBookingsRouter`), `backend/api/openapi.ts`, Postman, `backend/README.md`
- Test: `backend/tests/dashboard.hotel.test.ts` (và chạy lại `admin.integration.test.ts`)

**Interfaces:**
- Consumes: `resolveRange`, `bookingCountsByStatus`, `bookingMoneyByStatus`, `bookingTrend` (Task 5); `hotelScope(auth)` (`services/bookings/bookings.service.ts`); `PERM.BOOKING_READ`, `PERM.ADMIN_HOTEL_READ`.
- Produces: `getHotelStats(hotelId: string, q: { from?: Date; to?: Date }, now?: Date): Promise<HotelStats>` — giữ nguyên mọi trường cũ (`hotelId`, `asOf`, `rooms`, `revenue`) và thêm `bookings: { total: number; byStatus: Record<BookingStatus, { count: number; totalVnd: number }>; pendingApproval: number; trend: Array<{ date: string; count: number }> }`. Ném `AppError(404, 'HOTEL_NOT_FOUND')`. Thay `INVALID_RANGE` cũ bằng `resolveRange` (cùng mã lỗi, thêm `RANGE_TOO_LARGE`).
- Produces (route): `GET /v1/admin/hotels/:id/stats` (giữ quyền `admin:hotel:read`, đầu ra là tập cha của cũ); `GET /v1/hotel/stats?from=&to=` quyền `booking:read`, khách sạn lấy từ token (`hotelScope`), tài khoản có `hotel:scope:all` mà không có `hotelId` → 422 `HOTEL_REQUIRED`. Hotel nào chỉ thấy khách sạn của mình, không có tham số `hotelId`.

- [ ] **Step 1: Viết test thất bại** `dashboard.hotel.test.ts`:
  - `it('stats cũ không đổi hình dạng')`: các khóa `rooms`, `revenue.realized`, `revenue.expected`, `revenue.byStatus` vẫn có (so snapshot với kết quả trước khi tách, lấy từ test hiện có trong `admin.integration.test.ts`).
  - `it('stats mới có bookings')`: sau khi chèn 2 đơn `PENDING` và 1 `CONFIRMED` → `bookings.pendingApproval === 2`, `bookings.byStatus.CONFIRMED.count === 1`.
  - `it('khách sạn không có đơn nào')`: mọi khóa 0, `trend` đủ ngày bằng 0, `rooms.availableNow === totalSellable`.
  - `it('/v1/hotel/stats cô lập khách sạn')`: tài khoản khách sạn A gọi thì chỉ thấy số của A (chèn đơn cho B, kỳ vọng không đổi); không truyền được `hotelId` qua query (`?hotelId=<B>` bị bỏ qua/422).
  - `it('quyền')`: không token 401; token khách vãng lai 403; tài khoản `SYSADMIN` không có `hotelId` → 422 `HOTEL_REQUIRED`.
  - `it('khoảng ngày sai')` (cùng bảng tham số Task 5) cho cả hai route; khách sạn không tồn tại → 404.
- [ ] **Step 2: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/dashboard.hotel.test.ts`. Mong đợi: FAIL (`bookings` undefined, `/v1/hotel/stats` 404).
- [ ] **Step 3: Implement:** chuyển thân handler stats hiện tại (dòng 325-370 của `admin/hotels.router.ts`) sang `getHotelStats` nguyên văn logic phòng, thay phần doanh thu bằng `bookingMoneyByStatus`, thêm `bookings`; thêm route; openapi (`/v1/hotel/stats`, mở rộng mô tả stats); Postman; README.
- [ ] **Step 4: Chạy pass:** `npm run test:db -w @airrest/backend -- tests/dashboard.hotel.test.ts tests/admin.integration.test.ts` PASS; `npm run typecheck` sạch.
- [ ] **Step 5: Commit:** `git commit -m "feat(dashboard): mở rộng stats khách sạn, thêm GET /v1/hotel/stats"`.

**Deliverable test được:** hai route trả cùng cấu trúc cho cùng khách sạn; test cũ và mới xanh.

---

### Task 7: Lớp gọi API dùng chung `packages/api-client` + bộ chuyển đổi thời gian

**Files:**
- Create: `packages/api-client/src/errors.ts`, `client.ts`, `flights.ts` (endpoint + `flightFromDto`), `auth.ts`, `dashboard.ts`
- Modify: `packages/api-client/src/index.ts` (export; Plan 1-2 thêm file endpoint riêng của họ và chỉ thêm một dòng export, tránh sửa chung), `packages/api-client/package.json` (không cần build), `apps/web/package.json` (dependency `"@airrest/api-client": "*"`), `apps/web/vite.config.js` (`server.proxy` cho `/v1` tới `process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000'`), `render.yaml` (service web: `VITE_API_BASE_URL`), `README.md` gốc (bỏ câu "FE chưa gọi API thật" của `api-client`), tạo `apps/web/src/lib/api.js`
- Test: `backend/tests/apiClient.test.ts` (không cần DB; import `../../packages/api-client/src/index`)

**Interfaces:**
- Consumes: `FlightDto`, `FLIGHT_CODE_RE` (shared-types); `fetch` toàn cục (Node 22 và trình duyệt).
- Produces: `class ApiError extends Error { status: number; code: string; details?: unknown; requestId?: string }` (`status 0` + `code 'NETWORK_ERROR'`/`'TIMEOUT'` khi không có phản hồi); `createApiClient(opts: { baseUrl?: string; getToken?: () => string | null; onUnauthorized?: (e: ApiError) => void; fetchImpl?: typeof fetch; timeoutMs?: number /* mặc định 10000 */ }): ApiClient`; `ApiClient.request<T>(method: string, path: string, o?: { query?: Record<string, string | number | undefined>; body?: unknown; headers?: Record<string, string> }): Promise<T>`; `newIdempotencyKey(): string` (`crypto.randomUUID()`); endpoint: `client.flights.get(code: string, o?: { date?: string }): Promise<FlightDto>`, `client.auth.login(email, password): Promise<{ token: string; account: AccountInfo }>`, `client.auth.me()`, `client.admin.flights.list/update/changes` (Task 4), `client.admin.dashboard.get(range?)`, `client.admin.hotelStats(id, range?)`, `client.hotel.stats(range?)`.
- Produces: `flightFromDto(dto: FlightDto, dayStart: Date): SimFlight` với `SimFlight = { id, code, origin, dest: string, airline, dayOffset: number, schedDep: number, newDep: number | null, status: 'ontime' | 'delayed' | 'cancelled', cause: 'airline' | 'force' | 'unknown', cancelledAt: number | null, distanceKm: number | null, scenario: FlightScenario, now: number, updatedAt: number, unknownTime: boolean, change?: { from: number; to: number; at: number }, delayedOverThreshold: boolean, source: 'api', manual?: false }`. Quy tắc: mọi số "phút" = `Math.round((Date.parse(iso) - dayStart.getTime()) / 60000)`; `newDep` = `effectiveDepartureAt` quy phút khi `ontime`/`delayed` có giờ, `null` khi `cancelled` hoặc `delayed` chưa biết giờ (FE hiện dùng `effectiveDep` = `newDep`, nên `ontime` phải có `newDep = schedDep`); `unknownTime = status === 'delayed' && newDep === null`; `dayOffset = Math.floor(schedDep / 1440)`; `now = Math.max(minutes(asOf), updatedAt)`; `change` lấy từ `lastChange`. Hàm thuần, không đụng `window`/`Date.now()`.
- Quy ước lỗi: mọi lỗi server theo dạng `{ error: { code, message, details?, requestId } }` → `ApiError`; HTTP 401 gọi `onUnauthorized` đúng một lần cho mỗi phản hồi.

- [ ] **Step 1: Viết test thất bại** `apiClient.test.ts`:
  - Dựng server thật không cần DB: `const server = http.createServer(createApp()).listen(0)`, `baseUrl = http://127.0.0.1:${port}`.
  - `it('lỗi 422 thành ApiError có code')`: `client.request('POST', '/v1/bookings/lookup', { body: { code: 'x', phone: '1' } })` → `rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' })`, `err.requestId` là chuỗi.
  - `it('401 gọi onUnauthorized một lần')`: `GET /v1/auth/me` không token → `status 401`, `code 'UNAUTHENTICATED'`, spy gọi 1 lần.
  - `it('gắn Authorization từ getToken')`: `getToken: () => 'abc.def.ghi'` → `code 'INVALID_TOKEN'` (chứng tỏ header đã gửi).
  - `it('mất mạng')`: `baseUrl` trỏ cổng đã đóng → `{ status: 0, code: 'NETWORK_ERROR' }`; `it('quá hạn')`: `timeoutMs: 1` với handler chậm (`fetchImpl` giả không bao giờ resolve) → `code 'TIMEOUT'`.
  - `it('query bỏ giá trị undefined')`: `fetchImpl` giả ghi lại URL: `flights.get('vn218', {})` → `/v1/flights/vn218` không có `?date=undefined`.
  - `flightFromDto` (dayStart = `new Date('2026-11-11T00:00:00+07:00')`): `it('qua nửa đêm')` DTO VN218 (sched `2026-11-11T16:20:00Z`, new `2026-11-11T23:00:00Z`) → `schedDep === 1400`, `newDep === 1800`, `dayOffset === 0`; `it('chuyến ngày mai')` sched `2026-11-12T23:00:00Z`... → `dayOffset === 1`; `it('hủy')` → `status 'cancelled'`, `newDep === null`; `it('đúng giờ')` → `newDep === schedDep`; `it('chậm chưa biết giờ')` → `unknownTime === true`; `it('now không nhỏ hơn updatedAt')`; `it('không phụ thuộc múi giờ máy')`: chạy lại với `process.env.TZ` khác không đổi kết quả (dayStart truyền vào).
- [ ] **Step 2: Chạy xem fail:** `npm test -w @airrest/backend -- tests/apiClient.test.ts`. Mong đợi: FAIL (`createApiClient` không được export).
- [ ] **Step 3: Implement:** các file trong `packages/api-client/src`; `apps/web/src/lib/api.js` tạo singleton `export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '', getToken: () => token, onUnauthorized })` kèm `setAuthToken(t)`/`setUnauthorizedHandler(fn)`; token chỉ giữ trong biến module (bộ nhớ), không `localStorage`, đúng comment D-18 của `state/store.jsx`. `npm install` ở gốc để liên kết workspace.
- [ ] **Step 4: Chạy pass:** lệnh Step 2 PASS; `npm run build:web` thành công (Vite phiên dịch TS của workspace); `npm run typecheck` sạch.
- [ ] **Step 5: Commit:** `git commit -m "feat(api-client): lớp fetch dùng chung, ApiError, bộ chuyển đổi chuyến bay cho FE"`.

**Deliverable test được:** `apiClient.test.ts` xanh; `npm run build:web` xanh; FE dev server gọi được `/v1/health` qua proxy (kiểm tay: `curl localhost:5174/health` hoặc cổng Vite dùng).

---

### Task 8: FE đăng nhập thật và xử lý token admin/khách sạn

**Files:**
- Modify (BE): `backend/api/modules/auth/auth.router.ts` (login và `/me` trả thêm `adminRole`, `hotelId`, `isOwner`), `backend/api/openapi.ts` (mô tả phản hồi)
- Modify (FE): `apps/web/src/screens/Login.jsx`, `apps/web/src/state/store.jsx`, `apps/web/src/App.jsx` (vô hiệu hóa effect thu hồi phiên mock cho phiên API), `apps/web/src/lib/rbac.js` (thêm `roleOfAccount`, `hasPerm`), `apps/web/src/lib/partnerNav.js` (`adminNav(role, permissions)` nhận thêm quyền)
- Test: `backend/tests/auth.login.integration.test.ts` (DB); FE kiểm tay theo danh sách bên dưới

**Interfaces:**
- Consumes: `api.auth.login`, `api.auth.me`, `setAuthToken`, `setUnauthorizedHandler` (Task 7); bảng `accounts` (`admin_role`, `is_owner`, `hotel_id`).
- Produces (BE): `POST /v1/auth/login` → `{ token, account: { id, fullName, type, permissions, adminRole: AdminRoleKey | null, hotelId: string | null, isOwner: boolean | null } }`; `GET /v1/auth/me` giữ `{ auth }` và thêm cùng các trường nếu `req.auth` chưa có (đọc `services/authz.ts` trước, chỉ thêm phần thiếu).
- Produces (FE): `roleOfAccount(a: { type; adminRole; isOwner }): 'admin' | 'ops' | 'support' | 'finance' | 'manager' | 'staff' | 'driver'` (`SYSADMIN→admin`, `OPS→ops`, `SUPPORT→support`, `FINANCE→finance`; `HOTEL` + `isOwner→manager`, còn lại `staff`; `DRIVER→driver`); `hasPerm(session, perm: string): boolean`; session mới `{ id, role, token, permissions: string[], propertyId: string | null, tenantId: string | null, sid: null, source: 'api' }` (session mock giữ nguyên hình dạng cũ, `source` thiếu).
- Hành vi: ô tên đăng nhập có `@` → gọi API; không có `@` → đường mock cũ (còn cho vai trò `auditor`, `driver` và người dùng cuối vì BE không có). 401 `INVALID_CREDENTIALS` hiện thông báo của server; 429 hiện "thao tác quá nhanh"; 401 sau đăng nhập (token hết hạn/thu hồi) → `logout` + `Notice` "Phiên đã hết hạn". Đăng xuất xóa token trong `lib/api.js`.

- [ ] **Step 1: Viết test thất bại** `auth.login.integration.test.ts`:
  - `it('login admin trả adminRole')`: tài khoản `SYSADMIN` → `body.account.adminRole === 'SYSADMIN'`, `hotelId === null`, `permissions` chứa `admin:dashboard:read` và (Task 4) `flight:manage` cho `OPS`.
  - `it('login khách sạn trả hotelId và isOwner')`: tài khoản `HOTEL` chủ → `hotelId` đúng, `isOwner === true`; nhân viên → `isOwner` falsy.
  - `it('sai mật khẩu 401 INVALID_CREDENTIALS'); it('tài khoản LOCKED 401')` (hồi quy).
  - `it('/me trả cùng trường')`.
- [ ] **Step 2: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/auth.login.integration.test.ts`. Mong đợi: FAIL (`adminRole` undefined).
- [ ] **Step 3: Implement:** BE bổ sung trường; FE đổi `submitLogin`, `store.jsx` (action `login` nhận session có `token`, gọi `setAuthToken`), `App.jsx` (effect chỉ thu hồi khi `!state.session.token`), `partnerNav.js`; danh sách tài khoản demo trên màn đăng nhập thêm hai chip "API: admin@demo.airrest.vn" và "API: letan@demo.airrest.vn" (mật khẩu `SEED_PASSWORD`, nhãn "cần backend chạy").
- [ ] **Step 4: Chạy pass:** test BE PASS; `npm run build:web` xanh; kiểm tay: (a) đăng nhập `admin@demo.airrest.vn` vào khu quản trị, DevTools Network thấy `POST /v1/auth/login` rồi `GET /v1/auth/me`; (b) tải lại trang mất phiên (đúng D-18); (c) dừng API, đăng nhập hiện thông báo lỗi mạng chứ không treo; (d) đăng nhập mock (`admin`) vẫn chạy như cũ.
- [ ] **Step 5: Commit:** `git commit -m "feat(web): đăng nhập qua API, token trong bộ nhớ, ánh xạ vai trò"`.

**Deliverable test được:** test BE xanh; hai tài khoản seed đăng nhập thật trên FE và vào đúng khu vực.

---

### Task 9: FE chuyến bay dùng API và tab admin "Chuyến bay"

**Files:**
- Create: `apps/web/src/lib/flightsApi.js`, `apps/web/src/components/partner/FlightsTab.jsx`
- Modify: `apps/web/src/screens/Home.jsx`, `apps/web/src/App.jsx` (`refresh`), `apps/web/src/components/SimTools.jsx`, `apps/web/src/screens/Admin.jsx`, `apps/web/src/lib/partnerNav.js`, `apps/web/src/mock/service.js` (xóa `lookupFlight`, `refreshFlight`, `FLIGHT_CODE_RE`, import `FLIGHTS`/`ERROR_CODE`), `apps/web/src/mock/flights.js` (xóa `FLIGHTS`, `ERROR_CODE`; giữ `SAMPLE_CODES`, đổi tên file thành `config/sampleFlights.js` nếu không còn gì khác), `apps/web/src/components/FlightStatusCard.jsx` (nhãn)
- Test: kiểm tay theo bảng bên dưới + `npm run build:web`; logic chuyển đổi đã có test ở Task 7

**Interfaces:**
- Consumes: `api.flights.get`, `flightFromDto`, `api.admin.flights.*` (Task 4, 7); `FLIGHT_CODE_RE` từ `@airrest/shared-types`; `hasPerm` (Task 8); `startOfToday` của `lib/time.js` (xuất thêm `export const dayStart = startOfToday`).
- Produces: `lookupFlight({ code, dateIso }): Promise<SimFlight>` và `refreshFlight(flight): Promise<SimFlight>` trong `lib/flightsApi.js`; lỗi ném ra có `kind`: `'notfound'` (404), `'invalid'` (422), `'ratelimited'` (429), `'service'` (mọi lỗi còn lại, gồm mất mạng, quá hạn, 5xx). Chuyến nhập thủ công (`flight.manual`) và `buildManualFlight` giữ nguyên ở FE (không có API), `refresh` của chuyến thủ công vẫn cục bộ.
- Produces: `FlightsTab({ session })` hiển thị danh sách (lọc mã, ngày, trạng thái), nút "Sửa" mở form: trạng thái, giờ mới (input `datetime-local` đổi sang ISO có offset `+07:00`), nguyên nhân, lý do (bắt buộc); hiện lịch sử thay đổi; chỉ hiện khi `hasPerm(session, 'flight:manage')`. Mã lỗi `FLIGHT_TIME_INVALID`/`FLIGHT_UNCHANGED` hiện bằng `Field` error tiếng Việt.
- Hành vi: `flight.source === 'api'` thì `SimTools` vô hiệu nút "Đổi giờ bay" và hiện ghi chú "Chuyến bay thật của hệ thống mô phỏng: nhờ quản trị đổi giờ ở tab Chuyến bay" (nút "Đẩy giờ" giữ vì chỉ đổi đồng hồ mô phỏng); `FlightStatusCard` vẫn luôn hiện `SimBadge` (nhãn "mô phỏng") và thêm dòng `delayedOverThreshold`: "Chậm hơn ngưỡng gợi ý nghỉ" khi `true`.

- [ ] **Step 1: Viết test thất bại:** thêm vào `apiClient.test.ts` (Task 7) các ca mapping lỗi nếu hàm ánh xạ nằm ở `packages/api-client` (`mapFlightError(e: ApiError): 'notfound' | 'invalid' | 'ratelimited' | 'service'`): `404→notfound`, `422→invalid`, `429→ratelimited`, `500`, `NETWORK_ERROR`, `TIMEOUT → service`. Chạy: `npm test -w @airrest/backend -- tests/apiClient.test.ts` → FAIL (chưa export).
- [ ] **Step 2: Implement:** `mapFlightError` trong `packages/api-client/src/flights.ts`; `flightsApi.js`; sửa `Home.jsx` (`submitCode` dùng `lookupFlight`, nhánh `invalid` hiện lỗi định dạng, nhánh `ratelimited` hiện `Notice` "Bạn thao tác quá nhanh, thử lại sau ít giây", nút chip mẫu giữ nguyên); `App.jsx` `refresh`; `SimTools.jsx`; `FlightsTab.jsx` + gắn vào `Admin.jsx`/`partnerNav.js` bằng `hasPerm`; xóa phần mock chuyến bay.
- [ ] **Step 3: Chạy pass và kiểm tay** (backend + FE cùng chạy, đã `db:seed`):

  | Thao tác | Kết quả mong đợi |
  |---|---|
  | Tra `VN218` hôm nay | thẻ "Chậm 6 giờ 40 phút", giờ mới 06:00 hôm sau, nhãn Mô phỏng, "Cập nhật lúc …" |
  | Tra `vn218` chữ thường | giống trên (ô nhập tự chuyển hoa) |
  | Tra `QH321` | "Đã huỷ chuyến", "Giờ mới: Chuyến đã huỷ" |
  | Tra `QH555` | "Chưa biết giờ bay mới" |
  | Tra `ZZ999` | khối "Không tìm thấy chuyến bay" + nút "Nhập thủ công" |
  | Tra `VN12345` | lỗi định dạng ở ô mã, không gọi API (Network trống) |
  | Dừng API rồi tra | `ErrorBox` "Dịch vụ dữ liệu tạm thời lỗi", bấm thử lại chạy lại |
  | Admin OPS sửa giờ `VN218` rồi khách bấm "Làm mới" | banner "Giờ bay đã đổi" và các mốc nghỉ/nhắc tính lại |
  | Tra 11 lần trong 1 phút | lần 11 hiện thông báo quá nhanh |
  | Đăng nhập tài khoản không có `flight:manage` | không thấy tab Chuyến bay |

  Chạy `npm run build:web` xanh.
- [ ] **Step 4: Commit:** `git commit -m "feat(web): tra cứu/làm mới chuyến bay qua API, tab admin Chuyến bay"`.

**Deliverable test được:** bảng kiểm tay đạt hết, `apiClient.test.ts` xanh, `mock/flights.js` không còn dữ liệu `FLIGHTS`.

---

### Task 10: FE nối dashboard (admin) và thống kê khách sạn

**Files:**
- Modify: `apps/web/src/components/partner/AdminTabs3.jsx` (`ReportsTab` admin), `apps/web/src/components/partner/HotelTabs1.jsx` (`OverviewTab`: các KPI), `apps/web/src/components/partner/HotelTabs3.jsx` (`ReportsTab` khách sạn: KPI và bảng công suất), `apps/web/src/components/partner/ui.jsx` (nếu cần `Kpi` nhận `loading`)
- Test: kiểm tay + `npm run build:web`

**Interfaces:**
- Consumes: `api.admin.dashboard.get`, `api.hotel.stats` (Task 5, 6, 7); `hasPerm` (Task 8); `Loading`, `ErrorBox`, `EmptyBox` của `components/Common.jsx`.
- Quy ước: phiên `source === 'api'` dùng số liệu thật; phiên mock giữ số liệu mock kèm `Notice` "Dữ liệu mô phỏng". Hook `useAsync(fn, deps)` đặt trong `lib/api.js` trả `{ data, error, loading, reload }`. Chuyển đổi tên tiếng Việt cho 9 trạng thái booking lấy từ `BOOKING_STATUS` của `mock/partner.js` hoặc bảng tĩnh mới trong `config/`.
- Phạm vi: **KHÔNG** nối `MonitorTab` (hàng đợi/tra cứu correlation ID, bảng `pickups`/`incidents`) và `QualityTab` (sự cố chất lượng) vì không có API trong spec; hai tab giữ mock và hiện `Notice` "Dữ liệu mô phỏng, chưa có API" (ghi trong kiểm kê ở Task 11).

- [ ] **Step 1: Implement:** `ReportsTab` admin: thẻ KPI từ `dashboard` (đơn theo trạng thái, `pendingApproval`, doanh thu thực hiện/dự kiến, khách sạn chờ duyệt, ticket mở, đơn xe đang chạy, yêu cầu đổi/hủy chờ), bộ chọn khoảng ngày (mặc định 30 ngày; nếu `from >= to` chặn ở client với thông báo, nếu server trả `INVALID_RANGE`/`RANGE_TOO_LARGE` hiện lỗi tiếng Việt); xuất CSV giữ nguyên logic mock nhưng chỉ chạy trên dữ liệu đang hiển thị. Hotel `OverviewTab`/`ReportsTab`: KPI từ `api.hotel.stats()`.
- [ ] **Step 2: Chạy pass và kiểm tay** (đã seed, có vài đơn từ Plan 1):

  | Thao tác | Kết quả mong đợi |
  |---|---|
  | Admin mở Báo cáo, DB không có đơn | mọi KPI hiện `0` và biểu đồ/bảng xu hướng rỗng có thông báo "Chưa có đơn trong khoảng này", không `NaN`/`undefined` |
  | Tạo 1 đơn rồi bấm tải lại | `Chờ xác nhận` tăng 1 |
  | Đặt khoảng đảo ngược (từ > đến) | báo lỗi tại ô ngày, không gọi API |
  | Chọn khoảng 100 ngày | thông báo "Tối đa 92 ngày" (từ `RANGE_TOO_LARGE`) |
  | Dừng API | `ErrorBox` có nút thử lại |
  | Đăng nhập lễ tân khách sạn A | chỉ thấy số của A; không thấy tab/dữ liệu admin |
  | Tài khoản thiếu `admin:dashboard:read` | không thấy KPI toàn hệ thống (ẩn tab hoặc `Denied`) |

  `npm run build:web` xanh.
- [ ] **Step 3: Commit:** `git commit -m "feat(web): nối dashboard admin và thống kê khách sạn"`.

**Deliverable test được:** bảng kiểm tay đạt; số trên FE khớp `curl` tới `/v1/admin/dashboard` cùng khoảng ngày.

---

### Task 11: Kiểm kê màn FE còn dùng mock và dọn dẹp

**Files:**
- Create: `docs/FE_API_WIRING.md` (bảng kiểm kê, nguồn chân lý cho nhóm)
- Modify: `apps/web/src/mock/*` và nơi dùng chúng (chỉ xóa phần đã được thay bằng API ở Plan 1-3), `apps/web/src/components/SimTools.jsx` (`setFailNext` chỉ còn cho phần còn mock), `README.md` gốc (dòng `apps/web`)
- Test: script kiểm `npm run build:web` và lệnh `rg` ở dưới

**Interfaces:**
- Consumes: kết quả của Plan 1-3 đã merge.
- Produces: `docs/FE_API_WIRING.md` có bảng `| Màn/Tab | File | Nguồn dữ liệu (API/Mock) | Route | Nhãn "Mô phỏng"? | Ghi chú |` đủ mọi màn trong `screens/` và mọi tab trong `components/partner/` (`AdminTabs1-3`, `HotelTabs1-3`, kèm `OverviewTab`, `ReportsTab` ×2, `QualityTab`, `MonitorTab`, `FlightsTab`).

- [ ] **Step 1: Thu thập hiện trạng bằng lệnh** (dán kết quả vào đầu `FE_API_WIRING.md`):
  `rg -n "from '(\.\./)+mock/|from '\./mock/|mock/" apps/web/src --glob '!apps/web/src/mock/**'` (mọi chỗ còn import mock);
  `rg -n "usePartner\(" apps/web/src` (mọi chỗ còn dùng kho mock đối tác);
  `rg -n "setTimeout|SIM\.latencyMs" apps/web/src --glob '!apps/web/src/mock/**'` (độ trễ giả);
  `rg -n "fetch\(" apps/web/src` (phải rỗng: chỉ `lib/api.js` qua `api-client`).
- [ ] **Step 2: Phân loại** từng dòng vào 3 nhóm: (a) đã nối API (flight, dashboard, login, và các màn của Plan 1-2); (b) còn mock có chủ đích do spec loại ngoài phạm vi (thanh toán, gợi ý nơi nghỉ/`searchProperties` nếu Plan 1 chưa nối `GET /v1/hotels`, `MonitorTab`, `QualityTab`, `PickupsTab`/xe nếu Plan 2 chưa nối, tài khoản người dùng cuối, `auditor`/`driver`, đồng hồ mô phỏng `SIM`); (c) còn mock nhưng lẽ ra đã phải nối: mở việc sửa vào chính plan sở hữu hoặc làm ngay nếu chỉ là đổi import. Mỗi dòng nhóm (b) phải có chữ "Mô phỏng" hiển thị trên giao diện (kiểm bằng `rg -n "SimBadge|Mô phỏng" <file>`).
- [ ] **Step 3: Dọn dẹp:** xóa code mock đã chết (hàm không còn nơi import: kiểm bằng `rg -n "<tên hàm>" apps/web/src` trước khi xóa); xóa `ERROR_CODE`/`FLIGHT_CODE_RE` nếu còn; `SimTools` giữ công cụ "Giả lập lỗi" chỉ khi còn màn mock dùng `maybeFail`. Không xóa `mock/partner.js` nếu `MonitorTab`/`QualityTab`/`Pickups` còn cần.
- [ ] **Step 4: Chạy pass:** `npm run build:web` xanh; lệnh `rg` Step 1 chạy lại: không còn import tới tên hàm đã xóa; `rg -n "fetch\(" apps/web/src` rỗng; kiểm tay đi qua một vòng: tra chuyến → xem nơi nghỉ → đặt → tra booking → đăng nhập lễ tân → xác nhận → admin xem dashboard, không lỗi console.
- [ ] **Step 5: Commit:** `git commit -m "docs(web): kiểm kê màn FE theo nguồn dữ liệu; dọn mock đã thay bằng API"`.

**Deliverable test được:** `docs/FE_API_WIRING.md` đủ mọi màn/tab, không còn "chưa phân loại"; build xanh.

---

### Task 12: Test E2E API đặt → xác nhận → hủy và đóng tài liệu

**Files:**
- Create: `backend/tests/e2e.booking-flow.test.ts`
- Modify: `docs/Airrest_Admin_API.postman_collection.json` (folder "9. E2E đặt → xác nhận → hủy", biến `bookingCode`, `guestPhone`, `idemKey`), `backend/README.md` (mục Quy trình E2E + cập nhật dòng "Chưa có: dữ liệu chuyến bay…" ở đầu), `README.md` gốc (`apps/web` không còn "chạy trên dữ liệu mô phỏng src/mock" mà ghi đúng hiện trạng từ Task 11)

**Interfaces:**
- Consumes: `POST /v1/bookings` (+ `Idempotency-Key`), `POST /v1/bookings/lookup`, route xác nhận booking của khách sạn và route yêu cầu hủy/duyệt hủy của khách/khách sạn/admin do Plan 1-2 định nghĩa (dự kiến `PATCH /v1/hotel/bookings/:id/confirm`, route khách gửi yêu cầu hủy bằng mã + SĐT, route duyệt yêu cầu; theo `BACKEND_TASKS.md` 3.1-3.2 và spec D3). Đầu file khai báo `const ROUTES = { confirm: (id) => ..., requestCancel: ..., approveCancel: (id) => ... }`; **Step 1 bắt buộc đối chiếu `api/openapi.ts` sau Plan 1-2 và sửa đúng một chỗ này**; `bookingEvents` (`services/events.ts`); `mkHotel({ manual: true })`, `mkRoomType`, `mkAccount`, `systemRoleId`, `freshDb({ roles: true })`; `GET /v1/flights/:code`, `GET /v1/admin/dashboard`.
- Produces: một file test tuần tự (một `describe` có `it` nối tiếp chia sẻ biến), `VNPAY_ENABLED=false` bằng `paymentMethod: 'AT_HOTEL'`.

- [ ] **Step 1: Đối chiếu route:** `rg -n "confirm|cancel|reject" backend/api/openapi.ts backend/api/modules` rồi điền `ROUTES`; nếu thiếu route nào, dừng và báo (không tự thêm route của Plan 1-2).
- [ ] **Step 2: Viết test thất bại** `e2e.booking-flow.test.ts` (chỉ ≤ 8 lần `lookup` vì `strictRateLimit` = 10/phút; ghi lại sự kiện bằng `bookingEvents.on('change', e => events.push(e.status))`):
  - Chuẩn bị: khách sạn `manual: true` có 1 loại phòng `totalRooms = 1`; tài khoản khách sạn (`hotel_owner`) và admin `SYSADMIN`; `seedFlights(db, NOW)`.
  - `it('đặt phòng -> PENDING')`: `POST /v1/bookings` với `Idempotency-Key: k1` → 201, `booking.status === 'PENDING'`, `paymentLink` không có (trả tại khách sạn); `count('room_reservations', "state='HOLD'") === 1`.
  - `it('gửi lại cùng key trả đơn cũ')`: lặp lại request → cùng `booking.code`, `count('bookings') === 1`.
  - `it('hết phòng khi đặt thêm')`: đặt tiếp cùng ngày → 409; phòng giữ chỗ nên không đặt được.
  - `it('khách tra cứu thấy PENDING')`: `lookup` → `booking.status === 'PENDING'`, trả `guestToken`.
  - `it('lễ tân xác nhận -> CONFIRMED')`: `ROUTES.confirm` → 200; `lookup` thấy `CONFIRMED`; `count('audit_logs', "action LIKE 'BOOKING.%'")` tăng.
  - `it('khách gửi yêu cầu hủy, duyệt -> CANCELLED')`: yêu cầu hủy bằng mã + SĐT → 201 trạng thái `PENDING`; khách sạn hoặc admin duyệt → booking `CANCELLED`; `room_reservations` của đơn `RELEASED`; không có `refunds` (chưa thu tiền).
  - `it('phòng được nhả: đặt lại thành công')`: đặt mới cùng ngày → 201.
  - `it('SĐT sai không tra cứu được')`: 404 chung, không lộ đơn tồn tại.
  - `it('sự kiện realtime đúng thứ tự')`: `events` chứa `['PENDING','CONFIRMED','CANCELLED']` theo thứ tự cho đơn đầu.
  - `it('dashboard phản ánh')`: admin `GET /v1/admin/dashboard` → `bookings.byStatus.CANCELLED.count === 1`, `byStatus.CONFIRMED.count === 0`, `byStatus.PENDING.count === 1` (đơn đặt lại).
  - `it('tra chuyến bay song song luồng đặt')`: `GET /v1/flights/VN218` trả 200 `simulated: true` (nối với seed).
  - `it('mọi bước có nhật ký')`: `GET /v1/admin/audit-logs?bookingId=<id>` có tối thiểu các hành động tạo, xác nhận, hủy.
- [ ] **Step 3: Chạy xem fail:** `npm run test:db -w @airrest/backend -- tests/e2e.booking-flow.test.ts`. Mong đợi: FAIL ở bước đầu tiên chưa khớp (ví dụ route chưa có, hoặc `ROUTES` chưa điền); nếu FAIL ở Plan 1-2 thì ghi vào mục "Phát hiện" và báo người dùng, không vá hộ.
- [ ] **Step 4: Implement phần còn lại:** chỉ sửa test/`ROUTES`/helper và tài liệu (Postman folder 9 chạy tuần tự bằng biến collection; README); không sửa code nghiệp vụ của plan khác.
- [ ] **Step 5: Chạy pass toàn bộ:** `npm run typecheck && npm test -w @airrest/backend && npm run test:db -w @airrest/backend` đều xanh; `npm run build:web` xanh.
- [ ] **Step 6: Commit:** `git commit -m "test(e2e): kịch bản đặt, xác nhận, hủy; cập nhật README/Postman"`.

**Deliverable test được:** `e2e.booking-flow.test.ts` xanh, toàn bộ suite xanh, `typecheck` sạch, Postman folder 9 chạy được từ đầu đến cuối với `VNPAY_ENABLED=false`.

---

## Phát hiện/mâu thuẫn

Cần người dùng quyết (xếp theo mức ảnh hưởng):

1. **Thứ tự Task 7-8 trái spec mục 7.** Spec để FE nối API ở cuối, nhưng Plan 1-2 FE (lễ tân xác nhận, đổi/hủy...) cần ngay lớp `api-client` và token đăng nhập. Đề xuất chạy Task 7 và Task 8 trước mọi task FE của Plan 1-2 (hai task này không phụ thuộc Plan 1-2). Đồng ý không?
2. **Dashboard phụ thuộc tên bảng/trạng thái của Plan 1-2** (`support_tickets.status`, `shuttle_requests.status`, `change_requests.status`). Spec chỉ cho tên bảng; tên cột/giá trị trạng thái do Plan 1-2 quyết. Task 5 có test kiểm bảng tồn tại và phải chỉnh truy vấn theo schema thực tế sau khi Plan 1-2 merge.
3. **Hai endpoint dashboard theo D8 chưa đủ cho FE khách sạn.** Admin có `admin:hotel:read`, lễ tân thì không. Plan này thêm `GET /v1/hotel/stats` (quyền `booking:read`, khóa theo token) ngoài "hai endpoint" của D8 và không thêm mã quyền mới (D9 không có mã dashboard khách sạn). Cần xác nhận.
4. **`GET /v1/flights/:code` thiếu tham số ngày trong spec D6**, trong khi SRS FR-FLT-01 yêu cầu mã + ngày bay và dữ liệu mẫu có cùng mã nhiều ngày. Plan thêm `?date=YYYY-MM-DD` (mặc định hôm nay giờ VN) và `flight_date` là cột sinh theo giờ khởi hành dự kiến. Mã chữ thường được chuẩn hóa thành chữ hoa (không báo lỗi); sai định dạng sau khi chuẩn hóa thì 422.
5. **`strictRateLimit` (10 request/phút) áp cho GET công khai** theo spec mục 5 nhưng hơi chặt với UX (chip chuyến mẫu, nút Làm mới). Plan giữ đúng spec và FE có thông báo 429; nếu muốn nới, thêm limiter riêng cho `/v1/flights` là đổi một dòng.
6. **Dữ liệu mock FE lệch nội bộ:** `QH120` (`dayOffset: 1`) và `VN702` (`dayOffset: -1`) có `schedDep` nằm ngày 0. Seed cộng `dayOffset * 1440` vào giờ dự kiến/giờ mới để `flight_date` đúng ý định; `updatedAt` giữ tuyệt đối. Kịch bản mock "giờ hiện tại 23:08" (`now`) không còn, FE dùng giờ máy chủ (`asOf`), nên số liệu nghỉ/nhắc giờ của chuyến mẫu khác mock (kỳ vọng được).
7. **Ngưỡng trễ:** SRS BR-FLT-01 là "chậm > 5 giờ" (`>`), mock FE tô đỏ khi `>= 240` phút. Plan dùng `>` với `flight.thresholds.delayHours` (cấu hình, mặc định 5), FE giữ màu cũ và chỉ thêm dòng gợi ý theo `delayedOverThreshold`.
8. **Thiếu so với FR-FLT-03:** giờ thực tế/giờ hạ cánh. Mock và D6 chỉ có giờ khởi hành, nên bảng không có cột hạ cánh/thực tế; bổ sung nếu PO cần (cột nullable, không phá schema).
9. **Cột `sim_scenario`** (approve/reject/hotelfull/noreply) giữ trong bảng chỉ để luồng L2 cũ của FE (`lib/request.js`) còn chạy tới khi Plan 2 thay bằng API; sau đó có thể bỏ cột.
10. **Vai trò FE và BE lệch nhau:** FE có `auditor`, `driver`, người dùng cuối đăng nhập mà BE không có tương ứng; BE có `HOTEL`/`isOwner` thay `manager`/`staff`. Plan ánh xạ vai trò từ `adminRole`/`isOwner` cho phần FE còn dùng ma trận vai trò mock, và dùng quyền (`hasPerm`) cho các tab đã có API; đăng nhập chỉ nối cho tên đăng nhập là email, các tài khoản demo cũ vẫn là mock. Token chỉ giữ trong bộ nhớ (theo D-18 hiện có), tải lại trang là mất phiên; nếu muốn giữ phiên cần đổi D-18 sang `sessionStorage`.
11. **`MonitorTab`, `QualityTab` không có API trong spec** (correlation ID, sự cố chất lượng, `pickups`). Task 10-11 giữ mock và ghi nhãn "Mô phỏng"; nếu muốn nối cần luồng mới.
12. **FE realtime (Socket.io client) không thuộc Plan 3.** Spec yêu cầu lễ tân thấy đơn realtime ở FE; Plan này chỉ kiểm sự kiện `bookingEvents` ở E2E. Việc `socket.io-client` ở FE nên nằm trong Plan 1.
13. **Cấu hình cổng/CORS:** `docker-compose.yml` chạy web ở 5174 nhưng `CORS_ORIGINS` mặc định `http://localhost:5173`. Dev dùng proxy Vite nên không bị chặn; môi trường deploy tách origin cần đặt `CORS_ORIGINS` và `VITE_API_BASE_URL` (Task 7 thêm vào `render.yaml`).
14. **Không có test runner cho FE.** Các task FE (8-11) dựa vào test của `api-client` (chạy trong vitest của backend), `npm run build:web` và bảng kiểm tay; nếu muốn tự động hóa (Playwright) cần thêm dependency, ngoài phạm vi plan.
15. **Seed bám ngày chạy**: chạy `db:seed` ở ngày khác tạo thêm bộ 20 chuyến cho ngày đó, bộ cũ giữ nguyên (không dọn vì có thể có `flight_changes`).
