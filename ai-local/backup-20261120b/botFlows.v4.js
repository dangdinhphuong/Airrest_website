// Hội thoại nhiều lượt của trợ lý chat AIRREST. Mỗi luồng là một máy trạng thái nhỏ, trạng thái lưu ở `mem`:
// { flow, step, s (slot của luồng), auth ({ref, phone, digits, full}: kết quả tra booking, chỉ tra 1 lần/phiên vì giới hạn 10 yêu cầu/phút/IP), pend, fails }.
// Mọi hàm trả { text, hotels?, actions?, chips? }; chips = câu trả lời nhanh (bấm là gửi như khách gõ).
// Thao tác ghi (hủy/đổi ngày, đặt xe, gửi ticket) luôn qua bước xác nhận; đặt phòng thì chuyển sang trang Nơi nghỉ (BookingModal) vì cần thanh toán.
import { ATTACH, airportName, bestRoom, createChangeRequest, createShuttle, createTicket, describeApiError, getAirports, listHotels, lookupBookingFull, lookupTicket, quoteCancel, quoteShuttle } from '../../data/user';
import { isoDate, money } from '../../lib/time';
import { detectAirport, norm, parseQuery } from './botEngine';
import { bookFlow, BOOK_FREE } from './botBook';
import { C, FLAG_L, L, isForeign, plainName } from './botI18n';
import { CHIPS, parseTrack, statusCopy } from './data';

