import React, { useEffect, useId, useRef, useState } from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { MAX_GUESTS, MAX_ROOMS, guestsSummary } from '../../data/user';

const STEP = 'tw:grid tw:size-11 tw:place-items-center tw:rounded-full tw:border tw:border-slate-300 tw:bg-white tw:text-slate-700 tw:disabled:opacity-35';

function Row({ label, hint, value, min, max, onChange, id }) {
  return (
    <div className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:py-3">
      <div><span id={id} className="tw:block tw:text-base tw:font-semibold tw:text-slate-800">{label}</span>{hint && <span className="tw:text-[11px] tw:text-slate-500">{hint}</span>}</div>
      <div className="tw:flex tw:items-center tw:gap-3">
        <button type="button" className={STEP} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Giảm ${label.toLowerCase()}`}><Minus size={16} /></button>
        <output aria-labelledby={id} aria-live="polite" className="tw:w-6 tw:text-center tw:text-lg tw:font-bold">{value}</output>
        <button type="button" className={STEP} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Tăng ${label.toLowerCase()}`}><Plus size={16} /></button>
      </div>
    </div>
  );
}

// Ô 'Khách và phòng' (kiểu Agoda): người lớn + trẻ em + số phòng. Trẻ em TÍNH vào tổng số người (sức chứa, xe).
// `inline`: hiện thẳng bảng chỉnh (trong modal đặt phòng); mặc định là popover. `maxPeople`: trần tổng số người (vd sức chứa loại phòng × số phòng).
export default function GuestsPicker({ value, onChange, inline = false, maxPeople = MAX_GUESTS, label = 'Khách và phòng', hideRooms = false }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const btn = useRef(null);
  const uid = useId();
  const { adults, children } = value;
  const summary = hideRooms ? `${adults} người lớn${children ? `, ${children} trẻ em` : ''}` : guestsSummary(value);
  const people = adults + children;
  const cap = Math.min(MAX_GUESTS, maxPeople);
  const set = (patch) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const panel = (
    <div role="group" aria-label={label} className="tw:divide-y tw:divide-slate-100">
      {!hideRooms && <Row id={`${uid}-r`} label="Phòng" value={value.rooms} min={1} max={MAX_ROOMS} onChange={(v) => set({ rooms: v })} />}
      <Row id={`${uid}-a`} label="Người lớn" hint="18 tuổi trở lên" value={adults} min={1} max={Math.max(1, cap - children)} onChange={(v) => set({ adults: v })} />
      <Row id={`${uid}-c`} label="Trẻ em" hint="0-17 tuổi" value={children} min={0} max={Math.max(0, cap - adults)} onChange={(v) => set({ children: v })} />
    </div>
  );
  if (inline) return <div data-testid="guests-panel" className="tw:rounded-xl tw:border tw:border-slate-200 tw:px-4 tw:py-1">{panel}</div>;
  return (
    <div ref={box} className="tw:relative">
      <button ref={btn} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${summary}`} onClick={() => setOpen((o) => !o)} data-testid="guests-trigger" className="ui-box tw:w-full tw:text-left">
        <Users size={18} className="tw:shrink-0 tw:text-slate-400" /><span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-sm">{summary}</span>
      </button>
      {open && (
        <div role="dialog" aria-label={label} data-testid="guests-popover" className="tw:absolute tw:left-0 tw:right-0 tw:z-30 tw:mt-2 tw:min-w-[260px] tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-4 tw:shadow-2xl">
          {panel}
          <p className="tw:mt-2 tw:text-[11px] tw:text-slate-500">Tổng {people} khách.</p>
          <button type="button" onClick={() => { setOpen(false); btn.current?.focus(); }} className="tw:mt-3 tw:min-h-11 tw:w-full tw:rounded-xl tw:bg-blue-600 tw:text-xs tw:font-bold tw:text-white">Xong</button>
        </div>
      )}
    </div>
  );
}
