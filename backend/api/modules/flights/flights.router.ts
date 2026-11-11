import { Router } from 'express';
import { z } from 'zod';
import { flightCodeSchema, flightDateSchema } from '@airrest/validation';
import { getFlight } from '../../../services/flights/flights.service';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Công khai, chỉ đọc. Dữ liệu MÔ PHỎNG (simulated: true). Mã được chuẩn hóa chữ hoa và kiểm định dạng TRƯỚC khi chạm DB.
export const flightsRouter = Router();

flightsRouter.get('/:code', strictRateLimit, validate({ params: z.object({ code: flightCodeSchema }), query: z.object({ date: flightDateSchema.optional() }) }), async (req, res) => {
  const { code } = req.valid.params as { code: string };
  const { date } = req.valid.query as { date?: string };
  res.json(await getFlight(code, date));
});
