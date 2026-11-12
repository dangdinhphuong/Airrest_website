// Đăng nhập nhân sự (khách sạn / quản trị / lái xe): POST /v1/auth/login. Token chỉ giữ trong bộ nhớ (lib/api.js), không ghi localStorage.
import { api, setAuthToken } from '../lib/api';

export async function loginStaff(email, password) {
  const { token, account } = await api.post('/v1/auth/login', { email, password }, { auth: false });
  setAuthToken(token);
  try {
    const { auth } = await api.get('/v1/auth/me'); // quyền và hotelId luôn mới nhất từ máy chủ
    return { id: account.id, name: account.fullName, type: account.type, permissions: auth.permissions ?? account.permissions, hotelId: auth.hotelId ?? null };
  } catch (e) {
    setAuthToken(null);
    throw e;
  }
}
export const logoutStaff = () => setAuthToken(null);
