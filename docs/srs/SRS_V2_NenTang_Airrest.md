# Software Requirements Specification — Nền tảng Airrest (bản xây dựng mới, v2.0-draft)

Phiên bản: v2.3-draft · 2026-11-09 · Trạng thái: **Nháp, BA đã đề xuất chốt các câu hỏi mở — chờ PO ký duyệt** · Ngôn ngữ: tiếng Việt

> Chi tiết phân tích (quyết định OQ, công thức giá, chính sách hủy, luồng tiền, ngoại lệ, SLA, tham số): [BA_PHAN_TICH_NGHIEP_VU_V2.md](BA_PHAN_TICH_NGHIEP_VU_V2.md). Khi hai tài liệu khác nhau, tài liệu BA là bản mới hơn.

> **Lịch sử:** đây là SRS duy nhất của dự án. Các SRS cũ (prototype MVP v0.6: `SRS.md`, RTM, OPEN_QUESTIONS, extensions…) đã bị loại bỏ ngày 2026-11-09 theo quyết định PO; `docs/MVP.md` vẫn còn nhưng không còn là nguồn phạm vi. Tài liệu này đặc tả *sản phẩm thật* (đặt phòng + xe đưa đón, thanh toán MoMo, cổng khách sạn, quản trị).
> **Không đặc tả công nghệ** (Node.js/Socket.io/MongoDB trong nguồn gốc không đưa vào SRS; chỉ nêu yêu cầu hành vi như "thời gian thực").

---

## 1. Giới thiệu

### 1.1 Mục đích
Chuyển nghiệp vụ của nền tảng Airrest thành yêu cầu phần mềm có mã, kiểm thử được, làm cơ sở thiết kế UX/UI, phát triển và kiểm thử.

### 1.2 Bài toán
Hành khách gặp sự cố chuyến bay (chậm/hủy) hoặc cần nghỉ chờ tại sân bay thiếu thông tin và mất thời gian tìm phòng, xe. Airrest là nền tảng **kết nối hành khách – khách sạn – xe đưa đón**: tra cứu chuyến bay, gợi ý nơi nghỉ đúng ngữ cảnh, đặt phòng kèm xe đưa đón, thanh toán, theo dõi xe, hỗ trợ khẩn cấp.

### 1.3 Triết lý (Emergency UX)
1. **Tốc độ**: tra cứu và đặt phòng được ngay, **không bắt buộc tài khoản** (đặt khách vãng lai bằng họ tên + SĐT).
2. **Theo ngữ cảnh**: gợi ý điểm đi hay điểm đến dựa trên dữ liệu chuyến bay thực.
3. **Thời gian thực**: tồn phòng, trạng thái đơn, vị trí xe.
4. **Luôn có người xử lý**: Admin có thể can thiệp mọi đơn/ticket; sự cố được truy vết bằng nhật ký.

### 1.4 Nguồn và cách hợp nhất

| Nguồn | Vai trò | Cách dùng |
|---|---|---|
| `airrest-ux-design-analysis.md` (bản gốc) | **Nền chuẩn** | Chức năng người dùng / khách sạn / admin, MoMo, xe đưa đón, thu phí dịch vụ đơn hàng (đã bỏ hoa hồng), quy định khách sạn |
| `airrest-ux-design-analysis-v2.md` (v1) | **Bổ sung** (PO: "chưa chuẩn nhưng có điểm bổ sung được") | Bảng trạng thái booking, hàng đợi duyệt, ticket hỗ trợ, điều phối xe, dashboard KPI/cảnh báo, báo cáo hủy đơn, sitemap |
| SRS cũ v0.6 (đã loại bỏ) | Chỉ tham khảo lịch sử | Thuật ngữ, câu hỏi mở; không kế thừa phạm vi "mô phỏng" |

**Xử lý mâu thuẫn giữa hai nguồn** (PO chọn: xây mới, bản gốc làm nền):

| # | Điểm | Bản gốc | v1 | Quyết định trong SRS này |
|---|---|---|---|---|
| C-1 | Ai vận hành khách sạn | Khách sạn có cổng riêng + phân quyền | Admin làm thay toàn bộ (V1), cổng khách sạn để V2 | **Có Hotel Portal**; Admin vẫn có quyền thao tác thay/can thiệp (FR-ADM-04) |
| C-2 | Thanh toán | MoMo online hoặc tại khách sạn | "Xác nhận thủ công / ghi nhận mã" | **MoMo + tại khách sạn** (FR-PAY) |
| C-3 | Xe đưa đón | Có, realtime bản đồ | Có, điều phối thủ công, ETA | **Có**, hợp nhất: giá theo quãng đường + điều phối + realtime (FR-SHT) |
| C-4 | Đánh giá khách sạn | Hiển thị đánh giá | V1 qua ticket, V2 chấm điểm | Hiển thị đánh giá (FR-SRC-05); đánh giá chỉ từ đơn đã check-out |
| C-5 | Duyệt booking | Không nêu (xác nhận khi còn phòng) | Admin duyệt PENDING→CONFIRMED | **Xác nhận tự động khi còn phòng và đã thanh toán/cam kết**, Admin/khách sạn duyệt thủ công khi đặt "chờ xác nhận" (BR-BKG-03, OQ-02) |
| C-6 | Quy tắc gợi ý theo giờ bay | Có (ngưỡng 5 giờ) | Gợi ý khi chậm/hủy | Dùng bản gốc, làm rõ ở BR-FLT-01…03 (OQ-01) |

### 1.5 Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Khách | Hành khách đặt phòng (có thể vãng lai hoặc đã đăng nhập) |
| Booking / Booking Code | Đơn đặt phòng (kèm xe nếu có) / mã tra cứu duy nhất |
| Đơn xe (Shuttle Order) | Yêu cầu xe đưa đón gắn với một booking, 1 chiều hoặc 2 chiều |
| Phí dịch vụ đơn | Phí Airrest thu của khách trên mỗi đơn — **nguồn thu duy nhất** của Airrest; **không có hoa hồng thu của khách sạn** (PO 2026-11-09) |
| Đối soát phí | Quy trình cuối tháng bù trừ phí dịch vụ đơn mà khách sạn đã thu hộ trên các đơn trả tại khách sạn |
| Dịch vụ ngoài | Dịch vụ phát sinh do khách sạn cung cấp ngoài phòng/xe (giặt là, ăn uống…), **không tính** vào doanh thu tính phí |
| Chủ khách sạn | Tài khoản gốc của một khách sạn, phân quyền cho cấp dưới |

### 1.6 Quy ước mã
`FR-<MÔ-ĐUN>-nn` yêu cầu chức năng; `BR-<MÔ-ĐUN>-nn` quy tắc nghiệp vụ; `NFR-nn`; `DR-nn` dữ liệu; `UC-nn` use case; `OQ-2-nn` câu hỏi mở. Mô-đun: FLT (chuyến bay), SRC (tìm kiếm), BKG (đặt phòng), PAY (thanh toán), SHT (xe), USR (người dùng), NTF (thông báo), SUP (hỗ trợ), HTL (khách sạn), ADM (quản trị). Ưu tiên theo MoSCoW. Mọi yêu cầu có nhãn nguồn: **[G]** bản gốc, **[V1]** v1, **[BS]** bổ sung của tài liệu này (phân tích nghiệp vụ, chờ PO xác nhận).

---

## 2. Bối cảnh và tác nhân

### 2.1 Tác nhân

| ID | Tác nhân | Mô tả |
|---|---|---|
| ACT-01 | Khách | Vãng lai (không tài khoản) hoặc đã đăng nhập |
| ACT-02 | Chủ khách sạn | Cấu hình khách sạn, doanh thu, phân quyền, đối soát phí dịch vụ |
| ACT-03 | Nhân viên khách sạn | Lễ tân (check-in/out, đơn), buồng phòng (dọn dẹp), kế toán (doanh thu) — quyền theo phân quyền của chủ |
| ACT-04 | Tài xế | Nhận đơn xe, cập nhật trạng thái và vị trí *(**[BS]** nguồn gốc có "vị trí xe realtime" nhưng không nêu tài xế là tác nhân)* |
| ACT-05 | Admin | Vận hành: duyệt đối tác, giám sát đơn, hỗ trợ khẩn cấp, xử lý khiếu nại, điều phối xe, cấu hình, báo cáo |
| ACT-06 | Hệ thống ngoài | Dữ liệu chuyến bay; MoMo; bản đồ/định tuyến; kênh thông báo; chatbot |

Vai trò Admin chia nhỏ (**[V1/BS]**): Điều phối xe, CSKH, Kế toán/đối soát, Quản trị hệ thống (phân quyền, cấu hình, audit).

### 2.2 Ranh giới

```
 Khách (web/mobile) ──┐                      ┌── Dữ liệu chuyến bay
 Hotel Portal ────────┼── NỀN TẢNG AIRREST ──┼── MoMo (thu/chi, hoàn)
 Tài xế (di động) ────┤                      ├── Bản đồ / quãng đường
 Admin Portal ────────┘                      └── Thông báo / Chatbot
```

### 2.3 Giả định và ràng buộc
- Thị trường: Việt Nam; tiền VND; múi giờ ICT; thanh toán trực tuyến chỉ MoMo (**[G]**).
- Thanh toán online về ví MoMo của Admin, sau check-out chuyển cho khách sạn (**[G]**) — cần xác nhận pháp lý/tài chính (OQ-2-05).
- Khách vãng lai không bắt buộc đăng ký; dữ liệu cá nhân (CCCD, ngân hàng) chỉ thu khi cần và tuân thủ NFR-04.

---

## 3. Yêu cầu chức năng

