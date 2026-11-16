// Địa chỉ → tọa độ bằng OpenStreetMap Nominatim (gọi từ trình duyệt; chính sách OSM: ≤1 yêu cầu/giây, gọi theo thao tác người dùng).
// OSM thiếu nhiều số nhà ở Việt Nam nên thử lần lượt: địa chỉ đầy đủ → bỏ số nhà → từ đường trở đi.
// Trả { lat, lng, approx } (approx = chỉ khớp đến mức đường/khu vực, không phải đúng số nhà) hoặc null; ném lỗi khi mạng/máy chủ OSM lỗi.
// Kết quả mức thành phố/tỉnh quá thô (OSM trả tâm Hà Nội khi không khớp số nhà): bỏ qua, thử cách hỏi khác.
const COARSE = new Set(['city', 'state', 'country', 'region', 'county', 'province', 'municipality', 'administrative']);
const PRECISE = new Set(['house', 'building', 'amenity', 'shop', 'tourism', 'office', 'leisure', 'craft']);
const clean = (s) => String(s || '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OSM ${res.status}`);
  const [hit] = await res.json();
  const lat = Number(hit?.lat), lng = Number(hit?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, kind: hit.addresstype || hit.category } : null;
}

export async function geocodeAddress(line, city, signal) {
  const full = clean([line, city].filter((s) => clean(s)).join(', '));
  if (!full) return null;
  const noNumber = full.replace(/^\s*(số\s+)?\d+[a-zA-Z]?([/-]\d+[a-zA-Z]?)*\s*,?\s*/i, '');
  const tries = [...new Set([full, noNumber, noNumber.split(',').slice(-3).join(',')].map(clean).filter(Boolean))];
  for (let i = 0; i < tries.length; i++) {
    if (i) await sleep(1100);
    const p = await search(`${tries[i]}, Việt Nam`, signal);
    if (p && !COARSE.has(p.kind)) return { lat: p.lat, lng: p.lng, approx: i > 0 || !PRECISE.has(p.kind) };
  }
  return null;
}
