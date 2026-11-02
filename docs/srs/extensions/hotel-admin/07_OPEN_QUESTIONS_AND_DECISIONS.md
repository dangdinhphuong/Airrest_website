# 07. Câu hỏi mở và quyết định đề xuất

Phiên bản v0.1 Draft · 2026-10-26 · Trạng thái **DRAFT, chưa được phê duyệt**. Tài liệu bổ sung độc lập, không thay thế SRS hiện hành.

Số thứ tự tiếp nối OQ-42 và D-29 của SRS hiện hành. Không có quyết định nào ở đây đã được phê duyệt; cột “khuyến nghị” là của người soạn. Các câu hỏi này chưa được đưa vào `docs/srs/OPEN_QUESTIONS.md` hay `PRODUCT_DECISION_REGISTER.md`; việc đó là bước tích hợp sau khi PO đồng ý.

## 1. Tổng hợp

| OQ | Quyết định | Chủ đề | Thẩm quyền | Ưu tiên giải quyết | Yêu cầu bị tác động | Trong đó Blocked |
|---|---|---|---|---|---|---|
| OQ-43 | D-30 | Mô hình thương mại và thanh toán | PO + Finance + Legal | P1 | 7 | 7 |
| OQ-44 | D-31 | Khách sạn có API/PMS/channel manager không | PO + Technical Architect | P1 | 2 | 2 |
| OQ-45 | D-32 | Thời hạn giữ chỗ và hết hạn yêu cầu | PO | P0 | 5 | 4 |
| OQ-46 | D-33 | Chính sách hủy, hoàn tiền, đổi lịch và khách không đến | PO + Legal | P1 | 3 | 3 |
| OQ-47 | D-34 | Phân tách người lập và người duyệt (maker-checker) | PO + Security | P0 | 7 | 3 |
| OQ-48 | D-35 | Xác thực và quản lý phiên | Technical Architect + Security | P0 | 4 | 1 |
| OQ-49 | D-36 | Lưu giữ, bất biến và truy cập audit log | Legal + Security | P1 | 3 | 1 |
| OQ-50 | D-37 | Dữ liệu cá nhân của khách lưu trú, quyền xem và xuất | PO + Legal + Security | P0 | 9 | 4 |
| OQ-51 | D-38 | Hồ sơ pháp lý đối tác và quy trình xác minh | PO + Legal | P1 | 5 | 1 |
| OQ-52 | D-39 | Kênh thông báo và nhà cung cấp | PO + Technical Architect | P1 | 5 | 5 |
| OQ-53 | D-40 | Chỉ tiêu hiệu năng, công suất và quy mô | PO + Technical Architect | P1 | 0 | 0 |
| OQ-54 | D-41 | Ranh giới giữa Airrest và PMS của khách sạn | PO | P1 | 5 | 1 |
| OQ-55 | D-42 | Mô hình vai trò và tenant | PO + Technical Architect + Security | P0 | 5 | 0 |
| OQ-56 | D-43 | Ngưỡng chất lượng đối tác và quy tắc tạm ngưng | PO | P2 | 4 | 1 |
| OQ-57 | D-44 | Hỗ trợ và khiếu nại: SLA, kênh và quyền can thiệp | PO | P2 | 4 | 0 |
| OQ-58 | D-45 | Hạ tầng logging, monitoring, backup hiện có | Technical Architect | P0 | 4 | 2 |
| OQ-59 | D-46 | Quan hệ với các mục đã có trong SRS v0.6 và phạm vi prototype hay sản phẩm thật | PO | P0 | 3 | 0 |
| OQ-60 | D-47 | Múi giờ, tiền tệ và ngôn ngữ | PO | P2 | 5 | 1 |
| OQ-61 | D-48 | Phân kỳ và ưu tiên chính thức | PO | P1 | 1 | 0 |
| OQ-62 | D-49 | Giá tổng và hiển thị thuế phí | PO | P1 | 3 | 1 |

## 2. Cần Legal, Security hoặc Technical Architect

| Bên | OQ |
|---|---|
| Legal | OQ-43, OQ-46, OQ-49, OQ-50, OQ-51 |
| Security | OQ-47, OQ-48, OQ-49, OQ-50, OQ-55 |
| Technical Architect | OQ-44, OQ-48, OQ-52, OQ-53, OQ-55, OQ-58 |
| PO | Tất cả; đặc biệt OQ-59, OQ-45, OQ-61 |

