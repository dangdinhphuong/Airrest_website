import React, { useEffect, useState } from 'react';
import { Notice } from '../Common';
import { DataTable, FilterBar, FormField as Field, Modal, PageHeader, StatusBadge, Tabs } from '../ui';
import Select from '../Select';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { money } from '../../lib/time';
import { adjustPayout, adjustStatement, fetchAdminStatementCsv, generatePayouts, generateStatement, lockPayout, lockStatement, markPayoutPaid, reopenStatement, sendStatement } from '../../data/adminSettle';
import { Act, LoadView, cols, dt, pagedProps, useLoad, usePaged, useRun } from './kit';
import { KIND } from './payerStatements';
import { PAYOUT_STATUS, STMT_STATUS, checkAdjustment, checkPeriod, checkRef, lastPeriod, payoutActions, stmtActions } from './adminSettle';

const Tag = ({ map, v }) => <StatusBadge status={v} map={map} />;
const stOpts = (m) => Object.entries(m).map(([k, [t]]) => <option key={k} value={k}>{t}</option>);

// Hàng điều khiển chung: kỳ + trạng thái (+ chọn thực thể).
function Bar({ q, setQ, statusMap, children }) {
  return (
    <FilterBar testid="settle-filters" onReset={() => setQ({})}>
      {children}
      <input aria-label="Kỳ lọc (YYYY-MM)" placeholder="Kỳ YYYY-MM" value={q.period || ''} maxLength={7} onChange={(e) => setQ({ ...q, period: e.target.value.trim() })} data-testid="f-period" />
      <Select aria-label="Trạng thái" value={q.status || ''} onChange={(e) => setQ({ ...q, status: e.target.value })}><option value="">Trạng thái: tất cả</option>{stOpts(statusMap)}</Select>
    </FilterBar>
  );
}
// Bỏ kỳ nhập dở (chưa đủ dạng) để không gửi lên làm API trả 422 mỗi lần gõ.
const clean = (q) => ({ ...q, period: checkPeriod(q.period).ok ? q.period : undefined, status: q.status || undefined, payerId: q.payerId || undefined, hotelId: q.hotelId || undefined });

function LinesTable({ lines, hotel }) {
  return <DataTable rows={lines} emptyTitle="Chưa có dòng nào" empty="Chưa có dòng chi tiết." columns={cols(hotel
    ? [['Loại', (l) => KIND[l.kind] || l.kind], ['Mã đơn', (l) => l.bookingCode || '—'], ['Mã nhóm', (l) => l.groupCode || '—'], ['Giá hợp đồng', (l) => money(l.grossVnd ?? 0)], ['Hoa hồng', (l) => money(l.commissionVnd ?? 0)], ['Thực trả', (l) => money(l.netVnd ?? 0)], ['Ghi chú', (l) => l.memo || '']]
    : [['Loại', (l) => KIND[l.kind] || l.kind], ['Mã đơn', (l) => l.bookingCode || '—'], ['Mã nhóm', (l) => l.groupCode || '—'], ['Chuyến bay', (l) => l.flightCode || '—'], ['Khách sạn', (l) => l.hotelName || '—'], ['Số tiền', (l) => money(l.amountVnd ?? 0)], ['Ghi chú', (l) => l.memo || '']])} />;
}

function AdjustForm({ title, entity, entityKey, options, onDone, call }) {
  const [f, setF] = useState({ id: '', period: lastPeriod(), amount: '', memo: '' });
  const [bad, setBad] = useState(null);
  const { run, busy, node } = useRun();
  const submit = async (e) => {
    e.preventDefault();
    const a = checkAdjustment(f); const p = checkPeriod(f.period);
    if (!f.id) { setBad(`Chọn ${entity}.`); return; }
    if (!p.ok) { setBad(p.error); return; }
    if (!a.ok) { setBad(a.error); return; }
    setBad(null);
    const x = await run(() => call({ [entityKey]: f.id, period: p.period, amountVnd: a.amountVnd, memo: a.memo }), 'Đã ghi điều chỉnh.');
    if (x.ok) { setF({ ...f, amount: '', memo: '' }); onDone(); }
  };
  return (
    <form className="card" onSubmit={submit} noValidate data-testid="adjust-form">
      <h3>{title}</h3>{node}{bad && <Notice tone="error">{bad}</Notice>}
      <div className="grid-2">
        <Field id="adj-ent" label={entity}><Select id="adj-ent" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })}><option value="">— Chọn —</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field id="adj-period" label="Kỳ gốc (YYYY-MM)"><input id="adj-period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} maxLength={7} /></Field>
        <Field id="adj-amount" label="Số tiền VND (âm = truy thu)"><input id="adj-amount" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field id="adj-memo" label="Ghi chú (3-300 ký tự)"><input id="adj-memo" value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} maxLength={300} /></Field>
      </div>
      <button className="btn btn-primary" disabled={busy} data-testid="adjust-submit">Ghi điều chỉnh</button>
    </form>
  );
}

