# SRS Review — Airrest website

Phiên bản v0.6 · 2026-10-26 · Rà soát do chính người soạn thực hiện bằng script kiểm tra tự động và đối chiếu thủ công; **chưa có rà soát độc lập của người khác**.

## 1. Kết luận

- SRS đủ khung để dùng làm baseline nháp: 23 FR, 9 NFR, 14 BR, 9 DR, 11 UIR, 2 IFR, 13 UC, 64 AC, 59 TC tham chiếu.
- **37 câu hỏi**: 5 đã quyết định theo MVP (2026-10-26), 1 đã giải quyết bằng nguồn chính thức (v0.4), 4 mở một phần (MVP không đủ để chốt), 10 mở một phần sau nghiên cứu, 17 còn mở. Chưa nên coi SRS là bản chốt cho tới khi các mục mở mức “Cao” được trả lời (OQ-04, OQ-06, OQ-07, OQ-08, OQ-14, OQ-20, OQ-31, OQ-36).
- MB-03 và MB-20 (Blocked) mới chỉ đặc tả được hành vi hiển thị, chưa có nội dung pháp lý cụ thể.

## 2. Nguồn đã xác minh theo từng loại

| Nguồn | Vai trò | Đã dùng để | Số AC |
|---|---|---|---|
| `docs/MVP.md` | Nguồn phạm vi | 20 tính năng, ưu tiên, Sprint, AC gốc | 40 AC chỉ từ MVP; 2 AC kết hợp MVP + bổ sung |
| `BTHQUAN/` (B00, B03, B04, 00_DOC_TRUOC) | Bổ sung yêu cầu, thuật ngữ | Định nghĩa L1/L2, M0–M9, FR/NFR gốc, chi tiết luồng, dữ liệu, KT-01…20 | 19 AC chỉ từ B03/B04 (Proposed) |
| `src/main.jsx` | Bằng chứng prototype | So sánh UI hiện có (UIR cột prototype, OQ-27) | 0 (không sinh yêu cầu) |
| — | TBD | AC chưa đủ thông tin | 3 AC TBD và 2 AC của MVP chưa đo được (đều không có TC) |

Chi tiết đọc: Phụ lục A của `SRS.md`. **Đọc có chọn lọc** (tìm từ khóa): B01, B02, A02, A03. **Không đọc**: A05–A08 (docx), R00, R01, B04 xlsx, hình B04, `styles.css`, `package.json`. Mã nhu cầu N01–N13 chỉ lấy tên từ B03 mục 5 và B04 mục 7; mã S1–S4 và RQ1–RQ2 không có định nghĩa đã đọc.

## 3. Kiểm tra tính đầy đủ

| Hạng mục | Kết quả |
|---|---|
| Đã đọc toàn bộ `docs/MVP.md` | Đạt — 1 bảng 12 cột, 20 dòng, không có phụ lục hay ghi chú ngoài dòng 2 |
| Mọi tính năng có trạng thái và liên kết truy vết | Đạt — 20/20 (script); MB-15, MB-16 ghi Out of Scope (OOS-01, OOS-02) |
| Điều kiện/ghi chú quan trọng được bảo toàn | Đạt — MB-03, MB-09, MB-10, MB-20 và dòng 2 được ghi ở mục 2.4, 8.1 |
| Yêu cầu chưa rõ được ghi lại | Đạt — 37 OQ, 8 mục TBD-NFR, AC TBD |

## 4. Kiểm tra tính nhất quán

| Hạng mục | Kết quả |
|---|---|
| Mã yêu cầu/AC/TC không trùng | Đạt (script) |
| Mọi tham chiếu OQ/BR/AC/ID tồn tại | Đạt (script) |
| Không mâu thuẫn với MVP | Đạt về ưu tiên và phạm vi: SRS dùng MVP; mâu thuẫn với B03/B04 được ghi ở OQ |
| Không biến nội dung ngoài phạm vi thành bắt buộc | Đạt: không có FR cho MB-15/16; B04 UC09 loại; SMS, hủy đặt chỗ ghi OQ và không đặc tả |
| Actor, dữ liệu, trạng thái không tự phát sinh | Đạt có điều kiện: ACT-04 và các thực thể DR lấy từ B04, ghi rõ Proposed. Từ v0.6, thêm ACT-05 (khách sạn gồm lái xe) và ACT-06 (quản trị) theo chỉ đạo của chủ sản phẩm 26/10/2026, ghi rõ ngoài MVP, Proposed |

Điểm cần chú ý: FR-023 và NFR-009 dựa trên câu chữ mơ hồ của MVP (“xử lý giờ bay mới”, “không hard-code sai”); hành vi cụ thể lấy từ B03 ở mức Proposed.

## 5. Kiểm tra khả năng kiểm thử

