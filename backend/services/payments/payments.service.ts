import { randomUUID } from 'node:crypto';
import { db, json, withTransaction, type Db } from '../../database/pg';
import type { Actor, BookingDoc, LedgerAccount, PaymentDoc, RefundDoc } from '../../database/types';
import { bookingFromRow } from '../../database/types';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { newVnpOrder, verifyVnpay, vnpDate, vnpKeys, vnpayGateway } from '../../lib/vnpay';
import { writeAudit } from '../audit';
import { emitBookingChange } from '../events';
import { HOLD_MS } from '../bookings/bookings.service';
import { getConfig } from '../systemConfig';

const SYSTEM: Actor = { type: 'SYSTEM' };
const STALE_PENDING_MS = 15 * 60_000; // BA §6.4: callback không đến sau 15 phút -> chủ động truy vấn
const DAY_MS = 24 * 3600_000;

const insertLedger = async (
  tx: Db,
  b: { id: string; hotelId: string },
  ref: { type: 'PAYMENT' | 'REFUND'; id: string },
  now: Date,
  lines: Array<[LedgerAccount, number]>,
) => {
  for (const [account, amount] of lines) {
    await tx.query('INSERT INTO ledger_entries (ts, booking_id, hotel_id, ref_type, ref_id, account, amount_vnd) VALUES ($1,$2,$3,$4,$5,$6,$7)', [now, b.id, b.hotelId, ref.type, ref.id, account, amount]);
  }
};

const notify = (b: { code: string; status: string; hotelId: string }) => emitBookingChange({ code: b.code, status: b.status, hotelId: b.hotelId, updatedAt: new Date(), isNew: false });

// ---------- Tạo / lấy link thanh toán ----------

export interface PayLink { payUrl: string; expiresAt?: Date }

/**
 * Trả link thanh toán còn dùng được cho đơn PENDING_PAYMENT; chưa có thì tạo URL VNPay.
 * Mỗi lần tạo mới là một bản ghi payments với txnRef mới (VNPay không cho dùng lại vnp_TxnRef).
 * Lỗi tạo link -> AppError 502, đơn vẫn giữ chỗ, khách thử lại qua endpoint pay-link.
 */
export async function ensureVnpayLink(bookingId: string): Promise<PayLink> {
  const b = (await db.query('SELECT * FROM bookings WHERE id = $1', [bookingId])).rows[0];
  const booking = b && bookingFromRow(b);
  if (!booking || booking.status !== 'PENDING_PAYMENT' || booking.payment.method !== 'VNPAY') {
    throw new AppError(409, 'PAYMENT_NOT_AVAILABLE', 'Đơn không ở trạng thái chờ thanh toán VNPay');
  }
  if (!booking.expiresAt || booking.expiresAt <= new Date()) throw new AppError(409, 'BOOKING_EXPIRED', 'Đơn đã hết thời gian giữ chỗ');

  const open = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE booking_id = $1 AND status IN ('INITIATED','PENDING') ORDER BY created_at DESC", [bookingId])).rows;
  const usable = open.find((p) => p.gateway.payUrl);
  if (usable?.gateway.payUrl) return { payUrl: usable.gateway.payUrl, expiresAt: booking.expiresAt };

  const now = new Date();
  // Lần tạo trước lỗi giữa chừng (chưa có link): đánh dấu FAILED; nếu VNPay thực ra đã nhận, IPN muộn vẫn xử lý được theo orderId.
  const dead = open.filter((p) => !p.gateway.payUrl).map((p) => p.id);
  if (dead.length) await db.query("UPDATE payments SET status = 'FAILED', updated_at = $2 WHERE id = ANY($1::uuid[]) AND status = 'INITIATED'", [dead, now]);

  const { orderId, requestId } = newVnpOrder(booking.code);
  const id = randomUUID();
  const gateway = { tmnCode: vnpKeys.tmnCode, orderId, requestId, createDate: vnpDate(now) };
  const ins = await db.query<PaymentDoc>(
    `INSERT INTO payments (id, booking_id, hotel_id, method, amount_vnd, status, txn_ref, gateway, created_at, updated_at)
     VALUES ($1,$2,$3,'VNPAY',$4,'INITIATED',$5,$6::jsonb,$7,$7) RETURNING *`,
    [id, bookingId, booking.hotelId, booking.pricing.totalVnd, orderId, json(gateway), now],
  );
  return startVnpayPayment(ins.rows[0]!, booking.code);
}

