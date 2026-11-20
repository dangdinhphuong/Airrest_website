import { Router } from 'express';
import { z } from 'zod';
import {
  accountIdParams, boardQuery, driverCreateBody, driverPatchBody, driverTripsQuery, externalTripBody, idParams, reassignTripBody, rejectTripBody, tripCancelBody, vehicleCreateBody, vehiclePatchBody,
  type BoardQuery, type DriverCreateBody, type DriverPatchBody, type DriverTripsQuery, type ExternalTripBody, type VehicleCreateBody, type VehiclePatchBody,
} from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { createDriver, createVehicle, deleteDriver, deleteVehicle, listDrivers, listVehicles, patchDriver, patchVehicle } from '../../../services/fleet/fleet.service';
import { cancelTripByStaff, driverNoShow, driverStep, getStaffTrip, listDriverTrips, reassignTrip, setExternalTrip, shuttleBoard, staffStep } from '../../../services/shuttle/trips';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const A = (req: { auth?: unknown }) => req.auth as AuthContext;
const rid = (req: { id?: unknown }) => String(req.id);
const idOf = (req: { valid: { params?: unknown } }) => (req.valid.params as { id: string }).id;
const activeQuery = z.object({ active: z.enum(['true', 'false']).transform((v) => v === 'true').optional() });
const dispatcher = requireAnyPermission(PERM.FLEET_MANAGE, PERM.SHUTTLE_HANDLE); // điều phối: quản lý đội xe HOẶC nhân sự vận hành xe

// ---- /api/v1/hotel/vehicles (fleet:manage) ----
export const vehiclesRouter = Router();
vehiclesRouter.use(authenticate, requirePermission(PERM.FLEET_MANAGE));
vehiclesRouter.get('/', validate({ query: activeQuery }), async (req, res) => void res.json(await listVehicles(A(req), req.valid.query as { active?: boolean })));
vehiclesRouter.post('/', validate({ body: vehicleCreateBody }), async (req, res) => void res.status(201).json(await createVehicle(A(req), req.valid.body as VehicleCreateBody, rid(req))));
vehiclesRouter.patch('/:id', validate({ params: idParams, body: vehiclePatchBody }), async (req, res) => void res.json(await patchVehicle(A(req), idOf(req), req.valid.body as VehiclePatchBody, rid(req))));
vehiclesRouter.delete('/:id', validate({ params: idParams }), async (req, res) => void res.json(await deleteVehicle(A(req), idOf(req), rid(req))));

// ---- /api/v1/hotel/drivers (fleet:manage) ----
export const driversRouter = Router();
driversRouter.use(authenticate, requirePermission(PERM.FLEET_MANAGE));
driversRouter.get('/', validate({ query: activeQuery }), async (req, res) => void res.json(await listDrivers(A(req), req.valid.query as { active?: boolean })));
driversRouter.post('/', validate({ body: driverCreateBody }), async (req, res) => void res.status(201).json(await createDriver(A(req), req.valid.body as DriverCreateBody, rid(req))));
driversRouter.patch('/:id', validate({ params: accountIdParams, body: driverPatchBody }), async (req, res) => void res.json(await patchDriver(A(req), idOf(req), req.valid.body as DriverPatchBody, rid(req))));
driversRouter.delete('/:id', validate({ params: accountIdParams }), async (req, res) => void res.json(await deleteDriver(A(req), idOf(req), rid(req))));

// ---- /api/v1/hotel/shuttle/board ----
export const shuttleBoardRouter = Router();
shuttleBoardRouter.use(authenticate, dispatcher);
shuttleBoardRouter.get('/board', validate({ query: boardQuery }), async (req, res) => void res.json(await shuttleBoard(A(req), req.valid.query as BoardQuery)));

// ---- /api/v1/hotel/shuttle-trips: nhân sự điều phối (đổi xe, xe ngoài, hủy) ----
export const staffTripsRouter = Router();
staffTripsRouter.use(authenticate, dispatcher);
staffTripsRouter.get('/:id', validate({ params: idParams }), async (req, res) => void res.json({ trip: await getStaffTrip(A(req), idOf(req)) }));
staffTripsRouter.post('/:id/external', validate({ params: idParams, body: externalTripBody }), async (req, res) => void res.json(await setExternalTrip(A(req), idOf(req), req.valid.body as ExternalTripBody, rid(req))));
staffTripsRouter.post('/:id/reassign', validate({ params: idParams, body: reassignTripBody }), async (req, res) => void res.json(await reassignTrip(A(req), idOf(req), (req.valid.body as { vehicleId: string }).vehicleId, rid(req))));
staffTripsRouter.post('/:id/cancel', validate({ params: idParams, body: tripCancelBody }), async (req, res) => void res.json(await cancelTripByStaff(A(req), idOf(req), (req.valid.body as { note: string }).note, rid(req))));
// Các bước của xe ngoài do nhân sự bấm (xe của khách sạn do tài xế thao tác -> 409 NOT_EXTERNAL_TRIP).
for (const s of ['arrived', 'onboard', 'dropped-off'] as const) {
  staffTripsRouter.post(`/:id/${s}`, validate({ params: idParams }), async (req, res) => void res.json(await staffStep(A(req), idOf(req), s, rid(req))));
}

// ---- /api/v1/driver/trips (trip:drive): chỉ chuyến của chính tài xế ----
export const driverTripsRouter = Router();
driverTripsRouter.use(authenticate, requirePermission(PERM.TRIP_DRIVE));
driverTripsRouter.get('/', validate({ query: driverTripsQuery }), async (req, res) => void res.json(await listDriverTrips(A(req), req.valid.query as DriverTripsQuery)));
driverTripsRouter.post('/:id/no-show', validate({ params: idParams }), async (req, res) => void res.json(await driverNoShow(A(req), idOf(req), rid(req))));
driverTripsRouter.post('/:id/reject', validate({ params: idParams, body: rejectTripBody }), async (req, res) => void res.json(await driverStep(A(req), idOf(req), 'reject', { reason: (req.valid.body as { reason?: string }).reason, requestId: rid(req) })));
for (const s of ['accept', 'start', 'arrived', 'onboard', 'dropped-off'] as const) {
  driverTripsRouter.post(`/:id/${s}`, validate({ params: idParams }), async (req, res) => void res.json(await driverStep(A(req), idOf(req), s, { requestId: rid(req) })));
}
