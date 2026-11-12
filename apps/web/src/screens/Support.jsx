import React, { useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Headphones, HelpCircle, Send, ShieldCheck } from 'lucide-react';
import { useApp } from '../state/store';
import { Notice, SimBadge } from '../components/Common';

const FAQ = [
  {
    q: 'Chuyến bay được coi là chậm khi nào?',
    a: 'Chuyến bay chậm là chuyến có thời gian đi thực tế muộn hơn 15 phút so với thời gian đi theo lịch bay căn cứ; chậm kéo dài là chậm từ 4 giờ.',
    src: 'Nghị định 208/2026/NĐ-CP, Điều 36 khoản 2',
    url: 'https://vanban.chinhphu.vn/?docid=218453&pageid=27160',
    valid: 'Hiệu lực từ 01/7/2026',
    accessed: '26/10/2026',
  },
  {
    q: 'Quầy làm thủ tục chuyến bay nội địa đóng lúc nào?',
    a: 'Thời gian đóng quầy đối với chuyến bay nội địa là 40 phút trước giờ đi dự kiến; quầy mở ít nhất 2 giờ trước giờ đi dự kiến.',
    src: 'Thông tư 48/2026/TT-BXD, Điều 8 khoản 1 điểm b',
    url: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/48-bxd.signed.pdf',
    valid: 'Hiệu lực từ 01/7/2026',
    accessed: '26/10/2026',
  },
  {
    q: 'Hộp ngủ ở Nội Bài nằm ở đâu?',
    a: 'Theo trang của cảng: T1 ở tầng 3 nhà ga quốc nội, T2 ở tầng 2 nhà ga quốc tế. Trang không ghi giờ mở hay giá.',
    src: 'Cảng Hàng không quốc tế Nội Bài — Dịch vụ hộp ngủ',
    url: 'https://noibaiairport.vn/vi/dich-vu-hop-ngu-nid111.html',
    valid: 'Trang không ghi ngày cập nhật',
    accessed: '26/10/2026',
  },
];

