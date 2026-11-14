// OCR chạy hoàn toàn trong trình duyệt (tesseract.js), tệp phục vụ cùng origin ở /ocr (xem scripts/copy-ocr-assets.mjs).
// Chỉ tải khi cần; ảnh không rời khỏi máy người dùng.
let workerPromise;
const base = () => new URL(`${import.meta.env.BASE_URL}ocr`, window.location.origin).href;

const getWorker = () => (workerPromise ??= (async () => {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('eng', 1, { workerPath: `${base()}/worker.min.js`, corePath: base(), langPath: base(), gzip: true });
  await w.setParameters({ tessedit_pageseg_mode: '6' }); // một khối văn bản đồng nhất: đọc tốt nhất với thẻ lên tàu nhiều cột
  return w;
})().catch((e) => { workerPromise = undefined; throw e; }));

export async function terminateOcr() {
  const p = workerPromise; workerPromise = undefined;
  try { await (await p)?.terminate(); } catch { /* đã hủy hoặc chưa tạo */ }
}

// Ảnh thẻ thường nhỏ và nền xám: phóng 3 lần, chuyển xám, kéo giãn tương phản (không nhị phân hóa, làm giảm độ chính xác).
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  try {
    const k = Math.min(3, 3000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height); const px = img.data; let lo = 255; let hi = 0;
    for (let i = 0; i < px.length; i += 4) { const g = (px[i] * 77 + px[i + 1] * 151 + px[i + 2] * 28) >> 8; px[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = ((px[i] - lo) * 255) / span;
    ctx.putImageData(img, 0, 0);
    return c;
  } finally { bmp.close?.(); }
}

export async function ocrImage(file) {
  const [worker, canvas] = await Promise.all([getWorker(), prepare(file)]);
  const { data } = await worker.recognize(canvas);
  return data.text;
}
