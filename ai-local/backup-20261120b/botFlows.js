// Hội thoại nhiều lượt của trợ lý chat AIRREST. Mỗi luồng là một máy trạng thái nhỏ, trạng thái lưu ở `mem`:
// { flow, step, s (slot của luồng), auth ({ref, phone, digits, full}: kết quả tra booking, chỉ tra 1 lần/phiên vì giới hạn 10 yêu cầu/phút/IP), pend, fails }.
// Mọi hàm trả { text, hotels?, actions?, chips? }; chips = câu trả lời nhanh (bấm là gửi như khách gõ).
// Thao tác ghi (hủy/đổi ngày, đặt xe, gửi ticket) luôn qua bước xác nhận; đặt phòng thì chuyển sang trang Nơi nghỉ (BookingModal) vì cần thanh toán.
import { ATTACH, airportName, bestRoom, createChangeRequest, createShuttle, createTicket, describeApiError, getAirports, listHotels, lookupBookingFull, lookupTicket, quoteCancel, quoteShuttle } from '../../data/user';
import { isoDate, money } from '../../lib/time';
import { detectAirport, norm, parseQuery } from './botEngine';
import { CHIPS, parseTrack, statusCopy } from './data';

const pad2 = (n) => String(n).padStart(2, '0');
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dmy = (iso) => iso.split('-').reverse().join('/');
const SKIP = /\b(bo qua|khong can|khong|sao cung duoc|tuy)\b|^ko$/;
const YES = /\b(xac nhan|dong y|gui|ok|co|yes|duoc)\b/;
const NO = /\b(khong|thoi|huy bo|no|dung)\b/;
const bare = (n) => n.trim().match(/^(\d+(?:[.,]\d+)?)$/)?.[1];

// ---- Hàm thuần (có test) ----
const validDate = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
// 'dd/mm' -> yyyy-mm-dd: năm hiện tại, đã qua thì sang năm sau.
const dm = (d, m, today) => {
  const y = Number(today.slice(0, 4));
  if (!validDate(y, m, d)) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  if (iso >= today) return iso;
  return validDate(y + 1, m, d) ? `${y + 1}-${pad2(m)}-${pad2(d)}` : null;
};
// "20/11 - 22/11", "ngày mai 2 đêm", "hôm nay", "20/11" -> { checkIn, checkOut } (câu đã bỏ dấu); không đọc được thì null.
export function parseDates(n, today) {
  const nights = Number(n.match(/(\d+)\s*dem/)?.[1] ?? 0) || null;
  const r = n.match(/(\d{1,2})\/(\d{1,2})\s*(?:-|den|toi|->)\s*(\d{1,2})\/(\d{1,2})/);
  if (r) { const a = dm(+r[1], +r[2], today); const b = a && dm(+r[3], +r[4], a); return a && b && b > a ? { checkIn: a, checkOut: b } : null; }
  const s = n.match(/(\d{1,2})\/(\d{1,2})/);
  let inn = s ? dm(+s[1], +s[2], today) : /\bhom nay\b/.test(n) ? today : /\bngay kia\b/.test(n) ? addDays(today, 2) : /\b(ngay mai|mai)\b/.test(n) ? addDays(today, 1) : null;
  if (!inn && nights) inn = today;
  return inn ? { checkIn: inn, checkOut: addDays(inn, nights ?? 1) } : null;
}
// "2 người lớn 1 trẻ em 2 phòng", "4 người" -> { adults, children, rooms }; không có số nào thì null. "N người" là tổng gồm cả trẻ em (khớp ô Khách và phòng).
export function parseParty(n) {
  const num = (re) => { const m = n.match(re); return m ? Number(m[1]) : null; };
  const al = num(/(\d+)\s*nguoi lon/);
  const people = al == null ? num(/(\d+)\s*(?:nguoi|khach)/) : null;
  const kids = num(/(\d+)\s*(?:tre|be)\b/);
  const rooms = num(/(\d+)\s*phong/);
  if (al == null && people == null && kids == null && rooms == null) return null;
  const children = Math.min(kids ?? 0, 29);
  const adults = Math.min(al ?? (people != null ? Math.max(1, people - children) : 2), 30 - children);
  return { adults: Math.max(1, adults), children, rooms: Math.min(Math.max(rooms ?? 1, 1), 5) };
}
// "14h30", "9:05", "8 giờ" -> 'HH:mm'; không có giờ thì null.
export function parseTime(n) {
  const m = n.match(/(\d{1,2})\s*(?:h|:|gio)\s*(\d{2})?/);
  if (!m || +m[1] > 23 || +(m[2] ?? 0) > 59) return null;
  return `${pad2(m[1])}:${m[2] ?? '00'}`;
}

