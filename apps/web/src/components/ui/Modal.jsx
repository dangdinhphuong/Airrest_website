import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Chồng hộp đang mở: chỉ hộp trên cùng xử lý Esc/Tab (hộp lồng nhau, vd. xác nhận xóa ảnh trong form).
const STACK = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Hộp thoại (xlvm AppModal): portal, Esc/bấm nền đóng, giữ Tab trong hộp, trả focus khi đóng. size: sm | md | lg.
export function Modal({ open, onClose, title, size = 'md', footer, children, locked, testid }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const box = ref.current;
    STACK.push(box);
    (box.querySelector('[data-autofocus]') || box.querySelector(FOCUSABLE) || box).focus();
    const onKey = (e) => {
      if (STACK[STACK.length - 1] !== box) return;
      if (e.key === 'Escape') { e.stopPropagation(); if (!locked) onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = [...box.querySelectorAll(FOCUSABLE)];
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); STACK.splice(STACK.indexOf(box), 1); prev?.focus?.(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return createPortal(
    <div className="ui-modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
      <div ref={ref} className={`ui-modal ui-modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testid}>
        <div className="ui-modal-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-btn" onClick={onClose} disabled={locked} aria-label="Đóng">{<X size={18} aria-hidden="true" />}</button></div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Hộp xác nhận (xlvm ConfirmDialog): variant info | warning | danger; `reason` = { label, minLength } để bắt nhập lý do.
// onConfirm(reason) có thể async; hộp mở tới khi xong, lỗi ném ra thì giữ mở. Nhãn nút là động từ cụ thể, không "OK".
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', variant = 'info', reason, busy: busyIn, testid }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [run, setRun] = useState(false);
  useEffect(() => { if (open) { setText(''); setErr(''); setRun(false); } }, [open]);
  const busy = busyIn || run;
  const min = reason?.minLength ?? 3;
  const go = async () => {
    if (reason && text.trim().length < min) { setErr(`${reason.label || 'Lý do'} cần ít nhất ${min} ký tự.`); return; }
    setRun(true);
    try { await onConfirm(reason ? text.trim() : undefined); onClose(); } catch { /* giữ hộp mở; nơi gọi tự hiện lỗi */ } finally { setRun(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" locked={busy} testid={testid}
      footer={<>
        <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy} data-autofocus={variant === 'danger' ? '' : undefined} data-testid={testid && `${testid}-cancel`}>{cancelLabel}</button>
        <button type="button" className={`btn btn-sm ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={go} disabled={busy} data-testid={testid && `${testid}-confirm`}>{busy ? 'Đang xử lý…' : confirmLabel}</button>
      </>}>
      {description && <p>{description}</p>}
      {reason && (
        <div className={`field ${err ? 'has-error' : ''}`}>
          <label htmlFor="ui-confirm-reason">{reason.label || 'Lý do'}</label>
          <textarea id="ui-confirm-reason" rows={3} value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} placeholder={reason.placeholder} data-testid={testid && `${testid}-reason`} />
          {err && <small className="field-error" role="alert">{err}</small>}
        </div>
      )}
    </Modal>
  );
}
