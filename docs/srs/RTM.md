# Requirement Traceability Matrix — Airrest website

Phiên bản v0.6 Draft · 2026-10-26 · Nguồn: `docs/MVP.md` → `SRS.md`. TC chỉ là mã tham chiếu dự kiến. “KT” là kịch bản gốc trong B04 mục 8 (tham chiếu).

Trạng thái: **In Scope**, **Conditional**, **Out of Scope**, **TBD**, **Proposed**.

## 1. Phủ MVP

| MVP ID | MVP Feature | Phân loại | Yêu cầu SRS | Ghi chú |
|---|---|---|---|---|
| MB-01 | Tra cứu/nhập chuyến bay | In Scope | FR-001, FR-002, IFR-001, DR-001, UIR-001, UIR-002 | — |
| MB-02 | Thẻ trạng thái và đổi giờ | In Scope | FR-003, FR-004, BR-012, DR-001, UIR-002 | — |
| MB-03 | Quyền lợi hành khách | Conditional | FR-005, BR-006, BR-007, DR-002, UIR-002 | Blocked |
| MB-04 | Gợi ý ở lại hay đi nghỉ | In Scope | FR-006, FR-007, UIR-003 | — |
| MB-05 | Tìm/lọc nơi nghỉ nhận khách ngay | In Scope | FR-008, FR-009, FR-010, IFR-001, BR-003, BR-004, DR-003, DR-004, UIR-004 | — |
| MB-06 | Chi tiết nơi nghỉ | In Scope | FR-011, BR-005, DR-003, DR-004, UIR-005 | — |
| MB-07 | Đặt chỗ mô phỏng không tài khoản | In Scope | FR-012, FR-013, BR-001, BR-002, DR-004, DR-005, UIR-006 | — |
| MB-08 | Nhắc giờ quay lại | In Scope | FR-014, FR-015, FR-016, BR-011, DR-006, UIR-007 | — |
| MB-09 | Tiện ích tại nhà ga | Conditional | FR-017, DR-008, UIR-008 | — |
| MB-10 | Hỗ trợ 24/7 | Conditional | FR-018, BR-013, DR-009, UIR-009 | MVP: “Không/giản lược” |
| MB-11 | Gửi đề nghị hãng hỗ trợ | In Scope | FR-019, BR-001, BR-010, DR-007, UIR-010 | — |
| MB-12 | Hãng duyệt/từ chối | In Scope | FR-020, IFR-002, BR-001, BR-008, BR-010, DR-007, UIR-010 | — |
| MB-13 | Cơ sở xác nhận/từ chối | In Scope | FR-021, IFR-002, BR-001, BR-009, DR-003, DR-007, UIR-010 | — |
| MB-14 | Chuyển tự chi trả/đổi giờ | In Scope | FR-022, FR-023, BR-010, BR-014, DR-007, UIR-010 | — |
| MB-15 | Bản đồ, gọi xe, lưu chứng từ | Out of Scope | OOS-01 | Đã loại — không có yêu cầu |
| MB-16 | Tài khoản/điểm/voucher B2B | Out of Scope | OOS-02 | Đã loại — không có yêu cầu |
| MB-17 | Responsive và khả dụng | In Scope | NFR-001, NFR-002, NFR-003, UIR-011 | — |
| MB-18 | Hiệu năng prototype | In Scope | NFR-004 | — |
| MB-19 | Riêng tư và mô phỏng | In Scope | NFR-005, NFR-006, BR-001 | — |
| MB-20 | Minh bạch nguồn và cấu hình | In Scope | NFR-007, NFR-008, NFR-009, BR-007, BR-012, DR-002, UIR-002 | Blocked |


### 1.1 Yêu cầu ngoài MVP (chỉ đạo của chủ sản phẩm 26/10/2026 — Proposed, chưa có AC)

| Yêu cầu | Tên | Actor | Dữ liệu, giao diện, use case | Quyết định / OQ | Trạng thái |
|---|---|---|---|---|---|
| FR-024 | Đăng nhập và phân quyền theo tác nhân | ACT-05; ACT-06 | DR-010, UIR-014, UC-014…UC-019 | D-25, D-28; OQ-38 | Proposed (ngoài MVP) |
| FR-025 | Khách sạn quản lý hồ sơ cơ sở và tình trạng nhận khách | ACT-05 | DR-003, UIR-012, UC-014 | D-28, D-29; OQ-38, OQ-41 | Proposed (ngoài MVP) |
| FR-026 | Khách sạn quản lý phòng, tồn phòng và giá | ACT-05 | DR-004, UIR-012, UC-014 | D-28, D-29; OQ-41 | Proposed (ngoài MVP) |
| FR-027 | Khách sạn xử lý đặt chỗ | ACT-05; ACT-01 | DR-005, UIR-012, UC-015 | D-27, D-28; OQ-40 | Proposed (ngoài MVP) |
| FR-028 | Lái xe thực hiện đón khách tại sân bay | ACT-05 | DR-011, UIR-012, UC-016 | D-26, D-28; OQ-39 | Proposed (ngoài MVP) |
| FR-029 | Người dùng cuối yêu cầu và theo dõi xe đón | ACT-01; ACT-05 | DR-011, UIR-012, UC-016 | D-26; OQ-39 | Proposed (ngoài MVP) |
| FR-030 | Quản trị quản lý cơ sở lưu trú | ACT-06 | DR-003, UIR-013, UC-017 | D-28; OQ-41 | Proposed (ngoài MVP) |
| FR-031 | Quản trị quản lý tài khoản khách sạn và lái xe | ACT-06 | DR-010, UIR-013, UC-017 | D-25, D-28; OQ-38 | Proposed (ngoài MVP) |
| FR-032 | Quản trị quản lý nội dung và tham số cấu hình | ACT-06 | UIR-013, UC-018 | D-13, D-28; OQ-41 | Proposed (ngoài MVP) |
| FR-033 | Quản trị giám sát và xử lý yêu cầu hỗ trợ và đặt chỗ | ACT-06; ACT-02 | DR-005, DR-007, UIR-013, UC-019 | D-27, D-28; OQ-40 | Proposed (ngoài MVP) |
| FR-034 | Quản trị xem nhật ký thao tác và thống kê tổng hợp | ACT-06 | DR-012, UIR-013, UC-019 | D-28, D-29; OQ-41, OQ-42 | Proposed (ngoài MVP) |
| BR-015, BR-016, BR-017 | Phân quyền; dữ liệu mô phỏng có nhãn; nhật ký thao tác | ACT-05, ACT-06 | — | D-25, D-29; OQ-38, OQ-42 | Proposed (ngoài MVP) |
| NFR-010 | Xác thực, phân quyền và nhật ký | ACT-05, ACT-06 | — | D-25; OQ-38 | Proposed (ngoài MVP) |

