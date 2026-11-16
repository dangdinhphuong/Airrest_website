import { db, withTransaction, type Db } from '../../database/pg';
import { AppError } from '../../lib/errors';
import { actorOf, writeAudit } from '../audit';
import { assertAdjustAmount, assertAdjustTotal, assertPeriod, collectRoomRows, nextPeriod } from './calc';
import type { Ctx } from './statements';

// (B) Bảng chi trả tháng Airrest -> từng khách sạn. DRAFT -> LOCKED -> PAID. net = gross - hoa hồng (hoa hồng làm tròn xuống TỪNG dòng, xem calc.commissionOf).
// Chưa gồm tiền xe: chưa có quyết định chia tiền xe cho khách sạn (xem báo cáo), nên tiền xe chỉ nằm ở bảng kê đơn vị chi trả.
const notFound = () => new AppError(404, 'PAYOUT_NOT_FOUND', 'Không tìm thấy bảng chi trả');
const audit = (c: Ctx, tx: Db, action: string, id: string, before?: unknown, after?: unknown, reasonNote?: string) =>
  writeAudit({ actor: actorOf(c.auth), action, entity: { type: 'hotel_payout', id }, before, after, reasonNote, requestId: c.requestId }, tx);
const brief = (s: Record<string, any>) => ({ status: s.status, grossVnd: s.grossVnd, commissionVnd: s.commissionVnd, netVnd: s.netVnd, version: s.version });

const lockRow = async (tx: Db, id: string): Promise<Record<string, any>> => (await tx.query('SELECT * FROM hotel_payouts WHERE id = $1 FOR UPDATE', [id])).rows[0] ?? Promise.reject(notFound());

async function recompute(tx: Db, id: string, bump: boolean): Promise<Record<string, any>> {
  return (
    await tx.query(
      `UPDATE hotel_payouts p SET gross_vnd = t.g, commission_vnd = t.c, net_vnd = t.n, line_count = t.k, version = p.version + $2::int, updated_at = now()
       FROM (SELECT COALESCE(sum(gross_vnd),0) AS g, COALESCE(sum(commission_vnd),0) AS c, COALESCE(sum(net_vnd),0) AS n, count(*)::int AS k FROM hotel_payout_lines WHERE payout_id = $1) t
       WHERE p.id = $1 RETURNING p.*`,
      [id, bump ? 1 : 0],
    )
  ).rows[0]!;
}

/** Tạo/tái tạo bảng chi trả mọi khách sạn của kỳ. Chỉ đụng bảng DRAFT (dòng ROOM dựng lại, ADJUSTMENT giữ); LOCKED/PAID giữ nguyên. Idempotent. */
export async function generateHotelPayouts(c: Ctx, periodIn: string) {
  const period = assertPeriod(periodIn);
  return withTransaction(async (tx) => {
    const rooms = await collectRoomRows(tx, period);
    const byHotel = new Map<string, typeof rooms>();
    for (const r of rooms) byHotel.set(r.hotelId, [...(byHotel.get(r.hotelId) ?? []), r]);
    for (const r of (await tx.query<{ hotelId: string }>("SELECT hotel_id FROM hotel_payouts WHERE period = $1 AND status = 'DRAFT'", [period])).rows) if (!byHotel.has(r.hotelId)) byHotel.set(r.hotelId, []);
    const result: Array<Record<string, any>> = [];
    for (const [hotelId, list] of [...byHotel].sort((a, b) => a[0].localeCompare(b[0]))) {
      await tx.query('INSERT INTO hotel_payouts (hotel_id, period) VALUES ($1,$2) ON CONFLICT (hotel_id, period) DO NOTHING', [hotelId, period]);
      const cur = (await tx.query('SELECT * FROM hotel_payouts WHERE hotel_id = $1 AND period = $2 FOR UPDATE', [hotelId, period])).rows[0]!;
      if (cur.status !== 'DRAFT') { result.push(cur); continue; }
      const old = (await tx.query<{ bookingId: string; grossVnd: number; commissionVnd: number }>("SELECT booking_id, gross_vnd, commission_vnd FROM hotel_payout_lines WHERE payout_id = $1 AND kind = 'ROOM'", [cur.id])).rows;
      const sig = (r: Array<{ bookingId: string; grossVnd: number; commissionVnd: number }>) => r.map((x) => `${x.bookingId}|${x.grossVnd}|${x.commissionVnd}`).sort().join(';');
      await tx.query("DELETE FROM hotel_payout_lines WHERE payout_id = $1 AND kind = 'ROOM'", [cur.id]);
      for (const r of list) {
        await tx.query(
          "INSERT INTO hotel_payout_lines (payout_id, booking_id, payer_id, group_code, kind, gross_vnd, commission_vnd, net_vnd, memo) VALUES ($1,$2,$3,$4,'ROOM',$5,$6,$7,$8)",
          [cur.id, r.bookingId, r.payerId, r.groupCode, r.amountVnd + r.upgradeVnd, r.commissionVnd, r.amountVnd + r.upgradeVnd - r.commissionVnd, r.noRate ? 'Không có giá hợp đồng: hoa hồng = 0' : null],
        );
      }
      const changed = sig(old) !== sig(list.map((r) => ({ bookingId: r.bookingId, grossVnd: r.amountVnd + r.upgradeVnd, commissionVnd: r.commissionVnd })));
      const next = await recompute(tx, cur.id, changed);
      if (changed) await audit(c, tx, 'HOTEL_PAYOUT.GENERATE', cur.id, brief(cur), { ...brief(next), period, hotelId });
      result.push(next);
    }
    return { items: result };
  });
}

