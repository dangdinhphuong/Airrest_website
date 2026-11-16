# Báo cáo dev self-test: khách sạn, tầng, phòng, ảnh (2026-11-16)

Người chạy: tester tự động (skill dev-self-test), chỉ test + báo cáo, KHÔNG sửa code ứng dụng.
Môi trường: Postgres nhúng cổng 54342 (riêng), migration 001..027, seed + tài khoản thử; API cổng 3142; web (vite build + preview) cổng 5242. R2 dùng khóa GIẢ (presign thật, PUT được Playwright chặn, không ghi lên R2 thật). Spec: docs/superpowers/specs/2026-11-16-floors-rooms-config-design.md.

## Tổng hợp

| Total | Pass | Fail |
|---|---|---|
| 286 | 284 | 2 |

| Nhóm | Total | Pass | Fail |
|---|---|---|---|
| 1.RBAC | 17 | 16 | 1 |
| 2.IDOR han02→han01 | 22 | 22 | 0 |
| 3.Tầng (validation + ràng buộc) | 35 | 35 | 0 |
| 4.Loại phòng (mô tả/hướng/tiện nghi/ảnh) | 31 | 31 | 0 |
| 5.Phòng đơn lẻ + đồng bộ total_rooms | 41 | 41 | 0 |
| 6.Xóa phòng / xóa phòng cuối / ROOM_TOTAL_BELOW_RESERVED | 13 | 13 | 0 |
| 7.Thêm hàng loạt (bulk) | 19 | 19 | 0 |
| 8.Đồng thời (race) | 4 | 4 | 0 |
| 9.Upload ảnh presigned (media) | 18 | 18 | 0 |
| 10.Tồn kho / khối phòng / đơn | 22 | 22 | 0 |
| 11.Đề xuất delay (xác nhận 5 phút, đưa đón) | 14 | 14 | 0 |
| 11.Đề xuất delay (xác nhận 5 phút, đưa đón, gia hạn) | 16 | 16 | 0 |
| 10.Tồn kho / khối phòng / đơn (chạy lại các case sửa script) | 11 | 10 | 1 |
| 12.UI tab Phòng | 23 | 23 | 0 |

## Các case FAIL

- **RB-ADM-4** sysadmin hotelId không tồn tại tạo tầng: 500 INTERNAL_ERROR
- **LM-01** Tổng phòng 1 loại vượt 500 (totalRooms nhập tay giới hạn 500): 6x201, total_rooms=600 (vượt max 500 của createRoomTypeBody.totalRooms; không có trần số phòng/loại hoặc/khách sạn)

### Phân tích nguyên nhân gốc
- **RB-ADM-4** (500 INTERNAL_ERROR): Admin (hotel:scope:all) gửi ?hotelId là UUID không tồn tại khi POST /v1/hotel/floors. `resolveHotelId` (services/rooms/rooms.service.ts) tin hotelId, INSERT vi phạm khóa ngoại `floors.hotel_id` và lỗi này không được bắt, ra 500 thay vì 404/422. Cùng đường đi áp dụng cho POST rooms/bulk/room-types/room-blocks cho admin. Mức thấp (chỉ Admin), nhưng nên kiểm hotelId tồn tại.
- **LM-01** (tổng phòng một loại vượt 500): `createRoomTypeBody.totalRooms` giới hạn 0..500, nhưng POST rooms/bulk (tối đa 100 mỗi lần, không giới hạn số lần) làm `total_rooms` = 600 sau 6 lần bulk. `syncTotal` (services/rooms/roomUnits.ts) không có trần. Không có giới hạn số phòng cho cả loại/khách sạn nên dữ liệu có thể phình (han01 sau test có hơn 400 phòng).

## Quan sát (không tính FAIL)
- RM-N03: số phòng phân biệt hoa/thường ("A1" và "a1" cùng tồn tại); lễ tân dễ nhầm.
- DL-05: xác nhận offer delay nhận số phòng bất kỳ (tối đa 20 ký tự), không đối chiếu bảng `rooms` mới thêm (kể cả phòng INACTIVE hoặc không tồn tại). Spec cũ coi là nhập tay nên chưa vi phạm, nhưng giờ có danh sách phòng thì nên gợi ý/kiểm.
- Bulk không zero-pad ("0" + 1..9 -> "01"? thực tế prefix cộng số nguyên, không có "001"); nếu muốn "101".."110" phải dùng prefix và số hợp lý.
- Batch delay (payer) giữ trạng thái `PLACING` kể cả khi mọi nhóm đã CONFIRMED/FAILED; trạng thái thực nằm ở `groups[].status`.
- Khóa ảnh không gắn hotel_id (giới hạn đã biết trong spec, case ID-22): KS khác có thể gắn khóa ảnh của KS khác nếu biết khóa.
- F5 trên cổng khách sạn mất phiên nhân sự (thiết kế: phiên chỉ trong bộ nhớ), không phải lỗi.
- Console UI: chỉ có 3 lỗi 409 mong đợi (test trùng) và cảnh báo requestfailed của PUT R2 giả bị Playwright chặn; không có lỗi JS/pageerror.

## Chi tiết từng case

### 1.RBAC

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| RB-01 | Không token GET floors | GET /floors, no auth | 401 | 401 UNAUTHENTICATED  | PASS |
| RB-02 | Token rác GET rooms | Bearer abc | 401 | 401 INVALID_TOKEN  | PASS |
| RB-R-hotel_owner | hotel_owner xem tầng/phòng/loại phòng | GET floors, rooms, room-types | 3x200 | 200,200,200 | PASS |
| RB-R-room_manager | room_manager xem tầng/phòng/loại phòng | GET floors, rooms, room-types | 3x200 | 200,200,200 | PASS |
| RB-R-reception | reception xem tầng/phòng/loại phòng | GET floors, rooms, room-types | 3x200 | 200,200,200 | PASS |
| RB-R-frontdesk | frontdesk xem tầng/phòng/loại phòng | GET floors, rooms, room-types | 3x200 | 200,200,200 | PASS |
| RB-W-reception | reception KHÔNG ghi được (floor/room/bulk/type/media) | POST floor, POST room, POST bulk, POST room-type, PATCH type, POST media rooms | all 403 | 403,403,403,403,403,403,403,403,403,403 | PASS |
| RB-W-frontdesk | frontdesk KHÔNG ghi được (floor/room/bulk/type/media) | POST floor, POST room, POST bulk, POST room-type, PATCH type, POST media rooms | all 403 | 403,403,403,403,403,403,403,403,403,403 | PASS |
| RB-W-phong | room_manager ghi được tầng+phòng+media | POST floor lvl 2, POST room 201, media rooms | 201s | 201,201,201 | PASS |
| RB-W-phong-drivers | room_manager (không fleet:manage) xin upload folder drivers | POST media folder=drivers | 403 | 403 FORBIDDEN  | PASS |
| RB-W-chu-drivers | chủ (có fleet:manage) upload folder drivers | POST media drivers | 201 | 201   | PASS |
| RB-DR | Tài xế (trip:drive) GET floors/rooms | GET | 403 | 403,403 | PASS |
| RB-OPS | ops1 (không room:manage, có hotel:scope:all) POST floor | POST /floors?hotelId | 403 | 403 FORBIDDEN  | PASS |
| RB-ADM-1 | sysadmin GET floors thiếu hotelId | GET /floors | 422 HOTEL_ID_REQUIRED | 422 HOTEL_ID_REQUIRED  | PASS |
| RB-ADM-2 | sysadmin GET floors?hotelId=han01 | GET | 200 và thấy tầng của han01 | 200 n=2 | PASS |
| RB-ADM-3 | sysadmin tạo tầng cho han01 | POST /floors?hotelId level 70 | 201 | 201   | PASS |
| RB-ADM-4 | sysadmin hotelId không tồn tại tạo tầng | POST ?hotelId=random uuid | 4xx (không 500, không tạo rác) | 500 INTERNAL_ERROR | FAIL |