Không có hạng mục MB, AC hoặc TC tương ứng. Hai tác nhân ACT-05 và ACT-06 không có trong `docs/MVP.md`.

## 2. Ma trận truy vết

| MVP ID | MVP Feature | SRS Requirement ID | Requirement Type | Priority | Acceptance Criteria ID | Test Reference | Status |
|---|---|---|---|---|---|---|---|
| MB-01 | Tra cứu/nhập chuyến bay | FR-001 | FR | Must · S1 | AC-001, AC-002 | TC-001, TC-002 | In Scope |
| MB-01 | Tra cứu/nhập chuyến bay | FR-002 | FR | Must · S1 | AC-003, AC-004 | TC-003, TC-004 | In Scope |
| MB-02 | Thẻ trạng thái và đổi giờ | FR-003 | FR | Must · S1/S2 | AC-005 | TC-005 | In Scope |
| MB-02 | Thẻ trạng thái và đổi giờ | FR-004 | FR | Must · S1/S2 | AC-006, AC-007 | TC-006, TC-007 | In Scope |
| MB-03 | Quyền lợi hành khách | FR-005 | FR | Must · S1 | AC-008, AC-009, AC-010 | TC-008, TC-009 | Conditional (Blocked) |
| MB-04 | Gợi ý ở lại hay đi nghỉ | FR-006 | FR | Should · S1 | AC-011, AC-012 | TC-011 | In Scope |
| MB-04 | Gợi ý ở lại hay đi nghỉ | FR-007 | FR | Should · S1 | AC-013 | TC-013 | In Scope |
| MB-05 | Tìm/lọc nơi nghỉ nhận khách ngay | FR-008 | FR | Must · S1 | AC-014, AC-015, AC-016 | TC-014, TC-015, TC-016 | In Scope |
| MB-05 | Tìm/lọc nơi nghỉ nhận khách ngay | FR-009 | FR | Must · S1 | AC-017, AC-018 | TC-017, TC-018 | In Scope |
| MB-05 | Tìm/lọc nơi nghỉ nhận khách ngay | FR-010 | FR | Must · S1 | AC-019 | TC-019 | In Scope |
| MB-06 | Chi tiết nơi nghỉ | FR-011 | FR | Must · S1 | AC-020, AC-021, AC-022 | TC-020, TC-021, TC-022 | In Scope |
| MB-07 | Đặt chỗ mô phỏng không tài khoản | FR-012 | FR | Must · S1 | AC-023, AC-024, AC-025, AC-026 | TC-023, TC-024, TC-025, TC-026 | In Scope |
| MB-07 | Đặt chỗ mô phỏng không tài khoản | FR-013 | FR | Must · S1 | AC-027, AC-028 | TC-027, TC-028 | In Scope |
| MB-08 | Nhắc giờ quay lại | FR-014 | FR | Should · S2 | AC-029, AC-030 | TC-029 | In Scope |
| MB-08 | Nhắc giờ quay lại | FR-015 | FR | Should · S2 | AC-031 | TC-031 | In Scope |
| MB-08 | Nhắc giờ quay lại | FR-016 | FR | Should · S2 | AC-032 | TC-032 | In Scope |
| MB-09 | Tiện ích tại nhà ga | FR-017 | FR | Should · S3 | AC-033 | TC-033 | Conditional |
| MB-10 | Hỗ trợ 24/7 | FR-018 | FR | Could · S3 | AC-034, AC-035 | TC-034, TC-035 | Conditional |
| MB-11 | Gửi đề nghị hãng hỗ trợ | FR-019 | FR | Must · S2 | AC-036, AC-037 | TC-036, TC-037 | In Scope |
| MB-12 | Hãng duyệt/từ chối | FR-020 | FR | Must · S2 | AC-038, AC-039, AC-040 | TC-038, TC-039, TC-040 | In Scope |
| MB-13 | Cơ sở xác nhận/từ chối | FR-021 | FR | Must · S2 | AC-041, AC-042, AC-043 | TC-041, TC-042, TC-043 | In Scope |
| MB-14 | Chuyển tự chi trả/đổi giờ | FR-022 | FR | Must · S2 | AC-044, AC-045, AC-046 | TC-044, TC-045, TC-046 | In Scope |
| MB-14 | Chuyển tự chi trả/đổi giờ | FR-023 | FR | Must · S2 | AC-047 | TC-047 | In Scope |
| MB-17 | Responsive và khả dụng | NFR-001 | NFR | Must · S1–S3 | AC-048, AC-049 | TC-048, TC-049 | In Scope |
| MB-17 | Responsive và khả dụng | NFR-002 | NFR | Must · S1–S3 | AC-050, AC-051 | TC-051 | In Scope |
| MB-17 | Responsive và khả dụng | NFR-003 | NFR | Must · S1–S3 | AC-052, AC-053 | TC-053 | In Scope |
| MB-18 | Hiệu năng prototype | NFR-004 | NFR | Must · S1–S3 | AC-054, AC-055 | TC-054, TC-055 | In Scope |
| MB-19 | Riêng tư và mô phỏng | NFR-005 | NFR | Must · S1–S4 | AC-056, AC-057 | TC-056, TC-057 | In Scope |
| MB-19 | Riêng tư và mô phỏng | NFR-006 | NFR | Must · S1–S4 | AC-058 | TC-058 | In Scope |
| MB-20 | Minh bạch nguồn và cấu hình | NFR-007 | NFR | Must · S1–S4 | AC-059, AC-060 | TC-059, TC-060 | In Scope |
| MB-20 | Minh bạch nguồn và cấu hình | NFR-008 | NFR | Must · S1–S4 | AC-061 | TC-061 | In Scope (Blocked) |
| MB-20 | Minh bạch nguồn và cấu hình | NFR-009 | NFR | Must · S1–S4 | AC-062 | TC-062 | In Scope (Blocked) |
| MB-07, MB-11, MB-12, MB-13, MB-19 | Đặt chỗ mô phỏng không tài khoản; Gửi đề nghị hãng hỗ trợ; Hãng duyệt/từ chối; Cơ sở xác nhận/từ chối; Riêng tư và mô phỏng | BR-001 | BR | MB-07 Must·S1; MB-11 Must·S2; MB-12 Must·S2; MB-13 Must·S2; MB-19 Must·S1–S4 | AC-025, AC-036, AC-058 | TC-025, TC-036, TC-058 | In Scope |
| MB-07 | Đặt chỗ mô phỏng không tài khoản | BR-002 | BR | Must · S1 | AC-024 | TC-024 | In Scope |
| MB-05 | Tìm/lọc nơi nghỉ nhận khách ngay | BR-003 | BR | Must · S1 | AC-014 | TC-014 | In Scope |
| MB-05 | Tìm/lọc nơi nghỉ nhận khách ngay | BR-004 | BR | Must · S1 | AC-017 | TC-017 | In Scope |
| MB-06 | Chi tiết nơi nghỉ | BR-005 | BR | Must · S1 | AC-020 | TC-020 | In Scope |
| MB-03 | Quyền lợi hành khách | BR-006 | BR | Must · S1 | AC-009 | TC-009 | Conditional |
| MB-03, MB-20 | Quyền lợi hành khách; Minh bạch nguồn và cấu hình | BR-007 | BR | MB-03 Must·S1; MB-20 Must·S1–S4 | AC-008, AC-061 | TC-008, TC-061 | In Scope (Blocked) |
| MB-12 | Hãng duyệt/từ chối | BR-008 | BR | Must · S2 | AC-039 | TC-039 | In Scope |
| MB-13 | Cơ sở xác nhận/từ chối | BR-009 | BR | Must · S2 | AC-042 | TC-042 | In Scope |
| MB-11, MB-12, MB-14 | Gửi đề nghị hãng hỗ trợ; Hãng duyệt/từ chối; Chuyển tự chi trả/đổi giờ | BR-010 | BR | MB-11 Must·S2; MB-12 Must·S2; MB-14 Must·S2 | AC-037, AC-040, AC-044 | TC-037, TC-040, TC-044 | In Scope |
| MB-08 | Nhắc giờ quay lại | BR-011 | BR | Should · S2 | AC-032 | TC-032 | In Scope |
| MB-02, MB-20 | Thẻ trạng thái và đổi giờ; Minh bạch nguồn và cấu hình | BR-012 | BR | MB-02 Must·S1/S2; MB-20 Must·S1–S4 | AC-005, AC-059 | TC-005, TC-059 | In Scope |
| MB-10 | Hỗ trợ 24/7 | BR-013 | BR | Could · S3 | AC-034, AC-035 | TC-034, TC-035 | Conditional |
| MB-14 | Chuyển tự chi trả/đổi giờ | BR-014 | BR | Must · S2 | — | — | TBD |
| MB-01, MB-02 | Tra cứu/nhập chuyến bay; Thẻ trạng thái và đổi giờ | DR-001 | DR | MB-01 Must·S1; MB-02 Must·S1/S2 | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-032, AC-047 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-011, TC-032, TC-047 | In Scope |
| MB-03, MB-20 | Quyền lợi hành khách; Minh bạch nguồn và cấu hình | DR-002 | DR | MB-03 Must·S1; MB-20 Must·S1–S4 | AC-008, AC-009, AC-010 | TC-008, TC-009 | Conditional (Blocked) |
| MB-05, MB-06, MB-13 | Tìm/lọc nơi nghỉ nhận khách ngay; Chi tiết nơi nghỉ; Cơ sở xác nhận/từ chối | DR-003 | DR | MB-05 Must·S1; MB-06 Must·S1; MB-13 Must·S2 | AC-011, AC-012, AC-014, AC-015, AC-016, AC-017, AC-018, AC-020, AC-021, AC-022 | TC-011, TC-014, TC-015, TC-016, TC-017, TC-018, TC-020, TC-021, TC-022 | In Scope |
| MB-05, MB-06, MB-07 | Tìm/lọc nơi nghỉ nhận khách ngay; Chi tiết nơi nghỉ; Đặt chỗ mô phỏng không tài khoản | DR-004 | DR | MB-05 Must·S1; MB-06 Must·S1; MB-07 Must·S1 | AC-014, AC-015, AC-016, AC-020, AC-021, AC-022 | TC-014, TC-015, TC-016, TC-020, TC-021, TC-022 | In Scope |
| MB-07 | Đặt chỗ mô phỏng không tài khoản | DR-005 | DR | Must · S1 | AC-023, AC-024, AC-025, AC-026, AC-027, AC-028 | TC-023, TC-024, TC-025, TC-026, TC-027, TC-028 | In Scope |
| MB-08 | Nhắc giờ quay lại | DR-006 | DR | Should · S2 | AC-029, AC-030, AC-031, AC-032 | TC-029, TC-031, TC-032 | In Scope |
| MB-11, MB-12, MB-13, MB-14 | Gửi đề nghị hãng hỗ trợ; Hãng duyệt/từ chối; Cơ sở xác nhận/từ chối; Chuyển tự chi trả/đổi giờ | DR-007 | DR | MB-11 Must·S2; MB-12 Must·S2; MB-13 Must·S2; MB-14 Must·S2 | AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042, AC-043, AC-044, AC-045, AC-046, AC-047 | TC-036, TC-037, TC-038, TC-039, TC-040, TC-041, TC-042, TC-043, TC-044, TC-045, TC-046, TC-047 | In Scope |
| MB-09 | Tiện ích tại nhà ga | DR-008 | DR | Should · S3 | AC-033 | TC-033 | Conditional |
| MB-10 | Hỗ trợ 24/7 | DR-009 | DR | Could · S3 | AC-034, AC-035 | TC-034, TC-035 | Conditional |
| MB-01 | Tra cứu/nhập chuyến bay | UIR-001 | UIR | Must · S1 | AC-001, AC-002, AC-003, AC-004 | TC-001, TC-002, TC-003, TC-004 | In Scope |
| MB-01, MB-02, MB-03, MB-20 | Tra cứu/nhập chuyến bay; Thẻ trạng thái và đổi giờ; Quyền lợi hành khách; Minh bạch nguồn và cấu hình | UIR-002 | UIR | MB-01 Must·S1; MB-02 Must·S1/S2; MB-03 Must·S1; MB-20 Must·S1–S4 | AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-059, AC-060, AC-061 | TC-005, TC-006, TC-007, TC-008, TC-009, TC-059, TC-060, TC-061 | In Scope |
| MB-04 | Gợi ý ở lại hay đi nghỉ | UIR-003 | UIR | Should · S1 | AC-011, AC-012, AC-013 | TC-011, TC-013 | In Scope |
| MB-05 | Tìm/lọc nơi nghỉ nhận khách ngay | UIR-004 | UIR | Must · S1 | AC-014, AC-015, AC-016, AC-017, AC-018, AC-019 | TC-014, TC-015, TC-016, TC-017, TC-018, TC-019 | In Scope |
| MB-06 | Chi tiết nơi nghỉ | UIR-005 | UIR | Must · S1 | AC-020, AC-021, AC-022 | TC-020, TC-021, TC-022 | In Scope |
| MB-07 | Đặt chỗ mô phỏng không tài khoản | UIR-006 | UIR | Must · S1 | AC-023, AC-024, AC-025, AC-026, AC-027, AC-028 | TC-023, TC-024, TC-025, TC-026, TC-027, TC-028 | In Scope |
| MB-08 | Nhắc giờ quay lại | UIR-007 | UIR | Should · S2 | AC-029, AC-030, AC-031, AC-032 | TC-029, TC-031, TC-032 | In Scope |
| MB-09 | Tiện ích tại nhà ga | UIR-008 | UIR | Should · S3 | AC-033 | TC-033 | Conditional |
| MB-10 | Hỗ trợ 24/7 | UIR-009 | UIR | Could · S3 | AC-034, AC-035 | TC-034, TC-035 | Conditional |
| MB-11, MB-12, MB-13, MB-14 | Gửi đề nghị hãng hỗ trợ; Hãng duyệt/từ chối; Cơ sở xác nhận/từ chối; Chuyển tự chi trả/đổi giờ | UIR-010 | UIR | MB-11 Must·S2; MB-12 Must·S2; MB-13 Must·S2; MB-14 Must·S2 | AC-036, AC-037, AC-038, AC-039, AC-040, AC-041, AC-042, AC-043, AC-044, AC-045, AC-046, AC-047 | TC-036, TC-037, TC-038, TC-039, TC-040, TC-041, TC-042, TC-043, TC-044, TC-045, TC-046, TC-047 | In Scope |
| MB-17 | Responsive và khả dụng | UIR-011 | UIR | Must · S1–S3 | AC-048, AC-049, AC-050, AC-051, AC-054, AC-055 | TC-048, TC-049, TC-051, TC-054, TC-055 | Proposed |
| MB-01, MB-05 | Tra cứu/nhập chuyến bay; Tìm/lọc nơi nghỉ nhận khách ngay | IFR-001 | IFR | MB-01 Must·S1; MB-05 Must·S1 | AC-063 | TC-063 | In Scope |
| MB-12, MB-13 | Hãng duyệt/từ chối; Cơ sở xác nhận/từ chối | IFR-002 | IFR | MB-12 Must·S2; MB-13 Must·S2 | AC-064 | TC-064 | In Scope |
| MB-15 | Bản đồ, gọi xe, lưu chứng từ | OOS-01 | Out of Scope (không phải yêu cầu) | Could · Sau MVP | — | — | Out of Scope |
| MB-16 | Tài khoản/điểm/voucher B2B | OOS-02 | Out of Scope (không phải yêu cầu) | Won't · Không làm | — | — | Out of Scope |

