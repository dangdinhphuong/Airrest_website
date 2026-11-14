// Giỏ phòng của khách (một khách sạn một giỏ) + thông tin khách nhớ trên thiết bị. Hàm thuần, có test ở cart.test.js.
// Dạng giỏ: { hotelId, hotelName, savedAt, lines: [{ roomTypeId, name, qty, price, maxOccupancy }] }; giỏ rỗng có hotelId null.
// Dòng theo giờ (nhà nghỉ) thêm { kind: 'HOURLY', startsAt (ISO), hours }; `price` = giá MỘT phòng cho cả `hours` giờ. Dòng theo đêm KHÔNG có kind (mặc định NIGHT, `price` = giá/đêm).
// Một dòng cho mỗi (loại phòng, kind): cùng loại phòng được đặt cả đêm lẫn giờ trong một đơn.
export const MAX_LINES = 10; // khớp rooms[] tối đa của backend
export const MAX_QTY = 5; // khớp qty tối đa mỗi dòng
export const CART_TTL_MS = 24 * 3600_000; // giỏ cũ hơn thì bỏ (giá và tồn phòng đã đổi)
const CART_KEY = 'airrest.cart';
const GUEST_KEY = 'airrest.guest';

export const emptyCart = () => ({ hotelId: null, hotelName: '', savedAt: 0, lines: [] });
export const kindOf = (l) => l.kind ?? 'NIGHT';
export const isHourly = (l) => kindOf(l) === 'HOURLY';
const same = (l, id, kind) => l.roomTypeId === id && kindOf(l) === kind;
// Theo giờ: tồn từng khung giờ do backend báo (hourly-slots), nên chỉ chặn ở mức tối đa mỗi dòng.
export const maxQty = (room, kind = 'NIGHT') => (kind === 'HOURLY' ? MAX_QTY : Math.min(MAX_QTY, room.availableRooms));
export const qtyOf = (cart, roomTypeId, kind = 'NIGHT') => cart.lines.find((l) => same(l, roomTypeId, kind))?.qty ?? 0;
export const hourlyLineOf = (cart, roomTypeId) => cart.lines.find((l) => same(l, roomTypeId, 'HOURLY'));
export const hourlyPriceOf = (cfg, hours) => cfg.firstHourVnd + (hours - 1) * cfg.nextHourVnd; // giờ đầu + (giờ - 1) × giờ tiếp theo
export const endsAtOf = (startsAt, hours) => new Date(Date.parse(startsAt) + hours * 3600_000).toISOString();
export const totalRooms = (cart) => cart.lines.reduce((s, l) => s + l.qty, 0);
export const totalCapacity = (cart) => cart.lines.reduce((s, l) => s + l.qty * l.maxOccupancy, 0);
export const hasNight = (cart) => cart.lines.some((l) => !isHourly(l));
export const perNight = (cart) => cart.lines.reduce((s, l) => s + (isHourly(l) ? 0 : l.qty * l.price), 0); // chỉ các dòng theo đêm
export const lineTotal = (l, nights) => l.qty * l.price * (isHourly(l) ? 1 : nights);
export const cartTotal = (cart, nights) => cart.lines.reduce((s, l) => s + lineTotal(l, nights), 0);
// Cửa sổ của các dòng theo giờ: giờ vào sớm nhất → giờ ra muộn nhất (null nếu không có dòng giờ).
export const hourlySpan = (cart) => {
  const hs = cart.lines.filter(isHourly);
  return hs.length ? { from: Math.min(...hs.map((l) => Date.parse(l.startsAt))), to: Math.max(...hs.map((l) => Date.parse(l.startsAt) + l.hours * 3600_000)) } : null;
};
export const toApiRooms = (cart) => cart.lines.map((l) => (isHourly(l) ? { roomTypeId: l.roomTypeId, qty: l.qty, kind: 'HOURLY', startsAt: l.startsAt, hours: l.hours } : { roomTypeId: l.roomTypeId, qty: l.qty }));
// 'Standard × 2, Phòng giờ × 1 (3 giờ)': dòng theo giờ ghi rõ số giờ.
export const roomsText = (lines) => lines.map((l) => `${l.roomTypeName ?? l.name} × ${l.qty}${isHourly(l) ? ` (${l.hours} giờ)` : ''}`).join(', ');

// Đặt số lượng một dòng phòng (0 = bỏ dòng). `opt` = { kind: 'HOURLY', startsAt, hours } cho dòng theo giờ (room.hourly = cấu hình giờ của loại phòng).
// Sang khách sạn khác thì bắt đầu giỏ mới. Chặn quá tồn, quá 5 phòng/dòng, quá 10 dòng.
export function setQty(cart, hotel, room, qty, now = Date.now(), opt) {
  const kind = opt?.kind ?? 'NIGHT';
  const base = cart.hotelId === hotel.id ? cart : emptyCart();
  const q = Math.max(0, Math.min(Math.floor(qty), maxQty(room, kind)));
  const rest = base.lines.filter((l) => !same(l, room.id, kind));
  const had = rest.length !== base.lines.length;
  if (!q && !had) return base;
  if (q && !had && rest.length >= MAX_LINES) return base;
  const line = kind === 'HOURLY'
    ? { roomTypeId: room.id, name: room.name, qty: q, price: hourlyPriceOf(room.hourly, opt.hours), maxOccupancy: room.maxOccupancy, kind, startsAt: opt.startsAt, hours: opt.hours }
    : { roomTypeId: room.id, name: room.name, qty: q, price: room.price, maxOccupancy: room.maxOccupancy };
  const lines = q ? (had ? base.lines.map((l) => (same(l, room.id, kind) ? line : l)) : [...base.lines, line]) : rest;
  return lines.length ? { hotelId: hotel.id, hotelName: hotel.name, savedAt: now, lines } : emptyCart();
}
export const changesHotel = (cart, hotel) => cart.lines.length > 0 && cart.hotelId !== hotel.id;

