import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, Menu, Plane, Search } from 'lucide-react';
import { groupNav } from '../../lib/navTree';
import { isTyping, useMediaQuery, useShellPrefs } from './useShell';
import { Breadcrumb } from './Breadcrumb';
import { ShellSidebar } from './ShellSidebar';
import { HotelPicker, QuickSearch, ShortcutHelp, UserMenu } from './ShellOverlays';

// Khung cổng nhân sự (Khách sạn / Quản trị) theo xlvm AppShell: header cố định 64px · sidebar cây · vùng nội dung.
// Props:
//   portal   {key,label}  cổng hiện tại (MODULES[...])
//   items    mục nav đã lọc theo quyền (có `group`) — rỗng thì không có sidebar
//   cur      id mục đang chọn; onPick(item) chọn mục
//   entries  [{key,area,areaLabel,item}] cho tìm nhanh (mọi cổng được vào)
//   onRoute(area, tabId) nhảy tới mục ở cổng bất kỳ
//   session, user, other {label,onClick} (chuyển cổng), onLogin, onLogout, onHome
//   hotelPicker {hotels,currentId,onSwitch(id)} chủ doanh nghiệp: chọn khách sạn đang làm việc (header + menu người dùng)
//   children nội dung trang (thông báo + màn tab); mỗi màn tự vẽ PageHeader (components/ui)
export function StaffShell({ portal, items, cur, onPick, entries, onRoute, session, user, other, onLogin, onLogout, onHome, hotelPicker, headerExtra, children }) {
  const prefs = useShellPrefs();
  const wide = useMediaQuery('(min-width: 1024px)');
  const drawer = !wide;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const filterRef = useRef(null);
  const [focusReq, setFocusReq] = useState(0);
  const hasNav = items.length > 0;
  const groups = useMemo(() => groupNav(items), [items]);
  const curItem = items.find((i) => i.id === cur);
  const collapsed = !drawer && prefs.collapsed;
  const toggleNav = () => (drawer ? setDrawerOpen((v) => !v) : prefs.setCollapsed(!prefs.collapsed));
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => { if (wide) setDrawerOpen(false); }, [wide]);
  useEffect(() => { if (focusReq) filterRef.current?.focus(); }, [focusReq, collapsed, drawerOpen]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); if (!drawer && hasNav) prefs.setCollapsed(!prefs.collapsed); }
      else if (e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); if (drawer) setDrawerOpen(true); else prefs.setCollapsed(false); setFocusReq((n) => n + 1); }
      else if (!e.ctrlKey && !e.altKey && !e.metaKey && !isTyping(e.target) && !document.querySelector('[role="dialog"]')) {
        if (e.key === '/') { e.preventDefault(); setSearchOpen(true); } else if (e.key === '?') { e.preventDefault(); setHelpOpen(true); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, hasNav, prefs]);

  const crumb = ['AIRREST', portal.label, ...(curItem ? [curItem.group, curItem.label] : [])];
  const userBlock = session && (
    <div className="sx-drawer-user"><span className="sx-avatar" aria-hidden="true">{session.name?.trim().charAt(0).toUpperCase()}</span><div><strong>{session.name}</strong><small>Cổng {portal.label}</small></div></div>
  );

  return (
    <div className="app sx-app">
      <a className="skip" href="#main">Bỏ qua tới nội dung chính</a>
      <header className="sx-header">
        {hasNav && <button type="button" className="sx-menu-btn" id="app-menu-button" onClick={toggleNav} aria-label={drawer ? 'Mở menu điều hướng' : collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} aria-expanded={drawer ? drawerOpen : !collapsed} aria-controls="app-drawer"><Menu size={22} aria-hidden="true" /></button>}
        <button type="button" className="logo logo-btn sx-logo" onClick={onHome} aria-label="AIRREST, về trang chủ" data-testid="logo">
          <span className="logo-mark"><Plane size={18} aria-hidden="true" /></span>
          <span className="logo-text"><strong>AIRREST</strong><small>Nơi nghỉ quanh sân bay</small></span>
        </button>
        <span className="sx-portal" title={portal.label}>Cổng {portal.label}</span>
        <div className="sx-header-right">
          {entries.length > 0 && (
            <button type="button" className="sx-search-btn" onClick={() => setSearchOpen(true)} aria-label="Tìm nhanh chức năng (Ctrl+K)" data-testid="quick-search-open">
              <Search size={16} aria-hidden="true" /><span className="hide-sm">Tìm nhanh…</span><kbd className="sx-kbd hide-sm">Ctrl K</kbd>
            </button>
          )}
          <button type="button" className="sx-icon-btn hide-sm" onClick={() => setHelpOpen(true)} aria-label="Phím tắt (?)" title="Phím tắt (?)"><HelpCircle size={20} aria-hidden="true" /></button>
          {headerExtra}
          {hotelPicker && <HotelPicker {...hotelPicker} />}
          <UserMenu hotelPicker={hotelPicker} name={session?.name || user?.name} sub={session ? `Cổng ${portal.label}` : 'Tài khoản người dùng'} onLogin={onLogin} extra={other} onSettings={session && hasNav ? () => onRoute(portal.key, 'settings') : undefined} onShortcuts={() => setHelpOpen(true)} onLogout={onLogout} />
        </div>
      </header>
      {hasNav && (
        <ShellSidebar groups={groups} cur={cur} onPick={onPick} collapsed={collapsed} drawer={drawer} open={drawerOpen} onClose={closeDrawer} filterRef={filterRef}
          closed={prefs.closed} onToggleGroup={prefs.toggleGroup} onToggleCollapsed={() => prefs.setCollapsed(!prefs.collapsed)} label="Chức năng được cấp" testid="partner-sidebar" userBlock={userBlock} />
      )}
      <main id="main" className={`feed sx-main ${hasNav && !drawer ? (collapsed ? 'nav-mini' : 'nav-full') : ''}`}>
        <div className="feed-in sx-content">
          <Breadcrumb items={crumb} />
          {children}
        </div>
      </main>
      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} entries={entries} onPick={(e) => onRoute(e.area, e.item.id)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
