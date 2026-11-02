# 04. Phi chức năng, bảo mật và riêng tư dùng chung

Phiên bản v0.1 Draft · 2026-10-26 · Trạng thái **DRAFT, chưa được phê duyệt**. Tài liệu bổ sung độc lập, không thay thế SRS hiện hành.

Áp dụng cho cả hai phân hệ. 37 yêu cầu `SH-NFR`. Cột “Loại” cho biết yêu cầu nghiệp vụ, yêu cầu hệ thống hay đề xuất kỹ thuật. **Mọi con số hiệu năng chỉ là giá trị khởi điểm đề xuất để đo, không phải cam kết** và chờ OQ-53. Hạ tầng logging, monitoring, backup chưa biết đã có hay chưa (OQ-58): các yêu cầu tương ứng là yêu cầu logic, không khẳng định năng lực đã tồn tại.

Nội dung liên quan dữ liệu cá nhân cần legal/security review; gói này không kết luận tuân thủ pháp luật (Luật 91/2025/QH15 mới được SRS hiện hành tham khảo một phần, Điều 2, 9, 19; NĐ 356/2025 xác minh một phần).

## Bảo mật

| ID | Tên | Loại | Mô tả (đề xuất) | Cách kiểm chứng | Trạng thái | OQ |
|---|---|---|---|---|---|---|
| SH-NFR-001 | Kiểm tra quyền phía máy chủ, deny-by-default | Hệ thống | Mọi API kiểm tra (người dùng, tài nguyên, hành động, tenant) ở máy chủ; không có quyền tường minh thì từ chối. Ẩn nút trên giao diện không được coi là bảo mật. | Test tự động cho mỗi ô trong ma trận quyền; gọi API trực tiếp không quyền trả 403 | Proposed | OQ-55 |
| SH-NFR-002 | Cách ly tenant | Hệ thống | Mọi truy vấn và ghi bị ràng buộc theo tenant; báo cáo, xuất dữ liệu, tìm kiếm cũng vậy. | Kiểm thử đổi mã đối tượng sang tenant khác phải bị từ chối với mọi loại tài nguyên | Proposed | OQ-55 |
| SH-NFR-003 | Least privilege | Hệ thống | Mỗi vai trò chỉ có quyền tối thiểu cần thiết; ma trận quyền được rà soát định kỳ. | Báo cáo quyền thừa so với ma trận được duyệt = 0 | Proposed | OQ-55 |
| SH-NFR-004 | Quản lý phiên | Hệ thống | Phiên có hạn không hoạt động, có thể thu hồi; đăng xuất làm mất hiệu lực phía máy chủ. | Phiên bị thu hồi bị từ chối ở yêu cầu kế tiếp; thời hạn đo được theo cấu hình | Proposed | OQ-48 |
| SH-NFR-005 | Chống truy cập trái phép | Hệ thống | Giới hạn số lần đăng nhập sai, khóa tạm, cảnh báo bất thường; ngưỡng cụ thể do bảo mật quyết định. | Sau N lần sai (N cấu hình) đăng nhập bị chặn tạm thời | Proposed | OQ-48 |
| SH-NFR-006 | Che dữ liệu nhạy cảm | Hệ thống | Dữ liệu nhạy cảm bị che mặc định trên giao diện, báo cáo, log. | Quét log và báo cáo mẫu không thấy dữ liệu nhạy cảm | Proposed | OQ-50 |
| SH-NFR-007 | Audit trail | Hệ thống | Sự kiện quan trọng được ghi đủ trường, không sửa xóa; thời hạn lưu theo chính sách. | Mỗi sự kiện trong danh mục tạo một bản ghi đủ trường | Proposed | OQ-49 |
| SH-NFR-008 | Kiểm soát xuất dữ liệu | Hệ thống | Xuất cần quyền riêng, giới hạn kích thước, ghi audit, che trường nhạy cảm. | Người không có quyền xuất bị từ chối cả qua API | Proposed | OQ-50 |
| SH-NFR-009 | Bảo vệ credentials | Hệ thống | Secret không hiển thị dạng rõ, không ghi vào log, xoay được. | Quét log/giao diện không thấy secret | Proposed | OQ-58 |
| SH-NFR-010 | Bảo vệ dữ liệu khi truyền và lưu | Đề xuất kỹ thuật | Dữ liệu truyền qua kênh mã hóa; dữ liệu nhạy cảm lưu có bảo vệ; công nghệ cụ thể do kiến trúc sư quyết định. | Rà soát kiến trúc xác nhận | Proposed | OQ-58 |

