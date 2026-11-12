import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Plane, ShieldCheck, UserRound } from 'lucide-react';
import { useApp } from '../state/store';
import { loginStaff, logoutStaff } from '../data/auth';
import { areasOf } from '../lib/access';
import { describeError, setAuthToken, setGuestToken } from '../lib/api';
import { FULLNAME_MAX, PASSWORD_MIN, USERNAME_MAX, describeAuthError, loginPassenger, registerPassenger, validateRegister } from '../data/user';


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
        placeholder={placeholder || `Tối thiểu ${PASSWORD_MIN} ký tự`}
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
  const sess = state.session;

  const [accountType, setAccountType] = useState('passenger'); // 'passenger' | 'admin'
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', password: '', regUsername: '', fullName: '', regPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [show, setShow] = useState(false);
  const [staff, setStaff] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors({});
  };

  const switchTab = (t) => {
    setTab(t);
    setErrors({});
    setForm((f) => ({ ...f, password: '', regPassword: '', confirm: '' }));
    setShow(false);
  };

  // Lưu token khách (sessionStorage), bỏ token nhân sự rồi vào store. Chỉ gọi khi đăng nhập/đăng ký thành công.
  const enter = ({ token, user }, screen) => {
    setAuthToken(null);
    setGuestToken(token);
    dispatch({ type: 'userLogin', user, screen });
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    const u = form.username.trim();
    if (!u || !form.password) {
      setErrors({ form: !u ? 'Nhập tên đăng nhập.' : 'Nhập mật khẩu.' });
      return;
    }
    setBusy(true);
    try {
      enter(await loginPassenger(u, form.password), 'home');
    } catch (err) {
      setErrors({ form: describeAuthError(err) });
      setBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    const errs = validateRegister({ username: form.regUsername, fullName: form.fullName, password: form.regPassword, confirm: form.confirm });
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setBusy(true);
    try {
      enter(await registerPassenger({ username: form.regUsername, fullName: form.fullName, password: form.regPassword }), 'account');
    } catch (err) {
      setErrors(err?.code === 'USERNAME_TAKEN' ? { username: describeAuthError(err) } : { form: describeAuthError(err) });
      setBusy(false);
    }
  };

  const submitStaff = async (e) => {
    e.preventDefault();
    if (!staff.email.trim() || !staff.password) { setErrors({ staff: 'Nhập email và mật khẩu.' }); return; }
    setBusy(true); setErrors({});
    try {
      const s = await loginStaff(staff.email.trim(), staff.password);
      const area = areasOf(s)[0]; // vào khu vực đầu tiên mà quyền cho phép
      if (!area) { logoutStaff(); setErrors({ staff: 'Tài khoản chưa được cấp quyền vào cổng làm việc nào. Liên hệ quản trị.' }); return; }
      dispatch({ type: 'login', session: { ...s, area } });
    } catch (err) { setErrors({ staff: describeError(err) }); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-split-wrapper" data-testid="auth-page">
      <div style={{ width: '100%', maxWidth: '1020px', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => dispatch({ type: 'go', screen: 'home' })}
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
              Nhân sự
            </button>
          </div>

          {sess && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '14px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: '#047857' }}>
              <strong>Đang đăng nhập: {sess.name}</strong>
              <div style={{ marginTop: '6px', display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => dispatch({ type: 'go', screen: sess.area })}
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
            <form onSubmit={submitStaff} noValidate data-testid="staff-form">
              <span className="section-kicker">Cổng nhân sự</span>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#062253', margin: '8px 0 8px' }}>Đăng nhập nhân sự</h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.6 }}>
                Tài khoản khách sạn và quản trị do AIRREST cấp, không tự đăng ký. Chức năng hiển thị theo quyền được cấp cho tài khoản.
              </p>
              <div className="hero-input-field">
                <label htmlFor="s-email">Email</label>
                <div className="hero-input-box">
                  <Mail size={17} style={{ color: '#94a3b8' }} />
                  <input id="s-email" type="email" value={staff.email} onChange={(e) => { setStaff((v) => ({ ...v, email: e.target.value })); setErrors({}); }} autoComplete="username" data-testid="staff-email" placeholder="ten@khachsan.vn" required />
                </div>
              </div>
              <div className="hero-input-field">
                <label htmlFor="s-pw">Mật khẩu</label>
                <PasswordInput id="s-pw" value={staff.password} onChange={(e) => { setStaff((v) => ({ ...v, password: e.target.value })); setErrors({}); }} autoComplete="current-password" show={show} onToggle={() => setShow((v) => !v)} placeholder="Mật khẩu" />
              </div>
              {errors.staff && (
                <p style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '600', margin: '12px 0' }} role="alert" data-testid="staff-error">{errors.staff}</p>
              )}
              <button type="submit" className="hero-submit-btn" disabled={busy} data-testid="staff-submit" style={{ marginTop: '16px' }}>
                {busy ? 'Đang đăng nhập…' : 'Đăng nhập'} <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
              </button>
            </form>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="section-kicker">Tài khoản Passenger</span>
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
                    <label htmlFor="a-user">Tên đăng nhập</label>
                    <div className="hero-input-box">
                      <Mail size={17} style={{ color: '#94a3b8' }} />
                      <input
                        id="a-user"
                        value={form.username}
                        onChange={(e) => set('username', e.target.value)}
                        autoComplete="username"
                        data-testid="login-username"
                        placeholder="Tên đăng nhập đã đăng ký"
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
                    <p style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '600', margin: '12px 0' }} role="alert" data-testid="login-error">
                      {errors.form}
                    </p>
                  )}

                  <button type="submit" className="hero-submit-btn" disabled={busy} data-testid="login-submit" style={{ marginTop: '16px' }}>
                    {busy ? 'Đang đăng nhập…' : 'Đăng nhập'} <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
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
                    <label htmlFor="a-ruser">Tên đăng nhập *</label>
                    <div className="hero-input-box">
                      <UserRound size={17} style={{ color: '#94a3b8' }} />
                      <input
                        id="a-ruser"
                        value={form.regUsername}
                        maxLength={USERNAME_MAX}
                        onChange={(e) => set('regUsername', e.target.value)}
                        autoComplete="username"
                        aria-invalid={!!errors.username || undefined}
                        placeholder="Ví dụ: minhanh"
                        data-testid="register-username"
                        required
                      />
                    </div>
                    {errors.username && <small className="ui-error" role="alert" data-testid="register-username-error">{errors.username}</small>}
                  </div>

                  <div className="hero-input-field">
                    <label htmlFor="a-name">Họ và tên (tùy chọn)</label>
                    <div className="hero-input-box">
                      <UserRound size={17} style={{ color: '#94a3b8' }} />
                      <input
                        id="a-name"
                        value={form.fullName}
                        maxLength={FULLNAME_MAX}
                        onChange={(e) => set('fullName', e.target.value)}
                        autoComplete="name"
                        placeholder="Nguyễn Minh Anh"
                        data-testid="register-name"
                      />
                    </div>
                    {errors.fullName && <small className="ui-error">{errors.fullName}</small>}
                  </div>

                  <div className="hero-input-field">
                    <label htmlFor="a-rpw">Mật khẩu *</label>
                    <PasswordInput
                      id="a-rpw"
                      value={form.regPassword}
                      onChange={(e) => set('regPassword', e.target.value)}
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

                  {errors.form && (
                    <p style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '600', margin: '12px 0' }} role="alert" data-testid="register-error">
                      {errors.form}
                    </p>
                  )}

                  <button type="submit" className="hero-submit-btn" disabled={busy} data-testid="register-submit" style={{ marginTop: '16px' }}>
                    {busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'} <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
                  </button>

                  <p style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748b', marginTop: '16px' }}>
                    Đã có tài khoản?{' '}
                    <button type="button" className="link-btn" onClick={() => switchTab('login')} style={{ fontWeight: '700' }}>
                      Đăng nhập
                    </button>
                  </p>
                </form>
              )}

            </div>
          )}
        </section>
      </div>
    </div>
  );
}
