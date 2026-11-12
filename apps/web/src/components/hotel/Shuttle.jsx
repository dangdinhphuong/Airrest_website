import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { ReasonAction } from '../partner/ui';
import { money } from '../../lib/time';
import * as H from '../../data/hotel';
import { ConfirmButton, ListState, StatusPill, fmtDT, needReason, useAction, usePaged } from './kit';

const DIR = { TO_HOTEL: 'Sân bay → KS', TO_AIRPORT: 'KS → sân bay' };

function AssignForm({ s, onSubmit, busy }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(s.driver?.name || '');
  const [phone, setPhone] = useState(s.driver?.phone || '');
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} data-testid="sh-assign-open">{s.status === 'ASSIGNED' ? 'Đổi tài xế' : 'Phân xe'}</button>;
  return (
    <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await onSubmit(name, phone)) setOpen(false); }}>
      <input aria-label="Tên tài xế" placeholder="Tên tài xế" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} data-testid="sh-driver" />
      <input aria-label="SĐT tài xế" placeholder="SĐT tài xế" value={phone} onChange={(e) => setPhone(e.target.value)} required data-testid="sh-phone" />
      <button type="submit" className="btn btn-sm btn-primary" disabled={busy} data-testid="sh-assign-ok">Lưu</button>
      <button type="button" className="link-btn" onClick={() => setOpen(false)}>Huỷ</button>
    </form>
  );
}

// /v1/hotel/shuttle-requests: danh sách, phân xe, hoàn tất, hủy (ghi chú bắt buộc).
export default function Shuttle() {
  const [status, setStatus] = useState('');
  const act = useAction();
  const list = usePaged((cursor) => H.listShuttles({ status, cursor }), [status]);
  const go = async (fn, ok) => { const r = await act.run(fn, ok); if (r) list.reload(); return r; };
  return (
    <>
      <ScreenTitle title="Xe đưa đón" kicker="Khách sạn">Yêu cầu xe của khách đã đặt phòng.</ScreenTitle>
      <div className="filter-bar">
        <select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="sh-status">
          <option value="">Mọi trạng thái</option><option value="REQUESTED">Chờ phân xe</option><option value="ASSIGNED">Đã phân xe</option><option value="DONE">Hoàn tất</option><option value="CANCELLED">Đã hủy</option>
        </select>
      </div>
      {act.note}
      <ListState list={list} empty="Chưa có yêu cầu xe nào.">
        <div className="table-wrap"><table className="rights-table">
          <thead><tr><th>Đơn</th><th>Khách</th><th>Chiều</th><th>Giờ đón</th><th>Địa điểm / ghi chú</th><th>Giá</th><th>Tài xế</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{list.items.map((s) => (
            <tr key={s.id} data-testid="sh-row">
              <td data-label="Đơn"><strong>{s.bookingCode}</strong></td><td data-label="Khách">{s.guestName}</td>
              <td data-label="Chiều">{DIR[s.direction]} ({s.airportIata}, {s.distanceKm} km)</td><td data-label="Giờ đón">{fmtDT(s.pickupAt)}</td>
              <td data-label="Địa điểm">{[s.location, s.note, s.cancelNote && `Lý do hủy: ${s.cancelNote}`].filter(Boolean).join(' · ')}</td>
              <td data-label="Giá">{money(s.priceVnd)}</td><td data-label="Tài xế">{s.driver ? `${s.driver.name} · ${s.driver.phone}` : ''}</td>
              <td data-label="Trạng thái"><StatusPill s={s.status} /></td>
              <td>{['REQUESTED', 'ASSIGNED'].includes(s.status) && <div className="row-actions" style={{ marginTop: 0 }}>
                <AssignForm s={s} busy={act.busy} onSubmit={(n, p) => go(() => H.assignShuttle(s.id, n, p), 'Đã phân xe.')} />
                {s.status === 'ASSIGNED' && <ConfirmButton label="Hoàn tất" ask="Xe đã đón xong?" disabled={act.busy} testid="sh-complete" onConfirm={() => go(() => H.completeShuttle(s.id), 'Đã hoàn tất chuyến đưa đón.')} />}
                <ReasonAction label="Hủy xe" tone="danger" confirmLabel="Hủy chuyến" placeholder="Ghi chú hủy (bắt buộc)" testid="sh-cancel" onSubmit={needReason((n) => go(() => H.cancelShuttle(s.id, n), 'Đã hủy yêu cầu xe.'))} />
              </div>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </ListState>
    </>
  );
}
