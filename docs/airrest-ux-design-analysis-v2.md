# PHÂN TÍCH KIẾN TRÚC THÔNG TIN VÀ LUỒNG TRẢI NGHIỆM HỆ THỐNG AIRREST (MVP V1)

> **Tóm tắt chuyên môn:** Tài liệu này phân tích chi tiết sơ đồ luồng người dùng (User Flow) và kiến trúc thông tin (Sitemap/Information Architecture) của nền tảng **Airrest** — hệ thống dịch vụ lưu trú khẩn cấp dành cho hành khách sân bay gặp sự cố gián đoạn chuyến bay (chậm hoặc hủy chuyến). Tài liệu bổ sung đầy đủ sơ đồ minh họa quy trình và cấu trúc cây trang trực quan, đóng vai trò là quy chuẩn thiết kế UX/UI và phát triển phần mềm cho phiên bản MVP V1.

---

## 1. Tổng Quan Dự Án & Định Hướng Nền Tảng

Hệ thống **Airrest** được thiết kế giải quyết nỗi đau lớn nhất của hành khách sân bay khi chuyến bay bị gián đoạn: sự bất an, hoang mang và thiếu thông tin phương án lưu trú khẩn cấp.

### 1.1 Triết Lý Thiết Kế Emergency UX (Trải Nghiệm Khẩn Cấp)
* **Tối đa hóa tốc độ thao tác:** Giảm thiểu rào cản truy cập; hành khách có thể tìm kiếm và đặt phòng ngay lập tức chỉ với mã chuyến bay mà không bắt buộc đăng ký tài khoản.
* **Tự động hóa xác minh:** Tích hợp tra cứu trạng thái chuyến bay để đưa ra phương án lưu trú phù hợp theo ngữ cảnh thời gian thực.
* **Tập trung điều phối trung tâm (V1 Admin-centric):** Để đảm bảo tính tinh gọn trong giai đoạn MVP V1, đội ngũ Quản trị viên (Admin) đóng vai trò trung tâm điều phối trực tiếp toàn bộ nghiệp vụ từ xử lý đặt phòng, điều xe đưa đón cho đến chăm sóc khách hàng.

---

## 2. Phân Tích Luồng Trải Nghiệm Hành Khách (Passenger Flow)

Luồng người dùng hành khách mô tả hành trình từ lúc gặp sự cố chuyến bay cho đến khi nhận xác nhận đặt phòng và di chuyển về nơi lưu trú.

### 2.1 Sơ Đồ Quy Trình Luồng Hành Khách (Passenger Flow Diagram)

Dưới đây là sơ đồ dòng chảy quyết định và quy trình thao tác của hành khách từ lúc tra cứu sự cố đến khi theo dõi đơn đặt phòng:

```
[ Bắt đầu: Nhập Mã chuyến bay + Ngày bay ]
                   │
                   ▼
     [ Kiểm tra Trạng thái Chuyến bay ]
                   │
         ┌─────────┴─────────┐
         │                   │
  (Không gián đoạn)    (Chậm / Hủy chuyến)
         │                   │
         ▼                   ▼
[ Hiển thị trạng thái ]   [ Gợi ý Khách sạn khẩn cấp lân cận ]
 tiêu chuẩn chuyến bay       │
                             ▼
                  [ Tìm kiếm & Lọc Khách sạn ]
                   (Theo giá, khoảng cách, tiện ích)
                             │
                             ▼
                  [ Chọn phòng & Kiểm tra tồn phòng ]
                             │
                   ┌─────────┴─────────┐
                   │                   │
               (Hết phòng)         (Còn phòng)
                   │                   │
                   ▼                   ▼
           [ Chọn khách sạn khác ]  [ Nhập thông tin hành khách ]
           [ hoặc Đổi ngày bay   ]     │
                                       ▼
                            [ Xác nhận đơn & Tổng tiền ]
                                       │
                                       ▼
                            [ Tạo đơn Booking mới ]
                             (Cấp mã Booking Code)
                                       │
                                       ▼
                            [ Màn hình Theo dõi & Hỗ trợ ]
```

