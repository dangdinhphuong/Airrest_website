import React, { useState } from 'react';
import { ScreenTitle, Notice, Field } from '../Common';
import { Kpi, Pill } from '../partner/ui';
import { money } from '../../lib/time';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { createHotel, hotelAction, patchHotel, payoutDecision, proposePayout } from '../../data/admin';
import { BOOKING_LABEL } from './Dashboard';
import { Act, AirportSelect, Back, Filters, LoadView, PagedView, Table, d, dt, isoOrUndef, useAirports, useLoad, usePaged, useRun } from './kit';

const ST = { DRAFT: ['Nháp / bị từ chối', 'neutral'], PENDING_APPROVAL: ['Chờ duyệt', 'warn'], ACTIVE: ['Đang hoạt động', 'ok'], SUSPENDED: ['Tạm ngưng', 'error'], HIDDEN_DEBT: ['Ẩn do công nợ', 'error'] };
const TPL = { FLEXIBLE: 'Linh hoạt', STANDARD: 'Tiêu chuẩn', NON_REFUNDABLE: 'Không hoàn' };
const St = ({ s }) => <Pill tone={ST[s]?.[1]}>{ST[s]?.[0] || s}</Pill>;
const TplSelect = ({ id, value, onChange }) => <select id={id} value={value} onChange={onChange}>{Object.entries(TPL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>;

function CreateForm({ onDone, onCancel }) {
  const [f, setF] = useState({ code: '', name: '', line: '', city: '', lng: '105.8', lat: '21.2', iata: 'HAN', km: '10', minutes: '20', phone: '', tpl: 'FLEXIBLE', buf: '0', oEmail: '', oName: '', oPw: '' });
  const { run, busy, node } = useRun();
  const { items: airports, err: airErr } = useAirports();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = {
      code: f.code.trim().toUpperCase(), name: f.name,
      address: { line: f.line, city: f.city, country: 'VN' }, location: { lng: Number(f.lng), lat: Number(f.lat) },
      airports: [{ iata: f.iata, km: Number(f.km), minutes: Number(f.minutes) }], amenities: [], contact: { phone: f.phone },
      policy: { cancellationTemplate: f.tpl, cleaningBufferMin: Number(f.buf) },
      owner: { email: f.oEmail, fullName: f.oName, password: f.oPw },
    };
    const x = await run(() => createHotel(body), 'Đã tạo khách sạn (chờ duyệt) và tài khoản chủ.');
    if (x.ok) { setF({ ...f, oPw: '' }); onDone(x.r.hotel); }
  };
  const inp = (k, label, props = {}) => <Field id={`ch-${k}`} label={label}><input id={`ch-${k}`} value={f[k]} onChange={set(k)} required {...props} /></Field>;
  return (
    <form onSubmit={submit} className="card" data-testid="hotel-create">
      <h3>Đăng ký đối tác mới</h3>
      {node}{airErr && <p className="field-error" role="alert">{airErr}</p>}
      <div className="grid-2">
        {inp('code', 'Mã khách sạn (A-Z, 0-9, gạch)', { pattern: '[A-Za-z0-9-]{3,30}' })}{inp('name', 'Tên khách sạn', { minLength: 2 })}
        {inp('line', 'Địa chỉ')}{inp('city', 'Thành phố')}
        {inp('lng', 'Kinh độ', { type: 'number', step: 'any' })}{inp('lat', 'Vĩ độ', { type: 'number', step: 'any' })}
        <Field id="ch-iata" label="Sân bay (IATA)"><AirportSelect id="ch-iata" airports={airports} value={f.iata} onChange={set('iata')} data-testid="ch-iata" /></Field>{inp('km', 'Cách sân bay (km)', { type: 'number', min: 0 })}
        {inp('minutes', 'Thời gian di chuyển (phút)', { type: 'number', min: 0 })}{inp('phone', 'Điện thoại liên hệ', { minLength: 8 })}
        <Field id="ch-tpl" label="Chính sách hủy"><TplSelect id="ch-tpl" value={f.tpl} onChange={set('tpl')} /></Field>{inp('buf', 'Đệm dọn phòng (phút)', { type: 'number', min: 0 })}
        {inp('oEmail', 'Email chủ khách sạn', { type: 'email' })}{inp('oName', 'Họ tên chủ', { minLength: 2 })}
        {inp('oPw', 'Mật khẩu chủ (tối thiểu 12 ký tự)', { type: 'password', minLength: 12, autoComplete: 'new-password' })}
      </div>
      <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="hotel-create-submit">Tạo</button><button type="button" className="btn" onClick={onCancel}>Huỷ</button></div>
    </form>
  );
}

function EditForm({ h, onDone }) {
  const [f, setF] = useState({ name: h.name, description: h.description || '', phone: h.contact?.phone || '', email: h.contact?.email || '', tpl: h.policy?.cancellationTemplate || 'FLEXIBLE', buf: String(h.policy?.cleaningBufferMin ?? 0), manual: !!h.approval?.manual, until: h.approval?.manualUntil ? h.approval.manualUntil.slice(0, 10) : '' });
  const { run, busy, node } = useRun();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    // Chỉ gửi cờ duyệt tay khi người dùng đổi nó (bật/tắt hoặc đổi ngày), để sửa tên/SĐT không bị ràng buộc ngày.
    const wasManual = !!h.approval?.manual;
    const approvalChanged = f.manual !== wasManual || (f.manual && f.until !== (h.approval?.manualUntil ? h.approval.manualUntil.slice(0, 10) : ''));
    const body = {
      name: f.name, description: f.description,
      contact: { phone: f.phone, ...(f.email && { email: f.email }) },
      policy: { ...h.policy, cancellationTemplate: f.tpl, cleaningBufferMin: Number(f.buf) },
      ...(approvalChanged && { approval: f.manual ? { manual: true, manualUntil: isoOrUndef(`${f.until}T23:59:59`) } : { manual: false } }),
    };
    const x = await run(() => patchHotel(h.id, body), 'Đã lưu thay đổi.');
    if (x.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="card" data-testid="hotel-edit">
      <h3>Sửa thông tin</h3>{node}
      <div className="grid-2">
        <Field id="eh-name" label="Tên"><input id="eh-name" required minLength={2} value={f.name} onChange={set('name')} /></Field>
        <Field id="eh-phone" label="Điện thoại"><input id="eh-phone" required minLength={8} value={f.phone} onChange={set('phone')} /></Field>
        <Field id="eh-email" label="Email liên hệ"><input id="eh-email" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field id="eh-tpl" label="Chính sách hủy"><TplSelect id="eh-tpl" value={f.tpl} onChange={set('tpl')} /></Field>
        <Field id="eh-buf" label="Đệm dọn phòng (phút)"><input id="eh-buf" type="number" min={0} value={f.buf} onChange={set('buf')} /></Field>
        <Field id="eh-until" label="Duyệt tay đến ngày (tối đa 90 ngày)"><input id="eh-until" type="date" disabled={!f.manual} required={f.manual && (!h.approval?.manual || !!h.approval?.manualUntil)} value={f.until} onChange={set('until')} /></Field>
      </div>
      <Field id="eh-desc" label="Mô tả"><input id="eh-desc" value={f.description} onChange={set('description')} /></Field>
      <label><input type="checkbox" checked={f.manual} onChange={(e) => setF({ ...f, manual: e.target.checked })} /> Khách sạn duyệt đơn bằng tay</label>
      <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="hotel-edit-save">Lưu</button><button type="button" className="btn" onClick={onDone}>Huỷ</button></div>
    </form>
  );
}

function PayoutForm({ id, onDone }) {
  const [f, setF] = useState({ type: 'BANK', accountNo: '', accountName: '', bankCode: '' });
  const { run, busy, node } = useRun();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = f.type === 'BANK' ? f : { type: 'MOMO', accountNo: f.accountNo, accountName: f.accountName };
    const x = await run(() => proposePayout(id, body), 'Đã gửi đề xuất, chờ một Admin khác duyệt.');
    if (x.ok) { setF({ ...f, accountNo: '' }); onDone(); }
  };
  return (
    <form onSubmit={submit} data-testid="payout-form">
      {node}
      <div className="grid-2">
        <Field id="po-type" label="Loại"><select id="po-type" value={f.type} onChange={set('type')}><option value="BANK">Ngân hàng</option><option value="MOMO">Ví MoMo</option></select></Field>
        <Field id="po-no" label={f.type === 'BANK' ? 'Số tài khoản' : 'SĐT ví MoMo'}><input id="po-no" required value={f.accountNo} onChange={set('accountNo')} autoComplete="off" /></Field>
        <Field id="po-name" label="Tên chủ tài khoản"><input id="po-name" required minLength={2} value={f.accountName} onChange={set('accountName')} /></Field>
        {f.type === 'BANK' && <Field id="po-bank" label="Mã ngân hàng"><input id="po-bank" required minLength={2} value={f.bankCode} onChange={set('bankCode')} /></Field>}
      </div>
      <button className="btn btn-sm btn-primary" disabled={busy} data-testid="payout-propose">Đề xuất đổi tài khoản</button>
    </form>
  );
}

