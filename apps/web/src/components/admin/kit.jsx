import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, listAirports } from '../../data/admin';
import { describeError } from '../../lib/api';
import { ErrorBox, Loading, EmptyBox, Notice } from '../Common';

export const dt = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
export const d = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
export const isoOrUndef = (v) => (v ? new Date(v).toISOString() : undefined);
// Cận trên "đến ngày" gồm cả ngày được chọn: 00:00 ngày kế tiếp (giờ máy người dùng).
export const endOfDayIso = (v) => { if (!v) return undefined; const x = new Date(`${v}T00:00:00`); x.setDate(x.getDate() + 1); return x.toISOString(); };
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Danh mục sân bay (GET /v1/airports, công khai) tải một lần cho cả phiên.
let airportCache = null;
export function useAirports() {
  const [s, set] = useState({ items: airportCache || [], err: null });
  useEffect(() => {
    if (airportCache) return undefined;
    let live = true;
    listAirports().then((r) => { airportCache = r.items; if (live) set({ items: r.items, err: null }); }, (e) => live && set({ items: [], err: errText(e) }));
    return () => { live = false; };
  }, []);
  return s;
}
export const airportLabel = (a) => `${a.iata} – ${a.name} (${a.city})`;
export function AirportSelect({ id, value, onChange, airports, allowEmpty, required = true, ...rest }) {
  return (
    <select id={id} value={value} onChange={onChange} required={required} {...rest}>
      {(allowEmpty || !airports.length) && <option value="">{airports.length ? '— Chọn sân bay —' : 'Đang tải danh sách…'}</option>}
      {airports.map((a) => <option key={a.iata} value={a.iata}>{airportLabel(a)}</option>)}
    </select>
  );
}

export const shortId = (id) => (id ? String(id).slice(0, 8) : '—');

// Lỗi 422 của zod: thêm đường dẫn trường để người dùng biết sai ở đâu.
const ERR_VI = {
  AIRPORT_UNKNOWN: 'Mã sân bay không có trong danh mục. Hãy chọn sân bay từ danh sách.',
  FLIGHT_EXISTS: 'Chuyến bay này (mã chuyến và ngày bay) đã tồn tại.',
  FLIGHT_ROUTE_INVALID: 'Tuyến bay không hợp lệ: sân bay đi và đến phải khác nhau.',
  FLIGHT_IN_USE: 'Không thể xóa: chuyến bay này đã có lịch sử thay đổi hoặc đang được tham chiếu.',
  ROLE_NAME_TAKEN: 'Tên vai trò đã tồn tại.',
  ROLE_SYSTEM_IMMUTABLE: 'Vai trò hệ thống không thể sửa hoặc xóa.',
  CANNOT_MODIFY_SELF: 'Không thể sửa vai trò của chính bạn.',
  ROLE_NOT_FOUND: 'Không tìm thấy vai trò (có thể đã bị xóa). Hãy tải lại danh sách.',
  FLIGHT_NOT_FOUND: 'Không tìm thấy chuyến bay (có thể đã bị xóa).',
};
const list = (a) => (Array.isArray(a) && a.length ? a.join(', ') : 'không rõ');
export function errText(e) {
  const d = e?.details && !Array.isArray(e.details) ? e.details : {};
  if (e?.code === 'PERMISSION_ESCALATION') return `Bạn không thể gán quyền mà bạn không có: ${list(d.missing)}.`;
  if (e?.code === 'UNKNOWN_PERMISSION') return `Có quyền không tồn tại trong danh mục: ${list(d.unknown)}.`;
  if (e?.code === 'ROLE_IN_USE') return `Vai trò đang được ${d.accountCount ?? 'một số'} tài khoản sử dụng.`;
  if (ERR_VI[e?.code]) return ERR_VI[e.code];
  const i = Array.isArray(e?.details) ? e.details[0] : null;
  return i?.path?.length ? `${describeError(e)} (${i.path.join('.')})` : describeError(e);
}

// Tải danh sách có phân trang "Tải thêm"; cursorKey là tên tham số con trỏ của API (after | cursor).
export function usePaged(path, query, cursorKey = 'cursor') {
  const [s, set] = useState({ items: [], next: null, loading: true, err: null });
  const q = JSON.stringify(query || {});
  const seq = useRef(0);
  const load = useCallback(async (after) => {
    const id = ++seq.current;
    set((p) => ({ ...p, loading: true, err: null, ...(after == null ? { items: [] } : {}) }));
    try {
      const r = await adminApi.list(path, { ...JSON.parse(q), ...(after != null && { [cursorKey]: after }) });
      if (id === seq.current) set((p) => ({ items: after == null ? r.items : [...p.items, ...r.items], next: r.nextCursor ?? null, loading: false, err: null }));
    } catch (e) { if (id === seq.current) set((p) => ({ ...p, loading: false, err: errText(e) })); }
  }, [path, q, cursorKey]);
  useEffect(() => { load(null); }, [load]);
  return { ...s, reload: () => load(null), more: () => load(s.next) };
}

