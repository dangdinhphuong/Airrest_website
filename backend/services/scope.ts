import { PERM } from '../config/permissions';
import { AppError } from '../lib/errors';
import type { AuthContext } from '../lib/jwt';

// Phạm vi dữ liệu: tài khoản khách sạn CHỈ thấy hotelId của chính nó (lấy từ token, không từ tham số);
// chỉ quyền HOTEL_SCOPE_ALL (Admin) mới xem mọi khách sạn.
export function hotelScope(auth: AuthContext): { hotelId?: string } {
  if (auth.permissions.includes(PERM.HOTEL_SCOPE_ALL)) return {};
  if (!auth.hotelId) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không gắn với khách sạn nào');
  return { hotelId: auth.hotelId };
}
