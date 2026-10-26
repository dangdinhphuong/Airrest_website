# Product Decision Register — Airrest SRS

Phiên bản v0.6 · 2026-10-26 · Dành cho Product Owner (PO). Không có quyết định nào ở đây đã được phê duyệt; mọi “khuyến nghị” là của agent (người soạn SRS), không phải quyết định của PO.

Cách dùng: đọc phần P0 trước, rồi trả lời theo dạng `D-01 = A` ở bảng cuối. Mục có trạng thái `Simulation Parameter` có thể dùng ngay như giả định mô phỏng có nhãn trong lúc chờ PO xác nhận.

| Trạng thái | Nghĩa |
|---|---|
| Pending PO | Chờ PO quyết định |
| Simulation Parameter | Có thể dùng như tham số/giả định mô phỏng minh bạch trong MVP; PO vẫn cần xác nhận giá trị |
| Deferred | Có thể hoãn mà không làm sai luồng cốt lõi |
| Blocked | Bị chặn do thiếu căn cứ hoặc dữ liệu; PO không thể quyết định hữu ích khi chưa có điều kiện mở chặn |

Ưu tiên: **P0** ảnh hưởng tính đúng đắn nghiệp vụ, phạm vi, logic thời gian hoặc state machine; **P1** cần để hoàn thiện trải nghiệm MVP nhưng có thể dùng giả định mô phỏng minh bạch; **P2** có thể trì hoãn.

## Tổng hợp

| ID | Ưu tiên | Trạng thái | Quyết định | Khuyến nghị của agent |
|---|---|---|---|---|
| D-01 | P0 | Pending PO | Điều kiện và phạm vi luồng đề nghị hỗ trợ lưu trú (L2) | A |
| D-10 | P0 | Pending PO | Phạm vi quy tắc “nguyên nhân chưa rõ thì không kết luận” | C |
| D-13 | P0 | Pending PO | Gỡ trạng thái Blocked của MB-03 và MB-20, và nội dung quyền lợi được duyệt | B |
| OQ-04 | P0 | Pending PO | Công thức thời gian nghỉ thực tế và giờ phải rời nơi nghỉ | C |
| OQ-08 | P0 | Pending PO | State machine của luồng L2 và định dạng mã yêu cầu | A |
| OQ-14 | P0 | Pending PO | Địa bàn áp dụng của MVP | A |
| OQ-20 | P0 | Pending PO | Người có thẩm quyền phê duyệt SRS | A |
| D-25 | P0 | Pending PO | Cơ chế xác thực và phân quyền của khách sạn, lái xe và quản trị | A |
| D-26 | P0 | Pending PO | Phạm vi chức năng lái xe và đón khách (so với MB-15 đã loại) | A |
| D-27 | P0 | Pending PO | Vai trò của hãng hàng không và phản hồi mô phỏng khi đã có khách sạn và quản trị | A |
| D-02 | P1 | Simulation Parameter | Giờ có mặt tại sân bay (mặc định mô phỏng 120 phút) | A |
| D-03 | P1 | Pending PO | Nhắc giờ khi trang còn mở và qua tệp lịch | A |
| D-04 | P1 | Simulation Parameter | Thời hạn của yêu cầu hỗ trợ (hết hạn / không phản hồi) | C |
| D-05 | P1 | Pending PO | Hành khách tự xác nhận điều kiện | B |
| D-06 | P1 | Simulation Parameter | Giả định tính giá: một phòng, một đêm, hai người lớn | A |
| D-08 | P1 | Simulation Parameter | Chu kỳ làm mới dữ liệu chuyến bay | A |
| D-14 | P1 | Pending PO | Hai nhánh gợi ý ở lại / đi nghỉ và ngưỡng | A |
| D-15 | P1 | Pending PO | Số bước đặt chỗ, tên gọi và hai cách trả mô phỏng | A |
| D-17 | P1 | Pending PO | Cơ chế kích hoạt phản hồi mô phỏng của hãng và cơ sở | A |
| D-18 | P1 | Pending PO | Dữ liệu được thu và lưu trong MVP | A |
| D-20 | P1 | Pending PO | Mục tiêu khả dụng, khả năng tiếp cận và hiệu năng | A |
| D-21 | P1 | Pending PO | Chip lọc, số kết quả, quy tắc “nhận khách ngay” và nhãn mô phỏng | A |
| D-23 | P1 | Pending PO | Quy mô và quyền sử dụng dữ liệu mock (D1, D3, A08) | B |
| D-28 | P1 | Pending PO | Phạm vi và ưu tiên chức năng của khu vực khách sạn và quản trị | A |
| D-29 | P1 | Pending PO | Lưu trữ và chia sẻ dữ liệu của khách sạn và quản trị khi chưa có backend | A |
| D-03* | P2 | Blocked | Nhắc nền khi trang đã đóng (Push) | A |
| D-07 | P2 | Deferred | Chứng từ và hướng dẫn giữ hóa đơn | A |
| D-09 | P2 | Blocked | Nguồn và độ tin cậy của dữ liệu tiện ích nhà ga | A |
| D-11 | P2 | Deferred | Danh mục trường hợp miễn trừ theo Điều 40 | C |
| D-12 | P2 | Pending PO | Nguồn FAQ và thông tin liên hệ | A |
| D-16 | P2 | Pending PO | Giữ hay loại MB-10 và MB-09 (đang Conditional) | A |
| D-19 | P2 | Pending PO | Các phần tử prototype không thuộc MVP | A |
| D-22 | P2 | Pending PO | Quy tắc đầu vào, phân chia S1/S2 và định nghĩa Sprint | A |
| D-24 | P2 | Deferred | Các nhóm phi chức năng chưa có căn cứ | A |

## P0 — ảnh hưởng tính đúng đắn, phạm vi, logic thời gian hoặc state machine

### D-01 — Điều kiện và phạm vi luồng đề nghị hỗ trợ lưu trú (L2)

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Khi hành khách gửi “đề nghị hãng hỗ trợ chỗ nghỉ” (MB-11), Airrest áp điều kiện nào, và điều kiện đó chỉ là thông tin hay chặn việc gửi?
- **Bối cảnh và căn cứ:** MVP MB-11: AC không nêu điều kiện. B03 FR-21: chậm ≥6 giờ hoặc khung 22h–7h, và nguyên nhân thuộc hãng. Văn bản chính thức (R-19, NĐ 208 Điều 36 k7–k8, Điều 39 k3c): chậm ≥6 giờ (hoặc chờ ≥6 giờ sau hủy), có vé, đã xác nhận chỗ, có mặt tại cảng, không áp dụng nếu chấp nhận hoàn vé; nghĩa vụ thuộc hãng nên L2 chỉ là cơ chế mô phỏng của Airrest (G-19). Prototype: nút gửi không điều kiện. Cách hiểu Điều 36 k7a (“thực hiện theo khoản 6”) cần pháp chế xác nhận.
- **Phương án:**
  - **A.** Hiển thị điều kiện theo văn bản như thông tin; không chặn việc gửi.
  - **B.** Chặn việc gửi khi hành khách chưa xác nhận đủ điều kiện (cổng kiểm tra).
  - **C.** Giữ điều kiện của B03 (≥6 giờ hoặc 22h–7h, và lỗi hãng) và chặn.
  - **D.** Không hiển thị điều kiện; giữ MVP nguyên văn, điều kiện TBD.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Nghĩa vụ phát sinh trực tiếp ở hãng, Airrest không xác minh được vé hay việc có mặt; chặn có thể loại nhầm người đủ điều kiện. C chưa khớp văn bản đã đọc. Cần pháp chế xác nhận k7a trước khi chốt.
