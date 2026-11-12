import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Kpi } from '../partner/ui';
import { money } from '../../lib/time';
import { Filters, LoadView, Table, useLoad, d } from './kit';

export const BOOKING_LABEL = { PENDING_PAYMENT: 'Chờ thanh toán', PENDING: 'Chờ khách sạn xác nhận', CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đang ở', CHECKED_OUT: 'Đã trả phòng', CANCELLED: 'Đã hủy', REJECTED: 'Bị từ chối', EXPIRED: 'Hết hạn', NO_SHOW: 'Không đến' };

export default function Dashboard() {
  const [q, setQ] = useState({});
  const r = useLoad('/dashboard', q);
  return (
    <>
      <ScreenTitle title="Tổng quan" kicker="Toàn hệ thống" />
      <Filters fields={[['from', 'Từ ngày', 'date'], ['to', 'Đến ngày', 'date']]} onApply={setQ} />
      <LoadView r={r}>{(x) => (
        <>
          <p className="muted">Khoảng {d(x.range.from)} – {d(x.range.to)} · cập nhật {new Date(x.asOf).toLocaleTimeString('vi-VN')}</p>
          <Kpi items={[
            ['Tổng số đơn', x.bookings.total, 'k-total'], ['Đơn chờ khách sạn duyệt', x.bookings.pendingApproval, 'k-pending'],
            ['Doanh thu đã thực hiện (KS nhận)', money(x.revenue.realized.hotelShareVnd), 'k-rev-real'], ['Doanh thu dự kiến (KS nhận)', money(x.revenue.expected.hotelShareVnd), 'k-rev-exp'],
            ['Phí dịch vụ đã thu', money(x.revenue.realized.serviceFeeVnd), 'k-fee-real'], ['Phí dịch vụ dự kiến', money(x.revenue.expected.serviceFeeVnd), 'k-fee-exp'],
            ['Khách sạn chờ duyệt', x.hotels.pendingApproval, 'k-hotel-pending'], ['Ticket hỗ trợ đang mở', x.support.open, 'k-support-open'],
            ['Ticket đang xử lý', x.support.inProgress, 'k-support-prog'], ['Yêu cầu xe chờ', x.shuttle.requested, 'k-shuttle-req'],
            ['Xe đã phân công', x.shuttle.assigned, 'k-shuttle-asg'], ['Yêu cầu đổi/hủy chờ', x.changeRequests.pending, 'k-cr'],
          ]} />
          <section className="card"><h3>Đơn theo trạng thái</h3>
            <Table rowKey={(r2) => r2.s} rows={Object.entries(x.bookings.byStatus).map(([s, v]) => ({ s, ...v }))} cols={[['Trạng thái', (r2) => BOOKING_LABEL[r2.s] || r2.s], ['Số đơn', (r2) => r2.count], ['Tổng tiền', (r2) => money(r2.totalVnd)]]} />
          </section>
          <section className="card"><h3>Khách sạn theo trạng thái</h3>
            <Table rowKey={(r2) => r2.s} rows={Object.entries(x.hotels.byStatus).map(([s, count]) => ({ s, count }))} cols={[['Trạng thái', (r2) => r2.s], ['Số lượng', (r2) => r2.count]]} />
          </section>
          <section className="card"><h3>Số đơn tạo mỗi ngày</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }} role="img" aria-label="Biểu đồ số đơn theo ngày">
              {x.bookings.trend.map((t) => <div key={t.date} title={`${t.date}: ${t.count}`} style={{ flex: 1, minWidth: 2, background: 'var(--blue-800)', height: `${Math.max(2, (t.count / Math.max(1, ...x.bookings.trend.map((z) => z.count))) * 100)}%`, opacity: t.count ? 1 : .2 }} />)}
            </div>
          </section>
        </>
      )}</LoadView>
    </>
  );
}
