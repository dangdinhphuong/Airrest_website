import React, { useState } from 'react';
import { EmptyBox, Field, Notice } from '../Common';
import { Kpi, LockedList, Pill, PROFILE_TONE } from './ui';
import { DAYS, PICKUP_FAIL_REASONS, PICKUP_LABEL, PICKUP_NEXT, PROFILE_STATUS, createApplication, dayInventory, dayLabel, exportCsv, maskName, setPickupStatus, submitProfile, typesOf, updateProfile, updateProperty, usePartner } from '../../mock/partner';
import { can } from '../../lib/rbac';
import { fmtTime } from '../../lib/time';

const HOUR = (h) => `${String(h % 24).padStart(2, '0')}:00${h >= 24 ? ' (hôm sau)' : ''}`;
const SHUTTLE = { none: 'Không có xe đưa đón', paid: 'Có xe đưa đón (có phí)', free: 'Có xe đưa đón miễn phí' };
const PTYPES = ['Khách sạn', 'Nhà nghỉ', 'Căn hộ', 'Hộp ngủ', 'Phòng theo giờ'];
const REQ_LABEL = { name: 'Tên', address: 'Địa chỉ', contact: 'Liên hệ', type: 'Loại hình', lat: 'Vĩ độ', lng: 'Kinh độ' };

function ProfileForm({ id, pr, session, simNow, isApp, onDone }) {
  const [f, setF] = useState({ name: pr.name, type: pr.type, address: pr.address, contact: pr.contact, amenities: pr.amenities, lat: String(pr.lat ?? ''), lng: String(pr.lng ?? '') });
  const [msg, setMsg] = useState(null); const [missing, setMissing] = useState([]);
  const canU = can(session.role, 'partner', 'U'); const canS = can(session.role, 'partner', 'S'); const isStaff = session.role === 'staff';
  const editable = ['Draft', 'NeedsInfo', 'Rejected', 'Active'].includes(pr.status);
  const set = (k, v) => { setF({ ...f, [k]: v }); setMsg(null); };
  const save = (e) => {
    e.preventDefault();
    const r = updateProfile(id, { ...f, lat: f.lat === '' ? '' : Number(f.lat), lng: f.lng === '' ? '' : Number(f.lng) }, session, simNow);
    setMsg(r.ok ? { ok: true, text: `Đã lưu hồ sơ.${r.note ? ' ' + r.note : ''}` } : { ok: false, text: r.error }); setMissing([]);
  };
  const submit = () => { const r = submitProfile(id, session, simNow); if (!r.ok) { setMsg({ ok: false, text: r.error }); setMissing(r.missing || []); } else { setMsg({ ok: true, text: 'Đã gửi duyệt.' }); setMissing([]); } onDone?.(); };
  return (
    <form className="card" onSubmit={save} noValidate data-testid={isApp ? 'app-form' : 'profile-form'}>
      <div className="card-head"><h2>{isApp ? `Hồ sơ mới ${id}` : 'Hồ sơ đối tác'}</h2><Pill tone={PROFILE_TONE[pr.status]} data-testid="profile-status">{PROFILE_STATUS[pr.status]}</Pill></div>
      {pr.reason && <Notice tone="warn" title={pr.status === 'Rejected' ? 'Bị từ chối' : pr.status === 'NeedsInfo' ? 'Cần bổ sung' : 'Ghi chú'}><span data-testid="profile-reason">{pr.reason}</span></Notice>}
      <div className="grid-2">
        <Field id={`pf-name-${id}`} label="Tên"><input id={`pf-name-${id}`} value={f.name} disabled={!canU || !editable || isStaff} onChange={(e) => set('name', e.target.value)} data-testid="pf-name" /></Field>
        <Field id={`pf-type-${id}`} label="Loại hình"><select id={`pf-type-${id}`} value={f.type} disabled={!canU || !editable || isStaff} onChange={(e) => set('type', e.target.value)} data-testid="pf-type">{PTYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field id={`pf-addr-${id}`} label="Địa chỉ"><input id={`pf-addr-${id}`} value={f.address} disabled={!canU || !editable || isStaff} onChange={(e) => set('address', e.target.value)} data-testid="pf-address" /></Field>
        <Field id={`pf-contact-${id}`} label="Liên hệ (kênh do PO cho phép, OQ-50)"><input id={`pf-contact-${id}`} value={f.contact} disabled={!canU || !editable} onChange={(e) => set('contact', e.target.value)} data-testid="pf-contact" /></Field>
        <Field id={`pf-lat-${id}`} label="Vĩ độ"><input id={`pf-lat-${id}`} inputMode="decimal" value={f.lat} disabled={!canU || !editable || isStaff} onChange={(e) => set('lat', e.target.value)} data-testid="pf-lat" /></Field>
        <Field id={`pf-lng-${id}`} label="Kinh độ"><input id={`pf-lng-${id}`} inputMode="decimal" value={f.lng} disabled={!canU || !editable || isStaff} onChange={(e) => set('lng', e.target.value)} data-testid="pf-lng" /></Field>
      </div>
      <Field id={`pf-am-${id}`} label="Tiện ích (cách nhau bằng dấu phẩy)"><input id={`pf-am-${id}`} value={f.amenities} disabled={!canU || !editable} onChange={(e) => set('amenities', e.target.value)} data-testid="pf-amenities" /></Field>
      {isStaff && <p className="muted">Nhân viên chỉ sửa trường vận hành (liên hệ, tiện ích); tên, địa chỉ, loại hình do chủ/quản lý sửa (HM-BR-003).</p>}
      {missing.length > 0 && <p className="field-error" role="alert" data-testid="profile-missing">Thiếu trường bắt buộc: {missing.map((m) => REQ_LABEL[m]).join(', ')}.</p>}
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="profile-msg">{msg.text}</p>}
      <div className="row-actions">
        {canU && editable && <button type="submit" className="btn btn-primary" data-testid="save-profile-info">Lưu hồ sơ</button>}
        {canS && ['Draft', 'NeedsInfo', 'Rejected'].includes(pr.status) && <button type="button" className="btn" onClick={submit} data-testid="submit-profile">Gửi duyệt</button>}
      </div>
    </form>
  );
}
const History = ({ list }) => (list.length ? (
  <div className="table-wrap"><table className="rights-table" data-testid="profile-history"><thead><tr><th>Lúc</th><th>Người</th><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead>
    <tbody>{list.map((h, i) => <tr key={i}><td data-label="Lúc">{fmtTime(h.at)}</td><td data-label="Người">{h.who}</td><td data-label="Trường">{h.field}</td><td data-label="Trước">{String(h.before ?? '—')}</td><td data-label="Sau">{String(h.after ?? '—')}</td></tr>)}</tbody></table></div>
) : <p className="muted" data-testid="profile-history-empty">Chưa có thay đổi hồ sơ nào. Lịch sử chỉ thêm, không sửa hoặc xóa.</p>);

