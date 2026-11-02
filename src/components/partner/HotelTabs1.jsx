import React, { useState } from 'react';
import { EmptyBox, Field } from '../Common';
import { Kpi, LockedList, Pill, ReasonAction, BOOKING_STATUS } from './ui';
import { activeCatalog, createCase, dayInventory, dayLabel, maskName, priceOn, sellableToday, setBookingStatus, typesOf, usePartner, DAYS } from '../../mock/partner';
import { can } from '../../lib/rbac';
import { fmtTime, money } from '../../lib/time';

const METHOD = { 'at-property': 'Trả tại nơi nghỉ', qr: 'QR (mô phỏng)', card: 'Thẻ (mô phỏng)' };
const dayOptions = () => Array.from({ length: DAYS }, (_, i) => <option key={i} value={i}>{i === 0 ? `Hôm nay (${dayLabel(0)})` : dayLabel(i)}</option>);

// HM-FR-029: danh sách khách dự kiến đến và rời đi theo ngày (Proposed).
export function OverviewTab({ p, simNow }) {
  const { bookings } = usePartner();
  const [day, setDay] = useState(0);
  const mine = bookings.filter((b) => b.propertyId === p.id && ['pending', 'confirmed'].includes(b.status));
  const arrivals = mine.filter((b) => b.dayIdx === day); const departures = mine.filter((b) => b.dayIdx + b.nights === day);
  const types = typesOf(p.id);
  return (
    <>
      <Kpi items={[['Phòng bán được hôm nay', sellableToday(p.id) ?? 0, 'ov-sellable'], ['Loại phòng', types.length, 'ov-types'], ['Chờ xác nhận', mine.filter((b) => b.status === 'pending').length, 'ov-pending'], ['Đã xác nhận', mine.filter((b) => b.status === 'confirmed').length, 'ov-confirmed']]} />
      <div className="card">
        <div className="card-head"><h2>Khách đến và rời đi</h2>
          <Field id="ov-day" label="Ngày"><select id="ov-day" value={day} onChange={(e) => setDay(Number(e.target.value))} data-testid="ov-day">{dayOptions()}</select></Field>
        </div>
        <div className="grid-2">
          <div><h3>Đến ({arrivals.length})</h3>{arrivals.length ? <ul className="plain-list" data-testid="ov-arrivals">{arrivals.map((b) => <li key={b.code}>{b.code} · {maskName(b.name)} · {BOOKING_STATUS[b.status][0]}</li>)}</ul> : <p className="muted">Không có khách đến.</p>}</div>
          <div><h3>Rời đi ({departures.length})</h3>{departures.length ? <ul className="plain-list" data-testid="ov-departures">{departures.map((b) => <li key={b.code}>{b.code} · {maskName(b.name)}</li>)}</ul> : <p className="muted">Không có khách rời đi.</p>}</div>
        </div>
        <p className="muted">Nhận/trả phòng và vận hành phòng có thể thuộc PMS của khách sạn (OQ-54), nên chưa có thao tác ở đây. Giờ mô phỏng hiện tại {fmtTime(simNow)}.</p>
      </div>
      <LockedList area="hotel" tab="overview" />
    </>
  );
}