// Câu mở đầu nói rõ muốn làm gì thì mới ngắt luồng đang chạy (chip trả lời như "Xe đưa đón" không được kích hoạt).
const STRONG = { cancel: /muon huy|huy (phong|dat|booking|don)|doi ngay|doi lich/, complaint: /khieu nai|phan nan/, shuttle: /dat xe|goi xe/ };
const FREE = new Set(['complaint.desc', 'cancel.note']); // bước nhập văn bản tự do: không ngắt
export const startOf = (n) => Object.entries(STRONG).find(([, re]) => re.test(n))?.[0] ?? null;

// ---- Tra booking dùng chung (cache) ----
export async function getBooking(mem, ref, phone) {
  const R = ref.toUpperCase();
  const digits = phone.replace(/\D/g, '');
  if (mem.auth?.full && mem.auth.ref === R && mem.auth.digits === digits) return mem.auth.full;
  const full = await lookupBookingFull(R, phone);
  mem.auth = { ref: R, phone, digits, full };
  return full;
}
const dirty = (mem) => { if (mem.auth) mem.auth.full = null; }; // sau thao tác ghi: lần sau tra lại
const end = (mem, r) => { mem.flow = null; mem.step = null; mem.s = null; return r; };
const goTrack = { label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } };

// Xin mã + SĐT (gộp qua nhiều lượt); trả { full } khi tra được, hoặc { reply } để gửi khách.
async function authStep(text, mem) {
  const t = parseTrack(text);
  const p = (mem.pend ??= {});
  if (t.ref) p.ref = t.ref.toUpperCase();
  if (t.phone) p.phone = t.phone;
  if (!p.ref || !p.phone) return { reply: { text: `Cho mình xin ${!p.ref ? 'mã booking (dạng AR-XXXXXXXX)' : ''}${!p.ref && !p.phone ? ' và ' : ''}${!p.phone ? 'số điện thoại đã dùng khi đặt' : ''}.` } };
  try { const full = await getBooking(mem, p.ref, p.phone); mem.pend = null; return { full }; } catch (e) {
    if (e.status === 429) return { reply: { text: 'Hệ thống đang giới hạn số lần tra cứu. Bạn chờ khoảng một phút rồi nhắn "thử lại", mình vẫn giữ mã và số điện thoại của bạn.', chips: ['Thử lại'] } };
    mem.pend = null;
    return { reply: { text: e.status === 404 ? 'Mình không tìm thấy booking khớp mã và số điện thoại này. Bạn kiểm tra lại và gửi lại giúp mình nhé.' : describeApiError(e) } };
  }
}

// ---- Luồng tìm / đặt phòng ----
const STEPS = ['airport', 'dates', 'party', 'budget', 'km', 'extras'];
const isDone = (s) => ({ airport: !!s.airport, dates: !!s.dates, party: !!s.party, budget: s.maxPrice != null || !!s.skip.budget, km: s.maxKm != null || !!s.skip.km, extras: !!s.skip.extras });
export const nextStep = (s) => STEPS.find((k) => !isDone(s)[k]) ?? null;
const airportChips = () => ['HAN', 'SGN', 'DAD', 'CXR', 'PQC'].filter((c) => !getAirports().length || getAirports().some((a) => a.iata === c)).map((c) => `${airportName(c)} (${c})`);
const ASK = {
  airport: () => ({ text: 'Bạn cần nơi nghỉ gần sân bay nào?', chips: airportChips() }),
  dates: () => ({ text: 'Bạn nhận phòng và trả phòng ngày nào? (ví dụ: "20/11 - 22/11" hoặc "ngày mai 2 đêm")', chips: ['Hôm nay, 1 đêm', 'Ngày mai, 1 đêm', 'Bỏ qua'] }),
  party: () => ({ text: 'Đi mấy người, mấy phòng? (ví dụ: "2 người lớn 1 trẻ em 1 phòng")', chips: ['1 người', '2 người', '3 người', '4 người, 2 phòng', 'Bỏ qua'] }),
  budget: () => ({ text: 'Ngân sách mỗi đêm khoảng bao nhiêu?', chips: ['Dưới 500k', 'Dưới 1 triệu', 'Dưới 2 triệu', 'Bỏ qua'] }),
  km: () => ({ text: 'Muốn nơi nghỉ cách sân bay tối đa bao nhiêu km?', chips: ['3 km', '5 km', '10 km', 'Bỏ qua'] }),
  extras: () => ({ text: 'Bạn cần thêm gì không? (chọn nhiều cũng được, xong bấm "Tìm ngay")', chips: ['Xe đưa đón', 'Hủy miễn phí', 'Lễ tân 24/24', 'Phòng gia đình', 'Thuê theo giờ', 'Tìm ngay'] }),
};
const newSearch = (seed = {}) => ({ flags: [], skip: {}, ...seed });

