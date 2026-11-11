import { runMigrations } from '../migrate';
import { closeDb, connectDb } from '../pg';

(async () => {
  await connectDb();
  const applied = await runMigrations();
  console.log(applied.length ? `Đã áp: ${applied.join(', ')}` : 'Schema đã mới nhất.');
  await closeDb();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
