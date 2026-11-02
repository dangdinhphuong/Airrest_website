// Ma trận quyền ĐỀ XUẤT (gói SRS hotel-admin, 01_ACTORS_AND_CAPABILITY_MAP.md mục 3). Chưa được PO/Security duyệt (OQ-55).
// Hành động: C tạo, R đọc, U sửa, S gửi duyệt, A duyệt/từ chối, X hủy/vô hiệu, E xuất, M quản lý người dùng/quyền, V xem trường nhạy cảm.
// Deny by default: tài nguyên/vai trò không có trong bảng = không có quyền.
export const ROLE_META = {
  admin: { label: 'Quản trị hệ thống', act: 'ACT-07', area: 'admin', airrest: true },
  ops: { label: 'Nhân viên vận hành', act: 'ACT-08', area: 'admin', airrest: true },
  support: { label: 'Nhân viên hỗ trợ', act: 'ACT-09', area: 'admin', airrest: true },
  finance: { label: 'Nhân viên tài chính', act: 'ACT-10', area: 'admin', airrest: true },
  auditor: { label: 'Kiểm toán (chỉ đọc)', act: 'ACT-11', area: 'admin', airrest: true },
  manager: { label: 'Chủ/quản lý khách sạn', act: 'ACT-12', area: 'hotel', airrest: false },
  staff: { label: 'Nhân viên khách sạn', act: 'ACT-13', area: 'hotel', airrest: false },
  driver: { label: 'Lái xe', act: 'ACT-14', area: 'hotel', airrest: false },
};
export const ROLE_ORDER = ['admin', 'ops', 'support', 'finance', 'auditor', 'manager', 'staff', 'driver'];
export const RESOURCES = {
  partner: 'Hồ sơ đối tác', document: 'Tài liệu xác minh', roomtype: 'Loại phòng và sức chứa', rate: 'Giá và chính sách', inventory: 'Tồn phòng',
  booking: 'Đặt phòng', stay: 'Nhận/trả phòng, vận hành', settlement: 'Đối soát, thanh toán', quality: 'Chất lượng đối tác, sự cố', account: 'Tài khoản người dùng',
  rolepolicy: 'Vai trò và quyền', config: 'Cấu hình và danh mục', approval: 'Phê duyệt thay đổi', audit: 'Audit log', case: 'Ca hỗ trợ/khiếu nại', report: 'Báo cáo',
  integration: 'Cấu hình tích hợp', pickup: 'Yêu cầu đón khách', sensitive: 'Trường nhạy cảm',
};
export const PERMS = {
  partner: { admin: 'RUAX', ops: 'RAX', support: 'R', finance: 'R', auditor: 'R', manager: 'CRUS', staff: 'RU' },
  document: { admin: 'RA', ops: 'RA', auditor: 'R', manager: 'CR' },
  roomtype: { admin: 'R', ops: 'R', support: 'R', finance: 'R', auditor: 'R', manager: 'CRUX', staff: 'R' },
  rate: { admin: 'RU', ops: 'R', support: 'R', finance: 'R', auditor: 'R', manager: 'CRU', staff: 'R' },
  inventory: { admin: 'R', ops: 'RU', support: 'R', auditor: 'R', manager: 'RU', staff: 'RU' },
  booking: { admin: 'R', ops: 'R', support: 'R', finance: 'R', auditor: 'R', manager: 'RA', staff: 'RA', driver: 'R' },
  stay: { ops: 'R', auditor: 'R', manager: 'RU', staff: 'RU' },
  settlement: { admin: 'R', finance: 'RUEV', auditor: 'R', manager: 'R' },
  quality: { admin: 'R', ops: 'CRU', support: 'CR', auditor: 'R', manager: 'RC' },
  account: { admin: 'CRUXM', ops: 'R', support: 'R', auditor: 'R', manager: 'CRUXM' },
  rolepolicy: { admin: 'RUM', auditor: 'R' },
  config: { admin: 'RUS', ops: 'RUS', support: 'R', auditor: 'R' },
  approval: { admin: 'A', ops: 'A', auditor: 'R' },
  audit: { admin: 'R', ops: 'R', auditor: 'R', manager: 'R' },
  case: { admin: 'R', ops: 'RU', support: 'CRU', auditor: 'R', manager: 'CR' },
  report: { admin: 'RE', ops: 'RE', support: 'R', finance: 'RE', auditor: 'R', manager: 'RE' },
  integration: { admin: 'RUM', ops: 'R', auditor: 'R' },
  pickup: { admin: 'R', ops: 'R', support: 'R', auditor: 'R', manager: 'R', driver: 'RU' },
  sensitive: { admin: 'V', ops: 'V', support: 'V', finance: 'V', manager: 'V' },
};
export const can = (role, resource, action) => !!role && (PERMS[resource]?.[role] || '').includes(action);
export const permSummary = (role, resource) => (PERMS[resource]?.[role] || '').split('').join(' ') || '—';
// Vai trò mà một vai trò được phép cấp/gán (không vượt quyền người gán — SA-BR-002).
export const GRANTABLE = { admin: ['ops', 'support', 'finance', 'auditor', 'manager', 'staff', 'driver'], manager: ['staff', 'driver'] };
// Kiểm tra quyền "phía máy chủ": deny by default, ràng buộc tenant với vai trò khách sạn (SA-FR-008, SA-FR-009).
export function authorize(session, resource, action, tenantId) {
  if (!session) return { ok: false, status: 401, reason: 'Chưa đăng nhập' };
  if (!can(session.role, resource, action)) return { ok: false, status: 403, reason: `Vai trò ${ROLE_META[session.role]?.label || session.role} không có quyền ${action} trên “${RESOURCES[resource] || resource}”` };
  if (!ROLE_META[session.role]?.airrest && tenantId && session.tenantId !== tenantId) return { ok: false, status: 403, reason: 'Dữ liệu thuộc tenant khác (cách ly tenant)' };
  return { ok: true, status: 200 };
}