// Rút mọi thông tin có trong câu vào slot (kể cả thông tin của bước chưa hỏi), rồi xử lý câu trả lời trần ("2", "700k", "bỏ qua") theo bước đang hỏi.
function absorb(s, text, n, step, airports) {
  const q = parseQuery(text, null, airports);
  if (q.airport) s.airport = q.airport;
  const d = parseDates(n, isoDate(0)); if (d) s.dates = d;
  const p = parseParty(n); if (p) s.party = p;
  if (q.maxPrice != null) s.maxPrice = q.maxPrice;
  if (q.maxKm != null) s.maxKm = q.maxKm;
  q.flags.forEach((f) => { if (!s.flags.includes(f)) s.flags.push(f); });
  const skip = SKIP.test(n);
  const b = bare(n);
  if (step === 'dates' && !s.dates && skip) s.dates = { checkIn: isoDate(0), checkOut: isoDate(1) };
  if (step === 'party' && !s.party) { if (b) s.party = { adults: Math.min(30, Math.max(1, Math.floor(Number(b.replace(',', '.'))))), children: 0, rooms: 1 }; else if (skip) s.party = { adults: 2, children: 0, rooms: 1 }; }
  if (step === 'budget' && s.maxPrice == null) { const m = /\d/.test(n) ? parseQuery(`duoi ${text}`, null, airports).maxPrice : null; if (m != null) s.maxPrice = m; else if (skip) s.skip.budget = true; }
  if (step === 'km' && s.maxKm == null) { if (b) s.maxKm = Number(b.replace(',', '.')); else if (skip) s.skip.km = true; }
  if (step === 'extras' && (skip || /tim ngay|xong|het/.test(n))) s.skip.extras = true;
}

const criteria = (s) => {
  const parts = [];
  if (s.dates) parts.push(`${dmy(s.dates.checkIn)} → ${dmy(s.dates.checkOut)}`);
  if (s.party) parts.push(`${s.party.adults + s.party.children} khách, ${s.party.rooms} phòng`);
  if (s.maxPrice != null) parts.push(`giá dưới ${money(s.maxPrice)}`);
  if (s.maxKm != null) parts.push(`trong ${s.maxKm} km`);
  s.flags.forEach((id) => parts.push(CHIPS.find((c) => c.id === id)?.label.toLowerCase()));
  return parts.length ? ` (${parts.filter(Boolean).join(', ')})` : '';
};
const FLAG_PARAM = { shuttle: { shuttle: true }, freeCancel: { freeCancel: true }, hourly: { hourly: true }, family: { family: true }, open24: { reception24: true }, rating: { minRating: 8 } };

async function searchResults(mem) {
  const s = mem.s;
  const dates = s.dates ?? { checkIn: isoDate(0), checkOut: isoDate(1) };
  const party = s.party ?? { adults: 2, children: 0, rooms: 1 };
  const people = party.adults + party.children;
  const params = { sort: 'distance', guests: people, rooms: party.rooms, maxKm: s.maxKm ?? undefined, maxPrice: s.maxPrice ?? undefined, from: new Date(`${dates.checkIn}T14:00:00+07:00`).toISOString(), to: new Date(`${dates.checkOut}T12:00:00+07:00`).toISOString(), ...Object.assign({}, ...s.flags.map((f) => FLAG_PARAM[f])) };
  let list;
  try { list = await listHotels(s.airport, undefined, params); } catch (e) { return end(mem, { text: describeApiError(e) }); }
  const found = list.map((h) => { const room = bestRoom(h, people, party.rooms); return room && { ...h, room }; }).filter(Boolean);
  const where = airportName(s.airport);
  if (!found.length) {
    mem.step = 'relax';
    const chips = [s.maxPrice != null && 'Bỏ giới hạn giá', s.maxKm != null && 'Bỏ giới hạn km', 'Đổi sân bay', 'Dừng tìm'].filter(Boolean);
    return { text: `Chưa có nơi nghỉ nào gần ${where}${criteria(s)} còn đủ chỗ. Bạn muốn nới điều kiện nào?`, chips };
  }
  const book = (h) => ({ type: 'book', hotelId: h.id, airport: s.airport, party, dates });
  end(mem, null);
  return { text: `Mình tìm được ${found.length} nơi nghỉ gần ${where}${criteria(s)}. Gần sân bay nhất, bấm vào thẻ để chọn phòng và đặt:`, hotels: found.slice(0, 3).map((h) => ({ ...h, act: book(h) })), actions: [{ label: 'Xem tất cả nơi nghỉ', act: { type: 'stays' } }], chips: ['Tìm lại từ đầu'] };
}