- **Tác động:** FR-005, FR-019, BR-006, BR-010; UIR-002, UIR-010; UC-002, UC-009; CR-01, CR-02. AC liên quan: AC-008, AC-009, AC-036, AC-037.
- **Hậu quả nếu PO chưa quyết định:** FR-019 chưa có điều kiện; prototype giữ nút vô điều kiện; không viết được AC cuối cho “đủ điều kiện”; MB-03 vẫn Blocked.
- **Truy vết:** G-02, G-03, G-19; R-19, R-20; OQ-06, OQ-07, OQ-31; RESEARCH C.2 D-01

### D-10 — Phạm vi quy tắc “nguyên nhân chưa rõ thì không kết luận”

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Quy tắc của MB-03 áp dụng cho mọi quyền lợi hay chỉ cho hoàn vé và bồi thường?
- **Bối cảnh và căn cứ:** MVP MB-03: “không kết luận khi nguyên nhân chưa rõ” (BR-006). NĐ 208 Điều 36 k6d (R-19) gắn điều kiện lỗi người vận chuyển với hoàn vé và bồi thường ứng trước; Điều 36 k7 không ghi điều kiện này (diễn giải, cần pháp chế xác nhận); Điều 40 nói về miễn trừ bồi thường ứng trước.
- **Phương án:**
  - **A.** Giữ nguyên MVP: áp dụng cho toàn bộ quyền lợi.
  - **B.** Chỉ áp dụng cho hoàn vé và bồi thường ứng trước; ăn/nghỉ hiển thị theo mốc giờ.
  - **C.** Như B và hiển thị hai kịch bản (lỗi hãng / không) cho hoàn vé và bồi thường khi chưa rõ nguyên nhân.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **C** — Trung thực khi chưa biết nguyên nhân và không che quyền ăn/nghỉ; khớp B04 UC02 E1. Khác chữ MVP nên cần PO phê duyệt.
- **Tác động:** BR-006, FR-005, DR-002; UC-002; CR-11. AC liên quan: AC-009, AC-010.
- **Hậu quả nếu PO chưa quyết định:** Áp dụng rộng có thể che quyền ăn/nghỉ; áp dụng hẹp trái chữ MVP. AC của MB-03 không thể chốt.
- **Truy vết:** G-21, G-02; R-19; OQ-36, OQ-06; RESEARCH C.2 D-10

### D-13 — Gỡ trạng thái Blocked của MB-03 và MB-20, và nội dung quyền lợi được duyệt

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Khi nào và ai xác nhận nội dung quyền lợi/pháp lý để gỡ Blocked? Nội dung nào được dùng: B03, hay văn bản chính thức đã đối chiếu?
- **Bối cảnh và căn cứ:** MVP: MB-03 và MB-20 “Blocked – kiểm chứng văn bản gốc/pháp lý”. SRS v0.4 đã đối chiếu NĐ 208 Điều 36–40 và TT 48 Điều 4–8 (R-19, R-01) nhưng PDF NĐ 208 là ảnh quét đọc bằng cách xem ảnh; Luật 130 Điều 53 chưa có bản chính thức. SRS không tự gỡ Blocked.
- **Phương án:**
  - **A.** PO xác nhận nội dung theo bảng C.1 và văn bản chính thức, rồi cập nhật MVP gỡ Blocked.
  - **B.** Giữ Blocked cho đến khi có đối chiếu độc lập với bản Công báo (AUD-04), sau đó chuyển sang A.
  - **C.** Bỏ phần nội dung quyền lợi cụ thể khỏi MVP; chỉ hiển thị liên kết tới nguồn chính thức.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **B** — Bản đã đọc là ảnh quét và có một điểm diễn giải (k7a); đối chiếu độc lập tốn ít và tránh phát hành nội dung sai.
- **Tác động:** FR-005, NFR-008, NFR-009, BR-007, DR-002; UIR-002; MB-03, MB-20. AC liên quan: AC-008, AC-010, AC-061, AC-062.
- **Hậu quả nếu PO chưa quyết định:** FR-005, NFR-008, NFR-009 không thể triển khai; SRS không thể lên Ready for Implementation.
- **Truy vết:** G-17; R-19, R-01, R-20; OQ-06, OQ-19, OQ-35 (đã giải quyết), OQ-37; AUD-04, AUD-05

### OQ-04 — Công thức thời gian nghỉ thực tế và giờ phải rời nơi nghỉ

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Dùng công thức nào cho “thời gian nghỉ thực tế” (MB-04) và “giờ rời” (MB-08)?
- **Bối cảnh và căn cứ:** MVP: chỉ “tính đúng/giải thích”. B03 FR-05/13: nghỉ = giờ có mặt − hiện tại − 2×phút đi; giờ có mặt = bay − 120 phút; rời = có mặt − đi − 15 phút. B04/B02: giờ có mặt 90 phút; nghỉ = có mặt − hiện tại − (đi+về) − 60 phút. Ràng buộc cứng: đóng quầy nội địa 40 phút trước giờ đi (R-01 Điều 8.1b).
- **Phương án:**
  - **A.** Công thức B03 (có mặt 120 phút; trừ 2×phút đi; dự phòng 15 phút khi tính giờ rời).
  - **B.** Công thức B04/B02 (có mặt 90 phút; trừ đi và về; dự phòng 60 phút).
  - **C.** Tham số hóa cả hai (giờ có mặt, dự phòng, hệ số di chuyển); PO chọn bộ mặc định; ràng buộc giờ có mặt không muộn hơn mốc đóng quầy 40 phút.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **C** — Hai nguồn nội bộ mâu thuẫn và không nguồn nào có thẩm quyền; tham số hóa tránh hard-code và khớp NFR-009.
- **Tác động:** FR-006, FR-014, FR-016, FR-023, BR-011, NFR-009; UIR-003, UIR-007; CR-03. AC liên quan: AC-011, AC-012, AC-029, AC-030, AC-032.
- **Hậu quả nếu PO chưa quyết định:** Hai AC giá trị số (AC của FR-006, FR-014) không có TC; kết quả kiểm thử không có giá trị kỳ vọng; prototype hiển thị số khác B04.
- **Truy vết:** G-10; R-01, R-07; OQ-04; D-02