### 3.1 Mô-đun FLT — Kiểm tra chuyến bay (ACT-01)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-FLT-01 | Khách nhập **mã chuyến bay + ngày bay** để tra cứu | Must | [G][V1] |
| FR-FLT-02 | Khách quét **mã vạch/QR trên vé** (camera) để điền mã chuyến bay; nếu quét lỗi cho phép nhập tay | Should | [G] |
| FR-FLT-03 | Hiển thị: hãng, mã chuyến, điểm đi/đến, giờ dự kiến/thực tế cất cánh và hạ cánh, trạng thái (đúng giờ/chậm/hủy), **thời gian chậm** và thời điểm cập nhật | Must | [G][V1] |
| FR-FLT-04 | Nếu chuyến chậm/hủy → hiển thị gợi ý nơi nghỉ khẩn cấp theo BR-FLT; nếu không gián đoạn → hiển thị trạng thái chuẩn và gợi ý tiện ích thông thường | Must | [V1] |
| FR-FLT-05 | Mỗi gợi ý chuyển thẳng sang tìm kiếm khách sạn quanh **sân bay tương ứng**, đã điền sẵn ngày nhận phòng | Must | [BS] |
| FR-FLT-06 | Không tìm thấy chuyến/dữ liệu lỗi: báo rõ, cho phép nhập sân bay + ngày để tìm khách sạn thủ công (không chặn luồng) | Must | [BS] |
| FR-FLT-07 | Cập nhật tự động trạng thái chuyến khi khách đang theo dõi một booking; thay đổi giờ → thông báo (FR-NTF-01) | Should | [BS] |

**Quy tắc gợi ý (làm rõ từ nguồn gốc):**
- **BR-FLT-01**: chuyến **chậm > 5 giờ** → gợi ý nghỉ tại **điểm xuất phát**. *(đã nêu rõ ở [G])*
- **BR-FLT-02**: chuyến còn **≤ 5 giờ** nữa mới cất cánh → gợi ý nghỉ tại điểm xuất phát, ưu tiên **gói giờ ngắn** gần nhà ga. *([G] viết "thời gian check cách thời gian bay cách 5 tiếng"; diễn giải đã chốt đề xuất ở BA §3.1, chờ PO)*
- **BR-FLT-03**: **sau khi hạ cánh** → gợi ý nghỉ tại **điểm hạ cánh**. 
- **BR-FLT-04**: chuyến **hủy** (khách chưa bay) → gợi ý **điểm đi**; khách được chuyển sang "tôi đang ở điểm đến" nếu cần. Thứ tự ưu tiên khi trùng điều kiện: đã hạ cánh > hủy > chậm >5h > còn ≤5h > còn lại (bảng quyết định: BA §3.1).
- **BR-FLT-05**: ngưỡng 5 giờ là **tham số cấu hình** bởi Admin (FR-ADM-12), không hard-code.

### 3.2 Mô-đun SRC — Tìm kiếm khách sạn và tồn phòng (ACT-01)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SRC-01 | Danh sách khách sạn **còn phòng** trong khoảng nhận/trả phòng, cập nhật **thời gian thực**; hiển thị giá, ảnh, vị trí bản đồ, quãng đường, điểm đánh giá, dịch vụ đi kèm | Must | [G] |
| FR-SRC-02 | Bộ lọc & sắp xếp: giá, khoảng cách tới sân bay, tiện ích (xe đưa đón, ăn uống, wifi…), điểm đánh giá, **giờ nhận khách** | Must | [V1] |
| FR-SRC-03 | Chế độ bản đồ: ghim khách sạn, hiển thị quãng đường/thời gian di chuyển từ vị trí khách hoặc sân bay | Should | [G] |
| FR-SRC-04 | Trang chi tiết: mô tả, bộ ảnh phòng, tiện ích, chính sách (hủy/đổi, giờ nhận–trả phòng), loại phòng + giá + số còn lại, đánh giá | Must | [G][V1] |
| FR-SRC-05 | Đánh giá: chỉ khách có đơn **đã check-out** mới được đánh giá (1–5 sao + nhận xét); khách sạn có thể phản hồi | Should | [G][BS] |
| FR-SRC-06 | Hết phòng: thông báo, đề xuất khách sạn khác gần đó hoặc đổi ngày | Must | [V1] |
| FR-SRC-07 | **Khách sạn ưa thích**: thêm/bỏ yêu thích, xem danh sách (cần đăng nhập; vãng lai lưu cục bộ trên thiết bị) | Could | [G] |
| FR-SRC-08 | Tồn phòng không được hiển thị dư so với thực tế: số phòng còn = tổng − đã đặt − đang giữ chỗ − phòng sự cố/không bán | Must | [BS] |

### 3.3 Mô-đun BKG — Đặt phòng

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-BKG-01 | Khách chọn loại phòng, số lượng, **giờ check-in / check-out**; hệ thống kiểm tra khả dụng thời gian thực | Must | [G] |
| FR-BKG-02 | Form thông tin: SĐT, họ tên (bỏ qua/điền sẵn nếu hồ sơ đã thiết lập), email (tùy chọn) | Must | [G][V1] |
| FR-BKG-03 | Tùy chọn **xe đưa đón**: không dùng / 1 chiều / 2 chiều; **vị trí đón** = vị trí hiện tại (định vị) hoặc nhập tay; hiển thị quãng đường và giá xe | Must | [G] |
| FR-BKG-04 | Chọn hình thức thanh toán: **MoMo trực tuyến** hoặc **tại khách sạn** | Must | [G] |
| FR-BKG-05 | **Tính giá** theo BR-BKG-01; hiển thị chi tiết từng khoản trước khi xác nhận; giá hiển thị phải nhất quán từ danh sách → chi tiết → thanh toán → xác nhận | Must | [G][BS] |
| FR-BKG-06 | **Giữ chỗ tạm** khi khách bước vào thanh toán; hết hạn giữ chỗ thì nhả phòng (BR-BKG-04) | Must | [BS] |
| FR-BKG-07 | Tạo booking, cấp **Booking Code**; hiển thị màn đặt thành công; gửi xác nhận (FR-NTF-01) | Must | [G][V1] |
| FR-BKG-08 | **Tra cứu đơn** bằng Booking Code + SĐT/Email (không cần đăng nhập) → chi tiết, trạng thái, lịch sử trạng thái | Must | [V1] |
| FR-BKG-09 | Khách **hủy/đổi** đơn: báo giá trước phí/hoàn, tự phục vụ hoặc gửi yêu cầu ngoại lệ — chi tiết mục 3.11 (FR-CXL) | Must | [V1][BS] |
| FR-BKG-10 | Ghi nhận chặn đặt trùng/đặt đồng thời: hai khách đặt cùng phòng cuối → chỉ một thành công, người còn lại nhận thông báo hết phòng | Must | [BS] |
| FR-BKG-11 | Chống tạo đơn trùng khi bấm nhiều lần/mạng chập (idempotent) | Must | [BS] |

**Quy tắc:**
- **BR-BKG-01 Cấu trúc giá** [G]: `Tổng = Σ giá phòng + giá xe + phí dịch vụ đơn hàng`. Giá phòng theo cấu hình khách sạn (theo loại phòng/khung giờ/ngày); **giá xe = f(quãng đường từ vị trí đón → khách sạn) × (1 chiều = 1, 2 chiều = 2 lượt)** theo bảng giá cấu hình; **phí dịch vụ đơn hàng** theo cấu hình Admin. Công thức: `giá xe/lượt = 60.000 + 10.000 × max(0, km−3)` (+20% giờ đêm 22–06); `phí DV = 2% × (phòng+xe)`, tối thiểu 10.000 đ; giá đã gồm VAT; làm tròn 1.000 đ (ví dụ tính: BA §4).
- **BR-BKG-02 Giờ nhận/trả** [G]: khách cũ check-out lúc 5:30 thì khách mới đặt check-in **từ 5:30 trở đi vẫn được phép** (không cần khoảng đệm). Khoảng đệm dọn phòng khác 0 là cấu hình (mặc định 0).
- **BR-BKG-03 Xác nhận đơn** [BS]: đơn MoMo → `CONFIRMED` khi thanh toán thành công; đơn trả tại khách sạn → `CONFIRMED` ngay nếu còn phòng (hoặc `PENDING` nếu khách sạn bật "duyệt tay").
- **BR-BKG-04 Giữ chỗ** [BS]: thời gian giữ tạm (mặc định 10 phút, cấu hình). Hết hạn → `EXPIRED`, phòng trả lại tồn.
- **BR-BKG-05 Sự cố phòng** [G]: nếu phòng đã đặt gặp sự cố, khách sạn **bắt buộc** thông báo khách và hỏi có muốn đổi phòng; **không được thu thêm phí**; phòng đổi phải **chất lượng tốt hơn hoặc bằng**. Khách từ chối đổi → hoàn tiền 100%, hủy không phí (BR-BKG-06).
- **BR-BKG-06 Chính sách đổi/hủy** [BS]: 3 mẫu **Linh hoạt** (mặc định đơn khẩn cấp) / **Tiêu chuẩn** / **Không hoàn**, khách sạn chọn trong khung Admin cho phép; hủy do khách sạn/hệ thống (hết phòng, sự cố) hoặc **chuyến bay bị hủy/đổi giờ lệch lịch** → **hoàn 100%** (BA §5).
- **BR-BKG-07 Không đến (No-show)** [BS]: quá giờ check-in + thời gian chờ mà khách không đến và không liên hệ → khách sạn đánh dấu `NO_SHOW`; áp dụng chính sách hủy (OQ-2-04).

**Trạng thái booking** (hợp nhất [V1] + bổ sung):

