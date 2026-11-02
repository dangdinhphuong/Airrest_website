# IMPLEMENTATION_REPORT: Gói SRS mở rộng khách sạn và quản trị

Phiên bản v0.1 Draft · 2026-10-26 · Trạng thái **DRAFT, chưa được phê duyệt**. Tài liệu bổ sung độc lập, không thay thế SRS hiện hành.

Báo cáo bàn giao của nhiệm vụ phân tích và thiết kế SRS. Không có mã nguồn, giao diện, API, cơ sở dữ liệu hay tích hợp nào được tạo hoặc thay đổi.

## 1. Kết luận mức sẵn sàng

**READY FOR PO REVIEW** (đủ tiêu chí nghiệm thu của nhiệm vụ, xem mục 9), kèm các điều kiện sau: gói đủ để PO review và để đội kỹ thuật ước lượng sơ bộ; 20 OQ còn mở và 29 yêu cầu đang Blocked chờ quyết định; chưa có rà soát độc lập, chưa có Legal, Security hay Technical Architect review; quan hệ với SRS v0.6 (OQ-59) chưa quyết định. Không có tài liệu nào được đánh dấu Approved, và gói **chưa sẵn sàng để triển khai**.

## 2. Tài liệu đã tạo (thư mục `docs/srs/extensions/hotel-admin/`)

| Tệp | Nội dung |
|---|---|
| README.md | Mục tiêu, quan hệ với SRS hiện hành, quy ước, xung đột |
| 01_ACTORS_AND_CAPABILITY_MAP.md | 11 dòng actor, ma trận quyền 19×9, capability map, năng lực dùng chung |
| 02_HOTEL_MANAGEMENT_SRS.md | 49 yêu cầu HM-FR, 34 HM-BR |
| 03_SYSTEM_ADMINISTRATION_SRS.md | 41 yêu cầu SA-FR, 23 SA-BR, RBAC, audit log, cấu hình |
| 04_SHARED_NFR_AND_SECURITY.md | 37 SH-NFR |
| 05_DATA_MODEL_AND_STATE_MACHINES.md | 35 thực thể, 7 máy trạng thái (56 chuyển trạng thái) |
| 06_REQUIREMENTS_TRACEABILITY.md | Truy vết và ánh xạ SRS v0.6 |
| 07_OPEN_QUESTIONS_AND_DECISIONS.md | 20 OQ (OQ-43…62) và 20 quyết định đề xuất (D-30…49) |
| IMPLEMENTATION_REPORT.md | Báo cáo này |

## 3. Tài liệu hiện hành đã đọc

`docs/MVP.md` (20 hạng mục MB-01…MB-20); `docs/srs/SRS.md`, `RTM.md`, `OPEN_QUESTIONS.md`, `PRODUCT_DECISION_REGISTER.md`, `READINESS_AUDIT.md`, `SRS_REVIEW.md`, `RESEARCH_AND_GAP_ANALYSIS.md` (mục lục và các phần liên quan); `reports/ui_implementation/` (prototype giao diện đã có cho ba tác nhân, chỉ tham khảo). `BTHQUAN/`: **không đọc lại** trong lần này; các kết luận về B03/B04 lấy từ SRS hiện hành đã trích dẫn. Không tìm thấy tài liệu kiến trúc, data model hay API của hệ thống thật (hệ thống hiện là prototype dữ liệu mô phỏng). Đường dẫn repository xác định từ môi trường: `go/apps/manufacture/test/Airrest_website`.

## 4. Phạm vi đã và chưa đặc tả

- **Đã đặc tả (ở mức đề xuất):** toàn bộ HM-01…HM-10 và SA-01…SA-10, phi chức năng dùng chung, dữ liệu logic, 7 máy trạng thái, ma trận quyền.
- **Đặc tả nhưng Blocked/Deferred:** thanh toán và đối soát (OQ-43), đồng bộ PMS (OQ-44), chính sách hủy và hoàn (OQ-46), vận hành PMS-like (OQ-54), dữ liệu cá nhân (OQ-50), xác thực (OQ-48), giám sát và hạ tầng (OQ-58), đón khách (D-26).
- **Chưa đặc tả:** thiết kế UI/UX; giải pháp kỹ thuật cụ thể; schema vật lý; kế hoạch chi tiết; test case; kết luận tuân thủ pháp luật; chính sách giá, SLA, thời hạn lưu dữ liệu, quyền truy cập chính thức.

## 5. Số lượng yêu cầu

**Theo module**

