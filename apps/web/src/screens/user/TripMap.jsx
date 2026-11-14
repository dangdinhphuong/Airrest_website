// Bản đồ chuyến xe của khách sạn (Leaflet, chỉ tải khi có route). Vẽ approach (nét đứt) + ride (nét liền), marker xe di chuyển mượt.
// Dùng L.divIcon (không dùng ảnh marker mặc định để khỏi lỗi đường dẫn khi bundle). Tile OpenStreetMap.
import React, { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pin = (L, color, label) => L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;font:700 11px/28px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${label}</div>` });
const carIcon = (L) => L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: '<div data-testid="trip-car" style="width:34px;height:34px;border-radius:50%;background:#1262e8;color:#fff;font:800 11px/30px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5)">Xe</div>' });

export default function TripMap({ route, position, pickupLabel = 'Điểm đón', dropLabel = 'Điểm trả' }) {
  const el = useRef(null);
  const ctx = useRef({});
  const [err, setErr] = useState('');

  // Khởi tạo một lần; vẽ lại khi route đổi (TRIP_ROUTE_READY / đổi chuyến).
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        if (dead || !el.current) return;
        const c = ctx.current;
        c.L = L;
        c.map ??= L.map(el.current, { zoomControl: true, attributionControl: true, dragging: !L.Browser.mobile });
        if (!c.tiles) c.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(c.map);
        c.layer?.remove();
        const g = (c.layer = L.layerGroup().addTo(c.map));
        const ap = route?.approach ?? []; const ride = route?.ride ?? [];
        if (ap.length > 1) L.polyline(ap, { color: '#1262e8', weight: 4, dashArray: '8 8' }).addTo(g);
        if (ride.length > 1) L.polyline(ride, { color: '#1262e8', weight: 5 }).addTo(g);
        const pick = ap.length ? ap[ap.length - 1] : ride[0];
        const drop = ride.length ? ride[ride.length - 1] : null;
        if (pick) L.marker(pick, { icon: pin(L, '#059669', 'Đ'), title: pickupLabel }).addTo(g);
        if (drop) L.marker(drop, { icon: pin(L, '#dc2626', 'T'), title: dropLabel }).addTo(g);
        const pts = [...ap, ...ride];
        if (pts.length) c.map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], animate: false });
        c.map.invalidateSize();
        c.ready = true;
        c.move?.();
      } catch { if (!dead) setErr('Không tải được bản đồ.'); }
    })();
    return () => { dead = true; };
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Xe: nội suy ~1 giây giữa hai vị trí (tắt khi prefers-reduced-motion).
  useEffect(() => {
    const c = ctx.current;
    c.move = () => {
      if (!c.ready || !position) return;
      const to = [position.lat, position.lng];
      if (!c.car) { c.car = c.L.marker(to, { icon: carIcon(c.L), zIndexOffset: 1000 }).addTo(c.map); return; }
      cancelAnimationFrame(c.raf);
      if (reduced()) { c.car.setLatLng(to); return; }
      const from = c.car.getLatLng(); const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 1000);
        c.car.setLatLng([from.lat + (to[0] - from.lat) * k, from.lng + (to[1] - from.lng) * k]);
        if (k < 1) c.raf = requestAnimationFrame(step);
      };
      c.raf = requestAnimationFrame(step);
    };
    c.move();
  }, [position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { const c = ctx.current; cancelAnimationFrame(c.raf); c.map?.remove(); ctx.current = {}; }, []);

  if (err) return <p role="alert" className="tw:mt-3 tw:rounded-xl tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900">{err}</p>;
  return <div ref={el} data-testid="trip-map" role="img" aria-label="Bản đồ hành trình của xe" className="tw:mt-3 tw:h-64 tw:w-full tw:overflow-hidden tw:rounded-xl tw:border tw:border-slate-200 tw:sm:h-80" style={{ zIndex: 0 }} />;
}
