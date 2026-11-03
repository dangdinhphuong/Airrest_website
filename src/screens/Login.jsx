import React, { useState } from 'react';
import { ArrowLeft, BedDouble, Eye, EyeOff, Plane, Timer } from 'lucide-react';
import { useApp } from '../state/store';
import { startSession, usePartner } from '../mock/partner';
import { ROLE_META, ROLE_ORDER } from '../lib/rbac';
import { DEMO_PASSWORD, NAME_MAX, loginUser, registerUser, demoUsers, validateRegister } from '../mock/users';
import { SimBadge } from '../components/Common';

const STATUS_MSG = {
  locked: 'Tài khoản đã bị khoá. Nhờ quản trị mở khoá hoặc chọn tài khoản khác.',
  disabled: 'Tài khoản đã bị vô hiệu hoá và không đăng nhập được.',
  invited: 'Tài khoản chưa được kích hoạt (đang chờ chấp nhận lời mời).',
};
const HIGHLIGHTS = [
  ['01', Plane, 'Theo dõi chuyến bay', 'Tra cứu giờ bay cũ, mới và trạng thái ngay khi chuyến bị chậm hoặc huỷ.'],
  ['02', BedDouble, 'Tìm nơi nghỉ nhận khách ngay', 'Lọc nơi còn phòng, lễ tân đang mở, sắp theo thời gian di chuyển.'],
  ['03', Timer, 'Đặt chỗ và nhắc giờ', 'Đặt chỗ mô phỏng, tính giờ rời và nhắc quay lại sân bay.'],
];

function PasswordInput({ id, value, onChange, autoComplete, invalid, show, onToggle }) {
  return (
    <div className="auth-pw">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} aria-invalid={invalid || undefined} />
      <button type="button" className="auth-eye" onClick={onToggle} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
    </div>
  );
}

