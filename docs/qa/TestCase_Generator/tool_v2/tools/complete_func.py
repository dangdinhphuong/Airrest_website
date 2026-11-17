# -*- coding: utf-8 -*-
"""Bổ sung các case CHỨC NĂNG còn thiếu theo khuôn mau.xlsx.

Chỉ thêm vào các nhóm "Chức năng X" đã có sẵn trong khối grp "Chức năng".
SQL đối chiếu đặt ở cột Bước (C). File chưa xác định được tên bảng thì dùng
chỗ trống <...> và gắn cờ [CẦN VERIFY] ở cột Ghi chú (T).
"""
import sys, os, re, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import qalib

import roles
ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
# `ONLY` (2026-09-08): lọc theo TÊN MÀN. Trước đây 3 script `complete_*` chỉ nhận <Role> và chạy
# cho MỌI file của role — đợt 17/08 đã sửa lây **13 file ngoài phạm vi**, và cách chữa duy nhất
# trong tài liệu là tạm chuyển file sang `_hold/`. Nay: `complete_func.py QuanTri TrinhDoDaoTao`.
_ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
ONLY = _ARGS[1] if len(_ARGS) > 1 else None

CFG = roles.get(ROLE)
D = CFG['dir']


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


# tên bảng thật (rút từ SQL sẵn có trong file + schema/proto trong repo)
TABLE = {
    'BaiGiangTapHuan': 'training_lessons', 'BaiViet': 'articles', 'Curriculum': 'curriculums',
    'DanhMucBaiViet': 'categories', 'DanhMucFAQ': 'faq_categories', 'DonGia': 'output_prices',
    'DonHang': 'orders', 'FAQ': 'faqs', 'GoiSTEM': 'stem_packages', 'HopDong': 'contracts',
    'HopThuHoTro': 'support_tickets', 'KeHoachTapHuan': 'training_plans',
    'LichTapHuan': 'training_plan_sessions', 'LoaiVanDe': 'support_issue_types',
    'NCC': 'suppliers', 'NPP': 'distributors', 'Onboarding': 'schools',
    'PhiBanQuyen': 'article_royalty_configs', 'TaiKhoan': 'accounts',
    'ThongTinLienHe': 'contact_info', 'YeuCauTuVan': 'contact_requests',
    'LoaiThietBi': 'dm_thiet_bi', 'NamHocHocKy': 'dm_nam_hoc',
    'NangLucCotLoi': 'dm_nang_luc_cot_loi', 'XuatXu': 'dm_xuat_xu',
}
NOUN = {
    'Audit': 'bản ghi nhật ký', 'BaiGiangTapHuan': 'bài giảng', 'BaiViet': 'bài viết',
    'BaoMat': 'cấu hình bảo mật', 'CaiDat': 'cấu hình', 'Curriculum': 'chương trình giảng dạy',
    'DanhMucBaiViet': 'danh mục', 'DanhMucFAQ': 'danh mục', 'Dashboard': 'số liệu',
    'DonGia': 'đơn giá', 'DonHang': 'đơn hàng', 'FAQ': 'câu hỏi thường gặp',
    'GanBoSach': 'bản ghi gán bộ sách', 'GoiSTEM': 'gói STEM', 'HopDong': 'hợp đồng',
    'HopThuHoTro': 'yêu cầu hỗ trợ', 'KeHoachTapHuan': 'kế hoạch tập huấn',
    'LichTapHuan': 'buổi tập huấn', 'LoaiVanDe': 'loại vấn đề', 'NCC': 'nhà cung cấp',
    'NPP': 'nhà phân phối', 'Onboarding': 'tổ chức', 'PhiBanQuyen': 'cấu hình phí bản quyền',
    'Platform': 'cấu hình nền tảng', 'TaiKhoan': 'tài khoản', 'ThongBaoHeThong': 'thông báo',
    'ThongTinLienHe': 'thông tin liên hệ', 'VaiTro': 'vai trò', 'YeuCauTuVan': 'yêu cầu tư vấn',
    'LoaiThietBi': 'loại thiết bị', 'NamHocHocKy': 'năm học',
    'NangLucCotLoi': 'năng lực cốt lõi', 'XuatXu': 'xuất xứ',
}
VERIFY = '✿✿ [CẦN VERIFY] Tên bảng và tên cột trong câu truy vấn đối chiếu cần xác nhận lại với dev trước khi thực thi.'
NOUN = CFG['noun']
TABLE = CFG['table']


VERBS = ('Thêm mới', 'Thêm', 'Tạo mới', 'Tạo', 'Khởi tạo', 'Khai báo', 'Cập nhật', 'Chỉnh sửa',
         'Sửa', 'Xóa', 'Xoá', 'Xem chi tiết', 'Xem', 'Xuất', 'Nhập', 'Danh sách', 'Tìm kiếm')


