import { emitToRoom, rooms } from '../../api/realtime/socket';
import { env } from '../../config/env';
import { db } from '../../database/pg';
import { logger } from '../../lib/logger';
import { shuttleBus, type ShuttleEvent } from './events';
import { computePosition, ensureRoute, type Route } from './route';
import { allowedRideHosts, hostAllowed } from './externalLink';
import { systemSetExternal, systemStep } from './trips';

// Mô phỏng chuyến OWN: vị trí = hàm thuần của (trạng thái, mốc thời gian) (route.ts), không ghi DB mỗi tick.
// Bộ đếm duy nhất quét DB: khôi phục sau restart chỉ cần route + mốc thời gian đã lưu.
const START_DELAY_S = 4; // ACCEPTED -> EN_ROUTE (giây mô phỏng, chia cho TIME_SCALE)
const ARRIVED_WAIT_S = 4; // ARRIVED -> ONBOARD
const EXT_BOOK_DELAY_S = 8; // NEEDS_EXTERNAL -> tự "đặt xe ngoài" nếu nhân sự chưa nhập (giây mô phỏng)
const EXT_ARRIVE_S = 10; // xe ngoài mô phỏng: ACCEPTED -> ARRIVED
const EXT_BOARD_S = 6; // ARRIVED -> ONBOARD
const EXT_RIDE_S = 10; // ONBOARD -> DROPPED_OFF
const AUTO_MAX_AGE_H = 12; // không tự chạy chuyến ACCEPTED đã cũ (dữ liệu demo tồn từ hôm trước)

const SELECT = `SELECT t.id, t.status, t.hotel_id, t.booking_id, t.driver_account_id, t.route, t.accepted_at, t.en_route_at, t.arrived_at, t.onboard_at, b.code AS booking_code
  FROM shuttle_trips t JOIN bookings b ON b.id = t.booking_id WHERE t.kind = 'OWN'`;

async function emitPosition(r: any, nowMs = Date.now()): Promise<void> {
  const p = computePosition(r, nowMs, env.SHUTTLE_SIM_SPEED_KMH, env.SHUTTLE_SIM_TIME_SCALE);
  if (!p) return;
  const { remainingM: _r, ...pos } = p;
  const msg = { tripId: r.id, ...pos, lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6), at: new Date(nowMs).toISOString() };
  emitToRoom(rooms.booking(r.bookingCode), 'trip:position', msg);
  emitToRoom(rooms.hotelShuttle(r.hotelId), 'trip:position', msg);
  emitToRoom(rooms.adminShuttle(), 'trip:position', msg);
  if (r.driverAccountId) emitToRoom(rooms.driver(r.driverAccountId), 'trip:position', msg);
}

/** Dữ liệu xe ngoài GIẢ nhưng qua đúng validateShareUrl. Provider chọn xác định theo id; host không có trong EXTERNAL_RIDE_LINK_HOSTS thì dùng host đầu danh sách. */
export function demoExternal(id: string, nowMs = Date.now(), scale = env.SHUTTLE_SIM_TIME_SCALE) {
  const code = `DEMO-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const opts = [
    { provider: 'GRAB' as const, url: `https://r.grab.com/g/${code}` },
    { provider: 'XANHSM' as const, url: `https://xanhsm.com/share/${code}` },
  ];
  if (parseInt(id.slice(-1), 16) % 2) opts.reverse();
  const hosts = allowedRideHosts();
  const o = opts.find((x) => hostAllowed(new URL(x.url).hostname, hosts)) ?? { provider: opts[0]!.provider, url: `https://${hosts[0]}/share/${code}` };
  return { provider: o.provider, shareUrl: o.url, driverName: 'Tài xế mô phỏng', plate: '51A-DEMO', phone: '+84900000000', etaAt: new Date(nowMs + (EXT_ARRIVE_S / scale) * 1000) };
}

/** Xe ngoài mô phỏng (chỉ khi SIM_AUTO): tự đặt xe cho NEEDS_EXTERNAL quá hạn mô phỏng, rồi tự chạy chuyến CÓ CỜ simulated. */
async function simExternal(nowMs: number): Promise<void> {
  const scale = env.SHUTTLE_SIM_TIME_SCALE;
  const rows = (
    await db.query<any>(
      `SELECT id, status, updated_at, accepted_at, arrived_at, onboard_at FROM shuttle_trips
       WHERE kind = 'EXTERNAL' AND ((status = 'NEEDS_EXTERNAL' AND updated_at > now() - make_interval(hours => $1)) OR (simulated AND status IN ('ACCEPTED','ARRIVED','ONBOARD')))`,
      [AUTO_MAX_AGE_H],
    )
  ).rows;
  const since = (d?: Date) => (d ? ((nowMs - new Date(d).getTime()) / 1000) * scale : 0);
  for (const r of rows) {
    try {
      if (r.status === 'NEEDS_EXTERNAL') {
        if (since(r.updatedAt) >= EXT_BOOK_DELAY_S) await systemSetExternal(r.id, demoExternal(r.id, nowMs, scale));
      } else {
        const step = r.status === 'ACCEPTED' ? (since(r.acceptedAt) >= EXT_ARRIVE_S ? 'arrived' : undefined) : r.status === 'ARRIVED' ? (since(r.arrivedAt) >= EXT_BOARD_S ? 'onboard' : undefined) : since(r.onboardAt) >= EXT_RIDE_S ? 'dropped-off' : undefined;
        if (step) await systemStep(r.id, step);
      }
    } catch (err: any) {
      // Bấm tay/nhập tay thắng: trạng thái đã đổi -> 409, bỏ qua.
      if (err?.code !== 'INVALID_TRANSITION' && err?.status !== 409) logger.error({ err, tripId: r.id }, 'Mô phỏng xe ngoài lỗi');
    }
  }
}