### OQ-08 — State machine của luồng L2 và định dạng mã yêu cầu

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Yêu cầu hỗ trợ có những trạng thái nào, chuyển tiếp ra sao, và mã có định dạng gì?
- **Bối cảnh và căn cứ:** MVP MB-14: “Cần state machine”, AC “giữ mã/trạng thái; chuyển đúng M3; xử lý giờ bay mới”. B03 mục 6.4: 8 mục (trong đó “giờ bay cập nhật” là sự kiện, “đủ điều kiện” xảy ra trước khi có yêu cầu). Mã: HT-xxx (B04 KT) và AR-1028 (prototype). Văn bản chính thức không quy định thủ tục L2 nên không có ràng buộc pháp lý (R-19).
- **Phương án:**
  - **A.** 6 trạng thái theo SRS mục 4.3 (chờ hãng duyệt; hãng từ chối; hãng duyệt–chờ cơ sở; cơ sở từ chối; đã xác nhận phòng; chuyển tự chi trả); “giờ bay đổi” là sự kiện; mã theo B04 (HT-xxx).
  - **B.** Tối giản theo AC MVP: chờ → duyệt/từ chối; cơ sở xác nhận/từ chối; “tự chi trả” là cờ, không phải trạng thái.
  - **C.** PO tự định nghĩa tập trạng thái và định dạng mã.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Khớp B03 mục 6.4 và B04 KT-04…09; “giờ bay đổi” là sự kiện nên không phình trạng thái; chưa xung đột AC nào của MVP.
- **Tác động:** FR-019…FR-023, BR-008, BR-009, BR-010, BR-014, DR-007; UIR-010; UC-009…UC-013. AC liên quan: AC-036, AC-038, AC-041, AC-044, AC-047.
- **Hậu quả nếu PO chưa quyết định:** BR-014 vẫn TBD; FR-023 chỉ có AC Proposed; không kiểm thử được luồng L2.
- **Truy vết:** G-06, G-13; R-01, R-19; OQ-08, OQ-21, OQ-33; SRS 4.3

### OQ-14 — Địa bàn áp dụng của MVP

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** MVP áp dụng cho sân bay nào?
- **Bối cảnh và căn cứ:** MVP không nêu. B03 mục 1: HAN chính, SGN bổ sung, DAD không. B00: chưa có chữ ký/ý kiến GVHD. Prototype: chọn HAN/SGN nhưng danh sách chỉ “gần Nội Bài”.
- **Phương án:**
  - **A.** HAN chính, SGN bổ sung (theo B03); DAD ngoài MVP.
  - **B.** Chỉ HAN.
  - **C.** HAN và SGN ngang nhau.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Khớp B03/B00 (đề cương) và dữ liệu A08 có cả hai sân bay; chưa mở rộng phạm vi.
- **Tác động:** DR-001, DR-003, IFR-001; UIR-001, UIR-004; AS-01. AC liên quan: AC-001, AC-063.
- **Hậu quả nếu PO chưa quyết định:** Dữ liệu mock và kịch bản kiểm thử không có phạm vi rõ; địa bàn chưa thể coi là ràng buộc.
- **Truy vết:** OQ-14; AS-01; B00; MVP (không nêu)

### OQ-20 — Người có thẩm quyền phê duyệt SRS

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Ai phê duyệt SRS và các quyết định trong sổ này, và khi nào B00/B03 được ký?
- **Bối cảnh và căn cứ:** MVP dòng 2: chỉ chuyển sang “Đã duyệt” sau khi nhóm/GVHD xác nhận B00/B03. B00 và B03 chưa có chữ ký; SRS ghi người rà soát “Chưa có”.
- **Phương án:**
  - **A.** PO cùng GVHD (theo MVP dòng 2); PO ghi tên và ngày.
  - **B.** Chỉ PO.
  - **C.** PO, GVHD và đại diện đơn vị thực tập.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Đúng điều kiện MVP đã nêu; tránh tự thay đổi cơ chế phê duyệt.
- **Tác động:** Toàn bộ SRS; RC-05. AC liên quan: —.
- **Hậu quả nếu PO chưa quyết định:** Không thể chuyển trạng thái duyệt; SRS giữ Draft; không có căn cứ để đánh dấu quyết định là đã phê duyệt.
- **Truy vết:** OQ-20; RC-05; MVP dòng 2; B00

### D-25 — Cơ chế xác thực và phân quyền của khách sạn, lái xe và quản trị

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Khách sạn, lái xe và quản trị đăng nhập bằng cơ chế nào, và người dùng cuối vẫn không cần tài khoản?
- **Bối cảnh và căn cứ:** MVP: không đăng nhập (MB-07), không thu dữ liệu ngoài phạm vi (MB-19), TBD-NFR-01 chưa có căn cứ. Chỉ đạo PO: ba tác nhân.
- **Phương án:**
  - **A.** Đăng nhập mô phỏng: chọn vai trò và cơ sở, không có mật khẩu thật, có nhãn mô phỏng; không lưu thông tin nhạy cảm.
  - **B.** Tài khoản và mật khẩu thật (cần backend và quy trình bảo mật).
  - **C.** Liên kết hoặc mã truy cập riêng cho từng khách sạn; quản trị dùng tài khoản riêng.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Phù hợp prototype mô phỏng, không cần backend, vẫn thể hiện đúng ba vai trò. B và C cần quyết định hạ tầng và bảo mật ngoài phạm vi hiện tại.
- **Tác động:** FR-024, FR-031; BR-015; NFR-010; DR-010; UIR-014. Không có AC.
- **Hậu quả nếu PO chưa quyết định:** FR-024 chưa có cơ chế; không thể viết AC cho đăng nhập; TBD-NFR-01 giữ nguyên.
- **Truy vết:** OQ-38; chỉ đạo PO 26/10/2026

### D-26 — Phạm vi chức năng lái xe và đón khách (so với MB-15 đã loại)

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Lái xe có chức năng gì trong hệ thống, và có chấp nhận mở rộng MVP so với MB-15 “gọi xe” (Đã loại) không?
- **Bối cảnh và căn cứ:** MVP MB-15 loại “bản đồ, gọi xe, lưu chứng từ”. Chỉ đạo PO: khách sạn bao gồm lái xe. BR-002 cấm thu số điện thoại, email.
- **Phương án:**
  - **A.** Lái xe nhận chuyến và cập nhật trạng thái đón cho yêu cầu đã có đặt chỗ; không bản đồ, không định vị, không thanh toán xe; liên lạc qua trạng thái và ghi chú trong hệ thống.
  - **B.** Chỉ hiển thị thông tin xe đưa đón hiện có (miễn phí hay có phí); lái xe không có màn hình riêng.
  - **C.** Gọi xe đầy đủ có bản đồ và định vị (sửa MB-15 trong MVP).
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Đáp ứng chỉ đạo có lái xe mà ít đụng MB-15 và BR-002 nhất; C mở rộng phạm vi lớn và cần PO sửa MVP.
- **Tác động:** FR-028, FR-029; DR-011; UC-016; UIR-012. Không có AC.
- **Hậu quả nếu PO chưa quyết định:** FR-028, FR-029 giữ Proposed; không viết được AC; MB-15 và chỉ đạo PO vẫn mâu thuẫn.
- **Truy vết:** OQ-39; MB-15

