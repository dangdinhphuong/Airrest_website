import React, { useEffect, useRef, useState } from 'react';
import { Notice } from '../Common';
import { Kpi } from '../partner/ui';
import { DataTable, FormField as Field, Modal, PageHeader, StatusBadge, Tag } from '../ui';
import { money } from '../../lib/time';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { createHotel, hotelAction, patchHotel, payoutDecision, proposePayout } from '../../data/admin';
import { BOOKING_LABEL } from './Dashboard';
import { Act, AirportSelect, Filters, LoadView, cols, d, dt, isoOrUndef, pagedProps, airportLabel, useAirports, useLoad, usePaged, useRun } from './kit';
import Select from '../Select';
import LocationPicker from './LocationPicker';
import { geocodeAddress } from '../../lib/geocode';
import { hotelCodeFrom } from '../../lib/hotelCode';
import { useRoute } from '../../lib/route';

const ST = { DRAFT: ['Nháp / bị từ chối', 'neutral'], PENDING_APPROVAL: ['Chờ duyệt', 'warn'], ACTIVE: ['Đang hoạt động', 'ok'], SUSPENDED: ['Tạm ngưng', 'error'], HIDDEN_DEBT: ['Ẩn do công nợ', 'error'] };
const TPL = { FLEXIBLE: 'Linh hoạt', STANDARD: 'Tiêu chuẩn', NON_REFUNDABLE: 'Không hoàn' };
// Ngân hàng phổ biến (mã ngắn lưu vào bankCode). Không bắt buộc chọn.
const BANKS = [['VCB', 'Vietcombank'], ['CTG', 'VietinBank'], ['BIDV', 'BIDV'], ['VBA', 'Agribank'], ['TCB', 'Techcombank'], ['MB', 'MB Bank'], ['ACB', 'ACB'], ['VPB', 'VPBank'], ['TPB', 'TPBank'], ['STB', 'Sacombank'], ['HDB', 'HDBank'], ['VIB', 'VIB'], ['SHB', 'SHB'], ['OCB', 'OCB'], ['MSB', 'MSB'], ['SEAB', 'SeABank'], ['EIB', 'Eximbank'], ['LPB', 'LPBank'], ['NAB', 'Nam A Bank'], ['BAB', 'Bac A Bank'], ['ABB', 'ABBANK'], ['PVCB', 'PVcomBank'], ['SCB', 'SCB'], ['VAB', 'VietABank'], ['NCB', 'NCB'], ['BVB', 'BaoViet Bank'], ['KLB', 'KienlongBank'], ['VCCB', 'Ngân hàng Bản Việt'], ['CAKE', 'CAKE by VPBank'], ['TIMO', 'Timo']];
const St = ({ s }) => <StatusBadge status={s} map={ST} />;
const TplSelect = ({ id, value, onChange }) => <Select id={id} value={value} onChange={onChange}>{Object.entries(TPL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>;

function CreateForm({ onDone, onCancel }) {
  const [f, setF] = useState({ name: '', line: '', city: '', iata: 'HAN', km: '10', minutes: '20', phone: '', tpl: 'FLEXIBLE', buf: '0', businessId: '' });
  const { run, busy, node } = useRun();
  const { items: airports, err: airErr } = useAirports();
  const biz = usePaged('/businesses', { status: 'ACTIVE', limit: 100 }, 'after'); // chỉ doanh nghiệp đã duyệt
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [pos, setPos] = useState(null); // { lat, lng } chọn trên bản đồ
  const airport = airports.find((a) => a.iata === f.iata) ?? null;
  const route = useRoute(pos, airport); // quãng đường ô tô tới sân bay; km và phút điền tự động theo
  useEffect(() => { if (route) setF((x) => ({ ...x, km: String(route.km), minutes: String(route.minutes) })); }, [route]);
  const [geoMsg, setGeoMsg] = useState('');
  const touched = useRef(false); // người dùng đã chỉnh tay vị trí: không tự ghi đè nữa
  const setPlace = (p) => { touched.current = true; setPos(p); setGeoMsg(''); };
  // Rời ô địa chỉ/thành phố mà đã có cả hai: tự đặt vị trí theo OpenStreetMap (một lần theo thao tác, đúng chính sách ≤1 yêu cầu/giây).
  const autoLocate = async () => {
    if (touched.current || !f.line.trim()) return;
    try {
      const p = await geocodeAddress(f.line, f.city);
      if (p && !touched.current) { setPos({ lat: p.lat, lng: p.lng }); setGeoMsg(p.approx ? 'Chỉ tìm được gần đúng (theo đường/khu vực). Bấm vào bản đồ để kéo ghim đúng vị trí khách sạn.' : 'Đã đặt vị trí theo địa chỉ. Bấm vào bản đồ để chỉnh nếu lệch.'); }
      else if (!p) setGeoMsg('Không tìm thấy địa chỉ trên OpenStreetMap. Bản đồ để mặc định quanh sân bay, bấm vào để chọn vị trí.');
    } catch { setGeoMsg('Không kết nối được OpenStreetMap. Bản đồ để mặc định quanh sân bay, bấm vào để chọn vị trí.'); }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!pos) { setGeoMsg('Chọn vị trí khách sạn trên bản đồ (nhập địa chỉ để tự đặt, hoặc bấm vào bản đồ).'); return; }
    const body = {
      name: f.name,
      address: { line: f.line, city: f.city, country: 'VN' }, location: { lng: pos.lng, lat: pos.lat },
      airports: [{ iata: f.iata, km: Number(f.km), minutes: Number(f.minutes) }], amenities: [], contact: { phone: f.phone },
      policy: { cancellationTemplate: f.tpl, cleaningBufferMin: Number(f.buf) },
      businessId: f.businessId,
    };
    // Mã tự sinh từ sân bay + tên; trùng thì thêm hậu tố ngẫu nhiên và thử lại (tối đa 5 lần).
    const make = async () => {
      for (let i = 0; ; i++) {
        try { return await createHotel({ ...body, code: hotelCodeFrom(f.iata, f.name, i) }); } catch (err) { if (err?.code !== 'HOTEL_CODE_EXISTS' || i >= 4) throw err; }
      }
    };
    const x = await run(make, 'Đã tạo khách sạn (chờ duyệt) cho doanh nghiệp.');
    if (x.ok) onDone(x.r.hotel);
  };
  const inp = (k, label, props = {}) => <Field id={`ch-${k}`} label={label}><input id={`ch-${k}`} value={f[k]} onChange={set(k)} required {...props} /></Field>;
  return (
    <Modal open onClose={onCancel} title="Đăng ký đối tác mới" size="lg">
    <form onSubmit={submit} data-testid="hotel-create">
      {node}{airErr && <p className="field-error" role="alert">{airErr}</p>}
      <div className="grid-2">
        {inp('name', 'Tên khách sạn', { minLength: 2 })}<Field id="ch-code" label="Mã khách sạn"><input id="ch-code" value={hotelCodeFrom(f.iata, f.name)} readOnly aria-readonly="true" data-testid="ch-code" title="Tự sinh từ sân bay và tên khách sạn" /></Field>
        {inp('line', 'Địa chỉ', { onBlur: autoLocate })}{inp('city', 'Thành phố', { onBlur: autoLocate })}
        <div style={{ gridColumn: '1 / -1' }}>
          <LocationPicker value={pos} onChange={setPlace} line={f.line} city={f.city} airport={airport} route={route} fallback={airport} />
          {geoMsg && <p className="muted" role="status" style={{ margin: '6px 0 0' }}>{geoMsg}</p>}
        </div>
        <Field id="ch-iata" label="Sân bay (IATA)"><AirportSelect id="ch-iata" airports={airports} value={f.iata} onChange={set('iata')} data-testid="ch-iata" /></Field>{inp('km', 'Cách sân bay (km) — tự tính theo vị trí', { type: 'number', min: 0, step: 'any' })}
        {inp('minutes', 'Thời gian di chuyển (phút) — tự tính', { type: 'number', min: 0 })}{inp('phone', 'Điện thoại liên hệ', { minLength: 8 })}
        <Field id="ch-tpl" label="Chính sách hủy"><TplSelect id="ch-tpl" value={f.tpl} onChange={set('tpl')} /></Field>{inp('buf', 'Đệm dọn phòng (phút)', { type: 'number', min: 0 })}
        <Field id="ch-biz" label="Doanh nghiệp (đã duyệt)" hint={!biz.loading && !biz.items.length ? 'Chưa có doanh nghiệp nào được duyệt. Duyệt hồ sơ ở tab Doanh nghiệp trước.' : undefined}>
          <Select id="ch-biz" value={f.businessId} onChange={set('businessId')} required data-testid="ch-biz">
            <option value="">{biz.loading ? 'Đang tải…' : '— Chọn doanh nghiệp —'}</option>
            {biz.items.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.taxCode})</option>)}
          </Select>
        </Field>
      </div>
      <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="hotel-create-submit">Tạo</button><button type="button" className="btn" onClick={onCancel}>Huỷ</button></div>
    </form>
    </Modal>
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
    <Modal open onClose={onDone} title="Sửa thông tin khách sạn" size="lg">
    <form onSubmit={submit} data-testid="hotel-edit">
      {node}
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
    </Modal>
  );
}