### 2.2 Mô Tả Chi Tiết Các Bước Trong Luồng Hành Khách

1. **Bước 1: Khởi động & Tra cứu sự cố**
   * Hành khách nhập **Mã chuyến bay** (Flight Code) và **Ngày bay** trên giao diện tìm kiếm.
   * Hệ thống thực hiện truy vấn trạng thái thời gian thực.
2. **Bước 2: Kiểm tra trạng thái chuyến bay (Phân nhánh điều kiện)**
   * *Trường hợp Không gián đoạn:* Hiển thị thông tin trạng thái chuyến bay tiêu chuẩn và các tiện ích thông thường.
   * *Trường hợp Chậm/Hủy chuyến:* Kích hoạt luồng gợi ý khách sạn khẩn cấp khu vực lân cận sân bay.
3. **Bước 3: Lọc & Lựa chọn Khách sạn**
   * Hiển thị danh sách khách sạn đáp ứng tiêu chí.
   * Bộ lọc hỗ trợ: Giá phòng, khoảng cách tới sân bay, tiện nghi (xe đưa đón, ăn uống, wifi).
   * Hành khách xem trang chi tiết khách sạn và kiểm tra tình trạng phòng rỗng.
4. **Bước 4: Kiểm tra khả dụng & Đặt phòng (Phân nhánh điều kiện)**
   * *Trường hợp Hết phòng:* Hệ thống thông báo và hướng dẫn hành khách đổi ngày hoặc chọn khách sạn khác trong danh sách.
   * *Trường hợp Còn phòng:* Nhập thông tin hành khách (Họ tên, SĐT, Email), chọn loại phòng và xác nhận tổng chi phí/chính sách hỗ trợ.
5. **Bước 5: Hoàn tất Booking & Theo dõi**
   * Tạo đơn đặt phòng thành công, cấp mã **Booking Code**.
   * Giao diện hiển thị trạng thái đơn, cho phép hành khách theo dõi lịch trình, yêu cầu hỗ trợ hoặc gửi đơn đổi/hủy phòng.

### 2.3 Bảng Mã Trạng Thái Booking Dành Cho Hành Khách

| Mã Trạng Thái | Mô Tả Ý Nghĩa Ngữ Cảnh | Hành Động Khả Thi Của Hành Khách |
| :--- | :--- | :--- |
| **PENDING** | Đơn đặt phòng đang chờ Admin/Hệ thống xác nhận | Xem chi tiết, Gửi yêu cầu hủy |
| **CONFIRMED** | Khách sạn đã xác nhận còn phòng và sẵn sàng đón | Xem hướng dẫn nhận phòng, Đặt xe đưa đón |
| **CHECKED_IN** | Hành khách đã hoàn tất thủ tục nhận phòng | Xem thông tin lưu trú, Liên hệ hỗ trợ |
| **CANCELLED** | Đơn đặt phòng đã bị hủy bởi hành khách hoặc hệ thống | Xem lịch sử hủy đơn |
| **REJECTED** | Đơn bị từ chối (do hết phòng đột xuất hoặc sự cố) | Đặt lại khách sạn khác |
| **EXPIRED** | Quá hạn xác nhận/thanh toán mà không có phản hồi | Thực hiện tìm kiếm mới |

---

## 3. Phân Tích Luồng Quản Trị & Điều Phối Vận Hành (Admin Flow)

Admin Flow là luồng công việc của bộ phận vận hành nhằm đảm bảo mọi booking từ hành khách được tiếp nhận và xử lý chuẩn xác.

### 3.1 Sơ Đồ Quy Trình Điều Phối Vận Hành (Admin Flow Diagram)

