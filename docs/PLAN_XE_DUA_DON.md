# Kế hoạch: xe đưa đón có điều phối, theo dõi trên bản đồ (mô phỏng)

Trạng thái: **chờ duyệt**, chưa có dòng code nào. Mục "Quyết định cần xác nhận" ở cuối.

## 1. Mục tiêu

**Khách:** sau khi đặt xong vào màn tra cứu đơn, thấy trạng thái chung `đặt phòng → xe đón → check-in → check-out → xe đón → kết thúc`; với xe thấy `xe tới đón → xe đã tới → đã lên xe → đã trả khách`, vị trí xe và tuyến đường trên bản đồ (kiểu Grab, Xanh SM); được hủy xe (tự đi) hoặc gọi xe đón trước khi check-out.
**Hệ thống:** tự điều phối xe đã khai báo của khách sạn (đoàn 5 người, xe 4 chỗ thì điều 2 xe), cả chiều đón và chiều về; ghi log từng đơn.
**Khách sạn:** có phần cho tài xế xem chuyến, thấy vị trí, tên, SĐT khách và bấm nhận.
**Vị trí xe: mô phỏng** (server tính vị trí xe chạy dọc tuyến theo thời gian, không GPS thật). Thiết kế chừa chỗ để ghép GPS thật sau.

## 2. Hiện trạng (đã đọc code)

- `shuttle_requests` (007): một yêu cầu = một đơn + một chiều (`TO_HOTEL`/`TO_AIRPORT`), có giá theo khoảng cách. Trạng thái `REQUESTED → ASSIGNED → DONE | CANCELLED`. Tài xế là chữ nhập tay `{name, phone}`.
- Chưa có: đội xe, số chỗ, **số khách đi xe** (đơn chỉ có `qty` phòng), GPS, bản đồ, nhật ký sự kiện theo đơn.
- Đã có sẵn dùng lại: `accounts.type='DRIVER'` (đã được CHECK cho phép), tọa độ khách sạn (`hotels.location` Point), tọa độ sân bay (`data/airports.ts`), hủy xe theo đơn (`shuttle/cascade.ts`), `status_history` của đơn, bảng audit, vòng quét định kỳ trong `server.ts`.

## 3. Thiết kế

### 3.1 Dữ liệu (migration mới, idempotent)
| Bảng | Nội dung |
|---|---|
| `vehicles` | `hotel_id`, biển số, số chỗ, loại, `active`, tài xế mặc định (`driver_account_id`, tên, SĐT) |
| `shuttle_requests` (thêm cột) | `passengers` (số khách đi xe, bắt buộc, 1-30) |
| `shuttle_trips` | một chuyến = một xe: `request_id`, `booking_id`, `hotel_id`, `kind` (`OWN` xe của khách sạn / `EXTERNAL` xe ngoài), `vehicle_id` (null nếu xe ngoài), `seats`, `status`, `route`, `eta`, mốc thời gian từng trạng thái; **xe ngoài thêm:** `provider` (`GRAB`/`XANHSM`/`OTHER`), `share_url` (liên kết chia sẻ chuyến), tên tài xế, biển số, SĐT (nhập tay, tùy chọn), `external_reason` |
| `booking_events` | nhật ký từng đơn: `booking_id`, `at`, `actor` (khách/khách sạn/tài xế/hệ thống), `type`, `data` |

Trạng thái chuyến: `OFFERED → ACCEPTED → EN_ROUTE → ARRIVED → ONBOARD → DROPPED_OFF`, nhánh `CANCELLED`/`REJECTED`.
Trạng thái chung của đơn **không thêm cột**: suy ra khi đọc từ trạng thái đơn và các chuyến xe (`BOOKED → PICKUP_IN → CHECKED_IN → CHECKED_OUT → PICKUP_OUT → DONE`).

