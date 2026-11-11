import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { getDashboard } from '../../../services/dashboard/dashboard.service';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

export const dateRangeQuery = z.object({
  from: z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), 'Ngày không hợp lệ').optional(),
  to: z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), 'Ngày không hợp lệ').optional(),
});

// Dashboard toàn hệ thống: số đơn theo trạng thái, doanh thu, khách sạn chờ duyệt, hỗ trợ/xe/yêu cầu đang mở. Chỉ đọc.
export const adminDashboardRouter = Router();
adminDashboardRouter.get('/dashboard', requirePermission(PERM.ADMIN_DASHBOARD_READ), validate({ query: dateRangeQuery }), async (req, res) => {
  res.json(await getDashboard(req.valid.query as z.infer<typeof dateRangeQuery>));
});