### D-27 — Vai trò của hãng hàng không và phản hồi mô phỏng khi đã có khách sạn và quản trị

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P0
- **Vấn đề cần quyết định:** Ai duyệt hoặc từ chối đề nghị hỗ trợ, và phản hồi của cơ sở do khách sạn thật hay mô phỏng?
- **Bối cảnh và căn cứ:** MVP MB-12, MB-13: phản hồi mô phỏng. OQ-21 và D-17 (cơ chế kích hoạt phản hồi) chưa chốt. Ba tác nhân thật mới: khách sạn, lái xe, quản trị.
- **Phương án:**
  - **A.** Giữ hãng là tác nhân mô phỏng (kịch bản chọn trước); khách sạn thật xử lý đặt chỗ (MB-13); quản trị có màn hình xem và điều chỉnh kịch bản.
  - **B.** Quản trị thay hãng duyệt hoặc từ chối đề nghị hỗ trợ; khách sạn xử lý phần cơ sở.
  - **C.** Loại hãng khỏi luồng L2; khách sạn quyết định.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Giữ nguyên cấu trúc L2 của MVP (hãng mô phỏng) và thêm vai trò thật ở phần cơ sở. B và C đổi nghĩa luồng L2; C còn trái nguyên tắc nghĩa vụ thuộc hãng (G-19).
- **Tác động:** FR-020, FR-021, FR-027, FR-033; IFR-002; ACT-02, ACT-03; BR-008. Không có AC.
- **Hậu quả nếu PO chưa quyết định:** IFR-002 giữ “cơ chế TBD”; FR-027 và FR-033 chưa xác định phạm vi; không kiểm thử được L2 với ba tác nhân.
- **Truy vết:** OQ-40; OQ-21; D-17

## P1 — cần cho MVP, có thể dùng giả định mô phỏng

### D-02 — Giờ có mặt tại sân bay (mặc định mô phỏng 120 phút)

- **Trạng thái hiện tại:** Simulation Parameter · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Giá trị mặc định cho “giờ có mặt trước giờ bay” là bao nhiêu và giới hạn nào là cứng?
- **Bối cảnh và căn cứ:** TT 48 Điều 8.1b (R-01): quầy nội địa mở ≥2 giờ, đóng 40 phút trước giờ đi. B03: 120 phút; B04/B02: 90 phút. Prototype: có mặt 04:00 cho chuyến 06:00.
- **Phương án:**
  - **A.** Mặc định 120 phút (mô phỏng).
  - **B.** Mặc định 90 phút (mô phỏng).
  - **C.** PO chọn giá trị khác.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Dư xa mốc đóng quầy 40 phút; khớp B03 và prototype. Ràng buộc cứng: không muộn hơn 40 phút trước giờ đi. Chỉ là tham số mô phỏng, gắn nhãn mô phỏng.
- **Tác động:** FR-006, FR-014, FR-016, NFR-009; CR-03. AC liên quan: AC-012, AC-030.
- **Hậu quả nếu PO chưa quyết định:** Dùng 120 phút mô phỏng có nhãn; không ảnh hưởng tính đúng đắn luồng nếu công thức OQ-04 được chốt sau.
- **Truy vết:** OQ-04; G-10; R-01, R-07; CR-03; RESEARCH D-02

### D-03 — Nhắc giờ khi trang còn mở và qua tệp lịch

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** MB-08 nhắc bằng kênh nào khi trang còn mở, và phương án thay thế “lịch” là gì?
- **Bối cảnh và căn cứ:** MVP MB-08: “fallback lịch”. Notification API cần HTTPS và quyền người dùng (R-13); iCalendar là định dạng lịch chuẩn (R-14, chưa thử nhắc trong tệp lịch). SMS ngoài MVP (MB-07, MB-19).
- **Phương án:**
  - **A.** Thông báo trình duyệt (khi đã cấp quyền) + nhắc trong trang + tệp lịch iCalendar.
  - **B.** Chỉ nhắc trong trang.
  - **C.** Thêm SMS.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Không cần máy chủ hay dịch vụ ngoài; khớp AC “fallback lịch”; SMS cần số điện thoại, trái ràng buộc không thu SĐT.
- **Tác động:** FR-014, FR-015, DR-006; UIR-007; CR-05. AC liên quan: AC-029, AC-031.
- **Hậu quả nếu PO chưa quyết định:** MB-08 có thể triển khai tạm bằng nhắc trong trang; AC fallback lịch chưa có cách kiểm thử cụ thể.
- **Truy vết:** OQ-09, OQ-34; G-12; R-13, R-14, R-25…R-27; CR-05

### D-04 — Thời hạn của yêu cầu hỗ trợ (hết hạn / không phản hồi)

- **Trạng thái hiện tại:** Simulation Parameter · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Yêu cầu L2 có hết hạn không, sau bao lâu, và hết hạn thì hệ thống làm gì?
- **Bối cảnh và căn cứ:** MVP không nêu. NĐ 208/TT 48 (đã đọc Điều 36–40, TT 48 Điều 3–8) không có thời hạn phản hồi cho đề nghị lưu trú. B04 UC11 E1: 15 phút mô phỏng.
- **Phương án:**
  - **A.** Không hết hạn.
  - **B.** Cố định 15 phút (B04), quá hạn gợi ý tự chi trả.
  - **C.** Tham số cấu hình; mặc định 15 phút; quá hạn gợi ý tự chi trả.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **C** — Không có căn cứ pháp lý cho giá trị nên để là tham số mô phỏng; giữ lối thoát cho người dùng (BR-010).
- **Tác động:** FR-019, FR-020, FR-021, BR-010, DR-007; CR-07. AC liên quan: AC-037, AC-040.
- **Hậu quả nếu PO chưa quyết định:** Người dùng có thể chờ vô hạn trong mô phỏng; không thể kiểm thử trạng thái quá hạn.
- **Truy vết:** OQ-33, OQ-08; G-06; R-01, R-19; CR-07

### D-05 — Hành khách tự xác nhận điều kiện

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Có thêm bước để hành khách tự xác nhận (có vé, đã xác nhận chỗ, có mặt tại cảng) trước khi gửi đề nghị không?
- **Bối cảnh và căn cứ:** Phụ thuộc D-01: nếu D-01 = A (chỉ thông tin) thì bước xác nhận không có tác dụng ngăn chặn. Airrest không thu mã đặt chỗ nên không xác minh thật được. NFR-002: một hành động chính mỗi màn hình.
- **Phương án:**
  - **A.** Một ô xác nhận (mô phỏng, không lưu, không chặn).
  - **B.** Không thêm bước; chỉ hiển thị điều kiện.
  - **C.** Xác nhận bắt buộc (chặn nếu không chọn).
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **B** — Nếu D-01 = A thì thêm bước chỉ làm chậm luồng khẩn cấp. Chỉ chọn C khi PO chọn D-01 = B. (Lưu ý: RESEARCH C.2 D-05 đề xuất B kiểu “tự xác nhận”; mâu thuẫn này được ghi ở AUD-14.)
- **Tác động:** FR-019, NFR-002, NFR-005; UIR-010; CR-02. AC liên quan: AC-036.
- **Hậu quả nếu PO chưa quyết định:** MB-11 giữ nguyên luồng hiện tại; không thể nói điều kiện hành khách đã được “kiểm tra”.
- **Truy vết:** OQ-31; G-03, G-19; R-19; CR-02; D-01

### D-06 — Giả định tính giá: một phòng, một đêm, hai người lớn

