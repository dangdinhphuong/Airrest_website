import { Router } from 'express';
import { z } from 'zod';
import { createFlightBodySchema, flightCodeSchema, flightDateSchema, idParams, updateFlightBodySchema, type CreateFlightBody, type UpdateFlightBody } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { createFlight, deleteFlight, listFlightChanges, listFlights, updateFlight } from '../../../services/flights/flights.service';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Admin chỉnh giờ/trạng thái chuyến bay mô phỏng (flight:manage); mọi thay đổi có lịch sử + nhật ký.
export const adminFlightsRouter = Router();
const need = requirePermission(PERM.FLIGHT_MANAGE);
const page = { limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.coerce.number().int().min(0).optional() };

adminFlightsRouter.get('/flights', need, validate({ query: z.object({ code: flightCodeSchema.optional(), date: flightDateSchema.optional(), status: z.enum(['ONTIME', 'DELAYED', 'CANCELLED']).optional(), ...page }) }), async (req, res) => {
  res.json(await listFlights(req.valid.query as Parameters<typeof listFlights>[0]));
});

adminFlightsRouter.patch('/flights/:id', need, validate({ params: idParams, body: updateFlightBodySchema }), async (req, res) => {
  res.json(await updateFlight(req.auth as AuthContext, (req.valid.params as { id: string }).id, req.valid.body as UpdateFlightBody, String(req.id)));
});

adminFlightsRouter.get('/flights/:id/changes', need, validate({ params: idParams, query: z.object(page) }), async (req, res) => {
  res.json(await listFlightChanges((req.valid.params as { id: string }).id, req.valid.query as { limit: number; cursor?: number }));
});

// Tạo chuyến mô phỏng (ONTIME). 201 { flight }; 409 FLIGHT_EXISTS khi trùng (mã + ngày); 422 AIRPORT_UNKNOWN khi mã sân bay lạ.
adminFlightsRouter.post('/flights', need, validate({ body: createFlightBodySchema }), async (req, res) => {
  res.status(201).json(await createFlight(req.auth as AuthContext, req.valid.body as CreateFlightBody, String(req.id)));
});

// Xóa chuyến chưa có lịch sử thay đổi; 204. 409 FLIGHT_IN_USE nếu đã có tham chiếu.
adminFlightsRouter.delete('/flights/:id', need, validate({ params: idParams }), async (req, res) => {
  await deleteFlight(req.auth as AuthContext, (req.valid.params as { id: string }).id, String(req.id));
  res.status(204).end();
});
