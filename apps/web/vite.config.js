import tailwindcss from '@tailwindcss/vite';
import viteOgPlugin from './vite-og-plugin.js';

// API mà máy chủ web chuyển tiếp tới khi web gọi cùng địa chỉ (VITE_API_BASE_URL=/). Trong Docker: http://api:3000 (đặt ở docker-compose.yml).
// KHÔNG bật xfwd: backend dùng `trust proxy 1` và lấy IP khách từ X-Forwarded-For do Cloudflare đặt; thêm xfwd sẽ nối thêm IP của proxy và mọi khách dùng chung một IP (rate limit sai).
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

// Web được phục vụ trực tiếp bằng Vite (qua Cloudflare Tunnel) nên header bảo mật đặt ở đây. Chưa đặt CSP đầy đủ: HMR/inline của Vite dev sẽ bị chặn; chỉ chặn nhúng khung (clickjacking).
const securityHeaders = {
  'Content-Security-Policy': "frame-ancestors 'self'",
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export default {
  cacheDir: '/tmp/airrest_web_vite_cache',
  plugins: [tailwindcss(), viteOgPlugin()],
  // Tên miền công khai qua Cloudflare Tunnel: máy chủ phát triển (npm run dev) từ chối host lạ nếu không khai ở đây (403 "Blocked request").
  server: {
    headers: securityHeaders,
    allowedHosts: ['airrest.dpdns.org'],
    proxy: {
      '/api/v1': { target: apiTarget },
      '/v1': { target: apiTarget, rewrite: (path) => path.replace(/^\/v1/, '/api/v1') },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
  preview: {
    headers: securityHeaders,
    allowedHosts: ['airrest-website.onrender.com', 'airrest.dpdns.org'],
    proxy: {
      '/api/v1': { target: apiTarget },
      '/v1': { target: apiTarget, rewrite: (path) => path.replace(/^\/v1/, '/api/v1') },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
};