- 59/64 AC có TC tham chiếu; 5 AC không có TC vì thiếu thông tin (công thức giờ nghỉ/giờ rời, nội dung pháp lý, ngưỡng khả dụng).
- AC của MVP dùng cụm “≤3 giây”, “≤3 bước”, “≥2 cách trả”, “tối đa 3 đề xuất” là đo được; các cụm “đạt mục tiêu test”, “nội dung rõ”, “không hard-code sai” chưa đo được và đã ghi OQ-16, OQ-19.
- Chưa có test case chi tiết; B04 mục 8 có 20 kịch bản KT làm tham chiếu (cột KT trong RTM).

## 6. Yêu cầu còn TBD

| Mục | Nội dung TBD | OQ |
|---|---|---|
| FR-005 | Mốc giờ, khung giờ, mức bồi thường, điều khoản | OQ-06 |
| FR-006, FR-014, FR-016, FR-023 | Công thức thời gian nghỉ/giờ rời, giờ có mặt, dự phòng | OQ-04 |
| FR-007 | Số nhánh và ngưỡng gợi ý | OQ-05 |
| FR-019 | Điều kiện được gửi đề nghị | OQ-07 |
| FR-019–FR-023, BR-014 | State machine, mã yêu cầu, thời gian chờ | OQ-08 |
| FR-013 | Hai cách trả cụ thể | OQ-11 |
| FR-010 | Tập chip lọc, ngưỡng giá, số kết quả tối đa | OQ-24 |
| NFR-002, NFR-003 | Ngưỡng số của kiểm thử khả dụng | OQ-16 |
| TBD-NFR-01…08 | Bảo mật, tương thích, bảo trì, quan sát, toàn vẹn, song ngữ, SLA/tuân thủ | OQ-30, OQ-01, OQ-18 |

## 7. Điểm chưa thống nhất giữa các nguồn

| OQ | Tóm tắt |
|---|---|
| OQ-01 | MB-19; NFR-005, NFR-006, TBD-NFR-07 — Mã NFR-04 không khớp nội dung MB-19. Không rõ MVP có yêu cầu song ngữ VI/EN hay không. |
| OQ-02 | MB-05, MB-07, MB-10, MB-14, MB-18, MB-20 — Cùng một mã FR/NFR có mức ưu tiên và phạm vi khác nhau giữa hai nguồn. |
| OQ-03 | MB-14, MB-15; FR-022 — Luồng L2 trong B03/B04 phụ thuộc chức năng mà MVP đã loại. |
| OQ-04 | MB-04, MB-08; FR-006, FR-014, FR-016, FR-023 — Hai công thức và hai giá trị giờ có mặt (120 so với 90 phút) cho cùng chức năng; AC “tính đúng” không kiểm thử được. |
| OQ-05 | MB-04; FR-007 — Số nhánh và ngưỡng thời gian chưa thống nhất. |
| OQ-09 | MB-08; FR-014, FR-015, DR-006 — SMS đòi hỏi tích hợp ngoài; MVP không quy định. Kênh chính và hình thức “lịch” chưa rõ. |
| OQ-10 | MB-07; FR-012, DR-005 — Cách đếm bước chưa thống nhất; không rõ tên gọi có bắt buộc. |
| OQ-12 | MB-10; FR-018, BR-013, DR-009 — Không rõ “giản lược” gồm những gì; số 1900 1028 và chat có nguồn xác minh hay không. |
| OQ-29 | FR-016, FR-022, DR-005 — Hủy đặt chỗ là quy trình MVP không quy định. |
| OQ-36 | BR-006, FR-005; D-10 — Áp dụng quy tắc MVP cho ăn/nghỉ có thể chưa khớp văn bản đã đọc (k7 không ghi điều kiện lỗi; diễn giải cần pháp chế xác nhận). |

## 8. Prototype `src/main.jsx` so với MVP (tham khảo)

| Quan sát | Dòng | MVP liên quan |
|---|---|---|
| Tra cứu luôn trả cùng một kết quả cố định, không kiểm tra đầu vào | 64–68, 151–170 | MB-01 |
| Chỉ có 3 cơ sở cố định; giao diện nêu “70 nơi nghỉ đã đối chiếu” | 11–30, 146 | MB-05 |
| Không có màn hình chi tiết (M4), nhắc giờ (M6), tiện ích nhà ga (M7), hỗ trợ (M8) riêng; một số chỉ là toast | 190, 244, 283–300 | MB-06, 08, 09, 10 |
| Đặt chỗ 2 bước, tên gọi không bắt buộc, không có bước chọn phương thức trả | 283–300 | MB-07 |
| L2 chỉ có “Đang chờ hãng duyệt”, không có từ chối/duyệt/cơ sở/tự chi trả | 246–255 | MB-11–14 |
| Hotline 1900 1028 và “Trò chuyện ngay” không có nguồn xác minh | 261 | MB-10 |
| “Lưu nơi nghỉ”, “Xem trên bản đồ”, “Chỉ còn 1 phòng” không có tính năng MVP tương ứng | 205, 219, 224 | MB-15 và ngoài MVP |

