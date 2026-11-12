import React, { useEffect, useState } from 'react';
import { apiBase } from '../lib/api';

// Kiểm tra GET /health một lần khi tải trang; chỉ hiện dải cảnh báo khi không kết nối được.
export default function ApiBanner() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${apiBase}/health`, { signal: ctl.signal }).then((r) => { if (!r.ok) setDown(true); }).catch((e) => { if (e.name !== 'AbortError') setDown(true); });
    return () => ctl.abort();
  }, []);
  if (!down) return null;
  return (
    <div role="alert" style={{ position: 'sticky', top: 0, zIndex: 200, background: '#fef2f2', color: '#991b1b', borderBottom: '1px solid #fecaca', padding: '8px 16px', fontSize: 13, textAlign: 'center' }}>
      Không kết nối được máy chủ ({apiBase}). Kiểm tra backend đang chạy và <code>VITE_API_BASE_URL</code>, <code>CORS_ORIGINS</code>.
    </div>
  );
}
