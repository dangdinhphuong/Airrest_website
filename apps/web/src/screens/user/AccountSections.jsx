import React, { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { FULLNAME_MAX, PAY_LABEL, describeAuthError, listAirports, listMyTickets, updateProfile } from '../../data/user';
import Select from '../../components/Select';
import { setTicketPrefill } from './data';

// Các mục của trang Tài khoản: sửa hồ sơ, cấu hình cá nhân, ticket hỗ trợ của tôi.
const SECTION = 'tw:mt-8 tw:border-t tw:border-slate-100 tw:pt-8';
const LBL = 'tw:grid tw:gap-2 tw:text-[13px] tw:font-semibold tw:text-slate-700';
const BTN = 'tw:min-h-11 tw:rounded-xl tw:bg-blue-600 tw:px-5 tw:text-xs tw:font-bold tw:text-white tw:disabled:opacity-60';
const TONE = { ok: 'tw:bg-emerald-100 tw:text-emerald-900', wait: 'tw:bg-amber-100 tw:text-amber-900' };
const TICKET_STATUS = { OPEN: ['Đang mở', 'wait'], IN_PROGRESS: ['Đang xử lý', 'wait'], RESOLVED: ['Đã giải quyết', 'ok'] };
const dmy = (iso) => new Date(iso).toLocaleDateString('vi-VN');

function Msg({ m }) {
  if (!m.text) return null;
  return <p role={m.ok ? 'status' : 'alert'} className={`tw:text-xs tw:font-semibold ${m.ok ? 'tw:text-emerald-700' : 'tw:text-rose-700'}`}>{m.text}</p>;
}

// Sửa họ tên (PATCH /v1/me/profile). Không có SĐT/email: Airrest không thu thông tin liên hệ ở tài khoản (BR-002).
export function EditProfile() {
  const { state, dispatch } = useApp();
  const user = state.user;
  const [name, setName] = useState(user.fullName || user.username);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: '' });
  const save = async (e) => {
    e.preventDefault();
    const fullName = name.trim();
    if (!fullName) { setMsg({ ok: false, text: 'Nhập họ và tên.' }); return; }
    if (fullName.length > FULLNAME_MAX) { setMsg({ ok: false, text: `Họ và tên tối đa ${FULLNAME_MAX} ký tự.` }); return; }
    setBusy(true); setMsg({ ok: false, text: '' });
    try { dispatch({ type: 'setUser', user: await updateProfile({ fullName }) }); setMsg({ ok: true, text: 'Đã lưu họ và tên.' }); }
    catch (x) { setMsg({ ok: false, text: describeAuthError(x) }); }
    finally { setBusy(false); }
  };
  return (
    <section className={SECTION} aria-labelledby="edit-profile">
      <h2 id="edit-profile" className="tw:text-lg tw:font-bold">Thông tin cá nhân</h2>
      <form onSubmit={save} noValidate data-testid="edit-profile" className="tw:mt-4 tw:grid tw:gap-4 tw:sm:max-w-md">
        <label className={LBL}>Họ và tên<input value={name} onChange={(e) => { setName(e.target.value); setMsg({ ok: false, text: '' }); }} maxLength={FULLNAME_MAX} autoComplete="name" /></label>
        <Msg m={msg} />
        <button disabled={busy || name.trim() === (user.fullName || user.username)} className={BTN}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
      </form>
    </section>
  );
}

const num = (v, min, max) => Math.min(max, Math.max(min, Math.floor(Number(v) || min)));

