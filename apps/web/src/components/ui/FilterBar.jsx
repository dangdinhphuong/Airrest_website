import React from 'react';

// Thanh lọc (xlvm ResponsiveFiltersBar): các ô lọc là children; Enter/nút "Lọc" gọi onApply, "Đặt lại" gọi onReset (bỏ nút nếu không truyền).
// Ô lọc nên dùng input/Select sẵn có (class filter-input để giãn đều).
export function FilterBar({ children, onApply, onReset, applyLabel = 'Lọc', resetLabel = 'Đặt lại', actions, testid = 'filters' }) {
  return (
    <form className="ui-filterbar" role="search" data-testid={testid} onSubmit={(e) => { e.preventDefault(); onApply?.(); }}>
      <div className="ui-filterbar-fields">{children}</div>
      <div className="ui-filterbar-actions">
        {onApply && <button type="submit" className="btn btn-sm btn-primary" data-testid="f-apply">{applyLabel}</button>}
        {onReset && <button type="button" className="btn btn-sm" onClick={onReset} data-testid="f-reset">{resetLabel}</button>}
        {actions}
      </div>
    </form>
  );
}
