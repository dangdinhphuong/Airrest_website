# -*- coding: utf-8 -*-
"""Bộ case chuẩn theo LOẠI CONTROL — dùng để bơm mục còn thiếu so với định mức.

Mỗi mục: (khoá nhận diện, Mục đích, Các bước, Kết quả mong muốn).
`{f}` = tên trường/nhãn UI, rút từ tên nhóm. Khoá nhận diện KHỚP với `audit_content.py`
và `audit_validate_quota.py` để chạy lại ra 0 (không sinh trùng).

Chuẩn nội dung: cột Kết quả tiếng Việt tự nhiên, KHÔNG tên bảng/cột/enum/route/thuật ngữ.
Chi tiết định mức: ../luat/DINH-MUC-VALIDATE-testcase.md §3
"""
import unicodedata


def norm_bo_dau(s):
    """Chữ thường, bỏ dấu — chỉ dùng nội bộ để so tên cột (`Hành động` -> `hanh dong`).

    File này CỐ Ý không import `qalib`: `qalib` đã import `quota_cases` ở nhánh định mức, thêm
    chiều ngược lại là vòng import. Bản rút gọn 4 dòng rẻ hơn việc tách một module thứ ba.
    """
    s = (s or '').replace('đ', 'd').replace('Đ', 'D')
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower())
                   if unicodedata.category(c) != 'Mn').strip()


# ══════════════════════════════════════════════════════════════════════════════════════════
# BẢN CHỮ CỘT D LẤY THEO MẪU `DanhMucTuDienDungChung.xlsx` (chỉ thị 2026-09-11 lượt 5)
# Chỉ thị: *"tham khảo mẫu để lấy mẫu câu kết quả mong muốn cho hợp lý rồi vá vào tool"*.
# Đối chiếu 464 case của mẫu với các bank dưới đây: mẫu dùng CÂU NGẮN, ĐÓNG, lặp lại y hệt ở
# mọi màn — `Checkbox được tích chọn` · `1. Thông báo lỗi "Vui lòng nhập <Nhãn>" / 2. Highlight,
# focus vào trường lỗi`. Bank cũ viết diễn giải dài hơn và thêm mệnh đề điều kiện
# (`; các thành phần phụ thuộc hiện ra nếu có`) — vừa lệch mẫu vừa dính dấu `;` mà §8.2.1 cấm.
#
# ⛔ HAI CHỖ CỐ Ý KHÔNG LẤY THEO MẪU:
#   · **zoom in / zoom out** — mẫu ghi NGƯỢC NGHĨA (zoom in -> "nhỏ lại"); bản đúng ở
#     `qalib.ZOOM_D`, phép rà ⑨ giữ. Xem §5.5.
#   · **`{f}` thay cho nhãn cứng** — mẫu ghi thẳng `"Vui lòng nhập Mã từ điển dùng chung"` vì
#     mẫu chỉ có một màn; bank phải để chỗ điền, nếu không mọi màn đều mang tên trường của mẫu.
# ══════════════════════════════════════════════════════════════════════════════════════════
TEXTBOX = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định {f}',
     '1. Mở biểu mẫu, xem ô "{f}".',
     'Mặc định là trống.',
    ),
    (
     'bat buoc',
     'Kiểm tra {f} là trường bắt buộc',
     '1. Để trống ô "{f}".\n2. Các thông tin khác nhập hợp lệ.\n3. Bấm nút lưu.',
     '1. Thông báo lỗi "Vui lòng nhập {f}"\n'
     '2. Highlight, focus vào trường lỗi',
    ),
    (
     # Khuôn cột D do người đặt việc chốt 2026-09-10 (*"phần kết quả mong muốn chưa đúng"*):
     # nêu THÔNG BÁO LỖI + HIGHLIGHT/FOCUS, rồi nhánh "hoặc chặn ngay khi nhập" — bản cũ
     # ("Báo lỗi vượt độ dài cho phép, hoặc ô không cho nhập thêm quá giới hạn") gộp cả hai
     # vào một câu nên người chạy test không biết phải soát con trỏ có nhảy vào ô lỗi không.
     'vuot do dai',
     'Kiểm tra {f} nhập vượt độ dài cho phép',
     '1. Dán vào ô "{f}" một chuỗi dài hơn giới hạn cho phép.\n2. Bấm nút lưu.',
     '1. Thông báo lỗi "{f} tối đa <số ký tự tối đa> ký tự"\n'
     '2. Highlight, focus vào trường lỗi\n'
     'Hoặc hệ thống không cho nhập quá <số ký tự tối đa> ký tự',
    ),
    (
     'trong do dai',
     'Kiểm tra {f} nhập trong độ dài cho phép',
     '1. Nhập "{f}" dài đúng bằng giới hạn cho phép.\n2. Các thông tin khác nhập hợp lệ.\n3. Bấm nút lưu.',
     'Lưu thành công',
    ),
    (
     'ky tu dac biet',
     'Kiểm tra {f} nhập ký tự đặc biệt, thẻ html, script',
     '1. Nhập vào ô "{f}" chuỗi có ký tự đặc biệt và thẻ html.\n2. Lưu rồi mở lại xem.',
     '1. Thực hiện thành công\n'
     '2. Các ký tự đặc biệt, thẻ html không bị mã hóa khi view lên và khi lưu vào database',
    ),
    (
     'nhap so',
     'Kiểm tra {f} nhập số',
     '1. Nhập vào ô "{f}" chuỗi chỉ gồm chữ số.',
     '1. Dữ liệu của trường được hiển thị bình thường',
    ),
    (
     'khoang trang hai dau',
     'Kiểm tra {f} cắt khoảng trắng hai đầu',
     '1. Nhập "{f}" có khoảng trắng ở đầu và cuối.\n2. Bấm nút lưu.',
     'Hệ thống tự cắt khoảng trắng hai đầu trước khi lưu.',
    ),
    (
     'copy',
     'Kiểm tra copy dữ liệu dán vào ô {f}',
     '1. Sao chép một đoạn chữ từ nơi khác, dán vào ô "{f}".',
     'Dán thành công, chữ hiển thị bình thường, không lỗi phông.',
    ),
    (
     'tieng viet',
     'Kiểm tra {f} nhập tiếng Việt có dấu',
     '1. Nhập "{f}" bằng tiếng Việt có dấu.\n2. Lưu rồi mở lại xem.',
     '1. Thực hiện thành công\n2. Dữ liệu được view lên bình thường, không bị lỗi font',
    ),
]

# §5.3 — 7 mục ĐẦU là bộ CỦA MẪU, đúng thứ tự: giá trị mặc định · ký tự đặc biệt/html/script ·
# nhập số · COPY-PASTE · tiếng Việt có dấu · tiếng Việt không dấu · Trim space.
# ⚠️ 2026-09-07: trước đây `rat dai` và `de trong` (mục riêng dự án) nằm ở vị trí 2 và 5 nên
# với định mức 7 thì mục COPY-PASTE của mẫu bị đẩy ra ngoài -> mọi ô tìm kiếm đều THIẾU nó.
# Mục riêng dự án phải xếp SAU bộ mẫu.
SEARCHBOX = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định ô {f}',
     '1. Mở màn, xem ô "{f}".',
     'Ô trống, có chữ gợi ý nội dung cần tìm.'),
    ('ky tu dac biet', 'Kiểm tra ô {f} nhập ký tự đặc biệt, thẻ html, script',
     '1. Nhập vào ô "{f}" chuỗi có ký tự đặc biệt và thẻ html.',
     'Hệ thống tìm bình thường. Chuỗi vừa nhập hiển thị nguyên dạng, không bị thực thi.'),
    ('nhap so vao o tim', 'Kiểm tra ô {f} nhận số',
     '1. Nhập một chuỗi toàn chữ số vào ô "{f}".',
     'Ô tìm nhận chuỗi số bình thường như mọi ký tự khác, tìm theo đúng từ khoá đã nhập.'),
    ('copy paste vao o tim', 'Kiểm tra copy nội dung dữ liệu, dán vào ô {f}',
     '1. Sao chép một từ khoá hợp lệ.\n2. Dán vào ô "{f}".',
     'Ô nhận đúng nội dung vừa dán, không lỗi font, tìm ra đúng kết quả tương ứng.'),
    ('tieng viet co dau', 'Kiểm tra ô {f} tìm bằng tiếng Việt có dấu',
     '1. Nhập từ khoá tiếng Việt có dấu vào ô "{f}".',
     'Hệ thống trả về đúng kết quả tương ứng, hiển thị đúng dấu tiếng Việt, không lỗi font.'),
    ('tieng viet khong dau', 'Kiểm tra ô {f} tìm bằng tiếng Việt không dấu',
     '1. Nhập từ khoá tiếng Việt không dấu vào ô "{f}".',
     'Hệ thống vẫn trả về đúng kết quả tương ứng, không phân biệt có dấu hay không dấu.'),
    ('khoang trang hai dau', 'Kiểm tra ô {f} cắt khoảng trắng hai đầu',
     '1. Nhập từ khoá có khoảng trắng ở đầu và cuối.',
     'Hệ thống tự cắt khoảng trắng hai đầu trước khi tìm và vẫn trả về đúng kết quả.'),
    ('rat dai', 'Kiểm tra nhập chuỗi rất dài vào ô {f}',
     '1. Dán vào ô "{f}" một chuỗi khoảng 1.000 ký tự.',
     'Hiện thông báo không tìm thấy kết quả, giao diện không bị vỡ và không báo lỗi hệ thống.'),
    ('de trong', 'Kiểm tra để trống ô {f}',
     '1. Nhập từ khoá để lọc.\n2. Xoá hết nội dung ô "{f}".',
     'Ô tìm không bắt buộc. Khi để trống danh sách trở lại đầy đủ như trước khi tìm.'),
]

NUMBOX = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định {f}',
     '1. Mở biểu mẫu, xem ô "{f}".',
     'Mặc định là trống.',
    ),
    (
     # 2026-09-09: tiêu đề cũ 'Kiểm tra {f} là trường bắt buộc' KHẲNG ĐỊNH ô là bắt buộc.
     # Đo trên màn `Danh mục trình độ ngoại ngữ`: ô `Thứ tự hiển thị` KHÔNG bắt buộc (mã nguồn
     # không gắn ràng buộc nào) ⇒ tiêu đề case SAI. Cột D đã có lối thoát "nếu là trường không
     # bắt buộc thì lưu thành công" nên KHÔNG phép rà nào kêu — chỉ tiêu đề là sai.
     # Nay tiêu đề TRUNG TÍNH, cột D nêu rõ CẢ HAI nhánh để người chạy đối chiếu ràng buộc thật.
     'bat buoc',
     'Kiểm tra {f} khi để trống',
     '1. Để trống ô "{f}".\n2. Nhập, chọn hợp lệ các trường còn lại.\n3. Bấm nút lưu.',
     '- Là trường bắt buộc: báo lỗi yêu cầu nhập {f}, không lưu bản ghi nào.\n- Là trường không bắt buộc: lưu thành công, giá trị để rỗng.',
    ),
    (
     'gia tri 0',
     'Kiểm tra {f} nhập giá trị = 0',
     '1. Nhập 0 vào ô "{f}".\n2. Bấm nút lưu.',
     'Hệ thống nhận 0 nếu nghiệp vụ cho phép, ngược lại báo giá trị phải lớn hơn 0.',
    ),
    (
     'vuot do dai',
     'Kiểm tra {f} nhập quá 18 chữ số',
     '1. Nhập vào ô "{f}" giá trị dài hơn 18 chữ số.',
     'Hệ thống chặn hoặc báo vượt giới hạn cho phép, không lưu giá trị sai lệch.',
    ),
    (
     'so am',
     'Kiểm tra {f} nhập số âm',
     '1. Nhập dấu trừ rồi nhập số vào ô "{f}".',
     'Không cho phép nhập',
    ),
    (
     'thap phan',
     'Kiểm tra {f} nhập số thập phân',
     '1. Nhập vào ô "{f}" giá trị có phần thập phân.',
     'Hệ thống không cho nhập phần thập phân, chỉ nhận số nguyên.',
    ),
    (
     'nhap chu',
     'Kiểm tra {f} nhập chữ và ký tự đặc biệt',
     '1. Nhập chữ, sau đó nhập ký tự đặc biệt vào ô "{f}".',
     'Ô chỉ nhận chữ số, phần chữ và ký tự đặc biệt bị bỏ.',
    ),
    (
     'copy',
     'Kiểm tra copy dữ liệu dán vào ô {f}',
     '1. Sao chép chuỗi vừa có chữ vừa có số, dán vào ô "{f}".',
     'Ô chỉ nhận phần chữ số.',
    ),
    (
     'khoang trang hai dau',
     'Kiểm tra ô {f} cắt khoảng trắng hai đầu',
     '1. Dán vào ô "{f}" giá trị có khoảng trắng ở hai đầu.',
     'Hệ thống không nhận khoảng trắng, giá trị được hiểu đúng là số đã nhập.',
    ),
    (
     'tieng viet co dau chi nhan so',
     'Kiểm tra {f} nhập tiếng Việt có dấu',
     '1. Nhập chữ tiếng Việt có dấu vào ô "{f}".',
     'Ô chỉ nhận chữ số, phần chữ tiếng Việt có dấu bị bỏ.',
    ),
    (
     'duoi nguong do dai',
     'Kiểm tra {f} nhập đúng hoặc dưới ngưỡng độ dài cho phép',
     '1. Nhập vào ô "{f}" giá trị đủ chữ số trong ngưỡng cho phép.\n2. Bấm nút lưu.',
     'Lưu thành công, giá trị hiển thị đúng như đã nhập.',
    ),
]

# Chỉ thị người đặt việc 2026-09-12: *"validate textarea kiểm tra giống như textbox, CHỈ THÊM
# case kiểm tra nhập nhiều dòng"* ⇒ Textarea = **trọn bộ Textbox + ĐÚNG MỘT case**.
# Bỏ `rat dai` (`nhập nội dung rất dài`): đó là case thứ HAI, không có trong chỉ thị. Nó cũng
# trùng việc với `vuot do dai` vốn đã có ở bộ Textbox.
# ⚠️ Định mức `Textarea` ở `qalib.QUOTA` phải bằng **len(TEXTBOX) + 1**; để lệch (9 vs bank 11)
# thì `patch_quota` CẮT BỚT đúng 2 mục cuối — đo 2026-09-12: cả 4 nhóm Textarea của bộ
# `ChuyenVien` mất hẳn `copy dữ liệu dán vào ô` và `nhập tiếng Việt có dấu`, mà 13 bộ rà báo 0
# vì `audit_validate_quota` chỉ bắt DƯỚI định mức, mà định mức lại đang đặt sai.
TEXTAREA = TEXTBOX[:6] + [
    ('nhieu dong', 'Kiểm tra {f} nhập nhiều dòng',
     '1. Nhập "{f}" gồm nhiều dòng, dùng Enter để xuống dòng.\n2. Lưu rồi mở lại xem.',
     'Ô nhận nhiều dòng. Khi mở lại các dòng vẫn giữ đúng vị trí xuống dòng như khi nhập.'),
] + TEXTBOX[6:]

# ⛔ LUẬT CỨNG ① — xem `qalib` mục "0a. LUẬT CỨNG UI". Bản chữ cột D của case *giá trị mặc
# định* ở đây phải TRÙNG `qalib.kq_mac_dinh_chuan(<nhóm>, 'them')`; `audit_luat_cung.py` rà
# đúng chỗ này để bank không âm thầm trôi khỏi luật (cùng cơ chế phép ㉕ "bank lệch bản chữ mẫu").
SELECTBOX = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định {f}',
     '1. Mở màn, xem ô "{f}".',
     'Mặc định là "-- Chọn --". Ô không tự chọn giá trị đầu tiên của danh sách.',
    ),
    (
     'gia tri',
     'Kiểm tra các giá trị có trong {f}',
     '1. Bấm mở ô "{f}".',
     'Danh sách hiện đầy đủ các giá trị đang được khai báo trong hệ thống.',
    ),
    (
     'sap xep',
     'Kiểm tra sắp xếp các giá trị trong {f}',
     '1. Mở danh sách và xem thứ tự các giá trị.',
     'Các giá trị được xếp theo thứ tự nhất quán, không xáo trộn giữa các lần mở.',
    ),
    (
     'chon ',
     'Kiểm tra chọn các giá trị khác nhau trong {f}',
     '1. Chọn lần lượt các giá trị khác nhau.',
     'Chỉ chọn được một giá trị. Ô hiển thị giá trị được chọn sau cùng.',
    ),
    (
     'qua dai',
     'Kiểm tra hiển thị {f} khi giá trị quá dài',
     '1. Chọn giá trị có nhãn dài nhất và quan sát ô.',
     'Độ rộng ô không thay đổi theo độ dài nhãn. Nhãn dài quá khổ được cắt bớt và hiện dấu ba chấm.',
    ),
    (
     'can le',
     'Kiểm tra căn lề các giá trị trong {f}',
     '1. Mở danh sách và xem cách căn lề các giá trị.',
     'Các giá trị trong danh sách được căn lề trái.',
    ),
]

CHECKBOX = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định {f}',
     '1. Mở biểu mẫu, xem ô "{f}".', 'Mặc định là không tích chọn checkbox'),
    ('o hoac nhan', 'Kiểm tra click vào ô hoặc nhãn {f}',
     '1. Bấm vào ô vuông.\n2. Bấm vào phần nhãn chữ bên cạnh.',
     'Ô checkbox được bỏ chọn hoặc tích chọn'),
    ('tich chon', 'Kiểm tra tích chọn {f}',
     '1. Tích chọn ô "{f}".', 'Checkbox được tích chọn'),
    ('bo tich', 'Kiểm tra bỏ tích chọn {f}',
     '1. Bỏ tích ô "{f}".', 'Checkbox được bỏ tích chọn'),
    ('phim tat', 'Kiểm tra dùng bàn phím với {f}',
     '1. Nhấn Tab tới ô "{f}".\n2. Nhấn phím cách.', 'Checkbox thay đổi trạng thái.'),
]

# ẢNH 4 — bộ Upload ảnh VERBATIM mẫu, 9 mục.
UPLOAD_IMG = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định',
     'Kiểm tra giá trị mặc định của trường này',
     'Mặc định là không có ảnh nào.',
    ),
    (
     'bat buoc',
     'Kiểm tra là trường bắt buộc',
     '1. Không up ảnh\n2. Các thông tin khác được nhập hợp lệ\n3. Click lưu lại',
     '1. Thông báo lỗi "Vui lòng chọn {f}"\n2. Highlight, focus vào trường lỗi',
    ),
    (
     'dinh dang hop le',
     'Kiểm tra chức năng tải ảnh với các tập tin có định dạng hợp lệ',
     '1. Tải ảnh upload có định dạng hợp lệ\n2. Các trường khác nhập hợp lệ\n3. Click Lưu',
     'Thêm mới thành công',
    ),
    (
     'dinh dang gia',
     'Kiểm tra upload có định dạng giả',
     '1. Up ảnh có định dạng giả (đổi đuôi tệp)\n2. Các trường khác nhập hợp lệ\n3. Click Lưu',
     '1. Thông báo: "ảnh không hợp lệ !"\n2. Highlight, focus vào trường dữ liệu lỗi',
    ),
    (
     'dinh dang khong hop le',
     'Kiểm tra chức năng tải ảnh với các tập tin có định dạng không hợp lệ',
     '1. Tải ảnh upload có định dạng không hợp lệ\n2. Các trường khác nhập hợp lệ\n3. Click Lưu',
     '1. Thông báo: ảnh "<Tên ảnh>" có định dạng không hợp lệ. Chỉ jpg, gif, png, jpeg, bmp, heic, webp, ico là được phép\n2. Highlight, focus vào trường lỗi',
    ),
    (
     'dung luong hop le',
     'Kiểm tra tải ảnh có kích thước trong dung lượng cho phép',
     '1. Tải ảnh upload có định dạng và kích thước hợp lệ nhỏ hơn hoặc bằng <Dung lượng tối đa>\n2. Các trường khác nhập hợp lệ\n3. Click Lưu',
     'ảnh được tải lên và hiển thị trên màn hình',
    ),
    (
     'dung luong',
     'Kiểm tra tải ảnh có kích thước vượt dung lượng cho phép',
     'Tải ảnh upload có định dạng hợp lệ và kích thước lớn hơn <Dung lượng tối đa>',
     '1. Thông báo lỗi: ảnh "<Tên ảnh>" kích thước quá lớn, kích thước tối đa là <Dung lượng tối đa>\n2. ảnh không được up lên',
    ),
    (
     'nhieu lan',
     'Kiểm tra upload nhiều ảnh',
     '1. Trên màn hình chức năng\n2. Click vào nút tải lên ảnh và upload thành công\n3. Click vào đó lần nữa và chọn ảnh khác',
     'ảnh được chọn sau cùng được hiển thị THAY THẾ cho ảnh trước đó',
    ),
    (
     'go anh',
     'Kiểm tra click vào icon gỡ ảnh',
     '1. Trên màn hình chức năng\n2. Click icon gỡ ảnh',
     'ảnh được xóa khỏi form thêm mới',
    ),
]