Ghi chú: dòng DR/UIR lấy AC của các yêu cầu chức năng sử dụng chúng; dòng BR lấy AC dùng để kiểm chứng quy tắc; BR-014 và FR có AC “TBD” không có TC.

## 3. Từ AC đến TC và kịch bản B04

| AC | Yêu cầu | MVP | Căn cứ | Phương pháp | TC | KT tham chiếu (B04) | Trạng thái AC |
|---|---|---|---|---|---|---|---|
| AC-001 | FR-001 | MB-01 | MVP | Test | TC-001 | KT-01, KT-20 | In Scope |
| AC-002 | FR-001 | MB-01 | B04 | Test | TC-002 | KT-01, KT-20 | Proposed |
| AC-003 | FR-002 | MB-01 | MVP | Test | TC-003 | KT-12 | In Scope |
| AC-004 | FR-002 | MB-01 | B03/B04 | Test | TC-004 | KT-12 | Proposed |
| AC-005 | FR-003 | MB-02 | MVP + B03 | Test | TC-005 | KT-01 | In Scope (một phần Proposed) |
| AC-006 | FR-004 | MB-02 | MVP + B03 | Test | TC-006 | KT-10, KT-11 | In Scope (một phần Proposed) |
| AC-007 | FR-004 | MB-02 | B03 | Test | TC-007 | KT-10, KT-11 | Proposed |
| AC-008 | FR-005 | MB-03 | MVP | Inspection | TC-008 | KT-01, KT-03, KT-05 | In Scope |
| AC-009 | FR-005 | MB-03 | MVP | Test | TC-009 | KT-01, KT-03, KT-05 | In Scope |
| AC-010 | FR-005 | MB-03 | TBD | — | — (chưa đủ thông tin) | KT-01, KT-03, KT-05 | TBD |
| AC-011 | FR-006 | MB-04 | MVP | Test | TC-011 | KT-02, KT-03, KT-12 | In Scope |
| AC-012 | FR-006 | MB-04 | TBD | — | — (chưa đủ thông tin) | KT-02, KT-03, KT-12 | TBD |
| AC-013 | FR-007 | MB-04 | MVP | Test | TC-013 | KT-02, KT-03 | In Scope |
| AC-014 | FR-008 | MB-05 | MVP | Test | TC-014 | KT-03, KT-15, KT-16 | In Scope |
| AC-015 | FR-008 | MB-05 | B03/B04 | Test | TC-015 | KT-03, KT-15, KT-16 | Proposed |
| AC-016 | FR-008 | MB-05 | B04 | Test | TC-016 | KT-03, KT-15, KT-16 | Proposed |
| AC-017 | FR-009 | MB-05 | MVP | Test | TC-017 | KT-13 | In Scope |
| AC-018 | FR-009 | MB-05 | B03 | Test | TC-018 | KT-13 | Proposed |
| AC-019 | FR-010 | MB-05 | MVP | Test | TC-019 | KT-13 | In Scope |
| AC-020 | FR-011 | MB-06 | MVP | Test | TC-020 | KT-15 | In Scope |
| AC-021 | FR-011 | MB-06 | MVP | Inspection | TC-021 | KT-15 | In Scope |
| AC-022 | FR-011 | MB-06 | B04 | Test | TC-022 | KT-15 | Proposed |
| AC-023 | FR-012 | MB-07 | MVP | Test | TC-023 | KT-14, KT-19 | In Scope |
| AC-024 | FR-012 | MB-07 | MVP | Inspection | TC-024 | KT-14, KT-19 | In Scope |
| AC-025 | FR-012 | MB-07 | MVP | Test | TC-025 | KT-14, KT-19 | In Scope |
| AC-026 | FR-012 | MB-07 | B04 | Test | TC-026 | KT-14, KT-19 | Proposed |
| AC-027 | FR-013 | MB-07 | MVP | Test | TC-027 | KT-14 | In Scope |
| AC-028 | FR-013 | MB-07 | B03/B04 | Test | TC-028 | KT-14 | Proposed |
| AC-029 | FR-014 | MB-08 | MVP | Test | TC-029 | KT-07, KT-10 | In Scope |
| AC-030 | FR-014 | MB-08 | TBD | — | — (chưa đủ thông tin) | KT-07, KT-10 | TBD |
| AC-031 | FR-015 | MB-08 | MVP | Test | TC-031 | — | In Scope |
| AC-032 | FR-016 | MB-08 | MVP | Test | TC-032 | KT-10, KT-11 | In Scope |
| AC-033 | FR-017 | MB-09 | MVP | Inspection | TC-033 | KT-17 | In Scope |
| AC-034 | FR-018 | MB-10 | MVP | Inspection | TC-034 | — | In Scope |
| AC-035 | FR-018 | MB-10 | MVP | Inspection | TC-035 | — | In Scope |
| AC-036 | FR-019 | MB-11 | MVP | Test | TC-036 | KT-04 | In Scope |
| AC-037 | FR-019 | MB-11 | MVP | Test | TC-037 | KT-04 | In Scope |
| AC-038 | FR-020 | MB-12 | MVP | Test | TC-038 | KT-06, KT-07 | In Scope |
| AC-039 | FR-020 | MB-12 | MVP | Test | TC-039 | KT-06, KT-07 | In Scope |
| AC-040 | FR-020 | MB-12 | MVP | Test | TC-040 | KT-06, KT-07 | In Scope |
| AC-041 | FR-021 | MB-13 | MVP | Test | TC-041 | KT-07, KT-08 | In Scope |
| AC-042 | FR-021 | MB-13 | MVP | Test | TC-042 | KT-07, KT-08 | In Scope |
| AC-043 | FR-021 | MB-13 | B03/B04 | Test | TC-043 | KT-07, KT-08 | Proposed |
| AC-044 | FR-022 | MB-14 | MVP | Test | TC-044 | KT-09 | In Scope |
| AC-045 | FR-022 | MB-14 | MVP | Test | TC-045 | KT-09 | In Scope |
| AC-046 | FR-022 | MB-14 | B04 | Test | TC-046 | KT-09 | Proposed |
| AC-047 | FR-023 | MB-14 | B03 | Test | TC-047 | KT-10 | Proposed |
| AC-048 | NFR-001 | MB-17 | MVP | Inspection | TC-048 | — | In Scope |
| AC-049 | NFR-001 | MB-17 | B03 | Test | TC-049 | — | Proposed |
| AC-050 | NFR-002 | MB-17 | MVP | Test | — (chưa đủ thông tin) | KT-14, KT-19, KT-20 | In Scope |
| AC-051 | NFR-002 | MB-17 | B03 | Inspection | TC-051 | KT-14, KT-19, KT-20 | Proposed |
| AC-052 | NFR-003 | MB-17 | MVP | Test | — (chưa đủ thông tin) | — | In Scope |
| AC-053 | NFR-003 | MB-17 | B03 | Test | TC-053 | — | Proposed |
| AC-054 | NFR-004 | MB-18 | MVP | Test | TC-054 | — | In Scope |
| AC-055 | NFR-004 | MB-18 | B03 | Test | TC-055 | — | Proposed |
| AC-056 | NFR-005 | MB-19 | MVP | Inspection | TC-056 | — | In Scope |
| AC-057 | NFR-005 | MB-19 | B04 | Inspection | TC-057 | — | Proposed |
| AC-058 | NFR-006 | MB-19 | MVP | Inspection | TC-058 | — | In Scope |
| AC-059 | NFR-007 | MB-20 | MVP | Inspection | TC-059 | — | In Scope |
| AC-060 | NFR-007 | MB-20 | B03 | Inspection | TC-060 | — | Proposed |
| AC-061 | NFR-008 | MB-20 | MVP | Inspection | TC-061 | — | In Scope |
| AC-062 | NFR-009 | MB-20 | B03 | Test | TC-062 | — | Proposed |
| AC-063 | IFR-001 | MB-01, MB-05 | MVP | Inspection | TC-063 | — | In Scope |
| AC-064 | IFR-002 | MB-12, MB-13 | MVP | Inspection | TC-064 | — | In Scope |

