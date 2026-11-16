// Tài liệu OpenAPI viết tay, phục vụ Swagger UI tại /docs. Thêm/sửa route thì cập nhật file này.
// shortcut: không sinh từ zod nên có thể lệch code, nâng cấp lên zod-to-openapi khi số route tăng nhiều.

type Json = Record<string, unknown>;

const str = { type: 'string' };
const uuid = { type: 'string', format: 'uuid' };
const int = { type: 'integer' };
const obj = (properties: Json, required: string[] = []) => ({ type: 'object', properties, required });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const body = (schema: Json, example?: unknown) => ({ required: true, content: { 'application/json': { schema, ...(example ? { example } : {}) } } });
const param = (name: string, where: 'path' | 'query' | 'header', schema: Json = str, required = where === 'path') => ({ name, in: where, required, schema });
const idParam = param('id', 'path', uuid);
const limit = param('limit', 'query', int);
const cursor = param('cursor', 'query', int);

const ok = (description = 'Thành công', schema?: Json) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});
const err = (description: string) => ({ description, content: { 'application/json': { schema: ref('Error') } } });
const std = { 400: err('Dữ liệu không hợp lệ'), 429: err('Quá nhiều yêu cầu') };
const authed = { 401: err('Chưa đăng nhập'), 403: err('Thiếu quyền') };

type Op = { tag: string; summary: string; perm?: string; public?: boolean; params?: Json[]; body?: Json; res?: Json; extra?: Json };
const op = (o: Op) => ({
  tags: [o.tag],
  summary: o.summary,
  ...(o.perm ? { description: `Quyền cần có: \`${o.perm}\`` } : {}),
  ...(o.public ? { security: [] } : {}),
  ...(o.params ? { parameters: o.params } : {}),
  ...(o.body ? { requestBody: o.body } : {}),
  responses: { 200: o.res ?? ok(), ...std, ...(o.public ? {} : authed), ...(o.extra ?? {}) },
});

