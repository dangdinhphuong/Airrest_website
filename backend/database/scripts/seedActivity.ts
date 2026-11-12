// Dữ liệu hoạt động mô phỏng (đơn đặt phòng, ticket hỗ trợ, yêu cầu hủy/đổi, xe đưa đón) sinh bằng CHÍNH các dịch vụ nghiệp vụ
// (đảm bảo tồn phòng, trạng thái, audit nhất quán). Tất định; chạy lại bỏ qua nếu đã có (khách mẫu mang SĐT +84900…).
import { ADMIN_ROLES } from '../../config/roles';
import { toE164VN } from '@airrest/utils';
import type { AuthContext } from '../../lib/jwt';
import { db } from '../pg';
import { confirmBooking, rejectBooking } from '../../services/bookings/decisions';
import { createBooking } from '../../services/bookings/bookings.service';
import { approveRequest, createChangeRequest, rejectRequest } from '../../services/changeRequests/changeRequests.service';
import { assignShuttle, createShuttleRequest } from '../../services/shuttle/shuttle.service';
import { createTicket } from '../../services/support/support.service';

const SURNAME = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Quốc', 'Ngọc', 'Hữu', 'Thanh', 'Gia', 'Anh', 'Đức'];
const GIVEN = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hiếu', 'Hoa', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nhung', 'Phong', 'Quân', 'Sơn', 'Thảo', 'Trang', 'Tuấn', 'Vy', 'Yến'];
const SUBJECTS = ['Hỏi về giờ nhận phòng muộn', 'Chuyến bay bị hoãn, cần đổi ngày', 'Chưa nhận được xác nhận đặt phòng', 'Cần hóa đơn cho đơn đặt phòng', 'Xe đưa đón chưa thấy tài xế liên hệ', 'Hỏi về chính sách hoàn tiền', 'Đổi số điện thoại liên hệ', 'Phòng không đúng mô tả'];
const BODIES = ['Mình cần hỗ trợ gấp vì chuyến bay đã thay đổi giờ, nhờ bạn kiểm tra giúp.', 'Xin hỗ trợ kiểm tra tình trạng đơn của mình và phản hồi sớm.', 'Mình đến muộn hơn dự kiến khoảng 3 tiếng, khách sạn có giữ phòng không?', 'Nhờ bạn gửi lại thông tin xác nhận và điều kiện hủy phòng.'];

// Bộ sinh số giả ngẫu nhiên tất định.
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

