import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { delayPaxInput } from '@airrest/validation';
import { closeDb, db, freshDb } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

describe('delayPaxInput', () => {
  it('suy loại hành khách từ tuổi và chuẩn hóa PNR', () => {
    const p = (age: number) => delayPaxInput.parse({ pnr: 'abc123', fullName: 'Nguyen A', age });
    expect(p(1)).toMatchObject({ category: 'INFANT', pnr: 'ABC123' });
    expect([p(2).category, p(11).category, p(12).category]).toEqual(['CHILD', 'CHILD', 'ADULT']);
  });
});

run('migration 017: đơn vị chi trả + khách delay', () => {
  beforeAll(async () => freshDb({ roles: true }));
  afterAll(async () => closeDb());

  it('payer_staff được seed; tài khoản PAYER bắt buộc có payer_id', async () => {
    expect((await db.query("SELECT 1 FROM roles WHERE key = 'payer_staff'")).rowCount).toBe(1);
    const ins = (payerId: string | null) =>
      db.query("INSERT INTO accounts (type, email, password_hash, full_name, status, payer_id) VALUES ('PAYER', $1, 'x', 'NV', 'ACTIVE', $2)", [`p${Math.random()}@x.vn`, payerId]);
    await expect(ins(null)).rejects.toMatchObject({ code: '23514' });
    const { rows } = await db.query<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('VNA', 'Vietnam Airlines', 'AIRLINE') RETURNING id");
    await expect(ins(rows[0]!.id)).resolves.toBeTruthy();
  });

  it('bookings chấp nhận PAYER; delay_flight_pax chặn tuổi sai loại', async () => {
    const { rows } = await db.query<{ id: string }>("SELECT id FROM payers WHERE code = 'VNA'");
    const st = await db.query<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1, 'HAN', 'Nội Bài') RETURNING id", [rows[0]!.id]);
    const fl = await db.query<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN123', 'VNA', 'HAN', now(), 'ONTIME') RETURNING id");
    const pax = (age: number, cat: string) =>
      db.query("INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, pnr, full_name, age, category) VALUES ($1,$2,$3,'ABC123','Nguyen A',$4,$5)", [rows[0]!.id, st.rows[0]!.id, fl.rows[0]!.id, age, cat]);
    await expect(pax(5, 'ADULT')).rejects.toMatchObject({ code: '23514' });
    await expect(pax(5, 'CHILD')).resolves.toBeTruthy();
    await expect(pax(5, 'CHILD')).rejects.toMatchObject({ code: '23505' }); // trùng (chuyến, PNR, họ tên)
    expect((await db.query("SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'bookings_payment_method_check'")).rows[0]!.d).toContain('PAYER');
  });
});
