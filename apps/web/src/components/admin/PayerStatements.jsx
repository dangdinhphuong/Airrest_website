import React, { useCallback, useEffect, useState } from 'react';
import { Notice } from '../Common';
import { DataTable, ErrorState, Loading, Modal, PageHeader, StatusBadge } from '../ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { useNow } from '../../lib/countdown';
import { money } from '../../lib/time';
import { disputeStatement, fetchStatementCsv, getStatement, listStatements } from '../../data/payerStatements';
import { cols, errText } from './kit';
import { KIND, STATUS, canDispute, checkReason, fmtRemaining, fmtVN, statementErr } from './payerStatements';

const err = (e) => statementErr(e) || errText(e);
const StatusPill = ({ s }) => <StatusBadge status={s} map={STATUS} />;

function Detail({ id, onBack }) {
  const manage = hasPerm(useApp().state.session, PERM.PAYER_DELAY_MANAGE);
  const now = useNow(30000);
  const [st, set] = useState({ data: null, err: null });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    try { set({ data: await getStatement(id), err: null }); } catch (e) { set((p) => ({ ...p, err: err(e) })); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const csv = async () => {
    setBusy(true); setMsg(null);
    try {
      const { blob, filename } = await fetchStatementCsv(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setMsg({ tone: 'error', text: err(e) }); } finally { setBusy(false); }
  };
  const dispute = async () => {
    const r = checkReason(reason);
    if (!r.ok) { setMsg({ tone: 'error', text: r.error }); return; }
    setBusy(true); setMsg(null);
    try { await disputeStatement(id, r.reason); setOpen(false); setReason(''); setMsg({ tone: 'ok', text: 'Đã gửi khiếu nại. Airrest sẽ xử lý và phản hồi.' }); await load(); }
    catch (e) { setMsg({ tone: 'error', text: err(e) }); if (e?.status === 409) load(); } finally { setBusy(false); }
  };

  if (st.err && !st.data) return <><PageHeader title="Bảng kê" back={{ onClick: onBack }} /><ErrorState onRetry={load}>{st.err}</ErrorState></>;
  if (!st.data) return <><PageHeader title="Bảng kê" back={{ onClick: onBack }} /><Loading /></>;
  const { statement: s, lines } = st.data;
  const left = fmtRemaining(s.disputeDeadline, now);
  return (
    <>
      <PageHeader title={`Bảng kê kỳ ${s.period}`} description={s.payerName} back={{ onClick: onBack }} />
      {msg && !open && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <section className="card" data-testid="statement-summary">
        <p style={{ margin: '4px 0' }}><StatusPill s={s.status} /> · Gửi lúc {fmtVN(s.sentAt)}</p>
        {s.status === 'SENT' && s.disputeDeadline && <p style={{ margin: '4px 0' }} data-testid="dispute-left">Hạn khiếu nại: {fmtVN(s.disputeDeadline)} ({left})</p>}
        {s.status === 'DISPUTED' && <p style={{ margin: '4px 0' }}>Đã khiếu nại lúc {fmtVN(s.disputedAt)}{s.disputeReason ? `: ${s.disputeReason}` : ''}</p>}
        {s.status === 'LOCKED' && <p style={{ margin: '4px 0' }}>Đã khóa sổ lúc {fmtVN(s.lockedAt)}</p>}
        <p style={{ margin: '4px 0' }}>Tiền phòng {money(s.roomVnd ?? 0)} · Xe {money(s.shuttleVnd ?? 0)} · Nâng hạng {money(s.upgradeDeltaVnd ?? 0)} · Điều chỉnh {money(s.adjustmentVnd ?? 0)}</p>
        <h3 style={{ margin: '8px 0' }} data-testid="statement-total">Tổng cộng: {money(s.totalVnd ?? 0)}</h3>
        <div className="row-actions">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={csv} data-testid="statement-csv">Tải CSV</button>
          {canDispute(s, now, manage) && !open && <button type="button" className="btn btn-sm btn-danger" onClick={() => setOpen(true)} data-testid="dispute-open">Khiếu nại</button>}
        </div>
        <Modal open={open} onClose={() => setOpen(false)} title="Khiếu nại bảng kê" size="sm" locked={busy}
          footer={<><button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Huỷ</button><button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={dispute} data-testid="dispute-submit">{busy ? 'Đang gửi…' : 'Gửi khiếu nại'}</button></>}>
          {msg?.tone === 'error' && <p className="field-error" role="alert">{msg.text}</p>}
          <div className="field"><label htmlFor="dispute-reason">Lý do khiếu nại</label>
            <input id="dispute-reason" aria-label="Lý do khiếu nại" placeholder="Lý do khiếu nại (5 đến 1000 ký tự)" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="dispute-reason" data-autofocus /></div>
        </Modal>
      </section>
      <DataTable rows={lines} emptyTitle="Chưa có dòng nào" empty="Bảng kê này chưa có dòng chi tiết." columns={cols([
          ['Loại', (l) => KIND[l.kind] || l.kind], ['Mã đơn', (l) => l.bookingCode || '—'], ['Mã nhóm', (l) => l.groupCode || '—'],
          ['Chuyến bay', (l) => l.flightCode || '—'], ['Khách sạn', (l) => l.hotelName || '—'],
          ['Số tiền', (l) => money(l.amountVnd ?? 0)], ['Ghi chú', (l) => l.memo || '']])} />
    </>
  );
}

export default function PayerStatements() {
  const now = useNow(60000);
  const [open, setOpen] = useState(null);
  const [s, set] = useState({ items: [], next: null, loading: true, err: null });
  const load = useCallback(async (after) => {
    set((p) => ({ ...p, loading: true, err: null, ...(after == null ? { items: [] } : {}) }));
    try { const r = await listStatements(after ?? undefined); set((p) => ({ items: after == null ? r.items : [...p.items, ...r.items], next: r.nextCursor ?? null, loading: false, err: null })); }
    catch (e) { set((p) => ({ ...p, loading: false, err: err(e) })); }
  }, []);
  useEffect(() => { load(null); }, [load]);

  if (open) return <Detail id={open} onBack={() => { setOpen(null); load(null); }} />;
  return (
    <>
      <PageHeader title="Bảng kê tháng" description="Bảng kê Airrest gửi cho đơn vị của bạn. Bảng kê nháp chưa hiển thị." />
      <DataTable emptyTitle="Chưa có bảng kê" empty="Chưa có bảng kê nào được gửi cho đơn vị của bạn."
        rows={s.items} loading={s.loading} error={s.err} onRetry={() => load(null)} hasMore={s.next != null} onLoadMore={() => load(s.next)} loadingMore={s.loading}
        columns={cols([
              ['Kỳ', (r) => r.period], ['Trạng thái', (r) => <StatusPill s={r.status} />],
              ['Tổng tiền', (r) => money(r.totalVnd ?? 0)], ['Số dòng', (r) => r.lineCount ?? 0],
              ['Gửi lúc', (r) => fmtVN(r.sentAt)],
              ['Hạn khiếu nại', (r) => (r.status === 'SENT' ? `${fmtVN(r.disputeDeadline)} (${fmtRemaining(r.disputeDeadline, now)})` : '—')],
              ['', (r) => <button type="button" className="btn btn-sm" onClick={() => setOpen(r.id)} data-testid="statement-open">Xem chi tiết</button>]])} />
    </>
  );
}
