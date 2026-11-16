import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { filterGroups } from '../../lib/navTree';

// Sidebar dạng cây (xlvm ShellSidebar/SidebarTree): ô "Tìm chức năng…", nhóm thu/mở, mục có icon + badge `count`.
// >= 1024: cố định 260px, thu gọn còn 64px (chỉ icon). < 1024: ngăn kéo (open/onClose), luôn hiện đủ cây.
// Bàn phím: ↑/↓/Home/End di chuyển, → mở nhóm, ← đóng nhóm, ↓ từ ô lọc vào cây, Esc xóa từ khóa.
export function ShellSidebar({ groups, cur, onPick, collapsed, drawer, open, onClose, filterRef, closed, onToggleGroup, onToggleCollapsed, label, testid, userBlock }) {
  const [q, setQ] = useState('');
  const navRef = useRef(null);
  const panelRef = useRef(null);
  const filtering = q.trim().length > 0;
  const shown = filterGroups(groups, q);
  const mini = collapsed && !drawer;

  useEffect(() => { // ngăn kéo: Esc đóng, focus vào ngăn khi mở
    if (!drawer || !open) return undefined;
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, open, onClose]);

  const items = () => [...(navRef.current?.querySelectorAll('[data-nav-item]') || [])].filter((el) => el.getClientRects().length);
  const onKey = (e) => {
    const t = e.target;
    if (!t.matches?.('[data-nav-item]')) return;
    const list = items(); const i = list.indexOf(t);
    const go = (n) => { e.preventDefault(); list[Math.max(0, Math.min(list.length - 1, n))]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') { if (i === 0 && filterRef?.current) { e.preventDefault(); filterRef.current.focus(); } else go(i - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (t.dataset.navGroup && e.key === 'ArrowRight' && t.getAttribute('aria-expanded') === 'false') { e.preventDefault(); onToggleGroup(t.dataset.navGroup); }
    else if (t.dataset.navGroup && e.key === 'ArrowLeft' && t.getAttribute('aria-expanded') === 'true') { e.preventDefault(); onToggleGroup(t.dataset.navGroup); }
  };

  const Item = ({ i }) => {
    const Icon = i.icon; const on = cur === i.id;
    return (
      <li>
        <button type="button" data-nav-item="" className={`sx-item ${on ? 'on' : ''}`} disabled={i.disabled} aria-current={on ? 'page' : undefined} title={mini ? i.label : undefined} aria-label={mini ? i.label : undefined}
          onClick={() => { onPick(i); if (drawer) onClose(); }} data-testid={`tab-${i.id}`}>
          <Icon size={18} strokeWidth={2} aria-hidden="true" />
          {!mini && <span className="sx-item-label">{i.label}</span>}
          {i.count > 0 && <span className="sx-badge" aria-label={`${i.count} mục`}>{i.count}</span>}
        </button>
      </li>
    );
  };

  return (
    <>
      {drawer && open && <div className="sx-mask" onClick={onClose} aria-hidden="true" />}
      <aside className={`sx-aside ${drawer ? 'is-drawer' : ''} ${drawer && open ? 'is-open' : ''} ${mini ? 'is-mini' : ''}`} id="app-drawer">
        <div ref={panelRef} tabIndex={-1} className="sx-aside-in" {...(drawer ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Điều hướng' } : {})}>
          {drawer && userBlock}
          {!mini && (
            <div className="sx-filter">
              <Search size={16} aria-hidden="true" />
              <input ref={filterRef} type="search" value={q} placeholder="Tìm chức năng…" aria-label="Tìm chức năng (Alt+M)" data-testid="nav-filter"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); } else if (e.key === 'ArrowDown') { e.preventDefault(); items()[0]?.focus(); } }} />
              {q && <button type="button" className="sx-filter-x" onClick={() => setQ('')} aria-label="Xóa từ khóa"><X size={14} aria-hidden="true" /></button>}
            </div>
          )}
          <nav ref={navRef} className="sx-nav" aria-label={label} data-testid={testid} onKeyDown={onKey}>
            {!shown.length && <p className="muted sx-nav-empty">Không có chức năng phù hợp.</p>}
            <ul className="sx-tree">
              {shown.map((g) => {
                if (mini || g.items.length === 1 && !filtering) return g.items.map((i) => <Item key={i.id} i={i} />);
                const isOpen = filtering || !closed.includes(g.key);
                const hasCur = g.items.some((i) => i.id === cur);
                return (
                  <li key={g.key} className="sx-group">
                    <button type="button" data-nav-item="" data-nav-group={g.key} className={`sx-group-head ${hasCur && !isOpen ? 'has-cur' : ''}`} aria-expanded={isOpen} aria-controls={`nav-sub-${g.key}`} onClick={() => onToggleGroup(g.key)}>
                      <span>{g.label}</span>
                      <ChevronRight size={16} className={`sx-chev ${isOpen ? 'open' : ''}`} aria-hidden="true" />
                    </button>
                    {isOpen && <ul className="sx-sub" id={`nav-sub-${g.key}`}>{g.items.map((i) => <Item key={i.id} i={i} />)}</ul>}
                  </li>
                );
              })}
            </ul>
          </nav>
          {!drawer && (
            <div className="sx-aside-foot">
              <button type="button" className="sx-collapse" onClick={onToggleCollapsed} aria-label={collapsed ? 'Mở rộng thanh điều hướng (Ctrl+B)' : 'Thu gọn thanh điều hướng (Ctrl+B)'} title="Ctrl+B">
                {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <><PanelLeftClose size={18} aria-hidden="true" /><span>Thu gọn</span></>}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
