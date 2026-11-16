import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Đường dẫn vị trí: AIRREST › Cổng › Nhóm › Chức năng. Mục trùng nhãn liền trước bị bỏ; < 768px rút thành "‹ cấp cha" (CSS).
export function Breadcrumb({ items }) {
  const list = (items || []).filter((t, i, a) => t && t !== a[i - 1]);
  if (!list.length) return null;
  const parent = list.length > 1 ? list[list.length - 2] : null;
  return (
    <nav className="crumb sx-crumb" aria-label="Đường dẫn vị trí" data-testid="breadcrumb">
      {parent && <span className="sx-crumb-back"><ChevronLeft size={14} aria-hidden="true" />{parent}</span>}
      <ol>{list.map((t, i) => <li key={`${i}-${t}`} aria-current={i === list.length - 1 ? 'page' : undefined}>{i > 0 && <ChevronRight size={14} aria-hidden="true" />}<span>{t}</span></li>)}</ol>
    </nav>
  );
}
