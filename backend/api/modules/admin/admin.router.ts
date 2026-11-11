import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { accountsRouter } from './accounts.router';
import { adminHotelsRouter } from './hotels.router';
import { auditRouter } from './audit.router';
import { configsRouter } from './configs.router';
import { mediaRouter } from './media.router';
import { adminPaymentsRouter } from './payments.router';

// Cổng Admin: authenticate một lần ở đây; quyền kiểm ở từng route (requirePermission).
// Thêm nhóm API Admin mới: tạo file *.router.ts trong thư mục này rồi thêm 1 dòng use() bên dưới.
export const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(auditRouter);
adminRouter.use(configsRouter);
adminRouter.use(accountsRouter);
adminRouter.use(adminHotelsRouter);
adminRouter.use(adminPaymentsRouter);
adminRouter.use(mediaRouter);
