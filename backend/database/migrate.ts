import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env';
import { db, withTransaction } from './pg';

// Migration SQL thuần: database/migrations/NNN_ten.sql, chạy theo thứ tự tên, mỗi file một transaction, ghi vết ở schema_migrations.
export async function runMigrations(): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = join(__dirname, 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    await withTransaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    });
    applied.push(f);
  }
  return applied;
}

// CHỈ cho test: xóa sạch schema public rồi chạy lại migration. Từ chối nếu không phải NODE_ENV=test hoặc DB không ở máy local,
// để không bao giờ xóa nhầm database online (Supabase).
export async function resetDatabaseForTest(): Promise<void> {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(env.DATABASE_URL);
  if (env.NODE_ENV !== 'test' || !local) throw new Error('resetDatabaseForTest chỉ chạy với NODE_ENV=test và DB local');
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations();
}
