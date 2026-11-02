# 03. Đặc tả Quản trị hệ thống (System Administration)

Phiên bản v0.1 Draft · 2026-10-26 · Trạng thái **DRAFT, chưa được phê duyệt**. Tài liệu bổ sung độc lập, không thay thế SRS hiện hành.

## 1. Phạm vi và mục tiêu

Quản lý tài khoản, vai trò và phân quyền, đối tác, cấu hình, giám sát, audit log, bảo mật và dữ liệu cá nhân, hỗ trợ và khiếu nại, tích hợp và báo cáo quản trị. Mục tiêu: kiểm soát ai làm gì với dữ liệu nào, mọi thay đổi quan trọng có người duyệt và dấu vết, và không lộ dữ liệu nhạy cảm.

Không chọn cơ chế xác thực, nhà cung cấp đăng nhập hay công nghệ giám sát (OQ-48, OQ-58). Không thực hiện tích hợp thực tế và không đưa credentials giả vào tài liệu.

## 2. Actor

ACT-07 quản trị hệ thống, ACT-08 vận hành, ACT-09 hỗ trợ, ACT-10 tài chính (có điều kiện), ACT-11 kiểm toán, cùng ACT-12 (quản trị người dùng trong tenant mình). Chi tiết ở `01_ACTORS_AND_CAPABILITY_MAP.md`.

## 3. Tổng hợp

41 yêu cầu: Blocked 12, Proposed 29; ưu tiên đề xuất: Could 6, Must 21, Should 14.

| ID | Tên | Module | Actor | Ưu tiên | Phase | Trạng thái |
|---|---|---|---|---|---|---|
| SA-FR-001 | Tạo và mời tài khoản | SA-C01 | ACT-07 | Must | Foundation | Proposed |
| SA-FR-002 | Xem, cập nhật và vô hiệu hóa tài khoản | SA-C01 | ACT-07 | Must | Foundation | Proposed |
| SA-FR-003 | Khóa và mở khóa tài khoản | SA-C01 | ACT-07 | Must | Foundation | Proposed |
| SA-FR-004 | Đặt lại mật khẩu và khôi phục truy cập | SA-C01 | Người dùng | Must | Foundation | Blocked |
| SA-FR-005 | Quản lý phiên đăng nhập | SA-C01 | Người dùng | Should | Foundation | Proposed |
| SA-FR-006 | Danh mục vai trò và quyền | SA-C02 | ACT-07 | Must | Foundation | Proposed |
| SA-FR-007 | Gán, đổi và thu hồi vai trò | SA-C02 | ACT-07 | Must | Foundation | Proposed |
| SA-FR-008 | Kiểm tra quyền deny-by-default ở backend/API | SA-C02 | Hệ thống | Must | Foundation | Proposed |
| SA-FR-009 | Cách ly dữ liệu theo tenant | SA-C02 | Hệ thống | Must | Foundation | Proposed |
| SA-FR-010 | Quyền xem trường nhạy cảm và masking | SA-C02 | ACT-07 | Must | Foundation | Proposed |
| SA-FR-011 | Danh sách và tìm kiếm đối tác | SA-C03 | ACT-07 | Must | Hotel Operations | Proposed |
| SA-FR-012 | Duyệt, từ chối và yêu cầu bổ sung hồ sơ đối tác | SA-C03 | ACT-07 | Must | Hotel Operations | Proposed |
| SA-FR-013 | Tạm ngưng, khôi phục và ngừng hợp tác đối tác | SA-C03 | ACT-07 | Must | Hotel Operations | Proposed |
| SA-FR-014 | Phân tách người lập và người duyệt (maker-checker) | SA-C03 | ACT-07 | Should | Foundation | Blocked |
| SA-FR-015 | Quản lý danh mục | SA-C04 | ACT-07 | Must | System Operations | Proposed |
| SA-FR-016 | Tham số nghiệp vụ (thời hạn giữ chỗ, timeout) | SA-C04 | ACT-07 | Must | System Operations | Blocked |
| SA-FR-017 | Nội dung FAQ và hướng dẫn | SA-C04 | ACT-07 | Should | System Operations | Blocked |
| SA-FR-018 | Cấu hình thông báo | SA-C04 | ACT-07 | Should | System Operations | Blocked |
| SA-FR-019 | Bật/tắt tính năng (feature flag) | SA-C04 | ACT-07 | Could | System Operations | Proposed |
| SA-FR-020 | Kiểm soát thay đổi cấu hình: phê duyệt, phiên bản, rollback | SA-C04 | ACT-07 | Must | Foundation | Proposed |
| SA-FR-021 | Dashboard tình trạng vận hành | SA-C05 | ACT-07 | Should | System Operations | Blocked |
| SA-FR-022 | Theo dõi yêu cầu đặt phòng lỗi hoặc chờ quá lâu | SA-C05 | ACT-08 | Should | System Operations | Proposed |
| SA-FR-023 | Tra cứu theo correlation/request ID | SA-C05 | ACT-08 | Should | System Operations | Proposed |
| SA-FR-024 | Phân loại và xử lý sự cố hệ thống | SA-C05 | ACT-08 | Should | System Operations | Proposed |
| SA-FR-025 | Ghi audit log cho sự kiện quan trọng | SA-C06 | Hệ thống | Must | Foundation | Proposed |
| SA-FR-026 | Truy vấn và xem audit log | SA-C06 | ACT-11 | Must | Foundation | Proposed |
| SA-FR-027 | Bảo vệ audit log: bất biến, quyền và lưu giữ | SA-C06 | Hệ thống | Must | Foundation | Blocked |
| SA-FR-028 | Ghi nhận truy cập và xuất dữ liệu nhạy cảm | SA-C06 | Hệ thống | Must | Foundation | Proposed |
| SA-FR-029 | Phân loại dữ liệu | SA-C07 | ACT-07 | Must | Foundation | Blocked |
| SA-FR-030 | Che dữ liệu (masking) trên giao diện và log | SA-C07 | Hệ thống | Must | Foundation | Proposed |
| SA-FR-031 | Yêu cầu sửa, xuất, xóa dữ liệu cá nhân | SA-C07 | ACT-09 | Should | Advanced | Blocked |
| SA-FR-032 | Quản lý căn cứ xử lý dữ liệu và sự đồng ý | SA-C07 | ACT-07 | Could | Advanced | Blocked |
| SA-FR-033 | Tiếp nhận và phân loại yêu cầu hỗ trợ/khiếu nại | SA-C08 | ACT-09 | Should | System Operations | Proposed |
| SA-FR-034 | Gán, chuyển cấp, xử lý và đóng ca | SA-C08 | ACT-09 | Should | System Operations | Proposed |
| SA-FR-035 | Liên kết ca với đặt phòng/khách sạn và hạn chế can thiệp giao dịch | SA-C08 | ACT-09 | Should | System Operations | Proposed |
| SA-FR-036 | Trạng thái kết nối và lịch sử request/response | SA-C09 | ACT-07 | Could | Advanced | Blocked |
| SA-FR-037 | Hàng đợi tác vụ nền, retry và chạy lại có kiểm soát | SA-C09 | ACT-08 | Could | System Operations | Proposed |
| SA-FR-038 | Quản lý credentials và khóa API | SA-C09 | ACT-07 | Could | Advanced | Blocked |
| SA-FR-039 | Báo cáo tài khoản và hoạt động người dùng | SA-C10 | ACT-07 | Could | System Operations | Proposed |
| SA-FR-040 | Báo cáo đối tác, đặt phòng, sự cố và khiếu nại | SA-C10 | ACT-07 | Should | System Operations | Proposed |
| SA-FR-041 | Xuất báo cáo theo quyền | SA-C10 | ACT-07 | Should | System Operations | Proposed |

## 4. Yêu cầu chức năng SA-FR

### SA-C01 Quản lý tài khoản

#### SA-FR-001 — Tạo và mời tài khoản

| Trường | Nội dung |
|---|---|
| ID | SA-FR-001 |
| Tên | Tạo và mời tài khoản |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: quản trị hoặc chủ khách sạn mời người dùng mới vào đúng phạm vi tổ chức; không chọn cơ chế xác thực cụ thể khi chưa có kiến trúc (OQ-48). |
| Actor | ACT-07; ACT-12 |
| Trigger | Người có quyền chọn “Mời người dùng”. |
| Preconditions | • Người mời có quyền M trên phạm vi<br>• Vai trò được phép cấp theo SA-FR-006 |
| Main flow | 1. Nhập định danh liên hệ tối thiểu và vai trò<br>2. Hệ thống kiểm tra duy nhất<br>3. Tạo tài khoản trạng thái Đã mời<br>4. Gửi lời mời có hạn |
| Alternate / error flows | • Định danh trùng: từ chối<br>• Cấp vai trò vượt quyền người mời: từ chối<br>• Lời mời hết hạn: tạo lại |
| Postconditions | • Tài khoản Đã mời gắn tenant và vai trò |
| Business rules | SA-BR-001, SA-BR-002 |
| Data requirements | SA-DATA-001, SA-DATA-004 |
| Authorization (đề xuất, deny by default) | ACT-07: M (toàn hệ thống); ACT-12: M (tenant mình, vai trò ACT-13/14) |
| Audit | account.invited |
| Acceptance criteria (Proposed) | SA-FR-001.AC1: Không thể cấp vai trò cao hơn quyền của người mời<br>SA-FR-001.AC2: Định danh trùng bị từ chối<br>SA-FR-001.AC3: Lời mời hết hạn sau thời hạn cấu hình và không dùng lại được<br>SA-FR-001.AC4: Có audit |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-031, MB-16 |
| Dependency | — |
| OQ / Decision | OQ-48 → D-35, OQ-55 → D-42, OQ-59 → D-46 |

#### SA-FR-002 — Xem, cập nhật và vô hiệu hóa tài khoản

