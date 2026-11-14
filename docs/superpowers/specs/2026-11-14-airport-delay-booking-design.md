# Airrest — luồng "Đặt phòng cho khách delay chuyến" (actor Sân bay / đơn vị chi trả)

Ngày: 2026-11-14 · Trạng thái: **chờ duyệt** · Hướng: bán thật (không chỉ demo)
Đối chiếu: `docs/srs/BA_PHAN_TICH_NGHIEP_VU_V2.md`, `docs/srs/SRS.md` (G-10, G-19, D-02), `docs/PLAN_XE_DUA_DON.md`, `docs/PLAN_NHIEU_PHONG_VA_THEO_GIO.md`

Mục "[đề xuất]" là em tự quyết, cần bạn duyệt. Mục "[đã chốt]" là bạn đã nói.

## 1. Mục đích
Khi chuyến bay delay lâu, đơn vị lo chỗ nghỉ phải xếp khách sạn + xe cho nhiều người trong vài phút. Airrest cho nhân viên quầy chọn chuyến, hệ thống tự xếp phòng/xe theo nhóm, khách sạn xác nhận, khách nhận email và không trả tiền. Cuối tháng đối soát ba bên. Airrest là bên chịu trách nhiệm với hành khách và với đơn vị chi trả.

## 2. Bên liên quan
- **Đơn vị chi trả** [đề xuất, PA B]: hãng bay / công ty phục vụ mặt đất / sân bay. Có nhiều **trạm** (mỗi trạm = 1 sân bay). Tài khoản nhân viên thuộc một trạm, thông tin sân bay lấy từ đó.
- **Hành khách:** không đăng nhập; người đại diện nhận email, tra cứu bằng mã + SĐT như khách lẻ.
- **Khách sạn:** xác nhận từng phòng, nhập số phòng, điều xe nhà.
- **Admin Airrest:** thu tiền đơn vị chi trả, trả khách sạn, xử lý sự cố.

## 3. Goals / Non-goals / Anti-goals
**Goals:** từ lúc bấm đặt đến lúc cả nhóm có phòng và xe không quá vài phút; không khách nào trễ chuyến vì giờ checkout; số tiền cuối tháng khớp giữa ba bên.
**Non-goals (lần này):** API nối hệ thống hãng thật; cổng thanh toán cho khách; xe ghép nhiều khách sạn; nâng hạng xe; tự quản số phòng/vị trí phòng của khách sạn; sân bay ngoài HAN/SGN.
**Anti-goals:** khách trẻ em ở một mình; bán trùng phòng/xe với luồng khách lẻ; gửi email cho khách trước khi khách sạn xác nhận; dữ liệu mô phỏng lọt vào kết toán thật.

## 4. Quyết định đã chốt (bởi bạn)
1. Dữ liệu chuyến và hành khách do phía đơn vị chi trả **đẩy sang qua cổng kết nối**. Khi trình bày có nút "Tạo chuyến bay delay" mở hộp thoại chọn giờ delay; hệ thống sinh chuyến + hành khách, không trùng thông tin.
2. Màn hình hiển thị các chuyến delay; bấm vào xem hành khách; bấm "Đặt phòng nghỉ" thì hệ thống tự xếp phòng.
3. Xếp phòng: (a) trẻ em + người đại diện cùng phòng, nhiều phòng thì cùng khách sạn và phòng sát nhau; (b) cùng nhóm ưu tiên cùng khách sạn, sát nhau, hết chỗ thì tách khách sạn, ưu tiên phòng đôi rồi phòng đơn; (c) người còn lại phòng đơn.
4. Khách sạn xác nhận **từng phòng**, **5 phút**; quá hạn thì hủy phòng và chuyển khách sạn khác. Nhóm ≥2 phòng được tách khách sạn; cụm đại diện + người phụ thuộc hủy liên đới và chuyển cùng nhau.
5. **Chỉ gửi email cho khách sau khi khách sạn xác nhận**: khách sạn, mã, link, số phòng, giờ check-in/checkout. Cho phép **sửa email khách** khi đặt phòng.
6. Giá: giá hợp đồng thấp hơn niêm yết, Airrest hưởng hoa hồng từ khách sạn.
7. Xe: dùng đội xe khách sạn, ưu tiên xe nhiều chỗ, người cùng nhóm cùng xe, xếp tương tự xếp phòng.
8. Airrest chịu trách nhiệm chính với khách (bán lại, một hóa đơn tổng tháng cho đơn vị chi trả). Nâng hạng phòng tại quầy, phần chênh khách tự thanh toán với đơn vị chi trả.
9. Checkout phải khớp giờ bay mới (ví dụ delay đến 17:00 thì có khung giờ nghỉ trước khi ra sân bay).

