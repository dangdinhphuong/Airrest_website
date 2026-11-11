import React, { useState } from 'react';
import { EmptyBox, Field, Notice } from '../Common';
import { Kpi, LockedList, Pager, Pill, ReasonAction, SubTabs } from './ui';
import { CASE_STATUS, INCIDENT_STATUS, PICKUP_LABEL, ROLE_LABEL, activeCatalog, addCaseNote, allProperties, caseNext, createCase, createIncident, dayLabel, exportCsv, maskName, propertyName, revealSensitive, setCaseStatus, setIncidentStatus, usePartner } from '../../mock/partner';
import { REQ_STATUS, deriveRequest } from '../../lib/request';
import { can } from '../../lib/rbac';
import { fmtTime, money } from '../../lib/time';

// SA-FR-022…024: việc cần xử lý, tra cứu theo correlation ID, sự cố hệ thống.
export function MonitorTab({ session, simNow, request, flight }) {
  const { bookings, pickups, incidents, log } = usePartner();
  const [wait, setWait] = useState('30'); const [cid, setCid] = useState(''); const [searched, setSearched] = useState(null);
  const [f, setF] = useState({ title: '', severity: 'medium', cid: '' }); const [err, setErr] = useState(''); const [msg, setMsg] = useState(null);
  const [concl, setConcl] = useState({}); const canU = can(session.role, 'case', 'U');
  const thr = wait.trim() !== '' && Number.isFinite(Number(wait)) && Number(wait) >= 0 ? Number(wait) : 30; // 0 là giá trị hợp lệ
  const stuck = [
    ...pickups.filter((x) => x.status === 'waiting' && simNow - x.updatedAt >= thr).map((x) => ({ k: x.id, text: `Yêu cầu đón ${x.id} (${propertyName(x.propertyId)}) chờ nhận ${simNow - x.updatedAt} phút`, cid: '' })),
    ...bookings.filter((b) => b.status === 'pending' && simNow - b.createdAt >= thr).map((b) => ({ k: b.code, text: `Đặt phòng ${b.code} (${propertyName(b.propertyId)}) chờ xác nhận ${simNow - b.createdAt} phút`, cid: b.cid })),
    ...incidents.filter((i) => i.status === 'New').map((i) => ({ k: i.id, text: `Sự cố ${i.id} chưa được nhận xử lý`, cid: i.cid })),
  ];
  const search = (e) => {
    e.preventDefault(); const q = cid.trim();
    if (!q) { setSearched(null); return; }
    setSearched({ q, audit: log.filter((l) => l.cid === q).slice().reverse(), books: bookings.filter((b) => b.cid === q) });
  };
  const create = (e) => { e.preventDefault(); if (!f.title.trim()) { setErr('Nhập tiêu đề sự cố.'); return; } setErr(''); const id = createIncident(f, session, simNow); setMsg({ ok: true, text: `Đã tạo sự cố ${id}.` }); setF({ ...f, title: '' }); };
  const reqD = request && flight ? deriveRequest(request, flight, simNow) : null;
  return (
    <>
      <section className="card" data-testid="stuck-panel">
        <div className="card-head"><h2>Cần xử lý ({stuck.length})</h2>
          <Field id="mo-wait" label="Chờ quá (phút mô phỏng)"><input id="mo-wait" inputMode="numeric" value={wait} onChange={(e) => setWait(e.target.value)} data-testid="stuck-threshold" /></Field></div>
        {stuck.length ? <ul className="plain-list" data-testid="stuck-list">{stuck.map((s) => <li key={s.k} data-testid="stuck-item">{s.text}{s.cid && <small> · {s.cid}</small>}</li>)}</ul> : <p className="muted" data-testid="stuck-empty">Không có việc nào chờ quá ngưỡng. Ngưỡng này chỉ là giá trị để xem, chưa phải cấu hình đã duyệt (OQ-45).</p>}
      </section>
      <form className="card" onSubmit={search} data-testid="cid-form">
        <h2>Tra cứu theo correlation ID</h2>
        <div className="inline-form"><label className="sr-only" htmlFor="cid-q">Correlation ID</label><input id="cid-q" className="filter-input" placeholder="Ví dụ cid-0001 hoặc cid-s001" value={cid} onChange={(e) => setCid(e.target.value)} data-testid="cid-input" /><button type="submit" className="btn btn-primary" data-testid="cid-search">Tra cứu</button></div>
        {searched && (searched.audit.length || searched.books.length ? (
          <div data-testid="cid-result"><p className="muted">Sự kiện liên quan theo thứ tự thời gian (dữ liệu nhạy cảm đã che):</p>
            <ul className="plain-list">{searched.books.map((b) => <li key={b.code}>Đặt phòng {b.code} · {maskName(b.name)} · {propertyName(b.propertyId)}</li>)}{searched.audit.map((l) => <li key={l.n}>{fmtTime(l.at)} · {l.action} · {l.who} · {l.target}</li>)}</ul></div>
        ) : <p className="muted" role="status" data-testid="cid-none">Không tìm thấy correlation ID “{searched.q}”.</p>)}
      </form>
      <section className="card" data-testid="incident-panel">
        <h2>Sự cố hệ thống ({incidents.length})</h2>
        {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="incident-msg">{msg.text}</p>}
        {incidents.map((i) => (
          <article key={i.id} className="review-card" data-testid="incident-card" data-id={i.id}>
            <div className="card-head"><h3>{i.title} <small>· {i.id} · mức {i.severity}{i.cid ? ` · ${i.cid}` : ''}</small></h3><Pill tone={i.status === 'Closed' ? 'neutral' : i.status === 'Resolved' ? 'ok' : 'warn'} data-testid="incident-status">{INCIDENT_STATUS[i.status]}</Pill></div>
            {i.conclusion && <p className="muted">Kết luận: {i.conclusion}</p>}
            {canU && i.status !== 'Closed' && (
              <div className="row-actions">
                {i.status === 'New' && <button type="button" className="btn btn-sm" onClick={() => setMsg(((r) => ({ ok: r.ok, text: r.ok ? 'Đã nhận xử lý.' : r.error }))(setIncidentStatus(i.id, 'InProgress', {}, session, simNow)))} data-testid="incident-start">Nhận xử lý</button>}
                {i.status === 'InProgress' && <span className="inline-form"><label className="sr-only" htmlFor={`ic-${i.id}`}>Kết luận</label><input id={`ic-${i.id}`} placeholder="Kết luận" value={concl[i.id] || ''} onChange={(e) => setConcl({ ...concl, [i.id]: e.target.value })} data-testid="incident-conclusion" /><button type="button" className="btn btn-sm" onClick={() => setMsg(((r) => ({ ok: r.ok, text: r.ok ? 'Đã đánh dấu giải quyết.' : r.error }))(setIncidentStatus(i.id, 'Resolved', { conclusion: concl[i.id] || '' }, session, simNow)))} data-testid="incident-resolve">Đã giải quyết</button></span>}
                {i.status === 'Resolved' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setMsg(((r) => ({ ok: r.ok, text: r.ok ? 'Đã đóng sự cố.' : r.error }))(setIncidentStatus(i.id, 'Closed', {}, session, simNow)))} data-testid="incident-close">Đóng</button>}
              </div>
            )}
          </article>
        ))}
        {canU && (
          <form onSubmit={create} noValidate data-testid="incident-form">
            <div className="grid-2">
              <Field id="in-t" label="Tiêu đề" error={err}><input id="in-t" value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setErr(''); }} data-testid="incident-title" /></Field>
              <Field id="in-s" label="Mức độ"><select id="in-s" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option></select></Field>
              <Field id="in-c" label="Correlation ID liên quan (nếu có)"><input id="in-c" value={f.cid} onChange={(e) => setF({ ...f, cid: e.target.value })} /></Field>
            </div>
            <button type="submit" className="btn btn-primary" data-testid="incident-create">Tạo sự cố</button>
          </form>
        )}
      </section>
      <section className="card">
        <h2>Đặt phòng, đón khách và yêu cầu hãng (tham chiếu)</h2>
        <p data-testid="monitor-summary">Đặt phòng: {bookings.length} · Yêu cầu đón: {pickups.length} ({pickups.filter((x) => !['done', 'failed'].includes(x.status)).length} đang xử lý)</p>
        {reqD
          ? <p data-testid="monitor-request">Yêu cầu hỗ trợ của hãng: mã <strong>{request.code}</strong> · chuyến {request.flightCode} · {REQ_STATUS[reqD.status]?.label || reqD.status} <small className="muted">(trạng thái đề xuất, hãng là mô phỏng)</small></p>
          : <p className="muted" data-testid="monitor-request">Chưa có yêu cầu hỗ trợ trong phiên này. Hãng vẫn là tác nhân mô phỏng (D-27).</p>}
      </section>
      <LockedList area="admin" tab="monitor" />
    </>
  );
}

