import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useLiveData } from '../../lib/useRealtime';
import { useApp } from '../../state/store';
import * as H from '../../data/hotel';
import { fmtDT } from './kit';

// Chuông thông báo trên header cổng khách sạn: số chưa đọc + danh sách; realtime qua socket (`notify:new`), kèm toast khi có thông báo mới.
export default function NotificationBell({ onOpenBooking }) {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const seen = useRef(null);
  const live = useLiveData(() => H.listNotifications({ limit: 30 }), [], state.session?.id, { refreshOn: (n) => n === 'notify:new' });
  const items = live.data?.items || [];
  const unread = live.data?.unread || 0;

  useEffect(() => {
    if (!live.data) return;
    const top = items[0];
    if (seen.current !== null && top && top.id !== seen.current && !top.read) setToast(top);
    seen.current = top?.id ?? '';
  }, [live.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const read = async (n) => { if (!n.read) { await H.markNotificationRead(n.id).catch(() => {}); live.reload(); } setOpen(false); if (n.refCode) onOpenBooking?.(n.refCode); };
  const readAll = async () => { await H.markAllNotificationsRead().catch(() => {}); live.reload(); };
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="sx-icon-btn" onClick={() => setOpen((v) => !v)} aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`} aria-expanded={open} data-testid="bell" style={{ position: 'relative' }}>
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span data-testid="bell-count" style={{ position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '16px' }}>{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Thông báo" data-testid="bell-panel" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 340, maxWidth: '90vw', maxHeight: 420, overflow: 'auto', background: 'var(--surface, #fff)', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.18)', zIndex: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
            <strong>Thông báo</strong>
            <button type="button" className="link-btn" onClick={readAll} disabled={!unread} data-testid="bell-read-all">Đọc hết</button>
          </div>
          {items.length === 0 && <p className="muted" style={{ padding: 16, margin: 0 }}>Chưa có thông báo nào.</p>}
          {items.map((n) => (
            <button key={n.id} type="button" onClick={() => read(n)} data-testid="bell-item" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 0, borderBottom: '1px solid #f1f5f9', background: n.read ? 'transparent' : '#eff6ff', cursor: 'pointer' }}>
              <span style={{ display: 'block', fontWeight: n.read ? 400 : 700 }}>{n.title}</span>
              <small className="muted">{fmtDT(n.createdAt)}</small>
            </button>
          ))}
        </div>
      )}
      {toast && (
        <div role="status" aria-live="polite" data-testid="bell-toast" style={{ position: 'fixed', right: 16, top: 72, zIndex: 60, background: '#0f172a', color: '#fff', padding: '10px 14px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: 320 }}>
          <strong style={{ display: 'block', fontSize: 13 }}>{toast.title}</strong>
        </div>
      )}
    </div>
  );
}
