HỆ THỐNG ĐẶT PHÒNG KHÁCH SẠN VÀ XE ĐƯA ĐÓN
Công nghệ: Node.js, Socket.io, MongoDB
I. CHỨC NĂNG DÀNH CHO NGUỜI DÙNG (USER)
1. Kiểm tra chuyến bay
User nhập mã chuyến bay hoặc quét mã vạch trên vé, hiển thị ra các thông tin chuyến, giờ bay và cất cánh, và cả thông tin delay nếu có. Gợi ý đặt phòng điểm đến hoặc điểm đi theo quy tắc:
Nếu bị delay trên 5 tiếng thì gợi ý (điểm xuất phát)
Nếu thời gian check cách thời gian bay cách 5 tiếng (điểm xuất phát)
Đặt phòng ngay sau khi hạ cánh (điểm hạ cánh)
2. Tìm kiếm và kiểm tra tồn phòng (Cập nhật check phòng realtime)
User xem được thông tin các khách sạn còn phòng, giá, ảnh không gian phòng, vị trí trên bản đồ, quãng đường, đánh giá phòng, các dịch vụ đi kèm...
3. Đặt phòng
Điền các thông tin cơ bản như số điện thoại, họ và tên (nếu chưa thiết lập hồ sơ), rồi chọn thời gian check-in, check-out, chọn vị trí đón hiện tại hoặc nhập vị trí, chọn dịch vụ xe đưa đón 1 chiều hoặc 2 chiều (không bắt buộc). Sau đó chọn hình thức thanh toán trực tuyến hoặc tại khách sạn.

Cấu tính giá: Giá phòng sẽ được tính theo cấu hình; giá xe đưa đón sẽ tính theo quãng đường từ vị trí đón tới khách sạn (1 chiều hoặc 2 chiều) theo cấu hình; phí dịch vụ của đơn hàng tính theo cấu hình.
4. Thanh toán
Khi đặt hàng nếu chọn thanh toán tại khách sạn thì sẽ chuyển sang màn đặt đơn thành công.
Khi đặt hàng thanh toán trực tiếp sẽ chuyển sang MoMo tiến hành thanh toán, thanh toán xong chuyển về màn thanh toán thành công.
Thanh toán sẽ được chuyển về MoMo của admin, và sau khi khách check-out sẽ được chuyển trực tiếp về phía khách sạn.
5. Check thông tin hiện trạng xe đưa đón
Sau khi thanh toán thành công sẽ được chuyển về 1 màn check thông tin chuyến xe đưa đón (thông tin xe, vị trí xe hiện tại trên bản đồ realtime). Người dùng có thể truy cập màn thông qua link nhập mã đơn hoặc SĐT sẽ hiện ra các đơn đang hoạt động.
6. Lịch sử đặt đơn (Login)
Xem được danh sách các đơn đã đặt.
7. Thông tin đã thiết lập
Thông tin người dùng: Họ tên, căn cước, ảnh đại diện, thông tin ngân hàng.
Lưu ý: Khi người dùng chưa thiết lập thì sẽ lấy thông tin từ form đơn đặt đầu tiên.
8. Thông báo
Nhận thông báo về các ưu đãi, đơn hàng...
9. Khách sạn ưa thích
10. Hỗ trợ
Hỗ trợ khẩn cấp: Gửi vị trí về cho admin, admin sẽ gọi lại.
Hỗ trợ tư vấn: Hiện lên chat bot, phản ánh về chất lượng dịch vụ, khiếu nại...
II. CHỨC NĂNG DÀNH CHO KHÁCH SẠN
1. Cấu hình khách sạn
Thông tin khách sạn
Số tầng, số phòng, giá, không gian phòng
Dịch vụ: xe đưa đón, giặt là...
2. Đơn đặt phòng realtime
Danh sách đơn đặt phòng, chi tiết đơn, check-in, check-out, đổi trả phòng, gọi xe trả khách về nơi xuất phát.
3. Doanh thu
Báo cáo doanh thu, chi phí, lợi nhuận và các dịch vụ đi kèm.
Chốt phí dịch vụ hệ thống: Đến cuối tháng sẽ phải tổng hợp lại tổng doanh thu từ đơn hàng (không bao gồm các dịch vụ ngoài), phí thu sẽ được cấu hình theo admin.
4. Phân quyền
Chủ khách sạn sẽ được phân quyền cho cấp dưới.
5. Tổng quan
Khách chuẩn bị check-in, check-out, xử lý sau khi khách đi (trạng thái dọn dẹp phòng), tồn phòng.
6. Chốt phí dịch vụ
Sau khi phía admin chốt phí thì khách sạn sẽ phải đóng phí sử dụng hệ thống cho admin thông qua MoMo, dựa trên các đơn thanh toán tại khách sạn.
Chú ý quy định khách sạn:
Khi khách cũ check-out lúc 5:30, và khách mới đặt đơn check-in lúc 5:30 hoặc hơn thì vẫn cho phép đặt.
Khi khách đặt đơn xong, nhưng phòng lại gặp sự cố thì phải thông báo cho khách về sự cố, gửi thông báo xem khách có muốn đổi trả phòng không (không được phép thu thêm phí, yêu cầu phòng đổi phải có chất lượng tốt hơn).
III. CHỨC NĂNG DÀNH CHO ADMIN
1. Quản lý khách sạn
Đăng ký đối tác: Cấu hình thông tin, ngân hàng.
Doanh thu của khách sạn thông qua đơn hàng.
Thông tin khách sạn, số phòng tồn và số phòng có khách.
Lợi nhuận thu phí dịch vụ hệ thống từ các đơn thanh toán tại khách sạn.
2. Hỗ trợ
Hỗ trợ khẩn cấp: Hiển thị vị trí của khách, gọi lại cho khách...
Sau khi khách nhắn tin với chat agent, nhận thông tin và xử lý thông tin của khách (xử lý khiếu nại).
3. Nhật ký thao tác
Log lại hệ thống phục vụ cho việc truy vết từ user, khách sạn...
4. Báo cáo doanh thu từ các khách sạn
