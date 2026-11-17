import React, { useEffect, useRef, useState } from 'react';
import Photo from './Photo';
import {
  ArrowRight, BedDouble, CalendarDays, ChevronRight, CircleHelp, Clock3, Heart, Hotel, MapPin, MoonStar, Plane, PlaneLanding, ScanBarcode, Search, ShieldCheck, Sparkles, Star,
} from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useApp } from '../../state/store';
import { airportCity, bestRoom, describeApiError, listAirports, listHotels, listTopRated, lookupFlight, peekHotels } from '../../data/user';
import { fmtDuration, isoDate, money } from '../../lib/time';
import { peekStaysIntent, clearStaysIntent, partyFromPrefs, scrollToId, setStaysIntent } from './data';
import ScanTicket from './ScanTicket';
import GuestsPicker from './GuestsPicker';
import Select from '../../components/Select';

gsap.registerPlugin(useGSAP);

const today = isoDate(0);
const LABEL = 'tw:text-[11px] tw:font-extrabold tw:uppercase tw:tracking-[.16em] tw:text-blue-600';
const POPULAR = ['HAN', 'SGN', 'DAD']; // sân bay hiện thành tab; còn lại nằm trong ô 'Sân bay khác'
const TOP_N = 4;
const CHIP_ON = 'tw:border-blue-600 tw:bg-blue-600 tw:text-white';
const CHIP_OFF = 'tw:border-slate-200 tw:bg-white tw:text-slate-600';

function flightChip(f) {
  const dly = f.delayMinutes;
  if (f.status === 'cancelled') return ['CHUYẾN BAY BỊ HỦY', 'tw:bg-rose-100 tw:text-rose-800'];
  if (f.status === 'ontime') return ['ĐÚNG GIỜ', 'tw:bg-emerald-100 tw:text-emerald-800'];
  return [dly != null ? `CHẬM ${fmtDuration(dly).toUpperCase()}` : 'CHẬM · CHƯA RÕ GIỜ MỚI', 'tw:bg-amber-100 tw:text-amber-800'];
}

// Thông tin đọc được từ thẻ lên tàu, hiển thị cả khi hệ thống không có chuyến đó. Chữ in qua OCR dễ sai nên có nhắc kiểm tra.
function ScannedInfo({ q }) {
  const route = q.from && q.to ? `${q.from} → ${q.to}` : '';
  const extra = [route, q.time && `khởi hành ${q.time}`].filter(Boolean).join(' · ');
  return (
    <div className="tw:mt-1">
      <p className="tw:text-sm tw:font-bold tw:text-slate-800">{q.code} · {q.day.split('-').reverse().join('/')}</p>
      {extra && <p className="tw:text-sm tw:text-slate-700">{extra}</p>}
      {q.source === 'ocr' && <p className="tw:mt-1 tw:text-xs tw:text-amber-800">Thông tin đọc từ chữ in trên ảnh nên có thể sai (nhất là ngày). Hãy kiểm tra lại với thẻ lên tàu.</p>}
    </div>
  );
}

