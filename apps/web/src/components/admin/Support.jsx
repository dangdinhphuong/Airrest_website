import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Pill } from '../partner/ui';
import { useApp } from '../../state/store';
import { patchTicket, sendTicketMessage } from '../../data/admin';
import { Act, Back, Filters, LoadView, PagedView, Table, dt, useLoad, usePaged, useRun } from './kit';

const ST = { OPEN: ['Mới', 'warn'], IN_PROGRESS: ['Đang xử lý', 'info'], RESOLVED: ['Đã xử lý', 'ok'] };
const St = ({ s }) => <Pill tone={ST[s]?.[1]}>{ST[s]?.[0] || s}</Pill>;

function Detail({ id, onBack }) {
  const { state } = useApp();
  const r = useLoad(`/support/${id}`);
  const { run, busy, node } = useRun();
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const patch = async (body, ok) => { const x = await run(() => patchTicket(id, body), ok); if (x.ok) r.reload(); return x; };
  const send = async (e) => {
    e.preventDefault();
    const x = await run(() => sendTicketMessage(id, text, internal), internal ? 'Đã lưu ghi chú nội bộ.' : 'Đã gửi tin nhắn cho khách.');
    if (x.ok) { setText(''); r.reload(); }
  };
  return (
    <>
      <Back onClick={onBack} />
      <LoadView r={r}>{({ ticket: t, messages }) => (
        <div data-testid="ticket-detail">
          <h2>{t.code} · {t.subject} <St s={t.status} /></h2>
          <p className="muted">Liên hệ: {t.contact?.fullName} · {t.contact?.phone}{t.bookingCode ? ` · đơn ${t.bookingCode}` : ''}{t.assigneeId ? ` · người xử lý ${String(t.assigneeId).slice(0, 8)}` : ''}</p>
          {node}
          <div className="row-actions">
            {t.status === 'OPEN' && <Act label="Bắt đầu xử lý" confirm="Chuyển sang Đang xử lý?" onDo={() => patch({ status: 'IN_PROGRESS' }, 'Đã chuyển sang Đang xử lý.')} testid="t-progress" />}
            {t.status !== 'RESOLVED' && <Act label="Đánh dấu đã xử lý" confirm="Đóng ticket này?" onDo={() => patch({ status: 'RESOLVED' }, 'Đã đóng ticket.')} testid="t-resolve" />}
            {t.assigneeId !== state.session?.id && <Act label="Nhận xử lý" confirm="Giao ticket cho bạn?" onDo={() => patch({ assigneeId: state.session.id }, 'Đã giao cho bạn.')} testid="t-assign" />}
          </div>
          <section className="card"><h3>Tin nhắn</h3>
            {messages.map((m) => <div key={m.id} className="card-inner" data-testid="msg"><strong>{m.author?.name || (m.author?.type === 'GUEST' ? 'Khách' : 'Nhân viên')} <small>({m.author?.type}) · {dt(m.createdAt)}</small> {m.internal && <Pill tone="warn">Nội bộ</Pill>}</strong><span>{m.body}</span></div>)}
          </section>
          {(
            <form onSubmit={send} className="card">
              <div className="field"><label htmlFor="tm">Nội dung</label><input id="tm" value={text} onChange={(e) => setText(e.target.value)} required maxLength={2000} /></div>
              <label><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} data-testid="t-internal" /> Ghi chú nội bộ (khách không thấy)</label>
              <div className="row-actions"><button className="btn btn-primary" disabled={busy || !text.trim()} data-testid="t-send">Gửi</button></div>
            </form>
          )}
        </div>
      )}</LoadView>
    </>
  );
}

export default function Support() {
  const [q, setQ] = useState({});
  const [sel, setSel] = useState(null);
  const p = usePaged('/support', q);
  if (sel) return <><ScreenTitle title="Hỗ trợ" /><Detail id={sel} onBack={() => { setSel(null); p.reload(); }} /></>;
  return (
    <>
      <ScreenTitle title="Hỗ trợ" kicker="Hàng đợi ticket" />
      <Filters fields={[['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])], ['assignee', 'Người xử lý', 'text', [['me', 'Của tôi']]]]} onApply={setQ} />
      <PagedView p={p} empty="Không có ticket nào.">
        <Table rows={p.items} cols={[['Mã', (t) => <button type="button" className="link-btn" onClick={() => setSel(t.id)} data-testid="open-ticket">{t.code}</button>], ['Chủ đề', (t) => t.subject], ['Trạng thái', (t) => <St s={t.status} />], ['SĐT', (t) => t.contactPhoneMasked], ['Tạo lúc', (t) => dt(t.createdAt)]]} />
      </PagedView>
    </>
  );
}
