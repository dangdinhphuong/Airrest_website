# Research and Gap Analysis — Airrest website

Phiên bản v0.5 · 2026-10-26 · Ngày truy cập các URL: 2026-10-26. Kèm theo `SRS.md`, `RTM.md`, `OPEN_QUESTIONS.md`, `SRS_REVIEW.md`.

## 0. Phương pháp, phân loại và giới hạn

Thứ tự tìm: (1) `docs/MVP.md`; (2) tài liệu nội bộ trong `Airrest_website` (`BTHQUAN/` B00, B03, B04, `00_DOC_TRUOC.txt`; B01 và B02 đọc có chọn lọc; `src/main.jsx`; dữ liệu A08 chỉ xem tiêu đề cột); (3) nghiên cứu bên ngoài khi hai cấp trên chưa trả lời.

| Loại thông tin | Nghĩa |
|---|---|
| CONFIRMED | Có trong nguồn có thẩm quyền (MVP) |
| INFERRED | Suy luận có căn cứ từ tài liệu nội bộ (B03, B04, B02, prototype) |
| EXTERNALLY_RESEARCHED | Từ nguồn bên ngoài; chưa được Airrest chấp thuận |
| TBD | Chưa đủ căn cứ |

Giới hạn quan trọng:

- Từ v0.4, văn bản pháp lý chính được đọc từ bản chính thức: NĐ 208/2026/NĐ-CP (PDF ký số trên chinhphu.vn, dạng ảnh quét nên đọc bằng cách xem ảnh trang 30–36), TT 48/2026/TT-BXD, Luật 91/2025/QH15 (Công báo) và một phần NĐ 356/2025/NĐ-CP. Nội dung nào đã/chưa xác minh được liệt kê ở mục E.
- Chưa xác minh bản chính thức: Luật Hàng không dân dụng 130/2025/QH15 Điều 53 (chỉ nguồn thứ cấp); các điều khác của NĐ 208 ngoài Điều 30–31, 35–40; danh mục dữ liệu cá nhân của NĐ 356; việc bãi bỏ TT 81/2014 và TT 14/2015. Báo chí không được dùng để kết luận điều kiện hưởng quyền lợi.
- Một số trang không mở được (W3C 403, thuvienphapluat.vn 403, moc.gov.vn và g7.cdnchinhphu.vn lỗi chứng chỉ, EUR-Lex trả về trống, transport.ec.europa.eu 404). Cột “Mở” trong research log ghi rõ F (đã mở và đọc), P (một phần), S (chỉ dựa trên kết quả tìm kiếm).
- Thông lệ nước ngoài (Anh, EU, Mỹ) chỉ để so sánh, không phải quy định áp dụng cho chuyến bay nội địa Việt Nam. Chính sách của một hãng không được coi là quy tắc của Airrest.
- Không tải hay chạy mã bên ngoài, không tích hợp dịch vụ nào, không sửa phạm vi MVP.

## A. Gap Register

