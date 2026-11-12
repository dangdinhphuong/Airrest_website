import React, { useState } from 'react';

export const Pill = ({ tone = 'neutral', children, ...r }) => <span className={`pill pill-${tone}`} {...r}>{children}</span>;
export const BOOKING_STATUS = { pending: ['Chờ xác nhận', 'warn'], confirmed: ['Đã xác nhận', 'ok'], rejected: ['Đã từ chối', 'error'] };
export const PROFILE_TONE = { Draft: 'neutral', PendingReview: 'warn', NeedsInfo: 'warn', Active: 'ok', Rejected: 'error', Suspended: 'error', Deactivated: 'neutral' };

export function SubTabs({ tabs, value, onChange, label }) {
  return (
    <div className="subtabs" role="tablist" aria-label={label}>
      {tabs.map(([id, text]) => <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)} data-testid={`sub-${id}`}>{text}</button>)}
    </div>
  );
}

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="pager" role="navigation" aria-label="Phân trang">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="page-prev">Trước</button>
      <span>Trang {page}/{pages}</span>
      <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid="page-next">Sau</button>
    </div>
  );
}

// Hỏi lý do trước một hành động có hệ quả (khóa, từ chối, vô hiệu hóa…). Không dùng hộp thoại hệ thống.
export function ReasonAction({ label, confirmLabel = 'Xác nhận', placeholder = 'Lý do', onSubmit, testid, tone, disabled, options }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(options?.[0] || ''); const [err, setErr] = useState('');
  if (!open) return <button type="button" className={`btn btn-sm ${tone === 'danger' ? 'btn-danger' : ''}`} onClick={() => setOpen(true)} disabled={disabled} data-testid={testid ? `${testid}-open` : undefined}>{label}</button>;
  const go = () => { const r = onSubmit(reason); if (r && r.ok === false) setErr(r.error || 'Không thực hiện được.'); else { setOpen(false); setErr(''); } };
  return (
    <span className="inline-form">
      {options
        ? <select aria-label={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} data-testid={testid ? `${testid}-reason` : undefined}>{options.map((o) => <option key={o}>{o}</option>)}</select>
        : <input aria-label={placeholder} placeholder={placeholder} value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} data-testid={testid ? `${testid}-reason` : undefined} />}
      <button type="button" className="btn btn-sm btn-primary" onClick={go} data-testid={testid ? `${testid}-confirm` : undefined}>{confirmLabel}</button>
      <button type="button" className="link-btn" onClick={() => { setOpen(false); setErr(''); }}>Huỷ</button>
      {err && <small className="field-error block" role="alert" data-testid={testid ? `${testid}-error` : undefined}>{err}</small>}
    </span>
  );
}
export const Kpi = ({ items }) => <dl className="stat-grid">{items.map(([l, v, t]) => <div key={l} data-testid={t}><dt>{l}</dt><dd>{v}</dd></div>)}</dl>;