function PayoutForm({ id, onDone }) {
  const [f, setF] = useState({ type: 'BANK', accountNo: '', accountName: '', bankCode: '' });
  const { run, busy, node } = useRun();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = f.type === 'BANK' ? { type: 'BANK', accountNo: f.accountNo, accountName: f.accountName, ...(f.bankCode.trim() && { bankCode: f.bankCode.trim() }) } : { type: 'MOMO', accountNo: f.accountNo, accountName: f.accountName };
    const x = await run(() => proposePayout(id, body), 'Đã cập nhật tài khoản nhận tiền.');
    if (x.ok) { setF({ ...f, accountNo: '' }); onDone(); }
  };
  return (
    <form onSubmit={submit} data-testid="payout-form">
      {node}
      <div className="grid-2">
        <Field id="po-type" label="Loại"><Select id="po-type" value={f.type} onChange={set('type')}><option value="BANK">Ngân hàng</option><option value="MOMO">Ví MoMo</option></Select></Field>
        <Field id="po-no" label={f.type === 'BANK' ? 'Số tài khoản' : 'SĐT ví MoMo'}><input id="po-no" required value={f.accountNo} onChange={set('accountNo')} autoComplete="off" /></Field>
        <Field id="po-name" label="Tên chủ tài khoản"><input id="po-name" required minLength={2} value={f.accountName} onChange={set('accountName')} /></Field>
        {f.type === 'BANK' && <Field id="po-bank" label="Ngân hàng (không bắt buộc)"><Select id="po-bank" value={f.bankCode} onChange={set('bankCode')} data-testid="po-bank"><option value="">Chưa chọn</option>{BANKS.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</Select></Field>}
      </div>
      <button className="btn btn-sm btn-primary" disabled={busy} data-testid="payout-propose">Lưu tài khoản</button>
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
      <LoadView r={r} head={<PageHeader title="Khách sạn" back={{ onClick: onBack }} />}>{({ hotel: h }) => {
        const pend = h.payoutAccount?.pendingChange;
        return (
          <div data-testid="hotel-detail">
            <PageHeader title={`${h.code} · ${h.name}`} back={{ onClick: onBack }} description={<St s={h.status} />} />
            <p className="muted">{h.address?.line}, {h.address?.city} · {h.contact?.phone} · Sân bay {(h.airports || []).map((a) => `${a.iata} ${a.km}km`).join(', ')} · Duyệt tay: {h.approval?.manual ? `có${h.approval.manualUntil ? ` đến ${d(h.approval.manualUntil)}` : ''}` : 'không'} · Cập nhật {dt(h.updatedAt)}</p>
            {node}
            {manage && (
              <div className="row-actions" data-testid="hotel-actions" style={{ marginTop: 0, marginBottom: 12 }}>
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
                <Notice tone="warn" title="Còn một đề xuất đổi tài khoản từ trước (chờ duyệt)"><span data-testid="payout-pending">{pend.labelMasked}</span> · đề xuất lúc {dt(pend.requestedAt)} bởi {String(pend.requestedBy).slice(0, 8)}
                  {sensitive ? (
                    <div className="row-actions">
                      <Act label="Duyệt đổi" confirm="Duyệt đổi tài khoản nhận tiền?" onDo={act(() => payoutDecision(id, true), 'Đã duyệt đổi tài khoản nhận tiền.')} testid="p-approve" />
                      <Act label="Từ chối / rút lại" danger reason onDo={act((rs) => payoutDecision(id, false, rs), 'Đã từ chối đề xuất.')} testid="p-reject" />
                    </div>
                  ) : <div><small>Bạn không có quyền duyệt thay đổi này.</small></div>}
                </Notice>
              )}
              {manage && <PayoutForm id={id} onDone={r.reload} />}
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
  const { items: airports } = useAirports();
  if (sel) return <Detail id={sel} onBack={() => { setSel(null); p.reload(); }} />;
  return (
    <>
      <PageHeader title="Khách sạn" description="Đối tác và duyệt."
        actions={manage && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} data-testid="hotel-new">Đăng ký đối tác</button>} />
      {creating && <CreateForm onCancel={() => setCreating(false)} onDone={(h) => { setCreating(false); setSel(h.id); }} />}
      <Filters fields={[['q', 'Tìm tên / mã / địa chỉ'], ['phone', 'SĐT chủ / liên hệ'], ['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])], ['airport', 'Sân bay', 'text', airports.map((a) => [a.iata, airportLabel(a)])], ['pendingPayout', 'Đổi TK nhận tiền', 'text', [['true', 'Đang chờ duyệt']]]]} onApply={setQ} />
      <DataTable empty="Không có khách sạn khớp bộ lọc." {...pagedProps(p)}
        columns={cols([['Mã', (h) => <button type="button" className="link-btn" onClick={() => setSel(h.id)} data-testid="open-hotel">{h.code}</button>], ['Tên', (h) => h.name], ['Trạng thái', (h) => <St s={h.status} />], ['Sân bay', (h) => (h.airports || []).map((a) => a.iata).join(', ')], ['Duyệt tay', (h) => h.approval?.manual ? 'Có' : 'Không'], ['Đổi TK chờ', (h) => h.payoutAccount?.pendingChange ? <Tag tone="warn">Chờ</Tag> : '—'], ['Cập nhật', (h) => dt(h.updatedAt)]])} />
    </>
  );
}