const hotelId = { name: 'id', in: 'path', required: true, schema: uuid, description: 'ID khách sạn' };
const reason = body(obj({ reason: str }, ['reason']), { reason: 'Lý do' });

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Airrest API',
    version: '1.0.0',
    description:
      'API đặt phòng khách sạn gần sân bay.\n\nĐăng nhập bằng `POST /v1/auth/login`, copy `token`, bấm **Authorize** và dán token (không cần chữ `Bearer`).\n\nQuyền được kiểm tra theo permission của tài khoản, không theo tên vai trò.',
  },
  servers: [{ url: '/', description: 'Máy chủ hiện tại' }],
  security: [{ bearer: [] }],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Hotels (công khai)' },
    { name: 'Bookings (khách)' },
    { name: 'Bookings (lễ tân)' },
    { name: 'Payments (VNPay)', description: 'VNPay + MoMo' },
    { name: 'Hotel · Nhân viên' },
    { name: 'Admin · Tài khoản' },
    { name: 'Admin · Cấu hình' },
    { name: 'Admin · Khách sạn' },
    { name: 'Admin · Thanh toán' },
    { name: 'Admin · Nhật ký' },
    { name: 'Admin · Media' },
    { name: 'Rooms (khách sạn)' },
    { name: 'Requests (khách)' },
    { name: 'Requests (nhân sự)' },
    { name: 'Support (khách)' },
    { name: 'Admin · Support' },
    { name: 'Shuttle (khách)' },
    { name: 'Shuttle (nhân sự)' },
    { name: 'Fleet (đội xe)' },
    { name: 'Driver (tài xế)' },
    { name: 'Flights' },
    { name: 'Admin · Booking' },
    { name: 'Admin · Chuyến bay' },
    { name: 'Admin · Dashboard' },
    { name: 'Hotel · Thống kê' },
    { name: 'Doanh nghiệp' },
    { name: 'Admin · Doanh nghiệp' },
    { name: 'Payer · Cổng kết nối', description: 'Đơn vị chi trả: đẩy chuyến delay + hành khách (khóa API), nút mô phỏng, xem chuyến/hành khách của trạm mình' },
  ],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: obj({ error: obj({ code: str, message: str, requestId: str }) }),
      Guest: obj({ fullName: str, phone: { type: 'string', example: '0912345678' }, email: { type: 'string', format: 'email' } }, ['fullName', 'phone']),
      CreateBooking: obj(
        {
          hotelId: uuid,
          rooms: { type: 'array', minItems: 1, maxItems: 10, description: 'Một hoặc nhiều loại phòng CÙNG khách sạn, chung ngày và chung số khách. roomTypeId không trùng, đều active (404 ROOM_TYPE_NOT_FOUND). Thiếu chỗ ở bất kỳ dòng nào -> 409 SOLD_OUT cho cả đơn (details.soldOut[] nêu dòng thiếu). guests <= tổng (capacity × qty) các dòng', items: obj({ roomTypeId: uuid, qty: { type: 'integer', minimum: 1, maximum: 5, default: 1 } }, ['roomTypeId']) },
          roomTypeId: { ...uuid, description: 'LEGACY: dùng cùng `qty` thay cho `rooms` (quy về một dòng); gửi lẫn với `rooms` -> 422' },
          qty: { type: 'integer', minimum: 1, maximum: 5, description: 'LEGACY, đi với roomTypeId; mặc định 1' },
          paymentMethod: { type: 'string', enum: ['AT_HOTEL', 'VNPAY', 'MOMO'], default: 'AT_HOTEL' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          guest: ref('Guest'),
          guests: { type: 'integer', minimum: 1, maximum: 30, default: 1, description: 'TỔNG số người ở (đã gồm trẻ em); <= sức chứa loại phòng × qty, sai -> 422 GUESTS_EXCEED_CAPACITY (details.maxGuests). Cũng là số khách đi xe' },
          children: { type: 'integer', minimum: 0, maximum: 30, default: 0, description: 'Số trẻ em NẰM TRONG guests; > guests -> 422' },
          shuttle: obj({
            legs: { type: 'array', minItems: 1, maxItems: 2, description: 'Mỗi chiều tối đa một lần; chỉ gửi chiều/giờ/điểm đón, KHÔNG gửi giá hay passengers (strict -> 422)', items: obj({
              direction: { type: 'string', enum: ['TO_HOTEL', 'TO_AIRPORT'] }, pickupAt: { type: 'string', format: 'date-time', description: 'ISO 8601 CÓ offset; trong lưu trú ±24 giờ (422 PICKUP_OUT_OF_STAY_WINDOW)' },
              airport: { type: 'string', description: 'IATA; mặc định sân bay đầu tiên của khách sạn (422 AIRPORT_NOT_SERVED)' }, location: { type: 'string', maxLength: 200 }, note: { type: 'string', maxLength: 300 },
            }, ['direction', 'pickupAt']) },
          }, ['legs']),
        },
        ['hotelId', 'from', 'to', 'guest'], // cần `rooms` hoặc `roomTypeId`
      ),
      Lookup: obj({ code: { type: 'string', example: 'AR-ABCD1234' }, phone: { type: 'string', example: '0912345678' } }, ['code', 'phone']),
      Payout: obj({ type: { type: 'string', enum: ['BANK', 'MOMO'] }, accountNo: str, accountName: str, bankCode: str }, ['type', 'accountNo', 'accountName']),
    },
  },
  paths: {
    '/health': { get: op({ tag: 'Health', summary: 'Kiểm tra sống', public: true }) },
    '/ready': { get: op({ tag: 'Health', summary: 'Kiểm tra sẵn sàng (có DB)', public: true }) },

    '/v1/auth/login': {
      post: op({
        tag: 'Auth',
        summary: 'Đăng nhập, trả JWT và danh sách quyền',
        public: true,
        body: body(obj({ email: str, password: str }, ['email', 'password']), { email: 'admin@demo.airrest.vn', password: 'ChangeMe123!' }),
        extra: { 401: err('Sai email hoặc mật khẩu') },
      }),
    },
    '/v1/auth/me': { get: op({ tag: 'Auth', summary: 'Thông tin tài khoản hiện tại (auth: claims + quyền; user: id, type, fullName, username/email)' }) },

    '/v1/auth/passenger/register': {
      post: op({
        tag: 'Khách (tài khoản)',
        summary: 'Đăng ký tài khoản khách bằng tên đăng nhập, trả token (đăng nhập luôn)',
        public: true,
        body: body(obj({ username: { type: 'string', maxLength: 50, description: 'Không chứa "@" hoặc dãy >= 6 chữ số (BR-002); không phân biệt hoa/thường' }, password: { type: 'string', minLength: 8 }, fullName: { type: 'string', maxLength: 100 } }, ['username', 'password']), { username: 'lananh', password: 'MatKhau123' }),
        extra: { 201: ok('Đã tạo: {token, user:{id,type:"PASSENGER",username,fullName,permissions:[]}}'), 409: err('USERNAME_TAKEN'), 422: err('Tên đăng nhập / mật khẩu không hợp lệ') },
      }),
    },
    '/v1/auth/passenger/login': {
      post: op({
        tag: 'Khách (tài khoản)',
        summary: 'Đăng nhập khách bằng tên đăng nhập, trả {token, user}',
        public: true,
        body: body(obj({ username: str, password: str }, ['username', 'password']), { username: 'lananh', password: 'MatKhau123' }),
        extra: { 401: err('INVALID_CREDENTIALS (sai tên/mật khẩu hoặc tài khoản khóa; không phân biệt)') },
      }),
    },
    '/v1/me/password': {
      patch: op({
        tag: 'Khách (tài khoản)',
        summary: 'Đổi mật khẩu (chỉ tài khoản khách)',
        body: body(obj({ currentPassword: str, newPassword: { type: 'string', minLength: 8 } }, ['currentPassword', 'newPassword'])),
        res: { description: 'Xong (204)' },
        extra: { 400: err('WRONG_CURRENT_PASSWORD'), 422: err('Mật khẩu mới ngắn hoặc trùng mật khẩu cũ (SAME_PASSWORD)') },
      }),
    },
    '/v1/me/bookings': {
      get: op({ tag: 'Khách (tài khoản)', summary: 'Đơn của tài khoản khách (mới nhất trước; cursor = nextCursor trang trước)', params: [param('status', 'query'), limit, cursor] }),
    },
    '/v1/me/profile': {
      patch: op({
        tag: 'Khách (tài khoản)',
        summary: 'Sửa họ tên và/hoặc cấu hình cá nhân (preferences thay nguyên khối; không nhận SĐT/email)',
        body: body(obj({ fullName: str, preferences: obj({ airport: str, adults: { type: 'integer' }, children: { type: 'integer' }, rooms: { type: 'integer' }, paymentMethod: { type: 'string', enum: ['AT_HOTEL', 'VNPAY', 'MOMO'] } }) })),
      }),
    },
    '/v1/me/tickets': {
      get: op({ tag: 'Khách (tài khoản)', summary: 'Ticket hỗ trợ gắn với tài khoản (gửi lúc đang đăng nhập); mới nhất trước', params: [limit, cursor] }),
    },

    '/v1/airports': { get: op({ tag: 'Airports (công khai)', summary: 'Danh mục sân bay thương mại Việt Nam', public: true }) },

    '/v1/hotels': {
      get: op({
        tag: 'Hotels (công khai)',
        summary: 'Tìm khách sạn theo sân bay',
        public: true,
        params: [{ ...param('airport', 'query'), description: 'Mã IATA 3 ký tự, ví dụ HAN. Bỏ trống = toàn hệ thống (luôn ở chế độ tìm kiếm, mặc định sort=rating)' }, limit, cursor, { ...param('from', 'query'), description: 'Đầu cửa sổ tính số phòng còn (ISO), mặc định bây giờ' }, { ...param('to', 'query'), description: 'Cuối cửa sổ (ISO), mặc định from + 24 giờ, tối đa 31 ngày' },
          ...([['sort', 'distance | price | rating (mặc định distance khi có tham số tìm kiếm)'], ['guests', 'Tổng số người (gồm trẻ em), 1-30'], ['rooms', 'Số phòng, 1-5 (mặc định 1)'], ['maxKm', 'Khoảng cách tối đa tới sân bay (km)'], ['priceUnder', 'Giá/đêm của loại phòng đủ chỗ rẻ nhất phải nhỏ hơn giá trị này (VND)'], ['minPrice', 'Giá/đêm tối thiểu (VND, gồm biên)'], ['maxPrice', 'Giá/đêm tối đa (VND, gồm biên)'], ['minRating', 'Điểm đánh giá tối thiểu'], ['minReviews', 'Số lượt đánh giá tối thiểu'], ['shuttle', 'true: chỉ nơi có xe đưa đón'], ['freeCancel', 'true: chỉ nơi hủy miễn phí'], ['hourly', 'true: chỉ nơi cho thuê theo giờ'], ['family', 'true: chỉ nơi có phòng gia đình'], ['reception24', 'true: chỉ nơi có lễ tân 24/24']] as const).map(([n, d]) => ({ ...param(n, 'query'), description: d }))],
      }),
    },
    '/v1/hotels/{id}': { get: op({ tag: 'Hotels (công khai)', summary: 'Chi tiết khách sạn (kèm loại phòng, giá, số phòng còn, cờ tính năng)', public: true, params: [idParam, { ...param('from', 'query'), description: 'Đầu cửa sổ tính số phòng còn (ISO)' }, { ...param('to', 'query'), description: 'Cuối cửa sổ (ISO)' }], extra: { 404: err('Không tìm thấy') } }) },

    '/v1/hotels/{id}/reviews': {
      get: op({ tag: 'Hotels (công khai)', summary: 'Đánh giá của khách: { summary{avg,count,distribution[điểm 1..10]}, items[{id,reviewerName,score,comment,createdAt}], nextCursor }', public: true, params: [idParam, limit, cursor] }),
      post: op({ tag: 'Hotels (công khai)', summary: 'Gửi đánh giá bằng mã đơn + SĐT của đơn đã trả phòng (CHECKED_OUT) tại khách sạn này; mỗi đơn 1 lần; cập nhật hotels.rating', public: true, params: [idParam], body: body(obj({ code: str, phone: str, score: { type: 'integer', minimum: 1, maximum: 10 }, comment: str }, ['code', 'phone', 'score'])), extra: { 201: ok('Đã ghi đánh giá'), 404: err('BOOKING_NOT_FOUND'), 409: err('REVIEW_EXISTS'), 422: err('BOOKING_NOT_COMPLETED | VALIDATION_ERROR') } }),
    },
    '/v1/hotels/{id}/shuttle-quote': {
      post: op({
        tag: 'Hotels (công khai)', summary: 'Báo giá xe TRƯỚC khi có đơn: { offered, free, legs[{direction, airport, distanceKm, priceVnd, night}], totalVnd }. Không có xe -> 200 { offered:false }. Giá tính bằng đúng hàm của tạo đơn; pickupAt (tùy chọn) quyết định phụ thu đêm, thiếu = giá ban ngày',
        public: true, params: [idParam],
        body: body(obj({ legs: { type: 'array', minItems: 1, maxItems: 2, items: obj({ direction: { type: 'string', enum: ['TO_HOTEL', 'TO_AIRPORT'] }, airport: str, pickupAt: { type: 'string', format: 'date-time' } }, ['direction']) }, passengers: int, guests: int }, ['legs'])),
        extra: { 404: err('HOTEL_NOT_FOUND'), 422: err('AIRPORT_NOT_SERVED | SHUTTLE_OUT_OF_RANGE | VALIDATION_ERROR') },
      }),
    },
    '/v1/bookings': {
      post: op({
        tag: 'Bookings (khách)',
        summary: 'Đặt phòng không cần tài khoản (kèm Bearer token khách hợp lệ thì đơn gắn vào tài khoản đó)',
        public: true,
        params: [{ ...param('Idempotency-Key', 'header'), required: true, description: 'Chuỗi duy nhất mỗi lần đặt, gửi lại cùng key sẽ trả kết quả cũ' }],
        body: body(ref('CreateBooking')),
        extra: { 201: ok('Đã tạo booking (VNPAY/MOMO kèm paymentLink). booking: guests, children, shuttle{tripType,legCount}, pricing{roomVnd,shuttleVnd,serviceFeeVnd,totalVnd}; shuttles[] khi có xe cùng đơn'), 422: err('SHUTTLE_NOT_OFFERED | GUESTS_EXCEED_CAPACITY | PICKUP_OUT_OF_STAY_WINDOW | AIRPORT_NOT_SERVED | SHUTTLE_OUT_OF_RANGE | VALIDATION_ERROR'), 409: err('Hết phòng, trùng yêu cầu, hoặc cổng tắt (VNPAY_DISABLED/MOMO_DISABLED)') },
      }),
    },
    '/v1/hotels/{id}/hourly-slots': {
      get: op({ tag: 'Hotels (công khai)', summary: 'Giờ vào còn trống của loại phòng bật đặt theo giờ trong một ngày (query roomTypeId, date YYYY-MM-DD giờ VN, hours, qty): { slots[{startsAt,endsAt,time,now?,available,reason?: PAST|CLOSED|FULL}], priceVnd, hourly }. 422 HOURLY_NOT_ENABLED / HOURS_OUT_OF_RANGE', public: true }),
    },
    '/v1/bookings/quote': {
      post: op({ tag: 'Bookings (khách)', summary: 'Dòng phòng theo đêm có thể kèm `ratePlan`: STANDARD (mặc định) | NON_REFUNDABLE (rẻ hơn `nonRefundablePct`% của loại phòng, hủy không được hoàn tiền; 422 RATE_PLAN_NOT_OFFERED nếu loại phòng không bán mức này; một đơn một mức). Báo giá trước khi đặt (dòng phòng có thể kind HOURLY + startsAt + hours; đơn toàn giờ không cần from/to; body `rooms[{roomTypeId,qty,kind?,startsAt?,hours?}]` hoặc legacy roomTypeId+qty): { nights, unitPriceVnd (dòng đầu), qty (tổng), rooms[{roomTypeId,roomTypeName,qty,unitPriceVnd,subtotalVnd}], roomVnd, shuttleVnd, serviceFeeVnd, totalVnd, legs[] } (cùng cách tính với tạo đơn, không giữ phòng)', public: true, body: body(obj({ hotelId: str, rooms: { type: 'array', items: obj({ roomTypeId: str, qty: int }, ['roomTypeId']) }, roomTypeId: str, qty: int, from: str, to: str }, ['hotelId', 'from', 'to'])) }),
    },
    '/v1/bookings/group-lookup': {
      post: op({ tag: 'Bookings (khách)', summary: 'Tra cứu cả nhóm delay bằng mã nhóm NH-XXXXXXXX + SĐT một người trong nhóm. { groupCode, status, rooms[{status: WAITING_HOTEL|CONFIRMED|TRANSFERRING|NEEDS_STAFF|CANCELLED, guest (họ tên rút gọn), members, message?; chỉ CONFIRMED mới có hotelName, roomNumbers, checkInAt, checkoutAt, bookingCode (tra tiếp /v1/bookings/lookup)}] }. Sai mã/SĐT -> 404 GROUP_NOT_FOUND chung. groupLookupRateLimit (bộ đếm riêng 10/phút/IP)', public: true, body: body(obj({ groupCode: { type: 'string', example: 'NH-ABCD1234' }, phone: { type: 'string', example: '0912345678' } }, ['groupCode', 'phone'])), extra: { 404: err('GROUP_NOT_FOUND') } }),
    },
    '/v1/bookings/lookup': {
      post: op({ tag: 'Bookings (khách)', summary: 'Tra cứu booking bằng mã + SĐT. booking.hotel = { name, address (chuỗi địa chỉ công khai hoặc null), location?{lat,lng} } để khách tự đặt xe; cùng trường `hotel` ở shuttle lookup, GET /v1/track/shuttle và phản hồi tạo đơn', public: true, body: body(ref('Lookup')), extra: { 404: err('Không tìm thấy') } }),
    },

    '/v1/hotel/bookings': {
      get: op({ tag: 'Bookings (lễ tân)', summary: 'Danh sách booking của khách sạn', perm: 'booking:read', params: [param('status', 'query'), limit, cursor] }),
    },
    '/v1/hotel/bookings/{id}/check-in': {
      post: op({ tag: 'Bookings (lễ tân)', summary: 'Check-in', perm: 'booking:checkin', params: [idParam], extra: { 404: err('Không tìm thấy'), 409: err('Trạng thái không hợp lệ') } }),
    },

    '/v1/hotel/bookings/{id}/check-out': {
      post: op({ tag: 'Bookings (lễ tân)', summary: 'Check-out (CHECKED_IN -> CHECKED_OUT); trả { booking }', perm: 'booking:checkin', params: [idParam], extra: { 404: err('BOOKING_NOT_FOUND (kể cả khách sạn khác)'), 409: err('INVALID_STATE') } }),
    },
    '/v1/hotel/bookings/{id}/no-show': {
      post: op({ tag: 'Bookings (lễ tân)', summary: 'Khách không đến (CONFIRMED, đã tới/qua ngày nhận phòng giờ VN -> NO_SHOW); không đụng tiền; trả { booking }', perm: 'booking:checkin', params: [idParam], extra: { 404: err('BOOKING_NOT_FOUND'), 409: err('INVALID_STATE hoặc NO_SHOW_NOT_DUE') } }),
    },
    '/v1/hotel/profile': {
      get: op({ tag: 'Hồ sơ khách sạn (lễ tân)', summary: 'Hồ sơ khách sạn của token: { profile } (không có tài khoản nhận tiền)', perm: 'room:manage' }),
      patch: op({
        tag: 'Hồ sơ khách sạn (lễ tân)', summary: 'Sửa trường an toàn; ít nhất 1 trường; trả { profile }', perm: 'room:manage',
        body: body(obj({ description: str, phone: str, receptionCloseHour: { type: 'integer', nullable: true, description: '0-26, null = bỏ' }, cancellationTemplate: { type: 'string', enum: ['FLEXIBLE', 'STANDARD', 'NON_REFUNDABLE'] }, amenities: { type: 'array', items: str }, images: { type: 'array', items: str, description: 'Khóa R2 (từ upload-url), tối đa 10; thay toàn bộ danh sách' } })),
      }),
    },
    '/v1/hotel/media/upload-url': {
      post: op({
        tag: 'Hồ sơ khách sạn (lễ tân)', summary: 'URL ký sẵn tải ảnh lên R2 (503 STORAGE_NOT_CONFIGURED nếu chưa có R2)', perm: 'room:manage',
        body: body(obj({ folder: { type: 'string', enum: ['hotels', 'rooms'] }, contentType: { type: 'string', example: 'image/jpeg' }, size: { type: 'integer' } }, ['contentType', 'size'])),
      }),
    },

    '/v1/payments/vnpay/ipn': {
      get: op({
        tag: 'Payments (VNPay)',
        summary: 'VNPay gọi lại (IPN) bằng query vnp_*, xác thực bằng vnp_SecureHash. Trả JSON {RspCode, Message}: 00 ok, 01 không thấy đơn, 02 đã xác nhận, 04 sai số tiền, 97 sai chữ ký',
        public: true,
        params: [param('vnp_TxnRef', 'query'), param('vnp_Amount', 'query'), param('vnp_ResponseCode', 'query'), param('vnp_TransactionStatus', 'query'), param('vnp_TransactionNo', 'query'), param('vnp_SecureHash', 'query')],
        res: ok('RspCode/Message', obj({ RspCode: str, Message: str })),
      }),
    },
    '/v1/payments/vnpay/link': {
      post: op({ tag: 'Payments (VNPay)', summary: 'Lấy lại link thanh toán (giữ tương thích; giống /v1/payments/link)', public: true, body: body(ref('Lookup')) }),
    },
    '/v1/payments/link': {
      post: op({ tag: 'Payments (VNPay)', summary: 'Lấy lại link thanh toán theo cổng của đơn (VNPay/MoMo). 409 PAYMENT_NOT_AVAILABLE/BOOKING_EXPIRED, 502 VNPAY_UNAVAILABLE/MOMO_UNAVAILABLE', public: true, body: body(ref('Lookup')) }),
    },
    '/v1/payments/momo/link': {
      post: op({ tag: 'Payments (VNPay)', summary: 'Bí danh của /v1/payments/link', public: true, body: body(ref('Lookup')) }),
    },
    '/v1/payments/methods': {
      get: op({
        tag: 'Payments (VNPay)',
        summary: 'Cổng thanh toán đang bật (AT_HOTEL luôn có; VNPAY/MOMO theo env, kèm mode mock|live). Không lộ khóa',
        public: true,
        res: ok('methods', obj({ methods: { type: 'array', items: obj({ id: str, label: str, mode: str }, ['id', 'label']) } })),
      }),
    },
    '/v1/payments/momo/ipn': {
      post: op({
        tag: 'Payments (VNPay)',
        summary: 'MoMo gọi lại (IPN) bằng POST JSON, xác thực bằng signature HMAC-SHA256. 204 = đã nhận (kể cả lặp/lệch tiền/không thấy đơn), 400 = sai chữ ký',
        public: true,
        body: body(obj({ partnerCode: str, orderId: str, requestId: str, amount: int, orderInfo: str, orderType: str, transId: int, resultCode: int, message: str, payType: str, responseTime: int, extraData: str, signature: str }, ['orderId', 'amount', 'resultCode', 'signature'])),
      }),
    },
    '/v1/payments/momo/dev-simulate': {
      post: op({
        tag: 'Payments (VNPay)',
        summary: '[chỉ MOMO_MODE=mock, không production] Giả lập MoMo báo kết quả qua đúng đường IPN (resultCode 0 = thành công)',
        public: true,
        body: body(obj({ orderId: str, resultCode: { type: 'integer', default: 0 }, amount: int }, ['orderId']), { orderId: 'AR...', resultCode: 0 }),
      }),
    },
    '/v1/payments/vnpay/dev-simulate': {
      post: op({
        tag: 'Payments (VNPay)',
        summary: '[chỉ mock, không production] Giả lập VNPay báo kết quả (resultCode 0 = thành công)',
        public: true,
        body: body(obj({ orderId: str, resultCode: { type: 'integer', default: 0 }, amount: int }, ['orderId']), { orderId: 'AR...', resultCode: 0 }),
      }),
    },

    '/v1/auth/password': {
      patch: op({
        tag: 'Auth',
        summary: 'Nhân sự (admin/khách sạn/chi trả/tài xế) tự đổi mật khẩu; khách dùng /v1/me/password. Không thu hồi token đang dùng ở nơi khác',
        body: body(obj({ currentPassword: str, newPassword: { type: 'string', minLength: 12, maxLength: 128 } }, ['currentPassword', 'newPassword'])),
        res: { description: 'Xong (204)' },
        extra: { 400: err('WRONG_CURRENT_PASSWORD'), 422: err('Mật khẩu mới ngắn / SAME_PASSWORD') },
      }),
    },
    '/v1/auth/profile': {
      patch: op({
        tag: 'Auth',
        summary: 'Nhân sự tự sửa hồ sơ (họ tên, SĐT; email không đổi). phone null = xóa. Trả { user }',
        body: body(obj({ fullName: str, phone: { type: 'string', nullable: true } })),
        extra: { 422: err('Dữ liệu sai / không có trường nào') },
      }),
    },
    '/v1/hotel/permissions': { get: op({ tag: 'Hotel · Nhân viên', summary: 'Danh mục quyền thuộc phạm vi khách sạn (không có admin:/payer:/business:)', perm: 'hotel:role:manage hoặc hotel:staff:manage' }) },
    '/v1/hotel/roles': {
      get: op({ tag: 'Hotel · Nhân viên', summary: 'Vai trò mẫu hệ thống (hotel_owner chỉ xem; lễ tân/quản lý gán được) + vai trò tùy chỉnh của khách sạn đang làm việc', perm: 'hotel:role:manage hoặc hotel:staff:manage' }),
      post: op({
        tag: 'Hotel · Nhân viên',
        summary: 'Tạo vai trò tùy chỉnh của khách sạn (scope HOTEL, key custom_*)',
        perm: 'hotel:role:manage',
        body: body(obj({ name: str, description: str, permissions: { type: 'array', items: str, minItems: 1 } }, ['name', 'permissions']), { name: 'Kế toán KS', permissions: ['booking:read'] }),
        extra: { 201: ok('Đã tạo: {role}'), 403: err('PERMISSION_ESCALATION'), 409: err('ROLE_NAME_TAKEN'), 422: err('PERMISSION_OUT_OF_SCOPE / dữ liệu sai') },
      }),
    },
    '/v1/hotel/roles/{id}': {
      patch: op({
        tag: 'Hotel · Nhân viên',
        summary: 'Sửa vai trò tùy chỉnh của khách sạn mình (hiệu lực ngay)',
        perm: 'hotel:role:manage',
        params: [idParam],
        body: body(obj({ name: str, description: str, permissions: { type: 'array', items: str } })),
        extra: { 403: err('PERMISSION_ESCALATION'), 404: err('ROLE_NOT_FOUND (gồm vai trò admin/khách sạn khác)'), 409: err('ROLE_SYSTEM_IMMUTABLE / CANNOT_MODIFY_SELF / ROLE_NAME_TAKEN'), 422: err('PERMISSION_OUT_OF_SCOPE') },
      }),
      delete: op({
        tag: 'Hotel · Nhân viên',
        summary: 'Xóa vai trò tùy chỉnh chưa có nhân viên dùng',
        perm: 'hotel:role:manage',
        params: [idParam],
        res: { description: 'Xong (204)' },
        extra: { 404: err('ROLE_NOT_FOUND'), 409: err('ROLE_IN_USE / ROLE_SYSTEM_IMMUTABLE / CANNOT_MODIFY_SELF') },
      }),
    },
    '/v1/hotel/staff': {
      get: op({ tag: 'Hotel · Nhân viên', summary: 'Nhân viên khách sạn đang làm việc (kèm chủ, chỉ đọc); q khớp email/tên; after = nextCursor', perm: 'hotel:staff:manage', params: [param('status', 'query'), param('roleId', 'query', uuid), param('q', 'query'), limit, param('after', 'query', int)] }),
      post: op({
        tag: 'Hotel · Nhân viên',
        summary: 'Tạo nhân viên (type HOTEL gắn khách sạn trong token, một vai trò)',
        perm: 'hotel:staff:manage',
        body: body(obj({ email: str, fullName: str, phone: str, roleId: uuid, password: { type: 'string', minLength: 12, description: 'Mật khẩu tạm' } }, ['email', 'fullName', 'roleId', 'password'])),
        extra: { 201: ok('Đã tạo: {staff}'), 403: err('PERMISSION_ESCALATION'), 404: err('ROLE_NOT_FOUND'), 409: err('EMAIL_EXISTS') },
      }),
    },
    '/v1/hotel/staff/{id}': {
      patch: op({
        tag: 'Hotel · Nhân viên',
        summary: 'Sửa họ tên/SĐT/vai trò, khóa-mở khóa (status ACTIVE|LOCKED). Trả { staff }',
        perm: 'hotel:staff:manage',
        params: [idParam],
        body: body(obj({ fullName: str, phone: { type: 'string', nullable: true }, roleId: uuid, status: { type: 'string', enum: ['ACTIVE', 'LOCKED'] } })),
        extra: { 403: err('OWNER_PROTECTED / PERMISSION_ESCALATION'), 404: err('STAFF_NOT_FOUND / ROLE_NOT_FOUND'), 409: err('CANNOT_MODIFY_SELF') },
      }),
    },
    '/v1/hotel/staff/{id}/reset-password': {
      post: op({
        tag: 'Hotel · Nhân viên',
        summary: 'Đặt lại mật khẩu nhân viên',
        perm: 'hotel:staff:manage',
        params: [idParam],
        body: body(obj({ password: { type: 'string', minLength: 12 } }, ['password'])),
        res: { description: 'Xong (204)' },
        extra: { 403: err('OWNER_PROTECTED / PERMISSION_ESCALATION'), 404: err('STAFF_NOT_FOUND'), 409: err('CANNOT_MODIFY_SELF') },
      }),
    },

    '/v1/admin/permissions': { get: op({ tag: 'Admin · Vai trò', summary: 'Danh mục quyền (key, group, description, sensitive)', perm: 'admin:account:manage' }) },
    '/v1/admin/roles': {
      get: op({ tag: 'Admin · Vai trò', summary: 'Vai trò hệ thống + tùy chỉnh, kèm số tài khoản đang dùng', perm: 'admin:account:manage' }),
      post: op({
        tag: 'Admin · Vai trò',
        summary: 'Tạo vai trò tùy chỉnh',
        perm: 'admin:account:manage',
        body: body(obj({ name: str, description: str, permissions: { type: 'array', items: str, minItems: 1 } }, ['name', 'permissions']), { name: 'Kiểm duyệt', permissions: ['audit:read'] }),
        extra: { 201: ok('Đã tạo: {role}'), 403: err('PERMISSION_ESCALATION: gán quyền mình không có'), 409: err('ROLE_NAME_TAKEN'), 422: err('UNKNOWN_PERMISSION / dữ liệu sai') },
      }),
    },
    '/v1/admin/roles/{id}': {
      patch: op({
        tag: 'Admin · Vai trò',
        summary: 'Sửa tên/mô tả/quyền vai trò tùy chỉnh (có hiệu lực ngay)',
        perm: 'admin:account:manage',
        params: [idParam],
        body: body(obj({ name: str, description: str, permissions: { type: 'array', items: str } })),
        extra: { 403: err('PERMISSION_ESCALATION'), 404: err('ROLE_NOT_FOUND'), 409: err('ROLE_SYSTEM_IMMUTABLE / CANNOT_MODIFY_SELF / ROLE_NAME_TAKEN'), 422: err('UNKNOWN_PERMISSION') },
      }),
      delete: op({
        tag: 'Admin · Vai trò',
        summary: 'Xóa vai trò tùy chỉnh chưa có tài khoản dùng',
        perm: 'admin:account:manage',
        params: [idParam],
        res: { description: 'Xong (204)' },
        extra: { 404: err('ROLE_NOT_FOUND'), 409: err('ROLE_IN_USE / ROLE_SYSTEM_IMMUTABLE / CANNOT_MODIFY_SELF') },
      }),
    },
    '/v1/admin/accounts': {
      get: op({ tag: 'Admin · Tài khoản', summary: 'Danh sách tài khoản admin (mới nhất trước; after = nextCursor trang trước; q khớp email/tên)', perm: 'admin:account:manage', params: [param('status', 'query'), param('adminRole', 'query'), param('roleId', 'query', uuid), param('q', 'query'), limit, param('after', 'query', int)] }),
      post: op({
        tag: 'Admin · Tài khoản',
        summary: 'Tạo tài khoản admin',
        perm: 'admin:account:manage',
        body: body(obj({ email: str, fullName: str, adminRole: { type: 'string', enum: ['OPS', 'SUPPORT', 'FINANCE', 'SYSADMIN'], description: 'Hoặc dùng roleId (đúng một trong hai)' }, roleId: uuid, password: { type: 'string', minLength: 12 } }, ['email', 'fullName', 'password'])),
        extra: { 403: err('PERMISSION_ESCALATION'), 404: err('ROLE_NOT_FOUND'), 409: err('Email đã được dùng') },
      }),
    },
    '/v1/admin/accounts/{id}': {
      patch: op({
        tag: 'Admin · Tài khoản',
        summary: 'Đổi tên, vai trò hoặc khóa/mở',
        perm: 'admin:account:manage',
        params: [idParam],
        body: body(obj({ fullName: str, adminRole: str, roleId: uuid, status: { type: 'string', enum: ['ACTIVE', 'LOCKED'] } })),
        extra: { 403: err('PERMISSION_ESCALATION (tài khoản/vai trò cao hơn mình)'), 404: err('Không tìm thấy'), 409: err('Tự sửa mình hoặc xóa SYSADMIN cuối cùng') },
      }),
    },
    '/v1/admin/accounts/{id}/reset-password': {
      post: op({ tag: 'Admin · Tài khoản', summary: 'Đặt lại mật khẩu', perm: 'admin:account:manage', params: [idParam], body: body(obj({ password: { type: 'string', minLength: 12 } }, ['password'])), res: { description: 'Xong (204)' } }),
    },

    '/v1/admin/configs': { get: op({ tag: 'Admin · Cấu hình', summary: 'Cấu hình hiện hành', perm: 'admin:config:read' }) },
    '/v1/admin/configs/{key}/versions': { get: op({ tag: 'Admin · Cấu hình', summary: 'Lịch sử phiên bản', perm: 'admin:config:read', params: [param('key', 'path')] }) },
    '/v1/admin/configs/{key}': {
      put: op({
        tag: 'Admin · Cấu hình',
        summary: 'Tạo phiên bản cấu hình mới',
        perm: 'tùy khóa: admin:config:write | admin:config:shuttle | admin:config:finance',
        params: [param('key', 'path')],
        body: body(obj({ value: { type: 'object' }, reason: str, effectiveFrom: { type: 'string', format: 'date-time' } }, ['value', 'reason']), { value: { bps: 300, minVnd: 10000, roundToVnd: 1000 }, reason: 'Thử phí 3%' }),
      }),
    },

    '/v1/auth/business/register': { post: op({ tag: 'Doanh nghiệp', summary: 'Đăng ký doanh nghiệp (công khai, rate limit 10/10 phút/IP). Luôn 202 cùng nội dung kể cả email/mã số thuế đã tồn tại; hồ sơ PENDING_APPROVAL, chủ chưa đăng nhập được (login -> 403 BUSINESS_PENDING_APPROVAL / BUSINESS_REJECTED / BUSINESS_SUSPENDED). `website` là honeypot, để trống', public: true, body: body(obj({ name: str, taxCode: str, representative: str, email: str, phone: str, password: { type: 'string', minLength: 12 }, website: str }, ['name', 'taxCode', 'representative', 'email', 'phone', 'password'])), res: ok('202 RECEIVED', obj({ status: str, message: str })), extra: { 422: err('VALIDATION_ERROR') } }) },
    '/v1/auth/switch-hotel': { post: op({ tag: 'Doanh nghiệp', summary: 'Chủ doanh nghiệp đổi khách sạn đang làm việc -> token mới mang hotelId đó (khách sạn ngoài doanh nghiệp = 404 HOTEL_NOT_FOUND; nhân viên = 403)', body: body(obj({ hotelId: uuid }, ['hotelId'])), res: ok('token, hotel, hotels', obj({ token: str, hotel: obj({ id: uuid, code: str, name: str, status: str }), hotels: { type: 'array', items: obj({ id: uuid, code: str, name: str, status: str }) } })), extra: { 404: err('HOTEL_NOT_FOUND') } }) },
    '/v1/hotel/hotels': {
      get: op({ tag: 'Doanh nghiệp', summary: 'Khách sạn của doanh nghiệp trong token (kèm currentHotelId)', perm: 'business:hotel:manage' }),
      post: op({ tag: 'Doanh nghiệp', summary: 'Chủ tạo khách sạn ở trạng thái DRAFT thuộc doanh nghiệp của mình (không nhận businessId). Trùng tên 409 HOTEL_NAME_EXISTS; trùng mã 409 HOTEL_CODE_EXISTS; email/SĐT liên hệ được trùng', perm: 'business:hotel:manage', body: body(obj({ code: str, name: str, address: obj({}), location: obj({ lng: { type: 'number' }, lat: { type: 'number' } }), contact: obj({ phone: str, email: str }), airports: { type: 'array', items: obj({}) }, policy: obj({}) }, ['code', 'name', 'address', 'location', 'contact'])), extra: { 409: err('HOTEL_NAME_EXISTS / HOTEL_CODE_EXISTS') } }),
    },
    '/v1/hotel/hotels/{id}/submit': { post: op({ tag: 'Doanh nghiệp', summary: 'Gửi hồ sơ khách sạn DRAFT -> PENDING_APPROVAL (admin duyệt bằng luồng /v1/admin/hotels/{id}/approve)', perm: 'business:hotel:manage', params: [idParam], extra: { 404: err('HOTEL_NOT_FOUND'), 409: err('INVALID_STATE') } }) },
    '/v1/hotel/reports/revenue': { get: op({ tag: 'Doanh nghiệp', summary: 'Doanh thu riêng một khách sạn: items theo ngày/tháng (giờ VN, ngày nhận phòng) + totals + settlement (hotel_payouts LOCKED/PAID các kỳ trùng khoảng). realized = CHECKED_OUT, expected = CONFIRMED+CHECKED_IN, phần khách sạn nhận = phòng + xe, phí dịch vụ tách riêng. Nhân viên: chỉ hotelId của mình; chủ: mọi khách sạn của doanh nghiệp; khác = 404. Tối đa 366 ngày', perm: 'booking:read (+ business:report:read để xem khách sạn khác của doanh nghiệp)', params: [param('hotelId', 'query', uuid, true), param('from', 'query', str, true), param('to', 'query', str, true), param('groupBy', 'query'), param('format', 'query')], extra: { 404: err('HOTEL_NOT_FOUND'), 422: err('INVALID_RANGE / RANGE_TOO_LARGE') } }) },
    '/v1/hotel/reports/revenue/summary': { get: op({ tag: 'Doanh nghiệp', summary: 'Doanh thu tổng của doanh nghiệp: hotels[] mỗi khách sạn một dòng (kể cả 0 đơn) + totals = tổng các dòng; format=csv để tải', perm: 'business:report:read', params: [param('from', 'query', str, true), param('to', 'query', str, true), param('format', 'query')] }) },
    '/v1/admin/businesses': { get: op({ tag: 'Admin · Doanh nghiệp', summary: 'Danh sách doanh nghiệp (lọc status, q theo tên/mã số thuế/email; phân trang after=seq; kèm hotelCount)', perm: 'admin:hotel:read', params: [param('status', 'query'), param('q', 'query'), limit, param('after', 'query', int)] }) },
    '/v1/admin/businesses/{id}': { get: op({ tag: 'Admin · Doanh nghiệp', summary: 'Chi tiết doanh nghiệp + chủ + danh sách khách sạn', perm: 'admin:hotel:read', params: [idParam], extra: { 404: err('BUSINESS_NOT_FOUND') } }) },
    '/v1/admin/businesses/{id}/approve': { post: op({ tag: 'Admin · Doanh nghiệp', summary: 'Duyệt hồ sơ PENDING_APPROVAL -> ACTIVE (chủ ACTIVE, đăng nhập được); ghi audit BUSINESS.APPROVE', perm: 'admin:hotel:manage', params: [idParam], extra: { 409: err('INVALID_STATE') } }) },
    '/v1/admin/businesses/{id}/reject': { post: op({ tag: 'Admin · Doanh nghiệp', summary: 'Từ chối hồ sơ kèm lý do; ghi audit BUSINESS.REJECT', perm: 'admin:hotel:manage', params: [idParam], body: reason, extra: { 409: err('INVALID_STATE') } }) },
    '/v1/admin/hotels': {
      get: op({ tag: 'Admin · Khách sạn', summary: 'Danh sách khách sạn (mới nhất trước; after = nextCursor trang trước; q khớp tên/mã/địa chỉ; airport = IATA)', perm: 'admin:hotel:read', params: [param('status', 'query'), param('q', 'query'), param('airport', 'query'), param('pendingPayout', 'query'), limit, cursor] }),
      post: op({ tag: 'Admin · Khách sạn', summary: 'Tạo khách sạn (PENDING_APPROVAL). Truyền businessId của doanh nghiệp ĐÃ DUYỆT (khuyến nghị; chưa duyệt = 409 BUSINESS_NOT_ACTIVE) HOẶC owner{email,fullName,password} (cũ: tạo doanh nghiệp ACTIVE + chủ INVITED); đúng một trong hai. Trùng tên 409 HOTEL_NAME_EXISTS', perm: 'admin:hotel:manage', body: body({ type: 'object', description: 'Xem ví dụ trong file Postman: code, name, address, location, airports, roomTypes, owner...' }), extra: { 409: err('Mã hoặc email trùng') } }),
    },
    '/v1/admin/hotels/{id}': {
      get: op({ tag: 'Admin · Khách sạn', summary: 'Chi tiết khách sạn', perm: 'admin:hotel:read', params: [hotelId], extra: { 404: err('Không tìm thấy') } }),
      patch: op({ tag: 'Admin · Khách sạn', summary: 'Sửa thông tin', perm: 'admin:hotel:manage', params: [hotelId], body: body({ type: 'object' }, { name: 'Tên mới' }) }),
    },
    '/v1/admin/hotels/{id}/approve': { post: op({ tag: 'Admin · Khách sạn', summary: 'Duyệt khách sạn', perm: 'admin:hotel:manage', params: [hotelId] }) },
    '/v1/admin/hotels/{id}/reject': { post: op({ tag: 'Admin · Khách sạn', summary: 'Từ chối', perm: 'admin:hotel:manage', params: [hotelId], body: reason }) },
    '/v1/admin/hotels/{id}/suspend': { post: op({ tag: 'Admin · Khách sạn', summary: 'Tạm ngưng', perm: 'admin:hotel:manage', params: [hotelId], body: reason }) },
    '/v1/admin/hotels/{id}/activate': { post: op({ tag: 'Admin · Khách sạn', summary: 'Kích hoạt lại', perm: 'admin:hotel:manage', params: [hotelId] }) },
    '/v1/admin/hotels/{id}/payout-account': {
      put: op({ tag: 'Admin · Khách sạn', summary: 'Đổi tài khoản nhận tiền (có hiệu lực ngay, không cần duyệt)', perm: 'admin:hotel:manage', params: [hotelId], body: body(ref('Payout')) }),
    },
    '/v1/admin/hotels/{id}/payout-account/approve': {
      post: op({ tag: 'Admin · Khách sạn', summary: 'Duyệt đề xuất tài khoản cũ còn tồn (không còn sinh đề xuất mới)', perm: 'admin:hotel:approve-sensitive', params: [hotelId] }),
    },
    '/v1/admin/hotels/{id}/payout-account/reject': {
      post: op({ tag: 'Admin · Khách sạn', summary: 'Từ chối đề xuất tài khoản nhận tiền', perm: 'admin:hotel:approve-sensitive', params: [hotelId], body: reason }),
    },
    '/v1/admin/hotels/{id}/stats': {
      get: op({ tag: 'Admin · Khách sạn', summary: 'Thống kê khách sạn', perm: 'admin:hotel:read', params: [hotelId, param('from', 'query'), param('to', 'query')] }),
    },

    '/v1/admin/payments': { get: op({ tag: 'Admin · Thanh toán', summary: 'Giao dịch cổng thanh toán (VNPay/MoMo)', perm: 'admin:payment:read', params: [param('method', 'query', { type: 'string', enum: ['VNPAY', 'MOMO'] }), param('anomaly', 'query', { type: 'boolean' }), limit, cursor] }) },
    '/v1/admin/refunds': { get: op({ tag: 'Admin · Thanh toán', summary: 'Lệnh hoàn tiền', perm: 'admin:payment:read', params: [limit, cursor] }) },
    '/v1/admin/payments/reconcile': { post: op({ tag: 'Admin · Thanh toán', summary: 'Đối soát gọi tay', perm: 'admin:payment:manage' }) },
    '/v1/admin/refunds/{id}/retry': { post: op({ tag: 'Admin · Thanh toán', summary: 'Thử lại lệnh hoàn MANUAL_REQUIRED', perm: 'admin:payment:manage', params: [idParam] }) },

    '/v1/admin/audit-logs': {
      get: op({
        tag: 'Admin · Nhật ký',
        summary: 'Nhật ký thao tác',
        perm: 'audit:read',
        params: [param('action', 'query'), param('entityType', 'query'), param('entityId', 'query'), param('from', 'query'), param('to', 'query'), limit, cursor],
      }),
    },

    '/v1/hotel/room-types': {
      get: op({ tag: 'Rooms (khách sạn)', summary: 'Danh sách loại phòng', perm: 'booking:read', params: [param('hotelId', 'query', uuid, false), param('includeRetired', 'query', { type: 'boolean' })] }),
      post: op({ tag: 'Rooms (khách sạn)', summary: 'Tạo loại phòng', perm: 'room:manage', body: body(obj({ code: str, name: str, capacity: int, beds: int, areaM2: int, totalRooms: int, baseNightVnd: int, hourly: obj({ enabled: { type: 'boolean' }, firstHourVnd: int, nextHourVnd: int, minHours: int, maxHours: int, cleaningMin: int, openFromHour: int, openToHour: int }, ['enabled']), description: str, view: str, amenities: { type: 'array', items: str }, smoking: { type: 'boolean' }, maxAdults: int, maxChildren: int, images: { type: 'array', items: str, maxItems: 10 } }, ['code', 'name', 'capacity', 'beds', 'totalRooms', 'baseNightVnd'])), extra: { 409: err('Mã trùng') } }),
    },
    '/v1/hotel/room-types/{id}': {
      patch: op({ tag: 'Rooms (khách sạn)', summary: 'Sửa loại phòng (hạ số phòng dưới số đang giữ -> 409). Loại đã ngừng dùng: chỉ nhận { active: true } để mở bán lại (xóa retiredAt, audit ROOM_TYPE.REACTIVATE; 409 ROOM_TYPE_CODE_EXISTS nếu mã bị loại đang hoạt động dùng); sửa khác -> 409 ROOM_TYPE_RETIRED', perm: 'room:manage', params: [idParam], body: body({ type: 'object' }, { totalRooms: 5 }) }),
      delete: op({ tag: 'Rooms (khách sạn)', summary: 'Ngừng dùng loại phòng (mềm)', perm: 'room:manage', params: [idParam] }),
    },
    '/v1/hotel/room-types/{id}/inventory': { get: op({ tag: 'Rooms (khách sạn)', summary: 'Tồn phòng theo ngày (giờ VN, tối đa 62 ngày)', perm: 'booking:read', params: [idParam, param('from', 'query'), param('to', 'query')] }) },
    '/v1/hotel/floors': {
      get: op({ tag: 'Rooms (khách sạn)', summary: 'Danh sách tầng (kèm roomCount)', perm: 'booking:read', params: [param('hotelId', 'query', uuid, false)] }),
      post: op({ tag: 'Rooms (khách sạn)', summary: 'Tạo tầng', perm: 'room:manage', body: body(obj({ name: str, level: int, sortOrder: int, note: str }, ['name', 'level'])), extra: { 409: err('FLOOR_LEVEL_TAKEN') } }),
    },
    '/v1/hotel/floors/{id}': {
      patch: op({ tag: 'Rooms (khách sạn)', summary: 'Sửa tầng', perm: 'room:manage', params: [idParam], body: body({ type: 'object' }, { name: 'Tầng 2' }) }),
      delete: op({ tag: 'Rooms (khách sạn)', summary: 'Xóa tầng (còn phòng -> 409 FLOOR_HAS_ROOMS)', perm: 'room:manage', params: [idParam] }),
    },
    '/v1/hotel/rooms': {
      get: op({ tag: 'Rooms (khách sạn)', summary: 'Danh sách phòng riêng lẻ (lọc floorId, roomTypeId)', perm: 'booking:read', params: [param('floorId', 'query', uuid, false), param('roomTypeId', 'query', uuid, false)] }),
      post: op({ tag: 'Rooms (khách sạn)', summary: 'Tạo phòng; loại phòng có phòng thì total_rooms = số phòng ACTIVE (giảm dưới số đang giữ -> 409 ROOM_TOTAL_BELOW_RESERVED)', perm: 'room:manage', body: body(obj({ floorId: uuid, roomTypeId: uuid, number: str, status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }, images: { type: 'array', items: str } }, ['floorId', 'roomTypeId', 'number'])), extra: { 409: err('ROOM_NUMBER_TAKEN / ROOM_TOTAL_BELOW_RESERVED') } }),
    },
    '/v1/hotel/rooms/bulk': { post: op({ tag: 'Rooms (khách sạn)', summary: 'Tạo hàng loạt theo dải số (tối đa 100, tất cả hoặc không)', perm: 'room:manage', body: body(obj({ floorId: uuid, roomTypeId: uuid, prefix: str, from: int, to: int }, ['floorId', 'roomTypeId', 'from', 'to'])) }) },
    '/v1/hotel/rooms/{id}': {
      patch: op({ tag: 'Rooms (khách sạn)', summary: 'Sửa phòng (đổi status/loại phòng/ảnh); đồng bộ total_rooms', perm: 'room:manage', params: [idParam], body: body({ type: 'object' }, { status: 'INACTIVE' }) }),
      delete: op({ tag: 'Rooms (khách sạn)', summary: 'Xóa phòng (cứng); đồng bộ total_rooms', perm: 'room:manage', params: [idParam] }),
    },
    '/v1/hotel/room-blocks': {
      get: op({ tag: 'Rooms (khách sạn)', summary: 'Danh sách khóa/bảo trì phòng', perm: 'booking:read', params: [param('roomTypeId', 'query', uuid, false), limit, cursor] }),
      post: op({ tag: 'Rooms (khách sạn)', summary: 'Khóa/bảo trì phòng (không nêu qty = đóng bán phần còn trống)', perm: 'room:manage', body: body(obj({ roomTypeId: uuid, kind: { type: 'string', enum: ['LOCK', 'MAINTENANCE'] }, qty: int, from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' }, reason: str }, ['roomTypeId', 'kind', 'from', 'to', 'reason'])), extra: { 409: err('BLOCK_CONFLICT / NOTHING_TO_BLOCK') } }),
    },
    '/v1/hotel/room-blocks/{id}': { delete: op({ tag: 'Rooms (khách sạn)', summary: 'Gỡ khóa phòng', perm: 'room:manage', params: [idParam] }) },

    '/v1/hotel/bookings/{id}': { get: op({ tag: 'Bookings (lễ tân)', summary: 'Chi tiết booking kèm lịch sử + quyết định', perm: 'booking:read', params: [idParam], extra: { 404: err('Không tìm thấy') } }) },
    '/v1/hotel/bookings/{id}/confirm': { post: op({ tag: 'Bookings (lễ tân)', summary: 'Xác nhận đơn chờ khách sạn', perm: 'booking:decide', params: [idParam], extra: { 409: err('INVALID_STATE / BOOKING_EXPIRED') } }) },
    '/v1/hotel/bookings/{id}/reject': { post: op({ tag: 'Bookings (lễ tân)', summary: 'Từ chối đơn (lý do bắt buộc, trả tối đa 3 khách sạn thay thế)', perm: 'booking:decide', params: [idParam], body: reason, extra: { 409: err('INVALID_STATE / BOOKING_EXPIRED') } }) },
    '/v1/hotel/stats': { get: op({ tag: 'Hotel · Thống kê', summary: 'Thống kê của khách sạn trong token', perm: 'booking:read', params: [param('from', 'query'), param('to', 'query')] }) },
    '/v1/hotel/payouts': { get: op({ tag: 'Hotel · Chi trả', summary: 'Bảng chi trả của khách sạn trong token (chỉ LOCKED/PAID, không có nháp)', perm: 'booking:read', params: [param('period', 'query'), limit, cursor] }) },
    '/v1/hotel/payouts/{id}': { get: op({ tag: 'Hotel · Chi trả', summary: 'Chi tiết dòng của một bảng chi trả (bảng khác/nháp = 404)', perm: 'booking:read', params: [idParam], extra: { 404: err('PAYOUT_NOT_FOUND') } }) },
    '/v1/admin/bookings': { get: op({ tag: 'Admin · Booking', summary: 'Booking mọi khách sạn (lọc, phân trang)', perm: 'admin:booking:read', params: [param('hotelId', 'query', uuid, false), param('status', 'query'), param('code', 'query'), param('from', 'query'), param('to', 'query'), limit, cursor] }) },
    '/v1/admin/bookings/{id}': { get: op({ tag: 'Admin · Booking', summary: 'Chi tiết booking', perm: 'admin:booking:read', params: [idParam] }) },

    '/v1/change-requests/quote': { post: op({ tag: 'Requests (khách)', summary: 'Báo giá hủy (phí phòng theo gói chính sách; xe đã thu KHÔNG hoàn: shuttleRefundVnd = 0, shuttleKeepVnd = phí xe đã thu)', public: true, body: body(ref('Lookup')) }) },
    '/v1/change-requests': {
      post: op({ tag: 'Requests (khách)', summary: 'Gửi yêu cầu hủy hoặc đổi ngày', public: true, params: [{ ...param('Idempotency-Key', 'header'), required: true }], body: body(obj({ code: str, phone: str, type: { type: 'string', enum: ['CANCEL', 'CHANGE'] }, reasonCode: { type: 'string', enum: ['CHANGE_OF_PLAN', 'FLIGHT_CANCELLED', 'FLIGHT_RESCHEDULED', 'HEALTH', 'OTHER'] }, reasonNote: str, newFrom: { type: 'string', format: 'date-time' }, newTo: { type: 'string', format: 'date-time' } }, ['code', 'phone', 'type', 'reasonCode'])), extra: { 201: ok('Đã tạo'), 409: err('REQUEST_ALREADY_PENDING / BOOKING_NOT_CANCELLABLE') } }),
    },
    '/v1/change-requests/lookup': { post: op({ tag: 'Requests (khách)', summary: 'Tra cứu yêu cầu của booking', public: true, body: body(ref('Lookup')) }) },
    '/v1/hotel/change-requests': { get: op({ tag: 'Requests (nhân sự)', summary: 'Danh sách yêu cầu đổi/hủy', perm: 'request:handle', params: [param('status', 'query'), limit, cursor] }) },
    '/v1/hotel/change-requests/{id}/approve': { post: op({ tag: 'Requests (nhân sự)', summary: 'Duyệt yêu cầu (hủy: nhả phòng + lệnh hoàn PENDING; đổi ngày: kiểm tồn lại)', perm: 'request:handle', params: [idParam], body: body(obj({ note: str })) }) },
    '/v1/hotel/change-requests/{id}/reject': { post: op({ tag: 'Requests (nhân sự)', summary: 'Từ chối yêu cầu', perm: 'request:handle', params: [idParam], body: body(obj({ note: str }, ['note'])) }) },

    '/v1/support': { post: op({ tag: 'Support (khách)', summary: 'Gửi yêu cầu hỗ trợ', public: true, params: [{ ...param('Idempotency-Key', 'header'), required: true }], body: body(obj({ bookingCode: str, phone: str, fullName: str, email: str, subject: str, message: str }, ['phone', 'subject', 'message'])), extra: { 201: ok('Đã tạo') } }) },
    '/v1/support/lookup': { post: op({ tag: 'Support (khách)', summary: 'Xem ticket bằng mã + SĐT', public: true, body: body(obj({ code: str, phone: str }, ['code', 'phone'])) }) },
    '/v1/support/reply': { post: op({ tag: 'Support (khách)', summary: 'Khách trả lời ticket', public: true, params: [{ ...param('Idempotency-Key', 'header'), required: true }], body: body(obj({ code: str, phone: str, message: str }, ['code', 'phone', 'message'])), extra: { 201: ok('Đã gửi') } }) },
    '/v1/support/attachments/upload-url': { post: op({ tag: 'Support (khách)', summary: 'Xin URL PUT tải ảnh/video đính kèm ticket (ảnh ≤ 5 MB tối đa 5; video mp4 ≤ 30 MB tối đa 1; tối đa 6 tệp)', public: true, params: [{ ...param('Idempotency-Key', 'header'), required: true }], body: body(obj({ code: str, phone: str, contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] }, size: { type: 'integer' } }, ['code', 'phone', 'contentType', 'size'])), extra: { 201: ok('URL PUT ký sẵn, hết hạn 5 phút'), 409: err('ATTACHMENT_LIMIT / TICKET_RESOLVED') } }) },
    '/v1/support/attachments/confirm': { post: op({ tag: 'Support (khách)', summary: 'Xác nhận đã tải lên: server kiểm tra kích thước/loại thật của tệp', public: true, body: body(obj({ code: str, phone: str, attachmentId: uuid }, ['code', 'phone', 'attachmentId'])), extra: { 409: err('ATTACHMENT_NOT_UPLOADED'), 422: err('ATTACHMENT_INVALID') } }) },
    '/v1/admin/support': { get: op({ tag: 'Admin · Support', summary: 'Hàng đợi ticket', perm: 'support:handle', params: [param('status', 'query'), param('assignee', 'query'), limit, cursor] }) },
    '/v1/admin/support/{id}': {
      get: op({ tag: 'Admin · Support', summary: 'Chi tiết ticket kèm ghi chú nội bộ', perm: 'support:handle', params: [idParam] }),
      patch: op({ tag: 'Admin · Support', summary: 'Đổi trạng thái (OPEN→IN_PROGRESS→RESOLVED) / gán người xử lý', perm: 'support:handle', params: [idParam], body: body(obj({ status: { type: 'string', enum: ['IN_PROGRESS', 'RESOLVED'] }, assigneeId: uuid })) }),
    },
    '/v1/admin/support/{id}/messages': { post: op({ tag: 'Admin · Support', summary: 'Trả lời công khai hoặc ghi chú nội bộ', perm: 'support:handle', params: [idParam], body: body(obj({ message: str, internal: { type: 'boolean' } }, ['message'])) }) },

    '/v1/shuttle-requests/quote': { post: op({ tag: 'Shuttle (khách)', summary: 'Báo giá xe đưa đón', public: true, body: body(obj({ code: str, phone: str, direction: { type: 'string', enum: ['TO_HOTEL', 'TO_AIRPORT'] }, airport: str, pickupAt: { type: 'string', format: 'date-time' }, passengers: { type: 'integer', minimum: 1, maximum: 30, description: 'Tùy chọn; mặc định = guests của đơn, không được vượt guests (422 PASSENGERS_EXCEED_GUESTS)' } }, ['code', 'phone', 'direction', 'airport', 'pickupAt'])) }) },
    '/v1/shuttle-requests': { post: op({ tag: 'Shuttle (khách)', summary: 'Yêu cầu xe đưa đón (gắn booking)', public: true, params: [{ ...param('Idempotency-Key', 'header'), required: true }], body: body(obj({ code: str, phone: str, direction: { type: 'string', enum: ['TO_HOTEL', 'TO_AIRPORT'] }, airport: str, pickupAt: { type: 'string', format: 'date-time' }, passengers: { type: 'integer', minimum: 1, maximum: 30, description: 'Tùy chọn; mặc định = guests của đơn, không được vượt guests (422 PASSENGERS_EXCEED_GUESTS)' }, location: str, note: str }, ['code', 'phone', 'direction', 'airport', 'pickupAt'])), extra: { 201: ok('Đã tạo (điều phối ngay nếu còn <= 30 phút tới giờ đón)') } }) },
    '/v1/shuttle-requests/call-now': { post: op({ tag: 'Shuttle (khách)', summary: 'Gọi xe ngay (TO_AIRPORT, giờ đón = bây giờ + 15 phút), đơn CONFIRMED/CHECKED_IN', public: true, params: [{ ...param('Idempotency-Key', 'header'), required: true }], body: body(obj({ code: str, phone: str, airport: str, passengers: int, location: str, note: str }, ['code', 'phone'])), extra: { 201: ok('Đã tạo'), 409: err('BOOKING_NOT_ELIGIBLE | SHUTTLE_ALREADY_REQUESTED') } }) },
    '/v1/shuttle-requests/lookup': { post: op({ tag: 'Shuttle (khách)', summary: 'Xe của booking: { guestToken (2h, dùng cho Socket.IO + GET /v1/track/shuttle), stage, shuttles[{..., passengers, trips[]}], events[{at,type}] }. Chuyến OWN từ ACCEPTED kèm route{approach,ride,source,...} + position{lat,lng,heading,speedKmh,etaSec,phase}. Xe/tài xế chỉ lộ sau khi tài xế nhận; xe ngoài kèm shareUrl/shareHost khi đã nhập và cờ simulated (true = xe ngoài do mô phỏng SHUTTLE_SIM_AUTO tự đặt, giao diện gắn nhãn "Mô phỏng")', public: true, body: body(ref('Lookup')) }) },
    '/v1/track/shuttle': { get: op({ tag: 'Shuttle (khách)', summary: 'Theo dõi xe bằng Bearer guestToken (từ lookup): { stage, shuttles[].trips[] (route + position khi chuyến OWN từ ACCEPTED), events }. 120 yêu cầu/phút/đơn; token không phải GUEST -> 403, sai/hết hạn -> 401', public: true }) },
    '/v1/shuttle-requests/{id}/cancel': { post: op({ tag: 'Shuttle (khách)', summary: 'Khách hủy yêu cầu xe (chưa ONBOARD; đã lên xe -> 409 TRIP_ALREADY_STARTED). Không hoàn tiền xe, số tiền đơn đã thu giữ nguyên (đơn AT_HOTEL chưa có tài xế nhận: giảm tổng phải trả)', public: true, params: [idParam], body: body(ref('Lookup')) }) },
    '/v1/hotel/shuttle-requests': { get: op({ tag: 'Shuttle (nhân sự)', summary: 'Danh sách yêu cầu xe', perm: 'shuttle:handle', params: [param('status', 'query'), limit, cursor] }) },
    '/v1/hotel/shuttle-requests/{id}/assign': { post: op({ tag: 'Shuttle (nhân sự)', summary: 'Gán tài xế (nhập tay)', perm: 'shuttle:handle', params: [idParam], body: body(obj({ driverName: str, driverPhone: str }, ['driverName', 'driverPhone'])) }) },
    '/v1/hotel/shuttle-requests/{id}/complete': { post: op({ tag: 'Shuttle (nhân sự)', summary: 'Hoàn tất chuyến xe', perm: 'shuttle:handle', params: [idParam] }) },
    '/v1/hotel/shuttle-requests/{id}/cancel': { post: op({ tag: 'Shuttle (nhân sự)', summary: 'Hủy yêu cầu xe', perm: 'shuttle:handle', params: [idParam], body: body(obj({ note: str }, ['note'])) }) },
    '/v1/hotel/vehicles': {
      get: op({ tag: 'Fleet (đội xe)', summary: 'Danh sách xe (kèm tài xế)', perm: 'fleet:manage', params: [param('active', 'query')] }),
      post: op({ tag: 'Fleet (đội xe)', summary: 'Thêm xe', perm: 'fleet:manage', body: body(obj({ plate: str, seats: int, model: str, active: { type: 'boolean' }, driverId: uuid }, ['plate', 'seats'])), extra: { 201: ok('Đã tạo'), 409: err('PLATE_TAKEN | DRIVER_ALREADY_ASSIGNED') } }),
    },
    '/v1/hotel/vehicles/{id}': {
      patch: op({ tag: 'Fleet (đội xe)', summary: 'Sửa xe (một phần; driverId null = bỏ gán)', perm: 'fleet:manage', params: [idParam], body: body(obj({ plate: str, seats: int, model: str, active: { type: 'boolean' }, driverId: uuid })), extra: { 409: err('PLATE_TAKEN | VEHICLE_IN_USE') } }),
      delete: op({ tag: 'Fleet (đội xe)', summary: 'Xóa xe: chưa có chuyến -> xóa hẳn; đã có chuyến -> ngừng hoạt động; đang chạy -> 409 VEHICLE_IN_USE', perm: 'fleet:manage', params: [idParam] }),
    },
    '/v1/hotel/drivers': {
      get: op({ tag: 'Fleet (đội xe)', summary: 'Danh sách tài xế', perm: 'fleet:manage', params: [param('active', 'query')] }),
      post: op({ tag: 'Fleet (đội xe)', summary: 'Tạo tài xế = tài khoản DRIVER (email + mật khẩu ban đầu >= 12 ký tự) + hồ sơ + gán xe', perm: 'fleet:manage', body: body(obj({ email: str, password: str, fullName: str, phone: str, photoKey: str, vehicleId: uuid }, ['email', 'password', 'fullName', 'phone'])), extra: { 201: ok('Đã tạo (không trả mật khẩu)'), 409: err('EMAIL_TAKEN | VEHICLE_HAS_DRIVER') } }),
    },
    '/v1/hotel/drivers/{id}': {
      patch: op({ tag: 'Fleet (đội xe)', summary: 'Sửa tài xế (fullName, phone, photoKey drivers/<năm>/<uuid>.<jpg|png|webp>, active, vehicleId, password)', perm: 'fleet:manage', params: [idParam], body: body(obj({ fullName: str, phone: str, photoKey: str, active: { type: 'boolean' }, vehicleId: uuid, password: str })) }),
      delete: op({ tag: 'Fleet (đội xe)', summary: 'Xóa tài xế (đã có chuyến -> khóa + ngừng hoạt động)', perm: 'fleet:manage', params: [idParam] }),
    },
    '/v1/hotel/shuttle/board': { get: op({ tag: 'Fleet (đội xe)', summary: 'Bảng điều phối: { requests[+trips], alerts (NEEDS_EXTERNAL: deadlineAt, overdue), vehicles[state FREE|BUSY|NO_DRIVER|INACTIVE] }', perm: 'fleet:manage hoặc shuttle:handle', params: [param('status', 'query'), limit] }) },
    '/v1/hotel/shuttle-trips/{id}': { get: op({ tag: 'Fleet (đội xe)', summary: 'Chi tiết chuyến (xe ngoài: external.simulated = true nếu do mô phỏng tự đặt)', perm: 'fleet:manage hoặc shuttle:handle', params: [idParam] }) },
    '/v1/hotel/shuttle-trips/{id}/external': { post: op({ tag: 'Fleet (đội xe)', summary: 'Nhập xe ngoài (Grab/Xanh SM): NEEDS_EXTERNAL|ACCEPTED -> ACCEPTED. Nhập tay luôn đặt simulated=false (thắng mô phỏng)', perm: 'fleet:manage hoặc shuttle:handle', params: [idParam], body: body(obj({ provider: { type: 'string', enum: ['GRAB', 'XANHSM', 'OTHER'] }, shareUrl: str, driverName: str, plate: str, phone: str, etaAt: { type: 'string', format: 'date-time' } }, ['provider', 'shareUrl'])), extra: { 422: err('EXTERNAL_LINK_NOT_ALLOWED (https, tên miền trong EXTERNAL_RIDE_LINK_HOSTS, <= 500 ký tự)'), 409: err('NOT_EXTERNAL_TRIP | INVALID_TRANSITION') } }) },
    '/v1/hotel/shuttle-trips/{id}/reassign': { post: op({ tag: 'Fleet (đội xe)', summary: 'Đổi xe cho chuyến OFFERED/ACCEPTED/NEEDS_EXTERNAL (xe rảnh, đủ chỗ) -> OFFERED', perm: 'fleet:manage hoặc shuttle:handle', params: [idParam], body: body(obj({ vehicleId: uuid }, ['vehicleId'])), extra: { 409: err('VEHICLE_UNAVAILABLE | INVALID_TRANSITION'), 422: err('VEHICLE_TOO_SMALL') } }) },
    '/v1/hotel/shuttle-trips/{id}/cancel': { post: op({ tag: 'Fleet (đội xe)', summary: 'Hủy chuyến chưa lên xe', perm: 'fleet:manage hoặc shuttle:handle', params: [idParam], body: body(obj({ note: str }, ['note'])) }) },
    '/v1/hotel/shuttle-trips/{id}/arrived': { post: op({ tag: 'Fleet (đội xe)', summary: 'Xe ngoài đã tới (ACCEPTED|EN_ROUTE -> ARRIVED); xe của khách sạn -> 409 NOT_EXTERNAL_TRIP', perm: 'fleet:manage hoặc shuttle:handle', params: [idParam] }) },
    '/v1/hotel/shuttle-trips/{id}/onboard': { post: op({ tag: 'Fleet (đội xe)', summary: 'Xe ngoài: khách đã lên xe', perm: 'fleet:manage hoặc shuttle:handle', params: [idParam] }) },
    '/v1/hotel/shuttle-trips/{id}/dropped-off': { post: op({ tag: 'Fleet (đội xe)', summary: 'Xe ngoài: đã trả khách', perm: 'fleet:manage hoặc shuttle:handle', params: [idParam] }) },
    '/v1/driver/trips': { get: op({ tag: 'Driver (tài xế)', summary: 'Chuyến của tôi (mặc định đang hoạt động) kèm tên/SĐT khách, điểm đón/đến, giờ đón, số khách', perm: 'trip:drive', params: [param('status', 'query'), limit] }) },
    '/v1/driver/trips/{id}/accept': { post: op({ tag: 'Driver (tài xế)', summary: 'OFFERED -> ACCEPTED', perm: 'trip:drive', params: [idParam], extra: { 404: err('Không phải chuyến của tôi'), 409: err('INVALID_TRANSITION') } }) },
    '/v1/driver/trips/{id}/reject': { post: op({ tag: 'Driver (tài xế)', summary: 'OFFERED -> REJECTED (điều lại cho xe khác hoặc chuyển xe ngoài)', perm: 'trip:drive', params: [idParam], body: body(obj({ reason: str })) }) },
    '/v1/driver/trips/{id}/start': { post: op({ tag: 'Driver (tài xế)', summary: 'ACCEPTED -> EN_ROUTE', perm: 'trip:drive', params: [idParam] }) },
    '/v1/driver/trips/{id}/arrived': { post: op({ tag: 'Driver (tài xế)', summary: 'EN_ROUTE -> ARRIVED', perm: 'trip:drive', params: [idParam] }) },
    '/v1/driver/trips/{id}/onboard': { post: op({ tag: 'Driver (tài xế)', summary: 'ARRIVED -> ONBOARD', perm: 'trip:drive', params: [idParam] }) },
    '/v1/driver/trips/{id}/no-show': { post: op({ tag: 'Driver (tài xế)', summary: 'Khách không có mặt: ARRIVED -> CANCELLED (cancel_note=no_show; yêu cầu xe đóng nếu hết chuyến; phí xe không hoàn)', perm: 'trip:drive', params: [idParam], extra: { 404: err('Không phải chuyến của tôi'), 409: err('INVALID_TRANSITION (chưa ARRIVED)') } }) },
    '/v1/driver/trips/{id}/dropped-off': { post: op({ tag: 'Driver (tài xế)', summary: 'ONBOARD -> DROPPED_OFF (mọi chuyến xong -> yêu cầu DONE)', perm: 'trip:drive', params: [idParam] }) },
    '/v1/hotel/bookings/{id}/events': { get: op({ tag: 'Bookings (lễ tân)', summary: 'Nhật ký đơn (seq tăng dần, cursor); trang đầu kèm statusHistory', perm: 'booking:read', params: [idParam, limit, cursor] }) },
    '/v1/admin/bookings/{id}/events': { get: op({ tag: 'Admin · Booking', summary: 'Nhật ký đơn (mọi khách sạn)', perm: 'admin:booking:read', params: [idParam, limit, cursor] }) },

    '/v1/flights': { get: op({ tag: 'Flights', summary: 'Bảng chuyến bay công khai (MÔ PHỎNG): { items[FlightDto], date, airport, direction, count, truncated, simulated }. Sắp xếp theo giờ bay hiệu lực TĂNG dần. airport (IATA, tuỳ chọn), direction=departures|arrivals, date, status=ONTIME|DELAYED|CANCELLED, code (tiền tố mã chuyến, chữ+số tối đa 6; không có airport thì tìm mọi sân bay), limit 1-200 (mặc định 100)', public: true, params: [param('airport', 'query', str, false), param('direction', 'query', str, false), param('date', 'query', str, false), param('status', 'query', str, false), param('code', 'query', str, false), limit] }) },
    '/v1/flights/summary': { get: op({ tag: 'Flights', summary: 'Số chuyến khởi hành/chậm/hủy theo sân bay đi trong ngày: { date, items[{origin,total,delayed,cancelled}], simulated }', public: true, params: [param('date', 'query', str, false)] }) },
    '/v1/flights/{code}': { get: op({ tag: 'Flights', summary: 'Tra chuyến bay (MÔ PHỎNG, simulated: true). Không có đúng ngày → trả chuyến mới nhất của mã (kể cả đã qua) kèm notice; 404 chỉ khi mã chưa từng có', public: true, params: [param('code', 'path'), param('date', 'query', str, false)], extra: { 404: err('FLIGHT_NOT_FOUND') } }) },
    '/v1/admin/flights': {
      get: op({ tag: 'Admin · Chuyến bay', summary: 'Danh sách chuyến bay mô phỏng (mới tạo trước; cursor = nextCursor trang trước)', perm: 'flight:manage', params: [param('code', 'query'), param('date', 'query'), param('status', 'query'), limit, cursor] }),
      post: op({
        tag: 'Admin · Chuyến bay', summary: 'Tạo chuyến mô phỏng (ONTIME); 201 { flight }', perm: 'flight:manage',
        body: body(obj({ code: str, airline: str, origin: str, dest: str, scheduledDepartureAt: { type: 'string', format: 'date-time' }, distanceKm: int, simScenario: { type: 'string', enum: ['approve', 'reject', 'hotelfull', 'noreply'] }, reason: str }, ['code', 'origin', 'scheduledDepartureAt', 'reason'])),
        extra: { 409: err('FLIGHT_EXISTS'), 422: err('AIRPORT_UNKNOWN / VALIDATION_ERROR') },
      }),
    },
    '/v1/admin/flights/{id}': { delete: op({ tag: 'Admin · Chuyến bay', summary: 'Xóa chuyến chưa có lịch sử thay đổi; 204', perm: 'flight:manage', params: [idParam], extra: { 404: err('FLIGHT_NOT_FOUND'), 409: err('FLIGHT_IN_USE') } }), patch: op({ tag: 'Admin · Chuyến bay', summary: 'Đổi giờ/trạng thái (kèm lý do, có lịch sử)', perm: 'flight:manage', params: [idParam], body: body(obj({ status: { type: 'string', enum: ['ONTIME', 'DELAYED', 'CANCELLED'] }, newDepartureAt: { type: 'string', format: 'date-time' }, cause: str, reason: str }, ['status', 'reason'])), extra: { 409: err('FLIGHT_UNCHANGED') } }) },
    '/v1/admin/flights/{id}/changes': { get: op({ tag: 'Admin · Chuyến bay', summary: 'Lịch sử đổi giờ', perm: 'flight:manage', params: [idParam, limit, cursor] }) },
    '/v1/payer/ingest/flights': {
      post: op({
        tag: 'Payer · Cổng kết nối',
        summary: 'Đẩy chuyến + hành khách (UPSERT idempotent theo mã chuyến + ngày bay và PNR + họ tên). Header `x-payer-key` (không dùng Bearer) + `Idempotency-Key`. Sân bay đi phải thuộc trạm của đơn vị. Mọi lần đẩy ghi payer_ingest_logs. Trả { flight, flightCreated, flightChanged, passengers:{received,created,updated} }',
        public: true,
        params: [param('x-payer-key', 'header', str, true), param('Idempotency-Key', 'header', str, true)],
        body: body(
          obj({
            flight: obj({ code: { type: 'string', example: 'VN218' }, airline: str, origin: { type: 'string', example: 'HAN' }, dest: { type: 'string', nullable: true }, scheduledDepartureAt: { type: 'string', format: 'date-time' }, newDepartureAt: { type: 'string', format: 'date-time', nullable: true }, status: { type: 'string', enum: ['DELAYED', 'ONTIME', 'CANCELLED'] }, cause: { type: 'string', enum: ['AIRLINE', 'FORCE', 'UNKNOWN'] } }, ['code', 'airline', 'origin', 'scheduledDepartureAt', 'newDepartureAt', 'status', 'cause']),
            passengers: { type: 'array', maxItems: 300, items: obj({ pnr: str, fullName: str, age: int, isRepresentative: { type: 'boolean' }, email: str, phone: str, specialNeeds: { type: 'array', items: str } }, ['pnr', 'fullName', 'age']) },
          }, ['flight', 'passengers']),
        ),
        extra: { 401: err('INVALID_API_KEY (thiếu/sai/đã thu hồi)'), 403: err('STATION_NOT_ALLOWED / PAYER_SUSPENDED'), 409: err('FLIGHT_CONFLICT'), 422: err('VALIDATION_ERROR / FLIGHT_TIME_INVALID') },
      }),
    },
    '/v1/payer/simulate-delay': { post: op({ tag: 'Payer · Cổng kết nối', summary: 'Nút "Tạo chuyến bay delay": sinh chuyến + hành khách mô phỏng (simulated=true) cho trạm của tài khoản, đi qua đúng hàm ingest. Cần Idempotency-Key. 201 trả như ingest. Chỉ khi DELAY_SIM_ENABLED (tắt ở production)', perm: 'payer:delay:manage', params: [param('Idempotency-Key', 'header', str, true)], body: body(obj({ delayUntil: { type: 'string', format: 'date-time' } }, ['delayUntil'])), extra: { 403: err('FORBIDDEN / DELAY_SIM_DISABLED'), 409: err('NO_STATION'), 422: err('FLIGHT_TIME_INVALID') } }) },
    '/v1/payer/flights': { get: op({ tag: 'Payer · Cổng kết nối', summary: 'Chuyến DELAYED của đơn vị (trong trạm của tài khoản), mới nhất trước; { items[{id,seq,code,airline,origin,dest,flightDate,scheduledDepartureAt,newDepartureAt,status,cause,simulated,delayMinutes,paxCount,groupCount}], nextCursor } (keyset theo seq giảm dần)', perm: 'payer:delay:read', params: [limit, cursor] }) },
    '/v1/payer/flights/{id}/passengers': { get: op({ tag: 'Payer · Cổng kết nối', summary: 'Hành khách của chuyến, gom theo PNR: { flight, total, groups[{pnr,counts{adult,child,infant,total},passengers[]}] }. Chuyến của đơn vị khác -> 404', perm: 'payer:delay:read', params: [idParam], extra: { 404: err('FLIGHT_NOT_FOUND') } }) },
    '/v1/payer/flights/{id}/batches/preview': { post: op({ tag: 'Payer · Đặt phòng nghỉ', summary: 'Xem trước phương án xếp phòng (KHÔNG ghi DB). Body { passengerIds[] }. Trả { flightId, units[{id,pnr,hotelId,hotelName,cluster,adjacent,connecting,rooms[{roomTypeId,roomTypeName,paxIds,priceVnd}],stay{checkInAt,checkOutAt},totalVnd,contact{fullName,phone,email},phoneMissing}], unplaced[{paxId,pnr,reason}] }. Khung ở = [bây giờ + xe chạy, giờ bay mới - 120\' - xe chạy - 15\']', perm: 'payer:delay:manage', params: [idParam], body: body(obj({ passengerIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 300 } }, ['passengerIds'])), extra: { 404: err('FLIGHT_NOT_FOUND | PASSENGER_NOT_FOUND'), 409: err('FLIGHT_TIME_UNKNOWN | FLIGHT_NOT_DELAYED | FLIGHT_TOO_SOON | PAX_ALREADY_PLACED') } }) },
    '/v1/payer/flights/{id}/batches': { post: op({ tag: 'Payer · Đặt phòng nghỉ', summary: 'Đặt phòng nghỉ cho khách đã chọn: tạo lô + nhóm theo PNR, mỗi đơn vị đặt = 1 booking PAYER (HOLD 5\') + 1 offer PENDING. Hết phòng thì tự thử KS kế tiếp. Cần Idempotency-Key. 201 trả như GET /v1/payer/batches/{id}', perm: 'payer:delay:manage', params: [idParam, param('Idempotency-Key', 'header', str, true)], body: body(obj({ passengerIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 300 } }, ['passengerIds'])), extra: { 404: err('FLIGHT_NOT_FOUND | PASSENGER_NOT_FOUND'), 409: err('FLIGHT_TIME_UNKNOWN | FLIGHT_NOT_DELAYED | FLIGHT_TOO_SOON | PAX_ALREADY_PLACED'), 422: err('PAX_PHONE_REQUIRED') } }) },
    '/v1/payer/batches/{id}': { get: op({ tag: 'Payer · Đặt phòng nghỉ', summary: 'Trạng thái lô: { id, flightId, status, simulated, createdAt, groups[{id,code,pnr,noSplit,status}], offers[{id,groupId,groupCode,hotelId,hotelName,roomTypeId,roomTypeName,qty,status,bookingCode,expiresAt,secondsLeft,roomNumbers,transferCount,rejectReason,paxIds}], unplaced[{paxId,pnr,reason}] }. secondsLeft chỉ có khi PENDING. Lô của đơn vị khác -> 404', perm: 'payer:delay:read', params: [idParam], extra: { 404: err('BATCH_NOT_FOUND') } }) },
    '/v1/payer/passengers/{id}': { patch: op({ tag: 'Payer · Đặt phòng nghỉ', summary: 'Sửa email/SĐT liên hệ của hành khách (chỉ áp dụng cho đơn, dữ liệu gốc của hãng giữ nguyên, có audit). Trả { id, email, phone }', perm: 'payer:delay:manage', params: [idParam], body: body(obj({ email: str, phone: str })), extra: { 404: err('PASSENGER_NOT_FOUND'), 422: err('VALIDATION_ERROR') } }) },
    '/v1/payer/passengers/{id}/resend-email': { post: op({ tag: 'Payer · Đặt phòng nghỉ', summary: 'Gửi lại email xác nhận phòng cho khách (tới contact_email ?? email). Cần Idempotency-Key. Trả { sent, to }. 404 PASSENGER_NOT_FOUND; 409 OFFER_NOT_CONFIRMED; 422 PASSENGER_EMAIL_REQUIRED; 429 RESEND_LIMIT (tối đa 3 lần/giờ/khách)', perm: 'payer:delay:manage', params: [idParam], extra: { 404: err('PASSENGER_NOT_FOUND'), 409: err('OFFER_NOT_CONFIRMED'), 422: err('PASSENGER_EMAIL_REQUIRED'), 429: err('RESEND_LIMIT') } }) },
    '/v1/admin/dashboard': { get: op({ tag: 'Admin · Dashboard', summary: 'Dashboard toàn hệ thống (khoảng tối đa 92 ngày)', perm: 'admin:dashboard:read', params: [param('from', 'query'), param('to', 'query')] }) },

    '/v1/admin/media/upload-url': {
      post: op({
        tag: 'Admin · Media',
        summary: 'Lấy URL ký sẵn để tải ảnh lên R2 (PUT, hết hạn 300 giây)',
        perm: 'admin:hotel:manage',
        body: body(obj({ folder: { type: 'string', enum: ['hotels', 'rooms'] }, contentType: { type: 'string', example: 'image/jpeg' }, size: { type: 'integer', description: 'Byte, tối đa 5MB' } }, ['folder', 'contentType', 'size'])),
      }),
    },
  },
};
