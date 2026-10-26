import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Info, List, Map as MapIcon, Plane } from 'lucide-react';
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
    <div className="map-filters" role="group" aria-label="Bộ lọc và sắp xếp">
      <span className="filter-ico"><Filter size={15} aria-hidden="true" /></span>
      {CHIPS.map((c) => (
        <button key={c.id} type="button" className={`chip ${chips.includes(c.id) ? 'on' : ''}`} aria-pressed={chips.includes(c.id)} onClick={() => dispatch({ type: 'toggleChip', id: c.id })}>{c.label}</button>
      ))}
      <span className="filter-sep" aria-hidden="true" />
      {[['nearest', 'Gần nhất'], ['rating', 'Xếp hạng']].map(([k, l]) => (
        <button key={k} type="button" className={`chip chip-sort ${sort === k ? 'on' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
      ))}
      {chips.length > 0 && <button type="button" className="link-btn" onClick={() => dispatch({ type: 'clearChips' })}>Bỏ lọc</button>}
    </div>
  );

  const listCol = (
    <div className="stays-list">
      <section className="banner banner-s" aria-labelledby="home-h">
        <div className="banner-line">
          <div>
            <h1 id="home-h">Còn nhận khách đêm nay</h1>
            <span className="kicker kicker-light">Nơi nghỉ quanh {airportLabel}</span>
          </div>
        </div>
        <dl className="banner-stats banner-stats-s">
          <div><dt>Đang nhận khách</dt><dd data-testid="open-count">{data.s === 'ok' ? open.length : '…'}</dd></div>
          <div><dt>Giờ mô phỏng</dt><dd>{fmtTime(simNow)}</dd></div>
        </dl>
        <div className="banner-actions">
          {!flight && (
            <div className="seg" role="group" aria-label="Chọn sân bay">
              {AIRPORTS.map((a) => <button key={a.id} type="button" className={airport === a.id ? 'on' : ''} aria-pressed={airport === a.id} onClick={() => dispatch({ type: 'setBrowseAirport', airport: a.id })}>{a.id}</button>)}
            </div>
          )}
          {flight
            ? <span className="banner-flight"><Plane size={14} aria-hidden="true" /> Theo chuyến {flight.code}</span>
            : <button type="button" className="btn btn-light btn-sm" onClick={() => dispatch({ type: 'goLookup' })} data-testid="enter-flight"><Plane size={14} aria-hidden="true" /> Nhập chuyến bay của bạn</button>}
        </div>
      </section>

      {!flight && <p className="browse-note" role="note"><Info size={14} aria-hidden="true" /> Bạn đang ở chế độ duyệt: giờ mô phỏng {fmtTime(simNow)}. Nhập chuyến bay để tính giờ nghỉ và đặt chỗ.</p>}
      {notice === 'roomGone' && (
        <Notice tone="warn" title="Phòng vừa hết đúng lúc bạn xác nhận" onClose={() => dispatch({ type: 'clearNotice' })}>
          Không có mã đặt chỗ nào được tạo. Hãy chọn một nơi khác trong danh sách bên dưới (đã loại nơi vừa hết phòng).
        </Notice>
      )}
      {request?.switchedAt != null && (
        <Notice tone="info" title="Bạn đã chuyển sang tự chi trả">Mã yêu cầu <strong>{request.code}</strong> và trạng thái trước đó được giữ lại. Bộ lọc hiện tại vẫn được áp dụng.</Notice>
      )}

      <div className="section-head">
        <h2>Nơi nghỉ gần sân bay nhất</h2>
        <SimBadge />
      </div>
      {data.s === 'loading' && <Loading label="Đang tải danh sách nơi nghỉ…" />}
      {data.s === 'error' && <ErrorBox onRetry={load}>Không tải được danh sách nơi nghỉ mô phỏng. Bộ lọc của bạn vẫn được giữ.</ErrorBox>}
      {data.s === 'ok' && (
        <>
          <p className="muted" data-testid="result-count" role="status">
            {filtered.length > 0 ? `Hiển thị ${shown.length} trong ${filtered.length} nơi đang nhận khách` : ''} · Dữ liệu cập nhật lúc {fmtTime(data.fetchedAt)} (mô phỏng){staleFetch ? ' — có thể đã cũ, cần xác nhận lại' : ''}
          </p>
          {filtered.length === 0 ? (
            <EmptyBox title="Không có nơi nghỉ phù hợp" actions={<>
              {chips.length > 0 && <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'clearChips' })}>Bỏ bộ lọc</button>}
              <button type="button" className="btn" onClick={() => dispatch({ type: 'go', screen: 'terminal' })}>Xem thông tin nhà ga</button>
            </>}>
              {chips.length > 0 ? 'Không có nơi nào thoả bộ lọc đang bật tại giờ mô phỏng này.' : 'Hiện không có nơi nào còn phòng và đang nhận khách tại giờ mô phỏng này.'}
            </EmptyBox>
          ) : (
            <div className="grid-list">{shown.map((p, i) => <PropertyCard key={p.id} p={p} now={simNow} nearest={i === 0} selected={propertyId === p.id} onOpen={openProperty} />)}</div>
          )}
          {!showAll && filtered.length > shown.length && <button type="button" className="btn btn-block" onClick={() => dispatch({ type: 'showAll' })}>Xem thêm {filtered.length - shown.length} nơi</button>}
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
      {!hideList && <div className={`col-list ${bp === 'mobile' && tab !== 'list' ? 'is-hidden' : ''}`}>{bp === 'mobile' && filterRow}{listCol}</div>}
      {showDetail && <aside className="col-detail" aria-label="Chi tiết nơi nghỉ" data-testid="detail-panel"><Detail asPanel /></aside>}
      <div className={`col-map ${bp === 'mobile' && tab !== 'map' ? 'is-hidden' : ''}`}>{mapCol}</div>
    </div>
  );
}
