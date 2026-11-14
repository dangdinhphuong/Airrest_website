import { z } from 'zod';
import { delayPaxInput, flightCodeSchema } from '@airrest/validation';
import { airportByIata } from '../../data/airports';
import { db, json, withTransaction } from '../../database/pg';
import type { Actor } from '../../database/types';
import { AppError } from '../../lib/errors';
import { onFlightTimeChanged } from './timeChange';

const iata = z.string().trim().transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z]{3}$/, 'Mã sân bay gồm 3 chữ cái'));
const at = z.string().datetime({ offset: true, message: 'Giờ phải dạng ISO 8601 có múi giờ' });

export const MAX_PAX = 300; // quy mô giả định của spec (<= 300 khách/chuyến); body JSON còn bị chặn 100kb

export const ingestBody = z
  .object({
    flight: z
      .object({
        code: flightCodeSchema,
        airline: z.string().trim().min(2).max(100),
        origin: iata,
        dest: iata.nullable().optional(),
        scheduledDepartureAt: at,
        newDepartureAt: at.nullable(),
        status: z.enum(['DELAYED', 'ONTIME', 'CANCELLED']),
        cause: z.enum(['AIRLINE', 'FORCE', 'UNKNOWN']),
      })
      .strict(),
    passengers: z.array(delayPaxInput).min(1).max(MAX_PAX),
  })
  .strict();
export type IngestBody = z.infer<typeof ingestBody>;

export interface IngestCtx {
  payerId: string;
  stationId?: string | null; // tài khoản bị khóa theo một trạm; khóa API = cấp đơn vị (không đặt)
  actor: Actor;
  source: 'API' | 'SIMULATION';
  apiKeyId?: string;
  accountId?: string;
}

export interface IngestResult {
  flight: { id: string; code: string; flightDate: string; status: string; scheduledDepartureAt: string; newDepartureAt: string | null; simulated: boolean };
  flightCreated: boolean;
  flightChanged: boolean; // đổi giờ bay hiệu lực / trạng thái / nguyên nhân (đã ghi flight_changes)
  passengers: { received: number; created: number; updated: number };
}

interface FlightRow { id: string; code: string; airline: string; dest?: string; schedDep: Date; newDep?: Date; status: 'ONTIME' | 'DELAYED' | 'CANCELLED'; cause: string; simulated: boolean; flightDate: string }
const SEL = "id, code, airline, dest, sched_dep, new_dep, status, cause, simulated, to_char(flight_date, 'YYYY-MM-DD') AS flight_date";
const DAY_VN = "(($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)";

const logResult = async (c: IngestCtx, result: 'OK' | 'REJECTED', flightId: string | null, summary: object, err?: { code: string; message: string }, tx = db) =>
  void (await tx.query(
    'INSERT INTO payer_ingest_logs (payer_id, api_key_id, account_id, source, result, flight_id, summary, error_code, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',
    [c.payerId, c.apiKeyId ?? null, c.accountId ?? null, c.source, result, flightId, json(summary), err?.code ?? null, err?.message.slice(0, 500) ?? null],
  ));

/**
 * Cổng kết nối duy nhất: UPSERT chuyến (code + ngày bay VN) và hành khách (chuyến + PNR + họ tên). Dùng chung cho khóa API và nút mô phỏng.
 * Thành công hay bị từ chối đều ghi payer_ingest_logs. createOnly: chuyến đã tồn tại -> 409 (nút mô phỏng không bao giờ ghi đè).
 */
export async function ingestFlight(c: IngestCtx, raw: unknown, o: { simulated?: boolean; createOnly?: boolean } = {}): Promise<IngestResult> {
  const simulated = o.simulated ?? false;
  const peek = raw as { flight?: { code?: unknown }; passengers?: unknown[] } | null;
  const base = { flightCode: typeof peek?.flight?.code === 'string' ? peek.flight.code.slice(0, 10) : null, paxReceived: Array.isArray(peek?.passengers) ? peek.passengers.length : null, simulated };
  const parsed = ingestBody.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    await logResult(c, 'REJECTED', null, base, { code: 'VALIDATION_ERROR', message: `${first?.path.join('.') ?? ''}: ${first?.message ?? 'Dữ liệu không hợp lệ'}` });
    throw new AppError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', parsed.error.issues);
  }
  try {
    const box: { change?: { flightId: string; fromDep: Date | null; toDep: Date | null; status: string } } = {};
    const result = await withTransaction((tx) => run(tx, c, parsed.data, simulated, o.createOnly ?? false, (x) => { box.change = x; }));
    if (box.change) await onFlightTimeChanged(box.change); // sau commit, tự nuốt lỗi
    return result;
  } catch (e) {
    const ae = e instanceof AppError ? e : null;
    await logResult(c, 'REJECTED', null, base, { code: ae?.code ?? 'INTERNAL', message: ae?.message ?? 'Lỗi nội bộ' }).catch(() => undefined);
    throw e;
  }
}

