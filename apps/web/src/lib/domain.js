import { SIM } from '../config/simulation';

// Trạng thái hiển thị của chuyến bay (FR-001..FR-004). Dữ liệu chuyến bay là MÔ PHỎNG (D1).
export function delayMinutes(f) {
  if (f.status !== 'delayed' || f.newDep == null || f.schedDep == null) return null;
  return f.newDep - f.schedDep;
}

// Thời điểm bay hiệu lực để tính toán (giờ mới nếu có).
export const effectiveDep = (f) => (f.status === 'cancelled' ? null : (f.newDep ?? null));

// Giờ có mặt, giờ rời nơi nghỉ, thời gian nghỉ — công thức đang chờ PO (OQ-04); tham số hóa ở config.
export function restPlan(f, property, now) {
  const dep = effectiveDep(f);
  if (dep == null || !property) return null;
  const arriveAirport = dep - SIM.arrivalLeadMin;
  const reachProperty = now + property.travelMin;
  const leaveProperty = arriveAirport - property.travelMin - SIM.leaveBufferMin;
  const restMin = leaveProperty - reachProperty;
  return { dep, arriveAirport, reachProperty, leaveProperty, restMin, travelMin: property.travelMin };
}

export function leaveTime(f, property) {
  const dep = effectiveDep(f);
  if (dep == null || !property) return null;
  return dep - SIM.arrivalLeadMin - property.travelMin - SIM.leaveBufferMin;
}

// Nơi nghỉ đang nhận khách tại thời điểm `now` (BR-003, D-21: giờ nhận phòng cuối hoặc lễ tân 24/24).
export function closeAbs(p, now) {
  const base = Math.floor((now - 720) / 1440) * 1440 + 720; // 12:00 gần nhất trước `now`
  return base + (p.closeExtHour - 12) * 60;
}
export function isOpen(p, now) {
  if (p.roomsLeft <= 0) return false;
  return p.reception24 || now <= closeAbs(p, now);
}
export function receptionLabel(p, now) {
  if (p.reception24) return 'Lễ tân 24/24';
  const c = closeAbs(p, now);
  const d = ((c % 1440) + 1440) % 1440;
  return `Nhận khách đến ${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
}

export const CHIPS = [
  { id: 'freeCancel', label: 'Huỷ miễn phí', test: (p) => p.freeCancel },
  { id: 'hourly', label: 'Thuê theo giờ', test: (p) => p.hourly },
  { id: 'family', label: 'Phù hợp gia đình', test: (p) => p.familyRoom },
  { id: 'shuttle', label: 'Có xe đưa đón', test: (p) => p.shuttle !== 'none' },
];

// Cập nhật khi giờ bay đổi (FR-004, FR-016, FR-023).
export function applyTimeChange(f, deltaMin, now) {
  const from = f.newDep ?? f.schedDep ?? f.now;
  const to = from + deltaMin;
  return { ...f, status: 'delayed', unknownTime: false, newDep: to, updatedAt: now, change: { from, to, at: now } };
}
