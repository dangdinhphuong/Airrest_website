import { MongoClient, type ClientSession, type Db } from 'mongodb';
import { env } from '../config/env';
import { logger } from '../lib/logger';

let client: MongoClient | undefined;

export async function connectMongo(): Promise<Db> {
  client = new MongoClient(env.MONGO_URI, { maxPoolSize: 50, retryWrites: true });
  await client.connect();
  await db().command({ ping: 1 });
  logger.info({ db: env.MONGO_DB }, 'Đã kết nối MongoDB');
  return db();
}

export function db(): Db {
  if (!client) throw new Error('MongoDB chưa kết nối (gọi connectMongo() trước)');
  return client.db(env.MONGO_DB);
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = undefined;
}

// Transaction chuẩn của dự án (thiết kế Mongo mục 6): snapshot + majority,
// driver tự chạy lại khi gặp lỗi tạm thời (WriteConflict khi hai khách tranh phòng cuối).
// Callback phải dùng `session` cho MỌI thao tác DB bên trong và không được có tác dụng phụ ngoài DB.
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  if (!client) throw new Error('MongoDB chưa kết nối');
  const session = client.startSession();
  try {
    return await session.withTransaction(() => fn(session), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 2000,
    });
  } finally {
    await session.endSession();
  }
}
