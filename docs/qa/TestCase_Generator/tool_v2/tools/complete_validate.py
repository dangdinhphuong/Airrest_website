# -*- coding: utf-8 -*-
"""Bổ sung các case validate còn thiếu theo checklist chuẩn mau.xlsx.

Chỉ tác động các nhóm control nằm TRONG khối "Validate các trường thông tin".
Loại trừ: ô chỉ đọc; case "bắt buộc" với ô tìm kiếm/lọc (vốn không bắt buộc);
nhóm gộp nhiều control; nhóm không phải control nhập liệu.
Nội dung case viết theo đúng khuôn mẫu của mau.xlsx, chèn tên trường thật.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, glob, os, re, unicodedata

def locked(p):
    return os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % os.path.basename(p)))


def targets():
    """(path, key, bp, nhieu_sheet) cho từng sheet BP của từng file trong role."""
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


def norm(s):
    s = (s or '').lower().replace('\u0111', 'd')      # đ -> d (NFD không tách được ký tự này)
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')

# Dùng CHUNG `qalib.field_of()` — bản riêng ở đây KHÔNG bỏ phần chú thích trong ngoặc ở cuối
# tên nhóm (phần trong ngoặc ở cuối tên nhóm sẽ lọt vào tiêu đề case) và cũng không có nhánh cứu khi phần dư không mở đầu bằng chữ/số.
import qalib                                   # noqa: E402
field_of = qalib.field_of

# ---------- khuôn case theo mau.xlsx ----------
def C_default_text(f):
    return ('Kiểm tra giá trị mặc định', f'1. Mở màn/biểu mẫu có ô "{f}".\n2. Quan sát ô khi chưa nhập gì.',
            f'Ô "{f}" để trống theo mặc định; hiển thị đúng chữ gợi ý (nếu có) và không có thông báo lỗi nào.')
def C_default_select(f):
    return ('Kiểm tra giá trị mặc định', f'1. Mở màn/biểu mẫu có ô chọn "{f}".\n2. Quan sát ô khi chưa chọn gì.',
            f'Ô "{f}" hiển thị giá trị mặc định ban đầu (tuỳ chọn đầu danh sách); chưa áp dụng lựa chọn nào.')
def C_trim(f):
    return ('Kiểm tra chức năng Trim space',
            f'1. Nhập vào ô "{f}" một giá trị hợp lệ, thêm dấu cách ở đầu và cuối.\n2. Lưu / áp dụng.',
            'Hệ thống tự cắt bỏ dấu cách thừa ở hai đầu trước khi xử lý; kết quả giống như khi nhập không có '
            'khoảng trắng thừa.')
def C_paste(f):
    return ('Kiểm tra copy nội dung dữ liệu, paste vào textbox',
            f'1. Sao chép một nội dung hợp lệ từ nơi khác.\n2. Dán vào ô "{f}".',
            'Ô nhận đúng nội dung đã dán, không thiếu/lệch ký tự, không lỗi phông chữ.')
def C_vn(f):
    return ('Kiểm tra nhập dữ liệu là chữ tiếng Việt có dấu',
            f'1. Nhập vào ô "{f}" chuỗi tiếng Việt có đầy đủ dấu.\n2. Lưu, mở lại xem.',
            'Nội dung hiển thị lại đúng nguyên văn, đủ dấu, không lỗi phông chữ.')
def C_num_in_text(f):
    return ('Kiểm tra nhập số',
            f'1. Nhập chuỗi chỉ gồm chữ số vào ô "{f}".\n2. Lưu.',
            'Ô nhận bình thường và lưu được; chữ số được coi là văn bản, không phát sinh lỗi.')
def C_special(f):
    return ('Kiểm tra khi nhập ký tự đặc biệt, thẻ html, script',
            f'1. Nhập vào ô "{f}" chuỗi chứa ký tự đặc biệt (!@#$%^&*) và chuỗi dạng thẻ html.\n2. Lưu, mở lại xem.',
            'Nội dung được lưu và hiển thị lại nguyên văn dạng văn bản thuần; không bị hiểu thành thẻ định dạng, '
            'không thực thi mã.')
def C_long(f):
    return ('Kiểm tra nhập dữ liệu rất dài',
            f'1. Dán vào ô "{f}" một chuỗi rất dài (khoảng 500 ký tự).\n2. Lưu.',
            'Nếu có giới hạn độ dài thì hệ thống chặn và báo rõ; nếu không có giới hạn thì vẫn lưu được, '
            'giao diện không vỡ và nội dung dài tự xuống dòng/cuộn gọn trong khung.')
def C_sort(f):
    return ('Kiểm tra sắp xếp các giá trị', f'1. Mở ô chọn "{f}", quan sát thứ tự các giá trị.',
            'Các giá trị hiển thị theo thứ tự ổn định, nhất quán giữa các lần mở lại danh sách.')
def C_pickdiff(f):
    return ('Kiểm tra chọn các giá trị khác nhau',
            f'1. Mở ô chọn "{f}".\n2. Lần lượt chọn các giá trị khác nhau.',
            'Mỗi lần chỉ chọn được 1 giá trị; ô hiển thị đúng giá trị chọn sau cùng, thay thế lựa chọn trước đó.')
def C_toolong(f):
    return ('Kiểm tra hiển thị khi giá trị quá dài',
            f'1. Với giá trị "{f}" có nhãn rất dài, mở ô chọn và chọn giá trị đó.',
            'Độ rộng ô giữ cố định, không giãn theo độ dài; nhãn dài được cắt gọn, không làm vỡ bố cục.')
def C_align(f):
    return ('Kiểm tra căn lề các giá trị', f'1. Mở ô chọn "{f}", quan sát các giá trị trong danh sách.',
            'Các giá trị được căn lề trái, thẳng hàng nhau.')
def C_zero(f):
    return ('Kiểm tra giá trị = 0', f'1. Nhập 0 vào ô "{f}".\n2. Lưu.',
            'Hệ thống xử lý theo đúng quy định nghiệp vụ của trường này: chấp nhận 0 nếu hợp lệ, '
            'ngược lại báo lỗi rõ ràng ngay dưới ô.')
def C_neg(f):
    return ('Kiểm tra nhập số âm', f'1. Gõ một số âm (vd -5) vào ô "{f}".\n2. Lưu.',
            'Ô không nhận giá trị âm hoặc hệ thống báo lỗi và không cho lưu; không lưu được số âm.')
def C_dec(f):
    return ('Kiểm tra nhập số thập phân', f'1. Nhập giá trị thập phân (vd 1.5) vào ô "{f}".\n2. Lưu.',
            'Hệ thống xử lý đúng quy định của trường: chấp nhận phần thập phân nếu hợp lệ, ngược lại '
            'làm tròn hoặc báo lỗi rõ ràng.')
def C_char_in_num(f):
    return ('Kiểm tra khi nhập chữ, ký tự đặc biệt',
            f'1. Gõ chữ và ký tự đặc biệt vào ô "{f}".',
            'Ô chỉ nhận ký tự số; chữ và ký tự đặc biệt không gõ được vào ô hoặc bị loại bỏ.')
def C_multiline(f):
    return ('Kiểm tra nhập nhiều dòng (xuống dòng)',
            f'1. Nhập vào ô "{f}" nội dung gồm nhiều dòng bằng phím Enter.\n2. Lưu, mở lại xem.',
            'Ô cho phép xuống dòng; nội dung nhiều dòng được lưu và hiển thị lại đúng định dạng.')

SPEC_TEXT = [('mặc định', ['gia tri mac dinh'], C_default_text),
             ('ký tự đặc biệt', ['ky tu dac biet', 'the html', 'script'], C_special),
             ('nhập số', ['nhap so'], C_num_in_text),
             ('Trim space', ['trim', 'khoang trang', 'dau cach'], C_trim),
             ('copy-paste', ['copy', 'paste', 'dan ('], C_paste),
             ('tiếng Việt', ['tieng viet'], C_vn),
             ('rất dài', ['rat dai', 'khong gioi han', 'gioi han', 'do dai', 'qua ', 'vuot '], C_long)]
SPEC_AREA = [('mặc định', ['gia tri mac dinh'], C_default_text),
             ('nhiều dòng', ['nhieu dong', 'xuong dong'], C_multiline),
             ('rất dài', ['rat dai', 'khong gioi han', 'gioi han', 'do dai'], C_long),
             ('ký tự đặc biệt', ['ky tu dac biet', 'the html', 'script'], C_special),
             ('Trim space', ['trim', 'khoang trang', 'dau cach'], C_trim)]
SPEC_SEL = [('mặc định', ['gia tri mac dinh'], C_default_select),
            ('sắp xếp', ['sap xep', 'thu tu'], C_sort),
            ('chọn giá trị', ['chon '], C_pickdiff),
            ('quá dài', ['qua dai', 'do dai'], C_toolong),
            ('căn lề', ['can le'], C_align)]
SPEC_NUM = [('mặc định', ['gia tri mac dinh'], C_default_text),
            ('giá trị = 0', ['= 0', 'bang 0', 'gia tri 0'], C_zero),
            ('số âm', ['so am'], C_neg),
            ('số thập phân', ['thap phan'], C_dec),
            ('chữ/ký tự đặc biệt', ['nhap chu', 'ky tu dac biet', 'khac so'], C_char_in_num),
            ('copy-paste', ['copy', 'paste', 'dan ('], C_paste)]

SKIP = ('chi doc', 'read only', ' + ')           # o chi doc hoac nhom gop nhieu control
CTRL = ('textbox', 'textarea', 'selectbox', 'combobox', 'multiselect', 'checkbox', 'radio')

def spec_for(group):
    g = norm(group)
    if any(s in g for s in SKIP): return None
    if sum(g.count(c) for c in CTRL) > 1: return None    # gop >1 control -> bo qua
    if g.startswith('textbox so') or g.startswith('o so'): return SPEC_NUM
    if g.startswith('textarea'): return SPEC_AREA
    if g.startswith('textbox'):  return SPEC_TEXT
    if g.startswith('selectbox') or g.startswith('combobox') or g.startswith('multiselect'): return SPEC_SEL
    return None

import roles
ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
# `ONLY` (2026-09-08): lọc theo TÊN MÀN. Trước đây 3 script `complete_*` chỉ nhận <Role> và chạy
# cho MỌI file của role — đợt 17/08 đã sửa lây **13 file ngoài phạm vi**, và cách chữa duy nhất
# trong tài liệu là tạm chuyển file sang `_hold/`. Nay: `complete_func.py QuanTri TrinhDoDaoTao`.
_ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
ONLY = _ARGS[1] if len(_ARGS) > 1 else None

CFG = roles.get(ROLE)
D = CFG['dir']
grand = 0
for path, nm, bp, multi in targets():
    tc = tcfix.load(path, bp=bp)
    # gom: rownum cuối của mỗi nhóm validate -> danh sách case cần thêm
    add_after = {}
    invalid = False; cur = None; curstart = None; cases = []; lastrow = None
    def flush():
        global grand
        if not cur: return
        spec = spec_for(cur)
        if not spec: return
        f = field_of(cur)
        joined = [norm(c) for c in cases]
        news = []
        for lbl, kws, mk in spec:
            if not any(any(k in j for k in kws) for j in joined):
                news.append(mk(f))
        if news:
            add_after.setdefault(lastrow, []).extend(news)
            grand += len(news)
    for rn in tc.order:
        if rn < 12: continue
        B, C = tc.c(rn, 'B'), tc.c(rn, 'C')
        if not C:
            flush(); cur = None; cases = []
            lv = tc.lvl(rn); nb = norm(B)
            if lv in ('cn', 'grp'): invalid = False
            elif lv == 'sub' and nb.startswith('validate cac truong'): invalid = True; continue
            elif lv == 'sub' and (nb.startswith('chuc nang') or nb.startswith('an toan')): invalid = False
            if lv in ('sub', 'sub2') and invalid: cur = B; lastrow = rn
        else:
            cases.append(B); lastrow = rn
    flush()
    if not add_after: continue
    p = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12: continue
        p.keep(rn)
        for (md, bc, kq) in add_after.get(rn, []):
            p.case(md, bc, kq)
    tc.rebuild(p).save(quiet=True, sync=not multi)
    n, errs = tcfix.verify(path)
    lbl = nm if not multi else '%s/%s' % (nm, bp)
    print(f"  {lbl:30} +{sum(len(v) for v in add_after.values()):>3} case → {n:>4} | {'OK' if not errs else errs}")
print(f"\n=== ĐÃ BỔ SUNG TỔNG CỘNG: {grand} case ===")
