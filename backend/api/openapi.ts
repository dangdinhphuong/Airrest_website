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
    { name: 'Payments (VNPay)' },
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
    { name: 'Flights' },
    { name: 'Admin · Booking' },
    { name: 'Admin · Chuyến bay' },
    { name: 'Admin · Dashboard' },
    { name: 'Hotel · Thống kê' },
  ],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: obj({ error: obj({ code: str, message: str, requestId: str }) }),
      Guest: obj({ fullName: str, phone: { type: 'string', example: '0912345678' }, email: { type: 'string', format: 'email' } }, ['fullName', 'phone']),
      CreateBooking: obj(
        {
          hotelId: uuid,
          roomTypeId: uuid,
          qty: { type: 'integer', minimum: 1, maximum: 5, default: 1 },
          paymentMethod: { type: 'string', enum: ['AT_HOTEL', 'VNPAY'], default: 'AT_HOTEL' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          guest: ref('Guest'),
        },
        ['hotelId', 'roomTypeId', 'from', 'to', 'guest'],
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
    '/v1/auth/me': { get: op({ tag: 'Auth', summary: 'Thông tin tài khoản hiện tại' }) },

    '/v1/airports': { get: op({ tag: 'Airports (công khai)', summary: 'Danh mục sân bay thương mại Việt Nam', public: true }) },

    '/v1/hotels': {
      get: op({
        tag: 'Hotels (công khai)',
        summary: 'Tìm khách sạn theo sân bay',
        public: true,
        params: [{ ...param('airport', 'query'), required: true, description: 'Mã IATA 3 ký tự, ví dụ HAN' }, limit, cursor, { ...param('from', 'query'), description: 'Đầu cửa sổ tính số phòng còn (ISO), mặc định bây giờ' }, { ...param('to', 'query'), description: 'Cuối cửa sổ (ISO), mặc định from + 24 giờ, tối đa 31 ngày' }],
      }),
    },
    '/v1/hotels/{id}': { get: op({ tag: 'Hotels (công khai)', summary: 'Chi tiết khách sạn (kèm loại phòng, giá, số phòng còn, cờ tính năng)', public: true, params: [idParam, { ...param('from', 'query'), description: 'Đầu cửa sổ tính số phòng còn (ISO)' }, { ...param('to', 'query'), description: 'Cuối cửa sổ (ISO)' }], extra: { 404: err('Không tìm thấy') } }) },

    '/v1/bookings': {
      post: op({
        tag: 'Bookings (khách)',
        summary: 'Đặt phòng không cần tài khoản',
        public: true,
        params: [{ ...param('Idempotency-Key', 'header'), required: true, description: 'Chuỗi duy nhất mỗi lần đặt, gửi lại cùng key sẽ trả kết quả cũ' }],
        body: body(ref('CreateBooking')),
        extra: { 201: ok('Đã tạo booking (VNPAY kèm paymentLink)'), 409: err('Hết phòng hoặc trùng yêu cầu') },
      }),
    },
    '/v1/bookings/lookup': {
      post: op({ tag: 'Bookings (khách)', summary: 'Tra cứu booking bằng mã + SĐT', public: true, body: body(ref('Lookup')), extra: { 404: err('Không tìm thấy') } }),
    },

    '/v1/hotel/bookings': {
      get: op({ tag: 'Bookings (lễ tân)', summary: 'Danh sách booking của khách sạn', perm: 'booking:read', params: [param('status', 'query'), limit, cursor] }),
    },
    '/v1/hotel/bookings/{id}/check-in': {
      post: op({ tag: 'Bookings (lễ tân)', summary: 'Check-in', perm: 'booking:checkin', params: [idParam], extra: { 404: err('Không tìm thấy'), 409: err('Trạng thái không hợp lệ') } }),
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
      post: op({ tag: 'Payments (VNPay)', summary: 'Lấy lại link thanh toán VNPay', public: true, body: body(ref('Lookup')) }),
    },
    '/v1/payments/vnpay/dev-simulate': {
      post: op({
        tag: 'Payments (VNPay)',
        summary: '[chỉ mock, không production] Giả lập VNPay báo kết quả (resultCode 0 = thành công)',
        public: true,
        body: body(obj({ orderId: str, resultCode: { type: 'integer', default: 0 }, amount: int }, ['orderId']), { orderId: 'AR...', resultCode: 0 }),
      }),
    },

    '/v1/admin/roles': { get: op({ tag: 'Admin · Tài khoản', summary: 'Danh sách vai trò admin', perm: 'admin:account:manage' }) },
    '/v1/admin/accounts': {
      get: op({ tag: 'Admin · Tài khoản', summary: 'Danh sách tài khoản admin', perm: 'admin:account:manage', params: [param('status', 'query'), param('adminRole', 'query'), param('q', 'query'), limit, param('after', 'query', int)] }),
      post: op({
        tag: 'Admin · Tài khoản',
        summary: 'Tạo tài khoản admin',
        perm: 'admin:account:manage',
        body: body(obj({ email: str, fullName: str, adminRole: { type: 'string', enum: ['OPS', 'SUPPORT', 'FINANCE', 'SYSADMIN'] }, password: { type: 'string', minLength: 12 } }, ['email', 'fullName', 'adminRole', 'password'])),
        extra: { 409: err('Email đã được dùng') },
      }),
    },
    '/v1/admin/accounts/{id}': {
      patch: op({
        tag: 'Admin · Tài khoản',
        summary: 'Đổi tên, vai trò hoặc khóa/mở',
        perm: 'admin:account:manage',
        params: [idParam],
        body: body(obj({ fullName: str, adminRole: str, status: { type: 'string', enum: ['ACTIVE', 'LOCKED'] } })),
        extra: { 404: err('Không tìm thấy'), 409: err('Tự sửa mình hoặc xóa SYSADMIN cuối cùng') },
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

    '/v1/admin/hotels': {
      get: op({ tag: 'Admin · Khách sạn', summary: 'Danh sách khách sạn', perm: 'admin:hotel:read', params: [param('status', 'query'), param('pendingPayout', 'query'), limit, cursor] }),
      post: op({ tag: 'Admin · Khách sạn', summary: 'Tạo khách sạn + tài khoản chủ', perm: 'admin:hotel:manage', body: body({ type: 'object', description: 'Xem ví dụ trong file Postman: code, name, address, location, airports, roomTypes, owner...' }), extra: { 409: err('Mã hoặc email trùng') } }),
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
      put: op({ tag: 'Admin · Khách sạn', summary: 'Đề xuất đổi tài khoản nhận tiền (bước 1)', perm: 'admin:hotel:manage', params: [hotelId], body: body(ref('Payout')) }),
    },
    '/v1/admin/hotels/{id}/payout-account/approve': {
      post: op({ tag: 'Admin · Khách sạn', summary: 'Duyệt tài khoản nhận tiền (bước 2, người khác đề xuất)', perm: 'admin:hotel:approve-sensitive', params: [hotelId] }),
    },
    '/v1/admin/hotels/{id}/payout-account/reject': {
      post: op({ tag: 'Admin · Khách sạn', summary: 'Từ chối đề xuất tài khoản nhận tiền', perm: 'admin:hotel:approve-sensitive', params: [hotelId], body: reason }),
    },
    '/v1/admin/hotels/{id}/stats': {
      get: op({ tag: 'Admin · Khách sạn', summary: 'Thống kê khách sạn', perm: 'admin:hotel:read', params: [hotelId, param('from', 'query'), param('to', 'query')] }),
    },

    '/v1/admin/payments': { get: op({ tag: 'Admin · Thanh toán', summary: 'Giao dịch VNPay', perm: 'admin:payment:read', params: [param('anomaly', 'query', { type: 'boolean' }), limit, cursor] }) },
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
      post: op({ tag: 'Rooms (khách sạn)', summary: 'Tạo loại phòng', perm: 'room:manage', body: body(obj({ code: str, name: str, capacity: int, beds: int, areaM2: int, totalRooms: int, baseNightVnd: int }, ['code', 'name', 'capacity', 'beds', 'totalRooms', 'baseNightVnd'])), extra: { 409: err('Mã trùng') } }),
    },
    '/v1/hotel/room-types/{id}': {
      patch: op({ tag: 'Rooms (khách sạn)', summary: 'Sửa loại phòng (hạ số phòng dưới số đang giữ -> 409)', perm: 'room:manage', params: [idParam], body: body({ type: 'object' }, { totalRooms: 5 }) }),
      delete: op({ tag: 'Rooms (khách sạn)', summary: 'Ngừng dùng loại phòng (mềm)', perm: 'room:manage', params: [idParam] }),
    },
    '/v1/hotel/room-types/{id}/inventory': { get: op({ tag: 'Rooms (khách sạn)', summary: 'Tồn phòng theo ngày (giờ VN, tối đa 62 ngày)', perm: 'booking:read', params: [idParam, param('from', 'query'), param('to', 'query')] }) },
    '/v1/hotel/room-blocks': {
      get: op({ tag: 'Rooms (khách sạn)', summary: 'Danh sách khóa/bảo trì phòng', perm: 'booking:read', params: [param('roomTypeId', 'query', uuid, false), limit, cursor] }),
      post: op({ tag: 'Rooms (khách sạn)', summary: 'Khóa/bảo trì phòng (không nêu qty = đóng bán phần còn trống)', perm: 'room:manage', body: body(obj({ roomTypeId: uuid, kind: { type: 'string', enum: ['LOCK', 'MAINTENANCE'] }, qty: int, from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' }, reason: str }, ['roomTypeId', 'kind', 'from', 'to', 'reason'])), extra: { 409: err('BLOCK_CONFLICT / NOTHING_TO_BLOCK') } }),
    },
    '/v1/hotel/room-blocks/{id}': { delete: op({ tag: 'Rooms (khách sạn)', summary: 'Gỡ khóa phòng', perm: 'room:manage', params: [idParam] }) },

    '/v1/hotel/bookings/{id}': { get: op({ tag: 'Bookings (lễ tân)', summary: 'Chi tiết booking kèm lịch sử + quyết định', perm: 'booking:read', params: [idParam], extra: { 404: err('Không tìm thấy') } }) },
    '/v1/hotel/bookings/{id}/confirm': { post: op({ tag: 'Bookings (lễ tân)', summary: 'Xác nhận đơn chờ khách sạn', perm: 'booking:decide', params: [idParam], extra: { 409: err('INVALID_STATE / BOOKING_EXPIRED') } }) },
    '/v1/hotel/bookings/{id}/reject': { post: op({ tag: 'Bookings (lễ tân)', summary: 'Từ chối đơn (lý do bắt buộc, trả tối đa 3 khách sạn thay thế)', perm: 'booking:decide', params: [idParam], body: reason, extra: { 409: err('INVALID_STATE / BOOKING_EXPIRED') } }) },
    '/v1/hotel/stats': { get: op({ tag: 'Hotel · Thống kê', summary: 'Thống kê của khách sạn trong token', perm: 'booking:read', params: [param('from', 'query'), param('to', 'query')] }) },
    '/v1/admin/bookings': { get: op({ tag: 'Admin · Booking', summary: 'Booking mọi khách sạn (lọc, phân trang)', perm: 'admin:booking:read', params: [param('hotelId', 'query', uuid, false), param('status', 'query'), param('code', 'query'), param('from', 'query'), param('to', 'query'), limit, cursor] }) },
    '/v1/admin/bookings/{id}': { get: op({ tag: 'Admin · Booking', summary: 'Chi tiết booking', perm: 'admin:booking:read', params: [idParam] }) },

    '/v1/change-requests/quote': { post: op({ tag: 'Requests (khách)', summary: 'Báo giá hủy (phí theo gói chính sách)', public: true, body: body(ref('Lookup')) }) },
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
    '/v1/admin/support': { get: op({ tag: 'Admin · Support', summary: 'Hàng đợi ticket', perm: 'support:handle', params: [param('status', 'query'), param('assignee', 'query'), limit, cursor] }) },
    '/v1/admin/support/{id}': {
      get: op({ tag: 'Admin · Support', summary: 'Chi tiết ticket kèm ghi chú nội bộ', perm: 'support:handle', params: [idParam] }),
      patch: op({ tag: 'Admin · Support', summary: 'Đổi trạng thái (OPEN→IN_PROGRESS→RESOLVED) / gán người xử lý', perm: 'support:handle', params: [idParam], body: body(obj({ status: { type: 'string', enum: ['IN_PROGRESS', 'RESOLVED'] }, assigneeId: uuid })) }),
    },
    '/v1/admin/support/{id}/messages': { post: op({ tag: 'Admin · Support', summary: 'Trả lời công khai hoặc ghi chú nội bộ', perm: 'support:handle', params: [idParam], body: body(obj({ message: str, internal: { type: 'boolean' } }, ['message'])) }) },

    '/v1/shuttle-requests/quote': { post: op({ tag: 'Shuttle (khách)', summary: 'Báo giá xe đưa đón', public: true, body: body(obj({ code: str, phone: str, direction: { type: 'string', enum: ['TO_HOTEL', 'TO_AIRPORT'] }, airport: str, pickupAt: { type: 'string', format: 'date-time' } }, ['code', 'phone', 'direction', 'airport', 'pickupAt'])) }) },
    '/v1/shuttle-requests': { post: op({ tag: 'Shuttle (khách)', summary: 'Yêu cầu xe đưa đón (gắn booking)', public: true, params: [{ ...param('Idempotency-Key', 'header'), required: true }], body: body(obj({ code: str, phone: str, direction: { type: 'string', enum: ['TO_HOTEL', 'TO_AIRPORT'] }, airport: str, pickupAt: { type: 'string', format: 'date-time' }, location: str, note: str }, ['code', 'phone', 'direction', 'airport', 'pickupAt'])), extra: { 201: ok('Đã tạo') } }) },
    '/v1/shuttle-requests/lookup': { post: op({ tag: 'Shuttle (khách)', summary: 'Xe của booking', public: true, body: body(ref('Lookup')) }) },
    '/v1/shuttle-requests/{id}/cancel': { post: op({ tag: 'Shuttle (khách)', summary: 'Khách hủy yêu cầu xe', public: true, params: [idParam], body: body(ref('Lookup')) }) },
    '/v1/hotel/shuttle-requests': { get: op({ tag: 'Shuttle (nhân sự)', summary: 'Danh sách yêu cầu xe', perm: 'shuttle:handle', params: [param('status', 'query'), limit, cursor] }) },
    '/v1/hotel/shuttle-requests/{id}/assign': { post: op({ tag: 'Shuttle (nhân sự)', summary: 'Gán tài xế (nhập tay)', perm: 'shuttle:handle', params: [idParam], body: body(obj({ driverName: str, driverPhone: str }, ['driverName', 'driverPhone'])) }) },
    '/v1/hotel/shuttle-requests/{id}/complete': { post: op({ tag: 'Shuttle (nhân sự)', summary: 'Hoàn tất chuyến xe', perm: 'shuttle:handle', params: [idParam] }) },
    '/v1/hotel/shuttle-requests/{id}/cancel': { post: op({ tag: 'Shuttle (nhân sự)', summary: 'Hủy yêu cầu xe', perm: 'shuttle:handle', params: [idParam], body: body(obj({ note: str }, ['note'])) }) },

    '/v1/flights/{code}': { get: op({ tag: 'Flights', summary: 'Tra chuyến bay (MÔ PHỎNG, simulated: true)', public: true, params: [param('code', 'path'), param('date', 'query', str, false)], extra: { 404: err('FLIGHT_NOT_FOUND') } }) },
    '/v1/admin/flights': { get: op({ tag: 'Admin · Chuyến bay', summary: 'Danh sách chuyến bay mô phỏng', perm: 'flight:manage', params: [param('code', 'query'), param('date', 'query'), param('status', 'query'), limit, cursor] }) },
    '/v1/admin/flights/{id}': { patch: op({ tag: 'Admin · Chuyến bay', summary: 'Đổi giờ/trạng thái (kèm lý do, có lịch sử)', perm: 'flight:manage', params: [idParam], body: body(obj({ status: { type: 'string', enum: ['ONTIME', 'DELAYED', 'CANCELLED'] }, newDepartureAt: { type: 'string', format: 'date-time' }, cause: str, reason: str }, ['status', 'reason'])), extra: { 409: err('FLIGHT_UNCHANGED') } }) },
    '/v1/admin/flights/{id}/changes': { get: op({ tag: 'Admin · Chuyến bay', summary: 'Lịch sử đổi giờ', perm: 'flight:manage', params: [idParam, limit, cursor] }) },
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
