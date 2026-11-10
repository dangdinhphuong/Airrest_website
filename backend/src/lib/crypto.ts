import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';

// Mã hóa trường nhạy cảm (tài khoản nhận tiền...) bằng AES-256-GCM ở tầng ứng dụng. Khóa = sha256(DATA_ENC_KEY).
// Định dạng lưu: base64(iv(12) | tag(16) | ciphertext).
// shortcut: một khóa duy nhất, chưa có xoay khóa; nâng lên CSFLE/KMS (thiết kế Mongo mục 8) trước khi lên production.
const key = () => createHash('sha256').update(env.DATA_ENC_KEY).digest();

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

export function decryptJson<T = unknown>(blob: string): T {
  const raw = Buffer.from(blob, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')) as T;
}