# ẢNH 5 — bộ Upload file VERBATIM mẫu, 9 mục (bank MỚI, trước đây không có).
UPLOAD_FILE = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định',
     'Kiểm tra giá trị mặc định của trường này',
     'Mặc định là không có file nào.',
    ),
    (
     'bat buoc',
     'Kiểm tra là trường bắt buộc',
     '1. Không up file\n2. Các thông tin khác được nhập hợp lệ\n3. Click lưu lại',
     '1. Thông báo lỗi "Vui lòng chọn {f}"\n2. Highlight, focus vào trường lỗi',
    ),
    (
     'dinh dang hop le',
     'Kiểm tra chức năng tải file với tất cả các tập tin có định dạng hợp lệ',
     '1. Tải file upload có định dạng và kích thước hợp lệ nhỏ hơn hoặc bằng <Dung lượng tối đa>\n2. Các trường khác nhập hợp lệ\n3. Click Lưu',
     'File được tải lên và hiển thị trên màn hình',
    ),
    (
     'dung luong',
     'Kiểm tra tải file có kích thước vượt dung lượng cho phép',
     'Tải file upload có định dạng hợp lệ và kích thước lớn hơn <Dung lượng tối đa>',
     '1. Thông báo lỗi: File <Tên file> kích thước quá lớn, kích thước tối đa là <Dung lượng tối đa>\n2. File không được up lên',
    ),
    (
     'dinh dang khong hop le',
     'Kiểm tra upload file có định dạng không hợp lệ',
     'Up file có định dạng không nằm trong những định dạng được phép',
     'Hệ thống thông báo lỗi: "File <Tên file> có định dạng không hợp lệ. Chỉ *.pdf; *.doc; *.docx; *.xls; *.xlsx; *.ppt; *.pptx là được phép"',
    ),
    (
     'dinh dang gia',
     'Kiểm tra upload có định dạng giả',
     '1. Up file có định dạng giả\n2. Các trường khác nhập hợp lệ\n3. Click Lưu',
     'Thông báo lỗi: File không hợp lệ',
    ),
    (
     'nhieu file',
     'Kiểm tra upload nhiều file',
     '1. Chọn 1 file hợp lệ và upload thành công\n2. Click upload file và chọn file khác',
     'Hiển thị all các file đã upload, ko xóa file cũ',
    ),
    (
     'tai xuong',
     'Kiểm tra click vào icon tải xuống',
     'Click icon tải xuống tương ứng với file muốn tải về',
     'File được tải về thiết bị',
    ),
    (
     'xoa file',
     'Kiểm tra click vào icon xóa file',
     'Click icon xóa file',
     'File được xóa khỏi màn hình',
    ),
]

# ẢNH 5 — bộ Ngày sinh / Datepicker VERBATIM mẫu, 11 mục.
# ══════════════════════════════════════════════════════════════════════════════
# Ô NGÀY TRONG BIỂU MẪU (Thêm mới / Chỉnh sửa) — 11 mục
# ══════════════════════════════════════════════════════════════════════════════
# Nguồn 2026-09-12: sheet **`Ngày tháng không có giờ`** của bộ validate mẫu `Thêm mới.xlsx`
# (người đặt việc gửi). 9 mục đầu bám bản chữ của sheet đó; 2 mục cuối (ngày quá khứ / ngày
# tương lai) là mục DỰ ÁN đã có từ bộ `Ngày sinh` — giữ lại, không có trong sheet mẫu.
# Bản trước lệch mẫu 4 chỗ, mỗi chỗ là một case sai NỘI DUNG mà không phép rà nào bắt được:
#   · mặc định ghi *"placeholder là DD/MM/YYYY"* — sheet Thêm mới ghi **"Mặc định là trống"**
#     (placeholder là bản chữ của sheet TÌM KIẾM, xem `DATEPICKER_LOC`);
#   · `bat buoc` KHẲNG ĐỊNH *"Kiểm tra KHÔNG phải là trường bắt buộc"* + cột D *"Thêm mới thành
#     công vì {f} không là trường bắt buộc"* — sheet mẫu lấy nhánh **bắt buộc** làm chính và để
#     nhánh không bắt buộc ở cột phụ *"hoặc trong srs mô tả không phải là trường bắt buộc thì…"*.
#     Nay theo lối `NUMBOX` (vá 09/09): tiêu đề TRUNG TÍNH, cột D nêu CẢ HAI nhánh;
#   · `hop lich khi trong` thiếu hẳn bước **"Thay đổi ngày trên client"** — đó chính là điểm
#     của case (lịch phải mở theo ngày của MÁY CHỦ, không theo đồng hồ máy người test);
#   · danh sách giá trị sai định dạng thiếu `yyyy > 9999`, ngày không hợp lệ thiếu `YYYY < 1000`,
#     và mục đúng định dạng ghi `0001 <= yyyy` trong khi mẫu chốt khoảng **1000..9999**.
DATEPICKER = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định',
     '1. Mở biểu mẫu thêm mới.\n2. Đọc giá trị đang có trong ô "{f}".',
     'Mặc định là trống. Nếu tài liệu đặc tả có mô tả giá trị mặc định thì lấy theo tài liệu.',
    ),
    (
     # Tiêu đề TRUNG TÍNH + cột D hai nhánh — cùng lối đã vá cho `NUMBOX` ngày 09/09: ô ngày
     # bắt buộc hay không là do đặc tả của từng màn, khẳng định sẵn ở tiêu đề là sai một nửa.
     'bat buoc',
     'Kiểm tra {f} khi để trống',
     '1. Để trống ô "{f}".\n2. Các thông tin khác được nhập hợp lệ.\n3. Bấm nút lưu.',
     '- Là trường bắt buộc: thông báo "Vui lòng nhập {f}", highlight và focus vào trường lỗi, không lưu bản ghi nào.\n- Là trường không bắt buộc: lưu thành công, giá trị để rỗng.',
    ),
    (
     'hop lich khi trong',
     'Kiểm tra focus trong hộp Calendar khi {f} chưa có giá trị',
     '1. Để trống giá trị của ô "{f}".\n2. Đổi ngày trên máy đang chạy trình duyệt.\n'
     '3. Mở hộp Calendar của ô "{f}".\n4. Đọc ngày đang được focus trong hộp Calendar.',
     'Hộp Calendar mở ở tháng hiện tại theo ngày của máy chủ, không theo ngày vừa đổi trên máy người test.',
    ),
    (
     'hop lich khi da co',
     'Kiểm tra focus trong hộp Calendar khi {f} đã có dữ liệu',
     'Giả sử ô "{f}" đã có giá trị (VD: 20/10/2019).\n1. Mở hộp Calendar của ô "{f}".\n'
     '2. Đọc ngày đang được focus trong hộp Calendar.',
     'Ngày 20/10/2019 được focus.',
    ),
    (
     'chon ngay',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô "{f}".\n2. Lựa chọn 1 giá trị ngày tháng trong hộp Calendar.',
     '1. Hộp Calendar tự động đóng lại.\n2. Giá trị ngày tháng vừa chọn hiển thị trong ô "{f}" theo định dạng dd/mm/yyyy.',
    ),
    (
     'nhap ban phim',
     'Kiểm tra nhập hoặc xoá dữ liệu {f}',
     'Nhập rồi xoá giá trị của ô "{f}" bằng bàn phím.',
     'Cho phép nhập giá trị từ bàn phím và cho phép xoá giá trị đang được hiển thị trên ô.',
    ),
    (
     'sai dinh dang',
     'Kiểm tra khi trường {f} không đúng định dạng',
     'Nhập giá trị ngày tháng không đúng định dạng:\nKiểm tra với các định dạng sau:\n'
     '- Định dạng MM/DD/YYYY\n- YYYY/DD/MM\n- abcdefgh\n- @#$%\n- DD\n- DD/MM\n'
     '- Nhập yyyy > 9999, ví dụ 1/2/99999',
     '1. Thông báo lỗi: "{f} không đúng định dạng dd/mm/yyyy hoặc không tồn tại"\n2. Highlight và focus vào trường lỗi.',
    ),
    (
     'ngay khong ton tai',
     'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY nhưng không hợp lệ',
     'Nhập vào ô "{f}" các giá trị sau:\n1. Ngày DD không hợp lệ, ngoài khoảng [1,31]; ví dụ 32/04/2009.\n'
     '2. Tháng MM không hợp lệ, ngoài khoảng [1,12]; ví dụ 12/14/2009\n3. Kiểm tra với các giá trị biên sau\n'
     '- 31/04/1983\n- 31/06/1983\n- 31/09/1983\n- 31/11/1983\n- 30/2/1983\n- 29/2/1983\n'
     '4. YYYY < 1000\n- 01/02/0999',
     '1. Thông báo lỗi: "{f} không đúng định dạng dd/mm/yyyy hoặc không tồn tại"\n2. Highlight và focus vào trường lỗi.',
    ),
    (
     'dung dinh dang',
     'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY hợp lệ',
     'Kiểm tra với các giá trị sau:\n1. Ngày DD hợp lệ, trong khoảng [1,31]; ví dụ 30/04/2009.\n'
     '2. Tháng MM hợp lệ, trong khoảng [1,12]; ví dụ 12/12/2009\n3. 1000 <= YYYY <= 9999\n'
     '- 01/02/1000\n- 01/02/9999',
     'Ngày tháng hiển thị đúng định dạng dd/mm/yyyy.',
    ),
    (
     # 2 mục DỰ ÁN — sheet mẫu không có. Cột D KHÔNG khẳng định chiều ràng buộc: ô ngày của màn
     # nào chặn quá khứ, màn nào chặn tương lai là do đặc tả, ghi cứng sẵn là sai một nửa.
     'ngay qua khu',
     'Kiểm tra nhập {f} là ngày quá khứ',
     '1. Nhập vào ô "{f}" một ngày hợp lệ trong quá khứ.\n2. Các trường khác nhập hợp lệ.\n3. Bấm nút lưu.',
     '- Nếu đặc tả cho phép ngày quá khứ: lưu thành công, {f} hiển thị đúng ngày đã nhập.\n- Nếu đặc tả chặn: báo lỗi ngay tại trường và không lưu bản ghi nào.',
    ),
    (
     'ngay tuong lai',
     'Kiểm tra nhập {f} là ngày tương lai',
     '1. Nhập vào ô "{f}" một ngày hợp lệ trong tương lai.\n2. Các trường khác nhập hợp lệ.\n3. Bấm nút lưu.',
     '- Nếu đặc tả cho phép ngày tương lai: lưu thành công, {f} hiển thị đúng ngày đã nhập.\n- Nếu đặc tả chặn: báo lỗi ngay tại trường và không lưu bản ghi nào.',
    ),
]

# ẢNH 4 (chỉ thị 2026-09-07) — bộ Email VERBATIM mẫu, 11 mục.
EMAIL = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định',
     'Kiểm tra giá trị mặc định của trường này',
     'Mặc định là trống.',
    ),
    (
     'bat buoc',
     'Kiểm tra là trường bắt buộc',
     '1. Để trống trường dữ liệu hoặc nhập toàn các space\n2. Các thông tin khác được nhập hợp lệ\n3. Click Lưu',
     '1. Thông báo "Vui lòng nhập {f} (độ dài 1 - 64 ký tự trước dấu @)"\n2. Highlight, focus vào trường lỗi',
    ),
    (
     'hop le',
     'Kiểm tra khi nhập email hợp lệ',
     '1. Nhập email hợp lệ\n2. Các thông tin khác được nhập hợp lệ\n3. Click Lưu',
     'Thêm mới thành công',
    ),
    (
     'da ton tai',
     'Kiểm tra email đã tồn tại',
     '1. Nhập email giống email đã tạo mới ở trên\n2. Các thông tin khác được nhập hợp lệ\n3. Click Lưu',
     '1. Hiển thị thông báo "{f} đã tồn tại"\n2. Focus vào trường lỗi',
    ),
    (
     'qua 64',
     'Nhập vượt quá độ dài cho phép của trường dữ liệu trong CSDL',
     '1. Trên màn hình chức năng thêm mới\n2. Nhập địa chỉ email hợp lệ và có số ký tự trước @ lớn hơn 64 ký tự\n3. Click Lưu',
     '1. Hiển thị thông báo lỗi "{f} không đúng định dạng"\n2. Focus vào trường lỗi',
    ),
    (
     'rong truoc @',
     'Nhập nhỏ hơn độ dài cho phép của trường dữ liệu trong CSDL',
     '1. Trên màn hình chức năng thêm mới\n2. Nhập địa chỉ email hợp lệ và có số ký tự trước @ nhỏ hơn 1 ký tự\n3. Click Lưu',
     '1. Hiển thị thông báo lỗi "{f} không đúng định dạng"\n2. Focus vào trường lỗi',
    ),
    (
     'trong 64',
     'Kiểm tra nhập đúng độ dài cho phép của trường dữ liệu trong CSDL',
     '1. Trên màn hình chức năng thêm mới\n2. Nhập địa chỉ email hợp lệ và có số ký tự trước @ từ (1-64) ký tự\n3. Click Lưu',
     'Hiển thị thông báo Thêm mới thành công',
    ),
    (
     'sai dinh dang',
     'Kiểm tra nhập email không đúng định dạng',
     '1. Trên màn hình chức năng thêm mới\n2. Nhập địa chỉ email không đúng định dạng như các trường hợp sau:\n- Nhập email thiếu "@"\n- Nhập email thừa "@"\n- Email có ".." trong email\n- Email có "." ở đầu/ cuối địa chỉ email\n- Email có "@" ở cuối địa chỉ email\n- Email có "-" trước/ sau dấu "@"\n- Email là thẻ html, chuỗi http, ký tự đặc biệt (;& #^%$...)\n3. Click Lưu',
     '1. Hiển thị thông báo lỗi "{f} không đúng định dạng"\n2. Focus vào trường lỗi',
    ),
    (
     'dung dinh dang',
     'Kiểm tra nhập email đúng định dạng',
     '1. Trên màn hình chức năng thêm mới\n2. Nhập địa chỉ email đúng định dạng:\n(Ví dụ:\nfirstname.lastname@viettel.com.vn\nfirstname-lastname@domain.com\nemail@subdomain.domain.com\nemail@domain-one.com\nemail@domain.co.jp)\nvà số ký tự trước @ từ 1 đến 64 ký tự\n3. Click Lưu',
     'Hiển thị thông báo thêm mới thành công',
    ),
    (
     'nhap space',
     'Kiểm tra nhập space',
     'Nhập vào textbox giá trị email hợp lệ và space đầu và cuối',
     '1. Thực hiện thành công\n2. Hệ thống thực hiện trim space ở đầu và cuối trường dữ liệu',
    ),
    (
     'copy',
     'Kiểm tra copy nội dung dữ liệu, paste vào textbox',
     '1. Copy nội dung dữ liệu, paste vào textbox nội dung phải là địa chỉ email đúng định dạng\n(VD:\nfirstname.lastname@viettel.com.vn\nfirstname-lastname@domain.com\nemail@subdomain.domain.com\nemail@domain-one.com\nemail@domain.co.jp)\nvà số ký tự trước @ từ 1 đến 64 ký tự\n2. Các thông tin khác được nhập hợp lệ\n3. Click Lưu',
     'Hiển thị thông báo thêm mới thành công',
    ),
]

# ẢNH 4 — bộ Số điện thoại VERBATIM mẫu, 8 mục (kèm danh sách đầu số nhà mạng).
PHONE = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định',
     '1. Trên màn hình chức năng thêm mới\n2. Kiểm tra giá trị mặc định của trường này',
     'Màn hình thêm mới: Mặc định là trống.',
    ),
    (
     'bat buoc',
     'Kiểm tra là trường bắt buộc',
     '1. Để trống trường dữ liệu hoặc nhập toàn các space\n2. Các thông tin khác được nhập hợp lệ\n3. Click lưu lại',
     'Thêm mới thành công vì {f} không là trường bắt buộc.',
    ),
    (
     'ky tu dac biet',
     'Kiểm tra các nhập các ký tự đặc biệt, html,...',
     '1. Nhập dữ liệu là các html, script, space, chữ tiếng việt có dấu, ký tự đặc biệt\n2. Các thông tin khác được nhập hợp lệ\n3. Click lưu lại',
     '1. Hiển thị thông báo "{f} không đúng định dạng"\n2. Set focus vào trường lỗi\nHoặc hệ thống chặn không cho nhập khác số',
    ),
    (
     'dung dau so',
     'Kiểm tra nhập đúng đầu số cho phép',
     '1. Nhập số điện thoại theo đúng đầu số của các nhà mạng như sau:\n- Viettel: 096, 097, 098, 086, 032, 033, 034, 035, 036, 037, 038, 039.\n- Mobifone: 090, 093, 089, 070, 076, 077, 078, 079.\n- Vinaphone: 091, 094, 088, 081, 082, 083, 084, 085.\n- Vietnamobile: 092, 052, 056, 058.\n- Gmobile: 099, 059.\n- Cho phép nhập số điện thoại theo dạng: 84; +84\n  Và 10 ký tự số đối với định dạng: (0)  VD 0989306222\n  11 ký tự số theo dạng: 84 (Ví dụ: 84989306222).\n  12 ký tự số theo dạng: 084, +84 (Ví dụ: +84989306222 hoặc 084989306222).\n2. Các trường còn lại nhập hợp lệ',
     'Giá trị hợp lệ, hệ thống hiển thị thông báo Thêm mới thành công',
    ),
    (
     'sai do dai',
     'Kiểm tra nhập đúng đầu số cho phép nhưng số ký tự không hợp lệ',
     '1. Nhập số điện thoại theo đúng đầu số của các nhà mạng nhưng SỐ KÝ TỰ không hợp lệ:\n- Viettel: 096, 097, 098, 086, 032, 033, 034, 035, 036, 037, 038, 039.\n- Mobifone: 090, 093, 089, 070, 076, 077, 078, 079.\n- Vinaphone: 091, 094, 088, 081, 082, 083, 084, 085.\n- Vietnamobile: 092, 052, 056, 058.\n- Gmobile: 099, 059.\n- Cho phép nhập số điện thoại theo dạng: 84; +84\n  Và 10 ký tự số đối với định dạng: (0)  VD 0989306222\n  11 ký tự số theo dạng: 84 (Ví dụ: 84989306222).\n  12 ký tự số theo dạng: 084, +84 (Ví dụ: +84989306222 hoặc 084989306222).\n2. Các trường còn lại nhập hợp lệ',
     '1. Hiển thị thông báo "{f} không đúng định dạng"\n2. Set focus vào trường lỗi',
    ),
    (
     'sai dau so',
     'Kiểm tra nhập sai đầu số cho phép',
     '1. Nhập số điện thoại KHÔNG theo đúng đầu số của các nhà mạng như sau:\n- Viettel: 096, 097, 098, 086, 032, 033, 034, 035, 036, 037, 038, 039.\n- Mobifone: 090, 093, 089, 070, 076, 077, 078, 079.\n- Vinaphone: 091, 094, 088, 081, 082, 083, 084, 085.\n- Vietnamobile: 092, 052, 056, 058.\n- Gmobile: 099, 059.\n- Cho phép nhập số điện thoại theo dạng: 84; +84\n  Và 10 ký tự số đối với định dạng: (0)  VD 0989306222\n  11 ký tự số theo dạng: 84 (Ví dụ: 84989306222).\n  12 ký tự số theo dạng: 084, +84 (Ví dụ: +84989306222 hoặc 084989306222).\n2. Các trường còn lại nhập hợp lệ',
     '1. Hiển thị thông báo "{f} không đúng định dạng"\n2. Set focus vào trường lỗi',
    ),
    (
     'copy',
     'Kiểm tra copy nội dung dữ liệu, paste vào textbox',
     '1. Copy nội dung dữ liệu, paste số điện thoại theo đúng đầu số của các nhà mạng như sau:\n- Viettel: 096, 097, 098, 086, 032, 033, 034, 035, 036, 037, 038, 039.\n- Mobifone: 090, 093, 089, 070, 076, 077, 078, 079.\n- Vinaphone: 091, 094, 088, 081, 082, 083, 084, 085.\n- Vietnamobile: 092, 052, 056, 058.\n- Gmobile: 099, 059.\n- Cho phép nhập số điện thoại theo dạng: 84; +84\n  Và 10 ký tự số đối với định dạng: (0)  VD 0989306222\n  11 ký tự số theo dạng: 84 (Ví dụ: 84989306222).\n  12 ký tự số theo dạng: 084, +84 (Ví dụ: +84989306222 hoặc 084989306222).\n2. Các trường còn lại nhập hợp lệ',
     'Thông báo Thêm mới thành công',
    ),
    (
     'khoang trang hai dau',
     'Kiểm tra chức năng Trim space',
     '1. Nhập dữ liệu hợp lệ và thêm space vào đầu và cuối\n2. Các thông tin khác được nhập hợp lệ',
     '1. Thực hiện thành công\n2. Thực hiện trim space ở đầu và cuối trường dữ liệu',
    ),
]

# Nút chọn dạng segmented (2-3 nút liền nhau, luôn có đúng một nút đang chọn) — định mức 3 case
SEGMENTED = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định của {f}',
     '1. Mở màn hình, quan sát {f} khi chưa thao tác.',
     'Đúng một nút ở trạng thái đang chọn theo thiết kế. Các nút còn lại ở trạng thái thường.'),
    ('cac lua chon', 'Kiểm tra các lựa chọn của {f}',
     '1. Đối chiếu số nút và nhãn từng nút với thiết kế màn hình.',
     'Đủ số nút, nhãn đúng, không nút nào bị che hay tràn khỏi vùng hiển thị.'),
    ('chuyen doi', 'Kiểm tra chuyển đổi giữa các lựa chọn của {f}',
     '1. Bấm lần lượt từng nút.\n2. Bấm lại nút đang được chọn.',
     '1. Nội dung bên dưới đổi theo đúng nút vừa bấm, nút được chọn đổi trạng thái hiển thị.\n'
     '2. Bấm lại nút đang chọn không gây lỗi, không tải lại dữ liệu thừa.'),
]

