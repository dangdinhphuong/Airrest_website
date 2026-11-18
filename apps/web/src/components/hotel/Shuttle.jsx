import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ConfirmAction, DataTable, EmptyState, ErrorState, FormField, Loading, PageHeader, StatusBadge, Tag } from '../ui';
import { useApp } from '../../state/store';
import { describeError } from '../../lib/api';
import { useLiveData } from '../../lib/useRealtime';
import * as H from '../../data/hotel';
import { fmtDT, useAction } from './kit';
import { DIRECTION, LiveBadge, PROVIDER, TripPill, VEHICLE_STATE, vi } from './fleetKit';
import Select from '../Select';

const TripMap = lazy(() => import('./TripMap'));
const MOVING = ['EN_ROUTE', 'ARRIVED', 'ONBOARD'];
const WAITING = ['OFFERED', 'ACCEPTED'];
const NEXT_EXT = { ACCEPTED: ['arrived', 'Xe ngoài đã tới', 'Xe ngoài đã tới điểm đón?'], EN_ROUTE: ['arrived', 'Xe ngoài đã tới', 'Xe ngoài đã tới điểm đón?'], ARRIVED: ['onboard', 'Khách đã lên xe', 'Khách đã lên xe?'], ONBOARD: ['dropped-off', 'Đã trả khách', 'Đã trả khách tới nơi?'] };
const mmss = (ms) => { const s = Math.abs(Math.floor(ms / 1000)); const h = Math.floor(s / 3600); return `${h ? `${h} giờ ` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} phút ${String(s % 60).padStart(2, '0')} giây`; };

function Countdown({ at, overdueMin }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const left = new Date(at).getTime() - now;
  const late = left <= 0;
  const urgent = late || left <= overdueMin * 60000;
  return <strong className={urgent ? 'cd cd-overdue' : 'cd'} data-testid="countdown" data-overdue={urgent ? '1' : '0'}>{late ? `Đã quá giờ đón ${mmss(left)}` : `Còn ${mmss(left)} tới giờ đón`}</strong>;
}

