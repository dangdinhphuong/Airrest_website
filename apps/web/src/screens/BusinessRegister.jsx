import React, { useState } from 'react';
import { ArrowRight, Building2, FileText, Mail, Phone, UserRound } from 'lucide-react';
import { describeError } from '../lib/api';
import { BUSINESS_PENDING_MSG, PASSWORD_MIN, registerBusiness, validateBusinessRegister } from '../data/business';

const FIELDS = [
  ['name', 'Tên doanh nghiệp', Building2, 'Công ty TNHH Khách sạn …', 'organization'],
  ['taxCode', 'Mã số thuế / giấy phép kinh doanh', FileText, '0312345678', 'off'],
  ['representative', 'Người đại diện', UserRound, 'Nguyễn Văn A', 'name'],
  ['email', 'Email (dùng để đăng nhập)', Mail, 'chu@congty.vn', 'email', 'email'],
  ['phone', 'Số điện thoại', Phone, '0901234567', 'tel', 'tel'],
];
const errStyle = { color: '#ef4444', fontSize: '11.5px', fontWeight: 600 };

// Đăng ký doanh nghiệp công khai: luôn hiện "đã tiếp nhận" (kể cả trùng email/mã số thuế, máy chủ trả 202 như nhau).
export default function BusinessRegister({ onBack }) {
  const [f, setF] = useState({ name: '', taxCode: '', representative: '', email: '', phone: '', password: '', confirm: '', website: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => { setF((v) => ({ ...v, [k]: e.target.value })); setErrors({}); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateBusinessRegister(f);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true); setErrors({});
    try { await registerBusiness(f); setDone(true); } catch (err) { setErrors({ form: describeError(err) }); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div data-testid="biz-done">
        <span className="section-kicker">Đăng ký doanh nghiệp</span>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#062253', margin: '8px 0' }}>Hồ sơ đã được tiếp nhận</h2>
        <p role="status" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '12px 14px', borderRadius: 10, fontSize: 13.5, lineHeight: 1.6 }}>{BUSINESS_PENDING_MSG}</p>
        <button type="button" className="hero-submit-btn" onClick={onBack} data-testid="biz-back-login" style={{ marginTop: 16 }}>Về đăng nhập nhân sự <ArrowRight size={17} style={{ marginLeft: 'auto' }} /></button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate data-testid="biz-form" style={{ position: 'relative' }}>
      <span className="section-kicker">Đối tác doanh nghiệp</span>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: '#062253', margin: '8px 0' }}>Đăng ký doanh nghiệp</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px', lineHeight: 1.6 }}>Một doanh nghiệp quản lý được nhiều khách sạn. Hồ sơ cần quản trị viên Airrest duyệt trước khi bạn đăng nhập.</p>
      {FIELDS.map(([k, label, Icon, ph, ac, type]) => (
        <div className="hero-input-field" key={k}>
          <label htmlFor={`b-${k}`}>{label} *</label>
          <div className="hero-input-box"><Icon size={17} style={{ color: '#94a3b8' }} aria-hidden="true" />
            <input id={`b-${k}`} type={type || 'text'} value={f[k]} onChange={set(k)} placeholder={ph} autoComplete={ac} aria-invalid={!!errors[k] || undefined} data-testid={`biz-${k}`} />
          </div>
          {errors[k] && <small style={errStyle} role="alert" data-testid={`biz-${k}-error`}>{errors[k]}</small>}
        </div>
      ))}
      {[['password', 'Mật khẩu *', `Tối thiểu ${PASSWORD_MIN} ký tự`], ['confirm', 'Nhập lại mật khẩu *', 'Nhập lại mật khẩu']].map(([k, label, ph]) => (
        <div className="hero-input-field" key={k}>
          <label htmlFor={`b-${k}`}>{label}</label>
          <div className="hero-input-box"><input id={`b-${k}`} type="password" value={f[k]} onChange={set(k)} placeholder={ph} autoComplete="new-password" aria-invalid={!!errors[k] || undefined} data-testid={`biz-${k}`} /></div>
          {errors[k] && <small style={errStyle} role="alert" data-testid={`biz-${k}-error`}>{errors[k]}</small>}
        </div>
      ))}
      {/* Ô bẫy bot (honeypot): người thật không thấy, không tab tới; luôn gửi rỗng. */}
      <div className="biz-form-hp" aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} data-testid="biz-website" /></div>
      {errors.form && <p style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '10px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, margin: '12px 0' }} role="alert" data-testid="biz-error">{errors.form}</p>}
      <button type="submit" className="hero-submit-btn" disabled={busy} data-testid="biz-submit" style={{ marginTop: 16 }}>{busy ? 'Đang gửi…' : 'Gửi hồ sơ đăng ký'} <ArrowRight size={17} style={{ marginLeft: 'auto' }} /></button>
      <p style={{ textAlign: 'center', fontSize: 12.5, color: '#64748b', marginTop: 16 }}>
        Đã có tài khoản? <button type="button" className="link-btn" onClick={onBack} style={{ fontWeight: 700 }} data-testid="biz-cancel">Đăng nhập nhân sự</button>
      </p>
    </form>
  );
}
