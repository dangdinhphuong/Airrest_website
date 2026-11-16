import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { DataTable, ErrorState, FilterBar, Loading, PageHeader, Tabs } from '../ui';
import { Kpi } from '../partner/ui';
import Select from '../Select';
import { describeError } from '../../lib/api';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { money } from '../../lib/time';
import { useApp } from '../../state/store';
import { fetchReportCsv, getBusinessRevenue, getHotelRevenue, saveBlob } from '../../data/business';
import { today, useAction, useLoad } from './kit';

const DEFINE = 'Khoảng mặc định: 30 ngày trước đến 30 ngày sau hôm nay. Doanh thu tính theo ngày nhận phòng (giờ Việt Nam). Phần khách sạn nhận = tiền phòng + tiền xe đưa đón, không gồm phí dịch vụ của Airrest (phí dịch vụ hiển thị riêng). "Đã thực hiện" = đơn đã trả phòng; "Dự kiến" = đơn đã xác nhận hoặc đang ở. Khoảng tối đa 366 ngày.';
const SETTLE_ST = { LOCKED: 'Đã chốt', PAID: 'Đã trả' };

// Biểu đồ cột đơn giản (CSS thuần): cột đậm = đã thực hiện, cột nhạt = dự kiến.
function Bars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.realizedVnd + i.expectedVnd));
  return (
    <div className="rv-bars" role="img" aria-label="Biểu đồ doanh thu theo kỳ" data-testid="rv-chart">
      {items.map((i) => (
        <div key={i.bucket} title={`${i.bucket}: đã thực hiện ${money(i.realizedVnd)}, dự kiến ${money(i.expectedVnd)}`}>
          <i className="exp" style={{ height: `${(i.expectedVnd / max) * 100}%` }} /><i style={{ height: `${(i.realizedVnd / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

const moneyCols = [
  { key: 'bk', header: 'Số đơn', align: 'right', render: (r) => r.bookings },
  { key: 'rl', header: 'Đã thực hiện', align: 'right', render: (r) => money(r.realizedVnd) },
  { key: 'ex', header: 'Dự kiến', align: 'right', render: (r) => money(r.expectedVnd) },
  { key: 'fr', header: 'Phí DV đã thực hiện', align: 'right', render: (r) => money(r.serviceFeeRealizedVnd) },
  { key: 'fe', header: 'Phí DV dự kiến', align: 'right', render: (r) => money(r.serviceFeeExpectedVnd) },
];
const withTotal = (rows, totals, label) => [...rows, { ...totals, id: '__total', bucket: label, name: label, code: '' }];
const isTotal = (r) => r.id === '__total';

function HotelReport({ q, groupBy }) {
  const { state } = useApp();
  const hotelId = state.session.hotelId;
  const r = useLoad(() => getHotelRevenue({ hotelId, ...q, groupBy }), [hotelId, q.from, q.to, groupBy]);
  const d = r.data;
  if (r.loading && !d) return <Loading />;
  if (r.err) return <ErrorState onRetry={r.reload}>{describeError(r.err)}</ErrorState>;
  if (!d) return null;
  const t = d.totals;
  return (
    <>
      <Kpi items={[['Số đơn', t.bookings, 'rv-k-bk'], ['Đã thực hiện', money(t.realizedVnd), 'rv-k-real'], ['Dự kiến', money(t.expectedVnd), 'rv-k-exp'], ['Phí dịch vụ (đã thực hiện)', money(t.serviceFeeRealizedVnd), 'rv-k-fee'], ['Phí dịch vụ (dự kiến)', money(t.serviceFeeExpectedVnd)]]} />
      <Bars items={d.items} />
      <DataTable testid="rv-table" rowTestid="rv-row" rows={withTotal(d.items, t, 'Tổng cộng')} rowKey={(x) => x.bucket} rowClass={(x) => (isTotal(x) ? 'row-total' : '')}
        columns={[{ key: 'b', header: groupBy === 'month' ? 'Tháng' : 'Ngày', render: (x) => (isTotal(x) ? <strong>{x.bucket}</strong> : x.bucket) }, ...moneyCols]} />
      <h2>Quyết toán</h2>
      <p className="muted">Các kỳ (tháng) Airrest đã chốt chi trả trùng khoảng ngày chọn; tính theo cả tháng của kỳ, không cắt theo ngày lẻ.</p>
      {d.settlement.items.length === 0
        ? <p className="muted" data-testid="rv-settle-empty">Chưa có kỳ nào được chốt trong khoảng này.</p>
        : <>
            <Kpi items={[['Giá hợp đồng', money(d.settlement.totals.grossVnd)], ['Hoa hồng Airrest', money(d.settlement.totals.commissionVnd)], ['Số khách sạn nhận', money(d.settlement.totals.netVnd), 'rv-k-net']]} />
            <DataTable rows={d.settlement.items} rowKey={(x) => x.period} columns={[
              { key: 'p', header: 'Kỳ', render: (x) => x.period }, { key: 's', header: 'Trạng thái', render: (x) => SETTLE_ST[x.status] || x.status },
              { key: 'g', header: 'Giá hợp đồng', align: 'right', render: (x) => money(x.grossVnd) }, { key: 'c', header: 'Hoa hồng', align: 'right', render: (x) => money(x.commissionVnd) }, { key: 'n', header: 'Số nhận', align: 'right', render: (x) => money(x.netVnd) }]} />
          </>}
    </>
  );
}

function BusinessReport({ q }) {
  const r = useLoad(() => getBusinessRevenue(q), [q.from, q.to]);
  const d = r.data;
  if (r.loading && !d) return <Loading />;
  if (r.err) return <ErrorState onRetry={r.reload}>{describeError(r.err)}</ErrorState>;
  if (!d) return null;
  const t = d.totals;
  return (
    <>
      <Kpi items={[['Số khách sạn', d.hotels.length], ['Số đơn', t.bookings], ['Đã thực hiện', money(t.realizedVnd), 'rv-k-real'], ['Dự kiến', money(t.expectedVnd), 'rv-k-exp'], ['Phí dịch vụ (đã thực hiện)', money(t.serviceFeeRealizedVnd)], ['Số nhận đã chốt (net)', money(t.settlement.netVnd), 'rv-k-net']]} />
      <DataTable testid="rv-table" rowTestid="rv-row" rows={withTotal(d.hotels, t, 'Tổng cộng')} rowKey={(x) => x.id ?? x.hotelId} rowClass={(x) => (isTotal(x) ? 'row-total' : '')}
        columns={[{ key: 'h', header: 'Khách sạn', render: (x) => (isTotal(x) ? <strong>{x.name}</strong> : <><strong>{x.name}</strong><br /><small className="muted">{x.code}</small></>) }, ...moneyCols,
          { key: 'sn', header: 'Số nhận đã chốt (net)', align: 'right', render: (x) => money(x.settlement.netVnd) }]} />
    </>
  );
}

// Báo cáo doanh thu: khách sạn đang chọn (mọi tài khoản có booking:read) và tổng doanh nghiệp (business:report:read).
export default function Revenue() {
  const { state } = useApp();
  const biz = hasPerm(state.session, PERM.BUSINESS_REPORT_READ) && !!state.session.business;
  const [mode, setMode] = useState('hotel');
  const [from, setFrom] = useState(today(-30));
  const [to, setTo] = useState(today(30));
  const [groupBy, setGroupBy] = useState('day');
  const { run, note, busy } = useAction();
  const q = { from, to };
  const csv = () => run(async () => saveBlob(await fetchReportCsv(mode === 'business' ? 'revenue/summary' : 'revenue', mode === 'business' ? q : { hotelId: state.session.hotelId, ...q, groupBy })), 'Đã tải file CSV.');
  const hotelName = state.session.hotels?.find((h) => h.id === state.session.hotelId)?.name;
  return (
    <>
      <PageHeader title="Báo cáo doanh thu" description={mode === 'business' ? 'Tổng doanh thu từng khách sạn của doanh nghiệp.' : `Doanh thu riêng${hotelName ? ` của ${hotelName}` : ' khách sạn đang chọn'}.`}
        actions={<button type="button" className="btn" onClick={csv} disabled={busy} data-testid="rv-csv"><Download size={16} aria-hidden="true" /> Tải CSV</button>} />
      {biz && <Tabs label="Phạm vi báo cáo" value={mode} onChange={setMode} tabs={[{ id: 'hotel', label: 'Khách sạn đang chọn' }, { id: 'business', label: 'Tổng doanh nghiệp' }]} />}
      <FilterBar testid="rv-filters">
        <label>Từ <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} data-testid="rv-from" /></label>
        <label>Đến <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} data-testid="rv-to" /></label>
        {mode === 'hotel' && <label>Nhóm theo <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} data-testid="rv-group"><option value="day">Ngày</option><option value="month">Tháng</option></Select></label>}
      </FilterBar>
      <p className="rv-note" data-testid="rv-define">{DEFINE}</p>
      {note}
      {mode === 'business' ? <BusinessReport q={q} /> : <HotelReport q={q} groupBy={groupBy} />}
    </>
  );
}