// seed: slot đã biết (vd sân bay của chuyến bay chậm); immediate: câu đầu đã có điều kiện lọc nên tìm luôn với mặc định.
export async function beginSearch(mem, text, ctx, { seed, immediate } = {}) {
  mem.flow = 'search'; mem.s = newSearch(seed); mem.step = 'ask';
  if (text) absorb(mem.s, text, norm(text), null, getAirports());
  if (immediate) { Object.assign(mem.s.skip, { budget: true, km: true, extras: true }); mem.s.dates ??= { checkIn: isoDate(0), checkOut: isoDate(1) }; mem.s.party ??= { adults: 2, children: 0, rooms: 1 }; }
  const next = nextStep(mem.s);
  return next ? ASK[next]() : searchResults(mem);
}

async function searchFlow(text, n, ctx, mem) {
  const s = mem.s;
  if (mem.step === 'relax') {
    if (/bo gioi han gia/.test(n)) { s.maxPrice = null; s.skip.budget = true; return searchResults(mem); }
    if (/bo gioi han km/.test(n)) { s.maxKm = null; s.skip.km = true; return searchResults(mem); }
    if (/doi san bay/.test(n)) { s.airport = null; mem.step = 'ask'; return ASK.airport(); }
    if (/dung tim|thoi/.test(n)) return end(mem, { text: 'Mình đã dừng tìm kiếm. Cần gì cứ nhắn mình nhé.' });
    mem.step = 'ask';
  }
  const before = nextStep(s);
  const sig = JSON.stringify(s);
  absorb(s, text, n, before, getAirports());
  const next = nextStep(s);
  if (!next) return searchResults(mem);
  const q = ASK[next]();
  return { ...q, text: `${next === before && sig === JSON.stringify(s) ? 'Mình chưa hiểu rõ ý bạn. ' : ''}${q.text}` };
}

// ---- Luồng hủy / đổi ngày ----
const REASONS = [['CHANGE_OF_PLAN', 'Thay đổi kế hoạch'], ['FLIGHT_CANCELLED', 'Chuyến bay bị hủy'], ['FLIGHT_RESCHEDULED', 'Chuyến bay đổi giờ'], ['HEALTH', 'Sức khỏe'], ['OTHER', 'Lý do khác']];
const reasonOf = (n) => (/chuyen bay.*huy/.test(n) ? 'FLIGHT_CANCELLED' : /chuyen bay.*(doi|tre|hoan|delay)/.test(n) ? 'FLIGHT_RESCHEDULED' : /suc khoe|om dau|benh/.test(n) ? 'HEALTH' : /ke hoach|ban viec|doi y/.test(n) ? 'CHANGE_OF_PLAN' : /\bkhac\b/.test(n) ? 'OTHER' : null);
const TIER = { FREE: 'Hủy miễn phí', PARTIAL: 'Phí một phần', LATE: 'Hủy sát giờ' };
const LIVE = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'];
const RIDE = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
const bookingLine = (b) => `Booking ${b.code} (${b.hotel?.name ?? 'khách sạn'}): ${statusCopy(b.status)}.`;