| Trạng thái | Ý nghĩa | Khách có thể | Chuyển tiếp từ |
|---|---|---|---|
| `PENDING_PAYMENT` [BS] | Đang giữ chỗ chờ MoMo | Thanh toán, hủy | (tạo đơn MoMo) |
| `PENDING` | Chờ khách sạn/Admin duyệt hoặc chờ trả tại KS | Xem, gửi hủy | tạo đơn / PENDING_PAYMENT khi cần duyệt |
| `CONFIRMED` | Đã xác nhận, giữ phòng | Xem hướng dẫn, theo dõi xe, đổi/hủy | PENDING, PENDING_PAYMENT |
| `CHECKED_IN` | Đã nhận phòng | Liên hệ hỗ trợ, gia hạn *(Could)* | CONFIRMED |
| `CHECKED_OUT` [BS] | Đã trả phòng, hoàn tất lưu trú → kích hoạt chi trả/đối soát, cho phép đánh giá | Đánh giá | CHECKED_IN |
| `CANCELLED` | Hủy bởi khách/hệ thống (kèm lý do, người hủy) | Xem lịch sử | PENDING, PENDING_PAYMENT, CONFIRMED |
| `REJECTED` | Khách sạn/Admin từ chối (**bắt buộc lý do**, gửi khách, gợi ý khách sạn thay) | Đặt lại | PENDING |
| `EXPIRED` | Quá hạn giữ chỗ/xác nhận | Tìm kiếm mới | PENDING, PENDING_PAYMENT |
| `NO_SHOW` [BS] | Khách không đến | — | CONFIRMED |

Mọi chuyển trạng thái ghi lịch sử (người, thời điểm, lý do) và vào nhật ký (FR-ADM-09).

### 3.4 Mô-đun PAY — Thanh toán và dòng tiền

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-PAY-01 | Chọn **tại khách sạn** → chuyển thẳng màn đặt đơn thành công | Must | [G] |
| FR-PAY-02 | Chọn **MoMo** → chuyển sang MoMo; thanh toán xong quay về màn thành công; thất bại/hủy/quá hạn → về màn kết quả kèm lựa chọn thử lại hoặc đổi sang trả tại KS | Must | [G][BS] |
| FR-PAY-03 | Xử lý kết quả MoMo **bất đồng bộ** (callback/đối soát): đơn không bị kẹt khi khách đóng trình duyệt; kiểm tra chữ ký/số tiền; xử lý callback lặp | Must | [BS] |
| FR-PAY-04 | Tiền thanh toán online về **ví MoMo của Admin**; sau khi đơn `CHECKED_OUT` hệ thống tạo **lệnh chi** cho khách sạn (= giá phòng + giá xe thực giữ; Airrest giữ lại phí dịch vụ đơn, BR-PAY-02) | Must | [G] |
| FR-PAY-05 | Hoàn tiền (hủy hợp lệ/sự cố) qua MoMo về khách; trạng thái hoàn hiển thị cho khách và Admin — chi tiết FR-RFD-01…08, mục 3.11 | Must | [BS] |
| FR-PAY-06 | Admin xem/đối soát giao dịch: đơn ↔ giao dịch MoMo ↔ chi trả khách sạn; đánh dấu chênh lệch | Must | [V1][BS] |
| FR-PAY-07 | Ghi nhận thu tiền mặt/tại KS: khách sạn xác nhận "đã thu" khi check-in/out | Must | [BS] |

- **BR-PAY-01** Giao dịch chỉ thành công khi số tiền = tổng đơn; sai lệch → cờ bất thường, giữ đơn chờ xử lý.
- **BR-PAY-02 Không thu hoa hồng** [PO 2026-11-09]: Airrest **không thu hoa hồng/phí hệ thống từ khách sạn**; khách sạn nhận **100% giá phòng + giá xe thực giữ**. Nguồn thu duy nhất của Airrest là **phí dịch vụ đơn** thu của khách. Đơn online: Airrest giữ phí dịch vụ, chi phần còn lại cho khách sạn. Đơn tại khách sạn: khách sạn thu hộ phí dịch vụ trong tổng tiền và **đối soát hằng tháng** (FR-HTL-09; ví dụ BA §4). Đơn hủy: phí dịch vụ hoàn hay không theo BA §5; hủy do khách sạn/hệ thống luôn hoàn.
- **BR-PAY-03** Tiền xe là doanh thu của đơn vị chạy xe (khách sạn), không bị khấu trừ; xe không phải "dịch vụ ngoài".
- **BR-PAY-04** Lệnh chi **chỉ** phát sinh khi booking `CHECKED_OUT`, sau cửa sổ 24 giờ (T+1) và không có khiếu nại mở trên đơn đó; lệnh chi lớn hơn ngưỡng cần **người duyệt thứ hai**. Mô hình giữ hộ tiền cần xác nhận pháp lý trước khi bật MoMo online (OQ-2-05, **cổng chặn P2**).

### 3.5 Mô-đun SHT — Xe đưa đón

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SHT-01 | Tạo **đơn xe** từ booking (1 hoặc 2 chiều); điểm đón, điểm trả, thời gian đón mong muốn | Must | [G] |
| FR-SHT-02 | Sau thanh toán/xác nhận, khách vào **màn theo dõi xe**: thông tin xe (biển số, tài xế, loại xe, SĐT liên hệ qua hệ thống), **vị trí xe realtime** trên bản đồ, ETA | Must | [G][V1] |
| FR-SHT-03 | Truy cập màn theo dõi bằng link/nhập mã đơn hoặc SĐT → hiển thị các đơn **đang hoạt động** | Must | [G] |
| FR-SHT-04 | Khách sạn/Admin **phân xe & tài xế** cho đơn, cập nhật ETA | Must | [V1][G] |
| FR-SHT-05 | Tài xế nhận/từ chối đơn, cập nhật trạng thái và chia sẻ vị trí liên tục khi đang chạy | Must | [BS] |
| FR-SHT-06 | **Xe trả khách** về nơi xuất phát (chiều về) do khách sạn gọi khi khách check-out | Must | [G] |
| FR-SHT-07 | Không có xe/không phân được trong thời hạn → cảnh báo Admin, thông báo khách, đề xuất phương án (đổi giờ/hủy xe, hoàn tiền xe) | Must | [BS] |
| FR-SHT-08 | Hủy/đổi đơn xe khi hủy/đổi booking; hoàn tiền xe theo BR-BKG-06 | Should | [BS] |

**Trạng thái đơn xe** [BS]: `REQUESTED → ASSIGNED → ON_THE_WAY → ARRIVED → PICKED_UP → COMPLETED`; nhánh `CANCELLED`, `FAILED` (khách không có mặt/không xe). Điều kiện: chỉ đơn booking `CONFIRMED` trở lên mới được gán xe.
- **BR-SHT-01** Vị trí xe chỉ hiển thị cho khách **từ lúc xe được phân đến khi hoàn tất**; không lưu quá thời hạn (NFR-04).
- **BR-SHT-02** Khoảng cách tính theo đường đi thực (định tuyến), không phải đường chim bay; vượt bán kính phục vụ → không cho chọn xe.
- **BR-SHT-03** P1: xe và tài xế thuộc khách sạn (tài xế dùng web mobile qua link); đối tác vận tải riêng ở P2; không có đơn xe độc lập không kèm phòng.
- **BR-SHT-04** Tài xế có 3 phút nhận/từ chối; xác minh khách bằng mã đơn + 4 số cuối SĐT; khách vắng quá 10 phút → `FAILED` (BA §3.6).

### 3.6 Mô-đun USR — Hồ sơ và tài khoản (ACT-01)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-USR-01 | Đăng ký/đăng nhập bằng SĐT + OTP (email tùy chọn); không bắt buộc để đặt phòng | Must | [V1][BS] |
| FR-USR-02 | Hồ sơ: họ tên, căn cước, ảnh đại diện, thông tin ngân hàng (để nhận hoàn tiền nếu cần) | Should | [G] |
| FR-USR-03 | Khi chưa thiết lập hồ sơ, **lấy thông tin từ form đơn đầu tiên** và đề nghị lưu | Should | [G] |
| FR-USR-04 | **Lịch sử đặt đơn** (đăng nhập): danh sách + lọc theo trạng thái | Must | [G] |
| FR-USR-05 | Gộp đơn vãng lai trước đó vào tài khoản khi đăng ký trùng SĐT (sau xác minh OTP) | Should | [BS] |
| FR-USR-06 | Khách sạn ưa thích — xem FR-SRC-07; cài đặt nhận thông báo | Could | [G] |
| FR-USR-07 | Xóa/ẩn dữ liệu cá nhân theo yêu cầu (trừ dữ liệu phải giữ cho đối soát) | Should | [BS] |

### 3.7 Mô-đun NTF — Thông báo

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-NTF-01 | Thông báo giao dịch: đặt thành công, đổi trạng thái, thanh toán, giờ bay đổi, xe được phân/đến gần, sự cố phòng. Kênh: trong ứng dụng + push/SMS/email (kênh cụ thể OQ-2-08) | Must | [G][BS] |
| FR-NTF-02 | Thông báo ưu đãi/khuyến mãi (khách chọn nhận) | Could | [G] |
| FR-NTF-03 | Thông báo cho khách sạn: đơn mới, đơn đổi/hủy, xe đến, sự cố; cho Admin: cảnh báo khẩn (FR-ADM-02) | Must | [G][V1] |
| FR-NTF-04 | Trung tâm thông báo: danh sách, đã đọc/chưa đọc; vãng lai nhận qua kênh đã khai báo | Should | [BS] |

### 3.8 Mô-đun SUP — Hỗ trợ

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SUP-01 | **Hỗ trợ khẩn cấp**: một nút gửi **vị trí** + SĐT cho Admin; Admin **gọi lại** | Must | [G] |
| FR-SUP-02 | **Tư vấn qua chat bot**: tư vấn, phản ánh chất lượng, khiếu nại; chuyển cho người khi bot không giải quyết được | Should | [G] |
| FR-SUP-03 | **Ticket hỗ trợ**: khách tạo (gắn Booking Code nếu có), theo dõi trạng thái Mới → Đang xử lý → Đã giải quyết → Đóng, xem phản hồi của Admin | Must | [V1] |
| FR-SUP-04 | Chat/khiếu nại đã trao đổi với bot được chuyển thành ticket để Admin xử lý | Must | [G][V1] |
| FR-SUP-05 | Mức khẩn cấp có SLA phản hồi (ví dụ gọi lại ≤ X phút) | Must | [BS] |
| FR-SUP-06 | Khách đánh giá mức hài lòng sau khi ticket đóng | Could | [BS] |

