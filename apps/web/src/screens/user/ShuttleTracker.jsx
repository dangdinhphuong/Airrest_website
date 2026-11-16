// Theo dõi xe đưa đón của một đơn: thanh trạng thái chung, thẻ xe + bản đồ, xe ngoài, gọi xe ngay, hủy xe, nhật ký.
// Dữ liệu đầu: kết quả tra cứu (lookup). Sau đó chỉ dùng GET /v1/track/shuttle (token theo dõi) + socket 'shuttle:update'/'trip:position'.
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Car, Check, Clock3, Copy, ExternalLink, Headphones, Phone, Wifi, WifiOff, XCircle } from 'lucide-react';
import { airportName, callShuttleNow, cancelShuttle, describeApiError, getTrackState, listAirports } from '../../data/user';
import { buildRideText, copyText, setSupportPrefill } from './data';
import { connectRealtime } from '../../lib/socket';
import { money } from '../../lib/time';
import Select from '../../components/Select';

const TripMap = lazy(() => import('./TripMap')); // kéo theo leaflet: chỉ tải khi có bản đồ

const POLL_MS = 7000; // socket mất
const SAFETY_POLL_MS = 30000; // socket đang nối
const THROTTLE_MS = 1000;
const BTN = 'tw:min-h-11 tw:rounded-xl tw:px-4 tw:text-xs tw:font-bold tw:disabled:opacity-60';
const dmyHm = (iso) => new Date(iso).toLocaleString('vi-VN', { hour12: false, dateStyle: 'short', timeStyle: 'short' });
const hm = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const DIRECTION = { TO_HOTEL: 'Đón từ sân bay', TO_AIRPORT: 'Ra sân bay' };
const ACTIVE = ['REQUESTED', 'ASSIGNED'];

export function useTrackLive(initial, token, onExpired) {
  const [data, setData] = useState(initial);
  const [conn, setConn] = useState('connecting');
  const [positions, setPositions] = useState({});
  const [expired, setExpired] = useState(false);
  const ver = useRef(0);
  const expRef = useRef(onExpired); expRef.current = onExpired;
  const refresh = useCallback(async () => {
    const v = ++ver.current;
    try {
      const d = await getTrackState(token);
      if (v !== ver.current) return;
      setData(d); setPositions({}); setExpired(false);
    } catch (e) { if (e?.status === 401) { setExpired(true); expRef.current?.(); } }
  }, [token]);
  useEffect(() => { setData(initial); setPositions({}); setExpired(false); }, [initial]);

  useEffect(() => {
    let timer = null; let last = 0; let closed = false;
    const kick = () => { if (timer) return; timer = setTimeout(() => { timer = null; last = Date.now(); refresh(); }, Math.max(0, THROTTLE_MS - (Date.now() - last))); };
    const stop = connectRealtime({
      token,
      onState: (s) => !closed && setConn(s),
      onEvent: (name, p) => {
        if (name === 'shuttle:update') kick();
        else if (name === 'trip:position' && p?.tripId) setPositions((m) => ({ ...m, [p.tripId]: p }));
      },
    });
    return () => { closed = true; clearTimeout(timer); stop(); };
  }, [token, refresh]);

  useEffect(() => {
    if (expired) return undefined;
    const id = setInterval(refresh, conn === 'online' ? SAFETY_POLL_MS : POLL_MS);
    return () => clearInterval(id);
  }, [conn, refresh, expired]);

  return { ...data, conn, positions, expired, refresh };
}