// Tải một tài nguyên; reload() để làm mới.
export function useLoad(path, query) {
  const [s, set] = useState({ data: null, loading: true, err: null });
  const q = JSON.stringify(query || {});
  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current;
    set((p) => ({ ...p, loading: true, err: null }));
    try { const r = await adminApi.get(path, JSON.parse(q)); if (id === seq.current) set({ data: r, loading: false, err: null }); }
    catch (e) { if (id === seq.current) set((p) => ({ ...p, loading: false, err: errText(e) })); }
  }, [path, q]);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}

// Khung trạng thái cho danh sách: đang tải / lỗi (thử lại) / rỗng / nội dung + "Tải thêm".
export function PagedView({ p, empty = 'Không có dữ liệu.', children }) {
  if (p.err && !p.items.length) return <ErrorBox onRetry={p.reload}>{p.err}</ErrorBox>;
  if (p.loading && !p.items.length) return <Loading />;
  if (!p.items.length) return <EmptyBox title="Chưa có dữ liệu">{empty}</EmptyBox>;
  return (
    <>
      {children}
      {p.err && <Notice tone="error">{p.err}</Notice>}
      {p.next != null && <div className="row-actions"><button type="button" className="btn" onClick={p.more} disabled={p.loading} data-testid="load-more">{p.loading ? 'Đang tải…' : 'Tải thêm'}</button></div>}
    </>
  );
}

export function LoadView({ r, children }) {
  if (r.err && !r.data) return <ErrorBox onRetry={r.reload}>{r.err}</ErrorBox>;
  if (!r.data) return <Loading />;
  return children(r.data);
}

// Chạy hành động ghi: hiện thông báo thành công/thất bại, chặn bấm đúp.
export function useRun() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ tone: 'ok', text: okText }); return { ok: true, r }; }
    catch (e) { setMsg({ tone: 'error', text: errText(e) }); return { ok: false }; }
    finally { setBusy(false); }
  };
  const node = msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>;
  return { run, busy, msg, setMsg, node };
}

// Nút cần xác nhận; reason=true thì bắt nhập lý do (>= 3 ký tự). onDo(reason) trả Promise<{ok}> (từ useRun.run).
export function Act({ label, onDo, reason = false, danger = false, confirm = 'Bạn chắc chắn thực hiện?', testid, disabled }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  if (!open) return <button type="button" className={`btn btn-sm ${danger ? 'btn-danger' : ''}`} disabled={disabled} onClick={() => setOpen(true)} data-testid={testid}>{label}</button>;
  const go = async () => {
    if (reason && text.trim().length < 3) { setErr('Lý do cần ít nhất 3 ký tự.'); return; }
    const r = await onDo(text.trim());
    if (r?.ok !== false) { setOpen(false); setText(''); setErr(''); }
  };
  return (
    <span className="inline-form" role="group" aria-label={label}>
      {reason ? <input aria-label="Lý do" placeholder="Lý do (bắt buộc)" value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} data-testid={testid && `${testid}-reason`} /> : <small>{confirm}</small>}
      <button type="button" className="btn btn-sm btn-primary" onClick={go} data-testid={testid && `${testid}-confirm`}>Xác nhận</button>
      <button type="button" className="link-btn" onClick={() => { setOpen(false); setErr(''); }}>Huỷ</button>
      {err && <small className="field-error block" role="alert">{err}</small>}
    </span>
  );
}

// Ô lọc đơn giản: fields = [[key, label, type?, options?]]; áp dụng khi bấm "Lọc".
export function Filters({ fields, onApply, testid = 'filters', inclusiveTo = false }) {
  const [v, setV] = useState({});
  const apply = (e) => { e.preventDefault(); const o = {}; for (const [k, , t] of fields) if (v[k]) o[k] = t === 'date' ? (inclusiveTo && k === 'to' ? endOfDayIso(v[k]) : isoOrUndef(v[k])) : v[k].trim(); onApply(o); };
  return (
    <form className="inline-form" onSubmit={apply} style={{ margin: '8px 0 12px' }} data-testid={testid}>
      {fields.map(([k, label, t, opts]) => opts
        ? <select key={k} aria-label={label} value={v[k] || ''} onChange={(e) => setV({ ...v, [k]: e.target.value })}><option value="">{label}: tất cả</option>{opts.map(([val, txt]) => <option key={val} value={val}>{txt}</option>)}</select>
        : <input key={k} aria-label={label} placeholder={label} type={t === 'date' ? 'date' : 'text'} title={label} value={v[k] || ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} data-testid={`f-${k}`} />)}
      <button type="submit" className="btn btn-sm btn-primary" data-testid="f-apply">Lọc</button>
    </form>
  );
}

export const Table = ({ cols, rows, rowKey = (r) => r.id }) => (
  <div className="table-wrap">
    <table className="rights-table">
      <thead><tr>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={rowKey(r)} data-testid="row">{cols.map(([h, f]) => <td key={h} data-label={h}>{f(r)}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

export const Json = ({ v }) => <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(v, null, 2)}</pre>;

// Mật khẩu tạm ngẫu nhiên (đủ 12+ ký tự, có chữ hoa/thường/số/ký hiệu).
export function tempPassword() {
  const pick = (s, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => s[x % s.length]).join('');
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)}${pick('abcdefghijkmnpqrstuvwxyz', 6)}${pick('23456789', 4)}${pick('!@#$%', 2)}`;
}

export const Back = ({ onClick }) => <button type="button" className="link-btn" onClick={onClick} data-testid="back">← Quay lại danh sách</button>;
