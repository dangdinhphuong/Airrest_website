import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plane, Search, X } from 'lucide-react';
import { getFlightSummary, listAirports, listFlightBoard } from '../../data/flights';
import { describeError } from '../../lib/api';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { ChangeFlightModal, CreateFlightModal } from './FlightActions';
import { EmptyState, ErrorState, Loading, Tag } from '../../components/ui';

// Trang công khai: bảng chuyến bay, mỗi sân bay một tab. Chỉ xem, không gắn với đặt phòng/đăng nhập. Dữ liệu mô phỏng.
const REFRESH_MS = 60_000;
const TZ = 'Asia/Ho_Chi_Minh';
const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const hhmm = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const dm = (iso) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: TZ });
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}g${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min} phút`);

const STATUS = { ONTIME: ['Đúng giờ', 'ok'], DELAYED: ['Trễ', 'warn'], CANCELLED: ['Hủy', 'error'] };
const CAUSE = { AIRLINE: 'Do hãng bay', FORCE: 'Bất khả kháng (thời tiết, an ninh…)', UNKNOWN: 'Chưa rõ nguyên nhân' };
const DEFAULT_AIRPORT = 'HAN';
export const normCode = (t) => t.replace(/\s+/g, '').toUpperCase(); // khớp chuẩn hóa của backend
export const validCode = (c) => /^[A-Z0-9]{1,6}$/.test(c);

// Đọc/ghi bộ lọc trên URL (?airport=&date=&dir=&status=) để chia sẻ link và F5 giữ nguyên.
export function readParams(search) {
  const p = new URLSearchParams(search);
  const airport = (p.get('airport') || '').toUpperCase();
  const date = p.get('date') || '';
  const status = p.get('status') || '';
  return {
    airport: /^[A-Z]{3}$/.test(airport) ? airport : DEFAULT_AIRPORT,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : vnToday(),
    dir: p.get('dir') === 'arrivals' ? 'arrivals' : 'departures',
    status: STATUS[status] ? status : '',
    q: validCode(normCode(p.get('q') || '')) ? normCode(p.get('q')) : '',
  };
}
const writeParams = (f) => {
  const p = new URLSearchParams({ airport: f.airport, date: f.date, dir: f.dir });
  if (f.status) p.set('status', f.status);
  if (f.q) p.set('q', f.q);
  try { window.history.replaceState(null, '', `${window.location.pathname}?${p}`); } catch { /* môi trường chặn history */ }
};

const FIELD = 'tw:rounded-lg tw:border tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2.5 tw:text-sm tw:text-slate-800';

function Row({ f, dir, onChange, onJump }) {
  const [label, tone] = STATUS[f.status] ?? [f.status, 'neutral'];
  const cancelled = f.status === 'CANCELLED';
  return (
    <li data-testid="flight-row" className="tw:grid tw:gap-2 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:p-4 tw:md:grid-cols-[110px_1.1fr_1.2fr_130px_150px_1.3fr] tw:md:items-center tw:md:gap-4 tw:md:rounded-none tw:md:border-0 tw:md:border-b tw:md:px-4 tw:md:py-3">
      <div className="tw:flex tw:items-center tw:justify-between tw:md:block">
        <strong className="tw:text-base tw:text-[#062253]">{f.code}</strong>
        <span className="tw:md:hidden"><Tag tone={tone}>{label}</Tag></span>
      </div>
      <div className="tw:text-sm tw:text-slate-600">{f.airline}</div>
      <div className="tw:text-sm tw:font-semibold tw:text-slate-800" aria-label={`Tuyến ${f.origin} đến ${f.dest ?? 'chưa rõ'}`}>
        {onJump ? <button type="button" className="tw:font-semibold tw:text-blue-700 tw:underline" title={`Xem bảng giờ bay ${f.origin}`} onClick={() => onJump(f.origin)}>{f.origin}</button> : <span className={dir === 'departures' ? 'tw:text-blue-700' : ''}>{f.origin}</span>} → <span className={dir === 'arrivals' ? 'tw:text-blue-700' : ''}>{f.dest ?? '—'}</span>
      </div>
      <div className="tw:text-sm"><span className="tw:text-slate-500 tw:md:hidden">Giờ lịch: </span><span className={cancelled || f.newDepartureAt ? 'tw:text-slate-500 tw:line-through' : 'tw:font-semibold'}>{hhmm(f.scheduledDepartureAt)}</span></div>
      <div className={`tw:text-sm ${f.newDepartureAt || f.status === 'DELAYED' ? '' : 'tw:hidden tw:md:block'}`} data-testid="new-time">
        {f.newDepartureAt ? (
          <><span className="tw:text-slate-500 tw:md:hidden">Giờ mới: </span><strong className="tw:rounded tw:bg-amber-100 tw:px-1.5 tw:py-0.5 tw:text-amber-900">{hhmm(f.newDepartureAt)}{dm(f.newDepartureAt) !== dm(f.scheduledDepartureAt) ? ` (${dm(f.newDepartureAt)})` : ''}</strong>{f.delayMinutes ? <span className="tw:ml-1.5 tw:text-xs tw:text-amber-800">+{hm(f.delayMinutes)}</span> : null}</>
        ) : f.status === 'DELAYED' ? <span className="tw:text-xs tw:text-slate-500">Chưa có giờ mới</span> : <span className="tw:text-slate-400">—</span>}
      </div>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-xs tw:text-slate-600">
        <span className="tw:hidden tw:md:inline"><Tag tone={tone}>{label}</Tag></span>
        {f.status !== 'ONTIME' && <span>{CAUSE[f.cause] ?? CAUSE.UNKNOWN}</span>}
        {onChange && <button type="button" className="tw:rounded-lg tw:border tw:border-slate-300 tw:px-2.5 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-blue-700 tw:hover:bg-blue-50" onClick={() => onChange(f)} data-testid="flight-change-open">Delay đến…</button>}
      </div>
    </li>
  );
}

export default function Flights() {
  const [filters, setFilters] = useState(() => readParams(window.location.search));
  const [airports, setAirports] = useState([]);
  const [summary, setSummary] = useState({});
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const app = useApp();
  const manage = hasPerm(app?.state?.session, PERM.FLIGHT_MANAGE); // chỉ theo quyền; máy chủ vẫn kiểm lại
  const [creating, setCreating] = useState(false);
  const [changing, setChanging] = useState(null);
  const seq = useRef(0);
  const tabRefs = useRef({});

  const set = (patch) => setFilters((f) => { const n = { ...f, ...patch }; writeParams(n); return n; });

  useEffect(() => { listAirports().then(setAirports).catch(() => setAirports([])); }, []);

  const { airport, date, dir, status, q } = filters;
  const [text, setText] = useState(filters.q);
  const textErr = text && !validCode(normCode(text)) ? 'Mã chuyến chỉ gồm chữ và số, tối đa 6 ký tự (ví dụ VN218).' : '';
  const apply = (v) => { const c = normCode(v); if ((validCode(c) || !c) && c !== q) set({ q: c }); }; // sai định dạng: không gọi API
  useEffect(() => { const t = setTimeout(() => apply(text), 300); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = (a) => { setText(''); set({ airport: a, q: '' }); }; // từ kết quả tìm kiếm về tab sân bay

  const load = useCallback((silent) => {
    const id = ++seq.current;
    if (!silent) { setLoading(true); setError(''); }
    listFlightBoard(q ? { code: q, date, status } : { airport, direction: dir, date, status })
      .then((r) => { if (id === seq.current) { setData(r); setError(''); } })
      .catch((e) => { if (id === seq.current && !silent) { setData(null); setError(describeError(e)); } })
      .finally(() => { if (id === seq.current) setLoading(false); });
    getFlightSummary(date).then((r) => id === seq.current && setSummary(Object.fromEntries(r.items.map((x) => [x.origin, x])))).catch(() => {}); // huy hiệu là phụ, lỗi thì bỏ qua
  }, [airport, dir, date, status, q]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => { // làm mới nhẹ mỗi 60 giây, bỏ qua khi tab trình duyệt đang ẩn
    const t = setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const onKey = (e) => {
    const i = airports.findIndex((a) => a.iata === airport);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: airports.length - 1 }[e.key];
    if (to === undefined || !airports.length) return;
    e.preventDefault();
    const a = airports[(to + airports.length) % airports.length];
    jump(a.iata);
    tabRefs.current[a.iata]?.focus();
  };

  useEffect(() => { tabRefs.current[airport]?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, [airport, airports]);

  const afterCreate = (fl) => {
    setCreating(false);
    const next = { airport: fl.origin, date: fl.flightDate, dir: 'departures', status: '' };
    if (Object.keys(next).every((k) => next[k] === filters[k])) load(false); else set(next);
  };
  const items = data?.items ?? [];
  const seg = (v, label) => (
    <button type="button" aria-pressed={dir === v} onClick={() => set({ dir: v })}
      className={`tw:px-4 tw:py-2.5 tw:text-sm tw:font-semibold ${dir === v ? 'tw:bg-[#1262e8] tw:text-white' : 'tw:bg-white tw:text-slate-700 tw:hover:bg-blue-50'}`}>{label}</button>
  );

  return (
    <div className="tw:min-h-screen tw:bg-slate-50 tw:px-4 tw:py-8 tw:sm:py-12">
      <div className="tw:mx-auto tw:max-w-[1100px]">
        <h1 className="tw:flex tw:items-center tw:gap-3 tw:text-3xl tw:font-bold tw:tracking-tight tw:text-[#062253]"><Plane aria-hidden="true" /> Chuyến bay{manage && <button type="button" className="tw:ml-auto tw:rounded-lg tw:bg-[#1262e8] tw:px-4 tw:py-2.5 tw:text-sm tw:font-semibold tw:text-white" onClick={() => setCreating(true)} data-testid="flight-new">Tạo chuyến bay</button>}</h1>
        <p className="tw:mt-2 tw:text-sm tw:text-slate-600">Bảng giờ bay theo từng sân bay. <strong>Dữ liệu mô phỏng</strong>, không phải thông tin khai thác thật của hãng bay.</p>

        <div className="tw:mt-6 tw:flex tw:flex-wrap tw:items-end tw:gap-3">
          <label className="tw:grid tw:gap-1 tw:text-xs tw:font-semibold tw:text-slate-600">Ngày
            <input type="date" className={FIELD} value={date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </label>
          <button type="button" className={`${FIELD} tw:font-semibold tw:hover:bg-blue-50`} onClick={() => set({ date: vnToday() })}>Hôm nay</button>
          <div className="tw:flex tw:overflow-hidden tw:rounded-lg tw:border tw:border-slate-300" role="group" aria-label="Hướng chuyến bay">{seg('departures', 'Khởi hành')}{seg('arrivals', 'Đến')}</div>
          <label className="tw:grid tw:gap-1 tw:text-xs tw:font-semibold tw:text-slate-600">Trạng thái
            <select className={FIELD} value={status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Tất cả</option><option value="ONTIME">Đúng giờ</option><option value="DELAYED">Trễ</option><option value="CANCELLED">Hủy</option>
            </select>
          </label>
        </div>

        <form role="search" className="tw:mt-6" onSubmit={(e) => { e.preventDefault(); apply(text); }}>
          <label htmlFor="flight-search" className="tw:sr-only">Tìm chuyến bay theo mã</label>
          <div className="tw:relative">
            <Search aria-hidden="true" size={20} className="tw:pointer-events-none tw:absolute tw:left-4 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400" />
            <input id="flight-search" type="text" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm theo mã chuyến, ví dụ VN218" aria-invalid={!!textErr}
              className="tw:w-full tw:rounded-xl tw:border-2 tw:border-slate-300 tw:bg-white tw:py-3.5 tw:pl-12 tw:pr-12 tw:text-base tw:text-slate-800 tw:shadow-sm focus:tw:border-[#1262e8]" />
            {text && <button type="button" aria-label="Xóa từ khóa" className="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:rounded-full tw:p-1.5 tw:text-slate-500 tw:hover:bg-slate-100" onClick={() => { setText(''); set({ q: '' }); }}><X size={18} aria-hidden="true" /></button>}
          </div>
          {textErr && <p role="alert" className="tw:mt-1.5 tw:text-xs tw:text-amber-800">{textErr}</p>}
        </form>
        {q && <p className="tw:mt-3 tw:text-sm tw:font-semibold tw:text-[#062253]" data-testid="search-label">Kết quả tìm kiếm “{q}” trên mọi sân bay{data ? ` · ${data.count}` : ''}</p>}

        <div role="tablist" aria-label="Sân bay" onKeyDown={onKey} className={`tw:mt-5 tw:flex tw:gap-2 tw:overflow-x-auto tw:pb-2 ${q ? 'tw:opacity-50' : ''}`} data-testid="airport-tabs">
          {airports.map((a) => {
            const on = !q && a.iata === airport;
            const s = dir === 'departures' ? summary[a.iata] : null;
            const bad = s ? s.delayed + s.cancelled : 0;
            return (
              <button key={a.iata} type="button" role="tab" id={`tab-${a.iata}`} aria-selected={on} aria-controls="flights-panel" tabIndex={on ? 0 : -1}
                ref={(el) => { tabRefs.current[a.iata] = el; }} onClick={() => jump(a.iata)}
                className={`tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:px-3.5 tw:py-2.5 tw:text-left tw:text-sm ${on ? 'tw:border-[#1262e8] tw:bg-[#1262e8] tw:text-white' : 'tw:border-slate-300 tw:bg-white tw:text-slate-700 tw:hover:bg-blue-50'}`}>
                <span className="tw:font-bold">{a.iata}</span><span className="tw:text-xs tw:opacity-90">{a.name}</span>
                {bad > 0 && <span className={`tw:rounded-full tw:px-1.5 tw:text-[11px] tw:font-bold ${on ? 'tw:bg-white tw:text-[#1262e8]' : 'tw:bg-amber-100 tw:text-amber-900'}`} title={`${bad} chuyến trễ/hủy`} aria-label={`${bad} chuyến trễ hoặc hủy`}>{bad}</span>}
              </button>
            );
          })}
        </div>

        <section id="flights-panel" role="tabpanel" aria-labelledby={`tab-${airport}`} className="tw:mt-3">
          {loading && !data ? <Loading label="Đang tải chuyến bay…" />
            : error ? <ErrorState title="Không tải được chuyến bay" onRetry={() => load(false)}>{error}</ErrorState>
            : !items.length ? <EmptyState icon={Plane} title={q ? 'Không tìm thấy chuyến bay' : 'Không có chuyến bay'} testid="flights-empty">{q ? <>Không tìm thấy chuyến nào khớp “{q}” ngày {date.split('-').reverse().slice(0, 2).join('/')}{status ? ` với trạng thái “${STATUS[status][0]}”` : ''}. Hãy thử đổi ngày hoặc kiểm tra lại mã chuyến.{manage ? <> <button type="button" className="tw:font-semibold tw:text-blue-700 tw:underline" onClick={() => setCreating(true)}>Tạo chuyến bay mới</button></> : null}</> : <>Không có chuyến {dir === 'departures' ? 'khởi hành từ' : 'đến'} {airport} ngày {date.split('-').reverse().join('/')}{status ? ` với trạng thái “${STATUS[status][0]}”` : ''}.</>}</EmptyState>
            : (
              <>
                <p className="tw:mb-2 tw:text-xs tw:text-slate-500" aria-live="polite">{q ? 'Tất cả sân bay: ' : ''}{data.count} chuyến, sắp xếp theo giờ bay tăng dần{data.truncated ? ' (chỉ hiện một phần, hãy lọc thêm)' : ''}.</p>
                <div className="tw:hidden tw:rounded-t-xl tw:border-b tw:border-slate-300 tw:bg-slate-100 tw:px-4 tw:py-2.5 tw:text-xs tw:font-bold tw:uppercase tw:tracking-wide tw:text-slate-600 tw:md:grid tw:md:grid-cols-[110px_1.1fr_1.2fr_130px_150px_1.3fr] tw:md:gap-4" aria-hidden="true">
                  <span>Chuyến</span><span>Hãng</span><span>Tuyến</span><span>Giờ lịch</span><span>Giờ mới</span><span>Trạng thái</span>
                </div>
                <ul className="tw:grid tw:gap-3 tw:md:gap-0 tw:md:overflow-hidden tw:md:rounded-b-xl tw:md:border tw:md:border-slate-200 tw:md:bg-white">{items.map((f) => <Row key={f.id} f={f} dir={dir} onChange={manage ? setChanging : null} onJump={q ? jump : null} />)}</ul>
              </>
            )}
        </section>
        {creating && <CreateFlightModal airport={airport} onClose={() => setCreating(false)} onDone={afterCreate} />}
        {changing && <ChangeFlightModal f={changing} onClose={() => setChanging(null)} onDone={() => { setChanging(null); load(false); }} />}
        <p className="tw:mt-4 tw:text-xs tw:text-slate-500">Giờ theo múi giờ Việt Nam. Tự làm mới mỗi 60 giây. Dữ liệu mô phỏng.</p>
      </div>
    </div>
  );
}
