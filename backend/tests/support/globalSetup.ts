import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

// Chỉ khi RUN_DB_TESTS: dùng TEST_DATABASE_URL nếu có (phải là DB local, xem resetDatabaseForTest),
// không thì bật một Postgres nhúng tạm (không cần Docker) và trỏ DATABASE_URL tới đó cho các worker test.
export default async function setup() {
  if (!process.env.RUN_DB_TESTS) return;
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'airrest-pg-'));
  const port = 54000 + Math.floor(Math.random() * 1000);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: false, onLog: () => undefined, onError: () => undefined });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('airrest_test');
  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${port}/airrest_test`;
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
