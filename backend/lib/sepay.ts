import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

// Cổng SePay (https://developer.sepay.vn/vi/cong-thanh-toan). Khách thanh toán trên trang của SePay:
//  1) Airrest dựng form POST tới SEPAY_CHECKOUT_URL kèm chữ ký; trình duyệt khách gửi form (trang /v1/payments/sepay/checkout/:id tự submit).
//  2) SePay gọi IPN (POST JSON) khi có giao dịch; header X-Secret-Key phải khớp SEPAY_IPN_SECRET.
const live = env.SEPAY_MODE === 'live';

// Chữ ký form: chỉ các trường sau, đúng thứ tự, bỏ trường rỗng/"0"; nối "k=v" bằng dấu phẩy; HMAC-SHA256(secret) -> base64.
const SIGNED = ['order_amount', 'merchant', 'currency', 'operation', 'order_description', 'order_invoice_number', 'customer_id', 'payment_method', 'success_url', 'error_url', 'cancel_url'] as const;
export const signSepay = (fields: Record<string, string | undefined>, secret = env.SEPAY_SECRET_KEY ?? ''): string =>
  createHmac('sha256', secret)
    .update(SIGNED.filter((k) => fields[k] !== undefined && fields[k] !== '' && fields[k] !== '0').map((k) => `${k}=${fields[k]}`).join(','))
    .digest('base64');

export interface SepayCheckoutInput { invoice: string; amount: number; description: string }

// Các trường form (đã có signature). Thứ tự khóa giữ như form mẫu của SePay.
export function buildCheckoutFields(i: SepayCheckoutInput): Record<string, string> {
  const ret = (status: string) => `${env.SEPAY_RETURN_URL}${env.SEPAY_RETURN_URL.includes('?') ? '&' : '?'}gateway=sepay&orderId=${encodeURIComponent(i.invoice)}&status=${status}`;
  const f: Record<string, string> = {
    merchant: env.SEPAY_MERCHANT_ID ?? '',
    currency: 'VND',
    order_amount: String(Math.round(i.amount)),
    operation: 'PURCHASE',
    order_description: i.description,
    order_invoice_number: i.invoice,
    success_url: ret('success'),
    error_url: ret('error'),
    cancel_url: ret('cancel'),
  };
  return { ...f, signature: signSepay(f) };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Trang HTML tự gửi form sang SePay. CSP riêng (helmet mặc định chặn form-action/inline script): chỉ cho script có nonce và form tới đúng host checkout.
export function checkoutPage(fields: Record<string, string>): { html: string; csp: string } {
  const nonce = randomBytes(16).toString('base64');
  const action = env.SEPAY_CHECKOUT_URL;
  const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đang chuyển tới SePay…</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1rem"><p>Đang chuyển tới cổng thanh toán SePay…</p><form id="f" method="POST" action="${esc(action)}">${inputs}<noscript><button type="submit">Tiếp tục tới SePay</button></noscript></form><script nonce="${nonce}">document.getElementById('f').submit()</script></body></html>`;
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${new URL(action).origin}; base-uri 'none'`;
  return { html, csp };
}

// Xác thực IPN: so khớp header X-Secret-Key với SEPAY_IPN_SECRET (so sánh thời gian hằng số). Live mà thiếu khóa cấu hình -> luôn từ chối.
export function sepayIpnAuthorized(header: string | undefined): boolean {
  if (!live) return true; // mock: cổng giả lập gọi thẳng vào handler; env.ts cấm mock ở production
  const want = env.SEPAY_IPN_SECRET;
  if (!want || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// order_invoice_number phải duy nhất mỗi lần tạo giao dịch: [A-Za-z0-9-].
export const newSepayOrder = (prefix: string) => {
  const id = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { orderId: id, requestId: id };
};

// Origin API công khai (nơi phục vụ trang checkout) lấy từ SEPAY_IPN_URL.
export const sepayApiOrigin = () => new URL(env.SEPAY_IPN_URL).origin;
export const sepayPayUrl = (paymentId: string, invoice: string) =>
  live ? `${sepayApiOrigin()}/v1/payments/sepay/checkout/${paymentId}` : `${env.SEPAY_RETURN_URL}?mock=1&gateway=sepay&orderId=${encodeURIComponent(invoice)}`;

// Dùng cho cổng giả lập: dựng đúng gói IPN mà SePay gửi (xem developer.sepay.vn/vi/cong-thanh-toan/IPN).
export function buildSepayIpn(o: { invoice: string; amount: number; success: boolean; transactionId: string }) {
  return {
    timestamp: Math.floor(Date.now() / 1000),
    notification_type: o.success ? 'ORDER_PAID' : 'TRANSACTION_VOID',
    order: { id: `mock-${o.invoice}`, order_id: `mock-${o.invoice}`, order_status: o.success ? 'CAPTURED' : 'CANCELLED', order_currency: 'VND', order_amount: `${o.amount}.00`, order_invoice_number: o.invoice, custom_data: [], order_description: 'Airrest' },
    transaction: { id: o.transactionId, payment_method: 'BANK_TRANSFER', transaction_id: o.transactionId, transaction_type: 'PAYMENT', transaction_date: new Date().toISOString().slice(0, 19).replace('T', ' '), transaction_status: o.success ? 'APPROVED' : 'DECLINED', transaction_amount: `${o.amount}.00`, transaction_currency: 'VND' },
    customer: {},
  };
}
