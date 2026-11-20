// Giữ cuộc chat qua lần tải lại trang (sessionStorage: mất khi đóng tab, không chia sẻ giữa các tab). Hàm thuần, nhận storage để dễ kiểm thử.
// Nguyên tắc vì đây là chat có đặt tiền:
// - KHÔNG lưu `redirect` (không chuyển trang thanh toán lần nữa sau khi tải lại), tệp đính kèm, kết quả tra booking đầy đủ (mem.auth.full, tra lại khi cần) và cờ `busy`.
// - Đang ở bước xác nhận đặt thì bản tóm tắt cũ có thể đã lỗi thời (giá, tồn phòng): hủy luồng và mời khách bấm "Đặt" lại để tóm tắt lại với giá mới nhất.
//   Các bước trước đó (hỏi tên, SĐT, email, thanh toán) chưa hiện tiền nên khôi phục nguyên trạng.
// - Quá hạn (mặc định 2 giờ không hoạt động) thì bỏ hết: kết quả tìm và tồn phòng đã cũ.
import { L } from './botI18n';

export const CHAT_KEY = 'airrest-chat-v1';
export const CHAT_TTL_MS = 2 * 3600_000;
const MAX_MESSAGES = 30;
const MAX_BYTES = 1_500_000;
const MEM_KEYS = ['lang', 'hist', 'flow', 'step', 's', 'found', 'search', 'bk', 'pend', 'fails', 'auth', 'lastOrder', 'lastTicket'];
const MSG_KEYS = ['id', 'from', 'text', 'chips', 'hotels', 'actions']; // bỏ redirect, attach, say, slot, known

const pickKeys = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

function cleanMem(mem) {
  const m = pickKeys(mem, MEM_KEYS);
  if (m.auth) m.auth = { ...m.auth, full: null }; // dữ liệu booking đầy đủ: tra lại khi cần
  if (m.bk) m.bk = { ...m.bk, busy: false, methods: null }; // methods lấy lại từ API; busy không được "kẹt" sau khi tải lại
  return m;
}

export function saveChat(storage, messages, mem, now = Date.now()) {
  try {
    const build = (n) => JSON.stringify({ v: 1, savedAt: now, messages: messages.slice(-n).map((m) => pickKeys(m, MSG_KEYS)), mem: cleanMem(mem) });
    let json = build(MAX_MESSAGES);
    if (json.length > MAX_BYTES) json = build(10);
    if (json.length > MAX_BYTES) return false;
    storage.setItem(CHAT_KEY, json);
    return true;
  } catch { return false; } // sessionStorage bị chặn/đầy: bỏ qua, chat vẫn chạy bình thường
}

export function clearChat(storage) { try { storage.removeItem(CHAT_KEY); } catch { /* bỏ qua */ } }

// Trả { messages, mem } đã khôi phục, hoặc null nếu không có/hỏng/quá hạn.
export function loadChat(storage, now = Date.now()) {
  try {
    const raw = storage.getItem(CHAT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d?.v !== 1 || !Array.isArray(d.messages) || !d.messages.length || !d.mem || typeof d.savedAt !== 'number' || now - d.savedAt > CHAT_TTL_MS) { clearChat(storage); return null; }
    const mem = cleanMem(d.mem);
    const messages = d.messages.map((m) => pickKeys(m, MSG_KEYS));
    if (mem.flow === 'book' && mem.step === 'confirm') {
      mem.flow = null; mem.step = null; mem.bk = null;
      const id = Math.max(0, ...messages.map((m) => m.id ?? 0)) + 1;
      messages.push({ id, from: 'bot', text: L(mem, 'Trang vừa được tải lại nên mình chưa tạo đơn nào. Giá và phòng trống có thể đã đổi, bạn bấm "Đặt" ở nơi nghỉ muốn đặt để mình tóm tắt lại với giá mới nhất nhé.', 'The page was reloaded, so no order has been created. Prices and availability may have changed: please tap "Book" on the place you want so I can summarise it again with the latest price.', '页面刚刚重新加载，所以尚未创建任何订单。价格和空房可能已变化：请在想预订的住宿上点击“预订”，我会按最新价格重新为您总结。', '페이지가 새로고침되어 아직 주문을 만들지 않았어요. 가격과 빈 객실이 바뀌었을 수 있으니, 예약하려는 숙소에서 "예약"을 눌러 주시면 최신 가격으로 다시 정리해 드릴게요.') });
    }
    return { messages, mem };
  } catch { clearChat(storage); return null; }
}
