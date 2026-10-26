# Readiness Audit — Airrest SRS

Phiên bản v0.6 · 2026-10-26 · Kiểm tra bộ SRS v0.4 (các tệp thực tế, không dựa vào báo cáo của phiên trước). Người kiểm tra là cùng tác nhân soạn SRS; **chưa có rà soát độc lập**.

## 1. Kết luận

**Trạng thái SRS: Not Ready.** Lý do: (1) 7 quyết định P0 chưa được PO chốt (D-01, D-10, D-13, OQ-04, OQ-08, OQ-14, OQ-20); (2) MB-03 và MB-20 còn Blocked theo MVP; (3) nội dung pháp lý chưa được đối chiếu độc lập (AUD-04, AUD-05, AUD-06); (4) không có quyết định nào đã được PO phê duyệt; (5) người phê duyệt SRS chưa xác định (OQ-20).

Kết quả kiểm tra tự động: 24/25 PASS, 1 WARN, 0 FAIL. Phát hiện: 17 mục (7 đã sửa, 5 còn mở, còn lại là ghi chú/thông tin).

## 2. Kiểm tra tiền đề

| Hạng mục | Kết quả |
|---|---|
| Repository root | `go/apps/manufacture` (submodule); thư mục làm việc `test/Airrest_website/` |
| Git | Toàn bộ `test/` nằm trong `.gitignore` (dòng 86) nên Git không theo dõi các tệp này; `git status` của repo cha có thay đổi sẵn (`.gitignore`, submodule) không liên quan và không bị đụng tới |
| Phiên bản tài liệu trước khi sửa | SRS, RTM, OPEN_QUESTIONS, RESEARCH_AND_GAP_ANALYSIS, SRS_REVIEW đều v0.4 (2026-10-26) |
| SHA-256 `docs/MVP.md` | `41c42c717873d859ae5ad820b80d0301cb2b78db9eca1457fee7fd174554fbd3` — không đổi |
| Tệp nguồn không đổi | `src/main.jsx`, `src/styles.css`, `package.json`, `index.html` (so SHA-256 trước/sau) |

## 3. Kết quả kiểm tra tự động (chạy trên tệp thực tế)

