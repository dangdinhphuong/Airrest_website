import React, { useEffect, useState } from 'react';
import { ArrowLeft, BedDouble, Check, ChevronDown, Clock3, Hotel, MapPin, Maximize2, Plane, ShieldCheck, Star, Users } from 'lucide-react';
import { useApp } from '../../state/store';
import { AMENITY_LABEL, airportName, describeApiError, getHotel, getReviews, listAirports, listHotels, postReview } from '../../data/user';
import { isoDate, money } from '../../lib/time';
import { NR, loadCart, saveCart, setQty } from './cart';
import { copyText, partyFromPrefs, setStaysIntent } from './data';
import GuestsPicker from './GuestsPicker';
import HotelMap from './HotelMap';

const TABS = [['overview', 'Tổng quan'], ['rooms', 'Phòng'], ['amenities', 'Tiện ích'], ['location', 'Vị trí'], ['policy', 'Chính sách'], ['reviews', 'Đánh giá']];
const SERVICE_TAGS = new Set(['SHUTTLE_FREE', 'SHUTTLE_PAID', 'SHUTTLE', '24H_RECEPTION', 'HOURLY', 'FAMILY_ROOM', 'LUGGAGE']);
const CARD = 'tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:scroll-mt-28';
const H2 = 'tw:text-lg tw:font-bold';
const nextDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
// Cửa sổ lưu trú cố định theo ngày (nhận 14:00, trả 12:00 giờ VN) — khớp trang Stays.
const windowOf = ({ checkIn, checkOut }) => ({ from: new Date(`${checkIn}T14:00:00+07:00`).toISOString(), to: new Date(`${checkOut}T12:00:00+07:00`).toISOString() });
const go = (el) => document.getElementById(el)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function Gallery({ p }) {
  const imgs = p.images?.length ? p.images : [p.image];
  const [i, setI] = useState(0);
  const [bad, setBad] = useState({});
  const ok = imgs.filter((u) => !bad[u]);
  const cur = ok[Math.min(i, ok.length - 1)] ?? p.image;
  return (
    <div>
      <div className="tw:relative tw:h-[340px] tw:overflow-hidden tw:rounded-3xl tw:sm:h-[460px]"><img src={cur} alt={p.name} onError={() => setBad((b) => ({ ...b, [cur]: true }))} className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></div>
      {ok.length > 1 && <div className="tw:mt-3 tw:flex tw:gap-2 tw:overflow-x-auto" role="group" aria-label="Ảnh khách sạn">{ok.map((u, k) => <button type="button" key={u} onClick={() => setI(k)} aria-label={`Ảnh ${k + 1}`} aria-pressed={u === cur} className={`tw:relative tw:h-16 tw:w-24 tw:shrink-0 tw:overflow-hidden tw:rounded-xl tw:border-2 ${u === cur ? 'tw:border-blue-600' : 'tw:border-transparent'}`}><img src={u} alt="" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></button>)}</div>}
    </div>
  );
}

