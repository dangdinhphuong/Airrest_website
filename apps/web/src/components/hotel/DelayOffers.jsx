import React, { useMemo, useRef, useState } from 'react';
import { Notice } from '../Common';
import { EmptyState, ErrorState, Loading, PageHeader } from '../ui';
import { describeError } from '../../lib/api';
import { useApp } from '../../state/store';
import { useLiveData } from '../../lib/useRealtime';
import { fmtCountdown, remainingSeconds, useNow } from '../../lib/countdown';
import * as H from '../../data/hotel';
import { fmtDT } from './kit';
import { URGENT_SECONDS, checkExtReason, checkRoomNumbers, delayOfferErr, extensionErr, extensionsOf, fmtVN, label, pendingOffersOf } from './hotelDelay';

const err = (e) => delayOfferErr(e) || describeError(e);

// Âm báo nhẹ khi có yêu cầu mới. Trình duyệt chặn autoplay (AudioContext chưa được người dùng kích hoạt) thì bỏ qua, không báo lỗi.
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const c = new Ctx();
    if (c.state !== 'running') { c.close(); return; }
    const o = c.createOscillator(); const g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.05; o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.25); o.onended = () => c.close();
  } catch { /* bỏ qua */ }
}

function Offer({ o, left, onDone, onError }) {
  const [mode, setMode] = useState(null); // 'confirm' | 'reject'
  const [rooms, setRooms] = useState(Array(o.qty).fill(''));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const expired = left <= 0;
  const urgent = left < URGENT_SECONDS;
  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { await fn(); onDone(); } catch (e) { setMsg(err(e)); onError(e); } finally { setBusy(false); }
  };
  const confirm = () => {
    const r = checkRoomNumbers(rooms, o.qty);
    if (!r.ok) { setMsg(r.error); return; }
    run(() => H.confirmDelayOffer(o.id, r.list));
  };
  const reject = () => {
    const t = reason.trim();
    if (t.length < 1 || t.length > 300) { setMsg('Nhập lý do từ chối (1 đến 300 ký tự).'); return; }
    run(() => H.rejectDelayOffer(o.id, t));
  };
  return (
    <section className="card" style={{ opacity: expired ? 0.5 : 1, borderColor: urgent && !expired ? '#b91c1c' : undefined }} data-testid="delay-offer">
      <div className="card-head">
        <h3>{label(o.roomType)} × {o.qty}</h3>
        <b data-testid="offer-left" style={{ fontSize: 28, fontVariantNumeric: 'tabular-nums', color: urgent ? '#b91c1c' : '#166534' }}>{expired ? 'Hết hạn' : fmtCountdown(left)}</b>
      </div>
      <p style={{ margin: '4px 0' }}>Người đại diện: <b>{label(o.representative)}</b> · Khách: {Array.isArray(o.guests) ? o.guests.length : label(o.guests)}{Array.isArray(o.guests) && o.guests.length > 0 && <> ({label(o.guests)})</>}</p>
      <small>Hạn trả lời: {fmtDT(o.expiresAt)}{o.transferCount > 0 ? ` · đã chuyển từ khách sạn khác ${o.transferCount} lần` : ''}</small>
      {mode === null && (
        <div className="row-actions">
          <button type="button" className="btn btn-primary" disabled={expired} onClick={() => setMode('confirm')} data-testid="offer-confirm-open">Xác nhận</button>
          <button type="button" className="btn btn-danger" disabled={expired} onClick={() => setMode('reject')} data-testid="offer-reject-open">Không nhận</button>
        </div>
      )}
      {mode === 'confirm' && (
        <div className="card-inner">
          {o.qty > 1 && <small>Nhập {o.qty} số phòng. Các phòng phải sát nhau hoặc thông nhau.</small>}
          <div className="inline-form">
            {rooms.map((v, i) => <input key={i} aria-label={`Số phòng ${i + 1}`} placeholder={`Số phòng ${i + 1}`} value={v} onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? e.target.value : x)))} data-testid="offer-room" />)}
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || expired} onClick={confirm} data-testid="offer-confirm">{busy ? 'Đang gửi…' : 'Gửi xác nhận'}</button>
            <button type="button" className="link-btn" onClick={() => { setMode(null); setMsg(''); }}>Huỷ</button>
          </div>
        </div>
      )}
      {mode === 'reject' && (
        <div className="inline-form">
          <input aria-label="Lý do không nhận" placeholder="Lý do không nhận (bắt buộc)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="offer-reason" />
          <button type="button" className="btn btn-sm btn-danger" disabled={busy || expired} onClick={reject} data-testid="offer-reject">{busy ? 'Đang gửi…' : 'Gửi từ chối'}</button>
          <button type="button" className="link-btn" onClick={() => { setMode(null); setMsg(''); }}>Huỷ</button>
        </div>
      )}
      {msg && <small className="field-error block" role="alert" data-testid="offer-error">{msg}</small>}
    </section>
  );
}

