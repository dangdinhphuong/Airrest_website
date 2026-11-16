# Dev Self-Test Report: Đưa đón, đội xe, tài xế (16/11/2026)

> Môi trường: API http://localhost:3144 nối Postgres nhúng riêng cổng 54344 (migrate 001-027 + seed + seedFleet + seedAccounts; mật khẩu ChangeMe123!), web build bằng vite build (VITE_API_BASE_URL=http://localhost:3144) chạy vite preview cổng 5244. KHÔNG dùng backend/.env, KHÔNG chạm Supabase hay DB 54329. SHUTTLE_SIM_AUTO=false. Rate limit 10/phút/IP được vượt bằng X-Forwarded-For giả (trust proxy=1); riêng case rate limit dùng IP cố định.
> Giờ chạy ~09:00-09:30 giờ VN (trước 22:00 nên không dính lỗi phụ thuộc giờ đã biết).
> Fixture phụ: room_types.total_rooms=500, giá hợp đồng VNA cho HAN-01/02/03, child_seats cho xe HAN-01 ở nhóm E; giữa các nhóm đóng chuyến còn hoạt động để xe rảnh.

## 1. Tổng quan

| Nhóm | Total | Pass | Fail | Bỏ qua |
|---|---|---|---|---|
| A. Đưa đón của khách, KS tiếp nhận/từ chối, tra cứu theo dõi | 53 | 52 | 1 | 0 |
| B. Điều phối: bảng điều phối, chọn xe, chuyến nhân sự, xe ngoài, hủy | 61 | 60 | 1 | 0 |
| C. Đội xe: xe và tài xế CRUD, tạo tài khoản tài xế | 72 | 72 | 0 | 0 |
| D. API tài xế: máy trạng thái, phân quyền, IDOR | 45 | 45 | 0 | 0 |
| E. Delay: xe nhà ưu tiên, trẻ em, hết xe | 23 | 22 | 1 | 0 |
| F. UI Playwright | 32 | 31 | 0 | 1 |
| G. Unit test và seed | 2 | 1 | 1 | 0 |
| **Tổng** | **288** | **283** | **4** | **1** |

| Loại | Total | Pass | Fail |
|---|---|---|---|
| HP | 80 | 77 | 3 |
| SEC | 70 | 70 | 0 |
| EDGE | 47 | 46 | 1 |
| VAL | 59 | 59 | 0 |
| UI | 32 | 31 | 0 |

(HP=happy path, VAL=validation, SEC=bảo mật, EDGE=biên/đồng thời, UI=giao diện)

## 2. Case FAIL

- **A47** Khách sạn HAN-02 (xe miễn phí SHUTTLE_FREE): giá xe = 0
  - Actual: price=70000
  - Nguyên nhân: createShuttleRequest/callShuttleNow dùng priceLeg() không xét hotelFeatures().shuttle==='free' (chỉ quoteHotelShuttle và createBooking xét). Yêu cầu xe bổ sung ở KS miễn phí xe lưu price_vnd=70000 (billed=false, không vào tổng đơn nên không thu tiền) nhưng hiển thị giá. Mức: Thấp.
- **B56** Nhân sự hủy chuyến + XSS ở lý do -> 200 CANCELLED, yêu cầu CANCELLED vì hết chuyến
  - Actual: HTTP 200 req=REQUESTED
  - Nguyên nhân: cancelTripByStaff (services/shuttle/trips.ts) chỉ gọi syncRequest, không đóng yêu cầu như afterTripClosed. Hủy chuyến duy nhất thì yêu cầu còn REQUESTED không còn chuyến; DUE_SQL loại vì đã có chuyến cũ, reassign không áp dụng cho chuyến CANCELLED: yêu cầu treo trên bảng điều phối. Mức: Trung bình (cần xác nhận hành vi mong muốn).
- **E24** Cùng gia đình nhưng xe KS có ghế trẻ em (child_seats=4): cả cụm đi MỘT xe nhà (OWN)
  - Actual: offers=2 trips=[{"seats":3,"kind":"OWN","status":"OFFERED"},{"seats":1,"kind":"OWN","status":"OFFERED"}] ev=["ONE_OWN_VEHICLE","ONE_OWN_VEHICLE"]
  - Nguyên nhân: createDelayShuttles tạo MỘT yêu cầu xe cho MỖI booking (offer). Gia đình 5 người chiếm 2 phòng = 2 offer nên bị chia 2 chuyến (3+1 khách) trên 2 xe, trái spec 6.6 "cụm có trẻ em không bao giờ bị tách" dù 1 xe 4 chỗ đủ. Mức: Trung bình.
- **G02** Seed tài khoản tài xế theo TAI_KHOAN_THU.md (taixe.han01.1/2, taixe.sgn01.1/2…) có nhận được chuyến không
  - Actual: Các tài khoản taixe.<ks>.N@airrest.vn (không gạch) KHÔNG gắn xe nào (plate=null); xe thật gắn với taixe.han-01.N (có gạch) do seedFleet. Điều phối tự động không bao giờ giao chuyến cho tài khoản trong TAI_KHOAN_THU.md cho tới khi gán xe thủ công
  - Nguyên nhân: seedAccounts.ts tạo taixe.han01.N (không gắn xe) còn seedFleet.ts tạo taixe.han-01.N (gắn xe). TAI_KHOAN_THU.md liệt kê loại không gạch nên đăng nhập được nhưng không bao giờ nhận chuyến. Mức: Thấp (dữ liệu thử). Đã gán thủ công qua API (C80).

## 3. Ghi nhận ngoài case

- Vị trí tài xế: KHÔNG có API để tài xế gửi vị trí (D24 -> 404); vị trí chỉ do server mô phỏng (position/route chuyến OWN).
- Xóa tài xế đã có lịch sử (C78) gỡ gán xe khỏi tài xế đó, xe còn lại không tài xế (đúng thiết kế, cần lưu ý).
- F38 (bản đồ) không tự động kiểm. Ảnh chụp: /tmp/claude-1001/-home-phuongdd-data-vietq/7ba8e494-d18e-483e-a4d9-b3414b0769d5/scratchpad/dd/shots (hoặc xem thư mục evidence nếu đã sao chép).
- Lỗi đỏ console ở F27/F52 chỉ là phản hồi 409/404 do thao tác sai có chủ ý.
- Test DB tích hợp của repo (RUN_DB_TESTS) KHÔNG chạy vì resetDatabaseForTest xóa schema.

## 4. Chi tiết từng case

