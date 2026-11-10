import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { PERM } from '../config/permissions';
import { corsOrigins } from '../config/env';
import { resolveAuth } from '../lib/authz';
import { verifyToken, type AuthContext } from '../lib/jwt';
import { logger } from '../lib/logger';

// Tên phòng (room) — thiết kế Mongo mục 7. Quyền vào phòng quyết định ở MÁY CHỦ khi kết nối,
// client không được tự chọn phòng.
export const rooms = {
  booking: (code: string) => `booking:${code}`,
  hotelOrders: (hotelId: string) => `hotel:${hotelId}:orders`,
  adminAlerts: () => 'admin:alerts',
};

let io: Server | undefined;

export function roomsFor(auth: AuthContext): string[] {
  if (auth.kind === 'GUEST') return auth.bookingCode ? [rooms.booking(auth.bookingCode)] : [];
  const list: string[] = [];
  if (auth.hotelId && auth.permissions.includes(PERM.BOOKING_READ)) list.push(rooms.hotelOrders(auth.hotelId));
  if (auth.permissions.includes(PERM.ADMIN_ALERTS)) list.push(rooms.adminAlerts());
  return list;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true } });

  // Middleware xác thực: token (tài khoản nội bộ hoặc guestToken) gửi trong handshake.auth.token.
  // Không có token hợp lệ -> không kết nối được.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('UNAUTHENTICATED'));
      socket.data.auth = await resolveAuth(verifyToken(token));
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const auth = socket.data.auth as AuthContext;
    const joined = roomsFor(auth);
    joined.forEach((r) => socket.join(r));
    logger.debug({ sub: auth.sub, kind: auth.kind, joined }, 'socket connected');

    // Ví dụ sự kiện client -> server có ack: cho client biết mình đang ở những phòng nào.
    socket.on('rooms:list', (ack?: (rooms: string[]) => void) => ack?.(joined));
    socket.on('disconnect', (reason) => logger.debug({ sub: auth.sub, reason }, 'socket disconnected'));
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.io chưa khởi tạo');
  return io;
}

// Helper phát sự kiện từ bất kỳ đâu trong service. Chỉ gửi dữ liệu tối thiểu, không gửi PII.
export const emitToRoom = (room: string, event: string, payload: unknown): void => {
  io?.to(room).emit(event, payload);
};
