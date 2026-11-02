import React, { useState } from 'react';
import { EmptyBox, Field } from '../Common';
import { LockedList, Pill, PROFILE_TONE, ReasonAction, SubTabs } from './ui';
import { PROFILE_STATUS, ROLE_LABEL, accountLabel, activeBookingsOf, activeCatalog, allProperties, assignRole, createQuality, deactivate, decideProfile, inviteAccount, acceptInvite, expireInvite, revokeSession, setAccountStatus, setSuspended, startSession, usePartner, propertyName } from '../../mock/partner';
import { GRANTABLE, ROLE_META, can } from '../../lib/rbac';
import { fmtTime, money } from '../../lib/time';
import { useApp } from '../../state/store';

// SA-FR-011…013, HM-FR-039: danh sách đối tác, hàng chờ duyệt hồ sơ, tạm ngưng/khôi phục/ngừng hợp tác, ghi nhận sự cố chất lượng.
export function PartnersTab({ session, simNow }) {
  const P = usePartner(); const { getProperty } = useApp();
  const [ap, setAp] = useState('all'); const [st, setSt] = useState('all'); const [q, setQ] = useState(''); const [msg, setMsg] = useState(null);
  const canA = can(session.role, 'partner', 'A'); const canX = can(session.role, 'partner', 'X');
  const queue = Object.entries(P.profiles).filter(([, pr]) => ['PendingReview', 'NeedsInfo'].includes(pr.status));
  const rows = allProperties().filter((p) => (ap === 'all' || p.airport === ap) && (st === 'all' || (P.profiles[p.id]?.status === st)) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const note = (r, ok) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
  const [qf, setQf] = useState({ propertyId: allProperties()[0].id, category: '', desc: '', bookingCode: '' }); const [qmsg, setQmsg] = useState(null);
  const submitQ = (e) => { e.preventDefault(); const r = createQuality(qf, session, simNow); setQmsg(r.ok ? { ok: true, text: `Đã ghi nhận ${r.id}.` } : { ok: false, text: r.error }); if (r.ok) setQf({ ...qf, desc: '', bookingCode: '' }); };
  return (
    <>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="partners-msg">{msg.text}</p>}
      <section className="card" aria-label="Hồ sơ chờ xử lý" data-testid="review-queue">
        <h2>Hồ sơ chờ xử lý ({queue.length})</h2>
        {!queue.length ? <p className="muted" data-testid="review-empty">Không có hồ sơ nào đang chờ duyệt.</p> : queue.map(([id, pr]) => (
          <article key={id} className="review-card" data-testid="review-card" data-id={id}>
            <div className="card-head"><h3>{pr.name} <small>· {id}{pr.isApplication ? ' (hồ sơ mới)' : ''}</small></h3><Pill tone={PROFILE_TONE[pr.status]} data-testid="review-status">{PROFILE_STATUS[pr.status]}</Pill></div>
            <p className="muted">{pr.type} · {pr.address || 'chưa có địa chỉ'} · {pr.airport}{pr.reason ? ` · ${pr.reason}` : ''}</p>
            {canA && pr.status === 'PendingReview' && (
              <div className="row-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => note(decideProfile(id, 'approve', null, session, simNow), `Đã duyệt ${pr.name}.`)} data-testid="approve-profile">Duyệt</button>
                <ReasonAction label="Từ chối" confirmLabel="Xác nhận từ chối" placeholder="Lý do từ chối" testid="reject-profile" onSubmit={(r) => { const x = decideProfile(id, 'reject', r, session, simNow); if (x.ok) note(x, `Đã từ chối ${pr.name}.`); return x; }} />
                <ReasonAction label="Yêu cầu bổ sung" confirmLabel="Gửi yêu cầu" placeholder="Cần bổ sung gì" testid="info-profile" onSubmit={(r) => { const x = decideProfile(id, 'info', r, session, simNow); if (x.ok) note(x, 'Đã yêu cầu bổ sung.'); return x; }} />
              </div>
            )}
          </article>
        ))}
      </section>
      <div className="filter-bar" role="group" aria-label="Lọc đối tác">
        {[['all', 'Tất cả'], ['HAN', 'Nội Bài'], ['SGN', 'Tân Sơn Nhất']].map(([k, l]) => <button key={k} type="button" className={`chip ${ap === k ? 'on' : ''}`} aria-pressed={ap === k} onClick={() => setAp(k)}>{l}</button>)}
        <label className="sr-only" htmlFor="pt-st">Trạng thái hồ sơ</label>
        <select id="pt-st" value={st} onChange={(e) => setSt(e.target.value)} data-testid="partner-status-filter"><option value="all">Mọi trạng thái</option>{Object.entries(PROFILE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="sr-only" htmlFor="pt-q">Tìm theo tên</label>
        <input id="pt-q" className="filter-input" placeholder="Tìm theo tên" value={q} onChange={(e) => setQ(e.target.value)} data-testid="partner-search" />
        <span className="muted" data-testid="partner-count">{rows.length} đối tác</span>
      </div>
      <div className="table-wrap">
        <table className="rights-table" data-testid="properties-table">
          <thead><tr><th>Đối tác</th><th>Sân bay</th><th>Phòng bán hôm nay</th><th>Giá</th><th>Đặt chỗ đang giữ</th><th>Hồ sơ</th><th>Xử lý</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const o = getProperty(p.id, simNow) || p; const pr = P.profiles[p.id]; const n = activeBookingsOf(p.id);
              return (
                <tr key={p.id} data-testid="property-row" data-id={p.id}>
                  <td data-label="Đối tác"><strong>{o.name}</strong>{o.isNew && <small> (mới)</small>}</td><td data-label="Sân bay">{o.airport}</td>
                  <td data-label="Phòng bán hôm nay">{o.roomsLeft}</td><td data-label="Giá">{money(o.price)}</td><td data-label="Đặt chỗ đang giữ">{n}</td>
                  <td data-label="Hồ sơ"><Pill tone={PROFILE_TONE[pr?.status]} data-testid="property-status">{PROFILE_STATUS[pr?.status] || '—'}</Pill></td>
                  <td data-label="Xử lý">
                    {canX && pr?.status === 'Active' && <ReasonAction label="Tạm ngưng" confirmLabel="Xác nhận tạm ngưng" placeholder="Lý do tạm ngưng" testid="suspend" onSubmit={(r) => { const x = setSuspended(p.id, true, r, session, simNow); if (x.ok) note(x, `Đã tạm ngưng ${o.name}. Đặt phòng đã xác nhận không bị hủy.`); return x; }} />}
                    {canX && pr?.status === 'Suspended' && <ReasonAction label="Khôi phục" confirmLabel="Xác nhận khôi phục" placeholder="Lý do khôi phục" testid="restore" onSubmit={(r) => { const x = setSuspended(p.id, false, r, session, simNow); if (x.ok) note(x, `Đã khôi phục ${o.name}.`); return x; }} />}
                    {canX && ['Active', 'Suspended'].includes(pr?.status) && <ReasonAction label="Ngừng hợp tác" tone="danger" confirmLabel="Xác nhận ngừng hợp tác" placeholder="Lý do" testid="deactivate" onSubmit={(r) => { const x = deactivate(p.id, r, session, simNow); if (x.ok) note(x, `Đã ngừng hợp tác ${o.name}.`); return x; }} />}
                    {!canX && <small className="muted">Chỉ xem</small>}
                    {n > 0 && pr?.status === 'Active' && canX && <small className="block muted">Còn {n} đặt chỗ đang giữ: tạm ngưng không hủy đặt phòng.</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {can(session.role, 'quality', 'C') && (
        <form className="card" onSubmit={submitQ} noValidate data-testid="quality-form">
          <h2>Ghi nhận sự cố chất lượng đối tác</h2>
          <p className="muted">Chỉ ghi nhận và hiển thị; không có điểm số hay khóa tự động khi chưa có ngưỡng được duyệt (OQ-56).</p>
          <div className="grid-2">
            <Field id="q-prop" label="Đối tác"><select id="q-prop" value={qf.propertyId} onChange={(e) => setQf({ ...qf, propertyId: e.target.value })} data-testid="quality-property">{allProperties().map((p) => <option key={p.id} value={p.id}>{p.name} ({p.airport})</option>)}</select></Field>
            <Field id="q-cat" label="Phân loại (danh mục)"><select id="q-cat" value={qf.category} onChange={(e) => setQf({ ...qf, category: e.target.value })} data-testid="quality-category"><option value="">— Chọn —</option>{activeCatalog('incident_types').map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field id="q-desc" label="Mô tả"><input id="q-desc" value={qf.desc} onChange={(e) => setQf({ ...qf, desc: e.target.value })} data-testid="quality-desc" /></Field>
            <Field id="q-bk" label="Mã đặt phòng (nếu có)"><input id="q-bk" value={qf.bookingCode} onChange={(e) => setQf({ ...qf, bookingCode: e.target.value })} /></Field>
          </div>
          <button type="submit" className="btn btn-primary" data-testid="quality-save">Ghi nhận</button>
          {qmsg && <p className={qmsg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="quality-msg">{qmsg.text}</p>}
        </form>
      )}
      <LockedList area="admin" tab="properties" />
    </>
  );
}

// SA-FR-001…005: tài khoản, mời, khóa/vô hiệu hóa, gán vai trò, phiên đăng nhập.
export function AccountsTab({ session, simNow }) {
  const { accounts, sessions } = usePartner(); const { dispatch } = useApp();
  const canC = can(session.role, 'account', 'C'); const canX = can(session.role, 'account', 'X'); const canM = can(session.role, 'account', 'M');
  const grantable = GRANTABLE[session.role] || [];
  const [form, setForm] = useState({ identifier: '', role: grantable[0] || 'staff', propertyId: '' }); const [err, setErr] = useState(''); const [msg, setMsg] = useState(null);
  const [picked, setPicked] = useState({});
  const visible = session.role === 'manager' ? accounts.filter((a) => a.tenantId === session.tenantId) : accounts;
  const invite = (e) => { e.preventDefault(); const r = inviteAccount({ ...form, propertyId: ROLE_META[form.role].area === 'hotel' ? (session.role === 'manager' ? session.tenantId : form.propertyId) : null }, session, simNow); if (!r.ok) { setErr(r.error); return; } setErr(''); setMsg({ ok: true, text: `Đã mời ${r.id}.`, id: r.id }); setForm({ ...form, identifier: '' }); };
  const doStatus = (a, to) => (r) => { const x = setAccountStatus(a.id, to, r, session, simNow); if (x.ok) setMsg({ ok: true, text: `Đã cập nhật ${a.id}.` }); return x; };
  const mySessions = session.role === 'admin' || session.role === 'ops' ? sessions : sessions.filter((s) => s.accountId === session.id);
  return (
    <>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="accounts-msg" data-id={msg.id}>{msg.text}</p>}
      <div className="table-wrap">
        <table className="rights-table" data-testid="accounts-table">
          <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Cơ sở</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id} data-testid="account-row" data-id={a.id}>
                <td data-label="Tài khoản"><strong>{a.id}</strong><small className="block muted">{a.identifier}</small></td>
                <td data-label="Vai trò">{ROLE_LABEL[a.role] || 'Chưa có vai trò'}</td>
                <td data-label="Cơ sở">{a.propertyId ? propertyName(a.propertyId) : a.tenantId === 'T-MOI' ? 'Chưa có (hồ sơ mới)' : '—'}</td>
                <td data-label="Trạng thái"><Pill tone={{ active: 'ok', locked: 'error', disabled: 'neutral', invited: 'warn' }[a.status]} data-testid="account-status">{{ active: 'Hoạt động', locked: 'Đã khoá', disabled: 'Đã vô hiệu', invited: 'Đã mời' }[a.status]}</Pill></td>
                <td data-label="Xử lý">
                  {a.id === session.id ? <small className="muted">Tài khoản đang dùng</small> : (
                    <>
                      {canX && a.status === 'active' && <ReasonAction label="Khoá" confirmLabel="Xác nhận khoá" placeholder="Lý do khoá" testid="lock" onSubmit={doStatus(a, 'locked')} />}
                      {canX && a.status === 'locked' && <ReasonAction label="Mở khoá" confirmLabel="Xác nhận mở khoá" placeholder="Lý do mở khoá" testid="unlock" onSubmit={doStatus(a, 'active')} />}
                      {canX && ['active', 'locked'].includes(a.status) && <ReasonAction label="Vô hiệu hoá" tone="danger" confirmLabel="Xác nhận vô hiệu hoá" placeholder="Lý do" testid="disable" onSubmit={doStatus(a, 'disabled')} />}
                      {canC && a.status === 'invited' && <><button type="button" className="btn btn-sm" onClick={() => acceptInvite(a.id, session, simNow)} data-testid="accept-invite">Mô phỏng chấp nhận lời mời</button><button type="button" className="btn btn-sm" onClick={() => expireInvite(a.id, session, simNow)} data-testid="expire-invite">Hết hạn lời mời</button></>}
                      {canM && a.role !== 'admin' && a.status !== 'invited' && (
                        <span className="inline-form">
                          <label className="sr-only" htmlFor={`rs-${a.id}`}>Vai trò mới</label>
                          <select id={`rs-${a.id}`} value={picked[a.id] || a.role} onChange={(e) => setPicked({ ...picked, [a.id]: e.target.value })} data-testid="role-select">
                            {[...new Set([a.role, ...grantable, 'none'])].map((r) => <option key={r} value={r}>{r === 'none' ? 'Thu hồi vai trò' : ROLE_LABEL[r] || 'Chưa có vai trò'}</option>)}
                          </select>
                          <button type="button" className="btn btn-sm" onClick={() => { const x = assignRole(a.id, picked[a.id] || a.role, session, simNow); setMsg(x.ok ? { ok: true, text: `Đã đổi vai trò ${a.id}.` } : { ok: false, text: x.error }); }} data-testid="role-apply">Áp dụng</button>
                        </span>
                      )}
                      {!canX && !canM && !canC && <small className="muted">Chỉ xem</small>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canC && (
        <form className="card" onSubmit={invite} noValidate data-testid="invite-form">
          <h2>Mời tài khoản</h2>
          <p className="muted">Chỉ cấp được vai trò không vượt quyền của bạn. Định danh duy nhất toàn hệ thống. Cơ chế xác thực thật chưa chọn (OQ-48).</p>
          <div className="grid-2">
            <Field id="iv-id" label="Định danh (địa chỉ thư)" error={err}><input id="iv-id" value={form.identifier} onChange={(e) => { setForm({ ...form, identifier: e.target.value }); setErr(''); }} data-testid="invite-identifier" /></Field>
            <Field id="iv-role" label="Vai trò"><select id="iv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="invite-role">{grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            {ROLE_META[form.role].area === 'hotel' && session.role === 'admin' && <Field id="iv-prop" label="Cơ sở"><select id="iv-prop" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} data-testid="invite-property"><option value="">— Chọn cơ sở —</option>{allProperties().map((p) => <option key={p.id} value={p.id}>{p.name} ({p.airport})</option>)}</select></Field>}
          </div>
          <button type="submit" className="btn btn-primary" data-testid="invite-submit">Gửi lời mời</button>
        </form>
      )}
      <section className="card" aria-label="Phiên đăng nhập">
        <h2>Phiên đăng nhập ({mySessions.filter((s) => !s.revoked).length} đang hoạt động)</h2>
        {mySessions.length ? (
          <div className="table-wrap"><table className="rights-table" data-testid="sessions-table"><thead><tr><th>Phiên</th><th>Tài khoản</th><th>Bắt đầu</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
            <tbody>{mySessions.map((s) => (
              <tr key={s.id} data-testid="session-row" data-id={s.id}><td data-label="Phiên">{s.id}</td><td data-label="Tài khoản">{s.accountId}</td><td data-label="Bắt đầu">{fmtTime(s.startAt)}</td>
                <td data-label="Trạng thái"><Pill tone={s.revoked ? 'neutral' : 'ok'}>{s.revoked ? 'Đã thu hồi' : 'Đang hoạt động'}</Pill></td>
                <td data-label="Xử lý">{!s.revoked && <button type="button" className="btn btn-sm" onClick={() => revokeSession(s.id, session, simNow)} data-testid="revoke-session">{s.id === session.sid ? 'Đăng xuất phiên này' : 'Thu hồi'}</button>}</td></tr>))}</tbody></table></div>
        ) : <p className="muted">Chưa có phiên nào.</p>}
        <p className="muted">Phiên hết hạn theo thời gian không hoạt động chưa được đặt (OQ-48). Thu hồi, khóa hoặc đổi vai trò có hiệu lực ngay.</p>
      </section>
      <LockedList area="admin" tab="accounts" />
    </>
  );
}
