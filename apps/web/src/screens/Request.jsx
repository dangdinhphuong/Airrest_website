import React, { useState } from 'react';
import { ArrowLeft, BellRing, CalendarDays, CheckCircle2, Clock3, Hotel, Search, Send, ShieldCheck, Shuffle } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM } from '../config/simulation';
import { RIGHTS } from '../config/rights';
import { deriveRequest, REQ_STATUS } from '../lib/request';
import { delayMinutes, leaveTime, receptionLabel } from '../lib/domain';
import { fmtDateTime, fmtDuration, fmtTime, money } from '../lib/time';
import { Notice, SimBadge } from '../components/Common';
import { usePartner } from '../mock/partner';

const STATUS_LABELS = {
  PENDING: 'Đang chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đã nhận phòng',
  COMPLETED: 'Đã hoàn thành',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};

const TIMELINE = [
  ['waiting', 'Đang chờ hãng duyệt'],
  ['approved_waiting_property', 'Hãng duyệt — chờ cơ sở'],
  ['confirmed', 'Đã xác nhận phòng'],
];

export default function Request() {
  const { state, dispatch, getProperty } = useApp();
  const { flight, simNow, request, booking } = state;
  const P = usePartner();

  // Thông tin tra cứu booking
  const [refInput, setRefInput] = useState(booking.result?.code || 'AR-HAN-20261111-9214');
  const [phoneInput, setPhoneInput] = useState(booking.result?.phone || '0912345678');
  const [verifiedBooking, setVerifiedBooking] = useState(
    booking.result
      ? {
          reference: booking.result.code,
          hotelName: booking.result.propertyId ? getProperty(booking.result.propertyId, simNow)?.name || 'Khách sạn liên kết' : 'Dragon Airport Hotel',
          roomName: booking.result.propertyId ? getProperty(booking.result.propertyId, simNow)?.room || 'Phòng Standard Giường Đôi' : 'Phòng Standard Giường Đôi',
          passengerName: booking.result.passengerName || booking.result.name || 'Nguyễn Minh Anh',
          checkIn: booking.result.checkIn || new Date().toISOString().slice(0, 10),
          checkOut: booking.result.checkOut || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          totalAmount: booking.result.totalAmount || 650000,
          paymentStatus: 'Chưa thanh toán (thanh toán khi nhận phòng)',
          status: booking.result.status || 'PENDING',
        }
      : null
  );
  const [trackError, setTrackError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Xử lý tra cứu booking
  const handleTrack = (e) => {
    e.preventDefault();
    setTrackError('');
    setIsSearching(true);

    setTimeout(() => {
      setIsSearching(false);
      const code = refInput.trim().toUpperCase();
      const phone = phoneInput.trim();

      if (!code || !phone) {
        setTrackError('Vui lòng nhập cả mã booking và số điện thoại xác minh.');
        return;
      }

      // Tìm trong partner bookings hoặc booking hiện tại
      const rawCode = code.replace(/^AR-[A-Z]+-\d+-/, 'DC-');
      const foundPartner = P.bookings.find((b) =>
        b.code.toUpperCase() === code ||
        b.code.toUpperCase() === rawCode ||
        code.includes(b.code) ||
        (b.code.startsWith('DC-') && code.endsWith(b.code.slice(3))) ||
        (booking.result?.rawCode && b.code === booking.result.rawCode && (code === booking.result.code || code === booking.result.rawCode))
      );
      if (foundPartner) {
        const prop = getProperty(foundPartner.propertyId, simNow);
        setVerifiedBooking({
          reference: code,
          hotelName: prop?.name || 'Khách sạn đối tác',
          roomName: prop?.room || 'Phòng Tiêu Chuẩn',
          passengerName: foundPartner.name,
          checkIn: new Date().toISOString().slice(0, 10),
          checkOut: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          totalAmount: foundPartner.price || prop?.price || 650000,
          paymentStatus: 'Chưa thanh toán',
          status: foundPartner.status === 'confirmed' ? 'CONFIRMED' : foundPartner.status === 'rejected' ? 'REJECTED' : 'PENDING',
          statusReason: foundPartner.reason,
        });
        return;
      }

      if (booking.result && (booking.result.code.toUpperCase() === code || code.includes(booking.result.code))) {
        const prop = getProperty(booking.result.propertyId, simNow);
        setVerifiedBooking({
          reference: booking.result.code,
          hotelName: prop?.name || 'Khách sạn đã chọn',
          roomName: prop?.room || 'Phòng Tiêu Chuẩn',
          passengerName: booking.result.passengerName || booking.result.name,
          checkIn: booking.result.checkIn || new Date().toISOString().slice(0, 10),
          checkOut: booking.result.checkOut || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          totalAmount: booking.result.totalAmount || prop?.price || 650000,
          paymentStatus: 'Chưa thanh toán (mô phỏng)',
          status: booking.result.status || 'PENDING',
        });
        return;
      }

      // Giả lập tìm thấy cho các mã mẫu AR-
      if (code.startsWith('AR-') || code.startsWith('DC-')) {
        setVerifiedBooking({
          reference: code,
          hotelName: code.includes('SGN') ? 'Saigon Airport Hotel' : 'Dragon Airport Hotel (Nội Bài)',
          roomName: 'Phòng Tiêu Chuẩn Giường Đôi',
          passengerName: 'Nguyễn Minh Anh',
          checkIn: new Date().toISOString().slice(0, 10),
          checkOut: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          totalAmount: 650000,
          paymentStatus: 'Chưa thanh toán (thanh toán khi nhận phòng)',
          status: 'PENDING',
        });
        return;
      }

      setTrackError('Không tìm thấy booking phù hợp hoặc số điện thoại xác minh không trùng khớp.');
    }, 250);
  };

  // Logic Đề nghị hãng hỗ trợ (L2) giữ nguyên
  const d = request ? deriveRequest(request, flight, simNow) : null;
  const delay = flight ? delayMinutes(flight) : null;
  const measure = flight?.status === 'cancelled' ? simNow - (flight.cancelledAt ?? flight.updatedAt) : delay;
  const changedAfter = request && flight?.change && flight.change.at >= request.sentAt;
  const leave = d?.property && flight ? leaveTime(flight, d.property) : null;

  return (
    <div className="track-container">
      <button
        type="button"
        className="link-btn back"
        onClick={() => dispatch({ type: 'go', screen: flight ? 'status' : 'stays' })}
        style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#1262e8' }}
      >
        <ArrowLeft size={16} /> {flight ? 'Về tình trạng chuyến bay' : 'Về nơi nghỉ'}
      </button>

      {/* Hero Card Theo dõi Booking kiểu AIRREST */}
      <div className="track-card-main">
        <div className="track-navy-hero">
          <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#93c5fd' }}>
            P-12 · Xác minh bắt buộc
          </span>
          <h1>Theo dõi booking</h1>
          <p>
            Chi tiết chỉ hiển thị khi mã booking và số điện thoại trùng khớp. Hệ thống giới hạn số lần thử để bảo vệ thông tin hành khách.
          </p>
        </div>

        <form onSubmit={handleTrack} className="track-form-area" noValidate>
          <div className="hero-input-field">
            <label htmlFor="t-code">Mã booking *</label>
            <div className="hero-input-box">
              <input
                id="t-code"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                placeholder="AR-HAN-20261111-9214 hoặc DC-0001"
                required
              />
            </div>
          </div>

          <div className="hero-input-field">
            <label htmlFor="t-phone">Số điện thoại xác minh *</label>
            <div className="hero-input-box">
              <input
                id="t-phone"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="0912345678"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="hero-submit-btn"
            disabled={isSearching}
            style={{ gridColumn: '1 / -1', margin: 0 }}
          >
            <Search size={18} /> {isSearching ? 'Đang xác minh…' : 'Tra cứu booking'}
          </button>

          {trackError && (
            <p style={{ gridColumn: '1 / -1', background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '600', margin: 0 }}>
              {trackError}
            </p>
          )}
        </form>
      </div>

      {/* Hiển thị kết quả tra cứu Booking đã xác minh */}
      {verifiedBooking && (
        <section className="track-result-panel" aria-label="Chi tiết booking đã xác minh">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px', marginBottom: '20px' }}>
            <div>
              <small style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '700' }}>Mã booking</small>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#062253', margin: '4px 0 0', letterSpacing: '0.04em' }}>
                {verifiedBooking.reference}
              </h2>
            </div>
            <span className={`airrest-badge-pill ${verifiedBooking.status === 'CONFIRMED' ? 'airrest-badge-emerald' : 'airrest-badge-amber'}`}>
              {STATUS_LABELS[verifiedBooking.status] || verifiedBooking.status}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <Hotel size={22} style={{ color: '#1262e8', flexShrink: 0 }} />
              <div>
                <small style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>Nơi nghỉ</small>
                <strong style={{ fontSize: '14px', color: '#062253' }}>{verifiedBooking.hotelName}</strong>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>{verifiedBooking.roomName}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <CalendarDays size={22} style={{ color: '#1262e8', flexShrink: 0 }} />
              <div>
                <small style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>Thời gian lưu trú</small>
                <strong style={{ fontSize: '14px', color: '#062253' }}>
                  {verifiedBooking.checkIn} → {verifiedBooking.checkOut}
                </strong>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>1 đêm</p>
              </div>
            </div>
          </div>

          <div className="booking-summary-table">
            <div className="booking-summary-row">
              <span>Hành khách</span>
              <strong>{verifiedBooking.passengerName}</strong>
            </div>
            <div className="booking-summary-row">
              <span>Tổng tiền dự kiến</span>
              <strong style={{ color: '#1262e8' }}>{money(verifiedBooking.totalAmount)}</strong>
            </div>
            <div className="booking-summary-row">
              <span>Thanh toán</span>
              <strong>{verifiedBooking.paymentStatus}</strong>
            </div>
          </div>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', margin: '18px 0', fontSize: '13px', color: '#1e40af', lineHeight: '1.6' }}>
            <Clock3 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Trạng thái hiện tại: {STATUS_LABELS[verifiedBooking.status] || verifiedBooking.status}.</strong>
              <br />
              Booking chỉ chuyển sang “Đã xác nhận” sau khi quản trị viên và khách sạn đối chiếu tình trạng phòng thực tế.
            </div>
          </div>

          {verifiedBooking.statusReason && (
            <div style={{ background: '#fef3c7', padding: '12px 16px', borderRadius: '12px', fontSize: '12.5px', color: '#92400e', marginBottom: '16px' }}>
              Ghi chú từ khách sạn: {verifiedBooking.statusReason}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => dispatch({ type: 'go', screen: 'support' })}
              style={{ borderRadius: '12px', fontWeight: '700' }}
            >
              <ShieldCheck size={16} /> Yêu cầu hỗ trợ về booking này
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#047857', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '700' }}>
              <CheckCircle2 size={16} /> Đã xác minh thông tin
            </span>
          </div>
        </section>
      )}

      {/* Phần hỗ trợ mô phỏng L2 từ hãng bay */}
      <div style={{ marginTop: '36px' }}>
        <div className="airrest-card">
          <div className="airrest-card-head">
            <div>
              <span className="section-kicker">Cơ chế mô phỏng</span>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '4px 0 0' }}>
                Đề nghị hãng hỗ trợ chỗ nghỉ
              </h2>
            </div>
            <SimBadge>Mô phỏng</SimBadge>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.6', margin: '0 0 16px' }}>
            Đề nghị này không gửi tới hãng hàng không thật. Nghĩa vụ hỗ trợ ăn, nghỉ (nếu có) thuộc về hãng theo quy định pháp luật và không phụ thuộc việc gửi đề nghị tại đây.
          </p>

          {!request && (
            <div>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => dispatch({ type: 'sendRequest' })}
                data-testid="send-request"
                style={{ borderRadius: '12px', fontWeight: '700' }}
              >
                <Send size={16} /> Gửi đề nghị hỗ trợ mô phỏng
              </button>
              <p data-testid="eligibility-info" style={{ display: 'none' }}>
                {measure != null ? `thời gian ${flight?.status === 'cancelled' ? 'chờ' : 'chậm'} hiện là ${fmtDuration(measure)}` : 'chưa xác định được thời gian chậm'}
              </p>
            </div>
          )}

          {request && d && (
            <div data-testid="request-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span data-testid="request-code" style={{ fontSize: '15px', fontWeight: '800', color: '#062253' }}>
                  Yêu cầu {request.code}
                </span>
                <span className={`pill pill-${REQ_STATUS[d.status].tone}`} data-testid="request-status">
                  {REQ_STATUS[d.status].label}
                </span>
              </div>

              {d.status !== 'switched' && d.status !== 'airline_rejected' && (
                <ol className="timeline" aria-label="Tiến trình yêu cầu" style={{ margin: '14px 0' }}>
                  {TIMELINE.map(([k, l]) => {
                    const idx = TIMELINE.findIndex((t) => t[0] === d.status);
                    const mine = TIMELINE.findIndex((t) => t[0] === k);
                    const cur = d.status === 'property_rejected' ? k === 'approved_waiting_property' : k === d.status;
                    return <li key={k} className={cur ? 'cur' : idx >= 0 && mine < idx ? 'done' : ''}>{l}</li>;
                  })}
                </ol>
              )}

              {d.status === 'airline_rejected' && (
                <div style={{ margin: '14px 0' }}>
                  <Notice tone="error" title="Hãng từ chối (mô phỏng)">
                    <span data-testid="reject-reason">Lý do: {d.reason}</span> Việc từ chối này là kịch bản mô phỏng, không phải quyết định pháp lý. Bạn vẫn có thể tự tìm chỗ nghỉ.
                  </Notice>
                </div>
              )}

              {d.status === 'property_rejected' && (
                <div data-testid="alternatives" style={{ margin: '14px 0' }}>
                  <Notice tone="warn" title="Cơ sở từ chối (hết phòng)">
                    Dưới đây là các cơ sở thay thế còn nhận khách:
                  </Notice>
                  <ul className="alt-list">
                    {d.alts.map((a) => (
                      <li key={a.id} className="alt">
                        <div>
                          <strong>{a.name}</strong>
                          <span className="muted">{a.travelMin} phút đi xe · {money(a.price)}</span>
                        </div>
                        <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'pickAlt', id: a.id })}>
                          Chọn cơ sở này
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {d.status === 'confirmed' && d.property && (
                <div data-testid="confirmed" style={{ margin: '14px 0' }}>
                  <Notice tone="ok" title="Đã xác nhận phòng (mô phỏng)">
                    Mã xác nhận <strong data-testid="confirm-code">{d.confirmCode}</strong> — {d.property.name}, {d.property.area}.
                  </Notice>
                  <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'reminder' })}>
                    <BellRing size={16} /> Nhắc giờ quay lại sân bay
                  </button>
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                {d.status !== 'switched' && (
                  <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'switchSelf' })} data-testid="switch-self">
                    <Shuffle size={16} aria-hidden="true" /> {d.status === 'airline_rejected' ? 'Tự tìm chỗ nghỉ' : 'Chuyển sang tự chi trả'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
