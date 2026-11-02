import React from 'react';
import { useApp } from '../state/store';
import { ROLE_LABEL, usePartner } from '../mock/partner';
import { ROLE_META } from '../lib/rbac';
import { adminNav, resolveTab } from '../lib/partnerNav';
import { EmptyBox, Notice, ScreenTitle, SimBadge } from '../components/Common';
import { LockedList } from '../components/partner/ui';
import { AccountsTab, PartnersTab } from '../components/partner/AdminTabs1';
import { ConfigTab, RbacTab } from '../components/partner/AdminTabs2';
import { AuditTab, CasesTab, MonitorTab, ReportsTab } from '../components/partner/AdminTabs3';
import { Denied, NeedLogin } from './Hotel';

// M11 — Khu vực quản trị và nhân sự Airrest. Gói SRS hotel-admin, phân hệ System Administration (Proposed). Quyền theo lib/rbac.js.
export default function Admin() {
  const { state, dispatch } = useApp();
  usePartner();
  if (!state.session) return <NeedLogin dispatch={dispatch} />;
  if (ROLE_META[state.session.role]?.area !== 'admin') return <Denied dispatch={dispatch} session={state.session} target="hotel" />;
  return <AdminWork session={state.session} simNow={state.simNow} request={state.request} flight={state.flight} />;
}

function AdminWork({ session, simNow, request, flight }) {
  const { state } = useApp();
  const role = session.role;
  // Menu chức năng nằm ở bảng tính năng bên trái (App.jsx); màn nhỏ mở bằng nút Menu ở Header.
  const items = adminNav(role).map((i) => ({ ...i, icon: <i.icon size={16} aria-hidden="true" /> }));
  const cur = resolveTab(items, state.partnerTab);
  if (!items.length) return <EmptyBox title="Không có chức năng">Tài khoản chưa có quyền nào (deny by default).</EmptyBox>;
  return (
    <>
      <ScreenTitle kicker={`${ROLE_LABEL[role]} · ${session.id} · Mô phỏng`} title={items.find((i) => i.id === cur)?.label || 'Quản trị'} />
      <Notice tone="info" title="Môi trường mô phỏng">Thay đổi chỉ có hiệu lực trong phiên này, không có giao dịch thật và được ghi nhật ký. Vai trò và quyền là đề xuất chưa được duyệt; chỉ hiện các chức năng vai trò này được phép. <SimBadge>Mô phỏng</SimBadge></Notice>
      {role === 'auditor' && <Notice tone="warn" title="Chỉ đọc">Vai trò kiểm toán chỉ xem; mọi thao tác ghi bị ẩn và bị từ chối ở backend.</Notice>}
      {cur === 'properties' && <PartnersTab session={session} simNow={simNow} />}
      {cur === 'accounts' && <AccountsTab session={session} simNow={simNow} />}
      {cur === 'rbac' && <RbacTab session={session} simNow={simNow} />}
      {cur === 'config' && <ConfigTab session={session} simNow={simNow} />}
      {cur === 'monitor' && <MonitorTab session={session} simNow={simNow} request={request} flight={flight} />}
      {cur === 'cases' && <CasesTab session={session} simNow={simNow} />}
      {cur === 'log' && <AuditTab session={session} simNow={simNow} />}
      {cur === 'reports' && <ReportsTab session={session} simNow={simNow} />}
      {cur === 'pending' && <><LockedList area="admin" /><LockedList area="hotel" tab="pending" title="Đối soát, thanh toán và thông báo đặt phòng (khách sạn), chờ quyết định" /></>}
    </>
  );
}
