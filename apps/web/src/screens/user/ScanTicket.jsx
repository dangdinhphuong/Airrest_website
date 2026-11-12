import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, X } from 'lucide-react';
import { parseBcbp } from '../../lib/bcbp';

// Bộ giải mã (~1,4 MB wasm) chỉ tải khi người dùng mở cửa sổ quét; wasm phục vụ cùng origin, không qua CDN.
let readerPromise;
const loadReader = () => (readerPromise ??= (async () => {
  const [{ readBarcodes, prepareZXingModule }, wasm] = await Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')]);
  prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm.default : prefix + path) }, fireImmediately: true });
  return readBarcodes;
})().catch((e) => { readerPromise = undefined; throw e; }));

const OPTS = { formats: ['PDF417', 'QRCode', 'Aztec', 'DataMatrix'], tryHarder: true, maxNumberOfSymbols: 1 };
const NOT_BCBP = 'Không đọc được thẻ lên tàu hợp lệ trong ảnh này. Hãy thử lại hoặc nhập số hiệu chuyến bay thủ công.';

// Cửa sổ quét thẻ lên tàu: camera hoặc ảnh. onResult({ flight, date }) chỉ nhận số hiệu và ngày bay.
export default function ScanTicket({ onResult, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [state, setState] = useState('starting'); // starting | scanning | busy | nocam
  const [msg, setMsg] = useState('');

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  const done = (text) => {
    const p = parseBcbp(text);
    if (!p) return false;
    stop(); onResult(p); return true;
  };

  useEffect(() => {
    let alive = true;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera');
        const [readBarcodes, s] = await Promise.all([loadReader(), navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })]);
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s; video.current.srcObject = s; await video.current.play();
        setState('scanning');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let seen = '';
        while (alive && stream.current) {
          const v = video.current;
          if (v && v.videoWidth) {
            const k = Math.min(1, 1280 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * k); canvas.height = Math.round(v.videoHeight * k);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const [hit] = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), OPTS);
            if (hit?.isValid && hit.text !== seen) {
              seen = hit.text;
              if (done(hit.text)) return;
              if (alive) setMsg('Mã này không phải thẻ lên tàu. Hãy hướng camera vào mã trên thẻ lên tàu.');
            }
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (e) {
        if (!alive) return;
        setState('nocam');
        setMsg(e?.name === 'NotAllowedError' ? 'Bạn chưa cho phép dùng camera. Hãy cấp quyền hoặc tải ảnh thẻ lên tàu.' : 'Không mở được camera trên thiết bị này. Hãy tải ảnh thẻ lên tàu.');
      }
    })();
    return () => { alive = false; window.removeEventListener('keydown', onKey); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fromFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('Vui lòng chọn tệp ảnh (JPG, PNG, WebP).'); return; }
    setState('busy'); setMsg('');
    try {
      const readBarcodes = await loadReader();
      const [hit] = await readBarcodes(file, OPTS);
      if (hit?.isValid && done(hit.text)) return;
      setMsg(NOT_BCBP);
    } catch { setMsg('Không xử lý được ảnh này. Hãy thử ảnh khác.'); }
    setState(stream.current ? 'scanning' : 'nocam');
  };

  return (
    <div className="tw:fixed tw:inset-0 tw:z-[70] tw:grid tw:place-items-center tw:bg-slate-900/70 tw:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Quét mã thẻ lên tàu" onClick={(e) => e.stopPropagation()} className="tw:w-full tw:max-w-md tw:overflow-hidden tw:rounded-3xl tw:bg-white tw:shadow-2xl">
        <header className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-slate-200 tw:px-5 tw:py-4">
          <h2 className="tw:text-base tw:font-extrabold tw:text-[#062253]">Quét mã thẻ lên tàu</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="tw:grid tw:size-9 tw:place-items-center tw:rounded-full tw:bg-slate-100 tw:text-slate-600 tw:hover:bg-slate-200"><X size={16} /></button>
        </header>
        <div className="tw:p-5">
          {state !== 'nocam' && (
            <div className="tw:relative tw:aspect-[4/3] tw:overflow-hidden tw:rounded-2xl tw:bg-slate-900">
              <video ref={video} muted playsInline className="tw:size-full tw:object-cover" />
              <div className="tw:pointer-events-none tw:absolute tw:inset-6 tw:rounded-xl tw:border-2 tw:border-white/80" />
              {state === 'starting' && <p className="tw:absolute tw:inset-0 tw:grid tw:place-items-center tw:text-sm tw:font-semibold tw:text-white">Đang mở camera…</p>}
              {state === 'busy' && <p className="tw:absolute tw:inset-0 tw:grid tw:place-items-center tw:bg-slate-900/60 tw:text-sm tw:font-semibold tw:text-white">Đang đọc ảnh…</p>}
            </div>
          )}
          <p className="tw:mt-3 tw:text-xs tw:leading-5 tw:text-slate-500">
            {state === 'nocam' ? <Camera size={14} className="tw:mr-1 tw:inline" /> : null}
            {msg || 'Đưa mã vạch/QR trên thẻ lên tàu vào khung. Chỉ số hiệu chuyến bay và ngày bay được dùng, tên và mã đặt chỗ không được lưu hay gửi đi.'}
          </p>
          {msg && state !== 'nocam' && <p role="alert" className="tw:sr-only">{msg}</p>}
          <label className="tw:mt-4 tw:flex tw:min-h-11 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-slate-300 tw:px-4 tw:text-sm tw:font-bold tw:text-slate-700 tw:hover:bg-slate-50">
            <ImageUp size={17} /> Tải ảnh thẻ lên tàu
            <input type="file" accept="image/*" className="tw:sr-only" onChange={fromFile} />
          </label>
        </div>
      </section>
    </div>
  );
}