// M12 — Đăng nhập / Đăng ký mô phỏng. Người dùng cuối: ngoài MVP (MB-16), Proposed, chưa được PO duyệt, không thu email/SĐT (BR-002).
// Đối tác và nhân sự Airrest: SA-FR-001, FR-024. Mọi tài khoản mẫu dùng mật khẩu demo; chỉ để trình diễn, không thay thế xác thực phía máy chủ.
export default function Login() {
  const { state, dispatch } = useApp();
  const { accounts } = usePartner();
  const sess = state.session;
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', name: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [show, setShow] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors({}); };
  const switchTab = (t) => { setTab(t); setErrors({}); setShow(false); };

  const demos = [
    ...demoUsers().map((n) => ({ key: `u-${n}`, label: 'Người dùng', badge: n, username: n })),
    ...ROLE_ORDER.map((r) => accounts.find((a) => a.role === r && a.status === 'active')).filter(Boolean)
      .map((a) => ({ key: a.id, label: ROLE_META[a.role].label, badge: a.id, username: a.id })),
  ];

  const submitLogin = (e) => {
    e.preventDefault();
    const u = form.username.trim();
    if (!u || !form.password) { setErrors({ form: 'Nhập tên đăng nhập và mật khẩu.' }); return; }
    const acc = accounts.find((a) => a.id.toLowerCase() === u.toLowerCase() || a.identifier.toLowerCase() === u.toLowerCase());
    if (acc) {
      if (form.password !== DEMO_PASSWORD) { setErrors({ form: 'Sai tên đăng nhập hoặc mật khẩu.' }); return; }
      if (acc.status !== 'active') { setErrors({ form: STATUS_MSG[acc.status] }); return; }
      const sid = startSession(acc, state.simNow);
      dispatch({ type: 'login', session: { id: acc.id, role: acc.role, propertyId: acc.propertyId, tenantId: acc.tenantId, sid } });
      return;
    }
    const r = loginUser(u, form.password);
    if (!r.ok) { setErrors({ form: r.error }); return; }
    dispatch({ type: 'userLogin', user: r.user });
  };

  const submitRegister = (e) => {
    e.preventDefault();
    const errs = validateRegister({ name: form.name, password: form.password, confirm: form.confirm }, accounts.flatMap((a) => [a.id, a.identifier]));
    if (Object.keys(errs).length) { setErrors(errs); return; }
    dispatch({ type: 'userLogin', user: registerUser({ name: form.name, password: form.password }) });
  };

  const fieldErr = (k) => errors[k] && <small className="field-error" role="alert">{errors[k]}</small>;

  return (
    <div className="auth" data-testid="auth-page">
      <section className="auth-brand" aria-label="Giới thiệu AIRREST">
        <div className="auth-logo"><span className="logo-mark"><Plane size={19} aria-hidden="true" /></span><span><strong>AIRREST</strong><small>Nơi nghỉ quanh sân bay</small></span></div>
        <div className="auth-hero">
          <span className="auth-kicker">AIRREST</span>
          <h1>Nghỉ an tâm, bay đúng nhịp.</h1>
          <p>Hỗ trợ hành khách tìm nơi nghỉ khi chuyến bay bị chậm hoặc huỷ, quanh Nội Bài và Tân Sơn Nhất.</p>
          <ol className="auth-points">
            {HIGHLIGHTS.map(([n, Icon, t, d]) => (
              <li key={n}><span className="auth-num">{n}</span><span><strong><Icon size={15} aria-hidden="true" /> {t}</strong><small>{d}</small></span></li>
            ))}
          </ol>
        </div>
        <button type="button" className="auth-back" onClick={() => dispatch({ type: 'go', screen: 'stays' })} data-testid="auth-continue"><ArrowLeft size={16} aria-hidden="true" /> Tiếp tục không cần tài khoản</button>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <span className="auth-kicker">AIRREST</span>
          <h2>{tab === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2>
          <p className="auth-sub">{tab === 'login' ? 'Dành cho người dùng, khách sạn (gồm lái xe) và nhân sự Airrest.' : 'Tạo tài khoản người dùng. Không cần email hay số điện thoại.'} <SimBadge>Mô phỏng</SimBadge></p>

          {sess && (
            <div className="notice notice-ok" role="status"><div className="notice-body"><strong>Đang đăng nhập: {sess.id} ({ROLE_META[sess.role]?.label})</strong>
              <div><button type="button" className="link-btn" onClick={() => dispatch({ type: 'go', screen: ROLE_META[sess.role]?.area === 'admin' ? 'admin' : 'hotel' })}>Vào khu vực làm việc</button>{' · '}<button type="button" className="link-btn" onClick={() => dispatch({ type: 'logout' })}>Đăng xuất</button></div></div></div>
          )}

          <div className="auth-tabs" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
            <button type="button" role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'on' : ''} onClick={() => switchTab('login')} data-testid="tab-login">Đăng nhập</button>
            <button type="button" role="tab" aria-selected={tab === 'register'} className={tab === 'register' ? 'on' : ''} onClick={() => switchTab('register')} data-testid="tab-register">Đăng ký</button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={submitLogin} noValidate>
              <div className="field"><label htmlFor="a-user">Tên đăng nhập</label><input id="a-user" value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" data-testid="login-username" /></div>
              <div className="field"><label htmlFor="a-pw">Mật khẩu</label><PasswordInput show={show} onToggle={() => setShow((v) => !v)} id="a-pw" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="current-password" /></div>
              {errors.form && <p className="field-error auth-err" role="alert" data-testid="login-error">{errors.form}</p>}
              <button type="submit" className="btn btn-primary btn-block" data-testid="login-submit">Đăng nhập</button>
              <p className="auth-switch">Chưa có tài khoản? <button type="button" className="link-btn" onClick={() => switchTab('register')}>Đăng ký</button></p>
            </form>
          ) : (
            <form onSubmit={submitRegister} noValidate>
              <div className="field"><label htmlFor="a-name">Tên gọi</label><input id="a-name" value={form.name} maxLength={NAME_MAX} onChange={(e) => set('name', e.target.value)} autoComplete="nickname" aria-invalid={!!errors.name || undefined} data-testid="register-name" />{fieldErr('name')}</div>
              <div className="field"><label htmlFor="a-rpw">Mật khẩu</label><PasswordInput show={show} onToggle={() => setShow((v) => !v)} id="a-rpw" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" invalid={!!errors.password} />{fieldErr('password')}</div>
              <div className="field"><label htmlFor="a-rcf">Nhập lại mật khẩu</label><PasswordInput show={show} onToggle={() => setShow((v) => !v)} id="a-rcf" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" invalid={!!errors.confirm} />{fieldErr('confirm')}</div>
              <button type="submit" className="btn btn-primary btn-block" data-testid="register-submit">Đăng ký</button>
              <p className="auth-switch">Đã có tài khoản? <button type="button" className="link-btn" onClick={() => switchTab('login')}>Đăng nhập</button></p>
            </form>
          )}

          <div className="auth-demo" data-testid="auth-demo">
            <p>Chế độ DEMO: mọi tài khoản mẫu dùng mật khẩu <code>{DEMO_PASSWORD}</code> (chỉ để trình diễn). Chọn nhanh:</p>
            <div className="auth-chips">
              {demos.map((d) => (
                <button key={d.key} type="button" className="auth-chip" onClick={() => { setTab('login'); setForm((f) => ({ ...f, username: d.username, password: DEMO_PASSWORD })); setErrors({}); }} data-testid={`demo-${d.key}`}>
                  <span>{d.label}</span><em>{d.badge}</em>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="auth-foot">Mô phỏng trong trình duyệt — không thay thế xác thực phía máy chủ. Dữ liệu mất khi tải lại trang. Phần người dùng ngoài MVP, chưa được PO duyệt; không thu email hay số điện thoại.</p>
      </section>
    </div>
  );
}
