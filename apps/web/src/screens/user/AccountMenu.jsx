import React, { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, Heart, LogOut } from 'lucide-react';
import { useApp } from '../../state/store';
import { listNotifications } from '../../data/user';
import { useFavorites } from '../../data/favorites';
import { ACCOUNT_TABS } from './accountTabs';

const ICON_BTN = 'tw:relative tw:grid tw:size-11 tw:place-items-center tw:rounded-xl tw:text-slate-600 tw:hover:bg-slate-100';
const BADGE = 'tw:absolute tw:right-0.5 tw:top-0.5 tw:grid tw:min-w-[18px] tw:place-items-center tw:rounded-full tw:bg-rose-600 tw:px-1 tw:text-[10px] tw:font-bold tw:leading-[18px] tw:text-white';

// Phần bên phải header khi khách đã đăng nhập: chuông thông báo, tim yêu thích, tên đăng nhập sổ xuống menu tài khoản.
export default function AccountMenu() {
  const { state, dispatch } = useApp();
  const user = state.user;
  const { count: favCount } = useFavorites(true);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const refresh = () => listNotifications().then((r) => setUnread(r.unread)).catch(() => {});
  useEffect(() => { refresh(); }, [state.screen, state.partnerTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.addEventListener('airrest:notif', refresh); return () => window.removeEventListener('airrest:notif', refresh); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const goTab = (tab) => { setOpen(false); dispatch({ type: 'route', screen: 'account', partnerTab: tab }); window.scrollTo({ top: 0 }); };
  const logout = () => { setOpen(false); dispatch({ type: 'logout' }); dispatch({ type: 'go', screen: 'home' }); };
  const initial = (user.name || user.username || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="tw:flex tw:items-center tw:gap-1">
      <button type="button" onClick={() => goTab('thong-bao')} aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'} data-testid="hdr-bell" className={ICON_BTN}><Bell size={20} />{unread > 0 && <span className={BADGE} data-testid="hdr-bell-count">{unread > 99 ? '99+' : unread}</span>}</button>
      <button type="button" onClick={() => goTab('yeu-thich')} aria-label={favCount ? `Yêu thích, ${favCount} khách sạn` : 'Yêu thích'} data-testid="hdr-heart" className={ICON_BTN}><Heart size={20} />{favCount > 0 && <span className={BADGE} data-testid="hdr-heart-count">{favCount > 99 ? '99+' : favCount}</span>}</button>
      <div ref={box} className="tw:relative">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} data-testid="hdr-user" className="tw:flex tw:min-h-11 tw:items-center tw:gap-2 tw:rounded-xl tw:px-2 tw:text-left tw:hover:bg-slate-100">
          <span className="tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-blue-50 tw:text-xs tw:font-extrabold tw:text-blue-700">{initial}</span>
          <span className="tw:hidden tw:max-w-[140px] tw:leading-tight tw:md:block"><span className="tw:block tw:truncate tw:text-xs tw:font-bold">{user.name}</span><span className="tw:block tw:truncate tw:text-[11px] tw:text-slate-500">{user.username}</span></span>
          <ChevronDown size={14} className={`tw:hidden tw:text-slate-500 tw:transition-transform tw:md:block ${open ? 'tw:rotate-180' : ''}`} />
        </button>
        {open && (
          <div role="menu" data-testid="hdr-menu" className="tw:absolute tw:right-0 tw:top-full tw:z-50 tw:mt-2 tw:w-64 tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-2 tw:shadow-xl">
            <div className="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-slate-100 tw:px-3 tw:pb-3 tw:pt-2">
              <span className="tw:grid tw:size-10 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-blue-50 tw:font-extrabold tw:text-blue-700">{initial}</span>
              <span className="tw:min-w-0"><strong className="tw:block tw:truncate tw:text-sm">{user.name}</strong><span className="tw:block tw:truncate tw:text-xs tw:text-slate-500">{user.username}</span></span>
            </div>
            <p className="tw:px-3 tw:pb-1 tw:pt-3 tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">Tài khoản của tôi</p>
            {ACCOUNT_TABS.map(({ id, label, Icon }) => <button key={id} type="button" role="menuitem" onClick={() => goTab(id)} className="tw:flex tw:min-h-11 tw:w-full tw:items-center tw:gap-3 tw:rounded-lg tw:px-3 tw:text-sm tw:font-medium tw:text-slate-700 tw:hover:bg-slate-50"><Icon size={17} className="tw:text-slate-500" />{label}</button>)}
            <div className="tw:mt-1 tw:border-t tw:border-slate-100 tw:pt-1">
              <button type="button" role="menuitem" onClick={logout} data-testid="hdr-logout" className="tw:flex tw:min-h-11 tw:w-full tw:items-center tw:gap-3 tw:rounded-lg tw:px-3 tw:text-sm tw:font-semibold tw:text-rose-600 tw:hover:bg-rose-50"><LogOut size={17} />Đăng xuất</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
