import React, { useEffect, useMemo, useState } from 'react';
import { getHourlySlots, SLOT_REASON, describeApiError } from '../../data/user';
import { hourlyPriceOf } from './cart';
import { isoDate, money } from '../../lib/time';

const CHIP = 'tw:min-h-9 tw:rounded-full tw:border tw:px-3 tw:text-xs tw:font-bold';
const ON = 'tw:border-blue-600 tw:bg-blue-600 tw:text-white';
const OFF = 'tw:border-slate-300 tw:bg-white tw:text-slate-700 tw:disabled:opacity-40';
// Giờ:phút theo giờ Việt Nam (khớp cách backend tính khung giờ), kèm "hôm sau" nếu giờ ra qua nửa đêm.
export const hhmm = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
export const vnDay = (iso) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
export const endLabel = (startsAt, endsAt) => `${hhmm(endsAt)}${vnDay(endsAt) !== vnDay(startsAt) ? ' (hôm sau)' : ''}`;
// Nút số giờ nhanh: 2h, 3h, 4h, 6h nằm trong [min, max]; không có thì dùng min và max.
export const hourChoices = ({ minHours, maxHours }) => {
  const p = [2, 3, 4, 6].filter((h) => h >= minHours && h <= maxHours);
  return p.length ? p : [...new Set([minHours, maxHours])];
};
const defaultHours = (cfg) => { const c = hourChoices(cfg); return c.includes(2) ? 2 : c[0]; };

// Chọn giờ vào + số giờ cho một dòng phòng theo giờ: nút nhanh (Bây giờ, +1 giờ, +2 giờ), ô chọn giờ (khung kín bị xám kèm lý do), nút số giờ, giá và giờ ra.
// `onPick({ startsAt, hours })` chạy khi chọn đổi (kể cả tự chọn khung trống đầu tiên); `line` = dòng giờ đang có trong giỏ.
export default function HourlyPicker({ hotelId, room, date, line, onPick, preferFrom = 8 }) {
  const cfg = room.hourly;
  const [hours, setHours] = useState(line?.hours ?? defaultHours(cfg));
  const [startsAt, setStartsAt] = useState(line?.startsAt ?? '');
  const [data, setData] = useState({ s: 'loading', slots: [] });

  useEffect(() => {
    const ctl = new AbortController();
    setData((d) => ({ s: 'loading', slots: d.slots }));
    getHourlySlots(hotelId, { roomTypeId: room.id, date, hours }, ctl.signal)
      .then((r) => setData({ s: 'ok', slots: r.slots }))
      .catch((e) => { if (!ctl.signal.aborted) setData({ s: 'error', slots: [], error: describeApiError(e) }); });
    return () => ctl.abort();
  }, [hotelId, room.id, date, hours]);

  const cur = data.slots.find((x) => x.startsAt === startsAt);
  const anyFree = data.slots.find((x) => x.available);
  // Khung gợi ý mặc định: trống đầu tiên từ `preferFrom` giờ (8h; 14h khi giỏ đã có phòng theo đêm, vì giờ ở phải nằm trong khoảng nhận phòng), không có thì khung trống đầu tiên.
  const firstFree = data.slots.find((x) => x.available && Number(x.time.slice(0, 2)) >= preferFrom) ?? anyFree;
  // Khung đang chọn không còn (đổi ngày/số giờ, hoặc đã kín): chọn khung trống đầu tiên để khách khỏi phải chọn lại.
  useEffect(() => {
    if (data.s !== 'ok' || (cur && cur.available)) return;
    if (firstFree && firstFree.startsAt !== startsAt) { setStartsAt(firstFree.startsAt); onPick({ startsAt: firstFree.startsAt, hours }); }
    else if (!firstFree && startsAt) setStartsAt('');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (nextStart, nextHours) => { setStartsAt(nextStart); setHours(nextHours); if (nextStart) onPick({ startsAt: nextStart, hours: nextHours }); };
  const today = date === isoDate(0);
  const quick = useMemo(() => (today ? [['Bây giờ', 0], ['+1 giờ', 1], ['+2 giờ', 2]] : []), [today]);
  const goQuick = (k) => {
    const target = Date.now() + k * 3600_000 - (k === 0 ? 5 * 60_000 : 0);
    const s = data.slots.find((x) => x.available && Date.parse(x.startsAt) >= target);
    if (s) pick(s.startsAt, hours);
  };
  const sel = cur?.available ? cur : null;

  return (
    <div data-testid="hourly-picker" className="tw:mt-3 tw:grid tw:gap-2.5 tw:rounded-lg tw:bg-slate-50 tw:p-3">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2" role="group" aria-label={`Giờ vào ${room.name}`}>
        {quick.map(([label, k]) => <button key={label} type="button" onClick={() => goQuick(k)} disabled={data.s !== 'ok'} className={`${CHIP} ${OFF}`}>{label}</button>)}
        <label className="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-semibold tw:text-slate-600">Giờ vào
          <select aria-label={`Giờ vào ${room.name}`} data-testid="hourly-start" value={sel ? startsAt : ''} onChange={(e) => pick(e.target.value, hours)} disabled={data.s !== 'ok' || !anyFree} className="tw:h-9 tw:rounded-lg tw:border tw:border-slate-300 tw:bg-white tw:px-2 tw:text-xs">
            {!sel && <option value="">{data.s === 'loading' ? 'Đang tải…' : 'Không còn khung trống'}</option>}
            {data.slots.map((x) => <option key={x.startsAt} value={x.startsAt} disabled={!x.available}>{x.now ? `Bây giờ (${x.time})` : x.time}{x.available ? '' : ` · ${SLOT_REASON[x.reason]}`}</option>)}
          </select>
        </label>
      </div>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2" role="group" aria-label={`Số giờ ${room.name}`}>
        <span className="tw:text-xs tw:font-semibold tw:text-slate-600">Số giờ</span>
        {hourChoices(cfg).map((h) => <button key={h} type="button" aria-pressed={h === hours} onClick={() => pick(sel ? startsAt : '', h)} className={`${CHIP} ${h === hours ? ON : OFF}`}>{h}h</button>)}
      </div>
      {data.s === 'error' && <p role="alert" className="tw:text-xs tw:font-semibold tw:text-rose-700">{data.error}</p>}
      {data.s === 'ok' && !anyFree && <p data-testid="hourly-none" className="tw:text-xs tw:font-semibold tw:text-rose-700">Không còn khung giờ trống trong ngày này, hãy chọn ngày khác hoặc bớt số giờ.</p>}
      {sel && <p data-testid="hourly-summary" aria-live="polite" className="tw:text-xs tw:font-bold tw:text-blue-700">{hours} giờ · ra lúc {endLabel(sel.startsAt, sel.endsAt)} · {money(hourlyPriceOf(cfg, hours))}</p>}
      <p className="tw:text-[11px] tw:text-slate-500">Giờ đầu {money(cfg.firstHourVnd)}, mỗi giờ tiếp theo {money(cfg.nextHourVnd)}.</p>
    </div>
  );
}
