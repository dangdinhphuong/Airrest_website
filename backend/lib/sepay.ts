import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from './errors';

// Cổng SePay (https://developer.sepay.vn/vi/cong-thanh-toan). Khách thanh toán trên trang của SePay:
//  1) Airrest dựng form POST tới SEPAY_CHECKOUT_URL kèm chữ ký; trình duyệt khách gửi form (trang /api/v1/payments/sepay/checkout/:id tự submit).
//  2) SePay gọi IPN (POST JSON) khi có giao dịch; header X-Secret-Key phải khớp SEPAY_IPN_SECRET.
const live = env.SEPAY_MODE === 'live';

// Chữ ký form theo SDK chính thức sepay-pg-node: nối "k=v" bằng dấu phẩy theo THỨ TỰ TRƯỜNG của object/form (chỉ các trường trong danh sách dưới, bỏ undefined/rỗng),
// HMAC-SHA256(secret) -> base64. Thứ tự trong form phải trùng thứ tự đã ký.
const SIGNED = new Set(['merchant', 'operation', 'payment_method', 'order_invoice_number', 'order_amount', 'currency', 'order_description', 'customer_id', 'success_url', 'error_url', 'cancel_url']);
export const signSepay = (fields: Record<string, string | undefined>, secret = env.SEPAY_SECRET_KEY ?? ''): string =>
  createHmac('sha256', secret)
    .update(Object.keys(fields).filter((k) => SIGNED.has(k) && fields[k] !== undefined && fields[k] !== '').map((k) => `${k}=${fields[k]}`).join(','))
    .digest('base64');

export interface SepayCheckoutInput { invoice: string; amount: number; description: string }

// Các trường form (đã có signature), thứ tự như SDK: operation, payment_method, order_invoice_number, order_amount, currency, order_description,
// success_url, error_url, cancel_url, rồi merchant (SDK thêm merchant sau cùng), signature cuối.
export function buildCheckoutFields(i: SepayCheckoutInput): Record<string, string> {
  const ret = (status: string) => `${env.SEPAY_RETURN_URL}${env.SEPAY_RETURN_URL.includes('?') ? '&' : '?'}gateway=sepay&orderId=${encodeURIComponent(i.invoice)}&status=${status}`;
  const f: Record<string, string> = {
    operation: 'PURCHASE',
    payment_method: env.SEPAY_PAYMENT_METHOD,
    order_invoice_number: i.invoice,
    order_amount: String(Math.round(i.amount)),
    currency: 'VND',
    order_description: i.description,
    success_url: ret('success'),
    error_url: ret('error'),
    cancel_url: ret('cancel'),
    merchant: env.SEPAY_MERCHANT_ID ?? '',
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
  live ? `${sepayApiOrigin()}/api/v1/payments/sepay/checkout/${paymentId}` : `${env.SEPAY_RETURN_URL}?mock=1&gateway=sepay&orderId=${encodeURIComponent(invoice)}`;

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

// ---- API tra cứu đơn (nguồn sự thật dự phòng khi IPN không tới được, ví dụ chạy trên máy/localhost) ----
// Sandbox/production suy ra từ SEPAY_CHECKOUT_URL; xác thực Basic merchant_id:secret_key (docs: developer.sepay.vn/vi/cong-thanh-toan/API/don-hang/chi-tiet-don-hang).
const apiBase = () => (new URL(env.SEPAY_CHECKOUT_URL).host.includes('sandbox') ? 'https://pgapi-sandbox.sepay.vn' : 'https://pgapi.sepay.vn');
export interface SepayOrder { status: string; amountVnd: number; transactionId?: string }

// Đối tượng (không phải hàm rời) để test thay thế được bằng vi.spyOn. Trả null khi chưa có đơn (404) hoặc chế độ mock (không gọi mạng).
export const sepayApi = {
  async orderDetail(invoice: string): Promise<SepayOrder | null> {
    if (!live) return null;
    const auth = Buffer.from(`${env.SEPAY_MERCHANT_ID}:${env.SEPAY_SECRET_KEY}`).toString('base64');
    const res = await fetch(`${apiBase()}/v1/order/detail/${encodeURIComponent(invoice)}`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new AppError(502, 'SEPAY_BAD_RESPONSE', `SePay trả HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { order_status?: string; order_amount?: string | number; transactions?: Array<{ id?: string; transaction_status?: string }> } };
    const d = body.data;
    if (!d?.order_status) return null;
    return { status: d.order_status, amountVnd: Math.round(Number(d.order_amount)), transactionId: d.transactions?.find((t) => t.transaction_status === 'APPROVED')?.id ?? d.transactions?.[0]?.id };
  },
};

export interface SepayRefundResult { ok: boolean; code: string; message: string; transId?: number }
// SePay (cổng thanh toán) KHÔNG có API hoàn tiền cho chuyển khoản QR/thẻ trong tích hợp này.
// mock (dev/test): giả lập hoàn thành công để các luồng hoàn chạy được; live: code 'MANUAL' -> lệnh hoàn chuyển thẳng MANUAL_REQUIRED, kế toán hoàn tay rồi bấm "đánh dấu đã hoàn".
export const sepayRefund = {
  async refund(_p: { requestId: string; orderId: string; amount: number }): Promise<SepayRefundResult> {
    if (!live) return { ok: true, code: '0', message: 'mock', transId: Date.now() };
    return { ok: false, code: 'MANUAL', message: 'SePay không có API hoàn tiền: hoàn thủ công' };
  },
};
