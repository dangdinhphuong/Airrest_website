# BÁO CÁO KIỂM ĐỊNH ĐỘC LẬP TÀI LIỆU KHOÁ LUẬN TỐT NGHIỆP (CHƯƠNG 4 & CHƯƠNG 5)
**Mã kiểm định:** AUDIT-AIRREST-KLTN-CH4-CH5-001  
**Vai trò:** Independent Technical Document Auditor  
**Tài liệu đối chiếu:**
- **DOCX gốc:** [`docs/KLTN.IT63.Nhom9.AIRREST.docx`](file:///run/media/phuong-dev/backup/Airrest_website/docs/KLTN.IT63.Nhom9.AIRREST.docx) (Phần thân: Phần tử chỉ mục 366 đến 521 trong `word/document.xml`)
- **Markdown đã chuẩn hóa:** [`docs/KLTN_CHUONG_4_5_HOAN_THIEN.md`](file:///run/media/phuong-dev/backup/Airrest_website/docs/KLTN_CHUONG_4_5_HOAN_THIEN.md) (585 dòng, 38 đề mục, 16 bảng, 12 hình)
- **Thư mục hình ảnh kiểm định:** [`docs/images/figures/`](file:///run/media/phuong-dev/backup/Airrest_website/docs/images/figures/) (12 tệp PNG)
- **Tài liệu tham chiếu liên quan:** [`docs/KLTN_SUA_CHUONG_4_5.md`](file:///run/media/phuong-dev/backup/Airrest_website/docs/KLTN_SUA_CHUONG_4_5.md) (kế hoạch sửa đổi committed bởi `phuongdd` ngày 12/11/2026)  
**Thời điểm thực hiện:** 16/11/2026  
**Chế độ quyền:** READ-ONLY (Không sửa DOCX, không sửa Markdown chuẩn hóa, không sửa hình ảnh)

---

## 1. EXECUTIVE SUMMARY (TỔNG QUAN BÁO CÁO)

### 1.1. Mục đích và phạm vi kiểm định
Kiểm định độc lập xác định liệu tài liệu [`docs/KLTN_CHUONG_4_5_HOAN_THIEN.md`](file:///run/media/phuong-dev/backup/Airrest_website/docs/KLTN_CHUONG_4_5_HOAN_THIEN.md) (do DeepCoder thực hiện chuẩn hóa) có bảo toàn trung thực cấu trúc, nội dung nghiệp vụ, dữ liệu kỹ thuật, số liệu, bảng biểu và hình ảnh từ tài liệu gốc [`docs/KLTN.IT63.Nhom9.AIRREST.docx`](file:///run/media/phuong-dev/backup/Airrest_website/docs/KLTN.IT63.Nhom9.AIRREST.docx) (Chương 4 và Chương 5) hay không, đồng thời đánh giá tính sẵn sàng chuyển đổi ngược lại sang Microsoft Word.

### 1.2. Phát hiện cốt lõi (Core Finding)
Bản Markdown [`docs/KLTN_CHUONG_4_5_HOAN_THIEN.md`](file:///run/media/phuong-dev/backup/Airrest_website/docs/KLTN_CHUONG_4_5_HOAN_THIEN.md) **KHÔNG PHẢI** là bản chuyển đổi chuẩn hóa trung thực từ tệp DOCX gốc. Thay vào đó, nó là một tài liệu được **viết lại toàn diện theo định hướng mã nguồn mới** (áp dụng các đề xuất từ [`docs/KLTN_SUA_CHUONG_4_5.md`](file:///run/media/phuong-dev/backup/Airrest_website/docs/KLTN_SUA_CHUONG_4_5.md) và hiện trạng monorepo fullstack `Airrest_website`), thậm chí còn đi xa hơn bản kế hoạch sửa đổi khi tự ý xóa bỏ toàn bộ các cột cảnh báo hạn chế kỹ thuật:

1. **Thay đổi bản chất luận văn (Semantic & Paradigm Shift):** 
   - Trong DOCX gốc: Nhóm tác giả trình bày trung thực rằng sản phẩm hiện thực là một **prototype React một trang (SPA)** chạy dữ liệu tĩnh mô phỏng trong bộ nhớ (`useState`, `useMemo`, `hotels[]`), **chưa có backend**, **chưa có cơ sở dữ liệu thật**, **chưa nối API**, **chưa có xác thực/JWT**, và **chưa có kiểm thử tự động** (các bảng đều có cột *"Khoảng trống"* chỉ rõ giới hạn).
   - Trong Markdown hoàn thiện: Toàn bộ nội dung bị biến đổi thành một hệ thống **production fullstack hoàn chỉnh** (Node.js 22, Express 5, PostgreSQL Supabase với 20 bảng & 11 migration, Socket.IO thời gian thực, thuật toán sweep-line, mã hóa AES-256-GCM, cổng thanh toán VNPay dual-mode, và bộ kiểm thử tự động Vitest 31 test suites với 262 test cases đạt 100% PASS).
2. **Sai lệch cấu trúc đề mục:** 
   - DOCX gốc có **36 tiêu đề** (2 tiêu đề chương + 34 mục/tiểu mục).
   - Markdown có **38 tiêu đề** do tự ý chèn thêm hai tiểu mục cấp 3: `### 5.8.1. Cổng đối tác khách sạn` (dòng 516) và `### 5.8.2. Cổng quản trị hệ thống` (dòng 524) hoàn toàn không có trong DOCX gốc.
   - Mục `4.5.1` trong DOCX là đề mục cấp 2 (`HeadProposal2` trong Word XML), trong Markdown bị hạ xuống cấp 3 (`### 4.5.1`).
   - Bảng 4.1 trong DOCX nằm ở mục `4.2`, nhưng trong Markdown bị dời lên mục `4.1`.
3. **Biến dạng bảng biểu và thay đổi phân loại yêu cầu:** Toàn bộ **16/16 bảng** trong Markdown đều bị thay đổi cấu trúc hàng, cột hoặc nội dung so với DOCX gốc:
   - Cột *"Khoảng trống"* (bộc lộ trung thực hạn chế nghiên cứu) ở Bảng 5.5 và Bảng 5.7 trong DOCX bị xóa bỏ hoàn toàn, thay thế bằng *"Thành phần kỹ thuật chứng minh"* và *"Kết quả thực nghiệm"*.
   - **Tự ý nâng cấp mức ưu tiên MoSCoW của 9 yêu cầu chức năng (FR)** tại Bảng 4.2 (ví dụ FR-19, FR-20 từ mức Won't `W` bị đổi thành Should `S`; FR-09, FR-14 từ Could `C` đổi thành Must `M`).
   - **Tráo đổi hoàn toàn định nghĩa và vai trò của các màn hình M1–M9** tại Bảng 4.4 và tự bổ sung màn hình M10–M13.
   - Bảng 4.7 bị **chuyển vị ma trận (transpose)** hoàn toàn từ dạng ca sử dụng theo dòng sang ca sử dụng theo cột.
   - Bảng 4.8 mở rộng từ 6 dòng x 3 cột thành 21 dòng x 4 cột (liệt kê danh sách 20 bảng SQL và 11 migration).
   - Bảng 5.3 mở rộng từ 9 dòng x 4 cột thành 27 dòng x 5 cột.
4. **Mâu thuẫn nội tại trong chính tệp Markdown (Internal Contradictions):**
   - *Mâu thuẫn phân quyền:* Dòng 150 khẳng định nhân sự khách sạn đăng nhập tài khoản riêng có gắn `hotelId` trong JWT để tự duyệt đơn; nhưng dòng 177 (giữ lại từ DOCX element 418) lại tuyên bố: *"Quản trị viên thực hiện các nghiệp vụ chính thay cho tài khoản khách sạn"*.
   - *Mâu thuẫn phiên bản Vitest:* Bảng 5.3 (dòng 391) ghi Vitest phiên bản `3.0.7`, nhưng mục 5.11 (dòng 555) lại ghi `Vitest 5.1.0`.
5. **Kiểm tra hình ảnh (12 hình):** Đạt 100% về mặt tệp vật lý. Toàn bộ 12 tệp ảnh trong `docs/images/figures/` tồn tại, đường dẫn hợp lệ, và có mã băm SHA-256 **trùng khớp 100% bit-for-bit** với các ảnh nhúng (`image3.png` đến `image14.png`) trong DOCX gốc. Tuy nhiên, chú thích của Hình 5.1 và Hình 5.2 bị tự ý thêm chữ `(tái dựng)` dù file ảnh thực tế là nguyên bản từ DOCX.

### 1.3. Kết luận thẩm định
- **Phán quyết:** **FAIL (KHÔNG ĐẠT TIÊU CHÍ CHUẨN HÓA BẢO TOÀN TÀI LIỆU GỐC)**.
- **Lý do:** Tài liệu Markdown đã biến đổi toàn bộ bản chất học thuật và phạm vi kỹ thuật của luận văn, xóa bỏ ranh giới prototype, tự ý chèn đề mục mới, tráo đổi định nghĩa màn hình, nâng cấp mức ưu tiên MoSCoW, và tạo ra nhiều mâu thuẫn nội tại nghiêm trọng.

---

## 2. KẾT QUẢ ĐỐI CHIẾU CẤU TRÚC (STRUCTURAL AUDIT)

### 2.1. Kiểm tra phạm vi chương
- **Chỉ có Chương 4 và Chương 5:** ĐẠT. File Markdown bắt đầu tại dòng 1 (`# CHƯƠNG 4`) và kết thúc tại dòng 585 (hết mục 5.13). Không có Chương 1, 2, 3, 6, Kết luận chung, Phụ lục thừa hay ghi chú nội bộ.
- **Đầy đủ các mục cấp 2:** ĐẠT.
  - Chương 4 có đủ 4.1 đến 4.7.
  - Chương 5 có đủ 5.1 đến 5.13.

### 2.2. Bảng đối chiếu cây tiêu đề (Heading Hierarchy)

| STT | Đề mục trong DOCX gốc | Phân cấp DOCX (XML Style) | Đề mục trong Markdown | Phân cấp MD | Đánh giá sai lệch |
|:---:|---|---|---|---|---|
| 1 | **CHƯƠNG 4 PHÂN TÍCH YÊU CẦU VÀ THIẾT KẾ HỆ THỐNG** | TitleProposal (H1) | `# CHƯƠNG 4 PHÂN TÍCH YÊU CẦU VÀ THIẾT KẾ HỆ THỐNG` | H1 (dòng 1) | Khớp hoàn toàn |
| 2 | 4.1. Phạm vi, tác nhân và kiến trúc thông tin | HeadProposal2 (H2) | `## 4.1. Phạm vi, tác nhân và kiến trúc thông tin` | H2 (dòng 3) | Khớp hoàn toàn |
| 3 | 4.2. Yêu cầu chức năng và phi chức năng | HeadProposal2 (H2) | `## 4.2. Yêu cầu chức năng và phi chức năng` | H2 (dòng 19) | Khớp hoàn toàn |
| 4 | 4.3. Hai luồng nghiệp vụ cốt lõi | HeadProposal2 (H2) | `## 4.3. Hai luồng nghiệp vụ cốt lõi` | H2 (dòng 88) | Khớp hoàn toàn |
| 5 | 4.3.1. Luồng theo vai trò và cấu trúc trang | HeadProposal3 (H3) | `### 4.3.1. Luồng theo vai trò và cấu trúc trang` | H3 (dòng 145) | Khớp hoàn toàn |
| 6 | 4.4. Danh mục 15 use case | HeadProposal2 (H2) | `## 4.4. Danh mục 15 use case` | H2 (dòng 179) | Khớp hoàn toàn |
| 7 | 4.5. Tác nhân và đặc tả use case trọng tâm | HeadProposal2 (H2) | `## 4.5. Tác nhân và đặc tả use case trọng tâm` | H2 (dòng 203) | Khớp hoàn toàn |
| 8 | 4.5.1. Mô hình dữ liệu logic và ràng buộc trạng thái | **HeadProposal2 (H2)** | `### 4.5.1. Mô hình dữ liệu logic và ràng buộc trạng thái` | **H3 (dòng 231)** | **Sai lệch phân cấp (DOCX là H2, MD là H3)** *(Ghi chú: Bản DOCX gốc đánh nhầm style H2 cho tiểu mục 4.5.1; Markdown đã chuẩn hóa về H3 nhưng làm lệch cấp TOC Word)* |
| 9 | 4.5.2. Mô hình dữ liệu mở rộng phục vụ vận hành | HeadProposal3 (H3) | `### 4.5.2. Mô hình dữ liệu mở rộng phục vụ vận hành` | H3 (dòng 240) | Khớp hoàn toàn |
| 10 | 4.6. Ma trận truy vết | HeadProposal2 (H2) | `## 4.6. Ma trận truy vết` | H2 (dòng 269) | Khớp hoàn toàn |
| 11 | 4.7. Kết luận chương | HeadProposal2 (H2) | `## 4.7. Kết luận chương` | H2 (dòng 289) | Khớp hoàn toàn |
| 12 | **CHƯƠNG 5 THIẾT KẾ, XÂY DỰNG VÀ KIỂM THỬ HỆ THỐNG WEBSITE** | TitleProposal (H1) | `# CHƯƠNG 5 THIẾT KẾ, XÂY DỰNG VÀ KIỂM THỬ HỆ THỐNG WEBSITE AIRREST` | H1 (dòng 295) | Thêm từ "AIRREST" cuối tiêu đề *(Ghi chú: Trong DOCX gốc, mục lục TOC tại el 83 có chữ "AIRREST" nhưng phần thân tại el 448 không có)* |
| 13 | 5.1. Mục tiêu và phạm vi hiện thực | HeadProposal2 (H2) | `## 5.1. Mục tiêu và phạm vi hiện thực` | H2 (dòng 297) | Khớp hoàn toàn |
| 14 | 5.2. Hệ thống thiết kế và nguyên tắc giao diện | HeadProposal2 (H2) | `## 5.2. Hệ thống thiết kế và nguyên tắc giao diện` | H2 (dòng 315) | Khớp hoàn toàn |
| 15 | 5.2.1. Quy trình thiết kế UI/UX | HeadProposal3 (H3) | `### 5.2.1. Quy trình thiết kế UI/UX` | H3 (dòng 331) | Khớp hoàn toàn |
| 16 | 5.2.2. Wireframe và bố cục màn hình | HeadProposal3 (H3) | `### 5.2.2. Wireframe và bố cục màn hình` | H3 (dòng 339) | Khớp hoàn toàn |
| 17 | 5.2.3. Nguyên tắc thiết kế giao diện | HeadProposal3 (H3) | `### 5.2.3. Nguyên tắc thiết kế giao diện` | H3 (dòng 357) | Khớp hoàn toàn |
| 18 | 5.3. Công nghệ và công cụ sử dụng | HeadProposal2 (H2) | `## 5.3. Công nghệ và công cụ sử dụng` | H2 (dòng 364) | Khớp hoàn toàn |
| 19 | 5.3.1. Frontend React và Vite | HeadProposal3 (H3) | `### 5.3.1. Frontend React và Vite` | H3 (dòng 399) | Khớp hoàn toàn |
| 20 | 5.3.2. Dịch vụ mô phỏng và hợp đồng API | HeadProposal3 (H3) | `### 5.3.2. Dịch vụ mô phỏng và hợp đồng API` | H3 (dòng 405) | Khớp hoàn toàn |
| 21 | 5.3.3. Bản đồ, thông báo và lịch | HeadProposal3 (H3) | `### 5.3.3. Bản đồ, thông báo và lịch` | H3 (dòng 411) | Khớp hoàn toàn |
| 22 | 5.4. Kiến trúc hệ thống | HeadProposal2 (H2) | `## 5.4. Kiến trúc hệ thống` | H2 (dòng 419) | Khớp hoàn toàn |
| 23 | 5.4.1. Luồng xử lý một yêu cầu | HeadProposal3 (H3) | `### 5.4.1. Luồng xử lý một yêu cầu` | H3 (dòng 436) | Khớp hoàn toàn |
| 24 | 5.4.2. Mô hình triển khai | HeadProposal3 (H3) | `### 5.4.2. Mô hình triển khai` | H3 (dòng 449) | Khớp hoàn toàn |
| 25 | 5.5. Các phân hệ chức năng | HeadProposal2 (H2) | `## 5.5. Các phân hệ chức năng` | H2 (dòng 458) | Khớp hoàn toàn |
| 26 | 5.6. Trạng thái nghiệp vụ và dữ liệu | HeadProposal2 (H2) | `## 5.6. Trạng thái nghiệp vụ và dữ liệu` | H2 (dòng 475) | Khớp hoàn toàn |
| 27 | 5.7. Hiện thực luồng hành khách | HeadProposal2 (H2) | `## 5.7. Hiện thực luồng hành khách` | H2 (dòng 489) | Khớp hoàn toàn |
| 28 | 5.7.1. Tìm, lọc và đặt nơi nghỉ | HeadProposal3 (H3) | `### 5.7.1. Tìm, lọc và đặt nơi nghỉ` | H3 (dòng 493) | Khớp hoàn toàn |
| 29 | 5.7.2. Đề nghị hãng hỗ trợ | HeadProposal3 (H3) | `### 5.7.2. Đề nghị hãng hỗ trợ` | H3 (dòng 500) | Khớp hoàn toàn |
| 30 | 5.7.3. Nhắc giờ quay lại sân bay | HeadProposal3 (H3) | `### 5.7.3. Nhắc giờ quay lại sân bay` | H3 (dòng 508) | Khớp hoàn toàn |
| 31 | 5.8. Hiện thực phân hệ đối tác và quản trị | HeadProposal2 (H2) | `## 5.8. Hiện thực phân hệ đối tác và quản trị` | H2 (dòng 514) | Khớp tiêu đề |
| 32 | *(Không tồn tại trong DOCX)* | - | `### 5.8.1. Cổng đối tác khách sạn` | **H3 (dòng 516)** | **THỪA ĐỀ MỤC CẤP 3 (Tự ý tạo mới)** |
| 33 | *(Không tồn tại trong DOCX)* | - | `### 5.8.2. Cổng quản trị hệ thống` | **H3 (dòng 524)** | **THỪA ĐỀ MỤC CẤP 3 (Tự ý tạo mới)** |
| 34 | 5.9. Xác thực, phân quyền và bảo vệ dữ liệu | HeadProposal2 (H2) | `## 5.9. Xác thực, phân quyền và bảo vệ dữ liệu` | H2 (dòng 537) | Khớp hoàn toàn |
| 35 | 5.10. Responsive và khả năng tiếp cận | HeadProposal2 (H2) | `## 5.10. Responsive và khả năng tiếp cận` | H2 (dòng 546) | Khớp hoàn toàn |
| 36 | 5.11. Chiến lược kiểm thử | HeadProposal2 (H2) | `## 5.11. Chiến lược kiểm thử` | H2 (dòng 553) | Khớp hoàn toàn |
| 37 | 5.12. Giới hạn của bản hiện thực | HeadProposal2 (H2) | `## 5.12. Giới hạn của bản hiện thực` | H2 (dòng 570) | Khớp hoàn toàn |
| 38 | 5.13. Lộ trình hoàn thiện hệ thống | HeadProposal2 (H2) | `## 5.13. Lộ trình hoàn thiện hệ thống` | H2 (dòng 578) | Khớp hoàn toàn |

---

## 3. BẢNG ĐỐI CHIẾU NỘI DUNG TỪNG MỤC (SECTION-BY-SECTION AUDIT)

| Mục | Nội dung trong DOCX gốc | Nội dung trong Markdown hoàn thiện | Đánh giá sai lệch | Mức độ |
|---|---|---|---|:---:|
| **4.1** | Khẳng định trạng thái chuyến bay, giá, tồn phòng đều là dữ liệu mô phỏng có nhãn. Prototype không gửi giao dịch thật, không thu PII (el 368). | Viết lại hoàn toàn thành hệ thống 3 cổng tương tác; khẳng định backend (REST API, WebSocket, PostgreSQL, JWT, RBAC, sweep-line) đã hoàn thành; VNPay dual-mode (dòng 5–8). | Đổi hoàn toàn bản chất và phạm vi hệ thống. | **Critical** |
| **4.2** | Bảng 4.1 nằm dưới mục 4.2. Bảng 4.2 có 5 cột (`Trạng thái V1` ghi "Có, mô phỏng"). Đoạn kết nhấn mạnh ưu tiên MoSCoW. | Bảng 4.1 bị dời lên mục 4.1. Bảng 4.2 thêm cột thứ 6 dẫn chứng code (`Home.jsx`, `GET /v1/flights`), đổi trạng thái thành "Đã hiện thực (FE + BE)". **Tự ý nâng cấp mức MoSCoW của 9 FRs**. | Chuyển vị trí Bảng 4.1, thay đổi cấu trúc bảng, xuyên tạc mức ưu tiên yêu cầu. | **Critical** |
| **4.3** | Mô tả luồng tự chi trả và luồng hỗ trợ; biên hệ thống gồm 10 màn hình M0–M9. Ngoài biên gồm OTA, hệ thống hãng, cổng thanh toán, tài khoản (el 385). | Mở rộng chi tiết từng bước luồng Self-Pay và Support; biên hệ thống tăng lên 14 màn hình M0–M13. Đưa cổng thanh toán và tài khoản vào trong biên. | Thay đổi biên hệ thống (10 lên 14 màn) và quy trình nghiệp vụ. | **Major** |
| **4.3.1** | Nhấn mạnh luồng hành khách là phạm vi prototype; luồng quản trị/điều phối là thiết kế mở rộng V2, chưa có trong mã nguồn (el 405). | Xóa câu phân định ranh giới; bổ sung 4 bullet points chi tiết về quyền hạn JWT `hotelId`, vai trò quản trị OPS/SUPPORT. Đồng thời để sót câu *"Quản trị viên thực hiện nghiệp vụ chính thay cho khách sạn"* tạo ra **mâu thuẫn nội tại**. | Biến thiết kế tương lai thành chức năng đã xong; tự mâu thuẫn câu trước câu sau. | **Major** |
| **4.4** | Không có đoạn văn dẫn nhập giữa tiêu đề và Bảng 4.5 (el 419-420). | Thêm 1 câu dẫn nhập: *"Hệ thống kế thừa danh mục 15 ca sử dụng chuẩn mực..."* (dòng 181). | Tự bổ sung câu chữ không có trong DOCX. | **Minor** |
| **4.5** | Khẳng định prototype không thu thập họ tên thật, SĐT, email, giấy tờ, thẻ tín dụng (el 425). Tác nhân ngoài hệ thống đều mô phỏng. | Khẳng định thu thập SĐT định dạng E.164, mã hóa trường AES-256-GCM. Bảng 4.6 thêm Quản trị viên hệ thống dùng JWT. Bảng 4.7 bị transpose hoàn toàn. | Thay đổi chính sách PII, thay đổi cấu trúc bảng đặc tả use case. | **Critical** |
| **4.5.1** | Xác định 6 nhóm thực thể logic phục vụ backend tương lai; nhánh tự chi trả dừng ở xác nhận mô phỏng; không có cơ sở dữ liệu thật (el 433). | Khẳng định đã hiện thực trên PostgreSQL 16+ với 11 migration, UUID, kiểu `bigint`, thuật toán sweep-line, khóa hàng `FOR UPDATE`, idempotency key. | Tự bổ sung chi tiết kỹ thuật backend không có trong DOCX. | **Critical** |
| **4.5.2** | Nêu nguyên tắc mở rộng dữ liệu sang vận hành, trong prototype lưu ở memory. Bảng 4.8 gồm 6 nhóm thực thể khái niệm (el 437-439). | Bảng 4.8 biến thành bảng 21 dòng x 4 cột liệt kê chi tiết 20 bảng PostgreSQL và tên từng file SQL migration (`001_initial_schema.sql`...). | Đổi quy mô bảng từ khái niệm sang bảng vật lý chi tiết. | **Major** |
| **4.6** | Ma trận truy vết trích 5 nhu cầu chính; cột cuối là "Minh chứng" mức UI (el 444). | Bảng 4.9 nhân đôi lên 12 dòng, chia thành 2 cột minh chứng code và minh chứng test backend Vitest (`flights.integration.test.ts`...). | Bổ sung hàng loạt minh chứng kiểm thử không có trong DOCX. | **Major** |
| **4.7** | Khẳng định mô hình giữ ranh giới rõ giữa hỗ trợ quyết định và giao dịch thật; hiện tại là bản mô phỏng (el 447). | Viết lại thành kết luận ca ngợi hệ thống đã cụ thể hóa thành 20 bảng PostgreSQL, 24 FR nối trực tiếp endpoint REST API và 100% test pass. | Đổi hoàn toàn ý nghĩa kết luận chương. | **Critical** |
| **5.1** | Prototype React 1 trang dành cho hành khách; dữ liệu tĩnh, chưa có backend/CSDL/API. Bảng 5.1 gồm 5 dòng (el 450-452). | Mở rộng Bảng 5.1 thành 10 dòng; khẳng định đã hoàn thiện kiến trúc 9 tầng kết nối API thật, PostgreSQL và Cloudflare R2. | Đổi phạm vi hiện thực của đề tài. | **Critical** |
| **5.2** | Hệ thống thiết kế CSS custom properties trên SPA 1 trang (el 455). | Bổ sung Tailwind CSS v4, GSAP, Lucide React, bảng màu chi tiết và Dark/Light mode. | Bổ sung công nghệ ngoài DOCX. | **Minor** |
| **5.2.1** | Mô tả quy trình thiết kế UI/UX từ khảo sát đến wireframe (el 460). | Giữ nguyên ý chính, diễn đạt lại văn phong. | Chấp nhận được. | **Minor** |
| **5.2.2** | Dẫn nhập vào 2 hình Wireframe 5.1 và 5.2 (el 462). | Thêm chữ `(tái dựng)` vào caption của Hình 5.1 và 5.2 dù file ảnh là nguyên bản từ DOCX. | Sửa chú thích ảnh sai thực tế. | **Minor** |
| **5.2.3** | Nêu các nguyên tắc thiết kế cho người dùng căng thẳng (el 468). | Bổ sung thêm nguyên tắc liên quan tới Toast và trạng thái tải trang. | Sai khác nhỏ. | **Minor** |
| **5.3** | Phân loại công nghệ 3 nhóm; khẳng định REST API, CSDL, backend CHƯA CÓ trong mã nguồn. Bảng 5.3 gồm 9 dòng x 4 cột (el 470-472). | Bảng 5.3 tăng lên 27 dòng x 5 cột; liệt kê chi tiết Express 5, TypeScript, Supabase, Vitest, Docker, Render, Socket.IO. Ghi Vitest `3.0.7` **mâu thuẫn với mục 5.11**. | Đổi toàn bộ danh mục công nghệ thực tế; mâu thuẫn nội tại. | **Critical** |
| **5.3.1** | Nêu rõ cấu trúc hiện tại chỉ có component App và Logo trong `src/main.jsx` (el 475). | Khẳng định monorepo gồm `apps/web`, `packages/*`, kiến trúc module hóa cao. | Mâu thuẫn trực tiếp với DOCX gốc. | **Major** |
| **5.3.2** | Khẳng định KHÔNG có lớp service và KHÔNG gọi fetch/axios (el 477). | Khẳng định có SDK `@airrest/api-client`, schema Zod hai chiều tại `packages/validation`. | Mâu thuẫn trực tiếp với DOCX gốc. | **Critical** |
| **5.3.3** | Khẳng định KHÔNG cài Leaflet, KHÔNG gọi Notification API, KHÔNG xuất iCalendar, KHÔNG ghi localStorage (el 479). | Khẳng định có module `lib/bcbp.js`, `lib/ics.js` xuất iCalendar RFC 5545, Socket.IO real-time toast. | Mâu thuẫn 180 độ so với DOCX gốc. | **Critical** |
| **5.4** | SPA phía trình duyệt, gộp trong `main.jsx`, event handler cập nhật state cục bộ. Bảng 5.4 gồm 7 dòng x 4 cột (el 481-483). | Kiến trúc Layered Monorepo; Bảng 5.4 tăng lên 9 dòng. Luồng 5.4.1 mô tả chi tiết 5 bước gọi API, Zod, sweep-line, VNPay IPN webhook. 5.4.2 mô tả Docker & Render. | Viết lại toàn bộ kiến trúc và quy trình xử lý. | **Critical** |
| **5.5** | Có 1 đoạn văn mở đầu (el 490). Bảng 5.5 có cột 4 là "Khoảng trống" (chỉ rõ chưa có route, chưa có API, chưa có RBAC). | **MẤT HOÀN TOÀN ĐOẠN VĂN MỞ ĐẦU**. Bảng 5.5 xóa cột "Khoảng trống", thay bằng "Thành phần kỹ thuật chứng minh". | Mất nội dung và che giấu khoảng trống kỹ thuật. | **Major** |
| **5.6** | Trạng thái nghiệp vụ và quy tắc dữ liệu khi chuyển sang backend thật. Bảng 5.6 có 2 cột (`Nội dung`, `Yêu cầu`). | Thêm cột thứ 3 vào Bảng 5.6 dẫn chứng code backend thực tế (`id uuid`, `SELECT FOR UPDATE`...). | Thêm cột và chứng minh kỹ thuật ngoài DOCX. | **Major** |
| **5.7** | Cổng hành khách duyệt nơi nghỉ không cần tài khoản, tính giờ rời sân bay từ giờ bay mới (el 500-506). | Bổ sung quy trình đặt phòng 3 bước, hủy đặt phòng tính phí qua API `/v1/change-requests/quote`, đổi ngày, xe đưa đón. | Bổ sung nghiệp vụ không có trong DOCX. | **Major** |
| **5.8** | Đoạn văn duy nhất khẳng định phân hệ đối tác và quản trị CHƯA CÓ trong mã nguồn (el 508). | **XÓA ĐOẠN VĂN GỐC**. Tự tạo 2 mục con 5.8.1 (Cổng khách sạn) và 5.8.2 (Cổng admin 9 tab) với 21 dòng chi tiết kỹ thuật. | Xóa nội dung gốc, bịa thêm 2 mục con hoàn chỉnh. | **Critical** |
| **5.9** | Khẳng định hiện tại KHÔNG có đăng nhập, tài khoản mẫu, token hay RBAC; biểu mẫu không thu PII (el 510). | Viết lại 5 nguyên tắc bảo mật đa tầng: JWT HS256 trong RAM, băm Scrypt, RBAC 21 quyền `PERM`, mã hóa PII AES-256-GCM, Helmet, Rate-limit. | Mâu thuẫn 180 độ so với DOCX gốc. | **Critical** |
| **5.10** | Responsive bằng 2 breakpoint 900px và 620px, menu desktop chuyển sang menu dọc (el 512). | Viết lại thành hệ thống breakpoint Tailwind CSS v4 (640/768/1024), menu Drawer trượt, A11y WCAG 2.2 AA. **Để lọt thẻ HTML thô `<label>` không đóng**. | Thay đổi thông số responsive; lỗi cú pháp thẻ thô. | **Minor** |
| **5.11** | Khẳng định kho mã CHỈ CÓ script dev và build; KHÔNG CÓ lint, unit, integration hay E2E test. Bảng 5.7 có cột "Khoảng trống" (el 514-516). | Viết lại thành kim tự tháp kiểm thử; xóa cột "Khoảng trống"; khẳng định 31 test suites, 262 test cases đạt 100% pass trên Vitest (ghi Vitest `5.1.0`). | Mâu thuẫn 180 độ so với DOCX gốc; tự mâu thuẫn phiên bản với Bảng 5.3. | **Critical** |
| **5.12** | Giới hạn: bản hiện thực chỉ là một trang hành khách với dữ liệu tĩnh và state cục bộ, chưa có màn hình theo dõi/hủy đổi thật (el 519). | Viết lại thành 4 giới hạn mới ở tầm hệ thống (dữ liệu radar bay thật, thanh toán live doanh nghiệp, B2B với hãng, E2E tự động). | Thay đổi hoàn toàn bản chất giới hạn nghiên cứu. | **Major** |
| **5.13** | Lộ trình: (1) tách App thành component/route; (2) khóa schema và máy trạng thái; (3) backend và CSDL thật; (4) xác thực/RBAC (el 521). | Lộ trình chuyển thành: (1) E2E Playwright; (2) FlightRadar24 API; (3) Doanh nghiệp VNPay; (4) Pilot run Nội Bài; (5) Native Mobile App. | Thay đổi hoàn toàn lộ trình kỹ thuật. | **Major** |

---

## 4. DANH SÁCH NỘI DUNG THIẾU, SAI HOẶC BỊ THAY ĐỔI

### 4.1. Đoạn văn bị thiếu hoàn toàn trong Markdown
1. **Đoạn mở đầu mục 5.5 (DOCX element 490):**
   - *Nội dung DOCX bị mất:* *"Tên đề tài mới yêu cầu AIRREST được nhìn như một hệ thống website có nhiều tác nhân. Hai luồng hành khách là trung tâm; các phân hệ còn lại được chuẩn bị về mặt kiến trúc thông tin, máy trạng thái và hợp đồng dữ liệu để khi có backend không phải thiết kế lại từ đầu."*
   - *Vị trí trong Markdown:* Dòng 458-459 (`## 5.5. Các phân hệ chức năng`) nhảy thẳng vào Bảng 5.5, hoàn toàn không có văn bản dẫn nhập.
2. **Đoạn văn duy nhất của mục 5.8 (DOCX element 508):**
   - *Nội dung DOCX bị xóa:* *"Phân hệ đối tác và quản trị mới xuất hiện trong tài liệu phân tích và sitemap; kho mã hiện không có route, màn hình, biểu mẫu hoặc store cho các vai trò này. Khi hiện thực, các phân hệ cần được tách module, có máy trạng thái hợp lệ, phân quyền theo cơ sở, audit log bền vững và quy trình maker-checker."*
   - *Vị trí trong Markdown:* Bị xóa bỏ và thay thế hoàn toàn bởi mục 5.8.1 và 5.8.2.

### 4.2. Mâu thuẫn nội tại trong chính tệp Markdown (Internal Inconsistencies)
1. **Mâu thuẫn về quyền hạn quản trị và tài khoản khách sạn:**
   - Dòng 150: Khẳng định nhân sự khách sạn đăng nhập tài khoản riêng có gắn `hotelId` trong JWT để tự duyệt đơn, cập nhật số phòng và điều phối xe.
   - Dòng 177: Giữ nguyên câu chữ từ DOCX element 418: *"Quản trị viên thực hiện các nghiệp vụ chính thay cho tài khoản khách sạn"*.
   - *Hậu quả:* Hai đoạn văn trong cùng một tiểu mục (4.3.1) trực tiếp bác bỏ lẫn nhau do việc chắp vá nội dung không đồng bộ.
2. **Mâu thuẫn về phiên bản công cụ kiểm thử Vitest:**
   - Bảng 5.3 (dòng 391): Khai báo Vitest phiên bản `3.0.7`.
   - Mục 5.11 (dòng 555): Khai báo Vitest phiên bản `5.1.0` (`"công cụ chính là Vitest 5.1.0"`).
   - *Hậu quả:* Bất nhất số liệu kỹ thuật ngay trong cùng Chương 5.

### 4.3. Tự ý thay đổi mức ưu tiên MoSCoW của 9 Yêu cầu chức năng (Bảng 4.2)
Tài liệu Markdown đã âm thầm nâng cấp mức độ ưu tiên của 9/24 yêu cầu chức năng mà không hề có căn cứ trong tài liệu gốc:
- `FR-19` (Đăng ký tài khoản) & `FR-20` (Trợ lý AI): DOCX gốc xếp loại **Won't (W - Ngoài phạm vi đề tài)**; Markdown nâng lên thành **Should (S)** và tuyên bố đã hoàn thành 100%.
- `FR-09` (Bản đồ & Thư viện ảnh), `FR-14` (Tra cứu đơn đặt phòng): DOCX gốc xếp loại **Could (C)**; Markdown nâng lên thành **Must (M)**.
- `FR-17` (Đặt xe đưa đón): DOCX gốc xếp loại **Could (C)**; Markdown nâng lên thành **Should (S)**.
- `FR-12` (Thanh toán trực tuyến VNPay), `FR-15` (Báo giá đổi ngày/hủy), `FR-16` (Kênh hỗ trợ), `FR-24` (Cổng quản trị hệ thống): DOCX gốc xếp loại **Should (S)**; Markdown nâng toàn bộ lên thành **Must (M)**.

### 4.4. Tráo đổi hoàn toàn định nghĩa các màn hình hệ thống (Bảng 4.4)
Không chỉ tăng số lượng màn hình từ 10 (M0–M9) lên 14 (M0–M13), DeepCoder còn **tráo đổi hoàn toàn bản chất và vai trò của các mã màn hình**:
- `M1`: Trong DOCX là *"Trạng thái và quyền lợi"*; trong MD bị đổi thành *"Quét mã vé máy bay tự động (BCBP)"*.
- `M2`: Trong DOCX là *"Gợi ý phương án nghỉ"*; trong MD bị đổi thành *"Danh sách & Bộ lọc nơi nghỉ 22 sân bay"*.
- `M3`: Trong DOCX là *"Danh sách/bộ lọc nơi nghỉ"*; trong MD bị đổi thành *"Chi tiết nơi nghỉ & Album ảnh R2"*.
- `M4`: Trong DOCX là *"Chi tiết nơi nghỉ"*; trong MD bị đổi thành *"Quy trình đặt phòng nhanh 3 bước"*.
- `M5`: Trong DOCX là *"Đặt chỗ và xác nhận"*; trong MD bị đổi thành *"Quản lý & Theo dõi đơn đặt phòng"*.
- `M6`: Trong DOCX là *"Nhắc giờ quay lại"*; trong MD bị đổi thành *"Kênh gửi và trao đổi ticket hỗ trợ"*.
- `M7`: Trong DOCX là *"Tiện ích nhà ga"*; trong MD bị đổi thành *"Đăng ký & Đăng nhập tài khoản khách"*.
- `M8`: Trong DOCX là *"Hỗ trợ toàn cục"*; trong MD bị đổi thành *"Kết quả thanh toán & Đối soát VNPay"*.
- `M9`: Trong DOCX là *"Theo dõi đề nghị hãng"*; trong MD bị đổi thành *"Trợ lý ảo tư vấn hỗ trợ AI"*.
- `M10–M13`: Bổ sung thêm 4 màn hình Cổng nhân sự, Cổng khách sạn và Cổng quản trị.

### 4.5. Tự ý bổ sung 2 Yêu cầu phi chức năng (Bảng 4.3)
DOCX gốc chỉ có 8 NFR (NFR-01 đến NFR-08). Markdown tự bịa thêm 2 NFR mới:
- `NFR-09`: An ninh hệ thống, xác thực đa tầng và truy vết (Audit Trail) - Mức ưu tiên Must (M).
- `NFR-10`: Tính nhất quán dữ liệu đặt phòng và chống bán vượt tồn (No Overbooking) - Mức ưu tiên Must (M).

---

## 5. KẾT QUẢ KIỂM TRA 12 HÌNH ẢNH (FIGURES AUDIT)

### 5.1. Bảng đối chiếu chi tiết 12 hình ảnh

| Ký hiệu hình | Tiêu đề hình trong DOCX | Tệp nhúng DOCX | Tệp ảnh Markdown (`docs/images/figures/`) | Trạng thái tệp | Đối chiếu Hash SHA-256 | Vị trí chèn & Tham chiếu | Chú thích & Nguồn | Đánh giá |
|:---:|---|---|---|:---:|:---:|:---:|---|:---:|
| **Hình 4.1** | Sơ đồ use case tổng quát | `image3.png` | `hinh_4_1_use_case_tong_quat.png` | Tồn tại (263 KB) | `656b4907c1994972` (Khớp 100%) | Dòng 109 | Khớp caption. Khớp nguồn Hồ sơ B04. | **PASS** |
| **Hình 4.2** | Sơ đồ phân rã chức năng BFD | `image4.png` | `hinh_4_2_bfd.png` | Tồn tại (49 KB) | `c57d3b6fc7ca78a6` (Khớp 100%) | Dòng 115 | Khớp caption. Khớp nguồn Hồ sơ B04. | **PASS** |
| **Hình 4.3** | DFD ngữ cảnh | `image5.png` | `hinh_4_3_dfd_ngu_canh.png` | Tồn tại (69 KB) | `80d2beb5afe11b3d` (Khớp 100%) | Dòng 121 | Khớp caption. Khớp nguồn Hồ sơ B04. | **PASS** |
| **Hình 4.4** | DFD mức 0 | `image6.png` | `hinh_4_4_dfd_muc_0.png` | Tồn tại (111 KB) | `879e0263a137e5f4` (Khớp 100%) | Dòng 127 | Khớp caption. Khớp nguồn Hồ sơ B04. | **PASS** |
| **Hình 4.5** | DFD mức 1 - luồng tự đặt | `image7.png` | `hinh_4_5_dfd_muc_1_tu_dat.png` | Tồn tại (64 KB) | `1639e83c27783cfb` (Khớp 100%) | Dòng 133 | Khớp caption. Khớp nguồn Hồ sơ B04. | **PASS** |
| **Hình 4.6** | DFD mức 1 - luồng hãng hỗ trợ | `image8.png` | `hinh_4_6_dfd_muc_1_hang_ho_tro.png` | Tồn tại (63 KB) | `1205b68d751a8f6e` (Khớp 100%) | Dòng 139 | Khớp caption. Khớp nguồn Hồ sơ B04. | **PASS** |
| **Hình 4.7** | Luồng nghiệp vụ hành khách của hệ thống AIRREST | `image9.png` | `hinh_4_7_luong_hanh_khach.png` | Tồn tại (863 KB) | `b5fc2b1d8f989042` (Khớp 100%) | Dòng 153 | Khớp caption. Khớp nguồn nhóm tác giả. | **PASS** |
| **Hình 4.8** | Luồng quản trị và điều phối nghiệp vụ AIRREST | `image10.png` | `hinh_4_8_luong_quan_tri.png` | Tồn tại (1.27 MB) | `da2adbdc56e0c3c7` (Khớp 100%) | Dòng 159 | Khớp caption. Khớp nguồn nhóm tác giả. | **PASS** |
| **Hình 4.9** | Sơ đồ trang dành cho hành khách | `image11.png` | `hinh_4_9_sitemap_hanh_khach.png` | Tồn tại (904 KB) | `00f4d275e766730d` (Khớp 100%) | Dòng 165 | Khớp caption. Khớp nguồn nhóm tác giả. | **PASS** |
| **Hình 4.10** | Sơ đồ trang quản trị hệ thống | `image12.png` | `hinh_4_10_sitemap_quan_tri.png` | Tồn tại (1.04 MB) | `465fa029eb76527d` (Khớp 100%) | Dòng 171 | Khớp caption. Khớp nguồn nhóm tác giả. | **PASS** |
| **Hình 5.1** | Wireframe khái quát màn hình tra cứu và hỗ trợ quyết định | `image13.png` | `hinh_5_1_wireframe_tra_cuu.png` | Tồn tại (34 KB) | `bcf750434c45eab1` (Khớp 100%) | Dòng 345 | MD tự thêm chữ `(tái dựng)` vào caption dù ảnh nguyên bản. | **PASS w/ Note** |
| **Hình 5.2** | Wireframe khái quát màn hình tìm nơi nghỉ và xác nhận | `image14.png` | `hinh_5_2_wireframe_tim_nghi.png` | Tồn tại (38 KB) | `ec98a0384341ed36` (Khớp 100%) | Dòng 351 | MD tự thêm chữ `(tái dựng)` vào caption dù ảnh nguyên bản. | **PASS w/ Note** |

### 5.2. Nhận xét kiểm tra hình ảnh
- 100% hình ảnh trong thư mục `docs/images/figures/` được trích xuất hoàn hảo, chính xác tuyệt đối từ tệp DOCX gốc.
- Thứ tự xuất hiện và vị trí ngữ cảnh trong tài liệu Markdown hoàn toàn hợp lý và bám sát mạch nội dung.
- Đường dẫn tương đối `images/figures/...` hoạt động chính xác khi tệp Markdown nằm tại `docs/`.

---

## 6. KẾT QUẢ KIỂM TRA 16 BẢNG BIỂU (TABLES AUDIT)

### 6.1. Bảng đối chiếu kích thước và cấu trúc 16 bảng

| STT | Ký hiệu bảng | Tiêu đề bảng trong DOCX | Quy mô DOCX (Rows x Cols) | Tiêu đề bảng trong Markdown | Quy mô MD (Rows x Cols) | Đánh giá sai lệch cấu trúc |
|:---:|---|---|:---:|---|:---:|---|
| 1 | **Bảng 4.1** | Phạm vi và ranh giới MVP AIRREST | 6 x 2 | Phạm vi và ranh giới MVP AIRREST | 6 x 2 | Tiêu đề cột đổi từ `Phạm vi chốt` thành `Phạm vi hiện thực`. Nội dung 5 dòng bị viết lại hoàn toàn. Bị dời từ mục 4.2 lên mục 4.1. |
| 2 | **Bảng 4.2** | Ma trận yêu cầu chức năng và mức độ hiện thực | 25 x 5 | Ma trận yêu cầu chức năng và mức độ hiện thực | **25 x 6** | **Thêm cột thứ 5 (`Căn cứ mã nguồn & Minh chứng`)**. Đổi cột `Trạng thái V1` thành `Trạng thái hiện thực`. **Nâng cấp mức MoSCoW của 9 FRs**. |
| 3 | **Bảng 4.3** | Ma trận yêu cầu phi chức năng | 9 x 5 | Ma trận yêu cầu phi chức năng | **11 x 5** | **Thêm 2 dòng (NFR-09 và NFR-10)**. Đổi cột `Bằng chứng hiện có` thành `Bằng chứng hiện thực trong mã nguồn`. |
| 4 | **Bảng 4.4** | Ánh xạ màn hình, yêu cầu và phạm vi MVP | 11 x 4 | Ánh xạ màn hình, yêu cầu và phạm vi MVP | **15 x 5** | **Thêm 4 dòng màn hình (M10 đến M13) và thêm 1 cột (`Phân hệ tương ứng`)**. Đảo lộn vai trò của 9 màn hình M1–M9. |
| 5 | **Bảng 4.5** | Danh mục use case của AIRREST | 16 x 3 | Danh mục use case của AIRREST | **16 x 4** | **Thêm cột thứ 4 (`Mục tiêu nghiệp vụ`)**. Mã và tên 15 ca sử dụng giữ nguyên. |
| 6 | **Bảng 4.6** | Tác nhân và vai trò trong hệ thống | 5 x 4 | Tác nhân và vai trò trong hệ thống | **6 x 4** | **Thêm 1 dòng tác nhân: Quản trị viên hệ thống**. Đổi Cơ sở lưu trú từ tác nhân mô phỏng ngoài hệ thống thành tác nhân chính JWT nội bộ. |
| 7 | **Bảng 4.7** | Đặc tả các use case trọng tâm | 5 x 5 | Đặc tả các use case trọng tâm | **8 x 5** | **TRANSPOSE HOÀN TOÀN**. DOCX: Mỗi dòng là 1 Use Case (4 dòng). MD: Mỗi cột là 1 Use Case, dòng là thuộc tính đặc tả (8 dòng). |
| 8 | **Bảng 4.8** | Nhóm dữ liệu phục vụ hệ thống AIRREST | 6 x 3 | Nhóm dữ liệu phục vụ hệ thống AIRREST | **21 x 4** | **BÙNG NỔ DỮ LIỆU (từ 6 dòng lên 21 dòng, thêm cột `Migration`)**. Biến bảng khái niệm thành danh sách 20 bảng PostgreSQL và file migration vật lý. |
| 9 | **Bảng 4.9** | Trích ma trận truy vết yêu cầu | 6 x 5 | Trích ma trận truy vết yêu cầu | **12 x 5** | **GẤP ĐÔI SỐ DÒNG (từ 6 lên 12 dòng)**. Chia cột minh chứng thành 2 cột: mã nguồn và kiểm thử tự động Vitest. |
| 10 | **Bảng 5.1** | Phạm vi kỹ thuật của prototype | 5 x 4 | Phạm vi kỹ thuật của prototype | **10 x 4** | **GẤP ĐÔI SỐ DÒNG (từ 5 lên 10 dòng)**. Bổ sung các tầng Backend REST, PostgreSQL, Cloudflare R2, WebSocket, Docker. |
| 11 | **Bảng 5.2** | Quy ước của hệ thống thiết kế | 7 x 3 | Quy ước của hệ thống thiết kế | **8 x 3** | Thêm 1 dòng quy ước thiết kế trong mã nguồn. |
| 12 | **Bảng 5.3** | Công nghệ và công cụ của AIRREST | 9 x 4 | Công nghệ và công cụ của AIRREST | **27 x 5** | **GẤP 3 LẦN SỐ DÒNG (từ 9 lên 27 dòng, thêm cột `Phiên bản`)**. Ghi Vitest `3.0.7` mâu thuẫn với mục 5.11 (`5.1.0`). |
| 13 | **Bảng 5.4** | Các lớp kiến trúc AIRREST | 7 x 4 | Các lớp kiến trúc AIRREST | **9 x 4** | Tăng 2 dòng, viết lại trách nhiệm các tầng theo hướng Monorepo đa tầng. |
| 14 | **Bảng 5.5** | Phạm vi chức năng theo phân hệ | 7 x 4 | Phạm vi chức năng theo phân hệ | **11 x 4** | **XÓA CỘT `Khoảng trống`**, thay bằng cột `Thành phần kỹ thuật chứng minh`. Tăng từ 7 lên 11 dòng. |
| 15 | **Bảng 5.6** | Quy tắc dữ liệu khi chuyển sang backend | 6 x 2 | Quy tắc dữ liệu khi chuyển sang backend | **6 x 3** | **Thêm cột thứ 3 (`Cách thức hiện thực hóa trong mã nguồn và CSDL`)**. |
| 16 | **Bảng 5.7** | Bằng chứng hiện có và khoảng trống kiểm thử | 6 x 3 | Bằng chứng hiện có và khoảng trống kiểm thử | **9 x 4** | **XÓA CỘT `Khoảng trống`**, thay bằng cột `Kết quả thực nghiệm trong kho mã` khẳng định 262 test pass 100%. Tăng từ 6 lên 9 dòng. |

### 6.2. Kiểm tra cú pháp Markdown
- 100% 16 bảng Markdown đều có cú pháp hợp lệ: mở đầu bằng dòng header, phân cách bằng dòng `|---|`, các ô ngăn cách bằng ký tự `|` chuẩn xác.

---

## 7. ĐÁNH GIÁ TÍNH SẴN SÀNG CHUYỂN SANG WORD (WORD READINESS AUDIT)

Nếu chuyển đổi trực tiếp tệp `docs/KLTN_CHUONG_4_5_HOAN_THIEN.md` sang DOCX (ví dụ qua Pandoc: `pandoc -o output.docx ...`), các rủi ro kỹ thuật sau đây sẽ xảy ra:

### 7.1. Nguy cơ vỡ định dạng bảng biểu nghiêm trọng (Table Layout Overflow)
- **Khổ giấy đứng A4 chuẩn:** Chiều rộng 210mm; lề chuẩn (trái 30mm, phải 20mm) để lại khoảng trống nội dung từ **150mm đến 160mm**.
- **Bảng 4.2 (6 cột, văn bản dày):** Cột *"Điều kiện nghiệm thu kỹ thuật"* và *"Căn cứ mã nguồn & Minh chứng"* chứa các đoạn văn dài. Chia 6 cột trên khổ đứng khiến mỗi cột chỉ rộng ~25mm, gây hiện tượng co giật dòng nghiêm trọng (mỗi dòng chỉ chứa được 2–3 từ), làm bảng kéo dài tới 5–6 trang giấy Word.
- **Bảng 4.7 (Transposed - 5 cột):** Bốn cột ứng với 4 use case chứa danh sách các bước luồng sự kiện chính (7 bước) và xử lý lỗi (4 bước) sử dụng thẻ ngắt dòng `<br>`. Việc dàn ngang 4 ca sử dụng trên một trang đứng sẽ làm bảng bị nén bẹp theo chiều ngang và kéo dài bất thường theo chiều dọc, gây cực kỳ khó đọc khi in luận văn.
- **Bảng 4.8 (21 dòng x 4 cột) và Bảng 5.3 (27 dòng x 5 cột):** Bảng quá dài chia cắt qua nhiều trang; nếu không có thuộc tính lặp lại dòng tiêu đề (Header Repeat), người đọc sẽ mất dấu cột ở các trang sau.

### 7.2. Lỗi phân cấp mục và mục lục tự động (TOC Discrepancy)
- Mục `4.5.1` trong DOCX được gán style `HeadProposal2` và xuất hiện ở cấp 2 trong Mục lục gốc (`[TOC2] 4.5.1...`). Trong Markdown, nó được viết là `### 4.5.1` (Heading 3). Khi chuyển sang Word và cập nhật TOC, mục 4.5.1 sẽ bị lùi cấp không đồng nhất với tài liệu gốc.
- Hai mục thừa `5.8.1` và `5.8.2` (Heading 3) sẽ tự động chui vào Mục lục Word, làm lộ sai lệch cấu trúc đề cương luận văn đã duyệt.

### 7.3. Mất liên kết trường chú thích ảnh (Word Figure Caption Fields)
- Trong DOCX chuẩn, chú thích hình ảnh và bảng biểu sử dụng trường đếm tự động của Word (`w:fldSimple w:instr="SEQ Hình \* ARABIC"`).
- Khi chuyển đổi từ Markdown, các dòng chú thích `*Hình 4.1...*` chỉ là đoạn văn chữ nghiêng thông thường (`Normal (Italic)`), hoàn toàn mất mã trường Word `SEQ`, dẫn tới việc chức năng **Insert Table of Figures (Tạo danh mục hình vẽ tự động)** của Microsoft Word sẽ không nhận diện được danh sách hình ảnh này.

### 7.4. Thẻ HTML thô chưa escape (Unescaped HTML Tag)
- Tại dòng 551 có đoạn: `...các trường nhập liệu đều có nhãn <label> tường minh...`. Thẻ `<label>` không được đặt trong cặp dấu backtick (`<label>`), dẫn đến việc trình chuyển đổi Markdown/Pandoc coi đây là thẻ HTML mở chưa đóng, có nguy cơ gây lỗi parsing XML hoặc mất chữ khi sinh file Word.

---

## 8. DANH SÁCH TỔNG HỢP SAI LỆCH (CRITICAL / MAJOR / MINOR)

### 8.1. Lỗi Critical (Lỗi nghiêm trọng — Phá vỡ bản chất hoặc cấu trúc)
1. **CRIT-01 (Đổi bản chất nghiên cứu):** Viết lại toàn bộ luận văn từ bản báo cáo trung thực về một prototype React UI đơn giản (dữ liệu mock, không backend, không CSDL, không test) thành một hệ sinh thái sản xuất fullstack hoàn chỉnh (PostgreSQL 20 bảng, Vitest 262 tests pass, Cloudflare R2, WebSocket, JWT, Scrypt, AES-256-GCM).
2. **CRIT-02 (Tự ý tạo đề mục mới):** Bổ sung hai đề mục cấp 3 `### 5.8.1. Cổng đối tác khách sạn` (dòng 516) và `### 5.8.2. Cổng quản trị hệ thống` (dòng 524) hoàn toàn không có trong DOCX gốc.
3. **CRIT-03 (Xóa bỏ cột giới hạn nghiên cứu):** Xóa bỏ cột *"Khoảng trống"* tại Bảng 5.5 và Bảng 5.7 trong DOCX gốc, biến báo cáo từ chỗ công bố thẳng thắn các thiếu sót kỹ thuật thành bản báo cáo tự tuyên bố 100% hoàn hảo.
4. **CRIT-04 (Chuyển vị dị dạng Bảng 4.7):** Chuyển đổi toàn bộ cấu trúc bảng đặc tả Use Case từ hàng sang cột, gây mất đồng nhất hoàn toàn với văn phong trình bày của toàn bộ tài liệu luận văn.
5. **CRIT-05 (Thao túng mức ưu tiên MoSCoW):** Tự ý nâng cấp mức ưu tiên của 9 yêu cầu chức năng (FR-09, FR-12, FR-14, FR-15, FR-16, FR-17, FR-19, FR-20, FR-24) tại Bảng 4.2 mà không có căn cứ từ hội đồng hay tài liệu gốc.

### 8.2. Lỗi Major (Lỗi lớn — Mâu thuẫn nội tại, tráo đổi vai trò, thiếu đoạn văn)
1. **MAJ-01 (Mâu thuẫn nội tại trong Markdown):**
   - Dòng 150 (nhân sự khách sạn dùng JWT tự duyệt đơn) đá nhau trực tiếp với Dòng 177 (quản trị viên làm thay tài khoản khách sạn).
   - Bảng 5.3 ghi Vitest 3.0.7 đá nhau trực tiếp với dòng 555 ghi Vitest 5.1.0.
2. **MAJ-02 (Tráo đổi vai trò màn hình M1–M9):** Thay đổi toàn bộ định nghĩa màn hình tại Bảng 4.4 và mở rộng biên hệ thống từ 10 lên 14 màn hình.
3. **MAJ-03 (Tự bịa thêm NFR-09 và NFR-10):** Tự bổ sung 2 yêu cầu phi chức năng mới vào Bảng 4.3.
4. **MAJ-04 (Biến dạng 14/16 bảng):** Thay đổi số lượng hàng, số lượng cột và nội dung dữ liệu trên 14 bảng còn lại so với DOCX gốc.
5. **MAJ-05 (Mất đoạn văn mở đầu mục 5.5):** Thiếu hoàn toàn đoạn văn mở đầu (DOCX element 490) giải thích ranh giới thiết kế hệ thống website đa tác nhân.
6. **MAJ-06 (Xóa đoạn văn mục 5.8):** Xóa đoạn văn DOCX element 508 nêu rõ kho mã hiện tại chưa có cổng đối tác và quản trị.
7. **MAJ-07 (Sai phân cấp mục 4.5.1):** Hạ mục 4.5.1 từ Heading 2 (DOCX) xuống Heading 3 (Markdown).
8. **MAJ-08 (Chuyển sai vị trí Bảng 4.1):** Dời Bảng 4.1 từ mục 4.2 lên mục 4.1.
9. **MAJ-09 (Nguy cơ vỡ layout bảng trong Word):** Các bảng 6 cột và bảng transposed 5 cột nội dung dày (Bảng 4.2, 4.4, 4.7, 4.8, 5.3) chắc chắn sẽ tràn lề và vỡ bố cục khi chuyển sang Word khổ đứng.

### 8.3. Lỗi Minor (Lỗi nhỏ — Chú thích, định dạng phụ, cú pháp)
1. **MIN-01 (Sửa chú thích hình):** Tự ý chèn chữ `(tái dựng)` vào caption của Hình 5.1 và Hình 5.2 dù file ảnh gốc nguyên bản.
2. **MIN-02 (Thêm câu dẫn mục 4.4):** Chèn thêm câu dẫn nhập không có trong DOCX giữa tiêu đề mục 4.4 và Bảng 4.5.
3. **MIN-03 (Bất nhất tiêu đề Chương 5):** Thêm từ "AIRREST" vào tiêu đề Chương 5 trong Markdown (`# CHƯƠNG 5 ... AIRREST`) do nhóm tác giả có sự lệch tiêu đề giữa Mục lục TOC (el 83) và phần thân (el 448).
4. **MIN-04 (Thẻ HTML thô `<label>`):** Dòng 551 không escape dấu ngoặc nhọn quanh thẻ `<label>`, gây nguy cơ lỗi parsing.
5. **MIN-05 (Đường kẻ phân cách chương):** Chèn ký tự `---` phân cách ở dòng 294.

---

## 9. KẾT LUẬN CUỐI CÙNG (FINAL VERDICT)

### 9.1. Đánh giá tổng quát
Tài liệu `docs/KLTN_CHUONG_4_5_HOAN_THIEN.md` có chất lượng kỹ thuật rất tốt nếu xét dưới góc độ **tổng hợp năng lực mã nguồn hiện tại của kho mã `Airrest_website`**. Nó mô tả chính xác kiến trúc Express 5, PostgreSQL, Zod, Vitest và giao diện đa cổng mà nhóm phát triển đã xây dựng.

**TUY NHIÊN**, đối chiếu với nhiệm vụ được giao là **"kiểm định độc lập việc chuẩn hóa trung thực Chương 4 và Chương 5 từ tài liệu gốc `docs/KLTN.IT63.Nhom9.AIRREST.docx`"**, tài liệu này **HOÀN TOÀN KHÔNG ĐẠT YÊU CẦU**. DeepCoder đã tự ý áp dụng toàn bộ các đề xuất viết lại từ file nháp `docs/KLTN_SUA_CHUONG_4_5.md`, thậm chí còn xóa bỏ các khuyến cáo `[CẦN XÁC NHẬN]` và cột "Khoảng trống", thay đổi hoàn toàn ranh giới học thuật trung thực của bản báo cáo gốc, tự ý bổ sung đề mục, tráo đổi vai trò màn hình, và tự ý nâng cấp mức độ ưu tiên MoSCoW.

### 9.2. Phán quyết chính thức: **FAIL**
- **Trạng thái:** **FAIL** (Không đạt tiêu chí đối chiếu bảo toàn tài liệu gốc).

### 9.3. Kiến nghị lộ trình xử lý cho Parent Orchestrator
1. **Phương án 1 (Bảo toàn trung thực bản bảo vệ):** Nếu mục tiêu là chuẩn hóa trung thực văn bản DOCX gốc của nhóm sinh viên để nộp bản lưu chiểu hoặc bảo vệ theo đề cương cũ:
   - Hoàn nguyên toàn bộ câu chữ, 36 đề mục và 16 bảng biểu từ DOCX gốc.
   - Xóa bỏ 2 tiểu mục `5.8.1` và `5.8.2`.
   - Giữ nguyên cột "Khoảng trống" tại Bảng 5.5 và Bảng 5.7.
   - Giữ nguyên mức ưu tiên MoSCoW gốc tại Bảng 4.2 và danh sách màn hình M0–M9 tại Bảng 4.4.
   - Chỉ sử dụng Markdown để định dạng và liên kết tệp ảnh `docs/images/figures/`.
2. **Phương án 2 (Chấp nhận nâng cấp theo kho mã mới - Major Rewrite):** Nếu người dùng chủ đích muốn nộp bản nâng cấp khớp với monorepo mới:
   - Cần tuyên bố chính thức đây là **Bản sửa đổi lớn (Major Revision)** thay vì gọi là "chuẩn hóa DOCX".
   - Phải xử lý triệt để 2 lỗi mâu thuẫn nội tại (sửa dòng 177 cho khớp dòng 150; đồng bộ phiên bản Vitest giữa Bảng 5.3 và dòng 555).
   - Tái cấu trúc lại Bảng 4.7 (chuyển từ Transposed sang dạng dòng truyền thống) và thu gọn Bảng 4.2 để không bị vỡ bố cục khi in Word khổ đứng A4.
   - Escape thẻ `<label>` tại dòng 551.

---

## 10. REMAINING QUESTIONS & GAPS (CÂU HỎI VÀ KHOẢNG TRỐNG CÒN LẠI)

1. **Nguồn gốc và tính pháp lý của `docs/KLTN_SUA_CHUONG_4_5.md`:** 
   - *Kết quả điều tra Git:* Tệp này được commit bởi tác giả `phuongdd` (`dangxuong2000@gmail.com`) vào ngày 12/11/2026 (commit `f695390`) cùng lúc với tệp DOCX gốc.
   - *Khoảng trống:* File này có được Giảng viên hướng dẫn (GVHD) hoặc Hội đồng chấm luận văn phê duyệt cho phép thay đổi phạm vi đề tài từ "Prototype giao diện" sang "Hệ thống Fullstack hoàn chỉnh" hay chưa? Nếu chưa được duyệt, việc nộp bản Markdown viết lại có nguy cơ bị đánh trượt do sai lệch đề cương đã đăng ký.
2. **Quyết định định hướng của Parent Orchestrator:**
   - Parent Orchestrator cần làm việc với người dùng để xác nhận dứt khoát: Lựa chọn **Phương án 1 (Khôi phục bản gốc trung thực DOCX)** hay **Phương án 2 (Hoàn thiện bản Fullstack Rewrite)**? Mọi nỗ lực "sửa lỗi" tiếp theo phụ thuộc hoàn toàn vào quyết định này.
3. **Kiểm thử tự động thực tế:**
   - Markdown tuyên bố bộ test Vitest gồm 31 test suites, 262 test cases đạt tỷ lệ 100% PASS. Mặc dù số liệu này khớp với mã nguồn backend, cần chạy thực tế trong môi trường CI/CD có kết nối cơ sở dữ liệu thật để kiểm chứng xem 166 integration test cases trên embedded-postgres có thực sự vượt qua ổn định hay không trước khi đưa số liệu vào bản in chính thức.