## 4. Use case → MVP → yêu cầu

| UC | Mã B04 | MVP | Yêu cầu | AC | Trạng thái |
|---|---|---|---|---|---|
| UC-001 — Tra cứu chuyến bay và theo dõi thẻ trạng thái | UC01 | MB-01, MB-02 | FR-001, FR-002, FR-003, UIR-001, UIR-002 | AC-001, AC-002, AC-003, AC-005 | In Scope |
| UC-002 — Xem quyền lợi của hành khách | UC02 | MB-03 | FR-005, BR-006, BR-007, DR-002 | AC-008, AC-009 | Conditional |
| UC-003 — Nhận gợi ý ở lại hay đi nghỉ | UC03 | MB-04 | FR-006, FR-007, UIR-003 | AC-011, AC-013 | In Scope |
| UC-004 — Tìm và xem nơi nghỉ nhận khách ngay | UC04, UC05 | MB-05, MB-06 | FR-008, FR-009, FR-010, FR-011, UIR-004, UIR-005 | AC-014, AC-017, AC-019, AC-020, AC-021 | In Scope |
| UC-005 — Đặt chỗ mô phỏng | UC06 | MB-07 | FR-012, FR-013, BR-001, BR-002, DR-005, UIR-006 | AC-023, AC-024, AC-025, AC-027 | In Scope |
| UC-006 — Nhắc giờ quay lại sân bay | UC07 | MB-08 | FR-014, FR-015, DR-006, UIR-007 | AC-029, AC-031 | In Scope |
| UC-007 — Xem tiện ích tại nhà ga | UC08 | MB-09 | FR-017, DR-008, UIR-008 | AC-033 | Conditional |
| UC-008 — Xem hỗ trợ (FAQ/liên hệ có nguồn) | UC10 | MB-10 | FR-018, BR-013, DR-009, UIR-009 | AC-034, AC-035 | Conditional |
| UC-009 — Gửi đề nghị hãng hỗ trợ chỗ nghỉ | UC11 | MB-11 | FR-019, DR-007, UIR-010 | AC-036, AC-037 | In Scope |
| UC-010 — Hãng duyệt hoặc từ chối | UC12 | MB-12 | FR-020, BR-008, IFR-002 | AC-038, AC-039, AC-040 | In Scope |
| UC-011 — Cơ sở xác nhận hoặc từ chối phòng | UC13 | MB-13 | FR-021, BR-009, IFR-002 | AC-041, AC-042 | In Scope |
| UC-012 — Chuyển sang tự chi trả | UC14 | MB-14 | FR-022, BR-010, BR-014 | AC-044, AC-045 | In Scope |
| UC-013 — Cập nhật khi giờ bay đổi | UC15 | MB-02, MB-08, MB-14 | FR-004, FR-016, FR-023 | AC-006, AC-032, AC-047 | In Scope |

