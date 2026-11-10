import type { ChangeStream, ResumeToken } from 'mongodb';
import { col } from '../db/collections';
import type { BookingDoc } from '../db/types';
import { logger } from '../lib/logger';
import { emitToRoom, rooms } from './socket';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Change Stream `bookings` -> Socket.io. Cần MongoDB replica set.
// Khi mất kết nối: chạy lại với resume token để không mất sự kiện.
// shortcut: resume token chỉ giữ trong bộ nhớ; khởi động lại tiến trình sẽ mất sự kiện lúc đó.
// Nâng cấp: lưu token vào collection riêng nếu cần không-mất-sự-kiện qua lần restart.
export function startBookingsStream(): () => Promise<void> {
  let stopped = false;
  let current: ChangeStream<BookingDoc> | undefined;
  let resumeToken: ResumeToken | undefined;

  const loop = async () => {
    let backoff = 1000;
    while (!stopped) {
      try {
        current = col.bookings().watch(
          [{ $match: { operationType: { $in: ['insert', 'update'] } } }],
          { fullDocument: 'updateLookup', ...(resumeToken ? { resumeAfter: resumeToken } : {}) },
        );
        for await (const ev of current) {
          resumeToken = ev._id;
          if (!('fullDocument' in ev) || !ev.fullDocument) continue;
          const b = ev.fullDocument;
          // Payload tối thiểu: không kèm tên/SĐT khách.
          const payload = { code: b.code, status: b.status, updatedAt: b.updatedAt };
          emitToRoom(rooms.booking(b.code), 'booking:updated', payload);
          emitToRoom(rooms.hotelOrders(b.hotelId.toHexString()), ev.operationType === 'insert' ? 'order:new' : 'order:updated', payload);
          backoff = 1000;
        }
      } catch (err) {
        if (stopped) break;
        logger.error({ err }, 'Change stream bookings lỗi, thử lại');
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
      } finally {
        await current?.close().catch(() => undefined);
      }
    }
  };
  void loop();

  return async () => {
    stopped = true;
    await current?.close().catch(() => undefined);
  };
}
