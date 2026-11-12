import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Pill } from '../partner/ui';
import { money } from '../../lib/time';
import { BOOKING_LABEL } from './Dashboard';
import { Back, Filters, LoadView, PagedView, Table, dt, useLoad, usePaged } from './kit';

const TONE = { CONFIRMED: 'ok', CHECKED_IN: 'ok', CHECKED_OUT: 'neutral', PENDING: 'warn', PENDING_PAYMENT: 'warn', CANCELLED: 'error', REJECTED: 'error', EXPIRED: 'neutral', NO_SHOW: 'error' };
const St = ({ s }) => <Pill tone={TONE[s] || 'neutral'}>{BOOKING_LABEL[s] || s}</Pill>;
const Row = ({ l, children }) => <div><dt>{l}</dt><dd>{children}</dd></div>;

function Detail({ id, onBack }) {
  const r = useLoad(`/bookings/${id}`);
  return (
    <>
      <Back onClick={onBack} />
      <LoadView r={r}>{({ booking: b }) => (
        <div data-testid="booking-detail">
          <h2>{b.code} <St s={b.status} /></h2>
          <dl className="breakdown">
            <Row l="Khách sạn">{b.hotelSnapshot?.name} <small>{b.hotelId}</small></Row>
            <Row l="Khách">{b.guest?.fullName} · {b.guest?.phone}{b.guest?.email ? ` · ${b.guest.email}` : ''}</Row>
            <Row l="Lưu trú">{dt(b.stay?.from)} → {dt(b.stay?.to)} ({b.stay?.nights} đêm)</Row>
            <Row l="Phòng">{(b.lines || []).map((x) => `${x.roomTypeName} × ${x.qty} (${money(x.subtotalVnd)})`).join('; ')}</Row>
            <Row l="Tiền phòng">{money(b.pricing?.roomVnd ?? 0)}</Row>
            <Row l="Xe đưa đón">{money(b.pricing?.shuttleVnd ?? 0)}</Row>
            <Row l="Phí dịch vụ">{money(b.pricing?.serviceFeeVnd ?? 0)}</Row>
            <Row l="Tổng cộng">{money(b.pricing?.totalVnd ?? 0)}</Row>
            <Row l="Thanh toán">{b.payment ? `${b.payment.method} · ${b.payment.status} · đã trả ${money(b.payment.paidVnd)} · đã hoàn ${money(b.payment.refundedVnd)}` : '—'}</Row>
            <Row l="Tạo lúc">{dt(b.createdAt)}</Row>
          </dl>
          <h3>Lịch sử trạng thái</h3>
          <Table rowKey={(h) => `${h.at}${h.to}`} rows={b.statusHistory || []} cols={[['Lúc', (h) => dt(h.at)], ['Từ', (h) => h.from ? BOOKING_LABEL[h.from] : '—'], ['Sang', (h) => BOOKING_LABEL[h.to] || h.to], ['Bởi', (h) => h.by?.type + (h.by?.id ? ` ${h.by.id.slice(0, 8)}` : '')], ['Lý do', (h) => h.reasonCode || h.reason || '—']]} />
        </div>
      )}</LoadView>
    </>
  );
}

export default function Bookings() {
  const [q, setQ] = useState({});
  const [sel, setSel] = useState(null);
  const p = usePaged('/bookings', q);
  if (sel) return <><ScreenTitle title="Đơn đặt phòng" /><Detail id={sel} onBack={() => setSel(null)} /></>;
  return (
    <>
      <ScreenTitle title="Đơn đặt phòng" kicker="Mọi khách sạn, chỉ đọc" />
      <Filters fields={[['status', 'Trạng thái', 'text', Object.entries(BOOKING_LABEL)], ['code', 'Mã đơn (tiền tố)'], ['hotelId', 'Mã khách sạn (UUID)'], ['from', 'Nhận phòng từ', 'date'], ['to', 'Đến', 'date']]} onApply={setQ} />
      <PagedView p={p} empty="Không có đơn nào khớp bộ lọc.">
        <Table rows={p.items} cols={[['Mã', (b) => <button type="button" className="link-btn" onClick={() => setSel(b.id)} data-testid="open-booking">{b.code}</button>], ['Trạng thái', (b) => <St s={b.status} />], ['Khách sạn', (b) => b.hotelSnapshot?.name], ['Khách', (b) => b.guest?.fullName], ['Nhận phòng', (b) => dt(b.stay?.from)], ['Tổng', (b) => money(b.pricing?.totalVnd ?? 0)], ['Thanh toán', (b) => b.payment?.status || '—']]} />
      </PagedView>
    </>
  );
}
