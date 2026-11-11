import React, { useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Plane, Search, ShieldCheck } from 'lucide-react';
import { useApp } from '../state/store';
import { buildManualFlight, FLIGHT_CODE_RE, lookupFlight } from '../mock/service';
import { SAMPLE_CODES } from '../mock/flights';
import { dayOffsetOfIso, isoDate } from '../lib/time';
import { ErrorBox, Field, Loading, Notice, ScreenTitle, SimBadge } from '../components/Common';

// M0 — Tra cứu theo số hiệu hoặc nhập thủ công (MB-01: FR-001, FR-002). Không cần đăng nhập (BR-002).
export default function Home() {
  const { state, dispatch } = useApp();
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState(state.lookupPrefill || '');
  const [date, setDate] = useState(isoDate(0));
  const [airport, setAirport] = useState('HAN');
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

  const busy = phase.s === 'loading';
  return (
    <>
      <ScreenTitle kicker="Chuyến bay" title="Kiểm tra chuyến bay của bạn">Nhập số hiệu chuyến bay (hoặc nhập thủ công) để xem tình trạng, thông tin quyền lợi tham khảo, thời gian nghỉ và đặt nơi nghỉ.</ScreenTitle>
      {state.pendingProperty && <Notice tone="info" title="Nhập chuyến bay để tiếp tục đặt chỗ">Nơi nghỉ bạn đã chọn sẽ được giữ lại sau khi tra cứu xong.</Notice>}
      <section className="lookup">
        <div className="lookup-grid">
          <div className="card form-card">
            <div className="form-head"><div><span className="kicker">Bắt đầu tại đây</span><h2>Thông tin chuyến bay</h2></div><SimBadge /></div>
            <div className="tabs" role="tablist" aria-label="Cách nhập chuyến bay">
              <button type="button" role="tab" aria-selected={mode === 'code'} className={mode === 'code' ? 'active' : ''} onClick={() => { setMode('code'); setErrors({}); setPhase({ s: 'idle' }); }}><Plane size={16} aria-hidden="true" /> Có số hiệu chuyến bay</button>
              <button type="button" role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'active' : ''} onClick={() => { setMode('manual'); setErrors({}); setPhase({ s: 'idle' }); }}><MapPin size={16} aria-hidden="true" /> Tôi không có số hiệu</button>
            </div>

            {mode === 'code' ? (
              <form onSubmit={submitCode} noValidate aria-busy={busy}>
                <div className="grid-2">
                  <Field id="f-code" label="Số hiệu chuyến bay" hint="Ví dụ: VN218" error={errors.code}>
                    <input id="f-code" name="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VN218" autoComplete="off" maxLength={6} aria-invalid={!!errors.code} aria-describedby={errors.code ? 'f-code-err' : 'f-code-hint'} />
                  </Field>
                  <Field id="f-date" label="Ngày bay" error={errors.date}>
                    <input id="f-date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? 'f-date-err' : undefined} />
                  </Field>
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={busy}><Search size={18} aria-hidden="true" /> {busy ? 'Đang kiểm tra…' : 'Kiểm tra ngay'} {!busy && <ArrowRight size={16} aria-hidden="true" />}</button>
                <div className="samples" aria-label="Chuyến mẫu mô phỏng">
                  <span>Chuyến mẫu (mô phỏng):</span>
                  {SAMPLE_CODES.map((c) => <button key={c} type="button" className="chip" onClick={() => { setCode(c); setDate(isoDate(0)); setErrors({}); }}>{c}</button>)}
                </div>
              </form>
            ) : (
              <form onSubmit={submitManual} noValidate aria-busy={busy}>
                <div className="grid-2">
                  <Field id="m-airport" label="Sân bay hiện tại">
                    <select id="m-airport" value={airport} onChange={(e) => setAirport(e.target.value)}>
                      <option value="HAN">Nội Bài (HAN)</option><option value="SGN">Tân Sơn Nhất (SGN)</option>
                    </select>
                  </Field>
                  <Field id="m-new" label="Giờ bay mới" error={errors.newTime} hint="Giờ khởi hành mới thông báo cho bạn">
                    <input id="m-new" type="time" value={newTime} disabled={unknown} onChange={(e) => setNewTime(e.target.value)} aria-invalid={!!errors.newTime} aria-describedby={errors.newTime ? 'm-new-err' : 'm-new-hint'} />
                  </Field>
                </div>
                <label className="check"><input type="checkbox" checked={unknown} onChange={(e) => { setUnknown(e.target.checked); if (e.target.checked) setNewTime(''); setErrors({}); }} /> Chưa biết giờ bay mới</label>
                <Field id="m-sched" label="Giờ bay ban đầu theo vé (không bắt buộc)" hint="Nếu bỏ trống, hệ thống không tính được số giờ chậm">
                  <input id="m-sched" type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
                </Field>
                <button type="submit" className="btn btn-primary btn-block" disabled={busy}><Search size={18} aria-hidden="true" /> {busy ? 'Đang xử lý…' : 'Tiếp tục'} {!busy && <ArrowRight size={16} aria-hidden="true" />}</button>
              </form>
            )}

            {busy && <Loading label="Đang tra cứu dữ liệu mô phỏng…" />}
            {phase.s === 'error' && phase.kind === 'notfound' && (
              <div className="state-inline" role="alert">
                <Notice tone="error" title="Không tìm thấy chuyến bay">
                  Số hiệu hoặc ngày bay chưa có trong dữ liệu mô phỏng. Hãy kiểm tra lại số hiệu và ngày, thử một chuyến mẫu, hoặc nhập thủ công nếu bạn không có số hiệu.
                </Notice>
                <button type="button" className="btn" onClick={() => { setMode('manual'); setPhase({ s: 'idle' }); }}>Nhập thủ công</button>
              </div>
            )}
            {phase.s === 'error' && phase.kind !== 'notfound' && (
              <ErrorBox title="Dịch vụ dữ liệu mô phỏng tạm thời lỗi" onRetry={mode === 'code' ? submitCode : submitManual}>Dữ liệu của bạn vẫn được giữ trong biểu mẫu. Hãy thử lại.</ErrorBox>
            )}
            <p className="privacy-note"><ShieldCheck size={14} aria-hidden="true" /> Không thu thập số điện thoại, email hay giấy tờ. Dữ liệu chuyến bay là mô phỏng, không kết nối hãng hàng không.</p>
          </div>
          <aside className="card lookup-side" aria-label="Lưu ý">
            <h2>Trước khi bắt đầu</h2>
            <ul className="plain-list">
              <li>Không cần đăng nhập.</li>
              <li>Không thu số điện thoại, email hay giấy tờ.</li>
              <li>Toàn bộ dữ liệu chuyến bay và nơi nghỉ là mô phỏng, không kết nối hãng hay khách sạn.</li>
              <li>Thông tin quyền lợi chỉ để tham khảo, chưa được Product Owner phê duyệt.</li>
            </ul>
          </aside>
        </div>
      </section>
    </>
  );
}
