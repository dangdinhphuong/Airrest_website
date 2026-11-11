import React from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useApp } from '../state/store';
import { isOpen, receptionLabel } from '../lib/domain';
import { fmtTime, money } from '../lib/time';
import { EmptyBox, Notice, ScreenTitle, SimBadge } from '../components/Common';
import { SHUTTLE_LABEL, priceNote } from '../components/PropertyCard';

// M4 — Chi tiết nơi nghỉ (MB-06: FR-010). Giá tổng trùng giá ở danh sách và bước đặt chỗ (BR-005).
export default function Detail({ asPanel = false }) {
  const { state, dispatch, getProperty } = useApp();
  const { propertyId, simNow } = state;
  const p = propertyId ? getProperty(propertyId, simNow) : null;
  if (!p) return <EmptyBox title="Không tìm thấy nơi nghỉ" actions={<button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Về danh sách</button>}>Nơi nghỉ bạn chọn không còn trong dữ liệu mô phỏng.</EmptyBox>;
  const open = isOpen(p, simNow);
  const hasFlight = !!state.flight;
  const Wrap = asPanel ? 'div' : React.Fragment;
  const wrapProps = asPanel ? { className: 'panel-body' } : {};
  return (
    <Wrap {...wrapProps}>
      {asPanel
        ? <div className="panel-head"><span className="kicker">Chi tiết nơi nghỉ</span><button type="button" className="icon-btn" onClick={() => dispatch({ type: 'closeProperty' })} aria-label="Đóng chi tiết"><X size={18} aria-hidden="true" /></button></div>
        : <button type="button" className="link-btn back" onClick={() => dispatch({ type: 'go', screen: 'stays' })}><ArrowLeft size={16} aria-hidden="true" /> Về danh sách</button>}
      {asPanel ? <h2 className="panel-title" tabIndex={-1}>{p.name}</h2> : <ScreenTitle kicker="Chi tiết nơi nghỉ" title={p.name}>{p.type} · {p.area} <SimBadge /></ScreenTitle>}
      {asPanel && <p className="muted">{p.type} · {p.area} <SimBadge /></p>}
      {!open && <Notice tone="error" title="Nơi nghỉ không còn nhận khách">{p.roomsLeft <= 0 ? 'Đã hết phòng.' : 'Đã quá giờ nhận khách cuối.'} Nút đặt chỗ được ẩn; hãy chọn nơi khác trong danh sách.</Notice>}
      <section className={asPanel ? 'panel-card' : 'card'} aria-label="Thông tin chi tiết">
        <div className="price-block">
          <small>Giá tổng phải trả</small>
          <strong data-testid="detail-price">{money(p.price)}</strong>
          <span className="muted">{priceNote()}</span>
        </div>
        <dl className="spec">
          <div><dt>Phòng</dt><dd>{p.room}</dd></div>
          <div><dt>Chính sách huỷ</dt><dd>{p.freeCancel ? 'Huỷ miễn phí' : 'Không hoàn huỷ'}</dd></div>
          <div><dt>Giờ lễ tân / nhận khách</dt><dd data-testid="detail-reception">{receptionLabel(p, simNow)}</dd></div>
          <div><dt>Thanh toán</dt><dd>{p.payAtProperty ? 'Có thể trả tại nơi nghỉ' : 'Không hỗ trợ trả tại nơi nghỉ'} (mô phỏng)</dd></div>
          <div><dt>Cách đi</dt><dd>{p.travelMin} phút đi xe ({p.distanceKm} km) · taxi ~{money(p.taxi)} · {SHUTTLE_LABEL[p.shuttle]}</dd></div>
          <div><dt>Tiện ích</dt><dd><ul className="tags">{p.amenities.map((a) => <li key={a}><Check size={13} aria-hidden="true" /> {a}</li>)}</ul></dd></div>
          <div><dt>Đánh giá</dt><dd>{p.rating}/10 (mô phỏng)</dd></div>
          <div><dt>Cập nhật lúc</dt><dd>{fmtTime(p.updatedAt)} · Mô phỏng</dd></div>
        </dl>
        <p className="muted">Mọi thông tin trên đây là dữ liệu mô phỏng, không phải thông tin của cơ sở thật.</p>
        {open && hasFlight && <button type="button" className="btn btn-primary btn-block" onClick={() => dispatch({ type: 'startBooking' })}>Đặt chỗ (mô phỏng)</button>}
        {open && !hasFlight && (
          <>
            <Notice tone="info" title="Cần nhập chuyến bay để đặt chỗ">Bạn đang xem ở chế độ duyệt (giờ mô phỏng 23:08). Nhập chuyến bay để tính thời gian nghỉ, giờ rời và đặt chỗ.</Notice>
            <button type="button" className="btn btn-primary btn-block" onClick={() => dispatch({ type: 'goLookup', pending: true })} data-testid="need-flight">Nhập chuyến bay để đặt chỗ</button>
          </>
        )}
      </section>
    </Wrap>
  );
}
