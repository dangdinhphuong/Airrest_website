import React, { useEffect, useState } from 'react';
import { ErrorState, Loading, PageHeader } from '../ui';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { useAction, useLoad } from './kit';

// Cấu hình thông báo: bảng vai trò × loại. Tick = vai trò đó nhận loại thông báo đó. Lưu chỉ áp cho thông báo phát sinh SAU đó.
export default function NotifySettings() {
  const d = useLoad(() => H.getNotificationSettings(), []);
  const [cells, setCells] = useState({});
  const { run, busy, note } = useAction();
  useEffect(() => { if (d.data) setCells(Object.fromEntries(d.data.roles.map((r) => [r.id, { ...r.enabled }]))); }, [d.data]);
  if (d.loading) return <Loading />;
  if (d.err) return <ErrorState onRetry={d.reload}>{describeError(d.err)}</ErrorState>;
  const { types, roles } = d.data;
  const dirty = roles.flatMap((r) => types.filter((t) => cells[r.id]?.[t.key] !== r.enabled[t.key]).map((t) => ({ roleId: r.id, type: t.key, enabled: !!cells[r.id]?.[t.key] })));
  const toggle = (rid, key) => setCells((c) => ({ ...c, [rid]: { ...c[rid], [key]: !c[rid]?.[key] } }));
  const save = async () => { if (await run(() => H.saveNotificationSettings(dirty), 'Đã lưu cấu hình thông báo.')) d.reload(); };
  return (
    <>
      <PageHeader title="Cấu hình thông báo" description="Chọn vai trò nào nhận loại thông báo nào. Mặc định theo quyền của vai trò; thay đổi chỉ áp cho thông báo phát sinh sau khi lưu."
        actions={<button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty.length} data-testid="notify-save">Lưu thay đổi{dirty.length ? ` (${dirty.length})` : ''}</button>} />
      {note}
      <div style={{ overflowX: 'auto' }}>
        <table className="table" data-testid="notify-matrix">
          <thead><tr><th>Vai trò</th>{types.map((t) => <th key={t.key} style={{ textAlign: 'center' }}>{t.label}</th>)}</tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong></td>
                {types.map((t) => <td key={t.key} style={{ textAlign: 'center' }}><input type="checkbox" checked={!!cells[r.id]?.[t.key]} onChange={() => toggle(r.id, t.key)} aria-label={`${r.name} nhận ${t.label}`} data-testid={`nt-${r.id}-${t.key}`} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
