import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, BellRing, CalendarDays, Check, CheckCircle2, Clock3, Hotel, Mail, Phone, Plane, Search, ShieldCheck, UserRound } from 'lucide-react';
import { useApp } from '../state/store';
import { createBooking } from '../mock/service';
import { isOpen } from '../lib/domain';
import { fmtDateTime, money } from '../lib/time';
import { ErrorBox, Loading, Notice, SimBadge } from '../components/Common';
import { priceNote } from '../components/PropertyCard';
import BookingLive from '../components/BookingLive';

const IMAGES = ['/images/hotel-1.jpg', '/images/hotel-2.jpg', '/images/hotel-3.jpg'];

const METHODS = (p) => [
  ...(p.payAtProperty ? [{ id: 'at-property', label: 'Trả tại nơi nghỉ', note: 'Thanh toán khi nhận phòng; hệ thống không trừ tiền (mô phỏng).' }] : []),
  { id: 'qr', label: 'Quét mã QR (mô phỏng)', note: 'Không có giao dịch thật; không trừ tiền.' },
  ...(!p.payAtProperty ? [{ id: 'card', label: 'Thẻ (mô phỏng)', note: 'Không nhập thông tin thẻ; không trừ tiền.' }] : []),
];

export default function Booking() {
  const { state, dispatch, getProperty } = useApp();
  const { propertyId, simNow, booking, flight } = state;
  const p = propertyId ? getProperty(propertyId, simNow) : null;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    passengerName: booking.name || state.user?.name || '',
    phone: booking.phone || '0912345678',
    email: booking.email || 'hanhkhach@example.com',
    checkIn: today,
    checkOut: tomorrow,
    guestCount: '1',
    flightNumber: flight?.code || 'VN218',
    specialRequests: '',
    method: booking.method || (p?.payAtProperty ? 'at-property' : 'qr'),
  });
  const [err, setErr] = useState({});
  const [phase, setPhase] = useState({ s: 'idle' });

  if (!p) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <h2>Chưa chọn nơi nghỉ</h2>
        <p style={{ color: '#64748b' }}>Vui lòng quay lại danh sách nơi nghỉ để chọn phòng.</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>
          Xem nơi nghỉ
        </button>
      </div>
    );
  }

  const methods = METHODS(p);
  const method = methods.find((m) => m.id === formData.method) || methods[0];
  const imgIdx = Math.abs(p.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % IMAGES.length;
  const imageSrc = p.image || IMAGES[imgIdx];

  const updateField = (k, v) => {
    setFormData((prev) => ({ ...prev, [k]: v }));
    setErr((prev) => ({ ...prev, [k]: '' }));
    if (k === 'passengerName') {
      dispatch({ type: 'bookingField', field: 'name', value: v });
    }
  };

  const handleStep1Submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!formData.passengerName.trim()) er.passengerName = 'Vui lòng nhập họ và tên.';
    if (!formData.phone.trim()) er.phone = 'Vui lòng nhập số điện thoại liên hệ.';
    if (!formData.email.trim()) er.email = 'Vui lòng nhập email.';
    if (!formData.checkIn) er.checkIn = 'Vui lòng chọn ngày nhận phòng.';
    if (!formData.checkOut) er.checkOut = 'Vui lòng chọn ngày trả phòng.';
    setErr(er);
    if (Object.keys(er).length === 0) {
      setStep(2);
    }
  };

  const confirm = async () => {
    setPhase({ s: 'loading' });
    try {
      const r = await createBooking({
        propertyId: p.id,
        name: formData.passengerName.trim(),
        method: formData.method,
        now: simNow,
      });
      // Định dạng mã booking chuẩn AIRREST: AR-[Sân bay]-[Ngày]-[Mã số]
      const formattedCode = `AR-${p.airport || 'HAN'}-${today.replace(/-/g, '')}-${r.code.replace('DC-', '')}`;
      const resultWithMeta = {
        ...r,
        code: formattedCode,
        rawCode: r.code,
        passengerName: formData.passengerName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        checkIn: formData.checkIn,
        checkOut: formData.checkOut,
        flightNumber: formData.flightNumber,
        status: 'PENDING',
        totalAmount: p.price,
      };
      dispatch({ type: 'bookingDone', result: resultWithMeta });
      setStep(3);
      setPhase({ s: 'ok' });
    } catch (e) {
      if (e.kind === 'roomGone') {
        dispatch({ type: 'roomGone' });
        return;
      }
      if (e.kind === 'closed') {
        setPhase({ s: 'closed' });
        return;
      }
      setPhase({ s: 'error' });
    }
  };

  return (
    <div className="airrest-booking-page" style={{ maxWidth: '680px', margin: '0 auto', paddingBottom: '40px' }}>
      <button
        type="button"
        className="link-btn back"
        onClick={() => (step > 1 && !booking.result ? setStep(step - 1) : dispatch({ type: 'go', screen: 'detail' }))}
        style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#1262e8' }}
      >
        <ArrowLeft size={16} /> {step > 1 && !booking.result ? 'Quay lại bước trước' : 'Về chi tiết nơi nghỉ'}
      </button>

      <div className="airrest-card">
        {step === 1 && (
          <form onSubmit={handleStep1Submit} noValidate>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="section-kicker">Bước 1 / 3</span>
              <SimBadge>Mô phỏng</SimBadge>
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#062253', margin: '0 0 18px' }}>Thông tin đặt phòng</h1>

            {/* Khối tóm tắt nơi nghỉ đã chọn */}
            <div className="booking-summary-strip">
              <img src={imageSrc} alt={p.name} />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '15.5px', color: '#062253', display: 'block' }}>{p.name}</strong>
                <p style={{ fontSize: '12.5px', color: '#64748b', margin: '3px 0' }}>{p.room} · {p.area}</p>
                <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#1262e8' }}>{money(p.price)} / đêm</span>
              </div>
            </div>

            {/* Các trường thông tin hành khách */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginTop: '16px' }}>
              <div className="hero-input-field">
                <label htmlFor="b-passenger">Họ và tên *</label>
                <div className="hero-input-box">
                  <UserRound size={17} style={{ color: '#94a3b8' }} />
                  <input
                    id="b-passenger"
                    value={formData.passengerName}
                    onChange={(e) => updateField('passengerName', e.target.value)}
                    placeholder="Nguyễn Minh Anh"
                    required
                  />
                </div>
                {err.passengerName && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{err.passengerName}</small>}
              </div>

              <div className="hero-input-field">
                <label htmlFor="b-phone">Số điện thoại *</label>
                <div className="hero-input-box">
                  <Phone size={17} style={{ color: '#94a3b8' }} />
                  <input
                    id="b-phone"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="0912345678"
                    required
                  />
                </div>
                {err.phone && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{err.phone}</small>}
              </div>

              <div className="hero-input-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="b-email">Email nhận xác nhận *</label>
                <div className="hero-input-box">
                  <Mail size={17} style={{ color: '#94a3b8' }} />
                  <input
                    id="b-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="ban@example.com"
                    required
                  />
                </div>
                {err.email && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{err.email}</small>}
              </div>

              <div className="hero-input-field">
                <label htmlFor="b-checkin">Nhận phòng *</label>
                <div className="hero-input-box">
                  <CalendarDays size={17} style={{ color: '#94a3b8' }} />
                  <input
                    id="b-checkin"
                    type="date"
                    min={today}
                    value={formData.checkIn}
                    onChange={(e) => updateField('checkIn', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="hero-input-field">
                <label htmlFor="b-checkout">Trả phòng *</label>
                <div className="hero-input-box">
                  <CalendarDays size={17} style={{ color: '#94a3b8' }} />
                  <input
                    id="b-checkout"
                    type="date"
                    min={formData.checkIn || today}
                    value={formData.checkOut}
                    onChange={(e) => updateField('checkOut', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="hero-input-field">
                <label htmlFor="b-guests">Số khách</label>
                <div className="hero-input-box">
                  <select
                    id="b-guests"
                    value={formData.guestCount}
                    onChange={(e) => updateField('guestCount', e.target.value)}
                  >
                    <option value="1">1 khách</option>
                    <option value="2">2 khách</option>
                    <option value="3">3 khách</option>
                    <option value="4">4 khách</option>
                  </select>
                </div>
              </div>

              <div className="hero-input-field">
                <label htmlFor="b-flight">Chuyến bay liên quan</label>
                <div className="hero-input-box">
                  <Plane size={17} style={{ color: '#94a3b8' }} />
                  <input
                    id="b-flight"
                    value={formData.flightNumber}
                    onChange={(e) => updateField('flightNumber', e.target.value.toUpperCase())}
                    placeholder="VN218 (nếu có)"
                  />
                </div>
              </div>

              <div className="hero-input-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="b-requests">Yêu cầu đặc biệt (không bắt buộc)</label>
                <textarea
                  id="b-requests"
                  rows={2}
                  value={formData.specialRequests}
                  onChange={(e) => updateField('specialRequests', e.target.value)}
                  placeholder="Ví dụ: nhận phòng muộn, tầng cao, cần yên tĩnh…"
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              <div className="hero-input-field" style={{ gridColumn: '1 / -1' }}>
                <label>Hình thức thanh toán (mô phỏng)</label>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {methods.map((m) => (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: formData.method === m.id ? '2px solid #1262e8' : '1px solid #e2e8f0',
                        background: formData.method === m.id ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="method"
                        value={m.id}
                        checked={formData.method === m.id}
                        onChange={() => updateField('method', m.id)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong style={{ fontSize: '13.5px', color: '#10203a', display: 'block' }}>{m.label}</strong>
                        <small style={{ fontSize: '12px', color: '#64748b' }}>{m.note}</small>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#64748b', margin: '16px 0 20px' }}>
              <ShieldCheck size={14} style={{ color: '#1262e8' }} />
              Thông tin liên hệ chỉ dùng để xử lý và xác minh booking. Không cần tạo tài khoản.
            </p>

            <button type="submit" className="hero-submit-btn">
              Tiếp tục xem lại <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
            </button>
          </form>
        )}

        {step === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="section-kicker">Bước 2 / 3</span>
              <SimBadge>Mô phỏng</SimBadge>
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#062253', margin: '0 0 18px' }}>Xác nhận yêu cầu đặt phòng</h1>

            <div className="booking-summary-table">
              <div className="booking-summary-row">
                <span>Khách sạn</span>
                <strong>{p.name}</strong>
              </div>
              <div className="booking-summary-row">
                <span>Loại phòng</span>
                <strong>{p.room}</strong>
              </div>
              <div className="booking-summary-row">
                <span>Hành khách</span>
                <strong>{formData.passengerName}</strong>
              </div>
              <div className="booking-summary-row">
                <span>Liên hệ</span>
                <strong>{formData.phone} · {formData.email}</strong>
              </div>
              <div className="booking-summary-row">
                <span>Thời gian</span>
                <strong>{formData.checkIn} → {formData.checkOut} ({formData.guestCount} khách)</strong>
              </div>
              {formData.flightNumber && (
                <div className="booking-summary-row">
                  <span>Chuyến bay</span>
                  <strong>{formData.flightNumber}</strong>
                </div>
              )}
              <div className="booking-summary-row">
                <span>Giá ước tính / đêm</span>
                <strong data-testid="booking-price" style={{ color: '#1262e8' }}>{money(p.price)}</strong>
              </div>
              <div className="booking-summary-row">
                <span>Hình thức thanh toán</span>
                <strong>{method?.label}</strong>
              </div>
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '14px', padding: '14px 16px', margin: '18px 0', fontSize: '13px', color: '#92400e', lineHeight: '1.6' }}>
              <strong>Đây là yêu cầu đặt phòng.</strong> Booking ban đầu ở trạng thái chờ xác nhận, chưa phải đặt phòng đã được khách sạn xác nhận. Quản trị viên và khách sạn sẽ đối chiếu tình trạng phòng thực tế.
            </div>

            {phase.s === 'loading' && <Loading label="Đang kiểm tra phòng và khởi tạo booking mô phỏng…" />}
            {phase.s === 'error' && (
              <ErrorBox title="Chưa xác nhận được" onRetry={confirm}>
                Dịch vụ mô phỏng tạm thời lỗi. Thông tin bạn nhập vẫn được giữ. Vui lòng thử lại.
              </ErrorBox>
            )}
            {phase.s === 'closed' && (
              <Notice tone="error" title="Nơi nghỉ không còn nhận khách">
                Cơ sở đã đóng nhận khách hoặc vừa hết phòng. Hãy quay lại danh sách để chọn nơi khác.
              </Notice>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setStep(1)}
                style={{ flex: 1, minHeight: '48px', borderRadius: '12px', fontWeight: '700' }}
              >
                Chỉnh sửa
              </button>
              <button
                type="button"
                className="hero-submit-btn"
                disabled={phase.s === 'loading' || !isOpen(p, simNow)}
                onClick={confirm}
                style={{ flex: 1.6, margin: 0 }}
              >
                {phase.s === 'loading' ? 'Đang kiểm tra…' : 'Xác nhận booking request'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && booking.result && (
          <div style={{ textAlign: 'center', padding: '12px 0' }} data-testid="booking-success">
            <span style={{ display: 'grid', placeItems: 'center', width: '64px', height: '64px', borderRadius: '50%', background: '#ecfdf5', color: '#047857', margin: '0 auto 16px' }}>
              <Check size={32} />
            </span>
            <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#047857' }}>
              Đã gửi thành công
            </span>
            <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#062253', margin: '6px 0 10px' }}>
              Yêu cầu đang chờ xác nhận
            </h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', maxWidth: '460px', margin: '0 auto 24px', lineHeight: '1.6' }}>
              Lưu mã booking bên dưới và dùng đúng số điện thoại đã nhập để theo dõi trạng thái xác nhận.
            </p>

            {/* Khối mã booking nổi bật */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '20px', padding: '24px 20px', margin: '0 0 24px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600' }}>
                Mã booking xác minh
              </span>
              <p data-testid="booking-code" style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '0.06em', color: '#1262e8', margin: '6px 0 10px' }}>
                {booking.result.code}
              </p>
              <span className="airrest-badge-pill airrest-badge-amber">
                Đang chờ xác nhận
              </span>
            </div>

            <dl className="spec" style={{ textAlign: 'left', marginBottom: '20px' }}>
              <div><dt>Nơi nghỉ</dt><dd>{p.name} — {p.area}</dd></div>
              <div><dt>Hành khách</dt><dd>{booking.result.name || formData.passengerName}</dd></div>
              <div><dt>Nhận phòng dự kiến</dt><dd>{fmtDateTime(simNow + p.travelMin)}</dd></div>
              <div><dt>Tổng tiền</dt><dd><strong>{money(p.price)}</strong> <span className="muted">({priceNote()})</span></dd></div>
              <div><dt>Thanh toán</dt><dd>{method?.label}</dd></div>
            </dl>

            <BookingLive booking={booking.result} property={p} simNow={simNow} />

            <div style={{ display: 'grid', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="hero-submit-btn"
                onClick={() => dispatch({ type: 'go', screen: 'request' })}
                style={{ margin: 0 }}
              >
                <Search size={17} /> Theo dõi trạng thái booking <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
              </button>

              <button
                type="button"
                className="btn btn-block"
                onClick={() => dispatch({ type: 'go', screen: 'reminder' })}
                style={{ minHeight: '48px', borderRadius: '12px', fontWeight: '700', border: '1px solid #cbd5e1' }}
              >
                <BellRing size={16} /> Nhắc giờ quay lại sân bay
              </button>

              <button
                type="button"
                className="link-btn"
                onClick={() => dispatch({ type: 'go', screen: 'stays' })}
                style={{ fontSize: '13px', marginTop: '4px' }}
              >
                Xem thêm các nơi nghỉ khác
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
