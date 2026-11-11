import type { AuthContext } from '../../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      // Kết quả validate (zod) của body/query/params — xem middleware/validate.ts
      valid: { body?: any; query?: any; params?: any };
    }
  }
}

export {};
