# MVP Baseline

> Baseline đề xuất. Chỉ chuyển sang Đã duyệt sau khi nhóm/GVHD xác nhận B00/B03.

| ID | FR/NFR | Hạng mục | MoSCoW | MVP | Luồng/Màn hình | Giá trị người dùng | Acceptance Criteria | Nguồn | Sprint | Trạng thái duyệt | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MB-01 | FR-01,02 | Tra cứu/nhập chuyến bay | Must | Có | L1/L2 · M0–M1 | Biết giờ bay và bối cảnh | Tra cứu hoặc nhập thủ công; hiện giờ cũ/mới/trạng thái ≤3 giây | N01 | S1 | Chờ duyệt | Mock D1 |
| MB-02 | FR-03 | Thẻ trạng thái và đổi giờ | Must | Có | L1/L2 · M1 | Không bỏ lỡ thay đổi | Thẻ luôn hiển thị; có thời điểm cập nhật và banner đổi giờ | N01,N08 | S1/S2 | Chờ duyệt | Tự động hóa hoàn thiện S2 |
| MB-03 | FR-04 | Quyền lợi hành khách | Must | Có điều kiện | L1/L2 · M1 | Hiểu quyền lợi và điều kiện | Có mốc, nguồn, điều kiện; không kết luận khi nguyên nhân chưa rõ | N02 | S1 | Blocked | Phải kiểm chứng văn bản gốc |
| MB-04 | FR-05 | Gợi ý ở lại hay đi nghỉ | Should | Có | L1 · M2 | Ra quyết định nhanh | Tính và giải thích thời gian nghỉ thực tế; có hai nhánh lựa chọn | N04,N09 | S1 | Chờ duyệt | Giả thuyết cần sơ cấp |
| MB-05 | FR-06,07,08 | Tìm/lọc nơi nghỉ nhận khách ngay | Must | Có | L1 · M3 | Tìm chỗ phù hợp đang hoạt động | Lọc còn phòng/giờ lễ tân; sắp theo phút đi; chip lọc đúng | N03–N07 | S1 | Chờ duyệt | Mock D3 ≥30 cơ sở |
| MB-06 | FR-10 | Chi tiết nơi nghỉ | Must | Có | L1 · M4 | Hiểu giá và điều kiện | Giá tổng nhất quán; huỷ; lễ tân; tiện ích; cách đi; nhãn mô phỏng | N05,N06 | S1 | Chờ duyệt | — |
| MB-07 | FR-11,12,18 | Đặt chỗ mô phỏng không tài khoản | Must | Có | L1 · M5 | Hoàn tất nhanh | ≤3 bước; không SĐT/email; ≥2 cách trả mô phỏng; sinh mã | N03,N12 | S1 | Chờ duyệt | Không giao dịch thật |
| MB-08 | FR-13 | Nhắc giờ quay lại | Should | Có | L1/L2 · M6 | Không lỡ chuyến | Tính đúng giờ rời; fallback lịch; tính lại khi giờ bay đổi | N08 | S2 | Chờ duyệt | — |
| MB-09 | FR-15 | Tiện ích tại nhà ga | Should | Có điều kiện | Nhánh ở lại · M7 | Có phương án khi không đi khách sạn | Hiện vị trí, giờ mở, giá và ngày cập nhật | N09 | S3 | Chờ duyệt | Chỉ giữ nếu còn capacity |
| MB-10 | FR-16 | Hỗ trợ 24/7 | Could | Không/giản lược | M8 | Biết nơi liên hệ | Chỉ hiển thị FAQ/liên hệ có nguồn; không giả hotline thật | N10 | S3 | Chờ duyệt | Có thể loại khỏi MVP |
| MB-11 | FR-21 | Gửi đề nghị hãng hỗ trợ | Must | Có | L2 · M9 | Yêu cầu hỗ trợ rõ ràng | Tạo mã và trạng thái chờ; nhãn mô phỏng; có tự chi trả | N13 | S2 | Chờ duyệt | — |
| MB-12 | FR-22 | Hãng duyệt/từ chối | Must | Có | L2 · M9 | Biết kết quả và lý do | Hai nhánh đúng; từ chối có lý do; cho chuyển tự chi trả | N02,N13 | S2 | Chờ duyệt | Phản hồi mô phỏng |
| MB-13 | FR-23 | Cơ sở xác nhận/từ chối | Must | Có | L2 · M9 | Biết đã có phòng hay chưa | Xác nhận có mã; từ chối có tối đa 3 đề xuất thay thế | N03,N13 | S2 | Chờ duyệt | Phản hồi mô phỏng |
| MB-14 | FR-24 | Chuyển tự chi trả/đổi giờ | Must | Có | L2→L1 · M9→M3 | Không bị mắc kẹt trong luồng | Giữ mã/trạng thái; chuyển đúng M3; xử lý giờ bay mới | N08,N13 | S2 | Chờ duyệt | Cần state machine |
| MB-15 | FR-09,14,17 | Bản đồ, gọi xe, lưu chứng từ | Could | Không | Sau MVP | Giá trị bổ sung | Không triển khai trong thời gian hiện tại | N04,N11 | Sau MVP | Đã loại | Giảm phạm vi |
| MB-16 | FR-19,20 | Tài khoản/điểm/voucher B2B | Won't | Không | Ngoài phạm vi | Không cốt lõi | Không triển khai | B03 | Không làm | Đã loại | Cần tích hợp/đối tác |
| MB-17 | NFR-01,02,07 | Responsive và khả dụng | Must | Có | Toàn hệ thống | Dễ dùng khi căng thẳng | Mobile-first; tác vụ cốt lõi đạt mục tiêu test; nội dung rõ | RQ3 | S1–S3 | Chờ duyệt | — |
| MB-18 | NFR-03 | Hiệu năng prototype | Must | Có | Toàn hệ thống | Không phải chờ lâu | Màn hình chính phản hồi ≤3 giây với mock data | B03 | S1–S3 | Chờ duyệt | Đo trong môi trường test |
| MB-19 | NFR-04,05 | Riêng tư và mô phỏng | Must | Có | Toàn hệ thống | Không bị hiểu nhầm/gây rủi ro dữ liệu | Không thu dữ liệu ngoài phạm vi; mọi giao dịch/role mô phỏng có nhãn | B03 | S1–S4 | Chờ duyệt | Bắt buộc |
| MB-20 | NFR-06,08 | Minh bạch nguồn và cấu hình | Must | Có | M1/M9 | Hiểu độ mới và căn cứ | Hiện cập nhật lúc; nội dung pháp lý có nguồn/ngày hiệu lực; không hard-code sai | B03 | S1–S4 | Blocked | Kiểm chứng pháp lý |