// Cấu hình cá nhân: sân bay, số khách/phòng và hình thức thanh toán mặc định. Dùng để điền sẵn khi tìm và đặt phòng.
export function Preferences() {
  const { state, dispatch } = useApp();
  const p = state.user.preferences ?? {};
  const [airports, setAirports] = useState([]);
  const [f, setF] = useState({ airport: p.airport ?? '', adults: p.adults ?? 2, children: p.children ?? 0, rooms: p.rooms ?? 1, paymentMethod: p.paymentMethod ?? '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: '' });
  useEffect(() => { listAirports().then(setAirports).catch(() => setAirports([])); }, []);
  const set = (k) => (e) => { setF((v) => ({ ...v, [k]: e.target.value })); setMsg({ ok: false, text: '' }); };
  const save = async (e) => {
    e.preventDefault();
    const adults = num(f.adults, 1, 30); const children = num(f.children, 0, 29); const rooms = num(f.rooms, 1, 5);
    if (adults + children > 30) { setMsg({ ok: false, text: 'Tổng số khách tối đa 30.' }); return; }
    setBusy(true); setMsg({ ok: false, text: '' });
    try {
      const user = await updateProfile({ preferences: { ...(f.airport && { airport: f.airport }), adults, children, rooms, ...(f.paymentMethod && { paymentMethod: f.paymentMethod }) } });
      dispatch({ type: 'setUser', user });
      setF((v) => ({ ...v, adults, children, rooms }));
      setMsg({ ok: true, text: 'Đã lưu cấu hình. Lần tìm và đặt phòng sau sẽ điền sẵn.' });
    } catch (x) { setMsg({ ok: false, text: describeAuthError(x) }); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setMsg({ ok: false, text: '' });
    try { dispatch({ type: 'setUser', user: await updateProfile({ preferences: {} }) }); setF({ airport: '', adults: 2, children: 0, rooms: 1, paymentMethod: '' }); setMsg({ ok: true, text: 'Đã xóa cấu hình.' }); }
    catch (x) { setMsg({ ok: false, text: describeAuthError(x) }); }
    finally { setBusy(false); }
  };
  return (
    <section className={SECTION} aria-labelledby="prefs">
      <h2 id="prefs" className="tw:text-lg tw:font-bold">Cấu hình</h2>
      <p className="tw:mt-1 tw:text-xs tw:text-slate-500">Chọn mặc định để không phải nhập lại mỗi lần tìm và đặt phòng.</p>
      <form onSubmit={save} noValidate data-testid="preferences" className="tw:mt-4 tw:grid tw:gap-4 tw:sm:max-w-xl tw:sm:grid-cols-3">
        <label className={`${LBL} tw:sm:col-span-3`}>Sân bay mặc định<Select value={f.airport} onChange={set('airport')}><option value="">Không chọn (Nội Bài)</option>{airports.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>)}</Select></label>
        <label className={LBL}>Người lớn<input type="number" min={1} max={30} value={f.adults} onChange={set('adults')} /></label>
        <label className={LBL}>Trẻ em<input type="number" min={0} max={29} value={f.children} onChange={set('children')} /></label>
        <label className={LBL}>Số phòng<input type="number" min={1} max={5} value={f.rooms} onChange={set('rooms')} /></label>
        <label className={`${LBL} tw:sm:col-span-3`}>Thanh toán ưa thích<Select value={f.paymentMethod} onChange={set('paymentMethod')}><option value="">Không chọn (tại khách sạn)</option>{Object.entries(PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
        <div className="tw:grid tw:gap-3 tw:sm:col-span-3"><Msg m={msg} /><div className="tw:flex tw:flex-wrap tw:gap-3"><button disabled={busy} className={BTN}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button><button type="button" disabled={busy} onClick={reset} className="tw:min-h-11 tw:rounded-xl tw:border tw:border-slate-300 tw:px-5 tw:text-xs tw:font-bold tw:text-slate-600 tw:disabled:opacity-60">Xóa cấu hình</button></div></div>
      </form>
    </section>
  );
}

// Ticket hỗ trợ gắn với tài khoản (gửi lúc đang đăng nhập). Bấm một ticket để mở hội thoại ở trang Hỗ trợ.
export function MyTickets() {
  const { dispatch } = useApp();
  const [st, setSt] = useState({ items: [], next: null, loading: true, more: false, error: '' });
  const load = (cursor) => {
    setSt((v) => ({ ...v, loading: !cursor, more: !!cursor, error: '' }));
    return listMyTickets(cursor)
      .then((r) => setSt((v) => ({ items: cursor ? [...v.items, ...r.items] : r.items, next: r.nextCursor ?? null, loading: false, more: false, error: '' })))
      .catch((e) => setSt((v) => ({ ...v, loading: false, more: false, error: describeAuthError(e) })));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (t) => { setTicketPrefill({ code: t.code, phone: t.phone }); dispatch({ type: 'go', screen: 'support' }); window.scrollTo({ top: 0 }); };
  return (
    <section className="tw:mt-8" aria-labelledby="my-tickets" data-testid="my-tickets">
      <h2 id="my-tickets" className="tw:text-lg tw:font-bold">Yêu cầu hỗ trợ của tôi</h2>
      {st.loading && <p role="status" className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-xs tw:text-slate-500">Đang tải yêu cầu hỗ trợ…</p>}
      {st.error && <div role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-semibold tw:text-rose-700">{st.error} <button type="button" onClick={() => load(st.items.length ? st.next : undefined)} className="tw:ml-2 tw:underline">Thử lại</button></div>}
      {!st.loading && !st.error && !st.items.length && <p className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-5 tw:text-xs tw:leading-6 tw:text-slate-500">Bạn chưa gửi yêu cầu hỗ trợ nào khi đăng nhập. Yêu cầu gửi lúc đang đăng nhập sẽ hiện ở đây.</p>}
      {st.items.length > 0 && (
        <ul className="tw:mt-4 tw:grid tw:list-none tw:gap-3 tw:p-0">
          {st.items.map((t) => { const [label, tone] = TICKET_STATUS[t.status] ?? [t.status, 'wait']; return (
            <li key={t.code}>
              <button type="button" onClick={() => open(t)} data-testid="my-ticket-row" className="tw:flex tw:w-full tw:flex-col tw:gap-2 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-4 tw:text-left tw:hover:border-blue-300 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between">
                <span className="tw:min-w-0"><strong className="tw:block tw:text-sm tw:tracking-wider">{t.code}</strong><span className="tw:mt-1 tw:block tw:truncate tw:text-xs tw:text-slate-600">{t.subject}</span><span className="tw:mt-1 tw:block tw:text-[11px] tw:text-slate-500">Gửi {dmy(t.createdAt)}</span></span>
                <span className={`tw:w-fit tw:shrink-0 tw:rounded-full tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-bold ${TONE[tone]}`}>{label}</span>
              </button>
            </li>); })}
        </ul>
      )}
      {st.next != null && !st.error && <button type="button" disabled={st.more} onClick={() => load(st.next)} className="tw:mt-4 tw:min-h-11 tw:w-full tw:rounded-xl tw:border tw:border-slate-300 tw:text-xs tw:font-bold tw:disabled:opacity-60">{st.more ? 'Đang tải…' : 'Tải thêm'}</button>}
    </section>
  );
}