const RESULT = { ACCEPTED: 'Đã đồng ý gia hạn.', REJECTED: 'Đã từ chối gia hạn.', NO_ROOM: 'Hết phòng trong khung gia hạn, không gia hạn được.', DONE: 'Yêu cầu đã được xử lý ở nơi khác.' };
// Kết quả hiện ở thông báo chung; thẻ tự biến mất khi làm mới thấy extensionStatus đã đổi.

// Yêu cầu gia hạn: quầy đề xuất giờ rời mới cho nhóm khách đã được xác nhận phòng.
function Extension({ x, onResult }) {
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (fn, ok) => {
    setBusy(true); setMsg('');
    try { await fn(); onResult(x.offerId, ok); } catch (e) {
      if (e?.code === 'EXTENSION_NO_ROOM') onResult(x.offerId, 'NO_ROOM');
      else if (e?.code === 'INVALID_STATE' || e?.status === 404) onResult(x.offerId, 'DONE');
      else setMsg(extensionErr(e) || describeError(e));
    } finally { setBusy(false); }
  };
  const doReject = () => {
    const r = checkExtReason(reason);
    if (!r.ok) { setMsg(r.error); return; }
    run(() => H.rejectExtension(x.offerId, r.reason), 'REJECTED');
  };
  return (
    <section className="card" style={{ borderColor: '#b45309' }} data-testid="delay-extension">
      <div className="card-head"><h3>Yêu cầu gia hạn</h3></div>
      <p style={{ margin: '4px 0' }}>Giờ rời mới đề xuất: <b data-testid="ext-leave">{fmtVN(x.proposedLeaveAt)}</b> (giờ Việt Nam)</p>
      <small>Nhóm {x.groupId ? String(x.groupId).slice(0, 8) : '—'} · nhận lúc {fmtVN(x.at)}</small>
      {!reject ? (
        <div className="row-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => H.acceptExtension(x.offerId), 'ACCEPTED')} data-testid="ext-accept">{busy ? 'Đang gửi…' : 'Đồng ý gia hạn'}</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setReject(true)} data-testid="ext-reject-open">Không gia hạn</button>
        </div>
      ) : (
        <div className="inline-form">
          <input aria-label="Lý do không gia hạn" placeholder="Lý do (không bắt buộc)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="ext-reason" />
          <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={doReject} data-testid="ext-reject">{busy ? 'Đang gửi…' : 'Gửi từ chối'}</button>
          <button type="button" className="link-btn" onClick={() => { setReject(false); setMsg(''); }}>Huỷ</button>
        </div>
      )}
      {msg && <small className="field-error block" role="alert" data-testid="ext-error">{msg}</small>}
    </section>
  );
}

export default function DelayOffers() {
  const { state } = useApp();
  const [flash, setFlash] = useState('');
  const seen = useRef(new Set());
  const live = useLiveData(() => H.listDelayOffers('PENDING'), [], state.session?.id, {
    pollMs: 5000,
    refreshOn: (n) => n === 'delay:offer' || n === 'delay:offer:closed' || n === 'delay:extension',
    onEvent: (n, p) => {
      if (n === 'delay:extension' && p?.offerId) beep();
      if (n === 'delay:offer' && p?.offerId && !seen.current.has(p.offerId)) { seen.current.add(p.offerId); beep(); }
    },
  });
  const now = useNow();
  const at = useMemo(() => Date.now(), [live.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = pendingOffersOf(live.data?.items);
  const exts = extensionsOf(live.data?.items);
  return (
    <>
      <PageHeader title="Yêu cầu khách delay" description="Khách bị hoãn chuyến cần chỗ nghỉ. Hãy trả lời trong 5 phút, quá hạn hệ thống chuyển cho khách sạn khác." />
      {flash && <Notice tone="ok" onClose={() => setFlash('')}>{flash}</Notice>}
      {exts.map((x) => <Extension key={x.offerId} x={x} onResult={(id, r) => { setFlash(RESULT[r]); live.refresh(); }} />)}
      {live.err && !live.data ? <ErrorState onRetry={live.reload}>{describeError(live.err)}</ErrorState>
        : live.loading && !live.data ? <Loading />
        : !items.length ? <EmptyState title="Chưa có yêu cầu">Hiện không có yêu cầu giữ phòng nào đang chờ. Trang tự cập nhật.</EmptyState>
        : items.map((o) => <Offer key={o.id} o={o} left={remainingSeconds(o.secondsLeft, at, now)} onDone={() => { setFlash('Đã gửi phản hồi.'); live.refresh(); }} onError={() => live.refresh()} />)}
    </>
  );
}
