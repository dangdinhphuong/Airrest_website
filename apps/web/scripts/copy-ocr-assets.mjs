// Chép tệp OCR (worker, lõi wasm, dữ liệu tiếng Anh) vào public/ocr để phục vụ cùng origin, không tải từ CDN.
// Chạy tự động trước `dev` và `build`; public/ocr là sản phẩm sinh ra, không sửa tay.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const out = path.resolve(import.meta.dirname, '../public/ocr');
fs.mkdirSync(out, { recursive: true });

const core = pkgDir('tesseract.js-core');
const jobs = [
  [path.join(pkgDir('tesseract.js'), 'dist/worker.min.js'), 'worker.min.js'],
  [path.join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz'],
  ...fs.readdirSync(core).filter((f) => /^tesseract-core.*lstm/.test(f)).map((f) => [path.join(core, f), f]),
];
for (const [src, name] of jobs) {
  const dst = path.join(out, name);
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
}
console.log(`ocr assets: ${jobs.length} tệp -> public/ocr`);
