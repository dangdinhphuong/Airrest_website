# 06. Truy vết yêu cầu

Phiên bản v0.1 Draft · 2026-10-26 · Trạng thái **DRAFT, chưa được phê duyệt**. Tài liệu bổ sung độc lập, không thay thế SRS hiện hành.

## 1. Yêu cầu chức năng

| ID | Tên | Module | Actor | Nguồn | Trạng thái | Ưu tiên | Phase | Phụ thuộc | AC | OQ/Quyết định | Liên quan SRS hiện hành |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HM-FR-001 | Tạo hồ sơ đối tác (bản nháp) | HM-C01 | ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | — | HM-FR-001.AC1…AC4 | OQ-51/D-38, OQ-55/D-42 | FR-025, UIR-012 |
| HM-FR-002 | Cập nhật hồ sơ đối tác | HM-C01 | ACT-12; ACT-13 (trường vận hành) | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-001 | HM-FR-002.AC1…AC3 | OQ-51/D-38 | — |
| HM-FR-003 | Gửi duyệt, theo dõi kết quả và bổ sung thông tin | HM-C01 | ACT-12; ACT-07/08 (người duyệt, xem SA-FR-012) | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-001, SA-FR-012 | HM-FR-003.AC1…AC3 | OQ-47/D-34, OQ-51/D-38 | SM-01 |
| HM-FR-004 | Hồ sơ pháp lý và tài liệu xác minh | HM-C01 | ACT-12; ACT-07/08 | Chỉ đạo PO 26/10/2026 | Blocked | Should | Hotel Operations | HM-FR-001 | HM-FR-004.AC1…AC3 | OQ-51/D-38 | — |
| HM-FR-005 | Lịch sử thay đổi hồ sơ | HM-C01 | ACT-12; ACT-07/08/11 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | HM-FR-002, SA-FR-025 | HM-FR-005.AC1…AC3 | — | — |
| HM-FR-006 | Quản lý loại phòng | HM-C02 | ACT-12; ACT-13 (xem) | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-001 | HM-FR-006.AC1…AC3 | — | FR-026 |
| HM-FR-007 | Số lượng phòng vật lý theo loại | HM-C02 | ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-006 | HM-FR-007.AC1…AC3 | — | — |
| HM-FR-008 | Trạng thái kinh doanh của loại phòng | HM-C02 | ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-006 | HM-FR-008.AC1…AC3 | — | — |
| HM-FR-009 | Giá theo loại phòng, ngày và số khách | HM-C03 | ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-006 | HM-FR-009.AC1…AC3 | OQ-60/D-47, OQ-62/D-49 | FR-026, BR-005 |
| HM-FR-010 | Gói giá, mùa và ngày đặc biệt | HM-C03 | ACT-12 | Chỉ đạo PO 26/10/2026 | Deferred | Could | Hotel Operations | HM-FR-009 | HM-FR-010.AC1…AC3 | OQ-61/D-48, OQ-62/D-49 | — |
| HM-FR-011 | Thuế, phí và phụ thu | HM-C03 | ACT-12; ACT-07 (danh mục) | Chỉ đạo PO 26/10/2026 | Blocked | Must | Hotel Operations | HM-FR-009 | HM-FR-011.AC1…AC3 | OQ-62/D-49, OQ-43/D-30, OQ-60/D-47 | BR-005, D-06 |
| HM-FR-012 | Điều kiện nhận/trả phòng, trẻ em, giường phụ và số khách tối đa | HM-C03 | ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Should | Hotel Operations | HM-FR-006 | HM-FR-012.AC1…AC3 | — | FR-011 |
| HM-FR-013 | Chính sách hủy, hoàn tiền và thay đổi đặt phòng | HM-C03 | ACT-12; ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Must | Hotel Operations | HM-FR-009 | HM-FR-013.AC1…AC3 | OQ-46/D-33, OQ-43/D-30 | FR-011 (chính sách huỷ) |
| HM-FR-014 | Hiệu lực và lịch sử giá | HM-C03 | ACT-12; ACT-10; ACT-11 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-009 | HM-FR-014.AC1…AC3 | — | — |
| HM-FR-015 | Mô hình tồn phòng theo ngày | HM-C04 | ACT-12; ACT-13; hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-007 | HM-FR-015.AC1…AC3 | — | BR-003; FR-026 |
| HM-FR-016 | Cập nhật tồn phòng và đóng/mở bán | HM-C04 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-015 | HM-FR-016.AC1…AC3 | — | FR-026 |
| HM-FR-017 | Ngày không nhận khách và thời gian bảo trì | HM-C04 | ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Should | Hotel Operations | HM-FR-015 | HM-FR-017.AC1…AC3 | — | — |
| HM-FR-018 | Giữ chỗ tạm thời | HM-C04 | Hệ thống; ACT-01 | Chỉ đạo PO 26/10/2026 | Blocked | Must | Hotel Operations | HM-FR-015 | HM-FR-018.AC1…AC3 | OQ-45/D-32 | D-04, FR-019 |
| HM-FR-019 | Chống đặt vượt và xử lý đồng thời | HM-C04 | Hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-015, HM-FR-018 | HM-FR-019.AC1…AC3 | — | AC-026 |
| HM-FR-020 | Đồng bộ tồn phòng với hệ thống ngoài (PMS/channel manager) | HM-C04 | ACT-15; ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Could | Advanced | HM-FR-015, SA-FR-036 | HM-FR-020.AC1…AC3 | OQ-44/D-31 | — |
| HM-FR-021 | Danh sách và tìm kiếm đặt phòng | HM-C05 | ACT-12; ACT-13; ACT-08/09 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | SA-FR-009 | HM-FR-021.AC1…AC3 | — | FR-027 |
| HM-FR-022 | Chi tiết đặt phòng | HM-C05 | ACT-12; ACT-13; ACT-09 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-021 | HM-FR-022.AC1…AC3 | OQ-50/D-37 | BR-002 |
| HM-FR-023 | Xác nhận yêu cầu đặt phòng | HM-C05 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-018, HM-FR-021 | HM-FR-023.AC1…AC3 | OQ-59/D-46 | FR-021, MB-13 |
| HM-FR-024 | Từ chối yêu cầu đặt phòng | HM-C05 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-018 | HM-FR-024.AC1…AC3 | — | FR-021, BR-009 |
| HM-FR-025 | Hết hạn yêu cầu chờ xác nhận | HM-C05 | Hệ thống | Chỉ đạo PO 26/10/2026 | Blocked | Must | Hotel Operations | HM-FR-018 | HM-FR-025.AC1…AC3 | OQ-45/D-32 | D-04, CR-07 |
| HM-FR-026 | Hết phòng hoặc thay đổi điều kiện sau khi khách gửi yêu cầu | HM-C05 | ACT-12; hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Should | Hotel Operations | HM-FR-023, HM-FR-024 | HM-FR-026.AC1…AC3 | — | — |
| HM-FR-027 | Hủy, đổi lịch và khách không đến | HM-C05 | ACT-01; ACT-12; ACT-09 | Chỉ đạo PO 26/10/2026 | Blocked | Should | Hotel Operations | HM-FR-013, HM-FR-023 | HM-FR-027.AC1…AC3 | OQ-46/D-33, OQ-43/D-30 | OQ-29 |
| HM-FR-028 | Lịch sử trạng thái đặt phòng | HM-C05 | ACT-12; ACT-13; ACT-08/09/11 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-025 | HM-FR-028.AC1…AC3 | — | SM-03 |
| HM-FR-029 | Danh sách khách dự kiến đến và rời đi | HM-C06 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Proposed | Should | Hotel Operations | HM-FR-023 | HM-FR-029.AC1…AC3 | OQ-54/D-41, OQ-60/D-47 | — |
| HM-FR-030 | Xác nhận nhận phòng và trả phòng | HM-C06 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Deferred | Could | Hotel Operations | HM-FR-023 | HM-FR-030.AC1…AC3 | OQ-54/D-41 | — |
| HM-FR-031 | Khách đến muộn, không đến hoặc cần hỗ trợ | HM-C06 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Blocked | Could | Hotel Operations | HM-FR-030 | HM-FR-031.AC1…AC3 | OQ-46/D-33, OQ-54/D-41 | — |
| HM-FR-032 | Trạng thái phòng vận hành (dọn, bảo trì, sẵn sàng) | HM-C06 | ACT-13 | Chỉ đạo PO 26/10/2026 | Deferred | Won't | Advanced | — | HM-FR-032.AC1…AC2 | OQ-54/D-41 | — |
| HM-FR-033 | Ghi chú vận hành và bàn giao ca | HM-C06 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Deferred | Could | Hotel Operations | — | HM-FR-033.AC1…AC3 | OQ-54/D-41 | — |
| HM-FR-034 | Xử lý sự cố trong thời gian lưu trú | HM-C06 | ACT-12; ACT-13; ACT-09 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | SA-FR-033 | HM-FR-034.AC1…AC3 | — | — |
| HM-FR-035 | Đón khách bằng xe của khách sạn (lái xe) | HM-C06 | ACT-14; ACT-12; ACT-01 | Chỉ đạo PO 26/10/2026 | Blocked | Could | Advanced | HM-FR-023 | HM-FR-035.AC1…AC3 | OQ-50/D-37 | FR-028, FR-029, D-26, MB-15 |
| HM-FR-036 | Ghi nhận mô hình thu tiền của đặt phòng | HM-C07 | ACT-12; ACT-10; ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Won't | Advanced | — | HM-FR-036.AC1…AC3 | OQ-43/D-30 | — |
| HM-FR-037 | Đối soát đặt phòng, lưu trú và giao dịch | HM-C07 | ACT-10 | Chỉ đạo PO 26/10/2026 | Blocked | Won't | Advanced | HM-FR-036 | HM-FR-037.AC1…AC3 | OQ-43/D-30 | — |
| HM-FR-038 | Lịch sử thanh toán, hoàn tiền và công nợ | HM-C07 | ACT-10; ACT-12 | Chỉ đạo PO 26/10/2026 | Blocked | Won't | Advanced | HM-FR-036 | HM-FR-038.AC1…AC3 | OQ-43/D-30 | — |
| HM-FR-039 | Ghi nhận sự cố chất lượng đối tác | HM-C08 | ACT-08; ACT-09; hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | — | HM-FR-039.AC1…AC3 | OQ-56/D-43 | — |
| HM-FR-040 | Chỉ số chất lượng khách quan | HM-C08 | ACT-08; ACT-12 | Chỉ đạo PO 26/10/2026 | Blocked | Could | System Operations | HM-FR-039 | HM-FR-040.AC1…AC3 | OQ-56/D-43 | — |
| HM-FR-041 | Phản hồi và khiếu nại của khách sạn | HM-C08 | ACT-12; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | HM-FR-039 | HM-FR-041.AC1…AC3 | OQ-56/D-43, OQ-57/D-44 | — |
| HM-FR-042 | Thông báo yêu cầu mới và kết quả | HM-C09 | ACT-12; ACT-13; ACT-01 | Chỉ đạo PO 26/10/2026 | Blocked | Must | Hotel Operations | SH-C04 | HM-FR-042.AC1…AC3 | OQ-52/D-39 | OQ-09 |
| HM-FR-043 | Nhắc yêu cầu sắp hết hạn | HM-C09 | ACT-12; ACT-13 | Chỉ đạo PO 26/10/2026 | Blocked | Could | Hotel Operations | HM-FR-025, HM-FR-042 | HM-FR-043.AC1…AC3 | OQ-45/D-32, OQ-52/D-39 | — |
| HM-FR-044 | Lịch sử thông báo, lỗi gửi, retry và chống gửi trùng | HM-C09 | ACT-12; ACT-08; hệ thống | Chỉ đạo PO 26/10/2026 | Blocked | Must | Hotel Operations | HM-FR-042 | HM-FR-044.AC1…AC3 | OQ-52/D-39 | — |
| HM-FR-045 | Báo cáo yêu cầu và đặt phòng | HM-C10 | ACT-12; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | — | HM-FR-045.AC1…AC3 | OQ-60/D-47 | — |
| HM-FR-046 | Báo cáo tồn phòng và tỷ lệ sử dụng | HM-C10 | ACT-12; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Could | System Operations | HM-FR-015 | HM-FR-046.AC1…AC3 | — | — |
| HM-FR-047 | Báo cáo hiệu suất phản hồi | HM-C10 | ACT-12; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Could | System Operations | HM-FR-028 | HM-FR-047.AC1…AC3 | — | — |
| HM-FR-048 | Báo cáo tài chính | HM-C10 | ACT-10; ACT-12 | Chỉ đạo PO 26/10/2026 | Blocked | Won't | Advanced | HM-FR-036 | HM-FR-048.AC1…AC3 | OQ-43/D-30 | — |
| HM-FR-049 | Bộ lọc và xuất dữ liệu báo cáo | HM-C10 | ACT-12; ACT-08; ACT-10 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | SA-FR-028 | HM-FR-049.AC1…AC3 | OQ-50/D-37 | — |
| SA-FR-001 | Tạo và mời tài khoản | SA-C01 | ACT-07; ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | — | SA-FR-001.AC1…AC4 | OQ-48/D-35, OQ-55/D-42, OQ-59/D-46 | FR-031, MB-16 |
| SA-FR-002 | Xem, cập nhật và vô hiệu hóa tài khoản | SA-C01 | ACT-07; ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-001 | SA-FR-002.AC1…AC3 | — | FR-031 |
| SA-FR-003 | Khóa và mở khóa tài khoản | SA-C01 | ACT-07; ACT-12; hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-002 | SA-FR-003.AC1…AC3 | OQ-48/D-35 | FR-031 |
| SA-FR-004 | Đặt lại mật khẩu và khôi phục truy cập | SA-C01 | Người dùng; ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Must | Foundation | — | SA-FR-004.AC1…AC3 | OQ-48/D-35 | — |
| SA-FR-005 | Quản lý phiên đăng nhập | SA-C01 | Người dùng; ACT-07; ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Should | Foundation | — | SA-FR-005.AC1…AC3 | OQ-48/D-35 | — |
| SA-FR-006 | Danh mục vai trò và quyền | SA-C02 | ACT-07 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | — | SA-FR-006.AC1…AC3 | OQ-55/D-42, OQ-47/D-34 | — |
| SA-FR-007 | Gán, đổi và thu hồi vai trò | SA-C02 | ACT-07; ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-006 | SA-FR-007.AC1…AC3 | OQ-55/D-42 | — |
| SA-FR-008 | Kiểm tra quyền deny-by-default ở backend/API | SA-C02 | Hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-006 | SA-FR-008.AC1…AC3 | OQ-59/D-46 | SH-NFR-001 |
| SA-FR-009 | Cách ly dữ liệu theo tenant | SA-C02 | Hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | — | SA-FR-009.AC1…AC3 | OQ-55/D-42 | SH-NFR-002 |
| SA-FR-010 | Quyền xem trường nhạy cảm và masking | SA-C02 | ACT-07; ACT-09; ACT-12 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-029 | SA-FR-010.AC1…AC3 | OQ-50/D-37 | — |
| SA-FR-011 | Danh sách và tìm kiếm đối tác | SA-C03 | ACT-07; ACT-08; ACT-11 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | — | SA-FR-011.AC1…AC3 | — | — |
| SA-FR-012 | Duyệt, từ chối và yêu cầu bổ sung hồ sơ đối tác | SA-C03 | ACT-07; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | HM-FR-003 | SA-FR-012.AC1…AC3 | OQ-47/D-34, OQ-51/D-38 | SM-01 |
| SA-FR-013 | Tạm ngưng, khôi phục và ngừng hợp tác đối tác | SA-C03 | ACT-07; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Hotel Operations | SA-FR-012 | SA-FR-013.AC1…AC3 | OQ-56/D-43 | FR-030 |
| SA-FR-014 | Phân tách người lập và người duyệt (maker-checker) | SA-C03 | ACT-07; ACT-08 | Chỉ đạo PO 26/10/2026 | Blocked | Should | Foundation | — | SA-FR-014.AC1…AC3 | OQ-47/D-34 | — |
| SA-FR-015 | Quản lý danh mục | SA-C04 | ACT-07; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Must | System Operations | SA-FR-020 | SA-FR-015.AC1…AC3 | — | — |
| SA-FR-016 | Tham số nghiệp vụ (thời hạn giữ chỗ, timeout) | SA-C04 | ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Must | System Operations | SA-FR-020 | SA-FR-016.AC1…AC3 | OQ-45/D-32, OQ-47/D-34 | FR-032, D-04 |
| SA-FR-017 | Nội dung FAQ và hướng dẫn | SA-C04 | ACT-07; ACT-08 | Chỉ đạo PO 26/10/2026 | Blocked | Should | System Operations | SA-FR-020 | SA-FR-017.AC1…AC3 | OQ-47/D-34 | BR-007, BR-013, FR-032 |
| SA-FR-018 | Cấu hình thông báo | SA-C04 | ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Should | System Operations | SA-FR-020 | SA-FR-018.AC1…AC3 | OQ-52/D-39 | — |
| SA-FR-019 | Bật/tắt tính năng (feature flag) | SA-C04 | ACT-07 | Chỉ đạo PO 26/10/2026 | Proposed | Could | System Operations | SA-FR-020 | SA-FR-019.AC1…AC3 | — | — |
| SA-FR-020 | Kiểm soát thay đổi cấu hình: phê duyệt, phiên bản, rollback | SA-C04 | ACT-07; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | — | SA-FR-020.AC1…AC3 | OQ-47/D-34 | NFR-009, FR-032 |
| SA-FR-021 | Dashboard tình trạng vận hành | SA-C05 | ACT-07; ACT-08 | Chỉ đạo PO 26/10/2026 | Blocked | Should | System Operations | — | SA-FR-021.AC1…AC3 | OQ-58/D-45 | — |
| SA-FR-022 | Theo dõi yêu cầu đặt phòng lỗi hoặc chờ quá lâu | SA-C05 | ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | HM-FR-018 | SA-FR-022.AC1…AC3 | OQ-45/D-32 | — |
| SA-FR-023 | Tra cứu theo correlation/request ID | SA-C05 | ACT-08; ACT-09 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | — | SA-FR-023.AC1…AC3 | OQ-58/D-45 | — |
| SA-FR-024 | Phân loại và xử lý sự cố hệ thống | SA-C05 | ACT-08; ACT-07 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | — | SA-FR-024.AC1…AC3 | — | — |
| SA-FR-025 | Ghi audit log cho sự kiện quan trọng | SA-C06 | Hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | — | SA-FR-025.AC1…AC3 | OQ-49/D-36 | SH-NFR-007 |
| SA-FR-026 | Truy vấn và xem audit log | SA-C06 | ACT-11; ACT-07 | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-025 | SA-FR-026.AC1…AC3 | OQ-49/D-36 | — |
| SA-FR-027 | Bảo vệ audit log: bất biến, quyền và lưu giữ | SA-C06 | Hệ thống; ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Must | Foundation | SA-FR-025 | SA-FR-027.AC1…AC3 | OQ-49/D-36 | — |
| SA-FR-028 | Ghi nhận truy cập và xuất dữ liệu nhạy cảm | SA-C06 | Hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-025 | SA-FR-028.AC1…AC3 | OQ-50/D-37 | — |
| SA-FR-029 | Phân loại dữ liệu | SA-C07 | ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Must | Foundation | — | SA-FR-029.AC1…AC3 | OQ-50/D-37 | — |
| SA-FR-030 | Che dữ liệu (masking) trên giao diện và log | SA-C07 | Hệ thống | Chỉ đạo PO 26/10/2026 | Proposed | Must | Foundation | SA-FR-029 | SA-FR-030.AC1…AC3 | — | SH-NFR-006 |
| SA-FR-031 | Yêu cầu sửa, xuất, xóa dữ liệu cá nhân | SA-C07 | ACT-09; ACT-07; ACT-01 | Chỉ đạo PO 26/10/2026 | Blocked | Should | Advanced | — | SA-FR-031.AC1…AC3 | OQ-50/D-37 | — |
| SA-FR-032 | Quản lý căn cứ xử lý dữ liệu và sự đồng ý | SA-C07 | ACT-07; ACT-01 | Chỉ đạo PO 26/10/2026 | Blocked | Could | Advanced | — | SA-FR-032.AC1…AC3 | OQ-50/D-37 | — |
| SA-FR-033 | Tiếp nhận và phân loại yêu cầu hỗ trợ/khiếu nại | SA-C08 | ACT-09; ACT-12; ACT-01 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | — | SA-FR-033.AC1…AC3 | OQ-57/D-44 | — |
| SA-FR-034 | Gán, chuyển cấp, xử lý và đóng ca | SA-C08 | ACT-09; ACT-08 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | SA-FR-033 | SA-FR-034.AC1…AC3 | OQ-57/D-44 | — |
| SA-FR-035 | Liên kết ca với đặt phòng/khách sạn và hạn chế can thiệp giao dịch | SA-C08 | ACT-09 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | SA-FR-033, SA-FR-008 | SA-FR-035.AC1…AC3 | OQ-57/D-44 | — |
| SA-FR-036 | Trạng thái kết nối và lịch sử request/response | SA-C09 | ACT-07; ACT-15 | Chỉ đạo PO 26/10/2026 | Blocked | Could | Advanced | — | SA-FR-036.AC1…AC3 | OQ-44/D-31, OQ-52/D-39 | — |
| SA-FR-037 | Hàng đợi tác vụ nền, retry và chạy lại có kiểm soát | SA-C09 | ACT-08; ACT-07 | Chỉ đạo PO 26/10/2026 | Proposed | Could | System Operations | — | SA-FR-037.AC1…AC3 | OQ-58/D-45 | — |
| SA-FR-038 | Quản lý credentials và khóa API | SA-C09 | ACT-07 | Chỉ đạo PO 26/10/2026 | Blocked | Could | Advanced | — | SA-FR-038.AC1…AC3 | OQ-58/D-45 | — |
| SA-FR-039 | Báo cáo tài khoản và hoạt động người dùng | SA-C10 | ACT-07; ACT-11 | Chỉ đạo PO 26/10/2026 | Proposed | Could | System Operations | — | SA-FR-039.AC1…AC3 | — | — |
| SA-FR-040 | Báo cáo đối tác, đặt phòng, sự cố và khiếu nại | SA-C10 | ACT-07; ACT-08; ACT-11 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | — | SA-FR-040.AC1…AC3 | OQ-60/D-47 | — |
| SA-FR-041 | Xuất báo cáo theo quyền | SA-C10 | ACT-07; ACT-08; ACT-10 | Chỉ đạo PO 26/10/2026 | Proposed | Should | System Operations | SA-FR-028 | SA-FR-041.AC1…AC3 | OQ-50/D-37 | — |

