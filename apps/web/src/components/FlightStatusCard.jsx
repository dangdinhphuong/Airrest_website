import React from 'react';
import { Plane, RefreshCw, Clock3, MoonStar, ArrowRight } from 'lucide-react';
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
  if (f.status === 'cancelled') return { tone: 'error', text: 'ĐÃ HỦY CHUYẾN' };
  if (f.status === 'ontime') return { tone: 'ok', text: 'ĐÚNG GIỜ' };
  if (f.newDep == null) return { tone: 'warn', text: 'CHƯA BIẾT GIỜ BAY MỚI' };
  const d = delayMinutes(f);
  if (d == null) return { tone: 'warn', text: 'GIỜ BAY MỚI THEO BẠN NHẬP' };
  return { tone: d >= 240 ? 'error' : 'warn', text: `CHẬM ${fmtDuration(d).toUpperCase()}` };
}

export default function FlightStatusCard({ flight, simNow, onRefresh, refreshing, bannerClosedAt, onCloseBanner, onGo }) {
  const st = statusOf(flight);
  const stale = simNow - flight.updatedAt >= SIM.staleAfterMin;
  const showBanner = flight.change && bannerClosedAt !== flight.change.at;

  const originName = flight.origin === 'HAN' ? 'Hà Nội' : flight.origin === 'SGN' ? 'TP.HCM' : flight.origin;
  const destName = flight.dest === 'HAN' ? 'Hà Nội' : flight.dest === 'SGN' ? 'TP.HCM' : (flight.dest || 'Điểm đến');

  return (
    <section className="airrest-flight-banner" aria-label="Tình trạng chuyến bay" data-testid="status-card">
      {showBanner && (
        <div style={{ padding: '12px 20px 0' }}>
          <Notice tone="warn" title="Giờ bay đã đổi" onClose={onCloseBanner}>
            <span data-testid="time-change-banner">{fmtDateTime(flight.change.from)} → {fmtDateTime(flight.change.to)}. Các thời gian liên quan bên dưới đã được tính lại.</span>
          </Notice>
        </div>
      )}

      <div className="flight-banner-header">
        <div className="flight-code-group">
          <strong>{flight.code}</strong>
          <span className={`flight-delay-tag pill-${st.tone}`} data-testid="status-pill">
            {st.text}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SimBadge tone="sim">Mô phỏng</SimBadge>
          <button
            type="button"
            className="link-btn"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Làm mới trạng thái chuyến bay"
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} aria-hidden="true" />
            <span className="hide-sm">{refreshing ? 'Đang cập nhật…' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      <div className="flight-route-display">
        <div className="route-airport-node">
          <strong>{flight.origin}</strong>
          <p>{originName} · {flight.schedDep != null ? fmtTime(flight.schedDep) : 'Khởi hành'}</p>
        </div>
        <div className="route-connector">
          <span className="route-line-fill" />
          <Plane size={22} style={{ margin: '0 10px', transform: 'rotate(0deg)' }} />
          <span className="route-line-fill" />
        </div>
        <div className="route-airport-node">
          <strong>{flight.dest || 'ARR'}</strong>
          <p style={{ color: flight.status === 'ontime' ? '#10b981' : '#1262e8', fontWeight: '700' }}>
            {destName} · {flight.newDep != null ? fmtTime(flight.newDep) : (flight.schedDep != null ? fmtTime(flight.schedDep + 120) : 'Dự kiến')}
          </p>
        </div>
      </div>

      <div className="flight-banner-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', borderRadius: '10px', background: '#ffffff', color: '#1262e8', boxShadow: '0 2px 6px rgba(18,98,232,0.15)' }}>
            <MoonStar size={18} />
          </span>
          <div style={{ fontSize: '13px' }}>
            <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>Tình trạng chuyến bay</span>
            <strong style={{ color: '#062253' }}>
              {flight.status === 'cancelled' ? 'Chuyến bay đã bị hủy. Cần phương án lưu trú ngay.' : 'Thời gian chờ kéo dài. Có thể tìm nơi nghỉ gần sân bay.'}
            </strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span data-testid="updated-at" style={{ fontSize: '11.5px', color: '#64748b' }}>
            {fmtTime(flight.updatedAt)}
          </span>
          {stale && <span className="stale" style={{ fontSize: '11px', padding: '2px 8px' }}>Có thể đã cũ</span>}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onGo?.('stays')}
            style={{ borderRadius: '10px', padding: '6px 14px' }}
          >
            Tìm nơi nghỉ <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
