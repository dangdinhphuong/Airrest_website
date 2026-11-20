import { randomUUID } from 'node:crypto';
import { db, json, withTransaction, type Db } from '../../database/pg';
import type { Actor, BookingDoc, LedgerAccount, PaymentDoc, RefundDoc } from '../../database/types';
import { bookingFromRow } from '../../database/types';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { sepayApi, sepayIpnAuthorized, sepayPayUrl, sepayRefund, buildCheckoutFields, checkoutPage, newSepayOrder } from '../../lib/sepay';
import { writeAudit } from '../audit';
import { emitBookingChange } from '../events';
import { approvalHoldMs } from '../bookings/bookings.service';
import { expireOverdueBookings } from '../bookings/decisions';
import { getConfig } from '../systemConfig';
import { cancelShuttlesForBooking } from '../shuttle/cascade';
import { dispatchDueForBooking } from '../shuttle/dispatch';
import { publishBookingStatus } from '../shuttle/events';

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

const notify = (b: { code: string; status: string; hotelId: string }, kind?: 'PAID') => emitBookingChange({ code: b.code, status: b.status, hotelId: b.hotelId, updatedAt: new Date(), isNew: false, kind });

// ---------- Tạo / lấy link thanh toán ----------

export interface PayLink { payUrl: string; expiresAt?: Date }

/**
 * Trả link thanh toán SePay còn dùng được cho đơn PENDING_PAYMENT; chưa có thì tạo link mới.
 * Mỗi lần tạo mới là một bản ghi payments với orderId mới (cổng không cho dùng lại mã giao dịch).
 * Lỗi tạo link -> AppError 502, đơn vẫn giữ chỗ, khách thử lại qua POST /api/v1/payments/link.
 */
export async function ensurePaymentLink(bookingId: string): Promise<PayLink> {
  const b = (await db.query('SELECT * FROM bookings WHERE id = $1', [bookingId])).rows[0];
  const booking = b && bookingFromRow(b);
  if (!booking || booking.status !== 'PENDING_PAYMENT' || booking.payment.method === 'AT_HOTEL') {
    throw new AppError(409, 'PAYMENT_NOT_AVAILABLE', 'Đơn không ở trạng thái chờ thanh toán trực tuyến');
  }
  if (!booking.expiresAt || booking.expiresAt <= new Date()) throw new AppError(409, 'BOOKING_EXPIRED', 'Đơn đã hết thời gian giữ chỗ');

  const open = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE booking_id = $1 AND status IN ('INITIATED','PENDING') ORDER BY created_at DESC", [bookingId])).rows;
  const usable = open.find((p) => p.gateway.payUrl);
  if (usable?.gateway.payUrl) return { payUrl: usable.gateway.payUrl, expiresAt: booking.expiresAt };

  const now = new Date();
  // Lần tạo trước lỗi giữa chừng (chưa có link): đánh dấu FAILED; nếu VNPay thực ra đã nhận, IPN muộn vẫn xử lý được theo orderId.
  const dead = open.filter((p) => !p.gateway.payUrl).map((p) => p.id);
  if (dead.length) await db.query("UPDATE payments SET status = 'FAILED', updated_at = $2 WHERE id = ANY($1::uuid[]) AND status = 'INITIATED'", [dead, now]);

  const method = booking.payment.method;
  const { orderId, requestId } = newSepayOrder(booking.code);
  const id = randomUUID();
  const gateway = { orderId, requestId };
  const ins = await db.query<PaymentDoc>(
    `INSERT INTO payments (id, booking_id, hotel_id, method, amount_vnd, status, txn_ref, gateway, created_at, updated_at)
     VALUES ($1,$2,$3,$8,$4,'INITIATED',$5,$6::jsonb,$7,$7) RETURNING *`,
    [id, bookingId, booking.hotelId, booking.pricing.totalVnd, orderId, json(gateway), now, method],
  );
  return startPayment(ins.rows[0]!, booking.code);
}

// Ngay sau khi tạo đơn VNPay: lấy bản ghi payments INITIATED do createBooking tạo rồi tạo URL thanh toán.
export async function startBookingPayment(bookingId: string, code: string): Promise<PayLink> {
  const p = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE booking_id = $1 AND status = 'INITIATED' ORDER BY created_at DESC LIMIT 1", [bookingId])).rows[0];
  if (!p) throw new AppError(409, 'PAYMENT_NOT_AVAILABLE', 'Đơn không có giao dịch chờ khởi tạo');
  return startPayment(p, code);
}

