import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from './errors';

// Cổng VNPay 2.1.0 (https://sandbox.vnpayment.vn/apis). Chữ ký = HMAC-SHA512(hashSecret, chuỗi query xếp A→Z, giá trị URL-encode).
// mock: không gọi mạng, dùng khóa giả cục bộ; live: dùng VNPAY_TMN_CODE/VNPAY_HASH_SECRET.
const live = env.VNPAY_MODE === 'live';
export const vnpKeys = {
  tmnCode: (live && env.VNPAY_TMN_CODE) || 'MOCKTMN1',
  hashSecret: (live && env.VNPAY_HASH_SECRET) || 'mock-hash-secret-only-for-local-dev',
};

type Params = Record<string, string | number | undefined>;

const hmac = (data: string) => createHmac('sha512', vnpKeys.hashSecret).update(Buffer.from(data, 'utf-8')).digest('hex');
const enc = (v: string | number) => encodeURIComponent(String(v)).replace(/%20/g, '+'); // VNPay mã hóa khoảng trắng là "+"

/** Chuỗi query đã sắp xếp (bỏ giá trị rỗng): vừa là dữ liệu ký vừa là query của URL thanh toán. */
export const vnpQuery = (p: Params): string =>
  Object.keys(p)
    .filter((k) => p[k] !== undefined && p[k] !== '')
    .sort()
    .map((k) => `${k}=${enc(p[k]!)}`)
    .join('&');

export const signVnpay = (p: Params): string => hmac(vnpQuery(p));

/** IPN/Return: bỏ vnp_SecureHash(+Type) rồi ký lại bằng khóa của mình. */
export function verifyVnpay(query: Record<string, unknown>): boolean {
  const { vnp_SecureHash: given, vnp_SecureHashType: _t, ...rest } = query;
  if (typeof given !== 'string') return false;
  const want = signVnpay(rest as Params);
  return given.length === want.length && timingSafeEqual(Buffer.from(given.toLowerCase()), Buffer.from(want));
}

/** yyyyMMddHHmmss theo giờ Việt Nam (GMT+7), định dạng ngày của VNPay. */
export const vnpDate = (d = new Date()): string => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace(/[-T:]/g, '');

