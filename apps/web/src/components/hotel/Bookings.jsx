import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { money } from '../../lib/time';
import { ApiError } from '@airrest/api-client';
import { describeError } from '../../lib/api';
import { ErrorBox, Loading } from '../Common';
import { ReasonAction } from '../partner/ui';
import * as H from '../../data/hotel';
import { ConfirmButton, ListState, STATUS, StatusPill, fmtD, fmtDT, needReason, today, useAction, useLoad, usePaged } from './kit';

const PAY_METHOD = { VNPAY: 'VNPay', AT_HOTEL: 'Thanh toán tại khách sạn' };
const PAY_STATUS = { NONE: 'Chưa phát sinh', UNPAID: 'Chưa thanh toán', PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', PARTIALLY_REFUNDED: 'Đã hoàn một phần', REFUNDED: 'Đã hoàn tiền', FAILED: 'Thanh toán lỗi', EXPIRED: 'Hết hạn thanh toán', CANCELLED: 'Đã hủy' };
const pay = (p) => `${PAY_METHOD[p.method] || (p.method === 'VNPAY' ? 'VNPay' : 'Thanh toán tại khách sạn')} · ${PAY_STATUS[p.status] || p.status}`;
const DECISION = { CONFIRMED: 'Đã xác nhận', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
const ERR_VI = { NO_SHOW_NOT_DUE: 'Chưa tới ngày nhận phòng nên chưa thể đánh dấu "Không đến". Hãy thử lại từ ngày nhận phòng (giờ Việt Nam).', INVALID_STATE: 'Trạng thái đơn đã thay đổi, danh sách đã được làm mới. Vui lòng kiểm tra lại.' };

function Detail({ id }) {
  const d = useLoad(() => H.getBooking(id), [id]);
  if (d.loading) return <Loading />;
  if (d.err) return <ErrorBox onRetry={d.reload}>{describeError(d.err)}</ErrorBox>;
  const { booking: b, decision } = d.data;
  return (
    <div className="card-inner" data-testid="booking-detail">
      <div>Khách: <strong>{b.guest.fullName}</strong> · {b.guest.phone}{b.guest.email ? ` · ${b.guest.email}` : ''}</div>
      <div>Lưu trú: {fmtDT(b.stay.from)} đến {fmtDT(b.stay.to)} ({b.stay.nights} đêm)</div>
      <div>Phòng: {b.lines.map((l) => `${l.roomTypeName} x${l.qty} (${money(l.unitPriceVnd)})`).join(', ')}</div>
      <div>Tiền phòng {money(b.pricing.roomVnd)} · Xe {money(b.pricing.shuttleVnd)} · Phí dịch vụ {money(b.pricing.serviceFeeVnd)} · Tổng {money(b.pricing.totalVnd)}</div>
      <div>Thanh toán: {pay(b.payment)} (đã thu {money(b.payment.paidVnd)}, đã hoàn {money(b.payment.refundedVnd)})</div>
      {decision && <div>Quyết định: {DECISION[decision.decision] || decision.decision}{decision.reason ? `, lý do: ${decision.reason}` : ''}</div>}
      <div className="muted">Lịch sử: {b.statusHistory.map((h) => `${STATUS[h.to]?.[0] || h.to} ${fmtDT(h.at)}`).join(' → ')}</div>
    </div>
  );
}

// /v1/hotel/bookings: lọc, phân trang keyset, chi tiết, xác nhận/từ chối/check-in.
export default function Bookings() {
  const { state } = useApp();
  const can = (p) => hasPerm(state.session, p);
  const [f, setF] = useState({ status: '', code: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [open, setOpen] = useState(null);
  const act = useAction();
  const list = usePaged((cursor) => H.listBookings({
    status: applied.status, code: applied.code, cursor,
    from: applied.from && new Date(`${applied.from}T00:00:00`), to: applied.to && new Date(new Date(`${applied.to}T00:00:00`).getTime() + 86400000),
  }), [applied]);
  const go = async (fn, ok) => {
    if (await act.run(async () => { try { await fn(); } catch (e) { if (ERR_VI[e?.code]) { if (e.code === 'INVALID_STATE') list.reload(); throw new ApiError(e.status, e.code, ERR_VI[e.code]); } throw e; } }, ok)) list.reload();
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <ScreenTitle title="Đặt phòng">Đơn của khách sạn, mới nhất trước. Ngày lọc theo ngày nhận phòng.</ScreenTitle>
      <form className="filter-bar" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <select aria-label="Trạng thái" value={f.status} onChange={set('status')} data-testid="bk-status">
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS).filter(([k]) => !['APPROVED', 'REQUESTED', 'ASSIGNED', 'DONE'].includes(k)).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <input className="filter-input" aria-label="Mã đơn" placeholder="Mã đơn (tiền tố)" value={f.code} onChange={set('code')} data-testid="bk-code" />
        <label>Từ <input type="date" value={f.from} onChange={set('from')} /></label>
        <label>Đến <input type="date" value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
        <button className="btn btn-sm btn-primary" type="submit" data-testid="bk-search">Lọc</button>
      </form>
      {act.note}
      <ListState list={list} empty="Chưa có đơn nào khớp bộ lọc.">
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Mã</th><th>Khách</th><th>Nhận phòng</th><th>Phòng</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{list.items.map((b) => (
            <React.Fragment key={b.id}>
              <tr data-testid="bk-row">
                <td data-label="Mã"><strong>{b.code}</strong></td>
                <td data-label="Khách">{b.guest.fullName}</td>
                <td data-label="Nhận phòng">{fmtD(b.stay.from)} ({b.stay.nights} đêm)</td>
                <td data-label="Phòng">{b.lines.map((l) => `${l.roomTypeName} x${l.qty}`).join(', ')}</td>
                <td data-label="Tổng">{money(b.pricing.totalVnd)}</td>
                <td data-label="Thanh toán">{pay(b.payment)}</td>
                <td data-label="Trạng thái"><StatusPill s={b.status} /></td>
                <td>
                  <div className="row-actions" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-sm" onClick={() => setOpen(open === b.id ? null : b.id)} data-testid="bk-detail">{open === b.id ? 'Ẩn' : 'Chi tiết'}</button>
                    {b.status === 'PENDING' && can(PERM.BOOKING_DECIDE) && <>
                      <ConfirmButton label="Xác nhận" ask="Xác nhận đơn này?" disabled={act.busy} testid="bk-confirm" onConfirm={() => go(() => H.confirmBooking(b.id), `Đã xác nhận đơn ${b.code}.`)} />
                      <ReasonAction label="Từ chối" tone="danger" confirmLabel="Từ chối đơn" placeholder="Lý do từ chối (bắt buộc)" testid="bk-reject" onSubmit={needReason((r) => go(() => H.rejectBooking(b.id, r), `Đã từ chối đơn ${b.code}.`))} />
                    </>}
                    {b.status === 'CONFIRMED' && can(PERM.BOOKING_CHECKIN) && <ConfirmButton label="Check-in" ask="Khách đã đến nhận phòng?" disabled={act.busy} testid="bk-checkin" onConfirm={() => go(() => H.checkInBooking(b.id), `Đã check-in đơn ${b.code}.`)} />}
                    {b.status === 'CONFIRMED' && can(PERM.BOOKING_CHECKIN) && <ConfirmButton label="Không đến (No-show)" tone="danger" ask="Khách không đến nhận phòng? Đơn sẽ chuyển sang Không đến." disabled={act.busy} testid="bk-noshow" onConfirm={() => go(() => H.noShowBooking(b.id), `Đã đánh dấu không đến đơn ${b.code}.`)} />}
                    {b.status === 'CHECKED_IN' && can(PERM.BOOKING_CHECKIN) && <ConfirmButton label="Check-out" ask="Khách đã trả phòng?" disabled={act.busy} testid="bk-checkout" onConfirm={() => go(() => H.checkOutBooking(b.id), `Đã check-out đơn ${b.code}.`)} />}
                  </div>
                </td>
              </tr>
              {open === b.id && <tr><td colSpan={8}><Detail key={`${b.id}-${b.status}`} id={b.id} /></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div>
      </ListState>
    </>
  );
}