export default function Support() {
  const { dispatch, state } = useApp();
  const [success, setSuccess] = useState(false);
  const [ticketRef, setTicketRef] = useState('');
  const [formData, setFormData] = useState({
    contactName: state.booking.name || state.user?.name || '',
    contact: state.booking.email || 'hanhkhach@example.com',
    category: 'BOOKING',
    bookingReference: state.booking.result?.code || '',
    subject: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const updateField = (k, v) => {
    setFormData((prev) => ({ ...prev, [k]: v }));
    setFormError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.contactName.trim() || !formData.contact.trim() || !formData.subject.trim() || !formData.description.trim()) {
      setFormError('Vui lòng điền đầy đủ các thông tin bắt buộc.');
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      const code = `TK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      setTicketRef(code);
      setSuccess(true);
    }, 300);
  };

  return (
    <div className="support-container">
      <button
        type="button"
        className="link-btn back"
        onClick={() => dispatch({ type: 'go', screen: state.flight ? 'status' : 'stays' })}
        style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#1262e8' }}
      >
        <ArrowLeft size={16} /> Quay lại
      </button>

      {/* Khối giao diện Trung tâm hỗ trợ kiểu AIRREST */}
      <div className="support-grid-card">
        {/* Cột trái thông tin hỗ trợ */}
        <aside className="support-navy-aside">
          <span style={{ display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.12)', color: '#bfdbfe' }}>
            <Headphones size={24} />
          </span>
          <h1>Trung tâm hỗ trợ</h1>
          <p>
            Gửi yêu cầu về booking, chuyến bay bị hoãn hủy, thanh toán mô phỏng hoặc phương tiện di chuyển đưa đón.
          </p>

          <div style={{ marginTop: 'auto', paddingTop: '28px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12.5px', color: '#bfdbfe' }}>
            <p style={{ display: 'flex', gap: '10px', margin: 0 }}>
              <ShieldCheck size={18} style={{ flexShrink: 0, color: '#93c5fd' }} />
              Không gửi thông tin giấy tờ tùy thân hoặc số thẻ ngân hàng.
            </p>
            <p style={{ display: 'flex', gap: '10px', margin: 0 }}>
              <Check size={18} style={{ flexShrink: 0, color: '#34d399' }} />
              Ticket bắt đầu ở trạng thái OPEN và được theo dõi trong phiên.
            </p>
            <p style={{ display: 'flex', gap: '10px', margin: 0 }}>
              <Check size={18} style={{ flexShrink: 0, color: '#34d399' }} />
              Nhân viên hỗ trợ sẽ cập nhật phản hồi nhanh nhất có thể.
            </p>
          </div>
        </aside>

        {/* Cột phải Form gửi ticket */}
        <div className="support-form-content">
          {success ? (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: '64px', height: '64px', borderRadius: '50%', background: '#ecfdf5', color: '#047857', margin: '0 auto 16px' }}>
                <Check size={32} />
              </span>
              <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#047857' }}>
                Đã tiếp nhận yêu cầu
              </span>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#062253', margin: '8px 0 10px' }}>
                Yêu cầu hỗ trợ đã được tạo
              </h2>
              <p style={{ fontSize: '13.5px', color: '#64748b', margin: '0 0 20px' }}>
                Mã ticket hỗ trợ của bạn là:
              </p>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '16px', padding: '16px 20px', display: 'inline-block', marginBottom: '24px' }}>
                <strong style={{ fontSize: '22px', letterSpacing: '0.06em', color: '#1262e8' }}>
                  {ticketRef}
                </strong>
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { setSuccess(false); setFormError(''); }}
                  style={{ borderRadius: '12px', fontWeight: '700', padding: '10px 22px' }}
                >
                  Tạo ticket khác
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span className="section-kicker">Gửi ticket hỗ trợ</span>
                <SimBadge>Mô phỏng</SimBadge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div className="hero-input-field">
                  <label htmlFor="s-name">Tên liên hệ *</label>
                  <div className="hero-input-box">
                    <input
                      id="s-name"
                      value={formData.contactName}
                      onChange={(e) => updateField('contactName', e.target.value)}
                      placeholder="Nguyễn Minh Anh"
                      required
                    />
                  </div>
                </div>

                <div className="hero-input-field">
                  <label htmlFor="s-contact">Email hoặc số điện thoại *</label>
                  <div className="hero-input-box">
                    <input
                      id="s-contact"
                      value={formData.contact}
                      onChange={(e) => updateField('contact', e.target.value)}
                      placeholder="ban@example.com hoặc 0912..."
                      required
                    />
                  </div>
                </div>

                <div className="hero-input-field">
                  <label htmlFor="s-cat">Loại yêu cầu</label>
                  <div className="hero-input-box">
                    <select
                      id="s-cat"
                      value={formData.category}
                      onChange={(e) => updateField('category', e.target.value)}
                    >
                      <option value="BOOKING">Về đặt phòng / Booking</option>
                      <option value="FLIGHT">Chuyến bay hoãn / hủy</option>
                      <option value="PAYMENT">Thanh toán mô phỏng</option>
                      <option value="TRANSPORT">Xe đưa đón sân bay</option>
                      <option value="OTHER">Vấn đề khác</option>
                    </select>
                  </div>
                </div>

                <div className="hero-input-field">
                  <label htmlFor="s-booking">Mã booking (nếu có)</label>
                  <div className="hero-input-box">
                    <input
                      id="s-booking"
                      value={formData.bookingReference}
                      onChange={(e) => updateField('bookingReference', e.target.value.toUpperCase())}
                      placeholder="AR-HAN-20261111-9214"
                    />
                  </div>
                </div>

                <div className="hero-input-field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="s-subject">Tiêu đề *</label>
                  <div className="hero-input-box">
                    <input
                      id="s-subject"
                      value={formData.subject}
                      onChange={(e) => updateField('subject', e.target.value)}
                      placeholder="Ví dụ: Cần xác nhận giờ nhận phòng muộn"
                      required
                    />
                  </div>
                </div>

                <div className="hero-input-field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="s-desc">Mô tả chi tiết *</label>
                  <textarea
                    id="s-desc"
                    rows={4}
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Mô tả cụ thể vấn đề hoặc thắc mắc của bạn…"
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px', fontSize: '13.5px', outline: 'none' }}
                    required
                  />
                </div>
              </div>

              {formError && (
                <p style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '600', margin: '14px 0 0' }}>
                  {formError}
                </p>
              )}

              <button
                type="submit"
                className="hero-submit-btn"
                disabled={submitting}
                style={{ marginTop: '18px' }}
              >
                <Send size={16} /> {submitting ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu hỗ trợ'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Danh sách câu hỏi thường gặp có nguồn */}
      <div style={{ marginTop: '40px' }}>
        <div style={{ marginBottom: '20px' }}>
          <span className="section-kicker">Thông tin xác minh</span>
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#062253', margin: '4px 0 6px' }}>
            Câu hỏi thường gặp có nguồn
          </h2>
          <p style={{ fontSize: '13.5px', color: '#64748b' }}>
            Thông tin căn cứ theo các quy định hiện hành của cơ quan quản lý hàng không.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          {FAQ.map((f) => (
            <article key={f.q} className="airrest-card" data-testid="faq-item" style={{ marginBottom: 0 }}>
              <h3 style={{ fontSize: '16.5px', fontWeight: '700', color: '#062253', margin: '0 0 10px' }}>{f.q}</h3>
              <p style={{ fontSize: '14px', lineHeight: '1.65', color: '#475569', margin: '0 0 12px' }}>{f.a}</p>
              <p className="source-line" style={{ margin: 0 }}>
                Nguồn: <a href={f.url} target="_blank" rel="noreferrer noopener">{f.src}</a>. {f.valid}; truy cập {f.accessed}.
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
