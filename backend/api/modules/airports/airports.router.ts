import { Router } from 'express';
import { AIRPORTS } from '../../../data/airports';

// Công khai, chỉ đọc: danh mục sân bay thương mại Việt Nam (data/airports.ts). Giao diện dùng để dựng ô chọn sân bay.
export const airportsRouter = Router();

airportsRouter.get('/', (_req, res) => {
  res.json({ items: AIRPORTS });
});
