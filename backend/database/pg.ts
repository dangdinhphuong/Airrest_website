import pg from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

// bigint (tiền VND, đếm) và numeric -> number. VND luôn < 2^53 nên an toàn; mặc định pg trả string.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

/** Giao diện truy vấn dùng chung cho pool và transaction: hàng trả về đã đổi snake_case -> camelCase, bỏ giá trị null. */
export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
// null -> bỏ khóa (giữ hình dạng "trường tùy chọn" như tài liệu cũ: payoutAccount, expiresAt...).
const mapRow = (r: Record<string, unknown>) => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (v !== null) o[camel(k)] = v;
  return o;
};
const wrap = (c: pg.Pool | pg.PoolClient): Db => ({
  async query(text, params) {
    const raw = await c.query(text, params as never);
    const res = Array.isArray(raw) ? raw[raw.length - 1]! : raw; // câu lệnh nhiều phần (migration): lấy kết quả cuối
    return { rows: res.rows.map(mapRow) as never, rowCount: res.rowCount ?? 0 };
  },
});

let pool: pg.Pool | undefined;
let pooled: Db | undefined;

// Supabase/Cloud SQL bắt buộc TLS; máy local thì không.
// shortcut: bật TLS nhưng không ghim CA (rejectUnauthorized=false); khi lên production hãy nạp CA của Supabase.
const ssl = () => {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(env.DATABASE_URL);
  const want = env.DATABASE_SSL === 'auto' ? !local : env.DATABASE_SSL === 'true';
  return want ? { rejectUnauthorized: false } : undefined;
};

export async function connectDb(): Promise<Db> {
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX, ssl: ssl() });
  pool.on('error', (err) => logger.error({ err }, 'Lỗi kết nối nhàn rỗi của pool Postgres'));
  pooled = wrap(pool);
  await pool.query('SELECT 1');
  logger.info('Đã kết nối PostgreSQL');
  return pooled;
}

export const db: Db = {
  query: (text, params) => {
    if (!pooled) throw new Error('PostgreSQL chưa kết nối (gọi connectDb() trước)');
    return pooled.query(text, params);
  },
};

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  pooled = undefined;
}

const RETRYABLE = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected

/**
 * Transaction chuẩn của dự án: READ COMMITTED + khóa hàng tường minh (SELECT ... FOR UPDATE) ở chỗ cần tuần tự hóa.
 * Tự chạy lại tối đa 3 lần khi deadlock/serialization failure, giống driver Mongo trước đây.
 * Callback phải dùng `tx` cho MỌI thao tác DB và không được có tác dụng phụ ngoài DB (nó có thể chạy lại).
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  if (!pool) throw new Error('PostgreSQL chưa kết nối');
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(wrap(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (attempt < 3 && RETRYABLE.has((e as { code?: string }).code ?? '')) continue;
      throw e;
    } finally {
      client.release();
    }
  }
}

export const json = (v: unknown): string => JSON.stringify(v);
export const jsonOrNull = (v: unknown): string | null => (v === undefined ? null : JSON.stringify(v));
