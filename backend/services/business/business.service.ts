import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HOTEL_OWNER_ROLE } from '../../config/roles';
import { db, withTransaction } from '../../database/pg';
import type { BusinessDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { writeAudit } from '../audit';

// Đăng ký doanh nghiệp công khai: hồ sơ PENDING_APPROVAL + tài khoản chủ INVITED (chưa đăng nhập được tới khi admin duyệt).
export const registerBody = z.object({
  name: z.string().trim().min(2).max(200),
  taxCode: z.string().trim().min(5).max(30).regex(/^[0-9A-Za-z./-]+$/, 'Mã số thuế/giấy phép không hợp lệ'),
  representative: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s.-]{7,18}$/, 'Số điện thoại không hợp lệ'),
  password: z.string().min(12).max(128),
  website: z.string().max(200).optional(), // honeypot: người thật không thấy ô này; bot điền -> bỏ qua âm thầm
});

export const RECEIVED = { status: 'RECEIVED', message: 'Đã tiếp nhận hồ sơ. Quản trị viên sẽ xem xét và thông báo qua email; bạn chưa đăng nhập được tới khi hồ sơ được duyệt.' };

export async function registerBusiness(b: z.infer<typeof registerBody>, requestId: string) {
  // Luôn băm mật khẩu và trả cùng một phản hồi dù email/mã số thuế đã tồn tại -> không dò được email nào đã đăng ký.
  const passwordHash = await hashPassword(b.password);
  if (b.website) return RECEIVED;
  const role = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = $1 AND scope = 'SYSTEM' AND hotel_id IS NULL", [HOTEL_OWNER_ROLE.key])).rows[0];
  if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', 'Chưa có vai trò chủ khách sạn (chạy npm run db:seed)');
  const id = randomUUID();
  const email = b.email.toLowerCase();
  try {
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO businesses (id, name, tax_code, representative, email, phone, status) VALUES ($1,$2,$3,$4,$5,$6,'PENDING_APPROVAL')`,
        [id, b.name, b.taxCode, b.representative, email, b.phone],
      );
      await tx.query(
        `INSERT INTO accounts (id, type, email, password_hash, full_name, status, role_ids, is_owner, business_id, phone) VALUES ($1,'HOTEL',$2,$3,$4,'INVITED',$5::uuid[],true,$1,$6)`,
        [id, email, passwordHash, b.representative, [role.id], b.phone],
      );
      await writeAudit({ actor: { type: 'GUEST' }, action: 'BUSINESS.REGISTER', entity: { type: 'business', id }, after: { name: b.name, taxCode: b.taxCode, email }, requestId }, tx);
    });
  } catch (e) {
    if (!isDuplicateKey(e)) throw e; // email hoặc mã số thuế đã có: không báo khác biệt
  }
  return RECEIVED;
}

export const hotelBrief = async (businessId: string) =>
  (await db.query<{ id: string; code: string; name: string; status: string }>('SELECT id, code, name, status FROM hotels WHERE business_id = $1 ORDER BY seq', [businessId])).rows;

export const businessBrief = async (businessId: string) =>
  (await db.query<Pick<BusinessDoc, 'id' | 'name' | 'status'>>('SELECT id, name, status FROM businesses WHERE id = $1', [businessId])).rows[0];
