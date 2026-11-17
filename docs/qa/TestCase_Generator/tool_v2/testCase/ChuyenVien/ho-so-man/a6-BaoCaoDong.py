# -*- coding: utf-8 -*-
"""BƯỚC A6 của màn "Báo cáo động" — phần tool KHÔNG làm thay được.

HDSD §3 A6: sau khi khung đã sạch 13 bộ rà, phải sửa TAY cột C/D theo dữ kiện đã ground
(thông báo verbatim · giới hạn thật · hành vi thật của FE) và gắn cờ cho chỗ chưa chốt được.
Script chỉ ghi ĐÈ cột C/D/T của những case KHỚP LUẬT bên dưới — KHÔNG thêm/xoá/đổi tên case,
nên mã case và lớp công thức không đổi. Chạy lại được nhiều lần (idempotent).

KHÁC 2 script a6 anh em (`a6-NhomNguon.py` · `a6-ViTriLuuTru.py`): hai script đó khai bảng
`{số dòng: (C, D, T)}`. Màn này có 985 case ở HAI sheet, và số dòng đổi mỗi lần sinh lại khung
(thêm/bỏ một nhóm control là lệch hết) ⇒ khai theo LUẬT KHỚP NỘI DUNG
`(sheet, tên CN, tên nhóm, tiêu đề case)`. Đổi lại phải có lưới chắn: luật nào khớp 0 case là
script DỪNG — đúng lớp lỗi "sửa im lặng 0 dòng mà báo thành công".

Căn cứ: hồ sơ màn `Testcase-Role-ChuyenVien-BaoCaoDong.json` khoá `grounding`
(BA `Tai-lieu/Báo cáo động.docx` §3 UC-BCD-01..24 + 6 chunk FE của màn + probe_live 2026-09-10
+ 2 ảnh màn thật 16:21).

    python3 a6-BaoCaoDong.py            # XEM TRƯỚC
    python3 a6-BaoCaoDong.py --apply    # ghi
    python3 a6-BaoCaoDong.py --chi-tiet # in cả tiêu đề từng case bị sửa
"""
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))


def _tim_tools():
    """Tìm thư mục `tools` — KHÔNG đoán cứng `../../../tools`.

    Bộ case có thể đặt NGOÀI repo (`QA_TESTCASE_DIR` cho phép), lúc đó đường cứng trỏ ra chỗ
    không có `tools` và script chết ngay bước A6 với `ModuleNotFoundError: tcfix` — dính
    2026-09-12 khi chạy thử chuỗi sinh vào thư mục khác. Đi NGƯỢC lên từ chính file này, rồi
    từ thư mục làm việc, tìm nơi thật sự có `tcfix.py`.
    """
    for goc in (HERE, os.getcwd()):
        d = goc
        for _ in range(6):
            ung = os.path.join(d, 'tools')
            if os.path.exists(os.path.join(ung, 'tcfix.py')):
                return ung
            if os.path.exists(os.path.join(d, 'tcfix.py')):
                return d
            d = os.path.dirname(d)
    raise SystemExit('KHÔNG tìm thấy thư mục `tools` (chứa tcfix.py) — đặt QA_TOOLS hoặc chạy '
                     'từ trong repo.')


sys.path.insert(0, os.environ.get('QA_TOOLS') or _tim_tools())
import tcfix                                                        # noqa: E402
import qalib                                                        # noqa: E402

XLSX = os.path.normpath(os.path.join(
    HERE, '..', 'testcase', 'Testcase-Role-ChuyenVien-BaoCaoDong.xlsx'))

V = '✿✿ [CẦN VERIFY] '
M = '✿✿ [YÊU CẦU MONG ĐỢI] '
R = '✿✿ [RỦI RO] '
L = '✿✿ [Lệch BA - theo Code] '

# ══════════════════════════════════════════════════════════════════════════════════════════
# Cụm chữ dùng lại — tất cả là NGUYÊN VĂN đọc từ bundle FE / BA, không diễn giải lại
# ══════════════════════════════════════════════════════════════════════════════════════════
T_QUYEN = (R + 'Router KHÔNG gắn RequireRole cho cả 4 route của module và code 3 trang không '
           'có điểm kiểm vai trò nào (BA §3.4 · §3.13 · GBR-10) ⇒ giao diện KHÔNG chặn vai trò '
           'nào. Nếu máy chủ cũng không chặn thì đây là lỗ hổng phân quyền. Cần QA/BA + dev '
           'xác nhận lưới chắn phía máy chủ.')
T_DAI_250 = (V + 'Giao diện chỉ chặn 250 ký tự bằng thuộc tính maxLength của ô nhập, không có '
             'luật độ dài riêng; giới hạn thật của cột dữ liệu chưa được xác nhận.')
T_DB = (V + 'Chưa xác nhận được tên bảng/cột CSDL thật của module Báo cáo động — câu truy vấn '
        'đối chiếu cần dev xác nhận trước khi thực thi.')

OFFLINE = ('Hiện thông báo "Bạn đang ngoại tuyến" kèm nội dung "Không thể kết nối đến máy chủ. '
           'Một số dữ liệu có thể không được cập nhật. Vui lòng kiểm tra kết nối internet và '
           'thử lại."; danh sách đang hiển thị KHÔNG bị xoá trắng.')
COT_BC = 'STT · Tên báo cáo · Bộ dữ liệu · Trạng thái · Cập nhật lúc · Hành động'
COT_BDL = 'STT · Bảng · Vùng dữ liệu · Ngày tạo · Trạng thái · Hành động'

LOI_PAGE = ('Số bản ghi/trang phải lớn hơn 0', 'Số bản ghi/trang phải là số nguyên',
            'Số bản ghi/trang tối đa 1000 bản ghi')

# ══════════════════════════════════════════════════════════════════════════════════════════
# LUẬT SỬA — (sheet, tên CN, tên nhóm, tiêu đề case, C, D, T)
#   · None = khớp mọi giá trị;  chuỗi = khớp CHỨA (bỏ dấu, không phân biệt hoa thường)
#   · C/D/T = None thì giữ nguyên ô đó
#   · Luật đặt TRƯỚC thắng luật đặt sau (mỗi case chỉ bị một luật sửa)
# ══════════════════════════════════════════════════════════════════════════════════════════
LUAT = []


def r(sheet, cn, nhom, tieu_de, C=None, D=None, T=None):
    LUAT.append((sheet, cn, nhom, tieu_de, C, D, T))


BC = 'BP-BaoCaoDong'
BD = 'BP-BoDuLieu'

# ══════════════════ 0. LUẬT HẸP — phải khai TRƯỚC luật rộng cùng nhóm ══════════════════

# ── BỔ SUNG 2026-09-14: nối dữ kiện `grounding` CÒN CHƯA DÙNG vào case ─────────────────────
# `audit_noi_dung` đo màn này chỉ phủ 41% (124 dữ kiện đã ground mà không case nào dẫn). Khối
# dưới chỉ nối những dữ kiện KHÔNG vướng luật cứng UI: placeholder ô chọn ở BIỂU MẪU do luật
# cứng chốt chữ `-- Chọn --` (luật thắng grounding) nên KHÔNG đưa `-- Chọn cột nhóm --` vào
# case *giá trị mặc định* — sẽ bị `fix_luat_cung` ghi đè và `audit_luat_cung` báo đỏ.

# (2 luật `danh sach bao cao / khong co du lieu` và `checkbox ban ghi / tich chon mot ban ghi`
#  đã có sẵn bên dưới — nối chữ verbatim vào CHÍNH chúng, không khai luật mới đè lên.)

# 3 ô chọn của modal Thêm bộ dữ liệu: chữ "không tìm thấy" KHÁC nhau giữa bảng và hai ô kia.
r(BD, 'them bo du lieu', 'combobox danh muc', 'go tu khoa khong ton tai', None,
  'Danh sách gợi ý rỗng và hiện dòng chữ "Không tìm thấy kết quả". Ô chọn không đóng lại.')
r(BD, 'them bo du lieu', 'combobox schema', 'go tu khoa khong ton tai', None,
  'Danh sách gợi ý rỗng và hiện dòng chữ "Không tìm thấy kết quả". Ô chọn không đóng lại.')
r(BD, 'them bo du lieu', 'combobox bang view', 'go tu khoa khong ton tai', None,
  'Danh sách gợi ý rỗng và hiện dòng chữ "Không tìm thấy bảng nào". Ô chọn không đóng lại.')
r(BD, 'them bo du lieu', 'combobox danh muc', 'xoa tu khoa', None,
  'Danh sách gợi ý trở về đầy đủ như trước khi gõ. Ô tìm hiện lại chữ gợi ý "Tìm catalog...".')
r(BD, 'them bo du lieu', 'combobox schema', 'xoa tu khoa', None,
  'Danh sách gợi ý trở về đầy đủ như trước khi gõ. Ô tìm hiện lại chữ gợi ý "Tìm schema...".')
r(BD, 'them bo du lieu', 'combobox bang view', 'xoa tu khoa', None,
  'Danh sách gợi ý trở về đầy đủ như trước khi gõ. Ô tìm hiện lại chữ gợi ý "Tìm tên bảng...".')
r(BD, 'them bo du lieu', 'combobox danh muc', 'cach tai du lieu', None,
  'Trong lúc gọi máy chủ ô hiện chữ "Đang tải...". Gọi hỏng thì hiện "Không thể tải danh sách '
  'catalog" kèm nút "Thử lại".')
r(BD, 'them bo du lieu', 'combobox schema', 'cach tai du lieu', None,
  'Trong lúc gọi máy chủ ô hiện chữ "Đang tải...". Gọi hỏng thì hiện "Không thể tải danh sách '
  'schema" kèm nút "Thử lại".')
r(BD, 'them bo du lieu', 'combobox bang view', 'cach tai du lieu', None,
  'Trong lúc gọi máy chủ ô hiện chữ "Đang tải...". Gọi hỏng thì hiện "Không thể tải danh sách '
  'bảng" kèm nút "Thử lại".')

# Ô số bản ghi/trang: 3 thông báo lỗi verbatim, mỗi ngưỡng một câu.
r(BC, 'danh sach bao cao', 'textbox so ban ghi', 'nhap 0 vao o so ban ghi', None,
  'Hiện dòng chữ đỏ "Số bản ghi/trang phải lớn hơn 0". Danh sách giữ nguyên số bản ghi đang áp.')
r(BC, 'danh sach bao cao', 'textbox so ban ghi', 'nhap lon hon 1000', None,
  'Hiện dòng chữ đỏ "Số bản ghi/trang tối đa 1000 bản ghi". Danh sách giữ nguyên số bản ghi '
  'đang áp.')
r(BC, 'danh sach bao cao', 'textbox so ban ghi', 'nhap ky tu khac so', None,
  'Ô không nhận ký tự khác số. Nhập số lẻ thì hiện dòng chữ đỏ "Số bản ghi/trang phải là số '
  'nguyên".')

# Bảng danh sách rỗng: chữ khác nhau theo BỘ LỌC đang áp.

# Thanh thao tác hàng loạt: nhãn nút mang số lượng đã chọn.
r(BD, 'danh sach bo du lieu', 'checkbox ban ghi', 'tich chon o tich chon cua mot ban ghi', None,
  'Dòng được tích và thanh thao tác hàng loạt hiện lên với các nút "Tắt {N} mục" · '
  '"Kích hoạt {N} mục" · "Xóa {N} mục".')

# Lỗi tải danh sách của cả hai thẻ.
# (luật `danh sach bo du lieu / gia tri mac dinh` đã có sẵn bên dưới — nối thêm câu lỗi tải
#  vào chính luật đó thay vì khai luật mới đè lên nó.)

# Ô chọn hàm tổng hợp có thêm lựa chọn KHÔNG tổng hợp — mục dễ sót nhất của ô này.
r(BC, 'tao bao cao', 'selectbox ham tong hop', 'cac gia tri co trong', None,
  'Hiển thị các giá trị: "SELECT (không tổng hợp)" · "SUM" · "COUNT" · "AVG" · "MIN" · "MAX" · '
  '"COUNT_DISTINCT".')

r(BC, 'xem chi tiet bao cao', 'button quay lai danh sach', None,
  '1. Mở màn Chi tiết, bấm nút "Quay lại danh sách".',
  None)

# ── Chế độ SỬA nạp sẵn dữ liệu của báo cáo ⇒ 3 case *giá trị mặc định* khác luồng tạo mới ──
r(BC, 'xoa bao cao', 'chuc nang xoa', 'xoa thanh cong ban ghi chua duoc su dung',
  '1. Chọn 1 báo cáo "Bản nháp" hoặc "Đã xuất bản".\n'
  '2. Bấm biểu tượng "Xóa" rồi bấm "Xác nhận" trong hộp thoại.',
  'Hiện thông báo nổi Đã xóa "{tên báo cáo}"; thẻ chữ trạng thái của dòng đó đổi sang "Đã xóa" '
  '(nền đỏ chữ trắng) và bộ biểu tượng đổi thành "Khôi phục" · "Xóa vĩnh viễn". Báo cáo VẪN còn '
  'trong danh sách vì đây là xoá mềm.')
r(BC, 'xoa bao cao', 'chuc nang xoa', 'chon nhieu ban ghi de xoa',
  '1. Tích chọn từ 2 báo cáo KHÁC "Đã xóa" trở lên.\n'
  '2. Bấm nút "Xóa {N} mục" trên thanh thao tác hàng loạt.',
  'Thao tác thực thi NGAY, KHÔNG có hộp xác nhận (khác xoá đơn lẻ — BA BR-BCD-06-2 / AF-03); '
  'các báo cáo đã chọn chuyển sang trạng thái "Đã xóa"; lựa chọn ô tích được xoá về rỗng và '
  'danh sách tải lại.')
r(BC, 'xoa bao cao', 'chuc nang xoa', 'khi xoa trung du lieu cung luc',
  '1. Mở thẻ "Báo cáo" trên 2 trình duyệt.\n'
  '2. Ở A xoá một báo cáo và bấm "Xác nhận".\n'
  '3. Ở B (chưa làm mới) xoá CHÍNH báo cáo đó và bấm "Xác nhận".',
  'A hiện Đã xóa "{tên báo cáo}". B: máy chủ trả lỗi, hệ thống hiện thông báo nổi '
  '"Xóa báo cáo thất bại" kèm thông điệp máy chủ, hộp thoại đóng và trạng thái giữ nguyên; sau '
  'khi làm mới thì dòng đó đã ở trạng thái "Đã xóa".',
  V + 'Chưa xác nhận được thông điệp máy chủ trả về cho ca xoá một bản ghi đã bị người khác '
  'xoá — cần dev/BA chốt.')
r(BC, 'xoa vinh vien bao cao', 'chuc nang xoa', 'xoa thanh cong ban ghi chua duoc su dung',
  '1. Lọc "-- Chọn trạng thái --" = "Đã xóa", chọn 1 báo cáo.\n'
  '2. Bấm biểu tượng "Xóa vĩnh viễn" rồi bấm "Xóa vĩnh viễn" trong hộp thoại.',
  'Hiện thông báo nổi Đã xóa vĩnh viễn "{tên báo cáo}"; báo cáo biến HẲN khỏi danh sách và '
  '"Tổng số bản ghi:" giảm đúng 1; không khôi phục lại được.')
r(BC, 'xoa vinh vien bao cao', 'chuc nang xoa', 'chon nhieu ban ghi de xoa',
  '1. Lọc trạng thái "Đã xóa", tích chọn từ 2 báo cáo trở lên.\n'
  '2. Bấm nút "Xóa vĩnh viễn {N} mục" rồi bấm "Xóa vĩnh viễn" trong hộp thoại.',
  'Hộp thoại có tiêu đề "Xóa vĩnh viễn các báo cáo đã chọn?" và nội dung "{N} báo cáo sẽ bị xóa '
  'khỏi hệ thống và không thể khôi phục."; xác nhận thì các báo cáo đã chọn biến hẳn khỏi danh '
  'sách, lựa chọn ô tích được xoá về rỗng và danh sách tải lại.')
r(BC, 'xoa vinh vien bao cao', 'chuc nang xoa', 'khi xoa trung du lieu cung luc',
  '1. Mở thẻ "Báo cáo" (lọc "Đã xóa") trên 2 trình duyệt.\n'
  '2. Ở A xoá vĩnh viễn một báo cáo.\n3. Ở B (chưa làm mới) xoá vĩnh viễn CHÍNH báo cáo đó.',
  'A hiện Đã xóa vĩnh viễn "{tên báo cáo}". B: máy chủ trả lỗi, hệ thống hiện thông báo nổi '
  '"Xóa vĩnh viễn báo cáo thất bại" kèm thông điệp máy chủ; sau khi làm mới thì dòng đó không '
  'còn trong danh sách.',
  V + 'Chưa xác nhận được thông điệp máy chủ cho ca xoá vĩnh viễn một bản ghi đã bị xoá — cần '
  'dev/BA chốt.')
# ── Case `giá trị mặc định` ở CN Sửa: cột D là BẢN CHỮ CHUẨN (chỉ thị 2026-09-14) ─────────
#    Sáu luật dưới đây trước kia ghi thẳng văn tả ô nạp sẵn vào cột D. Chi tiết ấy ĐÚNG nhưng
#    SAI CHỖ: cột D của lớp case này chốt đúng một câu `qalib.MAC_DINH_KQ_SUA`, chi tiết thuộc
#    cột T (§8.3). Nay chúng chỉ còn ghi cột C (bước thao tác đã ground) và cột T (dẫn chứng) —
#    cột D để `fix_chi_thi_0914.py` / `fix_macdinh_sua.py` cấp theo bản chữ chuẩn.
#    ⛔ Đừng trả vế D lại: `qalib.a6_chan_ghi` sẽ CHẶN, luật thành khớp 0 case và script DỪNG.
r(BC, 'chinh sua bieu do bao cao', 'nut chon the bo du lieu', 'gia tri mac dinh',
  '1. Mở màn Chỉnh sửa biểu đồ của một báo cáo "Bản nháp".\n2. Sang Bước 2 "Chọn bộ dữ liệu".',
  None,
  V + 'Mặc định mở thẻ "Bộ dữ liệu đã kích hoạt"; các bộ dữ liệu mà báo cáo ĐANG dùng đã được '
  'tích chọn sẵn (nạp sẵn từ báo cáo gốc — BA §3.16.16 bước 3).')
r(BC, 'chinh sua bieu do bao cao', 'nut chon loai bieu do', 'gia tri mac dinh',
  '1. Mở màn Chỉnh sửa biểu đồ, sang Bước 3 và chọn một biểu đồ trong "Danh sách biểu đồ".',
  None,
  V + 'Thẻ loại biểu đồ được chọn sẵn theo loại đã lưu của biểu đồ đang xem, không phải mặc '
  'định "Biểu đồ cột" như luồng tạo mới.')
