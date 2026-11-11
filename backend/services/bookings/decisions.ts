import { randomUUID } from 'node:crypto';
import { db, json, withTransaction, type Db } from '../../database/pg';
import { bookingFromRow, type Actor, type Alternative, type BookingDecisionDoc, type BookingDoc, type RefundDoc } from '../../database/types';
import { AppError } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { newVnpOrder } from '../../lib/vnpay';
import { actorOf, writeAudit } from '../audit';
import { emitBookingChange } from '../events';
import { hotelScope } from '../scope';
import { cancelShuttlesForBooking } from '../shuttle/cascade';
import { suggestAlternatives } from './alternatives';

const SYSTEM: Actor = { type: 'SYSTEM' };
type Change = { code: string; status: string; hotelId: string; updatedAt: Date };
const emit = (c: Change) => emitBookingChange({ ...c, isNew: false });

const upsertDecision = (tx: Db, bookingId: string, decision: BookingDecisionDoc['decision'], by: Actor, reason?: string, alternatives: Alternative[] = []) =>
  tx.query(
    `INSERT INTO booking_decisions (booking_id, decision, reason, decided_by, alternatives) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
     ON CONFLICT (booking_id) DO UPDATE SET decision = EXCLUDED.decision, reason = EXCLUDED.reason, decided_by = EXCLUDED.decided_by, alternatives = EXCLUDED.alternatives, decided_at = now()`,
    [bookingId, decision, reason ?? null, json(by), json(alternatives)],
  );

/**
 * Đơn đã thu tiền mà khách sạn từ chối/không phản hồi: ghi lệnh hoàn PENDING, KHÔNG gọi cổng thanh toán.
 * due_at = 'infinity' để reconcilePayments (chỉ lấy lệnh đến hạn) không tự xử lý; luồng thanh toán bật lại sẽ kích hoạt bằng cách đặt due_at.
 */
export async function createDecisionRefund(tx: Db, b: BookingDoc, reasonCode: RefundDoc['reasonCode'], now: Date, requestId?: string): Promise<string | null> {
  if (b.payment.status !== 'PAID' || b.payment.paidVnd <= 0) return null;
  const pay = (await tx.query<{ id: string }>("SELECT id FROM payments WHERE booking_id = $1 AND status = 'SUCCEEDED' ORDER BY paid_at LIMIT 1", [b.id])).rows[0];
  if (!pay) return null;
  const { orderId, requestId: gwRequestId } = newVnpOrder(`RF${b.code}`);
  const ins = await tx.query<{ id: string }>(
    `INSERT INTO refunds (id, booking_id, hotel_id, payment_id, key, amount_vnd, reason_code, method, status, gateway, due_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'VNPAY','PENDING',$8::jsonb,'infinity',$9,$9) ON CONFLICT (key) DO NOTHING RETURNING id`,
    [randomUUID(), b.id, b.hotelId, pay.id, `DECISION:${b.id}`, b.payment.paidVnd, reasonCode, json({ orderId, requestId: gwRequestId }), now],
  );
  const created = ins.rows[0];
  if (created) await writeAudit({ actor: SYSTEM, action: 'REFUND.CREATE', entity: { type: 'refund', id: created.id }, hotelId: b.hotelId, bookingId: b.id, after: { amountVnd: b.payment.paidVnd, reasonCode }, requestId }, tx);
  return created?.id ?? null;
}

