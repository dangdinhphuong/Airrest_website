# Phân tích nghiệp vụ Airrest — quyết định, quy tắc chi tiết và kịch bản (BA, v2.1)

Ngày: 2026-11-09 (v2.3: bỏ hoa hồng, bổ sung luồng hủy–đổi–hoàn) · Đi kèm [SRS_V2_NenTang_Airrest.md](SRS_V2_NenTang_Airrest.md) · Trạng thái: **BA đề xuất, chờ PO ký duyệt**.
Mọi con số trong tài liệu là **giá trị mặc định đề xuất** (tham số cấu hình ở FR-ADM-12), không phải số liệu thị trường. Phần pháp lý chỉ là điểm cần luật sư/kế toán xác nhận, không phải tư vấn pháp lý.

---

## 1. Tóm tắt phân tích

| Câu hỏi nền tảng | Kết luận BA |
|---|---|
| Airrest là gì về mô hình kinh doanh? | **Marketplace hai chiều** (khách ↔ khách sạn) có dịch vụ xe đi kèm. Doanh thu của Airrest = **chỉ phí dịch vụ đơn hàng** thu của khách (**PO đã bỏ hoa hồng** thu của khách sạn, 2026-11-09) |
| Điểm khác biệt cạnh tranh | Đặt theo **ngữ cảnh chuyến bay** + **xe đưa đón gắn đơn** + **hỗ trợ khẩn cấp có người gọi lại**. Phải tối ưu tốc độ (≤ 5 bước) hơn là độ đầy đủ |
| Rủi ro lớn nhất | (1) Dòng tiền giữ hộ (pháp lý); (2) tồn phòng sai → khách đến không có phòng; (3) xe không đến; (4) dữ liệu chuyến bay sai/trễ |
| Nên làm trước | P1: bán được đơn "phòng + xe" cho 2 sân bay với khách sạn nhập tồn thủ công/ổn định, thanh toán tại khách sạn là mặc định an toàn, MoMo bật khi pháp lý xong |

---

## 2. Quyết định cho 13 câu hỏi mở (đề xuất chốt)

