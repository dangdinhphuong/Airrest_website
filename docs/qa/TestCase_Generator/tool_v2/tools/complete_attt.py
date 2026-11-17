# -*- coding: utf-8 -*-
"""Bổ sung case An toàn thông tin còn thiếu theo chuẩn mau.xlsx (dùng cho mọi role).

Bộ case ATTT của mau chia theo loại CN. Cách diễn đạt phần "phạm vi dữ liệu" đổi theo role:
- Admin xuyên tổ chức  -> phạm vi tính theo QUYỀN được cấp.
- NCC / Giáo viên bị giới hạn theo đơn vị -> phạm vi tính theo đơn vị của mình
  (giống mau: "chỉ thấy thiết bị của NCC mình", "NCC A không sửa được của NCC B").
Chuỗi phụ thuộc role lấy từ roles.py: group / own / other / other_role.
"""
import sys, os, re, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, qalib

import roles
ROLE = sys.argv[1] if len(sys.argv) > 1 else 'Admin'
# `ONLY` (2026-09-08): lọc theo TÊN MÀN. Trước đây 3 script `complete_*` chỉ nhận <Role> và chạy
# cho MỌI file của role — đợt 17/08 đã sửa lây **13 file ngoài phạm vi**, và cách chữa duy nhất
# trong tài liệu là tạm chuyển file sang `_hold/`. Nay: `complete_func.py QuanTri TrinhDoDaoTao`.
_ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
ONLY = _ARGS[1] if len(_ARGS) > 1 else None

CFG = roles.get(ROLE)
D = CFG['dir']
G = CFG['group']            # vd 'Nhà cung cấp' / 'Giáo viên' / 'nhóm quản trị'
OWN = CFG['own']            # vd 'nhà cung cấp của mình'
OTHER = CFG['other']        # vd 'của nhà cung cấp khác'
OROLE = CFG['other_role']   # các vai trò khác để thử truy cập
NOUN = CFG['noun']


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
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


# ---------------- khuôn case ATTT (theo lối viết của mau.xlsx) ----------------
def a_anon(n): return ('Truy cập màn khi chưa đăng nhập',
    f'1. Khi chưa đăng nhập (hoặc vừa đăng xuất), mở thẳng màn {n} bằng cách gõ địa chỉ hoặc mở lại tab cũ.',
    f'Hệ thống điều hướng về màn đăng nhập; không hiển thị bất kỳ nội dung nào của màn {n}.')
def a_perm(n): return ('Yêu cầu quyền xem màn',
    f'1. Đăng nhập tài khoản thuộc {G} nhưng CHƯA được cấp quyền nào với {n}.\n'
    '2. Mở màn (bấm menu hoặc gõ địa chỉ).',
    'Không vào được: hệ thống báo trang không tồn tại ngay tại chỗ, vẫn giữ khung menu và tiêu đề của ứng dụng; '
    'không gọi và không để lộ dữ liệu nào.')
def a_role(n): return ('Truy cập màn bằng tài khoản khác vai trò',
    f'1. Đăng nhập tài khoản KHÁC vai trò ({OROLE}).\n2. Mở thẳng màn {n} của {G}.',
    'Ngoài phạm vi vai trò: hệ thống báo trang không tồn tại ngay tại chỗ, vẫn giữ khung menu và tiêu đề; '
    f'không để lộ dữ liệu của {G}.')
def a_ok(n): return ('Ngoại lệ: tài khoản được cấp đúng quyền vẫn vào được',
    f'1. Đăng nhập tài khoản đã thật sự được cấp đúng quyền với {n}.\n2. Mở màn.',
    'Vẫn vào xem được bình thường; không bị chặn nhầm.')
def a_scope(n): return (f'Chỉ thấy dữ liệu thuộc {OWN}',
    f'1. Đăng nhập một tài khoản, xem danh sách {n}.\n'
    f'2. Đối chiếu với dữ liệu đang có của đơn vị khác.',
    f'Chỉ trả về dữ liệu thuộc {OWN}; dữ liệu {OTHER} không xuất hiện và không đếm vào các ô thống kê.')
def a_param(n): return ('Can thiệp tham số để lấy dữ liệu ngoài phạm vi',
    f'1. Sửa trực tiếp mã định danh hoặc tham số lọc trên đường dẫn để trỏ tới bản ghi {n} {OTHER}.',
    f'Hệ thống bỏ qua hoặc chặn: vẫn chỉ trả về dữ liệu thuộc {OWN}, không lộ bản ghi {OTHER}.')
