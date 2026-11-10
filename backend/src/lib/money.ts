import { Long } from 'mongodb';
import { CONFIG_KEYS } from '../config/configKeys';

// Tiền VND luôn là số nguyên. Lưu NumberLong (Long); đọc lại driver trả number.
export const vnd = (n: number): Long => {
  if (!Number.isSafeInteger(n)) throw new Error(`Số tiền không hợp lệ: ${n}`);
  return Long.fromNumber(n);
};

// Long (từ vnd() hoặc đọc DB không promote) -> number để JSON trả đúng số thay vì {low, high}.
export const toNum = (m: number | Long): number => (typeof m === 'number' ? m : m.toNumber());

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

// BR-BKG-01: phí dịch vụ = % × (phòng + xe), làm tròn 1.000 đ, tối thiểu 10.000 đ.
// Tham số lấy từ system_configs `pricing.serviceFee` (mặc định P-07); gọi không tham số = mặc định.
export function serviceFee(subtotalVnd: number, p: { bps: number; minVnd: number; roundToVnd: number } = CONFIG_KEYS['pricing.serviceFee'].default): number {
  const raw = roundTo((subtotalVnd * p.bps) / 10_000, p.roundToVnd);
  return Math.max(raw, p.minVnd);
}
