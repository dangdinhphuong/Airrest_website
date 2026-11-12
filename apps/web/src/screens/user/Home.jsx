import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BedDouble, CalendarDays, Check, ChevronRight, CircleHelp, Clock3, Filter, Heart, Hotel, Info, MapPin,
  MoonStar, Plane, PlaneLanding, Search, ShieldCheck, Sparkles, Star, Users, X,
} from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useApp } from '../../state/store';
import { newIdempotencyKey } from '@airrest/api-client';
import { airportCity, createBooking, listAirports, listHotels, lookupFlight } from '../../data/user';
import { describeError } from '../../lib/api';
import { fmtDuration, isoDate, money } from '../../lib/time';
import { CHIPS, scrollToId, statusCopy } from './data';

gsap.registerPlugin(useGSAP);

const today = isoDate(0);
const tomorrow = isoDate(1);
const LABEL = 'tw:text-[10px] tw:font-extrabold tw:uppercase tw:tracking-[.16em] tw:text-blue-600';
const DISTANCES = [3, 5, 7];
const CHIP_ON = 'tw:border-blue-600 tw:bg-blue-600 tw:text-white';
const CHIP_OFF = 'tw:border-slate-200 tw:bg-white tw:text-slate-600';
const PAY = [
  ['AT_HOTEL', 'Thanh toán tại khách sạn', 'Không thu tiền trước.'],
  ['VNPAY', 'Thanh toán online qua VNPay', 'Giữ phòng trong thời gian ngắn, cổng thanh toán đang chạy chế độ mô phỏng.'],
];

function flightChip(f) {
  const dly = f.delayMinutes;
  if (f.status === 'cancelled') return ['CHUYẾN BAY BỊ HỦY', 'tw:bg-rose-100 tw:text-rose-800'];
  if (f.status === 'ontime') return ['ĐÚNG GIỜ', 'tw:bg-emerald-100 tw:text-emerald-800'];
  return [dly != null ? `CHẬM ${fmtDuration(dly).toUpperCase()}` : 'CHẬM · CHƯA RÕ GIỜ MỚI', 'tw:bg-amber-100 tw:text-amber-800'];
}