function Stats({ id }) {
  const r = useLoad(`/hotels/${id}/stats`);
  return (
    <LoadView r={r}>{(s) => (
      <>
        <p className="muted">30 ngày gần nhất ({d(s.revenue.from)} – {d(s.revenue.to)})</p>
        <Kpi items={[['Phòng bán được', s.rooms.totalSellable], ['Đang có khách', s.rooms.occupiedNow], ['Còn trống', s.rooms.availableNow], ['Tổng số đơn', s.bookings.total], ['Đơn chờ duyệt', s.bookings.pendingApproval], ['Doanh thu đã thực hiện', money(s.revenue.realized.hotelShareVnd)], ['Doanh thu dự kiến', money(s.revenue.expected.hotelShareVnd)]]} />
        <p className="muted">{Object.entries(s.bookings.byStatus).filter(([, v]) => v.count).map(([k, v]) => `${BOOKING_LABEL[k] || k}: ${v.count}`).join(' · ') || 'Chưa có đơn trong kỳ.'}</p>
      </>
    )}</LoadView>
  );
}

function Detail({ id, onBack }) {
  const { state } = useApp();
  const s = state.session;
  const manage = hasPerm(s, PERM.ADMIN_HOTEL_MANAGE);
  const sensitive = hasPerm(s, PERM.ADMIN_HOTEL_APPROVE_SENSITIVE);
  const r = useLoad(`/hotels/${id}`);
  const [edit, setEdit] = useState(false);
  const { run, node } = useRun();
  const act = (fn, ok) => async (reason) => { const x = await run(() => fn(reason), ok); if (x.ok) r.reload(); return x; };
  return (
    <>
      <Back onClick={onBack} />
      <LoadView r={r}>{({ hotel: h }) => {
        const pend = h.payoutAccount?.pendingChange;
        return (
          <div data-testid="hotel-detail">
            <h2>{h.code} · {h.name} <St s={h.status} /></h2>
            <p className="muted">{h.address?.line}, {h.address?.city} · {h.contact?.phone} · Sân bay {(h.airports || []).map((a) => `${a.iata} ${a.km}km`).join(', ')} · Duyệt tay: {h.approval?.manual ? `có${h.approval.manualUntil ? ` đến ${d(h.approval.manualUntil)}` : ''}` : 'không'} · Cập nhật {dt(h.updatedAt)}</p>
            {node}
            {manage && (
              <div className="row-actions" data-testid="hotel-actions">
                {h.status === 'PENDING_APPROVAL' && <><Act label="Duyệt" confirm="Duyệt khách sạn này và kích hoạt tài khoản chủ?" onDo={act(() => hotelAction(id, 'approve'), 'Đã duyệt khách sạn.')} testid="h-approve" />
                  <Act label="Từ chối" danger reason onDo={act((rs) => hotelAction(id, 'reject', rs), 'Đã từ chối khách sạn.')} testid="h-reject" /></>}
                {h.status === 'ACTIVE' && <Act label="Tạm ngưng" danger reason onDo={act((rs) => hotelAction(id, 'suspend', rs), 'Đã tạm ngưng. Đơn đang có không tự hủy, hãy kiểm tra thủ công.')} testid="h-suspend" />}
                {(h.status === 'SUSPENDED' || h.status === 'HIDDEN_DEBT') && <Act label="Kích hoạt lại" confirm="Kích hoạt lại khách sạn?" onDo={act(() => hotelAction(id, 'activate'), 'Đã kích hoạt lại.')} testid="h-activate" />}
                <button type="button" className="btn btn-sm" onClick={() => setEdit(!edit)} data-testid="h-edit">Sửa thông tin</button>
              </div>
            )}
            {edit && <EditForm h={h} onDone={() => { setEdit(false); r.reload(); }} />}
            <section className="card"><h3>Tài khoản nhận tiền</h3>
              <p>Hiện tại: <strong data-testid="payout-current">{h.payoutAccount?.labelMasked || 'Chưa có'}</strong>{h.payoutAccount?.verifiedAt ? ` · xác minh ${dt(h.payoutAccount.verifiedAt)}` : ''}</p>
              {pend && (
                <Notice tone="warn" title="Có đề xuất đổi tài khoản chờ duyệt"><span data-testid="payout-pending">{pend.labelMasked}</span> · đề xuất lúc {dt(pend.requestedAt)} bởi {String(pend.requestedBy).slice(0, 8)}
                  {sensitive ? (
                    <div className="row-actions">
                      {pend.requestedBy === s.id ? <small>Bạn là người đề xuất nên không thể tự duyệt (cần Admin khác); vẫn có thể từ chối để rút lại.</small>
                        : <Act label="Duyệt đổi" confirm="Duyệt đổi tài khoản nhận tiền?" onDo={act(() => payoutDecision(id, true), 'Đã duyệt đổi tài khoản nhận tiền.')} testid="p-approve" />}
                      <Act label="Từ chối / rút lại" danger reason onDo={act((rs) => payoutDecision(id, false, rs), 'Đã từ chối đề xuất.')} testid="p-reject" />
                    </div>
                  ) : <div><small>Bạn không có quyền duyệt thay đổi này.</small></div>}
                </Notice>
              )}
              {manage && !pend && <PayoutForm id={id} onDone={r.reload} />}
            </section>
            <section className="card"><h3>Thống kê</h3><Stats id={id} /></section>
          </div>
        );
      }}</LoadView>
    </>
  );
}