| Gap ID | Chủ đề | Nội dung MVP còn thiếu | Kết quả tìm trong nội bộ | Kết quả nghiên cứu bên ngoài | Trạng thái | Mức xác minh | Đề xuất |
|---|---|---|---|---|---|---|---|
| G-01 | Điều kiện xác định chuyến bay chậm hoặc hủy | MB-01/02: hiển thị giờ cũ/mới và trạng thái; không định nghĩa “chậm”, “hủy”. | B04 DR ChuyenBay.trang_thai ∈ {Đúng giờ, Chậm, Huỷ}; B03 FR-04 dùng mốc 2/3/4/6 giờ. Prototype không tính (dữ liệu cố định). | NĐ 208/2026 (bản chính thức, R-19): Điều 36 k1–k2 — chậm chuyến = đi thực tế muộn hơn 15 phút so với lịch bay căn cứ (bản cập nhật đến 15h00 ngày trước); chậm kéo dài = từ 4 giờ. Điều 39 k1 — hủy chuyến = không thực hiện chuyến bay có ≥1 hành khách đã xác nhận chỗ và có vé; đổi số hiệu vì đảm bảo hoạt động bay hoặc theo yêu cầu cơ quan có thẩm quyền không bị coi là hủy. [R-19, R-02] | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19) | SRS đặc tả hệ thống nhận trạng thái chuyến bay từ D1 (mô phỏng), không tự suy ngưỡng 15 phút. “Giờ dự kiến ban đầu” trong thẻ trạng thái nên được hiểu là giờ theo lịch bay căn cứ. Cần chủ sản phẩm duyệt cách gọi tên trường (CR-12). |
| G-02 | Điều kiện hành khách đủ điều kiện được hỗ trợ lưu trú | MB-03: quyền lợi có mốc, nguồn, điều kiện; không kết luận khi nguyên nhân chưa rõ (Blocked). MB-11: không nêu điều kiện gửi đề nghị. | B03 FR-21, UC-009: đủ điều kiện khi chậm ≥6 giờ hoặc khung 22h–7h, nguyên nhân thuộc trách nhiệm hãng. B04 UC02. Prototype: nút gửi vô điều kiện (main.jsx:249–253). | NĐ 208/2026 (bản chính thức, R-19): Điều 36 k7 — chậm ≥6 giờ: 7h–22h nơi nghỉ phù hợp điều kiện cảng; 22h–7h chỗ ngủ, nghỉ hoặc giải pháp thay thế nếu hành khách đồng ý; không áp dụng nếu hành khách chấp nhận hoàn vé. Điều 36 k8 — chỉ áp dụng cho hành khách có vé, đã xác nhận chỗ và có mặt tại cảng. Điều 36 k6d — điều kiện “lỗi người vận chuyển” chỉ gắn với hoàn vé và bồi thường ứng trước (k6 b, c); k7 không có điều kiện lỗi. Điều 39 k3c — hủy chuyến: chăm sóc (≥6 giờ chờ: nơi ở theo khung giờ) trừ khi lỗi của hành khách hoặc đã yêu cầu hoàn vé. Luật 130/2025 Điều 53 k2d (thứ cấp, R-20): khi chậm/hủy không do lỗi hành khách, hãng phải bảo đảm ăn, nghỉ, đi lại. Anh/EU: khách sạn qua đêm không phụ thuộc nguyên nhân (R-08, R-09). [R-19, R-20, R-08, R-09] | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19); Luật 130 chỉ thứ cấp (R-20) | Điều kiện hưởng nơi nghỉ theo các điều đã đọc: (1) chậm ≥6 giờ (Điều 36 k7) hoặc hủy chuyến và chờ ≥6 giờ tại cảng (Điều 39 k3c); (2) có vé, đã xác nhận chỗ, có mặt tại cảng (Điều 36 k8); (3) không áp dụng nếu hành khách chấp nhận hoàn vé (Điều 36 k7c; Điều 39 k3c nêu “đã yêu cầu hoàn vé”). Điều kiện “không do lỗi hành khách” chỉ thấy rõ ở Điều 39 k3c (hủy chuyến, bản chính thức) và Luật 130 Điều 53 k2d (thứ cấp, chưa xác minh). Khung 22h–7h đổi loại nơi nghỉ. Điều 36 k7 không ghi điều kiện “lỗi hãng” (k6d chỉ nêu cho k6 b, c); tuy nhiên k7a dẫn “thực hiện theo khoản 6” nên cách hiểu này là diễn giải của người soạn, cần pháp chế xác nhận. B03 FR-21 (≥6 giờ hoặc 22h–7h, và lỗi hãng) chưa khớp văn bản đã đọc. Airrest không phải bên thực hiện nghĩa vụ; đề xuất chỉ hiển thị điều kiện, không chặn việc gửi đề nghị (D-01, CR-01). Chờ phê duyệt của chủ sản phẩm. |
| G-03 | Xác minh thông tin chuyến bay và hành khách | MB-07/MB-19: không thu SĐT/email và dữ liệu ngoài phạm vi; MVP không nêu xác minh vé hay có mặt tại sân bay. | B04 mục 6.1: không thu mã đặt chỗ hãng, họ tên thật; prototype chỉ có “tên gọi”. | NĐ 208/2026 Điều 36 k8 (R-19): nghĩa vụ ăn, uống, nghỉ chỉ áp dụng cho hành khách có vé, đã xác nhận chỗ và có mặt tại cảng hàng không. Việc xác minh thuộc hãng. [R-19] | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19 Điều 36 k8) | Vì Airrest không thu mã đặt chỗ và không tích hợp hãng, không thể xác minh thật; đề xuất hiển thị 3 điều kiện kèm xác nhận tự khai (mô phỏng) trước khi gửi đề nghị. Cần chủ sản phẩm duyệt. |
| G-04 | Quy trình tìm kiếm, lựa chọn nơi lưu trú và ai trả tiền | MB-05/07/14: L1 tự chi trả; L2 đề nghị hãng; chuyển L2→L1. | B03 mục 6.4; B02: hành trình lưu trú 4 chặng. | Anh: hãng tự sắp xếp, hoặc yêu cầu hành khách đặt qua website/ứng dụng của hãng, hoặc hành khách tự lo và đòi lại với hóa đơn (R-08). Mỹ: voucher tự động hoặc theo yêu cầu, hoàn chi phí hợp lý (R-11, nguồn cũ). [R-08, R-09, R-11] | EXTERNALLY_RESEARCHED | Quy định nước ngoài (regulator) và báo chí; không có quy định Việt Nam về cách sắp xếp lưu trú | Mô hình L1 (tự lo) và L2 (hãng sắp xếp) của MVP khớp thông lệ; giữ nguyên. Việc đòi lại chi phí cần hóa đơn nên liên quan MB-15 (chứng từ) — xem D-07. |
| G-05 | Khả năng còn phòng và thời hạn giữ phòng | MB-05: lọc “còn phòng/giờ lễ tân”; MB-06: nêu giờ lễ tân; không có khái niệm giữ phòng. | B04 UC04: nhận khách ngay = giờ nhận phòng cuối > giờ hiện tại hoặc lễ tân 24/24; dữ liệu >30 phút là cũ. B02/A08: 67% (HAN) và 68% (SGN) cơ sở ghi lễ tân 24/24; chưa gọi xác minh giờ lễ tân. | Không tìm được nguồn chính thức về giữ phòng khi đến muộn (R-18). [R-18] | TBD | Không có nguồn | Không đặc tả “thời hạn giữ phòng”. Giữ quy tắc B04 về “nhận khách ngay” ở mức Proposed và yêu cầu hiển thị thời điểm cập nhật dữ liệu. Chủ sản phẩm quyết định có cần khái niệm giữ phòng trong mô phỏng không. |
| G-06 | Xác nhận, từ chối hoặc hết hạn yêu cầu hỗ trợ | MB-11–13: trạng thái chờ; hãng duyệt/từ chối có lý do; cơ sở xác nhận/từ chối ≤3 đề xuất. Không nêu thời hạn trả lời. | B03 mục 6.4 (8 trạng thái); B04 UC11 E1: hãng không phản hồi sau 15 phút (mô phỏng) → gợi ý tự chi trả. | Đã đọc NĐ 208 Điều 36–40 và TT 48 Điều 3–8: không có thời hạn hãng phải phản hồi một đề nghị lưu trú; thời hạn có trong văn bản chỉ dành cho hoàn vé (TT 48 Điều 4), bồi thường ứng trước (Điều 6: yêu cầu ≤90 ngày, hãng xử lý ≤21 ngày) và khiếu nại (Điều 7.2: 7 ngày). Văn bản cũng không định nghĩa “đề nghị hỗ trợ lưu trú” như một thủ tục: nghĩa vụ của hãng phát sinh trực tiếp. Anh: hãng có thể tự sắp xếp hoặc yêu cầu hành khách tự đặt (R-08). [R-01, R-19, R-08] | INFERRED | Đã đọc Điều 36–40 NĐ 208 và Điều 3–8 TT 48: không có thời hạn phản hồi cho đề nghị lưu trú (chưa đọc toàn bộ văn bản) | Giữ các trạng thái của B03 như đề xuất; “hết hạn sau 15 phút” là tham số mô phỏng của B04, không phải quy định. Không dùng thời hạn bồi thường để suy ra thời hạn lưu trú. |
| G-07 | Phân bổ phòng, số khách và thời gian lưu trú | Không có trường số khách, số phòng, số đêm; MB-06 yêu cầu “giá tổng nhất quán”. | B02: dữ liệu A08 lấy giá cho 1 đêm, 2 người lớn, VND; B04: phòng gia đình, thuê theo giờ; prototype: “Giá tổng / đêm”. | Không nghiên cứu ngoài (không có quy định liên quan). | INFERRED | Không có nguồn ngoài | Không thêm trường nhập số khách/phòng/đêm vào MVP. Ghi rõ giả định của dữ liệu mô phỏng (1 phòng, 1 đêm, 2 người lớn theo A08) trên giao diện để “giá tổng” không gây hiểu nhầm. Cần chủ sản phẩm duyệt. |
| G-08 | Xử lý khi không còn chỗ hoặc nhà cung cấp từ chối | MB-13: cơ sở từ chối → tối đa 3 đề xuất; MB-12/14: chuyển tự chi trả. | B02: cụm khách sạn quanh sân bay dễ hết phòng khi hủy hàng loạt (>1.200 khách đêm 11–12/6/2025); B03 FR-23. | Anh/Mỹ: nếu hãng không lo được thì hành khách tự lo và đòi lại với hóa đơn (R-08, R-09, R-11). [R-08, R-09, R-11] | EXTERNALLY_RESEARCHED | Quy định nước ngoài (regulator) | MVP đã có lối thoát (3 đề xuất, tự chi trả). Đề xuất bổ sung khi hết phòng hoàn toàn: gợi ý nhà ga (nếu MB-09 giữ) — chỉ là Proposed. |
| G-09 | Thay đổi, hủy hoặc hết hiệu lực yêu cầu/đặt chỗ | MB-14: xử lý giờ bay mới; không có hủy đặt chỗ, không có hết hiệu lực. | B04 UC14 A1, UC15 A1–A2 (hủy mô phỏng, gợi ý hủy). | TT 48: chuyến bị hủy → hoàn vé (Điều 4); chậm ≥4 giờ rồi hủy → bồi thường một lần (Điều 5.4). Không có quy định về hủy phòng khách sạn. [R-01] | TBD | Đã xác minh một phần (R-01, R-19) | Không đặc tả hủy đặt chỗ vì MVP không quy định. Giờ bay đổi chỉ tính lại giờ rời và gắn nhãn (theo MVP). |
| G-10 | Công thức thời gian nghỉ và giờ có mặt tại sân bay | MB-04, MB-08: “tính đúng”, “giải thích”; không có công thức. | B03: giờ có mặt trước bay 120 phút, trừ 2×thời gian đi; B04/B02: 90 phút mặc định, dự phòng 60 phút; KT-10: có mặt 07:30 cho chuyến 09:00. Prototype: có mặt 04:00 cho chuyến 06:00. | TT 48 Điều 8.1: mở quầy nội địa ≥2 giờ, đóng quầy 40 phút trước giờ đi; đóng cửa ra tàu bay không sớm hơn 15 phút trước giờ đi. Vietnam Airlines nêu cùng mốc (R-07). (đã đối chiếu bản chính thức TT 48 Điều 8.1b ở R-01). [R-01, R-07] | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-01 Điều 8.1) | Mốc pháp lý tối thiểu là 40 phút (đóng quầy), nên cả 90 và 120 phút đều hợp lệ. Đề xuất coi “giờ có mặt trước giờ bay” và “dự phòng” là tham số cấu hình, không hard-code; giá trị mặc định do chủ sản phẩm chọn (đề xuất 120 phút vì dư xa mốc 40 phút). |
| G-11 | Thông báo trạng thái và cập nhật giờ bay cho người dùng | MB-02: thẻ trạng thái, banner đổi giờ; “tự động hóa hoàn thiện S2”. | B03 FR-03 dẫn nguồn S03: cập nhật ≥30 phút/lần. | NĐ 208/2026 Điều 36 k3b (bản chính thức, R-19): hãng cập nhật thời gian đi dự kiến mới cho người khai thác cảng và nhà ga để hiển thị trên FIDS với tần suất ít nhất 30 phút/lần. TT 48 Điều 7.1: hãng cung cấp nguyên nhân cho cảng để cập nhật FIDS (R-01). [R-19, R-01] | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19 Điều 36 k3b) | Dùng 30 phút làm tham số mặc định tham khảo cho tần suất làm mới dữ liệu mô phỏng và ngưỡng “dữ liệu cũ”; luôn hiển thị “cập nhật lúc”. Cần chủ sản phẩm duyệt. |
| G-12 | Kênh nhắc giờ và phương án thay thế | MB-08: “fallback lịch”, nhắc theo giờ rời. | B03 FR-13: thông báo trình duyệt/SMS/lịch; B04 UC07: thông báo trình duyệt/lịch. | Notification API cần HTTPS, xin quyền khi người dùng bấm, trạng thái default coi như denied, không phải Baseline (R-13). Nhắc khi trang đóng cần service worker + Push API + máy chủ gửi push qua dịch vụ push của trình duyệt; endpoint là URL bí mật (R-26). showNotification cần service worker; không có cơ chế lập lịch hiển thị được tài liệu hóa (R-27). iOS cần 16.4+ và phải thêm vào Màn hình chính (R-25). iCalendar (RFC 5545) là định dạng lịch chuẩn (R-14); chưa kiểm chứng khả năng đặt báo thức trong tệp lịch. [R-13, R-14, R-25, R-26, R-27] | EXTERNALLY_RESEARCHED | Tài liệu chuẩn kỹ thuật (MDN, WebKit); chưa thử nghiệm | Nhắc nền khi đóng trang bắt buộc phải có máy chủ gửi push (hạ tầng ngoài phạm vi MVP hiện tại) nên bị chặn. Trong MVP: nhắc khi trang còn mở (thông báo trình duyệt khi người dùng cấp quyền, kèm nhắc trong trang) và tệp lịch iCalendar để người dùng tự đặt nhắc trong ứng dụng lịch của họ (cần thử nghiệm khi triển khai). Loại SMS. Chủ sản phẩm cần chấp nhận giới hạn này (D-03). |
| G-13 | Quyền hạn từng actor và trạng thái xử lý nghiệp vụ | MB-12/13: “Phản hồi mô phỏng”; MB-14: “Cần state machine”. | B04 mục 1: hãng và cơ sở là tác nhân phụ mô phỏng; không có actor quản trị. | Không nghiên cứu ngoài: thuộc thiết kế mô phỏng của Airrest. | TBD | Không có nguồn ngoài | Giữ nguyên: một actor người dùng thật (hành khách); ba actor mô phỏng. Cơ chế kích hoạt phản hồi mô phỏng cần chủ sản phẩm quyết định. |
| G-14 | Xử lý dữ liệu cá nhân | MB-19: không thu dữ liệu ngoài phạm vi; MB-07: không SĐT/email. | B04 mục 6.1: danh sách dữ liệu không thu; “tên gọi” chỉ trong phiên; B03 NFR-05 viện dẫn Luật 91/2025/QH15, NĐ 356/2025. | Luật 91/2025/QH15 (bản chính thức, R-23): Điều 2.1 dữ liệu cá nhân là dữ liệu “xác định hoặc giúp xác định một con người cụ thể”; Điều 9 điều kiện đồng ý (tự nguyện, biết rõ loại dữ liệu/mục đích/bên kiểm soát/quyền; theo từng mục đích; im lặng không phải đồng ý); Điều 19.1 các trường hợp không cần đồng ý. NĐ 356/2025 (R-24, chỉ đọc một phần): Điều 5 thời hạn xử lý yêu cầu (phản hồi 2 ngày làm việc, thực hiện 10–20 ngày); Điều 6.1 phương thức đồng ý phải kiểm chứng được. Chưa đọc danh mục dữ liệu cơ bản/nhạy cảm của NĐ 356. [R-23, R-24] | EXTERNALLY_RESEARCHED | Luật 91/2025 đã xác minh (R-23); NĐ 356 xác minh một phần (R-24) | Giữ nguyên nguyên tắc “không thu dữ liệu cá nhân”. “Tên gọi” chưa chắc là dữ liệu cá nhân (phụ thuộc có xác định được một người hay không) nên chưa kết luận; giữ lưu trữ chỉ trong phiên. Nếu sau này thu SĐT, tên thật hoặc mã đặt chỗ thì cần đồng ý theo Điều 9 và rà soát pháp lý. Chưa tạo yêu cầu pháp lý nào trong SRS. |
| G-15 | Lỗi hệ thống và các trường hợp bất thường | Không nêu; MB-18 chỉ có hiệu năng. | B04: ngoại lệ E1/E2 trong từng UC (không tìm thấy, mất mạng, dữ liệu cũ, phòng vừa hết); KT-16, KT-19, KT-20. | Không nghiên cứu ngoài. | INFERRED | Không có nguồn ngoài | Giữ các ngoại lệ B04 như AC mức Proposed (đã có trong SRS). Không đặt yêu cầu giám sát/ghi log khi MVP chưa nêu. |
| G-16 | Khả năng tiếp cận và vùng chạm | MB-17: “nội dung rõ”; NFR-02 được tham chiếu nhưng không có số đo. | B03 NFR-02: WCAG 2.2 AA, tương phản 4,5:1, vùng chạm ≥24×24 px. | WCAG 2.2 SC 2.5.8 (AA): ≥24×24 CSS px, có ngoại lệ (R-15). Mức tương phản chưa kiểm chứng trong phiên. [R-15] | EXTERNALLY_RESEARCHED | Kết quả tìm kiếm (W3C không mở được) | Giữ AC B03 ở mức Proposed; vùng chạm 24 px khớp tiêu chuẩn W3C. Chủ sản phẩm quyết định có chọn WCAG 2.2 AA làm mục tiêu không. |
| G-17 | Nội dung quyền lợi (kiểm chứng B03 FR-04) và Blocked của MB-03/MB-20 | MB-03 Blocked “Phải kiểm chứng văn bản gốc”; MB-20 Blocked. | B03 FR-04; 00_DOC_TRUOC: chờ kiểm chứng toàn văn NĐ 208/2026 và số khoản. | Đã đối chiếu bản chính thức NĐ 208/2026 Điều 36–40 và TT 48 Điều 4–8 (R-19, R-01). Xem bảng C.1: nội dung B03 FR-04 phần lớn khớp, nhưng 22h–7h không phải điều kiện độc lập, điều kiện “lỗi hãng” không được ghi cho nơi nghỉ ở k7 (diễn giải, cần pháp chế xác nhận), và Điều 40 nói về miễn trừ bồi thường ứng trước. [R-01, R-19, R-02, R-03, R-04] | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-01, R-19) | Giá trị pháp lý đã xác minh được ghi nhận làm tham khảo ở DR-002. Trạng thái Blocked của MB-03/MB-20 do MVP đặt nên chỉ chủ sản phẩm gỡ; SRS không tự gỡ. |
| G-18 | Dữ liệu tiện ích nhà ga (MB-09) | MB-09: có điều kiện; hiển thị vị trí, giờ mở, giá, ngày cập nhật. | B04 UC08, A08: “VATC Sleep Pod Terminal 2”. | Trang chính thức của cảng Nội Bài (R-28): hộp ngủ ở T2 tầng 2 và T1 tầng 3; không nêu giờ, giá, đơn vị vận hành; không có ngày cập nhật (bản quyền 2020). Nguồn 2014 (R-16) chỉ nói T1. [R-16, R-28] | TBD | Trang chính thức của cảng (R-28): vị trí đã xác minh, giá/giờ chưa | Chỉ ghi vị trí đã xác minh (T1 tầng 3, T2 tầng 2); giá, giờ mở, đơn vị vận hành chờ nguồn hiện hành. Mỗi bản ghi tiện ích phải có “ngày cập nhật” như MVP đã yêu cầu (D-09). |
| G-19 | Phân biệt nghĩa vụ pháp lý của hãng với chính sách vận hành của Airrest | MB-11–13: Airrest tạo “đề nghị hãng hỗ trợ” với phản hồi mô phỏng. | B03 mục 6.4 mô tả L2 như một quy trình duyệt/từ chối của hãng. | Văn bản chính thức đặt nghĩa vụ trực tiếp lên hãng (Điều 36 k7, Điều 39 k3) và không quy định thủ tục “đề nghị hỗ trợ lưu trú”; Luật Điều 53 k2d (thứ cấp) tương tự. Hãng có thể tự sắp xếp hoặc cho hành khách tự đặt (R-08). [R-19, R-20, R-21] | INFERRED | Đã xác minh bản chính thức (R-19) và trang hãng (R-21, R-22) | Luồng L2 là cơ chế mô phỏng của Airrest, không phải thủ tục pháp lý; SRS không được phát biểu rằng người dùng “phải gửi đề nghị” để được hưởng quyền. Các điều kiện pháp lý chỉ được hiển thị như thông tin. Trạng thái “hãng từ chối” là tình huống mô phỏng, không đại diện quyết định pháp lý của hãng. |
| G-20 | Độ tin cậy của chính sách công bố của từng hãng | MB-10: FAQ/liên hệ phải có nguồn; không giả hotline. | Prototype hiển thị hotline 1900 1028 không có nguồn (main.jsx:261). | Vietjet đã cập nhật chính sách theo NĐ 208/TT 48 (R-21); Bamboo vẫn dẫn TT 14/2015 và 27/2017, không dẫn Nghị định (R-22). Chính sách của một hãng không phải quy tắc của Airrest. [R-21, R-22] | EXTERNALLY_RESEARCHED | Trang chính thức của hãng (R-21, R-22) | Nội dung FAQ/liên hệ phải trích văn bản pháp luật hoặc trang chính thức kèm ngày truy cập/cập nhật; không sao chép chính sách hãng khi chưa đối chiếu văn bản hiện hành (D-12, CR-08). |
| G-21 | Điều kiện miễn trừ bồi thường ứng trước ảnh hưởng nội dung hiển thị | MB-03: không kết luận quyền lợi khi nguyên nhân chưa rõ. | B04 UC02 A1: nguyên nhân bất khả kháng → ghi rõ phần không áp dụng (Điều 40). | Điều 40 NĐ 208 (R-19) có tiêu đề và nội dung về miễn trừ bồi thường ứng trước không hoàn lại (thời tiết, an ninh, quyết định cơ quan nhà nước, sự cố kỹ thuật, đã thông báo ≥48 giờ, không đăng ký thông tin liên lạc, …); không đề cập việc miễn nghĩa vụ ăn, nghỉ tại Điều 36 k7/Điều 39 k3c. Điều kiện “đã thông báo/không đăng ký liên lạc” phụ thuộc quan hệ giữa hành khách và hãng, Airrest không biết được. [R-19, R-21] | EXTERNALLY_RESEARCHED | Đã xác minh bản chính thức (R-19 Điều 40) | Quy tắc “nguyên nhân chưa rõ thì không kết luận” của MVP chỉ hợp lý cho hoàn vé và bồi thường; áp dụng cho ăn/nghỉ sẽ che mất quyền có thật (D-10, OQ-36). Việc hiển thị danh mục miễn trừ nên hoãn đến khi nội dung quyền lợi được duyệt (D-11). |

