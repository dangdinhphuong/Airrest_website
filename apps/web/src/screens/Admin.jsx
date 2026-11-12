import React from 'react';
import { useApp } from '../state/store';
import { adminTabs } from '../lib/adminNav';
import { resolveTab, visibleTabs } from '../lib/access';
import { ADMIN_TAB_UI } from '../components/admin';

// Cổng quản trị: tab hiển thị theo quyền của phiên (lib/adminNav.js). Khung (menu, đăng nhập, kiểm khu vực) ở App.jsx.
export default function Admin() {
  const { state } = useApp();
  const tab = resolveTab(visibleTabs(state.session, adminTabs), state.partnerTab);
  const Tab = ADMIN_TAB_UI[tab];
  return Tab ? <Tab key={tab} /> : null;
}
