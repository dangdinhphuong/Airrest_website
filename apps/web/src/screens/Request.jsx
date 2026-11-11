import React from 'react';
import { ArrowLeft, BellRing, Send, Shuffle } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM } from '../config/simulation';
import { RIGHTS } from '../config/rights';
import { deriveRequest, REQ_STATUS } from '../lib/request';
import { delayMinutes, leaveTime, receptionLabel } from '../lib/domain';
import { fmtDateTime, fmtDuration, fmtTime, money } from '../lib/time';
import { Notice, ScreenTitle, SimBadge } from '../components/Common';

const TIMELINE = [
  ['waiting', 'Đang chờ hãng duyệt'], ['approved_waiting_property', 'Hãng duyệt — chờ cơ sở'], ['confirmed', 'Đã xác nhận phòng'],
];

// M9 — Đề nghị hãng hỗ trợ (MB-11…MB-14). Luồng L2 là CƠ CHẾ MÔ PHỎNG của Airrest; nghĩa vụ thuộc hãng (G-19).
// Tập trạng thái theo SRS mục 4.3 là ĐỀ XUẤT (OQ-08 đang Pending PO). Không có điều kiện chặn việc gửi (D-01 phương án A, chờ PO).
export default function Request() {
  const { state, dispatch } = useApp();
  const { flight, simNow, request } = state;
  const d = request ? deriveRequest(request, flight, simNow) : null;
  const delay = delayMinutes(flight);
  const measure = flight.status === 'cancelled' ? simNow - (flight.cancelledAt ?? flight.updatedAt) : delay;
  const changedAfter = request && flight.change && flight.change.at >= request.sentAt;
  const leave = d?.property ? leaveTime(flight, d.property) : null;

  return (
    <>
      <button type="button" className="link-btn back" onClick={() => dispatch({ type: 'go', screen: 'status' })}><ArrowLeft size={16} aria-hidden="true" /> Về tình trạng chuyến bay</button>
      <ScreenTitle kicker="Luồng đề nghị hãng hỗ trợ (mô phỏng)" title="Đề nghị hãng hỗ trợ chỗ nghỉ" />
      <Notice tone="info" title="Đây là mô phỏng trong Airrest">
        Đề nghị này không được gửi tới hãng hàng không thật. Nghĩa vụ ăn, nghỉ của hãng (nếu có) thuộc về hãng theo văn bản pháp luật và không phụ thuộc việc bạn gửi đề nghị trên Airrest.
      </Notice>

      {!request && (
        <>
          <section className="card" aria-labelledby="cond-h">
            <h2 id="cond-h">Điều kiện áp dụng nghĩa vụ nơi nghỉ (thông tin tham khảo)</h2>
            <ul className="plain-list">
              <li>Chuyến bay chậm từ 6 giờ trở lên, hoặc hủy chuyến và chờ từ 6 giờ trở lên tại cảng (Nghị định 208/2026, Điều 36 khoản 7; Điều 39 khoản 3c).</li>
              {RIGHTS.passengerConditions.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="muted" data-testid="eligibility-info">
              Theo dữ liệu mô phỏng của chuyến bạn: {measure != null ? `thời gian ${flight.status === 'cancelled' ? 'chờ' : 'chậm'} hiện là ${fmtDuration(measure)}` : 'chưa xác định được thời gian chậm'}. Thông tin này chỉ để tham khảo, không phải kết luận bạn có hay không có quyền lợi.
            </p>
            <SourcesNote />
          </section>
          <button type="button" className="btn btn-primary btn-block" onClick={() => dispatch({ type: 'sendRequest' })} data-testid="send-request"><Send size={18} aria-hidden="true" /> Gửi đề nghị (mô phỏng)</button>
        </>
      )}

      {request && d && (
        <section className="card" aria-labelledby="req-h" data-testid="request-panel">
          <div className="card-head">
            <h2 id="req-h">Yêu cầu <span data-testid="request-code">{request.code}</span></h2>
            <SimBadge>Mô phỏng</SimBadge>
          </div>
          <p>Trạng thái: <span className={`pill pill-${REQ_STATUS[d.status].tone}`} data-testid="request-status">{REQ_STATUS[d.status].label}</span></p>
          <p className="muted">Gửi lúc {fmtTime(request.sentAt)} (giờ mô phỏng); đã chờ {fmtDuration(d.waited)}. Phản hồi của hãng và cơ sở là mô phỏng theo kịch bản của chuyến {request.flightCode}.</p>
          {changedAfter && <Notice tone="warn" title="Giờ bay đã đổi">{leave != null ? `Giờ rời nơi nghỉ được tính lại: ${fmtDateTime(leave)}. ` : ''}Bạn có thể giữ yêu cầu này hoặc chuyển sang tự chi trả.</Notice>}

          {d.status !== 'switched' && d.status !== 'airline_rejected' && (
            <ol className="timeline" aria-label="Tiến trình yêu cầu">
              {TIMELINE.map(([k, l]) => {
                const idx = TIMELINE.findIndex((t) => t[0] === d.status); const mine = TIMELINE.findIndex((t) => t[0] === k);
                const cur = d.status === 'property_rejected' ? k === 'approved_waiting_property' : k === d.status;
                return <li key={k} className={cur ? 'cur' : idx >= 0 && mine < idx ? 'done' : ''}>{l}</li>;
              })}
            </ol>
          )}

          {d.status === 'waiting' && d.expired && (
            <Notice tone="warn" title="Quá thời gian chờ (mô phỏng)">Đã quá {SIM.requestExpiryMin} phút chưa có phản hồi. Bạn có thể tiếp tục chờ hoặc chuyển sang tự chi trả.</Notice>
          )}
          {d.status === 'airline_rejected' && (
            <Notice tone="error" title="Hãng từ chối (mô phỏng)"><span data-testid="reject-reason">Lý do: {d.reason}</span> Việc từ chối này là kịch bản mô phỏng, không phải quyết định pháp lý. Bạn vẫn có thể tự tìm chỗ nghỉ.</Notice>
          )}
          {d.status === 'approved_waiting_property' && d.property && <p>Cơ sở được đề xuất: <strong>{d.property.name}</strong> ({d.property.travelMin} phút đi xe). Đang chờ cơ sở xác nhận.</p>}
          {d.status === 'property_rejected' && (
            <div data-testid="alternatives">
              <Notice tone="warn" title="Cơ sở từ chối (hết phòng)">Dưới đây là tối đa 3 cơ sở thay thế còn nhận khách, sắp theo thời gian di chuyển.</Notice>
              <ul className="alt-list">
                {d.alts.map((a) => (
                  <li key={a.id} className="alt">
                    <div><strong>{a.name}</strong><span className="muted">{a.travelMin} phút đi xe · {receptionLabel(a, simNow)} · {money(a.price)} (mô phỏng)</span></div>
                    <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'pickAlt', id: a.id })}>Chọn cơ sở này</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.status === 'confirmed' && d.property && (
            <div data-testid="confirmed">
              <Notice tone="ok" title="Đã xác nhận phòng (mô phỏng)">Mã xác nhận <strong data-testid="confirm-code">{d.confirmCode}</strong> — {d.property.name}, {d.property.area}. Nhận phòng dự kiến {fmtDateTime(simNow + d.property.travelMin)}.</Notice>
              <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'reminder' })}><BellRing size={18} aria-hidden="true" /> Nhắc giờ quay lại sân bay</button>
            </div>
          )}
          {d.status === 'switched' && <Notice tone="info" title="Đã chuyển sang tự chi trả">Mã yêu cầu {request.code} và trạng thái trước khi chuyển (“{REQ_STATUS[d.before].label}”) được giữ lại.</Notice>}

          <div className="row-actions">
            {d.status !== 'switched' && (
              <button type="button" className="btn" onClick={() => dispatch({ type: 'switchSelf' })} data-testid="switch-self"><Shuffle size={16} aria-hidden="true" /> {d.status === 'airline_rejected' ? 'Tự tìm chỗ nghỉ' : 'Chuyển sang tự chi trả'}</button>
            )}
            {d.status === 'switched' && <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Mở danh sách nơi nghỉ</button>}
          </div>
          <p className="muted">Dùng “Công cụ mô phỏng” ở góc màn hình để tua giờ mô phỏng và xem các phản hồi tiếp theo.</p>
        </section>
      )}
    </>
  );
}

function SourcesNote() {
  return (
    <p className="source-line">Nguồn: {RIGHTS.sources.map((s, i) => <span key={s.id}>{i > 0 && '; '}<a href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a></span>)}. Hiệu lực từ {RIGHTS.effectiveFrom}; truy cập {RIGHTS.accessed}. Nội dung chờ Product Owner phê duyệt (MB-03 Blocked).</p>
  );
}
