-- Liên kết nhân viên khách sạn <-> khách sạn: một nhân viên làm ở NHIỀU khách sạn, mỗi khách sạn một vai trò riêng (vai trò tùy chỉnh gắn theo khách sạn).
-- accounts.hotel_id giữ nghĩa "khách sạn đang/gần nhất làm việc"; accounts.role_ids giữ vai trò ở khách sạn đó (tương thích code cũ).
-- Không áp cho chủ doanh nghiệp (business_id NOT NULL): họ đã làm việc được ở mọi khách sạn của doanh nghiệp.
-- Chạy lại an toàn: IF NOT EXISTS + backfill ON CONFLICT DO NOTHING. Hoàn tác: DROP TABLE account_hotels (code cũ vẫn chạy nhờ accounts.hotel_id/role_ids).
CREATE TABLE IF NOT EXISTS account_hotels (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  hotel_id   uuid NOT NULL REFERENCES hotels(id),
  role_id    uuid NOT NULL REFERENCES roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, hotel_id)
);
CREATE INDEX IF NOT EXISTS account_hotels_hotel ON account_hotels (hotel_id);

INSERT INTO account_hotels (account_id, hotel_id, role_id)
SELECT id, hotel_id, role_ids[1] FROM accounts
WHERE type = 'HOTEL' AND business_id IS NULL AND hotel_id IS NOT NULL AND cardinality(role_ids) > 0
ON CONFLICT DO NOTHING;
