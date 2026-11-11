import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from '../config/env';
import { closeDb, connectDb } from '../database/pg';
import { logger } from '../lib/logger';
import { expireOverdueBookings } from '../services/bookings/decisions';
import { startBookingsStream } from './realtime/bookingFeed';
import { initSocket } from './realtime/socket';

async function main() {
  await connectDb();

  const httpServer = createServer(createApp());
  const io = initSocket(httpServer);
  const stopStream = startBookingsStream();

  // shortcut: quét trong tiến trình API; chạy nhiều bản vẫn an toàn (điều kiện nằm trong câu UPDATE), nâng lên worker riêng khi cần.
  const sweep = env.BOOKING_EXPIRY_SWEEP_SEC > 0 ? setInterval(() => void expireOverdueBookings().catch((err) => logger.error({ err }, 'Quét đơn hết hạn lỗi')), env.BOOKING_EXPIRY_SWEEP_SEC * 1000) : undefined;
  sweep?.unref();

  httpServer.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Airrest API đang chạy'));

  // Tắt êm: ngừng nhận request mới, đóng socket, rồi đóng DB.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Đang tắt...');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    if (sweep) clearInterval(sweep);
    await stopStream();
    await io.close();
    await closeDb();
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Khởi động thất bại');
  process.exit(1);
});

// Lỗi không bắt được: ghi log rồi thoát để orchestrator khởi động lại (không chạy tiếp trong trạng thái lạ).
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandledRejection');
  process.exit(1);
});
