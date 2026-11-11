import React, { memo } from 'react';
import { BedDouble, Building2, Check, Clock3, Hotel, MapPin, Star } from 'lucide-react';
import { SIM } from '../config/simulation';
import { fmtTime, money } from '../lib/time';
import { receptionLabel } from '../lib/domain';

export const SHUTTLE_LABEL = { free: 'Có xe đưa đón miễn phí', paid: 'Có xe đưa đón (có phí)', none: 'Không có xe đưa đón' };
const TYPE_ICON = { 'Khách sạn': Hotel, 'Nhà nghỉ': Hotel, 'Căn hộ': Building2, 'Hộp ngủ': BedDouble, 'Phòng theo giờ': BedDouble };

export function priceNote() {
  const a = SIM.assumptions;
  return `${a.rooms} phòng, ${a.nights} đêm, ${a.adults} người lớn · đã gồm thuế phí · mô phỏng`;
}

export function priceNoteShort() {
  const a = SIM.assumptions;
  return `${a.rooms} phòng · ${a.nights} đêm · ${a.adults} người lớn · mô phỏng`;
}

// Thẻ nơi nghỉ gọn: ô biểu tượng nhỏ + thông tin chính; chân thẻ có giá và nút. Không dùng ảnh khách sạn thật.
function PropertyCard({ p, now, onOpen, nearest = false, selected = false }) {
  const Icon = TYPE_ICON[p.type] || Hotel;
  const tone = p.type === 'Hộp ngủ' || p.type === 'Phòng theo giờ' ? 'b' : p.type === 'Căn hộ' ? 'c' : 'a';
  return (
    <article className={`card deal ${selected ? 'sel' : ''}`} data-testid="property-card" data-id={p.id} aria-current={selected ? 'true' : undefined}>
      <div className="deal-row">
        <button type="button" className={`deal-visual v-${tone}`} onClick={() => onOpen(p.id)} tabIndex={-1} aria-hidden="true">
          <Icon size={24} aria-hidden="true" />
        </button>
        <div className="deal-body">
          <div className="deal-title">
            <h3>{p.name}</h3>
            {nearest && <span className="ribbon-s">Gần nhất</span>}
            <span className="rating" aria-label={`Điểm đánh giá ${p.rating} (mô phỏng)`}><Star size={12} aria-hidden="true" /> {p.rating}</span>
          </div>
          <p className="travel"><MapPin size={14} aria-hidden="true" /> {p.travelMin} phút đi xe · taxi ~{money(p.taxi)} · {SHUTTLE_LABEL[p.shuttle]}</p>
          <p className="reception"><Clock3 size={14} aria-hidden="true" /> <span data-testid="reception">{receptionLabel(p, now)}</span> · còn phòng · {p.type}</p>
          <ul className="tags tags-s">
            {p.freeCancel && <li><Check size={11} aria-hidden="true" /> Huỷ miễn phí</li>}
            {p.payAtProperty && <li><Check size={11} aria-hidden="true" /> Trả tại nơi nghỉ</li>}
            {p.familyRoom && <li><Check size={11} aria-hidden="true" /> Phù hợp gia đình</li>}
            {p.hourly && <li><Check size={11} aria-hidden="true" /> Thuê theo giờ</li>}
          </ul>
        </div>
      </div>
      <div className="deal-foot">
        <div className="deal-price">
          <strong data-testid="price">{money(p.price)}</strong>
          <small>Giá tổng · {priceNoteShort()} · Cập nhật lúc {fmtTime(p.updatedAt)}</small>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpen(p.id)}>Xem chi tiết</button>
      </div>
    </article>
  );
}

export default memo(PropertyCard);
