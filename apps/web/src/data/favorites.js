import { useEffect, useSyncExternalStore } from 'react';
import { addFavorite, listFavoriteIds, removeFavorite } from './user';

// Danh sách khách sạn yêu thích dùng chung (header, trang chi tiết, trang Yêu thích): một bản trong bộ nhớ, tải một lần sau khi đăng nhập.
let ids = new Set();
let loaded = false;
const subs = new Set();
const emit = () => { ids = new Set(ids); subs.forEach((f) => f()); };
const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };

export function useFavorites(enabled) {
  const snap = useSyncExternalStore(subscribe, () => ids);
  useEffect(() => {
    if (!enabled) { if (loaded) { loaded = false; ids = new Set(); emit(); } return; }
    if (loaded) return;
    loaded = true;
    listFavoriteIds().then((l) => { ids = new Set(l); emit(); }).catch(() => { loaded = false; });
  }, [enabled]);
  const toggle = async (id) => { // cập nhật ngay, lỗi mạng thì hoàn lại
    const had = ids.has(id);
    if (had) ids.delete(id); else ids.add(id);
    emit();
    try { if (had) await removeFavorite(id); else await addFavorite(id); } catch { if (had) ids.add(id); else ids.delete(id); emit(); }
  };
  return { ids: snap, count: snap.size, toggle };
}