| OQ | Quyết định BA | Lý do | Rủi ro còn lại |
|---|---|---|---|
| OQ-2-01 Quy tắc gợi ý | Bảng quyết định ở mục 3.1. Nguồn chuyến bay: **qua nhà cung cấp dữ liệu bay thương mại (1 chính + cache)**, chọn vendor sau PoC; luôn có **nhập tay sân bay + ngày** làm phương án dự phòng | Không tự dựng dữ liệu bay; sự cố đúng lúc nhà cung cấp lỗi vẫn phải đặt được | Vendor sai/trễ: hiển thị "cập nhật lúc", cho khách xác nhận lại |
| OQ-2-02 Duyệt tay vs tự động | **Mặc định tự xác nhận**. Khách sạn mới/đang thử có thể bật "duyệt tay" tối đa 90 ngày đầu. Hạn duyệt 10 phút → nhắc, 15 phút → báo Admin, 20 phút → tự `EXPIRED` + hoàn tiền + gợi ý khách sạn khác | Bối cảnh khẩn cấp: chờ lâu là mất khách | Khách sạn chậm phản hồi → tỷ lệ hủy cao; theo dõi KPI (mục 8) |
| OQ-2-03 Công thức giá | Mục 4 (giá phòng, giá xe theo bậc km, phí dịch vụ %). Giá **đã gồm VAT**; hóa đơn phòng do khách sạn xuất, hóa đơn phí do Airrest xuất | Rõ ràng, cấu hình được | Tỷ lệ cụ thể là quyết định kinh doanh |
| OQ-2-04 Hủy/đổi/no-show | 3 mẫu chính sách (mục 5); mặc định **Linh hoạt** cho đơn khẩn cấp; hủy vì chuyến bay bị hủy/đổi giờ lớn → **miễn phí kèm bằng chứng** | Giảm cản trở đặt; phù hợp ngữ cảnh | Lạm dụng "chuyến bay hủy": kiểm tra với dữ liệu bay |
| OQ-2-05 Giữ tiền hộ | **Cổng kiểm soát pháp lý trước P2.** Thiết kế nghiệp vụ theo mô hình giữ hộ (chi T+1 sau check-out, cửa sổ khiếu nại 24h); nếu pháp lý không cho: chuyển sang **tách tiền ngay ở cổng thanh toán** (khách sạn nhận trực tiếp, Airrest thu phí dịch vụ đơn từ khách ngay trong giao dịch). P1 chỉ bật "trả tại khách sạn" nếu chưa xong | Giữ hộ tiền của bên thứ ba có thể thuộc dịch vụ trung gian thanh toán chịu cấp phép — cần xác nhận | Chặn lịch phát hành P2 |
| OQ-2-06 Tiền xe | Tiền xe là **doanh thu của đơn vị chạy xe (khách sạn)**, **khách sạn nhận trọn, không khấu trừ** (hoa hồng đã bỏ) | Đơn giản; khớp quyết định bỏ hoa hồng | Xe thuê ngoài P2: thỏa thuận riêng (xem OQ-2-07) |
| OQ-2-07 Xe/tài xế | **P1: xe của khách sạn**, tài xế do khách sạn tạo tài khoản; app tài xế dạng **web mobile qua link** (không native). **P2:** đối tác vận tải riêng. Đơn xe độc lập (không phòng): **ngoài phạm vi** | Ít bên tham gia, giảm độ phức tạp | Khách sạn không có xe → không bật tùy chọn xe |
| OQ-2-08 Kênh thông báo | P1: **Email + SMS cho giao dịch quan trọng** (mã đặt, xác nhận, xe được phân, sự cố). P2: web push, Zalo ZNS | SMS đảm bảo đến được khách vãng lai khẩn cấp | Chi phí SMS tính vào phí dịch vụ |
| OQ-2-09 Lưu trữ | Audit log: 24 tháng truy cập nhanh, lưu trữ ≥ 5 năm; chứng từ tài chính theo luật kế toán (xác nhận kế toán, thường dài hơn); vết vị trí xe: 30 ngày; vị trí hỗ trợ khẩn cấp: 90 ngày; **CCCD chỉ thu khi cần khai báo lưu trú, tại check-in** (lễ tân nhập/quét), không bắt buộc ở bước đặt | Tối thiểu hóa dữ liệu | Cần DPO/pháp chế duyệt |
| OQ-2-10 Phân kỳ | Chấp nhận P1–P3 ở SRS §8, điều chỉnh: **MoMo online chuyển từ P1 sang P2** nếu chưa qua cổng pháp lý OQ-2-05 | Tránh chặn ra mắt | — |
| OQ-2-11 Phí trên đơn hủy | **Phí dịch vụ đơn** của khách: hoàn khi hủy miễn phí/do khách sạn-hệ thống; **không hoàn** khi hủy có phạt hoặc no-show. Khách sạn nhận trọn số tiền phạt | Không có hoa hồng nên không phát sinh phí khách sạn | — |
| OQ-2-12 Phạm vi | **Hà Nội (HAN) và TP.HCM (SGN)**, ≥ 10 khách sạn đối tác/sân bay trước khi mở bán, bán kính phục vụ xe 25 km | Khớp phạm vi SRS cũ | — |
| OQ-2-13 Chat bot | P1: **kịch bản/FAQ cố định + chuyển người**; P2: AI hỗ trợ, có kiểm duyệt; không đưa dữ liệu cá nhân vào bot | Dễ kiểm soát | — |

---

## 3. Quy tắc nghiệp vụ chi tiết

### 3.1 Bảng quyết định gợi ý nơi nghỉ (BR-FLT)

Đặt `Δ` = giờ cất cánh dự kiến (mới nhất) − hiện tại; `D` = thời gian chậm.

| # | Điều kiện | Gợi ý | Loại lưu trú ưu tiên | Ghi chú |
|---|---|---|---|---|
| 1 | Chuyến đã hạ cánh | **Điểm đến** | Qua đêm / theo giờ | "Nghỉ ngay sau hạ cánh" [G] |
| 2 | Chuyến **hủy**, khách chưa bay | **Điểm đi** | Qua đêm | Cho phép khách chuyển "tôi đang ở điểm đến" |
| 3 | `D > 5h` | **Điểm đi** | Qua đêm hoặc gói dài | [G] |
| 4 | `Δ ≤ 5h` (còn ≤ 5 giờ tới giờ bay) | **Điểm đi** | **Gói giờ ngắn** (3h/6h), ưu tiên khách sạn gần nhà ga | Diễn giải của "cách giờ bay 5 tiếng" [G]; chờ PO xác nhận |
| 5 | `D ≤ 5h` và `Δ > 5h` | Hiển thị trạng thái + gợi ý nhẹ "đặt phòng nếu cần" | Tuỳ chọn | Không ép |
| 6 | Không có dữ liệu | Nhập thủ công sân bay + ngày | — | FR-FLT-06 |

Ưu tiên khi trùng điều kiện: 1 > 2 > 3 > 4 > 5. Ngưỡng 5h cấu hình (BR-FLT-05).

