import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Breadcrumb } from '../shell/Breadcrumb';

// Banner cấp trang (xlvm PageHeader): breadcrumb (tùy chọn) · h1 · mô tả · vùng hành động bên phải · children (dải tóm tắt, tab…).
// Breadcrumb của cổng nhân sự đã do StaffShell vẽ; chỉ truyền `breadcrumbs` cho trang nhiều bước.
// Focus về h1 khi mở màn (trợ năng, như ScreenTitle cũ).
export function PageHeader({ title, description, kicker, breadcrumbs, back, actions, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, []);
  return (
    <header className="ui-pagehead">
      {(breadcrumbs?.length > 0 || back) && (
        <div className="ui-pagehead-top">
          <Breadcrumb items={breadcrumbs || []} />
          {back && <button type="button" className="btn btn-ghost btn-sm" onClick={back.onClick} data-testid="back"><ArrowLeft size={16} aria-hidden="true" /> {back.label || 'Quay lại danh sách'}</button>}
        </div>
      )}
      <div className="ui-pagehead-main">
        <div className="ui-pagehead-text">
          <h1 ref={ref} tabIndex={-1}>{title}</h1>
          {kicker && <span className="kicker kicker-sub">{kicker}</span>}
          {description && <p className="ui-pagehead-desc">{description}</p>}
        </div>
        {actions && <div className="ui-pagehead-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