class Ctx:
    def __init__(self, key):
        self.key = key
        self.base_n = NOUN.get(key, 'bản ghi')
        self.base_t = TABLE.get(key)
        # Nhãn các thẻ KPI của CN ĐANG duyệt. CỐ Ý không đặt trong `reset()`: `scope()` gọi
        # `reset()` ở mỗi nhóm, mà danh sách thẻ là của cả CN — để trong đó là bị xoá sạch
        # ngay trước lúc `ds_kpi_db` cần đến.
        self.kpi = []
        self.reset()

    def reset(self):
        self.n = self.base_n
        self.tb = self.base_t
        self.note = None if (self.tb and not CFG['verify_all']) else VERIFY
        self.t = self.tb or '<bảng dữ liệu của màn>'
        self.fmt = 'Excel'

    def scope(self, sub):
        """Neu ten nhom neu ro 1 thuc the con (vd 'Chuc nang Them chuong') thi dung
        danh tu do; bang du lieu khi ay khac bang chinh -> de trong + co CAN VERIFY."""
        self.reset()
        t = re.sub(r'^Chức năng\s*', '', sub).strip()
        for v in VERBS:
            if t.lower().startswith(v.lower()):
                t = t[len(v):].strip(); break
        t = re.sub(r'\s*\(.*?\)\s*', ' ', t).strip(' -–—/')
        if not t or len(t) > 28 or '/' in t: return
        self.n = t                                      # luon dung danh tu neu trong ten nhom
        if norm(t) != norm(self.base_n) and t.upper() != self.key.upper():
            self.note = VERIFY                          # co the la bang khac -> can dev xac nhan
        self.fmt = 'Excel'          # định dạng xuất, đặt lại theo tên nhóm


# ---------------- khuôn case (theo đúng lối viết của mau.xlsx) ----------------
def ds_default(x): return ('Tải danh sách mặc định', '1. Mở màn danh sách.',
    f'Tải danh sách {x.n} theo điều kiện mặc định, hiển thị trang đầu, sắp xếp mặc định theo thời điểm tạo mới nhất.')
def ds_db(x): return ('Kiểm tra dữ liệu danh sách khớp DB',
    f'1. Mở màn danh sách, ghi lại các dòng đang hiển thị.\n2. Đối chiếu với DB:\nselect * from {x.t}\nwhere deleted_at is null\norder by created_at desc;',
    f'Số dòng và từng cột hiển thị khớp chính xác với dữ liệu {x.n} trong hệ thống; thứ tự sắp xếp giống nhau.')
def ds_stat(x): return ('Kiểm tra số liệu thống kê khớp DB',
    f'1. Quan sát các ô thống kê ở đầu màn.\n2. Đối chiếu với DB:\nselect count(*) as tong, count(*) filter (where status = \'active\') as dang_hoat_dong\nfrom {x.t}\nwhere deleted_at is null;',
    'Từng ô thống kê bằng đúng con số đếm được trong hệ thống; không lệch, không đếm cả bản ghi đã xóa.')

# THẺ KPI ↔ CSDL — chỉ thị người đặt việc 2026-09-16 (*"bổ sung thêm case db cho các thẻ KPI
# tại phần chức năng"*). Đây KHÔNG phải `ds_stat` cũ sống lại: bản cũ khẳng định màn có "các ô
# thống kê ở đầu màn" nên màn không KPI là case chết, và chốt cứng `status = 'active'` cho mọi
# dự án. Bản này dẫn ĐÍCH DANH nhãn từng thẻ đang khai trong chính CN đó, và trả `None` khi CN
# không có thẻ nào ⇒ màn không KPI thì không sinh gì.
def ds_kpi_db(x):
    if not x.kpi:
        return None
    return ('Kiểm tra số liệu thống kê (%d thẻ KPI) khớp DB' % len(x.kpi),
        '1. Mở màn danh sách, bỏ hết bộ lọc và từ khoá tìm kiếm.\n'
        '2. Ghi lại giá trị trên %d thẻ: %s.\n'
        '3. Đối chiếu với dữ liệu trong hệ thống:\n'
        'select * from %s\n'
        'where deleted_at is null;'
        % (len(x.kpi), ', '.join('"%s"' % t for t in x.kpi), x.t),
        # Bản chữ cố định §7.3 (`qalib.KQ_MAU_CN`, dòng khoá `the kpi`). Ghi thẳng ở đây để
        # chạy LẺ `complete_func` trên bộ case đã có ra đúng y bản sinh mới — bước `fix_kq_mau`
        # của chuỗi khi ấy là no-op thay vì đổi chữ lần thứ hai.
        'Số liệu trên từng thẻ khớp với DB')

# ĐÃ GỠ khỏi SPEC 2026-09-08 (nhường patch_timkiemchung) — giữ hàm để tra lịch sử.
def tk_default(x): return ('Tìm kiếm theo giá trị mặc định',
    '1. Mở màn danh sách.\n2. Không nhập từ khoá, giữ nguyên các lựa chọn mặc định.',
    f'Hệ thống hiển thị toàn bộ {x.n} theo điều kiện mặc định.')
def tk_none(x): return ('Tìm kiếm không ra kết quả',
    '1. Nhập từ khoá chắc chắn không khớp bản ghi nào.',
    f'Danh sách về rỗng kèm thông báo không tìm thấy {x.n} phù hợp; không báo lỗi.')
# ĐÃ GỠ khỏi SPEC 2026-09-08 (trùng case tổ hợp của patch_kethop) — giữ hàm để tra lịch sử.
def tkk_mix(x): return ('Kiểm tra kết hợp nhiều tiêu chí cùng lúc',
    '1. Nhập từ khoá đồng thời chọn các bộ lọc khác trên màn.\n2. Quan sát danh sách.',
    'Danh sách chỉ giữ lại bản ghi thỏa ĐỒNG THỜI tất cả tiêu chí đang áp; bỏ tiêu chí nào thì kết quả nới ra tương ứng.')
