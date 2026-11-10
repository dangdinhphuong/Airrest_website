import { ensureIndexes } from '../db/indexes';
import { closeMongo, connectMongo } from '../db/mongo';

(async () => {
  await connectMongo();
  await ensureIndexes();
  console.log('Đã tạo/cập nhật index.');
  await closeMongo();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
