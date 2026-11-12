import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Pill, SubTabs } from '../partner/ui';
import { money } from '../../lib/time';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { reconcile, retryRefund } from '../../data/admin';
import { Act, PagedView, Table, dt, shortId, useRun, usePaged } from './kit';

const TONE = { SUCCEEDED: 'ok', COMPLETED: 'ok', PENDING: 'warn', FAILED: 'error', MANUAL_REQUIRED: 'error' };
const St = ({ s }) => <Pill tone={TONE[s] || 'neutral'}>{s}</Pill>;

export default function Payments() {
  const { state } = useApp();
  const canManage = hasPerm(state.session, PERM.ADMIN_PAYMENT_MANAGE);
  const [tab, setTab] = useState('payments');
  const [result, setResult] = useState(null);
  const path = tab === 'refunds' ? '/refunds' : '/payments';
  const p = usePaged(path, tab === 'anomaly' ? { anomaly: 'true' } : {});
  const { run, node } = useRun();
  const doReconcile = async () => { const r = await run(reconcile, 'Đã chạy đối soát.'); if (r.ok) { setResult(r.r); p.reload(); } return r; };
  const doRetry = async (id) => { const r = await run(() => retryRefund(id), 'Đã gửi thử lại lệnh hoàn.'); if (r.ok) p.reload(); return r; };
  return (
    <>
      <ScreenTitle title="Thanh toán">Giao dịch cổng thanh toán và lệnh hoàn</ScreenTitle>
      <SubTabs label="Loại" value={tab} onChange={setTab} tabs={[['payments', 'Giao dịch'], ['anomaly', 'Bất thường'], ['refunds', 'Lệnh hoàn']]} />
      {canManage && <p><Act label="Đối soát ngay" confirm="Chạy đối soát: truy vấn giao dịch treo, hết hạn đơn chưa trả, xử lý lệnh hoàn đến hạn?" onDo={doReconcile} testid="reconcile" /></p>}
      {result && <p className="muted" data-testid="reconcile-result">Kết quả: truy vấn {result.queried}, ghi nhận thành công {result.settled}, thất bại {result.failed}, đơn hết hạn {result.expiredBookings}, lệnh hoàn xử lý {result.refundsProcessed}.</p>}
      {node}
      <PagedView p={p} empty={tab === 'anomaly' ? 'Không có giao dịch bất thường.' : 'Chưa có dữ liệu.'}>
        {tab === 'refunds'
          ? <Table rows={p.items} cols={[['Mã', (r) => shortId(r.id)], ['Đơn', (r) => shortId(r.bookingId)], ['Số tiền', (r) => money(r.amountVnd)], ['Lý do', (r) => r.reasonCode], ['Trạng thái', (r) => <St s={r.status} />], ['Lần thử', (r) => r.attempts?.length ?? 0], ['Hạn thử kế', (r) => dt(r.dueAt)],
            ['', (r) => r.status === 'MANUAL_REQUIRED' && canManage ? <Act label="Thử lại" confirm="Thử lại hoàn tiền?" onDo={() => doRetry(r.id)} testid="retry" /> : null]]} />
          : <Table rows={p.items} cols={[['Mã', (r) => shortId(r.id)], ['Đơn', (r) => shortId(r.bookingId)], ['Phương thức', (r) => r.method], ['Số tiền', (r) => money(r.amountVnd)], ['Trạng thái', (r) => <St s={r.status} />], ['Bất thường', (r) => r.anomaly ? <Pill tone="error">{r.anomaly.kind}</Pill> : '—'], ['Thanh toán lúc', (r) => dt(r.paidAt)], ['Tạo lúc', (r) => dt(r.createdAt)]]} />}
      </PagedView>
    </>
  );
}
