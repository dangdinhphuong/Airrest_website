import React, { useEffect, useRef, useState } from 'react';
import { BedDouble, ChevronDown, MapPin, ShoppingBag, Star, X } from 'lucide-react';
import { useApp } from '../../state/store';
import { describeApiError, getHotel, listAirports, listHotels } from '../../data/user';
import { isoDate, money } from '../../lib/time';
import { peekStaysIntent, clearStaysIntent, partyFromPrefs } from './data';
import { cartTotal, emptyCart, hasNight, loadCart, reconcile, saveCart, setQty, switchesPlan, totalRooms, changesHotel } from './cart';
import BookingModal from './BookingModal';
import RoomRow from './RoomRow';
import GuestsPicker from './GuestsPicker';
import PriceRange from '../../components/PriceRange';
import Select from '../../components/Select';

const DISTANCES = [3, 5, 7];
const SORTS = { distance: 'Gần sân bay nhất', price: 'Giá thấp nhất', rating: 'Đánh giá cao nhất' };
// Bộ lọc phổ biến -> tham số tìm kiếm của backend (backend lọc, sắp xếp; FE chỉ gửi và hiển thị).
const CHIPS = [
  { id: 'shuttle', label: 'Có xe đưa đón', param: { shuttle: true } },
  { id: 'freeCancel', label: 'Hủy miễn phí', param: { freeCancel: true } },
  { id: 'hourly', label: 'Thuê theo giờ', param: { hourly: true } },
  { id: 'family', label: 'Phù hợp gia đình', param: { family: true } },
  { id: 'open24', label: 'Lễ tân 24/24', param: { reception24: true } },
  { id: 'rating', label: 'Đánh giá từ 8.0', param: { minRating: 8 } },
];
const BAR_LABEL = 'tw:grid tw:gap-1';
const BAR_TEXT = 'tw:text-[11px] tw:font-semibold tw:text-blue-100';
const DATE_INPUT = 'tw:text-[#10203a]';
const nextDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
// Cửa sổ lưu trú cố định theo ngày (nhận 14:00, trả 12:00 giờ VN); không dùng Date.now() để khóa tìm kiếm không đổi mỗi lần render.
const windowQuery = ({ checkIn, checkOut }) => ({ from: new Date(`${checkIn}T14:00:00+07:00`).toISOString(), to: new Date(`${checkOut}T12:00:00+07:00`).toISOString() });

