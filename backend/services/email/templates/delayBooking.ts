import { publicWebUrl } from '../../../config/env';

// Mẫu thư luồng khách delay chuyến. CHỈ dùng SAU khi khách sạn xác nhận: offerStatus khác CONFIRMED -> ném lỗi.
export interface EmailContent { subject: string; text: string; html: string }

export interface RoomEmailData {
  guestName: string;
  offerStatus: string; // trạng thái delay_room_offers; phải là CONFIRMED
  bookingCode: string;
  hotel: { name: string; address?: string | null; phone?: string | null };
  roomNumber?: string | null;
  checkInAt: Date;
  checkoutAt: Date; // giờ phải rời khách sạn
  pickup?: { at: Date; location?: string | null }; // xe đón (sân bay -> khách sạn)
  returnTrip?: { at: Date; location?: string | null }; // xe về sân bay
}

export interface GroupRow { guestName: string; status: 'CONFIRMED' | 'PENDING'; hotelName?: string; roomNumber?: string | null; bookingCode?: string }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]!);

const fmt = (d: Date) => new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false });
const COST = 'Chi phí phòng và xe do đơn vị chi trả thanh toán, bạn không phải trả phí.';
const lookupLine = (code: string) => `Tra cứu đơn tại ${publicWebUrl}/tra-cuu?code=${encodeURIComponent(code)} (nhập số điện thoại của người đặt hoặc người trong nhóm).`;

function assertConfirmed(offerStatus: string) {
  if (offerStatus !== 'CONFIRMED') throw new Error(`Không gửi email khi khách sạn chưa xác nhận (trạng thái: ${offerStatus})`);
}

const wrap = (title: string, lines: string[][], extra = '') =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><h2>${esc(title)}</h2><table cellpadding="4">${lines.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>${extra}</div>`;

function roomLines(d: RoomEmailData): string[][] {
  const l: string[][] = [
    ['Mã đơn', d.bookingCode],
    ['Khách sạn', d.hotel.name],
    ...(d.hotel.address ? [['Địa chỉ', d.hotel.address]] : []),
    ...(d.hotel.phone ? [['Điện thoại khách sạn', d.hotel.phone]] : []),
    ...(d.roomNumber ? [['Số phòng', d.roomNumber]] : []),
    ['Nhận phòng', fmt(d.checkInAt)],
    ['Giờ phải rời khách sạn', fmt(d.checkoutAt)],
  ];
  if (d.pickup) l.push(['Xe đón', `${fmt(d.pickup.at)}${d.pickup.location ? ` tại ${d.pickup.location}` : ''}`]);
  if (d.returnTrip) l.push(['Xe về sân bay', `${fmt(d.returnTrip.at)}${d.returnTrip.location ? ` tại ${d.returnTrip.location}` : ''}`]);
  if (d.pickup || d.returnTrip) l.push(['Tài xế', 'Sẽ gửi sau']);
  return l;
}

function roomMail(title: string, intro: string, d: RoomEmailData, subject: string): EmailContent {
  assertConfirmed(d.offerStatus);
  const lines = roomLines(d);
  const text = [`Xin chào ${d.guestName},`, '', intro, '', ...lines.map(([k, v]) => `- ${k}: ${v}`), '', COST, lookupLine(d.bookingCode)].join('\n');
  const html = wrap(title, lines, `<p>Xin chào ${esc(d.guestName)}, ${esc(intro)}</p><p>${esc(COST)}</p><p>${esc(lookupLine(d.bookingCode))}</p>`);
  return { subject, text, html };
}

/** Thư cho người ở phòng: khách sạn đã xác nhận. */
export const roomConfirmedEmail = (d: RoomEmailData): EmailContent =>
  roomMail('Phòng của bạn đã được xác nhận', 'Khách sạn đã xác nhận phòng cho bạn.', d, `Phòng đã xác nhận tại ${d.hotel.name} (mã ${d.bookingCode})`);

/** Thư khi đổi khách sạn/giờ: d là thông tin MỚI (đã CONFIRMED). */
export const roomChangedEmail = (d: RoomEmailData, prev?: { hotelName?: string }): EmailContent =>
  roomMail('Thông tin phòng của bạn đã thay đổi', `Thông tin chỗ ở của bạn đã được cập nhật${prev?.hotelName ? ` (trước đây: ${prev.hotelName})` : ''}. Vui lòng dùng thông tin mới dưới đây.`, d, `Cập nhật phòng: ${d.hotel.name} (mã ${d.bookingCode})`);

/** Thư tổng hợp cho người đại diện. Phải có ít nhất một phòng đã xác nhận; phòng chờ chỉ hiện trạng thái, không lộ chi tiết. */
export function groupSummaryEmail(d: { representativeName: string; groupCode: string; rows: GroupRow[] }): EmailContent {
  const ok = d.rows.filter((r) => r.status === 'CONFIRMED');
  if (!ok.length) throw new Error('Không gửi tổng hợp nhóm khi chưa có phòng nào được khách sạn xác nhận');
  const cell = (r: GroupRow) => (r.status === 'CONFIRMED' ? [r.guestName, 'Đã xác nhận', r.hotelName ?? '', r.roomNumber ?? '', r.bookingCode ?? ''] : [r.guestName, 'Đang chờ khách sạn xác nhận', '', '', '']);
  const rows = d.rows.map(cell);
  const head = ['Khách', 'Trạng thái', 'Khách sạn', 'Phòng', 'Mã đơn'];
  const summary = `${ok.length}/${d.rows.length} phòng đã xác nhận`;
  const text = [`Xin chào ${d.representativeName},`, '', `Tổng hợp nhóm: ${summary}. Thư này được cập nhật khi có thêm phòng xác nhận.`, '', ...rows.map((r) => `- ${r.filter(Boolean).join(' | ')}`), '', COST, lookupLine(d.groupCode)].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><h2>Tổng hợp phòng của nhóm</h2><p>${esc(summary)}</p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table><p>${esc(COST)}</p><p>${esc(lookupLine(d.groupCode))}</p></div>`;
  return { subject: `Tổng hợp phòng của nhóm: ${summary}`, text, html };
}