### 3.2 Mô hình bán phòng
- Hai kiểu: **theo giờ** (gói 3h, 6h) và **theo đêm/ngày** (có giờ check-in/out chuẩn). Khách sạn bật kiểu nào tùy cấu hình.
- **Khoảng đệm dọn phòng** mặc định 0 phút (BR-BKG-02); khách sạn được đặt tối đa 60 phút, nhưng phải hiển thị cho khách khi chọn giờ.
- **Tồn phòng** = tổng − đã đặt − đang giữ − sự cố/khóa; tính theo từng khung thời gian, không theo ngày (tránh bán trùng khi bán giờ).

### 3.3 Giữ chỗ và chống tranh chấp
1. Khách bấm "Tiếp tục thanh toán" → giữ 10 phút (có đếm ngược trên màn).
2. Trong thời gian giữ, số phòng bị trừ khỏi tồn hiển thị cho người khác.
3. Hết hạn mà chưa thanh toán → `EXPIRED`, nhả phòng.
4. Thanh toán thành công **sau** khi hết hạn: nếu phòng còn → xác nhận; nếu hết → **hoàn tự động 100%** + gợi ý khách sạn khác + thông báo.
5. Đơn tại khách sạn: giữ phòng đến **giờ check-in + 60 phút** (cấu hình); quá hạn không liên hệ → `NO_SHOW`.

### 3.4 Sự cố phòng (BR-BKG-05 mở rộng)
Thứ tự xử lý: khách sạn báo sự cố → hệ thống thông báo khách + Admin → khách sạn đề xuất phòng thay (chất lượng ≥, không phụ thu) **hoặc** Admin đề xuất khách sạn khác cùng khu vực → khách chọn đổi/hủy. Nếu đổi sang khách sạn khác chênh giá: **khách sạn gây sự cố bù chênh lệch**. Hủy → hoàn 100% + hệ thống ghi **điểm sự cố** cho khách sạn (ảnh hưởng xếp hạng).

### 3.5 Quy trình trạng thái phòng (khách sạn)
`Trống → Đã giữ → Có khách → Cần dọn → Đang dọn → Trống`; nhánh `Sự cố/Bảo trì` (khóa bán). Chỉ phòng `Trống` mới bán được; check-out tự chuyển `Cần dọn`; buồng phòng bấm `Đang dọn` → `Trống`.

### 3.6 Đơn xe — quy tắc điều phối
1. Đơn xe tạo cùng booking; chưa được gán xe khi booking chưa `CONFIRMED`.
2. Hệ thống đề xuất xe/tài xế **rảnh gần nhất theo giờ đón**; lễ tân hoặc điều phối xác nhận (P1 thủ công).
3. Tài xế có **3 phút** nhận/từ chối; không phản hồi → chuyển xe khác, cảnh báo Admin sau 2 lần.
4. Chuyến đón sân bay: tài xế cần **mã đơn + 4 số cuối SĐT** khách để xác minh khi đón.
5. Khách **không có mặt** quá 10 phút tại điểm đón → `FAILED`, tài xế báo; tính phí xe theo chính sách (mặc định 100% với chiều đó).
6. Chiều về: khách sạn tạo khi check-out (hoặc khách hẹn trước); nếu khách trả phòng sớm/muộn, giờ đón sửa theo.
7. Thay đổi giờ bay sau khi đặt: đưa ra lựa chọn đổi giờ đón miễn phí **nếu cùng ngày** hoặc hủy xe miễn phí.

**Trạng thái đơn xe:** `REQUESTED → ASSIGNED → ON_THE_WAY → ARRIVED → PICKED_UP → COMPLETED`; nhánh `CANCELLED`, `FAILED`.

### 3.6b Ma trận quyền (chức năng × vai trò)

| Chức năng | Khách | Chủ KS | Lễ tân | Buồng phòng | Kế toán KS | Tài xế | Điều phối xe | CSKH | Kế toán Admin | Quản trị HT |
|---|---|---|---|---|---|---|---|---|---|---|
| Đặt/tra cứu đơn của mình | ✔ | | | | | | | | | |
| Xem/duyệt đơn KS | | ✔ | ✔ | | | | | ✔(đọc) | ✔(đọc) | ✔ |
| Check-in/out | | ✔ | ✔ | | | | | | | |
| Trạng thái dọn phòng | | ✔ | ✔ | ✔ | | | | | | |
| Cấu hình giá/phòng | | ✔ | | | | | | | | ✔(hộ) |
| Doanh thu, đối soát phí dịch vụ | | ✔ | | | ✔ | | | | ✔ | |
| Phân quyền KS | | ✔ | | | | | | | | |
| Nhận/chạy đơn xe | | | | | | ✔ | | | | |
| Phân xe | | ✔ | ✔ | | | | ✔ | | | ✔ |
| Ticket/khẩn cấp | | | | | | | | ✔ | | ✔ |
| Đối soát/chi trả/hoàn | | | | | | | | | ✔ | ✔ |
| Cấu hình hệ thống, tài khoản admin | | | | | | | | | | ✔ |
| Audit log | | | | | | | | đọc | đọc | ✔ |

