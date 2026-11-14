import React, { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@airrest/api-client';
import { describeError } from '../../lib/api';
import { ErrorBox, Loading } from '../Common';
import { Pill } from '../partner/ui';
import { fmtDT } from './kit';

// Lỗi nghiệp vụ của đội xe/chuyến -> tiếng Việt. Dùng: act.run(vi(() => H.x()), 'ok').
const ERR_VI = {
  PLATE_TAKEN: 'Biển số này đã có trong khách sạn.',
  DRIVER_ALREADY_ASSIGNED: 'Tài xế này đã được gán cho xe khác.',
  VEHICLE_IN_USE: 'Xe đang có chuyến chưa hoàn tất nên chưa thể thay đổi.',
  EMAIL_TAKEN: 'Email này đã được sử dụng.',
  VEHICLE_HAS_DRIVER: 'Xe này đã có tài xế khác. Hãy bỏ gán tài xế cũ trước.',
  DRIVER_IN_USE: 'Tài xế đang có chuyến chưa hoàn tất nên chưa thể thay đổi.',
  DRIVER_NOT_FOUND: 'Không tìm thấy tài xế (có thể đã bị xóa).',
  VEHICLE_NOT_FOUND: 'Không tìm thấy xe (có thể đã bị xóa).',
  EXTERNAL_LINK_NOT_ALLOWED: 'Liên kết chia sẻ không hợp lệ hoặc không thuộc Grab/Xanh SM, chỉ nhận https.',
  INVALID_TRANSITION: 'Trạng thái chuyến đã thay đổi, danh sách đã được làm mới. Vui lòng kiểm tra lại.',
  NOT_EXTERNAL_TRIP: 'Chuyến xe của khách sạn do tài xế thao tác.',
  VEHICLE_UNAVAILABLE: 'Xe không rảnh (ngừng hoạt động, chưa có tài xế hoặc trùng giờ).',
  VEHICLE_TOO_SMALL: 'Xe không đủ chỗ cho chuyến này.',
  TRIP_NOT_FOUND: 'Không tìm thấy chuyến (có thể đã bị hủy hoặc đổi).',
  STORAGE_NOT_CONFIGURED: 'Kho ảnh chưa được cấu hình, có thể lưu tài xế không ảnh.',
  USE_TRIP_FLOW: 'Yêu cầu đã được điều phối theo chuyến, hãy thao tác theo chuyến.',
};
export function viText(e) {
  if (ERR_VI[e?.code]) return ERR_VI[e.code];
  if (e?.code === 'VALIDATION_ERROR' || e?.status === 422) {
    const d = Array.isArray(e.details) ? e.details[0] : null;
    return d?.message ? `Dữ liệu chưa hợp lệ${d.path?.length ? ` (${d.path.join('.')})` : ''}: ${d.message}` : 'Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.';
  }
  return describeError(e);
}
export const vi = (fn) => async () => { try { return await fn(); } catch (e) { throw e instanceof ApiError ? new ApiError(e.status, e.code, viText(e), e.details, e.requestId) : e; } };

export const TRIP_STATUS = {
  OFFERED: ['Chờ tài xế nhận', 'warn'], ACCEPTED: ['Đã nhận', 'info'], EN_ROUTE: ['Đang tới đón', 'info'], ARRIVED: ['Đã tới điểm đón', 'info'], ONBOARD: ['Đã đón khách', 'ok'],
  DROPPED_OFF: ['Đã trả khách', 'ok'], CANCELLED: ['Đã hủy', 'neutral'], REJECTED: ['Tài xế từ chối', 'error'], NEEDS_EXTERNAL: ['Cần gọi xe ngoài', 'error'],
};
export const TripPill = ({ s }) => { const [t, tone] = TRIP_STATUS[s] || [s, 'neutral']; return <Pill tone={tone} data-testid="trip-status">{t}</Pill>; };
export const VEHICLE_STATE = { FREE: ['Rảnh', 'ok'], BUSY: ['Bận', 'warn'], NO_DRIVER: ['Chưa có tài xế', 'neutral'], INACTIVE: ['Ngừng', 'neutral'] };
export const DIRECTION = { TO_HOTEL: 'Sân bay → khách sạn', TO_AIRPORT: 'Khách sạn → sân bay' };
export const PROVIDER = { GRAB: 'Grab', XANHSM: 'Xanh SM', OTHER: 'Hãng khác' };

// Chỉ báo kết nối realtime.
export const LiveBadge = ({ conn }) => (
  <span className={`live-badge live-${conn === 'online' ? 'on' : 'off'}`} role="status" data-testid="live-badge">
    <i aria-hidden="true" />{conn === 'online' ? 'Trực tiếp' : conn === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối, đang làm mới định kỳ'}
  </span>
);

export const Avatar = ({ name, url, size = 40 }) => {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [url]);
  return url && !bad
    ? <img className="avatar" src={url} alt={name} width={size} height={size} onError={() => setBad(true)} data-testid="avatar-img" />
    : <span className="avatar avatar-ph" style={{ width: size, height: size }} aria-label={name} data-testid="avatar-ph">{(name || '?').trim().charAt(0).toUpperCase()}</span>;
};

// ---- Nhật ký đơn ----
const ACTOR = { GUEST: 'Khách', PASSENGER: 'Khách', HOTEL: 'Khách sạn', USER: 'Khách sạn', DRIVER: 'Tài xế', SYSTEM: 'Hệ thống', ADMIN: 'Quản trị' };
const BOOKING_ST = { PENDING_PAYMENT: 'Chờ thanh toán', PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đang ở', CHECKED_OUT: 'Đã trả phòng', CANCELLED: 'Đã hủy', REJECTED: 'Đã từ chối', EXPIRED: 'Hết hạn', NO_SHOW: 'Không đến' };
const plate = (d) => (d.plate ? ` (xe ${d.plate})` : '');
const SYS_NOTE = { no_show: 'khách không có mặt', auto_expired: 'tự đóng do quá hạn' };
const note = (d, k = 'note', l = 'ghi chú') => (d[k] ? `, ${l}: ${SYS_NOTE[d[k]] || d[k]}` : '');
const EVENT_TEXT = {
  SHUTTLE_REQUESTED: (d) => `Khách đặt xe đưa đón${d.passengers ? ` cho ${d.passengers} khách` : ''}${d.direction ? ` (${DIRECTION[d.direction] || d.direction}${d.airport ? `, ${d.airport}` : ''})` : ''}`,
  SHUTTLE_CALL_NOW: (d) => `Khách gọi xe ngay${d.passengers ? ` cho ${d.passengers} khách` : ''}`,
  TRIP_OFFERED: (d) => `Giao chuyến cho tài xế${plate(d)}${d.passengers ? `, ${d.passengers} khách` : ''}`,
  TRIP_ACCEPTED: (d) => `Tài xế đã nhận chuyến${plate(d)}`,
  TRIP_REJECTED: (d) => `Tài xế từ chối chuyến${plate(d)}${note(d, 'reason', 'lý do')}`,
  TRIP_EN_ROUTE: (d) => `Xe bắt đầu đi đón khách${plate(d)}`,
  TRIP_ARRIVED: (d) => `Xe đã tới điểm đón${plate(d)}`,
  TRIP_ONBOARD: (d) => `Khách đã lên xe${plate(d)}`,
  TRIP_DROPPED_OFF: (d) => `Đã trả khách${plate(d)}`,
  TRIP_CANCELLED: (d) => `Chuyến bị hủy${note(d)}`,
  TRIP_REASSIGNED: (d) => `Đổi xe cho chuyến${plate(d)}`,
  EXTERNAL_NEEDED: (d) => `Hết xe của khách sạn: cần gọi xe ngoài cho ${d.seats ?? '?'} chỗ`,
  EXTERNAL_LINK_SET: (d) => `Khách sạn đã nhập xe ngoài ${PROVIDER[d.provider] || ''}${d.replaced ? ' (đổi xe ngoài)' : ''}`,
  SHUTTLE_CANCELLED: (d) => `Hủy yêu cầu xe${note(d)}`,
  SHUTTLE_DONE: () => 'Hoàn tất đưa đón',
};
const describe = (e) => (e.type === 'STATUS' ? `Đơn chuyển sang "${BOOKING_ST[e.to] || e.to}"${e.reason ? ` (${e.reason})` : ''}` : (EVENT_TEXT[e.type]?.(e.data || {}) ?? e.type));
const STATE_LABEL = { TRIP_OFFERED: 'Chờ tài xế nhận', TRIP_ACCEPTED: 'Đã nhận', TRIP_REJECTED: 'Tài xế từ chối', TRIP_EN_ROUTE: 'Đang tới đón', TRIP_ARRIVED: 'Đã tới điểm đón', TRIP_ONBOARD: 'Đã đón khách', TRIP_DROPPED_OFF: 'Đã trả khách', TRIP_CANCELLED: 'Chuyến bị hủy', TRIP_REASSIGNED: 'Đã đổi xe', EXTERNAL_NEEDED: 'Cần gọi xe ngoài', EXTERNAL_LINK_SET: 'Đã nhập xe ngoài', SHUTTLE_CANCELLED: 'Đã hủy', SHUTTLE_DONE: 'Hoàn tất', SHUTTLE_REQUESTED: 'Chờ điều phối', SHUTTLE_CALL_NOW: 'Chờ điều phối' };

/** Số khách đi xe + trạng thái xe mới nhất, suy ra từ nhật ký đã tải. null nếu đơn không có xe. */
export function shuttleSummary(items) {
  const sh = items.filter((e) => STATE_LABEL[e.type]);
  const live = sh.filter((e) => !['TRIP_CANCELLED', 'TRIP_REJECTED', 'TRIP_REASSIGNED'].includes(e.type)); // một chuyến bị hủy/từ chối không phải trạng thái chung của xe
  const cur = live[live.length - 1] || sh[sh.length - 1];
  if (!sh.length) return null;
  const req = [...sh].reverse().find((e) => ['SHUTTLE_REQUESTED', 'SHUTTLE_CALL_NOW'].includes(e.type));
  return { passengers: req?.data?.passengers ?? null, state: STATE_LABEL[cur.type] };
}

/** Panel 'Nhật ký đơn': fetchPage(cursor) -> { items, nextCursor, statusHistory? }. Dòng thời gian theo thứ tự thời gian. */
export function EventLog({ fetchPage }) {
  const [st, setSt] = useState({ items: [], hist: [], next: null, loading: true, more: false, err: null });
  const load = useCallback(async (cursor) => {
    setSt((s) => ({ ...s, loading: !cursor, more: !!cursor, err: null }));
    try {
      const r = await fetchPage(cursor);
      setSt((s) => ({ items: cursor ? [...s.items, ...r.items] : r.items, hist: r.statusHistory ?? s.hist, next: r.nextCursor ?? null, loading: false, more: false, err: null }));
    } catch (err) { setSt((s) => ({ ...s, loading: false, more: false, err })); }
  }, [fetchPage]);
  useEffect(() => { load(undefined); }, [load]);
  const sum = shuttleSummary(st.items);
  const rows = [
    ...st.hist.map((h, i) => ({ key: `h${i}`, at: h.at, who: h.by?.type, text: describe({ type: 'STATUS', to: h.to, reason: h.reasonCode || h.reason }) })),
    ...st.items.map((e) => ({ key: `e${e.seq}`, at: e.at, who: e.actor_type ?? e.actorType, text: describe(e) })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  return (
    <section className="event-log" data-testid="event-log">
      <h4>Nhật ký đơn</h4>
      {sum && <p data-testid="shuttle-summary"><strong>Xe đưa đón:</strong> {sum.passengers ? `${sum.passengers} khách` : 'có đặt xe'} · {sum.state}</p>}
      {st.loading && <Loading />}
      {st.err && <ErrorBox title="Không tải được nhật ký" onRetry={() => load(undefined)}>{describeError(st.err)}</ErrorBox>}
      {!st.loading && !st.err && !rows.length && <p className="muted" data-testid="empty">Chưa có sự kiện nào.</p>}
      <ol className="timeline">
        {rows.map((r) => <li key={r.key} data-testid="event-row"><time>{fmtDT(r.at)}</time><span>{r.text}</span><small>{ACTOR[r.who] || r.who || 'Hệ thống'}</small></li>)}
      </ol>
      {st.next != null && <p><button type="button" className="btn btn-sm" onClick={() => load(st.next)} disabled={st.more} data-testid="load-more">{st.more ? 'Đang tải…' : 'Tải thêm'}</button></p>}
    </section>
  );
}