/** PENDING quá hạn -> EXPIRED + nhả phòng. Điều kiện nằm trong câu UPDATE nên nhiều tiến trình cùng quét vẫn chỉ xử lý một lần. */
export async function expireOne(tx: Db, bookingId: string, actor: Actor, now: Date, requestId?: string): Promise<Change | null> {
  const row = (
    await tx.query(
      `UPDATE bookings SET status = 'EXPIRED', updated_at = $2, status_history = status_history || $3::jsonb, v = v + 1
       WHERE id = $1 AND status = 'PENDING' AND expires_at <= $2 RETURNING *`,
      [bookingId, now, json([{ from: 'PENDING', to: 'EXPIRED', at: now, by: actor, reasonCode: 'HOLD_EXPIRED' }])],
    )
  ).rows[0];
  if (!row) return null;
  const b = bookingFromRow(row);
  await tx.query("UPDATE room_reservations SET state = 'RELEASED', updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [bookingId, now]);
  await upsertDecision(tx, bookingId, 'EXPIRED', actor);
  await cancelShuttlesForBooking(tx, bookingId, actor, 'Đơn hết hạn chờ xác nhận', requestId);
  await writeAudit({ actor, action: 'BOOKING.EXPIRE', entity: { type: 'booking', id: bookingId }, hotelId: b.hotelId, bookingId, before: { status: 'PENDING' }, after: { status: 'EXPIRED' }, reasonCode: 'HOLD_EXPIRED', requestId }, tx);
  await createDecisionRefund(tx, b, 'HOTEL_NO_RESPONSE', now, requestId);
  return { code: b.code, status: 'EXPIRED', hotelId: b.hotelId, updatedAt: now };
}

/** Quét đơn chờ xác nhận quá hạn; mỗi đơn một transaction. */
export async function expireOverdueBookings(actor: Actor = SYSTEM, requestId?: string, now = new Date()): Promise<{ expired: number }> {
  const due = (await db.query<{ id: string }>("SELECT id FROM bookings WHERE status = 'PENDING' AND expires_at <= $1 ORDER BY expires_at LIMIT 200", [now])).rows;
  let expired = 0;
  for (const d of due) {
    const ev = await withTransaction((tx) => expireOne(tx, d.id, actor, now, requestId));
    if (ev) {
      expired++;
      emit(ev);
    }
  }
  return { expired };
}

/** Khách tra cứu một đơn đã quá hạn nhưng job chưa chạy: chuyển EXPIRED ngay để khách luôn thấy đúng. */
export async function lazyExpire(bookingId: string, now = new Date()): Promise<void> {
  const ev = await withTransaction((tx) => expireOne(tx, bookingId, SYSTEM, now));
  if (ev) emit(ev);
}

export async function getDecision(bookingId: string): Promise<BookingDecisionDoc | undefined> {
  return (await db.query<BookingDecisionDoc>('SELECT * FROM booking_decisions WHERE booking_id = $1', [bookingId])).rows[0];
}

type Outcome = { kind: 'done'; booking: BookingDoc; alternatives: Alternative[] } | { kind: 'expired'; change: Change };

async function decide(auth: AuthContext, bookingId: string, mode: 'CONFIRM' | 'REJECT', reason: string | undefined, requestId?: string): Promise<{ booking: BookingDoc; alternatives: Alternative[] }> {
  const scope = hotelScope(auth);
  const actor = actorOf(auth);
  const out = await withTransaction<Outcome>(async (tx) => {
    const now = new Date();
    const row = (await tx.query('SELECT * FROM bookings WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) FOR UPDATE', [bookingId, scope.hotelId ?? null])).rows[0];
    if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn');
    const cur = bookingFromRow(row);
    if (cur.status !== 'PENDING') throw new AppError(409, 'INVALID_STATE', 'Đơn không ở trạng thái chờ xác nhận');
    if (cur.expiresAt && cur.expiresAt <= now) {
      // Quá hạn: chuyển EXPIRED và COMMIT (không rollback), rồi báo lỗi ra ngoài.
      const change = await expireOne(tx, bookingId, SYSTEM, now, requestId);
      return { kind: 'expired', change: change! };
    }
    const to = mode === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    const next = bookingFromRow(
      (
        await tx.query(
          `UPDATE bookings SET status = $2, expires_at = NULL, updated_at = $3, status_history = status_history || $4::jsonb, v = v + 1 WHERE id = $1 RETURNING *`,
          [bookingId, to, now, json([{ from: 'PENDING', to, at: now, by: actor, ...(mode === 'REJECT' && { reasonCode: 'HOTEL_REJECTED' }) }])],
        )
      ).rows[0]!,
    );
    let alternatives: Alternative[] = [];
    if (mode === 'CONFIRM') {
      const r = await tx.query("UPDATE room_reservations SET state = 'CONFIRMED', hold_expires_at = NULL, updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [bookingId, now]);
      if (r.rowCount === 0) throw new AppError(409, 'BOOKING_EXPIRED', 'Phòng giữ cho đơn này không còn'); // rollback: không có CONFIRMED ma
      await upsertDecision(tx, bookingId, 'CONFIRMED', actor);
      await writeAudit({ actor, action: 'BOOKING.CONFIRM', entity: { type: 'booking', id: bookingId }, hotelId: cur.hotelId, bookingId, before: { status: 'PENDING' }, after: { status: 'CONFIRMED' }, requestId }, tx);
    } else {
      await tx.query("UPDATE room_reservations SET state = 'RELEASED', updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [bookingId, now]);
      // Tính SAU khi nhả phòng để gợi ý không tự loại khách sạn vừa từ chối.
      alternatives = await suggestAlternatives(tx, { hotelId: cur.hotelId, from: new Date(cur.stay.from), to: new Date(cur.stay.to), qty: cur.lines.reduce((s, l) => s + l.qty, 0), now });
      await upsertDecision(tx, bookingId, 'REJECTED', actor, reason, alternatives);
      await cancelShuttlesForBooking(tx, bookingId, actor, 'Đơn bị khách sạn từ chối', requestId);
      await writeAudit({ actor, action: 'BOOKING.REJECT', entity: { type: 'booking', id: bookingId }, hotelId: cur.hotelId, bookingId, before: { status: 'PENDING' }, after: { status: 'REJECTED' }, reasonCode: 'HOTEL_REJECTED', reasonNote: reason, requestId }, tx);
      await createDecisionRefund(tx, cur, 'HOTEL_REJECTED', now, requestId);
    }
    return { kind: 'done', booking: next, alternatives };
  });
  if (out.kind === 'expired') {
    emit(out.change);
    throw new AppError(409, 'BOOKING_EXPIRED', 'Đơn đã hết hạn chờ xác nhận');
  }
  emit({ code: out.booking.code, status: out.booking.status, hotelId: out.booking.hotelId, updatedAt: out.booking.updatedAt });
  return out;
}

export const confirmBooking = (auth: AuthContext, bookingId: string, requestId?: string) => decide(auth, bookingId, 'CONFIRM', undefined, requestId).then((r) => r.booking);
export const rejectBooking = (auth: AuthContext, bookingId: string, input: { reason: string }, requestId?: string) => decide(auth, bookingId, 'REJECT', input.reason, requestId);