async function run(tx: typeof db, c: IngestCtx, b: IngestBody, simulated: boolean, createOnly: boolean, onChange: (c: { flightId: string; fromDep: Date | null; toDep: Date | null; status: string }) => void): Promise<IngestResult> {
  const f = b.flight;
  const station = (
    await tx.query<{ id: string }>('SELECT id FROM payer_stations WHERE payer_id = $1 AND airport_iata = $2 AND active AND ($3::uuid IS NULL OR id = $3)', [c.payerId, f.origin, c.stationId ?? null])
  ).rows[0];
  if (!station) throw new AppError(403, 'STATION_NOT_ALLOWED', `Sân bay đi "${f.origin}" không thuộc trạm nào của tài khoản/khóa này`);
  if (f.dest && !airportByIata(f.dest)) throw new AppError(422, 'AIRPORT_UNKNOWN', `Mã sân bay đến "${f.dest}" không có trong danh mục`);
  if (f.dest && f.dest === f.origin) throw new AppError(422, 'FLIGHT_ROUTE_INVALID', 'Sân bay đi và đến phải khác nhau');
  const sched = new Date(f.scheduledDepartureAt);
  const newDep = f.newDepartureAt ? new Date(f.newDepartureAt) : null;
  if (f.status !== 'DELAYED' && newDep) throw new AppError(422, 'FLIGHT_TIME_INVALID', 'Chỉ chuyến DELAYED mới có giờ bay mới');
  if (newDep && newDep <= sched) throw new AppError(422, 'FLIGHT_TIME_INVALID', 'Giờ bay mới phải sau giờ dự kiến');
  const now = new Date();
  const cancelledAt = f.status === 'CANCELLED' ? now : null;

  let existing = (await tx.query<FlightRow>(`SELECT ${SEL} FROM flights WHERE code = $1 AND flight_date = ${DAY_VN} FOR UPDATE`, [f.code, sched])).rows[0];
  let flightCreated = false;
  if (!existing) {
    const ins = await tx.query<FlightRow>(
      `INSERT INTO flights (code, airline, origin, dest, sched_dep, status, new_dep, cause, cancelled_at, simulated, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (code, flight_date) DO NOTHING RETURNING ${SEL}`,
      [f.code, f.airline, f.origin, f.dest ?? null, sched, f.status, newDep, f.cause, cancelledAt, simulated, now],
    );
    existing = ins.rows[0];
    flightCreated = !!existing;
    if (!existing) existing = (await tx.query<FlightRow>(`SELECT ${SEL} FROM flights WHERE code = $1 AND flight_date = ${DAY_VN} FOR UPDATE`, [f.code, sched])).rows[0]!; // thua cuộc đua tạo
  }
  const flight = existing;

  let flightChanged = false;
  if (!flightCreated) {
    if (createOnly) throw new AppError(409, 'FLIGHT_EXISTS', 'Chuyến bay này đã tồn tại trong ngày (mã + ngày khởi hành)');
    // Chuyến đã có hành khách của đơn vị khác thì không cho ghi đè (thông báo chung để không lộ dữ liệu đơn vị khác).
    if ((await tx.query('SELECT 1 FROM delay_flight_pax WHERE flight_id = $1 AND payer_id <> $2 LIMIT 1', [flight.id, c.payerId])).rows[0]) throw new AppError(409, 'FLIGHT_CONFLICT', 'Không ghi nhận được chuyến này');
    const eff = (st: string, sd: Date, nd?: Date | null) => (st === 'CANCELLED' ? null : st === 'DELAYED' ? (nd ? new Date(nd).getTime() : null) : new Date(sd).getTime());
    const fromEff = eff(flight.status, flight.schedDep, flight.newDep);
    const toEff = eff(f.status, sched, newDep);
    flightChanged = flight.status !== f.status || fromEff !== toEff || flight.cause !== f.cause;
    await tx.query(
      'UPDATE flights SET airline = $2, dest = $3, sched_dep = $4, status = $5, new_dep = $6, cause = $7, cancelled_at = $8, simulated = $9, updated_at = $10 WHERE id = $1',
      [flight.id, f.airline, f.dest ?? null, sched, f.status, newDep, f.cause, cancelledAt, simulated, now],
    );
    if (flightChanged) {
      if (flight.status !== f.status || fromEff !== toEff) onChange({ flightId: flight.id, fromDep: fromEff === null ? null : new Date(fromEff), toDep: toEff === null ? null : new Date(toEff), status: f.status });
      await tx.query(
        'INSERT INTO flight_changes (flight_id, from_dep, to_dep, status_before, status_after, cause_before, cause_after, reason, changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
        [flight.id, fromEff === null ? null : new Date(fromEff), toEff === null ? null : new Date(toEff), flight.status, f.status, flight.cause, f.cause, c.source === 'API' ? 'Cổng kết nối đơn vị chi trả' : 'Mô phỏng chuyến delay', json(c.actor)],
      );
    }
  }

  let created = 0;
  for (const p of b.passengers) {
    const r = await tx.query<{ inserted: boolean }>(
      `INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, pnr, full_name, age, category, is_representative, email, phone, special_needs, simulated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12)
       ON CONFLICT (flight_id, pnr, lower(full_name)) DO UPDATE SET age = EXCLUDED.age, category = EXCLUDED.category, is_representative = EXCLUDED.is_representative,
         email = COALESCE(EXCLUDED.email, delay_flight_pax.email), phone = COALESCE(EXCLUDED.phone, delay_flight_pax.phone),
         special_needs = EXCLUDED.special_needs, simulated = EXCLUDED.simulated, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [c.payerId, station.id, flight.id, p.pnr, p.fullName, p.age, p.category, p.isRepresentative, p.email ?? null, p.phone || null, p.specialNeeds, simulated],
    );
    if (r.rows[0]!.inserted) created++;
  }

  const passengers = { received: b.passengers.length, created, updated: b.passengers.length - created };
  await logResult(c, 'OK', flight.id, { flightCode: f.code, flightDate: flight.flightDate, status: f.status, simulated, flightCreated, flightChanged, ...passengers }, undefined, tx);
  return {
    flight: { id: flight.id, code: f.code, flightDate: flight.flightDate, status: f.status, scheduledDepartureAt: sched.toISOString(), newDepartureAt: newDep?.toISOString() ?? null, simulated },
    flightCreated, flightChanged, passengers,
  };
}
