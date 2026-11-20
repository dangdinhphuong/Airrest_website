// Trợ lý chat AIRREST: trả lời theo kịch bản (từ khóa), KHÔNG gọi AI hay dịch vụ ngoài. Dữ liệu lấy từ API qua data/user.js.
// reply(text, { airport, mem }) trả { text, hotels?, actions?, chips? }; action = { label, act } với act: { type: 'openProperty', id } | { type: 'go', screen } | { type: 'stays' } | { type: 'book', hotelId, airport, party, dates }.
// Hội thoại nhiều lượt (đặt phòng, hủy/đổi ngày, xe, khiếu nại) nằm ở botFlows.js; trạng thái giữ trong ctx.mem.
import { airportName, getAirports, listAirports, lookupBookingFull, lookupFlight, understandText, composeReply, normalizeText } from '../../data/user';
import { describeError } from '../../lib/api';
import { fmtDuration, isoDate } from '../../lib/time';
import { CHIPS, parseTrack, statusCopy } from './data';
import { beginBook } from './botBook';
import { C, L, MENU, START_CHIPS, ackFor, chipText, detectLang, isForeign, plainName, statusIn, unsupported } from './botI18n';
import { beginCancel, beginComplaint, beginSearch, beginShuttle, beginTicket, describeSlots, getBooking, runFlow } from './botFlows';

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
const durL = (mem, m) => (isForeign(mem) ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ''}${m % 60}min` : fmtDuration(m));
async function flightReply(code, mem, ctx) {
  const c = code.toUpperCase();
  try {
    const f = await lookupFlight(c, isoDate(0));
    const route = `${f.origin} → ${f.dest ?? '?'}`;
    const note = f.notice ? `${f.notice} ` : '';
    const text = note + (f.status === 'cancelled' ? L(mem, `Chuyến ${c} (${route}) đã bị HỦY.`, `Flight ${c} (${route}) has been CANCELLED.`, `航班 ${c}（${route}）已被取消。`, `항공편 ${c} (${route})이(가) 취소되었어요.`)
      : f.status === 'ontime' ? L(mem, `Chuyến ${c} (${route}) đúng giờ, khởi hành ${f.schedTime}.`, `Flight ${c} (${route}) is on time, departing at ${f.schedTime}.`, `航班 ${c}（${route}）准点，起飞时间 ${f.schedTime}。`, `항공편 ${c} (${route})은(는) 정시 운항이며 ${f.schedTime}에 출발해요.`)
        : f.delayMinutes != null ? L(mem, `Chuyến ${c} (${route}) chậm ${durL(mem, f.delayMinutes)}: từ ${f.schedTime} sang ${f.newTime}.`, `Flight ${c} (${route}) is delayed by ${durL(mem, f.delayMinutes)}: from ${f.schedTime} to ${f.newTime}.`, `航班 ${c}（${route}）延误 ${durL(mem, f.delayMinutes)}：由 ${f.schedTime} 改为 ${f.newTime}。`, `항공편 ${c} (${route})이(가) ${durL(mem, f.delayMinutes)} 지연되어 ${f.schedTime}에서 ${f.newTime}(으)로 변경됐어요.`)
          : L(mem, `Chuyến ${c} (${route}) bị chậm nhưng chưa có giờ khởi hành mới.`, `Flight ${c} (${route}) is delayed but there is no new departure time yet.`, `航班 ${c}（${route}）延误，暂无新的起飞时间。`, `항공편 ${c} (${route})이(가) 지연되었지만 아직 새 출발 시간이 없어요.`));
    if (f.status === 'ontime') return { text };
    const q = await beginSearch(mem, '', ctx, { seed: { airport: f.origin } }); // chuyến chậm/hủy: chuyển sang tìm nơi nghỉ gần sân bay đó
    const ap = isForeign(mem) ? plainName(airportName(f.origin)) : airportName(f.origin);
    return { ...q, text: `${text} ${L(mem, `Mình hỗ trợ tìm nơi nghỉ gần ${ap} nhé.`, `I'll help you find a place to stay near ${ap}.`, `我来帮您查找${ap}附近的住宿。`, `${ap} 근처 숙소 찾는 것을 도와드릴게요.`)}\n${q.text}` };
  } catch (e) {
    return { text: e.status === 404 ? L(mem, `Mình không thấy chuyến ${c} hôm nay trong dữ liệu. Bạn kiểm tra lại số hiệu giúp mình nhé.`, `I can't find flight ${c} for today. Please double-check the flight number.`, `今天的数据中没有找到航班 ${c}，请核对航班号。`, `오늘 데이터에서 항공편 ${c}을(를) 찾을 수 없어요. 편명을 다시 확인해 주세요.`) : describeError(e) };
  }
}

