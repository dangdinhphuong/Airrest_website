// Dữ liệu "sống" cho cổng nhân sự/tài xế: tải qua REST, tự làm mới khi có 'shuttle:update' (giãn tối đa ~1 lần/giây),
// nhận 'trip:position' cập nhật vị trí; mất socket thì làm mới định kỳ 7 giây. Đóng kết nối khi rời màn.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { connectRealtime } from './socket';

// lib/api.js không xuất token nhân sự: lấy đúng một lần bằng cách đọc header Authorization của lời gọi /api/v1/auth/me.
// shortcut: bắt header qua window.fetch, nên có getter token trong lib/api.js thì thay đoạn này.
let tokenCache = { key: null, p: null };
function staffToken(key) {
  if (tokenCache.key === key && tokenCache.p) return tokenCache.p;
  const p = (async () => {
    const orig = window.fetch;
    let tok = null;
    window.fetch = (u, o) => { const a = o?.headers?.Authorization; if (a) tok = String(a).replace(/^Bearer /, ''); return orig(u, o); };
    try { await api.get('/api/v1/auth/me'); } finally { window.fetch = orig; }
    return tok;
  })().catch(() => null);
  tokenCache = { key, p };
  return p;
}

const POLL_MS = 7000; // socket mất kết nối
const SAFETY_POLL_MS = 30000; // socket đang nối: vẫn làm mới thưa phòng khi bỏ lỡ sự kiện
const THROTTLE_MS = 1000;

/** fn(): Promise<data>. Trả { data, err, loading, reload, conn: 'online'|'offline'|'connecting', positions: {tripId: {...}} }. */
// opts (tùy chọn): { refreshOn: (tênSựKiện) => bool làm mới theo sự kiện, onEvent(name, payload), pollMs: chu kỳ làm mới (cả khi socket đang nối) }.
export function useLiveData(fn, deps, sessionKey, opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [st, setSt] = useState({ data: null, err: null, loading: true });
  const [conn, setConn] = useState('connecting');
  const [positions, setPositions] = useState({});
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const ver = useRef(0);
  const reload = useCallback(async (silent = true) => {
    const v = ++ver.current;
    if (!silent) setSt((s) => ({ ...s, loading: true, err: null }));
    try { const data = await fnRef.current(); if (v === ver.current) setSt({ data, err: null, loading: false }); } catch (err) { if (v === ver.current) setSt((s) => ({ data: silent ? s.data : null, err, loading: false })); }
  }, []);
  useEffect(() => { reload(false); }, [reload, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let closed = false;
    let timer = null;
    let last = 0;
    const kick = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; last = Date.now(); reload(true); }, Math.max(0, THROTTLE_MS - (Date.now() - last)));
    };
    let stop = () => {};
    staffToken(sessionKey).then((token) => {
      if (closed) return;
      stop = connectRealtime({
        token,
        onState: (s) => !closed && setConn(s),
        onEvent: (name, p) => {
          optsRef.current?.onEvent?.(name, p);
          if (name === 'shuttle:update' || optsRef.current?.refreshOn?.(name)) kick();
          else if (name === 'trip:position' && p?.tripId) setPositions((m) => ({ ...m, [p.tripId]: p }));
        },
      });
    });
    return () => { closed = true; clearTimeout(timer); stop(); };
  }, [reload, sessionKey]);

  useEffect(() => {
    const id = setInterval(() => reload(true), optsRef.current?.pollMs ?? (conn === 'online' ? SAFETY_POLL_MS : POLL_MS));
    return () => clearInterval(id);
  }, [conn, reload]);

  return { ...st, reload: () => reload(false), refresh: () => reload(true), conn, positions };
}