Yêu cầu và câu hỏi liên quan từng gap:

| Gap | Yêu cầu SRS | Câu hỏi mở |
|---|---|---|
| G-01 | FR-001, FR-002, FR-003 | OQ-23 |
| G-02 | FR-005, FR-019 | OQ-06, OQ-07, OQ-31, OQ-36 |
| G-03 | FR-019, NFR-005 | OQ-31, OQ-18 |
| G-04 | FR-008, FR-012, FR-013, FR-022 | OQ-03, OQ-11 |
| G-05 | FR-008, FR-011, FR-012 | OQ-25, OQ-33 |
| G-06 | FR-019, FR-020, FR-021 | OQ-08, OQ-21, OQ-33 |
| G-07 | FR-011, FR-012, DR-004 | OQ-32 |
| G-08 | FR-021, FR-022 | OQ-03 |
| G-09 | FR-016, FR-022, FR-023, DR-005 | OQ-29, OQ-08 |
| G-10 | FR-006, FR-014, FR-016, FR-023 | OQ-04, OQ-34 |
| G-11 | FR-003, FR-004, NFR-007 | OQ-22 |
| G-12 | FR-014, FR-015 | OQ-09, OQ-34 |
| G-13 | FR-019, FR-020, FR-021, IFR-002 | OQ-21, OQ-08 |
| G-14 | NFR-005, FR-012 | OQ-18 |
| G-15 | FR-001, FR-003, FR-008, FR-012, UIR-011 | OQ-30 |
| G-16 | NFR-003 | OQ-16 |
| G-17 | FR-005, DR-002, NFR-008, NFR-009 | OQ-06, OQ-19, OQ-37 |
| G-18 | FR-017, DR-008 | OQ-13 |
| G-19 | FR-005, FR-019, FR-020, FR-021 | OQ-31, OQ-36 |
| G-20 | FR-018, BR-013 | OQ-12 |
| G-21 | FR-005, DR-002 | OQ-06, OQ-36 |

Các nhóm trong danh mục kiểm tra mà MVP/Airrest không liên quan, nên không phân tích: xác thực hành khách bằng mã đặt chỗ thật, phân bổ phòng thật, thanh toán thật, tích hợp hãng/khách sạn (đều ngoài MVP).

## B. External Research Log