def a_sess(n): return ('Thao tác khi hết phiên',
    '1. Để phiên đăng nhập hết hạn.\n2. Đổi trang danh sách hoặc mở lại màn.',
    'Hệ thống điều hướng về màn đăng nhập, yêu cầu đăng nhập lại; không trả về dữ liệu.')

# ⚠️ Vá 2026-09-09 — PAYLOAD PHẢI LẤY TỪ BẢNG §7.2 CỦA PROMPT v3, KHÔNG TỰ BỊA.
# Bản trước bịa `' OR '1'='1` + `'; drop table x;--` (§7.2 **cấm đích danh** `; DROP TABLE`) và
# `<img src=x onerror=alert(1)>`. Không phép rà nào bắt: `audit_attt` khớp TIÊU ĐỀ ('sql injection',
# 'xss'), không đọc cột C. README đã ghi "tự bịa payload thì KHÔNG bộ rà nào bắt" cho phần sửa tay —
# hoá ra chính bộ bơm cũng bịa. Cột D lấy nguyên văn §7.3 (ngữ cảnh ô tìm kiếm).
KQ_TIM = ('Hệ thống thực hiện tìm kiếm và:\n'
          '- Hiển thị các kết quả hợp lệ nếu có\n'
          '- Hiển thị Không tìm thấy kết quả tìm kiếm nếu không có kết quả thỏa mãn')


def s_sqli(n): return ('Kiểm tra SQL injection qua ô tìm kiếm',
    "1. Nhập vào ô tìm kiếm chuỗi: <tiêu chí tìm kiếm>' or '1%'='1\n2. Nhấn Enter.", KQ_TIM)
def s_xss(n): return ('Kiểm tra XSS phản chiếu qua ô tìm kiếm',
    '1. Nhập vào ô tìm kiếm đoạn script HTML: <b>1</b>\n2. Nhấn Enter.', KQ_TIM)
def s_scope(n): return (f'Kiểm tra tìm kiếm chỉ trong phạm vi {OWN}',
    f'1. Nhập từ khóa khớp với bản ghi {n} {OTHER}.',
    f'Không trả về bản ghi {OTHER}; kết quả giới hạn đúng theo {OWN}.')
def s_sess(n): return ('Thao tác khi hết phiên',
    '1. Để phiên hết hạn.\n2. Thực hiện tìm kiếm.',
    'Trả về lỗi hết phiên và điều hướng về màn đăng nhập; không trả kết quả.')

def c_perm(n): return ('Yêu cầu quyền thêm mới',
    f'1. Đăng nhập tài khoản không có quyền thêm {n}.\n2. Gọi chức năng thêm mới.',
    'Bị chặn vì không đủ quyền; không tạo được bản ghi nào.')
def c_owner(n): return ('Thông tin chủ sở hữu lấy từ phiên đăng nhập',
    '1. Cố tình gửi kèm thông tin đơn vị / người tạo tùy ý khi tạo bản ghi.',
    'Hệ thống bỏ qua giá trị tự gửi, gán chủ sở hữu và đơn vị theo phiên đăng nhập thực tế.')
def c_xss(n): return ('Chống XSS ở các trường nhập văn bản',
    '1. Nhập đoạn script HTML <b>1</b> vào các ô văn bản của biểu mẫu.\n2. Lưu, mở lại xem.',
    '- Hệ thống không cho phép Insert\n'
    '- Hoặc cho phép Insert đúng chuỗi dữ liệu nhập vào và hiển thị ra cũng đúng chuỗi đã nhập '
    '(không thực thi script)')
def c_sess(n): return ('Thao tác tạo khi hết phiên',
    '1. Để phiên hết hạn.\n2. Bấm lưu.',
    'Trả về lỗi hết phiên; không tạo bản ghi.')

def u_perm(n): return ('Yêu cầu quyền sửa',
    f'1. Tài khoản không có quyền sửa gọi chức năng sửa {n}.',
    'Bị chặn vì không đủ quyền; không sửa được.')
def u_scope(n): return (f'Không sửa được bản ghi {OTHER}',
    f'1. Cố sửa 1 bản ghi {n} {OTHER} (sửa mã định danh trên đường dẫn).',
    f'Bị chặn vì bản ghi không thuộc {OWN}; không sửa được và không để lộ dữ liệu bản ghi đó.')