## Toàn vẹn dữ liệu

| ID | Tên | Loại | Mô tả (đề xuất) | Cách kiểm chứng | Trạng thái | OQ |
|---|---|---|---|---|---|---|
| SH-NFR-011 | Mã định danh duy nhất | Hệ thống | Mọi thực thể có mã duy nhất, không tái sử dụng. | Không có hai bản ghi cùng mã trong cùng loại | Proposed | — |
| SH-NFR-012 | Ràng buộc và validation phía máy chủ | Hệ thống | Mọi ràng buộc được kiểm ở máy chủ, không chỉ giao diện. | Gửi dữ liệu sai trực tiếp qua API bị từ chối | Proposed | — |
| SH-NFR-013 | Chống đặt vượt tồn phòng | Hệ thống | Không bao giờ tạo tổng giữ + đặt vượt tồn có thể bán. | Kiểm thử đồng thời cho tổng ≤ tồn | Proposed | — |
| SH-NFR-014 | Idempotency cho thao tác có thể retry | Hệ thống | Thao tác ghi quan trọng nhận khóa idempotency; lặp lại cho cùng kết quả. | Gửi hai lần cùng khóa chỉ tạo một hiệu ứng | Proposed | — |
| SH-NFR-015 | Cập nhật đồng thời | Đề xuất kỹ thuật | Phát hiện và xử lý ghi chồng (ví dụ kiểm tra phiên bản); người ghi sau nhận thông báo xung đột. | Hai ghi đồng thời: một thành công, một nhận xung đột | Proposed | — |
| SH-NFR-016 | Lịch sử chuyển trạng thái | Hệ thống | Mọi chuyển trạng thái của thực thể có vòng đời ghi lịch sử. | Mỗi chuyển trạng thái có một dòng lịch sử | Proposed | — |
| SH-NFR-017 | Nhất quán sau lỗi | Hệ thống | Lỗi giữa chừng không để lại giữ chỗ treo hoặc tồn sai; có bù trừ. | Mô phỏng lỗi sau khi trừ tồn: tồn được hoàn | Proposed | — |

## Hiệu năng

| ID | Tên | Loại | Mô tả (đề xuất) | Cách kiểm chứng | Trạng thái | OQ |
|---|---|---|---|---|---|---|
| SH-NFR-018 | Thời gian phản hồi truy vấn danh sách | Hệ thống | Giá trị khởi điểm đề xuất để đo: p95 ≤ 2 giây ở quy mô giả định (SH-NFR-023). Không phải cam kết. | Đo p95 trong môi trường kiểm thử với dữ liệu quy mô giả định | Proposed | OQ-53 |
| SH-NFR-019 | Thời gian thao tác ghi | Hệ thống | Giá trị khởi điểm đề xuất: p95 ≤ 1 giây cho cập nhật thông thường. Không phải cam kết. | Đo p95 | Proposed | OQ-53 |
| SH-NFR-020 | Thời gian giữ chỗ và đặt phòng | Hệ thống | Giá trị khởi điểm đề xuất: p95 ≤ 2 giây. Không phải cam kết. | Đo p95 kể cả khi cạnh tranh tồn | Proposed | OQ-53 |
| SH-NFR-021 | Thời gian tải báo cáo | Hệ thống | Giá trị khởi điểm đề xuất: báo cáo 30 ngày ≤ 10 giây. Không phải cam kết. | Đo trên dữ liệu quy mô giả định | Proposed | OQ-53 |
| SH-NFR-022 | Người dùng đồng thời | Hệ thống | Số người dùng đồng thời mục tiêu chưa có; cần PO cung cấp trước khi ước lượng. | Đo theo con số PO xác nhận | Proposed | OQ-53 |
| SH-NFR-023 | Quy mô dữ liệu dự kiến | Nghiệp vụ | Số khách sạn, loại phòng, đặt phòng theo ngày chưa có; dùng làm đầu vào ước lượng. MVP hiện yêu cầu tối thiểu 30 cơ sở mô phỏng (MB-05). | PO xác nhận con số | Proposed | OQ-53 |
| SH-NFR-024 | Chịu tải đột biến | Hệ thống | Kịch bản đột biến (nhiều chuyến bay chậm cùng lúc làm tăng yêu cầu) phải được định nghĩa và đo; chưa đặt số. | Kịch bản kiểm thử tải được PO duyệt | Proposed | OQ-53 |

