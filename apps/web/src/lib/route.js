import { useEffect, useState } from 'react';

// Quãng đường ô tô từ khách sạn tới sân bay bằng OSRM công cộng (router.project-osrm.org, dữ liệu OpenStreetMap; máy chủ demo, dùng theo thao tác người dùng).
// Lỗi/không có đường thì ước lượng theo đường chim bay × 1,35 (đánh dấu estimated) để vẫn điền được số.
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

export const haversineKm = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

export function estimateRoute(from, to) {
  const km = Math.round(haversineKm(from, to) * 1.35 * 10) / 10;
  return { km, minutes: Math.max(1, Math.round((km / 35) * 60)), coords: [[from.lat, from.lng], [to.lat, to.lng]], estimated: true };
}

export async function routeBetween(from, to, signal) {
  const res = await fetch(`${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`, { signal });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const r = (await res.json()).routes?.[0];
  if (!r) throw new Error('no route');
  return { km: Math.round(r.distance / 100) / 10, minutes: Math.max(1, Math.round(r.duration / 60)), coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), estimated: false };
}

// Hook: tuyến từ `from` tới `to` (null nếu thiếu một đầu); chờ 600ms sau lần đổi cuối để không dồn yêu cầu khi kéo bản đồ.
export function useRoute(from, to) {
  const [route, setRoute] = useState(null);
  const key = from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : '';
  useEffect(() => {
    if (!key) { setRoute(null); return undefined; }
    const ac = new AbortController();
    const t = setTimeout(() => { routeBetween(from, to, ac.signal).then(setRoute).catch((e) => { if (e?.name !== 'AbortError') setRoute(estimateRoute(from, to)); }); }, 600);
    return () => { clearTimeout(t); ac.abort(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return route;
}