// SA-FR-033…035; HM-FR-034: ca hỗ trợ/khiếu nại và vòng đời SM-07, ghi chú nội bộ, liên kết đặt phòng theo quyền.
export function CasesTab({ session, simNow }) {
  const { cases, bookings, accounts } = usePartner();
  const [open, setOpen] = useState(null); const [msg, setMsg] = useState(null); const [form, setForm] = useState({ extra: {}, note: '' });
  const [nf, setNf] = useState({ title: '', category: '', bookingCode: '' }); const [err, setErr] = useState({}); const [revealed, setRevealed] = useState({});
  const c = cases.find((x) => x.id === open); const canU = can(session.role, 'case', 'U'); const canC = can(session.role, 'case', 'C'); const canV = can(session.role, 'sensitive', 'V');
  const assignees = accounts.filter((a) => ['support', 'ops', 'admin'].includes(a.role) && a.status === 'active');
  const step = (to) => { const r = setCaseStatus(c.id, to, form.extra, session, simNow); setMsg(r.ok ? { ok: true, text: `Đã chuyển sang “${CASE_STATUS[to]}”.` } : { ok: false, text: r.error }); if (r.ok) setForm({ extra: {}, note: form.note }); };
  const create = (e) => { e.preventDefault(); const er = {}; if (!nf.title.trim()) er.title = 'Nhập tiêu đề.'; if (!nf.category) er.category = 'Chọn phân loại.'; setErr(er); if (Object.keys(er).length) return; const id = createCase({ title: nf.title, category: nf.category, link: nf.bookingCode ? { type: 'booking', code: nf.bookingCode } : null, by: session, now: simNow }); setMsg({ ok: true, text: `Đã tạo ca ${id}.` }); setNf({ title: '', category: '', bookingCode: '' }); };
  const linked = c?.link?.code ? bookings.find((b) => b.code === c.link.code) : null;
  return (
    <>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="cases-msg">{msg.text}</p>}
      {!cases.length ? <EmptyBox title="Chưa có ca hỗ trợ">Ca do người dùng cuối, khách sạn hoặc nhân sự tạo sẽ xuất hiện ở đây.</EmptyBox> : (
        <div className="table-wrap"><table className="rights-table" data-testid="cases-table"><thead><tr><th>Mã</th><th>Tiêu đề</th><th>Phân loại</th><th>Người tạo</th><th>Người xử lý</th><th>Trạng thái</th></tr></thead>
          <tbody>{cases.map((x) => (
            <tr key={x.id} data-testid="case-row" data-id={x.id}><td data-label="Mã"><button type="button" className="link-btn" onClick={() => { setOpen(x.id); setForm({ extra: {}, note: '' }); setMsg(null); }} data-testid="case-open"><strong>{x.id}</strong></button></td>
              <td data-label="Tiêu đề">{x.title}</td><td data-label="Phân loại">{x.category || '—'}</td><td data-label="Người tạo">{x.createdBy}</td><td data-label="Người xử lý">{x.assignee || '—'}</td><td data-label="Trạng thái"><Pill tone={x.status === 'Closed' ? 'neutral' : x.status === 'Resolved' ? 'ok' : 'warn'} data-testid="case-status">{CASE_STATUS[x.status]}</Pill></td></tr>))}</tbody></table></div>
      )}
      {c && (
        <section className="card" aria-label="Chi tiết ca" data-testid="case-detail">
          <div className="card-head"><h2>{c.id}: {c.title}</h2><button type="button" className="link-btn" onClick={() => setOpen(null)}>Đóng</button></div>
          <p className="muted">Trạng thái: <strong>{CASE_STATUS[c.status]}</strong>{c.assignee ? ` · người xử lý ${c.assignee}` : ''}{c.conclusion ? ` · kết luận: ${c.conclusion}` : ''}</p>
          {c.link && (
            <p data-testid="case-link">Liên kết đặt phòng: <strong>{c.link.code}</strong>{linked && <> · {propertyName(linked.propertyId)} · tên gọi <strong data-testid="case-guest">{canV && revealed[c.id] ? linked.name : maskName(linked.name)}</strong>{canV && !revealed[c.id] && <ReasonAction label="Xem rõ" confirmLabel="Xác nhận xem rõ" placeholder="Lý do xem rõ" options={['Hỗ trợ khách hàng', 'Xử lý khiếu nại']} testid="case-reveal" onSubmit={(r) => { const x = revealSensitive(session, simNow, `${c.link.code}/tên gọi`, r); if (x.ok) setRevealed({ ...revealed, [c.id]: true }); return x; }} />}</>}</p>
          )}
          <p className="muted">Hỗ trợ chỉ xem; không có thao tác đổi đặt phòng hay giao dịch từ ca (SA-BR-020).</p>
          {canU && caseNext(c.status).length > 0 && (
            <div className="card-inner" data-testid="case-actions">
              {c.status === 'New' && <div className="inline-form"><label className="sr-only" htmlFor="cs-cat">Phân loại</label><select id="cs-cat" value={form.extra.category || ''} onChange={(e) => setForm({ ...form, extra: { ...form.extra, category: e.target.value } })} data-testid="case-category"><option value="">— Phân loại —</option>{activeCatalog('case_categories').map((x) => <option key={x}>{x}</option>)}</select><button type="button" className="btn btn-sm" onClick={() => step('Triaged')} data-testid="case-triage">Phân loại</button></div>}
              {c.status === 'Triaged' && <div className="inline-form"><label className="sr-only" htmlFor="cs-as">Người xử lý</label><select id="cs-as" value={form.extra.assignee || ''} onChange={(e) => setForm({ ...form, extra: { ...form.extra, assignee: e.target.value } })} data-testid="case-assignee"><option value="">— Gán cho —</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.id} ({ROLE_LABEL[a.role]})</option>)}</select><button type="button" className="btn btn-sm" onClick={() => step('Assigned')} data-testid="case-assign">Gán</button></div>}
              {c.status === 'Assigned' && <button type="button" className="btn btn-sm" onClick={() => step('InProgress')} data-testid="case-start">Bắt đầu xử lý</button>}
              {c.status === 'InProgress' && <div className="inline-form"><label className="sr-only" htmlFor="cs-con">Kết luận</label><input id="cs-con" placeholder="Kết luận" value={form.extra.conclusion || ''} onChange={(e) => setForm({ ...form, extra: { ...form.extra, conclusion: e.target.value, reason: e.target.value } })} data-testid="case-conclusion" /><button type="button" className="btn btn-sm" onClick={() => step('Resolved')} data-testid="case-resolve">Đã giải quyết</button><button type="button" className="btn btn-sm" onClick={() => step('Escalated')} data-testid="case-escalate">Chuyển cấp (cần lý do ở ô bên)</button></div>}
              {c.status === 'Escalated' && <div className="inline-form"><button type="button" className="btn btn-sm" onClick={() => step('InProgress')} data-testid="case-return">Trả về xử lý</button></div>}
              {c.status === 'Resolved' && <div className="inline-form"><button type="button" className="btn btn-sm btn-primary" onClick={() => step('Closed')} data-testid="case-close">Đóng ca</button><input aria-label="Lý do mở lại" placeholder="Lý do mở lại" value={form.extra.reason || ''} onChange={(e) => setForm({ ...form, extra: { ...form.extra, reason: e.target.value } })} data-testid="case-reopen-reason" /><button type="button" className="btn btn-sm" onClick={() => step('InProgress')} data-testid="case-reopen">Mở lại</button></div>}
            </div>
          )}
          <h3>Ghi chú nội bộ (không hiển thị cho khách)</h3>
          {c.notes.length ? <ul className="plain-list" data-testid="case-notes">{c.notes.map((n, i) => <li key={i}>{fmtTime(n.at)} · {n.who}: {n.text}</li>)}</ul> : <p className="muted">Chưa có ghi chú.</p>}
          {canU && <div className="inline-form"><label className="sr-only" htmlFor="cs-note">Ghi chú</label><input id="cs-note" className="filter-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="case-note-input" /><button type="button" className="btn btn-sm" onClick={() => { const r = addCaseNote(c.id, form.note, session, simNow); if (r.ok) setForm({ ...form, note: '' }); else setMsg({ ok: false, text: r.error }); }} data-testid="case-note-add">Thêm ghi chú</button></div>}
          <h3>Lịch sử</h3>
          <ul className="plain-list" data-testid="case-history">{c.history.map((h, i) => <li key={i}>{fmtTime(h.at)} · {h.from ? `${CASE_STATUS[h.from]} → ` : ''}{CASE_STATUS[h.to]} · {h.who}{h.reason ? ` · ${h.reason}` : ''}</li>)}</ul>
        </section>
      )}
      {canC && (
        <form className="card" onSubmit={create} noValidate data-testid="case-form">
          <h2>Tạo ca hỗ trợ</h2>
          <div className="grid-2">
            <Field id="nc-t" label="Tiêu đề" error={err.title}><input id="nc-t" value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} data-testid="case-title" /></Field>
            <Field id="nc-c" label="Phân loại (bắt buộc)" error={err.category}><select id="nc-c" value={nf.category} onChange={(e) => setNf({ ...nf, category: e.target.value })} data-testid="case-new-category"><option value="">— Chọn —</option>{activeCatalog('case_categories').map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field id="nc-b" label="Mã đặt phòng liên quan (nếu có)"><input id="nc-b" value={nf.bookingCode} onChange={(e) => setNf({ ...nf, bookingCode: e.target.value })} /></Field>
          </div>
          <button type="submit" className="btn btn-primary" data-testid="case-create">Tạo ca</button>
        </form>
      )}
      <p className="muted">SLA và kênh tiếp nhận chờ quyết định (OQ-57).</p>
      <LockedList area="admin" tab="cases" />
    </>
  );
}