| Trường | Nội dung |
|---|---|
| ID | SA-FR-002 |
| Tên | Xem, cập nhật và vô hiệu hóa tài khoản |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: quản lý vòng đời Đã mời, Hoạt động, Khóa, Vô hiệu hóa (SM-05). |
| Actor | ACT-07; ACT-12 |
| Trigger | Người có quyền mở danh sách tài khoản. |
| Preconditions | • Có quyền M |
| Main flow | 1. Liệt kê tài khoản trong phạm vi<br>2. Sửa thông tin cho phép<br>3. Vô hiệu hóa với lý do |
| Alternate / error flows | • Vô hiệu hóa tài khoản đang có phiên: thu hồi phiên<br>• Vô hiệu hóa tài khoản duy nhất có quyền quản trị của tenant: chặn |
| Postconditions | • Tài khoản vô hiệu không đăng nhập được |
| Business rules | SA-BR-001, SA-BR-003 |
| Data requirements | SA-DATA-001 |
| Authorization (đề xuất, deny by default) | ACT-07: R, U, X; ACT-12: R, U, X (tenant mình) |
| Audit | account.updated; account.disabled |
| Acceptance criteria (Proposed) | SA-FR-002.AC1: Tài khoản vô hiệu hóa không đăng nhập được và mọi phiên bị thu hồi<br>SA-FR-002.AC2: Không thể vô hiệu hóa quản trị viên cuối cùng của tenant<br>SA-FR-002.AC3: Có lý do và audit |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-031 |
| Dependency | SA-FR-001 |
| OQ / Decision | — |

#### SA-FR-003 — Khóa và mở khóa tài khoản

| Trường | Nội dung |
|---|---|
| ID | SA-FR-003 |
| Tên | Khóa và mở khóa tài khoản |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khóa tạm thời (do quản trị hoặc theo sự kiện bảo mật) và mở khóa có kiểm soát. |
| Actor | ACT-07; ACT-12; hệ thống |
| Trigger | Quản trị khóa hoặc hệ thống khóa theo quy tắc. |
| Preconditions | • Tài khoản Hoạt động (khóa) hoặc Khóa (mở khóa) |
| Main flow | 1. Chọn tài khoản và lý do<br>2. Chuyển Khóa<br>3. Thu hồi phiên<br>4. Mở khóa khi đủ điều kiện |
| Alternate / error flows | • Mở khóa không có quyền: từ chối |
| Postconditions | • Tài khoản Khóa không vào được |
| Business rules | SA-BR-003 |
| Data requirements | SA-DATA-001, SA-DATA-005 |
| Authorization (đề xuất, deny by default) | ACT-07: X, U; ACT-12: X, U (tenant mình) |
| Audit | account.locked; account.unlocked |
| Acceptance criteria (Proposed) | SA-FR-003.AC1: Tài khoản Khóa bị từ chối đăng nhập kèm thông báo nêu cách mở khóa<br>SA-FR-003.AC2: Khóa thu hồi toàn bộ phiên<br>SA-FR-003.AC3: Mở khóa cần lý do và có audit |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-031 |
| Dependency | SA-FR-002 |
| OQ / Decision | OQ-48 → D-35 |

#### SA-FR-004 — Đặt lại mật khẩu và khôi phục truy cập

| Trường | Nội dung |
|---|---|
| ID | SA-FR-004 |
| Tên | Đặt lại mật khẩu và khôi phục truy cập |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: quy trình đặt lại mật khẩu; chưa chọn cơ chế vì chưa có kiến trúc xác thực. |
| Actor | Người dùng; ACT-07 |
| Trigger | Người dùng yêu cầu đặt lại. |
| Preconditions | • Cơ chế xác thực được chọn (OQ-48) |
| Main flow | 1. Người dùng yêu cầu<br>2. Hệ thống gửi liên kết dùng một lần có hạn<br>3. Người dùng đặt mật khẩu mới<br>4. Thu hồi phiên cũ |
| Alternate / error flows | • Liên kết hết hạn hoặc đã dùng: từ chối<br>• Thông báo không tiết lộ tài khoản có tồn tại hay không |
| Postconditions | • Mật khẩu mới có hiệu lực, phiên cũ bị thu hồi |
| Business rules | SA-BR-004 |
| Data requirements | SA-DATA-001, SA-DATA-005 |
| Authorization (đề xuất, deny by default) | Người dùng: tự yêu cầu; ACT-07: kích hoạt hỗ trợ có kiểm soát |
| Audit | account.password.reset |
| Acceptance criteria (Proposed) | SA-FR-004.AC1: Liên kết chỉ dùng được một lần và hết hạn theo cấu hình<br>SA-FR-004.AC2: Phản hồi yêu cầu đặt lại giống nhau cho tài khoản có và không tồn tại<br>SA-FR-004.AC3: Mật khẩu hoặc token không xuất hiện trong log |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-48 → D-35 |

#### SA-FR-005 — Quản lý phiên đăng nhập

