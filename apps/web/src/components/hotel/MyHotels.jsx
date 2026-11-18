import React, { useEffect, useRef, useState } from 'react';
import { DataTable, EmptyState, FormField as Field, Modal, PageHeader, StatusBadge, ConfirmAction } from '../ui';
import { Tag } from '../ui/StatusBadge';
import { describeError } from '../../lib/api';
import { useApp } from '../../state/store';
import { createMyHotel, listMyHotels, pauseChain, pauseHotel, resumeChain, resumeHotel, submitMyHotel, switchWorkingHotel } from '../../data/business';
import { geocodeAddress } from '../../lib/geocode';
import { hotelCodeFrom } from '../../lib/hotelCode';
import { useRoute } from '../../lib/route';
import LocationPicker from '../admin/LocationPicker';
import { AirportSelect, useAirports } from '../admin/kit';
import { useAction, useLoad } from './kit';

export const HOTEL_ST = { DRAFT: ['Nháp', 'neutral'], PENDING_APPROVAL: ['Chờ duyệt', 'warn'], ACTIVE: ['Đang hoạt động', 'ok'], SUSPENDED: ['Tạm ngưng', 'error'], HIDDEN_DEBT: ['Ẩn do công nợ', 'error'] };
const NAME_TAKEN = 'Tên khách sạn đã tồn tại. Hãy chọn tên khác.';

// Form tạo khách sạn ở trạng thái DRAFT (khung: tên, địa chỉ, vị trí, sân bay, điện thoại). Dịch vụ/phòng khai báo ở các tab riêng sau khi tạo.
function CreateHotel({ onCancel, onCreated }) {
  const [f, setF] = useState({ name: '', line: '', city: '', iata: 'HAN', km: '10', minutes: '20', phone: '' });
  const [pos, setPos] = useState(null);
  const [geoMsg, setGeoMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { items: airports, err: airErr } = useAirports();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const airport = airports.find((a) => a.iata === f.iata) ?? null;
  const route = useRoute(pos, airport); // km và phút tự tính theo vị trí (như form quản trị)
  useEffect(() => { if (route) setF((x) => ({ ...x, km: String(route.km), minutes: String(route.minutes) })); }, [route]);
  const touched = useRef(false);
  const setPlace = (p) => { touched.current = true; setPos(p); setGeoMsg(''); };
  const autoLocate = async () => {
    if (touched.current || !f.line.trim()) return;
    try {
      const p = await geocodeAddress(f.line, f.city);
      if (p && !touched.current) { setPos({ lat: p.lat, lng: p.lng }); setGeoMsg(p.approx ? 'Chỉ tìm được gần đúng. Bấm vào bản đồ để kéo ghim đúng vị trí.' : 'Đã đặt vị trí theo địa chỉ. Bấm vào bản đồ để chỉnh nếu lệch.'); }
      else if (!p) setGeoMsg('Không tìm thấy địa chỉ trên OpenStreetMap. Bấm vào bản đồ để chọn vị trí.');
    } catch { setGeoMsg('Không kết nối được OpenStreetMap. Bấm vào bản đồ để chọn vị trí.'); }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!pos) { setGeoMsg('Chọn vị trí khách sạn trên bản đồ (nhập địa chỉ để tự đặt, hoặc bấm vào bản đồ).'); return; }
    setBusy(true); setErr('');
    const body = { name: f.name.trim(), address: { line: f.line.trim(), city: f.city.trim(), country: 'VN' }, location: { lng: pos.lng, lat: pos.lat },
      airports: [{ iata: f.iata, km: Number(f.km), minutes: Math.round(Number(f.minutes)) }], contact: { phone: f.phone.trim() } };
    try {
      let r;
      for (let i = 0; ; i++) { // mã tự sinh; trùng mã thì thêm hậu tố ngẫu nhiên và thử lại (tối đa 5 lần)
        try { r = await createMyHotel({ ...body, code: hotelCodeFrom(f.iata, f.name, i) }); break; } catch (x) { if (x?.code !== 'HOTEL_CODE_EXISTS' || i >= 4) throw x; }
      }
      onCreated(r.hotel);
    } catch (x) { setErr(x?.code === 'HOTEL_NAME_EXISTS' ? NAME_TAKEN : x?.code === 'HOTEL_CODE_EXISTS' ? 'Không tạo được mã khách sạn duy nhất, hãy đổi tên khác.' : describeError(x)); setBusy(false); }
  };
  const inp = (k, label, props = {}) => <Field id={`mh-${k}`} label={label} required><input id={`mh-${k}`} value={f[k]} onChange={set(k)} required {...props} /></Field>;
  return (
    <Modal open onClose={onCancel} title="Tạo khách sạn mới" size="lg">
      <form onSubmit={submit} data-testid="mh-form">
        {err && <p className="field-error" role="alert" data-testid="mh-error">{err}</p>}
        {airErr && <p className="field-error" role="alert">{airErr}</p>}
        <div className="grid-2">
          {inp('name', 'Tên khách sạn', { minLength: 2, maxLength: 150 })}
          <Field id="mh-code" label="Mã khách sạn" hint="Tự sinh từ sân bay và tên"><input id="mh-code" value={hotelCodeFrom(f.iata, f.name)} readOnly aria-readonly="true" data-testid="mh-code" /></Field>
          {inp('line', 'Địa chỉ', { onBlur: autoLocate })}{inp('city', 'Thành phố', { onBlur: autoLocate })}
          <div style={{ gridColumn: '1 / -1' }}>
            <LocationPicker value={pos} onChange={setPlace} line={f.line} city={f.city} airport={airport} route={route} fallback={airport} />
            {geoMsg && <p className="muted" role="status" style={{ margin: '6px 0 0' }}>{geoMsg}</p>}
          </div>
          <Field id="mh-iata" label="Sân bay gần nhất" required><AirportSelect id="mh-iata" airports={airports} value={f.iata} onChange={set('iata')} /></Field>
          {inp('km', 'Cách sân bay (km), tự tính theo vị trí', { type: 'number', min: 0, max: 200, step: 'any' })}
          {inp('minutes', 'Thời gian di chuyển (phút), tự tính', { type: 'number', min: 0, max: 600 })}
          {inp('phone', 'Điện thoại liên hệ', { minLength: 8, maxLength: 20 })}
        </div>
        <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="mh-submit">{busy ? 'Đang tạo…' : 'Tạo khách sạn'}</button><button type="button" className="btn" onClick={onCancel}>Huỷ</button></div>
      </form>
    </Modal>
  );
}

