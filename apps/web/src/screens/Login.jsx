import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Plane, ShieldCheck, UserRound } from 'lucide-react';
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

function PasswordInput({ id, value, onChange, autoComplete, invalid, show, onToggle, placeholder }) {
  return (
    <div className="hero-input-box" style={{ position: 'relative' }}>
      <LockKeyhole size={17} style={{ color: '#94a3b8', flexShrink: 0 }} />
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        placeholder={placeholder || 'Tối thiểu 8 ký tự'}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export default function Login() {
  const { state, dispatch } = useApp();
  const { accounts } = usePartner();
  const sess = state.session;

  const [accountType, setAccountType] = useState('passenger'); // 'passenger' | 'admin'
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', password: '', name: '', phone: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [show, setShow] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors({});
  };

  const switchTab = (t) => {
    setTab(t);
    setErrors({});
    setShow(false);
  };

  const demos = [
    ...demoUsers().map((n) => ({ key: `u-${n}`, label: 'Người dùng', badge: n, username: n })),
    ...ROLE_ORDER.map((r) => accounts.find((a) => a.role === r && a.status === 'active')).filter(Boolean)
      .map((a) => ({ key: a.id, label: ROLE_META[a.role].label, badge: a.id, username: a.id })),
  ];

  const submitLogin = (e) => {
    e.preventDefault();
    const u = form.username.trim();
    if (!u || !form.password) {
      setErrors({ form: 'Nhập tên đăng nhập/email và mật khẩu.' });
      return;
    }
    const acc = accounts.find((a) => a.id.toLowerCase() === u.toLowerCase() || a.identifier.toLowerCase() === u.toLowerCase());
    if (acc) {
      if (form.password !== DEMO_PASSWORD) {
        setErrors({ form: 'Sai tên đăng nhập hoặc mật khẩu.' });
        return;
      }
      if (acc.status !== 'active') {
        setErrors({ form: STATUS_MSG[acc.status] });
        return;
      }
      const sid = startSession(acc, state.simNow);
      dispatch({ type: 'login', session: { id: acc.id, role: acc.role, propertyId: acc.propertyId, tenantId: acc.tenantId, sid } });
      return;
    }
    const r = loginUser(u, form.password);
    if (!r.ok) {
      setErrors({ form: r.error });
      return;
    }
    dispatch({ type: 'userLogin', user: r.user });
  };

  const submitRegister = (e) => {
    e.preventDefault();
    const errs = validateRegister({ name: form.name, password: form.password, confirm: form.confirm }, accounts.flatMap((a) => [a.id, a.identifier]));
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    dispatch({ type: 'userLogin', user: registerUser({ name: form.name, password: form.password }) });
  };

  const handleAdminContinue = () => {
    // Nếu chưa đăng nhập admin, chọn tài khoản admin mẫu đầu tiên
    const adminAcc = accounts.find((a) => a.role === 'support' && a.status === 'active') || accounts[0];
    if (adminAcc) {
      const sid = startSession(adminAcc, state.simNow);
      dispatch({ type: 'login', session: { id: adminAcc.id, role: adminAcc.role, propertyId: adminAcc.propertyId, tenantId: adminAcc.tenantId, sid } });
    } else {
      dispatch({ type: 'go', screen: 'admin' });
    }
  };

  return (
    <div className="auth-split-wrapper" data-testid="auth-page">
      <div style={{ width: '100%', maxWidth: '1020px', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => dispatch({ type: 'go', screen: 'stays' })}
          data-testid="auth-continue"
          style={{ background: 'transparent', border: 'none', color: '#1262e8', fontWeight: '700', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} /> Về trang chủ không cần tài khoản
        </button>
      </div>

      <div className="auth-split-box">
        {/* Cột trái: Thương hiệu Deep Navy AIRREST */}
        <aside className="auth-navy-col">
          <div className="auth-navy-circle" />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: '800', letterSpacing: '-0.04em' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: '38px', height: '38px', borderRadius: '12px', background: '#1262e8', color: '#ffffff', transform: 'rotate(-6deg)' }}>
              <Plane size={19} />
            </span>
            AIRREST
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '40px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#93c5fd' }}>
              Hai hệ thống tài khoản độc lập
            </span>
            <h1 style={{ fontSize: '30px', fontWeight: '800', lineHeight: '1.2', letterSpacing: '-0.03em', color: '#ffffff', margin: '14px 0 16px' }}>
              Đúng tài khoản.<br />Đúng quyền truy cập.
            </h1>
            <p style={{ fontSize: '13px', lineHeight: '1.65', color: '#bfdbfe', margin: '0 0 24px' }}>
              Passenger có thể lưu thông tin và quản lý trải nghiệm cá nhân. Admin chỉ dành cho nhân sự AIRREST đã được cấp quyền.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12.5px', color: '#bfdbfe' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <Check size={17} style={{ color: '#34d399', flexShrink: 0 }} /> Vẫn có thể đặt phòng không cần tài khoản.
              </p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <ShieldCheck size={17} style={{ color: '#93c5fd', flexShrink: 0 }} /> Passenger không thể truy cập dữ liệu Admin.
              </p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <LockKeyhole size={17} style={{ color: '#93c5fd', flexShrink: 0 }} /> Hai phiên đăng nhập hoạt động độc lập.
              </p>
            </div>
          </div>
        </aside>

        {/* Cột phải: Form đăng nhập/đăng ký */}
        <section className="auth-form-col">
          {/* Tab chuyển đổi giữa Hành khách và Quản trị viên */}
          <div className="hero-search-tabs" style={{ marginBottom: '24px' }}>
            <button
              type="button"
              className={accountType === 'passenger' ? 'active' : ''}
              onClick={() => { setAccountType('passenger'); setErrors({}); }}
            >
              Hành khách
            </button>
            <button
              type="button"
              className={accountType === 'admin' ? 'active' : ''}
              onClick={() => { setAccountType('admin'); setErrors({}); }}
            >
              Quản trị viên
            </button>
          </div>

          {sess && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '14px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: '#047857' }}>
              <strong>Đang đăng nhập: {sess.id} ({ROLE_META[sess.role]?.label})</strong>
              <div style={{ marginTop: '6px', display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => dispatch({ type: 'go', screen: ROLE_META[sess.role]?.area === 'admin' ? 'admin' : 'hotel' })}
                >
                  Vào khu vực làm việc
                </button>
                <button type="button" className="link-btn" onClick={() => dispatch({ type: 'logout' })}>
                  Đăng xuất
                </button>
              </div>
            </div>
          )}

          {accountType === 'admin' ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '380px' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: '56px', height: '56px', borderRadius: '16px', background: '#eff6ff', color: '#1262e8', marginBottom: '20px' }}>
                <ShieldCheck size={28} />
              </span>
              <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1262e8' }}>
                Cổng nội bộ
              </span>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#062253', margin: '6px 0 10px' }}>
                Đăng nhập Admin
              </h2>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.65', margin: '0 0 24px' }}>
                Tài khoản quản trị được AIRREST cấp riêng cho nhân sự vận hành và đối tác khách sạn. Chọn tài khoản quản trị mẫu bên dưới hoặc tiếp tục:
              </p>

              <button
                type="button"
                className="hero-submit-btn"
                onClick={handleAdminContinue}
                style={{ margin: '0 0 24px' }}
              >
                Tiếp tục tới Admin Portal <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
              </button>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                <small style={{ color: '#64748b', fontSize: '11.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Đăng nhập nhanh vai trò mẫu:
                </small>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="chip"
                      onClick={() => {
                        const sid = startSession(a, state.simNow);
                        dispatch({ type: 'login', session: { id: a.id, role: a.role, propertyId: a.propertyId, tenantId: a.tenantId, sid } });
                      }}
                      style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
                    >
                      <span>{ROLE_META[a.role]?.label}</span> (<strong>{a.id}</strong>)
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="section-kicker">Tài khoản Passenger</span>
                <SimBadge>Mô phỏng</SimBadge>
              </div>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#062253', margin: '0 0 8px' }}>
                {tab === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
                {tab === 'login' ? 'Đăng nhập để theo dõi và lưu trữ booking cá nhân.' : 'Tạo tài khoản tùy chọn để sử dụng các tính năng cá nhân.'}
              </p>

              {/* Tab Đăng nhập vs Đăng ký */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #f1f5f9', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  data-testid="tab-login"
                  style={{
                    padding: '8px 16px',
                    fontSize: '13.5px',
                    fontWeight: tab === 'login' ? '700' : '600',
                    color: tab === 'login' ? '#1262e8' : '#64748b',
                    borderBottom: tab === 'login' ? '2px solid #1262e8' : 'none',
                    marginBottom: '-2px',
                    background: 'transparent',
                    borderTop: 0,
                    borderLeft: 0,
                    borderRight: 0,
                    cursor: 'pointer',
                  }}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('register')}
                  data-testid="tab-register"
                  style={{
                    padding: '8px 16px',
                    fontSize: '13.5px',
                    fontWeight: tab === 'register' ? '700' : '600',
                    color: tab === 'register' ? '#1262e8' : '#64748b',
                    borderBottom: tab === 'register' ? '2px solid #1262e8' : 'none',
                    marginBottom: '-2px',
                    background: 'transparent',
                    borderTop: 0,
                    borderLeft: 0,
                    borderRight: 0,
                    cursor: 'pointer',
                  }}
                >
                  Đăng ký
                </button>
              </div>

              {tab === 'login' ? (
                <form onSubmit={submitLogin} noValidate>
                  <div className="hero-input-field">
                    <label htmlFor="a-user">Tên đăng nhập hoặc Email</label>
                    <div className="hero-input-box">
                      <Mail size={17} style={{ color: '#94a3b8' }} />
                      <input
                        id="a-user"
                        value={form.username}
                        onChange={(e) => set('username', e.target.value)}
                        autoComplete="username"
                        data-testid="login-username"
                        placeholder="ban@example.com hoặc username"
                        required
                      />
                    </div>
                  </div>

                  <div className="hero-input-field">
                    <label htmlFor="a-pw">Mật khẩu</label>
                    <PasswordInput
                      id="a-pw"
                      value={form.password}
                      onChange={(e) => set('password', e.target.value)}
                      autoComplete="current-password"
                      show={show}
                      onToggle={() => setShow((v) => !v)}
                    />
                  </div>

                  {errors.form && (
                    <p style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '600', margin: '12px 0' }} data-testid="login-error">
                      {errors.form}
                    </p>
                  )}

                  <button type="submit" className="hero-submit-btn" data-testid="login-submit" style={{ marginTop: '16px' }}>
                    Đăng nhập Passenger <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
                  </button>

                  <p style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748b', marginTop: '16px' }}>
                    Chưa có tài khoản?{' '}
                    <button type="button" className="link-btn" onClick={() => switchTab('register')} style={{ fontWeight: '700' }}>
                      Đăng ký ngay
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={submitRegister} noValidate>
                  <div className="hero-input-field">
                    <label htmlFor="a-name">Họ và tên *</label>
                    <div className="hero-input-box">
                      <UserRound size={17} style={{ color: '#94a3b8' }} />
                      <input
                        id="a-name"
                        value={form.name}
                        maxLength={NAME_MAX}
                        onChange={(e) => set('name', e.target.value)}
                        autoComplete="name"
                        placeholder="Nguyễn Minh Anh"
                        data-testid="register-name"
                        required
                      />
                    </div>
                    {errors.name && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{errors.name}</small>}
                  </div>

                  <div className="hero-input-field">
                    <label htmlFor="a-rpw">Mật khẩu *</label>
                    <PasswordInput
                      id="a-rpw"
                      value={form.password}
                      onChange={(e) => set('password', e.target.value)}
                      autoComplete="new-password"
                      invalid={!!errors.password}
                      show={show}
                      onToggle={() => setShow((v) => !v)}
                    />
                    {errors.password && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{errors.password}</small>}
                  </div>

                  <div className="hero-input-field">
                    <label htmlFor="a-rcf">Nhập lại mật khẩu *</label>
                    <PasswordInput
                      id="a-rcf"
                      value={form.confirm}
                      onChange={(e) => set('confirm', e.target.value)}
                      autoComplete="new-password"
                      invalid={!!errors.confirm}
                      show={show}
                      onToggle={() => setShow((v) => !v)}
                    />
                    {errors.confirm && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{errors.confirm}</small>}
                  </div>

                  <button type="submit" className="hero-submit-btn" data-testid="register-submit" style={{ marginTop: '16px' }}>
                    Tạo tài khoản Passenger <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
                  </button>

                  <p style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748b', marginTop: '16px' }}>
                    Đã có tài khoản?{' '}
                    <button type="button" className="link-btn" onClick={() => switchTab('login')} style={{ fontWeight: '700' }}>
                      Đăng nhập
                    </button>
                  </p>
                </form>
              )}

              {/* Demo user chips */}
              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '20px', paddingTop: '16px' }} data-testid="auth-demo">
                <small style={{ color: '#64748b', fontSize: '11.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tài khoản mẫu: mật khẩu <code>{DEMO_PASSWORD}</code>
                </small>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {demos.filter((d) => d.key.startsWith('u-')).map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className="chip"
                      onClick={() => {
                        setTab('login');
                        setForm((f) => ({ ...f, username: d.username, password: DEMO_PASSWORD }));
                        setErrors({});
                      }}
                      data-testid={`demo-${d.key}`}
                      style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
                    >
                      <span>{d.label}:</span> <strong>{d.badge}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