- **BR-SUP-01** Khi khách bấm hỗ trợ khẩn cấp mà không cho phép định vị → cho phép nhập địa chỉ/SĐT, không chặn.
- **BR-SUP-02** Vị trí chỉ dùng để hỗ trợ sự kiện đó, không dùng cho mục đích khác (NFR-04).

### 3.9 Mô-đun HTL — Cổng Khách sạn (ACT-02, ACT-03)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-HTL-01 | **Cấu hình khách sạn**: thông tin, ảnh, số tầng, số phòng, loại phòng, **giá** (theo loại/khung giờ/ngày), không gian phòng, giờ nhận–trả, chính sách hủy/đổi | Must | [G] |
| FR-HTL-02 | Cấu hình **dịch vụ**: xe đưa đón (có/không, giá), giặt là, ăn uống… (đánh dấu loại "dịch vụ ngoài" — thanh toán trực tiếp tại khách sạn, ngoài đơn) | Must | [G] |
| FR-HTL-03 | **Đơn đặt phòng realtime**: danh sách, chi tiết, âm báo đơn mới; duyệt/từ chối (kèm lý do) khi bật duyệt tay | Must | [G][V1] |
| FR-HTL-04 | **Check-in / check-out**: xác nhận khách đến/đi, thu tiền tại KS (FR-PAY-07), xử lý trễ giờ | Must | [G] |
| FR-HTL-05 | **Đổi/trả phòng**, xử lý sự cố phòng theo BR-BKG-05; xử lý yêu cầu đổi/hủy của khách | Must | [G][V1] |
| FR-HTL-06 | **Gọi xe trả khách** về nơi xuất phát khi check-out (FR-SHT-06); quản lý xe/tài xế của khách sạn | Must | [G] |
| FR-HTL-07 | **Tổng quan**: khách sắp check-in/out hôm nay, trạng thái phòng (trống/có khách/đang dọn/sự cố/khóa), tồn phòng; **trạng thái dọn dẹp** sau khi khách đi | Must | [G] |
| FR-HTL-08 | **Doanh thu**: báo cáo doanh thu, chi phí, lợi nhuận, dịch vụ đi kèm theo kỳ; tách đơn online / tại KS | Should | [G] |
| FR-HTL-09 | **Đối soát phí dịch vụ**: cuối tháng xem bảng đối soát (phí dịch vụ đơn đã thu hộ trên các đơn trả tại khách sạn; bù trừ với khoản chi online chưa chi); **chuyển phần chênh qua MoMo** nếu khách sạn còn nợ | Must | [G] (đã bỏ hoa hồng) |
| FR-HTL-10 | **Phân quyền**: chủ tạo tài khoản cấp dưới, gán vai trò (lễ tân, buồng phòng, kế toán…) và phạm vi chức năng | Must | [G] |
| FR-HTL-11 | Quản lý tồn phòng thời gian thực: khóa/mở phòng, đánh dấu bảo trì | Must | [BS] |
| FR-HTL-12 | Phản hồi đánh giá của khách | Could | [BS] |

### 3.10 Mô-đun ADM — Cổng Quản trị (ACT-05)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-ADM-01 | **Quản lý khách sạn đối tác**: đăng ký/duyệt đối tác, cấu hình thông tin và **tài khoản ngân hàng/MoMo**, tạm ngưng/kích hoạt | Must | [G] |
| FR-ADM-02 | **Dashboard**: KPI (đơn mới, chờ duyệt, ticket cần xử lý, khách sạn hoạt động, đơn xe đang chạy), biểu đồ xu hướng, **cảnh báo khẩn thời gian thực** | Must | [V1] |
| FR-ADM-03 | **Booking toàn hệ thống**: danh sách/lọc theo trạng thái, chi tiết, lịch sử trạng thái | Must | [V1] |
| FR-ADM-04 | Admin **can thiệp** đơn: duyệt/từ chối, đổi/hủy thay khách hoặc khách sạn (bắt buộc ghi lý do) | Must | [V1][BS] |
| FR-ADM-05 | **Hỗ trợ khẩn cấp**: bản đồ vị trí khách, gọi lại, ghi kết quả | Must | [G] |
| FR-ADM-06 | **Ticket & chat**: nhận từ chat bot, phân loại, giao người xử lý, phản hồi, đóng; xử lý khiếu nại | Must | [G][V1] |
| FR-ADM-07 | **Điều phối xe** (Shuttle Ops): hàng đợi yêu cầu xe, phân xe/tài xế, ETA, theo dõi tiến độ, xử lý đơn xe thất bại | Must | [V1] |
| FR-ADM-08 | **Thông tin khách sạn**: số phòng tồn, số phòng có khách, doanh thu từng khách sạn theo đơn | Must | [G] |
| FR-ADM-09 | **Nhật ký thao tác (Audit log)**: ghi mọi hành động quan trọng (ai, khi nào, đối tượng, trước/sau); tìm kiếm để truy vết từ khách, khách sạn, admin; không sửa/xóa được | Must | [G][V1] |
| FR-ADM-10 | **Báo cáo**: doanh thu theo khách sạn, **doanh thu phí dịch vụ đơn** (từ đơn tại KS và online), tỷ lệ hủy/từ chối, hiệu suất xe, SLA hỗ trợ; xuất file | Must | [G][V1] |
| FR-ADM-11 | **Đối soát phí dịch vụ tháng**: tạo bảng đối soát cho từng khách sạn, gửi khách sạn, theo dõi đã chuyển/còn nợ, nhắc nợ | Must | [G] |
| FR-ADM-12 | **Cấu hình hệ thống**: phí dịch vụ đơn hàng, bảng giá xe theo quãng đường, bán kính phục vụ, ngưỡng gợi ý (5 giờ), thời gian giữ chỗ/hết hạn, mẫu thông báo | Must | [G][V1] |
| FR-ADM-13 | **Tài khoản & phân quyền Admin** (điều phối, CSKH, kế toán, quản trị hệ thống) | Must | [V1] |
| FR-ADM-14 | **Đối soát thanh toán & chi trả** (FR-PAY-06), quản lý lệnh chi, hoàn tiền | Must | [BS] |
| FR-ADM-15 | Duyệt thay đổi nhạy cảm của khách sạn (đổi tài khoản nhận tiền, đổi tỷ lệ giá bất thường) | Should | [BS] |

### 3.11 Mô-đun CXL/RFD/DSP — Hủy, đổi, hoàn tiền và tranh chấp

Mô-đun này gom toàn bộ luồng sau khi đơn đã tạo: **ai** hủy/đổi, **khi nào**, **hoàn bao nhiêu**, **hoàn bằng cách nào**, **khi hoàn lỗi hoặc khách phản đối thì sao**. Nó chi tiết hóa FR-BKG-09, FR-PAY-05, FR-SHT-08, BR-BKG-05/06/07.

#### 3.11.1 Các tình huống hủy/đổi (phân loại)

| Mã | Tình huống | Chủ thể | Cách xử lý |
|---|---|---|---|
| X1 | Khách hủy toàn bộ trong khung cho phép | Khách | Tự phục vụ, hủy ngay |
| X2 | Khách hủy ngoài khung/có ngoại lệ (chuyến bay hủy, bệnh…) | Khách | Tạo yêu cầu chờ duyệt kèm bằng chứng |
| X3 | Khách hủy một phần (bớt phòng, bỏ xe, bỏ một chiều xe) | Khách | Tự phục vụ theo quy tắc từng phần |
| X4 | Khách đổi đơn (ngày/giờ/loại phòng/giờ xe) | Khách | Giữ chỗ mới trước, rồi nhả cũ, thu/hoàn chênh lệch |
| X5 | Khách đổi sang khách sạn khác | Khách | Hủy + đặt mới có liên kết |
| X6 | Rút ngắn lưu trú/trả phòng sớm (sau check-in) | Khách + Khách sạn | Khách sạn ghi nhận, hoàn theo chính sách |
| X7 | Khách sạn từ chối/hủy (hết phòng, sự cố, bảo trì) | Khách sạn | Hoàn 100%, gợi ý thay thế, ghi điểm sự cố |
| X8 | Admin hủy/can thiệp | Admin | Bắt buộc lý do, duyệt thứ hai khi hoàn lớn |
| X9 | Hệ thống hủy (`EXPIRED`, thanh toán thất bại, quá hạn duyệt) | Hệ thống | Tự động, hoàn nếu đã thu |
| X10 | `NO_SHOW` | Khách sạn ghi nhận | Áp chính sách, khách sạn giữ phần phạt |
| X11 | Chuyến bay hủy/đổi giờ làm lịch không khớp | Khách | Miễn phí, cần khớp dữ liệu bay hoặc Admin xác nhận |
| X12 | Xe không đến/không phân được | Hệ thống/Admin | Hoàn xe + bồi thường theo tham số |

