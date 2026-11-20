import { Router } from 'express';
import { z } from 'zod';
import { db, withTransaction } from '../../../database/pg';
import type { AccountDoc, RoleDoc } from '../../../database/types';
import { AppError } from '../../../lib/errors';
import { signAccountToken } from '../../../lib/jwt';
import { hashPassword, verifyPassword } from '../../../lib/password';
import { staffPasswordRateLimit, strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { authenticate, denyPassenger } from '../../middleware/auth';
import { actorOf, writeAudit } from '../../../services/audit';
import { forgetAuth } from '../../../services/authz';
import { businessBrief, hotelBrief, linkedHotels } from '../../../services/business/business.service';
import { idParams } from '../../../lib/zod';

export const authRouter = Router();

const loginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

// Quyền trả trong BODY cho FE ẩn/hiện menu (không nằm trong token). Server luôn tự kiểm quyền ở mỗi route.
// Đăng nhập tài khoản nội bộ (khách sạn / tài xế / admin). Khách đặt phòng không cần đăng nhập.
authRouter.post('/login', strictRateLimit, validate({ body: loginBody }), async (req, res) => {
  const { email, password } = req.valid.body as z.infer<typeof loginBody>;
  const account = (await db.query<AccountDoc>("SELECT * FROM accounts WHERE email = $1 AND type <> 'PASSENGER'", [email.toLowerCase()])).rows[0];
  // Cùng một lỗi cho "không có tài khoản" và "sai mật khẩu" để không lộ email nào tồn tại.
  const ok = account ? await verifyPassword(password, account.passwordHash) : false;
  if (!account || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  // Chủ doanh nghiệp chưa được duyệt: đã qua bước mật khẩu nên báo rõ lý do (không lộ email nào tồn tại).
  const business = account.businessId ? await businessBrief(account.businessId) : undefined;
  if (business && business.status !== 'ACTIVE') {
    const code = { PENDING_APPROVAL: 'BUSINESS_PENDING_APPROVAL', REJECTED: 'BUSINESS_REJECTED', SUSPENDED: 'BUSINESS_SUSPENDED' }[business.status];
    const msg = { PENDING_APPROVAL: 'Hồ sơ doanh nghiệp đang chờ quản trị viên duyệt', REJECTED: 'Hồ sơ doanh nghiệp đã bị từ chối', SUSPENDED: 'Doanh nghiệp đang bị tạm ngưng' }[business.status];
    throw new AppError(403, code, msg);
  }
  if (account.status !== 'ACTIVE') throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  // Đơn vị chi trả tạm ngưng: từ chối ngay (đã qua bước mật khẩu nên không lộ email), tránh cấp token rồi mọi API trả 401.
  if (account.payerId && !(await db.query("SELECT 1 FROM payers WHERE id = $1 AND status = 'ACTIVE'", [account.payerId])).rows[0]) {
    throw new AppError(403, 'PAYER_SUSPENDED', 'Đơn vị chi trả đang bị tạm ngưng');
  }

  const roles = (await db.query<RoleDoc>('SELECT permissions FROM roles WHERE id = ANY($1::uuid[])', [account.roleIds])).rows;
  const permissions = [...new Set(roles.flatMap((r) => r.permissions))];

  // Chủ nhiều khách sạn: token mang khách sạn đang làm việc (mặc định = lần làm việc gần nhất), kèm danh sách để chọn.
  const linked = account.type === 'HOTEL' && !account.businessId ? await linkedHotels(account.id) : [];
  const current = linked.find((h) => h.id === account.hotelId) ?? linked[0];
  const token = signAccountToken({ sub: account.id, accountType: account.type, ...(account.businessId && account.hotelId && { hotelId: account.hotelId }), ...(current && { hotelId: current.id }) });
  res.json({
    token,
    account: { id: account.id, fullName: account.fullName, type: account.type, permissions },
    ...(business && { business, hotels: await hotelBrief(business.id), currentHotelId: account.hotelId ?? null }),
    ...(linked.length > 1 && { hotels: linked, currentHotelId: current!.id }),
  });
});

// Chủ doanh nghiệp đổi khách sạn đang làm việc -> token mới. Khách sạn phải thuộc doanh nghiệp của tài khoản (nếu không 404, chặn IDOR).
// Token cũ vẫn dùng được cho khách sạn của nó (cùng người, khách sạn vẫn được kiểm ở mỗi request); không có danh sách thu hồi token trong hệ thống này.
authRouter.post('/switch-hotel', authenticate, validate({ body: z.object({ hotelId: idParams.shape.id }) }), async (req, res) => {
  const auth = req.auth!;
  if (auth.kind !== 'ACCOUNT' || (!auth.businessId && auth.accountType !== 'HOTEL')) throw new AppError(403, 'FORBIDDEN', 'Chỉ chủ doanh nghiệp hoặc nhân viên khách sạn được chuyển khách sạn');
  const { hotelId } = req.valid.body as { hotelId: string };
  // Chủ doanh nghiệp: khách sạn thuộc doanh nghiệp. Nhân viên: khách sạn được gán qua account_hotels. Khác -> 404 (chặn IDOR).
  const hotel = (await db.query<{ id: string; code: string; name: string; status: string }>(
    auth.businessId
      ? 'SELECT id, code, name, status FROM hotels WHERE id = $1 AND business_id = $2'
      : 'SELECT h.id, h.code, h.name, h.status FROM hotels h JOIN account_hotels ah ON ah.hotel_id = h.id WHERE h.id = $1 AND ah.account_id = $2',
    [hotelId, auth.businessId ?? auth.sub])).rows[0];
  if (!hotel) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  await db.query('UPDATE accounts SET hotel_id = $2, updated_at = now() WHERE id = $1', [auth.sub, hotelId]); // nhớ lần làm việc gần nhất cho lần đăng nhập sau
  forgetAuth(auth.sub);
  res.json({ token: signAccountToken({ sub: auth.sub, accountType: auth.accountType!, hotelId }), hotel, hotels: auth.businessId ? await hotelBrief(auth.businessId) : await linkedHotels(auth.sub) });
});

// `auth` giữ nguyên như cũ; `user` thêm thông tin hiển thị (PASSENGER: username, fullName, permissions rỗng).
authRouter.get('/me', authenticate, async (req, res) => {
  const auth = req.auth!;
  const a = auth.kind === 'ACCOUNT' ? (await db.query<AccountDoc>('SELECT id, type, full_name, username, email, contact_email, phone, preferences FROM accounts WHERE id = $1', [auth.sub])).rows[0] : undefined;
  res.json({
    auth,
    ...(auth.businessId && { business: await businessBrief(auth.businessId), hotels: await hotelBrief(auth.businessId) }),
    ...(auth.kind === 'ACCOUNT' && auth.accountType === 'HOTEL' && !auth.businessId && await linkedHotels(auth.sub).then((h) => (h.length > 1 ? { hotels: h } : {}))),
    ...(a && { user: { id: a.id, type: a.type, fullName: a.fullName, ...(a.username && { username: a.username }), ...(a.email && { email: a.email }), ...(a.contactEmail && { email: a.contactEmail }), ...(a.type !== 'PASSENGER' && { phone: a.phone ?? null }), ...(a.type === 'PASSENGER' && { preferences: a.preferences ?? {} }), permissions: auth.permissions } }),
  });
});

// Tự đổi mật khẩu / hồ sơ của nhân sự (khách có /api/v1/me/*). Khóa theo sub trong token.
// shortcut: không có thu hồi token/phiên (JWT stateless, không token_version) nên token đang dùng ở nơi khác vẫn sống đến khi hết hạn; thêm accounts.password_changed_at + so với iat khi cần.
const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(128) });
authRouter.patch('/password', authenticate, denyPassenger, staffPasswordRateLimit, validate({ body: changePasswordBody }), async (req, res) => {
  const auth = req.auth!;
  if (auth.kind !== 'ACCOUNT') throw new AppError(403, 'FORBIDDEN', 'Không đủ quyền thực hiện thao tác này');
  const { currentPassword, newPassword } = req.valid.body as z.infer<typeof changePasswordBody>;
  const acc = (await db.query<AccountDoc>("SELECT id, password_hash FROM accounts WHERE id = $1 AND type <> 'PASSENGER'", [auth.sub])).rows[0];
  if (!acc) throw new AppError(401, 'ACCOUNT_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị khóa');
  if (!(await verifyPassword(currentPassword, acc.passwordHash))) throw new AppError(400, 'WRONG_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.');
  if (newPassword === currentPassword) throw new AppError(422, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (tx) => {
    await tx.query('UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1', [auth.sub, passwordHash]);
    // Không ghi mật khẩu vào nhật ký.
    await writeAudit({ actor: actorOf(auth), action: 'ACCOUNT.CHANGE_PASSWORD', entity: { type: 'account', id: auth.sub }, requestId: String(req.id) }, tx);
  });
  res.status(204).end();
});

