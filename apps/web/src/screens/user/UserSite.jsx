import React, { useRef } from 'react';
import { Headphones, Hotel, Plane, Search, ShieldCheck, UserRound } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useApp } from '../../state/store';
import { areasOf } from '../../lib/access';
import { scrollToId } from './data';
import ChatBot from './ChatBot';

gsap.registerPlugin(useGSAP);

export function Logo({ tone = 'tw:text-[#062253]' }) {
  return (
    <span className={`tw:inline-flex tw:items-center tw:gap-2.5 tw:font-extrabold tw:tracking-[-0.03em] ${tone}`}>
      <span className="tw:grid tw:size-9 tw:-rotate-6 tw:place-items-center tw:rounded-xl tw:bg-[#1262e8] tw:text-white"><Plane size={18} /></span>
      AIRREST
    </span>
  );
}

const NAV = 'tw:rounded-lg tw:px-4 tw:py-3 tw:text-sm tw:font-semibold tw:text-slate-600 tw:hover:bg-blue-50 tw:hover:text-blue-700';
const BOTTOM = 'tw:flex tw:min-h-16 tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:text-[9px] tw:font-semibold';

// Khung trang người dùng: header, footer và thanh điều hướng dưới (mobile) của AIRREST.
export default function UserSite({ page, children }) {
  const { state, dispatch } = useApp();
  const root = useRef(null);

  const go = (screen) => { dispatch({ type: 'go', screen }); window.scrollTo({ top: 0 }); };
  const goSection = (id) => { if (page !== 'home') dispatch({ type: 'go', screen: 'home' }); scrollToId(id); };
  const goPartner = () => go(state.session ? (areasOf(state.session)[0] ?? 'login') : 'login');

  // Hiệu ứng vào trang: chỉ opacity/transform, bỏ qua khi người dùng yêu cầu giảm chuyển động.
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-page]', { opacity: 0, y: 14, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [page] });

  return (
    <div ref={root} className="airrest-user tw:min-h-screen tw:bg-white tw:pb-16 tw:text-[#10203a] tw:md:pb-0">
      <header className="tw:sticky tw:top-0 tw:z-50 tw:border-b tw:border-slate-200/80 tw:bg-white/95 tw:backdrop-blur-xl">
        <nav className="tw:mx-auto tw:flex tw:h-[72px] tw:max-w-[1180px] tw:items-center tw:justify-between tw:px-5" aria-label="Điều hướng chính">
          <button type="button" onClick={() => go('home')} aria-label="AIRREST, về trang chủ"><Logo /></button>
          <div className="tw:hidden tw:md:flex tw:md:flex-row tw:md:gap-1">
            <button type="button" className={NAV} onClick={() => goSection('how')}>Cách hoạt động</button>
            <button type="button" className={NAV} onClick={() => goSection('stays')}>Nơi nghỉ</button>
            <button type="button" className={NAV} onClick={() => go('track')}>Theo dõi booking</button>
            <button type="button" className={NAV} onClick={() => go('support')}>Trợ giúp</button>
          </div>
          <div className="tw:flex tw:items-center tw:gap-2">
            <button type="button" onClick={() => go('track')} className="tw:hidden tw:items-center tw:gap-2 tw:rounded-xl tw:bg-[#1262e8] tw:px-4 tw:py-3 tw:text-xs tw:font-bold tw:text-white tw:lg:flex"><Search size={16} /> Tra cứu</button>
            {state.user ? (
              <button type="button" onClick={() => go('account')} className="tw:hidden tw:max-w-[170px] tw:items-center tw:gap-2 tw:rounded-xl tw:border tw:border-slate-300 tw:px-3 tw:py-2.5 tw:text-xs tw:font-bold tw:text-slate-700 tw:hover:bg-slate-50 tw:md:flex"><UserRound size={16} className="tw:shrink-0" /><span className="tw:truncate">{state.user.name}</span></button>
            ) : state.session ? (
              <button type="button" onClick={goPartner} className="tw:hidden tw:items-center tw:rounded-xl tw:border tw:border-slate-300 tw:px-4 tw:py-3 tw:text-xs tw:font-bold tw:text-slate-700 tw:hover:bg-slate-50 tw:md:flex">Cổng làm việc</button>
            ) : (
              <button type="button" onClick={() => go('login')} className="tw:hidden tw:rounded-xl tw:border tw:border-slate-300 tw:px-4 tw:py-3 tw:text-xs tw:font-bold tw:text-slate-700 tw:hover:bg-slate-50 tw:md:block">Đăng nhập</button>
            )}
            <button type="button" onClick={() => go(state.user ? 'account' : 'login')} aria-label={state.user ? 'Tài khoản' : 'Đăng nhập'} className="tw:grid tw:size-11 tw:place-items-center tw:rounded-xl tw:bg-slate-100 tw:md:hidden"><UserRound /></button>
          </div>
        </nav>
      </header>

      <main data-page>{children}</main>

      <footer className="tw:bg-[#071a38] tw:py-12 tw:text-white">
        <div className="tw:mx-auto tw:grid tw:max-w-[1180px] tw:gap-9 tw:px-5 tw:sm:grid-cols-2 tw:lg:grid-cols-4">
          <div><Logo tone="tw:text-white" /><p className="tw:mt-4 tw:text-xs tw:leading-6 tw:text-slate-400">Giúp hành khách tìm lại sự chủ động khi chuyến bay thay đổi.</p></div>
          <div className="tw:grid tw:content-start tw:justify-items-start tw:gap-1 tw:text-xs tw:[&_button]:py-2 tw:text-slate-400">
            <strong className="tw:text-white">Hành khách</strong>
            <button type="button" onClick={() => goSection('stays')}>Tìm nơi nghỉ</button>
            <button type="button" onClick={() => go('track')}>Theo dõi booking</button>
            <button type="button" onClick={() => go('support')}>Hỗ trợ</button>
            <button type="button" onClick={() => go(state.user ? 'account' : 'login')}>{state.user ? 'Tài khoản' : 'Đăng nhập'}</button>
          </div>
          <div className="tw:grid tw:content-start tw:justify-items-start tw:gap-1 tw:text-xs tw:[&_button]:py-2 tw:text-slate-400"><strong className="tw:text-white">Vận hành</strong><button type="button" onClick={goPartner}>Cổng quản trị & đối tác</button><span>22 sân bay thương mại Việt Nam</span></div>
          <div className="tw:rounded-xl tw:border tw:border-white/10 tw:p-4"><ShieldCheck className="tw:text-blue-300" /><p className="tw:mt-3 tw:text-[10px] tw:leading-5 tw:text-slate-400">MVP nghiên cứu. Không tích hợp thanh toán thật, hãng bay thật hoặc tồn phòng thời gian thực.</p></div>
        </div>
      </footer>

      <div className="tw:fixed tw:inset-x-0 tw:bottom-0 tw:z-40 tw:grid tw:grid-cols-4 tw:border-t tw:border-slate-200 tw:bg-white tw:pb-[env(safe-area-inset-bottom)] tw:md:hidden">
        <button type="button" onClick={() => go('home')} className={`${BOTTOM} ${page === 'home' ? 'tw:text-blue-600' : 'tw:text-slate-500'}`}><Plane size={18} />Chuyến bay</button>
        <button type="button" onClick={() => goSection('stays')} className={`${BOTTOM} tw:text-slate-500`}><Hotel size={18} />Nơi nghỉ</button>
        <button type="button" onClick={() => go('track')} className={`${BOTTOM} ${page === 'track' ? 'tw:text-blue-600' : 'tw:text-slate-500'}`}><Search size={18} />Booking</button>
        <button type="button" onClick={() => go('support')} className={`${BOTTOM} ${page === 'support' ? 'tw:text-blue-600' : 'tw:text-slate-500'}`}><Headphones size={18} />Trợ giúp</button>
      </div>
      <ChatBot />
    </div>
  );
}
