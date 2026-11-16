import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ConfirmDialog, DataTable, FilterBar, FormField, Modal, PageHeader, StatusBadge, Tag } from '../ui';
import { Notice } from '../Common';
import Select from '../Select';
import { useApp } from '../../state/store';
import { createStaff, listRoles, listStaff, patchStaff, resetStaffPassword, staffErr, tempPassword } from '../../data/hotelStaff';
import { fmtDT, useAction, useLoad, usePaged } from './kit';

const ST = { ACTIVE: ['Hoạt động', 'ok'], LOCKED: ['Đã khóa', 'error'], INVITED: ['Mới mời', 'warn'] };
const PHONE_RE = /^\+?[0-9][0-9\s.-]{7,18}$/;

// Ô mật khẩu tạm + nút sinh ngẫu nhiên.
function TempPw({ id, value, onChange }) {
  return (
    <FormField id={id} label="Mật khẩu tạm (tối thiểu 12 ký tự)" hint="Gửi cho nhân viên qua kênh an toàn; họ nên đổi ở mục Cài đặt cá nhân.">
      <span style={{ display: 'flex', gap: 6 }}>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} minLength={12} maxLength={128} required autoComplete="off" style={{ flex: 1 }} data-testid={id} />
        <button type="button" className="btn btn-sm" onClick={() => onChange(tempPassword())} data-testid={`${id}-gen`}><RefreshCw size={14} aria-hidden="true" /> Sinh ngẫu nhiên</button>
      </span>
    </FormField>
  );
}

