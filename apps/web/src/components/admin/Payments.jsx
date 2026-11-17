import React, { useState } from 'react';
import { DataTable, PageHeader, StatusBadge, Tabs, Tag, Toolbar } from '../ui';
import { money } from '../../lib/time';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { reconcile, retryRefund } from '../../data/admin';
import { Act, cols, dt, pagedProps, shortId, useRun, usePaged } from './kit';
import Select from '../Select';

const TONE = { SUCCEEDED: 'ok', COMPLETED: 'ok', PENDING: 'warn', FAILED: 'error', MANUAL_REQUIRED: 'error' };
const GATE = { SEPAY: 'SePay', VNPAY: 'VNPay (cũ)', MOMO: 'MoMo (cũ)' }; // VNPAY/MOMO chỉ để hiển thị giao dịch cũ
const MAP = Object.fromEntries(Object.entries(TONE).map(([k, t]) => [k, [k, t]]));
const St = ({ s }) => <StatusBadge status={s} map={MAP} />;

export default function Payments() {
  const { state } = useApp();
  const canManage = hasPerm(state.session, PERM.ADMIN_PAYMENT_MANAGE);
  const [tab, setTab] = useState('payments');
  const [result, setResult] = useState(null);
  const path = tab === 'refunds' ? '/refunds' : '/payments';
  const [gate, setGate] = useState('');
  const p = usePaged(path, { ...(tab === 'anomaly' && { anomaly: 'true' }), ...(gate && { method: gate }) });
  const { run, node } = useRun();
  const doReconcile = async () => { const r = await run(reconcile, 'Đã chạy đối soát.'); if (r.ok) { setResult(r.r); p.reload(); } return r; };
  const doRetry = async (id) => { const r = await run(() => retryRefund(id), 'Đã gửi thử lại lệnh hoàn.'); if (r.ok) p.reload(); return r; };
  return (
    <>
      <PageHeader title="Thanh toán" description="Giao dịch cổng thanh toán và lệnh hoàn"
        actions={canManage && <Act label="Đối soát ngay" confirm="Chạy đối soát: truy vấn giao dịch treo, hết hạn đơn chưa trả, xử lý lệnh hoàn đến hạn?" onDo={doReconcile} testid="reconcile" />}>
        <Tabs label="Loại" value={tab} onChange={setTab} tabs={[{ id: 'payments', label: 'Giao dịch' }, { id: 'anomaly', label: 'Bất thường' }, { id: 'refunds', label: 'Lệnh hoàn' }]} />
      </PageHeader>
      <Toolbar label="Lọc"><label>Cổng <Select value={gate} onChange={(e) => setGate(e.target.value)} data-testid="gate-filter"><option value="">Tất cả</option><option value="SEPAY">SePay</option></Select></label></Toolbar>
      {result && <p className="muted" data-testid="reconcile-result">Kết quả: truy vấn {result.queried}, ghi nhận thành công {result.settled}, thất bại {result.failed}, đơn hết hạn {result.expiredBookings}, lệnh hoàn xử lý {result.refundsProcessed}.</p>}
      {node}
      <DataTable empty={tab === 'anomaly' ? 'Không có giao dịch bất thường.' : 'Chưa có dữ liệu.'} {...pagedProps(p)}
        columns={tab === 'refunds'
          ? cols([['Mã', (r) => shortId(r.id)], ['Đơn', (r) => shortId(r.bookingId)], ['Cổng', (r) => GATE[r.method] ?? r.method ?? '—'], ['Số tiền', (r) => money(r.amountVnd)], ['Lý do', (r) => r.reasonCode], ['Trạng thái', (r) => <St s={r.status} />], ['Lần thử', (r) => r.attempts?.length ?? 0], ['Hạn thử kế', (r) => dt(r.dueAt)],
            ['', (r) => r.status === 'MANUAL_REQUIRED' && canManage ? <Act label="Thử lại" confirm="Thử lại hoàn tiền?" onDo={() => doRetry(r.id)} testid="retry" /> : null]])
          : cols([['Mã', (r) => shortId(r.id)], ['Đơn', (r) => shortId(r.bookingId)], ['Cổng', (r) => GATE[r.method] ?? r.method], ['Số tiền', (r) => money(r.amountVnd)], ['Trạng thái', (r) => <St s={r.status} />], ['Bất thường', (r) => r.anomaly ? <Tag tone="error">{r.anomaly.kind}</Tag> : '—'], ['Thanh toán lúc', (r) => dt(r.paidAt)], ['Tạo lúc', (r) => dt(r.createdAt)]])} />
    </>
  );
}
