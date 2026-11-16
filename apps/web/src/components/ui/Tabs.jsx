import React from 'react';

// Tab trong trang (xlvm CountTabs): tabs = [{ id, label, count? }]; testid mỗi tab là `sub-<id>` (giữ như SubTabs cũ).
export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="subtabs ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)} data-testid={`sub-${t.id}`}>
          {t.label}{t.count != null && <span className="ui-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
