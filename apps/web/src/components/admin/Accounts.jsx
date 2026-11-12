import React, { useState } from 'react';
import { ScreenTitle, Notice, Field } from '../Common';
import { Pill, SubTabs } from '../partner/ui';
import { useApp } from '../../state/store';
import { createAccount, patchAccount, resetPassword } from '../../data/admin';
import Roles from './Roles';
import { Act, Filters, LoadView, PagedView, Table, dt, tempPassword, useLoad, usePaged, useRun } from './kit';

const ST = { ACTIVE: ['Hoạt động', 'ok'], LOCKED: ['Đã khóa', 'error'], INVITED: ['Mới mời', 'warn'] };

function Create({ roles, onDone, onShown }) {
  const [f, setF] = useState({ email: '', fullName: '', roleId: roles[0]?.id || '', password: tempPassword() });
  const { run, busy, node } = useRun();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const pw = f.password;
    const x = await run(() => createAccount(f), 'Đã tạo tài khoản.');
    if (x.ok) { onShown({ email: f.email, pw }); setF({ ...f, email: '', fullName: '', password: tempPassword() }); onDone(); }
  };
  return (
    <form onSubmit={submit} className="card" data-testid="account-create">
      <h3>Tạo tài khoản quản trị</h3>
      {node}
      <div className="grid-2">
        <Field id="ac-email" label="Email"><input id="ac-email" type="email" required value={f.email} onChange={set('email')} /></Field>
        <Field id="ac-name" label="Họ tên"><input id="ac-name" required minLength={2} value={f.fullName} onChange={set('fullName')} /></Field>
        <Field id="ac-role" label="Vai trò"><select id="ac-role" value={f.roleId} onChange={set('roleId')}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.system ? '' : ' (tùy chỉnh)'}</option>)}</select></Field>
        <Field id="ac-pw" label="Mật khẩu tạm (tối thiểu 12 ký tự)"><input id="ac-pw" required minLength={12} value={f.password} onChange={set('password')} autoComplete="off" /></Field>
      </div>
      <button className="btn btn-primary" disabled={busy} data-testid="account-create-submit">Tạo tài khoản</button>
    </form>
  );
}

export default function Accounts() {
  const { state } = useApp();
  const [tab, setTab] = useState('list');
  const [q, setQ] = useState({});
  const p = usePaged('/accounts', q, 'after');
  const roles = useLoad('/roles');
  const { run, node } = useRun();
  const [shown, setShown] = useState(null);
  const [pending, setPending] = useState(null); // { a, role }: chờ xác nhận đổi vai trò
  const roleName = (id) => (roles.data?.items || []).find((r) => r.id === id)?.name || id;
  const roleIdOf = (a) => a.roleId || (roles.data?.items || []).find((r) => r.system && r.key === a.adminRole)?.id || '';
  const act = async (fn, ok) => { const x = await run(fn, ok); if (x.ok) p.reload(); return x; };
  const reset = async (a) => { setShown(null); const pw = tempPassword(); const x = await run(() => resetPassword(a.id, pw), 'Đã đặt lại mật khẩu.'); if (x.ok) setShown({ email: a.email, pw }); return x; };
  const roleOpts = (roles.data?.items || []).map((r) => [r.id, r.name]);
  return (
    <>
      <ScreenTitle title="Tài khoản và vai trò">Tài khoản quản trị</ScreenTitle>
      <SubTabs label="Mục" value={tab} onChange={(t) => { setTab(t); roles.reload(); if (t === 'list') p.reload(); }} tabs={[['list', 'Tài khoản'], ['roles', 'Vai trò và quyền']]} />
      {tab === 'roles' ? <Roles /> : (
        <>
          {node}
          {shown && <Notice tone="warn" title="Mật khẩu tạm, chỉ hiện một lần" onClose={() => setShown(null)}><code data-testid="temp-pw">{shown.pw}</code> cho {shown.email}. Hãy chuyển qua kênh an toàn.</Notice>}
          {roles.data && <Create roles={roles.data.items} onDone={p.reload} onShown={setShown} />}
          <Filters fields={[['q', 'Tìm email / tên'], ['status', 'Trạng thái', 'text', Object.entries(ST).map(([k, [t]]) => [k, t])], ['roleId', 'Vai trò', 'text', roleOpts]]} onApply={setQ} />
          {pending && (
            <Notice tone="warn" title="Xác nhận đổi vai trò">
              Đổi vai trò của <strong>{pending.a.email}</strong> từ <strong>{pending.a.roleName || pending.a.adminRole || '—'}</strong> sang <strong>{roleName(pending.role)}</strong>? Quyền của tài khoản sẽ thay đổi ngay.
              <div className="row-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={async () => { const x = pending; setPending(null); await act(() => patchAccount(x.a.id, { roleId: x.role }), 'Đã đổi vai trò.'); }} data-testid="acc-role-confirm">Xác nhận đổi</button>
                <button type="button" className="btn btn-sm" onClick={() => setPending(null)} data-testid="acc-role-cancel">Huỷ</button>
              </div>
            </Notice>
          )}
          <PagedView p={p} empty="Không có tài khoản.">
            <Table rows={p.items} cols={[['Email', (a) => a.email], ['Họ tên', (a) => a.fullName], ['Vai trò', (a) => a.roleName || a.adminRole || '—'], ['Trạng thái', (a) => <Pill tone={ST[a.status]?.[1]}>{ST[a.status]?.[0] || a.status}</Pill>], ['Tạo lúc', (a) => dt(a.createdAt)],
              ['', (a) => a.id === state.session?.id ? <small>(bạn)</small> : (
                <span className="inline-form">
                  {a.status === 'LOCKED' ? <Act label="Mở khóa" confirm="Mở khóa tài khoản?" onDo={() => act(() => patchAccount(a.id, { status: 'ACTIVE' }), 'Đã mở khóa.')} testid="acc-unlock" />
                    : <Act label="Khóa" danger confirm="Khóa tài khoản này?" onDo={() => act(() => patchAccount(a.id, { status: 'LOCKED' }), 'Đã khóa tài khoản.')} testid="acc-lock" />}
                  <select aria-label="Đổi vai trò" value={roleIdOf(a)} onChange={(e) => setPending({ a, role: e.target.value })} data-testid="acc-role">{roleOpts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                  <Act label="Đặt lại mật khẩu" danger confirm="Tạo mật khẩu tạm mới? Mật khẩu cũ mất hiệu lực." onDo={() => reset(a)} testid="acc-reset" />
                </span>)]]} />
          </PagedView>
        </>
      )}
    </>
  );
}