function StatementDetail({ id, onBack }) {
  const r = useLoad(`/payer-statements/${id}`);
  const { run, node } = useRun();
  const csv = async () => {
    const x = await run(async () => {
      const { blob, filename } = await fetchAdminStatementCsv(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'Đã tải CSV.');
    return x;
  };
  return (
    <>
      <LoadView r={r} head={<PageHeader title="Bảng kê" back={{ onClick: onBack }} />}>{({ statement: s, lines }) => (
        <>
          <PageHeader title={`Bảng kê kỳ ${s.period}`} description={s.payerName} back={{ onClick: onBack }} />
          {node}
          <section className="card" data-testid="stmt-summary">
            <p><Tag map={STMT_STATUS} v={s.status} /> · Gửi {dt(s.sentAt)}{s.disputeReason ? ` · Khiếu nại: ${s.disputeReason}` : ''}</p>
            <p>Phòng {money(s.roomVnd ?? 0)} · Xe {money(s.shuttleVnd ?? 0)} · Nâng hạng {money(s.upgradeDeltaVnd ?? 0)} · Điều chỉnh {money(s.adjustmentVnd ?? 0)} · Hoa hồng {money(s.commissionVnd ?? 0)}</p>
            <h3 data-testid="stmt-total">Tổng cộng: {money(s.totalVnd ?? 0)}</h3>
            <button type="button" className="btn btn-sm" onClick={csv} data-testid="stmt-csv">Tải CSV</button>
          </section>
          <LinesTable lines={lines} />
        </>
      )}</LoadView>
    </>
  );
}

function Statements({ manage, finance, onDetail }) {
  const payers = useLoad('/payers', { limit: 100 });
  const [q, setQ] = useState({});
  const [open, setOpen] = useState(null);
  useEffect(() => { onDetail(!!open); }, [open, onDetail]);
  const [g, setG] = useState({ payerId: '', period: lastPeriod() });
  const p = usePaged('/payer-statements', clean(q), 'after');
  const [bad, setBad] = useState(null);
  const { run, busy, node } = useRun();
  const list = payers.data?.items || [];
  const act = (fn, ok) => async (...a) => { const x = await run(() => fn(...a), ok); if (x.ok) p.reload(); return x; };
  const gen = async (e) => {
    e.preventDefault();
    const c = checkPeriod(g.period);
    if (!g.payerId || !c.ok) { setBad(!g.payerId ? 'Chọn đơn vị chi trả.' : c.error); return; }
    setBad(null);
    await act(() => generateStatement(g.payerId, c.period), 'Đã tạo/tính lại bảng kê.')();
  };
  if (open) return <StatementDetail id={open} onBack={() => { setOpen(null); p.reload(); }} />;
  return (
    <>
      {node}{bad && <Notice tone="error">{bad}</Notice>}
      {manage && (
        <form className="inline-form" onSubmit={gen} data-testid="stmt-generate">
          <Select aria-label="Đơn vị chi trả" value={g.payerId} onChange={(e) => setG({ ...g, payerId: e.target.value })}><option value="">Chọn đơn vị chi trả</option>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <input aria-label="Kỳ tạo (YYYY-MM)" value={g.period} maxLength={7} onChange={(e) => setG({ ...g, period: e.target.value })} data-testid="gen-period" />
          <button className="btn btn-sm btn-primary" disabled={busy} data-testid="stmt-generate-submit">Tạo / tính lại bảng kê</button>
        </form>
      )}
      <Bar q={q} setQ={setQ} statusMap={STMT_STATUS}>
        <Select aria-label="Lọc theo đơn vị" value={q.payerId || ''} onChange={(e) => setQ({ ...q, payerId: e.target.value })}><option value="">Đơn vị: tất cả</option>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      </Bar>
      <DataTable empty="Chưa có bảng kê nào." {...pagedProps(p)}
        columns={cols([['Đơn vị', (r) => r.payerName], ['Kỳ', (r) => r.period], ['Trạng thái', (r) => <Tag map={STMT_STATUS} v={r.status} />], ['Tổng tiền', (r) => money(r.totalVnd ?? 0)], ['Số dòng', (r) => r.lineCount ?? 0],
          ['', (r) => { const a = stmtActions(r, { manage, finance }); return (
            <span className="row-actions">
              <button type="button" className="btn btn-sm" onClick={() => setOpen(r.id)} data-testid="stmt-open">Chi tiết</button>
              {a.send && <Act label="Gửi" confirm="Gửi bảng kê cho đơn vị? Từ lúc gửi đơn vị có 5 ngày khiếu nại." onDo={() => act(sendStatement, 'Đã gửi bảng kê.')(r.id)} testid="stmt-send" />}
              {a.lock && <Act label="Chốt sổ" confirm="Khóa sổ bảng kê này?" onDo={() => act(lockStatement, 'Đã khóa sổ.')(r.id)} testid="stmt-lock" />}
              {a.reopen && <Act label="Mở lại" reason danger onDo={(why) => act(reopenStatement, 'Đã mở lại bảng kê.')(r.id, why)} testid="stmt-reopen" />}
            </span>); }]])} />
      {manage && <AdjustForm title="Điều chỉnh / truy thu cho đơn vị" entity="Đơn vị chi trả" entityKey="payerId" options={list} onDone={p.reload} call={adjustStatement} />}
    </>
  );
}

function PayoutDetail({ id, onBack }) {
  const r = useLoad(`/hotel-payouts/${id}`);
  return (
    <>
      <LoadView r={r} head={<PageHeader title="Chi trả" back={{ onClick: onBack }} />}>{({ payout: p, lines }) => (
        <>
          <PageHeader title={`Chi trả kỳ ${p.period}`} description={p.hotelName} back={{ onClick: onBack }} />
          <section className="card" data-testid="payout-summary">
            <p><Tag map={PAYOUT_STATUS} v={p.status} />{p.paymentRef ? ` · Tham chiếu: ${p.paymentRef}` : ''}{p.paidAt ? ` · Trả lúc ${dt(p.paidAt)}` : ''}</p>
            <h3>Giá HĐ {money(p.grossVnd ?? 0)} − Hoa hồng {money(p.commissionVnd ?? 0)} = Thực trả {money(p.netVnd ?? 0)}</h3>
          </section>
          <LinesTable lines={lines} hotel />
        </>
      )}</LoadView>
    </>
  );
}

function PaidAct({ onPaid }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState('');
  const [bad, setBad] = useState('');
  const go = async () => { const c = checkRef(ref); if (!c.ok) { setBad(c.error); return; } const r = await onPaid(c.ref); if (r?.ok !== false) { setOpen(false); setRef(''); setBad(''); } };
  const close = () => { setOpen(false); setBad(''); };
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} data-testid="payout-paid">Ghi nhận đã trả</button>
      <Modal open={open} onClose={close} title="Ghi nhận đã trả" size="sm"
        footer={<><button type="button" className="btn btn-sm" onClick={close}>Huỷ</button><button type="button" className="btn btn-sm btn-primary" onClick={go} data-testid="payout-paid-confirm">Xác nhận đã trả</button></>}>
        <Field id="payout-ref" label="Mã tham chiếu chuyển khoản" error={bad}>
          <input id="payout-ref" aria-label="Mã tham chiếu chuyển khoản" placeholder="Mã tham chiếu CK" value={ref} onChange={(e) => { setRef(e.target.value); setBad(''); }} data-testid="payout-paid-ref" data-autofocus />
        </Field>
      </Modal>
    </>
  );
}

