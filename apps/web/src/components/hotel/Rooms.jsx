import React, { useState } from 'react';
import { ConfirmAction, DataTable, FormField, Modal, PageHeader, Tag, Toolbar } from '../ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { money } from '../../lib/time';
import { ApiError } from '@airrest/api-client';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { useAction, useLoad } from './kit';
import ImagePicker from './ImagePicker';
import RoomUnits from './RoomUnits';
import { AMENITIES, MAX_ROOM_TYPE_IMAGES } from './roomLogic';

const HOURLY_EMPTY = { enabled: false, firstHourVnd: '120000', nextHourVnd: '70000', minHours: '1', maxHours: '8', cleaningMin: '30', openFromHour: '', openToHour: '' };
const EMPTY = { code: '', name: '', capacity: '2', beds: '1', areaM2: '0', totalRooms: '1', baseNightVnd: '500000', nonRefundablePct: '', hourly: HOURLY_EMPTY, description: '', view: '', amenities: [], smoking: false, maxAdults: '', maxChildren: '', images: [] };
const hourlyInitial = (h) => (h ? { enabled: !!h.enabled, firstHourVnd: String(h.firstHourVnd ?? 120000), nextHourVnd: String(h.nextHourVnd ?? 70000), minHours: String(h.minHours ?? 1), maxHours: String(h.maxHours ?? 8), cleaningMin: String(h.cleaningMin ?? 30), openFromHour: h.openFromHour == null ? '' : String(h.openFromHour), openToHour: h.openToHour == null ? '' : String(h.openToHour) } : HOURLY_EMPTY);
// Cấu hình giờ gửi lên backend: tắt thì chỉ { enabled: false } (giữ giá đã nhập trong form, không gửi).
const hourlyBody = (h) => (h.enabled ? { enabled: true, firstHourVnd: Number(h.firstHourVnd), nextHourVnd: Number(h.nextHourVnd), minHours: Number(h.minHours), maxHours: Number(h.maxHours), cleaningMin: Number(h.cleaningMin), ...(h.openFromHour !== '' && { openFromHour: Number(h.openFromHour) }), ...(h.openToHour !== '' && { openToHour: Number(h.openToHour) }) } : { enabled: false });
const hourlyText = (h) => (h?.enabled ? `${money(h.firstHourVnd)} giờ đầu + ${money(h.nextHourVnd)}/giờ (${h.minHours}-${h.maxHours} giờ)` : 'Không');
const NUM = ['capacity', 'beds', 'areaM2', 'totalRooms', 'baseNightVnd'];