// Tạo link SePay cho bản ghi payments INITIATED. Không gọi mạng: link = trang /api/v1/payments/sepay/checkout/:id (live) tự gửi form có chữ ký sang SePay; mock = về thẳng trang kết quả giả lập.
const startPayment = (p: PaymentDoc, _code: string) => startSepayPayment(p);

async function startSepayPayment(payment: PaymentDoc): Promise<PayLink> {
  const b = (await db.query<{ expiresAt?: Date }>('SELECT expires_at FROM bookings WHERE id = $1', [payment.bookingId])).rows[0];
  const payUrl = sepayPayUrl(payment.id, payment.gateway.orderId);
  await db.query("UPDATE payments SET status = 'PENDING', gateway = gateway || $2::jsonb, updated_at = now() WHERE id = $1 AND status = 'INITIATED'", [payment.id, json({ payUrl })]);
  return { payUrl, expiresAt: b?.expiresAt };
}

/**
 * Dựng form checkout SePay cho một giao dịch còn chờ (INITIATED/PENDING) của đơn chưa hết hạn giữ chỗ. paymentId là UUID khó đoán; trang không chứa khóa bí mật, chỉ có chữ ký.
 * Trả null nếu không dùng được (router trả 404).
 */
export async function sepayCheckoutFor(paymentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
  const p = (await db.query<PaymentDoc & { code: string; expiresAt?: Date; bookingStatus: string }>(
    "SELECT p.*, b.code, b.expires_at AS expires_at, b.status AS booking_status FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.id = $1 AND p.method = 'SEPAY' AND p.status IN ('INITIATED','PENDING')",
    [paymentId],
  )).rows[0];
  if (!p || p.bookingStatus !== 'PENDING_PAYMENT' || !p.expiresAt || p.expiresAt <= new Date()) return null;
  // SePay đòi order_invoice_number không trùng: mỗi lần mở trang (khách quay lại, bấm lại) dùng mã MỚI. Mã cũ giữ trong gateway.invoices để IPN muộn vẫn khớp được.
  const invoice = newSepayOrder(p.code).orderId;
  const seen = [...new Set([...(p.gateway.invoices ?? []), p.gateway.orderId])];
  await db.query("UPDATE payments SET txn_ref = $2, gateway = gateway || $3::jsonb, updated_at = now() WHERE id = $1 AND status IN ('INITIATED','PENDING')", [paymentId, invoice, json({ orderId: invoice, requestId: invoice, invoices: [...seen, invoice] })]);
  return checkoutPage(buildCheckoutFields({ invoice, amount: p.amountVnd, description: `Airrest ${p.code}` }));
}

// ---------- IPN ----------

type Outcome = 'OK' | 'DUPLICATE' | 'AMOUNT_MISMATCH';

/**
 * Phần xử lý kết quả dùng chung cho IPN mọi cổng: kiểm số tiền (BR-PAY-01) -> idempotent (SUCCEEDED là cuối) -> FAILED hoặc settleSuccess.
 * `amountVnd` là số tiền cổng báo, đã quy về VND.
 */
async function applyGatewayResult(
  payment: PaymentDoc,
  r: { amountVnd: number; success: boolean; resultCode: number; message: string; transId: number },
  requestId?: string,
): Promise<Outcome> {
  const cb = { at: new Date(), resultCode: r.resultCode, signatureOk: true };
  if (r.amountVnd !== payment.amountVnd) {
    // BR-PAY-01: lệch tiền -> không xác nhận, đưa vào hàng đợi kế toán xử lý.
    await db.query("UPDATE payments SET anomaly = $2::jsonb, callbacks = callbacks || $3::jsonb, updated_at = $4 WHERE id = $1 AND status <> 'SUCCEEDED'", [
      payment.id,
      json({ kind: 'AMOUNT_MISMATCH', at: cb.at }),
      json([cb]),
      cb.at,
    ]);
    return 'AMOUNT_MISMATCH';
  }
  if (payment.status === 'SUCCEEDED') return 'DUPLICATE';
  if (!r.success) {
    await db.query(
      "UPDATE payments SET status = 'FAILED', gateway = gateway || $2::jsonb, callbacks = callbacks || $3::jsonb, updated_at = $4 WHERE id = $1 AND status IN ('INITIATED','PENDING')",
      [payment.id, json({ resultCode: r.resultCode, message: r.message }), json([cb]), cb.at],
    );
    return 'OK';
  }
  await settleSuccess(payment.id, r.transId, cb, requestId);
  return 'OK';
}