def tkk_db(x): return ('Kiểm tra kết quả kết hợp khớp dữ liệu trong hệ thống',
    f'1. Áp đồng thời từ khoá và các bộ lọc.\n2. Đối chiếu với DB theo cùng điều kiện:\nselect * from {x.t}\nwhere deleted_at is null\n  and /* các điều kiện đang lọc trên màn */ true\norder by created_at desc;',
    'Danh sách khớp đúng kết quả lọc đồng thời tất cả tiêu chí; không thừa, không thiếu bản ghi nào.')

def add_full(x): return ('Kiểm tra lưu thành công khi nhập đầy đủ các trường (tối đa độ dài cho phép)',
    '1. Nhập hợp lệ vào tất cả các trường, dùng độ dài tối đa cho phép.\n2. Bấm nút lưu của biểu mẫu.',
    f'Hiển thị thông báo thêm thành công; {x.n} vừa tạo xuất hiện ngoài danh sách.')
def add_db(x): return ('Kiểm tra lưu đúng vào database',
    f'1. Nhập hợp lệ.\n2. Bấm nút lưu.\n3. Kiểm tra DB:\nselect * from {x.t}\nwhere deleted_at is null\norder by created_at desc\nlimit 1;',
    f'Bản ghi {x.n} được lưu đúng vào hệ thống với đầy đủ giá trị vừa nhập.')
def add_req(x): return ('Kiểm tra lưu thành công khi chỉ nhập các trường bắt buộc',
    '1. Chỉ nhập hợp lệ các trường bắt buộc, bỏ trống các trường không bắt buộc.\n2. Bấm nút lưu.',
    f'Hiển thị thông báo thành công; {x.n} xuất hiện ngoài danh sách, các trường không nhập để trống.')
def add_miss(x): return ('Kiểm tra không nhập các trường bắt buộc',
    '1. Lần lượt bỏ trống (hoặc nhập toàn dấu cách) từng trường bắt buộc.\n2. Bấm nút lưu.',
    'Nút lưu bị vô hiệu hoặc báo lỗi ngay dưới ô tương ứng; không tạo bản ghi nào.')
def add_click(x): return ('Kiểm tra click liên tục vào nút lưu',
    '1. Nhập đầy đủ, hợp lệ.\n2. Bấm chuột liên tục nhiều lần vào nút lưu.',
    'Ngay sau lần bấm đầu tiên, nút chuyển sang trạng thái đang xử lý và tạm thời bị vô hiệu cho tới khi lưu xong; các lần bấm thêm không có tác dụng — chỉ tạo đúng 1 bản ghi, không lưu trùng.')
def add_tab(x): return ('Kiểm tra thao tác bằng Tab + Enter',
    '1. Nhập đầy đủ, hợp lệ.\n2. Dùng phím Tab tới nút lưu rồi nhấn Enter liên tục.',
    'Ngay sau lần Enter đầu tiên, nút tạm thời vô hiệu cho tới khi lưu xong; các lần Enter thêm không có tác dụng — chỉ tạo đúng 1 bản ghi.')
def add_race(x): return ('Kiểm tra nhập trùng cùng lúc từ 2 client',
    f'1. Từ 2 tab (hoặc 2 máy) cùng nhập 1 giá trị giống nhau ở trường không cho phép trùng của {x.n}.\n2. Cùng bấm lưu.',
    'Client thứ nhất lưu thành công; client thứ hai bị chặn kèm thông báo giá trị đã tồn tại — không tạo ra 2 bản ghi trùng.')

def upd_full(x): return ('Kiểm tra cập nhật thành công khi sửa hợp lệ (tối đa độ dài cho phép)',
    '1. Mở biểu mẫu sửa, đổi hợp lệ tất cả các trường, dùng độ dài tối đa cho phép.\n2. Bấm nút lưu thay đổi.',
    f'Hiển thị thông báo cập nhật thành công; {x.n} ngoài danh sách hiển thị theo giá trị mới.')
def upd_db(x): return ('Kiểm tra lưu đúng vào database',
    f'1. Sửa dữ liệu.\n2. Bấm lưu thay đổi.\n3. Kiểm tra DB:\nselect * from {x.t} where id = \'<mã bản ghi>\';',
    f'Bản ghi {x.n} trong hệ thống được cập nhật đúng các giá trị mới; các trường không sửa giữ nguyên.')
def upd_req(x): return ('Kiểm tra cập nhật thành công khi chỉ sửa các trường bắt buộc',
    '1. Chỉ sửa các trường bắt buộc, giữ nguyên các trường còn lại.\n2. Bấm lưu thay đổi.',
    'Cập nhật thành công; chỉ các trường vừa sửa thay đổi, các trường khác giữ nguyên giá trị cũ.')
def upd_miss(x): return ('Kiểm tra không nhập các trường bắt buộc',
    '1. Xóa trống lần lượt từng trường bắt buộc.\n2. Bấm lưu thay đổi.',
    'Nút lưu bị vô hiệu hoặc báo lỗi ngay dưới ô tương ứng; không cập nhật bản ghi.')
def upd_click(x): return ('Kiểm tra click liên tục vào nút lưu thay đổi (chuột)',
    '1. Sửa hợp lệ.\n2. Bấm chuột liên tục nhiều lần vào nút lưu thay đổi.',
    'Ngay sau lần bấm đầu tiên, nút chuyển sang trạng thái đang xử lý và tạm thời vô hiệu cho tới khi lưu xong; các lần bấm thêm không có tác dụng — cập nhật đúng 1 lần.')
