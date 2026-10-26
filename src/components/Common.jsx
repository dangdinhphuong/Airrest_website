import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, SearchX } from 'lucide-react';
import { getFailNext } from '../mock/service';

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

export function Loading({ label = 'Đang tải…' }) {
  return <div className="loading" role="status" aria-live="polite"><Loader2 className="spin" size={22} aria-hidden="true" /> {label}</div>;
}

export function ErrorBox({ title = 'Không tải được dữ liệu', children, onRetry }) {
  return (
    <div className="state-box state-error" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {getFailNext() && <p className="sim-hint" data-testid="sim-fail-hint">Lỗi này do “Mô phỏng lỗi dịch vụ dữ liệu” đang bật trong Công cụ mô phỏng (góc dưới bên trái). Bỏ chọn mục đó rồi bấm Thử lại.</p>}
      {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Thử lại</button>}
    </div>
  );
}

export function EmptyBox({ title, children, actions }) {
  return (
    <div className="state-box" role="status">
      <SearchX size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {actions && <div className="row-actions">{actions}</div>}
    </div>
  );
}

// Đưa focus về tiêu đề khi đổi màn hình (hỗ trợ bàn phím và trình đọc màn hình).
export function ScreenTitle({ kicker, title, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, []);
  return (
    <div className="screen-head">
      <h1 ref={ref} tabIndex={-1}>{title}</h1>
      {kicker && <span className="kicker kicker-sub">{kicker}</span>}
      {children && <p className="lead">{children}</p>}
    </div>
  );
}

export function Field({ id, label, hint, error, children }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && <small id={`${id}-err`} className="field-error" role="alert">{error}</small>}
    </div>
  );
}

export function SourceLine({ children }) {
  return <p className="source-line">{children}</p>;
}
