import React, { useState } from 'react';
import { DataTable, PageHeader, StatusBadge, Tag } from '../ui';
import { useApp } from '../../state/store';
import { patchTicket, sendTicketMessage } from '../../data/admin';
import { Act, Filters, LoadView, cols, dt, pagedProps, useLoad, usePaged, useRun } from './kit';

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
const St = ({ s }) => <StatusBadge status={s} map={ST} />;

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
      <LoadView r={r} head={<PageHeader title="Hỗ trợ" back={{ onClick: onBack }} />}>{({ ticket: t, messages, attachments = [] }) => (
        <div data-testid="ticket-detail">
          <PageHeader title={`${t.code} · ${t.subject}`} description={<St s={t.status} />} back={{ onClick: onBack }} />
          <p className="muted">Liên hệ: {t.contact?.fullName} · {t.contact?.phone}{t.bookingCode ? ` · đơn ${t.bookingCode}` : ''}{who(t)}</p>
          {node}
          <div className="row-actions">
            {t.status === 'OPEN' && <Act label="Bắt đầu xử lý" confirm="Chuyển sang Đang xử lý?" onDo={() => patch({ status: 'IN_PROGRESS' }, 'Đã chuyển sang Đang xử lý.')} testid="t-progress" />}
            {!DONE.includes(t.status) && <Act label="Đánh dấu đã xử lý" confirm="Đóng ticket này?" onDo={() => patch({ status: 'RESOLVED' }, 'Đã đóng ticket.')} testid="t-resolve" />}
            {!DONE.includes(t.status) && t.assigneeId !== state.session?.id && <Act label="Nhận xử lý" confirm="Giao ticket cho bạn?" onDo={() => patch({ assigneeId: state.session.id }, 'Đã giao cho bạn.')} testid="t-assign" />}
          </div>
          <section className="card"><h3>Tin nhắn</h3>
            {messages.map((m) => <div key={m.id} className="card-inner" data-testid="msg"><strong>{authorOf(m)} <small>({authorMeta(m)}) · {dt(m.createdAt)}</small> {m.internal && <Tag tone="warn">Nội bộ</Tag>}</strong><span>{m.body}</span></div>)}
          </section>
          {attachments.length > 0 && <section className="card" data-testid="ticket-attachments"><h3>Tệp đính kèm của khách ({attachments.length})</h3>
            {attachments.map((a) => <div key={a.id} className="card-inner">{a.url ? (a.contentType.startsWith('video/') ? <video src={a.url} controls preload="none" style={{ maxWidth: '100%', maxHeight: 280 }} /> : <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="Ảnh khách đính kèm" loading="lazy" style={{ maxWidth: '100%', maxHeight: 280 }} /></a>) : <span className="muted">{a.contentType} · {(a.sizeBytes / 1048576).toFixed(1)} MB (không tải được URL xem)</span>}</div>)}
          </section>}
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
  if (sel) return <Detail id={sel} onBack={() => { setSel(null); p.reload(); }} />;
  return (
    <>
      <PageHeader title="Hỗ trợ" description="Hàng đợi ticket" />
      <Filters fields={[['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])], ['assignee', 'Người xử lý', 'text', [['me', 'Của tôi']]]]} onApply={setQ} />
      <DataTable empty="Không có ticket nào." {...pagedProps(p)}
        columns={cols([['Mã', (t) => <button type="button" className="link-btn" onClick={() => setSel(t.id)} data-testid="open-ticket">{t.code}</button>], ['Chủ đề', (t) => t.subject], ['Trạng thái', (t) => <St s={t.status} />], ['SĐT', (t) => t.contactPhoneMasked], ['Tạo lúc', (t) => dt(t.createdAt)]])} />
    </>
  );
}
