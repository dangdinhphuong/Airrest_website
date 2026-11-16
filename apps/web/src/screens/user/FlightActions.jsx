import React, { useState } from 'react';
import { Modal } from '../../components/ui';
import Select from '../../components/Select';
import { AirportSelect, useAirports, useRun } from '../../components/admin/kit';
import { createFlight, patchFlight } from '../../data/admin';

// Hành động ghi trên trang /flights: CHỈ dùng endpoint admin có sẵn (POST /v1/admin/flights, PATCH /v1/admin/flights/:id), quyền flight:manage kiểm ở máy chủ.
// Giờ nhập/hiển thị luôn theo giờ Việt Nam (+07:00), không phụ thuộc múi giờ trình duyệt.
export const vnToIso = (local) => (local ? new Date(`${local}:00+07:00`).toISOString() : undefined);
export const isoToVn = (iso) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16) : '');
const vnLabel = (iso) => isoToVn(iso).replace('T', ' ');
const dur = (min) => `${Math.floor(min / 60)} giờ ${min % 60} phút`;

const CAUSE = { AIRLINE: 'Hãng bay', FORCE: 'Bất khả kháng', UNKNOWN: 'Chưa rõ' };
const ACTION = { DELAYED: 'Delay đến thời điểm…', CANCELLED: 'Hủy chuyến', ONTIME: 'Đưa về đúng giờ' };

export function CreateFlightModal({ airport, onClose, onDone }) {
  const { items: airports, err } = useAirports();
  const [v, setV] = useState({ code: '', airline: '', origin: airport || '', dest: '', at: '', reason: '' });
  const { run, busy, node } = useRun();
  const set = (k) => (e) => setV({ ...v, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = { code: v.code.trim(), origin: v.origin, scheduledDepartureAt: vnToIso(v.at), reason: v.reason.trim(), ...(v.airline.trim() && { airline: v.airline.trim() }), ...(v.dest && { dest: v.dest }) };
    const r = await run(() => createFlight(body), 'Đã tạo chuyến bay.');
    if (r.ok) onDone(r.r.flight);
  };
  return (
    <Modal open onClose={onClose} title="Tạo chuyến bay" size="lg">
      <form onSubmit={submit} data-testid="flight-create">
        {node}{err && <p className="field-error" role="alert">{err}</p>}
        <div className="grid-2">
          <div className="field"><label htmlFor="cf-code">Mã chuyến (vd VN218)</label><input id="cf-code" required value={v.code} onChange={set('code')} maxLength={8} /></div>
          <div className="field"><label htmlFor="cf-airline">Hãng bay (để trống = mặc định)</label><input id="cf-airline" value={v.airline} onChange={set('airline')} maxLength={100} /></div>
          <div className="field"><label htmlFor="cf-origin">Sân bay đi</label><AirportSelect id="cf-origin" airports={airports} allowEmpty value={v.origin} onChange={set('origin')} /></div>
          <div className="field"><label htmlFor="cf-dest">Sân bay đến (tùy chọn)</label><AirportSelect id="cf-dest" airports={airports} allowEmpty required={false} value={v.dest} onChange={set('dest')} /></div>
          <div className="field"><label htmlFor="cf-at">Giờ khởi hành dự kiến (giờ Việt Nam)</label><input id="cf-at" type="datetime-local" required value={v.at} onChange={set('at')} /></div>
          <div className="field"><label htmlFor="cf-reason">Lý do (bắt buộc)</label><input id="cf-reason" required minLength={3} maxLength={200} value={v.reason} onChange={set('reason')} /></div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Chuyến mới luôn ở trạng thái Đúng giờ; sau đó dùng “Delay đến…” để đổi giờ hoặc trạng thái.</p>
        <div className="row-actions"><button className="btn btn-primary" disabled={busy}>Tạo chuyến</button><button type="button" className="btn" onClick={onClose}>Đóng</button></div>
      </form>
    </Modal>
  );
}

export function ChangeFlightModal({ f, onClose, onDone }) {
  const [action, setAction] = useState('DELAYED');
  const [dep, setDep] = useState(isoToVn(f.newDepartureAt || f.scheduledDepartureAt));
  const [cause, setCause] = useState(f.cause && f.cause !== 'UNKNOWN' ? f.cause : 'AIRLINE');
  const [reason, setReason] = useState('');
  const { run, busy, node } = useRun();
  const base = new Date(f.newDepartureAt || f.scheduledDepartureAt).getTime();
  const plus = (m) => setDep(isoToVn(new Date(base + m * 60_000).toISOString()));
  const newIso = vnToIso(dep);
  const delayMin = newIso ? Math.round((new Date(newIso).getTime() - new Date(f.scheduledDepartureAt).getTime()) / 60_000) : null;
  const depErr = action === 'DELAYED' && (delayMin === null ? 'Chọn giờ bay mới.' : delayMin <= 0 ? 'Giờ bay mới phải sau giờ lịch.' : '');
  const submit = async (e) => {
    e.preventDefault();
    if (depErr) return;
    const body = { status: action, reason: reason.trim(), ...(action === 'DELAYED' && { newDepartureAt: newIso }), ...(action !== 'ONTIME' && { cause }) };
    const r = await run(() => patchFlight(f.id, body), 'Đã cập nhật chuyến bay.');
    if (r.ok) onDone();
  };
  return (
    <Modal open onClose={onClose} title={`${f.code} · cập nhật giờ / trạng thái`} size="lg">
      <form onSubmit={submit} data-testid="flight-change">
        {node}
        <div className="grid-2">
          <div className="field"><label htmlFor="ch-action">Hành động</label><Select id="ch-action" value={action} onChange={(e) => setAction(e.target.value)}>{Object.entries(ACTION).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></div>
          {action !== 'ONTIME' && <div className="field"><label htmlFor="ch-cause">Nguyên nhân</label><Select id="ch-cause" value={cause} onChange={(e) => setCause(e.target.value)}>{Object.entries(CAUSE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></div>}
        </div>
        {action === 'DELAYED' && (
          <div className="field">
            <label htmlFor="ch-dep">Giờ bay mới (giờ Việt Nam)</label>
            <input id="ch-dep" type="datetime-local" value={dep} onChange={(e) => setDep(e.target.value)} aria-invalid={!!depErr} />
            <div className="row-actions" style={{ marginTop: 6 }}>{[30, 60, 120].map((m) => <button key={m} type="button" className="btn btn-sm" onClick={() => plus(m)}>+{m} phút</button>)}</div>
            {depErr && <small className="field-error" role="alert">{depErr}</small>}
            {!depErr && <p data-testid="delay-preview" style={{ marginTop: 8 }}>Giờ lịch <strong>{vnLabel(f.scheduledDepartureAt)}</strong> → giờ mới <strong>{dep.replace('T', ' ')}</strong>, trễ <strong>{dur(delayMin)}</strong>.</p>}
          </div>
        )}
        {action === 'CANCELLED' && <p>Chuyến {f.code} sẽ bị hủy.</p>}
        {action === 'ONTIME' && <p>Chuyến {f.code} trở về đúng giờ lịch ({vnLabel(f.scheduledDepartureAt)}).</p>}
        <div className="field"><label htmlFor="ch-reason">Lý do (bắt buộc)</label><input id="ch-reason" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="row-actions"><button className="btn btn-primary" disabled={busy || !!depErr}>Xác nhận</button><button type="button" className="btn" onClick={onClose}>Đóng</button></div>
      </form>
    </Modal>
  );
}