/**
 * IPN SePay (POST JSON, header X-Secret-Key). Trả { status, body }: 401 sai/thiếu khóa; 200 đã tiếp nhận (kể cả lặp, lệch tiền đã ghi anomaly, không thấy đơn, loại thông báo khác)
 * để SePay không gọi lại vô ích. Chỉ ORDER_PAID + CAPTURED/APPROVED mới xác nhận thanh toán; số tiền phải khớp (BR-PAY-01).
 */
export async function handleSepayIpn(secretHeader: string | undefined, body: Record<string, any>, requestId?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!sepayIpnAuthorized(secretHeader)) {
    logger.warn({ hasHeader: !!secretHeader }, 'IPN SePay bị từ chối: thiếu/sai X-Secret-Key (kiểm tra Auth Type = Secret Key và SEPAY_IPN_SECRET)');
    return { status: 401, body: { error: 'Unauthorized' } };
  }
  logger.info({ type: body?.notification_type, invoice: body?.order?.order_invoice_number, orderStatus: body?.order?.order_status, txnStatus: body?.transaction?.transaction_status }, 'IPN SePay nhận');
  const ok = { status: 200, body: { success: true } };
  const invoice = String(body?.order?.order_invoice_number ?? '');
  // Khớp mã hiện tại (txn_ref) hoặc một mã cũ của cùng giao dịch (khách có thể thanh toán ở phiên mở trước).
  const payment = invoice ? (await db.query<PaymentDoc>("SELECT * FROM payments WHERE method = 'SEPAY' AND (txn_ref = $1 OR gateway->'invoices' @> to_jsonb($1::text)) LIMIT 1", [invoice])).rows[0] : undefined;
  if (!payment) {
    logger.warn({ invoice, type: body?.notification_type }, 'IPN SePay cho mã đơn không tồn tại, bỏ qua');
    return ok;
  }
  if (body.notification_type !== 'ORDER_PAID') {
    // TRANSACTION_VOID: giao dịch bị hủy bên SePay. Không tự đảo đơn đã xác nhận (cần đối soát tay); chỉ ghi vết để kế toán thấy.
    logger.warn({ invoice, type: body.notification_type, paymentId: payment.id }, 'IPN SePay loại không xử lý tự động');
    await db.query('UPDATE payments SET callbacks = callbacks || $2::jsonb, updated_at = now() WHERE id = $1', [payment.id, json([{ at: new Date(), type: String(body.notification_type), signatureOk: true }])]);
    return ok;
  }
  const amount = Number(body.order?.order_amount);
  const paid = body.order?.order_status !== 'CANCELLED'; // đã là ORDER_PAID (IPN xác thực); chỉ loại trường hợp đơn bị hủy, không đòi khớp từng giá trị trạng thái (QR chuyển khoản có thể khác thẻ)
  if (!Number.isFinite(amount)) return ok;
  const sepayTxn = String(body.transaction?.transaction_id ?? body.transaction?.id ?? '');
  if (sepayTxn) await db.query("UPDATE payments SET gateway = gateway || $2::jsonb WHERE id = $1 AND status <> 'SUCCEEDED'", [payment.id, json({ sepayTransactionId: sepayTxn })]);
  await applyGatewayResult(payment, { amountVnd: Math.round(amount), success: paid, resultCode: paid ? 0 : -1, message: String(body.transaction?.transaction_status ?? ''), transId: 0 }, requestId);
  return ok;
}

/**
 * Hỏi thẳng SePay (API tra cứu đơn) về các giao dịch đang chờ của đơn; có đơn CAPTURED thì xác nhận như IPN. Dùng khi khách mở lại đơn:
 * IPN có thể không tới (chạy trên máy, URL IPN sai, Auth Type chưa đúng). Idempotent với IPN (settleSuccess chỉ chạy một lần). Trả true nếu đơn vừa được xác nhận.
 */
