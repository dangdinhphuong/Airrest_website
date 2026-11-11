import { describe, expect, it } from 'vitest';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, presignImageUpload } from '../lib/storage';

// Ký URL là tính toán cục bộ, không gọi mạng nên chạy được không cần R2 thật.
describe('lưu trữ R2: URL upload ký sẵn', () => {
  it('khóa do server đặt, đuôi theo loại; URL trỏ đúng bucket/endpoint R2 và có chữ ký + hạn 300s', async () => {
    const r = await presignImageUpload('hotels', 'image/webp');
    expect(r.key).toMatch(/^hotels\/\d{4}\/[0-9a-f-]{36}\.webp$/);
    const u = new URL(r.uploadUrl);
    expect(u.hostname).toBe('test-bucket.testaccount.r2.cloudflarestorage.com');
    expect(u.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(r.headers['Content-Type']).toBe('image/webp');
    expect(r.publicUrl).toBe(`https://pub-test.r2.dev/${r.key}`);
  });

  it('hai lần gọi cho hai khóa khác nhau; chỉ nhận ảnh JPEG/PNG/WebP, tối đa 5 MB', async () => {
    const [a, b] = await Promise.all([presignImageUpload('rooms', 'image/png'), presignImageUpload('rooms', 'image/png')]);
    expect(a.key).not.toBe(b.key);
    expect(Object.keys(IMAGE_TYPES)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });
});