// Đã có mã + SĐT từ trước thì tra lại (cache hoặc 1 lần gọi) thay vì hỏi khách lại; lỗi thì quên thông tin cũ và hỏi lại.
async function knownBooking(mem) {
  if (!mem.auth) return null;
  try { return await getBooking(mem, mem.auth.ref, mem.auth.phone); } catch { mem.auth = null; return null; }
}
export async function beginCancel(mem) {
  mem.flow = 'cancel'; mem.s = {};
  const full = await knownBooking(mem);
  if (full) return cancelIntro(mem, full.booking);
  mem.step = 'auth';
  return { text: 'Mình sẽ hỗ trợ bạn hủy hoặc đổi ngày. Bạn gửi giúp mình mã booking và số điện thoại đã dùng khi đặt (ví dụ: "AR-7K3M9P2Q 0912345678").' };
}
function cancelIntro(mem, b) {
  if (!LIVE.includes(b.status)) return end(mem, { text: `${bookingLine(b)} Đơn này không còn hủy hoặc đổi được qua yêu cầu. Nếu cần hỗ trợ thêm, bạn có thể gửi khiếu nại.`, chips: ['Gửi khiếu nại'], actions: [goTrack] });
  mem.s.hourly = !!b.lines?.some((l) => l.kind === 'HOURLY');
  mem.step = 'type';
  return { text: `${bookingLine(b)} Bạn muốn hủy đặt phòng${mem.s.hourly ? ' (đơn theo giờ chỉ hủy được, không đổi ngày)' : ' hay đổi ngày'}?`, chips: mem.s.hourly ? ['Hủy đặt phòng'] : ['Hủy đặt phòng', 'Đổi ngày'] };
}
const askReason = () => ({ text: 'Lý do của bạn là gì?', chips: REASONS.map(([, l]) => l) });
async function cancelQuoteStep(mem) {
  const { full, phone } = mem.auth;
  try {
    const q = await quoteCancel(full.booking.code, phone);
    mem.step = 'confirm';
    return { text: `${TIER[q.tier] ?? q.tier}: phí giữ lại ${money(q.keepVnd)}, hoàn lại ${money(q.refundVnd)}.${q.shuttleKeepVnd > 0 ? ` Phí xe đưa đón ${money(q.shuttleKeepVnd)} được giữ lại, không hoàn.` : ''} Yêu cầu hủy sẽ được gửi cho khách sạn duyệt. Bạn xác nhận hủy chứ?`, chips: ['Xác nhận hủy', 'Không hủy nữa'] };
  } catch (e) { return end(mem, { text: describeApiError(e) }); }
}
async function cancelFlow(text, n, mem) {
  const s = mem.s;
  if (mem.step === 'auth') { const a = await authStep(text, mem); return a.reply ?? cancelIntro(mem, a.full.booking); }
  if (mem.step === 'type') {
    if (/doi/.test(n) && s.hourly) return { text: 'Đơn theo giờ chỉ hủy được, không đổi ngày. Bạn muốn hủy chứ?', chips: ['Hủy đặt phòng', 'Không hủy nữa'] };
    if (NO.test(n)) return end(mem, { text: 'Mình giữ nguyên đơn của bạn.' });
    if (/doi/.test(n)) s.type = 'CHANGE'; else if (/huy/.test(n)) s.type = 'CANCEL'; else return { text: 'Bạn muốn hủy đặt phòng hay đổi ngày?', chips: s.hourly ? ['Hủy đặt phòng'] : ['Hủy đặt phòng', 'Đổi ngày'] };
    mem.step = 'reason';
    return askReason();
  }
  if (mem.step === 'reason') {
    const code = reasonOf(n);
    if (!code) return askReason();
    s.reasonCode = code;
    if (code === 'OTHER') { mem.step = 'note'; return { text: 'Bạn ghi giúp mình lý do cụ thể (bắt buộc với lý do khác).' }; }
  } else if (mem.step === 'note') {
    if (text.trim().length < 3) return { text: 'Bạn mô tả lý do ngắn gọn giúp mình nhé.' };
    s.note = text.trim().slice(0, 500);
  }
  if (mem.step === 'reason' || mem.step === 'note') {
    if (s.type === 'CANCEL') return cancelQuoteStep(mem);
    mem.step = 'dates';
    return { text: 'Bạn muốn đổi sang nhận phòng và trả phòng ngày nào? (ví dụ: "20/11 - 22/11" hoặc "20/11 2 đêm")' };
  }
  if (mem.step === 'dates') {
    const d = parseDates(n, isoDate(0));
    if (!d) return { text: 'Mình chưa đọc được ngày. Bạn gửi dạng "20/11 - 22/11" hoặc "20/11 2 đêm" nhé.' };
    s.dates = d; mem.step = 'confirm';
    return { text: `Đổi sang nhận ${dmy(d.checkIn)}, trả ${dmy(d.checkOut)}. Yêu cầu sẽ được gửi cho khách sạn duyệt (nếu hết phòng hoặc chênh giá, khách sạn sẽ phản hồi). Bạn gửi yêu cầu chứ?`, chips: ['Gửi yêu cầu đổi ngày', 'Thôi'] };
  }
  if (mem.step === 'confirm') {
    if (NO.test(n)) return end(mem, { text: 'Mình đã dừng, đơn của bạn vẫn giữ nguyên.' });
    if (!YES.test(n)) return { text: 'Bạn xác nhận gửi yêu cầu chứ?', chips: s.type === 'CANCEL' ? ['Xác nhận hủy', 'Không hủy nữa'] : ['Gửi yêu cầu đổi ngày', 'Thôi'] };
    const { full, phone } = mem.auth;
    const body = { type: s.type, code: full.booking.code, phone, reasonCode: s.reasonCode, ...(s.note && { reasonNote: s.note }), ...(s.type === 'CHANGE' && { newFrom: new Date(`${s.dates.checkIn}T14:00:00+07:00`), newTo: new Date(`${s.dates.checkOut}T12:00:00+07:00`) }) };
    try {
      await createChangeRequest(body);
      dirty(mem);
      return end(mem, { text: 'Đã gửi yêu cầu. Lưu ý: đây là yêu cầu, chưa phải đã hủy/đổi xong. Khách sạn sẽ xem xét và bạn theo dõi kết quả ở trang theo dõi booking.', actions: [goTrack] });
    } catch (e) {
      if (e?.code === 'QUOTE_STALE') return cancelQuoteStep(mem);
      return end(mem, { text: e?.code === 'REQUEST_ALREADY_PENDING' ? 'Đơn này đã có một yêu cầu đang chờ khách sạn duyệt, bạn không cần gửi thêm.' : e?.code === 'BOOKING_NOT_CANCELLABLE' ? 'Đơn này hiện không còn hủy hoặc đổi được.' : describeApiError(e), actions: [goTrack] });
    }
  }
  return end(mem, null);
}

