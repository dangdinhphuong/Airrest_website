import React, { useEffect } from 'react';
import { BellRing, CalendarPlus } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM } from '../config/simulation';
import { deriveRequest } from '../lib/request';
import { effectiveDep, leaveTime } from '../lib/domain';
import { buildIcs, downloadIcs } from '../lib/ics';
import { fmtDateTime, fmtTime } from '../lib/time';
import { EmptyBox, Notice, ScreenTitle } from '../components/Common';

// Nơi nghỉ được dùng để tính giờ rời: đặt chỗ mô phỏng hoặc phòng đã được cơ sở xác nhận ở L2.
export function reminderProperty(state, getProperty) {
  if (state.booking.result) return getProperty(state.booking.result.propertyId, state.simNow);
  if (state.request) {
    const d = deriveRequest(state.request, state.flight, state.simNow);
    if (d.status === 'confirmed' && d.property) return d.property;
  }
  return null;
}

// M6 — Nhắc giờ quay lại sân bay (MB-08: FR-014, FR-015, FR-016). Chỉ nhắc khi trang còn mở; tệp lịch là phương án thay thế.
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
      try { new Notification('Đến giờ rời nơi nghỉ', { body: `Rời lúc ${fmtTime(leave)} để có mặt tại sân bay lúc ${fmtTime(dep - SIM.arrivalLeadMin)}.` }); } catch { /* bỏ qua */ }
    }
    dispatch({ type: 'reminderNotified', value: leave });
  }, [reminder.enabled, due, leave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p || leave == null) {
    return (
      <>
        <ScreenTitle kicker="Bước 5" title="Nhắc giờ quay lại sân bay" />
        <EmptyBox title="Chưa thể tính giờ rời" actions={<button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Tìm nơi nghỉ</button>}>
          {!p ? 'Bạn cần có nơi nghỉ (đặt chỗ mô phỏng hoặc phòng đã được cơ sở xác nhận) để tính giờ rời.' : 'Chưa biết giờ bay mới nên chưa tính được giờ rời.'}
        </EmptyBox>
      </>
    );
  }

  const enable = async () => {
    dispatch({ type: 'reminderEnable' });
    if (!('Notification' in window)) { dispatch({ type: 'reminderBrowser', value: 'unsupported' }); return; }
    try { dispatch({ type: 'reminderBrowser', value: await Notification.requestPermission() }); }
    catch { dispatch({ type: 'reminderBrowser', value: 'unsupported' }); }
  };
  const ics = () => downloadIcs('airrest-roi-noi-nghi.ics', buildIcs({
    leaveAbs: leave, uid: `${flight.code}-${leave}`, title: 'Rời nơi nghỉ để quay lại sân bay',
    description: `Chuyến ${flight.code}: giờ bay ${fmtDateTime(dep)}; có mặt tại sân bay lúc ${fmtTime(dep - SIM.arrivalLeadMin)}. Dữ liệu mô phỏng từ Airrest.`,
  }));

  const browserText = { idle: 'Chưa xin quyền', granted: 'Đã cấp quyền', denied: 'Bị từ chối', default: 'Chưa cấp quyền', unsupported: 'Trình duyệt không hỗ trợ' }[reminder.browser] || reminder.browser;
  return (
    <>
      <ScreenTitle kicker="Bước 5" title="Nhắc giờ quay lại sân bay">Giờ rời được tính từ giờ bay hiện tại; nếu giờ bay đổi, giờ rời sẽ được tính lại.</ScreenTitle>
      {due && reminder.enabled && <Notice tone="warn" title="Đến giờ rời nơi nghỉ" role="alert">Hãy rời {p.name} ngay để kịp có mặt tại sân bay.</Notice>}
      {flight.change && <Notice tone="warn" title="Giờ rời đã được tính lại">Giờ bay đã đổi từ {fmtDateTime(flight.change.from)} sang {fmtDateTime(flight.change.to)}.</Notice>}
      <section className="card" aria-label="Giờ rời nơi nghỉ" data-testid="reminder-panel">
        <dl className="breakdown">
          <div><dt>Nơi nghỉ</dt><dd>{p.name}</dd></div>
          <div><dt>Giờ bay hiện tại</dt><dd>{fmtDateTime(dep)}</dd></div>
          <div><dt>Giờ có mặt tại sân bay</dt><dd>{fmtDateTime(dep - SIM.arrivalLeadMin)} <small>(trước giờ bay {SIM.arrivalLeadMin} phút — tham số mô phỏng)</small></dd></div>
          <div><dt>Thời gian đi từ nơi nghỉ</dt><dd>{p.travelMin} phút</dd></div>
          <div className="highlight"><dt>Giờ phải rời nơi nghỉ</dt><dd data-testid="leave-time">{fmtDateTime(leave)} <small>(gồm dự phòng {SIM.leaveBufferMin} phút)</small></dd></div>
        </dl>
        <p className="muted">Công thức giờ rời đang chờ Product Owner chốt (OQ-04). Đây là giá trị mô phỏng.</p>
      </section>
      <section className="card" aria-labelledby="chan-h">
        <h2 id="chan-h">Cách nhận nhắc</h2>
        <ul className="plain-list">
          <li><strong>Trong trang:</strong> {reminder.enabled ? 'Đã bật — nhắc hiện ngay khi tới giờ rời (giờ mô phỏng).' : 'Chưa bật.'}</li>
          <li><strong>Thông báo trình duyệt:</strong> {browserText}.</li>
          <li><strong>Tệp lịch (.ics):</strong> tải về và mở bằng ứng dụng lịch của bạn để tự đặt nhắc.</li>
        </ul>
        <Notice tone="info" title="Giới hạn">Airrest chỉ nhắc khi trang này còn mở. Bản mô phỏng không có máy chủ để nhắc khi bạn đã đóng trang; hãy dùng tệp lịch để có nhắc ngoài trang.</Notice>
        {(reminder.browser === 'denied' || reminder.browser === 'unsupported') && <Notice tone="warn" title="Không bật được thông báo trình duyệt">Hãy dùng tệp lịch để nhận nhắc.</Notice>}
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={enable} disabled={reminder.enabled && reminder.browser !== 'idle'}><BellRing size={18} aria-hidden="true" /> {reminder.enabled ? 'Đã bật nhắc giờ' : 'Bật nhắc giờ'}</button>
          <button type="button" className="btn" onClick={ics}><CalendarPlus size={18} aria-hidden="true" /> Tải tệp lịch (.ics)</button>
        </div>
      </section>
    </>
  );
}
