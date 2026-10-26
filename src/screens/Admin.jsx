import React, { useState } from 'react';
import { Activity, Building2, FileText, SlidersHorizontal, Users } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM, SIM_LIMITS, resetSimParams, setSimParam, validateSimParam } from '../config/simulation';
import { PICKUP_LABEL, ROLE_LABEL, accountLabel, activeBookingsOf, addAccount, addProperty, allProperties, logConfig, propertyName, setAccountLocked, setLocked, usePartner } from '../mock/partner';
import { REQ_STATUS, deriveRequest } from '../lib/request';
import { fmtTime, money } from '../lib/time';
import { EmptyBox, Field, Notice, ScreenTitle, SimBadge } from '../components/Common';
import Tabs from '../components/Tabs';
import { Denied, NeedLogin } from './Hotel';

const TYPES = ['Khách sạn', 'Nhà nghỉ', 'Căn hộ', 'Hộp ngủ', 'Phòng theo giờ'];

// M11 — Khu vực quản trị: cơ sở, tài khoản, nội dung và tham số, giám sát, nhật ký (FR-030…FR-034). Ngoài MVP, Proposed.
export default function Admin() {
  const { state, dispatch } = useApp();
  usePartner();
  if (!state.session) return <NeedLogin dispatch={dispatch} />;
  if (state.session.role !== 'admin') return <Denied dispatch={dispatch} session={state.session} target="hotel" />;
  return <AdminWork session={state.session} simNow={state.simNow} request={state.request} flight={state.flight} />;
}

function AdminWork({ session, simNow, request, flight }) {
  const [tab, setTab] = useState('properties');
  const tabs = [
    { id: 'properties', label: 'Cơ sở', icon: <Building2 size={16} aria-hidden="true" /> },
    { id: 'accounts', label: 'Tài khoản', icon: <Users size={16} aria-hidden="true" /> },
    { id: 'config', label: 'Nội dung và tham số', icon: <SlidersHorizontal size={16} aria-hidden="true" /> },
    { id: 'monitor', label: 'Giám sát', icon: <Activity size={16} aria-hidden="true" /> },
    { id: 'log', label: 'Nhật ký và thống kê', icon: <FileText size={16} aria-hidden="true" /> },
  ];
  return (
    <>
      <ScreenTitle kicker={`Quản trị · ${session.id} · Mô phỏng`} title="Khu vực quản trị" />
      <Notice tone="info" title="Môi trường mô phỏng">Thay đổi chỉ có hiệu lực trong phiên này, không có giao dịch thật và được ghi nhật ký. <SimBadge>Mô phỏng</SimBadge></Notice>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Chức năng quản trị" />
      {tab === 'properties' && <PropertiesTab session={session} simNow={simNow} />}
      {tab === 'accounts' && <AccountsTab session={session} simNow={simNow} />}
      {tab === 'config' && <ConfigTab session={session} simNow={simNow} />}
      {tab === 'monitor' && <MonitorTab simNow={simNow} request={request} flight={flight} />}
      {tab === 'log' && <LogTab />}
    </>
  );
}

