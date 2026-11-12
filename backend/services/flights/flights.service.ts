import type { FlightDto } from '@airrest/shared-types';
import type { CreateFlightBody, UpdateFlightBody } from '@airrest/validation';
import { airportByIata } from '../../data/airports';
import { db, withTransaction } from '../../database/pg';
import type { FlightChangeDoc, FlightDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { actorOf, writeAudit } from '../audit';
import { getConfig } from '../systemConfig';

export const FLIGHT_COLS = "id, seq, code, airline, origin, dest, sched_dep, to_char(flight_date, 'YYYY-MM-DD') AS flight_date, new_dep, status, cause, cancelled_at, distance_km, sim_scenario, created_at, updated_at";
const iso = (d: Date | undefined | null): string | null => (d ? new Date(d).toISOString() : null);

/** Ngày hôm nay theo giờ Việt Nam, `YYYY-MM-DD`. */
export const vnToday = (now: Date): string => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

type LastChange = { fromAt: string; toAt: string; at: string } | null;

export function toFlightDto(row: FlightDoc, o: { delayHours: number; lastChange: LastChange; now: Date }): FlightDto {
  const cancelled = row.status === 'CANCELLED';
  const newDep = row.status === 'DELAYED' ? row.newDep : undefined;
  const effective = cancelled ? null : row.status === 'DELAYED' ? iso(newDep) : iso(row.schedDep);
  const delayMinutes = newDep ? Math.round((new Date(newDep).getTime() - new Date(row.schedDep).getTime()) / 60_000) : null;
  return {
    id: row.id, code: row.code, flightDate: row.flightDate, airline: row.airline, origin: row.origin, dest: row.dest ?? null,
    scheduledDepartureAt: iso(row.schedDep)!, newDepartureAt: iso(newDep), effectiveDepartureAt: effective,
    status: row.status, cause: row.cause, cancelledAt: iso(row.cancelledAt), distanceKm: row.distanceKm ?? null,
    delayMinutes, delayedOverThreshold: delayMinutes !== null && delayMinutes > o.delayHours * 60, // BR-FLT-01: chậm > N giờ
    lastChange: o.lastChange, simScenario: row.simScenario, updatedAt: iso(row.updatedAt)!, asOf: o.now.toISOString(), simulated: true,
  };
}

async function lastChangeOf(flightId: string): Promise<LastChange> {
  const c = (
    await db.query<FlightChangeDoc>('SELECT from_dep, to_dep, created_at FROM flight_changes WHERE flight_id = $1 AND from_dep IS NOT NULL AND to_dep IS NOT NULL AND from_dep <> to_dep ORDER BY seq DESC LIMIT 1', [flightId])
  ).rows[0];
  return c ? { fromAt: iso(c.fromDep)!, toAt: iso(c.toDep)!, at: iso(c.createdAt)! } : null;
}

export async function getFlight(code: string, date: string | undefined, now = new Date()): Promise<FlightDto> {
  const day = date ?? vnToday(now);
  const row = (await db.query<FlightDoc>(`SELECT ${FLIGHT_COLS} FROM flights WHERE code = $1 AND flight_date = $2::date`, [code, day])).rows[0];
  if (!row) throw new AppError(404, 'FLIGHT_NOT_FOUND', 'Không tìm thấy chuyến bay (dữ liệu mô phỏng)');
  const cfg = await getConfig('flight.thresholds', now);
  return toFlightDto(row, { delayHours: cfg.value.delayHours, lastChange: await lastChangeOf(row.id), now });
}

// ---------- Admin ----------

const changeView = (c: FlightChangeDoc) => ({ id: c.id, seq: c.seq, fromAt: iso(c.fromDep), toAt: iso(c.toDep), statusBefore: c.statusBefore, statusAfter: c.statusAfter, reason: c.reason, createdAt: iso(c.createdAt)! });

export async function listFlights(q: { code?: string; date?: string; status?: string; limit: number; cursor?: number }, now = new Date()) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (q.code) add('code = ?', q.code);
  if (q.date) add('flight_date = ?::date', q.date);
  if (q.status) add('status = ?', q.status);
  if (q.cursor !== undefined) add('seq > ?', q.cursor);
  const rows = (await db.query<FlightDoc>(`SELECT ${FLIGHT_COLS} FROM flights ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq LIMIT ${q.limit + 1}`, params)).rows;
  const items = rows.slice(0, q.limit);
  const cfg = await getConfig('flight.thresholds', now);
  return {
    items: await Promise.all(items.map(async (r) => ({ ...toFlightDto(r, { delayHours: cfg.value.delayHours, lastChange: await lastChangeOf(r.id), now }), seq: r.seq }))),
    nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null,
  };
}