| Research ID | Câu hỏi nghiên cứu | Nguồn | URL | Ngày truy cập | Phát hiện chính | Mức độ liên quan |
|---|---|---|---|---|---|---|
| R-01 | Thông tư 48/2026/TT-BXD: mức bồi thường ứng trước, thời hạn hoàn vé, thời hạn yêu cầu, giờ mở/đóng quầy nội địa? | Bộ Xây dựng — Thông tư 48/2026/TT-BXD (bản ký số trên chinhphu.vn) — OFFICIAL · F (đã trích văn bản bằng pdftotext) | https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/48-bxd.signed.pdf | 2026-10-26 | Điều 4: hoàn vé tiền mặt/chuyển khoản ≤21 ngày, voucher ≤14, thẻ ≤45, đại lý ≤30; hành khách đề nghị hoàn vé ≤60 ngày. Điều 5.1: nội địa 220.000đ (<500 km), 330.000đ (500–<1.000 km), 440.000đ (≥1.000 km); Điều 5.4: chậm ≥4 giờ rồi hủy chỉ bồi thường một lần. Điều 6.2: yêu cầu bồi thường ≤90 ngày, hãng thực hiện ≤21 ngày hoặc nêu lý do từ chối. Điều 7.1–7.2: hãng cung cấp nguyên nhân cho cảng để cập nhật FIDS; trả lời khiếu nại ≤7 ngày. Điều 8.1: mở quầy nội địa ≥2 giờ, đóng quầy 40 phút trước giờ đi dự kiến; giờ đóng cửa ra tàu bay không sớm hơn 15 phút trước giờ đi. | Cao |
| R-02 | Nghị định 208/2026/NĐ-CP: định nghĩa chậm chuyến, mốc nghĩa vụ (2h/3h/4h/6h), lịch bay căn cứ? | Vietstock (đăng lại tin báo chí) — PRESS · F | https://vietstock.vn/2026/06/hanh-khach-bi-cham-huy-chuyen-bay-duoc-boi-thuong-the-nao-theo-quy-dinh-moi-4265-1455116.htm | 2026-10-26 | NĐ 208/2026/NĐ-CP ban hành 15/6/2026, hiệu lực 1/7/2026. Chậm chuyến: đi thực tế muộn hơn 15 phút so với lịch bay căn cứ (bản cập nhật đến 15h ngày trước ngày khai thác). Chậm ≥4 giờ là “chậm kéo dài”. Mọi trường hợp chậm: thông báo kịp thời, xin lỗi, nêu lý do; cập nhật giờ bay dự kiến cho cảng ít nhất 30 phút/lần. Từ 2 giờ: nước uống; từ 3 giờ: đồ ăn; từ 4 giờ: hoàn vé và bồi thường ứng trước; từ 6 giờ: nơi nghỉ (22h–7h: chỗ ngủ hoặc giải pháp thay thế được hành khách đồng ý). Bài báo không nêu số Điều/khoản và không nêu miễn trừ bất khả kháng. | Cao |
| R-03 | Nghị định 208/2026: điều kiện áp dụng nghĩa vụ nơi nghỉ và quan hệ với lỗi hãng? | VTV (tin báo chí) — PRESS · F | https://vtv.vn/phai-lo-an-uong-cho-nghi-va-boi-thuong-cho-khach-khi-chuyen-bay-cham-huy-100260616224757378.htm | 2026-10-26 | Điều 36 khoản 7 điểm b: chậm ≥6 giờ — 7h–22h bố trí “nơi nghỉ phù hợp với điều kiện thực tế của cảng hàng không”; 22h–7h bố trí “chỗ ngủ, nghỉ phù hợp với điều kiện thực tế của địa phương” hoặc giải pháp thay thế nếu hành khách đồng ý. Khoản 7 điểm c: không áp dụng nếu hành khách chấp nhận hoàn vé. Khoản 8: chỉ áp dụng cho hành khách “có vé, đã xác nhận chỗ và có mặt tại cảng hàng không”. Khoản 6 điểm d: hoàn vé và bồi thường ứng trước chỉ khi chậm do lỗi người vận chuyển; phần nơi nghỉ (khoản 7) không ghi điều kiện lỗi trong trích dẫn. Điều 39 khoản 1: hủy chuyến = không thực hiện chuyến bay có ≥1 hành khách đã xác nhận chỗ và có vé; khoản 3: chăm sóc trừ khi lỗi hành khách hoặc hành khách yêu cầu hoàn vé, chờ ≥6 giờ áp dụng khung giờ như Điều 36 khoản 7. [Đối chiếu v0.4: khớp bản chính thức ở R-19, trừ cách diễn đạt “không ghi điều kiện lỗi”.] | Cao |
| R-04 | Nghị định 208/2026: xác nhận cấu trúc khoản 5, 6 Điều 36 (ăn uống, hoàn vé, bồi thường)? | Luatvietnam (tin pháp luật) — PRESS · F | https://luatvietnam.vn/tin-van-ban-moi/tu-01-7-2026-hanh-khach-duoc-hoan-tien-ve-neu-chuyen-bay-cham-tu-4-gio-tro-len-do-loi-hang-hang-khong-186-109627-article.html | 2026-10-26 | Khoản 5: chậm ≥3 giờ phục vụ đồ ăn hoặc voucher tương đương. Khoản 6 điểm b: chậm ≥4 giờ hoàn toàn bộ tiền vé hoặc phần chưa sử dụng nếu hành khách không đồng ý phương án đổi; điểm c: bồi thường ứng trước không hoàn lại, một lần mỗi chuyến, gồm chậm có hành khách trên khoang (Điều 38); điểm d: chỉ khi do lỗi người vận chuyển. Trang không chép Điều 36–40. | Trung bình |
| R-05 | Nghị định 208/2026: có bản gốc/toàn văn trên nguồn chính thức không? | Bộ Xây dựng (thông cáo, qua kết quả tìm kiếm); thuviennhadat.vn (bản sao) — OFFICIAL · S (moc.gov.vn lỗi chứng chỉ khi mở) ; 3P · P (bản sao chỉ có đoạn trích) | https://moc.gov.vn/vn/tin-tuc/1176/94969/xay-dung-thong-cao-bao-chi-doi-voi-nghi-dinh-so-2082026nd-cp-ngay-1562026-cua-chinh-phu-ve-van-tai-hang-khong-nghi-dinh-so-208.aspx ; https://thuviennhadat.vn/vbpl/nghi-dinh-208-2026-nd-cp-van-tai-hang-khong-710765.html | 2026-10-26 | [Cập nhật v0.4] Đã lấy được bản chính thức ở R-19; mục này chỉ còn giá trị lịch sử. Trước đó: thông cáo BXD (qua tìm kiếm) cho biết NĐ gồm 7 chương, 65 điều, hiệu lực 1/7/2026; bản sao thuviennhadat.vn chỉ có đoạn trích. | Cao |
| R-06 | Quyền lợi chậm chuyến của Vietnam Airlines ở các mốc 2h/3h? | Vietnam Airlines — Customer service plan (qua kết quả tìm kiếm) — AIRLINE · S | https://www.vietnamairlines.com/gb/vi/support/customer-service-plan | 2026-10-26 | Chậm ≥2 giờ: nước uống hoặc voucher/EMD tương đương; chậm ≥3 giờ: đồ ăn hoặc voucher tương đương; áp dụng khi lỗi của hãng, khởi hành từ Việt Nam. Kết quả tìm kiếm không thấy nội dung hỗ trợ khách sạn trên trang này. | Trung bình |
| R-07 | Giờ đóng quầy làm thủ tục nội địa của Vietnam Airlines? | Vietnam Airlines — Thời gian đóng quầy làm thủ tục (qua kết quả tìm kiếm) — AIRLINE · S | https://www.vietnamairlines.com/gb/vi/help-desk/common-topics/Check-in-and-Travel-documents/thoi-gian-dong-quay-lam-thu-tuc-san-bay | 2026-10-26 | Nội địa: làm thủ tục từ 2 giờ đến 40 phút trước giờ khởi hành dự kiến. Khớp với TT 48 Điều 8.1 (R-01). | Cao |
| R-08 | Quy trình chăm sóc/ở lại qua đêm của Anh (UK CAA) khi chậm chuyến? | UK Civil Aviation Authority — Delays — REGULATOR · F | https://www.caa.co.uk/air-passengers/travel-problems-and-rights/flight-delays-and-cancellations/delays/ | 2026-10-26 | Chăm sóc từ 2/3/4 giờ tùy cự ly; khách sạn và đi lại nếu chậm qua đêm, “bất kể lý do”. Hãng có thể tự sắp xếp, hoặc yêu cầu hành khách tự đặt qua website/ứng dụng của hãng; nếu hãng không cung cấp thì hành khách tự lo và đòi lại, giữ hóa đơn chi tiết; hãng khó hoàn các khoản “luxury”. Miễn bồi thường khi “extraordinary circumstances”, nhưng trang không nói điều này miễn quyền chăm sóc. | Trung bình |
| R-09 | UK CAA: chăm sóc và đổi chuyến khi hủy chuyến? | UK Civil Aviation Authority — Cancellations — REGULATOR · F | https://www.caa.co.uk/air-passengers/travel-problems-and-rights/flight-delays-and-cancellations/cancellations/ | 2026-10-26 | Hãng phải chăm sóc khi hủy (đồ ăn, liên lạc, khách sạn nếu đổi sang ngày hôm sau, kèm đi lại), “no matter how long the delay lasts or what has caused it”; hành khách được chọn hoàn tiền hoặc chuyến thay thế. Nếu hãng không lo được, hành khách tự lo và đòi lại, giữ mọi hóa đơn, không chi quá mức hợp lý. Trang không nêu cách/thời điểm hãng phải thông báo hủy chuyến. | Trung bình |
| R-10 | Quy định EU 261/2004 về quyền được chăm sóc (Điều 9)? | Cơ quan hàng không dân dụng Séc (tóm tắt Quy định 261/2004) và legislation.gov.uk (bản Anh của Điều 9, chưa mở) — REGULATOR · S ; OFFICIAL · S | https://www.caa.gov.cz/en/passengers/denied-boarding-delay-or-cancellation-of-flight/general-information/ ; https://www.legislation.gov.uk/eur/2004/261/article/9 | 2026-10-26 | Tóm tắt (qua kết quả tìm kiếm): chăm sóc gồm đồ ăn, khách sạn khi cần ở một đêm trở lên và đi lại sân bay–nơi nghỉ; ngưỡng chậm 2/3/4 giờ theo cự ly; quyền chăm sóc chấm dứt nếu hành khách chấp nhận chuyến thay thế vào ngày sau. Không mở được EUR-Lex để trích Điều 9 nguyên văn. | Thấp |
| R-11 | Thực tiễn của hãng Mỹ về voucher khách sạn khi hủy/chậm? | U.S. DOT dashboard (bản tin) và AviationPros (qua kết quả tìm kiếm) — REGULATOR · S ; PRESS · S (2022–2024) | https://www.transportation.gov/briefing-room/ahead-labor-day-dot-launches-new-dashboard-help-air-travelers-know-their-rights-when ; https://www.aviationpros.com/airlines/news/21279460/airlines-put-meal-hotel-voucher-rules-in-writing-after-pressure-from-dc | 2026-10-26 | Hãng thường chỉ lo khách sạn khi chậm/hủy do hãng kiểm soát; một số tự gửi voucher qua tin nhắn/ứng dụng, một số chỉ khi hành khách yêu cầu; nếu không có khách sạn đối tác, hãng hoàn “chi phí hợp lý” (ví dụ có hãng nêu mức tối đa 200 USD). Nguồn cũ (2022–2024), không dùng làm quy tắc cho Airrest. | Thấp |
| R-12 | Hiệu lực Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP? | Cổng thông tin Hà Tĩnh (tin pháp luật); PwC Việt Nam — PRESS/3P · S | https://hatinh.gov.vn/vi/bai-viet/luat-bao-ve-du-lieu-ca-nhan-chinh-thuc-co-hieu-luc-thi-hanh-tu-ngay-112026 ; https://www.pwc.com/vn/vn/publications/2026/20260128-new-rules-personal-data-protection.pdf | 2026-10-26 | Luật 91/2025/QH15 thông qua 26/6/2025, hiệu lực 01/01/2026, có Điều 9 (sự đồng ý) và Điều 10 (rút lại đồng ý) theo mục lục; NĐ 356/2025/NĐ-CP ban hành 31/12/2025, hiệu lực 01/01/2026, thay NĐ 13/2023/NĐ-CP. Chưa đọc nội dung điều khoản; toàn văn NĐ 356 có tại vbpl.moj.gov.vn (chưa mở). | Trung bình |
| R-13 | Notification API: điều kiện hiển thị thông báo của trình duyệt? | MDN Web Docs — Notification.requestPermission() — STD · F | https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static | 2026-10-26 | Chỉ trong secure context (HTTPS); nên gọi khi người dùng tương tác (nút bấm); quyền có 3 trạng thái granted/denied/default và “default” được xử lý như denied; tính năng “limited availability”, không phải Baseline. Trang không nêu khả năng nhắc khi đã đóng trang. | Trung bình |
| R-14 | Định dạng lịch chuẩn cho phương án thay thế khi không nhắc được? | IETF — RFC 5545 (iCalendar) — STD · P (đọc 100.000 ký tự đầu) | https://www.rfc-editor.org/rfc/rfc5545 | 2026-10-26 | RFC 5545 định nghĩa định dạng iCalendar để trao đổi dữ liệu lịch; thành phần sự kiện là VEVENT. Phần media type/phần mở rộng tệp và VALARM không xác nhận được từ đoạn đã đọc. | Thấp |
| R-15 | WCAG 2.2 mức AA: kích thước vùng chạm tối thiểu? | W3C Understanding SC 2.5.8 (qua kết quả tìm kiếm); DAISY Knowledge Base — STD · S (mở trực tiếp W3C bị 403) | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html | 2026-10-26 | SC 2.5.8 mức AA: vùng chạm ≥24×24 CSS px, có ngoại lệ khoảng cách, tương đương, nội dòng, do user agent kiểm soát, thiết yếu. Chưa kiểm chứng trong phiên mức 4,5:1 của SC 1.4.3 (W3C trả 403). | Thấp |
| R-16 | Hộp ngủ (sleep pod) tại Nội Bài: vị trí, giá, giờ mở hiện nay? | Vietnam News/Bizhub (bài 2014, qua kết quả tìm kiếm) — PRESS · S (2014) | https://bizhub.vietnamnews.vn/first-ever-sleeping-pods-at-noi-bai-airport-post6746.html | 2026-10-26 | Các nguồn tìm được nói về 14 hộp ngủ ở nhà ga T1 (2014), giá 210.000–1,8 triệu đồng; không có nguồn nào xác nhận hộp ngủ ở nhà ga T2 hay còn hoạt động. Dữ liệu A08 (Booking.com) ghi “VATC Sleep Pod Terminal 2”. Chưa có nguồn chính thức hiện hành. [Cập nhật v0.4: xem R-28 — trang chính thức của cảng Nội Bài xác nhận hộp ngủ ở T2 tầng 2 và T1 tầng 3.] | Thấp |
| R-17 | Chính sách của Vietjet về chậm/hủy chuyến và hỗ trợ lưu trú? | Kết quả tìm kiếm (không có trang chính sách chính thức của Vietjet) — PRESS · S | https://plo.vn/cham-thong-bao-tre-chuyen-vietjet-vietnam-airlines-bi-phat-30-trieu-dong-post325878.html (chỉ bài báo 2019 về xử phạt chậm thông báo) | 2026-10-26 | Không tìm được trang chính sách hiện hành của Vietjet; chỉ có tin cũ (2019). Kết luận: chưa có căn cứ về chính sách riêng của Vietjet. [Cập nhật v0.4: đã tìm được trang chính sách chính thức của Vietjet ở R-21; Bamboo ở R-22.] | Thấp |
| R-18 | Cách khách sạn/OTA xử lý giữ phòng khi khách đến muộn, thời hạn giữ phòng? | Tìm kiếm “Booking.com late arrival / hold reservation” (không có nguồn chính thức) — 3P · S | N/A — không có URL chính thức; chỉ có hướng dẫn bên thứ ba và một khiếu nại cá nhân | 2026-10-26 | Không tìm được tài liệu chính thức của Booking.com hay khách sạn về giữ phòng quá giờ nhận phòng. Kết luận: không có căn cứ để đặc tả “thời hạn giữ phòng”. | Trung bình |
| R-19 | Nghị định 208/2026/NĐ-CP: nội dung chính thức của Điều 36–40 về chậm chuyến, hủy chuyến, nơi nghỉ, miễn trừ? | Chính phủ — Nghị định 208/2026/NĐ-CP (bản ký số 16/6/2026 trên chinhphu.vn; Công báo số 350 ngày 27/6/2026) — OFFICIAL · F (PDF dạng ảnh quét, không có lớp chữ; đọc trực tiếp bằng cách xem ảnh các trang 30–36) | https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/208-ndcp.signed.pdf ; trang thông tin: https://vanban.chinhphu.vn/?docid=218453&pageid=27160 ; Công báo: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-208-2026-nd-cp-469770/65912.htm | 2026-10-26 | Điều 36: k1 lịch bay căn cứ = lịch công bố để bán vé, bản cập nhật đến 15h00 (giờ Hà Nội) ngày trước ngày khai thác; k2 chậm chuyến = đi thực tế muộn hơn 15 phút so với lịch bay căn cứ, chậm kéo dài = từ 4 giờ; k3 thông báo kịp thời, xin lỗi, nêu lý do, cập nhật giờ đi mới cho cảng/FIDS ≥30 phút/lần; k4 chậm ≥2 giờ: nước uống hoặc voucher, và đổi giờ/đổi hành trình khi hành khách yêu cầu (miễn hạn chế/phụ thu nếu lỗi hãng); k5 ≥3 giờ: đồ ăn hoặc voucher; k6 ≥4 giờ: hoàn vé nếu hành khách không đồng ý đổi, bồi thường ứng trước không hoàn lại (một lần mỗi chuyến), điểm d: điểm b, c chỉ áp dụng khi chậm do lỗi người vận chuyển; k7 ≥6 giờ: 7h–22h bố trí nơi nghỉ phù hợp điều kiện cảng, 22h–7h bố trí chỗ ngủ, nghỉ phù hợp điều kiện địa phương hoặc giải pháp thay thế nếu hành khách đồng ý; điểm c không áp dụng nếu hành khách chấp nhận hoàn vé; k8 nghĩa vụ ăn, uống, nghỉ chỉ áp dụng cho hành khách có vé, đã xác nhận chỗ và có mặt tại cảng; k9 giao BXD quy định chi tiết. Điều 39: k1 hủy chuyến = không thực hiện chuyến bay có ≥1 hành khách đã xác nhận chỗ và có vé; k3 ngay sau khi hủy: thông báo, xin lỗi, nêu lý do; lỗi hãng: đổi hành trình hoặc hoàn tiền (miễn hạn chế/phụ thu); chăm sóc (nước 2 giờ, ăn 3 giờ, ≥6 giờ nơi ở theo khung giờ như Điều 36 k7) trừ khi lỗi của hành khách hoặc hành khách đã yêu cầu hoàn vé; k4 Điều 36–39 không áp dụng cho chuyến không bán công khai và chuyến của doanh nghiệp không kinh doanh vận tải thương mại thường lệ. Điều 40 (tiêu đề: “Các trường hợp được miễn trừ bồi thường ứng trước không hoàn lại”): k1 hủy chuyến — thời tiết, nguy cơ an ninh, quyết định cơ quan nhà nước, cấp cứu/tử vong sau khi lên tàu, phá hoại, xung đột/đình công, hạ tầng, sự cố kỹ thuật, bố trí lại chỗ (đi không sớm hơn 2 giờ, đến không muộn hơn 4 giờ), đã thông báo ≥48 giờ, hành khách không đăng ký thông tin liên lạc, vé miễn/giảm giá của nhân viên-đối tác, tự nguyện bỏ xác nhận chỗ; k2 chậm chuyến — các trường hợp trên (a–e, g, h, k, n, o) cộng đến nơi muộn không quá 4 giờ bằng chuyến khác, hoặc đã được xác nhận hoàn vé; k3, k4 các miễn trừ khác. Điều 37: đổi lịch bay sớm/muộn hơn 5 giờ (trước khi công bố lịch bay căn cứ) và sau khi công bố. Điều 38: chậm có hành khách trên khoang từ 30 phút. | Cao |
| R-20 | Luật Hàng không dân dụng 130/2025/QH15 Điều 53: nghĩa vụ chung khi chậm/hủy? | hethongphapluat.com và Luatvietnam (nguồn thứ cấp; chưa tìm được bản chính thức của Luật) — 3P/PRESS · F (thứ cấp) | https://hethongphapluat.com/luat-hang-khong-dan-dung-viet-nam-2025/dieu-53 ; https://luatvietnam.vn/tin-van-ban-moi/tu-01-7-2026-khach-hang-bi-huy-chuyen-bay-co-the-duoc-boi-thuong-186-106313-article.html | 2026-10-26 | Điều 53 khoản 2 (theo nguồn thứ cấp): điểm d — khi chậm, hủy hoặc từ chối vận chuyển không do lỗi hành khách, người vận chuyển thông báo, xin lỗi, bảo đảm ăn, nghỉ, đi lại và chịu chi phí liên quan trực tiếp theo thời gian chờ tại cảng; điểm đ — nếu do lỗi người vận chuyển thì thu xếp hành trình hoặc hoàn tiền; điểm e — bồi thường ứng trước nếu do lỗi người vận chuyển. Mức luật này không gắn nghĩa vụ ăn, nghỉ, đi lại với lỗi hãng. Cần đối chiếu bản chính thức của Luật. | Trung bình |
| R-21 | Chính sách bảo vệ hành khách hiện hành của Vietjet? | Vietjet Air — Passenger Rights Protection Policy (trang chính thức của hãng) — AIRLINE · F | https://seo.vietjetair.com/en/pages/to-have-a-good-flight-1599448842652/passenger-rights-protection-policy-1785221482147 | 2026-10-26 | Trang trích Luật 130/2025/QH15, NĐ 208/2026/NĐ-CP, TT 48/2026/TT-BXD. Chậm ≥2 giờ: nước; ≥3 giờ: ăn; ≥6 giờ: 7h–22h nơi nghỉ tùy điều kiện cảng, 22h–7h chỗ ngủ tùy điều kiện địa phương hoặc giải pháp thay thế nếu hành khách đồng ý; lịch bay căn cứ chốt 15h ngày trước. Thông báo gồm số hiệu, đường bay, lý do, giờ mới hoặc phương án, kế hoạch phục vụ, vị trí quầy hỗ trợ; liên lạc dựa trên thông tin hành khách đăng ký lúc đặt vé. Mức bồi thường nội địa 220.000/330.000/440.000đ; yêu cầu ≤90 ngày, hãng xử lý ≤21 ngày; miễn trừ gồm thời tiết, an ninh, quyết định cơ quan nhà nước, sự cố kỹ thuật, đã thông báo trước, không đăng ký liên lạc. Hoàn vé ≤60 ngày kể từ ngày dự kiến đi. | Cao |
| R-22 | Chính sách phục vụ hành khách bất thường của Bamboo Airways? | Bamboo Airways — Chính sách phục vụ hành khách trong trường hợp bất thường (trang chính thức) — AIRLINE · F | https://www.bambooairways.com/vn/vi/support/customer-service-plan | 2026-10-26 | Trang nêu mốc nước 2 giờ, ăn 3 giờ, ≥6 giờ nơi nghỉ (07h–22h) hoặc chỗ ngủ (22h–07h); hoàn tiền khi chậm ≥4 giờ; bồi thường theo TT 14/2015/TT-BGTVT (sửa đổi bởi TT 27/2017), yêu cầu trong 90 ngày, hãng trả lời trong 7 ngày. Không dẫn Nghị định và không nêu ngày hiệu lực: cơ sở pháp lý trên trang chưa cập nhật theo NĐ 208/2026 và TT 48/2026. Không dùng làm căn cứ cho Airrest. | Trung bình |
| R-23 | Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15: định nghĩa, điều kiện đồng ý, trường hợp không cần đồng ý? | Quốc hội — Luật 91/2025/QH15 (Công báo số 971+972, 24/7/2025) — OFFICIAL · F (đọc văn bản bằng pdftotext) | https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2025/6/45578/57730-1-2025971-97291-2025-qh15.pdf | 2026-10-26 | Điều 2.1: dữ liệu cá nhân là dữ liệu hoặc thông tin “xác định hoặc giúp xác định một con người cụ thể”; sau khi khử nhận dạng thì không còn là dữ liệu cá nhân. Điều 9: đồng ý chỉ có hiệu lực khi tự nguyện và biết rõ loại dữ liệu, mục đích, bên kiểm soát, quyền và nghĩa vụ; thể hiện rõ ràng, cụ thể, kiểm chứng được; theo từng mục đích; không kèm điều kiện bắt buộc đồng ý mục đích khác; im lặng không phải đồng ý. Điều 19.1: các trường hợp không cần đồng ý (cấp bách, khẩn cấp, nhà nước, thực hiện thỏa thuận của chủ thể, các trường hợp khác theo luật). Hiệu lực 01/01/2026. | Trung bình |
| R-24 | Nghị định 356/2025/NĐ-CP: thủ tục thực hiện quyền và phương thức thể hiện sự đồng ý? | Chính phủ — Nghị định 356/2025/NĐ-CP (bản ký số trên chinhphu.vn, 71 trang) — OFFICIAL · P (PDF ảnh quét; chỉ đọc trang 3–5) | https://vanban.chinhphu.vn/?pageid=27160&docid=216387 ; https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/356-nd.signed.pdf | 2026-10-26 | Điều 5 (trang 4–5): khi có yêu cầu rút đồng ý, chỉnh sửa, xóa dữ liệu, bên kiểm soát phải phản hồi trong 02 ngày làm việc và thực hiện trong 10–20 ngày tùy loại yêu cầu. Điều 6.1: phương thức xin đồng ý phải kiểm chứng được người, thời điểm, nội dung; gồm văn bản, cuộc gọi ghi âm, tin nhắn, thư điện tử/trang thông tin điện tử/ứng dụng có thiết lập kỹ thuật. Chưa đọc danh mục dữ liệu cá nhân cơ bản/nhạy cảm và các điều khác. | Trung bình |
| R-25 | Nhắc giờ khi người dùng đóng trang trên iOS (Web Push)? | WebKit blog — Web Push for Web Apps on iOS and iPadOS — STD/VENDOR · F | https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ | 2026-10-26 | iOS/iPadOS 16.4 trở lên; web app phải được thêm vào Màn hình chính (manifest display standalone/fullscreen); xin quyền phải do người dùng bấm; dựa trên Push API, Notifications API và Service Worker; thông báo đi qua Apple Push Notification service. | Trung bình |
| R-26 | Push API: điều kiện nhận thông báo khi trang đang đóng? | MDN Web Docs — Push API — STD · F | https://developer.mozilla.org/en-US/docs/Web/API/Push_API | 2026-10-26 | Cần service worker đang hoạt động và đăng ký push (endpoint + khóa mã hóa); người dùng phải đồng ý; thông báo đến được ngay cả khi ứng dụng không mở; điểm cuối push là “capability URL” phải giữ bí mật; có chi phí pin; Baseline Widely available từ 3/2023. Việc gửi push cần máy chủ của ứng dụng gọi dịch vụ push — trang không mô tả chi tiết phần này. | Cao |
| R-27 | Hiển thị thông báo từ service worker và lập lịch hiển thị? | MDN Web Docs — ServiceWorkerRegistration.showNotification() — STD · F | https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification | 2026-10-26 | Cần HTTPS, service worker đang activating/activated và quyền thông báo. Trang không nêu showTrigger/TimestampTrigger; thuộc tính timestamp chỉ ghi thời điểm liên quan, không lập lịch hiển thị. Do đó không có cơ chế được tài liệu hóa để tự hiển thị thông báo đúng giờ mà không có sự kiện push từ máy chủ. | Cao |
| R-28 | Hộp ngủ ở Nội Bài: vị trí, giờ, giá, đơn vị cung cấp? | Cảng Hàng không quốc tế Nội Bài — trang Dịch vụ hộp ngủ — OFFICIAL (đơn vị khai thác cảng) · F | https://noibaiairport.vn/vi/dich-vu-hop-ngu-nid111.html | 2026-10-26 | T1: tầng 3 nhà ga quốc nội; T2: tầng 2 nhà ga quốc tế. Trang không nêu giờ hoạt động, giá hay đơn vị vận hành (liên hệ dùng tên miền vatc.vn); hotline +84 98 379 8833; không có ngày cập nhật, ghi bản quyền 2020. Vì vậy vị trí được xác nhận, còn giá, giờ mở và độ cập nhật thì không. | Trung bình |
| R-29 | Cục Hàng không Việt Nam thông tin gì về Nghị định 208/2026? | Cục Hàng không Việt Nam — “Nghị định mới về vận tải hàng không” (29/06/2026) — OFFICIAL · F | https://caa.gov.vn/hoat-dong-nganh/nghi-dinh-moi-ve-van-tai-hang-khong-20260626090633040.htm | 2026-10-26 | Bài chỉ nêu ngắn gọn: “Bổ sung các quy định về hoàn vé, nghĩa vụ của người vận chuyển trong trường hợp thay đổi lịch và chậm chuyến trên khoang”; không có mức giờ hay mức bồi thường. Không bổ sung căn cứ ngoài R-19. | Thấp |

