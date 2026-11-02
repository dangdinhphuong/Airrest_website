# Gói mở rộng SRS Airrest: Quản lý khách sạn và Quản trị hệ thống

Phiên bản v0.1 Draft · 2026-10-26 · Trạng thái **DRAFT, chưa được phê duyệt**. Tài liệu bổ sung độc lập, không thay thế SRS hiện hành.

## 1. Mục tiêu và phạm vi

Đặc tả đề xuất cho hai phân hệ mới của Airrest: **Hotel Management** (quản lý khách sạn/đối tác lưu trú) và **System Administration** (quản trị hệ thống), cùng các yêu cầu phi chức năng dùng chung, mô hình dữ liệu logic và máy trạng thái. Đây là **phân tích và thiết kế SRS**, không phải triển khai: không có mã, không có tích hợp, không có schema vật lý.

Mọi nội dung trong gói này là **Proposed**, **Blocked** hoặc **Deferred**. Chưa có mục nào được PO, Legal, Security hoặc Technical Architect phê duyệt; không mục nào được trình bày như quyết định chính thức.

## 2. Quan hệ với SRS hiện hành

- Gói này là **tài liệu bổ sung độc lập**. Không sửa `docs/MVP.md`, không ghi đè `docs/srs/*.md`, không đổi quyết định đã có.
- SRS v0.6 đã có bản đề xuất sơ bộ cho ba tác nhân (ACT-05, ACT-06, FR-024 đến FR-034, BR-015 đến BR-017, NFR-010, DR-010 đến DR-012, UIR-012 đến UIR-014, D-25 đến D-29, OQ-38 đến OQ-42). Gói này **tinh chỉnh và mở rộng** các mục đó; bảng ánh xạ nằm ở `06_REQUIREMENTS_TRACEABILITY.md` mục 3. Việc hợp nhất, thay thế hoặc giữ song song là quyết định của PO (OQ-59, D-46).
- Vị trí tích hợp đề xuất sau khi PO duyệt: SRS mục 3.6 trỏ tới gói này; các mục FR-024…FR-034 được thay bằng tham chiếu tới HM-FR/SA-FR. Chưa thực hiện.

### Xung đột và ràng buộc của SRS hiện hành cần PO xác nhận

| Ràng buộc hiện hành | Xung đột với gói này | OQ/quyết định |
|---|---|---|
| MB-16 “Tài khoản/điểm/voucher B2B” (Won’t, Đã loại; lý do “cần tích hợp/đối tác”) | Tài khoản đối tác và quản trị có thể bị coi là B2B ngoài phạm vi | OQ-59, D-46 |
| MB-07 “không tài khoản”; MB-19 “không thu dữ liệu ngoài phạm vi”; BR-002 (không SĐT/email) | Chỉ áp cho người dùng cuối; khách sạn cần liên hệ khách và quản trị cần tài khoản | OQ-50, OQ-59 |
| MB-15 “bản đồ, gọi xe, lưu chứng từ” (Đã loại) | Đón khách bằng xe khách sạn (HM-FR-035) mâu thuẫn | D-26 (SRS v0.6), OQ-50 |
| MB-12, MB-13 “phản hồi mô phỏng”; BR-001 “mọi dữ liệu và giao dịch là mô phỏng”; AC-063/064 | Gói này giả định khách sạn thật xác nhận/từ chối; cần quyết định prototype hay sản phẩm thật | OQ-59, D-27 |
| MB-09/MB-10 Conditional; MB-03/MB-20 Blocked | SA-FR-017 không được bật nội dung quyền lợi khi D-13 chưa duyệt | SA-BR-014 |
| SRS mục 9.2: không quyết định công nghệ, backend, cơ sở dữ liệu, hạ tầng | Các yêu cầu tenant, phiên, audit, backup là yêu cầu logic; giải pháp kỹ thuật để kiến trúc sư quyết định | OQ-48, OQ-58 |

## 3. Quy ước

| Hạng mục | Quy ước |
|---|---|
| Trạng thái | **Proposed** (đề xuất, chờ duyệt), **Blocked** (thiếu quyết định hoặc dữ liệu), **Deferred** (có thể hoãn), **Existing** (đã có trong SRS hiện hành), **Out of Scope**. Khớp từ điển trạng thái của SRS 1.7 và sổ quyết định. |
| Ưu tiên | MoSCoW như SRS hiện hành (Must, Should, Could, Won’t), tất cả là **đề xuất**. Không tạo hệ ưu tiên thứ hai. Nhãn Sprint của MVP không dùng vì định nghĩa chưa có (OQ-28). Phân kỳ riêng: Foundation, Hotel Operations, System Operations, Advanced. |
| Mã yêu cầu | `HM-FR-xxx`, `SA-FR-xxx` (chức năng); `HM-BR-xxx`, `SA-BR-xxx` (quy tắc); `SH-NFR-xxx` (phi chức năng dùng chung); `HM-DATA-xxx`, `SA-DATA-xxx` (thực thể dữ liệu); `SM-xx` (máy trạng thái); `HM-Cxx`, `SA-Cxx`, `SH-Cxx` (module và năng lực dùng chung). |
| Tiếp nối chuỗi hiện có | Actor: ACT-07 đến ACT-15 (ACT-01 đến ACT-06 đã dùng). OQ: OQ-43 đến OQ-62 (OQ-42 là số cuối đã dùng). Quyết định: D-30 đến D-49 (D-29 là số cuối đã dùng); OQ-n tương ứng D-(n−13). |
| Tiêu chí nghiệm thu | Gắn theo yêu cầu: `<ID yêu cầu>.AC<n>`. Là tiêu chí **đề xuất** của gói này, không phải AC chính thức của SRS (AC-001 đến AC-064 không đổi); không có mã TC. |
| Ngôn ngữ | “Đề xuất” cho mọi yêu cầu mới. Từ “phải” chỉ dùng cho ràng buộc đã có trong SRS hiện hành. |
| Loại yêu cầu | Mỗi yêu cầu ghi là yêu cầu nghiệp vụ, yêu cầu hệ thống hoặc (ở NFR) đề xuất kỹ thuật. Cơ chế kỹ thuật cụ thể không được chọn. |

## 4. Phần chưa được phê duyệt

Toàn bộ gói. Các điểm cần quyết định nằm ở `07_OPEN_QUESTIONS_AND_DECISIONS.md` (20 OQ, 20 quyết định đề xuất). Các điểm chặn lớn nhất: OQ-59 (quan hệ với SRS v0.6 và prototype hay sản phẩm thật), OQ-48 (xác thực), OQ-55 (mô hình tenant và vai trò), OQ-45 (thời hạn giữ chỗ), OQ-47 (phê duyệt hai người), OQ-50 (dữ liệu cá nhân), OQ-58 (hạ tầng).

## 5. Thứ tự đọc

1. `01_ACTORS_AND_CAPABILITY_MAP.md`: actor, ma trận quyền, capability map.
2. `02_HOTEL_MANAGEMENT_SRS.md` và `03_SYSTEM_ADMINISTRATION_SRS.md`: yêu cầu của hai phân hệ.
3. `04_SHARED_NFR_AND_SECURITY.md`: phi chức năng và bảo mật.
4. `05_DATA_MODEL_AND_STATE_MACHINES.md`: dữ liệu logic và máy trạng thái.
5. `06_REQUIREMENTS_TRACEABILITY.md`: truy vết.
6. `07_OPEN_QUESTIONS_AND_DECISIONS.md`: câu hỏi cho PO.
7. `IMPLEMENTATION_REPORT.md`: báo cáo bàn giao và kết quả tự kiểm tra.
