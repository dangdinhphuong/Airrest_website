import React, { useState } from 'react';
import { EmptyBox, Field, Notice } from '../Common';
import { LockedList, Pill, ReasonAction, SubTabs } from './ui';
import { DAYS, dayInventory, dayLabel, policyOf, priceOn, saveRoomType, savePolicy, setBasePrice, setBlackout, setClosed, setDayPrices, setTypeStatus, typesOf, usePartner } from '../../mock/partner';
import { can } from '../../lib/rbac';
import { fmtTime, money } from '../../lib/time';

const TYPE_STATUS = { selling: ['Đang bán', 'ok'], paused: ['Tạm ngừng bán', 'warn'], retired: ['Ngừng dùng', 'neutral'] };
const dayOpts = () => Array.from({ length: DAYS }, (_, i) => <option key={i} value={i}>{i === 0 ? `Hôm nay (${dayLabel(0)})` : dayLabel(i)}</option>);
const EMPTY = { id: '', name: '', capacity: '2', beds: '1', area: '20', rooms: '5', isNew: true };

// HM-FR-006…009, 012, 014: loại phòng, số phòng vật lý, trạng thái kinh doanh, giá theo ngày, điều kiện lưu trú.
export function RoomsTab({ p, session, simNow }) {
  const [sub, setSub] = useState('types');
  return (
    <>
      <SubTabs label="Phòng và giá" value={sub} onChange={setSub} tabs={[['types', 'Loại phòng'], ['prices', 'Giá'], ['policy', 'Điều kiện lưu trú']]} />
      {sub === 'types' && <TypesPane p={p} session={session} simNow={simNow} />}
      {sub === 'prices' && <PricesPane p={p} session={session} simNow={simNow} />}
      {sub === 'policy' && <PolicyPane p={p} session={session} simNow={simNow} />}
      <LockedList area="hotel" tab="rooms" />
    </>
  );
}

