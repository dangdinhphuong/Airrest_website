import React from 'react';
import { Car } from 'lucide-react';
import { useApp } from '../state/store';
import { PICKUP_FLOW, PICKUP_LABEL, requestPickup, usePartner } from '../mock/partner';
import { Notice } from './Common';
import { fmtTime } from '../lib/time';
import { SHUTTLE_LABEL } from './PropertyCard';

// Trạng thái đặt chỗ do khách sạn xử lý (FR-027) và yêu cầu xe đón (FR-029). Ngoài MVP, Proposed; không bản đồ, không định vị.
export default function BookingLive({ booking, property, simNow }) {
  const { dispatch } = useApp();
  const { bookings, pickups } = usePartner();
  const b = bookings.find((x) => x.code === booking.code);
  const pk = pickups.find((x) => x.bookingCode === booking.code);
  if (b?.status === 'rejected') {
    return (
      <Notice tone="error" title="Cơ sở đã từ chối đặt chỗ này (mô phỏng)">
        Lý do: {b.reason}. Không có giao dịch thật. <button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: 'stays' })} data-testid="rejected-back">Chọn nơi nghỉ khác</button>
      </Notice>
    );
  }
  if (property.shuttle === 'none') return null;
  const idx = pk ? PICKUP_FLOW.indexOf(pk.status) : -1;
  return (
    <section className="pickup-block" aria-label="Xe đưa đón" data-testid="pickup-block">
      <h3><Car size={18} aria-hidden="true" /> Xe đón từ sân bay</h3>
      <p className="muted">{SHUTTLE_LABEL[property.shuttle]}. Trạng thái do lái xe của cơ sở cập nhật (mô phỏng); không có bản đồ hay định vị.</p>
      {!pk && <button type="button" className="btn btn-sm btn-primary" onClick={() => requestPickup({ booking, property, now: simNow })} data-testid="request-pickup">Yêu cầu xe đón</button>}
      {pk && (
        <>
          <ol className="steps" data-testid="pickup-steps">
            {PICKUP_FLOW.map((st, i) => <li key={st} className={pk.status !== 'failed' && i <= idx ? 'on' : ''}>{PICKUP_LABEL[st]}</li>)}
          </ol>
          <p data-testid="pickup-status"><strong>{PICKUP_LABEL[pk.status]}</strong> · cập nhật lúc {fmtTime(pk.updatedAt)} (mô phỏng)</p>
          {pk.status === 'failed' && <Notice tone="warn" title="Không đón được">{pk.reason}. Bạn có thể đi taxi (khoảng {property.taxi.toLocaleString('vi-VN')}đ) hoặc tự đi.</Notice>}
        </>
      )}
    </section>
  );
}
