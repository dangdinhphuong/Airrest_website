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
import { C, L, statusIn } from './botI18n';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const dmy = (iso) => iso.split('-').reverse().join('/');
const PHONE = /^(?:\+?84|0)\d{9,10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONFIRM = /^\s*xac nhan dat( phong)?\s*[.!]*\s*$/; // đúng cụm này (nút bấm hoặc gõ), không suy diễn từ "ok"
// Khách nước ngoài gõ tự do ở các bước đặt phòng (không qua bước dịch để tên/SĐT/xác nhận không bị biến đổi): nhận đúng cụm của từng ngôn ngữ.
const CONFIRM_X = /^\s*(confirm( booking)?|book it|确认(预订|订房|下单|订单)?|예약 ?확정|예약 ?확인|확정)\s*[.!。]*\s*$/i;
const STOP_X = /^\s*(stop|cancel|quit|never ?mind|no thanks|停止|取消|算了|不订了|중단|취소|그만|그만두기)\s*[.!。]*\s*$/i;
const SKIP_X = /^\s*(skip|no|none|no thanks|n\/a|跳过|不用|不需要|没有|无|건너뛰기|없어요|없음|괜찮아요|아니요)\s*[.!。]*\s*$/i;
const EDIT_X = /^\s*(edit( details)?|change( details)?|modify|修改(信息)?|更改|정보 ?수정|수정|변경)\s*[.!。]*\s*$/i;
const ONLINE_X = /\b(online|card|qr|bank transfer|sepay)\b|在线|线上|银行卡|二维码|扫码|온라인|카드|큐알|계좌이체/i;
const HOTEL_X = /\b(at the hotel|at hotel|on arrival|in person|cash|pay there)\b|到店|酒店支付|现场|前台|호텔에서|현장|도착 ?후|프런트/i;
export const BOOK_FREE = ['book.name', 'book.phone', 'book.email']; // bước nhập tự do: không bị ngắt bởi từ khóa luồng khác
const PAY_CHIP = {
  AT_HOTEL: (m) => C(m, 'Thanh toán tại khách sạn', 'Pay at the hotel', '到店支付', '호텔에서 결제'),
  SEPAY: (m) => C(m, 'Thanh toán online qua SePay', 'Pay online via SePay', '通过 SePay 在线支付', 'SePay로 온라인 결제'),
};
const payLabel = (m, id) => (id === 'AT_HOTEL' ? L(m, 'Tại khách sạn', 'At the hotel', '到店支付', '호텔에서 결제') : id === 'SEPAY' ? 'SePay' : PAY_LABEL[id] ?? id);
const BTN_CONFIRM = (m) => C(m, 'Xác nhận đặt', 'Confirm booking', '确认预订', '예약 확정');
const BTN_EDIT = (m) => C(m, 'Sửa thông tin', 'Edit details', '修改信息', '정보 수정');
const BTN_STOP = (m) => C(m, 'Dừng', 'Stop', '停止', '중단');
const BTN_SKIP = (m) => C(m, 'Bỏ qua', 'Skip', '跳过', '건너뛰기');
const goTrack = { label: 'Mở trang theo dõi', act: { type: 'go', screen: 'track' } };
const openHotel = (b, m) => ({ label: L(m, `Xem ${b.hotel.name}`, `View ${b.hotel.name}`, `查看 ${b.hotel.name}`, `${b.hotel.name} 보기`), act: { type: 'openProperty', id: b.hotel.id } });
const end = (mem, r) => { mem.flow = null; mem.step = null; mem.bk = null; return r; };
const ask = (b, slot, text, chips) => ({ say: 'ask', slot, known: `đặt phòng ${b.room.name} tại ${b.hotel.name}`, text, ...(chips && { chips }) });
// Chỉ chuyển trang tới http(s) (chặn javascript:/data: nếu phản hồi bị sửa).
const safeUrl = (u) => { if (typeof u !== 'string' || !u.trim()) return null; try { const x = new URL(u, typeof window === 'undefined' ? undefined : window.location.origin); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

// h = một nơi nghỉ trong kết quả tìm gần nhất (mem.found), đã có h.room = loại phòng rẻ nhất đủ chỗ.
export async function beginBook(mem, ctx, h) {
  const s = mem.search;
  if (!s?.dates || !s?.party) return { text: L(mem, 'Bạn tìm nơi nghỉ trước để mình biết ngày và số khách nhé.', 'Please search for a place to stay first so I know your dates and number of guests.', '请先搜索住宿，这样我才能知道您的日期和人数。', '먼저 숙소를 검색해 주세요. 그래야 날짜와 인원을 알 수 있어요.'), chips: [C(mem, 'Tìm & đặt phòng', 'Find & book a room', '查找并预订房间', '숙소 찾기·예약')] };
  if (s.flags?.includes('hourly')) return { text: L(mem, 'Phòng theo giờ cần chọn giờ vào cụ thể, bạn mở trang khách sạn để chọn giúp mình nhé.', 'Hourly rooms need a specific start time, so please open the hotel page to choose it.', '钟点房需要选择具体的入住时间，请打开酒店页面进行选择。', '시간제 객실은 시작 시간을 정해야 해서, 숙소 페이지를 열어 선택해 주세요.'), actions: [{ label: L(mem, `Mở ${h.name}`, `Open ${h.name}`, `打开 ${h.name}`, `${h.name} 열기`), act: { type: 'openProperty', id: h.id } }] };
  const b = { hotel: { id: h.id, name: h.name, freeCancel: !!h.freeCancel }, room: { id: h.room.id, name: h.room.name }, dates: s.dates, party: s.party, key: null, busy: false, methods: null, emailDone: false };
  const u = ctx.user; // khách đã đăng nhập: dùng sẵn họ tên/SĐT của tài khoản (vẫn hiện lại ở bản tóm tắt để khách kiểm)
  if (u?.fullName) b.name = String(u.fullName).trim();
  if (u?.phone && PHONE.test(String(u.phone).replace(/[\s.-]/g, ''))) b.phone = String(u.phone).replace(/[\s.-]/g, '');
  mem.flow = 'book'; mem.bk = b;
  return bookStep(mem, L(mem, `Được nhé, mình đặt giúp bạn ${h.name}. `, `Sure, I'll book ${h.name} for you. `, `好的，我来帮您预订${h.name}。`, `네, ${h.name} 예약을 도와드릴게요. `));
}

async function bookStep(mem, lead = '') {
  const b = mem.bk;
  if (!b.name) { mem.step = 'name'; return ask(b, 'name', `${lead}${L(mem, 'Cho mình xin họ và tên người đặt nhé?', 'May I have the full name of the person booking?', '请问预订人的姓名是？', '예약하시는 분의 성함을 알려주시겠어요?')}`); }
  if (!b.phone) { mem.step = 'phone'; return ask(b, 'phone', `${lead}${L(mem, 'Số điện thoại liên hệ của bạn là gì?', 'What is your contact phone number? (a Vietnamese number is required, e.g. 0912345678 or +84912345678)', '请问您的联系电话是多少？（需要越南号码，例如 0912345678 或 +84912345678）', '연락 가능한 전화번호를 알려주세요. (베트남 번호가 필요해요. 예: 0912345678 또는 +84912345678)')}`); }
  if (!b.emailDone) { mem.step = 'email'; return ask(b, 'email', `${lead}${L(mem, 'Bạn có muốn để lại email để nhận thông tin đặt phòng không? (không bắt buộc)', 'Would you like to leave an email to receive the booking details? (optional)', '需要留下邮箱以接收订单信息吗？（选填）', '예약 정보를 받을 이메일을 남기시겠어요? (선택)')}`, [BTN_SKIP(mem)]); }
  if (!b.pay) {
    b.methods ??= await listPaymentMethods().catch(() => AT_HOTEL_ONLY);
    if (b.methods.length === 1) b.pay = b.methods[0].id;
    else { mem.step = 'pay'; return ask(b, 'pay', `${lead}${L(mem, 'Bạn muốn thanh toán tại khách sạn hay online qua SePay?', 'Would you like to pay at the hotel or online via SePay?', '您想在酒店付款，还是通过 SePay 在线支付？', '호텔에서 결제하시겠어요, 아니면 SePay로 온라인 결제하시겠어요?')}`, b.methods.map((m) => PAY_CHIP[m.id]?.(mem)).filter(Boolean)); }
  }
  return summary(mem, lead);
}

// Bản tóm tắt gồm tổng tiền do backend tính: khách phải bấm/gõ đúng "Xác nhận đặt" (hoặc cụm tương đương trong ngôn ngữ của họ) thì mới tạo đơn.
async function summary(mem, lead = '') {
  const b = mem.bk;
  let q;
  try { q = await quoteBooking({ hotelId: b.hotel.id, rooms: [{ roomTypeId: b.room.id, qty: b.party.rooms }], checkIn: b.dates.checkIn, checkOut: b.dates.checkOut }); }
  catch (e) { return end(mem, { text: `${describeApiError(e)} ${L(mem, 'Chưa có đơn nào được tạo.', 'No booking has been created.', '尚未创建任何订单。', '아직 생성된 예약은 없어요.')}`, chips: [C(mem, 'Tìm lại từ đầu', 'Start a new search', '重新搜索', '처음부터 다시 검색')] }); }
  b.key ??= newIdempotencyKey();
  b.total = q.totalVnd;
  mem.step = 'confirm';
  const guests = b.party.adults + b.party.children;
  const fee = q.serviceFeeVnd ? L(mem, ` + phí dịch vụ ${money(q.serviceFeeVnd)}`, ` + service fee ${money(q.serviceFeeVnd)}`, ` + 服务费 ${money(q.serviceFeeVnd)}`, ` + 서비스 수수료 ${money(q.serviceFeeVnd)}`) : '';
  const online = b.pay === 'SEPAY';
  const text = [
    `${lead}${L(mem, 'Mình tóm tắt đơn để bạn kiểm tra nhé:', "Here's a summary of your booking, please check it:", '以下是您的订单摘要，请核对：', '예약 내용을 정리했어요. 확인해 주세요:')}`,
    L(mem, `• Nơi nghỉ: ${b.hotel.name}`, `• Hotel: ${b.hotel.name}`, `• 酒店：${b.hotel.name}`, `• 숙소: ${b.hotel.name}`),
    L(mem, `• Phòng: ${b.room.name} × ${b.party.rooms}`, `• Room: ${b.room.name} × ${b.party.rooms}`, `• 房型：${b.room.name} × ${b.party.rooms}`, `• 객실: ${b.room.name} × ${b.party.rooms}`),
    L(mem, `• Nhận phòng ${dmy(b.dates.checkIn)}, trả phòng ${dmy(b.dates.checkOut)} (${q.nights} đêm)`, `• Check-in ${dmy(b.dates.checkIn)}, check-out ${dmy(b.dates.checkOut)} (${q.nights} night(s))`, `• 入住 ${dmy(b.dates.checkIn)}，退房 ${dmy(b.dates.checkOut)}（${q.nights}晚）`, `• 체크인 ${dmy(b.dates.checkIn)}, 체크아웃 ${dmy(b.dates.checkOut)} (${q.nights}박)`),
    L(mem, `• Số khách: ${guests}`, `• Guests: ${guests}`, `• 人数：${guests}`, `• 인원: ${guests}명`),
    L(mem, `• Người đặt: ${b.name}, SĐT ${b.phone}${b.email ? `, email ${b.email}` : ''}`, `• Booked by: ${b.name}, phone ${b.phone}${b.email ? `, email ${b.email}` : ''}`, `• 预订人：${b.name}，电话 ${b.phone}${b.email ? `，邮箱 ${b.email}` : ''}`, `• 예약자: ${b.name}, 전화 ${b.phone}${b.email ? `, 이메일 ${b.email}` : ''}`),
    L(mem, `• Thanh toán: ${PAY_LABEL[b.pay] ?? b.pay}`, `• Payment: ${payLabel(mem, b.pay)}`, `• 付款方式：${payLabel(mem, b.pay)}`, `• 결제: ${payLabel(mem, b.pay)}`),
    L(mem, `• Tiền phòng ${money(q.roomVnd)}${fee}, tổng ${money(q.totalVnd)}`, `• Room ${money(q.roomVnd)}${fee}, total ${money(q.totalVnd)}`, `• 房费 ${money(q.roomVnd)}${fee}，合计 ${money(q.totalVnd)}`, `• 객실 ${money(q.roomVnd)}${fee}, 합계 ${money(q.totalVnd)}`),
    L(mem, `• Hủy: ${b.hotel.freeCancel ? 'có thể hủy miễn phí theo chính sách của khách sạn' : 'mức giá này không hoàn hủy'}`, `• Cancellation: ${b.hotel.freeCancel ? "free cancellation according to the hotel's policy" : 'this rate is non-refundable'}`, `• 取消政策：${b.hotel.freeCancel ? '可按酒店政策免费取消' : '该价格不可退款'}`, `• 취소: ${b.hotel.freeCancel ? '호텔 정책에 따라 무료 취소 가능' : '이 요금은 환불되지 않아요'}`),
    L(mem, `Bạn xác nhận đặt phòng này chứ? Bấm "Xác nhận đặt" thì mình mới tạo đơn${online ? ' và chuyển bạn sang trang thanh toán SePay' : ''}.`,
      `Do you confirm this booking? Tap "Confirm booking" and I'll create the order${online ? ' and take you to the SePay payment page' : ''}.`,
      `您确认预订吗？点击“确认预订”后我才会创建订单${online ? '，并带您前往 SePay 支付页面' : ''}。`,
      `이 예약을 확정하시겠어요? "예약 확정"을 누르시면 주문을 만들${online ? '고 SePay 결제 페이지로 이동해 드릴게요' : '어 드릴게요'}.`),
  ].join('\n');
  return { text, chips: [BTN_CONFIRM(mem), BTN_EDIT(mem), BTN_STOP(mem)], actions: [openHotel(b, mem)] };
}

export async function bookFlow(text, n, ctx, mem) {
  const b = mem.bk;
  if (!b) return end(mem, null);
  const t = text.trim();
  if (/^(dung|thoi|huy bo|thoat)$/.test(n.trim()) || STOP_X.test(t)) return end(mem, { text: L(mem, 'Mình đã dừng việc đặt phòng, chưa tạo đơn nào. Cần gì bạn cứ nhắn mình nhé.', "I've stopped the booking, no order was created. Message me anytime you need anything.", '已停止预订，没有创建任何订单。有需要随时告诉我。', '예약을 중단했어요. 생성된 주문은 없어요. 필요하시면 언제든 말씀해 주세요.'), chips: [C(mem, 'Tìm & đặt phòng', 'Find & book a room', '查找并预订房间', '숙소 찾기·예약')] });
  switch (mem.step) {
    case 'name': {
      const v = t.replace(/\s+/g, ' ');
      if (v.length < 2 || v.length > 80 || /\d{3,}/.test(v)) return ask(b, 'name', L(mem, 'Mình chưa nhận được họ tên, bạn nhập lại giúp mình nhé (ví dụ: Nguyễn Văn An)?', "I didn't catch the name. Could you enter it again (e.g. John Smith)?", '没有识别到姓名，请重新输入（例如：张伟）。', '성함을 확인하지 못했어요. 다시 입력해 주시겠어요? (예: 홍길동)'));
      b.name = v; return bookStep(mem);
    }
    case 'phone': {
      const p = text.replace(/[\s.-]/g, '');
      if (!PHONE.test(p)) return ask(b, 'phone', L(mem, 'Số điện thoại chưa đúng, bạn nhập lại giúp mình nhé (ví dụ: 0912345678)?', "That phone number doesn't look right. Please enter a Vietnamese number again (e.g. 0912345678 or +84912345678).", '电话号码似乎不正确，请重新输入越南号码（例如：0912345678 或 +84912345678）。', '전화번호가 올바르지 않은 것 같아요. 베트남 번호를 다시 입력해 주세요. (예: 0912345678 또는 +84912345678)'));
      b.phone = p; return bookStep(mem);
    }
    case 'email': {
      if (/^(bo qua|khong|ko|thoi|khong can)\b/.test(n.trim()) || SKIP_X.test(t)) b.emailDone = true;
      else if (EMAIL.test(t)) { b.email = t; b.emailDone = true; }
      else return ask(b, 'email', L(mem, 'Email chưa đúng, bạn nhập lại hoặc bấm "Bỏ qua" nhé?', 'That email doesn\'t look right. Enter it again or tap "Skip".', '邮箱格式似乎不正确，请重新输入或点击“跳过”。', '이메일이 올바르지 않은 것 같아요. 다시 입력하시거나 "건너뛰기"를 눌러 주세요.'), [BTN_SKIP(mem)]);
      return bookStep(mem);
    }
    case 'pay': {
      const m = /sepay|online|truc tuyen|chuyen khoan|qr|the\b/.test(n) || ONLINE_X.test(t) ? 'SEPAY' : /khach san|tai cho|khi nhan|truc tiep/.test(n) || HOTEL_X.test(t) ? 'AT_HOTEL' : null;
      if (!m || !b.methods?.some((x) => x.id === m)) return ask(b, 'pay', L(mem, 'Bạn chọn giúp mình: thanh toán tại khách sạn hay online qua SePay?', 'Please choose: pay at the hotel or online via SePay?', '请选择：到店支付，还是通过 SePay 在线支付？', '선택해 주세요: 호텔에서 결제하시겠어요, SePay로 온라인 결제하시겠어요?'), b.methods.map((x) => PAY_CHIP[x.id]?.(mem)).filter(Boolean));
      b.pay = m; return bookStep(mem);
    }
    case 'confirm': {
      if (CONFIRM.test(n) || CONFIRM_X.test(t)) return placeOrder(mem);
      if (/^(sua|sua thong tin|doi thong tin)$/.test(n.trim()) || EDIT_X.test(t)) { Object.assign(b, { name: null, phone: null, email: null, emailDone: false, pay: null, key: null }); return bookStep(mem, L(mem, 'Được nhé, mình nhập lại thông tin. ', "Sure, let's enter the details again. ", '好的，我们重新填写信息。', '네, 정보를 다시 입력할게요. ')); }
      return { text: L(mem, 'Mình chưa tạo đơn nào nhé. Nếu bạn đồng ý thì bấm "Xác nhận đặt" (hoặc gõ đúng "Xác nhận đặt"); muốn đổi thông tin thì chọn "Sửa thông tin", không đặt nữa thì chọn "Dừng".', 'I haven\'t created any order yet. If you agree, tap "Confirm booking" (or type exactly "Confirm booking"); to change details choose "Edit details", or choose "Stop" if you don\'t want to book.', '我还没有创建任何订单。如果您同意，请点击“确认预订”（或准确输入“确认预订”）；想修改信息请选择“修改信息”，不想预订请选择“停止”。', '아직 주문을 만들지 않았어요. 동의하시면 "예약 확정"을 누르시거나 정확히 "예약 확정"이라고 입력해 주세요. 정보를 바꾸려면 "정보 수정", 예약하지 않으시려면 "중단"을 선택해 주세요.'), chips: [BTN_CONFIRM(mem), BTN_EDIT(mem), BTN_STOP(mem)] };
    }
    default: return end(mem, null);
  }
}

async function placeOrder(mem) {
  const b = mem.bk;
  if (b.busy) return { text: L(mem, 'Đơn đang được xử lý, bạn chờ chút nhé.', 'Your order is being processed, please wait a moment.', '订单正在处理中，请稍候。', '주문을 처리하고 있어요. 잠시만 기다려 주세요.') };
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
    const track = { label: L(mem, 'Mở trang theo dõi', 'Open tracking page', '打开订单查询页面', '예약 조회 페이지 열기'), act: { type: 'go', screen: 'track' } };
    if (online && url) return end(mem, { text: L(mem, `Đơn ${r.code} đã được tạo và đang giữ phòng cho bạn. Mình chuyển bạn sang trang thanh toán SePay (tổng ${money(total)}) ngay đây; nếu trang không tự mở, bạn bấm nút bên dưới nhé.`, `Order ${r.code} has been created and your room is being held. I'm taking you to the SePay payment page now (total ${money(total)}); if it doesn't open by itself, tap the button below.`, `订单 ${r.code} 已创建，房间已为您保留。我现在带您前往 SePay 支付页面（合计 ${money(total)}）；如果页面没有自动打开，请点击下方按钮。`, `주문 ${r.code}이(가) 생성되어 객실을 잡아 두었어요. 지금 SePay 결제 페이지로 이동할게요 (합계 ${money(total)}). 자동으로 열리지 않으면 아래 버튼을 눌러 주세요.`), redirect: url, actions: [{ label: L(mem, 'Thanh toán ngay', 'Pay now', '立即支付', '지금 결제'), act: { type: 'pay', url } }, track] });
    if (online) return end(mem, { text: L(mem, `Đơn ${r.code} đã được tạo nhưng mình chưa lấy được link thanh toán. Bạn mở trang theo dõi, nhập mã ${r.code} và số điện thoại để thanh toán nhé.`, `Order ${r.code} has been created but I couldn't get the payment link. Please open the tracking page and enter code ${r.code} and your phone number to pay.`, `订单 ${r.code} 已创建，但我未能获取支付链接。请打开订单查询页面，输入订单号 ${r.code} 和手机号完成支付。`, `주문 ${r.code}이(가) 생성되었지만 결제 링크를 가져오지 못했어요. 예약 조회 페이지에서 예약 번호 ${r.code}와 전화번호를 입력해 결제해 주세요.`), actions: [track] });
    const st = statusCopy(r.status);
    return end(mem, { text: L(mem, `Mình đã tạo đơn ${r.code} cho bạn (trạng thái: ${st}). Bạn thanh toán tại khách sạn khi nhận phòng, và theo dõi đơn bằng mã này cùng số điện thoại vừa nhập nhé.`, `I've created order ${r.code} for you (status: ${statusIn(mem, r.status, st)}). You pay at the hotel on arrival, and you can track the order with this code and the phone number you entered.`, `我已为您创建订单 ${r.code}（状态：${statusIn(mem, r.status, st)}）。您到店入住时付款，并可用此订单号和刚才输入的手机号查询订单。`, `주문 ${r.code}을(를) 만들었어요 (상태: ${statusIn(mem, r.status, st)}). 체크인할 때 호텔에서 결제하시고, 이 번호와 입력하신 전화번호로 주문을 조회할 수 있어요.`), actions: [track], chips: [C(mem, 'Theo dõi booking', 'Track my booking', '查询订单', '예약 조회')] });
  } catch (e) {
    const none = L(mem, 'Chưa có đơn nào được tạo.', 'No order has been created.', '尚未创建任何订单。', '아직 생성된 주문은 없어요.');
    if (e.status === 409 && e.code === 'SOLD_OUT') return end(mem, { text: L(mem, 'Rất tiếc, phòng này vừa hết trong ngày bạn chọn. Chưa có đơn nào được tạo. Mình tìm lại cho bạn nhé?', 'Sorry, this room has just sold out for your dates. No order has been created. Shall I search again?', '很遗憾，您选择的日期该房型刚刚售罄。尚未创建任何订单。要我重新搜索吗？', '죄송해요, 선택하신 날짜의 이 객실이 방금 매진되었어요. 생성된 주문은 없어요. 다시 검색해 드릴까요?'), chips: [C(mem, 'Tìm lại từ đầu', 'Start a new search', '重新搜索', '처음부터 다시 검색')] });
    if (e.code === 'SEPAY_DISABLED') { b.pay = 'AT_HOTEL'; b.methods = AT_HOTEL_ONLY; b.key = null; return summary(mem, L(mem, 'Cổng thanh toán online đang tạm tắt nên mình chuyển sang thanh toán tại khách sạn. ', 'Online payment is temporarily unavailable, so I switched to paying at the hotel. ', '在线支付暂时关闭，所以我改为到店支付。', '온라인 결제가 일시적으로 중단되어 호텔 결제로 바꿨어요. ')); }
    const fe = bookingFieldError(e);
    if (fe) return end(mem, { text: `${fe.text} ${none} ${L(mem, 'Bạn mở trang khách sạn để chỉnh giúp mình nhé.', 'Please open the hotel page to adjust.', '请打开酒店页面进行调整。', '숙소 페이지를 열어 조정해 주세요.')}`, actions: [openHotel(b, mem)] });
    if (e.status === 429) return { text: L(mem, 'Hệ thống đang giới hạn số lần thử. Bạn chờ khoảng một phút rồi bấm "Xác nhận đặt" lại, mình vẫn giữ thông tin của bạn.', 'The system is limiting attempts. Please wait about a minute and tap "Confirm booking" again; I\'m keeping your details.', '系统正在限制尝试次数。请等待约一分钟后再次点击“确认预订”，我会保留您的信息。', '시스템이 시도 횟수를 제한하고 있어요. 1분쯤 기다린 뒤 "예약 확정"을 다시 눌러 주세요. 입력하신 정보는 그대로 두고 있어요.'), chips: [BTN_CONFIRM(mem)] };
    // Lỗi không rõ (mạng...): giữ nguyên idempotencyKey, thử lại không tạo hai đơn.
    return { text: `${describeApiError(e)} ${L(mem, 'Mình chưa chắc đơn đã được tạo hay chưa. Bạn bấm "Xác nhận đặt" lại (mình dùng cùng mã chống trùng nên không tạo hai đơn), hoặc mở trang theo dõi để kiểm tra.', "I'm not sure whether the order was created. Tap \"Confirm booking\" again (I use the same duplicate-protection code, so it won't create two orders), or open the tracking page to check.", '我不确定订单是否已创建。请再次点击“确认预订”（我使用同一防重复码，不会创建两个订单），或打开订单查询页面核实。', '주문이 생성되었는지 확실하지 않아요. "예약 확정"을 다시 눌러 주세요 (같은 중복 방지 코드를 사용하므로 주문이 두 번 생기지 않아요). 또는 예약 조회 페이지에서 확인해 주세요.')}`, chips: [BTN_CONFIRM(mem)], actions: [{ label: L(mem, 'Mở trang theo dõi', 'Open tracking page', '打开订单查询页面', '예약 조회 페이지 열기'), act: { type: 'go', screen: 'track' } }] };
  } finally { b.busy = false; }
}