// Ngay sau khi tạo đơn VNPay: lấy bản ghi payments INITIATED do createBooking tạo rồi tạo URL thanh toán.
export async function startBookingPayment(bookingId: string, code: string): Promise<PayLink> {
  const p = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE booking_id = $1 AND status = 'INITIATED' ORDER BY created_at DESC LIMIT 1", [bookingId])).rows[0];
  if (!p) throw new AppError(409, 'PAYMENT_NOT_AVAILABLE', 'Đơn không có giao dịch chờ khởi tạo');
  return startVnpayPayment(p, code);
}

// Tạo URL VNPay cho bản ghi payments đã có (INITIATED). Không gọi mạng: lỗi chỉ xảy ra khi cấu hình sai.
export async function startVnpayPayment(payment: PaymentDoc, code: string): Promise<PayLink> {
  const b = (await db.query<{ expiresAt?: Date }>('SELECT expires_at FROM bookings WHERE id = $1', [payment.bookingId])).rows[0];
  let payUrl: string;
  try {
    ({ payUrl } = vnpayGateway.create({
      txnRef: payment.gateway.orderId,
      amount: payment.amountVnd,
      orderInfo: `Airrest ${code}`.replace(/-/g, ' '),
      createDate: payment.gateway.createDate,
      expireDate: b?.expiresAt ? vnpDate(b.expiresAt) : undefined,
    }));
  } catch (e) {
    logger.error({ err: e, orderId: payment.gateway.orderId }, 'Tạo URL VNPay lỗi');
    await db.query("UPDATE payments SET status = 'FAILED', updated_at = now() WHERE id = $1 AND status = 'INITIATED'", [payment.id]);
    throw new AppError(502, 'VNPAY_UNAVAILABLE', 'Không tạo được liên kết thanh toán VNPay, vui lòng thử lại');
  }
  await db.query("UPDATE payments SET status = 'PENDING', gateway = gateway || $2::jsonb, updated_at = now() WHERE id = $1 AND status = 'INITIATED'", [payment.id, json({ payUrl })]);
  return { payUrl, expiresAt: b?.expiresAt };
}

// ---------- IPN (VNPay gọi GET về server, trả JSON {RspCode, Message}) ----------

type Query = Record<string, unknown>;
export interface IpnReply { RspCode: string; Message: string }
const reply = (RspCode: string, Message: string): IpnReply => ({ RspCode, Message });

/**
 * Xử lý IPN: kiểm chữ ký -> tìm đơn -> kiểm số tiền -> cập nhật có điều kiện (R3). Lặp lại không sinh bản ghi thứ hai.
 * Mã trả VNPay: 00 ok, 01 không thấy đơn, 02 đã xác nhận trước đó, 04 sai số tiền, 97 sai chữ ký, 99 lỗi khác.
 */
export async function handleVnpayIpn(q: Query, requestId?: string): Promise<IpnReply> {
  if (!verifyVnpay(q)) return reply('97', 'Invalid signature');
  const payment = (await db.query<PaymentDoc>('SELECT * FROM payments WHERE txn_ref = $1', [String(q.vnp_TxnRef)])).rows[0];
  if (!payment) {
    logger.warn({ orderId: q.vnp_TxnRef }, 'IPN cho vnp_TxnRef không tồn tại, bỏ qua');
    return reply('01', 'Order not found');
  }
  const success = q.vnp_ResponseCode === '00' && q.vnp_TransactionStatus === '00';
  const resultCode = Number(q.vnp_ResponseCode);
  const cb = { at: new Date(), resultCode, signatureOk: true };

  if (Number(q.vnp_Amount) !== payment.amountVnd * 100) {
    // BR-PAY-01: lệch tiền -> không xác nhận, đưa vào hàng đợi kế toán xử lý.
    await db.query("UPDATE payments SET anomaly = $2::jsonb, callbacks = callbacks || $3::jsonb, updated_at = $4 WHERE id = $1 AND status <> 'SUCCEEDED'", [
      payment.id,
      json({ kind: 'AMOUNT_MISMATCH', at: cb.at }),
      json([cb]),
      cb.at,
    ]);
    return reply('04', 'Invalid amount');
  }
  if (payment.status === 'SUCCEEDED') return reply('02', 'Order already confirmed');
  if (!success) {
    await db.query(
      "UPDATE payments SET status = 'FAILED', gateway = gateway || $2::jsonb, callbacks = callbacks || $3::jsonb, updated_at = $4 WHERE id = $1 AND status IN ('INITIATED','PENDING')",
      [payment.id, json({ resultCode, message: String(q.vnp_ResponseCode) }), json([cb]), cb.at],
    );
    return reply('00', 'Confirm Success');
  }
  await settleSuccess(payment.id, Number(q.vnp_TransactionNo), cb, requestId);
  return reply('00', 'Confirm Success');
}