// HM-FR-021…024, 026, 028, 034: danh sách, chi tiết, xác nhận/từ chối, cảnh báo thay đổi, lịch sử, báo sự cố.
export function BookingsTab({ p, session, simNow }) {
  const { bookings } = usePartner();
  const [q, setQ] = useState(''); const [st, setSt] = useState('all'); const [open, setOpen] = useState(null); const [msg, setMsg] = useState(null);
  const mine = bookings.filter((b) => b.propertyId === p.id);
  const list = mine.filter((b) => (st === 'all' || b.status === st) && (!q.trim() || b.code.toLowerCase().includes(q.trim().toLowerCase()) || b.name.toLowerCase().includes(q.trim().toLowerCase())));
  const canAct = can(session.role, 'booking', 'A'); const canV = can(session.role, 'sensitive', 'V');
  const detail = mine.find((b) => b.code === open);
  const nm = (b) => (canV ? b.name : maskName(b.name));
  return (
    <>
      <div className="filter-bar" role="search">
        <label className="sr-only" htmlFor="bk-q">Tìm theo mã hoặc tên gọi</label>
        <input id="bk-q" className="filter-input" placeholder="Tìm theo mã hoặc tên gọi" value={q} onChange={(e) => setQ(e.target.value)} data-testid="bk-search" />
        <label className="sr-only" htmlFor="bk-st">Trạng thái</label>
        <select id="bk-st" value={st} onChange={(e) => setSt(e.target.value)} data-testid="bk-status"><option value="all">Mọi trạng thái</option>{Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
        <span className="muted" data-testid="bk-count">{list.length} đặt phòng</span>
      </div>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="bk-msg">{msg.text}</p>}
      {!list.length ? <EmptyBox title="Không có đặt phòng">Đặt phòng do người dùng cuối tạo sẽ xuất hiện ở đây (mô phỏng). Thử đổi bộ lọc.</EmptyBox> : (
        <div className="table-wrap">
          <table className="rights-table" data-testid="bookings-table">
            <thead><tr><th>Mã</th><th>Tên gọi</th><th>Loại phòng</th><th>Ngày</th><th>Cách trả</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.code} data-testid="booking-row" data-code={b.code}>
                  <td data-label="Mã"><button type="button" className="link-btn" onClick={() => setOpen(open === b.code ? null : b.code)} data-testid="booking-detail-open"><strong>{b.code}</strong></button>{b.seed && <small> (mẫu)</small>}</td>
                  <td data-label="Tên gọi">{nm(b)}</td>
                  <td data-label="Loại phòng">{b.typeId}</td>
                  <td data-label="Ngày">{dayLabel(b.dayIdx)} · {b.nights} đêm</td>
                  <td data-label="Cách trả">{METHOD[b.method] || b.method}</td>
                  <td data-label="Trạng thái"><Pill tone={BOOKING_STATUS[b.status][1]} data-testid="booking-pill">{BOOKING_STATUS[b.status][0]}</Pill>{b.reason && <small className="block">{b.reason}</small>}</td>
                  <td data-label="Xử lý">
                    {canAct && b.status === 'pending' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setMsg(((r) => ({ ok: r.ok, text: r.ok ? `Đã xác nhận ${b.code}.` : r.error }))(setBookingStatus(b.code, 'confirmed', null, session, simNow)))} data-testid="confirm-booking">Xác nhận</button>}
                    {canAct && ['pending', 'confirmed'].includes(b.status) && <ReasonAction label="Từ chối" confirmLabel="Xác nhận từ chối" placeholder="Lý do từ chối" options={activeCatalog('reject_reasons')} testid="reject" onSubmit={(r) => setBookingStatus(b.code, 'rejected', r, session, simNow)} />}
                    {canAct && b.status === 'rejected' && <button type="button" className="btn btn-sm" onClick={() => setMsg(((r) => ({ ok: r.ok, text: r.ok ? `Đã xác nhận lại ${b.code}.` : r.error }))(setBookingStatus(b.code, 'confirmed', null, session, simNow)))} data-testid="reconfirm">Xác nhận lại</button>}
                    {!canAct && <small className="muted">Chỉ xem</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail && (
        <section className="card" aria-label="Chi tiết đặt phòng" data-testid="booking-detail">
          <div className="card-head"><h2>Chi tiết {detail.code}</h2><button type="button" className="link-btn" onClick={() => setOpen(null)}>Đóng</button></div>
          <dl className="spec">
            <div><dt>Trạng thái</dt><dd>{BOOKING_STATUS[detail.status][0]}</dd></div>
            <div><dt>Loại phòng, ngày</dt><dd>{detail.typeId} · {dayLabel(detail.dayIdx)} · {detail.nights} đêm · 2 người lớn (giả định)</dd></div>
            <div><dt>Tên gọi</dt><dd data-testid="detail-name">{nm(detail)}{!canV && <small> (đã che, vai trò này không có quyền xem rõ)</small>}</dd></div>
            <div><dt>Giá tại thời điểm đặt</dt><dd data-testid="detail-price-at">{money(detail.price)} <small>(không đổi sau khi khách gửi)</small></dd></div>
            <div><dt>Mã truy vết</dt><dd data-testid="detail-cid">{detail.cid}</dd></div>
          </dl>
          {priceOn(p.id, detail.typeId, detail.dayIdx) !== detail.price && <p className="warn-line" role="alert" data-testid="price-changed-warning">Giá hiện tại ({money(priceOn(p.id, detail.typeId, detail.dayIdx))}) đã khác giá lúc khách gửi; yêu cầu này giữ giá cũ (HM-FR-026).</p>}
          <h3>Lịch sử trạng thái</h3>
          {detail.history.length ? <ul className="plain-list" data-testid="booking-history">{detail.history.map((h, i) => <li key={i}>{fmtTime(h.at)} · {BOOKING_STATUS[h.from]?.[0] || h.from} → {BOOKING_STATUS[h.to][0]} · {h.who}{h.reason ? ` · ${h.reason}` : ''}</li>)}</ul> : <p className="muted" data-testid="booking-history-empty">Chưa có thay đổi trạng thái nào sau khi tạo.</p>}
          {can(session.role, 'case', 'C') && <button type="button" className="btn btn-sm" onClick={() => { const id = createCase({ title: `Sự cố đặt phòng ${detail.code}`, category: '', link: { type: 'booking', code: detail.code, propertyId: p.id }, by: session, now: simNow }); setMsg({ ok: true, text: `Đã tạo ca hỗ trợ ${id} liên kết ${detail.code}.` }); }} data-testid="booking-report-issue">Báo sự cố cho Airrest</button>}
        </section>
      )}
      <LockedList area="hotel" tab="bookings" />
    </>
  );
}