## Vận hành

| ID | Tên | Loại | Mô tả (đề xuất) | Cách kiểm chứng | Trạng thái | OQ |
|---|---|---|---|---|---|---|
| SH-NFR-025 | Backup và khôi phục | Hệ thống | Có sao lưu và quy trình khôi phục; mục tiêu thời gian khôi phục và điểm khôi phục do PO/kiến trúc sư quyết định. | Diễn tập khôi phục đạt mục tiêu đã duyệt | Proposed | OQ-58 |
| SH-NFR-026 | Xử lý lỗi dịch vụ ngoài | Hệ thống | Timeout, retry giới hạn, hạ cấp có kiểm soát khi dịch vụ ngoài lỗi. | Mô phỏng dịch vụ ngoài lỗi: luồng chính không treo | Proposed | OQ-58 |
| SH-NFR-027 | Migration dữ liệu | Hệ thống | Migration có kiểm soát, kiểm chứng và rollback. | Diễn tập migration trên bản sao | Proposed | OQ-58 |
| SH-NFR-028 | Cấu hình theo môi trường và rollback | Hệ thống | Cấu hình tách theo môi trường; thay đổi quan trọng rollback được (SM-06). | Rollback về phiên bản trước khôi phục đúng giá trị | Proposed | OQ-47 |
| SH-NFR-034 | Logging có cấu trúc và correlation ID | Hệ thống | Log có cấu trúc, mang correlation ID, không chứa dữ liệu nhạy cảm. | Một ID truy được toàn luồng | Proposed | OQ-58 |
| SH-NFR-035 | Monitoring và alerting | Hệ thống | Có theo dõi lỗi và cảnh báo; chưa biết hạ tầng hiện có nên đây là yêu cầu logic, không phải năng lực đã tồn tại. | Rà soát hạ tầng xác nhận | Proposed | OQ-58 |

## Khả dụng

| ID | Tên | Loại | Mô tả (đề xuất) | Cách kiểm chứng | Trạng thái | OQ |
|---|---|---|---|---|---|---|
| SH-NFR-029 | Responsive | Nghiệp vụ | Dùng được trên desktop, tablet, mobile; khớp NFR-001 của SRS hiện hành (360 đến 1440 px, không cuộn ngang). | Kiểm tra ở 360, 768, 1280 px | Proposed | — |
| SH-NFR-030 | Validation và thông báo lỗi | Nghiệp vụ | Mọi biểu mẫu báo lỗi từng trường và nêu cách khắc phục. | Mỗi trường có thông báo lỗi tương ứng | Proposed | — |
| SH-NFR-031 | Bàn phím và tiếp cận | Nghiệp vụ | Thao tác được bằng bàn phím, có focus rõ; mục tiêu tiếp cận theo D-20 của SRS hiện hành (đang chờ PO). | Duyệt bàn phím mọi chức năng chính | Proposed | OQ-53 |
| SH-NFR-032 | Xác nhận hành động nguy hiểm | Nghiệp vụ | Hành động phá hủy hoặc khó đảo ngược (khóa, vô hiệu hóa, tạm ngưng, rollback, xóa) cần xác nhận rõ. | Mỗi hành động trong danh sách có bước xác nhận | Proposed | — |
| SH-NFR-033 | Trạng thái tải, rỗng, lỗi, thử lại | Nghiệp vụ | Mọi màn hình danh sách có trạng thái đang tải, rỗng, lỗi kèm thử lại. | Mỗi màn hình có đủ bốn trạng thái | Proposed | — |

## Nghiệp vụ

| ID | Tên | Loại | Mô tả (đề xuất) | Cách kiểm chứng | Trạng thái | OQ |
|---|---|---|---|---|---|---|
| SH-NFR-036 | Múi giờ, tiền tệ, ngôn ngữ | Nghiệp vụ | Dùng nhất quán múi giờ, tiền tệ, ngôn ngữ; giá trị do PO quyết định. | Không có số liệu hiển thị sai múi giờ trong kiểm thử | Proposed | OQ-60 |
| SH-NFR-037 | Giảm thiểu dữ liệu và riêng tư | Nghiệp vụ | Chỉ thu dữ liệu cá nhân tối thiểu; giữ nguyên tắc của MB-19 và BR-002 của SRS hiện hành trừ khi PO thay đổi; cần legal/security review. | Danh sách trường cá nhân được PO duyệt | Proposed | OQ-50 |