export async function syncSepayPayment(bookingId: string): Promise<boolean> {
  const pays = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE booking_id = $1 AND method = 'SEPAY' AND status IN ('INITIATED','PENDING') ORDER BY created_at DESC", [bookingId])).rows;
  for (const p of pays) {
    for (const invoice of new Set([...(p.gateway.invoices ?? []), p.gateway.orderId])) {
      try {
        const o = await sepayApi.orderDetail(invoice);
        if (o?.status !== 'CAPTURED') continue;
        if (o.transactionId) await db.query("UPDATE payments SET gateway = gateway || $2::jsonb WHERE id = $1 AND status <> 'SUCCEEDED'", [p.id, json({ sepayTransactionId: o.transactionId, orderId: invoice })]);
        await applyGatewayResult(p, { amountVnd: o.amountVnd, success: true, resultCode: 0, message: 'CAPTURED', transId: 0 });
        return true;
      } catch (e) {
        logger.warn({ err: e, invoice }, 'Tra cứu đơn SePay lỗi, bỏ qua');
      }
    }
  }
  return false;
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
      const manual = p.method !== 'SEPAY' && !!hotel?.approval.manual; // SePay (đã thu tiền thật): xác nhận ngay, không chờ khách sạn duyệt tay
      const next = manual ? 'PENDING' : 'CONFIRMED';
      const holdUntil = new Date(now.getTime() + (await approvalHoldMs()));
      await tx.query(
        `UPDATE bookings SET status = $2, payment_status = 'PAID', paid_vnd = $3, updated_at = $4, expires_at = $5,
           status_history = status_history || $6::jsonb, v = v + 1 WHERE id = $1`,
        [b.id, next, amount, now, manual ? holdUntil : null, json([{ from: 'PENDING_PAYMENT', to: next, at: now, by: SYSTEM, reasonCode: `${p.method}_PAID` }])],
      );
      publishBookingStatus(b, next); // phát sau commit: khách thấy kết quả thanh toán ngay
      if (manual) await tx.query("UPDATE room_reservations SET hold_expires_at = $2, updated_at = $3 WHERE booking_id = $1 AND state = 'HOLD'", [b.id, holdUntil, now]);
      else await tx.query("UPDATE room_reservations SET state = 'CONFIRMED', hold_expires_at = NULL, updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [b.id, now]);
      const fee = b.pricing.serviceFeeVnd;
      await insertLedger(tx, b, { type: 'PAYMENT', id: p.id }, now, [['CUSTOMER_PAID', amount], ['HOTEL_PAYABLE', amount - fee], ['AIRREST_REVENUE', fee]]);
      await writeAudit({ actor: SYSTEM, action: 'PAYMENT.SUCCEEDED', entity: { type: 'payment', id: p.id }, hotelId: b.hotelId, bookingId: b.id, after: { amountVnd: amount, status: next }, requestId }, tx);
      return { refundId: null, booking: { code: b.code, status: next, hotelId: b.hotelId }, confirmedId: next === 'CONFIRMED' ? b.id : null };
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
      publishBookingStatus(b, 'EXPIRED');
      await cancelShuttlesForBooking(tx, b.id, SYSTEM, 'Thanh toán đến sau khi hết hạn giữ chỗ', requestId); // xe đặt cùng đơn không được mồ côi
    }
    // Trùng giao dịch: đơn đã PAID đúng số tiền, khoản thừa nằm ngoài đơn nên không đụng payment của đơn. Chỉ trường hợp muộn mới ghi thu rồi hoàn.
    if (!alreadyPaid) await tx.query("UPDATE bookings SET payment_status = 'PAID', paid_vnd = paid_vnd + $2, updated_at = $3 WHERE id = $1", [b.id, amount, now]);
    const refund = newRefund(b, p, kind === 'DUPLICATE' ? 'DUPLICATE_PAYMENT' : 'LATE_PAYMENT');
    await tx.query(
      `INSERT INTO refunds (id, booking_id, hotel_id, payment_id, key, amount_vnd, reason_code, method, status, gateway, due_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$10,'PENDING',$8::jsonb,$9,$9,$9)`,
      [refund.id, b.id, b.hotelId, p.id, refund.key, amount, refund.reasonCode, json(refund.gateway), now, p.method],
    );
    await insertLedger(tx, b, { type: 'PAYMENT', id: p.id }, now, [['CUSTOMER_PAID', amount], ['CUSTOMER_REFUNDABLE', amount]]);
    await writeAudit({ actor: SYSTEM, action: `PAYMENT.${kind}`, entity: { type: 'payment', id: p.id }, hotelId: b.hotelId, bookingId: b.id, after: { amountVnd: amount, refundId: refund.id }, requestId }, tx);
    return { refundId: refund.id, booking: { code: b.code, status, hotelId: b.hotelId }, confirmedId: null };
  });
  if (!out) return;
  notify(out.booking, out.refundId ? undefined : 'PAID');
  if (out.confirmedId) await dispatchDueForBooking(out.confirmedId); // đơn vừa xác nhận do thanh toán: điều xe cho yêu cầu đã tới hạn (không ném lỗi)
  if (out.refundId) await processRefund(out.refundId, requestId); // gọi VNPay ngoài transaction
}

