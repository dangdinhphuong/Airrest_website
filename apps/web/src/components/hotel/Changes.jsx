import React, { useState } from 'react';
import { ConfirmAction, DataTable, FilterBar, PageHeader, StatusBadge, Tag } from '../ui';
import * as H from '../../data/hotel';
import { fmtD, fmtDT, useAction, usePaged } from './kit';
import Select from '../Select';
import { money } from '../../lib/time';
import { describeError } from '../../lib/api';

const TYPE = { CANCEL: 'Hủy đơn', CHANGE: 'Đổi ngày' };
const REASON = { CHANGE_OF_PLAN: 'Đổi kế hoạch', FLIGHT_CANCELLED: 'Chuyến bay bị hủy', FLIGHT_RESCHEDULED: 'Chuyến bay đổi giờ', HEALTH: 'Sức khỏe', OTHER: 'Lý do khác' };

// Báo giá đã lưu trong yêu cầu (tính cho cả đơn nhiều dòng phòng): đổi ngày = số đêm + tổng mới + chênh lệch; hủy = giữ/hoàn.
export const quoteText = (q) => !q ? '' : q.kind === 'CHANGE' ? `${q.newNights} đêm, tổng mới ${money(q.newTotalVnd)} (${q.diffVnd >= 0 ? '+' : ''}${money(q.diffVnd)})` : q.kind === 'CANCEL' ? `Giữ ${money(q.keepVnd)}, hoàn ${money(q.refundVnd)}` : '';

// /v1/hotel/change-requests: danh sách theo trạng thái, duyệt, từ chối (ghi chú bắt buộc).
export default function Changes() {
  const [status, setStatus] = useState('PENDING');
  const act = useAction();
  const list = usePaged((cursor) => H.listChanges({ status, cursor }), [status]);
  const go = async (fn, ok) => { if (await act.run(fn, ok)) list.reload(); };
  const columns = [
    { key: 'code', header: 'Đơn', render: (r) => <strong>{r.bookingCode}</strong> },
    { key: 'type', header: 'Loại', render: (r) => TYPE[r.type] || r.type },
    { key: 'guest', header: 'Khách', render: (r) => r.guestName },
    { key: 'stay', header: 'Lưu trú hiện tại', render: (r) => (r.stay ? `${fmtD(r.stay.from)} - ${fmtD(r.stay.to)}` : '') },
    { key: 'new', header: 'Ngày mới', render: (r) => <>{r.newFrom ? `${fmtD(r.newFrom)} - ${fmtD(r.newTo)}` : ''}{quoteText(r.quote) && <small data-testid="ch-quote" style={{ display: 'block' }}>{quoteText(r.quote)}</small>}</> },
    { key: 'reason', header: 'Lý do', render: (r) => `${REASON[r.reasonCode] || r.reasonCode}${r.reasonNote ? `: ${r.reasonNote}` : ''}` },
    { key: 'at', header: 'Gửi lúc', render: (r) => fmtDT(r.createdAt) },
    { key: 'status', header: 'Trạng thái', render: (r) => (r.status === 'PENDING' ? <Tag tone="warn">Chờ xử lý</Tag> : <StatusBadge status={r.status} />) },
    { key: 'act', header: '', render: (r) => r.status === 'PENDING' && (
      <div className="row-actions" style={{ marginTop: 0 }}>
        <ConfirmAction label="Duyệt" ask="Duyệt yêu cầu này?" disabled={act.busy} testid="ch-approve" onConfirm={() => go(() => H.approveChange(r.id), `Đã duyệt yêu cầu đơn ${r.bookingCode}.`)} />
        <ConfirmAction label="Từ chối" tone="danger" ask={`Từ chối yêu cầu đơn ${r.bookingCode}?`} reason={{ label: 'Ghi chú từ chối (bắt buộc)' }} testid="ch-reject" onConfirm={(n) => go(() => H.rejectChange(r.id, n), `Đã từ chối yêu cầu đơn ${r.bookingCode}.`)} />
      </div>
    ) },
  ];
  return (
    <>
      <PageHeader title="Hủy / đổi ngày" description="Yêu cầu hủy hoặc đổi ngày của khách." />
      <FilterBar testid="ch-filters">
        <Select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="ch-status">
          <option value="">Tất cả</option><option value="PENDING">Chờ xử lý</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Đã từ chối</option>
        </Select>
      </FilterBar>
      {act.note}
      <DataTable columns={columns} rows={list.items} rowTestid="ch-row" loading={list.loading} error={list.err && describeError(list.err)} onRetry={list.reload}
        empty="Không có yêu cầu nào." hasMore={list.next != null} onLoadMore={list.loadMore} loadingMore={list.more} />
    </>
  );
}