const pad2 = (n) => String(n).padStart(2, '0');
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dmy = (iso) => iso.split('-').reverse().join('/');
const SKIP = /\b(bo qua|khong can|khong co|ko can|sao cung duoc)\b|^\s*(khong|ko|tuy)\s*[.!]*\s*$/; // "không" trơn chỉ là bỏ qua khi cả tin chỉ có từ đó (không thì "...được không?" bị hiểu là bỏ qua bước)
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
const FREE = new Set(['complaint.desc', 'cancel.note', ...BOOK_FREE]); // bước nhập văn bản tự do: không ngắt
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
const STEPS = ['airport', 'dates', 'party', 'prefs']; // prefs (ngân sách/khoảng cách/tiện ích) là MỘT câu hỏi tùy chọn, không còn ba câu riêng
const isDone = (s) => ({ airport: !!s.airport, dates: !!s.dates, party: !!s.party, prefs: s.maxPrice != null || s.maxKm != null || s.flags.length > 0 || !!s.skip.prefs });
export const nextStep = (s) => STEPS.find((k) => !isDone(s)[k]) ?? null;
const apName = (mem, code) => (isForeign(mem) ? plainName(airportName(code)) : airportName(code)); // khách nước ngoài: "Noi Bai" thay vì "Nội Bài"
const airportChips = (mem) => ['HAN', 'SGN', 'DAD', 'CXR', 'PQC'].filter((c) => !getAirports().length || getAirports().some((a) => a.iata === c)).map((c) => (isForeign(mem) ? { label: `${apName(mem, c)} (${c})`, text: `${airportName(c)} (${c})` } : `${airportName(c)} (${c})`));
const ASK = {
  airport: (mem) => ({ say: 'ask', slot: 'airport', text: L(mem, 'Bạn cần nơi nghỉ gần sân bay nào?', 'Which airport do you need a place to stay near?', '您需要靠近哪个机场的住宿？', '어느 공항 근처 숙소가 필요하세요?'), chips: airportChips(mem) }),
  dates: (mem) => ({ say: 'ask', slot: 'dates', text: L(mem, 'Bạn nhận phòng và trả phòng ngày nào? (ví dụ: "20/11 - 22/11" hoặc "ngày mai 2 đêm")', 'What are your check-in and check-out dates? (e.g. "20/11 - 22/11" or "tomorrow, 2 nights")', '请问入住和退房日期是哪天？（例如：“20/11 - 22/11”或“明天住2晚”）', '체크인과 체크아웃 날짜가 어떻게 되나요? (예: "20/11 - 22/11" 또는 "내일 2박")'),
    chips: [C(mem, 'Hôm nay, 1 đêm', 'Tonight, 1 night', '今晚，1晚', '오늘, 1박'), C(mem, 'Ngày mai, 1 đêm', 'Tomorrow, 1 night', '明天，1晚', '내일, 1박'), C(mem, 'Bỏ qua', 'Skip', '跳过', '건너뛰기')] }),
  party: (mem) => ({ say: 'ask', slot: 'party', text: L(mem, 'Đi mấy người, mấy phòng? (ví dụ: "2 người lớn 1 trẻ em 1 phòng")', 'How many guests and how many rooms? (e.g. "2 adults, 1 child, 1 room")', '几位客人、需要几间房？（例如：“2位成人1位儿童，1间房”）', '몇 분이시고 객실은 몇 개 필요하세요? (예: "성인 2명, 어린이 1명, 객실 1개")'),
    chips: [C(mem, '1 người', '1 guest', '1人', '1명'), C(mem, '2 người', '2 guests', '2人', '2명'), C(mem, '3 người', '3 guests', '3人', '3명'), C(mem, '4 người, 2 phòng', '4 guests, 2 rooms', '4人，2间房', '4명, 객실 2개'), C(mem, 'Bỏ qua', 'Skip', '跳过', '건너뛰기')] }),
  prefs: (mem) => ({ say: 'ask', slot: 'prefs', text: L(mem, 'Bạn có yêu cầu gì thêm không, như ngân sách, khoảng cách tới sân bay, xe đưa đón hay hủy miễn phí? Nếu không thì mình tìm luôn nhé.', 'Any other requirements, such as budget, distance to the airport, airport shuttle or free cancellation? If not, I will search right away.', '还有其他要求吗，比如预算、离机场的距离、机场接送或免费取消？如果没有，我就直接为您搜索。', '예산, 공항까지 거리, 공항 셔틀, 무료 취소 같은 다른 요청이 있으신가요? 없으면 바로 검색해 드릴게요.'),
    chips: [C(mem, 'Dưới 700k', 'Under 700k', '700k以内', '70만 동 이하'), C(mem, 'Trong 3 km', 'Within 3 km', '3公里以内', '3km 이내'), C(mem, 'Xe đưa đón', 'Airport shuttle', '机场接送', '공항 셔틀'), C(mem, 'Hủy miễn phí', 'Free cancellation', '免费取消', '무료 취소'), C(mem, 'Tìm luôn', 'Search now', '直接搜索', '바로 검색')] }),
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
  const asking = /(\?|\bkhong|\bko)\s*$/.test(n.trim()); // "có xe đưa đón không?" giữa chừng là câu hỏi, không phải yêu cầu lọc (ở bước prefs thì vẫn là yêu cầu)
  if (!(asking && ['airport', 'dates', 'party'].includes(step))) q.flags.forEach((f) => { if (!s.flags.includes(f)) s.flags.push(f); });
  const skip = SKIP.test(n);
  const b = bare(n);
  if (step === 'dates' && !s.dates && skip) s.dates = { checkIn: isoDate(0), checkOut: isoDate(1) };
  if (step === 'party' && !s.party) { if (b) s.party = { adults: Math.min(30, Math.max(1, Math.floor(Number(b.replace(',', '.'))))), children: 0, rooms: 1 }; else if (skip) s.party = { adults: 2, children: 0, rooms: 1 }; }
  if (step === 'prefs' && (skip || /tim luon|tim ngay|xong|het|khong can|khong co/.test(n))) s.skip.prefs = true;
  if (step === 'prefs' && s.maxPrice == null && /\d/.test(n) && !/km/.test(n)) { const m = parseQuery(`duoi ${text}`, null, airports).maxPrice; if (m != null) s.maxPrice = m; } // "700k" trần ở bước này = ngân sách
}

