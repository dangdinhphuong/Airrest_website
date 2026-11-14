import React, { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

// Thay thế <select>: cùng cách dùng (value/defaultValue/onChange/name/required + các <option> con), nhưng mở ra danh sách
// có ô tìm kiếm (khi >= SEARCH_FROM lựa chọn) và thanh cuộn riêng. onChange nhận { target: { value, name } } như select thật.
const SEARCH_FROM = 8;
const text = (n) => Children.toArray(n).map((c) => (isValidElement(c) ? text(c.props.children) : String(c))).join('');
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

function parseOptions(children) {
  const out = [];
  const walk = (nodes) => Children.forEach(nodes, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === Fragment) walk(c.props.children);
    else if (c.type === 'option') { const label = text(c.props.children); out.push({ value: String(c.props.value ?? label), label, disabled: !!c.props.disabled }); }
  });
  walk(children);
  return out;
}

export default function Select({ value, defaultValue, onChange, name, required, disabled, className = '', children, id, ...rest }) {
  const options = parseOptions(children);
  const [inner, setInner] = useState(defaultValue ?? '');
  const cur = String(value ?? inner);
  const selected = options.find((o) => o.value === cur) ?? options[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  const search = useRef(null);
  const uid = useId();
  const searchable = options.length >= SEARCH_FROM;
  const shown = query ? options.filter((o) => plain(o.label).includes(plain(query))) : options;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    const width = Math.min(Math.max(r.width, 200), window.innerWidth - 16); // không tràn mép phải trên màn hẹp
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width, ...(up ? { bottom: window.innerHeight - r.top + 4, maxH: Math.min(320, r.top - 12) } : { top: r.bottom + 4, maxH: Math.min(320, below - 12) }) });
  };
  const close = (refocus) => { setOpen(false); setQuery(''); if (refocus) btn.current?.focus(); };
  const pick = (o) => {
    if (!o || o.disabled) return;
    if (value === undefined) setInner(o.value);
    onChange?.({ target: { value: o.value, name }, currentTarget: { value: o.value, name } });
    close(true);
  };

  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    setActive(Math.max(0, options.findIndex((o) => o.value === cur)));
    if (searchable) search.current?.focus();
    const onDown = (e) => { if (!btn.current?.contains(e.target) && !pop.current?.contains(e.target)) close(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { pop.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  const onKey = (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !(e.key === ' ' && e.target !== btn.current)) { e.preventDefault(); setOpen(true); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <>
      <button ref={btn} id={id} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? uid : undefined} disabled={disabled} onClick={() => setOpen((o) => !o)} onKeyDown={onKey} className={`ui-select ${className}`} {...rest}>
        <span className="ui-select-text">{selected?.label ?? ''}</span>
        <ChevronDown size={16} aria-hidden="true" className="ui-select-icon" data-open={open} />
      </button>
      {name && <input type="hidden" name={name} value={selected?.value ?? ''} />}
      {required && <input tabIndex={-1} aria-hidden="true" required value={selected?.value ?? ''} onChange={() => {}} className="ui-select-req" />}
      {open && pos && createPortal(
        <div ref={pop} className="ui-select-pop" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }} onKeyDown={onKey}>
          {searchable && <div className="ui-select-search"><Search size={14} aria-hidden="true" /><input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm kiếm..." aria-label="Tìm kiếm" /></div>}
          <ul id={uid} role="listbox" style={{ maxHeight: pos.maxH - (searchable ? 52 : 0) }}>
            {shown.length ? shown.map((o, i) => (
              <li key={o.value} role="option" aria-selected={o.value === cur} aria-disabled={o.disabled || undefined} data-active={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>{o.label}</li>
            )) : <li className="ui-select-empty">Không có kết quả</li>}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
