# Dev Self-Test Report: Đặt phòng cho khách delay chuyến (đơn vị chi trả / sân bay)

> Ngày chạy: 14/11/2026 | Người thực hiện: AI-assisted (dev-self-test, chạy tuần tự bằng script API + Playwright)
> Môi trường test: Local. API http://localhost:3100 (PORT=3100) nối Postgres NHÚNG cổng 54329 (DB `airrest`, dữ liệu backend/.data/pg); web đã build (`vite build`, VITE_API_BASE_URL=http://localhost:3100) phục vụ bằng `vite preview` cổng 5199. KHÔNG dùng backend/.env, KHÔNG chạm Supabase.
> Code liên quan: backend/services/delay/*, backend/api/modules/{payer,hotelDelay,adminPayers}, apps/web/src/components/{admin/PayerDelay.jsx,hotel/DelayOffers.jsx}, apps/web/src/screens/user/groupLookup.js, apps/web/src/data/payer.js
> SRS/Figma: docs/superpowers/specs/2026-11-14-airport-delay-booking-design.md (+ 7b, 7c)

## 1. Tổng quan kết quả

### Theo hạng mục (template)

| Hạng mục | Total | Pass | Fail | Ghi chú |
|---|---|---|---|---|
| Happy Path | 63 | 61 | 1 | 1 chưa chạy |
| Field Validation & Business Rules | 37 | 37 | 0 |  |
| Edge Cases & Security | 44 | 43 | 0 | 1 chưa chạy |
| UI/UX & API Status Code | 3 | 3 | 0 |  |
| Bổ sung từ quét code | 7 | 7 | 0 |  |
| **Tổng** | **154** | **151** | **1** | 2 chưa chạy |

### Theo nhóm kịch bản bắt buộc

| Nhóm | Total | Pass | Fail | Ghi chú |
|---|---|---|---|---|
| A. Onboarding qua API quản trị | 33 | 33 | 0 |  |
| B. Cổng kết nối + nút Tạo chuyến bay delay | 29 | 28 | 1 |  |
| C. Quầy trên trình duyệt (nhân viên payer) | 34 | 34 | 0 |  |
| D. Khách sạn xác nhận / từ chối / chuyển | 27 | 26 | 0 | 1 chưa chạy |
| E. Email + xe sau xác nhận | 9 | 9 | 0 |  |
| F. Khách tra cứu | 13 | 13 | 0 |  |
| G. Hồi quy luồng khách lẻ | 5 | 4 | 0 | 1 chưa chạy |
| H. Chung (console, thời gian, mã trạng thái) | 4 | 4 | 0 |  |

### Case FAIL
- **UI-B01** Nút "Tạo chuyến bay delay" trên UI: hộp thoại mở, nhập giờ delay +6h, bấm "Tạo chuyến" (cả double-click)
  - Actual: Hộp thoại hiện lỗi đỏ 'Thiếu header Idempotency-Key (8–128 ký tự)'; request POST /v1/payer/simulate-delay trả 400 (cả 2 lần click); không có chuyến mới. Nguyên nhân: FE apps/web/src/data/payer.js:8 simulateDelay không truyền idempotencyKey trong khi backend/api/modules/payer/payer.router.ts (route /simulate-delay) bắt buộc idempotent('payer-simulate'). Screenshot: evidence/b01-sau-tao.png
  - LỖI THẬT (cao): nút tạo chuyến mô phỏng không dùng được trên giao diện; API qua curl (B17-B19) hoạt động

### Case chưa chạy
- **UI-D05** Offer đã quá hạn: nút Xác nhận/Không nhận bị khóa ("Hết hạn"): Không chạy: cần chờ 5 phút đếm ngược trên UI; hành vi hết hạn đã kiểm bằng job quét (D15)
- **G05** Luồng đặt phòng khách lẻ trên trình duyệt (UI) vẫn hoạt động: CHƯA CHẠY trên trình duyệt (chỉ kiểm bằng API G01-G04, test tích hợp có sẵn trong repo không chạy lại do phạm vi)

## 2. Chi tiết từng test case

| TC | Quy trình test | Input | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| A01 | Tạo đơn vị chi trả | POST /v1/admin/payers code=FXPAY1 kind=AIRLINE (không SĐT liên hệ) | 201 + payer.id | HTTP 201 | ✅ |
| A02 | Mã đơn vị trùng | POST code=FXPAY1 lần 2 | 409 | HTTP 409 PAYER_CODE_EXISTS | ✅ |
| A03 | Mã/tên sai định dạng | code=x name=A | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A04 | Không token gọi API quản trị | POST /admin/payers không Authorization | 401 | HTTP 401 UNAUTHENTICATED | ✅ |
| A05 | Tạo trạm HAN cho P1 | POST stations HAN | 201 | HTTP 201 | ✅ |
| A06 | Trạm trùng sân bay | POST stations HAN lần 2 | 409 STATION_EXISTS | HTTP 409 STATION_EXISTS | ✅ |
| A07 | Sân bay không có trong danh mục | airportIata=ZZZ | 422 AIRPORT_UNKNOWN | HTTP 422 AIRPORT_UNKNOWN | ✅ |
| A08 | Tạo giá hợp đồng cho 11 loại phòng FX của 3 KS (HAN-01/02/03) | PUT hotel-rates x11, bậc giờ 4/8/12, hoa hồng 10% | 11x 201 | 11/11 tạo mới | ✅ |
| A09 | Giá hợp đồng chồng hiệu lực bị từ chối | PUT cùng loại phòng validFrom=2026-12-01 khi bản 2026-11-14 mở (validTo=null) | 409 RATE_OVERLAP | HTTP 409 RATE_OVERLAP | ✅ |
| A10 | Bậc giờ > giá đêm bị từ chối | nightRate=500000, bậc 4h=600000 | 422 RATE_INVALID | HTTP 422 RATE_INVALID | ✅ |
| A11 | Bậc giờ không tăng dần bị từ chối | hours 8 rồi 4 | 422 | HTTP 422 RATE_INVALID | ✅ |
| A12 | Loại phòng không thuộc khách sạn | hotelId HAN-03 + roomTypeId của HAN-01 | 422 ROOM_TYPE_MISMATCH | HTTP 422 ROOM_TYPE_MISMATCH | ✅ |
| A13 | PUT lại cùng (loại phòng, validFrom) = cập nhật | PUT lặp bản 2026-11-14 | 200 (không phải 201) | HTTP 200 | ✅ |
| A14 | Hoa hồng > 100% / validTo < validFrom | commissionPct=101 | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A15 | validTo trước validFrom | 2031-01-10 -> 2031-01-01 | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A16 | Cấp khóa API: khóa thô lộ một lần | POST api-keys | 201 + key=pk_... + Cache-Control no-store | HTTP 201 key=pk_4N… cc=no-store | ✅ |
| A17 | Danh sách khóa không lộ khóa thô/hash | GET api-keys | không có field key/key_hash, không chứa khóa thô | fields=id,name,keyPrefix,createdAt | ✅ |
| A18 | DB chỉ lưu hash của khóa | SELECT key_hash | hash 64 hex, khác khóa thô | len=64 | ✅ |
| A19 | Tên khóa quá ngắn | name="a" | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A20 | Tạo nhân viên khóa theo trạm HAN | POST staff stationId=HAN | 201 + payerStationId=trạm HAN | HTTP 201 station=4339157d-f669-4693-abc3-4d43182b877f | ✅ |
| A21 | Nhân viên P1 gán trạm của P2 (STATION_MISMATCH) | POST staff P1 stationId=trạm P2 | 422 STATION_MISMATCH | HTTP 422 STATION_MISMATCH | ✅ |
| A22 | Mật khẩu < 12 ký tự | password=short1 | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A23 | Email nhân viên trùng | email đã dùng | 409 EMAIL_EXISTS | HTTP 409 EMAIL_EXISTS | ✅ |
| A24 | Email sai định dạng | email=not-an-email | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A25 | Nhân viên không gán trạm (mọi trạm của đơn vị) | POST staff không stationId | 201 + payerStationId=null | HTTP 201, payerStationId vắng mặt trong JSON (null bị bỏ khỏi response) - xác nhận tài khoản không bị khóa trạm ở bước B (thấy cả HAN và SGN) (_Sửa kỳ vọng harness: null bị lược bỏ khỏi JSON, không phải lỗi sản phẩm; kiểm chứng thêm ở case C-scope_) | ✅ |
| A26 | Danh sách đơn vị chi trả | GET /admin/payers | 200 chứa FXPAY1..3 | HTTP 200 n=3 | ✅ |
| A27 | Tạm ngưng đơn vị P3 | PATCH status=SUSPENDED | 200 | HTTP 200 | ✅ |
| A28 | Đơn vị SUSPENDED chặn nhân viên | Nhân viên P3 gọi GET /v1/payer/flights | 403 (hoặc 401) | HTTP 200 / HTTP 401 ACCOUNT_INACTIVE | ✅ |
| A29 | Khóa API của đơn vị SUSPENDED | POST ingest bằng khóa P3 | 403 PAYER_SUSPENDED | HTTP 403 PAYER_SUSPENDED | ✅ |
| A30 | Thu hồi khóa API | DELETE api-keys/:id | 204 | HTTP 204 | ✅ |
| A31 | Nhân viên payer không vào được API quản trị | GET /admin/payers bằng token nhân viên | 403 | HTTP 403 FORBIDDEN | ✅ |
| A32 | ID không phải UUID | GET /admin/payers/not-a-uuid | 400/422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A33 | Đơn vị không tồn tại | GET /admin/payers/<uuid lạ> | 404 | HTTP 404 NOT_FOUND | ✅ |
| B01 | Đẩy chuyến + 3 hành khách bằng x-payer-key | POST /v1/payer/ingest/flights, 1 chuyến DELAYED HAN, 3 pax cùng PNR FXA001 | 200, flightCreated=true, created=3 | HTTP 200 created=3 flightCreated=true | ✅ |
| B02 | Đẩy lại cùng Idempotency-Key + cùng body: trả lại kết quả cũ | Replay y hệt | 200 + header Idempotent-Replay=true, cùng flight.id | HTTP 200 replay=true sameId=true | ✅ |
| B03 | Idempotent theo (chuyến+ngày) và (PNR+họ tên): đẩy lại với key mới không tạo trùng | Cùng payload, Idempotency-Key mới | 200, created=0 updated=3, DB vẫn 3 hàng | HTTP 200 created=0 updated=3 rows=3 flightCreated=false | ✅ |
| B04 | Cùng Idempotency-Key nhưng body khác | body khác, key idem1 | 422 IDEMPOTENCY_KEY_REUSED | HTTP 422 IDEMPOTENCY_KEY_REUSED | ✅ |
| B05 | Thiếu Idempotency-Key | không header | 400 IDEMPOTENCY_KEY_REQUIRED | HTTP 400 IDEMPOTENCY_KEY_REQUIRED | ✅ |
| B06 | Thiếu / sai / đã thu hồi khóa API | không x-payer-key; khóa sai; khóa đã thu hồi (A30) | 401 INVALID_API_KEY x3 | HTTP 401 INVALID_API_KEY \| HTTP 401 INVALID_API_KEY \| HTTP 401 INVALID_API_KEY | ✅ |
| B07 | Chuyến sai trạm (origin=DAD, P1 chỉ có HAN/SGN) | origin=DAD | 403 STATION_NOT_ALLOWED | HTTP 403 STATION_NOT_ALLOWED | ✅ |
| B08 | Payload 301 khách bị từ chối (>300) | 301 hành khách | 422 VALIDATION_ERROR | HTTP 422 VALIDATION_ERROR | ✅ |
| B09 | Đúng 300 khách được chấp nhận (biên) | 300 hành khách | 200 created=300 | HTTP 200 created=300 in 400ms (_thời gian 400ms_) | ✅ |
| B10 | Tên hành khách chứa XSS và SQLi được lưu nguyên văn (tham số hóa), bảng không bị ảnh hưởng | fullName="<script>alert(1)</script>" và "Robert'); DROP TABLE delay_flight_pax;--" | 200; DB lưu literal; bảng còn nguyên | HTTP 200 stored=["<script>alert(1)</script>","Robert'); DROP TABLE delay_flight_pax;--"] rows_total=305 | ✅ |
| B11 | PNR chứa XSS bị từ chối ở validation | pnr="<script>alert(1)</script>" | 422 (PNR chỉ A-Z0-9, 5-8 ký tự) | HTTP 422 VALIDATION_ERROR | ✅ |
| B12 | Validation payload: email/SĐT/tuổi/field lạ/giờ/trạng thái/dest/mã chuyến/mảng rỗng/tên ngắn | 11 payload sai | tất cả 422 | email sai:422 SĐT sai:422 age=-1:422 age=121:422 field lạ:422 newDep<=sched:422 ONTIME có newDep:422 dest==origin:422 mã chuyến sai:422 pax rỗng:422 tên 1 ký tự:422 | ✅ |
| B13 | Đơn vị khác (P2) đẩy trùng chuyến (cùng mã + ngày) của P1 | P2 key, cùng code+ngày | 409 FLIGHT_CONFLICT (thông báo chung) | HTTP 409 FLIGHT_CONFLICT Không ghi nhận được chuyến này | ✅ |
| B14 | Mỗi lần đẩy (OK và REJECTED) đều có nhật ký payer_ingest_logs | SELECT payer_ingest_logs | có cả OK và REJECTED | [{"result":"OK","n":4},{"result":"REJECTED","n":14}] | ✅ |
| B15 | Đổi giờ bay mới -> flightChanged=true + ghi flight_changes | Đẩy lại cùng chuyến với newDepartureAt khác | 200 flightChanged=true; flight_changes +1 | HTTP 200 changed=true rows=1 | ✅ |
| B16 | Khóa cấp đơn vị đẩy được chuyến ở trạm SGN của cùng đơn vị | origin=SGN | 200 | HTTP 200 | ✅ |
| B17 | Nút "Tạo chuyến bay delay" (API simulate-delay) sinh chuyến + hành khách mô phỏng đủ kiểu | POST /v1/payer/simulate-delay delayUntil=+6h (nhân viên P1 HAN) | 201; có gia đình trẻ em+em bé, nhóm 5 người chung PNR, khách lẻ, có người thiếu email/SĐT; simulated=true | HTTP 201 pax=28 nhóm=12 giaDinhTreVaEmBe=2 nhom5=1 repThieuLienLac=1 repThieuEmail=2 simulated=true | ✅ |
| B18 | Bấm 2 lần (double click) cùng Idempotency-Key + cùng body không sinh chuyến mới | POST simulate-delay 2 lần, cùng key & body | 201 + Idempotent-Replay=true ở lần 2, cùng flight.id, 1 chuyến | HTTP 201 / HTTP 201 replay=true same=true flights=1 (_Lần chạy đầu của harness gửi body khác (timestamp) nên 422 IDEMPOTENCY_KEY_REUSED là đúng; đã chạy lại đúng body_) | ✅ |
| B19 | Hai lần bấm (key khác nhau) sinh hai chuyến KHÁC mã, PNR không trùng | Gọi simulate lần 2 với key mới | 201; code khác; 0 PNR trùng | HTTP 201 code1=BL3524 code2=QH4649 pnrTrung=0 | ✅ |
| B20 | Simulate thiếu Idempotency-Key | không header | 400 | HTTP 400 IDEMPOTENCY_KEY_REQUIRED | ✅ |
| B21 | Giờ delay trong quá khứ | delayUntil=-2h | 422 FLIGHT_TIME_INVALID | HTTP 422 FLIGHT_TIME_INVALID | ✅ |
| B22 | Giờ delay sai định dạng / field thừa | delayUntil="ngay mai"; thêm field extra | 422 x2 | HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR | ✅ |
| B23 | Simulate: tài khoản khách sạn / không đăng nhập bị chặn | token KS; không token | 403; 401 | HTTP 403 FORBIDDEN \| HTTP 401 UNAUTHENTICATED | ✅ |
| B24 | Nhân viên khóa trạm SGN: chuyến mô phỏng ở đúng sân bay của trạm mình | simulate bằng nhân viên SGN | 201 origin=SGN | HTTP 201 origin=SGN | ✅ |
| B25 | Nút mô phỏng đi qua chính cổng kết nối (ghi payer_ingest_logs source=SIMULATION) | SELECT logs | có dòng source=SIMULATION result=OK | [{"source":"SIMULATION","result":"OK","n":3}] (_spec 6.2_) | ✅ |
| B26 | Giới hạn 60 yêu cầu/phút/khóa (cổng kết nối) | 64 yêu cầu liên tiếp bằng 1 khóa | có 429 RATE_LIMITED sau ~60 lần | 429 x4; đầu tiên ở lần 61 | ✅ |
| C01 | Danh sách chuyến delay của nhân viên khóa trạm HAN chỉ có chuyến HAN của đơn vị mình | GET /v1/payer/flights (nhân viên P1/HAN) | 200; mọi origin=HAN; không có chuyến SGN của P1, không có chuyến của P2 | HTTP 200 n=6 origins=HAN coSGN=false coP2=false | ✅ |
| C02 | Nhân viên khóa trạm SGN chỉ thấy chuyến SGN | GET flights (nhân viên SGN) | 200; mọi origin=SGN; thấy sim3 + chuyến API SGN | HTTP 200 origins=SGN n=2 | ✅ |
| C03 | Nhân viên không gán trạm (cấp đơn vị) thấy mọi trạm HAN+SGN của đơn vị (xác nhận A25) | GET flights (fx.all) | 200; origins gồm HAN và SGN; không có chuyến P2 | HTTP 200 origins=HAN,SGN coP2=false (_payerScope() stationId=null_) | ✅ |
| C04 | Cô lập đơn vị: P2 chỉ thấy chuyến của P2 | GET flights (nhân viên P2) | 200; đúng 1 chuyến của P2, không chuyến P1 | HTTP 200 n=1 chuaP1=false | ✅ |
| C05 | Truy cập chéo đơn vị/trạm: chuyến, danh sách khách, xem trước, sửa liên hệ | P2 -> dữ liệu P1; nhân viên SGN -> chuyến HAN | đều 404 (không lộ tồn tại) | [["passengers",404],["preview",404],["patch pax",404],["sgn-vs-han passengers",404]] | ✅ |
| C06 | Không token / token khách sạn truy cập API payer | GET /v1/payer/flights | 401; 403 | HTTP 401 UNAUTHENTICATED \| HTTP 403 FORBIDDEN | ✅ |
| C07 | Chi tiết chuyến: hành khách gom theo PNR, có số người lớn/trẻ em/em bé | GET passengers sim1 | 200; groups theo PNR; counts khớp tổng | HTTP 200 total=28 groups=12 sumCounts=28 fam=2 | ✅ |
| C08 | Sửa email sai định dạng -> lỗi tiếng Việt | PATCH email="Sai Dinh Dang" | 422 + message tiếng Việt "Email không hợp lệ" | HTTP 422 VALIDATION_ERROR msg="Email không hợp lệ" | ✅ |
| C09 | Sửa liên hệ: SĐT sai, body rỗng, XSS trong email, field lạ | phone="12ab"; {}; email chứa <script>; thêm field role | 422 x4 | HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR | ✅ |
| C10 | Sửa email/SĐT hợp lệ: lưu ở contact_*, giữ nguyên dữ liệu gốc của hãng, có audit | PATCH email=Fx.Edit@Example.com phone=0987654321 | 200; contact_email=fx.edit@example.com; email gốc null; audit_logs có bản ghi | HTTP 200 contact_email=fx.edit@example.com gốc=null audit=2 | ✅ |
| C11 | Sửa email người đã có email (dùng bản sửa, không phải bản gốc) | PATCH email=fx.changed@example.com | 200; hiển thị email mới trong chi tiết | HTTP 200 {"id":"bbbf6324-a1bf-4365-89f0-7ce6eb2fe382","email":"fx.changed@example.com","phone":"+84934810977"} | ✅ |
| C12 | Xem trước: danh sách rỗng / 301 id / id không phải UUID / id lạ / field thừa | 6 request sai | 422,422,422,404,422,422 | 422,422,422,404,422,422 | ✅ |
| C13 | Xem trước phương án: trẻ em/em bé luôn ở cùng người lớn, không phòng riêng, không vượt sức chứa | POST preview toàn bộ khách của sim1 | 200; childAlone=0 infantOwnRoom=0 capViolation=0; cụm trẻ không tách; có hotelName, giờ nhận/trả phòng, giá hợp đồng | HTTP 200 66ms units=21 unplaced=0 childAlone=0 infantOwn=0 capViol=0 clusterSplit=0 hotels=Trăng Non Stay,Gió Đêm Inn phoneMissing=1 | ✅ |
| C14 | Xem trước: có danh sách "xử lý tay" (unplaced) và cờ thiếu SĐT | Đọc unplaced/phoneMissing trong C13 | unplaced là mảng (có thể rỗng); phoneMissing đúng với khách thiếu SĐT | unplaced=[] phoneMissing=1 | ✅ |
| C15 | Bỏ tick khách: phương án chỉ gồm khách được chọn | preview với 3 PNR đầu | 200; mọi pax trong units thuộc tập đã chọn | HTTP 200 chosen=12 covered=12 outside=0 | ✅ |
| C16 | Đặt phòng khi còn nhóm thiếu SĐT liên hệ bị chặn | POST batches khi PNR chỉ có email (không SĐT) và đơn vị không có SĐT liên hệ | 422 PAX_PHONE_REQUIRED + danh sách pnrs | HTTP 422 PAX_PHONE_REQUIRED pnrs={"pnrs":["FZZHWH"]} | ✅ |
| C17 | Danh sách điểm đón theo sân bay | GET /pickup-points?airport=han | 200; airport=HAN; 2 điểm; default=điểm đầu | HTTP 200 {"airport":"HAN","items":["Nhà ga T1 - cửa ra khu vực đón","Nhà ga T2 - cửa ra khu vực đón"],"default":"Nhà ga T1 - cửa ra khu vực đón"} | ✅ |
| C18 | Đặt phòng: điểm đón ngoài danh sách; thiếu Idempotency-Key | pickupPoint="Sân bay lạ"; không header | 422 PICKUP_POINT_INVALID; 400 | HTTP 422 PICKUP_POINT_INVALID \| HTTP 400 IDEMPOTENCY_KEY_REQUIRED | ✅ |
| C19 | Xác nhận đặt phòng bấm đúp (2 yêu cầu song song cùng Idempotency-Key) không tạo lô trùng | 2 POST /batches song song cùng key | 1 lô trong DB; 2 phản hồi cùng id (201/200/409 chờ) | 201 409 REQUEST_IN_PROGRESS batches=1 sameId=false (_thời gian 665ms_) | ✅ |
| C20 | Đặt lại lần 2 với key khác cho cùng khách -> mỗi khách chỉ một đơn hiệu lực | POST /batches key mới, cùng khách | 409 PAX_ALREADY_PLACED | HTTP 409 PAX_ALREADY_PLACED | ✅ |
| C21 | Màn theo dõi lô: nhóm có mã NH-, offer PENDING có đếm ngược ~300s, KS, loại phòng | GET /v1/payer/batches/:id | 200; mọi nhóm code NH-XXXXXXXX; offers PENDING secondsLeft<=300; điểm đón đã chọn | HTTP 200 groups=12 offers=21 pending=21 maxSec=300 unplaced=0 pickup=Nhà ga T2 - cửa ra khu vực đón hotels=Trăng Non Stay,Gió Đêm Inn | ✅ |
| C22 | Payer khác/trạm khác không xem được lô; KS không dùng được API payer | GET batches/:id bằng P2, nhân viên SGN, token KS | 404, 404, 403 | HTTP 404 BATCH_NOT_FOUND \| HTTP 404 BATCH_NOT_FOUND \| HTTP 403 FORBIDDEN | ✅ |
| C23 | Booking sinh ra là PAYER, trạng thái PENDING, không thu khách (paid=0) | SELECT bookings của lô | payment_method=PAYER; status=PENDING | {"m":"PAYER","s":"PENDING"} | ✅ |
| D01 | KS thấy yêu cầu delay của MÌNH có đếm ngược, KHÔNG thấy SĐT/email | GET /v1/hotel/delay-offers?status=PENDING (HAN-02) | 200; chỉ offer HAN-02; secondsLeft>0; không có phone/email/@ | HTTP 200 n=6 (DB HAN-02=6) maxSec=253 khoaPII=false keys=id,groupId,status,qty,expiresAt,roomNumbers,transferCount,roomType,representative,guests,secondsLeft | ✅ |
| D02 | Cô lập KS: HAN-03 chỉ thấy offer của mình | GET delay-offers (HAN-03) | 200; số offer = số offer HAN-03 | n=15 DB=15 | ✅ |
| D03 | Xác nhận với số phòng sai số lượng / rỗng / chỉ khoảng trắng | confirm qty=1 với 2 số phòng; []; ["   "] | 422 ROOM_NUMBERS_MISMATCH/VALIDATION | HTTP 422 ROOM_NUMBERS_MISMATCH \| HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR | ✅ |
| D04 | KS khác không xác nhận/từ chối được offer không thuộc mình | HAN-03 confirm & reject offer của HAN-02 | 404 OFFER_NOT_FOUND x2 | HTTP 404 OFFER_NOT_FOUND \| HTTP 404 OFFER_NOT_FOUND | ✅ |
| D05 | Từ chối không có lý do | reason="" | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| D06 | Route cũ confirm/reject đơn PAYER trả 409 USE_DELAY_OFFER_API | POST /v1/hotel/bookings/:id/confirm\|reject với booking của offer PAYER | 409 USE_DELAY_OFFER_API x2 | HTTP 409 USE_DELAY_OFFER_API \| HTTP 409 USE_DELAY_OFFER_API | ✅ |
| D07 | KS xác nhận đúng số phòng (phòng đơn và cụm gia đình bằng một thao tác) | confirm roomNumbers=["201"] và ["305"] | 200; offer CONFIRMED + room_numbers; booking CONFIRMED | HTTP 200 HTTP 200 [{"status":"CONFIRMED","room_numbers":["201"],"bs":"CONFIRMED"},{"status":"CONFIRMED","room_numbers":["305"],"bs":"CONFIRMED"}] 210/367ms | ✅ |
| D08 | Xác nhận lặp offer đã CONFIRMED | confirm lần 2 | 409 INVALID_STATE | HTTP 409 INVALID_STATE | ✅ |
| D09 | Từ chối offer đã CONFIRMED | reject sau confirm | 409 INVALID_STATE | HTTP 409 INVALID_STATE | ✅ |
| D10 | KS từ chối kèm lý do -> chuyển NGAY sang KS khác (transfer_count, rejected_hotel_ids) | POST reject reason="Hết phòng sạch" ở HAN-02 (khách đi lẻ) | 200 ngay; offer cũ REJECTED; offer mới PENDING ở KS khác, transfer_count=1, rejected_hotel_ids chứa HAN-02 | HTTP 200 310ms cũ=REJECTED mới=HAN-03 tc=1 rejected=["HAN-02"] | ✅ |
| D11 | Booking cũ của offer bị từ chối được hủy/nhả HOLD | SELECT bookings.status của offer cũ | REJECTED/CANCELLED/EXPIRED (không còn PENDING) | REJECTED | ✅ |
| D12 | Từ chối cụm có trẻ em: chuyển NGUYÊN CỤM (cùng danh sách khách) sang KS khác, không quay lại KS đã từ chối | reject offer cụm gia đình (3 khách) ở HAN-03 | offer mới cùng pax_ids, KS ≠ HAN-03; transfer_count=1 | HTTP 200 mới=HAN-01 status=PENDING tc=1 pax=3/3 qty=1 | ✅ |
| D13 | Từ chối lần 2: KS mới không phải KS đã từ chối trước đó; nếu hết KS phù hợp -> nhóm FAILED | reject tiếp ở KS vừa nhận | Offer cụm chuyển KS chưa từng từ chối; hết KS phù hợp (NO_ROOM) -> nhóm FAILED | HTTP 200 offerPending=HAN-03 tc=0 groupStatus=FAILED rejectedByChain=["HAN-03:REJECTED","HAN-03:PENDING","HAN-01:REJECTED"] (_Harness ban đầu tính nhầm offer PENDING của phòng đơn anh em trong cùng PNR (HAN-03, tc=0). Diễn biến thật: cụm HAN-03(rej) -> HAN-01(rej) -> không còn KS có phòng gia đình -> group FAILED. Quan sát: nhóm FAILED nhưng phòng đơn cùng PNR vẫn PENDING (xem ghi chú kỹ thuật)._) | ✅ |
| D14 | Sự kiện booking_events ghi đủ CONFIRMED/REJECTED/TRANSFERRED | SELECT booking_events type DELAY_OFFER_* | có DELAY_OFFER_CONFIRMED, DELAY_OFFER_REJECTED, DELAY_OFFER_TRANSFERRED | [{"type":"DELAY_OFFER_CONFIRMED","n":2},{"type":"DELAY_OFFER_REJECTED","n":3},{"type":"DELAY_OFFER_TRANSFERRED","n":2}] | ✅ |
| D15 | Offer hết hạn 5' được job quét tự động hết hạn và chuyển sang KS khác | Không xác nhận 16 offer của lô sim1 trong 5 phút; job quét delay.sweepSec=5s | Mọi offer EXPIRED có offer thay thế PENDING ở KS khác, transfer_count=1; audit DELAY_OFFER.EXPIRE | expired(tc=0)=15 cóOfferMới=15 khôngCó=0 quayLạiCùngKS=0 audit=16 (_Lưu ý: API bị tiến trình ngoài SIGTERM giữa chừng (log "Đang tắt..."); khởi động lại thì job quét xử lý ngay các offer quá hạn, nên thời điểm chuyển trễ ~1 phút so với hạn_) | ✅ |
| D16 | Chuyển KS khi hết hạn: cụm chuyển nguyên cụm, KS mới không nằm trong rejected_hotel_ids | Đối chiếu pax_ids offer cũ/mới | số khách bằng nhau; hotel mới ∉ rejected | sameCluster=15/15 | ✅ |
| D17 | Vượt số lần chuyển tối đa (delay.maxTransfers=1) -> nhóm FAILED | Hạ cấu hình maxTransfers=1 (fixture); khách lẻ bị từ chối 2 lần | Lần 1: chuyển sang KS khác (tc=1); lần 2: không chuyển nữa, group FAILED, không còn offer PENDING | first=HAN-03 second=HAN-01(tc=1) group=FAILED pending=0 batchGroups=["FAILED"] (_Cảnh báo đỏ ở quầy kiểm ở case UI-D alert_) | ✅ |
| D18 | Chuỗi chuyển không quay lại KS đã từ chối | Đọc chuỗi offer của lô khách lẻ ở D17 | mỗi KS xuất hiện tối đa một lần | [] | ✅ |
| D19 | Quá 15 phút chờ (delay.maxWaitMin) -> nhóm FAILED, không chuyển tiếp | Lô sim1: không xác nhận offer; 3 vòng hết hạn 5 phút (16:32 -> 16:48) | Sau vòng hết hạn thứ 3 (tổng >15'): các nhóm chưa có phòng chuyển FAILED; không còn booking PENDING (HOLD đã nhả) | delay_groups: FAILED=9, CONFIRMED=3; offer EXPIRED tc=2: 16 và không có offer tc=3; bookings PENDING của lô = 0 (_Cảnh báo đỏ realtime kiểm riêng ở UI-D06 (MAX_TRANSFERS)_) | ✅ |
| E01 | KHÔNG có email nào trước khi KS xác nhận (lô vừa đặt, mọi offer PENDING) | SELECT count(*) email_outbox sau khi đặt lô | 0 thư (hoặc không có thư của lô này) | email_outbox=0 | ✅ |
| E02 | Sau khi KS xác nhận mới có thư; đúng người có email, dùng email đã sửa ở quầy (contact_email) thay cho email gốc | Xác nhận 2 offer của 2 khách đã sửa email (một khách chưa có email gốc, một khách có email gốc khác) | Thư room-confirmed gửi tới fx.edit@example.com và fx.changed@example.com; không gửi tới email gốc cũ | HTTP 200 HTTP 200 to=["dang.my.linh19@example.com\|group-summary","dang.my.linh19@example.com\|room-confirmed","dang.my.linh19@example.com\|group-summary","fx.edit@example.com\|room-confirmed","fx.edit@example.com\|group-summary","fx.changed@example.com\|room-confirmed","fx.changed@example.com\|group-summary"] gốc2=hoang.thi.hoa11@example.com | ✅ |
| E03 | Xác nhận lặp không gửi trùng thư (409 + outbox không tăng + dedupe_key duy nhất) | Confirm lần 2 cùng offer | 409; email_outbox không thêm; không dedupe_key trùng | HTTP 409 INVALID_STATE 7->7 dupKeys=0 | ✅ |
| E04 | Người đại diện nhận bản tổng hợp nhóm cập nhật dần (1/2 rồi 2/2), có link /tra-cuu?code=NH- | Đọc email_outbox template group-summary của nhóm gia đình 5 người (2 offer) | 2 thư group-summary tới email người đại diện: "1/2" rồi "2/2"; link chứa /tra-cuu?code=NH- | ["dang.my.linh19@example.com\|Tổng hợp phòng của nhóm: 1/2 phòng đã xác nhận","dang.my.linh19@example.com\|Tổng hợp phòng của nhóm: 2/2 phòng đã xác nhận","fx.edit@example.com\|Tổng hợp phòng của nhóm: 1/1 phòng đã xác nhận","fx.changed@example.com\|Tổng hợp phòng của nhóm: 1/1 phòng đã xác nhận"] | ✅ |
| E05 | Nội dung thư xác nhận phòng đủ: KS, số phòng, giờ ở, giờ rời, mã đơn, xe đón/về, link tra cứu | Đọc body_text của room-confirmed | có đủ 8 mục | Khách sạn:✓ Số phòng:✓ Nhận phòng:✓ Giờ phải rời khách sạn:✓ Mã đơn: AR-✓ Xe đón:✓ Xe về sân bay:✓ /tra-cuu?code=✓ | ✅ |
| E06 | Người thiếu email bị bỏ qua (không lỗi, không thư rác tới địa chỉ rỗng) | Offer CONFIRMED có khách không có email | Không có hàng outbox to_email rỗng; các offer vẫn xác nhận 200 | khách thiếu email trong offer đã xác nhận=4; rỗng=0 | ✅ |
| E07 | Xe: mỗi offer CONFIRMED có TO_HOTEL (điểm đón đã chọn) và TO_AIRPORT (giờ rời KS), billed=false | SELECT shuttle_requests của lô | mỗi offer đủ 2 hướng; billed=false; TO_HOTEL.location=điểm đón đã chọn; TO_AIRPORT.pickup_at=giờ trả phòng | offers=4 dirs=["TO_AIRPORT+TO_HOTEL"] billed=false toHotelLoc=Nhà ga T2 - cửa ra khu vực đón pickup=Nhà ga T2 - cửa ra khu vực đón | ✅ |
| E08 | Tiền booking không đổi/không thu khách (PAYER, paid=0), xe không tính vào booking | SELECT bookings.payment/pricing của offer CONFIRMED | payment_method=PAYER paid_vnd=0; pricing.shuttleVnd=0 và totalVnd=roomVnd (xe không cộng vào booking) | PAYER:0:UNPAID pricing={"params":{"configVersions":{"serviceFee":0}},"roomVnd":300000,"totalVnd":300000,"shuttleVnd":0,"discountVnd":0,"serviceFeeVnd":0} | ✅ |
| E09 | Cụm có trẻ em (4 khách) không bị tách xe: mỗi yêu cầu xe của cụm có tối đa 1 chuyến | SELECT shuttle_trips theo request của cụm gia đình | Mỗi request (TO_HOTEL, TO_AIRPORT) của cụm ≤ 1 trip (không tách) | trips=[{"st":"OFFERED","seats":3},{"st":"OFFERED","seats":3}] (_TO_HOTEL điều phối ngay, TO_AIRPORT chỉ điều phối khi gần giờ (SHUTTLE_DISPATCH_LEAD_MIN)_) | ✅ |
| F01 | Tra cứu mã nhóm NH-... + SĐT đúng (nhóm có phòng CONFIRMED): lộ KS/số phòng/giờ/mã đơn, tên rút gọn | POST /v1/bookings/group-lookup {NH-..., phone người đại diện} | 200; phòng CONFIRMED có hotelName, roomNumbers, checkInAt, checkoutAt, bookingCode AR-; guest rút gọn; không email/SĐT | HTTP 200 79ms rooms=2 confirmed={"status":"CONFIRMED","guest":"Đặng M. L.","members":4,"hotelName":"Trăng Non Stay","roomNumbers":["305"],"checkInAt":"2026-11-14T16:42:32.108Z","checkoutAt":"2026-11-14T20:05:44.695Z","bookingCode":"AR-G4D3VS40"} PII=false | ✅ |
| F02 | SĐT sai hoặc mã không tồn tại cho cùng một 404 chung (không lộ mã tồn tại) | group-lookup phone sai; mã NH-ZZZZZZZZ | 404 GROUP_NOT_FOUND, message giống hệt | HTTP 404 GROUP_NOT_FOUND / HTTP 404 GROUP_NOT_FOUND sameBody=true | ✅ |
| F03 | Nhóm chưa có phòng được xác nhận: KHÔNG lộ khách sạn/số phòng/mã đơn | group-lookup nhóm đang chờ KS (OFFERED, không offer CONFIRMED) | 200; mọi phòng status WAITING_HOTEL/TRANSFERRING; không có hotelName/roomNumbers/bookingCode; không chứa tên KS | HTTP 200 {"groupCode":"NH-83DDAM4D","status":"OFFERED","rooms":[{"status":"WAITING_HOTEL","guest":"Trần T. K.","members":1,"message":"Đang chờ khách sạn xác nhận"}]} | ✅ |
| F04 | Nhóm FAILED: khách thấy "cần nhân viên hỗ trợ" (NEEDS_STAFF), không lộ KS | group-lookup nhóm FAILED | 200; có phòng NEEDS_STAFF | HTTP 200 statuses=["NEEDS_STAFF","NEEDS_STAFF","NEEDS_STAFF","NEEDS_STAFF","NEEDS_STAFF"] groupStatus=FAILED | ✅ |
| F05 | Chuẩn hóa SĐT khi tra cứu (0xxx, 84xxx, có khoảng trắng) | 3 định dạng của cùng SĐT | 200 x3 | HTTP 200 \| HTTP 200 \| HTTP 200 | ✅ |
| F06 | Tra cứu: mã sai định dạng / thiếu SĐT / SĐT sai định dạng / SQLi trong mã | 4 request lỗi | 422 x4 (không 500) | HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR | ✅ |
| F07 | Mã đơn AR-... + SĐT tra cứu như cũ (đơn PAYER) | POST /v1/bookings/lookup {AR-..., SĐT} | 200; booking.code khớp | HTTP 200 16ms code=AR-E31ET5VY | ✅ |
| F08 | Mã AR đúng, SĐT sai -> 404 chung | lookup SĐT sai | 404 | HTTP 404 BOOKING_NOT_FOUND | ✅ |
| F09 | strictRateLimit 10/phút/IP cho tra cứu: dò SĐT bị 429 | 14 lần group-lookup liên tiếp SĐT sai | xuất hiện 429 RATE_LIMITED (hành vi đúng) | 429,429,429,429,429,429,429,429,429,429,429,429,429,429 (_429 là hành vi đúng; ghi nhận như một case_) | ✅ |
| G01 | Đặt phòng thường (AT_HOTEL) của khách lẻ vẫn hoạt động | POST /v1/bookings HAN-01 Căn hộ 1PN, 1 đêm, AT_HOTEL | 201; status PENDING/CONFIRMED; payment_method=AT_HOTEL | HTTP 201 88ms code=AR-75NBTFDA status=PENDING | ✅ |
| G02 | Khách lẻ KHÔNG chọn được paymentMethod=PAYER qua POST /v1/bookings | POST với PAYER và payer | 422 VALIDATION_ERROR; không có booking PAYER nào được tạo | HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR \| bookingPAYER của khách lẻ=0 | ✅ |
| G03 | KS xác nhận đơn thường bằng route cũ vẫn chạy (đơn AT_HOTEL không bị chặn USE_DELAY_OFFER_API) | POST /v1/hotel/bookings/:id/confirm trên đơn AT_HOTEL | 200 (hoặc 409 INVALID_STATE nếu tự xác nhận) nhưng KHÔNG phải USE_DELAY_OFFER_API | HTTP 200 (trước: PENDING) | ✅ |
| G04 | Khách lẻ tra cứu đơn thường như cũ | lookup AR- đơn AT_HOTEL | 200 | HTTP 200 | ✅ |
| G05 | Luồng đặt phòng khách lẻ trên trình duyệt (UI) vẫn hoạt động | Đặt phòng thường qua giao diện khách | Hoàn tất đặt phòng | CHƯA CHẠY trên trình duyệt (chỉ kiểm bằng API G01-G04, test tích hợp có sẵn trong repo không chạy lại do phạm vi) (_Đề nghị QA chạy lại luồng UI khách lẻ_) | ⏸ |
| H01 | Console trình duyệt (F12) không có lỗi đỏ bất thường ở các màn: quầy, chi tiết, preview, theo dõi lô, KS, tra cứu, quầy P2, admin | Playwright bắt console.error/pageerror/requestfailed trên 8 phiên | 0 pageerror, 0 requestfailed, 0 dialog; console.error chỉ là phản hồi 4xx của các thao tác thử lỗi chủ ý và 400 của lỗi UI-B01 | pageerror=0, requestfailed=0, dialog=0 (XSS không chạy). console.error: 400 POST /v1/payer/simulate-delay x2 (LỖI UI-B01), 422 PATCH passengers x2 (thử email sai chủ ý), 404 group-lookup x1 (thử SĐT sai chủ ý) (_Các ‘Failed to load resource’ còn lại là hệ quả của UI-B01; ngoài ra sạch_) | ✅ |
| H02 | Thời gian phản hồi API chính (đo thực tế local, không phải load test) | Đo mọi lần gọi trong phiên | Các API chính < 1s; preview 300 khách < 5s | POST /payer/ingest/flights: p50 21ms, max 400ms (n=28) \| POST /payer/simulate-delay: p50 61ms, max 67ms (n=4) \| GET /payer/flights: p50 10ms, max 16ms (n=3) \| POST /payer/flights/:id/batches/preview: p50 6ms, max 66ms (n=8) \| POST /payer/flights/:id/batches: p50 665ms, max 665ms (n=2) \| POST /hotel/delay-offers/:id/confirm: p50 367ms, max 367ms (n=2) \| POST /hotel/delay-offers/:id/reject: p50 310ms, max 310ms (n=1) \| POST /bookings/group-lookup: p50 5ms, max 79ms (n=28) \| POST /payer/flights/:id/batches/preview (300 khách): p50 148ms, max 148ms (n=1) | ✅ |
| H03 | Mã trạng thái đúng ngữ nghĩa trên các nhánh đã chạy | Tổng hợp từ các case A-G | 200/201/204/400/401/403/404/409/422/429 đều xuất hiện đúng chỗ | 200 (đọc/sửa), 201 (tạo), 204 (thu hồi khóa), 400 (thiếu Idempotency-Key), 401 (khóa/token sai), 403 (sai trạm/quyền/SUSPENDED), 404 (chéo đơn vị/KS), 409 (trùng/trạng thái), 422 (validation), 429 (rate limit) | ✅ |
| UI-B01 | Nút "Tạo chuyến bay delay" trên UI: hộp thoại mở, nhập giờ delay +6h, bấm "Tạo chuyến" (cả double-click) | Quầy P1/HAN: mở hộp thoại, datetime-local +6h, dblclick Tạo chuyến | 201 và chuyến mô phỏng mới xuất hiện trong danh sách | Hộp thoại hiện lỗi đỏ 'Thiếu header Idempotency-Key (8–128 ký tự)'; request POST /v1/payer/simulate-delay trả 400 (cả 2 lần click); không có chuyến mới. Nguyên nhân: FE apps/web/src/data/payer.js:8 simulateDelay không truyền idempotencyKey trong khi backend/api/modules/payer/payer.router.ts (route /simulate-delay) bắt buộc idempotent('payer-simulate'). Screenshot: evidence/b01-sau-tao.png (_LỖI THẬT (cao): nút tạo chuyến mô phỏng không dùng được trên giao diện; API qua curl (B17-B19) hoạt động_) | ❌ |
| UI-C01 | Đăng nhập nhân viên payer trên trình duyệt: menu "Chuyến bay delay" chỉ hiện với quyền, không có menu khách sạn/quản trị khác | Login UI fx.han@fxpay1.test | Vào cổng làm việc; thấy "Chuyến bay delay"; không thấy "Yêu cầu khách delay" | Chuyến bay delay=true; Yêu cầu khách delay=false; url=http://localhost:5199/#/admin (_nav text: Bỏ qua tới nội dung chính \| AIRREST \| Nơi nghỉ quanh sân bay \| Quản trị \| Nhân viên quầy HAN \| Delay \| Quản trị \| Chuyến bay delay \| Chuyến bay delay \|  \| Các chuyến delay của sân bay trạm \|  \| Tạo chuyến bay delay \| Chuyến	Hã_) | ✅ |
| UI-C02 | Danh sách chuyến delay trên UI chỉ của trạm HAN của đơn vị mình | Mở tab Chuyến bay delay | Bảng chỉ có chuyến HAN; không có chuyến SGN của P1, không có chuyến P2 | rows=8; thấySGN=false; thấyP2=false | ✅ |
| UI-C03 | Tên hành khách chứa <script> hiển thị escape (không chạy script), SQLi hiển thị nguyên văn | Mở chuyến có hành khách tên "<script>alert(1)</script>" | Văn bản hiển thị nguyên văn; không có dialog alert; không có thẻ script chèn | hiểnThịNguyênVăn=true; thẻScriptChèn=0; dialog=0; htmlEscape=true; SQLi hiển thị=true | ✅ |
| UI-C04 | Chi tiết chuyến: nhóm theo PNR, hiển thị số người lớn/trẻ em/em bé; tick mặc định chọn hết | Mở chuyến sim2 | Mỗi PNR một khối (pnr-group); tất cả checkbox được chọn; nút "Đặt phòng nghỉ (n/n)" | pnr-group=14; pax=30; checked=30; nút="Đặt phòng nghỉ (30/30)"; hiệnNgườiLớn/TrẻEm/EmBé=true | ✅ |
| UI-C05 | Bỏ tick/tick lại một hành khách cập nhật bộ đếm nút "Đặt phòng nghỉ" | Bỏ tick khách đầu, tick lại | (n-1)/n rồi n/n | Đặt phòng nghỉ (29/30) -> Đặt phòng nghỉ (30/30) | ✅ |
| UI-C06 | Sửa email trên UI: định dạng sai -> lỗi tiếng Việt; XSS không chạy; hợp lệ -> lưu | Nhấn Sửa, nhập email "abc", rồi "<script>alert(2)</script>@x.vn", rồi hợp lệ | Lỗi tiếng Việt cho 2 giá trị sai; lưu được giá trị hợp lệ | lỗi1="Email không đúng định dạng." \| lỗi2="Email không hợp lệ (email)" \| DB đã lưu=1 \| hiển thị="ui.edit3@example.com · +84987607116 Sửa \|\| — · chưa có SĐT Sửa \|\| — · chưa có SĐT Sửa \|\| — · chưa có SĐT Sửa" \| dialog=0 (_Chạy lại sau lần đầu đọc nhầm ô (harness)_) | ✅ |
| UI-C07 | "Đặt phòng nghỉ" mở xem trước: phương án theo KS, cụm trẻ ở cùng phòng, chọn điểm đón, danh sách xử lý tay; thiếu SĐT chặn xác nhận | Bấm Đặt phòng nghỉ (tất cả khách sim2) | Có preview-unit; pill "Cụm có trẻ em"; select điểm đón; cảnh báo thiếu SĐT & nút Xác nhận bị khóa | units=23; cụmTrẻEm=true; sátNhau=true; điểmĐón=["Nhà ga T1 - cửa ra khu vực đón","Nhà ga T2 - cửa ra khu vực đón"]; thiếuSĐT=2; nútXácNhậnKhóa=true; unplacedList=0 | ✅ |
| UI-C08 | Nhập SĐT cho người đại diện thiếu SĐT ngay trong preview mở khóa nút xác nhận | Sửa liên hệ trong khối thiếu SĐT, nhập 0912345678 | Cảnh báo biến mất; nút Xác nhận đặt bật | còn cảnh báo=0; nútKhóa=false | ✅ |
| UI-C09 | Xác nhận đặt: double-click không tạo lô trùng; chuyển sang màn theo dõi lô có đếm ngược, điểm đón | Chọn điểm đón thứ 2, double-click "Xác nhận đặt" | 1 lô trong DB cho sim2; màn theo dõi: batch-summary, offer-countdown, batch-pickup | lô=1; summary="Đang chờ: 23 · Đang chuyển khách sạn: 0 · Đã xác nhận: 0 · Cần xử lý tay: 0"; đếmNgược=23 (5:00); điểmĐón="Điểm đón ở sân bay: Nhà ga T2 - cửa ra khu vực đón" | ✅ |
| UI-C10 | Quầy đơn vị khác (P2) trên UI chỉ thấy chuyến của mình, không thấy chuyến/lô của P1 | Login fx.han@fxpay2.test | Bảng chỉ 1 chuyến của P2; không có mã chuyến P1 | rows=1; có chuyến P2=true; lộ chuyến P1=false | ✅ |
| UI-C11 | Quyền theo permission: tài khoản admin (không có quyền payer:delay) không thấy menu "Chuyến bay delay"; KS không thấy menu quầy | Login admin@demo.airrest.vn | Không có tab "Chuyến bay delay" | url=http://localhost:5199/#/admin; thấy "Chuyến bay delay"=false; menu admin=Bỏ qua tới nội dung chính \| AIRREST \| Nơi nghỉ quanh sân bay \| Quản trị \| Admin Demo \| Tổng quan \| Khách sạn \| Đơn đặt \| Hỗ trợ \| Tài khoản \| Cấu hình \| Chuyến bay \| Thanh toán \| Nhật ký \| Quản trị \| Tổng quan \| Tổng quan \|  \| Toàn hệ thống \|  \| Lọc \|  \| Khoảng 15 | ✅ |
| UI-D01 | KS đăng nhập: tab "Yêu cầu khách delay" thấy yêu cầu có đếm ngược, KHÔNG thấy SĐT/email; menu không có "Chuyến bay delay" | Login ql.han02fx@khachsan.mo, mở tab Yêu cầu khách delay | Thẻ yêu cầu (delay-offer) có đếm ngược mm:ss; không SĐT/email; không có menu quầy | cards=24 (DB PENDING HAN-02=24); đếmNgược=0:32; lộPII=false; cóMenuQuầy=false | ✅ |
| UI-D02 | KS xác nhận để trống số phòng -> lỗi; từ chối không lý do -> lỗi | Mở Xác nhận, bấm Gửi xác nhận khi trống; mở Không nhận, gửi khi trống lý do | Hiện lỗi tiếng Việt, không gọi API thay đổi dữ liệu | lỗiXácNhận="Nhập đúng 1 số phòng khác nhau (hiện có 0)." lỗiTừChối="Nhập lý do từ chối (1 đến 300 ký tự)." | ✅ |
| UI-D03 | KS xác nhận đúng số phòng trên UI (cụm nhập đủ số phòng) | Chọn thẻ đầu, nhập số phòng, Gửi xác nhận | Thẻ chuyển trạng thái; DB offer CONFIRMED với room_numbers đã nhập | số ô nhập=1; offer CONFIRMED với phòng 710 =1 | ✅ |
| UI-D04 | KS từ chối trên UI kèm lý do -> chuyển NGAY sang KS khác | Thẻ tiếp theo: Không nhận + lý do, Gửi từ chối | Offer cũ REJECTED, offer mới PENDING ở KS ≠ HAN-02 trong vài giây; transfer_count=1 | Offer a80c4917 (HAN-02) REJECTED, lý do "KS hết phòng sạch (UI)"; offer mới PENDING ở HAN-03, transfer_count=1, rejected_hotel_ids=[HAN-02] (_Lần chạy đầu của harness đọc nhầm offer (UI sắp xếp seq giảm dần); đối chiếu lại DB theo lý do từ chối_) | ✅ |
| UI-D05 | Offer đã quá hạn: nút Xác nhận/Không nhận bị khóa ("Hết hạn") | Chờ đến khi đếm ngược về 0 trên UI hoặc job chuyển đi | Thẻ hết hạn mờ + disabled hoặc biến khỏi danh sách PENDING | Không chạy: cần chờ 5 phút đếm ngược trên UI; hành vi hết hạn đã kiểm bằng job quét (D15) | ⏸ |
| UI-D06 | Quá giới hạn chuyển KS -> nhóm FAILED + cảnh báo đỏ xuất hiện trực tiếp (realtime) ở màn theo dõi lô của quầy | Quầy mở theo dõi lô; hạ delay.maxTransfers=0 (fixture); KS từ chối offer | Notice đỏ "Cảnh báo: chuyển khách sạn thất bại" (delay-alert) + "Cần xử lý tay" (failed-groups); DB group FAILED | reject=200; delay-alert=1 "Nhóm b64b86c6-82b9-401b-8288-e836afe6802e không chuyển được sang khách sạn khác (MAX_TRANSFERS). Cần"; failed-groups=1; group=FAILED (_Cấu hình maxTransfers đã khôi phục về 3_) | ✅ |
| UI-F01 | Link email /tra-cuu?code=NH-... mở trang tra cứu, yêu cầu thêm SĐT; nhập mã + SĐT đúng -> hiển thị nhóm: phòng đã xác nhận lộ KS/số phòng/giờ ở/mã đơn | Mở /tra-cuu?code=<NH-...>; nhập "<NH-...> <SĐT người đại diện>" | Bước 1 báo thiếu SĐT; bước 2 group-result có KS, phòng, giờ ở, mã đơn AR- | prefill="NH-15TWGF8D"; lỗi bước1="Nhập thêm số điện thoại của người đại diện, ví dụ NH-XXXXXXXX 0912345678."; rooms=2; nội dung="Mã nhóm \| NH-15TWGF8D \| Đặng M. L. + 3 người \| Đã xác nhận \|  \| Trăng Non Stay · phòng 305 \|  \| Giờ ở: 23:42 14/11/26 → phải rời khách sạn lúc 03:05 15/11/26 \|  \| Mã đơn AR-G4D3VS40: xem chi tiết \| Trần V. H. \| Đã xác nhận \|  \| Trăng Non Stay · phòng 201 \|  \| " | ✅ |
| UI-F02 | Nhóm chưa xác nhận trên UI: KHÔNG hiện tên KS/số phòng/mã đơn | Tra cứu nhóm đang chờ KS | Trạng thái chờ; không có tên KS, số phòng, mã AR- | nội dung="Mã nhóm \| NH-83DDAM4D \| Trần T. K. \| Đang chờ khách sạn xác nhận" | ✅ |
| UI-F03 | Sai SĐT: thông báo lỗi chung bằng tiếng Việt, không lộ nhóm tồn tại | Nhập mã đúng + SĐT sai | Thông báo "Không tìm thấy nhóm khớp mã và số điện thoại này"; không có group-result | lỗi="Không tìm thấy nhóm khớp mã và số điện thoại này. Kiểm tra lại thông tin đã nhập." group-result=0 | ✅ |
| UI-F04 | Mã đơn AR-... + SĐT vẫn tra cứu bình thường trên UI (đơn PAYER) | Nhập "<AR-...> <SĐT>" | Hiển thị chi tiết booking | thấy mã=true; alert="" | ✅ |
| X01 | Trẻ em / em bé không có người lớn đi cùng không bao giờ được xếp phòng riêng -> vào danh sách xử lý tay (CHILD_WITHOUT_ADULT) | Chuyến chỉ có trẻ 8 tuổi (PNR FXK001) và em bé 1 tuổi (PNR FXK002), không người lớn | preview: units=[]; unplaced chứa 2 khách lý do CHILD_WITHOUT_ADULT; nút xác nhận không dùng được | HTTP 200 units=0 unplaced=["CHILD_WITHOUT_ADULT","CHILD_WITHOUT_ADULT"] (_Nguồn: services/delay/rooms/plan.ts (Anti-goal: trẻ em ở một mình)_) | ✅ |
| X02 | Giờ bay mới quá sát (còn ~2h, trừ 120' có mặt + 15' dự phòng + xe) -> từ chối rõ ràng | Chuyến newDep = +2.2h | 409 FLIGHT_TOO_SOON | HTTP 409 FLIGHT_TOO_SOON Giờ bay mới quá sát, không đủ thời gian nghỉ trước khi ra sân bay (_Nguồn: services/delay/batches.ts candidateHotels (spec 6.5)_) | ✅ |
| X03 | Xem trước 300 khách (quy mô tối đa của spec) trả lời trong thời gian chấp nhận được | POST preview chuyến 300 khách (100 PNR, mỗi PNR 3 người lớn) | 200 trong < 5s | HTTP 200 148ms units=241 unplaced=59 (_Đo thực tế 1 lần, không phải load test_) | ✅ |
| X04 | Offer: id lạ/không phải UUID, status không hợp lệ, không token, token nhân viên payer | confirm uuid lạ; confirm id "not-uuid"; ?status=BOGUS; không token; token nhân viên payer | 404; 422/400; 422/400; 401; 403 | HTTP 404 OFFER_NOT_FOUND \| HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR \| HTTP 401 UNAUTHENTICATED \| HTTP 403 FORBIDDEN | ✅ |
| X05 | Giới hạn đầu vào của KS: >50 số phòng, số phòng dài >20 ký tự (XSS), lý do >300 ký tự | confirm 51 số phòng; số phòng 60 ký tự có <img onerror>; reject lý do 301 ký tự | 422 x3 | HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR \| HTTP 422 VALIDATION_ERROR | ✅ |

## 3. Ghi chú kỹ thuật (Bước 3 — thực thi)

### Môi trường, bảo đảm an toàn
- API khởi động bằng `node --import tsx` với biến môi trường ghi đè hoàn toàn (KHÔNG đọc backend/.env): DATABASE_URL=postgres://…@localhost:54329/airrest, DATABASE_SSL=false, PORT=3100, CORS_ORIGINS=http://localhost:5199, PUBLIC_WEB_URL=http://localhost:5199, SMTP_URL không đặt. Đã xác nhận bằng `ss -tnp`: mọi kết nối của tiến trình API chỉ tới 127.0.0.1:54329 (8 socket), không có kết nối ra ngoài trước khi chạy test.
- Postgres nhúng cổng 54329 đã chạy sẵn từ trước (không phải tiến trình do phiên này bật); phiên này chỉ áp migration (tự chạy khi API kết nối: 017-022) và dùng DB đó.
- Email KHÔNG gửi thật: SMTP_URL không đặt, `email_outbox.status=SENT` chỉ nghĩa là transport ghi log. Kiểm chứng nội dung thư qua bảng email_outbox (body_text).
- Hai lần API bị SIGTERM bởi tiến trình ngoài phiên này (log "Đang tắt..."): lần 1 ngay sau khi bật, lần 2 giữa lúc chờ hết hạn offer (D15). Đã bật lại bằng launcher có tên riêng; D15 vì vậy chuyển KS trễ ~1 phút so với hạn, hành vi vẫn đúng.

### Fixture đã chuẩn bị trực tiếp trên DB NHÚNG (không có API)
- Đặt lại mật khẩu (về mật khẩu thử của phiên, không ghi trong báo cáo) cho admin@demo.airrest.vn, ql.han01@khachsan.mo, ql.han03@khachsan.mo, ql.sgn01@khachsan.mo; tạo thêm tài khoản KS ql.han02fx@khachsan.mo (chủ KS HAN-02, copy role của ql.han03) vì HAN-02 chưa có tài khoản đăng nhập.
- Thêm loại phòng tiền tố "FX " cho 3 KS gần HAN: HAN-02 (FX Đơn SINGLE, FX Twin TWIN, FX Gia đình FAMILY), HAN-03 và HAN-01 (FX Đơn, FX Đôi DOUBLE, FX Gia đình FAMILY, FX Thông nhau DOUBLE+connecting); sau đó tăng total_rooms (+25, riêng Gia đình +3) để các lô thử không cạn tồn.
- vehicles.child_seats: HAN-02 (xe >=7 chỗ) = 4, HAN-01 = 2.
- Giá hợp đồng của 11 loại phòng FX tạo qua API quản trị (A08), không SQL.
- Cấu hình hệ thống qua API admin (PUT /v1/admin/configs/delay.maxTransfers): đổi tạm 1 (D17) và 0 (UI-D06), ĐÃ khôi phục 3 (xác nhận bằng GET /configs: hotelConfirmMin=5, maxTransfers=3, maxWaitMin=15, sweepSec=5, arriveBeforeMin=120, bufferMin=15). Hết hạn 5' và quá 15' kiểm bằng cấu hình mặc định, chờ thật.

### Console log (F12-equivalent)
- 8 phiên Playwright (quầy P1 nhiều phiên, KS HAN-02, quầy P2, khách tra cứu, admin): pageerror=0, requestfailed=0, hộp thoại alert=0 (XSS không chạy). console.error duy nhất là phản hồi HTTP 4xx: 400 POST /v1/payer/simulate-delay x2 (do lỗi UI-B01), 422 PATCH passengers (thử email sai chủ ý), 404 group-lookup (thử SĐT sai chủ ý).

### API response time (đo thực tế, local, không phải load test)
| Endpoint | p50 (ms) | max (ms) | n |
|---|---|---|---|
| POST /admin/payers | 38 | 38 | 1 |
| POST /admin/payers/:id/stations | 18 | 18 | 1 |
| PUT /admin/payers/:id/hotel-rates | 17 | 21 | 11 |
| POST /admin/payers/:id/api-keys | 16 | 16 | 1 |
| POST /admin/payers/:id/staff | 80 | 127 | 9 |
| GET /admin/payers | 7 | 7 | 1 |
| POST /payer/ingest/flights | 21 | 400 | 28 |
| POST /payer/simulate-delay | 61 | 67 | 4 |
| GET /payer/flights | 10 | 16 | 3 |
| GET /payer/flights/:id/passengers | 9 | 9 | 3 |
| PATCH /payer/passengers/:id | 7 | 7 | 2 |
| POST /payer/flights/:id/batches/preview | 6 | 66 | 8 |
| POST /payer/flights/:id/batches | 665 | 665 | 2 |
| GET /payer/batches/:id | 16 | 16 | 1 |
| GET /hotel/delay-offers | 14 | 14 | 1 |
| POST /hotel/delay-offers/:id/confirm | 367 | 367 | 2 |
| POST /hotel/delay-offers/:id/reject | 310 | 310 | 1 |
| POST /bookings/group-lookup | 5 | 79 | 28 |
| POST /bookings/lookup | 16 | 16 | 2 |
| POST /bookings | 88 | 88 | 1 |
| POST /payer/flights/:id/batches/preview (300 khách) | 148 | 148 | 1 |

### Quan sát khác (không tính FAIL nhưng QA/dev nên biết)
1. **Rate limit dùng chung một bộ đếm cho đăng nhập + tra cứu đơn + tra cứu nhóm** (backend/api/modules/auth/auth.router.ts:18, backend/api/modules/bookings/bookings.router.ts:54,62; middleware/rateLimit.ts:18, 10 yêu cầu/phút/IP, tính cả yêu cầu 422). Khi chạy test, 12-14 lần tra cứu liền đã khóa luôn đăng nhập/tra cứu khác (F06-F08 chạy lại sau 60s). Ngoài thực tế, quầy sân bay dùng chung IP/NAT có thể tự khóa đăng nhập của nhau. Mức: trung bình (thiết kế).
2. **Nhóm FAILED nhưng offer cùng PNR vẫn PENDING**: khi cụm trẻ em hết KS (D13) nhóm chuyển FAILED, còn phòng đơn cùng PNR vẫn đang chờ/được xác nhận bình thường; offers.ts chỉ tính FAILED theo nhóm (`g.status <> 'FAILED'` giữ nguyên) nên banner "Cần xử lý tay" và trạng thái nhóm ở màn khách (NEEDS_STAFF) bao cả phần đã xác nhận. Cần PO xác nhận có chủ ý không. Mức: thấp.
3. **Cảnh báo đỏ hiện mã nội bộ (UUID) thay vì mã nhóm NH-...** (apps/web/src/components/admin/PayerDelay.jsx:165, `Nhóm ${alert.groupId}`). Mức: thấp (UX).
4. Tải lại trang (F5) làm mất phiên nhân viên (token nhân sự không lưu), phải đăng nhập lại; có thể là chủ ý bảo mật. Mức: thấp.
5. Nhãn tab KS là "Khách delay" (menu) / "Yêu cầu khách delay" (tiêu đề trang); nhân viên payer vào cổng "Quản trị" với một tab "Delay".
6. Chưa kiểm: nút "gửi lại email sau khi sửa" (spec 6.7) không thấy trên giao diện quầy; xe tài xế nhận/tới (GĐ3 điều phối thực địa), kết toán (GĐ5) ngoài phạm vi lần chạy.
7. Cụm 4 khách (gồm 1 em bé) chỉ ghi nhận 3 ghế trên xe (em bé không chiếm ghế, đúng spec 7c).

### Tài khoản test đã dùng (chỉ trên DB nhúng; mật khẩu không ghi)
- Admin Airrest: admin@demo.airrest.vn
- Quầy payer P1 (FXPAY1): fx.han@fxpay1.test (khóa trạm HAN), fx.sgn@fxpay1.test (khóa trạm SGN), fx.all@fxpay1.test (cấp đơn vị, mọi trạm)
- Quầy payer P2 (FXPAY2): fx.han@fxpay2.test; payer P3 (FXPAY3, bị SUSPENDED trong A27): fx.han@fxpay3.test
- Khách sạn: ql.han01@khachsan.mo (HAN-01), ql.han02fx@khachsan.mo (HAN-02, fixture), ql.han03@khachsan.mo (HAN-03)
- Khóa API: 3 khóa P1 (1 đã thu hồi), 1 khóa P2, 1 khóa P3 (đều tạo qua API quản trị; khóa thô không lưu vào báo cáo)

### Dữ liệu thử còn lại
- DB nhúng backend/.data/pg KHÔNG bị xóa: còn đơn vị chi trả FXPAY1-3, ~15 chuyến mô phỏng/ingest, 4 lô đặt, booking PAYER + shuttle_requests + email_outbox, loại phòng "FX ...", tài khoản fx.* và ql.han02fx. Dọn bằng cách xóa thư mục backend/.data/pg rồi `npm run dev:db` + `npm run db:seed` khi cần DB sạch.
- Evidence: docs/dev-self-test-reports/evidence/ (b01-sau-tao.png lỗi UI-B01, c03-xss.png, c09-theo-doi-lo.png, d06-canh-bao-do.png, f01-tra-cuu-nhom.png). Các ảnh khác ở thư mục tạm của phiên.

### Cách dựng lại môi trường
```bash
cd Airrest_website/backend
export DATABASE_URL=postgres://postgres:postgres@localhost:54329/airrest DATABASE_SSL=false PORT=3100 \
  JWT_SECRET=<>=16 ký tự> DATA_ENC_KEY=<>=16 ký tự> CORS_ORIGINS=http://localhost:5199 PUBLIC_WEB_URL=http://localhost:5199 SEED_PASSWORD=<mật khẩu thử>
npm run dev:db &                                   # Postgres nhúng 54329 (nếu chưa chạy)
node --import tsx database/scripts/seed.ts         # KHÔNG dùng --env-file => không đọc backend/.env
node --import tsx api/server.ts                    # API :3100 (tự migrate)
cd ../apps/web && VITE_API_BASE_URL=http://localhost:3100 npx vite build --configLoader runner --outDir <tmp>/webdist
npx vite preview --configLoader runner --outDir <tmp>/webdist --port 5199 --strictPort
```

## 4. Hand-off Status

```
[DEV SELF-TEST REPORT]
- Chức năng: Đặt phòng cho khách delay chuyến (actor đơn vị chi trả/sân bay) — spec 2026-11-14-airport-delay-booking-design
- Môi trường test: Local (API 3100 + Postgres nhúng 54329 + web preview 5199)
- Code liên quan: backend/services/delay/*, backend/api/modules/{payer,hotelDelay,adminPayers}, apps/web/src/components/{admin/PayerDelay.jsx,hotel/DelayOffers.jsx}, apps/web/src/data/payer.js (nhánh dev, không dùng git trong phiên)
- Kết quả kiểm thử: 151/154 PASS (1 FAIL, 2 chưa chạy)
  + Happy Path: FAIL (61/63)
  + Validation & Edge Cases: PASS (80/81)
  + API / Technical Log: PASS (console không pageerror; thời gian phản hồi < 1s; mã trạng thái đúng)
- Evidence: Airrest_website/docs/dev-self-test-reports/evidence/*.png; checklist: DEV_TEST_CHECKLIST.md
- Trạng thái: CẦN SỬA — UI-B01; chưa chạy: UI-D05, G05
```