- **Trạng thái hiện tại:** Simulation Parameter · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** “Giá tổng” của mock dựa trên giả định nào và có ghi giả định trên giao diện không?
- **Bối cảnh và căn cứ:** MVP MB-06: “giá tổng nhất quán”. B02/A08: giá cho 1 đêm, 2 người lớn. Prototype: “Giá tổng / đêm”.
- **Phương án:**
  - **A.** Cố định 1 phòng, 1 đêm, 2 người lớn và ghi giả định cạnh giá.
  - **B.** Thêm trường nhập số khách/phòng/đêm.
  - **C.** Cố định nhưng không ghi giả định.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Không mở rộng phạm vi, minh bạch với người dùng (MB-06).
- **Tác động:** FR-011, DR-004; UIR-005; CR-06. AC liên quan: AC-020, AC-021.
- **Hậu quả nếu PO chưa quyết định:** Giá có thể bị hiểu sai với gia đình đông hoặc thuê theo giờ.
- **Truy vết:** OQ-32; G-07; B02; CR-06

### D-08 — Chu kỳ làm mới dữ liệu chuyến bay

- **Trạng thái hiện tại:** Simulation Parameter · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Dữ liệu chuyến bay mô phỏng được làm mới bao lâu một lần và bao lâu thì coi là cũ?
- **Bối cảnh và căn cứ:** NĐ 208 Điều 36 k3b (R-19): hãng cập nhật giờ đi dự kiến cho cảng/FIDS ít nhất 30 phút/lần (nghĩa vụ của hãng, không phải của Airrest). MVP MB-02: “tự động hóa hoàn thiện S2”.
- **Phương án:**
  - **A.** Mặc định 30 phút (tham số mô phỏng).
  - **B.** 15 phút.
  - **C.** Không nêu tần suất.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Có căn cứ tham khảo từ văn bản; chỉ là tham số, không phải nghĩa vụ của Airrest.
- **Tác động:** FR-003, FR-004, NFR-007, BR-012; CR-04. AC liên quan: AC-005, AC-006, AC-059.
- **Hậu quả nếu PO chưa quyết định:** Không kiểm thử được “dữ liệu cũ”; vẫn hiển thị “cập nhật lúc”.
- **Truy vết:** OQ-22; G-11; R-19; CR-04

### D-14 — Hai nhánh gợi ý ở lại / đi nghỉ và ngưỡng

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Hai nhánh của MB-04 là gì và có ngưỡng thời gian nào để gợi ý?
- **Bối cảnh và căn cứ:** MVP MB-04: “hai nhánh lựa chọn”. B03: ba phương án; B04 UC03: <3 giờ ở lại, 3–6 giờ thuê theo giờ, >6 giờ khách sạn. Prototype: ba thẻ.
- **Phương án:**
  - **A.** Hai nhánh “Ở lại sân bay” và “Đi nghỉ”; hiển thị thời gian nghỉ, không đặt ngưỡng cứng.
  - **B.** Hai nhánh + ngưỡng của B04.
  - **C.** Ba phương án của B03.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Đúng MVP; ngưỡng chưa có nguồn có thẩm quyền.
- **Tác động:** FR-006, FR-007; UIR-003; UC-003. AC liên quan: AC-013.
- **Hậu quả nếu PO chưa quyết định:** FR-007 giữ AC tổng quát; prototype ba thẻ lệch MVP.
- **Truy vết:** OQ-05; G-10; B03; B04

### D-15 — Số bước đặt chỗ, tên gọi và hai cách trả mô phỏng

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** “≤3 bước” đếm thế nào, tên gọi có bắt buộc không, hai cách trả là gì?
- **Bối cảnh và căn cứ:** MVP MB-07: “≤3 bước; ≥2 cách trả mô phỏng; không SĐT/email”. B03: 3 bước (chọn phòng → tên gọi → xác nhận); B04: tên gọi bắt buộc ≤50 ký tự; trả tại nơi nghỉ/QR/thẻ. Prototype: 2 bước, tên gọi không bắt buộc, không có bước trả.
- **Phương án:**
  - **A.** 3 bước theo B03; tên gọi bắt buộc ≤50 ký tự; hai cách trả “Trả tại nơi nghỉ” và “QR” (mô phỏng).
  - **B.** 2 bước như prototype; hai cách trả như A.
  - **C.** PO chọn khác.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Khớp AC MVP; không thu dữ liệu thêm; “Trả tại nơi nghỉ” phù hợp người không có thẻ.
- **Tác động:** FR-012, FR-013, DR-005; UIR-006. AC liên quan: AC-023, AC-027.
- **Hậu quả nếu PO chưa quyết định:** Hai AC đo được nhưng chưa có cách đếm bước; prototype lệch MVP về phương thức trả.
- **Truy vết:** OQ-10, OQ-11; G-04; B03; B04

### D-17 — Cơ chế kích hoạt phản hồi mô phỏng của hãng và cơ sở

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Phản hồi duyệt/từ chối/xác nhận được tạo bằng cách nào?
- **Bối cảnh và căn cứ:** MVP MB-12/13: “phản hồi mô phỏng”. B04: kịch bản chọn trước, nút mô phỏng đổi giờ. MVP không có actor quản trị; từ 26/10/2026 chủ sản phẩm chỉ đạo có tác nhân quản trị và khách sạn (xem D-27).
- **Phương án:**
  - **A.** Kịch bản chọn trước theo mã chuyến/yêu cầu (không thêm actor hay giao diện điều khiển).
  - **B.** Người thử nghiệm chọn kết quả qua điều khiển trên giao diện (thêm actor/giao diện).
  - **C.** Ngẫu nhiên hoặc theo thời gian.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Không mở rộng phạm vi; đủ cho 20 kịch bản KT của B04.
- **Tác động:** FR-019, FR-020, FR-021, IFR-002; UIR-010. AC liên quan: AC-064.
- **Hậu quả nếu PO chưa quyết định:** IFR-002 giữ “cơ chế TBD”; không viết được dữ liệu kiểm thử.
- **Truy vết:** OQ-21; G-13; B04

### D-18 — Dữ liệu được thu và lưu trong MVP

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Prototype được thu/lưu những dữ liệu nào (kể cả cục bộ)?
- **Bối cảnh và căn cứ:** MVP MB-19: “không thu dữ liệu ngoài phạm vi”. B04 mục 6.1: danh sách không thu; “tên gọi” chỉ trong phiên. Prototype có nút “Lưu nơi nghỉ”. Luật 91/2025 Điều 2.1 (R-23): dữ liệu cá nhân là dữ liệu xác định hoặc giúp xác định một người; “tên gọi” chưa được kết luận.
- **Phương án:**
  - **A.** Không thu gì; tên gọi chỉ trong phiên, không lưu cục bộ; bỏ “Lưu nơi nghỉ”.
  - **B.** Cho phép lưu cục bộ trên thiết bị (ví dụ “Lưu nơi nghỉ”).
  - **C.** Thu dữ liệu phân tích (cần đồng ý theo Điều 9 Luật 91/2025).
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Đơn giản nhất và khớp MB-19; B/C cần định nghĩa phạm vi và rà soát pháp lý.
- **Tác động:** NFR-005, DR-005, FR-012; UIR-005. AC liên quan: AC-056, AC-057.
- **Hậu quả nếu PO chưa quyết định:** “Phạm vi” của MB-19 không đo được; phần tử “Lưu nơi nghỉ” còn mâu thuẫn MVP.
- **Truy vết:** OQ-18; G-14; R-23, R-24; AS-04

