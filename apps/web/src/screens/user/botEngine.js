// Trợ lý chat AIRREST: trả lời theo kịch bản (từ khóa), KHÔNG gọi AI hay dịch vụ ngoài. Dữ liệu lấy từ API qua data/user.js.
// reply(text, { airport, mem }) trả { text, hotels?, actions?, chips? }; action = { label, act } với act: { type: 'openProperty', id } | { type: 'go', screen } | { type: 'stays' } | { type: 'book', hotelId, airport, party, dates }.
// Hội thoại nhiều lượt (đặt phòng, hủy/đổi ngày, xe, khiếu nại) nằm ở botFlows.js; trạng thái giữ trong ctx.mem.
import { airportName, getAirports, listAirports, lookupBookingFull, lookupFlight } from '../../data/user';
import { describeError } from '../../lib/api';
import { fmtDuration, isoDate } from '../../lib/time';
import { CHIPS, parseTrack, statusCopy } from './data';
import { beginCancel, beginComplaint, beginSearch, beginShuttle, beginTicket, getBooking, runFlow } from './botFlows';

export const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const FLAGS = [
  ['shuttle', /xe dua don|dua don|shuttle/],
  ['freeCancel', /huy mien phi|mien phi huy|hoan huy/],
  ['family', /gia dinh/],
  ['hourly', /theo gio/],
  ['open24', /24\/?24|24h|le tan 24/],
  ['rating', /danh gia cao|diem cao/],
];

// Nhận diện sân bay trong câu: mã IATA viết HOA, hoặc tên/tỉnh (bỏ dấu); khớp dài nhất thắng. Không khớp thì dùng sân bay mặc định.
const ALIAS = { SGN: ['sai gon', 'ho chi minh', 'hcm'], HAN: ['ha noi'] };
export function detectAirport(text, airports, fallback) {
  const n = norm(text);
  let best = null;
  for (const a of airports) {
    const names = [norm(a.name), ...norm(a.city).split(/[()]/).map((s) => s.trim()).filter(Boolean), ...(ALIAS[a.iata] ?? [])];
    const hit = Math.max(new RegExp(`\\b${a.iata}\\b`).test(text) ? a.iata.length : 0, ...names.filter((s) => n.includes(s)).map((s) => s.length));
    if (hit && (!best || hit > best.hit)) best = { iata: a.iata, hit };
  }
  return best?.iata ?? fallback;
}

// "tìm phòng gần sân bay Cam Ranh dưới 700k trong 5km có xe đưa đón" -> { airport, maxPrice, maxKm, flags }.
export function parseQuery(text, defaultAirport = 'HAN', airports = getAirports()) {
  const n = norm(text);
  const airport = detectAirport(text, airports, defaultAirport);
  const km = n.match(/(\d+(?:[.,]\d+)?)\s*km\b/);
  const rest = km ? n.replace(km[0], ' ') : n; // tránh "dưới 5 km" bị đọc thành giá
  let maxPrice = null;
  const pm = rest.match(/(?:duoi|toi da|khong qua|re hon|<)\s*(\d[\d.,]*)\s*(k|nghin|ngan|tr|trieu)?/);
  if (pm) {
    const num = parseFloat(pm[1].replace(',', '.'));
    if (/^(tr|trieu)$/.test(pm[2] || '')) maxPrice = num * 1e6;
    else if (/^(k|nghin|ngan)$/.test(pm[2] || '')) maxPrice = num * 1e3;
    else { const v = Number(pm[1].replace(/[.,]/g, '')); maxPrice = v < 10000 ? v * 1000 : v; }
  } else if (/\b(gia re|tiet kiem|re nhat)\b/.test(n)) maxPrice = 700000;
  const flags = FLAGS.filter(([, re]) => re.test(n)).map(([id]) => id);
  return { airport, maxPrice, maxKm: km ? parseFloat(km[1].replace(',', '.')) : null, flags };
}

// Lọc thuần theo điều kiện đã phân tích (dễ test).
export function filterHotels(hotels, q) {
  const tests = q.flags.map((id) => CHIPS.find((c) => c.id === id).test);
  return hotels
    .filter((h) => h.room.availableRooms > 0 && (q.maxPrice == null || h.room.price <= q.maxPrice) && (q.maxKm == null || h.distanceKm <= q.maxKm) && tests.every((t) => t(h)))
    .sort((a, b) => a.travelMinutes - b.travelMinutes);
}
const START = ['Tìm & đặt phòng', 'Theo dõi booking', 'Hủy / đổi ngày', 'Xe đưa đón', 'Gửi khiếu nại'];
const MENU = 'Mình có thể giúp: tìm và đặt nơi nghỉ gần sân bay, tra chuyến bay, theo dõi booking, hủy/đổi ngày, đặt xe đưa đón, gửi khiếu nại hoặc giải thích chính sách.';

