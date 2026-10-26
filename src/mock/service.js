// Mock service: thay cho API thật. Không có lời gọi mạng nào; mọi dữ liệu và phản hồi là MÔ PHỎNG (IFR-001, IFR-002).
// Độ trễ (SIM.latencyMs) là tham số mô phỏng để giao diện có trạng thái đang tải.
import { SIM } from '../config/simulation';
import { FLIGHTS, ERROR_CODE } from './flights';
import { dayOffsetOfIso } from '../lib/time';
import { isOpen } from '../lib/domain';
import { partner, allProperties, addBooking } from './partner';

const wait = (ms = SIM.latencyMs) => new Promise((r) => setTimeout(r, ms));
let failNext = false;
export const setFailNext = (v) => { failNext = !!v; };
export const getFailNext = () => failNext;
function maybeFail() {
  if (failNext) { const e = new Error('service'); e.kind = 'service'; throw e; }
}
const err = (kind, message) => { const e = new Error(message); e.kind = kind; return e; };

export const FLIGHT_CODE_RE = /^[A-Z]{2}\d{1,4}$/;

export async function lookupFlight({ code, dateIso }) {
  await wait();
  if (code === ERROR_CODE) throw err('service', 'Dịch vụ dữ liệu mô phỏng tạm thời lỗi');
  maybeFail();
  const off = dayOffsetOfIso(dateIso);
  const f = FLIGHTS.find((x) => x.code === code && x.dayOffset === off);
  if (!f) throw err('notfound', 'Không tìm thấy chuyến bay trong dữ liệu mô phỏng');
  return { ...f };
}

// FR-002: nhập thủ công. Giờ nhập theo “HH:MM”; giờ mô phỏng hiện tại là 23:08 hôm nay.
export async function buildManualFlight({ airport, newTime, schedTime, unknownTime }) {
  await wait(120);
  maybeFail();
  const now = 23 * 60 + 8;
  const toAbs = (hhmm, after) => {
    const [h, m] = hhmm.split(':').map(Number);
    let t = h * 60 + m;
    while (t <= after) t += 1440;
    return t;
  };
  const sched = schedTime ? (() => { const [h, m] = schedTime.split(':').map(Number); return h * 60 + m; })() : null;
  const newDep = unknownTime || !newTime ? null : toAbs(newTime, sched ?? now);
  let status = 'delayed';
  if (newDep != null && sched != null && newDep - sched <= 15) status = 'ontime';
  return {
    code: 'Nhập thủ công', manual: true, origin: airport, dest: '', dayOffset: 0, schedDep: sched, newDep, status,
    cause: 'unknown', distanceKm: null, now, updatedAt: now, scenario: 'noreply', unknownTime: newDep == null,
  };
}

export async function refreshFlight(flight, now) {
  await wait(200);
  maybeFail();
  return { ...flight, updatedAt: now };
}

const gone = new Set();
// Khách sạn/quản trị (ngoài MVP) có thể đổi dữ liệu cơ sở qua ./partner; `locked` = quản trị tạm khoá (không hiển thị cho người dùng cuối).
const withUpdated = (p, now) => {
  const m = { ...p, ...partner.override(p.id) };
  return { ...m, updatedAt: now + m.updatedAtOffsetMin, roomsLeft: gone.has(p.id) ? 0 : m.roomsLeft, locked: partner.isLocked(p.id) };
};

// Trả về toàn bộ cơ sở của sân bay (đã gắn “cập nhật lúc”); giao diện lọc “đang nhận khách” theo giờ mô phỏng hiện tại.
export async function searchProperties({ airport, now }) {
  await wait();
  maybeFail();
  const items = allProperties().filter((p) => p.airport === airport && !partner.isLocked(p.id)).map((p) => withUpdated(p, now));
  return { items, fetchedAt: now };
}

export function getProperty(id, now) {
  const p = allProperties().find((x) => x.id === id);
  return p ? withUpdated(p, now) : null;
}

export function alternatives({ airport, now, excludeIds = [], limit = 3 }) {
  return allProperties().filter((p) => p.airport === airport && !excludeIds.includes(p.id) && !partner.isLocked(p.id)).map((p) => withUpdated(p, now))
    .filter((p) => isOpen(p, now) && !p.soldOutOnConfirm).sort((a, b) => a.travelMin - b.travelMin).slice(0, limit);
}

export async function createBooking({ propertyId, name, method, now }) {
  await wait();
  maybeFail();
  const p = getProperty(propertyId, now);
  if (!p || p.locked || !isOpen(p, now)) throw err('closed', 'Cơ sở đã đóng nhận khách hoặc hết phòng');
  if (p.soldOutOnConfirm && !gone.has(p.id)) {
    gone.add(p.id);
    throw err('roomGone', 'Phòng vừa hết đúng lúc xác nhận');
  }
  const code = addBooking({ propertyId, name, method, now }); // khách sạn thấy đặt chỗ này ở khu vực khách sạn (FR-027)
  return { code, propertyId, name, method, createdAt: now, simulated: true };
}

let requestSeq = 0;
export function nextRequestCode() { requestSeq += 1; return `HT-${String(requestSeq).padStart(4, '0')}`; }