r(BC, 'chinh sua bieu do bao cao', 'nut chon che do bieu do', 'gia tri mac dinh',
  '1. Mở màn Chỉnh sửa biểu đồ của một báo cáo có biểu đồ cột, sang Bước 3.',
  None,
  V + 'Chế độ được chọn sẵn theo cấu hình ĐÃ LƯU của biểu đồ: có khai cột nhóm thì là '
  '"Cột nhóm", không có thì là "Cột đơn".')
r(BC, 'chinh sua bieu do bao cao', 'textbox ten bao cao', 'gia tri mac dinh',
  '1. Mở màn Chỉnh sửa biểu đồ của một báo cáo "Bản nháp".\n2. Xem ô "Tên báo cáo" ở Bước 1.',
  None,
  V + 'Ô đã nạp SẴN tên của báo cáo đang sửa; ngay dưới hai ô có dòng chữ nhỏ '
  '"Tên báo cáo, mô tả và bộ dữ liệu hiện chưa hỗ trợ lưu khi chỉnh sửa (thiếu dịch vụ lưu ở '
  'máy chủ) — thay đổi ở đây chỉ để xem trước giao diện, chưa được lưu lại."')
r(BC, 'chinh sua bieu do bao cao', 'textarea mo ta', 'gia tri mac dinh',
  '1. Mở màn Chỉnh sửa biểu đồ, xem ô "Mô tả" ở Bước 1.',
  None,
  V + 'Ô đã nạp SẴN mô tả của báo cáo đang sửa; báo cáo chưa có mô tả thì ô chỉ còn chữ gợi ý '
  '"Ví dụ: Báo cáo tuyển sinh theo tỉnh".')
r(BC, 'chinh sua bieu do bao cao', 'danh sach bieu do', 'gia tri mac dinh',
  '1. Mở màn Chỉnh sửa biểu đồ của một báo cáo đã có nhiều biểu đồ.\n2. Xem cột trái ở Bước 3.',
  None,
  V + 'Khối "Danh sách biểu đồ" nạp SẴN đủ các biểu đồ hiện có của báo cáo (giữ đúng mã biểu đồ '
  'gốc để phân biệt sửa với thêm mới lúc lưu); mỗi dòng có nút X để bỏ khỏi luồng tạo báo cáo, '
  'nút đó tự ẩn khi chỉ còn 1 biểu đồ.')
r(BC, 'chinh sua bieu do bao cao', 'danh sach bieu do', 'khong co du lieu',
  '1. Mở màn Chỉnh sửa biểu đồ, thử bấm X để bỏ hết biểu đồ trong "Danh sách biểu đồ".',
  'không bỏ được biểu đồ cuối cùng: nút X tự ẩn khi chỉ còn 1 biểu đồ ⇒ khối "Danh sách biểu '
  'đồ" không bao giờ rỗng.')
# ── ô "Nhãn hiển thị" ở case *vượt độ dài*: khuôn ⑮ + cờ [CẦN VERIFY] cho chỗ giữ ──
r(BC, None, 'textbox nhan hien thi', 'vuot do dai',
  '1. Vào Bước 3, dán vào ô "Nhãn hiển thị" của một chỉ số một chuỗi rất dài (trên 250 ký tự).',
  'không có thông báo lỗi nào, không highlight và không đổi focus: ô "Nhãn hiển thị" không đặt '
  'giới hạn ký tự ở giao diện nên hệ thống không cho nhập quá.',
  V + 'Ô "Nhãn hiển thị" KHÔNG có giới hạn ký tự ở giao diện; giới hạn thật của cột dữ liệu '
  'chưa xác nhận — cần dev/BA chốt.')


# ══════════════════ 1. HAI THẺ DÙNG CHUNG — mất mạng · thanh phân trang ══════════════════
r(None, None, None, 'mat ket noi mang',
  '1. Mở màn Báo cáo động, chờ danh sách tải xong.\n'
  '2. Ngắt kết nối Internet của thiết bị.\n'
  '3. Bấm nút làm mới (biểu tượng tròn cạnh "Xuất Excel").', OFFLINE)

# ── Ô nhập "Số bản ghi/trang:" — KHÔNG phải dropdown 10/20/50 như BA mô tả ──
r(None, None, 'so ban ghi/trang', 'gia tri mac dinh o so ban ghi',
  '1. Mở màn, kéo xuống thanh phân trang cuối bảng.\n'
  '2. Đọc giá trị trong ô "Số bản ghi/trang:".',
  'Mặc định là 20.',
  L + 'BA §3.16.3 mô tả đây là "Dropdown Hiển thị N /trang (10/20/50)". Màn thật + code là Ô '
  'NHẬP SỐ kèm nút chọn nhanh. Ngoài ra code khai pageSize mặc định 20 mà màn đang hiện 10 — '
  'cần QA/BA chốt giá trị mặc định đúng.')
r(None, None, 'so ban ghi/trang', 'nhap ky tu khac so',
  '1. Bấm vào ô "Số bản ghi/trang:".\n'
  '2. Gõ chữ và ký tự đặc biệt (vd: abc!@#).',
  'Không cho phép nhập')
r(None, None, 'so ban ghi/trang', 'nhap so am',
  '1. Bấm vào ô "Số bản ghi/trang:".\n'
  '2. Gõ dấu trừ rồi gõ số (vd: -5), sau đó rời khỏi ô (blur) hoặc nhấn Enter.',
  'Không cho phép nhập')
r(None, None, 'so ban ghi/trang', 'nhap 0 vao o so ban ghi',
  '1. Xoá trắng ô "Số bản ghi/trang:" rồi gõ 0.\n'
  '2. Rời khỏi ô (blur) hoặc nhấn Enter.',
  'Hiện dòng lỗi "Số bản ghi/trang phải lớn hơn 0" ngay tại cụm phân trang. Số bản ghi mỗi '
  'trang không bị đổi, danh sách vẫn giữ nguyên.')
r(None, None, 'so ban ghi/trang', 'nhap lon hon 1000',
  '1. Gõ 1001 (hoặc số lớn hơn) vào ô "Số bản ghi/trang:".\n'
  '2. Rời khỏi ô (blur) hoặc nhấn Enter.',
  'Hiện thông báo nổi dạng cảnh báo "Số bản ghi/trang tối đa 1000 bản ghi". Ô tự đưa về giá trị '
  'đang áp dụng trước đó, không áp mức vừa gõ.')
r(None, None, 'so ban ghi/trang', 'trung mot muc co san trong o chon nhanh',
  '1. Bấm nút mũi tên "Chọn nhanh số bản ghi" để xem các mức có sẵn.\n'
  '2. Gõ tay đúng một mức trong đó vào ô "Số bản ghi/trang:" rồi nhấn Enter.',
  '1. Hiển thị đúng số lượng bản ghi/trang = số đã nhập\n2. Giá trị tương ứng trong ô select '
  'được focus')
r(None, None, 'so ban ghi/trang', 'khong trung muc nao trong o chon nhanh',
  '1. Gõ một số nguyên dương KHÔNG có trong danh sách chọn nhanh (vd 7) vào ô '
  '"Số bản ghi/trang:".\n2. Nhấn Enter.',
  '1. Hiển thị đúng số lượng bản ghi/trang = số đã nhập\n2. Không có giá trị nào trong ô select '
  'được focus')
r(None, None, 'so ban ghi/trang', 'nho hon tong so ban ghi',
  '1. Đọc "Tổng số bản ghi:" ở thanh phân trang.\n'
  '2. Gõ vào ô "Số bản ghi/trang:" một số NHỎ HƠN tổng đó rồi nhấn Enter.',
  'Hiển thị đúng số bản ghi mỗi trang và hiển thị phân trang')
r(None, None, 'so ban ghi/trang', 'lon hon tong so ban ghi',
  '1. Gõ vào ô "Số bản ghi/trang:" một số LỚN HƠN "Tổng số bản ghi:" rồi nhấn Enter.',
  'Hiển thị toàn bộ bản ghi và không hiển thị phân trang')
r(None, None, 'so ban ghi/trang', 'bang dung tong so ban ghi',
  '1. Gõ vào ô "Số bản ghi/trang:" đúng bằng "Tổng số bản ghi:" rồi nhấn Enter.',
  'Hiển thị toàn bộ bản ghi và không hiển thị phân trang')

# ── Nút "Chọn nhanh số bản ghi" ──
r(None, None, 'selectbox so ban ghi tren trang', 'gia tri mac dinh',
  '1. Bấm nút mũi tên "Chọn nhanh số bản ghi" ở cạnh ô "Số bản ghi/trang:".',
  'Mặc định là 20.')
r(None, None, 'selectbox so ban ghi tren trang', 'cac gia tri trong o chon',
  '1. Bấm nút "Chọn nhanh số bản ghi".\n2. Đọc các mức trong danh sách.',
  'Hiển thị các giá trị: "20" · "50" · "100" · "200" · "500"',
  V + 'Danh sách mức gợi ý dựng động trong component phân trang dùng chung; cần QA/BA chốt '
  'bộ mức chuẩn cho màn này (BA §3.16.3 ghi 10/20/50).')
r(None, None, 'selectbox so ban ghi tren trang', 'nho hon tong so',
  '1. Bấm "Chọn nhanh số bản ghi", chọn một mức NHỎ HƠN "Tổng số bản ghi:".',
  '1. Giá trị 20 trong ô select được focus\n2. Hiển thị 20 bản ghi ở trang đầu tiên và hiển thị '
  'phân trang\n3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn')
r(None, None, 'selectbox so ban ghi tren trang', 'lon hon hoac bang tong so',
  '1. Bấm "Chọn nhanh số bản ghi", chọn một mức LỚN HƠN "Tổng số bản ghi:".',
  '1. Giá trị đã chọn trong ô select được focus\n2. Hiển thị toàn bộ bản ghi và không hiển thị '
  'phân trang\n3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn')
r(None, None, 'selectbox so ban ghi tren trang', 'bang dung tong so ban ghi hien co',
  '1. Bấm "Chọn nhanh số bản ghi", chọn mức bằng đúng "Tổng số bản ghi:".',
  '1. Giá trị đã chọn trong ô select được focus\n2. Hiển thị toàn bộ bản ghi và không hiển thị '
  'phân trang\n3. Ô textbox số bản ghi/trang hiển thị đúng giá trị đã chọn')

# ── Nhóm Phân trang ──
r(None, None, 'phan trang', 'cach danh so cac ban ghi',
  '1. Mở màn, đọc cột "STT" của trang 1.\n'
  '2. Chuyển sang trang 2 và đọc lại cột "STT".',
  'Đánh số thứ tự tăng dần và liên tục: Số thứ tự đầu tiên của trang sau là số tiếp theo của '
  'trang trước.')
r(None, None, 'phan trang', 'mo cac trang',
  '1. Bấm lần lượt từng số trang trên thanh phân trang.\n'
  '2. Bấm các nút "Trang đầu", "Trang trước", "Trang sau", "Trang cuối".',
  'Mỗi lần bấm, bảng tải đúng trang tương ứng. Nút "Trang đầu"/"Trang trước" bị vô hiệu khi '
  'đang ở trang 1, nút "Trang sau"/"Trang cuối" bị vô hiệu khi đang ở trang cuối.')
r(None, None, 'phan trang', 'sau khi chuyen trang',
  '1. Đang ở trang 1, cuộn xuống rồi bấm sang trang 2.',
  'Menu, header, footer không thay đổi')
r(None, None, 'phan trang', 'style cua paging',
  '1. Quan sát cụm phân trang: nhãn "Số bản ghi/trang:", ô nhập, nút "Chọn nhanh số bản ghi", '
  'các nút "Trang đầu" · "Trang trước" · số trang · "Trang sau" · "Trang cuối", '
  'nhãn "Tổng số bản ghi:".',
  'Các thành phần thẳng hàng, cùng chiều cao. Nút đang chọn được tô khác. Nút bị vô hiệu mờ đi '
  'và con trỏ chuột đổi thành dấu cấm.')
r(None, None, 'phan trang', 'kiem tra luu cache',
  '1. Đặt số bản ghi/trang và chuyển sang trang 2.\n'
  '2. Rời sang thẻ khác rồi quay lại, hoặc bấm nút làm mới.',
  'Hệ thống không bị lưu cache',
  V + 'Hành vi ghi nhớ khi rời màn rồi vào lại chưa được chốt trong BA — cần QA/BA xác nhận '
  'mong đợi.')

# ══════════════════ 2. THẺ BÁO CÁO — danh sách ══════════════════
r(BC, 'danh sach bao cao', 'nut chon the', 'gia tri mac dinh',
  '1. Mở màn Báo cáo động từ menu Báo cáo.',
  'Mặc định mở sẵn thẻ "Báo cáo". Thẻ đang chọn được gạch chân, cạnh tên thẻ có con số bản ghi '
  'khớp bộ lọc hiện tại.')
r(BC, 'danh sach bao cao', 'nut chon the', 'kiem tra cac lua chon',
  '1. Đọc hàng thẻ ngay dưới tiêu đề màn.',
  'Có các thẻ: "Báo cáo" và "Bộ dữ liệu", mỗi thẻ kèm con số bản ghi. Thẻ "Mẫu báo cáo" đã được '
  'gỡ khỏi giao diện nên không còn.')
r(BC, 'danh sach bao cao', 'nut chon the', 'chuyen doi giua cac lua chon',
  '1. Bấm thẻ "Bộ dữ liệu".\n2. Bấm lại thẻ "Báo cáo".',
  'Bảng, thanh lọc và cụm phân trang đổi theo đúng thẻ đang chọn. Đường dẫn trang không đổi. '
  'Con số trên mỗi thẻ vẫn là số bản ghi của chính thẻ đó.')

r(BC, 'danh sach bao cao', 'lam moi du lieu', 'hien thi nut',
  '1. Quan sát nút làm mới ở cuối thanh lọc, bên phải nút "Xuất Excel".',
  'Nút hình TRÒN mang biểu tượng mũi tên xoay, rê chuột vào hiện chú thích "Làm mới dữ liệu". '
  'Ngay dưới thanh lọc, căn phải, có dòng "Cập nhật: " kèm thời điểm dạng d/m/yyyy hh:mm.')
r(BC, 'danh sach bao cao', 'lam moi du lieu', 'khong ap dung bo loc',
  '1. Chưa lọc và chưa tìm kiếm gì.\n2. Bấm nút "Làm mới dữ liệu".',
  'Danh sách tải lại từ máy chủ. Hiện thông báo nổi "Đã làm mới". Dòng "Cập nhật: " đổi sang '
  'thời điểm mới.')
r(BC, 'danh sach bao cao', 'lam moi du lieu', 'dang co bo loc',
  '1. Chọn "-- Chọn trạng thái --" = "Đã xuất bản" và nhập từ khoá vào ô tìm.\n'
  '2. Bấm nút "Làm mới dữ liệu".',
  'Bộ lọc trạng thái và từ khoá đang áp giữ nguyên, danh sách chỉ tải lại theo đúng điều kiện '
  'đó. Hiện thông báo nổi "Đã làm mới".')
r(BC, 'danh sach bao cao', 'lam moi du lieu', 'trang phan trang khac',
  '1. Chuyển sang trang 2 (hoặc 3).\n2. Bấm nút "Làm mới dữ liệu".',
  'Vẫn ở đúng trang đang xem, không nhảy về trang 1. Hiện thông báo nổi "Đã làm mới".')
r(BC, 'danh sach bao cao', 'lam moi du lieu', 'hieu ung loading',
  '1. Bấm nút "Làm mới dữ liệu" và quan sát trong lúc chờ máy chủ trả về.',
  'Trong lúc tải, vùng bảng hiện trạng thái đang tải thay cho các dòng dữ liệu. Xong thì hiện '
  'lại danh sách kèm thông báo nổi "Đã làm mới".')

r(BC, 'danh sach bao cao', 'danh sach bao cao', 'gia tri mac dinh cua bao cao',
  '1. Mở màn Báo cáo động, chưa lọc và chưa tìm kiếm gì.',
  'Bảng hiện các báo cáo do máy chủ trả về theo trang đầu, đủ cả 3 trạng thái Bản nháp / '
  'Đã xuất bản / Đã xóa (không lọc sẵn trạng thái nào); nhãn "Tổng số bản ghi:" bằng tổng số '
  'báo cáo đang có. Gọi máy chủ hỏng thì hiện "Không thể tải danh sách báo cáo" kèm nút '
  '"Thử lại", danh sách cũ trên màn không bị xoá trắng.')
r(BC, 'danh sach bao cao', 'danh sach bao cao', 'tieu de cot',
  '1. Đọc hàng tiêu đề của bảng danh sách báo cáo.',
  'Đúng 6 cột theo thứ tự: ' + COT_BC + '. Giữa cột "STT" và cột "Tên báo cáo" có thêm một cột '
  'hẹp không nhãn chứa ô tích chọn dòng.')
# ⚠️ Chỉ thị người đặt việc 2026-09-14: cột D của case này *"đang dài lan man chưa đúng trọng
#    tâm mục đích case"*. Mục đích case = danh sách RỖNG trông thế nào; cột C chốt đúng MỘT tình
#    huống (chưa có báo cáo nào, không áp bộ lọc). Bản cũ mở đầu bằng ba biến thể chữ THEO BỘ LỌC
#    — tả tình huống mà chính cột C không dựng ra — rồi chép cả chữ hướng dẫn 2 bước của khối
#    trống. Ba biến thể lọc + chữ hướng dẫn dồn sang cột T, không vứt.
r(BC, 'danh sach bao cao', 'danh sach bao cao', 'khong co du lieu',
  '1. Chuẩn bị hệ thống chưa có báo cáo nào (hoặc xoá vĩnh viễn hết).\n2. Mở màn.',
  'Bảng danh sách được thay bằng khối trống mang tiêu đề "Chưa có báo cáo nào". Thanh phân '
  'trang không hiện.',
  V + 'Chữ của khối trống ĐỔI THEO BỘ LỌC đang áp: "Chưa có báo cáo đã xuất bản" · "Chưa có '
  'báo cáo đã xóa" · "Không có báo cáo khớp bộ lọc" — thuộc case của khối lọc, không thuộc case '
  'này. Khối trống còn kèm dòng "Báo cáo động được tạo theo 2 bước: khai báo bộ dữ liệu → tạo '
  'báo cáo." và 2 mục hướng dẫn "1. Khai báo bộ dữ liệu / Chọn bảng ở tầng GOLD/DIAMOND được '
  'phép báo cáo" · "2. Tạo báo cáo / Chọn bộ dữ liệu rồi cấu hình tối đa 6 biểu đồ".')