## 5. Mục TBD (không phải yêu cầu, không có MVP nguồn tương ứng)

| ID | Nhóm | Lý do chưa đặc tả | OQ | Trạng thái |
|---|---|---|---|---|
| TBD-NFR-01 | Bảo mật | MVP không nêu yêu cầu bảo mật (xác thực, mã hoá, kiểm soát truy cập). Chỉ có ràng buộc không đăng nhập (MB-07); NFR-010 (Proposed) bao phủ một phần cho khách sạn và quản trị. | OQ-30 | TBD |
| TBD-NFR-02 | Khả năng tương thích trình duyệt | MVP không nêu trình duyệt/phiên bản hỗ trợ. | OQ-30 | TBD |
| TBD-NFR-03 | Khả năng bảo trì | MVP không nêu; B03 chỉ có yêu cầu cấu hình không hard-code (NFR-009). | OQ-30 | TBD |
| TBD-NFR-04 | Khả năng kiểm thử | MVP nêu AC quan sát được; không nêu yêu cầu về môi trường/công cụ kiểm thử ngoài “môi trường test” (MB-18). | OQ-30 | TBD |
| TBD-NFR-05 | Quan sát và ghi nhận lỗi | MVP không nêu log, giám sát hay báo lỗi. | OQ-30 | TBD |
| TBD-NFR-06 | Tính toàn vẹn dữ liệu | MVP không nêu; B04 chỉ nêu ràng buộc hợp lệ trường dữ liệu (mục 6). | OQ-30 | TBD |
| TBD-NFR-07 | Ngôn ngữ / song ngữ | B03 NFR-04 (tiếng Việt mặc định, có tiếng Anh) nằm trong cột FR/NFR của MB-19 nhưng không khớp nội dung MB-19. | OQ-01 | TBD |
| TBD-NFR-08 | SLA, tải đồng thời, tuân thủ pháp lý về dữ liệu cá nhân | MVP không nêu. B03/B04 trích Luật 91/2025/QH15 và NĐ 356/2025/NĐ-CP nhưng chưa kiểm chứng (00_DOC_TRUOC.txt). | OQ-18 | TBD |