LIST = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định của {f}',
     '1. Kiểm tra căn lề dữ liệu trong bảng.\n'
     '2. Di chuyển con trỏ chuột vào một bản ghi.\n'
     '3. Kiểm tra bố cục trong bảng danh sách.\n'
     '4. Rê chuột vào các biểu tượng hoặc các liên kết trên bản ghi.\n'
     '5. Bỏ chuột khỏi các biểu tượng hoặc các liên kết.',
     '1. Chữ căn lề trái. Số căn lề phải. Ngày tháng có số ký tự bằng nhau căn giữa. Tiêu đề cột căn theo dữ liệu phía dưới.\n2. Màu nền của bản ghi đó thay đổi.\n3. Cột thứ tự và tên các cột khác xếp từ trái qua phải đúng như thiết kế màn hình. Các thao tác đặt tại cột cuối bảng, cuộn ngang vẫn ghim lại cột thao tác, cuộn dọc vẫn ghim lại hàng tiêu đề. Phân trang và tổng số bản ghi đặt ở cuối bảng.\n4. Hiện chú thích đúng tên tương ứng với chức năng.\n5. Bỏ chuột khỏi biểu tượng, chú thích mất đi.'),
    # ⚠️ 2026-09-09: bản cũ đòi "khớp nhãn trong BIỂU MẪU THÊM MỚI" — màn CHỈ ĐỌC không có biểu
    # mẫu nào (đo trên `moetdl/DuLieuLoi`, `moetdl/Chi tiết lỗi`) nên case thành vô nghĩa mà bộ
    # rà vẫn tính đủ mục. Nay nêu nguồn đối chiếu theo thứ tự CÓ THẬT: nhãn biểu mẫu **nếu màn
    # có**, không thì nhãn dữ liệu / tài liệu nghiệp vụ.
    ('tieu de cot', 'Kiểm tra tiêu đề cột của {f}',
     '1. Đối chiếu tiêu đề từng cột với nhãn của dữ liệu tương ứng — nhãn trong biểu mẫu '
     'Thêm mới/Chỉnh sửa nếu màn có, không thì nhãn trong tài liệu nghiệp vụ.\n'
     '2. Kiểm chính tả và cách viết hoa của từng tiêu đề cột.',
     'Tiêu đề cột đúng nhãn nghiệp vụ của trường đó, không viết tắt lạ, không sai chính tả.'),
    ('khong co du lieu', 'Kiểm tra {f} khi không có dữ liệu',
     '1. Lọc để không còn bản ghi nào.', 'Hiện biểu tượng kèm thông báo không có dữ liệu.'),
    ('so luong ban ghi', 'Kiểm tra số lượng bản ghi trên {f}',
     '1. Đếm số bản ghi hiển thị.\n2. Đối chiếu với thống kê tổng số bản ghi ghi trên màn.',
     'Số lượng khớp nhau.'),
    ('dung cot', 'Kiểm tra dữ liệu {f} hiển thị đúng cột',
     '1. Đối chiếu từng giá trị với tiêu đề cột tương ứng.',
     'Dữ liệu hiển thị đúng cột, không xộc xệch.'),
    ('do rong', 'Kiểm tra độ rộng các cột của {f}',
     '1. Quan sát độ rộng từng cột.', 'Độ rộng các cột phù hợp với dữ liệu, không quá hẹp hay quá thừa.'),
    ('du lieu dai', 'Kiểm tra {f} hiển thị dữ liệu dài',
     '1. Chuẩn bị bản ghi có giá trị rất dài.\n2. Xem bản ghi đó trên danh sách.',
     'Hiển thị không bị tràn cột, không đẩy lệch các cột khác.'),
    ('dieu huong', 'Kiểm tra điều hướng đúng trang từ {f}',
     '1. Bấm vào các thao tác ở cột hành động trên một bản ghi.',
     'Điều hướng đúng trang hoặc mở đúng chức năng tương ứng.'),
]

ICON = [
    ('icon phu hop', 'Kiểm tra biểu tượng thao tác phù hợp với chức năng',
     '1. Quan sát các biểu tượng thao tác trên bản ghi.', 'Icon phù hợp với chức năng'),
    # NGUYÊN VĂN MẪU (chỉ thị + ảnh người đặt việc 2026-09-09): tiêu đề mẫu mang hậu tố
    # **"nếu có"**, cột Các bước lặp lại đúng tiêu đề, cột Kết quả chỉ "Icon màu đỏ".
    # ⚠️ Chính hậu tố "nếu có" làm case này HỢP LÝ trên MỌI màn — kể cả màn không có thao tác
    # Xoá (người chạy kiểm "nếu có", không có thì không áp dụng). Bản dự án tự viết lại trước
    # đây BỎ hậu tố đó ("Kiểm tra màu biểu tượng xoá") nên đọc thành lời KHẲNG ĐỊNH màn có nút
    # xoá — ĐÓ mới là lỗi, không phải bản thân case. Đừng bỏ hậu tố khi sửa wording.
    ('mau icon xoa', 'Kiểm tra màu icon xóa nếu có',
     'Kiểm tra màu icon xóa nếu có', 'Icon màu đỏ'),
    ('chu thich hien', 'Kiểm tra chú thích hiện khi rê chuột và ẩn khi bỏ chuột',
     '1. Rê chuột lên biểu tượng.\n2. Đưa chuột ra khỏi biểu tượng.',
     '1. Hiển thị văn bản khi di chuột vào icon\n2. Không hiển thị văn bản khi bỏ chuột ra'),
    ('doi mau con tro', 'Kiểm tra đổi màu và con trỏ khi rê chuột vào biểu tượng',
     '1. Rê chuột lên biểu tượng.', '1. Icon thay đổi màu\n2. Thay đổi con trỏ chuột từ dạng mặc định sang dạng con trỏ'),
    ('chinh ta', 'Kiểm tra nội dung và chính tả của chú thích',
     '1. Đọc chú thích của từng biểu tượng.',
     '1. Hiện thị đầy đủ ý nghĩa của icon\n2. Không có lỗi chính tả'),
    # bổ sung 2026-09-03 theo định mức nâng-mẫu (10 mục, tách riêng theo CHECKLIST-controls.md §14)
    ('chieu rong chieu cao tooltip', 'Kiểm tra chiều rộng và chiều cao của chú thích (tooltip)',
     '1. Rê chuột lên biểu tượng để hiện chú thích.\n2. Quan sát khung chú thích hiện ra.',
     '1 Hiển thị chiều cao & chiều rộng theo độ dài văn bản'),
    ('can le tooltip', 'Kiểm tra căn lề văn bản trên chú thích (tooltip)',
     '1. Rê chuột lên biểu tượng để hiện chú thích.\n2. Quan sát cách căn văn bản trong khung chú thích.',
     '1. Văn bản hiển thị được căn lề trái'),
    ('an chu thich khi bo chuot', 'Kiểm tra chú thích ẩn đi ngay khi bỏ chuột ra khỏi biểu tượng',
     '1. Rê chuột vào biểu tượng cho chú thích hiện ra.\n2. Đưa chuột ra khỏi biểu tượng.',
     '1. Không hiển thị văn bản'),
    ('doi mau khi hover', 'Kiểm tra biểu tượng đổi màu khi rê chuột vào',
     '1. Rê chuột vào từng biểu tượng thao tác.', '1. Icon thay đổi màu'),
    ('doi con tro khi hover', 'Kiểm tra con trỏ chuột đổi hình khi rê vào biểu tượng',
     '1. Rê chuột vào từng biểu tượng thao tác.', '1. Thay đổi con trỏ chuột từ dạng mặc định sang dạng con trỏ'),
]


PERPAGE = [
    # ⛔ LUẬT CỨNG ②: bản cũ ghi "mặc định giá trị đang áp dụng được chọn" — một câu LUÔN ĐÚNG
    # dù màn đang là 10, 25 hay 50, nên case này chưa bao giờ bắt được lỗi. Chốt 20.
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định ô chọn số bản ghi mỗi trang',
     '1. Mở màn lần đầu, xem ô chọn số bản ghi mỗi trang ở cuối danh sách.', 'Mặc định là 20.'),
    ('gia tri', 'Kiểm tra các giá trị trong ô chọn số bản ghi mỗi trang',
     '1. Bấm mở ô chọn số bản ghi mỗi trang.',
     'Danh sách hiện đủ các mức hệ thống cung cấp. Chỉ chọn được một mức.'),
    ('nho hon', 'Kiểm tra chọn số bản ghi mỗi trang nhỏ hơn tổng số',
     '1. Chọn mức nhỏ hơn tổng số bản ghi.',
     '1. Giá trị 20 trong ô select được focus\n2. Hiển thị 20 bản ghi ở trang đầu tiên và hiển thị phân trang\n3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn'),
    ('lon hon', 'Kiểm tra chọn số bản ghi mỗi trang lớn hơn hoặc bằng tổng số',
     '1. Chọn mức lớn hơn tổng số bản ghi.',
     '1. Giá trị đã chọn trong ô select được focus\n2. Hiển thị toàn bộ bản ghi và không hiển thị phân trang\n3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn'),
    # bổ sung 2026-09-03 theo định mức nâng-mẫu (5 mục)
    ('bang dung tong so', 'Kiểm tra chọn số bản ghi mỗi trang bằng đúng tổng số bản ghi hiện có',
     '1. Chọn mức bằng đúng tổng số bản ghi đang có trong danh sách.',
     '1. Giá trị đã chọn trong ô select được focus\n'
     '2. Hiển thị toàn bộ bản ghi và không hiển thị phân trang\n'
     '3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn'),
]

DIALOG = [
    ('noi dung hop', 'Kiểm tra nội dung {f}',
     '1. Mở "{f}".', 'Hộp hiện đúng tiêu đề, nội dung nhắc và các nút hành động.'),
    ('du lieu ban ghi', 'Kiểm tra dữ liệu bản ghi hiện trong {f}',
     '1. Mở "{f}" từ một bản ghi có tên dài.',
     'Hộp hiện đúng thông tin bản ghi đang chọn. Tên dài không làm vỡ khung.'),
    ('can le chinh ta', 'Kiểm tra căn lề, chính tả trên {f}',
     '1. Đọc tiêu đề, nội dung và nhãn hai nút.',
     'Không sai chính tả. Chữ trong nút được căn giữa, các nút thẳng hàng.'),
]

DETAIL = [
    ('truong khong co du lieu', 'Kiểm tra {f} khi có trường không có dữ liệu',
     '1. Xem bản ghi có trường không bắt buộc bị để trống.', 'Trường trống hiện giá trị rỗng hoặc dấu gạch.'),
    ('tat ca truong', 'Kiểm tra {f} khi tất cả các trường đều có dữ liệu',
     '1. Xem bản ghi đã điền đủ thông tin.', 'Không có trường nào bị trống giá trị.'),
    ('du lieu dai', 'Kiểm tra {f} khi dữ liệu quá dài',
     '1. Xem bản ghi có giá trị rất dài.', 'Hiển thị đầy đủ, giao diện không bị xô lệch.'),
    ('khop du lieu', 'Kiểm tra {f} khớp dữ liệu trong hệ thống',
     '1. Đối chiếu từng thông tin trên màn với dữ liệu đang lưu trong hệ thống.',
     'Thông tin hiển thị khớp với dữ liệu đang lưu trong hệ thống.'),
]

BUTTON = [('can le chinh ta', 'Kiểm tra căn lề, chính tả của button',
           '1. Quan sát nút "{f}".', 'Đúng chính tả, chữ trong nút được căn giữa.')]


# NÚT TẢI LẠI / LÀM MỚI — 6 mục, NGUYÊN VĂN MẪU (ảnh người đặt việc 2026-09-09).
# ⚠️ Đây là nhóm của khối **Validate**, KHÔNG phải nhóm `Chức năng Tải lại` ở khối Chức năng
# (chỉ thị 2026-09-09: "bổ sung validate Tải lại vào CN danh sách nếu có nút Tải lại; bỏ chức
# năng tải lại ở phần Chức năng"). Trước đó nút này rơi về bank `BUTTON` (1 case căn lề/chính tả)
# nên toàn bộ hành vi tải lại — giữ bộ lọc, giữ trang, hiệu ứng chờ, mất mạng — không ai kiểm.
RELOAD = [
    ('hien thi nut', 'Kiểm tra hiển thị nút "{f}"',
     '1. Trên màn hình chức năng\n2. Kiểm tra hiển thị nút {f}',
     '1. Nút {f} hiển thị đúng vị trí góc bên phải màn hình'),
    ('khong ap bo loc', 'Kiểm tra tải lại dữ liệu khi không áp dụng bộ lọc',
     '1. Trên màn hình chức năng\n2. Click button {f}',
     'Hệ thống gửi yêu cầu lấy lại danh sách dữ liệu mới nhất từ CSDL.'),
    ('dang co bo loc', 'Kiểm tra tải lại dữ liệu khi ĐANG có bộ lọc/tìm kiếm',
     '1. Trên màn hình chức năng\n2. Thực hiện tìm kiếm theo bộ lọc> Click nút {f}',
     'Danh sách dữ liệu được cập nhật lại mới nhất nhưng vẫn giữ nguyên các giá trị bộ lọc/từ '
     'khóa tìm kiếm hiện tại.'),
    ('trang phan trang khac',
     'Kiểm tra tải lại khi đang ở trang phân trang khác (Trang 2, 3...)',
     '1. Trên màn hình chức năng\n'
     '2. Danh sách có nhiều trang, người dùng đang ở Trang 2 (hoặc số bản ghi/trang khác mặc '
     'định).\n3. Click button {f}',
     '- Hệ thống tải lại dữ liệu và vẫn giữ người dùng ở đúng số trang hiện tại (Trang 2) cùng '
     'số bản ghi/trang đang chọn.'),
    ('hieu ung loading', 'Kiểm tra hiệu ứng Loading khi bấm "{f}"',
     '1. Trên màn hình chức năng> Bấm nút {f}.\n'
     '2. Quan sát nút và bảng dữ liệu trong lúc chờ phản hồi từ Server.',
     '- Icon trên nút "{f}" xoay tròn hoặc màn hình xuất hiện hiệu ứng Loading (Spinner).\n- Nút "{f}" tạm thời bị disable trong lúc đang load.'),
    ('mat ket noi mang', 'Kiểm tra khi mất kết nối mạng (Offline/Network Error)',
     '1. Ngắt kết nối Internet của thiết bị.\n2. Bấm nút {f}.',
     '- Hệ thống hiển thị thông báo lỗi mạng phù hợp (VD: "Không thể kết nối đến máy chủ, vui '
     'lòng kiểm tra đường truyền").\n'
     '- Dữ liệu cũ trên màn hình không bị mất hoặc xóa trắng lỗi.'),
]


# Hai bộ dưới đây trước nay THIẾU nên `patch_quota` bỏ qua mọi nhóm "Tải file mẫu" và
# "File Excel" (bộ rà vẫn đòi 2 / 12 case). Nội dung bám hành vi thật của
# `ImportCatalogModal.tsx` — đã đối chiếu trên hệ thống ngày 2026-08-17.
TEMPLATE_FILE = [
    ('tai duoc file mau', 'Kiểm tra tải về được file mẫu',
     '1. Mở hộp thoại nhập Excel.\n2. Bấm "Tải file mẫu".',
     'Trình duyệt tải về đúng file mẫu, mở được bằng Excel, không báo hỏng.'),
    ('cau truc cot file mau', 'Kiểm tra cấu trúc cột của file mẫu',
     '1. Mở file mẫu vừa tải.\n2. Đối chiếu tiêu đề từng cột với dòng "Cột: …" ghi ở cuối hộp thoại.',
     'Tiêu đề cột khớp đúng và đủ thứ tự như hộp thoại công bố. Có sẵn dòng dữ liệu ví dụ.'),
]

EXCEL_IMPORT = [
    ('chi nhan xlsx', 'Kiểm tra chỉ nhận tệp đúng định dạng bảng tính',
     '1. Bấm "Chọn file Excel".\n2. Chọn một tệp .pdf hoặc .txt.',
     'Hộp chọn tệp không cho chọn, hoặc hệ thống báo không đọc được tệp và giữ nguyên màn hình.'),
    ('file rong', 'Kiểm tra nhập tệp không có dòng dữ liệu',
     '1. Chọn tệp chỉ có dòng tiêu đề, không có dòng dữ liệu nào.',
     'Hệ thống báo tệp không có dòng dữ liệu. Bảng xem trước để trống. Nút nạp không dùng được.'),
    ('file gia duoi', 'Kiểm tra tệp giả đuôi',
     '1. Đổi đuôi một tệp bất kỳ thành .xlsx rồi chọn tệp đó.',
     'Hệ thống báo không đọc được tệp, nhắc kiểm tra lại định dạng. Không nạp dòng nào.'),
    ('sai mau', 'Kiểm tra tệp sai mẫu',
     '1. Chọn tệp có tiêu đề cột khác hẳn file mẫu.',
     'Mọi dòng đều báo thiếu dữ liệu ở cột bắt buộc. Số dòng hợp lệ bằng 0.'),
    ('thieu cot bat buoc', 'Kiểm tra tệp thiếu cột bắt buộc',
     '1. Xoá hẳn một cột bắt buộc khỏi file mẫu rồi chọn tệp đó.',
     'Mọi dòng báo thiếu đúng cột đã xoá. Không cho nạp.'),
    ('dong thieu o bat buoc', 'Kiểm tra dòng bỏ trống ô bắt buộc',
     '1. Chọn tệp có một dòng để trống ô bắt buộc.',
     'Dòng đó bị tô khác màu, ô trống hiện chữ "(trống)" và có lời báo thiếu đúng tên cột.'),
    ('trung trong file', 'Kiểm tra nhiều dòng trùng mã trong cùng tệp',
     '1. Chọn tệp có 2 dòng cùng một mã.',
     'Dòng thứ hai bị đánh dấu trùng trong tệp. Chỉ dòng đầu được tính là hợp lệ.'),
    ('tron dong dung va loi', 'Kiểm tra tệp có cả dòng đúng và dòng lỗi',
     '1. Chọn tệp gồm 3 dòng hợp lệ và 2 dòng lỗi.\n2. Đọc dòng đếm ở cuối hộp thoại.\n3. Bấm nạp.',
     'Hộp thoại báo đúng 3/5 dòng hợp lệ. Sau khi nạp chỉ 3 dòng vào hệ thống, 2 dòng lỗi được liệt kê kèm số dòng.'),
    ('vuot nguong', 'Kiểm tra tệp vượt giới hạn số dòng mỗi lần nạp',
     '1. Chọn tệp có số dòng vượt mức cho phép mỗi lần nạp.',
     'Hiện cảnh báo vượt giới hạn kèm số dòng thực tế. Nút nạp bị khoá.'),
    ('chon lai file khac', 'Kiểm tra chọn lại tệp khác sau khi đã chọn một tệp',
     '1. Chọn tệp thứ nhất.\n2. Chọn tiếp tệp thứ hai.',
     'Tên tệp và bảng xem trước đổi hẳn sang tệp thứ hai, không cộng dồn dòng của tệp trước.'),
    ('gia tri vuot do dai', 'Kiểm tra ô trong tệp vượt độ dài cho phép',
     '1. Chọn tệp có một ô dài hơn giới hạn của trường tương ứng.',
     'Dòng đó bị báo vượt độ dài đúng tên trường. Không được tính là dòng hợp lệ.'),
    ('khoa nut nap', 'Kiểm tra nút nạp khi không có dòng hợp lệ',
     '1. Chọn tệp mà mọi dòng đều lỗi.\n2. Rê chuột vào nút nạp.',
     'Nút nạp mờ và không bấm được. Hệ thống không gửi dữ liệu nào lên.'),
    # bổ sung 2026-09-03 theo định mức nâng-mẫu (13 mục)
    ('vuot dung luong cho phep', 'Kiểm tra tệp vượt quá dung lượng cho phép',
     '1. Chọn một tệp Excel có dung lượng lớn hơn mức cho phép (ví dụ trên 10MB).',
     'Hệ thống báo tệp vượt quá dung lượng cho phép, không nạp được tệp.'),
]
# ── 5 mục CỦA MẪU (r502–r514) mà bank thiếu — bổ sung 2026-09-07 ────────────────────────
# Trước đó nhóm `File excel` bơm ra ĐỦ 13 case nhưng SAI BỘ MỤC: 9/9 CN Nhập Excel của dự án
# thiếu `giá trị mặc định` · `là trường bắt buộc` · `tải lên 1 tệp` · `đúng mẫu` · `<= 10MB`.
# `audit_validate_quota` chỉ ĐẾM nên báo sạch — đúng anti-pattern §11.3 mục 3.
EXCEL_IMPORT_MAU = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định',
     '1. Mở màn nhập excel.\n2. Xem ô chọn tệp khi chưa chọn gì.',
     'Ô chọn tệp để trống, chưa có tên tệp nào. Nút nạp bị vô hiệu.'),
    ('la truong bat buoc', 'Kiểm tra là trường bắt buộc',
     '1. Không chọn tệp nào.\n2. Bấm nút nhập excel.',
     'Hệ thống báo lỗi yêu cầu chọn tệp và không thực hiện nạp. Không gọi máy chủ.'),
    ('tai len 1 tep', 'Kiểm tra tải lên 1 tệp',
     '1. Chọn đúng một tệp hợp lệ theo mẫu.',
     'Tệp được nạp lên, hiển thị tên tệp và số dòng đọc được. Nút nạp mở ra.'),
    ('dung dinh dang dung mau', 'Kiểm tra tải tệp đúng định dạng xls, xlsx và đúng mẫu',
     '1. Chọn tệp .xlsx đúng cấu trúc mẫu tải về.\n2. Bấm nút nhập excel.',
     'Hệ thống đọc đủ số dòng của tệp, xem trước không báo lỗi cấu trúc và nạp thành công.'),
    ('trong dung luong cho phep', 'Kiểm tra tải tệp đúng định dạng và trong dung lượng cho phép',
     '1. Chọn tệp .xlsx dung lượng nhỏ hơn hoặc bằng ngưỡng cho phép.\n2. Bấm nút nhập excel.',
     'Tệp được nhận và nạp thành công, không báo vượt dung lượng.'),
]
# Bộ ĐẦY ĐỦ cho nhóm `File excel` = 13 mục mẫu + mục riêng của dự án
# Định mức nhóm `File excel` là **13** (§5.4) nhưng bộ nguồn có **18** mục — `patch_quota` lấy
# 13 mục ĐẦU nên thứ tự quyết định mục nào lọt. Trước 2026-09-08 ghép thẳng `MAU + IMPORT`, hai
# mục MẪU BẮT BUỘC lại nằm ở vị trí 15 và 18 (`chon lai file khac` = *tải lên file nhiều lần* r514,
# `vuot dung luong cho phep` = *> 10 MB* r511) ⇒ **không bao giờ được bơm**, và `audit_import.py`
# (rà theo MỤC, không theo số lượng) báo "thiếu 2/13 mục mẫu" ở mọi file — đúng cái bẫy
# "đủ số nhưng sai bộ" mà bảng QUOTA đã cảnh báo. Nay xếp 13 mục CỦA MẪU lên trước.
_IMPORT_MAU_KEYS = ('chi nhan xlsx', 'file rong', 'file gia duoi', 'sai mau',
                    'dong thieu o bat buoc', 'tron dong dung va loi',
                    'chon lai file khac', 'vuot dung luong cho phep')
EXCEL_IMPORT_FULL = (EXCEL_IMPORT_MAU
                     + [c for c in EXCEL_IMPORT if c[0] in _IMPORT_MAU_KEYS]
                     + [c for c in EXCEL_IMPORT if c[0] not in _IMPORT_MAU_KEYS])


