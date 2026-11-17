# Tài khoản thử Airrest theo actor

Tạo bằng `npm run db:seed:accounts -w @airrest/backend` ([seedAccounts.ts](backend/database/scripts/seedAccounts.ts)), chạy lại an toàn. Ghi vào DB mà `backend/.env` đang trỏ tới (có thể là Supabase dùng chung: kiểm tra `DATABASE_URL` trước khi chạy). Chỉ dùng để thử, không dùng dữ liệu thật. Thứ tự dựng dữ liệu đầy đủ: `npm run db:migrate` → `npm run db:seed` → `npm run db:seed:accounts` (chạy lại an toàn; muốn nạp lại danh mục khách sạn trên DB đã có dữ liệu thì thêm `SEED_FORCE=1` cho `db:seed`).

**Mật khẩu chung: `ChangeMe123!`** (giá trị mặc định của `SEED_PASSWORD`). Khách đăng nhập bằng *username*, các actor còn lại bằng *email*.

Từ migration 033, nhân viên khách sạn có bảng liên kết `account_hotels` (một nhân viên làm nhiều khách sạn, mỗi nơi một vai trò). Seed tự điền liên kết cho các tài khoản dưới đây.

## Tài khoản từ `db:seed` (cùng mật khẩu chung, trừ khách `nguoidung`)

| Actor | Tài khoản | Ghi chú |
|---|---|---|
| ADMIN (SYSADMIN) | `admin@demo.airrest.vn` | admin demo |
| ADMIN | `quantri@airrest.mo` (SYSADMIN), `vanhanh@airrest.mo` (OPS), `hotro@airrest.mo` (SUPPORT), `taichinh@airrest.mo` (FINANCE) | từ `seedCatalog` |
| HOTEL (lễ tân) | `letan@demo.airrest.vn` | khách sạn demo `HAN-DEMO-01` (có Tầng 1 + phòng 101–103) |
| HOTEL (chủ/quản lý) | `ql.han01@khachsan.mo`, `ql.sgn01@khachsan.mo`, `ql.dad01@khachsan.mo`, `ql.cxr01@khachsan.mo`, `ql.pqc01@khachsan.mo` | chủ khách sạn, thuộc doanh nghiệp của sân bay tương ứng |
| HOTEL (nhân viên) | `nv.han01@khachsan.mo` | nhân viên HAN-01 (vai trò frontdesk) |
| HOTEL (chủ, không xe) | `ql.han03@khachsan.mo` | từ `seedFleet`, để thử luồng hết xe |
| PASSENGER | `nguoidung` / mật khẩu `Demo@2026` | khách mẫu, có sẵn 2 khách sạn yêu thích (HAN-01, SGN-01) |

Mã giảm giá mẫu (khách xem ở `/tai-khoan`): `WELCOME50` (giảm 50.000đ, đơn từ 300.000đ), `AIR10` (giảm 10%).

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

Các tài khoản `chu.*` là **chủ doanh nghiệp** của sân bay tương ứng (HAN/SGN/DAD/CXR/PQC/HPH): đăng nhập thấy ô chọn khách sạn ở header với mọi khách sạn của doanh nghiệp đó, và thêm nhân viên được vào nhiều khách sạn. Các tài khoản `letan/dondua/phong` chỉ làm ở khách sạn của mình (có thể được chủ gán thêm khách sạn khác).

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

## Doanh nghiệp (seed sẵn)

`db:seed` tạo **22 doanh nghiệp đã duyệt**, mỗi sân bay một doanh nghiệp (mã `BIZ-<IATA>`, ví dụ `BIZ-HAN` "Công ty TNHH Khách sạn Hà Nội (mô phỏng)", MST `0301345601`; `BIZ-SGN` MST `0302345602`; các sân bay khác theo quy luật `03NN345(600+NN)`; email liên hệ `lienhe.<iata>@doanhnghiep.mo`). Mọi khách sạn mã `<IATA>-*` thuộc doanh nghiệp tương ứng; tài khoản chủ (`chu.*`, `ql.*`) được gắn vào doanh nghiệp đó. Doanh nghiệp seed chưa có tài khoản "chủ doanh nghiệp" riêng: dùng `chu.<iata><nn>@khachsan.mo`.

Muốn thử luồng đăng ký → duyệt từ đầu (doanh nghiệp mới): Đăng nhập > tab "Nhân sự" > "Đăng ký doanh nghiệp" (mật khẩu ≥ 12 ký tự, tự đặt); đăng nhập `sysadmin1@airrest.mo` > Quản trị > Doanh nghiệp > Duyệt; chủ đăng nhập bằng email vừa đăng ký > "Khách sạn của tôi" > Tạo khách sạn > Gửi hồ sơ; admin duyệt từng khách sạn ở tab Khách sạn. Thử trên DB cục bộ (Postgres nhúng cổng 54329), không dùng DB dùng chung.

## Nhân viên làm nhiều khách sạn

Không nằm trong seed (mỗi lần thử tạo mới): đăng nhập `chu.han01@khachsan.mo` > Nhân viên > Thêm nhân viên > tích thêm khách sạn khác (mỗi khách sạn một ô chọn vai trò) > lưu, ghi lại mật khẩu tạm (hiện một lần). Nhân viên đó đăng nhập sẽ có ô chuyển khách sạn ở header; quyền theo vai trò của khách sạn đang chọn. Có sẵn bài E2E `tests/staff-multi-hotel.e2e.ts` (chạy bằng `APP_URL=... npx e2e run tests/staff-multi-hotel.e2e.ts` trên stack cục bộ).

## Nhân viên thử do chủ khách sạn tạo (cổng Khách sạn › Nhân sự)

Không nằm trong seed: đăng nhập `chu.han01@khachsan.mo` (mật khẩu thử như trên), vào Vai trò và phân quyền tạo vai trò "Lễ tân ca đêm" (quyền `booking:read`, `booking:checkin`), rồi Nhân viên › Thêm nhân viên (ví dụ `dem.han01@khachsan.mo`, vai trò đó, nút "Sinh ngẫu nhiên" để lấy mật khẩu tạm, hiện một lần). Nhân viên này chỉ thấy Đặt phòng/Phòng/Tồn phòng/Chi trả/Doanh thu và Cài đặt cá nhân, không thấy tab Nhân viên hay Vai trò. Mọi nhân sự đổi mật khẩu/hồ sơ ở Cài đặt cá nhân (menu người dùng).