// HM-FR-001…003, 005 (HM-FR-004 chờ OQ-51): hồ sơ đối tác, hồ sơ mới ở trạng thái nháp, gửi duyệt, lịch sử.
export function ProfileTab({ p, session, simNow }) {
  const P = usePartner();
  const prof = p ? P.profiles[p.id] : null;
  const apps = P.applications.filter((id) => P.profiles[id].ownerId === session.id);
  const [form, setForm] = useState({ airport: 'HAN', name: '', type: PTYPES[0], address: '', contact: '', lat: '', lng: '', amenities: 'Wifi' });
  const [err, setErr] = useState({}); const [created, setCreated] = useState(null);
  const canC = can(session.role, 'partner', 'C');
  const create = (e) => {
    e.preventDefault(); const er = {};
    if (!form.name.trim()) er.name = 'Nhập tên cơ sở.';
    if (!form.address.trim()) er.address = 'Nhập địa chỉ.';
    if (P.applications.some((id) => P.profiles[id].name.trim().toLowerCase() === form.name.trim().toLowerCase()) || Object.values(P.profiles).some((x) => !x.isApplication && x.name.trim().toLowerCase() === form.name.trim().toLowerCase())) er.name = 'Đã có hồ sơ cùng tên (nghi trùng, HM-BR-001).';
    setErr(er); setCreated(null); if (Object.keys(er).length) return;
    setCreated(createApplication({ ...form, lat: form.lat === '' ? '' : Number(form.lat), lng: form.lng === '' ? '' : Number(form.lng) }, session, simNow));
    setForm({ ...form, name: '' });
  };
  const [adv, setAdv] = useState(null);
  return (
    <>
      {prof && <ProfileForm key={p.id} id={p.id} pr={prof} session={session} simNow={simNow} />}
      {prof && <><h3>Lịch sử thay đổi hồ sơ</h3><History list={prof.history} /></>}
      {p && can(session.role, 'partner', 'U') && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); updateProperty(p.id, adv, session, simNow, 'Cập nhật hồ sơ cơ sở'); }} data-testid="ops-form">
          <h2>Thông tin vận hành hiển thị cho người dùng cuối</h2>
          <OpsFields p={p} onChange={setAdv} />
        </form>
      )}
      {canC && (
        <>
          <h2>Hồ sơ đối tác mới</h2>
          <p className="muted">Tạo hồ sơ ở trạng thái Nháp, gửi duyệt khi đủ trường bắt buộc. Sau khi Airrest duyệt, cơ sở xuất hiện cho người dùng cuối.</p>
          {apps.map((id) => <div key={id} data-testid="app-card" data-id={id}><ProfileForm id={id} pr={P.profiles[id]} session={session} simNow={simNow} isApp /></div>)}
          <form className="card" onSubmit={create} noValidate data-testid="new-app-form">
            <h2>Tạo hồ sơ mới</h2>
            <div className="grid-2">
              <Field id="na-name" label="Tên cơ sở" error={err.name}><input id="na-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="na-name" /></Field>
              <Field id="na-ap" label="Sân bay"><select id="na-ap" value={form.airport} onChange={(e) => setForm({ ...form, airport: e.target.value })}><option value="HAN">Nội Bài (HAN)</option><option value="SGN">Tân Sơn Nhất (SGN)</option></select></Field>
              <Field id="na-type" label="Loại hình"><select id="na-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{PTYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field id="na-addr" label="Địa chỉ" error={err.address}><input id="na-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="na-address" /></Field>
              <Field id="na-contact" label="Liên hệ"><input id="na-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} data-testid="na-contact" /></Field>
              <Field id="na-lat" label="Vĩ độ"><input id="na-lat" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} data-testid="na-lat" /></Field>
              <Field id="na-lng" label="Kinh độ"><input id="na-lng" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} data-testid="na-lng" /></Field>
            </div>
            <button type="submit" className="btn btn-primary" data-testid="create-app">Tạo bản nháp</button>
            {created && <p className="ok-line" role="status" data-testid="app-created">Đã tạo hồ sơ {created} ở trạng thái Nháp.</p>}
          </form>
        </>
      )}
      <LockedList area="hotel" tab="profile" />
    </>
  );
}

