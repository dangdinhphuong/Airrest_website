import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CircleHelp,
  Clock3,
  Hotel,
  MapPin,
  MoonStar,
  Plane,
  PlaneLanding,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useApp } from '../state/store';
import { buildManualFlight, FLIGHT_CODE_RE, lookupFlight } from '../mock/service';
import { SAMPLE_CODES } from '../mock/flights';
import { dayOffsetOfIso, isoDate } from '../lib/time';
import { ErrorBox, Loading, Notice, SimBadge } from '../components/Common';

export default function Home() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState('flight'); // 'flight' | 'hotel'
  const [flightSubMode, setFlightSubMode] = useState('code'); // 'code' | 'manual'
  const [code, setCode] = useState(state.lookupPrefill || 'VN218');
  const [date, setDate] = useState(isoDate(0));
  const [airport, setAirport] = useState(state.browseAirport || 'HAN');
  const [guestCount, setGuestCount] = useState('2 khách');
  const [newTime, setNewTime] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState({ s: 'idle' });

  const submitCode = async (e) => {
    e?.preventDefault();
    const er = {};
    const c = code.trim().toUpperCase();
    if (!c) er.code = 'Nhập số hiệu chuyến bay, ví dụ VN218.';
    else if (!FLIGHT_CODE_RE.test(c)) er.code = 'Số hiệu gồm 2 chữ cái và 1–4 chữ số, ví dụ VN218.';
    const off = dayOffsetOfIso(date);
    if (!date || Number.isNaN(off)) er.date = 'Chọn ngày bay.';
    else if (off < -1 || off > 1) er.date = 'Chỉ tra cứu chuyến trong khoảng 1 ngày trước đến 1 ngày sau hôm nay.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setPhase({ s: 'loading' });
    try {
      const f = await lookupFlight({ code: c, dateIso: date });
      dispatch({ type: 'setFlight', flight: f });
    } catch (x) {
      setPhase({ s: 'error', kind: x.kind || 'service' });
    }
  };

  const submitManual = async (e) => {
    e?.preventDefault();
    const er = {};
    if (!unknown && !newTime) er.newTime = 'Nhập giờ bay mới hoặc chọn “Chưa biết giờ bay mới”.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setPhase({ s: 'loading' });
    try {
      const f = await buildManualFlight({ airport, newTime, schedTime, unknownTime: unknown });
      dispatch({ type: 'setFlight', flight: f });
    } catch (x) {
      setPhase({ s: 'error', kind: 'service', manual: true });
    }
  };

  const handleSearchHotel = (e) => {
    e?.preventDefault();
    dispatch({ type: 'setBrowseAirport', airport });
    dispatch({ type: 'go', screen: 'stays' });
  };

  const busy = phase.s === 'loading';

  return (
    <div className="home-screen-wrap">
      {state.pendingProperty && (
        <div style={{ marginBottom: '16px' }}>
          <Notice tone="info" title="Nhập chuyến bay để tiếp tục đặt chỗ">
            Nơi nghỉ bạn đã chọn sẽ được giữ lại sau khi tra cứu xong.
          </Notice>
        </div>
      )}

      {/* Hero Section phong cách AIRREST */}
      <section className="airrest-hero">
        <div className="airrest-hero-bg">
          <img src="/images/hanoi-night.jpg" alt="Hà Nội về đêm nhìn từ trên cao" />
        </div>
        <div className="airrest-hero-overlay" />

        <div className="airrest-hero-inner">
          <div className="airrest-hero-info">
            <span className="hero-tag">
              <Sparkles size={15} /> Đồng hành khi hành trình đổi kế hoạch
            </span>
            <h1 className="hero-headline">
              Chuyến bay gián đoạn.<br />
              <em>Giấc nghỉ thì không.</em>
            </h1>
            <p className="hero-desc">
              Kiểm tra chuyến bay, tìm phòng còn trống gần HAN hoặc SGN và gửi yêu cầu đặt chỗ mà không cần tạo tài khoản.
            </p>
            <div className="hero-badges-row">
              <span className="hero-badge-item">
                <ShieldCheck size={16} /> Không cần đăng nhập
              </span>
              <span className="hero-badge-item">
                <Clock3 size={16} /> Xử lý nhanh
              </span>
              <span className="hero-badge-item">
                <MoonStar size={16} /> Hỗ trợ xuyên đêm
              </span>
            </div>
          </div>

          {/* Form tìm kiếm nổi bật */}
          <div className="hero-search-card">
            <div className="search-card-head">
              <div>
                <span className="search-card-kicker">Bắt đầu tại đây</span>
                <h2 className="search-card-title">Bạn cần hỗ trợ thế nào?</h2>
              </div>
              <span className="demo-pill">Dữ liệu mô phỏng</span>
            </div>

            <div className="hero-search-tabs">
              <button
                type="button"
                className={activeTab === 'flight' ? 'active' : ''}
                onClick={() => { setActiveTab('flight'); setErrors({}); setPhase({ s: 'idle' }); }}
              >
                <PlaneLanding size={17} /> Chuyến bay
              </button>
              <button
                type="button"
                className={activeTab === 'hotel' ? 'active' : ''}
                onClick={() => { setActiveTab('hotel'); setErrors({}); setPhase({ s: 'idle' }); }}
              >
                <Hotel size={17} /> Tìm khách sạn
              </button>
            </div>

            {activeTab === 'flight' ? (
              <div>
                {/* Lựa chọn cách nhập: Có số hiệu vs Thủ công */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', fontSize: '12px' }}>
                  <button
                    type="button"
                    style={{
                      fontWeight: flightSubMode === 'code' ? '700' : '500',
                      color: flightSubMode === 'code' ? '#1262e8' : '#64748b',
                      textDecoration: flightSubMode === 'code' ? 'underline' : 'none',
                    }}
                    onClick={() => { setFlightSubMode('code'); setErrors({}); }}
                  >
                    Có số hiệu chuyến bay
                  </button>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <button
                    type="button"
                    style={{
                      fontWeight: flightSubMode === 'manual' ? '700' : '500',
                      color: flightSubMode === 'manual' ? '#1262e8' : '#64748b',
                      textDecoration: flightSubMode === 'manual' ? 'underline' : 'none',
                    }}
                    onClick={() => { setFlightSubMode('manual'); setErrors({}); }}
                  >
                    Nhập thủ công
                  </button>
                </div>

                {flightSubMode === 'code' ? (
                  <form onSubmit={submitCode} noValidate aria-busy={busy}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div className="hero-input-field">
                        <label htmlFor="hero-code">Số hiệu chuyến bay</label>
                        <div className="hero-input-box">
                          <Plane size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          <input
                            id="hero-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="Ví dụ: VN218"
                            maxLength={6}
                            autoComplete="off"
                          />
                        </div>
                        {errors.code && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{errors.code}</small>}
                      </div>

                      <div className="hero-input-field">
                        <label htmlFor="hero-date">Ngày bay</label>
                        <div className="hero-input-box">
                          <CalendarDays size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          <input
                            id="hero-date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </div>
                        {errors.date && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{errors.date}</small>}
                      </div>
                    </div>

                    {/* Danh sách chuyến mẫu bấm nhanh */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', margin: '8px 0 14px', fontSize: '12px', color: '#64748b' }}>
                      <span>Mẫu thử:</span>
                      {SAMPLE_CODES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="chip"
                          style={{ minHeight: '26px', padding: '2px 9px', fontSize: '11.5px', borderRadius: '6px' }}
                          onClick={() => { setCode(c); setDate(isoDate(0)); setErrors({}); }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>

                    <button type="submit" className="hero-submit-btn" disabled={busy}>
                      <Search size={18} /> {busy ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái'} <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
                    </button>
                  </form>
                ) : (
                  <form onSubmit={submitManual} noValidate aria-busy={busy}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div className="hero-input-field">
                        <label htmlFor="m-airport">Sân bay hiện tại</label>
                        <div className="hero-input-box">
                          <MapPin size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          <select id="m-airport" value={airport} onChange={(e) => setAirport(e.target.value)}>
                            <option value="HAN">Nội Bài (HAN)</option>
                            <option value="SGN">Tân Sơn Nhất (SGN)</option>
                          </select>
                        </div>
                      </div>

                      <div className="hero-input-field">
                        <label htmlFor="m-new">Giờ bay mới</label>
                        <div className="hero-input-box">
                          <Clock3 size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          <input
                            id="m-new"
                            type="time"
                            value={newTime}
                            disabled={unknown}
                            onChange={(e) => setNewTime(e.target.value)}
                          />
                        </div>
                        {errors.newTime && <small style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: '600' }}>{errors.newTime}</small>}
                      </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', margin: '8px 0 12px', color: '#475569', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={unknown}
                        onChange={(e) => {
                          setUnknown(e.target.checked);
                          if (e.target.checked) setNewTime('');
                          setErrors({});
                        }}
                      />
                      <span>Chưa biết giờ bay mới</span>
                    </label>

                    <button type="submit" className="hero-submit-btn" disabled={busy}>
                      <Search size={18} /> {busy ? 'Đang xử lý…' : 'Tiếp tục'} <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
                    </button>
                  </form>
                )}

                {busy && <Loading label="Đang tra cứu dữ liệu mô phỏng…" />}
                {phase.s === 'error' && phase.kind === 'notfound' && (
                  <div style={{ marginTop: '14px' }}>
                    <Notice tone="error" title="Không tìm thấy chuyến bay">
                      Số hiệu chưa có trong dữ liệu mô phỏng. Hãy thử chuyến mẫu <strong>VN218</strong> hoặc nhập thủ công.
                      <div style={{ marginTop: '10px' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => dispatch({ type: 'go', screen: 'stays' })}
                          style={{ borderRadius: '8px' }}
                        >
                          Tiếp tục tìm nơi nghỉ
                        </button>
                      </div>
                    </Notice>
                  </div>
                )}
                {phase.s === 'error' && phase.kind !== 'notfound' && (
                  <div style={{ marginTop: '14px' }}>
                    <ErrorBox title="Dịch vụ tạm thời lỗi" onRetry={flightSubMode === 'code' ? submitCode : submitManual}>
                      Dữ liệu của bạn vẫn được giữ. Vui lòng thử lại.
                    </ErrorBox>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSearchHotel}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div className="hero-input-field">
                    <label htmlFor="h-airport">Sân bay</label>
                    <div className="hero-input-box">
                      <MapPin size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
                      <select id="h-airport" value={airport} onChange={(e) => setAirport(e.target.value)}>
                        <option value="HAN">Nội Bài (HAN)</option>
                        <option value="SGN">Tân Sơn Nhất (SGN)</option>
                      </select>
                    </div>
                  </div>

                  <div className="hero-input-field">
                    <label htmlFor="h-guest">Số khách</label>
                    <div className="hero-input-box">
                      <Users size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
                      <select id="h-guest" value={guestCount} onChange={(e) => setGuestCount(e.target.value)}>
                        <option value="1 khách">1 khách</option>
                        <option value="2 khách">2 khách</option>
                        <option value="3 khách">3 khách</option>
                        <option value="4 khách">4 khách</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button type="submit" className="hero-submit-btn">
                  <Search size={18} /> Tìm nơi nghỉ quanh sân bay <ArrowRight size={17} style={{ marginLeft: 'auto' }} />
                </button>
              </form>
            )}

            <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11.5px', color: '#64748b', marginTop: '16px', marginBottom: 0 }}>
              <ShieldCheck size={14} /> Chỉ thu thập thông tin cần thiết khi bạn gửi booking.
            </p>
          </div>
        </div>
      </section>

      {/* Quy trình minh bạch 3 bước */}
      <section className="airrest-how-section">
        <div className="section-intro-center">
          <span className="section-kicker">Quy trình minh bạch</span>
          <h2 className="section-main-title">Đặt chỗ trong ba bước</h2>
          <p className="section-subtext">
            AIRREST tiếp nhận yêu cầu, quản trị viên xác minh với khách sạn và cập nhật trạng thái để bạn chủ động theo dõi.
          </p>
        </div>

        <div className="how-steps-grid">
          <article className="how-step-card">
            <span className="how-step-number">01</span>
            <h3>Chọn nơi nghỉ</h3>
            <p>So sánh khoảng cách, giá, tiện ích và số phòng mô phỏng quanh sân bay.</p>
          </article>

          <article className="how-step-card">
            <span className="how-step-number">02</span>
            <h3>Gửi yêu cầu</h3>
            <p>Nhập thông tin liên hệ cần thiết, không cần đăng ký tài khoản hay thủ tục phức tạp.</p>
          </article>

          <article className="how-step-card">
            <span className="how-step-number">03</span>
            <h3>Theo dõi xác nhận</h3>
            <p>Booking bắt đầu ở trạng thái chờ và chỉ được xác nhận sau khi quản trị viên xử lý.</p>
          </article>
        </div>
      </section>

      {/* Khối gọi trợ giúp nhanh */}
      <section style={{ background: '#1262e8', color: '#ffffff', borderRadius: '24px', padding: '28px 32px', margin: '32px 0 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(255,255,255,0.18)' }}>
              <CircleHelp size={24} />
            </span>
            <div>
              <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '800' }}>Bạn cần hỗ trợ thêm?</h2>
              <p style={{ color: '#dbeafe', fontSize: '13.5px', margin: '4px 0 0' }}>Gửi ticket hoặc tra cứu booking bằng thông tin xác minh.</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'go', screen: 'support' })}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.6)', color: '#ffffff', padding: '10px 18px', borderRadius: '12px', fontSize: '13.5px', fontWeight: '700' }}
            >
              Gửi yêu cầu
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'go', screen: 'request' })}
              style={{ background: '#ffffff', color: '#062253', padding: '10px 18px', borderRadius: '12px', fontSize: '13.5px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            >
              Theo dõi booking
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
