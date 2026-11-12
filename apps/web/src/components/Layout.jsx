import React, { useState } from 'react';
import { ChevronRight, LogOut, Menu, Plane, UserCircle } from 'lucide-react';

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

// Chân trang cổng nhân sự: chỉ thương hiệu và tên cổng đang làm việc.
export function Footer({ portal }) {
  return (
    <footer className="airrest-dark-footer staff-footer">
      <div className="shell staff-footer-in">
        <div className="logo" style={{ color: '#ffffff' }}>
          <span className="logo-mark"><Plane size={18} aria-hidden="true" /></span>
          <span className="logo-text" style={{ color: '#ffffff' }}><strong>AIRREST</strong></span>
        </div>
        {portal && <span className="staff-footer-portal">Cổng {portal}</span>}
        <span className="staff-footer-copy">© 2026 AIRREST</span>
      </div>
    </footer>
  );
}
