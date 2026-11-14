// Logic thuần của tab "Bảng kê tháng" (đơn vị chi trả).
export const STATUS = { SENT: ['Đã gửi', 'info'], DISPUTED: ['Đang khiếu nại', 'warn'], LOCKED: ['Đã khóa sổ', 'ok'], DRAFT: ['Nháp', 'neutral'] };
export const KIND = { ROOM: 'Tiền phòng', SHUTTLE: 'Xe đưa đón', UPGRADE_DELTA: 'Chênh lệch nâng hạng', ADJUSTMENT: 'Điều chỉnh / truy thu' };

const ERR = {
  STATEMENT_NOT_FOUND: 'Không tìm thấy bảng kê này.',
  STATEMENT_NOT_DISPUTABLE: 'Chỉ khiếu nại được bảng kê đã gửi và chưa khóa sổ.',
  DISPUTE_WINDOW_CLOSED: 'Đã quá hạn khiếu nại của kỳ này.',
};
export const statementErr = (e) => ERR[e?.code] || null;

// Giờ Việt Nam bất kể múi giờ máy người dùng.
export const fmtVN = (v) => (v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—');

// Số ms còn lại tới hạn khiếu nại -> chữ ('Còn 4 ngày 3 giờ'), null nếu không có hạn.
export function fmtRemaining(deadline, now) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  if (!(ms > 0)) return 'Đã hết hạn';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `Còn ${d} ngày ${h} giờ`;
  return h > 0 ? `Còn ${h} giờ ${m % 60} phút` : `Còn ${m} phút`;
}

// Chỉ SENT trong hạn và có quyền manage mới được khiếu nại.
export const canDispute = (s, now, manage) => !!manage && s?.status === 'SENT' && !!s.disputeDeadline && new Date(s.disputeDeadline).getTime() >= now;

// Lý do khiếu nại: 5..1000 ký tự sau khi cắt khoảng trắng (khớp backend).
export function checkReason(v) {
  const t = String(v || '').trim();
  if (t.length < 5 || t.length > 1000) return { ok: false, error: 'Nhập lý do khiếu nại từ 5 đến 1000 ký tự.' };
  return { ok: true, reason: t };
}

// Tổng theo loại từ các dòng (đối chiếu hiển thị; tổng chính thức lấy từ statement.totalVnd).
export function sumByKind(lines) {
  const o = {};
  for (const l of lines || []) o[l.kind] = (o[l.kind] || 0) + (Number(l.amountVnd) || 0);
  return o;
}
