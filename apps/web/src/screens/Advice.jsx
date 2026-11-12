import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BedDouble, Clock3, Hotel } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM } from '../config/simulation';
import { searchProperties } from '../mock/service';
import { isOpen, restPlan } from '../lib/domain';
import { fmtDateTime, fmtDuration, fmtTime } from '../lib/time';
import { ErrorBox, Loading, Notice, ScreenTitle } from '../components/Common';

// M2 — Gợi ý ở lại hay đi nghỉ (MB-04: FR-006, FR-007).
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
      <ScreenTitle kicker="Bước 2" title="Ở lại sân bay hay đi nghỉ?">
        Hệ thống tính thời gian nghỉ thực tế dựa trên giờ bay mới và nơi nghỉ gần nhất đang nhận khách.
      </ScreenTitle>
      {data.s === 'loading' && <Loading label="Đang tính thời gian nghỉ…" />}
      {data.s === 'error' && <ErrorBox onRetry={load}>Không tải được dữ liệu nơi nghỉ mô phỏng.</ErrorBox>}
      {data.s === 'ok' && (
        <section className="airrest-card card" aria-labelledby="rest-h" data-testid="rest-panel">
          <div className="airrest-card-head">
            <div>
              <span className="section-kicker">Phân tích thời gian</span>
              <h2 id="rest-h" style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '4px 0 0' }}>
                Thời gian nghỉ thực tế (ước tính mô phỏng)
              </h2>
            </div>
            <Clock3 size={20} style={{ color: '#1262e8' }} />
          </div>

          {flight.status === 'cancelled' && <Notice tone="warn" title="Chuyến bay đã huỷ">Chưa có giờ bay mới nên chưa tính được thời gian nghỉ.</Notice>}
          {flight.status !== 'cancelled' && flight.newDep == null && <Notice tone="warn" title="Chưa biết giờ bay mới">Chưa tính được thời gian nghỉ. Hãy cân nhắc nơi huỷ miễn phí hoặc thuê theo giờ và kiểm tra lại thông tin chuyến bay (nút “Làm mới” ở thẻ trạng thái).</Notice>}
          {!nearest && flight.newDep != null && <Notice tone="warn" title="Hiện không có nơi nghỉ nào đang nhận khách">Không tính được thời gian đi lại. Bạn có thể xem thông tin nhà ga hoặc quay lại sau.</Notice>}
          {plan && (
            <>
              <dl className="breakdown" data-testid="rest-breakdown" style={{ margin: '18px 0' }}>
                <div><dt>Giờ bay mới</dt><dd>{fmtDateTime(plan.dep)}</dd></div>
                <div><dt>Giờ có mặt tại sân bay</dt><dd>{fmtDateTime(plan.arriveAirport)} <small>(trước giờ bay {SIM.arrivalLeadMin} phút — tham số mô phỏng)</small></dd></div>
                <div><dt>Thời gian đi tới {nearest.name}</dt><dd>{nearest.travelMin} phút</dd></div>
                <div><dt>Đến nơi nghỉ lúc</dt><dd>{fmtTime(plan.reachProperty)}</dd></div>
                <div><dt>Phải rời nơi nghỉ lúc</dt><dd>{fmtTime(plan.leaveProperty)} <small>(gồm dự phòng {SIM.leaveBufferMin} phút)</small></dd></div>
                <div className="highlight" style={{ background: '#eff6ff', borderRadius: '12px', padding: '12px 14px' }}>
                  <dt style={{ fontWeight: '700', color: '#1e40af' }}>Thời gian nghỉ ước tính</dt>
                  <dd data-testid="rest-minutes" style={{ fontSize: '20px', fontWeight: '800', color: '#1262e8' }}>
                    {plan.restMin > 0 ? fmtDuration(plan.restMin) : 'Không còn thời gian nghỉ'}
                  </dd>
                </div>
              </dl>
              {plan.restMin < SIM.restWarnMin && <Notice tone="warn" title="Thời gian nghỉ rất ngắn">Có thể không nên rời sân bay. Bạn tự cân nhắc.</Notice>}
              <p className="muted" style={{ fontSize: '12.5px', marginTop: '12px' }}>
                Công thức và tham số đang là giả định mô phỏng, chờ Product Owner chốt (OQ-04, D-02). Đây không phải quyết định hay lời khuyên pháp lý.
              </p>
            </>
          )}
        </section>
      )}

      {/* Hai lựa chọn */}
      <section aria-label="Hai lựa chọn" className="branches" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
        <article className="airrest-card card branch" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '14px', background: '#eff6ff', color: '#1262e8', marginBottom: '14px' }}>
            <Hotel size={24} aria-hidden="true" />
          </span>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '0 0 8px' }}>Đi nghỉ ngoài sân bay</h2>
          <p style={{ color: '#64748b', fontSize: '13.5px', lineHeight: '1.6', margin: '0 0 20px', flex: 1 }}>
            Xem danh sách các nơi nghỉ gần sân bay còn nhận khách, sắp theo thời gian di chuyển.
          </p>
          <button type="button" className="hero-submit-btn" onClick={() => dispatch({ type: 'go', screen: 'stays' })} style={{ margin: 0 }}>
            Xem nơi nghỉ <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: 'auto' }} />
          </button>
        </article>

        <article className="airrest-card card branch" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '14px', background: '#f8fafc', color: '#475569', marginBottom: '14px' }}>
            <BedDouble size={24} aria-hidden="true" />
          </span>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#062253', margin: '0 0 8px' }}>Ở lại sân bay</h2>
          <p style={{ color: '#64748b', fontSize: '13.5px', lineHeight: '1.6', margin: '0 0 20px', flex: 1 }}>
            Xem thông tin hộp ngủ và dịch vụ tại các nhà ga Nội Bài & Tân Sơn Nhất.
          </p>
          <button type="button" className="btn btn-block" onClick={() => dispatch({ type: 'go', screen: 'terminal' })} style={{ minHeight: '50px', borderRadius: '14px', fontWeight: '700', border: '1px solid #cbd5e1' }}>
            Xem thông tin nhà ga <ArrowRight size={16} aria-hidden="true" style={{ marginLeft: 'auto' }} />
          </button>
        </article>
      </section>
    </>
  );
}