Nguyên tắc: **tối thiểu quyền**, thao tác tiền cần tách người (người tạo lệnh chi ≠ người duyệt) — *four-eyes* cho chi trả và thay đổi tài khoản nhận tiền.

---

## 4. Công thức giá và ví dụ tính

### 4.1 Công thức (BR-BKG-01 chi tiết)
```
Giá phòng        = Σ (đơn giá loại phòng theo gói/đêm × số phòng × số đêm/gói)
Giá xe / lượt    = Giá mở cửa (≤ 3 km) + Đơn giá/km × max(0, km − 3)
                   × (1 + phụ thu đêm 20% nếu giờ đón 22:00–06:00)
Giá xe           = Giá xe / lượt × số lượt (1 hoặc 2)      → làm tròn 1.000 đ
Phí dịch vụ đơn  = tỷ lệ % × (Giá phòng + Giá xe)           → làm tròn 1.000 đ, tối thiểu 10.000 đ
Tổng khách trả   = Giá phòng + Giá xe + Phí dịch vụ đơn     (đã gồm VAT)
Khách sạn nhận    = (Giá phòng + Giá xe) thực giữ   — 100%, không hoa hồng
Airrest thu       = Phí dịch vụ đơn                  — nguồn thu duy nhất
```
Tham số mặc định đề xuất: giá mở cửa xe 60.000 đ; 10.000 đ/km; phí dịch vụ 2%; xe tối đa 25 km.

### 4.2 Ví dụ A — đơn MoMo, phòng 1 đêm + xe 2 chiều 8 km
| Khoản | Cách tính | Số tiền |
|---|---|---|
| Giá phòng | 1 phòng × 1 đêm | 600.000 |
| Giá xe / lượt | 60.000 + 10.000 × (8 − 3) | 110.000 |
| Giá xe 2 chiều | 110.000 × 2 | 220.000 |
| Phí dịch vụ đơn | 2% × 820.000 = 16.400 → làm tròn | 16.000 |
| **Khách trả** | | **836.000** |
| **Khách sạn nhận (sau check-out)** | 600.000 + 220.000 (không khấu trừ) | **820.000** |
| **Airrest doanh thu** | phí dịch vụ đơn | **16.000** (trước phí cổng thanh toán MoMo — Airrest chịu) |

### 4.3 Ví dụ B — cùng đơn nhưng trả tại khách sạn
Khách trả **836.000 cho khách sạn**. Khách sạn đã thu hộ phí dịch vụ nên **nợ Airrest 16.000**, đối soát cuối tháng qua MoMo.

### 4.4 Ví dụ C — đối soát phí dịch vụ tháng (một khách sạn)
| Hạng mục | Số tiền |
|---|---|
| Khách sạn còn được nhận từ đơn online đã check-out nhưng chưa chi (T+1) | 820.000 |
| Khách sạn nợ phí dịch vụ thu hộ từ đơn tại khách sạn (Ví dụ B) | −16.000 |
| **Bù trừ** | **804.000 Airrest chi cho khách sạn** |
Nếu kết quả âm (nợ nhiều hơn phải nhận) → khách sạn chuyển phần chênh qua MoMo trong **7 ngày** kể từ ngày đối soát; quá hạn → cảnh báo, tạm ẩn khỏi tìm kiếm sau 15 ngày *(chính sách đề xuất)*.

### 4.5 Ví dụ D — hủy theo chính sách Tiêu chuẩn
Khách hủy 10 giờ trước check-in (mốc "trong 24h đến 2h" = giữ 50% phòng). Xe chưa chạy: hoàn 100% xe và phí dịch vụ.
- Giữ lại: 50% × 600.000 = 300.000 (doanh thu khách sạn, không khấu trừ)
- Hoàn khách: 836.000 − 300.000 = **536.000** (gồm hoàn 100% xe 220.000 + phí DV 16.000, vì hủy trong khung miễn phí xe/phí)
- Hủy có phạt ở khung giữ 50% phòng: phí DV *có thể* không hoàn → khách nhận 520.000 (OQ-2-11, chờ PO).

---

## 5. Chính sách đổi/hủy/no-show (BR-BKG-06 chi tiết)

| Mẫu | Hủy miễn phí | Trong khung giữa | Gần giờ/no-show |
|---|---|---|---|
| **Linh hoạt** (mặc định đơn khẩn cấp) | Đến 2 giờ trước check-in | — | Giữ 100% 1 đêm/gói đầu |
| **Tiêu chuẩn** | ≥ 24 giờ trước | 24h→2h: giữ 50% | < 2h/no-show: giữ 100% |
| **Không hoàn** (giá rẻ) | Không | — | 100% |

