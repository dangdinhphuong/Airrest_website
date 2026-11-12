import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, Clock3, Headphones, Hotel, LogOut, MapPin, Search, Send, ShieldCheck, Star, UserRound,
} from 'lucide-react';
import { useApp } from '../../state/store';
import { airportName, createTicket, getHotel, getPaymentLink, listAirports, lookupBooking, simulatePayment } from '../../data/user';
import { describeError } from '../../lib/api';
import { money } from '../../lib/time';
import BookingActions from './BookingActions';
import { parseTrack, scrollToId, statusCopy, statusTone } from './data';

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
    fn(ctl.signal).then((data) => setSt({ data, error: '', loading: false })).catch((e) => { if (!ctl.signal.aborted) setSt({ data: null, error: describeError(e), loading: false }); });
    return () => ctl.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
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
          <div className="tw:relative tw:h-[340px] tw:overflow-hidden tw:rounded-3xl tw:sm:h-[460px]"><img src={p.image} alt={p.name} className="tw:absolute tw:inset-0 tw:size-full tw:object-cover" /></div>
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
      <div className="tw:mt-5 tw:divide-y tw:divide-slate-100 tw:rounded-xl tw:border tw:border-slate-200 tw:px-4 tw:text-xs"><div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Tổng tiền</span><strong>{money(b.pricing.totalVnd)}</strong></div><div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Thanh toán</span><strong>{b.payment.method === 'VNPAY' ? 'VNPay' : 'Tại khách sạn'} · {{ UNPAID: 'chưa thanh toán', PENDING: 'đang xử lý', PAID: 'đã thanh toán', REFUNDED: 'đã hoàn tiền' }[b.payment.status] ?? b.payment.status}</strong></div></div>
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

  const submit = async (e) => {
    e.preventDefault();
    const { ref, phone } = parseTrack(new FormData(e.currentTarget).get('query'));
    setPayError('');
    if (!ref || !phone) { setFound(null); setError('Nhập đủ mã booking (dạng AR-7K3M9P2Q) và số điện thoại đã dùng khi đặt, cách nhau một khoảng trắng.'); return; }
    setBusy(true);
    try { setFound({ booking: await lookupBooking(ref.toUpperCase(), phone), phone }); setError(''); }
    catch (err) { setFound(null); setError(describeError(err)); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    setPayError('');
    try { const link = await getPaymentLink(found.booking.code, found.phone); window.location.assign(link.payUrl); }
    catch (err) { setPayError(describeError(err)); }
  };

  return (
    <div className={PAGE}>
      <div className="tw:mx-auto tw:max-w-3xl">
        <Back />
        <div className="tw:mt-6 tw:overflow-hidden tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-xl">
          <div className="tw:bg-[#062253] tw:px-6 tw:py-8 tw:text-white tw:sm:px-9"><span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-[.16em] tw:text-blue-200">Xác minh bắt buộc</span><h1 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Theo dõi booking</h1><p className="tw:mt-3 tw:max-w-xl tw:text-xs tw:leading-6 tw:text-blue-100">Chi tiết chỉ hiển thị khi mã booking và số điện thoại trùng khớp.</p></div>
          <form onSubmit={submit} className="tw:grid tw:gap-4 tw:p-6 tw:sm:p-9">
            <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mã booking và số điện thoại xác minh<input name="query" required autoComplete="off" placeholder="AR-7K3M9P2Q 0912345678" /></label>
            <p className="tw:-mt-2 tw:text-[10px] tw:leading-4 tw:text-slate-500">Nhập mã booking, cách một khoảng trắng, rồi số điện thoại đã dùng khi đặt.</p>
            <button disabled={busy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60"><Search size={17} /> {busy ? 'Đang tra cứu…' : 'Tra cứu booking'}</button>
            {error && <p role="alert" className="tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-semibold tw:text-rose-700">{error}</p>}
          </form>
        </div>
        {found && <BookingDetail key={found.booking.code} b={found.booking} phone={found.phone} onPay={pay} payError={payError} />}
      </div>
    </div>
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
    } catch (err) { setError(describeError(err)); }
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
    catch (err) { setError(describeError(err)); }
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
            <div className="tw:flex tw:items-center tw:gap-4"><span className="tw:grid tw:size-14 tw:place-items-center tw:rounded-2xl tw:bg-blue-50 tw:text-blue-700"><UserRound size={25} /></span><div><span className={`${LABEL} tw:text-blue-600`}>Tài khoản người dùng</span><h1 className="tw:mt-1 tw:text-2xl tw:font-bold">{user.name}</h1><p className="tw:mt-1 tw:text-xs tw:text-slate-500">Tài khoản mô phỏng, chỉ lưu trong phiên này</p></div></div>
            <button type="button" onClick={logout} className="tw:flex tw:min-h-11 tw:items-center tw:gap-2 tw:rounded-xl tw:border tw:border-slate-300 tw:px-4 tw:text-xs tw:font-bold tw:text-slate-600"><LogOut size={16} /> Đăng xuất</button>
          </div>
          <div className="tw:mt-7 tw:rounded-2xl tw:bg-blue-50 tw:p-5"><div className="tw:flex tw:items-start tw:gap-3"><ShieldCheck className="tw:shrink-0 tw:text-blue-700" /><div><h2 className="tw:font-bold">Đây là tài khoản người dùng</h2><p className="tw:mt-2 tw:text-xs tw:leading-6 tw:text-slate-600">Tài khoản này không có quyền truy cập khu vực quản trị hay khách sạn. Bạn vẫn có thể đặt phòng không cần đăng nhập và tra cứu booking bằng mã xác minh.</p></div></div></div>
          <div className="tw:mt-6 tw:grid tw:gap-4 tw:sm:grid-cols-2"><button type="button" onClick={() => go('track')} className="tw:flex tw:min-h-28 tw:items-center tw:gap-4 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5 tw:text-left tw:hover:border-blue-300"><Search className="tw:text-blue-600" /><div><strong className="tw:text-sm">Theo dõi booking</strong><p className="tw:mt-1 tw:text-[10px] tw:text-slate-500">Tra cứu bằng mã và số điện thoại</p></div></button><button type="button" onClick={toStays} className="tw:flex tw:min-h-28 tw:items-center tw:gap-4 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5 tw:text-left tw:hover:border-blue-300"><CalendarDays className="tw:text-blue-600" /><div><strong className="tw:text-sm">Tìm nơi nghỉ</strong><p className="tw:mt-1 tw:text-[10px] tw:text-slate-500">Xem phòng gần HAN và SGN</p></div></button></div>
          <button type="button" onClick={() => go('home')} className="tw:mt-7 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white">Về trang chủ</button>
        </div>
      </div>
    </div>
  );
}