def upd_tab(x): return ('Kiểm tra thao tác Tab + Enter liên tục',
    '1. Sửa hợp lệ.\n2. Dùng phím Tab tới nút lưu thay đổi rồi nhấn Enter liên tục.',
    'Ngay sau lần Enter đầu tiên, nút tạm thời vô hiệu cho tới khi lưu xong; các lần Enter thêm không có tác dụng — cập nhật đúng 1 lần.')
def upd_race(x): return ('Kiểm tra sửa trùng cùng lúc từ 2 client',
    f'1. Từ 2 tab (hoặc 2 máy) cùng sửa {x.n} về cùng 1 giá trị đã tồn tại ở trường không cho phép trùng.\n2. Cùng bấm lưu thay đổi.',
    'Client thứ nhất cập nhật thành công; client thứ hai bị chặn kèm thông báo giá trị đã tồn tại.')

def det_open(x): return ('Xem & đóng màn chi tiết',
    f'1. Mở chi tiết 1 {x.n} từ danh sách.\n2. Đóng lại.',
    'Mở đúng chi tiết bản ghi vừa chọn, hiển thị đầy đủ thông tin; đóng lại thì quay về danh sách, giữ nguyên trang và bộ lọc đang xem.')
def det_db(x): return ('Kiểm tra dữ liệu chi tiết khớp DB',
    f'1. Mở chi tiết 1 {x.n}.\n2. Đối chiếu với DB:\nselect * from {x.t} where id = \'<mã bản ghi>\';',
    'Từng thông tin trên màn chi tiết khớp chính xác với dữ liệu trong hệ thống.')

def del_block(x): return ('Chặn xóa khi bản ghi đang được sử dụng',
    f'1. Chọn 1 {x.n} đang được tham chiếu bởi dữ liệu khác.\n2. Bấm xóa.',
    'Không mở hộp thoại xác nhận (hoặc chặn ngay khi xác nhận); hiển thị thông báo bản ghi đang được sử dụng nên không thể xóa; bản ghi vẫn còn trong danh sách.')
def del_ok(x): return ('Xóa thành công bản ghi chưa được sử dụng',
    f'1. Chọn 1 {x.n} chưa bị tham chiếu ở đâu.\n2. Bấm xóa và xác nhận.',
    'Xóa thành công kèm thông báo; bản ghi biến khỏi danh sách và tổng số bản ghi giảm đúng 1.')
def del_db(x): return ('Kiểm tra dữ liệu sau khi xóa khớp DB',
    f'1. Xóa 1 {x.n}.\n2. Kiểm tra DB:\nselect id, deleted_at from {x.t} where id = \'<mã bản ghi>\';',
    'Bản ghi được đánh dấu thời điểm đã xóa (xóa mềm); biến khỏi danh sách nhưng vẫn còn lưu vết trong hệ thống.')
def del_none(x): return ('Xóa bản ghi không tồn tại',
    f'1. Gọi xóa với mã {x.n} không tồn tại (hoặc đã bị xóa ở phiên khác).',
    'Hệ thống báo không tìm thấy bản ghi; không phát sinh lỗi hệ thống, danh sách không đổi.')

def exp_sys(x): return ('Kiểm tra dữ liệu xuất ra khớp hệ thống',
    f'1. Bấm xuất {x.fmt} khi không áp bộ lọc.\n2. Mở file, đối chiếu từng dòng với danh sách trên màn.',
    'Số dòng trong file bằng tổng số bản ghi trên màn; từng cột khớp chính xác; thứ tự sắp xếp giống trên màn.')
def exp_db(x): return ('Kiểm tra danh sách xuất ra khớp với dữ liệu trong DB',
    f'1. Bấm xuất {x.fmt}.\n2. Mở file, đối chiếu với DB:\nselect * from {x.t}\nwhere deleted_at is null\norder by created_at desc;',
    'Số dòng và từng cột trong file khớp chính xác với dữ liệu trong hệ thống; không thừa, không thiếu bản ghi.')
def exp_filter(x): return ('Kiểm tra xuất theo bộ lọc hiện tại',
    f'1. Áp bộ lọc (từ khoá / trạng thái / khoảng thời gian).\n2. Bấm xuất {x.fmt}.',
    'File chỉ chứa dữ liệu đúng theo bộ lọc đang áp, không xuất cả danh sách đầy đủ.')
# 2026-09-09: tiêu đề cũ 'Kiểm tra chặn xuất khi danh sách rỗng' + cột D 'Hiển thị thông báo
# không có dữ liệu để xuất' KHẲNG ĐỊNH hệ thống có chặn. Đo trên màn `Danh mục trình độ ngoại
# ngữ`: nhánh mã màn dùng KHÔNG chặn — nút chỉ bị vô hiệu TRONG LÚC đang xuất; chỉ nhánh `hook`
# của cùng component mới vô hiệu theo `!items.length`. Case khẳng định sai ⇒ chấm F oan.
# Nay ghi NGUYÊN TRẠNG rồi mới đối chiếu, và nêu rõ hai khả năng.
def exp_empty(x): return ('Kiểm tra bấm xuất khi danh sách rỗng',
    f'1. Lọc/nhập từ khoá sao cho danh sách không còn bản ghi nào.\n'
    f'2. Xem nút xuất {x.fmt} có bị vô hiệu hay không.\n3. Bấm xuất {x.fmt}.',
    'Ghi lại nguyên trạng và đối chiếu với thiết kế:\n'
    '- Nếu hệ thống CHẶN: nút bị vô hiệu hoặc báo không có dữ liệu để xuất, không tải file.\n'
    '- Nếu hệ thống KHÔNG chặn: vẫn gửi yêu cầu xuất theo bộ lọc hiện tại — file tải về chỉ có '
    'dòng tiêu đề, không được lỗi và không được xuất sai bộ lọc.')
