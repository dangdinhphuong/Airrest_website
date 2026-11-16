import { plain } from './navTree';

// Mã khách sạn tự sinh: <IATA>-<TÊN-KHÔNG-DẤU> (A-Z, 0-9, gạch; 3–30 ký tự). attempt>0 thêm hậu tố ngẫu nhiên để tránh trùng.
export function hotelCodeFrom(iata, name, attempt = 0) {
  const slug = plain(String(name ?? '').toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
  const suffix = attempt ? `-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : '';
  const head = [String(iata || '').toUpperCase(), slug].filter(Boolean).join('-').slice(0, 30 - suffix.length).replace(/-+$/, '');
  return (head || 'KS') + suffix;
}
