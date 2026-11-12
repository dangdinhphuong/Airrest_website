import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, Clock3, Headphones, Hotel, LogOut, MapPin, Search, Send, ShieldCheck, Star, UserRound,
} from 'lucide-react';
import { useApp } from '../../state/store';
import { airportName, createTicket, describeApiError, getHotel, getPaymentLink, listAirports, lookupBooking, lookupTicket, replyTicket, simulatePayment, changePassword, describeAuthError, listMyBookings, PASSWORD_MIN, PASSWORD_MAX } from '../../data/user';
import { money } from '../../lib/time';
import BookingActions from './BookingActions';
import { parseTrack, scrollToId, setTrackPrefill, takeTrackPrefill, statusCopy, statusTone } from './data';

const PAGE = 'tw:min-h-screen tw:bg-slate-50 tw:px-5 tw:py-8 tw:sm:py-14';
const BACK = 'tw:inline-flex tw:items-center tw:gap-2 tw:text-xs tw:font-bold tw:text-blue-700';
const LABEL = 'tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-[.16em]';
const TONE = { ok: 'tw:bg-emerald-100 tw:text-emerald-900', bad: 'tw:bg-rose-100 tw:text-rose-900', wait: 'tw:bg-amber-100 tw:text-amber-900' };

const useGo = () => {
  const { dispatch } = useApp();
  return (screen) => { dispatch({ type: 'go', screen }); window.scrollTo({ top: 0 }); };
};

function Back({ children = 'Về trang chủ', to = 'home' }) {
  const go = useGo();
  return <button type="button" onClick={() => go(to)} className={BACK}><ArrowLeft size={16} /> {children}</button>;
}