function TypesPane({ p, session, simNow }) {
  usePartner();
  const types = typesOf(p.id); const canC = can(session.role, 'roomtype', 'C'); const canU = can(session.role, 'roomtype', 'U'); const canX = can(session.role, 'roomtype', 'X');
  const [f, setF] = useState(null); const [err, setErr] = useState({}); const [msg, setMsg] = useState(null);
  const edit = (t) => { setF({ id: t.id, name: t.name, capacity: String(t.capacity), beds: String(t.beds), area: String(t.area), rooms: String(t.rooms), isNew: false }); setErr({}); setMsg(null); };
  const save = (e) => {
    e.preventDefault();
    const r = saveRoomType(p.id, { id: f.id.trim().toUpperCase(), name: f.name, capacity: Number(f.capacity), beds: Number(f.beds), area: Number(f.area) || 0, rooms: Number(f.rooms), isNew: f.isNew }, session, simNow);
    if (!r.ok) { setErr(r.err || { form: r.error }); setMsg(null); return; }
    setErr({}); setMsg({ ok: true, text: f.isNew ? `Đã tạo loại phòng ${f.id.toUpperCase()}.` : `Đã lưu loại phòng ${f.id}.` }); setF(null);
  };
  const act = (r, ok) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
  return (
    <>
      <div className="table-wrap">
        <table className="rights-table" data-testid="types-table">
          <thead><tr><th>Mã</th><th>Tên</th><th>Sức chứa</th><th>Giường</th><th>Diện tích</th><th>Phòng vật lý</th><th>Trạng thái kinh doanh</th><th>Xử lý</th></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} data-testid="type-row" data-id={t.id}>
                <td data-label="Mã"><strong>{t.id}</strong></td><td data-label="Tên">{t.name}</td><td data-label="Sức chứa">{t.capacity} khách</td><td data-label="Giường">{t.beds}</td><td data-label="Diện tích">{t.area} m²</td>
                <td data-label="Phòng vật lý" data-testid="type-rooms">{t.rooms}</td>
                <td data-label="Trạng thái kinh doanh"><Pill tone={TYPE_STATUS[t.status][1]} data-testid="type-status">{TYPE_STATUS[t.status][0]}</Pill></td>
                <td data-label="Xử lý">
                  {canU && <button type="button" className="btn btn-sm" onClick={() => edit(t)} data-testid="type-edit">Sửa</button>}
                  {canU && t.status !== 'retired' && <button type="button" className="btn btn-sm" onClick={() => act(setTypeStatus(p.id, t.id, t.status === 'selling' ? 'paused' : 'selling', session, simNow), t.status === 'selling' ? 'Đã tạm ngừng bán.' : 'Đã mở bán.')} data-testid="type-pause">{t.status === 'selling' ? 'Tạm ngừng bán' : 'Mở bán'}</button>}
                  {canX && t.status !== 'retired' && <button type="button" className="btn btn-sm btn-danger" onClick={() => act(setTypeStatus(p.id, t.id, 'retired', session, simNow), 'Đã ngừng dùng loại phòng.')} data-testid="type-retire">Ngừng dùng</button>}
                  {!canU && <small className="muted">Chỉ xem</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Trạng thái kinh doanh tách với trạng thái sử dụng từng phòng (thuộc PMS, OQ-54). Ngừng bán không hủy đặt phòng đã xác nhận.</p>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="types-msg">{msg.text}</p>}
      {canC && !f && <button type="button" className="btn btn-primary" onClick={() => { setF({ ...EMPTY }); setErr({}); setMsg(null); }} data-testid="type-new">Thêm loại phòng</button>}
      {f && (
        <form className="card" onSubmit={save} noValidate data-testid="type-form">
          <h2>{f.isNew ? 'Thêm loại phòng' : `Sửa loại phòng ${f.id}`}</h2>
          {err.form && <p className="field-error" role="alert">{err.form}</p>}
          <div className="grid-2">
            <Field id="t-id" label="Mã loại phòng" hint="2 đến 8 ký tự chữ hoa hoặc số; duy nhất trong khách sạn." error={err.id}><input id="t-id" value={f.id} disabled={!f.isNew} onChange={(e) => setF({ ...f, id: e.target.value })} data-testid="type-id" /></Field>
            <Field id="t-name" label="Tên" error={err.name}><input id="t-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="type-name" /></Field>
            <Field id="t-cap" label="Số khách tối đa" error={err.capacity}><input id="t-cap" inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} data-testid="type-capacity" /></Field>
            <Field id="t-beds" label="Số giường" error={err.beds}><input id="t-beds" inputMode="numeric" value={f.beds} onChange={(e) => setF({ ...f, beds: e.target.value })} /></Field>
            <Field id="t-area" label="Diện tích (m²)"><input id="t-area" inputMode="numeric" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
            <Field id="t-rooms" label="Số phòng vật lý" hint="Là trần của tồn phòng, không phải tồn có thể bán." error={err.rooms}><input id="t-rooms" inputMode="numeric" value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })} data-testid="input-rooms" /></Field>
          </div>
          <div className="row-actions"><button type="submit" className="btn btn-primary" data-testid="save-type">Lưu</button><button type="button" className="btn" onClick={() => setF(null)}>Huỷ</button></div>
        </form>
      )}
    </>
  );
}

