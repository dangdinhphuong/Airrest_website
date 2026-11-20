// Đặt phòng NGAY TRONG CHAT. Quy tắc cứng:
// - Chỉ tạo đơn sau khi khách xác nhận rõ ràng ("Xác nhận đặt") trên bản tóm tắt có tổng tiền do BACKEND tính (quoteBooking); "ok/uh/được" không tính.
// - Họ tên/SĐT/email do code thu và kiểm tra, KHÔNG đưa cho AI (các câu hỏi mang slot name/phone/email, naturalize gửi userText rỗng).
// - Mỗi bản tóm tắt có một idempotencyKey: bấm xác nhận hai lần hoặc thử lại sau lỗi mạng không tạo hai đơn.
// - Trả online (SePay): đơn tạo xong mới chuyển sang trang thanh toán backend trả về (như form đặt phòng); trả tại khách sạn thì chỉ báo mã đơn.
// Trạng thái ở mem.bk; điều kiện tìm gần nhất (ngày, số khách) ở mem.search do searchResults ghi.
import { newIdempotencyKey } from '@airrest/api-client';
import { AT_HOTEL_ONLY, PAY_LABEL, bookingFieldError, createBooking, describeApiError, listPaymentMethods, quoteBooking, saveLastBooking } from '../../data/user';
import { money } from '../../lib/time';
import { saveGuest, savePay } from './cart';
import { statusCopy } from './data';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const dmy = (iso) => iso.split('-').reverse().join('/');
const PHONE = /^(?:\+?84|0)\d{9,10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONFIRM = /^\s*xac nhan dat( phong)?\s*[.!]*\s*$/; // đúng cụm này (nút bấm hoặc gõ), không suy diễn từ "ok"
export const BOOK_FREE = ['book.name', 'book.phone', 'book.email']; // bước nhập tự do: không bị ngắt bởi từ khóa luồng khác
const PAY_CHIP = { AT_HOTEL: 'Thanh toán tại khách sạn', SEPAY: 'Thanh toán online qua SePay' };
const goTrack = { label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } };
const openHotel = (b) => ({ label: `Xem ${b.hotel.name}`, act: { type: 'openProperty', id: b.hotel.id } });
const end = (mem, r) => { mem.flow = null; mem.step = null; mem.bk = null; return r; };
const ask = (b, slot, text, chips) => ({ say: 'ask', slot, known: `đặt phòng ${b.room.name} tại ${b.hotel.name}`, text, ...(chips && { chips }) });
// Chỉ chuyển trang tới http(s) (chặn javascript:/data: nếu phản hồi bị sửa).
const safeUrl = (u) => { if (typeof u !== 'string' || !u.trim()) return null; try { const x = new URL(u, typeof window === 'undefined' ? undefined : window.location.origin); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

// h = một nơi nghỉ trong kết quả tìm gần nhất (mem.found), đã có h.room = loại phòng rẻ nhất đủ chỗ.
export async function beginBook(mem, ctx, h) {
  const s = mem.search;
  if (!s?.dates || !s?.party) return { text: 'Bạn tìm nơi nghỉ trước để mình biết ngày và số khách nhé.', chips: ['Tìm & đặt phòng'] };
  if (s.flags?.includes('hourly')) return { text: 'Phòng theo giờ cần chọn giờ vào cụ thể, bạn mở trang khách sạn để chọn giúp mình nhé.', actions: [{ label: `Mở ${h.name}`, act: { type: 'openProperty', id: h.id } }] };
  const b = { hotel: { id: h.id, name: h.name, freeCancel: !!h.freeCancel }, room: { id: h.room.id, name: h.room.name }, dates: s.dates, party: s.party, key: null, busy: false, methods: null, emailDone: false };
  const u = ctx.user; // khách đã đăng nhập: dùng sẵn họ tên/SĐT của tài khoản (vẫn hiện lại ở bản tóm tắt để khách kiểm)
  if (u?.fullName) b.name = String(u.fullName).trim();
  if (u?.phone && PHONE.test(String(u.phone).replace(/[\s.-]/g, ''))) b.phone = String(u.phone).replace(/[\s.-]/g, '');
  mem.flow = 'book'; mem.bk = b;
  return bookStep(mem, `Được nhé, mình đặt giúp bạn ${h.name}. `);
}

async function bookStep(mem, lead = '') {
  const b = mem.bk;
  if (!b.name) { mem.step = 'name'; return ask(b, 'name', `${lead}Cho mình xin họ và tên người đặt nhé?`); }
  if (!b.phone) { mem.step = 'phone'; return ask(b, 'phone', `${lead}Số điện thoại liên hệ của bạn là gì?`); }
  if (!b.emailDone) { mem.step = 'email'; return ask(b, 'email', `${lead}Bạn có muốn để lại email để nhận thông tin đặt phòng không? (không bắt buộc)`, ['Bỏ qua']); }
  if (!b.pay) {
    b.methods ??= await listPaymentMethods().catch(() => AT_HOTEL_ONLY);
    if (b.methods.length === 1) b.pay = b.methods[0].id;
    else { mem.step = 'pay'; return ask(b, 'pay', `${lead}Bạn muốn thanh toán tại khách sạn hay online qua SePay?`, b.methods.map((m) => PAY_CHIP[m.id]).filter(Boolean)); }
  }
  return summary(mem, lead);
}

// Bản tóm tắt gồm tổng tiền do backend tính: khách phải bấm/gõ đúng "Xác nhận đặt" thì mới tạo đơn.
async function summary(mem, lead = '') {
  const b = mem.bk;
  let q;
  try { q = await quoteBooking({ hotelId: b.hotel.id, rooms: [{ roomTypeId: b.room.id, qty: b.party.rooms }], checkIn: b.dates.checkIn, checkOut: b.dates.checkOut }); }
  catch (e) { return end(mem, { text: `${describeApiError(e)} Chưa có đơn nào được tạo.`, chips: ['Tìm lại từ đầu'] }); }
  b.key ??= newIdempotencyKey();
  b.total = q.totalVnd;
  mem.step = 'confirm';
  const fee = q.serviceFeeVnd ? ` + phí dịch vụ ${money(q.serviceFeeVnd)}` : '';
  const text = [
    `${lead}Mình tóm tắt đơn để bạn kiểm tra nhé:`,
    `• Nơi nghỉ: ${b.hotel.name}`,
    `• Phòng: ${b.room.name} × ${b.party.rooms}`,
    `• Nhận phòng ${dmy(b.dates.checkIn)}, trả phòng ${dmy(b.dates.checkOut)} (${q.nights} đêm)`,
    `• Số khách: ${b.party.adults + b.party.children}`,
    `• Người đặt: ${b.name}, SĐT ${b.phone}${b.email ? `, email ${b.email}` : ''}`,
    `• Thanh toán: ${PAY_LABEL[b.pay] ?? b.pay}`,
    `• Tiền phòng ${money(q.roomVnd)}${fee}, tổng ${money(q.totalVnd)}`,
    `• Hủy: ${b.hotel.freeCancel ? 'có thể hủy miễn phí theo chính sách của khách sạn' : 'mức giá này không hoàn hủy'}`,
    `Bạn xác nhận đặt phòng này chứ? Bấm "Xác nhận đặt" thì mình mới tạo đơn${b.pay === 'SEPAY' ? ' và chuyển bạn sang trang thanh toán SePay' : ''}.`,
  ].join('\n');
  return { text, chips: ['Xác nhận đặt', 'Sửa thông tin', 'Dừng'], actions: [openHotel(b)] };
}

export async function bookFlow(text, n, ctx, mem) {
  const b = mem.bk;
  if (!b) return end(mem, null);
  if (/^(dung|thoi|huy bo|thoat)$/.test(n.trim())) return end(mem, { text: 'Mình đã dừng việc đặt phòng, chưa tạo đơn nào. Cần gì bạn cứ nhắn mình nhé.', chips: ['Tìm & đặt phòng'] });
  switch (mem.step) {
    case 'name': {
      const v = text.trim().replace(/\s+/g, ' ');
      if (v.length < 2 || v.length > 80 || /\d{3,}/.test(v)) return ask(b, 'name', 'Mình chưa nhận được họ tên, bạn nhập lại giúp mình nhé (ví dụ: Nguyễn Văn An)?');
      b.name = v; return bookStep(mem);
    }
    case 'phone': {
      const p = text.replace(/[\s.-]/g, '');
      if (!PHONE.test(p)) return ask(b, 'phone', 'Số điện thoại chưa đúng, bạn nhập lại giúp mình nhé (ví dụ: 0912345678)?');
      b.phone = p; return bookStep(mem);
    }
    case 'email': {
      if (/^(bo qua|khong|ko|thoi|khong can)\b/.test(n.trim())) b.emailDone = true;
      else if (EMAIL.test(text.trim())) { b.email = text.trim(); b.emailDone = true; }
      else return ask(b, 'email', 'Email chưa đúng, bạn nhập lại hoặc bấm "Bỏ qua" nhé?', ['Bỏ qua']);
      return bookStep(mem);
    }
    case 'pay': {
      const m = /sepay|online|truc tuyen|chuyen khoan|qr|the\b/.test(n) ? 'SEPAY' : /khach san|tai cho|khi nhan|truc tiep/.test(n) ? 'AT_HOTEL' : null;
      if (!m || !b.methods?.some((x) => x.id === m)) return ask(b, 'pay', 'Bạn chọn giúp mình: thanh toán tại khách sạn hay online qua SePay?', b.methods.map((x) => PAY_CHIP[x.id]).filter(Boolean));
      b.pay = m; return bookStep(mem);
    }
    case 'confirm': {
      if (CONFIRM.test(n)) return placeOrder(mem);
      if (/^(sua|sua thong tin|doi thong tin)$/.test(n.trim())) { Object.assign(b, { name: null, phone: null, email: null, emailDone: false, pay: null, key: null }); return bookStep(mem, 'Được nhé, mình nhập lại thông tin. '); }
      return { text: 'Mình chưa tạo đơn nào nhé. Nếu bạn đồng ý thì bấm "Xác nhận đặt" (hoặc gõ đúng "Xác nhận đặt"); muốn đổi thông tin thì chọn "Sửa thông tin", không đặt nữa thì chọn "Dừng".', chips: ['Xác nhận đặt', 'Sửa thông tin', 'Dừng'] };
    }
    default: return end(mem, null);
  }
}

async function placeOrder(mem) {
  const b = mem.bk;
  if (b.busy) return { text: 'Đơn đang được xử lý, bạn chờ chút nhé.' };
  b.busy = true;
  try {
    const r = await createBooking({
      hotelId: b.hotel.id, rooms: [{ roomTypeId: b.room.id, qty: b.party.rooms }], guests: b.party.adults + b.party.children, children: b.party.children,
      checkIn: b.dates.checkIn, checkOut: b.dates.checkOut, paymentMethod: b.pay, idempotencyKey: b.key,
      guest: { fullName: b.name, phone: b.phone, ...(b.email && { email: b.email }) },
    });
    saveLastBooking(r.code, b.phone); savePay(b.pay); saveGuest({ fullName: b.name, phone: b.phone }); // để trang kết quả thanh toán và form đặt phòng nhận ra khách
    mem.lastOrder = { code: r.code, phone: b.phone };
    const total = r.pricing?.totalVnd ?? b.total;
    const online = r.payment?.method !== 'AT_HOTEL';
    const url = online ? safeUrl(r.paymentLink?.payUrl) : null;
    if (online && url) return end(mem, { text: `Đơn ${r.code} đã được tạo và đang giữ phòng cho bạn. Mình chuyển bạn sang trang thanh toán SePay (tổng ${money(total)}) ngay đây; nếu trang không tự mở, bạn bấm nút bên dưới nhé.`, redirect: url, actions: [{ label: 'Thanh toán ngay', act: { type: 'pay', url } }, goTrack] });
    if (online) return end(mem, { text: `Đơn ${r.code} đã được tạo nhưng mình chưa lấy được link thanh toán. Bạn mở trang theo dõi, nhập mã ${r.code} và số điện thoại để thanh toán nhé.`, actions: [goTrack] });
    return end(mem, { text: `Mình đã tạo đơn ${r.code} cho bạn (trạng thái: ${statusCopy(r.status)}). Bạn thanh toán tại khách sạn khi nhận phòng, và theo dõi đơn bằng mã này cùng số điện thoại vừa nhập nhé.`, actions: [goTrack], chips: ['Theo dõi booking'] });
  } catch (e) {
    if (e.status === 409 && e.code === 'SOLD_OUT') return end(mem, { text: 'Rất tiếc, phòng này vừa hết trong ngày bạn chọn. Chưa có đơn nào được tạo. Mình tìm lại cho bạn nhé?', chips: ['Tìm lại từ đầu'] });
    if (e.code === 'SEPAY_DISABLED') { b.pay = 'AT_HOTEL'; b.methods = AT_HOTEL_ONLY; b.key = null; return summary(mem, 'Cổng thanh toán online đang tạm tắt nên mình chuyển sang thanh toán tại khách sạn. '); }
    const fe = bookingFieldError(e);
    if (fe) return end(mem, { text: `${fe.text} Chưa có đơn nào được tạo, bạn mở trang khách sạn để chỉnh giúp mình nhé.`, actions: [openHotel(b)] });
    if (e.status === 429) return { text: 'Hệ thống đang giới hạn số lần thử. Bạn chờ khoảng một phút rồi bấm "Xác nhận đặt" lại, mình vẫn giữ thông tin của bạn.', chips: ['Xác nhận đặt'] };
    // Lỗi không rõ (mạng...): giữ nguyên idempotencyKey, thử lại không tạo hai đơn.
    return { text: `${describeApiError(e)} Mình chưa chắc đơn đã được tạo hay chưa. Bạn bấm "Xác nhận đặt" lại (mình dùng cùng mã chống trùng nên không tạo hai đơn), hoặc mở trang theo dõi để kiểm tra.`, chips: ['Xác nhận đặt'], actions: [goTrack] };
  } finally { b.busy = false; }
}
