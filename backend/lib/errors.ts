// Lỗi nghiệp vụ có mã ổn định để FE rẽ nhánh (không dựa vào câu chữ message).
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Postgres unique_violation. `constraint` (tên index/ràng buộc) cho biết cột nào trùng.
export const isDuplicateKey = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
export const duplicateConstraint = (e: unknown): string => (e as { constraint?: string }).constraint ?? '';
