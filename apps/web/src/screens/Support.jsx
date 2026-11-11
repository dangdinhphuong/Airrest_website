import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../state/store';
import { Notice, ScreenTitle } from '../components/Common';

// M8 — Trợ giúp giản lược (MB-10, Conditional): chỉ FAQ có nguồn; KHÔNG có số điện thoại hay kênh liên hệ nào không có nguồn xác minh.
const FAQ = [
  { q: 'Chuyến bay được coi là chậm khi nào?', a: 'Chuyến bay chậm là chuyến có thời gian đi thực tế muộn hơn 15 phút so với thời gian đi theo lịch bay căn cứ; chậm kéo dài là chậm từ 4 giờ.',
    src: 'Nghị định 208/2026/NĐ-CP, Điều 36 khoản 2', url: 'https://vanban.chinhphu.vn/?docid=218453&pageid=27160', valid: 'Hiệu lực từ 01/7/2026', accessed: '26/10/2026' },
  { q: 'Quầy làm thủ tục chuyến bay nội địa đóng lúc nào?', a: 'Thời gian đóng quầy đối với chuyến bay nội địa là 40 phút trước giờ đi dự kiến; quầy mở ít nhất 2 giờ trước giờ đi dự kiến.',
    src: 'Thông tư 48/2026/TT-BXD, Điều 8 khoản 1 điểm b', url: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/48-bxd.signed.pdf', valid: 'Hiệu lực từ 01/7/2026', accessed: '26/10/2026' },
  { q: 'Hộp ngủ ở Nội Bài nằm ở đâu?', a: 'Theo trang của cảng: T1 ở tầng 3 nhà ga quốc nội, T2 ở tầng 2 nhà ga quốc tế. Trang không ghi giờ mở hay giá.',
    src: 'Cảng Hàng không quốc tế Nội Bài — Dịch vụ hộp ngủ', url: 'https://noibaiairport.vn/vi/dich-vu-hop-ngu-nid111.html', valid: 'Trang không ghi ngày cập nhật', accessed: '26/10/2026' },
];

export default function Support() {
  const { dispatch, state } = useApp();
  return (
    <>
      <button type="button" className="link-btn back" onClick={() => dispatch({ type: 'go', screen: state.flight ? 'status' : 'stays' })}><ArrowLeft size={16} aria-hidden="true" /> Quay lại</button>
      <ScreenTitle kicker="Trợ giúp (bản giản lược)" title="Câu hỏi thường gặp có nguồn" />
      <Notice tone="info" title="Bản giản lược, chờ Product Owner">Mục này là tính năng có điều kiện (MB-10). Bản mô phỏng không cung cấp số điện thoại hay kênh liên hệ nào; để liên hệ, hãy dùng kênh chính thức ghi trên vé hoặc ứng dụng của hãng và của sân bay.</Notice>
      <div className="list">
        {FAQ.map((f) => (
          <article key={f.q} className="card" data-testid="faq-item">
            <h2>{f.q}</h2>
            <p>{f.a}</p>
            <p className="source-line">Nguồn: <a href={f.url} target="_blank" rel="noreferrer noopener">{f.src}</a>. {f.valid}; truy cập {f.accessed}.</p>
          </article>
        ))}
      </div>
    </>
  );
}
