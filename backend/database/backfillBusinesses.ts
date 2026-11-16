import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from './pg';

// Seed chạy sau migration có thể tạo khách sạn/chủ mới chưa có business: chạy lại đúng phần backfill của migration 030 (idempotent).
export async function ensureBusinesses(): Promise<void> {
  const sql = await readFile(join(__dirname, 'migrations', '030_businesses.sql'), 'utf8');
  await db.query(sql.slice(sql.indexOf('INSERT INTO businesses')));
}