### D-20 — Mục tiêu khả dụng, khả năng tiếp cận và hiệu năng

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Ngưỡng đo cho MB-17 và MB-18 là gì?
- **Bối cảnh và căn cứ:** MVP: “đạt mục tiêu test”, “nội dung rõ”, “≤3 giây với mock data”. B03: ≥80% hoàn thành, ≤3 phút, SUS ≥71, WCAG 2.2 AA, 4G ≤3 giây và ≤1 MB.
- **Phương án:**
  - **A.** Dùng ngưỡng của B03 làm mục tiêu kiểm thử (không phải điều kiện pháp lý).
  - **B.** Chỉ giữ AC của MVP.
  - **C.** PO đặt ngưỡng khác.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Có số đo cho AC chưa đo được; vùng chạm 24 px khớp WCAG 2.2 SC 2.5.8 (R-15, mức xác minh thấp).
- **Tác động:** NFR-001…NFR-004; UIR-011. AC liên quan: AC-050, AC-052, AC-053, AC-054, AC-055.
- **Hậu quả nếu PO chưa quyết định:** Hai AC của MVP vẫn không có TC.
- **Truy vết:** OQ-16, OQ-17; G-16; R-15

### D-21 — Chip lọc, số kết quả, quy tắc “nhận khách ngay” và nhãn mô phỏng

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Tập chip lọc, số kết quả tối đa, định nghĩa “nhận khách ngay” và quy cách nhãn là gì?
- **Bối cảnh và căn cứ:** MVP MB-05: “lọc còn phòng/giờ lễ tân; chip lọc đúng”. B03: 6 chip, tối đa 5 kết quả. B04: nhận khách ngay = giờ nhận phòng cuối > giờ hiện tại hoặc lễ tân 24/24; dữ liệu >30 phút là cũ. Prototype: 4 chip, 3 kết quả, giờ cố định.
- **Phương án:**
  - **A.** Chip: Huỷ miễn phí, Thuê theo giờ, Phù hợp gia đình, Có xe đưa đón; tối đa 5 kết quả; quy tắc B04; nhãn “[Mô phỏng]”.
  - **B.** Giữ 4 chip của prototype; các quy tắc khác như A.
  - **C.** PO chọn khác.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Không đưa chip “Dưới [x]đ” và “Trong nhà ga” vì thiếu dữ liệu/MB-09 còn Conditional.
- **Tác động:** FR-008, FR-009, FR-010, BR-003, NFR-006; UIR-004. AC liên quan: AC-014, AC-015, AC-019, AC-058.
- **Hậu quả nếu PO chưa quyết định:** AC “chip đúng” không có danh sách chip để kiểm thử.
- **Truy vết:** OQ-24, OQ-25, OQ-26; G-05

### D-23 — Quy mô và quyền sử dụng dữ liệu mock (D1, D3, A08)

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Dữ liệu mock gồm bao nhiêu bản ghi và có được dùng bộ A08 thu thập từ Booking.com không?
- **Bối cảnh và căn cứ:** MVP: “Mock D1”, “Mock D3 ≥30 cơ sở”. B04: D1 20 chuyến; A08 70 cơ sở thu thập từ Booking.com ngày 11/10/2026; quyền sử dụng chưa rõ (RSK-04). Prototype nêu “70 nơi nghỉ” nhưng chỉ có 3.
- **Phương án:**
  - **A.** Dùng A08 sau khi PO xác nhận quyền sử dụng.
  - **B.** Tự tạo dữ liệu tổng hợp theo cấu trúc A08, không dùng bản ghi gốc.
  - **C.** Dùng nguyên A08.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **B** — Tránh rủi ro quyền dữ liệu; vẫn đạt ≥30 cơ sở. Chuyển sang A khi quyền được xác nhận.
- **Tác động:** IFR-001, DR-003, DR-004, FR-008; UIR-004. AC liên quan: AC-063.
- **Hậu quả nếu PO chưa quyết định:** Không có dữ liệu mock được phép dùng cho kiểm thử.
- **Truy vết:** OQ-15; RSK-04; B04; A08

### D-28 — Phạm vi và ưu tiên chức năng của khu vực khách sạn và quản trị

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Chức năng nào của FR-025 đến FR-034 là bắt buộc cho MVP, chức năng nào hoãn, và mức ưu tiên?
- **Bối cảnh và căn cứ:** MVP không có hạng mục cho các tác nhân này; chưa có MoSCoW và Sprint.
- **Phương án:**
  - **A.** Bắt buộc tối thiểu: đăng nhập (FR-024), cập nhật phòng và giá (FR-026), xử lý đặt chỗ (FR-027), quản lý cơ sở và tài khoản (FR-030, FR-031); hoãn: nội dung và tham số (FR-032), giám sát (FR-033), nhật ký (FR-034), đón khách (FR-028, FR-029).
  - **B.** Làm toàn bộ FR-024 đến FR-034.
  - **C.** Chỉ quản trị cơ sở và tài khoản; khách sạn dùng dữ liệu cố định.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Tập tối thiểu vẫn thể hiện đủ ba vai trò mà không mở rộng quá lớn; chức năng còn lại ghi Deferred.
- **Tác động:** FR-024 đến FR-034; UC-014 đến UC-019. Không có AC.
- **Hậu quả nếu PO chưa quyết định:** FR-025 đến FR-034 không có MoSCoW hay Sprint; không lập kế hoạch được.
- **Truy vết:** OQ-41

### D-29 — Lưu trữ và chia sẻ dữ liệu của khách sạn và quản trị khi chưa có backend

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P1
- **Vấn đề cần quyết định:** Dữ liệu do khách sạn và quản trị cập nhật được lưu và chia sẻ cho người dùng cuối bằng cách nào?
- **Bối cảnh và căn cứ:** D-18 phương án A: chỉ lưu trong phiên trang. SRS không quyết định hạ tầng (mục 9.2).
- **Phương án:**
  - **A.** Dữ liệu mô phỏng nạp từ tập dữ liệu và chỉ đổi trong phiên trình duyệt; khách sạn và quản trị được minh họa bằng dữ liệu cố định hoặc trong cùng phiên, có nhãn mô phỏng.
  - **B.** Lưu trên trình duyệt (localStorage), mỗi trình duyệt một bản; lệch D-18.
  - **C.** Thêm backend và cơ sở dữ liệu dùng chung (ngoài phạm vi đã nêu).
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Đơn giản nhất và khớp D-18, MB-19; thể hiện được ba vai trò trong một phiên. C cần PO quyết định hạ tầng.
- **Tác động:** BR-016, BR-017; FR-025, FR-026, FR-034; DR-012. Không có AC.
- **Hậu quả nếu PO chưa quyết định:** Không rõ dữ liệu khách sạn đến được người dùng cuối thế nào; FR-034 không đặc tả được thời gian lưu.
- **Truy vết:** OQ-42; D-18

## P2 — có thể trì hoãn

### D-03* — Nhắc nền khi trang đã đóng (Push)

