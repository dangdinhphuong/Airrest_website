import { Router } from 'express';
import { z } from 'zod';
import { col } from '../../db/collections';
import { AppError } from '../../lib/errors';
import { signAccountToken } from '../../lib/jwt';
import { verifyPassword } from '../../lib/password';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';

export const authRouter = Router();

const loginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

// Quyền trả trong BODY cho FE ẩn/hiện menu (không nằm trong token). Server luôn tự kiểm quyền ở mỗi route.
// Đăng nhập tài khoản nội bộ (khách sạn / tài xế / admin). Khách đặt phòng không cần đăng nhập.
authRouter.post('/login', strictRateLimit, validate({ body: loginBody }), async (req, res) => {
  const { email, password } = req.valid.body as z.infer<typeof loginBody>;
  const account = await col.accounts().findOne({ email: email.toLowerCase() });
  // Cùng một lỗi cho "không có tài khoản" và "sai mật khẩu" để không lộ email nào tồn tại.
  const ok = account ? await verifyPassword(password, account.passwordHash) : false;
  if (!account || !ok || account.status !== 'ACTIVE') {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  }

  const roles = await col.roles().find({ _id: { $in: account.roleIds } }).toArray();
  const permissions = [...new Set(roles.flatMap((r) => r.permissions))];

  const token = signAccountToken({
    sub: account._id.toHexString(),
    accountType: account.type,
  });
  res.json({ token, account: { id: account._id, fullName: account.fullName, type: account.type, permissions } });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ auth: req.auth });
});
