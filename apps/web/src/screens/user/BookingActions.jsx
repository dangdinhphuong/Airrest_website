import React, { useCallback, useEffect, useState } from 'react';
import { Car, RefreshCw } from 'lucide-react';
import { cancelShuttle, createChangeRequest, describeApiError, createShuttle, listAirports, listChangeRequests, listShuttles, quoteCancel, quoteShuttle } from '../../data/user';
import { money } from '../../lib/time';

const BOX = 'tw:mt-6 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-5';
const BTN = 'tw:min-h-11 tw:rounded-xl tw:px-4 tw:text-xs tw:font-bold tw:disabled:opacity-60';
const REASONS = { CHANGE_OF_PLAN: 'Thay đổi kế hoạch', FLIGHT_CANCELLED: 'Chuyến bay bị hủy', FLIGHT_RESCHEDULED: 'Chuyến bay đổi giờ', HEALTH: 'Sức khỏe', OTHER: 'Lý do khác' };
const REQ_STATUS = { PENDING: 'Chờ khách sạn duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Bị từ chối' };
const TIER = { FREE: 'Hủy miễn phí', PARTIAL: 'Phí một phần', LATE: 'Hủy sát giờ' };
const SHUTTLE_STATUS = { REQUESTED: 'Đã yêu cầu', ASSIGNED: 'Đã phân xe', DONE: 'Hoàn tất', CANCELLED: 'Đã hủy' };
const DIRECTION = { TO_HOTEL: 'Sân bay → khách sạn', TO_AIRPORT: 'Khách sạn → sân bay' };
const dmy = (iso) => new Date(iso).toLocaleDateString('vi-VN');
const dmyHm = (iso) => new Date(iso).toLocaleString('vi-VN', { hour12: false, dateStyle: 'short', timeStyle: 'short' });

function Msg({ ok, children }) {
  return children ? <p role={ok ? 'status' : 'alert'} className={`tw:mt-3 tw:rounded-xl tw:p-3 tw:text-xs tw:font-semibold ${ok ? 'tw:bg-emerald-50 tw:text-emerald-800' : 'tw:bg-rose-50 tw:text-rose-700'}`}>{children}</p> : null;
}

