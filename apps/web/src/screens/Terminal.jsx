import React from 'react';
import { ArrowLeft, BedDouble, Hotel, MapPin } from 'lucide-react';
import { useApp } from '../state/store';
import { EmptyBox, Notice, ScreenTitle, SourceLine } from '../components/Common';

// M7 — Tiện ích tại nhà ga (MB-09, Conditional).
const SOURCE = {
  label: 'Cảng Hàng không quốc tế Nội Bài — Dịch vụ hộp ngủ',
  url: 'https://noibaiairport.vn/vi/dich-vu-hop-ngu-nid111.html',
  accessed: '26/10/2026',
};

const DATA = {
  HAN: [
    { name: 'Hộp ngủ — Nhà ga T1 (quốc nội)', place: 'Tầng 3, nhà ga hành khách quốc nội (T1)' },
    { name: 'Hộp ngủ — Nhà ga T2 (quốc tế)', place: 'Tầng 2, nhà ga hành khách quốc tế (T2)' },
  ],
  SGN: [],
};

export default function Terminal() {
  const { state, dispatch } = useApp();
  const airport = state.flight ? state.flight.origin : state.browseAirport;
  const items = DATA[airport] || [];

  return (
    <>
      <button
        type="button"
        className="link-btn back"
        onClick={() => dispatch({ type: 'go', screen: state.flight ? 'advice' : 'stays' })}
        style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#1262e8' }}
      >
        <ArrowLeft size={16} /> {state.flight ? 'Về gợi ý' : 'Về nơi nghỉ'}
      </button>

      <ScreenTitle kicker="Ở lại sân bay" title="Thông tin nhà ga">
        Tính năng có điều kiện (MB-09): hiển thị thông tin hộp ngủ đã có nguồn xác minh từ cảng.
      </ScreenTitle>

      <Notice tone="warn" title="Chưa xác minh còn hoạt động">
        Vị trí lấy từ trang thông tin của cảng; trang không ghi giờ mở, giá hay ngày cập nhật. Hãy hỏi lại nhân viên tại nhà ga để có thông tin chính xác nhất.
      </Notice>

      {items.length === 0 ? (
        <EmptyBox
          title="Chưa có thông tin đã xác minh cho sân bay này"
          actions={
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>
              Xem nơi nghỉ ngoài sân bay
            </button>
          }
        >
          Bản mô phỏng chưa có nguồn đã xác minh về tiện ích hộp ngủ tại nhà ga của sân bay này.
        </EmptyBox>
      ) : (
        <div style={{ display: 'grid', gap: '16px', margin: '20px 0' }}>
          {items.map((i) => (
            <article key={i.name} className="airrest-card card" data-testid="terminal-item" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: '42px', height: '42px', borderRadius: '12px', background: '#eff6ff', color: '#1262e8' }}>
                  <BedDouble size={20} />
                </span>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#062253', margin: 0 }}>{i.name}</h2>
                  <p style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: '#64748b', margin: '4px 0 0' }}>
                    <MapPin size={13} style={{ color: '#1262e8' }} /> {i.place}
                  </p>
                </div>
              </div>

              <dl className="spec" style={{ margin: '14px 0' }}>
                <div><dt>Vị trí</dt><dd>{i.place}</dd></div>
                <div><dt>Giờ mở cửa</dt><dd>Chưa có thông tin công bố</dd></div>
                <div><dt>Giá dịch vụ</dt><dd>Chưa có thông tin công bố</dd></div>
                <div><dt>Cập nhật</dt><dd>Trang nguồn không ghi ngày</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <SourceLine>
        Nguồn: <a href={SOURCE.url} target="_blank" rel="noreferrer noopener">{SOURCE.label}</a>; truy cập {SOURCE.accessed}.
      </SourceLine>

      <button
        type="button"
        className="hero-submit-btn"
        onClick={() => dispatch({ type: 'go', screen: 'stays' })}
        style={{ marginTop: '20px' }}
      >
        <Hotel size={18} /> Xem nơi nghỉ ngoài sân bay
      </button>
    </>
  );
}
