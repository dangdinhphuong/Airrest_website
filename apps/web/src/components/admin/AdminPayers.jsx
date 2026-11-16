import React, { useState } from 'react';
import { Notice } from '../Common';
import { DataTable, FormField as Field, Modal, PageHeader, StatusBadge } from '../ui';
import Select from '../Select';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { createPayer, createStaff, createStation, patchPayer, patchStaff, patchStation } from '../../data/adminSettle';
import { Act, AirportSelect, Filters, LoadView, cols, dt, pagedProps, useAirports, useLoad, usePaged, useRun } from './kit';
import { PAYER_KIND, PAYER_STATUS, checkPayerForm, checkStaffForm } from './adminSettle';

const Tag = ({ map, v }) => <StatusBadge status={v} map={map} />;
const ACTIVE = { true: ['Đang bật', 'ok'], false: ['Đã tắt', 'neutral'] };
const STAFF = { ACTIVE: ['Hoạt động', 'ok'], LOCKED: ['Đã khóa', 'error'] };
const POLICY = { PRIVATE: 'Phòng riêng', SHARED: 'Ghép phòng' };

function CreateForm({ onDone, onClose }) {
  const [f, setF] = useState({ code: '', name: '', kind: 'AIRLINE', sharedRoomPolicy: 'PRIVATE', allowUpgrade: false, contactName: '', phone: '', email: '' });
  const [bad, setBad] = useState(null);
  const { run, busy, node } = useRun();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const c = checkPayerForm(f);
    if (!c.ok) { setBad(c.error); return; }
    setBad(null);
    const x = await run(() => createPayer(c.body), 'Đã tạo đơn vị chi trả.');
    if (x.ok) { setF({ ...f, code: '', name: '', contactName: '', phone: '', email: '' }); onDone(); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title="Tạo đơn vị chi trả" size="lg">
    <form onSubmit={submit} data-testid="payer-create" noValidate>
      {node}{bad && <Notice tone="error">{bad}</Notice>}
      <div className="grid-2">
        <Field id="pc-code" label="Mã (A-Z, 0-9, _ -)"><input id="pc-code" value={f.code} onChange={set('code')} maxLength={20} /></Field>
        <Field id="pc-name" label="Tên đơn vị"><input id="pc-name" value={f.name} onChange={set('name')} maxLength={200} /></Field>
        <Field id="pc-kind" label="Loại"><Select id="pc-kind" value={f.kind} onChange={set('kind')}>{Object.entries(PAYER_KIND).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></Field>
        <Field id="pc-policy" label="Chính sách phòng"><Select id="pc-policy" value={f.sharedRoomPolicy} onChange={set('sharedRoomPolicy')}>{Object.entries(POLICY).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></Field>
        <Field id="pc-cn" label="Người liên hệ (tùy chọn)"><input id="pc-cn" value={f.contactName} onChange={set('contactName')} maxLength={100} /></Field>
        <Field id="pc-ph" label="Điện thoại (tùy chọn)"><input id="pc-ph" value={f.phone} onChange={set('phone')} /></Field>
        <Field id="pc-em" label="Email liên hệ (tùy chọn)"><input id="pc-em" type="email" value={f.email} onChange={set('email')} /></Field>
      </div>
      <label><input type="checkbox" checked={f.allowUpgrade} onChange={set('allowUpgrade')} /> Cho nhân viên quầy nâng hạng phòng</label>{' '}
      <button className="btn btn-primary" disabled={busy} data-testid="payer-create-submit">Tạo đơn vị</button>
    </form>
    </Modal>
  );
}

function Stations({ id, manage }) {
  const r = useLoad(`/payers/${id}/stations`);
  const airports = useAirports();
  const [f, setF] = useState({ airportIata: '', name: '' });
  const { run, busy, node } = useRun();
  const add = async (e) => {
    e.preventDefault();
    const x = await run(() => createStation(id, { airportIata: f.airportIata, name: f.name.trim() }), 'Đã thêm trạm.');
    if (x.ok) { setF({ airportIata: '', name: '' }); r.reload(); }
  };
  const toggle = async (s) => { const x = await run(() => patchStation(id, s.id, { active: !s.active }), s.active ? 'Đã tắt trạm.' : 'Đã bật trạm.'); if (x.ok) r.reload(); return x; };
  return (
    <section className="card" data-testid="stations">
      <h3>Trạm</h3>{node}
      <LoadView r={r}>{(d) => (<DataTable rows={d.items} empty="Chưa có trạm." columns={cols([['Sân bay', (s) => s.airportIata], ['Tên trạm', (s) => s.name], ['Trạng thái', (s) => <StatusBadge status={String(!!s.active)} map={ACTIVE} />],
        ['', (s) => manage && <Act label={s.active ? 'Tắt' : 'Bật'} confirm={s.active ? 'Tắt trạm này?' : 'Bật lại trạm này?'} onDo={() => toggle(s)} testid="station-toggle" />]])} />)}</LoadView>
      {manage && (
        <form className="inline-form" onSubmit={add} data-testid="station-add">
          <AirportSelect id="st-ap" value={f.airportIata} onChange={(e) => setF({ ...f, airportIata: e.target.value })} airports={airports.items} allowEmpty aria-label="Sân bay" />
          <input aria-label="Tên trạm" placeholder="Tên trạm" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <button className="btn btn-sm btn-primary" disabled={busy || !f.airportIata}>Thêm trạm</button>
        </form>
      )}
    </section>
  );
}

function Staff({ id, manage }) {
  const r = useLoad(`/payers/${id}/staff`);
  const stations = useLoad(`/payers/${id}/stations`);
  const [f, setF] = useState({ email: '', fullName: '', password: '', stationId: '' });
  const [bad, setBad] = useState(null);
  const { run, busy, node } = useRun();
  const add = async (e) => {
    e.preventDefault();
    const c = checkStaffForm(f);
    if (!c.ok) { setBad(c.error); return; }
    setBad(null);
    const x = await run(() => createStaff(id, c.body), 'Đã tạo tài khoản nhân viên.');
    if (x.ok) { setF({ email: '', fullName: '', password: '', stationId: '' }); r.reload(); }
  };
  const lock = async (s) => { const x = await run(() => patchStaff(id, s.id, { status: s.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE' }), 'Đã cập nhật tài khoản.'); if (x.ok) r.reload(); return x; };
  return (
    <section className="card" data-testid="staff">
      <h3>Tài khoản nhân viên</h3>{node}{bad && <Notice tone="error">{bad}</Notice>}
      <LoadView r={r}>{(d) => (<DataTable rows={d.items} empty="Chưa có nhân viên." columns={cols([['Email', (s) => s.email], ['Họ tên', (s) => s.fullName], ['Trạng thái', (s) => <StatusBadge status={s.status} map={STAFF} />],
        ['', (s) => manage && <Act label={s.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'} danger={s.status === 'ACTIVE'} onDo={() => lock(s)} testid="staff-toggle" />]])} />)}</LoadView>
      {manage && (
        <form className="inline-form" onSubmit={add} noValidate data-testid="staff-add">
          <input aria-label="Email nhân viên" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input aria-label="Họ tên nhân viên" placeholder="Họ tên" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <input aria-label="Mật khẩu nhân viên" placeholder="Mật khẩu (12+ ký tự)" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <Select aria-label="Trạm của nhân viên" value={f.stationId} onChange={(e) => setF({ ...f, stationId: e.target.value })}><option value="">Không gán trạm</option>{(stations.data?.items || []).map((s) => <option key={s.id} value={s.id}>{s.airportIata} – {s.name}</option>)}</Select>
          <button className="btn btn-sm btn-primary" disabled={busy}>Tạo nhân viên</button>
        </form>
      )}
    </section>
  );
}

function Detail({ id, onBack, manage }) {
  const r = useLoad(`/payers/${id}`);
  const { run, node } = useRun();
  const patch = async (b, ok) => { const x = await run(() => patchPayer(id, b), ok); if (x.ok) r.reload(); return x; };
  return (
    <>
      <LoadView r={r} head={<PageHeader title="Đơn vị chi trả" back={{ onClick: onBack }} />}>{({ payer: p }) => (
        <>
          <PageHeader title={p.name} description={`Mã ${p.code} · ${PAYER_KIND[p.kind] || p.kind}`} back={{ onClick: onBack }} />
          {node}
          <section className="card" data-testid="payer-info">
            <p><Tag map={PAYER_STATUS} v={p.status} /> · {POLICY[p.sharedRoomPolicy] || p.sharedRoomPolicy} · {p.allowUpgrade ? 'Cho nâng hạng' : 'Không nâng hạng'} · Tạo {dt(p.createdAt)}</p>
            {p.contact && <p className="muted">Liên hệ: {[p.contact.name, p.contact.phone, p.contact.email].filter(Boolean).join(' · ')}</p>}
            {manage && (
              <div className="row-actions">
                {p.status === 'ACTIVE'
                  ? <Act label="Tạm ngưng" danger confirm="Tạm ngưng: nhân viên đơn vị không đăng nhập và khóa API không dùng được. Tiếp tục?" onDo={() => patch({ status: 'SUSPENDED' }, 'Đã tạm ngưng đơn vị.')} testid="payer-suspend" />
                  : <Act label="Kích hoạt lại" onDo={() => patch({ status: 'ACTIVE' }, 'Đã kích hoạt lại đơn vị.')} testid="payer-activate" />}
                <Act label={p.allowUpgrade ? 'Tắt nâng hạng' : 'Bật nâng hạng'} onDo={() => patch({ allowUpgrade: !p.allowUpgrade }, 'Đã cập nhật.')} testid="payer-upgrade" />
                <Act label={p.sharedRoomPolicy === 'SHARED' ? 'Chuyển phòng riêng' : 'Chuyển ghép phòng'} onDo={() => patch({ sharedRoomPolicy: p.sharedRoomPolicy === 'SHARED' ? 'PRIVATE' : 'SHARED' }, 'Đã cập nhật.')} testid="payer-policy" />
              </div>
            )}
          </section>
          <Stations id={id} manage={manage} />
          <Staff id={id} manage={manage} />
        </>
      )}</LoadView>
    </>
  );
}

export default function AdminPayers() {
  const manage = hasPerm(useApp().state.session, PERM.ADMIN_PAYER_MANAGE);
  const [q, setQ] = useState({});
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const p = usePaged('/payers', q, 'after');
  if (open) return <Detail id={open} manage={manage} onBack={() => { setOpen(null); p.reload(); }} />;
  return (
    <>
      <PageHeader title="Đơn vị chi trả" description="Hãng bay, đơn vị mặt đất, sân bay trả tiền phòng cho khách delay"
        actions={manage && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} data-testid="payer-new">Tạo đơn vị</button>} />
      {creating && <CreateForm onDone={p.reload} onClose={() => setCreating(false)} />}
      <Filters fields={[['status', 'Trạng thái', 'text', Object.entries(PAYER_STATUS).map(([k, [t]]) => [k, t])]]} onApply={setQ} />
      <DataTable empty="Chưa có đơn vị chi trả nào." {...pagedProps(p)}
        columns={cols([['Mã', (r) => r.code], ['Tên', (r) => r.name], ['Loại', (r) => PAYER_KIND[r.kind] || r.kind], ['Trạng thái', (r) => <Tag map={PAYER_STATUS} v={r.status} />], ['Tạo lúc', (r) => dt(r.createdAt)],
          ['', (r) => <button type="button" className="btn btn-sm" onClick={() => setOpen(r.id)} data-testid="payer-open">Chi tiết</button>]])} />
    </>
  );
}