export async function listFlightChanges(flightId: string, q: { limit: number; cursor?: number }) {
  if (!(await db.query('SELECT 1 FROM flights WHERE id = $1', [flightId])).rows[0]) throw new AppError(404, 'FLIGHT_NOT_FOUND', 'Không tìm thấy chuyến bay');
  const rows = (await db.query<FlightChangeDoc>(`SELECT * FROM flight_changes WHERE flight_id = $1 ${q.cursor !== undefined ? 'AND seq < $2' : ''} ORDER BY seq DESC LIMIT ${q.limit + 1}`, q.cursor !== undefined ? [flightId, q.cursor] : [flightId])).rows;
  const items = rows.slice(0, q.limit);
  return { items: items.map(changeView), nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null };
}

export async function updateFlight(auth: AuthContext, id: string, body: UpdateFlightBody, requestId?: string) {
  const out = await withTransaction(async (tx) => {
    const now = new Date();
    const f = (await tx.query<FlightDoc>(`SELECT ${FLIGHT_COLS} FROM flights WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!f) throw new AppError(404, 'FLIGHT_NOT_FOUND', 'Không tìm thấy chuyến bay');
    const newDep = body.newDepartureAt ? new Date(body.newDepartureAt) : null;
    if (body.status === 'DELAYED' && newDep && newDep <= new Date(f.schedDep)) throw new AppError(422, 'FLIGHT_TIME_INVALID', 'Giờ bay mới phải sau giờ dự kiến');
    if (body.status !== 'DELAYED' && newDep) throw new AppError(422, 'FLIGHT_TIME_INVALID', 'Chỉ chuyến CHẬM mới có giờ bay mới');
    const cause = body.cause ?? f.cause;
    const target = body.status === 'DELAYED' ? newDep : null;
    const effective = (st: string, dep: Date | undefined | null) => (st === 'CANCELLED' ? null : st === 'DELAYED' ? (dep ? new Date(dep).getTime() : null) : new Date(f.schedDep).getTime());
    const fromEff = effective(f.status, f.newDep);
    const toEff = body.status === 'CANCELLED' ? null : body.status === 'DELAYED' ? (target ? target.getTime() : null) : new Date(f.schedDep).getTime();
    if (body.status === f.status && fromEff === toEff && cause === f.cause) throw new AppError(409, 'FLIGHT_UNCHANGED', 'Không có thay đổi nào so với hiện tại');
    const next = (
      await tx.query<FlightDoc>(
        `UPDATE flights SET status = $2, new_dep = $3, cause = $4, cancelled_at = $5, updated_at = $6 WHERE id = $1 RETURNING ${FLIGHT_COLS}`,
        [id, body.status, target, cause, body.status === 'CANCELLED' ? now : null, now],
      )
    ).rows[0]!;
    const change = (
      await tx.query<FlightChangeDoc>(
        `INSERT INTO flight_changes (flight_id, from_dep, to_dep, status_before, status_after, cause_before, cause_after, reason, changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
        [id, fromEff === null ? null : new Date(fromEff), toEff === null ? null : new Date(toEff), f.status, body.status, f.cause, cause, body.reason, JSON.stringify(actorOf(auth))],
      )
    ).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'FLIGHT.UPDATE', entity: { type: 'flight', id }, before: { status: f.status, effectiveAt: fromEff === null ? null : new Date(fromEff) }, after: { status: body.status, effectiveAt: toEff === null ? null : new Date(toEff) }, reasonNote: body.reason, requestId }, tx);
    return { next, change, now };
  });
  const cfg = await getConfig('flight.thresholds', out.now);
  return { flight: toFlightDto(out.next, { delayHours: cfg.value.delayHours, lastChange: await lastChangeOf(id), now: out.now }), change: changeView(out.change) };
}

