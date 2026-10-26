import React, { useState } from 'react';
import { AppProvider, useApp } from './state/store';
import { refreshFlight } from './mock/service';
import { Footer, Header, MobileNav, Progress, Sidebar } from './components/Layout';
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
  const showCard = flight && !partnerScreen && effective !== 'home' && effective !== 'support';

  return (
    <div className="app">
      <a className="skip" href="#main">Bỏ qua tới nội dung chính</a>
      <Header airport={airport} canChangeAirport={!flight} onAirport={(a) => dispatch({ type: 'setBrowseAirport', airport: a })}
        onHome={() => dispatch({ type: 'reset' })} onHelp={() => onGo('support')} onSearch={(code) => dispatch({ type: 'goLookup', code })}
        session={state.session} onPartner={() => onGo(state.session ? (state.session.role === 'admin' ? 'admin' : 'hotel') : 'login')} onLogout={() => dispatch({ type: 'logout' })} />
      <div className="frame">
        <Sidebar screen={effective} hasFlight={!!flight} hasStay={hasStay} onGo={onGo} />
        <main id="main" className={`feed ${effective === 'stays' ? 'feed-map' : ''}`}>
          {showCard && <Progress screen={effective} />}
          {remindDue && <Notice tone="warn" title="Đến giờ rời nơi nghỉ" role="alert">Giờ rời {fmtTime(leave)} (giờ mô phỏng) đã tới. <button type="button" className="link-btn" onClick={() => onGo('reminder')}>Xem nhắc giờ</button></Notice>}
          {showCard && <FlightStatusCard flight={flight} simNow={simNow} onRefresh={refresh} refreshing={refreshing} bannerClosedAt={bannerClosedAt} onCloseBanner={() => dispatch({ type: 'closeBanner' })} />}
          {refreshError && <ErrorBox title="Không làm mới được" onRetry={refresh}>Dịch vụ dữ liệu mô phỏng tạm thời lỗi. Dữ liệu cũ vẫn được giữ.</ErrorBox>}
          <Body />
          <Footer />
        </main>
      </div>
      <MobileNav screen={effective} hasFlight={!!flight} hasStay={hasStay} onGo={onGo} />
      <SimTools simNow={simNow} hasFlight={!!flight} canChange={!!flight && flight.status !== 'cancelled'} dispatch={dispatch} />
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
