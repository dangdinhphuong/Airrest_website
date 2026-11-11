import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../state/store';
import { EmptyBox, Notice, ScreenTitle, SourceLine } from '../components/Common';

// M7 — Tiện ích tại nhà ga (MB-09, Conditional; dữ liệu đang Blocked — D-09).
// Chỉ hiển thị vị trí đã có trên trang chính thức của cảng. Giá, giờ mở, đơn vị vận hành: chưa có nguồn hiện hành.
const SOURCE = { label: 'Cảng Hàng không quốc tế Nội Bài — Dịch vụ hộp ngủ', url: 'https://noibaiairport.vn/vi/dich-vu-hop-ngu-nid111.html', accessed: '26/10/2026' };
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
      <button type="button" className="link-btn back" onClick={() => dispatch({ type: 'go', screen: state.flight ? 'advice' : 'stays' })}><ArrowLeft size={16} aria-hidden="true" /> {state.flight ? 'Về gợi ý' : 'Về nơi nghỉ'}</button>
      <ScreenTitle kicker="Ở lại sân bay" title="Thông tin nhà ga">Tính năng có điều kiện (MB-09): chỉ hiển thị thông tin đã có nguồn.</ScreenTitle>
      <Notice tone="warn" title="Chưa xác minh còn hoạt động">Vị trí lấy từ trang của cảng; trang không ghi giờ mở, giá hay ngày cập nhật. Đừng coi đây là dịch vụ đang chắc chắn hoạt động — hãy hỏi lại tại nhà ga.</Notice>
      {items.length === 0 ? (
        <EmptyBox title="Chưa có thông tin đã xác minh cho sân bay này" actions={<button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Xem nơi nghỉ ngoài sân bay</button>}>
          Bản mô phỏng chưa có nguồn đã xác minh về tiện ích tại nhà ga của sân bay này.
        </EmptyBox>
      ) : (
        <div className="list">
          {items.map((i) => (
            <article key={i.name} className="card" data-testid="terminal-item">
              <h2>{i.name}</h2>
              <dl className="spec">
                <div><dt>Vị trí</dt><dd>{i.place}</dd></div>
                <div><dt>Giờ mở</dt><dd>Chưa có thông tin</dd></div>
                <div><dt>Giá</dt><dd>Chưa có thông tin</dd></div>
                <div><dt>Ngày cập nhật</dt><dd>Trang nguồn không ghi ngày</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
      <SourceLine>Nguồn: <a href={SOURCE.url} target="_blank" rel="noreferrer noopener">{SOURCE.label}</a>; truy cập {SOURCE.accessed}.</SourceLine>
      <button type="button" className="btn btn-block" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Xem nơi nghỉ ngoài sân bay</button>
    </>
  );
}
