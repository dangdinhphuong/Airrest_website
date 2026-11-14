-- Hồ sơ khách: cấu hình cá nhân (sân bay/số khách/thanh toán mặc định) + gắn ticket hỗ trợ vào tài khoản khách.
-- preferences chỉ PASSENGER dùng; KHÔNG chứa SĐT/email (BR-002). Ticket cũ và ticket của khách vãng lai giữ account_id NULL.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS support_tickets_account_seq ON support_tickets (account_id, seq DESC) WHERE account_id IS NOT NULL;
