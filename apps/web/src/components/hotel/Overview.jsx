import React, { useState } from 'react';
import { ErrorBox, Loading, ScreenTitle } from '../Common';
import { Kpi } from '../partner/ui';
import { describeError } from '../../lib/api';
import { getStats } from '../../data/hotel';
import { money } from '../../lib/time';
import { STATUS, fmtD, fmtDT, today, useLoad } from './kit';

// GET /v1/hotel/stats?from&to: mọi số liệu theo ngày nhận phòng; mặc định 30 ngày trước đến 30 ngày sau hôm nay (tối đa 92 ngày).
export default function Overview() {
  const [from, setFrom] = useState(today(-30));
  const [to, setTo] = useState(today(30));
  const q = { from: new Date(`${from}T00:00:00`), to: new Date(new Date(`${to}T00:00:00`).getTime() + 86400000) };
  const s = useLoad(() => getStats(q), [from, to]);
  const d = s.data;
  return (
    <>
      <ScreenTitle title="Tổng quan">Phòng hiện tại; đơn và doanh thu tính theo ngày nhận phòng trong khoảng chọn (tối đa 92 ngày).</ScreenTitle>
      <div className="filter-bar">
        <label>Từ <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} data-testid="ov-from" /></label>
        <label>Đến <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} data-testid="ov-to" /></label>
      </div>
      {s.loading && <Loading />}
      {s.err && <ErrorBox onRetry={s.reload}>{describeError(s.err)}</ErrorBox>}
      {d && !s.loading && (
        <>
          <p className="muted">Số liệu phòng tại {fmtDT(d.asOf)}. Đơn và doanh thu theo ngày nhận phòng: {fmtD(d.revenue.from)} đến {fmtD(d.revenue.to)}.</p>
          <h2>Phòng</h2>
          <Kpi items={[['Phòng bán được', d.rooms.totalSellable, 'k-total'], ['Đang có khách', d.rooms.occupiedNow], ['Đã giữ/đặt', d.rooms.reservedNow], ['Đang khóa/bảo trì', d.rooms.blockedNow], ['Còn trống', d.rooms.availableNow, 'k-avail']]} />
          <h2>Doanh thu (phần khách sạn nhận, theo ngày nhận phòng)</h2>
          <Kpi items={[['Đã thực hiện (đã trả phòng)', money(d.revenue.realized.hotelShareVnd), 'k-real'], ['Dự kiến (đã xác nhận/đang ở)', money(d.revenue.expected.hotelShareVnd), 'k-exp']]} />
          <h2>Đơn đặt phòng (theo ngày nhận phòng)</h2>
          <Kpi items={[['Tổng số đơn', d.bookings.total, 'k-bk'], ['Chờ xác nhận (hiện tại)', d.bookings.pendingApproval, 'k-pend'], ...Object.entries(d.bookings.byStatus).filter(([, v]) => v.count).map(([k, v]) => [STATUS[k]?.[0] || k, `${v.count} (${money(v.totalVnd)})`])]} />
        </>
      )}
    </>
  );
}