r(BC, 'danh sach bao cao', 'danh sach bao cao', 'so luong ban ghi tren',
  '1. Đếm số dòng đang hiện trên bảng.\n'
  '2. Đối chiếu với ô "Số bản ghi/trang:" và nhãn "Tổng số bản ghi:".',
  'Số dòng đúng bằng số bản ghi mỗi trang. Nhãn "Tổng số bản ghi:" bằng tổng số báo cáo khớp bộ '
  'lọc đang áp.')
r(BC, 'danh sach bao cao', 'danh sach bao cao', 'hien thi dung cot',
  '1. Chọn 1 báo cáo và đối chiếu từng ô trên dòng với dữ liệu của báo cáo đó.',
  'Cột "Tên báo cáo" là tên báo cáo. Cột "Bộ dữ liệu" hiện MỖI bộ dữ liệu thành một thẻ chữ '
  'dạng {schema}.{bảng}. Cột "Trạng thái" là nhãn Bản nháp / Đã xuất bản / Đã xóa. Cột "Cập '
  'nhật lúc" theo dạng d/m/yyyy hh:mm.')
r(BC, 'danh sach bao cao', 'danh sach bao cao', 'do rong cac cot',
  '1. Quan sát bề rộng 6 cột ở màn hình rộng và sau khi thu hẹp cửa sổ.',
  'Độ rộng các cột phù hợp với dữ liệu')
r(BC, 'danh sach bao cao', 'danh sach bao cao', 'hien thi du lieu dai',
  '1. Chuẩn bị 1 báo cáo có tên dài tối đa (250 ký tự) và dùng nhiều bộ dữ liệu.\n'
  '2. Xem dòng đó trên bảng.',
  'Hiển thị không bị tràn cột')
r(BC, 'danh sach bao cao', 'danh sach bao cao', 'dieu huong dung trang',
  '1. Bấm vào một dòng báo cáo (bấm vào vùng chữ, không bấm ô tích và không bấm cột Hành động).',
  'Chuyển sang màn Xem chi tiết báo cáo, tiêu đề màn là tên chính báo cáo vừa bấm. Bấm vào ô '
  'tích chọn hoặc vào cột "Hành động" thì không điều hướng.')

r(BC, 'danh sach bao cao', 'checkbox ban ghi', 'gia tri mac dinh',
  '1. Mở màn, chưa tích chọn gì.',
  'Mặc định là không tích chọn checkbox')
r(BC, 'danh sach bao cao', 'checkbox ban ghi', 'tich chon o tich chon cua mot ban ghi',
  '1. Tích chọn 1 dòng bất kỳ.',
  'Ô tích của dòng đó được tích. Hiện thanh thao tác hàng loạt nổi phía dưới bảng với dòng "1 '
  'mục đã chọn" và nút "Bỏ chọn tất cả". Nút hàng loạt hiện theo trạng thái THỰC của dòng đã '
  'chọn: "Xuất bản {N} mục" · "Xóa {N} mục" · "Khôi phục {N} mục" · "Xóa vĩnh viễn {N} mục".')
r(BC, 'danh sach bao cao', 'checkbox ban ghi', 'bo tich o tich chon cua mot ban ghi',
  '1. Đang tích 1 dòng, bấm lại chính ô tích đó.',
  'Checkbox được bỏ tích chọn')
r(BC, 'danh sach bao cao', 'checkbox ban ghi', 'tich chon o tich chon tat ca',
  '1. Bấm ô tích ở HÀNG TIÊU ĐỀ.',
  'Toàn bộ dòng đang hiển thị của trang được tích. Thanh thao tác hàng loạt hiện đúng số lượng '
  'đã chọn. Tích một phần thì ô tích hàng tiêu đề chuyển sang "đã chọn một phần", không phải '
  'dấu tích đầy.')
r(BC, 'danh sach bao cao', 'checkbox ban ghi', 'bo tich o tich chon tat ca',
  '1. Đang tích tất cả, bấm lại ô tích ở hàng tiêu đề.',
  'Bỏ tích toàn bộ dòng của trang đang xem. Thanh thao tác hàng loạt biến mất.')
r(BC, 'danh sach bao cao', 'checkbox ban ghi', 'chuyen sang trang khac',
  '1. Tích chọn vài dòng ở trang 1.\n'
  '2. Bấm sang trang 2 rồi quay lại trang 1.\n'
  '3. Đổi ô "Số bản ghi/trang:" sang mức khác.',
  'Checkbox được tích chọn')

# ── Icon trên dòng: 3 bộ icon KHÁC nhau theo trạng thái (probe_live 10/09 đọc được cả 3) ──
r(BC, 'danh sach bao cao', 'icon', 'phu hop voi chuc nang',
  '1. Xem cột "Hành động" của 1 dòng Bản nháp, 1 dòng Đã xuất bản và 1 dòng Đã xóa.',
  'Bộ biểu tượng đổi theo trạng thái dòng: Bản nháp → Xuất bản · Tải về · Chỉnh sửa · Xóa; '
  'Đã xuất bản → Tải về · Xóa; Đã xóa → Khôi phục · Xóa vĩnh viễn. Biểu tượng "Tải về" chỉ '
  'hiện khi báo cáo đã có mã dashboard Superset lớn hơn 0. Mỗi dòng nhiều nhất 4 biểu tượng '
  'nên KHÔNG bao giờ có nút gộp "Thêm hành động".')
r(BC, 'danh sach bao cao', 'icon', 'mau icon xoa',
  '1. Xem biểu tượng "Xóa" và "Xóa vĩnh viễn" ở cột "Hành động".',
  'Hai biểu tượng này mang màu đỏ cảnh báo, khác màu các biểu tượng còn lại. Chú thích khi rê '
  'chuột lần lượt là "Xóa" và "Xóa vĩnh viễn".')
r(BC, 'danh sach bao cao', 'icon', 'noi dung va chinh ta cua chu thich',
  '1. Rê chuột lần lượt qua từng biểu tượng của cả 3 loại dòng.',
  'Chú thích đúng nguyên văn và đúng chính tả: "Xuất bản" · "Tải về" · "Chỉnh sửa" · "Xóa" · '
  '"Khôi phục" · "Xóa vĩnh viễn".')
r(BC, 'danh sach bao cao', 'icon', None,
  None, None,
  V + 'Chú thích của biểu tượng dựng bằng thuộc tính title/aria-label của nút, không phải khối '
  'chú thích riêng — kích thước, căn lề và thời điểm ẩn/hiện do trình duyệt quyết định. Cần '
  'QA/BA chốt mong đợi trước khi chấm Fail các case về bề rộng/căn lề chú thích.')

r(BC, 'danh sach bao cao', 'chuc nang danh sach', 'khop db',
  '1. Mở màn danh sách báo cáo, ghi lại các dòng đang hiển thị.\n'
  '2. Đối chiếu với dữ liệu máy chủ trả về cho lệnh listReports (search rỗng, statuses rỗng, '
  'đúng trang và số bản ghi/trang đang xem).',
  'Dữ liệu xuất ra khớp với DB', T_DB)

# ══════════════════ 3. THẺ BÁO CÁO — tìm kiếm & lọc ══════════════════
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'kiem tra gia tri mac dinh',
  '1. Mở màn Báo cáo động, xem ô lọc đầu tiên trên thanh lọc.',
  'Ô hiện chữ mờ "-- Chọn trạng thái --", bên phải là mũi tên chỉ xuống. Không có con số nào '
  'bên cạnh.',
  L + 'BA §3.16.2 Bảng thành phần còn ghi ô lọc là nút "Trạng thái" + popover có checkbox '
  'nhiều lựa chọn kèm nút "Đặt lại"/"Áp dụng" và badge số lượng. Màn thật + code là ô CHỌN MỘT '
  'giá trị, áp ngay khi chọn, không có 2 nút đó và không có badge (chính BR-BCD-02-1 của BA '
  'cũng mô tả như vậy — tài liệu mâu thuẫn nội bộ).')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'cac gia tri co trong',
  '1. Bấm mở ô "-- Chọn trạng thái --".',
  'Hiển thị các giá trị: "Bản nháp" · "Đã xuất bản" · "Đã xóa"')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'sap xep cac gia tri',
  '1. Bấm mở ô "-- Chọn trạng thái --" và đọc thứ tự các dòng.',
  'Giá trị trong selectbox được sắp xếp theo: "Tất cả trạng thái" · "Bản nháp" · "Đã xuất bản" '
  '· "Đã xóa"')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'chon cac gia tri khac nhau',
  '1. Chọn "Bản nháp" → xem danh sách.\n2. Chọn lại ô lọc, chọn "Đã xuất bản".\n'
  '3. Chọn "Tất cả trạng thái".',
  'Mỗi lần chọn: danh sách áp lọc ngay và ô chọn tự đóng, trang về 1, con số trên thẻ "Báo cáo" '
  'đổi theo. Chọn "Tất cả trạng thái" thì bỏ lọc. Ô chỉ giữ một giá trị, và hiện dấu X để xoá '
  'lựa chọn.')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'gia tri qua dai',
  '1. Bấm mở ô lọc và đọc dòng dài nhất ("Đã xuất bản").',
  '1. Độ rộng ô select không thay đổi theo chiều dài dữ liệu, selectbox được fix cứng ở 1 '
  'khoảng rộng nhất định\n2. Giá trị có tên dài vượt quá khoảng rộng cố định thì sẽ hiện thêm 3 '
  'chấm, khi di chuột vào hiện hết thông tin giá trị')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'can le cac gia tri',
  '1. Bấm mở ô lọc, quan sát căn lề các dòng.',
  'Các giá trị trong selectbox được căn lề trái')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'cach tai du lieu khi danh sach',
  '1. Bấm mở ô lọc.',
  'Nếu dữ liệu lớn thì load theo trang, mỗi trang 20 bản ghi. Khi cuộn chuột xuống thì load '
  'tiếp, mỗi lần load 1 trang')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'tim kiem khop 100%',
  '1. Bấm mở ô lọc.\n2. Gõ đúng nguyên văn "Đã xuất bản" vào ô "Tìm kiếm...".',
  'Danh sách chỉ còn đúng dòng "Đã xuất bản".')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'tim kiem khop 1 phan',
  '1. Bấm mở ô lọc.\n2. Gõ "xuất" vào ô "Tìm kiếm...".',
  'Danh sách còn các dòng có chứa chuỗi đó ("Đã xuất bản"). Khớp theo kiểu chứa chuỗi con.')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'khong phan biet hoa thuong',
  '1. Bấm mở ô lọc.\n2. Gõ "ĐÃ XUẤT BẢN" rồi gõ lại "đã xuất bản".',
  'Cả hai cách gõ đều ra cùng kết quả — ô tìm trong danh sách không phân biệt hoa thường.')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'tieng viet co dau, khong dau',
  '1. Bấm mở ô lọc.\n2. Gõ "da xuat ban" (không dấu).',
  'Vẫn tìm ra dòng "Đã xuất bản": ô tìm trong danh sách bỏ dấu tiếng Việt và đổi đ→d trước khi '
  'so khớp.')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'tu khoa khong ton tai',
  '1. Bấm mở ô lọc.\n2. Gõ một chuỗi không có trong danh sách (vd "zzz").',
  'Danh sách hiện dòng "Không tìm thấy". Không có dòng nào để chọn.')
r(BC, 'tim kiem & loc bao cao', 'selectbox trang thai', 'xoa tu khoa da nhap trong o tim kiem',
  '1. Đang gõ từ khoá trong ô "Tìm kiếm..." của danh sách.\n2. Bấm dấu X ở cuối ô tìm đó.',
  'Hiển thị đúng option')

# ── Ô tìm kiếm thẻ Báo cáo ──
r(BC, 'tim kiem & loc bao cao', 'tim theo ten bao cao', 'gia tri mac dinh',
  '1. Mở màn, xem ô tìm ở giữa thanh lọc.',
  'Ô trống, hiện chữ gợi ý "Tìm theo tên báo cáo, bộ dữ liệu" và biểu tượng kính lúp bên phải. '
  'Chưa áp lọc gì.')
r(BC, 'tim kiem & loc bao cao', 'tim theo ten bao cao', 'nhap ky tu dac biet',
  '1. Nhập chuỗi có ký tự đặc biệt và thẻ HTML/script (vd: <script>alert(1)</script>&%$) vào ô '
  '"Tìm theo tên báo cáo, bộ dữ liệu".\n2. Chờ 1,5 giây hoặc nhấn Enter.',
  '1. Thực hiện thành công\n2. Các ký tự đặc biệt, thẻ html không bị mã hóa khi view lên và khi '
  'lưu vào database')
r(BC, 'tim kiem & loc bao cao', 'tim theo ten bao cao', 'nhan so',
  '1. Nhập một dãy số (vd 2026) vào ô tìm rồi nhấn Enter.',
  'Ô nhận số bình thường. Danh sách còn các báo cáo có tên hoặc tên bộ dữ liệu chứa dãy số đó.')
r(BC, 'tim kiem & loc bao cao', 'tim theo ten bao cao', 'copy noi dung du lieu, dan vao',
  '1. Copy tên đầy đủ của 1 báo cáo đang có.\n2. Dán vào ô tìm rồi nhấn Enter.',
  '1. Thực hiện thành công')
r(BC, 'tim kiem & loc bao cao', 'tim theo ten bao cao', 'tim bang tieng viet co dau',
  '1. Nhập từ khoá tiếng Việt CÓ dấu khớp tên một báo cáo đang có.\n2. Nhấn Enter.',
  'Danh sách còn báo cáo khớp từ khoá — việc so khớp do MÁY CHỦ làm qua tham số tìm '
  'kiếm của lệnh lấy danh sách báo cáo.',
  V + 'Chưa xác nhận được máy chủ có bỏ dấu khi so khớp hay không — cần dev/BA xác nhận mong '
  'đợi cho từ khoá có dấu / không dấu.')
r(BC, 'tim kiem & loc bao cao', 'tim theo ten bao cao', 'khong dau',
  '1. Nhập chính từ khoá trên nhưng BỎ hết dấu.\n2. Nhấn Enter.',
  'Ghi lại đúng kết quả thực tế của máy chủ.',
  V + 'Việc bỏ dấu khi tìm là quy tắc của MÁY CHỦ, chưa có căn cứ trong bundle FE — cần dev/BA '
  'chốt mong đợi trước khi chấm Pass/Fail.')
r(BC, 'tim kiem & loc bao cao', 'tim theo ten bao cao', 'cat khoang trang hai dau',
  '1. Nhập "   báo cáo   " (có khoảng trắng ở hai đầu) vào ô tìm.\n2. Nhấn Enter.',
  'Hệ thống cắt khoảng trắng hai đầu trước khi gửi lên máy chủ. Kết quả giống như nhập không có '
  'khoảng trắng.')

# ══════════════════ 4. THẺ BỘ DỮ LIỆU — danh sách · lọc · tìm ══════════════════
r(BD, 'danh sach bo du lieu', 'lam moi du lieu', 'hien thi nut',
  '1. Bấm thẻ "Bộ dữ liệu".\n'
  '2. Quan sát nút làm mới ở cuối thanh lọc, bên phải nút "Xuất Excel".',
  'Nút hình TRÒN mang biểu tượng mũi tên xoay, chú thích "Làm mới dữ liệu". Ngay dưới thanh '
  'lọc, căn phải, có dòng "Cập nhật: " kèm thời điểm dạng d/m/yyyy hh:mm.')
r(BD, 'danh sach bo du lieu', 'lam moi du lieu', 'khong ap dung bo loc',
  '1. Bấm thẻ "Bộ dữ liệu", chưa lọc và chưa tìm gì.\n2. Bấm nút "Làm mới dữ liệu".',
  'Danh sách tải lại từ máy chủ và dòng "Cập nhật: " đổi thời điểm, nhưng KHÔNG hiện thông báo '
  'nổi nào — khác thẻ Báo cáo vốn hiện "Đã làm mới" (BA BR-BCD-21-1). Cùng lúc hệ thống gọi '
  'thêm lệnh làm mới cache lược đồ Trino chạy nền, không chặn giao diện.')
r(BD, 'danh sach bo du lieu', 'lam moi du lieu', 'dang co bo loc',
  '1. Chọn "-- Chọn trạng thái --" = "Đang hoạt động" và "-- Chọn vùng --" = GOLD, nhập từ khoá.\n'
  '2. Bấm nút "Làm mới dữ liệu".',
  'Cả 2 bộ lọc và từ khoá giữ nguyên, danh sách chỉ tải lại theo đúng điều kiện đó. Không có '
  'thông báo nổi nào.')
r(BD, 'danh sach bo du lieu', 'lam moi du lieu', 'trang phan trang khac',
  '1. Chuyển sang trang 2 (hoặc 3) của thẻ "Bộ dữ liệu".\n2. Bấm nút "Làm mới dữ liệu".',
  'Vẫn ở đúng trang đang xem, không nhảy về trang 1. Không có thông báo nổi nào.')