/** Tạo chuyến mô phỏng (ONTIME). (code, ngày bay theo giờ VN) phải duy nhất -> 409 FLIGHT_EXISTS. */
export async function createFlight(auth: AuthContext, body: CreateFlightBody, requestId?: string) {
  if (!airportByIata(body.origin)) throw new AppError(422, 'AIRPORT_UNKNOWN', `Mã sân bay đi "${body.origin}" không có trong danh mục`);
  if (body.dest && !airportByIata(body.dest)) throw new AppError(422, 'AIRPORT_UNKNOWN', `Mã sân bay đến "${body.dest}" không có trong danh mục`);
  if (body.dest && body.dest === body.origin) throw new AppError(422, 'FLIGHT_ROUTE_INVALID', 'Sân bay đi và đến phải khác nhau');
  const now = new Date();
  try {
    const row = await withTransaction(async (tx) => {
      const created = (
        await tx.query<FlightDoc>(
          `INSERT INTO flights (code, airline, origin, dest, sched_dep, status, cause, distance_km, sim_scenario, updated_at)
           VALUES ($1,$2,$3,$4,$5,'ONTIME','UNKNOWN',$6,$7,$8) RETURNING ${FLIGHT_COLS}`,
          [body.code, body.airline, body.origin, body.dest ?? null, new Date(body.scheduledDepartureAt), body.distanceKm ?? null, body.simScenario, now],
        )
      ).rows[0]!;
      await writeAudit({ actor: actorOf(auth), action: 'FLIGHT.CREATE', entity: { type: 'flight', id: created.id }, after: { code: created.code, flightDate: created.flightDate, origin: created.origin, dest: created.dest ?? null }, reasonNote: body.reason, requestId }, tx);
      return created;
    });
    const cfg = await getConfig('flight.thresholds', now);
    return { flight: toFlightDto(row, { delayHours: cfg.value.delayHours, lastChange: null, now }) };
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'FLIGHT_EXISTS', 'Chuyến bay này đã tồn tại trong ngày (mã + ngày khởi hành)');
    throw e;
  }
}

/** Xóa chuyến chưa có tham chiếu (chưa có lịch sử đổi giờ/trạng thái); đã có -> 409 FLIGHT_IN_USE. */
export async function deleteFlight(auth: AuthContext, id: string, requestId?: string): Promise<void> {
  await withTransaction(async (tx) => {
    const f = (await tx.query<FlightDoc>(`SELECT ${FLIGHT_COLS} FROM flights WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!f) throw new AppError(404, 'FLIGHT_NOT_FOUND', 'Không tìm thấy chuyến bay');
    const refs = (await tx.query<{ n: number }>('SELECT count(*) AS n FROM flight_changes WHERE flight_id = $1', [id])).rows[0]!.n;
    if (refs > 0) throw new AppError(409, 'FLIGHT_IN_USE', 'Chuyến bay đã có lịch sử thay đổi nên không thể xóa');
    await tx.query('DELETE FROM flights WHERE id = $1', [id]);
    await writeAudit({ actor: actorOf(auth), action: 'FLIGHT.DELETE', entity: { type: 'flight', id }, before: { code: f.code, flightDate: f.flightDate, status: f.status }, requestId }, tx);
  });
}
