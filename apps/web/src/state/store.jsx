import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { setAuthToken, setOnUnauthorized } from '../lib/api';

// Trạng thái toàn ứng dụng, chỉ giữ trong bộ nhớ trang (không ghi localStorage/cookie). Dữ liệu nghiệp vụ lấy từ API ở data/*.
const initial = {
  screen: 'home',
  browseAirport: 'HAN',  // sân bay mặc định cho trợ lý chat và khung nhân sự
  propertyId: null,      // nơi nghỉ đang xem ở trang chi tiết
  partnerTab: null,      // tab đang chọn ở cổng khách sạn/quản trị
  session: null,         // nhân sự: { id, name, type, permissions, hotelId, area }; token ở lib/api.js
  user: null,            // hành khách đăng nhập MÔ PHỎNG ({ name }); backend chưa có tài khoản hành khách
};

const keepAuth = (s) => ({ session: s.session, user: s.user });

function reducer(s, a) {
  switch (a.type) {
    case 'go': return { ...s, screen: a.screen };
    case 'goLookup': return { ...s, screen: 'home' };
    case 'setBrowseAirport': return { ...s, browseAirport: a.airport };
    case 'openProperty': return { ...s, propertyId: a.id, screen: 'detail' };
    case 'partnerTab': return { ...s, partnerTab: a.id };
    case 'login': return { ...s, partnerTab: null, session: a.session, user: null, screen: a.session.area };
    case 'userLogin': return { ...s, partnerTab: null, session: null, user: a.user, screen: 'home' };
    case 'logout': return { ...s, session: null, user: null, partnerTab: null, screen: 'login' };
    case 'reset': return { ...initial, ...keepAuth(s) };
    default: return s;
  }
}

const SCREENS = ['home', 'support', 'track', 'account', 'login', 'hotel', 'admin'];
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial, (init) => {
    if (window.location.pathname.startsWith('/payment/result')) return { ...init, screen: 'payment' }; // VNPay đưa khách về đường dẫn này
    const h = window.location.hash.replace('#/', '');
    return SCREENS.includes(h) ? { ...init, screen: h } : init;
  });

  // Đồng bộ màn hình với hash để nút Quay lại của trình duyệt hoạt động.
  useEffect(() => {
    const want = `#/${state.screen}`;
    if (window.location.hash === want) return;
    if (!window.location.hash) window.history.replaceState(null, '', want); else window.history.pushState(null, '', want);
  }, [state.screen]);
  useEffect(() => {
    const onPop = () => {
      const scr = window.location.hash.replace('#/', '') || 'home';
      dispatch({ type: 'go', screen: SCREENS.includes(scr) || (scr === 'detail' && state.propertyId) ? scr : 'home' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [state.propertyId]);

  // Token chỉ gắn khi có phiên nhân sự; máy chủ trả 401 (hết hạn/thu hồi) thì đăng xuất.
  useEffect(() => { if (!state.session) setAuthToken(null); }, [state.session]);
  useEffect(() => { setOnUnauthorized(() => dispatch({ type: 'logout' })); }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
