import React, { useState } from 'react';
import { ConfirmDialog } from './Modal';

// Nút mở ConfirmDialog (thay ConfirmButton/ReasonAction cũ). `ask` = nội dung hỏi; `reason` = { label, minLength, placeholder } để bắt nhập lý do.
// testid: nút mở = testid (không lý do) hoặc `${testid}-open` (có lý do); hộp = `${testid}-dlg` (không lý do) hoặc testid (có lý do) -> `-confirm`, `-cancel`, `-reason`.
export function ConfirmAction({ label, ask, title, confirmLabel, onConfirm, disabled, tone, testid, reason, className = 'btn btn-sm' }) {
  const [open, setOpen] = useState(false);
  const danger = tone === 'danger';
  return (
    <>
      <button type="button" className={`${className} ${danger ? 'btn-danger' : ''}`} disabled={disabled} onClick={() => setOpen(true)} data-testid={testid && (reason ? `${testid}-open` : testid)}>{label}</button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={onConfirm} title={title || label} description={ask} confirmLabel={confirmLabel || label}
        variant={danger ? 'danger' : 'info'} reason={reason} testid={testid && (reason ? testid : `${testid}-dlg`)} />
    </>
  );
}
