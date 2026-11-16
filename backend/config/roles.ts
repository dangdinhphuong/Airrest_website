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
    permissions: [PERM.ADMIN_HOTEL_READ, PERM.ADMIN_CONFIG_READ, PERM.ADMIN_CONFIG_FINANCE, PERM.ADMIN_HOTEL_APPROVE_SENSITIVE, PERM.ADMIN_PAYMENT_READ, PERM.ADMIN_PAYMENT_MANAGE, PERM.ADMIN_PAYER_READ, PERM.AUDIT_READ, PERM.BOOKING_READ, PERM.ADMIN_BOOKING_READ, PERM.ADMIN_DASHBOARD_READ],
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
      PERM.FLEET_MANAGE,
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
      PERM.ADMIN_PAYER_READ,
      PERM.ADMIN_PAYER_MANAGE,
    ],
  },
};

// Vai trò hệ thống của khách sạn: chủ KS tạo tài khoản đầu tiên qua ADM-01. Phạm vi dữ liệu luôn khóa theo hotelId.
export const HOTEL_OWNER_ROLE = { key: 'hotel_owner', name: 'Chủ khách sạn', permissions: [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.ROOM_MANAGE, PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.SHUTTLE_HANDLE, PERM.FLEET_MANAGE, PERM.BUSINESS_HOTEL_MANAGE, PERM.BUSINESS_REPORT_READ, PERM.HOTEL_STAFF_MANAGE, PERM.HOTEL_ROLE_MANAGE] };

// Tài xế của khách sạn (tài khoản DRIVER): chỉ thao tác chuyến của chính mình, không xem đơn/tiền.
export const HOTEL_DRIVER_ROLE = { key: 'hotel_driver', name: 'Tài xế khách sạn', permissions: [PERM.TRIP_DRIVE] };

// Nhân viên đơn vị chi trả (tài khoản PAYER): chỉ thao tác dữ liệu của đơn vị/trạm mình, không xem tiền hay dữ liệu khách sạn.
export const PAYER_STAFF_ROLE = { key: 'payer_staff', name: 'Nhân viên đơn vị chi trả', permissions: [PERM.PAYER_DELAY_READ, PERM.PAYER_DELAY_MANAGE] };

// Quyền thuộc phạm vi khách sạn: chỉ các quyền này xuất hiện ở GET /v1/hotel/permissions và gán được cho vai trò của khách sạn.
// Không có admin:*, payer:*, hotel:scope:all, business:* (chỉ chủ doanh nghiệp), support:handle, trip:drive (tài xế quản qua /hotel/drivers).
export const HOTEL_ASSIGNABLE_PERMISSIONS: readonly string[] = [
  PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.BOOKING_DECIDE, PERM.ROOM_MANAGE, PERM.REQUEST_HANDLE, PERM.SHUTTLE_HANDLE, PERM.FLEET_MANAGE, PERM.HOTEL_STAFF_MANAGE, PERM.HOTEL_ROLE_MANAGE,
];

// Vai trò mẫu cho nhân viên khách sạn (system, dùng chung mọi khách sạn, chỉ xem). hotel_owner chỉ hiển thị, KHÔNG gán được cho nhân viên.
export const HOTEL_RECEPTIONIST_ROLE = { key: 'hotel_receptionist', name: 'Lễ tân', permissions: [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN] };
export const HOTEL_MANAGER_ROLE = { key: 'hotel_manager', name: 'Quản lý khách sạn', permissions: [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.ROOM_MANAGE, PERM.SHUTTLE_HANDLE, PERM.FLEET_MANAGE] };
export const HOTEL_STAFF_SYSTEM_KEYS: readonly string[] = [HOTEL_RECEPTIONIST_ROLE.key, HOTEL_MANAGER_ROLE.key];