def exp_big(x): return ('Kiểm tra xuất dữ liệu lớn (nhiều bản ghi)',
    f'1. Chuẩn bị danh sách nhiều bản ghi (từ 1000 trở lên).\n2. Bấm xuất {x.fmt}.\n3. Mở file.',
    'Xuất thành công, đầy đủ và chính xác cả về số lượng lẫn thứ tự; với lượng lớn thì hệ thống xử lý nền rồi trả file khi xong, không treo màn hình.')
# 2026-09-09: tiêu đề cũ 'Kiểm tra giới hạn tần suất xuất' KHẲNG ĐỊNH có cơ chế giới hạn.
# Đo trên màn `Danh mục trình độ ngoại ngữ`: FE KHÔNG có cơ chế nào (chỉ vô hiệu nút trong lúc
# đang xuất). Việc server có chặn hay không là thứ phải HỎI, không phải thứ case tự khẳng định.
def exp_rate(x): return (f'Kiểm tra bấm xuất {x.fmt} liên tiếp nhiều lượt',
    f'1. Bấm xuất {x.fmt} và chờ xong.\n2. Bấm xuất lại ngay lập tức.\n'
    f'3. Lặp lại vài lượt liên tiếp.',
    'Ghi lại nguyên trạng:\n'
    '- Nếu KHÔNG có giới hạn tần suất: mọi lượt đều xuất được, file nào cũng đúng bộ lọc.\n'
    '- Nếu CÓ giới hạn: lượt bị chặn phải hiện thông báo rõ ràng, không thất bại im lặng.\n'
    'Cần xác nhận với dev hệ thống có đặt giới hạn hay không.')
def exp_click(x): return ('Kiểm tra click liên tục vào nút xuất',
    f'1. Bấm liên tục nhiều lần vào nút xuất {x.fmt} trong thời gian ngắn.',
    'Chỉ thực hiện xuất 1 lần và tải về 1 file; các lần bấm thêm bị bỏ qua, không tạo nhiều file trùng.')


def imp_ok(x): return ('Kiểm tra import dữ liệu thành công',
    '1. Tải file mẫu, điền dữ liệu hợp lệ cho một số bản ghi.\n2. Tải file lên và bấm nhập.',
    f'Hiển thị thông báo nhập thành công kèm số bản ghi đã nhập; các {x.n} vừa nhập xuất hiện ngoài danh sách.')
def imp_after(x): return ('Kiểm tra dữ liệu sau khi import thành công',
    '1. Sau khi nhập thành công, mở lại danh sách và mở chi tiết vài bản ghi vừa nhập.',
    'Từng cột dữ liệu khớp đúng với nội dung trong file; không lệch cột, không mất dấu tiếng Việt, '
    'không tự thêm hay bớt bản ghi.')
def imp_db(x): return ('Kiểm tra lưu vào đúng database',
    f'1. Nhập file thành công.\n2. Kiểm tra DB:\nselect * from {x.t}\nwhere deleted_at is null\norder by created_at desc;',
    f'Các bản ghi {x.n} được lưu đúng vào hệ thống, gán đúng đơn vị theo phiên đăng nhập, số lượng bằng số dòng hợp lệ trong file.')
def imp_click(x): return ('Kiểm tra nhấn liên tục nút Nhập (chuột)',
    '1. Tải file lên.\n2. Bấm chuột liên tục nhiều lần vào nút nhập.',
    'Ngay sau lần bấm đầu tiên, nút chuyển sang trạng thái đang xử lý và tạm thời bị vô hiệu cho tới khi xong; '
    'chỉ nhập đúng 1 lần, không nhập trùng bản ghi.')
def imp_tab(x): return ('Kiểm tra thao tác Tab + Enter liên tục',
    '1. Tải file lên.\n2. Dùng phím Tab tới nút nhập rồi nhấn Enter liên tục.',
    'Ngay sau lần Enter đầu tiên, nút tạm thời vô hiệu cho tới khi xử lý xong; các lần Enter thêm không có tác dụng '
    '— chỉ nhập 1 lần, không nhập trùng.')
def imp_fail(x): return ('Kiểm tra import dữ liệu thất bại (bỏ trống trường bắt buộc)',
    '1. Trong file mẫu, bỏ trống một trường bắt buộc ở vài dòng.\n2. Tải lên và bấm nhập.',
    'Hệ thống báo lỗi rõ từng dòng kèm số dòng và tên trường thiếu; các dòng lỗi KHÔNG được lưu.')
def imp_dup(x): return ('Kiểm tra file có từ 2 bản ghi TRÙNG khoá trong cùng file',
    '1. Trong file, để 2 dòng trùng nhau ở trường không cho phép trùng.\n2. Tải lên và bấm nhập.',
    'Hệ thống phát hiện trùng ngay trong file, báo rõ các dòng trùng; không tạo ra 2 bản ghi trùng nhau.')