# bổ sung 2026-09-03: hai loại control mẫu có mà bảng trước đây chưa từng định mức
# (xem huong-dan/DOI-CHIEU-MAU-vs-LUAT.md §1)
COMBOBOX_EXTRA = [
    # ⚠️ 2026-09-09: bản cũ KHẲNG ĐỊNH "hệ thống tự tải thêm theo trang" — nhiều ô chọn đổ HẾT
    # một lần (đo trên app `moetdl`) nên case thành SAI SỰ THẬT mà không phép rà nào biết. Cùng
    # lớp với `exp_empty`/`exp_rate` (`complete_func`) và mục "bắt buộc" của `NUMBOX`: nêu CẢ HAI
    # nhánh, đối chiếu bằng hành vi đã ground ở hồ sơ màn.
    ('tai du lieu khi lon', 'Kiểm tra cách tải dữ liệu khi danh sách {f} lớn',
     '1. Mở ô "{f}" ở màn có nhiều dữ liệu.\n2. Cuộn xuống cuối danh sách gợi ý.\n'
     '3. Ghi lại CÁCH ô này nạp dữ liệu: đổ hết một lần, hay tải thêm theo trang khi cuộn.',
     'Danh sách tải theo trang, cuộn tới cuối thì tự tải tiếp, không kẹt và không lặp bản ghi.'),
    ('khop toan bo tu khoa', 'Kiểm tra gõ khớp toàn bộ giá trị trong {f}',
     '1. Gõ đúng toàn bộ tên một giá trị có sẵn vào ô "{f}".',
     'Gợi ý hiện đúng giá trị vừa gõ, đặt lên đầu danh sách gợi ý.'),
    ('khop mot phan', 'Kiểm tra gõ khớp một phần giá trị trong {f}',
     '1. Gõ một phần tên của giá trị có sẵn vào ô "{f}".',
     'Gợi ý hiện các giá trị có chứa đoạn vừa gõ.'),
    ('phan biet chu hoa chu thuong', 'Kiểm tra {f} tìm không phân biệt chữ hoa chữ thường',
     '1. Gõ từ khoá bằng chữ hoa trong khi giá trị lưu là chữ thường (hoặc ngược lại) vào ô "{f}".',
     'Gợi ý vẫn hiện đúng giá trị tương ứng, không phân biệt chữ hoa chữ thường.'),
    ('co dau khong dau', 'Kiểm tra {f} tìm bằng tiếng Việt có dấu và không dấu',
     '1. Gõ từ khoá tiếng Việt không dấu vào ô "{f}".\n2. Gõ lại bằng từ khoá có dấu.',
     'Cả hai cách gõ đều trả về đúng giá trị tương ứng.'),
    ('tu khoa khong ton tai', 'Kiểm tra gõ từ khoá không tồn tại trong {f}',
     '1. Gõ một chuỗi không khớp giá trị nào vào ô "{f}".',
     'Hiện thông báo không tìm thấy kết quả phù hợp trong danh sách gợi ý.'),
    ('xoa tu khoa ve ban dau', 'Kiểm tra xoá từ khoá trong {f} để về danh sách ban đầu',
     '1. Gõ một từ khoá bất kỳ vào ô "{f}".\n2. Xoá hết từ khoá vừa gõ.',
     'Danh sách gợi ý trở về đầy đủ như trước khi gõ tìm.'),
]

# §5.2: `Selectbox / Combobox` SEARCHABLE = định mức 13 = "bộ native (6) + 7 mục dưới đây".
# COMBOBOX_EXTRA một mình chỉ có 7 mục nên `patch_quota` bơm tối đa 7/13 và nhóm KHÔNG BAO GIỜ
# đủ định mức (đo 2026-09-07 trên `Combobox Cấp học áp dụng`). Union lại đúng 13.
COMBOBOX_FULL = SELECTBOX + COMBOBOX_EXTRA

# "Textbox Số bản ghi trên trang" — mẫu 10 mục, KHÁC "Selectbox Số bản ghi trên trang" (PERPAGE)
# ở chỗ đây là Ô SỐ nhập tay, không phải dropdown chọn sẵn. Xem CHECKLIST-controls.md §13.
PAGE_RECORDS = [
    # ⛔ LUẬT CỨNG ②: "đúng mức mặc định của hệ thống" không đo được gì — chốt 20 như ô chọn.
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định ô số bản ghi trên trang',
     '1. Mở màn lần đầu, xem ô nhập số bản ghi trên trang ở cuối danh sách.', 'Mặc định là 20.'),
    ('ky tu khac so', 'Kiểm tra nhập ký tự khác số vào ô số bản ghi trên trang',
     '1. Nhập chữ hoặc ký tự đặc biệt vào ô số bản ghi trên trang.',
     'Không cho phép nhập'),
    ('so am', 'Kiểm tra nhập số âm vào ô số bản ghi trên trang',
     '1. Nhập dấu trừ rồi nhập số vào ô số bản ghi trên trang.', 'Không cho phép nhập'),
    ('nhap 0', 'Kiểm tra nhập 0 vào ô số bản ghi trên trang',
     '1. Nhập 0 vào ô số bản ghi trên trang.',
     'Tự động chuyển về giá trị đang áp dụng sau khi enter'),
    ('vuot 1000', 'Kiểm tra nhập lớn hơn 1000 vào ô số bản ghi trên trang',
     '1. Nhập một giá trị lớn hơn 1000 vào ô số bản ghi trên trang.',
     '1. Hiển thị thông báo lỗi: Số bản ghi/trang tối đa 1000 bản ghi\n2. Tự động reset về 1000'),
    ('trong o select', 'Kiểm tra nhập giá trị trùng một mức có sẵn trong ô chọn nhanh',
     '1. Nhập đúng một trong các mức gợi ý sẵn (ví dụ 20, 50, 100) vào ô số bản ghi trên trang.',
     '1. Hiển thị đúng số lượng bản ghi/trang = số đã nhập\n2. Giá trị tương ứng trong ô select được focus'),
    ('ngoai o select', 'Kiểm tra nhập giá trị không trùng mức nào trong ô chọn nhanh',
     '1. Nhập một giá trị không khớp mức gợi ý nào (ví dụ 37) vào ô số bản ghi trên trang.',
     '1. Hiển thị đúng số lượng bản ghi/trang = số đã nhập\n2. Không có giá trị nào trong ô select được focus'),
    ('nho hon tong', 'Kiểm tra nhập số bản ghi trên trang nhỏ hơn tổng số bản ghi',
     '1. Nhập một giá trị nhỏ hơn tổng số bản ghi hiện có.',
     'Hiển thị đúng số bản ghi mỗi trang và hiển thị phân trang'),
    ('lon hon tong', 'Kiểm tra nhập số bản ghi trên trang lớn hơn tổng số bản ghi',
     '1. Nhập một giá trị lớn hơn tổng số bản ghi hiện có.',
     'Hiển thị toàn bộ bản ghi và không hiển thị phân trang'),
    ('bang tong', 'Kiểm tra nhập số bản ghi trên trang bằng đúng tổng số bản ghi',
     '1. Nhập giá trị bằng đúng tổng số bản ghi hiện có.',
     'Hiển thị toàn bộ bản ghi và không hiển thị phân trang'),
]

# ── ẢNH 2 (chỉ thị 2026-09-07): khối `Chức năng Tìm kiếm đơn lẻ` VERBATIM MẪU ────────────
# Cấu trúc mẫu: nhóm `Selectbox <nhãn>` (2 case) + nhóm `Textbox <nhãn>` (6 case).
# ⚠️ Mẫu lem câu SQL vào CỘT D. Đây đúng chỗ luật THẮNG mẫu (§1 · §2 luật 7 · §3):
#    SQL đặt ở CỘT C, cột D chỉ nói hệ thống phản hồi thế nào. Giữ nguyên mọi chữ khác của mẫu.



# ⚠️ Vá 2026-09-10 — HAI lỗi của bộ này, đo trên màn `Cảnh báo Mâu thuẫn`:
#  1. Tiêu đề chốt cứng chữ **"Selectbox"** trong khi bộ này áp cho MỌI control chọn giá trị
#     (`qalib.search_spec` trả `SEARCH_SINGLE_PICK` cho Selectbox · Combobox · Checkbox · ô ngày…)
#     ⇒ nhóm `Datepicker Từ ngày` sinh ra case *"Tìm kiếm với: - Selectbox = giá trị mặc định"*.
#     Nay dùng chỗ giữ `{loai}` = LOẠI control lấy từ chính tên nhóm.
#  2. Câu truy vấn chép nguyên cột của MÀN MẪU (`id, code, title, status, sort_order` ·
#     `status = '<giá trị>'`) ⇒ mọi màn không có cột trạng thái đều nhận một câu SQL sai.
#     Nay để chỗ giữ theo màn; `tcfix.Plan.case()` tự gắn cờ `[CẦN VERIFY]` vì có `<…bảng…>`.
#
# ⚠️ Chỗ giữ của bộ này: `{f}` tên trường · `{loai}` LOẠI control (`Selectbox`) · `{loai_thuong}`
# cùng thứ viết thường (mẫu viết hoa ở cột B, viết thường ở cột C) · `{ph}` CHỮ GỢI Ý bắt buộc
# của luật ① (`-- Chọn trạng thái --`). Điền bằng `qalib.fmt_bank()` — thêm chỗ giữ mà điền tay
# ở từng chỗ gọi là đường kia nổ `KeyError` (đã dính 2026-09-10).
SEARCH_SINGLE_PICK = [
    (
     # ⛔ LUẬT CỨNG ① + KHUÔN MẪU (ảnh chỉ thị 2026-09-14). Ba đời của mục này:
     #   ① bản đầu  — `2. Giữ ở giá trị mặc định` / cột D *"… thỏa mãn điều kiện mặc định ban
     #      đầu"*: không nói mặc định LÀ GÌ ⇒ màn chọn sẵn `Hoạt động` vẫn chấm P;
     #   ② bản 12/09 — dồn chữ gợi ý vào CỘT D thành danh sách 2 ý: bắt được lỗi, nhưng không
     #      phải cách mẫu viết, và cột D phình ra trong khi §8.2 muốn nó ngắn;
     #   ③ bản này  — ĐÚNG MẪU: chữ gợi ý nêu ở **cột B và cột C**, cột D trả về đúng một câu
     #      của mẫu. Vẫn thi hành luật ① (case chốt mặc định là gì), chỉ đổi CHỖ chốt.
     # Ba ô dựng từ `qalib.tk_mac_dinh_bo_ba()` — literal dưới đây là bản có chỗ giữ đã điền
     # sẵn cho ô chọn, giữ ở đây để phép ㉕b/㉖ của `audit_extra` vẫn soi được bank.
     'gia tri mac dinh',
     'Tìm kiếm với:\n- {loai} = {ph}',
     '1. Truy cập vào màn hình Danh sách/Tìm kiếm.\n'
     '2. Chọn {loai_thuong} = {ph}',
     'Hệ thống tự động hiển thị danh sách kết quả/dữ liệu thỏa mãn điều kiện mặc định ban đầu.',
    ),
    (
     'chon 1 gia tri',
     'Chọn 1 giá trị của {f}',
     '1. Lần lượt chọn 1 giá trị của {f}.\n2. Đối chiếu kết quả với dữ liệu đang lưu:\n'
     'select * from <bảng dữ liệu của màn>\n'
     'where <cột ứng với {f}> = \'<giá trị đang chọn>\';',
     '1. Hiển thị kết quả tìm kiếm thỏa mãn giá trị đã chọn.\n2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.',
    ),
]

SEARCH_SINGLE_TEXT = [
    (
     'toan ky tu space',
     'Tìm kiếm khi nhập:\n- Textbox = Các ký tự Space',
     'Nhập ô {f} bằng các ký tự space',
     'Hệ thống không cho phép nhập khoảng trắng.',
    ),
    (
     'space dau va cuoi',
     'Tìm kiếm khi nhập:\n- Textbox là một chuỗi có ký tự Space ở đầu và cuối chuỗi',
     '1. Trên vùng tìm kiếm: Nhập vào ô {f} dữ liệu đang tồn tại/ có trong database chứa khoảng trắng đầu và cuối\n2. Enter',
     'Hệ thống không cho phép nhập khoảng trắng ở đầu. Ở cuối chuỗi hệ thống cho phép nhập khoảng trắng, nhưng tự động loại bỏ (Trim) khoảng trắng này khi thực hiện tìm kiếm và hiển thị đúng kết quả.',
    ),
    (
     'tim kiem tuong doi',
     'Tìm kiếm tương đối:\n- Nhập Textbox là một phần của xâu đã tồn tại\n( nhập hoa, thường)',
     '1. Nhập ô {f} là một phần của xâu đã tồn tại, lần lượt bằng chữ thường rồi chữ HOA.\n2. Đối chiếu kết quả với DB:\nselect * from <bảng dữ liệu của màn>\nwhere unaccent(<cột được tìm>) ilike unaccent(\'%<từ khoá>%\');',
     '1. Hiển thị các kết quả tìm kiếm với Textbox chứa xâu đã nhập không phân biệt chữ hoa, chữ thường.\n2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.',
    ),
    (
     'ky tu dac biet',
     'Tìm kiếm khi nhập:\n- Textbox là các ký tự đặc biệt',
     '1. Nhập ô {f} lần lượt là các ký tự đặc biệt:\n- % (hoặc %test)\n- &\n- _\n- *\n- \\\n- dấu nháy \'\n- thẻ HTML: <b>1</b>\n2. Đối chiếu kết quả với DB:\nselect * from <bảng dữ liệu của màn>\nwhere unaccent(<cột được tìm>) ilike unaccent(\'%<ký tự đã nhập>%\') escape \'\\\';',
     '1. Hiển thị kết quả tìm kiếm thỏa mãn textbox chứa ký tự đã nhập.\n2. Kết quả khớp với dữ liệu đang lưu. Ký tự đặc biệt không làm lỗi truy vấn.',
    ),
    (
     'tieng viet co dau',
     'Tìm kiếm khi nhập chữ tiếng việt có dấu',
     '1. Trên vùng tìm kiếm: Nhập vào ô {f} dữ liệu đang tồn tại/ có trong database là chữ tiếng việt có dấu\n2. Click vào button tìm kiếm hoặc nhấn phím Enter trên bàn phím\n3. Đối chiếu kết quả với DB:\nselect * from <bảng dữ liệu của màn>\nwhere unaccent(<cột được tìm>) ilike unaccent(\'%<từ khoá có dấu>%\');',
     '1. Hiển thị kết quả tìm kiếm thỏa mãn textbox chứa từ khoá đã nhập.\n2. Kết quả khớp với dữ liệu đang lưu trong hệ thống.',
    ),
    (
     'du lieu khong gioi han',
     'Tìm kiếm khi nhập dữ liệu không giới hạn',
     'Nhập dữ liệu vào ô {f} không giới hạn độ dài.',
     'Hiển thị kết quả tìm kiếm thỏa mãn điều kiện nhập vào, và không bị lỗi màn hình.',
    ),
]

# ── ẢNH 1 (chỉ thị 2026-09-07): 6 case TÌM KIẾM TRONG SELECTBOX — mẫu cho CẢ 6 DÙNG CHUNG
# một tiêu đề "Kiểm tra tìm kiếm", chỉ khác cột C/D (giống 4 case phân trang).
# -> `qalib.DUP_OK` phải miễn phép rà trùng tên cho tiêu đề này.
SELECTBOX_SEARCH = [
    # TIÊU ĐỀ tách riêng từng mục (2026-09-08). Trước đây cả 6 mục dùng chung một tiêu đề
    # `Kiểm tra tìm kiếm` -> 6 case TRÙNG TÊN trong cùng một nhóm, phạm §12 mục 3, và người chạy
    # test phải mở cột C mới biết case nào khác case nào. An toàn với bộ case CŨ: `plan_quota_fill`
    # dò trùng theo KEY (cột 1) chứ không theo tiêu đề, và nhóm đã đủ định mức thì bị `continue`
    # ngay ở phép `len(cases) >= q` -> không bơm lại.
    ('tim kiem khop 100', 'Kiểm tra tìm kiếm khớp 100% dữ liệu',
     '1. Click vào ô selectbox\n2. Nhập từ khóa tìm kiếm khớp 100% dữ liệu trong DB',
     'Hiển thị đúng option'),
    ('tim kiem khop 1 phan', 'Kiểm tra tìm kiếm khớp 1 phần dữ liệu',
     '1. Click vào ô selectbox\n2. Nhập từ khóa tìm kiếm khớp 1 phần với dữ liệu trong DB',
     'Hiển thị các option liên quan'),
    ('tim kiem hoa thuong', 'Kiểm tra tìm kiếm không phân biệt hoa thường',
     '1. Click vào ô selectbox\n2. Nhập từ khóa không phân biệt hoa thường',
     'Vẫn trả về đúng kết quả tìm kiếm'),
    ('tim kiem co dau khong dau', 'Kiểm tra tìm kiếm tiếng Việt có dấu, không dấu',
     '1. Click vào ô selectbox\n2. Nhập tiếng việt có dấu, không dấu',
     'Tìm kiếm được cả không dấu, có dấu'),
    ('tim kiem khong ton tai', 'Kiểm tra tìm kiếm từ khoá không tồn tại',
     '1. Click vào ô selectbox\n2. Nhập từ khóa tìm kiếm không tồn tại trong DB',
     'Hiển thị Không tìm thấy kết quả'),
    ('tim kiem xoa tu khoa', 'Kiểm tra xóa từ khoá đã nhập trong ô tìm kiếm',
     '1. Click vào ô selectbox\n2. Nhập từ khóa tìm kiếm\n3. Xóa từ khóa đã nhập',
     'Hiển thị lại danh sách ban đầu khi chưa tìm kiếm'),
]

# `Selectbox` của mẫu LÀ ô có tìm kiếm (xem ảnh 1 và khối "Giới tính" của ảnh 5) ⇒ định mức 13:
#   6 mục native + `tải dữ liệu khi dữ liệu lớn` + 6 mục tìm kiếm của ảnh 1.
SELECTBOX_FULL = SELECTBOX + [c for c in COMBOBOX_EXTRA if c[0] == 'tai du lieu khi lon'] \
                 + SELECTBOX_SEARCH

# ── ẢNH 3 (chỉ thị 2026-09-07): ô MÃ (Mã môn học · Mã định danh …) là trường DUY NHẤT
# ⇒ định mức 10 = bộ Textbox chữ (9) + case "đã tồn tại". Wording bám mẫu.
TEXTBOX_MA = TEXTBOX + [
    ('da ton tai', 'Kiểm tra dữ liệu đã tồn tại',
     '1. Nhập dữ liệu đã tồn tại\n2. Các thông tin khác được nhập hợp lệ\n3. Click Thêm mới',
     '1. Thông báo lỗi "{f} đã tồn tại"\n2. Highlight, focus vào trường lỗi'),
]

# ── Bổ sung 2026-09-07: hai loại control CÓ định mức ở §5.1 nhưng CHƯA HỀ có bộ case ─────
# nguồn ⇒ `plan_quota_fill` lấy `src = None` rồi `continue` LẶNG LẼ, nên mọi sheet có
# nhóm "Textbox Nhập số trang" (định mức 7) hoặc "Checkbox bản ghi" (định mức 6)
# KHÔNG BAO GIỜ chốt được `0·0·0·0·0·0`. Khai vào `qalib.KINDSRC` cùng lượt này.

PAGE_INPUT = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định ô nhập số trang',
     '1. Xem ô "Nhập số trang" ở cụm phân trang cuối danh sách.',
     'Ô hiện đúng số trang đang xem.'),
    ('ky tu khac so', 'Kiểm tra nhập ký tự khác số vào ô nhập số trang',
     '1. Nhập chữ, dấu cách và ký tự đặc biệt vào ô "Nhập số trang".',
     'Ô không nhận ký tự khác chữ số. Trang đang xem không thay đổi.'),
    ('so am', 'Kiểm tra nhập số âm vào ô nhập số trang',
     '1. Nhập dấu trừ rồi nhập số vào ô "Nhập số trang".',
     'Ô không nhận dấu trừ nên không nhập được số âm. Trang đang xem không thay đổi.'),
    ('nhap 0', 'Kiểm tra nhập 0 vào ô nhập số trang',
     '1. Nhập 0 vào ô "Nhập số trang".\n2. Nhấn Enter hoặc bấm ra ngoài ô.',
     'Không chuyển trang. Ô tự trả về số trang đang xem.'),
    ('nho hon so trang', 'Kiểm tra nhập số nhỏ hơn tổng số trang vào ô nhập số trang',
     '1. Nhập một số trong khoảng từ 1 đến nhỏ hơn tổng số trang.\n'
     '2. Nhấn Enter hoặc bấm ra ngoài ô.',
     'Chuyển đúng tới trang vừa nhập. Danh sách nạp lại theo trang đó.'),
    ('lon hon so trang', 'Kiểm tra nhập số lớn hơn tổng số trang vào ô nhập số trang',
     '1. Nhập một số lớn hơn tổng số trang.\n2. Nhấn Enter hoặc bấm ra ngoài ô.',
     'Không chuyển trang. Ô tự trả về số trang đang xem và không báo lỗi.'),
    ('bang so trang', 'Kiểm tra nhập số bằng đúng tổng số trang vào ô nhập số trang',
     '1. Nhập số bằng đúng tổng số trang.\n2. Nhấn Enter hoặc bấm ra ngoài ô.',
     'Chuyển tới trang cuối. Nút chuyển tới trang sau và trang cuối chuyển sang mờ.'),
]