function newRefund(b: BookingDoc, p: PaymentDoc, reasonCode: RefundDoc['reasonCode']) {
  const { orderId, requestId } = newSepayOrder(`RF${b.code}`);
  // Một giao dịch thu chỉ có tối đa một lệnh hoàn cùng lý do (UNIQUE key).
  return { id: randomUUID(), key: `${b.id}:${reasonCode}:${p.id}`, reasonCode, gateway: { orderId, requestId } };
}

// ---------- Hoàn tiền ----------

/** Ghi nhận lệnh hoàn đã xong: refunds -> REFUNDED, cập nhật đơn (hoàn muộn), sổ cái, audit. Dùng cho hoàn tự động (mock) và kế toán đánh dấu hoàn tay. */
async function completeRefund(r: RefundDoc, refundTransId: number | string | undefined, at: Date, requestId?: string, actor: Actor = SYSTEM, manual = false) {
  await withTransaction(async (tx) => {
    const done = await tx.query(
      `UPDATE refunds SET status = 'REFUNDED', gateway = gateway || $2::jsonb, attempts = attempts || $3::jsonb, completed_at = $4, updated_at = $4 WHERE id = $1 AND status <> 'REFUNDED'`,
      [r.id, json({ refundTransId, resultCode: 0, ...(manual && { manual: true }) }), json([{ at, ok: true, code: 0, ...(manual && { message: 'Kế toán đánh dấu đã hoàn thủ công' }) }]), at],
    );
    if (!done.rowCount) return; // đã REFUNDED: không ghi sổ cái lần hai
    if (r.reasonCode === 'LATE_PAYMENT') {
      await tx.query(
        `UPDATE bookings SET refunded_vnd = refunded_vnd + $2, updated_at = $3,
           payment_status = CASE WHEN refunded_vnd + $2 >= paid_vnd THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END WHERE id = $1`,
        [r.bookingId, r.amountVnd, at],
      );
    }
    // Hoàn riêng một chiều xe: tiền xe vốn nằm ở HOTEL_PAYABLE (khách sạn cung cấp xe) nên trừ ở đó, không qua CUSTOMER_REFUNDABLE.
    const from: LedgerAccount = r.reasonCode === 'SHUTTLE_CANCELLED' ? 'HOTEL_PAYABLE' : 'CUSTOMER_REFUNDABLE';
    await insertLedger(tx, { id: r.bookingId, hotelId: r.hotelId }, { type: 'REFUND', id: r.id }, at, [[from, -r.amountVnd], ['CUSTOMER_PAID', -r.amountVnd]]);
    await writeAudit({ actor, action: manual ? 'REFUND.MARKED_DONE' : 'REFUND.DONE', entity: { type: 'refund', id: r.id }, hotelId: r.hotelId, bookingId: r.bookingId, after: { amountVnd: r.amountVnd }, requestId }, tx);
  });
}

/**
 * Nhận lệnh PENDING -> gọi cổng hoàn (SePay: mock tự thành công; live không có API -> MANUAL_REQUIRED ngay) -> REFUNDED,
 * hoặc xếp lịch thử lại khi lỗi tạm thời, hết lượt thì MANUAL_REQUIRED (BA §5A.4).
 */