def imp_manyerr(x): return ('Kiểm tra file có từ 2 bản ghi bị lỗi',
    '1. Trong file, tạo nhiều dòng lỗi khác loại nhau (thiếu trường, sai định dạng, sai kiểu dữ liệu).\n'
    '2. Tải lên và bấm nhập.',
    'Hệ thống liệt kê ĐẦY ĐỦ mọi dòng lỗi kèm lý do từng dòng (không chỉ báo dòng lỗi đầu tiên); '
    'nêu rõ số dòng nhập được và số dòng bị bỏ.')
def imp_many(x): return ('Kiểm tra import nhiều bản ghi (trong ngưỡng cho phép)',
    '1. Chuẩn bị file có số dòng gần bằng ngưỡng tối đa cho phép.\n2. Tải lên và bấm nhập.',
    'Nhập thành công đầy đủ, đúng số lượng; thời gian xử lý trong mức chấp nhận được và không treo màn hình.')
def imp_over(x): return ('Kiểm tra file vượt ngưỡng số dòng (xử lý nền)',
    '1. Chuẩn bị file có số dòng VƯỢT ngưỡng cho phép.\n2. Tải lên và bấm nhập.',
    'Hệ thống hoặc chặn kèm thông báo nêu rõ ngưỡng tối đa, hoặc chuyển sang xử lý nền và thông báo khi xong; '
    'không treo và không nhập một phần rồi dừng giữa chừng.')