function PropertiesTab({ session, simNow }) {
  const { getProperty } = useApp();
  const { locked } = usePartner();
  const [ap, setAp] = useState('all');
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', airport: 'HAN', type: TYPES[0], price: '450000' });
  const [err, setErr] = useState({});
  const [added, setAdded] = useState(null);
  const list = allProperties().filter((p) => ap === 'all' || p.airport === ap);
  const toggle = (p) => {
    const isLocked = !!locked[p.id];
    if (!isLocked && activeBookingsOf(p.id) > 0 && confirm !== p.id) { setConfirm(p.id); return; }
    setConfirm(null); setLocked(p.id, !isLocked, session, simNow);
  };
  const add = (e) => {
    e.preventDefault();
    const er = {}; const pr = Number(form.price);
    if (!form.name.trim()) er.name = 'Nhập tên cơ sở.';
    else if (form.name.trim().length > 60) er.name = 'Tên cơ sở tối đa 60 ký tự.';
    if (!/^\d+$/.test(form.price.trim()) || pr < 100000 || pr > 20000000) er.price = 'Nhập giá từ 100.000đ đến 20.000.000đ.';
    setErr(er); setAdded(null);
    if (Object.keys(er).length) return;
    setAdded(addProperty({ name: form.name.trim(), airport: form.airport, type: form.type, price: pr }, session, simNow));
    setForm({ ...form, name: '' });
  };
  return (
    <>
      <div className="filter-bar" role="group" aria-label="Lọc theo sân bay">
        {[['all', 'Tất cả'], ['HAN', 'Nội Bài'], ['SGN', 'Tân Sơn Nhất']].map(([k, l]) => <button key={k} type="button" className={`chip ${ap === k ? 'on' : ''}`} aria-pressed={ap === k} onClick={() => setAp(k)}>{l}</button>)}
        <span className="muted">{list.length} cơ sở</span>
      </div>
      <div className="table-wrap">
        <table className="rights-table" data-testid="properties-table">
          <thead><tr><th>Cơ sở</th><th>Sân bay</th><th>Phòng còn</th><th>Giá</th><th>Đặt chỗ đang giữ</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
          <tbody>
            {list.map((p) => {
              const isLocked = !!locked[p.id];
              const o = getProperty(p.id, simNow) || p; // gồm thay đổi của khách sạn
              return (
                <tr key={p.id} data-testid="property-row" data-id={p.id}>
                  <td data-label="Cơ sở"><strong>{o.name}</strong>{o.isNew && <small> (mới)</small>}</td>
                  <td data-label="Sân bay">{o.airport}</td>
                  <td data-label="Phòng còn">{o.roomsLeft}</td>
                  <td data-label="Giá">{money(o.price)}</td>
                  <td data-label="Đặt chỗ đang giữ">{activeBookingsOf(p.id)}</td>
                  <td data-label="Trạng thái"><span className={`pill ${isLocked ? 'pill-error' : 'pill-ok'}`} data-testid="property-status">{isLocked ? 'Tạm khoá' : 'Đang hiển thị'}</span></td>
                  <td data-label="Xử lý">
                    <button type="button" className="btn btn-sm" onClick={() => toggle(p)} data-testid="property-toggle">{isLocked ? 'Kích hoạt' : confirm === p.id ? 'Vẫn khoá' : 'Tạm khoá'}</button>
                    {confirm === p.id && <small className="block warn-line" role="alert" data-testid="lock-warning">Cơ sở có {activeBookingsOf(p.id)} đặt chỗ chưa hoàn tất. Bấm “Vẫn khoá” để xác nhận.</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={add} noValidate>
        <h2>Thêm cơ sở</h2>
        <div className="grid-2">
          <Field id="a-name" label="Tên cơ sở" error={err.name}><input id="a-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="new-name" /></Field>
          <Field id="a-price" label="Giá tổng (đ)" error={err.price}><input id="a-price" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="new-price" /></Field>
          <Field id="a-ap" label="Sân bay"><select id="a-ap" value={form.airport} onChange={(e) => setForm({ ...form, airport: e.target.value })}><option value="HAN">Nội Bài (HAN)</option><option value="SGN">Tân Sơn Nhất (SGN)</option></select></Field>
          <Field id="a-type" label="Loại hình"><select id="a-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <button type="submit" className="btn btn-primary" data-testid="add-property">Thêm cơ sở</button>
        {added && <p className="ok-line" role="status" data-testid="added-note">Đã thêm cơ sở {added}. Cơ sở xuất hiện trong danh sách của người dùng cuối (vị trí là minh họa).</p>}
      </form>
    </>
  );
}

function AccountsTab({ session, simNow }) {
  const { accounts } = usePartner();
  const [form, setForm] = useState({ role: 'manager', propertyId: '' });
  const [err, setErr] = useState('');
  const [added, setAdded] = useState(null);
  const create = (e) => {
    e.preventDefault();
    if (!form.propertyId) { setErr('Chọn cơ sở để gán cho tài khoản.'); return; }
    setErr(''); setAdded(addAccount(form, session, simNow));
  };
  return (
    <>
      <div className="table-wrap">
        <table className="rights-table" data-testid="accounts-table">
          <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Cơ sở</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} data-testid="account-row" data-id={a.id}>
                <td data-label="Tài khoản"><strong>{a.id}</strong></td>
                <td data-label="Vai trò">{ROLE_LABEL[a.role]}</td>
                <td data-label="Cơ sở">{a.propertyId ? propertyName(a.propertyId) : '—'}</td>
                <td data-label="Trạng thái"><span className={`pill ${a.locked ? 'pill-error' : 'pill-ok'}`} data-testid="account-status">{a.locked ? 'Đã khoá' : 'Hoạt động'}</span></td>
                <td data-label="Xử lý">{a.id === session.id ? <small className="muted">Tài khoản đang dùng</small> : <button type="button" className="btn btn-sm" onClick={() => setAccountLocked(a.id, !a.locked, session, simNow)} data-testid="account-toggle">{a.locked ? 'Mở khoá' : 'Khoá'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={create} noValidate>
        <h2>Tạo tài khoản</h2>
        <p className="muted">Chỉ tạo tài khoản khách sạn hoặc lái xe, gán với một cơ sở. Không lưu số điện thoại hay email.</p>
        <div className="grid-2">
          <Field id="ac-role" label="Vai trò"><select id="ac-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="new-role"><option value="manager">Quản lý khách sạn</option><option value="driver">Lái xe</option></select></Field>
          <Field id="ac-prop" label="Cơ sở" error={err}>
            <select id="ac-prop" value={form.propertyId} onChange={(e) => { setForm({ ...form, propertyId: e.target.value }); setErr(''); }} data-testid="new-account-property">
              <option value="">— Chọn cơ sở —</option>{allProperties().map((p) => <option key={p.id} value={p.id}>{p.name} ({p.airport})</option>)}
            </select>
          </Field>
        </div>
        <button type="submit" className="btn btn-primary" data-testid="add-account">Tạo tài khoản</button>
        {added && <p className="ok-line" role="status" data-testid="account-added">Đã tạo tài khoản {added}.</p>}
      </form>
    </>
  );
}

const CONTENT = [
  { name: 'Nội dung quyền lợi (MB-03)', status: 'Chờ PO duyệt', note: 'Bị chặn (D-13): chỉ hiển thị khung tham khảo, không cho bật nội dung cụ thể cho đến khi PO duyệt.', pill: 'pill-warn' },
  { name: 'Câu hỏi thường gặp (MB-10)', status: '3 mục có nguồn', note: 'Nguồn và ngày hiệu lực lấy từ văn bản chính thức; chỉnh sửa cần đối chiếu văn bản hiện hành (D-12).', pill: 'pill-info' },
  { name: 'Tiện ích nhà ga (MB-09)', status: 'Chỉ có vị trí', note: 'HAN 2 vị trí, SGN chưa có; giá và giờ mở chưa có nguồn (D-09).', pill: 'pill-warn' },
];

function ConfigTab({ session, simNow }) {
  const keys = Object.keys(SIM_LIMITS);
  const [vals, setVals] = useState(() => Object.fromEntries(keys.map((k) => [k, String(SIM[k])])));
  const [err, setErr] = useState({});
  const [saved, setSaved] = useState(null);
  const save = (e) => {
    e.preventDefault();
    const er = {};
    keys.forEach((k) => { const raw = vals[k].trim(); const n = /^-?\d+$/.test(raw) ? Number(raw) : NaN; const m = validateSimParam(k, n); if (m) er[k] = m; });
    setErr(er); setSaved(null);
    if (Object.keys(er).length) return;
    const changed = [];
    keys.forEach((k) => { const n = Number(vals[k]); if (SIM[k] !== n) { changed.push(`${k}: ${SIM[k]} → ${n}`); setSimParam(k, n); } });
    if (changed.length) logConfig(session, simNow, 'Sửa tham số mô phỏng', 'SIM', changed.join('; '));
    setSaved(changed.length ? `Đã lưu ${changed.length} thay đổi lúc ${fmtTime(simNow)} (mô phỏng). Có hiệu lực ngay, không cần sửa mã.` : 'Không có thay đổi.');
  };
  const reset = () => { resetSimParams(); setVals(Object.fromEntries(keys.map((k) => [k, String(SIM[k])]))); setErr({}); logConfig(session, simNow, 'Khôi phục tham số mô phỏng mặc định', 'SIM', ''); setSaved('Đã khôi phục giá trị mặc định.'); };
  return (
    <>
      <form className="card" onSubmit={save} noValidate>
        <h2>Tham số mô phỏng</h2>
        <p className="muted">Đây là giả định mô phỏng, chưa được PO phê duyệt. Giờ có mặt không được ít hơn mốc đóng quầy {SIM.counterCloseMin} phút.</p>
        <div className="grid-2">
          {keys.map((k) => (
            <Field key={k} id={`c-${k}`} label={`${SIM_LIMITS[k][3]} (${SIM_LIMITS[k][2]})`} hint={`Từ ${SIM_LIMITS[k][0]} đến ${SIM_LIMITS[k][1]}`} error={err[k]}>
              <input id={`c-${k}`} inputMode="numeric" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} data-testid={`param-${k}`} aria-invalid={!!err[k]} />
            </Field>
          ))}
        </div>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary" data-testid="save-params">Lưu tham số</button>
          <button type="button" className="btn" onClick={reset} data-testid="reset-params">Khôi phục mặc định</button>
        </div>
        {saved && <p className="ok-line" role="status" data-testid="params-saved">{saved}</p>}
      </form>
      <section className="card">
        <h2>Nội dung hiển thị cho người dùng cuối</h2>
        <div className="table-wrap">
          <table className="rights-table">
            <thead><tr><th>Nội dung</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
            <tbody>{CONTENT.map((c) => <tr key={c.name}><td data-label="Nội dung"><strong>{c.name}</strong></td><td data-label="Trạng thái"><span className={`pill ${c.pill}`}>{c.status}</span></td><td data-label="Ghi chú">{c.note}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MonitorTab({ simNow, request, flight }) {
  const { bookings, pickups } = usePartner();
  const [f, setF] = useState('all');
  const bk = bookings.filter((b) => f === 'all' || b.status === f);
  const reqD = request && flight ? deriveRequest(request, flight, simNow) : null;
  return (
    <>
      <div className="filter-bar" role="group" aria-label="Lọc đặt chỗ theo trạng thái">
        {[['all', 'Tất cả'], ['confirmed', 'Đã xác nhận'], ['rejected', 'Đã từ chối']].map(([k, l]) => <button key={k} type="button" className={`chip ${f === k ? 'on' : ''}`} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
      </div>
      <section className="card">
        <h2>Đặt chỗ ({bk.length})</h2>
        {bk.length === 0 ? <p className="muted">Không có đặt chỗ nào.</p> : (
          <div className="table-wrap"><table className="rights-table" data-testid="monitor-bookings">
            <thead><tr><th>Mã</th><th>Cơ sở</th><th>Tên gọi</th><th>Trạng thái</th></tr></thead>
            <tbody>{bk.map((b) => <tr key={b.code}><td data-label="Mã">{b.code}</td><td data-label="Cơ sở">{propertyName(b.propertyId)}</td><td data-label="Tên gọi">{b.name}</td><td data-label="Trạng thái"><span className={`pill ${b.status === 'confirmed' ? 'pill-ok' : 'pill-error'}`}>{b.status === 'confirmed' ? 'Đã xác nhận' : `Đã từ chối: ${b.reason}`}</span></td></tr>)}</tbody>
          </table></div>
        )}
      </section>
      <section className="card">
        <h2>Yêu cầu đón khách ({pickups.length})</h2>
        {pickups.length === 0 ? <p className="muted">Chưa có yêu cầu đón.</p> : (
          <ul className="plain-list" data-testid="monitor-pickups">{pickups.map((x) => <li key={x.id}><strong>{x.id}</strong> · {propertyName(x.propertyId)} · {PICKUP_LABEL[x.status]}</li>)}</ul>
        )}
      </section>
      <section className="card">
        <h2>Yêu cầu hỗ trợ của hãng (luồng L2)</h2>
        {reqD
          ? <p data-testid="monitor-request">Mã <strong>{request.code}</strong> · chuyến {request.flightCode} · {REQ_STATUS[reqD.status]?.label || reqD.status} <small className="muted">(trạng thái đề xuất, hãng là mô phỏng)</small></p>
          : <p className="muted" data-testid="monitor-request">Chưa có yêu cầu hỗ trợ trong phiên này. Yêu cầu do người dùng cuối gửi ở luồng L2 sẽ hiện ở đây; hãng vẫn là tác nhân mô phỏng (D-27).</p>}
      </section>
    </>
  );
}

function LogTab() {
  const { bookings, pickups, accounts, log, locked } = usePartner();
  const [role, setRole] = useState('all');
  const rows = log.filter((l) => role === 'all' || l.role === role);
  const props = allProperties();
  const stats = [
    ['Cơ sở đang hiển thị', props.filter((p) => !locked[p.id]).length],
    ['Cơ sở tạm khoá', props.filter((p) => locked[p.id]).length],
    ['Đặt chỗ đã xác nhận', bookings.filter((b) => b.status === 'confirmed').length],
    ['Đặt chỗ đã từ chối', bookings.filter((b) => b.status === 'rejected').length],
    ['Yêu cầu đón đang xử lý', pickups.filter((x) => !['done', 'failed'].includes(x.status)).length],
    ['Tài khoản hoạt động', accounts.filter((a) => !a.locked).length],
  ];
  return (
    <>
      <dl className="stat-grid" data-testid="stats">{stats.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}</dl>
      <div className="filter-bar" role="group" aria-label="Lọc nhật ký theo vai trò">
        {[['all', 'Tất cả'], ['admin', 'Quản trị'], ['manager', 'Khách sạn'], ['driver', 'Lái xe']].map(([k, l]) => <button key={k} type="button" className={`chip ${role === k ? 'on' : ''}`} aria-pressed={role === k} onClick={() => setRole(k)}>{l}</button>)}
      </div>
      {rows.length === 0 ? <EmptyBox title="Chưa có thao tác nào">Thao tác của khách sạn, lái xe và quản trị sẽ được ghi ở đây. Nhật ký chỉ lưu trong phiên.</EmptyBox> : (
        <div className="table-wrap"><table className="rights-table" data-testid="log-table">
          <thead><tr><th>Lúc</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
          <tbody>{rows.map((l) => <tr key={l.n} data-testid="log-row"><td data-label="Lúc">{fmtTime(l.at)}</td><td data-label="Người thực hiện">{l.who} <small>({ROLE_LABEL[l.role] || l.role})</small></td><td data-label="Thao tác">{l.action}</td><td data-label="Đối tượng">{l.target}</td><td data-label="Chi tiết">{l.detail || '—'}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