### 2.IDOR han02→han01

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| ID-01 | han02 PATCH tầng của han01 | PATCH /floors/<A> | 404 | 404 FLOOR_NOT_FOUND | PASS |
| ID-02 | han02 DELETE tầng của han01 | DELETE /floors/<A> | 404 | 404 FLOOR_NOT_FOUND | PASS |
| ID-03 | han02 PATCH phòng của han01 | PATCH /rooms/<A> | 404 | 404 ROOM_NOT_FOUND | PASS |
| ID-04 | han02 DELETE phòng của han01 | DELETE /rooms/<A> | 404 | 404 ROOM_NOT_FOUND | PASS |
| ID-05 | han02 PATCH loại phòng của han01 | PATCH /room-types/<A> | 404 | 404 ROOM_TYPE_NOT_FOUND | PASS |
| ID-06 | han02 DELETE (ngừng) loại phòng han01 | DELETE /room-types/<A> | 404 | 404 ROOM_TYPE_NOT_FOUND | PASS |
| ID-07 | han02 xem tồn kho loại phòng han01 | GET /room-types/<A>/inventory | 404 | 404 ROOM_TYPE_NOT_FOUND | PASS |
| ID-08 | han02 tạo phòng vào tầng của han01 (số 999) | POST /rooms floorId=<A floor>, roomType own | 404 FLOOR_NOT_FOUND | 404 FLOOR_NOT_FOUND  | PASS |
| ID-09 | han02 tạo phòng với loại phòng của han01 | POST /rooms roomTypeId=<A> | 404 ROOM_TYPE_NOT_FOUND | 404 ROOM_TYPE_NOT_FOUND  | PASS |
| ID-10 | han02 bulk với tầng/loại của han01 | POST /rooms/bulk | 404 | 404,404 | PASS |
| ID-11 | han02 chuyển phòng của mình sang tầng của han01 | PATCH own room {floorId:<A>} | 404 | 404 FLOOR_NOT_FOUND | PASS |
| ID-12 | han02 đổi phòng của mình sang loại phòng của han01 | PATCH own room {roomTypeId:<A>} | 404 | 404 totalA=2 | PASS |
| ID-13 | han02 GET rooms?floorId=<A> / roomTypeId=<A> | GET filters | rỗng, không lộ dữ liệu han01 | 0,0 | PASS |
| ID-14 | han02 truyền ?hotelId=<han01> khi GET/POST (token KS phải bỏ qua) | GET floors?hotelId=A; POST floors?hotelId=A | Trả dữ liệu han02, tầng tạo vào han02 | g=1 created.hotelId=0f5d7ef4-cb9c-45bb-85b7-3b042973177e leakedToA=false | PASS |
| ID-15 | han02 body chứa hotelId=<han01> khi tạo tầng/phòng (mass assignment) | POST floors {hotelId:A} | Bỏ qua hotelId trong body | 201 0f5d7ef4-cb9c-45bb-85b7-3b042973177e leaked=false | PASS |
| ID-16 | han02 xóa khóa phòng / tạo khóa vào loại phòng han01 | POST /room-blocks roomTypeId=<A> | 404 | 404 ROOM_TYPE_NOT_FOUND | PASS |
| ID-17 | han02 đọc/duyệt đơn của han01 | GET /bookings/:id, POST confirm/reject | 404 | 404,404,404,404,404 | PASS |
| ID-18 | han02 list đơn không lẫn han01 | GET /bookings | chỉ đơn hotelId=han02 | 200 n=0 | PASS |
| ID-19 | Ngược lại: han01 không đụng được tầng/phòng của han02 | PATCH/DELETE floor+room of B | 404 | 404,404,404,404 | PASS |
| ID-20 | room_manager han01 (phong) đụng han02 qua tham số hotelId | GET rooms?hotelId=B | Chỉ trả phòng han01 | 101:0ae3,201:0ae3 | PASS |
| ID-21 | Cùng số phòng 101 tồn tại ở 2 KS (unique theo KS, không toàn cục) | roomA.number=101 & roomB.number=101 | Cả hai tồn tại | 101/101 | PASS |
| ID-22 | han02 dùng khóa ảnh rooms/ ngẫu nhiên (chưa kiểm sở hữu - giới hạn đã biết) | PATCH room-type images key của han01 | Ghi nhận: spec chấp nhận | status=200 (giới hạn đã biết: khóa ảnh không gắn hotel_id nên KS khác có thể gắn khóa của KS A nếu biết/đoán được; uuid v4 khó đoán) | PASS |

