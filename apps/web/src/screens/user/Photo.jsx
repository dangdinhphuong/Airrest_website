import React, { useState } from 'react';
import { Hotel } from 'lucide-react';

// Ảnh khách sạn/phòng do khách sạn tải lên. Chưa có ảnh hoặc ảnh lỗi thì hiện khung trống (không dùng ảnh mẫu). Cha cần `relative` + kích thước.
export default function Photo({ src, alt = '', className = '', size = 28 }) {
  const [bad, setBad] = useState(false);
  if (src && !bad) return <img src={src} alt={alt} loading="lazy" onError={() => setBad(true)} className={`tw:absolute tw:inset-0 tw:size-full tw:object-cover ${className}`} />;
  return <span role="img" aria-label={alt ? `${alt} (chưa có ảnh)` : 'Chưa có ảnh'} className={`tw:absolute tw:inset-0 tw:grid tw:place-items-center tw:bg-slate-100 tw:text-slate-300 ${className}`}><Hotel size={size} /></span>;
}
