import { Router } from 'express';
import { z } from 'zod';
import { CONFIG_KEYS, isConfigKey, type ConfigKey } from '../../../config/configKeys';
import { PERM } from '../../../config/permissions';
import { db, json, withTransaction } from '../../../database/pg';
import type { SystemConfigDoc } from '../../../database/types';
import { actorOf, writeAudit } from '../../../services/audit';
import { AppError, isDuplicateKey } from '../../../lib/errors';
import { getConfig } from '../../../services/systemConfig';
import { limitQuery } from '../../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// FR-ADM-12: cấu hình hệ thống có phiên bản. Phiên bản chỉ thêm, không sửa; hiệu lực từ `effectiveFrom`.
// Đơn đã tạo giữ nguyên tham số tại thời điểm đặt (đơn lưu pricing.params.configVersions).
export const configsRouter = Router();

const keyParams = z.object({ key: z.string().min(1).max(60) });
const putBody = z.object({
  value: z.record(z.string(), z.unknown()),
  effectiveFrom: z.coerce.date().optional(),
  reason: z.string().trim().min(3).max(500),
});
const versionsQuery = z.object({ limit: limitQuery });

const knownKey = (key: string): ConfigKey => {
  if (!isConfigKey(key)) throw new AppError(404, 'CONFIG_KEY_UNKNOWN', `Không có tham số cấu hình "${key}"`);
  return key;
};

// Hiện hành + phiên bản đã lên lịch (effectiveFrom ở tương lai) của mọi khóa.
configsRouter.get('/configs', requirePermission(PERM.ADMIN_CONFIG_READ), async (_req, res) => {
  const now = new Date();
  const scheduled = (await db.query<SystemConfigDoc>('SELECT * FROM system_configs WHERE effective_from > $1 ORDER BY effective_from', [now])).rows;
  const items = await Promise.all(
    (Object.keys(CONFIG_KEYS) as ConfigKey[]).map(async (key) => {
      const cur = await getConfig(key, now);
      return {
        key,
        version: cur.version,
        value: cur.value,
        isDefault: cur.version === 0,
        writePerm: CONFIG_KEYS[key].writePerm,
        scheduled: scheduled.filter((s) => s.key === key).map((s) => ({ version: s.version, value: s.value, effectiveFrom: s.effectiveFrom })),
      };
    }),
  );
  res.json({ items });
});

configsRouter.get('/configs/:key/versions', requirePermission(PERM.ADMIN_CONFIG_READ), validate({ params: keyParams, query: versionsQuery }), async (req, res) => {
  const key = knownKey((req.valid.params as z.infer<typeof keyParams>).key);
  const { limit } = req.valid.query as z.infer<typeof versionsQuery>;
  const now = new Date();
  const items = (await db.query<SystemConfigDoc>('SELECT * FROM system_configs WHERE key = $1 ORDER BY version DESC LIMIT $2', [key, limit])).rows;
  const current = await getConfig(key, now);
  res.json({
    items: items.map((v) => ({
      version: v.version,
      value: v.value,
      effectiveFrom: v.effectiveFrom,
      status: v.effectiveFrom > now ? 'SCHEDULED' : v.version === current.version ? 'ACTIVE' : 'RETIRED',
      changedBy: v.changedBy,
      reason: v.reason,
      createdAt: v.createdAt,
    })),
  });
});

// Mỗi khóa có quyền ghi riêng (BA §10 "Ai sửa"): Quản trị HT / Điều phối / Kế toán.
configsRouter.put('/configs/:key', validate({ params: keyParams, body: putBody }), async (req, res) => {
  const key = knownKey((req.valid.params as z.infer<typeof keyParams>).key);
  const body = req.valid.body as z.infer<typeof putBody>;
  const need = CONFIG_KEYS[key].writePerm;
  if (req.auth?.kind !== 'ACCOUNT' || !req.auth.permissions.includes(need)) {
    throw new AppError(403, 'FORBIDDEN', 'Không đủ quyền thực hiện thao tác này');
  }

  const parsed = CONFIG_KEYS[key].schema.safeParse(body.value);
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Giá trị cấu hình không hợp lệ', parsed.error.issues);

  const now = new Date();
  // Không cho đặt hiệu lực trong quá khứ: sẽ làm thay đổi lịch sử giá của đơn đã tạo.
  const effectiveFrom = body.effectiveFrom ?? now;
  if (effectiveFrom.getTime() < now.getTime() - 60_000) {
    throw new AppError(422, 'EFFECTIVE_FROM_IN_PAST', 'Thời điểm hiệu lực không được ở quá khứ');
  }

  try {
    const doc = await withTransaction(async (tx) => {
      const last = (await tx.query<{ version: number }>('SELECT max(version) AS version FROM system_configs WHERE key = $1', [key])).rows[0];
      const before = await getConfig(key, now, tx);
      const created = { version: (last?.version ?? 0) + 1, value: parsed.data, effectiveFrom };
      // UNIQUE (key, version): hai Admin sửa cùng lúc thì người đến sau vi phạm -> CONFIG_CONFLICT bên dưới.
      await tx.query('INSERT INTO system_configs (key, version, value, effective_from, changed_by, reason, created_at) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7)', [
        key, created.version, json(created.value), effectiveFrom, json(actorOf(req.auth)), body.reason, now,
      ]);
      await writeAudit(
        { actor: actorOf(req.auth), action: 'CONFIG.UPDATE', entity: { type: 'config', id: key }, before: { version: before.version, value: before.value }, after: { version: created.version, value: created.value, effectiveFrom }, reasonNote: body.reason, requestId: String(req.id) },
        tx,
      );
      return created;
    });
    res.status(201).json({ key, version: doc.version, value: doc.value, effectiveFrom: doc.effectiveFrom, status: doc.effectiveFrom > now ? 'SCHEDULED' : 'ACTIVE' });
  } catch (e) {
    // Hai Admin sửa cùng lúc: người đến sau trùng số phiên bản -> báo tải lại.
    if (isDuplicateKey(e)) throw new AppError(409, 'CONFIG_CONFLICT', 'Cấu hình vừa được người khác thay đổi, hãy tải lại rồi thử lại');
    throw e;
  }
});
