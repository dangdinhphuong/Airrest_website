import fs from 'node:fs';
import path from 'node:path';

export const DETAIL = '/khach-san/';
export const ID_RE = /^[0-9A-Za-z-]{1,64}$/;

/**
 * Escape HTML các ký tự nguy hiểm: & < > " '
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Xác định tên miền gốc an toàn
 */
export function getOrigin(req) {
  const envUrl = process.env.PUBLIC_WEB_URL?.replace(/\/+$/, '');
  if (envUrl) {
    if (envUrl.startsWith('https://') || envUrl.startsWith('http://localhost') || envUrl.startsWith('http://127.0.0.1')) {
      return envUrl;
    }
  }
  const proto = req?.headers?.['x-forwarded-proto'] || (req?.socket?.encrypted ? 'https' : 'http');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) {
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    if (proto === 'https' || (proto === 'http' && isLocal)) {
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }
  return 'https://airrest.dpdns.org';
}

/**
 * Dựng bộ thông tin meta từ dữ liệu khách sạn
 */
export function buildMeta(hotel, origin = 'https://airrest.dpdns.org', id = '') {
  if (!hotel) return null;

  const cleanOrigin = (origin || 'https://airrest.dpdns.org').replace(/\/+$/, '');
  const defaultImage = `${cleanOrigin}/images/og-default.jpg`;

  // 1. Title
  const hotelName = hotel.name ? String(hotel.name).trim() : 'Khách sạn';
  const title = `${hotelName} — AIRREST`;

  // 2. Description: mô tả ngắn, bỏ xuống dòng, cắt ở 160 ký tự
  let rawDesc = hotel.description ? String(hotel.description).trim() : '';
  if (!rawDesc) {
    const city = hotel.address?.city || hotel.city || '';
    rawDesc = city
      ? `Nơi nghỉ tại ${city} — dịch vụ lưu trú thuận tiện gần sân bay.`
      : 'Nơi nghỉ chất lượng, thuận tiện gần sân bay cùng AIRREST.';
  }
  const singleLineDesc = rawDesc.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const description = singleLineDesc.length > 160 ? singleLineDesc.slice(0, 160).trim() : singleLineDesc;

  // 3. Image: ảnh đầu tiên có link
  let rawImage = null;
  if (Array.isArray(hotel.images) && hotel.images.length > 0) {
    for (const item of hotel.images) {
      const u = typeof item === 'string' ? item : item?.url;
      if (typeof u === 'string' && u.trim().length > 0) {
        rawImage = u.trim();
        break;
      }
    }
  }
  let image = defaultImage;
  if (rawImage) {
    if (/^https?:\/\//i.test(rawImage)) {
      image = rawImage;
    } else {
      const imgPath = rawImage.startsWith('/') ? rawImage : `/${rawImage}`;
      image = `${cleanOrigin}${imgPath}`;
    }
  }

  // 4. URL
  const url = `${cleanOrigin}/khach-san/${id}`;

  return {
    title,
    description,
    image,
    url
  };
}

/**
 * Chèn/thay thế các thẻ meta vào nội dung HTML
 */
export function injectMeta(html, meta) {
  if (!html || !meta) return html;

  const escTitle = escapeHtml(meta.title);
  const escDesc = escapeHtml(meta.description);
  const escImage = escapeHtml(meta.image);
  const escUrl = escapeHtml(meta.url);

  let result = html;

  // 1. Cập nhật <title>
  if (/<title>.*?<\/title>/is.test(result)) {
    result = result.replace(/<title>.*?<\/title>/is, `<title>${escTitle}</title>`);
  } else {
    result = result.replace(/<\/head>/i, `  <title>${escTitle}</title>\n</head>`);
  }

  // Helper thay thế hoặc chèn thẻ meta theo attribute
  function updateTag(attrName, attrVal, contentVal) {
    const re = new RegExp(`<meta\\s+[^>]*?${attrName}=["']${attrVal}["'][^>]*?>`, 'i');
    const newTag = `<meta ${attrName}="${attrVal}" content="${contentVal}" />`;
    if (re.test(result)) {
      result = result.replace(re, newTag);
    } else {
      result = result.replace(/<\/head>/i, `  ${newTag}\n</head>`);
    }
  }

  updateTag('name', 'description', escDesc);
  updateTag('property', 'og:title', escTitle);
  updateTag('property', 'og:description', escDesc);
  updateTag('property', 'og:url', escUrl);
  updateTag('property', 'og:image', escImage);
  updateTag('name', 'twitter:title', escTitle);
  updateTag('name', 'twitter:description', escDesc);
  updateTag('name', 'twitter:image', escImage);

  return result;
}

