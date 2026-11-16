import React from 'react';
import { AlertTriangle, Loader2, RefreshCw, SearchX } from 'lucide-react';

export function Loading({ label = 'Đang tải…' }) {
  return <div className="loading" role="status" aria-live="polite"><Loader2 className="spin" size={22} aria-hidden="true" /> {label}</div>;
}

// Trạng thái rỗng (xlvm EmptyState): icon, tiêu đề, mô tả, vùng hành động.
export function EmptyState({ title, children, actions, icon: Icon = SearchX, testid }) {
  return (
    <div className="state-box" role="status" data-testid={testid}>
      <Icon size={28} aria-hidden="true" />
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {actions && <div className="row-actions">{actions}</div>}
    </div>
  );
}

// Trạng thái lỗi (xlvm ErrorState) có nút "Thử lại".
export function ErrorState({ title = 'Không tải được dữ liệu', children, onRetry }) {
  return (
    <div className="state-box state-error" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Thử lại</button>}
    </div>
  );
}
