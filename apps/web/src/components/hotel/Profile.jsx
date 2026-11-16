import React, { useEffect, useRef, useState } from 'react';
import { ConfirmAction, EmptyState, ErrorState, FormField, Loading, PageHeader } from '../ui';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { fmtDT, useAction, useLoad } from './kit';
import Select from '../Select';

const TPL = { FLEXIBLE: 'Linh hoạt', STANDARD: 'Tiêu chuẩn', NON_REFUNDABLE: 'Không hoàn' };
const TYPES = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const MAX_BYTES = 5 * 1024 * 1024; // khớp MAX_IMAGE_BYTES của backend
const MAX_IMAGES = 10;
const API_ERR = { STORAGE_NOT_CONFIGURED: 'Kho ảnh chưa được cấu hình. Vui lòng liên hệ quản trị hệ thống để bật kho ảnh trước khi tải ảnh lên.' };
const errOf = (e) => API_ERR[e?.code] || describeError(e);

function InfoForm({ p, busy, onSave }) {
  const [v, setV] = useState({ description: p.description || '', phone: p.contact?.phone || '', close: p.policy?.receptionCloseHour ?? '', tpl: p.policy?.cancellationTemplate || 'FLEXIBLE', amenities: (p.amenities || []).join(', '), cin: p.policy?.checkInTime || '14:00', cout: p.policy?.checkOutTime || '12:00', child: p.policy?.childPolicy || '', pets: p.policy?.petsAllowed ? 'yes' : 'no' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSave({
      description: v.description.trim(), phone: v.phone.trim(), cancellationTemplate: v.tpl,
      receptionCloseHour: v.close === '' ? null : Number(v.close),
      checkInTime: v.cin, checkOutTime: v.cout, childPolicy: v.child.trim() || null, petsAllowed: v.pets === 'yes',
      amenities: v.amenities.split(',').map((x) => x.trim()).filter(Boolean),
    });
  };
  return (
    <form className="card" onSubmit={submit} data-testid="profile-form">
      <h3>Thông tin</h3>
      <div className="grid-2">
        <FormField id="pf-phone" label="Điện thoại liên hệ"><input id="pf-phone" value={v.phone} onChange={set('phone')} required minLength={8} maxLength={20} data-testid="pf-phone" /></FormField>
        <FormField id="pf-close" label="Giờ đóng lễ tân (0-26, để trống nếu mở 24/7)" hint="Số giờ sau 24 nghĩa là qua nửa đêm, ví dụ 25 = 01:00 sáng hôm sau."><input id="pf-close" type="number" min="0" max="26" value={v.close} onChange={set('close')} data-testid="pf-close" /></FormField>
        <FormField id="pf-tpl" label="Chính sách hủy"><Select id="pf-tpl" value={v.tpl} onChange={set('tpl')} data-testid="pf-tpl">{Object.entries(TPL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></FormField>
        <FormField id="pf-amen" label="Tiện ích (cách nhau bởi dấu phẩy, tối đa 40)"><input id="pf-amen" value={v.amenities} onChange={set('amenities')} data-testid="pf-amenities" /></FormField>
        <FormField id="pf-cin" label="Giờ nhận phòng"><input id="pf-cin" type="time" required value={v.cin} onChange={set('cin')} data-testid="pf-checkin" /></FormField>
        <FormField id="pf-cout" label="Giờ trả phòng"><input id="pf-cout" type="time" required value={v.cout} onChange={set('cout')} data-testid="pf-checkout" /></FormField>
        <FormField id="pf-pets" label="Thú cưng"><Select id="pf-pets" value={v.pets} onChange={set('pets')} data-testid="pf-pets"><option value="no">Không cho phép</option><option value="yes">Cho phép</option></Select></FormField>
        <FormField id="pf-child" label="Chính sách trẻ em (tối đa 500 ký tự)"><input id="pf-child" maxLength={500} value={v.child} onChange={set('child')} placeholder="Ví dụ: Trẻ dưới 6 tuổi ở miễn phí nếu dùng giường có sẵn" data-testid="pf-child" /></FormField>
      </div>
      <FormField id="pf-desc" label="Mô tả (tối đa 5000 ký tự)"><textarea id="pf-desc" rows={4} maxLength={5000} value={v.description} onChange={set('description')} data-testid="pf-desc" /></FormField>
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
      {keys.length === 0 ? <EmptyState title="Chưa có ảnh" testid="img-empty">Chưa có ảnh nào.</EmptyState> : (
        <ul className="profile-images">
          {images.map((im, i) => (
            <li key={im.key} data-testid="img-item">
              {im.url ? <img src={im.url} alt={`Ảnh ${i + 1}`} /> : <div className="ph" title={im.key}>Chưa có bản xem trước<br />{im.key}</div>}
              <div className="row-actions">
                <button type="button" className="btn btn-sm" disabled={busy || uploading || i === 0} onClick={() => move(i, -1)} aria-label={`Đưa ảnh ${i + 1} lên trước`} data-testid="img-up">←</button>
                <button type="button" className="btn btn-sm" disabled={busy || uploading || i === keys.length - 1} onClick={() => move(i, 1)} aria-label={`Đưa ảnh ${i + 1} ra sau`} data-testid="img-down">→</button>
                <ConfirmAction label="Xóa" title="Xóa ảnh" tone="danger" ask="Xóa ảnh này?" disabled={busy || uploading} testid="img-del" onConfirm={() => commit(keys.filter((k) => k !== im.key), 'Đã xóa ảnh.')} />
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
      <PageHeader title="Hồ sơ khách sạn" description="Thông tin hiển thị cho khách: mô tả, liên hệ, giờ lễ tân, chính sách hủy, tiện ích và ảnh." />
      {l.loading && <Loading />}
      {l.err && <ErrorState onRetry={l.reload}>{describeError(l.err)}</ErrorState>}
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
