# Screen Requirements Map — Airrest MVP UI

Ngày 2026-10-26. Căn cứ: `docs/MVP.md` (nguồn phạm vi) và `docs/srs/` (SRS, RTM, OPEN_QUESTIONS, RESEARCH_AND_GAP_ANALYSIS, PRODUCT_DECISION_REGISTER, READINESS_AUDIT). SRS đang ở trạng thái **Not Ready**; bản đồ này chỉ ánh xạ yêu cầu sang giao diện và **không** tạo yêu cầu hay AC mới.

> Ghi chú trung thực: tài liệu này được viết sau khi đã đọc SRS và trong lúc triển khai, không phải hoàn toàn trước khi viết mã như quy trình đề ra. Nội dung đã được đối chiếu lại với mã đã chạy ở `IMPLEMENTATION_REPORT.md`.

Lưu ý (cập nhật giao diện kiểu Couppa): lối vào mặc định là M3 ở chế độ duyệt, khác luồng M0→M3 của MVP; xem `IMPLEMENTATION_REPORT.md` mục 9b.

Trạng thái triển khai: **Implemented** (đủ phần được phép), **Partial** (khung trung lập hoặc thiếu một phần), **Blocked** (không thể hoàn thiện vì thiếu quyết định/dữ liệu). Tệp mã nằm trong `src/`.

## 1. Bản đồ theo màn hình