export default function Home() {
  const { state, dispatch } = useApp();
  const root = useRef(null);

  const [mode, setMode] = useState('flight');
  const [flight, setFlight] = useState('VN218');
  const [date, setDate] = useState(today);
  const [airport, setAirport] = useState('HAN');
  const [airports, setAirports] = useState([]);
  useEffect(() => { listAirports().then(setAirports).catch(() => setAirports([])); }, []);
  const airportOptions = airports.length ? airports.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>) : <option value="HAN">Nội Bài (HAN)</option>;
  const [result, setResult] = useState({ s: 'idle' }); // idle | loading | found | notfound | error
  const [chips, setChips] = useState([]);
  const [maxKm, setMaxKm] = useState('');
  const [liked, setLiked] = useState([]);
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState(null);
  const [bookingResult, setBookingResult] = useState(null);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0); // tải lại danh sách (thử lại khi lỗi, hoặc khi một phòng vừa hết)
  const [hotels, setHotels] = useState([]);
  const [hState, setHState] = useState('loading'); // loading | ok | error
  const [hError, setHError] = useState('');

  // Nơi nghỉ theo sân bay từ API (giá, số phòng còn, cờ tính năng do backend tính).
  useEffect(() => {
    const ctl = new AbortController();
    setHState('loading');
    listHotels(airport, ctl.signal).then((h) => { setHotels(h); setHState('ok'); }).catch((e) => { if (!ctl.signal.aborted) { setHError(describeError(e)); setHState('error'); } });
    return () => ctl.abort();
  }, [airport, tick]);
  const available = hotels.filter((h) => h.room.availableRooms > 0);
  const filtered = available.filter((h) => chips.every((id) => CHIPS.find((c) => c.id === id).test(h)) && (!maxKm || h.distanceKm <= Number(maxKm)));
  const toggleChip = (id) => setChips((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const clearFilters = () => { setChips([]); setMaxKm(''); };
  const filtering = chips.length > 0 || !!maxKm;

  const searchFlight = async (e) => {
    e.preventDefault();
    setResult({ s: 'loading' });
    try { setResult({ s: 'found', f: await lookupFlight(flight.trim().toUpperCase(), date) }); }
    catch (err) { setResult({ s: err.status === 404 ? 'notfound' : 'error' }); }
  };
  useEffect(() => { if (result.s === 'found' || result.s === 'notfound' || result.s === 'error') scrollToId('flight-status', 'center'); }, [result.s]);

  const openBooking = (hotel) => { setSelected(hotel); setStep(1); setBookingData(null); setBookingResult(null); setFormError(''); setActionError(''); };
  const closeBooking = () => setSelected(null);
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const captureBooking = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const d = Object.fromEntries(form.entries());
    if (d.checkOut <= d.checkIn) { setFormError('Ngày trả phòng phải sau ngày nhận phòng.'); return; }
    setFormError('');
    setBookingData({ ...d, passengerName: d.passengerName.trim(), paymentMethod: 'AT_HOTEL', idempotencyKey: newIdempotencyKey() });
    setStep(2);
  };

  const submitBooking = async () => {
    setActionError(''); setPending(true);
    try {
      const r = await createBooking({
        hotelId: selected.id, roomTypeId: selected.room.id, checkIn: bookingData.checkIn, checkOut: bookingData.checkOut, paymentMethod: bookingData.paymentMethod, idempotencyKey: bookingData.idempotencyKey,
        guest: { fullName: bookingData.passengerName, phone: bookingData.phone, ...(bookingData.email && { email: bookingData.email }) },
      });
      setBookingResult({ code: r.code, status: r.status, method: r.payment.method, payUrl: r.paymentLink?.payUrl, payError: r.paymentLink?.error });
      setStep(3);
      setTick((t) => t + 1); // số phòng còn đã đổi
    } catch (err) {
      setActionError(describeError(err));
      if (err.status === 409) setTick((t) => t + 1); // hết phòng/không còn bán: tải lại danh sách
    } finally { setPending(false); }
  };


  // Hiệu ứng: hero vào trang, thẻ nơi nghỉ khi đổi sân bay/bộ lọc, kết quả chuyến bay, modal. Chỉ opacity/transform.
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-hero]', { opacity: 0, y: 24, duration: 0.6, stagger: 0.1, ease: 'power3.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root });

  useGSAP(() => {
    const cards = gsap.utils.toArray('[data-card]');
    if (!cards.length) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(cards, { opacity: 0, y: 20, duration: 0.4, stagger: 0.06, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [airport, chips.join(), maxKm, hState, hotels.length] });

  useGSAP(() => {
    if (result.s === 'idle' || result.s === 'loading') return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-result]', { opacity: 0, y: 16, duration: 0.45, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [result.s] });

  useGSAP(() => {
    if (!selected) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-modal]', { opacity: 0, y: 28, scale: 0.98, duration: 0.3, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [selected?.id, step] });

  const f = result.f;
  const [chipText, chipTone] = f ? flightChip(f) : [];
  const toStays = (ap) => { if (ap) setAirport(ap); scrollToId('stays'); };

  return (
    <div ref={root}>
      <section id="top" className="tw:relative tw:overflow-hidden tw:bg-[#062253]">
        <img src="/images/hanoi-night.jpg" alt="Hà Nội về đêm nhìn từ trên cao" fetchPriority="high" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover tw:object-center tw:opacity-40" />
        <div className="tw:absolute tw:inset-0 tw:bg-gradient-to-r tw:from-[#031534] tw:via-[#042e70]/90 tw:to-[#031838]/30" />
        <div className="tw:relative tw:mx-auto tw:grid tw:min-h-[650px] tw:max-w-[1180px] tw:items-center tw:gap-12 tw:px-5 tw:py-14 tw:lg:grid-cols-[.95fr_1.05fr]">
          <div className="tw:max-w-2xl tw:text-white">
            <span data-hero className="tw:inline-flex tw:items-center tw:gap-2 tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[.16em] tw:text-blue-200"><Sparkles size={15} /> Đồng hành khi hành trình đổi kế hoạch</span>
            <h1 data-hero className="tw:mt-5 tw:text-4xl tw:font-bold tw:leading-[1.05] tw:tracking-[-.055em] tw:sm:text-5xl tw:lg:text-6xl">Chuyến bay gián đoạn.<br /><em className="tw:not-italic tw:text-[#70a9ff]">Giấc nghỉ thì không.</em></h1>
            <p data-hero className="tw:mt-6 tw:max-w-xl tw:text-sm tw:leading-7 tw:text-blue-100 tw:sm:text-base">Kiểm tra chuyến bay, tìm phòng còn trống gần 22 sân bay thương mại trên cả nước và gửi yêu cầu đặt chỗ mà không cần tạo tài khoản.</p>
            <div data-hero className="tw:mt-7 tw:flex tw:flex-wrap tw:gap-4 tw:text-xs tw:text-blue-100"><span className="tw:flex tw:items-center tw:gap-2"><ShieldCheck size={16} /> Không cần đăng nhập</span><span className="tw:flex tw:items-center tw:gap-2"><Clock3 size={16} /> Xử lý nhanh</span><span className="tw:flex tw:items-center tw:gap-2"><MoonStar size={16} /> Hỗ trợ xuyên đêm</span></div>
          </div>

          <form data-hero onSubmit={searchFlight} className="tw:w-full tw:rounded-[28px] tw:bg-white tw:p-5 tw:shadow-2xl tw:sm:p-7">
            <div className="tw:flex tw:items-start tw:justify-between tw:gap-4">
              <div><span className={LABEL}>Bắt đầu tại đây</span><h2 className="tw:mt-2 tw:text-xl tw:font-bold tw:tracking-tight tw:sm:text-2xl">Bạn cần hỗ trợ thế nào?</h2></div>
              <span className="tw:rounded-lg tw:bg-slate-100 tw:px-2.5 tw:py-1.5 tw:text-[9px] tw:font-bold tw:uppercase tw:tracking-wide tw:text-slate-500">Dữ liệu mô phỏng</span>
            </div>
            <div className="tw:mt-5 tw:grid tw:grid-cols-2 tw:rounded-xl tw:bg-slate-100 tw:p-1">
              <button type="button" onClick={() => setMode('flight')} className={`tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:px-2 tw:text-xs tw:font-bold ${mode === 'flight' ? 'tw:bg-white tw:text-blue-700 tw:shadow-sm' : 'tw:text-slate-500'}`}><PlaneLanding size={17} /> Chuyến bay</button>
              <button type="button" onClick={() => setMode('hotel')} className={`tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:px-2 tw:text-xs tw:font-bold ${mode === 'hotel' ? 'tw:bg-white tw:text-blue-700 tw:shadow-sm' : 'tw:text-slate-500'}`}><Hotel size={17} /> Tìm khách sạn</button>
            </div>
            {mode === 'flight' ? (
              <div className="tw:mt-5 tw:grid tw:gap-3 tw:sm:grid-cols-2">
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số hiệu chuyến bay<span className="ui-box"><Plane size={18} className="tw:text-slate-400" /><input className="ui-bare" value={flight} onChange={(e) => setFlight(e.target.value.toUpperCase())} required /></span></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Ngày bay<span className="ui-box"><CalendarDays size={18} className="tw:text-slate-400" /><input className="ui-bare" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></span></label>
              </div>
            ) : (
              <div className="tw:mt-5 tw:grid tw:gap-3 tw:sm:grid-cols-2">
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Sân bay<span className="ui-box"><MapPin size={18} className="tw:text-slate-400" /><select className="ui-bare" value={airport} onChange={(e) => setAirport(e.target.value)}>{airportOptions}</select></span></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số khách<span className="ui-box"><Users size={18} className="tw:text-slate-400" /><select className="ui-bare"><option>1 khách</option><option>2 khách</option><option>3 khách</option><option>4 khách</option></select></span></label>
              </div>
            )}
            <button type={mode === 'flight' ? 'submit' : 'button'} disabled={result.s === 'loading'} onClick={mode === 'hotel' ? () => toStays() : undefined} className="tw:mt-4 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-[#1262e8] tw:px-5 tw:text-sm tw:font-bold tw:text-white tw:hover:bg-[#0b45c6] tw:disabled:opacity-60"><Search size={18} /> {mode === 'flight' ? (result.s === 'loading' ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái') : 'Tìm nơi nghỉ'} <ArrowRight size={18} className="tw:ml-auto" /></button>
            <p className="tw:mt-3 tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-center tw:text-[10px] tw:leading-4 tw:text-slate-500"><ShieldCheck size={14} /> Chỉ thu thập thông tin cần thiết khi bạn gửi booking.</p>
          </form>
        </div>
      </section>

      {(result.s === 'found' || result.s === 'notfound' || result.s === 'error') && (
        <section id="flight-status" className="tw:mx-auto tw:max-w-[1180px] tw:px-5 tw:pt-14">
          {result.s === 'found' ? (
            <div data-result className="tw:overflow-hidden tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-lg">
              <div className="tw:flex tw:flex-col tw:justify-between tw:gap-3 tw:border-b tw:border-slate-200 tw:p-5 tw:sm:flex-row tw:sm:items-center"><div className="tw:flex tw:items-center tw:gap-3"><strong className="tw:text-xl">{f.code}</strong><span className={`tw:rounded-full tw:px-3 tw:py-1.5 tw:text-[10px] tw:font-bold ${chipTone}`}>{chipText}</span></div><span className="tw:text-[10px] tw:text-slate-500">Cập nhật mô phỏng lúc {f.updatedAt}</span></div>
              <div className="tw:grid tw:grid-cols-[1fr_1.4fr_1fr] tw:items-center tw:px-4 tw:py-7 tw:text-center tw:sm:px-16"><div><strong className="tw:text-3xl">{f.origin}</strong><p className="tw:text-xs tw:text-slate-500">{airportCity(f.origin)}{f.schedTime && ` · Giờ cũ ${f.schedTime}`}</p></div><div className="tw:flex tw:items-center tw:text-blue-600"><span className="tw:h-px tw:flex-1 tw:bg-blue-200" /><Plane className="tw:mx-2" /><span className="tw:h-px tw:flex-1 tw:bg-blue-200" /></div><div><strong className="tw:text-3xl">{f.dest ?? '—'}</strong><p className="tw:text-xs tw:font-bold tw:text-blue-600">{airportCity(f.dest)}{f.status !== 'cancelled' && ` · Giờ mới ${f.newTime ?? (f.status === 'ontime' ? f.schedTime : 'chưa rõ')}`}</p></div></div>
              <div className="tw:flex tw:flex-col tw:justify-between tw:gap-4 tw:bg-blue-50 tw:p-5 tw:sm:flex-row tw:sm:items-center"><div className="tw:flex tw:items-center tw:gap-3"><span className="tw:grid tw:size-11 tw:place-items-center tw:rounded-xl tw:bg-white tw:text-blue-600"><MoonStar /></span><div><small className="tw:text-slate-500">Tình trạng</small><p className="tw:font-bold">{f.status === 'ontime' ? 'Chuyến bay đúng giờ, chưa cần tìm nơi nghỉ' : 'Có thể tìm nơi nghỉ gần sân bay'}</p></div></div><button type="button" onClick={() => toStays(f.origin)} className="tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tìm khách sạn gần sân bay</button></div>
            </div>
          ) : result.s === 'notfound' ? (
            <div data-result className="tw:rounded-2xl tw:border tw:border-amber-200 tw:bg-amber-50 tw:p-6"><h2 className="tw:font-bold">Không tìm thấy chuyến bay</h2><p className="tw:mt-2 tw:text-sm tw:text-slate-600">Hãy kiểm tra lại số hiệu hoặc tiếp tục tìm nơi nghỉ. Việc tra cứu chuyến bay không bắt buộc.</p><button type="button" onClick={() => toStays()} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tiếp tục tìm khách sạn</button></div>
          ) : (
            <div data-result role="alert" className="tw:rounded-2xl tw:border tw:border-rose-200 tw:bg-rose-50 tw:p-6"><h2 className="tw:font-bold">Không tra cứu được chuyến bay</h2><p className="tw:mt-2 tw:text-sm tw:text-slate-600">Dịch vụ dữ liệu mô phỏng tạm thời lỗi. Bạn vẫn có thể tiếp tục tìm nơi nghỉ.</p><button type="button" onClick={() => toStays()} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tiếp tục tìm khách sạn</button></div>
          )}
        </section>
      )}

      <section id="how" className="tw:mx-auto tw:max-w-[1180px] tw:px-5 tw:py-12">
        <div className="tw:mx-auto tw:max-w-xl tw:text-center"><span className={LABEL}>Quy trình minh bạch</span><h2 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Đặt chỗ trong ba bước</h2><p className="tw:mt-3 tw:text-sm tw:leading-6 tw:text-slate-500">AIRREST tiếp nhận yêu cầu, khách sạn xác nhận và cập nhật trạng thái để bạn chủ động theo dõi.</p></div>
        <div className="tw:mt-8 tw:grid tw:gap-4 tw:md:grid-cols-3">
          {[
            ['01', 'Chọn nơi nghỉ', 'So sánh khoảng cách, giá, tiện ích và số phòng mô phỏng.'],
            ['02', 'Gửi yêu cầu', 'Nhập thông tin liên hệ cần thiết, không cần đăng ký tài khoản.'],
            ['03', 'Theo dõi xác nhận', 'Dùng mã booking và số điện thoại để xem khách sạn đã xác nhận hay từ chối.'],
          ].map(([number, title, copy]) => <article key={number} className="tw:rounded-2xl tw:border tw:border-slate-200 tw:p-6"><span className="tw:text-sm tw:font-extrabold tw:text-blue-600">{number}</span><h3 className="tw:mt-5 tw:font-bold">{title}</h3><p className="tw:mt-2 tw:text-xs tw:leading-6 tw:text-slate-500">{copy}</p></article>)}
        </div>
      </section>

      <section id="stays" className="tw:bg-slate-50 tw:py-12">
        <div className="tw:mx-auto tw:max-w-[1180px] tw:px-5">
          <div className="tw:flex tw:flex-col tw:justify-between tw:gap-5 tw:sm:flex-row tw:sm:items-end"><div><span className={LABEL}>Nơi nghỉ gần sân bay</span><h2 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Phòng đang mở nhận yêu cầu</h2><p className="tw:mt-2 tw:text-sm tw:text-slate-500">Giá và tồn phòng mô phỏng, không phải dữ liệu thời gian thực.</p></div><select aria-label="Sân bay" value={airport} onChange={(e) => setAirport(e.target.value)}>{airportOptions}</select></div>
          <div className="tw:mt-7 tw:flex tw:items-center tw:gap-2 tw:overflow-x-auto tw:pb-2 tw:md:flex-wrap tw:md:overflow-visible">
            <button type="button" onClick={clearFilters} aria-pressed={!filtering} className={`tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-full tw:border tw:px-4 tw:py-2.5 tw:text-xs tw:font-bold ${!filtering ? CHIP_ON : CHIP_OFF}`}><Filter size={14} /> Phù hợp nhất</button>
            {CHIPS.map((c) => <button type="button" key={c.id} onClick={() => toggleChip(c.id)} aria-pressed={chips.includes(c.id)} className={`tw:shrink-0 tw:rounded-full tw:border tw:px-4 tw:py-2.5 tw:text-xs tw:font-bold ${chips.includes(c.id) ? CHIP_ON : CHIP_OFF}`}>{c.label}</button>)}
            <select aria-label="Khoảng cách tới sân bay" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} className={`tw:h-10 tw:shrink-0 tw:rounded-full tw:border tw:px-4 tw:text-xs tw:font-bold ${maxKm ? CHIP_ON : CHIP_OFF}`}><option value="">Mọi khoảng cách</option>{DISTANCES.map((km) => <option key={km} value={km}>Trong {km} km</option>)}</select>
            {filtering && <button type="button" onClick={clearFilters} className="tw:shrink-0 tw:px-2 tw:text-xs tw:font-bold tw:text-blue-600 tw:underline">Xóa bộ lọc</button>}
          </div>
          <p className="tw:mt-3 tw:text-[10px] tw:text-slate-500" aria-live="polite">{filtered.length}/{available.length} nơi nghỉ phù hợp</p>
          {hState === 'loading' ? (
            <p className="tw:mt-6 tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-10 tw:text-center tw:text-sm tw:text-slate-500" aria-live="polite">Đang tải nơi nghỉ…</p>
          ) : hState === 'error' ? (
            <div role="alert" className="tw:mt-6 tw:rounded-2xl tw:border tw:border-rose-200 tw:bg-rose-50 tw:p-8 tw:text-center"><h3 className="tw:font-bold">Không tải được danh sách nơi nghỉ</h3><p className="tw:mt-2 tw:text-xs tw:text-slate-600">{hError}</p><button type="button" onClick={() => setTick((t) => t + 1)} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Thử lại</button></div>
          ) : filtered.length ? (
            <div className="tw:mt-5 tw:grid tw:gap-5 tw:md:grid-cols-2 tw:xl:grid-cols-3">
              {filtered.map((hotel) => (
                <article data-card key={hotel.id} className="tw:overflow-hidden tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-sm tw:transition tw:hover:-translate-y-1 tw:hover:shadow-xl">
                  <div className="tw:relative tw:h-52 tw:overflow-hidden"><img src={hotel.image} alt={`Không gian tại ${hotel.name}`} loading="lazy" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /><button type="button" onClick={() => setLiked(liked.includes(hotel.id) ? liked.filter((id) => id !== hotel.id) : [...liked, hotel.id])} aria-label="Lưu khách sạn" aria-pressed={liked.includes(hotel.id)} className="tw:absolute tw:right-3 tw:top-3 tw:grid tw:size-10 tw:place-items-center tw:rounded-full tw:bg-white/95 tw:text-slate-600"><Heart size={18} className={liked.includes(hotel.id) ? 'fill-rose-500 text-rose-500' : ''} /></button></div>
                  <div className="tw:p-5">
                    <div className="tw:flex tw:items-start tw:justify-between tw:gap-3"><div><h3 className="tw:font-bold">{hotel.name}</h3><p className="tw:mt-2 tw:flex tw:items-center tw:gap-1 tw:text-[10px] tw:text-slate-500"><MapPin size={12} /> {hotel.distanceKm} km · {hotel.travelMinutes} phút đi xe</p></div>{hotel.rating && <span className="tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:bg-emerald-50 tw:px-2 tw:py-1.5 tw:text-[10px] tw:font-bold tw:text-emerald-700"><Star size={11} fill="currentColor" /> {hotel.rating}</span>}</div>
                    <div className="tw:my-4 tw:flex tw:flex-wrap tw:gap-1.5">{hotel.amenities.slice(0, 3).map((item) => <span key={item} className="tw:rounded-md tw:bg-slate-100 tw:px-2 tw:py-1.5 tw:text-[9px] tw:text-slate-600">{item}</span>)}</div>
                    <div className="tw:border-y tw:border-slate-100 tw:py-3 tw:text-xs tw:text-slate-600"><strong className="tw:text-slate-800">{hotel.room.name}</strong><span className="tw:float-right tw:text-[10px] tw:font-bold tw:text-rose-600">Còn {hotel.room.availableRooms} phòng</span></div>
                    <div className="tw:flex tw:items-end tw:justify-between tw:gap-3 tw:pt-4"><div><small className="tw:text-[9px] tw:text-slate-500">Từ / đêm</small><p className="tw:text-lg tw:font-extrabold">{money(hotel.room.price)}</p></div><button type="button" onClick={() => openBooking(hotel)} className="tw:flex tw:items-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:px-4 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Chọn phòng <ChevronRight size={15} /></button></div>
                    <button type="button" onClick={() => { dispatch({ type: 'openProperty', id: hotel.id }); window.scrollTo({ top: 0 }); }} className="tw:mt-4 tw:block tw:w-full tw:text-center tw:text-[10px] tw:font-bold tw:text-blue-600">Xem chi tiết khách sạn</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="tw:mt-6 tw:rounded-2xl tw:border tw:border-dashed tw:border-slate-300 tw:bg-white tw:p-10 tw:text-center"><BedDouble className="tw:mx-auto tw:text-slate-400" /><h3 className="tw:mt-4 tw:font-bold">Chưa có phòng phù hợp</h3><p className="tw:mt-2 tw:text-xs tw:text-slate-500">Hãy đổi sân bay hoặc bỏ bớt bộ lọc.</p>{filtering && <button type="button" onClick={clearFilters} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Xóa bộ lọc</button>}</div>
          )}
          <p className="tw:mt-6 tw:flex tw:items-start tw:justify-center tw:gap-2 tw:text-center tw:text-[10px] tw:leading-5 tw:text-slate-500"><Info size={14} className="tw:mt-0.5 tw:shrink-0" /> Dữ liệu khách sạn, giá và tồn phòng là dữ liệu demo phục vụ nghiên cứu MVP.</p>
        </div>
      </section>

      <section className="tw:bg-[#1262e8] tw:text-white">
        <div className="tw:mx-auto tw:flex tw:max-w-[1180px] tw:flex-col tw:justify-between tw:gap-6 tw:px-5 tw:py-9 tw:sm:flex-row tw:sm:items-center"><div className="tw:flex tw:items-start tw:gap-4"><span className="tw:grid tw:size-12 tw:shrink-0 tw:place-items-center tw:rounded-xl tw:bg-white/15"><CircleHelp /></span><div><h2 className="tw:text-lg tw:font-bold">Bạn cần hỗ trợ thêm?</h2><p className="tw:mt-1 tw:text-xs tw:text-blue-100">Gửi ticket hoặc tra cứu booking bằng thông tin xác minh.</p></div></div><div className="tw:flex tw:gap-3"><button type="button" onClick={() => dispatch({ type: 'go', screen: 'support' })} className="tw:rounded-xl tw:border tw:border-white/50 tw:px-4 tw:py-3 tw:text-xs tw:font-bold">Gửi yêu cầu</button><button type="button" onClick={() => dispatch({ type: 'go', screen: 'track' })} className="tw:rounded-xl tw:bg-white tw:px-4 tw:py-3 tw:text-xs tw:font-bold tw:text-blue-700">Theo dõi booking</button></div></div>
      </section>

      {selected && (
        <div className="tw:fixed tw:inset-0 tw:z-[100] tw:grid tw:place-items-end tw:bg-slate-950/75 tw:p-0 tw:backdrop-blur-sm tw:sm:place-items-center tw:sm:p-5" role="dialog" aria-modal="true" aria-label="Tạo booking">
          <div data-modal className="tw:max-h-[96dvh] tw:w-full tw:overflow-y-auto tw:rounded-t-3xl tw:bg-white tw:p-5 tw:shadow-2xl tw:sm:max-w-xl tw:sm:rounded-3xl tw:sm:p-8">
            <button type="button" className="tw:float-right tw:grid tw:size-10 tw:place-items-center tw:rounded-full tw:bg-slate-100" onClick={closeBooking} aria-label="Đóng"><X size={18} /></button>
            {step === 1 && (
              <form onSubmit={captureBooking}>
                <span className={LABEL}>Bước 1 / 3</span><h2 className="tw:mt-2 tw:text-2xl tw:font-bold">Thông tin đặt phòng</h2>
                <div className="tw:mt-5 tw:flex tw:gap-3 tw:rounded-xl tw:border tw:border-slate-200 tw:p-3"><div className="tw:relative tw:h-20 tw:w-24 tw:shrink-0 tw:overflow-hidden tw:rounded-lg"><img src={selected.image} alt="" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></div><div><strong className="tw:text-sm">{selected.name}</strong><p className="tw:mt-1 tw:text-xs tw:text-slate-500">{selected.room.name}</p><p className="tw:mt-2 tw:text-xs tw:font-bold tw:text-blue-600">{money(selected.room.price)} / đêm</p></div></div>
                <div className="tw:mt-5 tw:grid tw:gap-4 tw:sm:grid-cols-2">
                  <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Họ và tên<input name="passengerName" required maxLength={80} autoComplete="name" placeholder="Nguyễn Minh Anh" /></label>
                  <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số điện thoại<input name="phone" type="tel" inputMode="tel" required pattern="[0-9+ ]{9,15}" title="Từ 9 đến 15 chữ số" autoComplete="tel" placeholder="0912345678" /></label>
                  <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Email<input name="email" type="email" required autoComplete="email" placeholder="ban@example.com" /></label>
                  <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Nhận phòng<input name="checkIn" type="date" min={today} defaultValue={today} required /></label>
                  <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Trả phòng<input name="checkOut" type="date" min={tomorrow} defaultValue={tomorrow} required /></label>
                </div>
                <p className="tw:mt-4 tw:text-[10px] tw:leading-5 tw:text-slate-500">Thông tin liên hệ chỉ dùng để xử lý và xác minh booking. Không cần tạo tài khoản.</p>
                {formError && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{formError}</p>}
                <button className="tw:mt-5 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-sm tw:font-bold tw:text-white">Tiếp tục xem lại <ArrowRight size={17} /></button>
              </form>
            )}
            {step === 2 && bookingData && (
              <div>
                <span className={LABEL}>Bước 2 / 3</span><h2 className="tw:mt-2 tw:text-2xl tw:font-bold">Xác nhận yêu cầu</h2>
                <div className="tw:mt-5 tw:divide-y tw:divide-slate-100 tw:rounded-xl tw:border tw:border-slate-200 tw:px-4 tw:text-xs">{[['Khách sạn', selected.name], ['Loại phòng', selected.room.name], ['Hành khách', bookingData.passengerName], ['Liên hệ', `${bookingData.phone} · ${bookingData.email}`], ['Thời gian', `${bookingData.checkIn} → ${bookingData.checkOut}`], ['Giá ước tính / đêm', money(selected.room.price)], ['Thanh toán', bookingData.paymentMethod === 'VNPAY' ? 'VNPay (online)' : 'Tại khách sạn']].map(([label, value]) => <div key={label} className="tw:flex tw:justify-between tw:gap-5 tw:py-3"><span className="tw:text-slate-500">{label}</span><strong className="tw:text-right">{value}</strong></div>)}</div>
                <fieldset className="tw:mt-4"><legend className="tw:text-xs tw:font-bold">Hình thức thanh toán</legend><div className="tw:mt-2 tw:grid tw:gap-2">{PAY.map(([id, label, hint]) => <label key={id} className={`tw:flex tw:cursor-pointer tw:items-start tw:gap-3 tw:rounded-xl tw:border tw:p-3 tw:text-xs ${bookingData.paymentMethod === id ? 'tw:border-blue-600 tw:bg-blue-50' : 'tw:border-slate-200'}`}><input type="radio" name="paymentMethod" value={id} checked={bookingData.paymentMethod === id} onChange={() => setBookingData({ ...bookingData, paymentMethod: id })} className="tw:mt-0.5" /><span><strong className="tw:block">{label}</strong><span className="tw:text-slate-500">{hint}</span></span></label>)}</div></fieldset>
                <div className="tw:mt-4 tw:rounded-xl tw:bg-amber-50 tw:p-4 tw:text-xs tw:leading-5 tw:text-amber-900"><strong>Đây là yêu cầu đặt phòng.</strong> Khách sạn có thể cần xác nhận; hãy theo dõi bằng mã booking và số điện thoại.</div>
                {actionError && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{actionError}</p>}
                <div className="tw:mt-5 tw:flex tw:gap-3"><button type="button" onClick={() => setStep(1)} className="tw:min-h-11 tw:flex-1 tw:rounded-xl tw:border tw:border-slate-300 tw:text-xs tw:font-bold">Chỉnh sửa</button><button type="button" disabled={pending} onClick={submitBooking} className="tw:min-h-11 tw:flex-[1.4] tw:rounded-xl tw:bg-blue-600 tw:px-4 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60">{pending ? 'Đang kiểm tra phòng...' : 'Xác nhận booking request'}</button></div>
              </div>
            )}
            {step === 3 && bookingResult && (
              <div className="tw:py-4 tw:text-center"><span className="tw:mx-auto tw:grid tw:size-16 tw:place-items-center tw:rounded-full tw:bg-emerald-50 tw:text-emerald-600"><Check size={30} /></span><span className="tw:mt-5 tw:block tw:text-[10px] tw:font-extrabold tw:uppercase tw:tracking-[.16em] tw:text-emerald-600">Đã gửi thành công</span><h2 className="tw:mt-2 tw:text-2xl tw:font-bold">Yêu cầu đã được ghi nhận</h2><p className="tw:mx-auto tw:mt-3 tw:max-w-md tw:text-xs tw:leading-6 tw:text-slate-500">Lưu mã booking và dùng đúng số điện thoại đã nhập để theo dõi trạng thái.</p><div className="tw:my-6 tw:rounded-2xl tw:bg-blue-50 tw:p-5"><small className="tw:text-slate-500">Mã booking</small><p className="tw:mt-2 tw:text-2xl tw:font-extrabold tw:tracking-wider tw:text-blue-700">{bookingResult.code}</p><span className="tw:mt-3 tw:inline-block tw:rounded-full tw:bg-amber-100 tw:px-3 tw:py-1.5 tw:text-[10px] tw:font-bold tw:text-amber-800">{statusCopy(bookingResult.status)}</span></div>
                {bookingResult.method === 'VNPAY' && (bookingResult.payUrl
                  ? <button type="button" onClick={() => window.location.assign(bookingResult.payUrl)} className="tw:mb-3 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-emerald-600 tw:text-sm tw:font-bold tw:text-white">Thanh toán qua VNPay <ArrowRight size={17} /></button>
                  : <p role="alert" className="tw:mb-3 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">Chưa tạo được link thanh toán. Vào “Theo dõi booking” để lấy lại link.</p>)}
                <button type="button" onClick={() => dispatch({ type: 'go', screen: 'track' })} className="tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-sm tw:font-bold tw:text-white">Theo dõi booking <ArrowRight size={17} /></button></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
