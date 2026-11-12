-- Vai trò tùy chỉnh cho Admin: dùng lại bảng roles (scope = 'SYSTEM', system = false, key = 'custom_<mã>').
-- Tài khoản ADMIN trỏ tới vai trò qua accounts.role_ids; admin_role (CHECK 4 giá trị) chỉ còn dùng cho 4 vai trò hệ thống, NULL với vai trò tùy chỉnh.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