def u_sess(n): return ('Sửa khi hết phiên',
    '1. Để phiên hết hạn.\n2. Bấm lưu thay đổi.',
    'Trả về lỗi hết phiên; không cập nhật.')

def d_perm(n): return ('Yêu cầu đăng nhập khi xem chi tiết',
    '1. Mở màn chi tiết khi chưa đăng nhập.',
    'Trả về lỗi chưa đăng nhập và điều hướng về màn đăng nhập; không lộ thông tin chi tiết.')
def d_scope(n): return (f'Không xem được chi tiết bản ghi {OTHER}',
    f'1. Cố mở chi tiết 1 bản ghi {n} {OTHER} bằng cách sửa mã định danh trên đường dẫn.',
    f'Bị chặn vì bản ghi không thuộc {OWN}; không hiển thị bất kỳ trường dữ liệu nào của bản ghi đó.')
def d_xss(n): return ('Chống XSS ở nội dung hiển thị',
    '1. Chuẩn bị bản ghi có trường văn bản chứa thẻ script.\n2. Mở màn chi tiết.',
    'Nội dung hiển thị dạng văn bản thuần; không thực thi mã.')

def x_perm(n): return ('Yêu cầu quyền xóa',
    f'1. Tài khoản không có quyền xóa gọi chức năng xóa {n}.',
    'Bị chặn vì không đủ quyền; bản ghi vẫn còn.')
def x_scope(n): return (f'Không xóa được bản ghi {OTHER}',
    f'1. Cố xóa 1 bản ghi {n} {OTHER}.',
    f'Bị chặn vì bản ghi không thuộc {OWN}; không xóa được.')
def x_sess(n): return ('Xóa khi hết phiên',
    '1. Để phiên hết hạn.\n2. Bấm xóa.',
    'Trả về lỗi hết phiên; không xóa bản ghi.')

def e_perm(n): return ('Yêu cầu quyền xuất dữ liệu',
    '1. Đăng nhập tài khoản không có quyền xuất.\n2. Gọi chức năng xuất.',
    'Bị chặn vì không đủ quyền; không tải được file.')
def e_scope(n): return (f'File xuất ra chỉ chứa dữ liệu thuộc {OWN}',
    '1. Bấm xuất và mở file.\n2. Soát xem có lẫn bản ghi của đơn vị khác không.',
    f'File chỉ chứa dữ liệu thuộc {OWN}; không lẫn bản ghi {OTHER}.')
def e_sess(n): return ('Xuất khi hết phiên',
    '1. Để phiên hết hạn.\n2. Bấm xuất.',
    'Trả về lỗi hết phiên; không sinh file.')

def t_perm(n): return ('Yêu cầu quyền thực hiện thao tác',
    '1. Đăng nhập tài khoản không có quyền với thao tác này.\n2. Gọi chức năng.',
    'Bị chặn vì không đủ quyền; trạng thái dữ liệu không đổi.')
def t_scope(n): return (f'Không thao tác được trên bản ghi {OTHER}',
    f'1. Cố thực hiện thao tác trên 1 bản ghi {n} {OTHER} bằng cách sửa mã định danh trên đường dẫn.',
    f'Bị chặn vì bản ghi không thuộc {OWN}; không thay đổi được dữ liệu.')
def t_sess(n): return ('Thao tác khi hết phiên',
    '1. Để phiên hết hạn.\n2. Thực hiện thao tác.',
    'Trả về lỗi hết phiên; không thay đổi dữ liệu.')

def i_type(n): return ('Kiểm tra chặn tải lên file sai định dạng và file thực thi',
    '1. Tải lên file không thuộc định dạng cho phép.\n2. Tải lên file thực thi (.exe / .bat / .php).',
    'Hệ thống chặn cả hai, báo rõ định dạng không hợp lệ; không nhận file, không lưu file lên máy chủ.')
def i_sqli(n): return ('Kiểm tra SQL injection qua dữ liệu trong file',
    "1. Tải file mẫu.\n2. Điền vào một ô dữ liệu chuỗi \"' OR 1=1--\".\n"
    '3. Các ô khác hợp lệ, tải lên và bấm nhập.',
    'Hệ thống không thực thi câu lệnh: hoặc chặn không cho nhập, hoặc lưu nguyên chuỗi dạng văn bản '
    'và hiển thị lại đúng như đã nhập.')