export default function Hotels() {
  const { state } = useApp();
  const manage = hasPerm(state.session, PERM.ADMIN_HOTEL_MANAGE);
  const [q, setQ] = useState({});
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const p = usePaged('/hotels', q, 'after');
  if (sel) return <><ScreenTitle title="Khách sạn" /><Detail id={sel} onBack={() => { setSel(null); p.reload(); }} /></>;
  return (
    <>
      <ScreenTitle title="Khách sạn">
        Đối tác và duyệt.{' '}
        {manage && !creating && <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)} data-testid="hotel-new">Đăng ký đối tác</button>}
      </ScreenTitle>
      {creating && <CreateForm onCancel={() => setCreating(false)} onDone={(h) => { setCreating(false); setSel(h.id); }} />}
      <Filters fields={[['q', 'Tên khách sạn'], ['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])], ['airport', 'Sân bay (HAN)'], ['pendingPayout', 'Đổi TK nhận tiền', 'text', [['true', 'Đang chờ duyệt']]]]} onApply={setQ} />
      <PagedView p={p} empty="Không có khách sạn khớp bộ lọc.">
        <Table rows={p.items} cols={[['Mã', (h) => <button type="button" className="link-btn" onClick={() => setSel(h.id)} data-testid="open-hotel">{h.code}</button>], ['Tên', (h) => h.name], ['Trạng thái', (h) => <St s={h.status} />], ['Sân bay', (h) => (h.airports || []).map((a) => a.iata).join(', ')], ['Duyệt tay', (h) => h.approval?.manual ? 'Có' : 'Không'], ['Đổi TK chờ', (h) => h.payoutAccount?.pendingChange ? <Pill tone="warn">Chờ</Pill> : '—'], ['Cập nhật', (h) => dt(h.updatedAt)]]} />
      </PagedView>
    </>
  );
}
