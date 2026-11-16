import React, { useState } from 'react';
import { ConfirmAction, DataTable, EmptyState, ErrorState, FilterBar, FormField, Loading, Modal, PageHeader, Tag, Toolbar } from '../ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { fmtDT, today, useAction, useLoad, usePaged } from './kit';
import Select from '../Select';

const KIND = { LOCK: 'Khóa bán', MAINTENANCE: 'Bảo trì' };

function Days({ roomTypeId, from, to }) {
  const d = useLoad(() => H.getInventory(roomTypeId, from, to), [roomTypeId, from, to]);
  return (
    <DataTable testid="inv-table" rowTestid="inv-row" rowKey={(x) => x.date} loading={d.loading} error={d.err && describeError(d.err)} onRetry={d.reload} rows={d.data?.days || []}
      columns={[
        { key: 'date', header: 'Ngày' }, { key: 'physical', header: 'Tổng' }, { key: 'held', header: 'Đang giữ' }, { key: 'booked', header: 'Đã đặt' }, { key: 'blocked', header: 'Khóa' },
        { key: 'sellable', header: 'Bán được', render: (x) => <strong>{x.sellable}</strong> },
      ]} />
  );
}

function BlockForm({ types, onDone, onCancel, act }) {
  const [v, setV] = useState({ roomTypeId: types[0]?.id || '', kind: 'LOCK', qty: '', from: '', to: '', reason: '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = { roomTypeId: v.roomTypeId, kind: v.kind, reason: v.reason, from: new Date(v.from).toISOString(), to: new Date(v.to).toISOString() };
    if (v.qty !== '') body.qty = Number(v.qty);
    if (await act.run(() => H.createBlock(body), 'Đã tạo khóa phòng.')) onDone();
  };
  return (
    <form onSubmit={submit} data-testid="block-form">
      <div className="grid-2">
        <FormField id="bl-type" label="Loại phòng"><Select id="bl-type" value={v.roomTypeId} onChange={set('roomTypeId')} data-testid="bl-type">{types.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</Select></FormField>
        <FormField id="bl-kind" label="Kiểu"><Select id="bl-kind" value={v.kind} onChange={set('kind')} data-testid="bl-kind">{Object.entries(KIND).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></FormField>
        <FormField id="bl-from" label="Từ"><input id="bl-from" type="datetime-local" value={v.from} onChange={set('from')} required data-testid="bl-from" /></FormField>
        <FormField id="bl-to" label="Đến"><input id="bl-to" type="datetime-local" value={v.to} min={v.from || undefined} onChange={set('to')} required data-testid="bl-to" /></FormField>
        <FormField id="bl-qty" label="Số phòng" hint="Để trống = khóa toàn bộ phòng còn trống (không đụng đơn đang có)"><input id="bl-qty" type="number" min="1" max="500" value={v.qty} onChange={set('qty')} data-testid="bl-qty" /></FormField>
        <FormField id="bl-reason" label="Lý do (bắt buộc)"><input id="bl-reason" value={v.reason} onChange={set('reason')} required minLength={3} maxLength={200} data-testid="bl-reason" /></FormField>
      </div>
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={act.busy || !types.length} data-testid="bl-save">Tạo khóa</button>
        <button className="btn" type="button" onClick={onCancel}>Đóng</button>
      </div>
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
  const columns = [
    { key: 'type', header: 'Loại', render: (b) => name(b.roomTypeId) },
    { key: 'kind', header: 'Kiểu', render: (b) => KIND[b.kind] },
    { key: 'qty', header: 'Số phòng' },
    { key: 'from', header: 'Từ', render: (b) => fmtDT(b.startsAt) },
    { key: 'to', header: 'Đến', render: (b) => fmtDT(b.endsAt) },
    { key: 'reason', header: 'Lý do' },
    { key: 'status', header: 'Trạng thái', render: (b) => (b.releasedAt ? <Tag>Đã gỡ</Tag> : <Tag tone="warn">Đang khóa</Tag>) },
    ...(manage ? [{ key: 'act', header: '', render: (b) => !b.releasedAt && <ConfirmAction label="Gỡ khóa" ask="Gỡ khóa này?" disabled={act.busy} testid="bl-release" onConfirm={async () => { if (await act.run(() => H.releaseBlock(b.id), 'Đã gỡ khóa phòng.')) blocks.reload(); }} /> }] : []),
  ];
  return (
    <>
      <PageHeader title="Tồn phòng" description="Số phòng bán được theo ngày và các đợt khóa/bảo trì." />
      {types.loading && <Loading />}
      {types.err && <ErrorState onRetry={types.reload}>{describeError(types.err)}</ErrorState>}
      {types.data && !items.length && <EmptyState title="Chưa có loại phòng" testid="empty">Chưa có loại phòng nào.</EmptyState>}
      {items.length > 0 && <>
        <FilterBar testid="inv-filters">
          <Select aria-label="Loại phòng" value={typeId} onChange={(e) => setRt(e.target.value)} data-testid="inv-type">{items.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</Select>
          <label>Từ <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="inv-from" /></label>
          <label>Đến <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="inv-to" /></label>
        </FilterBar>
        {rangeErr ? <p className="field-error" role="alert">{rangeErr}</p> : <Days roomTypeId={typeId} from={from} to={to} />}
      </>}

      <h2>Khóa / bảo trì</h2>
      <Toolbar end={manage && items.length > 0 && <button className="btn btn-sm btn-primary" type="button" onClick={() => setShowForm(true)} data-testid="bl-new">Tạo khóa phòng</button>}>
        <label><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} data-testid="bl-active" /> Chỉ khóa còn hiệu lực</label>
      </Toolbar>
      {act.note}
      <Modal open={showForm && manage} onClose={() => setShowForm(false)} title="Khóa / bảo trì phòng" size="md">
        <BlockForm types={items} act={act} onCancel={() => setShowForm(false)} onDone={() => { setShowForm(false); blocks.reload(); }} />
      </Modal>
      <DataTable columns={columns} rows={blocks.items} rowTestid="bl-row" loading={blocks.loading} error={blocks.err && describeError(blocks.err)} onRetry={blocks.reload}
        empty="Không có khóa phòng nào." hasMore={blocks.next != null} onLoadMore={blocks.loadMore} loadingMore={blocks.more} />
    </>
  );
}
