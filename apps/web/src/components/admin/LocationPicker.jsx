import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Modal } from '../ui';
import { useRoute } from '../../lib/route';

// Chọn vị trí kiểu Shopee: bản đồ xem trước nhỏ trong form (tự đặt theo địa chỉ); bấm vào mở hộp "Sửa vị trí" —
// ghim đứng yên ở giữa, kéo/zoom bản đồ để ghim trùng vị trí đúng, bấm "Đồng ý" để lưu.
// Leaflet tải khi cần (import động); ghim là phần tử CSS phủ giữa bản đồ nên không dính lỗi đường dẫn ảnh khi bundle.
const VN = [16.05, 106.3];
const round = (n) => Math.round(n * 1e6) / 1e6;

function Pin({ label }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', zIndex: 500, pointerEvents: 'none', textAlign: 'center' }}>
      {label && <div style={{ background: '#1262e8', color: '#fff', fontWeight: 700, fontSize: 13, padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap', marginBottom: 6 }}>{label}</div>}
      <div style={{ width: 24, height: 24, margin: '0 auto', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: '#1262e8', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }} />
    </div>
  );
}

// Bản đồ OSM; interactive=false chỉ để xem. onMove({lat,lng}) gọi khi người dùng kéo/zoom xong. onReady(map) trả bản đồ cho cha.
function Map({ center, zoom, interactive, onMove, onReady, height, route, airport, hotel, fitKey }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const layers = useRef([]);
  const fitted = useRef('');
  const cb = useRef({ onMove, onReady });
  const [err, setErr] = useState('');
  const [ov, setOv] = useState(0); // đổi khi bản đồ vừa sẵn sàng: vẽ lại lớp phủ
  cb.current = { onMove, onReady };
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        if (dead || !el.current) return;
        const map = L.map(el.current, interactive ? {} : { dragging: false, zoomControl: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false }).setView(center, zoom);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(map);
        if (interactive) map.on('moveend', () => { const c = map.getCenter(); cb.current.onMove?.({ lat: round(c.lat), lng: round(c.lng) }); });
        mapRef.current = map; LRef.current = L; setOv((n) => n + 1);
        cb.current.onReady?.(map);
        setTimeout(() => map.invalidateSize(), 200); // khung vừa hiện trong hộp thoại: tính lại kích thước
      } catch { if (!dead) setErr('Không tải được bản đồ.'); }
    })();
    return () => { dead = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { mapRef.current?.setView(center, zoom); }, [center[0], center[1], zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lớp phủ: đường tới sân bay, ghim sân bay, ghim khách sạn (bản xem trước). Ghim dùng divIcon nên không dính lỗi ảnh khi bundle.
  const pin = (L, color, html) => L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div style="min-width:30px;height:30px;border-radius:15px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;padding:0 6px;white-space:nowrap">${html}</div>` });
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    layers.current.forEach((l) => l.remove()); layers.current = [];
    const add = (l) => { l.addTo(map); layers.current.push(l); };
    if (route?.coords?.length > 1) add(L.polyline(route.coords, { color: '#1262e8', weight: 5, opacity: 0.85, dashArray: route.estimated ? '8 8' : undefined }));
    if (airport) add(L.marker([airport.lat, airport.lng], { icon: pin(L, '#0f172a', `✈ ${airport.iata}`), interactive: false, keyboard: false }));
    if (hotel) add(L.marker([hotel.lat, hotel.lng], { icon: pin(L, '#1262e8', '🏨'), interactive: false, keyboard: false }));
  }, [route, airport?.lat, airport?.lng, hotel?.lat, hotel?.lng, ov]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // khung nhìn ôm cả tuyến (một lần mỗi fitKey, không giật khi kéo bản đồ)
    const L = LRef.current, map = mapRef.current;
    if (!L || !map || !fitKey || !route?.coords?.length || fitted.current === fitKey) return;
    fitted.current = fitKey;
    map.fitBounds(L.latLngBounds(route.coords), { padding: [30, 30], maxZoom: 16 });
  }, [fitKey, route, ov]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <p role="alert" className="field-error">{err}</p>;
  return <div ref={el} style={{ height, width: '100%' }} />;
}

// props: value { lat, lng } | null; onChange; line/city: địa chỉ hiện tại (hiện trong hộp sửa); airport { lat, lng, iata } | null: điểm cuối của tuyến;
// route: tuyến đã tính cho `value` (cha dùng để điền km/phút); fallback: tâm bản đồ khi chưa có vị trí (quanh sân bay).
export default function LocationPicker({ value, onChange, line, city, airport, route, fallback }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const draftRoute = useRoute(open ? draft : null, airport);
  const start = value ?? fallback ?? { lat: VN[0], lng: VN[1] };
  const startZoom = value ? 17 : fallback ? 13 : 5;
  const info = (r) => r && <>Cách sân bay {airport?.iata} khoảng <b>{r.km} km</b>, di chuyển khoảng <b>{r.minutes} phút</b>{r.estimated ? ' (ước lượng theo đường chim bay)' : ''}</>;
  return (
    <>
      <button type="button" onClick={() => { setDraft(value); setOpen(true); }} data-testid="location-preview"
        aria-label={value ? 'Vị trí đã chọn, bấm để chỉnh' : 'Chọn vị trí trên bản đồ'}
        style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: '1px solid #d6dbe4', borderRadius: 8, overflow: 'hidden', background: '#eef1f6', cursor: 'pointer', textAlign: 'left' }}>
        {value ? (
          <>
            <div style={{ pointerEvents: 'none' }}><Map center={[value.lat, value.lng]} zoom={16} height={170} route={route} airport={airport} hotel={value} fitKey={`${value.lat},${value.lng},${airport?.iata}`} /></div>
            <span style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 600, background: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600, boxShadow: '0 1px 3px rgba(0,0,0,.25)' }}>Bấm để chỉnh vị trí</span>
          </>
        ) : (
          <span style={{ display: 'flex', height: 110, alignItems: 'center', justifyContent: 'center', gap: 8, color: '#475569', fontWeight: 600, padding: '0 12px', textAlign: 'center' }}><MapPin size={18} aria-hidden="true" /> Chưa có vị trí. Nhập địa chỉ rồi rời ô để tự đặt, hoặc bấm để chọn trên bản đồ.</span>
        )}
      </button>
      {value && <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }} data-testid="ch-pos">Tọa độ: {value.lat}, {value.lng}{route ? <> · {info(route)}</> : null}</p>}
      <Modal open={open} onClose={() => setOpen(false)} title="Sửa vị trí" size="lg">
        <p className="muted" style={{ margin: '0 0 8px' }}>{[line, city].filter(Boolean).join(', ') || 'Kéo bản đồ để đặt ghim đúng vị trí khách sạn.'}</p>
        <div style={{ position: 'relative', border: '1px solid #d6dbe4', borderRadius: 8, overflow: 'hidden' }}>
          <Map center={[start.lat, start.lng]} zoom={startZoom} interactive height={380} onMove={setDraft} route={draftRoute} airport={airport} fitKey={value ? 'modal' : ''} />
          <Pin label="Khách sạn ở đây" />
        </div>
        <p className="muted" role="status" style={{ margin: '6px 0 0' }} data-testid="location-info">{draftRoute ? info(draftRoute) : airport ? 'Kéo bản đồ để đặt ghim; đường tới sân bay sẽ hiện ở đây.' : ''}</p>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" disabled={!draft} onClick={() => { onChange(draft); setOpen(false); }} data-testid="location-ok">Đồng ý</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>Huỷ</button>
        </div>
      </Modal>
    </>
  );
}