// Hủy / đổi ngày và xe đưa đón của một booking (xác thực bằng mã + SĐT đã nhập ở trang theo dõi).
export default function BookingActions({ booking, phone }) {
  const code = booking.code;
  const live = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'].includes(booking.status);
  const rideable = ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status);
  const [requests, setRequests] = useState([]);
  const [shuttles, setShuttles] = useState([]);
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
  const loadShuttle = useCallback(() => listShuttles(code, phone).then(setShuttles).catch(() => setShuttles([])), [code, phone]);
  useEffect(() => { loadReq(); loadShuttle(); }, [loadReq, loadShuttle]);

  const run = async (fn, setM) => { setBusy(true); setM({ ok: false, text: '' }); try { await fn(); } catch (e) { setM({ ok: false, text: describeApiError(e) }); } finally { setBusy(false); } };

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
    run(async () => { await createChangeRequest(body); setMsg({ ok: true, text: 'Đã gửi yêu cầu. Khách sạn sẽ xem xét và trạng thái hiện ở danh sách bên dưới.' }); setQuote(null); await loadReq(); }, setMsg);
  };

  const shuttleBody = (form) => { const d = Object.fromEntries(new FormData(form).entries()); return { code, phone, direction: d.direction, airport: d.airport, pickupAt: new Date(d.pickupAt), ...(d.location?.trim() && { location: d.location.trim() }) }; };
  const askShuttle = (e) => { const form = e.currentTarget.form; if (form.reportValidity()) run(async () => setSq(await quoteShuttle(shuttleBody(form))), setSmsg); };
  const bookShuttle = (e) => { e.preventDefault(); run(async () => { await createShuttle(shuttleBody(e.currentTarget)); setSmsg({ ok: true, text: 'Đã gửi yêu cầu xe đưa đón.' }); setSq(null); await loadShuttle(); }, setSmsg); };
  const stopShuttle = (id) => run(async () => { await cancelShuttle(id, code, phone); await loadShuttle(); }, setSmsg);

  return (
    <>
      {live && (
        <section className={BOX} aria-label="Hủy hoặc đổi ngày">
          <h3 className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-bold"><RefreshCw size={16} /> Hủy hoặc đổi ngày</h3>
          {requests.length > 0 && <ul className="tw:mt-3 tw:space-y-2 tw:text-xs">{requests.map((r) => <li key={r.id} className="tw:rounded-xl tw:bg-slate-50 tw:p-3"><strong>{r.type === 'CANCEL' ? 'Yêu cầu hủy' : `Đổi ngày → ${dmy(r.newFrom)} - ${dmy(r.newTo)}`}</strong> · {REQ_STATUS[r.status] ?? r.status}{r.decisionNote ? ` · ${r.decisionNote}` : ''}{r.refund ? ` · hoàn ${money(r.refund.amountVnd)}` : ''}</li>)}</ul>}
          <form onSubmit={submitRequest} className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Loại yêu cầu<select value={type} onChange={(e) => { setType(e.target.value); setQuote(null); }}><option value="CANCEL">Hủy đặt phòng</option><option value="CHANGE">Đổi ngày lưu trú</option></select></label>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Lý do<select name="reasonCode">{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {type === 'CHANGE' && <><label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Nhận phòng mới<input name="newFrom" type="date" required /></label><label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Trả phòng mới<input name="newTo" type="date" required /></label></>}
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700 tw:sm:col-span-2">Ghi chú (bắt buộc nếu chọn lý do khác)<input name="reasonNote" maxLength={500} /></label>
            {type === 'CANCEL' && quote && <p className="tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900 tw:sm:col-span-2">{TIER[quote.tier] ?? quote.tier}: phí giữ lại <strong>{money(quote.keepVnd)}</strong>, hoàn lại <strong>{money(quote.refundVnd)}</strong>.</p>}
            <div className="tw:flex tw:flex-wrap tw:gap-3 tw:sm:col-span-2">
              {type === 'CANCEL' && <button type="button" disabled={busy} onClick={showQuote} className={`${BTN} tw:border tw:border-slate-300`}>Xem phí hủy</button>}
              <button disabled={busy} className={`${BTN} tw:bg-blue-600 tw:text-white`}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
            </div>
          </form>
          <Msg ok={msg.ok}>{msg.text}</Msg>
        </section>
      )}

      {rideable && (
        <section className={BOX} aria-label="Xe đưa đón">
          <h3 className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-bold"><Car size={16} /> Xe đưa đón</h3>
          {shuttles.length > 0 && <ul className="tw:mt-3 tw:space-y-2 tw:text-xs">{shuttles.map((s) => <li key={s.id} className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:rounded-xl tw:bg-slate-50 tw:p-3"><span><strong>{DIRECTION[s.direction]}</strong> · {dmyHm(s.pickupAt)} · {money(s.priceVnd)} · {SHUTTLE_STATUS[s.status] ?? s.status}{s.driver ? ` · ${s.driver.name ?? ''} ${s.driver.phone ?? ''}` : ''}</span>{['REQUESTED', 'ASSIGNED'].includes(s.status) && <button type="button" disabled={busy} onClick={() => stopShuttle(s.id)} className={`${BTN} tw:border tw:border-rose-200 tw:text-rose-700`}>Hủy xe</button>}</li>)}</ul>}
          <form onSubmit={bookShuttle} className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Chiều đi<select name="direction">{Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Sân bay<select name="airport">{airports.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>)}</select></label>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Giờ đón<input name="pickupAt" type="datetime-local" required /></label>
            <label className="tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Điểm đón (không bắt buộc)<input name="location" maxLength={200} /></label>
            {sq && <p className="tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900 tw:sm:col-span-2">Giá dự kiến <strong>{money(sq.priceVnd)}</strong> cho {sq.distanceKm} km{sq.night ? ' (phụ phí đêm)' : ''}.</p>}
            <div className="tw:flex tw:flex-wrap tw:gap-3 tw:sm:col-span-2"><button type="button" disabled={busy} onClick={askShuttle} className={`${BTN} tw:border tw:border-slate-300`}>Xem giá</button><button disabled={busy} className={`${BTN} tw:bg-blue-600 tw:text-white`}>{busy ? 'Đang gửi…' : 'Đặt xe'}</button></div>
          </form>
          <Msg ok={smsg.ok}>{smsg.text}</Msg>
        </section>
      )}
    </>
  );
}
