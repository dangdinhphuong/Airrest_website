# Tài khoản thử Airrest theo actor

Tạo bằng `npm run db:seed:accounts -w @airrest/backend` ([seedAccounts.ts](backend/database/scripts/seedAccounts.ts)), chạy lại an toàn. Đã ghi vào DB trong `backend/.env` (Supabase, dùng chung): chỉ dùng để thử, không dùng dữ liệu thật.

**Mật khẩu chung: `ChangeMe123!`** (giá trị mặc định của `SEED_PASSWORD`). Khách đăng nhập bằng *username*, các actor còn lại bằng *email*.

Lưu ý: tài khoản có sẵn từ seed cũ (`admin@demo.airrest.vn`, `ql.han01@khachsan.mo`, `nv.han01@khachsan.mo`, `quantri@airrest.mo`…) không nằm trong file này.

## Khách (PASSENGER)

| Username | Họ tên |
|---|---|
| `khach01` | Khách thử 1 |
| `khach02` | Khách thử 2 |
| `khach03` | Khách thử 3 |
| `khach04` | Khách thử 4 |
| `khach05` | Khách thử 5 |
| `khach06` | Khách thử 6 |
| `khach07` | Khách thử 7 |
| `khach08` | Khách thử 8 |
| `khach09` | Khách thử 9 |
| `khach10` | Khách thử 10 |

## Quản trị Airrest (ADMIN)

### SYSADMIN

| Email | Họ tên |
|---|---|
| `sysadmin1@airrest.mo` | Quản trị hệ thống 1 |
| `sysadmin2@airrest.mo` | Quản trị hệ thống 2 |
| `sysadmin3@airrest.mo` | Quản trị hệ thống 3 |

### OPS

| Email | Họ tên |
|---|---|
| `ops1@airrest.mo` | Điều phối xe 1 |
| `ops2@airrest.mo` | Điều phối xe 2 |
| `ops3@airrest.mo` | Điều phối xe 3 |

### SUPPORT

| Email | Họ tên |
|---|---|
| `support1@airrest.mo` | CSKH 1 |
| `support2@airrest.mo` | CSKH 2 |
| `support3@airrest.mo` | CSKH 3 |

### FINANCE

| Email | Họ tên |
|---|---|
| `finance1@airrest.mo` | Kế toán 1 |
| `finance2@airrest.mo` | Kế toán 2 |
| `finance3@airrest.mo` | Kế toán 3 |

## Khách sạn (HOTEL): nhóm theo khách sạn

### Sao Mai Airport Hotel (HAN-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.han01@khachsan.mo` | Chủ HAN-01 | hotel_owner (chủ khách sạn) |
| `letan.han01@khachsan.mo` | Lễ tân HAN-01 | reception (Lễ tân) |
| `dondua.han01@khachsan.mo` | NV đưa đón HAN-01 | frontdesk (NV đưa đón) |
| `phong.han01@khachsan.mo` | Quản lý phòng HAN-01 | room_manager (Quản lý phòng) |

### Trăng Non Stay (HAN-02)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.han02@khachsan.mo` | Chủ HAN-02 | hotel_owner (chủ khách sạn) |
| `letan.han02@khachsan.mo` | Lễ tân HAN-02 | reception (Lễ tân) |
| `dondua.han02@khachsan.mo` | NV đưa đón HAN-02 | frontdesk (NV đưa đón) |
| `phong.han02@khachsan.mo` | Quản lý phòng HAN-02 | room_manager (Quản lý phòng) |

### Ánh Dương Airport Stay (SGN-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.sgn01@khachsan.mo` | Chủ SGN-01 | hotel_owner (chủ khách sạn) |
| `letan.sgn01@khachsan.mo` | Lễ tân SGN-01 | reception (Lễ tân) |
| `dondua.sgn01@khachsan.mo` | NV đưa đón SGN-01 | frontdesk (NV đưa đón) |
| `phong.sgn01@khachsan.mo` | Quản lý phòng SGN-01 | room_manager (Quản lý phòng) |

### Dừa Xiêm Hotel (SGN-02)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.sgn02@khachsan.mo` | Chủ SGN-02 | hotel_owner (chủ khách sạn) |
| `letan.sgn02@khachsan.mo` | Lễ tân SGN-02 | reception (Lễ tân) |
| `dondua.sgn02@khachsan.mo` | NV đưa đón SGN-02 | frontdesk (NV đưa đón) |
| `phong.sgn02@khachsan.mo` | Quản lý phòng SGN-02 | room_manager (Quản lý phòng) |

