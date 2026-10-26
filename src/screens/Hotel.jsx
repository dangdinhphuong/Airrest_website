import React, { useState } from 'react';
import { CalendarCheck2, Car, Settings2, Wallet } from 'lucide-react';
import { useApp } from '../state/store';
import { PICKUP_FAIL_REASONS, PICKUP_LABEL, PICKUP_NEXT, REJECT_REASONS, ROLE_LABEL, setBookingStatus, setPickupStatus, updateProperty, usePartner } from '../mock/partner';
import { isOpen } from '../lib/domain';
import { fmtTime, money, pad } from '../lib/time';
import { EmptyBox, Field, Notice, ScreenTitle, SimBadge } from '../components/Common';
import Tabs from '../components/Tabs';

const hourLabel = (h) => `${pad(h % 24)}:00${h >= 24 ? ' (hôm sau)' : ''}`;
const METHOD = { 'at-property': 'Trả tại nơi nghỉ', qr: 'QR (mô phỏng)', card: 'Thẻ (mô phỏng)' };
const SHUTTLE = { none: 'Không có xe đưa đón', paid: 'Có xe đưa đón (có phí)', free: 'Có xe đưa đón miễn phí' };

export function NeedLogin({ dispatch }) {
  return (
    <>
      <ScreenTitle title="Cần đăng nhập" kicker="Khu vực đối tác · Mô phỏng" />
      <Notice tone="warn" title="Bạn chưa đăng nhập">Khu vực này dành cho khách sạn, lái xe hoặc quản trị. <button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: 'login' })} data-testid="to-login">Đăng nhập (mô phỏng)</button></Notice>
    </>
  );
}
export function Denied({ dispatch, session, target }) {
  return (
    <>
      <ScreenTitle title="Không có quyền truy cập" kicker="Khu vực đối tác · Mô phỏng" />
      <Notice tone="error" title="Vai trò của bạn không dùng được khu vực này" role="alert">
        Tài khoản {session.id} ({ROLE_LABEL[session.role]}) không có quyền vào khu vực này (BR-015).{' '}
        <button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: target })} data-testid="denied-back">Về khu vực của bạn</button>
      </Notice>
    </>
  );
}

// M10 — Khu vực khách sạn (gồm lái xe): hồ sơ cơ sở, phòng và giá, đặt chỗ, đón khách (FR-025…FR-028). Ngoài MVP, Proposed.
export default function Hotel() {
  const { state, dispatch, getProperty } = useApp();
  const { session, simNow } = state;
  usePartner();
  if (!session) return <NeedLogin dispatch={dispatch} />;
  if (session.role === 'admin') return <Denied dispatch={dispatch} session={session} target="admin" />;
  const p = getProperty(session.propertyId, simNow);
  if (!p) return <EmptyBox title="Không tìm thấy cơ sở">Tài khoản chưa được gán cơ sở nào. Nhờ quản trị gán cơ sở.</EmptyBox>;
  return <HotelWork session={session} p={p} simNow={simNow} />;
}

function HotelWork({ session, p, simNow }) {
  const { bookings, pickups } = usePartner();
  const isDriver = session.role === 'driver';
  const mineB = bookings.filter((b) => b.propertyId === p.id);
  const mineP = pickups.filter((x) => x.propertyId === p.id);
  const tabs = isDriver
    ? [{ id: 'pickups', label: 'Đón khách', icon: <Car size={16} aria-hidden="true" />, count: mineP.filter((x) => !['done', 'failed'].includes(x.status)).length }]
    : [
      { id: 'bookings', label: 'Đặt chỗ', icon: <CalendarCheck2 size={16} aria-hidden="true" />, count: mineB.filter((b) => b.status === 'confirmed').length },
      { id: 'rooms', label: 'Phòng và giá', icon: <Wallet size={16} aria-hidden="true" /> },
      { id: 'profile', label: 'Hồ sơ cơ sở', icon: <Settings2 size={16} aria-hidden="true" /> },
      { id: 'pickups', label: 'Đón khách', icon: <Car size={16} aria-hidden="true" />, count: mineP.filter((x) => !['done', 'failed'].includes(x.status)).length },
    ];
  const [tab, setTab] = useState(tabs[0].id);
  const visible = p.locked ? 'Không (quản trị đang tạm khoá cơ sở)' : p.roomsLeft <= 0 ? 'Không (hết phòng)' : isOpen(p, simNow) ? 'Có (đang nhận khách)' : 'Không (ngoài giờ nhận khách)';
  return (
    <>
      <ScreenTitle kicker={`${ROLE_LABEL[session.role]} · ${session.id} · Mô phỏng`} title={`Khu vực khách sạn: ${p.name}`} />
      <Notice tone="info" title="Môi trường mô phỏng">Thay đổi chỉ có hiệu lực trong phiên này, không gửi tới hệ thống thật và được ghi nhật ký. <SimBadge>Mô phỏng</SimBadge></Notice>
      <section className="card property-summary" aria-label="Tóm tắt cơ sở" data-testid="hotel-summary">
        <dl className="spec spec-row">
          <div><dt>Đang hiển thị cho người dùng cuối</dt><dd data-testid="hotel-visible">{visible}</dd></div>
          <div><dt>Phòng còn</dt><dd data-testid="hotel-rooms">{p.roomsLeft}</dd></div>
          <div><dt>Giá tổng</dt><dd data-testid="hotel-price">{money(p.price)}</dd></div>
          <div><dt>Cập nhật lúc</dt><dd>{fmtTime(p.updatedAt)} (mô phỏng)</dd></div>
        </dl>
      </section>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Chức năng khách sạn" />
      {tab === 'bookings' && <BookingsTab list={mineB} session={session} simNow={simNow} />}
      {tab === 'rooms' && <RoomsTab key={`r-${p.id}`} p={p} session={session} simNow={simNow} />}
      {tab === 'profile' && <ProfileTab key={`p-${p.id}`} p={p} session={session} simNow={simNow} />}
      {tab === 'pickups' && <PickupsTab list={mineP} session={session} simNow={simNow} />}
    </>
  );
}

