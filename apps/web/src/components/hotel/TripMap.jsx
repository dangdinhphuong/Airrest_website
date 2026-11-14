import React, { useEffect, useRef, useState } from 'react';

// Bản đồ Leaflet nhỏ: tuyến đón (nét đứt), tuyến chở khách và vị trí xe. Chỉ tải leaflet khi mở bản đồ.
// route: { approach: [[lat,lng]], ride: [[lat,lng]] } | null; position: { lat, lng } | null.
export default function TripMap({ route, position, height = 220 }) {
  const el = useRef(null);
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  const posRef = useRef(position);
  posRef.current = position;
  const sig = JSON.stringify([route?.approach?.length, route?.ride?.length, route?.approach?.[0], route?.ride?.[0]]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        if (dead || !el.current) return;
        const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([21.03, 105.8], 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        ref.current = { L, map, layers: L.layerGroup().addTo(map), marker: null };
        setFailed(false);
        draw();
        place();
      } catch { if (!dead) setFailed(true); }
    })();
    return () => { dead = true; ref.current?.map.remove(); ref.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const m = ref.current;
    if (!m) return;
    m.layers.clearLayers();
    const pts = [];
    if (route?.approach?.length) { m.L.polyline(route.approach, { color: '#d97706', weight: 4, dashArray: '6 8' }).addTo(m.layers); pts.push(...route.approach); }
    if (route?.ride?.length) { m.L.polyline(route.ride, { color: '#1d4ed8', weight: 4 }).addTo(m.layers); pts.push(...route.ride); }
    if (pts.length) m.map.fitBounds(pts, { padding: [20, 20] });
    m.map.invalidateSize();
  }
  useEffect(draw, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  function place() {
    const m = ref.current;
    const p = posRef.current;
    if (!m || !p) return;
    const ll = [p.lat, p.lng];
    if (m.marker) m.marker.setLatLng(ll); else m.marker = m.L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }).addTo(m.map);
    if (!route?.approach?.length && !route?.ride?.length) m.map.setView(ll, 14);
  }
  useEffect(place, [position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="muted" role="status">Không tải được bản đồ.</p>;
  return <div ref={el} className="trip-map" style={{ height }} data-testid="trip-map" role="img" aria-label="Bản đồ chuyến đi" />;
}
