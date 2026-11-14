import React, { useRef, useState } from 'react';
import { ErrorBox, Field, Loading, ScreenTitle } from '../Common';
import { Pill, SubTabs } from '../partner/ui';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { ConfirmButton, useAction, useLoad } from './kit';
import { Avatar, vi, viText } from './fleetKit';
import Select from '../Select';

const MAX_SIDE = 512;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Nén ảnh ở trình duyệt: cạnh dài tối đa 512px, chất lượng ~0.85, giữ định dạng gốc.
async function compress(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, file.type, 0.85));
  if (!blob) throw new Error('Không xử lý được ảnh này, hãy chọn ảnh khác.');
  return blob;
}
// R2: xin upload-url -> PUT tệp -> trả khóa ảnh để PATCH/POST tài xế.
async function uploadPhoto(file) {
  const blob = await compress(file);
  const up = await H.requestUploadUrl({ folder: 'drivers', contentType: blob.type, size: blob.size });
  const r = await fetch(up.uploadUrl, { method: up.method || 'PUT', headers: up.headers || { 'Content-Type': blob.type }, body: blob });
  if (!r.ok) throw Object.assign(new Error('Tải ảnh lên kho thất bại, vui lòng thử lại.'), { code: 'UPLOAD_FAILED' });
  return up.key;
}

function VehicleForm({ initial, drivers, busy, onSubmit, onCancel }) {
  const [v, setV] = useState(initial);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const editing = !!initial.id;
  return (
    <form className="card" data-testid="vehicle-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ plate: v.plate, seats: Number(v.seats), model: v.model, active: v.active, ...(editing ? { driverId: v.driverId || null } : v.driverId ? { driverId: v.driverId } : {}) }); }}>
      <h3>{editing ? `Sửa xe ${initial.plate}` : 'Thêm xe'}</h3>
      <div className="grid-2">
        <Field id="vh-plate" label="Biển số"><input id="vh-plate" value={v.plate} onChange={set('plate')} required minLength={4} data-testid="vh-plate" /></Field>
        <Field id="vh-seats" label="Số chỗ (không gồm tài xế)"><input id="vh-seats" type="number" min="1" max="50" value={v.seats} onChange={set('seats')} required data-testid="vh-seats" /></Field>
        <Field id="vh-model" label="Loại xe (tùy chọn)"><input id="vh-model" value={v.model} onChange={set('model')} maxLength={100} data-testid="vh-model" /></Field>
        <Field id="vh-driver" label="Tài xế phụ trách">
          <Select id="vh-driver" value={v.driverId} onChange={set('driverId')} data-testid="vh-driver">
            <option value="">Chưa gán tài xế</option>
            {drivers.map((d) => <option key={d.accountId} value={d.accountId}>{d.fullName}{d.vehicleId && d.vehicleId !== initial.id ? ' (đang gán xe khác)' : ''}</option>)}
          </Select>
        </Field>
      </div>
      <label><input type="checkbox" checked={v.active} onChange={set('active')} data-testid="vh-active" /> Đang hoạt động</label>
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy} data-testid="vh-save">{editing ? 'Lưu thay đổi' : 'Tạo xe'}</button>
        <button className="btn" type="button" onClick={onCancel}>Đóng</button>
      </div>
    </form>
  );
}