# ── TIÊU ĐỀ CỘT SẮP XẾP — bộ MỚI 2026-09-10 ──────────────────────────────────────────────
# Vì sao trước đây không có: luật §0.10 và §0.13 GỌI TÊN nhóm này đích danh (*"case sắp xếp gộp
# thành nhóm `Tiêu đề cột sắp xếp` trong `Validate` của CN danh sách"*) và PROMPT v3 xếp nó vào
# danh sách control của CN danh sách — nhưng §3 KHÔNG có dòng định mức, và tên nhóm còn trúng
# khoá rộng `'cot '` của `qalib.SKIP_KW` ⇒ `kind_of` trả (None, 0) ⇒ nhóm rỗng vĩnh viễn.
# Đo được: `tach_cn_timkiem.py` dựng nhóm này cho `Admin-LoaiVanDe` rồi chỉ chuyển ĐÚNG MỘT case
# viết tay vào đó, và cả 13 bộ rà vẫn ra 0. Cùng lớp lỗi `Breadcrumb` / `Thẻ số liệu` (vá 09/09).
#
# ⛔ KHÔNG có mục *"sắp xếp thì về trang 1"* — luật §0.10 BỎ HẲN case đó (định mức `Phân trang`
#    đã có mục *vị trí trang sau 1 thao tác*). Thêm lại là phạm luật.
# Mục nào phụ thuộc từng app thì bảo GHI NGUYÊN TRẠNG, không khẳng định thay (lối `DATEPICKER_NATIVE`).
COT_SAP_XEP = [
    ('gia tri mac dinh', 'Kiểm tra thứ tự mặc định của danh sách khi chưa sắp xếp',
     '1. Mở màn danh sách, chưa bấm vào tiêu đề cột nào.\n'
     '2. Quan sát thứ tự các dòng và dấu hiệu sắp xếp trên hàng tiêu đề.',
     'Danh sách xếp theo thứ tự mặc định của màn. Không cột nào mang dấu hiệu đang được sắp xếp.'),
    ('cot sap xep duoc', 'Kiểm tra dấu hiệu nhận biết cột sắp xếp được',
     '1. Rê chuột lần lượt qua từng tiêu đề cột trên hàng tiêu đề.',
     'Cột sắp xếp được có dấu hiệu nhận biết. Cột không sắp xếp được thì không có dấu hiệu nào.'),
    ('sap xep tang dan', 'Kiểm tra sắp xếp tăng dần theo tiêu đề cột',
     '1. Bấm một lần vào tiêu đề của một cột sắp xếp được.\n'
     '2. Đối chiếu thứ tự các dòng đang hiện.',
     'Danh sách xếp tăng dần theo giá trị của cột đó. Mũi tên trên tiêu đề cột chỉ chiều tăng.'),
    ('sap xep giam dan', 'Kiểm tra sắp xếp giảm dần theo tiêu đề cột',
     '1. Bấm lần thứ hai vào tiêu đề cột vừa sắp xếp.\n'
     '2. Đối chiếu thứ tự các dòng đang hiện.',
     'Danh sách đảo thành giảm dần theo giá trị của cột đó. Mũi tên trên tiêu đề cột đổi chiều.'),
    ('chi mot cot', 'Kiểm tra sắp xếp khi bấm sang tiêu đề cột khác',
     '1. Sắp xếp theo một cột.\n2. Bấm sang tiêu đề của một cột khác.',
     'Chỉ cột vừa bấm có hiệu lực sắp xếp. Cột trước đó bỏ dấu hiệu sắp xếp và danh sách xếp lại theo cột mới.'),
    ('giu bo loc', 'Kiểm tra sắp xếp khi đang áp bộ lọc hoặc từ khoá tìm kiếm',
     '1. Áp một bộ lọc hoặc nhập từ khoá tìm kiếm.\n2. Bấm vào tiêu đề cột để sắp xếp.',
     'Bộ lọc và từ khoá được giữ nguyên. Danh sách chỉ đổi thứ tự trong phạm vi dữ liệu đã lọc.'),
    ('sap xep toan bo du lieu', 'Kiểm tra phạm vi sắp xếp khi danh sách có nhiều trang',
     '1. Để danh sách có nhiều trang.\n2. Sắp xếp theo một cột.\n'
     '3. Xem dòng đầu trang đang xem và dòng cuối của trang cuối.',
     'Sắp xếp áp trên toàn bộ dữ liệu chứ không chỉ các dòng của trang đang xem. Thứ tự liền mạch khi chuyển qua các trang.'),
]

CHECKBOX_GRID = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định của ô tích chọn trên danh sách',
     '1. Mở màn danh sách, xem cột ô tích chọn.',
     'Mọi ô tích chọn đều đang bỏ trống. Thanh hành động hàng loạt chưa hiện.'),
    ('chon checkbox', 'Kiểm tra tích chọn ô tích chọn của một bản ghi',
     '1. Tích vào ô tích chọn của một bản ghi bất kỳ.',
     '1. Ô tích chọn của bản ghi đó được tích.\n2. Thanh hành động hàng loạt hiện lên '
     'kèm số bản ghi đang chọn.'),
    ('bo chon checkbox', 'Kiểm tra bỏ tích ô tích chọn của một bản ghi',
     '1. Tích chọn một bản ghi.\n2. Bỏ tích chính bản ghi đó.',
     '1. Ô tích chọn trở về trạng thái trống.\n2. Thanh hành động hàng loạt ẩn đi khi '
     'không còn bản ghi nào được chọn.'),
    ('chon check all', 'Kiểm tra tích chọn ô tích chọn tất cả trên hàng tiêu đề',
     '1. Tích vào ô tích chọn ở hàng tiêu đề của bảng.',
     'Toàn bộ bản ghi trên trang đang xem được tích. Số bản ghi trên thanh hành động bằng số bản ghi của trang đang xem.'),
    ('bo chon check all', 'Kiểm tra bỏ tích ô tích chọn tất cả trên hàng tiêu đề',
     '1. Tích ô tích chọn tất cả.\n2. Bỏ tích ô tích chọn tất cả.',
     'Toàn bộ ô tích chọn trở về trạng thái trống. Thanh hành động hàng loạt ẩn đi.'),
    ('doi trang sau khi chon', 'Kiểm tra ô tích chọn khi chuyển sang trang khác',
     '1. Tích chọn vài bản ghi ở trang 1.\n2. Chuyển sang trang 2.\n3. Quay lại trang 1.',
     'Nêu rõ hệ thống giữ hay bỏ lựa chọn khi đổi trang. Số bản ghi trên thanh hành động phải khớp với số bản ghi thực sự sẽ bị tác động.'),
]

# ── Bổ sung 2026-09-07: khối CHỨC NĂNG của CN CHUYỂN TRẠNG THÁI ──────────────────────────
# Họ màn danh mục MOET (CategoryCrudPage) dựng với `deleteAsStatus: true` — KHÔNG có thao
# tác Xoá, biểu tượng trên bản ghi gọi `changeStatus`. `complete_func.kind()` trả None cho
# nhóm mở đầu "chuyen trang thai" / "huy" / "dong " nên 8 nhóm này luôn RỖNG
# (`audit_extra` báo "nhóm rỗng"). Bộ case bám 8 mục của CN Xóa ở §6, đổi xóa -> chuyển trạng thái.

STATUS_FN = [
    ('huy bo thao tac chuyen trang thai', 'Kiểm tra việc hủy bỏ thao tác chuyển trạng thái',
     '1. Bấm biểu tượng chuyển trạng thái trên một bản ghi.\n2. Bấm "Hủy" trong hộp xác nhận.',
     'Hủy bỏ thành công. Trạng thái của bản ghi không thay đổi trên danh sách.'),
    ('icon dong', 'Kiểm tra click icon đóng trên hộp xác nhận chuyển trạng thái',
     'Bấm biểu tượng X để đóng hộp xác nhận chuyển trạng thái.',
     '1. Hộp thoại được đóng lại, màn hình giữ nguyên.\n2. Trạng thái bản ghi không thay đổi.'),
    ('chuyen trang thai thanh cong', 'Kiểm tra chuyển trạng thái thành công',
     '1. Bấm biểu tượng chuyển trạng thái trên một bản ghi đang Hoạt động.\n'
     '2. Bấm "Chuyển trạng thái" trong hộp xác nhận.',
     '1. Thông báo chuyển trạng thái thành công.\n2. Cột Trạng thái của bản ghi đó đổi sang '
     'Không hoạt động và biểu tượng trên bản ghi đổi thành biểu tượng khôi phục.'),
    ('chuyen trang thai nguoc lai', 'Kiểm tra chuyển trạng thái trở lại Hoạt động',
     '1. Bấm biểu tượng chuyển trạng thái trên một bản ghi đang Không hoạt động.\n'
     '2. Bấm "Chuyển trạng thái" trong hộp xác nhận.',
     '1. Thông báo chuyển trạng thái thành công.\n2. Cột Trạng thái đổi sang Hoạt động.'),
    ('click lien tuc vao button', 'Kiểm tra click liên tục vào button Chuyển trạng thái',
     '1. Bấm biểu tượng chuyển trạng thái trên bản ghi.\n'
     '2. Bấm liên tục nhiều lần vào nút "Chuyển trạng thái".',
     'Hệ thống không gửi yêu cầu nhiều lần. Chỉ đổi trạng thái một lần, không báo lỗi.'),
    ('tab va enter lien tuc', 'Kiểm tra Tab và Enter liên tục vào button Chuyển trạng thái',
     '1. Bấm biểu tượng chuyển trạng thái trên bản ghi.\n'
     '2. Nhấn Tab tới nút "Chuyển trạng thái" rồi nhấn Enter liên tục.',
     'Hệ thống không gửi yêu cầu nhiều lần. Chỉ đổi trạng thái một lần, không báo lỗi.'),
    ('2 tab hoac 2 client',
     'Kiểm tra chuyển trạng thái cùng một bản ghi cùng lúc từ 2 tab hoặc 2 client khác nhau',
     '1. Mở cùng một bản ghi trên 2 tab (hoặc 2 máy), bấm biểu tượng chuyển trạng thái ở cả hai.\n'
     '2. Tab 1 (Client 1): bấm "Chuyển trạng thái".\n'
     '3. Tab 2 (Client 2): bấm "Chuyển trạng thái".',
     'Tab 1 (Client 1): chuyển trạng thái thành công.\n'
     'Tab 2 (Client 2): không chuyển được vì bản ghi đã đổi trạng thái trước đó.'),
]

STATUS_BULK_FN = [
    ('huy bo thao tac chuyen trang thai hang loat',
     'Kiểm tra việc hủy bỏ thao tác chuyển trạng thái hàng loạt',
     '1. Tích chọn từ 2 bản ghi trở lên.\n2. Bấm nút chuyển trạng thái trên thanh hành động.\n'
     '3. Bấm "Hủy" trong hộp xác nhận.',
     'Hủy bỏ thành công. Trạng thái của các bản ghi đã chọn không thay đổi.'),
    ('icon dong', 'Kiểm tra click icon đóng trên hộp xác nhận chuyển trạng thái hàng loạt',
     'Bấm biểu tượng X để đóng hộp xác nhận chuyển trạng thái hàng loạt.',
     '1. Hộp thoại được đóng lại.\n2. Trạng thái các bản ghi đã chọn không thay đổi.'),
    ('chuyen trang thai hang loat thanh cong',
     'Kiểm tra chuyển trạng thái hàng loạt thành công',
     '1. Tích chọn từ 2 bản ghi trở lên đang cùng trạng thái Hoạt động.\n'
     '2. Bấm nút ngừng hoạt động trên thanh hành động.\n'
     '3. Bấm "Chuyển trạng thái" trong hộp xác nhận.',
     '1. Thông báo chuyển trạng thái đúng số bản ghi đã chọn.\n'
     '2. Các bản ghi đó đổi sang Không hoạt động và lựa chọn được xóa sạch.'),
    ('chon nhieu ban ghi khac trang',
     'Kiểm tra chuyển trạng thái hàng loạt khi chọn bản ghi ở nhiều trang khác nhau',
     '1. Tích chọn vài bản ghi ở trang 1.\n2. Chuyển sang trang 2, tích chọn thêm vài bản ghi.\n'
     '3. Bấm nút chuyển trạng thái rồi xác nhận.',
     'Số bản ghi được chuyển trạng thái phải đúng bằng số bản ghi ghi trên hộp xác nhận. Không được bỏ sót bản ghi đã chọn ở trang trước.'),
    ('chon ban ghi khac trang thai',
     'Kiểm tra chuyển trạng thái hàng loạt khi chọn các bản ghi khác trạng thái nhau',
     '1. Tích chọn đồng thời bản ghi đang Hoạt động và bản ghi đang Không hoạt động.\n'
     '2. Quan sát thanh hành động hàng loạt.',
     'Nút chuyển trạng thái chuyển sang mờ hoặc hệ thống nêu rõ chỉ áp dụng cho nhóm bản ghi cùng trạng thái. Không đổi trạng thái sai nhóm.'),
    ('click lien tuc vao button',
     'Kiểm tra click liên tục vào button Chuyển trạng thái hàng loạt',
     '1. Tích chọn nhiều bản ghi rồi mở hộp xác nhận.\n'
     '2. Bấm liên tục nhiều lần vào nút "Chuyển trạng thái".',
     'Hệ thống không gửi yêu cầu nhiều lần. Chỉ đổi trạng thái một lần, không báo lỗi.'),
    ('tab va enter lien tuc',
     'Kiểm tra Tab và Enter liên tục vào button Chuyển trạng thái hàng loạt',
     '1. Tích chọn nhiều bản ghi rồi mở hộp xác nhận.\n'
     '2. Nhấn Tab tới nút "Chuyển trạng thái" rồi nhấn Enter liên tục.',
     'Hệ thống không gửi yêu cầu nhiều lần. Chỉ đổi trạng thái một lần, không báo lỗi.'),
    ('2 tab hoac 2 client',
     'Kiểm tra chuyển trạng thái hàng loạt cùng lúc từ 2 tab hoặc 2 client khác nhau',
     '1. Trên 2 tab (hoặc 2 máy) cùng tích chọn một nhóm bản ghi.\n'
     '2. Tab 1 (Client 1): bấm "Chuyển trạng thái".\n'
     '3. Tab 2 (Client 2): bấm "Chuyển trạng thái".',
     'Tab 1 (Client 1): chuyển trạng thái thành công.\n'
     'Tab 2 (Client 2): không chuyển được vì các bản ghi đã đổi trạng thái trước đó.'),
]

STATUS_FN_CANCEL = [
    ('huy bo chuyen trang thai', 'Kiểm tra hủy bỏ chuyển trạng thái',
     '1. Mở hộp xác nhận chuyển trạng thái từ một bản ghi.\n2. Bấm "Hủy" hoặc biểu tượng X.',
     'Đóng hộp xác nhận. Trạng thái bản ghi không thay đổi. Danh sách giữ nguyên.'),
]

# ── Khối CHỨC NĂNG: nhóm "Chức năng Tìm kiếm chung" — mẫu ĐÚNG 4 mục ──────────────────
# Bổ sung 2026-09-04: bộ rà audit_func trước đây chỉ đòi 2 mục đầu nên 41/43 nhóm thiếu
# 2 mục cuối mà vẫn báo sạch. Wording bám mẫu (r128–r131 của DanhMucTuDienDungChung.xlsx).
SEARCH_COMMON = [
    # C/D lấy NGUYÊN VĂN mẫu `DanhMucTuDienDungChung.xlsx` r128-r131 (chốt 2026-09-08 — trước đó
    # là bản diễn giải riêng của dự án, 8/8 ô C+D lệch mẫu). Mẫu là bậc 2 của thang nguồn nên
    # thắng ở phần WORDING. Giá trị ví dụ ở mục 4 ("Trạng thái Hoạt động", "Mã 01") là của chính
    # mẫu — bước A6 phải đổi theo tiêu chí thật của màn, giống lối `PAGING_YCHANG` để "trang thứ 4".
    ('gia tri mac dinh', 'Tìm kiếm theo giá trị mặc định',
     '1. Truy cập vào màn hình Danh sách/Tìm kiếm. \n2. Không nhập hay chọn bất kỳ tiêu chí tìm kiếm nào.',
     'Hệ thống tự động hiển thị danh sách kết quả/dữ liệu thỏa mãn điều kiện mặc định ban đầu.'),
    ('khong ra ket qua', 'Tìm kiếm không ra kết quả với từng điều kiện tìm kiếm hoặc tất cả các điều kiện',
     'Trên màn hình Tìm kiếm:\n- Nhập hoặc chọn các tiêu chí tìm kiếm không có kết quả\n ',
     'Hiển thị thông báo: Không tìm thấy kết quả tìm kiếm'),
    ('ket hop tat ca cac dieu kien', 'Tìm kiếm kết hợp tất cả các điều kiện tìm kiếm',
     'Nhập/chọn tất cả các điều kiện tìm kiếm\n',
     'Hiện thị kết quả thỏa mãn điều kiện tìm kiếm'),
    ('2 dieu kien khac nhau cung so ban ghi', 'Thực hiện tìm kiếm lần lượt 2 điều kiện khác nhau nhưng đều ra số bản ghi kết quả giống nhau',
     '1. Nhập điều kiện tìm kiếm 1 -> ra kết quả n bản ghi thỏa mãn tiêu chí 1\n'
     '- Trạng thái Hoạt động\n- Mã 01\n'
     '2. Nhập tiếp điều kiện tìm kiếm 2 \n'
     "- Trạng thái Hoạt động\n- Tên 'Từ điển Tiếng Anh'",
     'Hiển thị kết quả n bản ghi nhưng thỏa mãn tiêu chí 2'),
]

# ── Khối CHỨC NĂNG: nhóm "Chức năng Tìm kiếm đơn lẻ" ─────────────────────────────────
# Bổ sung 2026-09-04. Mẫu (r134–r142) cho 2 định mức:
#   · ô NHẬP CHỮ (Textbox / ô tìm)   = 6 mục  (SEARCH_SINGLE_TEXT)
#   · control CHỌN GIÁ TRỊ            = 2 mục  (SEARCH_SINGLE_PICK)
# `audit_func.py` trước 04/09 CỐ Ý bỏ qua nhóm này (`return None,None`) nên chưa từng được rà.


# ── Khối AN TOÀN THÔNG TIN — injection PER-FIELD ─────────────────────────────────────
# Chốt 2026-09-04. Payload + kết quả VERBATIM mẫu (r283–r293 form · r147–r150 ô tìm ·
# r570–r578 cột Excel). Bộ này KHÁC khối phân quyền/phiên mà `audit_attt.py` rà — hai
# khối CỘNG NHAU, không thay thế nhau (xem huong-dan/DOI-CHIEU-MAU-vs-LUAT.md §4).
#   · CN Thêm mới / Chỉnh sửa : 5 mục (có alert)
#   · CN Tìm kiếm / Nhập Excel: 4 mục (KHÔNG có alert)
# Chỉ thị 2026-09-04: áp cho MỌI ô gõ được, kể cả ô số / Email / SĐT / mật khẩu.

# Bỏ đuôi `(không thực thi mã)` 2026-09-12: mẫu KHÔNG có ngoặc giải thích ở câu này, và §8.2.1
# cấm ngoặc đơn giải thích ở cột D. Một literal này nở ra 14 case (3 bank ATTT × các biến thể).
_KQ_FORM = ('- Hệ thống không cho phép Insert\n'
            '- Hoặc cho phép Insert đúng chuỗi dữ liệu nhập vào và hiển thị ra cũng đúng '
            'chuỗi đã nhập')
_KQ_TIM  = ('Hệ thống thực hiện tìm kiếm và:\n'
            '- Hiển thị các kết quả hợp lệ nếu có\n'
            '- Hiển thị không tìm thấy kết quả tìm kiếm nếu không có kết quả thoả mãn')

def _attt(nhan, buoc_cuoi, kq):
    """Sinh bộ case ATTT cho một ô nhập: (khoá, Mục đích, Các bước, Kết quả)."""
    b2 = '\n2. Nhập, chọn hợp lệ các trường còn lại.\n3. ' + buoc_cuoi
    return [
        ('xss tho', 'XSS (Kiểm tra lỗi khi nhập Script HTML) — {f}',
         '1. Nhập vào ô "{f}" đoạn script: <b>1</b>' + b2, kq),
        ('hexa url', 'XSS (Kiểm tra lỗi khi nhập Script HTML mã hóa hexa dạng URL) — {f}',
         '1. Nhập vào ô "{f}" đoạn script <b>1</b> đã mã hóa hexa dạng URL: '
         '%3cb%3e1%3c%2fb%3e' + b2, kq),
        ('hexa html', 'XSS (Kiểm tra lỗi khi nhập Script HTML mã hóa hexa dạng HTML) — {f}',
         '1. Nhập vào ô "{f}" đoạn script <b>1</b> đã mã hóa hexa dạng HTML: '
         '&lt;b&gt;1&lt;/b&gt;' + b2, kq),
        ('alert', 'XSS (Kiểm tra lỗi khi nhập alert) — {f}',
         '1. Nhập vào ô "{f}" đoạn: "testXSS" autofocus="on" onfocus="alert(1)" '
         '<img src ="a" onerror="alert(1)">' + b2,
         'Không hiển thị màn hình alert. Chuỗi vừa nhập được xử lý như văn bản thường.'),
        ('sqli', 'SQL Injection (Kiểm tra khi ' + nhan + ') — {f}',
         '1. Nhập vào ô "{f}" đoạn: (SELECT 1 FROM dual)' + b2, kq),
    ]

ATTT_ADD    = _attt('Insert', 'Bấm nút lưu.', _KQ_FORM)                    # CN Thêm mới  — 5 mục
ATTT_EDIT   = _attt('update', 'Bấm nút lưu.', _KQ_FORM)                    # CN Chỉnh sửa — 5 mục
# ô tìm kiếm & cột Excel: 4 mục, BỎ biến thể alert (đúng mẫu)
ATTT_SEARCH = [c for c in _attt('trường trong CSDL là xâu', 'Bấm nút tìm kiếm hoặc nhấn Enter.', _KQ_TIM)
               if c[0] != 'alert']
ATTT_IMPORT = [c for c in _attt('Insert hoặc update',
                                'Tải tệp lên rồi bấm nút Nhập excel.', _KQ_FORM)
               if c[0] != 'alert']

# -- CN NHAP EXCEL / XUAT EXCEL -- khung mau (r560-r568 . r581-r585) ------------------
# Chốt 2026-09-04: Nhập excel và Xuất excel là HAI CN RIÊNG, cấu trúc theo mẫu.
#   CN NHẬP: Giao diện chung 6 · Validate{Tải file mẫu · File excel · từng cột} ·
#            Chức năng{Nhập excel 9 · Hủy bỏ 1 · Đóng 1} · ATTT{File type 3 · từng cột 4}
#   CN XUẤT: Giao diện chung = ĐÚNG 2 case của mẫu (nói về FILE XUẤT RA, không phải màn hình) ·
#            miễn Validate · Chức năng · ATTT (dự án bổ sung)