## 6. Truy vết nguồn: MVP, tài liệu nội bộ, nghiên cứu bên ngoài

Loại thông tin: CONFIRMED (có AC từ MVP), INFERRED (chi tiết B03/B04/prototype), EXTERNALLY_RESEARCHED (nghiên cứu ngoài, xem `RESEARCH_AND_GAP_ANALYSIS.md`), TBD. Không có AC cuối cho nội dung chưa được phê duyệt.

| Yêu cầu | MVP | Nguồn nội bộ | Gap | Research | Loại thông tin |
|---|---|---|---|---|---|
| FR-001 | MB-01 | MVP + B03/B04; mã gốc FR-01 | G-01, G-15 | R-02, R-19 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| FR-002 | MB-01 | MVP + B03/B04; mã gốc FR-02 | G-01 | R-02, R-19 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| FR-003 | MB-02 | MVP + B03; mã gốc FR-03 | G-01, G-11, G-15 | R-01, R-02, R-19 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| FR-004 | MB-02 | MVP + B03; mã gốc FR-03 | G-11 | R-01, R-19 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| FR-005 | MB-03 | MVP + B03/B04 (Blocked); mã gốc FR-04 | G-02, G-17, G-19, G-21 | R-01, R-02, R-03, R-04, R-08, R-09, R-19, R-20, R-21 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-006 | MB-04 | MVP + B03/B04; mã gốc FR-05 | G-10 | R-01, R-07 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-007 | MB-04 | MVP + B03/B04; mã gốc FR-05 | — | — | CONFIRMED, INFERRED |
| FR-008 | MB-05 | MVP + B03/B04; mã gốc FR-06 | G-04, G-05, G-15 | R-08, R-09, R-11, R-18 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-009 | MB-05 | MVP + B03; mã gốc FR-07 | — | — | CONFIRMED, INFERRED |
| FR-010 | MB-05 | MVP + B03; mã gốc FR-08 | — | — | CONFIRMED, INFERRED |
| FR-011 | MB-06 | MVP + B03/B04; mã gốc FR-10 | G-05, G-07 | R-18 | CONFIRMED, INFERRED, TBD |
| FR-012 | MB-07 | MVP + B03/B04; mã gốc FR-11; FR-18 | G-04, G-05, G-07, G-14, G-15 | R-08, R-09, R-11, R-18, R-23, R-24 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-013 | MB-07 | MVP + B03/B04; mã gốc FR-12 | G-04 | R-08, R-09, R-11 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| FR-014 | MB-08 | MVP + B03/B04; mã gốc FR-13 | G-10, G-12 | R-01, R-07, R-13, R-14, R-25, R-26, R-27 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-015 | MB-08 | MVP + B04; mã gốc FR-13 | G-12 | R-13, R-14, R-25, R-26, R-27 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| FR-016 | MB-08 | MVP + B04; mã gốc FR-13 | G-09, G-10 | R-01, R-07 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-017 | MB-09 | MVP + B03/B04; mã gốc FR-15 | G-18 | R-16, R-28 | CONFIRMED, INFERRED, TBD |
| FR-018 | MB-10 | MVP; mã gốc FR-16 | G-20 | R-21, R-22 | CONFIRMED, EXTERNALLY_RESEARCHED |
| FR-019 | MB-11 | MVP + B03/B04; mã gốc FR-21 | G-02, G-03, G-06, G-13, G-19 | R-01, R-08, R-09, R-19, R-20, R-21 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-020 | MB-12 | MVP + B03/B04; mã gốc FR-22 | G-06, G-13, G-19 | R-01, R-08, R-19, R-20, R-21 | CONFIRMED, INFERRED, TBD |
| FR-021 | MB-13 | MVP + B03/B04; mã gốc FR-23 | G-06, G-08, G-13, G-19 | R-01, R-08, R-09, R-11, R-19, R-20, R-21 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-022 | MB-14 | MVP + B03/B04; mã gốc FR-24 | G-04, G-08, G-09 | R-01, R-08, R-09, R-11 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED, TBD |
| FR-023 | MB-14 | MVP (mơ hồ) + B03/B04; mã gốc FR-24 | G-09, G-10 | R-01, R-07 | INFERRED, EXTERNALLY_RESEARCHED, TBD |
| NFR-001 | MB-17 | MVP + B03; mã gốc NFR-01 | — | — | CONFIRMED, INFERRED |
| NFR-002 | MB-17 | MVP + B03; mã gốc NFR-07 | — | — | CONFIRMED, INFERRED |
| NFR-003 | MB-17 | MVP + B03; mã gốc NFR-02 | G-16 | R-15 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| NFR-004 | MB-18 | MVP + B03; mã gốc NFR-03 | — | — | CONFIRMED, INFERRED |
| NFR-005 | MB-19 | MVP + B03/B04; mã gốc NFR-05 | G-03, G-14 | R-19, R-23, R-24 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| NFR-006 | MB-19 | MVP; mã gốc NFR-04 (nghi ngờ — OQ-01) | — | — | CONFIRMED |
| NFR-007 | MB-20 | MVP + B03; mã gốc NFR-06 | G-11 | R-01, R-19 | CONFIRMED, INFERRED, EXTERNALLY_RESEARCHED |
| NFR-008 | MB-20 | MVP (Blocked); mã gốc NFR-06 | G-17 | R-01, R-02, R-03, R-04, R-19 | CONFIRMED, EXTERNALLY_RESEARCHED |
| NFR-009 | MB-20 | MVP (mơ hồ) + B03; mã gốc NFR-08 | G-17 | R-01, R-02, R-03, R-04, R-19 | INFERRED, EXTERNALLY_RESEARCHED |
| IFR-001 | MB-01, MB-05 | MVP; mã gốc — | — | — | CONFIRMED |
| IFR-002 | MB-12, MB-13 | MVP; mã gốc — | G-13 | — | CONFIRMED, TBD |
| DR-001 | MB-01, MB-02 | MVP + B04 (B04 mục 6) | — | — | INFERRED |
| DR-002 | MB-03, MB-20 | B04 (Blocked) (B04 mục 6) | G-17, G-21 | R-01, R-02, R-03, R-04, R-19, R-21 | INFERRED, EXTERNALLY_RESEARCHED, TBD |
| DR-003 | MB-05, MB-06, MB-13 | MVP + B04 (B04 mục 6) | — | — | INFERRED |
| DR-004 | MB-05, MB-06, MB-07 | MVP + B04 (B04 mục 6) | G-07 | — | INFERRED |
| DR-005 | MB-07 | MVP + B04 (B04 mục 6) | G-09 | R-01 | INFERRED |
| DR-006 | MB-08 | MVP + B04 (B04 mục 6) | — | — | INFERRED |
| DR-007 | MB-11, MB-12, MB-13, MB-14 | MVP + B04 (B04 mục 6) | — | — | INFERRED |
| DR-008 | MB-09 | MVP (B04 mục 6) | G-18 | R-16, R-28 | INFERRED |
| DR-009 | MB-10 | MVP (B04 mục 6) | — | — | INFERRED |