#### 3.11.2 Yêu cầu chức năng

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-CXL-01 | Chi tiết đơn có nút **Hủy** và **Đổi** khi trạng thái cho phép (`PENDING_PAYMENT`, `PENDING`, `CONFIRMED`); trước khi xác nhận hiển thị **báo giá hủy**: khoản giữ, khoản hoàn, hạn tiền về, chính sách áp dụng | Must | [BS] |
| FR-CXL-02 | **Hủy tự phục vụ** trong khung cho phép: chọn lý do (bắt buộc), xác nhận 2 bước, hủy ngay, nhả phòng và xe, gửi biên nhận hủy | Must | [V1][BS] |
| FR-CXL-03 | **Yêu cầu hủy ngoại lệ** (ngoài khung): khách nêu lý do + tải bằng chứng (ảnh vé/thông báo hủy chuyến); khách sạn/Admin duyệt hoặc từ chối kèm lý do; khách có thể **rút yêu cầu** khi chưa duyệt | Must | [V1][BS] |
| FR-CXL-04 | **Hủy một phần**: bớt số phòng, hủy xe cả hai chiều hoặc một chiều; tính lại tổng và phí dịch vụ theo giá trị còn lại | Should | [BS] |
| FR-CXL-05 | **Đổi đơn**: chọn ngày/giờ/loại phòng/giờ đón mới → hệ thống báo giá chênh lệch; **giữ chỗ mới trước, thành công mới nhả chỗ cũ** (không để khách mất phòng giữa chừng); chênh lệch tăng → thu thêm; giảm → hoàn (FR-RFD-06) | Must | [V1][BS] |
| FR-CXL-06 | Đổi sang khách sạn khác = hủy đơn cũ + đặt đơn mới; hai đơn **liên kết** để áp chính sách ưu đãi (chuyển tiền đã trả sang đơn mới nếu hợp lệ) | Should | [BS] |
| FR-CXL-07 | **Rút ngắn lưu trú/trả phòng sớm**: lễ tân ghi nhận giờ trả thực tế; hoàn phần chưa dùng theo chính sách (BR-CXL-08) | Should | [BS] |
| FR-CXL-08 | **Khách sạn hủy/từ chối đơn**: chọn mã lý do (hết phòng, sự cố, bảo trì, khác + ghi chú); hệ thống hoàn 100% tự động, gợi ý tối đa 3 khách sạn thay thế, thông báo khách ngay, tăng **điểm sự cố** của khách sạn | Must | [G][BS] |
| FR-CXL-09 | **Admin hủy/đảo quyết định**: bắt buộc lý do; hoàn lớn hơn ngưỡng cần người duyệt thứ hai; **hoàn tác hủy** trong 15 phút nếu phòng/xe còn (Should) | Must | [V1][BS] |
| FR-CXL-10 | **Hệ thống tự hủy**: `EXPIRED` (hết hạn giữ chỗ/duyệt), thanh toán thất bại, không đến (`NO_SHOW`) sau thời gian chờ; hoàn tự động nếu đã thu | Must | [BS] |
| FR-CXL-11 | **Hiệu ứng lan truyền** khi hủy/đổi: nhả tồn phòng, hủy/sửa đơn xe (BR-CXL-05), dừng lệnh chi, cập nhật thông báo, đóng/ghi chú ticket liên quan, ghi nhật ký | Must | [BS] |
| FR-CXL-12 | **Biên nhận hủy/đổi** (mã, thời điểm, người thực hiện, khoản giữ/hoàn) gửi khách và lưu trong đơn | Must | [BS] |
| FR-CXL-13 | **Chống lạm dụng**: giới hạn số lần đặt–hủy liên tiếp theo SĐT/thiết bị, cờ cho Admin; khách sạn hủy nhiều hạ xếp hạng | Should | [BS] |
| FR-RFD-01 | Mọi hủy/đổi có phần hoàn tự động sinh **lệnh hoàn tiền** với số tiền, nguồn gốc, lý do, đơn liên quan | Must | [BS] |
| FR-RFD-02 | Hoàn **về đúng phương thức gốc**: đơn MoMo → MoMo; đơn trả tại khách sạn đã thu tiền → khách sạn hoàn trực tiếp và xác nhận trên hệ thống; chưa thu → không có tiền hoàn | Must | [BS] |
| FR-RFD-03 | **Hoàn thất bại** (ví đóng, lỗi cổng): chuyển hàng đợi kế toán, khách nhận link an toàn để khai tài khoản nhận; xử lý chuyển khoản thủ công; ghi nhận nợ phải trả cho đến khi xong | Must | [BS] |
| FR-RFD-04 | Kiểm tra **tổng hoàn ≤ tổng đã thu** theo đơn; hỗ trợ hoàn nhiều lần/một phần; chống hoàn kép (idempotent) | Must | [BS] |
| FR-RFD-05 | Khách theo dõi trạng thái hoàn, mã hoàn, ngày dự kiến tiền về trên chi tiết đơn và qua thông báo | Must | [BS] |
| FR-RFD-06 | Hoàn/thu **chênh lệch khi đổi đơn** trong cùng giao dịch điều chỉnh, hiển thị rõ từng khoản | Must | [BS] |
| FR-RFD-07 | **Bồi thường/ưu đãi bù** (voucher hoặc tiền) cho sự cố do khách sạn/hệ thống/xe; Admin duyệt; ghi nguồn chịu chi phí | Should | [BS] |
| FR-RFD-08 | Hoàn khi **tiền đã chi cho khách sạn**: Airrest hoàn khách trước, sau đó **truy thu** từ khách sạn ở kỳ đối soát kế tiếp nếu lỗi thuộc khách sạn (BR-CXL-10) | Must | [BS] |
| FR-DSP-01 | **Tranh chấp**: khách phản đối quyết định hủy/hoàn hoặc báo sự cố sau lưu trú (trong 7 ngày sau check-out) → mở tranh chấp gắn đơn, **treo lệnh chi** của đơn, Admin điều tra, quyết định kèm lý do, hoàn thêm hoặc bác bỏ | Must | [V1][BS] |
| FR-DSP-02 | **Khiếu nại từ ngân hàng/MoMo (chargeback)**: Admin ghi nhận, treo khoản, xuất bộ chứng cứ (lịch sử đơn, giao dịch, nhật ký, vị trí xe nếu có) | Should | [BS] |
| FR-DSP-03 | Khách sạn **phản hồi** tranh chấp trong thời hạn (mặc định 24 giờ); quá hạn Admin quyết định theo chứng cứ có sẵn | Should | [BS] |
| FR-ADM-16 | Admin: **hàng đợi hủy/hoàn/tranh chấp** (lọc theo trạng thái, SLA, số tiền), thao tác duyệt/từ chối/hoàn tay, xem lịch sử | Must | [BS] |
| FR-ADM-17 | Báo cáo hủy/hoàn: tỷ lệ hủy theo chủ thể và lý do, tiền giữ/hoàn, hoàn lỗi, tranh chấp, khách sạn có điểm sự cố cao (mở rộng FR-ADM-10) | Should | [V1][BS] |

#### 3.11.3 Quy tắc nghiệp vụ

- **BR-CXL-01 Ghi nhận chủ thể và lý do**: mọi hủy/đổi phải có *chủ thể* (KHÁCH / KHÁCH_SẠN / ADMIN / HỆ_THỐNG) và *mã lý do* (danh mục cấu hình). Không có lý do → không lưu.
- **BR-CXL-02 Ma trận hoàn tiền** (áp dụng theo mẫu chính sách ở BA §5):

| Chủ thể / nguyên nhân | Phòng | Xe | Phí dịch vụ đơn |
|---|---|---|---|
| Khách hủy trong khung miễn phí | Hoàn 100% | Hoàn 100% (theo BR-CXL-05) | Hoàn |
| Khách hủy trong khung phạt một phần | Giữ theo %, hoàn phần còn lại | Theo BR-CXL-05 | **Không hoàn** |
| Khách hủy sát giờ/`NO_SHOW` | Giữ theo chính sách (tối đa 100% đêm/gói đầu) | Lượt chưa chạy hoàn; lượt `FAILED` giữ | Không hoàn |
| Khách sạn từ chối/hủy/sự cố/không có phòng | 100% | 100% | Hoàn |
| Chuyến bay hủy/đổi giờ lệch lịch (có xác minh) | 100% | 100% | Hoàn |
| Hệ thống lỗi/`EXPIRED` sau khi đã thu | 100% | 100% | Hoàn |
| Xe không đến/không phân được | Không ảnh hưởng | Hoàn 100% lượt đó + bồi thường (tham số) | Hoàn phần tương ứng xe |
| Admin hủy theo yêu cầu khách | Theo lý do (mặc định như X1/X2) | Như trên | Như trên |

- **BR-CXL-03 Thời điểm tính**: mức phạt tính theo **thời điểm hệ thống nhận yêu cầu hợp lệ** của khách, không theo thời điểm duyệt; yêu cầu ngoại lệ được duyệt thì áp mức theo lý do ngoại lệ.
- **BR-CXL-04 Hoàn về nguồn**: đơn MoMo chỉ hoàn về MoMo; không hoàn tiền mặt thay cho đơn MoMo (trừ hoàn thủ công ở FR-RFD-03).
- **BR-CXL-05 Xe**: hủy trước `ASSIGNED` hoặc khi `ASSIGNED` mà tài xế chưa nhận nhiệm vụ gần giờ → hoàn 100%; `ASSIGNED` và giờ đón còn < 30 phút (cấu hình P-16) → có thể giữ phí hủy xe (mặc định 0%, chờ PO); `ON_THE_WAY` trở đi → không hoàn lượt đó; lượt còn lại hoàn nếu chưa chạy.
- **BR-CXL-06 Phí dịch vụ đơn**: hoàn nếu hủy miễn phí hoặc lỗi khách sạn/hệ thống; không hoàn nếu hủy có phạt/`NO_SHOW`. Khi hủy một phần miễn phí: **tính lại** theo giá trị còn lại, chênh lệch hoàn.
- **BR-CXL-07 Đổi đơn**: khách tự đổi tối đa **1 lần** miễn phí xử lý, lần sau tạo yêu cầu; gói *Không hoàn* không được đổi trong 24 giờ trước check-in; đổi phải giữ chỗ mới thành công trước; giá đổi dùng bảng giá **hiện tại** của phòng mới, giá đơn cũ không được "mang theo" trừ khi chuyến bay đổi giờ.
- **BR-CXL-08 Rút ngắn lưu trú**: đêm/gói đã bắt đầu tính đủ; phần chưa bắt đầu hoàn theo chính sách; trả phòng sớm trong gói giờ không hoàn.
- **BR-CXL-09 Sau `CHECKED_OUT`**: không hủy; chỉ khiếu nại/điều chỉnh qua tranh chấp trong **7 ngày**.
- **BR-CXL-10 Tiền đã chi cho khách sạn**: Airrest hoàn khách trước (không để khách chờ); lỗi do khách sạn → truy thu số hoàn tương ứng ở kỳ đối soát kế tiếp (có thể bù trừ khoản chi); lỗi do khách → khách sạn giữ phần phạt theo chính sách, phần còn lại khách sạn trả lại qua đối soát.
- **BR-CXL-11 Khách sạn hủy không hợp lệ**: hủy đơn `CONFIRMED` không thuộc lý do hợp lệ → điểm sự cố tăng; vượt ngưỡng (P-17) → Admin cảnh báo/tạm ẩn khỏi tìm kiếm. Khách sạn gây sự cố chịu chi phí đổi sang nơi khác (chênh lệch giá, xe).
- **BR-CXL-12 Idempotent**: mỗi yêu cầu hủy/hoàn chỉ có hiệu lực một lần; thao tác lặp trả lại kết quả cũ.
- **BR-CXL-13 Hạn hoàn tiền**: lệnh hoàn tạo ≤ 24 giờ; hiển thị ngày dự kiến tiền về; quá hạn → cảnh báo Admin.
- **BR-CXL-14 Hủy khi đang giữ chỗ chờ MoMo**: không có tiền thu → không hoàn; nếu MoMo báo thành công sau khi khách đã hủy/đơn hết hạn → hoàn 100% tự động (khớp BA §3.3).

