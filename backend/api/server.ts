import { createServer } from 'node:http';
import { createApp } from './app';
import { corsOrigins, env } from '../config/env';
import { closeDb, connectDb } from '../database/pg';
import { logger } from '../lib/logger';
import { expireOverdueBookings } from '../services/bookings/decisions';
import { getConfig } from '../services/systemConfig';
import { startEmailWorker } from '../services/email/outbox';
import { sweepCheckinSoon } from '../services/notifications';
import { sweepExpiredOffers } from '../services/delay/offers';
import { sweepPendingAttachments } from '../services/support/support.service';
import { dispatchDueRequests } from '../services/shuttle/dispatch';
import { closeStaleTrips } from '../services/shuttle/trips';
import { startSimulation } from '../services/shuttle/simulation';
import { startBookingsStream } from './realtime/bookingFeed';
import { startDelayStream } from './realtime/delayFeed';
import { startShuttleStream } from './realtime/shuttleFeed';
import { initSocket } from './realtime/socket';

async function main() {
  await connectDb();

  const httpServer = createServer(createApp());
  const io = initSocket(httpServer);
  const stopStream = startBookingsStream();
  const stopShuttleStream = startShuttleStream();
  const stopSim = startSimulation();
  const stopDelayStream = startDelayStream();

  // shortcut: quét trong tiến trình API; chạy nhiều bản vẫn an toàn (điều kiện nằm trong câu UPDATE), nâng lên worker riêng khi cần.
  const sweep = env.BOOKING_EXPIRY_SWEEP_SEC > 0 ? setInterval(() => void expireOverdueBookings().catch((err) => logger.error({ err }, 'Quét đơn hết hạn lỗi')), env.BOOKING_EXPIRY_SWEEP_SEC * 1000) : undefined;
  sweep?.unref();
  // Quét điều phối xe: yêu cầu REQUESTED còn <= SHUTTLE_DISPATCH_LEAD_MIN tới giờ đón mà chưa có chuyến. Nhiều bản API cùng quét vẫn an toàn (dispatchRequest khóa yêu cầu).
  const dispatchSweep = env.SHUTTLE_DISPATCH_SWEEP_SEC > 0 ? setInterval(() => { void dispatchDueRequests().catch((err) => logger.error({ err }, 'Quét điều phối xe lỗi')); void closeStaleTrips().catch((err) => logger.error({ err }, 'Quét đóng chuyến quá hạn lỗi')); }, env.SHUTTLE_DISPATCH_SWEEP_SEC * 1000) : undefined;
  dispatchSweep?.unref();

  // Nhắc đơn sắp tới giờ nhận phòng (mỗi phút).
  const checkinSweep = setInterval(() => void sweepCheckinSoon().catch((err) => logger.error({ err }, 'Quét nhắc nhận phòng lỗi')), 60_000);
  checkinSweep.unref();

  // Quét offer delay quá hạn (job riêng, job 60s ở trên bỏ qua đơn PAYER). Chu kỳ lấy từ delay.sweepSec lúc khởi động. Nhiều bản API cùng quét vẫn an toàn (UPDATE có điều kiện status='PENDING').
  const delaySec = (await getConfig('delay.sweepSec')).value.seconds;
  const delaySweep = setInterval(() => void sweepExpiredOffers().catch((err) => logger.error({ err }, 'Quét offer delay hết hạn lỗi')), delaySec * 1000);
  delaySweep.unref();

  // Dọn tệp đính kèm hỗ trợ xin URL mà không xác nhận (mỗi giờ). Nhiều bản API cùng quét vẫn an toàn (xóa theo id).
  const attachSweep = setInterval(() => void sweepPendingAttachments().catch((err) => logger.error({ err }, 'Dọn tệp đính kèm lỗi')), 3600_000);
  attachSweep.unref();

  const stopEmail = startEmailWorker();

  httpServer.listen(env.PORT, () => logger.info({ port: env.PORT, corsOrigins }, 'Airrest API đang chạy')); // corsOrigins: kiểm tra CORS_ORIGINS đang dùng trong log

  // Tắt êm: ngừng nhận request mới, đóng socket, rồi đóng DB.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Đang tắt...');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    if (sweep) clearInterval(sweep);
    if (dispatchSweep) clearInterval(dispatchSweep);
    clearInterval(delaySweep);
    clearInterval(checkinSweep);
    clearInterval(attachSweep);
    stopEmail();
    stopDelayStream();
    stopSim();
    stopShuttleStream();
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
