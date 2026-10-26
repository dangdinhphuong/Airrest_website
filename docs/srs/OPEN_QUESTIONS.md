# Open Questions — Airrest SRS

Phiên bản v0.6 · 2026-10-26 · Gửi chủ sản phẩm. Quyết định của chủ sản phẩm (2026-10-26): **mâu thuẫn được ưu tiên xử lý theo MVP**. Mục nào MVP không nêu thì vẫn Mở. Hai nguồn vẫn được ghi để truy vết.

Đường dẫn tương đối với `go/apps/manufacture/test/Airrest_website`. `src/main.jsx:n` là số dòng trong prototype.

## Tổng hợp

| ID | Loại | Liên quan | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| OQ-01 | Mâu thuẫn | MB-19; NFR-005, NFR-006, TBD-NFR-07 | Cao | Đã quyết định theo MVP |
| OQ-02 | Mâu thuẫn | MB-05, MB-07, MB-10, MB-14, MB-18, MB-20 | Cao | Đã quyết định theo MVP |
| OQ-03 | Mâu thuẫn | MB-14, MB-15; FR-022 | Cao | Đã quyết định theo MVP |
| OQ-04 | Mâu thuẫn | MB-04, MB-08; FR-006, FR-014, FR-016, FR-023 | Cao | Mở một phần |
| OQ-05 | Mâu thuẫn | MB-04; FR-007 | Trung bình | Mở một phần |
| OQ-06 | Thiếu thông tin (Blocked) | MB-03, MB-20; FR-005, NFR-008, DR-002 | Cao | Mở một phần (đã nghiên cứu) |
| OQ-07 | Thiếu thông tin | MB-11; FR-019 | Cao | Mở một phần (đã nghiên cứu) |
| OQ-08 | Thiếu thông tin | MB-12, MB-13, MB-14; FR-019–FR-023, BR-014, DR-007 | Cao | Mở một phần (đã nghiên cứu) |
| OQ-09 | Mâu thuẫn | MB-08; FR-014, FR-015, DR-006 | Trung bình | Mở một phần |
| OQ-10 | Mâu thuẫn | MB-07; FR-012, DR-005 | Trung bình | Mở một phần |
| OQ-11 | Thiếu thông tin | MB-07; FR-013 | Trung bình | Mở |
| OQ-12 | Mâu thuẫn | MB-10; FR-018, BR-013, DR-009 | Trung bình | Đã quyết định theo MVP |
| OQ-13 | Thiếu thông tin | MB-09; FR-007, FR-017, DR-008 | Trung bình | Mở một phần (đã nghiên cứu) |
| OQ-14 | Giả định cần xác nhận | Toàn hệ thống; DR-001 | Trung bình | Mở |
| OQ-15 | Thiếu thông tin | MB-01, MB-05; IFR-001, DR-003 | Trung bình | Mở |
| OQ-16 | Thiếu thông tin | MB-17; NFR-001–NFR-003 | Trung bình | Mở một phần (đã nghiên cứu) |
| OQ-17 | Thiếu thông tin | MB-18; NFR-004 | Thấp | Mở |
| OQ-18 | Thiếu thông tin | MB-19; NFR-005, TBD-NFR-08 | Trung bình | Mở một phần (đã nghiên cứu) |
| OQ-19 | Thiếu thông tin | MB-20; NFR-008, NFR-009 | Trung bình | Mở |
| OQ-20 | Giả định cần xác nhận | Toàn bộ | Cao | Mở |
| OQ-21 | Thiếu thông tin | MB-11–MB-14; IFR-002, FR-019–FR-021 | Trung bình | Mở |
| OQ-22 | Thiếu thông tin | MB-02, MB-20; FR-003, FR-004, NFR-007 | Trung bình | Mở một phần (đã nghiên cứu) |
| OQ-23 | Thiếu thông tin | MB-01; FR-001, FR-002, DR-001 | Thấp | Mở |
| OQ-24 | Thiếu thông tin | MB-05; FR-008–FR-010 | Trung bình | Mở |
| OQ-25 | Thiếu thông tin | MB-05, MB-06; BR-003, FR-008, FR-011 | Trung bình | Mở |
| OQ-26 | Thiếu thông tin | NFR-006; BR-001 | Thấp | Mở |
| OQ-27 | Rủi ro | Prototype | Trung bình | Mở |
| OQ-28 | Thiếu thông tin | MVP cột Sprint, Nguồn | Thấp | Mở |
| OQ-29 | Mâu thuẫn | FR-016, FR-022, DR-005 | Trung bình | Đã quyết định theo MVP |
| OQ-30 | Thiếu thông tin | TBD-NFR-01 đến TBD-NFR-06 | Thấp | Mở |
| OQ-31 | Giả định cần xác nhận | FR-005, FR-019; D-01, D-05 | Cao | Mở một phần (đã nghiên cứu) |
| OQ-32 | Giả định cần xác nhận | FR-011, DR-004; D-06 | Trung bình | Mở |
| OQ-33 | Thiếu thông tin | FR-019–FR-021; G-05, G-06; D-04 | Trung bình | Mở một phần (đã nghiên cứu) |
| OQ-34 | Thiếu thông tin | FR-014, FR-015; G-12; D-03 | Trung bình | Mở một phần (đã nghiên cứu) |
| OQ-35 | Thiếu thông tin (xác minh) | FR-005, DR-002, NFR-008; G-17 | Cao | Đã giải quyết bằng nguồn chính thức |
| OQ-36 | Mâu thuẫn | BR-006, FR-005; D-10 | Cao | Mở |
| OQ-37 | Thiếu thông tin (xác minh) | G-17, G-14 | Thấp | Mở |
| OQ-38 | Giả định cần xác nhận | FR-024, FR-031 | Cao | Mở |
| OQ-39 | Mâu thuẫn | FR-028, FR-029 | Cao | Mở |
| OQ-40 | Mâu thuẫn | FR-020, FR-021, FR-027, FR-033 | Cao | Mở |
| OQ-41 | Thiếu thông tin | FR-025 đến FR-034 | Trung bình | Mở |
| OQ-42 | Thiếu thông tin | BR-016, BR-017 | Trung bình | Mở |

## Chi tiết

### OQ-01 — MB-19 thực sự gắn với NFR-04 (song ngữ) hay chỉ NFR-05? Yêu cầu nhãn mô phỏng thuộc NFR nào?