function PricesPane({ p, session, simNow }) {
  const { rateLog } = usePartner();
  const types = typesOf(p.id).filter((t) => t.status !== 'retired'); const canU = can(session.role, 'rate', 'U');
  const [tid, setTid] = useState(types[0]?.id); const type = types.find((t) => t.id === tid) || types[0];
  const [base, setBase] = useState(''); const [from, setFrom] = useState(0); const [to, setTo] = useState(0); const [dp, setDp] = useState(''); const [msg, setMsg] = useState(null); const [confirm, setConfirm] = useState(null);
  if (!type) return <EmptyBox title="Chưa có loại phòng">Tạo loại phòng trước khi khai báo giá.</EmptyBox>;
  const cur = priceOn(p.id, type.id, 0);
  const note = (r, ok) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
  const apply = (force) => { const r = setDayPrices(p.id, type.id, Number(from), Number(to), Number(dp), session, simNow, force); if (r.needConfirm) { setConfirm(r); setMsg({ ok: false, text: r.error }); return; } setConfirm(null); note(r, 'Đã lưu giá theo ngày.'); };
  return (
    <>
      <Field id="pr-type" label="Loại phòng"><select id="pr-type" value={type.id} onChange={(e) => { setTid(e.target.value); setMsg(null); }} data-testid="price-type">{types.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></Field>
      <Notice tone="info" title="Giá tổng">Giá theo giả định 1 phòng, 1 đêm, 2 người lớn, đã gồm thuế phí (mô phỏng, D-06). Thuế, phí, phụ thuộc và chính sách hủy đang chờ quyết định (OQ-62, OQ-46).</Notice>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="price-msg">{msg.text}</p>}
      <div className="grid-2">
        <form className="card" onSubmit={(e) => { e.preventDefault(); note(setBasePrice(p.id, type.id, Number(base || cur), session, simNow), 'Đã lưu giá cơ sở.'); }} noValidate>
          <h2>Giá cơ sở</h2>
          <p className="muted">Giá hôm nay: <strong data-testid="price-today">{money(cur)}</strong></p>
          <Field id="pr-base" label="Giá cơ sở (đ)"><input id="pr-base" inputMode="numeric" value={base} placeholder={String(cur)} disabled={!canU} onChange={(e) => setBase(e.target.value)} data-testid="input-price" /></Field>
          {canU && <button type="submit" className="btn btn-primary" data-testid="save-price">Lưu giá cơ sở</button>}
        </form>
        <form className="card" onSubmit={(e) => { e.preventDefault(); apply(false); }} noValidate>
          <h2>Giá theo khoảng ngày</h2>
          <div className="grid-2">
            <Field id="pr-from" label="Từ ngày"><select id="pr-from" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="range-from">{dayOpts()}</select></Field>
            <Field id="pr-to" label="Đến ngày"><select id="pr-to" value={to} onChange={(e) => setTo(e.target.value)} data-testid="range-to">{dayOpts()}</select></Field>
          </div>
          <Field id="pr-day" label="Giá (đ)"><input id="pr-day" inputMode="numeric" value={dp} disabled={!canU} onChange={(e) => setDp(e.target.value)} data-testid="range-price" /></Field>
          {canU && <div className="row-actions"><button type="submit" className="btn btn-primary" data-testid="apply-range">Áp dụng</button>{confirm && <button type="button" className="btn btn-danger" onClick={() => apply(true)} data-testid="range-overwrite">Ghi đè {confirm.overlap.length} ngày</button>}</div>}
        </form>
      </div>
      <div className="table-wrap">
        <table className="rights-table" data-testid="rate-calendar">
          <thead><tr><th>Ngày</th><th>Giá hiệu lực</th><th>Loại</th></tr></thead>
          <tbody>{Array.from({ length: DAYS }, (_, i) => <tr key={i}><td data-label="Ngày">{dayLabel(i)}</td><td data-label="Giá hiệu lực">{money(priceOn(p.id, type.id, i))}</td><td data-label="Loại">{priceOn(p.id, type.id, i) === priceOn(p.id, type.id, 99) ? 'Giá cơ sở' : 'Giá riêng'}</td></tr>)}</tbody>
        </table>
      </div>
      <h3>Lịch sử giá</h3>
      {rateLog.filter((r) => r.pid === p.id && r.typeId === type.id).length ? (
        <div className="table-wrap"><table className="rights-table" data-testid="rate-history"><thead><tr><th>Lúc</th><th>Người đổi</th><th>Phạm vi</th><th>Giá cũ</th><th>Giá mới</th></tr></thead>
          <tbody>{rateLog.filter((r) => r.pid === p.id && r.typeId === type.id).map((r, i) => <tr key={i}><td data-label="Lúc">{fmtTime(r.at)}</td><td data-label="Người đổi">{r.who}</td><td data-label="Phạm vi">{r.scope}</td><td data-label="Giá cũ">{money(r.before)}</td><td data-label="Giá mới">{money(r.after)}</td></tr>)}</tbody></table></div>
      ) : <p className="muted" data-testid="rate-history-empty">Chưa có thay đổi giá nào. Lịch sử chỉ thêm, không sửa hoặc xóa.</p>}
    </>
  );
}

