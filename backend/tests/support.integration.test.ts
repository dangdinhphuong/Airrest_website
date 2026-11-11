import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toE164VN } from '@airrest/utils';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { createBookingVia, guestIp } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const PHONE = '0912345678';

run('tích hợp: hỗ trợ khách + admin xử lý', () => {
  const app = createApp();
  let hotel = '';
  let rt = '';
  let ip = 0;
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const g = () => guestIp(++ip + 50);
  const create = (body: Record<string, unknown>, key = `sp-${++n}-${Date.now()}`, ipHdr = g()) =>
    request(app).post('/v1/support').set(ipHdr).set('Idempotency-Key', key).send({ phone: PHONE, subject: 'Cần hỗ trợ', message: 'Tôi cần đổi giờ đón', ...body });
  const lookup = (code: string, phone = PHONE) => request(app).post('/v1/support/lookup').set(g()).send({ code, phone });

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'S1' });
    rt = await mkRoomType(hotel, 5);
  });
  afterAll(async () => closeDb());

  it('tạo ticket gắn booking bằng mã+SĐT: 201, code SP-, có message đầu, audit; liên hệ chuẩn hóa E.164', async () => {
    const b = await createBookingVia(app, { hotelId: hotel, roomTypeId: rt });
    const res = await create({ bookingCode: b.code, fullName: 'Nguyễn Văn A' });
    expect(res.status).toBe(201);
    expect(res.body.ticket.code).toMatch(/^SP-[0-9A-HJKMNP-TV-Z]{8}$/);
    const t = (await one<any>('SELECT * FROM support_tickets WHERE code = $1', [res.body.ticket.code]))!;
    expect(t.bookingId).toBe(b.id);
    expect(t.contact.phone).toBe(toE164VN(PHONE));
    expect(await count('support_messages', 'ticket_id = $1', [t.id])).toBe(1);
    expect(await count('audit_logs', "action = 'SUPPORT.CREATE' AND entity_id = $1", [t.id])).toBe(1);
  });

  it('không gắn booking: 201, booking_id null; gắn booking với SĐT sai -> 404 và không tạo ticket', async () => {
    const free = await create({});
    expect(free.status).toBe(201);
    expect((await one<any>('SELECT booking_id FROM support_tickets WHERE code = $1', [free.body.ticket.code]))!.bookingId).toBeUndefined();
    const b = await createBookingVia(app, { hotelId: hotel, roomTypeId: rt });
    const before = await count('support_tickets');
    const bad = await create({ bookingCode: b.code, phone: '0999999999' });
    expect(bad.status).toBe(404);
    expect(bad.body.error.code).toBe('BOOKING_NOT_FOUND');
    expect(await count('support_tickets')).toBe(before);
  });

  it('validate: subject rỗng / message > 2000 / SĐT sai -> 422; Idempotency-Key lặp -> cùng ticket; thiếu key -> 400', async () => {
    expect((await create({ subject: '' })).status).toBe(422);
    expect((await create({ message: 'x'.repeat(2001) })).status).toBe(422);
    expect((await create({ phone: '123' })).status).toBe(422);
    const same = guestIp(77);
    const before = await count('support_tickets');
    const a = await create({}, 'idem-support-key-1', same);
    const c = await create({}, 'idem-support-key-1', same);
    expect(c.body.ticket.code).toBe(a.body.ticket.code);
    expect(await count('support_tickets')).toBe(before + 1);
    const none = await request(app).post('/v1/support').set(g()).send({ phone: PHONE, subject: 'abc', message: 'abc' });
    expect(none.status).toBe(400);
  });

  it('tra cứu: đúng mã+SĐT thấy ticket; sai SĐT và mã không tồn tại cho cùng body 404; không đọc được dù biết mã', async () => {
    const t = (await create({ message: 'Nội dung công khai' })).body.ticket.code as string;
    const ok = await lookup(t);
    expect(ok.status).toBe(200);
    expect(ok.body.ticket.messages[0]).toMatchObject({ from: 'GUEST', body: 'Nội dung công khai' });
    const wrong = await lookup(t, '0988888888');
    const missing = await lookup('SP-ZZZZZZZZ');
    expect(wrong.status).toBe(404);
    expect({ ...wrong.body.error, requestId: 0 }).toEqual({ ...missing.body.error, requestId: 0 });
    expect(wrong.body.error.code).toBe('TICKET_NOT_FOUND');
  });

  it('rate limit 429 sau 10 lần dò mã ticket', async () => {
    const same = guestIp(197);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request(app).post('/v1/support/lookup').set(same).send({ code: 'SP-ZZZZZZZZ', phone: PHONE })).status;
    expect(last).toBe(429);
  });

  it('khách trả lời thêm được; ghi chú nội bộ không lộ; ticket RESOLVED -> 409', async () => {
    const code = (await create({})).body.ticket.code as string;
    const reply = await request(app).post('/v1/support/reply').set(g()).set('Idempotency-Key', `rp-${++n}-${Date.now()}`).send({ code, phone: PHONE, message: 'Bổ sung thông tin' });
    expect(reply.status).toBe(201);
    expect(reply.body.ticket.messages).toHaveLength(2);
    const id = (await one<any>('SELECT id FROM support_tickets WHERE code = $1', [code]))!.id;
    await db.query("INSERT INTO support_messages (ticket_id, author, body, internal) VALUES ($1,'{\"type\":\"ADMIN\"}'::jsonb,'BÍ MẬT NỘI BỘ',true)", [id]);
    expect(JSON.stringify((await lookup(code)).body)).not.toContain('BÍ MẬT');
    await db.query("UPDATE support_tickets SET status = 'RESOLVED' WHERE id = $1", [id]);
    const late = await request(app).post('/v1/support/reply').set(g()).set('Idempotency-Key', `rp-${++n}-${Date.now()}`).send({ code, phone: PHONE, message: 'Thêm nữa' });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('TICKET_RESOLVED');
  });

  describe('admin xử lý ticket', () => {
    let sup = '';
    let supId = '';
    let ticketId = '';
    let ticketCode = '';
    const patch = (id: string, body: object, t = sup) => request(app).patch(`/v1/admin/support/${id}`).set(auth(t)).send(body);
    beforeAll(async () => {
      const a = await mkAdmin([PERM.SUPPORT_HANDLE]);
      sup = a.token;
      supId = a.id;
      ticketCode = (await create({ subject: 'Ticket admin' })).body.ticket.code;
      ticketId = (await one<any>('SELECT id FROM support_tickets WHERE code = $1', [ticketCode]))!.id;
    });

    it('401 không token; thiếu quyền (lễ tân/OPS) 403; có quyền 200; SĐT trong danh sách đã che', async () => {
      expect((await request(app).get('/v1/admin/support')).status).toBe(401);
      const hotelStaff = (await mkStaff(hotel, [PERM.BOOKING_READ])).token;
      expect((await request(app).get('/v1/admin/support').set(auth(hotelStaff))).status).toBe(403);
      const ops = (await mkAdmin([PERM.SHUTTLE_HANDLE])).token;
      expect((await request(app).get('/v1/admin/support').set(auth(ops))).status).toBe(403);
      const list = await request(app).get('/v1/admin/support?limit=100').set(auth(sup));
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain('912345678');
    });

    it('lọc status + phân trang keyset mới nhất trước', async () => {
      const p1 = await request(app).get('/v1/admin/support?status=OPEN&limit=2').set(auth(sup));
      expect(p1.body.items.length).toBe(2);
      expect(p1.body.items[0].seq).toBeGreaterThan(p1.body.items[1].seq);
      const p2 = await request(app).get(`/v1/admin/support?status=OPEN&limit=2&cursor=${p1.body.nextCursor}`).set(auth(sup));
      expect(p2.body.items[0].seq).toBeLessThan(p1.body.items[1].seq);
    });

    it('máy trạng thái: OPEN->IN_PROGRESS gán người thao tác; ->RESOLVED có resolved_at; chuyển sai -> 409; song song: 1 thắng', async () => {
      const direct = await patch(ticketId, { status: 'RESOLVED' });
      expect(direct.status).toBe(409);
      expect(direct.body.error.code).toBe('INVALID_TRANSITION');
      const [a, b] = await Promise.all([patch(ticketId, { status: 'IN_PROGRESS' }), patch(ticketId, { status: 'IN_PROGRESS' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((await one<any>('SELECT assignee_id FROM support_tickets WHERE id = $1', [ticketId]))!.assigneeId).toBe(supId);
      expect((await patch(ticketId, { status: 'RESOLVED' })).status).toBe(200);
      expect((await one<any>('SELECT resolved_at FROM support_tickets WHERE id = $1', [ticketId]))!.resolvedAt).toBeTruthy();
      expect((await patch(ticketId, { status: 'IN_PROGRESS' })).status).toBe(409);
    });

    it('assigneeId là tài khoản khách sạn hoặc đã khóa -> 422 ASSIGNEE_INVALID', async () => {
      const t2 = (await one<any>('SELECT id FROM support_tickets WHERE status = \'OPEN\' LIMIT 1'))!.id;
      const staff = await mkStaff(hotel, [PERM.BOOKING_READ]);
      expect((await patch(t2, { assigneeId: staff.id })).body.error.code).toBe('ASSIGNEE_INVALID');
      const locked = await mkAdmin([PERM.SUPPORT_HANDLE]);
      await db.query("UPDATE accounts SET status = 'LOCKED' WHERE id = $1", [locked.id]);
      expect((await patch(t2, { assigneeId: locked.id })).status).toBe(422);
    });

    it('admin trả lời công khai khách thấy (STAFF); ghi chú nội bộ chỉ admin thấy; RESOLVED chỉ thêm được ghi chú', async () => {
      const code = (await create({ subject: 'Ticket 3' })).body.ticket.code as string;
      const id = (await one<any>('SELECT id FROM support_tickets WHERE code = $1', [code]))!.id;
      expect((await request(app).post(`/v1/admin/support/${id}/messages`).set(auth(sup)).send({ message: 'Chúng tôi đã nhận' })).status).toBe(201);
      expect((await request(app).post(`/v1/admin/support/${id}/messages`).set(auth(sup)).send({ message: 'GHI CHÚ RIÊNG', internal: true })).status).toBe(201);
      const guestView = JSON.stringify((await lookup(code)).body);
      expect(guestView).toContain('Chúng tôi đã nhận');
      expect(guestView).toContain('STAFF');
      expect(guestView).not.toContain('GHI CHÚ RIÊNG');
      expect(JSON.stringify((await request(app).get(`/v1/admin/support/${id}`).set(auth(sup))).body)).toContain('GHI CHÚ RIÊNG');
      await patch(id, { status: 'IN_PROGRESS' });
      await patch(id, { status: 'RESOLVED' });
      expect((await request(app).post(`/v1/admin/support/${id}/messages`).set(auth(sup)).send({ message: 'Công khai muộn' })).body.error.code).toBe('TICKET_RESOLVED');
      expect((await request(app).post(`/v1/admin/support/${id}/messages`).set(auth(sup)).send({ message: 'Ghi chú thêm', internal: true })).status).toBe(201);
      expect(await count('audit_logs', "entity_type = 'support_ticket' AND entity_id = $1", [id])).toBeGreaterThanOrEqual(5);
    });
  });
});
