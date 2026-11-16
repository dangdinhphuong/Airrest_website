// Nhân viên + vai trò RIÊNG của khách sạn (/v1/hotel/*), tách hẳn cổng quản trị.
import { api, describeError } from '../lib/api';

export const listPermissions = () => api.get('/v1/hotel/permissions');
export const listRoles = () => api.get('/v1/hotel/roles');
export const createRole = (body) => api.post('/v1/hotel/roles', body);
export const patchRole = (id, body) => api.patch(`/v1/hotel/roles/${id}`, body);
export const deleteRole = (id) => api.delete(`/v1/hotel/roles/${id}`);
export const listStaff = (query) => api.get('/v1/hotel/staff', { query });
export const createStaff = (body) => api.post('/v1/hotel/staff', body);
export const patchStaff = (id, body) => api.patch(`/v1/hotel/staff/${id}`, body);
export const resetStaffPassword = (id, password) => api.post(`/v1/hotel/staff/${id}/reset-password`, { password });

const list = (a) => (Array.isArray(a) && a.length ? a.join(', ') : 'không rõ');
const VI = {
  ROLE_NAME_TAKEN: 'Tên vai trò đã được dùng trong khách sạn này.',
  PERMISSION_OUT_OF_SCOPE: 'Có quyền không thuộc phạm vi khách sạn.',
  ROLE_SYSTEM_IMMUTABLE: 'Vai trò mẫu của hệ thống không thể sửa hoặc xóa.',
  CANNOT_MODIFY_SELF: 'Bạn không thể tự khóa, tự đổi vai trò hoặc sửa vai trò đang gán cho chính mình.',
  ROLE_NOT_FOUND: 'Không tìm thấy vai trò (có thể đã bị xóa). Hãy tải lại danh sách.',
  EMAIL_EXISTS: 'Email này đã được dùng cho một tài khoản khác.',
  STAFF_NOT_FOUND: 'Không tìm thấy nhân viên (có thể đã bị xóa). Hãy tải lại danh sách.',
  OWNER_PROTECTED: 'Không thể thao tác lên tài khoản chủ.',
};
// Thông báo tiếng Việt theo mã lỗi của /v1/hotel/*; mã khác rơi về describeError.
export function staffErr(e) {
  const d = e?.details && !Array.isArray(e.details) ? e.details : {};
  if (e?.code === 'PERMISSION_ESCALATION') return `Bạn không thể gán hoặc chạm tới quyền mà chính bạn không có: ${list(d.missing)}.`;
  if (e?.code === 'ROLE_IN_USE') return `Vai trò đang được gán cho ${d.accountCount ?? 'một số'} nhân viên. Hãy chuyển họ sang vai trò khác trước khi xóa.`;
  return VI[e?.code] || describeError(e);
}

// Mật khẩu tạm ngẫu nhiên (12+ ký tự, có chữ hoa/thường/số/ký hiệu), cùng dạng admin/kit.tempPassword.
export function tempPassword() {
  const pick = (s, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => s[x % s.length]).join('');
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)}${pick('abcdefghijkmnpqrstuvwxyz', 6)}${pick('23456789', 4)}${pick('!@#$%', 2)}`;
}
