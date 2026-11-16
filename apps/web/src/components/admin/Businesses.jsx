import React, { useState } from 'react';
import { Notice } from '../Common';
import { DataTable, PageHeader, StatusBadge } from '../ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { adminApi } from '../../data/admin';
import { Act, Filters, LoadView, cols, dt, pagedProps, useLoad, usePaged, useRun } from './kit';
import { HOTEL_ST } from '../hotel/MyHotels';

export const BIZ_ST = { PENDING_APPROVAL: ['Chờ duyệt', 'warn'], ACTIVE: ['Đã duyệt', 'ok'], REJECTED: ['Từ chối', 'error'], SUSPENDED: ['Tạm ngưng', 'error'] };

function Detail({ id, onBack }) {
  const manage = hasPerm(useApp().state.session, PERM.ADMIN_HOTEL_MANAGE);
  const r = useLoad(`/businesses/${id}`);
  const { run, node } = useRun();
  const act = (path, ok) => async (reason) => { const x = await run(() => adminApi.post(`/businesses/${id}/${path}`, reason !== undefined ? { reason } : {}), ok); if (x.ok) r.reload(); return x; };
  return (
    <LoadView r={r} head={<PageHeader title="Doanh nghiệp" back={{ onClick: onBack }} />}>{({ business: b, owner, hotels }) => (
      <div data-testid="biz-detail">
        <PageHeader title={b.name} back={{ onClick: onBack }} description={<StatusBadge status={b.status} map={BIZ_ST} />} />
        {node}
        {manage && b.status === 'PENDING_APPROVAL' && (
          <div className="row-actions" style={{ marginTop: 0, marginBottom: 12 }}>
            <Act label="Duyệt" confirm="Duyệt hồ sơ doanh nghiệp này? Chủ doanh nghiệp sẽ đăng nhập được." onDo={act('approve', 'Đã duyệt doanh nghiệp.')} testid="b-approve" />
            <Act label="Từ chối" danger reason onDo={act('reject', 'Đã từ chối hồ sơ.')} testid="b-reject" />
          </div>
        )}
        {b.status === 'REJECTED' && b.rejectReason && <Notice tone="error" title="Lý do từ chối"><span data-testid="b-reason">{b.rejectReason}</span></Notice>}
        <section className="card"><h3>Thông tin doanh nghiệp</h3>
          <dl className="biz-dl">
            <div><dt>Mã số thuế / giấy phép</dt><dd data-testid="b-tax">{b.taxCode || '—'}</dd></div>
            <div><dt>Người đại diện</dt><dd>{b.representative || '—'}</dd></div>
            <div><dt>Email</dt><dd>{b.email || '—'}</dd></div>
            <div><dt>Điện thoại</dt><dd>{b.phone || '—'}</dd></div>
            <div><dt>Đăng ký lúc</dt><dd>{dt(b.createdAt)}</dd></div>
            {b.approvedAt && <div><dt>Duyệt lúc</dt><dd>{dt(b.approvedAt)}</dd></div>}
          </dl>
        </section>
        <section className="card"><h3>Tài khoản chủ</h3>
          {owner ? <p>{owner.fullName} · {owner.email} · <strong>{owner.status === 'ACTIVE' ? 'Đã kích hoạt' : owner.status === 'INVITED' ? 'Chờ kích hoạt (sau khi duyệt)' : owner.status}</strong></p> : <p className="muted">Chưa có tài khoản chủ.</p>}
        </section>
        <section className="card"><h3>Khách sạn ({hotels.length})</h3>
          <DataTable rows={hotels} empty="Doanh nghiệp chưa có khách sạn." columns={cols([['Mã', (h) => h.code], ['Tên', (h) => h.name], ['Trạng thái', (h) => <StatusBadge status={h.status} map={HOTEL_ST} />], ['Tạo lúc', (h) => dt(h.createdAt)]])} />
        </section>
      </div>
    )}</LoadView>
  );
}

// Duyệt hồ sơ doanh nghiệp đăng ký công khai (mới nhất lên đầu theo máy chủ).
export default function Businesses() {
  const [q, setQ] = useState({});
  const [sel, setSel] = useState(null);
  const p = usePaged('/businesses', q, 'after');
  if (sel) return <Detail id={sel} onBack={() => { setSel(null); p.reload(); }} />;
  return (
    <>
      <PageHeader title="Doanh nghiệp" description="Hồ sơ doanh nghiệp đối tác đăng ký. Duyệt xong chủ mới đăng nhập và tạo khách sạn được." />
      <Filters fields={[['q', 'Tìm tên / mã số thuế / email'], ['status', 'Trạng thái', 'text', Object.entries(BIZ_ST).map(([k, [t]]) => [k, t])]]} onApply={setQ} />
      <DataTable empty="Không có doanh nghiệp khớp bộ lọc." {...pagedProps(p)} rowTestid="biz-row"
        columns={cols([['Tên', (b) => <button type="button" className="link-btn" onClick={() => setSel(b.id)} data-testid="open-biz">{b.name}</button>], ['Mã số thuế', (b) => b.taxCode || '—'], ['Đại diện', (b) => b.representative || '—'], ['Email', (b) => b.email || '—'], ['Trạng thái', (b) => <StatusBadge status={b.status} map={BIZ_ST} />], ['Khách sạn', (b) => b.hotelCount], ['Đăng ký lúc', (b) => dt(b.createdAt)]])} />
    </>
  );
}
