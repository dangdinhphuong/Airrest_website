import { ObjectId } from 'mongodb';
import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, type AdminRoleKey } from '../../config/roles';
import { PERM } from '../../config/permissions';
import { col } from '../../db/collections';
import type { AccountDoc } from '../../db/types';
import { withTransaction } from '../../db/mongo';
import { actorOf, writeAudit } from '../../lib/audit';
import { AppError, isDuplicateKey } from '../../lib/errors';
import { forgetAuth } from '../../lib/authz';
import { hashPassword } from '../../lib/password';
import { escapeRegex, idParams, limitQuery, oid } from '../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// FR-ADM-13: tài khoản + vai trò Admin (OPS / SUPPORT / FINANCE / SYSADMIN). Mọi route cần quyền admin:account:manage.
export const accountsRouter = Router();
const need = requirePermission(PERM.ADMIN_ACCOUNT_MANAGE);

const roleKey = z.enum(Object.keys(ADMIN_ROLES) as [AdminRoleKey, ...AdminRoleKey[]]);
const password = z.string().min(12).max(128);

const createBody = z.object({
  email: z.string().email().max(200),
  fullName: z.string().trim().min(2).max(100),
  adminRole: roleKey,
  password,
});
const patchBody = z
  .object({ fullName: z.string().trim().min(2).max(100), adminRole: roleKey, status: z.enum(['ACTIVE', 'LOCKED']) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
const listQuery = z.object({
  status: z.enum(['ACTIVE', 'LOCKED', 'INVITED']).optional(),
  adminRole: roleKey.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: limitQuery,
  after: oid.optional(),
});

// Không bao giờ trả passwordHash.
const pub = (a: AccountDoc) => ({
  _id: a._id,
  email: a.email,
  fullName: a.fullName,
  type: a.type,
  adminRole: a.adminRole,
  status: a.status,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

const systemRole = (key: string) => col.roles().findOne({ key, scope: 'SYSTEM', hotelId: { $exists: false } });

accountsRouter.get('/roles', need, async (_req, res) => {
  const roles = await col.roles().find({ scope: 'SYSTEM', key: { $in: Object.keys(ADMIN_ROLES) } }).toArray();
  res.json({ items: roles.map((r) => ({ key: r.key, name: r.name, permissions: r.permissions })) });
});

accountsRouter.get('/accounts', need, validate({ query: listQuery }), async (req, res) => {
  const { status, adminRole, q, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const items = await col
    .accounts()
    .find({
      type: 'ADMIN',
      ...(status && { status }),
      ...(adminRole && { adminRole }),
      ...(q && { $or: [{ email: { $regex: escapeRegex(q.toLowerCase()) } }, { fullName: { $regex: escapeRegex(q), $options: 'i' } }] }),
      ...(after && { _id: { $gt: new ObjectId(after) } }),
    })
    .sort({ _id: 1 })
    .limit(limit + 1)
    .toArray();
  const page = items.slice(0, limit);
  res.json({ items: page.map(pub), nextCursor: items.length > limit ? page[page.length - 1]?._id : null });
});

accountsRouter.post('/accounts', need, validate({ body: createBody }), async (req, res) => {
  const body = req.valid.body as z.infer<typeof createBody>;
  const role = await systemRole(body.adminRole);
  if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', `Chưa có vai trò hệ thống ${body.adminRole} (chạy npm run db:seed)`);
  const now = new Date();
  const doc: AccountDoc = {
    _id: new ObjectId(),
    type: 'ADMIN',
    email: body.email.toLowerCase(),
    passwordHash: await hashPassword(body.password),
    fullName: body.fullName,
    status: 'ACTIVE',
    adminRole: body.adminRole,
    roleIds: [role._id],
    createdBy: new ObjectId(req.auth!.sub),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await withTransaction(async (session) => {
      await col.accounts().insertOne(doc, { session });
      await writeAudit(
        { actor: actorOf(req.auth), action: 'ACCOUNT.CREATE', entity: { type: 'account', id: doc._id.toHexString() }, after: { email: doc.email, adminRole: doc.adminRole }, requestId: String(req.id) },
        session,
      );
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'EMAIL_EXISTS', 'Email đã được dùng');
    throw e;
  }
  res.status(201).json({ account: pub(doc) });
});

accountsRouter.patch('/accounts/:id', need, validate({ params: idParams, body: patchBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const patch = req.valid.body as z.infer<typeof patchBody>;
  const targetId = new ObjectId(id);
  const isSelf = req.auth!.sub === id;

  const updated = await withTransaction(async (session) => {
    const before = await col.accounts().findOne({ _id: targetId, type: 'ADMIN' }, { session });
    if (!before) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Admin');

    const losesSysadmin =
      before.adminRole === 'SYSADMIN' &&
      before.status === 'ACTIVE' &&
      (patch.status === 'LOCKED' || (patch.adminRole !== undefined && patch.adminRole !== 'SYSADMIN'));
    // Tự khóa/tự hạ quyền dễ khiến hệ thống mất người quản trị; luôn phải còn ít nhất 1 SYSADMIN hoạt động.
    if (isSelf && (patch.status === 'LOCKED' || (patch.adminRole && patch.adminRole !== before.adminRole))) {
      throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Không thể tự khóa hoặc tự đổi vai trò của mình');
    }
    if (losesSysadmin && (await col.accounts().countDocuments({ type: 'ADMIN', adminRole: 'SYSADMIN', status: 'ACTIVE', _id: { $ne: targetId } }, { session })) === 0) {
      throw new AppError(409, 'LAST_SYSADMIN', 'Phải còn ít nhất một Quản trị hệ thống đang hoạt động');
    }

    const set: Partial<AccountDoc> = { ...patch, updatedAt: new Date() };
    if (patch.adminRole) {
      const role = await systemRole(patch.adminRole);
      if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', `Chưa có vai trò hệ thống ${patch.adminRole}`);
      set.roleIds = [role._id];
    }
    await col.accounts().updateOne({ _id: targetId }, { $set: set }, { session });
    await writeAudit(
      {
        actor: actorOf(req.auth),
        action: 'ACCOUNT.UPDATE',
        entity: { type: 'account', id: id },
        before: { fullName: before.fullName, adminRole: before.adminRole, status: before.status },
        after: patch,
        requestId: String(req.id),
      },
      session,
    );
    return { ...before, ...set } as AccountDoc;
  });
  forgetAuth(id); // khóa / đổi vai trò có hiệu lực ngay trên bản API này
  res.json({ account: pub(updated) });
});

const resetBody = z.object({ password });
accountsRouter.post('/accounts/:id/reset-password', need, validate({ params: idParams, body: resetBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const { password: pw } = req.valid.body as z.infer<typeof resetBody>;
  const passwordHash = await hashPassword(pw);
  await withTransaction(async (session) => {
    const r = await col.accounts().updateOne({ _id: new ObjectId(id), type: 'ADMIN' }, { $set: { passwordHash, updatedAt: new Date() } }, { session });
    if (r.matchedCount === 0) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Admin');
    // Không ghi mật khẩu vào nhật ký.
    await writeAudit({ actor: actorOf(req.auth), action: 'ACCOUNT.RESET_PASSWORD', entity: { type: 'account', id }, requestId: String(req.id) }, session);
  });
  res.status(204).end();
});
