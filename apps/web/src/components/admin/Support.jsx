import React, { useState } from 'react';
import { ScreenTitle } from '../Common';
import { Pill } from '../partner/ui';
import { useApp } from '../../state/store';
import { patchTicket, sendTicketMessage } from '../../data/admin';
import { Act, Back, Filters, LoadView, PagedView, Table, dt, useLoad, usePaged, useRun } from './kit';

const ST = { OPEN: ['Mới', 'warn'], IN_PROGRESS: ['Đang xử lý', 'info'], RESOLVED: ['Đã xử lý', 'ok'], CLOSED: ['Đã đóng', 'neutral'] };
const DONE = ['RESOLVED', 'CLOSED'];
// API chỉ trả id người xử lý: có tên/email thì hiện tên, không thì 8 ký tự đầu gắn nhãn "Mã nhân viên".
const who = (t) => {
  const a = t.assignee || {};
  const name = a.fullName || a.name || t.assigneeName || a.email || t.assigneeEmail;
  return name ? ` · người xử lý ${name}` : t.assigneeId ? ` · người xử lý (Mã nhân viên ${String(t.assigneeId).slice(0, 8)})` : '';
};
const authorOf = (m) => {
  const a = m.author || {};
  return a.name || (a.type === 'GUEST' ? 'Khách' : 'Nhân viên');
};
const authorMeta = (m) => (m.author?.type === 'GUEST' ? 'Khách' : `Nhân viên${!m.author?.name && m.author?.id ? ` · Mã nhân viên ${String(m.author.id).slice(0, 8)}` : ''}`);
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
          <p className="muted">Liên hệ: {t.contact?.fullName} · {t.contact?.phone}{t.bookingCode ? ` · đơn ${t.bookingCode}` : ''}{who(t)}</p>
          {node}
          <div className="row-actions">
            {t.status === 'OPEN' && <Act label="Bắt đầu xử lý" confirm="Chuyển sang Đang xử lý?" onDo={() => patch({ status: 'IN_PROGRESS' }, 'Đã chuyển sang Đang xử lý.')} testid="t-progress" />}
            {!DONE.includes(t.status) && <Act label="Đánh dấu đã xử lý" confirm="Đóng ticket này?" onDo={() => patch({ status: 'RESOLVED' }, 'Đã đóng ticket.')} testid="t-resolve" />}
            {!DONE.includes(t.status) && t.assigneeId !== state.session?.id && <Act label="Nhận xử lý" confirm="Giao ticket cho bạn?" onDo={() => patch({ assigneeId: state.session.id }, 'Đã giao cho bạn.')} testid="t-assign" />}
          </div>
          <section className="card"><h3>Tin nhắn</h3>
            {messages.map((m) => <div key={m.id} className="card-inner" data-testid="msg"><strong>{authorOf(m)} <small>({authorMeta(m)}) · {dt(m.createdAt)}</small> {m.internal && <Pill tone="warn">Nội bộ</Pill>}</strong><span>{m.body}</span></div>)}
          </section>
          {DONE.includes(t.status) ? <p className="muted" data-testid="ticket-closed">Ticket đã {t.status === 'CLOSED' ? 'đóng' : 'xử lý'}, không thể gửi thêm tin nhắn.</p> : (
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
      <ScreenTitle title="Hỗ trợ">Hàng đợi ticket</ScreenTitle>
      <Filters fields={[['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])], ['assignee', 'Người xử lý', 'text', [['me', 'Của tôi']]]]} onApply={setQ} />
      <PagedView p={p} empty="Không có ticket nào.">
        <Table rows={p.items} cols={[['Mã', (t) => <button type="button" className="link-btn" onClick={() => setSel(t.id)} data-testid="open-ticket">{t.code}</button>], ['Chủ đề', (t) => t.subject], ['Trạng thái', (t) => <St s={t.status} />], ['SĐT', (t) => t.contactPhoneMasked], ['Tạo lúc', (t) => dt(t.createdAt)]]} />
      </PagedView>
    </>
  );
}