async function flightReply(code, mem, ctx) {
  const c = code.toUpperCase();
  try {
    const f = await lookupFlight(c, isoDate(0));
    const route = `${f.origin} → ${f.dest ?? '?'}`;
    const note = f.notice ? `${f.notice} ` : '';
    const text = note + (f.status === 'cancelled' ? `Chuyến ${c} (${route}) đã bị HỦY.`
      : f.status === 'ontime' ? `Chuyến ${c} (${route}) đúng giờ, khởi hành ${f.schedTime}.`
        : f.delayMinutes != null ? `Chuyến ${c} (${route}) chậm ${fmtDuration(f.delayMinutes)}: từ ${f.schedTime} sang ${f.newTime}.`
          : `Chuyến ${c} (${route}) bị chậm nhưng chưa có giờ khởi hành mới.`);
    if (f.status === 'ontime') return { text };
    const q = await beginSearch(mem, '', ctx, { seed: { airport: f.origin } }); // chuyến chậm/hủy: chuyển sang tìm nơi nghỉ gần sân bay đó
    return { ...q, text: `${text} Mình hỗ trợ tìm nơi nghỉ gần ${airportName(f.origin)} nhé.\n${q.text}` };
  } catch (e) {
    return { text: e.status === 404 ? `Mình không thấy chuyến ${c} hôm nay trong dữ liệu. Bạn kiểm tra lại số hiệu giúp mình nhé.` : describeError(e) };
  }
}

// Các loại phòng của đơn, mỗi dòng một loại ('Standard × 2, Deluxe × 1'); đơn cũ không có lines[] thì dùng tóm tắt roomTypeName.
export const bookingRooms = (b) => (b.lines?.length ? b.lines.map((l) => `${l.roomTypeName} × ${l.qty}${l.kind === 'HOURLY' ? ` (theo giờ: ${l.hours} giờ từ ${hhmmVn(l.startsAt)})` : ''}`).join(', ') : b.roomTypeName ?? '');
const hhmmVn = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });

async function trackReply({ ref, phone }, mem) {
  const open = [{ label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } }];
  if (!ref) return { text: 'Để tra cứu, bạn gửi mã booking, ví dụ: "AR-7K3M9P2Q".', actions: open };
  try {
    const { booking: b } = phone ? await getBooking(mem, ref, phone) : await lookupBookingFull(ref.toUpperCase()); // chỉ mã: xem trạng thái; hủy/đổi/xe vẫn cần SĐT
    const d = (iso) => new Date(iso).toLocaleDateString('vi-VN');
    return { text: `Booking ${b.code}: ${b.hotel?.name} (${bookingRooms(b)}), ${b.stay.type === 'HOURLY' ? `${d(b.stay.from)} (theo giờ)` : `${d(b.stay.from)} → ${d(b.stay.to)}`}. Trạng thái: ${statusCopy(b.status)}.${b.decision?.reason ? ` Lý do: ${b.decision.reason}.` : ''}`, actions: open, chips: ['Hủy / đổi ngày', 'Xe đưa đón', 'Gửi khiếu nại'] }; // các luồng này sẽ hỏi SĐT
  } catch (e) {
    return { text: e.status === 404 ? 'Mình không tìm thấy booking khớp thông tin này. Bạn kiểm tra lại mã giúp mình nhé.' : describeError(e), actions: open };
  }
}

const HOW = /quy trinh|cach hoat dong|dat cho (nhu the nao|the nao|ra sao)|may buoc|huong dan/;
const TRACK = /theo doi|tra cuu booking|ma booking|booking cua toi|kiem tra booking/;
const SHUTTLE = /\bxe\b|don xe|dua don|tai xe|bien so|goi xe|shuttle|grab/;
const SUPPORT = /ho tro|ticket|nhan vien|lien he|hotline/;
const COMPLAINT = /khieu nai|phan nan|bat man|that vong|sai gia|tinh sai|tru tien|ve sinh|khong dung mo ta|co van de|gap su co/;
const ANGRY = /lua dao|bao cong an|\bkien\b|buc xuc|qua te/;
const CANCEL_START = /huy (phong|dat|booking|don)|(muon|can|xin|giup).{0,15}huy|doi (ngay|lich)/;
const POLICY_Q = /chinh sach|quy dinh|phi huy|mat phi|bao nhieu|co duoc|nhu the nao/;
const POLICY = /huy|hoan tien|thanh toan|tien coc|refund/;
const SEARCH = /khach san|phong|noi nghi|cho nghi|nghi dem|nghi chan|\btim\b|gan san bay|goi y|o dau/;
const GREET = /^(xin )?chao|\bhello\b|\bhi\b|\balo\b|ban la ai|giup gi|lam duoc gi/;

