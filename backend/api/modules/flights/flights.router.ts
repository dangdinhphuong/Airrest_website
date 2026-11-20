import { Router } from 'express';
import { z } from 'zod';
import { flightCodeSchema, flightDateSchema } from '@airrest/validation';
import { flightBoardSummary, getFlight, listFlightBoard } from '../../../services/flights/flights.service';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Công khai, chỉ đọc. Dữ liệu MÔ PHỎNG (simulated: true). Mã được chuẩn hóa chữ hoa và kiểm định dạng TRƯỚC khi chạm DB.
export const flightsRouter = Router();

// Bảng chuyến bay công khai, chỉ đọc. Đặt TRƯỚC '/:code' để 'summary' không bị coi là mã chuyến. Chỉ có apiRateLimit chung của /api/v1
// (không strict: giao diện làm mới mỗi 60 giây và đổi tab liên tục; dữ liệu không nhạy cảm, không dò được thông tin cá nhân).
const iata = z.string().transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z]{3}$/, 'Mã sân bay gồm 3 chữ cái'));
const boardQuery = z.object({
  airport: iata.optional(),
  direction: z.enum(['departures', 'arrivals']).default('departures'),
  date: flightDateSchema.optional(),
  status: z.enum(['ONTIME', 'DELAYED', 'CANCELLED']).optional(),
  // Tìm theo TIỀN TỐ mã chuyến: bỏ khoảng trắng, chữ hoa, chỉ chữ+số tối đa 6 ký tự (nên không có ký tự LIKE đặc biệt).
  code: z.string().transform((s) => s.replace(/\s+/g, '').toUpperCase()).pipe(z.string().regex(/^[A-Z0-9]{1,6}$/, 'Mã chuyến chỉ gồm chữ và số, tối đa 6 ký tự')).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

flightsRouter.get('/', validate({ query: boardQuery }), async (req, res) => {
  res.json(await listFlightBoard(req.valid.query as Parameters<typeof listFlightBoard>[0]));
});

flightsRouter.get('/summary', validate({ query: z.object({ date: flightDateSchema.optional() }) }), async (req, res) => {
  res.json(await flightBoardSummary((req.valid.query as { date?: string }).date));
});

flightsRouter.get('/:code', strictRateLimit, validate({ params: z.object({ code: flightCodeSchema }), query: z.object({ date: flightDateSchema.optional() }) }), async (req, res) => {
  const { code } = req.valid.params as { code: string };
  const { date } = req.valid.query as { date?: string };
  res.json(await getFlight(code, date));
});
