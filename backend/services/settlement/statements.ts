import { withTransaction, db, type Db } from '../../database/pg';
import { AppError } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { actorOf, writeAudit } from '../audit';
import { assertPeriod, collectRoomRows, collectShuttleRows, nextPeriod, periodEnded } from './calc';

// (A) Bảng kê tháng Airrest <-> đơn vị chi trả. DRAFT -> SENT -> (DISPUTED) -> LOCKED. Số nguyên VND; tổng = SUM các dòng.
export type Ctx = { auth: AuthContext; requestId: string };
export const DISPUTE_DAYS = 5;
const notFound = () => new AppError(404, 'STATEMENT_NOT_FOUND', 'Không tìm thấy bảng kê');
const audit = (c: Ctx, tx: Db, action: string, id: string, before?: unknown, after?: unknown, reasonNote?: string) =>
  writeAudit({ actor: actorOf(c.auth), action, entity: { type: 'payer_statement', id }, before, after, reasonNote, requestId: c.requestId }, tx);
const brief = (s: Record<string, any>) => ({ status: s.status, totalVnd: s.totalVnd, version: s.version });

async function lockStatementRow(tx: Db, id: string, payerId?: string): Promise<Record<string, any>> {
  const s = (await tx.query('SELECT * FROM payer_statements WHERE id = $1 AND ($2::uuid IS NULL OR payer_id = $2) FOR UPDATE', [id, payerId ?? null])).rows[0];
  if (!s) throw notFound();
  return s;
}

/** Tính lại tổng từ chính các dòng (không cộng dồn từ tổng cũ). */
async function recompute(tx: Db, id: string, bump: boolean): Promise<Record<string, any>> {
  return (
    await tx.query(
      `UPDATE payer_statements s SET
         room_vnd = t.room, shuttle_vnd = t.shuttle, upgrade_delta_vnd = t.upg, adjustment_vnd = t.adj, total_vnd = t.room + t.shuttle + t.upg + t.adj,
         commission_vnd = t.comm, line_count = t.n, version = s.version + $2::int, updated_at = now()
       FROM (SELECT COALESCE(sum(amount_vnd) FILTER (WHERE kind = 'ROOM'), 0) AS room, COALESCE(sum(amount_vnd) FILTER (WHERE kind = 'SHUTTLE'), 0) AS shuttle,
                    COALESCE(sum(amount_vnd) FILTER (WHERE kind = 'UPGRADE_DELTA'), 0) AS upg, COALESCE(sum(amount_vnd) FILTER (WHERE kind = 'ADJUSTMENT'), 0) AS adj,
                    COALESCE(sum(commission_vnd), 0) AS comm, count(*)::int AS n FROM payer_statement_lines WHERE statement_id = $1) t
       WHERE s.id = $1 RETURNING s.*`,
      [id, bump ? 1 : 0],
    )
  ).rows[0]!;
}

/**
 * Tạo/tái tạo bảng kê kỳ `period`. Idempotent: chạy lại khi còn DRAFT cho đúng kết quả cũ (dòng ROOM/SHUTTLE/UPGRADE_DELTA dựng lại từ đơn; ADJUSTMENT giữ nguyên).
 * Kỳ LOCKED: trả nguyên trạng, KHÔNG sửa. SENT/DISPUTED: 409 (mở lại về DRAFT trước).
 */
