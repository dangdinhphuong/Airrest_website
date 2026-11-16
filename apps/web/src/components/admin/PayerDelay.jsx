import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, SimBadge } from '../Common';
import { DataTable, EmptyState, ErrorState, FormField as Field, Loading, Modal, PageHeader, Tag } from '../ui';
import { useApp } from '../../state/store';
import { hasPerm } from '../../lib/access';
import { PERM } from '../../lib/perms';
import { createBatch, getBatch, getPickupPoints, getPayerFlightPassengers, listPayerFlights, patchPassenger, previewBatch, requestExtensions, resendPaxEmail, simulateDelay } from '../../data/payer';
import { cols, dt, errText, isoOrUndef } from './kit';
import { CATEGORY, OFFER_STATUS, alertView, batchSummary, chosenUpgrade, defaultPickup, defaultSelected, delayErrText, extensionLabel, hasExtensionAlert, pickupErrText, pickupOptions, proposedOfferIds, pruneChoices, pushAlert, roomUpgradeOptions, toggleGroup, toggleId, unplacedReason, upgradeLabel, upgradesPayload, upgradeTotal, vnd } from './payerDelay';
import { useLiveData } from '../../lib/useRealtime';
import { fmtCountdown, remainingSeconds, useNow } from '../../lib/countdown';
import { money } from '../../lib/time';

const delayErr = (e) => delayErrText(e) || pickupErrText(e) || errText(e);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CAUSE = { AIRLINE: 'Hãng bay', FORCE: 'Bất khả kháng', UNKNOWN: 'Chưa rõ' };

function SimulateModal({ onClose, onDone, onDisabled }) {
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await simulateDelay(isoOrUndef(at)); onDone(); }
    catch (x) {
      // Backend tắt DELAY_SIM_ENABLED thì trả 404/403: ẩn nút.
      if (x?.status === 404 || x?.status === 403) { onDisabled(); onClose(); } else setErr(errText(x));
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Tạo chuyến bay delay (mô phỏng)" size="sm">
      <form onSubmit={submit} data-testid="delay-sim-modal">
        {err && <p className="field-error" role="alert">{err}</p>}
        <Field id="ds-at" label="Delay đến thời điểm"><input id="ds-at" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} data-testid="ds-at" /></Field>
        <div className="row-actions"><button className="btn btn-primary" disabled={busy || !at} data-testid="ds-submit">{busy ? 'Đang tạo…' : 'Tạo chuyến'}</button><button type="button" className="btn" onClick={onClose}>Đóng</button></div>
      </form>
    </Modal>
  );
}


// Sửa email/SĐT của một khách ngay tại chỗ (PATCH /v1/payer/passengers/:id). onSaved nhận { id, email, phone }.
function ContactEdit({ pax, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ email: pax.email || '', phone: pax.phone || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!edit) {
    return (
      <span data-testid="contact-view">
        {pax.email || '—'} · {pax.phone || <b style={{ color: 'var(--red-600, #b91c1c)' }}>chưa có SĐT</b>}{' '}
        <button type="button" className="link-btn" onClick={() => { setF({ email: pax.email || '', phone: pax.phone || '' }); setEdit(true); }} data-testid="contact-edit">Sửa</button>
      </span>
    );
  }
  const save = async () => {
    const email = f.email.trim(); const phone = f.phone.trim();
    if (email && !EMAIL_RE.test(email)) { setErr('Email không đúng định dạng.'); return; }
    const body = {}; if (email !== (pax.email || '')) body.email = email; if (phone !== (pax.phone || '')) body.phone = phone;
    if (!Object.keys(body).length) { setEdit(false); return; }
    setBusy(true); setErr('');
    try { const r = await patchPassenger(pax.id, body); onSaved({ ...pax, ...r }); setEdit(false); }
    catch (e) { setErr(delayErr(e)); } finally { setBusy(false); }
  };
  return (
    <span className="inline-form" data-testid="contact-form">
      <input aria-label="Email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="contact-email" />
      <input aria-label="Số điện thoại" placeholder="Số điện thoại" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="contact-phone" />
      <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save} data-testid="contact-save">{busy ? 'Đang lưu…' : 'Lưu'}</button>
      <button type="button" className="link-btn" onClick={() => setEdit(false)}>Huỷ</button>
      {err && <small className="field-error block" role="alert" data-testid="contact-error">{err}</small>}
    </span>
  );
}

