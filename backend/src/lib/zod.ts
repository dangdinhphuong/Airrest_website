import { z } from 'zod';

// ObjectId dạng hex 24 ký tự — dùng chung cho params/query/body.
export const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Mã không hợp lệ');
export const idParams = z.object({ id: oid });
export const limitQuery = z.coerce.number().int().min(1).max(100).default(20);

export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