// Khách mặc định: số người ở trên thanh trên, nhưng tối thiểu mỗi phòng một người và không quá sức chứa của giỏ.
export const defaultGuests = (cart, people) => Math.max(1, Math.min(Math.max(people, totalRooms(cart)), totalCapacity(cart) || people));

// Ghi chú cho dòng loại phòng (hiện mờ, không ẩn): hết phòng, hoặc không đủ phòng cho số khách nếu chỉ chọn loại này.
export function roomNote(room, people) {
  if (room.availableRooms <= 0) return 'Hết phòng';
  const need = Math.ceil(people / room.maxOccupancy);
  return need > room.availableRooms ? `Chỉ còn ${room.availableRooms} phòng, bạn cần ${need}` : null;
}

// Loại phòng rẻ nhất còn thêm được 1 phòng (để gợi ý khi khách vượt sức chứa).
export const suggestExtraRoom = (hotel, cart) => hotel.rooms.filter((r) => maxQty(r) > qtyOf(cart, r.id)).sort((a, b) => a.price - b.price)[0] ?? null;

// Đối chiếu giỏ với dữ liệu khách sạn mới tải: bỏ dòng không còn/hết phòng, cắt qty theo tồn, cập nhật giá/sức chứa.
// hotel null (khách sạn không còn) -> giỏ rỗng. dropped = tên các loại phòng đã bỏ.
export function reconcile(cart, hotel, now = Date.now()) {
  if (!cart.lines.length) return { cart, dropped: [] };
  if (!hotel || hotel.id !== cart.hotelId) return { cart: emptyCart(), dropped: cart.lines.map((l) => l.name) };
  const dropped = [];
  const lines = [];
  for (const l of cart.lines) {
    const r = hotel.rooms.find((x) => x.id === l.roomTypeId);
    if (isHourly(l)) { // dòng giờ: bỏ khi loại phòng tắt giờ hoặc giờ vào đã qua; tồn từng khung giờ backend kiểm khi đặt
      if (!r?.hourly || Date.parse(l.startsAt) < now - 5 * 60_000 || l.hours < r.hourly.minHours || l.hours > r.hourly.maxHours) { dropped.push(`${l.name} (theo giờ)`); continue; }
      lines.push({ ...l, name: r.name, qty: Math.min(l.qty, MAX_QTY), price: hourlyPriceOf(r.hourly, l.hours), maxOccupancy: r.maxOccupancy });
      continue;
    }
    if (!r || r.availableRooms <= 0) { dropped.push(l.name); continue; }
    lines.push({ roomTypeId: r.id, name: r.name, qty: Math.min(l.qty, maxQty(r)), price: r.price, maxOccupancy: r.maxOccupancy });
  }
  return { cart: lines.length ? { ...cart, hotelName: hotel.name, lines } : emptyCart(), dropped };
}
// Bỏ các dòng backend báo hết (409 SOLD_OUT details.soldOut[]), giữ phần còn lại.
export function dropSoldOut(cart, soldOut = []) {
  const hit = (l) => soldOut.some((x) => x.roomTypeId === l.roomTypeId && (x.kind ?? 'NIGHT') === kindOf(l));
  const lines = cart.lines.filter((l) => !hit(l));
  return { cart: lines.length ? { ...cart, lines } : emptyCart(), names: cart.lines.filter(hit).map((l) => (isHourly(l) ? `${l.name} (theo giờ)` : l.name)) };
}

const store = (fn) => { try { return fn(window.localStorage); } catch { return null; } }; // localStorage có thể bị chặn
export function loadCart(now = Date.now()) {
  const c = store((s) => JSON.parse(s.getItem(CART_KEY)));
  const ok = c && c.hotelId && Array.isArray(c.lines) && c.lines.length && now - c.savedAt < CART_TTL_MS && c.lines.every((l) => l.roomTypeId && l.qty >= 1 && l.qty <= MAX_QTY && (!isHourly(l) || (l.startsAt && l.hours >= 1)));
  return ok ? c : emptyCart();
}
export const saveCart = (cart) => store((s) => (cart.lines.length ? s.setItem(CART_KEY, JSON.stringify(cart)) : s.removeItem(CART_KEY)));

// Họ tên + SĐT khách đã nhập trên thiết bị này (không lưu email/thanh toán).
export const loadGuest = () => { const g = store((s) => JSON.parse(s.getItem(GUEST_KEY))); return { fullName: typeof g?.fullName === 'string' ? g.fullName : '', phone: typeof g?.phone === 'string' ? g.phone : '' }; };
export const saveGuest = ({ fullName, phone }) => store((s) => s.setItem(GUEST_KEY, JSON.stringify({ fullName, phone })));
