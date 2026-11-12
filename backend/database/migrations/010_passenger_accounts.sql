-- Tài khoản khách (PASSENGER): đăng nhập bằng TÊN ĐĂNG NHẬP (BR-002: không thu email/SĐT làm định danh).
-- Phương án ít phá nhất: giữ nguyên cột email cho nhân sự (HOTEL/DRIVER/ADMIN) nhưng cho phép NULL,
-- thêm cột username riêng; CHECK bảo đảm mỗi loại tài khoản có đúng một loại định danh.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check CHECK (type IN ('HOTEL','DRIVER','ADMIN','PASSENGER'));

ALTER TABLE accounts ALTER COLUMN email DROP NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_identity_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_identity_check CHECK (
  (type = 'PASSENGER' AND username IS NOT NULL AND email IS NULL)
  OR (type <> 'PASSENGER' AND email IS NOT NULL AND username IS NULL)
);
-- Tên đăng nhập không phân biệt hoa/thường (khớp luật của FE: so sánh toLowerCase).
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower ON accounts (lower(username)) WHERE username IS NOT NULL;

-- Gắn đơn vào tài khoản khách (không bắt buộc: khách vãng lai vẫn đặt được, tra cứu bằng mã + SĐT).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bookings_account_seq ON bookings (account_id, seq DESC) WHERE account_id IS NOT NULL;