### 3.2 Điều phối (hàm thuần, có test)
- Đầu vào: số khách, xe rảnh của khách sạn (không trùng giờ với chuyến khác), số chỗ.
- Chọn ít xe nhất đủ chỗ: một xe đủ chỗ thì lấy xe nhỏ nhất đủ; không thì lấy xe lớn trước đến khi đủ, rồi thử thu nhỏ xe cuối. Ví dụ 5 người: xe 7 chỗ nếu có, không thì 4+4.
- **Không đủ xe rảnh của khách sạn:** chuyển sang quy trình **xe ngoài** (mục 3.10): xe của khách sạn còn rảnh vẫn được điều trước, phần khách còn lại thành chuyến `EXTERNAL`. Khách sạn được báo ngay, tự gọi Grab hoặc Xanh SM rồi nhập liên kết chia sẻ chuyến vào hệ thống.
- **Khi nào chạy:** chiều đón: khi đơn được xác nhận (có xe) và tới trước giờ đón 30 phút; chiều về: khi khách bấm "Gọi xe ngay" (giờ đón = bây giờ + 15 phút) hoặc tới trước giờ hẹn 30 phút (vòng quét).
- Tài xế từ chối thì xe đó bị loại và chạy lại điều phối cho phần còn thiếu.

### 3.3 Mô phỏng và tuyến đường
- Tuyến: xe từ khách sạn → điểm đón → điểm trả. Sân bay và khách sạn đã có tọa độ. Tính tuyến một lần bằng **OSRM** (máy chủ demo công cộng, miễn phí) lúc điều xe, lưu vào chuyến; lỗi thì dùng đường thẳng.
- Vị trí xe = hàm của thời gian trên tuyến (không ghi DB mỗi giây). Chạy khi `EN_ROUTE` và `ONBOARD`. Biến `SHUTTLE_SIM_SPEED_KMH` (mặc định 40) và `SHUTTLE_SIM_AUTO=true` để tự chuyển `ARRIVED/ONBOARD/DROPPED_OFF` khi demo mà không cần tài xế bấm.
- Ghép GPS thật sau: thêm API tài xế gửi vị trí, ưu tiên điểm GPS mới nhất, mô phỏng làm dự phòng.

### 3.4 API (đều theo mẫu hiện có, có validation, Idempotency-Key ở POST tạo)
- Khách (tra cứu mã đơn + SĐT, như hiện nay): lấy chuyến xe của đơn, **gọi xe ngay**, hủy xe.
- **Theo dõi vị trí:** bản đồ cần hỏi lại mỗi vài giây, nhưng tra cứu hiện bị giới hạn 10 lần/phút/IP. Sau khi tra cứu thành công cấp **token ngắn hạn gắn riêng đơn đó**, dùng cho API vị trí có giới hạn riêng rộng hơn. Không mở dữ liệu cho người không có mã đơn + SĐT.
- Khách sạn: CRUD xe và tài xế, bảng điều phối (yêu cầu, chuyến, cảnh báo thiếu xe), gán tay/đổi xe.
- Tài xế: danh sách chuyến của mình, nhận/từ chối, bắt đầu đón, đã tới, đã đón khách, đã trả khách.
- Nhật ký: khách sạn và admin xem đầy đủ; khách xem bản rút gọn, không lộ tên người xử lý nội bộ.

### 3.5 Quyền (chỉ theo permission, không theo tên vai trò)
Tài xế là tài khoản `DRIVER` của khách sạn, **chỉ thấy chuyến của mình**. Đề xuất thêm 2 mã quyền mới: `fleet:manage` (quản lý xe và điều phối) và `trip:drive` (thao tác chuyến của mình). Quyền shuttle hiện có (`shuttle:handle`) giữ nguyên.

### 3.6 Giao diện
- **Khách (màn chi tiết đơn):** thanh trạng thái chung; thẻ xe (biển số, tài xế, SĐT, thời gian dự kiến); bản đồ **Leaflet + OpenStreetMap** với vị trí xe và tuyến đường; nút "Gọi xe ngay", "Hủy xe, tôi tự đi"; chọn số khách đi xe khi đặt dịch vụ xe.
- **Khách sạn:** tab "Đội xe" (xe và tài xế), tab "Điều phối" (bảng chuyến, cảnh báo, gán tay), tab "Chuyến của tôi" (cho tài xế: danh sách, bản đồ, nút nhận và các bước), panel "Nhật ký đơn" trong chi tiết đơn.
- **Admin:** xem nhật ký đơn.
- Thêm thư viện `leaflet` (bản đồ chỉ tải khi mở thẻ xe).

