// Trợ lý chat AIRREST: trả lời theo kịch bản (từ khóa), KHÔNG gọi AI hay dịch vụ ngoài. Dữ liệu lấy từ API qua data/user.js.
// reply() trả { text, hotels?, actions? }; action = { label, act } với act: { type: 'openProperty', id } | { type: 'go', screen } | { type: 'stays' }.
import { airportName, getAirports, listAirports, listHotels, lookupBooking, lookupFlight } from '../../data/user';
import { describeError } from '../../lib/api';
import { fmtDuration, isoDate, money } from '../../lib/time';
import { CHIPS, parseTrack, statusCopy } from './data';

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

// Lọc thuần theo điều kiện đã phân tích (dễ test); danh sách lấy từ API ở searchHotels.
export function filterHotels(hotels, q) {
  const tests = q.flags.map((id) => CHIPS.find((c) => c.id === id).test);
  return hotels
    .filter((h) => h.room.availableRooms > 0 && (q.maxPrice == null || h.room.price <= q.maxPrice) && (q.maxKm == null || h.distanceKm <= q.maxKm) && tests.every((t) => t(h)))
    .sort((a, b) => a.travelMinutes - b.travelMinutes);
}
export const searchHotels = async (q) => filterHotels(await listHotels(q.airport), q);

const stays = { label: 'Xem tất cả nơi nghỉ', act: { type: 'stays' } };
const MENU = 'Mình có thể giúp: tìm nơi nghỉ gần sân bay (theo giá, khoảng cách, xe đưa đón…), tra chuyến bay, theo dõi booking, giải thích quy trình/chính sách hủy hoặc chuyển bạn tới trung tâm hỗ trợ.';

function criteriaText(q) {
  const parts = [];
  if (q.maxPrice != null) parts.push(`giá dưới ${money(q.maxPrice)}`);
  if (q.maxKm != null) parts.push(`trong ${q.maxKm} km`);
  q.flags.forEach((id) => parts.push(CHIPS.find((c) => c.id === id).label.toLowerCase()));
  return parts.length ? ` (${parts.join(', ')})` : '';
}

async function hotelReply(text, ctx) {
  const q = parseQuery(text, ctx.airport);
  const found = await searchHotels(q);
  const where = airportName(q.airport);
  if (!found.length) return { text: `Hiện chưa có nơi nghỉ nào gần ${where}${criteriaText(q)}. Bạn thử nới điều kiện (giá cao hơn, xa hơn) hoặc đổi sân bay nhé.`, actions: [stays] };
  return { text: `Mình tìm được ${found.length} nơi nghỉ gần ${where}${criteriaText(q)}. Gần sân bay nhất:`, hotels: found.slice(0, 3), actions: [stays] };
}

async function flightReply(code) {
  const c = code.toUpperCase();
  try {
    const f = await lookupFlight(c, isoDate(0));
    const route = `${f.origin} → ${f.dest ?? '?'}`;
    const text = f.status === 'cancelled' ? `Chuyến ${c} (${route}) đã bị HỦY.`
      : f.status === 'ontime' ? `Chuyến ${c} (${route}) đúng giờ, khởi hành ${f.schedTime}.`
        : f.delayMinutes != null ? `Chuyến ${c} (${route}) chậm ${fmtDuration(f.delayMinutes)}: từ ${f.schedTime} sang ${f.newTime}.`
          : `Chuyến ${c} (${route}) bị chậm nhưng chưa có giờ khởi hành mới.`;
    if (f.status === 'ontime') return { text: `${text} Dữ liệu mô phỏng.` };
    return { text: `${text} Bạn có thể tìm nơi nghỉ gần sân bay ${airportName(f.origin)}. Dữ liệu mô phỏng.`, actions: [{ label: `Tìm nơi nghỉ gần ${f.origin}`, act: { type: 'stays' } }] };
  } catch (e) {
    return { text: e.status === 404 ? `Mình không thấy chuyến ${c} hôm nay trong dữ liệu mô phỏng. Bạn kiểm tra lại số hiệu giúp mình nhé.` : describeError(e) };
  }
}