function RoomForm({ initial, editing, managed, busy, onSubmit, onCancel }) {
  const [v, setV] = useState(initial);
  const setH = (k) => (e) => setV({ ...v, hourly: { ...v.hourly, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });
  const set = (k) => (e) => setV({ ...v, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = { ...v, ...Object.fromEntries(NUM.map((k) => [k, Number(v[k])])), hourly: hourlyBody(v.hourly), images: v.images.map((i) => i.key), description: v.description.trim(), view: v.view.trim() };
    for (const k of ['maxAdults', 'maxChildren', 'nonRefundablePct']) body[k] = v[k] === '' ? null : Number(v[k]);
    if (editing) delete body.code;
    else {
      if (!v.hourly.enabled) delete body.hourly;
      for (const k of ['description', 'view', 'maxAdults', 'maxChildren', 'nonRefundablePct']) if (body[k] === null || body[k] === '') delete body[k];
    }
    if (managed) delete body.totalRooms; // do danh sách phòng quản lý
    onSubmit(body);
  };
  return (
    <form onSubmit={submit} data-testid="room-form">
      <div className="grid-2">
        {!editing && <FormField id="rt-code" label="Mã (2-8 chữ hoa/số)"><input id="rt-code" value={v.code} onChange={set('code')} maxLength={8} required data-testid="rt-code" /></FormField>}
        <FormField id="rt-name" label="Tên"><input id="rt-name" value={v.name} onChange={set('name')} required minLength={2} data-testid="rt-name" /></FormField>
        <FormField id="rt-cap" label="Sức chứa (người)"><input id="rt-cap" type="number" min="1" max="10" value={v.capacity} onChange={set('capacity')} data-testid="rt-capacity" /></FormField>
        <FormField id="rt-beds" label="Số giường"><input id="rt-beds" type="number" min="1" max="10" value={v.beds} onChange={set('beds')} data-testid="rt-beds" /></FormField>
        <FormField id="rt-area" label="Diện tích (m²)"><input id="rt-area" type="number" min="0" max="500" value={v.areaM2} onChange={set('areaM2')} data-testid="rt-area" /></FormField>
        <FormField id="rt-total" label="Tổng số phòng"><input id="rt-total" type="number" min="0" max="500" value={v.totalRooms} onChange={set('totalRooms')} disabled={managed} data-testid="rt-total" />{managed && <small className="muted" data-testid="rt-total-managed">Do danh sách phòng quản lý (= số phòng đang dùng). Thêm/ngừng/xóa phòng ở khu "Tầng và danh sách phòng".</small>}</FormField>
        <FormField id="rt-price" label="Giá cơ bản mỗi đêm (VND)"><input id="rt-price" type="number" min="1000" max="100000000" step="1000" value={v.baseNightVnd} onChange={set('baseNightVnd')} data-testid="rt-price" /></FormField>
        <FormField id="rt-nr" label="Giảm giá mức Không hoàn hủy (%, 1-50)" hint="Để trống = không bán mức này. Khách chọn mức này sẽ không được hoàn tiền khi hủy."><input id="rt-nr" type="number" min="1" max="50" value={v.nonRefundablePct} onChange={set('nonRefundablePct')} data-testid="rt-nr" /></FormField>
        <FormField id="rt-view" label="Hướng nhìn"><input id="rt-view" value={v.view} onChange={set('view')} maxLength={100} data-testid="rt-view" /></FormField>
        <FormField id="rt-adults" label="Người lớn tối đa"><input id="rt-adults" type="number" min="1" max="10" value={v.maxAdults} onChange={set('maxAdults')} data-testid="rt-adults" /></FormField>
        <FormField id="rt-children" label="Trẻ em tối đa"><input id="rt-children" type="number" min="0" max="10" value={v.maxChildren} onChange={set('maxChildren')} data-testid="rt-children" /></FormField>
        <label><input type="checkbox" checked={v.smoking} onChange={(e) => setV({ ...v, smoking: e.target.checked })} data-testid="rt-smoking" /> Cho phép hút thuốc</label>
      </div>
      <FormField id="rt-desc" label="Mô tả (tối đa 2000 ký tự)"><textarea id="rt-desc" rows={3} maxLength={2000} value={v.description} onChange={set('description')} data-testid="rt-desc" /></FormField>
      <fieldset className="card" data-testid="rt-amenities">
        <legend>Tiện nghi</legend>
        {Object.entries(AMENITIES).map(([code, label]) => (
          <label key={code} style={{ marginRight: 14, display: 'inline-block' }}><input type="checkbox" checked={v.amenities.includes(code)} onChange={(e) => setV({ ...v, amenities: e.target.checked ? [...v.amenities, code] : v.amenities.filter((x) => x !== code) })} data-testid={`rt-amen-${code}`} /> {label}</label>
        ))}
      </fieldset>
      <h4>Ảnh loại phòng</h4>
      <ImagePicker items={v.images} max={MAX_ROOM_TYPE_IMAGES} onChange={(images) => setV({ ...v, images })} disabled={busy} />
      <fieldset className="card" data-testid="rt-hourly" style={{ marginTop: 12 }}>
        <legend>Đặt theo giờ (nhà nghỉ)</legend>
        <label><input type="checkbox" checked={v.hourly.enabled} onChange={setH('enabled')} data-testid="rt-hourly-on" /> Cho đặt theo giờ</label>
        {v.hourly.enabled && (
          <div className="grid-2">
            <FormField id="rt-h-first" label="Giá giờ đầu (VND)"><input id="rt-h-first" type="number" min="1000" step="1000" required value={v.hourly.firstHourVnd} onChange={setH('firstHourVnd')} data-testid="rt-h-first" /></FormField>
            <FormField id="rt-h-next" label="Giá mỗi giờ tiếp theo (VND)"><input id="rt-h-next" type="number" min="0" step="1000" required value={v.hourly.nextHourVnd} onChange={setH('nextHourVnd')} data-testid="rt-h-next" /></FormField>
            <FormField id="rt-h-min" label="Số giờ tối thiểu"><input id="rt-h-min" type="number" min="1" max="24" required value={v.hourly.minHours} onChange={setH('minHours')} data-testid="rt-h-min" /></FormField>
            <FormField id="rt-h-max" label="Số giờ tối đa"><input id="rt-h-max" type="number" min="1" max="24" required value={v.hourly.maxHours} onChange={setH('maxHours')} data-testid="rt-h-max" /></FormField>
            <FormField id="rt-h-clean" label="Phút dọn phòng giữa hai lượt"><input id="rt-h-clean" type="number" min="0" max="240" required value={v.hourly.cleaningMin} onChange={setH('cleaningMin')} data-testid="rt-h-clean" /></FormField>
            <FormField id="rt-h-open" label="Bán từ giờ (0-24, bỏ trống = cả ngày)"><input id="rt-h-open" type="number" min="0" max="24" value={v.hourly.openFromHour} onChange={setH('openFromHour')} data-testid="rt-h-open" /></FormField>
            <FormField id="rt-h-close" label="Bán đến giờ (0-24, bỏ trống = cả ngày)"><input id="rt-h-close" type="number" min="0" max="24" value={v.hourly.openToHour} onChange={setH('openToHour')} data-testid="rt-h-close" /></FormField>
          </div>
        )}
        <p className="muted">Giá = giờ đầu + (số giờ − 1) × giá giờ tiếp theo, nhân số phòng. Phút dọn phòng được chặn thêm sau giờ ra.</p>
      </fieldset>
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy} data-testid="rt-save">{editing ? 'Lưu thay đổi' : 'Tạo loại phòng'}</button>
        <button className="btn" type="button" onClick={onCancel}>Đóng</button>
      </div>
    </form>
  );
}

// /api/v1/hotel/room-types: danh sách, tạo, sửa, ngừng bán (DELETE = retire).
export default function Rooms() {
  const { state } = useApp();
  const manage = hasPerm(state.session, PERM.ROOM_MANAGE);
  const [retired, setRetired] = useState(false);
  const [form, setForm] = useState(null); // null | {} (tạo) | roomType (sửa)
  const act = useAction();
  const l = useLoad(() => H.listRoomTypes(retired), [retired]);
  const save = async (body) => {
    const edit = form.id;
    if (await act.run(() => (edit ? H.patchRoomType(form.id, body) : H.createRoomType(body)), edit ? 'Đã lưu loại phòng.' : 'Đã tạo loại phòng.')) { setForm(null); l.reload(); }
  };
  const resell = async (t) => {
    const call = async () => { try { await H.patchRoomType(t.id, { active: true }); } catch (e) { throw e?.code === 'ROOM_TYPE_RETIRED' ? new ApiError(e.status, e.code, 'Loại phòng này đã ngừng dùng hẳn nên hệ thống chưa cho mở bán lại. Hãy tạo loại phòng mới thay thế.') : e; } };
    if (await act.run(call, `Đã bán lại ${t.name}.`)) l.reload();
  };
  const retire = async (t) => { if (await act.run(() => H.retireRoomType(t.id), `Đã ngừng bán ${t.name}.`)) l.reload(); };
  const columns = [
    { key: 'code', header: 'Mã', render: (t) => <strong>{t.code}</strong> },
    { key: 'name', header: 'Tên', render: (t) => <>{t.images?.[0]?.url && <img src={t.images[0].url} alt="" width="40" height="30" style={{ objectFit: 'cover', borderRadius: 4, marginRight: 8, verticalAlign: 'middle' }} />}{t.name}</> },
    { key: 'capacity', header: 'Sức chứa' },
    { key: 'beds', header: 'Giường' },
    { key: 'areaM2', header: 'm²' },
    { key: 'total', header: 'Số phòng', render: (t) => <>{t.totalRooms}{t.managedByRooms && <small className="muted" data-testid="rt-managed"> (theo danh sách phòng)</small>}</> },
    { key: 'price', header: 'Giá/đêm', render: (t) => <>{money(t.pricing.baseNightVnd)}{t.pricing.nonRefundablePct ? <small className="muted" data-testid="rt-nr-cell"> · Không hoàn hủy −{t.pricing.nonRefundablePct}%</small> : null}</> },
    { key: 'hourly', header: 'Giá theo giờ', render: (t) => <span data-testid="rt-hourly-cell">{hourlyText(t.pricing.hourly)}</span> },
    { key: 'status', header: 'Trạng thái', render: (t) => (t.retiredAt || t.active === false ? <Tag>Ngừng bán</Tag> : <Tag tone="ok">Đang bán</Tag>) },
    ...(manage ? [{ key: 'act', header: '', render: (t) => (t.retiredAt || t.active === false
      ? <ConfirmAction label="Bán lại" ask="Mở bán lại loại phòng này?" disabled={act.busy} testid="rt-resell" onConfirm={() => resell(t)} />
      : <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-sm" type="button" onClick={() => setForm(t)} data-testid="rt-edit">Sửa</button>
        <ConfirmAction label="Ngừng bán" tone="danger" ask="Ngừng bán loại phòng này?" disabled={act.busy} testid="rt-retire" onConfirm={() => retire(t)} />
      </div>) }] : []),
  ];
  return (
    <>
      <PageHeader title="Loại phòng và giá" description="Thay đổi giá và số phòng chỉ áp dụng cho đơn đặt sau đó."
        actions={manage && <button className="btn btn-primary" type="button" onClick={() => setForm({})} data-testid="rt-new">Thêm loại phòng</button>} />
      <Toolbar><label><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} data-testid="rt-retired" /> Hiện cả loại đã ngừng bán</label></Toolbar>
      {act.note}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Sửa loại phòng ${form.code}` : 'Thêm loại phòng'} size="lg">
        {form && <RoomForm key={form.id || 'new'} editing={!!form.id} managed={!!form.managedByRooms} busy={act.busy} onCancel={() => setForm(null)} onSubmit={save}
          initial={form.id ? { code: form.code, name: form.name, capacity: String(form.capacity), beds: String(form.beds), areaM2: String(form.areaM2), totalRooms: String(form.totalRooms), baseNightVnd: String(form.pricing.baseNightVnd), nonRefundablePct: String(form.pricing.nonRefundablePct ?? ''), hourly: hourlyInitial(form.pricing.hourly), description: form.description || '', view: form.view || '', amenities: form.amenities || [], smoking: !!form.smoking, maxAdults: form.maxAdults == null ? '' : String(form.maxAdults), maxChildren: form.maxChildren == null ? '' : String(form.maxChildren), images: form.images || [] } : EMPTY} />}
      </Modal>
      <DataTable columns={columns} rows={l.data?.items || []} loading={l.loading} error={l.err && describeError(l.err)} onRetry={l.reload} rowTestid="rt-row"
        emptyTitle="Chưa có loại phòng" empty="Chưa có loại phòng nào." />
      <RoomUnits types={l.data?.items || []} manage={manage} onChanged={l.reload} />
    </>
  );
}