### 3.7 Hủy và tiền
- Khách hủy xe được khi chuyến chưa `ONBOARD`. Hủy theo đơn đã có (cascade) giữ nguyên. Hủy xe giữ đúng quy tắc tiền hiện tại của dịch vụ xe (xem quyết định 2).
- Mọi chuyển trạng thái ghi `booking_events`.

### 3.8 Realtime (Socket.IO, bổ sung theo yêu cầu)
Backend đã có Socket.IO (`api/realtime/socket.ts`, `emitBookingChange`) nhưng giao diện chưa dùng. Mở rộng:
- **Sự kiện đẩy tới khách:** tài xế nhận chuyến (kèm thẻ xe: biển số, loại xe, tên, SĐT, ảnh tài xế), mỗi lần đổi trạng thái (`EN_ROUTE`, `ARRIVED`, `ONBOARD`, `DROPPED_OFF`), đổi xe/tài xế, hủy, và **vị trí xe mỗi khoảng 2 giây** khi chuyến đang chạy. Không dùng polling, polling chỉ là phương án dự phòng khi socket không nối được.
- **Sự kiện đẩy tới khách sạn/tài xế:** có yêu cầu xe mới, chuyến được gán/từ chối/nhận, cảnh báo thiếu xe, trạng thái chuyến; bảng điều phối và danh sách chuyến của tài xế tự cập nhật không cần tải lại.
- **Xác thực kết nối:** nhân sự dùng JWT hiện có (vào phòng theo `hotelId` và theo `driverId`, không nghe được khách sạn khác). **Khách dùng token theo dõi ngắn hạn gắn riêng một đơn** (cấp sau khi tra cứu mã đơn + SĐT thành công), chỉ vào được phòng của đơn đó. Dữ liệu đẩy cho khách chỉ gồm thông tin được phép (xem 3.4).
- **Vị trí mô phỏng:** một bộ đếm trên server (chỉ chạy khi có chuyến đang `EN_ROUTE`/`ONBOARD`) tính vị trí theo tuyến và đẩy vào phòng của chuyến. Không ghi DB mỗi lần.
- Khi khách mở lại trang giữa chừng: tải trạng thái hiện tại một lần qua API rồi nối socket tiếp.
- Giới hạn: Socket.IO chạy trong một tiến trình API. Nếu sau này chạy nhiều bản API cần thêm bộ chuyển tiếp (Redis adapter). Render gói hiện tại chạy một bản nên chưa cần.

### 3.10 Hết xe: xe ngoài (Grab, Xanh SM) và chia sẻ chuyến
**Luồng**
1. Điều phối không phủ hết số khách → tạo chuyến `EXTERNAL` ở trạng thái `NEEDS_EXTERNAL` cho phần còn lại, ghi `external_reason = NO_FREE_VEHICLE` và log đơn.
2. **Khách sạn được báo realtime:** bảng điều phối hiện chuyến đỏ "Cần gọi xe ngoài" kèm hạn xử lý (đếm ngược tới giờ đón), thông tin cần để đặt xe (điểm đón/đến, giờ đón, số khách, tên và SĐT khách, ghi chú). Nếu quá 10 phút trước giờ đón vẫn chưa xử lý: cảnh báo đậm hơn (không tự hủy).
3. Nhân viên khách sạn tự đặt xe trên Grab/Xanh SM bằng tay (hệ thống không tích hợp API của hãng), rồi nhập vào hệ thống: **hãng, liên kết chia sẻ chuyến**, và tùy chọn tên tài xế, biển số, SĐT, giờ đón dự kiến → chuyến thành `ACCEPTED` (loại `EXTERNAL`).
4. Các bước sau do nhân viên khách sạn bấm (xe ngoài không có tài khoản tài xế): `đã tới → đã lên xe → đã trả khách`, hoặc hủy/đổi xe. Chế độ demo tự chạy áp dụng cho cả xe ngoài.
5. **Khách được báo realtime ở hai thời điểm:**
   - Khi thiếu xe: *"Xe của khách sạn hiện đã hết nên khách sạn đang gọi xe ngoài (Grab/Xanh SM) để đón bạn. Bạn sẽ nhận thông tin xe ngay khi có."*
   - Khi khách sạn nhập xong: thẻ xe ngoài (hãng, tài xế/biển số nếu có) + **nút "Xem hành trình trên Grab/Xanh SM" mở liên kết chia sẻ chuyến**, kèm dòng lý do ở trên.
