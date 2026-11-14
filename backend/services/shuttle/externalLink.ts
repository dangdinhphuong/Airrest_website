import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

const bad = (why: string) => new AppError(422, 'EXTERNAL_LINK_NOT_ALLOWED', `Liên kết chia sẻ chuyến không được chấp nhận: ${why}`);
export const allowedRideHosts = (): string[] => env.EXTERNAL_RIDE_LINK_HOSTS.split(',').map((h) => h.trim().toLowerCase().replace(/^\.+|\.+$/g, '')).filter(Boolean);

// Khớp theo nhãn tên miền: 'grab.com' khớp 'grab.com' và 'r.grab.com', KHÔNG khớp 'evilgrab.com' hay 'grab.com.evil.io'.
export const hostAllowed = (host: string, allowed = allowedRideHosts()): boolean => allowed.some((a) => host === a || host.endsWith(`.${a}`));

/** Kiểm tra liên kết do khách sạn nhập (khách sẽ bấm vào: đường tấn công lừa đảo). Trả URL đã chuẩn hóa + host; sai -> 422 EXTERNAL_LINK_NOT_ALLOWED. */
export function validateShareUrl(raw: string): { url: string; host: string } {
  if (raw.length > 500) throw bad('quá dài (tối đa 500 ký tự)');
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) throw bad('chứa ký tự không hợp lệ');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw bad('không phải URL hợp lệ');
  }
  if (u.protocol !== 'https:') throw bad('chỉ chấp nhận https');
  if (u.username || u.password) throw bad('không được chứa thông tin đăng nhập');
  if (u.port) throw bad('không được chỉ định cổng');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.includes(':') || /^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) throw bad('không được dùng IP hoặc localhost');
  if (!hostAllowed(host)) throw bad('tên miền không nằm trong danh sách cho phép');
  return { url: u.href, host };
}