export default function Home() {
  const { state, dispatch } = useApp();
  const root = useRef(null);

  const [mode, setMode] = useState('flight');
  const [flight, setFlight] = useState('VN218');
  const [scanning, setScanning] = useState(false);
  const [date, setDate] = useState(today);
  const [intent] = useState(peekStaysIntent); // từ trang danh sách: sân bay + (tuỳ chọn) khách sạn cần mở modal đặt phòng
  useEffect(() => { clearStaysIntent(); }, []);
  const [airport, setAirport] = useState(intent?.airport || state.browseAirport || 'HAN');
  const [airports, setAirports] = useState([]);
  useEffect(() => { listAirports().then(setAirports).catch(() => setAirports([])); }, []);
  const airportOptions = airports.length ? airports.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>) : <option value="HAN">Nội Bài (HAN)</option>;
  const tabAirports = airports.length ? POPULAR.map((c) => airports.find((a) => a.iata === c)).filter(Boolean) : [{ iata: 'HAN', name: 'Nội Bài' }];
  const [result, setResult] = useState({ s: 'idle' }); // idle | loading | found | notfound | error
  const [liked, setLiked] = useState([]);
  const [tick, setTick] = useState(0); // tải lại danh sách (thử lại khi lỗi, hoặc khi một phòng vừa hết)
  const [hotels, setHotels] = useState([]);
  const [hState, setHState] = useState('loading'); // loading | ok | error
  const [hError, setHError] = useState('');
  const [party, setParty] = useState(() => partyFromPrefs(state.user?.preferences)); // 'Khách và phòng' (trẻ em tính vào tổng số khách); là giá trị mặc định của modal đặt phòng
  const people = party.adults + party.children;
  useEffect(() => { const p = state.user?.preferences; if (p) { setParty(partyFromPrefs(p)); if (p.airport && !intent?.airport) setAirport(p.airport); } }, [state.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- khách đăng nhập/khôi phục phiên sau khi trang đã dựng: áp cấu hình cá nhân

  // Nơi nghỉ theo sân bay từ API (giá, số phòng còn, cờ tính năng do backend tính).
  useEffect(() => {
    const ctl = new AbortController();
    const cached = peekHotels(airport, { sort: 'rating', limit: TOP_N, guests: people, rooms: party.rooms });
    if (cached) { setHotels(cached); setHState('ok'); } else setHState('loading'); // có sẵn: hiện ngay, tải lại ngầm
    listHotels(airport, ctl.signal, { sort: 'rating', limit: TOP_N, guests: people, rooms: party.rooms }).then((h) => { setHotels(h); setHState('ok'); }).catch((e) => { if (!ctl.signal.aborted) { setHError(describeApiError(e)); setHState('error'); } });
    return () => ctl.abort();
  }, [airport, tick, people, party.rooms]);
  // Backend đã lọc theo số người/phòng và trả top TOP_N theo đánh giá; thẻ hiển thị loại phòng rẻ nhất thỏa điều kiện.
  const available = hotels.map((h) => { const room = bestRoom(h, people, party.rooms); return room && { ...h, room }; }).filter(Boolean);
  const shown = available; // thứ tự theo đánh giá do backend sắp; danh sách đầy đủ ở trang 'stays'

  // 'Được khách đánh giá cao': toàn hệ thống, không phụ thuộc tab sân bay.
  const [top, setTop] = useState([]);
  const [tState, setTState] = useState('loading'); // loading | ok | error
  const [tError, setTError] = useState('');
  useEffect(() => {
    const ctl = new AbortController();
    setTState('loading');
    listTopRated(ctl.signal, { guests: people, rooms: party.rooms }).then((h) => { setTop(h); setTState('ok'); }).catch((e) => { if (!ctl.signal.aborted) { setTError(describeApiError(e)); setTState('error'); } });
    return () => ctl.abort();
  }, [tick, people, party.rooms]);
  const topShown = top.map((h) => { const room = bestRoom(h, people, party.rooms); return room && { ...h, room }; }).filter(Boolean);
  const toTopStays = (hotelId) => { setStaysIntent({ airport: hotelId ? top.find((h) => h.id === hotelId)?.airportCode : undefined, hotelId, sort: 'rating', party }); dispatch({ type: 'go', screen: 'stays' }); window.scrollTo({ top: 0 }); };

  const hotelCard = (hotel, onChoose) => (
                <article data-card key={hotel.id} className="tw:overflow-hidden tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-sm tw:transition tw:hover:-translate-y-1 tw:hover:shadow-xl">
                  <div className="tw:relative tw:h-52 tw:overflow-hidden"><Photo src={hotel.image} alt={`Không gian tại ${hotel.name}`} size={40} /><button type="button" onClick={() => setLiked(liked.includes(hotel.id) ? liked.filter((id) => id !== hotel.id) : [...liked, hotel.id])} aria-label="Lưu khách sạn" aria-pressed={liked.includes(hotel.id)} className="tw:absolute tw:right-3 tw:top-3 tw:grid tw:size-11 tw:place-items-center tw:rounded-full tw:bg-white/95 tw:text-slate-600"><Heart size={18} className={liked.includes(hotel.id) ? 'fill-rose-500 text-rose-500' : ''} /></button></div>
                  <div className="tw:p-5">
                    <div className="tw:flex tw:items-start tw:justify-between tw:gap-3"><div><h3 className="tw:font-bold">{hotel.name}</h3><p className="tw:mt-2 tw:flex tw:items-center tw:gap-1 tw:text-[11px] tw:text-slate-500"><MapPin size={12} /> {hotel.distanceKm} km · {hotel.travelMinutes} phút đi xe</p></div>{hotel.rating && <span className="tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:bg-emerald-50 tw:px-2 tw:py-1.5 tw:text-[11px] tw:font-bold tw:text-emerald-700"><Star size={11} fill="currentColor" /> {hotel.rating}</span>}</div>
                    <div className="tw:my-4 tw:flex tw:flex-wrap tw:gap-1.5">{hotel.amenities.slice(0, 3).map((item) => <span key={item} className="tw:rounded-md tw:bg-slate-100 tw:px-2 tw:py-1.5 tw:text-[11px] tw:text-slate-600">{item}</span>)}</div>
                    <div className="tw:flex tw:items-end tw:justify-between tw:gap-3 tw:pt-4"><div><small className="tw:text-[11px] tw:text-slate-500">Từ / đêm</small><p className="tw:text-lg tw:font-extrabold">{money(hotel.room.price)}</p></div><button type="button" onClick={() => onChoose(hotel)} className="tw:flex tw:items-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:px-4 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Chọn phòng <ChevronRight size={15} /></button></div>
                    <button type="button" onClick={() => { dispatch({ type: 'openProperty', id: hotel.id }); window.scrollTo({ top: 0 }); }} className="tw:mt-2 tw:block tw:w-full tw:py-2.5 tw:text-center tw:text-[11px] tw:font-bold tw:text-blue-600">Xem chi tiết khách sạn</button>
                  </div>
                </article>
  );

  const runFlightSearch = async (code, day, scan) => {
    setResult({ s: 'loading' });
    try { setResult({ s: 'found', f: await lookupFlight(code, day) }); }
    catch (err) { setResult({ s: err.status === 404 ? 'notfound' : 'error', q: { code, day, ...scan } }); }
  };
  const searchFlight = (e) => { e.preventDefault(); runFlightSearch(flight.trim().toUpperCase(), date); };
  const onScanned = ({ flight: code, date: day, ...scan }) => { setScanning(false); setFlight(code); setDate(day); runFlightSearch(code, day, scan); };
  useEffect(() => { if (result.s === 'found' || result.s === 'notfound' || result.s === 'error') scrollToId('flight-status', 'center'); }, [result.s]);

  // 'Chọn phòng': sang trang danh sách, mở sẵn khách sạn đó để thêm phòng vào giỏ và đặt ngay ở đó.
  const openBooking = (hotel) => { setStaysIntent({ airport, hotelId: hotel.id, party }); dispatch({ type: 'go', screen: 'stays' }); window.scrollTo({ top: 0 }); };

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
  }, { scope: root, dependencies: [airport, hState, hotels.length] });

  useGSAP(() => {
    if (result.s === 'idle' || result.s === 'loading') return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-result]', { opacity: 0, y: 16, duration: 0.45, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [result.s] });

  const f = result.f;
  const [chipText, chipTone] = f ? flightChip(f) : [];
  const toStays = (ap) => { if (ap) setAirport(ap); scrollToId('stays'); };

  return (
    <div ref={root}>
      <section id="top" className="tw:relative tw:bg-[#062253]">
        <img src="/images/hanoi-night.jpg" alt="Hà Nội về đêm nhìn từ trên cao" fetchPriority="high" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover tw:object-center tw:opacity-40" />
        <div className="tw:absolute tw:inset-0 tw:bg-gradient-to-r tw:from-[#031534] tw:via-[#042e70]/90 tw:to-[#031838]/30" />
        <div className="tw:relative tw:mx-auto tw:grid tw:md:min-h-[650px] tw:max-w-[1180px] tw:items-center tw:gap-8 tw:px-5 tw:py-8 tw:md:gap-12 tw:md:py-14 tw:lg:grid-cols-[.95fr_1.05fr]">
          <div className="tw:max-w-2xl tw:text-white">
            <span data-hero className="tw:inline-flex tw:items-center tw:gap-2 tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[.16em] tw:text-blue-200"><Sparkles size={15} /> Đồng hành khi hành trình đổi kế hoạch</span>
            <h1 data-hero className="tw:mt-3 tw:text-3xl tw:font-bold tw:leading-[1.05] tw:md:mt-5 tw:md:text-4xl tw:tracking-[-.055em] tw:sm:text-5xl tw:lg:text-6xl">Chuyến bay gián đoạn.<br /><em className="tw:not-italic tw:text-[#70a9ff]">Giấc nghỉ thì không.</em></h1>
            <p data-hero className="tw:mt-4 tw:max-w-xl tw:md:mt-6 tw:text-sm tw:leading-7 tw:text-blue-100 tw:sm:text-base">Kiểm tra chuyến bay, tìm phòng còn trống gần 22 sân bay thương mại trên cả nước và gửi yêu cầu đặt chỗ mà không cần tạo tài khoản.</p>
            <div data-hero className="tw:mt-7 tw:hidden tw:sm:flex tw:flex-wrap tw:gap-4 tw:text-xs tw:text-blue-100"><span className="tw:flex tw:items-center tw:gap-2"><ShieldCheck size={16} /> Không cần đăng nhập</span><span className="tw:flex tw:items-center tw:gap-2"><Clock3 size={16} /> Xử lý nhanh</span><span className="tw:flex tw:items-center tw:gap-2"><MoonStar size={16} /> Hỗ trợ xuyên đêm</span></div>
          </div>

          <form data-hero onSubmit={searchFlight} className="tw:w-full tw:rounded-[28px] tw:bg-white tw:p-5 tw:shadow-2xl tw:sm:p-7">
            <div className="tw:flex tw:items-start tw:justify-between tw:gap-4">
              <div><span className={LABEL}>Bắt đầu tại đây</span><h2 className="tw:mt-2 tw:text-xl tw:font-bold tw:tracking-tight tw:sm:text-2xl">Bạn cần hỗ trợ thế nào?</h2></div>
            </div>
            <div className="tw:mt-5 tw:grid tw:grid-cols-2 tw:rounded-xl tw:bg-slate-100 tw:p-1">
              <button type="button" onClick={() => setMode('flight')} className={`tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:px-2 tw:text-xs tw:font-bold ${mode === 'flight' ? 'tw:bg-white tw:text-blue-700 tw:shadow-sm' : 'tw:text-slate-500'}`}><PlaneLanding size={17} /> Chuyến bay</button>
              <button type="button" onClick={() => setMode('hotel')} className={`tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:px-2 tw:text-xs tw:font-bold ${mode === 'hotel' ? 'tw:bg-white tw:text-blue-700 tw:shadow-sm' : 'tw:text-slate-500'}`}><Hotel size={17} /> Tìm khách sạn</button>
            </div>
            {mode === 'flight' ? (
              <div className="tw:mt-5 tw:grid tw:gap-3 tw:sm:grid-cols-2">
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số hiệu chuyến bay<span className="ui-box"><Plane size={18} className="tw:text-slate-400" /><input className="ui-bare" value={flight} onChange={(e) => setFlight(e.target.value.toUpperCase())} required /></span></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Ngày bay<span className="ui-box"><CalendarDays size={18} className="tw:text-slate-400" /><input className="ui-bare" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></span></label>
                <button type="button" onClick={() => setScanning(true)} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-dashed tw:border-blue-300 tw:bg-blue-50/60 tw:px-4 tw:text-sm tw:font-bold tw:text-blue-700 tw:hover:bg-blue-50 tw:sm:col-span-2"><ScanBarcode size={18} /> Quét mã thẻ lên tàu</button>
              </div>
            ) : (
              <div className="tw:mt-5 tw:grid tw:gap-3 tw:sm:grid-cols-2">
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Sân bay<span className="ui-box"><MapPin size={18} className="tw:text-slate-400" /><Select className="ui-bare" value={airport} onChange={(e) => setAirport(e.target.value)}>{airportOptions}</Select></span></label>
                <div className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700"><span>Khách và phòng</span><GuestsPicker value={party} onChange={setParty} /></div>
              </div>
            )}
            <button type={mode === 'flight' ? 'submit' : 'button'} disabled={result.s === 'loading'} onClick={mode === 'hotel' ? () => toStays() : undefined} className="tw:mt-4 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-[#1262e8] tw:px-5 tw:text-sm tw:font-bold tw:text-white tw:hover:bg-[#0b45c6] tw:disabled:opacity-60"><Search size={18} /> {mode === 'flight' ? (result.s === 'loading' ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái') : 'Tìm nơi nghỉ'} <ArrowRight size={18} className="tw:ml-auto" /></button>
            {mode === 'hotel' && <button type="button" data-testid="hero-hourly" onClick={() => { setStaysIntent({ airport, party, chips: ['hourly'] }); dispatch({ type: 'go', screen: 'stays' }); window.scrollTo({ top: 0 }); }} className="tw:mt-2 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-amber-300 tw:bg-amber-50 tw:px-5 tw:text-sm tw:font-bold tw:text-amber-900"><Clock3 size={18} /> Thuê theo giờ (nghỉ ngắn, từ 1 giờ)</button>}
            <p className="tw:mt-3 tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-center tw:text-[11px] tw:leading-4 tw:text-slate-500"><ShieldCheck size={14} /> Chỉ thu thập thông tin cần thiết khi bạn gửi booking.</p>
          </form>
        </div>
      </section>

      {(result.s === 'found' || result.s === 'notfound' || result.s === 'error') && (
        <section id="flight-status" className="tw:mx-auto tw:max-w-[1180px] tw:px-5 tw:pt-14">
          {result.s === 'found' ? (
            <div data-result className="tw:overflow-hidden tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-lg">
              {f.notice && <p role="status" data-testid="flight-notice" className="tw:border-b tw:border-amber-200 tw:bg-amber-50 tw:px-5 tw:py-3 tw:text-xs tw:font-semibold tw:text-amber-800">{f.notice}</p>}
              <div className="tw:flex tw:flex-col tw:justify-between tw:gap-3 tw:border-b tw:border-slate-200 tw:p-5 tw:sm:flex-row tw:sm:items-center"><div className="tw:flex tw:items-center tw:gap-3"><strong className="tw:text-xl">{f.code}</strong><span className={`tw:rounded-full tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-bold ${chipTone}`}>{chipText}</span></div><span className="tw:text-[11px] tw:text-slate-500">Cập nhật lúc {f.updatedAt}</span></div>
              <div className="tw:grid tw:grid-cols-[1fr_1.4fr_1fr] tw:items-center tw:px-4 tw:py-7 tw:text-center tw:sm:px-16"><div><strong className="tw:text-3xl">{f.origin}</strong><p className="tw:text-xs tw:text-slate-500">{airportCity(f.origin)}{f.schedTime && ` · Giờ cũ ${f.schedTime}`}</p></div><div className="tw:flex tw:items-center tw:text-blue-600"><span className="tw:h-px tw:flex-1 tw:bg-blue-200" /><Plane className="tw:mx-2" /><span className="tw:h-px tw:flex-1 tw:bg-blue-200" /></div><div><strong className="tw:text-3xl">{f.dest ?? '—'}</strong><p className="tw:text-xs tw:font-bold tw:text-blue-600">{airportCity(f.dest)}{f.status !== 'cancelled' && ` · Giờ mới ${f.newTime ?? (f.status === 'ontime' ? f.schedTime : 'chưa rõ')}`}</p></div></div>
              <div className="tw:flex tw:flex-col tw:justify-between tw:gap-4 tw:bg-blue-50 tw:p-5 tw:sm:flex-row tw:sm:items-center"><div className="tw:flex tw:items-center tw:gap-3"><span className="tw:grid tw:size-11 tw:place-items-center tw:rounded-xl tw:bg-white tw:text-blue-600"><MoonStar /></span><div><small className="tw:text-slate-500">Tình trạng</small><p className="tw:font-bold">{f.status === 'ontime' ? 'Chuyến bay đúng giờ, chưa cần tìm nơi nghỉ' : 'Có thể tìm nơi nghỉ gần sân bay'}</p></div></div><button type="button" onClick={() => toStays(f.origin)} className="tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tìm khách sạn gần sân bay</button></div>
            </div>
          ) : result.s === 'notfound' ? (
            <div data-result className="tw:rounded-2xl tw:border tw:border-amber-200 tw:bg-amber-50 tw:p-6"><h2 className="tw:font-bold">Không tìm thấy chuyến bay</h2>{result.q && <ScannedInfo q={result.q} />}<p className="tw:mt-2 tw:text-sm tw:text-slate-600">Hãy kiểm tra lại số hiệu hoặc tiếp tục tìm nơi nghỉ. Việc tra cứu chuyến bay không bắt buộc.</p><button type="button" onClick={() => toStays()} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tiếp tục tìm khách sạn</button></div>
          ) : (
            <div data-result role="alert" className="tw:rounded-2xl tw:border tw:border-rose-200 tw:bg-rose-50 tw:p-6"><h2 className="tw:font-bold">Không tra cứu được chuyến bay</h2>{result.q && <ScannedInfo q={result.q} />}<p className="tw:mt-2 tw:text-sm tw:text-slate-600">Dịch vụ dữ liệu tạm thời lỗi. Bạn vẫn có thể tiếp tục tìm nơi nghỉ.</p><button type="button" onClick={() => toStays()} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tiếp tục tìm khách sạn</button></div>
          )}
        </section>
      )}

      <section id="how" className="tw:mx-auto tw:max-w-[1480px] tw:px-5 tw:py-12">
        <div className="tw:mx-auto tw:max-w-xl tw:text-center"><span className={LABEL}>Quy trình minh bạch</span><h2 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Đặt chỗ trong ba bước</h2><p className="tw:mt-3 tw:text-sm tw:leading-6 tw:text-slate-500">AIRREST tiếp nhận yêu cầu, khách sạn xác nhận và cập nhật trạng thái để bạn chủ động theo dõi.</p></div>
        <div className="tw:mt-8 tw:grid tw:gap-4 tw:md:grid-cols-3">
          {[
            ['01', 'Chọn nơi nghỉ', 'So sánh khoảng cách, giá, tiện ích và số phòng.'],
            ['02', 'Gửi yêu cầu', 'Nhập thông tin liên hệ cần thiết, không cần đăng ký tài khoản.'],
            ['03', 'Theo dõi xác nhận', 'Dùng mã booking và số điện thoại để xem khách sạn đã xác nhận hay từ chối.'],
          ].map(([number, title, copy]) => <article key={number} className="tw:rounded-2xl tw:border tw:border-slate-200 tw:p-6"><span className="tw:text-sm tw:font-extrabold tw:text-blue-600">{number}</span><h3 className="tw:mt-5 tw:font-bold">{title}</h3><p className="tw:mt-2 tw:text-xs tw:leading-6 tw:text-slate-500">{copy}</p></article>)}
        </div>
      </section>

      <section id="stays" className="tw:bg-slate-50 tw:py-12">
        <div className="tw:mx-auto tw:max-w-[1480px] tw:px-5">
          <div className="tw:flex tw:flex-col tw:justify-between tw:gap-5 tw:sm:flex-row tw:sm:items-end"><div><span className={LABEL}>Nơi nghỉ gần sân bay</span><h2 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Phòng đang mở nhận yêu cầu</h2></div></div>
          <div className="tw:mt-7 tw:flex tw:items-center tw:justify-between tw:gap-4 tw:border-b tw:border-slate-200">
            <div role="tablist" aria-label="Sân bay" className="tw:flex tw:items-center tw:gap-1 tw:overflow-x-auto">
              {tabAirports.map((a) => <button type="button" role="tab" aria-selected={airport === a.iata} key={a.iata} onClick={() => setAirport(a.iata)} className={`tw:shrink-0 tw:border-b-2 tw:px-4 tw:py-3 tw:text-sm tw:font-bold ${airport === a.iata ? 'tw:border-blue-600 tw:text-blue-600' : 'tw:border-transparent tw:text-slate-600'}`}>{a.name} ({a.iata})</button>)}
              <Select aria-label="Sân bay khác" value={tabAirports.some((a) => a.iata === airport) ? '' : airport} onChange={(e) => e.target.value && setAirport(e.target.value)} className={`tw:ml-2 tw:h-10 tw:shrink-0 tw:rounded-lg tw:border tw:px-3 tw:text-xs tw:font-bold ${tabAirports.some((a) => a.iata === airport) ? CHIP_OFF : CHIP_ON}`}><option value="">Sân bay khác</option>{airports.filter((a) => !POPULAR.includes(a.iata)).map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>)}</Select>
            </div>
            <button type="button" onClick={() => { setStaysIntent({ airport }); dispatch({ type: 'go', screen: 'stays' }); window.scrollTo({ top: 0 }); }} className="tw:hidden tw:shrink-0 tw:items-center tw:gap-1 tw:py-3 tw:text-sm tw:font-bold tw:text-blue-600 tw:sm:flex">Xem thêm các chỗ nghỉ ({airport}) <ChevronRight size={16} /></button>
          </div>
          {hState === 'loading' ? (
            <p className="tw:mt-6 tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-10 tw:text-center tw:text-sm tw:text-slate-500" aria-live="polite">Đang tải nơi nghỉ…</p>
          ) : hState === 'error' ? (
            <div role="alert" className="tw:mt-6 tw:rounded-2xl tw:border tw:border-rose-200 tw:bg-rose-50 tw:p-8 tw:text-center"><h3 className="tw:font-bold">Không tải được danh sách nơi nghỉ</h3><p className="tw:mt-2 tw:text-xs tw:text-slate-600">{hError}</p><button type="button" onClick={() => setTick((t) => t + 1)} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Thử lại</button></div>
          ) : shown.length ? (
            <div className="tw:mt-5 tw:grid tw:gap-5 tw:md:grid-cols-2 tw:xl:grid-cols-4">
              {shown.map((hotel) => hotelCard(hotel, openBooking))}
            </div>
          ) : (
            <div className="tw:mt-6 tw:rounded-2xl tw:border tw:border-dashed tw:border-slate-300 tw:bg-white tw:p-10 tw:text-center"><BedDouble className="tw:mx-auto tw:text-slate-400" /><h3 className="tw:mt-4 tw:font-bold">Chưa có phòng phù hợp</h3><p className="tw:mt-2 tw:text-xs tw:text-slate-500">Hãy đổi sân bay.</p></div>
          )}
          <button type="button" onClick={() => { setStaysIntent({ airport }); dispatch({ type: 'go', screen: 'stays' }); window.scrollTo({ top: 0 }); }} className="tw:mt-5 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-1 tw:rounded-xl tw:border tw:border-blue-600 tw:text-sm tw:font-bold tw:text-blue-600 tw:sm:hidden">Xem thêm các chỗ nghỉ ({airport}) <ChevronRight size={16} /></button>
        </div>
      </section>

      {tState !== 'ok' || topShown.length > 0 ? (
        <section id="top-rated" className="tw:bg-white tw:py-12">
          <div className="tw:mx-auto tw:max-w-[1480px] tw:px-5">
            <div className="tw:flex tw:items-end tw:justify-between tw:gap-5"><div><span className={LABEL}>Gợi ý nổi bật</span><h2 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Được khách đánh giá cao</h2></div>
              <button type="button" onClick={() => toTopStays()} className="tw:hidden tw:shrink-0 tw:items-center tw:gap-1 tw:py-3 tw:text-sm tw:font-bold tw:text-blue-600 tw:sm:flex">Xem tất cả <ChevronRight size={16} /></button>
            </div>
            {tState === 'loading' ? (
              <p className="tw:mt-6 tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-10 tw:text-center tw:text-sm tw:text-slate-500" aria-live="polite">Đang tải nơi nghỉ…</p>
            ) : tState === 'error' ? (
              <div role="alert" className="tw:mt-6 tw:rounded-2xl tw:border tw:border-rose-200 tw:bg-rose-50 tw:p-8 tw:text-center"><h3 className="tw:font-bold">Không tải được danh sách nơi nghỉ</h3><p className="tw:mt-2 tw:text-xs tw:text-slate-600">{tError}</p><button type="button" onClick={() => setTick((t) => t + 1)} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Thử lại</button></div>
            ) : (
              <div className="tw:mt-5 tw:grid tw:gap-5 tw:md:grid-cols-2 tw:xl:grid-cols-4">{topShown.map((hotel) => hotelCard(hotel, (h) => toTopStays(h.id)))}</div>
            )}
            <button type="button" onClick={() => toTopStays()} className="tw:mt-5 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-1 tw:rounded-xl tw:border tw:border-blue-600 tw:text-sm tw:font-bold tw:text-blue-600 tw:sm:hidden">Xem tất cả <ChevronRight size={16} /></button>
          </div>
        </section>
      ) : null}

      <section className="tw:bg-[#1262e8] tw:text-white">
        <div className="tw:mx-auto tw:flex tw:max-w-[1180px] tw:flex-col tw:justify-between tw:gap-6 tw:px-5 tw:py-9 tw:sm:flex-row tw:sm:items-center"><div className="tw:flex tw:items-start tw:gap-4"><span className="tw:grid tw:size-12 tw:shrink-0 tw:place-items-center tw:rounded-xl tw:bg-white/15"><CircleHelp /></span><div><h2 className="tw:text-lg tw:font-bold">Bạn cần hỗ trợ thêm?</h2><p className="tw:mt-1 tw:text-xs tw:text-blue-100">Gửi ticket hoặc tra cứu booking bằng thông tin xác minh.</p></div></div><div className="tw:flex tw:gap-3"><button type="button" onClick={() => dispatch({ type: 'go', screen: 'support' })} className="tw:rounded-xl tw:border tw:border-white/50 tw:px-4 tw:py-3 tw:text-xs tw:font-bold">Gửi yêu cầu</button><button type="button" onClick={() => dispatch({ type: 'go', screen: 'track' })} className="tw:rounded-xl tw:bg-white tw:px-4 tw:py-3 tw:text-xs tw:font-bold tw:text-blue-700">Theo dõi booking</button></div></div>
      </section>

      {scanning && <ScanTicket onResult={onScanned} onClose={() => setScanning(false)} />}
    </div>
  );
}