| Module | Tổng | Proposed | Blocked | Deferred |
|---|---|---|---|---|
| HM-C01 Hồ sơ đối tác | 5 | 4 | 1 | 0 |
| HM-C02 Phòng và sức chứa | 3 | 3 | 0 | 0 |
| HM-C03 Giá và chính sách | 6 | 3 | 2 | 1 |
| HM-C04 Tồn phòng và tình trạng sẵn có | 6 | 4 | 2 | 0 |
| HM-C05 Đặt phòng | 8 | 6 | 2 | 0 |
| HM-C06 Vận hành lưu trú | 7 | 2 | 2 | 3 |
| HM-C07 Đối soát, thanh toán và doanh thu | 3 | 0 | 3 | 0 |
| HM-C08 Chất lượng đối tác | 3 | 2 | 1 | 0 |
| HM-C09 Thông báo và giao tiếp | 3 | 0 | 3 | 0 |
| HM-C10 Báo cáo và phân tích | 5 | 4 | 1 | 0 |
| SA-C01 Quản lý tài khoản | 5 | 4 | 1 | 0 |
| SA-C02 Vai trò và phân quyền (RBAC) | 5 | 5 | 0 | 0 |
| SA-C03 Quản lý đối tác | 4 | 3 | 1 | 0 |
| SA-C04 Danh mục và cấu hình hệ thống | 6 | 3 | 3 | 0 |
| SA-C05 Giám sát và xử lý sự cố | 4 | 3 | 1 | 0 |
| SA-C06 Audit log | 4 | 3 | 1 | 0 |
| SA-C07 Bảo mật và dữ liệu cá nhân | 4 | 1 | 3 | 0 |
| SA-C08 Hỗ trợ và khiếu nại | 3 | 3 | 0 | 0 |
| SA-C09 Tích hợp và tác vụ nền | 3 | 1 | 2 | 0 |
| SA-C10 Báo cáo quản trị | 3 | 3 | 0 | 0 |
| **Tổng** | 90 | 57 | 29 | 4 |

**Theo ưu tiên đề xuất:** Could 16, Must 44, Should 25, Won't 5. **Theo phân kỳ đề xuất:** Advanced 11, Foundation 20, Hotel Operations 35, System Operations 24. Số tiêu chí nghiệm thu đề xuất: 271.

## 6. Phân kỳ đề xuất (không phải roadmap chính thức)

| Giai đoạn | Nội dung | Phụ thuộc và rủi ro chính |
|---|---|---|
| Foundation | Actor, tài khoản, RBAC, tenant isolation, audit log cơ bản, kiểm soát thay đổi cấu hình | OQ-48, OQ-55, OQ-47, OQ-49, OQ-59. Rủi ro: chọn xác thực và tenant sai sẽ khó đổi; xung đột MB-16. |
| Hotel Operations | Hồ sơ đối tác và duyệt, loại phòng, giá, tồn, đặt phòng | Foundation; OQ-45, OQ-51, OQ-62, OQ-46. Rủi ro: đặt vượt tồn và xung đột đồng thời (HM-FR-019). |
| System Operations | Giám sát, hỗ trợ, cấu hình nội dung, báo cáo, sự cố | Hotel Operations; OQ-58, OQ-57, OQ-60. Rủi ro: không biết hạ tầng giám sát hiện có. |
| Advanced | PMS/channel manager, thanh toán, đối soát, phân tích nâng cao, quyền dữ liệu cá nhân | OQ-43, OQ-44, OQ-50, D-26. Rủi ro: phạm vi pháp lý và tài chính; mâu thuẫn MB-15, MB-19. |

## 7. OQ và quyết định quan trọng nhất

OQ-59 (quan hệ với SRS v0.6 và prototype hay sản phẩm thật), OQ-48 (xác thực), OQ-55 (tenant và vai trò), OQ-45 (thời hạn giữ chỗ), OQ-47 (phê duyệt hai người), OQ-50 (dữ liệu cá nhân và quyền xem, xuất), OQ-58 (hạ tầng). Chi tiết ở `07_OPEN_QUESTIONS_AND_DECISIONS.md`.

## 8. Dependency và blocker

- Blocker nghiệp vụ: OQ-43, OQ-44, OQ-46, OQ-54.
- Blocker kỹ thuật/bảo mật: OQ-48, OQ-49, OQ-50, OQ-55, OQ-58.
- Phụ thuộc quyết định của SRS hiện hành: D-13 (nội dung quyền lợi), D-26 (lái xe và MB-15), D-27 (vai trò của hãng), D-04 (hết hạn yêu cầu), D-06 (giá tổng), D-20 (tiếp cận), OQ-20 (người phê duyệt SRS).
- Xung đột ràng buộc hiện hành: MB-16, MB-07/MB-19/BR-002, MB-15, MB-12/13/BR-001 (xem README mục 2).

## 9. Kiểm tra tính nhất quán đã thực hiện

Chạy bằng script trên chính các tệp đã sinh (kiểm tra cấu trúc và tham chiếu, không thay cho rà soát độc lập).

