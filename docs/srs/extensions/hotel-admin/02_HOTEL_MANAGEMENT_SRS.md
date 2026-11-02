# 02. Đặc tả Quản lý khách sạn (Hotel Management)

Phiên bản v0.1 Draft · 2026-10-26 · Trạng thái **DRAFT, chưa được phê duyệt**. Tài liệu bổ sung độc lập, không thay thế SRS hiện hành.

## 1. Phạm vi và mục tiêu

Cho phép đối tác lưu trú quản lý hồ sơ, phòng, giá, tồn phòng, xử lý đặt phòng, vận hành lưu trú ở mức cần thiết cho Airrest, đối soát và báo cáo. Mục tiêu nghiệp vụ: Airrest chỉ hiển thị cơ sở còn phòng và đang nhận khách (BR-003 hiện hành), giá nhất quán (BR-005), không đặt vượt tồn, và khách sạn thao tác trong đúng phạm vi dữ liệu của mình.

**Không thuộc phạm vi mặc định:** chức năng PMS (dọn phòng, bàn giao ca, housekeeping), hóa đơn, thu và giữ tiền. Các mục này là OQ (OQ-54, OQ-43).

## 2. Actor

ACT-12 chủ/quản lý khách sạn, ACT-13 nhân viên khách sạn, ACT-14 lái xe (có điều kiện), ACT-01 người dùng cuối (tạo yêu cầu), ACT-07/08/09/10/11 nhân sự Airrest (xem, duyệt, hỗ trợ), ACT-15 hệ thống ngoài (không giả định). Chi tiết ở `01_ACTORS_AND_CAPABILITY_MAP.md`.

## 3. Tổng hợp

49 yêu cầu: Blocked 17, Deferred 4, Proposed 28; ưu tiên đề xuất: Could 10, Must 23, Should 11, Won't 5.

| ID | Tên | Module | Actor | Ưu tiên | Phase | Trạng thái |
|---|---|---|---|---|---|---|
| HM-FR-001 | Tạo hồ sơ đối tác (bản nháp) | HM-C01 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-002 | Cập nhật hồ sơ đối tác | HM-C01 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-003 | Gửi duyệt, theo dõi kết quả và bổ sung thông tin | HM-C01 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-004 | Hồ sơ pháp lý và tài liệu xác minh | HM-C01 | ACT-12 | Should | Hotel Operations | Blocked |
| HM-FR-005 | Lịch sử thay đổi hồ sơ | HM-C01 | ACT-12 | Must | Foundation | Proposed |
| HM-FR-006 | Quản lý loại phòng | HM-C02 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-007 | Số lượng phòng vật lý theo loại | HM-C02 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-008 | Trạng thái kinh doanh của loại phòng | HM-C02 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-009 | Giá theo loại phòng, ngày và số khách | HM-C03 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-010 | Gói giá, mùa và ngày đặc biệt | HM-C03 | ACT-12 | Could | Hotel Operations | Deferred |
| HM-FR-011 | Thuế, phí và phụ thu | HM-C03 | ACT-12 | Must | Hotel Operations | Blocked |
| HM-FR-012 | Điều kiện nhận/trả phòng, trẻ em, giường phụ và số khách tối đa | HM-C03 | ACT-12 | Should | Hotel Operations | Proposed |
| HM-FR-013 | Chính sách hủy, hoàn tiền và thay đổi đặt phòng | HM-C03 | ACT-12 | Must | Hotel Operations | Blocked |
| HM-FR-014 | Hiệu lực và lịch sử giá | HM-C03 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-015 | Mô hình tồn phòng theo ngày | HM-C04 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-016 | Cập nhật tồn phòng và đóng/mở bán | HM-C04 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-017 | Ngày không nhận khách và thời gian bảo trì | HM-C04 | ACT-12 | Should | Hotel Operations | Proposed |
| HM-FR-018 | Giữ chỗ tạm thời | HM-C04 | Hệ thống | Must | Hotel Operations | Blocked |
| HM-FR-019 | Chống đặt vượt và xử lý đồng thời | HM-C04 | Hệ thống | Must | Hotel Operations | Proposed |
| HM-FR-020 | Đồng bộ tồn phòng với hệ thống ngoài (PMS/channel manager) | HM-C04 | ACT-15 | Could | Advanced | Blocked |
| HM-FR-021 | Danh sách và tìm kiếm đặt phòng | HM-C05 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-022 | Chi tiết đặt phòng | HM-C05 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-023 | Xác nhận yêu cầu đặt phòng | HM-C05 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-024 | Từ chối yêu cầu đặt phòng | HM-C05 | ACT-12 | Must | Hotel Operations | Proposed |
| HM-FR-025 | Hết hạn yêu cầu chờ xác nhận | HM-C05 | Hệ thống | Must | Hotel Operations | Blocked |
| HM-FR-026 | Hết phòng hoặc thay đổi điều kiện sau khi khách gửi yêu cầu | HM-C05 | ACT-12 | Should | Hotel Operations | Proposed |
| HM-FR-027 | Hủy, đổi lịch và khách không đến | HM-C05 | ACT-01 | Should | Hotel Operations | Blocked |
| HM-FR-028 | Lịch sử trạng thái đặt phòng | HM-C05 | ACT-12 | Must | Foundation | Proposed |
| HM-FR-029 | Danh sách khách dự kiến đến và rời đi | HM-C06 | ACT-12 | Should | Hotel Operations | Proposed |
| HM-FR-030 | Xác nhận nhận phòng và trả phòng | HM-C06 | ACT-12 | Could | Hotel Operations | Deferred |
| HM-FR-031 | Khách đến muộn, không đến hoặc cần hỗ trợ | HM-C06 | ACT-12 | Could | Hotel Operations | Blocked |
| HM-FR-032 | Trạng thái phòng vận hành (dọn, bảo trì, sẵn sàng) | HM-C06 | ACT-13 | Won't | Advanced | Deferred |
| HM-FR-033 | Ghi chú vận hành và bàn giao ca | HM-C06 | ACT-12 | Could | Hotel Operations | Deferred |
| HM-FR-034 | Xử lý sự cố trong thời gian lưu trú | HM-C06 | ACT-12 | Should | System Operations | Proposed |
| HM-FR-035 | Đón khách bằng xe của khách sạn (lái xe) | HM-C06 | ACT-14 | Could | Advanced | Blocked |
| HM-FR-036 | Ghi nhận mô hình thu tiền của đặt phòng | HM-C07 | ACT-12 | Won't | Advanced | Blocked |
| HM-FR-037 | Đối soát đặt phòng, lưu trú và giao dịch | HM-C07 | ACT-10 | Won't | Advanced | Blocked |
| HM-FR-038 | Lịch sử thanh toán, hoàn tiền và công nợ | HM-C07 | ACT-10 | Won't | Advanced | Blocked |
| HM-FR-039 | Ghi nhận sự cố chất lượng đối tác | HM-C08 | ACT-08 | Should | System Operations | Proposed |
| HM-FR-040 | Chỉ số chất lượng khách quan | HM-C08 | ACT-08 | Could | System Operations | Blocked |
| HM-FR-041 | Phản hồi và khiếu nại của khách sạn | HM-C08 | ACT-12 | Should | System Operations | Proposed |
| HM-FR-042 | Thông báo yêu cầu mới và kết quả | HM-C09 | ACT-12 | Must | Hotel Operations | Blocked |
| HM-FR-043 | Nhắc yêu cầu sắp hết hạn | HM-C09 | ACT-12 | Could | Hotel Operations | Blocked |
| HM-FR-044 | Lịch sử thông báo, lỗi gửi, retry và chống gửi trùng | HM-C09 | ACT-12 | Must | Hotel Operations | Blocked |
| HM-FR-045 | Báo cáo yêu cầu và đặt phòng | HM-C10 | ACT-12 | Should | System Operations | Proposed |
| HM-FR-046 | Báo cáo tồn phòng và tỷ lệ sử dụng | HM-C10 | ACT-12 | Could | System Operations | Proposed |
| HM-FR-047 | Báo cáo hiệu suất phản hồi | HM-C10 | ACT-12 | Could | System Operations | Proposed |
| HM-FR-048 | Báo cáo tài chính | HM-C10 | ACT-10 | Won't | Advanced | Blocked |
| HM-FR-049 | Bộ lọc và xuất dữ liệu báo cáo | HM-C10 | ACT-12 | Should | System Operations | Proposed |

## 4. Yêu cầu chức năng HM-FR

### HM-C01 Hồ sơ đối tác

#### HM-FR-001 — Tạo hồ sơ đối tác (bản nháp)

| Trường | Nội dung |
|---|---|
| ID | HM-FR-001 |
| Tên | Tạo hồ sơ đối tác (bản nháp) |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: người có quyền của khách sạn tạo hồ sơ đối tác ở trạng thái Nháp gồm tên, địa chỉ, tọa độ, thông tin liên hệ, loại hình lưu trú và tiện ích. |
| Actor | ACT-12 |
| Trigger | Chủ/quản lý khách sạn chọn “Tạo hồ sơ” trong cổng đối tác. |
| Preconditions | • Có tài khoản ACT-12 đã kích hoạt (SA-FR-001)<br>• Chưa có hồ sơ trùng (HM-BR-001) |
| Main flow | 1. Nhập các trường bắt buộc<br>2. Hệ thống kiểm tra hợp lệ và tính duy nhất<br>3. Lưu hồ sơ ở trạng thái Nháp và sinh mã đối tác |
| Alternate / error flows | • Trường thiếu hoặc sai định dạng: báo lỗi từng trường, giữ dữ liệu đã nhập<br>• Trùng hồ sơ: nêu hồ sơ nghi trùng, không tạo mới<br>• Lỗi lưu: thử lại, không tạo bản ghi nửa chừng |
| Postconditions | • Hồ sơ ở trạng thái Nháp, có mã đối tác duy nhất, gắn với tenant của người tạo |
| Business rules | HM-BR-001, HM-BR-002 |
| Data requirements | HM-DATA-001 |
| Authorization (đề xuất, deny by default) | ACT-12: C, R, U (hồ sơ của tenant mình); ACT-13: R; ACT-07/08: R |
| Audit | partner.created |
| Acceptance criteria (Proposed) | HM-FR-001.AC1: Thiếu trường bắt buộc → không lưu và có thông báo cho từng trường<br>HM-FR-001.AC2: Tạo hồ sơ trùng khóa duy nhất → bị từ chối với thông báo nêu hồ sơ hiện có<br>HM-FR-001.AC3: Hồ sơ mới có mã duy nhất và trạng thái Nháp<br>HM-FR-001.AC4: Người tạo không thấy hồ sơ của tenant khác |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-025, UIR-012 |
| Dependency | — |
| OQ / Decision | OQ-51 → D-38, OQ-55 → D-42 |

#### HM-FR-002 — Cập nhật hồ sơ đối tác

| Trường | Nội dung |
|---|---|
| ID | HM-FR-002 |
| Tên | Cập nhật hồ sơ đối tác |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: người có quyền sửa hồ sơ; thay đổi trường quan trọng (tên pháp lý, địa chỉ, loại hình) có thể đưa hồ sơ về trạng thái chờ duyệt lại, danh sách trường “quan trọng” do PO quyết định. |
| Actor | ACT-12; ACT-13 (trường vận hành) |
| Trigger | Người dùng bấm “Lưu thay đổi” trên hồ sơ. |
| Preconditions | • Hồ sơ tồn tại<br>• Người dùng có quyền trên tenant<br>• Hồ sơ không ở trạng thái Từ chối cuối |
| Main flow | 1. Sửa trường<br>2. Hệ thống so sánh với bản hiện tại<br>3. Lưu, ghi lịch sử thay đổi, nếu trường quan trọng thì chuyển trạng thái theo SM-01 |
| Alternate / error flows | • Cập nhật đồng thời: bản cũ bị từ chối với thông báo xung đột phiên bản<br>• Trường quan trọng khi đang Hoạt động: cảnh báo trước khi gửi duyệt lại |
| Postconditions | • Hồ sơ lưu bản mới và lịch sử có giá trị trước/sau |
| Business rules | HM-BR-003 |
| Data requirements | HM-DATA-001, HM-DATA-003 |
| Authorization (đề xuất, deny by default) | ACT-12: U; ACT-13: U trường vận hành (HM-BR-003); ACT-07: U có lý do |
| Audit | partner.updated |
| Acceptance criteria (Proposed) | HM-FR-002.AC1: Hai người sửa cùng lúc: người lưu sau nhận thông báo xung đột<br>HM-FR-002.AC2: Mỗi lần lưu tạo một dòng lịch sử có người, thời điểm, trước/sau<br>HM-FR-002.AC3: Sửa trường quan trọng khi Hoạt động → hệ thống hiển thị cảnh báo và trạng thái sau lưu theo quyết định D-38 |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-001 |
| OQ / Decision | OQ-51 → D-38 |

