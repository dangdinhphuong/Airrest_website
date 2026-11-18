import React, { useEffect, useState } from 'react';
import { ArrowLeft, BedDouble, Check, ChevronDown, Clock3, Heart, Hotel, MapPin, Maximize2, Plane, ShieldCheck, Star, Users } from 'lucide-react';
import { useApp } from '../../state/store';
import { AMENITY_LABEL, airportName, describeApiError, getHotel, getReviews, listAirports, listHotels, postReview } from '../../data/user';
import { isoDate, money } from '../../lib/time';
import { NR, emptyCart, hourlyPriceOf, maxQty, saveCart, setQty } from './cart';
import BookingModal from './BookingModal';
import HourlyPicker from './HourlyPicker';
import { useFavorites } from '../../data/favorites';
import { copyText, partyFromPrefs } from './data';
import GuestsPicker from './GuestsPicker';
import HotelMap from './HotelMap';
import Photo from './Photo';

const TABS = [['overview', 'Tổng quan'], ['rooms', 'Phòng & giá'], ['amenities', 'Tiện ích'], ['location', 'Vị trí'], ['policy', 'Chính sách'], ['reviews', 'Đánh giá']];
const SERVICE_TAGS = new Set(['SHUTTLE_FREE', 'SHUTTLE_PAID', 'SHUTTLE', '24H_RECEPTION', 'HOURLY', 'FAMILY_ROOM', 'LUGGAGE']);
const CARD = 'tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:scroll-mt-28';
const H2 = 'tw:text-lg tw:font-bold';
const nextDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
// Cửa sổ lưu trú cố định theo ngày (nhận 14:00, trả 12:00 giờ VN) — khớp trang Stays.
const windowOf = ({ checkIn, checkOut }) => ({ from: new Date(`${checkIn}T14:00:00+07:00`).toISOString(), to: new Date(`${checkOut}T12:00:00+07:00`).toISOString() });
const ratingLabel = (r) => (r >= 9 ? 'Tuyệt vời' : r >= 8 ? 'Rất tốt' : r >= 7 ? 'Tốt' : 'Khá');
const go = (el) => document.getElementById(el)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function Gallery({ p, aside }) {
  const imgs = p.images ?? [];
  const [i, setI] = useState(0);
  const [bad, setBad] = useState({});
  const [all, setAll] = useState(false);
  const ok = imgs.filter((u) => !bad[u]);
  const cur = ok[Math.min(i, ok.length - 1)];
  const side = ok.filter((u) => u !== cur).slice(0, 2);
  const strip = all ? ok : ok.slice(0, 5);
  const more = ok.length - strip.length;
  const img = (u, cls) => <img src={u} alt="" loading="lazy" onError={() => setBad((b) => ({ ...b, [u]: true }))} className={`tw:absolute tw:inset-0 tw:size-full tw:object-cover ${cls ?? ''}`} />;
  const tile = (u, cls) => <button type="button" key={u} onClick={() => setI(ok.indexOf(u))} aria-label={`Ảnh ${ok.indexOf(u) + 1}`} className={`tw:relative tw:overflow-hidden tw:rounded-xl ${cls}`}>{img(u, 'tw:transition tw:hover:scale-105')}</button>;
  return (
    <div className="tw:grid tw:gap-4 tw:lg:grid-cols-[1fr_260px]">
      <div>
        <div className="tw:grid tw:h-[260px] tw:grid-cols-3 tw:grid-rows-2 tw:gap-2 tw:sm:h-[420px]">
          <div className={`tw:relative tw:row-span-2 tw:overflow-hidden tw:rounded-2xl ${side.length ? 'tw:col-span-2' : 'tw:col-span-3'}`}>{cur ? <img src={cur} alt={p.name} onError={() => setBad((b) => ({ ...b, [cur]: true }))} className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /> : <Photo alt={p.name} size={64} />}</div>
          {side.map((u) => tile(u, 'tw:rounded-2xl'))}
        </div>
        {ok.length > 3 && <div className={`tw:mt-2 tw:grid tw:gap-2 ${all ? 'tw:grid-cols-3 tw:sm:grid-cols-5' : 'tw:grid-cols-5'}`} role="group" aria-label="Ảnh khách sạn">
          {strip.map((u, k) => (k === 4 && more > 0
            ? <button type="button" key={u} onClick={() => setAll(true)} className="tw:relative tw:aspect-[4/3] tw:overflow-hidden tw:rounded-xl">{img(u)}<span className="tw:absolute tw:inset-0 tw:grid tw:place-items-center tw:bg-slate-900/55 tw:text-xs tw:font-bold tw:text-white">+{more} ảnh</span></button>
            : tile(u, `tw:aspect-[4/3] ${u === cur ? 'tw:ring-2 tw:ring-blue-600' : ''}`)))}
        </div>}
      </div>
      {aside}
    </div>
  );
}

