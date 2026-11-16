-- Doanh nghiệp (chủ kinh doanh) là thực thể riêng; một doanh nghiệp có NHIỀU khách sạn.
-- Email/SĐT thuộc doanh nghiệp + tài khoản chủ (accounts.email vẫn unique); chỉ TÊN khách sạn bị kiểm trùng (ở tầng API).
-- Chạy lại an toàn: IF NOT EXISTS + backfill chỉ đụng hàng chưa có business_id.

CREATE TABLE IF NOT EXISTS businesses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code           text UNIQUE,
  name           text NOT NULL,
  tax_code       text,                                   -- mã số thuế / giấy phép kinh doanh (hàng backfill có thể trống)
  representative text,
  email          text,
  phone          text,
  status         text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED')),
  reject_reason  text,
  approved_by    uuid,
  approved_at    timestamptz,
  rejected_by    uuid,
  rejected_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Một mã số thuế chỉ có một hồ sơ còn hiệu lực (hồ sơ bị từ chối được nộp lại).
CREATE UNIQUE INDEX IF NOT EXISTS businesses_tax_code_live ON businesses (lower(tax_code)) WHERE tax_code IS NOT NULL AND status <> 'REJECTED';
CREATE INDEX IF NOT EXISTS businesses_status_seq ON businesses (status, seq DESC);

ALTER TABLE hotels   ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone text;
CREATE INDEX IF NOT EXISTS hotels_business ON hotels (business_id);
CREATE INDEX IF NOT EXISTS accounts_business ON accounts (business_id) WHERE business_id IS NOT NULL;

-- Backfill (giữ đồng bộ với database/backfillBusinesses.ts): mỗi tài khoản chủ hiện có (hotels.owner_account_id) -> một business có id = id tài khoản;
-- khách sạn không có chủ -> business có id = id khách sạn. Mọi business backfill là ACTIVE (đã được admin tạo/duyệt trước đây).
INSERT INTO businesses (id, name, representative, email, phone, status, approved_at, created_at)
SELECT a.id, h.name, a.full_name, a.email, COALESCE(a.phone, h.contact->>'phone'), 'ACTIVE', now(), a.created_at
FROM accounts a
JOIN LATERAL (SELECT name, contact FROM hotels WHERE owner_account_id = a.id ORDER BY seq LIMIT 1) h ON true
WHERE a.business_id IS NULL
ON CONFLICT (id) DO NOTHING;
UPDATE accounts a SET business_id = a.id WHERE a.business_id IS NULL AND EXISTS (SELECT 1 FROM businesses b WHERE b.id = a.id) AND EXISTS (SELECT 1 FROM hotels WHERE owner_account_id = a.id);
UPDATE hotels SET business_id = owner_account_id WHERE business_id IS NULL AND owner_account_id IN (SELECT id FROM businesses);

INSERT INTO businesses (id, name, email, phone, status, approved_at, created_at)
SELECT h.id, h.name, h.contact->>'email', h.contact->>'phone', 'ACTIVE', now(), h.created_at FROM hotels h WHERE h.business_id IS NULL
ON CONFLICT (id) DO NOTHING;
UPDATE hotels SET business_id = id WHERE business_id IS NULL;