// Tab "Khách sạn của tôi": chủ doanh nghiệp xem, tạo (DRAFT), gửi hồ sơ và chuyển sang làm việc với từng khách sạn.
export default function MyHotels() {
  const { state, dispatch } = useApp();
  const cur = state.session?.hotelId;
  const list = useLoad(() => listMyHotels(), []);
  const [creating, setCreating] = useState(false);
  const { run, note } = useAction();
  const items = list.data?.items ?? [];
  const chainPaused = !!list.data?.chain?.pausedAt;
  const done = (fn) => async (...a) => { await fn(...a); list.reload(); };
  const sync = (rows) => dispatch({ type: 'hotels', hotels: rows.map(({ id, code, name, status }) => ({ id, code, name, status })) });
  useEffect(() => { if (list.data) sync(list.data.items); }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const doSwitch = (id) => run(async () => { const r = await switchWorkingHotel(id); dispatch({ type: 'switchHotel', hotelId: r.hotel.id, hotels: r.hotels }); }, 'Đã chuyển khách sạn đang làm việc.');
  const created = async (h) => {
    setCreating(false);
    if (!cur) { await doSwitch(h.id); dispatch({ type: 'partnerTab', id: 'myHotels' }); } // khách sạn đầu tiên: chuyển sang luôn để mở các tab làm việc, ở lại tab này
    list.reload();
  };
  const columns = [
    { key: 'code', header: 'Mã', render: (h) => <strong>{h.code}</strong> },
    { key: 'name', header: 'Tên', render: (h) => <>{h.name}{h.id === cur && <> <Tag tone="info">Đang làm việc</Tag></>}</> },
    { key: 'status', header: 'Trạng thái', render: (h) => <><StatusBadge status={h.status} map={HOTEL_ST} />{h.pausedAt && <> <Tag tone="warn">Tạm dừng nhận đặt</Tag></>}{!h.pausedAt && chainPaused && h.status === 'ACTIVE' && <> <Tag tone="warn">Chuỗi đang dừng</Tag></>}</> },
    { key: 'addr', header: 'Địa chỉ', render: (h) => [h.address?.line, h.address?.city].filter(Boolean).join(', ') },
    { key: 'act', header: 'Thao tác', render: (h) => (
      <div className="row-actions" style={{ margin: 0 }}>
        {h.id !== cur && <button type="button" className="btn btn-sm" onClick={() => doSwitch(h.id)} data-testid="mh-switch">Chuyển sang làm việc</button>}
        {h.status === 'ACTIVE' && !h.pausedAt && <ConfirmAction label="Tạm dừng nhận đặt" title="Tạm dừng nhận đặt mới" ask="Khách sạn sẽ ẩn khỏi tìm kiếm và không nhận đặt mới. Đơn đã đặt và khách đang lưu trú vẫn tiếp tục." confirmLabel="Tạm dừng" reason={{ label: 'Lý do', minLength: 3 }} testid="mh-pause"
          onConfirm={done((r) => pauseHotel(h.id, r))} />}
        {h.pausedAt && <ConfirmAction label="Mở lại nhận đặt" ask="Khách sạn sẽ hiện lại và nhận đặt mới." confirmLabel="Mở lại" testid="mh-resume" onConfirm={done(() => resumeHotel(h.id))} />}
        {h.status === 'DRAFT' && <ConfirmAction label="Gửi hồ sơ" ask="Gửi hồ sơ khách sạn này cho quản trị viên duyệt?" confirmLabel="Gửi hồ sơ" testid="mh-submit-hotel"
          onConfirm={async () => { await submitMyHotel(h.id); list.reload(); }} />}
      </div>) },
  ];
  return (
    <>
      <PageHeader title="Khách sạn của tôi" description="Các khách sạn thuộc doanh nghiệp của bạn. Tạo khách sạn ở dạng nháp, gửi hồ sơ để Airrest duyệt, rồi khai báo phòng và giá ở các tab khác."
        actions={<div className="row-actions" style={{ margin: 0 }}>
          {chainPaused
            ? <ConfirmAction label="Mở lại cả chuỗi" ask="Mọi khách sạn đang hoạt động của chuỗi sẽ nhận đặt mới trở lại (trừ khách sạn bạn đã dừng riêng)." confirmLabel="Mở lại" testid="mh-chain-resume" onConfirm={done(() => resumeChain())} />
            : <ConfirmAction label="Dừng cả chuỗi" title="Tạm dừng nhận đặt cả chuỗi" ask="Mọi khách sạn của doanh nghiệp sẽ ẩn khỏi tìm kiếm và không nhận đặt mới. Đơn đã đặt và khách đang lưu trú vẫn tiếp tục." confirmLabel="Dừng cả chuỗi" tone="danger" reason={{ label: 'Lý do', minLength: 3 }} testid="mh-chain-pause" onConfirm={done((r) => pauseChain(r))} />}
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} data-testid="mh-new">Tạo khách sạn</button>
        </div>} />
      {chainPaused && <p className="field-error" role="status" data-testid="mh-chain-banner">Cả chuỗi đang tạm dừng nhận đặt mới{list.data.chain.pauseReason ? `: ${list.data.chain.pauseReason}` : ''}.</p>}
      {note}
      {!list.loading && !list.err && !items.length
        ? <EmptyState title="Chưa có khách sạn nào" testid="mh-empty" actions={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Tạo khách sạn đầu tiên</button>}>
            Bắt đầu bằng việc tạo khách sạn: nhập tên, địa chỉ, vị trí trên bản đồ và sân bay gần nhất. Sau đó gửi hồ sơ để quản trị viên duyệt.
          </EmptyState>
        : <DataTable columns={columns} rows={items} rowTestid="mh-row" loading={list.loading} error={list.err && describeError(list.err)} onRetry={list.reload} />}
      {creating && <CreateHotel onCancel={() => setCreating(false)} onCreated={created} />}
    </>
  );
}
