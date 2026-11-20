import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Notice } from '../Common';
import { FormField, Loading, PageHeader } from '../ui';
import { useApp } from '../../state/store';
import { describeError } from '../../lib/api';
import { changePassword, getMe, updateProfile } from '../../data/settings';

const TYPE_VI = { ADMIN: 'Nhân sự quản trị Airrest', HOTEL: 'Nhân sự khách sạn', PAYER: 'Nhân viên đơn vị chi trả', DRIVER: 'Tài xế khách sạn' };
const PHONE_RE = /^\+?[0-9][0-9\s.-]{7,18}$/;
const PW_ERR = {
  WRONG_CURRENT_PASSWORD: ['current', 'Mật khẩu hiện tại không đúng.'],
  SAME_PASSWORD: ['next', 'Mật khẩu mới phải khác mật khẩu hiện tại.'],
};
// Lỗi của PATCH /api/v1/auth/password -> { field?, text } tiếng Việt theo mã.
export function passwordError(e) {
  if (e?.status === 429) return { text: 'Bạn thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.' };
  const m = PW_ERR[e?.code];
  if (m) return { field: m[0], text: m[1] };
  if (e?.status === 422) return { field: 'next', text: 'Mật khẩu mới chưa hợp lệ: cần từ 12 đến 128 ký tự.' };
  return { text: describeError(e) };
}

function PasswordInput({ id, label, value, onChange, error, hint, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      <span style={{ display: 'flex', gap: 6 }}>
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} aria-invalid={!!error} style={{ flex: 1 }} data-testid={id} />
        <button type="button" className="btn btn-sm" onClick={() => setShow((v) => !v)} aria-label={show ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`} aria-pressed={show}>{show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button>
      </span>
    </FormField>
  );
}

function ProfileCard({ me, session, dispatch }) {
  const [name, setName] = useState(me.fullName || '');
  const [phone, setPhone] = useState(me.phone || '');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const nameErr = name.trim().length < 2 ? 'Họ tên cần ít nhất 2 ký tự.' : '';
  const phoneErr = phone.trim() && !PHONE_RE.test(phone.trim()) ? 'Số điện thoại không hợp lệ (8–19 chữ số, có thể bắt đầu bằng +).' : '';
  const submit = async (e) => {
    e.preventDefault();
    if (nameErr || phoneErr) return;
    setBusy(true); setMsg(null);
    try {
      const r = await updateProfile({ fullName: name.trim(), phone: phone.trim() || null });
      dispatch({ type: 'profile', name: r.user.fullName });
      setName(r.user.fullName); setPhone(r.user.phone || '');
      setMsg({ tone: 'ok', text: 'Đã lưu hồ sơ.' });
    } catch (err) { setMsg({ tone: 'error', text: describeError(err) }); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="st-profile-h" style={{ padding: 16, marginBottom: 16 }}>
      <h2 id="st-profile-h" style={{ marginTop: 0, marginBottom: 12 }}>Hồ sơ cá nhân</h2>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}><span data-testid={`profile-${msg.tone}`}>{msg.text}</span></Notice>}
      <form onSubmit={submit} data-testid="profile-form" noValidate>
        <div className="grid-2">
          <FormField id="pf-email" label="Email đăng nhập" hint="Email không đổi được."><input id="pf-email" value={me.email || ''} readOnly disabled data-testid="pf-email" /></FormField>
          <FormField id="pf-role" label="Loại tài khoản" hint={`${session.permissions?.length ?? 0} quyền được cấp`}><input id="pf-role" value={TYPE_VI[me.type] || me.type || ''} readOnly disabled data-testid="pf-role" /></FormField>
          <FormField id="pf-name" label="Họ tên" error={nameErr} required><input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} data-testid="pf-name" /></FormField>
          <FormField id="pf-phone" label="Số điện thoại" error={phoneErr} hint="Để trống nếu muốn xóa số."><input id="pf-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" data-testid="pf-phone" /></FormField>
        </div>
        <button className="btn btn-primary" disabled={busy || !!nameErr || !!phoneErr} data-testid="pf-save">Lưu hồ sơ</button>
      </form>
    </section>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ cur: '', next: '', again: '' });
  const [srv, setSrv] = useState(null); // { field?, text }
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSrv(null); setOk(false); };
  const err = {
    cur: touched && !f.cur ? 'Hãy nhập mật khẩu hiện tại.' : srv?.field === 'current' ? srv.text : '',
    next: touched && f.next.length < 12 ? 'Mật khẩu mới cần ít nhất 12 ký tự.' : touched && f.next.length > 128 ? 'Mật khẩu mới tối đa 128 ký tự.' : touched && f.next && f.next === f.cur ? 'Mật khẩu mới phải khác mật khẩu hiện tại.' : srv?.field === 'next' ? srv.text : '',
    again: touched && f.again !== f.next ? 'Nhập lại chưa khớp mật khẩu mới.' : '',
  };
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true); setOk(false);
    if (!f.cur || f.next.length < 12 || f.next.length > 128 || f.next === f.cur || f.again !== f.next) return;
    setBusy(true); setSrv(null);
    try { await changePassword(f.cur, f.next); setF({ cur: '', next: '', again: '' }); setTouched(false); setOk(true); } // 204: phiên hiện tại giữ nguyên
    catch (x) { setSrv(passwordError(x)); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="st-pw-h" style={{ padding: 16 }}>
      <h2 id="st-pw-h" style={{ marginTop: 0, marginBottom: 12 }}>Đổi mật khẩu</h2>
      {ok && <Notice tone="ok" onClose={() => setOk(false)}><span data-testid="pw-ok">Đã đổi mật khẩu. Phiên đăng nhập hiện tại vẫn được giữ; lần đăng nhập sau hãy dùng mật khẩu mới.</span></Notice>}
      {srv && !srv.field && <Notice tone="error" role="alert" onClose={() => setSrv(null)}><span data-testid="pw-error">{srv.text}</span></Notice>}
      <form onSubmit={submit} data-testid="password-form" noValidate>
        <div className="grid-2">
          <PasswordInput id="pw-cur" label="Mật khẩu hiện tại" value={f.cur} onChange={set('cur')} error={err.cur} autoComplete="current-password" />
          <span />
          <PasswordInput id="pw-next" label="Mật khẩu mới" value={f.next} onChange={set('next')} error={err.next} hint="12–128 ký tự, khác mật khẩu hiện tại." autoComplete="new-password" />
          <PasswordInput id="pw-again" label="Nhập lại mật khẩu mới" value={f.again} onChange={set('again')} error={err.again} autoComplete="new-password" />
        </div>
        <button className="btn btn-primary" disabled={busy} data-testid="pw-save">Đổi mật khẩu</button>
      </form>
    </section>
  );
}

// Cài đặt cá nhân cho MỌI nhân sự (không cần quyền riêng). Dùng chung ở cổng khách sạn và quản trị.
export default function Settings() {
  const { state, dispatch } = useApp();
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { let live = true; getMe().then((r) => live && setMe(r.user), (e) => live && setErr(describeError(e))); return () => { live = false; }; }, []);
  return (
    <>
      <PageHeader title="Cài đặt cá nhân" description="Hồ sơ và mật khẩu của tài khoản đang đăng nhập" />
      {err && <Notice tone="error">{err}</Notice>}
      {!me && !err && <Loading />}
      {me && <ProfileCard me={me} session={state.session} dispatch={dispatch} />}
      <PasswordCard />
    </>
  );
}