export async function reply(text, ctx) {
  const mem = ctx.mem ?? {};
  await listAirports().catch(() => {}); // cần danh mục sân bay để hiểu tên sân bay trong câu
  const n = norm(text);
  const fails = mem.fails ?? 0;
  mem.fails = 0;
  if (mem.flow) {
    if (/^(huy bo|thoi|dung lai|thoat|quay lai)$/.test(n.trim())) { mem.flow = null; mem.step = null; mem.s = null; return { text: `Mình đã dừng. ${MENU}`, chips: START }; }
    const r = await runFlow(text, n, ctx, mem);
    if (r) return r;
  }
  const ticket = text.match(/\bSP-[0-9A-Z]{8}\b/i);
  if (ticket) return beginTicket(mem, ticket[0].toUpperCase(), parseTrack(text).phone);
  const track = parseTrack(text);
  if (track.ref || track.phone) return trackReply(track, mem);
  const fm = text.match(/\b([a-z]{2}\d{2,4})\b/i);
  if (fm) return flightReply(fm[1], mem, ctx);
  if (ANGRY.test(n)) return beginComplaint(mem, 'Mình xin lỗi bạn về sự bất tiện này. ');
  if (HOW.test(n)) return { text: 'Quy trình 3 bước: (1) chọn nơi nghỉ phù hợp theo khoảng cách, giá, tiện ích; (2) gửi yêu cầu với thông tin liên hệ tối thiểu, không cần tạo tài khoản; (3) theo dõi bằng mã booking và số điện thoại để biết khách sạn đã xác nhận hay từ chối.', actions: [{ label: 'Xem tất cả nơi nghỉ', act: { type: 'stays' } }], chips: ['Tìm & đặt phòng'] };
  if (TRACK.test(n)) return { text: 'Bạn gửi cho mình mã booking và số điện thoại đã dùng khi đặt (ví dụ: "AR-7K3M9P2Q 0912345678"), hoặc mở trang theo dõi booking.', actions: [{ label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } }] };
  if (COMPLAINT.test(n)) return beginComplaint(mem);
  if (CANCEL_START.test(n) && !POLICY_Q.test(n)) return beginCancel(mem, ctx);
  if (SUPPORT.test(n)) return { text: 'Bạn có thể nhắn mình để gửi khiếu nại ngay trong chat, hoặc tra cứu ticket đã gửi (mã SP-XXXXXXXX kèm số điện thoại). Vui lòng không gửi thông tin giấy tờ tùy thân.', actions: [{ label: 'Mở trung tâm hỗ trợ', act: { type: 'go', screen: 'support' } }], chips: ['Gửi khiếu nại'] };
  const q = parseQuery(text, ctx.airport);
  if (q.maxPrice != null || q.maxKm != null || (q.flags.length && SEARCH.test(n))) return beginSearch(mem, text, ctx, { immediate: true });
  if (SHUTTLE.test(n)) return beginShuttle(mem);
  if (POLICY.test(n)) return { text: 'Mỗi nơi nghỉ có chính sách riêng: nơi gắn nhãn “Hủy miễn phí” cho hủy không mất phí, nơi còn lại không hoàn hủy. Bạn có thể thanh toán tại khách sạn hoặc online qua cổng thanh toán đang bật như VNPay hoặc MoMo. Muốn hủy hoặc đổi ngày, mình có thể gửi yêu cầu giúp bạn ngay trong chat.', chips: ['Hủy / đổi ngày', 'Tìm & đặt phòng'] };
  if (SEARCH.test(n)) return beginSearch(mem, text, ctx);
  if (GREET.test(n)) return { text: `Xin chào! Mình là trợ lý AIRREST. ${MENU}`, chips: START };
  mem.fails = fails + 1;
  if (mem.fails >= 2) { mem.fails = 0; return beginComplaint(mem, 'Có vẻ mình chưa hiểu đúng ý bạn, mình chuyển bạn sang bộ phận hỗ trợ nhé. '); }
  return { text: `Xin lỗi, mình chưa hiểu ý bạn. ${MENU}`, chips: START };
}