## 5. Approaches
- **PA1 (chọn):** mỗi phòng/cụm phòng không tách được = một booking chuẩn; thêm lớp "lô delay" bên trên. Dùng lại HOLD phòng, màn khách sạn, xe, tra cứu, support, sổ cái. Đánh đổi: một nhóm có nhiều mã đơn (có thêm mã nhóm); phải thêm bước gom xe.
- PA2: một booking nhiều phòng mỗi khách sạn. Loại vì xác nhận từng phòng + điều chuyển làm trạng thái, hoàn hủy, kết toán rối.
- PA3: hệ thống riêng. Loại vì bán trùng phòng/xe với khách lẻ.

## 6. Thiết kế [đề xuất, trừ khi ghi khác]
### 6.1 Dữ liệu mới (migration mới, idempotent, cập nhật docs/postgres theo quy ước dự án)
- `payers`, `payer_stations` (đơn vị chi trả, trạm ↔ sân bay), `payer_hotel_rates` (giá hợp đồng, hoa hồng %, khách sạn tham gia).
- `delay_flights_pax`: hành khách của chuyến (PNR, họ tên, tuổi, loại: em bé <2 / trẻ em 2–11 / người lớn ≥12, email/SĐT tùy chọn, nhu cầu đặc biệt, `simulated`).
- `delay_batches` (lô đặt cho một chuyến), `delay_groups` (nhóm theo PNR; cụm không tách), `delay_room_offers` (từng lượt gửi khách sạn: trạng thái, hạn 5', lý do từ chối, số lần chuyển).
- Mở rộng: `room_types` thêm sức chứa + loại giường; `vehicles` thêm số ghế trẻ em; `bookings.payment_method` thêm `PAYER`; booking liên kết `batch_id`/`group_id`.
- `payer_statements` (kết toán tháng hai chiều: đơn vị chi trả ↔ Airrest, Airrest ↔ khách sạn); sổ cái thêm khoản "đơn vị chi trả nợ". Chuyến/đơn `simulated` bị loại khỏi kết toán.
### 6.2 Cổng kết nối
Khóa API theo đơn vị chi trả, chỉ đẩy được chuyến của trạm mình. Idempotent theo (số hiệu + ngày) và (PNR + họ tên). Có nhật ký mỗi lần đẩy. Giờ bay mới kích hoạt tính lại. Nút "Tạo chuyến bay delay" đi **qua chính cổng này**, chỉ bật bằng cờ môi trường và bị chặn ở production (theo mẫu `SHUTTLE_SIM_AUTO`).
### 6.3 Xếp phòng
Hàm thuần, có test. Nhân viên tick khách nhận phòng (mặc định chọn hết), xem trước phương án, chỉnh, rồi xác nhận. Trẻ em không bao giờ ở phòng riêng; ưu tiên phòng gia đình → đôi + giường phụ → phòng thông nhau; không có thì báo xử lý tay. Nhóm gom theo PNR, cho gộp/tách tay. Chính sách ghép phòng đơn cấu hình theo đơn vị chi trả (mặc định phòng riêng). Chỉ KS có giá hợp đồng mới được xếp. Mỗi khách chỉ có một đơn hiệu lực cho mỗi chuyến.
### 6.4 Khách sạn xác nhận & điều chuyển
Giữ phòng bằng HOLD trong 5'. Cụm xác nhận bằng một thao tác; phòng độc lập xác nhận từng phòng. KS nhập số phòng (cụm: sát nhau/thông nhau). Từ chối thì chuyển ngay. Quá hạn/từ chối: ưu tiên KS mà người cùng nhóm đã được xác nhận, rồi KS gần nhất còn phòng; không gửi lại KS đã từ chối. Quá 3 lần chuyển hoặc 15' thì báo đỏ nhân viên quầy. Tham số cấu hình: 5', 3 lần, 15', 120' có mặt trước giờ bay, 15' dự phòng, 3' tài xế nhận, 15' chờ khách, 30' hủy miễn phí. Kịch bản sự cố H1–H15 và X1–X12 theo phân tích phần 5 của buổi brainstorm (giữ nguyên làm danh mục test).
### 6.5 Giờ checkout
Giờ rời KS = giờ bay mới − 120' − thời gian xe chạy − 15' dự phòng (không dùng quy tắc "1 giờ trước bay"). Tự tạo chuyến xe KS → sân bay. Đổi giờ bay thì tính lại; gia hạn tốn tiền chỉ khi nhân viên quầy xác nhận.
### 6.6 Xe
Hàm xếp xe riêng cho luồng này (không đổi `dispatch.ts` của khách lẻ). Mục tiêu: ít xe nhất, cùng số xe thì ít ghế thừa; cụm có trẻ em không tách, nhóm cùng PNR ưu tiên cùng xe; ghế cạnh tài xế không tính cho trẻ dưới 10 tuổi/1,35 m; một xe chỉ một khách sạn. Gom đợt chờ tối đa 10' (cụm trẻ em/hỗ trợ không chờ). Hết xe → xe ngoài nguyên cụm. Xe về sân bay tạo sẵn khi KS xác nhận, xếp cùng quy tắc.
### 6.7 Email & tra cứu
Gửi sau khi KS xác nhận, theo từng phòng; người đại diện nhận bản tổng hợp cập nhật dần. Email khách sửa được, có kiểm tra định dạng + nhật ký; sửa sau khi đặt thì có nút gửi lại. Tra cứu bằng mã + SĐT như hiện tại (bắt buộc SĐT người đại diện); thêm mã nhóm xem cả nhóm.
### 6.8 Tiền & trách nhiệm
Airrest bán lại: một hóa đơn tổng tháng cho đơn vị chi trả; trả KS giá hợp đồng trừ hoa hồng; sự cố do Airrest xử lý rồi truy thu KS ở kỳ sau. Bảng kê tách "giá phòng chuẩn" và "phần chênh nâng hạng". Nâng hạng chỉ tại quầy trước khi gửi KS; nâng tại lễ tân KS thì khách trả thẳng và không vào hóa đơn. Mỗi kỳ có thời hạn khiếu nại trước khi khóa sổ. SLA với đơn vị chi trả (thời gian từ bấm đặt đến có phòng) được đo và báo cáo.
### 6.9 Quyền
Theo permission, không theo tên vai trò; dùng lại mã hiện có khi phù hợp, thêm mã mới cho đơn vị chi trả/kết toán/nâng hạng (cần xác nhận khi vào GĐ1).

## 7. Giai đoạn (mỗi GĐ chạy và demo độc lập)
1. Nền: đơn vị chi trả/trạm/tài khoản/quyền, cổng kết nối + nút tạo chuyến mô phỏng, giá hợp đồng, mở rộng loại phòng/xe.
2. Xếp phòng + gửi KS xác nhận 5' + chuyển KS/hủy liên đới + email + tra cứu mã nhóm.
3. Xếp xe gom đợt (chiều đi và về).
4. Đổi giờ bay/hủy chuyến, no-show, nâng hạng.
5. Kết toán hai chiều, hóa đơn tổng, báo cáo SLA.

## 7b. Quyết định bổ sung (chốt 2026-11-14 sau builder check)
Bạn đồng ý theo đề xuất của em ("cứ theo đề xuất"):
1. **Giá:** đơn vị chi trả trả **giá hợp đồng**; hoa hồng Airrest = % trên giá hợp đồng, trừ vào tiền trả KS; giá theo đêm + bảng giá theo khung giờ (dùng lại đặt theo giờ có sẵn); sự cố Airrest chịu trước rồi truy thu KS. (Thay cho câu "giá thấp hơn niêm yết" ở mục 4.6 khi mâu thuẫn.)
2. **Tồn phòng/xe dùng chung** với khách lẻ; KS tùy chọn dành riêng một phần phòng cho luồng delay (`room_blocks`). Hết phòng thì cảnh báo đỏ cho quầy. Phải kiểm tra HOLD chịu được hủy/chuyển liên tục; nếu phải sửa HOLD thì tách thành việc riêng ở GĐ2.
3. **Production lấy dữ liệu:** cổng kết nối với payload chuẩn **và** màn nhập tay cho nhân viên quầy (nhập chuyến, hành khách, hoặc tải CSV).
4. **Chốt sổ:** tháng dương lịch; 5 ngày khiếu nại; chỉ admin tài chính mở lại kỳ; truy thu ghi vào kỳ kế tiếp.
5. **Quyết định của em:** "sát nhau" là cam kết của KS khi nhập số phòng, hệ thống không kiểm tra vị trí; `room_types` thêm sức chứa, loại giường, cờ thông nhau/gia đình. Cô lập dữ liệu giữa các đơn vị chi trả ở cả API và màn hình. Quy mô giả định ≤300 khách/chuyến, thuật toán tham lam theo ưu tiên. Hết hạn 5' bằng job quét vài giây một lần, khóa chống chạy trùng, tham số đọc từ cấu hình hệ thống (chưa kiểm tra bộ lập lịch có sẵn).
6. Quy tắc `dotnet ef` của `newsroom-planning` **không áp dụng** cho Airrest; thêm migration SQL kiểu hiện có (`backend/database/migrations/017_*.sql`). Làm GĐ1 trước rồi demo.

## 7c. Quyết định bổ sung GĐ2 (chốt 2026-11-14)
1. Em bé <2 tuổi không cần ghế trẻ em trên xe và không chiếm ghế; chỉ trẻ 2–9 tuổi cần `childSeats` và bị cấm ghế trước.
2. Cụm thông nhau: mỗi phòng phải có người lớn; thiếu người lớn thì lấy thêm người lớn cùng PNR làm người đi kèm, vẫn thiếu thì xử lý tay. Người đi lẻ PRIVATE: phòng đơn → twin → đôi.
3. Mở `createBooking` cho `payment_method='PAYER'` bằng nhánh mới, KHÔNG đổi hành vi luồng khách lẻ; bắt buộc chạy lại test đặt phòng/đặt xe của khách lẻ. Hạn giữ phòng 5' theo từng đơn.
4. Email: thêm `nodemailer` + bảng outbox (không mất thư khi lỗi); dev chỉ ghi log, môi trường thật dùng SMTP cấu hình sau.
5. Hết hạn 5': job riêng quét `delay_room_offers.expires_at` vài giây một lần (job 60s hiện có không dùng được). Realtime chỉ trong một tiến trình (nhiều instance cần bus ngoài, để sau).
6. Chia GĐ2: A (createBooking PAYER) → song song B (dịch vụ lô + API đặt phòng), C (KS xác nhận/số phòng/chuyển KS/hủy liên đới), D (job hết hạn + realtime), E (email + tra cứu mã nhóm + giao diện).

## 8. Việc giao cho người thực hiện / còn mở
- Hợp đồng KS: phạt khi KS hủy sau khi đã xác nhận, hủy miễn phí khi hủy liên đới, mức trần giá xe ngoài.
- Pháp lý: căn cứ xử lý dữ liệu hành khách (NĐ 13/2023); hóa đơn VAT.
- Khách quốc tế nối chuyến không visa: loại khỏi xếp phòng, xử lý tay (H14).
- Tên bảng/cột chi tiết, giao diện, thứ tự test do người thực hiện quyết định theo mẫu code hiện có.
- Mọi thay đổi schema phải cập nhật tài liệu DB và chạy typecheck + test trước khi coi là xong.