def i_xss(n): return ('Kiểm tra XSS — thẻ HTML / script trong file',
    '1. Điền vào một ô dữ liệu đoạn script HTML: <b>1</b>\n2. Tải lên và bấm nhập.',
    'Không thực thi mã; nội dung được lưu và hiển thị lại dạng văn bản thuần.')
def i_hexu(n): return ('Kiểm tra XSS — script mã hóa hexa dạng URL',
    '1. Điền vào một ô dữ liệu đoạn script "<b>1</b>" đã mã hóa hexa dạng URL.\n2. Tải lên và bấm nhập.',
    'Không thực thi; hệ thống xử lý an toàn, hiển thị dạng văn bản.')
def i_hexh(n): return ('Kiểm tra XSS — script mã hóa hexa dạng HTML',
    '1. Điền vào một ô dữ liệu đoạn script "<b>1</b>" đã mã hóa hexa dạng HTML.\n2. Tải lên và bấm nhập.',
    'Không thực thi; hệ thống xử lý an toàn, hiển thị dạng văn bản.')
def i_perm(n): return ('Yêu cầu quyền nhập dữ liệu',
    '1. Đăng nhập tài khoản không có quyền nhập.\n2. Gọi chức năng nhập.',
    'Bị chặn vì không đủ quyền; không nhập được bản ghi nào.')
def i_sess(n): return ('Nhập khi hết phiên',
    '1. Để phiên hết hạn.\n2. Bấm nhập.',
    'Trả về lỗi hết phiên; không nhập bản ghi nào.')


SPEC = {
    'Danh sách':     [(['chua dang nhap', 'khong dang nhap', 'dang xuat'], a_anon),
                      (['quyen xem', 'yeu cau quyen'], a_perm),
                      (['khac vai tro', 'vai tro khac', 'tai khoan khac'], a_role),
                      (['ngoai le', 'dung quyen van', 'van vao duoc'], a_ok),
                      (['pham vi', 'chi thay', 'chi tra', 'co lap'], a_scope),
                      (['tham so', 'ma dinh danh', 'dinh danh', 'truy cap cheo'], a_param),
                      (['het phien'], a_sess)],
    'Tìm kiếm':      [(['sql injection', 'cau lenh truy van'], s_sqli),
                      (['xss', 'the script', 'the html'], s_xss),
                      (['pham vi', 'chi trong', 'co lap'], s_scope),
                      (['het phien'], s_sess)],
    'Thêm mới':      [(['quyen them', 'quyen tao', 'quyen khoi tao'], c_perm),
                      (['theo phien', 'tu phien', 'gan dung'], c_owner),
                      (['xss', 'the script', 'the html', 'hexa'], c_xss),
                      (['het phien'], c_sess)],
    'Cập nhật':      [(['quyen sua', 'quyen cap nhat'], u_perm),
                      (['ngoai pham vi', 'khong thuoc', 'khong sua duoc'], u_scope),
                      (['het phien'], u_sess)],
    'Xem chi tiết':  [(['dang nhap', 'quyen xem'], d_perm),
                      (['ngoai pham vi', 'khong thuoc', 'khong xem duoc'], d_scope),
                      (['xss', 'the script', 'the html'], d_xss)],
    'Xóa':           [(['quyen xoa'], x_perm),
                      (['ngoai pham vi', 'khong thuoc', 'khong xoa duoc'], x_scope),
                      (['het phien'], x_sess)],
    'Xuất dữ liệu':  [(['quyen xuat'], e_perm),
                      (['pham vi', 'chi chua', 'dung du lieu', 'co lap'], e_scope),
                      (['het phien'], e_sess)],
    'Nhập dữ liệu':  [(['dinh dang', 'file thuc thi', '.exe'], i_type),
                      (['sql injection', 'cau lenh truy van'], i_sqli),
                      (['the html', 'the script', 'xss'], i_xss),
                      (['hexa dang url', 'hexa url'], i_hexu),
                      (['hexa dang html', 'hexa html'], i_hexh),
                      (['quyen nhap', 'quyen import'], i_perm),
                      (['het phien'], i_sess)],
    'Thao tác khác': [(['quyen ', 'khong du quyen'], t_perm),
                      (['ngoai pham vi', 'khong thuoc', 'khong thao tac duoc', 'tham so', 'dinh danh', 'co lap'], t_scope),
                      (['het phien'], t_sess)],
}


