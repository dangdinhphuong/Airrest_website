import React, { useState } from 'react';
import { ScreenTitle, Field, Notice } from '../Common';
import { Pill } from '../partner/ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { createFlight, deleteFlight, patchFlight } from '../../data/admin';
import { Act, AirportSelect, Filters, PagedView, Table, dt, isoOrUndef, useAirports, usePaged, useRun } from './kit';

const ST = { ONTIME: ['Đúng giờ', 'ok'], DELAYED: ['Trễ', 'warn'], CANCELLED: ['Hủy', 'error'] };
const CAUSE = { AIRLINE: 'Hãng bay', FORCE: 'Bất khả kháng', UNKNOWN: 'Chưa rõ' };
const toLocalInput = (v) => { if (!v) return ''; const x = new Date(v); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

function Changes({ id }) {
  const p = usePaged(`/flights/${id}/changes`, {});
  return <PagedView p={p} empty="Chưa có thay đổi nào."><Table rowKey={(r) => r.seq ?? r.id ?? r.at} rows={p.items} cols={[['Lúc', (r) => dt(r.createdAt)], ['Trạng thái', (r) => `${ST[r.statusBefore]?.[0] || r.statusBefore} → ${ST[r.statusAfter]?.[0] || r.statusAfter}`], ['Giờ bay', (r) => `${dt(r.fromAt)} → ${dt(r.toAt)}`], ['Lý do', (r) => r.reason]]} /></PagedView>;
}

function Edit({ f, onDone }) {
  const [status, setStatus] = useState(f.status);
  const [dep, setDep] = useState(f.status === 'DELAYED' ? toLocalInput(f.newDepartureAt || f.effectiveDepartureAt) : '');
  const [cause, setCause] = useState(f.cause || '');
  const [reason, setReason] = useState('');
  const { run, busy, node } = useRun();
  const save = async (e) => {
    e.preventDefault();
    const body = { status, reason, ...(status === 'DELAYED' && { newDepartureAt: dep ? isoOrUndef(dep) : null }), ...(cause && { cause }) };
    const r = await run(() => patchFlight(f.id, body), 'Đã cập nhật chuyến bay.');
    if (r.ok) onDone(true);
  };
  return (
    <form onSubmit={save} className="card" data-testid="flight-edit">
      <h3>Sửa {f.code} · {f.flightDate}</h3>
      {node}
      <div className="grid-2">
        <div className="field"><label htmlFor="fl-st">Trạng thái</label><select id="fl-st" value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(ST).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></div>
        {status === 'DELAYED' && <div className="field"><label htmlFor="fl-dep">Giờ cất cánh mới (để trống nếu không đổi)</label><input id="fl-dep" type="datetime-local" value={dep} onChange={(e) => setDep(e.target.value)} data-testid="fl-dep" /></div>}
        <div className="field"><label htmlFor="fl-cause">Nguyên nhân</label><select id="fl-cause" value={cause} onChange={(e) => setCause(e.target.value)}><option value="">—</option>{Object.entries(CAUSE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="fl-reason">Lý do (bắt buộc)</label><input id="fl-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={200} /></div>
      </div>
      <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="flight-save">Lưu</button><button type="button" className="btn" onClick={onDone}>Đóng</button></div>
    </form>
  );
}

function Create({ onDone, onCancel }) {
  const { items: airports, err: airErr } = useAirports();
  const [v, setV] = useState({ code: '', airline: '', origin: '', dest: '', at: '', km: '', reason: '' });
  const { run, busy, node } = useRun();
  const set = (k) => (e) => setV({ ...v, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = { code: v.code.trim(), origin: v.origin, scheduledDepartureAt: isoOrUndef(v.at), reason: v.reason.trim(), ...(v.airline.trim() && { airline: v.airline.trim() }), ...(v.dest && { dest: v.dest }), ...(v.km !== '' && { distanceKm: Number(v.km) }) };
    const r = await run(() => createFlight(body), 'Đã tạo chuyến bay mô phỏng.');
    if (r.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="card" data-testid="flight-create">
      <h3>Tạo chuyến bay mô phỏng</h3>
      {node}{airErr && <p className="field-error" role="alert">{airErr}</p>}
      <div className="grid-2">
        <Field id="cf-code" label="Mã chuyến (vd VN218)"><input id="cf-code" required value={v.code} onChange={set('code')} maxLength={8} data-testid="cf-code" /></Field>
        <Field id="cf-airline" label="Hãng bay (để trống = Hãng mô phỏng)"><input id="cf-airline" value={v.airline} onChange={set('airline')} maxLength={100} /></Field>
        <Field id="cf-origin" label="Sân bay đi"><AirportSelect id="cf-origin" airports={airports} allowEmpty value={v.origin} onChange={set('origin')} data-testid="cf-origin" /></Field>
        <Field id="cf-dest" label="Sân bay đến (tùy chọn)"><AirportSelect id="cf-dest" airports={airports} allowEmpty required={false} value={v.dest} onChange={set('dest')} data-testid="cf-dest" /></Field>
        <Field id="cf-at" label="Giờ cất cánh dự kiến"><input id="cf-at" type="datetime-local" required value={v.at} onChange={set('at')} data-testid="cf-at" /></Field>
        <Field id="cf-km" label="Khoảng cách (km, tùy chọn)"><input id="cf-km" type="number" min={0} max={20000} value={v.km} onChange={set('km')} /></Field>
      </div>
      <Field id="cf-reason" label="Lý do (bắt buộc)"><input id="cf-reason" required minLength={3} maxLength={200} value={v.reason} onChange={set('reason')} data-testid="cf-reason" /></Field>
      <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="flight-create-submit">Tạo chuyến</button><button type="button" className="btn" onClick={onCancel}>Đóng</button></div>
    </form>
  );
}

export default function Flights() {
  const { state } = useApp();
  const manage = hasPerm(state.session, PERM.FLIGHT_MANAGE);
  const [creating, setCreating] = useState(false);
  const del = useRun();
  const [done, setDone] = useState('');
  const [q, setQ] = useState({});
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);
  const p = usePaged('/flights', q);
  return (
    <>
      <ScreenTitle title="Chuyến bay mô phỏng">Chỉnh giờ và trạng thái, có lịch sử</ScreenTitle>
      {manage && !creating && <div className="row-actions" style={{ marginTop: 0 }}><button type="button" className="btn btn-sm btn-primary" onClick={() => { setEdit(null); setHist(null); setCreating(true); }} data-testid="flight-new">Tạo chuyến</button></div>}
      {creating && <Create onCancel={() => setCreating(false)} onDone={() => { setCreating(false); setDone('Đã tạo chuyến bay mô phỏng.'); p.reload(); }} />}
      {del.node}
      {done && <Notice tone="ok" onClose={() => setDone('')}><span data-testid="flight-done">{done}</span></Notice>}
      <Filters fields={[['code', 'Mã chuyến (VN218)'], ['date', 'Ngày (YYYY-MM-DD)'], ['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])]]} onApply={setQ} />
      {edit && <Edit f={edit} onDone={(ok) => { setEdit(null); if (ok === true) setDone('Đã cập nhật chuyến bay.'); p.reload(); }} />}
      {hist && <section className="card" data-testid="flight-history"><div className="card-head"><h3>Lịch sử {hist.code} · {hist.flightDate}</h3><button type="button" className="link-btn" onClick={() => setHist(null)}>Đóng</button></div><Changes id={hist.id} /></section>}
      <PagedView p={p} empty="Không có chuyến bay khớp bộ lọc.">
        <Table rows={p.items} cols={[['Chuyến', (f) => f.code], ['Ngày', (f) => f.flightDate], ['Tuyến', (f) => `${f.origin} → ${f.dest}`], ['Giờ dự kiến', (f) => dt(f.scheduledDepartureAt)], ['Giờ hiệu lực', (f) => dt(f.effectiveDepartureAt)], ['Trạng thái', (f) => <Pill tone={ST[f.status]?.[1]}>{ST[f.status]?.[0]}{f.delayMinutes ? ` ${f.delayMinutes}p` : ''}</Pill>], ['Nguyên nhân', (f) => CAUSE[f.cause] || '—'],
          ['', (f) => <span className="inline-form"><button type="button" className="btn btn-sm" onClick={() => { setHist(null); setCreating(false); setEdit(f); }} data-testid="flight-edit-open">Sửa</button><button type="button" className="link-btn" onClick={() => { setEdit(null); setHist(f); }}>Lịch sử</button>{manage && <Act label="Xóa" danger confirm="Xóa chuyến bay này? Chỉ xóa được chuyến chưa có lịch sử thay đổi." testid="flight-delete" onDo={async () => { const r = await del.run(() => deleteFlight(f.id), `Đã xóa chuyến ${f.code}.`); if (r.ok) p.reload(); return r; }} />}</span>]]} />
      </PagedView>
    </>
  );
}
