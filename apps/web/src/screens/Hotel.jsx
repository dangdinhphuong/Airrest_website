import React from 'react';
import { useApp } from '../state/store';
import { hotelTabs } from '../lib/hotelNav';
import { resolveTab, visibleTabs } from '../lib/access';
import { HOTEL_TAB_UI } from '../components/hotel';

// Cổng khách sạn: tab hiển thị theo quyền của phiên (lib/hotelNav.js). Khung (menu, đăng nhập, kiểm khu vực) ở App.jsx.
export default function Hotel() {
  const { state } = useApp();
  const tab = resolveTab(visibleTabs(state.session, hotelTabs), state.partnerTab);
  const Tab = HOTEL_TAB_UI[tab];
  return Tab ? <Tab key={tab} /> : null;
}