#### HM-FR-003 — Gửi duyệt, theo dõi kết quả và bổ sung thông tin

| Trường | Nội dung |
|---|---|
| ID | HM-FR-003 |
| Tên | Gửi duyệt, theo dõi kết quả và bổ sung thông tin |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khách sạn gửi hồ sơ để Airrest duyệt, xem kết quả (đã duyệt, từ chối, cần bổ sung) và lý do. |
| Actor | ACT-12; ACT-07/08 (người duyệt, xem SA-FR-012) |
| Trigger | Chủ/quản lý bấm “Gửi duyệt”. |
| Preconditions | • Hồ sơ Nháp hoặc Cần bổ sung<br>• Đủ trường bắt buộc (HM-BR-002) |
| Main flow | 1. Hệ thống kiểm tra đủ điều kiện gửi<br>2. Chuyển trạng thái sang Chờ duyệt<br>3. Thông báo cho bộ phận duyệt<br>4. Khi có kết quả, thông báo cho khách sạn kèm lý do |
| Alternate / error flows | • Thiếu điều kiện gửi: liệt kê mục thiếu<br>• Gửi lặp: không tạo yêu cầu duyệt thứ hai (idempotent) |
| Postconditions | • Hồ sơ ở Chờ duyệt, một yêu cầu duyệt đang mở |
| Business rules | HM-BR-002, HM-BR-004 |
| Data requirements | HM-DATA-001, HM-DATA-003 |
| Authorization (đề xuất, deny by default) | ACT-12: S, R; ACT-07/08: A (SA-FR-012) |
| Audit | partner.submitted |
| Acceptance criteria (Proposed) | HM-FR-003.AC1: Bấm gửi hai lần liên tiếp tạo đúng 1 yêu cầu duyệt<br>HM-FR-003.AC2: Hồ sơ thiếu trường bắt buộc không gửi được và có danh sách mục thiếu<br>HM-FR-003.AC3: Kết quả Từ chối hoặc Cần bổ sung luôn kèm lý do hiển thị cho khách sạn |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: SM-01 |
| Dependency | HM-FR-001, SA-FR-012 |
| OQ / Decision | OQ-47 → D-34, OQ-51 → D-38 |

#### HM-FR-004 — Hồ sơ pháp lý và tài liệu xác minh

