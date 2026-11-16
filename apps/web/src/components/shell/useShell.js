import { useCallback, useEffect, useState } from 'react';

const KEY = 'airrest-staff-shell@1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

// Trạng thái sidebar (thu gọn, nhóm đang đóng) lưu localStorage; hỏng/không có thì dùng mặc định (mở hết).
export function useShellPrefs() {
  const [p, setP] = useState(read);
  const set = useCallback((patch) => setP((s) => {
    const n = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* bỏ qua */ }
    return n;
  }), []);
  const closed = p.closed || [];
  return {
    collapsed: !!p.collapsed,
    setCollapsed: (v) => set({ collapsed: v }),
    closed,
    toggleGroup: (k) => set((s) => { const c = s.closed || []; return { closed: c.includes(k) ? c.filter((x) => x !== k) : [...c, k] }; }),
  };
}

export function useMediaQuery(q, initial = true) {
  const get = () => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : initial);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export const isTyping = (t) => !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
