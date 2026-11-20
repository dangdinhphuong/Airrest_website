// Bảng chuyến bay công khai (chỉ đọc, dữ liệu mô phỏng): GET /api/v1/flights, /api/v1/flights/summary. Không đăng nhập.
import { api } from '../lib/api';

export { listAirports } from './user';

const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v) p.set(k, v); }); const s = p.toString(); return s ? `?${s}` : ''; };

// { airport, direction: 'departures'|'arrivals', date: 'YYYY-MM-DD', status?, limit? } -> { items, date, count, truncated, ... }
export const listFlightBoard = (q) => api.get(`/api/v1/flights${qs(q)}`, { auth: false });
// { date, items: [{ origin, total, delayed, cancelled }] }
export const getFlightSummary = (date) => api.get(`/api/v1/flights/summary${qs({ date })}`, { auth: false });