function PolicyPane({ p, session, simNow }) {
  usePartner(); const cur = policyOf(p.id); const canU = can(session.role, 'rate', 'U');
  const [f, setF] = useState({ checkin: cur.checkin, checkout: cur.checkout, childPolicy: cur.childPolicy, extraBed: cur.extraBed, maxGuests: String(cur.maxGuests) });
  const [err, setErr] = useState({}); const [saved, setSaved] = useState(false);
  const save = (e) => { e.preventDefault(); const r = savePolicy(p.id, { ...f, maxGuests: Number(f.maxGuests) }, session, simNow); if (!r.ok) { setErr(r.err || { form: r.error }); setSaved(false); return; } setErr({}); setSaved(true); };
  return (
    <form className="card" onSubmit={save} noValidate>
      <h2>Điều kiện lưu trú</h2>
      <p className="muted">Chính sách hủy và hoàn tiền chờ mẫu được duyệt (OQ-46), nên chưa khai báo ở đây.</p>
      <div className="grid-2">
        <Field id="po-in" label="Giờ nhận phòng (HH:MM)" error={err.checkin}><input id="po-in" value={f.checkin} disabled={!canU} onChange={(e) => { setF({ ...f, checkin: e.target.value }); setSaved(false); }} data-testid="policy-checkin" /></Field>
        <Field id="po-out" label="Giờ trả phòng (HH:MM)" error={err.checkout}><input id="po-out" value={f.checkout} disabled={!canU} onChange={(e) => { setF({ ...f, checkout: e.target.value }); setSaved(false); }} /></Field>
        <Field id="po-max" label="Số khách tối đa" error={err.maxGuests}><input id="po-max" inputMode="numeric" value={f.maxGuests} disabled={!canU} onChange={(e) => { setF({ ...f, maxGuests: e.target.value }); setSaved(false); }} data-testid="policy-max" /></Field>
        <Field id="po-child" label="Quy định trẻ em"><input id="po-child" value={f.childPolicy} disabled={!canU} onChange={(e) => { setF({ ...f, childPolicy: e.target.value }); setSaved(false); }} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.extraBed} disabled={!canU} onChange={(e) => { setF({ ...f, extraBed: e.target.checked }); setSaved(false); }} /> Có giường phụ</label>
      {canU && <button type="submit" className="btn btn-primary" data-testid="save-policy">Lưu điều kiện</button>}
      {saved && <p className="ok-line" role="status" data-testid="policy-saved">Đã lưu. Đặt phòng đã tạo giữ điều kiện cũ.</p>}
    </form>
  );
}