Ghi chú: “OFFICIAL/REGULATOR/AIRLINE/PRESS/STD/3P” là loại nguồn; F = đã mở trang, P = mở một phần, S = chỉ dựa trên kết quả tìm kiếm.

## C. Decision Recommendations

### C.0 Nghĩa vụ pháp lý của hãng hàng không và chính sách vận hành của Airrest

Airrest không phải người vận chuyển. Văn bản pháp luật đặt nghĩa vụ lên hãng; các chức năng của Airrest chỉ hiển thị thông tin hoặc mô phỏng.

| Nội dung | Nghĩa vụ pháp lý của hãng (nguồn) | Vai trò/chính sách của Airrest |
|---|---|---|
| Thông báo chậm/hủy, xin lỗi, nêu lý do | Nghĩa vụ của hãng: Điều 36 k3a; Điều 39 k3a; Luật Điều 53 k2c–d (thứ cấp) | Airrest chỉ hiển thị trạng thái và nguyên nhân từ dữ liệu mô phỏng; không thay hãng thông báo (MB-01/02) |
| Cập nhật giờ đi dự kiến mới ≥30 phút/lần | Hãng → cảng/FIDS: Điều 36 k3b | Airrest làm mới dữ liệu mô phỏng theo tham số (D-08); “cập nhật lúc” là yêu cầu của MVP (MB-02, MB-20) |
| Nước (≥2 giờ), đồ ăn (≥3 giờ) | Hãng: Điều 36 k4a, k5; Điều 39 k3c | Airrest chỉ hiển thị quyền lợi (MB-03), không cung cấp |
| Nơi nghỉ/chỗ ngủ khi chậm ≥6 giờ hoặc chờ ≥6 giờ sau hủy | Hãng: Điều 36 k7; Điều 39 k3c; chỉ với hành khách có vé, xác nhận chỗ, có mặt tại cảng (k8) | L1: Airrest giúp hành khách tự tìm và tự chi trả (MB-05–07). L2: “đề nghị hãng hỗ trợ” là cơ chế mô phỏng của Airrest (MB-11–13), không phải thủ tục pháp lý |
| Hoàn vé; bồi thường ứng trước (lỗi hãng) | Hãng: Điều 36 k6; TT 48 Điều 4–6 (thời hạn 21 ngày; yêu cầu ≤60/90 ngày) | Airrest không xử lý hoàn vé/bồi thường (ngoài MVP); chỉ hiển thị thông tin (MB-03) |
| Miễn trừ bồi thường ứng trước | Điều 40 (miễn trừ bồi thường ứng trước; không đề cập ăn/nghỉ) | Airrest không xác định miễn trừ; hiển thị là thông tin (D-11 hoãn) |
| Giờ đóng quầy nội địa 40 phút; mở ≥2 giờ | Hãng: TT 48 Điều 8.1b | Airrest dùng làm ràng buộc cứng cho tham số “giờ có mặt” (D-02) |
| Dữ liệu cá nhân | Bên kiểm soát dữ liệu: Luật 91/2025 Điều 9, 19; NĐ 356/2025 | Airrest không thu dữ liệu cá nhân (MB-19, MB-07); chưa tạo yêu cầu pháp lý |
| Điều kiện hành khách (có vé, xác nhận chỗ, có mặt) | Hãng kiểm tra: Điều 36 k8 | Airrest không xác minh được (không thu mã đặt chỗ); chỉ hiển thị điều kiện và có thể cho tự xác nhận mô phỏng (D-05) |

