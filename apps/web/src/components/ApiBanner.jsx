import React, { useEffect, useState } from 'react';
import { apiBase } from '../lib/api';

// Kiểm tra GET /health một lần khi tải trang. Lỗi thì phân biệt hai nguyên nhân:
//  - 'cors': máy chủ có trả lời (thăm dò no-cors thành công) nhưng chặn origin của trang này -> sửa CORS_ORIGINS của API;
//  - 'down': không tới được máy chủ (tắt, đang khởi động ở gói Free, sai VITE_API_BASE_URL).
export default function ApiBanner() {
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${apiBase}/health`, { signal: ctl.signal })
      .then((r) => { if (!r.ok) setProblem('down'); })
      .catch(async (e) => {
        if (e.name === 'AbortError') return;
        const reachable = await fetch(`${apiBase}/health`, { mode: 'no-cors', signal: ctl.signal }).then(() => true, () => false);
        setProblem(reachable ? 'cors' : 'down');
      });
    return () => ctl.abort();
  }, []);
  if (!problem) return null;
  const origin = window.location.origin;
  return (
    <div role="alert" style={{ position: 'sticky', top: 0, zIndex: 200, background: '#fef2f2', color: '#991b1b', borderBottom: '1px solid #fecaca', padding: '8px 16px', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
      {problem === 'cors' ? (
        <>API đang chạy nhưng chặn trang này. Thêm <code>{origin}</code> vào <code>CORS_ORIGINS</code> của API rồi deploy lại. </>
      ) : (
        <>Không kết nối được máy chủ. Kiểm tra backend đang chạy (gói Free có thể đang khởi động, chờ khoảng 1 phút rồi tải lại). </>
      )}
      <span style={{ opacity: 0.85 }}>[<code>VITE_API_BASE_URL</code> = <code>{apiBase}</code> · origin trang = <code>{origin}</code>]</span>
    </div>
  );
}