r(BD, 'danh sach bo du lieu', 'lam moi du lieu', 'hieu ung loading',
  '1. Bấm nút "Làm mới dữ liệu" và quan sát trong lúc chờ máy chủ trả về.',
  'Trong lúc tải, vùng bảng hiện trạng thái đang tải thay cho các dòng dữ liệu. Xong thì hiện '
  'lại danh sách, không có thông báo nổi.',
  R + 'Lỗi của lệnh làm mới cache lược đồ Trino bị nuốt âm thầm (BA BR-BCD-21-2) ⇒ người dùng '
  'không biết cache có được làm mới hay không. Cần QA/BA quyết có cần báo lỗi hay không.')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'gia tri mac dinh',
  '1. Bấm thẻ "Bộ dữ liệu", chưa lọc và chưa tìm gì.',
  'Bảng hiện các bộ dữ liệu do máy chủ trả về theo trang đầu, gồm cả bộ đang hoạt động và bộ '
  'đã tắt (không lọc sẵn); "Tổng số bản ghi:" bằng tổng số bộ dữ liệu đang có. Gọi máy chủ hỏng '
  'thì hiện "Không thể tải danh sách bộ dữ liệu" kèm nút "Thử lại", danh sách cũ trên màn không '
  'bị xoá trắng.')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'tieu de cot',
  '1. Đọc hàng tiêu đề của bảng danh sách bộ dữ liệu.',
  'Đúng 6 cột theo thứ tự: ' + COT_BDL + '. Giữa cột "STT" và cột "Bảng" có thêm một cột hẹp '
  'không nhãn chứa ô tích chọn dòng.')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'khong co du lieu',
  '1. Chuẩn bị hệ thống chưa khai báo bộ dữ liệu nào.\n2. Bấm thẻ "Bộ dữ liệu".',
  'Hiện khối trống kèm nút "Thêm bộ dữ liệu" ngay trong khối đó (bấm vào mở đúng popup "Thêm bộ '
  'dữ liệu" như nút ở đầu màn). Thanh phân trang KHÔNG hiện khi tổng số bản ghi = 0.')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'so luong ban ghi tren',
  '1. Đếm số dòng đang hiện trên bảng.\n'
  '2. Đối chiếu với ô "Số bản ghi/trang:" và nhãn "Tổng số bản ghi:".',
  'Số dòng đúng bằng số bản ghi mỗi trang. "Tổng số bản ghi:" bằng tổng số bộ dữ liệu khớp bộ '
  'lọc đang áp.')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'hien thi dung cot',
  '1. Chọn 1 bộ dữ liệu và đối chiếu từng ô trên dòng với dữ liệu của nó.',
  'Cột "Bảng" là chuỗi {catalog}.{schema}.{bảng} viết liền bằng phông đơn cách. Cột "Vùng dữ '
  'liệu" là thẻ chữ GOLD hoặc DIAMOND. Cột "Ngày tạo" dạng d/m/yyyy hh:mm. Cột "Trạng thái" là '
  'thẻ chữ "Đang hoạt động" / "Đã vô hiệu hóa" / "Đang cấp phát".',
  R + 'Nhãn trạng thái KHÔNG nhất quán trong cùng giao diện: thẻ chữ ở cột "Trạng thái" ghi '
  '"Đã vô hiệu hóa" còn ô lọc và mục trong menu hành động ghi "Đã tắt"/"Tắt" (BA BR-BCD-23-4 '
  'đã ghi nhận). Cần QA/BA chốt một bản chữ.')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'do rong cac cot',
  '1. Quan sát bề rộng 6 cột ở màn hình rộng và sau khi thu hẹp cửa sổ.',
  'Độ rộng các cột phù hợp với dữ liệu')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'hien thi du lieu dai',
  '1. Chuẩn bị 1 bộ dữ liệu có chuỗi {catalog}.{schema}.{bảng} rất dài.\n2. Xem dòng đó.',
  'Chuỗi dài xuống dòng hoặc bị cắt gọn trong ô của nó, không tràn sang cột khác và không phá '
  'bố cục hàng.')
r(BD, 'danh sach bo du lieu', 'danh sach bo du lieu', 'dieu huong dung trang',
  '1. Bấm vào một dòng bộ dữ liệu (vùng chữ, không bấm ô tích và không bấm cột Hành động).',
  'Điều hướng đúng trang/chức năng tương ứng')
r(BD, 'danh sach bo du lieu', 'icon', 'phu hop voi chuc nang',
  '1. Xem cột "Hành động" của 1 dòng "Đang hoạt động" và 1 dòng "Đã vô hiệu hóa".\n'
  '2. Bấm nút ⋮ của từng dòng.',
  'Cột "Hành động" chỉ có một nút ⋮. Bấm vào mở danh sách 2 mục: mục đầu là "Tắt" khi dòng đang '
  'hoạt động và "Kích hoạt" khi dòng đã tắt, mục thứ hai luôn là "Xóa" (chữ đỏ). Nút ⋮ bị khoá '
  'trong lúc đang gọi máy chủ.')
r(BD, 'danh sach bo du lieu', 'icon', 'mau icon xoa',
  '1. Bấm nút ⋮ của 1 dòng, xem mục "Xóa".',
  'Mục "Xóa" mang màu đỏ cảnh báo, khác màu mục "Kích hoạt"/"Tắt" ở trên.')
r(BD, 'danh sach bo du lieu', 'icon', 'noi dung va chinh ta cua chu thich',
  '1. Bấm nút ⋮ của 1 dòng đang hoạt động rồi của 1 dòng đã tắt, đọc nhãn từng mục.',
  'Nhãn đúng nguyên văn và đúng chính tả: "Tắt" / "Kích hoạt" và "Xóa".')
r(BD, 'danh sach bo du lieu', 'icon', None, None, None,
  V + 'Cột "Hành động" của thẻ này KHÔNG dùng biểu tượng có chú thích mà dùng một nút ⋮ mở danh '
  'sách chữ ⇒ các case về màu/chú thích/con trỏ của từng biểu tượng không có đối tượng tương '
  'ứng. Cần QA/BA chốt: giữ để kiểm nút ⋮, hay bỏ khỏi bộ case.')
r(BD, 'danh sach bo du lieu', 'checkbox ban ghi', 'chuyen sang trang khac',
  '1. Tích chọn vài dòng ở trang 1.\n'
  '2. Bấm sang trang 2 rồi quay lại trang 1.\n'
  '3. Đổi ô "Số bản ghi/trang:" sang mức khác.',
  'Checkbox được tích chọn')
r(BD, 'danh sach bo du lieu', 'chuc nang danh sach', 'khop db',
  '1. Bấm thẻ "Bộ dữ liệu", ghi lại các dòng đang hiển thị.\n2. Đối chiếu với dữ liệu máy chủ '
  'trả về cho dịch vụ danh sách bộ dữ liệu (search rỗng, statuses rỗng, zones rỗng, đúng trang '
  'và số bản ghi/trang đang xem).',
  'Dữ liệu xuất ra khớp với DB', T_DB)

# ── 2 ô lọc + ô tìm của thẻ Bộ dữ liệu ──
r(BD, 'tim kiem & loc bo du lieu', 'selectbox trang thai', 'kiem tra gia tri mac dinh',
  '1. Bấm thẻ "Bộ dữ liệu", xem ô lọc thứ nhất trên thanh lọc.',
  'Ô hiện chữ mờ "-- Chọn trạng thái --". Chưa lọc trạng thái nào.')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox trang thai', 'cac gia tri co trong',
  '1. Bấm mở ô "-- Chọn trạng thái --" của thẻ Bộ dữ liệu.',
  'Hiển thị các giá trị: "Bản nháp" · "Đã xuất bản" · "Đã xóa"',
  R + 'Danh sách lọc KHÔNG có giá trị "Đang cấp phát" dù thẻ chữ ở cột Trạng thái có hiện nhãn '
  'đó ⇒ không lọc riêng được các bộ dữ liệu đang cấp phát. Cần QA/BA xác nhận đây là chủ ý.')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox trang thai', 'sap xep cac gia tri',
  '1. Bấm mở ô lọc trạng thái và đọc thứ tự các dòng.',
  'Thứ tự: "Tất cả trạng thái" trước, rồi "Đang hoạt động" → "Đã tắt".')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox trang thai', 'chon cac gia tri khac nhau',
  '1. Chọn "Đang hoạt động" → xem danh sách.\n2. Chọn lại ô lọc, chọn "Đã tắt".\n'
  '3. Chọn "Tất cả trạng thái".',
  'Mỗi lần chọn: danh sách áp lọc NGAY và ô chọn tự đóng, trang về 1, con số trên thẻ '
  '"Bộ dữ liệu" đổi theo; lựa chọn ô tích bị xoá về rỗng. Ô chỉ giữ MỘT giá trị; khi đã chọn '
  'thì trong ô hiện dấu X để xoá lựa chọn.')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox trang thai', 'tim kiem khop 100%',
  '1. Bấm mở ô lọc trạng thái.\n2. Gõ đúng nguyên văn "Đang hoạt động" vào ô "Tìm kiếm...".',
  'Danh sách chỉ còn đúng dòng "Đang hoạt động".')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox trang thai', 'tim kiem khop 1 phan',
  '1. Bấm mở ô lọc trạng thái.\n2. Gõ "hoạt" vào ô "Tìm kiếm...".',
  'Danh sách còn các dòng chứa chuỗi đó ("Đang hoạt động").')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox trang thai', 'tieng viet co dau, khong dau',
  '1. Bấm mở ô lọc trạng thái.\n2. Gõ "dang hoat dong" (không dấu).',
  'Vẫn tìm ra dòng "Đang hoạt động" — ô tìm trong danh sách bỏ dấu và đổi đ→d trước khi so khớp.')

r(BD, 'tim kiem & loc bo du lieu', 'selectbox vung', 'kiem tra gia tri mac dinh',
  '1. Bấm thẻ "Bộ dữ liệu", xem ô lọc thứ hai trên thanh lọc.',
  'Ô hiện chữ mờ "-- Chọn vùng --". Chưa lọc vùng nào.')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox vung', 'cac gia tri co trong',
  '1. Bấm mở ô "-- Chọn vùng --".',
  'Hiển thị các giá trị: "GOLD" · "DIAMOND"')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox vung', 'chon cac gia tri khac nhau',
  '1. Chọn "GOLD" → xem danh sách.\n2. Chọn lại ô lọc, chọn "DIAMOND".\n'
  '3. Chọn "Tất cả vùng".',
  'Danh sách áp lọc ngay sau mỗi lần chọn và về trang 1. Các ô lọc "Trạng thái" và "Vùng" kết '
  'hợp với nhau theo phép VÀ.')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox vung', 'tim kiem khop 100%',
  '1. Bấm mở ô lọc vùng.\n2. Gõ "DIAMOND" vào ô "Tìm kiếm...".',
  'Danh sách chỉ còn đúng dòng "DIAMOND".')
r(BD, 'tim kiem & loc bo du lieu', 'selectbox vung', 'tu khoa khong ton tai',
  '1. Bấm mở ô lọc vùng.\n2. Gõ "SILVER".',
  'Danh sách hiện dòng "Không tìm thấy" — vùng Silver không thuộc phạm vi module này.')

r(BD, 'tim kiem & loc bo du lieu', 'tim theo ten bang du lieu', 'gia tri mac dinh',
  '1. Bấm thẻ "Bộ dữ liệu", xem ô tìm trên thanh lọc.',
  'Ô trống, hiện chữ gợi ý "Tìm theo tên bảng dữ liệu". Chưa áp lọc gì.')
r(BD, 'tim kiem & loc bo du lieu', 'tim theo ten bang du lieu', 'copy noi dung du lieu, dan vao',
  '1. Copy chuỗi {catalog}.{schema}.{bảng} của 1 bộ dữ liệu đang có.\n'
  '2. Dán vào ô tìm rồi nhấn Enter.',
  '1. Thực hiện thành công')
r(BD, 'tim kiem & loc bo du lieu', 'tim theo ten bang du lieu', 'nhan so',
  '1. Nhập một dãy số có trong tên bảng (vd 2026) vào ô tìm rồi nhấn Enter.',
  'Ô nhận số bình thường. Danh sách còn các bộ dữ liệu có tên bảng chứa dãy số đó.')

# ══════════════════ 5. LUỒNG TÌM KIẾM — dùng chung 2 thẻ (ngưỡng · debounce · Enter) ══════════════════
r(None, 'tim kiem & loc', 'chuc nang tim kiem chung', 'gia tri mac dinh',
  '1. Mở màn, KHÔNG chọn bộ lọc nào và KHÔNG nhập từ khoá.\n'
  '2. Đọc danh sách và nhãn "Tổng số bản ghi:".',
  'Hệ thống gọi máy chủ với từ khoá rỗng và bộ lọc rỗng, trả về toàn bộ bản ghi (phân trang '
  'theo số bản ghi/trang đang đặt); "Tổng số bản ghi:" bằng tổng của cả danh sách.')
r(None, 'tim kiem & loc', 'chuc nang tim kiem chung', 'khong ra ket qua',
  '1. Nhập một từ khoá chắc chắn không khớp bản ghi nào (≥ 3 ký tự) rồi nhấn Enter.\n'
  '2. Lần lượt thử từng bộ lọc với giá trị không có bản ghi nào.',
  'Bảng hiện khối trống theo bộ lọc: thẻ Báo cáo hiện "Không có báo cáo khớp bộ lọc" kèm dòng '
  '"Thử điều chỉnh bộ lọc hoặc xóa bộ lọc để xem tất cả báo cáo."; "Tổng số bản ghi:" về 0 và '
  'thanh phân trang không hiện.')
r(None, 'tim kiem & loc', 'chuc nang tim kiem chung', 'ket hop tat ca cac dieu kien',
  '1. Chọn đồng thời MỌI bộ lọc của màn và nhập từ khoá khớp một bản ghi đang có.\n'
  '2. Nhấn Enter và đối chiếu với dữ liệu máy chủ theo cùng điều kiện.',
  'Danh sách chỉ còn bản ghi thoả ĐỒNG THỜI mọi điều kiện; các bộ lọc kết hợp với nhau theo '
  'phép VÀ; kết quả khớp dữ liệu máy chủ, không thừa không thiếu.', T_DB)
r(None, 'tim kiem & loc', 'chuc nang tim kiem chung', 'lan luot 2 dieu kien khac nhau',
  '1. Tìm với điều kiện A, ghi lại số bản ghi.\n'
  '2. Xoá hết rồi tìm với điều kiện B cũng cho ra cùng số bản ghi.\n'
  '3. So sánh danh sách của hai lần.',
  'Hai lần trả về cùng SỐ bản ghi nhưng phải là đúng tập bản ghi của từng điều kiện — không '
  'được trả lại kết quả của lần tìm trước (không dính cache sai).')
# ⛔ ĐÃ GỠ 2026-09-12 — luật `tieu_de='tim kiem khi nhap:'`. Nó khớp CẢ BA case
# (`= Các ký tự Space` · `là các ký tự đặc biệt` · `có ký tự Space ở đầu và cuối`) rồi dán CÙNG
# một cột C/D nói về chờ 1500 ms lên cả ba ⇒ mất sạch mục đích của từng case — chính lỗi người
# đặt việc báo bằng ảnh. Ba case đó nay có nội dung riêng, đúng mục đích, và phép ㉓ canh giữ.
# Dữ kiện debounce 1500 ms/3 ký tự đã nằm ở các case tìm kiếm khác; đừng khai lại luật trùm.
r(None, 'tim kiem & loc', 'chuc nang tim kiem don le', 'tim kiem tuong doi',
  '1. Nhập một đoạn GIỮA tên của bản ghi đang có (≥ 3 ký tự) rồi nhấn Enter.',
  'Danh sách còn mọi bản ghi CHỨA đoạn đó — máy chủ khớp kiểu chứa chuỗi con (BA GBR-01). '
  'Nhấn Enter áp ngay, bỏ qua khoảng chờ 1500 ms.')
r(None, 'tim kiem & loc', 'chuc nang tim kiem don le', 'chu tieng viet co dau',
  '1. Nhập từ khoá tiếng Việt CÓ dấu (≥ 3 ký tự) rồi nhấn Enter.',
  'Danh sách còn bản ghi khớp từ khoá; việc so khớp do MÁY CHỦ làm.',
  V + 'Chưa xác nhận máy chủ có bỏ dấu khi so khớp — cần dev/BA chốt mong đợi.')
r(None, 'tim kiem & loc', 'chuc nang tim kiem don le', 'khong gioi han',
  '1. Dán vào ô tìm một chuỗi dài hơn 250 ký tự.\n2. Nhấn Enter.',
  'Ô CẮT còn đúng 250 ký tự đầu (cả khi dán và khi nhấn Enter) và KHÔNG hiện thông báo nào; '
  'hệ thống gửi lên máy chủ chuỗi 250 ký tự đó.')
# Tách đôi 2026-09-12: khoá trần `chon 1 gia tri cua` khớp CẢ `… của Trạng thái` lẫn
# `… của Vùng` ⇒ lưới chắn dừng chuỗi. Nội dung như nhau nhưng phải khai riêng từng ô lọc.
for _o in ('trang thai', 'vung'):
    r(None, 'tim kiem & loc', 'chuc nang tim kiem don le', 'chon 1 gia tri cua ' + _o,
      '1. Bấm mở ô lọc, chọn đúng 1 giá trị.\n2. Đối chiếu danh sách với dữ liệu máy chủ.',
      'Danh sách chỉ còn bản ghi mang đúng giá trị đã chọn. Ô lọc tự đóng ngay sau khi chọn và '
      'trang về 1. Kết quả khớp dữ liệu máy chủ.', T_DB)
r(None, 'tim kiem & loc', 'chuc nang tim kiem ket hop', 'ket hop 2 tieu chi',
  None, None,
  V + 'Hai ô lọc trạng thái/vùng của màn là ô CHỌN MỘT giá trị nên tổ hợp "2 tiêu chí" ở đây là '
  '(1 ô lọc + ô tìm) hoặc (2 ô lọc khác nhau). BA GBR-09 nói bộ lọc nhiều lựa chọn chỉ áp giá '
  'trị đầu tiên — quy tắc đó KHÔNG còn đối tượng trên giao diện hiện tại. Cần QA/BA chốt lại.')

# ══════════════════ 6. ATTT — dùng chung mọi CN ══════════════════
r(None, None, None, 'truy cap man khi chua dang nhap',
  '1. Đăng xuất (hoặc mở cửa sổ ẩn danh).\n2. Gõ thẳng địa chỉ trang Báo cáo động vào thanh địa '
  'chỉ trình duyệt.',
  'Hệ thống đưa về màn đăng nhập kèm thông báo "Bạn cần đăng nhập để truy cập trang này. Vui '
  'lòng đăng nhập bằng tài khoản của bạn để tiếp tục."; không hiển thị nội dung nào của màn '
  'Báo cáo động.')
r(None, None, None, 'yeu cau quyen xem man',
  '1. Đăng nhập một tài khoản CHƯA được cấp quyền nào với module Báo cáo động.\n'
  '2. Mở màn bằng menu Báo cáo > Báo cáo động, rồi thử gõ thẳng địa chỉ.',
  'Ghi lại hành vi THỰC TẾ: hiện nay giao diện KHÔNG chặn — mọi tài khoản đã đăng nhập đều vào '
  'được màn và bấm được toàn bộ chức năng.', T_QUYEN)
r(None, None, None, 'tai khoan khac vai tro',
  '1. Lần lượt đăng nhập các vai trò khác (Lãnh đạo Bộ · Đơn vị nguồn · Sở GD&ĐT · Trường học).\n'
  '2. Mở màn Báo cáo động và thử từng nút.',
  'Ghi lại hành vi THỰC TẾ theo từng vai trò. Hiện nay giao diện không phân biệt vai trò nào.',
  T_QUYEN)
r(None, None, None, 'duoc cap dung quyen van vao duoc',
  '1. Đăng nhập tài khoản Chuyên viên (admin_csdl@moet.gov.vn).\n'
  '2. Mở màn Báo cáo động.',
  'Vào được màn, danh sách tải bình thường, thao tác được đầy đủ.')