export async function lockHotelPayout(c: Ctx, id: string, now = new Date()) {
  return withTransaction(async (tx) => {
    const p = await lockRow(tx, id);
    if (p.status !== 'DRAFT') throw new AppError(409, 'PAYOUT_NOT_DRAFT', 'Chỉ khóa được bảng chi trả đang nháp');
    const next = (await tx.query("UPDATE hotel_payouts SET status = 'LOCKED', locked_at = $2, locked_by = $3, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *", [id, now, c.auth.sub])).rows[0]!;
    await audit(c, tx, 'HOTEL_PAYOUT.LOCK', id, brief(p), brief(next));
    return next;
  });
}

/** Đã chuyển tiền cho khách sạn (ghi nhận, KHÔNG gọi cổng thanh toán). Chỉ từ LOCKED, số tiền net phải > 0 (âm: khách sạn nợ, xử lý riêng). */
export async function markPaid(c: Ctx, id: string, paymentRef: string, now = new Date()) {
  return withTransaction(async (tx) => {
    const p = await lockRow(tx, id);
    if (p.status !== 'LOCKED') throw new AppError(409, 'PAYOUT_NOT_LOCKED', 'Chỉ ghi nhận đã trả cho bảng chi trả đã khóa');
    if (p.netVnd <= 0) throw new AppError(409, 'PAYOUT_NOT_PAYABLE', 'Số tiền phải trả khách sạn không dương: bù trừ sang kỳ sau hoặc thu hồi riêng');
    const next = (await tx.query("UPDATE hotel_payouts SET status = 'PAID', paid_at = $2, paid_by = $3, payment_ref = $4, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *", [id, now, c.auth.sub, paymentRef])).rows[0]!;
    await audit(c, tx, 'HOTEL_PAYOUT.PAID', id, brief(p), { ...brief(next), paymentRef });
    return next;
  });
}

/**
 * Truy thu/điều chỉnh khách sạn SAU KHI KHÓA (vd. hoàn khách 300.000 do khiếu nại, Airrest chi trước). amountVnd có dấu theo tác động lên số trả KS (truy thu = âm).
 * Kỳ gốc phải LOCKED/PAID; dòng ADJUSTMENT ghi vào kỳ kế tiếp còn DRAFT. Không sửa kỳ đã khóa.
 */
export async function addHotelAdjustment(c: Ctx, a: { hotelId: string; period: string; amountVnd: number; memo: string; bookingId?: string }) {
  const period = assertPeriod(a.period);
  assertAdjustAmount(a.amountVnd);
  if (!(await db.query('SELECT 1 FROM hotels WHERE id = $1', [a.hotelId])).rows[0]) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  if (a.bookingId && !(await db.query('SELECT 1 FROM bookings WHERE id = $1', [a.bookingId])).rows[0]) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt phòng');
  return withTransaction(async (tx) => {
    const src = (await tx.query('SELECT status FROM hotel_payouts WHERE hotel_id = $1 AND period = $2', [a.hotelId, period])).rows[0];
    if (!src || src.status === 'DRAFT') throw new AppError(409, 'PERIOD_NOT_LOCKED', 'Kỳ gốc chưa khóa: hãy tạo lại bảng chi trả thay vì điều chỉnh');
    let target = nextPeriod(period);
    for (let i = 0; i < 24; i++, target = nextPeriod(target)) {
      await tx.query('INSERT INTO hotel_payouts (hotel_id, period) VALUES ($1,$2) ON CONFLICT (hotel_id, period) DO NOTHING', [a.hotelId, target]);
      const p = (await tx.query('SELECT * FROM hotel_payouts WHERE hotel_id = $1 AND period = $2 FOR UPDATE', [a.hotelId, target])).rows[0]!;
      if (p.status !== 'DRAFT') continue;
      assertAdjustTotal((await tx.query("SELECT COALESCE(sum(gross_vnd),0)::float8 AS t FROM hotel_payout_lines WHERE payout_id = $1 AND kind = 'ADJUSTMENT'", [p.id])).rows[0]!.t, a.amountVnd);
      await tx.query("INSERT INTO hotel_payout_lines (payout_id, booking_id, kind, gross_vnd, commission_vnd, net_vnd, memo) VALUES ($1,$2,'ADJUSTMENT',$3,0,$3,$4)", [p.id, a.bookingId ?? null, a.amountVnd, `[Kỳ ${period}] ${a.memo}`]);
      const next = await recompute(tx, p.id, true);
      await audit(c, tx, 'HOTEL_PAYOUT.ADJUST', p.id, brief(p), { ...brief(next), fromPeriod: period, amountVnd: a.amountVnd }, a.memo);
      return next;
    }
    throw new AppError(409, 'NO_OPEN_PERIOD', 'Không tìm thấy kỳ nháp để ghi điều chỉnh');
  });
}

