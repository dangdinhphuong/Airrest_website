import React, { useState } from 'react';
import { ErrorBox, Field, Loading, ScreenTitle } from '../Common';
import { Pill, ReasonAction } from '../partner/ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { ConfirmButton, ListState, fmtDT, needReason, today, useAction, useLoad, usePaged } from './kit';

const KIND = { LOCK: 'Khóa bán', MAINTENANCE: 'Bảo trì' };

function Days({ roomTypeId, from, to }) {
  const d = useLoad(() => H.getInventory(roomTypeId, from, to), [roomTypeId, from, to]);
  if (d.loading) return <Loading />;
  if (d.err) return <ErrorBox onRetry={d.reload}>{describeError(d.err)}</ErrorBox>;
  return (
    <div className="table-wrap"><table className="rights-table" data-testid="inv-table">
      <thead><tr><th>Ngày</th><th>Tổng</th><th>Đang giữ</th><th>Đã đặt</th><th>Khóa</th><th>Bán được</th></tr></thead>
      <tbody>{d.data.days.map((x) => (
        <tr key={x.date} data-testid="inv-row"><td data-label="Ngày">{x.date}</td><td data-label="Tổng">{x.physical}</td><td data-label="Đang giữ">{x.held}</td><td data-label="Đã đặt">{x.booked}</td><td data-label="Khóa">{x.blocked}</td><td data-label="Bán được"><strong>{x.sellable}</strong></td></tr>
      ))}</tbody>
    </table></div>
  );
}

function BlockForm({ types, onDone, act }) {
  const [v, setV] = useState({ roomTypeId: types[0]?.id || '', kind: 'LOCK', qty: '', from: '', to: '', reason: '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = { roomTypeId: v.roomTypeId, kind: v.kind, reason: v.reason, from: new Date(v.from).toISOString(), to: new Date(v.to).toISOString() };
    if (v.qty !== '') body.qty = Number(v.qty);
    if (await act.run(() => H.createBlock(body), 'Đã tạo khóa phòng.')) onDone();
  };
  return (
    <form className="card" onSubmit={submit} data-testid="block-form">
      <h3>Khóa / bảo trì phòng</h3>
      <div className="grid-2">
        <Field id="bl-type" label="Loại phòng"><select id="bl-type" value={v.roomTypeId} onChange={set('roomTypeId')} data-testid="bl-type">{types.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</select></Field>
        <Field id="bl-kind" label="Kiểu"><select id="bl-kind" value={v.kind} onChange={set('kind')} data-testid="bl-kind">{Object.entries(KIND).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
        <Field id="bl-from" label="Từ"><input id="bl-from" type="datetime-local" value={v.from} onChange={set('from')} required data-testid="bl-from" /></Field>
        <Field id="bl-to" label="Đến"><input id="bl-to" type="datetime-local" value={v.to} min={v.from || undefined} onChange={set('to')} required data-testid="bl-to" /></Field>
        <Field id="bl-qty" label="Số phòng" hint="Để trống = khóa toàn bộ phòng còn trống (không đụng đơn đang có)"><input id="bl-qty" type="number" min="1" max="500" value={v.qty} onChange={set('qty')} data-testid="bl-qty" /></Field>
        <Field id="bl-reason" label="Lý do (bắt buộc)"><input id="bl-reason" value={v.reason} onChange={set('reason')} required minLength={3} maxLength={200} data-testid="bl-reason" /></Field>
      </div>
      <button className="btn btn-primary" type="submit" disabled={act.busy || !types.length} data-testid="bl-save">Tạo khóa</button>
    </form>
  );
}

// Tồn phòng theo ngày (GET room-types/:id/inventory) + khóa/bảo trì (/v1/hotel/room-blocks).
export default function Inventory() {
  const { state } = useApp();
  const manage = hasPerm(state.session, PERM.ROOM_MANAGE);
  const types = useLoad(() => H.listRoomTypes(false), []);
  const [rt, setRt] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today(13));
  const [onlyActive, setOnlyActive] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const act = useAction();
  const items = types.data?.items || [];
  const typeId = rt || items[0]?.id;
  const span = (Date.parse(to) - Date.parse(from)) / 86400000;
  const rangeErr = to < from ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' : span >= 62 ? 'Tối đa 62 ngày.' : '';
  const blocks = usePaged((cursor) => H.listBlocks({ active: onlyActive, cursor }), [onlyActive]);
  const name = (id) => items.find((t) => t.id === id)?.code || '?';
  return (
    <>
      <ScreenTitle title="Tồn phòng" kicker="Khách sạn">Số phòng bán được theo ngày và các đợt khóa/bảo trì.</ScreenTitle>
      {types.loading && <Loading />}
      {types.err && <ErrorBox onRetry={types.reload}>{describeError(types.err)}</ErrorBox>}
      {types.data && !items.length && <p className="muted" data-testid="empty">Chưa có loại phòng nào.</p>}
      {items.length > 0 && <>
        <div className="filter-bar">
          <select aria-label="Loại phòng" value={typeId} onChange={(e) => setRt(e.target.value)} data-testid="inv-type">{items.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</select>
          <label>Từ <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="inv-from" /></label>
          <label>Đến <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="inv-to" /></label>
        </div>
        {rangeErr ? <p className="field-error" role="alert">{rangeErr}</p> : <Days roomTypeId={typeId} from={from} to={to} />}
      </>}

      <h2>Khóa / bảo trì</h2>
      <div className="filter-bar">
        <label><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} data-testid="bl-active" /> Chỉ khóa còn hiệu lực</label>
        {manage && items.length > 0 && <button className="btn btn-sm btn-primary" type="button" onClick={() => setShowForm(!showForm)} data-testid="bl-new">Tạo khóa phòng</button>}
      </div>
      {act.note}
      {showForm && manage && <BlockForm types={items} act={act} onDone={() => { setShowForm(false); blocks.reload(); }} />}
      <ListState list={blocks} empty="Không có khóa phòng nào.">
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Loại</th><th>Kiểu</th><th>Số phòng</th><th>Từ</th><th>Đến</th><th>Lý do</th><th>Trạng thái</th>{manage && <th />}</tr></thead>
          <tbody>{blocks.items.map((b) => (
            <tr key={b.id} data-testid="bl-row">
              <td data-label="Loại">{name(b.roomTypeId)}</td><td data-label="Kiểu">{KIND[b.kind]}</td><td data-label="Số phòng">{b.qty}</td>
              <td data-label="Từ">{fmtDT(b.startsAt)}</td><td data-label="Đến">{fmtDT(b.endsAt)}</td><td data-label="Lý do">{b.reason}</td>
              <td data-label="Trạng thái">{b.releasedAt ? <Pill>Đã gỡ</Pill> : <Pill tone="warn">Đang khóa</Pill>}</td>
              {manage && <td>{!b.releasedAt && <ConfirmButton label="Gỡ khóa" ask="Gỡ khóa này?" disabled={act.busy} testid="bl-release" onConfirm={async () => { if (await act.run(() => H.releaseBlock(b.id), 'Đã gỡ khóa phòng.')) blocks.reload(); }} />}</td>}
            </tr>
          ))}</tbody>
        </table></div>
      </ListState>
    </>
  );
}