export async function processRefund(refundId: string, requestId?: string): Promise<RefundDoc | null> {
  const now = new Date();
  const r = (await db.query<RefundDoc>("UPDATE refunds SET status = 'PROCESSING', updated_at = $2 WHERE id = $1 AND status = 'PENDING' RETURNING *", [refundId, now])).rows[0];
  if (!r) return null; // đã có luồng khác nhận
  let res: { ok: boolean; code: string; message: string; transId?: number };
  try {
    res = await sepayRefund.refund({ requestId: r.gateway.requestId, orderId: r.gateway.orderId, amount: r.amountVnd });
  } catch (e) {
    // Lỗi mạng có thể đã hoàn thật: giữ NGUYÊN requestId khi thử lại.
    res = { ok: false, code: 'ERR', message: (e as Error).message };
  }
  const at = new Date();
  if (res.ok) {
    await completeRefund(r, res.transId, at, requestId);
  } else if (res.code === 'MANUAL') {
    // Cổng không hoàn được bằng API: chuyển thẳng cho kế toán (không đếm lượt thử); xong thì POST /api/v1/admin/refunds/:id/mark-refunded.
    await db.query("UPDATE refunds SET status = 'MANUAL_REQUIRED', attempts = attempts || $2::jsonb, updated_at = $3 WHERE id = $1", [r.id, json([{ at, ok: false, code: -1, message: res.message }]), at]);
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

/** Kế toán đã hoàn tiền ngoài hệ thống (chuyển khoản/SePay): đánh dấu lệnh MANUAL_REQUIRED là REFUNDED và ghi sổ cái. */
export async function markRefundDone(refundId: string, actor: Actor, requestId?: string): Promise<RefundDoc | null> {
  const r = (await db.query<RefundDoc>("SELECT * FROM refunds WHERE id = $1 AND status IN ('MANUAL_REQUIRED','PENDING')", [refundId])).rows[0];
  if (!r) throw new AppError(409, 'INVALID_STATE', 'Lệnh hoàn không tồn tại hoặc đã hoàn xong');
  await completeRefund(r, undefined, new Date(), requestId, actor, true);
  return (await db.query<RefundDoc>('SELECT * FROM refunds WHERE id = $1', [refundId])).rows[0] ?? null;
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

type QueryResult = { status: 'SUCCESS' | 'FAILED' | 'PENDING'; amount?: number; transId?: number; message?: string };
async function queryPayment(p: PaymentDoc): Promise<QueryResult> {
  for (const invoice of new Set([...(p.gateway.invoices ?? []), p.gateway.orderId])) {
    const o = await sepayApi.orderDetail(invoice);
    if (o?.status === 'CAPTURED') return { status: 'SUCCESS', amount: o.amountVnd, transId: 0 };
  }
  return { status: 'PENDING', message: 'SePay: chưa thấy giao dịch đã thanh toán' };
}

/** Một lượt: (1) truy vấn giao dịch treo >15 phút, (2) hết hạn đơn chờ thanh toán, (3) xử lý lệnh hoàn đến hạn. */
export async function reconcilePayments(actor: Actor, requestId?: string) {
  const now = new Date();
  const out = { queried: 0, settled: 0, failed: 0, expiredBookings: 0, refundsProcessed: 0 };

  const stale = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE status = 'PENDING' AND created_at < $1 ORDER BY created_at LIMIT 100", [new Date(now.getTime() - STALE_PENDING_MS)])).rows;
  for (const p of stale) {
    out.queried++;
    try {
      const q = await queryPayment(p);
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
      logger.error({ err: e, orderId: p.gateway.orderId, method: p.method }, 'Truy vấn cổng thanh toán lỗi, bỏ qua giao dịch này');
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

  out.expiredBookings += (await expireOverdueBookings(actor, requestId, now)).expired; // đơn chờ khách sạn xác nhận quá hạn

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
  publishBookingStatus({ id: bookingId, hotelId: b.hotelId }, 'EXPIRED');
  await tx.query("UPDATE room_reservations SET state = 'RELEASED', updated_at = $2 WHERE booking_id = $1 AND state = 'HOLD'", [bookingId, now]);
  await cancelShuttlesForBooking(tx, bookingId, actor, 'Đơn hết hạn chờ thanh toán', requestId); // xe đặt cùng đơn: hủy cùng transaction
  // Giao dịch chưa thanh toán -> EXPIRED. Nếu khách vẫn trả sau đó, settleSuccess hoàn 100%.
  await tx.query("UPDATE payments SET status = 'EXPIRED', updated_at = $2 WHERE booking_id = $1 AND status IN ('INITIATED','PENDING')", [bookingId, now]);
  await writeAudit({ actor, action: 'BOOKING.EXPIRE', entity: { type: 'booking', id: bookingId }, hotelId: b.hotelId, bookingId, before: { status: 'PENDING_PAYMENT' }, after: { status: 'EXPIRED' }, requestId }, tx);
  return { code: b.code, status: 'EXPIRED', hotelId: b.hotelId };
}
