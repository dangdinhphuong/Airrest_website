import React, { useRef, useState } from 'react';
import { describeError } from '../../lib/api';
import * as H from '../../data/hotel';
import { ConfirmAction, EmptyState } from '../ui';
import { checkImageFiles, IMAGE_TYPES, makeCover, moveItem } from './roomLogic';

const API_ERR = { STORAGE_NOT_CONFIGURED: 'Kho ảnh chưa được cấu hình. Vui lòng liên hệ quản trị hệ thống để bật kho ảnh trước khi tải ảnh lên.' };

// Ảnh có thứ tự (ảnh đầu = ảnh bìa). items: [{ key, url? }]; onChange(items mới). Tải thẳng lên kho (presigned) rồi chỉ lưu khóa ảnh.
export default function ImagePicker({ items, max, onChange, disabled, folder = 'rooms' }) {
  const [uploading, setUploading] = useState(false);
  const [errs, setErrs] = useState([]);
  const file = useRef(null);
  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const { ok, errors } = checkImageFiles(files, items.length, max);
    const next = [...items];
    setErrs(errors);
    setUploading(true);
    for (const f of ok) {
      try {
        const up = await H.requestUploadUrl({ folder, contentType: f.type, size: f.size });
        const r = await fetch(up.uploadUrl, { method: up.method || 'PUT', headers: up.headers || { 'Content-Type': f.type }, body: f });
        if (!r.ok) throw Object.assign(new Error('Tải ảnh lên kho thất bại, vui lòng thử lại.'), { code: 'UPLOAD_FAILED' });
        next.push({ key: up.key, url: up.publicUrl || URL.createObjectURL(f) }); // xem trước ngay cả khi kho chưa có URL công khai
      } catch (err) {
        const text = err?.code === 'UPLOAD_FAILED' ? err.message : err instanceof TypeError ? 'Không kết nối được kho ảnh, vui lòng thử lại.' : API_ERR[err?.code] || describeError(err);
        setErrs((x) => [...x, `${f.name}: ${text}`]);
        break;
      }
    }
    setUploading(false);
    if (next.length !== items.length) onChange(next);
  };
  const off = disabled || uploading;
  return (
    <div data-testid="img-picker">
      <p className="muted">Ảnh {items.length}/{max}. Định dạng {Object.values(IMAGE_TYPES).join(', ')}, tối đa 5 MB mỗi ảnh. Ảnh đầu tiên là ảnh bìa.</p>
      {errs.map((t) => <p key={t} className="field-error" role="alert" data-testid="img-err">{t}</p>)}
      {items.length === 0 ? <EmptyState title="Chưa có ảnh" testid="img-empty">Chưa có ảnh nào.</EmptyState> : (
        <ul className="profile-images">
          {items.map((im, i) => (
            <li key={im.key} data-testid="img-item">
              {im.url ? <img src={im.url} alt={`Ảnh ${i + 1}`} /> : <div className="ph" title={im.key}>Chưa có bản xem trước</div>}
              {i === 0 && <small data-testid="img-cover"><strong>Ảnh bìa</strong></small>}
              <div className="row-actions">
                <button type="button" className="btn btn-sm" disabled={off || i === 0} onClick={() => onChange(moveItem(items, i, -1))} aria-label={`Đưa ảnh ${i + 1} lên trước`} data-testid="img-up">←</button>
                <button type="button" className="btn btn-sm" disabled={off || i === items.length - 1} onClick={() => onChange(moveItem(items, i, 1))} aria-label={`Đưa ảnh ${i + 1} ra sau`} data-testid="img-down">→</button>
                {i > 0 && <button type="button" className="btn btn-sm" disabled={off} onClick={() => onChange(makeCover(items, i))} data-testid="img-cover-set">Đặt làm bìa</button>}
                <ConfirmAction label="Xóa" title="Xóa ảnh" tone="danger" ask="Xóa ảnh này?" disabled={off} testid="img-del" onConfirm={() => onChange(items.filter((x) => x.key !== im.key))} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <input ref={file} type="file" multiple accept={Object.keys(IMAGE_TYPES).join(',')} hidden onChange={pick} data-testid="img-file" />
      <div className="row-actions"><button type="button" className="btn btn-sm btn-primary" disabled={off || items.length >= max} onClick={() => file.current?.click()} data-testid="img-add">{uploading ? 'Đang tải lên…' : 'Thêm ảnh'}</button></div>
    </div>
  );
}