| TC | Quy trình | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| A01 | Báo giá đưa đón trước khi đặt (công khai) | POST /hotels/{HAN-01}/shuttle-quote legs TO_AIRPORT | 200 offered=true, totalVnd>0 | HTTP 200 {"offered":true,"free":false,"legs":[{"direction":"TO_AIRPORT","airport":"HAN","distanceKm":8.6,"priceVnd":120000,"night":false}],"totalVnd":120000} | ✅ |
| A02 | Báo giá khách sạn không cung cấp xe (HAN-03 có SHUTTLE_PAID, dùng khách sạn khác id lạ -> 404) | POST shuttle-quote hotel uuid ngẫu nhiên | 404 HOTEL_NOT_FOUND | HTTP 404 HOTEL_NOT_FOUND | ✅ |
| A03 | Đặt phòng kèm đưa đón (HAN-01, khách sạn duyệt tay) -> đơn PENDING, yêu cầu xe REQUESTED chưa có chuyến | POST /bookings shuttle 1 leg pickup +25p | 201 booking PENDING, shuttles[0].status=REQUESTED, trips=[] | HTTP 201 PENDING REQUESTED trips=0 | ✅ |
| A04 | Nhân viên đưa đón (dondua, không có booking:decide) xác nhận đơn -> bị chặn | POST /hotel/bookings/{id}/confirm bằng dondua.han01 | 403 FORBIDDEN | HTTP 403 FORBIDDEN | ✅ |
| A05 | Quản lý phòng (phong.han01) xác nhận đơn -> bị chặn | confirm bằng phong.han01 | 403 | HTTP 403 FORBIDDEN | ✅ |
| A06 | Chủ khách sạn khác (HAN-02) xác nhận đơn của HAN-01 -> không thấy đơn (IDOR) | confirm bằng chu.han02 | 404 | HTTP 404 BOOKING_NOT_FOUND | ✅ |
| A07 | Lễ tân (letan.han01) xác nhận đơn -> CONFIRMED và hệ thống tự điều xe nhà (OFFERED) | confirm bằng letan.han01 | 200 CONFIRMED; trip OFFERED trên xe HAN-01 | HTTP 200 trips=[{"status":"OFFERED","kind":"OWN","vehicle_id":"9cadb254-87df-4223-9e3f-b8e37a0178c2"}] | ✅ |
| A08 | Xác nhận lại đơn đã CONFIRMED (double submit) -> không điều xe lần 2 | confirm lần 2 | 409 hoặc idempotent; vẫn chỉ 1 chuyến | HTTP 409 INVALID_STATE trips=1 | ✅ |
| A09 | Đơn từ chối: chủ KS từ chối đơn có kèm xe -> yêu cầu xe bị hủy | POST reject (reason) lên đơn PENDING mới kèm xe | 200 REJECTED; shuttle_request CANCELLED | HTTP 200 req=CANCELLED | ✅ |
| A10 | Dondua từ chối đơn -> bị chặn | reject bằng dondua | 403 | HTTP 403 FORBIDDEN | ✅ |
| A11 | Từ chối không có lý do / lý do quá ngắn -> 422 | reject body {} và {reason:"a"} | 422 | HTTP 422 VALIDATION_ERROR / HTTP 422 VALIDATION_ERROR | ✅ |
| A12 | Khách tra cứu theo dõi chuyến (mã + SĐT) -> guestToken + shuttles | POST /shuttle-requests/lookup | 200 guestToken, shuttles[0].trips[0] OWN | HTTP 200 stage=BOOKED trips=[{"id":"e12f892f-4a61-42dc-bbfd-e68ed83912c6","kind":"OWN","seats":2,"status":"SEARCHING"}] | ✅ |
| A13 | Theo dõi /track/shuttle bằng guestToken | GET /v1/track/shuttle Bearer guestToken | 200 stage + shuttles | HTTP 200 {"stage":"BOOKED","shuttles":[{"id":"b66d84ab-3d5a-4ee2-b8c4-87e85c944028","direction":"TO_AIRPORT","airport":"HAN","pickupAt":"2026-11-16T02:25:32.929Z","priceVnd":120000,"status":"REQUESTED","passengers":2,"cancelReason":null,"updatedAt":"2026-11-1 | ✅ |
| A14 | Khách xem thông tin tài xế: có biển số/tên nhưng KHÔNG lộ email/accountId tài xế | kiểm tra JSON track | không chứa email, accountId, password | bodyLen=642 hasEmail=false hasAccountId=false | ✅ |
| A15 | Track không token -> 401 | GET /track/shuttle không Authorization | 401 | HTTP 401 UNAUTHENTICATED | ✅ |
| A16 | Track token rác -> 401 | Bearer abc.def.ghi | 401 INVALID_TOKEN | HTTP 401 INVALID_TOKEN | ✅ |
| A17 | Track bằng token nhân sự -> 403 (chỉ token khách) | Bearer chu.han01 | 403 | HTTP 403 FORBIDDEN | ✅ |
| A18 | IDOR track: token khách đơn khác chỉ thấy chuyến của đơn mình, không thấy đơn A | lookup đơn b3 rồi GET track; so sánh bookingId | không chứa mã đơn b1 | HTTP 200 leak=false | ✅ |
| A19 | Lookup sai SĐT -> 404 không lộ đơn | lookup code đúng, phone sai | 404 BOOKING_NOT_FOUND | HTTP 404 BOOKING_NOT_FOUND | ✅ |
| A20 | Lookup mã định dạng sai -> 422 | code="XYZ" | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A21 | SQLi trong mã đơn: code="AR-1' OR '1'='1" | lookup | 422 (regex), không 500 | HTTP 422 VALIDATION_ERROR | ✅ |
| A22 | Rate limit tra cứu: >10 lần/phút/IP -> 429 | 12 lookup sai cùng IP | xuất hiện 429 | 429,429,429,429,429,429,429,429,429,429,429,429 | ✅ |
| A23 | Báo giá chuyến xe bổ sung (đơn đã CONFIRMED) | POST /shuttle-requests/quote TO_AIRPORT | 200 priceVnd, passengers=3 | HTTP 200 {"quote":{"priceVnd":70000,"distanceKm":3.8,"night":false,"configVersion":0,"passengers":3}} | ✅ |
| A24 | Tạo yêu cầu xe bổ sung -> 201, gần giờ đón nên điều xe ngay (có chuyến OFFERED) | POST /shuttle-requests | 201; trips>=1 | HTTP 201 trips=1 | ✅ |
| A25 | Cùng chiều khi đã có yêu cầu hoạt động -> 409 SHUTTLE_ALREADY_REQUESTED | POST lần 2 cùng direction | 409 | HTTP 409 SHUTTLE_ALREADY_REQUESTED | ✅ |
| A26 | Double submit cùng Idempotency-Key -> chỉ 1 yêu cầu (phản hồi trùng) | 2 POST song song, cùng key, chiều TO_HOTEL | 1 yêu cầu trong DB | HTTP 201 / HTTP 409 SHUTTLE_ALREADY_REQUESTED rows=1 | ✅ |
| A27 | Thiếu Idempotency-Key -> 4xx | POST không có header | 400/422 | HTTP 400 IDEMPOTENCY_KEY_REQUIRED | ✅ |
| A28 | Sân bay sai định dạng (HANOI) -> 422 | airport="HANOI" | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A29 | Sân bay khách sạn không phục vụ (SGN) -> 422 AIRPORT_NOT_SERVED | airport=SGN | 422 | HTTP 422 AIRPORT_NOT_SERVED | ✅ |
| A30 | Số khách đi xe vượt số khách của đơn -> 422 PASSENGERS_EXCEED_GUESTS | passengers=9 (đơn 3 khách) | 422 | HTTP 422 PASSENGERS_EXCEED_GUESTS | ✅ |
| A31 | passengers=0 / âm / thập phân -> 422 | passengers 0,-1,1.5 | 422 | 422,422,422 | ✅ |
| A32 | Giờ đón ở quá khứ -> 422 PICKUP_OUT_OF_STAY_WINDOW | pickupAt=now-1h | 422 | HTTP 422 PICKUP_OUT_OF_STAY_WINDOW | ✅ |
| A33 | Giờ đón ngoài cửa sổ lưu trú ±24h -> 422 | pickupAt=+10 ngày | 422 | HTTP 200 (quote không kiểm cửa sổ) | ✅ |
| A33b | Tạo yêu cầu với giờ đón ngoài cửa sổ lưu trú -> 422 | POST create pickupAt=+10 ngày | 422 PICKUP_OUT_OF_STAY_WINDOW | HTTP 422 PICKUP_OUT_OF_STAY_WINDOW | ✅ |
| A34 | pickupAt không phải ngày hợp lệ -> 422 | pickupAt="not-a-date" | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A35 | note > 300 ký tự -> 422 | note 301 ký tự | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A36 | Body rỗng -> 422 | {} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A37 | JSON hỏng -> 400 | body "{bad" | 400 | HTTP 400 INVALID_JSON | ✅ |
| A38 | XSS trong note/location: lưu nguyên văn dạng text, trả JSON (không thực thi) | note="<img src=x onerror=alert(1)>" | 201 hoặc 409; nếu 201 chuỗi được trả nguyên vẹn dạng text | HTTP 201 stored={"note":"<img src=x onerror=alert(1)>","location":"\"><script>alert(2)</script>"} | ✅ |
| A39 | SQLi trong note: note="'); DROP TABLE shuttle_requests;--" -> lưu như text, bảng còn nguyên | POST create | 201, bảng còn | HTTP 201 count=61 | ✅ |
| A40 | Mass assignment: gửi priceVnd/status/hotelId trong body tạo yêu cầu xe -> bị bỏ qua/không đổi giá | body thêm priceVnd:1,status:"DONE" | 201 với giá server tính (priceVnd khác 1, status không DONE) hoặc 422 | HTTP 201 row={"price_vnd":"70000","status":"REQUESTED","hotel_id":"1302ea47-1bd0-421e-be7b-145ede74cf6d"} | ✅ |
| A41 | Gọi xe ngay (call-now) cho đơn CONFIRMED | POST /shuttle-requests/call-now | 201 chiều TO_AIRPORT, pickup≈now+15p | HTTP 201 pickupInMin=15.0 | ✅ |
| A42 | Call-now cho đơn còn PENDING -> 409 BOOKING_NOT_ELIGIBLE | đơn PENDING (HAN-01) | 409 | HTTP 409 BOOKING_NOT_ELIGIBLE | ✅ |
| A43 | Call-now lần 2 khi đã có yêu cầu TO_AIRPORT hoạt động -> 409 | POST call-now lại | 409 SHUTTLE_ALREADY_REQUESTED | HTTP 409 SHUTTLE_ALREADY_REQUESTED | ✅ |
| A44 | Đặt phòng kèm xe: gửi trường lạ (passengers/price) -> 422 (strict) | shuttle.legs[0].passengers=2 | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A45 | Đặt phòng kèm xe: 2 leg cùng chiều -> 422 | legs [TO_AIRPORT,TO_AIRPORT] | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| A46 | Đặt phòng kèm xe 2 chiều (khứ hồi) -> 2 yêu cầu, tổng giá gồm xe | legs TO_HOTEL + TO_AIRPORT | 201 legCount=2, 2 shuttles | HTTP 201 n=2 | ✅ |
| A47 | Khách sạn HAN-02 (xe miễn phí SHUTTLE_FREE): giá xe = 0 | shuttle priceVnd | 0 | price=70000 | ❌ |
| A48 | Hủy xe với SĐT sai -> 404 | POST /shuttle-requests/{id}/cancel phone sai | 404 | HTTP 404 BOOKING_NOT_FOUND | ✅ |
| A49 | IDOR: dùng mã+SĐT của đơn khác để hủy yêu cầu xe của đơn bq | cancel id=sreq.id với credentials đơn khác | 404 SHUTTLE_NOT_FOUND | HTTP 404 SHUTTLE_NOT_FOUND | ✅ |
| A50 | Khách hủy xe đúng thông tin -> CANCELLED, chuyến CANCELLED, xe giải phóng | cancel | 200 status CANCELLED | HTTP 200 trips=[{"status":"CANCELLED"}] | ✅ |
| A51 | Hủy xe lần 2 -> 409 SHUTTLE_NOT_CANCELLABLE | cancel lại | 409 | HTTP 409 SHUTTLE_NOT_CANCELLABLE | ✅ |
| A52 | Hủy xe khi khách đã ONBOARD -> 409 TRIP_ALREADY_STARTED | đưa chuyến lên ONBOARD bằng DB rồi cancel | 409 | HTTP 409 TRIP_ALREADY_STARTED | ✅ |
| B01 | Bảng điều phối của dondua.han01: thấy yêu cầu mới + danh sách xe + trạng thái xe | GET /hotel/shuttle/board | 200; requests chứa yêu cầu vừa tạo; vehicles=2 có state | HTTP 200 vehicles=["29A-90000:FREE","29A-90001:BUSY"] found=true | ✅ |
| B02 | Board: cách ly khách sạn — mọi request trên board HAN-01 thuộc hotel HAN-01 | đối chiếu requests.id với DB hotel_id | 100% thuộc HAN-01 | n=1 hotels=1 | ✅ |
| B03 | Board không token -> 401; token khách -> 401/403 | GET board | 401/403 | HTTP 401 UNAUTHENTICATED / HTTP 403 FORBIDDEN | ✅ |
| B04 | Board: quản lý phòng (không shuttle:handle) -> 403 | phong.han01 | 403 | HTTP 403 FORBIDDEN | ✅ |
| B05 | Board: tài xế -> 403 | taixe.han-01.1 | 403 | HTTP 403 FORBIDDEN | ✅ |
| B06 | Board: status không hợp lệ / limit 0 / limit 101 -> 422 | status=FOO; limit=0; limit=101 | 422 cả ba | 422,422,422 | ✅ |
| B07 | Board SQLi qua query status=' OR 1=1 -> 422 | status=%27%20OR%201=1 | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| B08 | Board OPS (toàn hệ thống): 200, vehicles rỗng (không gắn KS) | GET board bằng ops1 | 200 | HTTP 200 reqs=40 veh=0 | ✅ |
| B09 | Board status=DONE lọc theo trạng thái | status=DONE | 200, mọi request status DONE | HTTP 200 n=0 | ✅ |
| B10 | Phân xe: 3 khách -> chọn xe nhỏ nhất đủ chỗ (4 chỗ) của chính KS | HAN-02 3 khách | 1 chuyến OWN trên xe 4 chỗ | 3/OWN/OFFERED \| 4 | ✅ |
| B11 | Phân xe: 5 khách -> xe 7 chỗ | HAN-02 5 khách | 1 chuyến xe 7 chỗ | 5/OWN/OFFERED \| 7 | ✅ |
| B12 | Phân xe: 10 khách -> xe 16 chỗ | HAN-02 10 khách | 1 chuyến xe 16 chỗ | 10/OWN/OFFERED \| 16 | ✅ |
| B13 | Phân xe: 20 khách -> nhiều xe (16 + 4), tổng ghế = 20 | HAN-02 20 khách | 2 chuyến OWN: 16 và 4 khách | 16/OWN/OFFERED,4/OWN/OFFERED \| 16,4 | ✅ |
| B14 | Hết xe nhà: HAN-01 chỉ 2 xe 4 chỗ, 12 khách -> 8 khách OWN + 4 NEEDS_EXTERNAL | HAN-01 12 khách (nhóm tối đa 3 phòng x4) | có chuyến NEEDS_EXTERNAL | OWN:OFFERED:4,OWN:OFFERED:4,EXTERNAL:NEEDS_EXTERNAL:4 | ✅ |
| B15 | Xe bận cùng khung giờ: yêu cầu thứ 3 trong cùng giờ trên KS có 2 xe -> NEEDS_EXTERNAL toàn bộ | 3 yêu cầu 4 khách cùng giờ HAN-01 | xe1,xe2 OWN, yêu cầu 3 NEEDS_EXTERNAL | OWN:OFFERED \| OWN:OFFERED \| EXTERNAL:NEEDS_EXTERNAL | ✅ |
| B16 | Chống trùng xe: 2 yêu cầu song song cùng giờ chỉ có 1 xe rảnh -> không xe nào bị gán 2 chuyến chồng giờ | HAN-02 xe 16: hai yêu cầu 10 khách gần như đồng thời | không có xe có >1 chuyến OFFERED trùng khung | [{"vehicle_id":"32eca012-ac02-46b0-9996-60acbebeefce","c":1},{"vehicle_id":"992063ba-888f-4d77-9b1a-76821845c086","c":1},{"vehicle_id":"ea0e8191-1793-4ce9-9363-00b22e78c153","c":1}] | ✅ |
| B20 | Chi tiết chuyến (nhân sự KS) | GET /hotel/shuttle-trips/{id} bằng dondua.han01 | 200 trip có vehicle + driver | HTTP 200 | ✅ |
| B21 | IDOR: nhân sự KS khác xem chuyến -> 404 | GET bằng dondua.han02 | 404 TRIP_NOT_FOUND | HTTP 404 TRIP_NOT_FOUND | ✅ |
| B22 | Tài xế gọi API nhân sự /hotel/shuttle-trips -> 403 | taixe GET | 403 | HTTP 403 FORBIDDEN | ✅ |
| B23 | trip id không phải uuid -> 422 | GET /hotel/shuttle-trips/abc | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| B24 | trip id uuid không tồn tại -> 404 | random uuid | 404 | HTTP 404 TRIP_NOT_FOUND | ✅ |
| B25 | Trip id dạng SQLi -> 422 | id="1 OR 1=1" | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| B26 | Đổi sang xe đang bận (xe còn lại đang chạy chuyến khác cùng giờ) -> 409 VEHICLE_UNAVAILABLE | tạo yêu cầu 2 chiếm xe còn lại rồi reassign | 409 | HTTP 409 VEHICLE_UNAVAILABLE | ✅ |
| B27 | Đổi xe: giải phóng xe còn lại rồi reassign -> trip OFFERED trên xe mới, tài xế mới | cancel yêu cầu 2 rồi reassign | 200; vehicle mới, status OFFERED | HTTP 200 veh=29A-90000 | ✅ |
| B28 | Reassign sang xe của KS khác -> 404 VEHICLE_NOT_FOUND | vehicleId HAN-02 | 404 | HTTP 404 VEHICLE_NOT_FOUND | ✅ |
| B29 | Reassign chuyến của KS khác (dondua.han02 thao tác trip HAN-01) -> 404 | POST reassign | 404 | HTTP 404 TRIP_NOT_FOUND | ✅ |
| B30 | Reassign thiếu/sai vehicleId -> 422 | body {} và vehicleId="x" | 422 | HTTP 422 VALIDATION_ERROR / HTTP 422 VALIDATION_ERROR | ✅ |
| B31 | Reassign sang xe quá nhỏ -> 422 VEHICLE_TOO_SMALL (HAN-02, 5 khách trên xe 7 -> xe 4 chỗ) | reassign xe 4 chỗ | 422 | HTTP 422 VEHICLE_TOO_SMALL | ✅ |
| B32 | Reassign sang xe ngừng hoạt động -> 409 | vehicle.active=false | 409 | HTTP 409 VEHICLE_UNAVAILABLE | ✅ |
| B33 | Reassign chuyến đã ONBOARD -> 409 INVALID_TRANSITION | set ONBOARD rồi reassign | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| B34 | Nhập xe ngoài lên chuyến xe nhà -> 409 NOT_EXTERNAL_TRIP | POST /external trên trip OWN | 409 | HTTP 409 NOT_EXTERNAL_TRIP | ✅ |
| B35 | Nhân sự bấm arrived/onboard/dropped-off thay tài xế trên xe nhà -> 409 NOT_EXTERNAL_TRIP | POST /arrived trên trip OWN | 409 | 409,409,409 | ✅ |
| B40 | KS không có xe (HAN-03): chuyến NEEDS_EXTERNAL + hiện ở alerts bảng điều phối | tạo yêu cầu 2 khách | trip NEEDS_EXTERNAL, alert có tripId | status=NEEDS_EXTERNAL alerts=1 | ✅ |
| B41 | Link xe ngoài http:// -> 422 EXTERNAL_LINK_NOT_ALLOWED | shareUrl=http://r.grab.com/x | 422 | HTTP 422 EXTERNAL_LINK_NOT_ALLOWED | ✅ |
| B42 | Link tên miền lạ evil.com -> 422 | https://evil.com/x | 422 | HTTP 422 EXTERNAL_LINK_NOT_ALLOWED | ✅ |
| B43 | Link giả mạo hậu tố evilgrab.com -> 422 | https://evilgrab.com/x | 422 | HTTP 422 EXTERNAL_LINK_NOT_ALLOWED | ✅ |
| B44 | Link javascript: / data: -> 422 | shareUrl=javascript:alert(1) | 422 | HTTP 422 EXTERNAL_LINK_NOT_ALLOWED / HTTP 422 EXTERNAL_LINK_NOT_ALLOWED | ✅ |
| B45 | Link có userinfo https://r.grab.com@evil.com/ -> 422 | phishing userinfo | 422 | HTTP 422 EXTERNAL_LINK_NOT_ALLOWED | ✅ |
| B46 | provider ngoài danh sách (UBER) -> 422 | provider=UBER | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| B47 | SĐT tài xế ngoài sai định dạng / tên 1 ký tự -> 422 | phone=123; driverName="A" | 422 | HTTP 422 VALIDATION_ERROR / HTTP 422 VALIDATION_ERROR | ✅ |
| B48 | Nhân sự KS khác nhập xe ngoài cho chuyến HAN-03 -> 404 | dondua.han01 POST external | 404 | HTTP 404 TRIP_NOT_FOUND | ✅ |
| B49 | Nhập xe ngoài hợp lệ (GRAB) + XSS ở tên tài xế -> 200 ACCEPTED, tên lưu nguyên text | POST external provider=GRAB, driverName=<script>… | 200 ACCEPTED external.provider=GRAB | HTTP 200 {"simulated":false,"provider":"GRAB","shareUrl":"https://r.grab.com/g/ABC123","driverName":"<script>alert(1)</script>","plate":"51H-123.45","phone":"+84912345678","reason":"NO_FREE_VEHICLE","etaAt":nu | ✅ |
| B50 | Sửa thông tin xe ngoài khi đã ACCEPTED (đổi provider XANHSM) -> 200 | POST external lần 2 | 200 provider=XANHSM | HTTP 200 | ✅ |
| B51 | Bước xe ngoài: arrived -> onboard -> dropped-off, yêu cầu chuyển DONE | 3 POST do nhân sự | 200 x3; request DONE | 200,200,200 req=DONE | ✅ |
| B52 | Bước lặp: dropped-off lần 2 -> 409 INVALID_TRANSITION | POST dropped-off lại | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| B53 | Nhập xe ngoài khi chuyến đã DROPPED_OFF -> 409 | POST external | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| B54 | Hủy chuyến note < 3 ký tự / thiếu -> 422 | note="ab"; body {} | 422 | HTTP 422 VALIDATION_ERROR / HTTP 422 VALIDATION_ERROR | ✅ |
| B55 | Hủy chuyến của KS khác -> 404 | dondua.han01 cancel trip HAN-03 | 404 | HTTP 404 TRIP_NOT_FOUND | ✅ |
| B56 | Nhân sự hủy chuyến + XSS ở lý do -> 200 CANCELLED, yêu cầu CANCELLED vì hết chuyến | cancel note=<b>x</b> thử | 200 | HTTP 200 req=REQUESTED | ❌ |
| B57 | Hủy lần 2 -> 409 | cancel again | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| B60 | Gán tay tài xế cho yêu cầu đã điều phối theo chuyến -> 409 USE_TRIP_FLOW | POST /hotel/shuttle-requests/{id}/assign | 409 | HTTP 409 USE_TRIP_FLOW | ✅ |
| B61 | Hoàn tất tay (complete) yêu cầu đã điều phối theo chuyến -> 409 | POST complete | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| B62 | Assign SĐT sai / tên 1 ký tự -> 422 | driverPhone=12 | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| B63 | Assign yêu cầu của KS khác -> 404 | dondua.han02 assign | 404 | HTTP 404 SHUTTLE_NOT_FOUND | ✅ |
| B64 | Danh sách /hotel/shuttle-requests chỉ của KS mình, phân trang cursor | GET ?limit=5 | 200, ≤5 items, mọi item thuộc HAN-01 | HTTP 200 n=5 next=80 | ✅ |
| B65 | Danh sách: status lạ / limit=0 -> 422 | status=XYZ | 422 | HTTP 422 VALIDATION_ERROR / HTTP 422 VALIDATION_ERROR | ✅ |
| B66 | Danh sách bằng tài xế/khách -> 403/401 | driver, guest | 403/401 | HTTP 403 FORBIDDEN / HTTP 401 UNAUTHENTICATED | ✅ |
| B67 | Nhân sự hủy yêu cầu xe (cancel) với note hợp lệ -> CANCELLED kèm hủy chuyến | POST /hotel/shuttle-requests/{id}/cancel | 200 CANCELLED | HTTP 200 [{"status":"CANCELLED"}] | ✅ |
| B68 | Hủy yêu cầu đã CANCELLED -> 409 | cancel again | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| B70 | Vòng quét điều phối: yêu cầu xa giờ (chưa điều) tự được điều trong ≤90s khi tới ngưỡng 30 phút | tạo yêu cầu +60p rồi dời pickup_at về +10p qua DB | trip OFFERED tự xuất hiện | trips trước=0 sau=1 | ✅ |
| B71 | Yêu cầu xa giờ (+60p) không bị điều sớm | trips=0 ngay sau tạo | trips=0 | HTTP 201 trips=0 | ✅ |
| C01 | Chủ KS HAN-01 xem danh sách xe: chỉ xe của KS mình | GET /hotel/vehicles | 200; mọi xe hotel_id=HAN-01 | HTTP 200 n=2 | ✅ |
| C02 | Chủ KS xem danh sách tài xế (email + xe), không lộ hash mật khẩu | GET /hotel/drivers | 200, không có password/hash | HTTP 200 n=9 | ✅ |
| C03 | Phân quyền xe: dondua/letan/phong/tài xế GET+POST /hotel/vehicles -> 403; không token -> 401; token khách -> 401/403 | 6 actor | 403x4, 401, 401/403 | 403,403,403,403,403,403,403,403 \| 401 \| 403 | ✅ |
| C04 | Phân quyền tài xế: GET/POST /hotel/drivers bởi dondua/letan/tài xế -> 403 | 3 actor | 403 | 403,403,403,403,403,403 | ✅ |
| C05 | Admin không gắn KS (sysadmin1, ops1) tạo/xem xe -> 403 (phải gắn khách sạn) | sysadmin POST/GET, ops GET (ops thiếu fleet:manage) | 403 | HTTP 403 FORBIDDEN / HTTP 403 FORBIDDEN / HTTP 403 FORBIDDEN | ✅ |
| C10 | Tạo xe không tài xế; biển số được chuẩn hóa (trim + hoa)  | POST {plate:" 30f-123.45 ",seats:7,model:"Xe test"} | 201 plate="30F-123.45", driver=null, active=true | HTTP 201 plate=30F-123.45 | ✅ |
| C11 | Trùng biển số trong cùng KS -> 409 PLATE_TAKEN (kể cả khác hoa/thường) | POST plate "30f-123.45" | 409 | HTTP 409 PLATE_TAKEN | ✅ |
| C12 | Cùng biển số ở KS khác được phép | chu2 POST 30F-123.45 | 201 | HTTP 201 | ✅ |
| C13 | Tạo xe: seats=0 | {"plate":"30F-200.01","seats":0} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C14 | Tạo xe: seats=51 | {"plate":"30F-200.02","seats":51} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C15 | Tạo xe: seats=1.5 | {"plate":"30F-200.03","seats":1.5} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C16 | Tạo xe: seats dạng chuỗi "4" | {"plate":"30F-200.04","seats":"4"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C17 | Tạo xe: plate rỗng | {"plate":"","seats":4} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C18 | Tạo xe: plate quá ngắn "A" | {"plate":"A","seats":4} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C19 | Tạo xe: plate chứa script | {"plate":"<script>1</script>","seats":4} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C20 | Tạo xe: plate SQLi | {"plate":"30F'; DROP TABLE vehicles;--","seats":4} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C21 | Tạo xe: model > 100 ký tự | {"plate":"30F-200.05","seats":4,"model":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C22 | Tạo xe: trường lạ hotelId (mass assignment) | {"plate":"30F-200.06","seats":4,"hotelId":"1302ea47-1bd0-421e-be7b-145ede74cf6d"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C23 | Tạo xe: body rỗng | {} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C24 | Tạo xe: thiếu seats | {"plate":"30F-200.07"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C25 | XSS ở model xe: lưu nguyên text (thoát ở lớp hiển thị) | model="<img src=x onerror=alert(1)>" | 201, model lưu nguyên | HTTP 201 | ✅ |
| C26 | Tạo xe gắn tài xế KS khác -> 404 DRIVER_NOT_FOUND | driverId=tài xế HAN-02 | 404 | HTTP 404 DRIVER_NOT_FOUND | ✅ |
| C27 | Tạo xe gắn tài xế đã có xe khác -> 409 DRIVER_ALREADY_ASSIGNED | driverId=tài xế đang giữ xe 29A-90000 | 409 | HTTP 409 DRIVER_ALREADY_ASSIGNED | ✅ |
| C28 | driverId không phải uuid -> 422 | driverId="abc" | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C29 | Double submit tạo xe cùng biển số (song song) -> đúng 1 xe | 2 POST đồng thời plate 30F-400.01 | 1x201 + 1x409; DB 1 dòng | 409,201 rows=1 | ✅ |
| C30 | Sửa xe: đổi seats + model | PATCH {seats:9,model:"Đã sửa"} | 200 | HTTP 200 | ✅ |
| C31 | Sửa xe: model=null xóa model | PATCH {model:null} | 200 model=null | HTTP 200 | ✅ |
| C32 | PATCH rỗng -> 422 | {} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C33 | PATCH trùng biển số với xe khác -> 409 | plate=29A-90000 | 409 | HTTP 409 PLATE_TAKEN | ✅ |
| C34 | PATCH xe của KS khác (IDOR) -> 404 | chu1 PATCH xe HAN-02 | 404 | HTTP 404 VEHICLE_NOT_FOUND seatsDB=4 | ✅ |
| C35 | DELETE xe của KS khác (IDOR) -> 404, xe còn nguyên | chu1 DELETE xe HAN-02 | 404 | HTTP 404 VEHICLE_NOT_FOUND rows=1 | ✅ |
| C36 | PATCH id không phải uuid -> 422; id uuid lạ -> 404 | /abc ; /random | 422;404 | HTTP 422 VALIDATION_ERROR / HTTP 404 VEHICLE_NOT_FOUND | ✅ |
| C37 | Mass assignment PATCH: hotelId -> 422 | PATCH {hotelId} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C38 | PATCH gắn tài xế KS khác -> 404 | driverId HAN-02 | 404 | HTTP 404 DRIVER_NOT_FOUND | ✅ |
| C40 | Tạo tài khoản tài xế + gán xe trống | POST /hotel/drivers {email,password(12+),fullName,phone,vehicleId} | 201, có vehicleId, không trả mật khẩu/hash | HTTP 201 email=tx.test.1794794655210@airrest.vn | ✅ |
| C41 | Tài xế mới đăng nhập được, danh sách chuyến rỗng | POST /auth/login + GET /driver/trips | 200; items=[] | HTTP 200 | ✅ |
| C42 | Email tài xế trùng (khác hoa/thường) -> 409 EMAIL_TAKEN | POST lại | 409 | HTTP 409 EMAIL_TAKEN | ✅ |
| C43 | Email trùng tài khoản KS khác (chu.han02@khachsan.mo) -> 409 | email nhân sự | 409 | HTTP 409 EMAIL_TAKEN | ✅ |
| C44 | Tạo tài xế: mật khẩu 11 ký tự | {"password":"Abcdefg1234"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C45 | Tạo tài xế: email sai định dạng | {"email":"khong-phai-email"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C46 | Tạo tài xế: phone sai (123) | {"phone":"123"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C47 | Tạo tài xế: fullName 1 ký tự | {"fullName":"A"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C48 | Tạo tài xế: photoKey sai định dạng | {"photoKey":"../../etc/passwd"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C49 | Tạo tài xế: trường lạ roleIds (leo thang vai trò) | {"roleIds":["x"]} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C50 | Tạo tài xế: trường lạ hotelId | {"hotelId":"1302ea47-1bd0-421e-be7b-145ede74cf6d"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C51 | Tạo tài xế: trường lạ isOwner/type | {"isOwner":true,"type":"HOTEL"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| C52 | Email chứa dấu nháy/SQLi (a'--@x.vn, hợp lệ theo RFC) -> không lỗi 500, không bị SQL injection, lưu nguyên text | email=a'--@x.vn | 201 hoặc 422; bảng accounts còn nguyên | HTTP 409 EMAIL_TAKEN accounts=120 | ✅ |
| C53 | Tạo tài xế: vehicleId xe KS khác | {"vehicleId":"__V2__"} | 404 | HTTP 404 VEHICLE_NOT_FOUND | ✅ |
| C54 | Tạo tài xế gán xe đã có tài xế -> 409 VEHICLE_HAS_DRIVER | vehicleId=29A-90000 | 409 | HTTP 409 VEHICLE_HAS_DRIVER | ✅ |
| C55 | XSS tên tài xế: lưu nguyên text | fullName="<script>alert(1)</script>" | 201 lưu nguyên | HTTP 201 | ✅ |
| C56 | Double submit tạo tài xế cùng email (song song) -> đúng 1 tài khoản | 2 POST đồng thời | 1 account | 201,409 rows=1 | ✅ |
| C60 | Sửa tên/SĐT tài xế | PATCH {fullName,phone} | 200 | HTTP 200 | ✅ |
| C61 | Đổi mật khẩu tài xế: mật khẩu cũ hết hiệu lực, mới đăng nhập được | PATCH {password} | login cũ 401, mới 200 | HTTP 200 old=401 new=200 | ✅ |
| C62 | Mật khẩu mới không xuất hiện trong response/audit | kiểm tra audit_log | không chứa mật khẩu | rows chứa mật khẩu=0 | ✅ |
| C63 | Sửa tài xế KS khác (IDOR) -> 404 | chu2 PATCH tài xế HAN-01 | 404 | HTTP 404 DRIVER_NOT_FOUND | ✅ |
| C64 | Đổi mật khẩu tài xế KS khác (chiếm tài khoản) -> 404 | chu2 PATCH password | 404 | HTTP 404 DRIVER_NOT_FOUND login=401 | ✅ |
| C65 | Xóa tài xế KS khác (IDOR) -> 404 | chu2 DELETE | 404 | HTTP 404 DRIVER_NOT_FOUND | ✅ |
| C66 | PATCH tài xế rỗng / id không phải uuid -> 422 | {} ; /xyz | 422 | HTTP 422 VALIDATION_ERROR / HTTP 422 VALIDATION_ERROR | ✅ |
| C67 | Khóa tài xế (active=false): đăng nhập bị từ chối, token cũ vô hiệu | PATCH {active:false} | login 401/403, token cũ 401/403 | HTTP 200 login=401 oldToken=401 | ✅ |
| C68 | Mở lại tài xế (active=true) -> đăng nhập lại được | PATCH {active:true} | login 200 | HTTP 200 login=200 | ✅ |
| C69 | Bỏ gán xe (vehicleId=null) rồi gán lại | PATCH {vehicleId:null} | 200 vehicleId=null | HTTP 200 / HTTP 200 | ✅ |
| C70 | Ngừng xe đang có chuyến chưa hoàn tất -> 409 VEHICLE_IN_USE | PATCH {active:false} xe bận | 409 | HTTP 409 VEHICLE_IN_USE | ✅ |
| C71 | Đổi tài xế của xe đang có chuyến -> 409 | PATCH {driverId:null} xe bận | 409 | HTTP 409 VEHICLE_IN_USE | ✅ |
| C72 | Giảm số chỗ xe xuống dưới số khách của chuyến đang chạy -> 409 | PATCH {seats:1} xe bận (2 khách) | 409 | HTTP 409 VEHICLE_IN_USE | ✅ |
| C73 | Khóa/đổi xe của tài xế đang có chuyến -> 409 DRIVER_IN_USE | PATCH {active:false} tài xế bận | 409 | HTTP 409 DRIVER_IN_USE | ✅ |
| C74 | Xóa xe/tài xế đang có chuyến -> 409 | DELETE xe bận & tài xế bận | 409,409 | HTTP 409 VEHICLE_IN_USE / HTTP 409 DRIVER_IN_USE | ✅ |
| C75 | Xóa xe đã từng chạy chuyến -> ngừng hoạt động (giữ lịch sử), không xóa hẳn | DELETE xe đã có trip | 200 deactivated=true | HTTP 200 {"deleted":false,"deactivated":true} | ✅ |
| C76 | Xóa xe chưa từng chạy -> xóa hẳn | DELETE xe 30F-123.45 (v1) sau khi bỏ gán tài xế | 200 deleted=true | HTTP 200 rows=0 | ✅ |
| C77 | Xóa tài xế chưa từng chạy -> xóa tài khoản, không đăng nhập được | DELETE d1 | 200 deleted | HTTP 200 login=401 | ✅ |
| C78 | Xóa tài xế đã từng chạy chuyến -> khóa tài khoản (deactivated), giữ lịch sử | DELETE tài xế có trip lịch sử | 200 deactivated=true | HTTP 200 {"deleted":false,"deactivated":true} | ✅ |
| C79 | Leo thang: tài xế (token tài xế) tạo tài xế/xe/sửa xe -> 403 | taixe POST/PATCH | 403 | HTTP 403 FORBIDDEN / HTTP 403 FORBIDDEN | ✅ |
| C80 | Gán tài khoản tài xế trong TAI_KHOAN_THU (taixe.han01.1/2) vào xe HAN-01 để nhận chuyến | PATCH xe 29A-90000/90001 driverId=taixe.han01.1/2 | 200 x2 | HTTP 200 / HTTP 200 | ✅ |
| D00 | Tài khoản tài xế taixe.han01.1 đăng nhập; /auth/me chỉ có quyền trip:drive và gắn đúng khách sạn | GET /auth/me | accountType=DRIVER, permissions=[trip:drive] | HTTP 200 {"auth":{"permissions":["trip:drive"],"sub":"74f841d3-0c47-42bd-94eb-dda9d51a6994","accountType":"DRIVER","kind":"ACCOUNT","iat":1794794740,"exp":1794798340,"hotelId":"3b20480b-a008-4325-a36f-a8fe08faeaf3"},"user":{"id":"74f841d3-0c47-42bd-94eb-dda9d | ✅ |
| D01 | Tài xế chỉ thấy chuyến được giao cho mình; tài xế khác cùng KS không thấy | GET /driver/trips bằng chủ chuyến và tài xế còn lại | chủ thấy trip, người kia không | HTTP 200 own=1 other=0 | ✅ |
| D02 | Chuyến của tài xế KHÔNG chứa đơn giá/tiền/thanh toán/email/hotelId/accountId | kiểm tra JSON | không có price/pricing/payment/email/amount/hotelId | keys=id,status,seats,bookingCode,vehicle,request,pickup,dropoff,guest,acceptedAt | ✅ |
| D03 | Chuyến hiển thị đủ thông tin đón khách: khách, SĐT, điểm đón/đến, biển số, giờ | kiểm tra trường | guest.fullName/phone, pickup, dropoff, vehicle.plate, request.pickupAt | {"pickup":"Sao Mai Airport Hotel","dropoff":"Sân bay HAN","plate":"29A-90001","status":"OFFERED"} | ✅ |
| D04 | Query /driver/trips: status lạ / limit=0 / limit=101 -> 422 | status=FOO,limit=0,limit=101 | 422 | 422,422,422 | ✅ |
| D05 | Lọc status=OFFERED trả đúng chuyến đang chờ nhận | ?status=OFFERED | chứa t1 | HTTP 200 | ✅ |
| D06 | Tài xế KHÔNG truy cập được API đơn/tiền/quản trị: bookings, board, stats, vehicles, admin, payer | 8 endpoint | 403 (hoặc 401/404) toàn bộ, không 200 | bookings:403 board:403 shuttle-requests:403 vehicles:403 drivers:403 summary:404 bookings:403 flights:403 room-types:403 delay-offers:403 change-requests:403 bookings:403 | ✅ |
| D07 | Tài xế gọi ghi (POST) vào đơn/xe/tài xế/xác nhận đơn -> 403 | POST confirm booking, create vehicle, reassign | 403 | HTTP 403 FORBIDDEN / HTTP 403 FORBIDDEN / HTTP 403 FORBIDDEN | ✅ |
| D08 | Token khách vãng lai / không token / khách có tài khoản dùng API tài xế -> 401/403 | GET /driver/trips | 401,401/403,403 | HTTP 401 UNAUTHENTICATED / HTTP 403 FORBIDDEN / HTTP 403 FORBIDDEN login=200 | ✅ |
| D09 | JWT bị sửa chữ ký / alg=none -> 401 | token đổi 1 ký tự chữ ký; alg none | 401 | HTTP 401 INVALID_TOKEN / HTTP 401 INVALID_TOKEN | ✅ |
| D10 | JWT chứa quyền giả (sửa payload thêm permissions) -> chữ ký sai 401; quyền luôn nạp từ DB | payload sửa accountType=HOTEL | 401 | HTTP 401 INVALID_TOKEN | ✅ |
| D11 | Máy trạng thái: bắt đầu đón (start) khi chưa nhận (OFFERED) -> 409 INVALID_TRANSITION | POST start | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| D12 | Nhảy bước: arrived/onboard/dropped-off từ OFFERED -> 409 | 3 POST | 409 x3 | 409,409,409 | ✅ |
| D13 | IDOR: tài xế khác CÙNG KS nhận chuyến của người khác -> 404, trạng thái không đổi | other accept t1 | 404; DB vẫn OFFERED | HTTP 404 TRIP_NOT_FOUND db=OFFERED | ✅ |
| D14 | IDOR: tài xế KS KHÁC (HAN-02) và SGN thao tác chuyến HAN-01 -> 404 | accept bằng taixe.han-02.1 và taixe.sgn01.1 | 404 x2 | HTTP 404 TRIP_NOT_FOUND / HTTP 404 TRIP_NOT_FOUND | ✅ |
| D15 | trip id sai: không phải uuid -> 422; uuid không tồn tại -> 404; SQLi -> 422 | accept /abc, /random, /1 OR 1=1 | 422,404,422 | HTTP 422 VALIDATION_ERROR / HTTP 404 TRIP_NOT_FOUND / HTTP 422 VALIDATION_ERROR | ✅ |
| D16 | Nhận chuyến (accept) -> ACCEPTED | POST accept | 200 trip.status=ACCEPTED | HTTP 200 | ✅ |
| D17 | Nhận chuyến lần 2 (double submit) -> 409 | POST accept lại | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| D18 | Từ chối chuyến đã nhận (ACCEPTED) -> 409 | POST reject | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| D19 | Báo khách không có mặt (no-show) khi chưa tới điểm đón (ACCEPTED) -> 409 | POST no-show | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| D20 | Bắt đầu đón (start) -> EN_ROUTE; khách thấy trạng thái cập nhật khi tra cứu | start rồi lookup khách | 200 EN_ROUTE; guest thấy trip status khác OFFERED | HTTP 200 guestTrip={"id":"8902a2e2-626e-41e7-82d8-c6aa50355c41","kind":"OWN","seats":3,"status":"EN_ROUTE","vehicle":{"plate":"29A-90001","seats":4,"model":"Xe mẫu 4 chỗ"},"driver":{"name":"Tài xế HAN-01 2","phone":"+84907100017","photoUrl":null},"route":{"ride":[[21.160756,105.859261],[21.160758,105.859247],[21.160798,105.858958],[21.161201,105.859028],[21.16162,105.859137],[21.161653,105.859114],[21.161789,105.858582],[21.161843,105.858391],[21.161978,105.85791],[21.162144,105.85733],[21.16230 | ✅ |
| D21 | Lùi trạng thái: accept sau start -> 409 | POST accept | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| D22 | Nhảy bước: onboard từ EN_ROUTE (chưa arrived) -> 409 | POST onboard | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| D23 | Vị trí: chuyến EN_ROUTE có route + position (mô phỏng server) trong /driver/trips | GET /driver/trips | item có position (lat,lng) khi sim bật | position={"lat":21.16099,"lng":105.8593,"heading":0,"speedKmh":0,"etaSec":0,"phase":"APPROACH"} route=có | ✅ |
| D24 | Không có API để tài xế tự gửi vị trí (POST /driver/trips/:id/location) -> 404; vị trí chỉ do server mô phỏng | POST location | 404 (không có endpoint ghi vị trí) | HTTP 404 NOT_FOUND (ghi nhận: vị trí tài xế thật chưa có API, chỉ mô phỏng) | ✅ |
| D25 | Khách theo dõi: /track/shuttle chứa position khi EN_ROUTE | GET track (guest token) | position hoặc route hiện diện | {"id":"8902a2e2-626e-41e7-82d8-c6aa50355c41","kind":"OWN","seats":3,"status":"EN_ROUTE","vehicle":{"plate":"29A-90001","seats":4,"model":"Xe mẫu 4 chỗ"},"driver":{"name":"Tài xế HAN-01 2","phone":"+84907100017","photoUrl":null},"route":{"ride":[[21.1 | ✅ |
| D26 | Đã tới điểm đón (arrived) -> ARRIVED | POST arrived | 200 ARRIVED | HTTP 200 | ✅ |
| D27 | Khách lên xe (onboard) -> ONBOARD | POST onboard | 200 ONBOARD | HTTP 200 | ✅ |
| D28 | No-show khi đã ONBOARD -> 409 | POST no-show | 409 | HTTP 409 INVALID_TRANSITION | ✅ |
| D29 | Trả khách (dropped-off) -> DROPPED_OFF, yêu cầu DONE, chuyến biến khỏi danh sách đang chạy | POST dropped-off | 200; request DONE; không còn trong list mặc định | HTTP 200 req=DONE | ✅ |
| D30 | Thao tác lại sau khi hoàn tất (dropped-off/start/no-show) -> 409 | 3 POST | 409 x3 | 409,409,409 | ✅ |
| D31 | Lịch sử: lọc status=DROPPED_OFF thấy chuyến vừa hoàn tất | ?status=DROPPED_OFF | có t1 | HTTP 200 | ✅ |
| D32 | Nhật ký đơn ghi đủ sự kiện chuyến (TRIP_OFFERED→…→DROPPED_OFF, SHUTTLE_DONE), actor DRIVER | đọc booking_events | có TRIP_ACCEPTED, TRIP_EN_ROUTE, TRIP_ARRIVED, TRIP_ONBOARD, TRIP_DROPPED_OFF, SHUTTLE_DONE | SHUTTLE_REQUESTED,TRIP_OFFERED,TRIP_ACCEPTED,TRIP_EN_ROUTE,TRIP_ARRIVED,TRIP_ONBOARD,TRIP_DROPPED_OFF,SHUTTLE_DONE | ✅ |
| D33 | Double submit song song: 2 request accept cùng lúc -> đúng 1 thành công (200) + 1 xung đột (409) | Promise.all 2 POST accept | [200,409] | 200,409 | ✅ |
| D34 | Từ chối với lý do > 300 ký tự -> 422 | reason 301 | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| D35 | Từ chối chuyến (+XSS trong lý do) -> REJECTED, tự điều lại sang xe/tài xế còn lại của KS | reject reason=<script>alert(1)</script> | 200 REJECTED; chuyến mới OFFERED cho tài xế kia | HTTP 200 ["REJECTED:OWN","OFFERED:OWN"] | ✅ |
| D36 | Người đã từ chối không còn thấy/không thao tác được chuyến đó (404 hoặc 409) | owner accept t1 sau reject | 409 INVALID_TRANSITION | HTTP 409 INVALID_TRANSITION | ✅ |
| D37 | Tài xế còn lại thấy chuyến được điều lại | GET /driver/trips bằng người kia | có chuyến OFFERED của request | HTTP 200 n=1 | ✅ |
| D38 | Cả hai xe nhà đều từ chối -> chuyển NEEDS_EXTERNAL (xe ngoài) để khách sạn xử lý | người kia reject | trip NEEDS_EXTERNAL | HTTP 200 ["REJECTED","REJECTED","NEEDS_EXTERNAL"] | ✅ |
| D39 | No-show: tài xế khác (cùng KS) báo no-show chuyến không phải của mình -> 404 | other no-show | 404 | HTTP 404 TRIP_NOT_FOUND | ✅ |
| D40 | No-show hợp lệ (ARRIVED) -> chuyến CANCELLED(no_show), yêu cầu CANCELLED, phí không đổi | POST no-show | 200 ok; cancel_note=no_show | HTTP 200 {"status":"CANCELLED","cancel_note":"no_show"} req=CANCELLED | ✅ |
| D41 | KS hủy chuyến: tài xế nhận/ bắt đầu chuyến đã hủy -> 409; chuyến biến mất khỏi danh sách | accept sau khi bị hủy | 409; không còn trong list | HTTP 409 INVALID_TRANSITION | ✅ |
| D42 | Tài xế SGN-01 (taixe.sgn01.1, gán xe qua API chủ KS): nhận chuyến thuộc SGN-01 và chỉ thấy chuyến SGN-01 | tạo yêu cầu tại SGN-01 → accept | 200 ACCEPTED, list chỉ SGN-01 | mine=true HTTP 200 n=1 | ✅ |
| D43 | Brute-force đăng nhập tài xế: >10 lần/phút cùng IP -> 429 | 12 login sai cùng IP | xuất hiện 429 | 429,429,429,429,429,429,429,429,429,429,429,429 | ✅ |
| D44 | Đăng nhập sai không phân biệt email tồn tại / không tồn tại (không dò được tài khoản) | login email có/không có | cùng mã lỗi + thông điệp | HTTP 401 INVALID_CREDENTIALS / HTTP 401 INVALID_CREDENTIALS | ✅ |
| E01 | Đơn vị chi trả tạo chuyến delay mô phỏng (có hành khách) | POST /payer/simulate-delay (nv1.vna.han) | 201 flight DELAYED, passengers.created>0 | HTTP 201 pax=30 | ✅ |
| E02 | Đặt phòng lô (khách lẻ): offer PENDING gửi KS HAN-01 (KS duy nhất có giá hợp đồng) | POST /payer/flights/{id}/batches | 201; offers[0] ở HAN-01 PENDING | HTTP 201 offers=["HAN-01:PENDING"] | ✅ |
| E03 | NV đưa đón (frontdesk, không booking:decide) xác nhận offer -> 403 | dondua.han01 confirm | 403 | HTTP 403 FORBIDDEN | ✅ |
| E04 | KS khác (HAN-02) xác nhận offer của HAN-01 -> 404 (IDOR) | letan.han02 confirm | 404 | HTTP 404 OFFER_NOT_FOUND | ✅ |
| E05 | Xác nhận sai số phòng (2 số phòng cho 1 phòng) -> 422 ROOM_NUMBERS_MISMATCH; mảng rỗng -> 422 | roomNumbers ["1","2"] và [] | 422 | HTTP 422 ROOM_NUMBERS_MISMATCH / HTTP 422 VALIDATION_ERROR | ✅ |
| E06 | Trường lạ trong body xác nhận (strict) -> 422 | body {roomNumbers:["1"],status:"CONFIRMED"} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| E07 | KS xác nhận offer (số phòng chứa ký tự HTML lưu nguyên) -> 200; tạo 2 chuyến xe đón/về | confirm roomNumbers ["<b>1</b>"] | 200; 2 shuttle_requests (TO_HOTEL,TO_AIRPORT) billed=false | HTTP 200 ["TO_AIRPORT:OFFERED:OWN:1:29A-90001","TO_HOTEL:OFFERED:OWN:1:29A-90001"] | ✅ |
| E08 | Xe đón khách delay lấy xe/tài xế của CHÍNH khách sạn (chuyến OWN, OFFERED) | trips của TO_HOTEL | OFFERED:OWN trên xe HAN-01 | OFFERED:OWN:1:29A-90001 | ✅ |
| E09 | Chiều về sân bay (stay.to) cũng được điều xe nhà ngay | trips của TO_AIRPORT | OFFERED:OWN | OFFERED:OWN:1:29A-90001 | ✅ |
| E10 | Giá xe delay không tính vào khách (billed=false, pricing.shuttleVnd=0, paid=0) | đọc booking.pricing | shuttleVnd=0 | {"params":{"configVersions":{"serviceFee":0}},"roomVnd":700000,"totalVnd":700000,"shuttleVnd":0,"discountVnd":0,"serviceFeeVnd":0} | ✅ |
| E11 | Tài xế được giao thấy chuyến delay (ghi chú "Delay NH-…"), không thấy giá | GET /driver/trips | có trip; note chứa Delay; không có price | HTTP 200 note=Delay NH-QA516786 - liên hệ: Lê Quốc Bảo +84939759163; đại d | ✅ |
| E12 | Tài xế KS khác không thấy/không thao tác chuyến delay của HAN-01 (IDOR) | taixe.han-02.1 accept | 404; list không chứa | HTTP 404 TRIP_NOT_FOUND | ✅ |
| E13 | Xác nhận lần 2 (double submit) -> 409 INVALID_STATE; không tạo thêm yêu cầu xe | confirm lại | 409; vẫn 2 yêu cầu | HTTP 409 INVALID_STATE n=2 | ✅ |
| E14 | Tài xế đi hết chuyến delay (accept→…→dropped-off); yêu cầu delay DONE | 5 bước | 200 x5; request TO_HOTEL DONE | 200,200,200,200,200 req=DONE | ✅ |
| E15 | Payer staff không truy cập API đội xe/điều phối/tài xế -> 403 | payer GET board, vehicles, driver trips | 403 | 403,403,403,403 | ✅ |
| E16 | KS từ chối offer -> không tạo yêu cầu xe cho đơn bị từ chối (offer chuyển KS khác hoặc FAILED) | POST reject reason | 200; không có shuttle_requests cho booking cũ | HTTP 200 shuttles=0 | ✅ |
| E17 | Từ chối không có lý do -> 422 | reject {} | 422 | HTTP 422 VALIDATION_ERROR | ✅ |
| E20 | Hết xe nhà: 3 khách lẻ cùng giờ đón, KS có 2 xe -> 2 chuyến OWN + 1 NEEDS_EXTERNAL (ưu tiên xe nhà trước) | đặt 3 khách lẻ HAN-01, xác nhận từng offer | xe nhà gán trước; còn lại NEEDS_EXTERNAL | OFFERED:OWN:1:29A-90001 \| OFFERED:OWN:1:29A-90000 \| NEEDS_EXTERNAL:EXTERNAL:1: | ✅ |
| E21 | Chọn xe nhỏ nhất đủ chỗ ở HAN-02 (4/7/16 chỗ): khách lẻ -> xe 4 chỗ | 1 khách lẻ HAN-02 | trip trên xe 4 chỗ | ["TO_AIRPORT:OFFERED:OWN:1:29A-90002","TO_HOTEL:OFFERED:OWN:1:29A-90002"] | ✅ |
| E22 | Nhóm 5 người lớn cùng PNR ở HAN-02 -> xe 7 chỗ (1 xe, cả nhóm cùng xe) | nhóm đồng nghiệp 5 người | chuyến 5 khách trên xe 7 chỗ | offers=5 trips=[{"seats":1,"vs":7,"kind":"OWN","status":"OFFERED","passengers":1},{"seats":1,"vs":null,"kind":"EXTERNAL","status":"NEEDS_EXTERNAL","passengers":1},{"seats":1,"vs":4,"kind":"OWN","status":"OFFERED","passengers":1},{"seats":1,"vs":16,"kind":"OWN","status":"OFFERED","passengers":1},{"seats":1,"vs":null,"kind":"EXTERNAL","status":"NEEDS_EXTERNAL","passengers":1}] | ✅ |
| E23 | Gia đình có trẻ em, xe KS chưa có ghế trẻ em (child_seats=0): không tách cụm, chuyển NEEDS_EXTERNAL nguyên cụm | family 2NL+2TE+1EB, child_seats=0 | 1 chuyến NEEDS_EXTERNAL nguyên cụm + sự kiện DELAY_CHILD_CLUSTER | offers=2 trips=[{"seats":1,"kind":"OWN","status":"OFFERED"},{"seats":4,"kind":"EXTERNAL","status":"NEEDS_EXTERNAL"}] ev=["EXTERNAL_WHOLE_CLUSTER","EXTERNAL_WHOLE_CLUSTER"] | ✅ |
| E24 | Cùng gia đình nhưng xe KS có ghế trẻ em (child_seats=4): cả cụm đi MỘT xe nhà (OWN) | child_seats=4 | 1 chuyến OWN OFFERED + DELAY_CHILD_CLUSTER mode ONE_OWN_VEHICLE | offers=2 trips=[{"seats":3,"kind":"OWN","status":"OFFERED"},{"seats":1,"kind":"OWN","status":"OFFERED"}] ev=["ONE_OWN_VEHICLE","ONE_OWN_VEHICLE"] | ❌ |
| E25 | KS không có đội xe (HAN-03): xe đón delay -> NEEDS_EXTERNAL để KS nhập xe ngoài | khách lẻ HAN-03 | trip NEEDS_EXTERNAL | ["TO_AIRPORT:NEEDS_EXTERNAL:EXTERNAL:1:","TO_HOTEL:NEEDS_EXTERNAL:EXTERNAL:1:"] | ✅ |
| F01 | Nhân viên đưa đón (dondua.han01) đăng nhập: menu có Điều phối xe, KHÔNG có Đội xe/Chuyến của tôi/Khách delay | đăng nhập UI | tab-shuttle có; tab-fleet, tab-trips, tab-delayOffers không có | tabs=tab-overview,tab-bookings,tab-rooms,tab-inventory,tab-shuttle | ✅ |
| F02 | Tab Điều phối xe: bảng điều phối hiển thị yêu cầu mới (mã đơn + chuyến + xe + tài xế) và danh sách xe KS | mở tab-shuttle | board-row chứa mã đơn; veh-item=2 | rows=1 veh=2 found=true | ✅ |
| F03 | Bảng điều phối chỉ hiển thị đơn của KS mình (không lộ mã đơn của HAN-02/HAN-03) | tìm mã đơn q2/q3 trên trang | không có | leak2=false leak3=false | ✅ |
| F04 | Mở form Đổi xe trên chuyến OFFERED: ô chọn xe (Select tùy biến) hiển thị, không crash | bấm Gán lại xe | reassign-select hiển thị, mở danh sách có ≥1 xe | role=option count=2 | ✅ |
| F05 | Dondua không vào được tab Đội xe bằng cách sửa URL/state (gọi API trực tiếp bằng token vẫn 403) | đọc token từ localStorage rồi GET /hotel/vehicles | 403 | HTTP 403 FORBIDDEN | ✅ |
| F06 | Dondua: console không có lỗi đỏ / pageerror / HTTP 5xx | kiểm tra log phiên | 0 pageerror, 0 HTTP 5xx | errors=0 pageerrors=0 http=[] dialogs=0 | ✅ |
| F10 | XSS: ghi chú/điểm đón chứa <img onerror> của khách hiển thị dạng chữ trên bảng điều phối, không thực thi | mở tab-shuttle HAN-02 | không có dialog, window.__xss không đặt, không có thẻ img[src=x] | flag=false imgs=0 dialogs=0 | ✅ |
| F11 | KS không có xe (HAN-03): khu vực "Cần gọi xe ngoài" + form nhập xe ngoài; XSS tên tài xế ngoài hiển thị dạng chữ | mở tab-shuttle HAN-03 | ext-alerts hiện; không thực thi XSS | flag=false imgs=0 | ✅ |
| F12 | Nhập xe ngoài link http://evil.com trên UI -> báo lỗi, chuyến vẫn NEEDS_EXTERNAL | bấm Nhập xe ngoài đã đặt, điền link xấu, lưu | có thông báo lỗi; trip NEEDS_EXTERNAL | status=NEEDS_EXTERNAL msg=Liên kết chia sẻ chuyến (https) | ✅ |
| F13 | HAN-03: console không có pageerror; HTTP 4xx chỉ do thao tác sai chủ ý | kiểm tra log | 0 pageerror | pageerrors=0 http=[] | ✅ |
| F20 | Chủ KS có tab Đội xe + Điều phối xe; tab Đội xe liệt kê xe của KS (≥2) với tài xế | mở tab-fleet | tab-fleet có; vh-row ≥2 | tabs=tab-overview,tab-bookings,tab-rooms,tab-profile,tab-inventory,tab-delayOffers,tab-changes,tab-shuttle,tab-fleet vh-row=2 | ✅ |
| F21 | Thêm xe qua UI: biển số hợp lệ, model chứa XSS -> xe hiện trong danh sách, model hiển thị dạng chữ | vh-new, plate 31F-111.11, seats 4, model <img onerror> | row mới; không XSS | db=1 flag=false imgs=0 | ✅ |
| F22 | Thêm xe trùng biển số trên UI -> thông báo "Biển số đã có", không thêm bản sao | vh-new plate 31F-111.11 lần 2 | thông báo lỗi; DB vẫn 1 | db=1 msg= | ✅ |
| F23 | Form xe: số chỗ 0 bị chặn ở trình duyệt (min=1), không gửi request | seats=0, bấm Tạo xe | không có POST /hotel/vehicles mới | before=0 after=0 | ✅ |
| F24 | Form xe: biển số quá ngắn (<4 ký tự) bị chặn ở trình duyệt | plate="ab" | không tạo xe | rows=0 | ✅ |
| F25 | Tab Tài xế: thêm tài xế mật khẩu < 12 ký tự -> không tạo tài khoản | dr-new, pw 8 ký tự | DB 0 tài khoản; có lỗi | rows=0 | ✅ |
| F26 | Thêm tài xế hợp lệ qua UI -> tạo được và đăng nhập được | dr-pw 15 ký tự | 1 tài khoản; login 200 | rows=1 login=200 | ✅ |
| F27 | Đội xe: console không có pageerror, không có alert/dialog bất ngờ | kiểm tra log | 0 pageerror | pageerrors=0 dialogs=0 errors=["Failed to load resource: the server responded with a status of 409 (Conflict)"] http=["409 POST /v1/hotel/vehicles"] | ✅ |
| F30 | Tài xế đăng nhập: menu chỉ có "Chuyến của tôi" (không Đơn/Đội xe/Điều phối) | đăng nhập UI taixe.han01.2@airrest.vn | chỉ tab-trips | tabs=tab-trips | ✅ |
| F31 | Danh sách chuyến của tôi: thấy đúng chuyến mới (mã đơn), thẻ chuyến có Nhận/Từ chối | trip-card | có thẻ q1 với nút Nhận chuyến | cards=1 accept=1 | ✅ |
| F32 | Màn tài xế không hiển thị tiền/giá/đơn giá | tìm ₫, VND, "giá", "thanh toán" trên trang | không có | match=none | ✅ |
| F33 | Tài xế nhận chuyến trên UI (trip-accept) -> trạng thái ACCEPTED | bấm Nhận chuyến | DB ACCEPTED | db=ACCEPTED | ✅ |
| F34 | Tài xế bấm trip-start (có bước xác nhận Đồng ý) -> EN_ROUTE | ConfirmButton | DB EN_ROUTE | db=EN_ROUTE | ✅ |
| F35 | Tài xế bấm trip-arrived (có bước xác nhận Đồng ý) -> ARRIVED | ConfirmButton | DB ARRIVED | db=ARRIVED | ✅ |
| F36 | Tài xế bấm trip-onboard (có bước xác nhận Đồng ý) -> ONBOARD | ConfirmButton | DB ONBOARD | db=ONBOARD | ✅ |
| F37 | Tài xế bấm trip-dropped-off (có bước xác nhận Đồng ý) -> DROPPED_OFF | ConfirmButton | DB DROPPED_OFF | db=DROPPED_OFF | ✅ |
| F38 | Bản đồ/vị trí xe: khi EN_ROUTE hiển thị nút xem bản đồ hoặc ETA (mô phỏng) | đã chụp ở F34 | (ghi nhận) | bỏ qua kiểm tra tự động; xem ảnh F34/F35 (OSRM công cộng có thể không truy cập được trong sandbox) | ⏭ |
| F39 | Tài xế: console không có pageerror / lỗi đỏ | kiểm tra log | 0 pageerror | pageerrors=0 errors=[] http=[] | ✅ |
| F40 | Tài xế sửa URL sang tab quản lý: ép state tab "fleet"/"shuttle" -> vẫn chỉ thấy chuyến của tôi (menu theo quyền) | goto #/hotel và kiểm tra menu | không có tab-fleet | tabs=tab-trips | ✅ |
| F50 | Khách tra cứu theo dõi chuyến trên web: nhập mã + SĐT -> thấy trạng thái xe | /tra-cuu?code=… + SĐT | hiển thị mã đơn và khu vực xe | có mã=true | ✅ |
| F51 | Khách tra cứu sai SĐT -> thông báo lỗi chung, không lộ đơn | mã đúng, SĐT sai | alert lỗi, không có tên khách | alert=Không tìm thấy đơn với thông tin đã nhập | ✅ |
| F52 | Trang khách: console không có pageerror | kiểm tra log | 0 pageerror | pageerrors=0 errors=["Failed to load resource: the server responded with a status of 404 (Not Found)"] | ✅ |
| G01 | Unit test thuần (không DB): fleet.unit, shuttle.unit, delay-vehicles, shuttle.sim.unit, shuttle.sim.external.unit | npx vitest run 5 file (không RUN_DB_TESTS) | tất cả pass | 5 file, 39/39 test pass | ✅ |
| G02 | Seed tài khoản tài xế theo TAI_KHOAN_THU.md (taixe.han01.1/2, taixe.sgn01.1/2…) có nhận được chuyến không | kiểm tra DB sau db:seed + seedFleet + seedAccounts | tài xế trong tài liệu gắn với xe và nhận chuyến | Các tài khoản taixe.<ks>.N@airrest.vn (không gạch) KHÔNG gắn xe nào (plate=null); xe thật gắn với taixe.han-01.N (có gạch) do seedFleet. Điều phối tự động không bao giờ giao chuyến cho tài khoản trong TAI_KHOAN_THU.md cho tới khi gán xe thủ công | ❌ |