Ngoại lệ (miễn phí, hoàn 100%):
- Chuyến bay bị **hủy** hoặc đổi giờ khiến lịch không khớp (cần khớp dữ liệu bay, hoặc Admin xác nhận thủ công khi có bằng chứng).
- Khách sạn từ chối/sự cố/không có phòng khi khách đến.
- Hệ thống lỗi gây đặt sai.

Quy tắc khác: khách sạn **không tự đặt chính sách chặt hơn Admin cho phép** (Admin cấu hình khung tối đa); hiển thị chính sách trên trang chi tiết và bước xác nhận; chi phí cổng thanh toán của giao dịch hoàn: Airrest chịu trong P1 (đơn giản), xem lại sau.

---

## 5A. Luồng hủy – đổi – hoàn tiền: phân tích và ví dụ

Đặc tả yêu cầu: SRS mục 3.11 (FR-CXL/RFD/DSP, BR-CXL-01…14, luồng F1…F7). Phần này giải thích lý do và tính số.

### 5A.1 Nguyên tắc thiết kế
1. **Tự phục vụ tối đa**: trong khung cho phép, khách hủy được ngay, không chờ ai — giảm tải CSKH và tăng niềm tin đặt trong bối cảnh khẩn cấp.
2. **Báo giá trước khi bấm**: khách luôn thấy giữ/hoàn bao nhiêu trước khi xác nhận → giảm khiếu nại.
3. **Khách không phải chờ vì lỗi bên khác**: khi khách sạn/hệ thống lỗi, Airrest hoàn khách trước và truy thu sau (BR-CXL-10).
4. **Đổi = giữ chỗ mới trước, nhả chỗ cũ sau**: không bao giờ để khách mất phòng giữa lúc đổi.
5. **Mọi khoản tiền có dấu vết**: lệnh hoàn, truy thu, tranh chấp đều gắn đơn, người, lý do, thời điểm.

### 5A.2 Ai quyết định gì

| Tình huống | Người quyết định | Thời hạn xử lý | Nếu quá hạn |
|---|---|---|---|
| Hủy trong khung (X1/X3) | Hệ thống (tự động) | Tức thì | — |
| Hủy ngoại lệ (X2/X11) | Khách sạn → Admin | 30 phút nếu < 24h tới check-in; 4 giờ nếu xa hơn | Leo thang Admin; Admin quá hạn → cảnh báo trưởng ca |
| Đổi đơn (X4/X5) | Hệ thống (khi còn phòng) | Tức thì | — |
| Khách sạn hủy/từ chối (X7) | Khách sạn (lý do hợp lệ) | Tức thì; Admin giám sát | Lý do "khác" → Admin xem lại trong 24 giờ |
| Hoàn thủ công / > ngưỡng | Kế toán + người duyệt thứ hai | 1 ngày làm việc | Cảnh báo kế toán trưởng |
| Tranh chấp | Admin (CSKH) sau khi khách sạn phản hồi | 3 ngày làm việc | Leo thang, tự động ưu tiên nếu đơn chưa chi trả |

### 5A.3 Ví dụ tính (đơn gốc: phòng 600.000 + xe 2 chiều 220.000 + phí DV 16.000 = 836.000)

| # | Tình huống | Giữ lại | Hoàn khách | Ghi chú |
|---|---|---|---|---|
| H1 | Tiêu chuẩn, hủy ≥ 24h trước check-in | 0 | **836.000** | Hoàn cả phí DV |
| H2 | Tiêu chuẩn, hủy 10h trước, xe chưa phân | Phòng 300.000 (50%) | **536.000** nếu hoàn phí DV, hoặc **520.000** nếu không (OQ-2-16) | Khách sạn nhận 300.000 |
| H3 | Khách sạn hủy vì sự cố | 0 | **836.000** | Điểm sự cố +1; nếu khách đặt nơi khác đắt hơn 100.000 → khách sạn cũ bù 100.000 |
| H4 | Hủy xe một chiều, tài xế `ON_THE_WAY` chiều đi | Xe lượt đi 110.000 | Xe lượt về **110.000** + phí DV hoàn chênh: (600.000 + 220.000) × 2% = 16.400 → 16.000; sau hủy: (600.000 + 110.000) × 2% = 14.200 → 14.000; hoàn **2.000** → tổng **112.000** | Phòng giữ nguyên |
| H5 | Đổi lên phòng 750.000 (cùng đêm) | — | **Thu thêm** 153.000 | Phòng +150.000; phí DV mới (750.000 + 220.000) × 2% = 19.400 → 19.000 (+3.000) |
| H6 | Đổi xuống phòng 500.000 | — | **Hoàn** 102.000 | Tổng mới 500.000 + 220.000 + 14.000 (phí DV: 14.400 → 14.000) = 734.000; 836.000 − 734.000 |
| H7 | Chuyến bay bị hủy (có xác minh), khách hủy | 0 | **836.000** | Miễn phí cả phí DV |
| H8 | `NO_SHOW` (Linh hoạt) | Phòng 600.000 (1 đêm) | Xe chưa chạy 220.000 (nếu chưa `FAILED`) | Phí DV không hoàn; khách sạn nhận 600.000 |
| H9 | Khiếu nại sau check-out hợp lệ; tiền đã chi cho khách sạn 820.000 | — | Hoàn khách theo quyết định (ví dụ 300.000) | Airrest hoàn trước; **truy thu 300.000** từ khách sạn ở kỳ đối soát sau |