function Payouts({ manage, finance, onDetail }) {
  const hotels = useLoad('/hotels', { limit: 100 });
  const [q, setQ] = useState({});
  const [open, setOpen] = useState(null);
  useEffect(() => { onDetail(!!open); }, [open, onDetail]);
  const [per, setPer] = useState(lastPeriod());
  const [bad, setBad] = useState(null);
  const p = usePaged('/hotel-payouts', clean(q), 'after');
  const { run, busy, node } = useRun();
  const act = (fn, ok) => async (...a) => { const x = await run(() => fn(...a), ok); if (x.ok) p.reload(); return x; };
  const gen = async (e) => {
    e.preventDefault();
    const c = checkPeriod(per);
    if (!c.ok) { setBad(c.error); return; }
    setBad(null);
    await act(generatePayouts, 'Đã tạo/tính lại bảng chi trả của kỳ.')(c.period);
  };
  if (open) return <PayoutDetail id={open} onBack={() => { setOpen(null); p.reload(); }} />;
  const hs = hotels.data?.items || [];
  return (
    <>
      {node}{bad && <Notice tone="error">{bad}</Notice>}
      {manage && (
        <form className="inline-form" onSubmit={gen} data-testid="payout-generate">
          <input aria-label="Kỳ tạo (YYYY-MM)" value={per} maxLength={7} onChange={(e) => setPer(e.target.value)} data-testid="payout-gen-period" />
          <button className="btn btn-sm btn-primary" disabled={busy} data-testid="payout-generate-submit">Tạo / tính lại chi trả kỳ này</button>
        </form>
      )}
      <Bar q={q} setQ={setQ} statusMap={PAYOUT_STATUS}>
        <Select aria-label="Lọc theo khách sạn" value={q.hotelId || ''} onChange={(e) => setQ({ ...q, hotelId: e.target.value })}><option value="">Khách sạn: tất cả</option>{hs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      </Bar>
      <DataTable empty="Chưa có bảng chi trả nào." {...pagedProps(p)}
        columns={cols([['Khách sạn', (r) => r.hotelName], ['Kỳ', (r) => r.period], ['Trạng thái', (r) => <Tag map={PAYOUT_STATUS} v={r.status} />], ['Giá HĐ', (r) => money(r.grossVnd ?? 0)], ['Hoa hồng', (r) => money(r.commissionVnd ?? 0)], ['Thực trả', (r) => money(r.netVnd ?? 0)],
          ['', (r) => { const a = payoutActions(r, { manage, finance }); return (
            <span className="row-actions">
              <button type="button" className="btn btn-sm" onClick={() => setOpen(r.id)} data-testid="payout-open">Chi tiết</button>
              {a.lock && <Act label="Khóa" confirm="Khóa bảng chi trả này?" onDo={() => act(lockPayout, 'Đã khóa bảng chi trả.')(r.id)} testid="payout-lock" />}
              {a.paid && <PaidAct onPaid={(ref) => act(markPayoutPaid, 'Đã ghi nhận chuyển tiền.')(r.id, ref)} />}
            </span>); }]])} />
      {manage && <AdjustForm title="Điều chỉnh / truy thu cho khách sạn" entity="Khách sạn" entityKey="hotelId" options={hs} onDone={p.reload} call={adjustPayout} />}
    </>
  );
}

export default function AdminSettle() {
  const s = useApp().state.session;
  const canStmt = hasPerm(s, PERM.ADMIN_PAYER_READ); const canPay = hasPerm(s, PERM.ADMIN_PAYMENT_READ);
  const tabs = [...(canStmt ? [{ id: 'stmt', label: 'Bảng kê đơn vị chi trả' }] : []), ...(canPay ? [{ id: 'payout', label: 'Chi trả khách sạn' }] : [])];
  const [tab, setTab] = useState(tabs[0]?.id);
  const [detail, setDetail] = useState(false); // màn chi tiết tự vẽ PageHeader
  const perms = { manage: hasPerm(s, PERM.ADMIN_PAYER_MANAGE), finance: hasPerm(s, PERM.ADMIN_PAYMENT_MANAGE) };
  return (
    <>
      {!detail && (
        <PageHeader title="Bảng kê và chi trả" description="Quyết toán theo kỳ tháng: bảng kê thu của đơn vị chi trả, chi trả cho khách sạn">
          <Tabs label="Mục" value={tab} onChange={setTab} tabs={tabs} />
        </PageHeader>
      )}
      {tab === 'stmt' ? <Statements {...perms} onDetail={setDetail} /> : <Payouts {...perms} onDetail={setDetail} />}
    </>
  );
}
