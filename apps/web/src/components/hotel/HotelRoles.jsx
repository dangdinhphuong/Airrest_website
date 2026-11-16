import React, { useMemo, useState } from 'react';
import { ConfirmDialog, DataTable, FormField, Modal, PageHeader, Tag } from '../ui';
import { Notice } from '../Common';
import { useApp } from '../../state/store';
import { createRole, deleteRole, listPermissions, listRoles, patchRole, staffErr } from '../../data/hotelStaff';
import { useAction, useLoad } from './kit';

const groupBy = (items) => { const m = new Map(); for (const p of items) { if (!m.has(p.group)) m.set(p.group, []); m.get(p.group).push(p); } return [...m.entries()]; };

// Tạo/sửa vai trò: chỉ quyền chính mình đang có mới chọn được (khớp assertCovers của máy chủ); quyền khác bị khóa kèm giải thích.
function RoleForm({ role, catalog, mine, onClose, onSaved }) {
  const [f, setF] = useState({ name: role?.name || '', description: role?.description || '', perms: new Set(role?.permissions || []) });
  const { run, busy, note } = useAction(staffErr);
  const groups = useMemo(() => groupBy(catalog), [catalog]);
  const toggle = (keys, on) => { const s = new Set(f.perms); keys.forEach((k) => (on ? s.add(k) : s.delete(k))); setF({ ...f, perms: s }); };
  const submit = async (e) => {
    e.preventDefault();
    const body = { name: f.name.trim(), description: f.description.trim(), permissions: [...f.perms] };
    const ok = await run(() => (role ? patchRole(role.id, body) : createRole({ ...body, description: body.description || undefined })), role ? 'Đã lưu vai trò.' : 'Đã tạo vai trò.');
    if (ok) { onSaved(role ? 'Đã lưu vai trò.' : 'Đã tạo vai trò.'); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title={role ? `Sửa vai trò: ${role.name}` : 'Tạo vai trò'} size="lg" locked={busy}>
      <form onSubmit={submit} data-testid="role-form">
        {note}
        <div className="grid-2">
          <FormField id="hr-name" label="Tên vai trò (2–60 ký tự)"><input id="hr-name" required minLength={2} maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-autofocus="" data-testid="hr-name" /></FormField>
          <FormField id="hr-desc" label="Mô tả (tối đa 200 ký tự)"><input id="hr-desc" maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="hr-desc" /></FormField>
        </div>
        <p className="muted" style={{ margin: '4px 0 8px' }}>Đã chọn {f.perms.size} quyền. Quyền mờ là quyền bạn không có nên không gán được cho người khác.</p>
        {groups.map(([g, ps]) => {
          const usable = ps.filter((p) => mine.has(p.key));
          const all = usable.length > 0 && usable.every((p) => f.perms.has(p.key));
          return (
            <fieldset key={g} style={{ border: '1px solid var(--line)', borderRadius: 10, margin: '0 0 12px', padding: '8px 12px' }}>
              <legend><strong>{g}</strong></legend>
              <label className="check"><input type="checkbox" checked={all} disabled={!usable.length} onChange={(e) => toggle(usable.map((p) => p.key), e.target.checked)} /> Chọn cả nhóm</label>
              {ps.map((p) => (
                <label key={p.key} className="check" style={{ marginBottom: 8, alignItems: 'flex-start', opacity: mine.has(p.key) ? 1 : 0.55 }}>
                  <input type="checkbox" checked={f.perms.has(p.key)} disabled={!mine.has(p.key)} onChange={(e) => toggle([p.key], e.target.checked)} data-testid={`perm-${p.key}`} />
                  <span><code>{p.key}</code><br /><small>{p.description}{!mine.has(p.key) && ' Bạn không có quyền này nên không gán được.'}</small></span>
                </label>
              ))}
            </fieldset>
          );
        })}
        <div className="row-actions">
          <button className="btn btn-primary" disabled={busy || !f.perms.size || f.name.trim().length < 2} data-testid="role-save">{role ? 'Lưu' : 'Tạo vai trò'}</button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Hủy</button>
          {!f.perms.size && <small>Chọn ít nhất một quyền.</small>}
        </div>
      </form>
    </Modal>
  );
}

export default function HotelRoles() {
  const { state } = useApp();
  const mine = useMemo(() => new Set(state.session?.permissions || []), [state.session]);
  const roles = useLoad(listRoles, []);
  const perms = useLoad(listPermissions, []);
  const [form, setForm] = useState(null); // {} tạo, { role } sửa
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);
  const [ok, setOk] = useState('');
  const act = useAction(staffErr);
  const catalog = perms.data?.items;
  const labelOf = (k) => catalog?.find((p) => p.key === k)?.description || k;
  const doDelete = async () => {
    const r = del;
    const done = await act.run(() => deleteRole(r.id), `Đã xóa vai trò ${r.name}.`);
    if (!done) throw new Error('failed'); // giữ hộp mở, thông báo lỗi (ROLE_IN_USE...) hiện phía trên bảng
    roles.reload();
  };
  const columns = [
    { key: 'name', header: 'Vai trò', render: (r) => <><strong>{r.name}</strong> <span style={{ display: 'inline-block' }}>{r.system ? <Tag tone="info">Mẫu</Tag> : <Tag tone="ok">Tùy chỉnh</Tag>}</span></> },
    { key: 'desc', header: 'Mô tả', render: (r) => r.description || '—' },
    { key: 'cnt', header: 'Nhân viên đang dùng', render: (r) => r.accountCount },
    { key: 'p', header: 'Quyền', render: (r) => r.permissions.length },
    { key: 'act', header: 'Thao tác', render: (r) => (
      <span className="inline-form">
        <button type="button" className="btn btn-sm" onClick={() => setView(r)} data-testid="role-view">Xem quyền</button>
        {r.system ? <small data-testid="role-sample-note">Vai trò mẫu chỉ xem.</small> : (
          <>
            <button type="button" className="btn btn-sm" disabled={!catalog} onClick={() => setForm({ role: r })} data-testid="role-edit">Sửa</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setDel(r)} data-testid="role-delete">Xóa</button>
          </>
        )}
      </span>) },
  ];
  return (
    <>
      <PageHeader title="Vai trò và phân quyền" description="Vai trò của khách sạn này, tách biệt với vai trò quản trị Airrest: quyền ở đây chỉ tác động tới nhân viên của khách sạn bạn."
        actions={<button type="button" className="btn btn-primary" disabled={!catalog} onClick={() => setForm({})} data-testid="role-new">Tạo vai trò</button>} />
      {ok && <Notice tone="ok" onClose={() => setOk('')}>{ok}</Notice>}
      {act.note}
      {perms.err && <Notice tone="error">Không tải được danh mục quyền: {staffErr(perms.err)}</Notice>}
      <DataTable columns={columns} rows={roles.data?.items || []} rowKey={(r) => r.id} loading={roles.loading} error={roles.err && staffErr(roles.err)} onRetry={roles.reload} empty="Chưa có vai trò." />
      {form && catalog && <RoleForm key={form.role?.id || 'new'} role={form.role} catalog={catalog} mine={mine} onClose={() => setForm(null)} onSaved={(m) => { setOk(m); roles.reload(); }} />}
      {view && (
        <Modal open onClose={() => setView(null)} title={`${view.name} (${view.permissions.length} quyền)`} size="md" footer={<button type="button" className="btn" onClick={() => setView(null)}>Đóng</button>}>
          <ul className="plain-list" data-testid="role-detail">{view.permissions.map((k) => <li key={k}><code>{k}</code> <small>{labelOf(k)}</small></li>)}</ul>
        </Modal>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} testid="role-del-dlg" variant="danger" title="Xóa vai trò?" confirmLabel="Xóa vai trò"
        description={del && `Xóa vai trò "${del.name}"? Nếu còn nhân viên đang dùng, hệ thống sẽ từ chối.`} onConfirm={doDelete} />
    </>
  );
}
