import React from 'react';
import { useApp } from '../state/store';
import { ROLE_LABEL, dayInventory, usePartner } from '../mock/partner';
import { ROLE_META, can } from '../lib/rbac';
import { isOpen } from '../lib/domain';
import { fmtTime, money } from '../lib/time';
import { hotelNav, resolveTab } from '../lib/partnerNav';
import { EmptyBox, Notice, ScreenTitle, SimBadge } from '../components/Common';
import { LockedList } from '../components/partner/ui';
import { BookingsTab, OverviewTab } from '../components/partner/HotelTabs1';
import { InventoryTab, RoomsTab } from '../components/partner/HotelTabs2';
import { PickupsTab, ProfileTab, QualityTab, ReportsTab } from '../components/partner/HotelTabs3';

export function NeedLogin({ dispatch }) {
  return (
    <>
      <ScreenTitle title="Cần đăng nhập" kicker="Khu vực đối tác · Mô phỏng" />
      <Notice tone="warn" title="Bạn chưa đăng nhập">Khu vực này dành cho khách sạn hoặc nhân sự Airrest. <button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: 'login' })} data-testid="to-login">Đăng nhập (mô phỏng)</button></Notice>
    </>
  );
}
export function Denied({ dispatch, session, target }) {
  return (
    <>
      <ScreenTitle title="Không có quyền truy cập" kicker="Khu vực đối tác · Mô phỏng" />
      <Notice tone="error" title="Vai trò của bạn không dùng được khu vực này" role="alert">
        Tài khoản {session.id} ({ROLE_LABEL[session.role] || 'chưa có vai trò'}) không có quyền vào khu vực này (deny by default).{' '}
        <button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: target })} data-testid="denied-back">Về khu vực của bạn</button>
      </Notice>
    </>
  );
}

// M10 — Khu vực khách sạn (gồm lái xe). Gói SRS hotel-admin, phân hệ Hotel Management (Proposed). Quyền theo ma trận ở lib/rbac.js.
export default function Hotel() {
  const { state, dispatch, getProperty } = useApp();
  const { session, simNow } = state;
  const P = usePartner();
  if (!session) return <NeedLogin dispatch={dispatch} />;
  if (ROLE_META[session.role]?.area !== 'hotel') return <Denied dispatch={dispatch} session={session} target="admin" />;
  const acc = P.accounts.find((a) => a.id === session.id) || session;
  const eff = { ...session, propertyId: acc.propertyId, tenantId: acc.tenantId };
  const p = acc.propertyId ? getProperty(acc.propertyId, simNow) : null;
  return <HotelWork session={eff} p={p} simNow={simNow} />;
}

function HotelWork({ session, p, simNow }) {
  const { state } = useApp();
  const { bookings, pickups } = usePartner();
  const role = session.role;
  const mineB = p ? bookings.filter((b) => b.propertyId === p.id) : [];
  const mineP = p ? pickups.filter((x) => x.propertyId === p.id) : [];
  const counts = { bookings: mineB.filter((b) => ['pending', 'confirmed'].includes(b.status)).length, pickups: mineP.filter((x) => !['done', 'failed'].includes(x.status)).length };
  // Menu chức năng nằm ở bảng tính năng bên trái (App.jsx); màn nhỏ mở bằng nút Menu ở Header.
  const items = hotelNav(role, !!p).map((i) => ({ ...i, icon: <i.icon size={16} aria-hidden="true" />, count: counts[i.id] ?? null }));
  const cur = resolveTab(items, state.partnerTab);
  if (!items.length) return <EmptyBox title="Không có chức năng">Tài khoản chưa có quyền nào (deny by default).</EmptyBox>;
  const visible = !p ? '—' : p.locked ? 'Không (đối tác tạm ngưng hoặc bị khoá)' : p.roomsLeft <= 0 ? 'Không (hết phòng)' : isOpen(p, simNow) ? 'Có (đang nhận khách)' : 'Không (ngoài giờ nhận khách)';
  return (
    <>
      <ScreenTitle kicker={`${p ? p.name : 'Hồ sơ đối tác mới'} · ${ROLE_LABEL[role]} · Mô phỏng`} title={items.find((i) => i.id === cur)?.label || 'Khách sạn'} />
      <Notice tone="info" title="Môi trường mô phỏng">Thay đổi chỉ có hiệu lực trong phiên này, không gửi tới hệ thống thật và được ghi nhật ký. Quyền theo vai trò là đề xuất chưa được duyệt. <SimBadge>Mô phỏng</SimBadge></Notice>
      {p && (
        <section className="card property-summary" aria-label="Tóm tắt cơ sở" data-testid="hotel-summary">
          <dl className="spec spec-row">
            <div><dt>Đang hiển thị cho người dùng cuối</dt><dd data-testid="hotel-visible">{visible}</dd></div>
            <div><dt>Phòng bán được hôm nay</dt><dd data-testid="hotel-rooms">{p.roomsLeft}</dd></div>
            <div><dt>Giá tổng</dt><dd data-testid="hotel-price">{money(p.price)}</dd></div>
            <div><dt>Cập nhật lúc</dt><dd>{fmtTime(p.updatedAt)} (mô phỏng)</dd></div>
          </dl>
        </section>
      )}
      {!p && <Notice tone="info" title="Chưa có cơ sở">Tạo hồ sơ đối tác mới và gửi duyệt. Khi được duyệt, bạn có đủ các chức năng quản lý.</Notice>}
      {cur === 'overview' && <OverviewTab p={p} session={session} simNow={simNow} />}
      {cur === 'bookings' && <BookingsTab p={p} session={session} simNow={simNow} />}
      {cur === 'rooms' && <RoomsTab key={`r-${p.id}`} p={p} session={session} simNow={simNow} />}
      {cur === 'inventory' && <InventoryTab key={`i-${p.id}`} p={p} session={session} simNow={simNow} />}
      {cur === 'profile' && <ProfileTab p={p} session={session} simNow={simNow} />}
      {cur === 'quality' && <QualityTab p={p} />}
      {cur === 'reports' && <ReportsTab p={p} session={session} simNow={simNow} />}
      {cur === 'pickups' && <PickupsTab p={p} session={session} simNow={simNow} />}
      {cur === 'pending' && <LockedList area="hotel" />}
    </>
  );
}
