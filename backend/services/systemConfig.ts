import { CONFIG_KEYS, type ConfigKey } from '../config/configKeys';
import { db, type Db } from '../database/pg';

type Value<K extends ConfigKey> = (typeof CONFIG_KEYS)[K]['default'];

// Phiên bản hiện hành = phiên bản có effective_from lớn nhất ≤ at. Chưa có -> mặc định (version 0).
// shortcut: đọc DB mỗi lần gọi, chưa cache; thêm cache ngắn hạn khi tải đòi hỏi.
export async function getConfig<K extends ConfigKey>(key: K, at: Date = new Date(), tx: Db = db): Promise<{ version: number; value: Value<K> }> {
  const { rows } = await tx.query<{ version: number; value: unknown }>(
    'SELECT version, value FROM system_configs WHERE key = $1 AND effective_from <= $2 ORDER BY effective_from DESC, version DESC LIMIT 1',
    [key, at],
  );
  const doc = rows[0];
  return doc ? { version: doc.version, value: doc.value as Value<K> } : { version: 0, value: CONFIG_KEYS[key].default as Value<K> };
}
