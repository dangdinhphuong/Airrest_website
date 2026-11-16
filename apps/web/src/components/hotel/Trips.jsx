import React, { Suspense, lazy, useState } from 'react';
import { ConfirmAction, EmptyState, ErrorState, Loading, PageHeader } from '../ui';
import { useApp } from '../../state/store';
import { describeError } from '../../lib/api';
import { useLiveData } from '../../lib/useRealtime';
import * as H from '../../data/hotel';
import { fmtDT, useAction } from './kit';
import { DIRECTION, LiveBadge, TripPill, vi } from './fleetKit';

const TripMap = lazy(() => import('./TripMap'));
// Bước kế tiếp theo trạng thái: [bước API, nhãn nút, câu hỏi xác nhận, thông báo].
const NEXT = {
  ACCEPTED: ['start', 'Bắt đầu đón', 'Bắt đầu đi đón khách?', 'Đã bắt đầu đi đón.'],
  EN_ROUTE: ['arrived', 'Đã tới điểm đón', 'Bạn đã tới điểm đón?', 'Đã báo tới điểm đón.'],
  ARRIVED: ['onboard', 'Đã đón khách', 'Khách đã lên xe?', 'Đã ghi nhận khách lên xe.'],
  ONBOARD: ['dropped-off', 'Đã trả khách', 'Đã trả khách tới nơi? Chuyến sẽ kết thúc.', 'Đã hoàn tất chuyến.'],
};

function TripCard({ t, act, go, pos }) {
  const [map, setMap] = useState(!!t.route);
  const next = NEXT[t.status];
  const p = pos || t.position;
  return (
    <article className="trip-card" data-testid="trip-card" data-status={t.status}>
      <header><strong>{t.bookingCode}</strong> <TripPill s={t.status} /></header>
      <dl className="trip-info">
        <div><dt>Khách</dt><dd>{t.guest.fullName} · <a href={`tel:${t.guest.phone}`} data-testid="guest-tel">{t.guest.phone}</a></dd></div>
        <div><dt>Giờ đón</dt><dd>{fmtDT(t.request.pickupAt)} ({DIRECTION[t.request.direction] || t.request.direction})</dd></div>
        <div><dt>Điểm đón</dt><dd>{t.pickup}</dd></div>
        <div><dt>Điểm đến</dt><dd>{t.dropoff}</dd></div>
        <div><dt>Số khách trên xe</dt><dd>{t.seats}{t.seats !== t.request.passengers ? ` (cả đoàn ${t.request.passengers} khách)` : ''}</dd></div>
        <div><dt>Xe</dt><dd>{t.vehicle.plate}{t.vehicle.model ? ` · ${t.vehicle.model}` : ''}</dd></div>
        {t.request.note && <div><dt>Ghi chú</dt><dd>{t.request.note}</dd></div>}
      </dl>
      {(t.route || p) && <>
        <button type="button" className="btn btn-sm" onClick={() => setMap(!map)} data-testid="map-toggle">{map ? 'Ẩn bản đồ' : 'Xem bản đồ'}</button>
        {p?.etaSec != null && <small className="muted"> Dự kiến còn {Math.max(0, Math.round(p.etaSec / 60))} phút</small>}
        {map && <Suspense fallback={<Loading />}><TripMap route={t.route} position={p} height={240} /></Suspense>}
      </>}
      <div className="trip-actions">
        {t.status === 'OFFERED' && <>
          <button type="button" className="btn btn-primary" disabled={act.busy} onClick={() => go(vi(() => H.driverStep(t.id, 'accept')), 'Đã nhận chuyến.')} data-testid="trip-accept">Nhận chuyến</button>
          <ConfirmAction label="Từ chối" title="Từ chối chuyến" tone="danger" confirmLabel="Từ chối chuyến" className="btn" ask={`Từ chối chuyến ${t.bookingCode}?`} reason={{ label: 'Lý do (tùy chọn)', minLength: 0 }} testid="trip-reject" onConfirm={(r) => go(vi(() => H.driverStep(t.id, 'reject', r ? { reason: r } : {})), 'Đã từ chối chuyến.')} />
        </>}
        {t.status === 'ARRIVED' && <ConfirmAction label="Khách không có mặt" ask="Xác nhận khách không có mặt tại điểm đón? Chuyến sẽ đóng và không hoàn phí xe." disabled={act.busy} testid="trip-no-show" onConfirm={() => go(vi(() => H.driverNoShow(t.id)), 'Đã đóng chuyến: khách không có mặt.')} />}
        {next && <ConfirmAction label={next[1]} ask={next[2]} disabled={act.busy} testid={`trip-${next[0]}`} onConfirm={() => go(vi(() => H.driverStep(t.id, next[0])), next[3])} />}
      </div>
    </article>
  );
}

// Chuyến của tôi (trip:drive): /v1/driver/trips; máy chủ chỉ trả chuyến của chính tài xế.
export default function Trips() {
  const { state } = useApp();
  const act = useAction();
  const live = useLiveData(() => H.listDriverTrips(), [], state.session?.id);
  const go = async (fn, ok) => { const r = await act.run(fn, ok); live.refresh(); return r; };
  if (live.loading && !live.data) return <><PageHeader title="Chuyến của tôi" /><Loading /></>;
  if (live.err && !live.data) return <><PageHeader title="Chuyến của tôi" /><ErrorState onRetry={live.reload}>{describeError(live.err)}</ErrorState></>;
  const items = live.data.items;
  const waiting = items.filter((t) => t.status === 'OFFERED');
  const running = items.filter((t) => t.status !== 'OFFERED');
  const group = (title, list, id) => list.length > 0 && <section aria-label={title} data-testid={id}><h3>{title} ({list.length})</h3><div className="trip-grid">{list.map((t) => <TripCard key={t.id} t={t} act={act} go={go} pos={live.positions[t.id]} />)}</div></section>;
  return (
    <>
      <PageHeader title="Chuyến của tôi" description="Chuyến đưa đón được giao cho riêng bạn." actions={<LiveBadge conn={live.conn} />} />
      {act.note}
      {!items.length && <EmptyState title="Chưa có chuyến" testid="empty">Hiện chưa có chuyến nào được giao. Chuyến mới sẽ tự hiện ở đây.</EmptyState>}
      {group('Chờ bạn nhận', waiting, 'trips-waiting')}
      {group('Đang chạy', running, 'trips-running')}
    </>
  );
}
