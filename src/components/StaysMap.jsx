import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AIRPORT_COORDS } from '../mock/properties';
import { money } from '../lib/time';
import { SHUTTLE_LABEL } from './PropertyCard';

// Bản đồ OpenStreetMap bằng Leaflet (giống cách Couppa làm: ô bản đồ OSM, ghim divIcon hiển thị giá).
// Lưu ý: ô bản đồ được tải từ máy chủ ngoài (tile.openstreetmap.org). Vị trí các nơi nghỉ là TỔNG HỢP (mô phỏng).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">OpenStreetMap</a> contributors';
const short = (v) => `${Math.round(v / 1000)}k`;

function pinIcon(p, selected) {
  return L.divIcon({
    className: 'map-pin-wrap', iconSize: [64, 30], iconAnchor: [32, 30], popupAnchor: [0, -28],
    html: `<div class="map-pin ${selected ? 'sel' : ''}" data-testid="map-pin" data-id="${p.id}"><span>${short(p.price)}</span></div>`,
  });
}
const airportIcon = (label) => L.divIcon({ className: 'map-pin-wrap', iconSize: [96, 28], iconAnchor: [48, 14], html: `<div class="map-airport">✈ ${label}</div>` });

function popupNode(p, onOpen) {
  const el = document.createElement('div'); el.className = 'map-popup'; el.setAttribute('data-testid', 'map-popup');
  const add = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = text; el.appendChild(n); return n; };
  add('strong', '', p.name);
  add('span', 'muted', `${p.type} · ${p.travelMin} phút đi xe · ${SHUTTLE_LABEL[p.shuttle]}`);
  add('span', 'map-popup-price', `${money(p.price)} · ★ ${p.rating} (mô phỏng)`);
  const b = add('button', 'btn btn-primary btn-sm', 'Xem chi tiết'); b.type = 'button'; b.addEventListener('click', () => onOpen(p.id));
  return el;
}

export default function StaysMap({ airport, items, selectedId, onSelect, onOpen, active = true, children }) {
  const box = useRef(null); const map = useRef(null); const group = useRef(null); const airportMk = useRef(null);
  const markers = useRef(new Map()); const popup = useRef(null); const lastSel = useRef(null);
  const bounds = useRef(null); const needFit = useRef(false);
  const cb = useRef({ onSelect, onOpen }); cb.current = { onSelect, onOpen };

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true }).setView([AIRPORT_COORDS[airport].lat, AIRPORT_COORDS[airport].lng], 12);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    group.current = L.layerGroup().addTo(m); map.current = m;
    popup.current = L.popup({ closeButton: true, offset: [0, -4], maxWidth: 240, minWidth: 200, autoPan: true, autoPanPadding: [28, 28] });
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      // Bản đồ được dựng khi đang ẩn (tab mobile) → căn lại khung nhìn khi có kích thước.
      if (needFit.current && box.current.offsetWidth > 0 && bounds.current) { needFit.current = false; m.fitBounds(bounds.current, { padding: [40, 40], maxZoom: 14, animate: false }); }
    });
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đổi sân bay hoặc tập kết quả: vẽ lại ghim và căn khung nhìn (không làm lại khi chỉ đổi lựa chọn).
  const idsKey = items.map((p) => p.id).join(',');
  useEffect(() => {
    const m = map.current; if (!m) return;
    group.current.clearLayers(); markers.current.clear(); lastSel.current = null;
    const c = AIRPORT_COORDS[airport];
    airportMk.current?.remove();
    airportMk.current = L.marker([c.lat, c.lng], { icon: airportIcon(airport), interactive: false, keyboard: false }).addTo(m);
    items.forEach((p) => {
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p, false), title: p.name, keyboard: true, riseOnHover: true });
      mk.on('click', () => { cb.current.onSelect(p.id); });
      mk.addTo(group.current); markers.current.set(p.id, mk);
    });
    const pts = [[c.lat, c.lng], ...items.map((p) => [p.lat, p.lng])];
    bounds.current = L.latLngBounds(pts);
    if (box.current.offsetWidth === 0) needFit.current = true;
    else m.fitBounds(bounds.current, { padding: [40, 40], maxZoom: 14, animate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airport, idsKey]);

  // Đồng bộ ghim đang chọn và thẻ nổi.
  useEffect(() => {
    const m = map.current; if (!m) return;
    // Chỉ đổi biểu tượng của ghim cũ và ghim mới (không dựng lại toàn bộ ghim).
    const byId = new Map(items.map((x) => [x.id, x]));
    [lastSel.current, selectedId].forEach((id) => { const mk = markers.current.get(id); const q = byId.get(id); if (mk && q) mk.setIcon(pinIcon(q, id === selectedId)); });
    lastSel.current = selectedId;
    const p = byId.get(selectedId);
    if (p && markers.current.get(p.id)) {
      popup.current.setLatLng([p.lat, p.lng]).setContent(popupNode(p, (id) => cb.current.onOpen(id))).openOn(m);
    } else popup.current?.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, idsKey]);

  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => map.current?.invalidateSize(), 50);
    return () => clearTimeout(t); // không gọi Leaflet sau khi bản đồ đã bị gỡ
  }, [active]);

  return (
    <div className="stays-map" data-testid="stays-map" role="region" aria-label="Bản đồ nơi nghỉ quanh sân bay">
      <div ref={box} className="map-canvas" />
      <div className="map-overlay">{children}</div>
      <p className="map-note">Vị trí các nơi nghỉ là minh họa (mô phỏng), không phải địa chỉ thật.</p>
    </div>
  );
}
