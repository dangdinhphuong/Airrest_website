import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { AppError } from '../../../lib/errors';
import type { AuthContext } from '../../../lib/jwt';
import { idParams } from '../../../lib/zod';
import { actorOf, writeAudit } from '../../../services/audit';
import { getMatrix, listNotifications, markRead, saveMatrix } from '../../../services/notifications';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Thông báo của nhân sự khách sạn (khách sạn lấy từ token) + cấu hình vai trò × loại.
export const hotelNotificationsRouter = Router();
export const hotelNotificationSettingsRouter = Router();
hotelNotificationsRouter.use(authenticate);
hotelNotificationSettingsRouter.use(authenticate);

const hotelOf = (a: AuthContext): string => {
  if (!a.hotelId) throw new AppError(422, 'HOTEL_REQUIRED', 'Tài khoản không gắn với khách sạn nào');
  return a.hotelId;
};
const who = (a: AuthContext) => ({ sub: a.sub, hotelId: a.hotelId, roleIds: a.roleIds });

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), unreadOnly: z.enum(['true', 'false']).optional() });
hotelNotificationsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const q = req.valid.query as z.infer<typeof listQuery>;
  res.json(await listNotifications(who(req.auth as AuthContext), { limit: q.limit, unreadOnly: q.unreadOnly === 'true' }));
});
hotelNotificationsRouter.post('/read-all', async (req, res) => {
  await markRead(who(req.auth as AuthContext));
  res.status(204).end();
});
hotelNotificationsRouter.post('/:id/read', validate({ params: idParams }), async (req, res) => {
  await markRead(who(req.auth as AuthContext), (req.valid.params as { id: string }).id);
  res.status(204).end();
});

const manage = requirePermission(PERM.HOTEL_ROLE_MANAGE);
hotelNotificationSettingsRouter.get('/', manage, async (req, res) => res.json(await getMatrix(hotelOf(req.auth as AuthContext))));
const putBody = z.object({ cells: z.array(z.object({ roleId: z.string().uuid(), type: z.string().min(1).max(40), enabled: z.boolean() })).min(1).max(500) });
hotelNotificationSettingsRouter.put('/', manage, validate({ body: putBody }), async (req, res) => {
  const auth = req.auth as AuthContext;
  const hotelId = hotelOf(auth);
  const { cells } = req.valid.body as z.infer<typeof putBody>;
  await saveMatrix(hotelId, cells);
  await writeAudit({ actor: actorOf(auth), action: 'NOTIFICATION_SETTINGS.UPDATE', entity: { type: 'hotel', id: hotelId }, hotelId, after: { cells: cells.length } });
  res.json(await getMatrix(hotelId));
});