### C.1 Kiểm chứng nội dung B03 FR-04 (quyền lợi) so với văn bản chính thức

| Nội dung B03 FR-04 | Kết quả | Nguồn | Ghi chú |
|---|---|---|---|
| Chậm ≥2 giờ: nước uống | Khớp (bản chính thức) | R-19 Điều 36 k4a; R-21 | Hoặc voucher tương đương |
| Chậm ≥3 giờ: đồ ăn | Khớp (bản chính thức) | R-19 Điều 36 k5 | Hoặc voucher tương đương |
| Chậm ≥4 giờ: hoàn vé và bồi thường ứng trước, chỉ khi lỗi hãng | Khớp (bản chính thức) | R-19 Điều 36 k6 a–d; R-01 Điều 4–5 | Hoàn vé khi hành khách không đồng ý đổi; bồi thường một lần mỗi chuyến |
| Chậm ≥6 giờ: nơi nghỉ; 22h–7h: chỗ ngủ | Khớp một phần | R-19 Điều 36 k7 | B03 viết “≥6 giờ hoặc khung 22h–7h”; văn bản: khung giờ chỉ quyết định loại nơi nghỉ của trường hợp ≥6 giờ |
| Bồi thường nội địa 440.000đ cho 1.100 km | Khớp (bản chính thức) | R-01 Điều 5.1 | 220.000đ (<500 km); 330.000đ (500–<1.000 km); 440.000đ (≥1.000 km) |
| Điều kiện đủ để đề nghị hỗ trợ: chậm ≥6 giờ hoặc 22h–7h và nguyên nhân thuộc trách nhiệm hãng | Chưa khớp văn bản đã đọc | R-19 Điều 36 k6d, k7, k8 | Điều kiện lỗi người vận chuyển được nêu cho hoàn vé/bồi thường (k6 b, c); k7 (nơi nghỉ) không ghi điều kiện lỗi (k7a dẫn “thực hiện theo khoản 6” — cần pháp chế xác nhận); thiếu điều kiện hành khách “có vé, xác nhận chỗ, có mặt tại cảng” (k8) |
| Căn cứ Điều 36, 39, 40 NĐ 208/2026 và TT 48/2026 | Khớp một phần | R-19 Điều 40 | Điều 40 có tiêu đề và nội dung về miễn trừ bồi thường ứng trước; không đề cập việc miễn nghĩa vụ ăn, nghỉ |
| Bất khả kháng: “quyền lợi tối thiểu, ghi rõ phần không áp dụng” (B04 UC02 A1) | Khớp một phần | R-19 Điều 36 k7, Điều 39 k3c, Điều 40 | Thời tiết/an ninh… thuộc danh mục miễn bồi thường ứng trước (Điều 40); Điều 36 k7 và Điều 39 k3c không nêu các lý do này là căn cứ miễn ăn, nghỉ |
| Áp dụng từ 01/7/2026 | Khớp (bản chính thức) | R-19 (trang vanban.chinhphu.vn: hiệu lực 01-07-2026) | NĐ ký 15/6/2026; Công báo số 350 ngày 27/6/2026 |
| TT 81/2014 và TT 14/2015 đã bị thay thế | Chưa xác minh | R-01 (chỉ kết quả tìm kiếm trước đó) | Chưa đọc điều khoản bãi bỏ của NĐ 208/TT 48 |

Kết luận: đã đối chiếu bản chính thức NĐ 208/2026 Điều 36–40 và TT 48 Điều 4–8. MB-03 và MB-20 vẫn Blocked theo MVP cho đến khi chủ sản phẩm gỡ; SRS không tự gỡ và không tạo yêu cầu pháp lý bắt buộc mới. D-01 chuyển từ “chờ xác minh” sang “đã xác minh văn bản, chờ phê duyệt”.

### C.2 Các đề xuất

#### D-01 — Điều kiện được gửi đề nghị hãng hỗ trợ lưu trú

- **Vấn đề:** Điều kiện được gửi đề nghị hãng hỗ trợ lưu trú (gap G-02, G-03, G-19; yêu cầu FR-005, FR-019).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Theo B03: chậm ≥6 giờ hoặc khung 22h–7h, và lỗi hãng | Gắn nghĩa vụ lưu trú với lỗi hãng; đơn giản. | Chưa khớp văn bản đã đọc (R-19): 22h–7h không phải ngưỡng độc lập; k7 không ghi điều kiện lỗi. Có thể từ chối sai người đủ điều kiện. |
| B. Theo văn bản: chậm ≥6 giờ (hoặc hủy chuyến và chờ ≥6 giờ tại cảng) + có vé, xác nhận chỗ, có mặt tại cảng; không áp dụng nếu nhận hoàn vé; khung 22h–7h chỉ đổi loại nơi nghỉ | Bám Điều 36 k7–k8 và Điều 39 k3c. | Là diễn giải của người soạn (điều kiện “không do lỗi hành khách” chỉ rõ ở Điều 39 k3c; Luật Điều 53 chỉ thứ cấp); cần chủ sản phẩm/pháp chế xác nhận cách hiểu “thực hiện theo khoản 6” ở k7a. |
| C. Chỉ hiển thị điều kiện như thông tin, không chặn việc gửi đề nghị | Phù hợp việc nghĩa vụ thuộc hãng và L2 chỉ là cơ chế mô phỏng; không loại nhầm. | Người dùng không đủ điều kiện vẫn gửi được đề nghị mô phỏng. |

- **Phương án đề xuất cho Airrest:** Phương án B về nội dung kết hợp C về cách hiển thị (thông tin, không chặn). Mức Proposed; chờ chủ sản phẩm phê duyệt.
- **Căn cứ:** R-19 (Điều 36 k6d, k7, k8; Điều 39 k3c), R-20 (thứ cấp), G-19.
- **Ảnh hưởng đến phạm vi MVP:** Không thêm tính năng; làm rõ nội dung MB-03/MB-11. MB-03 vẫn Blocked cho đến khi chủ sản phẩm gỡ.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-02 — Công thức giờ có mặt, thời gian nghỉ và giờ rời

- **Vấn đề:** Công thức giờ có mặt, thời gian nghỉ và giờ rời (gap G-10; yêu cầu FR-006, FR-014, FR-016, FR-023).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Giờ có mặt 120 phút trước giờ bay (B03), trừ 2× thời gian di chuyển | Dư xa mốc đóng quầy 40 phút; an toàn. | Rút ngắn thời gian nghỉ; công thức 2× không có căn cứ ngoài B03. |
| B. Giờ có mặt 90 phút (B04), dự phòng 60 phút | Thời gian nghỉ dài hơn. | Hai nguồn nội bộ vẫn lệch nhau; ít dư hơn A. |
| C. Tham số cấu hình: giờ có mặt, dự phòng, hệ số di chuyển | Đổi được mà không sửa mã (khớp NFR-009). | Cần chốt giá trị mặc định. |

- **Phương án đề xuất cho Airrest:** Phương án C; mặc định đề xuất 120 phút (giá trị cuối do chủ sản phẩm chọn). Ràng buộc cứng: giờ có mặt không được sớm hơn mốc đóng quầy 40 phút.
- **Căn cứ:** R-01 (TT 48 Điều 8.1), R-07; B03, B04.
- **Ảnh hưởng đến phạm vi MVP:** Không đổi phạm vi; chỉ thêm tham số.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-03 — Kênh nhắc giờ và giới hạn khi đóng trang

- **Vấn đề:** Kênh nhắc giờ và giới hạn khi đóng trang (gap G-12; yêu cầu FR-014, FR-015).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Thông báo trình duyệt khi trang còn mở + tệp lịch iCalendar (nhắc do ứng dụng lịch của người dùng) | Không cần máy chủ hay dịch vụ ngoài; khớp AC “fallback lịch”. | Không nhắc nền khi trang đóng; cần thử nghiệm việc đặt nhắc trong tệp lịch. |
| B. Nhắc nền bằng Push API + service worker | Nhắc được khi trang đóng (Android/desktop; iOS cần 16.4+ và Màn hình chính). | Bắt buộc có máy chủ gửi push và dịch vụ push (R-26); không có cơ chế lập lịch hiển thị được tài liệu hóa (R-27); ngoài MVP hiện tại. |
| C. Thêm SMS (B03) | Tiếp cận người không mở trình duyệt. | Cần nhà cung cấp SMS và số điện thoại — không phù hợp MB-07/MB-19 và chưa thuộc MVP. |