| Mã | Kiểm tra | Kết quả | Chi tiết |
|---|---|---|---|
| C1.FR | FR: số lượng giữ nguyên (23) và đánh số liên tục từ 001 | PASS | 23 ID |
| C1.NFR | NFR: số lượng giữ nguyên (9) và đánh số liên tục từ 001 | PASS | 9 ID |
| C1.BR | BR: số lượng giữ nguyên (14) và đánh số liên tục từ 001 | PASS | 14 ID |
| C1.DR | DR: số lượng giữ nguyên (9) và đánh số liên tục từ 001 | PASS | 9 ID |
| C1.UIR | UIR: số lượng giữ nguyên (11) và đánh số liên tục từ 001 | PASS | 11 ID |
| C1.IFR | IFR: số lượng giữ nguyên (2) và đánh số liên tục từ 001 | PASS | 2 ID |
| C1.UC | UC: số lượng giữ nguyên (13) và đánh số liên tục từ 001 | PASS | 13 ID |
| C1.AC | AC: số lượng giữ nguyên (64) và đánh số liên tục từ 001 | PASS | 64 ID |
| C2 | TC: 59 mã tham chiếu, mỗi TC ứng với một AC có thật; 5 AC không có TC | PASS | 59 TC |
| C3 | SRS/RTM nêu TC chỉ là mã tham chiếu dự kiến, chưa phải test case chi tiết | PASS |  |
| C4 | Mọi ID 3 chữ số (FR…TC) và CR/OQ/OOS/ACT được tham chiếu đều tồn tại (mã 2 chữ số FR-01… là mã gốc B03, không tính) | PASS | 6 tài liệu |
| C5 | Mọi G-xx, R-xx, D-xx được tham chiếu đều có định nghĩa | PASS |  |
| C6 | Mỗi gap (21) có yêu cầu, OQ và Research tham chiếu tồn tại (bảng liên kết mục A) | PASS |  |
| C7 | Mọi Research ID được ít nhất một gap hoặc đề xuất trích dẫn | WARN | không được trích: R-06, R-10, R-17, R-29 (xem AUD-13) |
| C8 | Mọi OQ còn mở (31) có ít nhất một quyết định trong PRODUCT_DECISION_REGISTER | PASS |  |
| C9 | CR-01…CR-12 không có AC/TC ở SRS 3.5 và RTM 6.1 | PASS |  |
| C10 | CR-01…CR-12 đều mang trạng thái Proposed/Deferred/Blocked | PASS |  |
| C11 | Trạng thái trong PRODUCT_DECISION_REGISTER thuộc tập cho phép; không có “Approved/Đã phê duyệt” cho quyết định | PASS |  |
| C12 | RTM ghi “(Blocked)” cho các dòng của FR-005, NFR-008, NFR-009, BR-007, DR-002 | PASS |  |
| C13 | OPEN_QUESTIONS có dòng “Trạng thái” cho từng câu | PASS | 37 |
| C14 | SRS 1.7 có từ điển trạng thái (Pending PO, Simulation Parameter, Deferred, Blocked) | PASS |  |
| C15 | SRS không mô tả việc gửi yêu cầu trên Airrest là điều kiện để hưởng quyền lợi pháp lý | PASS | 1 dòng khớp mẫu, 1 dòng là câu phủ định (G-19) đã loại; 0 dòng còn lại |
| C16 | SRS 2.1 nêu L2 là cơ chế mô phỏng và nghĩa vụ thuộc hãng | PASS |  |
| C17 | docs/MVP.md không đổi (SHA-256) | PASS | 41c42c717873d859 |
| C18 | src/main.jsx, src/styles.css, package.json, index.html không đổi (SHA-256) | PASS | 4 tệp |

## 4. Phát hiện

B1 = nhất quán pháp lý/nghiệp vụ; B2 = trạng thái và quyết định; B3 = truy vết.

