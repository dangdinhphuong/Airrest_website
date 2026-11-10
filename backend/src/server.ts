import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { connectMongo, closeMongo } from './db/mongo';
import { logger } from './lib/logger';
import { startBookingsStream } from './realtime/changeStreams';
import { initSocket } from './realtime/socket';

async function main() {
  await connectMongo();

  const httpServer = createServer(createApp());
  const io = initSocket(httpServer);
  const stopStream = startBookingsStream();

  httpServer.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Airrest API đang chạy'));

  // Tắt êm: ngừng nhận request mới, đóng socket/stream, rồi đóng DB.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Đang tắt...');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    await stopStream();
    await io.close();
    await closeMongo();
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
