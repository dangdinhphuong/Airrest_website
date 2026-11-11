import { randomInt } from 'node:crypto';

// Crockford base32 bỏ I, L, O, U để tránh nhầm khi đọc qua điện thoại.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateBookingCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `AR-${s}`;
}