*Chú thích:* với đổi đơn, hệ thống tính lại tổng đơn mới rồi lấy hiệu với số đã thu (không cộng riêng từng khoản): H5 tổng mới 750.000 + 220.000 + 19.000 = 989.000 → thu thêm 153.000; H6 như trên → hoàn 102.000.

### 5A.4 Hoàn tiền thất bại — xử lý
1. MoMo trả lỗi (ví khóa/hết hạn) → thử lại tự động 3 lần trong 24 giờ.
2. Vẫn lỗi → `MANUAL_REQUIRED`, gửi khách link an toàn (hết hạn 7 ngày) để khai số tài khoản; **không** nhận số tài khoản qua chat/ticket.
3. Kế toán chuyển khoản, đính kèm chứng từ, hoàn tất lệnh (duyệt thứ hai nếu > ngưỡng).
4. Khách không phản hồi sau 30 ngày → nhắc lần cuối; sau 90 ngày ghi nhận `WRITTEN_OFF` có duyệt kế toán *(xác nhận pháp lý về tiền không có người nhận — OQ-2-18)*.

### 5A.5 Rủi ro riêng của luồng hủy/hoàn

| Rủi ro | Giảm thiểu |
|---|---|
| Hoàn kép do bấm lại/callback lặp | Idempotent theo mã hủy; kiểm tra tổng hoàn ≤ tổng thu |
| Khách lạm dụng "chuyến bay hủy" | Đối chiếu dữ liệu bay; ngoại lệ chưa xác minh phải qua duyệt |
| Khách sạn hủy lúc phòng đắt khách rồi bán lại giá cao | Điểm sự cố, ngưỡng tạm ẩn; Admin xem tỷ lệ hủy theo khách sạn |
| Hoàn chậm gây khiếu nại | SLA lệnh hoàn ≤ 24h, hiển thị ngày dự kiến, cảnh báo quá hạn |
| Đổi đơn lách giá | Giá phòng mới theo bảng giá hiện tại (BR-CXL-07) |
| Chargeback sau khi đã hoàn | Lưu bằng chứng hoàn; Admin gắn lệnh hoàn vào hồ sơ chargeback |

---

## 6. Luồng tiền và đối soát

```
Đơn online
 Khách ──MoMo──► [Ví Airrest: "Tiền giữ hộ"] 
                      │ CHECKED_OUT + 24h không khiếu nại (T+1)
                      ├──► Khách sạn: Giá phòng + giá xe (100%)
                      └──► Airrest: phí dịch vụ đơn
Đơn tại khách sạn
 Khách ──tiền mặt/quẹt thẻ──► Khách sạn ──(chốt tháng)──► Airrest: phí dịch vụ đơn đã thu hộ
```
Quy tắc:
1. **Lệnh chi** sinh tự động, **cần người thứ hai duyệt** (four-eyes) nếu > ngưỡng cấu hình.
2. Có khiếu nại mở trên đơn → **treo** khoản đó, các khoản khác vẫn chi.
3. Đối soát ngày: tổng giao dịch MoMo = tổng đơn `PAID` + hoàn; chênh lệch → hàng đợi kế toán.
4. Callback MoMo không đến sau 15 phút → hệ thống **chủ động truy vấn** trạng thái giao dịch.
5. Hoàn tiền thất bại (ví khách đóng) → chuyển thủ công/chuyển khoản; ghi nhận nợ phải trả.
6. Hóa đơn: phòng+xe do khách sạn/đơn vị chạy xe xuất; phí dịch vụ đơn do Airrest xuất (xác nhận kế toán).

---

## 7. Kịch bản ngoại lệ (edge cases) và xử lý

