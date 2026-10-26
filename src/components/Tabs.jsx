import React from 'react';

// Dải tab dùng chung cho khu vực khách sạn và quản trị (role=tablist).
export default function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs partner-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)} data-testid={`tab-${t.id}`}>
          {t.icon}{t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