// SA-FR-025, 026, 028: audit log với bộ lọc, phân trang, che trường, xem rõ có lý do. SA-FR-027 chờ OQ-49.
export function AuditTab({ session, simNow }) {
  const { log, bookings, pickups, accounts, locked } = usePartner();
  const [role, setRole] = useState('all'); const [res, setRes] = useState('all'); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const rows = log.filter((l) => (role === 'all' || l.role === role) && (res === 'all' || l.result === res) && (!q.trim() || `${l.action} ${l.target} ${l.who} ${l.cid}`.toLowerCase().includes(q.trim().toLowerCase())));
  const PS = 8; const pages = Math.max(1, Math.ceil(rows.length / PS)); const cur = Math.min(page, pages); const shown = rows.slice((cur - 1) * PS, cur * PS);
  const d = log.find((l) => l.n === open);
  const props = allProperties();
  return (
    <>
      <Kpi items={[['Cơ sở đang hiển thị', props.filter((p) => !locked[p.id]).length, 'st-1'], ['Đặt phòng đã xác nhận', bookings.filter((b) => b.status === 'confirmed').length, 'st-2'], ['Chờ xác nhận', bookings.filter((b) => b.status === 'pending').length, 'st-3'], ['Đã từ chối', bookings.filter((b) => b.status === 'rejected').length, 'st-4'], ['Yêu cầu đón đang xử lý', pickups.filter((x) => !['done', 'failed'].includes(x.status)).length, 'st-5'], ['Tài khoản hoạt động', accounts.filter((a) => a.status === 'active').length, 'st-6']]} />
      <div className="filter-bar" role="group" aria-label="Lọc audit log">
        {[['all', 'Tất cả'], ...Object.keys(ROLE_LABEL).map((r) => [r, ROLE_LABEL[r]])].map(([k, l]) => <button key={k} type="button" className={`chip ${role === k ? 'on' : ''}`} aria-pressed={role === k} onClick={() => { setRole(k); setPage(1); }} data-testid={`audit-role-${k}`}>{l}</button>)}
        <label className="sr-only" htmlFor="au-res">Kết quả</label>
        <select id="au-res" value={res} onChange={(e) => { setRes(e.target.value); setPage(1); }} data-testid="audit-result"><option value="all">Mọi kết quả</option><option value="ok">Thành công</option><option value="denied">Bị từ chối</option></select>
        <label className="sr-only" htmlFor="au-q">Tìm</label>
        <input id="au-q" className="filter-input" placeholder="Tìm theo thao tác, đối tượng, người, correlation ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} data-testid="audit-search" />
        <span className="muted" data-testid="audit-count">{rows.length} bản ghi</span>
      </div>
      {rows.length === 0 ? <EmptyBox title="Chưa có thao tác nào">Thao tác của nhân sự khách sạn và Airrest được ghi ở đây, chỉ thêm, không sửa hoặc xóa. Nhật ký chỉ lưu trong phiên.</EmptyBox> : (
        <div className="table-wrap"><table className="rights-table" data-testid="log-table">
          <thead><tr><th>Lúc</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Kết quả</th><th>Chi tiết</th></tr></thead>
          <tbody>{shown.map((l) => <tr key={l.n} data-testid="log-row"><td data-label="Lúc">{fmtTime(l.at)}</td><td data-label="Người thực hiện">{l.who} <small>({ROLE_LABEL[l.role] || l.role})</small></td><td data-label="Thao tác">{l.action}</td><td data-label="Đối tượng">{l.target}</td>
            <td data-label="Kết quả"><Pill tone={l.result === 'ok' ? 'ok' : 'error'}>{l.result === 'ok' ? 'Thành công' : 'Bị từ chối'}</Pill></td><td data-label="Chi tiết"><button type="button" className="link-btn" onClick={() => setOpen(l.n)} data-testid="audit-open">Xem</button></td></tr>)}</tbody></table></div>
      )}
      <Pager page={cur} pages={pages} onPage={setPage} />
      {d && (
        <section className="card" aria-label="Chi tiết bản ghi" data-testid="audit-detail">
          <div className="card-head"><h2>Bản ghi #{d.n}</h2><button type="button" className="link-btn" onClick={() => setOpen(null)}>Đóng</button></div>
          <dl className="spec"><div><dt>Actor</dt><dd>{d.who} · {ROLE_LABEL[d.role] || d.role}</dd></div><div><dt>Hành động / đối tượng</dt><dd>{d.action} · {d.target}</dd></div><div><dt>Thời điểm</dt><dd>{fmtTime(d.at)} (giờ mô phỏng)</dd></div><div><dt>Kết quả</dt><dd>{d.result}</dd></div><div><dt>Lý do</dt><dd>{d.reason || '—'}</dd></div><div><dt>Correlation ID</dt><dd data-testid="audit-cid">{d.cid}</dd></div><div><dt>Trước → Sau</dt><dd>{d.before !== '' || d.after !== '' ? `${d.before === '' ? '—' : String(d.before)} → ${d.after === '' ? '—' : String(d.after)}` : '—'}</dd></div><div><dt>Ghi chú</dt><dd>{d.detail || '—'}</dd></div></dl>
          <p className="muted">Bản ghi không chứa mật khẩu, token hay dữ liệu nhạy cảm; trường nhạy cảm chỉ ghi “đã đổi”.</p>
        </section>
      )}
      <p className="muted" data-testid="audit-note">Audit log chỉ thêm: không có thao tác sửa hoặc xóa nào. Thời hạn lưu, bằng chứng toàn vẹn và quyền truy cập chi tiết chờ chính sách (OQ-49).</p>
      <LockedList area="admin" tab="log" />
    </>
  );
}