// ---- Thanh trạng thái chung ----
export function TrackStepper({ stage, shuttles }) {
  if (stage === 'CANCELLED') return <p role="status" className="tw:mt-5 tw:flex tw:items-center tw:gap-2 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-bold tw:text-rose-800"><XCircle size={16} /> Đơn đã hủy hoặc không còn hiệu lực.</p>;
  const has = (d) => shuttles.some((s) => s.direction === d && s.status !== 'CANCELLED');
  const steps = [['BOOKED', 'Đặt phòng'], has('TO_HOTEL') && ['PICKUP_IN', 'Xe đón'], ['CHECKED_IN', 'Nhận phòng'], ['CHECKED_OUT', 'Trả phòng'], has('TO_AIRPORT') && ['PICKUP_OUT', 'Xe ra sân bay'], ['DONE', 'Hoàn tất']].filter(Boolean);
  const order = ['BOOKED', 'PICKUP_IN', 'CHECKED_IN', 'CHECKED_OUT', 'PICKUP_OUT', 'DONE'];
  const cur = order.indexOf(stage);
  return (
    <ol aria-label="Tiến trình đơn" data-testid="track-stepper" className="tw:mt-5 tw:grid tw:list-none tw:gap-1 tw:p-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map(([k, label]) => {
        const i = order.indexOf(k); const done = i < cur || stage === 'DONE'; const on = k === stage;
        return (
          <li key={k} aria-current={on ? 'step' : undefined} className="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:text-center">
            <span className={`tw:grid tw:size-7 tw:place-items-center tw:rounded-full tw:text-[11px] tw:font-bold ${done ? 'tw:bg-emerald-600 tw:text-white' : on ? 'tw:bg-blue-600 tw:text-white tw:ring-4 tw:ring-blue-100' : 'tw:bg-slate-200 tw:text-slate-500'}`}>{done ? <Check size={14} /> : steps.findIndex((s) => s[0] === k) + 1}</span>
            <span className={`tw:text-[11px] tw:leading-3 ${on ? 'tw:font-bold tw:text-blue-700' : 'tw:text-slate-500'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Thẻ xe ----
const TRIP_STEPS = ['Đang tìm xe', 'Xe đã nhận chuyến', 'Đã tới điểm đón', 'Đã lên xe', 'Đã trả khách'];
const TRIP_IDX = { SEARCHING: 0, NEEDS_EXTERNAL: 0, ACCEPTED: 1, EN_ROUTE: 1, ARRIVED: 2, ONBOARD: 3, DROPPED_OFF: 4 };
const PHASE = { APPROACH: 'Xe đang tới điểm đón', RIDE: 'Đang trên đường tới điểm trả', ARRIVED: 'Đã tới nơi', DONE: 'Hoàn tất' };
const etaText = (sec) => (sec == null ? null : sec < 60 ? 'dưới 1 phút' : `khoảng ${Math.round(sec / 60)} phút`);

function TripSteps({ status }) {
  const idx = TRIP_IDX[status] ?? 0;
  return (
    <ol aria-label="Trạng thái chuyến" className="tw:mt-3 tw:flex tw:list-none tw:flex-wrap tw:gap-x-3 tw:gap-y-1 tw:p-0 tw:text-[11px]">
      {TRIP_STEPS.map((l, i) => <li key={l} aria-current={i === idx ? 'step' : undefined} className={i === idx ? 'tw:font-bold tw:text-blue-700' : i < idx ? 'tw:text-emerald-700' : 'tw:text-slate-400'}>{i < idx ? '✓ ' : i === idx ? '● ' : '○ '}{l}</li>)}
    </ol>
  );
}

function Avatar({ name, url }) {
  const [bad, setBad] = useState(false);
  const letter = (String(name ?? '?').trim().split(/\s+/).pop()?.[0] ?? '?').toUpperCase();
  return url && !bad
    ? <img src={url} alt={`Ảnh tài xế ${name}`} onError={() => setBad(true)} data-testid="driver-photo" className="tw:size-14 tw:shrink-0 tw:rounded-full tw:object-cover" />
    : <span data-testid="driver-avatar" aria-hidden="true" className="tw:grid tw:size-14 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-blue-600 tw:text-xl tw:font-bold tw:text-white">{letter}</span>;
}

function OwnTrip({ trip, position, idx, total }) {
  const { vehicle: v, driver: d } = trip;
  const eta = etaText(position?.etaSec);
  const showMap = (trip.route?.approach?.length > 1 || trip.route?.ride?.length > 1) && !['DROPPED_OFF', 'CANCELLED'].includes(trip.status);
  return (
    <div data-testid="own-trip" className="tw:mt-3 tw:rounded-xl tw:border tw:border-slate-200 tw:p-4">
      {total > 1 && <p className="tw:mb-2 tw:text-[11px] tw:font-bold tw:text-slate-500">Xe {idx + 1}/{total}</p>}
      {d ? (
        <div className="tw:flex tw:items-center tw:gap-3">
          <Avatar name={d.name} url={d.photoUrl} />
          <div className="tw:min-w-0 tw:text-xs">
            <strong className="tw:block tw:text-sm">{d.name}</strong>
            <span className="tw:block tw:text-slate-600">{v?.plate}{v?.model ? ` · ${v.model}` : ''}{v?.seats ? ` · ${v.seats} chỗ` : ''}</span>
            {d.phone && <a href={`tel:${d.phone}`} className="tw:mt-1 tw:inline-flex tw:items-center tw:gap-1 tw:font-bold tw:text-blue-700"><Phone size={13} /> {d.phone}</a>}
          </div>
        </div>
      ) : <p className="tw:text-xs tw:text-slate-600">Đang tìm xe cho {trip.seats} chỗ…</p>}
      <TripSteps status={trip.status} />
      {position && ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD'].includes(trip.status) && (
        <p data-testid="trip-eta" className="tw:mt-2 tw:flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:text-slate-700"><Clock3 size={13} /> {PHASE[position.phase] ?? position.phase}{eta && position.phase !== 'ARRIVED' && position.phase !== 'DONE' ? ` · dự kiến tới ${eta}` : ''}</p>
      )}
      {showMap && <Suspense fallback={<p className="tw:mt-3 tw:text-xs tw:text-slate-500">Đang tải bản đồ…</p>}><TripMap route={trip.route} position={position} /></Suspense>}
    </div>
  );
}

function ExternalTrip({ trip }) {
  const https = typeof trip.shareUrl === 'string' && trip.shareUrl.startsWith('https://');
  const label = { GRAB: 'Grab', XANHSM: 'Xanh SM' }[trip.provider] ?? 'hãng xe';
  if (trip.status === 'NEEDS_EXTERNAL' || !https) {
    return <p role="status" data-testid="external-wait" className="tw:mt-3 tw:flex tw:items-start tw:gap-2 tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:leading-5 tw:text-amber-900"><Clock3 size={16} className="tw:mt-0.5 tw:shrink-0" /> {trip.message}</p>;
  }
  return (
    <div data-testid="external-trip" className="tw:mt-3 tw:rounded-xl tw:border tw:border-slate-200 tw:p-4 tw:text-xs">
      <strong className="tw:text-sm">Xe ngoài ({label})</strong>
      {trip.simulated && <span className="tw:ml-2 tw:rounded-full tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-[11px] tw:font-bold tw:text-amber-800">Mô phỏng</span>}
      {(trip.driver?.name || trip.vehicle?.plate) && <p className="tw:mt-1 tw:text-slate-600">{[trip.driver?.name, trip.vehicle?.plate].filter(Boolean).join(' · ')}</p>}
      {trip.driver?.phone && <a href={`tel:${trip.driver.phone}`} className="tw:mt-1 tw:inline-flex tw:items-center tw:gap-1 tw:font-bold tw:text-blue-700"><Phone size={13} /> {trip.driver.phone}</a>}
      {trip.etaAt && <p className="tw:mt-1 tw:text-slate-600">Dự kiến tới lúc {dmyHm(trip.etaAt)}</p>}
      <a href={trip.shareUrl} target="_blank" rel="noopener noreferrer" className="tw:mt-3 tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-emerald-600 tw:px-4 tw:font-bold tw:text-white"><ExternalLink size={15} /> Xem hành trình trên {label}</a>
      <p className="tw:mt-2 tw:text-[11px] tw:text-slate-500">Liên kết mở trang {trip.shareHost}. Bản đồ do ứng dụng của hãng cung cấp.</p>
    </div>
  );
}

const noShare = (t) => t.kind === 'EXTERNAL' && (t.status === 'NEEDS_EXTERNAL' || !(typeof t.shareUrl === 'string' && t.shareUrl.startsWith('https://')));
const LINK = 'tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-slate-300 tw:bg-white tw:px-4 tw:text-xs tw:font-bold tw:text-slate-700';

// Khách sạn hết xe và chưa gọi được xe ngoài: khách tự gọi xe (chỉ sao chép thông tin + mở trang chính thức của hãng, không đặt hộ, không deeplink).
function SelfRide({ s, hotel, code, phone }) {
  const [copied, setCopied] = useState('');
  const [fail, setFail] = useState(false);
  useEffect(() => { listAirports().catch(() => {}); }, []);
  const copy = async (what, text) => { const ok = await copyText(text); setFail(!ok); setCopied(ok ? what : ''); };
  const addr = hotel?.address || hotel?.name || '';
  const toSupport = () => { setSupportPrefill({ bookingCode: code, phone, subject: 'Khách sạn không có xe đưa đón' }); window.location.assign('/ho-tro'); };
  return (
    <details open data-testid="self-ride" className="tw:mt-3 tw:rounded-xl tw:border tw:border-slate-200 tw:p-3 tw:text-xs">
      <summary className="tw:min-h-6 tw:cursor-pointer tw:font-bold tw:text-slate-800">Không muốn chờ? Tự gọi xe</summary>
      <div className="tw:mt-3 tw:grid tw:gap-2 tw:sm:grid-cols-2">
        <button type="button" disabled={!addr} onClick={() => copy('address', addr)} className={`${BTN} tw:flex tw:items-center tw:justify-center tw:gap-2 tw:bg-blue-600 tw:text-white tw:sm:col-span-2`}><Copy size={15} /> Sao chép địa chỉ khách sạn</button>
        <button type="button" disabled={!addr} onClick={() => copy('trip', buildRideText({ direction: s.direction, airport: `Sân bay ${airportName(s.airport)}`, hotel, pickupAt: s.pickupAt, passengers: s.passengers }))} className={`${BTN} tw:flex tw:items-center tw:justify-center tw:gap-2 tw:border tw:border-slate-300 tw:text-slate-700 tw:sm:col-span-2`}><Copy size={15} /> Sao chép hành trình</button>
        <a href="https://www.grab.com/vn/" target="_blank" rel="noopener noreferrer" className={LINK}><ExternalLink size={14} /> Mở Grab</a>
        <a href="https://www.xanhsm.com/" target="_blank" rel="noopener noreferrer" className={LINK}><ExternalLink size={14} /> Mở Xanh SM</a>
      </div>
      <p role="status" data-testid="copy-status" className={`tw:mt-2 tw:font-semibold ${fail ? 'tw:text-rose-700' : 'tw:text-emerald-700'}`}>{fail ? 'Không sao chép được, hãy chọn và chép thủ công.' : copied === 'address' ? 'Đã sao chép địa chỉ khách sạn' : copied === 'trip' ? 'Đã sao chép hành trình' : ''}</p>
      <p className="tw:mt-1 tw:text-slate-500">Dán địa chỉ vào ứng dụng để đặt xe.</p>
      <p className="tw:mt-2 tw:leading-5 tw:text-slate-700">Nếu bạn tự gọi xe, hệ thống không theo dõi hành trình của xe đó. Sau khi tự đặt xe, bấm "Hủy xe, tôi tự đi" để đóng yêu cầu này và khách sạn ngừng tìm xe giúp bạn.</p>
      <p className="tw:mt-2 tw:leading-5 tw:text-slate-700">Phí xe bạn đã thanh toán không tự động hoàn; hãy liên hệ hỗ trợ để được xem xét.</p>
      <button type="button" onClick={toSupport} className={`${BTN} tw:mt-3 tw:flex tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:border tw:border-blue-200 tw:text-blue-700`}><Headphones size={15} /> Liên hệ hỗ trợ</button>
    </details>
  );
}

function ShuttleCard({ s, positions, code, phone, online, hotel, onChanged, onCancelled }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const trips = s.trips.filter((t) => t.status !== 'CANCELLED');
  const started = trips.some((t) => ['ONBOARD', 'DROPPED_OFF'].includes(t.status));
  const doCancel = async () => {
    setBusy(true); setMsg('');
    try { await cancelShuttle(s.id, code, phone); setConfirm(false); await onChanged(); onCancelled?.(); } // tổng tiền đơn đổi sau khi hủy riêng một chiều: tra cứu lại
    catch (e) { setMsg(e.code === 'TRIP_ALREADY_STARTED' ? 'Xe đã đón bạn nên không thể hủy.' : describeApiError(e)); setConfirm(false); onChanged(); }
    finally { setBusy(false); }
  };
  const own = trips.filter((t) => t.kind === 'OWN');
  const driverTook = trips.some((t) => ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'DROPPED_OFF'].includes(t.status)); // tài xế đã nhận: hủy được nhưng không hoàn tiền chiều này
  return (
    <section data-testid="shuttle-card" aria-label={`Xe đưa đón: ${DIRECTION[s.direction]}`} className="tw:mt-4 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-4 tw:sm:p-5">
      <div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-2">
        <div><h3 className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-bold"><Car size={16} /> Xe đưa đón · {DIRECTION[s.direction]}</h3><p className="tw:mt-1 tw:text-xs tw:text-slate-500">Sân bay {s.airport} · đón lúc {dmyHm(s.pickupAt)} · {s.passengers} khách · {money(s.priceVnd)}</p>{s.location && <p className="tw:text-xs tw:text-slate-500">Điểm đón: {s.location}</p>}</div>
        {s.status === 'CANCELLED' && s.cancelReason && <p role="status" data-testid="cancel-reason" className="tw:w-full tw:text-xs tw:text-rose-800">{s.cancelReason === 'no_show' ? 'Tài xế đã tới điểm đón nhưng không gặp khách nên chuyến đã đóng. Phí chiều xe này không được hoàn.' : 'Chuyến đã tự đóng do quá hạn. Phí xe không thay đổi.'}</p>}
        {s.status === 'CANCELLED' && <span className="tw:rounded-full tw:bg-rose-100 tw:px-3 tw:py-1 tw:text-[11px] tw:font-bold tw:text-rose-900">Đã hủy</span>}
        {s.status === 'DONE' && <span className="tw:rounded-full tw:bg-emerald-100 tw:px-3 tw:py-1 tw:text-[11px] tw:font-bold tw:text-emerald-900">Hoàn tất</span>}
      </div>
      {s.status !== 'CANCELLED' && trips.length === 0 && <p className="tw:mt-3 tw:text-xs tw:text-slate-600">Đang tìm xe…</p>}
      {s.status !== 'CANCELLED' && trips.map((t, i) => (t.kind === 'EXTERNAL' ? <ExternalTrip key={t.id} trip={t} /> : t.status === 'SEARCHING'
        ? <div key={t.id} data-testid="own-trip" className="tw:mt-3 tw:rounded-xl tw:border tw:border-slate-200 tw:p-4"><p role="status" className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-slate-700"><Clock3 size={14} /> Đang tìm xe ({t.seats} chỗ)…</p><TripSteps status="SEARCHING" /></div>
        : <OwnTrip key={t.id} trip={t} position={positions[t.id] ?? t.position} idx={own.indexOf(t)} total={own.length} />))}
      {ACTIVE.includes(s.status) && trips.some(noShare) && <SelfRide s={s} hotel={hotel} code={code} phone={phone} />}
      {ACTIVE.includes(s.status) && !started && (
        confirm ? (
          <div role="alertdialog" aria-label="Xác nhận hủy xe" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:text-rose-900">
            <p className="tw:font-bold">Hủy xe và tự di chuyển?</p>
            <p data-testid="cancel-refund-note" className="tw:mt-1 tw:leading-5">{s.priceVnd > 0 ? (online ? `Phí chiều xe này (${money(s.priceVnd)}) đã thanh toán cùng đơn và KHÔNG được hoàn nếu bạn hủy hoặc không đi xe.` : (driverTook ? 'Tài xế đã nhận chuyến nên vẫn tính phí chiều xe này khi thanh toán tại khách sạn.' : 'Đơn thanh toán tại khách sạn nên chưa thu phí xe: hủy trước khi có tài xế nhận sẽ trừ khỏi số tiền phải trả.')) : 'Chiều xe này không tính phí.'} Khách sạn sẽ ngừng điều phối xe cho yêu cầu này.</p>
            <div className="tw:mt-3 tw:flex tw:gap-3"><button type="button" disabled={busy} onClick={doCancel} className={`${BTN} tw:bg-rose-600 tw:text-white`}>{busy ? 'Đang hủy…' : 'Xác nhận hủy xe'}</button><button type="button" disabled={busy} onClick={() => setConfirm(false)} className={`${BTN} tw:border tw:border-slate-300 tw:bg-white tw:text-slate-700`}>Giữ xe</button></div>
          </div>
        ) : <button type="button" onClick={() => setConfirm(true)} className={`${BTN} tw:mt-4 tw:border tw:border-rose-200 tw:text-rose-700`}>Hủy xe, tôi tự đi</button>
      )}
      {ACTIVE.includes(s.status) && started && <p className="tw:mt-3 tw:text-xs tw:text-slate-500">Xe đã đón bạn nên không thể hủy.</p>}
      {msg && <p role="alert" className="tw:mt-3 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{msg}</p>}
    </section>
  );
}

// ---- Gọi xe ngay (ra sân bay) ----
const CALL_ERR = {
  BOOKING_NOT_ELIGIBLE: 'Chỉ gọi xe ngay khi đơn đã được xác nhận hoặc bạn đang lưu trú.',
  SHUTTLE_ALREADY_REQUESTED: 'Đơn đã có yêu cầu xe ra sân bay đang hoạt động.',
  PICKUP_OUT_OF_STAY_WINDOW: 'Thời điểm đón hiện tại nằm ngoài thời gian lưu trú nên chưa gọi xe được.',
  AIRPORT_NOT_SERVED: 'Khách sạn không phục vụ sân bay này. Hãy chọn sân bay khác.',
};
function CallNow({ code, phone, onDone }) {
  const [open, setOpen] = useState(false);
  const [airports, setAirports] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: '' });
  useEffect(() => { if (open) listAirports().then(setAirports).catch(() => setAirports([])); }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true); setMsg({ ok: false, text: '' });
    try {
      await callShuttleNow({ code, phone, airport: d.airport || undefined, passengers: Number(d.passengers) || 1, ...(d.location?.trim() && { location: d.location.trim() }), ...(d.note?.trim() && { note: d.note.trim() }) });
      setOpen(false); await onDone();
    } catch (err) { setMsg({ ok: false, text: CALL_ERR[err.code] ?? describeApiError(err) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="tw:mt-4">
      {!open && <button type="button" onClick={() => setOpen(true)} className={`${BTN} tw:flex tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:bg-blue-600 tw:text-white tw:sm:w-auto`}><Car size={16} /> Gọi xe đón (ra sân bay)</button>}
      {open && (
        <form onSubmit={submit} aria-label="Gọi xe ngay" className="tw:grid tw:gap-3 tw:rounded-2xl tw:border tw:border-blue-200 tw:bg-blue-50/40 tw:p-4 tw:sm:grid-cols-2">
          <p className="tw:text-xs tw:text-slate-600 tw:sm:col-span-2">Xe sẽ đón bạn sau khoảng 15 phút kể từ lúc gửi yêu cầu.</p>
          <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số khách đi xe<input name="passengers" type="number" min={1} max={30} defaultValue={1} required /></label>
          <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Sân bay<Select name="airport" defaultValue=""><option value="">Sân bay của khách sạn (mặc định)</option>{airports.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>)}</Select></label>
          <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Điểm đón (không bắt buộc)<input name="location" maxLength={200} /></label>
          <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Ghi chú (không bắt buộc)<input name="note" maxLength={300} /></label>
          <div className="tw:flex tw:gap-3 tw:sm:col-span-2"><button disabled={busy} className={`${BTN} tw:bg-blue-600 tw:text-white`}>{busy ? 'Đang gửi…' : 'Gọi xe ngay'}</button><button type="button" disabled={busy} onClick={() => setOpen(false)} className={`${BTN} tw:border tw:border-slate-300`}>Đóng</button></div>
          {msg.text && <p role="alert" className="tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700 tw:sm:col-span-2">{msg.text}</p>}
        </form>
      )}
    </div>
  );
}

// ---- Nhật ký ----
const EVENT_VI = {
  SHUTTLE_REQUESTED: 'Bạn đã gửi yêu cầu xe đưa đón', SHUTTLE_CALL_NOW: 'Bạn đã gọi xe ngay', TRIP_OFFERED: 'Khách sạn đang tìm xe', TRIP_ACCEPTED: 'Tài xế đã nhận chuyến',
  TRIP_REASSIGNED: 'Khách sạn đổi sang xe khác', TRIP_EN_ROUTE: 'Xe đang tới đón bạn', TRIP_ARRIVED: 'Xe đã tới điểm đón', TRIP_ONBOARD: 'Bạn đã lên xe', TRIP_DROPPED_OFF: 'Đã trả khách',
  TRIP_CANCELLED: 'Một chuyến xe đã bị hủy', EXTERNAL_NEEDED: 'Khách sạn hết xe, đang gọi xe ngoài', EXTERNAL_LINK_SET: 'Đã có thông tin xe ngoài', SHUTTLE_CANCELLED: 'Yêu cầu xe đã hủy', SHUTTLE_DONE: 'Chuyến xe hoàn tất',
};

export default function ShuttleTracker({ booking, phone, initial, token, onRelookup, children }) {
  const live = useTrackLive(initial, token);
  const { stage, shuttles = [], events = [], positions, conn, expired, refresh } = live;
  const hasOut = shuttles.some((s) => s.direction === 'TO_AIRPORT' && ACTIVE.includes(s.status));
  return (
    <div data-testid="shuttle-tracker">
      <div className="tw:mt-6 tw:flex tw:items-center tw:justify-between tw:gap-2">
        <h3 className="tw:text-sm tw:font-bold">Tiến trình đơn</h3>
        <span role="status" data-testid="conn-state" className={`tw:flex tw:items-center tw:gap-1 tw:text-[11px] tw:font-semibold ${conn === 'online' ? 'tw:text-emerald-700' : 'tw:text-amber-700'}`}>{conn === 'online' ? <><Wifi size={12} /> Cập nhật trực tiếp</> : <><WifiOff size={12} /> {conn === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối, đang làm mới định kỳ'}</>}</span>
      </div>
      {expired && <p role="alert" className="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900"><AlertTriangle size={15} /> Phiên theo dõi đã hết hạn. <button type="button" onClick={onRelookup} className="tw:font-bold tw:underline">Tra cứu lại</button></p>}
      <TrackStepper stage={stage} shuttles={shuttles} />
      {shuttles.map((s) => <ShuttleCard key={s.id} s={s} positions={positions} code={booking.code} phone={phone} online={booking.payment?.method !== 'AT_HOTEL'} hotel={live.hotel ?? booking.hotel} onChanged={refresh} onCancelled={onRelookup} />)}
      {!hasOut && ['BOOKED', 'PICKUP_IN', 'CHECKED_IN'].includes(stage) && <CallNow code={booking.code} phone={phone} onDone={refresh} />}
      {children?.(refresh, shuttles)}
      {events.length > 0 && (
        <section aria-label="Hoạt động của đơn" className="tw:mt-6">
          <h3 className="tw:text-sm tw:font-bold">Hoạt động của đơn</h3>
          <ul data-testid="track-events" className="tw:mt-3 tw:list-none tw:space-y-2 tw:border-l-2 tw:border-slate-200 tw:p-0 tw:pl-4 tw:text-xs">
            {[...events].reverse().map((e, i) => <li key={`${e.at}-${i}`}><span className="tw:text-slate-500">{hm(e.at)}</span> · {EVENT_VI[e.type] ?? 'Cập nhật đơn'}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