### Đà Nẵng Airport Hotel (DAD-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.dad01@khachsan.mo` | Chủ DAD-01 | hotel_owner (chủ khách sạn) |
| `letan.dad01@khachsan.mo` | Lễ tân DAD-01 | reception (Lễ tân) |
| `dondua.dad01@khachsan.mo` | NV đưa đón DAD-01 | frontdesk (NV đưa đón) |
| `phong.dad01@khachsan.mo` | Quản lý phòng DAD-01 | room_manager (Quản lý phòng) |

### Cam Ranh Airport Hotel (CXR-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.cxr01@khachsan.mo` | Chủ CXR-01 | hotel_owner (chủ khách sạn) |
| `letan.cxr01@khachsan.mo` | Lễ tân CXR-01 | reception (Lễ tân) |
| `dondua.cxr01@khachsan.mo` | NV đưa đón CXR-01 | frontdesk (NV đưa đón) |
| `phong.cxr01@khachsan.mo` | Quản lý phòng CXR-01 | room_manager (Quản lý phòng) |

### Phú Quốc Airport Hotel (PQC-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.pqc01@khachsan.mo` | Chủ PQC-01 | hotel_owner (chủ khách sạn) |
| `letan.pqc01@khachsan.mo` | Lễ tân PQC-01 | reception (Lễ tân) |
| `dondua.pqc01@khachsan.mo` | NV đưa đón PQC-01 | frontdesk (NV đưa đón) |
| `phong.pqc01@khachsan.mo` | Quản lý phòng PQC-01 | room_manager (Quản lý phòng) |

### Cát Bi Airport Hotel (HPH-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `chu.hph01@khachsan.mo` | Chủ HPH-01 | hotel_owner (chủ khách sạn) |
| `letan.hph01@khachsan.mo` | Lễ tân HPH-01 | reception (Lễ tân) |
| `dondua.hph01@khachsan.mo` | NV đưa đón HPH-01 | frontdesk (NV đưa đón) |
| `phong.hph01@khachsan.mo` | Quản lý phòng HPH-01 | room_manager (Quản lý phòng) |

## Tài xế khách sạn (DRIVER): nhóm theo khách sạn

### Sao Mai Airport Hotel (HAN-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.han01.1@airrest.vn` | Tài xế HAN-01 1 | hotel_driver (tài xế) |
| `taixe.han01.2@airrest.vn` | Tài xế HAN-01 2 | hotel_driver (tài xế) |

### Trăng Non Stay (HAN-02)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.han02.1@airrest.vn` | Tài xế HAN-02 1 | hotel_driver (tài xế) |
| `taixe.han02.2@airrest.vn` | Tài xế HAN-02 2 | hotel_driver (tài xế) |

### Ánh Dương Airport Stay (SGN-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.sgn01.1@airrest.vn` | Tài xế SGN-01 1 | hotel_driver (tài xế) |
| `taixe.sgn01.2@airrest.vn` | Tài xế SGN-01 2 | hotel_driver (tài xế) |

### Dừa Xiêm Hotel (SGN-02)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.sgn02.1@airrest.vn` | Tài xế SGN-02 1 | hotel_driver (tài xế) |
| `taixe.sgn02.2@airrest.vn` | Tài xế SGN-02 2 | hotel_driver (tài xế) |

### Đà Nẵng Airport Hotel (DAD-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.dad01.1@airrest.vn` | Tài xế DAD-01 1 | hotel_driver (tài xế) |
| `taixe.dad01.2@airrest.vn` | Tài xế DAD-01 2 | hotel_driver (tài xế) |

### Cam Ranh Airport Hotel (CXR-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.cxr01.1@airrest.vn` | Tài xế CXR-01 1 | hotel_driver (tài xế) |
| `taixe.cxr01.2@airrest.vn` | Tài xế CXR-01 2 | hotel_driver (tài xế) |

### Phú Quốc Airport Hotel (PQC-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.pqc01.1@airrest.vn` | Tài xế PQC-01 1 | hotel_driver (tài xế) |
| `taixe.pqc01.2@airrest.vn` | Tài xế PQC-01 2 | hotel_driver (tài xế) |

### Cát Bi Airport Hotel (HPH-01)

| Email | Họ tên | Vai trò |
|---|---|---|
| `taixe.hph01.1@airrest.vn` | Tài xế HPH-01 1 | hotel_driver (tài xế) |
| `taixe.hph01.2@airrest.vn` | Tài xế HPH-01 2 | hotel_driver (tài xế) |

