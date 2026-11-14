import { createHash, randomBytes } from 'node:crypto';
import { db } from '../../database/pg';
import { AppError } from '../../lib/errors';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Cấp khóa mới: khóa thô CHỈ trả ở đây một lần, DB chỉ giữ hash. */
export async function issuePayerKey(payerId: string, name: string, createdBy?: string): Promise<{ id: string; key: string }> {
  const key = `pk_${randomBytes(32).toString('base64url')}`;
  const row = (await db.query<{ id: string }>('INSERT INTO payer_api_keys (payer_id, name, key_prefix, key_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [payerId, name, key.slice(0, 10), sha256(key), createdBy ?? null])).rows[0]!;
  return { id: row.id, key };
}

export const revokePayerKey = async (id: string): Promise<void> => void (await db.query('UPDATE payer_api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]));

/** Khóa thô -> { keyId, payerId }. Sai/thu hồi -> 401; đơn vị bị tạm ngưng -> 403. Ghi last_used_at. */
export async function resolvePayerKey(raw: string | undefined): Promise<{ keyId: string; payerId: string }> {
  if (!raw || raw.length > 200) throw new AppError(401, 'INVALID_API_KEY', 'Thiếu hoặc sai khóa API');
  const k = (
    await db.query<{ id: string; payerId: string; status: string }>(
      'SELECT k.id, k.payer_id, p.status FROM payer_api_keys k JOIN payers p ON p.id = k.payer_id WHERE k.key_hash = $1 AND k.revoked_at IS NULL',
      [sha256(raw)],
    )
  ).rows[0];
  if (!k) throw new AppError(401, 'INVALID_API_KEY', 'Thiếu hoặc sai khóa API');
  if (k.status !== 'ACTIVE') throw new AppError(403, 'PAYER_SUSPENDED', 'Đơn vị chi trả đang bị tạm ngưng');
  await db.query('UPDATE payer_api_keys SET last_used_at = now() WHERE id = $1', [k.id]);
  return { keyId: k.id, payerId: k.payerId };
}