// Danh sách điều đã biết (chuỗi do code dựng, đúng ngôn ngữ khách) để AI xác nhận lại với khách; so sánh trước/sau một lượt cho ra điều khách vừa nói.
const flagText = (mem, id) => { const f = FLAG_L[id]; return f ? L(mem, ...f) : CHIPS.find((c) => c.id === id)?.label.toLowerCase(); };
export const describeSlots = (s, mem) => {
  if (!s || !Array.isArray(s.flags)) return []; // mem.s của luồng khác (hủy, xe, khiếu nại) có cấu trúc khác
  const out = [];
  if (s.airport) out.push(L(mem, `sân bay ${airportName(s.airport)}`, `${apName(mem, s.airport)} airport`, `${apName(mem, s.airport)}机场`, `${apName(mem, s.airport)} 공항`));
  if (s.dates) out.push(L(mem, `nhận phòng ${dmy(s.dates.checkIn)}, trả phòng ${dmy(s.dates.checkOut)}`, `check-in ${dmy(s.dates.checkIn)}, check-out ${dmy(s.dates.checkOut)}`, `入住 ${dmy(s.dates.checkIn)}，退房 ${dmy(s.dates.checkOut)}`, `체크인 ${dmy(s.dates.checkIn)}, 체크아웃 ${dmy(s.dates.checkOut)}`));
  if (s.party) { const g = s.party.adults + s.party.children; out.push(L(mem, `${g} khách, ${s.party.rooms} phòng`, `${g} guest(s), ${s.party.rooms} room(s)`, `${g}位客人，${s.party.rooms}间房`, `${g}명, 객실 ${s.party.rooms}개`)); }
  if (s.maxPrice != null) out.push(L(mem, `giá dưới ${money(s.maxPrice)}`, `under ${money(s.maxPrice)}`, `价格不超过${money(s.maxPrice)}`, `${money(s.maxPrice)} 이하`));
  if (s.maxKm != null) out.push(L(mem, `trong ${s.maxKm} km`, `within ${s.maxKm} km`, `${s.maxKm}公里以内`, `${s.maxKm}km 이내`));
  s.flags.forEach((id) => { const l = flagText(mem, id); if (l) out.push(l); });
  return out;
};

const criteria = (s, mem) => {
  const parts = [];
  if (s.dates) parts.push(`${dmy(s.dates.checkIn)} → ${dmy(s.dates.checkOut)}`);
  if (s.party) { const g = s.party.adults + s.party.children; parts.push(L(mem, `${g} khách, ${s.party.rooms} phòng`, `${g} guest(s), ${s.party.rooms} room(s)`, `${g}位客人，${s.party.rooms}间房`, `${g}명, 객실 ${s.party.rooms}개`)); }
  if (s.maxPrice != null) parts.push(L(mem, `giá dưới ${money(s.maxPrice)}`, `under ${money(s.maxPrice)}`, `价格不超过${money(s.maxPrice)}`, `${money(s.maxPrice)} 이하`));
  if (s.maxKm != null) parts.push(L(mem, `trong ${s.maxKm} km`, `within ${s.maxKm} km`, `${s.maxKm}公里以内`, `${s.maxKm}km 이내`));
  s.flags.forEach((id) => parts.push(flagText(mem, id)));
  return parts.length ? ` (${parts.filter(Boolean).join(mem?.lang === 'zh' ? '，' : ', ')})` : '';
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
  const where = apName(mem, s.airport);
  if (!found.length) {
    mem.step = 'relax';
    const chips = [s.maxPrice != null && C(mem, 'Bỏ giới hạn giá', 'Remove price limit', '取消价格限制', '가격 제한 해제'), s.maxKm != null && C(mem, 'Bỏ giới hạn km', 'Remove distance limit', '取消距离限制', '거리 제한 해제'), C(mem, 'Đổi sân bay', 'Change airport', '更换机场', '공항 변경'), C(mem, 'Dừng tìm', 'Stop searching', '停止搜索', '검색 중단')].filter(Boolean);
    const cr = criteria(s, mem);
    return { text: L(mem, `Chưa có nơi nghỉ nào gần ${where}${cr} còn đủ chỗ. Bạn muốn nới điều kiện nào?`, `There are no available places near ${where}${cr}. Which condition would you like to relax?`, `${where}附近${cr}暂时没有空房。您想放宽哪项条件？`, `${where} 근처${cr}에는 빈 객실이 없어요. 어떤 조건을 완화할까요?`), chips };
  }
  const book = (h) => ({ type: 'book', hotelId: h.id, airport: s.airport, party, dates });
  mem.found = found.slice(0, 3); mem.search = { dates, party, flags: s.flags, airport: s.airport }; // để khách đặt ngay trong chat (botBook)
  end(mem, null);
  const cr = criteria(s, mem); const n = found.length;
  return { text: L(mem, `Mình tìm được ${n} nơi nghỉ gần ${where}${cr}. Gần sân bay nhất, bấm vào thẻ (hoặc nhắn "đặt" kèm tên) để mình đặt giúp ngay trong chat:`, `I found ${n} place(s) to stay near ${where}${cr}, closest to the airport first. Tap a card (or say "book" with the name) and I'll book it for you right here in the chat:`, `我为您找到${n}家靠近${where}的住宿${cr}，离机场最近的排在前面。点击卡片（或说“预订”加名称），我可以直接在聊天中为您预订：`, `${where} 근처 숙소 ${n}곳을 찾았어요${cr}. 공항에서 가까운 순서예요. 카드를 누르거나 "예약"과 이름을 말씀해 주시면 채팅에서 바로 예약해 드릴게요:`), hotels: found.slice(0, 3).map((h) => ({ ...h, act: book(h), chatBook: C(mem, `Đặt ${h.name}`, `Book ${h.name}`, `预订 ${h.name}`, `${h.name} 예약`) })), actions: [{ label: L(mem, 'Xem tất cả nơi nghỉ', 'See all places', '查看所有住宿', '모든 숙소 보기'), act: { type: 'stays' } }], chips: [C(mem, 'Tìm lại từ đầu', 'Start a new search', '重新搜索', '처음부터 다시 검색')] };
}