function ExternalForm({ trip, busy, onSubmit, onCancel }) {
  const x = trip.external || {};
  const [v, setV] = useState({ provider: x.provider || 'GRAB', shareUrl: x.shareUrl || '', driverName: x.driverName || '', plate: x.plate || '', phone: x.phone || '', etaAt: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErr(''); };
  const submit = async (e) => {
    e.preventDefault();
    if (!/^https:\/\//i.test(v.shareUrl.trim())) { setErr('Liên kết chia sẻ không hợp lệ hoặc không thuộc Grab/Xanh SM, chỉ nhận https.'); return; }
    const body = { provider: v.provider, shareUrl: v.shareUrl.trim() };
    for (const k of ['driverName', 'plate', 'phone']) if (v[k].trim()) body[k] = v[k].trim();
    if (v.etaAt) body.etaAt = new Date(v.etaAt).toISOString();
    if (await onSubmit(body)) onCancel();
  };
  const id = `ex-${trip.id}`;
  return (
    <form className="card ext-form" onSubmit={submit} data-testid="ext-form">
      <div className="grid-2">
        <FormField id={`${id}-p`} label="Hãng xe"><Select id={`${id}-p`} value={v.provider} onChange={set('provider')} data-testid="ext-provider">{Object.entries(PROVIDER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></FormField>
        <FormField id={`${id}-u`} label="Liên kết chia sẻ chuyến (https)" error={err}><input id={`${id}-u`} value={v.shareUrl} onChange={set('shareUrl')} required placeholder="https://" inputMode="url" data-testid="ext-url" /></FormField>
        <FormField id={`${id}-n`} label="Tên tài xế (tùy chọn)"><input id={`${id}-n`} value={v.driverName} onChange={set('driverName')} maxLength={100} data-testid="ext-driver" /></FormField>
        <FormField id={`${id}-b`} label="Biển số (tùy chọn)"><input id={`${id}-b`} value={v.plate} onChange={set('plate')} maxLength={20} data-testid="ext-plate" /></FormField>
        <FormField id={`${id}-t`} label="SĐT tài xế (tùy chọn)"><input id={`${id}-t`} value={v.phone} onChange={set('phone')} inputMode="tel" data-testid="ext-phone" /></FormField>
        <FormField id={`${id}-e`} label="Giờ đón dự kiến (tùy chọn)"><input id={`${id}-e`} type="datetime-local" value={v.etaAt} onChange={set('etaAt')} data-testid="ext-eta" /></FormField>
      </div>
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy} data-testid="ext-save">Lưu xe ngoài</button>
        <button className="btn btn-sm" type="button" onClick={onCancel}>Đóng</button>
      </div>
    </form>
  );
}

// Thông tin đủ để nhân viên tự đặt Grab/Xanh SM.
function ExternalCard({ r, t, cfg, act, go }) {
  const [open, setOpen] = useState(false);
  const pickup = r.direction === 'TO_HOTEL' ? `Sân bay ${r.airport}` : r.location || 'Khách sạn';
  const drop = r.direction === 'TO_HOTEL' ? r.location || 'Khách sạn' : `Sân bay ${r.airport}`;
  return (
    <div className={`ext-card ${t.overdue ? 'is-overdue' : ''}`} data-testid="ext-alert" role="alert">
      <div className="ext-head"><strong>Cần gọi xe ngoài · {r.bookingCode}</strong><Countdown at={t.deadlineAt} overdueMin={cfg.overdueMin} /></div>
      <dl className="ext-info">
        <div><dt>Điểm đón</dt><dd>{pickup}</dd></div><div><dt>Điểm đến</dt><dd>{drop}</dd></div>
        <div><dt>Giờ đón</dt><dd>{fmtDT(r.pickupAt)}</dd></div><div><dt>Số khách (chỗ cần)</dt><dd>{t.passengers ?? r.passengers} khách ({t.seats} chỗ)</dd></div>
        <div><dt>Khách</dt><dd>{r.guest.fullName} · <a href={`tel:${r.guest.phone}`}>{r.guest.phone}</a></dd></div>
        {r.note && <div><dt>Ghi chú</dt><dd>{r.note}</dd></div>}
      </dl>
      {open ? <ExternalForm trip={t} busy={act.busy} onCancel={() => setOpen(false)} onSubmit={(b) => go(vi(() => H.setExternal(t.id, b)), 'Đã nhập xe ngoài cho chuyến.')} />
        : <div className="row-actions" style={{ marginTop: 8 }}><button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(true)} data-testid="ext-open">Nhập xe ngoài đã đặt</button></div>}
    </div>
  );
}

// Chuyến xe NGOÀI (Grab/Xanh SM): không có app tài xế nên nhân viên cập nhật tiến trình; chuyến xe của khách sạn chỉ để xem.
function ExternalTrip({ t, act, go }) {
  const [form, setForm] = useState(false);
  const next = NEXT_EXT[t.status];
  return (
    <div className="trip-line" data-testid="trip-line">
      <div className="trip-head">
        <TripPill s={t.status} /> <span>{t.seats} chỗ</span>
        <span>{PROVIDER[t.external?.provider] || 'Xe ngoài'}{t.external?.simulated && ' (mô phỏng)'}{[t.external?.driverName, t.external?.plate, t.external?.phone].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
      </div>
      <div className="row-actions" style={{ marginTop: 6 }}>
        {next && <ConfirmAction label={next[1]} ask={next[2]} disabled={act.busy} testid={`ext-${next[0]}`} onConfirm={() => go(vi(() => H.staffStep(t.id, next[0])), 'Đã cập nhật chuyến.')} />}
        {t.status === 'ACCEPTED' && <button type="button" className="btn btn-sm" onClick={() => setForm(!form)} data-testid="ext-change">Đổi xe ngoài</button>}
      </div>
      {form && <ExternalForm trip={t} busy={act.busy} onCancel={() => setForm(false)} onSubmit={(b) => go(vi(() => H.setExternal(t.id, b)), 'Đã đổi thông tin xe ngoài.')} />}
    </div>
  );
}

// Trạng thái của xe suy ra từ các chuyến đang có trên bảng: đang chở / có đơn chờ / rảnh.
function vehicleStatus(v, trips) {
  if (v.state === 'INACTIVE' || v.state === 'NO_DRIVER') return { ...(VEHICLE_STATE[v.state] ? { label: VEHICLE_STATE[v.state][0], tone: VEHICLE_STATE[v.state][1] } : { label: v.state, tone: 'neutral' }) };
  if (trips.some((x) => MOVING.includes(x.t.status))) return { label: 'Đang chở đơn', tone: 'warn' };
  if (trips.some((x) => WAITING.includes(x.t.status))) return { label: 'Có đơn chờ đón', tone: 'info' };
  return { label: 'Rảnh, chưa có đơn', tone: 'ok' };
}

function VehicleCard({ v, trips, positions }) {
  const [map, setMap] = useState(null);
  const st = vehicleStatus(v, trips);
  return (
    <article className="card veh-card" data-testid="veh-card" style={{ padding: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
        <div><strong>{v.plate}</strong> · {v.seats} chỗ{v.model ? ` · ${v.model}` : ''}
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{v.driver ? `Tài xế: ${v.driver.name} · ${v.driver.phone}` : 'Chưa gán tài xế'}</div></div>
        <Tag tone={st.tone} data-testid="veh-state">{st.label}</Tag>
      </header>
      {trips.length === 0
        ? <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }} data-testid="veh-empty">Chưa có đơn nào.</p>
        : <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>{trips.map(({ t, r }) => {
            const pos = positions[t.id] || t.position;
            return (
              <li key={t.id} data-testid="veh-trip" style={{ borderTop: '1px solid var(--line, #e2e8f0)', paddingTop: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <strong>{r.bookingCode}</strong><TripPill s={t.status} />
                  <span className="muted" style={{ fontSize: 12 }}>{DIRECTION[r.direction] || r.direction} · {fmtDT(r.pickupAt)} · {t.passengers ?? r.passengers} khách ({r.guest.fullName})</span>
                </div>
                {(pos || t.route) && <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setMap(map === t.id ? null : t.id)} data-testid="map-toggle">{map === t.id ? 'Ẩn bản đồ' : 'Xem trên bản đồ'}</button>}
                {map === t.id && <Suspense fallback={<Loading />}><TripMap route={t.route} position={pos} /></Suspense>}
              </li>
            );
          })}</ul>}
    </article>
  );
}

// Theo dõi xe: hệ thống TỰ điều xe (còn <= dispatchLeadMin phút tới giờ đón); màn này chỉ xem xe nào đang chở đơn nào, xe nào rảnh, đơn nào chưa có xe.
function Board({ live }) {
  const act = useAction();
  const go = async (fn, ok) => { const r = await act.run(fn, ok); live.refresh(); return r; };
  if (live.loading && !live.data) return <Loading />;
  if (live.err && !live.data) return <ErrorState onRetry={live.reload}>{describeError(live.err)}</ErrorState>;
  const { requests, vehicles, config } = live.data;
  const own = requests.flatMap((r) => r.trips.filter((t) => t.kind !== 'EXTERNAL' && t.vehicle && !['REJECTED', 'CANCELLED', 'DROPPED_OFF'].includes(t.status)).map((t) => ({ r, t })));
  const external = requests.flatMap((r) => r.trips.filter((t) => t.kind === 'EXTERNAL' && t.status !== 'NEEDS_EXTERNAL' && !['REJECTED', 'CANCELLED', 'DROPPED_OFF'].includes(t.status)).map((t) => ({ r, t })));
  const alerts = requests.flatMap((r) => r.trips.filter((t) => t.status === 'NEEDS_EXTERNAL').map((t) => ({ r, t })));
  const waiting = requests.filter((r) => !r.trips.some((t) => !['REJECTED', 'CANCELLED'].includes(t.status)));
  return (
    <>
      {act.note}
      {alerts.length > 0 && (
        <section className="ext-alerts" aria-label="Cần gọi xe ngoài" data-testid="ext-alerts">
          <h3>Hết xe của khách sạn, cần gọi xe ngoài ({alerts.length})</h3>
          {alerts.map(({ r, t }) => <ExternalCard key={t.id} r={r} t={t} cfg={config} act={act} go={go} />)}
        </section>
      )}
      <h3>Xe của khách sạn</h3>
      {!vehicles.length ? <EmptyState title="Chưa có xe">Khách sạn chưa đăng ký xe. Vào Vận chuyển → Xe và tài xế để đăng ký xe và tài xế, hệ thống sẽ tự điều xe cho khách.</EmptyState> : (
        <div data-testid="veh-list" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {vehicles.map((v) => <VehicleCard key={v.id} v={v} trips={own.filter((x) => x.t.vehicle.id === v.id)} positions={live.positions} />)}
        </div>
      )}
      {external.length > 0 && <>
        <h3>Chuyến xe ngoài đang chạy</h3>
        {external.map(({ r, t }) => <div key={t.id} className="card" style={{ padding: 12, marginBottom: 8 }}><strong>{r.bookingCode}</strong> · {DIRECTION[r.direction]} · {fmtDT(r.pickupAt)}<ExternalTrip t={t} act={act} go={go} /></div>)}
      </>}
      <h3>Yêu cầu chờ xe</h3>
      <DataTable rows={waiting} rowTestid="board-row" emptyTitle="Không có yêu cầu chờ" empty="Mọi yêu cầu xe đều đã có xe." columns={[
        { key: 'code', header: 'Đơn', render: (r) => <strong>{r.bookingCode}</strong> },
        { key: 'guest', header: 'Khách', render: (r) => r.guest.fullName },
        { key: 'dir', header: 'Chiều', render: (r) => `${DIRECTION[r.direction] || r.direction} (${r.airport})` },
        { key: 'at', header: 'Giờ đón', render: (r) => fmtDT(r.pickupAt) },
        { key: 'pax', header: 'Khách đi xe', render: (r) => r.passengers },
        { key: 'status', header: 'Trạng thái', render: () => <span className="muted">Hệ thống tự điều xe khi còn {config.dispatchLeadMin ?? 30} phút tới giờ đón</span> },
      ]} />
    </>
  );
}

// Màn chỉ xem: dữ liệu từ /v1/hotel/shuttle/board (tự cập nhật qua socket, dự phòng polling).
export default function Shuttle() {
  const { state } = useApp();
  const live = useLiveData(() => H.getBoard(), [], state.session?.id);
  return (
    <>
      <PageHeader title="Theo dõi xe" description="Hệ thống tự điều xe cho khách. Màn này cho biết xe nào đang chở đơn nào, xe nào rảnh và đơn nào chưa có xe." actions={<LiveBadge conn={live.conn} />} />
      <Board live={live} />
    </>
  );
}
