import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// Chọn nhiều có ô tìm kiếm. options: [{ id, label, hint? }]; value: mảng id; onChange(mảng id mới).
// Danh sách mở ngay dưới nút (chiếm chỗ trong luồng, không bị khung modal cắt); Esc hoặc bấm ra ngoài thì đóng.
export default function MultiSelect({ options, value, onChange, placeholder = 'Chọn…', searchPlaceholder = 'Tìm…', clearLabel = 'Bỏ chọn', id, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  const picked = new Set(value);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const shown = options.filter((o) => !q.trim() || plain(o.label).includes(plain(q.trim())));
  const toggle = (oid) => { const n = new Set(picked); if (n.has(oid)) n.delete(oid); else n.add(oid); onChange(options.map((o) => o.id).filter((x) => n.has(x))); };
  return (
    <div ref={box} data-testid={testid} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <button type="button" id={id} className="ui-select" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', width: '100%', justifyContent: 'space-between', height: 'auto', padding: '8px 14px' }} data-testid={testid && `${testid}-trigger`}>
        <span style={{ flex: 1, minWidth: 0 }}>{picked.size ? <><strong>{picked.size} đã chọn</strong>{' · '}{options.filter((o) => picked.has(o.id)).map((o) => o.label).join(', ')}</> : <span className="muted">{placeholder}</span>}</span>
        <ChevronDown size={16} aria-hidden="true" className="ui-select-icon" data-open={open} />
      </button>
      {open && (
        <div style={{ marginTop: 6, border: '1px solid var(--ctl-line)', borderRadius: 'var(--ctl-r)', background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.12)', overflow: 'hidden' }}>
          <div className="ui-select-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} data-testid={testid && `${testid}-search`} />
            {picked.size > 0 && <button type="button" className="link-btn" onClick={() => onChange([])} data-testid={testid && `${testid}-clear`}>{clearLabel}</button>}
          </div>
          <ul role="listbox" aria-multiselectable="true" style={{ listStyle: 'none', margin: 0, padding: 4, maxHeight: 240, overflow: 'auto' }}>
            {shown.length === 0 && <li className="muted" style={{ padding: '10px 12px' }}>Không có kết quả.</li>}
            {shown.map((o) => {
              const on = picked.has(o.id);
              return (
                <li key={o.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(o.id)} data-testid={testid && `${testid}-opt-${o.id}`}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', border: 0, borderRadius: 8, textAlign: 'left', cursor: 'pointer', background: on ? '#eff6ff' : 'transparent' }}>
                    <span><span style={{ fontWeight: on ? 600 : 400 }}>{o.label}</span>{o.hint && <small className="muted"> {o.hint}</small>}</span>
                    {on && <Check size={16} aria-hidden="true" color="#2563eb" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
