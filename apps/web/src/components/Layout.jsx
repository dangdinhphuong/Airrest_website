import React, { useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, Hotel, LogOut, MapPin, Menu, Plane, Search, ShieldCheck, UserCircle } from 'lucide-react';
import { ROLE_LABEL } from '../mock/partner';
import { SimBadge } from './Common';
import { FEAT_TONE } from '../lib/shellNav';

// Khung trang theo mẫu react/apps/walo-erp: Header cao 60px, thanh module 80px, bảng tính năng 240px, breadcrumb, vùng nội dung.
export const AIRPORTS = [{ id: 'HAN', label: 'Nội Bài (HAN)' }, { id: 'SGN', label: 'Tân Sơn Nhất (SGN)' }];

export function Header({ airport, canChangeAirport, onAirport, onHome, onHelp, onSearch, session, user, onPartner, onLogout, onMenu, menuOpen, hasMenu, context, onGo }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = AIRPORTS.find((a) => a.id === airport) || AIRPORTS[0];
  return (
    <header className="topbar">
      <div className="topbar-in">
        {hasMenu && <button type="button" className="menu-btn" id="app-menu-button" onClick={onMenu} aria-label="Mở menu" aria-expanded={!!menuOpen} aria-controls="app-drawer"><Menu size={20} aria-hidden="true" /></button>}
        <button type="button" className="logo logo-btn" onClick={onHome} aria-label="AIRREST, về trang chủ" data-testid="logo">
          <span className="logo-mark"><Plane size={18} aria-hidden="true" /></span>
          <span className="logo-text"><strong>AIRREST</strong><small>Nơi nghỉ quanh sân bay</small></span>
        </button>
        {onGo && (
          <nav className="topbar-nav-links" aria-label="Điều hướng chính">
            <button type="button" className="topbar-nav-link" onClick={() => onGo('home')}>Chuyến bay</button>
            <button type="button" className="topbar-nav-link" onClick={() => onGo('stays')}>Nơi nghỉ</button>
            <button type="button" className="topbar-nav-link" onClick={() => onGo('request')}>Theo dõi booking</button>
            <button type="button" className="topbar-nav-link" onClick={() => onGo('support')}>Trợ giúp</button>
          </nav>
        )}
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
          <input aria-label="Tra cứu theo số hiệu chuyến bay" placeholder="Số hiệu chuyến bay (VD: VN218)" value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} maxLength={6} autoComplete="off" />
          <button type="submit" className="btn btn-sm btn-primary">Kiểm tra</button>
        </form>
        <div className="topbar-right">
          <SimBadge tone="sim">Mô phỏng</SimBadge>
          <button type="button" className="btn btn-ghost" onClick={onPartner} data-testid="partner-entry"><UserCircle size={18} aria-hidden="true" /> <span className="hide-sm">{session ? ROLE_LABEL[session.role] : user ? user.name : 'Đăng nhập'}</span></button>
          {(session || user) && <button type="button" className="btn btn-ghost" onClick={onLogout} data-testid="logout" aria-label="Đăng xuất"><LogOut size={16} aria-hidden="true" /></button>}
          <button type="button" className="btn btn-ghost" onClick={onHelp}><HelpCircle size={16} aria-hidden="true" /> <span className="hide-sm">Trợ giúp</span></button>
        </div>
      </div>
    </header>
  );
}

export function MobileBottomNav({ screen, onGo }) {
  if (!onGo) return null;
  const isFlight = ['home', 'status'].includes(screen);
  const isStays = ['stays', 'detail'].includes(screen);
  const isBooking = ['request', 'booking'].includes(screen);
  const isSupport = screen === 'support';
  return (
    <nav className="airrest-mobile-bar" aria-label="Điều hướng di động">
      <button type="button" className={`airrest-mobile-tab ${isFlight ? 'active' : ''}`} onClick={() => onGo('home')}>
        <Plane size={18} aria-hidden="true" />
        <span>Chuyến bay</span>
      </button>
      <button type="button" className={`airrest-mobile-tab ${isStays ? 'active' : ''}`} onClick={() => onGo('stays')}>
        <Hotel size={18} aria-hidden="true" />
        <span>Nơi nghỉ</span>
      </button>
      <button type="button" className={`airrest-mobile-tab ${isBooking ? 'active' : ''}`} onClick={() => onGo('request')}>
        <Search size={18} aria-hidden="true" />
        <span>Booking</span>
      </button>
      <button type="button" className={`airrest-mobile-tab ${isSupport ? 'active' : ''}`} onClick={() => onGo('support')}>
        <HelpCircle size={18} aria-hidden="true" />
        <span>Trợ giúp</span>
      </button>
    </nav>
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

export function Footer({ onGo }) {
  return (
    <footer className="airrest-dark-footer">
      <div className="shell">
        <div className="airrest-footer-grid">
          <div className="footer-col">
            <div className="logo" style={{ color: '#ffffff' }}>
              <span className="logo-mark"><Plane size={18} aria-hidden="true" /></span>
              <span className="logo-text" style={{ color: '#ffffff' }}><strong>AIRREST</strong></span>
            </div>
            <p style={{ marginTop: '14px', fontSize: '13px', lineHeight: '1.6', color: '#94a3b8' }}>
              Giúp hành khách tìm lại sự chủ động khi chuyến bay thay đổi. Giải pháp kết nối nơi nghỉ quanh sân bay Nội Bài và Tân Sơn Nhất.
            </p>
          </div>
          <div className="footer-col">
            <h4>Hành khách</h4>
            <ul className="footer-links-list">
              <li><button type="button" onClick={() => onGo?.('stays')} style={{ color: '#94a3b8', fontSize: '13.5px' }}>Tìm nơi nghỉ</button></li>
              <li><button type="button" onClick={() => onGo?.('request')} style={{ color: '#94a3b8', fontSize: '13.5px' }}>Theo dõi booking</button></li>
              <li><button type="button" onClick={() => onGo?.('support')} style={{ color: '#94a3b8', fontSize: '13.5px' }}>Trung tâm hỗ trợ</button></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Vận hành</h4>
            <ul className="footer-links-list">
              <li><button type="button" onClick={() => onGo?.('login')} style={{ color: '#94a3b8', fontSize: '13.5px' }}>Cổng quản trị & Đối tác</button></li>
              <li><span style={{ color: '#64748b' }}>Hỗ trợ Nội Bài (HAN)</span></li>
              <li><span style={{ color: '#64748b' }}>Hỗ trợ Tân Sơn Nhất (SGN)</span></li>
            </ul>
          </div>
          <div className="footer-col">
            <div className="footer-security-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#bfdbfe', fontWeight: '700', marginBottom: '8px' }}>
                <ShieldCheck size={18} />
                <span>Nghiên cứu MVP</span>
              </div>
              Bản mô phỏng nghiên cứu UI/UX. Không tích hợp thanh toán thật, hãng bay thật hoặc tồn phòng thời gian thực.
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '36px', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', fontSize: '12.5px', color: '#64748b' }}>
          <span>© 2026 AIRREST. Bản quyền thuộc đồ án nghiên cứu.</span>
          <span>Dữ liệu mô phỏng · Cập nhật 2026</span>
        </div>
      </div>
    </footer>
  );
}