- **Trạng thái:** Đã quyết định theo MVP
- **Loại:** Mâu thuẫn · **Ưu tiên:** Cao · **Liên quan:** MB-19; NFR-005, NFR-006, TBD-NFR-07
- **Nguồn A:** `docs/MVP.md` MB-19: cột FR/NFR = “NFR-04,05”, hạng mục “Riêng tư và mô phỏng”, AC “Không thu dữ liệu ngoài phạm vi; mọi giao dịch/role mô phỏng có nhãn”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` mục 4: NFR-04 = “Ngôn ngữ dễ hiểu, song ngữ” (Should; mục 6.1: “Để sau MVP”); NFR-05 = “Bảo vệ dữ liệu cá nhân”.
- **Ảnh hưởng đến SRS:** Mã NFR-04 không khớp nội dung MB-19. Không rõ MVP có yêu cầu song ngữ VI/EN hay không.
- **Câu hỏi cho chủ sản phẩm:** MB-19 thực sự gắn với NFR-04 (song ngữ) hay chỉ NFR-05? Yêu cầu nhãn mô phỏng thuộc NFR nào?
- **Xử lý tạm trong SRS:** SRS tách NFR-005 (riêng tư) và NFR-006 (nhãn mô phỏng, không gắn mã NFR-04); song ngữ ghi TBD-NFR-07.
- **Quyết định (2026-10-26) — Đã quyết định theo MVP:** Theo AC của MB-19: chỉ yêu cầu riêng tư và nhãn mô phỏng. Không có yêu cầu song ngữ trong MVP. Lệch mã NFR-04 chỉ là vấn đề ghi chú trong MVP.

### OQ-02 — Giữ nguyên ưu tiên theo MVP.md cho toàn bộ các dòng nêu trên, hay cập nhật MVP.md/B03?

- **Trạng thái:** Đã quyết định theo MVP
- **Loại:** Mâu thuẫn · **Ưu tiên:** Cao · **Liên quan:** MB-05, MB-07, MB-10, MB-14, MB-18, MB-20
- **Nguồn A:** `docs/MVP.md`: ưu tiên và phạm vi từng dòng (xem bảng bên dưới).
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` mục 3, 4 và 6.1: ưu tiên của từng FR/NFR gốc (xem bảng bên dưới).
- **Ảnh hưởng đến SRS:** Cùng một mã FR/NFR có mức ưu tiên và phạm vi khác nhau giữa hai nguồn.
- **Câu hỏi cho chủ sản phẩm:** Giữ nguyên ưu tiên theo MVP.md cho toàn bộ các dòng nêu trên, hay cập nhật MVP.md/B03?
- **Xử lý tạm trong SRS:** SRS giữ nguyên ưu tiên MVP.md (nguồn phạm vi chính). Các phần B03 chưa khớp được ghi “Proposed”.
- **Quyết định (2026-10-26) — Đã quyết định theo MVP:** Giữ ưu tiên, Sprint và phạm vi của MVP cho cả 6 mục; phần “Để sau MVP” của B03 không áp dụng.

| Hạng mục | MVP.md | B03 |
|---|---|---|
| MB-05 (FR-08) | Must (cùng dòng với FR-06, FR-07) | FR-08: S (Should) |
| MB-07 (FR-12) | Must, “≥2 cách trả mô phỏng” | FR-12: S; mục 6.1: “Để sau MVP” |
| MB-10 (FR-16) | Could; MVP = “Không/giản lược” | FR-16: S; M8 nằm trong danh sách màn hình MVP |
| MB-14 (FR-24) | Must | FR-24: S |
| MB-18 (NFR-03) | Must | NFR-03: S; mục 6.1: “Để sau MVP” |
| MB-20 (NFR-08) | Must | NFR-08: S; mục 6.1: “Để sau MVP” |

### OQ-03 — Việc “giữ” sau khi chuyển tự chi trả chỉ là giữ mã/trạng thái (MB-14 AC) hay gồm cả lưu chứng từ? Nút bản đồ trong prototype có được giữ không?

- **Trạng thái:** Đã quyết định theo MVP
- **Loại:** Mâu thuẫn · **Ưu tiên:** Cao · **Liên quan:** MB-14, MB-15; FR-022
- **Nguồn A:** `docs/MVP.md` MB-15: FR-09 (bản đồ), FR-14 (gọi xe), FR-17 (lưu chứng từ) “Không / Sau MVP / Đã loại”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-22, FR-24 và `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC09, UC14, KT-06, KT-09: yêu cầu “giữ chứng từ đề nghị (FR-17)” khi hãng từ chối/chuyển tự chi trả; B04 UC04 tham chiếu FR-09. `src/main.jsx`:205 có nút “Xem trên bản đồ”.
- **Ảnh hưởng đến SRS:** Luồng L2 trong B03/B04 phụ thuộc chức năng mà MVP đã loại.
- **Câu hỏi cho chủ sản phẩm:** Việc “giữ” sau khi chuyển tự chi trả chỉ là giữ mã/trạng thái (MB-14 AC) hay gồm cả lưu chứng từ? Nút bản đồ trong prototype có được giữ không?
- **Xử lý tạm trong SRS:** SRS chỉ yêu cầu giữ mã/trạng thái (đúng AC MB-14); không đặc tả chứng từ, bản đồ, gọi xe.
- **Quyết định (2026-10-26) — Đã quyết định theo MVP:** FR-09, FR-14, FR-17 ngoài phạm vi. Sau khi chuyển tự chi trả chỉ giữ mã/trạng thái; không có chứng từ. Nút “Xem trên bản đồ” của prototype không thuộc MVP.
- **Kết quả nghiên cứu (v0.3):** Nghiên cứu (G-04, G-08, R-08, R-09): người tự chi trả cần giữ hóa đơn để đòi lại. Đề xuất D-07: giữ nguyên MVP.

### OQ-04 — Chốt công thức thời gian nghỉ thực tế, thời gian có mặt tại sân bay trước giờ bay và thời gian dự phòng.

- **Trạng thái:** Mở một phần
- **Loại:** Mâu thuẫn · **Ưu tiên:** Cao · **Liên quan:** MB-04, MB-08; FR-006, FR-014, FR-016, FR-023
- **Nguồn A:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-05: thời gian nghỉ thực tế = (giờ phải có mặt lại) – (giờ hiện tại) – (2 × thời gian di chuyển); ví dụ có mặt trước giờ bay 2 tiếng. FR-13: giờ rời = giờ có mặt – di chuyển – 15 phút (ví dụ bay 06:00, có mặt 04:00, đi 15 phút → 03:30).
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC03: … – thời gian đi/về – 60 phút dự phòng. UC07: giờ có mặt mặc định 90 phút nội địa. KT-10: bay 09:00, có mặt 07:30, đi 45 phút → rời 06:30. `src/main.jsx`:183, 291–296: rời 03:30, có mặt 04:00 (bay 06:00).
- **Ảnh hưởng đến SRS:** Hai công thức và hai giá trị giờ có mặt (120 so với 90 phút) cho cùng chức năng; AC “tính đúng” không kiểm thử được.
- **Câu hỏi cho chủ sản phẩm:** Chốt công thức thời gian nghỉ thực tế, thời gian có mặt tại sân bay trước giờ bay và thời gian dự phòng.
- **Xử lý tạm trong SRS:** SRS không ghi công thức; AC về giá trị số được đánh dấu TBD và chưa có mã TC.
- **Quyết định (2026-10-26) — Mở một phần:** MVP chỉ nêu “tính đúng giờ rời” và “giải thích thời gian nghỉ”, không có công thức. Chưa thể chốt theo MVP; cần chủ sản phẩm chọn công thức B03 hay B04.
- **Kết quả nghiên cứu (v0.3):** Nghiên cứu (G-10, R-01, R-07): mốc pháp lý tối thiểu là đóng quầy 40 phút trước giờ đi; 90 hay 120 phút đều hợp lệ. Đề xuất D-02: tham số cấu hình.

### OQ-05 — Hai nhánh cụ thể là gì (ở lại / đi nghỉ)? Có dùng ngưỡng 3 giờ và 6 giờ của B04 không?

- **Trạng thái:** Mở một phần
- **Loại:** Mâu thuẫn · **Ưu tiên:** Trung bình · **Liên quan:** MB-04; FR-007
- **Nguồn A:** `docs/MVP.md` MB-04 AC: “có hai nhánh lựa chọn”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-05: ba phương án (Ở lại sân bay / Nghỉ trong nhà ga / Đi khách sạn). `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC03: <3 giờ ở lại, 3–6 giờ thuê theo giờ/hộp ngủ, >6 giờ khách sạn. `src/main.jsx`:178–198: ba thẻ phương án.
- **Ảnh hưởng đến SRS:** Số nhánh và ngưỡng thời gian chưa thống nhất.
- **Câu hỏi cho chủ sản phẩm:** Hai nhánh cụ thể là gì (ở lại / đi nghỉ)? Có dùng ngưỡng 3 giờ và 6 giờ của B04 không?
- **Xử lý tạm trong SRS:** SRS yêu cầu hai nhánh theo MVP; ngưỡng ghi TBD.
- **Quyết định (2026-10-26) — Mở một phần:** Theo MVP: hai nhánh (ở lại / đi nghỉ). Ngưỡng thời gian và tên nhánh vẫn chưa xác định.

