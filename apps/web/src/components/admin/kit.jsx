import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, listAirports } from '../../data/admin';
import { describeError } from '../../lib/api';
import { vnDayEnd, vnDayStart } from '../../lib/time';
import { Notice } from '../Common';
import Select from '../Select';
import { settleErr } from './adminSettle';
import { ConfirmDialog, ErrorState, FilterBar, Loading } from '../ui';

export const dt = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
export const d = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
export const isoOrUndef = (v) => (v ? new Date(v).toISOString() : undefined);
// Lọc theo ngày: "từ" = 00:00 ngày chọn, "đến" gồm cả ngày chọn (00:00 ngày kế tiếp), cả hai theo giờ Việt Nam.
export const endOfDayIso = (v) => vnDayEnd(v)?.toISOString();
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Danh mục sân bay (GET /api/v1/airports, công khai) tải một lần cho cả phiên.
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
    <Select id={id} value={value} onChange={onChange} required={required} {...rest}>
      {(allowEmpty || !airports.length) && <option value="">{airports.length ? '— Chọn sân bay —' : 'Đang tải danh sách…'}</option>}
      {airports.map((a) => <option key={a.iata} value={a.iata}>{airportLabel(a)}</option>)}
    </Select>
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
  if (ERR_VI[e?.code] || settleErr(e)) return ERR_VI[e.code] || settleErr(e);
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

// Thuộc tính cho ui/DataTable từ kết quả usePaged: <DataTable columns={cols([...])} empty="…" {...pagedProps(p)} />
export const pagedProps = (p) => ({ rows: p.items, loading: p.loading, error: p.err, onRetry: p.reload, hasMore: p.next != null, onLoadMore: p.more, loadingMore: p.loading });
// Cột cho DataTable từ cặp [tiêu đề, (row) => node]; tiêu đề rỗng = cột thao tác.
export const cols = (pairs) => pairs.map(([header, render], i) => ({ key: `c${i}`, header: header || 'Thao tác', render }));

// head: tiêu đề hiện khi đang tải/lỗi (lúc có dữ liệu, children tự vẽ PageHeader).
export function LoadView({ r, head, children }) {
  if (r.err && !r.data) return <>{head}<ErrorState onRetry={r.reload}>{r.err}</ErrorState></>;
  if (!r.data) return <>{head}<Loading /></>;
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

// Nút mở hộp xác nhận (ConfirmDialog); reason=true thì bắt nhập lý do (>= 3 ký tự). onDo(reason) trả Promise<{ok}> (từ useRun.run); ok:false giữ hộp mở.
// testid: nút mở = `testid`; trong hộp `testid-confirm` / `-cancel` / `-reason`.
export function Act({ label, onDo, reason = false, danger = false, confirm = 'Bạn chắc chắn thực hiện?', testid, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn btn-sm ${danger ? 'btn-danger' : ''}`} disabled={disabled} onClick={() => setOpen(true)} data-testid={testid}>{label}</button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} title={label} description={confirm} confirmLabel={label} variant={danger ? 'danger' : 'info'} testid={testid}
        reason={reason ? { label: 'Lý do', minLength: 3, placeholder: 'Lý do (bắt buộc)' } : undefined}
        onConfirm={async (why) => { const r = await onDo(why); if (r?.ok === false) throw new Error('failed'); }} />
    </>
  );
}

// Thanh lọc trên ui/FilterBar: fields = [[key, label, type?, options?]]; áp dụng khi bấm "Lọc"/Enter, "Đặt lại" xóa hết.
export function Filters({ fields, onApply, testid = 'filters' }) {
  const [v, setV] = useState({});
  const apply = () => { const o = {}; for (const [k, , t] of fields) if (v[k]) o[k] = t === 'date' ? (k === 'to' ? endOfDayIso(v[k]) : vnDayStart(v[k]).toISOString()) : v[k].trim(); onApply(o); };
  return (
    <FilterBar onApply={apply} onReset={() => { setV({}); onApply({}); }} testid={testid}>
      {fields.map(([k, label, t, opts]) => (
        <label key={k} className="ui-filterfield">
          <span className="ui-filterlabel">{label}</span>
          {opts
            ? <Select aria-label={label} value={v[k] || ''} onChange={(e) => setV({ ...v, [k]: e.target.value })}><option value="">Tất cả</option>{opts.map(([val, txt]) => <option key={val} value={val}>{txt}</option>)}</Select>
            : <input aria-label={label} placeholder={label} type={t === 'date' ? 'date' : 'text'} title={label} value={v[k] || ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} data-testid={`f-${k}`} />}
        </label>
      ))}
    </FilterBar>
  );
}

export const Json = ({ v }) => <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(v, null, 2)}</pre>;

// Mật khẩu tạm ngẫu nhiên (đủ 12+ ký tự, có chữ hoa/thường/số/ký hiệu).
export function tempPassword() {
  const pick = (s, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => s[x % s.length]).join('');
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)}${pick('abcdefghijkmnpqrstuvwxyz', 6)}${pick('23456789', 4)}${pick('!@#$%', 2)}`;
}
