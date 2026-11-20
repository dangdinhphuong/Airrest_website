// Đa ngôn ngữ cho trợ lý chat: vi (mặc định) / en / zh / ko. Ngôn ngữ nhớ ở mem.lang.
// - Lời khách: tin gõ bằng ngôn ngữ khác được dịch sang tiếng Việt chuẩn (backend /v1/chat/normalize) rồi chạy qua bộ phân tích tiếng Việt đã có, nên mọi luồng hiểu được.
// - Lời bot: câu viết sẵn ba thứ tiếng (L/C bên dưới), KHÔNG để model tự dịch (đặc biệt phần tiền, xác nhận đặt). Nút bấm hiển thị theo ngôn ngữ khách
//   nhưng vẫn gửi giá trị tiếng Việt chuẩn ({ label, text }) để các luồng hiện có không đổi.
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const VI_MARK = /[àáạảãăằắặẳẵâầấậẩẫđèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/i;
const HANGUL = /[ᄀ-ᇿ가-힯]/;
const KANA = /[぀-ヿ]/;
const HAN = /[一-鿿]/;
const EN_WORD = /\b(the|i|we|need|want|would|like|could|should|will|room|rooms|hotel|airport|near|book|booking|please|how|what|where|when|why|which|my|tonight|tomorrow|night|nights|price|cheap|flight|hello|thanks|thank|you|for|with|from|are|is|do|does|any|have|there|pay|card|by|much|free|check|shuttle|adults|children|guest|guests|this|that|and|not|cancel|confirm)\b/gi;
const VI_PLAIN = /\b(toi|muon|phong|gan|san bay|khach|dat|nhieu|nao|khong|duoc|giup|minh|ban|cho|nhe)\b/gi; // bỏ "can" (cần không dấu) vì trùng chữ "can" tiếng Anh

// Ngôn ngữ của một tin gõ tay; mơ hồ ("hi", số, mã) thì giữ ngôn ngữ trước. Tiếng Nhật và ngôn ngữ khác chưa có bản dịch riêng: trả lời tiếng Anh.
export function detectLang(text, prev = 'vi') {
  if (HANGUL.test(text)) return 'ko';
  if (KANA.test(text)) return 'en';
  if (HAN.test(text)) return 'zh';
  if (VI_MARK.test(text)) return 'vi';
  const en = (text.match(EN_WORD) ?? []).length;
  const vi = (strip(text).match(VI_PLAIN) ?? []).length;
  return en > 0 && en > vi ? 'en' : prev;
}
export const isForeign = (mem) => !!mem?.lang && mem.lang !== 'vi';

// L: chọn câu theo mem.lang (thiếu bản thì lùi về en rồi vi). C: nút bấm — tiếng Việt giữ chuỗi thường, ngôn ngữ khác là { label, text: bản tiếng Việt }.
export const L = (mem, vi, en, zh, ko) => {
  switch (mem?.lang) {
    case 'en': return en ?? vi;
    case 'zh': return zh ?? en ?? vi;
    case 'ko': return ko ?? en ?? vi;
    default: return vi;
  }
};
export const C = (mem, vi, en, zh, ko) => (isForeign(mem) ? { label: L(mem, vi, en, zh, ko), text: vi } : vi);
export const chipText = (c) => (typeof c === 'string' ? c : c.text);
export const chipLabel = (c) => (typeof c === 'string' ? c : c.label);

// Tên sân bay hiển thị cho khách nước ngoài: bỏ dấu tiếng Việt ("Nội Bài" -> "Noi Bai").
export const plainName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

export const START_CHIPS = (mem) => [
  C(mem, 'Tìm & đặt phòng', 'Find & book a room', '查找并预订房间', '숙소 찾기·예약'),
  C(mem, 'Theo dõi booking', 'Track my booking', '查询订单', '예약 조회'),
  C(mem, 'Hủy / đổi ngày', 'Cancel / change dates', '取消 / 改期', '취소 / 날짜 변경'),
  C(mem, 'Xe đưa đón', 'Airport shuttle', '机场接送', '공항 셔틀'),
  C(mem, 'Gửi khiếu nại', 'Send a complaint', '提交投诉', '불만 접수'),
];
export const QUICK_CHIPS = (lang) => {
  const m = { lang };
  return [
    C(m, 'Tìm & đặt phòng', 'Find & book a room', '查找并预订房间', '숙소 찾기·예약'),
    C(m, 'Tra chuyến bay VN218', 'Check flight VN218', '查询航班 VN218', '항공편 VN218 조회'),
    C(m, 'Theo dõi booking', 'Track my booking', '查询订单', '예약 조회'),
    C(m, 'Hủy / đổi ngày', 'Cancel / change dates', '取消 / 改期', '취소 / 날짜 변경'),
    C(m, 'Xe đưa đón', 'Airport shuttle', '机场接送', '공항 셔틀'),
    C(m, 'Gửi khiếu nại', 'Send a complaint', '提交投诉', '불만 접수'),
  ];
};

export const MENU = (mem) => (isForeign(mem)
  ? L(mem, '', 'I can help you find and book a place to stay near the airport, check a flight, track a booking, or explain our policies. For cancellations, changes, airport shuttles or complaints, I will point you to the right page.',
    '我可以帮您查找并预订机场附近的住宿、查询航班、跟踪订单，或讲解相关政策。取消、改期、机场接送和投诉，我会为您指引到相应页面。',
    '공항 근처 숙소 검색·예약, 항공편 조회, 예약 조회, 정책 안내를 도와드릴 수 있어요. 취소, 날짜 변경, 공항 셔틀, 불만 접수는 알맞은 페이지로 안내해 드릴게요.')
  : 'Mình có thể giúp: tìm và đặt nơi nghỉ gần sân bay, tra chuyến bay, theo dõi booking, hủy/đổi ngày, đặt xe đưa đón, gửi khiếu nại hoặc giải thích chính sách.');

// Luồng hủy/đổi ngày, đặt xe, khiếu nại, ticket chưa có bản đa ngôn ngữ (xác thực, tiền, thông tin cá nhân): chỉ đường tới đúng trang, không để model tự dịch.
export const unsupported = (mem) => ({
  text: L(mem, '',
    'Sorry, cancellations, date changes, airport shuttles and complaints are only available in Vietnamese in this chat for now. You can manage your booking on the booking tracking page, or contact our support team and they will help you.',
    '抱歉，目前聊天中的取消、改期、机场接送和投诉功能仅支持越南语。您可以在订单查询页面管理订单，或联系客服团队，他们会协助您。',
    '죄송해요, 지금은 채팅에서 취소, 날짜 변경, 공항 셔틀, 불만 접수를 베트남어로만 처리할 수 있어요. 예약 조회 페이지에서 예약을 관리하시거나 고객지원팀에 문의해 주세요.'),
  actions: [
    { label: L(mem, '', 'Open tracking page', '打开订单查询页面', '예약 조회 페이지 열기'), act: { type: 'go', screen: 'track' } },
    { label: L(mem, '', 'Open support center', '打开客服中心', '고객지원 센터 열기'), act: { type: 'go', screen: 'support' } },
  ],
});

export const STATUS_L = {
  PENDING_PAYMENT: ['Chờ thanh toán', 'Awaiting payment', '待付款', '결제 대기'],
  PENDING: ['Chờ khách sạn xác nhận', 'Waiting for the hotel to confirm', '等待酒店确认', '호텔 확인 대기'],
  CONFIRMED: ['Đã được xác nhận', 'Confirmed', '已确认', '확정됨'],
  CHECKED_IN: ['Đã nhận phòng', 'Checked in', '已入住', '체크인 완료'],
  CHECKED_OUT: ['Đã trả phòng', 'Checked out', '已退房', '체크아웃 완료'],
  CANCELLED: ['Đã hủy', 'Cancelled', '已取消', '취소됨'],
  REJECTED: ['Bị từ chối', 'Declined', '已被拒绝', '거절됨'],
  EXPIRED: ['Đã hết hạn', 'Expired', '已过期', '만료됨'],
  NO_SHOW: ['Không đến nhận phòng', 'No-show', '未入住', '노쇼'],
};
export const statusIn = (mem, code, viCopy) => { const s = STATUS_L[code]; return s ? L(mem, ...s) : viCopy; };

export const FLAG_L = {
  shuttle: ['xe đưa đón', 'airport shuttle', '机场接送', '공항 셔틀'],
  freeCancel: ['hủy miễn phí', 'free cancellation', '免费取消', '무료 취소'],
  family: ['phòng gia đình', 'family room', '家庭房', '가족실'],
  hourly: ['thuê theo giờ', 'hourly stay', '钟点房', '시간제 이용'],
  open24: ['lễ tân 24/24', '24/7 reception', '24小时前台', '24시간 프런트'],
  rating: ['đánh giá cao', 'highly rated', '高评分', '높은 평점'],
};

// Lời ghi nhận điều khách vừa cho biết (đổi kiểu theo lượt cho đỡ máy móc).
export const ackFor = (mem, learned, turn) => {
  if (!learned) return '';
  const i = turn % 3;
  switch (mem?.lang) {
    case 'en': return `${['Got it: {x}.', 'Noted: {x}.', 'Okay, {x}.'][i].replace('{x}', learned)} `;
    case 'zh': return `${['好的，已记录：{x}。', '收到，{x}。', '明白了，{x}。'][i].replace('{x}', learned)}`;
    case 'ko': return `${['확인했어요: {x}.', '알겠어요, {x}.', '네, {x} 기록했어요.'][i].replace('{x}', learned)} `;
    default: return `${['Mình ghi nhận {x} rồi nhé.', 'Ok, {x} nhé.', 'Dạ, mình đã ghi lại {x}.'][i].replace('{x}', learned)} `;
  }
};

// Chữ giao diện của khung chat.
const UI = {
  placeholder: ['Nhập câu hỏi của bạn…', 'Type your question…', '请输入您的问题…', '질문을 입력하세요…'],
  typing: ['Đang trả lời…', 'Typing…', '正在回复…', '답변 중…'],
  subtitle: ['Tư vấn đặt phòng gần sân bay', 'Airport hotel booking assistant', '机场附近住宿预订助手', '공항 근처 숙소 예약 도우미'],
  night: ['/ đêm', '/ night', '/ 晚', '/ 박'],
  welcome: ['Xin chào! Mình là trợ lý AIRREST. Bạn đang gặp sự cố chuyến bay hay cần tìm nơi nghỉ gần sân bay? ', 'Hello! I\'m the AIRREST assistant. Is your flight disrupted, or do you need a place to stay near the airport? ', '您好！我是 AIRREST 助手。您是遇到航班问题，还是需要查找机场附近的住宿？', '안녕하세요! AIRREST 도우미예요. 항공편에 문제가 생기셨나요, 아니면 공항 근처 숙소가 필요하세요?'],
  send: ['Gửi', 'Send', '发送', '보내기'],
};
export const ui = (lang, key) => L({ lang }, ...UI[key]);
export const hotelPrice = (lang, h, money) => (h.hourly
  ? L({ lang }, `từ ${money(h.hourly.from)} / ${h.hourly.hours} giờ`, `from ${money(h.hourly.from)} / ${h.hourly.hours} hours`, `${money(h.hourly.from)} 起 / ${h.hourly.hours}小时`, `${money(h.hourly.from)}부터 / ${h.hourly.hours}시간`)
  : `${money(h.room.price)} ${ui(lang, 'night')}`);
export const hotelMeta = (lang, h) => (h.hourly ? L({ lang }, `${h.distanceKm} km · ${h.travelMinutes} phút đi xe · phòng theo giờ`, `${h.distanceKm} km · ${h.travelMinutes} min by car · hourly room`, `${h.distanceKm} 公里 · 车程 ${h.travelMinutes} 分钟 · 钟点房`, `${h.distanceKm} km · 차로 ${h.travelMinutes}분 · 시간제 객실`) : hotelMetaNight(lang, h));
const hotelMetaNight = (lang, h) => L({ lang },
  `${h.distanceKm} km · ${h.travelMinutes} phút đi xe · còn ${h.room.availableRooms} phòng`,
  `${h.distanceKm} km · ${h.travelMinutes} min by car · ${h.room.availableRooms} room(s) left`,
  `${h.distanceKm} 公里 · 车程 ${h.travelMinutes} 分钟 · 剩 ${h.room.availableRooms} 间`,
  `${h.distanceKm} km · 차로 ${h.travelMinutes}분 · 잔여 ${h.room.availableRooms}실`);