#### 3.11.4 Trạng thái

| Đối tượng | Trạng thái |
|---|---|
| **Yêu cầu hủy/đổi** (DR-17) | `SUBMITTED → AUTO_APPROVED` (trong khung) hoặc `UNDER_REVIEW → APPROVED / REJECTED → EXECUTED`; `WITHDRAWN` (khách rút); `EXPIRED_REVIEW` (quá hạn duyệt → leo thang Admin) |
| **Lệnh hoàn tiền** (DR-18) | `PENDING → PROCESSING → REFUNDED`; lỗi: `FAILED → MANUAL_REQUIRED → REFUNDED / WRITTEN_OFF` (cần duyệt kế toán); `CANCELLED` (hủy lệnh do sai) |
| **Tranh chấp** (DR-19) | `OPEN → AWAITING_HOTEL → INVESTIGATING → RESOLVED_REFUND / RESOLVED_DENIED → CLOSED` |

Booking `CANCELLED` kèm: chủ thể, mã lý do, mức giữ/hoàn, tham chiếu lệnh hoàn. Lệnh hoàn **không** là trạng thái của booking.

#### 3.11.5 Luồng chi tiết

```
F1  Khách hủy tự phục vụ (X1/X3)
Chi tiết đơn ─► Hủy ─► Báo giá hủy (giữ/hoàn/hạn) ─► Chọn lý do ─► Xác nhận 2 bước
   ─► CANCELLED ─► nhả phòng + xử lý xe ─► tạo lệnh hoàn ─► biên nhận + thông báo ─► khách theo dõi hoàn

F2  Hủy ngoại lệ (X2/X11)
Khách gửi yêu cầu + bằng chứng ─► UNDER_REVIEW (khách sạn/Admin, hạn 30 phút nếu <24h tới check-in)
   ├─ duyệt ─► thực thi như F1 (mức theo ngoại lệ)
   ├─ từ chối + lý do ─► khách giữ đơn / có thể mở tranh chấp (F7)
   └─ quá hạn ─► leo thang Admin

F3  Đổi đơn (X4)
Chọn thay đổi ─► kiểm tra tồn + báo giá chênh lệch ─► khách đồng ý
   ─► giữ chỗ mới ─► (MoMo: thu thêm/hoàn chênh) ─► nhả chỗ cũ ─► cập nhật đơn + xe ─► biên nhận
   (giữ chỗ mới thất bại: đơn cũ không đổi, thông báo)

F4  Khách sạn hủy/sự cố (X7)
Khách sạn chọn lý do ─► CANCELLED (khách sạn) ─► hoàn 100% tự động ─► gợi ý ≤3 khách sạn thay
   ─► khách đặt lại (chuyển tiền đã trả nếu chọn) ─► điểm sự cố khách sạn tăng ─► Admin thấy cảnh báo

F5  Admin hủy/can thiệp (X8)
Admin chọn đơn + lý do ─► (hoàn lớn: duyệt thứ hai) ─► thực thi ─► thông báo khách + khách sạn ─► audit log

F6  Hoàn tiền (mọi luồng)
Lệnh hoàn PENDING ─► gửi MoMo ─► REFUNDED ─► thông báo
   └─ FAILED ─► MANUAL_REQUIRED ─► khách khai tài khoản (link an toàn) ─► kế toán chuyển khoản ─► REFUNDED
   (đã chi khách sạn: hoàn khách trước ─► ghi khoản truy thu kỳ sau)

F7  Tranh chấp (DSP)
Khách phản đối/báo sự cố (≤7 ngày sau check-out) ─► OPEN, treo lệnh chi
   ─► khách sạn phản hồi (24h) ─► Admin điều tra ─► hoàn thêm / bác bỏ (lý do bắt buộc)
   ─► đóng; kết quả vào đối soát và điểm khách sạn
```

#### 3.11.6 Màn hình, thông báo, dữ liệu liên quan
- **Khách**: Chi tiết đơn → Hủy/Đổi/Báo giá; theo dõi yêu cầu; theo dõi hoàn; mở tranh chấp.
- **Hotel Portal**: hàng đợi yêu cầu hủy/đổi chờ duyệt; hủy/từ chối đơn có lý do; ghi rút ngắn lưu trú; phản hồi tranh chấp; xem khoản truy thu.
- **Admin Portal**: hàng đợi hủy/hoàn/tranh chấp (FR-ADM-16), duyệt thứ hai, hoàn thủ công, báo cáo (FR-ADM-17).
- **Thông báo bắt buộc** (FR-NTF-01): biên nhận hủy/đổi, kết quả duyệt, lệnh hoàn tạo/thành công/thất bại, tranh chấp mở/đóng, khách sạn hủy kèm gợi ý thay thế.
- **Dữ liệu mới**: DR-17 Yêu cầu hủy/đổi, DR-18 Lệnh hoàn tiền, DR-19 Tranh chấp, DR-20 Khoản truy thu khách sạn.

---

## 4. Quy trình nghiệp vụ chính

### 4.1 Luồng khách (hợp nhất)

```
Nhập mã chuyến bay + ngày (hoặc quét vé)
        │
Tra cứu trạng thái ──► đúng giờ ──► hiển thị chuẩn (có thể tự tìm phòng)
        │ chậm/hủy/gần giờ bay/đã hạ cánh
Gợi ý điểm đi/điểm đến (BR-FLT) ─► Tìm & lọc khách sạn (realtime)
        │
Chọn phòng ─► hết phòng ─► khách sạn khác / đổi ngày
        │ còn phòng
Thông tin khách + giờ in/out + xe (0/1/2 chiều) + hình thức trả tiền
        │ giữ chỗ tạm
 ┌──────┴────────┐
Tại KS         MoMo ─► thất bại ─► thử lại / đổi tại KS
 │               │ thành công
 └──► Booking Code, CONFIRMED ──► Màn theo dõi đơn + xe realtime ──► Hỗ trợ
```

### 4.2 Luồng khách sạn
Nhận đơn → (duyệt) → chuẩn bị phòng → check-in → (xe/dịch vụ) → check-out → gọi xe trả khách → phòng chuyển "cần dọn" → "trống" → đối soát cuối tháng.

### 4.3 Luồng tiền

```
Online: Khách ─MoMo─► Ví Admin ─(CHECKED_OUT, không khiếu nại; Airrest giữ phí dịch vụ đơn)─► Khách sạn
Tại KS: Khách ─tiền mặt─► Khách sạn ─(cuối tháng, đối soát)─► MoMo ─► Admin (phí dịch vụ đơn đã thu hộ)
Hoàn:   Ví Admin ─MoMo─► Khách (hủy hợp lệ/sự cố)
```
Cuối tháng bù trừ: phí dịch vụ phải nộp của đơn tại KS có thể trừ vào khoản chi trả online chưa chi (đề xuất — OQ-2-05).

### 4.4 Use case chính

| UC | Tên | Tác nhân | Tham chiếu |
|---|---|---|---|
| UC-01 | Tra cứu chuyến bay và nhận gợi ý | ACT-01 | FR-FLT |
| UC-02 | Tìm khách sạn và xem tồn phòng | ACT-01 | FR-SRC |
| UC-03 | Đặt phòng (có/không xe) | ACT-01 | FR-BKG |
| UC-04 | Thanh toán MoMo / tại KS | ACT-01, ACT-06 | FR-PAY |
| UC-05 | Theo dõi xe đưa đón | ACT-01 | FR-SHT-02/03 |
| UC-06 | Tra cứu / đổi / hủy đơn | ACT-01 | FR-BKG-08/09 |
| UC-07 | Hỗ trợ khẩn cấp & chat/khiếu nại | ACT-01, ACT-05 | FR-SUP |
| UC-08 | Xử lý đơn, check-in/out | ACT-03 | FR-HTL-03/04 |
| UC-09 | Xử lý sự cố phòng và đổi phòng | ACT-03, ACT-01 | BR-BKG-05 |
| UC-10 | Phân xe và chạy đơn xe | ACT-03/05, ACT-04 | FR-SHT |
| UC-11 | Đối soát phí dịch vụ tháng | ACT-02, ACT-05 | FR-HTL-09, FR-ADM-11 |
| UC-12 | Đăng ký đối tác khách sạn | ACT-05, ACT-02 | FR-ADM-01 |
| UC-13 | Xử lý ticket / khiếu nại | ACT-05 | FR-ADM-06 |
| UC-14 | Giám sát, báo cáo, truy vết | ACT-05 | FR-ADM-02/09/10 |
| UC-15 | Khách hủy đơn (tự phục vụ / ngoại lệ) | ACT-01, ACT-03/05 | FR-CXL-01…04 |
| UC-16 | Khách đổi đơn (cùng/khác khách sạn) | ACT-01 | FR-CXL-05/06 |
| UC-17 | Khách sạn hủy/từ chối, xử lý sự cố | ACT-03, ACT-01 | FR-CXL-08, BR-BKG-05 |
| UC-18 | Hoàn tiền và xử lý hoàn lỗi | ACT-05, ACT-01 | FR-RFD-01…08 |
| UC-19 | Tranh chấp/khiếu nại sau lưu trú | ACT-01, ACT-03, ACT-05 | FR-DSP-01…03 |