r(None, None, None, 'thao tac khi het phien',
  '1. Đăng nhập rồi để phiên hết hạn (hoặc xoá phiên đăng nhập lưu trong trình duyệt).\n2. Thực '
  'hiện một thao tác trên màn (bấm làm mới, đổi trang, bấm một nút hành động).',
  'Hệ thống báo "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." và đưa về màn đăng nhập; '
  'thao tác KHÔNG được thực hiện.')
r(None, None, None, 'chi thay du lieu thuoc pham vi',
  '1. Đăng nhập tài khoản Chuyên viên được phân công một phạm vi tỉnh/đơn vị.\n'
  '2. Mở màn và đọc toàn bộ danh sách.',
  'Ghi lại hành vi THỰC TẾ về phạm vi dữ liệu máy chủ trả về.',
  R + 'Module KHÔNG có bất kỳ điểm lọc phạm vi nào ở tầng giao diện; nếu máy chủ cũng không lọc '
  'thì mọi tài khoản đăng nhập đều thấy TOÀN BỘ báo cáo và bộ dữ liệu của hệ thống. Cần QA/BA + '
  'dev xác nhận phạm vi dữ liệu mong đợi cho vai trò Chuyên viên.')
r(None, None, None, 'can thiep tham so',
  '1. Ghi lại lệnh gọi máy chủ của màn (listReports / listDatasets) bằng công cụ nhà phát triển.\n'
  '2. Gọi lại lệnh đó bằng tài khoản hiện tại nhưng sửa tham số sang phạm vi/bản ghi KHÔNG '
  'thuộc quyền (chỉ dùng phương thức GET, KHÔNG gọi lệnh ghi).',
  'Máy chủ phải từ chối hoặc trả về rỗng. Ghi lại nguyên văn mã lỗi và thông điệp máy chủ trả '
  'về.', T_QUYEN)
r(None, None, None, 'kiem tra xss phan chieu',
  '1. Nhập <script>alert(document.cookie)</script> vào ô tìm kiếm rồi nhấn Enter.\n'
  '2. Xem lại chuỗi hiển thị trên màn và trong khối trống "không có kết quả".',
  'Chuỗi được hiển thị lại dưới dạng văn bản thuần; KHÔNG có hộp thoại nào bật lên, không có mã '
  'nào được thực thi.')
r(None, None, None, 'sql injection qua o tim kiem',
  "1. Nhập ' OR 1=1 -- vào ô tìm kiếm rồi nhấn Enter.\n"
  '2. Đối chiếu số bản ghi trả về với lần tìm bằng từ khoá thường.',
  'Chuỗi được coi là từ khoá tìm kiếm bình thường: danh sách trả về rỗng (không có bản ghi nào '
  'tên như vậy), KHÔNG trả về toàn bộ dữ liệu và không hiện lỗi máy chủ.')

# ══════════════════ 7. XUẤT EXCEL — 2 CN, chỉ còn khối Giao diện chung ══════════════════
r(BC, 'xuat excel danh sach bao cao', None, 'day du thong tin trong file xuat ra',
  '1. Mở thẻ "Báo cáo", chọn "-- Chọn trạng thái --" = "Đã xuất bản" và nhập từ khoá.\n'
  '2. Bấm nút "Xuất Excel" và mở tệp vừa tải về.',
  'Trong lúc xuất, nhãn nút đổi thành "Đang xuất..." và nút bị khoá; xong thì tệp .xlsx được '
  'tải về máy và hiện thông báo nổi "Xuất Excel thành công". Nội dung tệp đúng theo bộ lọc và '
  'từ khoá ĐANG áp trên màn, không xuất toàn bộ (BA BR-BCD-05-1); cột trong tệp khớp các cột '
  'trên bảng: ' + COT_BC.replace(' · Hành động', '') + '.',
  V + 'Chưa xác nhận được tên tệp, tiêu đề sheet, định dạng ngày và việc ghim hàng tiêu đề '
  'trong tệp xuất ra (bundle FE chỉ gọi lệnh xuất, tệp do máy chủ dựng). Cần QA/BA chốt khuôn '
  'tệp xuất.')
r(BC, 'xuat excel danh sach bao cao', None, 'file excel xuat ra',
  '1. Quan sát nút "Xuất Excel" ở trạng thái thường, lúc đang xuất, và khi danh sách rỗng.',
  'Nút mang biểu tượng tải xuống kèm chữ "Xuất Excel", cùng chiều cao với các ô lọc bên cạnh; '
  'khi đang xuất thì đổi chữ thành "Đang xuất..." và bị khoá; khi "Tổng số bản ghi:" = 0 thì '
  'nút bị KHOÁ (không bấm được).')
r(BD, 'xuat excel danh sach bo du lieu', None, 'day du thong tin trong file xuat ra',
  '1. Bấm thẻ "Bộ dữ liệu", chọn "-- Chọn vùng --" = GOLD và nhập từ khoá.\n'
  '2. Bấm nút "Xuất Excel" và mở tệp vừa tải về.',
  'Trong lúc xuất, nhãn nút đổi thành "Đang xuất..." và nút bị khoá; xong thì tệp .xlsx được '
  'tải về và hiện thông báo nổi "Xuất Excel thành công". Nội dung tệp đúng theo cả 3 điều kiện '
  'đang áp (từ khoá · trạng thái · vùng dữ liệu); cột trong tệp khớp các cột trên bảng: '
  + COT_BDL.replace(' · Hành động', '') + '.',
  V + 'Chưa xác nhận được tên tệp, tiêu đề sheet và khuôn định dạng của tệp xuất ra. Cần QA/BA '
  'chốt.')
r(BD, 'xuat excel danh sach bo du lieu', None, 'file excel xuat ra',
  '1. Quan sát nút "Xuất Excel" của thẻ Bộ dữ liệu ở trạng thái thường, lúc đang xuất, và khi '
  'danh sách rỗng.',
  'Nút mang biểu tượng tải xuống kèm chữ "Xuất Excel"; khi đang xuất đổi chữ thành '
  '"Đang xuất..." và bị khoá; khi "Tổng số bản ghi:" = 0 thì nút bị KHOÁ.')

# ══════════════════ 8. VÒNG ĐỜI BÁO CÁO — 6 CN ══════════════════
r(BC, 'xuat ban bao cao', None, 'hien thi day du cac thong tin',
  None, None,
  M + 'Dòng "Bản nháp" có biểu tượng "Xuất bản" (mũi tên lên) là biểu tượng ĐẦU trong cột '
  '"Hành động"; dòng "Đã xuất bản" và dòng "Đã xóa" KHÔNG có biểu tượng này '
  '(BA BR-BCD-07-1).')
r(BC, 'xuat ban bao cao', 'chuc nang chuyen trang thai', None, None, None,
  V + 'Xuất bản KHÔNG có hộp xác nhận: bấm biểu tượng là gọi máy chủ ngay, xong hiện thông báo '
  'nổi Đã xuất bản "{tên báo cáo}"; lỗi thì hiện "Xuất bản thất bại" kèm thông điệp máy chủ và '
  'giữ nguyên trạng thái Bản nháp. Sau khi xuất bản, biểu tượng "Xuất bản" và "Chỉnh sửa" ẩn đi, '
  'biểu tượng "Tải về" xuất hiện khi đã có mã dashboard Superset.')
r(BC, 'tai ve bao cao', None, 'hien thi day du cac thong tin',
  None, None,
  M + 'Biểu tượng "Tải về" (mũi tên xuống) CHỈ hiện khi báo cáo có mã dashboard Superset lớn '
  'hơn 0 và trạng thái KHÁC "Đã xóa"; báo cáo Bản nháp chưa từng xuất bản thì KHÔNG có biểu '
  'tượng này (BA BR-BCD-08-1).')
r(BC, 'tai ve bao cao', 'chuc nang', None, None, None,
  V + 'Bấm biểu tượng "Tải về" gọi lệnh tải tệp kết xuất của dashboard Superset tương ứng; '
  'trong lúc chờ, TOÀN BỘ nhóm biểu tượng của dòng bị khoá, KHÔNG có vòng xoay hay chữ riêng. '
  'Lỗi thì hiện thông báo nổi "Tải về báo cáo thất bại". Khuôn tệp tải về (tên tệp, định dạng, '
  'nội dung) do máy chủ/Superset dựng — cần QA/BA chốt mong đợi.')
r(BC, 'xoa bao cao', None, 'hien thi day du cac thong tin',
  None, None,
  M + 'Bấm biểu tượng "Xóa" mở hộp thoại xác nhận có tiêu đề "Xác nhận xóa báo cáo?", nội '
  'dung "Bạn có chắc muốn chuyển báo cáo \'{tên báo cáo}\' vào mục Đã xóa không?" và 2 nút '
  '"Hủy" · "Xác nhận". Biểu tượng "Xóa" KHÔNG hiện trên dòng đã ở trạng thái "Đã xóa".')
r(BC, 'xoa bao cao', 'hop xac nhan xoa bao cao', None, None, None,
  M + 'Xoá đơn lẻ ở đây là XOÁ MỀM: bấm "Xác nhận" thì báo cáo chuyển trạng thái "Đã xóa" '
  '(thẻ chữ nền đỏ), vẫn còn trong danh sách và khôi phục lại được; hiện thông báo nổi. Lỗi thì '
  'hiện "Xóa báo cáo thất bại", đóng hộp thoại và giữ nguyên trạng thái cũ (BA BR-BCD-09-1/2).')
r(BC, 'khoi phuc bao cao', None, 'hien thi day du cac thong tin',
  None, None,
  M + 'Dòng "Đã xóa" có đúng 2 biểu tượng: "Khôi phục" (mũi tên vòng lại) và "Xóa vĩnh viễn" '
  '(màu đỏ); KHÔNG có "Xuất bản" · "Tải về" · "Chỉnh sửa" · "Xóa".')
r(BC, 'khoi phuc bao cao', 'chuc nang chuyen trang thai', None, None, None,
  R + 'Khôi phục KHÔNG có hộp xác nhận và LUÔN đưa về "Bản nháp" dù trước khi xoá đang '
  '"Đã xuất bản" (BA BR-BCD-10-1). Thành công hiện Đã khôi phục "{tên}" về Bản nháp; nếu trùng '
  'tên báo cáo đang tồn tại thì MÁY CHỦ TỰ ĐỔI TÊN và chỉ báo lại bằng thông báo nổi dạng cảnh '
  'báo "Đã khôi phục và tự động đổi tên báo cáo" kèm mô tả Tên "{tên cũ}" đã tồn tại. Báo cáo '
  'được đổi thành "{tên mới}". — người dùng dễ bỏ qua. Lỗi thì hiện "Khôi phục báo cáo thất bại".')
r(BC, 'xoa vinh vien bao cao', None, 'hien thi day du cac thong tin',
  None, None,
  M + 'Bấm biểu tượng "Xóa vĩnh viễn" (màu đỏ) mở hộp thoại xác nhận RIÊNG có tiêu đề '
  '"Xóa vĩnh viễn báo cáo?", nội dung "Báo cáo \'{tên báo cáo}\' sẽ bị xóa khỏi hệ thống và '
  'không thể khôi phục." và 2 nút "Hủy" · "Xóa vĩnh viễn"; hộp thoại này KHÔNG dùng chung '
  'với hộp xác nhận xoá mềm (BA BR-BCD-11-2).')
r(BC, 'xoa vinh vien bao cao', 'hop xac nhan xoa vinh vien bao cao', None, None, None,
  R + 'Thao tác KHÔNG THỂ HOÀN TÁC: bấm "Xóa vĩnh viễn" là báo cáo biến hẳn khỏi hệ thống, hiện '
  'thông báo nổi Đã xóa vĩnh viễn "{tên}"; lỗi thì hiện "Xóa vĩnh viễn báo cáo thất bại". Chỉ '
  'áp dụng được cho báo cáo đang ở trạng thái "Đã xóa" (BA BR-BCD-11-1).')
r(BC, 'thao tac hang loat tren bao cao', None, 'hien thi day du cac thong tin',
  None, None,
  M + 'Thanh thao tác hàng loạt nổi phía dưới bảng và cụm phân trang; các nút TÍNH THEO '
  'TRẠNG THÁI THỰC của các dòng đã tích, độc lập với bộ lọc đang áp: "Xuất bản {N} mục" '
  '(chỉ đếm dòng Bản nháp) · "Xóa {N} mục" (đếm mọi dòng KHÁC Đã xóa) · "Khôi phục {N} '
  'mục" và "Xóa vĩnh viễn {N} mục" (chỉ đếm dòng Đã xóa). Một dòng Bản nháp được tính vào '
  'CẢ nút "Xuất bản" lẫn nút "Xóa" (BA BR-BCD-06-1). Nhiều nhóm nút hiện ĐỒNG THỜI khi '
  'lựa chọn trải nhiều trạng thái.')
r(BC, 'thao tac hang loat tren bao cao', 'chuc nang chuyen trang thai hang loat', None,
  None, None,
  R + 'Nút "Xóa {N} mục" (xoá mềm hàng loạt) THỰC THI NGAY, KHÔNG có hộp xác nhận — khác hẳn '
  'xoá đơn lẻ (BA BR-BCD-06-2 / AF-03). Chỉ "Xóa vĩnh viễn {N} mục" mới có hộp xác nhận riêng '
  '"Xóa vĩnh viễn các báo cáo đã chọn?" kèm nội dung "{N} báo cáo sẽ bị xóa khỏi hệ thống và '
  'không thể khôi phục.". Mọi thao tác hàng loạt gọi máy chủ LẶP từng bản ghi nên thành công '
  'một phần là chuyện thường: thông báo chỉ nói số lượng ("Xuất bản thất bại {d}/{N} báo cáo" · '
  '"Khôi phục thất bại {d}/{N} báo cáo") mà KHÔNG nói bản ghi nào hỏng. Xong thì lựa chọn ô '
  'tích được xoá về rỗng và danh sách tải lại (BR-BCD-06-3).')

# ══════════════════ 9. WIZARD TẠO / SỬA BÁO CÁO ══════════════════
r(BC, None, 'textbox ten bao cao', 'bat buoc',
  '1. Bấm "Tạo báo cáo" ở đầu màn để vào Bước 1 "Thông tin báo cáo".\n'
  '2. Để trống ô "Tên báo cáo" (hoặc nhập toàn dấu cách) rồi bấm "Tiếp theo".',
  'Ở lại Bước 1; hiện dòng chữ đỏ nhỏ "Vui lòng nhập tên báo cáo" ngay dưới ô "Tên báo cáo"; '
  'nút "Tiếp theo" KHÔNG bị khoá, chỉ chặn khi bấm.')
r(BC, None, 'textbox ten bao cao', 'da ton tai',
  '1. Vào Bước 1, nhập đúng tên của một báo cáo ĐANG tồn tại.\n2. Bấm "Tiếp theo".',
  'Ở lại Bước 1; hiện dòng chữ đỏ "Tên báo cáo này đã tồn tại — vui lòng chọn tên khác." ngay '
  'dưới ô; không tạo báo cáo nào (BA BR-BCD-12-1).')
r(BC, 'chinh sua bieu do bao cao', 'textbox ten bao cao', 'giu nguyen gia tri cu',
  '1. Mở màn Chỉnh sửa biểu đồ của một báo cáo Bản nháp.\n'
  '2. Ở Bước 1 giữ nguyên "Tên báo cáo", không sửa gì ở ô này.\n3. Bấm "Tiếp theo".',
  'Qua được Bước 2 bình thường: hệ thống KHÔNG báo trùng tên với chính báo cáo đang sửa '
  '(BA BR-BCD-16-4).')
r(BC, None, 'textbox ten bao cao', 'vuot do dai',
  '1. Vào Bước 1, dán vào ô "Tên báo cáo" một chuỗi dài hơn 250 ký tự.',
  'KHÔNG có thông báo lỗi nào, KHÔNG highlight và KHÔNG đổi focus — con trỏ vẫn ở trong '
  'ô: giao diện chặn sẵn bằng thuộc tính giới hạn ký tự nên hệ thống không cho nhập quá '
  '250 ký tự, ô chỉ nhận đúng 250 ký tự đầu.', T_DAI_250)
r(BC, 'tao bao cao', 'textbox ten bao cao', 'gia tri mac dinh',
  '1. Bấm "Tạo báo cáo" để vào Bước 1.',
  'Ô "Tên báo cáo" trống, có dấu * đỏ ở nhãn và chữ gợi ý "Ví dụ: Báo cáo tuyển sinh theo tỉnh".')
r(BC, None, 'textarea mo ta', 'bat buoc',
  '1. Vào Bước 1, nhập "Tên báo cáo" hợp lệ và để TRỐNG ô "Mô tả".\n2. Bấm "Tiếp theo".',
  'Qua được Bước 2: ô "Mô tả" KHÔNG bắt buộc (nhãn không có dấu *), không có thông báo lỗi nào '
  '(BA §3.16.12 Validation Rules).')
r(BC, None, 'textarea mo ta', 'vuot do dai',
  '1. Vào Bước 1, dán vào ô "Mô tả" một chuỗi rất dài (trên 250 và trên 1000 ký tự).',
  'KHÔNG có thông báo lỗi nào, KHÔNG highlight và KHÔNG đổi focus: ô "Mô tả" không đặt giới '
  'hạn ký tự ở giao diện nên hệ thống không cho nhập quá — không chặn ở mức nào, nhận hết '
  'chuỗi vừa dán. Ghi lại phản hồi của máy chủ khi bấm "Tạo báo cáo".',
  V + 'Giới hạn thật của cột mô tả trong CSDL chưa được xác nhận — cần dev/BA chốt để biết có '
  'phải chặn ở giao diện hay không.')
r(BC, 'tao bao cao', 'textarea mo ta', 'gia tri mac dinh',
  '1. Bấm "Tạo báo cáo" để vào Bước 1.',
  'Ô "Mô tả" là khung nhập nhiều dòng, trống, chữ gợi ý "Ví dụ: Báo cáo tuyển sinh theo tỉnh".')
r(BC, None, 'nut chon the bo du lieu', 'gia tri mac dinh',
  '1. Vào Bước 2 "Chọn bộ dữ liệu".',
  'Mặc định mở thẻ "Bộ dữ liệu đã kích hoạt"; có 2 thẻ "Bộ dữ liệu đã kích hoạt" và '
  '"Bộ dữ liệu bị khóa"; dưới thẻ là dòng chú thích "Có thể chọn nhiều bộ dữ liệu — bộ dữ liệu '
  'chọn đầu tiên là bộ dữ liệu chính của báo cáo."')
