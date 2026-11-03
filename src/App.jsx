import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/store';
import { ROLE_LABEL, usePartner } from './mock/partner';
import { adminNav, hotelNav, resolveTab } from './lib/partnerNav';
import { ROLE_META } from './lib/rbac';
import { MODULES, USER_ACTIVE, USER_CRUMB, moduleOf, userNav } from './lib/shellNav';
import { refreshFlight } from './mock/service';
import { AppNav, Breadcrumb, Footer, Header, Progress } from './components/Layout';
import FlightStatusCard from './components/FlightStatusCard';
import SimTools from './components/SimTools';
import { ErrorBox, Notice } from './components/Common';
import { leaveTime } from './lib/domain';
import { reminderProperty } from './screens/Reminder';
import { fmtTime } from './lib/time';
import Home from './screens/Home';
import Status from './screens/Status';
import Advice from './screens/Advice';
import Stays from './screens/Stays';
import Detail from './screens/Detail';
import Booking from './screens/Booking';
import Reminder from './screens/Reminder';
import Terminal from './screens/Terminal';
import Support from './screens/Support';
import Request from './screens/Request';
import Login from './screens/Login';
import Hotel from './screens/Hotel';
import Admin from './screens/Admin';

const SCREENS = { login: Login, hotel: Hotel, admin: Admin, home: Home, status: Status, advice: Advice, stays: Stays, detail: Detail, booking: Booking, reminder: Reminder, terminal: Terminal, support: Support, request: Request };
const NEEDS_FLIGHT = ['status', 'advice', 'booking', 'reminder', 'request'];

function Shell() {
  const { state, dispatch, getProperty } = useApp();
  const { screen, flight, simNow, bannerClosedAt, reminder, browseAirport, propertyId } = state;
  const P = usePartner();
  // Phiên bị thu hồi (khóa, vô hiệu hóa, gán lại vai trò, thu hồi thủ công) có hiệu lực ngay (SA-FR-003, SA-FR-005).
  useEffect(() => {
    if (state.session && !P.sessions.some((s) => s.id === state.session.sid && !s.revoked)) dispatch({ type: 'logout' });
  }, [P.sessions, state.session, dispatch]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const refresh = async () => {
    setRefreshing(true); setRefreshError(false);
    try { dispatch({ type: 'flightRefreshed', flight: await refreshFlight(flight, simNow) }); }
    catch { setRefreshError(true); }
    finally { setRefreshing(false); }
  };

  const prop = flight ? reminderProperty(state, getProperty) : null;
  const leave = flight ? leaveTime(flight, prop) : null;
  const remindDue = reminder.enabled && leave != null && simNow >= leave && screen !== 'reminder';
  const airport = flight ? flight.origin : browseAirport;
  const hasStay = !!prop;

  const onGo = (scr) => dispatch({ type: 'go', screen: scr });
  const effective = NEEDS_FLIGHT.includes(screen) && !flight ? 'home' : screen;
  const Body = SCREENS[effective] || Stays;
  const partnerScreen = ['login', 'hotel', 'admin'].includes(effective); // khu vực đối tác không có thẻ chuyến bay
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sess = state.session;
  const area = sess ? ROLE_META[sess.role]?.area : null;
  const activeModule = moduleOf(effective);
  const acc = sess ? P.accounts.find((a) => a.id === sess.id) || sess : null;
  const ownProp = acc?.propertyId ? getProperty(acc.propertyId, simNow) : null;
  let panel = null; let crumb = [];
  if (activeModule === 'user') {
    const items = userNav(!!flight, hasStay);
    panel = { title: 'Người dùng', context: 'Người dùng cuối, không cần đăng nhập', group: 'Menu', items, cur: USER_ACTIVE[effective], onPick: (i) => onGo(i.screen) };
    crumb = [MODULES.user.label, ...(USER_CRUMB[effective] || [])];
  } else if (activeModule && sess && area === activeModule) {
    const items = (activeModule === 'hotel' ? hotelNav(sess.role, !!acc.propertyId) : adminNav(sess.role)).map((i) => ({ ...i, count: i.id === 'bookings' ? P.bookings.filter((b) => b.propertyId === acc.propertyId && ['pending', 'confirmed'].includes(b.status)).length : i.id === 'pickups' ? P.pickups.filter((x) => x.propertyId === acc.propertyId && !['done', 'failed'].includes(x.status)).length : 0 }));
    const cur = resolveTab(items, state.partnerTab);
    if (items.length) panel = { title: `Chức năng của ${ROLE_LABEL[sess.role]}`, context: `${ROLE_LABEL[sess.role]} · ${sess.id}`, group: 'Menu', items, cur, testid: 'partner-sidebar', testPrefix: 'tab-', onPick: (i) => dispatch({ type: 'partnerTab', id: i.id }) };
    crumb = [MODULES[activeModule].label, ...(panel ? [items.find((i) => i.id === cur)?.label] : [])];
  } else if (activeModule) crumb = [MODULES[activeModule].label];
  else crumb = ['Đăng nhập'];
  const context = activeModule === 'hotel' && ownProp ? ownProp.name : activeModule ? MODULES[activeModule].label : 'Đăng nhập';
  const showCard = flight && !partnerScreen && effective !== 'home' && effective !== 'support';

  if (effective === 'login') return <Login />; // trang đăng nhập/đăng ký toàn trang, không dùng khung ứng dụng

  return (
    <div className="app">
      <a className="skip" href="#main">Bỏ qua tới nội dung chính</a>
      <Header airport={airport} canChangeAirport={!flight} onAirport={(a) => dispatch({ type: 'setBrowseAirport', airport: a })}
        onHome={() => dispatch({ type: 'reset' })} onHelp={() => onGo('support')} onSearch={(code) => dispatch({ type: 'goLookup', code })}
        session={state.session} user={state.user} onPartner={() => onGo(state.session ? (ROLE_META[state.session.role]?.area === 'admin' ? 'admin' : 'hotel') : state.user ? 'stays' : 'login')} onLogout={() => dispatch({ type: 'logout' })}
        onMenu={() => setDrawerOpen((v) => !v)} menuOpen={drawerOpen} hasMenu={!!panel} context={context} />
      <AppNav panel={panel} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main id="main" className={`feed ${effective === 'stays' ? 'feed-map' : ''} ${panel ? 'with-panel' : ''}`}>
        <div className="feed-in">
          <Breadcrumb items={crumb} />
          {showCard && <Progress screen={effective} />}
          {remindDue && <Notice tone="warn" title="Đến giờ rời nơi nghỉ" role="alert">Giờ rời {fmtTime(leave)} (giờ mô phỏng) đã tới. <button type="button" className="link-btn" onClick={() => onGo('reminder')}>Xem nhắc giờ</button></Notice>}
          {showCard && <FlightStatusCard flight={flight} simNow={simNow} onRefresh={refresh} refreshing={refreshing} bannerClosedAt={bannerClosedAt} onCloseBanner={() => dispatch({ type: 'closeBanner' })} />}
          {refreshError && <ErrorBox title="Không làm mới được" onRetry={refresh}>Dịch vụ dữ liệu mô phỏng tạm thời lỗi. Dữ liệu cũ vẫn được giữ.</ErrorBox>}
          <Body />
          <Footer />
        </div>
      </main>
      <SimTools simNow={simNow} hasFlight={!!flight} canChange={!!flight && flight.status !== 'cancelled'} dispatch={dispatch} />
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
