// Postgres nhúng cho dev/E2E, không cần Docker. Dữ liệu bền ở backend/.data/pg. Dừng bằng Ctrl+C.
// Dùng: npm run dev:db -w @airrest/backend  rồi đặt DATABASE_URL trong backend/.env (in ra bên dưới).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = join(import.meta.dirname, '..', '.data', 'pg');
const port = Number(process.env.DEV_DB_PORT ?? 54329);

(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: () => undefined, onError: () => undefined });
  if (!existsSync(join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  await pg.createDatabase('airrest').catch(() => undefined); // đã tồn tại thì bỏ qua
  console.log(`Postgres nhúng sẵn sàng. DATABASE_URL=postgres://postgres:postgres@localhost:${port}/airrest`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => { console.error(e); process.exit(1); });