### OQ-06 — Ai kiểm chứng văn bản gốc, khi nào, và nội dung nào được phép đưa vào SRS?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin (Blocked) · **Ưu tiên:** Cao · **Liên quan:** MB-03, MB-20; FR-005, NFR-008, DR-002
- **Nguồn A:** `docs/MVP.md` MB-03: Trạng thái duyệt “Blocked”, ghi chú “Phải kiểm chứng văn bản gốc”. MB-20: “Blocked”, “Kiểm chứng pháp lý”.
- **Nguồn B:** `BTHQUAN/00_DOC_TRUOC.txt` (mục 4 và “Lưu ý pháp lý”): toàn văn NĐ 208/2026 và hiệu lực TT 36/2014 sau 01/7/2026 còn chờ kiểm chứng. `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-04 nêu ví dụ bồi thường “440.000đ” (chưa kiểm chứng).
- **Ảnh hưởng đến SRS:** Mốc giờ, khung giờ, mức bồi thường, điều khoản và điều kiện đủ để đề nghị hãng hỗ trợ chưa thể đặc tả.
- **Câu hỏi cho chủ sản phẩm:** Ai kiểm chứng văn bản gốc, khi nào, và nội dung nào được phép đưa vào SRS?
- **Xử lý tạm trong SRS:** SRS chỉ đặc tả hành vi hiển thị (mốc/nguồn/điều kiện/không kết luận khi chưa rõ); giá trị cụ thể TBD, không có TC.
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-17, R-19, R-01): đã đối chiếu bản chính thức NĐ 208 Điều 36–40 và TT 48 Điều 4–8; mức 440.000đ, mốc 2/3/4/6 giờ khớp. Điểm lệch với B03 ghi ở bảng C.1. Còn lại: chủ sản phẩm phê duyệt nội dung và gỡ Blocked của MB-03/MB-20.

### OQ-07 — Điều kiện được phép gửi đề nghị là gì, và nếu không đủ điều kiện thì hệ thống phản hồi thế nào?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Cao · **Liên quan:** MB-11; FR-019
- **Nguồn A:** `docs/MVP.md` MB-11 AC: “Tạo mã và trạng thái chờ; nhãn mô phỏng; có tự chi trả” (không nêu điều kiện được gửi).
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-21: chỉ khi FR-04 xác định đủ điều kiện (chậm ≥6 giờ hoặc khung 22h–7h, nguyên nhân thuộc trách nhiệm hãng). `src/main.jsx`:249–253: nút gửi hiển thị vô điều kiện.
- **Ảnh hưởng đến SRS:** Không rõ khi nào hệ thống cho phép hoặc chặn việc gửi đề nghị.
- **Câu hỏi cho chủ sản phẩm:** Điều kiện được phép gửi đề nghị là gì, và nếu không đủ điều kiện thì hệ thống phản hồi thế nào?
- **Xử lý tạm trong SRS:** SRS không đặt điều kiện gửi; ghi TBD.
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-02, R-19): điều kiện văn bản: chậm ≥6 giờ (hoặc chờ ≥6 giờ sau hủy) + có vé, xác nhận chỗ, có mặt; không có điều kiện lỗi cho nơi nghỉ; 22h–7h chỉ đổi loại nơi nghỉ. Còn lại: chủ sản phẩm phê duyệt D-01 (hiển thị, không chặn).

### OQ-08 — Chốt state machine của yêu cầu hỗ trợ (trạng thái, chuyển tiếp hợp lệ, trạng thái cuối) và định dạng mã.

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Cao · **Liên quan:** MB-12, MB-13, MB-14; FR-019–FR-023, BR-014, DR-007
- **Nguồn A:** `docs/MVP.md` MB-14: ghi chú “Cần state machine”; AC “Giữ mã/trạng thái; chuyển đúng M3; xử lý giờ bay mới”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` mục 6.4: 8 trạng thái, trong đó “7. Giờ bay cập nhật” là sự kiện áp dụng cho mọi trạng thái và “1. Đủ điều kiện hỗ trợ” xảy ra trước khi có yêu cầu. Mã yêu cầu: B04 KT dùng “HT-xxx”, `src/main.jsx`:250 dùng “AR-1028”.
- **Ảnh hưởng đến SRS:** Tập trạng thái, quy tắc chuyển, định dạng mã, thời gian chờ (B04 UC11: 15 phút mô phỏng) và hành vi “xử lý giờ bay mới” chưa được xác định.
- **Câu hỏi cho chủ sản phẩm:** Chốt state machine của yêu cầu hỗ trợ (trạng thái, chuyển tiếp hợp lệ, trạng thái cuối) và định dạng mã.
- **Xử lý tạm trong SRS:** SRS chỉ ghi AC từ MVP; bảng trạng thái ở SRS mục 4.3 là đề xuất từ B03, chưa phải yêu cầu.
- **Kết quả nghiên cứu (v0.3):** Nghiên cứu (G-06, R-01): TT 48 không nêu thời hạn trả lời cho đề nghị lưu trú. Xem OQ-33.

### OQ-09 — Kênh nhắc chính là gì? “Fallback lịch” là tệp lịch tải về hay liên kết thêm vào lịch? SMS có ngoài phạm vi không?

- **Trạng thái:** Mở một phần
- **Loại:** Mâu thuẫn · **Ưu tiên:** Trung bình · **Liên quan:** MB-08; FR-014, FR-015, DR-006
- **Nguồn A:** `docs/MVP.md` MB-08 AC: “Tính đúng giờ rời; fallback lịch; tính lại khi giờ bay đổi”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-13: nhắc bằng thông báo trình duyệt/SMS/thêm vào lịch (dẫn 64% muốn SMS). `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC07: chỉ thông báo trình duyệt hoặc thêm vào lịch (không SMS).
- **Ảnh hưởng đến SRS:** SMS đòi hỏi tích hợp ngoài; MVP không quy định. Kênh chính và hình thức “lịch” chưa rõ.
- **Câu hỏi cho chủ sản phẩm:** Kênh nhắc chính là gì? “Fallback lịch” là tệp lịch tải về hay liên kết thêm vào lịch? SMS có ngoài phạm vi không?
- **Xử lý tạm trong SRS:** SRS loại SMS; kênh chính ghi theo B04 (thông báo trình duyệt) ở mức Proposed.
- **Quyết định (2026-10-26) — Mở một phần:** Theo MVP: không có SMS; có fallback lịch. Kênh nhắc chính và hình thức “lịch” vẫn chưa xác định.
- **Kết quả nghiên cứu (v0.3):** Nghiên cứu (G-12, R-13, R-14): đề xuất thông báo trình duyệt + tệp iCalendar, loại SMS (D-03). Còn OQ-34.

### OQ-10 — Một “bước” là gì? Tên gọi có bắt buộc không, tối đa bao nhiêu ký tự?

- **Trạng thái:** Mở một phần
- **Loại:** Mâu thuẫn · **Ưu tiên:** Trung bình · **Liên quan:** MB-07; FR-012, DR-005
- **Nguồn A:** `docs/MVP.md` MB-07 AC: “≤3 bước; không SĐT/email”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-11: ≤3 bước (chọn phòng → tên gọi → xác nhận); mục 6.2: M5 “Đặt chỗ (2 bước)”; mục 6.2: M0→xác nhận ≤7 lần chạm. `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC06: 5 bước. `src/main.jsx`:289, 296: “BƯỚC 1 / 2”, ô tên gọi không bắt buộc.
- **Ảnh hưởng đến SRS:** Cách đếm bước chưa thống nhất; không rõ tên gọi có bắt buộc.
- **Câu hỏi cho chủ sản phẩm:** Một “bước” là gì? Tên gọi có bắt buộc không, tối đa bao nhiêu ký tự?
- **Xử lý tạm trong SRS:** SRS giữ “≤3 bước” theo MVP; tên gọi ≤50 ký tự theo B04 ở mức Proposed.
- **Quyết định (2026-10-26) — Mở một phần:** Theo MVP: ≤3 bước, không SĐT/email. Cách đếm bước và việc tên gọi có bắt buộc vẫn chưa xác định.

