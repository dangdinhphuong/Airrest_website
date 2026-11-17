# -*- coding: utf-8 -*-
"""Rà độ ĐẦY ĐỦ NỘI DUNG từng nhóm control so với checklist chuẩn của mau.xlsx."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, glob, os, re, unicodedata

def norm(s):
    s = (s or '').lower().replace('\u0111', 'd')      # đ -> d (NFD không tách được ký tự này)
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')

# (nhãn, [từ khoá nhận diện]) — case coi là "có" nếu tiêu đề chứa MỘT trong các từ khoá
TEXTBOX = [
    ('mặc định',        ['gia tri mac dinh']),
    # 'khi de trong' = wording TRUNG TÍNH của `quota_cases.NUMBOX` từ 2026-09-09: tiêu đề cũ
    # 'là trường bắt buộc' KHẲNG ĐỊNH ô là bắt buộc, sai với ô KHÔNG bắt buộc (đo trên ô
    # `Thứ tự hiển thị` của màn `Danh mục trình độ ngoại ngữ`). Không nhận từ khoá mới thì
    # phép rà theo TỪ KHOÁ này báo thiếu mục 'bắt buộc' oan.
    ('bắt buộc',        ['bat buoc', 'khi de trong']),
    ('> N ký tự',       ['> 25', '>25', 'qua ', 'vuot ', 'gioi han', 'do dai', 'rat dai', 'khong gioi han']),
    ('ký tự đặc biệt',  ['ky tu dac biet', 'the html', 'script']),
    ('nhập số',         ['nhap so']),
    ('Trim space',      ['trim', 'khoang trang', 'dau cach']),
    ('copy-paste',      ['copy', 'paste', 'dan (']),
    ('tiếng Việt dấu',  ['tieng viet']),
]
TEXTAREA = [
    ('mặc định',        ['gia tri mac dinh']),
    # 'khi de trong' = wording TRUNG TÍNH của `quota_cases.NUMBOX` từ 2026-09-09: tiêu đề cũ
    # 'là trường bắt buộc' KHẲNG ĐỊNH ô là bắt buộc, sai với ô KHÔNG bắt buộc (đo trên ô
    # `Thứ tự hiển thị` của màn `Danh mục trình độ ngoại ngữ`). Không nhận từ khoá mới thì
    # phép rà theo TỪ KHOÁ này báo thiếu mục 'bắt buộc' oan.
    ('bắt buộc',        ['bat buoc', 'khi de trong']),
    ('nhiều dòng',      ['nhieu dong', 'xuong dong']),
    ('nội dung rất dài',['rat dai', 'khong gioi han', 'do dai']),
    ('ký tự đặc biệt',  ['ky tu dac biet', 'the html', 'script']),
    ('Trim space',      ['trim', 'khoang trang', 'dau cach']),
]
SELECTBOX = [
    ('mặc định',        ['gia tri mac dinh']),
    ('giá trị trong ds',['gia tri', 'danh sach']),
    ('sắp xếp',         ['sap xep', 'thu tu']),
    ('chọn giá trị',    ['chon ']),
    ('quá dài',         ['qua dai', 'do dai']),
    ('căn lề',          ['can le']),
]
NUMBOX = [
    ('mặc định',        ['gia tri mac dinh']),
    ('giá trị = 0',     ['= 0', 'bang 0', 'gia tri 0']),
    ('số âm',           ['so am']),
    ('số thập phân',    ['thap phan']),
    ('chữ/ký tự đặc biệt', ['nhap chu', 'ky tu dac biet', 'khac so']),
    ('copy-paste',      ['copy', 'paste', 'dan (']),
]
CN_THEM = [
    ('lưu OK (tối đa)', ['thanh cong', 'luu thanh cong', 'tao thanh cong', 'khoi tao thanh cong']),
    ('lưu đúng DB',     ['dung database', 'dung vao he thong', 'khop db', 'khop du lieu']),
    ('chỉ trường bắt buộc', ['chi nhap', 'chi cac truong bat buoc', 'truong bat buoc tren form']),
    ('thiếu bắt buộc',  ['khong nhap cac truong bat buoc', 'thieu truong bat buoc', 'khong du']),
    ('click liên tục',  ['lien tuc']),
    ('Tab + Enter',     ['tab + enter', 'tab va enter', 'tab -> enter']),
    ('trùng 2 client',  ['2 client', 'hai client', '2 tab', '2 phien', 'dong thoi']),
]
CN_XOA = [
    ('mở xác nhận',     ['mo hop thoai', 'xac nhan']),
    ('xóa thành công',  ['thanh cong', 'xoa mem', 'xoa vinh vien']),
    ('khớp DB',         ['khop db', 'khop du lieu', 'dung database']),
    ('hủy xóa',         ['huy']),
    ('click liên tục',  ['lien tuc']),
    ('Tab + Enter',     ['tab + enter', 'tab va enter']),
    ('bản ghi không tồn tại', ['khong ton tai', 'da xoa']),
]
ATTT_FIELD = [
    ('XSS thẻ script',  ['the script', 'the html tho', 'script html', 'xss the']),
    ('hexa URL',        ['hexa dang url', 'hexa url']),
    ('hexa HTML',       ['hexa dang html', 'hexa html']),
    ('SQL injection',   ['cau lenh truy van', 'sql injection', 'chen cau lenh']),
]

# Loại control có BỘ MỤC RIÊNG trong `qalib.QUOTA` (định mức + danh sách mục khác hẳn bộ
# Textbox/Selectbox chung). Bộ rà này chỉ có 6 bộ mục chung nên trước 2026-09-08 nó xếp
# `Textbox Nhập số trang` (7 mục riêng) vào bộ `Textbox` (9 mục) rồi báo THIẾU 6 mục KHÔNG hề
# tồn tại trong chuẩn — đo trên `QuanTri/TrinhDoDaoTao`: 13/19 mục báo là phantom.
# Rà đúng cho các loại này là việc của `audit_validate_quota` (đếm theo `qalib.QUOTA`).
_CO_BO_RIENG = ('Textbox Nhập số trang', 'Textbox Số bản ghi/trang',
                'Selectbox Số bản ghi trên trang', 'Phân trang', 'Danh sách / lưới',
                'Icon', 'Checkbox bản ghi (grid)', 'File Excel',
                'Tải file mẫu', 'Hộp xác nhận', 'Hiển thị chi tiết', 'Button',
                'Textbox tìm kiếm', 'Textbox mã (unique)',
                # 2026-09-09: bộ mục của nhóm này nằm ở `quota_cases.RANGBUOC` và tiêu đề mang
                # TÊN CẶP trường ({a}/{b}) nên không soi được bằng bộ từ khoá chung.
                'Ràng buộc giữa các trường',
                # 2026-09-09: bộ mục riêng ở `quota_cases.BREADCRUMB` / `THE_SO_LIEU`
                'Breadcrumb', 'Thẻ số liệu',
                # 2026-09-10: hai loại OPT-IN có bộ mục RIÊNG (`DATEPICKER_NATIVE` /
                # `SELECTBOX_MULTI`) — soi bằng bộ từ khoá chung của `Datepicker`/`Selectbox`
                # là báo thiếu mục KHÔNG tồn tại (đúng lớp lỗi `Textbox Nhập số trang` đã vá 09/08).
                'Ô ngày trình duyệt', 'Selectbox nhiều lựa chọn',
                # 2026-09-10: ba loại vừa được thêm dòng vào `qalib.QUOTA` (trước đó định mức 0
                # ⇒ nhóm rỗng vĩnh viễn). `Tiêu đề cột sắp xếp` có bank riêng
                # `quota_cases.COT_SAP_XEP`; `Nút chọn (segmented)` có bank `SEGMENTED` (3 mục);
                # `Cột nhập Excel` cố ý KHÔNG có bank (bộ mục theo loại control của từng cột).
                # Cả ba hiện đã rơi về `return None, None` nhờ không khớp tiền tố nào — khai ở
                # đây để giữ đúng HỢP ĐỒNG của danh sách, không phụ thuộc may mắn về tiền tố.
                'Tiêu đề cột sắp xếp', 'Nút chọn (segmented)', 'Cột nhập Excel',
                # 2026-09-12: hai loại OPT-IN ô ngày, bộ mục riêng ở `quota_cases.DATEPICKER_GIO`
                # / `DATEPICKER_KHOANG` (nguồn: hai bộ validate mẫu `Thêm mới.xlsx` /
                # `Tìm kiếm.xlsx`). Khai ở đây để giữ đúng HỢP ĐỒNG của danh sách — hiện `pick()`
                # không có nhánh `datepicker` nên chúng vẫn rơi về `return None, None`, nhưng
                # thêm một nhánh ô ngày vào `pick()` mà quên chỗ này là báo thiếu mục KHÔNG tồn tại.
                'Ô ngày có giờ', 'Ô ngày nhiều lựa chọn')


def pick(group_name, ovr=None, cn=None):
    g = norm(group_name)
    # Đọc CÙNG override `loai_control` của hồ sơ màn với bộ bơm (2026-09-09): thiếu chỗ này thì
    # nhóm đã hạ định mức về 6 vẫn bị đòi đủ 7 mục tìm kiếm của bộ Selectbox 13.
    # `cn` (2026-09-10): hồ sơ màn khai được khoá phạm vi CN `"<TÊN CN>|<Tên nhóm>"` — bỏ tham
    # số này thì hai nhóm TRÙNG TÊN ở hai CN lại rơi chung một bộ mục (lỗ đã ghi nhận 09/10).
    _lab, _q = qalib.kind_of(group_name, None, ovr, cn)
    if _lab in _CO_BO_RIENG:
        return None, None
    if _lab == 'Selectbox không có ô tìm':
        return 'Selectbox (không ô tìm)', SELECTBOX
    if g.startswith('textbox so') or 'textbox so ' in g or g.startswith('o so'): return 'Textbox số', NUMBOX
    if g.startswith('textarea'):  return 'Textarea', TEXTAREA
    if g.startswith('textbox'):   return 'Textbox', TEXTBOX
    if g.startswith('selectbox') or g.startswith('combobox') or g.startswith('multiselect'):
        return 'Selectbox', SELECTBOX
    if g.startswith('chuc nang them') or g.startswith('chuc nang tao') or g.startswith('chuc nang khoi tao'):
        return 'CN Thêm mới', CN_THEM
    if g.startswith('chuc nang cap nhat'): return 'CN Cập nhật', CN_THEM
    if g.startswith('chuc nang xoa') or g.startswith('chuc nang xoa'): return 'CN Xóa', CN_XOA
    if g.startswith('an toan thong tin —') or g.startswith('an toan thong tin -'):
        return 'ATTT field', ATTT_FIELD
    return None, None

import qalib
import roles
# Tham số TÊN MÀN (2026-09-08): trước đây script BỎ QUA argv[2] nên `audit_content.py QuanTri
# TrinhDoDaoTao` vẫn in cả `ChucVu` — lệch quy ước của mọi bộ rà khác và gây đọc sai con số.
_ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
ROLE = _ARGS[0] if _ARGS else 'Admin'
ONLY = _ARGS[1] if len(_ARGS) > 1 else None
CFG = roles.get(ROLE)
D = CFG['dir']
SKIP = CFG['skip']
STRIP = CFG['strip']
report = {}
_BROKEN = []   # (tên file, lý do) — xem chú thích ở audit_func.py
# ⚠️ Vá 2026-09-14 — ĐỌC ĐỦ MỌI SHEET BP. Bản cũ `glob` + `tcfix.load(p)` chỉ lấy sheet BP
# ĐẦU TIÊN rồi im lặng báo 0 cho phần sau: role `ChuyenVien` có `BaoCaoDong.xlsx` gồm 2 sheet
# (`BP-BaoCaoDong` · `BP-BoDuLieu`) nên toàn bộ sheet thứ hai chưa từng được bộ này rà.
# `iter_role_files` còn KÊU TO khi thư mục rỗng, thay vì để con số 0 tự nói dối.
for _sh in qalib.iter_role_files(ROLE, only=ONLY, broken=_BROKEN):
    p, tc = _sh.path, _sh.tc
    nm = _sh.name + ((' [%s]' % _sh.bp) if _sh.multi else '')
    cur, cases, cur_cn = None, [], None
    miss_all = []
    invalidate = [False]
    _ovr = qalib.doc_override(p)          # khoá `loai_control` của hồ sơ màn cạnh bộ case
    def flush():
        if not cur: return
        kind, spec = pick(cur, _ovr, cur_cn)
        if not spec: return
        joined = [norm(c) for c in cases]
        missing = [lbl for lbl, kws in spec
                   if not any(any(k in j for k in kws) for j in joined)]
        if missing: miss_all.append((kind, cur, missing, len(cases)))
    for rn in tc.order:
        if rn < 12: continue
        B, C = tc.c(rn, 'B'), tc.c(rn, 'C')
        if not C:
            flush()
            lv = tc.lvl(rn)
            nb = norm(B)
            if lv == 'cn': invalidate[0] = False; cur_cn = B
            elif lv == 'grp': invalidate[0] = False
            elif lv == 'sub' and nb.startswith('validate cac truong'): invalidate[0] = True; cur = None; cases = []; continue
            elif lv == 'sub' and (nb.startswith('chuc nang') or nb.startswith('an toan')): invalidate[0] = False
            cur = B if (lv in ('sub', 'sub2') and invalidate[0]) else None
            cases = []
        else:
            cases.append(B)
    flush()
    report[nm] = miss_all

tot = 0
for nm, miss in report.items():
    if not miss: continue
    print(f"\n########## {nm} ({len(miss)} nhóm thiếu) ##########")
    for kind, grp, missing, ncase in miss:
        print(f"  [{kind}] {grp[:52]:54} ({ncase} case) → thiếu: {', '.join(missing)}")
        tot += len(missing)
print(f"\n=== TỔNG SỐ CASE CÒN THIẾU (ước tính): {tot} ===")
if _BROKEN:
    print('!!! %d file KHÔNG rà được (kết quả trên CHƯA phủ hết role):' % len(_BROKEN))
    for _b, _w in _BROKEN:
        print('    - %-52s %s' % (_b[:52], _w))