## 3. Chi tiết

### OQ-43 / D-30: Mô hình thương mại và thanh toán

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Finance + Legal (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** SRS hiện hành: không giao dịch thật (MB-07), mọi thanh toán là mô phỏng; chưa có mô hình thu tiền, hoa hồng, hóa đơn.
- **Câu hỏi:** Khách trả trực tiếp cho khách sạn, qua Airrest, hay hỗn hợp? Airrest thu phí hay hoa hồng? Ai xuất hóa đơn?
- **Phương án:**
  - **A.** Khách trả trực tiếp khách sạn; Airrest không chạm tiền; không đối soát tiền trong Airrest
  - **B.** Khách trả qua Airrest; Airrest đối soát với khách sạn
  - **C.** Hỗn hợp theo đối tác
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Khớp MVP “không giao dịch thật” và không đòi giấy phép/đối soát tiền; B, C cần phân tích pháp lý và tài chính.
- **Tác động nếu chưa quyết định:** HM-FR-036…038, HM-FR-048 giữ Blocked; HM-FR-011, 013, 027 thiếu phần hoàn tiền.
- **Yêu cầu bị tác động:** HM-FR-011, HM-FR-013, HM-FR-027, HM-FR-036, HM-FR-037, HM-FR-038, HM-FR-048
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-011, HM-FR-013, HM-FR-027, HM-FR-036, HM-FR-037, HM-FR-038, HM-FR-048

### OQ-44 / D-31: Khách sạn có API/PMS/channel manager không

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Technical Architect (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** Chưa có tài liệu về khả năng tích hợp của đối tác; SRS hiện hành không có tích hợp thật (AC-063).
- **Câu hỏi:** Có đối tác nào có API? Ai là nguồn sự thật của tồn phòng?
- **Phương án:**
  - **A.** Không tích hợp; tồn phòng nhập tay trên Airrest
  - **B.** Hỗ trợ tích hợp cho đối tác có API, nhập tay cho phần còn lại
  - **C.** Bắt buộc tích hợp
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Không giả định hạ tầng của đối tác; có thể mở rộng sau.
- **Tác động nếu chưa quyết định:** HM-FR-020, SA-FR-036 giữ Blocked.
- **Yêu cầu bị tác động:** HM-FR-020, SA-FR-036
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-020, SA-FR-036

### OQ-45 / D-32: Thời hạn giữ chỗ và hết hạn yêu cầu

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P0
- **Bối cảnh và căn cứ:** Mô phỏng hiện tại dùng 15 phút (D-04, tham số mô phỏng); chưa có giá trị thật.
- **Câu hỏi:** Thời hạn giữ chỗ bao lâu? Hết hạn yêu cầu bao lâu? Có nhắc không?
- **Phương án:**
  - **A.** Một thời hạn chung cấu hình được
  - **B.** Thời hạn riêng theo đối tác
  - **C.** Không hết hạn (chờ thủ công)
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Đơn giản, cấu hình được qua SA-FR-016; C để tồn treo.
- **Tác động nếu chưa quyết định:** HM-FR-018, 025, 043, SA-FR-016 giữ Blocked; SM-03 thiếu điều kiện expire.
- **Yêu cầu bị tác động:** HM-FR-018, HM-FR-025, HM-FR-043, SA-FR-016, SA-FR-022
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-018, HM-FR-025, HM-FR-043, SA-FR-016

### OQ-46 / D-33: Chính sách hủy, hoàn tiền, đổi lịch và khách không đến

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Legal (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** MVP không quy định hủy đặt chỗ (OQ-29 đã chốt theo MVP).
- **Câu hỏi:** Cho phép hủy/đổi không? Ai quyết chính sách? Khách không đến xử lý thế nào?
- **Phương án:**
  - **A.** Không hỗ trợ hủy/đổi trong giai đoạn đầu
  - **B.** Hỗ trợ theo mẫu chính sách do Airrest duyệt
  - **C.** Mỗi khách sạn tự quy định
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Giữ nguyên MVP; B cần OQ-43; C khó bảo vệ quyền lợi khách.
- **Tác động nếu chưa quyết định:** HM-FR-013, 027, 031 giữ Blocked.
- **Yêu cầu bị tác động:** HM-FR-013, HM-FR-027, HM-FR-031
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-013, HM-FR-027, HM-FR-031

### OQ-47 / D-34: Phân tách người lập và người duyệt (maker-checker)

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Security (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P0
- **Bối cảnh và căn cứ:** Chưa có quy trình phê duyệt thay đổi nội bộ.
- **Câu hỏi:** Thay đổi nào cần hai người? Ai là người duyệt?
- **Phương án:**
  - **A.** Áp dụng cho duyệt đối tác, cấu hình ảnh hưởng quyền lợi, thay đổi vai trò
  - **B.** Chỉ cấu hình ảnh hưởng quyền lợi
  - **C.** Không áp dụng
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Giảm rủi ro thay đổi sai mà không đòi duyệt mọi thay đổi nhỏ.
- **Tác động nếu chưa quyết định:** SA-FR-014, 016…018, 020 giữ Blocked hoặc thiếu người duyệt.
- **Yêu cầu bị tác động:** HM-FR-003, SA-FR-006, SA-FR-012, SA-FR-014, SA-FR-016, SA-FR-017, SA-FR-020
- **Yêu cầu đang Blocked bởi OQ này:** SA-FR-014, SA-FR-016, SA-FR-017

### OQ-48 / D-35: Xác thực và quản lý phiên

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** Technical Architect + Security (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P0
- **Bối cảnh và căn cứ:** Chưa có kiến trúc xác thực; D-25 của SRS v0.6 (đăng nhập mô phỏng) chưa được duyệt.
- **Câu hỏi:** Cơ chế đăng nhập (mật khẩu, mã dùng một lần, SSO, MFA)? Thời hạn phiên? Ngưỡng khóa?
- **Phương án:**
  - **A.** Đăng nhập mô phỏng cho prototype, không bảo mật thật
  - **B.** Tài khoản và mật khẩu kèm thời hạn phiên cấu hình
  - **C.** B kèm xác thực hai lớp cho quản trị
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **C**. Nếu hệ thống chạy thật, quản trị cần bảo vệ mạnh; nếu chỉ prototype thì A (xem OQ-59).
- **Tác động nếu chưa quyết định:** SA-FR-004 giữ Blocked; SA-FR-001…005 thiếu cơ chế.
- **Yêu cầu bị tác động:** SA-FR-001, SA-FR-003, SA-FR-004, SA-FR-005
- **Yêu cầu đang Blocked bởi OQ này:** SA-FR-004

### OQ-49 / D-36: Lưu giữ, bất biến và truy cập audit log

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** Legal + Security (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** Chưa có chính sách lưu giữ log.
- **Câu hỏi:** Lưu bao lâu? Ai được xem? Cơ chế bất biến?
- **Phương án:**
  - **A.** Lưu theo thời hạn do Legal quy định; quản trị và kiểm toán xem
  - **B.** Như A, thêm bằng chứng toàn vẹn (chuỗi băm)
  - **C.** Lưu ngắn hạn
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **B**. Giá trị kiểm toán cao; thời hạn do Legal.
- **Tác động nếu chưa quyết định:** SA-FR-027 giữ Blocked; SA-FR-025/026 thiếu thời hạn.
- **Yêu cầu bị tác động:** SA-FR-025, SA-FR-026, SA-FR-027
- **Yêu cầu đang Blocked bởi OQ này:** SA-FR-027

### OQ-50 / D-37: Dữ liệu cá nhân của khách lưu trú, quyền xem và xuất

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Legal + Security (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P0
- **Bối cảnh và căn cứ:** MB-19 và BR-002 cấm thu số điện thoại, email; khách sạn có thể cần liên hệ khách. Luật 91/2025 mới được tham khảo một phần (Điều 2, 9, 19); chưa kết luận tuân thủ.
- **Câu hỏi:** Trường dữ liệu nào được thu? Căn cứ xử lý? Khách sạn, lái xe, hỗ trợ được xem gì? Ai xuất được?
- **Phương án:**
  - **A.** Giữ nguyên tắc tối thiểu: chỉ tên gọi, không liên hệ
  - **B.** Cho phép một kênh liên hệ tối thiểu với căn cứ rõ
  - **C.** Thu đầy đủ như khách sạn thông thường
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Khớp MVP; B, C cần legal review và đổi BR-002.
- **Tác động nếu chưa quyết định:** SA-FR-010, 029…032, HM-FR-022, 035, 049 bị chặn hoặc thiếu trường.
- **Yêu cầu bị tác động:** HM-FR-022, HM-FR-035, HM-FR-049, SA-FR-010, SA-FR-028, SA-FR-029, SA-FR-031, SA-FR-032, SA-FR-041
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-035, SA-FR-029, SA-FR-031, SA-FR-032

### OQ-51 / D-38: Hồ sơ pháp lý đối tác và quy trình xác minh

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Legal (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** Chưa biết loại giấy tờ nào bắt buộc và ai xác minh.
- **Câu hỏi:** Tài liệu nào bắt buộc? Xác minh thủ công hay bên thứ ba? Điều kiện mở lại hồ sơ bị từ chối?
- **Phương án:**
  - **A.** Danh mục tài liệu do PO công bố, xác minh thủ công
  - **B.** Xác minh bằng dịch vụ bên thứ ba
  - **C.** Không yêu cầu tài liệu
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Đủ cho giai đoạn đầu mà không thêm tích hợp.
- **Tác động nếu chưa quyết định:** HM-FR-004 giữ Blocked; SM-01 thiếu điều kiện mở lại.
- **Yêu cầu bị tác động:** HM-FR-001, HM-FR-002, HM-FR-003, HM-FR-004, SA-FR-012
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-004

### OQ-52 / D-39: Kênh thông báo và nhà cung cấp

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Technical Architect (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** SRS hiện hành: không SMS/email; OQ-09 chưa chốt kênh.
- **Câu hỏi:** Dùng kênh nào (trong ứng dụng, email, SMS)? Nhà cung cấp nào?
- **Phương án:**
  - **A.** Chỉ thông báo trong ứng dụng
  - **B.** Trong ứng dụng cộng email
  - **C.** Cộng SMS
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Không thêm tích hợp ngoài và không cần số điện thoại.
- **Tác động nếu chưa quyết định:** HM-FR-042…044, SA-FR-018 giữ Blocked.
- **Yêu cầu bị tác động:** HM-FR-042, HM-FR-043, HM-FR-044, SA-FR-018, SA-FR-036
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-042, HM-FR-043, HM-FR-044, SA-FR-018, SA-FR-036

### OQ-53 / D-40: Chỉ tiêu hiệu năng, công suất và quy mô

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Technical Architect (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** Chưa có số liệu về số khách sạn, phòng, đặt phòng, người dùng đồng thời.
- **Câu hỏi:** Quy mô dự kiến và chỉ tiêu cần đạt là gì?
- **Phương án:**
  - **A.** PO cung cấp quy mô; dùng giá trị khởi điểm trong SH-NFR-018…024 để đo
  - **B.** Chỉ đo, chưa đặt chỉ tiêu
  - **C.** Đặt chỉ tiêu cứng ngay
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Có căn cứ đo mà không cam kết sớm.
- **Tác động nếu chưa quyết định:** SH-NFR-018…024, 031 chưa kiểm chứng được.
- **Yêu cầu bị tác động:** —
- **Yêu cầu đang Blocked bởi OQ này:** —

### OQ-54 / D-41: Ranh giới giữa Airrest và PMS của khách sạn

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** Nhận/trả phòng, dọn phòng, bàn giao ca thường thuộc PMS.
- **Câu hỏi:** Airrest có làm vận hành lưu trú (HM-06) không?
- **Phương án:**
  - **A.** Không: chỉ quản lý đặt phòng; vận hành ở PMS khách sạn
  - **B.** Chỉ nhận/trả phòng để đóng vòng đời
  - **C.** Làm toàn bộ
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **B**. Đủ để đóng vòng đời đặt phòng; tránh xây PMS.
- **Tác động nếu chưa quyết định:** HM-FR-029…033 giữ Deferred; SM-04 chưa quyết định.
- **Yêu cầu bị tác động:** HM-FR-029, HM-FR-030, HM-FR-031, HM-FR-032, HM-FR-033
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-031

### OQ-55 / D-42: Mô hình vai trò và tenant

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO + Technical Architect + Security (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P0
- **Bối cảnh và căn cứ:** Một tài khoản thuộc một hay nhiều khách sạn? Có chuỗi khách sạn? Danh sách vai trò ứng viên chưa cuối cùng.
- **Câu hỏi:** Mô hình tenant và vai trò cuối cùng?
- **Phương án:**
  - **A.** Một tenant = một khách sạn; một tài khoản một tenant
  - **B.** Tenant = tổ chức, nhiều khách sạn; tài khoản nhiều khách sạn
  - **C.** A trước, B về sau
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **C**. Bắt đầu đơn giản, mô hình dữ liệu để chỗ mở rộng.
- **Tác động nếu chưa quyết định:** Ma trận quyền, SA-FR-006…009, SH-NFR-001…003 thiếu nền.
- **Yêu cầu bị tác động:** HM-FR-001, SA-FR-001, SA-FR-006, SA-FR-007, SA-FR-009
- **Yêu cầu đang Blocked bởi OQ này:** —

### OQ-56 / D-43: Ngưỡng chất lượng đối tác và quy tắc tạm ngưng

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P2
- **Bối cảnh và căn cứ:** Chưa có ngưỡng; không được tự đặt.
- **Câu hỏi:** Chỉ số nào dùng, ngưỡng nào, ai quyết tạm ngưng?
- **Phương án:**
  - **A.** Chỉ ghi nhận và hiển thị; tạm ngưng thủ công
  - **B.** Cảnh báo tự động khi vượt ngưỡng, tạm ngưng thủ công
  - **C.** Tự động tạm ngưng
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Không tự động khóa đối tác khi chưa có ngưỡng được duyệt.
- **Tác động nếu chưa quyết định:** HM-FR-039…041 một phần Blocked; SA-FR-013 thiếu tiêu chí.
- **Yêu cầu bị tác động:** HM-FR-039, HM-FR-040, HM-FR-041, SA-FR-013
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-040

### OQ-57 / D-44: Hỗ trợ và khiếu nại: SLA, kênh và quyền can thiệp

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P2
- **Bối cảnh và căn cứ:** Chưa có SLA hay kênh tiếp nhận; không được cho hỗ trợ tự đổi giao dịch.
- **Câu hỏi:** Kênh tiếp nhận, thời hạn xử lý, quyền của nhân viên hỗ trợ?
- **Phương án:**
  - **A.** Kênh trong ứng dụng; SLA đo nhưng chưa cam kết; hỗ trợ chỉ đọc giao dịch
  - **B.** Thêm kênh ngoài và SLA cam kết
  - **C.** Hỗ trợ được đổi giao dịch có kiểm soát
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Khớp nguyên tắc least privilege.
- **Tác động nếu chưa quyết định:** SA-FR-033…035 thiếu SLA và kênh.
- **Yêu cầu bị tác động:** HM-FR-041, SA-FR-033, SA-FR-034, SA-FR-035
- **Yêu cầu đang Blocked bởi OQ này:** —

### OQ-58 / D-45: Hạ tầng logging, monitoring, backup hiện có

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** Technical Architect (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P0
- **Bối cảnh và căn cứ:** Chưa có thông tin hạ tầng; không giả định đã có.
- **Câu hỏi:** Hạ tầng nào đã có? RPO/RTO yêu cầu?
- **Phương án:**
  - **A.** Kiến trúc sư xác nhận hiện trạng trước khi chốt SH-NFR-025, 034, 035
  - **B.** Coi như chưa có, thiết kế mới
  - **C.** Dùng dịch vụ ngoài
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Tránh đặc tả điều đã có hoặc không có.
- **Tác động nếu chưa quyết định:** SA-FR-021, 023, 037, 038 và SH-NFR-025…027, 034…035 Blocked.
- **Yêu cầu bị tác động:** SA-FR-021, SA-FR-023, SA-FR-037, SA-FR-038
- **Yêu cầu đang Blocked bởi OQ này:** SA-FR-021, SA-FR-038

### OQ-59 / D-46: Quan hệ với các mục đã có trong SRS v0.6 và phạm vi prototype hay sản phẩm thật

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P0
- **Bối cảnh và căn cứ:** SRS v0.6 đã có ACT-05/06, FR-024…034, BR-015…017, NFR-010, DR-010…012, UIR-012…014, D-25…D-29 và OQ-38…OQ-42; MB-16 loại “tài khoản/điểm/voucher B2B”; SRS hiện hành mô tả prototype dữ liệu mô phỏng, chưa quyết định backend.
- **Câu hỏi:** Gói mở rộng này thay thế, tinh chỉnh hay chạy song song với các mục v0.6? Tài khoản đối tác có nằm ngoài MB-16 không? Đây là prototype có nhãn mô phỏng hay sản phẩm thật?
- **Phương án:**
  - **A.** Gói này tinh chỉnh các mục v0.6 (ánh xạ ở 06_REQUIREMENTS_TRACEABILITY); PO xác nhận tài khoản đối tác không thuộc MB-16; phạm vi prototype có nhãn mô phỏng trước
  - **B.** Gói này thay thế các mục v0.6
  - **C.** Sản phẩm thật ngay (cần quyết định hạ tầng, pháp lý)
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Không làm mất các quyết định và tài liệu đã có; không đổi phạm vi lớn khi chưa quyết định.
- **Tác động nếu chưa quyết định:** Toàn bộ gói; đặc biệt phân kỳ và tích hợp vào SRS chính.
- **Yêu cầu bị tác động:** HM-FR-023, SA-FR-001, SA-FR-008
- **Yêu cầu đang Blocked bởi OQ này:** —

### OQ-60 / D-47: Múi giờ, tiền tệ và ngôn ngữ

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P2
- **Bối cảnh và căn cứ:** SRS hiện hành dùng tiếng Việt, giờ mô phỏng; chưa nói đa tiền tệ.
- **Câu hỏi:** Múi giờ báo cáo? Tiền tệ? Có song ngữ không (OQ-01 đã chốt theo MVP: không)?
- **Phương án:**
  - **A.** Múi giờ Việt Nam, VND, tiếng Việt
  - **B.** Cấu hình theo đối tác
  - **C.** Đa tiền tệ
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Khớp phạm vi hiện tại.
- **Tác động nếu chưa quyết định:** HM-FR-009, 045, SA-FR-040, SH-NFR-036 thiếu mặc định.
- **Yêu cầu bị tác động:** HM-FR-009, HM-FR-011, HM-FR-029, HM-FR-045, SA-FR-040
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-011

### OQ-61 / D-48: Phân kỳ và ưu tiên chính thức

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** SRS hiện hành dùng MoSCoW và nhãn Sprint (định nghĩa Sprint chưa có, OQ-28).
- **Câu hỏi:** Phân kỳ Foundation, Hotel Operations, System Operations, Advanced có được chấp nhận? MoSCoW chính thức?
- **Phương án:**
  - **A.** Chấp nhận phân kỳ đề xuất, MoSCoW là đề xuất
  - **B.** PO tự đặt lại
  - **C.** Gộp một đợt
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Foundation là điều kiện cho phần còn lại.
- **Tác động nếu chưa quyết định:** Mọi ưu tiên trong gói này là Proposed.
- **Yêu cầu bị tác động:** HM-FR-010
- **Yêu cầu đang Blocked bởi OQ này:** —

### OQ-62 / D-49: Giá tổng và hiển thị thuế phí

- **Trạng thái:** Mở (OQ); quyết định Pending PO (chưa ai duyệt)
- **Người có thẩm quyền quyết định:** PO (chưa xác định cụ thể; OQ-20 của SRS hiện hành)
- **Mức ưu tiên giải quyết:** P1
- **Bối cảnh và căn cứ:** SRS hiện hành: giá tổng nhất quán (BR-005) và giả định 1 phòng, 1 đêm, 2 người lớn (D-06 Simulation Parameter).
- **Câu hỏi:** Giá tổng đã gồm thuế phí hay cộng thêm? Giả định lưu trú thế nào khi có giá theo số khách?
- **Phương án:**
  - **A.** Giá tổng đã gồm thuế phí; giữ giả định D-06
  - **B.** Hiển thị tách giá và phí
  - **C.** Giá theo số khách thực tế
- **Khuyến nghị của người soạn (chưa phải quyết định):** phương án **A**. Khớp BR-005 và MVP.
- **Tác động nếu chưa quyết định:** HM-FR-009…011 chưa đặc tả được cách tính hiển thị.
- **Yêu cầu bị tác động:** HM-FR-009, HM-FR-010, HM-FR-011
- **Yêu cầu đang Blocked bởi OQ này:** HM-FR-011

## 4. Quyết định chưa có OQ riêng nhưng liên quan

D-13 (gỡ Blocked MB-03/MB-20), D-26 (lái xe và MB-15), D-27 (vai trò của hãng): đây là các quyết định đã có trong SRS hiện hành mà gói này phụ thuộc. Các quyết định D-30 đến D-49 được trình bày ở mục 3.
