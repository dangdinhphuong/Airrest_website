import type { ClientSession } from 'mongodb';
import { CONFIG_KEYS, type ConfigKey } from '../config/configKeys';
import { col } from '../db/collections';

type Value<K extends ConfigKey> = (typeof CONFIG_KEYS)[K]['default'];

// Phiên bản hiện hành = phiên bản có effectiveFrom lớn nhất ≤ at (docs/mongodb 5.10). Chưa có -> mặc định (version 0).
// shortcut: đọc DB mỗi lần gọi, chưa cache; thêm cache + làm mới bằng Change Stream khi tải đòi hỏi.
export async function getConfig<K extends ConfigKey>(
  key: K,
  at: Date = new Date(),
  session?: ClientSession,
): Promise<{ version: number; value: Value<K> }> {
  const doc = await col.systemConfigs().findOne({ key, effectiveFrom: { $lte: at } }, { sort: { effectiveFrom: -1, version: -1 }, session });
  return doc ? { version: doc.version, value: doc.value as Value<K> } : { version: 0, value: CONFIG_KEYS[key].default as Value<K> };
}