## 9. Giới hạn và vấn đề còn tồn tại

- Rà soát chưa độc lập; script chỉ kiểm tra cấu trúc (trùng ID, tham chiếu, phủ MVP), không kiểm tra ngữ nghĩa.
- Chi tiết bổ sung từ B03/B04 chưa được chủ sản phẩm xác nhận; nếu họ loại, cần lược bỏ các AC/UIR/DR Proposed.
- Không có TC chi tiết, không có kết quả kiểm thử.
- Một số tài liệu trong `BTHQUAN/` chưa đọc hoặc chỉ đọc có chọn lọc (mục 2); có thể có thông tin bổ sung hoặc mâu thuẫn.
- Đường dẫn `test/` nằm trong `.gitignore` của repository chứa nó (dòng 86 của `go/apps/manufacture/.gitignore`), nên Git không theo dõi các file này; không thể dùng `git diff` để chứng minh không có thay đổi ngoài ý muốn.

## 10. Xác nhận phạm vi thực hiện

| Hạng mục | Kết quả |
|---|---|
| `docs/MVP.md` không đổi trong nhiệm vụ SRS | Đạt — SHA-256 trước `41c42c717873d859…` và sau `41c42c717873d859…` |
| Lưu ý về MVP.md | Trước nhiệm vụ này, trong cùng phiên, `docs/MVP.md` đã được định dạng lại từ TSV sang bảng Markdown theo yêu cầu của người dùng (nội dung các ô giữ nguyên). Không có thay đổi nào sau đó |
| Không sửa source code | Đạt — chỉ tạo 4 file trong `docs/srs/` |
| Không thao tác ngoài thư mục `Airrest_website` | Gần đúng: đọc trạng thái Git của thư mục cha; dùng thư mục tạm của phiên (`scratchpad`) để trích văn bản docx, chạy script sinh tài liệu và lưu các bản PDF Thông tư 48, NĐ 208, Luật 91, NĐ 356 do công cụ/curl tải về từ trang chính thức (chỉ đọc làm dữ liệu, không chạy; ảnh trang được xem để đọc bản quét). Từ v0.3 có truy cập Internet để nghiên cứu theo yêu cầu; không tải hay chạy mã nguồn bên ngoài, không tích hợp dịch vụ nào |

## 11. Nghiên cứu khoảng trống (v0.3 và v0.4)

- 21 khoảng trống: EXTERNALLY_RESEARCHED 13, INFERRED 4, TBD 4. 29 mục trong research log; 12 đề xuất quyết định; 12 ứng viên yêu cầu (Proposed/Deferred/Blocked, không có AC).
- Thứ tự tìm: MVP → tài liệu nội bộ (B00–B04, B01/B02 chọn lọc, prototype) → nguồn ngoài. Chi tiết trong `RESEARCH_AND_GAP_ANALYSIS.md`.
- **Mức tin cậy:** từ v0.4, NĐ 208/2026 (Điều 30–31, 35–40), TT 48/2026 (Điều 3–8) và Luật 91/2025 (Điều 2, 9, 19) được đọc từ bản chính thức; NĐ 356/2025 chỉ Điều 5–6. Vẫn chưa xác minh: Luật 130/2025 Điều 53 bản chính thức, các điều khác của NĐ 208, danh mục dữ liệu của NĐ 356, việc bãi bỏ TT 81/2014 và TT 14/2015. Hai PDF NĐ 208 và NĐ 356 là ảnh quét, đọc bằng cách xem ảnh nên có thể sót lỗi chép; cần người đối chiếu lại trước khi trích dẫn chính thức.
- Kết quả đáng chú ý: (1) B03 FR-21 (≥6 giờ hoặc 22h–7h và lỗi hãng) chưa khớp văn bản đã đọc: nơi nghỉ áp dụng khi chậm ≥6 giờ, khung 22h–7h đổi loại nơi nghỉ, điều kiện lỗi người vận chuyển được nêu cho hoàn vé/bồi thường (k7 không ghi điều kiện lỗi; diễn giải cần pháp chế xác nhận); (2) Điều 40 nói về miễn trừ bồi thường ứng trước và không đề cập miễn ăn/nghỉ; (3) mức 440.000đ khớp TT 48 Điều 5.1; (4) mốc đóng quầy nội địa 40 phút nên cả 90 và 120 phút đều hợp lệ; (5) nhắc nền khi đóng trang cần máy chủ push nên bị chặn; (6) Bamboo chưa cập nhật chính sách theo NĐ 208, Vietjet đã cập nhật; (7) hộp ngủ Nội Bài: T2 tầng 2 và T1 tầng 3 xác nhận, thiếu giá/giờ.
- Phân loại quyết định: A cần phê duyệt 5, B tham số mô phỏng 4, C trì hoãn 2, D bị chặn 2. Không quyết định nào đã được phê duyệt.
- Không tạo yêu cầu hay AC mới từ nghiên cứu: các giá trị chỉ xuất hiện ở SRS mục 3.4–3.5, DR-002 (đánh dấu EXTERNALLY_RESEARCHED) và RTM mục 6.
- Giới hạn: chưa thử nghiệm thực tế Push/service worker và tệp lịch; chưa đọc nội dung điều khoản đầy đủ của NĐ 356; chưa nghiên cứu thông lệ khách sạn/OTA về hủy/hết hiệu lực.

