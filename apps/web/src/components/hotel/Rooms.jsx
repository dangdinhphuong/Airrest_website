import React, { useState } from 'react';
import { ErrorBox, Field, Loading, ScreenTitle } from '../Common';
import { Pill } from '../partner/ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { money } from '../../lib/time';
import { ApiError } from '@airrest/api-client';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { ConfirmButton, useAction, useLoad } from './kit';

const HOURLY_EMPTY = { enabled: false, firstHourVnd: '120000', nextHourVnd: '70000', minHours: '1', maxHours: '8', cleaningMin: '30', openFromHour: '', openToHour: '' };
const EMPTY = { code: '', name: '', capacity: '2', beds: '1', areaM2: '0', totalRooms: '1', baseNightVnd: '500000', hourly: HOURLY_EMPTY };
const hourlyInitial = (h) => (h ? { enabled: !!h.enabled, firstHourVnd: String(h.firstHourVnd ?? 120000), nextHourVnd: String(h.nextHourVnd ?? 70000), minHours: String(h.minHours ?? 1), maxHours: String(h.maxHours ?? 8), cleaningMin: String(h.cleaningMin ?? 30), openFromHour: h.openFromHour == null ? '' : String(h.openFromHour), openToHour: h.openToHour == null ? '' : String(h.openToHour) } : HOURLY_EMPTY);
// Cấu hình giờ gửi lên backend: tắt thì chỉ { enabled: false } (giữ giá đã nhập trong form, không gửi).
const hourlyBody = (h) => (h.enabled ? { enabled: true, firstHourVnd: Number(h.firstHourVnd), nextHourVnd: Number(h.nextHourVnd), minHours: Number(h.minHours), maxHours: Number(h.maxHours), cleaningMin: Number(h.cleaningMin), ...(h.openFromHour !== '' && { openFromHour: Number(h.openFromHour) }), ...(h.openToHour !== '' && { openToHour: Number(h.openToHour) }) } : { enabled: false });
const hourlyText = (h) => (h?.enabled ? `${money(h.firstHourVnd)} giờ đầu + ${money(h.nextHourVnd)}/giờ (${h.minHours}-${h.maxHours} giờ)` : 'Không');
const NUM = ['capacity', 'beds', 'areaM2', 'totalRooms', 'baseNightVnd'];

