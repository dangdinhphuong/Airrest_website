import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { EmptyState, ErrorState, Loading as UiLoading } from './ui/states';
import { PageHeader } from './ui/PageHeader';
import { FormField } from './ui/FormField';

export function SimBadge({ children = 'Dữ liệu mô phỏng', tone = 'sim' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({ tone = 'info', title, children, onClose, role }) {
  const Icon = tone === 'error' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : Info;
  return (
    <div className={`notice notice-${tone}`} role={role || (tone === 'error' ? 'alert' : 'status')}>
      <Icon size={18} aria-hidden="true" />
      <div className="notice-body">{title && <strong>{title}</strong>}<div>{children}</div></div>
      {onClose && <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng thông báo">×</button>}
    </div>
  );
}

// Lớp mỏng: các component dưới đây đã chuyển sang components/ui (xem ui/README.md); giữ tên cũ để tab chưa migrate vẫn chạy.
export const Loading = UiLoading;
export const ErrorBox = (p) => <ErrorState {...p} />;
export const EmptyBox = (p) => <EmptyState {...p} />;
export const ScreenTitle = ({ kicker, title, children, actions }) => <PageHeader title={title} kicker={kicker} description={children} actions={actions} />;
export const Field = (p) => <FormField {...p} />;

export function SourceLine({ children }) {
  return <p className="source-line">{children}</p>;
}
