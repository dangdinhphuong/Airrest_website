import React, { useEffect, useState } from 'react';
import { ErrorState, FormField, Loading, PageHeader } from '../ui';
import ImagePicker from './ImagePicker';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { fmtDT, useAction, useLoad } from './kit';
import Select from '../Select';

const TPL = { FLEXIBLE: 'Linh hoạt', STANDARD: 'Tiêu chuẩn', NON_REFUNDABLE: 'Không hoàn' };
const MAX_IMAGES = 10;

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

// GET/PATCH /api/v1/hotel/profile + ảnh qua /api/v1/hotel/media/upload-url (PUT thẳng lên kho, rồi PATCH images theo khóa).
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
          <section className="card" data-testid="profile-images">
            <h3>Ảnh khách sạn ({(p.images || []).length}/{MAX_IMAGES})</h3>
            <p className="muted">Chọn được nhiều ảnh một lần. Ảnh hiển thị cho khách ở trang khách sạn và danh sách tìm kiếm.</p>
            <ImagePicker items={p.images || []} max={MAX_IMAGES} folder="hotels" disabled={act.busy} onChange={(items) => save({ images: items.map((i) => i.key) }, 'Đã cập nhật ảnh khách sạn.')} />
          </section>
        </>
      )}
    </>
  );
}