## 12. Thay đổi giữa v0.3 và v0.4

| Hạng mục | Thay đổi |
|---|---|
| Nghiên cứu pháp lý | Đọc bản chính thức NĐ 208/2026 Điều 30–31, 35–40 (R-19), TT 48 Điều 3–8 (R-01), Luật 91/2025 Điều 2, 9, 19 (R-23), NĐ 356/2025 Điều 5–6 (R-24). |
| G-02, G-17, D-01 | B03 FR-21 và B03 FR-04 chưa khớp văn bản đã đọc ở hai điểm (22h–7h; điều kiện lỗi); Điều 40 nói về miễn bồi thường ứng trước. D-01 chuyển sang “đã xác minh, chờ phê duyệt”. |
| Khoảng trống mới | G-19 (nghĩa vụ hãng và chính sách Airrest), G-20 (độ tin cậy chính sách hãng), G-21 (miễn trừ). |
| Nghiên cứu kỹ thuật | R-25…R-27: nhắc khi đóng trang cần máy chủ push; D-03 tách phần nhắc nền (bị chặn). |
| Nguồn dữ liệu | R-28: hộp ngủ T2 tầng 2, T1 tầng 3 xác nhận; giá và giờ không có. |
| Chính sách hãng | R-21 (Vietjet) cập nhật theo NĐ 208; R-22 (Bamboo) chưa cập nhật. |
| Quyết định | D-01…D-12 được phân loại A/B/C/D; thêm D-10, D-11, D-12; sửa D-01, D-03. |
| Ứng viên yêu cầu | SRS mục 3.5: CR-01…CR-12 (Proposed/Deferred/Blocked), không có AC; RTM mục 6 có nguồn và liên kết. |
| Câu hỏi mở | OQ-35 đã giải quyết; thêm OQ-36, OQ-37; cập nhật ghi chú OQ-06, 07, 12, 13, 18, 31, 33, 34. |
| Không đổi | MVP.md, mã nguồn, số lượng FR/NFR/BR/DR/UIR/IFR/UC/AC/TC. |

Thay đổi v0.5 (audit): xem `READINESS_AUDIT.md` mục 9; sổ quyết định cho PO: `PRODUCT_DECISION_REGISTER.md`.

## 13. Mức độ sẵn sàng

**SRS chưa sẵn sàng để triển khai.** Các quyết định sau ảnh hưởng trực tiếp tới tính đúng đắn nghiệp vụ và chưa được chủ sản phẩm chốt: D-01 và D-10 (điều kiện/phạm vi quyền lợi, MB-03 còn Blocked), D-05 (xác nhận điều kiện), OQ-04 (công thức giờ nghỉ/giờ rời), OQ-08 (state machine L2), OQ-14 (địa bàn), OQ-20 (người phê duyệt). Nhắc nền khi đóng trang (D-03*) và dữ liệu tiện ích nhà ga (D-09) đang bị chặn.

## 14. Thay đổi v0.6 (ba tác nhân, ngoài MVP)

- Chủ sản phẩm chỉ đạo (26/10/2026): hệ thống có ba tác nhân (người dùng cuối, khách sạn gồm lái xe, quản trị) dù MVP chưa có.
- Đã thêm FR-024…FR-034, BR-015…BR-017, NFR-010, DR-010…DR-012, UIR-012…UIR-014, UC-014…UC-019 ở trạng thái Proposed (ngoài MVP); OQ-38…OQ-42; D-25…D-29. Không thêm AC hay TC.
- Số lượng sau v0.6: 34 FR, 10 NFR, 17 BR, 12 DR, 14 UIR, 2 IFR, 19 UC; 64 AC (không đổi).
- Chưa rà soát độc lập; mức sẵn sàng vẫn **Not Ready** (mục 13), thêm 3 quyết định P0 (D-25, D-26, D-27).