// ---- Luồng xe đưa đón ----
const DIR = { TO_HOTEL: 'Sân bay → khách sạn', TO_AIRPORT: 'Khách sạn → sân bay' };
const dirOf = (n) => {
  const a = n.indexOf('san bay'); const h = n.indexOf('khach san');
  if (a >= 0 && h >= 0) return a < h ? 'TO_HOTEL' : 'TO_AIRPORT';
  if (/ra san bay|toi san bay|di san bay/.test(n)) return 'TO_AIRPORT';
  if (/ve khach san|den khach san|don/.test(n)) return 'TO_HOTEL';
  return null;
};
const shuttleLine = (sh) => `• ${DIR[sh.direction] ?? sh.direction}, ${new Date(sh.pickupAt).toLocaleString('vi-VN', { hour12: false })}: ${{ REQUESTED: 'đã yêu cầu, chờ gán xe', ASSIGNED: 'đã có xe', DONE: 'đã hoàn thành', CANCELLED: 'đã hủy' }[sh.status] ?? sh.status}`;

export async function beginShuttle(mem) {
  mem.flow = 'shuttle'; mem.s = {};
  const full = await knownBooking(mem);
  if (full) return shuttleIntro(mem, full);
  mem.step = 'auth';
  return { text: 'Xe đưa đón gắn với booking của bạn. Bạn gửi giúp mình mã booking và số điện thoại đã dùng khi đặt (ví dụ: "AR-7K3M9P2Q 0912345678").' };
}
function shuttleIntro(mem, full) {
  const b = full.booking;
  if (!RIDE.includes(b.status)) return end(mem, { text: `${bookingLine(b)} Đơn ở trạng thái này chưa đặt được xe đưa đón.`, actions: [goTrack] });
  const list = (full.shuttles ?? []).filter((x) => x.status !== 'CANCELLED');
  mem.step = 'dir';
  const head = list.length ? `${bookingLine(b)}\nXe hiện có:\n${list.map(shuttleLine).join('\n')}\nĐể xem tài xế, biển số và bản đồ, mở trang theo dõi. Bạn muốn đặt thêm xe không?` : `${bookingLine(b)} Đơn chưa có xe. Bạn muốn đặt xe chiều nào?`;
  return { text: head, chips: [...Object.values(DIR), 'Không cần'], actions: list.length ? [goTrack] : undefined };
}
const askAirport = () => ({ text: 'Xe đưa đón ở sân bay nào?', chips: airportChips() });
const shuttleBody = (mem) => { const s = mem.s; return { code: mem.auth.full.booking.code, phone: mem.auth.phone, direction: s.direction, airport: s.airport, pickupAt: new Date(s.pickupAt) }; };
async function shuttleFlow(text, n, ctx, mem) {
  const s = mem.s;
  if (mem.step === 'auth') { const a = await authStep(text, mem); return a.reply ?? shuttleIntro(mem, a.full); }
  if (mem.step === 'dir') {
    if (/khong can|thoi|khong/.test(n) && !dirOf(n)) return end(mem, { text: 'Ok, cần gì thêm bạn cứ nhắn mình nhé.' });
    s.direction = dirOf(n);
    if (!s.direction) return { text: 'Bạn muốn xe chiều nào?', chips: Object.values(DIR) };
    s.airport = detectAirport(text, getAirports(), null);
    mem.step = s.airport ? 'time' : 'airport';
    return s.airport ? askTime() : askAirport();
  }
  if (mem.step === 'airport') {
    s.airport = detectAirport(text, getAirports(), null);
    if (!s.airport) return askAirport();
    mem.step = 'time';
    return askTime();
  }
  if (mem.step === 'time') {
    const t = parseTime(n);
    const d = parseDates(n, isoDate(0))?.checkIn ?? isoDate(0);
    if (!t) return { text: 'Mình chưa đọc được giờ đón. Bạn gửi dạng "14h30 ngày mai" hoặc "9:00 20/11" nhé.' };
    s.pickupAt = `${d}T${t}:00+07:00`;
    if (Date.parse(s.pickupAt) < Date.now() + 30 * 60000) return { text: 'Giờ đón cần ít nhất 30 phút nữa. Bạn chọn giờ khác giúp mình nhé.' };
    try {
      const q = await quoteShuttle(shuttleBody(mem));
      mem.step = 'confirm';
      return { text: `${DIR[s.direction]}, ${airportName(s.airport)}, lúc ${t} ngày ${dmy(d)}: giá dự kiến ${money(q.priceVnd)} cho ${q.distanceKm} km, ${q.passengers ?? ''} khách${q.night ? ' (có phụ phí đêm)' : ''}. Bạn đặt xe chứ?`, chips: ['Đặt xe', 'Thôi'] };
    } catch (e) { return end(mem, { text: describeApiError(e) }); }
  }
  if (mem.step === 'confirm') {
    if (NO.test(n)) return end(mem, { text: 'Mình đã dừng, chưa đặt xe.' });
    if (!/\b(dat|xac nhan|dong y|ok|co)\b/.test(n)) return { text: 'Bạn xác nhận đặt xe chứ?', chips: ['Đặt xe', 'Thôi'] };
    try { await createShuttle(shuttleBody(mem)); dirty(mem); return end(mem, { text: 'Đã gửi yêu cầu xe đưa đón. Khi có xe, bạn xem tài xế và biển số ở trang theo dõi.', actions: [goTrack] }); } catch (e) { return end(mem, { text: describeApiError(e), actions: [goTrack] }); }
  }
  return end(mem, null);
}
const askTime = () => ({ text: 'Giờ đón là mấy giờ, ngày nào? (ví dụ: "14h30 ngày mai" hoặc "9:00 20/11")' });