| Màn hình / route (hash) | MVP | FR / NFR / BR / DR | Thành phần UI | Hành động người dùng | Trạng thái giao diện | Validation và thông báo | AC | Trạng thái | Phụ thuộc quyết định chưa duyệt |
|---|---|---|---|---|---|---|---|---|---|
| **M0** Tra cứu chuyến bay `#/home` (không còn là trang chủ; vào từ header, thanh bên, banner) — `screens/Home.jsx` | MB-01 | FR-001, FR-002; BR-001, BR-002; DR-001; NFR-005 | Tab “Có số hiệu / Tôi không có số hiệu”, ô số hiệu, ngày, sân bay, giờ mới, “Chưa biết giờ bay mới”, giờ ban đầu, chuyến mẫu | Tra cứu, nhập thủ công, chọn chuyến mẫu | Đang tải, không tìm thấy, lỗi dịch vụ + Thử lại, dữ liệu nhập được giữ | Số hiệu 2 chữ + 1–4 số; ngày trong ±1 ngày; thiếu giờ mới; thông báo nêu cách sửa | AC-001…AC-004 | Implemented | D-22 (quy tắc đầu vào, Proposed); OQ-23 (giờ cũ khi nhập thủ công) |
| **M1** Tình trạng + Quyền lợi `#/status` — `Status.jsx`, `FlightStatusCard.jsx` | MB-02, MB-03, MB-20 | FR-003, FR-004, FR-005; BR-006, BR-007, BR-012; DR-001, DR-002; NFR-006, NFR-007, NFR-008 | Thẻ trạng thái (luôn hiển thị ở đầu các màn sau M0), “cập nhật lúc”, banner đổi giờ, nút Làm mới, bảng quyền lợi tham khảo, 3 nút bước tiếp theo | Làm mới, đóng banner, chọn gợi ý / tìm nơi nghỉ / đề nghị hãng | Đúng giờ, chậm, huỷ, chưa biết giờ, “có thể đã cũ” | Nguyên nhân chưa rõ → “Chưa kết luận”; nguyên nhân ngoài kiểm soát → “Phụ thuộc nguyên nhân, không kết luận” | AC-005…AC-009, AC-059…AC-061 | **Partial** (thẻ trạng thái và banner: Implemented; bảng quyền lợi: khung tham khảo) | **D-01, D-10, D-13** (MB-03 và MB-20 Blocked); AC-010 TBD không triển khai |
| **M2** Gợi ý `#/advice` — `Advice.jsx` | MB-04 | FR-006, FR-007; BR-011; NFR-009 | Bảng giải thích giờ có mặt, đến nơi, rời, thời gian nghỉ; hai nhánh | Chọn “Đi nghỉ” hoặc “Ở lại sân bay” | Đang tải, lỗi + Thử lại, chưa biết giờ, huỷ, không có nơi nhận khách, cảnh báo nghỉ ngắn | — | AC-011, AC-013 (AC-012 TBD) | Implemented (công thức là tham số mô phỏng) | **OQ-04**, D-02, D-14 |
| **M3** Nơi nghỉ = **trang chủ** `#/stays` (chế độ duyệt khi chưa có chuyến bay; chi tiết mở ở panel phải trên desktop) — `Stays.jsx`, `PropertyCard.jsx` | MB-05 | FR-008, FR-009, FR-010; BR-003, BR-004, BR-001; DR-003, DR-004 | Chip lọc (aria-pressed), thẻ nơi nghỉ, “Xem thêm”, thông báo chuyển từ M9 / phòng vừa hết | Bật/tắt chip, mở chi tiết, xem thêm | Đang tải, lỗi + Thử lại, rỗng + hành động, dữ liệu cũ | — | AC-014…AC-019, AC-026 (phần thông báo), AC-046 | Implemented (tập chip là Proposed) | D-21, D-23 |
| **M4** Chi tiết `#/detail` — `Detail.jsx` | MB-06 | FR-011; BR-005; DR-003, DR-004 | Giá tổng + giả định, huỷ, lễ tân, thanh toán, cách đi, tiện ích, đánh giá, “cập nhật lúc” | Đặt chỗ, về danh sách | Cơ sở đóng/hết phòng → ẩn nút đặt | — | AC-020…AC-022 | Implemented | D-06 |
| **M5** Đặt chỗ `#/booking` — `Booking.jsx` | MB-07 | FR-012, FR-013; BR-001, BR-002; DR-005; NFR-005 | 3 bước, tên gọi, 2 cách trả (mô phỏng), tóm tắt, màn thành công | Tiếp tục, bước trước, xác nhận | Đang xác nhận, lỗi + Thử lại, phòng vừa hết, nơi nghỉ đóng | Tên gọi bắt buộc ≤50 ký tự; từ chối giá trị giống số điện thoại/email; phải chọn cách trả | AC-023…AC-028 | Implemented | D-15 (cách đếm bước, phương thức), D-18 |
| **M6** Nhắc giờ `#/reminder` — `Reminder.jsx` | MB-08 | FR-014, FR-015, FR-016; BR-011; DR-006 | Bảng giờ rời, “Bật nhắc giờ”, tải .ics, trạng thái kênh, giới hạn không nhắc khi đóng trang | Bật nhắc, xin quyền thông báo, tải lịch | Quyền bị từ chối/không hỗ trợ → thông báo dùng tệp lịch; đến giờ rời; giờ bay đổi | — | AC-029, AC-031, AC-032 (AC-030 TBD) | Implemented một phần: **không có nhắc nền khi đóng trang** | **OQ-04**, D-03, D-03* (Blocked) |
| **M7** Nhà ga `#/terminal` — `Terminal.jsx` | MB-09 | FR-017; DR-008 | Danh sách vị trí hộp ngủ, cảnh báo chưa xác minh, nguồn | Về gợi ý / xem nơi nghỉ | HAN: 2 mục; SGN: rỗng | — | AC-033 (không thể thỏa đầy đủ) | **Blocked một phần**: chỉ vị trí; giờ mở, giá, ngày cập nhật ghi “Chưa có thông tin” | D-09, D-16 |
| **M8** Trợ giúp `#/support` — `Support.jsx` | MB-10 | FR-018; BR-013; DR-009 | 3 FAQ kèm nguồn, ngày hiệu lực, ngày truy cập | Quay lại | — | Không có số điện thoại hay kênh liên hệ nào | AC-034, AC-035 | Partial (giản lược; Conditional) | D-12, D-16 |
| **M9** Đề nghị hãng hỗ trợ `#/request` — `Request.jsx`, `lib/request.js` | MB-11…MB-14 | FR-019…FR-023; BR-008, BR-009, BR-010, BR-014; DR-007; IFR-002 | Thông tin điều kiện (không chặn), nút gửi, mã yêu cầu, trạng thái, tiến trình, lý do từ chối, ≤3 đề xuất thay thế, mã xác nhận, nút chuyển tự chi trả | Gửi, chọn đề xuất, chuyển tự chi trả, sang nhắc giờ | Chờ, quá hạn, duyệt, từ chối, cơ sở từ chối, xác nhận, đã chuyển, giờ bay đổi | — | AC-036…AC-047 | Implemented theo **trạng thái đề xuất** của SRS 4.3 | **OQ-08** (state machine), D-01, D-04, D-17 |
| **M10** Khu vực khách sạn (gồm lái xe) `#/hotel` — `Hotel.jsx`, `Tabs.jsx`, `mock/partner.js` | — (ngoài MVP, chỉ đạo PO 26/10/2026) | FR-025…FR-028; BR-015…BR-017; DR-010…DR-012; NFR-010 | Tóm tắt cơ sở (hiển thị cho người dùng cuối, phòng còn, giá, cập nhật lúc); tab Đặt chỗ (xác nhận/từ chối kèm lý do), Phòng và giá, Hồ sơ cơ sở, Đón khách (lái xe: nhận chuyến, đang đến, đã đón, hoàn tất, không đón được) | Lưu, từ chối, cập nhật trạng thái đón | Rỗng; không có quyền; chưa đăng nhập | Số phòng 0–99; giá 100.000–20.000.000đ; lý do bắt buộc khi từ chối/không đón được | Chưa có AC | **Proposed (ngoài MVP)**: Implemented theo giả định phương án A | D-25, D-26, D-27, D-28, D-29 |
| **M11** Khu vực quản trị `#/admin` — `Admin.jsx` | — (ngoài MVP) | FR-030…FR-034; BR-015…BR-017; DR-010…DR-012; NFR-010 | Tab Cơ sở (khoá/kích hoạt có cảnh báo khi còn đặt chỗ; thêm cơ sở), Tài khoản (tạo, khoá), Nội dung và tham số (5 tham số mô phỏng có ràng buộc 40 phút; nội dung quyền lợi Chờ PO duyệt, không cho bật), Giám sát (đặt chỗ, yêu cầu đón, yêu cầu L2 đọc từ phiên), Nhật ký và thống kê | Khoá, tạo, sửa tham số, lọc | Rỗng; không có quyền | Tên ≤60 ký tự; giá hợp lệ; tham số trong khoảng cho phép | Chưa có AC | **Proposed (ngoài MVP)**: Implemented một phần (FR-033: chỉ xem, không duyệt thay hãng vì D-27 = A) | D-25, D-27, D-28, D-29, D-13 |
| **M12** Đăng nhập đối tác `#/login` — `Login.jsx` | — (ngoài MVP) | FR-024; BR-015 | 3 thẻ vai trò, chọn tài khoản, nhãn “không có mật khẩu thật” | Đăng nhập, đăng xuất | Tài khoản bị khoá → lỗi nêu cách khắc phục | — | Chưa có AC | **Proposed (ngoài MVP)**: Implemented (đăng nhập mô phỏng, D-25 = A) | D-25 |
| Xe đón ở M5 (người dùng cuối) — `BookingLive.jsx` | — (ngoài MVP) | FR-029; FR-027 | Khối “Xe đón từ sân bay” (khi cơ sở có xe), nút Yêu cầu xe đón, các bước trạng thái, lý do khi không đón được; thông báo khi cơ sở từ chối đặt chỗ | Yêu cầu xe đón | Cơ sở không có xe: ẩn | — | Chưa có AC | **Proposed (ngoài MVP)**: Implemented | D-26 |
| Toàn hệ thống | MB-17…MB-19 | NFR-001…NFR-006 | Bố cục mobile-first, nhãn “Mô phỏng”, không đăng nhập, không thu dữ liệu | — | — | Mọi lỗi nêu cách khắc phục | AC-048, AC-049, AC-051, AC-053 (vùng chạm), AC-054, AC-056…AC-058 | Implemented (không đo: tương phản, Lighthouse, ngưỡng khả dụng) | D-20 |