- **Phương án đề xuất cho Airrest:** Phương án A cho MVP. Phương án B bị chặn (cần hạ tầng ngoài MVP); C loại.
- **Căn cứ:** R-13, R-14, R-25, R-26, R-27; MVP MB-08.
- **Ảnh hưởng đến phạm vi MVP:** Không đổi phạm vi; MB-08 chỉ đảm bảo khi trang còn mở.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-04 — Hết hạn/không phản hồi của yêu cầu hỗ trợ

- **Vấn đề:** Hết hạn/không phản hồi của yêu cầu hỗ trợ (gap G-06, G-05; yêu cầu FR-019, FR-020, FR-021).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Không có hết hạn | Đúng MVP (không nêu). | Người dùng có thể chờ vô hạn; trái mục tiêu “không bị mắc kẹt”. |
| B. Hết hạn 15 phút mô phỏng và gợi ý tự chi trả (B04) | Giữ lối thoát rõ ràng. | Giá trị 15 phút không có căn cứ pháp lý hay thông lệ đã kiểm chứng. |
| C. Hết hạn là tham số cấu hình do chủ sản phẩm đặt | Linh hoạt. | Cần quyết định. |

- **Phương án đề xuất cho Airrest:** Phương án C với gợi ý tự chi trả khi quá hạn; giá trị mặc định do chủ sản phẩm chọn (B04 đề xuất 15 phút).
- **Căn cứ:** R-01 (không có thời hạn pháp lý cho lưu trú), R-08; B04 UC11 E1.
- **Ảnh hưởng đến phạm vi MVP:** Không đổi phạm vi; MB-14 vẫn cho chuyển bất kỳ lúc nào.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-05 — Xác minh điều kiện hành khách khi không thu dữ liệu định danh

- **Vấn đề:** Xác minh điều kiện hành khách khi không thu dữ liệu định danh (gap G-03; yêu cầu FR-019, NFR-005).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Không kiểm tra, chỉ hiển thị điều kiện | Không thu dữ liệu. | Có thể gửi đề nghị khi không đủ điều kiện. |
| B. Hành khách tự xác nhận 3 điều kiện (mô phỏng) | Không thu dữ liệu; nhắc điều kiện pháp lý. | Không xác minh thật. |
| C. Nhập mã đặt chỗ để xác minh | Xác minh được. | Cần tích hợp hãng và thu dữ liệu — ngoài MVP. |

- **Phương án đề xuất cho Airrest:** Phương án B (Proposed). Lưu ý (audit v0.5): chỉ có ý nghĩa nếu D-01 chọn phương án chặn; nếu D-01 chỉ hiển thị thông tin thì không cần thêm bước xác nhận — xem PRODUCT_DECISION_REGISTER.md.
- **Căn cứ:** R-03; MVP MB-19; B04 mục 6.1.
- **Ảnh hưởng đến phạm vi MVP:** Thêm một bước xác nhận trong MB-11; không thu dữ liệu mới.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-06 — Giả định số khách, số phòng, số đêm cho “giá tổng”

- **Vấn đề:** Giả định số khách, số phòng, số đêm cho “giá tổng” (gap G-07; yêu cầu FR-011, DR-004).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Giá cố định cho 1 phòng, 1 đêm, 2 người lớn (như A08) | Không thêm trường nhập. | Không đúng với gia đình đông hoặc thuê theo giờ. |
| B. Thêm trường số khách/phòng/đêm | Giá chính xác hơn. | Mở rộng phạm vi, kéo theo logic tồn phòng. |
| C. Hiển thị rõ giả định ngay cạnh giá | Minh bạch (khớp MB-06). | Vẫn một cấu hình giá. |

- **Phương án đề xuất cho Airrest:** Phương án A + C.
- **Căn cứ:** B02 (bảng nguồn và ngày thu thập: A08 giá cho 2 người lớn, 1 đêm); MVP MB-06.
- **Ảnh hưởng đến phạm vi MVP:** Không đổi phạm vi.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-07 — Chứng từ khi tự chi trả (liên quan MB-15 đã loại)

- **Vấn đề:** Chứng từ khi tự chi trả (liên quan MB-15 đã loại) (gap G-04, G-08; yêu cầu FR-022).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Giữ nguyên MVP: chỉ giữ mã/trạng thái, không lưu chứng từ | Đúng phạm vi MVP. | Hành khách tự chi trả cần hóa đơn để đòi lại (Anh: giữ hóa đơn chi tiết); luồng L2 của B03 giả định có chứng từ. |
| B. Đưa một phần chứng từ vào MVP (tóm tắt đơn giản) | Hỗ trợ đòi chi phí. | Mở lại MB-15 đã loại. |
| C. Chỉ nhắc người dùng giữ hóa đơn | Không thêm tính năng. | Không hỗ trợ tạo tóm tắt. |

- **Phương án đề xuất cho Airrest:** Phương án A, kèm nội dung hướng dẫn giữ hóa đơn (không phải tính năng). Chủ sản phẩm quyết định có mở lại MB-15 sau MVP không.
- **Căn cứ:** R-08, R-09; TT 48 Điều 4, 6 (thời hạn đề nghị 60/90 ngày).
- **Ảnh hưởng đến phạm vi MVP:** Giữ nguyên MVP.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-08 — Tần suất làm mới dữ liệu chuyến bay và ngưỡng “dữ liệu cũ”

- **Vấn đề:** Tần suất làm mới dữ liệu chuyến bay và ngưỡng “dữ liệu cũ” (gap G-11; yêu cầu FR-003, FR-004, NFR-007).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Mặc định 30 phút (khớp nghĩa vụ hãng cập nhật cho cảng) | Có căn cứ pháp lý (báo chí). | Là nghĩa vụ của hãng với cảng, không phải của Airrest. |
| B. Không nêu tần suất | Đúng MVP. | Không kiểm thử được “cập nhật”. |

- **Phương án đề xuất cho Airrest:** Phương án A ở dạng tham số tham khảo.
- **Căn cứ:** R-02; B03 FR-03 (S03).
- **Ảnh hưởng đến phạm vi MVP:** Không đổi phạm vi.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-09 — Dữ liệu tiện ích nhà ga cho MB-09

- **Vấn đề:** Dữ liệu tiện ích nhà ga cho MB-09 (gap G-18; yêu cầu FR-017).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Dùng dữ liệu A08/B04 (“VATC Sleep Pod Terminal 2”) | Có sẵn. | Mâu thuẫn với nguồn công khai tìm được (T1, 2014). |
| B. Chỉ giữ cấu trúc, điền dữ liệu sau khi có nguồn hiện hành | Không đưa thông tin sai. | Cần thời gian xác minh. |

- **Phương án đề xuất cho Airrest:** Phương án B.
- **Căn cứ:** R-16.
- **Ảnh hưởng đến phạm vi MVP:** MB-09 vẫn Conditional.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-10 — Phạm vi quy tắc “nguyên nhân chưa rõ thì không kết luận”

- **Vấn đề:** Phạm vi quy tắc “nguyên nhân chưa rõ thì không kết luận” (gap G-21, G-02; yêu cầu FR-005, BR-006).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Giữ nguyên MVP: áp dụng cho toàn bộ quyền lợi | Đúng chữ MVP; an toàn khi nội dung chưa duyệt. | Với ăn/nghỉ, nguyên nhân không ảnh hưởng (Điều 36 k7); người dùng có thể bị che mất quyền có thật. |
| B. Chỉ áp dụng cho hoàn vé và bồi thường ứng trước; ăn, nghỉ hiển thị theo mốc giờ | Khớp Điều 36 k6d, k7. | Khác chữ MVP; cần phê duyệt. |
| C. Hiển thị hai kịch bản (lỗi hãng/không) cho hoàn vé và bồi thường | Trung thực khi chưa biết nguyên nhân (B04 UC02 E1). | Giao diện phức tạp hơn. |

- **Phương án đề xuất cho Airrest:** Phương án B kết hợp C, mức Proposed, chờ chủ sản phẩm.
- **Căn cứ:** R-19 Điều 36 k6d, k7; Điều 40; G-21.
- **Ảnh hưởng đến phạm vi MVP:** Có thể làm thay đổi cách đọc AC của MB-03; cần quyết định.
- **Cần chủ sản phẩm phê duyệt:** Có

#### D-11 — Hiển thị danh mục miễn trừ bồi thường ứng trước (Điều 40) và lưu ý đăng ký thông tin liên lạc

- **Vấn đề:** Hiển thị danh mục miễn trừ bồi thường ứng trước (Điều 40) và lưu ý đăng ký thông tin liên lạc (gap G-21; yêu cầu FR-005, DR-002).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Hiển thị đầy đủ danh mục miễn trừ | Minh bạch. | Dài, khó đọc khi căng thẳng (NFR-002); nội dung quyền lợi chưa được duyệt. |
| B. Chỉ nêu nguyên tắc “có thể được miễn trừ” kèm liên kết nguồn | Ngắn gọn. | Ít thông tin. |
| C. Hoãn đến khi nội dung MB-03 được duyệt | Tránh làm sai khi chưa chốt. | Chưa có thông tin cho người dùng. |

- **Phương án đề xuất cho Airrest:** Phương án C.
- **Căn cứ:** R-19 Điều 40; MVP MB-03 Blocked.
- **Ảnh hưởng đến phạm vi MVP:** Không đổi phạm vi MVP.
- **Cần chủ sản phẩm phê duyệt:** Có (khi gỡ Blocked)

#### D-12 — Nguồn và ngày cập nhật của nội dung FAQ/liên hệ/chính sách hãng

- **Vấn đề:** Nguồn và ngày cập nhật của nội dung FAQ/liên hệ/chính sách hãng (gap G-20; yêu cầu FR-018, BR-013).
- **Các phương án tìm thấy:**

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Chỉ trích văn bản pháp luật và trang chính thức, kèm ngày truy cập | Đúng MB-10 (“có nguồn”). | Cần duy trì khi văn bản đổi. |
| B. Sao chép chính sách từng hãng | Cụ thể. | Chính sách hãng có thể lỗi thời (Bamboo, R-22) và không phải quy tắc của Airrest. |

- **Phương án đề xuất cho Airrest:** Phương án A.
- **Căn cứ:** R-21, R-22; MVP MB-10.
- **Ảnh hưởng đến phạm vi MVP:** Giữ MB-10 Conditional.
- **Cần chủ sản phẩm phê duyệt:** Có

### C.3 Phân loại quyết định D-01…D-12

Không có quyết định nào được đánh dấu là đã phê duyệt. “Tham số mô phỏng” nghĩa là có thể dùng ngay như giả định của prototype (gắn nhãn mô phỏng) mà không phải quyết định nghiệp vụ, nhưng giá trị vẫn là đề xuất.