6. Vì liên kết chia sẻ là trang của hãng, **bản đồ của chúng ta không vẽ được vị trí xe ngoài** (không có API). Khách theo dõi bằng liên kết đó. Thanh trạng thái chung và nhật ký đơn vẫn chạy bình thường.

**Bảo mật liên kết chia sẻ** (khách sạn nhập tay, khách bấm vào nên là đường tấn công lừa đảo): chỉ nhận `https://`, từ chối `javascript:`, `data:`, IP, `localhost`, độ dài hợp lý; **chỉ cho phép tên miền trong danh sách cấu hình** `EXTERNAL_RIDE_LINK_HOSTS` (mặc định gồm các tên miền chia sẻ của Grab và Xanh SM, bạn kiểm tra giúp tên miền đúng hiện hành); hiển thị tên miền thật cho khách trước khi mở, mở bằng `rel="noopener noreferrer"`, không tự chuyển trang. Ghi log ai nhập liên kết.

### 3.9 Ảnh tài xế
- Ảnh gắn với tài xế (khai báo ở màn Đội xe), hiển thị cho khách ngay khi tài xế nhận chuyến, cùng biển số, loại xe, tên, SĐT.
- **Đã chốt: lưu ảnh trên R2**, cùng cách với ảnh khách sạn: xin `upload-url` (backend có sẵn cơ chế ở `admin/media.router.ts` và `hotelProfile`), trình duyệt PUT thẳng lên R2, lưu **khóa ảnh** (không lưu ảnh trong DB). Trình duyệt vẫn nén ảnh xuống tối đa khoảng 512px trước khi tải lên.
- Máy dev chưa cấu hình R2 (API trả 503 `STORAGE_NOT_CONFIGURED`): tải ảnh lên chỉ chạy được khi có `R2_*` trong env. Khi chưa có ảnh hoặc ảnh lỗi, giao diện hiện **ảnh đại diện chữ cái đầu** thay thế, nên các chức năng còn lại vẫn chạy và kiểm thử được. Dữ liệu seed không có ảnh.
- Ảnh là dữ liệu cá nhân: API chỉ trả đường dẫn ảnh cho khách có token theo dõi của đúng đơn đó, chỉ khi chuyến đã được tài xế nhận; chỉ nhận jpg/png/webp và kiểm tra kích thước phía server. **Lưu ý:** bucket R2 của dự án là công khai (có `R2_PUBLIC_BASE_URL`), nên ai biết đường dẫn ảnh đều xem được; khóa ảnh là UUID khó đoán nên chấp nhận được cho giai đoạn này. Muốn kiểm soát chặt hơn phải chuyển sang bucket riêng tư và URL ký có thời hạn (làm sau).

## 4. Các pha thực hiện

