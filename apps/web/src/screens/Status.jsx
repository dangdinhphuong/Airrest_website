import React from 'react';
import { ArrowRight, BedDouble, FileText, Search } from 'lucide-react';
import { useApp } from '../state/store';
import { RIGHTS } from '../config/rights';
import { delayMinutes } from '../lib/domain';
import { fmtDuration } from '../lib/time';
import { Notice, ScreenTitle, SimBadge, SourceLine } from '../components/Common';

// Bảng quyền lợi THAM KHẢO (MB-03 đang Blocked, chờ PO duyệt). Không kết luận người dùng được hưởng gì (BR-006).
function rowState(row, flight, measureMin) {
  if (flight.cause === 'unknown') return { tone: 'neutral', text: 'Chưa kết luận: chưa rõ nguyên nhân' };
  if (measureMin == null) return { tone: 'neutral', text: 'Chưa xác định: chưa biết thời gian chậm' };
  if (measureMin < row.hours * 60) return { tone: 'neutral', text: 'Chưa tới mốc' };
  if (row.needsFault && flight.cause === 'force') return { tone: 'warn', text: 'Phụ thuộc nguyên nhân: dữ liệu ghi ngoài kiểm soát của hãng — không kết luận' };
  return { tone: 'info', text: 'Đã tới mốc; xem điều kiện áp dụng' };
}

function RightsPanel({ flight, simNow }) {
  const cancelled = flight.status === 'cancelled';
  const rows = cancelled ? RIGHTS.cancel : RIGHTS.delay;
  const measure = cancelled ? simNow - (flight.cancelledAt ?? flight.updatedAt) : delayMinutes(flight);
  return (
    <section className="airrest-card card rights" aria-labelledby="rights-h" data-testid="rights-panel">
      <div className="airrest-card-head card-head">
        <div>
          <span className="section-kicker">Thông tin tham khảo</span>
          <h2 id="rights-h" style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '4px 0 0' }}>Quyền lợi của bạn</h2>
        </div>
        <SimBadge tone="draft">Chờ PO duyệt</SimBadge>
      </div>
      <Notice tone="info" title="Đây chưa phải kết luận về quyền lợi của bạn">
        Nội dung quyền lợi (MB-03) đang chờ Product Owner phê duyệt. Airrest không xác định quyền lợi của bạn: nghĩa vụ thuộc hãng hàng không và không phụ thuộc việc bạn dùng Airrest.
      </Notice>
      {flight.status === 'ontime' ? (
        <p className="muted">Chuyến bay đang đúng giờ nên chưa phát sinh mốc nào.</p>
      ) : (
        <>
          <p className="muted" style={{ margin: '14px 0' }}>
            {cancelled ? `Thời gian chờ tại cảng từ lúc huỷ chuyến (mô phỏng): ${fmtDuration(measure)}.` : measure != null ? `Thời gian chậm theo dữ liệu: ${fmtDuration(measure)}.` : 'Chưa có đủ giờ để tính thời gian chậm.'}
          </p>
          <div className="table-wrap">
            <table className="rights-table">
              <thead><tr><th>Mốc</th><th>Nội dung</th><th>Điều kiện áp dụng</th><th>Nguồn</th><th>Với chuyến của bạn</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const st = rowState(r, flight, measure);
                  return (
                    <tr key={r.title}>
                      <td data-label="Mốc">{r.hours > 0 ? `≥ ${r.hours} giờ` : 'Ngay sau khi huỷ'}</td>
                      <td data-label="Nội dung">{r.title}</td>
                      <td data-label="Điều kiện">{r.cond || (r.needsFault ? 'Phụ thuộc nguyên nhân do hãng.' : 'Xem điều kiện chung bên dưới.')}</td>
                      <td data-label="Nguồn">NĐ 208/2026, {r.cite}</td>
                      <td data-label="Với chuyến của bạn"><span className={`pill pill-${st.tone}`}>{st.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="plain-list" style={{ marginTop: '16px' }}>
            {RIGHTS.passengerConditions.map((c) => <li key={c}>{c}</li>)}
            <li>{RIGHTS.exemptionNote}</li>
          </ul>
          <details className="details" style={{ marginTop: '14px' }}>
            <summary style={{ fontWeight: '700', color: '#1262e8', cursor: 'pointer' }}>Bồi thường ứng trước (chuyến nội địa, thông tin tham khảo)</summary>
            <table className="mini-table" style={{ marginTop: '10px' }}><tbody>{RIGHTS.compensationDomestic.map((c) => <tr key={c.label}><td>{c.label}</td><td>{c.amount}</td></tr>)}</tbody></table>
            <p className="muted" style={{ marginTop: '8px' }}>Theo Thông tư 48/2026/TT-BXD Điều 5. Chỉ áp dụng khi chậm do lỗi người vận chuyển và không thuộc trường hợp miễn trừ; Airrest không xác định điều này.</p>
          </details>
        </>
      )}
      <SourceLine>
        Nguồn: {RIGHTS.sources.map((s, i) => <span key={s.id}>{i > 0 && '; '}<a href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a></span>)}. Hiệu lực từ {RIGHTS.effectiveFrom}; truy cập {RIGHTS.accessed}.
      </SourceLine>
    </section>
  );
}

// M1 — Tình trạng chuyến bay + Quyền lợi (MB-02, MB-03, MB-20).
export default function Status() {
  const { state, dispatch } = useApp();
  const { flight, simNow } = state;
  const ontime = flight.status === 'ontime';
  return (
    <>
      <ScreenTitle kicker="Bước 1" title="Tình trạng chuyến bay của bạn">Xem tình hình, thông tin quyền lợi tham khảo và chọn bước tiếp theo.</ScreenTitle>
      <RightsPanel flight={flight} simNow={simNow} />
      {ontime ? (
        <Notice tone="ok" title="Chuyến bay đang đúng giờ">Chưa cần tìm nơi nghỉ. Nếu giờ bay thay đổi, thẻ trạng thái phía trên sẽ báo cho bạn.</Notice>
      ) : (
        <div className="airrest-card actions-card card">
          <div style={{ marginBottom: '16px' }}>
            <span className="section-kicker">Lựa chọn cho hành khách</span>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '4px 0 0' }}>Bước tiếp theo</h2>
          </div>
          <div className="action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'advice' })} style={{ borderRadius: '12px', minHeight: '48px', fontWeight: '700' }}><BedDouble size={18} aria-hidden="true" /> Gợi ý: ở lại hay đi nghỉ <ArrowRight size={16} aria-hidden="true" /></button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'go', screen: 'stays' })} style={{ borderRadius: '12px', minHeight: '48px', fontWeight: '700', border: '1px solid #cbd5e1' }}><Search size={18} aria-hidden="true" /> Tìm nơi nghỉ còn nhận khách</button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'go', screen: 'request' })} style={{ borderRadius: '12px', minHeight: '48px', fontWeight: '700', border: '1px solid #cbd5e1' }}><FileText size={18} aria-hidden="true" /> Theo dõi & Đề nghị hỗ trợ</button>
          </div>
          <p className="muted" style={{ marginTop: '16px', fontSize: '12.5px' }}>“Đề nghị hãng hỗ trợ” chỉ là mô phỏng trong Airrest, không gửi tới hãng thật và không phải điều kiện để bạn được hưởng quyền lợi.</p>
        </div>
      )}
    </>
  );
}