export async function generateStatement(c: Ctx, payerId: string, periodIn: string) {
  const period = assertPeriod(periodIn);
  if (!(await db.query('SELECT 1 FROM payers WHERE id = $1', [payerId])).rows[0]) throw new AppError(404, 'PAYER_NOT_FOUND', 'Không tìm thấy đơn vị chi trả');
  return withTransaction(async (tx) => {
    await tx.query('INSERT INTO payer_statements (payer_id, period) VALUES ($1,$2) ON CONFLICT (payer_id, period) DO NOTHING', [payerId, period]);
    const cur = (await tx.query('SELECT * FROM payer_statements WHERE payer_id = $1 AND period = $2 FOR UPDATE', [payerId, period])).rows[0]!;
    if (cur.status === 'LOCKED') return { statement: cur, unchanged: true, warnings: { linesWithoutRate: 0 } };
    if (cur.status !== 'DRAFT') throw new AppError(409, 'STATEMENT_NOT_DRAFT', 'Bảng kê đã gửi: mở lại về nháp trước khi tạo lại');
    const rooms = await collectRoomRows(tx, period, { payerId });
    const shuttles = await collectShuttleRows(tx, period, payerId);
    const sig = (r: Array<{ bookingId: string; kind: string; amountVnd: number; commissionVnd: number }>) => r.map((x) => `${x.bookingId}|${x.kind}|${x.amountVnd}|${x.commissionVnd}`).sort().join(';');
    const old = (await tx.query<{ bookingId: string; kind: string; amountVnd: number; commissionVnd: number }>("SELECT booking_id, kind, amount_vnd, commission_vnd FROM payer_statement_lines WHERE statement_id = $1 AND kind IN ('ROOM','SHUTTLE','UPGRADE_DELTA')", [cur.id])).rows;
    await tx.query("DELETE FROM payer_statement_lines WHERE statement_id = $1 AND kind IN ('ROOM','SHUTTLE','UPGRADE_DELTA')", [cur.id]);
    const ins = (kind: string, r: { bookingId: string; hotelId: string; groupCode: string | null; flightCode: string | null; amountVnd: number }, commission: number, memo: string | null) =>
      tx.query('INSERT INTO payer_statement_lines (statement_id, booking_id, group_code, flight_code, hotel_id, kind, amount_vnd, commission_vnd, memo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [cur.id, r.bookingId, r.groupCode, r.flightCode, r.hotelId, kind, r.amountVnd, commission, memo]);
    for (const r of rooms) await ins('ROOM', r, r.commissionVnd, r.noRate ? 'Không có giá hợp đồng: hoa hồng = 0' : null);
    for (const r of rooms) if (r.upgradeVnd > 0) await ins('UPGRADE_DELTA', { ...r, amountVnd: r.upgradeVnd }, 0, 'Phần chênh nâng hạng (khách tự thanh toán với đơn vị chi trả)');
    for (const r of shuttles) await ins('SHUTTLE', r, 0, r.memo);
    const changed = sig(old) !== sig([...rooms.map((r) => ({ ...r, kind: 'ROOM' })), ...rooms.filter((r) => r.upgradeVnd > 0).map((r) => ({ ...r, kind: 'UPGRADE_DELTA', amountVnd: r.upgradeVnd, commissionVnd: 0 })), ...shuttles.map((r) => ({ ...r, kind: 'SHUTTLE', commissionVnd: 0 }))]);
    const statement = await recompute(tx, cur.id, changed);
    if (changed) await audit(c, tx, 'PAYER_STATEMENT.GENERATE', cur.id, brief(cur), { ...brief(statement), period, payerId });
    return { statement, unchanged: !changed, warnings: { linesWithoutRate: rooms.filter((r) => r.noRate).length } };
  });
}

/** Gửi bảng kê: chỉ khi kỳ đã kết thúc (giờ VN); đặt hạn khiếu nại = 5 ngày kể từ lúc gửi. */
export async function sendStatement(c: Ctx, id: string, now = new Date()) {
  return withTransaction(async (tx) => {
    const s = await lockStatementRow(tx, id);
    if (s.status !== 'DRAFT') throw new AppError(409, 'STATEMENT_NOT_DRAFT', 'Chỉ gửi được bảng kê đang ở trạng thái nháp');
    if (!periodEnded(s.period, now)) throw new AppError(409, 'PERIOD_NOT_ENDED', 'Kỳ chưa kết thúc, chưa gửi được bảng kê');
    const next = (await tx.query("UPDATE payer_statements SET status = 'SENT', sent_at = $2, dispute_deadline = $3, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *", [id, now, new Date(now.getTime() + DISPUTE_DAYS * 86400_000)])).rows[0]!;
    await audit(c, tx, 'PAYER_STATEMENT.SEND', id, brief(s), { ...brief(next), disputeDeadline: next.disputeDeadline });
    return next;
  });
}

/** Đơn vị chi trả khiếu nại trong hạn (kèm lý do). Quá hạn/không ở trạng thái đã gửi -> 409. Bảng kê của đơn vị khác -> 404. */
export async function disputeStatement(c: Ctx, payerId: string, id: string, reason: string, now = new Date()) {
  return withTransaction(async (tx) => {
    const s = await lockStatementRow(tx, id, payerId);
    if (s.status === 'DRAFT') throw notFound(); // nháp chưa gửi: đơn vị chi trả không được biết là có
    if (s.status !== 'SENT') throw new AppError(409, 'STATEMENT_NOT_DISPUTABLE', 'Chỉ khiếu nại được bảng kê đã gửi và chưa khóa');
    if (now.getTime() > new Date(s.disputeDeadline).getTime()) throw new AppError(409, 'DISPUTE_WINDOW_CLOSED', 'Đã quá hạn khiếu nại');
    const next = (await tx.query("UPDATE payer_statements SET status = 'DISPUTED', dispute_reason = $2, disputed_at = $3, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *", [id, reason, now])).rows[0]!;
    await audit(c, tx, 'PAYER_STATEMENT.DISPUTE', id, brief(s), brief(next), reason);
    return next;
  });
}

/** Khóa sổ (quyền finance kiểm ở router): chỉ khi đã gửi, hết hạn khiếu nại và không có khiếu nại mở. */
export async function lockStatement(c: Ctx, id: string, now = new Date()) {
  return withTransaction(async (tx) => {
    const s = await lockStatementRow(tx, id);
    if (s.status !== 'SENT') throw new AppError(409, 'STATEMENT_NOT_LOCKABLE', s.status === 'DISPUTED' ? 'Bảng kê đang có khiếu nại: xử lý rồi mở lại về nháp' : 'Chỉ khóa được bảng kê đã gửi');
    if (now.getTime() < new Date(s.disputeDeadline).getTime()) throw new AppError(409, 'DISPUTE_WINDOW_OPEN', 'Chưa hết hạn khiếu nại', { disputeDeadline: s.disputeDeadline });
    const next = (await tx.query("UPDATE payer_statements SET status = 'LOCKED', locked_at = $2, locked_by = $3, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *", [id, now, c.auth.sub])).rows[0]!;
    await audit(c, tx, 'PAYER_STATEMENT.LOCK', id, brief(s), brief(next));
    return next;
  });
}

/** Mở lại kỳ về DRAFT (SENT/DISPUTED/LOCKED), bắt buộc lý do, ghi audit. Dòng giữ nguyên; tạo lại để cập nhật. */
export async function reopenStatement(c: Ctx, id: string, reason: string) {
  return withTransaction(async (tx) => {
    const s = await lockStatementRow(tx, id);
    if (s.status === 'DRAFT') throw new AppError(409, 'STATEMENT_ALREADY_DRAFT', 'Bảng kê đang là nháp');
    const next = (
      await tx.query("UPDATE payer_statements SET status = 'DRAFT', sent_at = NULL, dispute_deadline = NULL, dispute_reason = NULL, disputed_at = NULL, locked_at = NULL, locked_by = NULL, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *", [id])
    ).rows[0]!;
    await audit(c, tx, 'PAYER_STATEMENT.REOPEN', id, brief(s), brief(next), reason);
    return next;
  });
}

/**
 * Điều chỉnh/truy thu SAU KHI KHÓA: kỳ gốc `period` phải đã LOCKED; dòng ADJUSTMENT (có dấu: dương = đơn vị chi trả nợ thêm) ghi vào kỳ kế tiếp
 * (kỳ kế tiếp không còn DRAFT thì sang kỳ sau nữa). Không bao giờ sửa kỳ đã khóa.
 */
export async function addPayerAdjustment(c: Ctx, a: { payerId: string; period: string; amountVnd: number; memo: string; hotelId?: string; bookingId?: string }) {
  const period = assertPeriod(a.period);
  if (!Number.isSafeInteger(a.amountVnd) || a.amountVnd === 0) throw new AppError(422, 'INVALID_AMOUNT', 'Số tiền điều chỉnh phải là số nguyên VND khác 0');
  return withTransaction(async (tx) => {
    const src = (await tx.query('SELECT status FROM payer_statements WHERE payer_id = $1 AND period = $2', [a.payerId, period])).rows[0];
    if (!src || src.status !== 'LOCKED') throw new AppError(409, 'PERIOD_NOT_LOCKED', 'Kỳ gốc chưa khóa: hãy tạo lại bảng kê thay vì điều chỉnh');
    let target = nextPeriod(period);
    for (let i = 0; i < 24; i++, target = nextPeriod(target)) {
      await tx.query('INSERT INTO payer_statements (payer_id, period) VALUES ($1,$2) ON CONFLICT (payer_id, period) DO NOTHING', [a.payerId, target]);
      const s = (await tx.query('SELECT * FROM payer_statements WHERE payer_id = $1 AND period = $2 FOR UPDATE', [a.payerId, target])).rows[0]!;
      if (s.status !== 'DRAFT') continue;
      await tx.query("INSERT INTO payer_statement_lines (statement_id, booking_id, hotel_id, kind, amount_vnd, memo) VALUES ($1,$2,$3,'ADJUSTMENT',$4,$5)", [s.id, a.bookingId ?? null, a.hotelId ?? null, a.amountVnd, `[Kỳ ${period}] ${a.memo}`]);
      const next = await recompute(tx, s.id, true);
      await audit(c, tx, 'PAYER_STATEMENT.ADJUST', s.id, brief(s), { ...brief(next), fromPeriod: period, amountVnd: a.amountVnd }, a.memo);
      return next;
    }
    throw new AppError(409, 'NO_OPEN_PERIOD', 'Không tìm thấy kỳ nháp để ghi điều chỉnh');
  });
}

// ---------- đọc ----------
export async function listStatements(q: { payerId?: string; period?: string; status?: string; limit: number; after?: number; excludeDraft?: boolean }) {
  const rows = (
    await db.query<{ seq: number }>(
      `SELECT s.*, p.name AS payer_name FROM payer_statements s JOIN payers p ON p.id = s.payer_id
       WHERE ($1::uuid IS NULL OR s.payer_id = $1) AND ($2::text IS NULL OR s.period = $2) AND ($3::text IS NULL OR s.status = $3) AND ($4::bigint IS NULL OR s.seq < $4) AND ($6::boolean IS NOT TRUE OR s.status <> 'DRAFT')
       ORDER BY s.seq DESC LIMIT $5`,
      [q.payerId ?? null, q.period ?? null, q.status ?? null, q.after ?? null, q.limit + 1, q.excludeDraft ?? false],
    )
  ).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null };
}

