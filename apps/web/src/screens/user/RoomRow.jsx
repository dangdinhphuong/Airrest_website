import React, { useState } from 'react';
import { money } from '../../lib/time';
import { NR, cartPlan, hasNight, hourlyLineOf, isHourly, maxQty, nightPriceOf, qtyOf, roomNote } from './cart';
import { Stepper } from './BookingModal';
import HourlyPicker from './HourlyPicker';

const SEG = 'tw:min-h-9 tw:px-3 tw:text-xs tw:font-bold';

// Một loại phòng trong danh sách: bật theo giờ thì có công tắc Đêm | Giờ. Mỗi chế độ là một dòng riêng trong giỏ (cùng loại phòng được đặt cả hai).
// onQty(q, opt): đổi số lượng; opt = { kind: 'HOURLY', startsAt, hours } cho dòng giờ.
export default function RoomRow({ hotel, room: r, people, cart, date, onQty }) {
  const inCart = cart.hotelId === hotel.id;
  const night = inCart ? qtyOf(cart, r.id) : 0;
  const line = inCart ? hourlyLineOf(cart, r.id) : undefined;
  const [mode, setMode] = useState(line && !night ? 'HOURLY' : 'NIGHT');
  const [pick, setPick] = useState(line ? { startsAt: line.startsAt, hours: line.hours } : null);
  const hasNr = r.nonRefundablePrice != null;
  const [localPlan, setLocalPlan] = useState(null); // mức khách vừa bấm ở dòng này (null = theo giỏ)
  const plan = !hasNr ? 'STANDARD' : localPlan ?? (inCart && hasNight(cart) ? cartPlan(cart) : 'STANDARD');
  const choosePlan = (p) => { setLocalPlan(p); if (night > 0) { onQty(night, { plan: p }); setLocalPlan(null); } }; // đã có trong giỏ: đổi mức ngay (các dòng đêm khác mức cũ bị bỏ)
  const note = roomNote(r, people);
  const hourlyMode = r.hourly && mode === 'HOURLY';
  const q = hourlyMode ? (line?.qty ?? 0) : night;
  const onPick = (p) => { setPick(p); if (line) onQty(line.qty, { kind: 'HOURLY', ...p }); }; // đã có dòng giờ: đổi giờ/số giờ cập nhật luôn dòng đó
  return (
    <li data-testid="room-row" className={`tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:rounded-lg tw:border tw:bg-white tw:p-3 ${note && !hourlyMode ? 'tw:border-slate-200 tw:opacity-70' : night || line ? 'tw:border-blue-300' : 'tw:border-slate-200'}`}>
      <span className="tw:block tw:min-w-0 tw:flex-1 tw:basis-48">
        <span className="tw:block tw:text-sm tw:font-bold">{r.name}</span>
        <span className="tw:mt-1 tw:block tw:text-xs tw:text-slate-600">Tối đa {r.maxOccupancy} người · {plan === NR ? 'Không hoàn hủy' : r.cancellationPolicy}</span>
        {hasNr && !hourlyMode && (
          <span role="group" aria-label={`Mức giá ${r.name}`} className="tw:mt-2 tw:inline-flex tw:overflow-hidden tw:rounded-lg tw:border tw:border-slate-300">
            {[['STANDARD', 'Linh hoạt'], [NR, `Không hoàn hủy −${r.nonRefundablePct}%`]].map(([k, label]) => <button key={k} type="button" aria-pressed={plan === k} onClick={() => choosePlan(k)} className={`${SEG} ${plan === k ? 'tw:bg-blue-600 tw:text-white' : 'tw:bg-white tw:text-slate-700'}`}>{label}</button>)}
          </span>
        )}
        {!hourlyMode && <span className={`tw:mt-1 tw:block tw:text-xs tw:font-semibold ${note ? 'tw:text-rose-700' : 'tw:text-emerald-700'}`}>{note ?? `Còn ${r.availableRooms} phòng`}</span>}
        {r.hourly && (
          <span role="group" aria-label={`Hình thức đặt ${r.name}`} className="tw:mt-2 tw:inline-flex tw:overflow-hidden tw:rounded-lg tw:border tw:border-slate-300">
            {[['NIGHT', 'Đêm', night], ['HOURLY', 'Giờ', line?.qty ?? 0]].map(([k, label, n]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`${SEG} ${mode === k ? 'tw:bg-blue-600 tw:text-white' : 'tw:bg-white tw:text-slate-700'}`}>{label}{n ? ` (${n})` : ''}</button>
            ))}
          </span>
        )}
      </span>
      <span className="tw:text-sm tw:font-extrabold tw:text-blue-700">{hourlyMode ? <>{money(r.hourly.firstHourVnd)}<span className="tw:text-[11px] tw:font-normal tw:text-slate-500"> / giờ đầu</span></> : <>{money(nightPriceOf(r, plan))}<span className="tw:text-[11px] tw:font-normal tw:text-slate-500"> / đêm</span></>}</span>
      <Stepper value={q} max={hourlyMode ? (pick || line ? maxQty(r, 'HOURLY') : 0) : maxQty(r)} label={hourlyMode ? `${r.name} theo giờ` : r.name} onChange={(v) => (hourlyMode ? onQty(v, { kind: 'HOURLY', ...(line ? { startsAt: line.startsAt, hours: line.hours } : pick) }) : onQty(v, { plan }))} />
      {hourlyMode && <div className="tw:basis-full"><HourlyPicker hotelId={hotel.id} room={r} date={date} line={line} onPick={onPick} preferFrom={inCart && cart.lines.some((l) => !isHourly(l)) ? 14 : 8} /></div>}
    </li>
  );
}
