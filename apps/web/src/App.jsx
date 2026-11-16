import React, { useState } from 'react';
import { AppProvider, useApp } from './state/store';
import { adminTabs } from './lib/adminNav';
import { hotelTabs } from './lib/hotelNav';
import { areasOf, resolveTab, visibleTabs } from './lib/access';
import { MODULES, moduleOf } from './lib/shellNav';
import { StaffShell } from './components/shell/StaffShell';
import { Notice } from './components/Common';
import Login from './screens/Login';
import Hotel from './screens/Hotel';
import Admin from './screens/Admin';
import { switchWorkingHotel } from './data/business';
import { describeError } from './lib/api';
import ApiBanner from './components/ApiBanner';
import UserSite from './screens/user/UserSite';
import UserHome from './screens/user/Home';
import Stays from './screens/user/Stays';
import { Account, PaymentResult, Support, Track } from './screens/user/Pages';
import Flights from './screens/user/Flights';
import HotelDetail from './screens/user/HotelDetail';

const PARTNER_SCREENS = { hotel: Hotel, admin: Admin };
const USER_PAGES = { stays: Stays, flights: Flights, detail: HotelDetail, track: Track, support: Support, account: Account, payment: PaymentResult }; // màn khác của người dùng = trang chủ

const TABS = { hotel: hotelTabs, admin: adminTabs };

function Shell() {
  const { state, dispatch } = useApp();
  const { screen, session: sess } = state;

  const [switchErr, setSwitchErr] = useState(null);
  const onSwitchHotel = async (id) => {
    setSwitchErr(null);
    try { const r = await switchWorkingHotel(id); dispatch({ type: 'switchHotel', hotelId: r.hotel.id, hotels: r.hotels }); } catch (e) { setSwitchErr(describeError(e)); }
  };

  const onGo = (scr) => dispatch({ type: 'go', screen: scr });
  const activeModule = moduleOf(screen);

  if (state.booting) return <div className="app" role="status" aria-live="polite" style={{ padding: 32 }}>Đang khôi phục phiên đăng nhập…</div>;
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
  const Body = PARTNER_SCREENS[screen];
  const other = areas.find((x) => x !== screen);
  // Tìm nhanh: mọi chức năng của các cổng tài khoản được vào.
  const entries = areas.flatMap((a) => visibleTabs(sess, TABS[a]).map((item) => ({ key: `${a}:${item.id}`, area: a, areaLabel: MODULES[a].label, item })));

  return (
    <StaffShell portal={MODULES[activeModule]} items={items} cur={cur} entries={entries}
      onPick={(i) => dispatch({ type: 'partnerTab', id: i.id })} onRoute={(area, id) => dispatch({ type: 'route', screen: area, partnerTab: id })}
      hotelPicker={allowed && screen === 'hotel' && sess.business ? { hotels: sess.hotels || [], currentId: sess.hotelId, onSwitch: onSwitchHotel } : null}
      session={sess} user={state.user} onHome={() => dispatch({ type: 'reset' })} onLogout={() => dispatch({ type: 'logout' })}
      onLogin={() => onGo('login')}
      other={allowed && other ? { label: `Chuyển sang cổng ${MODULES[other].label}`, onClick: () => onGo(other), testid: 'switch-area' } : null}>
      {!sess && <Notice tone="warn" title="Bạn chưa đăng nhập">Khu vực này dành cho khách sạn hoặc nhân sự AIRREST. <button type="button" className="link-btn" onClick={() => onGo('login')}>Đăng nhập</button></Notice>}
      {sess && !allowed && <Notice tone="error" title="Không có quyền truy cập khu vực này" role="alert">Tài khoản {sess.name} chưa được cấp quyền cho khu vực này. {areas.length ? <button type="button" className="link-btn" onClick={() => onGo(areas[0])} data-testid="denied-back">Về khu vực của bạn</button> : <button type="button" className="link-btn" onClick={() => dispatch({ type: 'logout' })}>Đăng xuất</button>}</Notice>}
      {switchErr && <Notice tone="error" onClose={() => setSwitchErr(null)}>{switchErr}</Notice>}
      {allowed && <Body />}
    </StaffShell>
  );
}

export default function App() {
  return <AppProvider><ApiBanner /><Shell /></AppProvider>;
}