// Email không đổi tự do; chỉ họ tên + SĐT. phone: null = xóa SĐT.
const profileBody = z
  .object({ fullName: z.string().trim().min(2).max(100), phone: z.string().trim().regex(/^\+?[0-9][0-9\s.-]{7,18}$/, 'Số điện thoại không hợp lệ').nullable() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
authRouter.patch('/profile', authenticate, denyPassenger, validate({ body: profileBody }), async (req, res) => {
  const auth = req.auth!;
  if (auth.kind !== 'ACCOUNT') throw new AppError(403, 'FORBIDDEN', 'Không đủ quyền thực hiện thao tác này');
  const p = req.valid.body as z.infer<typeof profileBody>;
  const user = await withTransaction(async (tx) => {
    const row = (
      await tx.query<AccountDoc>(
        "UPDATE accounts SET full_name = COALESCE($2, full_name), phone = CASE WHEN $3::boolean THEN $4 ELSE phone END, updated_at = now() WHERE id = $1 AND type <> 'PASSENGER' RETURNING id, type, email, full_name, phone",
        [auth.sub, p.fullName ?? null, p.phone !== undefined, p.phone ?? null],
      )
    ).rows[0];
    if (!row) throw new AppError(401, 'ACCOUNT_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị khóa');
    await writeAudit({ actor: actorOf(auth), action: 'ACCOUNT.UPDATE_PROFILE', entity: { type: 'account', id: auth.sub }, after: p, requestId: String(req.id) }, tx);
    return row;
  });
  res.json({ user: { id: user.id, type: user.type, email: user.email, fullName: user.fullName, phone: user.phone ?? null } });
});