| # | Tình huống | Xử lý yêu cầu |
|---|---|---|
| E1 | Giờ bay thay đổi sau khi đặt | Thông báo; cho đổi giờ check-in/xe miễn phí (nếu phòng còn); nếu không còn → hủy miễn phí |
| E2 | Khách đến khách sạn nhưng không còn phòng (overbooking) | Khách sạn **phải** tìm phòng thay tương đương/tốt hơn, chi phí do khách sạn chịu; Admin điều phối; phạt/điểm sự cố |
| E3 | Khách sạn ngoại tuyến/không tiếp nhận được đơn | Đơn auto-xác nhận chuyển sang "cần gọi xác nhận"; Admin gọi; sau 10 phút không được → hủy và gợi ý nơi khác |
| E4 | Khách thanh toán 2 lần (bấm lại) | Idempotent; hoàn khoản dư tự động |
| E5 | Xe không đến | Cảnh báo ở ETA+10 phút; điều phối xe thay; khách có thể tự đi, hoàn xe + bồi thường (tham số) |
| E6 | Khách đổi số điện thoại/không nhận được mã | Tra cứu qua email; Admin xác minh qua thông tin đơn |
| E7 | Một người đặt cho người khác (đón hộ) | Form có "Người nhận phòng" riêng; SĐT liên lạc xe dùng của người đi |
| E8 | Nhóm nhiều phòng | Một Booking Code, nhiều phòng; hủy từng phần theo chính sách |
| E9 | Khách sạn bị tạm ngưng khi có đơn tương lai | Đơn tương lai vẫn phải được phục vụ hoặc chuyển khách sạn khác do Admin, khách sạn chịu chênh lệch |
| E10 | Mất kết nối vị trí xe | Hiển thị "lần cập nhật cuối" + SĐT tài xế qua hệ thống |
| E11 | Khách không cho phép định vị | Nhập địa chỉ tay/chọn điểm trên bản đồ; hỗ trợ khẩn cấp cho nhập SĐT |
| E12 | Sự cố hàng loạt (nhiều chuyến hủy) | Hàng đợi, giới hạn tốc độ, trang thông tin "đang tải cao"; Admin bật chế độ khẩn cấp (ưu tiên đơn khẩn cấp, tăng giới hạn xe) |
| E13 | Khiếu nại về chất lượng sau check-out | Cửa sổ 24h chi trả; khiếu nại muộn xử lý ngoài luồng chi tự động, có thể bù trừ vào kỳ sau |
| E14 | Gian lận: đặt ảo/hoàn tiền lặp | Giới hạn số đơn chờ/SĐT; cờ cho hoàn tiền bất thường |
| E15 | Tài xế đón nhầm khách | Xác minh mã đơn + 4 số cuối SĐT (mục 3.6) |

---

## 8. SLA, KPI và vận hành

### 8.1 SLA đề xuất
| Hạng mục | Mục tiêu |
|---|---|
| Hỗ trợ khẩn cấp: Admin gọi lại | ≤ 5 phút (24/7) |
| Ticket: phản hồi lần đầu | ≤ 30 phút (giờ làm việc), ≤ 4 giờ (ngoài giờ) |
| Ticket khẩn (an toàn, mất phòng): xử lý | ≤ 60 phút |
| Khách sạn duyệt đơn (nếu bật duyệt tay) | ≤ 10 phút |
| Phân xe sau khi đơn xác nhận | ≤ 10 phút (đơn đón trong 2 giờ), ≤ 2 giờ trước giờ đón (đơn đặt trước) |
| Chi trả cho khách sạn | T+1 sau check-out (không khiếu nại) |
| Hoàn tiền | Khởi tạo ≤ 24h; tiền về theo MoMo |

### 8.2 KPI
| Nhóm | KPI | Cách đo |
|---|---|---|
| Chuyển đổi | Tỷ lệ tra cứu → đặt | đơn tạo / lượt tra cứu |
| Tốc độ | Thời gian từ tra cứu đến đặt xong | median, P90 (mục tiêu ≤ 3 phút) |
| Chất lượng nguồn cung | Tỷ lệ hủy do khách sạn; tỷ lệ overbooking | đơn / tổng đơn |
| Xe | Đón đúng giờ (ETA ± 10 phút); tỷ lệ `FAILED` | đơn xe |
| Hỗ trợ | Thời gian gọi lại khẩn cấp; ticket quá SLA | |
| Tài chính | Phí dịch vụ đơn thực thu; chênh lệch đối soát; khách sạn còn nợ phí thu hộ | |
| Khách hài lòng | Điểm đánh giá TB; NPS sau lưu trú | |

---