- **Trạng thái hiện tại:** Blocked · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** MVP có hỗ trợ nhắc khi trang đã đóng không?
- **Bối cảnh và căn cứ:** Cần service worker + Push API + máy chủ gửi push qua dịch vụ push (R-26); không có cơ chế lập lịch hiển thị phía client được tài liệu hóa (R-27); iOS cần 16.4+ và Màn hình chính (R-25). MVP không có backend hay dịch vụ ngoài.
- **Phương án:**
  - **A.** Không hỗ trợ nhắc nền trong MVP.
  - **B.** Phê duyệt hạ tầng push (máy chủ và dịch vụ push) — ngoài phạm vi hiện tại.
  - **C.** Hoãn quyết định.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Không thêm hạ tầng; MB-08 AC chỉ yêu cầu tính giờ và fallback lịch, không yêu cầu nhắc nền.
- **Tác động:** FR-014, FR-015; UIR-007; CR-05. AC liên quan: AC-029, AC-031.
- **Hậu quả nếu PO chưa quyết định:** MB-08 chỉ đảm bảo nhắc khi trang còn mở; tệp lịch là phương án duy nhất khi đóng trang.
- **Truy vết:** OQ-34; G-12; R-25, R-26, R-27; D-03

### D-07 — Chứng từ và hướng dẫn giữ hóa đơn

- **Trạng thái hiện tại:** Deferred · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** Có hỗ trợ chứng từ khi tự chi trả không?
- **Bối cảnh và căn cứ:** MB-15 (FR-17) đã loại. Anh/Mỹ: người tự chi trả cần hóa đơn để đòi lại (R-08, R-09). TT 48: đề nghị hoàn vé ≤60 ngày, yêu cầu bồi thường ≤90 ngày (R-01).
- **Phương án:**
  - **A.** Giữ nguyên MVP; chỉ thêm nội dung hướng dẫn giữ hóa đơn (không phải tính năng).
  - **B.** Mở lại chứng từ đơn giản sau MVP.
  - **C.** Đưa vào MVP.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Không đổi phạm vi; vẫn hỗ trợ người dùng.
- **Tác động:** FR-022; MB-15. AC liên quan: AC-044.
- **Hậu quả nếu PO chưa quyết định:** Không ảnh hưởng luồng MVP cốt lõi.
- **Truy vết:** OQ-03; G-04, G-08; R-08, R-09; D-07

### D-09 — Nguồn và độ tin cậy của dữ liệu tiện ích nhà ga

- **Trạng thái hiện tại:** Blocked · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** Dữ liệu tiện ích nhà ga (MB-09) lấy từ đâu và hiển thị những gì?
- **Bối cảnh và căn cứ:** MVP MB-09: Conditional, cần vị trí, giờ mở, giá, ngày cập nhật. Trang chính thức Nội Bài (R-28): hộp ngủ T2 tầng 2, T1 tầng 3; không có giờ, giá, đơn vị vận hành, ngày cập nhật (bản quyền 2020). A08 ghi “VATC Sleep Pod Terminal 2”.
- **Phương án:**
  - **A.** Chỉ ghi vị trí đã xác minh và thông tin liên hệ của cảng; không giá/giờ.
  - **B.** Loại MB-09 khỏi MVP.
  - **C.** Chờ nguồn có giá và giờ hiện hành.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Không đưa thông tin chưa xác minh; vẫn đáp ứng một phần AC.
- **Tác động:** FR-017, DR-008; UIR-008; CR-10. AC liên quan: AC-033.
- **Hậu quả nếu PO chưa quyết định:** AC của FR-017 (vị trí, giờ mở, giá, ngày cập nhật) không thể thỏa đầy đủ.
- **Truy vết:** OQ-13; G-18; R-16, R-28; CR-10

### D-11 — Danh mục trường hợp miễn trừ theo Điều 40

- **Trạng thái hiện tại:** Deferred · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** Có hiển thị danh mục miễn trừ bồi thường ứng trước không?
- **Bối cảnh và căn cứ:** Điều 40 NĐ 208 (R-19) liệt kê trường hợp miễn trừ bồi thường ứng trước cho hủy và chậm; Airrest không biết được các điều kiện phụ thuộc quan hệ hành khách–hãng (đã thông báo ≥48 giờ, đăng ký liên lạc).
- **Phương án:**
  - **A.** Hiển thị đầy đủ danh mục.
  - **B.** Nêu nguyên tắc “có thể được miễn trừ” kèm liên kết nguồn.
  - **C.** Hoãn đến khi nội dung MB-03 được duyệt.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **C** — Phụ thuộc D-13; tránh hiển thị khi chưa duyệt; danh mục dài, khó đọc khi căng thẳng.
- **Tác động:** FR-005, DR-002; CR-09. AC liên quan: AC-010.
- **Hậu quả nếu PO chưa quyết định:** Không ảnh hưởng luồng cốt lõi.
- **Truy vết:** G-21; R-19; OQ-06, OQ-36; CR-09; D-13

### D-12 — Nguồn FAQ và thông tin liên hệ

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** FAQ và liên hệ trích nguồn nào và ghi ngày nào?
- **Bối cảnh và căn cứ:** MVP MB-10: “chỉ hiển thị FAQ/liên hệ có nguồn; không giả hotline thật”. Vietjet đã cập nhật chính sách theo NĐ 208; Bamboo còn dẫn thông tư cũ (R-21, R-22). Prototype có hotline 1900 1028 không nguồn.
- **Phương án:**
  - **A.** Chỉ trích văn bản pháp luật và trang chính thức kèm ngày truy cập/cập nhật.
  - **B.** Bỏ FAQ (loại MB-10).
  - **C.** Sao chép chính sách từng hãng.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Đúng MVP; chính sách hãng có thể lỗi thời và không phải quy tắc Airrest.
- **Tác động:** FR-018, BR-013, DR-009; UIR-009; CR-08. AC liên quan: AC-034, AC-035.
- **Hậu quả nếu PO chưa quyết định:** MB-10 chưa có nội dung hợp lệ; hotline trong prototype vi phạm AC nếu giữ.
- **Truy vết:** OQ-12; G-20; R-21, R-22; CR-08

### D-16 — Giữ hay loại MB-10 và MB-09 (đang Conditional)

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** Hai tính năng có điều kiện được giữ trong MVP không?
- **Bối cảnh và căn cứ:** MB-09: “chỉ giữ nếu còn capacity”, Sprint S3. MB-10: Could, “Không/giản lược”, “có thể loại khỏi MVP”. Chưa có tiêu chí capacity.
- **Phương án:**
  - **A.** Giữ cả hai ở trạng thái Conditional, quyết định khi lập kế hoạch Sprint.
  - **B.** Loại MB-10.
  - **C.** Loại cả MB-09 và MB-10.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Chưa có dữ liệu capacity; hoãn không làm sai luồng cốt lõi.
- **Tác động:** FR-017, FR-018; UIR-008, UIR-009; MB-09, MB-10. AC liên quan: AC-033, AC-034.
- **Hậu quả nếu PO chưa quyết định:** Hai nhóm yêu cầu giữ Conditional.
- **Truy vết:** OQ-12, OQ-13; G-18, G-20; MVP MB-09, MB-10

