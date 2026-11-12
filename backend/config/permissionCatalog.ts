import { PERM, type Permission } from './permissions';

// Danh mục quyền hiển thị cho màn "Vai trò và quyền" (nhóm + mô tả tiếng Việt). Phải phủ MỌI giá trị trong PERM (có test kiểm).
export const PERMISSION_CATALOG: Record<Permission, { group: string; description: string }> = {
  [PERM.BOOKING_READ]: { group: 'Đơn đặt phòng', description: 'Xem danh sách và chi tiết đơn của khách sạn (khách sạn tự khóa theo khách sạn của mình)' },
  [PERM.BOOKING_CHECKIN]: { group: 'Đơn đặt phòng', description: 'Check-in, check-out và đánh dấu khách không đến' },
  [PERM.BOOKING_DECIDE]: { group: 'Đơn đặt phòng', description: 'Xác nhận hoặc từ chối đơn đang chờ khách sạn duyệt' },
  [PERM.ADMIN_BOOKING_READ]: { group: 'Đơn đặt phòng', description: 'Admin xem đơn của mọi khách sạn (chỉ đọc)' },
  [PERM.ROOM_MANAGE]: { group: 'Phòng và khách sạn', description: 'Quản lý loại phòng, tồn phòng, khóa/bảo trì phòng và hồ sơ khách sạn' },
  [PERM.HOTEL_SCOPE_ALL]: { group: 'Phòng và khách sạn', description: 'Xem dữ liệu của mọi khách sạn thay vì chỉ khách sạn của mình (quyền nhạy cảm)' },
  [PERM.ADMIN_HOTEL_READ]: { group: 'Phòng và khách sạn', description: 'Xem danh sách, hồ sơ và thống kê khách sạn đối tác' },
  [PERM.ADMIN_HOTEL_MANAGE]: { group: 'Phòng và khách sạn', description: 'Đăng ký, sửa, duyệt, tạm ngưng khách sạn; đề xuất đổi tài khoản nhận tiền' },
  [PERM.ADMIN_HOTEL_APPROVE_SENSITIVE]: { group: 'Phòng và khách sạn', description: 'Duyệt đổi tài khoản nhận tiền của khách sạn (nguyên tắc bốn mắt, quyền nhạy cảm)' },
  [PERM.REQUEST_HANDLE]: { group: 'Hỗ trợ và vận hành', description: 'Duyệt hoặc từ chối yêu cầu đổi/hủy đơn' },
  [PERM.SUPPORT_HANDLE]: { group: 'Hỗ trợ và vận hành', description: 'Xử lý phiếu hỗ trợ khách hàng' },
  [PERM.SHUTTLE_HANDLE]: { group: 'Hỗ trợ và vận hành', description: 'Vận hành yêu cầu xe đưa đón' },
  [PERM.FLIGHT_MANAGE]: { group: 'Hỗ trợ và vận hành', description: 'Chỉnh giờ và trạng thái chuyến bay mô phỏng' },
  [PERM.ADMIN_ALERTS]: { group: 'Hỗ trợ và vận hành', description: 'Nhận cảnh báo khẩn theo thời gian thực' },
  [PERM.ADMIN_DASHBOARD_READ]: { group: 'Báo cáo và giám sát', description: 'Xem bảng điều khiển tổng quan của Admin' },
  [PERM.AUDIT_READ]: { group: 'Báo cáo và giám sát', description: 'Xem nhật ký thao tác (chỉ đọc)' },
  [PERM.ADMIN_PAYMENT_READ]: { group: 'Thanh toán', description: 'Xem giao dịch cổng thanh toán, lệnh hoàn tiền và giao dịch bất thường' },
  [PERM.ADMIN_PAYMENT_MANAGE]: { group: 'Thanh toán', description: 'Đối soát thủ công và thử lại lệnh hoàn tiền' },
  [PERM.ADMIN_CONFIG_READ]: { group: 'Cấu hình hệ thống', description: 'Xem cấu hình và lịch sử phiên bản' },
  [PERM.ADMIN_CONFIG_WRITE]: { group: 'Cấu hình hệ thống', description: 'Sửa tham số hệ thống chung' },
  [PERM.ADMIN_CONFIG_SHUTTLE]: { group: 'Cấu hình hệ thống', description: 'Sửa bảng giá xe đưa đón' },
  [PERM.ADMIN_CONFIG_FINANCE]: { group: 'Cấu hình hệ thống', description: 'Sửa tham số tài chính (phí dịch vụ, hoa hồng, ...)' },
  [PERM.ADMIN_ACCOUNT_MANAGE]: { group: 'Tài khoản và vai trò', description: 'Quản lý tài khoản Admin, vai trò và quyền (quyền nhạy cảm, mức Quản trị hệ thống)' },
};

// Quyền nhạy cảm (mức Quản trị hệ thống): ngoài quy tắc "chỉ gán quyền mình đang có", người gán còn phải có admin:account:manage.
export const SENSITIVE_PERMISSIONS: readonly string[] = [PERM.HOTEL_SCOPE_ALL, PERM.ADMIN_ACCOUNT_MANAGE, PERM.ADMIN_HOTEL_APPROVE_SENSITIVE];