function RoomCard({ room: r, nights, onPick }) {
  const full = r.availableRooms <= 0;
  return (
    <li data-testid="detail-room" className="tw:flex tw:flex-col tw:gap-4 tw:rounded-xl tw:border tw:border-slate-200 tw:p-4 tw:sm:flex-row">
      {r.images[0] && <img src={r.images[0]} alt={r.name} loading="lazy" className="tw:h-40 tw:w-full tw:shrink-0 tw:rounded-lg tw:object-cover tw:sm:h-32 tw:sm:w-44" />}
      <div className="tw:min-w-0 tw:flex-1">
        <h3 className="tw:font-bold">{r.name}</h3>
        <p className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-x-4 tw:gap-y-1 tw:text-xs tw:text-slate-600">
          {r.areaM2 > 0 && <span className="tw:flex tw:items-center tw:gap-1"><Maximize2 size={13} /> {r.areaM2} m²</span>}
          {r.beds > 0 && <span className="tw:flex tw:items-center tw:gap-1"><BedDouble size={13} /> {r.beds} giường</span>}
          <span className="tw:flex tw:items-center tw:gap-1"><Users size={13} /> Tối đa {r.maxOccupancy} khách</span>
          {r.view && <span>Hướng {r.view}</span>}
          <span>{r.smoking ? 'Cho phép hút thuốc' : 'Không hút thuốc'}</span>
        </p>
        {r.description && <p className="tw:mt-2 tw:text-xs tw:leading-5 tw:text-slate-600">{r.description}</p>}
        {r.amenities.length > 0 && <p className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-1.5">{r.amenities.map((a) => <span key={a} className="tw:rounded-full tw:bg-slate-100 tw:px-2 tw:py-0.5 tw:text-[11px] tw:text-slate-600">{AMENITY_LABEL[a] ?? a}</span>)}</p>}
        <p className="tw:mt-2 tw:text-xs tw:font-semibold tw:text-emerald-700">{r.cancellationPolicy}</p>
        {r.nonRefundablePrice != null && <p className="tw:mt-1 tw:text-xs tw:text-rose-700">Có mức Không hoàn hủy rẻ hơn {r.nonRefundablePct}%: {money(r.nonRefundablePrice)} / đêm, hủy không được hoàn tiền.</p>}
        {r.hourly && <p className="tw:mt-1 tw:text-xs tw:text-slate-600">Có đặt theo giờ từ {money(r.hourly.firstHourVnd)} / giờ đầu (chọn giờ ở bước đặt phòng)</p>}
      </div>
      <div className="tw:flex tw:shrink-0 tw:flex-row tw:items-end tw:justify-between tw:gap-2 tw:sm:flex-col">
        <div className="tw:sm:text-right"><strong className="tw:block tw:text-lg tw:text-blue-700">{money(r.price)}</strong><span className="tw:text-[11px] tw:text-slate-500">/ đêm{nights > 1 ? ` · ${nights} đêm: ${money(r.price * nights)}` : ''}</span><span className={`tw:mt-1 tw:block tw:text-[11px] tw:font-semibold ${full ? 'tw:text-rose-700' : r.availableRooms <= 3 ? 'tw:text-amber-700' : 'tw:text-slate-500'}`}>{full ? 'Hết phòng' : `Còn ${r.availableRooms} phòng`}</span></div>
        <div className="tw:flex tw:flex-col tw:gap-2">
          <button type="button" disabled={full} onClick={() => onPick(r, 'STANDARD')} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-xs tw:font-bold tw:text-white tw:disabled:bg-slate-300">Chọn phòng</button>
          {r.nonRefundablePrice != null && <button type="button" disabled={full} onClick={() => onPick(r, NR)} data-testid="pick-nr" className="tw:min-h-11 tw:rounded-xl tw:border tw:border-rose-300 tw:bg-rose-50 tw:px-3 tw:text-xs tw:font-bold tw:text-rose-800 tw:disabled:opacity-50">Không hoàn hủy · {money(r.nonRefundablePrice)}</button>}
        </div>
      </div>
    </li>
  );
}

function Reviews({ hotelId }) {
  const [data, setData] = useState({ summary: null, items: [], nextCursor: null });
  const [state, setState] = useState('loading');
  const [more, setMore] = useState(false);
  const [form, setForm] = useState({ code: '', phone: '', score: 10, comment: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = (cursor, signal) => getReviews(hotelId, cursor, signal).then((r) => { setData((d) => ({ ...r, items: cursor ? [...d.items, ...r.items] : r.items })); setState('ok'); }).catch((e) => { if (!signal?.aborted) { setMsg({ bad: true, text: describeApiError(e) }); setState('ok'); } });
  useEffect(() => { const ctl = new AbortController(); setState('loading'); load(undefined, ctl.signal); return () => ctl.abort(); }, [hotelId]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await postReview(hotelId, { code: form.code.trim(), phone: form.phone.trim(), score: Number(form.score), ...(form.comment.trim() && { comment: form.comment.trim() }) });
      setMsg({ text: 'Cảm ơn bạn đã đánh giá!' }); setMore(false); setForm({ code: '', phone: '', score: 10, comment: '' }); await load(undefined);
    } catch (err) { setMsg({ bad: true, text: describeApiError(err) }); } finally { setBusy(false); }
  };
  const s = data.summary;
  const max = s ? Math.max(1, ...s.distribution) : 1;
  return (
    <section id="reviews" className={CARD} aria-label="Đánh giá">
      <h2 className={H2}>Đánh giá của khách</h2>
      {state === 'loading' && <p role="status" className="tw:mt-3 tw:text-sm tw:text-slate-500">Đang tải đánh giá…</p>}
      {s && s.count === 0 && <p className="tw:mt-3 tw:text-sm tw:text-slate-500">Chưa có đánh giá nào. Khách đã trả phòng có thể là người đầu tiên.</p>}
      {s && s.count > 0 && (
        <div className="tw:mt-4 tw:grid tw:gap-6 tw:sm:grid-cols-[160px_1fr]">
          <div><div className="tw:flex tw:items-baseline tw:gap-1"><strong className="tw:text-4xl tw:text-emerald-700" data-testid="review-avg">{s.avg.toFixed(1)}</strong><span className="tw:text-sm tw:text-slate-500">/10</span></div><span className="tw:text-xs tw:text-slate-500">{s.count} lượt đánh giá</span></div>
          <ul className="tw:grid tw:gap-1" aria-label="Phân bố điểm">{[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((sc) => <li key={sc} className="tw:flex tw:items-center tw:gap-2 tw:text-[11px] tw:text-slate-600"><span className="tw:w-5 tw:text-right">{sc}</span><span className="tw:h-2 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-slate-100"><span className="tw:block tw:h-full tw:bg-emerald-500" style={{ width: `${(s.distribution[sc - 1] / max) * 100}%` }} /></span><span className="tw:w-6">{s.distribution[sc - 1]}</span></li>)}</ul>
        </div>
      )}
      {data.items.length > 0 && <ul className="tw:mt-5 tw:divide-y tw:divide-slate-100">{data.items.map((r) => <li key={r.id} className="tw:py-3"><div className="tw:flex tw:items-center tw:gap-2 tw:text-sm"><strong>{r.reviewerName}</strong><span className="tw:flex tw:items-center tw:gap-0.5 tw:font-bold tw:text-emerald-700"><Star size={13} fill="currentColor" /> {r.score}/10</span><time className="tw:ml-auto tw:text-[11px] tw:text-slate-500">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</time></div>{r.comment && <p className="tw:mt-1 tw:text-sm tw:leading-6 tw:text-slate-600">{r.comment}</p>}</li>)}</ul>}
      {data.nextCursor && <button type="button" onClick={() => load(data.nextCursor)} className="tw:mt-3 tw:min-h-11 tw:text-xs tw:font-bold tw:text-blue-700">Xem thêm đánh giá</button>}
      <div className="tw:mt-5 tw:border-t tw:border-slate-100 tw:pt-4">
        {msg && <p role={msg.bad ? 'alert' : 'status'} className={`tw:mb-3 tw:rounded-lg tw:p-3 tw:text-xs ${msg.bad ? 'tw:bg-rose-50 tw:text-rose-800' : 'tw:bg-emerald-50 tw:text-emerald-800'}`}>{msg.text}</p>}
        {!more ? <button type="button" onClick={() => setMore(true)} className="tw:min-h-11 tw:rounded-xl tw:border tw:border-blue-600 tw:px-4 tw:text-xs tw:font-bold tw:text-blue-600">Viết đánh giá</button> : (
          <form onSubmit={submit} className="tw:grid tw:gap-3 tw:sm:max-w-md" data-testid="review-form">
            <p className="tw:text-xs tw:text-slate-500">Dùng mã đặt phòng và số điện thoại của đơn đã trả phòng tại khách sạn này. Mỗi đơn đánh giá một lần.</p>
            <label className="tw:grid tw:gap-1 tw:text-xs tw:font-semibold">Mã đặt phòng<input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="AR-XXXXXXXX" autoComplete="off" /></label>
            <label className="tw:grid tw:gap-1 tw:text-xs tw:font-semibold">Số điện thoại<input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></label>
            <label className="tw:grid tw:gap-1 tw:text-xs tw:font-semibold">Điểm (1–10)<select value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })}>{[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="tw:grid tw:gap-1 tw:text-xs tw:font-semibold">Nhận xét (tuỳ chọn)<textarea rows={3} maxLength={1000} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></label>
            <button type="submit" disabled={busy} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60">{busy ? 'Đang gửi…' : 'Gửi đánh giá'}</button>
          </form>
        )}
      </div>
    </section>
  );
}

function Similar({ p, onOpen }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    const ctl = new AbortController();
    listHotels(p.airportCode, ctl.signal, { limit: 6 }).then((l) => setList(l.filter((h) => h.id !== p.id).slice(0, 4))).catch(() => setList([]));
    return () => ctl.abort();
  }, [p.id, p.airportCode]);
  if (!list.length) return null;
  return (
    <section className="tw:mt-7" aria-label="Khách sạn tương tự">
      <h2 className={H2}>Khách sạn tương tự gần {airportName(p.airportCode)}</h2>
      <ul className="tw:mt-4 tw:grid tw:list-none tw:gap-4 tw:p-0 tw:sm:grid-cols-2 tw:lg:grid-cols-4">{list.map((h) => <li key={h.id}><button type="button" onClick={() => onOpen(h.id)} className="tw:block tw:w-full tw:overflow-hidden tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:text-left"><img src={h.image} alt="" loading="lazy" className="tw:h-32 tw:w-full tw:object-cover" /><span className="tw:block tw:p-3"><strong className="tw:block tw:text-sm">{h.name}</strong><span className="tw:text-[11px] tw:text-slate-500">{h.distanceKm} km · {h.travelMinutes} phút</span><span className="tw:mt-1 tw:flex tw:items-center tw:justify-between tw:text-xs"><b className="tw:text-blue-700">{money(h.room.price)}</b>{h.rating && <span className="tw:flex tw:items-center tw:gap-0.5 tw:font-bold tw:text-emerald-700"><Star size={12} fill="currentColor" /> {h.rating}</span>}</span></span></button></li>)}</ul>
    </section>
  );
}