// HM-FR-015…017, 019: tồn phòng theo ngày với 5 đại lượng tách biệt; đóng/mở bán; không nhận khách; không đặt vượt.
export function InventoryTab({ p, session, simNow }) {
  usePartner();
  const types = typesOf(p.id).filter((t) => t.status !== 'retired'); const canU = can(session.role, 'inventory', 'U');
  const [tid, setTid] = useState(types[0]?.id); const type = types.find((t) => t.id === tid) || types[0];
  const [cf, setCf] = useState({ from: 0, to: 0 }); const [bo, setBo] = useState({ from: 0, to: 0, n: '1', reason: '' }); const [msg, setMsg] = useState(null);
  if (!type) return <EmptyBox title="Chưa có loại phòng">Tạo loại phòng trước.</EmptyBox>;
  const note = (r, ok) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
  const rows = Array.from({ length: DAYS }, (_, i) => ({ i, d: dayInventory(p.id, type.id, i) }));
  return (
    <>
      <Field id="inv-type" label="Loại phòng"><select id="inv-type" value={type.id} onChange={(e) => setTid(e.target.value)} data-testid="inv-type">{types.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></Field>
      <p className="muted">Tồn có thể bán = phòng vật lý − đã giữ chỗ − đã đặt − không khả dụng, và luôn ≥ 0. Năm đại lượng được lưu riêng. “Đã giữ chỗ” là yêu cầu đang chờ khách sạn xác nhận; hạn giữ chỗ chưa có (OQ-45).</p>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="inv-msg">{msg.text}</p>}
      <div className="table-wrap">
        <table className="rights-table" data-testid="inventory-table">
          <thead><tr><th>Ngày</th><th>Phòng vật lý</th><th>Đã giữ chỗ</th><th>Đã đặt</th><th>Không khả dụng</th><th>Có thể bán</th><th>Bán hôm đó</th></tr></thead>
          <tbody>{rows.map(({ i, d }) => (
            <tr key={i} data-testid="inv-row" data-day={i} className={d.sellable < 0 ? 'row-bad' : ''}>
              <td data-label="Ngày">{dayLabel(i)}</td><td data-label="Phòng vật lý">{d.physical}</td><td data-label="Đã giữ chỗ">{d.held}</td><td data-label="Đã đặt">{d.booked}</td>
              <td data-label="Không khả dụng">{d.unavailable}{d.reason && <small className="block">{d.reason}</small>}</td>
              <td data-label="Có thể bán" data-testid="inv-sellable"><strong>{d.sellable}</strong>{d.sellable < 0 && <small className="block field-error">Bất nhất, cần xử lý</small>}</td>
              <td data-label="Bán hôm đó"><Pill tone={d.closed ? 'error' : d.onSale > 0 ? 'ok' : 'warn'} data-testid="inv-state">{d.closed ? 'Đóng bán' : d.onSale > 0 ? 'Mở bán' : 'Hết phòng'}</Pill></td>
            </tr>))}</tbody>
        </table>
      </div>
      {canU ? (
        <div className="grid-2">
          <form className="card" onSubmit={(e) => e.preventDefault()}>
            <h2>Đóng/mở bán</h2>
            <div className="grid-2">
              <Field id="cl-from" label="Từ ngày"><select id="cl-from" value={cf.from} onChange={(e) => setCf({ ...cf, from: Number(e.target.value) })} data-testid="close-from">{dayOpts()}</select></Field>
              <Field id="cl-to" label="Đến ngày"><select id="cl-to" value={cf.to} onChange={(e) => setCf({ ...cf, to: Number(e.target.value) })} data-testid="close-to">{dayOpts()}</select></Field>
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-sm" onClick={() => note(setClosed(p.id, type.id, cf.from, cf.to, true, session, simNow), 'Đã đóng bán. Đặt phòng đã xác nhận không bị hủy.')} data-testid="close-days">Đóng bán</button>
              <button type="button" className="btn btn-sm" onClick={() => note(setClosed(p.id, type.id, cf.from, cf.to, false, session, simNow), 'Đã mở bán.')} data-testid="open-days">Mở bán</button>
            </div>
          </form>
          <form className="card" onSubmit={(e) => { e.preventDefault(); note(setBlackout(p.id, type.id, bo.from, bo.to, Number(bo.n), bo.reason, session, simNow), 'Đã ghi phòng không khả dụng.'); }} noValidate>
            <h2>Không nhận khách hoặc bảo trì</h2>
            <div className="grid-2">
              <Field id="bo-from" label="Từ ngày"><select id="bo-from" value={bo.from} onChange={(e) => setBo({ ...bo, from: Number(e.target.value) })} data-testid="bo-from">{dayOpts()}</select></Field>
              <Field id="bo-to" label="Đến ngày"><select id="bo-to" value={bo.to} onChange={(e) => setBo({ ...bo, to: Number(e.target.value) })} data-testid="bo-to">{dayOpts()}</select></Field>
              <Field id="bo-n" label="Số phòng không khả dụng"><input id="bo-n" inputMode="numeric" value={bo.n} onChange={(e) => setBo({ ...bo, n: e.target.value })} data-testid="bo-n" /></Field>
              <Field id="bo-r" label="Lý do"><input id="bo-r" value={bo.reason} onChange={(e) => setBo({ ...bo, reason: e.target.value })} data-testid="bo-reason" /></Field>
            </div>
            <button type="submit" className="btn btn-primary" data-testid="bo-save">Lưu</button>
          </form>
        </div>
      ) : <p className="muted">Vai trò này chỉ xem tồn phòng.</p>}
      <LockedList area="hotel" tab="inventory" />
    </>
  );
}
