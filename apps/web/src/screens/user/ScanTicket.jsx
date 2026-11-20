import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, X } from 'lucide-react';
import { parseBcbp } from '../../lib/bcbp';
import { ocrImage, terminateOcr } from '../../lib/ocr';
import { parseTicketText, redactTicketText } from '../../lib/ticketText';
import { extractTicket } from '../../data/user';

// Bộ giải mã (~1,4 MB wasm) chỉ tải khi người dùng mở cửa sổ quét; wasm phục vụ cùng origin, không qua CDN.
let readerPromise;
const loadReader = () => (readerPromise ??= (async () => {
  const [{ readBarcodes, prepareZXingModule }, wasm] = await Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')]);
  prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm.default : prefix + path) }, fireImmediately: true });
  return readBarcodes;
})().catch((e) => { readerPromise = undefined; throw e; }));

const OPTS = { formats: ['PDF417', 'QRCode', 'Aztec', 'DataMatrix'], tryHarder: true, maxNumberOfSymbols: 4 };
// Ảnh chụp/ảnh tải về thường có mã rất nhỏ (mỗi ô chưa tới 1 px) nên đọc nguyên bản thất bại: phóng to, kéo giãn tương phản,
// rồi thử thêm bản đen trắng. Dừng ở lần đầu cho ra thẻ lên tàu hợp lệ.
const firstBcbp = (hits) => hits.filter((h) => h.isValid).map((h) => h.text).find((t) => parseBcbp(t));
async function decodeFile(file, readBarcodes) {
  const direct = firstBcbp(await readBarcodes(file, OPTS));
  if (direct) return direct;
  const bmp = await createImageBitmap(file);
  try {
    const long = Math.max(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (const [scale, bw] of [[3, false], [4, false], [2, false], [5, false], [3, true], [4, true]]) {
      const k = Math.min(scale, 4000 / long);
      if (k < 1.5) continue; // ảnh đã đủ lớn, phóng thêm không giúp ích
      canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = img.data; let lo = 255; let hi = 0;
      for (let i = 0; i < px.length; i += 4) { const g = (px[i] * 77 + px[i + 1] * 151 + px[i + 2] * 28) >> 8; px[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
      const span = Math.max(1, hi - lo);
      for (let i = 0; i < px.length; i += 4) {
        const g = ((px[i] - lo) * 255) / span;
        px[i] = px[i + 1] = px[i + 2] = bw ? (g > 128 ? 255 : 0) : g;
      }
      const t = firstBcbp(await readBarcodes(img, OPTS));
      if (t) return t;
    }
  } finally { bmp.close?.(); }
  return null;
}

const NOT_FOUND = 'Không đọc được mã vạch hay chữ số hiệu và ngày bay trong ảnh này. Hãy thử ảnh rõ và lớn hơn, hoặc nhập số hiệu chuyến bay thủ công.';

// Cửa sổ quét thẻ lên tàu: camera hoặc ảnh. onResult({ flight, date }) chỉ nhận số hiệu và ngày bay.
export default function ScanTicket({ onResult, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [state, setState] = useState('starting'); // starting | scanning | busy | nocam
  const [msg, setMsg] = useState('');
  const [busyMsg, setBusyMsg] = useState('Đang đọc ảnh…');

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
            const hits = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), OPTS);
            const text = firstBcbp(hits);
            if (text && done(text)) return;
            const other = hits.find((h) => h.isValid);
            if (other && other.text !== seen) {
              seen = other.text;
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
    return () => { alive = false; window.removeEventListener('keydown', onKey); stop(); terminateOcr(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ảnh tải lên hoặc ảnh vừa chụp: mã vạch -> OCR + bộ regex -> nhờ AI đọc giúp (chỉ gửi chữ đã bỏ tên/mã đặt chỗ, không gửi ảnh).
  const processImage = async (file) => {
    setState('busy'); setMsg(''); setBusyMsg('Đang đọc mã vạch…');
    try {
      const readBarcodes = await loadReader();
      const text = await decodeFile(file, readBarcodes);
      if (text && done(text)) return;
      setBusyMsg('Không thấy mã vạch, đang đọc chữ in trên ảnh (vài giây)…');
      const ocrText = await ocrImage(file);
      const parsed = parseTicketText(ocrText);
      if (parsed) { stop(); onResult({ ...parsed, source: 'ocr' }); return; }
      setBusyMsg('Đang nhờ AI đọc giúp chữ trên ảnh…');
      const ai = await extractTicket(redactTicketText(ocrText));
      if (ai) { stop(); onResult({ ...ai, source: 'ai' }); return; }
      setMsg(NOT_FOUND);
    } catch { setMsg('Không xử lý được ảnh này. Hãy thử ảnh khác.'); }
    setState(stream.current ? 'scanning' : 'nocam');
  };

  const fromFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('Vui lòng chọn tệp ảnh (JPG, PNG, WebP).'); return; }
    await processImage(file);
  };

  // Chụp một khung hình đang xem trên camera rồi xử lý như ảnh tải lên.
  const capture = async () => {
    const v = video.current;
    if (!v?.videoWidth) { setMsg('Camera chưa sẵn sàng, hãy thử lại sau giây lát.'); return; }
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) { setMsg('Không chụp được ảnh, hãy thử lại.'); return; }
    await processImage(new File([blob], 'ticket.jpg', { type: 'image/jpeg' }));
  };

  return (
    <div className="tw:fixed tw:inset-0 tw:z-[70] tw:grid tw:place-items-end tw:bg-slate-900/70 tw:p-0 tw:sm:place-items-center tw:sm:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Quét mã thẻ lên tàu" onClick={(e) => e.stopPropagation()} className="tw:max-h-[92dvh] tw:w-full tw:max-w-md tw:overflow-y-auto tw:rounded-t-3xl tw:bg-white tw:sm:rounded-3xl tw:shadow-2xl">
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
              {state === 'busy' && <p className="tw:absolute tw:inset-0 tw:grid tw:place-items-center tw:bg-slate-900/60 tw:px-6 tw:text-center tw:text-sm tw:font-semibold tw:text-white">{busyMsg}</p>}
            </div>
          )}
          {state === 'scanning' && <button type="button" onClick={capture} data-testid="scan-capture" className="tw:mt-3 tw:flex tw:min-h-11 tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:px-4 tw:text-sm tw:font-bold tw:text-white tw:hover:bg-blue-700"><Camera size={17} /> Chụp và đọc thẻ</button>}
          <p className="tw:mt-3 tw:text-xs tw:leading-5 tw:text-slate-500">
            {state === 'nocam' ? <Camera size={14} className="tw:mr-1 tw:inline" /> : null}
            {msg || 'Đưa mã vạch/QR trên thẻ lên tàu vào khung, hoặc bấm Chụp để đọc chữ in trên thẻ. Chỉ số hiệu chuyến bay, ngày bay, sân bay và giờ được dùng. Tên và mã đặt chỗ được loại bỏ ngay trên máy bạn, không lưu; nếu cần, chữ còn lại được gửi tới AI chạy trong hệ thống AIRREST để đọc giúp, ảnh không bao giờ rời khỏi máy.'}
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
