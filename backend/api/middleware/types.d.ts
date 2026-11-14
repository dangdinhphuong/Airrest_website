import type { AuthContext } from '../../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      payerKey?: { keyId: string; payerId: string }; // khóa API đơn vị chi trả đã xác thực (middleware payerKey)
      // Kết quả validate (zod) của body/query/params — xem middleware/validate.ts
      valid: { body?: any; query?: any; params?: any };
    }
  }
}

export {};