/** Một nhịp: (tự chuyển trạng thái nếu SIM_AUTO) + đẩy vị trí các chuyến đang chạy. Xuất ra để test gọi trực tiếp, không cần timer thật. */
export async function simTick(nowMs = Date.now()): Promise<void> {
  if (!env.SHUTTLE_SIM_ENABLED) return;
  const auto = env.SHUTTLE_SIM_AUTO;
  const scale = env.SHUTTLE_SIM_TIME_SCALE;
  const rows = (
    await db.query<any>(
      `${SELECT} AND t.status = ANY($1::text[]) AND (t.status <> 'ACCEPTED' OR t.accepted_at > now() - make_interval(hours => $2))`,
      [auto ? ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD'] : ['EN_ROUTE', 'ONBOARD'], AUTO_MAX_AGE_H],
    )
  ).rows;
  const since = (d?: Date) => (d ? ((nowMs - new Date(d).getTime()) / 1000) * scale : 0);
  if (auto) await simExternal(nowMs).catch((err) => logger.error({ err }, 'Mô phỏng xe ngoài lỗi'));
  // Tài xế mô phỏng nhận chuyến đã được hệ thống gán (OFFERED) sau SHUTTLE_SIM_ACCEPT_DELAY_S giây; tài xế thật nhận trước thì 409, bỏ qua.
  if (auto && env.SHUTTLE_SIM_ACCEPT_DELAY_S > 0) {
    const offered = (await db.query<{ id: string }>(`SELECT t.id FROM shuttle_trips t WHERE t.kind = 'OWN' AND t.status = 'OFFERED' AND t.offered_at <= $1::timestamptz - make_interval(secs => $2) AND t.offered_at > $1::timestamptz - make_interval(hours => $3)`, [new Date(nowMs), env.SHUTTLE_SIM_ACCEPT_DELAY_S, AUTO_MAX_AGE_H])).rows;
    for (const o of offered) await systemStep(o.id, 'accept').catch((err) => { if (err?.code !== 'INVALID_TRANSITION' && err?.status !== 409) logger.error({ err, tripId: o.id }, 'Mô phỏng nhận chuyến lỗi'); });
  }
  for (const r of rows) {
    try {
      if (!r.route && ['ACCEPTED', 'EN_ROUTE', 'ONBOARD'].includes(r.status)) r.route = (await ensureRoute(r.id)) as Route | null;
      const pos = computePosition(r, nowMs, env.SHUTTLE_SIM_SPEED_KMH, scale);
      let step: 'start' | 'arrived' | 'onboard' | 'dropped-off' | undefined;
      if (auto) {
        if (r.status === 'ACCEPTED' && r.route && since(r.acceptedAt) >= START_DELAY_S) step = 'start';
        else if (r.status === 'EN_ROUTE' && pos && pos.remainingM <= 0) step = 'arrived';
        else if (r.status === 'ARRIVED' && since(r.arrivedAt) >= ARRIVED_WAIT_S) step = 'onboard';
        else if (r.status === 'ONBOARD' && pos && pos.remainingM <= 0) step = 'dropped-off';
      }
      if (step) {
        // Bấm tay thắng: chuyến đã đổi trạng thái -> 409 INVALID_TRANSITION, bỏ qua. Vị trí mới do listener sự kiện phát.
        await systemStep(r.id, step).catch((err) => { if (err?.code !== 'INVALID_TRANSITION' && err?.status !== 409) throw err; });
      } else if (['EN_ROUTE', 'ONBOARD'].includes(r.status)) await emitPosition(r, nowMs);
    } catch (err) {
      logger.error({ err, tripId: r.id }, 'Mô phỏng chuyến lỗi');
    }
  }
}

// Mỗi lần đổi trạng thái (tay hoặc tự động): phát ngay vị trí mới (kể cả DROPPED_OFF -> phase DONE rồi bộ đếm dừng), và tính tuyến khi tài xế nhận.
async function onEvent(e: ShuttleEvent): Promise<void> {
  if (!e.tripId) return;
  if (e.type === 'TRIP_ACCEPTED') await ensureRoute(e.tripId);
  if (!['TRIP_ACCEPTED', 'TRIP_ROUTE_READY', 'TRIP_EN_ROUTE', 'TRIP_ARRIVED', 'TRIP_ONBOARD', 'TRIP_DROPPED_OFF'].includes(e.type)) return;
  const r = (await db.query<any>(`${SELECT} AND t.id = $1`, [e.tripId])).rows[0];
  if (r) await emitPosition(r);
}

/** Bật mô phỏng trong tiến trình API. Trả hàm dừng. */
export function startSimulation(): () => void {
  if (!env.SHUTTLE_SIM_ENABLED) return () => undefined;
  const listener = (e: ShuttleEvent) => void onEvent(e).catch((err) => logger.error({ err }, 'Mô phỏng: xử lý sự kiện lỗi'));
  shuttleBus.on('event', listener);
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void simTick().catch((err) => logger.error({ err }, 'simTick lỗi')).finally(() => (busy = false));
  }, env.SHUTTLE_SIM_TICK_MS);
  timer.unref();
  return () => { clearInterval(timer); shuttleBus.off('event', listener); };
}
