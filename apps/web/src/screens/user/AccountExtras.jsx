import React, { useEffect, useState } from 'react';
import { Bell, Heart, Ticket } from 'lucide-react';
import { useApp } from '../../state/store';
import { describeApiError, getHotel, listMyVouchers, listNotifications, markNotificationsRead } from '../../data/user';
import { useFavorites } from '../../data/favorites';
import { money } from '../../lib/time';
import { setTrackPrefill, statusCopy } from './data';

const BOX = 'tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-5 tw:text-xs tw:leading-6 tw:text-slate-500';
const dmyHm = (iso) => new Date(iso).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Tải một danh sách một lần: { items, error, loading }.
function useList(fn) {
  const [st, setSt] = useState({ data: null, error: '', loading: true });
  useEffect(() => { let on = true; fn().then((data) => on && setSt({ data, error: '', loading: false })).catch((e) => on && setSt({ data: null, error: describeApiError(e), loading: false })); return () => { on = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

// Thông báo = các lần đổi trạng thái đơn của tôi. Mở trang là đánh dấu đã đọc (chuông ở header cập nhật qua sự kiện).
export function NotificationsPanel() {
  const { dispatch } = useApp();
  const st = useList(listNotifications);
  useEffect(() => { markNotificationsRead().then(() => window.dispatchEvent(new Event('airrest:notif'))).catch(() => {}); }, []);
  const open = (code) => { setTrackPrefill(code); dispatch({ type: 'go', screen: 'track' }); window.scrollTo({ top: 0 }); };
  return (
    <section data-testid="notifications" aria-labelledby="notif-h">
      <h2 id="notif-h" className="tw:text-lg tw:font-bold">Thông báo</h2>
      {st.loading && <p role="status" className={BOX}>Đang tải thông báo…</p>}
      {st.error && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-semibold tw:text-rose-700">{st.error}</p>}
      {st.data && !st.data.items.length && <p className={BOX}><Bell size={16} className="tw:mb-2" />Chưa có thông báo. Khi đơn đặt phòng của bạn được xác nhận, từ chối hay đổi trạng thái, thông báo sẽ hiện ở đây.</p>}
      {st.data?.items.length > 0 && (
        <ul className="tw:mt-4 tw:grid tw:list-none tw:gap-2 tw:p-0">
          {st.data.items.map((n, i) => (
            <li key={`${n.code}-${n.at}-${i}`}>
              <button type="button" onClick={() => open(n.code)} className={`tw:flex tw:w-full tw:items-start tw:gap-3 tw:rounded-xl tw:border tw:p-4 tw:text-left tw:text-xs tw:hover:border-blue-300 ${n.unread ? 'tw:border-blue-200 tw:bg-blue-50' : 'tw:border-slate-200'}`}>
                <span className="tw:min-w-0 tw:flex-1"><strong className="tw:block tw:text-sm">Đơn {n.code}{n.hotel ? ` · ${n.hotel}` : ''}</strong><span className="tw:mt-1 tw:block tw:text-slate-600">{statusCopy(n.to)}</span><span className="tw:mt-1 tw:block tw:text-[11px] tw:text-slate-400">{dmyHm(n.at)}</span></span>
                {n.unread && <span className="tw:mt-1 tw:size-2 tw:shrink-0 tw:rounded-full tw:bg-blue-600" aria-label="Chưa đọc" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Khách sạn yêu thích: danh sách id từ store dùng chung, mỗi dòng tải thông tin khách sạn.
export function FavoritesPanel() {
  const { dispatch } = useApp();
  const { ids, toggle } = useFavorites(true);
  const [hotels, setHotels] = useState({});
  const list = [...ids];
  useEffect(() => {
    list.filter((id) => !(id in hotels)).forEach((id) => getHotel(id).then((h) => setHotels((m) => ({ ...m, [id]: h }))).catch(() => setHotels((m) => ({ ...m, [id]: null }))));
  }, [list.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section data-testid="favorites" aria-labelledby="fav-h">
      <h2 id="fav-h" className="tw:text-lg tw:font-bold">Yêu thích</h2>
      {!list.length && <p className={BOX}><Heart size={16} className="tw:mb-2" />Bạn chưa lưu khách sạn nào. Bấm biểu tượng trái tim ở trang khách sạn để lưu lại.</p>}
      <ul className="tw:mt-4 tw:grid tw:list-none tw:gap-3 tw:p-0 tw:sm:grid-cols-2">
        {list.map((id) => { const h = hotels[id]; if (h === null) return null; return (
          <li key={id} className="tw:flex tw:items-center tw:gap-3 tw:rounded-2xl tw:border tw:border-slate-200 tw:p-3">
            <button type="button" onClick={() => { dispatch({ type: 'openProperty', id }); window.scrollTo({ top: 0 }); }} className="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-3 tw:text-left">
              {h?.image ? <img src={h.image} alt="" className="tw:size-16 tw:shrink-0 tw:rounded-xl tw:object-cover" /> : <span className="tw:size-16 tw:shrink-0 tw:rounded-xl tw:bg-slate-100" />}
              <span className="tw:min-w-0"><strong className="tw:block tw:truncate tw:text-sm">{h?.name ?? 'Đang tải…'}</strong>{h?.rooms?.length > 0 && <span className="tw:text-xs tw:text-slate-500">từ {money(Math.min(...h.rooms.map((r) => r.price)))} / đêm</span>}</span>
            </button>
            <button type="button" onClick={() => toggle(id)} aria-label={`Bỏ yêu thích ${h?.name ?? ''}`} className="tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:rounded-xl tw:text-rose-600 tw:hover:bg-rose-50"><Heart size={18} fill="currentColor" /></button>
          </li>
        ); })}
      </ul>
    </section>
  );
}

const valueText = (v) => (v.discount_type === 'PERCENT' ? `Giảm ${v.value}%` : `Giảm ${money(v.value)}`);

// Mã giảm giá còn hiệu lực. Chưa nhập được ở bước đặt phòng (đang chờ quy tắc áp dụng), nên chỉ xem và sao chép mã.
export function VouchersPanel() {
  const st = useList(listMyVouchers);
  const [copied, setCopied] = useState('');
  const copy = async (code) => { try { await navigator.clipboard.writeText(code); setCopied(code); window.setTimeout(() => setCopied(''), 2000); } catch { /* không có clipboard */ } };
  return (
    <section data-testid="vouchers" aria-labelledby="vch-h">
      <h2 id="vch-h" className="tw:text-lg tw:font-bold">Mã giảm giá</h2>
      {st.loading && <p role="status" className={BOX}>Đang tải mã giảm giá…</p>}
      {st.error && <p role="alert" className="tw:mt-4 tw:rounded-xl tw:bg-rose-50 tw:p-4 tw:text-xs tw:font-semibold tw:text-rose-700">{st.error}</p>}
      {st.data && !st.data.length && <p className={BOX}><Ticket size={16} className="tw:mb-2" />Hiện chưa có mã giảm giá nào. Mã mới sẽ xuất hiện ở đây khi Airrest phát hành.</p>}
      {st.data?.length > 0 && (
        <>
          <ul className="tw:mt-4 tw:grid tw:list-none tw:gap-3 tw:p-0 tw:sm:grid-cols-2">
            {st.data.map((v) => (
              <li key={v.id} data-testid="voucher" className="tw:rounded-2xl tw:border tw:border-dashed tw:border-blue-300 tw:bg-blue-50 tw:p-4">
                <strong className="tw:block tw:text-sm">{v.title}</strong>
                <span className="tw:mt-1 tw:block tw:text-lg tw:font-extrabold tw:text-blue-700">{valueText(v)}</span>
                {v.description && <span className="tw:mt-1 tw:block tw:text-xs tw:text-slate-600">{v.description}</span>}
                <span className="tw:mt-1 tw:block tw:text-[11px] tw:text-slate-500">{Number(v.min_total_vnd) > 0 ? `Đơn từ ${money(Number(v.min_total_vnd))}` : 'Mọi đơn'}{v.expires_at ? ` · HSD ${new Date(v.expires_at).toLocaleDateString('vi-VN')}` : ''}</span>
                <button type="button" onClick={() => copy(v.code)} className="tw:mt-3 tw:min-h-11 tw:rounded-xl tw:border tw:border-blue-300 tw:bg-white tw:px-4 tw:text-xs tw:font-bold tw:tracking-wider tw:text-blue-700">{copied === v.code ? 'Đã sao chép' : v.code}</button>
              </li>
            ))}
          </ul>
          <p className="tw:mt-4 tw:text-[11px] tw:text-slate-500">Lưu ý: bước đặt phòng chưa có ô nhập mã; tính năng áp mã đang được hoàn thiện.</p>
        </>
      )}
    </section>
  );
}