// Ảnh phòng do khách sạn tải lên: ảnh bìa + dải ảnh nhỏ bấm để xem; phòng chưa có ảnh thì không chừa khung.
function RoomPhotos({ images, name }) {
  const [i, setI] = useState(0);
  const [bad, setBad] = useState({});
  const ok = (images ?? []).filter((u) => !bad[u]);
  if (!ok.length) return null;
  const cur = ok[Math.min(i, ok.length - 1)];
  return (
    <div className="tw:shrink-0 tw:sm:w-44" data-testid="room-photos">
      <div className="tw:relative tw:h-40 tw:w-full tw:overflow-hidden tw:rounded-lg tw:sm:h-32"><img src={cur} alt={name} loading="lazy" onError={() => setBad((b) => ({ ...b, [cur]: true }))} className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></div>
      {ok.length > 1 && <div className="tw:mt-1.5 tw:flex tw:gap-1.5 tw:overflow-x-auto" role="group" aria-label={`Ảnh ${name}`}>{ok.map((u, k) => <button type="button" key={u} onClick={() => setI(k)} aria-label={`Ảnh ${k + 1} của ${name}`} aria-pressed={u === cur} className={`tw:relative tw:size-9 tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:border-2 ${u === cur ? 'tw:border-blue-600' : 'tw:border-transparent'}`}><img src={u} alt="" loading="lazy" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></button>)}</div>}
    </div>
  );
}

