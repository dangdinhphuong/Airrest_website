// Mỗi màn hình có một đường dẫn riêng (không dùng hash). Hàm thuần, có test ở routes.test.js.
// Render đã rewrite mọi đường dẫn về index.html (render.yaml); `vite` dev cũng tự fallback.
export const PATHS = { home: '/', stays: '/noi-nghi', track: '/tra-cuu', flights: '/flights', support: '/ho-tro', account: '/tai-khoan', login: '/dang-nhap', hotel: '/doi-tac/khach-san', admin: '/quan-tri', payment: '/payment/result' };
const DETAIL = '/khach-san/';
const PARTNER = ['hotel', 'admin']; // có thêm /<tab> sau đường dẫn khu vực
const ID_RE = /^[0-9A-Za-z-]{1,64}$/;
const LEGACY = ['home', 'stays', 'support', 'track', 'account', 'login', 'hotel', 'admin']; // #/<màn> của bản cũ

// state -> đường dẫn. Trang chi tiết thiếu id thì về '/'.
export function pathOf({ screen, propertyId, partnerTab }) {
  if (screen === 'detail') return propertyId ? `${DETAIL}${encodeURIComponent(propertyId)}` : '/';
  const base = PATHS[screen] ?? '/';
  return PARTNER.includes(screen) && partnerTab ? `${base}/${encodeURIComponent(partnerTab)}` : base;
}

// đường dẫn (+ hash cũ) -> { screen, propertyId?, partnerTab? }; không nhận ra thì null.
export function parsePath(pathname, hash = '') {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (p.startsWith(PATHS.payment)) return { screen: 'payment' };
  if (p.startsWith(DETAIL)) { const id = decodeURIComponent(p.slice(DETAIL.length)); return ID_RE.test(id) ? { screen: 'detail', propertyId: id } : null; }
  for (const screen of PARTNER) {
    if (p === PATHS[screen]) return { screen, partnerTab: null };
    if (p.startsWith(`${PATHS[screen]}/`)) return { screen, partnerTab: decodeURIComponent(p.slice(PATHS[screen].length + 1)) || null };
  }
  const hit = Object.keys(PATHS).find((s) => s !== 'payment' && !PARTNER.includes(s) && PATHS[s] === p);
  if (hit && (hit !== 'home' || !hash)) return { screen: hit };
  const old = hash.replace('#/', '');
  return p === '/' && LEGACY.includes(old) ? { screen: old, ...(PARTNER.includes(old) && { partnerTab: null }) } : hit ? { screen: hit } : null;
}