### OQ-11 — Hai cách trả mô phỏng là gì?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-07; FR-013
- **Nguồn A:** `docs/MVP.md` MB-07 AC: “≥2 cách trả mô phỏng”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` mục 6.1: FR-12 “Để sau MVP”. `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC06: trả tại chỗ / QR / thẻ. `src/main.jsx`: không có bước chọn phương thức trả (chỉ nhãn “Trả tại chỗ” ở thẻ nơi nghỉ).
- **Ảnh hưởng đến SRS:** Hai cách trả cụ thể và mức độ mô phỏng chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Hai cách trả mô phỏng là gì?
- **Xử lý tạm trong SRS:** SRS yêu cầu ≥2 cách, chưa nêu cụ thể.

### OQ-12 — MB-10 giữ hay loại khỏi MVP? Nếu giữ, nội dung giản lược là gì và nguồn của số liên hệ?

- **Trạng thái:** Đã quyết định theo MVP
- **Loại:** Mâu thuẫn · **Ưu tiên:** Trung bình · **Liên quan:** MB-10; FR-018, BR-013, DR-009
- **Nguồn A:** `docs/MVP.md` MB-10: Could, “Không/giản lược”, AC “Chỉ hiển thị FAQ/liên hệ có nguồn; không giả hotline thật”, ghi chú “Có thể loại khỏi MVP”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC10: số tổng đài hãng, quầy hỗ trợ nhà ga, chat mô phỏng, 5 câu hỏi nhanh. `src/main.jsx`:261: liên kết gọi “1900 1028” và nút “Trò chuyện ngay”.
- **Ảnh hưởng đến SRS:** Không rõ “giản lược” gồm những gì; số 1900 1028 và chat có nguồn xác minh hay không.
- **Câu hỏi cho chủ sản phẩm:** MB-10 giữ hay loại khỏi MVP? Nếu giữ, nội dung giản lược là gì và nguồn của số liên hệ?
- **Xử lý tạm trong SRS:** SRS ghi Conditional; chỉ FAQ/liên hệ có nguồn.
- **Quyết định (2026-10-26) — Đã quyết định theo MVP:** Chỉ hiển thị FAQ/liên hệ có nguồn; không giả hotline. Chat mô phỏng, hotline và 5 câu hỏi nhanh của B04 không áp dụng; số 1900 1028 trong prototype phải có nguồn hoặc bỏ. MB-10 vẫn Conditional (MVP: “có thể loại”).
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-20, R-21, R-22): Vietjet đã cập nhật chính sách theo NĐ 208; Bamboo còn dẫn TT 14/2015 và 27/2017. Đề xuất D-12: chỉ trích nguồn chính thức có ngày.

### OQ-13 — Ai quyết định giữ MB-09, theo tiêu chí và thời hạn nào? Nguồn dữ liệu tiện ích?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-09; FR-007, FR-017, DR-008
- **Nguồn A:** `docs/MVP.md` MB-09: “Có điều kiện”, ghi chú “Chỉ giữ nếu còn capacity”, Sprint S3.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC08: nhà ga T1/T2 Nội Bài, T1/T3 Tân Sơn Nhất; nhóm tiện ích (ngủ, ngồi, sạc, tắm, ăn). `src/main.jsx`:190: chỉ có toast.
- **Ảnh hưởng đến SRS:** Tiêu chí “còn capacity”, người quyết định, hạn quyết định, phạm vi nhà ga và nguồn dữ liệu chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Ai quyết định giữ MB-09, theo tiêu chí và thời hạn nào? Nguồn dữ liệu tiện ích?
- **Xử lý tạm trong SRS:** SRS ghi Conditional; DR-008 chỉ gồm trường nêu trong AC.
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-18, R-28): cảng Nội Bài xác nhận hộp ngủ ở T2 tầng 2 và T1 tầng 3; không có giá, giờ, đơn vị vận hành, ngày cập nhật. Dữ liệu vẫn bị chặn.

### OQ-14 — Xác nhận địa bàn MVP (HAN, SGN) và việc đưa vào SRS như ràng buộc.

- **Trạng thái:** Mở
- **Loại:** Giả định cần xác nhận · **Ưu tiên:** Trung bình · **Liên quan:** Toàn hệ thống; DR-001
- **Nguồn A:** `docs/MVP.md`: không nêu địa bàn.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` mục 1: Nội Bài (HAN) chính, Tân Sơn Nhất (SGN) bổ sung, Đà Nẵng không thuộc MVP. `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B00_10-10_Bien-ban-chot-pham-vi.docx`: chưa có chữ ký/ý kiến GVHD. `src/main.jsx`:133: có chọn HAN/SGN; danh sách nơi nghỉ chỉ “gần Nội Bài”.
- **Ảnh hưởng đến SRS:** Địa bàn chưa được phê duyệt, nên chưa thể coi là ràng buộc bắt buộc.
- **Câu hỏi cho chủ sản phẩm:** Xác nhận địa bàn MVP (HAN, SGN) và việc đưa vào SRS như ràng buộc.
- **Xử lý tạm trong SRS:** SRS ghi địa bàn như đề xuất (Proposed).

### OQ-15 — Quy mô tối thiểu của D1/D3? Có được dùng dữ liệu A08 (thu thập từ Booking.com) làm mock không?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-01, MB-05; IFR-001, DR-003
- **Nguồn A:** `docs/MVP.md`: MB-01 “Mock D1”; MB-05 “Mock D3 ≥30 cơ sở”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` mục 6.2: D1 gồm 20 chuyến (HAN, SGN); D3 tham khảo bộ A08 (70 cơ sở, thu thập từ Booking.com ngày 11/10/2026). `src/main.jsx`:11–30, 145–147: chỉ 3 cơ sở cố định nhưng giao diện nêu “70 nơi nghỉ đã đối chiếu”.
- **Ảnh hưởng đến SRS:** Quy mô, nguồn và quyền sử dụng dữ liệu mock chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Quy mô tối thiểu của D1/D3? Có được dùng dữ liệu A08 (thu thập từ Booking.com) làm mock không?
- **Xử lý tạm trong SRS:** SRS yêu cầu D3 ≥30 cơ sở theo MVP.