export async function seedActivity(): Promise<string> {
  const have = (await db.query<{ n: string }>("SELECT count(*)::text AS n FROM bookings WHERE guest->>'phone' LIKE '+84900%'")).rows[0]!.n;
  if (Number(have) >= 60) return `bỏ qua (đã có ${have} đơn mẫu)`;
  const admin = (await db.query<{ id: string }>("SELECT id FROM accounts WHERE email = 'quantri@airrest.mo'")).rows[0];
  if (!admin) throw new Error('Thiếu tài khoản quantri@airrest.mo: chạy seedCatalog trước');
  const auth: AuthContext = { kind: 'ACCOUNT', sub: admin.id, accountType: 'ADMIN', permissions: ADMIN_ROLES.SYSADMIN.permissions };
  const rooms = (await db.query<{ hotelId: string; rid: string; airports: Array<{ iata: string }> }>(
    `SELECT h.id AS hotel_id, r.id AS rid, h.airports FROM hotels h JOIN room_types r ON r.hotel_id = h.id
     WHERE h.status = 'ACTIVE' AND r.active AND r.total_rooms > 1 AND h.code ~ '^[A-Z]{3}-[0-9]{2}$' ORDER BY h.seq, r.name`)).rows;
  const rand = rng(20261112);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;
  const name = () => `${pick(SURNAME)} ${pick(MIDDLE)} ${pick(GIVEN)}`;
  const day = 86_400_000;
  const stats = { booking: 0, confirmed: 0, rejected: 0, ticket: 0, change: 0, shuttle: 0, fail: 0 };
  const made: Array<{ code: string; phone: string; id: string; hotelId: string; iata: string; status: string; from: Date }> = [];

  for (let i = 0; i < 160; i++) {
    const room = pick(rooms);
    const from = new Date(Math.max(Date.now() + 40 * 60_000, new Date(`${new Date(Date.now() + Math.floor(rand() * 45) * day).toISOString().slice(0, 10)}T14:00:00+07:00`).getTime()));
    const to = new Date(from.getTime() + (1 + Math.floor(rand() * 3)) * day);
    const phone = toE164VN(`0900${String(100000 + i).slice(-6)}`)!; // chuẩn hóa như API (createBooking nhận dữ liệu đã qua zod)
    try {
      let b = await createBooking({ hotelId: room.hotelId, roomTypeId: room.rid, qty: 1, paymentMethod: 'AT_HOTEL', from, to, guest: { fullName: name(), phone, email: i % 3 ? undefined : `khach${i}@example.com` } } as never);
      stats.booking++;
      if (b.status === 'PENDING') {
        const roll = i % 10;
        if (roll < 6) { b = await confirmBooking(auth, b.id); stats.confirmed++; }
        else if (roll === 6) { await rejectBooking(auth, b.id, { reason: 'Khách sạn hết phòng đúng loại, xin lỗi vì sự bất tiện' }); stats.rejected++; continue; }
      }
      made.push({ code: b.code, phone, id: b.id, hotelId: room.hotelId, iata: room.airports[0]!.iata, status: b.status, from });
    } catch { stats.fail++; }
  }

  for (let i = 0; i < 40; i++) {
    const b = made[i % made.length]!;
    try {
      await createTicket({ ...(i % 5 < 3 && { bookingCode: b.code }), phone: b.phone, fullName: name(), subject: pick(SUBJECTS), message: pick(BODIES) } as never);
      stats.ticket++;
    } catch { stats.fail++; }
  }

  const live = made.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status));
  for (let i = 0; i < Math.min(24, live.length); i++) {
    const b = live[i]!;
    try {
      const body = i % 3 === 0
        ? { type: 'CHANGE', code: b.code, phone: b.phone, reasonCode: 'FLIGHT_RESCHEDULED', newFrom: new Date(b.from.getTime() + day), newTo: new Date(b.from.getTime() + 2 * day) }
        : { type: 'CANCEL', code: b.code, phone: b.phone, reasonCode: pick(['CHANGE_OF_PLAN', 'FLIGHT_CANCELLED', 'HEALTH'] as const) };
      const cr = await createChangeRequest(body as never);
      stats.change++;
      if (i % 4 === 1) await approveRequest(auth, cr.id, 'Đồng ý theo chính sách của khách sạn');
      else if (i % 4 === 2) await rejectRequest(auth, cr.id, 'Không đủ điều kiện theo chính sách hiện hành');
    } catch { stats.fail++; }
  }

  const confirmed = made.filter((b) => b.status === 'CONFIRMED' || b.status === 'PENDING').slice(30, 70);
  for (let i = 0; i < confirmed.length; i++) {
    const b = confirmed[i]!;
    try {
      const s = await createShuttleRequest({ code: b.code, phone: b.phone, direction: 'TO_HOTEL', airport: b.iata, pickupAt: new Date(b.from.getTime() + 3_600_000) } as never);
      stats.shuttle++;
      if (i % 2 === 0) await assignShuttle(auth, s.id, { driverName: `${pick(SURNAME)} ${pick(GIVEN)}`, driverPhone: `091${String(2000000 + i * 137).slice(-7)}` } as never);
    } catch { stats.fail++; }
  }
  return `đơn ${stats.booking} (xác nhận ${stats.confirmed}, từ chối ${stats.rejected}), ticket ${stats.ticket}, hủy/đổi ${stats.change}, xe ${stats.shuttle}, lỗi bỏ qua ${stats.fail}`;
}