| Trường | Nội dung |
|---|---|
| ID | SA-FR-005 |
| Tên | Quản lý phiên đăng nhập |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: xem và thu hồi phiên; tự đăng xuất; hết hạn phiên theo cấu hình. |
| Actor | Người dùng; ACT-07; ACT-12 |
| Trigger | Người dùng mở “Phiên của tôi” hoặc quản trị thu hồi. |
| Preconditions | • Có phiên |
| Main flow | 1. Liệt kê phiên<br>2. Thu hồi phiên<br>3. Hết hạn tự động theo thời gian không hoạt động |
| Alternate / error flows | • Thu hồi phiên đang dùng: đăng xuất ngay |
| Postconditions | • Phiên bị thu hồi không dùng lại được |
| Business rules | SA-BR-004 |
| Data requirements | SA-DATA-005 |
| Authorization (đề xuất, deny by default) | Người dùng: R, X (của mình); ACT-07: R, X; ACT-12: X (tenant mình) |
| Audit | session.revoked |
| Acceptance criteria (Proposed) | SA-FR-005.AC1: Phiên bị thu hồi bị từ chối ở yêu cầu kế tiếp<br>SA-FR-005.AC2: Phiên hết hạn sau thời gian không hoạt động cấu hình<br>SA-FR-005.AC3: Đăng xuất làm mất hiệu lực token phía máy chủ |
| Priority · Phase | Should (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-48 → D-35 |


### SA-C02 Vai trò và phân quyền (RBAC)

#### SA-FR-006 — Danh mục vai trò và quyền

| Trường | Nội dung |
|---|---|
| ID | SA-FR-006 |
| Tên | Danh mục vai trò và quyền |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: danh mục vai trò ứng viên và tập quyền theo (tài nguyên, hành động) ở 01_ACTORS_AND_CAPABILITY_MAP; danh sách chưa phải cuối cùng. |
| Actor | ACT-07 |
| Trigger | Quản trị mở “Vai trò”. |
| Preconditions | • Có quyền M |
| Main flow | 1. Xem vai trò và quyền<br>2. Tạo hoặc sửa vai trò tùy chỉnh (nếu được duyệt)<br>3. Mọi thay đổi qua SM-06 |
| Alternate / error flows | • Xóa vai trò đang được gán: chặn |
| Postconditions | • Danh mục vai trò có phiên bản |
| Business rules | SA-BR-005 |
| Data requirements | SA-DATA-002, SA-DATA-003 |
| Authorization (đề xuất, deny by default) | ACT-07: C, R, U (qua phê duyệt) |
| Audit | role.changed |
| Acceptance criteria (Proposed) | SA-FR-006.AC1: Không xóa được vai trò đang gán<br>SA-FR-006.AC2: Mỗi vai trò liệt kê đủ quyền theo ma trận<br>SA-FR-006.AC3: Thay đổi vai trò cần phê duyệt và có audit |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-55 → D-42, OQ-47 → D-34 |

#### SA-FR-007 — Gán, đổi và thu hồi vai trò

| Trường | Nội dung |
|---|---|
| ID | SA-FR-007 |
| Tên | Gán, đổi và thu hồi vai trò |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: gán vai trò cho tài khoản trong phạm vi tenant; thu hồi có hiệu lực ngay. |
| Actor | ACT-07; ACT-12 |
| Trigger | Người có quyền M gán vai trò. |
| Preconditions | • Tài khoản tồn tại |
| Main flow | 1. Chọn tài khoản và vai trò<br>2. Kiểm tra phạm vi và không vượt quyền người gán<br>3. Lưu<br>4. Thu hồi phiên nếu giảm quyền |
| Alternate / error flows | • Gán vai trò ngoài phạm vi tenant: từ chối |
| Postconditions | • Quyền có hiệu lực theo vai trò mới |
| Business rules | SA-BR-002, SA-BR-005 |
| Data requirements | SA-DATA-004 |
| Authorization (đề xuất, deny by default) | ACT-07: M; ACT-12: M (vai trò ACT-13/14 trong tenant mình) |
| Audit | role.assigned; role.revoked |
| Acceptance criteria (Proposed) | SA-FR-007.AC1: Không tự nâng quyền của chính mình<br>SA-FR-007.AC2: Thu hồi vai trò có hiệu lực ở yêu cầu kế tiếp<br>SA-FR-007.AC3: Mỗi thay đổi ghi audit với trước/sau |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-006 |
| OQ / Decision | OQ-55 → D-42 |

#### SA-FR-008 — Kiểm tra quyền deny-by-default ở backend/API

| Trường | Nội dung |
|---|---|
| ID | SA-FR-008 |
| Tên | Kiểm tra quyền deny-by-default ở backend/API |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất (yêu cầu hệ thống): mọi API kiểm tra quyền phía máy chủ theo (người dùng, tài nguyên, hành động, tenant); không có quyền tường minh thì từ chối; ẩn nút trên giao diện không phải cơ chế bảo mật. |
| Actor | Hệ thống |
| Trigger | Mọi yêu cầu API. |
| Preconditions | • Có phiên hợp lệ |
| Main flow | 1. Xác thực<br>2. Xác định tenant và vai trò<br>3. Kiểm tra quyền<br>4. Cho phép hoặc từ chối 403 |
| Alternate / error flows | • Quyền không xác định: từ chối<br>• Phiên hết hạn: 401 |
| Postconditions | • Không có đường truy cập trái quyền |
| Business rules | SA-BR-006 |
| Data requirements | SA-DATA-002, SA-DATA-003, SA-DATA-004 |
| Authorization (đề xuất, deny by default) | Hệ thống |
| Audit | authz.denied |
| Acceptance criteria (Proposed) | SA-FR-008.AC1: Gọi trực tiếp API tài nguyên không có quyền trả 403 dù giao diện không có nút<br>SA-FR-008.AC2: Tài nguyên không có quy tắc quyền bị từ chối mặc định<br>SA-FR-008.AC3: Kiểm thử quyền có test tự động cho mỗi cặp (vai trò, tài nguyên, hành động) trong ma trận |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: SH-NFR-001 |
| Dependency | SA-FR-006 |
| OQ / Decision | OQ-59 → D-46 |

#### SA-FR-009 — Cách ly dữ liệu theo tenant

| Trường | Nội dung |
|---|---|
| ID | SA-FR-009 |
| Tên | Cách ly dữ liệu theo tenant |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất (yêu cầu hệ thống): mọi truy vấn và thao tác ghi bị ràng buộc theo tenant; người dùng khách sạn không thể thấy hoặc sửa dữ liệu tenant khác. |
| Actor | Hệ thống |
| Trigger | Mọi truy vấn dữ liệu có phạm vi tenant. |
| Preconditions | • Có tenant của người dùng |
| Main flow | 1. Hệ thống gắn điều kiện tenant vào mọi truy vấn<br>2. Từ chối thao tác trên dữ liệu ngoài tenant |
| Alternate / error flows | • Tham chiếu chéo tenant trong dữ liệu: từ chối |
| Postconditions | • Không có đọc/ghi chéo tenant |
| Business rules | SA-BR-007 |
| Data requirements | SA-DATA-017 |
| Authorization (đề xuất, deny by default) | Hệ thống |
| Audit | tenant.violation.attempt |
| Acceptance criteria (Proposed) | SA-FR-009.AC1: Đổi mã đối tượng trong yêu cầu sang đối tượng của tenant khác trả 403 hoặc 404 và không lộ sự tồn tại<br>SA-FR-009.AC2: Báo cáo và xuất dữ liệu cũng bị ràng buộc tenant<br>SA-FR-009.AC3: Có kiểm thử truy cập chéo tenant cho mỗi loại tài nguyên |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: SH-NFR-002 |
| Dependency | — |
| OQ / Decision | OQ-55 → D-42 |

#### SA-FR-010 — Quyền xem trường nhạy cảm và masking

| Trường | Nội dung |
|---|---|
| ID | SA-FR-010 |
| Tên | Quyền xem trường nhạy cảm và masking |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: trường nhạy cảm chỉ hiển thị với quyền V và được che mặc định. |
| Actor | ACT-07; ACT-09; ACT-12 |
| Trigger | Người dùng xem dữ liệu có trường nhạy cảm. |
| Preconditions | • Có phân loại dữ liệu (SA-FR-029) |
| Main flow | 1. Hệ thống kiểm tra quyền V<br>2. Che trường nếu không có quyền<br>3. Ghi audit khi hiển thị rõ |
| Alternate / error flows | • Yêu cầu hiển thị rõ không có lý do: từ chối |
| Postconditions | • Trường nhạy cảm không lộ ngoài quyền |
| Business rules | SA-BR-008 |
| Data requirements | SA-DATA-001 |
| Authorization (đề xuất, deny by default) | ACT-07/09: V (có lý do); ACT-12: V (khách của mình); ACT-11: không V |
| Audit | sensitive.revealed |
| Acceptance criteria (Proposed) | SA-FR-010.AC1: Người không có quyền V thấy giá trị bị che trên giao diện và API<br>SA-FR-010.AC2: Mỗi lần hiển thị rõ có audit kèm lý do<br>SA-FR-010.AC3: Giá trị rõ không xuất hiện trong log |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-029 |
| OQ / Decision | OQ-50 → D-37 |


### SA-C03 Quản lý đối tác

#### SA-FR-011 — Danh sách và tìm kiếm đối tác

| Trường | Nội dung |
|---|---|
| ID | SA-FR-011 |
| Tên | Danh sách và tìm kiếm đối tác |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: quản trị xem danh sách đối tác theo trạng thái, khu vực, ngày tạo. |
| Actor | ACT-07; ACT-08; ACT-11 |
| Trigger | Mở “Đối tác”. |
| Preconditions | • Có quyền R |
| Main flow | 1. Lọc và tìm<br>2. Hiển thị trạng thái hồ sơ<br>3. Mở chi tiết |
| Alternate / error flows | • Không có kết quả: rỗng |
| Postconditions | • Danh sách theo quyền |
| Business rules | SA-BR-007 |
| Data requirements | HM-DATA-001 |
| Authorization (đề xuất, deny by default) | ACT-07/08/11: R |
| Audit | — |
| Acceptance criteria (Proposed) | SA-FR-011.AC1: Lọc theo trạng thái cho kết quả đúng<br>SA-FR-011.AC2: Auditor chỉ đọc<br>SA-FR-011.AC3: Phân trang ổn định |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | — |

#### SA-FR-012 — Duyệt, từ chối và yêu cầu bổ sung hồ sơ đối tác

| Trường | Nội dung |
|---|---|
| ID | SA-FR-012 |
| Tên | Duyệt, từ chối và yêu cầu bổ sung hồ sơ đối tác |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: quy trình duyệt hồ sơ theo SM-01 với lý do bắt buộc khi từ chối hoặc yêu cầu bổ sung. |
| Actor | ACT-07; ACT-08 |
| Trigger | Người duyệt mở hồ sơ Chờ duyệt. |
| Preconditions | • Hồ sơ ở Chờ duyệt<br>• Người duyệt có quyền A |
| Main flow | 1. Xem hồ sơ và tài liệu<br>2. Chọn Duyệt, Từ chối hoặc Cần bổ sung<br>3. Nhập lý do (bắt buộc với hai kết quả sau)<br>4. Hệ thống chuyển trạng thái và thông báo |
| Alternate / error flows | • Hồ sơ đã được xử lý bởi người khác: thông báo xung đột<br>• Người duyệt là người lập: chặn nếu SA-FR-014 áp dụng |
| Postconditions | • Hồ sơ ở trạng thái mới và có lịch sử |
| Business rules | SA-BR-009 |
| Data requirements | HM-DATA-001, HM-DATA-003 |
| Authorization (đề xuất, deny by default) | ACT-07/08: A |
| Audit | partner.approved; partner.rejected; partner.moreinfo |
| Acceptance criteria (Proposed) | SA-FR-012.AC1: Từ chối hoặc Cần bổ sung không có lý do bị chặn<br>SA-FR-012.AC2: Hai người duyệt cùng lúc: chỉ một kết quả có hiệu lực<br>SA-FR-012.AC3: Khách sạn nhận thông báo kết quả kèm lý do |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: SM-01 |
| Dependency | HM-FR-003 |
| OQ / Decision | OQ-47 → D-34, OQ-51 → D-38 |

#### SA-FR-013 — Tạm ngưng, khôi phục và ngừng hợp tác đối tác

| Trường | Nội dung |
|---|---|
| ID | SA-FR-013 |
| Tên | Tạm ngưng, khôi phục và ngừng hợp tác đối tác |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: tạm ngưng đối tác khỏi danh sách hiển thị khi có lý do; khôi phục có kiểm soát; ngưỡng tự động chưa có. |
| Actor | ACT-07; ACT-08 |
| Trigger | Người có quyền chọn “Tạm ngưng”. |
| Preconditions | • Đối tác Hoạt động |
| Main flow | 1. Chọn đối tác và lý do<br>2. Hệ thống cảnh báo đặt phòng đang hiệu lực<br>3. Chuyển Tạm ngưng<br>4. Ẩn khỏi người dùng cuối<br>5. Thông báo đối tác |
| Alternate / error flows | • Tạm ngưng không tự hủy đặt phòng đã xác nhận<br>• Khôi phục cần lý do |
| Postconditions | • Đối tác Tạm ngưng không xuất hiện cho người dùng cuối |
| Business rules | SA-BR-009, SA-BR-010 |
| Data requirements | HM-DATA-001, HM-DATA-003 |
| Authorization (đề xuất, deny by default) | ACT-07/08: X, U |
| Audit | partner.suspended; partner.restored |
| Acceptance criteria (Proposed) | SA-FR-013.AC1: Đối tác Tạm ngưng không xuất hiện trong kết quả tìm kiếm của người dùng cuối<br>SA-FR-013.AC2: Đặt phòng đã xác nhận không bị tự hủy<br>SA-FR-013.AC3: Lý do và người thực hiện được ghi audit |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-030 |
| Dependency | SA-FR-012 |
| OQ / Decision | OQ-56 → D-43 |

#### SA-FR-014 — Phân tách người lập và người duyệt (maker-checker)

| Trường | Nội dung |
|---|---|
| ID | SA-FR-014 |
| Tên | Phân tách người lập và người duyệt (maker-checker) |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: người tạo/sửa không được tự phê duyệt thay đổi quan trọng. |
| Actor | ACT-07; ACT-08 |
| Trigger | Người duyệt mở yêu cầu thay đổi. |
| Preconditions | • Chính sách maker-checker được duyệt (OQ-47) |
| Main flow | 1. Hệ thống so sánh người lập và người duyệt<br>2. Chặn nếu trùng<br>3. Chuyển sang người duyệt khác |
| Alternate / error flows | • Chỉ có một người có quyền: ghi nhận ngoại lệ có lý do và người cho phép |
| Postconditions | • Không có tự phê duyệt |
| Business rules | SA-BR-011 |
| Data requirements | SA-DATA-008 |
| Authorization (đề xuất, deny by default) | ACT-07/08: A (khác người lập) |
| Audit | approval.selfblocked |
| Acceptance criteria (Proposed) | SA-FR-014.AC1: Người lập không thể phê duyệt yêu cầu của chính mình<br>SA-FR-014.AC2: Ngoại lệ có lý do và người duyệt cấp cao<br>SA-FR-014.AC3: Có audit cho mỗi chặn và ngoại lệ |
| Priority · Phase | Should (đề xuất) · Foundation |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-47 → D-34 |


### SA-C04 Danh mục và cấu hình hệ thống

#### SA-FR-015 — Quản lý danh mục

| Trường | Nội dung |
|---|---|
| ID | SA-FR-015 |
| Tên | Quản lý danh mục |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: danh mục loại hình lưu trú, loại phòng, tiện ích, lý do từ chối, phân loại sự cố, trạng thái. |
| Actor | ACT-07; ACT-08 |
| Trigger | Quản trị mở “Danh mục”. |
| Preconditions | • Có quyền U |
| Main flow | 1. Thêm, sửa, ngừng dùng mục danh mục<br>2. Mục đang dùng chỉ được ngừng dùng, không xóa<br>3. Thay đổi theo SM-06 nếu ảnh hưởng nghiệp vụ |
| Alternate / error flows | • Xóa mục đang tham chiếu: chặn |
| Postconditions | • Danh mục có phiên bản |
| Business rules | SA-BR-012 |
| Data requirements | SA-DATA-006 |
| Authorization (đề xuất, deny by default) | ACT-07: C, U, X; ACT-08: U (mục không ảnh hưởng quyền lợi) |
| Audit | catalog.changed |
| Acceptance criteria (Proposed) | SA-FR-015.AC1: Mục đang được tham chiếu không xóa được<br>SA-FR-015.AC2: Ngừng dùng mục không làm mất dữ liệu cũ<br>SA-FR-015.AC3: Thay đổi có audit |
| Priority · Phase | Must (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-020 |
| OQ / Decision | — |

#### SA-FR-016 — Tham số nghiệp vụ (thời hạn giữ chỗ, timeout)

| Trường | Nội dung |
|---|---|
| ID | SA-FR-016 |
| Tên | Tham số nghiệp vụ (thời hạn giữ chỗ, timeout) |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: tham số như thời hạn giữ chỗ, hết hạn yêu cầu; là cấu hình có kiểm soát, giá trị do PO quyết định (OQ-45); giá trị 15 phút của mô phỏng hiện tại không mặc nhiên áp dụng. |
| Actor | ACT-07 |
| Trigger | Quản trị sửa tham số. |
| Preconditions | • Có quyền U<br>• Có người duyệt (SA-FR-020) |
| Main flow | 1. Chọn tham số<br>2. Nhập giá trị trong khoảng cho phép<br>3. Gửi duyệt<br>4. Có hiệu lực từ thời điểm đặt |
| Alternate / error flows | • Giá trị ngoài khoảng: từ chối<br>• Thay đổi ảnh hưởng yêu cầu đang chờ: áp dụng cho yêu cầu mới |
| Postconditions | • Tham số có phiên bản và hiệu lực |
| Business rules | SA-BR-013 |
| Data requirements | SA-DATA-006, SA-DATA-007 |
| Authorization (đề xuất, deny by default) | ACT-07: U (qua phê duyệt) |
| Audit | config.param.changed |
| Acceptance criteria (Proposed) | SA-FR-016.AC1: Giá trị ngoài khoảng bị từ chối<br>SA-FR-016.AC2: Thay đổi chỉ áp dụng cho yêu cầu tạo sau thời điểm hiệu lực<br>SA-FR-016.AC3: Có phiên bản, người duyệt, khả năng rollback |
| Priority · Phase | Must (đề xuất) · System Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-032, D-04 |
| Dependency | SA-FR-020 |
| OQ / Decision | OQ-45 → D-32, OQ-47 → D-34 |

#### SA-FR-017 — Nội dung FAQ và hướng dẫn

| Trường | Nội dung |
|---|---|
| ID | SA-FR-017 |
| Tên | Nội dung FAQ và hướng dẫn |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: quản lý nội dung FAQ/hướng dẫn kèm nguồn và ngày hiệu lực; nội dung quyền lợi hành khách là nội dung có tác động pháp lý, cần phê duyệt riêng (MB-03 đang Blocked). |
| Actor | ACT-07; ACT-08 |
| Trigger | Quản trị sửa nội dung. |
| Preconditions | • Có quyền U |
| Main flow | 1. Soạn nội dung<br>2. Gắn nguồn và ngày hiệu lực<br>3. Gửi duyệt<br>4. Xuất bản |
| Alternate / error flows | • Nội dung quyền lợi chưa được PO duyệt: không cho xuất bản |
| Postconditions | • Nội dung có nguồn và hiệu lực |
| Business rules | SA-BR-014 |
| Data requirements | SA-DATA-006, SA-DATA-007 |
| Authorization (đề xuất, deny by default) | ACT-07/08: U (qua phê duyệt) |
| Audit | content.published |
| Acceptance criteria (Proposed) | SA-FR-017.AC1: Nội dung thiếu nguồn hoặc ngày hiệu lực không xuất bản được<br>SA-FR-017.AC2: Nội dung quyền lợi bị chặn đến khi D-13 duyệt<br>SA-FR-017.AC3: Có lịch sử phiên bản |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: BR-007, BR-013, FR-032 |
| Dependency | SA-FR-020 |
| OQ / Decision | OQ-47 → D-34 |

#### SA-FR-018 — Cấu hình thông báo

| Trường | Nội dung |
|---|---|
| ID | SA-FR-018 |
| Tên | Cấu hình thông báo |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: cấu hình mẫu và quy tắc thông báo; kênh phụ thuộc OQ-52. |
| Actor | ACT-07 |
| Trigger | Quản trị sửa mẫu thông báo. |
| Preconditions | • Có quyền U |
| Main flow | 1. Chọn sự kiện và kênh<br>2. Sửa mẫu<br>3. Gửi duyệt<br>4. Xuất bản |
| Alternate / error flows | • Mẫu chứa trường nhạy cảm không cho phép: chặn |
| Postconditions | • Mẫu thông báo có phiên bản |
| Business rules | SA-BR-013 |
| Data requirements | SA-DATA-006, SA-DATA-007 |
| Authorization (đề xuất, deny by default) | ACT-07: U |
| Audit | config.notification.changed |
| Acceptance criteria (Proposed) | SA-FR-018.AC1: Mẫu không được chứa trường nằm trong danh sách nhạy cảm<br>SA-FR-018.AC2: Có phiên bản và rollback<br>SA-FR-018.AC3: Có audit |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-020 |
| OQ / Decision | OQ-52 → D-39 |

#### SA-FR-019 — Bật/tắt tính năng (feature flag)

| Trường | Nội dung |
|---|---|
| ID | SA-FR-019 |
| Tên | Bật/tắt tính năng (feature flag) |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: bật tắt tính năng theo môi trường hoặc nhóm người dùng. |
| Actor | ACT-07 |
| Trigger | Quản trị đổi cờ. |
| Preconditions | • Có quyền U |
| Main flow | 1. Chọn cờ<br>2. Chọn phạm vi<br>3. Lưu |
| Alternate / error flows | • Cờ ảnh hưởng quyền lợi khách: cần phê duyệt |
| Postconditions | • Cờ có hiệu lực theo phạm vi |
| Business rules | SA-BR-013 |
| Data requirements | SA-DATA-006 |
| Authorization (đề xuất, deny by default) | ACT-07: U |
| Audit | config.flag.changed |
| Acceptance criteria (Proposed) | SA-FR-019.AC1: Cờ có phạm vi môi trường hoặc nhóm rõ ràng<br>SA-FR-019.AC2: Thay đổi cờ ảnh hưởng nghiệp vụ cần phê duyệt<br>SA-FR-019.AC3: Có audit |
| Priority · Phase | Could (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-020 |
| OQ / Decision | — |

#### SA-FR-020 — Kiểm soát thay đổi cấu hình: phê duyệt, phiên bản, rollback

| Trường | Nội dung |
|---|---|
| ID | SA-FR-020 |
| Tên | Kiểm soát thay đổi cấu hình: phê duyệt, phiên bản, rollback |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: mọi thay đổi cấu hình có tác động tới quyền lợi khách hoặc luồng đặt phòng đi qua SM-06: soạn, phê duyệt, hiệu lực, rollback. |
| Actor | ACT-07; ACT-08 |
| Trigger | Người có quyền gửi thay đổi cấu hình. |
| Preconditions | • Có quy tắc phê duyệt (OQ-47) |
| Main flow | 1. Soạn thay đổi<br>2. Gửi duyệt<br>3. Người duyệt khác duyệt<br>4. Có hiệu lực theo lịch<br>5. Có thể rollback về phiên bản trước |
| Alternate / error flows | • Duyệt thất bại: giữ cấu hình cũ<br>• Rollback gặp xung đột: nêu rõ |
| Postconditions | • Phiên bản cấu hình có người soạn, người duyệt, hiệu lực |
| Business rules | SA-BR-011, SA-BR-013 |
| Data requirements | SA-DATA-006, SA-DATA-007, SA-DATA-008 |
| Authorization (đề xuất, deny by default) | ACT-07/08: S, A |
| Audit | config.approved; config.rolledback |
| Acceptance criteria (Proposed) | SA-FR-020.AC1: Cấu hình có hiệu lực chỉ sau khi được duyệt<br>SA-FR-020.AC2: Rollback khôi phục đúng giá trị phiên bản trước<br>SA-FR-020.AC3: Mỗi phiên bản có người soạn, người duyệt, thời điểm và lý do |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: NFR-009, FR-032 |
| Dependency | — |
| OQ / Decision | OQ-47 → D-34 |


### SA-C05 Giám sát và xử lý sự cố

#### SA-FR-021 — Dashboard tình trạng vận hành

| Trường | Nội dung |
|---|---|
| ID | SA-FR-021 |
| Tên | Dashboard tình trạng vận hành |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: dashboard chỉ dựa trên dữ liệu thực sự có; chưa giả định đã có hạ tầng giám sát. |
| Actor | ACT-07; ACT-08 |
| Trigger | Mở dashboard. |
| Preconditions | • Có nguồn dữ liệu đo (OQ-58) |
| Main flow | 1. Hiển thị số liệu theo định nghĩa<br>2. Làm mới<br>3. Che dữ liệu nhạy cảm |
| Alternate / error flows | • Nguồn không có: hiển thị “chưa có dữ liệu” |
| Postconditions | • Số liệu có nguồn và định nghĩa |
| Business rules | SA-BR-015 |
| Data requirements | SA-DATA-016 |
| Authorization (đề xuất, deny by default) | ACT-07/08: R |
| Audit | — |
| Acceptance criteria (Proposed) | SA-FR-021.AC1: Mỗi chỉ số có nguồn dữ liệu và công thức hiển thị<br>SA-FR-021.AC2: Không có dữ liệu nhạy cảm trên dashboard<br>SA-FR-021.AC3: Nguồn lỗi hiển thị rõ thay vì số 0 |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-58 → D-45 |

#### SA-FR-022 — Theo dõi yêu cầu đặt phòng lỗi hoặc chờ quá lâu

| Trường | Nội dung |
|---|---|
| ID | SA-FR-022 |
| Tên | Theo dõi yêu cầu đặt phòng lỗi hoặc chờ quá lâu |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: danh sách yêu cầu lỗi, treo hoặc sắp quá hạn để vận hành xử lý. |
| Actor | ACT-08 |
| Trigger | Mở “Cần xử lý”. |
| Preconditions | • Có quyền R |
| Main flow | 1. Lọc theo trạng thái bất thường<br>2. Xem chi tiết và correlation ID<br>3. Gán xử lý |
| Alternate / error flows | • Yêu cầu đã tự phục hồi: tự biến mất khỏi danh sách |
| Postconditions | • Danh sách bất thường |
| Business rules | SA-BR-015 |
| Data requirements | HM-DATA-011, SA-DATA-014 |
| Authorization (đề xuất, deny by default) | ACT-08: R, U |
| Audit | monitor.case.assigned |
| Acceptance criteria (Proposed) | SA-FR-022.AC1: Yêu cầu chờ quá ngưỡng cấu hình xuất hiện trong danh sách<br>SA-FR-022.AC2: Mỗi dòng có correlation ID<br>SA-FR-022.AC3: Thông tin khách bị che theo quyền |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-018 |
| OQ / Decision | OQ-45 → D-32 |

#### SA-FR-023 — Tra cứu theo correlation/request ID

| Trường | Nội dung |
|---|---|
| ID | SA-FR-023 |
| Tên | Tra cứu theo correlation/request ID |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất (yêu cầu hệ thống): mỗi yêu cầu có correlation ID xuyên suốt log, audit, thông báo để truy vết. |
| Actor | ACT-08; ACT-09 |
| Trigger | Nhập ID. |
| Preconditions | • Có quyền R |
| Main flow | 1. Nhập ID<br>2. Hệ thống trả sự kiện liên quan theo thời gian |
| Alternate / error flows | • ID không tồn tại: thông báo không tìm thấy |
| Postconditions | • Truy vết được toàn bộ luồng |
| Business rules | SA-BR-015 |
| Data requirements | SA-DATA-009, SA-DATA-014 |
| Authorization (đề xuất, deny by default) | ACT-08: R; ACT-09: R (phạm vi hỗ trợ) |
| Audit | — |
| Acceptance criteria (Proposed) | SA-FR-023.AC1: Một ID trả về mọi sự kiện audit và tác vụ liên quan theo thứ tự thời gian<br>SA-FR-023.AC2: Dữ liệu nhạy cảm bị che<br>SA-FR-023.AC3: Người không có quyền không tra được |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-58 → D-45 |

#### SA-FR-024 — Phân loại và xử lý sự cố hệ thống

| Trường | Nội dung |
|---|---|
| ID | SA-FR-024 |
| Tên | Phân loại và xử lý sự cố hệ thống |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: quản lý sự cố vận hành theo SM-07: phân loại, gán, xử lý, đóng, ghi chú. |
| Actor | ACT-08; ACT-07 |
| Trigger | Có sự cố mới. |
| Preconditions | • Có quyền U |
| Main flow | 1. Tạo hoặc nhận sự cố<br>2. Phân loại mức độ<br>3. Gán<br>4. Cập nhật<br>5. Đóng với kết luận |
| Alternate / error flows | • Đóng khi chưa có kết luận: chặn |
| Postconditions | • Sự cố có vòng đời |
| Business rules | SA-BR-016 |
| Data requirements | SA-DATA-016 |
| Authorization (đề xuất, deny by default) | ACT-08: C, R, U; ACT-07: R |
| Audit | incident.status.changed |
| Acceptance criteria (Proposed) | SA-FR-024.AC1: Không đóng sự cố khi thiếu kết luận<br>SA-FR-024.AC2: Mỗi chuyển trạng thái có người và thời điểm<br>SA-FR-024.AC3: Sự cố liên kết đối tượng liên quan |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | — |


### SA-C06 Audit log

#### SA-FR-025 — Ghi audit log cho sự kiện quan trọng

| Trường | Nội dung |
|---|---|
| ID | SA-FR-025 |
| Tên | Ghi audit log cho sự kiện quan trọng |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất (năng lực dùng chung): ghi log cho đăng nhập và sự kiện bảo mật, thay đổi tài khoản/vai trò/quyền, duyệt đối tác, thay đổi giá/tồn, đặt phòng, cấu hình, truy cập hoặc xuất dữ liệu nhạy cảm. |
| Actor | Hệ thống |
| Trigger | Có sự kiện thuộc danh mục audit. |
| Preconditions | • Danh mục sự kiện (SA-DATA-009) |
| Main flow | 1. Ghi actor, action, target, timestamp, kết quả, lý do, correlation ID, trước/sau (nếu phù hợp)<br>2. Không ghi mật khẩu, token, secret |
| Alternate / error flows | • Lỗi ghi log: thao tác nghiệp vụ quan trọng bị từ chối hoặc có cảnh báo theo chính sách (OQ-49) |
| Postconditions | • Mỗi sự kiện có đủ trường |
| Business rules | SA-BR-017 |
| Data requirements | SA-DATA-009 |
| Authorization (đề xuất, deny by default) | Hệ thống: C |
| Audit | (chính nó) |
| Acceptance criteria (Proposed) | SA-FR-025.AC1: Mỗi sự kiện trong danh mục tạo đúng một bản ghi đủ trường<br>SA-FR-025.AC2: Không có mật khẩu, token, secret hay dữ liệu nhạy cảm không cần thiết trong bản ghi<br>SA-FR-025.AC3: Thao tác quan trọng thất bại cũng được ghi kèm kết quả |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: SH-NFR-007 |
| Dependency | — |
| OQ / Decision | OQ-49 → D-36 |

#### SA-FR-026 — Truy vấn và xem audit log

| Trường | Nội dung |
|---|---|
| ID | SA-FR-026 |
| Tên | Truy vấn và xem audit log |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: tìm audit log theo thời gian, actor, đối tượng, hành động, kết quả. |
| Actor | ACT-11; ACT-07 |
| Trigger | Mở “Nhật ký”. |
| Preconditions | • Có quyền R audit |
| Main flow | 1. Lọc<br>2. Hiển thị<br>3. Mở chi tiết với che trường |
| Alternate / error flows | • Quá nhiều kết quả: yêu cầu thu hẹp |
| Postconditions | • Truy vấn chỉ đọc |
| Business rules | SA-BR-017, SA-BR-008 |
| Data requirements | SA-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-11: R; ACT-07: R; ACT-12: R (tenant mình, tập hạn chế) |
| Audit | auditlog.viewed |
| Acceptance criteria (Proposed) | SA-FR-026.AC1: Không có thao tác sửa hoặc xóa trên giao diện và API<br>SA-FR-026.AC2: Khách sạn chỉ thấy bản ghi tenant mình<br>SA-FR-026.AC3: Truy vấn có phân trang và lọc đúng |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-025 |
| OQ / Decision | OQ-49 → D-36 |

#### SA-FR-027 — Bảo vệ audit log: bất biến, quyền và lưu giữ

| Trường | Nội dung |
|---|---|
| ID | SA-FR-027 |
| Tên | Bảo vệ audit log: bất biến, quyền và lưu giữ |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất: audit log chỉ ghi thêm, không sửa; thời hạn lưu và quyền truy cập do chính sách quyết định. |
| Actor | Hệ thống; ACT-07 |
| Trigger | Mọi lúc. |
| Preconditions | • Chính sách lưu giữ (OQ-49) |
| Main flow | 1. Hệ thống chỉ cho thêm<br>2. Phát hiện sửa xóa bất hợp lệ<br>3. Lưu theo thời hạn đã duyệt |
| Alternate / error flows | • Phát hiện vi phạm tính toàn vẹn: cảnh báo |
| Postconditions | • Audit log bất biến |
| Business rules | SA-BR-017 |
| Data requirements | SA-DATA-009 |
| Authorization (đề xuất, deny by default) | Hệ thống; ACT-07: không sửa xóa |
| Audit | — |
| Acceptance criteria (Proposed) | SA-FR-027.AC1: Không có API hoặc giao diện sửa/xóa bản ghi audit<br>SA-FR-027.AC2: Thử sửa trực tiếp bị phát hiện bằng cơ chế toàn vẹn đã chọn<br>SA-FR-027.AC3: Thời hạn lưu theo cấu hình đã duyệt |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-025 |
| OQ / Decision | OQ-49 → D-36 |

#### SA-FR-028 — Ghi nhận truy cập và xuất dữ liệu nhạy cảm

| Trường | Nội dung |
|---|---|
| ID | SA-FR-028 |
| Tên | Ghi nhận truy cập và xuất dữ liệu nhạy cảm |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất: mỗi lần xem rõ trường nhạy cảm hoặc xuất dữ liệu được ghi audit kèm lý do và số bản ghi. |
| Actor | Hệ thống |
| Trigger | Người dùng xem rõ hoặc xuất. |
| Preconditions | • Có quyền V hoặc E |
| Main flow | 1. Yêu cầu lý do<br>2. Ghi audit<br>3. Cho phép |
| Alternate / error flows | • Không có lý do: từ chối |
| Postconditions | • Có dấu vết truy cập |
| Business rules | SA-BR-008, SA-BR-017 |
| Data requirements | SA-DATA-009 |
| Authorization (đề xuất, deny by default) | Hệ thống |
| Audit | sensitive.revealed; data.exported |
| Acceptance criteria (Proposed) | SA-FR-028.AC1: Xem rõ hoặc xuất không có lý do bị từ chối<br>SA-FR-028.AC2: Mỗi lần có bản ghi gồm người, lý do, phạm vi, số bản ghi<br>SA-FR-028.AC3: Bản ghi không chứa nội dung dữ liệu nhạy cảm |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-025 |
| OQ / Decision | OQ-50 → D-37 |


### SA-C07 Bảo mật và dữ liệu cá nhân

#### SA-FR-029 — Phân loại dữ liệu

| Trường | Nội dung |
|---|---|
| ID | SA-FR-029 |
| Tên | Phân loại dữ liệu |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: phân loại trường dữ liệu theo mức nhạy cảm để áp quy tắc che, xuất, lưu giữ; cần review pháp lý/bảo mật. |
| Actor | ACT-07 |
| Trigger | Quản trị xem hoặc sửa phân loại. |
| Preconditions | • Có danh mục thực thể |
| Main flow | 1. Gán mức cho từng trường<br>2. Hệ thống áp quy tắc theo mức<br>3. Thay đổi qua SM-06 |
| Alternate / error flows | • Trường chưa phân loại: mặc định nhạy cảm |
| Postconditions | • Mỗi trường có mức |
| Business rules | SA-BR-008 |
| Data requirements | SA-DATA-006 |
| Authorization (đề xuất, deny by default) | ACT-07: R, U (qua phê duyệt); ACT-11: R |
| Audit | dataclass.changed |
| Acceptance criteria (Proposed) | SA-FR-029.AC1: Trường chưa phân loại được xử lý như nhạy cảm<br>SA-FR-029.AC2: Thay đổi mức có phê duyệt<br>SA-FR-029.AC3: Danh sách phân loại xuất được cho review bảo mật |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-50 → D-37 |

#### SA-FR-030 — Che dữ liệu (masking) trên giao diện và log

| Trường | Nội dung |
|---|---|
| ID | SA-FR-030 |
| Tên | Che dữ liệu (masking) trên giao diện và log |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất: che dữ liệu nhạy cảm theo mặc định trên giao diện, báo cáo và log. |
| Actor | Hệ thống |
| Trigger | Hiển thị hoặc ghi dữ liệu có trường nhạy cảm. |
| Preconditions | • Có phân loại (SA-FR-029) |
| Main flow | 1. Áp quy tắc che theo mức<br>2. Chỉ hiển thị rõ khi có quyền và lý do |
| Alternate / error flows | • Quy tắc che lỗi: không hiển thị trường đó |
| Postconditions | • Không lộ ngoài quyền |
| Business rules | SA-BR-008 |
| Data requirements | SA-DATA-009 |
| Authorization (đề xuất, deny by default) | Hệ thống |
| Audit | — |
| Acceptance criteria (Proposed) | SA-FR-030.AC1: Giao diện, báo cáo và log đều che trường nhạy cảm theo cùng quy tắc<br>SA-FR-030.AC2: Kiểm tra tự động quét log không thấy mẫu dữ liệu nhạy cảm<br>SA-FR-030.AC3: Lỗi che dữ liệu không dẫn tới hiển thị rõ |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: SH-NFR-006 |
| Dependency | SA-FR-029 |
| OQ / Decision | — |

#### SA-FR-031 — Yêu cầu sửa, xuất, xóa dữ liệu cá nhân

| Trường | Nội dung |
|---|---|
| ID | SA-FR-031 |
| Tên | Yêu cầu sửa, xuất, xóa dữ liệu cá nhân |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: quy trình tiếp nhận và xử lý yêu cầu của chủ thể dữ liệu; chỉ làm theo chính sách đã xác nhận; không kết luận tuân thủ pháp luật. |
| Actor | ACT-09; ACT-07; ACT-01 |
| Trigger | Chủ thể gửi yêu cầu. |
| Preconditions | • Chính sách và căn cứ pháp lý được xác minh (OQ-50) |
| Main flow | 1. Tiếp nhận<br>2. Xác minh danh tính theo cách đã duyệt<br>3. Xử lý<br>4. Ghi kết quả |
| Alternate / error flows | • Dữ liệu bắt buộc lưu theo nghĩa vụ khác: từ chối xóa có lý do |
| Postconditions | • Yêu cầu có kết quả |
| Business rules | SA-BR-018 |
| Data requirements | SA-DATA-015 |
| Authorization (đề xuất, deny by default) | ACT-09: C, R; ACT-07: A |
| Audit | dsr.processed |
| Acceptance criteria (Proposed) | SA-FR-031.AC1: Mỗi yêu cầu có hạn xử lý theo chính sách đã duyệt<br>SA-FR-031.AC2: Kết quả và lý do được ghi<br>SA-FR-031.AC3: Người không có quyền không xem được dữ liệu chủ thể |
| Priority · Phase | Should (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-50 → D-37 |

#### SA-FR-032 — Quản lý căn cứ xử lý dữ liệu và sự đồng ý

| Trường | Nội dung |
|---|---|
| ID | SA-FR-032 |
| Tên | Quản lý căn cứ xử lý dữ liệu và sự đồng ý |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: ghi nhận căn cứ xử lý/đồng ý nếu yêu cầu pháp lý xác định; hiện chưa có căn cứ. |
| Actor | ACT-07; ACT-01 |
| Trigger | Thu thập hoặc rút sự đồng ý. |
| Preconditions | • Có yêu cầu pháp lý đã xác minh |
| Main flow | 1. Hiển thị mục đích<br>2. Ghi lựa chọn<br>3. Cho rút |
| Alternate / error flows | • Rút đồng ý: áp dụng cho xử lý từ thời điểm rút |
| Postconditions | • Có lịch sử đồng ý |
| Business rules | SA-BR-018 |
| Data requirements | SA-DATA-015 |
| Authorization (đề xuất, deny by default) | ACT-01: C, U; ACT-07: R |
| Audit | consent.recorded |
| Acceptance criteria (Proposed) | SA-FR-032.AC1: Mỗi lựa chọn có thời điểm và phiên bản văn bản<br>SA-FR-032.AC2: Rút đồng ý có hiệu lực từ thời điểm rút<br>SA-FR-032.AC3: Không ghi nhận đồng ý mặc định |
| Priority · Phase | Could (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-50 → D-37 |


### SA-C08 Hỗ trợ và khiếu nại

#### SA-FR-033 — Tiếp nhận và phân loại yêu cầu hỗ trợ/khiếu nại

| Trường | Nội dung |
|---|---|
| ID | SA-FR-033 |
| Tên | Tiếp nhận và phân loại yêu cầu hỗ trợ/khiếu nại |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: tạo và phân loại ca hỗ trợ từ khách, khách sạn hoặc nhân viên; kênh tiếp nhận chưa quyết định. |
| Actor | ACT-09; ACT-12; ACT-01 |
| Trigger | Có yêu cầu hỗ trợ mới. |
| Preconditions | • Có quyền C |
| Main flow | 1. Tạo ca<br>2. Chọn phân loại<br>3. Liên kết đối tượng<br>4. Gán độ ưu tiên |
| Alternate / error flows | • Thiếu phân loại: không tạo |
| Postconditions | • Ca hỗ trợ có mã và phân loại |
| Business rules | SA-BR-019 |
| Data requirements | SA-DATA-010 |
| Authorization (đề xuất, deny by default) | ACT-09: C, R, U; ACT-12: C, R (ca của mình); ACT-01: C |
| Audit | case.created |
| Acceptance criteria (Proposed) | SA-FR-033.AC1: Mỗi ca có mã, phân loại và người tạo<br>SA-FR-033.AC2: Khách sạn chỉ thấy ca của khách sạn mình<br>SA-FR-033.AC3: Liên kết đặt phòng chỉ hiển thị khi người xem có quyền |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-57 → D-44 |

#### SA-FR-034 — Gán, chuyển cấp, xử lý và đóng ca

| Trường | Nội dung |
|---|---|
| ID | SA-FR-034 |
| Tên | Gán, chuyển cấp, xử lý và đóng ca |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: vòng đời ca SM-07: Mới, Đã phân loại, Đã gán, Đang xử lý, Chuyển cấp, Đã giải quyết, Đã đóng, Mở lại. |
| Actor | ACT-09; ACT-08 |
| Trigger | Người xử lý cập nhật ca. |
| Preconditions | • Ca tồn tại |
| Main flow | 1. Gán người<br>2. Cập nhật trạng thái<br>3. Ghi chú nội bộ<br>4. Đóng với kết luận |
| Alternate / error flows | • Đóng thiếu kết luận: chặn<br>• Mở lại có lý do |
| Postconditions | • Ca có lịch sử |
| Business rules | SA-BR-019 |
| Data requirements | SA-DATA-010 |
| Authorization (đề xuất, deny by default) | ACT-09: U; ACT-08: U (ca chuyển cấp) |
| Audit | case.status.changed |
| Acceptance criteria (Proposed) | SA-FR-034.AC1: Chuyển trạng thái chỉ theo đường hợp lệ SM-07<br>SA-FR-034.AC2: Ghi chú nội bộ không hiển thị cho khách<br>SA-FR-034.AC3: Mở lại có lý do |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-033 |
| OQ / Decision | OQ-57 → D-44 |

#### SA-FR-035 — Liên kết ca với đặt phòng/khách sạn và hạn chế can thiệp giao dịch

| Trường | Nội dung |
|---|---|
| ID | SA-FR-035 |
| Tên | Liên kết ca với đặt phòng/khách sạn và hạn chế can thiệp giao dịch |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: nhân viên hỗ trợ xem thông tin theo quyền, không tự ý đổi giao dịch hoặc đặt phòng nếu không có quyền nghiệp vụ tương ứng. |
| Actor | ACT-09 |
| Trigger | Mở ca có đối tượng liên quan. |
| Preconditions | • Có quyền R đối tượng |
| Main flow | 1. Mở liên kết<br>2. Hiển thị theo quyền<br>3. Đề xuất thay đổi cho người có quyền |
| Alternate / error flows | • Cố thao tác ngoài quyền: từ chối và ghi audit |
| Postconditions | • Hỗ trợ không thay đổi giao dịch trái quyền |
| Business rules | SA-BR-020 |
| Data requirements | SA-DATA-010 |
| Authorization (đề xuất, deny by default) | ACT-09: R; không U/X trên đặt phòng (đề xuất) |
| Audit | booking.viewed |
| Acceptance criteria (Proposed) | SA-FR-035.AC1: Nhân viên hỗ trợ không có API đổi trạng thái đặt phòng<br>SA-FR-035.AC2: Mọi lần xem đặt phòng từ ca được audit<br>SA-FR-035.AC3: Thông tin khách che theo quyền |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-033, SA-FR-008 |
| OQ / Decision | OQ-57 → D-44 |


### SA-C09 Tích hợp và tác vụ nền

#### SA-FR-036 — Trạng thái kết nối và lịch sử request/response

| Trường | Nội dung |
|---|---|
| ID | SA-FR-036 |
| Tên | Trạng thái kết nối và lịch sử request/response |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: khi có tích hợp ngoài, hiển thị trạng thái kết nối và lịch sử request/response đã lọc dữ liệu nhạy cảm; hiện chưa có tích hợp thực tế. |
| Actor | ACT-07; ACT-15 |
| Trigger | Mở “Tích hợp”. |
| Preconditions | • Có tích hợp được duyệt (OQ-44, OQ-52) |
| Main flow | 1. Hiển thị trạng thái<br>2. Lịch sử đã lọc<br>3. Kiểm tra kết nối |
| Alternate / error flows | • Kết nối lỗi: đánh dấu và cảnh báo |
| Postconditions | • Lịch sử không chứa dữ liệu nhạy cảm |
| Business rules | SA-BR-021 |
| Data requirements | SA-DATA-013 |
| Authorization (đề xuất, deny by default) | ACT-07: R, U; ACT-15: chỉ qua kênh xác thực của tích hợp (không giả định tồn tại) |
| Audit | integration.checked |
| Acceptance criteria (Proposed) | SA-FR-036.AC1: Lịch sử request/response không chứa secret hay dữ liệu cá nhân không cần thiết<br>SA-FR-036.AC2: Trạng thái kết nối có thời điểm kiểm tra<br>SA-FR-036.AC3: Chưa có tích hợp thì mục này hiển thị trạng thái trống rõ ràng |
| Priority · Phase | Could (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-44 → D-31, OQ-52 → D-39 |

#### SA-FR-037 — Hàng đợi tác vụ nền, retry và chạy lại có kiểm soát

| Trường | Nội dung |
|---|---|
| ID | SA-FR-037 |
| Tên | Hàng đợi tác vụ nền, retry và chạy lại có kiểm soát |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: theo dõi tác vụ nền, retry có giới hạn, idempotency, chạy lại thủ công có kiểm soát. |
| Actor | ACT-08; ACT-07 |
| Trigger | Tác vụ thất bại hoặc cần chạy lại. |
| Preconditions | • Có tác vụ |
| Main flow | 1. Xem tác vụ thất bại<br>2. Chọn chạy lại<br>3. Hệ thống dùng khóa idempotency<br>4. Ghi kết quả |
| Alternate / error flows | • Chạy lại tác vụ không idempotent: chặn |
| Postconditions | • Tác vụ có lịch sử |
| Business rules | SA-BR-022 |
| Data requirements | SA-DATA-014 |
| Authorization (đề xuất, deny by default) | ACT-08: R, U; ACT-07: U |
| Audit | job.rerun |
| Acceptance criteria (Proposed) | SA-FR-037.AC1: Chạy lại cùng khóa idempotency không tạo hiệu ứng thứ hai<br>SA-FR-037.AC2: Có giới hạn số lần retry<br>SA-FR-037.AC3: Mỗi lần chạy lại có người, lý do, kết quả |
| Priority · Phase | Could (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-58 → D-45 |

#### SA-FR-038 — Quản lý credentials và khóa API

| Trường | Nội dung |
|---|---|
| ID | SA-FR-038 |
| Tên | Quản lý credentials và khóa API |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: lưu và xoay credentials bằng cơ chế bảo mật; không bao giờ hiển thị secret dạng rõ; không đưa credentials giả vào tài liệu. |
| Actor | ACT-07 |
| Trigger | Quản trị thêm hoặc xoay khóa. |
| Preconditions | • Có kho bí mật (OQ-58) |
| Main flow | 1. Nhập hoặc tạo khóa<br>2. Hệ thống lưu qua cơ chế bảo mật<br>3. Chỉ hiển thị phần che<br>4. Xoay khóa |
| Alternate / error flows | • Lưu thất bại: không ghi nửa chừng |
| Postconditions | • Secret không lộ |
| Business rules | SA-BR-021 |
| Data requirements | SA-DATA-013 |
| Authorization (đề xuất, deny by default) | ACT-07: C, U, X |
| Audit | credential.rotated |
| Acceptance criteria (Proposed) | SA-FR-038.AC1: Secret không hiển thị dạng rõ trên giao diện, API, log<br>SA-FR-038.AC2: Xoay khóa vô hiệu khóa cũ theo lịch<br>SA-FR-038.AC3: Có audit |
| Priority · Phase | Could (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-58 → D-45 |


### SA-C10 Báo cáo quản trị

#### SA-FR-039 — Báo cáo tài khoản và hoạt động người dùng

| Trường | Nội dung |
|---|---|
| ID | SA-FR-039 |
| Tên | Báo cáo tài khoản và hoạt động người dùng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: số tài khoản theo trạng thái và hoạt động (tổng hợp, không cá nhân hóa mặc định). |
| Actor | ACT-07; ACT-11 |
| Trigger | Mở báo cáo. |
| Preconditions | • Có dữ liệu |
| Main flow | 1. Chọn kỳ<br>2. Tính<br>3. Hiển thị tổng hợp |
| Alternate / error flows | • Rỗng: thông báo |
| Postconditions | • Báo cáo tổng hợp |
| Business rules | SA-BR-023 |
| Data requirements | SA-DATA-001, SA-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-07/11: R |
| Audit | — |
| Acceptance criteria (Proposed) | SA-FR-039.AC1: Báo cáo mặc định chỉ có số liệu tổng hợp<br>SA-FR-039.AC2: Mỗi chỉ số có công thức và nguồn<br>SA-FR-039.AC3: Xem chi tiết cá nhân cần quyền V và audit |
| Priority · Phase | Could (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | — |

#### SA-FR-040 — Báo cáo đối tác, đặt phòng, sự cố và khiếu nại

| Trường | Nội dung |
|---|---|
| ID | SA-FR-040 |
| Tên | Báo cáo đối tác, đặt phòng, sự cố và khiếu nại |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: báo cáo đối tác theo trạng thái xác minh, hiệu quả đặt phòng, sự cố, khiếu nại. |
| Actor | ACT-07; ACT-08; ACT-11 |
| Trigger | Mở báo cáo. |
| Preconditions | • Có dữ liệu |
| Main flow | 1. Chọn bộ lọc<br>2. Tính<br>3. Hiển thị |
| Alternate / error flows | • Rỗng |
| Postconditions | • Báo cáo tổng hợp |
| Business rules | SA-BR-023 |
| Data requirements | HM-DATA-001, HM-DATA-011, SA-DATA-010 |
| Authorization (đề xuất, deny by default) | ACT-07/08/11: R |
| Audit | — |
| Acceptance criteria (Proposed) | SA-FR-040.AC1: Mỗi chỉ số có định nghĩa, nguồn dữ liệu, múi giờ<br>SA-FR-040.AC2: Tổng khớp chi tiết<br>SA-FR-040.AC3: Dữ liệu cá nhân chi tiết bị che |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-60 → D-47 |

#### SA-FR-041 — Xuất báo cáo theo quyền

| Trường | Nội dung |
|---|---|
| ID | SA-FR-041 |
| Tên | Xuất báo cáo theo quyền |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: xuất báo cáo cần quyền E; ghi audit; giới hạn dữ liệu. |
| Actor | ACT-07; ACT-08; ACT-10 |
| Trigger | Bấm “Xuất”. |
| Preconditions | • Có quyền E |
| Main flow | 1. Kiểm tra quyền<br>2. Áp masking<br>3. Tạo tệp<br>4. Ghi audit |
| Alternate / error flows | • Không có quyền: từ chối |
| Postconditions | • Tệp theo quyền |
| Business rules | SA-BR-008, SA-BR-023 |
| Data requirements | SA-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-07/08/10: E theo quyền |
| Audit | data.exported |
| Acceptance criteria (Proposed) | SA-FR-041.AC1: Người không có quyền E không xuất được cả qua API<br>SA-FR-041.AC2: Tệp che trường nhạy cảm nếu không có V<br>SA-FR-041.AC3: Mỗi lần xuất có audit |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-028 |
| OQ / Decision | OQ-50 → D-37 |


## 5. RBAC và cách ly tenant

- Mô hình: người dùng → gán vai trò trong một phạm vi (tenant) → vai trò gồm các quyền (tài nguyên, hành động). Ma trận đề xuất ở `01_ACTORS_AND_CAPABILITY_MAP.md` mục 3.
- **Deny by default, least privilege:** tài nguyên hoặc hành động không có quyền tường minh bị từ chối (SA-FR-008, SA-BR-006).
- **Thực thi ở backend/API**, không dựa vào việc ẩn nút trên giao diện.
- **Tenant isolation:** mọi truy vấn, báo cáo, xuất dữ liệu bị ràng buộc theo tenant; thử truy cập chéo bị từ chối và ghi audit (SA-FR-009).
- Mô hình tenant và vai trò cuối cùng chờ OQ-55.

## 6. Audit log

Sự kiện ghi (từ trường “Audit” của yêu cầu): `account.disabled`, `account.invited`, `account.locked`, `account.password.reset`, `account.unlocked`, `account.updated`, `approval.selfblocked`, `auditlog.viewed`, `authz.denied`, `booking.cancelled`, `booking.confirmed`, `booking.expired`, `booking.noshow`, `booking.pending.warned`, `booking.rejected`, `booking.viewed`, `booking.viewed (vai trò hỗ trợ)`, `cancelpolicy.changed`, `case.created`, `case.status.changed`, `catalog.changed`, `charge.changed`, `commercial.model.changed`, `config.approved`, `config.flag.changed`, `config.notification.changed`, `config.param.changed`, `config.rolledback`, `consent.recorded`, `content.published`, `credential.rotated`, `data.exported`, `dataclass.changed`, `dsr.processed`, `finance.exported`, `finance.report.viewed`, `hold.created`, `hold.expired`, `hold.released`, `incident.created`, `incident.status.changed`, `integration.checked`, `inventory.blackout.set`, `inventory.closed`, `inventory.conflict`, `inventory.opened`, `inventory.recomputed`, `inventory.sync`, `job.rerun`, `monitor.case.assigned`, `notification.failed`, `notification.sent`, `opsnote.created`, `partner.approved`, `partner.created`, `partner.document.uploaded`, `partner.document.viewed`, `partner.moreinfo`, `partner.rejected`, `partner.restored`, `partner.submitted`, `partner.suspended`, `partner.updated`, `pickup.updated`, `policy.changed`, `quality.appeal`, `quality.incident.created`, `rate.changed`, `rate.plan.changed`, `reminder.sent`, `role.assigned`, `role.changed`, `role.revoked`, `roomstatus.changed`, `roomtype.capacity.changed`, `roomtype.created`, `roomtype.disabled`, `roomtype.status.changed`, `roomtype.updated`, `sensitive.revealed`, `session.revoked`, `settlement.reconciled`, `stay.checkin`, `stay.checkout`, `stay.late`, `stay.noshow`, `tenant.violation.attempt`.

Trường đề xuất của mỗi bản ghi:

| Trường | Ý nghĩa |
|---|---|
| actor | Ai thực hiện (tài khoản, vai trò, tenant) hoặc “hệ thống” |
| action | Hành động theo danh mục sự kiện |
| target | Đối tượng bị tác động (loại và mã) |
| timestamp | Thời điểm, múi giờ nhất quán |
| result | Thành công, thất bại, bị từ chối |
| reason | Lý do (bắt buộc với hành động nhạy cảm) |
| correlation_id | Mã truy vết xuyên suốt yêu cầu |
| before/after | Giá trị trước/sau cho trường không nhạy cảm; trường nhạy cảm chỉ ghi “đã đổi” |

Không ghi mật khẩu, token, thông tin xác thực hay dữ liệu nhạy cảm không cần thiết. Đề xuất: chỉ thêm, truy vấn theo quyền, thời hạn lưu và bằng chứng toàn vẹn do chính sách quyết định (OQ-49).

## 7. Quản lý cấu hình và quy trình phê duyệt

Cấu hình có tác động đến quyền lợi khách hoặc luồng đặt phòng đi qua SM-06 (soạn, phê duyệt, hiệu lực, rollback). Phân biệt:

| Loại | Ví dụ | Kiểm soát |
|---|---|---|
| Cấu hình vận hành | Cờ tính năng, mẫu thông báo, danh mục tiện ích | Quyền U của vai trò; audit; phê duyệt nếu ảnh hưởng nghiệp vụ |
| Tham số nghiệp vụ | Thời hạn giữ chỗ, hết hạn yêu cầu | Phê duyệt, phiên bản, hiệu lực, rollback; giá trị do PO quyết định (OQ-45) |
| Nội dung có tác động pháp lý | Quyền lợi hành khách (MB-03) | Chỉ sau khi PO duyệt D-13; không bật khi chưa duyệt |

Chống tự phê duyệt nếu D-34 (maker-checker) được chọn (SA-FR-014).

## 8. Quy tắc nghiệp vụ (SA-BR)

| ID | Tên | Quy tắc (đề xuất) | OQ |
|---|---|---|---|
| SA-BR-001 | Định danh duy nhất | Định danh đăng nhập của tài khoản duy nhất trong toàn hệ thống. | OQ-48 |
| SA-BR-002 | Không vượt quyền | Không cấp hoặc gán vai trò vượt quyền của người cấp; không tự nâng quyền của chính mình. | OQ-55 |
| SA-BR-003 | Khóa và vô hiệu hóa | Khóa hoặc vô hiệu hóa thu hồi mọi phiên; không vô hiệu hóa quản trị viên cuối cùng của tenant. | — |
| SA-BR-004 | Phiên và đặt lại | Liên kết đặt lại dùng một lần, hết hạn; token và mật khẩu không xuất hiện trong log; phiên hết hạn theo thời gian cấu hình. | OQ-48 |
| SA-BR-005 | Vai trò đang dùng | Vai trò đang gán không xóa được; thay đổi vai trò đi qua phê duyệt. | OQ-47 |
| SA-BR-006 | Từ chối mặc định | Mọi tài nguyên và hành động không có quyền tường minh bị từ chối; kiểm quyền thực hiện ở máy chủ. | — |
| SA-BR-007 | Cách ly tenant | Không đọc hoặc ghi chéo tenant; người dùng khách sạn chỉ truy cập dữ liệu thuộc phạm vi được ủy quyền. | OQ-55 |
| SA-BR-008 | Dữ liệu nhạy cảm | Trường chưa phân loại coi là nhạy cảm; xem rõ cần quyền V, lý do và audit. | OQ-50 |
| SA-BR-009 | Duyệt và tạm ngưng | Từ chối, yêu cầu bổ sung hoặc tạm ngưng cần lý do; mỗi yêu cầu duyệt chỉ có một kết quả. | — |
| SA-BR-010 | Tạm ngưng không hủy | Tạm ngưng đối tác không tự hủy đặt phòng đã xác nhận. | OQ-56 |
| SA-BR-011 | Người lập khác người duyệt | Nếu chính sách maker-checker được duyệt, người lập thay đổi không được tự duyệt. | OQ-47 |
| SA-BR-012 | Danh mục | Mục danh mục đang được tham chiếu chỉ ngừng dùng, không xóa. | — |
| SA-BR-013 | Cấu hình có kiểm soát | Cấu hình có phiên bản, hiệu lực, người soạn, người duyệt và khả năng rollback; chỉ áp dụng cho yêu cầu tạo sau thời điểm hiệu lực. | OQ-47 |
| SA-BR-014 | Nội dung có nguồn | Nội dung hiển thị cho khách có nguồn và ngày hiệu lực; nội dung quyền lợi hành khách cần phê duyệt riêng (MB-03 đang Blocked, D-13). | OQ-47 |
| SA-BR-015 | Số liệu giám sát | Mỗi số liệu giám sát có nguồn và công thức; không hiển thị dữ liệu nhạy cảm ngoài quyền. | OQ-58 |
| SA-BR-016 | Đóng sự cố | Sự cố hệ thống chỉ đóng khi có kết luận. | — |
| SA-BR-017 | Audit chỉ thêm | Audit log chỉ ghi thêm; không ghi mật khẩu, token, secret hoặc dữ liệu nhạy cảm không cần thiết. | OQ-49 |
| SA-BR-018 | Yêu cầu của chủ thể dữ liệu | Chỉ xử lý theo chính sách và căn cứ pháp lý đã được xác minh; có hạn xử lý. | OQ-50 |
| SA-BR-019 | Ca hỗ trợ | Ca hỗ trợ có phân loại; chuyển trạng thái theo SM-07; ghi chú nội bộ không hiển thị cho khách. | OQ-57 |
| SA-BR-020 | Hỗ trợ không đổi giao dịch | Nhân sự hỗ trợ không tự ý thay đổi giao dịch hoặc đặt phòng nếu không có quyền nghiệp vụ tương ứng. | OQ-57 |
| SA-BR-021 | Secret | Secret và credentials không hiển thị dạng rõ; lịch sử request/response được lọc dữ liệu nhạy cảm. | OQ-58 |
| SA-BR-022 | Chạy lại tác vụ | Chạy lại tác vụ nền phải idempotent và có giới hạn số lần. | OQ-58 |
| SA-BR-023 | Báo cáo quản trị | Báo cáo mặc định ở mức tổng hợp; xem chi tiết cá nhân cần quyền V và audit; mọi chỉ số có định nghĩa và nguồn. | OQ-60 |

## 9. Máy trạng thái liên quan

SM-05 (tài khoản), SM-06 (thay đổi cấu hình), SM-07 (ca hỗ trợ, sự cố), SM-01 (duyệt đối tác). Chi tiết ở `05_DATA_MODEL_AND_STATE_MACHINES.md`.

## 10. Acceptance criteria và truy vết

Tiêu chí đề xuất gắn theo từng yêu cầu (`<ID>.AC<n>`), không thay thế AC của SRS hiện hành. Truy vết ở `06_REQUIREMENTS_TRACEABILITY.md`.
