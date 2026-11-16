import React, { useState } from 'react';
import { DataTable, FormField, Modal, PageHeader, StatusBadge, Tag } from '../ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { putConfig } from '../../data/admin';
import { Json, LoadView, cols, dt, isoOrUndef, useLoad, useRun } from './kit';

const VST = { ACTIVE: ['Đang dùng', 'ok'], SCHEDULED: ['Đã lên lịch', 'info'] };

function Versions({ k }) {
  const r = useLoad(`/configs/${encodeURIComponent(k)}/versions`, { limit: 50 });
  return (
    <LoadView r={r}>{({ items }) => (
      <DataTable rowKey={(v) => v.version} rows={items} empty="Chưa có phiên bản nào (đang dùng mặc định)." columns={cols([['Phiên bản', (v) => `v${v.version}`], ['Trạng thái', (v) => <StatusBadge status={v.status} map={VST} />], ['Hiệu lực từ', (v) => dt(v.effectiveFrom)], ['Người sửa', (v) => v.changedBy?.name || v.changedBy?.id?.slice(0, 8) || '—'], ['Lý do', (v) => v.reason], ['Giá trị', (v) => <Json v={v.value} />]])} />
    )}</LoadView>
  );
}

function Edit({ c, onDone }) {
  const [val, setVal] = useState(JSON.stringify(c.value, null, 2));
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [parseErr, setParseErr] = useState('');
  const { run, busy, node } = useRun();
  const save = async (e) => {
    e.preventDefault();
    let value;
    try { value = JSON.parse(val); } catch { setParseErr('Giá trị không phải JSON hợp lệ.'); return; }
    setParseErr('');
    const x = await run(() => putConfig(c.key, { value, reason, ...(from && { effectiveFrom: isoOrUndef(from) }) }), 'Đã lưu phiên bản mới.');
    if (x.ok) onDone();
  };
  return (
    <Modal open onClose={onDone} title={`Sửa ${c.key}`} size="lg">
    <form onSubmit={save} data-testid="config-edit">
      {node}
      <FormField id="cf-val" label="Giá trị (JSON)" error={parseErr}><textarea id="cf-val" rows={8} style={{ width: '100%', fontFamily: 'monospace' }} value={val} onChange={(e) => setVal(e.target.value)} /></FormField>
      <div className="grid-2">
        <FormField id="cf-reason" label="Lý do (bắt buộc)"><input id="cf-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} /></FormField>
        <FormField id="cf-from" label="Hiệu lực từ (để trống = ngay)"><input id="cf-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
      </div>
      <div className="row-actions"><button className="btn btn-primary" disabled={busy} data-testid="config-save">Lưu phiên bản mới</button><button type="button" className="btn" onClick={onDone}>Huỷ</button></div>
    </form>
    </Modal>
  );
}

export default function Configs() {
  const { state } = useApp();
  const r = useLoad('/configs');
  const [edit, setEdit] = useState(null);
  const [ver, setVer] = useState(null);
  return (
    <>
      <PageHeader title="Cấu hình" description="Tham số hệ thống có phiên bản" />
      <LoadView r={r}>{({ items }) => (
        <>
          {edit && <Edit c={edit} onDone={() => { setEdit(null); r.reload(); if (ver) { const v = ver; setVer(null); setTimeout(() => setVer(v), 0); } }} />}
          {items.map((c) => (
            <section className="card" key={c.key} data-testid={`cfg-${c.key}`}>
              <div className="card-head"><h3>{c.key} <Tag tone={c.isDefault ? 'neutral' : 'ok'}>{c.isDefault ? 'Mặc định' : `v${c.version}`}</Tag></h3>
                <span className="inline-form">
                  <button type="button" className="btn btn-sm" onClick={() => setVer(ver === c.key ? null : c.key)} data-testid="cfg-versions">Lịch sử</button>
                  {hasPerm(state.session, c.writePerm) ? <button type="button" className="btn btn-sm btn-primary" onClick={() => setEdit(c)} data-testid="cfg-edit">Sửa</button> : <small className="muted" title={`Cần quyền ${c.writePerm}`}>Không đủ quyền sửa</small>}
                </span></div>
              <Json v={c.value} />
              {c.scheduled.length > 0 && <p className="muted">Đã lên lịch: {c.scheduled.map((s) => `v${s.version} từ ${dt(s.effectiveFrom)}`).join('; ')}</p>}
              {ver === c.key && <Versions k={c.key} />}
            </section>
          ))}
        </>
      )}</LoadView>
    </>
  );
}