// vnp_TxnRef / vnp_RequestId: duy nhất mỗi lần gọi, chỉ chữ+số, ≤ 32 ký tự.
export const newVnpOrder = (prefix: string) => {
  const id = `${prefix.replace(/[^A-Za-z0-9]/g, '')}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 32);
  return { orderId: id, requestId: id };
};

/** Dùng cho cổng giả lập: tạo đúng gói IPN (query) mà VNPay sẽ gửi. */
export function buildVnpayIpn(o: { txnRef: string; amount: number; transId: number; success: boolean }): Record<string, string> {
  const p: Record<string, string> = {
    vnp_TmnCode: vnpKeys.tmnCode,
    vnp_Amount: String(o.amount * 100),
    vnp_BankCode: 'NCB',
    vnp_OrderInfo: 'Airrest',
    vnp_TransactionNo: String(o.transId),
    vnp_ResponseCode: o.success ? '00' : '24',
    vnp_TransactionStatus: o.success ? '00' : '02',
    vnp_TxnRef: o.txnRef,
    vnp_PayDate: vnpDate(),
  };
  return { ...p, vnp_SecureHash: signVnpay(p) };
}

export type VnpStatus = 'SUCCESS' | 'PENDING' | 'FAILED';
export interface VnpQueryResult { status: VnpStatus; message: string; transId?: number; amount?: number }
export interface VnpRefundResult { ok: boolean; code: string; message: string; transId?: number }

// shortcut: không xác thực chữ ký phản hồi querydr/refund của VNPay, và vnp_IpAddr cố định; bổ sung khi chạy live, trước production.
const IP = '127.0.0.1';

async function call(body: Record<string, string>, fields: string[]): Promise<Record<string, string>> {
  const signed = { ...body, vnp_SecureHash: hmac(fields.map((f) => body[f] ?? '').join('|')) };
  const res = await fetch(env.VNPAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signed),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    throw new AppError(502, 'VNPAY_BAD_RESPONSE', `VNPay trả dữ liệu không hợp lệ (HTTP ${res.status})`);
  }
}

// Đối tượng (không phải hàm rời) để test thay thế được bằng vi.spyOn.
export const vnpayGateway = {
  /** Tạo URL thanh toán: không gọi mạng, khách mở URL này để trả tiền. */
  create(p: { txnRef: string; amount: number; orderInfo: string; createDate: string; expireDate?: string }): { payUrl: string } {
    if (!live) return { payUrl: `${env.VNPAY_RETURN_URL}?mock=1&orderId=${p.txnRef}` };
    const q: Params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: vnpKeys.tmnCode,
      vnp_Amount: p.amount * 100, // VNPay nhân 100
      vnp_CreateDate: p.createDate,
      vnp_ExpireDate: p.expireDate,
      vnp_CurrCode: 'VND',
      vnp_IpAddr: IP,
      vnp_Locale: 'vn',
      vnp_OrderInfo: p.orderInfo,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: env.VNPAY_RETURN_URL,
      vnp_TxnRef: p.txnRef,
    };
    return { payUrl: `${env.VNPAY_URL}?${vnpQuery(q)}&vnp_SecureHash=${signVnpay(q)}` };
  },

  async query(p: { txnRef: string; requestId: string; transactionDate: string }): Promise<VnpQueryResult> {
    if (!live) return { status: 'PENDING', message: 'mock: đang chờ khách thanh toán' };
    const now = vnpDate();
    const b = {
      vnp_RequestId: p.requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: vnpKeys.tmnCode,
      vnp_TxnRef: p.txnRef,
      vnp_OrderInfo: `Query ${p.txnRef}`,
      vnp_TransactionDate: p.transactionDate,
      vnp_CreateDate: now,
      vnp_IpAddr: IP,
    };
    const r = await call(b, ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_TransactionDate', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo']);
    const message = r.vnp_Message ?? '';
    if (r.vnp_ResponseCode === '91') return { status: 'PENDING', message }; // chưa có giao dịch: khách chưa vào cổng
    if (r.vnp_ResponseCode !== '00') throw new AppError(502, 'VNPAY_QUERY_ERROR', `VNPay querydr lỗi ${r.vnp_ResponseCode}`);
    const status: VnpStatus = r.vnp_TransactionStatus === '00' ? 'SUCCESS' : r.vnp_TransactionStatus === '01' ? 'PENDING' : 'FAILED';
    return { status, message, transId: Number(r.vnp_TransactionNo) || undefined, amount: r.vnp_Amount ? Number(r.vnp_Amount) / 100 : undefined };
  },

  /** Hoàn toàn phần (TransactionType 02): số tiền hoàn luôn bằng đúng giao dịch gốc. */
  async refund(p: { requestId: string; txnRef: string; amount: number; transId: number; transactionDate: string }): Promise<VnpRefundResult> {
    if (!live) return { ok: true, code: '00', message: 'mock', transId: Date.now() };
    const b = {
      vnp_RequestId: p.requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: vnpKeys.tmnCode,
      vnp_TransactionType: '02',
      vnp_TxnRef: p.txnRef,
      vnp_Amount: String(p.amount * 100),
      vnp_OrderInfo: `Hoan tien ${p.txnRef}`,
      vnp_TransactionNo: String(p.transId || 0),
      vnp_TransactionDate: p.transactionDate,
      vnp_CreateBy: 'airrest',
      vnp_CreateDate: vnpDate(),
      vnp_IpAddr: IP,
    };
    const r = await call(b, ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TransactionType', 'vnp_TxnRef', 'vnp_Amount', 'vnp_TransactionNo', 'vnp_TransactionDate', 'vnp_CreateBy', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo']);
    const code = r.vnp_ResponseCode ?? '99';
    return { ok: code === '00', code, message: r.vnp_Message ?? '', transId: Number(r.vnp_TransactionNo) || undefined };
  },
};