Dưới đây là sơ đồ cấu trúc vận hành từ Bảng điều khiển trung tâm (Dashboard) đến 5 phân khu nghiệp vụ:

```
                      ┌───────────────────────────┐
                      │    ADMIN DASHBOARD HUB    │
                      └─────────────┬─────────────┘
                                    │
    ┌─────────────────┬─────────────┼─────────────┬─────────────────┐
    │                 │             │             │                 │
    ▼                 ▼             ▼             ▼                 ▼
┌─────────┐     ┌───────────┐ ┌───────────┐ ┌───────────┐     ┌───────────┐
│ Booking │     │   Hotel   │ │  Support  │ │  Shuttle  │     │  Audit &  │
│ Control │     │ Inventory │ │ Handling  │ │ Logistics │     │ Analytics │
└────┬────┘     └─────┬─────┘ └─────┬─────┘ └─────┬─────┘     └─────┬─────┘
     │                │             │             │                 │
     ▼                ▼             ▼             ▼                 ▼
 ┌───────┐        ┌───────┐     ┌───────┐     ┌───────┐         ┌───────┐
 │ Phê   │        │Thêm / │     │Tiếp   │     │ Tiếp  │         │Nhật ký│
 │ duyệt │        │Sửa    │     │nhận   │     │ nhận  │         │thao   │
 │ đơn   │        │khách  │     │ticket │     │yêu cầu│         │tác    │
 └───┬───┘        │sạn    │     └───┬───┘     └───┬───┘         └───┬───┘
     │            └───┬───┘         │             │                 │
     ▼                ▼             ▼             ▼                 ▼
 ┌───────┐        ┌───────┐     ┌───────┐     ┌───────┐         ┌───────┐
 │ Đổi / │        │ Cập   │     │ Xử lý │     │Phân xe│         │ Báo   │
 │ Hủy   │        │ nhật  │     │ & Phản│     │ & Tài │         │ cáo   │
 │ phòng │        │ phòng │     │ hồi   │     │ xế    │         │doanh  │
 └───────┘        └───────┘     └───────┘     └───────┘         │ thu   │
                                                                └───────┘
```

### 3.2 Mô Hình Trung Tâm Vận Hành (Dashboard-Centric)
Quản trị viên đăng nhập vào hệ thống và quản lý 5 phân khu nghiệp vụ cốt lõi từ bảng điều khiển trung tâm (Dashboard):

* **Booking Management:** Tiếp nhận và xử lý đơn đặt phòng.
* **Hotel Management:** Quản lý thông tin khách sạn và tồn phòng.
* **Support Management:** Tiếp nhận và xử lý ticket hỗ trợ khách hàng.
* **Shuttle Operations:** Điều phối dịch vụ xe đưa đón khẩn cấp.
* **Audit & Reporting:** Nhật ký hoạt động và báo cáo hiệu suất.

### 3.3 Chi Tiết Quy Trình Chuyển Đổi Trạng Thái Đơn Booking

Sơ đồ chuyển đổi trạng thái (State Transition) trong quy trình xử lý đơn đặt phòng của Admin:

```
               [ Booking Mới: PENDING ]
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
 [ Admin Duyệt: CONFIRMED ]      [ Admin Từ Chối: REJECTED ]
          │                               (Kèm lý do từ chối)
          ▼
 [ Hành khách đến: CHECKED_IN ]
          │
          ▼
   [ Hoàn tất Lưu trú ]

 * Trạng thái phụ:
   - PENDING ──► CANCELLED (Hành khách hủy đơn)
   - PENDING ──► EXPIRED   (Quá thời gian xác nhận)
```

### 3.4 Các Quy Trình Nghiệp Vụ Quản Trị Chi Tiết