---

## 5. Yêu cầu dữ liệu (mức thực thể)

| ID | Thực thể | Thuộc tính chính |
|---|---|---|
| DR-01 | Chuyến bay (tra cứu, lưu snapshot khi gắn booking) | mã, hãng, đi/đến, giờ dự kiến/thực tế, trạng thái, nguồn, cập nhật lúc |
| DR-02 | Khách sạn | thông tin, địa chỉ/tọa độ, quãng đường sân bay, giờ nhận khách, trạng thái hợp tác, tài khoản nhận tiền, chính sách hủy |
| DR-03 | Loại phòng / Phòng | tầng, loại, giá theo cấu hình, ảnh, tiện ích, trạng thái (trống/có khách/đang dọn/sự cố/khóa) |
| DR-04 | Tồn phòng theo ngày/khung giờ | tổng, đã đặt, đang giữ, khóa |
| DR-05 | Booking | Booking Code, khách, khách sạn, phòng, check-in/out, trạng thái, chi tiết giá (phòng, xe, phí DV), hình thức trả, chuyến bay (nếu có), lý do hủy/từ chối |
| DR-06 | Lịch sử trạng thái booking | từ→đến, người, thời điểm, lý do |
| DR-07 | Giao dịch thanh toán | booking, phương thức, mã MoMo, số tiền, trạng thái, thời điểm; Hoàn tiền; Lệnh chi |
| DR-08 | Đơn xe & Xe/Tài xế | điểm đón/trả, chiều, trạng thái, xe, tài xế, ETA, vết vị trí (hạn lưu) |
| DR-09 | Người dùng / Hồ sơ | SĐT, họ tên, căn cước (nhạy cảm), ngân hàng (nhạy cảm), ưa thích, cài đặt thông báo |
| DR-10 | Tài khoản nội bộ (Khách sạn/Admin) | vai trò, phạm vi, khách sạn gắn |
| DR-11 | Ticket & tin nhắn; Yêu cầu khẩn cấp | loại, trạng thái, người xử lý, vị trí, SLA |
| DR-12 | Đánh giá | booking, điểm, nhận xét, phản hồi |
| DR-13 | Thông báo | người nhận, kênh, nội dung, trạng thái gửi |
| DR-14 | Đối soát phí tháng | khách sạn, kỳ, số đơn trả tại KS, phí dịch vụ thu hộ, bù trừ, đã chuyển/còn nợ |
| DR-15 | Nhật ký thao tác | ai, vai trò, hành động, đối tượng, trước/sau, thời điểm, nguồn IP |
| DR-16 | Cấu hình hệ thống | tham số + phiên bản + người đổi |
| DR-17 | Yêu cầu hủy/đổi | đơn, loại (X1…X12), chủ thể, mã lý do, bằng chứng, trạng thái, người duyệt, báo giá tại thời điểm gửi |
| DR-18 | Lệnh hoàn tiền | đơn, giao dịch gốc, số tiền, lý do, trạng thái, mã MoMo, lần thử, người xử lý thủ công |
| DR-19 | Tranh chấp | đơn, người mở, nội dung, bằng chứng, phản hồi khách sạn, quyết định, lý do, SLA |
| DR-20 | Khoản truy thu khách sạn | đơn, số tiền, nguyên nhân, kỳ đối soát, trạng thái |

---

## 6. Yêu cầu giao diện (khung)

- **Khách (web responsive, ưu tiên di động)**: Trang chủ/tra cứu chuyến bay · Kết quả + gợi ý · Danh sách (lọc, bản đồ) · Chi tiết khách sạn · Chọn phòng · Thông tin khách + xe + thanh toán · Kết quả thanh toán · Theo dõi đơn & xe · Tra cứu đơn · Hỗ trợ (khẩn cấp, chat, ticket) · Tài khoản (hồ sơ, lịch sử, ưa thích, thông báo).
- **Hotel Portal**: Tổng quan · Đơn realtime · Phòng & tồn · Cấu hình & dịch vụ · Xe/tài xế · Doanh thu · Đối soát phí · Nhân sự & phân quyền.
- **Admin Portal**: Dashboard · Booking · Khách sạn · Hỗ trợ (khẩn cấp, ticket) · Điều phối xe · Thanh toán & đối soát · Đối soát phí · Báo cáo · Cấu hình · Tài khoản & Audit.
- **Tài xế (di động)**: Đơn được giao · Điều hướng · Cập nhật trạng thái · Chia sẻ vị trí.
- Trạng thái rỗng/lỗi/đang tải bắt buộc cho mọi màn; chip trạng thái dùng màu + chữ (không chỉ màu).

---

## 7. Yêu cầu phi chức năng

| ID | Yêu cầu | Chỉ tiêu đề xuất (chờ xác nhận) |
|---|---|---|
| NFR-01 | Hiệu năng tra cứu/tìm kiếm | Kết quả ≤ 3 giây (P95) |
| NFR-02 | Thời gian thực | Tồn phòng, trạng thái đơn đến màn hình ≤ 5 giây; vị trí xe làm mới ≤ 10 giây |
| NFR-03 | Tính toàn vẹn khi đồng thời | Không bán vượt tồn; thanh toán/đặt phòng idempotent |
| NFR-04 | Bảo mật & dữ liệu cá nhân | Mã hóa dữ liệu nhạy cảm (căn cước, ngân hàng) khi truyền/lưu; che dữ liệu khi hiển thị; tối thiểu hóa thu thập; hạn lưu vết vị trí; tuân thủ pháp luật bảo vệ dữ liệu cá nhân |
| NFR-05 | Phân quyền | Kiểm quyền ở máy chủ cho mọi hành động; khách sạn chỉ thấy dữ liệu của mình |
| NFR-06 | Khả dụng | ≥ 99,5%/tháng; suy giảm êm khi nguồn chuyến bay/MoMo/bản đồ lỗi |
| NFR-07 | Truy vết | Audit log bất biến, truy cập nhanh 24 tháng, lưu trữ ≥ 5 năm *(OQ-2-09, BA §2)* |
| NFR-08 | Khả dụng UI | Hoàn tất đặt phòng ≤ 5 bước, ≤ 3 phút từ lúc tìm; WCAG 2.1 AA mức cơ bản; mobile-first |
| NFR-09 | Tin cậy thông báo | Thông báo giao dịch gửi lại khi lỗi, không gửi trùng |
| NFR-10 | Đối soát tài chính | Mọi giao dịch khớp 1-1 với đơn; báo cáo chênh lệch hằng ngày |
| NFR-11 | Quốc tế hóa | Tiếng Việt chính; chuẩn bị đa ngôn ngữ (Anh) *(Could)* |
| NFR-12 | Khả năng mở rộng | Chịu đột biến tải khi sự cố hàng loạt (hủy nhiều chuyến cùng lúc) |

---

## 8. Phạm vi phát hành đề xuất

| Giai đoạn | Nội dung | Lý do |
|---|---|---|
| **P1 (lõi)** | FLT-01/03/04/06, SRC-01/02/04/06/08, BKG, PAY-01/07 (trả tại khách sạn; MoMo chỉ bật nếu qua cổng pháp lý), SHT (phân xe thủ công + trạng thái), USR-01/04, NTF-01, SUP-01/03, HTL-01…05/07/10/11, ADM-01…04/06/09/12/13 | Đủ để bán được đơn có xe và vận hành |
| **P2** | PAY-02/03 MoMo online (sau cổng pháp lý), SHT realtime bản đồ đầy đủ, PAY-04/05/06 (chi trả, hoàn, đối soát tự động), HTL-08/09, ADM-10/11/14, SUP-02 chat bot, SRC-03/05/07, FLT-02 quét vé, FLT-07 | Cần tích hợp sâu và quy trình tài chính |
| **P3** | Ưu đãi, đa ngôn ngữ, phản hồi đánh giá, SLA nâng cao | Mở rộng |

(Phân kỳ là **đề xuất [BS]**, chờ PO — OQ-2-10.)

---

## 9. Tiêu chí nghiệm thu mẫu (Given/When/Then)

