// Logic thuần của tab "Đơn vị chi trả" và "Bảng kê & chi trả" (cổng quản trị). Kiểm tra khớp zod của backend.
export const PAYER_KIND = { AIRLINE: 'Hãng hàng không', GROUND_HANDLER: 'Đơn vị mặt đất', AIRPORT: 'Sân bay' };
export const PAYER_STATUS = { ACTIVE: ['Đang hoạt động', 'ok'], SUSPENDED: ['Tạm ngưng', 'error'] };
export const STMT_STATUS = { DRAFT: ['Nháp', 'neutral'], SENT: ['Đã gửi', 'info'], DISPUTED: ['Đang khiếu nại', 'warn'], LOCKED: ['Đã khóa sổ', 'ok'] };
export const PAYOUT_STATUS = { DRAFT: ['Nháp', 'neutral'], LOCKED: ['Đã khóa', 'info'], PAID: ['Đã trả', 'ok'] };
export const MAX_ADJUSTMENT_VND = 1_000_000_000; // backend chặn theo MAX_ADJUSTMENT_VND; lỗi chi tiết vẫn lấy từ máy chủ

const ERR = {
  PAYER_SUSPENDED: 'Đơn vị chi trả đang bị tạm ngưng.',
  PAYER_NOT_FOUND: 'Không tìm thấy đơn vị chi trả.',
  STATEMENT_NOT_FOUND: 'Không tìm thấy bảng kê (có thể đã bị xóa). Hãy tải lại danh sách.',
  PAYOUT_NOT_DRAFT: 'Chỉ khóa được bảng chi trả đang nháp.',
  PAYOUT_NOT_LOCKED: 'Chỉ ghi nhận đã trả cho bảng chi trả đã khóa.',
  PAYOUT_NOT_PAYABLE: 'Số tiền phải trả khách sạn không dương: bù trừ sang kỳ sau hoặc thu hồi riêng.',
  IDEMPOTENCY_KEY_REUSED: 'Yêu cầu trùng khóa nhưng khác nội dung. Hãy thử lại.',
};
// Trả chữ tiếng Việt cho mã lỗi đã biết, null nếu để lớp chung xử lý (đã hiện message của máy chủ).
export const settleErr = (e) => ERR[e?.code] || null;

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const checkPeriod = (v) => (PERIOD_RE.test(String(v || '').trim()) ? { ok: true, period: String(v).trim() } : { ok: false, error: "Kỳ phải có dạng 'YYYY-MM' (ví dụ 2026-11)." });
// Kỳ tháng hiện tại và tháng trước theo giờ Việt Nam (gợi ý mặc định ô kỳ).
export function lastPeriod(now = Date.now()) {
  const d = new Date(now + 7 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Nút theo trạng thái + quyền. Khóa/mở lại/ghi nhận trả cần quyền tài chính (payment:manage); tạo/gửi/điều chỉnh cần payer:manage.
export const stmtActions = (s, { manage, finance }) => ({
  generate: !!manage && s?.status !== 'LOCKED',
  send: !!manage && s?.status === 'DRAFT',
  lock: !!finance && (s?.status === 'SENT' || s?.status === 'DISPUTED'),
  reopen: !!finance && s?.status === 'LOCKED',
});
export const payoutActions = (p, { manage, finance }) => ({
  lock: !!finance && p?.status === 'DRAFT',
  paid: !!finance && p?.status === 'LOCKED' && Number(p.netVnd) > 0,
  adjust: !!manage,
});

// Điều chỉnh: số nguyên khác 0, |x| <= tối đa, ghi chú 3..300.
export function checkAdjustment({ amount, memo }) {
  const n = Number(String(amount ?? '').replace(/[\s.,]/g, ''));
  if (!/^-?\d+$/.test(String(amount ?? '').trim().replace(/[\s.,]/g, '')) || !Number.isSafeInteger(n) || n === 0) return { ok: false, error: 'Số tiền phải là số nguyên khác 0 (âm = truy thu).' };
  if (Math.abs(n) > MAX_ADJUSTMENT_VND) return { ok: false, error: `Tối đa ${MAX_ADJUSTMENT_VND.toLocaleString('vi-VN')} VND mỗi lần.` };
  const m = String(memo || '').trim();
  if (m.length < 3 || m.length > 300) return { ok: false, error: 'Ghi chú cần từ 3 đến 300 ký tự.' };
  return { ok: true, amountVnd: n, memo: m };
}

// Form tạo đơn vị chi trả -> body khớp payerCreateBody (bỏ field rỗng).
export function checkPayerForm(f) {
  const code = String(f.code || '').trim().toUpperCase();
  const name = String(f.name || '').trim();
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) return { ok: false, error: 'Mã gồm 2-20 ký tự A-Z, 0-9, _ hoặc -.' };
  if (name.length < 2 || name.length > 200) return { ok: false, error: 'Tên cần từ 2 đến 200 ký tự.' };
  if (!PAYER_KIND[f.kind]) return { ok: false, error: 'Chọn loại đơn vị.' };
  const email = String(f.email || '').trim(); const cname = String(f.contactName || '').trim(); const phone = String(f.phone || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Email liên hệ không hợp lệ.' };
  const contact = { ...(cname && { name: cname }), ...(phone && { phone }), ...(email && { email }) };
  return { ok: true, body: { code, name, kind: f.kind, sharedRoomPolicy: f.sharedRoomPolicy || 'PRIVATE', allowUpgrade: !!f.allowUpgrade, ...(Object.keys(contact).length && { contact }) } };
}

export function checkStaffForm(f) {
  const email = String(f.email || '').trim(); const fullName = String(f.fullName || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Email không hợp lệ.' };
  if (fullName.length < 2 || fullName.length > 100) return { ok: false, error: 'Họ tên cần từ 2 đến 100 ký tự.' };
  if (String(f.password || '').length < 12) return { ok: false, error: 'Mật khẩu tối thiểu 12 ký tự.' };
  return { ok: true, body: { email, fullName, password: f.password, ...(f.stationId && { stationId: f.stationId }) } };
}

export const checkRef = (v) => { const t = String(v || '').trim(); return t.length >= 3 && t.length <= 200 ? { ok: true, ref: t } : { ok: false, error: 'Mã tham chiếu chuyển khoản cần từ 3 đến 200 ký tự.' }; };