| Trường | Nội dung |
|---|---|
| ID | HM-FR-004 |
| Tên | Hồ sơ pháp lý và tài liệu xác minh |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: đối tác đính kèm tài liệu xác minh; loại tài liệu bắt buộc chưa được xác định. |
| Actor | ACT-12; ACT-07/08 |
| Trigger | Chủ/quản lý tải tài liệu lên hồ sơ. |
| Preconditions | • Hồ sơ tồn tại<br>• Loại tài liệu thuộc danh mục cho phép (SA-FR-015) |
| Main flow | 1. Chọn loại tài liệu<br>2. Tải tệp<br>3. Hệ thống kiểm tra loại tệp, kích thước<br>4. Lưu tài liệu, trạng thái Chờ xác minh |
| Alternate / error flows | • Tệp sai định dạng hoặc vượt giới hạn: từ chối kèm lý do<br>• Tệp có mã độc theo kiểm tra (nếu có năng lực): từ chối |
| Postconditions | • Tài liệu gắn với hồ sơ, có trạng thái xác minh |
| Business rules | HM-BR-005 |
| Data requirements | HM-DATA-002 |
| Authorization (đề xuất, deny by default) | ACT-12: C, R; ACT-07/08: R, A (xác minh); ACT-13: không truy cập |
| Audit | partner.document.uploaded; partner.document.viewed |
| Acceptance criteria (Proposed) | HM-FR-004.AC1: Tệp sai loại bị từ chối với lý do<br>HM-FR-004.AC2: Tài liệu chỉ hiển thị cho ACT-12 của tenant đó và nhân sự được cấp quyền<br>HM-FR-004.AC3: Lượt xem tài liệu được ghi audit |
| Priority · Phase | Should (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-001 |
| OQ / Decision | OQ-51 → D-38 |

#### HM-FR-005 — Lịch sử thay đổi hồ sơ

| Trường | Nội dung |
|---|---|
| ID | HM-FR-005 |
| Tên | Lịch sử thay đổi hồ sơ |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: xem lịch sử mọi thay đổi hồ sơ và trạng thái, gồm người thực hiện, thời điểm và giá trị trước/sau. |
| Actor | ACT-12; ACT-07/08/11 |
| Trigger | Người dùng mở tab Lịch sử. |
| Preconditions | • Hồ sơ tồn tại |
| Main flow | 1. Hệ thống liệt kê thay đổi theo thời gian<br>2. Cho lọc theo người, loại thay đổi<br>3. Hiển thị trước/sau cho trường không nhạy cảm |
| Alternate / error flows | • Trường nhạy cảm: hiển thị che theo quyền (SA-FR-010) |
| Postconditions | • Lịch sử chỉ đọc, không sửa được |
| Business rules | HM-BR-006 |
| Data requirements | HM-DATA-003 |
| Authorization (đề xuất, deny by default) | ACT-12: R (tenant mình); ACT-07/08/11: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-005.AC1: Lịch sử không có thao tác sửa hoặc xóa<br>HM-FR-005.AC2: Mỗi dòng có người, thời điểm, giá trị trước/sau<br>HM-FR-005.AC3: Trường nhạy cảm bị che với người không có quyền xem |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-002, SA-FR-025 |
| OQ / Decision | — |


### HM-C02 Phòng và sức chứa

#### HM-FR-006 — Quản lý loại phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-006 |
| Tên | Quản lý loại phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: tạo, sửa, ngừng dùng loại phòng với mã, tên, số khách tối đa, số giường, diện tích và tiện nghi. |
| Actor | ACT-12; ACT-13 (xem) |
| Trigger | Quản lý mở “Loại phòng”. |
| Preconditions | • Hồ sơ ở trạng thái cho phép khai báo phòng (OQ-51) |
| Main flow | 1. Tạo loại phòng với mã duy nhất trong khách sạn<br>2. Nhập thuộc tính<br>3. Lưu<br>4. Có thể sửa hoặc ngừng dùng |
| Alternate / error flows | • Mã trùng trong khách sạn: từ chối<br>• Số khách tối đa hoặc số giường ≤ 0: báo lỗi<br>• Ngừng dùng loại phòng còn đặt phòng tương lai: cảnh báo, chặn nếu còn đặt phòng đã xác nhận |
| Postconditions | • Loại phòng có mã duy nhất, thuộc đúng khách sạn |
| Business rules | HM-BR-007 |
| Data requirements | HM-DATA-004 |
| Authorization (đề xuất, deny by default) | ACT-12: C, R, U, X; ACT-13: R |
| Audit | roomtype.created; roomtype.updated; roomtype.disabled |
| Acceptance criteria (Proposed) | HM-FR-006.AC1: Mã loại phòng trùng trong cùng khách sạn bị từ chối<br>HM-FR-006.AC2: Số khách tối đa phải là số nguyên ≥ 1<br>HM-FR-006.AC3: Ngừng dùng loại phòng có đặt phòng đã xác nhận trong tương lai bị chặn kèm danh sách đặt phòng liên quan |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-026 |
| Dependency | HM-FR-001 |
| OQ / Decision | — |

#### HM-FR-007 — Số lượng phòng vật lý theo loại

| Trường | Nội dung |
|---|---|
| ID | HM-FR-007 |
| Tên | Số lượng phòng vật lý theo loại |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khai báo số phòng vật lý của từng loại; đây là trần của tồn phòng có thể bán, không phải tồn phòng. |
| Actor | ACT-12 |
| Trigger | Quản lý nhập số phòng. |
| Preconditions | • Loại phòng tồn tại |
| Main flow | 1. Nhập số phòng vật lý<br>2. Hệ thống kiểm tra ≥ tổng phòng đã giữ/đặt/không khả dụng trong tương lai<br>3. Lưu |
| Alternate / error flows | • Giảm xuống dưới số đã cam kết: từ chối nêu ngày vi phạm |
| Postconditions | • Số phòng vật lý lưu và dùng làm trần cho HM-FR-015 |
| Business rules | HM-BR-008 |
| Data requirements | HM-DATA-004 |
| Authorization (đề xuất, deny by default) | ACT-12: U |
| Audit | roomtype.capacity.changed |
| Acceptance criteria (Proposed) | HM-FR-007.AC1: Không giảm số phòng vật lý xuống thấp hơn số phòng đã cam kết trong bất kỳ ngày tương lai<br>HM-FR-007.AC2: Thông báo lỗi nêu ngày và số lượng vi phạm<br>HM-FR-007.AC3: Mọi thay đổi có audit |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-006 |
| OQ / Decision | — |

#### HM-FR-008 — Trạng thái kinh doanh của loại phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-008 |
| Tên | Trạng thái kinh doanh của loại phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: phân biệt trạng thái kinh doanh (đang bán, tạm ngừng bán, ngừng dùng) với trạng thái sử dụng của từng phòng. |
| Actor | ACT-12 |
| Trigger | Quản lý đổi trạng thái kinh doanh. |
| Preconditions | • Loại phòng tồn tại |
| Main flow | 1. Chọn trạng thái<br>2. Hệ thống kiểm tra tác động lên đặt phòng tương lai<br>3. Áp dụng từ thời điểm hiệu lực |
| Alternate / error flows | • Có đặt phòng đã xác nhận bị ảnh hưởng: chặn hoặc yêu cầu xử lý trước |
| Postconditions | • Loại phòng không còn xuất hiện cho khách khi tạm ngừng hoặc ngừng dùng |
| Business rules | HM-BR-007, HM-BR-009 |
| Data requirements | HM-DATA-004 |
| Authorization (đề xuất, deny by default) | ACT-12: U |
| Audit | roomtype.status.changed |
| Acceptance criteria (Proposed) | HM-FR-008.AC1: Loại phòng tạm ngừng bán không xuất hiện trong kết quả tìm kiếm của người dùng cuối<br>HM-FR-008.AC2: Đặt phòng đã xác nhận không bị tự động hủy khi đổi trạng thái<br>HM-FR-008.AC3: Trạng thái và người đổi được ghi audit |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-006 |
| OQ / Decision | — |


### HM-C03 Giá và chính sách

#### HM-FR-009 — Giá theo loại phòng, ngày và số khách

| Trường | Nội dung |
|---|---|
| ID | HM-FR-009 |
| Tên | Giá theo loại phòng, ngày và số khách |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khai báo giá theo loại phòng, ngày lưu trú và số khách; không có giá mặc định do hệ thống tự đặt. |
| Actor | ACT-12 |
| Trigger | Quản lý mở “Giá”. |
| Preconditions | • Loại phòng tồn tại |
| Main flow | 1. Chọn loại phòng và khoảng ngày<br>2. Nhập giá theo số khách<br>3. Hệ thống kiểm tra<br>4. Lưu với thời điểm hiệu lực |
| Alternate / error flows | • Giá âm hoặc 0: từ chối<br>• Khoảng ngày chồng lấn với giá hiện có: hỏi ghi đè hay hủy<br>• Giá thay đổi lớn bất thường: cảnh báo xác nhận (ngưỡng do PO quyết định) |
| Postconditions | • Giá có hiệu lực theo ngày |
| Business rules | HM-BR-010 |
| Data requirements | HM-DATA-005, HM-DATA-006 |
| Authorization (đề xuất, deny by default) | ACT-12: C, R, U; ACT-13: R; ACT-10: R |
| Audit | rate.changed |
| Acceptance criteria (Proposed) | HM-FR-009.AC1: Giá phải là số dương theo đơn vị tiền tệ cấu hình<br>HM-FR-009.AC2: Khoảng ngày chồng lấn phải có xác nhận ghi đè<br>HM-FR-009.AC3: Mỗi thay đổi lưu giá cũ, giá mới, người, thời điểm |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-026, BR-005 |
| Dependency | HM-FR-006 |
| OQ / Decision | OQ-60 → D-47, OQ-62 → D-49 |

#### HM-FR-010 — Gói giá, mùa và ngày đặc biệt

| Trường | Nội dung |
|---|---|
| ID | HM-FR-010 |
| Tên | Gói giá, mùa và ngày đặc biệt |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: hỗ trợ các biến thể giá (ngày thường, cuối tuần, mùa cao điểm, gói giá) nếu PO xác nhận cần. |
| Actor | ACT-12 |
| Trigger | Quản lý tạo gói giá hoặc lịch mùa. |
| Preconditions | • Có giá cơ sở (HM-FR-009) |
| Main flow | 1. Tạo gói giá hoặc mùa<br>2. Gán khoảng ngày và quy tắc<br>3. Hệ thống tính giá hiệu lực theo thứ tự ưu tiên đã định |
| Alternate / error flows | • Hai quy tắc cùng áp dụng một ngày: dùng thứ tự ưu tiên; thiếu thứ tự: từ chối lưu |
| Postconditions | • Mỗi ngày có đúng một giá hiệu lực xác định |
| Business rules | HM-BR-010, HM-BR-011 |
| Data requirements | HM-DATA-005 |
| Authorization (đề xuất, deny by default) | ACT-12: C, R, U |
| Audit | rate.plan.changed |
| Acceptance criteria (Proposed) | HM-FR-010.AC1: Mỗi ngày và loại phòng chỉ có đúng một giá hiệu lực<br>HM-FR-010.AC2: Thứ tự ưu tiên các quy tắc được hiển thị cho người sửa<br>HM-FR-010.AC3: Xem trước giá theo ngày trước khi lưu |
| Priority · Phase | Could (đề xuất) · Hotel Operations |
| Status | Deferred |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-009 |
| OQ / Decision | OQ-61 → D-48, OQ-62 → D-49 |

#### HM-FR-011 — Thuế, phí và phụ thu

| Trường | Nội dung |
|---|---|
| ID | HM-FR-011 |
| Tên | Thuế, phí và phụ thu |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khai báo thuế, phí, phụ thu; cách hiển thị “giá tổng” phải nhất quán với BR-005 của SRS hiện hành. |
| Actor | ACT-12; ACT-07 (danh mục) |
| Trigger | Quản lý cấu hình thuế phí. |
| Preconditions | • Có giá cơ sở |
| Main flow | 1. Chọn khoản thu<br>2. Nhập mức hoặc tỷ lệ<br>3. Chọn bao gồm trong giá hay cộng thêm<br>4. Lưu |
| Alternate / error flows | • Khoản thu không thuộc danh mục: từ chối<br>• Thay đổi làm đổi giá tổng đang hiển thị: cảnh báo |
| Postconditions | • Giá tổng tính nhất quán từ giá cơ sở và các khoản thu |
| Business rules | HM-BR-010, HM-BR-012 |
| Data requirements | HM-DATA-007 |
| Authorization (đề xuất, deny by default) | ACT-12: C, R, U; ACT-07: danh mục |
| Audit | charge.changed |
| Acceptance criteria (Proposed) | HM-FR-011.AC1: Giá tổng ở danh sách, chi tiết và bước đặt chỗ bằng nhau (khớp BR-005)<br>HM-FR-011.AC2: Khoản thu nằm ngoài danh mục bị từ chối<br>HM-FR-011.AC3: Mọi thay đổi có audit |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: BR-005, D-06 |
| Dependency | HM-FR-009 |
| OQ / Decision | OQ-62 → D-49, OQ-43 → D-30, OQ-60 → D-47 |

#### HM-FR-012 — Điều kiện nhận/trả phòng, trẻ em, giường phụ và số khách tối đa

| Trường | Nội dung |
|---|---|
| ID | HM-FR-012 |
| Tên | Điều kiện nhận/trả phòng, trẻ em, giường phụ và số khách tối đa |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khai báo giờ nhận/trả phòng, quy định trẻ em, giường phụ và số khách tối đa. |
| Actor | ACT-12 |
| Trigger | Quản lý chỉnh chính sách lưu trú. |
| Preconditions | • Loại phòng tồn tại |
| Main flow | 1. Nhập giờ nhận/trả<br>2. Nhập quy định trẻ em, giường phụ<br>3. Lưu phiên bản chính sách |
| Alternate / error flows | • Số khách tối đa vượt sức chứa loại phòng: từ chối |
| Postconditions | • Chính sách có phiên bản và hiệu lực |
| Business rules | HM-BR-013 |
| Data requirements | HM-DATA-008 |
| Authorization (đề xuất, deny by default) | ACT-12: C, R, U |
| Audit | policy.changed |
| Acceptance criteria (Proposed) | HM-FR-012.AC1: Số khách tối đa của chính sách không vượt sức chứa loại phòng<br>HM-FR-012.AC2: Chính sách mới có ngày hiệu lực và không đổi đặt phòng đã xác nhận trước đó<br>HM-FR-012.AC3: Thay đổi có audit |
| Priority · Phase | Should (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-011 |
| Dependency | HM-FR-006 |
| OQ / Decision | — |

#### HM-FR-013 — Chính sách hủy, hoàn tiền và thay đổi đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-013 |
| Tên | Chính sách hủy, hoàn tiền và thay đổi đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khai báo chính sách hủy/hoàn/đổi; mọi quy tắc cụ thể chưa có căn cứ nên không đặt mặc định. |
| Actor | ACT-12; ACT-07 |
| Trigger | Quản lý chọn chính sách hủy cho loại phòng hoặc gói giá. |
| Preconditions | • Có chính sách mẫu được PO duyệt (OQ-46) |
| Main flow | 1. Chọn từ mẫu chính sách đã được duyệt<br>2. Gán cho gói giá<br>3. Lưu phiên bản |
| Alternate / error flows | • Chưa có mẫu được duyệt: chức năng bị khóa |
| Postconditions | • Chính sách hủy áp dụng cho đặt phòng mới từ ngày hiệu lực |
| Business rules | HM-BR-014 |
| Data requirements | HM-DATA-008 |
| Authorization (đề xuất, deny by default) | ACT-12: R, U (chọn mẫu); ACT-07: C, U (mẫu) |
| Audit | cancelpolicy.changed |
| Acceptance criteria (Proposed) | HM-FR-013.AC1: Khách sạn chỉ chọn được mẫu chính sách đã được duyệt<br>HM-FR-013.AC2: Đặt phòng đã xác nhận giữ chính sách tại thời điểm đặt<br>HM-FR-013.AC3: Thay đổi mẫu có người duyệt |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-011 (chính sách huỷ) |
| Dependency | HM-FR-009 |
| OQ / Decision | OQ-46 → D-33, OQ-43 → D-30 |

#### HM-FR-014 — Hiệu lực và lịch sử giá

| Trường | Nội dung |
|---|---|
| ID | HM-FR-014 |
| Tên | Hiệu lực và lịch sử giá |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: mỗi giá có thời điểm bắt đầu/kết thúc hiệu lực và lịch sử thay đổi không sửa được. |
| Actor | ACT-12; ACT-10; ACT-11 |
| Trigger | Người dùng mở lịch sử giá. |
| Preconditions | • Có giá đã lưu |
| Main flow | 1. Lọc theo loại phòng và khoảng ngày<br>2. Hiển thị giá, hiệu lực, người đổi, thời điểm |
| Alternate / error flows | • Không có dữ liệu: trạng thái rỗng |
| Postconditions | • Lịch sử chỉ đọc |
| Business rules | HM-BR-006, HM-BR-010 |
| Data requirements | HM-DATA-006 |
| Authorization (đề xuất, deny by default) | ACT-12: R; ACT-10/11: R; ACT-13: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-014.AC1: Không có thao tác sửa hoặc xóa lịch sử giá<br>HM-FR-014.AC2: Mỗi dòng có giá cũ, giá mới, người đổi, thời điểm<br>HM-FR-014.AC3: Đặt phòng đã xác nhận truy được đúng giá tại thời điểm đặt |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-009 |
| OQ / Decision | — |


### HM-C04 Tồn phòng và tình trạng sẵn có

#### HM-FR-015 — Mô hình tồn phòng theo ngày

| Trường | Nội dung |
|---|---|
| ID | HM-FR-015 |
| Tên | Mô hình tồn phòng theo ngày |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: mỗi (loại phòng, ngày) có năm đại lượng tách biệt: phòng vật lý, tồn có thể bán, đã giữ chỗ, đã đặt, không khả dụng; không mặc định chúng đồng nhất. |
| Actor | ACT-12; ACT-13; hệ thống |
| Trigger | Hệ thống tính tồn khi có thay đổi đặt phòng, giữ chỗ hoặc đóng bán. |
| Preconditions | • Loại phòng có số phòng vật lý (HM-FR-007) |
| Main flow | 1. Hệ thống lưu từng đại lượng riêng<br>2. Tính tồn có thể bán = vật lý − giữ chỗ − đã đặt − không khả dụng<br>3. Không cho kết quả âm |
| Alternate / error flows | • Phát hiện tồn âm do dữ liệu cũ: đánh dấu bất nhất, chặn bán ngày đó và báo cho vận hành |
| Postconditions | • Tồn có thể bán luôn ≥ 0 và nhất quán với các đại lượng còn lại |
| Business rules | HM-BR-015 |
| Data requirements | HM-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-12/13: R; hệ thống: C, U; ACT-08: R |
| Audit | inventory.recomputed |
| Acceptance criteria (Proposed) | HM-FR-015.AC1: Với mọi ngày: tồn có thể bán = vật lý − giữ chỗ − đã đặt − không khả dụng<br>HM-FR-015.AC2: Tồn có thể bán không bao giờ âm<br>HM-FR-015.AC3: Hệ thống cảnh báo khi phát hiện bản ghi vi phạm công thức |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: BR-003; FR-026 |
| Dependency | HM-FR-007 |
| OQ / Decision | — |

#### HM-FR-016 — Cập nhật tồn phòng và đóng/mở bán

| Trường | Nội dung |
|---|---|
| ID | HM-FR-016 |
| Tên | Cập nhật tồn phòng và đóng/mở bán |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khách sạn đóng hoặc mở bán theo ngày/loại phòng và điều chỉnh số phòng không khả dụng. |
| Actor | ACT-12; ACT-13 |
| Trigger | Nhân sự chọn ngày/loại phòng và thao tác đóng/mở. |
| Preconditions | • Loại phòng đang bán |
| Main flow | 1. Chọn phạm vi ngày và loại phòng<br>2. Chọn đóng hoặc mở<br>3. Hệ thống kiểm tra không vi phạm số đã cam kết<br>4. Lưu và cập nhật tồn có thể bán |
| Alternate / error flows | • Đóng bán ngày đã có đặt phòng xác nhận: không hủy đặt phòng, chỉ chặn bán thêm<br>• Phạm vi quá lớn: yêu cầu xác nhận |
| Postconditions | • Tồn có thể bán cập nhật, không đụng đặt phòng đã xác nhận |
| Business rules | HM-BR-015, HM-BR-016 |
| Data requirements | HM-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-12: U; ACT-13: U (đóng/mở; không đổi số phòng vật lý) |
| Audit | inventory.closed; inventory.opened |
| Acceptance criteria (Proposed) | HM-FR-016.AC1: Đóng bán không làm đổi trạng thái đặt phòng đã xác nhận<br>HM-FR-016.AC2: Sau khi đóng bán, người dùng cuối không đặt thêm được ngày đó<br>HM-FR-016.AC3: Thao tác ghi audit với phạm vi ngày và loại phòng |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-026 |
| Dependency | HM-FR-015 |
| OQ / Decision | — |

#### HM-FR-017 — Ngày không nhận khách và thời gian bảo trì

| Trường | Nội dung |
|---|---|
| ID | HM-FR-017 |
| Tên | Ngày không nhận khách và thời gian bảo trì |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: đặt khoảng ngày không nhận khách hoặc bảo trì, tách với đóng bán thông thường. |
| Actor | ACT-12 |
| Trigger | Quản lý đặt khoảng không nhận khách. |
| Preconditions | • Loại phòng tồn tại |
| Main flow | 1. Chọn khoảng ngày và lý do<br>2. Hệ thống tính phòng không khả dụng<br>3. Lưu |
| Alternate / error flows | • Khoảng ngày chồng với đặt phòng đã xác nhận: chặn và liệt kê |
| Postconditions | • Phòng được tính là không khả dụng trong khoảng đã chọn |
| Business rules | HM-BR-015, HM-BR-016 |
| Data requirements | HM-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-12: C, U, X |
| Audit | inventory.blackout.set |
| Acceptance criteria (Proposed) | HM-FR-017.AC1: Khoảng không nhận khách chồng với đặt phòng đã xác nhận bị chặn kèm danh sách<br>HM-FR-017.AC2: Lý do bắt buộc<br>HM-FR-017.AC3: Huỷ khoảng không nhận khách trả lại tồn có thể bán |
| Priority · Phase | Should (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-015 |
| OQ / Decision | — |

#### HM-FR-018 — Giữ chỗ tạm thời

| Trường | Nội dung |
|---|---|
| ID | HM-FR-018 |
| Tên | Giữ chỗ tạm thời |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất: khi người dùng cuối gửi yêu cầu, hệ thống giữ tạm tồn trong một thời hạn; thời hạn giữ chưa quyết định và khác tham số 15 phút của mô phỏng hiện tại. |
| Actor | Hệ thống; ACT-01 |
| Trigger | Yêu cầu đặt phòng được tạo. |
| Preconditions | • Tồn có thể bán ≥ số phòng yêu cầu |
| Main flow | 1. Hệ thống tạo giữ chỗ gắn yêu cầu<br>2. Trừ tồn có thể bán, tăng đại lượng đã giữ<br>3. Đặt đồng hồ hết hạn<br>4. Khi hết hạn hoặc từ chối thì giải phóng |
| Alternate / error flows | • Hết hạn đúng lúc xác nhận: xử lý theo SM-03, không để giữ chỗ treo<br>• Lỗi sau khi trừ tồn: hoàn tồn (bù trừ) |
| Postconditions | • Mỗi giữ chỗ có thời điểm hết hạn và luôn được giải phóng hoặc chuyển thành đặt phòng |
| Business rules | HM-BR-017 |
| Data requirements | HM-DATA-010, HM-DATA-009 |
| Authorization (đề xuất, deny by default) | Hệ thống: C, U; ACT-12/13: R; ACT-08: R, X (giải phóng có lý do) |
| Audit | hold.created; hold.released; hold.expired |
| Acceptance criteria (Proposed) | HM-FR-018.AC1: Mỗi giữ chỗ có thời điểm hết hạn<br>HM-FR-018.AC2: Giữ chỗ hết hạn được giải phóng trong sai số cấu hình (OQ-45) và tồn được hoàn<br>HM-FR-018.AC3: Không tồn tại giữ chỗ không thuộc yêu cầu nào |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: D-04, FR-019 |
| Dependency | HM-FR-015 |
| OQ / Decision | OQ-45 → D-32 |

#### HM-FR-019 — Chống đặt vượt và xử lý đồng thời

| Trường | Nội dung |
|---|---|
| ID | HM-FR-019 |
| Tên | Chống đặt vượt và xử lý đồng thời |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất: khi nhiều yêu cầu cùng cạnh tranh một tồn, hệ thống bảo đảm tổng giữ/đặt không vượt tồn có thể bán. |
| Actor | Hệ thống |
| Trigger | Hai hoặc nhiều yêu cầu cùng tác động một (loại phòng, ngày). |
| Preconditions | • Tồn có thể bán hữu hạn |
| Main flow | 1. Mỗi thao tác giữ/đặt/giải phóng chạy nguyên tử trên đơn vị tồn<br>2. Yêu cầu đến sau khi hết tồn bị từ chối rõ ràng<br>3. Kết quả không phụ thuộc thứ tự xử lý ngoài thời điểm nhận |
| Alternate / error flows | • Xung đột: yêu cầu thua nhận thông báo hết phòng, không có giữ chỗ nào được tạo |
| Postconditions | • Không bao giờ tạo tổng giữ + đặt vượt tồn |
| Business rules | HM-BR-015, HM-BR-018 |
| Data requirements | HM-DATA-009, HM-DATA-010 |
| Authorization (đề xuất, deny by default) | Hệ thống |
| Audit | inventory.conflict |
| Acceptance criteria (Proposed) | HM-FR-019.AC1: Với 2 yêu cầu đồng thời cho phòng cuối cùng: đúng 1 yêu cầu thành công<br>HM-FR-019.AC2: Yêu cầu còn lại nhận lỗi hết phòng và không tạo giữ chỗ<br>HM-FR-019.AC3: Kiểm thử đồng thời nhiều luồng cho kết quả tổng giữ+đặt ≤ tồn |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: AC-026 |
| Dependency | HM-FR-015, HM-FR-018 |
| OQ / Decision | — |

#### HM-FR-020 — Đồng bộ tồn phòng với hệ thống ngoài (PMS/channel manager)

| Trường | Nội dung |
|---|---|
| ID | HM-FR-020 |
| Tên | Đồng bộ tồn phòng với hệ thống ngoài (PMS/channel manager) |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: nếu đối tác có API/PMS, hỗ trợ đồng bộ tồn; không giả định có. |
| Actor | ACT-15; ACT-07 |
| Trigger | Có kết nối đã cấu hình hoặc đến lịch đồng bộ. |
| Preconditions | • Đối tác đã bật tích hợp (SA-FR-036)<br>• Có hợp đồng dữ liệu đã duyệt |
| Main flow | 1. Nhận tồn từ hệ thống ngoài<br>2. Đối chiếu với tồn Airrest<br>3. Áp dụng quy tắc nguồn sự thật<br>4. Ghi kết quả |
| Alternate / error flows | • Lỗi hoặc dữ liệu sai: giữ tồn cũ, báo SA-FR-022<br>• Xung đột: theo quy tắc nguồn sự thật đã duyệt |
| Postconditions | • Tồn đồng bộ có dấu thời gian |
| Business rules | HM-BR-019 |
| Data requirements | HM-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-15: ghi qua kênh xác thực; ACT-07: cấu hình |
| Audit | inventory.sync |
| Acceptance criteria (Proposed) | HM-FR-020.AC1: Mọi bản ghi đồng bộ có nguồn và thời điểm<br>HM-FR-020.AC2: Dữ liệu đồng bộ lỗi không làm đổi tồn hiện tại<br>HM-FR-020.AC3: Retry có idempotency key |
| Priority · Phase | Could (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-015, SA-FR-036 |
| OQ / Decision | OQ-44 → D-31 |


### HM-C05 Đặt phòng

#### HM-FR-021 — Danh sách và tìm kiếm đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-021 |
| Tên | Danh sách và tìm kiếm đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: xem và tìm đặt phòng theo mã, ngày, trạng thái, loại phòng trong phạm vi tenant. |
| Actor | ACT-12; ACT-13; ACT-08/09 |
| Trigger | Người dùng mở “Đặt phòng”. |
| Preconditions | • Đã đăng nhập, có quyền |
| Main flow | 1. Chọn bộ lọc<br>2. Hệ thống trả danh sách phân trang theo quyền<br>3. Sắp xếp theo thời gian |
| Alternate / error flows | • Không có kết quả: trạng thái rỗng<br>• Quá nhiều kết quả: phân trang |
| Postconditions | • Danh sách chỉ chứa đặt phòng của tenant được phép |
| Business rules | HM-BR-020 |
| Data requirements | HM-DATA-011 |
| Authorization (đề xuất, deny by default) | ACT-12/13: R (tenant mình); ACT-08/09: R (theo vai trò); ACT-11: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-021.AC1: Một khách sạn không thể xem đặt phòng của khách sạn khác kể cả khi đoán mã<br>HM-FR-021.AC2: Bộ lọc theo mã, ngày, trạng thái cho kết quả đúng<br>HM-FR-021.AC3: Danh sách phân trang ổn định |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-027 |
| Dependency | SA-FR-009 |
| OQ / Decision | — |

#### HM-FR-022 — Chi tiết đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-022 |
| Tên | Chi tiết đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: xem chi tiết đặt phòng và thông tin khách ở mức tối thiểu cần thiết; không thu số điện thoại/email khi chưa được PO cho phép (BR-002). |
| Actor | ACT-12; ACT-13; ACT-09 |
| Trigger | Người dùng mở một đặt phòng. |
| Preconditions | • Có quyền với đặt phòng |
| Main flow | 1. Hiển thị mã, trạng thái, ngày, loại phòng, số khách, tên gọi<br>2. Che thông tin nhạy cảm theo quyền<br>3. Hiển thị lịch sử trạng thái |
| Alternate / error flows | • Thông tin khách vượt mức tối thiểu: không hiển thị |
| Postconditions | • Người dùng chỉ thấy trường được phép |
| Business rules | HM-BR-020, HM-BR-021 |
| Data requirements | HM-DATA-011, HM-DATA-013 |
| Authorization (đề xuất, deny by default) | ACT-12/13: R (trường tối thiểu); ACT-09: R (có lý do truy cập); V theo SA-FR-010 |
| Audit | booking.viewed (vai trò hỗ trợ) |
| Acceptance criteria (Proposed) | HM-FR-022.AC1: Trang chi tiết không hiển thị trường nhạy cảm cho vai trò không có quyền V<br>HM-FR-022.AC2: Truy cập chi tiết của ACT-09 được ghi audit<br>HM-FR-022.AC3: Không có trường số điện thoại/email nếu D-37 chưa cho phép |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: BR-002 |
| Dependency | HM-FR-021 |
| OQ / Decision | OQ-50 → D-37 |

#### HM-FR-023 — Xác nhận yêu cầu đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-023 |
| Tên | Xác nhận yêu cầu đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khách sạn xác nhận yêu cầu, chuyển giữ chỗ thành đặt phòng đã cam kết. |
| Actor | ACT-12; ACT-13 |
| Trigger | Nhân sự bấm “Xác nhận”. |
| Preconditions | • Yêu cầu ở Chờ xác nhận, còn hạn, giữ chỗ còn hiệu lực |
| Main flow | 1. Kiểm tra còn hạn và giữ chỗ<br>2. Chuyển Đã xác nhận<br>3. Chuyển giữ chỗ thành đã đặt<br>4. Thông báo cho khách |
| Alternate / error flows | • Quá hạn: từ chối thao tác, hiển thị hết hạn<br>• Bấm lặp: không tạo bản ghi thứ hai (idempotent) |
| Postconditions | • Đặt phòng ở Đã xác nhận, tồn đã đặt tăng, giữ chỗ chuyển đổi |
| Business rules | HM-BR-022 |
| Data requirements | HM-DATA-011, HM-DATA-010 |
| Authorization (đề xuất, deny by default) | ACT-12: A; ACT-13: A (nếu được ủy quyền) |
| Audit | booking.confirmed |
| Acceptance criteria (Proposed) | HM-FR-023.AC1: Xác nhận hai lần chỉ có hiệu lực một lần<br>HM-FR-023.AC2: Xác nhận yêu cầu đã hết hạn bị từ chối với thông báo<br>HM-FR-023.AC3: Sau xác nhận, giữ chỗ trở thành đã đặt và khách nhận thông báo |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-021, MB-13 |
| Dependency | HM-FR-018, HM-FR-021 |
| OQ / Decision | OQ-59 → D-46 |

#### HM-FR-024 — Từ chối yêu cầu đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-024 |
| Tên | Từ chối yêu cầu đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khách sạn từ chối yêu cầu kèm lý do bắt buộc; hệ thống giải phóng giữ chỗ. |
| Actor | ACT-12; ACT-13 |
| Trigger | Nhân sự bấm “Từ chối” và chọn lý do. |
| Preconditions | • Yêu cầu ở Chờ xác nhận |
| Main flow | 1. Chọn lý do từ danh mục<br>2. Chuyển Từ chối<br>3. Giải phóng giữ chỗ<br>4. Thông báo cho khách, gợi ý phương án thay thế theo luồng hiện có |
| Alternate / error flows | • Thiếu lý do: không cho từ chối<br>• Đã xử lý bởi người khác: thông báo xung đột |
| Postconditions | • Yêu cầu ở Từ chối, giữ chỗ được giải phóng |
| Business rules | HM-BR-022, HM-BR-023 |
| Data requirements | HM-DATA-011, HM-DATA-010 |
| Authorization (đề xuất, deny by default) | ACT-12: A; ACT-13: A (nếu ủy quyền) |
| Audit | booking.rejected |
| Acceptance criteria (Proposed) | HM-FR-024.AC1: Từ chối không có lý do bị chặn<br>HM-FR-024.AC2: Giữ chỗ được giải phóng ngay sau từ chối<br>HM-FR-024.AC3: Khách thấy lý do và tối đa 3 đề xuất thay thế (khớp BR-009) |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-021, BR-009 |
| Dependency | HM-FR-018 |
| OQ / Decision | — |

#### HM-FR-025 — Hết hạn yêu cầu chờ xác nhận

| Trường | Nội dung |
|---|---|
| ID | HM-FR-025 |
| Tên | Hết hạn yêu cầu chờ xác nhận |
| Loại | Yêu cầu hệ thống (đề xuất) |
| Mô tả | Đề xuất: yêu cầu không được xử lý trong thời hạn sẽ hết hạn tự động; thời hạn do PO quyết định. |
| Actor | Hệ thống |
| Trigger | Đồng hồ hết hạn của yêu cầu tới hạn. |
| Preconditions | • Yêu cầu còn ở Chờ xác nhận |
| Main flow | 1. Hệ thống chuyển Hết hạn<br>2. Giải phóng giữ chỗ<br>3. Thông báo khách sạn và khách |
| Alternate / error flows | • Xác nhận và hết hạn xảy ra cùng lúc: một kết quả duy nhất theo thứ tự thời gian máy chủ |
| Postconditions | • Yêu cầu Hết hạn, tồn được trả |
| Business rules | HM-BR-017, HM-BR-024 |
| Data requirements | HM-DATA-011 |
| Authorization (đề xuất, deny by default) | Hệ thống |
| Audit | booking.expired |
| Acceptance criteria (Proposed) | HM-FR-025.AC1: Yêu cầu quá hạn chuyển Hết hạn trong dung sai cấu hình<br>HM-FR-025.AC2: Tồn được hoàn đúng một lần<br>HM-FR-025.AC3: Khi trùng thời điểm với xác nhận, chỉ một thao tác thắng |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: D-04, CR-07 |
| Dependency | HM-FR-018 |
| OQ / Decision | OQ-45 → D-32 |

#### HM-FR-026 — Hết phòng hoặc thay đổi điều kiện sau khi khách gửi yêu cầu

| Trường | Nội dung |
|---|---|
| ID | HM-FR-026 |
| Tên | Hết phòng hoặc thay đổi điều kiện sau khi khách gửi yêu cầu |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khi giá hoặc tồn thay đổi sau khi khách gửi, đặt phòng đã giữ vẫn theo điều kiện tại lúc gửi; khách sạn không xác nhận được thì từ chối kèm lý do. |
| Actor | ACT-12; hệ thống |
| Trigger | Khách sạn đổi giá/tồn khi còn yêu cầu đang chờ. |
| Preconditions | • Có yêu cầu Chờ xác nhận |
| Main flow | 1. Hệ thống giữ nguyên điều kiện đã gửi<br>2. Hiển thị cảnh báo cho khách sạn<br>3. Nếu khách sạn không thể thực hiện, dùng HM-FR-024 |
| Alternate / error flows | • Tồn thật đã hết: dùng từ chối với lý do “Hết phòng” |
| Postconditions | • Điều kiện yêu cầu bất biến sau khi gửi |
| Business rules | HM-BR-025 |
| Data requirements | HM-DATA-011 |
| Authorization (đề xuất, deny by default) | ACT-12: A, R |
| Audit | booking.pending.warned |
| Acceptance criteria (Proposed) | HM-FR-026.AC1: Đổi giá sau khi khách gửi không làm đổi giá của yêu cầu đang chờ<br>HM-FR-026.AC2: Hệ thống cảnh báo khách sạn có yêu cầu bị ảnh hưởng<br>HM-FR-026.AC3: Lý do “Hết phòng” có trong danh mục từ chối |
| Priority · Phase | Should (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-023, HM-FR-024 |
| OQ / Decision | — |

#### HM-FR-027 — Hủy, đổi lịch và khách không đến

| Trường | Nội dung |
|---|---|
| ID | HM-FR-027 |
| Tên | Hủy, đổi lịch và khách không đến |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: xử lý hủy, đổi lịch, không đến; MVP không quy định hủy đặt chỗ (OQ-29), chính sách chưa có. |
| Actor | ACT-01; ACT-12; ACT-09 |
| Trigger | Khách hoặc khách sạn yêu cầu hủy hoặc đổi. |
| Preconditions | • Đặt phòng Đã xác nhận<br>• Chính sách hủy đã được duyệt (OQ-46) |
| Main flow | 1. Áp dụng chính sách tại thời điểm đặt<br>2. Đổi trạng thái<br>3. Hoàn tồn<br>4. Ghi nhận khoản phải hoàn theo mô hình thương mại |
| Alternate / error flows | • Chính sách chưa có: chức năng khóa |
| Postconditions | • Đặt phòng Đã hủy hoặc Không đến, tồn được hoàn nếu quy tắc cho phép |
| Business rules | HM-BR-014, HM-BR-025 |
| Data requirements | HM-DATA-011, HM-DATA-012 |
| Authorization (đề xuất, deny by default) | ACT-01: S; ACT-12: A; ACT-09: R |
| Audit | booking.cancelled; booking.noshow |
| Acceptance criteria (Proposed) | HM-FR-027.AC1: Hủy áp dụng đúng chính sách lưu tại thời điểm đặt<br>HM-FR-027.AC2: Tồn được hoàn đúng một lần<br>HM-FR-027.AC3: Mọi chuyển trạng thái có lịch sử |
| Priority · Phase | Should (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: OQ-29 |
| Dependency | HM-FR-013, HM-FR-023 |
| OQ / Decision | OQ-46 → D-33, OQ-43 → D-30 |

#### HM-FR-028 — Lịch sử trạng thái đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-028 |
| Tên | Lịch sử trạng thái đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: lưu và hiển thị mọi chuyển trạng thái của đặt phòng kèm người, thời điểm, lý do. |
| Actor | ACT-12; ACT-13; ACT-08/09/11 |
| Trigger | Mở tab lịch sử đặt phòng. |
| Preconditions | • Đặt phòng tồn tại |
| Main flow | 1. Liệt kê chuyển trạng thái theo thời gian<br>2. Hiển thị tác nhân (người hoặc hệ thống) và lý do |
| Alternate / error flows | • Không có |
| Postconditions | • Lịch sử chỉ đọc |
| Business rules | HM-BR-006, HM-BR-022 |
| Data requirements | HM-DATA-012 |
| Authorization (đề xuất, deny by default) | ACT-12/13: R; ACT-08/09/11: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-028.AC1: Mỗi chuyển trạng thái có một dòng lịch sử<br>HM-FR-028.AC2: Không sửa/xóa được lịch sử<br>HM-FR-028.AC3: Tác nhân hệ thống được ghi rõ là “hệ thống” |
| Priority · Phase | Must (đề xuất) · Foundation |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: SM-03 |
| Dependency | SA-FR-025 |
| OQ / Decision | — |


### HM-C06 Vận hành lưu trú

#### HM-FR-029 — Danh sách khách dự kiến đến và rời đi

| Trường | Nội dung |
|---|---|
| ID | HM-FR-029 |
| Tên | Danh sách khách dự kiến đến và rời đi |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: xem danh sách đến/đi theo ngày để chuẩn bị tiếp nhận. |
| Actor | ACT-12; ACT-13 |
| Trigger | Mở “Hôm nay”. |
| Preconditions | • Có đặt phòng Đã xác nhận |
| Main flow | 1. Chọn ngày<br>2. Hệ thống liệt kê đến và đi<br>3. Sắp theo giờ dự kiến |
| Alternate / error flows | • Không có: trạng thái rỗng |
| Postconditions | • Danh sách chỉ đọc |
| Business rules | HM-BR-020 |
| Data requirements | HM-DATA-011, HM-DATA-014 |
| Authorization (đề xuất, deny by default) | ACT-12/13: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-029.AC1: Danh sách đúng theo ngày được chọn và múi giờ cấu hình<br>HM-FR-029.AC2: Chỉ gồm đặt phòng Đã xác nhận<br>HM-FR-029.AC3: Không hiển thị tenant khác |
| Priority · Phase | Should (đề xuất) · Hotel Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-023 |
| OQ / Decision | OQ-54 → D-41, OQ-60 → D-47 |

#### HM-FR-030 — Xác nhận nhận phòng và trả phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-030 |
| Tên | Xác nhận nhận phòng và trả phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: ghi nhận nhận/trả phòng để đóng vòng đời đặt phòng; có thể thuộc PMS của khách sạn. |
| Actor | ACT-12; ACT-13 |
| Trigger | Nhân sự bấm “Đã nhận phòng” hoặc “Đã trả phòng”. |
| Preconditions | • Đặt phòng Đã xác nhận (nhận) hoặc Đang lưu trú (trả) |
| Main flow | 1. Kiểm tra trạng thái hợp lệ<br>2. Ghi thời điểm<br>3. Chuyển Đang lưu trú hoặc Hoàn tất |
| Alternate / error flows | • Ghi sai: cho đảo ngược trong thời hạn cấu hình, có lý do |
| Postconditions | • Trạng thái lưu trú cập nhật |
| Business rules | HM-BR-026 |
| Data requirements | HM-DATA-014 |
| Authorization (đề xuất, deny by default) | ACT-12/13: U |
| Audit | stay.checkin; stay.checkout |
| Acceptance criteria (Proposed) | HM-FR-030.AC1: Không thể trả phòng khi chưa nhận<br>HM-FR-030.AC2: Đảo ngược cần lý do và được ghi lịch sử<br>HM-FR-030.AC3: Hoàn tất làm đặt phòng không còn giữ tồn tương lai |
| Priority · Phase | Could (đề xuất) · Hotel Operations |
| Status | Deferred |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-023 |
| OQ / Decision | OQ-54 → D-41 |

#### HM-FR-031 — Khách đến muộn, không đến hoặc cần hỗ trợ

| Trường | Nội dung |
|---|---|
| ID | HM-FR-031 |
| Tên | Khách đến muộn, không đến hoặc cần hỗ trợ |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: ghi nhận đến muộn/không đến; quy tắc phí và giữ phòng chưa có. |
| Actor | ACT-12; ACT-13 |
| Trigger | Nhân sự đánh dấu. |
| Preconditions | • Có đặt phòng Đã xác nhận |
| Main flow | 1. Chọn tình huống<br>2. Nhập ghi chú<br>3. Hệ thống cập nhật trạng thái theo chính sách đã duyệt |
| Alternate / error flows | • Chưa có chính sách: chỉ ghi nhận, không tự hủy |
| Postconditions | • Tình huống được ghi nhận |
| Business rules | HM-BR-025 |
| Data requirements | HM-DATA-014 |
| Authorization (đề xuất, deny by default) | ACT-12/13: U |
| Audit | stay.late; stay.noshow |
| Acceptance criteria (Proposed) | HM-FR-031.AC1: Ghi nhận không tự động hủy hoặc tính phí khi chưa có chính sách<br>HM-FR-031.AC2: Có ghi chú và người ghi<br>HM-FR-031.AC3: Ảnh hưởng tới báo cáo chất lượng được tính riêng |
| Priority · Phase | Could (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-030 |
| OQ / Decision | OQ-46 → D-33, OQ-54 → D-41 |

#### HM-FR-032 — Trạng thái phòng vận hành (dọn, bảo trì, sẵn sàng)

| Trường | Nội dung |
|---|---|
| ID | HM-FR-032 |
| Tên | Trạng thái phòng vận hành (dọn, bảo trì, sẵn sàng) |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: trạng thái housekeeping là chức năng PMS; mặc định ngoài phạm vi trừ khi PO xác nhận. |
| Actor | ACT-13 |
| Trigger | Nhân sự đổi trạng thái phòng. |
| Preconditions | — |
| Main flow | 1. Chỉ thực hiện nếu PO đưa vào phạm vi |
| Alternate / error flows | — |
| Postconditions | • Nếu PO không đưa vào phạm vi: không có màn hình này; nếu có: trạng thái phòng chỉ nhận giá trị trong danh mục |
| Business rules | HM-BR-027 |
| Data requirements | HM-DATA-014 |
| Authorization (đề xuất, deny by default) | ACT-13: U |
| Audit | roomstatus.changed |
| Acceptance criteria (Proposed) | HM-FR-032.AC1: Nếu được đưa vào phạm vi: trạng thái phòng chỉ gồm các giá trị danh mục<br>HM-FR-032.AC2: Nếu không: không có màn hình này |
| Priority · Phase | Won't (đề xuất) · Advanced |
| Status | Deferred |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-54 → D-41 |

#### HM-FR-033 — Ghi chú vận hành và bàn giao ca

| Trường | Nội dung |
|---|---|
| ID | HM-FR-033 |
| Tên | Ghi chú vận hành và bàn giao ca |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: ghi chú nội bộ gắn đặt phòng và ghi chú bàn giao; chưa chứng minh là nhu cầu của Airrest. |
| Actor | ACT-12; ACT-13 |
| Trigger | Nhân sự thêm ghi chú. |
| Preconditions | • Đặt phòng tồn tại |
| Main flow | 1. Thêm ghi chú<br>2. Hệ thống lưu kèm người và thời điểm |
| Alternate / error flows | • Ghi chú chứa dữ liệu nhạy cảm: cảnh báo |
| Postconditions | • Ghi chú nội bộ không hiển thị cho khách |
| Business rules | HM-BR-021 |
| Data requirements | HM-DATA-017 |
| Authorization (đề xuất, deny by default) | ACT-12/13: C, R |
| Audit | opsnote.created |
| Acceptance criteria (Proposed) | HM-FR-033.AC1: Ghi chú không hiển thị cho người dùng cuối<br>HM-FR-033.AC2: Có người và thời điểm<br>HM-FR-033.AC3: Không sửa xóa sau khi lưu quá thời hạn cấu hình |
| Priority · Phase | Could (đề xuất) · Hotel Operations |
| Status | Deferred |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-54 → D-41 |

#### HM-FR-034 — Xử lý sự cố trong thời gian lưu trú

| Trường | Nội dung |
|---|---|
| ID | HM-FR-034 |
| Tên | Xử lý sự cố trong thời gian lưu trú |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khách sạn ghi nhận sự cố liên quan đặt phòng và chuyển cho hỗ trợ Airrest khi cần. |
| Actor | ACT-12; ACT-13; ACT-09 |
| Trigger | Nhân sự tạo sự cố. |
| Preconditions | • Đặt phòng đang hiệu lực |
| Main flow | 1. Tạo sự cố<br>2. Chọn phân loại<br>3. Hệ thống tạo ca hỗ trợ liên kết (SA-FR-033) |
| Alternate / error flows | • Không có quyền với đặt phòng: từ chối |
| Postconditions | • Ca hỗ trợ liên kết đặt phòng |
| Business rules | HM-BR-020 |
| Data requirements | HM-DATA-016, SA-DATA-010 |
| Authorization (đề xuất, deny by default) | ACT-12/13: C, R; ACT-09: R, U |
| Audit | incident.created |
| Acceptance criteria (Proposed) | HM-FR-034.AC1: Sự cố tạo ca hỗ trợ có liên kết đặt phòng<br>HM-FR-034.AC2: Khách sạn chỉ thấy ca liên quan khách sạn mình<br>HM-FR-034.AC3: Có trạng thái xử lý hiển thị |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-033 |
| OQ / Decision | — |

#### HM-FR-035 — Đón khách bằng xe của khách sạn (lái xe)

| Trường | Nội dung |
|---|---|
| ID | HM-FR-035 |
| Tên | Đón khách bằng xe của khách sạn (lái xe) |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: yêu cầu đón và cập nhật trạng thái bởi lái xe; mâu thuẫn MB-15 “gọi xe” đã loại nên phụ thuộc D-26. |
| Actor | ACT-14; ACT-12; ACT-01 |
| Trigger | Khách yêu cầu xe đón sau khi đặt phòng. |
| Preconditions | • Đặt phòng Đã xác nhận ở cơ sở có xe<br>• D-26 được PO duyệt |
| Main flow | 1. Tạo yêu cầu đón<br>2. Lái xe nhận<br>3. Cập nhật trạng thái<br>4. Khách thấy trạng thái |
| Alternate / error flows | • Không đón được: nêu lý do, gợi ý cách đi khác<br>• Liên lạc khách bị hạn chế bởi BR-002 |
| Postconditions | • Yêu cầu đón có trạng thái và lịch sử |
| Business rules | HM-BR-028 |
| Data requirements | HM-DATA-018 |
| Authorization (đề xuất, deny by default) | ACT-14: R, U (yêu cầu của cơ sở mình); ACT-12: R; ACT-01: C, R |
| Audit | pickup.updated |
| Acceptance criteria (Proposed) | HM-FR-035.AC1: Lái xe chỉ thấy yêu cầu của khách sạn mình<br>HM-FR-035.AC2: Không có bản đồ hay định vị (theo đề xuất D-26 phương án A)<br>HM-FR-035.AC3: Mỗi cập nhật có thời điểm và người |
| Priority · Phase | Could (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: FR-028, FR-029, D-26, MB-15 |
| Dependency | HM-FR-023 |
| OQ / Decision | OQ-50 → D-37 |


### HM-C07 Đối soát, thanh toán và doanh thu

#### HM-FR-036 — Ghi nhận mô hình thu tiền của đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-036 |
| Tên | Ghi nhận mô hình thu tiền của đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: ghi nhận mỗi đặt phòng thu tiền theo cách nào (khách trả khách sạn, qua Airrest, hoa hồng); không giả định Airrest thu hay giữ tiền. |
| Actor | ACT-12; ACT-10; ACT-07 |
| Trigger | Cấu hình mô hình thương mại. |
| Preconditions | • Mô hình được PO duyệt (OQ-43) |
| Main flow | 1. Chọn mô hình theo đối tác<br>2. Hệ thống áp dụng cho đặt phòng mới |
| Alternate / error flows | • Chưa có mô hình: khóa |
| Postconditions | • Mỗi đặt phòng có mô hình thu tiền xác định |
| Business rules | HM-BR-029 |
| Data requirements | HM-DATA-015 |
| Authorization (đề xuất, deny by default) | ACT-07/10: C, U; ACT-12: R |
| Audit | commercial.model.changed |
| Acceptance criteria (Proposed) | HM-FR-036.AC1: Mỗi đặt phòng mới ghi đúng một mô hình thu tiền<br>HM-FR-036.AC2: Mô hình đã dùng không đổi hồi tố<br>HM-FR-036.AC3: Thay đổi mô hình cần phê duyệt |
| Priority · Phase | Won't (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-43 → D-30 |

#### HM-FR-037 — Đối soát đặt phòng, lưu trú và giao dịch

| Trường | Nội dung |
|---|---|
| ID | HM-FR-037 |
| Tên | Đối soát đặt phòng, lưu trú và giao dịch |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: so khớp đặt phòng, trạng thái lưu trú và giao dịch. |
| Actor | ACT-10 |
| Trigger | Chạy đối soát theo kỳ. |
| Preconditions | • Có giao dịch và mô hình thương mại |
| Main flow | 1. Chọn kỳ<br>2. Hệ thống so khớp<br>3. Liệt kê chênh lệch<br>4. Người đối soát xử lý |
| Alternate / error flows | • Dữ liệu thiếu: đánh dấu không đối soát được |
| Postconditions | • Báo cáo chênh lệch |
| Business rules | HM-BR-029 |
| Data requirements | HM-DATA-015 |
| Authorization (đề xuất, deny by default) | ACT-10: R, U; ACT-11: R |
| Audit | settlement.reconciled |
| Acceptance criteria (Proposed) | HM-FR-037.AC1: Chênh lệch được liệt kê với nguyên nhân phân loại<br>HM-FR-037.AC2: Kết quả đối soát không sửa được sau khi chốt<br>HM-FR-037.AC3: Có audit |
| Priority · Phase | Won't (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-036 |
| OQ / Decision | OQ-43 → D-30 |

#### HM-FR-038 — Lịch sử thanh toán, hoàn tiền và công nợ

| Trường | Nội dung |
|---|---|
| ID | HM-FR-038 |
| Tên | Lịch sử thanh toán, hoàn tiền và công nợ |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: lịch sử giao dịch, hoàn tiền, phải thu/phải trả; không tự giả định xuất hóa đơn. |
| Actor | ACT-10; ACT-12 |
| Trigger | Mở lịch sử tài chính. |
| Preconditions | • Có giao dịch |
| Main flow | 1. Lọc<br>2. Hiển thị<br>3. Xuất theo quyền |
| Alternate / error flows | • Không có |
| Postconditions | • Lịch sử chỉ đọc |
| Business rules | HM-BR-029 |
| Data requirements | HM-DATA-015 |
| Authorization (đề xuất, deny by default) | ACT-10: R, E; ACT-12: R (khoản của mình) |
| Audit | finance.exported |
| Acceptance criteria (Proposed) | HM-FR-038.AC1: Khách sạn chỉ thấy khoản của mình<br>HM-FR-038.AC2: Xuất dữ liệu cần quyền E và có audit<br>HM-FR-038.AC3: Không có thao tác sửa lịch sử |
| Priority · Phase | Won't (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-036 |
| OQ / Decision | OQ-43 → D-30 |


### HM-C08 Chất lượng đối tác

#### HM-FR-039 — Ghi nhận sự cố chất lượng đối tác

| Trường | Nội dung |
|---|---|
| ID | HM-FR-039 |
| Tên | Ghi nhận sự cố chất lượng đối tác |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: ghi nhận các sự cố như hết phòng dù đã xác nhận, từ chối nhận khách, sai giá, sai thông tin. |
| Actor | ACT-08; ACT-09; hệ thống |
| Trigger | Có sự cố được phát hiện hoặc báo. |
| Preconditions | • Có đặt phòng liên quan |
| Main flow | 1. Tạo bản ghi sự cố với phân loại<br>2. Liên kết đặt phòng và đối tác<br>3. Lưu |
| Alternate / error flows | • Phân loại không có trong danh mục: từ chối |
| Postconditions | • Bản ghi sự cố gắn đối tác |
| Business rules | HM-BR-030 |
| Data requirements | HM-DATA-016 |
| Authorization (đề xuất, deny by default) | ACT-08/09: C, R; ACT-12: R (của mình) |
| Audit | quality.incident.created |
| Acceptance criteria (Proposed) | HM-FR-039.AC1: Mỗi sự cố có phân loại thuộc danh mục<br>HM-FR-039.AC2: Khách sạn thấy sự cố của mình và có thể phản hồi<br>HM-FR-039.AC3: Không có điểm số tự động khi chưa có ngưỡng được duyệt |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-56 → D-43 |

#### HM-FR-040 — Chỉ số chất lượng khách quan

| Trường | Nội dung |
|---|---|
| ID | HM-FR-040 |
| Tên | Chỉ số chất lượng khách quan |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: chỉ số đo được (tỷ lệ từ chối, hết hạn, thời gian phản hồi); tách khỏi điểm đánh giá do người dùng nhập; không đặt ngưỡng xếp hạng. |
| Actor | ACT-08; ACT-12 |
| Trigger | Xem chỉ số. |
| Preconditions | • Có dữ liệu |
| Main flow | 1. Hệ thống tính chỉ số theo định nghĩa<br>2. Hiển thị theo khoảng thời gian |
| Alternate / error flows | • Dữ liệu ít: hiển thị kèm cỡ mẫu |
| Postconditions | • Chỉ số có định nghĩa công thức |
| Business rules | HM-BR-031 |
| Data requirements | HM-DATA-016 |
| Authorization (đề xuất, deny by default) | ACT-08: R; ACT-12: R (của mình) |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-040.AC1: Mỗi chỉ số có công thức và nguồn dữ liệu công bố<br>HM-FR-040.AC2: Chỉ số hiển thị kèm cỡ mẫu<br>HM-FR-040.AC3: Không có xếp hạng hoặc khóa tự động |
| Priority · Phase | Could (đề xuất) · System Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-039 |
| OQ / Decision | OQ-56 → D-43 |

#### HM-FR-041 — Phản hồi và khiếu nại của khách sạn

| Trường | Nội dung |
|---|---|
| ID | HM-FR-041 |
| Tên | Phản hồi và khiếu nại của khách sạn |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: khách sạn phản hồi sự cố, khiếu nại quyết định tạm ngưng. |
| Actor | ACT-12; ACT-08 |
| Trigger | Khách sạn gửi phản hồi. |
| Preconditions | • Có sự cố hoặc quyết định liên quan |
| Main flow | 1. Nhập phản hồi và minh chứng<br>2. Gửi<br>3. Bộ phận vận hành xem xét |
| Alternate / error flows | • Quá thời hạn phản hồi (nếu có): ghi nhận |
| Postconditions | • Phản hồi gắn sự cố |
| Business rules | HM-BR-030 |
| Data requirements | HM-DATA-016 |
| Authorization (đề xuất, deny by default) | ACT-12: C; ACT-08: R, U |
| Audit | quality.appeal |
| Acceptance criteria (Proposed) | HM-FR-041.AC1: Phản hồi gắn đúng sự cố<br>HM-FR-041.AC2: Người xử lý ghi kết quả và lý do<br>HM-FR-041.AC3: Có lịch sử |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-039 |
| OQ / Decision | OQ-56 → D-43, OQ-57 → D-44 |


### HM-C09 Thông báo và giao tiếp

#### HM-FR-042 — Thông báo yêu cầu mới và kết quả

| Trường | Nội dung |
|---|---|
| ID | HM-FR-042 |
| Tên | Thông báo yêu cầu mới và kết quả |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: thông báo khách sạn khi có yêu cầu mới, thay đổi, hủy; thông báo khách khi xác nhận hoặc từ chối. |
| Actor | ACT-12; ACT-13; ACT-01 |
| Trigger | Có sự kiện đặt phòng. |
| Preconditions | • Kênh thông báo được duyệt (OQ-52) |
| Main flow | 1. Hệ thống tạo thông báo theo sự kiện<br>2. Gửi qua kênh<br>3. Ghi trạng thái |
| Alternate / error flows | • Kênh lỗi: thử lại theo HM-FR-044 |
| Postconditions | • Thông báo ghi nhận |
| Business rules | HM-BR-032 |
| Data requirements | SA-DATA-011, SA-DATA-012 |
| Authorization (đề xuất, deny by default) | Hệ thống: C; ACT-12/13: R |
| Audit | notification.sent |
| Acceptance criteria (Proposed) | HM-FR-042.AC1: Mỗi sự kiện đặt phòng tạo đúng một thông báo cho mỗi người nhận<br>HM-FR-042.AC2: Nội dung không chứa thông tin nhạy cảm vượt mức tối thiểu<br>HM-FR-042.AC3: Có trạng thái đã gửi hoặc lỗi |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin); liên quan SRS hiện hành: OQ-09 |
| Dependency | SH-C04 |
| OQ / Decision | OQ-52 → D-39 |

#### HM-FR-043 — Nhắc yêu cầu sắp hết hạn

| Trường | Nội dung |
|---|---|
| ID | HM-FR-043 |
| Tên | Nhắc yêu cầu sắp hết hạn |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: nhắc khách sạn khi yêu cầu sắp hết hạn; chính sách nhắc cần PO duyệt. |
| Actor | ACT-12; ACT-13 |
| Trigger | Còn X phút tới hạn (X do PO quyết định). |
| Preconditions | • Yêu cầu Chờ xác nhận<br>• Có chính sách nhắc |
| Main flow | 1. Hệ thống lên lịch nhắc<br>2. Gửi nhắc<br>3. Không nhắc lại quá giới hạn |
| Alternate / error flows | • Đã xử lý trước khi nhắc: hủy nhắc |
| Postconditions | • Nhắc gửi tối đa theo chính sách |
| Business rules | HM-BR-032 |
| Data requirements | SA-DATA-011 |
| Authorization (đề xuất, deny by default) | Hệ thống: C (tạo nhắc); ACT-12/13: R (nhận nhắc) |
| Audit | reminder.sent |
| Acceptance criteria (Proposed) | HM-FR-043.AC1: Không gửi nhắc cho yêu cầu đã xử lý<br>HM-FR-043.AC2: Số lần nhắc không vượt giới hạn cấu hình<br>HM-FR-043.AC3: Mỗi nhắc có trạng thái |
| Priority · Phase | Could (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-025, HM-FR-042 |
| OQ / Decision | OQ-45 → D-32, OQ-52 → D-39 |

#### HM-FR-044 — Lịch sử thông báo, lỗi gửi, retry và chống gửi trùng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-044 |
| Tên | Lịch sử thông báo, lỗi gửi, retry và chống gửi trùng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: lưu lịch sử gửi, retry có giới hạn và idempotency để chống gửi trùng. |
| Actor | ACT-12; ACT-08; hệ thống |
| Trigger | Gửi thất bại hoặc xem lịch sử. |
| Preconditions | • Có thông báo |
| Main flow | 1. Thử lại theo giới hạn<br>2. Dùng khóa idempotency<br>3. Ghi mỗi lần thử |
| Alternate / error flows | • Hết lần thử: đánh dấu thất bại, hiển thị cho vận hành |
| Postconditions | • Mỗi thông báo có trạng thái cuối |
| Business rules | HM-BR-032, HM-BR-033 |
| Data requirements | SA-DATA-012 |
| Authorization (đề xuất, deny by default) | ACT-12: R (của mình); ACT-08: R |
| Audit | notification.failed |
| Acceptance criteria (Proposed) | HM-FR-044.AC1: Gửi lại cùng sự kiện không tạo thông báo thứ hai cho cùng người nhận<br>HM-FR-044.AC2: Số lần thử không vượt giới hạn<br>HM-FR-044.AC3: Thông báo thất bại hiển thị ở SA-FR-022 |
| Priority · Phase | Must (đề xuất) · Hotel Operations |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-042 |
| OQ / Decision | OQ-52 → D-39 |


### HM-C10 Báo cáo và phân tích

#### HM-FR-045 — Báo cáo yêu cầu và đặt phòng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-045 |
| Tên | Báo cáo yêu cầu và đặt phòng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: số lượng yêu cầu, tỷ lệ xác nhận, từ chối, hủy theo ngày, khách sạn, trạng thái, loại phòng. |
| Actor | ACT-12; ACT-08 |
| Trigger | Mở báo cáo. |
| Preconditions | • Có dữ liệu |
| Main flow | 1. Chọn bộ lọc<br>2. Hệ thống tính theo định nghĩa<br>3. Hiển thị bảng và tổng |
| Alternate / error flows | • Không có dữ liệu: rỗng |
| Postconditions | • Báo cáo có công thức công bố |
| Business rules | HM-BR-034 |
| Data requirements | HM-DATA-011 |
| Authorization (đề xuất, deny by default) | ACT-12: R (của mình); ACT-08: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-045.AC1: Mỗi chỉ số có công thức, nguồn dữ liệu, múi giờ công bố<br>HM-FR-045.AC2: Tổng khớp tổng chi tiết<br>HM-FR-045.AC3: Khách sạn không thấy dữ liệu khách sạn khác |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | — |
| OQ / Decision | OQ-60 → D-47 |

#### HM-FR-046 — Báo cáo tồn phòng và tỷ lệ sử dụng

| Trường | Nội dung |
|---|---|
| ID | HM-FR-046 |
| Tên | Báo cáo tồn phòng và tỷ lệ sử dụng |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: tồn phòng và công suất theo ngày. |
| Actor | ACT-12; ACT-08 |
| Trigger | Mở báo cáo. |
| Preconditions | • Có dữ liệu tồn |
| Main flow | 1. Chọn kỳ<br>2. Tính tỷ lệ sử dụng = đã đặt / phòng vật lý trừ không khả dụng (công thức đề xuất)<br>3. Hiển thị |
| Alternate / error flows | • Mẫu số bằng 0: hiển thị “không áp dụng” |
| Postconditions | • Báo cáo công suất |
| Business rules | HM-BR-034 |
| Data requirements | HM-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-12: R; ACT-08: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-046.AC1: Tỷ lệ sử dụng tính đúng công thức công bố<br>HM-FR-046.AC2: Mẫu số 0 không gây lỗi chia<br>HM-FR-046.AC3: Khách sạn chỉ thấy phòng của mình |
| Priority · Phase | Could (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-015 |
| OQ / Decision | — |

#### HM-FR-047 — Báo cáo hiệu suất phản hồi

| Trường | Nội dung |
|---|---|
| ID | HM-FR-047 |
| Tên | Báo cáo hiệu suất phản hồi |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: thời gian phản hồi yêu cầu của khách sạn. |
| Actor | ACT-12; ACT-08 |
| Trigger | Mở báo cáo. |
| Preconditions | • Có yêu cầu đã xử lý |
| Main flow | 1. Tính thời gian từ gửi tới xác nhận hoặc từ chối<br>2. Hiển thị trung vị và phân vị (định nghĩa công bố) |
| Alternate / error flows | • Yêu cầu chưa xử lý: tách riêng |
| Postconditions | • Chỉ số phản hồi |
| Business rules | HM-BR-031, HM-BR-034 |
| Data requirements | HM-DATA-011, HM-DATA-012 |
| Authorization (đề xuất, deny by default) | ACT-12: R; ACT-08: R |
| Audit | — |
| Acceptance criteria (Proposed) | HM-FR-047.AC1: Chỉ số tính từ lịch sử trạng thái<br>HM-FR-047.AC2: Yêu cầu hết hạn được tính riêng<br>HM-FR-047.AC3: Công thức được công bố trên màn hình |
| Priority · Phase | Could (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-028 |
| OQ / Decision | — |

#### HM-FR-048 — Báo cáo tài chính

| Trường | Nội dung |
|---|---|
| ID | HM-FR-048 |
| Tên | Báo cáo tài chính |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất có điều kiện: số liệu doanh thu và đối soát; chỉ khi mô hình thanh toán được xác nhận. |
| Actor | ACT-10; ACT-12 |
| Trigger | Mở báo cáo. |
| Preconditions | • Mô hình thương mại được duyệt |
| Main flow | 1. Chọn kỳ<br>2. Tính<br>3. Hiển thị |
| Alternate / error flows | • Chưa có mô hình: khóa |
| Postconditions | • Báo cáo tài chính |
| Business rules | HM-BR-029, HM-BR-034 |
| Data requirements | HM-DATA-015 |
| Authorization (đề xuất, deny by default) | ACT-10: R, E; ACT-12: R (của mình) |
| Audit | finance.report.viewed |
| Acceptance criteria (Proposed) | HM-FR-048.AC1: Chỉ hiển thị khi OQ-43 đã được quyết định<br>HM-FR-048.AC2: Khoản của khách sạn nào chỉ khách sạn đó thấy<br>HM-FR-048.AC3: Xuất cần quyền E và audit |
| Priority · Phase | Won't (đề xuất) · Advanced |
| Status | Blocked — chờ quyết định, xem Dependency/OQ |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | HM-FR-036 |
| OQ / Decision | OQ-43 → D-30 |

#### HM-FR-049 — Bộ lọc và xuất dữ liệu báo cáo

| Trường | Nội dung |
|---|---|
| ID | HM-FR-049 |
| Tên | Bộ lọc và xuất dữ liệu báo cáo |
| Loại | Yêu cầu nghiệp vụ (đề xuất) |
| Mô tả | Đề xuất: lọc và xuất báo cáo theo quyền; xuất là thao tác nhạy cảm cần kiểm soát và audit. |
| Actor | ACT-12; ACT-08; ACT-10 |
| Trigger | Người dùng bấm “Xuất”. |
| Preconditions | • Có quyền E |
| Main flow | 1. Chọn bộ lọc<br>2. Hệ thống kiểm tra quyền E và giới hạn kích thước<br>3. Tạo tệp<br>4. Ghi audit |
| Alternate / error flows | • Vượt giới hạn: yêu cầu thu hẹp<br>• Không có quyền: từ chối |
| Postconditions | • Tệp xuất chỉ chứa trường được phép |
| Business rules | HM-BR-020, HM-BR-021 |
| Data requirements | SA-DATA-009 |
| Authorization (đề xuất, deny by default) | ACT-12: E (dữ liệu của mình); ACT-08/10: E theo quyền |
| Audit | data.exported |
| Acceptance criteria (Proposed) | HM-FR-049.AC1: Mỗi lần xuất có audit gồm người, bộ lọc, số bản ghi<br>HM-FR-049.AC2: Tệp không chứa trường nhạy cảm nếu người xuất không có quyền V<br>HM-FR-049.AC3: Người không có quyền E không thấy nút và API từ chối |
| Priority · Phase | Should (đề xuất) · System Operations |
| Status | Proposed |
| Source / traceability | Chỉ đạo PO 26/10/2026; phân tích BA/SA (task hotel-admin) |
| Dependency | SA-FR-028 |
| OQ / Decision | OQ-50 → D-37 |


## 5. Quy tắc nghiệp vụ (HM-BR)

| ID | Tên | Quy tắc (đề xuất) | OQ |
|---|---|---|---|
| HM-BR-001 | Một đối tác một hồ sơ | Mỗi đối tác chỉ có một hồ sơ; tiêu chí xác định trùng (tên pháp lý chuẩn hóa, địa chỉ, mã số) do PO quyết định. | OQ-51 |
| HM-BR-002 | Điều kiện gửi duyệt | Hồ sơ chỉ gửi duyệt khi đủ trường bắt buộc (tên, địa chỉ, tọa độ, liên hệ, loại hình, ít nhất một loại phòng). Danh sách trường bắt buộc là đề xuất. | OQ-51 |
| HM-BR-003 | Trường quan trọng và trường vận hành | Thay đổi trường quan trọng có thể kéo hồ sơ về chờ duyệt lại; trường vận hành (giờ nhận khách, tiện ích) sửa trực tiếp. Phân loại trường do PO quyết định. | OQ-51 |
| HM-BR-004 | Một yêu cầu duyệt mở | Một hồ sơ chỉ có tối đa một yêu cầu duyệt đang mở. | — |
| HM-BR-005 | Tài liệu xác minh hạn chế truy cập | Tài liệu xác minh chỉ hiển thị cho chủ/quản lý của tenant và nhân sự được cấp quyền; mỗi lượt xem được ghi audit. | OQ-51 |
| HM-BR-006 | Lịch sử chỉ thêm | Lịch sử thay đổi (hồ sơ, giá, trạng thái đặt phòng) chỉ thêm, không sửa hoặc xóa. | — |
| HM-BR-007 | Loại phòng | Mã loại phòng duy nhất trong khách sạn; loại phòng đã dùng chỉ ngừng dùng, không xóa. | — |
| HM-BR-008 | Phòng vật lý là trần | Số phòng vật lý không thấp hơn số phòng đã giữ, đã đặt hoặc không khả dụng trong bất kỳ ngày tương lai. | — |
| HM-BR-009 | Trạng thái kinh doanh tách trạng thái sử dụng | Trạng thái bán của loại phòng độc lập với trạng thái sử dụng của từng phòng (PMS). | OQ-54 |
| HM-BR-010 | Quy tắc giá | Giá là số dương theo tiền tệ cấu hình; mỗi (loại phòng, ngày, số khách) có đúng một giá hiệu lực; giá của đặt phòng đã tạo bất biến. | OQ-60 |
| HM-BR-011 | Thứ tự ưu tiên quy tắc giá | Khi nhiều quy tắc giá cùng áp dụng một ngày phải có thứ tự ưu tiên xác định. | OQ-61 |
| HM-BR-012 | Giá tổng nhất quán | Giá tổng tính từ giá cơ sở và thuế phí theo cùng một cách ở danh sách, chi tiết, đặt chỗ (khớp BR-005 của SRS hiện hành). | OQ-62 |
| HM-BR-013 | Sức chứa | Số khách tối đa của chính sách không vượt sức chứa loại phòng. | — |
| HM-BR-014 | Chính sách hủy lấy từ mẫu đã duyệt | Khách sạn chỉ chọn mẫu chính sách hủy đã được duyệt; đặt phòng giữ chính sách tại thời điểm đặt. | OQ-46 |
| HM-BR-015 | Công thức tồn phòng | Tồn có thể bán = phòng vật lý − đã giữ chỗ − đã đặt − không khả dụng, và luôn ≥ 0. Năm đại lượng được lưu riêng. | — |
| HM-BR-016 | Đóng bán không hủy đặt phòng | Đóng bán, ngày không nhận khách hoặc bảo trì không tự hủy đặt phòng đã xác nhận. | — |
| HM-BR-017 | Giữ chỗ có thời hạn | Mỗi giữ chỗ có thời điểm hết hạn; khi hết hạn hoặc bị từ chối, tồn được giải phóng đúng một lần. | OQ-45 |
| HM-BR-018 | Nguyên tử trên đơn vị tồn | Giữ, đặt và giải phóng là các thao tác nguyên tử trên đơn vị (loại phòng, ngày). | — |
| HM-BR-019 | Nguồn sự thật của tồn phòng | Khi có đồng bộ ngoài, phải xác định trước hệ thống nào là nguồn sự thật. | OQ-44 |
| HM-BR-020 | Phạm vi truy cập đặt phòng | Mọi truy cập đặt phòng bị ràng buộc theo tenant và quyền; không lộ sự tồn tại của dữ liệu tenant khác. | — |
| HM-BR-021 | Thông tin khách tối thiểu | Chỉ hiển thị thông tin khách tối thiểu cần để thực hiện đặt phòng; không thu số điện thoại hoặc email khi PO chưa cho phép (BR-002); ghi chú nội bộ không hiển thị cho khách. | OQ-50 |
| HM-BR-022 | Chuyển trạng thái đặt phòng | Đặt phòng chỉ chuyển trạng thái theo SM-03; mọi chuyển có người hoặc hệ thống thực hiện, thời điểm, lý do. | — |
| HM-BR-023 | Lý do từ chối | Từ chối yêu cầu phải có lý do thuộc danh mục. | — |
| HM-BR-024 | Hết hạn theo giờ máy chủ | Hết hạn được xác định theo thời gian máy chủ; khi trùng với xác nhận, chỉ một kết quả có hiệu lực. | OQ-45 |
| HM-BR-025 | Điều kiện yêu cầu bất biến | Điều kiện của yêu cầu (giá, chính sách) cố định tại thời điểm gửi; hủy hoặc không đến không tự tính phí khi chưa có chính sách được duyệt. | OQ-46 |
| HM-BR-026 | Nhận/trả phòng | Chỉ trả phòng sau khi nhận phòng; đảo ngược cần lý do. | OQ-54 |
| HM-BR-027 | Housekeeping ngoài phạm vi mặc định | Trạng thái dọn phòng, bảo trì từng phòng là chức năng PMS; chỉ đưa vào phạm vi khi PO quyết định. | OQ-54 |
| HM-BR-028 | Yêu cầu đón | Yêu cầu đón thuộc đúng một đặt phòng Đã xác nhận ở cơ sở có xe; không có bản đồ hay định vị. | OQ-50 |
| HM-BR-029 | Mô hình thu tiền | Mô hình thu tiền của đặt phòng được ghi một lần và không đổi hồi tố; Airrest không được giả định là bên thu hay giữ tiền. | OQ-43 |
| HM-BR-030 | Sự cố chất lượng | Sự cố có phân loại thuộc danh mục; khách sạn có quyền phản hồi hoặc khiếu nại. | OQ-56 |
| HM-BR-031 | Chỉ số khách quan | Chỉ số chất lượng đo được tách khỏi điểm đánh giá do người dùng nhập và luôn kèm cỡ mẫu. | OQ-56 |
| HM-BR-032 | Thông báo theo sự kiện | Mỗi sự kiện tạo đúng một thông báo cho mỗi người nhận; nội dung giới hạn ở mức tối thiểu. | OQ-52 |
| HM-BR-033 | Retry và chống trùng | Gửi lại có giới hạn số lần và dùng khóa idempotency. | OQ-52 |
| HM-BR-034 | Chỉ số báo cáo | Mọi chỉ số có công thức, nguồn dữ liệu, múi giờ và quyền xem được công bố. | OQ-60 |

## 6. Máy trạng thái liên quan

SM-01 (hồ sơ đối tác), SM-02 (giá và ngày bán), SM-03 (yêu cầu và đặt phòng), SM-04 (lưu trú). Chi tiết ở `05_DATA_MODEL_AND_STATE_MACHINES.md`. “Gửi yêu cầu” không đồng nghĩa “đặt phòng thành công”: chỉ trạng thái Confirmed là cam kết của khách sạn.

## 7. Dữ liệu

Thực thể HM-DATA-001 đến HM-DATA-018, ở `05_DATA_MODEL_AND_STATE_MACHINES.md`. Phân biệt rõ năm đại lượng tồn phòng: phòng vật lý, tồn có thể bán, đã giữ chỗ, đã đặt, không khả dụng (HM-FR-015, HM-BR-015).

## 8. Xử lý lỗi và ngoại lệ chung

| Tình huống | Hành vi đề xuất |
|---|---|
| Dữ liệu không hợp lệ | Báo lỗi từng trường, giữ dữ liệu đã nhập (SH-NFR-030) |
| Cập nhật đồng thời | Người ghi sau nhận thông báo xung đột, không ghi đè (SH-NFR-015) |
| Hết tồn khi giữ chỗ | Yêu cầu thua nhận thông báo hết phòng; không tạo giữ chỗ (HM-FR-019) |
| Yêu cầu hết hạn khi đang xác nhận | Một kết quả duy nhất theo giờ máy chủ (HM-BR-024) |
| Lỗi giữa chừng | Bù trừ: không để giữ chỗ treo hoặc tồn sai (SH-NFR-017) |
| Thao tác ngoài quyền hoặc ngoài tenant | Từ chối 403 và ghi audit (SA-FR-008, SA-FR-009) |
| Hệ thống ngoài lỗi | Giữ dữ liệu cũ, báo vận hành (SH-NFR-026) |

## 9. Phân quyền

Tóm tắt theo yêu cầu ở trường “Authorization”; ma trận đầy đủ ở `01_ACTORS_AND_CAPABILITY_MAP.md`. Nguyên tắc: deny by default; khách sạn chỉ truy cập dữ liệu tenant mình; mọi quyền thực thi ở backend.

## 10. Acceptance criteria

Tiêu chí đề xuất gắn theo từng yêu cầu (`<ID>.AC<n>`). Không thay thế AC của SRS hiện hành. Chưa có test case.

## 11. Truy vết

`06_REQUIREMENTS_TRACEABILITY.md`.