* **Nghiệp vụ Xử lý Booking:**
  * Tiếp nhận danh sách đơn đặt phòng ở trạng thái `PENDING`.
  * Phê duyệt đơn (`CONFIRMED`) hoặc Từ chối (`REJECTED` kèm lý do cụ thể gửi tới hành khách).
  * Tiếp nhận và duyệt các yêu cầu Thay đổi (Change) hoặc Hủy (Cancel) đơn phòng.
* **Nghiệp vụ Quản lý Khách sạn & Phòng:**
  * Thêm mới, chỉnh sửa thông tin chi tiết các khách sạn đối tác.
  * Quản lý danh mục loại phòng, cập nhật số lượng phòng khả dụng thời gian thực.
* **Nghiệp vụ Chăm sóc Khách hàng & Hỗ trợ:**
  * Phân loại ticket hỗ trợ theo trạng thái (Mới, Đang xử lý, Đã giải quyết).
  * Phản hồi trực tiếp tới hành khách và cập nhật tiến độ xử lý.
* **Nghiệp vụ Điều phối Xe đưa đón (Shuttle Logistics):**
  * Tiếp nhận yêu cầu đưa đón khẩn cấp từ booking đã xác nhận.
  * Phân công tài xế/phương tiện, cập nhật thời gian dự kiến (ETA) và theo dõi tiến độ di chuyển.
* **Nghiệp vụ Kiểm toán & Báo cáo:**
  * Nhật ký hệ thống (Audit log) ghi nhận mọi thao tác phê duyệt/từ chối.
  * Báo cáo thống kê hiệu suất đặt phòng, tỷ lệ hủy đơn và đối soát chi phí.

---

## 4. Phân Tích Kiến Trúc Thông Tin Hành Khách (Passenger Sitemap)

Passenger Sitemap cấu trúc toàn bộ cây màn hình hiển thị dành cho hành khách, bảo đảm việc truy vấn thông tin diễn ra thông suốt.

### 4.1 Sơ Đồ Cây Kiến Trúc Trang Hành Khách (Passenger Sitemap Diagram)

```
                       ┌─────────────────────────┐
                       │   AIRREST LANDING HUB   │
                       └────────────┬────────────┘
                                    │
    ┌─────────────────┬─────────────┼─────────────┬─────────────────┐
    │                 │             │             │                 │
    ▼                 ▼             ▼             ▼                 ▼
┌─────────┐     ┌───────────┐ ┌───────────┐ ┌───────────┐     ┌───────────┐
│ Tra cứu │     │ Tìm kiếm  │ │  Quản lý  │ │   Trung   │     │ Tài khoản │
│ Chuyến  │     │ & Đặt     │ │   Đơn     │ │   tâm     │     │ Cá nhân   │
│   bay   │     │ Khách sạn │ │ Booking   │ │  Hỗ trợ   │     │(Tùy chọn) │
└────┬────┘     └─────┬─────┘ └─────┬─────┘ └─────┬─────┘     └─────┬─────┘
     │                │             │             │                 │
     ├─ Input Mã bay  ├─ Danh sách  ├─ Tra cứu    ├─ Tạo Ticket     ├─ Đăng ký/
     ├─ Trạng thái    ├─ Chi tiết   │  mã đơn     │  trợ giúp       │  Đăng nhập
     └─ Gợi ý phòng   ├─ Chọn phòng ├─ Chi tiết   ├─ Theo dõi       ├─ Hồ sơ
                      ├─ Thông tin  │  booking    │  tiến độ        │  cá nhân
                      └─ Xác nhận   └─ Yêu cầu    └─ Xem phản hồi   └─ Lịch sử
                         đơn           Đổi / Hủy                       đặt đơn
```

### 4.2 Cấu Trúc Chi Tiết 5 Nhánh Từ Trang Chủ (Homepage)

#### 1. Trang Chủ & Tra Cứu Chuyến Bay (Flight Lookup Hub)
* Form tìm kiếm mã chuyến bay + Ngày bay.
* Màn hình kết quả trạng thái chuyến bay (Delayed/Cancelled status).
* Màn hình gợi ý danh sách lưu trú phù hợp ngữ cảnh khẩn cấp.

