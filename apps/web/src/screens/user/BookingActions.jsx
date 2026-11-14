import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Car, RefreshCw, X } from 'lucide-react';
import { createChangeRequest, describeApiError, createShuttle, listAirports, listChangeRequests, quoteCancel, quoteShuttle } from '../../data/user';
import { money } from '../../lib/time';
import Select from '../../components/Select';

const BOX = 'tw:mt-6 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5';
const BTN = 'tw:min-h-11 tw:rounded-xl tw:px-4 tw:text-xs tw:font-bold tw:disabled:opacity-60';
const REASONS = { CHANGE_OF_PLAN: 'Thay đổi kế hoạch', FLIGHT_CANCELLED: 'Chuyến bay bị hủy', FLIGHT_RESCHEDULED: 'Chuyến bay đổi giờ', HEALTH: 'Sức khỏe', OTHER: 'Lý do khác' };
const REQ_STATUS = { PENDING: 'Chờ khách sạn duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Bị từ chối' };
const TIER = { FREE: 'Hủy miễn phí', PARTIAL: 'Phí một phần', LATE: 'Hủy sát giờ' };
const DIRECTION = { TO_HOTEL: 'Sân bay → khách sạn', TO_AIRPORT: 'Khách sạn → sân bay' };
const ERR_VI = {
  QUOTE_STALE: 'Xe đưa đón của đơn vừa thay đổi nên số tiền hoàn đã đổi. Hãy bấm "Xem phí hủy" để xem lại rồi gửi yêu cầu.',
};
const viErr = (e) => ERR_VI[e?.code] ?? describeApiError(e);
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const dmy = (iso) => new Date(iso).toLocaleDateString('vi-VN');

function Msg({ ok, children }) {
  return children ? <p role={ok ? 'status' : 'alert'} className={`tw:mt-3 tw:rounded-xl tw:p-3 tw:text-xs tw:font-semibold ${ok ? 'tw:bg-emerald-50 tw:text-emerald-800' : 'tw:bg-rose-50 tw:text-rose-700'}`}>{children}</p> : null;
}

