// Phân tích chữ OCR từ ảnh thẻ lên tàu/vé điện tử: số hiệu chuyến bay, ngày bay, giờ khởi hành, tuyến bay.
// OCR hay đọc nhầm ký tự (vd. "16" thành "1€" hoặc "18") nên mọi kết quả từ đây phải để người dùng kiểm tra lại.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// Hãng phổ biến: chỉ để ưu tiên khi có nhiều ứng viên số hiệu, không dùng để loại.
const CARRIERS = new Set(['VN', 'VJ', 'QH', 'BL', 'VU', 'SQ', 'TG', 'MH', 'CX', 'KE', 'OZ', 'JL', 'NH', 'BR', 'CI', 'CZ', 'MU', 'CA', 'EK', 'QR', 'EY', 'TR', 'AK', 'FD', 'QF', 'GA', 'PR', '5J', 'D7', 'OD']);
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (s) => s.replace(/[Oo]/g, '0').replace(/[lI|!]/g, '1').replace(/€/g, '6').replace(/[Ss]/g, '5').replace(/B/g, '8');

function nearestYear(month, day, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  for (const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const d = new Date(y, month, day);
    if (d.getMonth() !== month) continue;
    if (!best || Math.abs(d - today) < Math.abs(best - today)) best = d;
  }
  return best?.getFullYear() ?? today.getFullYear();
}

function findDate(text, now) {
  const re = new RegExp(`([0-9OolI|€!]{1,2})\\s*[-/ ]?\\s*(${MONTHS.join('|')})[A-Z]*\\.?\\s*[-/ ,]?\\s*([0-9OolI|€!]{4}|[0-9OolI|€!]{2})?(?![0-9])`, 'gi');
  for (const m of text.matchAll(re)) {
    const day = Number(digitsOf(m[1]));
    const month = MONTHS.indexOf(m[2].toUpperCase());
    if (!(day >= 1 && day <= 31)) continue;
    let year = m[3] ? Number(digitsOf(m[3])) : NaN;
    if (year < 100) year += 2000;
    if (!(year >= 2000 && year <= 2100)) year = nearestYear(month, day, now);
    const d = new Date(year, month, day);
    if (d.getMonth() !== month) continue; // 31 FEB và tương tự
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }
  const num = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (num) {
    const [day, month, year] = [Number(num[1]), Number(num[2]) - 1, Number(num[3])];
    const d = new Date(year, month, day);
    if (d.getMonth() === month && d.getDate() === day) return `${year}-${pad(month + 1)}-${pad(day)}`;
  }
  return null;
}

function findFlight(text) {
  const up = text.toUpperCase();
  const cands = [...up.matchAll(/(?<![A-Z0-9])([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{3,4}[A-Z]?)(?![A-Z0-9])/g)]
    .filter((m) => m[1] !== 'AM' && m[1] !== 'PM')
    .map((m) => ({ code: `${m[1]}${m[2].replace(/^0+(?=\d)/, '')}`, at: m.index, carrier: m[1] }));
  const known = cands.find((c) => CARRIERS.has(c.carrier));
  if (known) return known.code;
  const label = up.search(/FLIGHT/);
  return (cands.find((c) => label >= 0 && c.at > label) ?? cands[0])?.code ?? null;
}

function findRoute(text) {
  const up = text.toUpperCase();
  const paren = [...up.matchAll(/[([{]\s*([A-Z]{3})\s*[)\]}]/g)].map((m) => m[1]);
  if (paren.length >= 2 && paren[0] !== paren[1]) return { from: paren[0], to: paren[1] };
  const slash = up.match(/(?<![A-Z])([A-Z]{3})\s*(?:\/|->|→|-|>)\s*([A-Z]{3})(?![A-Z])/);
  return slash && slash[1] !== slash[2] ? { from: slash[1], to: slash[2] } : {};
}

// Giờ khởi hành: giờ đầu tiên đứng sau nhãn "Departure"; không có nhãn thì bỏ qua (tránh nhầm với giờ ra cổng).
function findTime(text) {
  const at = text.search(/dep(arture|\.)?/i);
  if (at < 0) return null;
  const m = text.slice(at).match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*([AaPp][Mm])?/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2]);
  if (m[3]) { const pm = m[3].toLowerCase() === 'pm'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

// -> { flight, date, time?, from?, to? } hoặc null nếu thiếu số hiệu hoặc ngày.
export function parseTicketText(text, now = new Date()) {
  const t = String(text ?? '');
  const flight = findFlight(t);
  const date = findDate(t, now);
  if (!flight || !date) return null;
  const out = { flight, date, ...findRoute(t) };
  const time = findTime(t);
  if (time) out.time = time;
  return out;
}

// Bỏ họ tên, mã đặt chỗ/số vé, số điện thoại, email khỏi chữ OCR TRƯỚC khi gửi cho AI của hệ thống (giữ nguyên lời hứa "tên và mã đặt chỗ không được gửi đi").
// Giữ lại số hiệu chuyến (2 ký tự + 1-4 số), ngày (16AUG15), giờ, mã sân bay. Tên đứng sau danh xưng (MR/MRS/MS...) hoặc nhãn Name/Passenger, dừng ở nhãn khác;
// mọi từ của tên đó (từ 3 chữ trở lên) bị xóa cả những chỗ khác vì thẻ thường in tên hai lần.
const STOP = 'mr|mrs|ms|miss|mstr|mx|from|to|date|gate|flight|seat|boarding|departure|dep|class|economy|business|vietnam|airlines|name|passenger|pax';
const NAME_WORD = `(?!(?:${STOP})\\b)[A-Za-zÀ-ỹ'-]+`;
const NAME = new RegExp(`\\b(?:MR|MRS|MS|MISS|MSTR|MX|name|passenger|pax|tên|hành khách)\\b\\.?\\s*[:.]?\\s*((?:${NAME_WORD}\\s*){1,4})`, 'gi');
export function redactTicketText(text) {
  let t = String(text ?? '');
  const names = new Set();
  t = t.replace(NAME, (_, w) => { w.trim().split(/\s+/).forEach((x) => x.length >= 3 && names.add(x.toLowerCase())); return ' '; });
  if (names.size) t = t.replace(new RegExp(`\\b(?:${[...names].join('|')})\\b`, 'gi'), ' ');
  return t
    .replace(/\b(?:booking|ref(?:erence)?|pnr|record locator|mã đặt chỗ|mã đặt|e-?ticket|ticket|fqtv)\b[\s:.#-]*[A-Z0-9-]{4,}/gi, ' ')
    .replace(/\b[A-Z0-9]{5,8}\b/g, (w) => (/\d/.test(w) && /[A-Z]/.test(w) && !/^[A-Z0-9]{2}\d{1,4}$/.test(w) && !/^\d{1,2}[A-Z]{3}\d{0,4}$/.test(w) ? ' ' : w))
    .replace(/\d{8,}/g, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ')
    .replace(/(?:\+?84|0)(?:[\s.-]?\d){9,10}/g, ' ')
    .replace(/[ \t]+/g, ' ').trim();
}