// SA-FR-039…041: báo cáo tổng hợp theo quyền, xuất có lý do và audit.
export function ReportsTab({ session, simNow }) {
  const { accounts, profiles, bookings, cases, incidents, quality } = usePartner();
  const [reason, setReason] = useState('Báo cáo nội bộ'); const [msg, setMsg] = useState(null); const [which, setWhich] = useState('bookings');
  const count = (arr, f) => arr.filter(f).length;
  const canE = can(session.role, 'report', 'E');
  const sets = {
    accounts: [['Vai trò', 'Hoạt động', 'Khoá', 'Vô hiệu', 'Đã mời'], Object.keys(ROLE_LABEL).map((r) => [ROLE_LABEL[r], ...['active', 'locked', 'disabled', 'invited'].map((s) => count(accounts, (a) => a.role === r && a.status === s))])],
    partners: [['Trạng thái hồ sơ', 'Số lượng'], ['Draft', 'PendingReview', 'NeedsInfo', 'Active', 'Rejected', 'Suspended', 'Deactivated'].map((s) => [s, count(Object.values(profiles), (p) => p.status === s)])],
    bookings: [['Cơ sở', 'Chờ xác nhận', 'Đã xác nhận', 'Đã từ chối'], [...new Set(bookings.map((b) => b.propertyId))].map((id) => [propertyName(id), ...['pending', 'confirmed', 'rejected'].map((s) => count(bookings, (b) => b.propertyId === id && b.status === s))])],
    cases: [['Trạng thái ca', 'Số lượng'], Object.keys(CASE_STATUS).map((s) => [CASE_STATUS[s], count(cases, (c) => c.status === s)])],
  };
  const [head, rows] = sets[which];
  const doExport = () => { const r = exportCsv(session, simNow, `bao-cao-${which}`, head, rows, reason); setMsg(r.ok ? { ok: true, text: `Đã xuất ${r.count} dòng.` } : { ok: false, text: r.error }); };
  return (
    <>
      <p className="muted">Báo cáo mặc định ở mức tổng hợp, không có dữ liệu cá nhân chi tiết (SA-BR-023). Chỉ số: đếm bản ghi theo trạng thái trong phiên hiện tại; múi giờ và tiền tệ theo mặc định (OQ-60).</p>
      <Kpi items={[['Tài khoản', accounts.length, 'rp-accounts'], ['Hồ sơ đối tác', Object.keys(profiles).length, 'rp-partners'], ['Đặt phòng', bookings.length, 'rp-bookings'], ['Ca hỗ trợ', cases.length, 'rp-cases'], ['Sự cố hệ thống', incidents.length, 'rp-incidents'], ['Sự cố đối tác', quality.length, 'rp-quality']]} />
      <SubTabs label="Chọn báo cáo" value={which} onChange={(v) => { setWhich(v); setMsg(null); }} tabs={[['bookings', 'Đặt phòng'], ['partners', 'Đối tác'], ['accounts', 'Tài khoản'], ['cases', 'Ca hỗ trợ']]} />
      <div className="table-wrap"><table className="rights-table" data-testid="report-table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={head[j]}>{c}</td>)}</tr>) : <tr><td colSpan={head.length}>Không có dữ liệu.</td></tr>}</tbody></table></div>
      {canE ? (
        <div className="card"><h2>Xuất báo cáo</h2><p className="muted">Cần quyền xuất, có lý do và được ghi audit.</p>
          <div className="inline-form"><label className="sr-only" htmlFor="ar-r">Lý do xuất</label><select id="ar-r" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="export-reason">{['Báo cáo nội bộ', 'Đối soát', 'Yêu cầu kiểm toán'].map((r) => <option key={r}>{r}</option>)}</select><button type="button" className="btn btn-primary" onClick={doExport} data-testid="export-csv">Xuất CSV</button></div>
          {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="export-msg">{msg.text}</p>}</div>
      ) : <p className="muted" data-testid="no-export">Vai trò này không có quyền xuất báo cáo.</p>}
      <LockedList area="admin" tab="reports" />
    </>
  );
}
