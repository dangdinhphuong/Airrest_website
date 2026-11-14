import React, { useEffect, useState } from 'react';

// Lọc khoảng giá: hai ô Tối thiểu/Tối đa + thanh kéo hai đầu. `bounds` = { min, max } (VND); `value` = null (cả khoảng) hoặc { min, max }.
// Chỉ gọi onChange sau khi người dùng ngừng thao tác ~400ms để không gọi API liên tục khi kéo.
const STEP = 10000;
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);
const digits = (s) => Number(String(s).replace(/\D/g, ''));

export default function PriceRange({ bounds, value, onChange }) {
  const lo0 = bounds.min;
  const hi0 = bounds.max;
  const [lo, setLo] = useState(value?.min ?? lo0);
  const [hi, setHi] = useState(value?.max ?? hi0);
  const [textLo, setTextLo] = useState(null); // đang gõ trong ô
  const [textHi, setTextHi] = useState(null);

  useEffect(() => { setLo(value?.min ?? lo0); setHi(value?.max ?? hi0); }, [value?.min, value?.max, lo0, hi0]);
  useEffect(() => {
    if ((value?.min ?? lo0) === lo && (value?.max ?? hi0) === hi) return undefined;
    const t = window.setTimeout(() => onChange(lo <= lo0 && hi >= hi0 ? null : { min: lo, max: hi }), 400);
    return () => window.clearTimeout(t);
  }, [lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (n) => Math.min(hi0, Math.max(lo0, n));
  const span = Math.max(1, hi0 - lo0);
  const pct = (n) => ((n - lo0) / span) * 100;
  const commitLo = (raw) => { setLo(Math.min(clamp(raw), hi)); setTextLo(null); };
  const commitHi = (raw) => { setHi(Math.max(clamp(raw), lo)); setTextHi(null); };
  const onEnter = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(e.currentTarget.value); } };

  return (
    <div>
      <div className="tw:grid tw:grid-cols-2 tw:gap-2">
        {[['Tối thiểu', textLo ?? fmt(lo), setTextLo, commitLo], ['Tối đa', textHi ?? fmt(hi), setTextHi, commitHi]].map(([label, shown, setText, commit]) => (
          <label key={label} className="ui-float"><span>{label}</span>
            <span className="ui-float-box"><span aria-hidden="true">đ</span><input inputMode="numeric" value={shown} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(digits(e.target.value))} onKeyDown={onEnter((v) => commit(digits(v)))} aria-label={`Giá ${label.toLowerCase()} mỗi đêm`} /></span>
          </label>
        ))}
      </div>
      <p className="tw:mt-3 tw:text-xs tw:text-slate-600">Khoảng giá: từ {fmt(lo)}đ đến {fmt(hi)}đ</p>
      <div className="ui-range">
        <div className="ui-range-track" /><div className="ui-range-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" min={lo0} max={hi0} step={STEP} value={lo} aria-label="Giá tối thiểu" style={{ zIndex: lo > hi0 - span / 10 ? 3 : 2 }} onChange={(e) => setLo(Math.min(Number(e.target.value), hi))} />
        <input type="range" min={lo0} max={hi0} step={STEP} value={hi} aria-label="Giá tối đa" style={{ zIndex: 2 }} onChange={(e) => setHi(Math.max(Number(e.target.value), lo))} />
      </div>
    </div>
  );
}