function Vehicles({ vehicles, drivers, reload }) {
  const act = useAction();
  const [form, setForm] = useState(null);
  const save = async (body) => {
    const id = form.id;
    if (await act.run(vi(() => (id ? H.patchVehicle(id, body) : H.createVehicle(body))), id ? 'Đã lưu xe.' : 'Đã tạo xe.')) { setForm(null); reload(); }
  };
  return (
    <>
      <div className="filter-bar"><button className="btn btn-sm btn-primary" type="button" onClick={() => setForm({ plate: '', seats: '4', model: '', active: true, driverId: '' })} data-testid="vh-new">Thêm xe</button></div>
      {act.note}
      {form && <VehicleForm key={form.id || 'new'} initial={form} drivers={drivers} busy={act.busy} onCancel={() => setForm(null)} onSubmit={save} />}
      {!vehicles.length ? <p className="muted" data-testid="empty">Chưa có xe nào.</p> : (
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Biển số</th><th>Số chỗ</th><th>Loại xe</th><th>Tài xế</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{vehicles.map((v) => (
            <tr key={v.id} data-testid="vh-row">
              <td data-label="Biển số"><strong>{v.plate}</strong></td><td data-label="Số chỗ">{v.seats}</td><td data-label="Loại xe">{v.model || ''}</td>
              <td data-label="Tài xế">{v.driver ? <span className="who"><Avatar name={v.driver.name} url={v.driver.photoUrl} size={28} />{v.driver.name}</span> : <span className="muted">Chưa gán</span>}</td>
              <td data-label="Trạng thái">{v.active ? <Pill tone="ok">Hoạt động</Pill> : <Pill>Ngừng</Pill>}</td>
              <td><div className="row-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-sm" onClick={() => setForm({ id: v.id, plate: v.plate, seats: String(v.seats), model: v.model || '', active: v.active, driverId: v.driver?.accountId || '' })} data-testid="vh-edit">Sửa</button>
                {v.driver && <ConfirmButton label="Bỏ tài xế" ask="Bỏ gán tài xế khỏi xe này?" disabled={act.busy} testid="vh-unassign" onConfirm={async () => { if (await act.run(vi(() => H.patchVehicle(v.id, { driverId: null })), 'Đã bỏ gán tài xế.')) reload(); }} />}
                <ConfirmButton label="Ngừng / xóa" tone="danger" ask="Xe chưa có chuyến sẽ bị xóa, xe đã có chuyến sẽ chuyển sang ngừng hoạt động. Tiếp tục?" disabled={act.busy} testid="vh-del"
                  onConfirm={async () => { if (await act.run(vi(() => H.deleteVehicle(v.id)), (r) => (r.deleted ? 'Đã xóa xe.' : 'Xe đã có lịch sử chuyến nên được chuyển sang ngừng hoạt động.'))) reload(); }} />
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

function DriverForm({ initial, vehicles, busy, onSubmit, onCancel }) {
  const editing = !!initial.accountId;
  const [v, setV] = useState(initial);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);
  const [up, setUp] = useState(false);
  const input = useRef(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const pick = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!TYPES.includes(f.type)) { setMsg('Chỉ nhận ảnh jpg, png hoặc webp.'); return; }
    setMsg(null); setFile(f); setPreview(URL.createObjectURL(f));
  };
  const submit = async (e) => {
    e.preventDefault(); setMsg(null);
    const body = { fullName: v.fullName, phone: v.phone };
    if (editing) { body.active = v.active; body.vehicleId = v.vehicleId || null; if (v.password) body.password = v.password; } else { body.email = v.email; body.password = v.password; if (v.vehicleId) body.vehicleId = v.vehicleId; }
    if (file) {
      setUp(true);
      try { body.photoKey = await uploadPhoto(file); } catch (err) {
        setUp(false); setFile(null); setPreview(null);
        setMsg(err?.code === 'STORAGE_NOT_CONFIGURED' ? 'Kho ảnh chưa được cấu hình, có thể lưu tài xế không ảnh.' : err?.code === 'UPLOAD_FAILED' ? err.message : err instanceof TypeError ? 'Không kết nối được kho ảnh, có thể lưu tài xế không ảnh.' : err?.status ? viText(err) : (err?.message || 'Không tải được ảnh.'));
        return;
      }
      setUp(false);
    }
    onSubmit(body);
  };
  return (
    <form className="card" onSubmit={submit} data-testid="driver-form" autoComplete="off">
      <h3>{editing ? `Sửa tài xế ${initial.fullName}` : 'Thêm tài xế'}</h3>
      <div className="driver-photo">
        <Avatar name={v.fullName || '?'} url={preview || initial.photoUrl} size={72} />
        <div>
          <button type="button" className="btn btn-sm" onClick={() => input.current?.click()} disabled={up} data-testid="dr-photo-pick">{up ? 'Đang tải ảnh…' : 'Chọn ảnh'}</button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} data-testid="dr-photo" />
          <small className="muted block">jpg, png hoặc webp; tự thu nhỏ còn tối đa 512px.</small>
          {msg && <small className="field-error block" role="alert" data-testid="dr-photo-error">{msg}</small>}
        </div>
      </div>
      <div className="grid-2">
        {!editing && <Field id="dr-email" label="Email đăng nhập"><input id="dr-email" type="email" value={v.email} onChange={set('email')} required autoComplete="off" data-testid="dr-email" /></Field>}
        <Field id="dr-name" label="Họ tên"><input id="dr-name" value={v.fullName} onChange={set('fullName')} required minLength={2} data-testid="dr-name" /></Field>
        <Field id="dr-phone" label="Số điện thoại"><input id="dr-phone" value={v.phone} onChange={set('phone')} required inputMode="tel" data-testid="dr-phone" /></Field>
        <Field id="dr-pw" label={editing ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu ban đầu (tối thiểu 12 ký tự)'} hint="Mật khẩu chỉ hiển thị khi nhập, hệ thống không hiện lại sau khi lưu.">
          <input id="dr-pw" type="password" value={v.password} onChange={set('password')} required={!editing} minLength={12} autoComplete="new-password" data-testid="dr-pw" />
        </Field>
        <Field id="dr-veh" label="Xe được gán (tùy chọn)">
          <Select id="dr-veh" value={v.vehicleId} onChange={set('vehicleId')} data-testid="dr-vehicle">
            <option value="">Chưa gán xe</option>
            {vehicles.filter((x) => x.active).map((x) => <option key={x.id} value={x.id} disabled={!!x.driver && x.driver.accountId !== initial.accountId}>{x.plate} · {x.seats} chỗ{x.driver && x.driver.accountId !== initial.accountId ? ` (đã có ${x.driver.name})` : ''}</option>)}
          </Select>
        </Field>
      </div>
      {editing && <label><input type="checkbox" checked={v.active} onChange={set('active')} data-testid="dr-active" /> Cho phép đăng nhập và nhận chuyến (bỏ chọn = khóa)</label>}
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || up} data-testid="dr-save">{editing ? 'Lưu thay đổi' : 'Tạo tài xế'}</button>
        <button className="btn" type="button" onClick={onCancel}>Đóng</button>
      </div>
    </form>
  );
}

function Drivers({ drivers, vehicles, reload }) {
  const act = useAction();
  const [form, setForm] = useState(null);
  const plateOf = (id) => vehicles.find((x) => x.id === id)?.plate;
  const save = async (body) => {
    const id = form.accountId;
    if (await act.run(vi(() => (id ? H.patchDriver(id, body) : H.createDriver(body))), id ? 'Đã lưu tài xế.' : 'Đã tạo tài xế.')) { setForm(null); reload(); }
  };
  return (
    <>
      <div className="filter-bar"><button className="btn btn-sm btn-primary" type="button" onClick={() => setForm({ email: '', password: '', fullName: '', phone: '', vehicleId: '' })} data-testid="dr-new">Thêm tài xế</button></div>
      {act.note}
      {form && <DriverForm key={form.accountId || 'new'} initial={form} vehicles={vehicles} busy={act.busy} onCancel={() => setForm(null)} onSubmit={save} />}
      {!drivers.length ? <p className="muted" data-testid="empty">Chưa có tài xế nào.</p> : (
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Tài xế</th><th>SĐT</th><th>Email</th><th>Xe</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{drivers.map((d) => (
            <tr key={d.accountId} data-testid="dr-row">
              <td data-label="Tài xế"><span className="who"><Avatar name={d.fullName} url={d.photoUrl} size={32} />{d.fullName}</span></td>
              <td data-label="SĐT">{d.phone}</td><td data-label="Email">{d.email}</td>
              <td data-label="Xe">{plateOf(d.vehicleId) || <span className="muted">Chưa gán</span>}</td>
              <td data-label="Trạng thái">{d.active ? <Pill tone="ok">Hoạt động</Pill> : <Pill tone="error">Đã khóa</Pill>}</td>
              <td><div className="row-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-sm" onClick={() => setForm({ accountId: d.accountId, fullName: d.fullName, phone: d.phone, photoUrl: d.photoUrl, password: '', vehicleId: d.vehicleId || '', active: d.active })} data-testid="dr-edit">Sửa</button>
                <ConfirmButton label={d.active ? 'Khóa' : 'Mở khóa'} ask={d.active ? 'Khóa tài khoản tài xế này?' : 'Mở khóa tài xế này?'} disabled={act.busy} testid="dr-toggle" onConfirm={async () => { if (await act.run(vi(() => H.patchDriver(d.accountId, { active: !d.active })), d.active ? 'Đã khóa tài xế.' : 'Đã mở khóa tài xế.')) reload(); }} />
                <ConfirmButton label="Xóa" tone="danger" ask="Tài xế chưa có chuyến sẽ bị xóa hẳn, đã có chuyến sẽ bị khóa để giữ lịch sử. Tiếp tục?" disabled={act.busy} testid="dr-del"
                  onConfirm={async () => { if (await act.run(vi(() => H.deleteDriver(d.accountId)), (r) => (r.deleted ? 'Đã xóa tài xế.' : 'Tài xế đã có lịch sử chuyến nên được khóa và ngừng hoạt động.'))) reload(); }} />
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

// /v1/hotel/vehicles + /v1/hotel/drivers (fleet:manage).
export default function Fleet() {
  const [tab, setTab] = useState('vehicles');
  const veh = useLoad(() => H.listVehicles(), []);
  const drv = useLoad(() => H.listDrivers(), []);
  const reload = () => { veh.reload(); drv.reload(); };
  const err = veh.err || drv.err;
  return (
    <>
      <ScreenTitle title="Đội xe">Xe và tài xế của khách sạn. Tài xế đăng nhập bằng email và mật khẩu ban đầu bạn đặt.</ScreenTitle>
      <SubTabs label="Đội xe" value={tab} onChange={setTab} tabs={[['vehicles', 'Xe'], ['drivers', 'Tài xế']]} />
      {(veh.loading || drv.loading) && !veh.data && <Loading />}
      {err && <ErrorBox onRetry={reload}>{describeError(err)}</ErrorBox>}
      {veh.data && drv.data && (tab === 'vehicles'
        ? <Vehicles vehicles={veh.data.items} drivers={drv.data.items} reload={reload} />
        : <Drivers drivers={drv.data.items} vehicles={veh.data.items} reload={reload} />)}
    </>
  );
}
