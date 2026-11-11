import { PERM } from './permissions';

// Vai trò hệ thống (BA §3.6b), seed vào collection `roles` với system=true.
// Admin: OPS (Điều phối xe), SUPPORT (CSKH), FINANCE (Kế toán Admin), SYSADMIN (Quản trị HT).
// Mỗi nhóm chức năng thêm quyền mới vào đây khi API của nó được làm.
export type AdminRoleKey = 'OPS' | 'SUPPORT' | 'FINANCE' | 'SYSADMIN';

export const ADMIN_ROLES: Record<AdminRoleKey, { name: string; permissions: string[] }> = {
  OPS: {
    name: 'Điều phối xe',
    // hotel:scope:all để OPS dùng chung route /hotel/shuttle-requests mà không bị hotelScope chặn (OPS không có booking:read).
    permissions: [PERM.ADMIN_ALERTS, PERM.ADMIN_HOTEL_READ, PERM.ADMIN_CONFIG_READ, PERM.ADMIN_CONFIG_SHUTTLE, PERM.ADMIN_BOOKING_READ, PERM.SHUTTLE_HANDLE, PERM.HOTEL_SCOPE_ALL, PERM.FLIGHT_MANAGE, PERM.ADMIN_DASHBOARD_READ],
  },
  SUPPORT: {
    name: 'CSKH',
    permissions: [PERM.ADMIN_ALERTS, PERM.ADMIN_HOTEL_READ, PERM.ADMIN_CONFIG_READ, PERM.ADMIN_PAYMENT_READ, PERM.AUDIT_READ, PERM.BOOKING_READ, PERM.ADMIN_BOOKING_READ, PERM.SUPPORT_HANDLE, PERM.ADMIN_DASHBOARD_READ],
  },
  FINANCE: {
    name: 'Kế toán Admin',
    permissions: [PERM.ADMIN_HOTEL_READ, PERM.ADMIN_CONFIG_READ, PERM.ADMIN_CONFIG_FINANCE, PERM.ADMIN_HOTEL_APPROVE_SENSITIVE, PERM.ADMIN_PAYMENT_READ, PERM.ADMIN_PAYMENT_MANAGE, PERM.AUDIT_READ, PERM.BOOKING_READ, PERM.ADMIN_BOOKING_READ, PERM.ADMIN_DASHBOARD_READ],
  },
  SYSADMIN: {
    name: 'Quản trị hệ thống',
    permissions: [
      PERM.BOOKING_READ,
      PERM.BOOKING_CHECKIN,
      PERM.ROOM_MANAGE,
      PERM.BOOKING_DECIDE,
      PERM.ADMIN_BOOKING_READ,
      PERM.REQUEST_HANDLE,
      PERM.SUPPORT_HANDLE,
      PERM.SHUTTLE_HANDLE,
      PERM.FLIGHT_MANAGE,
      PERM.ADMIN_DASHBOARD_READ,
      PERM.AUDIT_READ,
      PERM.ADMIN_ALERTS,
      PERM.HOTEL_SCOPE_ALL,
      PERM.ADMIN_ACCOUNT_MANAGE,
      PERM.ADMIN_CONFIG_READ,
      PERM.ADMIN_CONFIG_WRITE,
      PERM.ADMIN_HOTEL_READ,
      PERM.ADMIN_HOTEL_MANAGE,
      PERM.ADMIN_HOTEL_APPROVE_SENSITIVE,
      PERM.ADMIN_PAYMENT_READ,
      PERM.ADMIN_PAYMENT_MANAGE,
    ],
  },
};

// Vai trò hệ thống của khách sạn: chủ KS tạo tài khoản đầu tiên qua ADM-01. Phạm vi dữ liệu luôn khóa theo hotelId.
export const HOTEL_OWNER_ROLE = { key: 'hotel_owner', name: 'Chủ khách sạn', permissions: [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.ROOM_MANAGE, PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.SHUTTLE_HANDLE] };
