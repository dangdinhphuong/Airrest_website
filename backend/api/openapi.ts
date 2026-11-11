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

    '/v1/hotels': {
      get: op({
        tag: 'Hotels (công khai)',
        summary: 'Tìm khách sạn theo sân bay',
        public: true,
        params: [{ ...param('airport', 'query'), required: true, description: 'Mã IATA 3 ký tự, ví dụ HAN' }, limit, cursor],
      }),
    },
    '/v1/hotels/{id}': { get: op({ tag: 'Hotels (công khai)', summary: 'Chi tiết khách sạn', public: true, params: [idParam], extra: { 404: err('Không tìm thấy') } }) },

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
