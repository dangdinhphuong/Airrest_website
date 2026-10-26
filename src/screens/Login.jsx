import React, { useState } from 'react';
import { Building2, Car, LogIn, ShieldCheck } from 'lucide-react';
import { useApp } from '../state/store';
import { ROLE_LABEL, accountLabel, usePartner } from '../mock/partner';
import { Field, Notice, ScreenTitle, SimBadge } from '../components/Common';

const ROLES = [
  { id: 'manager', icon: Building2, text: 'Cập nhật hồ sơ, phòng, giá và xử lý đặt chỗ của cơ sở.' },
  { id: 'driver', icon: Car, text: 'Nhận và cập nhật chuyến đón khách ở sân bay.' },
  { id: 'admin', icon: ShieldCheck, text: 'Quản lý cơ sở, tài khoản, nội dung, tham số và giám sát.' },
];

// M12 — Đăng nhập mô phỏng của khách sạn, lái xe, quản trị (FR-024; ngoài MVP, Proposed; D-25 phương án A: không mật khẩu thật).
export default function Login() {
  const { state, dispatch } = useApp();
  const { accounts } = usePartner();
  const [role, setRole] = useState('manager');
  const list = accounts.filter((a) => a.role === role);
  const [accId, setAccId] = useState('');
  const selected = list.find((a) => a.id === accId) || list[0];
  const [err, setErr] = useState('');
  const sess = state.session;

  const submit = (e) => {
    e.preventDefault();
    if (!selected) { setErr('Chưa có tài khoản cho vai trò này. Nhờ quản trị tạo tài khoản.'); return; }
    if (selected.locked) { setErr('Tài khoản đã bị quản trị khoá. Chọn tài khoản khác hoặc nhờ quản trị mở khoá.'); return; }
    setErr('');
    dispatch({ type: 'login', session: { id: selected.id, role: selected.role, propertyId: selected.propertyId } });
  };

  return (
    <>
      <ScreenTitle kicker="Đối tác · Mô phỏng" title="Đăng nhập khu vực đối tác">Dành cho khách sạn (gồm lái xe) và quản trị. Người dùng cuối không cần đăng nhập.</ScreenTitle>
      <Notice tone="info" title="Đăng nhập mô phỏng">Không có mật khẩu thật và không có dữ liệu cá nhân. Dữ liệu chỉ tồn tại trong phiên này và mất khi tải lại trang. <SimBadge>Mô phỏng</SimBadge></Notice>
      {sess && (
        <Notice tone="ok" title={`Đang đăng nhập: ${sess.id} (${ROLE_LABEL[sess.role]})`}>
          <button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: sess.role === 'admin' ? 'admin' : 'hotel' })}>Vào khu vực làm việc</button>
          {' · '}<button type="button" className="link-btn" onClick={() => dispatch({ type: 'logout' })}>Đăng xuất</button>
        </Notice>
      )}
      <form className="card" onSubmit={submit} noValidate>
        <fieldset className="radios role-pick">
          <legend>Vai trò</legend>
          <div className="role-grid">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <button key={r.id} type="button" className={`role-card ${role === r.id ? 'on' : ''}`} aria-pressed={role === r.id} onClick={() => { setRole(r.id); setAccId(''); setErr(''); }} data-testid={`role-${r.id}`}>
                  <Icon size={22} aria-hidden="true" /><strong>{ROLE_LABEL[r.id]}</strong><span>{r.text}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field id="l-acc" label="Tài khoản" hint="Tài khoản do quản trị tạo (FR-031). Tài khoản đã khoá không đăng nhập được." error={err}>
          <select id="l-acc" value={selected?.id || ''} onChange={(e) => { setAccId(e.target.value); setErr(''); }} data-testid="login-account">
            {list.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
          </select>
        </Field>
        <button type="submit" className="btn btn-primary btn-block" data-testid="login-submit"><LogIn size={18} aria-hidden="true" /> Đăng nhập (mô phỏng)</button>
      </form>
    </>
  );
}
