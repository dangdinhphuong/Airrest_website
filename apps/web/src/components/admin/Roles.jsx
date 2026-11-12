import React, { useMemo, useState } from 'react';
import { Notice, Field } from '../Common';
import { Pill } from '../partner/ui';
import { useApp } from '../../state/store';
import { createRole, patchRole, deleteRole } from '../../data/admin';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { Act, LoadView, Table, useLoad, useRun } from './kit';

const Sens = () => <Pill tone="warn">Nhạy cảm</Pill>;

// Nhóm quyền theo `group` từ /v1/admin/permissions.
const groupBy = (items) => {
  const m = new Map();
  for (const p of items) { if (!m.has(p.group)) m.set(p.group, []); m.get(p.group).push(p); }
  return [...m.entries()];
};

function Detail({ role, catalog, onClose }) {
  const has = new Set(role.permissions);
  const known = new Set(catalog.map((p) => p.key));
  const groups = groupBy(catalog.filter((p) => has.has(p.key)));
  const extra = role.permissions.filter((k) => !known.has(k));
  return (
    <section className="card" data-testid="role-detail" aria-label={`Quyền của vai trò ${role.name}`}>
      <h3>{role.name} <small>({role.permissions.length} quyền)</small></h3>
      {!groups.length && !extra.length && <p>Vai trò chưa có quyền nào.</p>}
      {groups.map(([g, ps]) => (
        <div key={g}><strong>{g}</strong>
          <ul className="plain-list">{ps.map((p) => <li key={p.key}><code>{p.key}</code> {p.sensitive && <Sens />} <small>{p.description}</small></li>)}</ul>
        </div>
      ))}
      {extra.length > 0 && <div><strong>Khác</strong><ul className="plain-list">{extra.map((k) => <li key={k}><code>{k}</code></li>)}</ul></div>}
      <div className="row-actions"><button type="button" className="btn btn-sm" onClick={onClose} data-testid="role-detail-close">Đóng</button></div>
    </section>
  );
}

function RoleForm({ role, catalog, mine, onDone, onCancel }) {
  const [f, setF] = useState({ name: role?.name || '', description: role?.description || '', perms: new Set(role?.permissions || []) });
  const [q, setQ] = useState('');
  const { run, busy, node } = useRun();
  const groups = useMemo(() => groupBy(catalog.filter((p) => !q.trim() || `${p.key} ${p.description} ${p.group}`.toLowerCase().includes(q.trim().toLowerCase()))), [catalog, q]);
  const toggle = (keys, on) => { const s = new Set(f.perms); keys.forEach((k) => (on ? s.add(k) : s.delete(k))); setF({ ...f, perms: s }); };
  const submit = async (e) => {
    e.preventDefault();
    const body = { name: f.name.trim(), description: f.description.trim(), permissions: [...f.perms] };
    const x = await run(() => (role ? patchRole(role.id, body) : createRole({ ...body, description: body.description || undefined })), role ? 'Đã lưu vai trò.' : 'Đã tạo vai trò.');
    if (x.ok) onDone(role ? 'Đã lưu vai trò.' : 'Đã tạo vai trò.');
  };
  return (
    <form onSubmit={submit} className="card" data-testid="role-form">
      <h3>{role ? `Sửa vai trò: ${role.name}` : 'Tạo vai trò'}</h3>
      {node}
      <div className="grid-2">
        <Field id="rl-name" label="Tên vai trò (2–60 ký tự)"><input id="rl-name" required minLength={2} maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field id="rl-desc" label="Mô tả (tối đa 200 ký tự)"><input id="rl-desc" maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <Field id="rl-q" label="Tìm quyền" hint={`Đã chọn ${f.perms.size} quyền. Quyền bạn không có sẽ bị khóa.`}><input id="rl-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên quyền, mô tả hoặc nhóm" /></Field>
      {!groups.length && <p>Không có quyền khớp từ khóa.</p>}
      {groups.map(([g, ps]) => {
        const usable = ps.filter((p) => mine.has(p.key));
        const all = usable.length > 0 && usable.every((p) => f.perms.has(p.key));
        return (
          <fieldset key={g} style={{ border: '1px solid var(--line)', borderRadius: 10, margin: '0 0 12px', padding: '8px 12px' }}>
            <legend><strong>{g}</strong></legend>
            <label className="check"><input type="checkbox" checked={all} disabled={!usable.length} onChange={(e) => toggle(usable.map((p) => p.key), e.target.checked)} /> Chọn cả nhóm</label>
            {ps.map((p) => (
              <label key={p.key} className="check" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={f.perms.has(p.key)} disabled={!mine.has(p.key)} onChange={(e) => toggle([p.key], e.target.checked)} data-testid={`perm-${p.key}`} />
                <span><code>{p.key}</code> {p.sensitive && <Sens />}<br /><small>{p.description}{!mine.has(p.key) && ' — Bạn không có quyền này.'}</small></span>
              </label>
            ))}
          </fieldset>
        );
      })}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy || !f.perms.size} data-testid="role-save">{role ? 'Lưu' : 'Tạo vai trò'}</button>
        <button type="button" className="btn" onClick={onCancel} data-testid="role-cancel">Huỷ</button>
        {!f.perms.size && <small>Chọn ít nhất một quyền.</small>}
      </div>
    </form>
  );
}

