# -*- coding: utf-8 -*-
"""BƯỚC A6 của màn "Cảnh báo Mâu thuẫn" — phần tool KHÔNG làm thay được.

HDSD §3 A6: sau khi khung đã sạch 13 bộ rà, phải sửa TAY cột C/D theo dữ kiện đã ground
(thông báo verbatim · giới hạn thật · hành vi thật của FE) và gắn cờ cho chỗ chưa chốt được.
Script chỉ ghi ĐÈ cột C/D/T của những case KHỚP LUẬT bên dưới — KHÔNG thêm/xoá/đổi tên case,
nên mã case và lớp công thức không đổi. Chạy lại được nhiều lần (idempotent).

Khai theo LUẬT KHỚP NỘI DUNG `(sheet, tên CN, tên nhóm, tiêu đề case)` như `a6-BaoCaoDong.py`
(KHÔNG khoá theo số dòng — đổi khung là lệch hết). Lưới chắn: luật nào khớp 0 case thì script
DỪNG, và mọi phép ghi đi qua `qalib.a6_chan_ghi` để không rò code / không lạc mục đích.

Căn cứ: hồ sơ màn `Testcase-Role-ChuyenVien-CanhBaoMauThuan.json` khoá `grounding`
(+ nhánh `grounding_man_chi_tiet` cho màn phụ `/conflict-alerts/:id`).

    python3 a6-CanhBaoMauThuan.py            # XEM TRƯỚC
    python3 a6-CanhBaoMauThuan.py --apply    # ghi
    python3 a6-CanhBaoMauThuan.py --chi-tiet # in cả tiêu đề từng case bị sửa
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
    HERE, '..', 'testcase', 'Testcase-Role-ChuyenVien-CanhBaoMauThuan.xlsx'))

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


TUY_CHON = set()        # chỉ số luật được phép khớp 0 case — xem `ro()` ngay dưới


def r(sheet, cn, nhom, tieu_de, C=None, D=None, T=None):
    LUAT.append((sheet, cn, nhom, tieu_de, C, D, T))


def ro(sheet, cn, nhom, tieu_de, C=None, D=None, T=None):
    """Như `r()` nhưng luật được phép KHỚP 0 CASE mà không làm script DỪNG.

    Chỉ dùng cho luật bám vào một ĐỜI tiêu đề case. Đo 2026-09-14: bộ case đang giao sinh ra
    TRƯỚC khi có bank `SELECTBOX_MULTI`, nên nhóm `Selectbox Đơn vị` mang tiêu đề của ô chọn
    ĐƠN (`chọn các giá trị khác nhau` · `hiển thị … khi giá trị quá dài`); chuỗi sinh mới nay
    ra tiêu đề của ô chọn NHIỀU (`chọn NHIỀU giá trị` · `… khi chọn nhiều hoặc giá trị quá
    dài`). Một script A6 phải chạy được trên CẢ HAI đời file, nên hai luật này khai `ro()`.
    ⛔ ĐỪNG dùng `ro()` để làm im một luật gõ sai tên — lưới chắn 0-case là thứ bắt lỗi gõ.
    """
    TUY_CHON.add(len(LUAT))
    LUAT.append((sheet, cn, nhom, tieu_de, C, D, T))


BP = None      # file MỘT sheet -> không lọc theo tên sheet

# ══════════════════ LUẬT HẸP — khai TRƯỚC luật rộng cùng nhóm ══════════════════
# Chỉ nối dữ kiện `grounding` KHÔNG vướng luật cứng UI (§0a): ô chọn ở biểu mẫu do luật cứng
# chốt chữ `-- Chọn --`, ô số bản ghi/trang chốt 20 — không ghi đè bằng giá trị màn thật.

# ── Bảng danh sách: chữ lỗi tải + giá trị 2 cột dễ đọc nhầm ───────────────────────────────
r(BP, 'danh sach canh bao mau thuan', 'danh sach canh bao mau thuan', 'gia tri mac dinh', None,
  'Bảng hiện các bản ghi mâu thuẫn do máy chủ trả về theo trang đầu. Gọi hỏng thì hiện '
  '"Không tải được danh sách cảnh báo mâu thuẫn", danh sách cũ trên màn không bị xoá trắng. '
  'Truy vấn quá lâu thì hiện "Truy vấn quá thời gian chờ. Thử thu hẹp khoảng thời gian hoặc '
  'bấm Làm mới.".')
r(BP, 'danh sach canh bao mau thuan', 'danh sach canh bao mau thuan',
  'hien thi dung cot', None,
  'Cột "Tập dữ liệu" hiện "<tên tệp> (+{N})" khi bản ghi dính nhiều tệp, "Lô <8 ký tự đầu mã '
  'lô>" khi không có tên tệp, "Tự mâu thuẫn" khi không có cả hai. Cột "Đơn vị" hiện '
  '"<đơn vị thắng> / vs <đơn vị thua> (+{N})", hoặc "Cùng nguồn tự mâu thuẫn", hoặc '
  '"Chưa cấu hình thứ tự ưu tiên nguồn". Thời gian theo dạng "d/m/yyyy HH:mm".')
r(BP, 'danh sach canh bao mau thuan', 'danh sach canh bao mau thuan', 'do rong cac cot', None,
  'Cột co giãn theo bề ngang cửa sổ: "Bảng dữ liệu" và "Đơn vị" ẩn dưới 768px, '
  '"Thời gian ghi lỗi" ẩn dưới 1024px.')

# ── Nút Làm mới dữ liệu ───────────────────────────────────────────────────────────────────
r(BP, 'danh sach canh bao mau thuan', 'button lam moi du lieu', 'hieu ung loading', None,
  'Trong lúc tải, bảng đổi thành khung xương 8 dòng và dòng mô tả đầu màn thành "Đang tải...".')
r(BP, 'danh sach canh bao mau thuan', 'button lam moi du lieu', 'mat ket noi mang', None,
  'Danh sách cũ trên màn không bị xoá trắng. Số liệu đầu màn hỏng thì dòng mô tả thành '
  '"Không tải được số liệu", danh sách hỏng thì hiện "Không tải được danh sách". Hai lời gọi '
  'độc lập nên một cái hỏng không kéo cái kia.')

# ── Ô số bản ghi/trang: 2 thông báo lỗi verbatim ──────────────────────────────────────────
r(BP, None, 'textbox so ban ghi', 'nhap 0 vao o so ban ghi', None,
  'Hiện dòng chữ đỏ "Số bản ghi/trang phải lớn hơn 0". Danh sách giữ nguyên số bản ghi đang áp.')
r(BP, None, 'textbox so ban ghi', 'nhap ky tu khac so', None,
  'Ô không nhận ký tự khác số. Nhập số lẻ thì hiện dòng chữ đỏ "Số bản ghi/trang phải là số '
  'nguyên".')

# ── Ô lọc Đơn vị là MULTI-select ──────────────────────────────────────────────────────────
ro(BP, 'tim kiem & loc canh bao mau thuan', 'selectbox don vi',
  'chon cac gia tri khac nhau', None,
  'Ô này chọn được NHIỀU giá trị. Hiện tối đa 4 thẻ rồi rút thành "... {N} lựa chọn". Có các '
  'nút bên trong là "Chỉ xem đã chọn" và "Xem tất cả". Bấm lại đúng lựa chọn đang chọn thì bỏ '
  'chọn nó.')
ro(BP, 'tim kiem & loc canh bao mau thuan', 'selectbox don vi',
  'hien thi don vi khi gia tri qua dai', None,
  'Thẻ đã chọn không làm ô giãn rộng: quá các thẻ thì phần còn lại rút thành "... {N} lựa '
  'chọn".')

# Cùng nội dung, cho ĐỜI TIÊU ĐỀ MỚI do bank `SELECTBOX_MULTI` sinh ra.
ro(BP, 'tim kiem & loc canh bao mau thuan', 'selectbox don vi',
   'chon nhieu gia tri', None,
   'Ô này chọn được NHIỀU giá trị. Hiện tối đa 4 thẻ rồi rút thành "... {N} lựa chọn". Có hai '
   'nút bên trong là "Chỉ xem đã chọn" và "Xem tất cả". Bấm lại đúng lựa chọn đang chọn thì bỏ '
   'chọn nó.')
ro(BP, 'tim kiem & loc canh bao mau thuan', 'selectbox don vi',
   'hien thi don vi khi chon nhieu hoac gia tri qua dai', None,
   'Thẻ đã chọn không làm ô giãn rộng: quá 4 thẻ thì phần còn lại rút thành "... {N} lựa chọn".')

# ── Màn phụ: Breadcrumb · nút Quay lại · 4 thẻ số liệu · Nguyên nhân tổng quan ────────────
r(BP, 'xem chi tiet mau thuan', 'breadcrumb', 'hien thi du cap', None,
  'Breadcrumb hiện đủ ba cấp "Quản lý dữ liệu > Dữ liệu mâu thuẫn > <tiêu đề màn>". Tiêu đề '
  'màn là tên tệp, không có tệp thì "Bảng <bảng đích>", không có cả hai thì "Lô <8 ký tự đầu '
  'mã lô>".')
r(BP, 'xem chi tiet mau thuan', 'the so lieu tong so ban ghi mau thuan', 'gia tri mac dinh',
  None,
  'Thẻ "TỔNG SỐ BẢN GHI MÂU THUẪN" hiện số bản ghi có từ 2 nguồn khai khác giá trị, kèm dòng '
  'giải thích "Bản ghi có ≥2 nguồn khai khác giá trị".')
r(BP, 'xem chi tiet mau thuan', 'the so lieu bang dich', 'khi khong co du lieu', None,
  'Thẻ "BẢNG ĐÍCH" hiện dấu "—" khi không có bảng nào, hiện "<N> bảng" khi có nhiều bảng.')
r(BP, 'xem chi tiet mau thuan', 'the so lieu so nguon lien quan', 'gia tri mac dinh', None,
  'Thẻ "SỐ NGUỒN LIÊN QUAN" hiện số đơn vị có bản ghi tham gia mâu thuẫn, kèm dòng giải thích '
  '"Đơn vị có bản ghi tham gia mâu thuẫn".')
r(BP, 'xem chi tiet mau thuan', 'the so lieu thoi gian phat hien gan nhat', 'gia tri mac dinh',
  None,
  'Thẻ "THỜI GIAN PHÁT HIỆN GẦN NHẤT" hiện thời điểm bản ghi mâu thuẫn mới nhất trong lô, theo '
  'dạng "d/m/yyyy HH:mm".')
r(BP, 'xem chi tiet mau thuan', 'nguyen nhan tong quan', 'khop du lieu trong he thong', None,
  'Câu nguyên nhân đổi theo loại mâu thuẫn. Một bản ghi tự mâu thuẫn thì hiện "Phát hiện 1 bản '
  'ghi tự mâu thuẫn: nguồn <nguồn> tự gửi nhiều giá trị khác nhau cho cùng một đối tượng.". '
  'Nhiều bản ghi khác nguồn thì hiện "Phát hiện <N> bản ghi có giá trị khác nhau giữa các '
  'nguồn khi ghi vào <bảng đích>".',
  '✿✿ [CẦN VERIFY] Chỗ giữ <bảng đích> lấy từ hồ sơ màn (BA + chunk FE); cần dev/BA xác nhận '
  'câu hiển thị khi lô có NHIỀU bảng đích.')
r(BP, 'xem chi tiet mau thuan', 'danh sach ban ghi mau thuan', 'khi khong co du lieu', None,
  'Bảng không có dữ liệu thì hiện dòng chữ "Lô này hiện không còn bản ghi nào bị mâu thuẫn '
  'dữ liệu.".')
r(BP, 'xem chi tiet mau thuan', 'danh sach ban ghi mau thuan', 'hien thi dung cot', None,
  'Cột "Nguồn thắng" hiện tên nguồn thắng, hoặc nhãn cảnh báo "Chưa xác định nguồn thắng". '
  'Cột "Nguồn xung đột" hiện "<nguồn 1>, <nguồn 2> (+N)", không có nguồn nào thì hiện "—". '
  'Bản ghi tự mâu thuẫn thì cột đầu đổi nhãn thành "Tập dữ liệu".')

# ── Hộp thoại ma trận ─────────────────────────────────────────────────────────────────────
r(BP, 'xem ma tran mau thuan', 'ma tran gia tri mau thuan', 'khop du lieu trong he thong', None,
  'Mỗi CỘT là một trường xung đột, mỗi DÒNG là một nguồn. Đầu hộp thoại hiện '
  '"Định danh: <danh sách khoá: giá trị>". Giá trị định danh dài quá 24 ký tự bị cắt còn 16 ký '
  'tự kèm dấu ba chấm.')
r(BP, 'xem ma tran mau thuan', 'ma tran gia tri mau thuan', 'khi du lieu qua dai', None,
  'Dữ liệu quá dài không phá khung ma trận: giá trị định danh dài quá 24 ký tự bị cắt còn 16 '
  'ký tự kèm dấu ba chấm, phần còn lại xem bằng tooltip.')
r(BP, 'xem ma tran mau thuan', 'danh sach gia tri theo nguon', 'khi khong co du lieu', None,
  'Không có dữ liệu thì bảng hiện dòng chữ "Lô này hiện không còn bản ghi nào bị mâu thuẫn '
  'dữ liệu.".')

# ── Bốn thẻ số liệu: hai bản chữ dùng chung, nhưng phải khai RỜI cho TỪNG thẻ ─────────────
# Hai đoạn này trước nằm rời trong file .xlsx, không script nào sinh lại được — nay đưa về đây
# kèm bản đã gọt cho vừa ngưỡng ⑳ (205 -> 159 và 191 -> 173 ký tự phần thuật), giữ đủ mọi ý.
# ⚠️ KHÔNG gộp thành một luật `nhom='the so lieu'`: lưới chắn `qalib.soi_luat_trum` chặn đúng
# kiểu đó (một luật trùm 4 mục đích khác nhau) — bài học "luật A6 trùm nhiều mục đích".
r(BP, 'xem chi tiet mau thuan', 'the so lieu tong so ban ghi mau thuan', 'gia tri lon hoac qua dai', None,
  'Số lớn có phân cách nghìn. Giá trị dài cắt gọn hoặc xuống dòng trong khung thẻ, không tràn '
  'ra ngoài và không đẩy lệch thẻ khác. Màn hẹp thì các thẻ xuống hàng.')
r(BP, 'xem chi tiet mau thuan', 'the so lieu bang dich', 'gia tri lon hoac qua dai', None,
  'Số lớn có phân cách nghìn. Giá trị dài cắt gọn hoặc xuống dòng trong khung thẻ, không tràn '
  'ra ngoài và không đẩy lệch thẻ khác. Màn hẹp thì các thẻ xuống hàng.')
r(BP, 'xem chi tiet mau thuan', 'the so lieu so nguon lien quan', 'gia tri lon hoac qua dai', None,
  'Số lớn có phân cách nghìn. Giá trị dài cắt gọn hoặc xuống dòng trong khung thẻ, không tràn '
  'ra ngoài và không đẩy lệch thẻ khác. Màn hẹp thì các thẻ xuống hàng.')
r(BP, 'xem chi tiet mau thuan', 'the so lieu thoi gian phat hien gan nhat', 'gia tri lon hoac qua dai', None,
  'Số lớn có phân cách nghìn. Giá trị dài cắt gọn hoặc xuống dòng trong khung thẻ, không tràn '
  'ra ngoài và không đẩy lệch thẻ khác. Màn hẹp thì các thẻ xuống hàng.')
r(BP, 'xem chi tiet mau thuan', 'the so lieu tong so ban ghi mau thuan', 'khi khong co du lieu', None,
  '1. Lúc đang tải, thẻ hiện khung xương thay cho nhãn và giá trị, không hiện số 0 giả.\n'
  '2. Thiếu dữ kiện thì thẻ hiện dấu "—" hoặc 0 theo quy ước của thẻ, không hiện chữ kỹ thuật.')
r(BP, 'xem chi tiet mau thuan', 'the so lieu so nguon lien quan', 'khi khong co du lieu', None,
  '1. Lúc đang tải, thẻ hiện khung xương thay cho nhãn và giá trị, không hiện số 0 giả.\n'
  '2. Thiếu dữ kiện thì thẻ hiện dấu "—" hoặc 0 theo quy ước của thẻ, không hiện chữ kỹ thuật.')
r(BP, 'xem chi tiet mau thuan', 'the so lieu thoi gian phat hien gan nhat', 'khi khong co du lieu', None,
  '1. Lúc đang tải, thẻ hiện khung xương thay cho nhãn và giá trị, không hiện số 0 giả.\n'
  '2. Thiếu dữ kiện thì thẻ hiện dấu "—" hoặc 0 theo quy ước của thẻ, không hiện chữ kỹ thuật.')


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
    # Luật khai bằng `ro()` được phép khớp 0 case (bám một ĐỜI tiêu đề) — xem chú thích ở `ro()`.
    treo = [i for i in range(len(LUAT)) if not dung.get(i) and i not in TUY_CHON]
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
    print('\n=== A6 Cảnh báo Mâu thuẫn: %d luật · %d case sửa cột C/D · %d case ghi cột T ==='
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
    qalib.backup(XLSX, tag='truoc_a6_canhbaomauthuan')
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
