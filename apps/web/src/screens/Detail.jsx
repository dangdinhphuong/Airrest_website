import React from 'react';
import { ArrowLeft, Check, Clock3, MapPin, ShieldCheck, Star, X } from 'lucide-react';
import { useApp } from '../state/store';
import { isOpen, receptionLabel } from '../lib/domain';
import { fmtTime, money } from '../lib/time';
import { EmptyBox, Notice, SimBadge } from '../components/Common';
import { SHUTTLE_LABEL, priceNote } from '../components/PropertyCard';

const IMAGES = ['/images/hotel-1.jpg', '/images/hotel-2.jpg', '/images/hotel-3.jpg'];

export default function Detail({ asPanel = false }) {
  const { state, dispatch, getProperty } = useApp();
  const { propertyId, simNow } = state;
  const p = propertyId ? getProperty(propertyId, simNow) : null;

  if (!p) {
    return (
      <EmptyBox
        title="Không tìm thấy nơi nghỉ"
        actions={<button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Về danh sách</button>}
      >
        Nơi nghỉ bạn chọn không còn trong dữ liệu mô phỏng.
      </EmptyBox>
    );
  }

  const open = isOpen(p, simNow);
  const hasFlight = !!state.flight;
  const imgIdx = Math.abs(p.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % IMAGES.length;
  const imageSrc = p.image || IMAGES[imgIdx];

  if (asPanel) {
    return (
      <div className="panel-body">
        <div className="panel-head">
          <span className="section-kicker">Chi tiết nơi nghỉ</span>
          <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'closeProperty' })} aria-label="Đóng chi tiết">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div style={{ height: '160px', borderRadius: '14px', overflow: 'hidden', margin: '8px 0 12px' }}>
          <img src={imageSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <h2 className="panel-title" tabIndex={-1}>{p.name}</h2>
        <p className="muted">{p.type} · {p.area} <SimBadge /></p>
        {!open && <Notice tone="error" title="Nơi nghỉ không còn nhận khách">{p.roomsLeft <= 0 ? 'Đã hết phòng.' : 'Đã quá giờ nhận khách cuối.'}</Notice>}
        <section className="panel-card" aria-label="Thông tin chi tiết">
          <div className="price-block">
            <small>Giá tổng / đêm</small>
            <strong data-testid="detail-price">{money(p.price)}</strong>
            <span className="muted">{priceNote()}</span>
          </div>
          <dl className="spec">
            <div><dt>Phòng</dt><dd>{p.room}</dd></div>
            <div><dt>Chính sách huỷ</dt><dd>{p.freeCancel ? 'Huỷ miễn phí' : 'Không hoàn huỷ'}</dd></div>
            <div><dt>Giờ nhận khách</dt><dd data-testid="detail-reception">{receptionLabel(p, simNow)}</dd></div>
            <div><dt>Thanh toán</dt><dd>{p.payAtProperty ? 'Trả tại nơi nghỉ' : 'QR mô phỏng'}</dd></div>
            <div><dt>Cách đi</dt><dd>{p.travelMin} phút ({p.distanceKm} km) · {SHUTTLE_LABEL[p.shuttle]}</dd></div>
          </dl>
          {open && hasFlight && (
            <button type="button" className="hero-submit-btn" onClick={() => dispatch({ type: 'startBooking' })}>
              Đặt chỗ (mô phỏng)
            </button>
          )}
          {open && !hasFlight && (
            <button type="button" className="hero-submit-btn" onClick={() => dispatch({ type: 'goLookup', pending: true })} data-testid="need-flight">
              Nhập chuyến bay để đặt chỗ
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="hotel-detail-page" style={{ paddingBottom: '32px' }}>
      <button
        type="button"
        className="link-btn back"
        onClick={() => dispatch({ type: 'go', screen: 'stays' })}
        style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#1262e8' }}
      >
        <ArrowLeft size={16} /> Quay lại danh sách
      </button>

      {!open && (
        <div style={{ marginBottom: '16px' }}>
          <Notice tone="error" title="Nơi nghỉ không còn nhận khách">
            {p.roomsLeft <= 0 ? 'Đã hết phòng.' : 'Đã quá giờ nhận khách cuối.'} Nút đặt chỗ được ẩn; hãy chọn nơi khác trong danh sách.
          </Notice>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '28px', alignItems: 'start' }}>
        {/* Cột trái: Hình ảnh lớn + Thông tin tổng quan */}
        <div>
          <div style={{ position: 'relative', height: '360px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <img src={imageSrc} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {p.rating && (
              <span style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)', padding: '6px 12px', borderRadius: '12px', fontSize: '13px', fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
                <Star size={14} fill="#047857" /> {p.rating}/10
              </span>
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '28px', marginTop: '20px', boxShadow: '0 4px 20px rgba(16, 32, 58, 0.04)' }}>
            <span className="section-kicker">Thông tin khách sạn · Mô phỏng</span>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#062253', marginTop: '4px' }}>{p.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', color: '#64748b', margin: '10px 0 16px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={15} style={{ color: '#1262e8' }} /> {p.area} · {p.distanceKm} km ({p.travelMin} phút đi xe)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock3 size={15} style={{ color: '#1262e8' }} /> Cập nhật lúc {fmtTime(p.updatedAt)}
              </span>
            </div>

            <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#475569', margin: '16px 0 20px' }}>
              Không gian phòng nghỉ tiện nghi, thoáng mát, được thiết kế tối ưu cho hành khách nghỉ ngơi trong thời gian chờ chuyến bay hoặc quá cảnh gần sân bay.
            </p>

            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#062253', marginBottom: '12px' }}>Tiện ích nổi bật</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {p.amenities?.map((item) => (
                <span key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', fontWeight: '500' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '6px', background: '#ecfdf5', color: '#047857' }}>
                    <Check size={14} />
                  </span>
                  {item}
                </span>
              ))}
              {p.shuttle !== 'none' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', fontWeight: '500' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '6px', background: '#ecfdf5', color: '#047857' }}>
                    <Check size={14} />
                  </span>
                  {SHUTTLE_LABEL[p.shuttle]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cột phải: Loại phòng & Đặt chỗ & Điều kiện lưu trú */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '28px', boxShadow: '0 4px 20px rgba(16, 32, 58, 0.04)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#062253', marginBottom: '16px' }}>Loại phòng hiện có</h2>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div>
                  <strong style={{ fontSize: '16px', color: '#062253' }}>{p.room}</strong>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
                    {p.type} · {p.freeCancel ? 'Hủy miễn phí' : 'Không hoàn hủy'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong data-testid="detail-price" style={{ fontSize: '18px', color: '#1262e8' }}>{money(p.price)}</strong>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>/ đêm</span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: '12px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#475569' }}>Tồn phòng:</span>
                <span style={{ color: p.roomsLeft > 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>
                  {p.roomsLeft > 0 ? `Còn ${p.roomsLeft} phòng` : 'Hết phòng'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>
              {priceNote()}
            </div>

            {open && hasFlight && (
              <button
                type="button"
                className="hero-submit-btn"
                onClick={() => dispatch({ type: 'startBooking' })}
              >
                Đặt chỗ ngay (mô phỏng)
              </button>
            )}

            {open && !hasFlight && (
              <div>
                <p style={{ fontSize: '12.5px', color: '#0369a1', background: '#f0f9ff', padding: '10px 14px', borderRadius: '12px', marginBottom: '12px' }}>
                  Bạn đang xem ở chế độ duyệt. Nhập chuyến bay để xác định giờ nghỉ và gửi yêu cầu đặt chỗ.
                </p>
                <button
                  type="button"
                  className="hero-submit-btn"
                  onClick={() => dispatch({ type: 'goLookup', pending: true })}
                  data-testid="need-flight"
                >
                  Nhập chuyến bay để đặt chỗ
                </button>
              </div>
            )}
          </div>

          {/* Điều kiện lưu trú - Theme Dark Navy AIRREST */}
          <div style={{ background: '#062253', color: '#ffffff', borderRadius: '24px', padding: '28px', boxShadow: '0 10px 30px rgba(6, 34, 83, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#bfdbfe', marginBottom: '14px' }}>
              <ShieldCheck size={20} />
              <h3 style={{ color: '#ffffff', fontSize: '17px', fontWeight: '700' }}>Điều kiện lưu trú</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#dbeafe', lineHeight: '1.6' }}>
              <p style={{ margin: 0 }}>
                <strong>Lễ tân & Nhận khách:</strong> <span data-testid="detail-reception">{receptionLabel(p, simNow)}</span>.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Hình thức thanh toán:</strong> {p.payAtProperty ? 'Có thể trả trực tiếp tại nơi nghỉ' : 'Thanh toán trực tuyến (mô phỏng)'}.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Phương tiện di chuyển:</strong> Taxi khoảng {money(p.taxi)} ({p.travelMin} phút đi xe). {SHUTTLE_LABEL[p.shuttle]}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
