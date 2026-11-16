import React, { useState } from 'react';
import { Notice } from '../Common';
import { DataTable, PageHeader } from '../ui';
import { Filters, Json, UUID_RE, cols, dt, pagedProps, usePaged } from './kit';

export default function Audit() {
  const [q, setQ] = useState({});
  const [err, setErr] = useState('');
  const p = usePaged('/audit-logs', q);
  const apply = (o) => {
    const bad = [['actorId', 'Người thực hiện'], ['hotelId', 'Mã khách sạn (UUID)'], ['bookingId', 'Mã đơn (UUID)']].find(([k]) => o[k] && !UUID_RE.test(o[k]));
    if (bad) { setErr(`${bad[1]} phải là ID dạng UUID (ví dụ 0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b). Giá trị bạn nhập chưa đúng định dạng nên chưa lọc.`); return; }
    setErr(''); setQ(o);
  };
  return (
    <>
      <PageHeader title="Nhật ký" description="Chỉ đọc, mới nhất trước" />
      <Filters fields={[['entityType', 'Loại đối tượng'], ['entityId', 'Mã đối tượng'], ['actorId', 'Người thực hiện: ID tài khoản (UUID)'], ['action', 'Hành động (vd HOTEL.APPROVE)'], ['hotelId', 'Mã khách sạn'], ['bookingId', 'Mã đơn'], ['from', 'Từ ngày', 'date'], ['to', 'Đến ngày', 'date']]} onApply={apply} />
      {err && <Notice tone="error"><span data-testid="audit-filter-err">{err}</span></Notice>}
      <DataTable empty="Không có bản ghi nhật ký khớp bộ lọc." {...pagedProps(p)}
        columns={cols([['Lúc', (r) => dt(r.ts)], ['Người thực hiện', (r) => `${r.actor?.type || ''} ${r.actor?.name || r.actor?.id?.slice(0, 8) || ''}`], ['Hành động', (r) => r.action], ['Đối tượng', (r) => `${r.entity?.type} ${String(r.entity?.id || '').slice(0, 8)}`], ['Lý do', (r) => r.reasonNote || '—'],
          ['Chi tiết', (r) => (r.before || r.after) ? <details><summary>Xem</summary>{r.before && <><small>Trước</small><Json v={r.before} /></>}{r.after && <><small>Sau</small><Json v={r.after} /></>}</details> : '—']])} />
    </>
  );
}
