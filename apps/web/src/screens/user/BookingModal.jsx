import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Minus, Plus, X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { newIdempotencyKey } from '@airrest/api-client';
import { useApp } from '../../state/store';
import { AT_HOTEL_ONLY, CHECKIN_HHMM, CHECKOUT_HHMM, PAY_LABEL, bookingFieldError, buildShuttle, createBooking, describeApiError, getHotel, getPaymentLink, listPaymentMethods, quoteBooking, saveLastBooking, weekdayLabel } from '../../data/user';
import { isoDate, money } from '../../lib/time';
import { copyText, setTrackPrefill, statusCopy } from './data';
import { NR, cartPlan, cartTotal, defaultGuests, planOf, dropSoldOut, hasNight, hourlySpan, isHourly, lineTotal, maxQty, perNight, qtyOf, setQty, suggestExtraRoom, toApiRooms, totalCapacity, totalRooms, roomsText, loadGuest, saveGuest, loadPay, savePay } from './cart';
import { vnDay } from './HourlyPicker';
import GuestsPicker from './GuestsPicker';
import ShuttleOptions, { LEG_LABEL, emptyShuttle } from './ShuttleOptions';

gsap.registerPlugin(useGSAP);

const LABEL = 'tw:text-[11px] tw:font-extrabold tw:uppercase tw:tracking-[.16em] tw:text-blue-600';
const STEP_BTN = 'tw:grid tw:size-11 tw:place-items-center tw:rounded-full tw:border tw:border-slate-300 tw:bg-white tw:text-slate-700 tw:disabled:opacity-35';
const dmy = (iso) => iso.split('-').reverse().join('/');
const nextDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const vnLocal = (ms) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16);
const peopleText = (g, c) => `${g} người${c ? ` (trong đó ${c} trẻ em)` : ''}`;
const PAY_HINT = { AT_HOTEL: 'Không thu tiền trước.', VNPAY: 'Giữ phòng trong thời gian ngắn, thanh toán qua cổng VNPay.', MOMO: 'Giữ phòng trong thời gian ngắn, thanh toán qua ví MoMo.', SEPAY: 'Giữ phòng trong thời gian ngắn, thanh toán qua SePay (chuyển khoản QR ngân hàng hoặc thẻ).' };
const GATE_OFF = 'Cổng thanh toán này vừa tạm ngưng. Danh sách hình thức thanh toán đã được cập nhật, vui lòng chọn lại.';
const focusField = (f, shuttle) => window.setTimeout(() => {
  const id = f === 'guests' ? 'guests-block' : f === 'airport' ? (document.getElementById('shuttle-airport') ? 'shuttle-airport' : 'shuttle-block') : f === 'pickup' ? (shuttle?.TO_HOTEL?.on ? 'pickup-TO_HOTEL' : 'pickup-TO_AIRPORT') : 'shuttle-block';
  const el = document.getElementById(id); el?.scrollIntoView({ block: 'center' }); el?.focus();
}, 60);
const sumRow = ([label, value, total]) => <div key={label} className="tw:flex tw:justify-between tw:gap-5 tw:py-3"><span className={total ? 'tw:font-bold tw:text-slate-800' : 'tw:text-slate-500'}>{label}</span><strong className={total ? 'tw:text-right tw:text-base tw:text-blue-700' : 'tw:text-right'}>{value}</strong></div>;

// Đồng hồ đếm ngược tới hạn giữ phòng (expiresAt do backend trả cho đơn chờ duyệt / chờ thanh toán).
function HoldTimer({ until, online }) {
  const [left, setLeft] = useState(() => Date.parse(until) - Date.now());
  useEffect(() => { const t = window.setInterval(() => setLeft(Date.parse(until) - Date.now()), 1000); return () => window.clearInterval(t); }, [until]);
  if (!until || Number.isNaN(left) || left <= 0) return null;
  const mm = String(Math.floor(left / 60000)).padStart(2, '0'); const ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  return <p role="timer" data-testid="hold-timer" className="tw:mt-3 tw:text-xs tw:font-semibold tw:text-rose-700">{online ? 'Hoàn tất thanh toán trong' : 'Phòng được giữ cho bạn trong'} <span className="tw:tabular-nums">{mm}:{ss}</span></p>;
}