### 6.1 Ứng viên yêu cầu (Proposed) → nguồn và truy vết

Không có AC/TC: chưa được phê duyệt. Mỗi ứng viên truy ngược về MVP, gap và nguồn nghiên cứu.

| Ứng viên | MVP | Yêu cầu liên quan | Quyết định | Gap | Research | Trạng thái |
|---|---|---|---|---|---|---|
| CR-01 | MB-03, MB-11 | FR-005, FR-019 | D-01 | G-02, G-19 | R-08, R-09, R-19, R-20, R-21 | Proposed (chờ gỡ Blocked MB-03) |
| CR-02 | MB-11, MB-19 | FR-019, NFR-005 | D-05 | G-03 | R-19 | Proposed |
| CR-03 | MB-04, MB-08 | FR-006, FR-014, FR-016, NFR-009 | D-02 | G-10 | R-01, R-07 | Proposed (tham số mô phỏng) |
| CR-04 | MB-02, MB-20 | FR-003, FR-004, NFR-007 | D-08 | G-11 | R-01, R-19 | Proposed (tham số mô phỏng) |
| CR-05 | MB-08 | FR-014, FR-015 | D-03 | G-12 | R-13, R-14, R-25, R-26, R-27 | Proposed |
| CR-06 | MB-06 | FR-011, DR-004 | D-06 | G-07 | — | Proposed (tham số mô phỏng) |
| CR-07 | MB-11, MB-12, MB-13 | FR-019, FR-020, FR-021 | D-04 | G-06 | R-01, R-08, R-19 | Proposed (tham số mô phỏng) |
| CR-08 | MB-10 | FR-018, BR-013 | D-12 | G-20 | R-21, R-22 | Proposed (Conditional theo MB-10) |
| CR-09 | MB-03 | FR-005, DR-002 | D-11 | G-21 | R-19, R-21 | Deferred (chờ gỡ Blocked MB-03) |
| CR-10 | MB-09 | FR-017, DR-008 | D-09 | G-18 | R-16, R-28 | Blocked (thiếu dữ liệu) |
| CR-11 | MB-03 | FR-005, BR-006 | D-10 | G-21, G-02 | R-08, R-09, R-19, R-20, R-21 | Proposed (khác chữ MVP, cần phê duyệt) |
| CR-12 | MB-01, MB-02 | FR-001, FR-002, FR-003 | — | G-01 | R-02, R-19 | Proposed |

