import { Router } from 'express';
import { blockListQuery, createBlockBody, createRoomTypeBody, hotelTargetQuery, inventoryQuery, idParams, patchRoomTypeBody, roomTypeListQuery, type BlockListQuery, type CreateBlockBody, type CreateRoomTypeBody, type InventoryQuery, type PatchRoomTypeBody } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { createBlock, createRoomType, getInventory, listBlocks, listRoomTypes, releaseBlock, retireRoomType, updateRoomType } from '../../../services/rooms/rooms.service';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Khách sạn tự quản lý loại phòng. Phạm vi khóa theo hotelId trong token; Admin (hotel:scope:all) phải nêu ?hotelId=.
export const roomTypesRouter = Router();
roomTypesRouter.use(authenticate);

const a = (req: { auth?: AuthContext }) => req.auth as AuthContext;
const hid = (req: { valid: { query?: unknown } }) => (req.valid.query as { hotelId?: string } | undefined)?.hotelId;

roomTypesRouter.get('/', requirePermission(PERM.BOOKING_READ), validate({ query: roomTypeListQuery }), async (req, res) => {
  const q = req.valid.query as { hotelId?: string; includeRetired: boolean };
  res.json({ items: await listRoomTypes(a(req), q) });
});

roomTypesRouter.post('/', requirePermission(PERM.ROOM_MANAGE), validate({ query: hotelTargetQuery, body: createRoomTypeBody }), async (req, res) => {
  res.status(201).json({ roomType: await createRoomType(a(req), hid(req), req.valid.body as CreateRoomTypeBody, String(req.id)) });
});

roomTypesRouter.patch('/:id', requirePermission(PERM.ROOM_MANAGE), validate({ params: idParams, query: hotelTargetQuery, body: patchRoomTypeBody }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json({ roomType: await updateRoomType(a(req), hid(req), id, req.valid.body as PatchRoomTypeBody, String(req.id)) });
});

roomTypesRouter.delete('/:id', requirePermission(PERM.ROOM_MANAGE), validate({ params: idParams, query: hotelTargetQuery }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json({ roomType: await retireRoomType(a(req), hid(req), id, String(req.id)) });
});

roomTypesRouter.get('/:id/inventory', requirePermission(PERM.BOOKING_READ), validate({ params: idParams, query: inventoryQuery }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const q = req.valid.query as InventoryQuery;
  res.json({ roomTypeId: id, days: await getInventory(a(req), q.hotelId, id, q.from, q.to) });
});

// Khóa/bảo trì phòng: chỉ khóa phần còn trống, không hủy đơn đang có.
export const roomBlocksRouter = Router();
roomBlocksRouter.use(authenticate);

roomBlocksRouter.get('/', requirePermission(PERM.BOOKING_READ), validate({ query: blockListQuery }), async (req, res) => {
  res.json(await listBlocks(a(req), req.valid.query as BlockListQuery));
});

roomBlocksRouter.post('/', requirePermission(PERM.ROOM_MANAGE), validate({ query: hotelTargetQuery, body: createBlockBody }), async (req, res) => {
  res.status(201).json({ block: await createBlock(a(req), hid(req), req.valid.body as CreateBlockBody, String(req.id)) });
});

roomBlocksRouter.delete('/:id', requirePermission(PERM.ROOM_MANAGE), validate({ params: idParams, query: hotelTargetQuery }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json({ block: await releaseBlock(a(req), hid(req), id, String(req.id)) });
});
