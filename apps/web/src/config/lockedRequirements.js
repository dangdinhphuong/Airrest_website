// Sinh từ gói SRS hotel-admin (các yêu cầu Blocked/Deferred). Chỉ để hiện thẻ “chờ quyết định”, không giả lập hành vi.
export const LOCKED = [
 {
  "id": "HM-FR-004",
  "name": "Hồ sơ pháp lý và tài liệu xác minh",
  "status": "Blocked",
  "oq": [
   "OQ-51"
  ],
  "area": "hotel",
  "tab": "profile"
 },
 {
  "id": "HM-FR-010",
  "name": "Gói giá, mùa và ngày đặc biệt",
  "status": "Deferred",
  "oq": [
   "OQ-61",
   "OQ-62"
  ],
  "area": "hotel",
  "tab": "rooms"
 },
 {
  "id": "HM-FR-011",
  "name": "Thuế, phí và phụ thu",
  "status": "Blocked",
  "oq": [
   "OQ-62",
   "OQ-43",
   "OQ-60"
  ],
  "area": "hotel",
  "tab": "rooms"
 },
 {
  "id": "HM-FR-013",
  "name": "Chính sách hủy, hoàn tiền và thay đổi đặt phòng",
  "status": "Blocked",
  "oq": [
   "OQ-46",
   "OQ-43"
  ],
  "area": "hotel",
  "tab": "rooms"
 },
 {
  "id": "HM-FR-018",
  "name": "Giữ chỗ tạm thời",
  "status": "Blocked",
  "oq": [
   "OQ-45"
  ],
  "area": "hotel",
  "tab": "inventory"
 },
 {
  "id": "HM-FR-020",
  "name": "Đồng bộ tồn phòng với hệ thống ngoài (PMS/channel manager)",
  "status": "Blocked",
  "oq": [
   "OQ-44"
  ],
  "area": "hotel",
  "tab": "inventory"
 },
 {
  "id": "HM-FR-025",
  "name": "Hết hạn yêu cầu chờ xác nhận",
  "status": "Blocked",
  "oq": [
   "OQ-45"
  ],
  "area": "hotel",
  "tab": "bookings"
 },
 {
  "id": "HM-FR-027",
  "name": "Hủy, đổi lịch và khách không đến",
  "status": "Blocked",
  "oq": [
   "OQ-46",
   "OQ-43"
  ],
  "area": "hotel",
  "tab": "bookings"
 },
 {
  "id": "HM-FR-030",
  "name": "Xác nhận nhận phòng và trả phòng",
  "status": "Deferred",
  "oq": [
   "OQ-54"
  ],
  "area": "hotel",
  "tab": "overview"
 },
 {
  "id": "HM-FR-031",
  "name": "Khách đến muộn, không đến hoặc cần hỗ trợ",
  "status": "Blocked",
  "oq": [
   "OQ-46",
   "OQ-54"
  ],
  "area": "hotel",
  "tab": "overview"
 },
 {
  "id": "HM-FR-032",
  "name": "Trạng thái phòng vận hành (dọn, bảo trì, sẵn sàng)",
  "status": "Deferred",
  "oq": [
   "OQ-54"
  ],
  "area": "hotel",
  "tab": "overview"
 },
 {
  "id": "HM-FR-033",
  "name": "Ghi chú vận hành và bàn giao ca",
  "status": "Deferred",
  "oq": [
   "OQ-54"
  ],
  "area": "hotel",
  "tab": "overview"
 },
 {
  "id": "HM-FR-035",
  "name": "Đón khách bằng xe của khách sạn (lái xe)",
  "status": "Blocked",
  "oq": [
   "OQ-50"
  ],
  "area": "hotel",
  "tab": "pickups"
 },
 {
  "id": "HM-FR-036",
  "name": "Ghi nhận mô hình thu tiền của đặt phòng",
  "status": "Blocked",
  "oq": [
   "OQ-43"
  ],
  "area": "hotel",
  "tab": "pending"
 },
 {
  "id": "HM-FR-037",
  "name": "Đối soát đặt phòng, lưu trú và giao dịch",
  "status": "Blocked",
  "oq": [
   "OQ-43"
  ],
  "area": "hotel",
  "tab": "pending"
 },
 {
  "id": "HM-FR-038",
  "name": "Lịch sử thanh toán, hoàn tiền và công nợ",
  "status": "Blocked",
  "oq": [
   "OQ-43"
  ],
  "area": "hotel",
  "tab": "pending"
 },
 {
  "id": "HM-FR-040",
  "name": "Chỉ số chất lượng khách quan",
  "status": "Blocked",
  "oq": [
   "OQ-56"
  ],
  "area": "hotel",
  "tab": "quality"
 },
 {
  "id": "HM-FR-042",
  "name": "Thông báo yêu cầu mới và kết quả",
  "status": "Blocked",
  "oq": [
   "OQ-52"
  ],
  "area": "hotel",
  "tab": "pending"
 },
 {
  "id": "HM-FR-043",
  "name": "Nhắc yêu cầu sắp hết hạn",
  "status": "Blocked",
  "oq": [
   "OQ-45",
   "OQ-52"
  ],
  "area": "hotel",
  "tab": "pending"
 },
 {
  "id": "HM-FR-044",
  "name": "Lịch sử thông báo, lỗi gửi, retry và chống gửi trùng",
  "status": "Blocked",
  "oq": [
   "OQ-52"
  ],
  "area": "hotel",
  "tab": "pending"
 },
 {
  "id": "HM-FR-048",
  "name": "Báo cáo tài chính",
  "status": "Blocked",
  "oq": [
   "OQ-43"
  ],
  "area": "hotel",
  "tab": "reports"
 },
 {
  "id": "SA-FR-004",
  "name": "Đặt lại mật khẩu và khôi phục truy cập",
  "status": "Blocked",
  "oq": [
   "OQ-48"
  ],
  "area": "admin",
  "tab": "accounts"
 },
 {
  "id": "SA-FR-014",
  "name": "Phân tách người lập và người duyệt (maker-checker)",
  "status": "Blocked",
  "oq": [
   "OQ-47"
  ],
  "area": "admin",
  "tab": "properties"
 },
 {
  "id": "SA-FR-016",
  "name": "Tham số nghiệp vụ (thời hạn giữ chỗ, timeout)",
  "status": "Blocked",
  "oq": [
   "OQ-45",
   "OQ-47"
  ],
  "area": "admin",
  "tab": "config"
 },
 {
  "id": "SA-FR-017",
  "name": "Nội dung FAQ và hướng dẫn",
  "status": "Blocked",
  "oq": [
   "OQ-47"
  ],
  "area": "admin",
  "tab": "config"
 },
 {
  "id": "SA-FR-018",
  "name": "Cấu hình thông báo",
  "status": "Blocked",
  "oq": [
   "OQ-52"
  ],
  "area": "admin",
  "tab": "config"
 },
 {
  "id": "SA-FR-021",
  "name": "Dashboard tình trạng vận hành",
  "status": "Blocked",
  "oq": [
   "OQ-58"
  ],
  "area": "admin",
  "tab": "monitor"
 },
 {
  "id": "SA-FR-027",
  "name": "Bảo vệ audit log: bất biến, quyền và lưu giữ",
  "status": "Blocked",
  "oq": [
   "OQ-49"
  ],
  "area": "admin",
  "tab": "log"
 },
 {
  "id": "SA-FR-029",
  "name": "Phân loại dữ liệu",
  "status": "Blocked",
  "oq": [
   "OQ-50"
  ],
  "area": "admin",
  "tab": "rbac"
 },
 {
  "id": "SA-FR-031",
  "name": "Yêu cầu sửa, xuất, xóa dữ liệu cá nhân",
  "status": "Blocked",
  "oq": [
   "OQ-50"
  ],
  "area": "admin",
  "tab": "rbac"
 },
 {
  "id": "SA-FR-032",
  "name": "Quản lý căn cứ xử lý dữ liệu và sự đồng ý",
  "status": "Blocked",
  "oq": [
   "OQ-50"
  ],
  "area": "admin",
  "tab": "rbac"
 },
 {
  "id": "SA-FR-036",
  "name": "Trạng thái kết nối và lịch sử request/response",
  "status": "Blocked",
  "oq": [
   "OQ-44",
   "OQ-52"
  ],
  "area": "admin",
  "tab": "pending"
 },
 {
  "id": "SA-FR-038",
  "name": "Quản lý credentials và khóa API",
  "status": "Blocked",
  "oq": [
   "OQ-58"
  ],
  "area": "admin",
  "tab": "pending"
 }
];
