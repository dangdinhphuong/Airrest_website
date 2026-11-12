-- Ảnh khách sạn: mảng khóa object R2 (vd. "hotels/2026/<uuid>.jpg"); URL công khai ghép khi trả ra. Idempotent.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]';
