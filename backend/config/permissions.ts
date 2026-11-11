// Danh mục quyền (permission). Vai trò (collection `roles`) là tập các quyền này.
// Truy cập chỉ dựa trên quyền, không chặn theo tên vai trò.
export const PERM = {
  BOOKING_READ: 'booking:read',
  BOOKING_CHECKIN: 'booking:checkin',
  ROOM_MANAGE: 'room:manage', // loại phòng + khóa/bảo trì phòng
  BOOKING_DECIDE: 'booking:decide', // xác nhận / từ chối đơn chờ khách sạn
  REQUEST_HANDLE: 'request:handle', // duyệt/từ chối yêu cầu đổi/hủy
  SUPPORT_HANDLE: 'support:handle', // xử lý ticket hỗ trợ
  SHUTTLE_HANDLE: 'shuttle:handle', // vận hành xe đưa đón
  ADMIN_BOOKING_READ: 'admin:booking:read', // admin xem booking của mọi khách sạn (chỉ đọc)
  AUDIT_READ: 'audit:read',
  ADMIN_ALERTS: 'admin:alerts',
  // Quyền xem dữ liệu mọi khách sạn (Admin). Tài khoản khách sạn luôn bị khóa theo hotelId của chính nó.
  HOTEL_SCOPE_ALL: 'hotel:scope:all',

  // --- Cổng Admin (BA §3.6b) ---
  ADMIN_ACCOUNT_MANAGE: 'admin:account:manage', // ADM-13
  ADMIN_CONFIG_READ: 'admin:config:read', // ADM-12
  ADMIN_CONFIG_WRITE: 'admin:config:write', // tham số hệ thống chung (Quản trị HT)
  ADMIN_CONFIG_SHUTTLE: 'admin:config:shuttle', // P-08 bảng giá xe (Điều phối)
  ADMIN_CONFIG_FINANCE: 'admin:config:finance', // P-10/11/12/20 (Kế toán)
  ADMIN_HOTEL_READ: 'admin:hotel:read', // ADM-01/08
  ADMIN_HOTEL_MANAGE: 'admin:hotel:manage', // ADM-01: tạo/sửa/duyệt/tạm ngưng, đề xuất đổi tài khoản nhận tiền
  ADMIN_PAYMENT_READ: 'admin:payment:read', // xem giao dịch cổng thanh toán, lệnh hoàn, giao dịch bất thường
  ADMIN_PAYMENT_MANAGE: 'admin:payment:manage', // đối soát thủ công, thử lại hoàn tiền
  ADMIN_HOTEL_APPROVE_SENSITIVE: 'admin:hotel:approve-sensitive', // ADM-15: duyệt đổi tài khoản nhận tiền (four-eyes)
} as const;

export type Permission = (typeof PERM)[keyof typeof PERM];
