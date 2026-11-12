import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { BedDouble, Filter, Info, List, Map as MapIcon, Plane } from 'lucide-react';
import { useApp } from '../state/store';
import { SIM } from '../config/simulation';
import { searchProperties } from '../mock/service';
import { CHIPS, isOpen } from '../lib/domain';
import { fmtTime } from '../lib/time';
import { AIRPORTS } from '../components/Layout';
import { EmptyBox, ErrorBox, Loading, Notice, SimBadge } from '../components/Common';
import PropertyCard from '../components/PropertyCard';
// Leaflet + CSS chỉ tải khi cần dựng bản đồ (giảm gói JS tải đầu).
const StaysMap = lazy(() => import('../components/StaysMap'));
import Detail from './Detail';
import useBreakpoint from '../lib/useBreakpoint';

// M3 — Trang chủ kiểu Couppa: nơi nghỉ quanh sân bay, còn nhận khách (MB-05: FR-008, FR-009, FR-010).
// Có thể duyệt khi chưa có chuyến bay (giờ mô phỏng mặc định); đặt chỗ yêu cầu nhập chuyến bay.
export default function Stays() {
  const { state, dispatch } = useApp();
  const { flight, simNow, chips, showAll, notice, request, browseAirport, propertyId } = state;
  const airport = flight ? flight.origin : browseAirport;
  const airportLabel = AIRPORTS.find((a) => a.id === airport)?.label || airport;
  const bp = useBreakpoint();
  const [tab, setTab] = useState('list');
  const [mapSeen, setMapSeen] = useState(false); // mobile: chỉ dựng bản đồ khi mở tab Bản đồ lần đầu
  const [sort, setSort] = useState('nearest');
  const [data, setData] = useState({ s: 'loading' });
  const load = useCallback(async () => {
    setData({ s: 'loading' });
    try { setData({ s: 'ok', ...(await searchProperties({ airport, now: simNow })) }); }
    catch { setData({ s: 'error' }); }
  }, [airport, simNow]);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [airport]);

  const byTravel = (a, b) => a.travelMin - b.travelMin || a.price - b.price;
  const bySort = sort === 'rating' ? (a, b) => Number(b.rating) - Number(a.rating) || byTravel(a, b) : byTravel;
  const open = useMemo(() => (data.s === 'ok' ? data.items.filter((p) => isOpen(p, simNow)).sort(bySort) : []), [data, simNow, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => open.filter((p) => chips.every((id) => CHIPS.find((c) => c.id === id).test(p))), [open, chips]);
  const shown = showAll ? filtered : filtered.slice(0, SIM.topResults);
  const staleFetch = data.s === 'ok' && simNow - data.fetchedAt >= SIM.staleAfterMin;
  const openProperty = useCallback((id) => dispatch({ type: bp === 'mobile' ? 'openProperty' : 'selectProperty', id }), [dispatch, bp]);
  const selectOnMap = useCallback((id) => dispatch({ type: 'selectProperty', id }), [dispatch]);
  const showDetail = bp !== 'mobile' && !!propertyId;
  const hideList = bp === 'medium' && showDetail; // màn vừa: chi tiết thay danh sách (có nút đóng)
  const filterRow = (
    <div className="map-filters" role="group" aria-label="Bộ lọc và sắp xếp" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '14px 0' }}>
      <button
        type="button"
        className={`chip ${chips.length === 0 ? 'on' : ''}`}
        onClick={() => dispatch({ type: 'clearChips' })}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <Filter size={14} /> Phù hợp nhất
      </button>
      {CHIPS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip ${chips.includes(c.id) ? 'on' : ''}`}
          aria-pressed={chips.includes(c.id)}
          onClick={() => dispatch({ type: 'toggleChip', id: c.id })}
        >
          {c.label}
        </button>
      ))}
      <span className="filter-sep" aria-hidden="true" />
      {[['nearest', 'Gần nhất'], ['rating', 'Xếp hạng cao']].map(([k, l]) => (
        <button
          key={k}
          type="button"
          className={`chip chip-sort ${sort === k ? 'on' : ''}`}
          aria-pressed={sort === k}
          onClick={() => setSort(k)}
        >
          {l}
        </button>
      ))}
      {chips.length > 0 && <button type="button" className="link-btn" onClick={() => dispatch({ type: 'clearChips' })}>Bỏ lọc</button>}
    </div>
  );

  const listCol = (
    <div className="stays-list">
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px', marginBottom: '20px', boxShadow: '0 4px 16px rgba(16, 32, 58, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <span className="section-kicker">Nơi nghỉ gần sân bay</span>
            <h1 id="home-h" style={{ fontSize: '26px', fontWeight: '800', color: '#062253', marginTop: '4px' }}>
              Phòng đang mở nhận yêu cầu
            </h1>
            <p style={{ color: '#64748b', fontSize: '13.5px', margin: '6px 0 0' }}>
              Danh sách cơ sở quanh {airportLabel} còn nhận khách trong khung giờ mô phỏng {fmtTime(simNow)}.
              <span data-testid="open-count" style={{ display: 'none' }}>{data.s === 'ok' ? open.length : '…'}</span>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!flight && (
              <div className="seg" role="group" aria-label="Chọn sân bay" style={{ background: '#f1f5f9', padding: '3px', borderRadius: '12px' }}>
                {AIRPORTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    style={{
                      background: airport === a.id ? '#1262e8' : 'transparent',
                      color: airport === a.id ? '#ffffff' : '#64748b',
                      borderRadius: '9px',
                      padding: '6px 14px',
                      fontWeight: '700',
                      fontSize: '12.5px',
                    }}
                    onClick={() => dispatch({ type: 'setBrowseAirport', airport: a.id })}
                  >
                    {a.id}
                  </button>
                ))}
              </div>
            )}
            {flight ? (
              <span className="banner-flight" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                <Plane size={14} aria-hidden="true" /> Chuyến {flight.code}
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => dispatch({ type: 'goLookup' })}
                data-testid="enter-flight"
                style={{ borderRadius: '10px' }}
              >
                <Plane size={14} aria-hidden="true" /> Nhập chuyến bay
              </button>
            )}
          </div>
        </div>

        {filterRow}
      </div>

      {!flight && (
        <p className="browse-note" role="note" style={{ borderRadius: '12px', padding: '10px 14px' }}>
          <Info size={16} aria-hidden="true" /> Bạn đang ở chế độ duyệt (giờ mô phỏng {fmtTime(simNow)}). Nhập chuyến bay để tính thời gian nghỉ và đặt phòng.
        </p>
      )}
      {notice === 'roomGone' && (
        <Notice tone="warn" title="Phòng vừa hết đúng lúc bạn xác nhận" onClose={() => dispatch({ type: 'clearNotice' })}>
          Không có mã đặt chỗ nào được tạo. Hãy chọn một nơi khác trong danh sách bên dưới (đã loại nơi vừa hết phòng).
        </Notice>
      )}
      {request?.switchedAt != null && (
        <Notice tone="info" title="Bạn đã chuyển sang tự chi trả">Mã yêu cầu <strong>{request.code}</strong> và trạng thái trước đó được giữ lại. Bộ lọc hiện tại vẫn được áp dụng.</Notice>
      )}

      {data.s === 'loading' && <Loading label="Đang tải danh sách nơi nghỉ…" />}
      {data.s === 'error' && <ErrorBox onRetry={load}>Không tải được danh sách nơi nghỉ mô phỏng. Bộ lọc của bạn vẫn được giữ.</ErrorBox>}
      {data.s === 'ok' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px', fontSize: '13px', color: '#64748b' }}>
            <span data-testid="result-count" role="status" style={{ fontWeight: '600' }}>
              {filtered.length > 0 ? `Hiển thị ${shown.length} / ${filtered.length} nơi nghỉ khả dụng` : ''}
            </span>
            <span style={{ fontSize: '12px' }}>Cập nhật lúc {fmtTime(data.fetchedAt)} · Mô phỏng</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '24px', padding: '48px 24px', textAlign: 'center', margin: '16px 0' }}>
              <BedDouble size={36} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#062253' }}>Chưa có phòng phù hợp</h3>
              <p style={{ color: '#64748b', fontSize: '13.5px', marginTop: '6px', maxWidth: '420px', marginInline: 'auto' }}>
                Hãy đổi sân bay hoặc bỏ bớt các bộ lọc để tìm thêm lựa chọn nơi nghỉ khác.
              </p>
              {chips.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => dispatch({ type: 'clearChips' })}
                  style={{ marginTop: '16px', borderRadius: '12px' }}
                >
                  Bỏ tất cả bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="airrest-hotel-grid" style={{ marginBottom: '24px' }}>
              {shown.map((p, i) => (
                <PropertyCard
                  key={p.id}
                  p={p}
                  now={simNow}
                  nearest={i === 0}
                  selected={propertyId === p.id}
                  onOpen={openProperty}
                />
              ))}
            </div>
          )}

          {!showAll && filtered.length > shown.length && (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => dispatch({ type: 'showAll' })}
              style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#062253', fontWeight: '700', borderRadius: '14px', minHeight: '46px', marginBottom: '20px' }}
            >
              Xem thêm {filtered.length - shown.length} nơi nghỉ khác
            </button>
          )}

          <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11.5px', color: '#64748b', textAlign: 'center', margin: '16px 0' }}>
            <Info size={14} /> Dữ liệu khách sạn, giá và tồn phòng là dữ liệu demo phục vụ nghiên cứu MVP.
          </p>
        </>
      )}
    </div>
  );

  useEffect(() => { if (tab === 'map') setMapSeen(true); }, [tab]);
  const mapCol = (bp !== 'mobile' || mapSeen || tab === 'map') && (
    <Suspense fallback={<div className="stays-map" data-testid="stays-map-loading" role="status" aria-label="Đang tải bản đồ" />}>
      <StaysMap airport={airport} items={filtered} selectedId={propertyId} onSelect={selectOnMap} onOpen={openProperty} active={bp !== 'mobile' || tab === 'map'}>
        {bp !== 'mobile' && filterRow}
      </StaysMap>
    </Suspense>
  );

  return (
    <div className={`stays-split bp-${bp} ${showDetail ? 'has-detail' : ''}`}>
      {bp === 'mobile' && (
        <div className="tabs-bar" role="tablist" aria-label="Chế độ xem">
          <button type="button" role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}><List size={16} aria-hidden="true" /> Danh sách</button>
          <button type="button" role="tab" aria-selected={tab === 'map'} className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}><MapIcon size={16} aria-hidden="true" /> Bản đồ</button>
        </div>
      )}
      {!hideList && <div className={`col-list ${bp === 'mobile' && tab !== 'list' ? 'is-hidden' : ''}`}>{listCol}</div>}
      {showDetail && <aside className="col-detail" aria-label="Chi tiết nơi nghỉ" data-testid="detail-panel"><Detail asPanel /></aside>}
      <div className={`col-map ${bp === 'mobile' && tab !== 'map' ? 'is-hidden' : ''}`}>{mapCol}</div>
    </div>
  );
}
