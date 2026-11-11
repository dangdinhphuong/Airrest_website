import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONFIG_KEYS } from '../config/configKeys';
import { decryptJson, encryptJson } from '../lib/crypto';
import { generateBookingCode } from '../lib/codes';
import { canBook, isActive, maxConcurrent, serviceFee, type Interval } from '@airrest/business-logic';
import { buildVnpayIpn, signVnpay, verifyVnpay, vnpDate, vnpKeys, vnpQuery } from '../lib/vnpay';
import { hashPassword, verifyPassword } from '../lib/password';
import { toE164VN } from '@airrest/utils';

const H = 3600_000;
const t = (h: number) => new Date(Date.UTC(2026, 10, 10) + h * H);
const iv = (from: number, to: number, qty = 1): Interval => ({ from: t(from), to: t(to), qty });

describe('tồn phòng (sweep-line)', () => {
  it('A(0-12) B(12-24) C(6-18): cộng tổng sẽ ra 2 nhưng thực tế tối đa 1 phòng cùng lúc', () => {
    expect(maxConcurrent([iv(0, 12), iv(12, 24)], { from: t(6), to: t(18) })).toBe(1);
  });

  it('check-out 5:30 và check-in 5:30 không xung đột (BR-BKG-02)', () => {
    expect(canBook(1, [iv(0, 5.5)], iv(5.5, 12))).toBe(true);
  });

  it('chồng lấn thật -> hết phòng', () => {
    expect(canBook(1, [iv(0, 12)], iv(11, 20))).toBe(false);
    expect(canBook(2, [iv(0, 12)], iv(11, 20))).toBe(true);
  });

  it('đếm đúng khi nhiều đơn chồng nhau cùng lúc', () => {
    expect(maxConcurrent([iv(0, 10), iv(5, 15), iv(8, 12)], { from: t(0), to: t(24) })).toBe(3);
  });

  it('chỉ HOLD chưa hết hạn mới tính', () => {
    const base = { ...iv(0, 1) };
    expect(isActive({ ...base, state: 'HOLD', holdExpiresAt: t(5) }, t(1))).toBe(true);
    expect(isActive({ ...base, state: 'HOLD', holdExpiresAt: t(1) }, t(2))).toBe(false);
    expect(isActive({ ...base, state: 'RELEASED' }, t(0))).toBe(false);
  });
});

describe('tiện ích', () => {
  it('phí dịch vụ: 2%, làm tròn 1.000, tối thiểu 10.000 (BA §4.2: 820.000 -> 16.000)', () => {
    expect(serviceFee(820_000, CONFIG_KEYS['pricing.serviceFee'].default)).toBe(16_000);
    expect(serviceFee(100_000, CONFIG_KEYS['pricing.serviceFee'].default)).toBe(10_000);
  });

  it('chuẩn hóa SĐT E.164', () => {
    expect(toE164VN('0912 345 678')).toBe('+84912345678');
    expect(toE164VN('+84912345678')).toBe('+84912345678');
    expect(toE164VN('12345')).toBeNull();
  });

  it('mã đặt phòng đúng định dạng', () => {
    expect(generateBookingCode()).toMatch(/^AR-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('mật khẩu: đúng/sai', async () => {
    const h = await hashPassword('Abc12345!');
    expect(await verifyPassword('Abc12345!', h)).toBe(true);
    expect(await verifyPassword('sai', h)).toBe(false);
  });
});

describe('cấu hình + mã hóa', () => {
  it('mặc định của mọi khóa cấu hình hợp lệ với schema của nó (BA §10)', () => {
    for (const [key, def] of Object.entries(CONFIG_KEYS)) {
      expect(def.schema.safeParse(def.default).success, key).toBe(true);
    }
  });

  it('phí dịch vụ theo tham số: 3% của 600.000 = 18.000', () => {
    expect(serviceFee(600_000, { bps: 300, minVnd: 10_000, roundToVnd: 1_000 })).toBe(18_000);
  });

  it('AES-GCM: giải mã đúng; sửa 1 byte thì lỗi; hai lần mã hóa khác nhau', () => {
    const a = encryptJson({ accountNo: '0123456789' });
    expect(decryptJson(a)).toEqual({ accountNo: '0123456789' });
    expect(a).not.toContain('0123456789');
    expect(encryptJson({ accountNo: '0123456789' })).not.toBe(a);
    const tampered = Buffer.from(a, 'base64');
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
    expect(() => decryptJson(tampered.toString('base64'))).toThrow();
  });
});

describe('VNPay: chữ ký', () => {
  it('query ký: xếp A→Z, bỏ giá trị rỗng, khoảng trắng thành "+", HMAC-SHA512 hex', () => {
    const p = { vnp_TxnRef: 'O1', vnp_Amount: 5000000, vnp_OrderInfo: 'Airrest AR 1', vnp_Empty: '' };
    expect(vnpQuery(p)).toBe('vnp_Amount=5000000&vnp_OrderInfo=Airrest+AR+1&vnp_TxnRef=O1');
    expect(signVnpay(p)).toBe(createHmac('sha512', vnpKeys.hashSecret).update('vnp_Amount=5000000&vnp_OrderInfo=Airrest+AR+1&vnp_TxnRef=O1').digest('hex'));
  });

  it('IPN: gói do mình ký thì hợp lệ; sửa số tiền hoặc chữ ký thì bị từ chối', () => {
    const ipn = buildVnpayIpn({ txnRef: 'O1', amount: 836000, transId: 1, success: true });
    expect(verifyVnpay(ipn)).toBe(true);
    expect(verifyVnpay({ ...ipn, vnp_Amount: '1000' })).toBe(false);
    expect(verifyVnpay({ ...ipn, vnp_SecureHash: 'abc' })).toBe(false);
    expect(verifyVnpay({ ...ipn, vnp_SecureHash: undefined })).toBe(false);
  });

  it('vnpDate theo giờ Việt Nam (GMT+7)', () => {
    expect(vnpDate(new Date('2026-12-01T17:30:05Z'))).toBe('20261202003005');
  });
});