## Đơn vị chi trả (PAYER): nhóm theo đơn vị/trạm

### Vietnam Airlines (thử), mọi trạm

| Email | Họ tên | Vai trò |
|---|---|---|
| `dv.vna@chitra.mo` | Quản lý VNA (cấp đơn vị) | payer_staff |

### Vietnam Airlines (thử), Trạm Nội Bài (HAN)

| Email | Họ tên | Vai trò |
|---|---|---|
| `nv1.vna.han@chitra.mo` | NV VNA HAN 1 | payer_staff |
| `nv2.vna.han@chitra.mo` | NV VNA HAN 2 | payer_staff |

### Vietnam Airlines (thử), Trạm Tân Sơn Nhất (SGN)

| Email | Họ tên | Vai trò |
|---|---|---|
| `nv1.vna.sgn@chitra.mo` | NV VNA SGN 1 | payer_staff |
| `nv2.vna.sgn@chitra.mo` | NV VNA SGN 2 | payer_staff |

### Vietjet Air (thử), mọi trạm

| Email | Họ tên | Vai trò |
|---|---|---|
| `dv.vj@chitra.mo` | Quản lý VJ (cấp đơn vị) | payer_staff |

### Vietjet Air (thử), Trạm Nội Bài (HAN)

| Email | Họ tên | Vai trò |
|---|---|---|
| `nv1.vj.han@chitra.mo` | NV VJ HAN 1 | payer_staff |
| `nv2.vj.han@chitra.mo` | NV VJ HAN 2 | payer_staff |

### Vietjet Air (thử), Trạm Đà Nẵng (DAD)

| Email | Họ tên | Vai trò |
|---|---|---|
| `nv1.vj.dad@chitra.mo` | NV VJ DAD 1 | payer_staff |
| `nv2.vj.dad@chitra.mo` | NV VJ DAD 2 | payer_staff |

### SAGS Mặt đất (thử), mọi trạm

| Email | Họ tên | Vai trò |
|---|---|---|
| `dv.sags@chitra.mo` | Quản lý SAGS (cấp đơn vị) | payer_staff |

### SAGS Mặt đất (thử), Trạm Tân Sơn Nhất (SGN)

| Email | Họ tên | Vai trò |
|---|---|---|
| `nv1.sags.sgn@chitra.mo` | NV SAGS SGN 1 | payer_staff |
| `nv2.sags.sgn@chitra.mo` | NV SAGS SGN 2 | payer_staff |

## Doanh nghiệp thử (nhiều khách sạn)

Dựng bằng giao diện, không cần seed riêng: (1) Đăng nhập > tab "Nhân sự" > "Đăng ký doanh nghiệp", điền hồ sơ (mật khẩu ≥ 12 ký tự, tự đặt cho tài khoản thử); (2) đăng nhập `sysadmin1@airrest.mo` (mật khẩu chung `ChangeMe123!`) > Quản trị > Doanh nghiệp > mở hồ sơ > Duyệt; (3) chủ đăng nhập bằng email vừa đăng ký > "Khách sạn của tôi" > Tạo khách sạn (làm 2 cái) > Gửi hồ sơ; (4) admin duyệt từng khách sạn ở tab Khách sạn; (5) chủ chuyển khách sạn ở ô chọn trên header, xem "Báo cáo doanh thu" (khách sạn đang chọn và "Tổng doanh nghiệp"). Muốn có số liệu thử: chuyển vài đơn seed sang khách sạn mới bằng SQL trên DB thử (đổi `bookings.hotel_id`, đặt một số đơn `CHECKED_OUT`). Không dùng DB Supabase dùng chung cho việc này (chưa có migration 030).

## Nhân viên thử do chủ khách sạn tạo (cổng Khách sạn › Nhân sự)

Không nằm trong seed: đăng nhập `chu.han01@khachsan.mo` (mật khẩu thử như trên), vào Vai trò và phân quyền tạo vai trò "Lễ tân ca đêm" (quyền `booking:read`, `booking:checkin`), rồi Nhân viên › Thêm nhân viên (ví dụ `dem.han01@khachsan.mo`, vai trò đó, nút "Sinh ngẫu nhiên" để lấy mật khẩu tạm, hiện một lần). Nhân viên này chỉ thấy Đặt phòng/Phòng/Tồn phòng/Chi trả/Doanh thu và Cài đặt cá nhân, không thấy tab Nhân viên hay Vai trò. Mọi nhân sự đổi mật khẩu/hồ sơ ở Cài đặt cá nhân (menu người dùng).