export default function Roles() {
  const { state } = useApp();
  const s = state.session;
  const canManage = hasPerm(s, PERM.ADMIN_ACCOUNT_MANAGE);
  const roles = useLoad('/roles');
  const perms = useLoad('/permissions');
  const [mode, setMode] = useState(null); // null | { role? } khi tạo/sửa
  const [view, setView] = useState(null);
  const [ok, setOk] = useState('');
  const { run, node, setMsg } = useRun();
  // Quyền được gán: đúng như backend (assertCanGrant), người có đủ bộ quyền của vai trò hệ thống SYSADMIN (xét theo quyền, không theo tên) được gán mọi quyền.
  const mine = useMemo(() => {
    const own = new Set(s?.permissions || []);
    const sysPerms = (roles.data?.items || []).find((r) => r.system && r.key === 'SYSADMIN')?.permissions;
    if (sysPerms?.length && sysPerms.every((p) => own.has(p))) return new Set((perms.data?.items || []).map((p) => p.key));
    return own;
  }, [s, roles.data, perms.data]);
  const del = async (r) => { setOk('');  const x = await run(() => deleteRole(r.id), `Đã xóa vai trò ${r.name}.`); if (x.ok) { if (view?.id === r.id) setView(null); roles.reload(); } return x; };
  const catalog = perms.data?.items;
  return (
    <>
      {ok && <Notice tone="ok" onClose={() => setOk('')}>{ok}</Notice>}
      {node}
      {canManage && !mode && <div className="row-actions" style={{ marginTop: 0, marginBottom: 12 }}><button type="button" className="btn btn-primary" disabled={!catalog} onClick={() => { setOk(''); setMsg(null); setView(null); setMode({}); }} data-testid="role-new">Tạo vai trò</button></div>}
      {mode && catalog && <RoleForm key={mode.role?.id || 'new'} role={mode.role} catalog={catalog} mine={mine} onCancel={() => setMode(null)} onDone={(m) => { setMode(null); setMsg(null); setOk(m); roles.reload(); }} />}
      {perms.err && !catalog && <Notice tone="error">Không tải được danh mục quyền: {perms.err}</Notice>}
      {view && catalog && <Detail role={view} catalog={catalog} onClose={() => setView(null)} />}
      <LoadView r={roles}>{({ items }) => !items.length ? <p>Chưa có vai trò.</p> : (
        <Table rowKey={(x) => x.id} rows={items} cols={[
          ['Vai trò', (x) => <strong>{x.name} <small>({x.key})</small></strong>],
          ['Mô tả', (x) => x.description || '—'],
          ['Loại', (x) => <Pill tone={x.system ? 'info' : 'ok'}>{x.system ? 'Hệ thống' : 'Tùy chỉnh'}</Pill>],
          ['Tài khoản', (x) => x.accountCount],
          ['Quyền', (x) => x.permissions.length],
          ['', (x) => (
            <span className="inline-form">
              <button type="button" className="btn btn-sm" disabled={!catalog} onClick={() => { setMode(null); setView(x); }} data-testid="role-view">Xem quyền</button>
              {canManage && (x.system
                ? <small data-testid="role-system-note">Vai trò hệ thống chỉ xem, không sửa hoặc xóa được.</small>
                : (<>
                  <button type="button" className="btn btn-sm" disabled={!catalog} onClick={() => { setOk(''); setMsg(null); setView(null); setMode({ role: x }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} data-testid="role-edit">Sửa</button>
                  <Act label="Xóa" danger confirm={`Xóa vai trò "${x.name}"?`} onDo={() => del(x)} testid="role-delete" />
                </>))}
            </span>)],
        ]} />
      )}</LoadView>
    </>
  );
}
