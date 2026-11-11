import React from 'react';
import { Plane, RefreshCw, Clock3 } from 'lucide-react';
import { SIM } from '../config/simulation';
import { delayMinutes } from '../lib/domain';
import { fmtDateTime, fmtDuration, fmtTime } from '../lib/time';
import { Notice, SimBadge } from './Common';

export const CAUSE_LABEL = {
  airline: 'Thuộc trách nhiệm hãng (dữ liệu mô phỏng)',
  force: 'Điều kiện ngoài kiểm soát của hãng (dữ liệu mô phỏng)',
  unknown: 'Chưa rõ nguyên nhân',
};

export function statusOf(f) {
  if (f.status === 'cancelled') return { tone: 'error', text: 'Đã huỷ chuyến' };
  if (f.status === 'ontime') return { tone: 'ok', text: 'Đúng giờ' };
  if (f.newDep == null) return { tone: 'warn', text: 'Chưa biết giờ bay mới' };
  const d = delayMinutes(f);
  if (d == null) return { tone: 'warn', text: 'Giờ bay mới theo bạn nhập' };
  return { tone: d >= 240 ? 'error' : 'warn', text: `Chậm ${fmtDuration(d)}` };
}

export default function FlightStatusCard({ flight, simNow, onRefresh, refreshing, bannerClosedAt, onCloseBanner }) {
  const st = statusOf(flight);
  const stale = simNow - flight.updatedAt >= SIM.staleAfterMin;
  const showBanner = flight.change && bannerClosedAt !== flight.change.at;
  return (
    <section className="status-card" aria-label="Tình trạng chuyến bay" data-testid="status-card">
      {showBanner && (
        <Notice tone="warn" title="Giờ bay đã đổi" onClose={onCloseBanner}>
          <span data-testid="time-change-banner">{fmtDateTime(flight.change.from)} → {fmtDateTime(flight.change.to)}. Các thời gian liên quan bên dưới đã được tính lại.</span>
        </Notice>
      )}
      <div className="status-top">
        <div className="flight-id">
          <Plane size={20} aria-hidden="true" />
          <strong>{flight.code}</strong>
          <span className={`pill pill-${st.tone}`} data-testid="status-pill">{st.text}</span>
        </div>
        <SimBadge />
      </div>
      <div className="route">
        <div><small>Sân bay đi</small><strong>{flight.origin}</strong></div>
        {flight.dest && <><span className="route-line" aria-hidden="true" /><div><small>Sân bay đến</small><strong>{flight.dest}</strong></div></>}
      </div>
      <dl className="times">
        <div><dt>Giờ dự kiến ban đầu</dt><dd>{flight.schedDep != null ? fmtDateTime(flight.schedDep) : 'Chưa có'}</dd></div>
        <div><dt>Giờ mới</dt><dd className="new-time">{flight.status === 'cancelled' ? 'Chuyến đã huỷ' : flight.newDep != null ? fmtDateTime(flight.newDep) : 'Chưa biết'}</dd></div>
        <div><dt>Nguyên nhân</dt><dd>{CAUSE_LABEL[flight.cause]}</dd></div>
      </dl>
      <div className="updated">
        <Clock3 size={14} aria-hidden="true" />
        <span data-testid="updated-at">Cập nhật lúc {fmtTime(flight.updatedAt)} · Mô phỏng</span>
        {stale && <span className="stale">Có thể đã cũ</span>}
        <button type="button" className="link-btn" onClick={onRefresh} disabled={refreshing} aria-label="Làm mới trạng thái chuyến bay">
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} aria-hidden="true" /> {refreshing ? 'Đang làm mới…' : 'Làm mới'}
        </button>
      </div>
    </section>
  );
}