/** payerId (nếu có) = góc nhìn đơn vị chi trả: khóa phạm vi (đơn vị khác -> 404) và không thấy bảng kê nháp (404). */
export async function getStatement(id: string, payerId?: string) {
  const statement = (await db.query('SELECT s.*, p.name AS payer_name FROM payer_statements s JOIN payers p ON p.id = s.payer_id WHERE s.id = $1 AND ($2::uuid IS NULL OR s.payer_id = $2)', [id, payerId ?? null])).rows[0];
  if (!statement || (payerId && statement.status === 'DRAFT')) throw notFound();
  const lines = (
    await db.query(
      `SELECT l.id, l.kind, l.booking_id, b.code AS booking_code, l.group_code, l.flight_code, l.hotel_id, h.name AS hotel_name, l.amount_vnd, l.commission_vnd, l.memo
       FROM payer_statement_lines l LEFT JOIN bookings b ON b.id = l.booking_id LEFT JOIN hotels h ON h.id = l.hotel_id WHERE l.statement_id = $1 ORDER BY l.seq`,
      [id],
    )
  ).rows;
  return { statement, lines };
}

// CSV: ô chữ bắt đầu bằng = + - @ (tab/CR) bị Excel hiểu là công thức -> thêm dấu nháy đơn; số tiền ghi nguyên (số âm hợp lệ).
const cell = (v: unknown): string => {
  const s = v === undefined || v === null ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export async function statementCsv(id: string, payerId?: string): Promise<{ filename: string; csv: string }> {
  const { statement: s, lines } = await getStatement(id, payerId);
  const out = [['kind', 'booking_code', 'group_code', 'flight_code', 'hotel', 'amount_vnd', 'commission_vnd', 'memo']];
  const num = (n: number) => String(n);
  const rows = lines.map((l: any) => [cell(l.kind), cell(l.bookingCode), cell(l.groupCode), cell(l.flightCode), cell(l.hotelName), num(l.amountVnd), num(l.commissionVnd), cell(l.memo)]);
  const body = [out[0]!.join(','), ...rows.map((r) => r.join(',')), ['TOTAL', '', '', '', '', num(s.totalVnd), num(s.commissionVnd), cell(`${s.payerName} ${s.period} (${s.status})`)].join(',')];
  return { filename: `bang-ke-${s.period}-${s.payerId.slice(0, 8)}.csv`, csv: `﻿${body.join('\r\n')}\r\n` };
}