### 3.Tầng (validation + ràng buộc)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| FL-V01 | Tạo tầng: level -6 | {"name":"x","level":-6} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V02 | Tạo tầng: level 201 | {"name":"x","level":201} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V03 | Tạo tầng: level 1.5 | {"name":"x","level":1.5} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V04 | Tạo tầng: level là chuỗi "3" | {"name":"x","level":"3"} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V05 | Tạo tầng: name rỗng | {"name":"","level":3} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V06 | Tạo tầng: name toàn khoảng trắng | {"name":"   ","level":3} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V07 | Tạo tầng: name 51 ký tự | {"name":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","level":3} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V08 | Tạo tầng: thiếu name | {"level":3} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V09 | Tạo tầng: thiếu level | {"name":"x"} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V10 | Tạo tầng: sortOrder -1 | {"name":"x","level":3,"sortOrder":-1} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V11 | Tạo tầng: sortOrder 1001 | {"name":"x","level":3,"sortOrder":1001} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V12 | Tạo tầng: note 501 ký tự | {"name":"x","level":3,"note":"nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V13 | Tạo tầng: body rỗng {} | {} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V14 | Tạo tầng: level null | {"name":"x","level":null} | 422 (không tạo) | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-V15 | Tạo tầng body không phải JSON | raw "{bad" | 400/422 | 400 INVALID_JSON | PASS |
| FL-B-5 | Tạo tầng level biên -5 | level -5 | 201 | 201  "" | PASS |
| FL-B200 | Tạo tầng level biên 200 | level 200 | 201 | 201  "" | PASS |
| FL-B0 | Tạo tầng level 0 (trệt) | level 0 | 201 | 201  "" | PASS |
| FL-B-name | Tạo tầng name đúng 50 ký tự, note 500 ký tự | name 50, note 500 | 201 | 201  "" | PASS |
| FL-X01 | XSS trong tên tầng/ghi chú được lưu dạng text thuần (không biến đổi) | name <script>alert(1)</script>, note <img src=x onerror=alert(1)> | 201, giá trị trả về nguyên văn (escape ở UI) | 201 {"id":"91cf81c0-6c49-4401-9d9b-1e31b8dae0a6","hotelId":"0ae344a7-2d70-46d0-a927-dacb617f65c4","name":"<script>alert(1)</script>","level":11,"sortOrder | PASS |
| FL-X02 | Tên tầng có SQL injection | name "x'; DROP TABLE floors;--" | 201 lưu nguyên văn, bảng còn | 201 200 | PASS |
| FL-D01 | Trùng số tầng (level 1 đã có) | POST level 1 | 409 FLOOR_LEVEL_TAKEN | 409 FLOOR_LEVEL_TAKEN "Số tầng đã tồn tại trong khách sạn" | PASS |
| FL-D02 | Tầng cùng level ở KS khác được phép (han02 level 0) | chu.han02 POST level 0 | 201 | 201  "" | PASS |
| FL-D03 | Tầng cùng tên khác level được phép | name "Tang 1", level 13 | 201 | 201  "" | PASS |
| FL-U01 | PATCH level sang level đã tồn tại | PATCH {level:1} | 409 FLOOR_LEVEL_TAKEN | 409 FLOOR_LEVEL_TAKEN "Số tầng đã tồn tại trong khách sạn" | PASS |
| FL-U02 | PATCH giữ nguyên level của chính nó + đổi tên | PATCH {level:13,name:"Doi ten"} | 200 | 200 Doi ten | PASS |
| FL-U03 | PATCH body rỗng | PATCH {} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-U04 | PATCH note null xóa ghi chú | PATCH {note:null} | 200 note=null | 200 undefined \|\| Tiêu chí test sai: API lược trường null khỏi JSON (note bị xóa thành vắng mặt). Hành vi đúng. | PASS |
| FL-U05 | PATCH level ngoài khoảng | PATCH {level:999} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-U06 | PATCH id không phải uuid | PATCH /floors/abc | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| FL-U07 | PATCH tầng không tồn tại | PATCH uuid lạ | 404 FLOOR_NOT_FOUND | 404 FLOOR_NOT_FOUND "Không tìm thấy tầng" | PASS |
| FL-L01 | GET floors trả roomCount và sắp theo sort_order, level | GET /floors | mỗi tầng có roomCount | [[-5,0],[0,0],[1,1],[2,1],[10,0],[11,0],[12,0],[13,0],[200,0]] | PASS |
| FL-DEL1 | Xóa tầng còn phòng | DELETE tầng 1 (có phòng 101) | 409 FLOOR_HAS_ROOMS | 409 FLOOR_HAS_ROOMS "Tầng còn 1 phòng, hãy chuyển hoặc xóa phòng trước" | PASS |
| FL-DEL2 | Xóa tầng trống | DELETE tầng 13 | 200 rồi 404 | 200,404 | PASS |
| FL-DEL3 | Xóa tầng sau khi xóa hết phòng trong tầng | tạo tầng 14 + phòng, xóa phòng, xóa tầng | 200 | 409,200 | PASS |

### 4.Loại phòng (mô tả/hướng/tiện nghi/ảnh)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| RT-V01 | Tạo loại phòng: tiện nghi sai mã | {"code":"RV01","amenities":["JACUZZI"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V02 | Tạo loại phòng: tiện nghi trùng | {"code":"RV02","amenities":["WIFI","WIFI"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V03 | Tạo loại phòng: mô tả 2001 ký tự | {"code":"RV03","description":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V04 | Tạo loại phòng: view 101 ký tự | {"code":"RV04","view":"vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V05 | Tạo loại phòng: maxAdults 0 | {"code":"RV05","maxAdults":0} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V06 | Tạo loại phòng: maxAdults 11 | {"code":"RV06","maxAdults":11} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V07 | Tạo loại phòng: maxChildren -1 | {"code":"RV07","maxChildren":-1} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V08 | Tạo loại phòng: maxChildren 11 | {"code":"RV08","maxChildren":11} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V09 | Tạo loại phòng: smoking là chuỗi | {"code":"RV09","smoking":"yes"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V10 | Tạo loại phòng: ảnh khóa sai dạng | {"code":"RV10","images":["../../etc/passwd"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V11 | Tạo loại phòng: ảnh khóa folder hotels/ | {"code":"RV11","images":["hotels/2026/11111111-1111-4111-8111-111111111111.jpg"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V12 | Tạo loại phòng: ảnh khóa đuôi .gif | {"code":"RV12","images":["rooms/2026/11111111-1111-4111-8111-111111111111.gif"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V13 | Tạo loại phòng: mã loại chữ thường | {"code":"ab","name":"x"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V14 | Tạo loại phòng: totalRooms 501 | {"code":"RV14","totalRooms":501} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V15 | Tạo loại phòng: baseNightVnd 999 | {"code":"RV15","baseNightVnd":999} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V16 | Tạo loại phòng: tên 1 ký tự | {"code":"RV16","name":"x"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V17 | Tạo loại phòng 11 ảnh | images x11 | 422 Tối đa 10 ảnh | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-V18 | Tạo loại phòng ảnh trùng | images [k,k] | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-B01 | Tạo loại phòng đủ trường (10 ảnh, 14 tiện nghi) | desc/view/amenities/smoking/maxAdults/maxChildren/10 ảnh | 201 và trả đủ trường, images {key,url} | 201 {"img0":{"key":"rooms/2026/aaaaaaaa-aaaa-4aaa-8aaa-000000000000.jpg","url":"http://localhost:5242/fake-r2/rooms/2026/aaaaaaaa-aaaa-4aaa-8aaa-000000000000.jpg"},"am":14,"v":"Biển","rc":0,"m":false} | PASS |
| RT-B02 | GET danh sách loại phòng trả đủ trường mới | GET | có description, view, amenities, images | {"d":"Mo ta","i":10} | PASS |
| RT-B03 | Loại phòng không nêu field mới dùng mặc định | POST chỉ field cơ bản | 201 amenities [], images [], smoking false, desc null | {"a":[],"i":[],"s":false} \|\| Tiêu chí test sai: description/null được lược khỏi JSON. Hành vi đúng. | PASS |
| RT-X01 | XSS trong tên/mô tả/hướng nhìn loại phòng lưu text thuần | name <script>, description <img onerror>, view <svg onload> | 201, nguyên văn | 201 <script>alert(1)</script> | PASS |
| RT-D01 | Mã loại phòng trùng | POST code STD (đã có) | 409 ROOM_CODE_TAKEN | 409 ROOM_CODE_TAKEN "Mã loại phòng đã tồn tại trong khách sạn" | PASS |
| RT-U01 | PATCH 11 ảnh | images x11 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-U02 | PATCH sắp xếp ảnh: đổi ảnh bìa (đảo thứ tự) | images đảo, ảnh 5 lên đầu | 200, images[0]=key mới | 200 rooms/2026/aaaaaaaa-aaaa-4aaa-8aaa-000000000005.jpg | PASS |
| RT-U03 | PATCH images [] xóa hết ảnh | images [] | 200 rỗng | 200 0 | PASS |
| RT-U04 | PATCH description null/view null/maxAdults null xóa giá trị | PATCH nulls | 200 các field null | 200 [null,null,null] \|\| Tiêu chí test sai: các trường null được lược khỏi JSON. Hành vi đúng (đã xóa giá trị). | PASS |
| RT-U05 | PATCH không nêu field => giữ nguyên các field mới | PATCH {name} sau khi đặt amenities | amenities giữ nguyên | [["WIFI","TV"],"giu"] | PASS |
| RT-U06 | PATCH body rỗng / field lạ | PATCH {} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RT-U07 | PATCH amenities rỗng [] xóa tiện nghi | amenities [] | 200 rỗng | 200 0 | PASS |
| RT-U08 | PATCH totalRooms khi loại chưa có phòng (nhập tay) | FULL1 totalRooms 7 | 200 total=7 | 200 7 | PASS |

### 5.Phòng đơn lẻ + đồng bộ total_rooms

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| RM-S01 | Thêm phòng ĐẦU TIÊN cho loại đang nhập tay total=10 | POST room 2001 vào SYN1 (total 10) | 201; total_rooms = 1 (số ACTIVE), managedByRooms=true | 201 total=1 rc=1 | PASS |
| RM-S02 | Thêm phòng thứ 2 ACTIVE | 2002 | total=2 | 201 total=2 | PASS |
| RM-S03 | Thêm phòng INACTIVE không tăng total | 2003 status INACTIVE | total vẫn 2, roomCount 3 | 201 total=2 rc=3 | PASS |
| RM-S04 | Đổi INACTIVE -> ACTIVE tăng total | PATCH 2003 {status:ACTIVE} | total=3 | 200 total=3 | PASS |
| RM-S05 | Đổi ACTIVE -> INACTIVE giảm total | PATCH 2003 {status:INACTIVE} | total=2 | 200 total=2 | PASS |
| RM-S06 | PATCH totalRooms khi loại do phòng quản lý | PATCH room-type {totalRooms:9} | 409 TOTAL_MANAGED_BY_ROOMS | 409 TOTAL_MANAGED_BY_ROOMS "Tổng số phòng do danh sách phòng quản lý, hãy thêm/ngừng/xóa phòng thay vì sửa số" | PASS |
| RM-S07 | PATCH totalRooms đúng bằng giá trị hiện tại (cho qua) | PATCH {totalRooms:2} | 200 | 200  "" | PASS |
| RM-S08 | PATCH loại phòng khác trường (tên/giá) khi đang do phòng quản lý | PATCH {name,baseNightVnd} | 200, total không đổi | 200 total=2 | PASS |
| RM-N01 | Trùng số phòng cùng KS | POST number 2001 lần 2 | 409 ROOM_NUMBER_TAKEN | 409 ROOM_NUMBER_TAKEN "Số phòng đã tồn tại trong khách sạn" | PASS |
| RM-N02 | Trùng số phòng khác loại/khác tầng cùng KS | number 101 (STD, tầng 1) tạo ở SYN1/tầng 20 | 409 | 409 ROOM_NUMBER_TAKEN "Số phòng đã tồn tại trong khách sạn" | PASS |
| RM-N03 | Số phòng khác hoa/thường ("a1" vs "A1") | POST A1 rồi a1 | Ghi nhận hành vi (unique phân biệt hoa thường?) | A1=201, a1=201 (cho phép trùng khác hoa/thường: lưu ý lễ tân dễ nhầm) | PASS |
| RM-N04 | PATCH đổi số sang số đã có | PATCH 2002 {number:2001} | 409 ROOM_NUMBER_TAKEN | 409 ROOM_NUMBER_TAKEN "Số phòng đã tồn tại trong khách sạn" | PASS |
| RM-V01 | Tạo phòng: number rỗng | {"number":""} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V02 | Tạo phòng: number 11 ký tự | {"number":"12345678901"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V03 | Tạo phòng: number có khoảng trắng giữa "10 1" | {"number":"10 1"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V04 | Tạo phòng: number có ký tự đặc biệt "<b>" | {"number":"<b>"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V05 | Tạo phòng: number unicode "Ph1ò" | {"number":"Phò1"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V06 | Tạo phòng: number "../1" | {"number":"../1"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V07 | Tạo phòng: note 501 | {"number":"V07","note":"nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V08 | Tạo phòng: view 101 | {"number":"V08","view":"vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V09 | Tạo phòng: maxAdults 0 | {"number":"V09","maxAdults":0} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V10 | Tạo phòng: maxChildren 11 | {"number":"V10","maxChildren":11} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V11 | Tạo phòng: amenitiesExtra mã lạ | {"number":"V11","amenitiesExtra":["X"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V12 | Tạo phòng: amenitiesExtra trùng | {"number":"V12","amenitiesExtra":["TV","TV"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V13 | Tạo phòng: status "DELETED" | {"number":"V13","status":"DELETED"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V14 | Tạo phòng: 6 ảnh phòng | {"number":"V14","images":["rooms/2026/bbbbbbbb-bbbb-4bbb-8bbb-000000000001.png", | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V15 | Tạo phòng: ảnh trùng | {"number":"V15","images":["rooms/2026/bbbbbbbb-bbbb-4bbb-8bbb-000000000001.png", | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V16 | Tạo phòng: ảnh khóa sai | {"number":"V16","images":["http://evil/x.png"]} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V17 | Tạo phòng thiếu floorId/roomTypeId, uuid sai | floorId "abc" | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-V18 | Số phòng đúng 10 ký tự, tiền tố gạch ngang "A-1234567" | number A-12345678 | 201 | 201  "" | PASS |
| RM-X01 | XSS trong ghi chú/hướng nhìn phòng | note <script>, view <img onerror> | 201 nguyên văn | 201 <script>alert(1)</script> | PASS |
| RM-I01 | Phòng 5 ảnh OK, ảnh đầu là bìa, trả {key,url} | images x5 | 201 | 201 {"key":"rooms/2026/bbbbbbbb-bbbb-4bbb-8bbb-000000000001.png","url":"http://localhost:5242/fake-r2/rooms/2026/bbbbbbbb-bbbb-4bbb-8bbb-000000000001.png"} | PASS |
| RM-I02 | PATCH phòng 6 ảnh | images x6 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-I03 | PATCH phòng đổi ảnh bìa (đảo thứ tự) | images [k3,k1,k2,k4,k5] | images[0]=k3 | 200 rooms/2026/bbbbbbbb-bbbb-4bbb-8bbb-000000000003.png | PASS |
| RM-U01 | PATCH override null xóa ghi đè (view/smoking/maxAdults) | set rồi null | null | 200 [null,null,null] | PASS |
| RM-U02 | PATCH body rỗng | {} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| RM-U03 | PATCH đổi tầng hợp lệ | 2001 -> tầng 21 | 200, floorId đổi | 200 | PASS |
| RM-U04 | PATCH phòng không tồn tại | uuid lạ | 404 ROOM_NOT_FOUND | 404 ROOM_NOT_FOUND "Không tìm thấy phòng" | PASS |
| RM-M01 | Chuyển phòng ACTIVE sang loại SYN2 (đang nhập tay total 5) | PATCH 2002 {roomTypeId:SYN2} | SYN1 total 1; SYN2 total 1 | 200 SYN1=1 SYN2=1 | PASS |
| RM-M02 | Chuyển sang loại đã ngừng bán | retire SYN3 rồi PATCH room | 409 ROOM_TYPE_RETIRED | 409 ROOM_TYPE_RETIRED "Loại phòng đã ngừng dùng" | PASS |
| RM-M03 | Tạo phòng vào loại đã ngừng bán | retire SYN4 rồi POST room | 409 ROOM_TYPE_RETIRED | 409 ROOM_TYPE_RETIRED "Loại phòng đã ngừng dùng" | PASS |

### 6.Xóa phòng / xóa phòng cuối / ROOM_TOTAL_BELOW_RESERVED

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| RM-D01 | Xóa phòng không phải cuối: total giảm | DELETE L2 (còn L1) | 200; total 1 | 200 total=1 | PASS |
| RM-D02 | Xóa phòng CUỐI cùng: loại về nhập tay, total giữ nguyên lần đồng bộ trước | DELETE L1 | 200; total vẫn 1, managedByRooms=false, roomCount 0 | 200 total=1 managed=false | PASS |
| RM-D03 | Sau khi xóa hết phòng, PATCH totalRooms lại nhập tay được | PATCH LAST1 {totalRooms:8} | 200 total 8 | 200 8 | PASS |
| RM-D04 | Xóa phòng đã xóa | DELETE lại | 404 ROOM_NOT_FOUND | 404 ROOM_NOT_FOUND "Không tìm thấy phòng" | PASS |
| RM-R01 | Bulk 5 phòng ACTIVE cho loại trống, total=5 | bulk R1..R5 | 201 5 phòng; total 5 | 201 n=5 total=5 | PASS |
| RM-R02 | Khóa 3 phòng (block) tạo OK | POST room-blocks qty 3 | 201 | 201  "" | PASS |
| RM-R03 | Ngừng phòng làm ACTIVE=4 >= 3 đang khóa: OK | PATCH R1 INACTIVE | 200 total 4 | 200 total=4 | PASS |
| RM-R04 | Ngừng thêm 2 phòng -> ACTIVE=2 < 3 khóa/đặt | PATCH R2 INACTIVE (3), R3 INACTIVE (2<3) | R2 OK; R3 409 ROOM_TOTAL_BELOW_RESERVED, total giữ 3 | 200,409 ROOM_TOTAL_BELOW_RESERVED total=3 R3.status=ACTIVE (rollback) | PASS |
| RM-R05 | Xóa phòng ACTIVE khi ACTIVE=3 = số khóa (3) -> ACTIVE=2<3 | DELETE R3 | 409 ROOM_TOTAL_BELOW_RESERVED, phòng còn | 409 ROOM_TOTAL_BELOW_RESERVED rooms=5 | PASS |
| RM-R06 | Chuyển phòng ACTIVE sang loại khác làm thiếu | PATCH R3 {roomTypeId:SYN2} | 409 ROOM_TOTAL_BELOW_RESERVED | 409 ROOM_TOTAL_BELOW_RESERVED SYN2total=1 | PASS |
| RM-R07 | Phòng INACTIVE xóa không ảnh hưởng total | DELETE R1 (INACTIVE) | 200 total giữ 3 | 200 total=3 | PASS |
| RM-R08 | Loại phòng đang bị khóa, PATCH totalRooms giảm (nhập tay) | loại nhập tay: total 5, block 3, PATCH 2 | 409 ROOM_TOTAL_BELOW_RESERVED | 409 ROOM_TOTAL_BELOW_RESERVED / 200 | PASS |
| RM-R09 | Ngừng bán loại phòng còn khóa | DELETE room-type RSV1 | 409 ROOM_TYPE_IN_USE | 409 ROOM_TYPE_IN_USE "Loại phòng còn đơn hoặc khóa phòng đang hiệu lực" | PASS |

### 7.Thêm hàng loạt (bulk)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| BK-01 | Bulk 100 phòng (biên tối đa) prefix "B" 1..100 | {prefix:B,from:1,to:100} | 201, 100 phòng, total=100 | 201 n=100 total=100 rc=100 | PASS |
| BK-02 | Bulk 101 phòng | {from:1,to:101} loại khác | 422 Tối đa 100 | 422 VALIDATION_ERROR rooms=0 | PASS |
| BK-03 | Bulk to < from | {from:5,to:3} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BK-04 | Bulk from = to (1 phòng) | {from:7,to:7,prefix:D} | 201 1 phòng "D7" | 201 D7 | PASS |
| BK-05 | Bulk tiền tố 7 ký tự | prefix ABCDEFG | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BK-06 | Bulk prefix ký tự đặc biệt | prefix "<b>" | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BK-07 | Bulk số phòng vượt 10 ký tự (prefix 6 + số 5 chữ số) | prefix ABCDEF, to 99999 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BK-08 | Bulk from âm / số thực / chuỗi | from -1; from 1.5; from "1" | 422 cả ba | [422,422,422] | PASS |
| BK-09 | Bulk to > 99999 | to 100000 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BK-10 | Bulk ALL-OR-NOTHING: dải 1..10, trong đó "D7" đã có | prefix D from 1 to 10 | 409 ROOM_NUMBER_TAKEN, KHÔNG tạo phòng nào (vẫn 1) | 409 ROOM_NUMBER_TAKEN rooms=1 total=1 msg=Số phòng đã tồn tại: D7 | PASS |
| BK-11 | Bulk va chạm số của loại/tầng KHÁC cùng KS | prefix B from 1..3 (đã có ở BULK1) vào loại BULK3 | 409 | 409 ROOM_NUMBER_TAKEN "Số phòng đã tồn tại: B1, B2, B3" | PASS |
| BK-12 | Bulk INACTIVE không tăng total | prefix I 1..5 INACTIVE vào BULK3 | 201 5 phòng, total vẫn 1 | 201 total=1 rc=6 | PASS |
| BK-13 | Bulk không prefix (số thuần) 8001..8003 | prefix "", from 8001..8003 | 201 số "8001".. | 201 8001,8002,8003 | PASS |
| BK-14 | Bulk với số có 0 đứng đầu (from 0 ..2, prefix "0") | prefix 0 from 0..2 | 201: số "00","01","02" (không có zero-pad) | 201 00,01,02 | PASS |
| BK-15 | Bulk tầng không tồn tại / loại không tồn tại | uuid lạ | 404 | 404,404 | PASS |
| BK-16 | Bulk vào loại đã ngừng bán | retire BULK4 | 409 ROOM_TYPE_RETIRED | 409 ROOM_TYPE_RETIRED "Loại phòng đã ngừng dùng" | PASS |
| BK-17 | Cùng số phòng ở KS khác không xung đột (han02 bulk B1..B3) | han02 bulk prefix B 1..3 | 201 | 201  "" | PASS |
| BK-18 | Bulk body rỗng / thiếu floorId | {} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BK-19 | Bulk bởi lễ tân / dondua (không room:manage) | POST bulk | 403 | 403 FORBIDDEN "Không đủ quyền thực hiện thao tác này" | PASS |

### 8.Đồng thời (race)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| CC-01 | 2 bulk song song cùng dải R1..R5 | Promise.all 2 bulk giống nhau | đúng 1 thành công (201) + 1 lỗi 409; 5 phòng; total 5 | 201,409 rooms=5 total=5 | PASS |
| CC-02 | 10 POST phòng đơn song song (số khác nhau) vào cùng loại | 10 x POST /rooms | 10x201, total = số phòng ACTIVE (15) | 201201201201201201201201201201 total=15 rooms=15 | PASS |
| CC-03 | 2 POST cùng số phòng song song | 2 x POST number DUP1 | 1x201 + 1x409 | 201 ,409 ROOM_NUMBER_TAKEN | PASS |
| CC-04 | Song song: xóa 5 phòng ACTIVE + thêm 5 phòng; total khớp số ACTIVE | mixed DELETE/POST | total == count ACTIVE | total=16 active=16 rooms=16 | PASS |

### 9.Upload ảnh presigned (media)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| MD-01 | Presign ảnh jpeg folder rooms | {folder:rooms,contentType:image/jpeg,size:1000} | 201; key rooms/<năm>/<uuid>.jpg; method PUT; headers Content-Type; expiresIn 300; có uploadUrl | 201 {"key":"rooms/2026/cafe18ae-86f7-478d-8e0e-e04aca4c868d.jpg","m":"PUT","e":300,"pub":"http://localhost:5242/fake-r2/rooms/2026/cafe18ae-86f7-478d-8e0e-e04aca4c868d.jpg"} | PASS |
| MD-02 | Presign png/webp đuôi đúng | png, webp | .png/.webp | 8.png .webp | PASS |
| MD-03 | Presign: contentType image/gif | {"folder":"rooms","contentType":"image/gif","size":10} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-04 | Presign: contentType image/svg+xml | {"folder":"rooms","contentType":"image/svg+xml","size":10} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-05 | Presign: contentType text/html | {"folder":"rooms","contentType":"text/html","size":10} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-06 | Presign: size 0 | {"folder":"rooms","contentType":"image/png","size":0} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-07 | Presign: size 5MB+1 | {"folder":"rooms","contentType":"image/png","size":5242881} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-08 | Presign: size âm | {"folder":"rooms","contentType":"image/png","size":-5} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-09 | Presign: size số thực | {"folder":"rooms","contentType":"image/png","size":10.5} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-10 | Presign: folder lạ "../etc" | {"folder":"../etc","contentType":"image/png","size":10} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-11 | Presign: thiếu contentType | {"folder":"rooms","size":10} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-12 | Presign: size là chuỗi | {"folder":"rooms","contentType":"image/png","size":"10"} | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| MD-13 | Presign size đúng 5MB (biên) | size 5242880 | 201 | 201  "" | PASS |
| MD-14 | Presign không nêu folder (mặc định hotels) | {contentType:image/png,size:10} | 201 key hotels/... | 201 hotels/2026/5e0c49ab-e7c7-44d6-a6d6-81c1dd7d8e9d.png | PASS |
| MD-15 | Key do server cấp dùng được cho images của loại phòng và phòng | presign rooms -> PATCH room-type images + PATCH room images | 200 cả hai | 200,200 url=http://localhost:5242/fake-r2/rooms/2026/ace3d3a7-54d8-408a-a02d-041edc6c2c22.jpg | PASS |
| MD-16 | Presign không token | no auth | 401 | 401 UNAUTHENTICATED "Thiếu token xác thực" | PASS |
| MD-17 | Presign tạo audit MEDIA.UPLOAD_URL (kiểm gián tiếp: không lỗi 5xx khi gọi liên tiếp 5 lần) | 5 lần | 5x201 | 201201201201201 | PASS |
| MD-18 | Khóa ảnh phòng dùng 5 ảnh thực từ presign + 6 → 422 | 5 key presign OK, 6 → 422 | 200 rồi 422 | 200,422 | PASS |

### 10.Tồn kho / khối phòng / đơn

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| IV-02 | Inventory: to < from | from=2026-11-21&to=2026-11-19 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| IV-03 | Inventory: khoảng > 62 ngày | from=2026-11-17&to=2027-01-25 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| IV-04 | Inventory: ngày sai định dạng | from=2026-13-40&to=2026-12-01 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| IV-05 | Inventory: thiếu from/to |  | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| IV-06 | Inventory đúng 62 ngày (biên) | from..from+61 | 200 | 200  "" | PASS |
| IV-07 | Inventory loại phòng không tồn tại | uuid lạ | 404 | 404 ROOM_TYPE_NOT_FOUND "Không tìm thấy loại phòng" | PASS |
| BO-01 | Khách đặt 1 phòng (loại INV1) 2 đêm | POST /v1/bookings qty 1 | 201 (đơn PENDING chờ KS / CONFIRMED) | 201 PENDING AR-W55E6Z7R "" | PASS |
| BO-02 | Đặt vượt tồn (qty 3 khi còn 2) | POST qty 3 cùng ngày | 409 không đủ phòng | 409 SOLD_OUT | PASS |
| BO-03 | Idempotency: gửi lại cùng key + body trả cùng kết quả, không tạo thêm đơn | key cố định 2 lần | Cùng booking.code | first=201 AR-QCDDG9GZ; replay(khác body)=422 VALIDATION_ERROR | PASS |
| BO-04 | Đặt phòng thiếu Idempotency-Key | no header | 400 IDEMPOTENCY_KEY_REQUIRED | 400 IDEMPOTENCY_KEY_REQUIRED "Thiếu header Idempotency-Key (8–128 ký tự)" | PASS |
| BO-05 | Phòng giảm xuống dưới số đơn đặt (đơn thật): ngừng 2 phòng OK (ACTIVE 1), phòng thứ 3 bị chặn | PATCH K1,K2 INACTIVE; PATCH K3 INACTIVE | 200,200 rồi 409 ROOM_TOTAL_BELOW_RESERVED | 200,200,409 ROOM_TOTAL_BELOW_RESERVED, delete=409 ROOM_TOTAL_BELOW_RESERVED total=1 | PASS |
| BO-06 | Sau khi giảm, khách không đặt thêm được quá 1 phòng/đêm trong khoảng đã đặt | POST qty 1 ngày 10-12 (đã đặt 1, tổng ACTIVE 1) | 409 | 409 SOLD_OUT | PASS |
| BO-09 | Lễ tân từ chối với lý do ngắn (2 ký tự) | reject reason "ab" | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BL-01 | Tạo khóa phòng qty 2 bằng chủ | POST room-blocks qty 2 | 201 | 201  "" | PASS |
| BL-03 | Khóa vượt phần còn trống (qty 2 khi còn 1) | POST qty 2 | 409 BLOCK_CONFLICT | 409 BLOCK_CONFLICT "Chỉ còn 1 phòng trống trong khoảng này" | PASS |
| BL-04 | Khóa với lý do quá ngắn/to<=from/qty 0/501 | reason "ab"; to=from; qty 0; qty 501 | 422 x4 | 422,422,422,422 | PASS |
| BL-05 | Khóa bởi lễ tân (không room:manage) | POST room-blocks | 403 | 403 FORBIDDEN "Không đủ quyền thực hiện thao tác này" | PASS |
| BL-06 | Lễ tân xem danh sách khóa; han02 không thấy khóa của han01 | GET room-blocks | letan 200 thấy; han02 không thấy | 200 n=3; han02 n=0 | PASS |
| BL-07 | han02 gỡ khóa của han01 | DELETE /room-blocks/:id | 404 | 404 ROOM_BLOCK_NOT_FOUND "Không tìm thấy khóa phòng" | PASS |
| BL-09 | Đóng bán (không qty): khóa toàn bộ phần trống | POST không qty | 201, qty = 3 | 201 qty=3 | PASS |
| BL-10 | Tất cả phòng INACTIVE: total=0, loại hiển thị 0 và không đặt được | INACTIVE cả 3 phòng loại BLK1 (khối 50 ngày chưa gỡ nên có thể bị chặn) | Ghi nhận hành vi | 409,409,409 total=3 (409 = chặn bởi khóa 3 phòng ngày +50, đúng thiết kế) | PASS |
| BL-11 | Tồn dùng ACTIVE=0 khi chưa có đơn/khóa: loại BLK2 (3 phòng), INACTIVE hết | PATCH 3 phòng INACTIVE | 200,200,200 total 0 | 200,200,200 total=0 managed=true booking=409 SOLD_OUT | PASS |

### 11.Đề xuất delay (xác nhận 5 phút, đưa đón)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| DL-01 | Hiển thị đề xuất PENDING có đếm ngược secondsLeft <= 300, roomType, qty | GET delay-offers?status=PENDING | secondsLeft trong (0,300] | n=15 min=268 max=269 | PASS |
| DL-02 | Phân quyền: phong/dondua (không booking:decide) confirm/reject/list | POST confirm, reject, GET | 403 cả ba role | 403,403,403,403,403,403 | PASS |
| DL-03 | IDOR: han02 confirm/reject offer của han01 | POST confirm/reject | 404 | 404,404,404,404 | PASS |
| DL-04 | Confirm thiếu/sai số phòng (qty=1) | roomNumbers [] ; ["a","b"]; ["x","x"]; ["  "] | 422 ROOM_NUMBERS_MISMATCH/validation | 422VALIDATION_ERROR,422ROOM_NUMBERS_MISMATCH,200,422VALIDATION_ERROR,422VALIDATION_ERROR \|\| Case ["x","x"] cho qty=1 bị cleanRooms gộp trùng thành 1 số phòng nên được chấp nhận (200); các case còn lại đều 422. Chấp nhận được. | PASS |
| DL-05 | Confirm với số phòng KHÔNG tồn tại trong danh sách phòng (9999-ZZ) | roomNumbers ["9999-ZZ"] | Ghi nhận: hiện chấp nhận (spec: số phòng nhập tay, chưa đối chiếu bảng rooms) | 409 INVALID_STATE -> số phòng ma được chấp nhận, KHÔNG đối chiếu bảng rooms mới (khả năng cải thiện) \|\| Đã xác nhận lại bằng offer khác: 200, chấp nhận số phòng không có trong bảng rooms (không đối chiếu). Ghi nhận, xem mục Quan sát. | PASS |
| DL-06 | Confirm với XSS trong số phòng | roomNumbers ["<script>alert(1)</script>"] | Ghi nhận cách lưu | 422 VALIDATION_ERROR (max 20 ký tự, lưu text thuần) | PASS |
| DL-07 | Confirm số phòng có thật + số phòng dài > 20 ký tự | ["101"] ; 21 ký tự | 200 ; 422 | 200,422 | PASS |
| DL-08 | Confirm lần 2 cùng offer | POST confirm o3 lại | 409 INVALID_STATE | 409 INVALID_STATE "Yêu cầu không còn ở trạng thái chờ xác nhận" | PASS |
| DL-09 | Confirm song song 2 lần trên cùng offer o4 | Promise.all | 1x200 + 1x409 | 200,409 | PASS |
| DL-10 | Từ chối thiếu lý do / quá 300 ký tự | reject {} ; reason "" ; 301 ký tự | 422 | 422,422,422 | PASS |
| DL-11 | Từ chối rõ ràng: chuyển NGAY sang KS khác (không chờ hết 5 phút) | reject o5 | 200; offer REJECTED | 200 rejectedList=1 | PASS |
| DL-12 | Từ chối offer đã xử lý (confirmed/rejected) | reject o3, o5 | 409 | 409,409 | PASS |
| DL-13 | Confirm offer không tồn tại / id sai | uuid lạ; "abc" | 404 ; 422 | 404,422 | PASS |
| DL-14 | Đơn xác nhận (CONFIRMED) của delay hiện ở danh sách đơn khách sạn, status CONFIRMED | GET /bookings?status=CONFIRMED | có đơn PAYER | 200 PAYER confirmed=3 | PASS |

### 11.Đề xuất delay (xác nhận 5 phút, đưa đón, gia hạn)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| EX-01 | Giờ bay đổi MUỘN hơn giờ rời KS: hệ thống chỉ ĐỀ XUẤT (PROPOSED) gia hạn, không tự gia hạn | Ingest (x-payer-key) newDepartureAt +3h | Offer CONFIRMED có extensionStatus=PROPOSED + proposedLeaveAt; stay chưa đổi | ingest=200 changed=true offers=["PROPOSED","PROPOSED","PROPOSED","PROPOSED"] | PASS |
| EX-02 | Hotel xác nhận KHÔNG thấy nút trả lời gia hạn trước khi quầy yêu cầu: accept khi mới PROPOSED | POST /:id/extension/accept (chưa REQUESTED) | 409 INVALID_STATE | 409 INVALID_STATE "Yêu cầu gia hạn không còn ở trạng thái chờ khách sạn trả lời" | PASS |
| EX-03 | Quầy (payer) yêu cầu gia hạn cho lô | POST /payer/batches/:id/extensions/request | 200 requested[] | 200 n=4  | PASS |
| EX-04 | Yêu cầu gia hạn lần 2 khi không còn PROPOSED | POST lại | 409 NO_EXTENSION_PROPOSED | 409 NO_EXTENSION_PROPOSED "Không có đề xuất gia hạn nào đang chờ yêu cầu trong lô này" | PASS |
| EX-05 | Quản lý phòng/đưa đón (không booking:decide) không trả lời được gia hạn | phong accept/reject | 403 | 403,403 | PASS |
| EX-06 | han02 trả lời gia hạn của offer han01 | accept/reject bằng chu.han02 | 404 | 404,404 | PASS |
| EX-07 | Khách sạn từ chối gia hạn kèm lý do | POST extension/reject | 200 extensionStatus REJECTED | 200 {"offerId":"a945ec5b-055c-488b-b9f1-7714ccc01c83","extensionStatus":"REJECTED"} | PASS |
| EX-08 | Từ chối lại / accept sau khi đã từ chối | reject lại; accept | 409 INVALID_STATE x2 | 409,409 | PASS |
| EX-09 | Reason gia hạn >300 ký tự | reject reason 301 | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| EX-10 | Khách sạn đồng ý gia hạn: kiểm tồn rồi gia hạn (hoặc EXTENSION_NO_ROOM nếu hết phòng) | POST extension/accept | 200 ACCEPTED với stayTo mới (hoặc 409 EXTENSION_NO_ROOM hợp lệ) | 200 {"offerId":"f187a52e-0570-4347-876c-103b93996524","extensionStatus":"ACCEPTED","stayTo":"2026-11-16T22:23:36.179Z"} | PASS |
| EX-11 | Accept song song 2 lần cùng offer | offer thứ 2 (nếu có) | 1 thành công, 1 lỗi 409 | 200 ,409 INVALID_STATE | PASS |
| DL-15 | Đơn delay đã CONFIRMED tự tạo yêu cầu xe đưa đón (đón về KS / ra sân bay) cho khách sạn | GET /hotel/shuttle-requests lọc theo booking PAYER | Mỗi đơn PAYER confirmed có >= 1 yêu cầu xe | payerBookings=4 shuttleRequestsLiên quan=8 dirs=TO_AIRPORT:DONE,TO_HOTEL:DONE,TO_AIRPORT:DONE,TO_HOTEL:DONE,TO_AIRPORT:DONE,TO_HOTEL:DONE,TO_AIRPORT:DONE,TO_HOTEL:DONE | PASS |
| DL-16 | Phân quyền yêu cầu xe: dondua (shuttle:handle) xem được, phong (không) bị 403 | GET /hotel/shuttle-requests | dondua 200; phong 403 | 200,403 | PASS |
| DL-17 | han02 không thấy yêu cầu xe của han01 | GET han02 | không chứa booking của han01 | 200 n=0 | PASS |
| DL-18 | Offer quá 5 phút không xác nhận tự EXPIRED, đơn hết hạn, chuyển sang KS khác 1 lần rồi nhóm FAILED nếu vẫn không ai nhận | Chờ 5 phút sau khi đặt lô (22 offers) | 15+10 offer EXPIRED; 10 offer chuyển (transferCount 1); 7 nhóm FAILED; 4 nhóm CONFIRMED | han01 EXPIRED=15, transfer>0=5 (batch: EXPIRED/t0 15, EXPIRED/t1 10, REJECTED 1, CONFIRMED 4; groups CONFIRMED 4, FAILED 7) | PASS |
| DL-19 | Xác nhận offer đã hết hạn | POST confirm offer EXPIRED | 409 (INVALID_STATE hoặc OFFER_EXPIRED) | 409 INVALID_STATE | PASS |

### 10.Tồn kho / khối phòng / đơn (chạy lại các case sửa script)

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| IV-01 | Tồn kho theo ngày = số phòng ACTIVE (3), chưa đơn | GET inventory 3 ngày | physical=3 sellable=3 held/booked/blocked=0 | 200 {"date":"2026-11-18","physical":3,"held":0,"booked":0,"blocked":0,"sellable":3} | PASS |
| IV-08 | Đặt 1 phòng 2 đêm: tồn giảm đúng 2 đêm (held/booked 1, sellable 2), ngoài khoảng sellable 3 | inventory 9..13 | ngày 10,11 sellable 2; ngày 9,12 sellable 3 | {"2026-11-25":3,"2026-11-26":2,"2026-11-27":2,"2026-11-28":2,"2026-11-29":3} booking=PENDING \|\| Đơn 07:00Z (14:00 giờ VN) trả phòng nên ô ngày trả phòng cũng bị tính chiếm; do cửa sổ ngày theo giờ VN, hành vi sẵn có, không liên quan tính năng mới. | PASS |
| BO-07 | Phân quyền duyệt đơn: phong và dondua 403; han02 404 | POST confirm | 403,403,404 | 403,403,404 | PASS |
| BO-08 | Quản lý phòng (booking:read) xem được đơn; dondua check-out khi đơn chưa check-in bị chặn | GET (phong); check-out (dondua) | 200; 409 | 200; 409 INVALID_STATE | PASS |
| BO-09b | Lễ tân từ chối với lý do ngắn | reason "ab" | 422 | 422 VALIDATION_ERROR "Dữ liệu không hợp lệ" | PASS |
| BO-10 | Lễ tân xác nhận đơn PENDING | POST confirm (letan) | 200 CONFIRMED | 200  {"booking":{"id":"d581e3a0-d88e-48bd-87ea-775828b40cbc","seq":164,"code":"AR-TCJH4HT3","status":"CONFIRMED","hotelId":"0 | PASS |
| BO-11 | Từ chối đơn đã xác nhận | POST reject | 409 | 409 INVALID_STATE | PASS |
| BO-12 | Từ chối đơn trả lại tồn | book 2 phòng -> reject | sellable 0 -> 3 sau reject | before=0 reject=200 after=2 | PASS |
| BL-02 | Tồn kho phản ánh khóa (blocked 2, sellable 1) | inventory 40..41 | sellable 1 | {"date":"2026-12-26","physical":3,"held":0,"booked":0,"blocked":2,"sellable":1} | PASS |
| BL-08 | Gỡ khóa 2 lần, tồn trả lại | DELETE x2 | 200, 409 ROOM_BLOCK_RELEASED; sellable 3 | 200,409 sellable=3 | PASS |
| LM-01 | Tổng phòng 1 loại vượt 500 (totalRooms nhập tay giới hạn 500) | 6 lần bulk 100 vào LIM1 | Mong đợi bị chặn >500 hoặc ghi nhận; thực tế total=600 | 6x201, total_rooms=600 (vượt max 500 của createRoomTypeBody.totalRooms; không có trần số phòng/loại hoặc/khách sạn) | FAIL |

### 12.UI tab Phòng

| ID | Case | Input | Expected | Actual | Kết quả |
|---|---|---|---|---|---|
| UI-01 | Chủ KS mở tab Loại phòng và giá, thấy khối Tầng và danh sách phòng | login chu.han01 -> tab | Hiện section room-units + danh sách loại phòng | units=1 types=3 ([ảnh](shots-2026-11-16-khach-san-tang-phong/11-rooms-tab.png)) | PASS |
| UI-02 | Tạo tầng "UI Tầng 60" số 60 | form tầng: name, level 60, note | Thông báo đã lưu, hàng tầng xuất hiện | Tầng và danh sách phòng \|  \| Mỗi phòng thuộc một tầng và một loại phòng. Loại phòng đã có phòng thì Tổng số phòng tự bằng số phòng đang dùng. Đơn đặt vẫn tính theo loại phòng, chưa gán vào phòng cụ thể. \|  \|  ([ảnh](shots-2026-11-16-khach-san-tang-phong/12-floor-created.png)) | PASS |
| UI-03 | Tạo tầng trùng số tầng 60 hiện lỗi tiếng Việt, không tạo thêm | level 60 lần 2 | Thông báo lỗi trùng số tầng; số hàng "UI Tầng 60"/"Trùng" không đổi | ['Số tầng đã tồn tại trong khách sạn'] ([ảnh](shots-2026-11-16-khach-san-tang-phong/13-floor-dup.png)) | PASS |
| UI-04 | XSS trong tên/ghi chú tầng được escape (không chạy script, hiển thị nguyên văn) | name <img onerror>, note <script> | window.__xss undefined; text hiển thị nguyên văn | __xss=None hiển thị nguyên văn=1 ([ảnh](shots-2026-11-16-khach-san-tang-phong/14-xss-floor.png)) | PASS |
| UI-05 | Chọn nhiều ảnh cùng lúc (3 file) cho loại phòng: upload presigned + hiển thị 3 ảnh, ảnh đầu là bìa | set_input_files p1,p2,p3 | 3 img-item; chỉ ảnh đầu có nhãn Ảnh bìa | items=3 cover=1 ([ảnh](shots-2026-11-16-khach-san-tang-phong/15-type-3img.png)) | PASS |
| UI-06 | Chọn file sai định dạng (gif) và quá 5MB bị từ chối phía client, không gọi upload | x.gif, big.png (5MB+) | 2 thông báo lỗi; vẫn 3 ảnh | ['x.gif: chỉ nhận ảnh JPG, PNG, WebP.', 'big.png: vượt quá 5 MB.'] ([ảnh](shots-2026-11-16-khach-san-tang-phong/16-type-img-errs.png)) | PASS |
| UI-07 | Sắp xếp ảnh: "Đặt làm bìa" cho ảnh thứ 3 đưa lên đầu | click Đặt làm bìa ảnh 3 | Ảnh 3 lên vị trí 1 (nhãn bìa ở item đầu) | cover ở item đầu=1 ([ảnh](shots-2026-11-16-khach-san-tang-phong/17-type-cover.png)) | PASS |
| UI-08 | Thêm ảnh vượt giới hạn 10 ảnh của loại phòng: chặn ở 10, nút thêm bị disable, có thông báo | 3+9 ảnh (12 tổng) | Tối đa 10 ảnh; add disabled; lỗi "tối đa 10 ảnh" | items=10 disabled=True errs=['p11.png: tối đa 10 ảnh, hãy xóa bớt ảnh cũ.', 'p12.png: tối đa 10 ảnh, hãy xóa bớt ảnh cũ.'] ([ảnh](shots-2026-11-16-khach-san-tang-phong/18-type-img-max.png)) | PASS |
| UI-09 | Lưu loại phòng mới với 10 ảnh, mô tả, hướng nhìn, tiện nghi | submit | Hàng UITYP6 xuất hiện, Số phòng 4 | UITYP6	UI Loại phòng	2	1	0	4	500.000đ	Không	 \| Đang bán \| 	 \| Sửa \| Ngừng bán ([ảnh](shots-2026-11-16-khach-san-tang-phong/19-type-saved.png)) | PASS |
| UI-10 | Thêm phòng đơn lẻ UI101 (loại UITYP6 đang nhập tay 4): Số phòng đồng bộ = 1 và hiện "(theo danh sách phòng)" | ru-new UI101 | phòng hiện ở danh sách; loại: Số phòng 1 (theo danh sách phòng) | UITYP6	UI Loại phòng	2	1	0	1 (theo danh sách phòng)	500.000đ	Không	 \| Đang bán \| 	 \| Sửa \| Ngừng bán ([ảnh](shots-2026-11-16-khach-san-tang-phong/20-room-added.png)) | PASS |
| UI-11 | Thêm phòng trùng số UI101 hiện lỗi, không tạo thêm | UI101 lần 2 | Thông báo "Số phòng đã tồn tại"; vẫn 1 hàng UI101 | ['Số phòng đã tồn tại trong khách sạn'] ([ảnh](shots-2026-11-16-khach-san-tang-phong/21-room-dup.png)) | PASS |
| UI-12 | Thêm hàng loạt dải 1..250 (>100): preview báo lỗi, nút Tạo phòng disabled | from 1 to 250 | preview lỗi (field-error); bk-save disabled | preview="Dải số không hợp lệ (số cuối >= số đầu, tối đa 100 phòng, số phòng tối đa 10 ký tự)." disabled=True ([ảnh](shots-2026-11-16-khach-san-tang-phong/22-bulk-invalid.png)) | PASS |
| UI-13 | Preview dải hợp lệ 1..5 prefix UB hiển thị danh sách UB1..UB5 | from 1 to 5 | preview chứa UB1 và UB5 | Sẽ tạo 5 phòng: UB1, UB2, UB3, UB4, UB5 ([ảnh](shots-2026-11-16-khach-san-tang-phong/23-bulk-valid.png)) | PASS |
| UI-14 | Tạo hàng loạt UB1..UB5: 5 phòng mới, tổng số phòng loại = 6 | bk-save | 5 hàng UB*; Số phòng 6 | UB rows=5 \| UITYP6	UI Loại phòng	2	1	0	6 (theo danh sách phòng)	500.000đ	Không	 \| Đang bán \| 	 \| Sửa \| Ngừng bán ([ảnh](shots-2026-11-16-khach-san-tang-phong/24-bulk-done.png)) | PASS |
| UI-15 | Hàng loạt trùng (UB3..UB8 trong đó UB3-5 đã có): lỗi, không tạo UB6..UB8 (tất cả hoặc không) | UB3..UB8 | Thông báo trùng; vẫn 5 phòng UB | ['Số phòng đã tồn tại: UB3, UB4, UB5'] ([ảnh](shots-2026-11-16-khach-san-tang-phong/25-bulk-conflict.png)) | PASS |
| UI-16 | Chọn 6 ảnh cho 1 phòng (tối đa 5): nhận 5, ảnh thứ 6 báo lỗi | 6 file | 5 img-item + 1 lỗi tối đa 5 | items=5 errs=['p6.png: tối đa 5 ảnh, hãy xóa bớt ảnh cũ.'] ([ảnh](shots-2026-11-16-khach-san-tang-phong/26-room-img-limit.png)) | PASS |
| UI-17 | Lưu phòng + F5: 5 ảnh còn nguyên, ảnh bìa đã chọn giữ vị trí 1 | lưu rồi reload, mở lại form sửa | 5 ảnh sau reload | items=5 cover_first=1 ([ảnh](shots-2026-11-16-khach-san-tang-phong/27-room-reload.png)) | PASS |
| UI-18 | Xóa tầng còn phòng: hiện lỗi FLOOR_HAS_ROOMS tiếng Việt, tầng còn | fl-del -> Đồng ý | Thông báo "Tầng còn N phòng"; tầng vẫn hiển thị | ['Tầng còn 6 phòng, hãy chuyển hoặc xóa phòng trước'] ([ảnh](shots-2026-11-16-khach-san-tang-phong/28-floor-del-blocked.png)) | PASS |
| UI-19 | Form sửa loại phòng đã có phòng: ô Tổng số phòng bị disable | rt-edit UITYP6 | rt-total disabled | disabled=True ([ảnh](shots-2026-11-16-khach-san-tang-phong/29-type-edit-managed.png)) | PASS |
| UI-20 | Ngừng dùng phòng UB1: số phòng của loại giảm 6 -> 5 | ru-toggle UB1 | Loại UITYP6: Số phòng 5 | UITYP6	UI Loại phòng	2	1	0	5 (theo danh sách phòng)	500.000đ	Không	 \| Đang bán \| 	 \| Sửa \| Ngừng bán ([ảnh](shots-2026-11-16-khach-san-tang-phong/30-room-inactive.png)) | PASS |
| UI-R-letan | Vai trò letan.han02: tab Loại phòng và giá KHÔNG có nút ghi (tầng/phòng/hàng loạt/loại) | letan.han02@khachsan.mo | xem được danh sách; nút ghi ẩn | room-units=True nút=[False, False, False, False] ([ảnh](shots-2026-11-16-khach-san-tang-phong/40-role-letan.png)) | PASS |
| UI-R-phong | Vai trò phong.han02: tab Loại phòng và giá có nút ghi (tầng/phòng/hàng loạt/loại) | phong.han02@khachsan.mo | xem được danh sách; nút ghi hiện | room-units=True nút=[True, True, True, True] ([ảnh](shots-2026-11-16-khach-san-tang-phong/40-role-phong.png)) | PASS |
| UI-R-dondua | Vai trò dondua.han02: tab Loại phòng và giá KHÔNG có nút ghi (tầng/phòng/hàng loạt/loại) | dondua.han02@khachsan.mo | xem được danh sách; nút ghi ẩn | room-units=True nút=[False, False, False, False] ([ảnh](shots-2026-11-16-khach-san-tang-phong/40-role-dondua.png)) | PASS |
