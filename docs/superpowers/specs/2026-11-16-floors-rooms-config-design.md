# Cấu hình tầng / phòng / ảnh (khách sạn)

Migration `027_floors_rooms.sql`. Giao diện: tab Phòng của cổng khách sạn (`Rooms.jsx`, `RoomUnits.jsx`, `ImagePicker.jsx`). Khách đặt phòng không đổi.

## Mô hình dữ liệu
- `floors`: id, hotel_id, name, level (-5..200), sort_order, note; unique (hotel_id, level).
- `rooms`: id, hotel_id, floor_id, room_type_id, number (unique theo hotel_id), status ACTIVE/INACTIVE, note, các trường ghi đè tùy chọn (view, smoking, max_adults, max_children, amenities_extra; null = theo loại phòng), images jsonb (khóa R2, tối đa 5, phần tử đầu = ảnh bìa).
- `room_types` thêm: description, view, amenities text[] (mã hằng số `ROOM_AMENITY_CODES` ở `packages/validation/src/rooms.ts`), smoking, max_adults, max_children, images jsonb (tối đa 10, ảnh đầu = bìa). `bed_type`, `connecting`, `family`, `capacity`, `beds`, `area_m2` giữ nguyên.
- Tồn kho vẫn đếm theo loại (`room_types.total_rooms`). Đơn KHÔNG gán vào phòng cụ thể; giá/chính sách không đổi.

## Quy tắc đồng bộ tồn
- Loại phòng chưa có dòng nào trong `rooms`: hành vi cũ, nhập tay `totalRooms`.
- Loại đã có >= 1 dòng `rooms` (kể cả INACTIVE): `total_rooms` = số phòng ACTIVE, tự cập nhật trong cùng transaction khi tạo/sửa (status, chuyển loại)/xóa phòng (`syncTotal` ở `services/rooms/roomUnits.ts`).
- Trước khi giảm: khóa dòng `room_types` (`lockRoomType`, cùng khóa với đặt phòng) và so với `peakCommitted`; thấp hơn thì 409 `ROOM_TOTAL_BELOW_RESERVED`, cả transaction rollback. Chuyển phòng giữa hai loại khóa theo thứ tự id.
- `PATCH /room-types/:id` đổi `totalRooms` khi loại đã có phòng: 409 `TOTAL_MANAGED_BY_ROOMS` (giá trị không đổi thì cho qua). Response loại phòng có `roomCount`, `managedByRooms`.
- Thêm phòng ĐẦU TIÊN cho loại đang nhập tay (vd total 10) đặt total = 1 (số phòng ACTIVE); nên thêm hàng loạt đủ số phòng.
- Xóa phòng cuối cùng của loại: loại về chế độ nhập tay, `total_rooms` giữ giá trị sau lần đồng bộ trước.

## API (xem = `booking:read`, ghi = `room:manage`, khóa hotelId bằng `resolveHotelId`)
`/v1/hotel/floors` (GET/POST, PATCH/DELETE `/:id`; xóa tầng còn phòng -> 409 `FLOOR_HAS_ROOMS`; trùng số tầng -> 409 `FLOOR_LEVEL_TAKEN`), `/v1/hotel/rooms` (GET lọc floorId/roomTypeId, POST, `POST /bulk` theo dải số tối đa 100 phòng tất cả-hoặc-không, PATCH/DELETE `/:id`; trùng số -> 409 `ROOM_NUMBER_TAKEN`). Ảnh loại phòng/phòng cập nhật qua `images` (mảng khóa có thứ tự) của PATCH, trả về dạng `{key, url}` như `imageViews`. Ảnh tải lên bằng `/v1/hotel/media/upload-url` với `folder: 'rooms'`. Xóa phòng là xóa cứng (không bảng nào tham chiếu; lịch sử còn ở audit); muốn giữ dấu vết thì đặt `status: INACTIVE`. Ghi audit `FLOOR.*`, `ROOM.*`.

## Giới hạn đã biết
- Khóa ảnh do server cấp ngẫu nhiên và không chứa hotel_id, nên chưa kiểm được khóa ảnh thuộc đúng khách sạn (giống ảnh hồ sơ khách sạn); chỉ kiểm dạng `rooms/<năm>/<uuid>.<jpg|png|webp>`. Kích thước ảnh chỉ kiểm theo số client khai.
- Tồn kho không theo từng phòng: ngừng một phòng cụ thể không chặn ngày cụ thể nào, chỉ giảm tổng.
- Khách đặt phòng (UI/API công khai) chưa hiển thị mô tả/tiện nghi/ảnh mới.