| ID | Nội dung | Phân loại | Cơ sở | Trạng thái hiện tại | Điều kiện chuyển trạng thái | OQ |
|---|---|---|---|---|---|---|
| D-01 | Điều kiện gửi đề nghị hỗ trợ lưu trú (hiển thị, không chặn) | A. Cần chủ sản phẩm phê duyệt | Đã xác minh văn bản chính thức (R-19); còn quyết định về cách hiển thị và việc gỡ Blocked của MB-03 | Đề xuất, chưa phê duyệt | Chủ sản phẩm phê duyệt D-01 và quyết định gỡ Blocked MB-03 | OQ-07, OQ-31, OQ-06 |
| D-02 | Giờ có mặt, dự phòng, hệ số di chuyển | B. Tham số mô phỏng dùng được trong MVP | Ràng buộc cứng đã xác minh: không muộn hơn mốc đóng quầy 40 phút (R-01); giá trị mặc định chỉ là giả định mô phỏng, đề xuất 120 phút | Đề xuất, chưa phê duyệt | Chủ sản phẩm xác nhận giá trị mặc định (có thể dùng ngay làm giả định, gắn nhãn mô phỏng) | OQ-04 |
| D-03 | Nhắc giờ khi trang còn mở + tệp lịch | A. Cần chủ sản phẩm phê duyệt | Chấp nhận giới hạn không nhắc khi đóng trang | Đề xuất, chưa phê duyệt | Chủ sản phẩm chấp nhận giới hạn | OQ-09, OQ-34 |
| D-03* | Nhắc nền khi đóng trang (Push API) | D. Bị chặn | Cần máy chủ gửi push và dịch vụ push ngoài MVP; không có cơ chế lập lịch phía client được tài liệu hóa (R-26, R-27) | Bị chặn | Chủ sản phẩm phê duyệt hạ tầng ngoài MVP (không nằm trong phạm vi hiện tại) | OQ-34 |
| D-04 | Hết hạn yêu cầu L2 là tham số | B. Tham số mô phỏng dùng được trong MVP | Không có căn cứ pháp lý hay thông lệ cho thời hạn; giá trị 15 phút của B04 chỉ là giả định mô phỏng | Đề xuất, chưa phê duyệt | Chủ sản phẩm xác nhận có cần hết hạn không | OQ-33, OQ-08 |
| D-05 | Hành khách tự xác nhận điều kiện (mô phỏng) | A. Cần chủ sản phẩm phê duyệt | Thêm một bước vào MB-11; không thu dữ liệu | Đề xuất, chưa phê duyệt | Chủ sản phẩm phê duyệt | OQ-31 |
| D-06 | Giả định giá: 1 phòng, 1 đêm, 2 người lớn | B. Tham số mô phỏng dùng được trong MVP | Giả định dữ liệu mock theo A08; phải ghi nhãn trên giao diện | Đề xuất, chưa phê duyệt | Chủ sản phẩm xác nhận giả định | OQ-32 |
| D-07 | Chứng từ khi tự chi trả | C. Có thể trì hoãn | Giữ nguyên MVP (MB-15 đã loại); chỉ hướng dẫn giữ hóa đơn | Hoãn | Xem xét lại sau MVP | OQ-03 |
| D-08 | Tần suất làm mới dữ liệu mô phỏng 30 phút | B. Tham số mô phỏng dùng được trong MVP | Có căn cứ: nghĩa vụ hãng cập nhật FIDS ≥30 phút/lần (R-19 Điều 36 k3b); là tham số mô phỏng, không phải nghĩa vụ của Airrest | Đề xuất, chưa phê duyệt | Chủ sản phẩm xác nhận | OQ-22 |
| D-09 | Dữ liệu tiện ích nhà ga | D. Bị chặn (dữ liệu) | Vị trí đã xác minh (R-28); giá, giờ mở, đơn vị vận hành, độ cập nhật thiếu nguồn hiện hành; MB-09 còn Conditional | Bị chặn | Có nguồn hiện hành cho giá/giờ và chủ sản phẩm giữ MB-09 | OQ-13 |
| D-10 | Phạm vi quy tắc “nguyên nhân chưa rõ” | A. Cần chủ sản phẩm phê duyệt | Có thể khác chữ MVP; đã có căn cứ văn bản (R-19) | Đề xuất, chưa phê duyệt | Chủ sản phẩm phê duyệt | OQ-36 |
| D-11 | Danh mục miễn trừ Điều 40 | C. Có thể trì hoãn | Phụ thuộc nội dung MB-03 được duyệt | Hoãn | Sau khi gỡ Blocked MB-03 | OQ-06 |
| D-12 | Nguồn/ngày cập nhật FAQ-liên hệ | A. Cần chủ sản phẩm phê duyệt | Nguyên tắc quản trị nội dung cho MB-10 | Đề xuất, chưa phê duyệt | Chủ sản phẩm phê duyệt | OQ-12 |

Tóm tắt: A (cần chủ sản phẩm phê duyệt) — D-01, D-03, D-05, D-10, D-12; B (tham số mô phỏng) — D-02, D-04, D-06, D-08; C (có thể trì hoãn) — D-07, D-11; D (bị chặn) — D-03*, D-09.

Đối chiếu từ vựng: nhóm A ↔ Pending PO; B ↔ Simulation Parameter; C ↔ Deferred; D ↔ Blocked (xem `PRODUCT_DECISION_REGISTER.md`). Cột “Trạng thái hiện tại” bên dưới dùng từ ngữ cũ (“Đề xuất, chưa phê duyệt”, “Hoãn”, “Bị chặn”).

## D. Open Questions còn lại sau nghiên cứu

Chỉ các câu hỏi chưa thể giải quyết bằng nguồn hiện có hoặc thuộc thẩm quyền chủ sản phẩm. Danh sách đầy đủ và nguồn A/B nằm trong `OPEN_QUESTIONS.md`; bảng dưới chỉ là một phần của các OQ còn mở. Danh sách đầy đủ OQ mở và quyết định tương ứng nằm trong `PRODUCT_DECISION_REGISTER.md`.

| OQ | Trạng thái | Vì sao còn mở |
|---|---|---|
| OQ-04 | Mở một phần | Chủ sản phẩm chọn công thức và giá trị mặc định (D-02). |
| OQ-06 | Mở một phần (đã nghiên cứu) | Chủ sản phẩm phê duyệt nội dung quyền lợi và gỡ Blocked của MB-03/MB-20. |
| OQ-07 | Mở một phần (đã nghiên cứu) | Chủ sản phẩm phê duyệt điều kiện hiển thị (D-01). |
| OQ-08 | Mở một phần (đã nghiên cứu) | Chủ sản phẩm chốt state machine. |
| OQ-09 | Mở một phần | Chủ sản phẩm chọn kênh nhắc (D-03). |
| OQ-10 | Mở một phần | Chủ sản phẩm chốt cách đếm bước. |
| OQ-13 | Mở một phần (đã nghiên cứu) | Thiếu giá, giờ, đơn vị vận hành, ngày cập nhật cho tiện ích nhà ga (D-09). |
| OQ-14 | Mở | B00 chưa ký. |
| OQ-20 | Mở | Chưa có người phê duyệt. |
| OQ-21 | Mở | Quyết định thiết kế mô phỏng. |
| OQ-31 | Mở một phần (đã nghiên cứu) | Quyết định của chủ sản phẩm (D-01, D-05). |
| OQ-32 | Mở | Quyết định của chủ sản phẩm (D-06). |
| OQ-33 | Mở một phần (đã nghiên cứu) | Không có căn cứ pháp lý; tham số mô phỏng do chủ sản phẩm chọn (D-04). |
| OQ-34 | Mở một phần (đã nghiên cứu) | Nhắc nền cần máy chủ push ngoài MVP; chủ sản phẩm chấp nhận giới hạn (D-03). |
| OQ-36 | Mở | Quyết định của chủ sản phẩm về phạm vi quy tắc MVP (D-10). |
| OQ-37 | Mở | Xác minh bổ sung mức thấp (Luật 130 Điều 53, NĐ 356 danh mục). |
| OQ-18 | Mở một phần (đã nghiên cứu) | Chủ sản phẩm quyết định có thu dữ liệu nào không; nếu có cần rà soát pháp lý theo Luật 91/2025. |
| OQ-16 | Mở một phần (đã nghiên cứu) | Chủ sản phẩm chọn mục tiêu khả dụng. |
| OQ-22 | Mở một phần (đã nghiên cứu) | Chủ sản phẩm chốt S1/S2 và tần suất (D-08). |
| OQ-12 | Đã quyết định theo MVP | MB-10 còn Conditional; chủ sản phẩm quyết định giữ hay loại và nguồn liên hệ (D-12). |

Đã giải quyết: OQ-35 (lấy được bản chính thức NĐ 208/2026). Mâu thuẫn đã chốt theo MVP: OQ-01, 02, 03, 29 (xem `OPEN_QUESTIONS.md`).

## E. Nội dung pháp lý đã và chưa xác minh

| Nội dung | Mức xác minh | Nguồn |
|---|---|---|
| NĐ 208/2026 Điều 36 k1–k2: lịch bay căn cứ (15h00 ngày trước); chậm >15 phút; chậm kéo dài ≥4 giờ | Đã xác minh bản chính thức | R-19, PDF trang 30–31 |
| NĐ 208/2026 Điều 36 k3–k5: thông báo, cập nhật ≥30 phút; nước ≥2 giờ; đổi giờ/hành trình; đồ ăn ≥3 giờ | Đã xác minh bản chính thức | R-19, trang 31 |
| NĐ 208/2026 Điều 36 k6: hoàn vé, bồi thường ứng trước một lần; k6d điều kiện lỗi người vận chuyển | Đã xác minh bản chính thức | R-19, trang 31–32 |
| NĐ 208/2026 Điều 36 k7–k9: nơi nghỉ ≥6 giờ theo khung giờ; không áp dụng nếu nhận hoàn vé; điều kiện hành khách | Đã xác minh bản chính thức | R-19, trang 32 |
| NĐ 208/2026 Điều 37–38: đổi lịch bay; chậm có hành khách trên khoang | Đã xác minh bản chính thức | R-19, trang 32–33 |
| NĐ 208/2026 Điều 39: hủy chuyến, từ chối vận chuyển, chăm sóc, trường hợp không áp dụng | Đã xác minh bản chính thức | R-19, trang 33–35 |
| NĐ 208/2026 Điều 40: miễn trừ bồi thường ứng trước (k1–k4) | Đã xác minh bản chính thức (đọc k1–k4; k3, k4 chỉ ở mức tóm tắt) | R-19, trang 35–36 |
| NĐ 208/2026 Điều 35 (hoàn vé) k5–k8 | Đã xác minh một phần (chỉ k5–k8 ở trang 30) | R-19, trang 30 |
| TT 48/2026 Điều 4–8: hoàn vé, mức bồi thường, thời hạn, khiếu nại, giờ mở/đóng quầy | Đã xác minh bản chính thức | R-01 |
| Luật 91/2025/QH15 Điều 2, 9, 19 | Đã xác minh bản chính thức | R-23 |
| NĐ 356/2025 Điều 5–6 | Đã xác minh một phần (trang 4–5) | R-24 |
| Luật HKDD 130/2025/QH15 Điều 53 | CHƯA xác minh bản chính thức (chỉ nguồn thứ cấp) | R-20 |
| NĐ 208/2026 các điều khác (ngoài Điều 30–31, 35–40) và các phụ lục | CHƯA đọc | — |
| NĐ 356/2025 danh mục dữ liệu cá nhân cơ bản/nhạy cảm và các điều khác | CHƯA đọc | — |
| Việc bãi bỏ TT 81/2014, TT 14/2015 | CHƯA xác minh | — |
| Tên và mức hiệu lực của quy định riêng cho chuyến bay quốc tế | Không nghiên cứu (ngoài phạm vi nội địa của Airrest) | — |

Trong các điều đã đọc (NĐ 208 Điều 36–40, TT 48 Điều 3–8) không có: thời hạn hãng phải phản hồi đề nghị lưu trú; thủ tục “đề nghị hỗ trợ lưu trú”; cách hãng phải sắp xếp nơi ở (khách sạn, voucher). Đây là nhận xét theo các điều đã đọc, không phải kết luận về toàn bộ hệ thống pháp luật.

## F. Thay đổi giữa v0.3 và v0.4

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

## G. Thay đổi v0.5 (audit)

| Hạng mục | Thay đổi |
|---|---|
| Audit v0.4 | Xem READINESS_AUDIT.md: 17 phát hiện (B1–B3), sửa các lỗi diễn đạt pháp lý, từ điển trạng thái, hậu tố Blocked, trạng thái trong OPEN_QUESTIONS. |
| Sổ quyết định | PRODUCT_DECISION_REGISTER.md: 29 quyết định cho PO (7 P0), bảng trả lời. |

