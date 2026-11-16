import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { getGuestToken, hasStaffToken, setAuthToken, setGuestToken, setOnUnauthorized } from '../lib/api';
import { fetchMe } from '../data/user';
import { restoreStaff } from '../data/auth';
import { areasOf } from '../lib/access';
import { setTrackPrefill } from '../screens/user/data';
import { parsePath, pathOf } from '../lib/routes';

// Trạng thái toàn ứng dụng trong bộ nhớ trang. Chỉ token KHÁCH được lưu sessionStorage (lib/api.js); phiên nhân sự không bao giờ ghi ra ngoài bộ nhớ. Dữ liệu nghiệp vụ lấy từ API ở data/*.
const initial = {
  screen: 'home',
  browseAirport: 'HAN',  // sân bay mặc định cho trợ lý chat và khung nhân sự
  propertyId: null,      // nơi nghỉ đang xem ở trang chi tiết
  partnerTab: null,      // tab đang chọn ở cổng khách sạn/quản trị
  session: null,         // nhân sự: { id, name, type, permissions, hotelId, area }; token ở lib/api.js
  booting: hasStaffToken(), // đang khôi phục phiên nhân sự sau khi tải lại trang
  user: null,            // hành khách đăng nhập: { id, username, name }; token ở lib/api.js (sessionStorage)
};

const keepAuth = (s) => ({ session: s.session, user: s.user });

function reducer(s, a) {
  switch (a.type) {
    case 'go': return { ...s, screen: a.screen };
    case 'goLookup': return { ...s, screen: 'home' };
    case 'setBrowseAirport': return { ...s, browseAirport: a.airport };
    case 'route': return { ...s, screen: a.screen, propertyId: a.propertyId ?? s.propertyId, partnerTab: a.partnerTab !== undefined ? a.partnerTab : s.partnerTab };
    case 'openProperty': return { ...s, propertyId: a.id, screen: 'detail' };
    case 'partnerTab': return { ...s, partnerTab: a.id };
    case 'login': return { ...s, partnerTab: null, session: a.session, user: null, screen: a.session.area };
    case 'userLogin': return { ...s, partnerTab: null, session: null, user: a.user, browseAirport: a.user.preferences?.airport ?? s.browseAirport, screen: a.screen ?? 'home' };
    case 'restoreUser': return s.session || s.user ? s : { ...s, user: a.user, browseAirport: a.user.preferences?.airport ?? s.browseAirport };
    case 'setUser': return s.user ? { ...s, user: a.user, browseAirport: a.user.preferences?.airport ?? s.browseAirport } : s; // sau khi khách sửa hồ sơ/cấu hình
    case 'unauthorized': return s.session || s.user ? { ...s, session: null, user: null, partnerTab: null, screen: 'login' } : s;
    case 'restoreStaff': { const areas = areasOf(a.session); const scr = areas.includes(s.screen) ? s.screen : areas[0]; return { ...s, booting: false, session: { ...a.session, area: scr }, screen: scr }; }
    case 'profile': return s.session ? { ...s, session: { ...s.session, name: a.name } } : s; // sau khi nhân sự tự sửa hồ sơ
    case 'hotels': return s.session ? { ...s, session: { ...s.session, hotels: a.hotels } } : s; // danh sách khách sạn của chủ doanh nghiệp (sau khi tạo/gửi hồ sơ)
    case 'switchHotel': return s.session ? { ...s, session: { ...s.session, hotelId: a.hotelId, hotels: a.hotels ?? s.session.hotels } } : s;
    case 'bootDone': return { ...s, booting: false };
    case 'logout': return { ...s, session: null, user: null, partnerTab: null, screen: 'login' };
    case 'reset': return { ...initial, ...keepAuth(s) };
    default: return s;
  }
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const routeNow = () => parsePath(window.location.pathname, window.location.hash);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial, (init) => {
    if (window.location.pathname.startsWith('/tra-cuu')) { // link trong email: /tra-cuu?code=AR-XXXXXXXX hoặc NH-XXXXXXXX
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) setTrackPrefill(code.trim().slice(0, 40));
    }
    const r = routeNow();
    return r ? { ...init, ...r } : init;
  });

  // Đồng bộ màn hình với đường dẫn (mỗi màn một link) để nút Quay lại và tải lại trang hoạt động.
  // Lần đầu dùng replaceState (đổi link hash cũ/đường lạ sang link chuẩn); /payment/result giữ nguyên để không mất query của cổng thanh toán.
  const synced = useRef(false);
  useEffect(() => {
    if (state.screen === 'payment') { synced.current = true; return; }
    const want = pathOf(state);
    if (window.location.pathname !== want || window.location.hash) {
      window.history[synced.current ? 'pushState' : 'replaceState'](null, '', want);
    }
    synced.current = true;
  }, [state.screen, state.propertyId, state.partnerTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onPop = () => dispatch({ type: 'route', ...(routeNow() ?? { screen: 'home' }) });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Token chỉ gắn khi có phiên nhân sự; máy chủ trả 401 (hết hạn/thu hồi) thì đăng xuất.
  useEffect(() => { if (!state.session && !state.booting) setAuthToken(null); }, [state.session, state.booting]);
  useEffect(() => { // khôi phục phiên nhân sự: token trong sessionStorage + /v1/auth/me; token hỏng/hết hạn thì xóa
    if (!hasStaffToken()) return undefined;
    let alive = true;
    restoreStaff().then((sess) => alive && dispatch(sess && areasOf(sess).length ? { type: 'restoreStaff', session: sess } : { type: 'bootDone' }))
      .catch((e) => { if (e?.status === 401 || e?.status === 403) setAuthToken(null); if (alive) dispatch({ type: 'bootDone' }); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { setOnUnauthorized(() => dispatch({ type: 'unauthorized' })); }, []);

  // Khôi phục phiên khách sau khi tải lại trang: token trong sessionStorage + /v1/auth/me. Token hỏng/hết hạn thì xóa.
  const restored = useRef(false);
  useEffect(() => {
    let alive = true;
    if (!getGuestToken()) { restored.current = true; return undefined; }
    fetchMe().then((u) => { if (alive) dispatch({ type: 'restoreUser', user: u }); })
      .catch((e) => { if (e?.status === 401 || e?.status === 403 || e?.name !== 'ApiError') setGuestToken(null); })
      .finally(() => { restored.current = true; });
    return () => { alive = false; };
  }, []);
  // Hết phiên khách (đăng xuất, 401, đăng nhập nhân sự) thì xóa token khách.
  useEffect(() => { if (!state.user && restored.current) setGuestToken(null); }, [state.user]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
