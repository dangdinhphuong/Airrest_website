import React, { useState } from 'react';
import { ConfirmAction, DataTable, ErrorState, FormField, Loading, Modal, Tag, Toolbar } from '../ui';
import Select from '../Select';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { useAction, useLoad } from './kit';
import ImagePicker from './ImagePicker';
import { bulkNumbers, MAX_ROOM_IMAGES } from './roomLogic';

const numOrNull = (v) => (v === '' ? null : Number(v));

function FloorForm({ initial, busy, onSubmit, onCancel }) {
  const [v, setV] = useState(initial);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <form data-testid="floor-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ name: v.name.trim(), level: Number(v.level), note: v.note.trim() }); }}>
      <div className="grid-2">
        <FormField id="fl-name" label="Tên tầng"><input id="fl-name" value={v.name} onChange={set('name')} required maxLength={50} data-testid="fl-name" /></FormField>
        <FormField id="fl-level" label="Số tầng (0 = trệt, âm = hầm)"><input id="fl-level" type="number" min="-5" max="200" value={v.level} onChange={set('level')} required data-testid="fl-level" /></FormField>
        <FormField id="fl-note" label="Ghi chú"><input id="fl-note" value={v.note} onChange={set('note')} maxLength={500} data-testid="fl-note" /></FormField>
      </div>
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy} data-testid="fl-save">Lưu tầng</button>
        <button className="btn" type="button" onClick={onCancel}>Đóng</button>
      </div>
    </form>
  );
}

function RoomForm({ initial, floors, types, busy, onSubmit, onCancel }) {
  const editing = !!initial.id;
  const [v, setV] = useState(initial);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = {
      floorId: v.floorId, roomTypeId: v.roomTypeId, number: v.number.trim(), status: v.status, note: v.note.trim(),
      view: v.view.trim(), maxAdults: numOrNull(v.maxAdults), maxChildren: numOrNull(v.maxChildren),
      smoking: v.smoking === '' ? null : v.smoking === 'yes', images: v.images.map((i) => i.key),
    };
    // Tạo mới: bỏ các ghi đè trống (không gửi null); sửa: null = xóa ghi đè.
    if (!editing) for (const k of ['note', 'view', 'maxAdults', 'maxChildren', 'smoking']) if (body[k] === null || body[k] === '') delete body[k];
    onSubmit(body);
  };
  return (
    <form data-testid="room-unit-form" onSubmit={submit}>
      <div className="grid-2">
        <FormField id="ru-number" label="Số phòng (chữ/số, tối đa 10 ký tự)"><input id="ru-number" value={v.number} onChange={set('number')} required maxLength={10} data-testid="ru-number" /></FormField>
        <FormField id="ru-floor" label="Tầng"><Select id="ru-floor" value={v.floorId} onChange={set('floorId')} required data-testid="ru-floor">{floors.map((f) => <option key={f.id} value={f.id}>{f.name} (tầng {f.level})</option>)}</Select></FormField>
        <FormField id="ru-type" label="Loại phòng"><Select id="ru-type" value={v.roomTypeId} onChange={set('roomTypeId')} required data-testid="ru-type">{types.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</Select></FormField>
        <FormField id="ru-status" label="Trạng thái"><Select id="ru-status" value={v.status} onChange={set('status')} data-testid="ru-status"><option value="ACTIVE">Đang dùng</option><option value="INACTIVE">Ngừng dùng / bảo trì dài hạn</option></Select></FormField>
        <FormField id="ru-view" label="Hướng nhìn (để trống = theo loại)"><input id="ru-view" value={v.view} onChange={set('view')} maxLength={100} data-testid="ru-view" /></FormField>
        <FormField id="ru-smoke" label="Hút thuốc"><Select id="ru-smoke" value={v.smoking} onChange={set('smoking')} data-testid="ru-smoking"><option value="">Theo loại phòng</option><option value="yes">Cho hút thuốc</option><option value="no">Không hút thuốc</option></Select></FormField>
        <FormField id="ru-adults" label="Người lớn tối đa (trống = theo loại)"><input id="ru-adults" type="number" min="1" max="10" value={v.maxAdults} onChange={set('maxAdults')} data-testid="ru-adults" /></FormField>
        <FormField id="ru-children" label="Trẻ em tối đa (trống = theo loại)"><input id="ru-children" type="number" min="0" max="10" value={v.maxChildren} onChange={set('maxChildren')} data-testid="ru-children" /></FormField>
      </div>
      <FormField id="ru-note" label="Ghi chú"><input id="ru-note" value={v.note} onChange={set('note')} maxLength={500} data-testid="ru-note" /></FormField>
      <h4>Ảnh phòng</h4>
      <ImagePicker items={v.images} max={MAX_ROOM_IMAGES} onChange={(images) => setV({ ...v, images })} disabled={busy} />
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy} data-testid="ru-save">{editing ? 'Lưu phòng' : 'Thêm phòng'}</button>
        <button className="btn" type="button" onClick={onCancel}>Đóng</button>
      </div>
    </form>
  );
}

