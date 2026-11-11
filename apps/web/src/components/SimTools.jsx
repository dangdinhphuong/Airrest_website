import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { fmtDateTime } from '../lib/time';
import { setFailNext, getFailNext } from '../mock/service';

// Công cụ DEMO: điều khiển giờ mô phỏng và sự kiện đổi giờ bay. Không phải tính năng cho người dùng cuối.
export default function SimTools({ simNow, hasFlight, canChange, dispatch }) {
  const [open, setOpen] = useState(false);
  const [fail, setFail] = useState(getFailNext());
  const ref = useRef(null);
  // Đóng khung khi bấm ra ngoài hoặc nhấn Esc để không che nội dung.
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <aside ref={ref} className={`simtools ${open ? 'open' : ''}`} aria-label="Công cụ mô phỏng (chỉ để demo)" data-testid="simtools">
      <button type="button" className="simtools-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <FlaskConical size={20} aria-hidden="true" /><span className="sr">Công cụ mô phỏng{fail ? ' (đang mô phỏng lỗi)' : ''}</span>{fail && <span className="sim-on-dot" data-testid="sim-fail-on" aria-hidden="true" />}
      </button>
      {open && (
        <div className="simtools-body">
          <p className="simtools-note">Chỉ để demo. Giờ mô phỏng hiện tại: <strong data-testid="sim-now">{hasFlight ? fmtDateTime(simNow) : 'chưa có chuyến bay'}</strong></p>
          <div className="simtools-group" role="group" aria-label="Tua giờ mô phỏng">
            {[10, 30, 60].map((m) => (
              <button key={m} type="button" className="btn btn-sm" disabled={!hasFlight} onClick={() => dispatch({ type: 'advance', minutes: m })}>+{m >= 60 ? `${m / 60} giờ` : `${m} phút`}</button>
            ))}
          </div>
          <div className="simtools-group" role="group" aria-label="Mô phỏng đổi giờ bay">
            <button type="button" className="btn btn-sm" disabled={!canChange} onClick={() => dispatch({ type: 'timeChange', minutes: 120 })}>Giờ bay dời muộn +2 giờ</button>
            <button type="button" className="btn btn-sm" disabled={!canChange} onClick={() => dispatch({ type: 'timeChange', minutes: -60 })}>Giờ bay dời sớm −1 giờ</button>
          </div>
          <label className="simtools-check">
            <input type="checkbox" checked={fail} onChange={(e) => { setFail(e.target.checked); setFailNext(e.target.checked); }} />
            Mô phỏng lỗi dịch vụ dữ liệu (đến khi bỏ chọn)
          </label>
        </div>
      )}
    </aside>
  );
}
