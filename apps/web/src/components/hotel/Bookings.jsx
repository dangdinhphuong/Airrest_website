import React, { useCallback, useState } from 'react';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { money, vnDayEnd, vnDayStart } from '../../lib/time';
import { ApiError } from '@airrest/api-client';
import { describeError } from '../../lib/api';
import { ConfirmAction, DataTable, ErrorState, FilterBar, Loading, Modal, PageHeader, STATUS, StatusBadge } from '../ui';
import * as H from '../../data/hotel';
import { EventLog, LiveBadge } from './fleetKit';
import { useLiveData } from '../../lib/useRealtime';
import { fmtDT, useAction, useLoad, usePaged } from './kit';
import Select from '../Select';
import { lineLabel, stayLabel, stayShort } from '../../lib/bookingText';

const PAY_METHOD = { SEPAY: 'SePay', VNPAY: 'VNPay (cũ)', MOMO: 'MoMo (cũ)', AT_HOTEL: 'Thanh toán tại khách sạn' }; // VNPAY/MOMO chỉ để hiển thị đơn cũ
const PAY_STATUS = { NONE: 'Chưa phát sinh', UNPAID: 'Chưa thanh toán', PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', PARTIALLY_REFUNDED: 'Đã hoàn một phần', REFUNDED: 'Đã hoàn tiền', FAILED: 'Thanh toán lỗi', EXPIRED: 'Hết hạn thanh toán', CANCELLED: 'Đã hủy' };
export const pay = (p) => `${PAY_METHOD[p.method] || p.method || PAY_METHOD.AT_HOTEL} · ${PAY_STATUS[p.status] || p.status}`;
const DECISION = { CONFIRMED: 'Đã xác nhận', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
// Thanh quy trình của đơn: bước hiện tại + nhãn việc đang chờ. Đơn kết thúc bất thường (hủy/từ chối/hết hạn/không đến) chỉ hiện huy hiệu trạng thái.
const STEPS = ['Đặt phòng', 'Thanh toán', 'Duyệt', 'Nhận phòng', 'Trả phòng'];
const FLOW = {
  PENDING_PAYMENT: [1, 'Chờ khách thanh toán'], PENDING: [2, 'Chờ khách sạn duyệt'], CONFIRMED: [3, 'Chờ khách nhận phòng'],
  CHECKED_IN: [4, 'Khách đang ở, chờ trả phòng'], CHECKED_OUT: [5, 'Hoàn tất'],
};
export function ProcessSteps({ status }) {
  const f = FLOW[status];
  if (!f) return <StatusBadge status={status} />;
  const [cur, label] = f;
  return (
    <div data-testid="bk-steps" title={label}>
      <div style={{ display: 'flex', gap: 3, margin: '2px 0 4px' }} aria-hidden="true">
        {STEPS.map((n, i) => <span key={n} title={n} style={{ width: 22, height: 5, borderRadius: 3, background: i < cur ? '#16a34a' : i === cur ? '#f59e0b' : '#e2e8f0' }} />)}
      </div>
      <StatusBadge status={status} />
      <small className="muted" style={{ display: 'block' }} data-testid="bk-step-label">Bước {Math.min(cur + 1, STEPS.length)}/{STEPS.length}: {label}</small>
    </div>
  );
}
const ERR_VI = { NO_SHOW_NOT_DUE: 'Chưa tới ngày nhận phòng nên chưa thể đánh dấu "Không đến". Hãy thử lại từ ngày nhận phòng (giờ Việt Nam).', INVALID_STATE: 'Trạng thái đơn đã thay đổi, danh sách đã được làm mới. Vui lòng kiểm tra lại.' };

function Detail({ id }) {
  const d = useLoad(() => H.getBooking(id), [id]);
  const events = useCallback((cursor) => H.listBookingEvents(id, { cursor }), [id]);
  if (d.loading) return <Loading />;
  if (d.err) return <ErrorState onRetry={d.reload}>{describeError(d.err)}</ErrorState>;
  const { booking: b, decision } = d.data;
  return (
    <div className="card-inner" data-testid="booking-detail">
      <div>Khách: <strong>{b.guest.fullName}</strong> · {b.guest.phone}{b.guest.email ? ` · ${b.guest.email}` : ''}</div>
      <div data-testid="detail-guest-count">Số người: {b.guest.count ?? 1}{b.guest.children > 0 ? ` (${b.guest.children} trẻ em)` : ''}</div>
      <div data-testid="detail-stay">Lưu trú: {stayLabel(b.stay)}</div>
      <div data-testid="detail-lines">Phòng: {b.lines.map((l) => `${lineLabel(l)} (${money(l.unitPriceVnd)})`).join('; ')}</div>
      <div>Tiền phòng {money(b.pricing.roomVnd)} · Xe {money(b.pricing.shuttleVnd)} · Phí dịch vụ {money(b.pricing.serviceFeeVnd)} · Tổng {money(b.pricing.totalVnd)}</div>
      <div>Thanh toán: {pay(b.payment)} (đã thu {money(b.payment.paidVnd)}, đã hoàn {money(b.payment.refundedVnd)})</div>
      {decision && <div>Quyết định: {DECISION[decision.decision] || decision.decision}{decision.reason ? `, lý do: ${decision.reason}` : ''}</div>}
      <div className="muted">Lịch sử: {b.statusHistory.map((h) => `${STATUS[h.to]?.[0] || h.to} ${fmtDT(h.at)}`).join(' → ')}</div>
      <EventLog fetchPage={events} />
    </div>
  );
}

// /api/v1/hotel/bookings: lọc, phân trang keyset, chi tiết, xác nhận/từ chối/check-in.
export default function Bookings() {
  const { state } = useApp();
  const can = (p) => hasPerm(state.session, p);
  const [f, setF] = useState({ status: '', code: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [open, setOpen] = useState(null);
  const act = useAction();
  const list = usePaged((cursor) => H.listBookings({
    status: applied.status, code: applied.code, cursor,
    from: vnDayStart(applied.from), to: vnDayEnd(applied.to),
  }), [applied]);
  // Realtime: đơn mới/đổi trạng thái -> tự tải lại danh sách (socket; mất kết nối thì useLiveData tự thăm dò).
  const live = useLiveData(() => Promise.resolve(null), [], state.session?.id, { onEvent: (n) => { if (n === 'order:new' || n === 'order:updated') list.reload(); } });
  const go = async (fn, ok) => {
    if (await act.run(async () => { try { await fn(); } catch (e) { if (ERR_VI[e?.code]) { if (e.code === 'INVALID_STATE') list.reload(); throw new ApiError(e.status, e.code, ERR_VI[e.code]); } throw e; } }, ok)) list.reload();
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const reset = () => { const z = { status: '', code: '', from: '', to: '' }; setF(z); setApplied(z); };
  const columns = [
    { key: 'code', header: 'Mã', render: (b) => <strong>{b.code}</strong> },
    { key: 'guest', header: 'Khách', render: (b) => b.guest.fullName },
    { key: 'stay', header: 'Nhận phòng', render: (b) => stayShort(b.stay) },
    { key: 'lines', header: 'Phòng', render: (b) => b.lines.map((l) => `${l.roomTypeName} x${l.qty}${l.kind === 'HOURLY' ? ` (${l.hours} giờ)` : ''}`).join(', ') },
    { key: 'total', header: 'Tổng', render: (b) => money(b.pricing.totalVnd) },
    { key: 'pay', header: 'Thanh toán', render: (b) => pay(b.payment) },
    { key: 'status', header: 'Quy trình', render: (b) => <ProcessSteps status={b.status} /> },
    { key: 'act', header: '', render: (b) => (
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(b)} data-testid="bk-detail">Chi tiết</button>
        {b.status === 'PENDING' && can(PERM.BOOKING_DECIDE) && <>
          <ConfirmAction label="Xác nhận" ask="Xác nhận đơn này?" disabled={act.busy} testid="bk-confirm" onConfirm={() => go(() => H.confirmBooking(b.id), `Đã xác nhận đơn ${b.code}.`)} />
          <ConfirmAction label="Từ chối" title="Từ chối đơn" tone="danger" confirmLabel="Từ chối đơn" ask={`Từ chối đơn ${b.code}?`} reason={{ label: 'Lý do từ chối (bắt buộc)' }} testid="bk-reject" onConfirm={(r) => go(() => H.rejectBooking(b.id, r), `Đã từ chối đơn ${b.code}.`)} />
        </>}
        {b.status === 'CONFIRMED' && can(PERM.BOOKING_CHECKIN) && <ConfirmAction label="Check-in" ask="Khách đã đến nhận phòng?" disabled={act.busy} testid="bk-checkin" onConfirm={() => go(() => H.checkInBooking(b.id), `Đã check-in đơn ${b.code}.`)} />}
        {b.status === 'CONFIRMED' && can(PERM.BOOKING_CHECKIN) && <ConfirmAction label="Không đến (No-show)" tone="danger" ask="Khách không đến nhận phòng? Đơn sẽ chuyển sang Không đến." disabled={act.busy} testid="bk-noshow" onConfirm={() => go(() => H.noShowBooking(b.id), `Đã đánh dấu không đến đơn ${b.code}.`)} />}
        {b.status === 'CHECKED_IN' && can(PERM.BOOKING_CHECKIN) && <ConfirmAction label="Check-out" ask="Khách đã trả phòng?" disabled={act.busy} testid="bk-checkout" onConfirm={() => go(() => H.checkOutBooking(b.id), `Đã check-out đơn ${b.code}.`)} />}
      </div>
    ) },
  ];
  return (
    <>
      <PageHeader title="Đặt phòng" description="Đơn của khách sạn, mới nhất trước. Ngày lọc theo ngày nhận phòng. Danh sách tự cập nhật khi có đơn mới." actions={<LiveBadge conn={live.conn} />} />
      <FilterBar onApply={() => setApplied(f)} onReset={reset}>
        <Select aria-label="Trạng thái" value={f.status} onChange={set('status')} data-testid="bk-status">
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS).filter(([k]) => !['APPROVED', 'REQUESTED', 'ASSIGNED', 'DONE'].includes(k)).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}
        </Select>
        <input className="filter-input" aria-label="Mã đơn" placeholder="Mã đơn (tiền tố)" value={f.code} onChange={set('code')} data-testid="bk-code" />
        <label>Từ <input type="date" value={f.from} onChange={set('from')} /></label>
        <label>Đến <input type="date" value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
      </FilterBar>
      {act.note}
      <DataTable columns={columns} rows={list.items} rowTestid="bk-row" loading={list.loading} error={list.err && describeError(list.err)} onRetry={list.reload}
        empty="Chưa có đơn nào khớp bộ lọc." hasMore={list.next != null} onLoadMore={list.loadMore} loadingMore={list.more} />
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Đơn ${open.code}` : ''} size="lg">
        {open && <Detail key={`${open.id}-${open.status}`} id={open.id} />}
      </Modal>
    </>
  );
}
