import React, { useEffect } from 'react';
import { BellRing, CalendarPlus, Clock3, MapPin, Plane, ShieldCheck } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM } from '../config/simulation';
import { deriveRequest } from '../lib/request';
import { effectiveDep, leaveTime } from '../lib/domain';
import { buildIcs, downloadIcs } from '../lib/ics';
import { fmtDateTime, fmtTime } from '../lib/time';
import { EmptyBox, Notice, ScreenTitle, SimBadge } from '../components/Common';

// Nơi nghỉ được dùng để tính giờ rời: đặt chỗ mô phỏng hoặc phòng đã được cơ sở xác nhận ở L2.
export function reminderProperty(state, getProperty) {
  if (state.booking.result) return getProperty(state.booking.result.propertyId, state.simNow);
  if (state.request) {
    const d = deriveRequest(state.request, state.flight, state.simNow);
    if (d.status === 'confirmed' && d.property) return d.property;
  }
  return null;
}

// M6 — Nhắc giờ quay lại sân bay (MB-08: FR-014, FR-015, FR-016).
export default function Reminder() {
  const { state, dispatch, getProperty } = useApp();
  const { flight, simNow, reminder } = state;
  const p = reminderProperty(state, getProperty);
  const leave = leaveTime(flight, p);
  const dep = effectiveDep(flight);
  const due = leave != null && simNow >= leave;

  useEffect(() => {
    if (leave == null || !reminder.enabled || !due || reminder.notifiedFor === leave) return;
    if (reminder.browser === 'granted' && 'Notification' in window) {
      try {
        new Notification('Đến giờ rời nơi nghỉ', {
          body: `Rời lúc ${fmtTime(leave)} để có mặt tại sân bay lúc ${fmtTime(dep - SIM.arrivalLeadMin)}.`,
        });
      } catch { /* bỏ qua */ }
    }
    dispatch({ type: 'reminderNotified', value: leave });
  }, [reminder.enabled, due, leave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p || leave == null) {
    return (
      <>
        <ScreenTitle kicker="Bước 5" title="Nhắc giờ quay lại sân bay" />
        <EmptyBox
          title="Chưa thể tính giờ rời"
          actions={<button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Tìm nơi nghỉ</button>}
        >
          {!p ? 'Bạn cần có nơi nghỉ (đặt chỗ mô phỏng hoặc phòng đã được xác nhận) để tính giờ rời.' : 'Chưa biết giờ bay mới nên chưa tính được giờ rời.'}
        </EmptyBox>
      </>
    );
  }

  const enable = async () => {
    dispatch({ type: 'reminderEnable' });
    if (!('Notification' in window)) {
      dispatch({ type: 'reminderBrowser', value: 'unsupported' });
      return;
    }
    try {
      dispatch({ type: 'reminderBrowser', value: await Notification.requestPermission() });
    } catch {
      dispatch({ type: 'reminderBrowser', value: 'unsupported' });
    }
  };

  const ics = () => downloadIcs('airrest-roi-noi-nghi.ics', buildIcs({
    leaveAbs: leave,
    uid: `${flight.code}-${leave}`,
    title: 'Rời nơi nghỉ để quay lại sân bay',
    description: `Chuyến ${flight.code}: giờ bay ${fmtDateTime(dep)}; có mặt tại sân bay lúc ${fmtTime(dep - SIM.arrivalLeadMin)}. Dữ liệu mô phỏng từ Airrest.`,
  }));

  const browserText = {
    idle: 'Chưa xin quyền',
    granted: 'Đã cấp quyền',
    denied: 'Bị từ chối',
    default: 'Chưa cấp quyền',
    unsupported: 'Trình duyệt không hỗ trợ',
  }[reminder.browser] || reminder.browser;

  return (
    <>
      <ScreenTitle kicker="Bước 5" title="Nhắc giờ quay lại sân bay">
        Giờ rời được tính từ giờ bay hiện tại; nếu giờ bay đổi, giờ rời sẽ được tính lại tự động.
      </ScreenTitle>

      {due && reminder.enabled && (
        <Notice tone="warn" title="Đến giờ rời nơi nghỉ" role="alert">
          Hãy rời {p.name} ngay để kịp có mặt tại sân bay đúng giờ.
        </Notice>
      )}
      {flight.change && (
        <Notice tone="warn" title="Giờ rời đã được tính lại">
          Giờ bay đã đổi từ {fmtDateTime(flight.change.from)} sang {fmtDateTime(flight.change.to)}.
        </Notice>
      )}

      {/* Card Giờ rời nơi nghỉ */}
      <section className="airrest-card card" aria-label="Giờ rời nơi nghỉ" data-testid="reminder-panel">
        <div className="airrest-card-head">
          <div>
            <span className="section-kicker">Lộ trình quay lại sân bay</span>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '4px 0 0' }}>
              Thời gian rời dự kiến
            </h2>
          </div>
          <SimBadge>Mô phỏng</SimBadge>
        </div>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '18px', padding: '20px 24px', margin: '14px 0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1e40af' }}>
              Giờ phải rời nơi nghỉ
            </span>
            <div data-testid="leave-time" style={{ fontSize: '28px', fontWeight: '800', color: '#1262e8', marginTop: '4px' }}>
              {fmtDateTime(leave)}
            </div>
            <small style={{ color: '#64748b', fontSize: '12px' }}>Đã bao gồm dự phòng {SIM.leaveBufferMin} phút</small>
          </div>
          <span style={{ display: 'grid', placeItems: 'center', width: '50px', height: '50px', borderRadius: '14px', background: '#ffffff', color: '#1262e8', boxShadow: '0 4px 12px rgba(18,98,232,0.15)' }}>
            <Clock3 size={24} />
          </span>
        </div>

        <dl className="breakdown" style={{ margin: '0 0 16px' }}>
          <div><dt>Nơi nghỉ</dt><dd><strong>{p.name}</strong></dd></div>
          <div><dt>Giờ bay hiện tại</dt><dd>{fmtDateTime(dep)}</dd></div>
          <div><dt>Giờ cần có mặt tại sân bay</dt><dd>{fmtDateTime(dep - SIM.arrivalLeadMin)} <small>(trước giờ bay {SIM.arrivalLeadMin} phút)</small></dd></div>
          <div><dt>Thời gian đi từ nơi nghỉ</dt><dd>{p.travelMin} phút</dd></div>
        </dl>
        <p className="muted" style={{ fontSize: '12px', margin: 0 }}>
          Công thức giờ rời dựa trên thông số mô phỏng chờ Product Owner chốt (OQ-04).
        </p>
      </section>

      {/* Card Cách nhận thông báo */}
      <section className="airrest-card card" aria-labelledby="chan-h">
        <div className="airrest-card-head">
          <div>
            <span className="section-kicker">Kênh thông báo</span>
            <h2 id="chan-h" style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '4px 0 0' }}>
              Cách nhận nhắc giờ
            </h2>
          </div>
          <BellRing size={20} style={{ color: '#1262e8' }} />
        </div>

        <ul className="plain-list" style={{ margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
          <li><strong>Trong trang:</strong> {reminder.enabled ? 'Đã bật — thông báo xuất hiện ngay khi tới giờ rời.' : 'Chưa bật.'}</li>
          <li><strong>Thông báo trình duyệt:</strong> <span className="airrest-badge-pill airrest-badge-blue" style={{ marginLeft: '6px' }}>{browserText}</span></li>
          <li><strong>Tệp lịch (.ics):</strong> tải về để đồng bộ vào Google Calendar, Apple Calendar hoặc Outlook.</li>
        </ul>

        <Notice tone="info" title="Giới hạn trên trình duyệt">
          Airrest chỉ gửi thông báo trực tiếp khi trang web còn mở. Để nhận nhắc khi đóng trình duyệt, hãy tải tệp lịch (.ics) về máy.
        </Notice>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '20px' }}>
          <button
            type="button"
            className="hero-submit-btn"
            onClick={enable}
            disabled={reminder.enabled && reminder.browser !== 'idle'}
            style={{ margin: 0, flex: 1, minWidth: '200px' }}
          >
            <BellRing size={18} /> {reminder.enabled ? 'Đã bật nhắc giờ' : 'Bật nhắc giờ trên trình duyệt'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={ics}
            style={{ borderRadius: '14px', fontWeight: '700', border: '1px solid #cbd5e1', padding: '12px 20px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <CalendarPlus size={18} /> Tải tệp lịch (.ics)
          </button>
        </div>
      </section>
    </>
  );
}
