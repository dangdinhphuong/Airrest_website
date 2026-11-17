import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCheckoutFields, checkoutPage, signSepay } from '../lib/sepay';

const sign = (str: string, secret: string) => createHmac('sha256', secret).update(str).digest('base64');

describe('SePay: chữ ký form checkout', () => {
  it('chỉ ký các trường quy định, đúng thứ tự, bỏ trường rỗng/"0"', () => {
    const f = { merchant: 'M1', currency: 'VND', order_amount: '100000', operation: 'PURCHASE', order_description: 'Pay #1', order_invoice_number: 'INV1', customer_id: '', payment_method: '0', cancel_url: 'https://x/c', ghost: 'khong-ky' };
    expect(signSepay(f, 'k')).toBe(sign('order_amount=100000,merchant=M1,currency=VND,operation=PURCHASE,order_description=Pay #1,order_invoice_number=INV1,cancel_url=https://x/c', 'k'));
  });
  it('buildCheckoutFields: số tiền nguyên, 3 URL quay về kèm status, có signature', () => {
    const f = buildCheckoutFields({ invoice: 'AR-1-abc', amount: 450000.4, description: 'Airrest AR-1' });
    expect(f.order_amount).toBe('450000');
    expect(f.currency).toBe('VND');
    expect(f.operation).toBe('PURCHASE');
    expect(f.success_url).toMatch(/gateway=sepay&orderId=AR-1-abc&status=success$/);
    expect(f.error_url).toMatch(/status=error$/);
    expect(f.cancel_url).toMatch(/status=cancel$/);
    expect(f.signature).toBe(signSepay({ ...f }));
  });
  it('trang checkout: escape giá trị, CSP chỉ cho form tới host checkout và script có nonce', () => {
    const { html, csp } = checkoutPage({ order_description: '"><script>alert(1)</script>', signature: 'sig' });
    expect(html).not.toContain('"><script>alert(1)');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toMatch(/<form id="f" method="POST" action="https:\/\/pay\.sepay\.vn\/v1\/checkout\/init">/);
    expect(csp).toMatch(/script-src 'nonce-[^']+'/);
    expect(csp).toContain("form-action https://pay.sepay.vn");
  });
});

describe('SePay: xác thực IPN ở chế độ live', () => {
  afterEach(() => { vi.doUnmock('../config/env'); vi.resetModules(); });
  const load = async (secret: string | undefined) => {
    vi.resetModules();
    vi.doMock('../config/env', () => ({ env: { SEPAY_MODE: 'live', SEPAY_IPN_SECRET: secret, SEPAY_MERCHANT_ID: 'M', SEPAY_SECRET_KEY: 'K', SEPAY_RETURN_URL: 'http://w/payment/result', SEPAY_IPN_URL: 'http://a/v1/payments/sepay/ipn', SEPAY_CHECKOUT_URL: 'https://pay.sepay.vn/v1/checkout/init' } }));
    return import('../lib/sepay.js');
  };
  it('đúng khóa -> cho qua; sai/thiếu header -> từ chối', async () => {
    const m = await load('spsk_ipn_secret');
    expect(m.sepayIpnAuthorized('spsk_ipn_secret')).toBe(true);
    expect(m.sepayIpnAuthorized('sai')).toBe(false);
    expect(m.sepayIpnAuthorized(undefined)).toBe(false);
    expect(m.sepayPayUrl('pid', 'inv')).toBe('http://a/v1/payments/sepay/checkout/pid');
  });
  it('chưa cấu hình SEPAY_IPN_SECRET -> luôn từ chối (không nhận IPN không xác thực được)', async () => {
    const m = await load(undefined);
    expect(m.sepayIpnAuthorized('bat-ky')).toBe(false);
    expect(m.sepayIpnAuthorized(undefined)).toBe(false);
  });
});
