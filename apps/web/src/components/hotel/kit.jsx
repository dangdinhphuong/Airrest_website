import React, { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../../lib/api';
import { Notice } from '../Common';

export const fmtD = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '');
export const fmtDT = (v) => (v ? new Date(v).toLocaleString('vi-VN', { hour12: false }) : '');
export const today = (plus = 0) => { const d = new Date(Date.now() + plus * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Tải một lần, có loading/lỗi/reload.
export function useLoad(fn, deps) {
  const [st, setSt] = useState({ loading: true, data: null, err: null });
  const run = useCallback(() => {
    setSt((s) => ({ ...s, loading: true, err: null }));
    let live = true;
    fn().then((data) => live && setSt({ loading: false, data, err: null }), (err) => live && setSt({ loading: false, data: null, err }));
    return () => { live = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => run(), [run]);
  return { ...st, reload: run };
}

// Danh sách phân trang keyset: fetchPage(cursor) -> { items, nextCursor }.
export function usePaged(fetchPage, deps) {
  const [st, setSt] = useState({ items: [], next: null, loading: true, more: false, err: null });
  const ver = useRef(0);
  const load = useCallback(async (cursor) => {
    const v = ++ver.current;
    setSt((s) => ({ ...s, loading: !cursor, more: !!cursor, err: null }));
    try {
      const r = await fetchPage(cursor);
      if (v === ver.current) setSt((s) => ({ items: cursor ? [...s.items, ...r.items] : r.items, next: r.nextCursor ?? null, loading: false, more: false, err: null }));
    } catch (err) { if (v === ver.current) setSt((s) => ({ ...s, loading: false, more: false, err })); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(undefined); }, [load]);
  return { ...st, reload: () => load(undefined), loadMore: () => load(st.next) };
}

// Chạy một hành động ghi, hiện thông báo thành công/thất bại (describeError = tiếng Việt). Trả true nếu thành công.
export function useAction(describe = describeError) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ tone: 'ok', text: typeof ok === 'function' ? ok(r) : ok }); return true; } catch (e) { setMsg({ tone: 'error', text: describe(e) }); return false; } finally { setBusy(false); }
  };
  const note = msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}><span data-testid={`msg-${msg.tone}`}>{msg.text}</span></Notice>;
  return { run, busy, note };
}
