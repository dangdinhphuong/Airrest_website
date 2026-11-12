import React, { useState } from 'react';
import { AppProvider, useApp } from './state/store';
import { adminTabs } from './lib/adminNav';
import { hotelTabs } from './lib/hotelNav';
import { areasOf, resolveTab, visibleTabs } from './lib/access';
import { MODULES, moduleOf } from './lib/shellNav';
import { AppNav, Breadcrumb, Footer, Header } from './components/Layout';
import { Notice } from './components/Common';
import Login from './screens/Login';
import Hotel from './screens/Hotel';
import Admin from './screens/Admin';
import ApiBanner from './components/ApiBanner';
import UserSite from './screens/user/UserSite';
import UserHome from './screens/user/Home';
import { Account, HotelDetail, PaymentResult, Support, Track } from './screens/user/Pages';

const PARTNER_SCREENS = { hotel: Hotel, admin: Admin };
const USER_PAGES = { detail: HotelDetail, track: Track, support: Support, account: Account, payment: PaymentResult }; // màn khác của người dùng = trang chủ

const TABS = { hotel: hotelTabs, admin: adminTabs };

function Shell() {
  const { state, dispatch } = useApp();
  const { screen, session: sess } = state;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onGo = (scr) => dispatch({ type: 'go', screen: scr });
  const activeModule = moduleOf(screen);

  if (screen === 'login') return <Login />; // trang đăng nhập/đăng ký toàn trang, không dùng khung ứng dụng
  if (activeModule === 'user') { // người dùng cuối: giao diện AIRREST riêng, không dùng khung có menu bên
    const Page = USER_PAGES[screen] || UserHome;
    return <UserSite page={USER_PAGES[screen] ? screen : 'home'}><Page /></UserSite>;
  }

  // Cổng nhân sự: vào được khu vực nào là do QUYỀN của phiên (areasOf), không do tên vai trò.
  const areas = areasOf(sess);
  const allowed = !!sess && areas.includes(screen);
  const items = allowed ? visibleTabs(sess, TABS[screen]) : [];
  const cur = resolveTab(items, state.partnerTab);
  const panel = allowed && items.length ? { title: 'Chức năng được cấp', context: `${sess.name}`, group: 'Menu', items, cur, testid: 'partner-sidebar', testPrefix: 'tab-', onPick: (i) => dispatch({ type: 'partnerTab', id: i.id }) } : null;
  const crumb = [MODULES[activeModule].label, ...(panel ? [items.find((i) => i.id === cur)?.label] : [])];
  const Body = PARTNER_SCREENS[screen];
  const other = areas.find((x) => x !== screen);

  return (
    <div className="app">
      <a className="skip" href="#main">Bỏ qua tới nội dung chính</a>
      <Header onHome={() => dispatch({ type: 'reset' })} session={sess} user={state.user} onPartner={() => onGo(sess ? (areas[0] ?? 'login') : state.user ? 'home' : 'login')} onLogout={() => dispatch({ type: 'logout' })}
        onMenu={() => setDrawerOpen((v) => !v)} menuOpen={drawerOpen} hasMenu={!!panel} context={MODULES[activeModule].label} />
      <AppNav panel={panel} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main id="main" className={`feed ${panel ? 'with-panel' : ''}`}>
        <div className="feed-in">
          <Breadcrumb items={crumb} />
          {!sess && <Notice tone="warn" title="Bạn chưa đăng nhập">Khu vực này dành cho khách sạn hoặc nhân sự AIRREST. <button type="button" className="link-btn" onClick={() => onGo('login')}>Đăng nhập</button></Notice>}
          {sess && !allowed && <Notice tone="error" title="Không có quyền truy cập khu vực này" role="alert">Tài khoản {sess.name} chưa được cấp quyền cho khu vực này. {areas.length ? <button type="button" className="link-btn" onClick={() => onGo(areas[0])} data-testid="denied-back">Về khu vực của bạn</button> : <button type="button" className="link-btn" onClick={() => dispatch({ type: 'logout' })}>Đăng xuất</button>}</Notice>}
          {allowed && other && <p style={{ fontSize: 12, margin: '0 0 12px' }}>Tài khoản này còn quyền vào khu vực khác: <button type="button" className="link-btn" onClick={() => onGo(other)} data-testid="switch-area">Chuyển sang {MODULES[other].label}</button></p>}
          {allowed && <Body />}
          <Footer portal={MODULES[activeModule].label.toLowerCase()} />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return <AppProvider><ApiBanner /><Shell /></AppProvider>;
}
