import { roundTripCheck } from '../lib/storage';

// npm run storage:check — thử ghi/đọc/xóa một object trên R2 để biết khóa + bucket đúng.
roundTripCheck().then(
  (r) => console.log(r.ok ? `R2 OK (bucket ${r.bucket})` : 'R2 đọc lại sai nội dung'),
  (e) => {
    console.error('R2 lỗi:', e.name, e.message);
    process.exit(1);
  },
);
