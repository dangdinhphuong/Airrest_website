// Khách tra cứu cả nhóm bằng mã nhóm (NH-XXXXXXXX) + SĐT của một người trong nhóm. Sai mã hoặc SĐT -> cùng một 404.
// Chỉ phòng đã CONFIRMED mới lộ khách sạn/số phòng/giờ/mã đơn; không lộ PII người khác (họ tên rút gọn).
import { db } from '../../database/pg';
import { AppError } from '../../lib/errors';

const NOT_FOUND = () => new AppError(404, 'GROUP_NOT_FOUND', 'Không tìm thấy nhóm với thông tin đã nhập');
const STATUS: Record<string, string> = { PENDING: 'WAITING_HOTEL', CONFIRMED: 'CONFIRMED', CANCELLED: 'CANCELLED', REJECTED: 'TRANSFERRING', EXPIRED: 'TRANSFERRING' };

/** "Nguyễn Văn An" -> "Nguyễn V. A." */
export const shortName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  return [first, ...rest.map((w) => `${w[0]!.toUpperCase()}.`)].join(' ');
};

export async function groupLookup(groupCode: string, phone: string) {
  const g = (await db.query<{ id: string; status: string }>(
    `SELECT g.id, g.status FROM delay_groups g WHERE g.code = $1 AND (
       EXISTS (SELECT 1 FROM delay_flight_pax p WHERE p.group_id = g.id AND COALESCE(p.contact_phone, p.phone) = $2)
       OR EXISTS (SELECT 1 FROM delay_room_offers o JOIN bookings b ON b.id = o.booking_id WHERE o.group_id = g.id AND b.guest->>'phone' = $2))`, [groupCode, phone])).rows[0];
  if (!g) throw NOT_FOUND();
  // Bỏ offer đã bị thay thế bởi offer sau (chuyển KS) để mỗi nhóm khách chỉ hiện một dòng.
  const rows = (await db.query<{ status: string; hotelName: string; roomNumbers: string[]; bookingCode: string; stay: { from: Date; to: Date }; members: number; repName: string | null }>(
    `SELECT o.status, h.name AS hotel_name, o.room_numbers, b.code AS booking_code, b.stay, cardinality(o.pax_ids) AS members,
            (SELECT p.full_name FROM delay_flight_pax p WHERE p.id = ANY(o.pax_ids) ORDER BY p.is_representative DESC, p.seq LIMIT 1) AS rep_name
     FROM delay_room_offers o JOIN hotels h ON h.id = o.hotel_id JOIN bookings b ON b.id = o.booking_id
     WHERE o.group_id = $1 AND NOT EXISTS (SELECT 1 FROM delay_room_offers n WHERE n.group_id = o.group_id AND n.seq > o.seq AND n.pax_ids && o.pax_ids)
     ORDER BY o.seq`, [g.id])).rows;
  return {
    groupCode,
    status: g.status,
    rooms: rows.map((r) => {
      const status = g.status === 'FAILED' && STATUS[r.status] === 'TRANSFERRING' ? 'NEEDS_STAFF' : STATUS[r.status] ?? r.status;
      const base = { status, guest: r.repName ? shortName(r.repName) : null, members: r.members };
      return r.status === 'CONFIRMED'
        ? { ...base, hotelName: r.hotelName, roomNumbers: r.roomNumbers, checkInAt: new Date(r.stay.from).toISOString(), checkoutAt: new Date(r.stay.to).toISOString(), bookingCode: r.bookingCode }
        : { ...base, ...(status === 'WAITING_HOTEL' && { message: 'Đang chờ khách sạn xác nhận' }) };
    }),
  };
}