// Bộ tăng giảm số lượng (− n +) dùng cho dòng loại phòng và giỏ. `label` = tên loại phòng, dùng cho nhãn đọc màn hình.
export function Stepper({ value, max, onChange, label }) {
  return (
    <div role="group" aria-label={`Số lượng ${label}`} className="tw:inline-flex tw:items-center tw:gap-2">
      <button type="button" className={STEP_BTN} disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label={`Bớt một phòng ${label}`}><Minus size={16} /></button>
      <output aria-label={`Số phòng ${label}`} className="tw:w-6 tw:text-center tw:text-base tw:font-bold">{value}</output>
      <button type="button" className={STEP_BTN} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Thêm một phòng ${label}`}><Plus size={16} /></button>
    </div>
  );
}

// Modal đặt phòng cho CẢ GIỎ (nhiều loại phòng một đơn): bước 1 thông tin + thanh toán + báo giá + chốt đơn, bước 3 kết quả (không còn bước xem lại).
// hotel: khách sạn đầy đủ (rooms[]); cart: giỏ của khách sạn đó; onCart: đổi giỏ; onRefresh: tải lại tồn phòng; onNotice: thông báo nhẹ ở trang.
export default function BookingModal({ hotel, cart, onCart, dates: initDates, people, onClose, onRefresh, onNotice }) {
  const { state, dispatch } = useApp();
  const today = isoDate(0);
  const tomorrow = isoDate(1);
  const root = useRef(null);
  const [step, setStep] = useState(1);
  const [times, setTimes] = useState({ checkInTime: CHECKIN_HHMM, checkOutTime: CHECKOUT_HHMM }); // giờ nhận/trả phòng khách chọn (giờ VN)
  const [dates, setDates] = useState(initDates ?? { checkIn: today, checkOut: tomorrow });
  const [guestsInit] = useState(() => defaultGuests(cart, people));
  const [bk, setBk] = useState({ adults: guestsInit, children: 0 });
  const [saved] = useState(loadGuest);
  const [shuttle, setShuttle] = useState(() => emptyShuttle(hotel.airports.includes(hotel.airportCode) ? hotel.airportCode : hotel.airports[0]));
  const [fieldErr, setFieldErr] = useState(null);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [bookingData, setBookingData] = useState(null);
  const [bookingResult, setBookingResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [methods, setMethods] = useState({ s: 'loading', list: AT_HOTEL_ONLY });
  const [priceQuote, setPriceQuote] = useState({ s: 'idle' });
  const [copied, setCopied] = useState(false);
  const [payMethod, setPayMethod] = useState(() => state.user?.preferences?.paymentMethod ?? loadPay() ?? 'AT_HOTEL');

  const resetPickups = () => setShuttle((v) => ({ ...v, TO_HOTEL: { ...v.TO_HOTEL, at: '' }, TO_AIRPORT: { ...v.TO_AIRPORT, at: '' } })); // đổi ngày thì giờ đón quay về bám giờ nhận/trả phòng
  const guests = bk.adults + bk.children;
  const capacity = totalCapacity(cart);
  const rooms = totalRooms(cart);
  const over = guests > capacity;
  const extra = over ? suggestExtraRoom(hotel, cart) : null;
  const night = hasNight(cart);
  const span = hourlySpan(cart);
  // Đơn toàn giờ: không có ngày nhận/trả, ngày lấy theo giờ vào sớm nhất (giờ VN).
  const eff = night || !span ? dates : { checkIn: vnDay(new Date(span.from).toISOString()), checkOut: nextDay(vnDay(new Date(span.from).toISOString())) };
  const nights = night ? Math.max(1, Math.round((new Date(dates.checkOut) - new Date(dates.checkIn)) / 86400000)) : 1;
  // Xe bám giờ đến / giờ ra của đơn khi có phòng theo giờ (đơn trộn: tính cả giờ nhận 14:00 và trả 12:00 của dòng đêm).
  const hourlyTimes = span ? { arrive: vnLocal(night ? Math.min(span.from, Date.parse(`${dates.checkIn}T${times.checkInTime}:00+07:00`)) : span.from), leave: vnLocal(night ? Math.max(span.to, Date.parse(`${dates.checkOut}T${times.checkOutTime}:00+07:00`)) : span.to) } : undefined;

  const loadMethods = () => listPaymentMethods().then((list) => { setMethods({ s: 'ok', list }); return list; }).catch(() => { setMethods({ s: 'error', list: AT_HOTEL_ONLY }); return AT_HOTEL_ONLY; });
  useEffect(() => { loadMethods(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  useEffect(() => { if (cart.lines.length === 0 && step < 3) onClose(); }, [cart.lines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const quoteShuttle = hotel.shuttleAvailable ? buildShuttle(shuttle, eff.checkIn, eff.checkOut, undefined, hourlyTimes, times) : undefined;
  const quoteKey = JSON.stringify([toApiRooms(cart), eff, quoteShuttle, times]);
  useEffect(() => { // phí dịch vụ + tổng tiền từ backend (cùng cách tính với lúc tạo đơn), tính lại khi giỏ/ngày/xe đổi
    if (step !== 1 || (night && eff.checkOut <= eff.checkIn)) { setPriceQuote({ s: 'idle' }); return undefined; }
    const ctl = new AbortController();
    setPriceQuote({ s: 'loading' });
    quoteBooking({ hotelId: hotel.id, rooms: toApiRooms(cart), checkIn: eff.checkIn, checkOut: eff.checkOut, shuttle: quoteShuttle, times }, ctl.signal)
      .then((q) => setPriceQuote({ s: 'ok', q })).catch(() => { if (!ctl.signal.aborted) setPriceQuote({ s: 'error' }); });
    return () => ctl.abort();
  }, [step, quoteKey, hotel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => { gsap.from('[data-modal]', { opacity: 0, y: 28, scale: 0.98, duration: 0.3, ease: 'power2.out', clearProps: 'opacity,transform' }); });
    return () => mm.revert();
  }, { scope: root, dependencies: [step] });

  const line = (id) => cart.lines.find((l) => l.roomTypeId === id);
  const changeQty = (l, q) => { const r = hotel.rooms.find((x) => x.id === l.roomTypeId); if (r) { onCart(setQty(cart, hotel, r, q, Date.now(), isHourly(l) ? { kind: 'HOURLY', startsAt: l.startsAt, hours: l.hours } : undefined)); setFieldErr(null); } };
  const addExtra = () => { onCart(setQty(cart, hotel, extra, qtyOf(cart, extra.id) + 1)); setFieldErr(null); };

  const captureBooking = (e) => {
    e.preventDefault();
    if (pending) return; // chặn bấm đúp: mỗi lần gửi sinh một idempotencyKey mới
    const d = { ...Object.fromEntries(new FormData(e.currentTarget).entries()), ...(night ? {} : { checkIn: eff.checkIn, checkOut: eff.checkOut }) };
    if (night) {
      if (d.checkIn < today) { setFormError('Ngày nhận phòng không được ở quá khứ.'); return; }
      if (d.checkOut <= d.checkIn) { setFormError('Ngày trả phòng phải sau ngày nhận phòng.'); return; }
      // đơn trộn: giờ ở theo giờ phải nằm trong khoảng nhận (14:00, hoặc ngay bây giờ nếu hôm nay đã quá) - trả (12:00)
      if (span && (span.from < Math.min(Date.parse(`${d.checkIn}T${times.checkInTime}:00+07:00`), Date.now() - 5 * 60_000) || span.to > Date.parse(`${d.checkOut}T${times.checkOutTime}:00+07:00`))) { setFormError('Giờ ở theo giờ phải nằm trong khoảng nhận phòng (14:00) đến trả phòng (12:00) của đơn. Hãy đổi ngày nhận/trả hoặc chọn lại giờ.'); return; }
    } else if (span.from < Date.now() - 5 * 60_000) { setFormError('Giờ vào đã qua, hãy chọn lại giờ vào ở trang danh sách phòng.'); return; }
    if (over) { setFieldErr({ field: 'guests', text: `Các phòng đã chọn chỉ chứa tối đa ${capacity} người.` }); focusField('guests'); return; }
    if (guests < rooms) { setFieldErr({ field: 'guests', text: `Mỗi phòng cần ít nhất 1 khách (đang chọn ${rooms} phòng).` }); focusField('guests'); return; }
    setFormError(''); setFieldErr(null);
    const fullName = d.passengerName.trim();
    saveGuest({ fullName, phone: d.phone.trim() });
    const legs = buildShuttle(shuttle, d.checkIn, d.checkOut, undefined, hourlyTimes, times);
    const bd = { ...d, passengerName: fullName, paymentMethod: methods.list.some((m) => m.id === payMethod) ? payMethod : 'AT_HOTEL', idempotencyKey: newIdempotencyKey(), party: bk, rooms: toApiRooms(cart), lines: cart.lines, shuttle: hotel.shuttleAvailable ? legs : undefined };
    setBookingData(bd);
    submitBooking(bd);
  };

  const retryLink = async () => {
    setActionError(''); setLinkBusy(true);
    try { const l = await getPaymentLink(bookingResult.code, bookingData.phone); setBookingResult((b) => ({ ...b, payUrl: l.payUrl, payError: undefined })); }
    catch (err) { setActionError(describeApiError(err)); }
    finally { setLinkBusy(false); }
  };

  const submitBooking = async (bd) => {
    setActionError(''); setPending(true);
    try {
      const r = await createBooking({
        hotelId: hotel.id, rooms: bd.rooms, guests: bd.party.adults + bd.party.children, children: bd.party.children, shuttle: bd.shuttle, times, checkIn: bd.checkIn, checkOut: bd.checkOut, paymentMethod: bd.paymentMethod, idempotencyKey: bd.idempotencyKey,
        guest: { fullName: bd.passengerName, phone: bd.phone, ...(bd.email?.trim() && { email: bd.email.trim() }) },
      });
      saveLastBooking(r.code, bd.phone); savePay(bd.paymentMethod);
      setBookingResult({ guests: r.guests, children: r.children, lines: r.lines ?? bd.lines.map((l) => ({ roomTypeName: l.name, qty: l.qty, kind: l.kind, hours: l.hours })), shuttles: r.shuttles ?? [], pricing: r.pricing, code: r.code, status: r.status, expiresAt: r.expiresAt, method: r.payment.method, payUrl: r.paymentLink?.payUrl, payError: r.paymentLink?.error });
      setStep(3);
      onCart({ hotelId: null, hotelName: '', savedAt: 0, lines: [] }); // đơn đã tạo: xóa giỏ
      onRefresh?.(); // số phòng còn đã đổi
      if (r.payment.method !== 'AT_HOTEL' && r.paymentLink?.payUrl) window.location.assign(r.paymentLink.payUrl); // online: tự chuyển sang cổng, bước 3 là dự phòng nếu chuyển lỗi
    } catch (err) {
      const fe = bookingFieldError(err);
      if (err.code === 'VNPAY_DISABLED' || err.code === 'MOMO_DISABLED') {
        setActionError(GATE_OFF);
        loadMethods().then((list) => setPayMethod((m) => (list.some((x) => x.id === m) ? m : 'AT_HOTEL')));
      } else if (err.status === 409 && err.code === 'SOLD_OUT') {
        const { cart: left, names } = dropSoldOut(cart, err.details?.soldOut);
        onRefresh?.();
        const what = names.length ? names.join(', ') : 'Một loại phòng trong giỏ';
        if (left.lines.length) { onCart(left); setFormError(`${what} vừa hết phòng trong ngày bạn chọn. Mình đã bỏ khỏi giỏ, bạn kiểm tra lại các phòng còn lại rồi tiếp tục.`); setStep(1); }
        else { onCart(left); onNotice?.(`${what} vừa hết phòng. Giỏ đã được làm trống, bạn chọn lại loại phòng khác nhé.`); onClose(); }
      } else if (err.status === 404 && err.code === 'ROOM_TYPE_NOT_FOUND') {
        onRefresh?.(); onNotice?.('Một loại phòng trong giỏ không còn được bán. Danh sách đã được tải lại, bạn chọn lại phòng nhé.'); onClose();
      } else if (fe?.field === 'dates') {
        setFormError(fe.text); setActionError(''); setStep(1);
      } else if (fe) {
        setFieldErr(fe); setActionError(''); setStep(1); focusField(fe.field, bd.shuttle && { TO_HOTEL: { on: bd.shuttle.legs.some((l) => l.direction === 'TO_HOTEL') } });
      } else setActionError(describeApiError(err));
      if (err.status === 409 && err.code !== 'SOLD_OUT') onRefresh?.();
    } finally { setPending(false); }
  };

  const estimate = cart.lines.reduce((s, l) => s + lineTotal(l, nights), 0);

  return (
    <div ref={root} className="tw:fixed tw:inset-0 tw:z-[100] tw:grid tw:place-items-end tw:bg-slate-950/75 tw:p-0 tw:backdrop-blur-sm tw:sm:place-items-center tw:sm:p-5" role="dialog" aria-modal="true" aria-label="Tạo booking">
      <div data-modal className={`tw:max-h-[96dvh] tw:w-full tw:overflow-y-auto tw:rounded-t-3xl tw:bg-white tw:p-5 tw:shadow-2xl ${step === 1 ? 'tw:sm:max-w-4xl' : 'tw:sm:max-w-xl'} tw:sm:rounded-3xl tw:sm:p-8`}>
        <button type="button" className="tw:float-right tw:grid tw:size-11 tw:place-items-center tw:rounded-full tw:bg-slate-100" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        {step === 1 && (
          <form onSubmit={captureBooking}>
            <h2 className="tw:text-2xl tw:font-bold">Đặt phòng</h2>
            <div className="tw:mt-5 tw:flex tw:gap-3 tw:rounded-xl tw:border tw:border-slate-200 tw:p-3">
              <div className="tw:relative tw:h-20 tw:w-24 tw:shrink-0 tw:self-start tw:overflow-hidden tw:rounded-lg"><img src={hotel.image} alt="" className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></div>
              <div className="tw:min-w-0 tw:flex-1"><strong className="tw:text-sm">{hotel.name}</strong>
                <ul data-testid="cart-lines" className="tw:mt-2 tw:grid tw:gap-2">
                  {cart.lines.map((l) => { const r = hotel.rooms.find((x) => x.id === l.roomTypeId); const h = isHourly(l); return (
                    <li key={`${l.roomTypeId}-${h ? 'h' : 'n'}`} data-testid={h ? 'cart-line-hourly' : 'cart-line'} className="tw:flex tw:items-center tw:justify-between tw:gap-3">
                      <span className="tw:min-w-0 tw:text-xs"><span className="tw:block tw:font-semibold">{l.name}{h && <span className="tw:ml-1.5 tw:rounded-md tw:bg-amber-100 tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:font-bold tw:text-amber-800">Theo giờ</span>}{!h && planOf(l) === NR && <span data-testid="cart-line-nr" className="tw:ml-1.5 tw:rounded-md tw:bg-rose-100 tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:font-bold tw:text-rose-800">Không hoàn hủy</span>}</span><span className="tw:text-slate-500">{h ? `${hourlyRange(l.startsAt, l.hours)} · ${l.hours} giờ · ${money(l.price)} / phòng` : `tối đa ${l.maxOccupancy} người/phòng · ${money(l.price)} / đêm`}</span></span>
                      <Stepper value={l.qty} max={r ? maxQty(r, h ? 'HOURLY' : 'NIGHT') : l.qty} label={h ? `${l.name} theo giờ` : l.name} onChange={(q) => changeQty(l, q)} />
                    </li>
                  ); })}
                </ul>
                {cartPlan(cart) === NR && <p role="note" data-testid="nr-warning" className="tw:mt-2 tw:rounded-lg tw:bg-rose-50 tw:p-2 tw:text-xs tw:text-rose-800">Mức giá Không hoàn hủy: sau khi đặt, nếu bạn hủy hoặc không đến thì không được hoàn tiền.</p>}
                <p className="tw:mt-2 tw:text-xs tw:font-bold tw:text-blue-600">{span ? `${rooms} phòng · tạm tính ${money(cartTotal(cart, nights))}` : `${rooms} phòng · ${money(perNight(cart))} / đêm`}</p>
              </div>
            </div>
            <div className="tw:lg:grid tw:lg:grid-cols-2 tw:lg:gap-8">
              <div className="tw:mt-5 tw:grid tw:content-start tw:gap-4 tw:sm:grid-cols-2">
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Họ và tên<input name="passengerName" defaultValue={bookingData?.passengerName ?? saved.fullName} required maxLength={80} autoComplete="name" placeholder="Nguyễn Minh Anh" /></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số điện thoại<input name="phone" defaultValue={bookingData?.phone ?? saved.phone} type="tel" inputMode="tel" required pattern="[0-9+ ]{9,15}" title="Từ 9 đến 15 chữ số" autoComplete="tel" placeholder="0912345678" /></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Email nhận xác nhận (không bắt buộc)<input name="email" defaultValue={bookingData?.email ?? ""} type="email" maxLength={200} autoComplete="email" placeholder="ban@example.com" /></label>
                {night && <><label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Nhận phòng<input name="checkIn" type="date" min={today} value={dates.checkIn} onChange={(e) => { const v = e.target.value; resetPickups(); setDates((d) => ({ checkIn: v, checkOut: v && d.checkOut <= v ? nextDay(v) : d.checkOut })); }} required /><span data-testid="checkin-weekday" className="tw:text-[11px] tw:font-normal tw:text-slate-500">{weekdayLabel(dates.checkIn)}</span></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Giờ nhận phòng<input name="checkInTime" data-testid="checkin-time" type="time" step="900" value={times.checkInTime} onChange={(e) => { const v = e.target.value; if (v) { resetPickups(); setTimes((t) => ({ ...t, checkInTime: v })); } }} required /><span className="tw:text-[11px] tw:font-normal tw:text-slate-500">Giờ Việt Nam</span></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Trả phòng<input name="checkOut" type="date" min={dates.checkIn ? nextDay(dates.checkIn) : tomorrow} value={dates.checkOut} onChange={(e) => { resetPickups(); setDates((d) => ({ ...d, checkOut: e.target.value })); }} required /><span data-testid="checkout-weekday" className="tw:text-[11px] tw:font-normal tw:text-slate-500">{weekdayLabel(dates.checkOut)}</span></label>
                <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Giờ trả phòng<input name="checkOutTime" data-testid="checkout-time" type="time" step="900" value={times.checkOutTime} onChange={(e) => { const v = e.target.value; if (v) { resetPickups(); setTimes((t) => ({ ...t, checkOutTime: v })); } }} required /><span className="tw:text-[11px] tw:font-normal tw:text-slate-500">Giờ Việt Nam</span></label></>}
                {!night && span && <div data-testid="hourly-only-note" className="tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900 tw:sm:col-span-2"><strong>Đặt theo giờ</strong> · {weekdayLabel(eff.checkIn)}. Giờ vào và giờ ra của từng phòng ghi ở danh sách phòng phía trên; không cần chọn ngày nhận/trả.</div>}
              </div>
              <div>
                <div id="guests-block" tabIndex={-1} className="tw:mt-5"><span className="tw:text-[13px] tw:font-semibold tw:text-slate-700">Số khách</span>
                  <div className="tw:mt-2"><GuestsPicker inline hideRooms value={{ ...bk, rooms }} onChange={(v) => { setBk({ adults: v.adults, children: v.children }); setFieldErr(null); }} maxPeople={30} /></div>
                  <p data-testid="guests-note" className="tw:mt-2 tw:text-[11px] tw:text-slate-500" aria-live="polite">{guests} khách (trẻ em đã tính). Các phòng đã chọn chứa tối đa {capacity} người.</p>
                  {(over || fieldErr?.field === 'guests') && (
                    <div role="alert" data-testid="guests-error" className="tw:mt-2 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">
                      {fieldErr?.field === 'guests' ? fieldErr.text : `Các phòng đã chọn chỉ chứa tối đa ${capacity} người. Hãy giảm số khách hoặc thêm phòng.`}
                      {over && extra && <button type="button" onClick={addExtra} data-testid="add-extra-room" className="tw:mt-2 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:rounded-lg tw:bg-rose-600 tw:px-3 tw:text-xs tw:font-bold tw:text-white">Thêm 1 phòng {extra.name}?</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {hotel.shuttleAvailable && <div id="shuttle-block" tabIndex={-1}><ShuttleOptions hotel={hotel} checkIn={eff.checkIn} checkOut={eff.checkOut} hourly={hourlyTimes} times={times} people={guests} value={shuttle} onChange={(v) => { setShuttle(v); setFieldErr(null); }} error={fieldErr && fieldErr.field !== 'guests' ? fieldErr : null} /></div>}
            <fieldset className="tw:mt-5"><legend className="tw:text-xs tw:font-bold">Hình thức thanh toán</legend><div className="tw:mt-2 tw:grid tw:gap-2">{methods.s === 'loading' && <p role="status" className="tw:text-xs tw:text-slate-500">Đang tải hình thức thanh toán…</p>}{methods.s === 'error' && <p className="tw:text-xs tw:text-amber-800">Chưa tải được danh sách cổng thanh toán, tạm thời chỉ có thanh toán tại khách sạn.</p>}{methods.list.map(({ id, label, mode }) => <label key={id} className={`tw:flex tw:cursor-pointer tw:items-start tw:gap-3 tw:rounded-xl tw:border tw:p-3 tw:text-xs ${payMethod === id ? 'tw:border-blue-600 tw:bg-blue-50' : 'tw:border-slate-200'}`}><input type="radio" name="paymentMethod" value={id} checked={payMethod === id} onChange={() => setPayMethod(id)} className="tw:mt-0.5" /><span><strong className="tw:block">{id === 'AT_HOTEL' ? label : `Thanh toán online qua ${label}`}{mode === 'mock' && <em className="tw:ml-2 tw:rounded-full tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-[11px] tw:not-italic tw:text-amber-800">Giả lập</em>}</strong><span className="tw:text-slate-500">{PAY_HINT[id]}</span></span></label>)}</div></fieldset>
            <div data-testid="price-summary" className="tw:mt-4 tw:divide-y tw:divide-slate-100 tw:rounded-xl tw:border tw:border-slate-200 tw:px-4 tw:text-xs">{[
              ['Tiền phòng', money(priceQuote.s === 'ok' ? priceQuote.q.roomVnd : estimate)],
              ['Phí dịch vụ', priceQuote.s === 'ok' ? money(priceQuote.q.serviceFeeVnd) : priceQuote.s === 'loading' ? 'Đang tính…' : 'Tính khi đặt, cộng vào tổng tiền'],
              ...(priceQuote.s === 'ok' ? [['Tổng tiền', money(priceQuote.q.totalVnd), true]] : [])].map(sumRow)}</div>
            <p className="tw:mt-4 tw:text-[11px] tw:leading-5 tw:text-slate-500">Họ tên và số điện thoại chỉ dùng để xử lý và xác minh booking, được nhớ trên thiết bị này cho lần sau. Không cần tạo tài khoản. Khách sạn có thể cần xác nhận; theo dõi bằng mã booking và số điện thoại.</p>
            {formError && <p role="alert" data-testid="form-error" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{formError}</p>}
            {actionError && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{actionError}</p>}
            <div className="tw:sticky tw:bottom-0 tw:z-10 tw:-mx-5 tw:mt-4 tw:bg-white tw:px-5 tw:pb-[max(0.75rem,env(safe-area-inset-bottom))] tw:pt-3 tw:sm:-mx-8 tw:sm:px-8 tw:lg:static tw:lg:bg-transparent tw:lg:pb-0">
              <button disabled={pending} className="tw:flex tw:min-h-11 tw:w-full tw:lg:ml-auto tw:lg:w-1/2 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-sm tw:font-bold tw:text-white tw:disabled:opacity-60">{pending ? 'Đang kiểm tra phòng...' : <>Đặt phòng{priceQuote.s === 'ok' ? ` · ${money(priceQuote.q.totalVnd)}` : ''} <ArrowRight size={17} /></>}</button>
            </div>
          </form>
        )}
        {step === 3 && bookingResult && (
          <div className="tw:py-4 tw:text-center"><span className="tw:mx-auto tw:grid tw:size-16 tw:place-items-center tw:rounded-full tw:bg-emerald-50 tw:text-emerald-600"><Check size={30} /></span><span className="tw:mt-5 tw:block tw:text-[11px] tw:font-extrabold tw:uppercase tw:tracking-[.16em] tw:text-emerald-600">Đã gửi thành công</span><h2 className="tw:mt-2 tw:text-2xl tw:font-bold">Yêu cầu đã được ghi nhận</h2><p className="tw:mx-auto tw:mt-3 tw:max-w-md tw:text-xs tw:leading-6 tw:text-slate-500">Lưu mã booking và dùng đúng số điện thoại đã nhập để theo dõi trạng thái.</p>
            <div className="tw:my-6 tw:rounded-2xl tw:bg-blue-50 tw:p-5"><small className="tw:text-slate-500">Mã booking</small><p className="tw:mt-2 tw:text-2xl tw:font-extrabold tw:tracking-wider tw:text-blue-700">{bookingResult.code}</p>{bookingResult.status === 'PENDING' && bookingResult.expiresAt && <HoldTimer until={bookingResult.expiresAt} online={bookingResult.method !== 'AT_HOTEL'} />}
              <span className="tw:mt-3 tw:inline-block tw:rounded-full tw:bg-amber-100 tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-bold tw:text-amber-800">{statusCopy(bookingResult.status)}</span>
              <div className="tw:mt-4 tw:flex tw:justify-center tw:gap-2">
                <button type="button" data-testid="copy-code" onClick={async () => { setCopied(await copyText(bookingResult.code)); window.setTimeout(() => setCopied(false), 2000); }} className="tw:min-h-11 tw:rounded-xl tw:border tw:border-blue-200 tw:bg-white tw:px-4 tw:text-xs tw:font-bold tw:text-blue-700">{copied ? 'Đã sao chép' : 'Sao chép mã'}</button>
                {navigator.share && <button type="button" onClick={() => navigator.share({ title: `Booking ${bookingResult.code}`, text: `Mã booking ${bookingResult.code} tại ${hotel.name}` }).catch(() => {})} className="tw:min-h-11 tw:rounded-xl tw:border tw:border-blue-200 tw:bg-white tw:px-4 tw:text-xs tw:font-bold tw:text-blue-700">Chia sẻ</button>}
                {hotel.lat != null && hotel.lng != null && <a href={`https://www.google.com/maps/dir/?api=1&destination=${hotel.lat},${hotel.lng}`} target="_blank" rel="noopener noreferrer" className="tw:grid tw:min-h-11 tw:place-items-center tw:rounded-xl tw:border tw:border-blue-200 tw:bg-white tw:px-4 tw:text-xs tw:font-bold tw:text-blue-700">Chỉ đường</a>}
              </div>
              {bookingResult.pricing && <dl className="tw:mt-4 tw:space-y-1 tw:text-left tw:text-xs">
                <div className="tw:flex tw:justify-between tw:gap-3"><dt className="tw:text-slate-500">Phòng</dt><dd data-testid="result-rooms" className="tw:text-right">{roomsText(bookingResult.lines)}</dd></div>
                <div className="tw:flex tw:justify-between"><dt className="tw:text-slate-500">Số khách</dt><dd data-testid="result-guests">{peopleText(bookingResult.guests, bookingResult.children)}</dd></div>
                <div className="tw:flex tw:justify-between"><dt className="tw:text-slate-500">Tiền phòng</dt><dd>{money(bookingResult.pricing.roomVnd)}</dd></div>
                {bookingResult.shuttles.map((x) => <div key={x.id} className="tw:flex tw:justify-between tw:gap-3"><dt className="tw:text-slate-500">Xe: {LEG_LABEL[x.direction]} ({new Date(x.pickupAt).toLocaleString('vi-VN', { hour12: false, dateStyle: 'short', timeStyle: 'short' })})</dt><dd>{x.priceVnd ? money(x.priceVnd) : 'Miễn phí'}</dd></div>)}
                {bookingResult.pricing.shuttleVnd > 0 && <div className="tw:flex tw:justify-between"><dt className="tw:text-slate-500">Xe đưa đón</dt><dd data-testid="result-shuttle">{money(bookingResult.pricing.shuttleVnd)}</dd></div>}
                <div className="tw:flex tw:justify-between"><dt className="tw:text-slate-500">Phí dịch vụ</dt><dd>{money(bookingResult.pricing.serviceFeeVnd)}</dd></div>
                <div className="tw:flex tw:justify-between tw:font-bold"><dt>Tổng tiền</dt><dd data-testid="result-total">{money(bookingResult.pricing.totalVnd)}</dd></div>
                {bookingResult.method !== 'AT_HOTEL' && <p className="tw:pt-1 tw:text-[11px] tw:text-slate-500">Số tiền thanh toán online: {money(bookingResult.pricing.totalVnd)} (đã gồm xe đưa đón và phí dịch vụ).</p>}
              </dl>}
            </div>
            {bookingResult.method !== 'AT_HOTEL' && (bookingResult.payUrl
              ? <button type="button" onClick={() => window.location.assign(bookingResult.payUrl)} className="tw:mb-3 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-emerald-600 tw:text-sm tw:font-bold tw:text-white">Thanh toán qua {PAY_LABEL[bookingResult.method]} <ArrowRight size={17} /></button>
              : <div className="tw:mb-3"><p role="alert" className="tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">Đơn đã giữ chỗ nhưng chưa tạo được liên kết thanh toán, hãy thử lại.</p>{actionError && <p role="alert" className="tw:mt-2 tw:text-xs tw:text-rose-700">{actionError}</p>}<button type="button" disabled={linkBusy} onClick={retryLink} className="tw:mt-2 tw:min-h-11 tw:w-full tw:rounded-xl tw:border tw:border-emerald-600 tw:text-xs tw:font-bold tw:text-emerald-700 tw:disabled:opacity-60">{linkBusy ? 'Đang tạo liên kết…' : 'Lấy lại liên kết thanh toán'}</button></div>)}
            <button type="button" onClick={() => { setTrackPrefill(`${bookingResult.code} ${bookingData.phone}`); dispatch({ type: 'go', screen: 'track' }); }} className="tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-sm tw:font-bold tw:text-white">Xem chi tiết đơn và theo dõi xe <ArrowRight size={17} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