### OQ-16 — Chấp thuận các ngưỡng B03 làm mục tiêu test chính thức?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-17; NFR-001–NFR-003
- **Nguồn A:** `docs/MVP.md` MB-17 AC: “Mobile-first; tác vụ cốt lõi đạt mục tiêu test; nội dung rõ”, nguồn RQ3.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx`: NFR-01 (360×800; 360–1440 px), NFR-02 (WCAG 2.2 AA), mục 6.3 (≥80% hoàn thành, ≤3 phút, hiểu đúng quyền lợi ≥4/5, SUS ≥71, 0 lỗi mức 3–4).
- **Ảnh hưởng đến SRS:** MVP không nêu số đo; các số của B03 chưa được chấp thuận.
- **Câu hỏi cho chủ sản phẩm:** Chấp thuận các ngưỡng B03 làm mục tiêu test chính thức?
- **Xử lý tạm trong SRS:** SRS đưa ngưỡng B03 ở mức Proposed; AC ngưỡng số của MVP không có TC.
- **Kết quả nghiên cứu (v0.3):** Nghiên cứu (G-16, R-15): WCAG 2.2 SC 2.5.8 AA yêu cầu ≥24×24 CSS px, khớp B03.

### OQ-17 — Màn hình nào là “màn hình chính”, đo ở môi trường nào?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Thấp · **Liên quan:** MB-18; NFR-004
- **Nguồn A:** `docs/MVP.md` MB-18: “Màn hình chính phản hồi ≤3 giây với mock data”, ghi chú “Đo trong môi trường test”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` NFR-03: ≤3 giây trên 4G, trang đầu ≤1 MB, Lighthouse mobile.
- **Ảnh hưởng đến SRS:** “Màn hình chính” và môi trường đo chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Màn hình nào là “màn hình chính”, đo ở môi trường nào?
- **Xử lý tạm trong SRS:** SRS giữ AC của MVP; thông số B03 ở mức Proposed.

### OQ-18 — Danh sách trường dữ liệu được phép thu/lưu là gì? Cho phép lưu cục bộ (ví dụ “lưu nơi nghỉ”) không?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-19; NFR-005, TBD-NFR-08
- **Nguồn A:** `docs/MVP.md` MB-19 AC: “Không thu dữ liệu ngoài phạm vi”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` mục 6.1: danh sách dữ liệu không thu; “tên gọi” lưu trong phiên; viện dẫn Luật 91/2025/QH15, NĐ 356/2025/NĐ-CP (chưa kiểm chứng — `BTHQUAN/00_DOC_TRUOC.txt`). `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` NFR-05 yêu cầu danh sách trường dữ liệu được phê duyệt. `src/main.jsx`:219: nút “Lưu nơi nghỉ” (trái tim).
- **Ảnh hưởng đến SRS:** “Phạm vi” dữ liệu được phép thu chưa được liệt kê và phê duyệt; chưa rõ có phân tích/cookie hay lưu cục bộ không.
- **Câu hỏi cho chủ sản phẩm:** Danh sách trường dữ liệu được phép thu/lưu là gì? Cho phép lưu cục bộ (ví dụ “lưu nơi nghỉ”) không?
- **Xử lý tạm trong SRS:** SRS dùng danh sách “không thu” của B04 ở mức Proposed.
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-14, R-23, R-24): Luật 91/2025 Điều 2, 9, 19 đã đọc từ bản chính thức; NĐ 356 chỉ đọc Điều 5–6. “Tên gọi” chưa kết luận là dữ liệu cá nhân. Chưa tạo yêu cầu pháp lý.

### OQ-19 — “Không hard-code sai” nghĩa là gì? Cấu hình do ai và ở đâu cập nhật?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-20; NFR-008, NFR-009
- **Nguồn A:** `docs/MVP.md` MB-20 AC: “nội dung pháp lý có nguồn/ngày hiệu lực; không hard-code sai”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` NFR-08: ngưỡng/mức bồi thường lưu thành cấu hình. `src/main.jsx`:244: toast “Đã mở tóm tắt Điều 36, 39, 40” và dữ liệu hard-code.
- **Ảnh hưởng đến SRS:** “Không hard-code sai” có thể hiểu nhiều cách; nơi lưu cấu hình và người cập nhật chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** “Không hard-code sai” nghĩa là gì? Cấu hình do ai và ở đâu cập nhật?
- **Xử lý tạm trong SRS:** SRS dùng diễn giải B03 ở mức Proposed (NFR-009).

### OQ-20 — Ai phê duyệt SRS và khi nào B00/B03 được ký?

- **Trạng thái:** Mở
- **Loại:** Giả định cần xác nhận · **Ưu tiên:** Cao · **Liên quan:** Toàn bộ
- **Nguồn A:** `docs/MVP.md` dòng 2: “Chỉ chuyển sang Đã duyệt sau khi nhóm/GVHD xác nhận B00/B03”; mọi dòng “Chờ duyệt”/“Blocked”/“Đã loại”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B00_10-10_Bien-ban-chot-pham-vi.docx`: ô chữ ký và kết luận chưa điền; `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx`/`BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx`: “Chờ GVHD duyệt”.
- **Ảnh hưởng đến SRS:** Toàn bộ SRS là bản nháp trên baseline đề xuất.
- **Câu hỏi cho chủ sản phẩm:** Ai phê duyệt SRS và khi nào B00/B03 được ký?
- **Xử lý tạm trong SRS:** SRS ghi Draft v0.1.

### OQ-21 — Cơ chế kích hoạt phản hồi mô phỏng của hãng, cơ sở và sự kiện đổi giờ?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-11–MB-14; IFR-002, FR-019–FR-021
- **Nguồn A:** `docs/MVP.md` MB-12, MB-13: “Phản hồi mô phỏng”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` mục 6.2: “kịch bản chọn trước”, “nút mô phỏng đổi giờ”; UC11 E1: hãng không phản hồi sau 15 phút mô phỏng.
- **Ảnh hưởng đến SRS:** Ai/cái gì kích hoạt phản hồi mô phỏng (tự động, người thử nghiệm, kịch bản) chưa xác định; chưa có actor điều khiển.
- **Câu hỏi cho chủ sản phẩm:** Cơ chế kích hoạt phản hồi mô phỏng của hãng, cơ sở và sự kiện đổi giờ?
- **Xử lý tạm trong SRS:** Không tạo actor điều khiển kịch bản riêng. Từ 26/10/2026 SRS có tác nhân quản trị và khách sạn theo chỉ đạo của chủ sản phẩm (ACT-05, ACT-06; xem OQ-38 đến OQ-42, D-27).

### OQ-22 — S1 làm gì và S2 tự động hoá gì? Tần suất cập nhật trong prototype?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-02, MB-20; FR-003, FR-004, NFR-007
- **Nguồn A:** `docs/MVP.md` MB-02: Sprint S1/S2, ghi chú “Tự động hóa hoàn thiện S2”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-03: dẫn nguồn S03 (cập nhật ≥30 phút/lần).
- **Ảnh hưởng đến SRS:** Phần làm ở S1 và S2, cách phát hiện đổi giờ và tần suất cập nhật chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** S1 làm gì và S2 tự động hoá gì? Tần suất cập nhật trong prototype?
- **Xử lý tạm trong SRS:** SRS không nêu tần suất.
- **Kết quả nghiên cứu (v0.3):** Nghiên cứu (G-11, R-02): hãng phải cập nhật giờ bay cho cảng ≥30 phút/lần (báo chí). Đề xuất D-08.

