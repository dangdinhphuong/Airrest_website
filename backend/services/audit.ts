import { db, json, jsonOrNull, type Db } from '../database/pg';
import type { Actor } from '../database/types';
import type { AuthContext } from '../lib/jwt';

export interface AuditInput {
  actor: Actor;
  action: string; // ví dụ BOOKING.CREATE, BOOKING.CHECKIN
  entity: { type: string; id: string };
  hotelId?: string;
  bookingId?: string;
  before?: unknown;
  after?: unknown;
  reasonCode?: string;
  reasonNote?: string;
  requestId?: string;
}

// Nhật ký chỉ thêm (FR-ADM-09). Thao tác nhạy cảm (tiền, trạng thái đơn) truyền `tx`
// để ghi CÙNG transaction với thay đổi nghiệp vụ.
export async function writeAudit(i: AuditInput, tx: Db = db): Promise<void> {
  await tx.query(
    `INSERT INTO audit_logs (request_id, actor, action, entity_type, entity_id, hotel_id, booking_id, before, after, reason_code, reason_note)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
    [i.requestId ?? null, json(i.actor), i.action, i.entity.type, i.entity.id, i.hotelId ?? null, i.bookingId ?? null, jsonOrNull(i.before), jsonOrNull(i.after), i.reasonCode ?? null, i.reasonNote ?? null],
  );
}

export const actorOf = (auth?: AuthContext): Actor =>
  !auth
    ? { type: 'GUEST' }
    : auth.kind === 'GUEST'
      ? { type: 'GUEST', id: auth.sub }
      : { type: auth.accountType ?? 'USER', id: auth.sub };
