import { SUPPORT_ATTACHMENT, isVideoType, maxBytesOf, type AttachmentUploadBody, type CreateTicketBody, type StaffMessageBody, type TicketListQuery, type TicketPatchBody } from '@airrest/validation';
import { db, withTransaction } from '../../database/pg';
import type { SupportAttachmentDoc, SupportMessageDoc, SupportTicketDoc } from '../../database/types';
import { generateTicketCode } from '../../lib/codes';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { deleteMedia, headMedia, presignDownload, presignSupportUpload } from '../../lib/storage';
import { actorOf, writeAudit } from '../audit';
import { lookupBooking } from '../bookings/bookings.service';

const GUEST = { type: 'GUEST' } as const;

// accountId: khách đang đăng nhập thì ticket gắn vào tài khoản (để liệt kê ở "Ticket của tôi"); khách vãng lai vẫn tra bằng mã + SĐT.
export async function createTicket(input: CreateTicketBody, requestId?: string, accountId?: string): Promise<{ code: string; status: string }> {
  // Gắn booking phải khớp CẢ mã lẫn SĐT (sai -> 404 chung của tra cứu).
  const booking = input.bookingCode ? await lookupBooking(input.bookingCode, input.phone) : undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateTicketCode();
    try {
      return await withTransaction(async (tx) => {
        const t = (
          await tx.query<SupportTicketDoc>(
            `INSERT INTO support_tickets (code, booking_id, hotel_id, contact, subject, account_id) VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
            [code, booking?.id ?? null, booking?.hotelId ?? null, JSON.stringify({ fullName: input.fullName, phone: input.phone, email: input.email }), input.subject, accountId ?? null],
          )
        ).rows[0]!;
        await tx.query('INSERT INTO support_messages (ticket_id, author, body) VALUES ($1,$2::jsonb,$3)', [t.id, JSON.stringify({ ...GUEST, name: input.fullName }), input.message]);
        await writeAudit({ actor: GUEST, action: 'SUPPORT.CREATE', entity: { type: 'support_ticket', id: t.id }, hotelId: booking?.hotelId, bookingId: booking?.id, after: { code, subject: input.subject }, requestId }, tx);
        return { code: t.code, status: t.status };
      });
    } catch (e) {
      if (isDuplicateKey(e) && attempt < 2) continue;
      throw e;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Không tạo được mã hỗ trợ');
}

async function findGuestTicket(code: string, phone: string): Promise<SupportTicketDoc & { bookingCode?: string }> {
  const t = (
    await db.query<SupportTicketDoc & { bookingCode?: string }>(
      `SELECT t.*, b.code AS booking_code FROM support_tickets t LEFT JOIN bookings b ON b.id = t.booking_id WHERE t.code = $1 AND t.contact->>'phone' = $2`,
      [code, phone],
    )
  ).rows[0];
  if (!t) throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ với thông tin đã nhập');
  return t;
}

export async function lookupTicket(code: string, phone: string) {
  const t = await findGuestTicket(code, phone);
  const msgs = (await db.query<SupportMessageDoc>('SELECT * FROM support_messages WHERE ticket_id = $1 AND NOT internal ORDER BY seq', [t.id])).rows;
  return {
    code: t.code, subject: t.subject, status: t.status, createdAt: t.createdAt, resolvedAt: t.resolvedAt, bookingCode: t.bookingCode,
    messages: msgs.map((m) => ({ from: m.author.type === 'GUEST' ? 'GUEST' : 'STAFF', body: m.body, createdAt: m.createdAt })),
    attachments: await attachmentsOf(t.id),
  };
}

// ---------- Tệp đính kèm ----------

const PENDING_HOLD_MIN = 15; // URL tải lên sống 5 phút; PENDING còn trong khoảng này vẫn tính vào hạn mức, quá thì coi như bỏ

const attachmentView = (a: SupportAttachmentDoc) => ({ id: a.id, contentType: a.contentType, sizeBytes: Number(a.sizeBytes), createdAt: a.createdAt });

// Tệp READY của ticket kèm URL tải ký 10 phút. Storage chưa cấu hình/lỗi thì vẫn trả metadata (không có url) để tra cứu ticket không hỏng theo.
async function attachmentsOf(ticketId: string) {
  const rows = (await db.query<SupportAttachmentDoc>("SELECT * FROM support_attachments WHERE ticket_id = $1 AND status = 'READY' ORDER BY seq", [ticketId])).rows;
  return Promise.all(rows.map(async (a) => ({ ...attachmentView(a), url: await presignDownload(a.storageKey).catch(() => undefined) })));
}

export async function requestAttachmentUpload(code: string, phone: string, input: AttachmentUploadBody, requestId?: string) {
  const t = await findGuestTicket(code, phone);
  if (t.status === 'RESOLVED') throw new AppError(409, 'TICKET_RESOLVED', 'Yêu cầu đã được giải quyết, vui lòng tạo yêu cầu mới');
  return withTransaction(async (tx) => {
    await tx.query('SELECT 1 FROM support_tickets WHERE id = $1 FOR UPDATE', [t.id]); // tuần tự hóa các yêu cầu cùng ticket để hạn mức không bị vượt khi gửi song song
    const held = (
      await tx.query<{ contentType: string }>(
        `SELECT content_type FROM support_attachments WHERE ticket_id = $1 AND (status = 'READY' OR created_at > now() - make_interval(mins => $2))`,
        [t.id, PENDING_HOLD_MIN],
      )
    ).rows;
    const videos = held.filter((r) => isVideoType(r.contentType)).length;
    const images = held.length - videos;
    const { maxFiles, maxImages, maxVideos } = SUPPORT_ATTACHMENT;
    if (held.length >= maxFiles) throw new AppError(409, 'ATTACHMENT_LIMIT', `Mỗi yêu cầu chỉ đính kèm tối đa ${maxFiles} tệp`);
    if (isVideoType(input.contentType) ? videos >= maxVideos : images >= maxImages) throw new AppError(409, 'ATTACHMENT_LIMIT', isVideoType(input.contentType) ? `Chỉ đính kèm tối đa ${maxVideos} video` : `Chỉ đính kèm tối đa ${maxImages} ảnh`);
    const up = await presignSupportUpload(input.contentType);
    const id = (
      await tx.query<{ id: string }>('INSERT INTO support_attachments (ticket_id, storage_key, content_type, size_bytes) VALUES ($1,$2,$3,$4) RETURNING id', [t.id, up.key, input.contentType, input.size])
    ).rows[0]!.id;
    await writeAudit({ actor: GUEST, action: 'SUPPORT.ATTACHMENT_URL', entity: { type: 'support_ticket', id: t.id }, hotelId: t.hotelId, after: { contentType: input.contentType, size: input.size }, requestId }, tx);
    return { attachmentId: id, uploadUrl: up.uploadUrl, method: up.method, headers: up.headers, expiresIn: up.expiresIn };
  });
}

// Xác minh tệp đã tải lên thật sự khớp quy định (R2 không ép kích thước trong URL ký): sai thì xóa object + dòng DB.
export async function confirmAttachment(code: string, phone: string, attachmentId: string, requestId?: string) {
  const t = await findGuestTicket(code, phone);
  const a = (await db.query<SupportAttachmentDoc>('SELECT * FROM support_attachments WHERE id = $1 AND ticket_id = $2', [attachmentId, t.id])).rows[0];
  if (!a) throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Không tìm thấy tệp đính kèm');
  if (a.status === 'READY') return attachmentView(a);
  const head = await headMedia(a.storageKey);
  if (!head) throw new AppError(409, 'ATTACHMENT_NOT_UPLOADED', 'Tệp chưa được tải lên, vui lòng thử lại');
  if (head.size < 1 || head.size > maxBytesOf(a.contentType) || (head.contentType && head.contentType !== a.contentType)) {
    await deleteMedia(a.storageKey).catch(() => undefined);
    await db.query('DELETE FROM support_attachments WHERE id = $1', [a.id]);
    throw new AppError(422, 'ATTACHMENT_INVALID', 'Tệp không đúng loại hoặc vượt dung lượng cho phép');
  }
  const done = (await db.query<SupportAttachmentDoc>("UPDATE support_attachments SET status = 'READY', size_bytes = $2 WHERE id = $1 RETURNING *", [a.id, head.size])).rows[0]!;
  await writeAudit({ actor: GUEST, action: 'SUPPORT.ATTACHMENT_ADD', entity: { type: 'support_ticket', id: t.id }, hotelId: t.hotelId, after: { contentType: a.contentType, size: head.size }, requestId });
  return attachmentView(done);
}

// Dọn tệp xin URL nhưng không bao giờ xác nhận. Lỗi xóa object thì giữ dòng để lần quét sau thử lại.
export async function sweepPendingAttachments(hours = 24): Promise<number> {
  const rows = (await db.query<{ id: string; storageKey: string }>("SELECT id, storage_key FROM support_attachments WHERE status = 'PENDING' AND created_at < now() - make_interval(hours => $1) LIMIT 200", [hours])).rows;
  let n = 0;
  for (const r of rows) {
    try { await deleteMedia(r.storageKey); } catch { continue; }
    await db.query('DELETE FROM support_attachments WHERE id = $1', [r.id]);
    n++;
  }
  return n;
}

export async function guestReply(code: string, phone: string, message: string, requestId?: string) {
  const t = await findGuestTicket(code, phone);
  if (t.status === 'RESOLVED') throw new AppError(409, 'TICKET_RESOLVED', 'Yêu cầu đã được giải quyết, vui lòng tạo yêu cầu mới');
  await withTransaction(async (tx) => {
    await tx.query('INSERT INTO support_messages (ticket_id, author, body) VALUES ($1,$2::jsonb,$3)', [t.id, JSON.stringify(GUEST), message]);
    await tx.query('UPDATE support_tickets SET updated_at = now() WHERE id = $1', [t.id]);
    await writeAudit({ actor: GUEST, action: 'SUPPORT.REPLY', entity: { type: 'support_ticket', id: t.id }, hotelId: t.hotelId, requestId }, tx);
  });
  return lookupTicket(code, phone);
}

// ---------- Admin ----------

const mask = (phone: string) => `${'*'.repeat(Math.max(0, phone.length - 3))}${phone.slice(-3)}`;

export async function listTickets(q: TicketListQuery, auth: AuthContext) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (q.status) add('t.status = ?', q.status);
  if (q.assignee) add('t.assignee_id = ?', q.assignee === 'me' ? auth.sub : q.assignee);
  if (q.cursor !== undefined) add('t.seq < ?', q.cursor);
  const rows = (
    await db.query<SupportTicketDoc & { bookingCode?: string }>(
      `SELECT t.*, b.code AS booking_code FROM support_tickets t LEFT JOIN bookings b ON b.id = t.booking_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.seq DESC LIMIT ${q.limit + 1}`,
      params,
    )
  ).rows;
  const items = rows.slice(0, q.limit);
  return {
    items: items.map((t) => ({ id: t.id, seq: t.seq, code: t.code, subject: t.subject, status: t.status, bookingCode: t.bookingCode, contactPhoneMasked: mask(t.contact.phone), assigneeId: t.assigneeId, createdAt: t.createdAt })),
    nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null,
  };
}

export async function getTicketAdmin(id: string) {
  const ticket = (await db.query<SupportTicketDoc>('SELECT * FROM support_tickets WHERE id = $1', [id])).rows[0];
  if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ');
  const messages = (await db.query<SupportMessageDoc>('SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY seq', [id])).rows;
  return { ticket, messages, attachments: await attachmentsOf(id) };
}

export async function updateTicket(auth: AuthContext, id: string, patch: TicketPatchBody, requestId?: string): Promise<SupportTicketDoc> {
  return withTransaction(async (tx) => {
    const t = (await tx.query<SupportTicketDoc>('SELECT * FROM support_tickets WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!t) throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ');
    const now = new Date();
    let assignee = patch.assigneeId ?? t.assigneeId;
    if (patch.assigneeId) {
      const a = (await tx.query("SELECT 1 FROM accounts WHERE id = $1 AND type = 'ADMIN' AND status = 'ACTIVE'", [patch.assigneeId])).rows[0];
      if (!a) throw new AppError(422, 'ASSIGNEE_INVALID', 'Người xử lý phải là tài khoản Admin đang hoạt động');
    }
    if (patch.status) {
      const ok = (t.status === 'OPEN' && patch.status === 'IN_PROGRESS') || (t.status === 'IN_PROGRESS' && patch.status === 'RESOLVED');
      if (!ok) throw new AppError(409, 'INVALID_TRANSITION', `Không thể chuyển ${t.status} -> ${patch.status}`);
      if (patch.status === 'IN_PROGRESS' && !assignee) assignee = auth.sub; // chưa có người nhận thì người thao tác nhận
    }
    const next = (
      await tx.query<SupportTicketDoc>(
        `UPDATE support_tickets SET status = COALESCE($2, status), assignee_id = $3, resolved_at = CASE WHEN $2 = 'RESOLVED' THEN $4 ELSE resolved_at END, updated_at = $4 WHERE id = $1 RETURNING *`,
        [id, patch.status ?? null, assignee ?? null, now],
      )
    ).rows[0]!;
    if (patch.status) await writeAudit({ actor: actorOf(auth), action: 'SUPPORT.STATUS', entity: { type: 'support_ticket', id }, hotelId: t.hotelId, before: { status: t.status }, after: { status: next.status }, requestId }, tx);
    if (assignee !== t.assigneeId) await writeAudit({ actor: actorOf(auth), action: 'SUPPORT.ASSIGN', entity: { type: 'support_ticket', id }, hotelId: t.hotelId, before: { assigneeId: t.assigneeId }, after: { assigneeId: assignee }, requestId }, tx);
    return next;
  });
}

export async function addStaffMessage(auth: AuthContext, id: string, input: StaffMessageBody, requestId?: string) {
  return withTransaction(async (tx) => {
    const t = (await tx.query<SupportTicketDoc>('SELECT * FROM support_tickets WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!t) throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ');
    if (t.status === 'RESOLVED' && !input.internal) throw new AppError(409, 'TICKET_RESOLVED', 'Yêu cầu đã giải quyết: chỉ thêm được ghi chú nội bộ');
    const m = (await tx.query<SupportMessageDoc>('INSERT INTO support_messages (ticket_id, author, body, internal) VALUES ($1,$2::jsonb,$3,$4) RETURNING *', [id, JSON.stringify(actorOf(auth)), input.message, input.internal])).rows[0]!;
    await tx.query('UPDATE support_tickets SET updated_at = now() WHERE id = $1', [id]);
    await writeAudit({ actor: actorOf(auth), action: input.internal ? 'SUPPORT.NOTE' : 'SUPPORT.REPLY', entity: { type: 'support_ticket', id }, hotelId: t.hotelId, requestId }, tx);
    return m;
  });
}