### OQ-23 — Chấp thuận quy tắc đầu vào của B04? Giờ cũ khi nhập thủ công xử lý ra sao?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Thấp · **Liên quan:** MB-01; FR-001, FR-002, DR-001
- **Nguồn A:** `docs/MVP.md` MB-01: không nêu quy tắc kiểm tra đầu vào.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` mục 6: số hiệu “2 chữ + 1–4 số”, ngày trong ±1 ngày; KT-20: “ngày cách 5 ngày” là không hợp lệ. `src/main.jsx`:64–68: không kiểm tra, luôn trả cùng một kết quả.
- **Ảnh hưởng đến SRS:** Quy tắc hợp lệ và cách hiển thị “giờ cũ” khi nhập thủ công chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Chấp thuận quy tắc đầu vào của B04? Giờ cũ khi nhập thủ công xử lý ra sao?
- **Xử lý tạm trong SRS:** Quy tắc B04 ở mức Proposed.

### OQ-24 — Tập chip của MVP, ngưỡng [x]đ và số kết quả tối đa?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-05; FR-008–FR-010
- **Nguồn A:** `docs/MVP.md` MB-05 AC: “Lọc còn phòng/giờ lễ tân; sắp theo phút đi; chip lọc đúng”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` FR-08: 6 chip (Huỷ miễn phí, Thuê theo giờ, Dưới [x]đ, Phù hợp gia đình, Trong nhà ga, Có xe đưa đón); FR-06: tối đa 5 kết quả. `src/main.jsx`:207–212: 4 chip; hiển thị 3 kết quả.
- **Ảnh hưởng đến SRS:** Tập chip MVP, giá trị [x] và số kết quả tối đa chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Tập chip của MVP, ngưỡng [x]đ và số kết quả tối đa?
- **Xử lý tạm trong SRS:** SRS không liệt kê chip; AC tổng quát.

### OQ-25 — Chấp thuận quy tắc B04? “Giờ hiện tại” mô phỏng được đặt thế nào?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** MB-05, MB-06; BR-003, FR-008, FR-011
- **Nguồn A:** `docs/MVP.md` MB-05: “còn phòng/giờ lễ tân”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC04: “nhận khách ngay” = giờ nhận phòng cuối > giờ hiện tại hoặc lễ tân 24/24; dữ liệu >30 phút là cũ. `src/main.jsx`: giờ cố định 23:08.
- **Ảnh hưởng đến SRS:** Quy tắc tính “đang nhận khách”, “giờ hiện tại” trong môi trường mô phỏng và ngưỡng dữ liệu cũ chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Chấp thuận quy tắc B04? “Giờ hiện tại” mô phỏng được đặt thế nào?
- **Xử lý tạm trong SRS:** Quy tắc B04 ở mức Proposed.

### OQ-26 — Quy cách nhãn và các vị trí bắt buộc?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Thấp · **Liên quan:** NFR-006; BR-001
- **Nguồn A:** `docs/MVP.md`: MB-06, MB-07, MB-11, MB-19 yêu cầu “nhãn mô phỏng”.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx`: nhãn “[Mô phỏng]”. `src/main.jsx`: nhãn “Dữ liệu mô phỏng”, “Mô phỏng”.
- **Ảnh hưởng đến SRS:** Quy cách và vị trí nhãn chưa thống nhất.
- **Câu hỏi cho chủ sản phẩm:** Quy cách nhãn và các vị trí bắt buộc?
- **Xử lý tạm trong SRS:** SRS yêu cầu nhãn hiển thị, không quy định chữ.

### OQ-27 — Giữ hay bỏ các phần tử này?

- **Trạng thái:** Mở
- **Loại:** Rủi ro · **Ưu tiên:** Trung bình · **Liên quan:** Prototype
- **Nguồn A:** `docs/MVP.md`: không có tính năng tương ứng.
- **Nguồn B:** `src/main.jsx`: “Lưu nơi nghỉ” (:219), “Xem trên bản đồ” (:205), “Chỉ còn 1 phòng” (:224), thanh “Phản hồi trong 3 giây”, “70 nơi nghỉ đã đối chiếu” (:145–146), nút ngôn ngữ “VI” (:87).
- **Ảnh hưởng đến SRS:** Các phần tử trong prototype không truy vết được về MVP hoặc mâu thuẫn dữ liệu thực.
- **Câu hỏi cho chủ sản phẩm:** Giữ hay bỏ các phần tử này?
- **Xử lý tạm trong SRS:** SRS không coi là yêu cầu.

### OQ-28 — Định nghĩa S1–S4 (mục tiêu, thời gian)?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Thấp · **Liên quan:** MVP cột Sprint, Nguồn
- **Nguồn A:** `docs/MVP.md`: dùng S1–S4, “Sau MVP”, “Không làm”; nguồn N01–N13, RQ3, B03.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B03_07-10_Chot-yeu-cau-va-MVP.docx` mục 5 và `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` mục 7 giải thích N01–N13; không tìm thấy định nghĩa S1–S4 trong các tài liệu đã đọc.
- **Ảnh hưởng đến SRS:** Phạm vi và thời gian của từng Sprint chưa xác định.
- **Câu hỏi cho chủ sản phẩm:** Định nghĩa S1–S4 (mục tiêu, thời gian)?
- **Xử lý tạm trong SRS:** SRS chỉ ghi nhãn Sprint theo MVP.

### OQ-29 — Có hủy đặt chỗ mô phỏng trong MVP không?

