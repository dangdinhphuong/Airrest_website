import React from 'react';

// Hiện khi VITE_API_BASE_URL thiếu hoặc không phải URL http(s) hợp lệ.
export default function ConfigError() {
  return (
    <main role="alert" style={{ maxWidth: 640, margin: '12vh auto', padding: 24, fontFamily: 'Be Vietnam Pro, system-ui, sans-serif', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 24, color: '#062253' }}>Chưa cấu hình địa chỉ máy chủ</h1>
      <p>Giao diện cần biến <code>VITE_API_BASE_URL</code> trỏ tới domain backend, ví dụ <code>http://localhost:3000</code>.</p>
      <ol>
        <li>Sao chép <code>apps/web/.env.example</code> thành <code>apps/web/.env</code>.</li>
        <li>Điền đúng URL backend vào <code>VITE_API_BASE_URL</code> (bắt đầu bằng <code>http://</code> hoặc <code>https://</code>).</li>
        <li>Khởi động lại dev server (hoặc build lại khi triển khai).</li>
      </ol>
      <p>Giá trị hiện tại: <code>{String(import.meta.env.VITE_API_BASE_URL ?? '(chưa đặt)')}</code></p>
    </main>
  );
}
