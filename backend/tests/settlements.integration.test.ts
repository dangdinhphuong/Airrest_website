import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHotelPayoutsRouter } from '../api/modules/adminSettlements/adminHotelPayouts.router';
import { adminPayerStatementsRouter } from '../api/modules/adminSettlements/adminPayerStatements.router';
import { payerStatementsRouter } from '../api/modules/adminSettlements/payerStatements.router';
import { errorHandler } from '../api/middleware/errorHandler';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { commissionOf, nextPeriod, periodEnded } from '../services/settlement/calc';
import * as hp from '../services/settlement/payouts';
import * as st from '../services/settlement/statements';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ 'Idempotency-Key': `st-${randomUUID()}` });
const T = (s: string) => new Date(s);

// Không cần DB: quy tắc làm tròn và kỳ.
describe('settlement calc', () => {
  it('hoa hồng làm tròn XUỐNG từng dòng, không sai số số thực', () => {
    expect(commissionOf(333_333, 10)).toBe(33_333); // 33333.3
    expect(commissionOf(799_999, 12.5)).toBe(99_999); // 99999.875
    expect(commissionOf(100, 0.07)).toBe(0);
    expect(commissionOf(1_000_000, 12.34)).toBe(123_400);
    expect(commissionOf(3, 33.33)).toBe(0);
    expect(() => commissionOf(-1, 10)).toThrow();
    expect(() => commissionOf(1.5, 10)).toThrow();
  });
  it('kỳ: tháng sau, hết kỳ theo giờ VN', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01');
    expect(periodEnded('2026-03', T('2026-03-31T16:59:59Z'))).toBe(false); // 23:59:59 ngày 31 giờ VN
    expect(periodEnded('2026-03', T('2026-03-31T17:00:00Z'))).toBe(true); // 00:00 ngày 1/4 giờ VN
  });
});