// Bộ nhớ đệm Cache in-memory: id -> { data, expiresAt }
// Tối đa 200 mục, TTL 5 phút (300,000 ms)
const CACHE_MAX = 200;
const CACHE_TTL = 5 * 60 * 1000;
const hotelCache = new Map();

export function getCachedHotel(id) {
  const item = hotelCache.get(id);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    hotelCache.delete(id);
    return null;
  }
  return item.data;
}

export function setCachedHotel(id, data) {
  if (hotelCache.size >= CACHE_MAX) {
    // Xóa phần tử cũ nhất (FIFO)
    const oldestKey = hotelCache.keys().next().value;
    hotelCache.delete(oldestKey);
  }
  hotelCache.set(id, {
    data,
    expiresAt: Date.now() + CACHE_TTL
  });
}

export function clearHotelCache() {
  hotelCache.clear();
}

/**
 * Gọi API backend lấy thông tin khách sạn với timeout 3s
 */
async function fetchHotel(apiTarget, id) {
  const cached = getCachedHotel(id);
  if (cached) return cached;

  const base = (apiTarget || 'http://localhost:3000').replace(/\/+$/, '');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);

  try {
    // Ưu tiên /api/v1/hotels/:id
    let res = await fetch(`${base}/api/v1/hotels/${encodeURIComponent(id)}`, { signal: ctl.signal });
    if (res.status === 404) {
      // Fallback thử /v1/hotels/:id nếu có
      res = await fetch(`${base}/v1/hotels/${encodeURIComponent(id)}`, { signal: ctl.signal });
    }
    if (!res.ok) return null;

    const json = await res.json();
    const hotel = json?.hotel || json;
    if (hotel && hotel.name) {
      setCachedHotel(id, hotel);
      return hotel;
    }
    return null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Middleware cho cả dev server và preview server
 */
function createOgMiddleware(serverOrOptions, isDev) {
  return async (req, res, next) => {
    // Chỉ xử lý GET hoặc HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const urlPath = (req.url || '').split('?')[0];
    if (!urlPath.startsWith(DETAIL)) {
      return next();
    }

    const rawId = urlPath.slice(DETAIL.length).replace(/\/+$/, '');
    let id = '';
    try {
      id = decodeURIComponent(rawId);
    } catch {
      return next();
    }

    if (!ID_RE.test(id)) {
      return next();
    }

    // Đọc index.html
    let html = '';
    const rootDir = process.cwd();
    const distIndexPath = path.resolve(rootDir, 'apps/web/dist/index.html');
    const localDistPath = path.resolve(rootDir, 'dist/index.html');
    const devIndexPath = path.resolve(rootDir, 'apps/web/index.html');
    const localDevPath = path.resolve(rootDir, 'index.html');

    if (!isDev) {
      // Preview: Đọc dist/index.html
      if (fs.existsSync(distIndexPath)) {
        html = fs.readFileSync(distIndexPath, 'utf-8');
      } else if (fs.existsSync(localDistPath)) {
        html = fs.readFileSync(localDistPath, 'utf-8');
      }
    }

    if (!html) {
      // Dev hoặc fallback
      if (fs.existsSync(devIndexPath)) {
        html = fs.readFileSync(devIndexPath, 'utf-8');
      } else if (fs.existsSync(localDevPath)) {
        html = fs.readFileSync(localDevPath, 'utf-8');
      }
    }

    if (!html) {
      return next();
    }

    // Ở chế độ dev, cần gọi server.transformIndexHtml
    if (isDev && serverOrOptions?.transformIndexHtml) {
      try {
        html = await serverOrOptions.transformIndexHtml(req.url, html);
      } catch (err) {
        // Giữ nguyên html nếu lỗi transform
      }
    }

    const origin = getOrigin(req);
    const apiTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

    const hotel = await fetchHotel(apiTarget, id);

    let finalHtml = html;
    if (hotel) {
      const meta = buildMeta(hotel, origin, id);
      if (meta) {
        finalHtml = injectMeta(html, meta);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.end(finalHtml);
  };
}

/**
 * Vite Plugin: OpenGraph động cho trang chi tiết khách sạn
 */
export default function viteOgPlugin() {
  return {
    name: 'vite-og-plugin',
    configureServer(server) {
      server.middlewares.use(createOgMiddleware(server, true));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createOgMiddleware(server, false));
    }
  };
}