// Danh sách nơi nghỉ theo sân bay: bấm cả thẻ để sổ danh sách loại phòng, bấm + thêm phòng vào giỏ, thanh dưới chốt đơn.
export default function Stays() {
  const { state: app, dispatch } = useApp();
  const [intent] = useState(peekStaysIntent);
  useEffect(() => { clearStaysIntent(); }, []);
  const [airport, setAirport] = useState(intent?.airport || app.browseAirport || 'HAN');
  const [airports, setAirports] = useState([]);
  const [party, setParty] = useState(() => { const p = intent?.party ?? partyFromPrefs(app.user?.preferences); return { adults: p.adults, children: p.children }; });
  const [dates, setDates] = useState(intent?.dates ?? { checkIn: isoDate(0), checkOut: isoDate(1) });
  const [hotels, setHotels] = useState([]);
  const [state, setState] = useState('loading'); // loading | ok | error
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [chips, setChips] = useState([]);
  const [maxKm, setMaxKm] = useState('');
  const [sort, setSort] = useState(intent?.sort && SORTS[intent.sort] ? intent.sort : 'distance');
  const [price, setPrice] = useState(null); // null = cả khoảng; { min, max } (VND/đêm)
  const [bounds, setBounds] = useState(null); // biên thanh kéo giá của sân bay hiện tại
  const [openId, setOpenId] = useState(intent?.hotelId); // undefined = chưa quyết định (mở khách sạn đầu), null = đã thu hết
  const [cart, setCart] = useState(loadCart);
  const [cartHotel, setCartHotel] = useState(null); // khách sạn của giỏ khi không nằm trong danh sách đang xem
  const [booking, setBooking] = useState(null); // khách sạn đang đặt (chụp lúc bấm Đặt ngay để modal không mất khi giỏ được xóa sau khi tạo đơn)
  const [notice, setNotice] = useState('');
  const scrolled = useRef(false);

  useEffect(() => { listAirports().then(setAirports).catch(() => setAirports([])); }, []);
  useEffect(() => { saveCart(cart); }, [cart]);
  const people = party.adults + party.children;
  const nights = Math.max(1, Math.round((new Date(dates.checkOut) - new Date(dates.checkIn)) / 86400000));
  const win = windowQuery(dates);
  const search = { sort, ...win, maxKm, minPrice: price?.min, maxPrice: price?.max, ...Object.assign({}, ...chips.map((id) => CHIPS.find((c) => c.id === id).param)) };
  const searchKey = JSON.stringify(search);
  useEffect(() => {
    const ctl = new AbortController();
    setState('loading');
    listHotels(airport, ctl.signal, JSON.parse(searchKey)).then((h) => { setHotels(h); if (h.priceRange) setBounds(h.priceRange); setState('ok'); }).catch((e) => { if (!ctl.signal.aborted) { setError(describeApiError(e)); setState('error'); } });
    return () => ctl.abort();
  }, [airport, tick, searchKey]);

  // Giỏ đã lưu: đối chiếu với khách sạn hiện tại (tồn phòng theo ngày đang chọn); khách sạn không còn thì bỏ giỏ.
  const cartHotelId = cart.hotelId;
  useEffect(() => {
    if (!cartHotelId) { setCartHotel(null); return undefined; }
    const ctl = new AbortController();
    getHotel(cartHotelId, ctl.signal, win).then((h) => {
      setCartHotel(h);
      setCart((c) => {
        const r = reconcile(c, h);
        if (r.dropped.length) setNotice(`${r.dropped.join(', ')} không còn phòng cho ngày bạn chọn nên đã được bỏ khỏi giỏ.`);
        return r.cart;
      });
    }).catch((e) => { if (!ctl.signal.aborted && e.status === 404) { setCart(emptyCart()); setNotice('Khách sạn trong giỏ không còn được bán nên giỏ đã được xóa.'); } });
    return () => ctl.abort();
  }, [cartHotelId, tick, searchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = hotels.filter((h) => h.rooms.length);
  // Mở sẵn khách sạn đầu (hoặc khách sạn từ trang chủ); khách sạn từ trang chủ nằm ngoài danh sách thì nạp thêm lên đầu.
  useEffect(() => {
    if (state !== 'ok' || openId !== undefined) return;
    setOpenId(shown[0]?.id ?? null);
  }, [state, openId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state !== 'ok' || !intent?.hotelId || shown.some((h) => h.id === intent.hotelId)) return undefined;
    const ctl = new AbortController();
    getHotel(intent.hotelId, ctl.signal, win).then((h) => h && setHotels((l) => (l.some((x) => x.id === h.id) ? l : Object.assign([h, ...l], { total: l.total, priceRange: l.priceRange })))).catch(() => {});
    return () => ctl.abort();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (scrolled.current || !intent?.hotelId || !shown.some((h) => h.id === intent.hotelId)) return;
    scrolled.current = true;
    window.setTimeout(() => document.getElementById(`hotel-${intent.hotelId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [hotels]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleChip = (id) => setChips((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const filtering = chips.length > 0 || !!maxKm || !!price;
  const options = airports.length ? airports.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>) : <option value="HAN">Nội Bài (HAN)</option>;

  const changeQty = (h, room, q, opt) => {
    if (changesHotel(cart, h) && q > 0) setNotice(`Mỗi đơn chỉ đặt một khách sạn: giỏ của ${cart.hotelName} đã được thay bằng giỏ của ${h.name}.`);
    else if (q > 0 && opt?.plan && cart.hotelId === h.id && switchesPlan(cart, opt.plan)) setNotice('Một đơn chỉ dùng một mức giá: các phòng theo đêm đã chọn ở mức khác đã được bỏ khỏi giỏ.');
    else setNotice('');
    setCart((c) => setQty(c, h, room, q, Date.now(), opt));
  };
  const cartRooms = totalRooms(cart);
  useEffect(() => { // báo cho khung trang đẩy nút chat lên khỏi thanh chốt đơn
    const el = document.querySelector('.airrest-user');
    if (cartRooms > 0) el?.setAttribute('data-cart-bar', ''); else el?.removeAttribute('data-cart-bar');
    return () => el?.removeAttribute('data-cart-bar');
  }, [cartRooms > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const bookingHotel = shown.find((h) => h.id === cart.hotelId) ?? cartHotel;

  return (
    <div className="tw:min-h-screen tw:bg-white">
      <div className="tw:bg-[#062253] tw:py-4">
        <div className="tw:mx-auto tw:grid tw:max-w-[1180px] tw:gap-3 tw:px-5 tw:sm:grid-cols-2 tw:lg:grid-cols-4">
          <label className={BAR_LABEL}><span className={BAR_TEXT}>Sân bay</span><Select aria-label="Sân bay" value={airport} onChange={(e) => { setAirport(e.target.value); setPrice(null); setBounds(null); setOpenId(undefined); }}>{options}</Select></label>
          <div className={BAR_LABEL}><span className={BAR_TEXT}>Số khách</span><GuestsPicker hideRooms label="Số khách" value={{ ...party, rooms: 1 }} onChange={(v) => setParty({ adults: v.adults, children: v.children })} /></div>
          <label className={BAR_LABEL}><span className={BAR_TEXT}>Nhận phòng</span><input className={DATE_INPUT} type="date" aria-label="Ngày nhận phòng" min={isoDate(0)} value={dates.checkIn} onChange={(e) => { const v = e.target.value; if (v) setDates((d) => ({ checkIn: v, checkOut: d.checkOut <= v ? nextDay(v) : d.checkOut })); }} /></label>
          <label className={BAR_LABEL}><span className={BAR_TEXT}>Trả phòng</span><input className={DATE_INPUT} type="date" aria-label="Ngày trả phòng" min={nextDay(dates.checkIn)} value={dates.checkOut} onChange={(e) => e.target.value && setDates((d) => ({ ...d, checkOut: e.target.value }))} /></label>
        </div>
      </div>
      <div className="tw:mx-auto tw:grid tw:max-w-[1180px] tw:gap-6 tw:px-5 tw:py-6 tw:lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside aria-label="Bộ lọc" className="tw:self-start">
          {bounds && bounds.max > bounds.min && <div className="tw:mb-6"><h2 className="tw:mb-4 tw:text-sm tw:font-bold">Giá mỗi đêm</h2><PriceRange bounds={bounds} value={price} onChange={setPrice} /></div>}
          <h2 className="tw:text-sm tw:font-bold">Bộ lọc phổ biến</h2>
          <div className="tw:mt-3 tw:grid tw:gap-2.5">
            {CHIPS.map((c) => <label key={c.id} className="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-sm tw:text-slate-700"><input type="checkbox" checked={chips.includes(c.id)} onChange={() => toggleChip(c.id)} className="tw:size-4" />{c.label}</label>)}
          </div>
          <Select aria-label="Khoảng cách tới sân bay" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} className="tw:mt-4 tw:w-full"><option value="">Mọi khoảng cách</option>{DISTANCES.map((km) => <option key={km} value={km}>Trong {km} km</option>)}</Select>
          {filtering && <button type="button" onClick={() => { setChips([]); setMaxKm(''); setPrice(null); }} className="tw:mt-3 tw:text-xs tw:font-bold tw:text-blue-600 tw:underline">Xóa bộ lọc</button>}
        </aside>

        <section className="tw:min-w-0">
          {notice && <p role="status" data-testid="cart-notice" className="tw:mb-4 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-amber-900">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo" className="tw:shrink-0"><X size={14} /></button></p>}
          <div className="tw:flex tw:flex-col tw:justify-between tw:gap-3 tw:sm:flex-row tw:sm:items-center">
            <h1 className="tw:text-xl tw:font-bold" aria-live="polite">{hotels.total ?? shown.length} nơi nghỉ phù hợp</h1>
            <label className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:font-bold tw:text-slate-600">Sắp xếp<Select aria-label="Sắp xếp danh sách" value={sort} onChange={(e) => setSort(e.target.value)} className="tw:h-10 tw:rounded-lg tw:border tw:border-slate-300 tw:bg-white tw:px-3 tw:text-xs tw:font-bold">{Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</Select></label>
          </div>
          {state === 'loading' ? (
            <p className="tw:mt-5 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-10 tw:text-center tw:text-sm tw:text-slate-500" aria-live="polite">Đang tải nơi nghỉ…</p>
          ) : state === 'error' ? (
            <div role="alert" className="tw:mt-5 tw:rounded-2xl tw:border tw:border-rose-200 tw:bg-rose-50 tw:p-8 tw:text-center"><h3 className="tw:font-bold">Không tải được danh sách nơi nghỉ</h3><p className="tw:mt-2 tw:text-xs tw:text-slate-600">{error}</p><button type="button" onClick={() => setTick((t) => t + 1)} className="tw:mt-4 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Thử lại</button></div>
          ) : shown.length ? (
            <div className="tw:mt-4 tw:grid tw:gap-4">
              {shown.map((h) => {
                const open = openId === h.id;
                const inCart = cart.hotelId === h.id ? totalRooms(cart) : 0;
                return (
                  <article key={h.id} id={`hotel-${h.id}`} data-testid="hotel-card" className={`tw:scroll-mt-24 tw:overflow-hidden tw:rounded-xl tw:border tw:bg-white tw:shadow-sm ${open ? 'tw:border-blue-300' : 'tw:border-slate-200'}`}>
                    <h2>
                      <button type="button" aria-expanded={open} aria-controls={`rooms-${h.id}`} onClick={() => setOpenId(open ? null : h.id)} className="tw:flex tw:w-full tw:flex-col tw:text-left tw:hover:bg-slate-50 tw:sm:flex-row">
                        <span className="tw:relative tw:block tw:h-40 tw:shrink-0 tw:sm:h-auto tw:sm:w-56"><img src={h.image} alt={`Không gian tại ${h.name}`} loading="lazy" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></span>
                        <span className="tw:flex tw:min-w-0 tw:flex-1 tw:items-start tw:justify-between tw:gap-3 tw:p-4">
                          <span className="tw:block tw:min-w-0">
                            <span className="tw:block tw:text-lg tw:font-bold">{h.name}</span>
                            <span className="tw:mt-2 tw:flex tw:items-center tw:gap-1 tw:text-xs tw:font-normal tw:text-slate-500"><MapPin size={13} /> {h.distanceKm} km · {h.travelMinutes} phút đi xe</span>
                            <span className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-1.5">{h.amenities.slice(0, 3).map((item) => <span key={item} className="tw:rounded-md tw:bg-slate-100 tw:px-2 tw:py-1.5 tw:text-[11px] tw:font-normal tw:text-slate-600">{item}</span>)}</span>
                            {inCart > 0 && <span className="tw:mt-3 tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:bg-blue-600 tw:px-2.5 tw:py-1 tw:text-[11px] tw:font-bold tw:text-white"><ShoppingBag size={12} /> {inCart} phòng trong giỏ</span>}
                          </span>
                          <span className="tw:flex tw:shrink-0 tw:flex-col tw:items-end tw:gap-2">
                            {h.rating ? <span className="tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:bg-emerald-50 tw:px-2 tw:py-1.5 tw:text-xs tw:font-bold tw:text-emerald-700"><Star size={12} fill="currentColor" /> {h.rating}</span> : null}
                            <span className="tw:text-right"><span className="tw:block tw:text-[11px] tw:font-normal tw:text-slate-500">Từ / đêm</span><span className="tw:block tw:text-xl tw:font-extrabold">{money(h.room.price)}</span></span>
                            <ChevronDown size={20} aria-hidden="true" className={`tw:text-slate-500 tw:transition-transform ${open ? 'tw:rotate-180' : ''}`} />
                          </span>
                        </span>
                      </button>
                    </h2>
                    {open && (
                      <div id={`rooms-${h.id}`} role="region" aria-label={`Loại phòng tại ${h.name}`} className="tw:border-t tw:border-slate-200 tw:bg-slate-50 tw:p-3 tw:sm:p-4">
                        <ul className="tw:grid tw:gap-2">
                          {h.rooms.map((r) => <RoomRow key={r.id} hotel={h} room={r} people={people} cart={cart} date={dates.checkIn} onQty={(q, opt) => changeQty(h, r, q, opt)} />)}
                        </ul>
                        <button type="button" onClick={() => { dispatch({ type: 'openProperty', id: h.id }); window.scrollTo({ top: 0 }); }} className="tw:mt-3 tw:min-h-11 tw:text-xs tw:font-bold tw:text-blue-600">Xem chi tiết khách sạn</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="tw:mt-5 tw:rounded-2xl tw:border tw:border-dashed tw:border-slate-300 tw:p-10 tw:text-center"><BedDouble className="tw:mx-auto tw:text-slate-400" /><h3 className="tw:mt-4 tw:font-bold">Chưa có phòng phù hợp</h3><p className="tw:mt-2 tw:text-xs tw:text-slate-500">Hãy đổi sân bay hoặc bỏ bớt bộ lọc.</p></div>
          )}
        </section>
      </div>

      {cartRooms > 0 && (
        <div role="region" aria-label="Giỏ phòng" data-testid="cart-bar" className="tw:fixed tw:inset-x-0 tw:bottom-16 tw:z-50 tw:border-t tw:border-slate-200 tw:bg-white tw:shadow-[0_-8px_24px_rgba(15,23,42,.12)] tw:md:bottom-0">
          <div className="tw:mx-auto tw:flex tw:max-w-[1180px] tw:items-center tw:justify-between tw:gap-3 tw:px-5 tw:py-3">
            <p aria-live="polite" className="tw:min-w-0 tw:text-sm"><strong data-testid="cart-summary">{cartRooms} phòng · {money(cartTotal(cart, nights))}</strong><span className="tw:block tw:truncate tw:text-[11px] tw:text-slate-500">{cart.hotelName} · tạm tính {hasNight(cart) ? `${nights} đêm${cart.lines.some((l) => l.kind === 'HOURLY') ? ' + phòng theo giờ' : ''}` : 'đặt theo giờ'}</span></p>
            <div className="tw:flex tw:shrink-0 tw:items-center tw:gap-2">
              <button type="button" onClick={() => { setCart(emptyCart()); setNotice(''); }} aria-label="Xóa giỏ phòng" className="tw:min-h-11 tw:px-2 tw:text-xs tw:font-bold tw:text-slate-500 tw:underline">Xóa</button>
              <button type="button" onClick={() => setBooking(bookingHotel)} disabled={!bookingHotel} data-testid="cart-book" className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-sm tw:font-bold tw:text-white tw:disabled:opacity-60">Đặt ngay</button>
            </div>
          </div>
        </div>
      )}
      {booking && <BookingModal hotel={booking} cart={cart} onCart={setCart} dates={dates} people={people} onClose={() => setBooking(null)} onRefresh={() => setTick((t) => t + 1)} onNotice={setNotice} />}
    </div>
  );
}