// Hủy / đổi ngày và xe đưa đón của một booking (xác thực bằng mã + SĐT đã nhập ở trang theo dõi).
// Danh sách/hủy xe nằm ở ShuttleTracker (dữ liệu sống); ở đây chỉ còn form đặt xe, xong gọi onShuttleChange để màn theo dõi làm mới.
export default function BookingActions({ booking, phone, onShuttleChange }) {
  const code = booking.code;
  const live = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'].includes(booking.status);
  const hasHourly = booking.lines?.some((l) => l.kind === 'HOURLY'); // đơn có phòng theo giờ chưa hỗ trợ đổi ngày (chỉ hủy)
  const rideable = ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status);
  const [requests, setRequests] = useState([]);
  const [type, setType] = useState('CANCEL');
  const [quote, setQuote] = useState(null);
  const [sq, setSq] = useState(null);
  const [msg, setMsg] = useState({ ok: false, text: '' });
  const [smsg, setSmsg] = useState({ ok: false, text: '' });
  const [busy, setBusy] = useState(false);
  const [airports, setAirports] = useState([]);
  useEffect(() => { listAirports().then(setAirports).catch(() => setAirports([])); }, []);

  // Mỗi danh sách tự tải lại riêng sau thao tác của nó: tra cứu bị giới hạn 10 yêu cầu/phút/IP nên không tải thừa.
  const loadReq = useCallback(() => listChangeRequests(code, phone).then(setRequests).catch(() => setRequests([])), [code, phone]);
  useEffect(() => { loadReq(); }, [loadReq]);

  const run = async (fn, setM) => { setBusy(true); setM({ ok: false, text: '' }); try { await fn(); } catch (e) { if (e?.code === 'QUOTE_STALE') setQuote(null); setM({ ok: false, text: viErr(e) }); } finally { setBusy(false); } };

  // Modal 'Hủy hoặc đổi ngày': Esc / nút X / bấm nền đều đóng, trả focus về nút mở, khóa cuộn nền.
  const [open, setOpen] = useState(false);
  const opener = useRef(null);
  const dlg = useRef(null);
  const close = useCallback(() => { setOpen(false); opener.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dlg.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab' || !dlg.current) return;
      const f = [...dlg.current.querySelectorAll(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  const showQuote = () => run(async () => setQuote(await quoteCancel(code, phone)), setMsg);
  const submitRequest = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    const body = { type, code, phone, reasonCode: d.reasonCode, ...(d.reasonNote?.trim() && { reasonNote: d.reasonNote.trim() }) };
    if (type === 'CHANGE') {
      const todayIso = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // ngày hôm nay theo giờ VN
      if (d.newFrom < todayIso) { setMsg({ ok: false, text: 'Ngày nhận phòng mới không được ở quá khứ.' }); return; }
      if (d.newTo <= d.newFrom) { setMsg({ ok: false, text: 'Ngày trả phòng mới phải sau ngày nhận phòng mới.' }); return; }
    }
    if (type === 'CHANGE') Object.assign(body, { newFrom: new Date(`${d.newFrom}T14:00:00+07:00`), newTo: new Date(`${d.newTo}T12:00:00+07:00`) });
    run(async () => { await createChangeRequest(body); setOpen(false); opener.current?.focus(); setMsg({ ok: true, text: 'Đã gửi yêu cầu. Khách sạn sẽ xem xét và trạng thái hiện ở danh sách bên dưới.' }); setQuote(null); await loadReq(); await onShuttleChange?.(); }, setMsg);
  };

  const shuttleBody = (form) => { const d = Object.fromEntries(new FormData(form).entries()); return { code, phone, direction: d.direction, airport: d.airport, pickupAt: new Date(d.pickupAt), ...(d.location?.trim() && { location: d.location.trim() }) }; };
  const askShuttle = (e) => { const form = e.currentTarget.form; if (form.reportValidity()) run(async () => { const b = shuttleBody(form); setSq(await quoteShuttle(b)); }, setSmsg); };
  const bookShuttle = (e) => { e.preventDefault(); run(async () => { await createShuttle(shuttleBody(e.currentTarget)); setSmsg({ ok: true, text: 'Đã gửi yêu cầu xe đưa đón.' }); setSq(null); await onShuttleChange?.(); }, setSmsg); };

  return (
    <>
      {live && (
        <section className={BOX} aria-label="Hủy hoặc đổi ngày">
          <h3 className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-bold"><RefreshCw size={16} /> Hủy hoặc đổi ngày</h3>
          {requests.length > 0 && <ul className="tw:mt-3 tw:space-y-2 tw:text-xs">{requests.map((r) => <li key={r.id} className="tw:rounded-xl tw:bg-slate-50 tw:p-3"><strong>{r.type === 'CANCEL' ? 'Yêu cầu hủy' : `Đổi ngày → ${dmy(r.newFrom)} - ${dmy(r.newTo)}`}</strong> · {REQ_STATUS[r.status] ?? r.status}{r.decisionNote ? ` · ${r.decisionNote}` : ''}{r.refund ? ` · hoàn ${money(r.refund.amountVnd)}` : ''}</li>)}</ul>}
          <button ref={opener} type="button" onClick={() => { setMsg({ ok: false, text: '' }); setOpen(true); }} data-testid="open-change-modal" aria-haspopup="dialog" className={`${BTN} tw:mt-4 tw:border tw:border-slate-300`}>Hủy hoặc đổi ngày</button>
          {!open && <Msg ok={msg.ok}>{msg.text}</Msg>}
          {open && (
            <div className="tw:fixed tw:inset-0 tw:z-[100] tw:grid tw:place-items-end tw:bg-slate-950/75 tw:backdrop-blur-sm tw:sm:place-items-center tw:sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="change-backdrop">
              <div ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Hủy hoặc đổi ngày" data-testid="change-modal" className="tw:max-h-[96dvh] tw:w-full tw:overflow-y-auto tw:rounded-t-3xl tw:bg-white tw:p-5 tw:shadow-2xl tw:outline-none tw:sm:max-w-xl tw:sm:rounded-3xl tw:sm:p-7">
                <div className="tw:flex tw:items-start tw:justify-between tw:gap-3"><h2 className="tw:text-xl tw:font-bold">Hủy hoặc đổi ngày</h2><button type="button" onClick={close} aria-label="Đóng" data-testid="change-close" className="tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-slate-100"><X size={18} /></button></div>
          <form onSubmit={submitRequest} className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Loại yêu cầu<Select value={type} onChange={(e) => { setType(e.target.value); setQuote(null); }}><option value="CANCEL">Hủy đặt phòng</option><option value="CHANGE" disabled={hasHourly}>Đổi ngày lưu trú{hasHourly ? ' (không áp dụng cho đơn theo giờ)' : ''}</option></Select></label>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Lý do<Select name="reasonCode">{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
            {type === 'CHANGE' && <><label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Nhận phòng mới<input name="newFrom" type="date" required /></label><label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Trả phòng mới<input name="newTo" type="date" required /></label></>}
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Ghi chú (bắt buộc nếu chọn lý do khác)<input name="reasonNote" maxLength={500} /></label>
            {type === 'CANCEL' && quote && <p className="tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900 tw:sm:col-span-2">{TIER[quote.tier] ?? quote.tier}: phí giữ lại <strong>{money(quote.keepVnd)}</strong>, hoàn lại <strong>{money(quote.refundVnd)}</strong>.{quote.shuttleKeepVnd > 0 && <span data-testid="quote-shuttle"> Trong đó phí xe đưa đón <strong>{money(quote.shuttleKeepVnd)}</strong> được giữ lại và không hoàn (khách không đi xe thì không hoàn phí xe).</span>}</p>}
            <div className="tw:flex tw:flex-wrap tw:gap-3 tw:sm:col-span-2">
              {type === 'CANCEL' && <button type="button" disabled={busy} onClick={showQuote} className={`${BTN} tw:border tw:border-slate-300`}>Xem phí hủy</button>}
              <button disabled={busy} className={`${BTN} tw:bg-blue-600 tw:text-white`}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
            </div>
          </form>
                <Msg ok={msg.ok}>{msg.text}</Msg>
              </div>
            </div>
          )}
        </section>
      )}

      {rideable && (
        <section className={BOX} aria-label="Xe đưa đón">
          <h3 className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-bold"><Car size={16} /> Xe đưa đón</h3>
          <form onSubmit={bookShuttle} className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Chiều đi<Select name="direction">{Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Sân bay<Select name="airport">{airports.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>)}</Select></label>
            <p className="tw:text-[13px] tw:font-semibold tw:text-slate-700">Số khách đi xe<span data-testid="shuttle-guests" className="tw:mt-1 tw:block tw:text-sm tw:font-normal">{booking.guests ?? 1} khách (theo đơn)</span></p>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Giờ đón<input name="pickupAt" type="datetime-local" required /></label>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Điểm đón (không bắt buộc)<input name="location" maxLength={200} /></label>
            {sq && <p className="tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900 tw:sm:col-span-2">Giá dự kiến <strong>{money(sq.priceVnd)}</strong> cho {sq.distanceKm} km, {sq.passengers ?? ''} khách{sq.night ? ' (phụ phí đêm)' : ''}.</p>}
            <div className="tw:flex tw:flex-wrap tw:gap-3 tw:sm:col-span-2"><button type="button" disabled={busy} onClick={askShuttle} className={`${BTN} tw:border tw:border-slate-300`}>Xem giá</button><button disabled={busy} className={`${BTN} tw:bg-blue-600 tw:text-white`}>{busy ? 'Đang gửi…' : 'Đặt xe'}</button></div>
          </form>
          <Msg ok={smsg.ok}>{smsg.text}</Msg>
        </section>
      )}
    </>
  );
}
