import React, { useState } from 'react';
import * as H from '../../data/hotel';
import { DataTable, Loading, Modal, PageHeader, Tag } from '../ui';
import { fmtDT, usePaged } from './kit';
import { money } from '../../lib/time';
import { describeError } from '../../lib/api';

const KIND = { ROOM: 'Tiền phòng', ADJUSTMENT: 'Điều chỉnh' };

// /api/v1/hotel/payouts: các kỳ chi trả đã khóa/đã trả của khách sạn + dòng chi tiết (chỉ đọc).
export default function Payouts() {
  const list = usePaged((cursor) => H.listPayouts({ cursor }), []);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const toggle = async (id) => {
    setOpen(id); setDetail(null);
    try { setDetail(await H.getPayout(id)); } catch (e) { setDetail({ error: describeError(e) }); }
  };
  const columns = [
    { key: 'period', header: 'Kỳ', render: (p) => <strong>{p.period}</strong> },
    { key: 'gross', header: 'Giá hợp đồng', align: 'right', render: (p) => money(p.grossVnd) },
    { key: 'comm', header: 'Hoa hồng', align: 'right', render: (p) => money(p.commissionVnd) },
    { key: 'net', header: 'Số nhận', align: 'right', render: (p) => <strong>{money(p.netVnd)}</strong> },
    { key: 'status', header: 'Trạng thái', render: (p) => (p.status === 'PAID' ? <Tag tone="ok">Đã trả</Tag> : <Tag tone="warn">Đã chốt</Tag>) },
    { key: 'paid', header: 'Ngày trả', render: (p) => `${fmtDT(p.paidAt)}${p.paymentRef ? ` (${p.paymentRef})` : ''}` },
    { key: 'act', header: '', render: (p) => <button type="button" className="btn btn-sm" onClick={() => toggle(p.id)} data-testid="po-toggle">Chi tiết</button> },
  ];
  const cur = list.items.find((p) => p.id === open);
  return (
    <>
      <PageHeader title="Chi trả" description="Các kỳ Airrest chi trả cho khách sạn (đã chốt). Số nhận = giá hợp đồng trừ hoa hồng." />
      <DataTable columns={columns} rows={list.items} rowTestid="po-row" loading={list.loading} error={list.err && describeError(list.err)} onRetry={list.reload}
        empty="Chưa có kỳ chi trả nào được chốt." hasMore={list.next != null} onLoadMore={list.loadMore} loadingMore={list.more} />
      <Modal open={!!open} onClose={() => setOpen(null)} title={cur ? `Kỳ chi trả ${cur.period}` : 'Chi tiết kỳ chi trả'} size="lg">
        <div data-testid="po-detail">
          {!detail ? <Loading /> : detail.error ? <p className="field-error" role="alert">{detail.error}</p> : (
            <DataTable rows={detail.lines} columns={[
              { key: 'kind', header: 'Loại', render: (l) => KIND[l.kind] || l.kind },
              { key: 'code', header: 'Đơn', render: (l) => l.bookingCode || '' },
              { key: 'gross', header: 'Giá hợp đồng', align: 'right', render: (l) => money(l.grossVnd) },
              { key: 'comm', header: 'Hoa hồng', align: 'right', render: (l) => money(l.commissionVnd) },
              { key: 'net', header: 'Số nhận', align: 'right', render: (l) => money(l.netVnd) },
              { key: 'memo', header: 'Ghi chú', render: (l) => l.memo || '' },
            ]} empty="Kỳ này chưa có dòng chi tiết." />
          )}
        </div>
      </Modal>
    </>
  );
}
