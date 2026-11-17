import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, Clock3, Headphones, Hotel, LogOut, MapPin, Search, Send, ShieldCheck, Star, UserRound,
} from 'lucide-react';
import { useApp } from '../../state/store';
import { ATTACH, airportName, attachFile, createTicket, describeApiError, getHotel, getPaymentLink, listAirports, lookupBooking, lookupBookingFull, lookupGroup, lookupTicket, replyTicket, simulatePayment, simulateMomoPayment, simulateSepayPayment, readLastBooking, clearLastBooking, saveLastBooking, PAY_LABEL, changePassword, describeAuthError, listMyBookings, PASSWORD_MIN, PASSWORD_MAX } from '../../data/user';
import { money } from '../../lib/time';
import BookingActions from './BookingActions';
import ShuttleTracker from './ShuttleTracker';
import { endLabel, hhmm } from './HourlyPicker';
import { normalizeGroup, parseGroupQuery } from './groupLookup';
import { parseTrack, scrollToId, setTrackPrefill, takeSupportPrefill, takeTicketPrefill, takeTrackPrefill, statusCopy, statusTone } from './data';
import { EditProfile, MyTickets } from './AccountSections';
import { ACCOUNT_TABS, DEFAULT_TAB, tabLabel } from './accountTabs';
import { FavoritesPanel, NotificationsPanel, VouchersPanel } from './AccountExtras';

const PAGE = 'tw:min-h-screen tw:bg-slate-50 tw:px-5 tw:py-8 tw:sm:py-14';
const BACK = 'tw:inline-flex tw:items-center tw:gap-2 tw:text-xs tw:font-bold tw:text-blue-700';
const LABEL = 'tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[.16em]';
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

const dmy = (iso) => new Date(iso).toLocaleDateString('vi-VN');
// Dòng phòng theo giờ ghi rõ giờ vào - giờ ra; đơn toàn giờ ghi 'ngày, giờ vào → giờ ra' thay vì khoảng ngày.
const lineText = (l) => `${l.roomTypeName} × ${l.qty ?? 1}${l.kind === 'HOURLY' ? ` · theo giờ ${hhmm(l.startsAt)}–${endLabel(l.startsAt, l.endsAt)} ngày ${dmy(l.startsAt)} (${l.hours} giờ)` : ''}`;
const stayText = (b) => (b.stay.type === 'HOURLY' ? `${dmy(b.stay.from)}, ${hhmm(b.stay.from)} → ${endLabel(b.stay.from, b.stay.to)}` : `${dmy(b.stay.from)} → ${dmy(b.stay.to)}${b.stay.type === 'MIXED' ? ' (có phòng theo giờ)' : ''}`);

function PhoneGate({ onUnlock }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await onUnlock(new FormData(e.currentTarget).get('phone')); }
    catch (x) { setErr(x.status === 404 ? 'Số điện thoại không khớp với đơn này.' : describeApiError(x)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} data-testid="phone-gate" className="tw:mt-5 tw:grid tw:gap-3 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:p-4 tw:text-xs">
      <label className="tw:grid tw:gap-2 tw:font-semibold tw:text-slate-700">Cần thanh toán, hủy, đổi hoặc xem xe đưa đón? Nhập số điện thoại đã dùng khi đặt<input name="phone" type="tel" inputMode="tel" required pattern="[0-9+ ]{9,15}" autoComplete="tel" placeholder="0912345678" /></label>
      {err && <p role="alert" className="tw:rounded-lg tw:bg-rose-50 tw:p-2 tw:font-semibold tw:text-rose-700">{err}</p>}
      <button disabled={busy} className="tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:font-bold tw:text-white tw:disabled:opacity-60">{busy ? 'Đang xác minh…' : 'Xác minh số điện thoại'}</button>
    </form>
  );
}