function BookingsTab({ list, session, simNow }) {
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  if (!list.length) return <EmptyBox title="Chưa có đặt chỗ">Đặt chỗ do người dùng cuối tạo sẽ xuất hiện ở đây (mô phỏng).</EmptyBox>;
  return (
    <div className="table-wrap">
      <table className="rights-table" data-testid="bookings-table">
        <thead><tr><th>Mã</th><th>Tên gọi</th><th>Nhận phòng</th><th>Cách trả</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
        <tbody>
          {list.map((b) => (
            <tr key={b.code} data-testid="booking-row" data-code={b.code}>
              <td data-label="Mã"><strong>{b.code}</strong>{b.seed && <small> (mẫu)</small>}</td>
              <td data-label="Tên gọi">{b.name}</td>
              <td data-label="Nhận phòng">{fmtTime(b.createdAt + 30)}</td>
              <td data-label="Cách trả">{METHOD[b.method] || b.method}</td>
              <td data-label="Trạng thái"><span className={`pill ${b.status === 'confirmed' ? 'pill-ok' : 'pill-error'}`}>{b.status === 'confirmed' ? 'Đã xác nhận' : 'Đã từ chối'}</span>{b.reason && <small className="block">{b.reason}</small>}</td>
              <td data-label="Xử lý">
                {b.status === 'confirmed' && rejecting !== b.code && <button type="button" className="btn btn-sm" onClick={() => { setRejecting(b.code); setReason(REJECT_REASONS[0]); }} data-testid="reject-open">Từ chối</button>}
                {b.status === 'rejected' && <button type="button" className="btn btn-sm" onClick={() => setBookingStatus(b.code, 'confirmed', null, session, simNow)} data-testid="reconfirm">Xác nhận lại</button>}
                {rejecting === b.code && (
                  <span className="inline-form">
                    <label className="sr-only" htmlFor={`rr-${b.code}`}>Lý do từ chối</label>
                    <select id={`rr-${b.code}`} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reject-reason">{REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => { setBookingStatus(b.code, 'rejected', reason, session, simNow); setRejecting(null); }} data-testid="reject-confirm">Xác nhận từ chối</button>
                    <button type="button" className="link-btn" onClick={() => setRejecting(null)}>Huỷ</button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoomsTab({ p, session, simNow }) {
  const [rooms, setRooms] = useState(String(p.roomsLeft));
  const [price, setPrice] = useState(String(p.price));
  const [err, setErr] = useState({});
  const [saved, setSaved] = useState(null);
  const save = (e) => {
    e.preventDefault();
    const er = {};
    if (!/^\d+$/.test(rooms.trim()) || Number(rooms) > 99) er.rooms = 'Nhập số phòng còn là số nguyên từ 0 đến 99.';
    const pr = Number(price);
    if (!/^\d+$/.test(price.trim()) || pr < 100000 || pr > 20000000) er.price = 'Nhập giá tổng từ 100.000đ đến 20.000.000đ (số nguyên).';
    setErr(er); setSaved(null);
    if (Object.keys(er).length) return;
    updateProperty(p.id, { roomsLeft: Number(rooms), price: pr }, session, simNow, 'Cập nhật phòng và giá');
    setSaved(simNow);
  };
  return (
    <form className="card" onSubmit={save} noValidate>
      <h2>Phòng và giá</h2>
      <p className="muted">Giá tổng theo giả định 1 phòng, 1 đêm, 2 người lớn, đã gồm thuế phí (mô phỏng). Số phòng còn bằng 0 thì cơ sở không còn trong danh sách nhận khách ngay.</p>
      <div className="grid-2">
        <Field id="h-rooms" label="Số phòng còn" error={err.rooms}><input id="h-rooms" inputMode="numeric" value={rooms} onChange={(e) => setRooms(e.target.value)} data-testid="input-rooms" aria-invalid={!!err.rooms} /></Field>
        <Field id="h-price" label="Giá tổng (đ)" error={err.price}><input id="h-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" aria-invalid={!!err.price} /></Field>
      </div>
      <button type="submit" className="btn btn-primary" data-testid="save-rooms">Lưu thay đổi</button>
      {saved != null && <p className="ok-line" role="status" data-testid="saved-note">Đã lưu lúc {fmtTime(saved)} (mô phỏng). Người dùng cuối thấy dữ liệu mới.</p>}
    </form>
  );
}

function ProfileTab({ p, session, simNow }) {
  const [f, setF] = useState({ closeExtHour: p.closeExtHour, reception24: p.reception24, freeCancel: p.freeCancel, payAtProperty: p.payAtProperty, shuttle: p.shuttle });
  const [saved, setSaved] = useState(null);
  const set = (k, v) => { setF({ ...f, [k]: v }); setSaved(null); };
  const save = (e) => { e.preventDefault(); updateProperty(p.id, { ...f, closeExtHour: Number(f.closeExtHour) }, session, simNow, 'Cập nhật hồ sơ cơ sở'); setSaved(simNow); };
  return (
    <form className="card" onSubmit={save}>
      <h2>Hồ sơ cơ sở</h2>
      <p className="muted">Các thông tin này hiển thị cho người dùng cuối ở danh sách và chi tiết. Tên, loại hình và khu vực do quản trị quản lý.</p>
      <Field id="h-close" label="Giờ nhận khách cuối" hint="Dùng khi cơ sở không có lễ tân 24/24.">
        <select id="h-close" value={f.closeExtHour} onChange={(e) => set('closeExtHour', e.target.value)} data-testid="input-close">{[22, 23, 24, 25, 26].map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
      </Field>
      <label className="check"><input type="checkbox" checked={f.reception24} onChange={(e) => set('reception24', e.target.checked)} data-testid="input-24h" /> Lễ tân 24/24</label>
      <label className="check"><input type="checkbox" checked={f.freeCancel} onChange={(e) => set('freeCancel', e.target.checked)} /> Huỷ miễn phí</label>
      <label className="check"><input type="checkbox" checked={f.payAtProperty} onChange={(e) => set('payAtProperty', e.target.checked)} /> Cho trả tại nơi nghỉ</label>
      <Field id="h-shuttle" label="Xe đưa đón">
        <select id="h-shuttle" value={f.shuttle} onChange={(e) => set('shuttle', e.target.value)} data-testid="input-shuttle">{Object.entries(SHUTTLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <button type="submit" className="btn btn-primary" data-testid="save-profile">Lưu thay đổi</button>
      {saved != null && <p className="ok-line" role="status" data-testid="saved-note">Đã lưu lúc {fmtTime(saved)} (mô phỏng).</p>}
    </form>
  );
}

function PickupsTab({ list, session, simNow }) {
  const [fail, setFail] = useState({});
  if (!list.length) return <EmptyBox title="Chưa có yêu cầu đón">Yêu cầu đón của người dùng cuối sẽ xuất hiện ở đây (mô phỏng). Không có bản đồ hay định vị.</EmptyBox>;
  const NEXT = { waiting: 'accepted', accepted: 'enroute', enroute: 'picked', picked: 'done' };
  return (
    <div className="pickup-list">
      {list.map((x) => {
        const active = !['done', 'failed'].includes(x.status);
        return (
          <article key={x.id} className="card pickup-card" data-testid="pickup-card" data-id={x.id}>
            <div className="card-head">
              <h3>{x.name} <small>· {x.bookingCode}{x.seed ? ' (mẫu)' : ''}</small></h3>
              <span className={`pill ${x.status === 'done' ? 'pill-ok' : x.status === 'failed' ? 'pill-error' : 'pill-info'}`} data-testid="pickup-pill">{PICKUP_LABEL[x.status]}</span>
            </div>
            <p className="muted">Sân bay {x.airport} · giờ đón dự kiến {fmtTime(x.etaMin)} · cập nhật lúc {fmtTime(x.updatedAt)} (mô phỏng){x.reason ? ` · ${x.reason}` : ''}</p>
            {active && (
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
  );
}