SPEC = {
    # `ds_stat` ĐÃ GỠ khỏi SPEC 2026-09-09 (chỉ thị người đặt việc) — giữ hàm để tra lịch sử.
    # Case "số liệu thống kê khớp DB" TRÙNG hai chỗ đã có: mục *số lượng bản ghi* của nhóm
    # `Danh sách …` ở khối Validate (đếm và đối chiếu tổng số bản ghi trên màn) và mục `ds_db`
    # ngay trên (đối chiếu DB). Thêm nữa nó KHẲNG ĐỊNH màn có "các ô thống kê ở đầu màn" —
    # màn không có KPI thì là case chết; màn CÓ KPI thì thẻ là CONTROL, khai nhóm riêng ở
    # khối Validate. `audit_func.DS` đã bỏ mục tương ứng nên rà và bơm không lệch nhau.
    # ⚠️ 2026-09-10 — BỎ HẲN mục `Tải danh sách mặc định` (chỉ thị người đặt việc *"Bỏ case
    # Tải danh sách mặc định"*). Case này không kiểm được gì mà `Kiểm tra hiển thị đầy đủ các
    # thông tin trong màn hình chức năng` (khối Giao diện) và `Kiểm tra dữ liệu danh sách khớp
    # DB` chưa kiểm: mở màn ra thấy danh sách là điều kiện TIÊN QUYẾT của mọi case khác, hỏng
    # thì cả CN chết chứ không riêng nó. Hàm `ds_default` giữ lại để đọc hiểu lịch sử nhưng
    # KHÔNG còn được bơm; `audit_extra` phép ⑭ bắt nếu script cũ tái sinh nó.
    # ⚠️ Thứ tự trong danh sách = thứ tự case sinh ra. `ds_db` (dữ liệu bảng) TRƯỚC,
    # `ds_kpi_db` (số liệu thẻ) SAU — đúng thứ tự của mẫu `Admin/TaiKhoan`.
    # Khoá của `ds_kpi_db` phải HẸP (`the kpi` / `so lieu thong ke`): để lọt khoá rộng
    # kiểu `khop db` thì nó khớp luôn case `ds_db` ngay trên và không bao giờ sinh.
    'Danh sách':        [(['khop db', 'trong db', 'khop du lieu', 'khop voi du lieu', 'dung database', 'khop he thong'], ds_db),
                         (['the kpi', 'so lieu thong ke', 'the thong ke', 'the so lieu'], ds_kpi_db)],
    # NHÓM `Tìm kiếm chung` ĐÃ NHƯỜNG HẲN cho `patch_timkiemchung.py` (2026-09-08) — hoàn tất
    # bộ ba: `Tìm kiếm chung` · `Tìm kiếm đơn lẻ` · `Tìm kiếm kết hợp` đều do patcher CHUYÊN
    # TRÁCH sinh. Lý do: bộ này chạy TRƯỚC nên tiêu đề RÚT NGẮN của nó (`Tìm kiếm không ra kết
    # quả`) luôn thắng bank đúng mẫu của `patch_timkiemchung`
    # (`Tìm kiếm không ra kết quả với từng điều kiện tìm kiếm hoặc tất cả các điều kiện`), và
    # `patch_timkiemchung` thấy từ khoá 'khong ra ket qua' đã có nên không bù nữa ⇒ MỌI bộ case
    # sinh bằng tool_v2 đều mang tiêu đề rút ngắn. Đo trên `QuanTri/TrinhDoDaoTao`, phải sửa tay.
    # NHÓM `Tìm kiếm kết hợp` ĐÃ NHƯỜNG HẲN cho `patch_kethop.py` (2026-09-08) — cùng lối đã áp
    # cho `Tìm kiếm đơn lẻ`/`patch_timkiem_donle.py`. Lý do: bộ này chạy TRƯỚC `patch_kethop` và
    # không biết tên các bộ lọc, nên chỉ sinh được case CHUNG CHUNG; sau đó `patch_kethop` sinh
    # case tổ hợp CỤ THỂ (`Kết hợp: <A> + <B>` kèm giá trị thật + SQL thật) ⇒ 2 case nói cùng một
    # việc. Đo 2026-09-08 trên `QuanTri/TrinhDoDaoTao`: case 126 (`tkk_db`) trùng case 127
    # (`Kết hợp: …`). Nay `patch_kethop` gánh luôn mục đối chiếu DB (gắn vào chính case tổ hợp
    # đầy đủ nhất), nên `audit_func` TKK vẫn đủ 2 mục.
    'Thêm mới':         [(['thanh cong khi nhap day du', 'toi da do dai', 'day du cac truong'], add_full),
                         (['dung vao database', 'dung database', 'khop db', 'trong db', 'khop voi du lieu', 'luu dung'], add_db),
                         (['chi nhap cac truong bat buoc', 'chi cac truong bat buoc', 'chi nhap truong bat buoc'], add_req),
                         (['khong nhap cac truong bat buoc', 'bo trong truong bat buoc', 'thieu truong bat buoc'], add_miss),
                         (['lien tuc'], add_click), (['tab + enter', 'tab va enter'], add_tab),
                         (['2 client', 'hai client', 'dong thoi'], add_race)],
    'Cập nhật':         [(['thanh cong khi sua', 'toi da do dai', 'sua hop le'], upd_full),
                         (['dung vao database', 'dung database', 'khop db', 'trong db', 'khop voi du lieu', 'luu dung'], upd_db),
                         (['chi sua cac truong bat buoc', 'chi cac truong bat buoc', 'chi nhap truong bat buoc'], upd_req),
                         (['khong nhap cac truong bat buoc', 'bo trong truong bat buoc', 'thieu truong bat buoc'], upd_miss),
                         (['lien tuc'], upd_click), (['tab + enter', 'tab va enter'], upd_tab),
                         (['2 client', 'hai client', 'dong thoi'], upd_race)],
    'Xem chi tiết':     [(['xem ', 'mo ', 'dong '], det_open),
                         (['khop db', 'trong db', 'khop du lieu', 'khop voi du lieu', 'khop he thong', 'dung database'], det_db)],
    'Xóa':              [(['chan xoa', 'dang dung', 'su dung', 'tham chieu', 'rang buoc', 'lien quan'], del_block),
                         (['xoa mem', 'xoa thanh cong', 'xoa vinh vien', 'xoa 1 ', 'xoa mot'], del_ok),
                         (['khop db', 'trong db', 'khop du lieu', 'khop voi du lieu', 'dung database'], del_db),
                         (['khong ton tai', 'da bi xoa', 'da xoa'], del_none)],
    'Xuất Excel':       [(['khop he thong', 'khop man hinh', 'khop danh sach'], exp_sys),
                         (['khop db', 'trong db', 'khop du lieu', 'khop voi du lieu', 'dung database'], exp_db),
                         (['bo loc', 'dieu kien loc', 'theo loc', 'dang ap dung'], exp_filter),
                         (['rong', 'khong co du lieu', 'khong co ban ghi'], exp_empty),
                         (['du lieu lon', 'nhieu ban ghi', 'khong gioi han theo trang'], exp_big),
                         (['tan suat', 'gioi han xuat', 'lien tiep'], exp_rate),
                         (['lien tuc'], exp_click)],
    'Nhập Excel':       [(['import thanh cong', 'nhap thanh cong', 'nhap du lieu thanh cong'], imp_ok),
                         (['sau khi import', 'sau import', 'du lieu sau'], imp_after),
                         (['dung database', 'trong db', 'khop db', 'dung vao database'], imp_db),
                         (['lien tuc'], imp_click), (['tab + enter', 'tab va enter'], imp_tab),
                         (['that bai', 'bo trong', 'thieu truong'], imp_fail),
                         (['trung'], imp_dup),
                         (['ban ghi bi loi', 'ban ghi loi', 'nhieu dong loi', 'dong loi'], imp_manyerr),
                         (['nhieu ban ghi', 'so luong'], imp_many),
                         (['chay nen', 'vuot nguong', 'file lon', '> 200'], imp_over)],
}


def kind(sub):
    """Phân loại nhóm chức năng. Neo theo ĐỘNG TỪ ĐẦU tên nhóm (bỏ tiền tố 'Chức năng'),
    vì nhiều file đặt tên nhóm không có tiền tố đó. Loại trừ các cụm dễ khớp nhầm:
    'Đăng xuất', 'Xuất bản', 'Đăng bài', 'Lưu trữ', 'Chặn ...', 'Đóng ...', 'Hủy ...'."""
    n = re.sub(r'^chuc nang\s*', '', norm(sub)).strip()
    if not n or '/' in n:
        return None                                   # nhóm ghép nhiều thao tác
    if n.startswith(('dang xuat', 'dang nhap', 'dang bai', 'xuat ban', 'luu tru', 'luu nhap',
                     'luu tam', 'chan ', 'dong ', 'huy', 'doi mat khau', 'dieu huong')):
        return None
    if 'don le' in n:
        return None                                   # 'Tìm kiếm đơn lẻ' chỉ là nhóm chứa sub2
    if 'ket hop' in n:
        return None      # `patch_kethop.py` gánh nhóm này (xem chú thích ở SPEC)
    if n.startswith('tim kiem') or n.startswith('tra cuu'):
        return None      # `patch_timkiemchung.py` gánh nhóm này (xem chú thích ở SPEC)
    if 'danh sach' in n:
        return 'Danh sách'
    if 'chi tiet' in n:
        return 'Xem chi tiết'
    if n.startswith(('them', 'tao', 'khoi tao', 'khai bao')):
        return 'Thêm mới'
    if n.startswith(('cap nhat', 'chinh sua', 'sua', 'luu', 'ghi nhan')):
        return 'Cập nhật'
    if n.startswith('xoa'):
        return 'Xóa'
    if 'nhap excel' in n or 'nhap file' in n or n.startswith('import') or 'nhap tu file' in n:
        return 'Nhập Excel'
    if n.startswith('xuat') or n.startswith('tai ve'):
        return 'Xuất Excel'
    return None