// Tải một tài nguyên bất đồng bộ: { data, error, loading }. Đổi `key` thì tải lại.
function useLoad(fn, key) {
  const [st, setSt] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    const ctl = new AbortController();
    setSt({ data: null, error: '', loading: true });
    fn(ctl.signal).then((data) => setSt({ data, error: '', loading: false })).catch((e) => { if (!ctl.signal.aborted) setSt({ data: null, error: describeApiError(e), loading: false }); });
    return () => ctl.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

function Gallery({ p }) {
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

export function HotelDetail() {
  const { state, dispatch } = useApp();
  const { data: p, error, loading } = useLoad(async (signal) => { await listAirports().catch(() => {}); return getHotel(state.propertyId, signal); }, state.propertyId);
  const toStays = () => { dispatch({ type: 'go', screen: 'home' }); scrollToId('stays'); };
  if (loading || error || !p) {
    return <div className={PAGE}><div className="tw:mx-auto tw:max-w-[1080px]"><Back to="home">Quay lại danh sách</Back><p role={error ? 'alert' : 'status'} className="tw:mt-6 tw:rounded-2xl tw:bg-white tw:p-8 tw:text-sm tw:text-slate-600">{loading ? 'Đang tải thông tin nơi nghỉ…' : error || 'Không tìm thấy nơi nghỉ này.'}</p></div></div>;
  }
  const apName = airportName(p.airportCode);

  return (
    <div className="tw:min-h-screen tw:bg-slate-50 tw:pb-16">
      <div className="tw:mx-auto tw:max-w-[1080px] tw:px-5 tw:py-8"><Back to="home">Quay lại danh sách</Back></div>
      <section className="tw:mx-auto tw:grid tw:max-w-[1080px] tw:gap-7 tw:px-5 tw:lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <Gallery key={p.id} p={p} />
          <div className="tw:mt-7 tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:sm:p-8">
            <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-[.16em] tw:text-blue-600">Thông tin khách sạn</span>
            <h1 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">{p.name}</h1>
            <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-4 tw:text-xs tw:text-slate-500"><span className="tw:flex tw:items-center tw:gap-1"><MapPin size={15} /> {p.address || `Gần sân bay ${apName}`}</span>{p.rating && <span className="tw:flex tw:items-center tw:gap-1 tw:font-bold tw:text-emerald-700"><Star size={14} fill="currentColor" /> {p.rating}/10</span>}</div>
            <p className="tw:mt-6 tw:text-sm tw:leading-7 tw:text-slate-600">{p.description || `Cách sân bay ${apName} ${p.distanceKm} km, khoảng ${p.travelMinutes} phút đi xe.`}</p>
            <h2 className="tw:mt-7 tw:font-bold">Tiện ích</h2>
            <div className="tw:mt-3 tw:grid tw:gap-2 tw:sm:grid-cols-2">{p.amenities.map((item) => <span key={item} className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-slate-600"><Check size={15} className="tw:text-emerald-600" /> {item}</span>)}</div>
          </div>
        </div>
        <aside className="tw:space-y-5">
          <div className="tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-6">
            <h2 className="tw:font-bold">Loại phòng hiện có</h2>
            {p.rooms.length ? <div className="tw:mt-4 tw:space-y-3">{p.rooms.map((room) => <div key={room.id} className="tw:rounded-xl tw:bg-slate-50 tw:p-4"><div className="tw:flex tw:justify-between tw:gap-3"><strong className="tw:text-sm">{room.name}</strong><strong className="tw:text-sm tw:text-blue-700">{money(room.price)}</strong></div><p className="tw:mt-2 tw:text-[10px] tw:leading-5 tw:text-slate-500">Tối đa {room.maxOccupancy} khách · {room.cancellationPolicy} · {room.availableRooms > 0 ? `còn ${room.availableRooms} phòng` : 'hết phòng'}</p></div>)}</div> : <p className="tw:mt-4 tw:text-xs tw:text-slate-500">Chưa có phòng mở bán.</p>}
            <button type="button" onClick={toStays} className="tw:mt-5 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white">Chọn phòng trên trang chủ</button>
          </div>
          <div className="tw:rounded-2xl tw:bg-[#062253] tw:p-6 tw:text-white"><ShieldCheck className="tw:text-blue-300" /><h2 className="tw:mt-4 tw:font-bold">Điều kiện lưu trú</h2><p className="tw:mt-3 tw:text-xs tw:leading-6 tw:text-blue-100">{p.receptionLabel}</p><p className="tw:mt-3 tw:text-xs tw:leading-6 tw:text-blue-100">{p.freeCancel ? 'Hủy miễn phí theo điều kiện của cơ sở.' : 'Không hoàn hủy. Điều kiện được hiển thị trước khi gửi yêu cầu.'}</p></div>
        </aside>
      </section>
    </div>
  );
}

const dmy = (iso) => new Date(iso).toLocaleDateString('vi-VN');

function BookingDetail({ b, phone, onPay, payError }) {
  const go = useGo();
  const line = b.lines?.[0];
  return (
    <section className="tw:mt-6 tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:shadow-lg tw:sm:p-9">
      <div className="tw:flex tw:flex-col tw:justify-between tw:gap-4 tw:border-b tw:border-slate-100 tw:pb-6 tw:sm:flex-row tw:sm:items-center"><div><small className="tw:text-slate-500">Mã booking</small><h2 className="tw:mt-1 tw:text-xl tw:font-extrabold tw:tracking-wider">{b.code}</h2></div><span className={`tw:w-fit tw:rounded-full tw:px-4 tw:py-2 tw:text-[10px] tw:font-bold ${TONE[statusTone(b.status)]}`}>{statusCopy(b.status)}</span></div>
      <div className="tw:mt-6 tw:grid tw:gap-4 tw:sm:grid-cols-2">
        <div className="tw:flex tw:gap-3 tw:rounded-xl tw:bg-slate-50 tw:p-4"><Hotel className="tw:shrink-0 tw:text-blue-600" /><div><small className="tw:text-slate-500">Nơi nghỉ</small><p className="tw:mt-1 tw:text-sm tw:font-bold">{b.hotel?.name}</p><span className="tw:text-xs tw:text-slate-500">{line?.roomTypeName}{line?.qty > 1 ? ` × ${line.qty}` : ''}</span></div></div>
        <div className="tw:flex tw:gap-3 tw:rounded-xl tw:bg-slate-50 tw:p-4"><CalendarDays className="tw:shrink-0 tw:text-blue-600" /><div><small className="tw:text-slate-500">Thời gian lưu trú</small><p className="tw:mt-1 tw:text-xs tw:font-bold">{dmy(b.stay.from)} → {dmy(b.stay.to)}</p></div></div>
      </div>
      <div className="tw:mt-5 tw:divide-y tw:divide-slate-100 tw:rounded-xl tw:border tw:border-slate-200 tw:px-4 tw:text-xs"><div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Tiền phòng</span><span>{money(b.pricing.roomVnd)}</span></div>{b.pricing.shuttleVnd > 0 && <div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Xe đưa đón</span><span>{money(b.pricing.shuttleVnd)}</span></div>}<div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Phí dịch vụ</span><span>{money(b.pricing.serviceFeeVnd)}</span></div>{b.pricing.discountVnd > 0 && <div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Giảm giá</span><span>-{money(b.pricing.discountVnd)}</span></div>}<div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Tổng tiền</span><strong>{money(b.pricing.totalVnd)}</strong></div><div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Thanh toán</span><strong>{b.payment.method === 'VNPAY' ? 'VNPay' : 'Tại khách sạn'} · {{ UNPAID: 'chưa thanh toán', PENDING: 'đang xử lý', PAID: 'đã thanh toán', REFUNDED: 'đã hoàn tiền' }[b.payment.status] ?? b.payment.status}</strong></div></div>
      <div className="tw:mt-5 tw:flex tw:items-start tw:gap-3 tw:rounded-xl tw:bg-blue-50 tw:p-4"><Clock3 className="tw:shrink-0 tw:text-blue-600" /><p className="tw:text-xs tw:leading-6 tw:text-slate-600"><strong className="tw:text-slate-900">Trạng thái hiện tại: {statusCopy(b.status)}.</strong><br />Trạng thái do khách sạn cập nhật và hiển thị tại đây.</p></div>
      {b.decision?.reason && <p className="tw:mt-4 tw:rounded-xl tw:bg-amber-50 tw:p-4 tw:text-xs tw:text-amber-900">Lý do: {b.decision.reason}</p>}
      {b.status === 'PENDING_PAYMENT' && b.payment.method === 'VNPAY' && <button type="button" onClick={onPay} className="tw:mt-4 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:rounded-xl tw:bg-emerald-600 tw:text-xs tw:font-bold tw:text-white">Thanh toán qua VNPay</button>}
      {payError && <p role="alert" className="tw:mt-3 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{payError}</p>}
      <BookingActions booking={b} phone={phone} />
      <div className="tw:mt-6 tw:flex tw:flex-col tw:gap-3 tw:sm:flex-row"><button type="button" onClick={() => go('support')} className="tw:flex tw:min-h-11 tw:flex-1 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-blue-200 tw:text-xs tw:font-bold tw:text-blue-700"><ShieldCheck size={17} /> Yêu cầu hỗ trợ</button><span className="tw:flex tw:min-h-11 tw:flex-1 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-emerald-50 tw:text-xs tw:font-bold tw:text-emerald-700"><CheckCircle2 size={17} /> Đã xác minh thông tin</span></div>
    </section>
  );
}

export function Track() {
  const [found, setFound] = useState(null); // { booking, phone }
  const [error, setError] = useState('');
  const [payError, setPayError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefill] = useState(takeTrackPrefill); // từ trang tài khoản: mã booking (+ SĐT nếu có)

  const submit = async (e) => {
    e.preventDefault();
    const { ref, phone } = parseTrack(new FormData(e.currentTarget).get('query'));
    setPayError('');
    if (!ref || !phone) {
      setFound(null);
      setError(!ref && !phone ? 'Nhập mã booking kèm số điện thoại đã dùng khi đặt, ví dụ AR-XXXXXXXX 0912345678.' : !phone ? 'Còn thiếu số điện thoại đã dùng khi đặt. Nhập mã booking kèm số điện thoại, ví dụ AR-XXXXXXXX 0912345678.' : 'Còn thiếu mã booking hợp lệ (dạng AR-XXXXXXXX). Nhập mã booking kèm số điện thoại, ví dụ AR-XXXXXXXX 0912345678.');
      return;
    }
    setBusy(true);
    try { setFound({ booking: await lookupBooking(ref.toUpperCase(), phone), phone }); setError(''); }
    catch (err) { setFound(null); setError(describeApiError(err)); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    setPayError('');
    try { const link = await getPaymentLink(found.booking.code, found.phone); window.location.assign(link.payUrl); }
    catch (err) { setPayError(describeApiError(err)); }
  };

  return (
    <div className={PAGE}>
      <div className="tw:mx-auto tw:max-w-3xl">
        <Back />
        <div className="tw:mt-6 tw:overflow-hidden tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-xl">
          <div className="tw:bg-[#062253] tw:px-6 tw:py-8 tw:text-white tw:sm:px-9"><span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-[.16em] tw:text-blue-200">Xác minh bắt buộc</span><h1 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Theo dõi booking</h1><p className="tw:mt-3 tw:max-w-xl tw:text-xs tw:leading-6 tw:text-blue-100">Chi tiết chỉ hiển thị khi mã booking và số điện thoại trùng khớp.</p></div>
          <form onSubmit={submit} className="tw:grid tw:gap-4 tw:p-6 tw:sm:p-9">
            <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mã booking và số điện thoại xác minh<input name="query" required autoComplete="off" defaultValue={prefill} placeholder="AR-XXXXXXXX 0912345678" /></label>
            <p className="tw:-mt-2 tw:text-[10px] tw:leading-4 tw:text-slate-500">Nhập mã booking kèm số điện thoại đã dùng khi đặt, ví dụ AR-XXXXXXXX 0912345678 (cách nhau một khoảng trắng).</p>
            <button disabled={busy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60"><Search size={17} /> {busy ? 'Đang tra cứu…' : 'Tra cứu booking'}</button>
            {error && <p role="alert" className="tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-semibold tw:text-rose-700">{error}</p>}
          </form>
        </div>
        {found && <BookingDetail key={found.booking.code} b={found.booking} phone={found.phone} onPay={pay} payError={payError} />}
      </div>
    </div>
  );
}

const TICKET_STATUS = { OPEN: ['Đang mở', 'wait'], IN_PROGRESS: ['Đang xử lý', 'wait'], RESOLVED: ['Đã giải quyết', 'ok'] };
const dmyHm = (iso) => new Date(iso).toLocaleString('vi-VN', { hour12: false, dateStyle: 'short', timeStyle: 'short' });

// Tra cứu ticket bằng mã SP-XXXXXXXX + SĐT, xem hội thoại và trả lời (backend: /v1/support/lookup, /v1/support/reply).
function TicketLookup({ initialCode = '' }) {
  const [t, setT] = useState(null); // { ticket, phone }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rBusy, setRBusy] = useState(false);
  const [rMsg, setRMsg] = useState({ ok: false, text: '' });
  const [reply, setReply] = useState('');

  const lookup = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    const code = d.code.trim().toUpperCase(); const phone = d.phone.trim();
    if (!/^SP-[0-9A-Z]{8}$/.test(code)) { setT(null); setError('Mã ticket không hợp lệ, dạng SP-XXXXXXXX.'); return; }
    if (!/^[0-9+ ]{9,15}$/.test(phone)) { setT(null); setError('Nhập số điện thoại đã dùng khi gửi ticket (9 đến 15 chữ số).'); return; }
    setBusy(true); setError(''); setRMsg({ ok: false, text: '' });
    try { setT({ ticket: await lookupTicket(code, phone), phone }); }
    catch (err) { setT(null); setError(err.status === 404 ? 'Không tìm thấy ticket khớp mã và số điện thoại này. Kiểm tra lại thông tin đã nhập.' : describeApiError(err)); }
    finally { setBusy(false); }
  };
  const send = async (e) => {
    e.preventDefault();
    const message = reply.trim();
    if (message.length < 3) { setRMsg({ ok: false, text: 'Nhập nội dung trả lời (ít nhất 3 ký tự).' }); return; }
    setRBusy(true); setRMsg({ ok: false, text: '' });
    try { setT({ ticket: await replyTicket(t.ticket.code, t.phone, message), phone: t.phone }); setReply(''); setRMsg({ ok: true, text: 'Đã gửi trả lời.' }); }
    catch (err) { setRMsg({ ok: false, text: err.code === 'TICKET_RESOLVED' ? 'Ticket đã được giải quyết, không thể trả lời thêm. Hãy gửi yêu cầu mới.' : describeApiError(err) }); }
    finally { setRBusy(false); }
  };
  const tk = t?.ticket;
  const [stLabel, stTone] = tk ? (TICKET_STATUS[tk.status] ?? [tk.status, 'wait']) : [];
  const closed = tk?.status === 'RESOLVED';

  return (
    <section aria-label="Tra cứu ticket" className="tw:mt-8 tw:overflow-hidden tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:shadow-xl tw:sm:p-9">
      <span className={`${LABEL} tw:text-blue-600`}>Đã gửi yêu cầu?</span>
      <h2 className="tw:mt-2 tw:text-2xl tw:font-bold tw:tracking-tight">Tra cứu ticket</h2>
      <p className="tw:mt-2 tw:text-xs tw:leading-6 tw:text-slate-500">Nhập mã ticket (SP-XXXXXXXX) kèm số điện thoại đã dùng khi gửi để xem phản hồi và trả lời.</p>
      <form onSubmit={lookup} className="tw:mt-5 tw:grid tw:gap-4 tw:sm:grid-cols-[1fr_1fr_auto] tw:sm:items-end">
        <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mã ticket<input name="code" required defaultValue={initialCode} maxLength={11} autoComplete="off" placeholder="SP-XXXXXXXX" className="tw:uppercase" /></label>
        <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số điện thoại<input name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="0912345678" /></label>
        <button disabled={busy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60"><Search size={16} /> {busy ? 'Đang tra cứu…' : 'Tra cứu'}</button>
      </form>
      {error && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{error}</p>}
      {tk && (
        <div className="tw:mt-6 tw:border-t tw:border-slate-100 tw:pt-6">
          <div className="tw:flex tw:flex-col tw:justify-between tw:gap-3 tw:sm:flex-row tw:sm:items-center"><div><small className="tw:text-slate-500">Ticket {tk.code}{tk.bookingCode ? ` · booking ${tk.bookingCode}` : ''}</small><h3 className="tw:mt-1 tw:font-bold">{tk.subject}</h3></div><span className={`tw:w-fit tw:rounded-full tw:px-4 tw:py-2 tw:text-[10px] tw:font-bold ${TONE[stTone]}`}>{stLabel}</span></div>
          <p className="tw:mt-1 tw:text-[10px] tw:text-slate-500">Gửi lúc {dmyHm(tk.createdAt)}{tk.resolvedAt ? ` · giải quyết lúc ${dmyHm(tk.resolvedAt)}` : ''}</p>
          {tk.messages?.length ? (
            <ul className="tw:mt-4 tw:space-y-3" aria-label="Hội thoại">{tk.messages.map((m, i) => <li key={i} className={`tw:flex ${m.from === 'GUEST' ? 'tw:justify-end' : 'tw:justify-start'}`}><div className={`tw:max-w-[88%] tw:rounded-2xl tw:px-4 tw:py-3 tw:text-xs tw:leading-5 ${m.from === 'GUEST' ? 'tw:bg-blue-600 tw:text-white' : 'tw:bg-slate-100 tw:text-slate-800'}`}><strong className="tw:block tw:text-[10px] tw:opacity-80">{m.from === 'GUEST' ? 'Bạn' : 'Nhân viên hỗ trợ'} · {dmyHm(m.createdAt)}</strong><p className="tw:mt-1 tw:whitespace-pre-line tw:break-words">{m.body}</p></div></li>)}</ul>
          ) : <p className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-xs tw:text-slate-500">Chưa có tin nhắn nào.</p>}
          <form onSubmit={send} className="tw:mt-5 tw:grid tw:gap-3">
            <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Trả lời<textarea value={reply} onChange={(e) => setReply(e.target.value)} disabled={closed} maxLength={2000} rows={3} placeholder={closed ? 'Ticket đã giải quyết, không thể trả lời thêm.' : 'Nhập nội dung trả lời…'} /></label>
            <button disabled={closed || rBusy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60"><Send size={16} /> {rBusy ? 'Đang gửi…' : 'Gửi trả lời'}</button>
          </form>
          {rMsg.text && <p role={rMsg.ok ? 'status' : 'alert'} className={`tw:mt-3 tw:rounded-xl tw:p-3 tw:text-xs tw:font-semibold ${rMsg.ok ? 'tw:bg-emerald-50 tw:text-emerald-800' : 'tw:bg-rose-50 tw:text-rose-700'}`}>{rMsg.text}</p>}
        </div>
      )}
    </section>
  );
}

export function Support() {
  const [ticket, setTicket] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    setError(''); setBusy(true);
    try {
      const t = await createTicket({ bookingCode: d.bookingCode.trim().toUpperCase(), phone: d.phone.trim(), fullName: d.fullName.trim(), email: d.email.trim(), subject: d.subject.trim(), message: d.message.trim() });
      setTicket(t.code);
    } catch (err) { setError(describeApiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className={PAGE}>
      <div className="tw:mx-auto tw:max-w-4xl">
        <Back />
        <div className="tw:mt-6 tw:grid tw:overflow-hidden tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-xl tw:lg:grid-cols-[.8fr_1.2fr]">
          <aside className="tw:bg-[#062253] tw:p-7 tw:text-white tw:sm:p-9"><span className="tw:grid tw:size-12 tw:place-items-center tw:rounded-xl tw:bg-white/10 tw:text-blue-200"><Headphones /></span><h1 className="tw:mt-6 tw:text-3xl tw:font-bold tw:tracking-tight">Trung tâm hỗ trợ</h1><p className="tw:mt-4 tw:text-xs tw:leading-6 tw:text-blue-100">Gửi yêu cầu về booking, chuyến bay, thanh toán hoặc phương tiện di chuyển.</p><div className="tw:mt-8 tw:space-y-4 tw:text-xs tw:text-blue-100"><p className="tw:flex tw:gap-3"><ShieldCheck size={17} className="tw:shrink-0" /> Không gửi thông tin giấy tờ tùy thân.</p><p className="tw:flex tw:gap-3"><Check size={17} className="tw:shrink-0" /> Ticket bắt đầu ở trạng thái Mở.</p><p className="tw:flex tw:gap-3"><Check size={17} className="tw:shrink-0" /> Phản hồi được nhân viên hỗ trợ cập nhật trong cổng quản trị.</p></div></aside>
          {ticket ? (
            <div className="tw:grid tw:place-items-center tw:p-8 tw:text-center"><div><span className="tw:mx-auto tw:grid tw:size-16 tw:place-items-center tw:rounded-full tw:bg-emerald-50 tw:text-emerald-600"><Check size={30} /></span><h2 className="tw:mt-5 tw:text-2xl tw:font-bold">Đã tiếp nhận yêu cầu</h2><p className="tw:mt-3 tw:text-xs tw:leading-6 tw:text-slate-500">Mã ticket của bạn là</p><p className="tw:mt-2 tw:text-xl tw:font-extrabold tw:tracking-wider tw:text-blue-700">{ticket}</p><p className="tw:mt-2 tw:text-[10px] tw:text-slate-500">Lưu mã này cùng số điện thoại để theo dõi phản hồi.</p><button type="button" onClick={() => setTicket('')} className="tw:mt-6 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tạo ticket khác</button></div></div>
          ) : (
            <form onSubmit={submit} className="tw:grid tw:gap-4 tw:p-6 tw:sm:grid-cols-2 tw:sm:p-9">
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Họ và tên<input name="fullName" required minLength={2} maxLength={100} autoComplete="name" /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số điện thoại<input name="phone" type="tel" inputMode="tel" required pattern="[0-9+ ]{9,15}" title="Từ 9 đến 15 chữ số" autoComplete="tel" /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Email (không bắt buộc)<input name="email" type="email" maxLength={200} autoComplete="email" /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mã booking (nếu có)<input name="bookingCode" pattern="[Aa][Rr]-[0-9A-Za-z]{8}|" title="Dạng AR-7K3M9P2Q" maxLength={11} className="tw:uppercase" /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Tiêu đề<input name="subject" required minLength={3} maxLength={150} /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Mô tả<textarea name="message" required minLength={3} maxLength={2000} rows={6} /></label>
              <button disabled={busy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60 tw:sm:col-span-2"><Send size={16} /> {busy ? 'Đang gửi…' : 'Gửi yêu cầu hỗ trợ'}</button>
              {error && <p role="alert" className="tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:text-rose-700 tw:sm:col-span-2">{error}</p>}
            </form>
          )}
        </div>
        <TicketLookup key={ticket} initialCode={ticket} />
      </div>
    </div>
  );
}

// Trang VNPay đưa khách về (VNPAY_RETURN_URL = /payment/result). Kết quả chính thức đến từ IPN phía máy chủ; trang này chỉ thông báo.
// mock=1 (backend VNPAY_MODE=mock): cho bấm giả lập thành công/thất bại; live: đọc vnp_ResponseCode.
export function PaymentResult() {
  const q = new URLSearchParams(window.location.search);
  const mockOrder = q.get('mock') === '1' ? q.get('orderId') : null;
  const [outcome, setOutcome] = useState(q.get('vnp_ResponseCode') ? (q.get('vnp_ResponseCode') === '00' ? 'ok' : 'fail') : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toTrack = () => window.location.assign('/#/track');

  const simulate = async (success) => {
    setBusy(true); setError('');
    try { await simulatePayment(mockOrder, success); setOutcome(success ? 'ok' : 'fail'); }
    catch (err) { setError(describeApiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className={PAGE}>
      <div className="tw:mx-auto tw:max-w-xl tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-8 tw:text-center tw:shadow-xl">
        <h1 className="tw:text-2xl tw:font-bold">Kết quả thanh toán</h1>
        {outcome === 'ok' && <p role="status" className="tw:mt-4 tw:rounded-xl tw:bg-emerald-50 tw:p-4 tw:text-sm tw:text-emerald-800">Thanh toán thành công. Hệ thống đang xác nhận đơn; dùng mã booking và số điện thoại để xem trạng thái.</p>}
        {outcome === 'fail' && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-sm tw:text-rose-800">Thanh toán chưa thành công. Đơn vẫn được giữ trong thời gian ngắn; bạn có thể thanh toán lại trong “Theo dõi booking”.</p>}
        {!outcome && mockOrder && (
          <div className="tw:mt-4">
            <p className="tw:rounded-xl tw:bg-amber-50 tw:p-4 tw:text-sm tw:text-amber-900">Cổng thanh toán giả lập (không phát sinh giao dịch thật). Mã giao dịch: <strong>{mockOrder}</strong></p>
            <div className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2"><button type="button" disabled={busy} onClick={() => simulate(true)} className="tw:min-h-11 tw:rounded-xl tw:bg-emerald-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60">Giả lập thanh toán thành công</button><button type="button" disabled={busy} onClick={() => simulate(false)} className="tw:min-h-11 tw:rounded-xl tw:border tw:border-slate-300 tw:text-xs tw:font-bold tw:disabled:opacity-60">Giả lập thất bại</button></div>
          </div>
        )}
        {!outcome && !mockOrder && <p className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-sm tw:text-slate-600">Không có thông tin giao dịch. Hãy kiểm tra trạng thái trong “Theo dõi booking”.</p>}
        {error && <p role="alert" className="tw:mt-3 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{error}</p>}
        <button type="button" onClick={toTrack} className="tw:mt-6 tw:min-h-11 tw:w-full tw:rounded-xl tw:bg-blue-600 tw:text-sm tw:font-bold tw:text-white">Theo dõi booking</button>
      </div>
    </div>
  );
}

const LIMIT_NOTE = `Mật khẩu ${PASSWORD_MIN}-${PASSWORD_MAX} ký tự`;

// Danh sách đơn của tài khoản (GET /v1/me/bookings, phân trang theo nextCursor).
function MyBookings() {
  const go = useGo();
  const [st, setSt] = useState({ items: [], next: null, loading: true, more: false, error: '' });
  const load = (cursor) => {
    setSt((v) => ({ ...v, loading: !cursor, more: !!cursor, error: '' }));
    return listMyBookings(cursor)
      .then((r) => setSt((v) => ({ items: cursor ? [...v.items, ...r.items] : r.items, next: r.nextCursor ?? null, loading: false, more: false, error: '' })))
      .catch((e) => setSt((v) => ({ ...v, loading: false, more: false, error: describeAuthError(e) })));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (b) => { setTrackPrefill(b.guest?.phone ? `${b.code} ${b.guest.phone}` : b.code); go('track'); };
  return (
    <section className="tw:mt-8" aria-labelledby="my-bookings" data-testid="my-bookings">
      <h2 id="my-bookings" className="tw:text-lg tw:font-bold">Đơn đặt phòng của tôi</h2>
      {st.loading && <p role="status" className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-xs tw:text-slate-500">Đang tải đơn đặt phòng…</p>}
      {st.error && <div role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-semibold tw:text-rose-700">{st.error} <button type="button" onClick={() => load(st.items.length ? st.next : undefined)} className="tw:ml-2 tw:underline">Thử lại</button></div>}
      {!st.loading && !st.error && !st.items.length && <p className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-5 tw:text-xs tw:leading-6 tw:text-slate-500">Bạn chưa có đơn nào gắn với tài khoản. Đặt phòng khi đang đăng nhập, đơn sẽ hiện ở đây.</p>}
      {st.items.length > 0 && (
        <ul className="tw:mt-4 tw:grid tw:list-none tw:gap-3 tw:p-0">
          {st.items.map((b) => (
            <li key={b.code}>
              <button type="button" onClick={() => open(b)} data-testid="my-booking-row" className="tw:flex tw:w-full tw:flex-col tw:gap-2 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-4 tw:text-left tw:hover:border-blue-300 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between">
                <span className="tw:min-w-0"><strong className="tw:block tw:text-sm tw:tracking-wider">{b.code}</strong><span className="tw:mt-1 tw:block tw:truncate tw:text-xs tw:text-slate-600">{b.hotel?.name}</span><span className="tw:mt-1 tw:block tw:text-[11px] tw:text-slate-500">{dmy(b.stay.from)} → {dmy(b.stay.to)}</span></span>
                <span className={`tw:w-fit tw:shrink-0 tw:rounded-full tw:px-3 tw:py-1.5 tw:text-[10px] tw:font-bold ${TONE[statusTone(b.status)]}`}>{statusCopy(b.status)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {st.next != null && !st.error && <button type="button" disabled={st.more} onClick={() => load(st.next)} data-testid="my-bookings-more" className="tw:mt-4 tw:min-h-11 tw:w-full tw:rounded-xl tw:border tw:border-slate-300 tw:text-xs tw:font-bold tw:disabled:opacity-60">{st.more ? 'Đang tải…' : 'Tải thêm'}</button>}
    </section>
  );
}

// Đổi mật khẩu (PATCH /v1/me/password).
function ChangePassword() {
  const [f, setF] = useState({ cur: '', next: '', again: '' });
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((v) => ({ ...v, [k]: e.target.value })); setMsg({ ok: '', err: '' }); };
  const submit = async (e) => {
    e.preventDefault();
    const err = !f.cur ? 'Nhập mật khẩu hiện tại.' : f.next.length < PASSWORD_MIN ? `Mật khẩu mới tối thiểu ${PASSWORD_MIN} ký tự.` : f.next.length > PASSWORD_MAX ? `Mật khẩu mới tối đa ${PASSWORD_MAX} ký tự.` : f.next === f.cur ? 'Mật khẩu mới phải khác mật khẩu hiện tại.' : f.next !== f.again ? 'Mật khẩu nhập lại không khớp.' : '';
    if (err) { setMsg({ ok: '', err }); return; }
    setBusy(true);
    try { await changePassword(f.cur, f.next); setF({ cur: '', next: '', again: '' }); setMsg({ ok: 'Đã đổi mật khẩu.', err: '' }); }
    catch (x) { setMsg({ ok: '', err: describeAuthError(x) }); }
    finally { setBusy(false); }
  };
  return (
    <section className="tw:mt-8 tw:border-t tw:border-slate-100 tw:pt-8" aria-labelledby="chg-pw">
      <h2 id="chg-pw" className="tw:text-lg tw:font-bold">Đổi mật khẩu</h2>
      <form onSubmit={submit} noValidate data-testid="change-password" className="tw:mt-4 tw:grid tw:gap-4 tw:sm:max-w-md">
        <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mật khẩu hiện tại<input type="password" autoComplete="current-password" value={f.cur} onChange={set('cur')} name="currentPassword" /></label>
        <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mật khẩu mới<input type="password" autoComplete="new-password" value={f.next} onChange={set('next')} name="newPassword" placeholder={LIMIT_NOTE} /></label>
        <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" value={f.again} onChange={set('again')} name="confirmPassword" /></label>
        {msg.err && <p role="alert" className="ui-error" data-testid="pw-error">{msg.err}</p>}
        {msg.ok && <p role="status" className="tw:text-xs tw:font-semibold tw:text-emerald-700" data-testid="pw-ok">{msg.ok}</p>}
        <button disabled={busy} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60">{busy ? 'Đang lưu…' : 'Đổi mật khẩu'}</button>
      </form>
    </section>
  );
}

export function Account() {
  const { state, dispatch } = useApp();
  const go = useGo();
  const user = state.user;
  const logout = () => { dispatch({ type: 'logout' }); dispatch({ type: 'go', screen: 'home' }); };
  const toStays = () => { dispatch({ type: 'go', screen: 'home' }); scrollToId('stays'); };

  if (!user) {
    return <div className={PAGE}><div className="tw:mx-auto tw:max-w-3xl"><Back /><div className="tw:mt-6 tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-8 tw:text-center tw:shadow-xl"><h1 className="tw:text-2xl tw:font-bold">Bạn chưa đăng nhập</h1><button type="button" onClick={() => go('login')} className="tw:mt-6 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Đăng nhập</button></div></div></div>;
  }
  return (
    <div className="tw:min-h-screen tw:bg-slate-50 tw:px-5 tw:py-10">
      <div className="tw:mx-auto tw:max-w-3xl">
        <div className="tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:shadow-xl tw:sm:p-9">
          <div className="tw:flex tw:flex-col tw:justify-between tw:gap-5 tw:border-b tw:border-slate-100 tw:pb-7 tw:sm:flex-row tw:sm:items-center">
            <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-4"><span className="tw:grid tw:size-14 tw:shrink-0 tw:place-items-center tw:rounded-2xl tw:bg-blue-50 tw:text-blue-700"><UserRound size={25} /></span><div className="tw:min-w-0"><span className={`${LABEL} tw:text-blue-600`}>Tài khoản người dùng</span><h1 className="tw:mt-1 tw:truncate tw:text-2xl tw:font-bold" data-testid="account-name">{user.name}</h1></div></div>
            <button type="button" onClick={logout} data-testid="account-logout" className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-slate-300 tw:px-4 tw:text-xs tw:font-bold tw:text-slate-600"><LogOut size={16} /> Đăng xuất</button>
          </div>
          <dl className="tw:mt-6 tw:grid tw:gap-3 tw:text-sm tw:sm:grid-cols-2" data-testid="account-info">
            <div className="tw:rounded-xl tw:bg-slate-50 tw:p-4"><dt className="tw:text-[11px] tw:text-slate-500">Tên đăng nhập</dt><dd className="tw:mt-1 tw:break-all tw:font-bold">{user.username}</dd></div>
            <div className="tw:rounded-xl tw:bg-slate-50 tw:p-4"><dt className="tw:text-[11px] tw:text-slate-500">Họ và tên</dt><dd className="tw:mt-1 tw:break-words tw:font-bold">{user.fullName || user.username}</dd></div>
          </dl>
          <MyBookings />
          <ChangePassword />
          <div className="tw:mt-8 tw:grid tw:gap-4 tw:sm:grid-cols-2"><button type="button" onClick={() => go('track')} className="tw:flex tw:min-h-20 tw:items-center tw:gap-4 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5 tw:text-left tw:hover:border-blue-300"><Search className="tw:text-blue-600" /><div><strong className="tw:text-sm">Theo dõi booking</strong><p className="tw:mt-1 tw:text-[10px] tw:text-slate-500">Tra cứu bằng mã và số điện thoại</p></div></button><button type="button" onClick={toStays} className="tw:flex tw:min-h-20 tw:items-center tw:gap-4 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5 tw:text-left tw:hover:border-blue-300"><CalendarDays className="tw:text-blue-600" /><div><strong className="tw:text-sm">Tìm nơi nghỉ</strong><p className="tw:mt-1 tw:text-[10px] tw:text-slate-500">Xem phòng gần HAN và SGN</p></div></button></div>
          <button type="button" onClick={() => go('home')} className="tw:mt-7 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white">Về trang chủ</button>
        </div>
      </div>
    </div>
  );
}
