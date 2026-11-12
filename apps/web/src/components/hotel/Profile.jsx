import React, { useEffect, useRef, useState } from 'react';
import { ErrorBox, Field, Loading, ScreenTitle } from '../Common';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { ConfirmButton, fmtDT, useAction, useLoad } from './kit';

const TPL = { FLEXIBLE: 'Linh hoạt', STANDARD: 'Tiêu chuẩn', NON_REFUNDABLE: 'Không hoàn' };
const TYPES = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const MAX_BYTES = 5 * 1024 * 1024; // khớp MAX_IMAGE_BYTES của backend
const MAX_IMAGES = 10;
const API_ERR = { STORAGE_NOT_CONFIGURED: 'Kho ảnh chưa được cấu hình. Vui lòng liên hệ quản trị hệ thống để bật kho ảnh trước khi tải ảnh lên.' };
const errOf = (e) => API_ERR[e?.code] || describeError(e);

function InfoForm({ p, busy, onSave }) {
  const [v, setV] = useState({ description: p.description || '', phone: p.contact?.phone || '', close: p.policy?.receptionCloseHour ?? '', tpl: p.policy?.cancellationTemplate || 'FLEXIBLE', amenities: (p.amenities || []).join(', ') });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSave({
      description: v.description.trim(), phone: v.phone.trim(), cancellationTemplate: v.tpl,
      receptionCloseHour: v.close === '' ? null : Number(v.close),
      amenities: v.amenities.split(',').map((x) => x.trim()).filter(Boolean),
    });
  };
  return (
    <form className="card" onSubmit={submit} data-testid="profile-form">
      <h3>Thông tin</h3>
      <div className="grid-2">
        <Field id="pf-phone" label="Điện thoại liên hệ"><input id="pf-phone" value={v.phone} onChange={set('phone')} required minLength={8} maxLength={20} data-testid="pf-phone" /></Field>
        <Field id="pf-close" label="Giờ đóng lễ tân (0-26, để trống nếu mở 24/7)" hint="Số giờ sau 24 nghĩa là qua nửa đêm, ví dụ 25 = 01:00 sáng hôm sau."><input id="pf-close" type="number" min="0" max="26" value={v.close} onChange={set('close')} data-testid="pf-close" /></Field>
        <Field id="pf-tpl" label="Chính sách hủy"><select id="pf-tpl" value={v.tpl} onChange={set('tpl')} data-testid="pf-tpl">{Object.entries(TPL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
        <Field id="pf-amen" label="Tiện ích (cách nhau bởi dấu phẩy, tối đa 40)"><input id="pf-amen" value={v.amenities} onChange={set('amenities')} data-testid="pf-amenities" /></Field>
      </div>
      <Field id="pf-desc" label="Mô tả (tối đa 5000 ký tự)"><textarea id="pf-desc" rows={4} maxLength={5000} value={v.description} onChange={set('description')} data-testid="pf-desc" /></Field>
      <div className="row-actions"><button className="btn btn-primary" type="submit" disabled={busy} data-testid="pf-save">Lưu thông tin</button></div>
    </form>
  );
}

function Images({ images, busy, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const file = useRef(null);
  const keys = images.map((i) => i.key);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMsg(null);
    if (!TYPES[f.type]) return setMsg({ tone: 'error', text: `Chỉ nhận ảnh ${Object.values(TYPES).join(', ')}.` });
    if (f.size > MAX_BYTES) return setMsg({ tone: 'error', text: 'Ảnh vượt quá 5 MB, vui lòng chọn ảnh nhỏ hơn.' });
    if (keys.length >= MAX_IMAGES) return setMsg({ tone: 'error', text: `Tối đa ${MAX_IMAGES} ảnh. Hãy xóa bớt ảnh cũ trước.` });
    setUploading(true);
    try {
      const up = await H.requestUploadUrl({ folder: 'hotels', contentType: f.type, size: f.size });
      const r = await fetch(up.uploadUrl, { method: up.method || 'PUT', headers: up.headers || { 'Content-Type': f.type }, body: f });
      if (!r.ok) throw Object.assign(new Error('Tải ảnh lên kho thất bại, vui lòng thử lại.'), { code: 'UPLOAD_FAILED' });
      await onChange([...keys, up.key], 'Đã thêm ảnh.');
    } catch (err) { setMsg({ tone: 'error', text: err?.code === 'UPLOAD_FAILED' ? err.message : err instanceof TypeError ? 'Không kết nối được kho ảnh, vui lòng thử lại.' : errOf(err) }); } finally { setUploading(false); }
  };
  const commit = async (k, ok) => { setMsg(null); try { await onChange(k, ok); } catch (err) { setMsg({ tone: 'error', text: errOf(err) }); } };
  const move = (i, d) => { const k = [...keys]; [k[i], k[i + d]] = [k[i + d], k[i]]; commit(k, 'Đã đổi thứ tự ảnh.'); };
  return (
    <section className="card" data-testid="profile-images">
      <h3>Ảnh khách sạn ({keys.length}/{MAX_IMAGES})</h3>
      <p className="muted">Định dạng {Object.values(TYPES).join(', ')}, tối đa 5 MB mỗi ảnh. Ảnh đầu tiên là ảnh đại diện.</p>
      {msg && <p className={msg.tone === 'error' ? 'field-error' : 'muted'} role="alert" data-testid="img-msg">{msg.text}</p>}
      {keys.length === 0 ? <p className="muted" data-testid="img-empty">Chưa có ảnh nào.</p> : (
        <ul className="profile-images">
          {images.map((im, i) => (
            <li key={im.key} data-testid="img-item">
              {im.url ? <img src={im.url} alt={`Ảnh ${i + 1}`} /> : <div className="ph" title={im.key}>Chưa có bản xem trước<br />{im.key}</div>}
              <div className="row-actions">
                <button type="button" className="btn btn-sm" disabled={busy || uploading || i === 0} onClick={() => move(i, -1)} aria-label={`Đưa ảnh ${i + 1} lên trước`} data-testid="img-up">←</button>
                <button type="button" className="btn btn-sm" disabled={busy || uploading || i === keys.length - 1} onClick={() => move(i, 1)} aria-label={`Đưa ảnh ${i + 1} ra sau`} data-testid="img-down">→</button>
                <ConfirmButton label="Xóa" tone="danger" ask="Xóa ảnh này?" disabled={busy || uploading} testid="img-del" onConfirm={() => commit(keys.filter((k) => k !== im.key), 'Đã xóa ảnh.')} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <input ref={file} type="file" accept={Object.keys(TYPES).join(',')} hidden onChange={pick} data-testid="img-file" />
      <div className="row-actions"><button type="button" className="btn btn-primary" disabled={busy || uploading || keys.length >= MAX_IMAGES} onClick={() => file.current?.click()} data-testid="img-add">{uploading ? 'Đang tải lên…' : 'Thêm ảnh'}</button></div>
    </section>
  );
}

// GET/PATCH /v1/hotel/profile + ảnh qua /v1/hotel/media/upload-url (PUT thẳng lên kho, rồi PATCH images theo khóa).
export default function Profile() {
  const l = useLoad(() => H.getProfile(), []);
  const [p, setP] = useState(null);
  const act = useAction();
  useEffect(() => { if (l.data) setP(l.data.profile); }, [l.data]);
  const save = async (body, ok) => {
    let res;
    const done = await act.run(async () => { res = await H.patchProfile(body); }, ok);
    if (done && res) setP(res.profile);
    return done;
  };
  const saveImages = async (keys, ok) => {
    const res = await H.patchProfile({ images: keys });
    setP(res.profile);
    act.run(async () => {}, ok);
  };
  return (
    <>
      <ScreenTitle title="Hồ sơ khách sạn">Thông tin hiển thị cho khách: mô tả, liên hệ, giờ lễ tân, chính sách hủy, tiện ích và ảnh.</ScreenTitle>
      {l.loading && <Loading />}
      {l.err && <ErrorBox onRetry={l.reload}>{describeError(l.err)}</ErrorBox>}
      {p && !l.loading && (
        <>
          <p className="muted"><strong>{p.code}</strong> · {p.name} · {p.address?.line || ''}{p.address?.city ? `, ${p.address.city}` : ''}{p.updatedAt ? ` · cập nhật ${fmtDT(p.updatedAt)}` : ''}</p>
          {act.note}
          <InfoForm key={p.updatedAt} p={p} busy={act.busy} onSave={(b) => save(b, 'Đã lưu hồ sơ khách sạn.')} />
          <Images images={p.images || []} busy={act.busy} onChange={saveImages} />
        </>
      )}
    </>
  );
}
