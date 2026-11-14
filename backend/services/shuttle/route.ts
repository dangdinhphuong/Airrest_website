import { env } from '../../config/env';
import { AIRPORTS } from '../../data/airports';
import { db } from '../../database/pg';
import { logger } from '../../lib/logger';
import { publish } from './events';

// Tuyến + vị trí mô phỏng của chuyến OWN. Phần thuần (hình học, vị trí theo thời gian) không đụng DB/mạng nên test được; OSRM chỉ qua `fetchOsrm`.
export type LatLng = [number, number]; // [lat, lng]
export interface Route {
  approach: LatLng[]; ride: LatLng[];
  approachDistanceM: number; approachDurationS: number; rideDistanceM: number; rideDurationS: number;
  source: 'osrm' | 'straight';
}
export type Phase = 'APPROACH' | 'RIDE' | 'ARRIVED' | 'DONE';
export interface Position { lat: number; lng: number; heading: number; speedKmh: number; etaSec: number; phase: Phase }

// ---------- Hình học ----------
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineM(a: LatLng, b: LatLng): number {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const bearing = (a: LatLng, b: LatLng): number => {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
};
export const polyLen = (pts: LatLng[]): number => pts.reduce((s, p, i) => (i ? s + haversineM(pts[i - 1]!, p) : 0), 0);

/** Điểm cách đầu tuyến `d` mét (kẹp trong [0, độ dài]) + hướng đi của đoạn đang đứng. */
export function pointAt(pts: LatLng[], d: number): { lat: number; lng: number; heading: number } {
  let left = Math.max(0, d);
  let heading = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const seg = haversineM(a, b);
    if (seg > 0) heading = bearing(a, b);
    if (left <= seg && seg > 0) {
      const f = left / seg;
      return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, heading };
    }
    left -= seg;
  }
  const last = pts[pts.length - 1] ?? [0, 0];
  return { lat: last[0], lng: last[1], heading };
}

/** Vị trí là HÀM THUẦN của (trạng thái, mốc thời gian, now): không ghi DB mỗi tick. `remainingM`: còn lại của chặng hiện tại. */
export function computePosition(
  t: { status: string; route?: Route | null; enRouteAt?: Date | string; onboardAt?: Date | string },
  nowMs: number, speedKmh: number, scale: number,
): (Position & { remainingM: number }) | null {
  const r = t.route;
  if (!r?.approach?.length || !r.ride?.length) return null;
  const v = speedKmh / 3.6;
  const travelled = (from?: Date | string) => (from ? Math.max(0, ((nowMs - new Date(from).getTime()) / 1000) * scale * v) : 0);
  const mk = (pts: LatLng[], d: number, len: number, phase: Phase, moving: boolean): Position & { remainingM: number } => {
    const p = pointAt(pts, d);
    const remainingM = Math.max(0, len - d);
    return { ...p, speedKmh: moving && remainingM > 0 ? speedKmh : 0, etaSec: Math.ceil(remainingM / v / scale), phase, remainingM };
  };
  const alen = polyLen(r.approach), rlen = polyLen(r.ride);
  switch (t.status) {
    case 'ACCEPTED': return mk(r.approach, 0, alen, 'APPROACH', false);
    case 'EN_ROUTE': return mk(r.approach, Math.min(alen, travelled(t.enRouteAt)), alen, 'APPROACH', true);
    case 'ARRIVED': return { ...mk(r.approach, alen, alen, 'ARRIVED', false), etaSec: 0 };
    case 'ONBOARD': return mk(r.ride, Math.min(rlen, travelled(t.onboardAt)), rlen, 'RIDE', true);
    case 'DROPPED_OFF': return { ...mk(r.ride, rlen, rlen, 'DONE', false), etaSec: 0 };
    default: return null;
  }
}
export const tripPosition = (t: Parameters<typeof computePosition>[0], nowMs = Date.now()): Position | null => {
  const p = computePosition(t, nowMs, env.SHUTTLE_SIM_SPEED_KMH, env.SHUTTLE_SIM_TIME_SCALE);
  if (!p) return null;
  const { remainingM: _r, ...pos } = p;
  return { ...pos, lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) };
};

const SIM_VISIBLE = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD', 'DROPPED_OFF'];
/** Trường thêm cho DTO chuyến (khách/nhân sự/tài xế): chỉ chuyến OWN từ ACCEPTED trở đi và đã có tuyến. Không có -> {} (tương thích P1). */
export function simFields(t: any): { route?: Pick<Route, 'approach' | 'ride' | 'source'> & Partial<Route>; position?: Position } {
  if (!env.SHUTTLE_SIM_ENABLED || t.kind !== 'OWN' || !t.route || !SIM_VISIBLE.includes(t.status)) return {};
  const position = tripPosition(t);
  return { route: t.route, ...(position && { position }) };
}

// ---------- OSRM ----------
const cache = new Map<string, { pts: LatLng[]; distance: number; duration: number }>();
const key = (a: LatLng, b: LatLng) => [...a, ...b].map((n) => n.toFixed(5)).join(',');