| Mã | Nhóm | Trạng thái | Phát hiện | Vị trí | Tác động | Xử lý |
|---|---|---|---|---|---|---|
| AUD-01 | B1 | Đã sửa | Diễn đạt “lỗi hãng không phải điều kiện cho nơi nghỉ” và “(4) không do lỗi hành khách theo văn bản” vượt quá văn bản đã đọc: Điều 36 k7 không ghi điều kiện lỗi nhưng k7a dẫn “thực hiện theo khoản 6”; điều kiện “không do lỗi hành khách” chỉ rõ ở Điều 39 k3c (hủy chuyến); Luật 130 Điều 53 k2d chỉ có nguồn thứ cấp. | RESEARCH G-02, C.1, D-01; researchdata | Có thể dẫn tới kết luận pháp lý sai. | Đã làm mềm cách diễn đạt thành “diễn giải của người soạn, cần pháp chế xác nhận”; ghi AUD-06. |
| AUD-02 | B1 | Đã sửa | “Điều 40 không miễn ăn/nghỉ” là suy luận từ tiêu đề và nội dung điều khoản, không phải câu của văn bản. | RESEARCH R-19, G-21, C.0, C.1; SRS DR-002; SRS_REVIEW 11 | Có thể bị đọc như trích dẫn pháp lý. | Đổi thành “không đề cập việc miễn ăn, nghỉ”. |
| AUD-03 | B1 | Đã sửa | SRS chưa nêu rõ ở bối cảnh vận hành rằng luồng L2 là cơ chế mô phỏng của Airrest và nghĩa vụ thuộc hãng (chỉ nằm trong G-19 của tài liệu nghiên cứu). | SRS 2.1 | Có thể bị hiểu là người dùng phải dùng L2 mới được hưởng quyền. | Đã thêm câu nêu rõ ở SRS 2.1 (không phải yêu cầu mới). |
| AUD-04 | B1 | Mở | PDF NĐ 208/2026 (trang 30–36) và NĐ 356/2025 (trang 4–5) là ảnh quét; nội dung được đọc bằng cách xem ảnh, không phải trích văn bản. | RESEARCH R-19, R-24, E | Có thể sót lỗi chép số khoản, mốc giờ. | Cần người đối chiếu độc lập với bản Công báo (docx/pdf có lớp chữ) trước khi trích dẫn chính thức (D-13). |
| AUD-05 | B1 | Mở | Luật Hàng không dân dụng 130/2025/QH15 Điều 53 chỉ có nguồn thứ cấp; chưa tìm được bản chính thức. | RESEARCH R-20, E; G-02 | Mọi câu dẫn Luật 130 chưa xác minh. | Tìm bản Công báo của Luật 130 hoặc ghi “thứ cấp” (đã ghi). |
| AUD-06 | B1 | Mở | Cách hiểu Điều 36 k7a (“thực hiện theo quy định tại khoản 6”): có thể kéo theo điều kiện lỗi người vận chuyển của k6d vào nghĩa vụ nơi nghỉ. | RESEARCH G-02, D-01; Register D-01 | D-01 và D-10 phụ thuộc cách hiểu này. | Pháp chế xác nhận trước khi PO chốt D-01/D-10. |
| AUD-07 | B1 | Mở | Điều kiện ≥6 giờ khác nhau theo loại sự kiện: chậm chuyến (thời gian chậm, Điều 36 k7) và hủy chuyến (thời gian chờ tại cảng, Điều 39 k3c). SRS FR-005, UC-002, FR-006 chỉ nói “mốc chậm”; chưa có mô tả cho thời gian chờ sau hủy. | SRS FR-005 (Main flow), UC-002, FR-006 | Trường hợp hủy chuyến có thể bị bỏ sót khi viết AC. | PO quyết định khi chốt D-01; chưa thêm yêu cầu. |
| AUD-08 | B1 | Mở | B03 FR-04/FR-21 và nội dung văn bản chính thức khác nhau ở 22h–7h và điều kiện lỗi; chưa có quyết định nguồn nào là chuẩn cho SRS. | RESEARCH C.1 | SRS đang giữ AC của MVP và ghi nội dung văn bản như tham khảo. | D-13. |
| AUD-09 | B2 | Đã sửa | Từ vựng trạng thái không thống nhất: SRS 1.7 chỉ có In Scope/Conditional/Out of Scope/TBD/Proposed; CR dùng Deferred/Blocked; RESEARCH C.3 dùng “Đề xuất, chưa phê duyệt/Hoãn/Bị chặn”; sổ quyết định dùng Pending PO/Simulation Parameter/Deferred/Blocked. | SRS 1.7; SRS 3.5; RESEARCH C.3 | Dễ đọc nhầm trạng thái. | Đã thêm từ điển trạng thái ở SRS 1.7 và ghi chú đối chiếu ở RESEARCH C.3. |
| AUD-10 | B2 | Đã sửa | Trạng thái Blocked của MB-03/MB-20 không hiện ở cột trạng thái của FR-005, NFR-008, NFR-009, BR-007, DR-002 trong SRS 3.1, SRS mục 7 và RTM (chỉ ở bảng phủ MVP). | SRS 3.1, 7; RTM mục 2 | Có thể bị hiểu là các yêu cầu này triển khai được. | Đã thêm hậu tố “(Blocked)” vào trạng thái các dòng này. |
| AUD-11 | B2 | Đã sửa | OPEN_QUESTIONS chỉ có trạng thái ở bảng tổng hợp; phần chi tiết (ví dụ OQ-35) vẫn mô tả vấn đề đã giải quyết mà không nêu trạng thái. | OPEN_QUESTIONS chi tiết | Dễ đọc nhầm câu hỏi đã đóng là còn mở. | Đã thêm dòng “Trạng thái” cho từng câu. |
| AUD-12 | B2 | Đã sửa | RESEARCH mục D chỉ liệt kê 18 trong 31 OQ còn mở, dễ bị hiểu là các OQ khác đã đóng. | RESEARCH D | Mâu thuẫn với OPEN_QUESTIONS. | Đã thêm câu trỏ tới PRODUCT_DECISION_REGISTER làm danh sách đầy đủ. |
| AUD-13 | B3 | Thông tin | Research ID không được gap/đề xuất nào trích dẫn: R-06, R-10, R-17, R-29 (R-17 đã bị R-21 thay thế; R-29 bổ sung ít). | RESEARCH mục B | Không ảnh hưởng. | Không sửa. |
| AUD-14 | B2 | Đã ghi chú | RESEARCH C.2 chọn D-01 = “hiển thị, không chặn” nhưng D-05 = “hành khách tự xác nhận”: hai khuyến nghị không nhất quán (bước xác nhận không có tác dụng nếu không chặn). | RESEARCH C.2 D-01, D-05; Register D-01, D-05 | PO có thể chọn tổ hợp mâu thuẫn. | Đã thêm lưu ý vào RESEARCH D-05; sổ quyết định khuyến nghị D-05 = B khi D-01 = A. |
| AUD-15 | B3 | Thông tin | Mã gốc 2 chữ số (FR-01…) và mã SRS 3 chữ số (FR-001…) cùng tồn tại; dễ nhầm. | SRS 1.7 | Rủi ro nhầm khi tra cứu. | Đã có quy ước ở SRS 1.7; không đổi. |
| AUD-16 | B2 | Thông tin | Nhãn EXTERNALLY_RESEARCHED dùng cho cả gap có văn bản chính thức (mạnh) và gap chỉ có nguồn thứ cấp (yếu); mức khác nhau chỉ hiện ở cột “Mức xác minh”. | RESEARCH A; SRS 3.4 | Có thể bị đọc nhầm mức tin cậy. | Giữ nguyên; luôn đọc cùng cột “Mức xác minh”. |
| AUD-17 | B3 | Thông tin | 5 AC không có TC (2 AC của MVP chưa đo được: AC của NFR-002, NFR-003; 3 AC TBD). | SRS mục 10 | Không thể kiểm thử các AC này. | Phụ thuộc OQ-04, D-13, D-20. |