| Pha | Việc | Kiểm thử |
|---|---|---|
| P1 | Migration, hàm điều phối, API chuyến/xe/tài xế/nhật ký, chuyển trạng thái | test thuần cho điều phối (1, 4, 5, 9 người, hết xe, tài xế từ chối); tích hợp trên DB riêng |
| P2 | Mô phỏng + tuyến OSRM + token theo dõi + **hub realtime Socket.IO** (phòng theo đơn/khách sạn/tài xế, sự kiện, bộ đếm vị trí) | test hàm vị trí theo thời gian; xác thực socket (khách chỉ vào phòng đơn của mình, nhân sự không nghe khách sạn khác); sự kiện tới đúng người |
| P3 | Cổng khách sạn: Đội xe (kèm ảnh tài xế), Điều phối, Chuyến của tôi, nhật ký, **tự cập nhật qua socket** | trình duyệt 1280/390, ít quyền thấy menu đúng, hai cửa sổ: tài xế bấm thì bảng điều phối đổi ngay |
| P4 | Khách: thanh trạng thái, thẻ xe + ảnh tài xế, bản đồ, gọi/hủy xe, số khách đi xe, **nhận realtime (không tải lại trang)** | trình duyệt: tài xế nhận thì thẻ xe hiện ngay; xe chạy mượt; mất kết nối socket thì rơi về polling |
| P5 | Seed: xe + tài xế cho khách sạn mẫu, đơn có xe | e2e toàn luồng bằng agent: đặt đơn có xe → điều 2 xe → tài xế nhận → chạy → trả khách → check-out → gọi xe ra sân bay |

P1-P2 là backend (một agent), P3 và P4 làm song song sau đó, P5 cuối.

## 5. Ngoài phạm vi lần này
GPS thật từ điện thoại tài xế, ứng dụng native, tính giá theo thời gian thực/giờ cao điểm, thanh toán riêng cho xe, tự chuyển xe giữa các khách sạn, thông báo đẩy/SMS cho khách.

## 6. Rủi ro đã biết
- OSRM demo là dịch vụ công cộng giới hạn tốc độ, chỉ phù hợp trình diễn; sau này đổi sang OSRM tự chạy hoặc OpenRouteService.
- Tile OpenStreetMap công cộng cũng chỉ hợp lý cho lưu lượng nhỏ; production nên dùng nhà cung cấp tile riêng.
- `passengers` là cột mới bắt buộc: đơn xe cũ không có, migration cần giá trị mặc định (1) và giao diện hiện cũ phải gửi trường mới.
- Điều phối tự động có thể chọn xe một cách khó hiểu với khách sạn: bảng điều phối phải hiển thị lý do chọn và cho gán tay.

## 7. Quyết định cần xác nhận
1. ~~Hết xe rảnh~~ **Đã chốt:** báo khách sạn gọi xe ngoài (Grab/Xanh SM), nhập liên kết chia sẻ; khách được báo lý do và nhận liên kết (xem 3.10).
2. Hủy xe để tự đi: miễn phí trước khi tài xế nhận, và sau đó (đến trước `ONBOARD`) không hoàn phí xe (đề xuất), hay luôn miễn phí?
3. Thêm 2 mã quyền mới `fleet:manage` và `trip:drive` (đề xuất), hay dùng lại `shuttle:handle` cho cả hai?
4. SĐT tài xế hiển thị cho khách: có (đề xuất), hay chỉ qua khách sạn?
5. Chế độ demo tự chuyển trạng thái (`SHUTTLE_SIM_AUTO`): bật mặc định ở dev, tắt ở production (đề xuất).
6. ~~Ảnh tài xế lưu ở đâu~~ **Đã chốt: R2** (xem 3.9).
7. Realtime bằng Socket.IO có sẵn, kèm polling dự phòng (đề xuất). Đúng ý bạn chưa?
8. ~~Tiền xe ngoài~~ **Đã chốt:** phí xe khách đã thanh toán lúc đặt được dùng cho chuyến xe ngoài. Hệ thống **không thu thêm và không hoàn** phần nào của khách khi chuyển sang xe ngoài; chênh lệch với giá cước thực tế của Grab/Xanh SM là việc của khách sạn. (Tôi hiểu theo cách này, cần bạn xác nhận nếu ý khác, ví dụ khách tự trả cước trong ứng dụng.)
9. Chỉ cho phép liên kết chia sẻ thuộc danh sách tên miền cấu hình (đề xuất, mặc định Grab và Xanh SM) hay cho mọi liên kết `https://`? Bạn cho tôi biết tên miền liên kết chia sẻ chuyến thực tế của hai ứng dụng.
10. Khi khách sạn còn đủ xe cho một phần: xe của khách sạn chở phần đó, phần còn lại gọi xe ngoài (đề xuất), hay gọi xe ngoài cho cả đoàn?