/** Một chặng bằng OSRM: timeout 5s, cache theo cặp tọa độ (chỉ cache thành công, tối đa 200). Lỗi/timeout/phản hồi lạ -> null. */
export async function fetchOsrm(a: LatLng, b: LatLng): Promise<{ pts: LatLng[]; distance: number; duration: number } | null> {
  const k = key(a, b);
  const hit = cache.get(k);
  if (hit) return hit;
  try {
    const res = await fetch(`${env.OSRM_URL.replace(/\/$/, '')}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }> };
    const r = j.routes?.[0];
    const coords = r?.geometry?.coordinates;
    if (j.code !== 'Ok' || !r || !Array.isArray(coords) || coords.length < 2 || !coords.every((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))) return null;
    const out = { pts: coords.map(([lng, lat]) => [lat, lng] as LatLng), distance: r.distance, duration: r.duration };
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(k, out);
    return out;
  } catch (err) {
    logger.warn({ err: String(err) }, 'OSRM lỗi/timeout, dùng đường thẳng');
    return null;
  }
}
export const clearOsrmCache = (): void => cache.clear();

const MAX_PTS = 300; // polyline lưu/trả cho FE tối đa ~300 điểm mỗi chặng
export function downsample(pts: LatLng[], max = MAX_PTS): LatLng[] {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  const out = pts.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]!);
  return out;
}

async function leg(a: LatLng, b: LatLng): Promise<{ pts: LatLng[]; dist: number; dur: number; osrm: boolean }> {
  const v = env.SHUTTLE_SIM_SPEED_KMH / 3.6;
  if (haversineM(a, b) < 1) return { pts: [a, b], dist: 0, dur: 0, osrm: true }; // đứng yên (vd. đón ngay tại khách sạn)
  const o = await fetchOsrm(a, b);
  if (o) { const pts = downsample(o.pts); return { pts, dist: Math.round(o.distance), dur: Math.round(o.duration), osrm: true }; }
  const d = haversineM(a, b);
  return { pts: [a, b], dist: Math.round(d), dur: Math.round(d / v), osrm: false };
}

/** Tuyến: xe xuất phát ở khách sạn -> điểm đón (approach) -> điểm trả (ride). */
export async function buildRoute(start: LatLng, pickup: LatLng, dropoff: LatLng): Promise<Route> {
  const [ap, ri] = await Promise.all([leg(start, pickup), leg(pickup, dropoff)]);
  return {
    approach: ap.pts, ride: ri.pts, approachDistanceM: ap.dist, approachDurationS: ap.dur, rideDistanceM: ri.dist, rideDurationS: ri.dur,
    source: ap.osrm && ri.osrm ? 'osrm' : 'straight',
  };
}

/** Chiều TO_HOTEL: đón ở sân bay, trả tại khách sạn. TO_AIRPORT: đón tại khách sạn, trả ở sân bay. null nếu thiếu tọa độ. */
export function endpoints(direction: string, airportIata: string, hotelLocation: any): { start: LatLng; pickup: LatLng; dropoff: LatLng } | null {
  const c = hotelLocation?.coordinates;
  const ap = AIRPORTS.find((a) => a.iata === airportIata);
  if (!ap || !Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  const hotel: LatLng = [c[1], c[0]];
  const airport: LatLng = [ap.lat, ap.lng];
  return direction === 'TO_HOTEL' ? { start: hotel, pickup: airport, dropoff: hotel } : { start: hotel, pickup: hotel, dropoff: airport };
}

/** Tính và lưu tuyến một lần cho chuyến OWN (idempotent: đã có thì trả luôn). Phát TRIP_ROUTE_READY để client tải lại chi tiết. */
export async function ensureRoute(tripId: string): Promise<Route | null> {
  const r = (
    await db.query<any>(
      `SELECT t.id, t.route, t.status, t.booking_id, t.hotel_id, t.request_id, t.driver_account_id, q.direction, q.airport_iata, h.location
       FROM shuttle_trips t JOIN shuttle_requests q ON q.id = t.request_id JOIN hotels h ON h.id = t.hotel_id WHERE t.id = $1 AND t.kind = 'OWN'`,
      [tripId],
    )
  ).rows[0];
  if (!r) return null;
  if (r.route) return r.route as Route;
  const e = endpoints(r.direction, r.airportIata, r.location);
  if (!e) return null;
  const route = await buildRoute(e.start, e.pickup, e.dropoff);
  const saved = await db.query('UPDATE shuttle_trips SET route = $2::jsonb, updated_at = now() WHERE id = $1 AND route IS NULL RETURNING id', [tripId, JSON.stringify(route)]);
  if (saved.rowCount) publish({ type: 'TRIP_ROUTE_READY', hotelId: r.hotelId, bookingId: r.bookingId, requestId: r.requestId, tripId, audience: ['GUEST', 'HOTEL', 'DRIVER'], driverAccountId: r.driverAccountId, payload: { status: r.status } });
  return route;
}
