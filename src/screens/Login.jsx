import React, { useState } from 'react';
import { Building2, Car, Calculator, ClipboardCheck, Headset, LogIn, Settings, ShieldCheck, Users } from 'lucide-react';
import { useApp } from '../state/store';
import { accountLabel, startSession, usePartner } from '../mock/partner';
import { ROLE_META, ROLE_ORDER } from '../lib/rbac';
import { Field, Notice, ScreenTitle, SimBadge } from '../components/Common';

const ICON = { admin: ShieldCheck, ops: Settings, support: Headset, finance: Calculator, auditor: ClipboardCheck, manager: Building2, staff: Users, driver: Car };
const TEXT = {
  admin: 'Tài khoản, vai trò, đối tác, cấu hình, audit.', ops: 'Duyệt đối tác, giám sát, sự cố, chất lượng.', support: 'Ca hỗ trợ và khiếu nại; xem thông tin đã che.',
  finance: 'Báo cáo; đối soát đang chờ quyết định.', auditor: 'Chỉ đọc: audit log, báo cáo, cấu hình.', manager: 'Hồ sơ, phòng, giá, tồn, đặt phòng của khách sạn.',
  staff: 'Cập nhật tồn, xử lý đặt phòng theo ủy quyền.', driver: 'Nhận và cập nhật chuyến đón khách.',
};
const STATUS_MSG = {
  locked: 'Tài khoản đã bị khoá. Nhờ quản trị mở khoá hoặc chọn tài khoản khác.',
  disabled: 'Tài khoản đã bị vô hiệu hoá và không đăng nhập được.',
  invited: 'Tài khoản chưa được kích hoạt (đang chờ chấp nhận lời mời).',
};

// M12 — Đăng nhập mô phỏng của đối tác và nhân sự Airrest (SA-FR-001, FR-024; Proposed, D-25 phương án A: không mật khẩu thật).
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
    if (!selected) { setErr('Chưa có tài khoản cho vai trò này. Nhờ quản trị tạo hoặc mời tài khoản.'); return; }
    if (selected.status !== 'active') { setErr(STATUS_MSG[selected.status]); return; }
    setErr('');
    const sid = startSession(selected, state.simNow);
    dispatch({ type: 'login', session: { id: selected.id, role: selected.role, propertyId: selected.propertyId, tenantId: selected.tenantId, sid } });
  };
  const group = (title, airrest) => (
    <div className="role-group" role="group" aria-label={title}>
      <p className="role-group-title">{title}</p>
      <div className="role-grid">
        {ROLE_ORDER.filter((r) => ROLE_META[r].airrest === airrest).map((r) => {
          const Icon = ICON[r];
          return (
            <button key={r} type="button" className={`role-card ${role === r ? 'on' : ''}`} aria-pressed={role === r} onClick={() => { setRole(r); setAccId(''); setErr(''); }} data-testid={`role-${r}`}>
              <Icon size={22} aria-hidden="true" /><strong>{ROLE_META[r].label}</strong><span>{TEXT[r]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <>
      <ScreenTitle kicker="Đối tác và nhân sự Airrest · Mô phỏng" title="Đăng nhập khu vực làm việc">Dành cho khách sạn (gồm lái xe) và nhân sự Airrest. Người dùng cuối không cần đăng nhập.</ScreenTitle>
      <Notice tone="info" title="Đăng nhập mô phỏng">Không có mật khẩu thật và không có dữ liệu cá nhân. Dữ liệu chỉ tồn tại trong phiên này và mất khi tải lại trang. Vai trò và quyền là đề xuất, chưa được PO duyệt. <SimBadge>Mô phỏng</SimBadge></Notice>
      {sess && (
        <Notice tone="ok" title={`Đang đăng nhập: ${sess.id} (${ROLE_META[sess.role]?.label})`}>
          <button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: ROLE_META[sess.role]?.area === 'admin' ? 'admin' : 'hotel' })}>Vào khu vực làm việc</button>
          {' · '}<button type="button" className="link-btn" onClick={() => dispatch({ type: 'logout' })}>Đăng xuất</button>
        </Notice>
      )}
      <form className="card" onSubmit={submit} noValidate>
        <fieldset className="radios role-pick">
          <legend>Vai trò</legend>
          {group('Khách sạn', false)}
          {group('Nhân sự Airrest', true)}
        </fieldset>
        <Field id="l-acc" label="Tài khoản" hint="Tài khoản do quản trị tạo hoặc mời (SA-FR-001). Tài khoản đã khoá, vô hiệu hoá hoặc chưa kích hoạt không đăng nhập được." error={err}>
          <select id="l-acc" value={selected?.id || ''} onChange={(e) => { setAccId(e.target.value); setErr(''); }} data-testid="login-account">
            {list.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
          </select>
        </Field>
        <button type="submit" className="btn btn-primary btn-block" data-testid="login-submit"><LogIn size={18} aria-hidden="true" /> Đăng nhập (mô phỏng)</button>
      </form>
    </>
  );
}
