// Chữ hiển thị cho khách sạn / admin về dòng phòng và lưu trú, có hỗ trợ đơn theo giờ. Giờ theo múi giờ Việt Nam.
const vn = { timeZone: 'Asia/Ho_Chi_Minh' };
const hm = (v) => new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, ...vn });
const dmy = (v) => new Date(v).toLocaleDateString('vi-VN', vn);
const dmyHm = (v) => `${hm(v)} ${dmy(v)}`;
const isHourly = (l) => l.kind === 'HOURLY';

/** Một dòng phòng: 'Phòng giờ x2 · theo giờ 14:00 → 17:00 14/12/2026 (3 giờ)'. */
export const lineLabel = (l) => `${l.roomTypeName} x${l.qty}${isHourly(l) ? ` · theo giờ ${hm(l.startsAt)} → ${hm(l.endsAt)} ${dmy(l.startsAt)} (${l.hours} giờ)` : ''}`;

/** Lưu trú: toàn giờ = 'giờ vào → giờ ra', còn lại = khoảng ngày + số đêm (đơn trộn ghi thêm có phòng theo giờ). */
export const stayLabel = (stay) => (stay.type === 'HOURLY' ? `${dmyHm(stay.from)} → ${dmyHm(stay.to)} (theo giờ)` : `${dmyHm(stay.from)} → ${dmyHm(stay.to)} (${stay.nights} đêm${stay.type === 'MIXED' ? ' + phòng theo giờ' : ''})`);
export const stayShort = (stay) => (stay.type === 'HOURLY' ? `${dmy(stay.from)} ${hm(stay.from)}-${hm(stay.to)} (theo giờ)` : `${dmy(stay.from)} (${stay.nights} đêm${stay.type === 'MIXED' ? ' + giờ' : ''})`);