export default function HotelDetail() {
  const { state, dispatch } = useApp();
  const [p, setP] = useState(null);
  const [st, setSt] = useState({ loading: true, error: '' });
  const [dates, setDates] = useState({ checkIn: isoDate(0), checkOut: isoDate(1) });
  const [party, setParty] = useState(() => { const x = partyFromPrefs(state.user?.preferences); return { adults: x.adults, children: x.children }; });
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const winKey = JSON.stringify(windowOf(dates));
  useEffect(() => {
    const ctl = new AbortController();
    setSt((s) => ({ ...s, loading: true }));
    (async () => { await listAirports().catch(() => {}); return getHotel(state.propertyId, ctl.signal, JSON.parse(winKey)); })()
      .then((h) => { setP(h); setSt({ loading: false, error: '' }); })
      .catch((e) => { if (!ctl.signal.aborted) setSt({ loading: false, error: describeApiError(e) }); });
    return () => ctl.abort();
  }, [state.propertyId, winKey]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [state.propertyId]);

  const back = () => { dispatch({ type: 'go', screen: 'home' }); window.scrollTo({ top: 0 }); };
  const Back = () => <button type="button" onClick={back} className="tw:inline-flex tw:min-h-11 tw:items-center tw:gap-2 tw:text-xs tw:font-bold tw:text-blue-700"><ArrowLeft size={16} /> Quay lại danh sách</button>;
  if (!p) {
    return <div className="tw:min-h-screen tw:bg-slate-50 tw:px-5 tw:py-8"><div className="tw:mx-auto tw:max-w-[1080px]"><Back /><p role={st.error ? 'alert' : 'status'} className="tw:mt-6 tw:rounded-2xl tw:bg-white tw:p-8 tw:text-sm tw:text-slate-600">{st.loading ? 'Đang tải thông tin nơi nghỉ…' : st.error || 'Không tìm thấy nơi nghỉ này.'}</p></div></div>;
  }

  const nights = Math.max(1, Math.round((new Date(dates.checkOut) - new Date(dates.checkIn)) / 86400000));
  const apName = airportName(p.airportCode);
  const cheapest = p.rooms.reduce((m, r) => (m === null || r.price < m ? r.price : m), null);
  const labels = (pred) => p.amenityTags.filter(pred).map((t) => AMENITY_LABEL[t]).filter(Boolean);
  const services = labels((t) => SERVICE_TAGS.has(t));
  const facilities = labels((t) => !SERVICE_TAGS.has(t));
  const stay = p.stay ?? {};
  const hasMap = p.lat != null && p.lng != null;
  const mapUrl = hasMap ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}` : null;
  const open = (id) => dispatch({ type: 'openProperty', id });

  // Chọn phòng: thêm 1 phòng vào giỏ rồi sang trang đặt phòng (đã có giỏ + bước chốt đơn) với đúng ngày/khách.
  const pick = (room, plan) => {
    const cart = setQty(loadCart(), p, room, 1, Date.now(), { plan });
    if (!cart.lines.length) { setNotice('Không thêm được phòng này vào giỏ.'); return; }
    saveCart(cart);
    setStaysIntent({ airport: p.airportCode, hotelId: p.id, dates, party });
    dispatch({ type: 'go', screen: 'stays' });
    window.scrollTo({ top: 0 });
  };
  const faq = [
    stay.checkInTime && [`Giờ nhận và trả phòng của ${p.name}?`, `Nhận phòng từ ${stay.checkInTime}${stay.checkOutTime ? `, trả phòng trước ${stay.checkOutTime}` : ''}.`],
    [`${p.name} cách sân bay bao xa?`, `Cách sân bay ${apName} ${p.distanceKm} km, khoảng ${p.travelMinutes} phút đi xe.`],
    [`${p.name} có xe đưa đón sân bay không?`, p.shuttleMode === 'free' ? 'Có, xe đưa đón miễn phí.' : p.shuttleMode === 'paid' ? 'Có, xe đưa đón có phí (giá hiển thị ở bước đặt phòng).' : 'Khách sạn không có xe đưa đón.'],
    [`Có được hủy miễn phí không?`, p.freeCancel ? 'Có, theo điều kiện của cơ sở.' : 'Không hoàn hủy.'],
    p.stats?.totalRooms > 0 && [`${p.name} có bao nhiêu phòng?`, `${p.stats.totalRooms} phòng${p.stats.floors ? `, ${p.stats.floors} tầng` : ''}.`],
  ].filter(Boolean);

  return (
    <div className="tw:min-h-screen tw:bg-slate-50 tw:pb-16">
      <div className="tw:mx-auto tw:max-w-[1080px] tw:px-5 tw:pt-6"><Back /></div>
      <nav aria-label="Mục trang" className="tw:sticky tw:top-0 tw:z-20 tw:mt-3 tw:border-y tw:border-slate-200 tw:bg-white">
        <div className="tw:mx-auto tw:flex tw:max-w-[1080px] tw:items-center tw:gap-2 tw:px-5">
          <div className="tw:flex tw:flex-1 tw:overflow-x-auto">{TABS.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)} className="tw:min-h-11 tw:shrink-0 tw:px-3 tw:text-xs tw:font-bold tw:text-slate-700">{label}</button>)}</div>
          <button type="button" onClick={async () => { setCopied(await copyText(window.location.href)); window.setTimeout(() => setCopied(false), 2000); }} className="tw:min-h-11 tw:shrink-0 tw:px-2 tw:text-xs tw:font-bold tw:text-blue-700">{copied ? 'Đã sao chép' : 'Sao chép liên kết'}</button>
          <div className="tw:hidden tw:items-center tw:gap-3 tw:sm:flex"><span className="tw:text-xs tw:text-slate-500">từ <b className="tw:text-sm tw:text-blue-700">{money(cheapest)}</b>/đêm</span><button type="button" onClick={() => go('rooms')} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-4 tw:text-xs tw:font-bold tw:text-white">Chọn phòng</button></div>
        </div>
      </nav>
      <div className="tw:mx-auto tw:max-w-[1080px] tw:space-y-6 tw:px-5 tw:pt-6">
        <Gallery key={p.id} p={p} />
        <section id="overview" className={CARD} aria-label="Tổng quan">
          <h1 className="tw:text-3xl tw:font-bold tw:tracking-tight">{p.name}</h1>
          <div className="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-4 tw:text-xs tw:text-slate-500">
            <span className="tw:flex tw:items-center tw:gap-1"><MapPin size={15} /> {p.address || `Gần sân bay ${apName}`}</span>
            {p.rating && <span className="tw:flex tw:items-center tw:gap-1 tw:font-bold tw:text-emerald-700"><Star size={14} fill="currentColor" /> {p.rating}/10 · {p.ratingCount} đánh giá</span>}
            {hasMap && <button type="button" onClick={() => go('location')} className="tw:font-bold tw:text-blue-700 tw:underline">Xem bản đồ</button>}
          </div>
          <p className="tw:mt-5 tw:text-sm tw:leading-7 tw:text-slate-600">{p.description || `Cách sân bay ${apName} ${p.distanceKm} km, khoảng ${p.travelMinutes} phút đi xe.`}</p>
          <dl className="tw:mt-5 tw:grid tw:grid-cols-2 tw:gap-3 tw:text-xs tw:sm:grid-cols-4">
            {[[Plane, 'Tới sân bay', `${p.distanceKm} km · ${p.travelMinutes} phút`], [Clock3, 'Lễ tân', p.receptionLabel], p.stats?.totalRooms > 0 && [Hotel, 'Quy mô', `${p.stats.totalRooms} phòng${p.stats.floors ? ` · ${p.stats.floors} tầng` : ''}`], stay.checkInTime && [Clock3, 'Nhận / trả phòng', `${stay.checkInTime} / ${stay.checkOutTime ?? '—'}`]].filter(Boolean).map(([Icon, k, v]) => <div key={k} className="tw:rounded-xl tw:bg-slate-50 tw:p-3"><dt className="tw:flex tw:items-center tw:gap-1 tw:text-slate-500"><Icon size={13} /> {k}</dt><dd className="tw:mt-1 tw:font-semibold tw:text-slate-800">{v}</dd></div>)}
          </dl>
        </section>

        <section id="rooms" className={CARD} aria-label="Phòng">
          <h2 className={H2}>Chọn phòng</h2>
          <div className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-3">
            <label className="tw:grid tw:gap-1 tw:text-[11px] tw:font-semibold tw:text-slate-600">Nhận phòng<input type="date" aria-label="Ngày nhận phòng" min={isoDate(0)} value={dates.checkIn} onChange={(e) => { const v = e.target.value; if (v) setDates((d) => ({ checkIn: v, checkOut: d.checkOut <= v ? nextDay(v) : d.checkOut })); }} /></label>
            <label className="tw:grid tw:gap-1 tw:text-[11px] tw:font-semibold tw:text-slate-600">Trả phòng<input type="date" aria-label="Ngày trả phòng" min={nextDay(dates.checkIn)} value={dates.checkOut} onChange={(e) => e.target.value && setDates((d) => ({ ...d, checkOut: e.target.value }))} /></label>
            <div className="tw:grid tw:gap-1 tw:text-[11px] tw:font-semibold tw:text-slate-600">Số khách<GuestsPicker hideRooms label="Số khách" value={{ ...party, rooms: 1 }} onChange={(v) => setParty({ adults: v.adults, children: v.children })} /></div>
          </div>
          {notice && <p role="alert" className="tw:mt-3 tw:text-xs tw:text-rose-700">{notice}</p>}
          <ul className="tw:mt-4 tw:grid tw:list-none tw:gap-3 tw:p-0" aria-busy={st.loading}>{p.rooms.map((r) => <RoomCard key={r.id} room={r} nights={nights} onPick={pick} />)}</ul>
          <p className="tw:mt-3 tw:text-[11px] tw:text-slate-500">Giá theo đêm, đã gồm giá phòng; phí dịch vụ và xe đưa đón (nếu chọn) hiện ở bước đặt phòng.</p>
        </section>

        <section id="amenities" className={CARD} aria-label="Tiện ích">
          <h2 className={H2}>Tiện ích</h2>
          {[['Tiện nghi', facilities], ['Dịch vụ', services]].filter(([, l]) => l.length).map(([title, list]) => <div key={title} className="tw:mt-4"><h3 className="tw:text-sm tw:font-semibold">{title}</h3><div className="tw:mt-2 tw:grid tw:gap-2 tw:sm:grid-cols-2">{list.map((x) => <span key={x} className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-slate-600"><Check size={15} className="tw:text-emerald-600" /> {x}</span>)}</div></div>)}
          {!facilities.length && !services.length && <p className="tw:mt-3 tw:text-xs tw:text-slate-500">Khách sạn chưa cập nhật tiện ích.</p>}
        </section>

        <section id="location" className={CARD} aria-label="Vị trí">
          <h2 className={H2}>Vị trí</h2>
          <p className="tw:mt-3 tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-slate-600"><MapPin size={16} /> {p.address || 'Địa chỉ chưa cập nhật'}</p>
          <ul className="tw:mt-3 tw:grid tw:gap-1 tw:text-xs tw:text-slate-600">{p.airportList.map((a) => <li key={a.iata} className="tw:flex tw:items-center tw:gap-2"><Plane size={14} /> Sân bay {airportName(a.iata)} ({a.iata}): {a.km} km · khoảng {a.minutes} phút</li>)}</ul>
          {hasMap && <><HotelMap lat={p.lat} lng={p.lng} name={p.name} /><a href={mapUrl} target="_blank" rel="noreferrer" className="tw:mt-3 tw:inline-flex tw:min-h-11 tw:items-center tw:text-xs tw:font-bold tw:text-blue-700 tw:underline">Mở trên OpenStreetMap</a></>}
        </section>

        <section id="policy" className={CARD} aria-label="Chính sách">
          <h2 className={H2}><ShieldCheck size={18} className="tw:mr-1 tw:inline tw:text-blue-600" />Chính sách lưu trú</h2>
          <dl className="tw:mt-4 tw:grid tw:gap-3 tw:text-sm">
            {[['Nhận phòng', stay.checkInTime ? `Từ ${stay.checkInTime}` : 'Liên hệ khách sạn'], ['Trả phòng', stay.checkOutTime ? `Trước ${stay.checkOutTime}` : 'Liên hệ khách sạn'], ['Hủy phòng', p.freeCancel ? 'Hủy miễn phí theo điều kiện của cơ sở.' : 'Không hoàn hủy. Điều kiện được hiển thị trước khi gửi yêu cầu.'], ['Lễ tân', p.receptionLabel], ['Trẻ em', stay.childPolicy || 'Liên hệ khách sạn'], ['Thú cưng', stay.petsAllowed == null ? 'Liên hệ khách sạn' : stay.petsAllowed ? 'Được phép mang theo' : 'Không được mang theo']].map(([k, v]) => <div key={k} className="tw:grid tw:gap-1 tw:sm:grid-cols-[140px_1fr]"><dt className="tw:font-semibold tw:text-slate-500">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <h3 className="tw:mt-6 tw:text-sm tw:font-semibold">Câu hỏi thường gặp</h3>
          <div className="tw:mt-2 tw:divide-y tw:divide-slate-100">{faq.map(([q, a]) => <details key={q} className="tw:group tw:py-3"><summary className="tw:flex tw:min-h-11 tw:cursor-pointer tw:list-none tw:items-center tw:justify-between tw:text-sm tw:font-semibold">{q}<ChevronDown size={16} className="tw:transition group-open:tw:rotate-180" /></summary><p className="tw:pb-1 tw:text-sm tw:text-slate-600">{a}</p></details>)}</div>
        </section>

        <Reviews hotelId={p.id} />
        <Similar p={p} onOpen={open} />
      </div>
    </div>
  );
}
