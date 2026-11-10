import type { ClientSession, ObjectId } from 'mongodb';
import { col } from '../db/collections';
import type { Actor } from '../db/types';
import type { AuthContext } from './jwt';

export interface AuditInput {
  actor: Actor;
  action: string; // ví dụ BOOKING.CREATE, BOOKING.CHECKIN
  entity: { type: string; id: string };
  hotelId?: ObjectId;
  bookingId?: ObjectId;
  before?: unknown;
  after?: unknown;
  reasonCode?: string;
  reasonNote?: string;
  requestId?: string;
}

// Nhật ký chỉ thêm (FR-ADM-09). Thao tác nhạy cảm (tiền, trạng thái đơn) truyền `session`
// để ghi CÙNG transaction với thay đổi nghiệp vụ.
export async function writeAudit(input: AuditInput, session?: ClientSession): Promise<void> {
  await col.auditLogs().insertOne({ ts: new Date(), ...input } as never, { session });
}

export const actorOf = (auth?: AuthContext): Actor =>
  !auth
    ? { type: 'GUEST' }
    : auth.kind === 'GUEST'
      ? { type: 'GUEST', id: auth.sub }
      : { type: auth.accountType ?? 'USER', id: auth.sub };