r(BC, None, 'nut chon the bo du lieu', 'kiem tra cac lua chon',
  '1. Vào Bước 2, đọc hàng thẻ.',
  'Đúng HAI thẻ: "Bộ dữ liệu đã kích hoạt" và "Bộ dữ liệu bị khóa".')
r(BC, None, 'nut chon the bo du lieu', 'chuyen doi giua cac lua chon',
  '1. Vào Bước 2, bấm thẻ "Bộ dữ liệu bị khóa".\n2. Bấm lại thẻ "Bộ dữ liệu đã kích hoạt".',
  'Danh sách và cụm phân trang RIÊNG của Bước 2 đổi theo thẻ; thẻ "bị khóa" hiện các bộ dữ liệu '
  'đã tắt (mờ, KHÔNG tích chọn được) kèm nút "Kích hoạt ngay" trên từng dòng; thẻ rỗng thì hiện '
  '"Chưa có bộ dữ liệu nào được kích hoạt." / "Không có bộ dữ liệu bị khóa."')
r(BC, None, 'checkbox bo du lieu', 'gia tri mac dinh',
  '1. Vào Bước 2 lần đầu.',
  'Chưa tích chọn bộ dữ liệu nào; nếu đang ở chế độ CHỈNH SỬA thì các bộ dữ liệu báo cáo đang '
  'dùng được tích SẴN (BA §3.16.16 bước 3).')
r(BC, None, 'checkbox bo du lieu', None, None, None,
  M + 'Tích chọn được NHIỀU bộ dữ liệu; bộ tích ĐẦU TIÊN là bộ dữ liệu chính của báo cáo '
  '(BA BR-BCD-13-1). Bộ dữ liệu ở thẻ "bị khóa" hiện mờ và KHÔNG tích được — phải bấm '
  '"Kích hoạt ngay" trước (BR-BCD-13-2). Bấm "Tiếp theo" khi chưa tích gì thì ở lại Bước 2 và '
  'hiện dòng chữ đỏ "Vui lòng chọn bộ dữ liệu".')
r(BC, None, 'button kich hoat ngay', None,
  '1. Vào Bước 2, bấm thẻ "Bộ dữ liệu bị khóa".\n'
  '2. Bấm "Kích hoạt ngay" trên một dòng.',
  None)
r(BC, None, 'button tao bo du lieu moi', None,
  '1. Vào Bước 2, bấm nút "+ Tạo bộ dữ liệu mới".',
  None)
r(BC, 'tao bao cao', 'danh sach bieu do', 'gia tri mac dinh',
  '1. Vào Bước 3 "Cấu hình biểu đồ".',
  'Cột trái hiện khối "Danh sách biểu đồ" đã có sẵn 1 biểu đồ tên "Biểu đồ 1", loại '
  '"Biểu đồ cột". Cột giữa là panel cấu hình của biểu đồ đang chọn, cột phải là "B. Kiểm tra '
  'hợp lệ" và "Xem trước".')
r(BC, 'tao bao cao', 'danh sach bieu do', 'khong co du lieu',
  '1. Vào Bước 3 và thử xoá hết biểu đồ trong "Danh sách biểu đồ".',
  'KHÔNG xoá được biểu đồ cuối cùng: mỗi báo cáo tối thiểu 1 biểu đồ nên nút xoá (X) tự ẩn/vô '
  'hiệu khi chỉ còn 1 biểu đồ (BA BR-BCD-15-3 / BR-BCD-16-5) ⇒ khối "Danh sách biểu đồ" không '
  'bao giờ rỗng.')
r(BC, 'tao bao cao', 'danh sach bieu do', None, None, None,
  M + 'Biểu đồ chưa cấu hình đủ thì cạnh tên nó trong "Danh sách biểu đồ" hiện biểu tượng cảnh '
  'báo kèm chú thích "Biểu đồ chưa cấu hình đầy đủ"; vẫn chuyển sang biểu đồ khác được, chỉ bị '
  'chặn khi bấm "Tạo báo cáo" (BA §3.16.15 EF-01).')
r(BC, None, 'button them bieu do', None,
  '1. Vào Bước 3, bấm "+ Thêm biểu đồ" nhiều lần cho tới khi nút biến mất.',
  None)
r(BC, None, 'textbox ten bieu do', 'bat buoc',
  '1. Vào Bước 3, xoá trắng ô "Tên biểu đồ".\n2. Xem khối "B. Kiểm tra hợp lệ" và bấm '
  '"Tạo báo cáo".',
  'Mục "Tên biểu đồ đã được nhập" trong khối "B. Kiểm tra hợp lệ" KHÔNG được tích; bấm '
  '"Tạo báo cáo" thì hiện dòng chữ đỏ "Vui lòng hoàn tất các mục còn thiếu bên dưới trước khi '
  'tạo báo cáo." và KHÔNG gọi lệnh tạo.')
r(BC, None, 'textbox ten bieu do', 'vuot do dai',
  '1. Vào Bước 3, dán vào ô "Tên biểu đồ" một chuỗi rất dài (trên 250 ký tự).',
  'KHÔNG có thông báo lỗi nào, KHÔNG highlight và KHÔNG đổi focus: ô "Tên biểu đồ" không đặt '
  'giới hạn ký tự ở giao diện nên hệ thống không cho nhập quá — không chặn ở mức nào, nhận '
  'hết chuỗi vừa dán. Ghi lại phản hồi của máy chủ khi bấm "Tạo báo cáo".',
  V + 'Ô "Tên biểu đồ" KHÔNG đặt giới hạn ký tự ở giao diện; giới hạn thật của cột dữ liệu '
  'chưa xác nhận — cần dev/BA chốt.')
r(BC, None, 'nut chon loai bieu do', 'gia tri mac dinh',
  '1. Vào Bước 3, xem khối chọn loại biểu đồ.',
  'Mặc định chọn "Biểu đồ cột".')
r(BC, None, 'nut chon loai bieu do', 'kiem tra cac lua chon',
  '1. Vào Bước 3, đọc các thẻ chọn loại biểu đồ.',
  'Có đúng 4 thẻ kèm mô tả: "Biểu đồ cột / So sánh các giá trị bằng các cột" · "Biểu đồ đường / '
  'Xu hướng theo thời gian" · "Biểu đồ tròn / Tỉ lệ phần trăm của tổng" · "Bảng danh sách / '
  'Hiển thị dữ liệu dạng bảng". KHÔNG có thẻ "Bảng pivot" dù hệ thống có xử lý loại đó '
  '(BA §3.16.15 AF-05).')
r(BC, None, 'nut chon loai bieu do', 'chuyen doi giua cac lua chon',
  '1. Vào Bước 3, bấm lần lượt 4 thẻ loại biểu đồ.',
  'Khối "A. Cấu hình dữ liệu" đổi theo loại: Cột → có "Chế độ biểu đồ" (Cột đơn/Cột nhóm) và '
  '"Trục X"; Đường → thêm "Độ chi tiết thời gian"; Tròn → "Nhóm theo" + "Giá trị"; Bảng danh '
  'sách → "Nhóm theo" nhiều cột + chỉ số + "Số dòng / trang". Khối "B. Kiểm tra hợp lệ" và '
  '"Xem trước" cũng đổi theo loại.')
r(BC, None, 'nut chon che do bieu do', 'gia tri mac dinh',
  '1. Vào Bước 3 với loại "Biểu đồ cột", xem khối "Chế độ biểu đồ".',
  'Mặc định chọn "Cột đơn".')
r(BC, None, 'nut chon che do bieu do', 'kiem tra cac lua chon',
  '1. Xem khối "Chế độ biểu đồ" của loại "Biểu đồ cột".',
  'Có đúng 2 lựa chọn: "Cột đơn" và "Cột nhóm".')
r(BC, None, 'nut chon che do bieu do', 'chuyen doi giua cac lua chon',
  '1. Đang ở "Cột đơn", bấm "Cột nhóm".\n2. Bấm ngược lại về "Cột đơn".',
  'Chọn "Cột nhóm": nhãn trục đổi thành "Các giá trị nhóm", hiện thêm bảng "Khai báo các cột '
  'trên trục X" cho nhiều chỉ số kèm nút "+ Thêm cột" và ô tích "Gộp nhóm còn lại thành \'Khác\'". '
  'Quay về "Cột đơn": chỉ còn ĐÚNG 1 chỉ số (các dòng chỉ số thêm bị cắt bỏ) và KHÔNG còn nút '
  '"+ Thêm cột" (BA §3.16.15 AF-01).')

r(BC, None, 'selectbox truc x', None, None, None,
  M + 'Ô "Trục X" (chế độ Cột đơn / Biểu đồ đường) là BẮT BUỘC: chưa chọn thì mục "Đã khai báo '
  'giá trị nhóm" trong khối "B. Kiểm tra hợp lệ" không được tích và nút "Tạo báo cáo" bị chặn. '
  'Danh sách cột nạp từ bộ dữ liệu đã chọn ở Bước 2; trong lúc nạp hiện "Đang tải danh sách '
  'cột...". Chế độ Cột nhóm đổi nhãn ô này thành "Các giá trị nhóm".')
r(BC, None, 'selectbox nhom theo', None, None, None,
  M + 'Ô "Nhóm theo *" chỉ hiện với loại "Biểu đồ tròn" và "Bảng danh sách"; chữ gợi ý khi chưa '
  'chọn là "-- Chọn cột nhóm --". Bắt buộc ít nhất 1 cột: thiếu thì mục "Cần ít nhất 1 cột '
  'nhóm." trong khối "B. Kiểm tra hợp lệ" không được tích.')
r(BC, None, 'selectbox ham tong hop', None, None, None,
  M + 'Ô chọn hàm tổng hợp (chữ gợi ý "-- Chọn công thức --") có các giá trị SUM · AVG · COUNT · '
  'MIN · MAX và "SELECT (không tổng hợp)". Đổi hàm tổng hợp thì danh sách cột dữ liệu bên cạnh '
  'lọc lại theo kiểu dữ liệu dùng được với hàm đó; không còn cột nào phù hợp thì ô cột hiện '
  '"-- Chọn cột (không có cột nào dùng được với {hàm tổng hợp}) --".')
r(BC, None, 'selectbox cot du lieu', None, None, None,
  M + 'Ô chọn cột dữ liệu của chỉ số là BẮT BUỘC ở mọi loại biểu đồ (mục "Chỉ số phải có hàm '
  'tổng hợp." trong khối "B. Kiểm tra hợp lệ"). Riêng chế độ Cột đơn: hệ thống VẪN đòi chọn cột '
  'chỉ số dù khối kiểm tra hợp lệ không có dòng riêng cho việc đó — khối đó là gợi ý trực quan, '
  'không phản ánh đủ điều kiện chặn lưu (BA BR-BCD-15-1).')
r(BC, None, 'textbox nhan hien thi', None, None, None,
  M + 'Ô "Nhãn hiển thị" của mỗi chỉ số KHÔNG bắt buộc: để trống thì biểu đồ dùng nhãn tự sinh '
  'dạng {hàm tổng hợp}({tên cột}) (vd SUM(so_luong)), hoặc "Chỉ số {N}" khi chưa chọn cột.')
r(BC, None, 'checkbox gop nhom con lai', None, None, None,
  M + "Ô tích \"Gộp nhóm còn lại thành 'Khác'\" CHỈ hiện ở chế độ Cột nhóm; mặc định bỏ trống. "
  'Tích vào thì các nhóm ngoài danh sách cột đã khai được gộp thành một nhóm tên "Khác".')
r(BC, None, 'selectbox do chi tiet thoi gian', None, None, None,
  M + 'Ô "Độ chi tiết thời gian" CHỈ hiện với loại "Biểu đồ đường", gồm các mức Mặc định · Theo '
  'ngày · Theo tuần · Theo tháng · Theo quý · Theo năm (BA §3.14). Khối "B. Kiểm tra hợp lệ" của '
  'loại này có thêm gợi ý nên ưu tiên trục thời gian.')
r(BC, None, 'textbox so dong cua bang danh sach', None, None, None,
  M + 'Ô "Số dòng / trang" CHỈ hiện với loại "Bảng danh sách", quyết định số dòng mỗi trang của '
  'CHÍNH biểu đồ bảng — không liên quan tới cụm phân trang của màn danh sách báo cáo.',)
r(BC, None, 'checkbox mau sac', None, None, None,
  M + 'Khối "C. Màu sắc" KHÔNG bắt buộc: mặc định chọn "Mặc định"; chuyển sang '
  '"Tùy chỉnh màu theo từng chỉ số" thì hiện các dòng gán màu, mỗi dòng có nút "Chọn màu", ô '
  'nhãn với chữ gợi ý "Nhãn giá trị (VD: Nam)", nút "Xóa màu" và nút "+ Thêm màu".')
r(BC, None, 'selectbox vi tri chu thich', None, None, None,
  M + 'Khối "D. Hiển thị" KHÔNG bắt buộc, gồm ô chọn "Vị trí chú thích", "Nội dung nhãn" và các '
  'ô tích bật/tắt chú thích · gợi ý khi rê chuột · nhãn giá trị. Khung "Xem trước" ở cột phải '
  'chỉ mô tả TĨNH loại biểu đồ đang chọn, KHÔNG vẽ số liệu giả (BA §3.16.15 mục 8).')
r(BC, None, 'button quay lai', None,
  '1. Vào Bước 1, nhập tên báo cáo rồi bấm "Quay lại".\n'
  '2. Vào Bước 2 hoặc Bước 3 rồi bấm "Quay lại".',
  None)
r(BC, None, 'button tiep theo', None,
  '1. Ở Bước 1 khi chưa nhập tên, bấm "Tiếp theo".\n'
  '2. Nhập tên hợp lệ rồi bấm "Tiếp theo".\n'
  '3. Ở Bước 2 khi chưa chọn bộ dữ liệu, bấm "Tiếp theo".',
  None)
r(BC, 'tao bao cao', 'button tao bao cao', None,
  '1. Ở Bước 3, cấu hình đủ cho mọi biểu đồ (khối "B. Kiểm tra hợp lệ" tích hết).\n'
  '2. Bấm "Tạo báo cáo".',
  None)
# Khoá HẸP `… khi nhap day du`: từ 2026-09-12 nhóm `Chức năng Thêm mới` có HAI case mở đầu
# bằng `lưu thành công` (…khi nhập đầy đủ / …khi chỉ nhập các trường bắt buộc). Khoá trần
# `luu thanh cong` khớp cả hai ⇒ lưới chắn của A6 DỪNG cả chuỗi. Luật này viết cho case
# *nhập đầy đủ, dùng độ dài tối đa* — nêu rõ ở khoá.
r(BC, 'tao bao cao', 'chuc nang them moi', 'luu thanh cong khi nhap day du',
  '1. Nhập đủ Bước 1 → Bước 2 → Bước 3 với dữ liệu hợp lệ (dùng độ dài tối đa cho phép ở ô '
  '"Tên báo cáo": 250 ký tự).\n2. Bấm "Tạo báo cáo".',
  'Hệ thống tạo báo cáo rồi điều hướng sang màn Xem chi tiết báo cáo; báo cáo mới ở trạng thái '
  '"Bản nháp" và xuất hiện trong danh sách khi quay lại thẻ "Báo cáo". Wizard KHÔNG hiện thông '
  'báo nổi "thêm thành công" — dấu hiệu thành công là việc điều hướng sang màn chi tiết.')
r(BC, 'tao bao cao', 'chuc nang them moi', 'khong nhap cac truong bat buoc',
  '1. Ở Bước 1 để trống "Tên báo cáo" rồi bấm "Tiếp theo".\n'
  '2. Nhập tên hợp lệ, sang Bước 2 và KHÔNG chọn bộ dữ liệu nào rồi bấm "Tiếp theo".\n'
  '3. Sang Bước 3, xoá trắng "Tên biểu đồ" và không chọn trục/chỉ số, bấm "Tạo báo cáo".',
  'Mỗi bước chặn tại chỗ bằng dòng chữ đỏ tương ứng: "Vui lòng nhập tên báo cáo" · "Vui lòng '
  'chọn bộ dữ liệu" · "Vui lòng hoàn tất các mục còn thiếu bên dưới trước khi tạo báo cáo."; '
  'không có báo cáo nào được tạo.')
r(BC, 'tao bao cao', 'chuc nang them moi', 'trung cung luc tu 2 client',
  '1. Mở luồng tạo báo cáo trên 2 trình duyệt, cùng nhập MỘT tên báo cáo chưa tồn tại.\n2. Hoàn '
  'tất và bấm "Tạo báo cáo" ở trình duyệt A, rồi bấm ở trình duyệt B.',
  'Trình duyệt A tạo thành công. Trình duyệt B: kiểm trùng tên tại chỗ có thể đã qua từ trước, '
  'nên phải bị MÁY CHỦ chặn ở bước tạo và hiện "Tạo báo cáo thất bại" kèm thông điệp trùng tên '
  '(máy chủ chặn cuối bằng mã lỗi 409 — BA §3.16.16 Validation Rules).',
  V + 'Cần dev/BA xác nhận thông điệp máy chủ trả về cho ca trùng tên khi tạo đồng thời.')
r(BC, 'tao bao cao', 'chuc nang them moi', 'luu dung vao database',
  '1. Tạo một báo cáo mới qua luồng 3 bước.\n2. Đối chiếu bản ghi vừa tạo với dữ liệu máy chủ '
  '(dịch vụ chi tiết báo cáo theo mã vừa điều hướng tới): tên, mô tả, danh sách bộ dữ liệu, số '
  'biểu đồ và cấu hình từng biểu đồ.',
  'Dữ liệu lưu khớp đúng những gì đã nhập trong 3 bước; trạng thái là Bản nháp; mỗi biểu đồ '
  'trong luồng tạo báo cáo tương ứng một biểu đồ Superset thuộc cùng một dashboard (BA '
  'BR-BCD-15-2).', T_DB)
r(BC, 'tao bao cao', 'chuc nang huy bo', None, None, None,
  M + 'Wizard KHÔNG có nút "Hủy": lối rút lui là nút "Quay lại" ở Bước 1 (thoát về danh sách, '
  'có hỏi lại nếu đã nhập gì — BA §3.16.16 AF-02). Thoát giữa đường thì KHÔNG có báo cáo nào '
  'được tạo.')