/**
 * Giao dịch thành công. Trong MỘT transaction: payment -> SUCCEEDED, đơn -> CONFIRMED/PENDING, giữ phòng, sổ cái, audit.
 * Thành công đến sau khi đơn hết hạn/hủy hoặc đã có giao dịch khác thanh toán rồi -> ghi anomaly và tạo lệnh hoàn 100% (BR-CXL-14).
 */
async function settleSuccess(paymentId: string, transId: number, cb: { at: Date; resultCode: number; signatureOk: boolean }, requestId?: string): Promise<void> {
  const out = await withTransaction(async (tx) => {
    const now = new Date();
    // SUCCEEDED là trạng thái cuối: callback lặp không khớp điều kiện -> bỏ qua. FAILED/EXPIRED vẫn nhận (tiền đã thu thật).
    const p = (
      await tx.query<PaymentDoc>(
        `UPDATE payments SET status = 'SUCCEEDED', gateway = gateway || $2::jsonb, callbacks = callbacks || $3::jsonb, paid_at = $4, updated_at = $4
         WHERE id = $1 AND status <> 'SUCCEEDED' RETURNING *`,
        [paymentId, json({ transId, resultCode: 0 }), json([cb]), now],
      )
    ).rows[0];
    if (!p) return null;
    // Khóa đơn: hai giao dịch của cùng một đơn thanh toán đồng thời sẽ xử lý lần lượt (cái sau thấy đơn đã trả).
    const b = bookingFromRow((await tx.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [p.bookingId])).rows[0]!);
    const amount = p.amountVnd;
    const alreadyPaid = b.payment.paidVnd > 0;
    const onTime = b.status === 'PENDING_PAYMENT' && !!b.expiresAt && b.expiresAt > now && !alreadyPaid;

    if (onTime) {
      const hotel = (await tx.query<{ approval: { manual: boolean } }>('SELECT approval FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
      const manual = !!hotel?.approval.manual;
      const next = manual ? 'PENDING' : 'CONFIRMED';
      const holdUntil = new Date(now.getTime() + HOLD_MS);
      await tx.query(
        `UPDATE bookings SET status = $2, payment_status = 'PAID', paid_vnd = $3, updated_at = $4, expires_at = $5,
           status_history = status_history || $6::jsonb, v = v + 1 WHERE id = $1`,
        [b.id, next, amount, now, manual ? holdUntil : null, json([{ from: 'PENDING_PAYMENT', to: next, at: now, by: SYSTEM, reasonCode: 'VNPAY_PAID' }])],
      );
      if (manual) await tx.query("UPDATE room_reservations SET hold_expires_at = $2, updated_at = $3 WHERE booking_id = $1 AND state = 'HOLD'", [b.id, holdUntil, now]);
      else await tx.query("UPDATE room_reservations SET state = 'CONFIRMED', hold_expires_at = NULL, updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [b.id, now]);
      const fee = b.pricing.serviceFeeVnd;
      await insertLedger(tx, b, { type: 'PAYMENT', id: p.id }, now, [['CUSTOMER_PAID', amount], ['HOTEL_PAYABLE', amount - fee], ['AIRREST_REVENUE', fee]]);
      await writeAudit({ actor: SYSTEM, action: 'PAYMENT.SUCCEEDED', entity: { type: 'payment', id: p.id }, hotelId: b.hotelId, bookingId: b.id, after: { amountVnd: amount, status: next }, requestId }, tx);
      return { refundId: null, booking: { code: b.code, status: next, hotelId: b.hotelId } };
    }

    // Không xác nhận được đơn -> hoàn 100% giao dịch này.
    const kind = alreadyPaid ? 'DUPLICATE' : 'LATE_SUCCESS';
    await tx.query('UPDATE payments SET anomaly = $2::jsonb WHERE id = $1', [p.id, json({ kind, at: now })]);
    let status = b.status;
    if (b.status === 'PENDING_PAYMENT' && !alreadyPaid) {
      status = 'EXPIRED';
      await tx.query(
        "UPDATE bookings SET status = 'EXPIRED', updated_at = $2, status_history = status_history || $3::jsonb, v = v + 1 WHERE id = $1",
        [b.id, now, json([{ from: 'PENDING_PAYMENT', to: 'EXPIRED', at: now, by: SYSTEM, reasonCode: 'PAID_AFTER_HOLD' }])],
      );
      await tx.query("UPDATE room_reservations SET state = 'RELEASED', updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [b.id, now]);
    }
    // Trùng giao dịch: đơn đã PAID đúng số tiền, khoản thừa nằm ngoài đơn nên không đụng payment của đơn. Chỉ trường hợp muộn mới ghi thu rồi hoàn.
    if (!alreadyPaid) await tx.query("UPDATE bookings SET payment_status = 'PAID', paid_vnd = paid_vnd + $2, updated_at = $3 WHERE id = $1", [b.id, amount, now]);
    const refund = newRefund(b, p, kind === 'DUPLICATE' ? 'DUPLICATE_PAYMENT' : 'LATE_PAYMENT');
    await tx.query(
      `INSERT INTO refunds (id, booking_id, hotel_id, payment_id, key, amount_vnd, reason_code, method, status, gateway, due_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'VNPAY','PENDING',$8::jsonb,$9,$9,$9)`,
      [refund.id, b.id, b.hotelId, p.id, refund.key, amount, refund.reasonCode, json(refund.gateway), now],
    );
    await insertLedger(tx, b, { type: 'PAYMENT', id: p.id }, now, [['CUSTOMER_PAID', amount], ['CUSTOMER_REFUNDABLE', amount]]);
    await writeAudit({ actor: SYSTEM, action: `PAYMENT.${kind}`, entity: { type: 'payment', id: p.id }, hotelId: b.hotelId, bookingId: b.id, after: { amountVnd: amount, refundId: refund.id }, requestId }, tx);
    return { refundId: refund.id, booking: { code: b.code, status, hotelId: b.hotelId } };
  });
  if (!out) return;
  notify(out.booking);
  if (out.refundId) await processRefund(out.refundId, requestId); // gọi VNPay ngoài transaction
}

function newRefund(b: BookingDoc, p: PaymentDoc, reasonCode: RefundDoc['reasonCode']) {
  const { orderId, requestId } = newVnpOrder(`RF${b.code}`);
  // Một giao dịch thu chỉ có tối đa một lệnh hoàn cùng lý do (UNIQUE key).
  return { id: randomUUID(), key: `${b.id}:${reasonCode}:${p.id}`, reasonCode, gateway: { orderId, requestId } };
}

// ---------- Hoàn tiền ----------

/** Nhận lệnh PENDING -> gọi VNPay -> REFUNDED, hoặc xếp lịch thử lại, hết lượt thì MANUAL_REQUIRED (BA §5A.4). */
export async function processRefund(refundId: string, requestId?: string): Promise<RefundDoc | null> {
  const now = new Date();
  const r = (await db.query<RefundDoc>("UPDATE refunds SET status = 'PROCESSING', updated_at = $2 WHERE id = $1 AND status = 'PENDING' RETURNING *", [refundId, now])).rows[0];
  if (!r) return null; // đã có luồng khác nhận
  const pay = (await db.query<PaymentDoc>('SELECT txn_ref, gateway FROM payments WHERE id = $1', [r.paymentId])).rows[0];
  let res: { ok: boolean; code: string; message: string; transId?: number };
  try {
    res = await vnpayGateway.refund({
      requestId: r.gateway.requestId, txnRef: pay!.gateway.orderId, amount: r.amountVnd, transId: pay?.gateway.transId ?? 0, transactionDate: pay!.gateway.createDate,
    });
  } catch (e) {
    // Lỗi mạng có thể đã hoàn thật: giữ NGUYÊN requestId khi thử lại.
    res = { ok: false, code: 'ERR', message: (e as Error).message };
  }
  const at = new Date();
  if (res.ok) {
    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE refunds SET status = 'REFUNDED', gateway = gateway || $2::jsonb, attempts = attempts || $3::jsonb, completed_at = $4, updated_at = $4 WHERE id = $1`,
        [r.id, json({ refundTransId: res.transId, resultCode: 0 }), json([{ at, ok: true, code: 0 }]), at],
      );
      if (r.reasonCode === 'LATE_PAYMENT') {
        await tx.query(
          `UPDATE bookings SET refunded_vnd = refunded_vnd + $2, updated_at = $3,
             payment_status = CASE WHEN refunded_vnd + $2 >= paid_vnd THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END WHERE id = $1`,
          [r.bookingId, r.amountVnd, at],
        );
      }
      await insertLedger(tx, { id: r.bookingId, hotelId: r.hotelId }, { type: 'REFUND', id: r.id }, at, [['CUSTOMER_REFUNDABLE', -r.amountVnd], ['CUSTOMER_PAID', -r.amountVnd]]);
      await writeAudit({ actor: SYSTEM, action: 'REFUND.DONE', entity: { type: 'refund', id: r.id }, hotelId: r.hotelId, bookingId: r.bookingId, after: { amountVnd: r.amountVnd }, requestId }, tx);
    });
  } else {
    const retries = (await getConfig('refund')).value.gatewayRetries;
    const exhausted = r.attempts.length + 1 > retries; // lần đầu + `retries` lần thử lại
    await db.query(
      `UPDATE refunds SET status = $2, gateway = gateway || $3::jsonb, due_at = $4, attempts = attempts || $5::jsonb, updated_at = $6 WHERE id = $1`,
      [
        r.id,
        exhausted ? 'MANUAL_REQUIRED' : 'PENDING',
        json({ resultCode: Number(res.code) || -1 }),
        exhausted ? r.dueAt : new Date(at.getTime() + DAY_MS / Math.max(retries, 1)), // rải đều trong 24h
        json([{ at, ok: false, code: Number(res.code) || -1, message: res.message }]),
        at,
      ],
    );
  }
  return (await db.query<RefundDoc>('SELECT * FROM refunds WHERE id = $1', [r.id])).rows[0] ?? null;
}

// Admin: chuyển lệnh MANUAL_REQUIRED về PENDING để thử lại ngay (sau khi đã xử lý nguyên nhân, ví dụ ví khách mở lại).
export async function retryRefund(refundId: string, actor: Actor, requestId?: string): Promise<RefundDoc | null> {
  const now = new Date();
  const r = (await db.query<RefundDoc>("UPDATE refunds SET status = 'PENDING', due_at = $2, updated_at = $2 WHERE id = $1 AND status = 'MANUAL_REQUIRED' RETURNING *", [refundId, now])).rows[0];
  if (!r) throw new AppError(409, 'INVALID_STATE', 'Lệnh hoàn không tồn tại hoặc không ở trạng thái MANUAL_REQUIRED');
  await writeAudit({ actor, action: 'REFUND.RETRY', entity: { type: 'refund', id: refundId }, hotelId: r.hotelId, bookingId: r.bookingId, requestId });
  return processRefund(refundId, requestId);
}

// ---------- Đối soát gọi tay (BA §6, ADM-11 theo quyết định: không scheduler) ----------

/** Một lượt: (1) truy vấn giao dịch treo >15 phút, (2) hết hạn đơn chờ thanh toán, (3) xử lý lệnh hoàn đến hạn. */
export async function reconcilePayments(actor: Actor, requestId?: string) {
  const now = new Date();
  const out = { queried: 0, settled: 0, failed: 0, expiredBookings: 0, refundsProcessed: 0 };

  const stale = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE status = 'PENDING' AND created_at < $1 ORDER BY created_at LIMIT 100", [new Date(now.getTime() - STALE_PENDING_MS)])).rows;
  for (const p of stale) {
    out.queried++;
    try {
      const q = await vnpayGateway.query({ txnRef: p.gateway.orderId, requestId: newVnpOrder('Q').requestId, transactionDate: p.gateway.createDate });
      if (q.status === 'SUCCESS') {
        if (q.amount !== undefined && q.amount !== p.amountVnd) {
          await db.query('UPDATE payments SET anomaly = $2::jsonb, updated_at = $3 WHERE id = $1', [p.id, json({ kind: 'AMOUNT_MISMATCH', at: now }), now]);
          continue;
        }
        await settleSuccess(p.id, q.transId ?? 0, { at: now, resultCode: 0, signatureOk: true }, requestId);
        out.settled++;
      } else if (q.status === 'FAILED') {
        await db.query("UPDATE payments SET status = 'FAILED', gateway = gateway || $2::jsonb, updated_at = $3 WHERE id = $1 AND status = 'PENDING'", [p.id, json({ message: q.message }), now]);
        out.failed++;
      }
    } catch (e) {
      logger.error({ err: e, orderId: p.gateway.orderId }, 'Truy vấn VNPay lỗi, bỏ qua giao dịch này');
    }
  }

  const due = (await db.query<{ id: string }>("SELECT id FROM bookings WHERE status = 'PENDING_PAYMENT' AND expires_at <= $1 LIMIT 200", [now])).rows;
  for (const d of due) {
    const expired = await withTransaction((tx) => expireUnpaid(tx, d.id, actor, now, requestId));
    if (expired) {
      out.expiredBookings++;
      notify(expired);
    }
  }

  const refunds = (await db.query<{ id: string }>("SELECT id FROM refunds WHERE status = 'PENDING' AND due_at <= $1 ORDER BY due_at LIMIT 50", [now])).rows;
  for (const r of refunds) {
    await processRefund(r.id, requestId);
    out.refundsProcessed++;
  }
  // Lệnh kẹt PROCESSING >15 phút (tiến trình chết giữa chừng) -> trả về PENDING; requestId giữ nguyên.
  await db.query("UPDATE refunds SET status = 'PENDING', updated_at = $1 WHERE status = 'PROCESSING' AND updated_at < $2", [now, new Date(now.getTime() - STALE_PENDING_MS)]);

  await writeAudit({ actor, action: 'PAYMENT.RECONCILE', entity: { type: 'payment', id: 'reconcile' }, after: out, requestId });
  return out;
}

async function expireUnpaid(tx: Db, bookingId: string, actor: Actor, now: Date, requestId?: string) {
  const b = (
    await tx.query<{ code: string; hotelId: string }>(
      `UPDATE bookings SET status = 'EXPIRED', updated_at = $2, status_history = status_history || $3::jsonb, v = v + 1
       WHERE id = $1 AND status = 'PENDING_PAYMENT' AND expires_at <= $2 RETURNING code, hotel_id`,
      [bookingId, now, json([{ from: 'PENDING_PAYMENT', to: 'EXPIRED', at: now, by: actor, reasonCode: 'HOLD_EXPIRED' }])],
    )
  ).rows[0];
  if (!b) return null;
  await tx.query("UPDATE room_reservations SET state = 'RELEASED', updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [bookingId, now]);
  // Giao dịch chưa thanh toán -> EXPIRED. Nếu khách vẫn trả sau đó, settleSuccess hoàn 100%.
  await tx.query("UPDATE payments SET status = 'EXPIRED', updated_at = $2 WHERE booking_id = $1 AND status IN ('INITIATED','PENDING')", [bookingId, now]);
  await writeAudit({ actor, action: 'BOOKING.EXPIRE', entity: { type: 'booking', id: bookingId }, hotelId: b.hotelId, bookingId, before: { status: 'PENDING_PAYMENT' }, after: { status: 'EXPIRED' }, requestId }, tx);
  return { code: b.code, status: 'EXPIRED', hotelId: b.hotelId };
}