- **Trạng thái:** Đã quyết định theo MVP
- **Loại:** Mâu thuẫn · **Ưu tiên:** Trung bình · **Liên quan:** FR-016, FR-022, DR-005
- **Nguồn A:** `docs/MVP.md`: không có tính năng hủy đặt chỗ.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` UC14 A1: “cho phép huỷ đặt chỗ mô phỏng”; UC15 A2: gợi ý huỷ phòng; DR DatCho.trang_thai gồm “Đã huỷ”.
- **Ảnh hưởng đến SRS:** Hủy đặt chỗ là quy trình MVP không quy định.
- **Câu hỏi cho chủ sản phẩm:** Có hủy đặt chỗ mô phỏng trong MVP không?
- **Xử lý tạm trong SRS:** SRS không đặc tả hủy; chỉ “Đã đặt”.
- **Quyết định (2026-10-26) — Đã quyết định theo MVP:** MVP không có hủy đặt chỗ nên SRS không đặc tả hủy; trạng thái đặt chỗ chỉ “Đã đặt”.

### OQ-30 — Có cần các nhóm NFR này cho prototype không, và chỉ tiêu cụ thể?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Thấp · **Liên quan:** TBD-NFR-01 đến TBD-NFR-06
- **Nguồn A:** `docs/MVP.md`: không nêu bảo mật, tương thích trình duyệt, bảo trì, quan sát/ghi lỗi, toàn vẹn dữ liệu.
- **Nguồn B:** Không có tài liệu nào trong repository nêu các chỉ tiêu này.
- **Ảnh hưởng đến SRS:** Các nhóm NFR này chưa thể là yêu cầu bắt buộc.
- **Câu hỏi cho chủ sản phẩm:** Có cần các nhóm NFR này cho prototype không, và chỉ tiêu cụ thể?
- **Xử lý tạm trong SRS:** Ghi TBD, không đặt chỉ tiêu.

### OQ-31 — Chấp thuận hiển thị 3 điều kiện và yêu cầu hành khách tự xác nhận (mô phỏng) trước khi gửi đề nghị?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Giả định cần xác nhận · **Ưu tiên:** Cao · **Liên quan:** FR-005, FR-019; D-01, D-05
- **Nguồn A:** `docs/MVP.md` MB-11: không nêu điều kiện hành khách; MB-19: không thu dữ liệu ngoài phạm vi.
- **Nguồn B:** Nghiên cứu (R-03): NĐ 208/2026 Điều 36 khoản 8 chỉ áp dụng nghĩa vụ ăn, uống, nghỉ cho hành khách có vé, đã xác nhận chỗ và có mặt tại cảng hàng không.
- **Ảnh hưởng đến SRS:** Airrest không thu mã đặt chỗ nên không xác minh thật được điều kiện này.
- **Câu hỏi cho chủ sản phẩm:** Chấp thuận hiển thị 3 điều kiện và yêu cầu hành khách tự xác nhận (mô phỏng) trước khi gửi đề nghị?
- **Xử lý tạm trong SRS:** Ghi ở dạng đề xuất D-05; chưa có AC.
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-02, G-19, R-19): nghĩa vụ thuộc hãng; L2 của Airrest là cơ chế mô phỏng. Đề xuất D-01/D-05: hiển thị điều kiện, cho tự xác nhận (mô phỏng), không chặn.

### OQ-32 — Chấp thuận giả định 1 phòng, 1 đêm, 2 người lớn và hiển thị giả định cạnh giá?

- **Trạng thái:** Mở
- **Loại:** Giả định cần xác nhận · **Ưu tiên:** Trung bình · **Liên quan:** FR-011, DR-004; D-06
- **Nguồn A:** `docs/MVP.md` MB-06: “giá tổng nhất quán”, không nêu số khách/phòng/đêm.
- **Nguồn B:** `BTHQUAN/GiaiDoan_B_PhanTich_YeuCau/B04_10-10_Mo-hinh-hoa-he-thong.docx` và B02: dữ liệu A08 lấy giá cho 1 đêm, 2 người lớn; `src/main.jsx`:225 “Giá tổng / đêm”.
- **Ảnh hưởng đến SRS:** “Giá tổng” phụ thuộc giả định chưa được ghi.
- **Câu hỏi cho chủ sản phẩm:** Chấp thuận giả định 1 phòng, 1 đêm, 2 người lớn và hiển thị giả định cạnh giá?
- **Xử lý tạm trong SRS:** Ghi ở dạng đề xuất D-06.

### OQ-33 — Có cần hết hạn yêu cầu và giữ phòng trong mô phỏng không? Nếu có, giá trị bao nhiêu?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** FR-019–FR-021; G-05, G-06; D-04
- **Nguồn A:** `docs/MVP.md`: không nêu thời hạn trả lời của hãng/cơ sở và không có khái niệm giữ phòng.
- **Nguồn B:** Nghiên cứu (R-01, R-18): TT 48 không có thời hạn cho đề nghị lưu trú (chỉ cho bồi thường/khiếu nại); không tìm được nguồn chính thức về giữ phòng. B04 UC11 E1: 15 phút mô phỏng.
- **Ảnh hưởng đến SRS:** Không có căn cứ để đặc tả hết hạn hoặc giữ phòng.
- **Câu hỏi cho chủ sản phẩm:** Có cần hết hạn yêu cầu và giữ phòng trong mô phỏng không? Nếu có, giá trị bao nhiêu?
- **Xử lý tạm trong SRS:** Không đặc tả; xem D-04.
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-06, R-01, R-19): đã đọc Điều 36–40 NĐ 208 và Điều 3–8 TT 48: không có thời hạn phản hồi cho đề nghị lưu trú và không có thủ tục “đề nghị hỗ trợ lưu trú”. Thời hạn L2 là tham số mô phỏng (D-04).

### OQ-34 — Chấp nhận nhắc chỉ khi trang còn mở, hay yêu cầu nhắc nền (cần nghiên cứu thêm)?

- **Trạng thái:** Mở một phần (đã nghiên cứu)
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** FR-014, FR-015; G-12; D-03
- **Nguồn A:** `docs/MVP.md` MB-08: “tính đúng giờ rời; fallback lịch”.
- **Nguồn B:** Nghiên cứu (R-13, R-14): Notification API cần HTTPS và quyền người dùng, không phải Baseline; chưa nghiên cứu Push/service worker nên chưa biết có nhắc được khi đã đóng trang không.
- **Ảnh hưởng đến SRS:** Không rõ MB-08 phải nhắc khi trang đóng hay chỉ khi trang còn mở.
- **Câu hỏi cho chủ sản phẩm:** Chấp nhận nhắc chỉ khi trang còn mở, hay yêu cầu nhắc nền (cần nghiên cứu thêm)?
- **Xử lý tạm trong SRS:** Ghi giới hạn trong D-03.
- **Kết quả nghiên cứu (v0.3):** v0.4 (G-12, R-25, R-26, R-27): nhắc khi đóng trang bắt buộc cần máy chủ gửi push; iOS cần 16.4+ và Màn hình chính; không có cơ chế lập lịch phía client được tài liệu hóa. Nhắc nền bị chặn; chủ sản phẩm cần chấp nhận giới hạn D-03.

### OQ-35 — Ai đọc toàn văn NĐ 208/2026 Điều 36–40 từ Công báo/cổng chính phủ và xác nhận nội dung B03 FR-04?

- **Trạng thái:** Đã giải quyết bằng nguồn chính thức
- **Loại:** Thiếu thông tin (xác minh) · **Ưu tiên:** Cao · **Liên quan:** FR-005, DR-002, NFR-008; G-17
- **Nguồn A:** `docs/MVP.md` MB-03, MB-20: Blocked, cần kiểm chứng văn bản gốc.
- **Nguồn B:** Nghiên cứu (R-05): không lấy được toàn văn NĐ 208/2026 từ nguồn chính thức; Điều 40 (miễn trừ) chưa đọc được; TT 48/2026 đã đọc từ bản ký số trên chinhphu.vn.
- **Ảnh hưởng đến SRS:** Các giá trị từ NĐ 208/2026 chỉ ở mức EXTERNALLY_RESEARCHED.
- **Câu hỏi cho chủ sản phẩm:** Ai đọc toàn văn NĐ 208/2026 Điều 36–40 từ Công báo/cổng chính phủ và xác nhận nội dung B03 FR-04?
- **Xử lý tạm trong SRS:** Giữ MB-03/MB-20 ở trạng thái Blocked.
- **Kết quả nghiên cứu (v0.3):** v0.4: ĐÃ GIẢI QUYẾT — lấy được bản chính thức NĐ 208/2026 (R-19) và đọc Điều 36–40. Điều 40 là miễn trừ bồi thường ứng trước. Phần còn lại chuyển sang OQ-37.

### OQ-36 — Quy tắc “chưa rõ nguyên nhân thì không kết luận” áp dụng cho mọi quyền lợi hay chỉ hoàn vé/bồi thường?

- **Trạng thái:** Mở
- **Loại:** Mâu thuẫn · **Ưu tiên:** Cao · **Liên quan:** BR-006, FR-005; D-10
- **Nguồn A:** `docs/MVP.md` MB-03: “không kết luận khi nguyên nhân chưa rõ”.
- **Nguồn B:** Nghiên cứu (R-19): NĐ 208 Điều 36 k6d giới hạn điều kiện lỗi người vận chuyển ở hoàn vé và bồi thường ứng trước; Điều 36 k7 (nơi nghỉ) không ghi điều kiện lỗi người vận chuyển; Điều 39 k3c chăm sóc trừ lỗi hành khách hoặc đã yêu cầu hoàn vé; Điều 40 nói về miễn bồi thường ứng trước.
- **Ảnh hưởng đến SRS:** Áp dụng quy tắc MVP cho ăn/nghỉ có thể chưa khớp văn bản đã đọc (k7 không ghi điều kiện lỗi; diễn giải cần pháp chế xác nhận).
- **Câu hỏi cho chủ sản phẩm:** Quy tắc “chưa rõ nguyên nhân thì không kết luận” áp dụng cho mọi quyền lợi hay chỉ hoàn vé/bồi thường?
- **Xử lý tạm trong SRS:** Giữ BR-006 theo MVP; ghi CR-11 ở dạng đề xuất.

### OQ-37 — Có cần xác minh thêm các điểm trên trước khi viết yêu cầu pháp lý không?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin (xác minh) · **Ưu tiên:** Thấp · **Liên quan:** G-17, G-14
- **Nguồn A:** Đã xác minh NĐ 208 Điều 36–40, TT 48 Điều 4–8, Luật 91/2025 Điều 2, 9, 19.
- **Nguồn B:** Chưa xác minh: Luật 130/2025 Điều 53 bản chính thức, NĐ 208 các điều khác và Điều 35 k1–k4, NĐ 356 danh mục dữ liệu, điều khoản bãi bỏ TT 81/2014 và TT 14/2015.
- **Ảnh hưởng đến SRS:** Các điểm này chưa ảnh hưởng trực tiếp tới AC nào của MVP.
- **Câu hỏi cho chủ sản phẩm:** Có cần xác minh thêm các điểm trên trước khi viết yêu cầu pháp lý không?
- **Xử lý tạm trong SRS:** Ghi “chưa xác minh” ở bảng E của tài liệu nghiên cứu.

### OQ-38 — Cơ chế đăng nhập, phân quyền và tạo tài khoản của khách sạn, lái xe và quản trị là gì?

- **Trạng thái:** Mở
- **Loại:** Giả định cần xác nhận · **Ưu tiên:** Cao · **Liên quan:** FR-024, FR-031; BR-015; NFR-010; DR-010; D-25
- **Nguồn A:** MVP: không đăng nhập cho người dùng cuối (MB-07); TBD-NFR-01 (bảo mật) chưa có căn cứ. Chỉ đạo PO 26/10/2026: hệ thống có ba tác nhân.
- **Nguồn B:** Chỉ đạo của chủ sản phẩm (26/10/2026): hệ thống phải có ba tác nhân (người dùng cuối, khách sạn gồm lái xe, quản trị) dù MVP chưa có.
- **Ảnh hưởng đến SRS:** Không rõ khách sạn và quản trị đăng nhập thế nào khi không có backend; có thể xung đột “không thu dữ liệu ngoài phạm vi” (MB-19).
- **Câu hỏi cho chủ sản phẩm:** Cơ chế đăng nhập, cách cấp tài khoản và cách phân quyền?
- **Xử lý tạm trong SRS:** SRS ghi FR-024 ở mức Proposed, cơ chế “theo D-25 (chưa chốt)”; không đặt yêu cầu mật mã hay bảo mật cụ thể.

### OQ-39 — Lái xe làm những việc gì, và có chấp nhận chức năng đón khách khi MVP đã loại “gọi xe” (MB-15) không?

- **Trạng thái:** Mở
- **Loại:** Mâu thuẫn · **Ưu tiên:** Cao · **Liên quan:** FR-028, FR-029; DR-011; MB-15; D-26
- **Nguồn A:** MVP MB-15: “Bản đồ, gọi xe, lưu chứng từ” — Đã loại. Chỉ đạo PO: tác nhân khách sạn bao gồm lái xe. BR-002: không thu số điện thoại, email.
- **Nguồn B:** Chỉ đạo của chủ sản phẩm (26/10/2026): hệ thống phải có ba tác nhân (người dùng cuối, khách sạn gồm lái xe, quản trị) dù MVP chưa có.
- **Ảnh hưởng đến SRS:** Không rõ phạm vi chức năng của lái xe, có bản đồ hay định vị không, và lái xe liên lạc với người dùng cuối bằng cách nào khi không có số điện thoại.
- **Câu hỏi cho chủ sản phẩm:** Phạm vi chức năng của lái xe, có cần bản đồ và định vị không, và cách liên lạc?
- **Xử lý tạm trong SRS:** SRS ghi FR-028, FR-029 ở mức Proposed, chỉ gồm nhận chuyến và cập nhật trạng thái; không bản đồ, không định vị, không thanh toán xe.

### OQ-40 — Sau khi có khách sạn và quản trị là tác nhân thật, hãng hàng không và phản hồi mô phỏng được xử lý thế nào?

- **Trạng thái:** Mở
- **Loại:** Mâu thuẫn · **Ưu tiên:** Cao · **Liên quan:** FR-020, FR-021, FR-027, FR-033; IFR-002; ACT-02, ACT-03; D-27
- **Nguồn A:** MVP MB-12, MB-13: “Phản hồi mô phỏng” của hãng và cơ sở; OQ-21: chưa có actor điều khiển.
- **Nguồn B:** Chỉ đạo của chủ sản phẩm (26/10/2026): hệ thống phải có ba tác nhân (người dùng cuối, khách sạn gồm lái xe, quản trị) dù MVP chưa có.
- **Ảnh hưởng đến SRS:** Không rõ ai duyệt hoặc từ chối đề nghị hỗ trợ (hãng mô phỏng, quản trị, hay khách sạn) và phản hồi của cơ sở là mô phỏng hay do khách sạn thật.
- **Câu hỏi cho chủ sản phẩm:** Giữ hãng là tác nhân mô phỏng, hay để quản trị hoặc khách sạn thay?
- **Xử lý tạm trong SRS:** SRS giữ ACT-02 và ACT-03 là mô phỏng; FR-027 và FR-033 mô tả hành động của ACT-05 và ACT-06 khi D-27 chọn.

### OQ-41 — Phạm vi chức năng và mức ưu tiên (MoSCoW, Sprint) của khu vực khách sạn và quản trị là gì?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** FR-025 đến FR-034; D-28
- **Nguồn A:** MVP không có hạng mục cho ba tác nhân; chưa có MoSCoW và Sprint.
- **Nguồn B:** Chỉ đạo của chủ sản phẩm (26/10/2026): hệ thống phải có ba tác nhân (người dùng cuối, khách sạn gồm lái xe, quản trị) dù MVP chưa có.
- **Ảnh hưởng đến SRS:** Không biết chức năng nào là Must, chức năng nào hoãn; quản trị có một cấp hay nhiều cấp.
- **Câu hỏi cho chủ sản phẩm:** Chức năng nào bắt buộc cho MVP, chức năng nào hoãn, quản trị có phân cấp không?
- **Xử lý tạm trong SRS:** SRS để “Chưa xếp” cho FR-025 đến FR-034; không đặt AC.

### OQ-42 — Dữ liệu của khách sạn và quản trị được lưu ở đâu khi không có backend, và nhật ký lưu bao lâu?

- **Trạng thái:** Mở
- **Loại:** Thiếu thông tin · **Ưu tiên:** Trung bình · **Liên quan:** BR-016, BR-017; FR-034; DR-012; D-29
- **Nguồn A:** D-18 (phương án A): chỉ lưu trong phiên trang. Ba tác nhân cần dữ liệu dùng chung giữa các tác nhân khác nhau.
- **Nguồn B:** Chỉ đạo của chủ sản phẩm (26/10/2026): hệ thống phải có ba tác nhân (người dùng cuối, khách sạn gồm lái xe, quản trị) dù MVP chưa có.
- **Ảnh hưởng đến SRS:** Dữ liệu cập nhật bởi khách sạn không thể tới người dùng cuối nếu chỉ lưu cục bộ ở từng trình duyệt; chưa quyết định hạ tầng.
- **Câu hỏi cho chủ sản phẩm:** Dữ liệu dùng chung giữa ba tác nhân lưu ở đâu, và thời gian lưu nhật ký?
- **Xử lý tạm trong SRS:** SRS không quyết định hạ tầng hay cơ sở dữ liệu (mục 9.2); ghi giả định “dữ liệu mô phỏng”.