| ID | Kịch bản | Kỳ vọng |
|---|---|---|
| AC-01 | Chuyến chậm 6 giờ, khách tra cứu | Hiển thị chậm 6 giờ và gợi ý khách sạn quanh sân bay đi (BR-FLT-01) |
| AC-02 | Hai khách đặt cùng phòng cuối đồng thời | Một đơn thành công, một nhận "hết phòng" (FR-BKG-10) |
| AC-03 | Khách cũ check-out 5:30, khách mới chọn check-in 5:30 | Cho phép đặt (BR-BKG-02) |
| AC-04 | Thanh toán MoMo thành công nhưng khách đóng trình duyệt | Đơn vẫn chuyển `CONFIRMED` nhờ callback (FR-PAY-03) |
| AC-05 | Callback MoMo gửi 2 lần | Chỉ ghi 1 giao dịch (FR-PAY-03) |
| AC-06 | Khách đặt xe 2 chiều | Giá xe = 2 × đơn giá theo quãng đường (BR-BKG-01) |
| AC-07 | Admin từ chối đơn không nhập lý do | Hệ thống không cho lưu (REJECTED bắt buộc lý do) |
| AC-08 | Phòng sự cố sau khi khách đặt | Khách sạn gửi đề nghị đổi, không thu thêm phí, phòng đổi ≥ chất lượng (BR-BKG-05) |
| AC-09 | Khách bấm khẩn cấp | Admin thấy vị trí trong ≤ 5 giây và có thể gọi lại (FR-SUP-01, FR-ADM-05) |
| AC-10 | Đơn online `CHECKED_OUT`, không khiếu nại | Sinh lệnh chi = giá phòng + giá xe thực giữ, không trừ hoa hồng (BR-PAY-02/04) |
| AC-11 | Khách sạn A truy cập đơn của khách sạn B bằng đường dẫn trực tiếp | Bị từ chối (NFR-05) |
| AC-12 | Mọi thay đổi trạng thái/cấu hình | Có dòng trong audit log (FR-ADM-09) |
| AC-13 | Khách hủy đơn MoMo trong khung miễn phí | Báo giá hiển thị trước; đơn `CANCELLED`; phòng và xe được nhả; lệnh hoàn 100% sinh trong ≤ 24h; biên nhận gửi khách |
| AC-14 | Khách bấm Hủy 2 lần (hoặc mạng chập) | Chỉ một lệnh hoàn (BR-CXL-12) |
| AC-15 | Khách đổi sang phòng đắt hơn, hết phòng mới | Đơn cũ giữ nguyên, khách nhận thông báo (FR-CXL-05) |
| AC-16 | Khách đổi sang phòng đắt hơn, còn phòng | Thu đúng chênh lệch, phòng cũ chỉ nhả sau khi giữ phòng mới thành công |
| AC-17 | Khách sạn hủy đơn vì sự cố | Hoàn 100% tự động (gồm phí dịch vụ), có ≤ 3 gợi ý thay thế, điểm sự cố tăng (FR-CXL-08) |
| AC-18 | Hoàn MoMo thất bại | Lệnh chuyển `MANUAL_REQUIRED`, khách nhận link khai tài khoản, kế toán thấy trong hàng đợi (FR-RFD-03) |
| AC-19 | Khách hủy khi xe `ON_THE_WAY` | Lượt đó không hoàn, lượt còn lại hoàn (BR-CXL-05) |
| AC-20 | Khách mở tranh chấp sau check-out | Lệnh chi của đơn bị treo; khách sạn nhận yêu cầu phản hồi 24h (FR-DSP-01/03) |
| AC-21 | Hoàn khi tiền đã chi cho khách sạn (lỗi khách sạn) | Khách nhận hoàn trước; sinh khoản truy thu ở kỳ đối soát sau (BR-CXL-10) |
| AC-22 | Hoàn vượt số đã thu | Hệ thống từ chối (FR-RFD-04) |

---

## 10. Câu hỏi mở và quyết định cần PO

> **Cập nhật v2.1:** BA đã đề xuất chốt cả 13 câu — xem BA §2 (bảng quyết định, có lý do và rủi ro còn lại). Trạng thái tất cả: **Đề xuất, chờ PO ký**. Riêng OQ-2-05 (pháp lý giữ hộ tiền) là **cổng chặn P2**.

| ID | Câu hỏi | Ảnh hưởng | Mức |
|---|---|---|---|
| OQ-2-01 | Diễn giải đúng quy tắc gợi ý: "check cách giờ bay 5 tiếng" nghĩa là gì? Chuyến hủy gợi ý đầu nào? Nguồn dữ liệu chuyến bay là ai (nhà cung cấp, chi phí, độ trễ)? | FLT | Cao |
| OQ-2-02 | Khi nào đơn cần **duyệt tay** (v1) và khi nào **tự động xác nhận** (gốc)? Khách sạn tự chọn hay Admin quy định? Thời hạn duyệt? | BKG, HTL | Cao |
| OQ-2-03 | Công thức giá chi tiết: bậc giá xe theo km, phí dịch vụ đơn hàng cố định hay %, làm tròn, VAT/hóa đơn | BKG, PAY | Cao |
| OQ-2-04 | Chính sách hủy/đổi/no-show, mốc hoàn tiền, ai chịu phí cổng thanh toán | BKG, PAY | Cao |
| OQ-2-05 | Giữ tiền tại ví Admin rồi chi sau check-out: giấy phép/pháp lý, thời hạn chi, bù trừ phí, xử lý khiếu nại treo | PAY | Cao |
| OQ-2-06 | Tiền xe đưa đón thuộc ai, có bị khấu trừ không (đã chốt: không) | PAY, SHT | Trung bình |
| OQ-2-07 | Xe/tài xế thuộc khách sạn hay đối tác riêng? Tài xế có tài khoản ứng dụng? Đơn xe độc lập không kèm phòng? | SHT | Cao |
| OQ-2-08 | Kênh thông báo (SMS/Zalo/push/email), chi phí, nội dung bắt buộc | NTF | Trung bình |
| OQ-2-09 | Thời hạn lưu nhật ký, vết vị trí, dữ liệu căn cước; căn cứ pháp lý thu CCCD | NFR-04/07 | Cao |
| OQ-2-10 | Phân kỳ P1/P2/P3 ở mục 8 có đúng ưu tiên kinh doanh không | Kế hoạch | Cao |
| OQ-2-11 | Khách sạn có phải trả phí cho đơn bị hủy/no-show? Phí dịch vụ đơn có hoàn khi hủy? | PAY | Trung bình |
| OQ-2-12 | Phạm vi sân bay/thành phố giai đoạn đầu; số khách sạn đối tác tối thiểu để vận hành | Kinh doanh | Trung bình |
| OQ-2-14 | Phí hủy xe khi tài xế đã nhận nhiệm vụ (P-16) và mức bồi thường khi xe không đến | CXL, SHT | Trung bình |
| OQ-2-15 | Phạt khách sạn hủy không hợp lệ (điểm sự cố, ngưỡng tạm ẩn P-17, có phạt tiền không) | CXL, HTL | Trung bình |
| OQ-2-16 | Phí dịch vụ đơn: hoàn hay không khi hủy có phạt (đã đề xuất: không hoàn) | CXL, PAY | Trung bình |
| OQ-2-17 | Thời hạn khiếu nại sau lưu trú (đề xuất 7 ngày) và chính sách chargeback | DSP | Trung bình |
| OQ-2-18 | Tiền hoàn không có người nhận (khách không khai tài khoản sau 90 ngày): xử lý thế nào theo pháp luật | RFD | Trung bình |
| OQ-2-13 | Chat bot: dùng AI hay kịch bản cố định; dữ liệu khách đưa vào bot được lưu thế nào | SUP | Trung bình |

---

## 11. Truy vết nguồn → yêu cầu

| Nội dung nguồn | Yêu cầu |
|---|---|
| Gốc I.1 Kiểm tra chuyến bay (quét mã vạch, ngưỡng 5 giờ) | FR-FLT-01…07, BR-FLT-01…05 |
| Gốc I.2 Tìm kiếm & tồn phòng realtime | FR-SRC-01…08 |
| Gốc I.3 Đặt phòng, cấu tính giá | FR-BKG-01…11, BR-BKG-01 |
| Gốc I.4 Thanh toán MoMo / tại KS | FR-PAY-01…07, BR-PAY-01…04 |
| Gốc I.5 Theo dõi xe realtime | FR-SHT-02/03 |
| Gốc I.6–I.9 Lịch sử, hồ sơ, thông báo, yêu thích | FR-USR-01…07, FR-NTF-02, FR-SRC-07 |
| Gốc I.10 Hỗ trợ khẩn cấp & tư vấn | FR-SUP-01/02, FR-ADM-05 |
| Gốc II.1–II.6 Cổng khách sạn, đối soát phí (hoa hồng đã bỏ) | FR-HTL-01…12, BR-PAY-02 |
| Gốc "Chú ý quy định khách sạn" | BR-BKG-02, BR-BKG-05 |
| V1 §2.2–2.3, §3.4 "Đổi/Hủy phòng", REJECTED/CANCELLED/EXPIRED | Mục 3.11 (FR-CXL/RFD/DSP), FR-ADM-16/17 |
| Gốc III.1–III.4 Admin | FR-ADM-01, 05, 06, 08, 09, 10 |
| V1 §2.3 bảng trạng thái booking | Mục 3.3 (Trạng thái booking) |
| V1 §3 Admin flow/Booking Control | FR-ADM-02…04, FR-ADM-13 |
| V1 §3.4 Support ticket | FR-SUP-03/04, FR-ADM-06 |
| V1 §3.4 Shuttle Logistics | FR-SHT-04, FR-ADM-07 |
| V1 §3.4 Audit & báo cáo (tỷ lệ hủy, đối soát) | FR-ADM-09/10/14 |
| V1 §4–5 Sitemap | Mục 6 |
| V1 §6.1 Thanh toán/đối soát tự động | FR-PAY-06, FR-ADM-14 |

## Phụ lục — Lịch sử thay đổi

| Phiên bản | Thay đổi |
|---|---|
| v2.3-draft (2026-11-09) | Thêm mục 3.11 **Hủy – đổi – hoàn tiền – tranh chấp**: 12 tình huống X1…X12, FR-CXL-01…13, FR-RFD-01…08, FR-DSP-01…03, FR-ADM-16/17, BR-CXL-01…14, ma trận hoàn, trạng thái, 7 luồng F1…F7, DR-17…20, UC-15…19, AC-13…22, OQ-2-14…17 |
| v2.2-draft (2026-11-09) | **PO bỏ hoa hồng/phí hệ thống thu của khách sạn**: sửa BR-PAY-02/03, FR-PAY-04, FR-HTL-09, FR-ADM-10/11/12, UC-11, DR-14, AC-10, luồng tiền; "chốt phí" → "đối soát phí dịch vụ". Nguồn thu = phí dịch vụ đơn |
| v2.1-draft (2026-11-09) | BA chốt đề xuất cho OQ-2-01…13; cập nhật BR-FLT-02/04, BR-BKG-01/06, BR-PAY-02/03/04, BR-SHT-03/04; MoMo chuyển P2 có điều kiện; thêm `BA_PHAN_TICH_NGHIEP_VU_V2.md` |
| v2.0-draft (2026-11-09) | Bản đầu SRS nền tảng thật theo quyết định PO 2026-11-09: nền = bản gốc, bổ sung từ v1; không đặc tả công nghệ. Không sửa `SRS.md`, `MVP.md`, `RTM.md` |