function RoomForm({ initial, editing, busy, onSubmit, onCancel }) {
  const [v, setV] = useState(initial);
  const setH = (k) => (e) => setV({ ...v, hourly: { ...v.hourly, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });
  const set = (k) => (e) => setV({ ...v, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = { ...v, ...Object.fromEntries(NUM.map((k) => [k, Number(v[k])])), hourly: hourlyBody(v.hourly) };
    if (editing) delete body.code;
    else if (!v.hourly.enabled) delete body.hourly;
    onSubmit(body);
  };
  return (
    <form className="card" onSubmit={submit} data-testid="room-form">
      <h3>{editing ? `Sửa loại phòng ${initial.code}` : 'Thêm loại phòng'}</h3>
      <div className="grid-2">
        {!editing && <Field id="rt-code" label="Mã (2-8 chữ hoa/số)"><input id="rt-code" value={v.code} onChange={set('code')} maxLength={8} required data-testid="rt-code" /></Field>}
        <Field id="rt-name" label="Tên"><input id="rt-name" value={v.name} onChange={set('name')} required minLength={2} data-testid="rt-name" /></Field>
        <Field id="rt-cap" label="Sức chứa (người)"><input id="rt-cap" type="number" min="1" max="10" value={v.capacity} onChange={set('capacity')} data-testid="rt-capacity" /></Field>
        <Field id="rt-beds" label="Số giường"><input id="rt-beds" type="number" min="1" max="10" value={v.beds} onChange={set('beds')} data-testid="rt-beds" /></Field>
        <Field id="rt-area" label="Diện tích (m²)"><input id="rt-area" type="number" min="0" max="500" value={v.areaM2} onChange={set('areaM2')} data-testid="rt-area" /></Field>
        <Field id="rt-total" label="Tổng số phòng"><input id="rt-total" type="number" min="0" max="500" value={v.totalRooms} onChange={set('totalRooms')} data-testid="rt-total" /></Field>
        <Field id="rt-price" label="Giá cơ bản mỗi đêm (VND)"><input id="rt-price" type="number" min="1000" max="100000000" step="1000" value={v.baseNightVnd} onChange={set('baseNightVnd')} data-testid="rt-price" /></Field>
      </div>
      <fieldset className="card" data-testid="rt-hourly" style={{ marginTop: 12 }}>
        <legend>Đặt theo giờ (nhà nghỉ)</legend>
        <label><input type="checkbox" checked={v.hourly.enabled} onChange={setH('enabled')} data-testid="rt-hourly-on" /> Cho đặt theo giờ</label>
        {v.hourly.enabled && (
          <div className="grid-2">
            <Field id="rt-h-first" label="Giá giờ đầu (VND)"><input id="rt-h-first" type="number" min="1000" step="1000" required value={v.hourly.firstHourVnd} onChange={setH('firstHourVnd')} data-testid="rt-h-first" /></Field>
            <Field id="rt-h-next" label="Giá mỗi giờ tiếp theo (VND)"><input id="rt-h-next" type="number" min="0" step="1000" required value={v.hourly.nextHourVnd} onChange={setH('nextHourVnd')} data-testid="rt-h-next" /></Field>
            <Field id="rt-h-min" label="Số giờ tối thiểu"><input id="rt-h-min" type="number" min="1" max="24" required value={v.hourly.minHours} onChange={setH('minHours')} data-testid="rt-h-min" /></Field>
            <Field id="rt-h-max" label="Số giờ tối đa"><input id="rt-h-max" type="number" min="1" max="24" required value={v.hourly.maxHours} onChange={setH('maxHours')} data-testid="rt-h-max" /></Field>
            <Field id="rt-h-clean" label="Phút dọn phòng giữa hai lượt"><input id="rt-h-clean" type="number" min="0" max="240" required value={v.hourly.cleaningMin} onChange={setH('cleaningMin')} data-testid="rt-h-clean" /></Field>
            <Field id="rt-h-open" label="Bán từ giờ (0-24, bỏ trống = cả ngày)"><input id="rt-h-open" type="number" min="0" max="24" value={v.hourly.openFromHour} onChange={setH('openFromHour')} data-testid="rt-h-open" /></Field>
            <Field id="rt-h-close" label="Bán đến giờ (0-24, bỏ trống = cả ngày)"><input id="rt-h-close" type="number" min="0" max="24" value={v.hourly.openToHour} onChange={setH('openToHour')} data-testid="rt-h-close" /></Field>
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

// /v1/hotel/room-types: danh sách, tạo, sửa, ngừng bán (DELETE = retire).
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
  return (
    <>
      <ScreenTitle title="Loại phòng và giá">Thay đổi giá và số phòng chỉ áp dụng cho đơn đặt sau đó.</ScreenTitle>
      <div className="filter-bar">
        <label><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} data-testid="rt-retired" /> Hiện cả loại đã ngừng bán</label>
        {manage && <button className="btn btn-sm btn-primary" type="button" onClick={() => setForm({})} data-testid="rt-new">Thêm loại phòng</button>}
      </div>
      {act.note}
      {form && <RoomForm key={form.id || 'new'} editing={!!form.id} busy={act.busy} onCancel={() => setForm(null)} onSubmit={save}
        initial={form.id ? { code: form.code, name: form.name, capacity: String(form.capacity), beds: String(form.beds), areaM2: String(form.areaM2), totalRooms: String(form.totalRooms), baseNightVnd: String(form.pricing.baseNightVnd), hourly: hourlyInitial(form.pricing.hourly) } : EMPTY} />}
      {l.loading && <Loading />}
      {l.err && <ErrorBox onRetry={l.reload}>{describeError(l.err)}</ErrorBox>}
      {l.data && !l.loading && (l.data.items.length === 0 ? <p className="muted" data-testid="empty">Chưa có loại phòng nào.</p> : (
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Mã</th><th>Tên</th><th>Sức chứa</th><th>Giường</th><th>m²</th><th>Số phòng</th><th>Giá/đêm</th><th>Giá theo giờ</th><th>Trạng thái</th>{manage && <th />}</tr></thead>
          <tbody>{l.data.items.map((t) => (
            <tr key={t.id} data-testid="rt-row">
              <td data-label="Mã"><strong>{t.code}</strong></td><td data-label="Tên">{t.name}</td><td data-label="Sức chứa">{t.capacity}</td><td data-label="Giường">{t.beds}</td>
              <td data-label="m²">{t.areaM2}</td><td data-label="Số phòng">{t.totalRooms}</td><td data-label="Giá/đêm">{money(t.pricing.baseNightVnd)}</td><td data-label="Giá theo giờ" data-testid="rt-hourly-cell">{hourlyText(t.pricing.hourly)}</td>
              <td data-label="Trạng thái">{t.retiredAt || t.active === false ? <Pill>Ngừng bán</Pill> : <Pill tone="ok">Đang bán</Pill>}</td>
              {manage && <td>{t.retiredAt || t.active === false ? <ConfirmButton label="Bán lại" ask="Mở bán lại loại phòng này?" disabled={act.busy} testid="rt-resell" onConfirm={() => resell(t)} /> : <div className="row-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-sm" type="button" onClick={() => setForm(t)} data-testid="rt-edit">Sửa</button>
                <ConfirmButton label="Ngừng bán" tone="danger" ask="Ngừng bán loại phòng này?" disabled={act.busy} testid="rt-retire" onConfirm={() => retire(t)} />
              </div>}</td>}
            </tr>
          ))}</tbody>
        </table></div>
      ))}
    </>
  );
}