# ══════════════════ 10. XEM CHI TIẾT · CHỈNH SỬA BIỂU ĐỒ ══════════════════
r(BC, 'xem chi tiet bao cao', 'hien thi chi tiet bao cao', None, None, None,
  M + 'Màn Chi tiết (/dynamic-reports/{mã}) hiện: tiêu đề = tên báo cáo, dưới là mô tả, nút '
  '"Quay lại danh sách"; thẻ trạng thái gồm nhãn trạng thái (Bản nháp / Đã xuất bản / Đã xóa), '
  'dòng "Số biểu đồ: {N}" và nhóm nút hành động; dưới cùng là khung nhúng dashboard Superset '
  '(chỉ hiện khi đã có mã dashboard > 0), có trạng thái "Đang tải biểu đồ..." và dòng lỗi đỏ '
  'riêng nếu lấy được token nhúng thất bại. Mọi thông báo của màn này hiện INLINE trong thẻ '
  'trạng thái, KHÔNG dùng thông báo nổi.')
r(BC, 'xem chi tiet bao cao', 'button sua bieu do', None,
  '1. Mở màn Chi tiết của 1 báo cáo "Bản nháp" đã có biểu đồ.\n'
  '2. Mở màn Chi tiết của 1 báo cáo "Đã xuất bản".\n3. Bấm nút "Sửa biểu đồ" ở ca thứ nhất.',
  None)
r(BC, 'xem chi tiet bao cao', 'button dong bo', None,
  '1. Mở màn Chi tiết của 1 báo cáo "Bản nháp" mà hệ thống chưa xác nhận đồng bộ thành công.\n'
  '2. Bấm nút "Đồng bộ".',
  None)
r(BC, 'xem chi tiet bao cao', 'button xuat ban', None,
  '1. Mở màn Chi tiết của 1 báo cáo "Bản nháp".\n2. Bấm nút "Xuất bản".',
  None)
r(BC, 'xem chi tiet bao cao', 'button xuat excel', None,
  '1. Mở màn Chi tiết của 1 báo cáo đã có dashboard Superset.\n2. Bấm nút "Xuất Excel".',
  None,
  V + 'Chưa xác nhận được khuôn tệp (tên tệp, tên sheet, thứ tự cột) — cần QA/BA chốt.')
r(BC, 'xem chi tiet bao cao', 'button xoa', None,
  '1. Mở màn Chi tiết của 1 báo cáo KHÁC trạng thái "Đã xóa".\n2. Bấm nút "Xóa".',
  None,
  R + 'Nút "Xóa" ở màn Chi tiết KHÔNG có hộp xác nhận, khác hẳn biểu tượng "Xóa" trên danh sách '
  'vốn có hộp "Xác nhận xóa báo cáo?". Cần QA/BA xác nhận đây là chủ ý.')
r(BC, 'xem chi tiet bao cao', 'chuc nang xem chi tiet', None, None, None,
  R + 'Mở màn Chi tiết bằng một mã báo cáo KHÔNG tồn tại (hoặc khi lệnh lấy chi tiết lỗi) thì '
  'trang ĐỨNG MÃI ở trạng thái "Đang tải..." — chưa có màn báo lỗi riêng cho ca này '
  '(BA §3.16.17 EF-01). Ngoài ra khung nhúng dashboard bị gỡ quyền mở tab mới: bấm một liên kết '
  'bên trong dashboard thì hệ thống tự nhúng lại dashboard ban đầu (EF-04 / BR-BCD-17-6).')
r(BC, 'chinh sua bieu do bao cao', 'button luu thay doi', None,
  '1. Mở màn Chỉnh sửa biểu đồ của 1 báo cáo "Bản nháp".\n2. Sửa/thêm/xoá biểu đồ ở Bước 3 rồi '
  'bấm "Lưu thay đổi".',
  None)
r(BC, 'chinh sua bieu do bao cao', 'chuc nang chinh sua', 'cap nhat thanh cong khi sua hop le',
  '1. Mở màn Chỉnh sửa biểu đồ của 1 báo cáo "Bản nháp".\n'
  '2. Sửa cấu hình một biểu đồ ở Bước 3 (đổi loại, đổi trục, đổi chỉ số).\n'
  '3. Bấm "Lưu thay đổi", rồi vào lại màn Chi tiết để đối chiếu.',
  'Cấu hình biểu đồ được lưu đúng như đã sửa và về màn Xem chi tiết báo cáo. Lưu ý: tên báo cáo, '
  'mô tả và lựa chọn bộ dữ liệu ở Bước 1/2 KHÔNG được lưu dù giao diện cho sửa.',
  R + 'BA BR-BCD-16-2: chỉ Bước 3 có API lưu; mọi thay đổi ở Bước 1/2 mất khi rời màn, chỉ có '
  'một dòng chữ nhỏ "Tên báo cáo, mô tả và bộ dữ liệu hiện chưa hỗ trợ lưu khi chỉnh sửa (thiếu '
  'API) — thay đổi ở đây chỉ để xem trước giao diện, chưa được lưu lại." cảnh báo. Người dùng '
  'rất dễ tưởng đã lưu. Cần QA/BA quyết: khoá 2 bước đó ở chế độ sửa, hay bổ sung API.')
r(BC, 'chinh sua bieu do bao cao', 'chuc nang chinh sua', 'khong nhap cac truong bat buoc',
  '1. Ở Bước 1 của màn Chỉnh sửa, xoá trắng "Tên báo cáo" rồi bấm "Tiếp theo".\n'
  '2. Ở Bước 2 bỏ tích hết bộ dữ liệu rồi bấm "Tiếp theo".\n'
  '3. Ở Bước 3 xoá trắng "Tên biểu đồ" rồi bấm "Lưu thay đổi".',
  'Từng bước chặn tại chỗ như luồng tạo mới: "Vui lòng nhập tên báo cáo" · "Vui lòng chọn bộ dữ '
  'liệu" · ở Bước 3 thì ở lại và không gọi lệnh lưu. Bước 1 vẫn BẮT BUỘC hợp lệ mới qua được '
  'Bước 2 dù giá trị đó không được lưu (BA BR-BCD-16-4).')
r(BC, 'chinh sua bieu do bao cao', 'chuc nang chinh sua', 'sua trung cung luc tu 2 client',
  '1. Mở màn Chỉnh sửa biểu đồ của CÙNG một báo cáo trên 2 trình duyệt.\n'
  '2. Ở A xoá một biểu đồ và bấm "Lưu thay đổi".\n3. Ở B sửa chính biểu đồ đó rồi bấm '
  '"Lưu thay đổi".',
  'Ghi lại nguyên văn phản hồi ở trình duyệt B.',
  R + 'BA §3.16.17 EF-04: lưu nhiều biểu đồ mà lỗi giữa chừng thì các lệnh gọi TRƯỚC lệnh lỗi '
  'đã ghi thật trên máy chủ, KHÔNG hoàn tác — báo cáo có thể ở trạng thái nửa vời. Cần QA/BA + '
  'dev xác nhận cách xử lý xung đột khi 2 người sửa cùng lúc.')
r(BC, 'chinh sua bieu do bao cao', 'chuc nang chinh sua', 'luu dung vao database',
  '1. Sửa cấu hình biểu đồ rồi bấm "Lưu thay đổi".\n'
  '2. Đối chiếu với dữ liệu máy chủ trả về cho lệnh lấy chi tiết báo cáo.',
  'Cấu hình từng biểu đồ lưu khớp đúng những gì đã sửa; số biểu đồ khớp "Số biểu đồ: {N}" ở màn '
  'Chi tiết; tên báo cáo / mô tả / bộ dữ liệu KHÔNG đổi (máy chủ chưa có dịch vụ lưu).', T_DB)
r(BC, 'chinh sua bieu do bao cao', 'chuc nang huy bo', None, None, None,
  M + 'Màn Chỉnh sửa KHÔNG có nút "Hủy": lối rút lui là "Quay lại" (Bước 1 thoát về danh sách, '
  'có hỏi lại nếu đã thay đổi gì). Bấm X trên một biểu đồ trong "Danh sách biểu đồ" chỉ bỏ nó '
  'khỏi wizard NGAY trên giao diện, không hỏi lại và CHƯA xoá thật cho tới khi bấm '
  '"Lưu thay đổi" (BA §3.16.16 AF-05).')
r(BC, 'chinh sua bieu do bao cao', None, 'tong the giao dien man hinh',
  None, None,
  V + 'Mở /dynamic-reports/{mã}/edit-chart của báo cáo KHÁC trạng thái Bản nháp thì màn chặn '
  'cứng: hiện lỗi cố định "Chỉ báo cáo Nháp (DRAFT) mới có thể sửa." kèm nút "Quay lại danh '
  'sách" và KHÔNG hiện wizard (BA BR-BCD-16-3 / EF-02).')

# ══════════════════ 11. THẺ BỘ DỮ LIỆU — thêm · kích hoạt · tắt · xoá · hàng loạt ══════════════════
r(BD, 'them bo du lieu', 'combobox danh muc', 'gia tri mac dinh',
  '1. Bấm thẻ "Bộ dữ liệu" > bấm nút "Thêm bộ dữ liệu".',
  'Modal "Thêm bộ dữ liệu" mở ra; ô "Danh mục (Catalog) *" hiện chữ "Chọn catalog"; trong lúc '
  'nạp danh sách catalog thì ô hiện "Đang tải...".')
r(BD, 'them bo du lieu', 'combobox danh muc', 'cac gia tri co trong',
  '1. Mở popup "Thêm bộ dữ liệu", bấm ô "Danh mục (Catalog) *".',
  'Danh sách catalog do dịch vụ duyệt Trino trả về, có ô tìm với chữ gợi ý "Tìm catalog..."; '
  'không tìm thấy thì hiện "Không tìm thấy kết quả". Nếu nạp lỗi, ô đổi thành khung đỏ '
  '"Không thể tải danh sách catalog" kèm nút "Thử lại".')
r(BD, 'them bo du lieu', 'combobox danh muc', 'chon cac gia tri khac nhau',
  '1. Chọn một catalog.\n2. Chọn tiếp Schema và Bảng/View.\n3. Quay lại đổi sang catalog KHÁC.',
  'Chọn catalog thì hệ thống tự nạp danh sách Schema tương ứng. Đổi catalog thì XOÁ TRẮNG cả '
  '"Schema" và "Bảng / View" rồi nạp lại từ đầu (BA BR-BCD-14-1).')
r(BD, 'them bo du lieu', 'combobox schema', 'gia tri mac dinh',
  '1. Mở popup "Thêm bộ dữ liệu", chưa chọn catalog.',
  'Ô "Schema *" hiện chữ "Chọn schema" và đang bị KHOÁ — chỉ mở được sau khi đã chọn '
  '"Danh mục (Catalog)" (BA §3.16.14 Validation Rules).')
r(BD, 'them bo du lieu', 'combobox schema', 'cac gia tri co trong',
  '1. Chọn một catalog rồi bấm ô "Schema *".',
  'Danh sách schema của catalog đó, có ô tìm "Tìm schema..."; nạp lỗi thì hiện khung đỏ '
  '"Không thể tải danh sách schema" kèm nút "Thử lại".')
r(BD, 'them bo du lieu', 'combobox schema', 'chon cac gia tri khac nhau',
  '1. Chọn schema A rồi chọn tiếp Bảng/View.\n2. Đổi sang schema B.',
  'Đổi schema thì XOÁ TRẮNG ô "Bảng / View" và nạp lại danh sách bảng theo schema mới; ô '
  '"Danh mục (Catalog)" giữ nguyên.')
r(BD, 'them bo du lieu', 'combobox bang view', 'gia tri mac dinh',
  '1. Mở popup "Thêm bộ dữ liệu", chưa chọn schema.',
  'Ô "Bảng / View *" hiện chữ "Chọn bảng" và đang bị KHOÁ — chỉ mở được sau khi đã chọn Schema.')
r(BD, 'them bo du lieu', 'combobox bang view', 'cac gia tri co trong',
  '1. Chọn đủ catalog và schema rồi bấm ô "Bảng / View *".',
  'Danh sách bảng/view của schema đó, mỗi dòng hiện tên bảng bằng phông đơn cách kèm loại '
  '(BASE TABLE / VIEW); có ô tìm "Tìm tên bảng...", không thấy thì hiện "Không tìm thấy bảng '
  'nào". Nạp lỗi thì hiện khung đỏ "Không thể tải danh sách bảng" kèm nút "Thử lại".')
r(BD, 'them bo du lieu', 'combobox bang view', 'chon cac gia tri khac nhau',
  '1. Chọn một bảng có loại BASE TABLE.\n2. Đổi sang một view (loại VIEW).',
  'Mỗi lần chọn, ô "Phân loại bộ dữ liệu" TỰ suy ra: chọn view thì thành VIEW, còn lại thành '
  'TABLE, kèm dòng chú thích "Phát hiện từ Trino: {loại bảng}"; vẫn sửa tay được sau đó '
  '(BA §3.16.14 bước 5).')
r(BD, 'them bo du lieu', 'selectbox vung du lieu', 'gia tri mac dinh',
  '1. Mở popup "Thêm bộ dữ liệu", xem ô "Vùng dữ liệu".',
  'Mặc định là GOLD.')
r(BD, 'them bo du lieu', 'selectbox vung du lieu', 'cac gia tri co trong',
  '1. Bấm mở ô "Vùng dữ liệu".',
  'Đúng 2 giá trị: GOLD và DIAMOND — module Báo cáo động không dùng vùng Bronze/Silver '
  '(BA GBR-07). Ô này KHÔNG có ô tìm bên trong.')
r(BD, 'them bo du lieu', 'selectbox phan loai bo du lieu', 'gia tri mac dinh',
  '1. Mở popup "Thêm bộ dữ liệu", xem ô "Phân loại bộ dữ liệu".',
  'Mặc định là TABLE; sau khi chọn Bảng/View thì tự đổi theo loại Trino phát hiện được.')
r(BD, 'them bo du lieu', 'selectbox phan loai bo du lieu', 'cac gia tri co trong',
  '1. Bấm mở ô "Phân loại bộ dữ liệu".',
  'Đúng 4 giá trị: TABLE · VIEW · MART · STAR_SCHEMA (BA §3.14). Ô này KHÔNG có ô tìm bên trong.')
r(BD, 'them bo du lieu', 'button them bo du lieu', None,
  '1. Mở popup, chưa chọn đủ Catalog + Schema + Bảng/View.\n2. Chọn đủ 3 ô rồi bấm "Thêm bộ dữ '
  'liệu".',
  None)
r(BD, 'them bo du lieu', 'button huy', None,
  '1. Mở popup "Thêm bộ dữ liệu", chọn vài ô rồi bấm "Hủy".\n2. Mở lại popup.',
  None)
r(BD, 'them bo du lieu', 'chuc nang them moi', 'luu thanh cong khi nhap day du',
  '1. Mở popup "Thêm bộ dữ liệu", chọn đủ Catalog + Schema + Bảng/View chưa từng khai báo.\n2. '
  'Chọn "Vùng dữ liệu" và "Phân loại bộ dữ liệu".\n3. Bấm "Thêm bộ dữ liệu".',
  'Hiện thông báo nổi "Thêm bộ dữ liệu thành công"; popup đóng; dòng mới xuất hiện ở ĐẦU danh '
  'sách với cột "Bảng" = {catalog}.{schema}.{bảng} và trạng thái "Đã vô hiệu hóa"; "Tổng số bản '
  'ghi:" tăng đúng 1.')
r(BD, 'them bo du lieu', 'chuc nang them moi', 'khong nhap cac truong bat buoc',
  '1. Mở popup, lần lượt để trống từng ô trong 3 ô "Danh mục (Catalog)" · "Schema" · "Bảng / '
  'View".\n2. Quan sát nút "Thêm bộ dữ liệu".',
  'Nút "Thêm bộ dữ liệu" bị KHOÁ (không bấm được) khi còn thiếu bất kỳ ô nào trong 3 ô bắt '
  'buộc; hệ thống chặn bằng cách khoá nút chứ KHÔNG hiện thông báo lỗi dưới ô '
  '(BA BR-BCD-14-2). Hai ô "Vùng dữ liệu" và "Phân loại bộ dữ liệu" không bắt buộc, luôn có '
  'giá trị mặc định.')
# ⛔ GỠ 2026-09-14 — luật này GÁN NHẦM MỤC ĐÍCH: nó khớp case
#    `Kiểm tra gõ từ khoá không tồn tại trong Bảng View` (hỏi về việc GÕ từ khoá không có trong
#    danh sách gợi ý) nhưng trả lời về việc THÊM một bộ dữ liệu ĐÃ TỒN TẠI — hai việc khác hẳn.
#    Khoá `khong ton tai` trùng chữ nên khớp; phép ㉓ không bắt được vì cả hai cùng mang chữ đó.
#    Dữ kiện `verbatim.them_bo_du_lieu.loi_trung` VÌ THẾ CHƯA CÓ CHỖ ĐỨNG: CN `THÊM BỘ DỮ LIỆU`
#    KHÔNG có nhóm `Chức năng Thêm mới` (chỉ có khối `Validate`), nên không case nào hỏi về
#    luồng thêm trùng. Đây là case THIẾU THẬT của bộ — cần người đặt việc quyết có bổ sung
#    nhóm `Chức năng` cho CN này không; đừng nhét lại vào case tìm kiếm.
r(BD, 'them bo du lieu', 'chuc nang them moi', 'trung cung luc tu 2 client',
  '1. Mở popup trên 2 trình duyệt, cùng chọn MỘT bảng chưa khai báo.\n2. Bấm "Thêm bộ dữ liệu" '
  'ở A, rồi bấm ở B.',
  'A thành công. B bị máy chủ chặn và hiện dòng chữ đỏ "Bộ dữ liệu đã tồn tại: '
  '{catalog}.{schema}.{bảng}" trong popup; hệ thống chỉ có MỘT bản ghi cho bảng đó.')
r(BD, 'them bo du lieu', 'chuc nang them moi', 'luu dung vao database',
  '1. Thêm một bộ dữ liệu mới.\n2. Đối chiếu dòng vừa tạo với dữ liệu máy chủ trả về cho dịch '
  'vụ danh sách bộ dữ liệu: catalog, schema, bảng, vùng dữ liệu, phân loại, trạng thái, ngày '
  'tạo.',
  'Dữ liệu lưu khớp đúng những gì đã chọn trong popup; trạng thái mặc định là "Đã vô hiệu hóa", '
  'trừ khi tạo từ Bước 2 của luồng tạo báo cáo thì là trạng thái đang hoạt động.', T_DB)
r(BD, 'them bo du lieu', 'chuc nang huy bo', None, None, None,
  M + 'Modal có nút "Hủy" (đóng modal, không lưu) và bấm ra ngoài modal cũng đóng. Đóng rồi mở '
  'lại thì mọi ô đã được xoá về mặc định — modal tự dọn trạng thái mỗi lần mở.')