async function trackReply({ ref, phone }) {
  const open = [{ label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } }];
  if (!ref || !phone) return { text: `Để tra cứu, bạn gửi cả mã booking và số điện thoại đã dùng khi đặt, ví dụ: "AR-7K3M9P2Q 0912345678".${ref ? ` (Mình đã nhận mã ${ref.toUpperCase()}, còn thiếu số điện thoại.)` : ''}`, actions: open };
  try {
    const b = await lookupBooking(ref.toUpperCase(), phone);
    const d = (iso) => new Date(iso).toLocaleDateString('vi-VN');
    return { text: `Booking ${b.code}: ${b.hotel?.name} (${b.lines?.[0]?.roomTypeName}), ${d(b.stay.from)} → ${d(b.stay.to)}. Trạng thái: ${statusCopy(b.status)}.${b.decision?.reason ? ` Lý do: ${b.decision.reason}.` : ''}`, actions: open };
  } catch (e) {
    return { text: e.status === 404 ? 'Mình không tìm thấy booking khớp mã và số điện thoại này. Bạn kiểm tra lại thông tin giúp mình nhé.' : describeError(e), actions: open };
  }
}

const HOW = /quy trinh|cach hoat dong|dat cho (nhu the nao|the nao|ra sao)|may buoc|huong dan/;
const TRACK = /theo doi|tra cuu booking|ma booking|booking cua toi|kiem tra booking/;
const SUPPORT = /ho tro|khieu nai|ticket|nhan vien|lien he|hotline|phan nan/;
const POLICY = /huy|hoan tien|thanh toan|tien coc|refund/;
const SEARCH = /khach san|phong|noi nghi|cho nghi|nghi dem|nghi chan|\btim\b|gan san bay|goi y|o dau/;
const GREET = /^(xin )?chao|\bhello\b|\bhi\b|\balo\b|ban la ai|giup gi|lam duoc gi/;

export async function reply(text, ctx) {
  await listAirports().catch(() => {}); // cần danh mục sân bay để hiểu tên sân bay trong câu
  const n = norm(text);
  const track = parseTrack(text);
  if (track.ref || track.phone) return trackReply(track);
  const fm = text.match(/\b([a-z]{2}\d{2,4})\b/i);
  if (fm) return flightReply(fm[1]);
  if (HOW.test(n)) return { text: 'Quy trình 3 bước: (1) chọn nơi nghỉ phù hợp theo khoảng cách, giá, tiện ích; (2) gửi yêu cầu với thông tin liên hệ tối thiểu, không cần tạo tài khoản; (3) theo dõi bằng mã booking và số điện thoại để biết khách sạn đã xác nhận hay từ chối.', actions: [stays] };
  if (TRACK.test(n)) return { text: 'Bạn gửi cho mình mã booking và số điện thoại đã dùng khi đặt (ví dụ: "AR-7K3M9P2Q 0912345678"), hoặc mở trang theo dõi booking.', actions: [{ label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } }] };
  if (SUPPORT.test(n)) return { text: 'Bạn có thể gửi ticket tại trung tâm hỗ trợ. Quản trị viên sẽ tiếp nhận và cập nhật trạng thái. Vui lòng không gửi thông tin giấy tờ tùy thân.', actions: [{ label: 'Mở trung tâm hỗ trợ', act: { type: 'go', screen: 'support' } }] };
  const q = parseQuery(text, ctx.airport);
  if (q.maxPrice != null || q.maxKm != null || q.flags.length) return hotelReply(text, ctx);
  if (POLICY.test(n)) return { text: 'Mỗi nơi nghỉ có chính sách riêng: nơi gắn nhãn “Hủy miễn phí” cho hủy không mất phí, nơi còn lại không hoàn hủy. Bạn có thể thanh toán tại khách sạn hoặc online qua VNPay (cổng đang chạy chế độ mô phỏng). Muốn hủy hoặc đổi ngày, vào “Theo dõi booking” và gửi yêu cầu cho đơn của bạn.', actions: [{ label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } }, stays] };
  if (SEARCH.test(n)) return hotelReply(text, ctx);
  if (GREET.test(n)) return { text: `Xin chào! Mình là trợ lý AIRREST (chạy theo kịch bản mô phỏng). ${MENU}` };
  return { text: `Xin lỗi, mình chưa hiểu ý bạn. ${MENU}` };
}
