import { z } from 'zod';

// Khóa chính là uuid — dùng chung cho params/query/body.
export const uuid = z.string().uuid('Mã không hợp lệ');
export const idParams = z.object({ id: uuid });
export const limitQuery = z.coerce.number().int().min(1).max(100).default(20);
// Con trỏ keyset: cột `seq` (identity) của bảng; trả về ở nextCursor.
export const seqCursor = z.coerce.number().int().min(0);

// Dùng với ILIKE ... ESCAPE '\': thoát ký tự đại diện để tìm đúng chuỗi người dùng gõ.
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');