#### 2. Luồng Tìm Kiếm & Đặt Phòng Khách Sạn (Hotel Search & Booking)
* Trang danh sách khách sạn (kèm bộ lọc đa chiều & bản đồ vị trí).
* Trang chi tiết khách sạn (mô tả, hình ảnh, tiện ích, khoảng cách sân bay).
* Màn hình chọn loại phòng & số lượng.
* Màn hình nhập thông tin hành khách (Guest Details).
* Màn hình xác nhận & hoàn tất đặt phòng (Booking Confirmation).

#### 3. Quản Lý Đặt Phòng (My Bookings)
* Màn hình tra cứu đơn khẩn cấp (nhập Mã booking + Số điện thoại/Email).
* Trang chi tiết đơn đặt phòng (Booking Detail & Status Indicator).
* Form gửi yêu cầu Thay đổi/Hủy phòng (Change/Cancel Request).
* Trang danh sách lịch sử đặt phòng (dành cho người dùng đã đăng nhập).

#### 4. Trung Tâm Hỗ Trợ (Support Center)
* Form tạo yêu cầu trợ giúp khẩn cấp (Submit Support Ticket).
* Màn hình tra cứu & theo dõi tiến độ xử lý Ticket.
* Trang chi tiết phản hồi từ Quản trị viên.

#### 5. Tài Khoản Cá Nhân (User Account - Tuỳ chọn V1)
* Màn hình Đăng ký / Đăng nhập (Email, Phone, OTP).
* Trang thông tin cá nhân (Profile Settings).
* Lịch sử đặt phòng & cài đặt nhận thông báo.

---

## 5. Phân Tích Kiến Trúc Thông Tin Quản Trị (Admin Sitemap)

Admin Sitemap tổ chức toàn bộ giao diện quản trị backend, phân chia rõ ràng trách nhiệm vận hành của Quản trị viên.

### 5.1 Sơ Đồ Cây Kiến Trúc Trang Quản Trị (Admin Sitemap Diagram)

```
                      ┌───────────────────────────┐
                      │    ADMIN PORTAL ROOT      │
                      └─────────────┬─────────────┘
                                    │
 ┌──────────┬───────────┬───────────┼───────────┬───────────┬───────────┐
 │          │           │           │           │           │           │
 ▼          ▼           ▼           ▼           ▼           ▼           ▼
┌──────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Dashboard│Booking  │ │Hotel     │ │Support   │ │Logistics │ │System    │ │Reports   │
│Summary  │Control  │ │Inventory │ │Ticket    │ │& Shuttle │ │Settings  │ │Reports   │
└──┬───┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
   │          │            │            │            │            │            │
   ├─ KPIs    ├─ Danh sách ├─ Danh sách ├─ Ticket mới├─ Yêu cầu xe├─ Phân quyền├─ Báo cáo
   ├─ Biểu đồ ├─ Duyệt đơn ├─ Thêm/Sửa  ├─ Đang xử lý├─ Điều xe   ├─ Cấu hình  │  doanh thu
   └─ Cảnh báo├─ Đổi/Hủy   └─ Tồn phòng └─ Phản hồi  └─ Thanh toán└─ Audit Log └─ Thống kê
```

### 5.2 Cấu Trúc Chi Tiết 6 Phân Khu Chức Năng Của Admin Portal

#### 1. Admin Dashboard (Bảng Điều Khiển Tổng Quan)
* Chỉ số tổng quan (KPI Cards): Booking mới, Đơn chờ duyệt, Ticket cần xử lý, Khách sạn hoạt động.
* Biểu đồ thống kê xu hướng gián đoạn chuyến bay & nhu cầu lưu trú.
* Danh sách cảnh báo khẩn cấp thời gian thực.