// Gửi lại email xác nhận phòng (chỉ khách thuộc phòng đã CONFIRMED). Thông báo thành công/lỗi ngay cạnh nút.
function ResendEmail({ pax }) {
  const [st, setSt] = useState({ busy: false, msg: '', bad: false });
  const go = async () => {
    setSt({ busy: true, msg: '', bad: false });
    try { const r = await resendPaxEmail(pax.id); setSt({ busy: false, msg: `Đã gửi lại email tới ${r.to}.`, bad: false }); }
    catch (e) { setSt({ busy: false, msg: delayErr(e), bad: true }); }
  };
  return (
    <span data-testid="resend-email">
      <button type="button" className="link-btn" disabled={st.busy} onClick={go} data-testid="resend-email-btn">{st.busy ? 'Đang gửi…' : 'Gửi lại email'}</button>
      {st.msg && <small className={st.bad ? 'field-error block' : 'block'} role={st.bad ? 'alert' : 'status'} data-testid="resend-email-msg">{st.msg}</small>}
    </span>
  );
}

// Xem trước phương án xếp phòng; nhân viên chỉnh email/SĐT người đại diện rồi "Xác nhận đặt".
function PreviewModal({ flightId, airport, ids, repOf, onPaxSaved, onClose, onCreated }) {
  const [s, set] = useState({ data: null, err: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ups, setUps] = useState({}); // nâng hạng: { [unitKey]: roomTypeId }
  const [pp, setPp] = useState({ items: null, value: '' }); // điểm đón: API lỗi thì items=null, ẩn ô chọn, backend dùng mặc định
  useEffect(() => {
    if (!airport) return;
    getPickupPoints(airport).then((r) => setPp({ items: pickupOptions(r), value: defaultPickup(r) }), () => setPp({ items: null, value: '' }));
  }, [airport]);
  const load = useCallback(() => {
    set({ data: null, err: '' });
    previewBatch(flightId, ids).then((r) => { set({ data: r, err: '' }); setUps((c) => pruneChoices(r.units, c)); }, (e) => set({ data: null, err: delayErr(e) }));
  }, [flightId, ids]);
  useEffect(() => { load(); }, [load]);
  const { data } = s;
  const missing = data ? data.units.some((u) => u.phoneMissing) : false;
  const upTotal = data ? upgradeTotal(data.units, ups) : 0;
  const confirm = async () => {
    setBusy(true); setErr('');
    try { onCreated(await createBatch(flightId, ids, pp.items ? pp.value : undefined, upgradesPayload(ups))); } catch (e) { setErr(delayErr(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Phương án đặt phòng nghỉ" size="lg">
      <div data-testid="batch-preview">
        {s.err && <ErrorState onRetry={load}>{s.err}</ErrorState>}
        {!data && !s.err && <Loading />}
        {data && (
          <>
            {!data.units.length && <EmptyState title="Không xếp được phòng nào">Hệ thống không xếp được phòng cho các khách đã chọn. Xem danh sách cần xử lý tay bên dưới.</EmptyState>}
            {data.units.map((u) => {
              const rep = repOf(u);
              return (
                <section key={u.id} className="card-inner" data-testid="preview-unit">
                  <div className="card-head">
                    <strong>{u.hotelName}</strong>
                    <span>PNR {u.pnr} · {money(u.totalVnd)}{u.cluster && <> <Tag tone="info">Cụm có trẻ em</Tag></>}{u.adjacent && <> <Tag tone="info">Phòng sát nhau</Tag></>}{u.connecting && <> <Tag tone="info">Phòng thông nhau</Tag></>}</span>
                  </div>
                  <ul style={{ margin: '4px 0' }}>{u.rooms.map((r, i) => {
                    const opts = roomUpgradeOptions(u, r);
                    const up = chosenUpgrade(r, ups);
                    return (
                      <li key={i}>{up ? <>{up.roomTypeName} <small>(nâng từ {r.roomTypeName})</small></> : r.roomTypeName} · {r.paxIds.length} khách · {money(r.priceVnd)}{up && <> + {money(up.deltaVnd)} chênh</>}
                        {opts.length > 0 && (
                          <label style={{ marginLeft: 8 }}>Nâng hạng{' '}
                            <select aria-label={`Nâng hạng phòng ${r.roomTypeName}`} value={ups[r.unitKey] || ''} onChange={(e) => setUps((c) => ({ ...c, [r.unitKey]: e.target.value }))} data-testid="upgrade-select">
                              <option value="">Giữ hạng chuẩn</option>
                              {opts.map((o) => <option key={o.roomTypeId} value={o.roomTypeId}>{upgradeLabel(o)}</option>)}
                            </select>
                          </label>
                        )}
                      </li>
                    );
                  })}</ul>
                  <small>Giờ ở: {dt(u.stay.checkInAt)} → phải rời khách sạn lúc {dt(u.stay.checkOutAt)}</small>
                  <div>
                    Liên hệ: {u.contact.fullName}{rep && <> — <ContactEdit pax={{ ...rep, email: u.contact.email, phone: u.contact.phone }} onSaved={(p) => { onPaxSaved(p); load(); }} /></>}
                    {u.phoneMissing && <small className="field-error block" role="alert" data-testid="phone-missing">Người đại diện chưa có số điện thoại, hãy nhập trước khi đặt.</small>}
                  </div>
                </section>
              );
            })}
            {upTotal > 0 && <Notice tone="info" title="Phần chênh nâng hạng"><span data-testid="upgrade-total">Tổng chênh nâng hạng: <b>{vnd(upTotal)}</b>. Khách tự thanh toán phần chênh với đơn vị chi trả (Airrest không thu tiền khách). Chỉ nâng được ở bước này, trước khi gửi khách sạn.</span></Notice>}
            {pp.items && (
              <Field id="pickup-point" label="Điểm đón ở sân bay">
                <select id="pickup-point" value={pp.value} onChange={(e) => setPp({ ...pp, value: e.target.value })} data-testid="pickup-point">{pp.items.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </Field>
            )}
            {data.unplaced.length > 0 && (
              <Notice tone="warn" title={`Cần xử lý tay (${data.unplaced.length} khách)`}>
                <ul data-testid="unplaced-list" style={{ margin: 0 }}>{data.unplaced.map((u) => <li key={u.paxId}>PNR {u.pnr}: {unplacedReason(u.reason)}</li>)}</ul>
              </Notice>
            )}
            {err && <p className="field-error" role="alert" data-testid="batch-error">{err}</p>}
          </>
        )}
        <div className="row-actions">
          <button type="button" className="btn btn-primary" disabled={busy || !data || !data.units.length || missing} onClick={confirm} data-testid="batch-confirm">{busy ? 'Đang đặt…' : 'Xác nhận đặt'}</button>
          <button type="button" className="btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </Modal>
  );
}

// Theo dõi lô: làm mới ~5 giây + realtime (phòng payer:*:alerts, sự kiện delay:*); đồng hồ đếm ngược chạy từng giây ở client.
function BatchView({ id, onBack }) {
  const { state } = useApp();
  const [alerts, setAlerts] = useState([]);
  const [ext, setExt] = useState({ busy: false, msg: '', bad: false });
  const manage = hasPerm(state.session, PERM.PAYER_DELAY_MANAGE);
  const live = useLiveData(() => getBatch(id), [id], state.session?.id, {
    pollMs: 5000,
    refreshOn: (n) => n.startsWith('delay:'),
    onEvent: (n, p) => { if (n === 'delay:alert' && (!p?.batchId || p.batchId === id)) setAlerts((l) => pushAlert(l, p)); },
  });
  const now = useNow();
  const at = useMemo(() => Date.now(), [live.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = live.data;
  const sum = batchSummary(b);
  const proposed = proposedOfferIds(b);
  const askExtension = async () => {
    setExt({ busy: true, msg: '', bad: false });
    try {
      const r = await requestExtensions(id);
      setExt({ busy: false, msg: `Đã gửi yêu cầu gia hạn cho khách sạn (${r.requested.length} phòng). Chờ khách sạn đồng ý.`, bad: false });
      setAlerts((l) => l.filter((a) => a.kind !== 'FLIGHT_DELAYED_LATER'));
      live.reload();
    } catch (e) { setExt({ busy: false, msg: delayErr(e), bad: true }); }
  };
  return (
    <>
      <PageHeader title="Theo dõi lô đặt phòng" description="Cập nhật tự động; khách chỉ nhận email sau khi khách sạn xác nhận." back={{ onClick: onBack, label: 'Về danh sách hành khách' }} />
      {alerts.map((a) => { const v = alertView(a, b); return <Notice key={`${a.kind}|${a.offerId || a.groupId}`} tone={v.tone} title={v.title} role="alert" onClose={() => setAlerts((l) => l.filter((x) => x !== a))}><span data-testid="delay-alert" data-kind={a.kind}>{v.text}</span></Notice>; })}
      {(proposed.length > 0 || hasExtensionAlert(alerts)) && (
        <div className="row-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-primary" disabled={!manage || ext.busy || !proposed.length} onClick={askExtension} data-testid="extension-request">{ext.busy ? 'Đang gửi…' : 'Gửi yêu cầu gia hạn cho khách sạn'}</button>
          {!manage && <small>Bạn chưa có quyền gửi yêu cầu gia hạn.</small>}
        </div>
      )}
      {ext.msg && <p className={ext.bad ? 'field-error' : undefined} role={ext.bad ? 'alert' : 'status'} data-testid="extension-msg">{ext.msg}</p>}
      {live.err && !b && <ErrorState onRetry={live.reload}>{delayErr(live.err)}</ErrorState>}
      {!b && !live.err && <Loading />}
      {b && (
        <>
          {b.pickupPoint && <p data-testid="batch-pickup">Điểm đón ở sân bay: <b>{b.pickupPoint}</b></p>}
          <p data-testid="batch-summary">Đang chờ: <b>{sum.waiting}</b> · Đang chuyển khách sạn: <b>{sum.transferring}</b> · Đã xác nhận: <b>{sum.confirmed}</b> · Cần xử lý tay: <b>{sum.failedGroups + sum.unplaced}</b></p>
          {sum.failedGroups > 0 && <Notice tone="error" title="Cần xử lý tay" role="alert"><span data-testid="failed-groups">{b.groups.filter((g) => g.status === 'FAILED').map((g) => `${g.code} (PNR ${g.pnr})`).join(', ')}: hệ thống đã hết cách chuyển khách sạn. Hãy liên hệ khách và xếp chỗ thủ công.</span></Notice>}
          {b.offers.length > 0 && (
            <DataTable rows={b.offers} columns={cols([
              ['Nhóm', (o) => o.groupCode],
              ['Khách sạn', (o) => o.hotelName],
              ['Phòng', (o) => <>{o.roomTypeName} × {o.qty}{o.upgradeDeltaVnd > 0 && <small className="block" data-testid="offer-upgrade">Nâng từ {o.upgradedFrom} · chênh {vnd(o.upgradeDeltaVnd)} (khách tự thanh toán với đơn vị chi trả)</small>}</>],
              ['Trạng thái', (o) => { const [t, tone] = OFFER_STATUS[o.status] || [o.status, 'neutral']; return <><Tag tone={tone}>{t}</Tag>{o.status === 'PENDING' && o.transferCount > 0 && <> <Tag tone="warn">Đã chuyển {o.transferCount} lần</Tag></>}{(() => { const x = extensionLabel(o); return x && <> <Tag tone={x[1]}>{x[0]}</Tag></>; })()}</>; }],
              ['Còn lại', (o) => { if (o.status !== 'PENDING') return '—'; const r = remainingSeconds(o.secondsLeft, at, now); return <b data-testid="offer-countdown" style={r < 60 ? { color: '#b91c1c' } : undefined}>{fmtCountdown(r)}</b>; }],
              ['Số phòng / mã đơn', (o) => (o.status === 'CONFIRMED' ? <>{(o.roomNumbers || []).join(', ') || '—'}{o.bookingCode && <> · {o.bookingCode}</>}</> : o.rejectReason || '—')]])} />
          )}
          {b.unplaced.length > 0 && <Notice tone="warn" title={`Chưa xếp được (${b.unplaced.length} khách)`}><ul style={{ margin: 0 }}>{b.unplaced.map((u) => <li key={u.paxId}>PNR {u.pnr}: {unplacedReason(u.reason)}</li>)}</ul></Notice>}
          {!b.offers.length && !b.unplaced.length && <EmptyState title="Lô chưa có phòng">Chưa có yêu cầu phòng nào trong lô này.</EmptyState>}
        </>
      )}
    </>
  );
}

function Detail({ id, onBack }) {
  const [s, set] = useState({ data: null, err: null });
  const [sel, setSel] = useState(new Set());
  const [preview, setPreview] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const load = useCallback(() => {
    set({ data: null, err: null });
    getPayerFlightPassengers(id).then((r) => { set({ data: r, err: null }); setSel(defaultSelected(r.groups)); }, (e) => set({ data: null, err: errText(e) }));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const { data } = s;
  const manage = hasPerm(useApp().state.session, PERM.PAYER_DELAY_MANAGE);
  const ids = useMemo(() => [...sel], [sel]);
  // Cập nhật khách tại chỗ sau khi sửa email/SĐT (không tải lại để giữ nguyên lựa chọn).
  const paxSaved = (p) => set((st) => ({ ...st, data: { ...st.data, groups: st.data.groups.map((g) => ({ ...g, passengers: g.passengers.map((x) => (x.id === p.id ? { ...x, email: p.email, phone: p.phone } : x)) })) } }));
  const repOf = (u) => { const g = data.groups.find((x) => x.pnr === u.pnr); return g?.passengers.find((x) => x.isRepresentative) || g?.passengers[0]; };
  if (batchId) return <BatchView id={batchId} onBack={() => setBatchId(null)} />;
  const total = data ? data.groups.reduce((n, g) => n + g.passengers.length, 0) : 0;
  return (
    <>
      {!data && <PageHeader title="Hành khách chuyến delay" back={{ onClick: onBack }} />}
      {s.err && <ErrorState onRetry={load}>{s.err}</ErrorState>}
      {!data && !s.err && <Loading />}
      {data && (
        <>
          <PageHeader title={`${data.flight.code} · ${data.flight.origin} → ${data.flight.dest}`} back={{ onClick: onBack }}
            description={`Giờ dự kiến ${dt(data.flight.scheduledDepartureAt)} · giờ bay mới ${data.flight.newDepartureAt ? dt(data.flight.newDepartureAt) : 'chưa biết'}${data.flight.cause ? ` · ${CAUSE[data.flight.cause] || data.flight.cause}` : ''}`} />
          {!data.groups.length && <EmptyState title="Chưa có hành khách">Chuyến này chưa có hành khách.</EmptyState>}
          {data.groups.map((g) => {
            const all = g.passengers.every((p) => sel.has(p.id));
            return (
              <section key={g.pnr} className="card" data-testid="pnr-group">
                <div className="card-head"><h3>PNR {g.pnr}</h3><label><input type="checkbox" checked={all} onChange={() => setSel(toggleGroup(sel, g))} /> Chọn cả nhóm</label></div>
                <DataTable rows={g.passengers} columns={cols([
                  ['Nhận phòng', (p) => <input type="checkbox" aria-label={`Chọn ${p.fullName}`} checked={sel.has(p.id)} onChange={() => setSel(toggleId(sel, p.id))} data-testid="pax-check" />],
                  ['Họ tên', (p) => <>{p.fullName}{p.isRepresentative && <> <Tag tone="ok">Đại diện</Tag></>}{p.simulated && <> <SimBadge>Mô phỏng</SimBadge></>}</>],
                  ['Loại', (p) => `${CATEGORY[p.category] || p.category}${p.age != null ? ` (${p.age} tuổi)` : ''}`],
                  ['Email / điện thoại', (p) => (manage ? <><ContactEdit key={`${p.email}|${p.phone}`} pax={p} onSaved={paxSaved} />{p.roomConfirmed && <ResendEmail pax={p} />}</> : `${p.email || '—'} · ${p.phone || '—'}`)],
                  ['Nhu cầu đặc biệt', (p) => (p.specialNeeds?.length ? p.specialNeeds.join(', ') : '—')]])} />
              </section>
            );
          })}
          <div className="row-actions">
            <button type="button" className="btn btn-primary" disabled={!manage || !sel.size} onClick={() => setPreview(true)} data-testid="book-rooms">Đặt phòng nghỉ ({sel.size}/{total})</button>
            {!manage && <small>Bạn chưa có quyền đặt phòng cho khách delay.</small>}
          </div>
          {preview && <PreviewModal flightId={id} airport={data.flight.origin} ids={ids} repOf={repOf} onPaxSaved={paxSaved} onClose={() => setPreview(false)} onCreated={(b) => { setPreview(false); setBatchId(b.id); }} />}
        </>
      )}
    </>
  );
}

export default function PayerDelay() {
  const { state } = useApp();
  const manage = hasPerm(state.session, PERM.PAYER_DELAY_MANAGE);
  const [simOff, setSimOff] = useState(false);
  const [modal, setModal] = useState(false);
  const [done, setDone] = useState('');
  const [open, setOpen] = useState(null);
  const [s, set] = useState({ items: [], next: null, loading: true, err: null });
  const load = useCallback(async (cursor) => {
    set((p) => ({ ...p, loading: true, err: null, ...(cursor == null ? { items: [] } : {}) }));
    try { const r = await listPayerFlights(cursor ?? undefined); set((p) => ({ items: cursor == null ? r.items : [...p.items, ...r.items], next: r.nextCursor ?? null, loading: false, err: null })); }
    catch (e) { set((p) => ({ ...p, loading: false, err: errText(e) })); }
  }, []);
  useEffect(() => { load(null); }, [load]);

  if (open) return <Detail id={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <PageHeader title="Chuyến bay delay" description="Các chuyến delay của sân bay trạm"
        actions={manage && !simOff && <button type="button" className="btn btn-primary" onClick={() => setModal(true)} data-testid="delay-sim-open">Tạo chuyến bay delay</button>} />
      {modal && <SimulateModal onClose={() => setModal(false)} onDisabled={() => setSimOff(true)} onDone={() => { setModal(false); setDone('Đã tạo chuyến bay delay mô phỏng.'); load(null); }} />}
      {done && <Notice tone="ok" onClose={() => setDone('')}>{done}</Notice>}
      <DataTable emptyTitle="Chưa có chuyến delay" empty="Hiện không có chuyến delay nào ở sân bay của bạn."
        rows={s.items} loading={s.loading} error={s.err} onRetry={() => load(null)} hasMore={s.next != null} onLoadMore={() => load(s.next)} loadingMore={s.loading}
        columns={cols([
              ['Chuyến', (f) => <>{f.code}{f.simulated && <> <SimBadge>Mô phỏng</SimBadge></>}</>],
              ['Hãng', (f) => f.airline || '—'], ['Tuyến', (f) => `${f.origin} → ${f.dest}`],
              ['Giờ dự kiến', (f) => dt(f.scheduledDepartureAt)], ['Giờ bay mới', (f) => (f.newDepartureAt ? dt(f.newDepartureAt) : 'Chưa biết')],
              ['Nguyên nhân', (f) => CAUSE[f.cause] || '—'], ['Số khách', (f) => f.paxCount],
              ['', (f) => <button type="button" className="btn btn-sm" onClick={() => setOpen(f.id)} data-testid="delay-open">Xem hành khách</button>]])} />
    </>
  );
}