// seed: slot đã biết (vd sân bay của chuyến bay chậm); immediate: câu đầu đã có điều kiện lọc nên tìm luôn với mặc định.
export async function beginSearch(mem, text, ctx, { seed, immediate } = {}) {
  mem.flow = 'search'; mem.s = newSearch(seed); mem.step = 'ask';
  if (text) absorb(mem.s, text, norm(text), null, getAirports());
  if (immediate) { Object.assign(mem.s.skip, { prefs: true }); mem.s.dates ??= { checkIn: isoDate(0), checkOut: isoDate(1) }; mem.s.party ??= { adults: 2, children: 0, rooms: 1 }; }
  const next = nextStep(mem.s);
  return next ? ASK[next](mem) : searchResults(mem);
}

async function searchFlow(text, n, ctx, mem) {
  const s = mem.s;
  if (mem.step === 'relax') {
    if (/bo gioi han gia/.test(n)) { s.maxPrice = null; s.skip.prefs = true; return searchResults(mem); }
    if (/bo gioi han km/.test(n)) { s.maxKm = null; s.skip.prefs = true; return searchResults(mem); }
    if (/doi san bay/.test(n)) { s.airport = null; mem.step = 'ask'; return ASK.airport(mem); }
    if (/dung tim|thoi/.test(n)) return end(mem, { text: L(mem, 'Mình đã dừng tìm kiếm. Cần gì cứ nhắn mình nhé.', 'I stopped the search. Message me anytime you need anything.', '已停止搜索。有需要随时告诉我。', '검색을 중단했어요. 필요하시면 언제든 말씀해 주세요.') });
    mem.step = 'ask';
  }
  const before = nextStep(s);
  const sig = JSON.stringify(s);
  absorb(s, text, n, before, getAirports());
  const next = nextStep(s);
  if (!next) return searchResults(mem);
  const q = ASK[next](mem);
  return { ...q, text: `${next === before && sig === JSON.stringify(s) ? L(mem, 'Mình chưa hiểu rõ ý bạn. ', 'I didn\'t quite get that. ', '我没太明白您的意思。', '잘 이해하지 못했어요. ') : ''}${q.text}` };
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
    case 'book': return bookFlow(text, n, ctx, mem);
    case 'cancel': return cancelFlow(text, n, mem);
    case 'shuttle': return shuttleFlow(text, n, ctx, mem);
    case 'complaint': return complaintFlow(text, n, mem);
    case 'ticket': { const p = parseTrack(text).phone ?? (/^\d{9,15}$/.test(text.trim()) ? text.trim() : null); return p ? beginTicket(mem, mem.s.code, p) : { text: 'Số điện thoại chưa đúng, bạn gửi lại giúp mình nhé.' }; }
    default: return end(mem, null);
  }
}
