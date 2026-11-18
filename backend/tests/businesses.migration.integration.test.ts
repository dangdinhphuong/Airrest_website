import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureBusinesses } from '../database/backfillBusinesses';
import { runMigrations } from '../database/migrate';
import { closeDb, db, freshDb, mkAccount, mkHotel, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const dir = join(__dirname, '..', 'database', 'migrations');

run('migration 030: businesses (từ DB rỗng và lên trên dữ liệu cũ)', () => {
  beforeAll(async () => {
    await freshDb({ roles: true }); // áp mọi migration lên DB rỗng
  });
  afterAll(async () => closeDb());

  it('DB rỗng: có bảng, cột, và không sinh dữ liệu', async () => {
    expect(await one('SELECT count(*)::int AS n FROM businesses')).toMatchObject({ n: 0 });
    for (const [t, c] of [['hotels', 'business_id'], ['accounts', 'business_id'], ['accounts', 'phone']]) {
      expect(await one('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [t, c])).toBeTruthy();
    }
    await expect(db.query("INSERT INTO businesses (name, status) VALUES ('x','LA')")).rejects.toMatchObject({ code: '23514' });
  });

  it('mã số thuế chỉ duy nhất cho hồ sơ còn hiệu lực (REJECTED nộp lại được)', async () => {
    await db.query("INSERT INTO businesses (name, tax_code, status) VALUES ('A','MST1','PENDING_APPROVAL')");
    await expect(db.query("INSERT INTO businesses (name, tax_code) VALUES ('B','mst1')")).rejects.toMatchObject({ code: '23505' });
    await db.query("UPDATE businesses SET status = 'REJECTED' WHERE tax_code = 'MST1'");
    await expect(db.query("INSERT INTO businesses (name, tax_code) VALUES ('B','mst1')")).resolves.toBeTruthy();
  });

  it('lên trên dữ liệu cũ: áp migration <030, chèn dữ liệu chưa có business, rồi áp 030 -> backfill đúng, idempotent, không mất dữ liệu', async () => {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await db.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql') && x < '030').sort()) {
      await db.query(await readFile(join(dir, f), 'utf8'));
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    }
    // Dữ liệu "trước 030": chủ + 1 khách sạn, chủ + 1 khách sạn có nhân viên, khách sạn không chủ có contact.
    const insHotel = async (code: string, name: string, owner?: string, contact = '{"phone":"0243111111"}') => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO hotels (id, code, name, status, owner_account_id, location, airports, amenities, policy, approval, rating, contact)
         VALUES ($1,$2,$3,'ACTIVE',$4,'{"type":"Point","coordinates":[1,2]}','[]','{}','{"cancellationTemplate":"FLEXIBLE","cleaningBufferMin":0}','{"manual":false}','{"avg":0,"count":0}',$5::jsonb)`,
        [id, code, name, owner ?? null, contact],
      );
      return id;
    };
    const ownerA = await mkAccount({ type: 'HOTEL', email: 'chua@old.vn', roleIds: [] });
    const ownerB = await mkAccount({ type: 'HOTEL', email: 'chub@old.vn', roleIds: [], status: 'INVITED' });
    const hA = await insHotel('OLD-A', 'KS Cũ A', ownerA);
    const hB = await insHotel('OLD-B', 'KS Cũ B', ownerB);
    const hC = await insHotel('OLD-C', 'KS Cũ C (không chủ)', undefined, '{"phone":"0243222222","email":"c@old.vn"}');
    await db.query('UPDATE accounts SET hotel_id = $2, is_owner = true WHERE id = $1', [ownerA, hA]);
    await db.query('UPDATE accounts SET hotel_id = $2, is_owner = true WHERE id = $1', [ownerB, hB]);
    const staff = await mkAccount({ type: 'HOTEL', email: 'nv@old.vn', roleIds: [], hotelId: hA });
    const pwBefore = (await one<{ passwordHash: string }>('SELECT password_hash FROM accounts WHERE id = $1', [ownerA]))!.passwordHash;

    expect(await runMigrations()).toEqual(['030_businesses.sql', '031_account_extras.sql', '032_sepay.sql', '033_account_hotels.sql', '034_pause_sales.sql', '035_notifications.sql']); // 030 + các migration thêm sau

    const b = async (id: string) => one('SELECT * FROM businesses WHERE id = $1', [id]);
    expect(await b(ownerA)).toMatchObject({ name: 'KS Cũ A', email: 'chua@old.vn', status: 'ACTIVE', phone: '0243111111' });
    expect(await b(ownerB)).toMatchObject({ email: 'chub@old.vn', status: 'ACTIVE' });
    expect(await b(hC)).toMatchObject({ name: 'KS Cũ C (không chủ)', email: 'c@old.vn', phone: '0243222222' });
    expect(await one('SELECT business_id FROM hotels WHERE id = $1', [hA])).toMatchObject({ businessId: ownerA });
    expect(await one('SELECT business_id FROM hotels WHERE id = $1', [hB])).toMatchObject({ businessId: ownerB });
    expect(await one('SELECT business_id FROM hotels WHERE id = $1', [hC])).toMatchObject({ businessId: hC });
    expect(await one('SELECT business_id, status, hotel_id, password_hash FROM accounts WHERE id = $1', [ownerA])).toMatchObject({ businessId: ownerA, status: 'ACTIVE', hotelId: hA, passwordHash: pwBefore });
    expect(await one('SELECT status FROM accounts WHERE id = $1', [ownerB])).toMatchObject({ status: 'INVITED' }); // trạng thái tài khoản giữ nguyên
    expect((await one<{ businessId?: string }>('SELECT business_id FROM accounts WHERE id = $1', [staff]))!.businessId).toBeUndefined(); // nhân viên không có business
    expect(await one('SELECT count(*)::int AS n FROM businesses')).toMatchObject({ n: 3 });
    expect(await one('SELECT count(*)::int AS n FROM hotels WHERE business_id IS NULL')).toMatchObject({ n: 0 });

    // Chạy lại backfill (seed gọi lại) và migration lần hai: không tạo trùng.
    await ensureBusinesses();
    await ensureBusinesses();
    expect(await runMigrations()).toEqual([]);
    expect(await one('SELECT count(*)::int AS n FROM businesses')).toMatchObject({ n: 3 });

    // Khách sạn mới thêm sau migration (chưa có business) được seed gom về business.
    const hD = await insHotel('OLD-D', 'KS Mới D');
    await ensureBusinesses();
    expect(await one('SELECT business_id FROM hotels WHERE id = $1', [hD])).toMatchObject({ businessId: hD });
    expect(await one('SELECT count(*)::int AS n FROM businesses')).toMatchObject({ n: 4 });
    void mkHotel;
  });
});
