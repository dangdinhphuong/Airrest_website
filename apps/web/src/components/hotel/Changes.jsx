import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Pill, ReasonAction } from '../partner/ui';
import * as H from '../../data/hotel';
import { ConfirmButton, ListState, StatusPill, fmtD, fmtDT, needReason, useAction, usePaged } from './kit';
import Select from '../Select';
import { money } from '../../lib/time';

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
  return (
    <>
      <ScreenTitle title="Hủy / đổi ngày">Yêu cầu hủy hoặc đổi ngày của khách.</ScreenTitle>
      <div className="filter-bar">
        <Select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="ch-status">
          <option value="">Tất cả</option><option value="PENDING">Chờ xử lý</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Đã từ chối</option>
        </Select>
      </div>
      {act.note}
      <ListState list={list} empty="Không có yêu cầu nào.">
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Đơn</th><th>Loại</th><th>Khách</th><th>Lưu trú hiện tại</th><th>Ngày mới</th><th>Lý do</th><th>Gửi lúc</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{list.items.map((r) => (
            <tr key={r.id} data-testid="ch-row">
              <td data-label="Đơn"><strong>{r.bookingCode}</strong></td><td data-label="Loại">{TYPE[r.type] || r.type}</td><td data-label="Khách">{r.guestName}</td>
              <td data-label="Lưu trú hiện tại">{r.stay ? `${fmtD(r.stay.from)} - ${fmtD(r.stay.to)}` : ''}</td><td data-label="Ngày mới">{r.newFrom ? `${fmtD(r.newFrom)} - ${fmtD(r.newTo)}` : ''}{quoteText(r.quote) && <small data-testid="ch-quote" style={{ display: 'block' }}>{quoteText(r.quote)}</small>}</td>
              <td data-label="Lý do">{REASON[r.reasonCode] || r.reasonCode}{r.reasonNote ? `: ${r.reasonNote}` : ''}</td><td data-label="Gửi lúc">{fmtDT(r.createdAt)}</td>
              <td data-label="Trạng thái">{r.status === 'PENDING' ? <Pill tone="warn">Chờ xử lý</Pill> : <StatusPill s={r.status} />}</td>
              <td>{r.status === 'PENDING' && <div className="row-actions" style={{ marginTop: 0 }}>
                <ConfirmButton label="Duyệt" ask="Duyệt yêu cầu này?" disabled={act.busy} testid="ch-approve" onConfirm={() => go(() => H.approveChange(r.id), `Đã duyệt yêu cầu đơn ${r.bookingCode}.`)} />
                <ReasonAction label="Từ chối" tone="danger" confirmLabel="Từ chối" placeholder="Ghi chú từ chối (bắt buộc)" testid="ch-reject" onSubmit={needReason((n) => go(() => H.rejectChange(r.id, n), `Đã từ chối yêu cầu đơn ${r.bookingCode}.`))} />
              </div>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </ListState>
    </>
  );
}
