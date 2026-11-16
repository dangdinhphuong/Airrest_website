import React from 'react';
import { Tag } from '../ui/StatusBadge';
import { Tabs } from '../ui/Tabs';

// Còn lại cho các tab Quản trị đang dùng: Pill/SubTabs là lớp mỏng sang components/ui (xem ui/README.md); gỡ khi admin chuyển xong.
export const Pill = Tag;
export const SubTabs = ({ tabs, value, onChange, label }) => <Tabs tabs={tabs.map(([id, text]) => ({ id, label: text }))} value={value} onChange={onChange} label={label} />;
export const Kpi = ({ items }) => <dl className="stat-grid">{items.map(([l, v, t]) => <div key={l} data-testid={t}><dt>{l}</dt><dd>{v}</dd></div>)}</dl>;
