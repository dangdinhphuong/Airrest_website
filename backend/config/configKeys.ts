import { z } from 'zod';
import { PERM } from './permissions';

// Danh mục tham số cấu hình (BA §10, P-01…P-20; P-06 đã bỏ, P-16/P-17 chờ PO nên chưa có).
// Mỗi khóa: schema giá trị + mặc định (dùng khi chưa có phiên bản nào) + quyền được sửa ("Ai sửa" ở BA §10).
const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const CONFIG_KEYS = {
  'pricing.serviceFee': {
    // P-07: 2% = 200 bps (phần vạn), tối thiểu 10.000 đ, làm tròn 1.000 đ.
    schema: z.object({ bps: int(0, 2000), minVnd: int(0, 1_000_000), roundToVnd: int(1, 100_000) }),
    default: { bps: 200, minVnd: 10_000, roundToVnd: 1_000 },
    writePerm: PERM.ADMIN_CONFIG_WRITE,
  },
  'pricing.shuttle': {
    // P-08: mở cửa 60.000 đ (≤ 3 km), 10.000 đ/km, phụ thu đêm 20% (22:00–06:00), tối đa 25 km.
    schema: z.object({
      baseVnd: int(0, 10_000_000),
      baseKm: int(0, 100),
      perKmVnd: int(0, 1_000_000),
      nightSurchargeBps: int(0, 10_000),
      maxKm: int(1, 200),
    }),
    default: { baseVnd: 60_000, baseKm: 3, perKmVnd: 10_000, nightSurchargeBps: 2000, maxKm: 25 },
    writePerm: PERM.ADMIN_CONFIG_SHUTTLE,
  },
  'flight.thresholds': {
    // P-01, P-02
    schema: z.object({ delayHours: int(1, 48), nearDepartureHours: int(1, 48) }),
    default: { delayHours: 5, nearDepartureHours: 5 },
    writePerm: PERM.ADMIN_CONFIG_WRITE,
  },
  'booking.hold': {
    // P-03, P-04 (nhắc / báo Admin / hết hạn duyệt tay), P-05
    schema: z.object({
      holdMinutes: int(1, 120),
      approvalRemindMin: int(1, 120),
      approvalAlertMin: int(1, 120),
      approvalExpireMin: int(1, 240),
      noShowGraceMin: int(0, 600),
    }),
    default: { holdMinutes: 10, approvalRemindMin: 10, approvalAlertMin: 15, approvalExpireMin: 20, noShowGraceMin: 60 },
    writePerm: PERM.ADMIN_CONFIG_WRITE,
  },
  'cancellation.limits': {
    // P-09, P-13, P-18
    schema: z.object({
      defaultTemplate: z.enum(['FLEXIBLE', 'STANDARD', 'NON_REFUNDABLE']),
      cleaningBufferMaxMin: int(0, 240),
      exceptionReviewNearMin: int(1, 1440),
      exceptionReviewFarMin: int(1, 2880),
    }),
    default: { defaultTemplate: 'FLEXIBLE', cleaningBufferMaxMin: 60, exceptionReviewNearMin: 30, exceptionReviewFarMin: 240 },
    writePerm: PERM.ADMIN_CONFIG_WRITE,
  },
  payout: {
    // P-10, P-12. Ngưỡng duyệt thứ hai chờ PO chốt: tạm 2.000.000 đ (quyết định BA 2026-11-10).
    schema: z.object({ windowHours: int(0, 168), secondApprovalVnd: int(0, 10_000_000_000) }),
    default: { windowHours: 24, secondApprovalVnd: 2_000_000 },
    writePerm: PERM.ADMIN_CONFIG_FINANCE,
  },
  settlement: {
    // P-11
    schema: z.object({ dueDays: int(1, 60), hideAfterDays: int(1, 120) }),
    default: { dueDays: 7, hideAfterDays: 15 },
    writePerm: PERM.ADMIN_CONFIG_FINANCE,
  },
  retention: {
    // P-14
    schema: z.object({ auditMonths: int(12, 120), vehicleLocationDays: int(1, 365), sosLocationDays: int(1, 365) }),
    default: { auditMonths: 24, vehicleLocationDays: 30, sosLocationDays: 90 },
    writePerm: PERM.ADMIN_CONFIG_WRITE,
  },
  'shuttle.ops': {
    // P-15
    schema: z.object({ guestAbsentMin: int(1, 120) }),
    default: { guestAbsentMin: 10 },
    writePerm: PERM.ADMIN_CONFIG_SHUTTLE,
  },
  dispute: {
    // P-19
    schema: z.object({ windowDays: int(1, 60), hotelReplyHours: int(1, 240) }),
    default: { windowDays: 7, hotelReplyHours: 24 },
    writePerm: PERM.ADMIN_CONFIG_WRITE,
  },
  refund: {
    // P-20
    schema: z.object({ gatewayRetries: int(0, 10), claimLinkDays: int(1, 30) }),
    default: { gatewayRetries: 3, claimLinkDays: 7 },
    writePerm: PERM.ADMIN_CONFIG_FINANCE,
  },
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;
export const isConfigKey = (k: string): k is ConfigKey => k in CONFIG_KEYS;
