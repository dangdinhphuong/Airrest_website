import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ErrorBox, Field, Loading, ScreenTitle } from '../Common';
import { Pill, ReasonAction } from '../partner/ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { money } from '../../lib/time';
import { describeError } from '../../lib/api';
import { useLiveData } from '../../lib/useRealtime';
import * as H from '../../data/hotel';
import { ConfirmButton, ListState, StatusPill, fmtDT, needReason, useAction, usePaged } from './kit';
import { DIRECTION, LiveBadge, PROVIDER, TripPill, VEHICLE_STATE, vi } from './fleetKit';
import Select from '../Select';

const TripMap = lazy(() => import('./TripMap'));
const DIR = { TO_HOTEL: 'Sân bay → KS', TO_AIRPORT: 'KS → sân bay' };
const CANCELLABLE = ['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'NEEDS_EXTERNAL'];
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
        <Field id={`${id}-p`} label="Hãng xe"><Select id={`${id}-p`} value={v.provider} onChange={set('provider')} data-testid="ext-provider">{Object.entries(PROVIDER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></Field>
        <Field id={`${id}-u`} label="Liên kết chia sẻ chuyến (https)" error={err}><input id={`${id}-u`} value={v.shareUrl} onChange={set('shareUrl')} required placeholder="https://" inputMode="url" data-testid="ext-url" /></Field>
        <Field id={`${id}-n`} label="Tên tài xế (tùy chọn)"><input id={`${id}-n`} value={v.driverName} onChange={set('driverName')} maxLength={100} data-testid="ext-driver" /></Field>
        <Field id={`${id}-b`} label="Biển số (tùy chọn)"><input id={`${id}-b`} value={v.plate} onChange={set('plate')} maxLength={20} data-testid="ext-plate" /></Field>
        <Field id={`${id}-t`} label="SĐT tài xế (tùy chọn)"><input id={`${id}-t`} value={v.phone} onChange={set('phone')} inputMode="tel" data-testid="ext-phone" /></Field>
        <Field id={`${id}-e`} label="Giờ đón dự kiến (tùy chọn)"><input id={`${id}-e`} type="datetime-local" value={v.etaAt} onChange={set('etaAt')} data-testid="ext-eta" /></Field>
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

function TripLine({ t, vehicles, act, go, positions }) {
  const [form, setForm] = useState(null); // 'ext' | 'reassign' | null
  const [map, setMap] = useState(false);
  const [veh, setVeh] = useState('');
  const free = vehicles.filter((v) => v.state === 'FREE' && v.seats >= t.seats && v.id !== t.vehicle?.id);
  const own = t.kind === 'OWN';
  const pos = positions[t.id] || t.position;
  const next = !own && NEXT_EXT[t.status];
  return (
    <div className="trip-line" data-testid="trip-line">
      <div className="trip-head">
        <TripPill s={t.status} /> <span>{t.seats} chỗ</span>
        {own && t.vehicle && <span><strong>{t.vehicle.plate}</strong>{t.driver ? ` · ${t.driver.name} · ${t.driver.phone}` : ''}</span>}
        {!own && t.external && <span>{PROVIDER[t.external.provider] || 'Xe ngoài'}{t.external.simulated && ' (mô phỏng)'}{[t.external.driverName, t.external.plate, t.external.phone].filter(Boolean).map((x) => ` · ${x}`).join('')}{t.external.shareUrl && <> · <a href={t.external.shareUrl} target="_blank" rel="noopener noreferrer">Xem hành trình</a></>}</span>}
        {t.status === 'REJECTED' && t.rejectReason && <small>Lý do: {t.rejectReason}</small>}
      </div>
      <div className="row-actions" style={{ marginTop: 6 }}>
        {next && <ConfirmButton label={next[1]} ask={next[2]} disabled={act.busy} testid={`ext-${next[0]}`} onConfirm={() => go(vi(() => H.staffStep(t.id, next[0])), 'Đã cập nhật chuyến.')} />}
        {!own && t.status === 'ACCEPTED' && <button type="button" className="btn btn-sm" onClick={() => setForm(form === 'ext' ? null : 'ext')} data-testid="ext-change">Đổi xe ngoài</button>}
        {['OFFERED', 'ACCEPTED', 'NEEDS_EXTERNAL'].includes(t.status) && <button type="button" className="btn btn-sm" onClick={() => setForm(form === 'reassign' ? null : 'reassign')} data-testid="reassign-open">Gán lại xe</button>}
        {own && pos && ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD'].includes(t.status) && <button type="button" className="btn btn-sm" onClick={() => setMap(!map)} data-testid="map-toggle">{map ? 'Ẩn bản đồ' : 'Bản đồ'}</button>}
        {own && !pos && t.route && <button type="button" className="btn btn-sm" onClick={() => setMap(!map)} data-testid="map-toggle">{map ? 'Ẩn bản đồ' : 'Bản đồ'}</button>}
        {CANCELLABLE.includes(t.status) && <ReasonAction label="Hủy chuyến" tone="danger" confirmLabel="Hủy chuyến" placeholder="Ghi chú hủy (tối thiểu 3 ký tự)" testid="trip-cancel" onSubmit={needReason((n) => go(vi(() => H.cancelTrip(t.id, n)), 'Đã hủy chuyến.'))} />}
      </div>
      {form === 'ext' && <ExternalForm trip={t} busy={act.busy} onCancel={() => setForm(null)} onSubmit={(b) => go(vi(() => H.setExternal(t.id, b)), 'Đã đổi thông tin xe ngoài.')} />}
      {form === 'reassign' && (
        <div className="inline-form" style={{ marginTop: 8 }}>
          <Select aria-label="Chọn xe rảnh" value={veh} onChange={(e) => setVeh(e.target.value)} data-testid="reassign-select">
            <option value="">{free.length ? 'Chọn xe rảnh đủ chỗ' : 'Không có xe rảnh đủ chỗ'}</option>
            {free.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.seats} chỗ{v.driver ? ` · ${v.driver.name}` : ''}</option>)}
          </Select>
          <button type="button" className="btn btn-sm btn-primary" disabled={!veh || act.busy} onClick={async () => { if (await go(vi(() => H.reassignTrip(t.id, veh)), 'Đã gán lại xe, tài xế mới cần nhận chuyến.')) setForm(null); }} data-testid="reassign-ok">Gán xe</button>
          <button type="button" className="link-btn" onClick={() => setForm(null)}>Huỷ</button>
        </div>
      )}
      {map && <Suspense fallback={<Loading />}><TripMap route={t.route} position={pos} /></Suspense>}
    </div>
  );
}

function Board({ live }) {
  const act = useAction();
  const go = async (fn, ok) => { const r = await act.run(fn, ok); live.refresh(); return r; };
  if (live.loading && !live.data) return <Loading />;
  if (live.err && !live.data) return <ErrorBox onRetry={live.reload}>{describeError(live.err)}</ErrorBox>;
  const { requests, vehicles, config } = live.data;
  const alerts = requests.flatMap((r) => r.trips.filter((t) => t.status === 'NEEDS_EXTERNAL').map((t) => ({ r, t })));
  return (
    <>
      <p><LiveBadge conn={live.conn} /></p>
      {act.note}
      {alerts.length > 0 && (
        <section className="ext-alerts" aria-label="Cần gọi xe ngoài" data-testid="ext-alerts">
          <h3>Cần gọi xe ngoài ({alerts.length})</h3>
          {alerts.map(({ r, t }) => <ExternalCard key={t.id} r={r} t={t} cfg={config} act={act} go={go} />)}
        </section>
      )}
      <h3>Yêu cầu xe đang xử lý</h3>
      {!requests.length ? <p className="muted" data-testid="empty">Chưa có yêu cầu xe nào cần xử lý.</p> : (
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Đơn</th><th>Khách</th><th>Chiều</th><th>Giờ đón</th><th>Khách đi xe</th><th>Chuyến, xe và tài xế</th><th>Trạng thái</th></tr></thead>
          <tbody>{requests.map((r) => (
            <tr key={r.id} data-testid="board-row">
              <td data-label="Đơn"><strong>{r.bookingCode}</strong></td>
              <td data-label="Khách">{r.guest.fullName}<br /><a href={`tel:${r.guest.phone}`}>{r.guest.phone}</a></td>
              <td data-label="Chiều">{DIRECTION[r.direction] || r.direction} ({r.airport})</td>
              <td data-label="Giờ đón">{fmtDT(r.pickupAt)}</td>
              <td data-label="Khách đi xe">{r.passengers}</td>
              <td data-label="Chuyến">{r.trips.length ? r.trips.map((t) => <TripLine key={t.id} t={t} vehicles={vehicles} act={act} go={go} positions={live.positions} />) : <span className="muted">Chưa có chuyến (chờ điều phối)</span>}</td>
              <td data-label="Trạng thái"><StatusPill s={r.status} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <h3>Xe của khách sạn</h3>
      {!vehicles.length ? <p className="muted">Khách sạn chưa khai báo xe.</p> : (
        <ul className="veh-list" data-testid="veh-list">{vehicles.map((v) => { const [t, tone] = VEHICLE_STATE[v.state] || [v.state, 'neutral']; return <li key={v.id} data-testid="veh-item"><strong>{v.plate}</strong> · {v.seats} chỗ{v.model ? ` · ${v.model}` : ''} · {v.driver ? v.driver.name : 'Chưa có tài xế'} <Pill tone={tone}>{t}</Pill></li>; })}</ul>
      )}
    </>
  );
}

function AssignForm({ s, onSubmit, busy }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(s.driver?.name || '');
  const [phone, setPhone] = useState(s.driver?.phone || '');
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} data-testid="sh-assign-open">{s.status === 'ASSIGNED' ? 'Đổi tài xế' : 'Phân xe'}</button>;
  return (
    <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await onSubmit(name, phone)) setOpen(false); }}>
      <input aria-label="Tên tài xế" placeholder="Tên tài xế" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} data-testid="sh-driver" />
      <input aria-label="SĐT tài xế" placeholder="SĐT tài xế" value={phone} onChange={(e) => setPhone(e.target.value)} required data-testid="sh-phone" />
      <button type="submit" className="btn btn-sm btn-primary" disabled={busy} data-testid="sh-assign-ok">Lưu</button>
      <button type="button" className="link-btn" onClick={() => setOpen(false)}>Huỷ</button>
    </form>
  );
}

// Danh sách yêu cầu theo kiểu cũ (shuttle:handle): phân xe tay chỉ còn cho yêu cầu CHƯA có chuyến.
function Legacy({ noTrips }) {
  const [status, setStatus] = useState('');
  const act = useAction();
  const list = usePaged((cursor) => H.listShuttles({ status, cursor }), [status]);
  const go = async (fn, ok) => { const r = await act.run(vi(fn), ok); if (r) list.reload(); return r; };
  return (
    <>
      <h3>Tất cả yêu cầu xe</h3>
      <div className="filter-bar">
        <Select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="sh-status">
          <option value="">Mọi trạng thái</option><option value="REQUESTED">Chờ phân xe</option><option value="ASSIGNED">Đã phân xe</option><option value="DONE">Hoàn tất</option><option value="CANCELLED">Đã hủy</option>
        </Select>
      </div>
      {act.note}
      <ListState list={list} empty="Chưa có yêu cầu xe nào.">
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Đơn</th><th>Khách</th><th>Chiều</th><th>Giờ đón</th><th>Địa điểm / ghi chú</th><th>Giá</th><th>Tài xế</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{list.items.map((s) => (
            <tr key={s.id} data-testid="sh-row">
              <td data-label="Đơn"><strong>{s.bookingCode}</strong></td><td data-label="Khách">{s.guestName}</td>
              <td data-label="Chiều">{DIR[s.direction]} ({s.airportIata}, {s.distanceKm} km)</td><td data-label="Giờ đón">{fmtDT(s.pickupAt)}</td>
              <td data-label="Địa điểm">{[s.location, s.note, s.cancelNote && `Lý do hủy: ${s.cancelNote}`].filter(Boolean).join(' · ')}</td>
              <td data-label="Giá">{money(s.priceVnd)}</td><td data-label="Tài xế">{s.driver ? `${s.driver.name} · ${s.driver.phone}` : ''}</td>
              <td data-label="Trạng thái"><StatusPill s={s.status} /></td>
              <td>{['REQUESTED', 'ASSIGNED'].includes(s.status) && noTrips.has(s.id) && <div className="row-actions" style={{ marginTop: 0 }}>
                <AssignForm s={s} busy={act.busy} onSubmit={(n, p) => go(() => H.assignShuttle(s.id, n, p), 'Đã phân xe.')} />
                {s.status === 'ASSIGNED' && <ConfirmButton label="Hoàn tất" ask="Xe đã đón xong?" disabled={act.busy} testid="sh-complete" onConfirm={() => go(() => H.completeShuttle(s.id), 'Đã hoàn tất chuyến đưa đón.')} />}
                <ReasonAction label="Hủy xe" tone="danger" confirmLabel="Hủy chuyến" placeholder="Ghi chú hủy (bắt buộc)" testid="sh-cancel" onSubmit={needReason((n) => go(() => H.cancelShuttle(s.id, n), 'Đã hủy yêu cầu xe.'))} />
              </div>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </ListState>
    </>
  );
}

// Điều phối xe: bảng /v1/hotel/shuttle/board (tự cập nhật qua socket, dự phòng polling) + danh sách yêu cầu cũ.
export default function Shuttle() {
  const { state } = useApp();
  const legacy = hasPerm(state.session, PERM.SHUTTLE_HANDLE);
  const live = useLiveData(() => H.getBoard(), [], state.session?.id);
  const noTrips = new Set((live.data?.requests || []).filter((r) => !r.trips.length).map((r) => r.id)); // yêu cầu chưa có chuyến mới được phân xe tay
  return (
    <>
      <ScreenTitle title="Điều phối xe">Yêu cầu xe của khách, chuyến, tài xế và cảnh báo hết xe.</ScreenTitle>
      <Board live={live} />
      {legacy && <Legacy noTrips={noTrips} />}
    </>
  );
}