function BulkForm({ floors, types, busy, onSubmit, onCancel }) {
  const [v, setV] = useState({ floorId: floors[0]?.id || '', roomTypeId: types[0]?.id || '', prefix: '', from: '', to: '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const list = bulkNumbers(v.prefix.trim(), v.from, v.to);
  return (
    <form data-testid="room-bulk-form" onSubmit={(e) => { e.preventDefault(); if (list) onSubmit({ floorId: v.floorId, roomTypeId: v.roomTypeId, prefix: v.prefix.trim(), from: Number(v.from), to: Number(v.to) }); }}>
      <div className="grid-2">
        <FormField id="bk-floor" label="Tầng"><Select id="bk-floor" value={v.floorId} onChange={set('floorId')} required data-testid="bk-floor">{floors.map((f) => <option key={f.id} value={f.id}>{f.name} (tầng {f.level})</option>)}</Select></FormField>
        <FormField id="bk-type" label="Loại phòng"><Select id="bk-type" value={v.roomTypeId} onChange={set('roomTypeId')} required data-testid="bk-type">{types.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</Select></FormField>
        <FormField id="bk-prefix" label="Tiền tố (tùy chọn, tối đa 6 ký tự)"><input id="bk-prefix" value={v.prefix} onChange={set('prefix')} maxLength={6} data-testid="bk-prefix" /></FormField>
        <FormField id="bk-from" label="Từ số"><input id="bk-from" type="number" min="0" max="99999" value={v.from} onChange={set('from')} required data-testid="bk-from" /></FormField>
        <FormField id="bk-to" label="Đến số (tối đa 100 phòng)"><input id="bk-to" type="number" min="0" max="99999" value={v.to} onChange={set('to')} required data-testid="bk-to" /></FormField>
      </div>
      <p className={list || (v.from === '' && v.to === '') ? 'muted' : 'field-error'} data-testid="bk-preview">
        {list ? `Sẽ tạo ${list.length} phòng: ${list.length > 6 ? `${list.slice(0, 3).join(', ')} … ${list.slice(-2).join(', ')}` : list.join(', ')}` : v.from === '' && v.to === '' ? 'Nhập dải số phòng.' : 'Dải số không hợp lệ (số cuối >= số đầu, tối đa 100 phòng, số phòng tối đa 10 ký tự).'}
      </p>
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || !list || !v.floorId || !v.roomTypeId} data-testid="bk-save">Tạo phòng</button>
        <button className="btn" type="button" onClick={onCancel}>Đóng</button>
      </div>
    </form>
  );
}

// Tầng + danh sách phòng riêng lẻ. Tồn kho vẫn đếm theo loại: loại có phòng thì Tổng số phòng = số phòng đang dùng.
export default function RoomUnits({ types, manage, onChanged }) {
  const act = useAction();
  const fl = useLoad(() => H.listFloors(), []);
  const rm = useLoad(() => H.listRooms(), []);
  const [form, setForm] = useState(null); // { kind: 'floor'|'room'|'bulk', value }
  const reload = () => { fl.reload(); rm.reload(); onChanged?.(); };
  const run = async (fn, ok, close = true) => { if (await act.run(fn, ok)) { if (close) setForm(null); reload(); } };
  const sellable = types.filter((t) => !t.retiredAt && t.active !== false);
  const floors = fl.data?.items || [];
  const rooms = rm.data?.items || [];
  const typeOf = (id) => types.find((t) => t.id === id);
  const stateRoom = (r) => ({ id: r.id, number: r.number, floorId: r.floorId, roomTypeId: r.roomTypeId, status: r.status, note: r.note || '', view: r.view || '', maxAdults: r.maxAdults == null ? '' : String(r.maxAdults), maxChildren: r.maxChildren == null ? '' : String(r.maxChildren), smoking: r.smoking == null ? '' : r.smoking ? 'yes' : 'no', images: r.images || [] });
  const newRoom = { number: '', floorId: floors[0]?.id || '', roomTypeId: sellable[0]?.id || '', status: 'ACTIVE', note: '', view: '', maxAdults: '', maxChildren: '', smoking: '', images: [] };
  const canAdd = floors.length > 0 && sellable.length > 0;
  const floorCols = [
    { key: 'name', header: 'Tên', render: (f) => <strong>{f.name}</strong> },
    { key: 'level', header: 'Số tầng' },
    { key: 'roomCount', header: 'Số phòng' },
    { key: 'note', header: 'Ghi chú', render: (f) => f.note || '' },
    ...(manage ? [{ key: 'act', header: '', render: (f) => (
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-sm" type="button" onClick={() => setForm({ kind: 'floor', value: { id: f.id, name: f.name, level: String(f.level), note: f.note || '' } })} data-testid="fl-edit">Sửa</button>
        <ConfirmAction label="Xóa" tone="danger" ask="Xóa tầng này? (chỉ xóa được khi không còn phòng)" disabled={act.busy} testid="fl-del" onConfirm={() => run(() => H.deleteFloor(f.id), 'Đã xóa tầng.', false)} />
      </div>
    ) }] : []),
  ];
  const roomCols = [
    { key: 'number', header: 'Số phòng', render: (r) => <strong>{r.number}</strong> },
    { key: 'type', header: 'Loại', render: (r) => typeOf(r.roomTypeId)?.code || '' },
    { key: 'status', header: 'Trạng thái', render: (r) => (r.status === 'ACTIVE' ? <Tag tone="ok">Đang dùng</Tag> : <Tag>Ngừng dùng</Tag>) },
    { key: 'img', header: 'Ảnh', render: (r) => (r.images.length ? r.images[0].url ? <img src={r.images[0].url} alt={`Phòng ${r.number}`} width="48" height="36" style={{ objectFit: 'cover', borderRadius: 6 }} /> : `${r.images.length} ảnh` : '') },
    { key: 'note', header: 'Ghi chú', render: (r) => r.note || '' },
    ...(manage ? [{ key: 'act', header: '', render: (r) => (
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-sm" type="button" onClick={() => setForm({ kind: 'room', value: stateRoom(r) })} data-testid="ru-edit">Sửa</button>
        <ConfirmAction label={r.status === 'ACTIVE' ? 'Ngừng dùng' : 'Dùng lại'} ask={r.status === 'ACTIVE' ? 'Ngừng dùng phòng này? Tổng số phòng của loại sẽ giảm.' : 'Dùng lại phòng này?'} disabled={act.busy} testid="ru-toggle"
          onConfirm={() => run(() => H.patchRoom(r.id, { status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }), 'Đã cập nhật trạng thái phòng.', false)} />
        <ConfirmAction label="Xóa" tone="danger" ask="Xóa hẳn phòng này?" disabled={act.busy} testid="ru-del" onConfirm={() => run(() => H.deleteRoom(r.id), 'Đã xóa phòng.', false)} />
      </div>
    ) }] : []),
  ];
  return (
    <section data-testid="room-units">
      <h2>Tầng và danh sách phòng</h2>
      <p className="muted">Mỗi phòng thuộc một tầng và một loại phòng. Loại phòng đã có phòng thì Tổng số phòng tự bằng số phòng đang dùng. Đơn đặt vẫn tính theo loại phòng, chưa gán vào phòng cụ thể.</p>
      {act.note}
      {(fl.loading || rm.loading) && !fl.data && <Loading />}
      {fl.err && <ErrorState onRetry={fl.reload}>{describeError(fl.err)}</ErrorState>}
      {rm.err && <ErrorState onRetry={rm.reload}>{describeError(rm.err)}</ErrorState>}
      <h3>Tầng</h3>
      <Toolbar end={manage && <button className="btn btn-sm btn-primary" type="button" onClick={() => setForm({ kind: 'floor', value: { name: '', level: '', note: '' } })} data-testid="fl-new">Thêm tầng</button>} />
      {fl.data && <DataTable columns={floorCols} rows={floors} rowTestid="fl-row" emptyTitle="Chưa có tầng" empty="Chưa có tầng nào. Thêm tầng trước khi thêm phòng." />}
      <h3>Danh sách phòng</h3>
      {manage && <Toolbar end={<>
        <button className="btn btn-sm btn-primary" type="button" disabled={!canAdd} onClick={() => setForm({ kind: 'room', value: newRoom })} data-testid="ru-new">Thêm phòng</button>
        <button className="btn btn-sm" type="button" disabled={!canAdd} onClick={() => setForm({ kind: 'bulk' })} data-testid="bk-new">Thêm hàng loạt</button>
      </>}>{!canAdd && <span className="muted">Cần có ít nhất một tầng và một loại phòng đang bán.</span>}</Toolbar>}
      <Modal open={!!form} onClose={() => setForm(null)} size="lg"
        title={form?.kind === 'floor' ? (form.value.id ? 'Sửa tầng' : 'Thêm tầng') : form?.kind === 'bulk' ? 'Thêm phòng hàng loạt' : form?.value?.id ? `Sửa phòng ${form.value.number}` : 'Thêm phòng'}>
        {form?.kind === 'floor' && <FloorForm key={form.value.id || 'new'} initial={form.value} busy={act.busy} onCancel={() => setForm(null)}
          onSubmit={(b) => run(() => (form.value.id ? H.patchFloor(form.value.id, b) : H.createFloor(b)), 'Đã lưu tầng.')} />}
        {form?.kind === 'room' && <RoomForm key={form.value.id || 'new'} initial={form.value} floors={floors} types={form.value.id ? types : sellable} busy={act.busy} onCancel={() => setForm(null)}
          onSubmit={(b) => run(() => (form.value.id ? H.patchRoom(form.value.id, b) : H.createRoom(b)), 'Đã lưu phòng.')} />}
        {form?.kind === 'bulk' && <BulkForm floors={floors} types={sellable} busy={act.busy} onCancel={() => setForm(null)} onSubmit={(b) => run(() => H.createRoomsBulk(b), 'Đã tạo phòng.')} />}
      </Modal>
      {rm.data && (rooms.length === 0 ? <DataTable columns={roomCols} rows={[]} emptyTitle="Chưa có phòng" empty="Chưa có phòng nào." /> : floors.map((f) => {
        const list = rooms.filter((r) => r.floorId === f.id);
        if (!list.length) return null;
        return (
          <div key={f.id} data-testid="ru-floor-group">
            <h4>{f.name} ({list.length} phòng)</h4>
            <DataTable columns={roomCols} rows={list} rowTestid="ru-row" />
          </div>
        );
      }))}
    </section>
  );
}