// Một loại phòng = khối thông tin bên trái + các dòng lựa chọn (đêm linh hoạt / không hoàn hủy / theo giờ), mỗi dòng một ô chọn số phòng.
function RoomType({ room: r, hotelId, date, nights, sel, onQty, onHours }) {
  const full = r.availableRooms <= 0;
  const rows = [
    { key: 'STD', kind: 'NIGHT', plan: 'STANDARD', title: 'Theo đêm', note: r.cancellationPolicy, tone: 'tw:text-emerald-700', price: r.price, max: maxQty(r) },
    r.nonRefundablePrice != null && { key: 'NR', kind: 'NIGHT', plan: NR, title: 'Theo đêm · Không hoàn hủy', note: `Rẻ hơn ${r.nonRefundablePct}%, hủy không được hoàn tiền`, tone: 'tw:text-rose-700', price: r.nonRefundablePrice, max: maxQty(r) },
    r.hourly && { key: 'HR', kind: 'HOURLY', plan: 'STANDARD', title: 'Theo giờ', note: `Từ ${money(r.hourly.firstHourVnd)} / giờ đầu, ${money(r.hourly.nextHourVnd)} / giờ tiếp theo`, tone: 'tw:text-slate-600', price: r.hourly.firstHourVnd, max: maxQty(r, 'HOURLY') },
  ].filter(Boolean);
  return (
    <li data-testid="detail-room" className="tw:grid tw:overflow-hidden tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-sm tw:md:grid-cols-[1.1fr_2fr]">
      <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-3 tw:p-4 tw:sm:flex-row tw:md:flex-col">
        <RoomPhotos images={r.images} name={r.name} />
        <div className="tw:min-w-0">
          <h3 className="tw:font-bold tw:text-blue-800">{r.name}</h3>
          {!full && r.availableRooms <= 5 && <p className="tw:mt-1 tw:text-xs tw:font-bold tw:text-rose-700">Chỉ còn {r.availableRooms} phòng</p>}
          {full && <p className="tw:mt-1 tw:text-xs tw:font-bold tw:text-rose-700">Hết phòng theo đêm</p>}
          <p className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-x-4 tw:gap-y-1 tw:text-xs tw:text-slate-600">
            {r.areaM2 > 0 && <span className="tw:flex tw:items-center tw:gap-1"><Maximize2 size={13} /> {r.areaM2} m²</span>}
            {r.beds > 0 && <span className="tw:flex tw:items-center tw:gap-1"><BedDouble size={13} /> {r.beds} giường</span>}
            <span className="tw:flex tw:items-center tw:gap-1"><Users size={13} /> Tối đa {r.maxOccupancy} khách</span>
            {r.view && <span>Hướng {r.view}</span>}
            <span>{r.smoking ? 'Cho phép hút thuốc' : 'Không hút thuốc'}</span>
          </p>
          {r.description && <p className="tw:mt-2 tw:text-xs tw:leading-5 tw:text-slate-600">{r.description}</p>}
          {r.amenities.length > 0 && <p className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-1.5">{r.amenities.map((a) => <span key={a} className="tw:rounded tw:border tw:border-slate-300 tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:text-slate-600">{AMENITY_LABEL[a] ?? a}</span>)}</p>}
        </div>
      </div>
      <ul className="tw:m-0 tw:list-none tw:divide-y tw:divide-slate-100 tw:border-t tw:border-slate-100 tw:p-0 tw:md:border-l tw:md:border-t-0">
        {rows.map((x) => {
          const qty = sel[`${r.id}:${x.key}`]?.qty ?? 0;
          const hourly = x.kind === 'HOURLY';
          const unavailable = !hourly && full;
          return (
            <li key={x.key} data-testid="rate-row" className="tw:grid tw:grid-cols-[1fr_auto] tw:items-start tw:gap-x-4 tw:gap-y-2 tw:p-4">
              <div className="tw:min-w-0">
                <p className="tw:text-sm tw:font-bold">{x.title}</p>
                <p className={`tw:mt-1 tw:flex tw:items-start tw:gap-1.5 tw:text-xs ${x.tone}`}><Check size={14} className="tw:mt-0.5 tw:shrink-0" /> <span>{x.note}</span></p>
              </div>
              <div className="tw:flex tw:items-start tw:gap-3">
                <div className="tw:text-right"><strong className="tw:block tw:text-base">{hourly ? `từ ${money(x.price)}` : money(x.price)}</strong><span className="tw:text-[11px] tw:text-slate-500">{hourly ? 'giờ đầu' : `/ đêm${nights > 1 ? ` · ${nights} đêm` : ''}`}</span></div>
                <select aria-label={`Số phòng ${r.name} · ${x.title}`} data-testid="room-qty" disabled={unavailable} value={qty} onChange={(e) => onQty(r, x, Number(e.target.value))} className="tw:h-10 tw:rounded-lg tw:border tw:border-slate-300 tw:bg-white tw:px-2 tw:text-sm tw:font-bold">
                  {Array.from({ length: x.max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {hourly && qty > 0 && <div className="tw:col-span-2"><HourlyPicker hotelId={hotelId} room={r} date={date} line={sel[`${r.id}:HR`]?.hs} onPick={(hs) => onHours(r, hs)} /></div>}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

// Khung tổng: các dòng đã chọn, tổng số phòng/tiền và MỘT nút đặt phòng.
function Summary({ lines, nights, ready, onBook }) {
  const rooms = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((n, l) => n + l.qty * l.price * (l.kind === 'HOURLY' ? 1 : nights), 0);
  return (
    <aside data-testid="room-summary" aria-label="Tổng đặt phòng" className="tw:h-fit tw:rounded-xl tw:border tw:border-blue-100 tw:bg-blue-50 tw:p-4 tw:lg:sticky tw:lg:top-16">
      <p className="tw:text-xs tw:text-slate-600">{rooms} phòng · {nights} đêm</p>
      <strong className="tw:mt-1 tw:block tw:text-2xl">{money(total)}</strong>
      {lines.length > 0 && <ul className="tw:mt-3 tw:grid tw:list-none tw:gap-1 tw:p-0 tw:text-[11px] tw:text-slate-600">{lines.map((l) => <li key={l.key}>{l.qty} × {l.name} <span className="tw:text-slate-400">({l.label})</span></li>)}</ul>}
      <button type="button" disabled={!rooms || !ready} onClick={onBook} className="tw:mt-4 tw:min-h-11 tw:w-full tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-sm tw:font-bold tw:text-white tw:hover:bg-blue-700 tw:disabled:bg-slate-300">Đặt phòng</button>
      <p className="tw:mt-2 tw:text-[11px] tw:text-slate-500">{!rooms ? 'Chọn số phòng ở các dòng bên trái.' : !ready ? 'Chọn giờ vào cho phòng đặt theo giờ.' : 'Bạn sẽ chuyển sang bước nhập thông tin, chưa bị trừ tiền.'}</p>
    </aside>
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
  const fav = useFavorites(!!state.user);
  const [p, setP] = useState(null);
  const [st, setSt] = useState({ loading: true, error: '' });
  const [dates, setDates] = useState({ checkIn: isoDate(0), checkOut: isoDate(1) });
  const [party, setParty] = useState(() => { const x = partyFromPrefs(state.user?.preferences); return { adults: x.adults, children: x.children }; });
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('overview');
  const [booking, setBooking] = useState(false); // form đặt phòng mở ngay trên trang này
  const [cart, setCart] = useState(emptyCart);
  const [tick, setTick] = useState(0); // tải lại tồn phòng sau khi đặt/hết phòng
  const [sel, setSel] = useState({}); // `${roomId}:${STD|NR|HR}` -> { room, kind, plan, qty, hs }
  const winKey = JSON.stringify(windowOf(dates));
  useEffect(() => {
    const ctl = new AbortController();
    setSt((s) => ({ ...s, loading: true }));
    (async () => { await listAirports().catch(() => {}); return getHotel(state.propertyId, ctl.signal, JSON.parse(winKey)); })()
      .then((h) => { setP(h); setSt({ loading: false, error: '' }); })
      .catch((e) => { if (!ctl.signal.aborted) setSt({ loading: false, error: describeApiError(e) }); });
    return () => ctl.abort();
  }, [state.propertyId, winKey, tick]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [state.propertyId]);
  useEffect(() => { // đánh dấu tab theo mục đang xem
    if (!p || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setTab(e.target.id)), { rootMargin: '-30% 0px -60% 0px' });
    TABS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [p]);

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

  // Bảng chọn phòng: mỗi dòng một số lượng. Dòng theo đêm chỉ một mức hủy cho cả đơn (như giỏ): chọn mức khác thì bỏ các dòng đêm của mức cũ.
  const setRow = (room, x, qty) => setSel((cur) => {
    const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => !(qty > 0 && x.kind === 'NIGHT' && v.kind === 'NIGHT' && v.plan !== x.plan)));
    const key = `${room.id}:${x.key}`;
    if (qty > 0) next[key] = { ...next[key], room, kind: x.kind, plan: x.plan, label: x.title, qty }; else delete next[key];
    return next;
  });
  const setHours = (room, hs) => setSel((cur) => (cur[`${room.id}:HR`] ? { ...cur, [`${room.id}:HR`]: { ...cur[`${room.id}:HR`], hs } } : cur));
  const chosen = Object.entries(sel).map(([key, v]) => ({ key, qty: v.qty, name: v.room.name, label: v.label, kind: v.kind, price: v.kind === 'HOURLY' ? (v.hs ? hourlyPriceOf(v.room.hourly, v.hs.hours) : v.room.hourly.firstHourVnd) : v.plan === NR ? v.room.nonRefundablePrice : v.room.price }));
  const ready = Object.values(sel).every((v) => v.kind !== 'HOURLY' || v.hs);

  // Đặt phòng: dựng giỏ từ các dòng đã chọn rồi mở thẳng form đặt phòng với đúng ngày/khách.
  const book = () => {
    let cart = emptyCart();
    Object.values(sel).forEach((v) => { cart = setQty(cart, p, v.room, v.qty, Date.now(), v.kind === 'HOURLY' ? { kind: 'HOURLY', ...v.hs } : { plan: v.plan }); });
    if (!cart.lines.length) { setNotice('Không thêm được phòng này vào giỏ.'); return; }
    saveCart(cart);
    setCart(cart);
    setNotice('');
    setBooking(true);
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
          <div className="tw:flex tw:flex-1 tw:overflow-x-auto">{TABS.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)} aria-current={tab === id ? 'true' : undefined} className={`tw:min-h-11 tw:shrink-0 tw:border-b-2 tw:px-4 tw:text-xs tw:font-bold ${tab === id ? 'tw:border-blue-600 tw:text-blue-700' : 'tw:border-transparent tw:text-slate-700 tw:hover:bg-slate-50'}`}>{label}</button>)}</div>
          <button type="button" onClick={async () => { setCopied(await copyText(window.location.href)); window.setTimeout(() => setCopied(false), 2000); }} className="tw:min-h-11 tw:shrink-0 tw:px-2 tw:text-xs tw:font-bold tw:text-blue-700">{copied ? 'Đã sao chép' : 'Sao chép liên kết'}</button>
          <div className="tw:hidden tw:items-center tw:gap-3 tw:sm:flex"><span className="tw:text-xs tw:text-slate-500">từ <b className="tw:text-sm tw:text-blue-700">{money(cheapest)}</b>/đêm</span><button type="button" onClick={() => go('rooms')} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-4 tw:text-xs tw:font-bold tw:text-white">Chọn phòng</button></div>
        </div>
      </nav>
      {cheapest != null && <div data-testid="mobile-price-bar" className="tw:fixed tw:inset-x-0 tw:bottom-16 tw:z-30 tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-t tw:border-slate-200 tw:bg-white tw:px-5 tw:py-2 tw:shadow-[0_-8px_24px_rgba(15,23,42,.12)] tw:sm:hidden"><span className="tw:text-xs tw:text-slate-500">từ <b className="tw:text-base tw:text-blue-700">{money(cheapest)}</b>/đêm</span><button type="button" onClick={() => go('rooms')} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-sm tw:font-bold tw:text-white">Chọn phòng</button></div>}
      <div className="tw:mx-auto tw:max-w-[1080px] tw:space-y-6 tw:px-5 tw:pt-6">
        <header className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
          <div className="tw:min-w-0">
            <h1 className="tw:text-3xl tw:font-bold tw:tracking-tight">{p.name}</h1>
            <p className="tw:mt-2 tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1 tw:text-sm tw:text-slate-600">
              <span className="tw:flex tw:items-center tw:gap-1"><MapPin size={16} className="tw:text-blue-600" /> {p.address || `Gần sân bay ${apName}`}</span>
              {hasMap && <button type="button" onClick={() => go('location')} className="tw:font-bold tw:text-blue-700 tw:underline">Hiển thị bản đồ</button>}
            </p>
          </div>
          <div className="tw:flex tw:items-center tw:gap-2">
            <button type="button" data-testid="fav-toggle" aria-pressed={fav.ids.has(p.id)} aria-label={fav.ids.has(p.id) ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'} onClick={() => (state.user ? fav.toggle(p.id) : dispatch({ type: 'go', screen: 'login' }))} className={`tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white ${fav.ids.has(p.id) ? 'tw:text-rose-600' : 'tw:text-slate-500'}`}><Heart size={20} fill={fav.ids.has(p.id) ? 'currentColor' : 'none'} /></button>
            {cheapest != null && <button type="button" onClick={() => go('rooms')} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-6 tw:text-sm tw:font-bold tw:text-white tw:shadow-sm tw:hover:bg-blue-700">Đặt ngay<span className="tw:block tw:text-[11px] tw:font-normal tw:opacity-90">từ {money(cheapest)} / đêm</span></button>}
          </div>
        </header>
        <Gallery key={p.id} p={p} aside={
          <aside className="tw:grid tw:content-start tw:gap-3" aria-label="Tóm tắt">
            {p.rating && <div className="tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-4"><div className="tw:flex tw:items-center tw:justify-between tw:gap-3"><div><strong className="tw:block tw:text-sm">{ratingLabel(p.rating)}</strong><span className="tw:text-xs tw:text-slate-500">{p.rating}/10 · {p.ratingCount} đánh giá</span></div><span className="tw:grid tw:size-11 tw:place-items-center tw:rounded-xl tw:rounded-bl-none tw:bg-blue-800 tw:text-base tw:font-bold tw:text-white">{Number(p.rating).toFixed(1)}</span></div><button type="button" onClick={() => go('reviews')} className="tw:mt-3 tw:text-xs tw:font-bold tw:text-blue-700 tw:underline">Xem đánh giá của khách</button></div>}
            <div className="tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-4 tw:text-xs tw:text-slate-600"><p className="tw:flex tw:items-start tw:gap-2"><Plane size={15} className="tw:mt-0.5 tw:shrink-0 tw:text-blue-600" /><span>Cách sân bay {apName} <b>{p.distanceKm} km</b> · {p.travelMinutes} phút</span></p>{hasMap && <button type="button" onClick={() => go('location')} className="tw:mt-3 tw:min-h-11 tw:w-full tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white">Hiển thị trên bản đồ</button>}</div>
          </aside>} />

        <section id="overview" className={CARD} aria-label="Tổng quan">
          <p className="tw:text-sm tw:leading-7 tw:text-slate-600">{p.description || `Cách sân bay ${apName} ${p.distanceKm} km, khoảng ${p.travelMinutes} phút đi xe.`}</p>
          <h2 className="tw:mt-6 tw:text-base tw:font-bold">Điểm nổi bật của chỗ nghỉ</h2>
          <ul className="tw:mt-3 tw:grid tw:list-none tw:gap-3 tw:p-0 tw:sm:grid-cols-2 tw:lg:grid-cols-3">{[...services, ...facilities].slice(0, 6).map((x) => <li key={x} className="tw:flex tw:items-center tw:rounded-xl tw:border tw:border-slate-200 tw:p-3 tw:text-xs tw:font-semibold tw:text-slate-700"><span className="tw:mr-3 tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-blue-50 tw:text-blue-700"><Check size={15} /></span>{x}</li>)}</ul>
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
          <div className="tw:mt-4 tw:grid tw:items-start tw:gap-4 tw:lg:grid-cols-[1fr_260px]">
            <ul className="tw:m-0 tw:grid tw:list-none tw:gap-3 tw:p-0" aria-busy={st.loading}>{p.rooms.map((r) => <RoomType key={r.id} room={r} hotelId={p.id} date={dates.checkIn} nights={nights} sel={sel} onQty={setRow} onHours={setHours} />)}</ul>
            <Summary lines={chosen} nights={nights} ready={ready} onBook={book} />
          </div>
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
      {booking && <BookingModal hotel={p} cart={cart} onCart={(c) => { setCart(c); saveCart(c); }} dates={dates} people={party.adults + party.children} onClose={() => setBooking(false)} onRefresh={() => setTick((t) => t + 1)} onNotice={setNotice} />}
    </div>
  );
}
