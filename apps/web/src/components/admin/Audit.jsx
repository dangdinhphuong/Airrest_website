import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Filters, Json, PagedView, Table, dt, usePaged } from './kit';

export default function Audit() {
  const [q, setQ] = useState({});
  const p = usePaged('/audit-logs', q);
  return (
    <>
      <ScreenTitle title="Nhật ký" kicker="Chỉ đọc, mới nhất trước" />
      <Filters fields={[['entityType', 'Loại đối tượng'], ['entityId', 'Mã đối tượng'], ['actorId', 'Mã người thực hiện'], ['action', 'Hành động (vd HOTEL.APPROVE)'], ['hotelId', 'Mã khách sạn'], ['bookingId', 'Mã đơn'], ['from', 'Từ ngày', 'date'], ['to', 'Đến ngày', 'date']]} onApply={setQ} />
      <PagedView p={p} empty="Không có bản ghi nhật ký khớp bộ lọc.">
        <Table cols={[['Lúc', (r) => dt(r.ts)], ['Người thực hiện', (r) => `${r.actor?.type || ''} ${r.actor?.name || r.actor?.id?.slice(0, 8) || ''}`], ['Hành động', (r) => r.action], ['Đối tượng', (r) => `${r.entity?.type} ${String(r.entity?.id || '').slice(0, 8)}`], ['Lý do', (r) => r.reasonNote || '—'],
          ['Chi tiết', (r) => (r.before || r.after) ? <details><summary>Xem</summary>{r.before && <><small>Trước</small><Json v={r.before} /></>}{r.after && <><small>Sau</small><Json v={r.after} /></>}</details> : '—']]} rows={p.items} />
      </PagedView>
    </>
  );
}
