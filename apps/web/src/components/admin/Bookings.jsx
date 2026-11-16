import React, { useCallback, useState } from 'react';
import { DataTable, PageHeader, StatusBadge } from '../ui';
import { money } from '../../lib/time';
import { BOOKING_LABEL } from './Dashboard';
import { EventLog } from '../hotel/fleetKit';
import { adminApi } from '../../data/admin';
import { lineLabel, stayLabel } from '../../lib/bookingText';
import { Filters, LoadView, cols, dt, pagedProps, useLoad, usePaged } from './kit';

const TONE = { CONFIRMED: 'ok', CHECKED_IN: 'ok', CHECKED_OUT: 'neutral', PENDING: 'warn', PENDING_PAYMENT: 'warn', CANCELLED: 'error', REJECTED: 'error', EXPIRED: 'neutral', NO_SHOW: 'error' };
const MAP = Object.fromEntries(Object.entries(BOOKING_LABEL).map(([k, t]) => [k, [t, TONE[k] || 'neutral']]));
const St = ({ s }) => <StatusBadge status={s} map={MAP} />;
const Row = ({ l, children }) => <div><dt>{l}</dt><dd>{children}</dd></div>;

function Detail({ id, onBack }) {
  const r = useLoad(`/bookings/${id}`);
  const events = useCallback((cursor) => adminApi.get(`/bookings/${id}/events`, { cursor }), [id]);
  return (
    <>
      <LoadView r={r} head={<PageHeader title="Đơn đặt phòng" back={{ onClick: onBack }} />}>{({ booking: b }) => (
        <div data-testid="booking-detail">
          <PageHeader title={`Đơn ${b.code}`} description={<St s={b.status} />} back={{ onClick: onBack }} />
          <dl className="breakdown">
            <Row l="Khách sạn">{b.hotelSnapshot?.name} <small>{b.hotelId}</small></Row>
            <Row l="Khách">{b.guest?.fullName} · {b.guest?.phone}{b.guest?.email ? ` · ${b.guest.email}` : ''}</Row>
            <Row l="Số người"><span data-testid="detail-guest-count">{b.guest?.count ?? 1}{b.guest?.children > 0 ? ` (${b.guest.children} trẻ em)` : ''}</span></Row>
            <Row l="Lưu trú">{b.stay ? stayLabel(b.stay) : '—'}</Row>
            <Row l="Phòng">{(b.lines || []).map((x) => `${lineLabel(x)} (${money(x.subtotalVnd)})`).join('; ')}</Row>
            <Row l="Tiền phòng">{money(b.pricing?.roomVnd ?? 0)}</Row>
            <Row l="Xe đưa đón">{money(b.pricing?.shuttleVnd ?? 0)}</Row>
            <Row l="Phí dịch vụ">{money(b.pricing?.serviceFeeVnd ?? 0)}</Row>
            <Row l="Tổng cộng">{money(b.pricing?.totalVnd ?? 0)}</Row>
            <Row l="Thanh toán">{b.payment ? `${b.payment.method} · ${b.payment.status} · đã trả ${money(b.payment.paidVnd)} · đã hoàn ${money(b.payment.refundedVnd)}` : '—'}</Row>
            <Row l="Tạo lúc">{dt(b.createdAt)}</Row>
          </dl>
          <EventLog fetchPage={events} />
          <h3>Lịch sử trạng thái</h3>
          <DataTable rowKey={(h) => `${h.at}${h.to}`} rows={b.statusHistory || []} empty="Chưa có lịch sử." columns={cols([['Lúc', (h) => dt(h.at)], ['Từ', (h) => h.from ? BOOKING_LABEL[h.from] : '—'], ['Sang', (h) => BOOKING_LABEL[h.to] || h.to], ['Bởi', (h) => h.by?.type + (h.by?.id ? ` ${h.by.id.slice(0, 8)}` : '')], ['Lý do', (h) => h.reasonCode || h.reason || '—']])} />
        </div>
      )}</LoadView>
    </>
  );
}

export default function Bookings() {
  const [q, setQ] = useState({});
  const [sel, setSel] = useState(null);
  const p = usePaged('/bookings', q);
  if (sel) return <Detail id={sel} onBack={() => setSel(null)} />;
  return (
    <>
      <PageHeader title="Đơn đặt phòng" description="Mọi khách sạn, chỉ đọc" />
      <Filters fields={[['status', 'Trạng thái', 'text', Object.entries(BOOKING_LABEL)], ['code', 'Mã đơn (tiền tố)'], ['hotelId', 'Mã khách sạn (UUID)'], ['from', 'Nhận phòng từ', 'date'], ['to', 'Đến', 'date']]} onApply={setQ} />
      <DataTable empty="Không có đơn nào khớp bộ lọc." {...pagedProps(p)}
        columns={cols([['Mã', (b) => <button type="button" className="link-btn" onClick={() => setSel(b.id)} data-testid="open-booking">{b.code}</button>], ['Trạng thái', (b) => <St s={b.status} />], ['Khách sạn', (b) => b.hotelSnapshot?.name], ['Khách', (b) => b.guest?.fullName], ['Nhận phòng', (b) => dt(b.stay?.from)], ['Tổng', (b) => money(b.pricing?.totalVnd ?? 0)], ['Thanh toán', (b) => b.payment?.status || '—']])} />
    </>
  );
}
