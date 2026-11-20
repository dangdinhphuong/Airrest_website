import React, { useEffect, useState } from 'react';
import { Car } from 'lucide-react';
import { airportName, defaultPickup, quoteHotelShuttle } from '../../data/user';
import { money } from '../../lib/time';
import Select from '../../components/Select';

export const LEG_LABEL = { TO_HOTEL: 'Đón từ sân bay về khách sạn', TO_AIRPORT: 'Ra sân bay khi trả phòng' };
export const emptyShuttle = (airport) => ({ airport, TO_HOTEL: { on: false, at: '', location: '' }, TO_AIRPORT: { on: false, at: '', location: '' } });
const DIRS = ['TO_HOTEL', 'TO_AIRPORT'];
const errCls = (on) => (on ? 'tw:ring-2 tw:ring-rose-400' : '');

// Xe đưa đón cùng đơn: số khách đi xe = số người đặt phòng (chỉ hiển thị). Giá lấy từ POST /api/v1/hotels/:id/shuttle-quote (có pickupAt để khớp phụ thu đêm).
// `value.<chiều>.at` rỗng = dùng giờ mặc định theo ngày nhận/trả (đổi ngày thì giờ mặc định đổi theo, chỉ khi khách chưa sửa tay).
export default function ShuttleOptions({ hotel, checkIn, checkOut, people, value, onChange, error, onQuote, hourly, times }) {
  const [quote, setQuote] = useState({ s: 'idle' }); // idle | loading | ok | error
  const pick = (d) => value[d].at || defaultPickup(d, checkIn, checkOut, Date.now(), hourly, times);
  const setLeg = (d, patch) => onChange({ ...value, [d]: { ...value[d], ...patch } });
  const legsKey = DIRS.filter((d) => value[d].on).map((d) => `${d}@${pick(d)}`).join('|') + `#${value.airport}`;
  const free = hotel.shuttleMode === 'free';

  useEffect(() => {
    const legs = DIRS.filter((d) => value[d].on).map((d) => ({ direction: d, pickupAt: `${pick(d)}:00+07:00`, ...(value.airport && { airport: value.airport }) }));
    if (!legs.length) { setQuote({ s: 'idle' }); onQuote?.(null); return undefined; }
    const ctl = new AbortController();
    setQuote((q) => ({ ...q, s: 'loading' }));
    const t = setTimeout(() => {
      quoteHotelShuttle(hotel.id, { legs, guests: people }, ctl.signal)
        .then((r) => { setQuote({ s: 'ok', r }); onQuote?.(r); })
        .catch((e) => { if (!ctl.signal.aborted) { setQuote({ s: 'error' }); onQuote?.(null); } });
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [legsKey, hotel.id, people]); // eslint-disable-line react-hooks/exhaustive-deps

  const legPrice = (d) => {
    if (quote.s === 'error') return null;
    const l = quote.r?.legs.find((x) => x.direction === d);
    if (!l) return quote.s === 'loading' ? '…' : null;
    return quote.r.free || l.priceVnd === 0 ? 'Miễn phí' : `${money(l.priceVnd)}${l.night ? ' (phụ thu đêm)' : ''}`;
  };

  return (
    <fieldset className="tw:mt-5 tw:rounded-xl tw:border tw:border-slate-200 tw:p-4" data-testid="shuttle-options">
      <legend className="tw:flex tw:items-center tw:gap-2 tw:px-1 tw:text-xs tw:font-bold"><Car size={15} /> Xe đưa đón {free ? '(miễn phí)' : '(có phí)'}</legend>
      <p className="tw:text-[11px] tw:text-slate-500">Số khách đi xe: <strong data-testid="shuttle-pax">{people}</strong> (theo số người đặt phòng). Giờ đón theo giờ Việt Nam.</p>
      {hotel.airports.length > 1 && (
        <label className="tw:mt-3 tw:grid tw:gap-1 tw:text-[13px] tw:font-semibold tw:text-slate-700">Sân bay
          <Select id="shuttle-airport" value={value.airport} onChange={(e) => onChange({ ...value, airport: e.target.value })} className={errCls(error?.field === 'airport')}>{hotel.airports.map((a) => <option key={a} value={a}>{airportName(a)} ({a})</option>)}</Select>
        </label>
      )}
      <div className="tw:lg:grid tw:lg:grid-cols-2 tw:lg:gap-4">
      {DIRS.map((d) => (
        <div key={d} className="tw:mt-3 tw:rounded-lg tw:bg-slate-50 tw:p-3">
          <label className="tw:flex tw:items-center tw:gap-3 tw:text-[13px] tw:font-semibold tw:text-slate-800">
            <input type="checkbox" checked={value[d].on} onChange={(e) => setLeg(d, { on: e.target.checked })} data-testid={`leg-${d}`} className="tw:size-5" />
            <span className="tw:flex-1">{LEG_LABEL[d]}</span>
            {value[d].on && <span className="tw:text-xs tw:font-bold tw:text-blue-700" data-testid={`price-${d}`}>{legPrice(d)}</span>}
          </label>
          {value[d].on && (
            <div className="tw:mt-3 tw:grid tw:gap-3 tw:sm:grid-cols-2 tw:lg:grid-cols-1">
              <label className="tw:grid tw:min-w-0 tw:gap-1 tw:text-xs tw:font-semibold tw:text-slate-700">Giờ đón
                <input id={`pickup-${d}`} type="datetime-local" value={pick(d)} onChange={(e) => setLeg(d, { at: e.target.value })} required className={`tw:w-full tw:min-w-0 ${errCls(error?.field === 'pickup')}`} />
              </label>
              <label className="tw:grid tw:min-w-0 tw:gap-1 tw:text-xs tw:font-semibold tw:text-slate-700">Điểm đón / ghi chú (không bắt buộc)
                <input value={value[d].location} maxLength={200} onChange={(e) => setLeg(d, { location: e.target.value })} />
              </label>
            </div>
          )}
        </div>
      ))}
      </div>
      {quote.s === 'error' && <p role="status" className="tw:mt-3 tw:text-xs tw:text-amber-800">Chưa báo được giá xe lúc này. Bạn vẫn đặt phòng được, giá xe sẽ được tính khi gửi yêu cầu.</p>}
      {quote.s === 'ok' && quote.r.offered === false && <p role="status" className="tw:mt-3 tw:text-xs tw:text-amber-800">Khách sạn hiện không nhận đặt xe.</p>}
      {error && <p role="alert" data-testid="shuttle-error" className="tw:mt-3 tw:rounded-xl tw:bg-rose-50 tw:p-3 tw:text-xs tw:font-semibold tw:text-rose-700">{error.text}</p>}
    </fieldset>
  );
}