export async function listHotelPayouts(q: { hotelId?: string; period?: string; status?: string; limit: number; after?: number }) {
  const rows = (
    await db.query<{ seq: number }>(
      `SELECT p.*, h.name AS hotel_name FROM hotel_payouts p JOIN hotels h ON h.id = p.hotel_id
       WHERE ($1::uuid IS NULL OR p.hotel_id = $1) AND ($2::text IS NULL OR p.period = $2) AND ($3::text IS NULL OR p.status = $3) AND ($4::bigint IS NULL OR p.seq < $4)
       ORDER BY p.seq DESC LIMIT $5`,
      [q.hotelId ?? null, q.period ?? null, q.status ?? null, q.after ?? null, q.limit + 1],
    )
  ).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null };
}

export async function getHotelPayout(id: string) {
  const payout = (await db.query('SELECT p.*, h.name AS hotel_name FROM hotel_payouts p JOIN hotels h ON h.id = p.hotel_id WHERE p.id = $1', [id])).rows[0];
  if (!payout) throw notFound();
  const lines = (
    await db.query('SELECT l.id, l.kind, l.booking_id, b.code AS booking_code, l.payer_id, l.group_code, l.gross_vnd, l.commission_vnd, l.net_vnd, l.memo FROM hotel_payout_lines l LEFT JOIN bookings b ON b.id = l.booking_id WHERE l.payout_id = $1 ORDER BY l.seq', [id])
  ).rows;
  return { payout, lines };
}

// --- Khách sạn xem bảng chi trả CỦA MÌNH (chỉ đọc): chỉ LOCKED/PAID (không lộ DRAFT), bỏ cột nội bộ (người khóa/trả, payer_id).
const HOTEL_VISIBLE = "('LOCKED','PAID')";
const HOTEL_COLS = 'p.id, p.seq, p.period, p.status, p.gross_vnd, p.commission_vnd, p.net_vnd, p.line_count, p.locked_at, p.paid_at, p.payment_ref';

export async function listOwnPayouts(hotelId: string, q: { period?: string; limit: number; after?: number }) {
  const rows = (
    await db.query<{ seq: number }>(
      `SELECT ${HOTEL_COLS} FROM hotel_payouts p WHERE p.hotel_id = $1 AND p.status IN ${HOTEL_VISIBLE} AND ($2::text IS NULL OR p.period = $2) AND ($3::bigint IS NULL OR p.seq < $3) ORDER BY p.seq DESC LIMIT $4`,
      [hotelId, q.period ?? null, q.after ?? null, q.limit + 1],
    )
  ).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null };
}

/** Bảng của khách sạn khác / bản nháp đều trả 404 như không tồn tại (không lộ sự tồn tại). */
export async function getOwnPayout(hotelId: string, id: string) {
  const payout = (await db.query(`SELECT ${HOTEL_COLS} FROM hotel_payouts p WHERE p.id = $1 AND p.hotel_id = $2 AND p.status IN ${HOTEL_VISIBLE}`, [id, hotelId])).rows[0];
  if (!payout) throw notFound();
  const lines = (
    await db.query('SELECT l.id, l.kind, l.booking_id, b.code AS booking_code, l.gross_vnd, l.commission_vnd, l.net_vnd, l.memo FROM hotel_payout_lines l LEFT JOIN bookings b ON b.id = l.booking_id WHERE l.payout_id = $1 ORDER BY l.seq', [id])
  ).rows;
  return { payout, lines };
}