// ---- Luồng khiếu nại (ticket hỗ trợ, chỉ văn bản) ----
const CATS = ['Phòng không đúng mô tả', 'Vệ sinh', 'Thái độ phục vụ', 'Bị tính sai tiền', 'Xe đưa đón', 'Thanh toán / hoàn tiền', 'Khác'];
const TICKET_STATUS = { OPEN: 'đang mở, chờ tiếp nhận', IN_PROGRESS: 'đang được xử lý', RESOLVED: 'đã giải quyết' };

export function beginComplaint(mem, intro = '') {
  mem.flow = 'complaint'; mem.step = 'cat'; mem.s = mem.auth ? { ref: mem.auth.ref, phone: mem.auth.phone } : {};
  return { text: `${intro}Mình rất tiếc về trải nghiệm này và sẽ ghi nhận để bộ phận hỗ trợ xử lý. Bạn gặp vấn đề gì?`, chips: CATS };
}
const complaintNext = (mem) => {
  const s = mem.s;
  if (!s.ref && !s.noRef) { mem.step = 'ref'; return { text: 'Việc này liên quan booking nào? Gửi mã AR-XXXXXXXX giúp mình.', chips: ['Không liên quan booking'] }; }
  mem.step = 'desc';
  return { text: 'Bạn mô tả cụ thể giúp mình (diễn biến, thời điểm, mong muốn xử lý). Sau khi gửi, bạn sẽ đính kèm được ảnh/video làm bằng chứng. Vui lòng không gửi thông tin giấy tờ tùy thân.' };
};
const complaintSummary = (mem) => {
  const s = mem.s; mem.step = 'confirm';
  return { text: `Mình tóm tắt:\n• Loại: ${s.cat}\n• Booking: ${s.ref ?? 'không liên quan'}\n• Nội dung: ${s.desc}\n• SĐT liên hệ: ${s.phone}\nBạn gửi khiếu nại này chứ?`, chips: ['Gửi khiếu nại', 'Thôi, không gửi'] };
};
async function complaintFlow(text, n, mem) {
  const s = mem.s;
  if (mem.step === 'cat') {
    const hit = CATS.find((c) => n.includes(norm(c)) || norm(c).includes(n.trim()) && n.trim().length > 3);
    if (hit) { s.cat = hit; return complaintNext(mem); }
    if (text.trim().length >= 15) { s.cat = 'Khác'; s.desc = text.trim().slice(0, 1800); return s.phone ? complaintSummary(mem) : askPhone(mem); }
    if (text.trim().length >= 6) { s.cat = 'Khác'; return complaintNext(mem); } // gõ tự do (kể cả sai chính tả): coi là loại "Khác", mô tả chi tiết ở bước sau
    return { text: 'Bạn chọn loại vấn đề giúp mình nhé.', chips: CATS };
  }
  if (mem.step === 'ref') {
    const t = parseTrack(text);
    if (t.ref) { s.ref = t.ref.toUpperCase(); if (t.phone) s.phone = t.phone; } else if (/khong lien quan|khong co|bo qua/.test(n)) s.noRef = true; else return { text: 'Mình chưa thấy mã booking. Bạn gửi dạng AR-XXXXXXXX hoặc chọn "Không liên quan booking".', chips: ['Không liên quan booking'] };
    return complaintNext(mem);
  }
  if (mem.step === 'desc') {
    if (text.trim().length < 10) return { text: 'Bạn mô tả chi tiết hơn một chút giúp mình (ít nhất vài từ) nhé.' };
    s.desc = text.trim().slice(0, 1800);
    return s.phone ? complaintSummary(mem) : askPhone(mem);
  }
  if (mem.step === 'phone') {
    const p = parseTrack(text).phone ?? (/^\d{9,15}$/.test(text.trim()) ? text.trim() : null);
    if (!p) return { text: 'Số điện thoại chưa đúng. Bạn gửi lại giúp mình (9–15 chữ số) nhé.' };
    s.phone = p;
    return complaintSummary(mem);
  }
  if (mem.step === 'confirm') {
    if (NO.test(n)) return end(mem, { text: 'Mình đã hủy, chưa gửi gì cả.' });
    if (!YES.test(n)) return { text: 'Bạn gửi khiếu nại chứ?', chips: ['Gửi khiếu nại', 'Thôi, không gửi'] };
    try {
      const t = await createTicket({ bookingCode: s.ref, phone: s.phone, subject: `[${s.cat}] ${s.desc}`.slice(0, 150), message: s.desc });
      mem.lastTicket = { code: t.code, phone: s.phone }; // để nút "+" trong chat gửi thêm tệp vào đúng ticket này
      return end(mem, { text: `Đã tiếp nhận. Mã ticket của bạn: ${t.code}. Hãy lưu mã này cùng số điện thoại để tra cứu và bổ sung thông tin tại trung tâm hỗ trợ.\nBạn có ảnh/video làm bằng chứng không? Bấm nút bên dưới để chọn tệp. ${ATTACH.hint} Vui lòng không gửi giấy tờ tùy thân.`, attach: { code: t.code, phone: s.phone }, actions: [{ label: 'Mở trung tâm hỗ trợ', act: { type: 'go', screen: 'support' } }] });
    } catch (e) { return end(mem, { text: `Chưa gửi được: ${describeApiError(e)}`, actions: [{ label: 'Mở trung tâm hỗ trợ', act: { type: 'go', screen: 'support' } }] }); }
  }
  return end(mem, null);
}
const askPhone = (mem) => { mem.step = 'phone'; return { text: 'Bạn cho mình số điện thoại để bên hỗ trợ liên hệ nhé.' }; };

