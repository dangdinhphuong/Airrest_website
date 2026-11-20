// Đăng nhập nhân sự (khách sạn / quản trị / lái xe): POST /api/v1/auth/login. Token giữ trong sessionStorage (lib/api.js), không ghi localStorage.
import { api, setAuthToken } from '../lib/api';

// Chủ doanh nghiệp có thêm business + hotels[]; nhân viên nhiều khách sạn có hotels[] (danh sách để chọn khách sạn làm việc).
const toSession = (id, name, type, permissions, auth, me) => ({ id, name, type, permissions, hotelId: auth.hotelId ?? null, ...(me.business && { business: me.business }), ...((me.business || me.hotels) && { hotels: me.hotels ?? [] }) });

export async function loginStaff(email, password) {
  const { token, account } = await api.post('/api/v1/auth/login', { email, password }, { auth: false });
  setAuthToken(token);
  try {
    const me = await api.get('/api/v1/auth/me'); // quyền và hotelId luôn mới nhất từ máy chủ
    return toSession(account.id, account.fullName, account.type, me.auth.permissions ?? account.permissions, me.auth, me);
  } catch (e) {
    setAuthToken(null);
    throw e;
  }
}
export const logoutStaff = () => setAuthToken(null);
// Khôi phục phiên nhân sự từ token đang giữ; null nếu token là của khách.
export async function restoreStaff() {
  const me = await api.get('/api/v1/auth/me');
  const { auth, user } = me;
  if (!user || user.type === 'PASSENGER') return null;
  return toSession(user.id, user.fullName, user.type, auth.permissions ?? user.permissions, auth, me);
}
