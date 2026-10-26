import React, { useState } from 'react';
import { BedDouble, BellRing, Building2, ChevronDown, Compass, HelpCircle, Hotel, LogOut, MapPin, Plane, Search, ShieldCheck } from 'lucide-react';
import { ROLE_LABEL } from '../mock/partner';
import { SimBadge } from './Common';

// Khung trang kiểu Couppa HomePageV2: header trên cùng, thanh icon bên trái (desktop), nội dung giữa, panel chi tiết bên phải,
// thanh điều hướng dưới (mobile). Màu, font và icon giữ nguyên bộ của Airrest.
export const AIRPORTS = [{ id: 'HAN', label: 'Nội Bài (HAN)' }, { id: 'SGN', label: 'Tân Sơn Nhất (SGN)' }];

export function Header({ airport, canChangeAirport, onAirport, onHome, onHelp, onSearch, session, onPartner, onLogout }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = AIRPORTS.find((a) => a.id === airport) || AIRPORTS[0];
  return (
    <header className="topbar">
      <div className="topbar-in">
        <button type="button" className="logo logo-btn" onClick={onHome} aria-label="AIRREST, về trang chủ">
          <span className="logo-mark"><Plane size={19} aria-hidden="true" /></span>
          <span className="logo-text"><strong>AIRREST</strong><small>Nơi nghỉ quanh sân bay</small></span>
        </button>
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
          <button type="button" className="btn btn-ghost" onClick={onPartner} data-testid="partner-entry"><Building2 size={16} aria-hidden="true" /> <span className="hide-sm">{session ? ROLE_LABEL[session.role] : 'Đối tác'}</span></button>
          {session && <button type="button" className="btn btn-ghost" onClick={onLogout} data-testid="logout" aria-label="Đăng xuất"><LogOut size={16} aria-hidden="true" /></button>}
          <button type="button" className="btn btn-ghost" onClick={onHelp}><HelpCircle size={16} aria-hidden="true" /> <span className="hide-sm">Trợ giúp</span></button>
        </div>
      </div>
    </header>
  );
}

export const navItems = (hasFlight, hasStay) => [
  { key: 'stays', label: 'Khám phá', icon: Compass, screen: 'stays' },
  { key: 'home', label: 'Chuyến bay', icon: Plane, screen: hasFlight ? 'status' : 'home' },
  { key: 'advice', label: 'Gợi ý', icon: BedDouble, screen: 'advice', needFlight: true },
  { key: 'reminder', label: 'Nhắc giờ', icon: BellRing, screen: 'reminder', needFlight: true, needStay: true },
  { key: 'terminal', label: 'Nhà ga', icon: Hotel, screen: 'terminal' },
  { key: 'support', label: 'Hỗ trợ', icon: HelpCircle, screen: 'support' },
].map((i) => ({ ...i, disabled: (i.needFlight && !hasFlight) || (i.needStay && !hasStay) }));

const ACTIVE = { stays: 'stays', detail: 'stays', booking: 'stays', status: 'home', home: 'home', request: 'home', advice: 'advice', reminder: 'reminder', terminal: 'terminal', support: 'support' };

export function Sidebar({ screen, hasFlight, hasStay, onGo }) {
  return (
    <aside className="sidebar" aria-label="Điều hướng chính">
      <nav>
        {navItems(hasFlight, hasStay).map((i) => {
          const Icon = i.icon;
          return (
            <button key={i.key} type="button" className={`side-item ${ACTIVE[screen] === i.key ? 'on' : ''}`} disabled={i.disabled} onClick={() => onGo(i.screen)}
              aria-current={ACTIVE[screen] === i.key ? 'page' : undefined} title={i.disabled ? 'Cần nhập chuyến bay trước' : i.label}>
              <Icon size={20} aria-hidden="true" /><span>{i.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav({ screen, hasFlight, hasStay, onGo }) {
  return (
    <nav className="mobile-nav" aria-label="Điều hướng nhanh">
      {navItems(hasFlight, hasStay).filter((i) => i.key !== 'terminal').map((i) => {
        const Icon = i.icon;
        return (
          <button key={i.key} type="button" className={ACTIVE[screen] === i.key ? 'on' : ''} disabled={i.disabled} onClick={() => onGo(i.screen)} aria-current={ACTIVE[screen] === i.key ? 'page' : undefined}>
            <Icon size={20} aria-hidden="true" /><span>{i.label}</span>
          </button>
        );
      })}
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
