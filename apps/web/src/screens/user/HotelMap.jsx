import React, { useEffect, useRef, useState } from 'react';

// Bản đồ OpenStreetMap một điểm (vị trí khách sạn). Leaflet chỉ tải khi component hiện ra; marker dùng divIcon để khỏi lỗi đường dẫn ảnh khi bundle.
// Trên điện thoại tắt kéo một ngón và zoom bằng cuộn để không chặn việc cuộn trang.
export default function HotelMap({ lat, lng, name }) {
  const el = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let map;
    let dead = false;
    (async () => {
      try {
        const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        if (dead || !el.current) return;
        map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([lat, lng], 15);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(map);
        L.marker([lat, lng], { title: name, icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 28], html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1262e8;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>' }) }).addTo(map);
      } catch { if (!dead) setErr('Không tải được bản đồ.'); }
    })();
    return () => { dead = true; map?.remove(); };
  }, [lat, lng, name]);
  if (err) return <p role="alert" className="tw:mt-3 tw:text-xs tw:text-rose-700">{err}</p>;
  return <div ref={el} data-testid="hotel-map" role="img" aria-label={`Bản đồ vị trí ${name}`} className="tw:mt-4 tw:h-64 tw:w-full tw:overflow-hidden tw:rounded-xl tw:border tw:border-slate-200 tw:sm:h-80" />;
}
