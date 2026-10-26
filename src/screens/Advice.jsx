import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BedDouble, Hotel } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM } from '../config/simulation';
import { searchProperties } from '../mock/service';
import { isOpen, restPlan } from '../lib/domain';
import { fmtDateTime, fmtDuration, fmtTime } from '../lib/time';
import { ErrorBox, Loading, Notice, ScreenTitle } from '../components/Common';

// M2 — Gợi ý ở lại hay đi nghỉ (MB-04: FR-006, FR-007). Công thức đang chờ PO chốt (OQ-04); tham số ở src/config/simulation.js.
export default function Advice() {
  const { state, dispatch } = useApp();
  const { flight, simNow } = state;
  const [data, setData] = useState({ s: 'loading' });
  const load = useCallback(async () => {
    setData({ s: 'loading' });
    try { setData({ s: 'ok', ...(await searchProperties({ airport: flight.origin, now: simNow })) }); }
    catch { setData({ s: 'error' }); }
  }, [flight.origin, simNow]);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [flight.origin]);

  const nearest = data.s === 'ok' ? data.items.filter((p) => isOpen(p, simNow)).sort((a, b) => a.travelMin - b.travelMin)[0] : null;
  const plan = nearest ? restPlan(flight, nearest, simNow) : null;

  return (
    <>
      <ScreenTitle kicker="Bước 2" title="Ở lại sân bay hay đi nghỉ?">Hệ thống tính thời gian nghỉ thực tế dựa trên giờ bay mới và nơi nghỉ gần nhất đang nhận khách.</ScreenTitle>
      {data.s === 'loading' && <Loading label="Đang tính thời gian nghỉ…" />}
      {data.s === 'error' && <ErrorBox onRetry={load}>Không tải được dữ liệu nơi nghỉ mô phỏng.</ErrorBox>}
      {data.s === 'ok' && (
        <section className="card" aria-labelledby="rest-h" data-testid="rest-panel">
          <h2 id="rest-h">Thời gian nghỉ thực tế (ước tính mô phỏng)</h2>
          {flight.status === 'cancelled' && <Notice tone="warn" title="Chuyến bay đã huỷ">Chưa có giờ bay mới nên chưa tính được thời gian nghỉ.</Notice>}
          {flight.status !== 'cancelled' && flight.newDep == null && <Notice tone="warn" title="Chưa biết giờ bay mới">Chưa tính được thời gian nghỉ. Hãy cân nhắc nơi huỷ miễn phí hoặc thuê theo giờ và kiểm tra lại thông tin chuyến bay (nút “Làm mới” ở thẻ trạng thái).</Notice>}
          {!nearest && flight.newDep != null && <Notice tone="warn" title="Hiện không có nơi nghỉ nào đang nhận khách">Không tính được thời gian đi lại. Bạn có thể xem thông tin nhà ga hoặc quay lại sau.</Notice>}
          {plan && (
            <>
              <dl className="breakdown" data-testid="rest-breakdown">
                <div><dt>Giờ bay mới</dt><dd>{fmtDateTime(plan.dep)}</dd></div>
                <div><dt>Giờ có mặt tại sân bay</dt><dd>{fmtDateTime(plan.arriveAirport)} <small>(trước giờ bay {SIM.arrivalLeadMin} phút — tham số mô phỏng)</small></dd></div>
                <div><dt>Thời gian đi tới {nearest.name}</dt><dd>{nearest.travelMin} phút</dd></div>
                <div><dt>Đến nơi nghỉ lúc</dt><dd>{fmtTime(plan.reachProperty)}</dd></div>
                <div><dt>Phải rời nơi nghỉ lúc</dt><dd>{fmtTime(plan.leaveProperty)} <small>(gồm dự phòng {SIM.leaveBufferMin} phút)</small></dd></div>
                <div className="highlight"><dt>Thời gian nghỉ ước tính</dt><dd data-testid="rest-minutes">{plan.restMin > 0 ? fmtDuration(plan.restMin) : 'Không còn thời gian nghỉ'}</dd></div>
              </dl>
              {plan.restMin < SIM.restWarnMin && <Notice tone="warn" title="Thời gian nghỉ rất ngắn">Có thể không nên rời sân bay. Bạn tự cân nhắc.</Notice>}
              <p className="muted">Công thức và tham số đang là giả định mô phỏng, chờ Product Owner chốt (OQ-04, D-02). Đây không phải quyết định hay lời khuyên pháp lý.</p>
            </>
          )}
        </section>
      )}
      <section aria-label="Hai lựa chọn" className="branches">
        <article className="card branch">
          <Hotel size={26} aria-hidden="true" /><h2>Đi nghỉ ngoài sân bay</h2>
          <p>Xem các nơi còn nhận khách, sắp theo thời gian di chuyển.</p>
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'stays' })}>Xem nơi nghỉ <ArrowRight size={16} aria-hidden="true" /></button>
        </article>
        <article className="card branch">
          <BedDouble size={26} aria-hidden="true" /><h2>Ở lại sân bay</h2>
          <p>Xem thông tin nhà ga. Một phần dữ liệu chưa được xác minh.</p>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'go', screen: 'terminal' })}>Xem thông tin nhà ga <ArrowRight size={16} aria-hidden="true" /></button>
        </article>
      </section>
    </>
  );
}