function StaffForm({ staff, roles, onClose, onSaved }) {
  const editing = !!staff;
  const [f, setF] = useState({ email: '', fullName: staff?.fullName || '', phone: staff?.phone || '', roleId: staff?.roleId || roles[0]?.id || '', password: tempPassword() });
  const [pwShown, setPwShown] = useState(null);
  const { run, busy, note } = useAction(staffErr);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const phoneErr = f.phone.trim() && !PHONE_RE.test(f.phone.trim()) ? 'Số điện thoại không hợp lệ.' : '';
  const submit = async (e) => {
    e.preventDefault();
    if (phoneErr) return;
    const ok = await run(async () => {
      if (editing) {
        const body = { fullName: f.fullName.trim(), phone: f.phone.trim() || null };
        if (f.roleId !== staff.roleId) body.roleId = f.roleId;
        await patchStaff(staff.id, body);
      } else await createStaff({ email: f.email.trim(), fullName: f.fullName.trim(), ...(f.phone.trim() && { phone: f.phone.trim() }), roleId: f.roleId, password: f.password });
    }, editing ? 'Đã lưu nhân viên.' : 'Đã tạo nhân viên.');
    if (!ok) return;
    onSaved();
    if (editing) onClose(); else setPwShown({ email: f.email.trim(), pw: f.password });
  };
  if (pwShown) {
    return (
      <Modal open onClose={onClose} title="Đã tạo nhân viên" size="md" footer={<button type="button" className="btn btn-primary" onClick={onClose} data-testid="staff-done">Xong</button>}>
        <Notice tone="warn" title="Mật khẩu tạm, chỉ hiện một lần">
          <code data-testid="temp-pw">{pwShown.pw}</code> cho {pwShown.email}. Hãy chuyển qua kênh an toàn; đóng hộp này là không xem lại được.
        </Notice>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title={editing ? `Sửa nhân viên: ${staff.fullName}` : 'Thêm nhân viên'} size="lg" locked={busy}>
      <form onSubmit={submit} data-testid="staff-form">
        {note}
        <div className="grid-2">
          <FormField id="sf-email" label="Email đăng nhập" hint={editing ? 'Email không đổi được.' : undefined}><input id="sf-email" type="email" required={!editing} disabled={editing} value={editing ? staff.email : f.email} onChange={set('email')} data-autofocus="" data-testid="sf-email" /></FormField>
          <FormField id="sf-name" label="Họ tên"><input id="sf-name" required minLength={2} maxLength={100} value={f.fullName} onChange={set('fullName')} data-testid="sf-name" /></FormField>
          <FormField id="sf-phone" label="Số điện thoại" error={phoneErr}><input id="sf-phone" type="tel" value={f.phone} onChange={set('phone')} data-testid="sf-phone" /></FormField>
          <FormField id="sf-role" label="Vai trò"><Select id="sf-role" value={f.roleId} onChange={set('roleId')} data-testid="sf-role">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.system ? ' (mẫu)' : ''}</option>)}</Select></FormField>
        </div>
        {!editing && <TempPw id="sf-pw" value={f.password} onChange={(v) => setF({ ...f, password: v })} />}
        <div className="row-actions">
          <button className="btn btn-primary" disabled={busy || !f.roleId} data-testid="sf-save">{editing ? 'Lưu' : 'Tạo nhân viên'}</button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Hủy</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPw({ staff, onClose }) {
  const [pw, setPw] = useState(tempPassword());
  const [done, setDone] = useState(null);
  const { run, busy, note } = useAction(staffErr);
  const submit = async (e) => { e.preventDefault(); if (await run(() => resetStaffPassword(staff.id, pw), 'Đã đặt lại mật khẩu.')) setDone(pw); };
  return (
    <Modal open onClose={onClose} title={`Đặt lại mật khẩu: ${staff.fullName}`} size="md" locked={busy}>
      {done ? (
        <>
          <Notice tone="warn" title="Mật khẩu tạm, chỉ hiện một lần"><code data-testid="temp-pw">{done}</code> cho {staff.email}. Hãy chuyển qua kênh an toàn.</Notice>
          <div className="row-actions"><button type="button" className="btn btn-primary" onClick={onClose} data-testid="reset-done">Xong</button></div>
        </>
      ) : (
        <form onSubmit={submit} data-testid="reset-form">
          {note}
          <TempPw id="rp-pw" value={pw} onChange={setPw} />
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy || pw.length < 12} data-testid="rp-save">Đặt lại mật khẩu</button>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Hủy</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Staff() {
  const { state } = useApp();
  const me = state.session?.id;
  const [q, setQ] = useState({ status: '', roleId: '', q: '' });
  const [applied, setApplied] = useState({});
  const roles = useLoad(listRoles, []);
  const list = usePaged((after) => listStaff({ ...applied, ...(after && { after }) }), [JSON.stringify(applied)]);
  const [form, setForm] = useState(null); // {} = thêm, { staff } = sửa
  const [reset, setReset] = useState(null);
  const [lock, setLock] = useState(null);
  const act = useAction(staffErr);
  const assignable = (roles.data?.items || []).filter((r) => r.assignable);
  const apply = () => setApplied(Object.fromEntries(Object.entries(q).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()])));
  const toggleLock = async () => {
    const s = lock;
    const ok = await act.run(() => patchStaff(s.id, { status: s.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED' }), s.status === 'LOCKED' ? 'Đã mở khóa nhân viên.' : 'Đã khóa nhân viên.');
    if (!ok) throw new Error('failed');
    list.reload();
  };
  const columns = [
    { key: 'name', header: 'Nhân viên', render: (s) => <><strong>{s.fullName}</strong>{s.isOwner && <> <span style={{ display: 'inline-block' }}><Tag tone="info">Chủ</Tag></span></>}{s.id === me && <> <small>(bạn)</small></>}<br /><small>{s.email}</small></> },
    { key: 'phone', header: 'Điện thoại', render: (s) => s.phone || '—' },
    { key: 'role', header: 'Vai trò', render: (s) => s.isOwner ? 'Chủ khách sạn' : s.roleName || '—' },
    { key: 'st', header: 'Trạng thái', render: (s) => <StatusBadge status={s.status} map={ST} /> },
    { key: 'at', header: 'Tạo lúc', render: (s) => fmtDT(s.createdAt) },
    { key: 'act', header: 'Thao tác', render: (s) => s.isOwner ? <small data-testid="owner-note">Chỉ đọc</small> : (
      <span className="inline-form">
        <button type="button" className="btn btn-sm" onClick={() => setForm({ staff: s })} data-testid="staff-edit">Sửa</button>
        {s.id !== me && (
          <>
            <button type="button" className={`btn btn-sm ${s.status === 'LOCKED' ? '' : 'btn-danger'}`} onClick={() => setLock(s)} data-testid="staff-lock">{s.status === 'LOCKED' ? 'Mở khóa' : 'Khóa'}</button>
            <button type="button" className="btn btn-sm" onClick={() => setReset(s)} data-testid="staff-reset">Đặt lại mật khẩu</button>
          </>
        )}
      </span>) },
  ];
  return (
    <>
      <PageHeader title="Nhân viên" description="Tài khoản nhân viên của khách sạn đang làm việc. Tách biệt với tài khoản quản trị Airrest."
        actions={<button type="button" className="btn btn-primary" disabled={!assignable.length} onClick={() => setForm({})} data-testid="staff-new">Thêm nhân viên</button>} />
      {act.note}
      {roles.err && <Notice tone="error">Không tải được vai trò: {staffErr(roles.err)}</Notice>}
      {roles.data && !assignable.length && <Notice tone="warn">Chưa có vai trò nào gán được cho nhân viên.</Notice>}
      <FilterBar onApply={apply} onReset={() => { setQ({ status: '', roleId: '', q: '' }); setApplied({}); }} testid="staff-filters">
        <input aria-label="Tìm email hoặc tên" placeholder="Tìm email / tên" value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value })} data-testid="sf-q" />
        <Select aria-label="Trạng thái" value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })}><option value="">Trạng thái: tất cả</option>{Object.entries(ST).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</Select>
        <Select aria-label="Vai trò" value={q.roleId} onChange={(e) => setQ({ ...q, roleId: e.target.value })}><option value="">Vai trò: tất cả</option>{assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
      </FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(s) => s.id} loading={list.loading} error={list.err && staffErr(list.err)} onRetry={list.reload}
        hasMore={list.next != null} onLoadMore={list.loadMore} loadingMore={list.more} empty="Chưa có nhân viên nào." />
      {form && roles.data && <StaffForm key={form.staff?.id || 'new'} staff={form.staff} roles={assignable} onClose={() => setForm(null)} onSaved={list.reload} />}
      {reset && <ResetPw staff={reset} onClose={() => setReset(null)} />}
      <ConfirmDialog open={!!lock} onClose={() => setLock(null)} testid="staff-lock-dlg" variant={lock?.status === 'LOCKED' ? 'info' : 'danger'}
        title={lock?.status === 'LOCKED' ? 'Mở khóa nhân viên?' : 'Khóa nhân viên?'} confirmLabel={lock?.status === 'LOCKED' ? 'Mở khóa' : 'Khóa tài khoản'}
        description={lock && (lock.status === 'LOCKED' ? `${lock.fullName} sẽ đăng nhập được trở lại.` : `${lock.fullName} sẽ không đăng nhập được cho tới khi mở khóa.`)} onConfirm={toggleLock} />
    </>
  );
}
