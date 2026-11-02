import React, { useState } from 'react';
import { Field, Notice } from '../Common';
import { LockedList, Pill, ReasonAction, SubTabs } from './ui';
import { SIM, SIM_LIMITS, resetSimParams, setSimParam, validateSimParam } from '../../config/simulation';
import { catalogAdd, catalogDelete, catalogInUse, catalogToggle, decideChange, guard, logConfig, proposeFlagChange, revealSensitive, rollbackChange, usePartner } from '../../mock/partner';
import { PERMS, RESOURCES, ROLE_META, ROLE_ORDER, can, permSummary } from '../../lib/rbac';
import { fmtTime } from '../../lib/time';

// SA-FR-006…010: danh mục vai trò, ma trận quyền, trình thử quyền (deny by default, tenant), che dữ liệu nhạy cảm.
export function RbacTab({ session, simNow }) {
  const [t, setT] = useState({ role: 'staff', resource: 'booking', action: 'A', tenant: 'own' }); const [res, setRes] = useState(null);
  const [reason, setReason] = useState('Hỗ trợ khách hàng'); const [shown, setShown] = useState(false); const [revealMsg, setRevealMsg] = useState(null);
  const test = () => { const r = guard({ id: 'trình thử', role: t.role, tenantId: 'T-A' }, t.resource, t.action, t.tenant === 'own' ? 'T-A' : 'T-B', simNow); setRes(r); };
  const reveal = () => { const r = revealSensitive(session, simNow, 'DC-S001/tên gọi', reason); if (r.ok) { setShown(true); setRevealMsg(null); } else setRevealMsg(r.error); };
  return (
    <>
      <Notice tone="info" title="Ma trận quyền đề xuất">Chưa được PO và Security duyệt (OQ-55). Deny by default: ô trống là không có quyền. Quyền được kiểm tra ở backend/API; ẩn nút trên giao diện không phải cơ chế bảo mật. Chỉnh sửa vai trò tùy chỉnh đi qua phê duyệt thay đổi và chưa được xây (SA-FR-006).</Notice>
      <div className="table-wrap">
        <table className="rights-table matrix" data-testid="rbac-matrix">
          <thead><tr><th>Tài nguyên</th>{ROLE_ORDER.map((r) => <th key={r}>{ROLE_META[r].act}<small className="block">{ROLE_META[r].label}</small></th>)}</tr></thead>
          <tbody>{Object.entries(RESOURCES).map(([k, label]) => <tr key={k} data-resource={k}><td data-label="Tài nguyên"><strong>{label}</strong></td>{ROLE_ORDER.map((r) => <td key={r} data-label={ROLE_META[r].label} data-role={r}>{permSummary(r, k)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="muted">C tạo · R đọc · U sửa · S gửi duyệt · A duyệt/từ chối · X hủy/vô hiệu · E xuất · M quản lý người dùng và quyền · V xem trường nhạy cảm. Không vai trò nào có quyền sửa hoặc xóa audit log.</p>
      <form className="card" onSubmit={(e) => { e.preventDefault(); test(); }} data-testid="policy-tester">
        <h2>Trình thử quyền (mô phỏng)</h2>
        <p className="muted">Gọi thử một thao tác dưới vai trò đã chọn. Kết quả theo cùng hàm kiểm quyền mà các thao tác thật dùng; thao tác bị từ chối được ghi audit.</p>
        <div className="grid-2">
          <Field id="tp-role" label="Vai trò"><select id="tp-role" value={t.role} onChange={(e) => setT({ ...t, role: e.target.value })} data-testid="tp-role">{ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}</select></Field>
          <Field id="tp-res" label="Tài nguyên"><select id="tp-res" value={t.resource} onChange={(e) => setT({ ...t, resource: e.target.value })} data-testid="tp-resource">{Object.entries(RESOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field id="tp-act" label="Hành động"><select id="tp-act" value={t.action} onChange={(e) => setT({ ...t, action: e.target.value })} data-testid="tp-action">{'CRUSAXEMV'.split('').map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field id="tp-ten" label="Dữ liệu thuộc"><select id="tp-ten" value={t.tenant} onChange={(e) => setT({ ...t, tenant: e.target.value })} data-testid="tp-tenant"><option value="own">Tenant của vai trò thử</option><option value="other">Tenant khác</option></select></Field>
        </div>
        <button type="submit" className="btn btn-primary" data-testid="tp-run">Gọi thử</button>
        {res && <p className={res.ok ? 'ok-line' : 'field-error'} role="status" data-testid="tp-result">{res.status} · {res.ok ? 'Được phép' : `Từ chối: ${res.reason}`}</p>}
      </form>
      <section className="card" data-testid="mask-demo">
        <h2>Che dữ liệu nhạy cảm</h2>
        <p className="muted">Trường nhạy cảm được che mặc định; xem rõ cần quyền V, lý do và được ghi audit.</p>
        <p>Tên gọi khách (đặt phòng DC-S001): <strong data-testid="mask-value">{shown ? 'Khách thử 1' : 'K***********'}</strong></p>
        {!shown && can(session.role, 'sensitive', 'V') && (
          <div className="inline-form"><label className="sr-only" htmlFor="rv-r">Lý do xem rõ</label>
            <select id="rv-r" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reveal-reason">{['Hỗ trợ khách hàng', 'Xử lý khiếu nại', 'Kiểm tra sự cố'].map((r) => <option key={r}>{r}</option>)}</select>
            <button type="button" className="btn btn-sm" onClick={reveal} data-testid="reveal-btn">Xem rõ</button></div>
        )}
        {!can(session.role, 'sensitive', 'V') && <p className="muted" data-testid="no-reveal">Vai trò này không có quyền xem rõ trường nhạy cảm.</p>}
        {revealMsg && <p className="field-error" role="alert">{revealMsg}</p>}
      </section>
      <LockedList area="admin" tab="rbac" />
    </>
  );
}

const CAT_LABEL = { reject_reasons: 'Lý do từ chối đặt phòng', case_categories: 'Phân loại ca hỗ trợ', incident_types: 'Phân loại sự cố đối tác', amenities: 'Tiện ích' };
const FLAG_LABEL = { pickup_request: 'Cho phép người dùng cuối yêu cầu xe đón', guest_case: 'Cho phép người dùng cuối báo vấn đề về đặt phòng' };
const CH_STATUS = { PendingApproval: ['Chờ phê duyệt', 'warn'], Effective: ['Đang hiệu lực', 'ok'], Rejected: ['Bị từ chối', 'error'], Superseded: ['Bị thay thế', 'neutral'], RolledBack: ['Đã rollback', 'neutral'] };

// SA-FR-015, 019, 020 (+ tham số mô phỏng của prototype): danh mục, cờ tính năng, kiểm soát thay đổi.
export function ConfigTab({ session, simNow }) {
  const [sub, setSub] = useState('flags');
  return (
    <>
      <SubTabs label="Cấu hình" value={sub} onChange={setSub} tabs={[['flags', 'Cờ tính năng và thay đổi'], ['catalogs', 'Danh mục'], ['params', 'Tham số mô phỏng']]} />
      {sub === 'flags' && <FlagsPane session={session} simNow={simNow} />}
      {sub === 'catalogs' && <CatalogsPane session={session} simNow={simNow} />}
      {sub === 'params' && <ParamsPane session={session} simNow={simNow} />}
      <LockedList area="admin" tab="config" />
    </>
  );
}
function FlagsPane({ session, simNow }) {
  const { flags, changes } = usePartner(); const canS = can(session.role, 'config', 'S'); const canA = can(session.role, 'approval', 'A'); const [msg, setMsg] = useState(null);
  const note = (r, ok) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
  return (
    <>
      <Notice tone="info" title="Kiểm soát thay đổi">Thay đổi cờ tính năng đi qua: soạn → chờ phê duyệt → có hiệu lực → có thể rollback. Có người lập và người duyệt, có phiên bản. Việc chặn tự phê duyệt đang chờ quyết định (OQ-47), nên hiện chưa chặn.</Notice>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="flags-msg">{msg.text}</p>}
      <div className="table-wrap"><table className="rights-table" data-testid="flags-table"><thead><tr><th>Cờ</th><th>Mô tả</th><th>Giá trị</th><th>Phiên bản</th><th>Xử lý</th></tr></thead>
        <tbody>{Object.entries(flags).map(([k, f]) => (
          <tr key={k} data-testid="flag-row" data-key={k}><td data-label="Cờ"><strong>{k}</strong></td><td data-label="Mô tả">{FLAG_LABEL[k]}</td>
            <td data-label="Giá trị"><Pill tone={f.value ? 'ok' : 'neutral'} data-testid="flag-value">{f.value ? 'Bật' : 'Tắt'}</Pill></td><td data-label="Phiên bản">v{f.version}</td>
            <td data-label="Xử lý">{canS ? <button type="button" className="btn btn-sm" onClick={() => note(proposeFlagChange(k, !f.value, session, simNow), 'Đã gửi thay đổi chờ phê duyệt.')} data-testid="flag-propose">{f.value ? 'Đề xuất tắt' : 'Đề xuất bật'}</button> : <small className="muted">Chỉ xem</small>}</td></tr>))}</tbody></table></div>
      <h3>Thay đổi và phiên bản</h3>
      {!changes.length ? <p className="muted" data-testid="changes-empty">Chưa có thay đổi nào.</p> : (
        <div className="table-wrap"><table className="rights-table" data-testid="changes-table"><thead><tr><th>Mã</th><th>Cờ</th><th>Trước → Sau</th><th>Người lập</th><th>Người duyệt</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
          <tbody>{changes.map((c) => (
            <tr key={c.id} data-testid="change-row" data-id={c.id}><td data-label="Mã">{c.id}</td><td data-label="Cờ">{c.key}</td><td data-label="Trước → Sau">{c.before ? 'Bật' : 'Tắt'} → {c.after ? 'Bật' : 'Tắt'}</td><td data-label="Người lập">{c.maker}</td><td data-label="Người duyệt">{c.approver || '—'}</td>
              <td data-label="Trạng thái"><Pill tone={CH_STATUS[c.status][1]} data-testid="change-status">{CH_STATUS[c.status][0]}</Pill>{c.reason && <small className="block">{c.reason}</small>}</td>
              <td data-label="Xử lý">
                {canA && c.status === 'PendingApproval' && <><button type="button" className="btn btn-sm btn-primary" onClick={() => note(decideChange(c.id, 'approve', null, session, simNow), `Đã duyệt ${c.id}, có hiệu lực ngay.`)} data-testid="change-approve">Duyệt</button>
                  <ReasonAction label="Từ chối" confirmLabel="Xác nhận từ chối" placeholder="Lý do từ chối" testid="change-reject" onSubmit={(r) => { const x = decideChange(c.id, 'reject', r, session, simNow); if (x.ok) note(x, `Đã từ chối ${c.id}.`); return x; }} /></>}
                {canA && c.status === 'Effective' && <ReasonAction label="Rollback" confirmLabel="Xác nhận rollback" placeholder="Lý do rollback" testid="change-rollback" onSubmit={(r) => { const x = rollbackChange(c.id, r, session, simNow); if (x.ok) note(x, `Đã rollback ${c.id}.`); return x; }} />}
              </td></tr>))}</tbody></table></div>
      )}
    </>
  );
}
function CatalogsPane({ session, simNow }) {
  const { catalogs } = usePartner(); const canU = can(session.role, 'config', 'U'); const [cat, setCat] = useState('reject_reasons'); const [label, setLabel] = useState(''); const [msg, setMsg] = useState(null);
  const note = (r, ok) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
  return (
    <>
      <Field id="ct-sel" label="Danh mục"><select id="ct-sel" value={cat} onChange={(e) => { setCat(e.target.value); setMsg(null); }} data-testid="catalog-select">{Object.entries(CAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {msg && <p className={msg.ok ? 'ok-line' : 'field-error'} role="status" data-testid="catalog-msg">{msg.text}</p>}
      <div className="table-wrap"><table className="rights-table" data-testid="catalog-table"><thead><tr><th>Mục</th><th>Trạng thái</th><th>Đang được tham chiếu</th><th>Xử lý</th></tr></thead>
        <tbody>{catalogs[cat].map((it) => {
          const used = catalogInUse(cat, it);
          return (<tr key={it.id} data-testid="catalog-row" data-id={it.id}><td data-label="Mục">{it.label}</td><td data-label="Trạng thái"><Pill tone={it.active ? 'ok' : 'neutral'}>{it.active ? 'Đang dùng' : 'Ngừng dùng'}</Pill></td><td data-label="Đang được tham chiếu">{used ? 'Có' : 'Không'}</td>
            <td data-label="Xử lý">{canU ? <><button type="button" className="btn btn-sm" onClick={() => note(catalogToggle(cat, it.id, session, simNow), 'Đã đổi trạng thái.')} data-testid="catalog-toggle">{it.active ? 'Ngừng dùng' : 'Dùng lại'}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => note(catalogDelete(cat, it.id, session, simNow), 'Đã xóa.')} data-testid="catalog-delete">Xóa</button></> : <small className="muted">Chỉ xem</small>}</td></tr>);
        })}</tbody></table></div>
      {canU && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); const r = catalogAdd(cat, label, session, simNow); note(r, 'Đã thêm mục.'); if (r.ok) setLabel(''); }} noValidate>
          <Field id="ct-new" label="Thêm mục"><input id="ct-new" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="catalog-new" /></Field>
          <button type="submit" className="btn btn-primary" data-testid="catalog-add">Thêm</button>
        </form>
      )}
      <p className="muted">Mục đang được tham chiếu chỉ ngừng dùng, không xóa. Dữ liệu cũ không mất khi ngừng dùng.</p>
    </>
  );
}
function ParamsPane({ session, simNow }) {
  const keys = Object.keys(SIM_LIMITS); const canU = can(session.role, 'config', 'U');
  const [vals, setVals] = useState(() => Object.fromEntries(keys.map((k) => [k, String(SIM[k])]))); const [err, setErr] = useState({}); const [saved, setSaved] = useState(null);
  const save = (e) => {
    e.preventDefault(); const er = {};
    keys.forEach((k) => { const raw = vals[k].trim(); const n = /^-?\d+$/.test(raw) ? Number(raw) : NaN; const m = validateSimParam(k, n); if (m) er[k] = m; });
    setErr(er); setSaved(null); if (Object.keys(er).length) return;
    const changed = []; keys.forEach((k) => { const n = Number(vals[k]); if (SIM[k] !== n) { changed.push(`${k}: ${SIM[k]} → ${n}`); setSimParam(k, n); } });
    if (changed.length) logConfig(session, simNow, 'Sửa tham số mô phỏng', 'SIM', changed.join('; '));
    setSaved(changed.length ? `Đã lưu ${changed.length} thay đổi lúc ${fmtTime(simNow)} (mô phỏng). Có hiệu lực ngay, không cần sửa mã.` : 'Không có thay đổi.');
  };
  const reset = () => { resetSimParams(); setVals(Object.fromEntries(keys.map((k) => [k, String(SIM[k])]))); setErr({}); logConfig(session, simNow, 'Khôi phục tham số mô phỏng mặc định', 'SIM', ''); setSaved('Đã khôi phục giá trị mặc định.'); };
  return (
    <form className="card" onSubmit={save} noValidate>
      <h2>Tham số mô phỏng của prototype</h2>
      <p className="muted">Đây là giả định mô phỏng (D-02, D-04, D-08, D-21), chưa được PO phê duyệt; không phải tham số nghiệp vụ SA-FR-016 (chờ OQ-45, OQ-47). Giờ có mặt không được ít hơn mốc đóng quầy {SIM.counterCloseMin} phút.</p>
      <div className="grid-2">{keys.map((k) => (
        <Field key={k} id={`c-${k}`} label={`${SIM_LIMITS[k][3]} (${SIM_LIMITS[k][2]})`} hint={`Từ ${SIM_LIMITS[k][0]} đến ${SIM_LIMITS[k][1]}`} error={err[k]}>
          <input id={`c-${k}`} inputMode="numeric" value={vals[k]} disabled={!canU} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} data-testid={`param-${k}`} aria-invalid={!!err[k]} />
        </Field>))}</div>
      {canU && <div className="row-actions"><button type="submit" className="btn btn-primary" data-testid="save-params">Lưu tham số</button><button type="button" className="btn" onClick={reset} data-testid="reset-params">Khôi phục mặc định</button></div>}
      {saved && <p className="ok-line" role="status" data-testid="params-saved">{saved}</p>}
    </form>
  );
}
