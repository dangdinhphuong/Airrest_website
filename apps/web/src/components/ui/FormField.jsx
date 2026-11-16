import React from 'react';

// Trường form: nhãn + điều khiển (children) + gợi ý/lỗi. Truyền `id` trùng id của điều khiển.
export function FormField({ id, label, hint, error, required, children }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}{required && <span className="ui-req" aria-hidden="true"> *</span>}</label>
      {children}
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && <small id={`${id}-err`} className="field-error" role="alert">{error}</small>}
    </div>
  );
}