function OpsFields({ p, onChange }) {
  const [f, setF] = useState({ closeExtHour: p.closeExtHour, reception24: p.reception24, freeCancel: p.freeCancel, payAtProperty: p.payAtProperty, shuttle: p.shuttle });
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { const n = { ...f, [k]: v }; setF(n); onChange({ ...n, closeExtHour: Number(n.closeExtHour) }); setSaved(false); };
  React.useEffect(() => { onChange({ ...f, closeExtHour: Number(f.closeExtHour) }); /* eslint-disable-next-line */ }, []);
  return (
    <>
      <Field id="h-close" label="Giờ nhận khách cuối" hint="Dùng khi cơ sở không có lễ tân 24/24."><select id="h-close" value={f.closeExtHour} onChange={(e) => set('closeExtHour', e.target.value)} data-testid="input-close">{[22, 23, 24, 25, 26].map((h) => <option key={h} value={h}>{HOUR(h)}</option>)}</select></Field>
      <label className="check"><input type="checkbox" checked={f.reception24} onChange={(e) => set('reception24', e.target.checked)} data-testid="input-24h" /> Lễ tân 24/24</label>
      <label className="check"><input type="checkbox" checked={f.freeCancel} onChange={(e) => set('freeCancel', e.target.checked)} /> Huỷ miễn phí (hiển thị; chính sách hủy chờ OQ-46)</label>
      <label className="check"><input type="checkbox" checked={f.payAtProperty} onChange={(e) => set('payAtProperty', e.target.checked)} /> Cho trả tại nơi nghỉ</label>
      <Field id="h-shuttle" label="Xe đưa đón"><select id="h-shuttle" value={f.shuttle} onChange={(e) => set('shuttle', e.target.value)} data-testid="input-shuttle">{Object.entries(SHUTTLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <button type="submit" className="btn btn-primary" onClick={() => setSaved(true)} data-testid="save-profile">Lưu thông tin vận hành</button>
      {saved && <p className="ok-line" role="status" data-testid="saved-note">Đã lưu (mô phỏng).</p>}
    </>
  );
}

// HM-FR-039 (xem). HM-FR-040, 041 chờ OQ-56, OQ-57.
export function QualityTab({ p }) {
  const { quality } = usePartner(); const mine = quality.filter((q) => q.propertyId === p.id);
  return (
    <>
      {mine.length ? (
        <div className="table-wrap"><table className="rights-table" data-testid="quality-table"><thead><tr><th>Mã</th><th>Phân loại</th><th>Mô tả</th><th>Đặt phòng</th><th>Trạng thái</th></tr></thead>
          <tbody>{mine.map((q) => <tr key={q.id} data-testid="quality-row"><td data-label="Mã">{q.id}</td><td data-label="Phân loại">{q.category}</td><td data-label="Mô tả">{q.desc}</td><td data-label="Đặt phòng">{q.bookingCode || '—'}</td><td data-label="Trạng thái"><Pill tone="warn">Đang mở</Pill></td></tr>)}</tbody></table></div>
      ) : <EmptyBox title="Chưa có sự cố chất lượng">Sự cố do Airrest ghi nhận (hết phòng dù đã xác nhận, sai giá…) sẽ hiện ở đây. Chưa có điểm số hay xếp hạng tự động (OQ-56).</EmptyBox>}
      <LockedList area="hotel" tab="quality" />
    </>
  );
}

// HM-FR-045…047, 049: báo cáo yêu cầu/đặt phòng, tồn phòng và công suất, hiệu suất phản hồi, xuất theo quyền.
export function ReportsTab({ p, session, simNow }) {
  const { bookings } = usePartner(); const mine = bookings.filter((b) => b.propertyId === p.id);
  const [reason, setReason] = useState('Báo cáo nội bộ'); const [msg, setMsg] = useState(null);
  const by = (s) => mine.filter((b) => b.status === s).length; const total = mine.length;
  const pct = (n) => (total ? `${Math.round((n / total) * 100)}%` : 'không áp dụng');
  const decided = mine.filter((b) => b.decidedAt != null); const avg = decided.length ? Math.round(decided.reduce((a, b) => a + (b.decidedAt - b.createdAt), 0) / decided.length) : null;
  const types = typesOf(p.id).filter((t) => t.status !== 'retired');
  const occ = Array.from({ length: DAYS }, (_, i) => { let booked = 0; let denom = 0; types.forEach((t) => { const d = dayInventory(p.id, t.id, i); booked += d.booked; denom += d.physical - d.unavailable; }); return { i, booked, denom, rate: denom > 0 ? Math.round((booked / denom) * 100) : null }; });
  const canE = can(session.role, 'report', 'E'); const canV = can(session.role, 'sensitive', 'V');
  const doExport = () => { const r = exportCsv(session, simNow, `dat-phong-${p.id}`, ['Mã', 'Tên gọi', 'Loại phòng', 'Ngày', 'Trạng thái', 'Giá'], mine.map((b) => [b.code, canV ? b.name : maskName(b.name), b.typeId, dayLabel(b.dayIdx), b.status, b.price]), reason); setMsg(r.ok ? { ok: true, text: `Đã xuất ${r.count} bản ghi.` } : { ok: false, text: r.error }); };
  return (
    <>
      <p className="muted">Công thức: tỷ lệ = số đặt phòng theo trạng thái / tổng đặt phòng; công suất = đã đặt / (phòng vật lý − không khả dụng); thời gian phản hồi = giờ quyết định − giờ gửi (phút mô phỏng). Múi giờ và tiền tệ theo mặc định Việt Nam (OQ-60 chờ xác nhận). Chỉ gồm dữ liệu của khách sạn mình.</p>
      <Kpi items={[['Tổng đặt phòng', total, 'rp-total'], ['Đã xác nhận', `${by('confirmed')} (${pct(by('confirmed'))})`, 'rp-confirmed'], ['Chờ xác nhận', `${by('pending')} (${pct(by('pending'))})`, 'rp-pending'], ['Đã từ chối', `${by('rejected')} (${pct(by('rejected'))})`, 'rp-rejected'], ['Phản hồi trung bình', avg == null ? 'chưa có dữ liệu' : `${avg} phút`, 'rp-resp']]} />
      <div className="table-wrap"><table className="rights-table" data-testid="occupancy-table"><thead><tr><th>Ngày</th><th>Đã đặt</th><th>Phòng khả dụng cơ sở</th><th>Công suất</th></tr></thead>
        <tbody>{occ.map((o) => <tr key={o.i}><td data-label="Ngày">{dayLabel(o.i)}</td><td data-label="Đã đặt">{o.booked}</td><td data-label="Phòng khả dụng cơ sở">{o.denom}</td><td data-label="Công suất">{o.rate == null ? 'không áp dụng' : `${o.rate}%`}</td></tr>)}</tbody></table></div>
      {canE ? (
        <div className="card">
          <h2>Xuất dữ liệu</h2>
          <p className="muted">Xuất là thao tác nhạy cảm: cần quyền riêng, lý do và được ghi audit. Tên gọi được che nếu vai trò không có quyền xem rõ.</p>
          <div className="inline-form"><label className="sr-only" htmlFor="ex-r">Lý do xuất</label><select id="ex-r" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="export-reason">{['Báo cáo nội bộ', 'Đối soát', 'Yêu cầu kiểm toán'].map((r) => <option key={r}>{r}</option>)}</select>
            <button type="button" className="btn btn-primary" onClick={doExport} data-testid="export-csv">Xuất CSV đặt phòng</button></div>
          {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="export-msg">{msg.text}</p>}
        </div>
      ) : <p className="muted" data-testid="no-export">Vai trò này không có quyền xuất dữ liệu.</p>}
      <LockedList area="hotel" tab="reports" />
    </>
  );
}

// HM-FR-035 (Blocked D-26): giữ bản mô phỏng đã có; chỉ cập nhật trạng thái, không bản đồ hay định vị.
export function PickupsTab({ p, session, simNow }) {
  const { pickups } = usePartner(); const list = pickups.filter((x) => x.propertyId === p.id); const [fail, setFail] = useState({});
  const NEXT = { waiting: 'accepted', accepted: 'enroute', enroute: 'picked', picked: 'done' }; const canU = can(session.role, 'pickup', 'U');
  return (
    <>
      <Notice tone="warn" title="Đề xuất, chờ D-26">Chức năng đón khách mâu thuẫn MB-15 “gọi xe” đã loại; đang giữ bản mô phỏng tối thiểu (chỉ trạng thái, không bản đồ, không định vị).</Notice>
      {!list.length ? <EmptyBox title="Chưa có yêu cầu đón">Yêu cầu đón của người dùng cuối sẽ xuất hiện ở đây (mô phỏng).</EmptyBox> : (
        <div className="pickup-list">
          {list.map((x) => {
            const active = !['done', 'failed'].includes(x.status);
            return (
              <article key={x.id} className="card pickup-card" data-testid="pickup-card" data-id={x.id}>
                <div className="card-head"><h3>{x.name} <small>· {x.bookingCode}{x.seed ? ' (mẫu)' : ''}</small></h3><Pill tone={x.status === 'done' ? 'ok' : x.status === 'failed' ? 'error' : 'info'} data-testid="pickup-pill">{PICKUP_LABEL[x.status]}</Pill></div>
                <p className="muted">Sân bay {x.airport} · giờ đón dự kiến {fmtTime(x.etaMin)} · cập nhật lúc {fmtTime(x.updatedAt)} (mô phỏng){x.reason ? ` · ${x.reason}` : ''}</p>
                {active && canU && (
                  <div className="row-actions">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setPickupStatus(x.id, NEXT[x.status], null, session, simNow)} data-testid="pickup-next">{PICKUP_NEXT[x.status]}</button>
                    {x.status !== 'picked' && (
                      <span className="inline-form">
                        <label className="sr-only" htmlFor={`pf-${x.id}`}>Lý do không đón được</label>
                        <select id={`pf-${x.id}`} value={fail[x.id] || PICKUP_FAIL_REASONS[0]} onChange={(e) => setFail({ ...fail, [x.id]: e.target.value })} data-testid="pickup-fail-reason">{PICKUP_FAIL_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                        <button type="button" className="btn btn-sm" onClick={() => setPickupStatus(x.id, 'failed', fail[x.id] || PICKUP_FAIL_REASONS[0], session, simNow)} data-testid="pickup-fail">Không đón được</button>
                      </span>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