## 2. Quy tắc, phi chức năng và dữ liệu

| Nhóm | Phạm vi ID | Số lượng | Trạng thái |
|---|---|---|---|
| Quy tắc HM-BR | HM-BR-001…034 | 34 | Proposed |
| Quy tắc SA-BR | SA-BR-001…023 | 23 | Proposed |
| Phi chức năng SH-NFR | SH-NFR-001…037 | 37 | Proposed |
| Thực thể HM-DATA | HM-DATA-001…018 | 18 | Proposed |
| Thực thể SA-DATA | SA-DATA-001…017 | 17 | Proposed |
| Máy trạng thái | SM-01…07 | 7 | Proposed |

## 3. Ánh xạ các mục đã có trong SRS v0.6

| Mục trong SRS v0.6 | Mục tương ứng trong gói này | Quan hệ đề xuất |
|---|---|---|
| ACT-05 Khách sạn (gồm lái xe) | ACT-12, ACT-13, ACT-14 | Tinh chỉnh |
| ACT-06 Quản trị | ACT-07, ACT-08 (+ ACT-09…11) | Tinh chỉnh |
| FR-024 Đăng nhập và phân quyền | SA-FR-001…009, SH-NFR-001…005 | Mở rộng |
| FR-025 Khách sạn quản lý hồ sơ | HM-FR-001…005, HM-FR-012 | Mở rộng |
| FR-026 Khách sạn quản lý phòng, tồn, giá | HM-FR-006…011, HM-FR-014…017 | Mở rộng |
| FR-027 Khách sạn xử lý đặt chỗ | HM-FR-021…026, HM-FR-028 | Mở rộng |
| FR-028 Lái xe đón khách | HM-FR-035 (Blocked D-26) | Giữ điều kiện |
| FR-029 Người dùng cuối theo dõi xe đón | HM-FR-035 | Giữ điều kiện |
| FR-030 Quản trị cơ sở | SA-FR-011…013 | Mở rộng |
| FR-031 Quản trị tài khoản | SA-FR-001…003, SA-FR-007 | Mở rộng |
| FR-032 Quản trị nội dung và tham số | SA-FR-015…020 | Mở rộng |
| FR-033 Quản trị giám sát | SA-FR-022…024, SA-FR-033…035 | Mở rộng |
| FR-034 Nhật ký và thống kê | SA-FR-025…028, SA-FR-039…041 | Mở rộng |
| BR-015, BR-016, BR-017 | SA-BR-006, SA-BR-007, SA-BR-017; HM-BR-020 | Tinh chỉnh |
| NFR-010 | SH-NFR-001…009 | Mở rộng |
| DR-010 TaiKhoan, DR-011 YeuCauDon, DR-012 NhatKyThaoTac | SA-DATA-001/004/005, HM-DATA-018, SA-DATA-009 | Tinh chỉnh |
| UIR-012 M10, UIR-013 M11, UIR-014 M12 | Chưa thiết kế lại; UI/UX sau khi PO duyệt | Hoãn |
| D-25 Đăng nhập | OQ-48 → D-35 (mở rộng) | Mở rộng |
| D-26 Lái xe vs MB-15 | Giữ nguyên; HM-FR-035 phụ thuộc | Giữ |
| D-27 Vai trò của hãng | Giữ nguyên; OQ-59 → D-46 hỏi quan hệ | Giữ |
| D-28 Phạm vi, ưu tiên | OQ-61 → D-48 (phân kỳ) | Mở rộng |
| D-29 Lưu trữ dữ liệu | OQ-59, OQ-44, OQ-58 | Mở rộng |
| OQ-38…OQ-42 | OQ-48, OQ-50, OQ-55, OQ-61, OQ-58 | Tinh chỉnh |

Việc thay thế hay giữ song song do PO quyết định (OQ-59). Gói này không sửa các mục v0.6.

## 4. Ma trận Yêu cầu × Actor

| Actor | Số yêu cầu liên quan |
|---|---|
| ACT-01 | 7 |
| ACT-07 | 40 |
| ACT-08 | 27 |
| ACT-09 | 10 |
| ACT-10 | 8 |
| ACT-11 | 9 |
| ACT-12 | 52 |
| ACT-13 | 23 |
| ACT-14 | 1 |
| ACT-15 | 2 |
