import React, { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../../lib/api';
import { ErrorBox, Loading, Notice } from '../Common';
import { Pill } from '../partner/ui';

export const fmtD = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '');
export const fmtDT = (v) => (v ? new Date(v).toLocaleString('vi-VN', { hour12: false }) : '');
export const today = (plus = 0) => { const d = new Date(Date.now() + plus * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Nhãn tiếng Việt + tông màu cho các trạng thái backend trả về.
export const STATUS = {
  PENDING_PAYMENT: ['Chờ thanh toán', 'warn'], PENDING: ['Chờ xác nhận', 'warn'], CONFIRMED: ['Đã xác nhận', 'ok'], CHECKED_IN: ['Đang ở', 'info'],
  CHECKED_OUT: ['Đã trả phòng', 'neutral'], CANCELLED: ['Đã hủy', 'neutral'], REJECTED: ['Đã từ chối', 'error'], EXPIRED: ['Hết hạn', 'neutral'], NO_SHOW: ['Không đến', 'error'],
  APPROVED: ['Đã duyệt', 'ok'], REQUESTED: ['Chờ phân xe', 'warn'], ASSIGNED: ['Đã phân xe', 'info'], DONE: ['Hoàn tất', 'ok'],
};
export const StatusPill = ({ s }) => { const [t, tone] = STATUS[s] || [s, 'neutral']; return <Pill tone={tone}>{t}</Pill>; };

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
export function useAction() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); return true; } catch (e) { setMsg({ tone: 'error', text: describeError(e) }); return false; } finally { setBusy(false); }
  };
  const note = msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}><span data-testid={`msg-${msg.tone}`}>{msg.text}</span></Notice>;
  return { run, busy, note };
}

// Khung hiển thị: loading / lỗi có nút thử lại / rỗng / nội dung + "Tải thêm".
export function ListState({ list, empty, children }) {
  if (list.loading) return <Loading />;
  if (list.err) return <ErrorBox onRetry={list.reload}>{describeError(list.err)}</ErrorBox>;
  if (!list.items.length) return <p className="muted" data-testid="empty">{empty}</p>;
  return (
    <>
      {children}
      {list.next != null && <p><button type="button" className="btn btn-sm" onClick={list.loadMore} disabled={list.more} data-testid="load-more">{list.more ? 'Đang tải…' : 'Tải thêm'}</button></p>}
    </>
  );
}

// Nút hai bước: bấm -> hỏi lại -> thực hiện (hành động nguy hiểm không cần lý do).
export function ConfirmButton({ label, ask, onConfirm, disabled, tone, testid }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={`btn btn-sm ${tone === 'danger' ? 'btn-danger' : ''}`} disabled={disabled} onClick={() => setOpen(true)} data-testid={testid}>{label}</button>;
  return (
    <span className="inline-form">
      <small>{ask}</small>
      <button type="button" className="btn btn-sm btn-primary" disabled={disabled} onClick={() => { setOpen(false); onConfirm(); }} data-testid={testid && `${testid}-yes`}>Đồng ý</button>
      <button type="button" className="link-btn" onClick={() => setOpen(false)}>Huỷ</button>
    </span>
  );
}

// ReasonAction yêu cầu onSubmit đồng bộ: kiểm tối thiểu 3 ký tự rồi chạy hành động ngầm (lỗi máy chủ hiện ở thông báo trang).
export const needReason = (fn, min = 3) => (r) => {
  const t = (r || '').trim();
  if (t.length < min) return { ok: false, error: `Nhập tối thiểu ${min} ký tự.` };
  fn(t);
};
