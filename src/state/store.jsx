import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { applyTimeChange } from '../lib/domain';
import { createRequest } from '../lib/request';
import { nextRequestCode, getProperty } from '../mock/service';
import { BROWSE_NOW } from '../config/simulation';

// Trạng thái toàn ứng dụng. Chỉ giữ trong bộ nhớ trang: không ghi localStorage/cookie (D-18 phương án A, NFR-005).
const initial = {
  screen: 'stays',         // trang chủ kiểu Couppa: nơi nghỉ quanh sân bay (chế độ duyệt, chưa cần chuyến bay)
  flight: null,            // chuyến bay đang theo dõi (D1 mô phỏng hoặc nhập thủ công)
  browseAirport: 'HAN',    // sân bay khi chưa có chuyến bay
  lookupPrefill: '',       // số hiệu gõ ở ô tìm kiếm trên header
  pendingProperty: false,  // đang đi nhập chuyến bay để đặt nơi nghỉ đã chọn
  simNow: BROWSE_NOW,      // giờ mô phỏng hiện tại (phút tuyệt đối)
  chips: [],               // bộ lọc nhanh đang bật (giữ khi chuyển M9 → M3, AC-046)
  showAll: false,
  propertyId: null,        // cơ sở đang xem/đặt
  booking: { name: '', method: '', result: null },
  request: null,           // yêu cầu hỗ trợ L2
  reminder: { browser: 'idle', enabled: false, notifiedFor: null },
  bannerClosedAt: null,
  refreshing: false,
  session: null,           // phiên của khách sạn/lái xe/quản trị (ngoài MVP, đăng nhập mô phỏng — D-25 A)
};

const NEEDS_FLIGHT = ['status', 'advice', 'stays', 'detail', 'booking', 'reminder', 'terminal', 'request'];

function reducer(s, a) {
  switch (a.type) {
    case 'go': return { ...s, screen: a.screen };
    case 'setBrowseAirport': return { ...s, browseAirport: a.airport, propertyId: null, showAll: false };
    case 'goLookup': return { ...s, screen: 'home', lookupPrefill: a.code || '', pendingProperty: !!a.pending };
    case 'selectProperty': return { ...s, propertyId: a.id };
    case 'closeProperty': return { ...s, propertyId: null };
    case 'setFlight': {
      const keepStay = s.pendingProperty && s.propertyId;
      return { ...initial, session: s.session, browseAirport: s.browseAirport, chips: s.chips, propertyId: keepStay ? s.propertyId : null,
        screen: keepStay ? 'detail' : 'status', flight: a.flight, simNow: a.flight.now };
    }
    case 'reset': return { ...initial, session: s.session };
    case 'login': return { ...s, session: a.session, screen: a.session.role === 'admin' ? 'admin' : 'hotel' };
    case 'logout': return { ...s, session: null, screen: 'login' };
    case 'advance': return { ...s, simNow: s.simNow + a.minutes };
    case 'timeChange': {
      if (!s.flight || s.flight.status === 'cancelled') return s;
      const flight = applyTimeChange(s.flight, a.minutes, s.simNow);
      return { ...s, flight, bannerClosedAt: null };
    }
    case 'flightRefreshed': return { ...s, flight: a.flight };
    case 'closeBanner': return { ...s, bannerClosedAt: s.flight?.change?.at ?? null };
    case 'toggleChip': return { ...s, chips: s.chips.includes(a.id) ? s.chips.filter((c) => c !== a.id) : [...s.chips, a.id], showAll: false };
    case 'clearChips': return { ...s, chips: [], showAll: false };
    case 'showAll': return { ...s, showAll: true };
    case 'openProperty': return { ...s, propertyId: a.id, screen: 'detail' };
    case 'startBooking': return { ...s, booking: { name: s.booking.name, method: '', result: null }, screen: 'booking' };
    case 'bookingField': return { ...s, booking: { ...s.booking, [a.field]: a.value } };
    case 'bookingDone': return { ...s, booking: { ...s.booking, result: a.result } };
    case 'roomGone': return { ...s, propertyId: null, screen: 'stays', notice: 'roomGone' };
    case 'clearNotice': return { ...s, notice: null };
    case 'sendRequest': return { ...s, request: createRequest({ code: nextRequestCode(), flight: s.flight, now: s.simNow }) };
    case 'pickAlt': return { ...s, request: { ...s.request, altId: a.id, altAt: s.simNow } };
    case 'switchSelf': return { ...s, request: { ...s.request, switchedAt: s.simNow }, screen: 'stays' };
    case 'reminderBrowser': return { ...s, reminder: { ...s.reminder, browser: a.value } };
    case 'reminderEnable': return { ...s, reminder: { ...s.reminder, enabled: true } };
    case 'reminderNotified': return { ...s, reminder: { ...s.reminder, notifiedFor: a.value } };
    default: return s;
  }
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial, (init) => {
    const h = window.location.hash.replace('#/', '');
    return ['home', 'support', 'terminal', 'stays', 'login', 'hotel', 'admin'].includes(h) ? { ...init, screen: h } : init;
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
      const ok = ['home', 'support', 'stays', 'terminal', 'login', 'hotel', 'admin'].includes(scr) || (scr === 'detail' && state.propertyId) || (state.flight && NEEDS_FLIGHT.includes(scr));
      dispatch({ type: 'go', screen: ok ? scr : 'home' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [state.flight, state.propertyId]);

  const value = useMemo(() => ({ state, dispatch, getProperty }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
