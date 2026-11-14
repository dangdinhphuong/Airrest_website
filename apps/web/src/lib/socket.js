// Kết nối realtime (Socket.IO) dùng chung cho khách, khách sạn và tài xế. Chỉ tải thư viện khi gọi lần đầu.
// Hợp đồng với backend (api/realtime/socket.ts):
//  - xác thực: handshake.auth.token = JWT nhân sự/tài xế hoặc token theo dõi của khách (cấp sau khi tra cứu mã đơn + SĐT).
//  - phòng do MÁY CHỦ quyết định theo token, client không tự chọn phòng.
//  - 'shuttle:update' {type, bookingCode?, tripId?, requestId?, status?, at}: chỉ có id/trạng thái, client gọi REST lấy chi tiết.
//  - 'trip:position'  {tripId, lat, lng, heading, speedKmh, etaSec, phase: 'APPROACH'|'RIDE'|'ARRIVED'|'DONE', at}: vị trí mô phỏng ~2 giây/lần.
import { apiBase } from './api';

// onEvent(name, payload) nhận mọi sự kiện; onState('connecting'|'online'|'offline') để giao diện rơi về polling khi mất kết nối.
// Trả hàm hủy (đóng kết nối). Không bao giờ ném lỗi: mất socket thì giao diện vẫn chạy bằng polling.
export function connectRealtime({ token, onEvent, onState }) {
  let socket;
  let closed = false;
  (async () => {
    try {
      if (!apiBase || !token) { onState?.('offline'); return; }
      const { io } = await import('socket.io-client');
      if (closed) return;
      onState?.('connecting');
      socket = io(apiBase, { auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 8000 });
      socket.on('connect', () => onState?.('online'));
      socket.on('disconnect', () => onState?.('offline'));
      socket.on('connect_error', () => onState?.('offline'));
      socket.onAny((name, payload) => onEvent?.(name, payload));
    } catch { onState?.('offline'); }
  })();
  return () => { closed = true; socket?.close(); };
}