IMPORT_FN_CANCEL = [
    ('huy bo nhap excel', 'Kiểm tra hủy bỏ nhập excel',
     '1. Chọn tệp và nhập dữ liệu đầy đủ, hợp lệ cho các trường.\n2. Bấm Hủy bỏ hoặc biểu tượng X.',
     'Đóng hộp thoại. Không nạp bản ghi nào vào hệ thống.'),
]
IMPORT_FN_CLOSE = [
    ('dong popup ket qua', 'Kiểm tra Đóng popup kết quả nhập excel',
     '1. Ở hộp thoại kết quả nhập excel.\n2. Bấm Đóng hoặc biểu tượng X.',
     'Đóng hộp thoại kết quả. Danh sách phía sau giữ nguyên dữ liệu vừa nạp.'),
]
# ATTT -- nhom "File type" cua CN Nhap excel, 3 case verbatim mau r566-r568
# 2026-09-07: mẫu để CẢ BA case cùng tên "Check file type khi upload" -> vi phạm mục 3 §12
# (không case trùng tên trong cùng nhóm) và người chạy live không phân biệt được case nào.
# Tách tên theo mục đang kiểm; phần cột C/D giữ verbatim mẫu.
ATTT_FILETYPE = [
    ('dinh dang khong hop le', 'Check file type khi upload — định dạng không hợp lệ',
     'Tải lên tệp KHÔNG thuộc các định dạng .xls, .xlsx',
     'Thông báo lỗi: tệp có định dạng không hợp lệ, chỉ.xls và.xlsx được phép. Hoặc hệ thống chặn không cho chọn tệp sai định dạng.'),
    ('dinh dang hop le', 'Check file type khi upload — định dạng hợp lệ',
     'Tải lên tệp thuộc một trong các định dạng: .xls, .xlsx',
     'Hệ thống nhận tệp thành công.'),
    ('file thuc thi', 'Check file type khi upload — tệp thực thi',
     'Thực hiện tải lên tệp thực thi .exe, .bat, .php',
     'Hệ thống không cho phép tải lên.'),
]
# Giao dien chung cua CN XUAT EXCEL -- DUNG 2 case mau (r582-r583)
# ⚠️ 2026-09-10 — người đặt việc chốt lại NỘI DUNG hai case này (ảnh mẫu gửi kèm):
#   · case 1 phải LIỆT KÊ ĐẦY ĐỦ TÊN CỘT trong file xuất ra (không nói chung chung "đầy đủ các
#     cột theo thiết kế" — người chạy test không có gì để đối chiếu);
#   · case 2 phải nêu đủ TÊN FILE · TIÊU ĐỀ FILE · THỜI GIAN XUẤT · quy tắc trình bày dữ liệu ·
#     quy tắc tiêu đề cột · ghim tiêu đề cột khi cuộn.
# Chỗ giữ `<…>` để `Plan._can_verify()` tự gắn [CẦN VERIFY] khi màn chưa ground được.
_EXPORT_GDC_TPL = [
    ('day du thong tin trong file xuat ra', 'Kiểm tra đầy đủ thông tin trong file xuất ra',
     '1. Trên màn hình chức năng.\n2. Click button Xuất excel.\n3. Mở file vừa tải về.',
     'File excel hiển thị đầy đủ các cột: {cot}.\n'
     'Không thiếu cột nào, không thừa cột kỹ thuật (id, mã nội bộ).'),
    ('file excel xuat ra', 'Kiểm tra file excel xuất ra',
     '1. Trên màn hình chức năng.\n2. Click button Xuất excel.',
     '1. Tên file và tiêu đề file:\n- File xuất ra có tên là: {ten_file}, trong đó {phan_ngay} là ngày tháng năm xuất dữ liệu\n- Tiêu đề của file: {tieu_de_file}\n- Thời gian xuất: Thời gian mà hệ thống xuất dữ liệu và tải được file về máy, có định dạng là dd/mm/yyyy hh:mm:ss\n2. Dữ liệu\n- File excel được tải xuống thành công, hiển thị dữ liệu chính xác, dữ liệu hiển thị theo quy tắc: cột STT căn giữa, {cot_phai} canh phải, các cột còn lại căn trái, các cột được kẻ ô, không bị lỗi font chữ\n- Tiêu đề cột: In đậm, căn trái, riêng cột STT căn giữa, {cot_phai} canh phải\n- Tiêu đề cột trong file excel phải được ghim lại khi cuộn chuột xuống'),
]
# Giá trị mặc định khi hồ sơ màn chưa ground được — CHỖ GIỮ, không phải câu trả lời.
EXPORT_MAC_DINH = {
    'cot': '<danh sách cột của file xuất>',
    'ten_file': '<tên file xuất>',
    'phan_ngay': '<phần ngày trong tên file>',
    'tieu_de_file': '<tiêu đề bên trong file>',
    'cot_phai': 'các cột số',
}


# `EXPORT_GDC` giữ NGUYÊN TÊN và NGUYÊN KIỂU (danh sách 4-tuple chuỗi ĐÃ ĐIỀN) để hai script
# cũ dùng trực tiếp nó — `patch_excel_cn.py` và `tach_cn_xuat_khaosat.py` — không ghi ra chuỗi
# còn nguyên `{cot}` `{ten_file}`. Bản template nằm ở `_EXPORT_GDC_TPL`; ai có hồ sơ màn thì
# gọi `export_gdc(spec)` để lấy bản điền theo màn.
EXPORT_GDC = [(k, t, c.format(**EXPORT_MAC_DINH), d.format(**EXPORT_MAC_DINH))
              for k, t, c, d in _EXPORT_GDC_TPL]


def export_gdc(spec=None):
    """EXPORT_GDC đã điền theo hồ sơ màn — thiếu dữ kiện nào thì để CHỖ GIỮ cho [CẦN VERIFY].

    Nguồn: `verbatim.cot_bang` (bỏ cột `Hành động` — nút bấm trên màn, không có trong file
    xuất) và `verbatim.xuat_excel.*`.
    """
    v = ((spec or {}).get('grounding') or {}).get('verbatim') or {}
    ra = dict(EXPORT_MAC_DINH)
    cot = [c for c in (v.get('cot_bang') or []) if norm_bo_dau(c) != 'hanh dong']
    if cot:
        ra['cot'] = ' · '.join(cot)
    xe = v.get('xuat_excel') or {}
    if xe.get('ten_file_mac_dinh'):
        ra['ten_file'] = xe['ten_file_mac_dinh']
    if xe.get('tieu_de_file'):
        ra['tieu_de_file'] = xe['tieu_de_file']
    if xe.get('phan_ngay_ten_file'):
        ra['phan_ngay'] = xe['phan_ngay_ten_file']
    if xe.get('cot_can_phai'):
        ra['cot_phai'] = 'cột %s' % xe['cot_can_phai']
    return [(k, t, c.format(**ra), d.format(**ra)) for k, t, c, d in _EXPORT_GDC_TPL]


# -- CN XOA -- khoi Chuc nang, 8 muc cua mau (r451-r458) -------------------------------
# Chốt 2026-09-04: bộ rà trước đây chỉ đòi 4 mục nên thiếu hẳn 6 mục của mẫu.
# Giữ thêm 2 mục riêng của dự án (chặn xóa khi đang dùng · xóa bản ghi không tồn tại).
DELETE_FN = [
    ('huy bo thao tac xoa', 'Kiểm tra việc hủy bỏ thao tác xóa',
     '1. Bấm biểu tượng xóa trên bản ghi.\n2. Bấm "Hủy bỏ" trong hộp xác nhận.',
     'Hủy bỏ thành công thao tác xóa. Bản ghi không bị xóa và vẫn còn trong danh sách.'),
    ('icon dong', 'Kiểm tra click icon đóng trên màn hình xóa',
     'Bấm biểu tượng X để đóng hộp xác nhận xóa.',
     '1. Hộp thoại được đóng lại, màn hình giữ nguyên.\n2. Bản ghi không bị xóa khỏi danh sách.'),
    ('chon nhieu ban ghi de xoa', 'Kiểm tra chọn nhiều bản ghi để xóa',
     '1. Tích chọn từ 2 bản ghi trở lên.\n2. Bấm nút "Xóa".\n3. Bấm nút "Xóa" trong hộp xác nhận.',
     'Thông báo xóa thành công đúng số bản ghi đã chọn. Các bản ghi đó không còn trong danh sách.'),
    ('click lien tuc vao button xoa', 'Kiểm tra click liên tục vào button Xóa',
     '1. Bấm biểu tượng xóa trên bản ghi.\n2. Bấm liên tục nhiều lần vào nút "Xóa".',
     'Hệ thống không gửi yêu cầu nhiều lần. Chỉ xóa một lần, không báo lỗi.'),
    ('tab va enter lien tuc', 'Kiểm tra Tab và Enter liên tục vào button Xóa',
     '1. Bấm biểu tượng xóa trên bản ghi.\n2. Nhấn Tab tới nút "Xóa" rồi nhấn Enter liên tục.',
     'Hệ thống không gửi yêu cầu nhiều lần. Chỉ xóa một lần, không báo lỗi.'),
    ('2 tab hoac 2 client', 'Kiểm tra khi xóa trùng dữ liệu cùng lúc từ 2 tab hoặc 2 client khác nhau',
     '1. Mở cùng một bản ghi trên 2 tab (hoặc 2 máy) và bấm biểu tượng xóa ở cả hai.\n'
     '2. Tab 1 (Client 1): bấm nút Xóa.\n3. Tab 2 (Client 2): bấm nút Xóa.',
     'Tab 1 (Client 1): xóa thành công.\nTab 2 (Client 2): báo lỗi vì bản ghi đã được xóa trước đó.'),
]

# -- CN THEM MOI / CHINH SUA -- nhom "Chuc nang Huy bo" (mau r279 . r418-r419) ---------
# Chốt 2026-09-04: mẫu cho MỖI CN Thêm mới và Chỉnh sửa một nhóm `Chức năng Hủy bỏ` 1 case.
# Bộ rà `audit_func` chỉ soi nhóm ĐÃ CÓ nên CN thiếu hẳn nhóm này không bị bắt (35 CN).
FORM_FN_CANCEL_ADD = [
    ('huy bo them moi', 'Kiểm tra hủy bỏ thêm mới',
     '1. Nhập dữ liệu đầy đủ và hợp lệ cho các trường.\n2. Bấm "Hủy bỏ" hoặc biểu tượng X.',
     'Đóng biểu mẫu. Không thêm mới bản ghi nào. Danh sách giữ nguyên như trước.'),
]
FORM_FN_CANCEL_EDIT = [
    ('huy bo chinh sua', 'Kiểm tra hủy bỏ chỉnh sửa',
     '1. Sửa dữ liệu ở một vài trường trên biểu mẫu.\n2. Bấm "Hủy bỏ" hoặc biểu tượng X.',
     'Đóng biểu mẫu. Không chỉnh sửa bản ghi nào. Dữ liệu cũ được giữ nguyên.'),
]

# -- Nhom PHAN TRANG -- 14 muc VERBATIM MAU (r50-r63), chot 2026-09-04 -----------------
# Bảng `PAGING` phía trên là bộ do dự án tự đặt (đủ 14 case nhưng KHÁC mẫu ở 5 mục cuối).
# Bảng này bám mẫu để bơm bù: 4 case "vị trí trang sau 1 thao tác" · lưu cache · style ·
# menu-header-footer · ngưỡng số bản ghi (=/</> số bản ghi mỗi trang).


# -- Nhom PHAN TRANG -- BO DUY NHAT: 14 case Y CHANG MAU (r50-r63) --------------------
# Chỉ thị người đặt việc 2026-09-04 + 2026-09-07: nhóm `Phân trang` = ĐÚNG 14 case của mẫu,
# VERBATIM cả 3 cột. Hai bộ cũ (bộ dự án tự đặt · bộ diễn đạt lại) đã bị LƯỢC BỎ 2026-09-07 —
# đừng thêm biến thể mới, mọi đường bơm phải trỏ về đây (qalib.KINDSRC · BY_KIND ·
# patch_paging_mau.py · set_paging_mau.py).
# 4 case 'vị trí trang sau 1 thao tác' dùng CÙNG một tiêu đề như mẫu, khác nhau ở cột C/D
# -> `qalib.DUP_OK` miễn phép rà trùng tên cho đúng tiêu đề đó.
# ⚠️ CHỈ THỊ 2026-09-10 THẮNG MẪU ở 4 case đó: tiêu đề khép thêm hậu tố **"nếu có"**
# (`… trên trang dữ liệu nếu có`). Mẫu viết trống hậu tố nên case đọc thành lời KHẲNG ĐỊNH màn
# có đủ sửa/xoá/thêm mới — sai với màn chỉ-đọc hoặc màn bỏ hẳn một thao tác (họ `CategoryCrudPage`
# + `deleteAsStatus`), y hệt ca `Kiểm tra màu icon xóa nếu có` của bộ `ICON`. Luật dùng chung ở
# `qalib.CASE_CAN_HAU_TO`; bộ đã sinh trả hậu tố bằng `fix_hau_to.py`; `audit_extra` phép ⑪ chặn
# tái diễn. ⛔ Đừng "khôi phục cho giống mẫu" — đây là chỗ chỉ thị đứng trên mẫu (README thang bậc).
# Hậu tố KHÔNG phá `qalib.DUP_OK` (khớp chuỗi con) — 4 case vẫn được miễn phép rà trùng tên.
PAGING_YCHANG = [
    ('muc 01',
     'Kiểm tra cách đánh số các bản ghi',
     'Trong grid dữ liệu\nKiểm tra số thứ tự các bản ghi.',
     'Đánh số thứ tự tăng dần và liên tục: Số thứ tự đầu tiên của trang sau là số tiếp theo của trang trước.'),
    ('muc 02',
     'Kiểm tra mở các trang',
     'Chọn vào số trang bất kỳ: trang đầu, trang cuối, trang giữa',
     'Mở trang tương ứng\nSố bản ghi đầu tiên của trang sau là số tiếp theo của trang trước.'),
    ('muc 03',
     'Kiểm tra hiển thị menu và header, footer sau khi chuyển trang',
     'Trên grid\nThực hiện chuyển các trang sau',
     'Menu, header, footer không thay đổi'),
    ('muc 04',
     'Style của paging',
     'Kiểm tra cách hiển thị của chức năng phân trang',
     'Hiển thị như hình'),
    ('muc 05',
     'Kiểm tra hiển thị 20 bản ghi',
     'Kiểm tra dữ liệu đủ 20 bản ghi',
     'Ko hiển thị phân trang hoặc Disable phân trang'),
    ('muc 06',
     'Kiểm tra hiển thị < 20 bản ghi',
     'Kiểm tra dữ liệu đủ 20 bản ghi',
     'Ko hiển thị phân trang hoặc Disable phân trang'),
    ('muc 07',
     'Kiểm tra hiển thị 21 bản ghi',
     'Kiểm tra dữ liệu đủ 21 bản ghi',
     'Hiển thị phân Trang: là 2 trang\n+ Hiển thị số 1 2 > >>\n+ Enable icon > >>'),
    ('muc 08',
     'Kiểm tra icon Trang tiếp >\n(next page)',
     '1. Kiểm tra dữ liệu đủ 21 bản ghi\n2. Click vào icon > (nextpage)',
     '1. Hiển thị nội dung của page 2\n2. Disable icon > >>\n3. Enable icon < <<\n4. Textbox nhập số trang hiển thị 2'),
    ('muc 09',
     'Kiểm tra icon Trang trước <\n(previous page)',
     '1. Kiểm tra dữ liệu đủ 21 bản ghi\n2. Click vào icon < ( previous page)',
     '1. Hiển thị nội dung của page 2\n2. Disable icon < <<\n3. Enable icon > >>\n4. Textbox nhập số trang hiển thị 1'),
    ('muc 10',
     'Kiểm tra vị trí trang sau khi thực hiện 1 thao tác(sửa, xóa, thêm mới,... nếu có) trên trang dữ liệu nếu có',
     '1. Đang ở trang thứ 4, click vào nút "Thêm mới"\n2. Click vào nút "Hủy bỏ"',
     '1. Item được mở ra\n2. Vẫn ở lại trang thứ 4'),
    ('muc 11',
     'Kiểm tra vị trí trang sau khi thực hiện 1 thao tác(sửa, xóa, thêm mới,... nếu có) trên trang dữ liệu nếu có',
     '1. Đang ở trang thứ 4, click vào nút "Thêm mới"\n2. Nhập đầy đủ các trường bắt buộc\n3. Click vào nút "Lưu"',
     '1. Item được mở ra\n2. Quay lại trang 1 sau khi thêm mới thành công'),
    ('muc 12',
     'Kiểm tra vị trí trang sau khi thực hiện 1 thao tác(sửa, xóa, thêm mới,... nếu có) trên trang dữ liệu nếu có',
     '1. Đang ở trang thứ 4, chọn 1 item và click vào nút "xóa"\n2. Click nút "Xóa" trên confirm message',
     '1. Item được mở ra\n2. Vẫn ở lại trang thứ 4'),
    ('muc 13',
     'Kiểm tra vị trí trang sau khi thực hiện 1 thao tác(sửa, xóa, thêm mới,... nếu có) trên trang dữ liệu nếu có',
     'Có 21 bản ghi, chia làm 2 trang: trang 1 có 20 bản ghi, trang 2 có 1 bản ghi.\n1. Open trang thứ 2\n2. Delete bản ghi thứ 21 ở trang 2',
     'Quay lại trang 1 sau khi xóa thành công'),
    ('muc 14',
     'Kiểm tra lưu cache',
     '1. Tab 1: Click chọn danh sách A có 5 bản ghi\n2. Tab 2: Click chọn sang danh sách B cũng có 5 bản ghi',
     'Hệ thống không bị lưu cache'),
]

# -- Nhom DANH SACH -- 8 case Y CHANG MAU (r23-r30), chi thi 2026-09-04 --------------
# Chỉ thị: nhóm `Danh sách` = ĐÚNG 8 case của mẫu, VERBATIM cả 3 cột.
# ⚠️ CHỈ áp cho danh sách dạng BẢNG. Danh sách dạng THẺ/LƯỚI giữ nguyên nội dung hiện có
# (3 case của mẫu nói về CỘT — thẻ không có cột, xem luật §0.4.4). Script: `set_danhsach_mau.py`.
DANHSACH_YCHANG = [
    ('muc 01',
     'Kiểm tra giá trị mặc định',
     '1. Kiểm tra căn lề\n2. Di chuyển con trỏ chuột vào một row\n3. Kiểm tra bố cục trong grid\n4 Trỏ chuột vào các icon hoặc các link sẽ hiển thị tooltip\n5. Bỏ chuột khỏi các icon hoặc các link sẽ hiển thị tooltip',
     '1. Text: căn lề trái\nSố: Căn lề phải\nNgày tháng có số ký tự bằng nhau: Căn giữa.\nHeaderName: căn theo dữ liệu phía dưới\n2. Màu nền của row đó thay đổi\n3. Cột thứ tự và tên các cột khác xếp từ trái qua phải đúng như TKMH\nCác chức năng hành động đặt tại cuối bảng, khi scroll ngang phải ghim lại cột hành động, khi scroll dọc phải ghim lại tiêu đề.\nChức năng phân trang, tổng số bản ghi được đặt ở cuối của grid\n4. Hiển thị đúng tên tương ứng với các chức năng khi trỏ chuột vào tooltip\n5. Di chuột khỏi tooltip, thông báo sẽ mất đi'),
    ('muc 02',
     'Kiểm tra tiêu đề cột khớp với label trong form thêm mới',
     'Kiểm tra tiêu đề cột khớp với label tương ứng trong form thêm mới',
     'Tiêu đề cột khớp với label tương ứng trong form thêm mới'),
    ('muc 03',
     'Kiểm tra hiển thị khi không có dữ liệu',
     'Kiểm tra hiển thị khi không có dữ liệu',
     'Hiển thị icon kèm thông báo Không có dữ liệu'),
    ('muc 04',
     'Kiểm tra số lượng bản ghi',
     'Kiểm tra thống kê tổng số bản ghi có khớp với số lượng trong danh sách không',
     'Số lượng khớp nhau'),
    ('muc 05',
     'Kiểm tra dữ liệu hiển thị đúng cột',
     'Kiểm tra dữ liệu hiển thị đúng cột',
     'Dữ liệu hiển thị đúng cột, không xộc xệch'),
    ('muc 06',
     'Kiểm tra độ rộng các cột',
     'Kiểm tra độ rộng các cột',
     'Độ rộng các cột phù hợp với dữ liệu'),
    ('muc 07',
     'Kiểm tra hiển thị dữ liệu dài',
     'Kiểm tra dữ liệu hiển thị dữ liệu dài',
     'Hiển thị không bị tràn cột'),
    ('muc 08',
     'Kiểm tra điều hướng đúng trang',
     'Click vào các thao tác ở cột hành động',
     'Điều hướng đúng trang/chức năng tương ứng'),
]

# nhãn loại (khớp audit_validate_quota.QUOTA) -> bộ case
# ── RÀNG BUỘC GIỮA CÁC TRƯỜNG — 4 mục cho MỘT CẶP trường (mới 2026-09-09) ─────────────────
# Chỉ thị người đặt việc: *"thiếu phần ràng buộc mối quan hệ giữa các trường: ví dụ từ ngày >
# tới ngày"*. Trước đó KHÔNG bank/luật/phép rà nào của tool nói về quan hệ GIỮA hai ô: bank
# `DATEPICKER` (11 mục) chỉ soi MỘT ô (định dạng · ngày không tồn tại · quá khứ · tương lai),
# nên màn có cặp `Từ ngày`/`Đến ngày` vẫn nghiệm thu sạch mà thiếu hẳn phép kiểm cặp.
# Bơm bằng `patch_rangbuoc.py` — {a} = trường ĐẦU (Từ / bắt đầu), {b} = trường SAU (Đến / kết thúc).
RANGBUOC = [
    ('dau lon hon cuoi', 'Kiểm tra {a} lớn hơn {b}',
     '1. Nhập {a} là một mốc SAU {b}.\n2. Áp bộ lọc (hoặc bấm nút lưu của biểu mẫu).',
     'Hệ thống báo lỗi ngay tại chỗ hoặc không cho nhận mốc đó. Không áp bộ lọc sai, không lưu bản ghi nào.'),
    ('bang nhau', 'Kiểm tra {a} bằng {b}',
     '1. Đặt {a} và {b} về cùng một giá trị.\n2. Áp bộ lọc (hoặc bấm nút lưu).',
     'Chấp nhận hai đầu bằng nhau: kết quả còn đúng các bản ghi ở mốc đó.'),
    ('chi mot dau', 'Kiểm tra chỉ nhập {a} hoặc chỉ nhập {b}',
     '1. Nhập {a}, để trống {b}, quan sát kết quả.\n2. Xoá {a}, chỉ nhập {b}, quan sát kết quả.',
     'Mỗi lần chỉ áp ràng buộc của đầu đang có giá trị. Đầu để trống không chặn bản ghi nào và không báo lỗi.'),
    ('gioi han vung chon', 'Kiểm tra vùng chọn của {b} bị giới hạn theo {a}',
     '1. Đặt giá trị cho {a}.\n2. Mở hộp chọn của {b} rồi thử chọn một mốc TRƯỚC {a}.',
     'Các mốc trước {a} bị vô hiệu, không chọn được.'),
]