## 5. B1 — tính nhất quán pháp lý và nghiệp vụ

| Nội dung | Mức xác minh | Ghi chú |
|---|---|---|
| Định nghĩa chậm/hủy chuyến (Điều 36 k1–k2, Điều 39 k1) | Văn bản chính thức (ảnh quét) | Cần đối chiếu lại (AUD-04) |
| Nơi nghỉ khi chậm ≥6 giờ; khung 22h–7h (Điều 36 k7) | Văn bản chính thức (ảnh quét) | Khung 22h–7h đổi loại nơi nghỉ; không phải ngưỡng độc lập |
| Điều kiện hành khách (Điều 36 k8) và không áp dụng nếu hoàn vé (k7c) | Văn bản chính thức (ảnh quét) | — |
| Điều kiện “lỗi người vận chuyển” (Điều 36 k6d) | Văn bản chính thức (ảnh quét) | Chỉ nêu cho k6 b, c; k7 không ghi; k7a dẫn khoản 6 — cần pháp chế (AUD-06) |
| Hoàn vé, bồi thường ứng trước, thời hạn (TT 48 Điều 4–6) | Văn bản chính thức (có lớp chữ) | Mức tiền nội địa 220.000/330.000/440.000đ |
| Miễn trừ bồi thường ứng trước (Điều 40) | Văn bản chính thức (ảnh quét) | Điều 40 không đề cập ăn/nghỉ (AUD-02) |
| Luật HKDD 130/2025 Điều 53 | Chỉ nguồn thứ cấp | Chưa xác minh (AUD-05) |
| Luật 91/2025 Điều 2, 9, 19 | Văn bản chính thức (có lớp chữ) | Chưa tạo yêu cầu pháp lý |
| NĐ 356/2025 Điều 5–6 | Văn bản chính thức (ảnh quét, đọc một phần) | Cần đối chiếu lại |
| Hoàn vé, bồi thường, miễn trừ hiển thị trong SRS | EXTERNALLY_RESEARCHED, chưa duyệt | Chỉ ở SRS 3.4, 3.5, DR-002; không có AC |