### D-19 — Các phần tử prototype không thuộc MVP

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** Giữ hay bỏ các phần tử không truy vết được về MVP?
- **Bối cảnh và căn cứ:** “Lưu nơi nghỉ”, “Xem trên bản đồ” (MB-15 đã loại), “Chỉ còn 1 phòng”, hotline không nguồn, tuyên bố “70 nơi nghỉ”/“phản hồi trong 3 giây” (OQ-27).
- **Phương án:**
  - **A.** Loại bỏ khỏi prototype.
  - **B.** Giữ làm minh họa có nhãn “ngoài MVP”.
  - **C.** Đưa thành yêu cầu.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Tránh thông tin sai (chỉ có 3 cơ sở) và vi phạm phạm vi MVP.
- **Tác động:** UIR-004, UIR-009; FR-010, FR-018. AC liên quan: —.
- **Hậu quả nếu PO chưa quyết định:** Prototype tiếp tục lệch MVP; không ảnh hưởng SRS.
- **Truy vết:** OQ-27; MB-15; src/main.jsx

### D-22 — Quy tắc đầu vào, phân chia S1/S2 và định nghĩa Sprint

- **Trạng thái hiện tại:** Pending PO · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** Quy tắc kiểm tra số hiệu/ngày là gì và S1–S4 nghĩa là gì?
- **Bối cảnh và căn cứ:** MVP: Sprint S1–S4; MB-02 “Tự động hóa hoàn thiện S2”. B04: số hiệu 2 chữ + 1–4 số, ngày ±1; không tìm thấy định nghĩa S1–S4 trong tài liệu đã đọc.
- **Phương án:**
  - **A.** Dùng quy tắc B04; PO cung cấp định nghĩa Sprint.
  - **B.** Không kiểm tra đầu vào ngoài bắt buộc nhập.
  - **C.** PO chọn khác.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Có căn cứ nội bộ và không thêm phạm vi.
- **Tác động:** FR-001, FR-002, FR-004, DR-001. AC liên quan: AC-002, AC-006.
- **Hậu quả nếu PO chưa quyết định:** Phân chia S1/S2 không rõ; lỗi nhập hiển thị không thống nhất.
- **Truy vết:** OQ-22, OQ-23, OQ-28; G-01

### D-24 — Các nhóm phi chức năng chưa có căn cứ

- **Trạng thái hiện tại:** Deferred · **Ưu tiên:** P2
- **Vấn đề cần quyết định:** Prototype có cần chỉ tiêu bảo mật, tương thích trình duyệt, bảo trì, quan sát lỗi không?
- **Bối cảnh và căn cứ:** MVP không nêu; ghi TBD-NFR-01…08.
- **Phương án:**
  - **A.** Không đặt chỉ tiêu cho prototype.
  - **B.** Đặt tối thiểu (HTTPS, trình duyệt hiện đại, ghi lỗi cơ bản).
  - **C.** Hoãn đến giai đoạn sau.
- **Khuyến nghị của agent (chưa phải quyết định):** phương án **A** — Prototype mô phỏng, không có dữ liệu thật; không tự đặt chỉ tiêu.
- **Tác động:** TBD-NFR-01…08. AC liên quan: —.
- **Hậu quả nếu PO chưa quyết định:** Các nhóm này giữ TBD.
- **Truy vết:** OQ-30

## Bảng trả lời của PO

Điền cột cuối (ví dụ `A`). Cột “Khuyến nghị” chỉ để tham khảo.

| ID | Ưu tiên | Lựa chọn có thể | Khuyến nghị | PO trả lời |
|---|---|---|---|---|
| D-01 | P0 | A/B/C/D | A | |
| D-10 | P0 | A/B/C | C | |
| D-13 | P0 | A/B/C | B | |
| OQ-04 | P0 | A/B/C | C | |
| OQ-08 | P0 | A/B/C | A | |
| OQ-14 | P0 | A/B/C | A | |
| OQ-20 | P0 | A/B/C | A | |
| D-25 | P0 | A/B/C | A | |
| D-26 | P0 | A/B/C | A | |
| D-27 | P0 | A/B/C | A | |
| D-02 | P1 | A/B/C | A | |
| D-03 | P1 | A/B/C | A | |
| D-04 | P1 | A/B/C | C | |
| D-05 | P1 | A/B/C | B | |
| D-06 | P1 | A/B/C | A | |
| D-08 | P1 | A/B/C | A | |
| D-14 | P1 | A/B/C | A | |
| D-15 | P1 | A/B/C | A | |
| D-17 | P1 | A/B/C | A | |
| D-18 | P1 | A/B/C | A | |
| D-20 | P1 | A/B/C | A | |
| D-21 | P1 | A/B/C | A | |
| D-23 | P1 | A/B/C | B | |
| D-28 | P1 | A/B/C | A | |
| D-29 | P1 | A/B/C | A | |
| D-03* | P2 | A/B/C | A | |
| D-07 | P2 | A/B/C | A | |
| D-09 | P2 | A/B/C | A | |
| D-11 | P2 | A/B/C | C | |
| D-12 | P2 | A/B/C | A | |
| D-16 | P2 | A/B/C | A | |
| D-19 | P2 | A/B/C | A | |
| D-22 | P2 | A/B/C | A | |
| D-24 | P2 | A/B/C | A | |

Ví dụ: `D-01 = A`, `OQ-08 = A`, `OQ-14 = A`.

## Phụ lục: bao phủ câu hỏi mở

| OQ mở | Quyết định trong sổ này |
|---|---|
| OQ-04 | OQ-04, D-02 |
| OQ-05 | D-14 |
| OQ-06 | D-01, D-10, D-13, D-11 |
| OQ-07 | D-01 |
| OQ-08 | OQ-08, D-04 |
| OQ-09 | D-03 |
| OQ-10 | D-15 |
| OQ-11 | D-15 |
| OQ-13 | D-09, D-16 |
| OQ-14 | OQ-14 |
| OQ-15 | D-23 |
| OQ-16 | D-20 |
| OQ-17 | D-20 |
| OQ-18 | D-18 |
| OQ-19 | D-13 |
| OQ-20 | OQ-20 |
| OQ-21 | OQ-08, D-17 |
| OQ-22 | D-08, D-22 |
| OQ-23 | D-22 |
| OQ-24 | D-21 |
| OQ-25 | D-21 |
| OQ-26 | D-21 |
| OQ-27 | D-19 |
| OQ-28 | D-22 |
| OQ-30 | D-24 |
| OQ-31 | D-01, D-05 |
| OQ-32 | D-06 |
| OQ-33 | OQ-08, D-04 |
| OQ-34 | D-03, D-03* |
| OQ-36 | D-10, D-11 |
| OQ-37 | D-13 |
| OQ-38 | D-25 |
| OQ-39 | D-26 |
| OQ-40 | D-27 |
| OQ-41 | D-28 |
| OQ-42 | D-29 |

Các OQ đã được chốt theo MVP (OQ-01, 02, 03, 12*, 29) hoặc đã giải quyết bằng nguồn chính thức (OQ-35) không có mục riêng. (*OQ-12 vẫn có D-12 và D-16 vì MB-10 còn Conditional.)

