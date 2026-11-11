import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, BellRing, CheckCircle2 } from 'lucide-react';
import { useApp } from '../state/store';
import { createBooking } from '../mock/service';
import { isOpen } from '../lib/domain';
import { fmtDateTime, money } from '../lib/time';
import { ErrorBox, Field, Loading, Notice, ScreenTitle, SimBadge } from '../components/Common';
import { priceNote } from '../components/PropertyCard';
import BookingLive from '../components/BookingLive';

const STEP_LABELS = ['Chọn phòng', 'Tên gọi và cách trả', 'Xác nhận'];
const METHODS = (p) => [
  ...(p.payAtProperty ? [{ id: 'at-property', label: 'Trả tại nơi nghỉ', note: 'Thanh toán khi nhận phòng; hệ thống không trừ tiền (mô phỏng).' }] : []),
  { id: 'qr', label: 'Quét mã QR (mô phỏng)', note: 'Không có giao dịch thật; không trừ tiền.' },
  ...(!p.payAtProperty ? [{ id: 'card', label: 'Thẻ (mô phỏng)', note: 'Không nhập thông tin thẻ; không trừ tiền.' }] : []),
];
const LOOKS_LIKE_CONTACT = /@|\d{6,}/;

// M5 — Đặt chỗ mô phỏng, không tài khoản (MB-07: FR-012, FR-013). ≤3 bước; không SĐT/email.
export default function Booking() {
  const { state, dispatch, getProperty } = useApp();
  const { propertyId, simNow, booking } = state;
  const p = propertyId ? getProperty(propertyId, simNow) : null;
  const [step, setStep] = useState(1);
  const [err, setErr] = useState({});
  const [phase, setPhase] = useState({ s: 'idle' });
  if (!p) return null;
  const methods = METHODS(p);
  const method = methods.find((m) => m.id === booking.method);

  if (booking.result) {
    const arrive = simNow + p.travelMin;
    return (
      <>
        <ScreenTitle kicker="Đã xác nhận · Mô phỏng" title="Bạn đã có chỗ nghỉ (mô phỏng)" />
        <section className="card success" data-testid="booking-success">
          <CheckCircle2 size={36} aria-hidden="true" />
          <p>Mã đặt chỗ <strong data-testid="booking-code">{booking.result.code}</strong> <SimBadge>Mô phỏng</SimBadge></p>
          <dl className="spec">
            <div><dt>Nơi nghỉ</dt><dd>{p.name} — {p.area}</dd></div>
            <div><dt>Tên gọi nhận phòng</dt><dd>{booking.result.name}</dd></div>
            <div><dt>Nhận phòng dự kiến</dt><dd>{fmtDateTime(arrive)}</dd></div>
            <div><dt>Giá tổng</dt><dd>{money(p.price)} <span className="muted">({priceNote()})</span></dd></div>
            <div><dt>Cách trả</dt><dd>{method?.label} — {method?.note}</dd></div>
          </dl>
          <p className="muted">Đây là đặt chỗ mô phỏng: không gửi tới cơ sở thật và không có giao dịch thật.</p>
          <BookingLive booking={booking.result} property={p} simNow={simNow} />
          <button type="button" className="btn btn-primary btn-block" onClick={() => dispatch({ type: 'go', screen: 'reminder' })}><BellRing size={18} aria-hidden="true" /> Nhắc giờ quay lại sân bay <ArrowRight size={16} aria-hidden="true" /></button>
        </section>
      </>
    );
  }

  const next = () => {
    const er = {};
    if (step === 2) {
      const n = booking.name.trim();
      if (!n) er.name = 'Nhập tên gọi để nhận phòng (có thể là tên gọi thân mật).';
      else if (n.length > 50) er.name = 'Tên gọi tối đa 50 ký tự.';
      else if (LOOKS_LIKE_CONTACT.test(n)) er.name = 'Vui lòng không nhập số điện thoại hoặc email. Chỉ cần một tên gọi.';
      if (!booking.method) er.method = 'Chọn một cách trả.';
    }
    setErr(er);
    if (Object.keys(er).length === 0) setStep(step + 1);
  };

  const confirm = async () => {
    setPhase({ s: 'loading' });
    try {
      const r = await createBooking({ propertyId: p.id, name: booking.name.trim(), method: booking.method, now: simNow });
      dispatch({ type: 'bookingDone', result: r });
    } catch (e) {
      if (e.kind === 'roomGone') { dispatch({ type: 'roomGone' }); return; }
      if (e.kind === 'closed') { setPhase({ s: 'closed' }); return; }
      setPhase({ s: 'error' });
    }
  };

  return (
    <>
      <button type="button" className="link-btn back" onClick={() => (step > 1 ? setStep(step - 1) : dispatch({ type: 'go', screen: 'detail' }))}><ArrowLeft size={16} aria-hidden="true" /> {step > 1 ? 'Bước trước' : 'Về chi tiết'}</button>
      <ScreenTitle kicker={`Đặt chỗ mô phỏng · Bước ${step}/3`} title={STEP_LABELS[step - 1]} />
      <ol className="steps" aria-label="Các bước đặt chỗ">{STEP_LABELS.map((l, i) => <li key={l} className={i + 1 === step ? 'cur' : i + 1 < step ? 'done' : ''} aria-current={i + 1 === step ? 'step' : undefined}>{i + 1}. {l}</li>)}</ol>
      <section className="card" aria-busy={phase.s === 'loading'}>
        {step === 1 && (
          <>
            <h2>{p.name}</h2>
            <dl className="spec">
              <div><dt>Phòng</dt><dd>{p.room}</dd></div>
              <div><dt>Giá tổng</dt><dd data-testid="booking-price"><strong>{money(p.price)}</strong> <span className="muted">({priceNote()})</span></dd></div>
              <div><dt>Chính sách huỷ</dt><dd>{p.freeCancel ? 'Huỷ miễn phí' : 'Không hoàn huỷ'}</dd></div>
            </dl>
          </>
        )}
        {step === 2 && (
          <>
            <Field id="b-name" label="Tên gọi để nhận phòng" hint="Chỉ cần một tên gọi, tối đa 50 ký tự. Không nhập số điện thoại hay email." error={err.name}>
              <input id="b-name" value={booking.name} maxLength={60} autoComplete="off" onChange={(e) => dispatch({ type: 'bookingField', field: 'name', value: e.target.value })} aria-invalid={!!err.name} aria-describedby={err.name ? 'b-name-err' : 'b-name-hint'} />
            </Field>
            <fieldset className="radios">
              <legend>Cách trả (mô phỏng)</legend>
              {methods.map((m) => (
                <label key={m.id} className={`radio ${booking.method === m.id ? 'on' : ''}`}>
                  <input type="radio" name="method" value={m.id} checked={booking.method === m.id} onChange={() => dispatch({ type: 'bookingField', field: 'method', value: m.id })} />
                  <span><strong>{m.label}</strong><small>{m.note}</small></span>
                </label>
              ))}
              {err.method && <small className="field-error" role="alert">{err.method}</small>}
            </fieldset>
          </>
        )}
        {step === 3 && (
          <>
            <dl className="spec">
              <div><dt>Nơi nghỉ</dt><dd>{p.name}</dd></div>
              <div><dt>Tên gọi</dt><dd>{booking.name.trim()}</dd></div>
              <div><dt>Giá tổng</dt><dd>{money(p.price)}</dd></div>
              <div><dt>Cách trả</dt><dd>{method?.label}</dd></div>
            </dl>
            <Notice tone="info">Bấm xác nhận để tạo đặt chỗ <strong>mô phỏng</strong>. Không có giao dịch thật và không gửi dữ liệu ra ngoài.</Notice>
          </>
        )}
        {phase.s === 'loading' && <Loading label="Đang xác nhận (mô phỏng)…" />}
        {phase.s === 'error' && <ErrorBox title="Chưa xác nhận được" onRetry={confirm}>Dịch vụ mô phỏng tạm thời lỗi. Thông tin bạn nhập vẫn được giữ.</ErrorBox>}
        {phase.s === 'closed' && <Notice tone="error" title="Nơi nghỉ không còn nhận khách">Hãy quay lại danh sách để chọn nơi khác.</Notice>}
        <div className="row-actions">
          {step < 3 && <button type="button" className="btn btn-primary" onClick={next}>Tiếp tục <ArrowRight size={16} aria-hidden="true" /></button>}
          {step === 3 && <button type="button" className="btn btn-primary" disabled={phase.s === 'loading' || !isOpen(p, simNow)} onClick={confirm}>Xác nhận đặt chỗ mô phỏng</button>}
          {phase.s === 'closed' && <button type="button" className="btn" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Về danh sách</button>}
        </div>
      </section>
    </>
  );
}
