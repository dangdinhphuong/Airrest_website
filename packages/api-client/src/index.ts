// Client gọi API Airrest dùng chung cho web/mobile. Không đọc biến môi trường: người dùng gói truyền `baseUrl` (FE lấy từ VITE_API_BASE_URL).
// Lỗi backend luôn có dạng { error: { code, message, details?, requestId } }; ở đây chuẩn hóa thành ApiError.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | Date | null | undefined>;
export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Header Idempotency-Key (bắt buộc với POST /v1/bookings, /support, /shuttle...). */
  idempotencyKey?: string;
  /** false: không gửi Authorization dù đang có token (API công khai). */
  auth?: boolean;
  signal?: AbortSignal;
}
export interface ClientOptions {
  baseUrl: string;
  getToken?: () => string | null | undefined;
  /** Gọi khi máy chủ trả 401 cho yêu cầu có token (phiên hết hạn/bị thu hồi). */
  onUnauthorized?: () => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const newIdempotencyKey = (): string => crypto.randomUUID();

const qs = (q?: Query): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null && v !== '') p.set(k, v instanceof Date ? v.toISOString() : String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function createClient(opts: ClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function request<T = any>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = o.auth === false ? null : opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    if (o.idempotencyKey) headers['Idempotency-Key'] = o.idempotencyKey;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 20_000);
    o.signal?.addEventListener('abort', () => ctl.abort());
    let res: Response;
    try {
      res = await doFetch(`${base}${path}${qs(o.query)}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: ctl.signal });
    } catch (e) {
      if (o.signal?.aborted) throw e; // hủy chủ động: để người gọi tự xử lý
      throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data: any = null;
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (!res.ok) {
      const e = data?.error;
      if (res.status === 401 && token) opts.onUnauthorized?.();
      throw new ApiError(res.status, e?.code ?? (res.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR'), e?.message ?? `Lỗi máy chủ (${res.status})`, e?.details, e?.requestId);
    }
    return data as T;
  }

  return {
    request,
    get: <T = any>(path: string, o?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, o),
    post: <T = any>(path: string, body?: unknown, o?: Omit<RequestOptions, 'body'>) => request<T>('POST', path, { ...o, body: body ?? {} }),
    put: <T = any>(path: string, body?: unknown, o?: Omit<RequestOptions, 'body'>) => request<T>('PUT', path, { ...o, body: body ?? {} }),
    patch: <T = any>(path: string, body?: unknown, o?: Omit<RequestOptions, 'body'>) => request<T>('PATCH', path, { ...o, body: body ?? {} }),
    delete: <T = any>(path: string, o?: Omit<RequestOptions, 'body'>) => request<T>('DELETE', path, o),
  };
}
export type ApiClient = ReturnType<typeof createClient>;

/** Thông báo tiếng Việt cho người dùng. Backend đã trả message tiếng Việt; chỉ bổ sung các trường hợp phía mạng và quá tải. */
export function describeError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Có lỗi xảy ra, vui lòng thử lại.';
  if (e.code === 'NETWORK_ERROR') return e.message;
  if (e.status === 429) return 'Bạn thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.';
  if (e.status === 422 && Array.isArray(e.details) && e.details[0]?.message) return String(e.details[0].message);
  if (e.status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
  return e.message;
}