// Các loại phòng của đơn, mỗi dòng một loại ('Standard × 2, Deluxe × 1'); đơn cũ không có lines[] thì dùng tóm tắt roomTypeName.
export const bookingRooms = (b) => (b.lines?.length ? b.lines.map((l) => `${l.roomTypeName} × ${l.qty}${l.kind === 'HOURLY' ? ` (theo giờ: ${l.hours} giờ từ ${hhmmVn(l.startsAt)})` : ''}`).join(', ') : b.roomTypeName ?? '');
const hhmmVn = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });

async function trackReply({ ref, phone }, mem) {
  const open = [{ label: L(mem, 'Mở trang theo dõi', 'Open tracking page', '打开订单查询页面', '예약 조회 페이지 열기'), act: { type: 'go', screen: 'track' } }];
  if (!ref) return { text: L(mem, 'Để tra cứu, bạn gửi mã booking, ví dụ: "AR-7K3M9P2Q".', 'To look it up, send your booking code, e.g. "AR-7K3M9P2Q".', '查询订单请发送订单号，例如："AR-7K3M9P2Q"。', '조회하려면 예약 번호를 보내주세요. 예: "AR-7K3M9P2Q".'), actions: open };
  try {
    const { booking: b } = phone ? await getBooking(mem, ref, phone) : await lookupBookingFull(ref.toUpperCase()); // chỉ mã: xem trạng thái; hủy/đổi/xe vẫn cần SĐT
    const d = (iso) => new Date(iso).toLocaleDateString('vi-VN');
    const when = b.stay.type === 'HOURLY' ? L(mem, `${d(b.stay.from)} (theo giờ)`, `${d(b.stay.from)} (hourly)`, `${d(b.stay.from)}（钟点房）`, `${d(b.stay.from)} (시간제)`) : `${d(b.stay.from)} → ${d(b.stay.to)}`;
    const st = statusIn(mem, b.status, statusCopy(b.status));
    const why = b.decision?.reason ? L(mem, ` Lý do: ${b.decision.reason}.`, ` Reason: ${b.decision.reason}.`, ` 原因：${b.decision.reason}。`, ` 사유: ${b.decision.reason}.`) : '';
    return { text: L(mem, `Booking ${b.code}: ${b.hotel?.name} (${bookingRooms(b)}), ${when}. Trạng thái: ${st}.${why}`, `Booking ${b.code}: ${b.hotel?.name} (${bookingRooms(b)}), ${when}. Status: ${st}.${why}`, `订单 ${b.code}：${b.hotel?.name}（${bookingRooms(b)}），${when}。状态：${st}。${why}`, `예약 ${b.code}: ${b.hotel?.name} (${bookingRooms(b)}), ${when}. 상태: ${st}.${why}`), actions: open, chips: [C(mem, 'Hủy / đổi ngày', 'Cancel / change dates', '取消 / 改期', '취소 / 날짜 변경'), C(mem, 'Xe đưa đón', 'Airport shuttle', '机场接送', '공항 셔틀'), C(mem, 'Gửi khiếu nại', 'Send a complaint', '提交投诉', '불만 접수')] }; // các luồng này sẽ hỏi SĐT
  } catch (e) {
    return { text: e.status === 404 ? L(mem, 'Mình không tìm thấy booking khớp thông tin này. Bạn kiểm tra lại mã giúp mình nhé.', "I couldn't find a booking matching this information. Please double-check the code.", '没有找到与这些信息匹配的订单，请核对订单号。', '이 정보와 일치하는 예약을 찾지 못했어요. 예약 번호를 다시 확인해 주세요.') : describeError(e), actions: open };
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
const POLICY = /\bhuy\b|hoan tien|thanh toan|tien coc|refund/; // \b: "chuyến" (chuyen) chứa "huy" không được tính
const SEARCH = /khach san|phong|noi nghi|cho nghi|nghi dem|nghi chan|\btim\b|gan san bay|goi y|o dau/;
const GREET = /^(xin )?chao|\bhello\b|\bhi\b|\balo\b|ban la ai|giup gi|lam duoc gi/;

// Câu không khớp regex nào: nhờ AI local chọn ý định. AI chỉ trả nhãn + tham số; câu trả lời luôn do code này quyết định (AI không sinh chữ cho khách).
// Ý định có luồng sẵn thì chạy lại reply() với một câu chuẩn khớp đúng regex của luồng đó (noAi: chống lặp), nên mọi bước xác nhận/xác thực của luồng vẫn nguyên.
const blockedReply = (mem) => ({ text: L(mem, 'Mình không thể hỗ trợ yêu cầu này vì liên quan đến thông tin bảo mật hoặc quyền truy cập hệ thống. Nếu bạn muốn xem booking của chính mình, hãy gửi mã booking và số điện thoại đã dùng khi đặt.', "I can't help with this request because it involves security information or system access. If you want to look up your own booking, please send your booking code and the phone number you used.", '这个请求涉及安全信息或系统访问权限，我无法协助。如果您想查询自己的订单，请发送订单号和预订时使用的手机号。', '이 요청은 보안 정보나 시스템 접근과 관련되어 있어 도와드릴 수 없어요. 본인의 예약을 조회하시려면 예약 번호와 예약 시 사용한 전화번호를 보내주세요.'), chips: START_CHIPS(mem) });
const CANON = { track: 'theo dõi booking', cancel: 'tôi muốn hủy phòng', shuttle: 'đặt xe đưa đón', complaint: 'gửi khiếu nại', policy: 'chính sách hủy thanh toán', greet: 'xin chào' };
async function replyByAi(text, ctx, mem) {
  const ai = await understandText(text);
  if (!ai) return null;
  const { intent, params: p = {} } = ai;
  if (intent === 'blocked') return blockedReply(mem);
  if (intent === 'offtopic') return { say: 'offtopic', text: `${L(mem, 'Xin lỗi, câu này nằm ngoài phạm vi mình hỗ trợ. ', 'Sorry, that is outside what I can help with. ', '抱歉，这超出了我能协助的范围。', '죄송해요, 그 내용은 제가 도와드릴 수 있는 범위를 벗어나요. ')}${MENU(mem)}`, chips: START_CHIPS(mem) };
  if (intent === 'search') {
    const seed = {}; // sân bay/ngày/số khách/tiện ích do regex sẵn có rút từ câu (beginSearch gọi absorb); AI chỉ bổ sung giá/km đã được backend kiểm có căn cứ
    if (p.maxPrice > 0) seed.maxPrice = p.maxPrice;
    if (p.maxKm > 0) seed.maxKm = p.maxKm;
    const r = await beginSearch(mem, text, ctx, { seed });
    // Sân bay do model đoán (câu tiếng nước ngoài/gõ sai mà regex không nhận ra) chỉ là GỢI Ý khách phải xác nhận, không tự điền: model từng trả NUE (Nuremberg) cho "Nội Bài".
    const sug = r.slot === 'airport' && p.airport ? getAirports().find((a) => a.iata === p.airport) : null;
    if (!sug) return r;
    const label = `${airportName(sug.iata)} (${sug.iata})`;
    const shown = isForeign(mem) ? `${plainName(airportName(sug.iata))} (${sug.iata})` : label;
    return { text: L(mem, `Có phải bạn cần nơi nghỉ gần sân bay ${label} không?`, `Do you need a place to stay near ${shown} airport?`, `您是需要靠近${shown}机场的住宿吗？`, `${shown} 공항 근처 숙소가 필요하신 건가요?`), chips: [isForeign(mem) ? { label: shown, text: label } : label, ...(r.chips ?? []).filter((c) => !chipText(c).includes(`(${sug.iata})`))] };
  }
  if (intent === 'flight' && p.flightCode) return flightReply(p.flightCode, mem, ctx);
  if (CANON[intent]) return reply(CANON[intent], { ...ctx, noAi: true });
  return null;
}

// Nhờ AI diễn đạt lại câu code đã chọn (hỏi mục nào, chào, từ chối...) cho tự nhiên, kèm vài tin gần nhất để biết ngữ cảnh.
// AI không đổi nút/thẻ/hành động: chỉ thay chữ. Lỗi, quá hạn, câu không an toàn hoặc AI tắt thì giữ nguyên câu mẫu.
// Khách hỏi ngang giữa chừng ("có đưa đón không?"): code chọn dữ kiện THẬT (lấy từ nội dung sản phẩm) cho AI diễn đạt, AI không tự nhớ/bịa.
const FAQ = [
  [/xe dua don|dua don|shuttle/, (m) => L(m, 'Xe đưa đón thì tùy từng nơi nghỉ nha: nơi nào có thì bạn chọn thêm lúc đặt, và mình lọc được theo xe đưa đón khi tìm.', 'Airport shuttle depends on the hotel: where it is offered you can add it when booking, and I can filter by shuttle when searching.', '机场接送因酒店而异：提供该服务的酒店可在预订时加选，搜索时我也可以按接送筛选。', '공항 셔틀은 숙소마다 달라요. 제공하는 곳은 예약할 때 추가할 수 있고, 검색할 때 셔틀로 필터링할 수도 있어요.')],
  [/thanh toan|tra tien|sepay|chuyen khoan|the tin dung/, (m) => L(m, 'Bên mình cho thanh toán tại khách sạn hoặc online qua SePay (chuyển khoản QR ngân hàng hoặc thẻ).', 'You can pay at the hotel or online via SePay (bank QR transfer or card).', '可以到店支付，也可以通过 SePay 在线支付（银行二维码转账或银行卡）。', '호텔에서 결제하거나 SePay로 온라인 결제(은행 QR 이체 또는 카드)할 수 있어요.')],
  [/huy|hoan tien|mat phi/, (m) => L(m, 'Chính sách hủy thì mỗi nơi nghỉ một khác: nơi gắn nhãn "Hủy miễn phí" thì hủy không mất phí, nơi còn lại không hoàn hủy.', 'Cancellation policies differ by hotel: places labelled "Free cancellation" can be cancelled at no cost; others are non-refundable.', '取消政策因酒店而异：标有“免费取消”的可免费取消，其余不可退款。', '취소 정책은 숙소마다 달라요. "무료 취소" 표시가 있는 곳은 비용 없이 취소할 수 있고, 나머지는 환불되지 않아요.')],
  [/tai khoan|dang ky|dang nhap/, (m) => L(m, 'Bạn không cần tạo tài khoản để đặt, chỉ cần thông tin liên hệ tối thiểu thôi.', "You don't need an account to book, just minimal contact details.", '预订无需注册账号，只需提供最基本的联系方式。', '예약하는 데 계정은 필요 없고, 최소한의 연락처만 있으면 돼요.')],
];
const ASKING = /\?|\b(khong|ko|chua|sao|the nao|bao nhieu|duoc khong)\b/;
// only: chỉ các chủ đề thông tin thuần (đưa đón, thanh toán, tài khoản), bỏ "hủy" vì "làm sao hủy đơn?" là việc cần luồng hủy chứ không phải tra chính sách.
export function faqFacts(text, mem, only) {
  const n = norm(text);
  return ASKING.test(n) ? FAQ.filter(([re], i) => (!only || only.includes(i)) && re.test(n)).map(([, f]) => f(mem)).join(' ') : '';
}

const PII_SLOTS = new Set(['name', 'phone', 'email']); // họ tên/SĐT/email khách gõ: không đưa cho AI

// Khách chọn nơi nghỉ từ kết quả vừa tìm ("đặt Kênh Xanh Inn", "đặt cái thứ 2", "đặt luôn") thì vào luồng đặt ngay trong chat.
const GENERIC_BOOK = /^(dat|chon|lay)( phong| cai| noi)?( nay| do| luon| di| nhe| giup minh)*$/;
async function pickHotel(n, ctx, mem) {
  const found = mem.found;
  if (!found?.length || !/\b(dat|chon|lay|book)\b/.test(n) || /\bxe\b|khieu nai|huy/.test(n)) return null;
  const named = found.find((h) => n.includes(norm(h.name)));
  if (named) return beginBook(mem, ctx, named);
  if (/gan|san bay|duoi|\bkm\b|\btim\b/.test(n)) return null; // "đặt phòng gần Cam Ranh..." là một lần tìm MỚI, không phải chọn nơi cũ
  const nth = n.match(/\b(?:so|thu|cai)\s*(\d)\b/)?.[1];
  const pick = (nth && found[Number(nth) - 1]) || (/dau tien|cai dau/.test(n) ? found[0] : null) || (found.length === 1 && GENERIC_BOOK.test(n.trim()) ? found[0] : null);
  if (pick) return beginBook(mem, ctx, pick);
  return GENERIC_BOOK.test(n.trim()) ? { text: L(mem, 'Bạn muốn đặt nơi nào trong các nơi mình vừa tìm ạ?', 'Which of the places I just found would you like to book?', '您想预订刚才找到的哪一家？', '방금 찾은 숙소 중 어디를 예약하시겠어요?'), chips: found.map((h) => C(mem, `Đặt ${h.name}`, `Book ${h.name}`, `预订 ${h.name}`, `${h.name} 예약`)) } : null;
}

async function naturalize(r, text, mem, before) {
  if (!r?.say) return r;
  const { say, slot, known, noAi, apology, ...rest } = r;
  const fact = say === 'ask' ? faqFacts(text, mem) : ''; // câu hỏi ngang: phần trả lời là dữ kiện thật do code viết, AI chỉ nối phần hỏi tiếp
  const after = describeSlots(mem.s, mem);
  const learned = say === 'ask' ? after.filter((x) => !before.includes(x)).join(mem.lang === 'zh' ? '，' : ', ') : '';
  // Lời ghi nhận điều khách vừa cho biết do CODE nói (model 3B lúc nhắc lúc không); đổi kiểu câu theo lượt cho đỡ máy móc.
  const withFact = (t) => `${ackFor(mem, learned, mem.hist?.length ?? 0)}${fact ? `${fact} ` : ''}${t}`;
  const body = fact && apology ? r.text.slice(apology.length) : r.text; // đã trả lời được câu hỏi ngang thì không xin lỗi "chưa hiểu rõ ý bạn"
  if (noAi && !fact) return { ...rest, text: withFact(r.text) }; // code chưa hiểu câu khách (vd "ngày 24" chưa đọc được): hỏi lại đúng câu mẫu, KHÔNG để model diễn giải thành câu xác nhận như thể đã hiểu
  if (isForeign(mem)) return { ...rest, text: withFact(body) }; // en/zh/ko: câu viết sẵn ba thứ tiếng, không nhờ model 3B diễn đạt (dịch dễ sai, nhất là phần tiền)
  try {
    const out = await composeReply({ type: say, slot, userText: PII_SLOTS.has(slot) ? '' : text, known: known ?? after.join('; '), learned, template: body }, (mem.hist ?? []).slice(-7, -1));
    return { ...rest, text: withFact(out || body) };
  } catch { return { ...rest, text: withFact(body) }; }
}

// Họ tên/SĐT/email khách gõ ở các bước đặt phòng: không đổi ngôn ngữ theo chữ họ gõ và không dịch (tên "Nguyễn Văn An" trong cuộc chat tiếng Anh không được đổi cuộc chat sang tiếng Việt).
const BOOK_RAW_STEPS = new Set(['name', 'phone', 'email']);

export async function reply(text, ctx) {
  if (ctx.noAi) return replyCore(text, ctx);
  const c = ctx.mem ? ctx : { ...ctx, mem: {} };
  const mem = c.mem;
  const booking = mem.flow === 'book';
  // Ngôn ngữ của tin gõ tay (nút bấm gửi giá trị tiếng Việt chuẩn nên không đổi ngôn ngữ). Tin tiếng nước ngoài được dịch sang tiếng Việt chuẩn rồi chạy qua bộ phân tích đã có.
  if (!ctx.chip && !(booking && BOOK_RAW_STEPS.has(mem.step))) mem.lang = detectLang(text, mem.lang ?? 'vi');
  let canon = text;
  if (isForeign(mem) && !ctx.chip && !booking) {
    const nz = await normalizeText(text, mem.lang);
    if (nz?.blocked) { const b = blockedReply(mem); mem.hist = [...(mem.hist ?? []), { role: 'user', text: '[blocked]' }, { role: 'bot', text: b.text }].slice(-12); return b; }
    if (nz?.vi) canon = nz.vi;
  }
  mem.hist = [...(mem.hist ?? []), { role: 'user', text: canon }].slice(-12);
  const before = describeSlots(mem.s, mem);
  const r = await naturalize(await replyCore(canon, c), canon, mem, before);
  if (r?.text) mem.hist.push({ role: 'bot', text: r.text });
  return r;
}

async function replyCore(text, ctx) {
  const mem = ctx.mem ?? {};
  await listAirports().catch(() => {}); // cần danh mục sân bay để hiểu tên sân bay trong câu
  const n = norm(text);
  const fails = mem.fails ?? 0;
  mem.fails = 0;
  if (mem.flow) {
    if (/^(huy bo|thoi|dung lai|thoat|quay lai)$/.test(n.trim())) { mem.flow = null; mem.step = null; mem.s = null; return { text: `${L(mem, 'Mình đã dừng. ', "I've stopped. ", '已停止。', '중단했어요. ')}${MENU(mem)}`, chips: START_CHIPS(mem) }; }
    const r = await runFlow(text, n, ctx, mem);
    if (r) return r;
  }
  if (!mem.flow) { const r = await pickHotel(n, ctx, mem); if (r) return r; }
  const ticket = text.match(/\bSP-[0-9A-Z]{8}\b/i);
  const foreign = isForeign(mem); // hủy/đổi, đặt xe, khiếu nại, ticket chưa có bản đa ngôn ngữ: chỉ đường tới đúng trang
  if (ticket) return foreign ? unsupported(mem) : beginTicket(mem, ticket[0].toUpperCase(), parseTrack(text).phone);
  const track = parseTrack(text);
  if (track.ref || track.phone) return trackReply(track, mem);
  const fm = text.match(/\b([a-z]{2}\d{2,4})\b/i);
  if (fm) return flightReply(fm[1], mem, ctx);
  if (foreign && !mem.flow) { const f = faqFacts(text, mem, [0, 1, 3]); if (f) return { text: f, chips: START_CHIPS(mem) }; } // khách nước ngoài chỉ hỏi thông tin (có xe đưa đón không, thanh toán thế nào...): trả lời thật, không đẩy sang "chỉ hỗ trợ tiếng Việt"
  if (ANGRY.test(n)) return foreign ? unsupported(mem) : beginComplaint(mem, 'Mình xin lỗi bạn về sự bất tiện này. ');
  if (HOW.test(n)) return { text: L(mem, 'Quy trình 3 bước: (1) chọn nơi nghỉ phù hợp theo khoảng cách, giá, tiện ích; (2) gửi yêu cầu với thông tin liên hệ tối thiểu, không cần tạo tài khoản; (3) theo dõi bằng mã booking và số điện thoại để biết khách sạn đã xác nhận hay từ chối.', 'It takes 3 steps: (1) choose a place to stay by distance, price and amenities; (2) send a request with minimal contact details, no account needed; (3) track it with your booking code and phone number to see whether the hotel confirmed or declined.', '分三步：(1) 按距离、价格和设施选择住宿；(2) 提交预订请求，只需最基本的联系方式，无需注册账号；(3) 用订单号和手机号跟踪，查看酒店是否确认。', '3단계예요: (1) 거리, 가격, 편의시설로 숙소를 고르고 (2) 최소한의 연락처만 입력해 요청을 보내고(계정 불필요) (3) 예약 번호와 전화번호로 호텔의 확인 또는 거절 여부를 확인하세요.'), actions: [{ label: L(mem, 'Xem tất cả nơi nghỉ', 'See all places', '查看所有住宿', '모든 숙소 보기'), act: { type: 'stays' } }], chips: [C(mem, 'Tìm & đặt phòng', 'Find & book a room', '查找并预订房间', '숙소 찾기·예약')] };
  if (TRACK.test(n)) return { text: L(mem, 'Bạn gửi cho mình mã booking và số điện thoại đã dùng khi đặt (ví dụ: "AR-7K3M9P2Q 0912345678"), hoặc mở trang theo dõi booking.', 'Send me your booking code and the phone number you used (e.g. "AR-7K3M9P2Q 0912345678"), or open the booking tracking page.', '请发送订单号和预订时使用的手机号（例如："AR-7K3M9P2Q 0912345678"），或打开订单查询页面。', '예약 번호와 예약 시 사용한 전화번호를 보내주세요 (예: "AR-7K3M9P2Q 0912345678"). 또는 예약 조회 페이지를 열어보세요.'), actions: [{ label: L(mem, 'Mở trang theo dõi', 'Open tracking page', '打开订单查询页面', '예약 조회 페이지 열기'), act: { type: 'go', screen: 'track' } }] };
  if (COMPLAINT.test(n)) return foreign ? unsupported(mem) : beginComplaint(mem);
  if (CANCEL_START.test(n) && !POLICY_Q.test(n)) return foreign ? unsupported(mem) : beginCancel(mem, ctx);
  if (SUPPORT.test(n)) return foreign ? { text: L(mem, '', "Our support team can help you: open the support center. Please don't send ID documents.", '客服团队可以协助您：请打开客服中心。请勿发送身份证件信息。', '고객지원팀이 도와드릴 수 있어요. 고객지원 센터를 열어 주세요. 신분증 정보는 보내지 마세요.'), actions: [{ label: L(mem, '', 'Open support center', '打开客服中心', '고객지원 센터 열기'), act: { type: 'go', screen: 'support' } }] } : { text: 'Bạn có thể nhắn mình để gửi khiếu nại ngay trong chat, hoặc tra cứu ticket đã gửi (mã SP-XXXXXXXX kèm số điện thoại). Vui lòng không gửi thông tin giấy tờ tùy thân.', actions: [{ label: 'Mở trung tâm hỗ trợ', act: { type: 'go', screen: 'support' } }], chips: ['Gửi khiếu nại'] };
  const q = parseQuery(text, ctx.airport);
  if (q.maxPrice != null || q.maxKm != null || (q.flags.length && SEARCH.test(n))) return beginSearch(mem, text, ctx, { immediate: true });
  if (SHUTTLE.test(n)) return foreign ? unsupported(mem) : beginShuttle(mem);
  if (POLICY.test(n)) return foreign ? { text: L(mem, '', 'Each place has its own policy: places labelled "Free cancellation" let you cancel at no cost; others are non-refundable. You can pay at the hotel or online via SePay (bank QR transfer or card). To cancel or change dates, please use the booking tracking page.', '每家住宿都有各自的政策：标有“免费取消”的可免费取消，其余不可退款。您可以到店支付，也可以通过 SePay 在线支付（银行二维码转账或银行卡）。取消或改期请使用订单查询页面。', '숙소마다 정책이 달라요. "무료 취소" 표시가 있는 곳은 비용 없이 취소할 수 있고, 나머지는 환불되지 않아요. 호텔에서 결제하거나 SePay로 온라인 결제(은행 QR 이체 또는 카드)할 수 있어요. 취소나 날짜 변경은 예약 조회 페이지를 이용해 주세요.'), actions: [{ label: L(mem, '', 'Open tracking page', '打开订单查询页面', '예약 조회 페이지 열기'), act: { type: 'go', screen: 'track' } }], chips: [C(mem, 'Tìm & đặt phòng', 'Find & book a room', '查找并预订房间', '숙소 찾기·예약')] } : { text: 'Mỗi nơi nghỉ có chính sách riêng: nơi gắn nhãn “Hủy miễn phí” cho hủy không mất phí, nơi còn lại không hoàn hủy. Bạn có thể thanh toán tại khách sạn hoặc online qua SePay (chuyển khoản QR ngân hàng hoặc thẻ). Muốn hủy hoặc đổi ngày, mình có thể gửi yêu cầu giúp bạn ngay trong chat.', chips: ['Hủy / đổi ngày', 'Tìm & đặt phòng'] };
  if (SEARCH.test(n)) return beginSearch(mem, text, ctx);
  if (GREET.test(n)) return { say: 'greet', text: `${L(mem, 'Xin chào! Mình là trợ lý AIRREST. ', "Hello! I'm the AIRREST assistant. ", '您好！我是 AIRREST 助手。', '안녕하세요! AIRREST 도우미예요. ')}${MENU(mem)}`, chips: START_CHIPS(mem) };
  if (!ctx.noAi) { const r = await replyByAi(text, ctx, mem); if (r) return r; }
  mem.fails = fails + 1;
  if (mem.fails >= 2) { mem.fails = 0; return foreign ? unsupported(mem) : beginComplaint(mem, 'Có vẻ mình chưa hiểu đúng ý bạn, mình chuyển bạn sang bộ phận hỗ trợ nhé. '); }
  return { say: 'clarify', text: `${L(mem, 'Xin lỗi, mình chưa hiểu ý bạn. ', "Sorry, I didn't understand. ", '抱歉，我没有理解您的意思。', '죄송해요, 잘 이해하지 못했어요. ')}${MENU(mem)}`, chips: START_CHIPS(mem) };
}