## 2. Nội dung KHÔNG triển khai

| Nội dung | Lý do | Nguồn |
|---|---|---|
| Gọi xe, chỉ đường, lưu chứng từ, “Lưu nơi nghỉ”, định vị người dùng | MB-15 đã loại; D-18 | MVP, D-19 |
| Bản đồ | **Đã làm theo yêu cầu người dùng dù MB-15 “Đã loại” và AC-063**; vị trí cơ sở là tổng hợp; xem `IMPLEMENTATION_REPORT.md` mục 9c | Yêu cầu của người dùng |
| Tài khoản, điểm, voucher | MB-16 đã loại | MVP |
| Số điện thoại hỗ trợ, “Trò chuyện ngay”, hotline | MB-10: không giả hotline; chưa có nguồn xác minh | MVP, D-12 |
| Nhắc nền khi đóng trang (Push) | Cần máy chủ push ngoài MVP | D-03* |
| Giá, giờ mở, đơn vị vận hành của tiện ích nhà ga | Thiếu nguồn hiện hành | D-09 |
| Hủy đặt chỗ mô phỏng | MVP không quy định | OQ-29 |
| SMS, email | Ngoài MVP | OQ-09 |
| Tuyên bố “70 nơi nghỉ đã đối chiếu”, “phản hồi trong 3 giây”, “chỉ còn 1 phòng” | Không truy vết được về MVP và sai dữ liệu | OQ-27 |
| Tiêu chí nghiệm thu mới | Không được tạo | Yêu cầu của nhiệm vụ |

## 3. Quyết định giả định mô phỏng đang dùng (chưa phê duyệt)

D-02 (có mặt trước giờ bay 120 phút, ràng buộc cứng ≥ mốc đóng quầy 40 phút), D-04 (hết hạn yêu cầu 15 phút), D-06 (1 phòng, 1 đêm, 2 người lớn), D-08 (dữ liệu cũ sau 30 phút), D-21 (4 chip, 5 kết quả), D-15 (3 bước; “Trả tại nơi nghỉ”/QR/thẻ), D-17 (kịch bản L2 chọn trước theo chuyến bay). Tất cả nằm ở `src/config/simulation.js` hoặc dữ liệu mock và đổi được mà không sửa giao diện.

## 4. Ba tác nhân (ngoài MVP)

M10, M11, M12 và khối xe đón theo chỉ đạo của chủ sản phẩm ngày 26/10/2026 (SRS 3.6). Không có hạng mục MB hay AC; dữ liệu dùng chung giữa ba tác nhân chỉ lưu trong bộ nhớ trang (D-29 = A); đăng nhập mô phỏng không có mật khẩu (D-25 = A); lái xe chỉ cập nhật trạng thái đón, không bản đồ hay định vị (D-26 = A); hãng vẫn là tác nhân mô phỏng (D-27 = A). Các giả định này chưa được PO phê duyệt.