#### 2. Quản Lý Đặt Phòng (Booking Management)
* Danh sách Booking toàn hệ thống (bộ lọc theo trạng thái: Pending, Confirmed, Checked-in, Cancelled, Rejected).
* Màn hình duyệt chi tiết từng Booking (Approve / Reject action panel).
* Phân khu xử lý yêu cầu Đổi / Hủy phòng từ hành khách.
* Lịch sử thay đổi trạng thái đơn (Status Change History).

#### 3. Quản Lý Khách Sạn & Đối Tác (Hotel Management)
* Danh sách khách sạn liên kết.
* Màn hình thêm mới & cập nhật thông tin khách sạn.
* Giao diện quản lý sơ đồ phòng, điều chỉnh tồn phòng (Room Inventory Management).
* *Tính năng V2:* Quản lý thông tin & hợp đồng đối tác.

#### 4. Quản Lý Hỗ Trợ Khách Hàng (Support Management)
* Danh sách Ticket trợ giúp toàn hệ thống.
* Màn hình xem chi tiết nội dung sự cố & lịch sử trao đổi.
* Công cụ phản hồi trực tiếp & cập nhật trạng thái Ticket.

#### 5. Vận Hành & Lô-gi-stíc (Operations & Logistics)
* Quản lý yêu cầu xe đưa đón sân bay - khách sạn.
* Màn hình điều phối & giao xe/tài xế.
* Quản lý giao dịch & đối soát thanh toán.
* *Tính năng V2:* Quản lý đánh giá/phản hồi từ khách hàng (Review Management).

#### 6. Cài Đặt Hệ Thống & Kiểm Toán (System Settings & Audit)
* Quản lý tài khoản Admin & phân quyền truy cập.
* Nhật ký hoạt động hệ thống (System Audit Logs).
* Cấu hình tham số hệ thống (Thời gian hết hạn booking, mẫu thông báo).

---

## 6. Đánh Giá Tổng Hợp UX/UI & Lộ Trình Nâng Cấp V1 -> V2

### 6.1 Bảng So Sánh Phạm Vi Nghiệp Vụ V1 vs V2

| Hạng Mục Chức Năng | Phiên Bản MVP V1 (Hiện Tại) | Định Hướng Phiên Bản V2 |
| :--- | :--- | :--- |
| **Quyền Vận Hành Khách Sạn** | Admin đại diện xử lý toàn bộ thao tác khách sạn | Phân quyền tài khoản riêng cho Nhân viên Khách sạn (Hotel Staff Portal) |
| **Xác Minh Đặt Phòng** | Nhập mã chuyến bay + Tìm kiếm phòng | Tự động khớp dữ liệu chuyến bay bị trễ với chính sách bồi thường lưu trú của hãng bay |
| **Thanh Toán & Đối Soát** | Xác nhận thủ công / Ghi nhận mã thanh toán cơ bản | Tích hợp cổng thanh toán trực tuyến & Hệ thống đối soát tài chính tự động với đối tác |
| **Đánh Giá & Phản Hồi** | Tiếp nhận qua Ticket hỗ trợ | Hệ thống chấm điểm & Đánh giá khách sạn/dịch vụ vận chuyển trực quan |

### 6.2 Kết Luận & Đề Xuất Nâng Cấp UX
1. **Ưu điểm lớn nhất của thiết kế V1:** Đã giải quyết bài toán cốt lõi của trải nghiệm người dùng trong tình huống khẩn cấp (Emergency UX) bằng cách tối giản quy trình nhập liệu, cho phép tra cứu theo mã chuyến bay và đặt phòng ngay mà không bắt buộc tạo tài khoản.
2. **Đề xuất bước tiếp theo:** Tiến hành kiểm thử người dùng (Usability Testing) trên bản mô phỏng giao diện (Interactive Prototype) để đo lường thời gian hoàn tất tác vụ (Time-to-Task Completion) của hành khách khi đặt phòng khẩn cấp.