### 6.2 Gap → nguồn và mức xác minh

| Gap | Yêu cầu | Research | Loại thông tin | Mức xác minh |
|---|---|---|---|---|
| G-01 | FR-001, FR-002, FR-003 | R-19, R-02 | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19) |
| G-02 | FR-005, FR-019 | R-19, R-20, R-08, R-09 | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19); Luật 130 chỉ thứ cấp (R-20) |
| G-03 | FR-019, NFR-005 | R-19 | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19 Điều 36 k8) |
| G-04 | FR-008, FR-012, FR-013, FR-022 | R-08, R-09, R-11 | EXTERNALLY_RESEARCHED | Quy định nước ngoài (regulator) và báo chí; không có quy định Việt Nam về cách sắp xếp lưu trú |
| G-05 | FR-008, FR-011, FR-012 | R-18 | TBD | Không có nguồn |
| G-06 | FR-019, FR-020, FR-021 | R-01, R-19, R-08 | INFERRED | Đã đọc Điều 36–40 NĐ 208 và Điều 3–8 TT 48: không có thời hạn phản hồi cho đề nghị lưu trú (chưa đọc toàn bộ văn bản) |
| G-07 | FR-011, FR-012, DR-004 | — | INFERRED | Không có nguồn ngoài |
| G-08 | FR-021, FR-022 | R-08, R-09, R-11 | EXTERNALLY_RESEARCHED | Quy định nước ngoài (regulator) |
| G-09 | FR-016, FR-022, FR-023, DR-005 | R-01 | TBD | Đã xác minh một phần (R-01, R-19) |
| G-10 | FR-006, FR-014, FR-016, FR-023 | R-01, R-07 | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-01 Điều 8.1) |
| G-11 | FR-003, FR-004, NFR-007 | R-19, R-01 | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19 Điều 36 k3b) |
| G-12 | FR-014, FR-015 | R-13, R-14, R-25, R-26, R-27 | EXTERNALLY_RESEARCHED | Tài liệu chuẩn kỹ thuật (MDN, WebKit); chưa thử nghiệm |
| G-13 | FR-019, FR-020, FR-021, IFR-002 | — | TBD | Không có nguồn ngoài |
| G-14 | NFR-005, FR-012 | R-23, R-24 | EXTERNALLY_RESEARCHED | Luật 91/2025 đã xác minh (R-23); NĐ 356 xác minh một phần (R-24) |
| G-15 | FR-001, FR-003, FR-008, FR-012, UIR-011 | — | INFERRED | Không có nguồn ngoài |
| G-16 | NFR-003 | R-15 | EXTERNALLY_RESEARCHED | Kết quả tìm kiếm (W3C không mở được) |
| G-17 | FR-005, DR-002, NFR-008, NFR-009 | R-01, R-19, R-02, R-03, R-04 | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-01, R-19) |
| G-18 | FR-017, DR-008 | R-16, R-28 | TBD | Trang chính thức của cảng (R-28): vị trí đã xác minh, giá/giờ chưa |
| G-19 | FR-005, FR-019, FR-020, FR-021 | R-19, R-20, R-21 | INFERRED | Đã xác minh bản chính thức (R-19) và trang hãng (R-21, R-22) |
| G-20 | FR-018, BR-013 | R-21, R-22 | EXTERNALLY_RESEARCHED | Trang chính thức của hãng (R-21, R-22) |
| G-21 | FR-005, DR-002 | R-19, R-21 | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19 Điều 40) |

## 7. Kiểm tra truy vết (sinh tự động khi tạo tài liệu)

- Tính năng MVP được đối chiếu: **20/20**; chưa phủ: **0**.
- Yêu cầu có nguồn MVP: FR 23/23, NFR 9/9, BR 14/14, DR 9/9, UIR 11/11, IFR 2/2. Yêu cầu mồ côi: **0**.
- AC: 64; TC: 59; AC chưa có TC vì thiếu thông tin: 5.
- Ứng viên yêu cầu (Proposed/Deferred/Blocked): 12, tất cả có nguồn, gap, quyết định hoặc “—”; không có AC.
- ID trùng: 0. Tham chiếu OQ/BR/AC không tồn tại: 0.