def locked(p):
    return os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % os.path.basename(p)))


def targets():
    """(path, key, bp, nhieu_sheet) cho tung sheet BP cua tung file trong role."""
    for path in sorted(glob.glob(D + '*.xlsx')):
        base = os.path.basename(path)
        if base in CFG['skip']:
            continue
        key = base.replace(CFG['strip'], '').replace('.xlsx', '')
        if ONLY and ONLY.lower() not in key.lower():
            continue
        if locked(path):
            print('  %-30s ⛔ ĐANG MỞ — bỏ qua' % key); continue
        sheets = tcfix.load(path).bpsheets
        for bp in sheets:
            yield path, key, bp, len(sheets) > 1


grand = 0
for path, key, bp, multi in targets():
    x = Ctx(key)
    tc = tcfix.load(path, bp=bp)
    add_after = {}
    ingrp = False; cur = None; cases = []; anchor = None; n_added = 0
    # Nhãn thẻ KPI của CN ĐANG duyệt. Gom được vì trong mỗi CN khối `Validate` (nơi khai nhóm
    # thẻ) luôn đứng TRƯỚC khối `Chức năng` (nơi cần dẫn tên thẻ ra).
    cn_kpi = []

    def flush():
        global n_added
        if not cur: return
        k = kind(cur)
        if not k: return
        x.scope(cur)
        x.kpi = list(cn_kpi)
        if k == 'Xuất Excel':
            up = cur.upper()
            x.fmt = next((f for f in ('CSV', 'PDF', 'WORD', 'EXCEL') if f in up), 'EXCEL')
            x.fmt = {'EXCEL': 'Excel', 'WORD': 'Word'}.get(x.fmt, x.fmt)
        j = [norm(c) for c in cases]
        # `mk(x)` trả `None` = khuôn CÓ ĐIỀU KIỆN và điều kiện không thoả (vd `ds_kpi_db` khi
        # CN không có thẻ KPI nào) -> bỏ qua, KHÔNG sinh case chết.
        news = [t + (x.note,) for kws, mk in SPEC[k]
                if not any(any(w in s for w in kws) for s in j)
                for t in [mk(x)] if t]
        if news:
            add_after.setdefault(anchor, []).extend(news)
            n_added += len(news)

    for rn in tc.order:
        if rn < 12: continue
        B, C = tc.c(rn, 'B'), tc.c(rn, 'C')
        lv = tc.lvl(rn)
        if not C:
            # Dòng nhóm thẻ KPI: ghi nhận nhãn TRƯỚC mọi nhánh khác (nhóm thẻ nằm ở cấp
            # `sub`/`sub2` tuỳ màn nên không khoá theo cấp).
            _k = qalib.nhan_the_kpi(B)
            if _k and _k not in cn_kpi:
                cn_kpi.append(_k)
            if lv == 'cn':
                # `flush()` TRƯỚC rồi mới dọn `cn_kpi`: nhóm cuối của CN trước còn cần danh
                # sách thẻ của CHÍNH CN đó.
                flush(); ingrp = False; cur = None; cases = []; cn_kpi = []
            elif lv == 'grp':
                flush(); ingrp = norm(B).startswith('chuc nang'); cur = None; cases = []
            elif lv == 'sub':
                flush(); cur = B if ingrp else None; cases = []; anchor = rn
            # sub2 dưới 1 nhóm Chức năng: giữ nguyên nhóm cha, chỉ không dời mốc chèn
        else:
            cases.append(B)
            if cur and tc.lvl(rn - 1) != 'sub2':
                pass
    flush()
    if not add_after: continue

    # mốc chèn = dòng case trực tiếp cuối cùng của nhóm (nếu không có thì ngay sau header)
    real = {}
    for a, lst in add_after.items():
        last = a
        for rn in tc.order:
            if rn <= a: continue
            if tc.c(rn, 'C'): last = rn
            else: break
        real.setdefault(last, []).extend(lst)

    p = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12: continue
        p.keep(rn)
        for (md, bc, kq, note) in real.get(rn, []):
            p.case(md, bc, kq, ghi_chu=note if ('select ' in bc and note) else None)
    tc.rebuild(p).save(quiet=True, sync=not multi)
    n, errs = tcfix.verify(path)
    lbl = key if not multi else '%s/%s' % (key, bp)
    print('  %-30s +%3d case → %4d | %s' % (lbl, n_added, n, 'OK' if not errs else errs))
    grand += n_added

print('\n=== ĐÃ BỔ SUNG %d CASE CHỨC NĂNG ===' % grand)
