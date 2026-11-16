import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, CornerDownLeft, LogOut, Repeat, Settings, UserCircle, Keyboard } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { matchesVi } from '../../lib/navTree';

export const SHORTCUT_GROUPS = [
  { title: 'Chung', rows: [
    [['/'], 'Mở tìm nhanh chức năng'], [['Ctrl', 'K'], 'Mở tìm nhanh chức năng'], [['Alt', 'M'], 'Đến ô "Tìm chức năng" trên thanh điều hướng'],
    [['Ctrl', 'B'], 'Thu gọn / mở rộng thanh điều hướng'], [['?'], 'Mở bảng phím tắt'], [['Esc'], 'Đóng hộp thoại, ngăn kéo, danh sách chọn'],
  ] },
  { title: 'Thanh điều hướng', rows: [
    [['↑', '↓'], 'Di chuyển giữa các mục'], [['→', '←'], 'Mở / đóng nhóm'], [['Enter'], 'Mở chức năng đang chọn'],
  ] },
];
const Kbd = ({ children }) => <kbd className="sx-kbd">{children}</kbd>;

export function ShortcutHelp({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Phím tắt" size="md">
      {SHORTCUT_GROUPS.map((g) => (
        <section key={g.title} className="sx-sc-group">
          <h3>{g.title}</h3>
          <table className="sx-sc-table"><tbody>{g.rows.map(([keys, d]) => <tr key={d + keys.join()}><th scope="row">{keys.map((k, i) => <React.Fragment key={k}>{i > 0 && ' + '}<Kbd>{k}</Kbd></React.Fragment>)}</th><td>{d}</td></tr>)}</tbody></table>
        </section>
      ))}
    </Modal>
  );
}

// Tìm nhanh (xlvm GlobalSearch, rút gọn): chỉ tìm chức năng của các cổng tài khoản được vào. entries = [{ key, area, areaLabel, item }].
export function QuickSearch({ open, onClose, entries, onPick }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); } }, [open]);
  const res = entries.filter((e) => !q.trim() || matchesVi(`${e.item.label} ${e.item.group || ''} ${e.areaLabel}`, q));
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [sel]);
  const pick = (e) => { onPick(e); onClose(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(res.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && res[sel]) { e.preventDefault(); pick(res[sel]); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Tìm nhanh chức năng" size="md" testid="quick-search">
      <input data-autofocus="" className="sx-qs-input" type="search" role="combobox" aria-expanded="true" aria-controls="sx-qs-list" aria-label="Nhập tên chức năng" placeholder="Nhập tên chức năng…" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} />
      <ul id="sx-qs-list" ref={listRef} role="listbox" className="sx-qs-list">
        {res.map((e, i) => { const Icon = e.item.icon; return (
          <li key={e.key} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => pick(e)}>
            <Icon size={18} aria-hidden="true" /><span className="sx-qs-name">{e.item.label}</span><small>{e.areaLabel}{e.item.group ? ` › ${e.item.group}` : ''}</small>{i === sel && <CornerDownLeft size={14} aria-hidden="true" />}
          </li>
        ); })}
        {!res.length && <li className="sx-qs-empty muted">Không tìm thấy chức năng phù hợp.</li>}
      </ul>
    </Modal>
  );
}

// Menu người dùng (xlvm UserMenu): tên + cổng hiện tại, chuyển cổng, phím tắt, đăng xuất. Chưa đăng nhập: nút "Đăng nhập" đi thẳng.
// Chọn khách sạn đang làm việc (header, màn rộng). Trên điện thoại dùng danh sách trong UserMenu.
export function HotelPicker({ hotels, currentId, onSwitch }) {
  if (!hotels.length) return null;
  return (
    <label className="sx-hotel-pick hide-sm">
      <Building2 size={16} aria-hidden="true" />
      <span className="sr-only">Khách sạn đang làm việc</span>
      <select value={currentId || ''} onChange={(e) => e.target.value && onSwitch(e.target.value)} data-testid="hotel-switch" aria-label="Khách sạn đang làm việc">
        {!currentId && <option value="">Chọn khách sạn…</option>}
        {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>
    </label>
  );
}

export function UserMenu({ name, sub, onLogin, extra, onSettings, onShortcuts, onLogout, hotelPicker }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!name) return <button type="button" className="btn btn-ghost" onClick={onLogin} data-testid="partner-entry"><UserCircle size={18} aria-hidden="true" /> <span className="hide-sm">Đăng nhập</span></button>;
  const close = (fn) => () => { setOpen(false); fn(); };
  return (
    <div className="sx-user" ref={ref}>
      <button type="button" className="sx-user-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} data-testid="partner-entry">
        <span className="sx-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
        <span className="sx-user-txt hide-sm"><strong>{name}</strong>{sub && <small>{sub}</small>}</span>
        <ChevronDown size={16} className="hide-sm" aria-hidden="true" />
      </button>
      {open && (
        <div className="sx-menu" role="menu">
          <div className="sx-menu-head"><strong>{name}</strong>{sub && <small>{sub}</small>}</div>
          {hotelPicker?.hotels.length > 0 && (
            <div className="sx-menu-hotels show-sm" role="group" aria-label="Khách sạn đang làm việc">
              <small>Khách sạn đang làm việc</small>
              {hotelPicker.hotels.map((h) => (
                <button key={h.id} type="button" role="menuitemradio" aria-checked={h.id === hotelPicker.currentId} onClick={close(() => h.id !== hotelPicker.currentId && hotelPicker.onSwitch(h.id))} data-testid={`menu-hotel-${h.id}`}>
                  <Building2 size={16} aria-hidden="true" /> {h.name}{h.id === hotelPicker.currentId && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          {extra && <button type="button" role="menuitem" onClick={close(extra.onClick)} data-testid={extra.testid}><Repeat size={16} aria-hidden="true" /> {extra.label}</button>}
          {onSettings && <button type="button" role="menuitem" onClick={close(onSettings)} data-testid="open-settings"><Settings size={16} aria-hidden="true" /> Cài đặt</button>}
          <button type="button" role="menuitem" onClick={close(onShortcuts)}><Keyboard size={16} aria-hidden="true" /> Phím tắt <Kbd>?</Kbd></button>
          <button type="button" role="menuitem" className="danger" onClick={close(onLogout)} data-testid="logout"><LogOut size={16} aria-hidden="true" /> Đăng xuất</button>
        </div>
      )}
    </div>
  );
}