Phân biệt nghĩa vụ của hãng với cơ chế của Airrest: SRS 2.1 nêu L2 là cơ chế mô phỏng (đã sửa, AUD-03); RESEARCH C.0 có bảng đối chiếu; không có nơi nào trong SRS yêu cầu hành khách “phải gửi đề nghị” để được hưởng quyền (kiểm tra C15).

## 6. B2 — dùng trạng thái nhất quán

Từ điển trạng thái (đã thêm vào SRS 1.7):

| Tài liệu | Từ ngữ | Tương ứng trong sổ quyết định |
|---|---|---|
| SRS/RTM (yêu cầu) | In Scope, Conditional, Out of Scope, TBD, Proposed | Không thuộc sổ quyết định |
| SRS 3.5 (CR) | Proposed, Deferred, Blocked | Pending PO / Simulation Parameter, Deferred, Blocked |
| RESEARCH C.3 | A cần phê duyệt; B tham số mô phỏng; C trì hoãn; D bị chặn | Pending PO; Simulation Parameter; Deferred; Blocked |
| OPEN_QUESTIONS | Mở; Mở một phần; Mở một phần (đã nghiên cứu); Đã quyết định theo MVP; Đã giải quyết bằng nguồn chính thức | Mỗi OQ mở có quyết định trong sổ (C8) |

Ánh xạ nhóm của RESEARCH C.3 sang trạng thái trong sổ có một khác biệt: D-03 ở RESEARCH là nhóm A, trong sổ là Pending PO; D-03* ở RESEARCH là nhóm D, trong sổ là Blocked; D-07 và D-11 là nhóm C và đều Deferred; D-02, D-04, D-06, D-08 là nhóm B và đều Simulation Parameter. Sổ có thêm D-13…D-24 và OQ-04, OQ-08, OQ-14, OQ-20 mà RESEARCH C.3 chưa có.

## 7. B3 — truy vết

- ID giữ nguyên: FR 23, NFR 9, BR 14, DR 9, UIR 11, IFR 2, UC 13, AC 64, TC 59 (C1, C2). Không thêm hay đổi ID nào trong phiên này.
- CR-01…CR-12 là ứng viên Proposed/Deferred/Blocked, không có AC/TC, tách riêng ở SRS 3.5 và RTM 6.1 (C9, C10).
- TC-001…TC-064 là mã tham chiếu dự kiến, chưa phải test case chi tiết (C3); 5 AC không có TC (AUD-17).
- Liên kết gap ↔ Research ↔ OQ ↔ quyết định: C5–C8; các Research không được trích dẫn: xem AUD-13.

## 8. B4 — điều kiện Ready for Implementation

### 8.1 Blocker

| Blocker | Nguồn | Tác động |
|---|---|---|
| 7 quyết định P0 chưa chốt | PRODUCT_DECISION_REGISTER | Điều kiện/phạm vi L2, quy tắc nguyên nhân, gỡ Blocked, công thức thời gian, state machine, địa bàn, người phê duyệt |
| MB-03, MB-20 Blocked | MVP | FR-005, NFR-008, NFR-009, BR-007, DR-002 không triển khai được |
| Chưa có người phê duyệt; B00/B03 chưa ký | OQ-20, OQ-14 | Không thể chuyển “Chờ duyệt” sang “Đã duyệt” |
| Nhắc nền khi đóng trang bị chặn bởi hạ tầng | D-03* | MB-08 chỉ đảm bảo khi trang còn mở |
| Dữ liệu tiện ích nhà ga thiếu giá/giờ | D-09 | AC của FR-017 không thể thỏa đầy đủ |

