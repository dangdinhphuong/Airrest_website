import { EventEmitter } from 'node:events';

// Sự kiện luồng delay (phát SAU commit) -> api/realtime/delayFeed.ts. Payload không PII.
// shortcut: một tiến trình, như services/events.ts.
export type DelayEvent =
  | { type: 'offer'; hotelId: string; payload: { offerId: string; expiresAt: string; groupId: string; rooms: Array<{ roomType: string; qty: number }>; cluster: boolean } }
  | { type: 'offer:closed'; hotelId: string; payload: { offerId: string; status: string } }
  | { type: 'alert'; payerId: string; stationId: string; payload: { kind: string; groupId: string; batchId: string; reason: string; at: string; offerId?: string; proposedLeaveAt?: string } }
  | { type: 'extension'; hotelId: string; payload: { offerId: string; groupId: string; proposedLeaveAt: string; at: string } };

export const delayBus = new EventEmitter();
export const emitDelay = (e: DelayEvent): void => void delayBus.emit('event', e);