def kind(cn):
    n = norm(cn)
    if n.startswith('an toan thong tin'): return None       # CN chuyên về ATTT
    if 'nhap excel' in n or 'import' in n: return 'Nhập dữ liệu'
    # 2026-09-10 — chỉ thị *"bỏ ATTT tại chức năng Xuất excel"*: KHÔNG bơm khối ATTT cho
    # CN Xuất nữa. Bộ rà `audit_attt.pick()` bỏ qua CN này cùng lúc — bơm và rà phải
    # tắt CÙNG MỘT LẦN, không thì một bên bơm vào cái bên kia vừa gỡ ra.
    # `xuất bản` / `xuất xứ` KHÔNG phải CN Xuất Excel — bẫy trùng từ khoá (luật §0.6),
    # `audit_attt.pick()` đã vấp một lần năm 2026-09-04 làm 7 CN báo oan.
    if 'xuat' in n and not any(k in n for k in ('xuat ban', 'xuat xu')): return None
    if 'xoa' in n: return 'Xóa'
    if 'chi tiet' in n: return 'Xem chi tiết'
    if 'cap nhat' in n or 'sua ' in n or 'chinh sua' in n or 'sua/' in n: return 'Cập nhật'
    if any(k in n for k in ('them', 'tao ', 'khoi tao', 'khai bao')): return 'Thêm mới'
    if qalib.la_cn_tim_kiem(cn): return 'Tìm kiếm'
    if any(k in n for k in ('danh sach', 'quan ly', 'tong quan', 'bang dieu khien', 'xem tab', 'man ')):
        return 'Danh sách'
    return 'Thao tác khác'


def locked(p):
    return os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % os.path.basename(p)))


grand = 0
for path, key, bp, multi in targets():
    n = NOUN.get(key, 'dữ liệu')
    tc = tcfix.load(path, bp=bp)
    add_after = {}          # dong -> [case] : chen vao nhom ATTT da co
    new_grp = {}            # dong cuoi CN -> [case] : phai TAO nhom ATTT moi
    cn = None; on = False; cases = []; anchor = None; n_added = 0
    cn_seen_attt = False; cn_last = None; cn_ncase = 0

    def flush():
        """Bom case vao nhom ATTT DA CO cua CN hien tai."""
        global n_added
        if cn is None or anchor is None: return
        k = kind(cn)
        if not k: return
        j = [norm(c) for c in cases]
        news = [mk(n) for kws, mk in SPEC[k] if not any(any(w in s for w in kws) for s in j)]
        if news:
            add_after.setdefault(anchor, []).extend(news)
            n_added += len(news)

    def close_cn():
        """Ket CN: neu CN khong he co nhom ATTT thi tao moi o cuoi CN."""
        global n_added
        if cn is None or cn_seen_attt or cn_last is None or not cn_ncase: return
        k = kind(cn)
        if not k: return
        news = [mk(n) for kws, mk in SPEC[k]]
        new_grp.setdefault(cn_last, []).extend(news)
        n_added += len(news)

    for rn in tc.order:
        if rn < 12: continue
        B, C = tc.c(rn, 'B'), tc.c(rn, 'C')
        lv = tc.lvl(rn)
        if not C:
            if lv == 'cn':
                if on: flush()
                close_cn()
                cn = B.splitlines()[0]; on = False; cases = []; anchor = None
                cn_seen_attt = False; cn_last = rn; cn_ncase = 0
            elif lv == 'grp':
                if on: flush()
                on = norm(B).startswith('an toan'); cases = []
                anchor = rn if on else None
                if on: cn_seen_attt = True
                cn_last = rn
            else:
                cn_last = rn
        else:
            cn_last = rn; cn_ncase += 1
            if on: cases.append(B); anchor = rn
    if on: flush()
    close_cn()
    if not add_after and not new_grp: continue

    p = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12: continue
        p.keep(rn)
        for (md, bc, kq) in add_after.get(rn, []):
            p.case(md, bc, kq)
        if rn in new_grp:                      # tao nhom ATTT moi o cuoi CN
            p.add_grp('An toàn thông tin')
            for (md, bc, kq) in new_grp[rn]:
                p.case(md, bc, kq)
    tc.rebuild(p).save(quiet=True, sync=not multi)
    total, errs = tcfix.verify(path)
    lbl = key if not multi else '%s/%s' % (key, bp)
    print('  %-30s +%3d case → %4d | %s' % (lbl, n_added, total, 'OK' if not errs else errs))
    grand += n_added

print('\n=== ĐÃ BỔ SUNG %d CASE AN TOÀN THÔNG TIN ===' % grand)