### 8.2 Có thể dùng tham số mô phỏng đã ghi rõ

D-02 (giờ có mặt 120 phút), D-04 (hết hạn yêu cầu), D-06 (giá 1 phòng/1 đêm/2 người lớn), D-08 (làm mới 30 phút). Chúng chỉ là giả định mô phỏng có nhãn, vẫn cần PO xác nhận.

### 8.3 Phải do PO quyết định trước

D-01, D-10, D-13, OQ-04, OQ-08, OQ-14, OQ-20 (P0); sau đó các mục P1 trong sổ.

### 8.4 Cần xác minh nguồn hoặc rà soát pháp lý

AUD-04 (đối chiếu PDF ảnh quét với bản Công báo), AUD-05 (Luật 130 Điều 53), AUD-06 (Điều 36 k7a), OQ-37 (xác minh bổ sung).

### 8.5 Điều kiện khách quan để nâng trạng thái

| Mức | Điều kiện |
|---|---|
| Conditionally Ready | (a) PO trả lời 7 quyết định P0; (b) AUD-04 và AUD-06 được đóng; (c) MB-03/MB-20 được PO gỡ Blocked hoặc loại khỏi phạm vi; (d) OQ-20 xác định người phê duyệt; (e) mọi quyết định P1 còn lại đã có tham số mô phỏng ghi rõ; khi đó phần còn lại có thể triển khai kèm giả định mô phỏng công khai |
| Ready for Implementation | Conditionally Ready và (f) mọi AC của yêu cầu In Scope có TC hoặc lý do loại trừ được PO ghi nhận; (g) không còn mâu thuẫn trọng yếu giữa các tài liệu (không có kiểm tra FAIL và không có phát hiện B1/B2 ở trạng thái Mở); (h) trạng thái duyệt của MVP được cập nhật bởi PO/GVHD |

## 9. Thay đổi đã thực hiện trong phiên audit (v0.4 → v0.5)

| Tệp | Thay đổi |
|---|---|
| SRS.md | Từ điển trạng thái ở 1.7; câu về L2 mô phỏng ở 2.1; hậu tố (Blocked) ở 3.1, mục 7; làm mềm diễn đạt pháp lý (DR-002, 3.4); Phụ lục C thêm v0.5 |
| RTM.md | Hậu tố (Blocked) cho FR-005, NFR-008, NFR-009, BR-007, DR-002; cập nhật phiên bản |
| OPEN_QUESTIONS.md | Dòng “Trạng thái” cho từng câu |
| RESEARCH_AND_GAP_ANALYSIS.md | Làm mềm diễn đạt pháp lý (G-02, G-21, C.0, C.1, C.2 D-01, D-05); ghi chú từ điển trạng thái ở C.3; ghi chú danh sách OQ ở D; mục G thay đổi v0.5 |
| SRS_REVIEW.md | Mục 12–13 cập nhật; trỏ tới sổ quyết định và audit |
| PRODUCT_DECISION_REGISTER.md, READINESS_AUDIT.md | Tạo mới |

Không sửa `docs/MVP.md`, `src/`, cấu hình hay dependency; không commit; không chạy mã bên ngoài; không tích hợp dịch vụ.

## 7. Cập nhật v0.6

Bảng kiểm tra tự động ở mục 3 chạy trên bộ v0.5; số lượng ID ở C1 (23 FR, 9 NFR, 14 BR, 9 DR, 11 UIR, 13 UC) là của v0.5. Bản v0.6 thêm ba tác nhân (ngoài MVP, Proposed) nên số lượng hiện là 34 FR, 10 NFR, 17 BR, 12 DR, 14 UIR, 19 UC; chưa chạy lại toàn bộ bộ kiểm tra này. Kết luận không đổi: **Not Ready**; số quyết định P0 chờ PO tăng từ 7 lên 10 (thêm D-25, D-26, D-27).
