import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Pill } from '../partner/ui';
import { patchFlight } from '../../data/admin';
import { Filters, PagedView, Table, dt, isoOrUndef, usePaged, useRun } from './kit';

const ST = { ONTIME: ['Đúng giờ', 'ok'], DELAYED: ['Trễ', 'warn'], CANCELLED: ['Hủy', 'error'] };
const CAUSE = { AIRLINE: 'Hãng bay', FORCE: 'Bất khả kháng', UNKNOWN: 'Chưa rõ' };
const toLocalInput = (v) => { if (!v) return ''; const x = new Date(v); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

function Changes({ id }) {
  const p = usePaged(`/flights/${id}/changes`, {});
  return <PagedView p={p} empty="Chưa có thay đổi nào."><Table rowKey={(r) => r.seq ?? r.id ?? r.at} rows={p.items} cols={[['Lúc', (r) => dt(r.createdAt)], ['Trạng thái', (r) => `${ST[r.statusBefore]?.[0] || r.statusBefore} → ${ST[r.statusAfter]?.[0] || r.statusAfter}`], ['Giờ bay', (r) => `${dt(r.fromAt)} → ${dt(r.toAt)}`], ['Lý do', (r) => r.reason]]} /></PagedView>;
}

function Edit({ f, onDone }) {
  const [status, setStatus] = useState(f.status);
  const [dep, setDep] = useState(toLocalInput(f.newDepartureAt));
  const [cause, setCause] = useState(f.cause || '');
  const [reason, setReason] = useState('');
  const { run, busy, node } = useRun();
  const save = async (e) => {
    e.preventDefault();
    const body = { status, reason, newDepartureAt: dep ? isoOrUndef(dep) : null, ...(cause && { cause }) };
    const r = await run(() => patchFlight(f.id, body), 'Đã cập nhật chuyến bay.');
    if (r.ok) onDone();
  };
  return (
    <form onSubmit={save} className="card" data-testid="flight-edit">
      <h3>Sửa {f.code} · {f.flightDate}</h3>
      {node}
      <div className="grid-2">
        <div className="field"><label htmlFor="fl-st">Trạng thái</label><select id="fl-st" value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(ST).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="fl-dep">Giờ cất cánh mới (để trống nếu không đổi)</label><input id="fl-dep" type="datetime-local" value={dep} onChange={(e) => setDep(e.target.value)} /></div>
        <div className="field"><label htmlFor="fl-cause">Nguyên nhân</label><select id="fl-cause" value={cause} onChange={(e) => setCause(e.target.value)}><option value="">—</option>{Object.entries(CAUSE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="fl-reason">Lý do (bắt buộc)</label><input id="fl-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={200} /></div>
      </div>
      <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="flight-save">Lưu</button><button type="button" className="btn" onClick={onDone}>Đóng</button></div>
    </form>
  );
}

export default function Flights() {
  const [q, setQ] = useState({});
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);
  const p = usePaged('/flights', q);
  return (
    <>
      <ScreenTitle title="Chuyến bay mô phỏng" kicker="Chỉnh giờ và trạng thái, có lịch sử" />
      <Filters fields={[['code', 'Mã chuyến (VN218)'], ['date', 'Ngày (YYYY-MM-DD)'], ['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])]]} onApply={setQ} />
      {edit && <Edit f={edit} onDone={() => { setEdit(null); p.reload(); }} />}
      {hist && <section className="card" data-testid="flight-history"><div className="card-head"><h3>Lịch sử {hist.code} · {hist.flightDate}</h3><button type="button" className="link-btn" onClick={() => setHist(null)}>Đóng</button></div><Changes id={hist.id} /></section>}
      <PagedView p={p} empty="Không có chuyến bay khớp bộ lọc.">
        <Table rows={p.items} cols={[['Chuyến', (f) => f.code], ['Ngày', (f) => f.flightDate], ['Tuyến', (f) => `${f.origin} → ${f.dest}`], ['Giờ dự kiến', (f) => dt(f.scheduledDepartureAt)], ['Giờ hiệu lực', (f) => dt(f.effectiveDepartureAt)], ['Trạng thái', (f) => <Pill tone={ST[f.status]?.[1]}>{ST[f.status]?.[0]}{f.delayMinutes ? ` ${f.delayMinutes}p` : ''}</Pill>], ['Nguyên nhân', (f) => CAUSE[f.cause] || '—'],
          ['', (f) => <span className="inline-form"><button type="button" className="btn btn-sm" onClick={() => { setHist(null); setEdit(f); }} data-testid="flight-edit-open">Sửa</button><button type="button" className="link-btn" onClick={() => { setEdit(null); setHist(f); }}>Lịch sử</button></span>]]} />
      </PagedView>
    </>
  );
}