function BookingDetail({ b, phone, track, onPay, payError, onRelookup, onUnlock }) {
  const go = useGo();
  const lines = b.lines?.length ? b.lines : [{ roomTypeName: b.roomTypeName, qty: b.qty ?? 1 }]; // đơn nhiều loại phòng: một dòng mỗi loại
  const rooms = lines.reduce((n, l) => n + (l.qty ?? 1), 0);
  return (
    <section className="tw:mt-6 tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:shadow-lg tw:sm:p-9">
      <div className="tw:flex tw:flex-col tw:justify-between tw:gap-4 tw:border-b tw:border-slate-100 tw:pb-6 tw:sm:flex-row tw:sm:items-center"><div><small className="tw:text-slate-500">Mã booking</small><h2 className="tw:mt-1 tw:text-xl tw:font-extrabold tw:tracking-wider">{b.code}</h2></div><span className={`tw:w-fit tw:rounded-full tw:px-4 tw:py-2 tw:text-[11px] tw:font-bold ${TONE[statusTone(b.status)]}`}>{statusCopy(b.status)}</span></div>
      <div className="tw:mt-6 tw:grid tw:gap-4 tw:sm:grid-cols-2">
        <div className="tw:flex tw:gap-3 tw:rounded-xl tw:bg-slate-50 tw:p-4"><Hotel className="tw:shrink-0 tw:text-blue-600" /><div><small className="tw:text-slate-500">Nơi nghỉ</small><p className="tw:mt-1 tw:text-sm tw:font-bold">{b.hotel?.name}</p><ul data-testid="detail-lines" className="tw:text-xs tw:text-slate-500">{lines.map((l, i) => <li key={`${l.roomTypeId ?? i}-${l.kind ?? 'NIGHT'}`}>{lineText(l)}</li>)}</ul><p data-testid="detail-guests" className="tw:mt-1 tw:text-xs tw:text-slate-600">{b.guests ?? 1} người{b.children > 0 ? ` (trong đó ${b.children} trẻ em)` : ''} · {rooms} phòng</p></div></div>
        <div className="tw:flex tw:gap-3 tw:rounded-xl tw:bg-slate-50 tw:p-4"><CalendarDays className="tw:shrink-0 tw:text-blue-600" /><div><small className="tw:text-slate-500">{b.stay.type === 'HOURLY' ? 'Thời gian ở (theo giờ)' : 'Thời gian lưu trú'}</small><p data-testid="detail-stay" className="tw:mt-1 tw:text-xs tw:font-bold">{stayText(b)}</p></div></div>
      </div>
      <div className="tw:mt-5 tw:divide-y tw:divide-slate-100 tw:rounded-xl tw:border tw:border-slate-200 tw:px-4 tw:text-xs"><div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Tiền phòng</span><span>{money(b.pricing.roomVnd)}</span></div>{b.pricing.shuttleVnd > 0 && <div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Xe đưa đón</span><span>{money(b.pricing.shuttleVnd)}</span></div>}<div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Phí dịch vụ</span><span>{money(b.pricing.serviceFeeVnd)}</span></div>{b.pricing.discountVnd > 0 && <div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Giảm giá</span><span>-{money(b.pricing.discountVnd)}</span></div>}<div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Tổng tiền</span><strong>{money(b.pricing.totalVnd)}</strong></div><div className="tw:flex tw:justify-between tw:py-3"><span className="tw:text-slate-500">Thanh toán</span><strong>{PAY_LABEL[b.payment.method] ?? b.payment.method} · {{ UNPAID: 'chưa thanh toán', PENDING: 'đang xử lý', PAID: 'đã thanh toán', REFUNDED: 'đã hoàn tiền' }[b.payment.status] ?? b.payment.status}</strong></div></div>
      <div className="tw:mt-5 tw:flex tw:items-start tw:gap-3 tw:rounded-xl tw:bg-blue-50 tw:p-4"><Clock3 className="tw:shrink-0 tw:text-blue-600" /><p className="tw:text-xs tw:leading-6 tw:text-slate-600"><strong className="tw:text-slate-900">Trạng thái hiện tại: {statusCopy(b.status)}.</strong><br />Trạng thái do khách sạn cập nhật và hiển thị tại đây.</p></div>
      {b.decision?.reason && <p className="tw:mt-4 tw:rounded-xl tw:bg-amber-50 tw:p-4 tw:text-xs tw:text-amber-900">Lý do: {b.decision.reason}</p>}
      {phone && b.status === 'PENDING_PAYMENT' && b.payment.method !== 'AT_HOTEL' && <button type="button" onClick={onPay} className="tw:mt-4 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:rounded-xl tw:bg-emerald-600 tw:text-xs tw:font-bold tw:text-white">Thanh toán / lấy lại liên kết {PAY_LABEL[b.payment.method]}</button>}
      {payError && <p role="alert" className="tw:mt-3 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{payError}</p>}
      {!phone && <PhoneGate onUnlock={onUnlock} />}
      {phone && <ShuttleTracker booking={b} phone={phone} initial={track} token={track.guestToken} onRelookup={onRelookup}>
        {(refresh) => <BookingActions booking={b} phone={phone} onShuttleChange={refresh} />}
      </ShuttleTracker>}
      <div className="tw:mt-6 tw:flex tw:flex-col tw:gap-3 tw:sm:flex-row"><button type="button" onClick={() => go('support')} className="tw:flex tw:min-h-11 tw:flex-1 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-blue-200 tw:text-xs tw:font-bold tw:text-blue-700"><ShieldCheck size={17} /> Yêu cầu hỗ trợ</button><span className="tw:flex tw:min-h-11 tw:flex-1 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-emerald-50 tw:text-xs tw:font-bold tw:text-emerald-700"><CheckCircle2 size={17} /> Đã xác minh thông tin</span></div>
    </section>
  );
}

export function Track() {
  const [found, setFound] = useState(null); // { booking, phone, track: { guestToken, stage, shuttles, events } }
  const [error, setError] = useState('');
  const [payError, setPayError] = useState('');
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState(null); // kết quả tra cứu mã nhóm NH-: { phone, ...normalizeGroup }
  // Từ trang tài khoản / đặt phòng xong: mã booking (+ SĐT). Mở lại trang giữa chừng: lấy đơn gần nhất trong phiên.
  const [prefill] = useState(() => { const q = takeTrackPrefill(); if (q) return q; const l = readLastBooking(); return l ? `${l.code} ${l.phone}` : ''; });
  const lookup = async (text) => {
    const g = parseGroupQuery(text);
    if (g.groupCode) { // mã nhóm: hỏi SĐT rồi xem cả nhóm
      setFound(null); setGroup(null); setPayError('');
      if (!g.phone) { setError('Nhập thêm số điện thoại của người đại diện, ví dụ NH-XXXXXXXX 0912345678.'); return; }
      setBusy(true);
      try { setGroup({ phone: g.phone, ...normalizeGroup(await lookupGroup(g.groupCode, g.phone)) }); setError(''); }
      catch (err) { setError(err.status === 404 ? 'Không tìm thấy nhóm khớp mã và số điện thoại này. Kiểm tra lại thông tin đã nhập.' : err.status === 422 ? 'Mã nhóm có dạng NH- cùng 8 ký tự (ví dụ NH-ABCD1234). Kiểm tra lại mã đã nhập.' : describeApiError(err)); }
      finally { setBusy(false); }
      return;
    }
    setGroup(null);
    const { ref, phone } = parseTrack(text);
    setPayError('');
    if (!ref) {
      setFound(null);
      setError('Nhập mã booking hợp lệ, dạng AR- cùng 8 ký tự (ví dụ AR-ABCD1234).');
      return;
    }
    setBusy(true);
    try { const { booking, ...track } = await lookupBookingFull(ref.toUpperCase(), phone); setFound({ booking, phone, track }); setError(''); }
    catch (err) { setFound(null); setError(describeApiError(err)); }
    finally { setBusy(false); }
  };
  const form = useRef(null);
  const submit = (e) => { e.preventDefault(); lookup(new FormData(e.currentTarget).get('query')); };
  const relookup = () => lookup(found?.phone ? `${found.booking.code} ${found.phone}` : form.current.elements.query.value);
  useEffect(() => { if (parseTrack(prefill).ref || (parseGroupQuery(prefill).groupCode && parseGroupQuery(prefill).phone)) lookup(prefill); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const unlock = async (phone) => { // khách nhập SĐT đã đặt để thanh toán/hủy/đổi/xem xe: tra lại đơn kèm SĐT
    const { booking, ...track } = await lookupBookingFull(found.booking.code, phone);
    setFound({ booking, phone, track });
  };
  const pay = async () => {
    setPayError('');
    try { const link = await getPaymentLink(found.booking.code, found.phone); saveLastBooking(found.booking.code, found.phone); window.location.assign(link.payUrl); }
    catch (err) { setPayError(describeApiError(err)); }
  };

  return (
    <div className={PAGE}>
      <div className="tw:mx-auto tw:max-w-3xl">
        <Back />
        <div className="tw:mt-6 tw:overflow-hidden tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:shadow-xl">
          <div className="tw:bg-[#062253] tw:px-6 tw:py-8 tw:text-white tw:sm:px-9"><span className="tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[.16em] tw:text-blue-200">Tra cứu nhanh</span><h1 className="tw:mt-2 tw:text-3xl tw:font-bold tw:tracking-tight">Theo dõi booking</h1><p className="tw:mt-3 tw:max-w-xl tw:text-xs tw:leading-6 tw:text-blue-100">Nhập mã booking để xem trạng thái đơn, không cần đăng nhập.</p></div>
          <form ref={form} onSubmit={submit} className="tw:grid tw:gap-4 tw:p-6 tw:sm:p-9">
            <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mã booking<input name="query" required autoComplete="off" defaultValue={prefill} placeholder="AR-XXXXXXXX" /></label>
            <p className="tw:-mt-2 tw:text-[11px] tw:leading-4 tw:text-slate-500">Chỉ cần mã booking, ví dụ AR-XXXXXXXX. Mã nhóm NH-XXXXXXXX cần thêm số điện thoại của người đại diện.</p>
            <button disabled={busy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60"><Search size={17} /> {busy ? 'Đang tra cứu…' : 'Tra cứu booking'}</button>
            {error && <p role="alert" className="tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-semibold tw:text-rose-700">{error}</p>}
          </form>
        </div>
        {group && (
          <section className="tw:mt-6 tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:shadow-lg tw:sm:p-9" data-testid="group-result">
            <small className="tw:text-slate-500">Mã nhóm</small><h2 className="tw:mt-1 tw:text-xl tw:font-extrabold tw:tracking-wider">{group.code || parseGroupQuery(form.current?.elements.query.value).groupCode}</h2>
            {!group.rooms.length && <p className="tw:mt-4 tw:text-xs tw:text-slate-500">Nhóm chưa có phòng nào.</p>}
            <ul className="tw:mt-4 tw:grid tw:gap-3">
              {group.rooms.map((r) => (
                <li key={r.key} className="tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-xs" data-testid="group-room">
                  <div className="tw:flex tw:items-center tw:justify-between tw:gap-3"><strong className="tw:text-sm">{r.guest || 'Phòng nghỉ'}{r.members > 1 && ` + ${r.members - 1} người`}</strong><span className={`tw:rounded-full tw:px-3 tw:py-1 tw:text-[11px] tw:font-bold ${TONE[r.tone]} ${r.needsStaff ? 'tw:ring-2 tw:ring-rose-400' : ''}`}>{r.label}</span></div>
                  {r.confirmed ? (
                    <div className="tw:mt-2 tw:space-y-1 tw:text-slate-600">
                      <p>{r.hotelName}{r.roomNumbers.length > 0 && <> · phòng {r.roomNumbers.join(', ')}</>}</p>
                      {r.checkInAt && <p>Giờ ở: {dmyHm(r.checkInAt)}{r.checkOutAt && <> → phải rời khách sạn lúc {dmyHm(r.checkOutAt)}</>}</p>}
                      {r.bookingCode && <button type="button" className="tw:font-bold tw:text-blue-700 tw:underline" onClick={() => { form.current.elements.query.value = `${r.bookingCode} ${group.phone}`; lookup(form.current.elements.query.value); }} data-testid="group-booking-link">Mã đơn {r.bookingCode}: xem chi tiết</button>}
                    </div>
                  ) : r.needsStaff ? <p className="tw:mt-2 tw:font-bold tw:text-rose-700">Nhóm của bạn cần nhân viên sân bay hỗ trợ. Vui lòng liên hệ nhân viên sân bay.</p> : null}
                </li>))}
            </ul>
          </section>
        )}
        {found && <BookingDetail key={found.booking.code} b={found.booking} phone={found.phone} track={found.track} onPay={pay} payError={payError} onRelookup={relookup} onUnlock={unlock} />}
      </div>
    </div>
  );
}

// Chọn ảnh/video đính kèm cho một ticket: tải lần lượt từng tệp, báo kết quả riêng từng tệp (lỗi một tệp không chặn tệp khác).
function AttachPicker({ code, phone, onDone }) {
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    setBusy(true); setLog([]);
    const out = [];
    for (const f of files) {
      try { await attachFile(code, phone, f); out.push({ ok: true, text: `Đã gửi: ${f.name}` }); } catch (err) { out.push({ ok: false, text: `${f.name}: ${describeApiError(err)}` }); }
      setLog([...out]);
    }
    setBusy(false);
    await onDone?.().catch(() => {});
  };
  return (
    <div>
      <label className="tw:inline-flex tw:min-h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-xl tw:border tw:border-slate-300 tw:px-4 tw:text-xs tw:font-bold tw:text-slate-700"><input type="file" multiple accept={ATTACH.accept} onChange={pick} disabled={busy} className="tw:sr-only" data-testid="attach-input" />{busy ? 'Đang tải tệp…' : 'Đính kèm ảnh/video'}</label>
      <p className="tw:mt-1 tw:text-[11px] tw:text-slate-500">{ATTACH.hint} Vui lòng không gửi giấy tờ tùy thân.</p>
      {log.map((l, i) => <p key={i} role={l.ok ? 'status' : 'alert'} className={`tw:mt-1 tw:text-[11px] tw:font-semibold ${l.ok ? 'tw:text-emerald-700' : 'tw:text-rose-700'}`}>{l.text}</p>)}
    </div>
  );
}

const TICKET_STATUS = { OPEN: ['Đang mở', 'wait'], IN_PROGRESS: ['Đang xử lý', 'wait'], RESOLVED: ['Đã giải quyết', 'ok'] };
const dmyHm = (iso) => new Date(iso).toLocaleString('vi-VN', { hour12: false, dateStyle: 'short', timeStyle: 'short' });

// Tra cứu ticket bằng mã SP-XXXXXXXX + SĐT, xem hội thoại và trả lời (backend: /v1/support/lookup, /v1/support/reply).
function TicketLookup({ initialCode = '', initialPhone = '' }) {
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
  // Mở từ 'Yêu cầu hỗ trợ của tôi': đã biết mã + SĐT nên tra luôn.
  useEffect(() => {
    if (!initialCode || !initialPhone) return;
    setBusy(true);
    lookupTicket(initialCode, initialPhone).then((ticket) => setT({ ticket, phone: initialPhone })).catch((err) => setError(describeApiError(err))).finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
        <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số điện thoại<input name="phone" type="tel" inputMode="tel" required defaultValue={initialPhone} autoComplete="tel" placeholder="0912345678" /></label>
        <button disabled={busy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60"><Search size={16} /> {busy ? 'Đang tra cứu…' : 'Tra cứu'}</button>
      </form>
      {error && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{error}</p>}
      {tk && (
        <div className="tw:mt-6 tw:border-t tw:border-slate-100 tw:pt-6">
          <div className="tw:flex tw:flex-col tw:justify-between tw:gap-3 tw:sm:flex-row tw:sm:items-center"><div><small className="tw:text-slate-500">Ticket {tk.code}{tk.bookingCode ? ` · booking ${tk.bookingCode}` : ''}</small><h3 className="tw:mt-1 tw:font-bold">{tk.subject}</h3></div><span className={`tw:w-fit tw:rounded-full tw:px-4 tw:py-2 tw:text-[11px] tw:font-bold ${TONE[stTone]}`}>{stLabel}</span></div>
          <p className="tw:mt-1 tw:text-[11px] tw:text-slate-500">Gửi lúc {dmyHm(tk.createdAt)}{tk.resolvedAt ? ` · giải quyết lúc ${dmyHm(tk.resolvedAt)}` : ''}</p>
          {tk.messages?.length ? (
            <ul className="tw:mt-4 tw:space-y-3" aria-label="Hội thoại">{tk.messages.map((m, i) => <li key={i} className={`tw:flex ${m.from === 'GUEST' ? 'tw:justify-end' : 'tw:justify-start'}`}><div className={`tw:max-w-[88%] tw:rounded-2xl tw:px-4 tw:py-3 tw:text-xs tw:leading-5 ${m.from === 'GUEST' ? 'tw:bg-blue-600 tw:text-white' : 'tw:bg-slate-100 tw:text-slate-800'}`}><strong className="tw:block tw:text-[11px] tw:opacity-80">{m.from === 'GUEST' ? 'Bạn' : 'Nhân viên hỗ trợ'} · {dmyHm(m.createdAt)}</strong><p className="tw:mt-1 tw:whitespace-pre-line tw:break-words">{m.body}</p></div></li>)}</ul>
          ) : <p className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-xs tw:text-slate-500">Chưa có tin nhắn nào.</p>}
          {tk.attachments?.length > 0 && <ul className="tw:mt-4 tw:grid tw:gap-2 tw:text-xs" aria-label="Tệp đính kèm">{tk.attachments.map((a) => <li key={a.id} className="tw:rounded-xl tw:bg-slate-50 tw:p-3">{a.url ? (a.contentType.startsWith('video/') ? <video src={a.url} controls preload="none" className="tw:max-h-48 tw:w-full tw:rounded-lg" /> : <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="Ảnh đính kèm" loading="lazy" className="tw:max-h-48 tw:rounded-lg" /></a>) : <span>{a.contentType} · {(a.sizeBytes / 1048576).toFixed(1)} MB</span>}</li>)}</ul>}
          {!closed && <div className="tw:mt-4"><AttachPicker code={tk.code} phone={t.phone} onDone={async () => setT({ ticket: await lookupTicket(tk.code, t.phone), phone: t.phone })} /></div>}
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
  const [pre] = useState(() => takeSupportPrefill() ?? {});
  const [tp] = useState(takeTicketPrefill); // ticket mở từ trang Tài khoản

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
            <div className="tw:grid tw:place-items-center tw:p-8 tw:text-center"><div><span className="tw:mx-auto tw:grid tw:size-16 tw:place-items-center tw:rounded-full tw:bg-emerald-50 tw:text-emerald-600"><Check size={30} /></span><h2 className="tw:mt-5 tw:text-2xl tw:font-bold">Đã tiếp nhận yêu cầu</h2><p className="tw:mt-3 tw:text-xs tw:leading-6 tw:text-slate-500">Mã ticket của bạn là</p><p className="tw:mt-2 tw:text-xl tw:font-extrabold tw:tracking-wider tw:text-blue-700">{ticket}</p><p className="tw:mt-2 tw:text-[11px] tw:text-slate-500">Lưu mã này cùng số điện thoại để theo dõi phản hồi.</p><button type="button" onClick={() => setTicket('')} className="tw:mt-6 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:py-3 tw:text-xs tw:font-bold tw:text-white">Tạo ticket khác</button></div></div>
          ) : (
            <form onSubmit={submit} className="tw:grid tw:gap-4 tw:p-6 tw:sm:grid-cols-2 tw:sm:p-9">
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Họ và tên<input name="fullName" required minLength={2} maxLength={100} autoComplete="name" /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Số điện thoại<input name="phone" type="tel" inputMode="tel" required pattern="[0-9+ ]{9,15}" title="Từ 9 đến 15 chữ số" autoComplete="tel" defaultValue={pre.phone} /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Email (không bắt buộc)<input name="email" type="email" maxLength={200} autoComplete="email" /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700">Mã booking (nếu có)<input name="bookingCode" pattern="[Aa][Rr]-[0-9A-Za-z]{8}|" title="Dạng AR-7K3M9P2Q" maxLength={11} className="tw:uppercase" defaultValue={pre.bookingCode} /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Tiêu đề<input name="subject" required minLength={3} maxLength={150} defaultValue={pre.subject} /></label>
              <label className="tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Mô tả<textarea name="message" required minLength={3} maxLength={2000} rows={6} /></label>
              <button disabled={busy} className="tw:flex tw:min-h-11 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60 tw:sm:col-span-2"><Send size={16} /> {busy ? 'Đang gửi…' : 'Gửi yêu cầu hỗ trợ'}</button>
              {error && <p role="alert" className="tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:text-rose-700 tw:sm:col-span-2">{error}</p>}
            </form>
          )}
        </div>
        <TicketLookup key={ticket || tp?.code} initialCode={ticket || tp?.code || ''} initialPhone={ticket ? '' : tp?.phone ?? ''} />
      </div>
    </div>
  );
}

// Trang cổng thanh toán (VNPay/MoMo) đưa khách về (*_RETURN_URL = /payment/result). KHÔNG tin query: kết quả thật lấy bằng tra cứu đơn
// ({code, phone} lưu lúc đặt); IPN phía máy chủ có thể đến chậm nên tự thử lại vài lần. mock=1: cho bấm giả lập thành công/thất bại.
const POLL_MS = 8000;
const POLL_MAX = 4; // ~32 giây, dưới giới hạn 10 yêu cầu/phút
export function PaymentResult() {
  const q = new URLSearchParams(window.location.search);
  const sepay = q.get('gateway') === 'sepay';
  const momo = !sepay && (q.get('gateway') === 'momo' || (q.has('resultCode') && q.has('orderId')));
  const gate = sepay ? 'SePay' : momo ? 'MoMo' : 'VNPay';
  const mockOrder = q.get('mock') === '1' ? q.get('orderId') : null;
  const queryCode = sepay ? q.get('status') : momo ? q.get('resultCode') : q.get('vnp_ResponseCode');
  const hint = queryCode == null ? null : (queryCode === (sepay ? 'success' : momo ? '0' : '00') ? 'ok' : 'fail'); // chưa xác thực; kết quả thật chỉ đến từ IPN
  const [saved] = useState(readLastBooking);
  const [info, setInfo] = useState({ s: saved ? 'loading' : 'none', booking: null }); // loading | done | error | none
  const [simFail, setSimFail] = useState(false);
  const [simulated, setSimulated] = useState(!mockOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tries = useRef(0);
  const toTrack = () => window.location.assign('/tra-cuu');

  const check = async () => {
    if (!saved) return;
    tries.current += 1;
    setInfo((v) => ({ ...v, s: 'loading' }));
    try {
      const booking = await lookupBooking(saved.code, saved.phone);
      if (booking.status !== 'PENDING_PAYMENT') clearLastBooking();
      setInfo({ s: 'done', booking });
    } catch (err) { setInfo((v) => ({ ...v, s: 'error', msg: describeApiError(err) })); }
  };
  useEffect(() => { check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const status = info.booking?.status;
  const waiting = info.s === 'done' && status === 'PENDING_PAYMENT';
  const stopPoll = simFail || hint === 'fail';
  useEffect(() => {
    if (!waiting || !simulated || stopPoll || tries.current >= POLL_MAX) return undefined;
    const t = setTimeout(check, POLL_MS);
    return () => clearTimeout(t);
  }, [info, simulated, stopPoll]); // eslint-disable-line react-hooks/exhaustive-deps

  const simulate = async (success) => {
    setBusy(true); setError('');
    try {
      await (sepay ? simulateSepayPayment : momo ? simulateMomoPayment : simulatePayment)(mockOrder, success);
      setSimFail(!success); setSimulated(true); tries.current = 0;
      await check();
    } catch (err) { setError(describeApiError(err)); }
    finally { setBusy(false); }
  };
  const regetLink = async () => {
    setBusy(true); setError('');
    try { window.location.assign((await getPaymentLink(saved.code, saved.phone)).payUrl); }
    catch (err) { setError(describeApiError(err)); setBusy(false); }
  };

  const ok = info.s === 'done' && (statusTone(status) === 'ok' || status === 'PENDING');
  const failed = info.s === 'done' && statusTone(status) === 'bad';
  const pendingTimeout = waiting && (tries.current >= POLL_MAX || stopPoll);
  const BOX_OK = 'tw:mt-4 tw:rounded-xl tw:bg-emerald-50 tw:p-4 tw:text-sm tw:text-emerald-800';
  const BOX_BAD = 'tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-sm tw:text-rose-800';
  const BOX_WAIT = 'tw:mt-4 tw:rounded-xl tw:bg-amber-50 tw:p-4 tw:text-sm tw:text-amber-900';
  const BTN2 = 'tw:mt-3 tw:min-h-11 tw:w-full tw:rounded-xl tw:border tw:border-slate-300 tw:text-xs tw:font-bold tw:disabled:opacity-60';

  return (
    <div className={PAGE}>
      <div className="tw:mx-auto tw:max-w-xl tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-8 tw:text-center tw:shadow-xl">
        <h1 className="tw:text-2xl tw:font-bold">Kết quả thanh toán {gate}</h1>
        {saved && <p className="tw:mt-2 tw:text-xs tw:text-slate-500">Mã booking: <strong>{saved.code}</strong></p>}
        {mockOrder && !ok && !failed && (
          <div className="tw:mt-4">
            <p className="tw:rounded-xl tw:bg-amber-50 tw:p-4 tw:text-sm tw:text-amber-900">Cổng thanh toán giả lập (không phát sinh giao dịch thật). Mã giao dịch: <strong>{mockOrder}</strong></p>
            <div className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2"><button type="button" disabled={busy} onClick={() => simulate(true)} className="tw:min-h-11 tw:rounded-xl tw:bg-emerald-600 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60">Giả lập thanh toán thành công</button><button type="button" disabled={busy} onClick={() => simulate(false)} className="tw:min-h-11 tw:rounded-xl tw:border tw:border-slate-300 tw:text-xs tw:font-bold tw:disabled:opacity-60">Giả lập thất bại</button></div>
          </div>
        )}
        {info.s === 'loading' && <p role="status" className={BOX_WAIT}>Đang kiểm tra trạng thái đơn…</p>}
        {info.s === 'error' && <p role="alert" className={BOX_BAD}>Chưa kiểm tra được trạng thái đơn: {info.msg}</p>}
        {ok && <p role="status" className={BOX_OK}>Thanh toán thành công. Trạng thái đơn: <strong>{statusCopy(status)}</strong>.</p>}
        {failed && <p role="alert" className={BOX_BAD}>Đơn <strong>{statusCopy(status)}</strong> nên chưa thanh toán được. Hãy đặt lại phòng, hoặc vào “Theo dõi booking” bằng mã booking và số điện thoại để xem chi tiết.</p>}
        {waiting && !pendingTimeout && <p role="status" className={BOX_WAIT}>Đang chờ xác nhận thanh toán từ {gate}. Trang sẽ tự kiểm tra lại, hoặc bấm “Kiểm tra lại”.</p>}
        {pendingTimeout && (simFail || hint === 'fail'
          ? <p role="alert" className={BOX_BAD}>Thanh toán chưa thành công. Đơn vẫn được giữ chỗ trong thời gian ngắn; bạn có thể thử thanh toán lại bằng nút bên dưới hoặc trong “Theo dõi booking”.</p>
          : <p role="status" className={BOX_WAIT}>Đơn vẫn đang chờ xác nhận thanh toán. Nếu bạn đã thanh toán, hãy kiểm tra lại sau ít phút trong “Theo dõi booking”; nếu chưa, bạn có thể lấy lại liên kết thanh toán.</p>)}
        {info.s === 'none' && (
          <>
            <p className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-sm tw:text-slate-600">Chưa có thông tin đơn trên thiết bị này nên chưa thể xác nhận kết quả. Hãy nhập mã booking và số điện thoại trong “Theo dõi booking” để xem trạng thái thật.</p>
            {hint && <p className="tw:mt-3 tw:text-xs tw:text-slate-500">Cổng ghi nhận mã kết quả “{queryCode}” ({hint === 'ok' ? 'có vẻ thành công' : 'có vẻ chưa thành công'}), thông tin này chưa được xác thực.</p>}
          </>
        )}
        {error && <p role="alert" className="tw:mt-3 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{error}</p>}
        {saved && info.s !== 'loading' && !ok && !failed && <button type="button" disabled={busy} onClick={() => { tries.current = 0; check(); }} className={BTN2}>Kiểm tra lại</button>}
        {saved && waiting && (pendingTimeout || mockOrder) && <button type="button" disabled={busy} onClick={regetLink} className={BTN2}>Thanh toán lại / lấy lại liên kết</button>}
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
                <span className="tw:min-w-0"><strong className="tw:block tw:text-sm tw:tracking-wider">{b.code}</strong><span className="tw:mt-1 tw:block tw:truncate tw:text-xs tw:text-slate-600">{b.hotel?.name}</span><span className="tw:mt-1 tw:block tw:text-[11px] tw:text-slate-500">{dmy(b.stay.from)} → {dmy(b.stay.to)}{b.guests ? ` · ${b.guests} người` : ''}</span></span>
                <span className={`tw:w-fit tw:shrink-0 tw:rounded-full tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-bold ${TONE[statusTone(b.status)]}`}>{statusCopy(b.status)}</span>
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
  const tab = state.partnerTab || DEFAULT_TAB; // /tai-khoan/<mục>
  const pick = (id) => { dispatch({ type: 'route', screen: 'account', partnerTab: id }); window.scrollTo({ top: 0 }); };
  const logout = () => { dispatch({ type: 'logout' }); dispatch({ type: 'go', screen: 'home' }); };

  if (!user) {
    return <div className={PAGE}><div className="tw:mx-auto tw:max-w-3xl"><Back /><div className="tw:mt-6 tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-8 tw:text-center tw:shadow-xl"><h1 className="tw:text-xl tw:font-bold">Bạn chưa đăng nhập</h1><p className="tw:mt-2 tw:text-xs tw:text-slate-500">Đăng nhập để xem hồ sơ, đơn đặt phòng, mã giảm giá và khiếu nại.</p><button type="button" onClick={() => go('login')} className="tw:mt-5 tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-6 tw:text-xs tw:font-bold tw:text-white">Đăng nhập</button></div></div></div>;
  }
  const initial = (user.name || user.username || '?').trim().charAt(0).toUpperCase();
  const ITEM = 'tw:flex tw:min-h-11 tw:shrink-0 tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:px-3 tw:text-sm tw:font-semibold';
  return (
    <div className="tw:min-h-screen tw:bg-slate-50 tw:px-4 tw:py-6 tw:sm:py-10">
      <div className="tw:mx-auto tw:grid tw:max-w-[1080px] tw:items-start tw:gap-5 tw:md:grid-cols-[240px_1fr]">
        <aside aria-label="Menu tài khoản" className="tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-3 tw:shadow-sm tw:md:sticky tw:md:top-24">
          <div className="tw:hidden tw:items-center tw:gap-3 tw:border-b tw:border-slate-100 tw:px-2 tw:pb-3 tw:pt-1 tw:md:flex">
            <span className="tw:grid tw:size-10 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-blue-600 tw:font-extrabold tw:text-white">{initial}</span>
            <strong className="tw:min-w-0 tw:truncate tw:text-sm">{user.name}</strong>
          </div>
          <nav className="tw:flex tw:gap-2 tw:overflow-x-auto tw:md:mt-3 tw:md:flex-col">
            {ACCOUNT_TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => pick(id)} aria-current={tab === id ? 'page' : undefined} data-testid={`acc-tab-${id}`} className={`${ITEM} ${tab === id ? 'tw:border-blue-300 tw:bg-blue-50 tw:text-blue-700' : 'tw:border-transparent tw:text-slate-700 tw:hover:bg-slate-50'}`}><Icon size={17} />{label}</button>
            ))}
            <button type="button" onClick={logout} data-testid="account-logout" className={`${ITEM} tw:border-transparent tw:text-rose-600 tw:hover:bg-rose-50 tw:md:mt-2`}><LogOut size={17} />Đăng xuất</button>
          </nav>
        </aside>
        <div className="tw:min-w-0">
          <header className="tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-5 tw:shadow-sm tw:sm:p-7">
            <p className="tw:text-xs tw:text-slate-500">Tài khoản của tôi <span aria-hidden="true">›</span> <strong className="tw:text-slate-800">{tabLabel(tab)}</strong></p>
            <h1 className="tw:mt-1 tw:text-2xl tw:font-extrabold">{tabLabel(tab)}</h1>
          </header>
          <div data-testid={`acc-${tab}`} className="tw:mt-4 tw:rounded-3xl tw:border tw:border-slate-200 tw:bg-white tw:p-5 tw:shadow-sm tw:sm:p-7 tw:[&>section:first-child]:mt-0 tw:[&>section:first-child]:border-0 tw:[&>section:first-child]:pt-0">
            {tab === 'don-dat-phong' ? <MyBookings />
              : tab === 'ma-giam-gia' ? <VouchersPanel />
              : tab === 'khieu-nai' ? <MyTickets />
              : tab === 'thong-bao' ? <NotificationsPanel />
              : tab === 'yeu-thich' ? <FavoritesPanel />
              : (
                <>
                  <dl className="tw:grid tw:gap-3 tw:text-sm tw:sm:grid-cols-2" data-testid="account-info">
                    <div className="tw:rounded-xl tw:bg-slate-50 tw:p-4"><dt className="tw:text-[11px] tw:text-slate-500">Họ và tên</dt><dd className="tw:mt-1 tw:break-words tw:font-bold">{user.fullName || user.username}</dd></div>
                    <div className="tw:rounded-xl tw:bg-slate-50 tw:p-4"><dt className="tw:text-[11px] tw:text-slate-500">Tên đăng nhập</dt><dd className="tw:mt-1 tw:break-all tw:font-bold">{user.username}</dd></div>
                    <div className="tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:sm:col-span-2"><dt className="tw:text-[11px] tw:text-slate-500">Email</dt><dd className="tw:mt-1 tw:break-all tw:font-bold" data-testid="account-email">{user.email || <span className="tw:font-normal tw:text-slate-400">Chưa có email</span>}</dd></div>
                  </dl>
                  <EditProfile />
                  <ChangePassword />
                </>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
