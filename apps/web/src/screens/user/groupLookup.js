// Tra cứu theo mã nhóm NH-XXXXXXXX (luồng khách delay). Đọc kết quả lỏng tay vì shape backend có thể lệch nhẹ.
export const GROUP_RE = /\bNH-[0-9A-Z]{8}\b/i;

// "NH-ABCD1234 0912345678" -> { groupCode, phone } (thiếu phần nào thì null).
export function parseGroupQuery(text) {
  const s = String(text);
  const groupCode = s.match(GROUP_RE)?.[0]?.toUpperCase() ?? null;
  const cand = (groupCode ? s.replace(GROUP_RE, ' ') : s).match(/\+?\d[\d\s.-]{7,}\d/)?.[0] ?? null;
  const n = cand ? cand.replace(/\D/g, '').length : 0;
  return { groupCode, phone: n >= 9 && n <= 15 ? cand : null };
}

const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

// Hợp đồng: { groupCode, status, rooms:[{ status, guest, members, message?, hotelName?, roomNumbers?, checkInAt?, checkoutAt?, bookingCode? }] }.
// Chỉ phòng CONFIRMED mới có thông tin khách sạn/giờ/mã đơn. Giữ fallback nhẹ cho checkOutAt viết hoa.
export const ROOM_STATUS = {
  WAITING_HOTEL: ['Đang chờ khách sạn xác nhận', 'wait'],
  CONFIRMED: ['Đã xác nhận', 'ok'],
  TRANSFERRING: ['Đang tìm khách sạn khác cho bạn', 'wait'],
  NEEDS_STAFF: ['Vui lòng liên hệ nhân viên sân bay', 'bad'],
  CANCELLED: ['Đã hủy', 'bad'],
};

export function normalizeGroup(raw) {
  return {
    code: raw?.groupCode || null,
    status: raw?.status || null,
    rooms: arr(raw?.rooms).map((r, i) => {
      const status = String(r.status || '').toUpperCase();
      const confirmed = status === 'CONFIRMED';
      const [label, tone] = ROOM_STATUS[status] || [r.message || 'Đang chờ khách sạn xác nhận', 'wait'];
      return {
        key: r.bookingCode || i,
        status, confirmed, label, tone,
        needsStaff: status === 'NEEDS_STAFF',
        guest: r.guest || '', members: r.members ?? null,
        hotelName: confirmed ? r.hotelName || '' : '',
        roomNumbers: confirmed ? arr(r.roomNumbers).map(String) : [],
        checkInAt: confirmed ? r.checkInAt || null : null,
        checkOutAt: confirmed ? r.checkoutAt || r.checkOutAt || null : null,
        bookingCode: confirmed ? r.bookingCode || null : null,
      };
    }),
  };
}
