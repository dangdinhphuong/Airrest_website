import React, { useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, LogOut, MapPin, Menu, Plane, Search, ShieldCheck, UserCircle } from 'lucide-react';
import { ROLE_LABEL } from '../mock/partner';
import { SimBadge } from './Common';
import { FEAT_TONE } from '../lib/shellNav';

// Khung trang theo mẫu react/apps/walo-erp: Header cao 60px, thanh module 80px, bảng tính năng 240px, breadcrumb, vùng nội dung.
export const AIRPORTS = [{ id: 'HAN', label: 'Nội Bài (HAN)' }, { id: 'SGN', label: 'Tân Sơn Nhất (SGN)' }];

export function Header({ airport, canChangeAirport, onAirport, onHome, onHelp, onSearch, session, onPartner, onLogout, onMenu, menuOpen, hasMenu, context }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = AIRPORTS.find((a) => a.id === airport) || AIRPORTS[0];
  return (
    <header className="topbar">
      <div className="topbar-in">
        {hasMenu && <button type="button" className="menu-btn" id="app-menu-button" onClick={onMenu} aria-label="Mở menu" aria-expanded={!!menuOpen} aria-controls="app-drawer"><Menu size={20} aria-hidden="true" /></button>}
        <button type="button" className="logo logo-btn" onClick={onHome} aria-label="AIRREST, về trang chủ" data-testid="logo">
          <span className="logo-mark"><Plane size={19} aria-hidden="true" /></span>
          <span className="logo-text"><strong>AIRREST</strong><small>Nơi nghỉ quanh sân bay</small></span>
        </button>
        {context && <span className="topbar-context" title={context}>{context}</span>}
        <div className="airport-pick">
          <button type="button" className="pick-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} disabled={!canChangeAirport}
            title={canChangeAirport ? 'Chọn sân bay' : 'Sân bay lấy theo chuyến bay đang theo dõi'}>
            <MapPin size={15} aria-hidden="true" /> <span>{cur.label}</span> {canChangeAirport && <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {open && (
            <>
              <div className="pick-backdrop" onClick={() => setOpen(false)} />
              <ul className="pick-menu" role="listbox" aria-label="Sân bay">
                {AIRPORTS.map((a) => (
                  <li key={a.id}><button type="button" role="option" aria-selected={a.id === airport} className={a.id === airport ? 'on' : ''} onClick={() => { onAirport(a.id); setOpen(false); }}>{a.label}</button></li>
                ))}
              </ul>
            </>
          )}
        </div>
        <form className="header-search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(q.trim().toUpperCase()); }}>
          <Search size={16} aria-hidden="true" />
          <input aria-label="Tra cứu theo số hiệu chuyến bay" placeholder="Nhập số hiệu chuyến bay, ví dụ VN218" value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} maxLength={6} autoComplete="off" />
          <button type="submit" className="btn btn-sm btn-primary">Kiểm tra</button>
        </form>
        <div className="topbar-right">
          <SimBadge tone="sim">Bản mô phỏng</SimBadge>
          <button type="button" className="btn btn-ghost" onClick={onPartner} data-testid="partner-entry"><UserCircle size={18} aria-hidden="true" /> <span className="hide-sm">{session ? ROLE_LABEL[session.role] : 'Đối tác'}</span></button>
          {session && <button type="button" className="btn btn-ghost" onClick={onLogout} data-testid="logout" aria-label="Đăng xuất"><LogOut size={16} aria-hidden="true" /></button>}
          <button type="button" className="btn btn-ghost" onClick={onHelp}><HelpCircle size={16} aria-hidden="true" /> <span className="hide-sm">Trợ giúp</span></button>
        </div>
      </div>
    </header>
  );
}

// Thanh menu con 72px (ô icon màu, tooltip khi rê chuột). Từ 1024px luôn hiện; nhỏ hơn thì nằm trong ngăn kéo.
export function AppNav({ panel, open, onClose }) {
  const showPanel = !!panel;
  const [tip, setTip] = useState(null);
  const showTip = (e, i) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: i.disabled ? `${i.label} (${i.hint})` : i.label, top: r.top + r.height / 2, left: r.right + 8 }); };
  return (
    <>
      {open && <div className="drawer-mask" onClick={onClose} aria-hidden="true" />}
      <div id="app-drawer" className={`shell-nav ${open ? 'open' : ''} ${showPanel ? '' : 'no-panel'}`}>
        {showPanel && (
          <nav className="panel" aria-label={panel.title} data-testid={panel.testid} onScroll={() => setTip(null)}>
            <div className="panel-scroll">
              <ul className="panel-list">
                {panel.items.map((i) => {
                  const Icon = i.icon;
                  const on = panel.cur === i.id;
                  return (
                    <li key={i.id}>
                      <button type="button" className={`feat ${on ? 'on' : ''}`} disabled={i.disabled} onClick={() => { panel.onPick(i); onClose(); }} aria-current={on ? 'page' : undefined}
                        aria-label={i.label} onMouseEnter={(e) => showTip(e, i)} onMouseLeave={() => setTip(null)} onFocus={(e) => showTip(e, i)} onBlur={() => setTip(null)}
                        data-testid={panel.testPrefix ? `${panel.testPrefix}${i.id}` : undefined}>
                        <span className="feat-ico" style={{ background: FEAT_TONE[i.id] || '#475569' }}><Icon size={20} strokeWidth={2.2} aria-hidden="true" /></span>
                        {i.count > 0 && <span className="side-count" aria-label={`${i.count} mục`}>{i.count}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
        )}
      </div>
      {tip && <div className="tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>{tip.text}</div>}
    </>
  );
}

// Đường dẫn vị trí: Module › Tính năng › (màn con).
export function Breadcrumb({ items }) {
  if (!items?.length) return null;
  return (
    <nav className="crumb" aria-label="Đường dẫn vị trí" data-testid="breadcrumb">
      <ol>{items.map((t, i) => <li key={t} aria-current={i === items.length - 1 ? 'page' : undefined}>{i > 0 && <ChevronRight size={14} aria-hidden="true" />}<span>{t}</span></li>)}</ol>
    </nav>
  );
}

const STEPS = [
  ['status', 'Chuyến bay'], ['advice', 'Gợi ý'], ['stays', 'Nơi nghỉ'], ['booking', 'Đặt chỗ'], ['reminder', 'Nhắc giờ'],
];
export function Progress({ screen }) {
  const map = { detail: 'stays', terminal: 'advice', request: 'status' };
  const cur = map[screen] || screen;
  const idx = STEPS.findIndex((s) => s[0] === cur);
  if (idx < 0) return null;
  return (
    <nav className="progress" aria-label="Các bước">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s[0]} className={i === idx ? 'cur' : i < idx ? 'done' : ''} aria-current={i === idx ? 'step' : undefined}><span>{i + 1}</span>{s[1]}</li>
        ))}
      </ol>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <ShieldCheck size={18} aria-hidden="true" />
      <p><strong>Prototype nghiên cứu.</strong> Mọi dữ liệu chuyến bay, nơi nghỉ, giá, đặt chỗ và phản hồi của hãng/cơ sở đều là mô phỏng; không có giao dịch thật và không gửi dữ liệu tới hãng hay khách sạn. Airrest không thu thập số điện thoại, email hay giấy tờ.</p>
    </footer>
  );
}
