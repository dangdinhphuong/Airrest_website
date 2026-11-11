import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from './errors';

// Cổng MoMo v2 (https://developers.momo.vn). Chữ ký = HMAC-SHA256(secretKey, "k1=v1&k2=v2..."), khóa xếp A→Z.
// mock: không gọi mạng, dùng khóa sandbox công khai của MoMo; live: dùng khóa trong env, gọi MOMO_ENDPOINT.
const SANDBOX = { partnerCode: 'MOMO', accessKey: 'F8BBA842ECF85', secretKey: 'K951B6PE1waDMi640xX08PD3vg6EkVlz' };
const live = env.MOMO_MODE === 'live';
export const momoKeys = {
  partnerCode: (live && env.MOMO_PARTNER_CODE) || SANDBOX.partnerCode,
  accessKey: (live && env.MOMO_ACCESS_KEY) || SANDBOX.accessKey,
  secretKey: (live && env.MOMO_SECRET_KEY) || SANDBOX.secretKey,
};

const FIELDS = {
  create: ['accessKey', 'amount', 'extraData', 'ipnUrl', 'orderId', 'orderInfo', 'partnerCode', 'redirectUrl', 'requestId', 'requestType'],
  ipn: ['accessKey', 'amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId'],
  query: ['accessKey', 'orderId', 'partnerCode', 'requestId'],
  refund: ['accessKey', 'amount', 'description', 'orderId', 'partnerCode', 'requestId', 'transId'],
} as const;

type Params = Record<string, unknown>;
export const signMomo = (kind: keyof typeof FIELDS, p: Params): string =>
  createHmac('sha256', momoKeys.secretKey)
    .update(FIELDS[kind].map((k) => `${k}=${p[k] ?? ''}`).join('&'))
    .digest('hex');

// IPN không chứa accessKey -> tự thêm khóa của mình trước khi ký lại.
export function verifyMomoIpn(body: Params): boolean {
  const given = typeof body.signature === 'string' ? body.signature : '';
  const want = signMomo('ipn', { ...body, accessKey: momoKeys.accessKey });
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

// Dùng cho cổng giả lập: tạo đúng gói IPN mà MoMo sẽ gửi.
export function buildMomoIpn(o: { orderId: string; requestId: string; amount: number; transId: number; resultCode: number }): Params {
  const body: Params = {
    partnerCode: momoKeys.partnerCode,
    orderId: o.orderId,
    requestId: o.requestId,
    amount: o.amount,
    orderInfo: 'Airrest',
    orderType: 'momo_wallet',
    transId: o.transId,
    resultCode: o.resultCode,
    message: o.resultCode === 0 ? 'Successful.' : 'Failed.',
    payType: 'qr',
    responseTime: Date.now(),
    extraData: '',
  };
  body.signature = signMomo('ipn', { ...body, accessKey: momoKeys.accessKey });
  return body;
}

// orderId/requestId duy nhất mỗi lần gọi (MoMo không cho dùng lại): [A-Za-z0-9-], < 50 ký tự.
export const newMomoOrder = (prefix: string) => {
  const id = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { orderId: id, requestId: id };
};

// Mã resultCode "đang chờ" (chưa phải thất bại): 1000 khởi tạo, 7000/7002 đang xử lý, 9000 đã ủy quyền.
export const MOMO_PENDING_CODES = [1000, 7000, 7002, 9000];

export interface MomoCreateResult { resultCode: number; message: string; payUrl?: string; deeplink?: string }
export interface MomoQueryResult { resultCode: number; message: string; transId?: number; amount?: number }
export interface MomoRefundResult { resultCode: number; message: string; transId?: number }

async function post<T>(path: string, body: Params): Promise<T> {
  const res = await fetch(`${env.MOMO_ENDPOINT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, lang: 'vi' }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError(502, 'MOMO_BAD_RESPONSE', `MoMo trả dữ liệu không hợp lệ (HTTP ${res.status})`);
  }
}

// shortcut: chưa xác thực chữ ký của phản hồi create/query/refund (MoMo có ký); bổ sung khi chạy live, trước production.
// Đối tượng (không phải hàm rời) để test thay thế được bằng vi.spyOn.
export const momoGateway = {
  async create(p: { orderId: string; requestId: string; amount: number; orderInfo: string }): Promise<MomoCreateResult> {
    if (!live) {
      return { resultCode: 0, message: 'mock', payUrl: `${env.MOMO_REDIRECT_URL}?mock=1&orderId=${p.orderId}`, deeplink: `momo://mock?orderId=${p.orderId}` };
    }
    const body: Params = {
      partnerCode: momoKeys.partnerCode,
      accessKey: momoKeys.accessKey,
      requestId: p.requestId,
      amount: String(p.amount),
      orderId: p.orderId,
      orderInfo: p.orderInfo,
      redirectUrl: env.MOMO_REDIRECT_URL,
      ipnUrl: env.MOMO_IPN_URL,
      extraData: '',
      requestType: 'captureWallet',
    };
    return post<MomoCreateResult>('/v2/gateway/api/create', { ...body, signature: signMomo('create', body) });
  },

  async query(p: { orderId: string; requestId: string }): Promise<MomoQueryResult> {
    if (!live) return { resultCode: 1000, message: 'mock: đang chờ khách thanh toán' };
    const body: Params = { partnerCode: momoKeys.partnerCode, accessKey: momoKeys.accessKey, requestId: p.requestId, orderId: p.orderId };
    return post<MomoQueryResult>('/v2/gateway/api/query', { ...body, signature: signMomo('query', body) });
  },

  async refund(p: { orderId: string; requestId: string; amount: number; transId: number; description: string }): Promise<MomoRefundResult> {
    if (!live) return { resultCode: 0, message: 'mock', transId: Date.now() };
    const body: Params = {
      partnerCode: momoKeys.partnerCode,
      accessKey: momoKeys.accessKey,
      requestId: p.requestId,
      orderId: p.orderId,
      amount: p.amount,
      transId: p.transId,
      description: p.description,
    };
    return post<MomoRefundResult>('/v2/gateway/api/refund', { ...body, signature: signMomo('refund', body) });
  },
};
