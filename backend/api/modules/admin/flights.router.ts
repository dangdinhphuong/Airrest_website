import { Router } from 'express';
import { z } from 'zod';
import { flightCodeSchema, flightDateSchema, idParams, updateFlightBodySchema, type UpdateFlightBody } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { listFlightChanges, listFlights, updateFlight } from '../../../services/flights/flights.service';
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