| Mã | Kiểm tra | Kết quả | Chi tiết |
|---|---|---|---|
| K1 | ID duy nhất (yêu cầu, quy tắc, NFR, thực thể) | PASS | 90 yêu cầu, 57 quy tắc, 37 NFR, 35 thực thể |
| K2 | Mỗi yêu cầu có actor, trigger, luồng chính, hậu điều kiện, quyền, ≥2 AC, ưu tiên, trạng thái, nguồn; có luồng lỗi (trừ mục Won't/Deferred) | PASS | đủ trường |
| K3 | Mọi tham chiếu (phụ thuộc, quy tắc, dữ liệu, OQ, yêu cầu khác) đều tồn tại | PASS | không có tham chiếu treo |
| K4 | Mọi actor trong yêu cầu thuộc danh mục và có dòng quyền tương ứng | PASS | đủ |
| K5 | Thao tác ghi/nhạy cảm đều có sự kiện audit | PASS | đủ |
| K6 | Mọi yêu cầu Blocked có OQ/quyết định liên quan | PASS | đủ |
| K7 | Không có yêu cầu trùng tên/nội dung (tỷ lệ giống > 0.85) | PASS | không có cặp nghi trùng |
| K8 | Máy trạng thái: mọi trạng thái tới được, mọi trạng thái không cuối đều có đường ra, không có trạng thái lạ | PASS | 7 máy, 56 chuyển trạng thái |
| K9 | Ma trận quyền đủ cột cho mọi vai trò | PASS | 19 tài nguyên × 9 vai trò |
| K10 | Không yêu cầu nào mang trạng thái Approved; mọi yêu cầu là Proposed, Blocked hoặc Deferred | PASS | đúng |
| K11 | Mỗi OQ trong gói này được ít nhất một yêu cầu, quy tắc hoặc NFR tham chiếu | PASS | 20 OQ |
| K12 | Capability map: mỗi yêu cầu thuộc đúng một module chính và có mặt đúng một lần | PASS | 90 yêu cầu |
| K13 | Tệp hiện hành (MVP.md, docs/srs/*.md, package.json, index.html, src/**) không đổi so với trước khi bắt đầu | PASS | 46 tệp đối chiếu SHA-256 |

Các lỗi do chính bước kiểm tra phát hiện và đã sửa trước khi bàn giao:

- HM-FR-026: thiếu sự kiện audit cho thao tác ghi, đã bổ sung `booking.pending.warned`
- HM-FR-032: thiếu sự kiện audit cho thao tác ghi, đã bổ sung `roomstatus.changed`
- HM-FR-033: thiếu sự kiện audit cho thao tác ghi, đã bổ sung `opsnote.created`
- SA-FR-022: thiếu sự kiện audit cho thao tác ghi, đã bổ sung `monitor.case.assigned`
- SA-FR-032: thiếu sự kiện audit cho thao tác ghi, đã bổ sung `consent.recorded`
- HM-FR-043: thiếu sự kiện audit cho việc tạo nhắc, đã bổ sung `reminder.sent`
- OQ-59 (quan hệ với SRS v0.6, MB-16, prototype hay sản phẩm thật) chưa gắn với yêu cầu nào; đã gắn vào SA-FR-001, HM-FR-023, SA-FR-008
- HM-FR-032: thiếu hậu điều kiện, đã bổ sung
- HM-FR-043: actor nhận nhắc thiếu dòng quyền, đã bổ sung
- SA-FR-036: actor ACT-15 thiếu dòng quyền, đã bổ sung

Ghi chú: ban đầu K4 báo thiếu quyền do cách viết gọn “ACT-12/13”; script đã được sửa để đọc đúng cách viết này, không phải sửa nội dung.

## 10. Tệp hiện hành xác nhận không thay đổi

Đối chiếu SHA-256 trước và sau: `docs/MVP.md`, `docs/srs/OPEN_QUESTIONS.md`, `PRODUCT_DECISION_REGISTER.md`, `RESEARCH_AND_GAP_ANALYSIS.md`, `RTM.md`, `READINESS_AUDIT.md`, `SRS.md`, `SRS_REVIEW.md`, `package.json`, `index.html` và toàn bộ `src/`. Kết quả ở K13. Không có commit, rebase, reset hay xóa dữ liệu; không cài dependency.

## 11. Giới hạn

- Chưa có rà soát độc lập, chưa có Legal, Security hay Technical Architect review.
- Các giá trị hiệu năng và vài tham số chỉ là điểm khởi đầu để đo, không phải cam kết.
- Mô hình dữ liệu và máy trạng thái ở mức logic; chưa kiểm chứng với đối tác khách sạn thật.
- Thư mục `test/` nằm trong `.gitignore` của repository chứa nó nên Git không theo dõi tệp trong đó; việc đối chiếu không đổi dùng SHA-256 thay cho `git diff`.