# ── DATEPICKER khi ô ngày là BỘ LỌC (không phải ô biểu mẫu) — mới 2026-09-09 ───────────────
# Bank `DATEPICKER` ở trên viết cho **biểu mẫu Thêm mới**: "Trên màn hình chức năng thêm mới",
# "Click Lưu lại", "Thêm mới thành công vì … không bắt buộc". Áp nguyên bộ đó cho ô ngày trên
# THANH LỌC là sai ngữ cảnh — đo 2026-09-09 trên `moetdl/DuLieuLoi`: **22/22 case datepicker
# phải viết lại tay**, và không phép rà nào kêu (bộ rà soi TỪ KHOÁ mục, không soi ngữ cảnh).
# GIỮ NGUYÊN 11 khoá `key` để `audit_content` vẫn tra đủ mục; chỉ đổi cột C/D + tiêu đề nào
# nhắc tới việc lưu. `qalib.BANK_LOC` chọn bank này khi nhóm nằm trong CN tìm kiếm/lọc.
DATEPICKER_LOC = [
    # Nguồn 2026-09-12: sheet **`Ngày tháng không có giờ`** của bộ validate mẫu `Tìm kiếm.xlsx`.
    # Sheet đó có 8 mục (KHÔNG có mục *bắt buộc* — ô lọc không bao giờ bắt buộc); bank giữ 11 mục
    # để khớp định mức `Datepicker`: 8 mục của sheet + `bat buoc` (đọc là *để trống ô lọc*) và
    # 2 mục quá khứ / tương lai của đường lọc.
    # ⚠️ Khác biệt CỐT LÕI so với sheet Thêm mới, đừng trộn hai bên:
    #   · mặc định của ô lọc là **placeholder**, của ô biểu mẫu là **trống**;
    #   · gõ sai định dạng thì ô lọc **tự quy về đúng định dạng / không trả kết quả** — KHÔNG có
    #     thông báo lỗi "Vui lòng nhập" và KHÔNG highlight trường lỗi như biểu mẫu.
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định của {f}',
     '1. Mở màn hình chức năng, chưa thao tác gì.\n2. Đọc giá trị đang có trong ô {f}.',
     'Ô {f} để trống và hiển thị gợi ý dd/mm/yyyy. Danh sách đang lấy theo đúng giá trị mặc định đó.'),
    ('bat buoc', 'Kiểm tra {f} khi để trống',
     '1. Xoá rỗng ô {f}.\n2. Quan sát danh sách và thông báo.',
     'Ô lọc không bắt buộc: bỏ trống thì hệ thống bỏ điều kiện ngày tương ứng và lấy lại danh sách theo các tiêu chí còn lại. Không báo lỗi.'),
    ('hop lich khi trong', 'Kiểm tra focus trong hộp Calendar khi {f} chưa có giá trị',
     '1. Xoá rỗng ô {f}.\n2. Đổi ngày trên máy đang chạy trình duyệt.\n'
     '3. Mở hộp Calendar của ô {f}.\n4. Đọc ngày đang được focus trong hộp Calendar.',
     'Hộp Calendar mở ở ngày tháng hiện tại theo máy chủ, không theo ngày vừa đổi trên máy người test.'),
    ('hop lich khi da co', 'Kiểm tra focus trong hộp Calendar khi {f} đã có dữ liệu',
     'Giả sử ô {f} đã có giá trị (VD: 20/10/2019).\n1. Mở hộp Calendar của ô {f}.\n'
     '2. Đọc ngày đang được focus trong hộp Calendar.',
     'Ngày 20/10/2019 được focus.'),
    ('chon ngay', 'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chuyển tháng/năm rồi chọn 1 giá trị ngày tháng.\n3. Quan sát danh sách.',
     '1. Hộp Calendar tự động đóng lại, ô {f} hiển thị đúng ngày vừa chọn theo định dạng dd/mm/yyyy.\n'
     '2. Danh sách lọc lại theo mốc mới, phân trang về trang đầu.'),
    ('nhap ban phim', 'Kiểm tra nhập hoặc xoá dữ liệu {f}',
     '1. Gõ trực tiếp một ngày hợp lệ vào ô {f}.\n2. Xoá trắng giá trị bằng bàn phím.',
     'Cho phép nhập giá trị từ bàn phím và cho phép xoá giá trị đang được hiển thị trên ô. Gõ tay lọc đúng như chọn bằng hộp Calendar.'),
    ('sai dinh dang', 'Kiểm tra khi trường {f} không đúng định dạng',
     'Nhập giá trị ngày tháng không đúng định dạng:\nKiểm tra với các định dạng sau:\n'
     '- Định dạng MM/DD/YYYY\n- YYYY/DD/MM\n- abcdefgh\n- @#$%\n- DD\n- DD/MM\n'
     '- Nhập yyyy > 9999, ví dụ 1/2/99999',
     'Hệ thống tự động quy về thời gian theo đúng định dạng dd/mm/yyyy, hoặc xoá giá trị vừa nhập. Không gửi điều kiện lọc sai lên máy chủ.'),
    ('ngay khong ton tai', 'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY nhưng không hợp lệ',
     'Nhập vào ô {f} các giá trị sau:\n1. Ngày DD không hợp lệ, ngoài khoảng [1,31]; ví dụ 32/04/2009.\n'
     '2. Tháng MM không hợp lệ, ngoài khoảng [1,12]; ví dụ 12/14/2009\n3. Kiểm tra với các giá trị biên sau\n'
     '- 31/04/1983\n- 31/06/1983\n- 31/09/1983\n- 31/11/1983\n- 30/2/1983\n- 29/2/1983\n'
     '4. YYYY < 1000\n- 01/02/0999',
     'Hệ thống tự động quy về thời gian theo đúng định dạng, hoặc không hiển thị kết quả tìm kiếm. Không lọc theo ngày không tồn tại.'),
    ('dung dinh dang', 'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY hợp lệ',
     'Kiểm tra với các giá trị sau:\n1. Ngày DD hợp lệ, trong khoảng [1,31]; ví dụ 30/04/2009.\n'
     '2. Tháng MM hợp lệ, trong khoảng [1,12]; ví dụ 12/12/2009\n3. 1000 <= YYYY <= 9999\n'
     '- 01/02/1000\n- 01/02/9999',
     '1. Ngày tháng hiển thị đúng định dạng dd/mm/yyyy.\n2. Hiển thị kết quả tìm kiếm tương ứng, khớp dữ liệu đang lưu trong hệ thống.'),
    ('ngay qua khu', 'Kiểm tra nhập {f} là ngày quá khứ',
     '1. Đặt {f} về một mốc trong quá khứ (trong khoảng đang có dữ liệu).\n2. Quan sát danh sách.',
     'Lọc được theo ngày quá khứ. Danh sách chỉ còn bản ghi thoả mãn mốc đó.'),
    ('ngay tuong lai', 'Kiểm tra nhập {f} là ngày tương lai',
     '1. Đặt {f} về một mốc trong tương lai.\n2. Quan sát danh sách.',
     'Hệ thống nhận ngày tương lai và trả về danh sách rỗng.'),
]


# ── BREADCRUMB (đường dẫn điều hướng) — 5 mục, mới 2026-09-09 ─────────────────────────────
# Trước bản này `Breadcrumb` KHÔNG có trong `qalib.QUOTA` ⇒ `patch_quota` bỏ qua (định mức 0) và
# `audit_validate_quota` cũng cho 0 ⇒ nhóm rỗng vĩnh viễn, phải viết tay. Đo 2026-09-09 trên màn
# `Chi tiết lỗi`: 24/82 case của màn là các nhóm ngoài bảng, viết tay hết.
# Bộ mục dưới đây RÚT TỪ CHÍNH bản viết tay đã được nghiệm thu của màn đó (không tự nghĩ mới).
BREADCRUMB = [
    ('hien thi du cap', 'Kiểm tra {f} hiển thị đủ cấp',
     '1. Mở màn từ màn cha.\n2. Đọc từng cấp trên {f}.',
     'Hiện đủ các cấp từ gốc tới màn hiện tại, đúng thứ tự, đúng nhãn nghiệp vụ của từng cấp.'),
    ('bam cap tren', 'Kiểm tra bấm vào cấp trên của {f}',
     '1. Bấm lần lượt từng cấp phía trước trên {f}.',
     'Điều hướng đúng về màn của cấp đã bấm. Dữ liệu màn đó tải lại bình thường.'),
    ('cap cuoi', 'Kiểm tra cấp cuối của {f}',
     '1. Bấm vào cấp CUỐI (màn đang mở) trên {f}.',
     'Cấp cuối không bấm được và hiển thị khác các cấp trước.'),
    ('gia tri dai', 'Kiểm tra {f} khi nhãn cấp cuối quá dài',
     '1. Mở màn có tên bản ghi rất dài.\n2. Quan sát {f}.',
     'Nhãn dài bị cắt gọn (…) hoặc xuống dòng gọn gàng, không đẩy lệch phần còn lại của màn.'),
    ('thu hep cua so', 'Kiểm tra {f} khi thu hẹp cửa sổ trình duyệt',
     '1. Thu hẹp dần chiều ngang cửa sổ.\n2. Quan sát {f}.',
     'Breadcrumb co theo bề rộng cửa sổ, không tràn và không đẩy vỡ bố cục đầu màn.'),
]

# ── THẺ SỐ LIỆU (thẻ KPI đầu màn) — 4 mục, mới 2026-09-09 ─────────────────────────────────
# Cùng lý do với `BREADCRUMB`. Mục 2 (khớp dữ liệu trong hệ thống) là mục QUAN TRỌNG NHẤT:
# thẻ số liệu là chỗ hay lệch vì thường đếm ở FE sau khi gom, còn con số thật nằm ở máy chủ
# (rủi ro đã ghi trong hồ sơ màn `Dữ liệu lỗi`).
THE_SO_LIEU = [
    ('gia tri mac dinh', 'Kiểm tra giá trị mặc định của {f}',
     '1. Mở màn, chưa thao tác gì.\n2. Đọc nhãn và giá trị trên {f}.',
     'Thẻ hiện đủ nhãn + giá trị. Nhãn đúng chính tả, giá trị đúng đơn vị/định dạng của trường đó.'),
    ('khop du lieu', 'Kiểm tra {f} khớp dữ liệu trong hệ thống',
     '1. Đọc con số/giá trị trên {f}.\n2. Đối chiếu với dữ liệu đang lưu của chính bản ghi đang mở.',
     'Giá trị trên thẻ khớp dữ liệu trong hệ thống, không lệch. Không đếm cả bản ghi đã xoá.'),
    # ⚠️ Cột D KHÔNG được chứa từ ngữ code (§D + `audit_extra` phép ⑤ "Rò code"). Bản đầu của
    # bank này viết "không hiện `null`/`undefined`" và bị chính phép ⑤ bắt 4 case — đúng luật.
    ('khong co du lieu', 'Kiểm tra {f} khi không có dữ liệu',
     '1. Mở bản ghi mà trường của thẻ này chưa có giá trị.',
     'Thẻ hiện rỗng, dấu `-` hoặc `0` theo đúng quy ước của màn. Không hiện từ ngữ kỹ thuật của hệ thống thay cho giá trị rỗng.'),
    ('gia tri dai', 'Kiểm tra {f} khi giá trị lớn hoặc quá dài',
     '1. Mở bản ghi có giá trị rất lớn (số nhiều chữ số) hoặc nhãn rất dài.',
     'Số lớn có phân cách nghìn theo quy ước của màn. Nhãn dài cắt gọn hoặc xuống dòng, không tràn khỏi thẻ, không đẩy lệch các thẻ bên cạnh.'),
]


# ⚠️ PHẢI TRÙNG `qalib.KINDSRC` — hai bảng cùng một việc (tra bank theo loại nhóm). Lệch nhau
# thì đường bơm này và đường bơm kia ra hai bộ case khác nhau. Đo 2026-09-12, ba chỗ đã lệch:
#   · `Upload file` trỏ nhầm sang **UPLOAD_IMG** (bank ảnh!) — lỗi chép dán;
#   · `Selectbox`/`Combobox` trỏ `SELECTBOX` (6 mục) trong khi KINDSRC trỏ `SELECTBOX_FULL` (13);
#   · `File Excel` trỏ `EXCEL_IMPORT` (13) trong khi KINDSRC trỏ `EXCEL_IMPORT_FULL` (18).
# Nay `audit_extra` phép ㉖ so hai bảng, lệch là báo.
BY_KIND = {
    'Textbox chữ': TEXTBOX, 'Textbox tìm kiếm': SEARCHBOX, 'Textbox số': NUMBOX,
    'Textarea': TEXTAREA, 'Selectbox': SELECTBOX_FULL,
    'Combobox (searchable)': COMBOBOX_FULL,
    'Nút chọn (segmented)': SELECTBOX[:4], 'Checkbox': CHECKBOX,
    'Upload ảnh': UPLOAD_IMG, 'Upload file': UPLOAD_FILE, 'Datepicker': DATEPICKER,
    'Email': EMAIL, 'Số điện thoại': PHONE, 'Danh sách / lưới': LIST,
    'Nút chọn (segmented)': SEGMENTED,
    'Icon': ICON, 'Phân trang': PAGING_YCHANG,
    'Selectbox Số bản ghi trên trang': PERPAGE, 'Hộp xác nhận': DIALOG,
    'Tải file mẫu': TEMPLATE_FILE, 'File Excel': EXCEL_IMPORT_FULL,
    'Hiển thị chi tiết': DETAIL, 'Button': BUTTON, 'Tải lại': RELOAD,
    'Combobox (searchable)': COMBOBOX_FULL,
    # bổ sung 2026-09-07 — xem ghi chú ở PAGE_INPUT / CHECKBOX_GRID
    'Textbox Nhập số trang': PAGE_INPUT, 'Checkbox bản ghi (grid)': CHECKBOX_GRID,
    'Textbox Số bản ghi/trang': PAGE_RECORDS,
    # 2026-09-09 — nội dung phụ thuộc CẶP trường nên `patch_quota` không bơm được
    # (cố tình KHÔNG có dòng ở `qalib.KINDSRC`); bơm bằng `patch_rangbuoc.py`.
    'Ràng buộc giữa các trường': RANGBUOC,
    'Breadcrumb': BREADCRUMB, 'Thẻ số liệu': THE_SO_LIEU,
    # 2026-09-10 — nhóm luật §0.10/§0.13 gọi đích danh mà §3 chưa có dòng định mức nào.
    'Tiêu đề cột sắp xếp': COT_SAP_XEP,
    # `Cột nhập Excel` (§3 định mức 8) CỐ Ý không có ở đây: bộ mục phụ thuộc LOẠI CONTROL của
    # từng cột, suy từ tên nhóm là sai — giống `Ràng buộc giữa các trường`. Có dòng ở
    # `qalib.QUOTA` để `scan_quota_sheet` ĐẾM và báo `[ĐỊNH MỨC] n/8` thay vì im lặng.
}
# 2026-09-10 — hai loại OPT-IN khai ở CUỐI file nên phải nối vào BY_KIND sau khi định nghĩa.
# Khai đủ 4 chỗ (QUOTA · KINDSRC · bank · BY_KIND) mới chạy — thiếu `KINDSRC` thì
# `plan_quota_fill` `continue` LẶNG LẼ và nhóm mãi 0 case (bẫy đã dính khi thêm loại `Tải lại`).

# ══════════════════════════════════════════════════════════════════════════════
# Ô NGÀY CỦA TRÌNH DUYỆT  `<input type="date">`  — loại OPT-IN, thêm 2026-09-10
# ══════════════════════════════════════════════════════════════════════════════
# Vì sao tách khỏi `DATEPICKER` / `DATEPICKER_LOC`: hai bộ kia viết cho **hộp lịch riêng của
# ứng dụng** (mở lịch khi ô rỗng · gõ `32/04/2026` rồi hệ thống báo lỗi định dạng · xoá rỗng thì
# bỏ điều kiện ngày). Ô ngày SẴN CÓ CỦA TRÌNH DUYỆT hành xử khác hẳn:
#   · chia sẵn 3 ngăn ngày · tháng · năm, chỉ nhận chữ số ⇒ KHÔNG gõ được ký tự lạ và
#     KHÔNG có thông báo lỗi định dạng nào của hệ thống;
#   · chặn khoảng bằng thuộc tính `min`/`max` ⇒ ngoài khoảng là không chọn được, cũng không báo;
#   · bảng lịch, định dạng hiển thị và cách gõ **khác nhau giữa các trình duyệt**.
# Đo 2026-09-10 trên màn `Cảnh báo Mâu thuẫn`: 22/22 case sinh bằng `DATEPICKER_LOC` phải viết
# lại tay. Khai bằng `loai_control` ở HỒ SƠ MÀN (không nhét chú thích vào tên nhóm — chốt 09/09).
# Mục nào phụ thuộc từng app thì bộ này bảo GHI NGUYÊN TRẠNG, không khẳng định thay.
DATEPICKER_NATIVE = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định của {f}',
     '1. Mở màn hình chức năng, chưa thao tác gì.\n2. Đọc giá trị đang có trong ô {f}.',
     'Ô {f} hiển thị đúng giá trị mặc định của màn. Danh sách/biểu mẫu đang dùng đúng giá trị đó.',
    ),
    (
     'xoa rong',
     'Kiểm tra {f} khi xoá rỗng',
     '1. Bấm vào ô {f} rồi xoá trắng giá trị.\n2. Quan sát ô và kết quả trên màn.',
     'Ô cho xoá rỗng, không có thông báo lỗi của hệ thống.',
    ),
    (
     'bang lich',
     'Kiểm tra bảng lịch của trình duyệt ở {f}',
     '1. Bấm biểu tượng lịch của ô {f}.\n2. Quan sát tháng/năm đang mở và ngày đang được tô sáng.',
     'Bảng lịch mở đúng tháng/năm của giá trị đang có và tô sáng đúng ngày đó. Ô rỗng thì mở ở tháng hiện tại.',
    ),
    (
     'chon ngay',
     'Kiểm tra chọn ngày bằng bảng lịch ở {f}',
     '1. Mở bảng lịch của ô {f}.\n2. Chuyển tháng/năm rồi chọn một ngày hợp lệ.\n'
     '3. Quan sát ô, kết quả trên màn và số trang.',
     '1. Bảng lịch đóng, ô {f} hiển thị đúng ngày vừa chọn theo định dạng ngày của trình duyệt.\n2. Màn áp ngay giá trị mới. Nếu {f} là bộ lọc thì phân trang về trang 1.',
    ),
    (
     'nhap ban phim',
     'Kiểm tra nhập {f} bằng bàn phím theo từng ngăn',
     '1. Đưa con trỏ vào ô {f} rồi gõ lần lượt ngày, tháng, năm.\n'
     '2. Thử gõ thiếu một ngăn (chỉ ngày, để trống tháng và năm).',
     '1. Gõ đủ 3 ngăn thì ô nhận giá trị và áp đúng như chọn bằng bảng lịch.\n2. Còn thiếu ngăn thì ô giữ nguyên giá trị cũ, không áp và không báo lỗi.',
    ),
    (
     'ky tu la',
     'Kiểm tra gõ ký tự lạ vào {f}',
     '1. Gõ vào ô {f} chữ cái và ký tự đặc biệt.\n2. Bấm ra ngoài ô.',
     'Ô ngày của trình duyệt chỉ nhận chữ số theo từng ngăn nên không gõ được ký tự lạ, và không có thông báo lỗi định dạng của hệ thống. Ô giữ nguyên giá trị hợp lệ trước đó.',
    ),
    (
     'dan chuoi',
     'Kiểm tra dán chuỗi ngày vào {f}',
     '1. Sao chép một chuỗi ngày ở định dạng khác (ví dụ yyyy-mm-dd hoặc mm/dd/yyyy).\n'
     '2. Dán vào ô {f}.',
     'Ô nhận đúng ngày tương ứng với chuỗi dán, hoặc bỏ qua chuỗi không phải ngày.',
    ),
    (
     'ngay khong ton tai',
     'Kiểm tra ngày không tồn tại ở {f}',
     '1. Gõ vào ô {f}: 32/04/2026 · 30/02/2026 · 15/13/2026.\n2. Bấm ra ngoài ô.',
     'Ngăn ngày và ngăn tháng chỉ nhận giá trị trong khoảng hợp lệ nên số quá khoảng bị bỏ hoặc bị đưa về mốc hợp lệ. Hệ thống không nhận ngày không tồn tại.',
    ),
    (
     'dung dinh dang',
     'Kiểm tra {f} với ngày hợp lệ',
     '1. Đặt {f} về một ngày hợp lệ trong khoảng còn dữ liệu, rồi thử 29/02 của năm nhuận.\n'
     '2. Đối chiếu kết quả với dữ liệu đang lưu trong hệ thống.',
     'Nhận giá trị và áp đúng theo mốc đã nhập. Kết quả khớp với dữ liệu đang lưu, không thừa không thiếu.',
    ),
    (
     'gioi han min max',
     'Kiểm tra giới hạn khoảng ngày cho phép của {f}',
     '1. Mở bảng lịch của {f} và thử chọn một mốc NGOÀI khoảng màn cho phép.\n'
     '2. Thử gõ tay một mốc ngoài khoảng đó.',
     'Trình duyệt vô hiệu các mốc ngoài khoảng cho phép ⇒ không chọn được, không cần thông báo '
     'lỗi. Chọn hoặc gõ lọt được ra ngoài khoảng là LỖI, ghi lại nguyên trạng.',
    ),
    (
     'khac trinh duyet',
     'Kiểm tra {f} trên các trình duyệt khác nhau',
     '1. Mở màn lần lượt trên Chrome, Firefox và trình duyệt còn lại của phạm vi kiểm thử.\n'
     '2. So bảng lịch, định dạng hiển thị và cách gõ của ô {f}.',
     'Ô vẫn nhập/chọn được và áp đúng giá trị trên mọi trình duyệt trong phạm vi kiểm thử. Bảng lịch và định dạng hiển thị do trình duyệt vẽ nên được phép khác nhau.',
    ),
]