r(BD, 'kich hoat bo du lieu', 'button kich hoat', None,
  '1. Bấm thẻ "Bộ dữ liệu", tìm dòng có trạng thái "Đã vô hiệu hóa".\n'
  '2. Bấm nút ⋮ ở cột "Hành động" rồi chọn "Kích hoạt".',
  None)
r(BD, 'kich hoat bo du lieu', 'chuc nang chuyen trang thai', None, None, None,
  M + 'Kích hoạt gộp 3 việc trong một lệnh: duyệt PII an toàn, cấp phát dataset sang Superset và '
  'đặt trạng thái ACTIVE — giao diện KHÔNG tách bước nào (BA BR-BCD-23-1). Chỉ bộ dữ liệu đang '
  'hoạt động mới chọn được khi tạo báo cáo mới; việc tắt KHÔNG ảnh hưởng báo cáo đã tạo trước '
  'đó đang tham chiếu tới nó (BR-BCD-23-3).')
r(BD, 'tat bo du lieu', 'button tat', None,
  '1. Bấm thẻ "Bộ dữ liệu", tìm dòng có trạng thái "Đang hoạt động".\n'
  '2. Bấm nút ⋮ ở cột "Hành động" rồi chọn "Tắt".',
  None,
  R + 'Nhãn không nhất quán: mục trong menu ghi "Tắt", thông báo ghi "Bộ dữ liệu đã tắt", còn '
  'thẻ chữ trên bảng ghi "Đã vô hiệu hóa" (BA BR-BCD-23-4). Cần QA/BA chốt một bản chữ.')
r(BD, 'tat bo du lieu', 'chuc nang chuyen trang thai', None, None, None,
  M + 'Tắt một bộ dữ liệu chỉ ngăn việc CHỌN nó khi tạo báo cáo MỚI; báo cáo đã tạo trước đó '
  'vẫn dùng bình thường (BA BR-BCD-23-3). Không có hộp xác nhận cho cả Kích hoạt và Tắt.')

r(BD, 'xoa bo du lieu', 'hop xac nhan xoa bo du lieu', None,
  None, None,
  M + 'Bấm nút ⋮ > "Xóa" thì hệ thống gọi lệnh kiểm tra báo cáo đang dùng RỒI mở hộp thoại '
  '"Xác nhận xóa bộ dữ liệu?" (trong lúc kiểm tra hiện "Đang kiểm tra báo cáo đang sử '
  'dụng..."). Nội dung có 2 biến thể: đã cấp phát Superset → "Bộ dữ liệu {schema}.{table} đã '
  'được cấp phát sang Superset. Xóa tại đây chỉ xóa khỏi danh sách quản lý của hệ thống, không '
  'xóa dữ liệu gốc trong database và không xóa dataset tương ứng trong Superset."; chưa cấp '
  'phát → "Bộ dữ liệu {schema}.{table} sẽ bị xóa khỏi danh sách quản lý. Thao tác này không xóa '
  'dữ liệu gốc trong database.". Hai nút: "Hủy" · "Xác nhận".')
r(BD, 'xoa bo du lieu', 'chuc nang xoa', 'xoa thanh cong ban ghi chua duoc su dung',
  '1. Chọn 1 bộ dữ liệu KHÔNG được báo cáo nào đang dùng.\n'
  '2. Bấm nút ⋮ > "Xóa" rồi bấm "Xác nhận".',
  'Hộp thoại KHÔNG có băng cảnh báo vàng; xoá xong hiện thông báo nổi "Đã xóa bộ dữ liệu", dòng '
  'biến khỏi danh sách và "Tổng số bản ghi:" giảm đúng 1.')
r(BD, 'xoa bo du lieu', 'chuc nang xoa', 'chon nhieu ban ghi de xoa',
  '1. Tích chọn từ 2 bộ dữ liệu trở lên.\n2. Bấm nút "Xóa {N} mục" trên thanh thao tác hàng '
  'loạt.\n3. Bấm "Xác nhận".',
  'Hộp thoại có tiêu đề "Xác nhận xóa {N} bộ dữ liệu đã chọn?" và GỘP cảnh báo báo cáo đang '
  'dùng của TẤT CẢ bộ đã chọn (danh sách trùng lặp được loại bỏ). Xác nhận thì hiện thông báo '
  'nổi "Đã xóa {N} bộ dữ liệu"; lỗi một phần thì hiện "Xóa thất bại {d}/{N} bộ dữ liệu"; các '
  'bộ đã xoá không còn trong danh sách.')
r(BD, 'xoa bo du lieu', 'chuc nang xoa', 'khi xoa trung du lieu cung luc',
  '1. Mở thẻ "Bộ dữ liệu" trên 2 trình duyệt.\n'
  '2. Ở A xoá một bộ dữ liệu và xác nhận.\n3. Ở B (chưa làm mới) xoá CHÍNH bộ đó và xác nhận.',
  'A xoá thành công. B: máy chủ trả lỗi, hệ thống hiện thông báo nổi với thông điệp máy chủ trả '
  'về (mặc định "Không thể xóa bộ dữ liệu này vì đang được sử dụng trong báo cáo."); sau khi làm '
  'mới thì dòng đó đã biến khỏi danh sách.',
  V + 'Thông điệp mặc định nói "đang được sử dụng trong báo cáo" nên có thể gây hiểu sai cho ca '
  'bản ghi đã bị người khác xoá. Cần dev/BA xác nhận thông điệp cho ca xoá trùng.')
r(BD, 'xoa bo du lieu', 'chuc nang xoa', 'ban ghi dang duoc su dung',
  '1. Chuẩn bị 1 bộ dữ liệu đang được ít nhất 1 báo cáo ĐÃ XUẤT BẢN sử dụng.\n'
  '2. Bấm nút ⋮ > "Xóa" và đọc hộp thoại.\n3. Bấm "Xác nhận".',
  'Hộp thoại hiện THÊM băng cảnh báo màu vàng "Đang được sử dụng bởi {N} báo cáo đang hoạt '
  'động: {tên báo cáo...}" nhưng KHÔNG chặn: vẫn bấm "Xác nhận" được và bộ dữ liệu bị xoá khỏi '
  'danh sách quản lý (BA GBR-06 / BR-BCD-24-2).',
  R + 'BA BR-BCD-24-4: cảnh báo CHỈ tính báo cáo "Đã xuất bản"; báo cáo "Bản nháp" dùng cùng bộ '
  'dữ liệu KHÔNG được tính vào cảnh báo ⇒ xoá xong mới vỡ báo cáo nháp. Ngoài ra KHÔNG có luồng '
  'khôi phục bộ dữ liệu đã xoá (BR-BCD-24-3). Cần QA/BA xác nhận đây là chủ ý.')
r(BD, 'xoa bo du lieu', 'chuc nang xoa', 'khop db',
  '1. Xoá 1 bộ dữ liệu.\n2. Đối chiếu với dữ liệu máy chủ trả về cho dịch vụ danh sách bộ dữ '
  'liệu.',
  'Bộ dữ liệu không còn trong danh sách quản lý mà máy chủ trả về. Đây là xoá khỏi danh sách '
  'quản lý: bảng/view gốc trong database và dataset tương ứng bên Superset KHÔNG bị xoá '
  '(BA BR-BCD-24-1).', T_DB)
r(BD, 'xoa bo du lieu', 'chuc nang xoa', 'huy bo thao tac',
  '1. Bấm nút ⋮ > "Xóa" trên một dòng.\n2. Bấm "Hủy" trong hộp thoại.',
  'Hộp thoại đóng; bộ dữ liệu KHÔNG bị xoá, vẫn nguyên trong danh sách và "Tổng số bản ghi:" '
  'không đổi.')
r(BD, 'thao tac hang loat tren bo du lieu', None, 'hien thi day du cac thong tin',
  None, None,
  M + 'Thanh thao tác hàng loạt nổi phía dưới bảng và cụm phân trang; các nút tính theo '
  'trạng thái THỰC của các dòng đã tích: "Tắt {N} mục" (nếu có dòng đang hoạt động) · '
  '"Kích hoạt {N} mục" (nếu có dòng đã tắt) · "Xóa {N} mục" (BA §3.16.23 AF-01).')
r(BD, 'thao tac hang loat tren bo du lieu', 'chuc nang chuyen trang thai hang loat', None,
  None, None,
  R + 'Kích hoạt/Tắt hàng loạt KHÔNG có hộp xác nhận, gọi máy chủ LẶP từng bản ghi nên thành '
  'công một phần là chuyện thường: thông báo chỉ nói số lượng ("Đã kích hoạt {N} bộ dữ liệu" · '
  '"Kích hoạt thất bại {d}/{N} bộ dữ liệu" · "Tắt thất bại {d}/{N} bộ dữ liệu") mà KHÔNG nói '
  'bản ghi nào hỏng. Riêng "Xóa {N} mục" thì CÓ hộp xác nhận gộp cảnh báo usage. Xong thao tác '
  'thì lựa chọn ô tích được xoá về rỗng và danh sách tải lại.')

# ══════════════════ 12. BỘ CHUNG — DB · giao diện chung · zoom ══════════════════
r(None, None, None, 'khop db', None, None, T_DB)
# ⛔ ĐÃ BỎ luật cho case `Kiểm tra tổng thể giao diện màn hình` (chỉ thị người đặt việc
# 2026-09-11). Đó là BẢN CHỮ CỐ ĐỊNH của mẫu — A6 viết lại cột C/D theo bố cục riêng của
# màn này là vi phạm §7.3 "CẤM thay bản chữ cố định" và làm case lệch khỏi mọi bộ case anh
# em. Bản chuẩn nằm ở `qalib.TONG_THE_C` / `TONG_THE_D`, áp bằng `sync_gdc_zoom_steps.py`,
# rà bằng `audit_extra` phép ⑲.


# ══════════════════════════════════════════════════════════════════════════════════════════
# MÁY CHẠY
# ══════════════════════════════════════════════════════════════════════════════════════════
def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()


def set_t(tc, rn, txt):
    """Ghi cột T (ghi chú BA-vs-Code) — `retext` chỉ đổi B/C/D nên cột T phải ghi tay."""
    b = tc.rows[rn]['body']
    cm = re.search(r'<c r="T%d"[^>]*?(?:/>|>.*?</c>)' % rn, b, re.S)
    if not cm:
        return False
    st = re.search(r's="(\d+)"', cm.group(0))
    tc.rows[rn]['body'] = b.replace(
        cm.group(0),
        '<c r="T%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
        % (rn, st.group(1) if st else '0', tcfix.esc(txt)))
    return True


def quet_sheet(tc, dung, chi_tiet, ghi, trum=None):
    """Áp luật cho MỘT sheet đã load. Trả (số case sửa C/D, số case ghi T)."""
    n_cd = n_t = 0
    if trum is None:
        trum = {}
    cn = sub = sub2 = None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b_full = (tc.c(rn, 'B') or '').strip()
        b = b_full.split('\n')[0].strip()
        if lv == 'cn':
            cn = b; sub = sub2 = None; continue
        if lv in ('grp', 'sub'):
            sub = b; sub2 = None; continue
        if lv == 'sub2':
            sub2 = b; continue
        if lv != 'case':
            continue
        # Khớp trên CẢ tên nhóm cha (`sub`) lẫn nhóm control (`sub2`): nhóm control nằm dưới
        # `Chức năng Tìm kiếm đơn lẻ` thì `sub2` là tên ô lọc, mất tên khối cha ⇒ luật khai
        # theo khối cha sẽ khớp 0 case.
        nhom = ' | '.join(x for x in (sub, sub2) if x)
        # Khớp tiêu đề trên CẢ cột B, không chỉ dòng đầu: 3 case `Tìm kiếm khi nhập:` chỉ
        # khác nhau ở DÒNG THỨ HAI (`- Textbox = Các ký tự Space` · `… Space ở đầu và cuối` ·
        # `… các ký tự đặc biệt`). Đọc mỗi dòng đầu thì cả 3 là MỘT với bộ khớp, nên luật
        # `tieu_de='tim kiem khi nhap:'` dán cùng một cột C/D lên cả 3 -> mất sạch mục đích.
        k_cn, k_nh, k_td = norm(cn), norm(nhom), norm(b_full)
        for idx, (s_, c_, g_, t_, C, D, T) in enumerate(LUAT):
            if s_ is not None and s_ != tc.bpname:
                continue
            if c_ is not None and norm(c_) not in k_cn:
                continue
            if g_ is not None and norm(g_) not in k_nh:
                continue
            if t_ is not None and norm(t_) not in k_td:
                continue
            # ── LƯỚI CHẮN DÙNG CHUNG (vá 2026-09-14) ────────────────────────────────
            # Luật khai `tieu_de=None` áp cho MỌI case của nhóm. Nhóm `Button` định mức 1 và
            # case duy nhất của nó là `Kiểm tra căn lề, chính tả của button` ⇒ 17 luật tả
            # HÀNH ĐỘNG của nút đang ghi đè lên đúng case hỏi về CĂN LỀ. Bộ case đang giao
            # không dính vì `fix_kq_mau` ghi đè lại cột D sau đó — nhưng chạy lại script là
            # lộ ra. Bỏ qua phép này rồi ĐI TIẾP để luật hẹp hơn có cơ hội ghi.
            # Luật ở `qalib.a6_chan_ghi` (dùng chung với `a6_auto`) — đừng chép điều kiện
            # vào đây; nó xét trên GIÁ TRỊ SAU KHI GHI nên phép chỉ ghi cột C vẫn lọt.
            _chan = qalib.a6_chan_ghi(b_full, C, D, tc.c(rn, 'C'), tc.c(rn, 'D'), cn)
            if _chan:
                if chi_tiet:
                    print('   L%-3d %-12s r%-4d BỎ: %s' % (idx, tc.bpname[3:], rn, _chan))
                continue
            dung[idx] = dung.get(idx, 0) + 1
            ghi_cd = C is not None or D is not None
            trum.setdefault(idx, (ghi_cd, []))[1].append(b_full)
            if C is not None or D is not None:
                tc.retext(rn, None, C, D)
                n_cd += 1
            if T is not None and set_t(tc, rn, T):
                n_t += 1
            if chi_tiet:
                print('   L%-3d %-12s r%-4d %s' % (idx, tc.bpname[3:], rn, b[:56]))
            break                                # một case chỉ bị MỘT luật sửa
    return n_cd, n_t


def main():
    apply_ = '--apply' in sys.argv
    chi_tiet = '--chi-tiet' in sys.argv
    dung = {}
    trum = {}
    bps = tcfix.load(XLSX).bpsheets

    # ── lượt 1: RÀ KHÔ trên bản nạp lại từng sheet, không ghi gì ──
    n_cd = n_t = 0
    for bp in bps:
        a, b = quet_sheet(tcfix.load(XLSX, bp), dung, chi_tiet, False, trum)
        n_cd += a; n_t += b

    # ── LƯỚI CHẮN: luật khớp 0 case = gõ sai tên CN/nhóm/tiêu đề ⇒ sửa im lặng 0 dòng ──
    treo = [i for i in range(len(LUAT)) if not dung.get(i)]
    # ── LƯỚI CHẮN 2 (2026-09-11): luật GHI cột C/D mà trùm từ HAI MỤC ĐÍCH trở lên ──
    #    Lưới chắn cũ chỉ hỏi "luật này khớp 0 case?" — nó đếm 0 hay khác 0, nên luật khớp
    #    NHẦM 3 case khác mục đích vẫn lọt. Đó đúng là cách 3 case `Tìm kiếm khi nhập:` bị
    #    dán chung một cột C/D nói về chờ 1500 ms. Luật chỉ ghi cột T được miễn — ghi chú
    #    dùng chung nhiều case là bình thường. Luật dùng chung ở `qalib.soi_luat_trum`.
    xau = qalib.soi_luat_trum(trum)
    if xau:
        print('!! %d LUẬT GHI CỘT C/D NHƯNG TRÙM NHIỀU MỤC ĐÍCH — mỗi mục đích phải một luật '
              'riêng:' % len(xau))
        for i, tds in xau:
            s_, c_, g_, t_ = LUAT[i][:4]
            print('   L%-3d nhom=%-30s tieu_de=%r  -> %d mục đích:'
                  % (i, (g_ or '*')[:30], t_, len(tds)))
            for t in tds:
                print('        · %s' % t.replace('\n', ' | ')[:78])
        raise SystemExit('DỪNG: tách luật cho từng mục đích rồi chạy lại.')
    print('\n=== A6 Báo cáo động: %d luật · %d case sửa cột C/D · %d case ghi cột T ==='
          % (len(LUAT), n_cd, n_t))
    if treo:
        print('!! %d LUẬT KHỚP 0 CASE — gõ sai tên CN / tên nhóm / tiêu đề, phải sửa rồi chạy '
              'lại:' % len(treo))
        for i in treo:
            s_, c_, g_, t_ = LUAT[i][:4]
            print('   L%-3d sheet=%-14s cn=%-34s nhom=%-32s tieu_de=%s'
                  % (i, s_ or '*', (c_ or '*')[:34], (g_ or '*')[:32], t_ or '*'))
        raise SystemExit('DỪNG: sửa các luật treo ở trên trước khi ghi.')
    if not apply_:
        print('(XEM TRƯỚC — thêm --apply để ghi;  --chi-tiet để xem từng case)')
        return

    # ── lượt 2: GHI TỪNG SHEET RỒI NẠP LẠI ──────────────────────────────────────────────
    # ⚠️ `TC.save()` ghi lại CẢ workbook từ bản zip trong bộ nhớ của chính TC đó. Nạp cả 2 sheet
    # TRƯỚC rồi lưu lần lượt thì sheet lưu SAU (giữ bản gốc của sheet kia) XOÁ SẠCH thay đổi
    # của sheet lưu trước — bản đầu của script này báo "ĐÃ GHI 273 case" mà file không đổi một
    # ô nào. Phải nạp lại sau mỗi lần lưu, đúng lối `new_from_base.py` dựng sheet thứ hai.
    qalib.backup(XLSX, tag='truoc_a6_baocaodong')
    for bp in bps:
        tc = tcfix.load(XLSX, bp)
        quet_sheet(tc, {}, False, True)
        # `retext` chỉ đổi ô trong bộ nhớ; phải qua `rebuild` mới dựng lại sheet để `save`.
        # Plan khởi tạo RỖNG -> quên keep_range là XOÁ SẠCH nội dung sheet (bẫy ghi ở README).
        tc.rebuild(tcfix.Plan(tc).keep_range(12, max(tc.order))).save(quiet=True, sync=False)
    print('ĐÃ GHI -> %s' % XLSX)
    print('⚠️  BẮT BUỘC chạy tiếp: python3 ../../../tools/formula_layer.py <file> '
          '(rebuild đã ghi đè cột A thành chữ chay)')


main()
