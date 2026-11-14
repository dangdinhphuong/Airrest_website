import { delayBus, type DelayEvent } from '../../services/delay/events';
import { emitToRoom, rooms } from './socket';

// Offer cho khách sạn -> `delay:offer` / `delay:offer:closed` vào phòng đơn của KS (hotel:{id}:orders, cùng phòng order:new).
// Cảnh báo đỏ cho quầy -> `delay:alert` vào phòng payer (cấp đơn vị) + phòng trạm. Payload không PII.
export function startDelayStream(): () => void {
  const onEvent = (e: DelayEvent) => {
    if (e.type === 'alert') {
      emitToRoom(rooms.payerAlerts(e.payerId), 'delay:alert', e.payload);
      emitToRoom(rooms.payerAlerts(e.payerId, e.stationId), 'delay:alert', e.payload);
    } else emitToRoom(rooms.hotelOrders(e.hotelId), e.type === 'offer' ? 'delay:offer' : e.type === 'extension' ? 'delay:extension' : 'delay:offer:closed', e.payload);
  };
  delayBus.on('event', onEvent);
  return () => void delayBus.off('event', onEvent);
}