## 9. Rủi ro nghiệp vụ

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Pháp lý giữ hộ tiền (OQ-2-05) | Cao | Cổng pháp lý; phương án tách tiền tại cổng thanh toán |
| Tồn phòng không chính xác | Cao | Cho khách sạn quản trị tồn tại Hotel Portal, nhắc cập nhật, cờ khi lâu không cập nhật, phạt overbooking |
| Dữ liệu chuyến bay sai/trễ | Trung bình | Nhãn "cập nhật lúc", cho xác nhận lại, nhập tay |
| Thiếu xe/tài xế vào giờ cao điểm | Cao | Chế độ khẩn cấp, đối tác vận tải P2, cảnh báo sớm |
| Khách sạn lách hệ thống (hẹn khách ngoài hệ thống để tránh phí dịch vụ) | Thấp | Rủi ro nhỏ vì không còn hoa hồng; ẩn thông tin liên hệ đến sau xác nhận; điểm số khách sạn |
| Dữ liệu cá nhân (CCCD, vị trí) | Cao | Tối thiểu hóa, mã hóa, hạn lưu, kiểm toán truy cập |
| Chi phí SMS/bản đồ tăng | Thấp | Cache, giới hạn tần suất cập nhật vị trí, gói thông báo |

---

## 10. Danh mục tham số cấu hình (FR-ADM-12)

| Mã | Tham số | Mặc định | Ai sửa |
|---|---|---|---|
| P-01 | Ngưỡng chậm gợi ý nghỉ (giờ) | 5 | Quản trị HT |
| P-02 | Ngưỡng "sắp bay" gợi ý nghỉ ngắn (giờ) | 5 | Quản trị HT |
| P-03 | Thời gian giữ chỗ tạm (phút) | 10 | Quản trị HT |
| P-04 | Hạn duyệt đơn tay (phút): nhắc / báo Admin / hết hạn | 10 / 15 / 20 | Quản trị HT |
| P-05 | Thời gian chờ khách (phút sau giờ check-in) | 60 | Quản trị HT |
| P-06 | ~~Hoa hồng hệ thống~~ — **đã bỏ** (PO 2026-11-09) | — | — |
| P-07 | Phí dịch vụ đơn (%, tối thiểu) | 2%, 10.000 đ | Quản trị HT |
| P-08 | Bảng giá xe (mở cửa, km, phụ thu đêm, tối đa km) | 60.000 / 10.000 / 20% / 25 | Điều phối + duyệt |
| P-09 | Chính sách hủy mặc định + khung tối đa khách sạn được chọn | Linh hoạt | Quản trị HT |
| P-10 | Cửa sổ chi trả sau check-out (giờ) | 24 | Kế toán |
| P-11 | Hạn chuyển khoản đối soát tháng (ngày) / ngày tạm ẩn | 7 / 15 | Kế toán |
| P-12 | Ngưỡng chi trả cần người duyệt thứ hai | theo PO | Kế toán |
| P-13 | Khoảng đệm dọn phòng tối đa (phút) | 60 | Quản trị HT |
| P-14 | Hạn lưu: audit / vị trí xe / vị trí khẩn cấp | 24 th / 30 ng / 90 ng | Quản trị HT |
| P-15 | Khách không có mặt tại điểm đón (phút) | 10 | Điều phối |
| P-16 | Phí hủy xe khi tài xế đã nhận và giờ đón còn < 30 phút | 0% (chờ PO) | Điều phối + duyệt |
| P-17 | Ngưỡng điểm sự cố khách sạn để cảnh báo / tạm ẩn | theo PO | Quản trị HT |
| P-18 | Hạn xét yêu cầu hủy ngoại lệ (phút): gần giờ / xa giờ | 30 / 240 | Quản trị HT |
| P-19 | Cửa sổ tranh chấp sau check-out (ngày) / hạn khách sạn phản hồi (giờ) | 7 / 24 | Quản trị HT |
| P-20 | Thử lại hoàn MoMo (lần) / hạn link khai tài khoản (ngày) | 3 / 7 | Kế toán |

Mọi thay đổi tham số: có phiên bản, người đổi, hiệu lực từ thời điểm; **đơn đã tạo giữ nguyên tham số tại thời điểm đặt** (khóa giá).

---

## 11. Việc cần PO ký duyệt tiếp

1. Chấp nhận 13 quyết định ở mục 2 (hoặc đổi con số).
2. Bắt đầu thủ tục pháp lý/kế toán cho OQ-2-05 và hóa đơn (mục 6.6).
3. Chốt vendor dữ liệu chuyến bay và nhà cung cấp bản đồ/định tuyến (PoC).
4. Thống nhất mức phí dịch vụ đơn thực tế và bảng giá xe (hoa hồng đã bỏ).