run('tích hợp: kết toán tháng hai chiều', () => {
  const app = express();
  app.use(express.json());
  app.use('/v1/admin/payer-statements', adminPayerStatementsRouter);
  app.use('/v1/admin/hotel-payouts', adminHotelPayoutsRouter);
  app.use('/v1/payer/statements', payerStatementsRouter);
  app.use(errorHandler);

  let payerA = '', payerB = '', H1 = '', H2 = '', rt1 = '', rt2 = '', flightReal = '', flightSim = '', batchA = '', batchASim = '', batchB = '', batchAFlightSim = '';
  let adminAuth: any, financeTok = '', manageTok = '', readTok = '', tokA = '', tokB = '';
  let dayOff = 10;

  const mkPayer = async (code: string) => (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ($1,$1 || ' Co','AIRLINE') RETURNING id", [code]))!.id;
  const mkBatch = async (payer: string, flight: string, simulated = false) => {
    const stn = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,$2,'Tram') ON CONFLICT (payer_id, airport_iata) DO UPDATE SET name = 'Tram' RETURNING id", [payer, 'HAN']))!.id;
    return (await one<{ id: string }>('INSERT INTO delay_batches (payer_id, station_id, flight_id, simulated) VALUES ($1,$2,$3,$4) RETURNING id', [payer, stn, flight, simulated]))!.id;
  };
  const mkFlight = async (code: string, simulated: boolean) => (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status, simulated) VALUES ($1,'VNA','HAN',now(),'ONTIME',$2) RETURNING id", [code, simulated]))!.id;
  /** Dựng đơn PAYER bằng createPayerBooking rồi đặt stay.to/trạng thái/tiền hợp đồng về đúng kỳ test. */
  const mkBk = async (o: { batch: string; hotel: string; rt: string; to: string; status?: string; room: number; simulated?: boolean; pnr?: string }) => {
    const off = (dayOff += 2);
    const grp = (await one<{ id: string }>('INSERT INTO delay_groups (batch_id, pnr, code) VALUES ($1,$2,$3) RETURNING id', [o.batch, o.pnr ?? 'PNR001', `NH-${randomUUID().slice(0, 8)}`]))!.id;
    const b = await createPayerBooking({ hotelId: o.hotel, rooms: [{ roomTypeId: o.rt, qty: 1 }], from: new Date(Date.now() + off * DAY), to: new Date(Date.now() + (off + 1) * DAY), guest: { fullName: 'Khách Test', phone: '0912345678' }, batchId: o.batch, groupId: grp, simulated: o.simulated ?? false, contractRoomVnd: o.room });
    await db.query(
      "UPDATE bookings SET status = $2, stay = jsonb_set(stay, '{to}', to_jsonb($3::text)), simulated = $4 WHERE id = $1",
      [b.id, o.status ?? 'CONFIRMED', o.to, o.simulated ?? false],
    );
    return b.id;
  };
  const mkShuttle = (booking: string, hotel: string, price: number, status = 'REQUESTED') =>
    db.query("INSERT INTO shuttle_requests (booking_id, hotel_id, direction, airport_iata, distance_km, pickup_at, price_vnd, config_version, status) VALUES ($1,$2,'TO_AIRPORT','HAN',5,now(),$3,1,$4)", [booking, hotel, price, status]);
  const ctx = (sub = adminAuth.sub): st.Ctx => ({ auth: { kind: 'ACCOUNT', sub, accountType: 'ADMIN', permissions: [] }, requestId: 'test' });
  const payerCtx = (): st.Ctx => ({ auth: { kind: 'ACCOUNT', sub: randomUUID(), accountType: 'PAYER', payerId: payerA, permissions: [] }, requestId: 'test' });
  const sumLines = async (id: string, kind: string) => (await one<{ s: number }>('SELECT COALESCE(sum(amount_vnd),0) AS s FROM payer_statement_lines WHERE statement_id = $1 AND kind = $2', [id, kind]))!.s;

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'S1' });
    H2 = await mkHotel({ code: 'S2' });
    rt1 = await mkRoomType(H1, 50, 500_000);
    rt2 = await mkRoomType(H2, 50, 800_000);
    payerA = await mkPayer('SPAYA');
    payerB = await mkPayer('SPAYB');
    for (const [p, h, rt, pct] of [[payerA, H1, rt1, 10], [payerA, H2, rt2, 12.5], [payerB, H1, rt1, 8]] as const) {
      await db.query("INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, commission_pct, valid_from) VALUES ($1,$2,$3,500000,$4,'2025-01-01')", [p, h, rt, pct]);
    }
    flightReal = await mkFlight('VN7001', false);
    flightSim = await mkFlight('VN7002', true);
    batchA = await mkBatch(payerA, flightReal);
    batchASim = await mkBatch(payerA, flightReal, true);
    batchAFlightSim = await mkBatch(payerA, flightSim);
    batchB = await mkBatch(payerB, flightReal);

    const M = '2026-03-15T05:00:00.000Z';
    const b1 = await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: M, room: 333_333 });
    await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: M, room: 500_000, status: 'CHECKED_OUT' });
    const b3 = await mkBk({ batch: batchA, hotel: H2, rt: rt2, to: M, room: 799_999, status: 'NO_SHOW' });
    const b4 = await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: M, room: 500_000, status: 'CANCELLED' });
    for (const s of ['EXPIRED', 'REJECTED', 'PENDING']) await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: M, room: 500_000, status: s });
    await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: M, room: 900_000, simulated: true }); // booking simulated
    await mkBk({ batch: batchASim, hotel: H1, rt: rt1, to: M, room: 900_000 }); // lô simulated
    await mkBk({ batch: batchAFlightSim, hotel: H1, rt: rt1, to: M, room: 900_000 }); // chuyến simulated
    await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: '2026-02-28T17:30:00.000Z', room: 100_000 }); // 01/03 00:30 giờ VN -> THÁNG 3
    await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: '2026-03-31T17:30:00.000Z', room: 250_000 }); // 01/04 00:30 giờ VN -> THÁNG 4
    await mkBk({ batch: batchB, hotel: H1, rt: rt1, to: M, room: 200_000 });
    await mkShuttle(b1, H1, 120_000);
    await mkShuttle(b1, H1, 80_000, 'CANCELLED');
    await mkShuttle(b3, H2, 150_000, 'DONE');
    await mkShuttle(b4, H1, 99_000); // đơn hủy: xe không tính

    const mk = async (perms: string[]) => (await mkAdmin(perms)).token;
    adminAuth = { sub: (await mkAdmin([])).id };
    financeTok = await mk([PERM.ADMIN_PAYMENT_MANAGE, PERM.ADMIN_PAYMENT_READ]);
    manageTok = await mk([PERM.ADMIN_PAYER_MANAGE, PERM.ADMIN_PAYER_READ]);
    readTok = await mk([PERM.ADMIN_PAYER_READ, PERM.ADMIN_PAYMENT_READ]);
    const mkPayerAccount = async (payerId: string) => {
      const id = randomUUID();
      await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, payer_id, role_ids) VALUES ($1,'PAYER',$2,'x','NV','ACTIVE',$3,$4::uuid[])", [id, `${id.slice(0, 8)}@p.vn`, payerId, [await systemRoleId('payer_staff')]]);
      return signAccountToken({ sub: id, accountType: 'PAYER' });
    };
    tokA = await mkPayerAccount(payerA);
    tokB = await mkPayerAccount(payerB);
  });
  afterAll(async () => closeDb());

  let stA = '', stB = '';

  it('bảng kê A: phòng + xe đúng, không lẫn simulated/hủy/hết hạn/khác kỳ; NO_SHOW tính; hoa hồng floor từng dòng', async () => {
    const r = await st.generateStatement(ctx(), payerA, '2026-03');
    stA = r.statement.id;
    // phòng: 333333 + 500000 + 799999 (NO_SHOW) + 100000 (ranh giới giờ VN) ; xe: 120000 + 150000 (bỏ xe hủy + xe của đơn hủy)
    expect(r.statement).toMatchObject({ status: 'DRAFT', roomVnd: 1_733_332, shuttleVnd: 270_000, adjustmentVnd: 0, upgradeDeltaVnd: 0, totalVnd: 2_003_332, commissionVnd: 193_332, lineCount: 6, version: 2 });
    expect(r.warnings.linesWithoutRate).toBe(0);
    // tổng = tổng các dòng
    expect(await sumLines(stA, 'ROOM')).toBe(r.statement.roomVnd);
    expect(await sumLines(stA, 'SHUTTLE')).toBe(r.statement.shuttleVnd);
    const lines = (await st.getStatement(stA)).lines as any[];
    expect(lines.filter((l) => l.kind === 'ROOM').map((l) => l.commissionVnd).sort((a, b) => a - b)).toEqual([10_000, 33_333, 50_000, 99_999]);
    expect(lines.every((l) => l.flightCode === 'VN7001')).toBe(true);
    expect(await count('payer_statement_lines', 'statement_id = $1 AND amount_vnd = 900000', [stA])).toBe(0);
    // kỳ 4 chỉ có đơn ranh giới
    const apr = await st.generateStatement(ctx(), payerA, '2026-04');
    expect(apr.statement).toMatchObject({ roomVnd: 250_000, commissionVnd: 25_000, shuttleVnd: 0 });
  });

  it('tái tạo DRAFT idempotent: cùng kết quả, không đổi version, không nhân đôi dòng', async () => {
    const before = (await st.getStatement(stA)).statement;
    const r = await st.generateStatement(ctx(), payerA, '2026-03');
    expect(r.unchanged).toBe(true);
    expect(r.statement).toMatchObject({ id: stA, totalVnd: before.totalVnd, version: before.version, lineCount: 6 });
    expect(await count('payer_statement_lines', 'statement_id = $1', [stA])).toBe(6);
    expect(await count('payer_statements', 'payer_id = $1 AND period = $2', [payerA, '2026-03'])).toBe(1);
  });

  it('bảng kê B và đối chiếu hai chiều: tổng bảng kê payer = phòng + xe; chi trả KS + hoa hồng = tổng phòng', async () => {
    stB = (await st.generateStatement(ctx(), payerB, '2026-03')).statement.id;
    expect((await st.getStatement(stB)).statement).toMatchObject({ roomVnd: 200_000, commissionVnd: 16_000, totalVnd: 200_000 });
    const { items } = await hp.generateHotelPayouts(ctx(), '2026-03');
    const byHotel = Object.fromEntries(items.map((p) => [p.hotelId, p]));
    expect(byHotel[H1]).toMatchObject({ grossVnd: 1_133_333, commissionVnd: 109_333, netVnd: 1_024_000, lineCount: 4 });
    expect(byHotel[H2]).toMatchObject({ grossVnd: 799_999, commissionVnd: 99_999, netVnd: 700_000, lineCount: 1 });
    const a = (await st.getStatement(stA)).statement, b = (await st.getStatement(stB)).statement;
    const sum = (k: string) => items.reduce((s, p) => s + p[k], 0);
    expect(sum('grossVnd')).toBe(a.roomVnd + b.roomVnd); // tổng phòng hai chiều khớp
    expect(sum('netVnd') + sum('commissionVnd')).toBe(a.roomVnd + b.roomVnd); // chi trả KS + hoa hồng Airrest = tổng phòng
    expect(sum('commissionVnd')).toBe(a.commissionVnd + b.commissionVnd);
    expect(a.totalVnd + b.totalVnd).toBe(a.roomVnd + b.roomVnd + a.shuttleVnd + b.shuttleVnd);
    // tái tạo idempotent
    const again = await hp.generateHotelPayouts(ctx(), '2026-03');
    expect(again.items.map((p) => [p.hotelId, p.version, p.netVnd]).sort()).toEqual(items.map((p) => [p.hotelId, p.version, p.netVnd]).sort());
    expect(await count('hotel_payout_lines', 'true')).toBe(5);
  });

  it('gửi bảng kê: chưa hết kỳ -> 409; gửi đặt hạn khiếu nại đúng 5 ngày', async () => {
    await expect(st.sendStatement(ctx(), stA, T('2026-03-31T10:00:00Z'))).rejects.toMatchObject({ code: 'PERIOD_NOT_ENDED' });
    const s = await st.sendStatement(ctx(), stA, T('2026-04-02T00:00:00Z'));
    expect(s.status).toBe('SENT');
    expect(new Date(s.disputeDeadline).getTime() - new Date(s.sentAt).getTime()).toBe(5 * DAY);
    await expect(st.generateStatement(ctx(), payerA, '2026-03')).rejects.toMatchObject({ code: 'STATEMENT_NOT_DRAFT' });
    await expect(st.sendStatement(ctx(), stA, T('2026-04-02T00:00:00Z'))).rejects.toMatchObject({ code: 'STATEMENT_NOT_DRAFT' });
  });

  it('khiếu nại: đơn vị khác 404; trong hạn OK (kèm lý do); ngoài hạn 409', async () => {
    await st.sendStatement(ctx(), stB, T('2026-04-02T00:00:00Z'));
    await expect(st.disputeStatement(payerCtx(), payerB, stA, 'sai số tiền', T('2026-04-03T00:00:00Z'))).rejects.toMatchObject({ status: 404 }); // B không khiếu nại được bảng kê của A
    const d = await st.disputeStatement(payerCtx(), payerA, stA, 'Sai số tiền xe', T('2026-04-06T23:59:59Z')); // < 5 ngày
    expect(d).toMatchObject({ status: 'DISPUTED', disputeReason: 'Sai số tiền xe' });
    await expect(st.disputeStatement(payerCtx(), payerA, stA, 'lần hai', T('2026-04-06T23:59:59Z'))).rejects.toMatchObject({ code: 'STATEMENT_NOT_DISPUTABLE' });
    await expect(st.disputeStatement(payerCtx(), payerB, stB, 'muộn', T('2026-04-07T00:00:01Z'))).rejects.toMatchObject({ code: 'DISPUTE_WINDOW_CLOSED' });
    expect(await count('audit_logs', "action = 'PAYER_STATEMENT.DISPUTE' AND entity_id = $1", [stA])).toBe(1);
  });

  it('khóa: chưa hết hạn/đang khiếu nại bị chặn; hết hạn thì khóa; khóa rồi generate KHÔNG đổi dù có đơn mới', async () => {
    await expect(st.lockStatement(ctx(), stA, T('2026-04-10T00:00:00Z'))).rejects.toMatchObject({ code: 'STATEMENT_NOT_LOCKABLE' }); // đang DISPUTED
    await expect(st.lockStatement(ctx(), stB, T('2026-04-05T00:00:00Z'))).rejects.toMatchObject({ code: 'DISPUTE_WINDOW_OPEN' });
    const locked = await st.lockStatement(ctx(), stB, T('2026-04-07T00:00:01Z'));
    expect(locked).toMatchObject({ status: 'LOCKED', lockedBy: adminAuth.sub });
    await mkBk({ batch: batchB, hotel: H1, rt: rt1, to: '2026-03-20T05:00:00.000Z', room: 777_000 }); // đơn mới của kỳ đã khóa
    const r = await st.generateStatement(ctx(), payerB, '2026-03');
    expect(r.unchanged).toBe(true);
    expect(r.statement).toMatchObject({ status: 'LOCKED', totalVnd: 200_000, version: locked.version, lineCount: 1 });
    expect(await count('payer_statement_lines', 'statement_id = $1', [stB])).toBe(1);
    // mở lại -> DRAFT (cần lý do), tạo lại thì thấy đơn mới; khóa lại để các test sau
    expect((await st.reopenStatement(ctx(), stA, 'xử lý khiếu nại')).status).toBe('DRAFT');
    expect((await st.generateStatement(ctx(), payerA, '2026-03')).statement.totalVnd).toBe(2_003_332);
    await st.sendStatement(ctx(), stA, T('2026-04-08T00:00:00Z'));
    expect((await st.lockStatement(ctx(), stA, T('2026-04-13T00:00:00Z'))).status).toBe('LOCKED');
    expect(await count('audit_logs', "action IN ('PAYER_STATEMENT.LOCK','PAYER_STATEMENT.REOPEN','PAYER_STATEMENT.SEND')")).toBeGreaterThanOrEqual(5);
  });

  it('truy thu/điều chỉnh sau khóa rơi vào KỲ SAU (dòng ADJUSTMENT), kỳ đã khóa không đổi; kỳ nháp được tạo lại vẫn giữ dòng điều chỉnh', async () => {
    await expect(st.addPayerAdjustment(ctx(), { payerId: payerA, period: '2026-04', amountVnd: 1000, memo: 'chưa khóa' })).rejects.toMatchObject({ code: 'PERIOD_NOT_LOCKED' });
    const before = (await st.getStatement(stA)).statement;
    const apr = await st.addPayerAdjustment(ctx(), { payerId: payerA, period: '2026-03', amountVnd: -50_000, memo: 'Hoàn một phòng' });
    expect(apr).toMatchObject({ period: '2026-04', adjustmentVnd: -50_000, roomVnd: 250_000, totalVnd: 200_000 });
    expect((await st.getStatement(stA)).statement).toMatchObject({ totalVnd: before.totalVnd, version: before.version, adjustmentVnd: 0 });
    const regen = await st.generateStatement(ctx(), payerA, '2026-04');
    expect(regen.statement).toMatchObject({ adjustmentVnd: -50_000, totalVnd: 200_000 });
    expect(await count('payer_statement_lines', "statement_id = $1 AND kind = 'ADJUSTMENT'", [apr.id])).toBe(1);
    // kỳ 4 không còn DRAFT -> điều chỉnh tiếp sang kỳ 5
    await st.sendStatement(ctx(), apr.id, T('2026-05-02T00:00:00Z'));
    const may = await st.addPayerAdjustment(ctx(), { payerId: payerA, period: '2026-03', amountVnd: 70_000, memo: 'Truy thu thêm' });
    expect(may).toMatchObject({ period: '2026-05', adjustmentVnd: 70_000 });
  });

  it('chi trả KS: khóa, truy thu KS kỳ sau, ghi nhận đã trả; khóa rồi generate không đổi', async () => {
    const p1 = (await db.query('SELECT * FROM hotel_payouts WHERE hotel_id = $1 AND period = $2', [H1, '2026-03'])).rows[0]!;
    await expect(hp.markPaid(ctx(), p1.id, 'CK-001')).rejects.toMatchObject({ code: 'PAYOUT_NOT_LOCKED' });
    await expect(hp.addHotelAdjustment(ctx(), { hotelId: H1, period: '2026-03', amountVnd: -300_000, memo: 'chưa khóa' })).rejects.toMatchObject({ code: 'PERIOD_NOT_LOCKED' });
    const locked = await hp.lockHotelPayout(ctx(), p1.id);
    expect(locked.status).toBe('LOCKED');
    await mkBk({ batch: batchA, hotel: H1, rt: rt1, to: '2026-03-21T05:00:00.000Z', room: 640_000 });
    const re = (await hp.generateHotelPayouts(ctx(), '2026-03')).items.find((p) => p.hotelId === H1)!;
    expect(re).toMatchObject({ status: 'LOCKED', grossVnd: 1_133_333, netVnd: 1_024_000, version: locked.version }); // không đổi dù có đơn mới
    const adj = await hp.addHotelAdjustment(ctx(), { hotelId: H1, period: '2026-03', amountVnd: -300_000, memo: 'Hoàn khách theo khiếu nại H9' });
    expect(adj).toMatchObject({ period: '2026-04', status: 'DRAFT', grossVnd: -300_000, commissionVnd: 0, netVnd: -300_000 });
    const paid = await hp.markPaid(ctx(), p1.id, 'CK-001');
    expect(paid).toMatchObject({ status: 'PAID', paymentRef: 'CK-001' });
    await expect(hp.lockHotelPayout(ctx(), p1.id)).rejects.toMatchObject({ code: 'PAYOUT_NOT_DRAFT' });
    // kỳ 4: tạo lại giữ dòng truy thu, thêm dòng phòng của đơn ranh giới (250000, hoa hồng KS H1 theo payer A 10% = 25000)
    const apr = (await hp.generateHotelPayouts(ctx(), '2026-04')).items.find((p) => p.hotelId === H1)!;
    expect(apr).toMatchObject({ grossVnd: -50_000, commissionVnd: 25_000, netVnd: -75_000, lineCount: 2 });
    await expect(hp.markPaid(ctx(), apr.id, 'CK-002')).rejects.toMatchObject({ code: 'PAYOUT_NOT_LOCKED' });
  });

  it('CSV: tiêu đề, dòng, tổng khớp, chống công thức Excel, số âm giữ nguyên', async () => {
    await st.addPayerAdjustment(ctx(), { payerId: payerB, period: '2026-03', amountVnd: -1_234, memo: '=HYPERLINK("x"),"a"' });
    const may = (await db.query("SELECT id FROM payer_statements WHERE payer_id = $1 AND period = '2026-04'", [payerB])).rows[0]!;
    const { csv, filename } = await st.statementCsv(may.id);
    expect(filename).toMatch(/^bang-ke-2026-04-.*\.csv$/);
    expect(csv.startsWith('﻿kind,booking_code,group_code,flight_code,hotel,amount_vnd,commission_vnd,memo\r\n')).toBe(true);
    expect(csv).toContain('ADJUSTMENT,,,,,-1234,0,"[Kỳ 2026-03] =HYPERLINK(""x""),""a"""'); // memo có phẩy/nháy kép -> bọc nháy; bắt đầu bằng '[' nên không cần chống công thức
    expect(csv).toContain('TOTAL,,,,,-1234,0,');
    const a = await st.statementCsv(stA);
    expect(a.csv).toContain('TOTAL,,,,,2003332,193332,');
    expect(a.csv.trim().split('\r\n')).toHaveLength(1 + 6 + 1);
    // ô chữ bắt đầu bằng '=' được vô hiệu hóa
    await db.query("UPDATE payer_statement_lines SET memo = '=cmd|calc' WHERE statement_id = $1 AND kind = 'SHUTTLE'", [stA]);
    expect((await st.statementCsv(stA)).csv).toContain("'=cmd|calc");
  });

  it('API: quyền theo permission; nhân viên payer không khóa được; cô lập payer; nháp ẩn với payer; Idempotency-Key', async () => {
    const r = request(app);
    // nhân viên payer xem của mình (không thấy nháp), đơn vị khác 404
    const list = await r.get('/v1/payer/statements').set(bearer(tokA));
    expect(list.status).toBe(200);
    expect(list.body.items.every((s: any) => s.payerId === payerA && s.status !== 'DRAFT')).toBe(true);
    expect((await r.get(`/v1/payer/statements/${stA}`).set(bearer(tokA))).body.lines).toHaveLength(6);
    expect((await r.get(`/v1/payer/statements/${stA}`).set(bearer(tokB))).status).toBe(404);
    expect((await r.get(`/v1/payer/statements/${stA}/csv`).set(bearer(tokB))).status).toBe(404);
    expect((await r.get(`/v1/payer/statements/${stA}/csv`).set(bearer(tokA))).headers['content-type']).toContain('text/csv');
    const draft = (await st.generateStatement(ctx(), payerA, '2026-06')).statement.id;
    expect((await r.get(`/v1/payer/statements/${draft}`).set(bearer(tokA))).status).toBe(404);
    // nhân viên payer không dùng được API admin
    for (const [m, url] of [['post', `/v1/admin/payer-statements/${stA}/lock`], ['post', `/v1/admin/payer-statements/${stA}/reopen`], ['get', '/v1/admin/payer-statements'], ['get', '/v1/admin/hotel-payouts'], ['post', '/v1/admin/hotel-payouts/generate']] as const) {
      expect((await (r as any)[m](url).set(bearer(tokA)).set(idem()).send({})).status).toBe(403);
    }
    // quyền tách bạch: chỉ-đọc không ghi; manage không khóa; finance không tạo
    expect((await r.get('/v1/admin/payer-statements').set(bearer(readTok))).status).toBe(200);
    expect((await r.post('/v1/admin/payer-statements/generate').set(bearer(readTok)).set(idem()).send({ payerId: payerA, period: '2026-06' })).status).toBe(403);
    expect((await r.post(`/v1/admin/payer-statements/${draft}/lock`).set(bearer(manageTok)).set(idem()).send()).status).toBe(403);
    expect((await r.post('/v1/admin/payer-statements/generate').set(bearer(financeTok)).set(idem()).send({ payerId: payerA, period: '2026-06' })).status).toBe(403);
    // generate qua API: cần Idempotency-Key; phát lại cùng key trả kết quả cũ; kỳ sai -> 422
    expect((await r.post('/v1/admin/payer-statements/generate').set(bearer(manageTok)).send({ payerId: payerA, period: '2026-06' })).status).toBe(400);
    expect((await r.post('/v1/admin/payer-statements/generate').set(bearer(manageTok)).set(idem()).send({ payerId: payerA, period: '2026-13' })).status).toBe(422);
    const h = idem();
    const g1 = await r.post('/v1/admin/payer-statements/generate').set(bearer(manageTok)).set(h).send({ payerId: payerA, period: '2026-06' });
    const g2 = await r.post('/v1/admin/payer-statements/generate').set(bearer(manageTok)).set(h).send({ payerId: payerA, period: '2026-06' });
    expect([g1.status, g2.headers['idempotent-replay']]).toEqual([200, 'true']);
    // finance khóa/mở lại qua API: kỳ nháp không khóa được (409); mở lại bảng kê đã khóa cần lý do
    expect((await r.post(`/v1/admin/payer-statements/${draft}/lock`).set(bearer(financeTok)).set(idem()).send()).status).toBe(409);
    expect((await r.post(`/v1/admin/payer-statements/${stB}/reopen`).set(bearer(financeTok)).set(idem()).send({})).status).toBe(422);
    const reo = await r.post(`/v1/admin/payer-statements/${stB}/reopen`).set(bearer(financeTok)).set(idem()).send({ reason: 'Đối chiếu lại đơn mới' });
    expect([reo.status, reo.body.statement.status]).toEqual([200, 'DRAFT']);
    // khiếu nại qua API (payer): bảng kê nháp -> 404; payer khác -> 404
    await st.generateStatement(ctx(), payerB, '2026-03');
    expect((await r.post(`/v1/payer/statements/${stB}/dispute`).set(bearer(tokB)).set(idem()).send({ reason: 'chưa gửi' })).status).toBe(404);
    await st.sendStatement(ctx(), stB, new Date(Date.now() - 0)); // kỳ 2026-03 đã kết thúc theo giờ thật
    expect((await r.post(`/v1/payer/statements/${stB}/dispute`).set(bearer(tokA)).set(idem()).send({ reason: 'không phải của tôi' })).status).toBe(404);
    const dis = await r.post(`/v1/payer/statements/${stB}/dispute`).set(bearer(tokB)).set(idem()).send({ reason: 'Sai tiền phòng' });
    expect([dis.status, dis.body.statement.status]).toEqual([200, 'DISPUTED']);
    // bảng chi trả KS qua API
    const hl = await r.get('/v1/admin/hotel-payouts?period=2026-03').set(bearer(readTok));
    expect(hl.body.items).toHaveLength(2);
    expect((await r.post(`/v1/admin/hotel-payouts/${hl.body.items[0].id}/lock`).set(bearer(manageTok)).set(idem()).send()).status).toBe(403);
    expect((await r.post(`/v1/admin/hotel-payouts/${hl.body.items.find((p: any) => p.hotelId === H2).id}/lock`).set(bearer(financeTok)).set(idem()).send()).status).toBe(200);
    expect((await r.get(`/v1/admin/hotel-payouts/${hl.body.items[0].id}`).set(bearer(readTok))).body.lines.length).toBeGreaterThan(0);
  });
});