# ══════════════════════════════════════════════════════════════════════════════
# Ô CHỌN NHIỀU GIÁ TRỊ (multi-select) — loại OPT-IN, thêm 2026-09-10
# ══════════════════════════════════════════════════════════════════════════════
# `SELECTBOX_FULL` (13 mục) khẳng định *"Chỉ chọn được một giá trị; ô hiển thị giá trị được chọn
# sau cùng"* — SAI hẳn bản chất với ô cho chọn nhiều. Đo 2026-09-10 trên màn `Cảnh báo Mâu thuẫn`:
# ô lọc `Đơn vị` chọn nhiều giá trị, hiện thành thẻ, tràn thì rút gọn, có nút chọn/bỏ chọn tất cả.
# Giữ nguyên ĐỊNH MỨC 13 và giữ 6 mục tìm kiếm cuối (ô này cũng có hộp tìm bên trong).
SELECTBOX_MULTI = [
    (
     # ⛔ LUẬT CỨNG ①: "hiện chữ gợi ý của ô" là chữ CHAY — nó không nói chữ gợi ý phải là gì,
     # nên màn chọn sẵn một giá trị nghiệp vụ vẫn đọc thành ĐẠT. Nêu thẳng bản chữ bắt buộc.
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định {f}',
     '1. Mở màn, xem ô {f} khi chưa chọn gì.',
     'Mặc định là "-- Chọn --". Ô không tự chọn giá trị đầu tiên của danh sách.',
    ),
    (
     # ⚠️ Case này CHỈ nói về CÁC GIÁ TRỊ trong ô. Hai nút `Chọn tất cả` / `Bỏ chọn tất cả`
     # đã có case riêng (`chon tat ca` dưới đây) ⇒ nhắc lại ở đây là THỪA — chỉ thị người đặt
     # việc 2026-09-10. Lúc ground màn thật đừng nối thêm câu mô tả hai nút đó vào cột D.
     'gia tri',
     'Kiểm tra các giá trị có trong {f}',
     '1. Bấm mở ô {f}.\n2. Đối chiếu danh sách lựa chọn với dữ liệu đang có trong hệ thống.',
     'Danh sách hiện đầy đủ các giá trị hợp lệ, mỗi dòng có ô đánh dấu cho biết đang chọn hay chưa.',
    ),
    (
     'sap xep',
     'Kiểm tra sắp xếp các giá trị trong {f}',
     '1. Mở ô {f} nhiều lần và so thứ tự các lựa chọn.',
     'Thứ tự lựa chọn giữ nguyên giữa các lần mở, không xáo trộn.',
    ),
    (
     'chon nhieu',
     'Kiểm tra chọn NHIỀU giá trị trong {f}',
     '1. Chọn một giá trị, quan sát kết quả.\n2. Chọn thêm giá trị thứ hai, thứ ba rồi quan sát.',
     '1. Ô cho chọn nhiều giá trị cùng lúc. Ô không tự đóng sau mỗi lần chọn.\n2. Kết quả thoả mãn bất kỳ giá trị nào đang chọn (quan hệ HOẶC). Nếu {f} là bộ lọc thì phân trang về trang 1 sau mỗi lần đổi.',
    ),
    (
     'bo chon',
     'Kiểm tra bỏ chọn từng giá trị trong {f}',
     '1. Đang chọn nhiều giá trị, bấm lại đúng một giá trị đang chọn.\n'
     '2. Bấm dấu xoá của ô để bỏ hết.',
     '1. Bấm lại giá trị đang chọn thì bỏ chọn đúng giá trị đó, các giá trị còn lại giữ nguyên.\n'
     '2. Bấm dấu xoá thì ô trở về trạng thái chưa chọn gì.',
    ),
    (
     'chon tat ca',
     'Kiểm tra chọn tất cả / bỏ chọn tất cả ở {f} nếu có',
     '1. Mở ô {f}, tìm nút chọn tất cả và bỏ chọn tất cả.\n2. Bấm lần lượt hai nút đó.',
     'Chọn tất cả thì mọi lựa chọn ĐANG HIỆN được chọn. Bỏ chọn tất cả thì ô trở về trạng thái chưa chọn gì. Ô không có các nút này thì không áp dụng.',
    ),
    (
     'qua dai',
     'Kiểm tra hiển thị {f} khi chọn nhiều hoặc giá trị quá dài',
     '1. Chọn nhiều giá trị hơn số thẻ ô hiện được.\n2. Chọn một giá trị có nhãn dài nhất.',
     '1. Ô hiện tối đa số thẻ cho phép, phần còn lại rút gọn thành chữ đếm số lựa chọn còn lại.\n2. Độ rộng ô không đổi theo độ dài nhãn. Nhãn dài quá khổ bị cắt bớt kèm dấu ba chấm.',
    ),
    (
     'can le',
     'Kiểm tra căn lề các giá trị trong {f}',
     '1. Mở ô {f} và xem cách căn lề các lựa chọn.',
     'Các lựa chọn căn lề trái. Lựa chọn đang chọn được đánh dấu và tô nền khác với lựa chọn khác.',
    ),
    (
     'tai du lieu khi lon',
     'Kiểm tra cách tải dữ liệu khi danh sách {f} lớn',
     '1. Mở ô {f} ở màn có nhiều dữ liệu.\n2. Cuộn xuống cuối danh sách lựa chọn.\n'
     '3. Ghi lại CÁCH ô nạp dữ liệu: đổ hết một lần, hay tải thêm theo trang khi cuộn.',
     'Danh sách tải theo trang, cuộn tới cuối thì tự tải tiếp, không kẹt và không lặp bản ghi.',
    ),
    (
     'tim kiem khop 100',
     'Kiểm tra tìm kiếm khớp 100% dữ liệu',
     '1. Bấm mở ô {f}.\n2. Nhập vào hộp tìm bên trong đúng trọn tên một lựa chọn đang có.',
     'Danh sách chỉ còn đúng lựa chọn đó. Chọn được bình thường, các giá trị đang chọn không mất.',
    ),
    (
     'tim kiem khop 1 phan',
     'Kiểm tra tìm kiếm khớp 1 phần dữ liệu',
     '1. Bấm mở ô {f}.\n2. Nhập vào hộp tìm một PHẦN tên của lựa chọn đang có.',
     'Danh sách còn mọi lựa chọn có tên chứa phần đã nhập, giữ đúng thứ tự ban đầu.',
    ),
    (
     'tim kiem hoa thuong',
     'Kiểm tra tìm kiếm không phân biệt hoa thường',
     '1. Bấm mở ô {f}.\n2. Nhập từ khoá lần lượt bằng chữ thường rồi chữ HOA.',
     'Hai lần nhập cho ra cùng một danh sách lựa chọn.',
    ),
    (
     'tim kiem co dau khong dau',
     'Kiểm tra tìm kiếm tiếng Việt có dấu, không dấu',
     '1. Bấm mở ô {f}.\n2. Nhập từ khoá tiếng Việt CÓ dấu.\n3. Nhập lại từ khoá đó nhưng BỎ hết dấu.',
     'Cả hai lần đều ra cùng danh sách lựa chọn: gõ không dấu vẫn tìm được lựa chọn có dấu.',
    ),
]

BY_KIND['Ô ngày trình duyệt'] = DATEPICKER_NATIVE
BY_KIND['Selectbox nhiều lựa chọn'] = SELECTBOX_MULTI

# ══════════════════════════════════════════════════════════════════════════════
# Ô NGÀY **CÓ GIỜ**  `dd/mm/yyyy hh:mm`  — loại OPT-IN, thêm 2026-09-12
# ══════════════════════════════════════════════════════════════════════════════
# Nguồn: sheet **`Ngày tháng có giờ`** của bộ validate mẫu `Thêm mới.xlsx` (10 mục).
# Vì sao phải tách khỏi `DATEPICKER`: bộ 11 mục kia nói về ngày SUÔNG — mọi bản chữ của nó
# chốt định dạng `dd/mm/yyyy` và không mục nào chạm tới giờ/phút. Ô có giờ khác ở 3 chỗ:
#   · thông báo lỗi phải nêu ĐỦ khuôn `dd/mm/yyyy hh:mm`, sai khuôn là case vô nghĩa;
#   · có thêm hai khoảng biên RIÊNG của phần giờ: `hh` (00-23) và `mm` (00-59) — bộ ngày suông
#     không có mục nào soi hai khoảng này ⇒ áp nhầm là mất hẳn phép kiểm giờ;
#   · mẫu có thêm mục **focus chuột ra khỏi ô thì hộp Calendar tự đóng** (mục 4 của sheet).
# Trước bản này tool KHÔNG có bộ nào cho ô ngày giờ: nhóm `Datepicker Hạn hoàn thành` rơi vào
# bank ngày suông, 11 case đều ghi `dd/mm/yyyy` và không phép rà nào kêu.
# Khai bằng `loai_control` ở HỒ SƠ MÀN (tên nhóm vẫn giữ khuôn `<Loại control> <Nhãn UI>`).
DATEPICKER_GIO = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định',
     '1. Mở biểu mẫu thêm mới.\n2. Đọc giá trị đang có trong ô "{f}".',
     'Mặc định là trống. Nếu tài liệu đặc tả có mô tả giá trị mặc định thì lấy theo tài liệu.',
    ),
    (
     'bat buoc',
     'Kiểm tra {f} khi để trống',
     '1. Để trống ô "{f}".\n2. Các thông tin khác được nhập hợp lệ.\n3. Bấm nút lưu.',
     '- Là trường bắt buộc: thông báo "Vui lòng chọn {f}", highlight và focus vào trường lỗi, không lưu bản ghi nào.\n- Là trường không bắt buộc: lưu thành công, giá trị để rỗng.',
    ),
    (
     'hop lich khi trong',
     'Kiểm tra focus trong hộp Calendar khi {f} chưa có giá trị',
     '1. Để trống giá trị của ô "{f}".\n2. Đổi ngày giờ trên máy đang chạy trình duyệt.\n'
     '3. Mở hộp Calendar của ô "{f}".\n4. Đọc ngày giờ đang được focus trong hộp Calendar.',
     'Hộp Calendar mở ở thời gian hiện tại theo máy chủ, không theo đồng hồ vừa đổi trên máy người test.',
    ),
    (
     # Mục RIÊNG của sheet ngày giờ (mục 4) — bộ ngày suông không có.
     'dong hop lich',
     'Kiểm tra focus chuột ra khỏi ô {f}',
     '1. Mở hộp Calendar của ô "{f}".\n2. Bấm chuột ra ngoài ô.',
     'Hộp Calendar tự động đóng lại.',
    ),
    (
     'hop lich khi da co',
     'Kiểm tra focus trong hộp Calendar khi {f} đã có dữ liệu',
     'Giả sử ô "{f}" đã có giá trị (VD: 14/01/2021 10:58).\n1. Mở hộp Calendar của ô "{f}".\n'
     '2. Đọc ngày giờ đang được focus trong hộp Calendar.',
     'Ngày 14/01/2021 giờ 10:58 được focus.',
    ),
    (
     'chon ngay',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô "{f}".\n2. Lựa chọn 1 giá trị ngày tháng và giờ phút trong hộp Calendar.',
     'Giá trị vừa chọn hiển thị trong ô "{f}" theo định dạng dd/mm/yyyy hh:mm.',
    ),
    (
     'nhap ban phim',
     'Kiểm tra nhập hoặc xoá dữ liệu {f}',
     '1. Bấm vào ô "{f}".\n2. Nhập rồi xoá giá trị bằng bàn phím.',
     'Cho phép nhập giá trị từ bàn phím và cho phép xoá giá trị đang được hiển thị trên ô.',
    ),
    (
     'sai dinh dang',
     'Kiểm tra khi trường {f} không đúng định dạng dd/mm/yyyy hh:mm',
     '1. Bấm vào ô "{f}".\n2. Nhập giá trị thời gian không đúng định dạng.\n'
     'Kiểm tra với các định dạng ngày tháng sau:\n- Định dạng MM/DD/YYYY\n- YYYY/DD/MM\n'
     '- abcdefgh\n- DD\n- DD/MM\n- YYYY\n'
     'Kiểm tra với các định dạng giờ phút sau:\n- hh không thuộc khoảng (00-23)\n'
     '- mm không thuộc khoảng (00-59)\n3. Các trường thông tin khác nhập hợp lệ.\n4. Bấm nút lưu.',
     '1. Thông báo lỗi: "{f} không đúng định dạng dd/mm/yyyy hh:mm hoặc không tồn tại"\n2. Highlight và focus vào trường lỗi.',
    ),
    (
     'ngay khong ton tai',
     'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY nhưng không hợp lệ',
     '1. Bấm vào ô "{f}".\n2. Nhập vào phần ngày tháng các giá trị sau:\n'
     '- Ngày DD không hợp lệ, ngoài khoảng [1,31]; ví dụ 32/04/2009.\n'
     '- Tháng MM không hợp lệ, ngoài khoảng [1,12]; ví dụ 12/14/2009\n'
     '- Kiểm tra với các giá trị biên sau: 31/04/1983 · 31/06/1983 · 31/09/1983 · 31/11/1983 · 30/2/1983 · 29/2/1983\n'
     '- YYYY < 1000; ví dụ 01/02/0999\n3. Các trường thông tin khác nhập hợp lệ.\n4. Bấm nút lưu.',
     '1. Thông báo lỗi: "{f} không đúng định dạng dd/mm/yyyy hh:mm hoặc không tồn tại"\n2. Highlight và focus vào trường lỗi.',
    ),
    (
     'dung dinh dang',
     'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY hợp lệ',
     '1. Bấm vào ô "{f}".\n2. Nhập vào phần ngày tháng các giá trị sau:\n'
     '- Ngày DD hợp lệ, trong khoảng [1,31]; ví dụ 30/04/2009.\n'
     '- Tháng MM hợp lệ, trong khoảng [1,12]; ví dụ 12/12/2009\n'
     'Nhập vào phần giờ phút các giá trị sau:\n- Giờ (hh) thuộc khoảng (00-23)\n'
     '- Phút (mm) thuộc khoảng (00-59)\n3. Các trường thông tin khác nhập hợp lệ.\n4. Bấm nút lưu.',
     'Ngày tháng hiển thị đúng định dạng dd/mm/yyyy hh:mm.',
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# Ô NGÀY **NHIỀU LỰA CHỌN** (hộp lịch có mục chọn nhanh) — loại OPT-IN, thêm 2026-09-12
# ══════════════════════════════════════════════════════════════════════════════
# Nguồn: sheet **`Ngày tháng có nhiều lựa chọn`** của bộ validate mẫu `Tìm kiếm.xlsx` (16 mục).
# Đây là ô lọc thời gian mở ra hộp lịch KÈM danh sách mục chọn nhanh (Hôm nay · Hôm qua ·
# 7 ngày qua · 30 ngày qua · Tuần này · Tuần trước · Từ đầu tháng đến nay · Tháng trước ·
# Từ đầu năm đến nay) và điền vào ô một KHOẢNG `dd/mm/yyyy - dd/mm/yyyy`.
# Trước bản này tool KHÔNG có bộ nào cho nó: nhóm rơi vào `DATEPICKER_LOC` (ô ngày ĐƠN) nên
# **9 mục chọn nhanh — phần dễ sai nhất của control này — không được sinh case nào**, và không
# phép rà nào kêu vì `audit_validate_quota` chỉ ĐẾM đủ 11 case theo định mức `Datepicker`.
# 9 case chọn nhanh CỐ Ý dùng CHUNG một tiêu đề, khác nhau ở cột C/D — đúng lối mẫu (giống 4
# case *vị trí trang sau 1 thao tác* của `PAGING_YCHANG`); `plan_quota_fill` vòng 1 không lọc
# theo tiêu đề trùng nên cả 9 đều được bơm.
DATEPICKER_KHOANG = [
    (
     'gia tri mac dinh',
     'Kiểm tra giá trị mặc định',
     '1. Mở màn hình chức năng, chưa thao tác gì.\n2. Đọc giá trị đang có trong ô {f}.',
     'Ô {f} để trống và hiển thị gợi ý khoảng ngày. Danh sách đang lấy theo đúng giá trị mặc định đó.',
    ),
    (
     'hop lich khi trong',
     'Kiểm tra focus trong hộp Calendar khi {f} chưa có giá trị',
     '1. Xoá rỗng ô {f}.\n2. Đổi ngày trên máy đang chạy trình duyệt.\n'
     '3. Mở hộp Calendar của ô {f}.\n4. Đọc ngày đang được focus trong hộp Calendar.',
     'Hộp Calendar mở ở ngày tháng hiện tại theo máy chủ, không theo ngày vừa đổi trên máy người test.',
    ),
    (
     'hop lich khi da co',
     'Kiểm tra focus trong hộp Calendar khi {f} đã có dữ liệu',
     'Giả sử ô {f} đã có giá trị (VD: 20/10/2019).\n1. Mở hộp Calendar của ô {f}.\n'
     '2. Đọc ngày đang được focus trong hộp Calendar.',
     'Ngày 20/10/2019 được focus.',
    ),
    (
     'chon hom nay',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục Hôm nay.',
     '1. Hộp Calendar tự động đóng lại.\n2. Giá trị ngày tháng vừa chọn hiển thị trong ô {f} theo định dạng dd/mm/yyyy.',
    ),
    (
     'chon hom qua',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục Hôm qua.',
     '1. Hộp Calendar tự động đóng lại.\n2. Giá trị ngày tháng vừa chọn hiển thị trong ô {f} theo định dạng dd/mm/yyyy.',
    ),
    (
     'chon 7 ngay qua',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục 7 ngày qua.',
     '1. Hộp Calendar tự động đóng lại.\n2. Hiển thị ngày bắt đầu - kết thúc của 7 ngày qua trong ô {f} theo định dạng dd/mm/yyyy - dd/mm/yyyy.',
    ),
    (
     'chon 30 ngay qua',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục 30 ngày qua.',
     '1. Hộp Calendar tự động đóng lại.\n2. Hiển thị ngày bắt đầu - kết thúc của 30 ngày qua trong ô {f} theo định dạng dd/mm/yyyy - dd/mm/yyyy.',
    ),
    (
     'chon tuan nay',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục Tuần này.',
     '1. Hộp Calendar tự động đóng lại.\n2. Hiển thị ngày bắt đầu - kết thúc của tuần hiện tại trong ô {f} theo định dạng dd/mm/yyyy - dd/mm/yyyy.',
    ),
    (
     'chon tuan truoc',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục Tuần trước.',
     '1. Hộp Calendar tự động đóng lại.\n2. Hiển thị ngày bắt đầu - kết thúc của tuần trước trong ô {f} theo định dạng dd/mm/yyyy - dd/mm/yyyy.',
    ),
    (
     'chon dau thang den nay',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục Từ đầu tháng đến nay.',
     '1. Hộp Calendar tự động đóng lại.\n2. Hiển thị ngày bắt đầu - ngày hiện tại của tháng hiện tại trong ô {f} theo định dạng dd/mm/yyyy - dd/mm/yyyy.',
    ),
    (
     'chon thang truoc',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục Tháng trước.',
     '1. Hộp Calendar tự động đóng lại.\n2. Hiển thị ngày bắt đầu - kết thúc của tháng trước trong ô {f} theo định dạng dd/mm/yyyy - dd/mm/yyyy.',
    ),
    (
     'chon dau nam den nay',
     'Kiểm tra hoạt động của hộp Calendar {f}',
     '1. Mở hộp Calendar của ô {f}.\n2. Chọn mục Từ đầu năm đến nay.',
     '1. Hộp Calendar tự động đóng lại.\n2. Hiển thị từ ngày 1/1 đến ngày hiện tại của năm hiện tại trong ô {f} theo định dạng dd/mm/yyyy - dd/mm/yyyy.',
    ),
    (
     'nhap ban phim',
     'Kiểm tra nhập hoặc xoá dữ liệu {f}',
     'Nhập rồi xoá giá trị của ô {f} bằng bàn phím.',
     'Cho phép nhập giá trị từ bàn phím và cho phép xoá giá trị đang được hiển thị trên ô.',
    ),
    (
     'sai dinh dang',
     'Kiểm tra khi trường {f} không đúng định dạng',
     'Nhập giá trị ngày tháng không đúng định dạng:\nKiểm tra với các định dạng sau:\n'
     '- Định dạng MM/DD/YYYY\n- YYYY/DD/MM\n- abcdefgh\n- @#$%\n- DD\n- DD/MM\n'
     '- Nhập yyyy > 9999, ví dụ 1/2/99999',
     'Tự động xoá dữ liệu đã nhập sau khi bấm Enter. Không gửi điều kiện lọc sai lên máy chủ.',
    ),
    (
     'ngay khong ton tai',
     'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY nhưng không hợp lệ',
     'Nhập vào ô {f} các giá trị sau:\n1. Ngày DD không hợp lệ, ngoài khoảng [1,31]; ví dụ 32/04/2009.\n'
     '2. Tháng MM không hợp lệ, ngoài khoảng [1,12]; ví dụ 12/14/2009\n3. Kiểm tra với các giá trị biên sau\n'
     '- 31/04/1983\n- 31/06/1983\n- 31/09/1983\n- 31/11/1983\n- 30/2/1983\n- 29/2/1983\n'
     '4. YYYY < 1000\n- 01/02/0999',
     'Không hiển thị kết quả tìm kiếm. Không lọc theo ngày không tồn tại.',
    ),
    (
     'dung dinh dang',
     'Kiểm tra khi trường {f} có định dạng DD/MM/YYYY hợp lệ',
     'Kiểm tra với các giá trị sau:\n1. Ngày DD hợp lệ, trong khoảng [1,31]; ví dụ 30/04/2009.\n'
     '2. Tháng MM hợp lệ, trong khoảng [1,12]; ví dụ 12/12/2009\n3. 1000 <= YYYY <= 9999\n'
     '- 01/02/1000\n- 01/02/9999',
     '1. Ngày tháng hiển thị đúng định dạng dd/mm/yyyy.\n2. Hiển thị kết quả tìm kiếm tương ứng, khớp dữ liệu đang lưu trong hệ thống.',
    ),
]

BY_KIND['Ô ngày có giờ'] = DATEPICKER_GIO
BY_KIND['Ô ngày nhiều lựa chọn'] = DATEPICKER_KHOANG
