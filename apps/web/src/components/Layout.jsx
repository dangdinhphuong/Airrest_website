import React, { useState } from 'react';
import { ChevronRight, LogOut, Menu, Plane, ShieldCheck, UserCircle } from 'lucide-react';

// Khung cổng nhân sự (khách sạn/quản trị): header chỉ có logo, khu vực đang làm việc, tài khoản và đăng xuất.
export function Header({ onHome, session, user, onPartner, onLogout, onMenu, menuOpen, hasMenu, context }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        {hasMenu && <button type="button" className="menu-btn" id="app-menu-button" onClick={onMenu} aria-label="Mở menu" aria-expanded={!!menuOpen} aria-controls="app-drawer"><Menu size={20} aria-hidden="true" /></button>}
        <button type="button" className="logo logo-btn" onClick={onHome} aria-label="AIRREST, về trang chủ" data-testid="logo">
          <span className="logo-mark"><Plane size={18} aria-hidden="true" /></span>
          <span className="logo-text"><strong>AIRREST</strong><small>Nơi nghỉ quanh sân bay</small></span>
        </button>
        {context && <span className="topbar-context" title={context}>{context}</span>}
        <div className="topbar-right">
          <button type="button" className="btn btn-ghost" onClick={onPartner} data-testid="partner-entry"><UserCircle size={18} aria-hidden="true" /> <span className="hide-sm">{session ? session.name : user ? user.name : 'Đăng nhập'}</span></button>
          {(session || user) && <button type="button" className="btn btn-ghost" onClick={onLogout} data-testid="logout" aria-label="Đăng xuất"><LogOut size={16} aria-hidden="true" /></button>}
        </div>
      </div>
    </header>
  );
}

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
                        <span className="feat-ico"><Icon size={22} strokeWidth={2} aria-hidden="true" /></span><span className="feat-label">{i.short ?? i.label}</span>
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
              <li><button type="button" onClick={() => onGo?.('track')} style={{ color: '#94a3b8', fontSize: '13.5px' }}>Theo dõi booking</button></li>
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