// ---- Tra ticket đã gửi ----
export async function beginTicket(mem, code, phone) {
  if (!phone) { mem.flow = 'ticket'; mem.step = 'phone'; mem.s = { code }; return { text: `Bạn gửi giúp mình số điện thoại đã dùng khi tạo ticket ${code}.` }; }
  try {
    const t = await lookupTicket(code, phone);
    mem.lastTicket = { code: t.code, phone };
    return end(mem, { text: `Ticket ${t.code}: ${TICKET_STATUS[t.status] ?? t.status}. Muốn bổ sung thông tin, bạn vào trung tâm hỗ trợ.`, actions: [{ label: 'Mở trung tâm hỗ trợ', act: { type: 'go', screen: 'support' } }] });
  } catch (e) { return end(mem, { text: e.status === 404 ? 'Mình không tìm thấy ticket khớp mã và số điện thoại này.' : describeApiError(e) }); }
}

// Chạy bước tiếp theo của luồng đang mở. Trả null khi khách chuyển sang việc khác (luồng đã đóng, để bộ định tuyến chung xử lý).
export async function runFlow(text, n, ctx, mem) {
  if (!FREE.has(`${mem.flow}.${mem.step}`)) {
    const other = startOf(n);
    if (other && other !== mem.flow) { mem.flow = null; mem.step = null; mem.s = null; return null; }
  }
  switch (mem.flow) {
    case 'search': return searchFlow(text, n, ctx, mem);
    case 'cancel': return cancelFlow(text, n, mem);
    case 'shuttle': return shuttleFlow(text, n, ctx, mem);
    case 'complaint': return complaintFlow(text, n, mem);
    case 'ticket': { const p = parseTrack(text).phone ?? (/^\d{9,15}$/.test(text.trim()) ? text.trim() : null); return p ? beginTicket(mem, mem.s.code, p) : { text: 'Số điện thoại chưa đúng, bạn gửi lại giúp mình nhé.' }; }
    default: return end(mem, null);
  }
}
