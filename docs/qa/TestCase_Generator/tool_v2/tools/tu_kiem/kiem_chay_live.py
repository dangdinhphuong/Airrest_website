#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM LỚP B — CHẠY CASE + GHI KẾT QUẢ (`chay_live.py`), mới 2026-09-15.

Vì sao phải có: lớp B chạm vào hai thứ đắt nhất của cả bộ tool — **dữ liệu thật của app** (hàng
rào an toàn) và **file kết quả** (cột R là công thức, cột T là bằng chứng). Cả hai đều thuộc lớp
lỗi im lặng: ghi nhầm dòng thì báo cáo vẫn đẹp, chặn hụt một thao tác ghi thì không ai biết cho
tới lúc mất dữ liệu (sự cố 2026-08-02).

Mọi phép kiểm chạy trên **fixture dựng từ `file-nen/file-nen.xlsx` đi kèm repo** + **app giả**
(`tu_kiem/app_gia.py`), trong thư mục tạm riêng — KHÔNG đụng bộ case, KHÔNG đụng `sessions/`,
KHÔNG cần tài khoản thật. Thiếu Chrome thì các phép live BỎ QUA và nói rõ *"không đo được"*,
không bao giờ tự nhận là đạt.

    python3 tools/tu_kiem/kiem_chay_live.py            # exit 0 = đạt hết
    python3 tools/tu_kiem/kiem_chay_live.py --nhanh    # bỏ phép kiểm cần Chrome
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
REPO = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)

os.environ.setdefault('QA_PROJECT', 'moetdl')
# Nhóm phép B5* chạy TRONG TIẾN TRÌNH NÀY và kiểm đúng hành vi MẶC ĐỊNH của `qalib.so_mang`.
# Từ 16/09 `auth_endpoints()` ưu tiên `auth_endpoints` của HỒ SƠ DỰ ÁN, mà dòng trên lại ép
# hồ sơ `moetdl` — nên các phép ấy đo nhầm danh sách của một dự án cụ thể và cùng đỏ một lượt
# (`/api/login` bị xếp `WRITE`). Ghim về danh sách MẶC ĐỊNH: đây là thứ chúng đang kiểm.
# (Tiến trình con dùng `moi_truong()`, ở đó khai route thật của app giả.)
import qalib as _qalib_mac_dinh                                            # noqa: E402
os.environ.setdefault('QA_AUTH_ENDPOINTS', ','.join(_qalib_mac_dinh.AUTH_MAC_DINH))          # hồ sơ dự án dùng cho fixture
NEN = os.path.join(REPO, 'file-nen', 'file-nen.xlsx')
TK = ('admin@gia.vn', 'matkhau-A')
KQ = []


def kiem(ten):
    def deco(f):
        KQ.append((ten, f))
        return f
    return deco


def _in(ten, ok, ghi_chu='', bo_qua=False):
    dau = '–' if bo_qua else ('✔' if ok else '✘')
    print('   %s %-56s %s' % (dau, ten, ghi_chu))


# ══════════════════════════════════════════════════════════════════════════════
# FIXTURE — bộ case + hồ sơ màn + cây thư mục dự án, dựng từ file nền của repo
# ══════════════════════════════════════════════════════════════════════════════
# Các case dưới đây được viết để KHỚP ĐÚNG màn của `app_gia.py`, nên kỳ vọng của từng phép đo là
# xác định: cái gì phải P, cái gì phải F, cái gì KHÔNG được chấm gì cả.
CASES = [
    # (loại mong đợi, mục đích B, các bước C, kết quả mong muốn D)
    ('P', 'Kiểm tra hiển thị đầy đủ các thông tin trong màn hình chức năng',
     '1. Mở màn hình chức năng.\n2. Đối chiếu từng thành phần đang hiện trên màn.',
     'Hiển thị màn hình chức năng bao gồm các thông tin:\n'
     '1. [Thẻ số liệu] Tổng bản ghi\n2. [Thẻ số liệu] Đang hoạt động\n'
     '3. [Button] Thêm mới\n4. [Button] Xuất excel\n5. [Selectbox] Trạng thái\n'
     '6. [Cột] Mã\n7. [Cột] Tên'),
    ('F', 'Kiểm tra hiển thị đầy đủ các thông tin trong màn hình chức năng',
     '1. Mở màn hình chức năng.\n2. Đối chiếu từng thành phần đang hiện trên màn.',
     'Hiển thị màn hình chức năng bao gồm các thông tin:\n'
     '1. [Button] Thêm mới\n2. [Button] Duyệt hàng loạt\n3. [Thẻ số liệu] Tổng ngân sách'),
    ('P', 'Kiểm tra giá trị mặc định ô số bản ghi trên trang',
     '1. Mở màn, chưa thao tác gì.\n2. Đọc ô "Số bản ghi/trang".',
     'Ô hiện số 20.'),
    ('P', 'Kiểm tra giá trị mặc định Trạng thái',
     '1. Mở màn, chưa thao tác gì.\n2. Đọc ô chọn Trạng thái trên thanh lọc.',
     'Ô hiện chữ gợi ý, không chọn sẵn giá trị nghiệp vụ.'),
    ('P', 'Kiểm tra giá trị mặc định của Thẻ số liệu Tổng bản ghi',
     '1. Mở màn, chưa thao tác gì.\n2. Đọc nhãn và giá trị trên thẻ.',
     'Thẻ hiện đúng nhãn và một con số nguyên.'),
    ('F', 'Kiểm tra giá trị mặc định của Thẻ số liệu Tổng ngân sách',
     '1. Mở màn, chưa thao tác gì.\n2. Đọc nhãn và giá trị trên thẻ.',
     'Thẻ hiện đúng nhãn và một con số nguyên.'),
    ('P', 'Kiểm tra hiển thị nút "Thêm mới"',
     '1. Trên màn hình chức năng.\n2. Kiểm tra hiển thị nút Thêm mới.',
     'Nút hiện đúng vị trí.'),
    ('CHUA_DO', 'Kiểm tra khi thực hiện Tab', 'Thực hiện bấm phím Tab',
     'Con trỏ di chuyển giữa các control từ trái qua phải.'),
    ('CHAN', 'Kiểm tra lưu bản ghi hợp lệ',
     '1. Bấm nút "Thêm mới".\n2. Nhập đầy đủ thông tin hợp lệ.\n3. Bấm nút "Lưu".',
     'Hệ thống lưu thành công và hiện thông báo.'),
    ('CHAN', 'Kiểm tra xóa bản ghi',
     '1. Bấm biểu tượng xóa trên bản ghi.\n2. Bấm nút "Xác nhận xóa".',
     'Bản ghi bị xóa khỏi danh sách.'),
    ('PE_DB', 'Kiểm tra bản ghi lưu đúng vào database',
     '1. Thêm mới một bản ghi.\n2. Chạy truy vấn: SELECT code, title FROM source_types '
     'WHERE code = \'ZZQA1\';',
     'Bản ghi có trong bảng với đúng giá trị vừa nhập.'),
]


def dung_bo_case(goc, ten_man, role='ChuyenVien'):
    """Dựng cây `<goc>/<role>/testcase/…xlsx` + `ho-so-man/…json` -> đường dẫn file nguồn."""
    import tcfix
    d_tc = os.path.join(goc, role, 'testcase')
    d_hs = os.path.join(goc, role, 'ho-so-man')
    os.makedirs(d_tc, exist_ok=True)
    os.makedirs(d_hs, exist_ok=True)
    src = os.path.join(d_tc, 'Testcase-Role-%s-%s.xlsx' % (role, ten_man))
    shutil.copy(NEN, src)
    tc = tcfix.load(src)
    pl = tcfix.Plan(tc)
    pl.add_cn('DANH SÁCH %s\n1. Vào hệ thống > Đăng nhập tài khoản Chuyên viên\n'
              '2. Vào màn %s' % (ten_man.upper(), ten_man))
    pl.add_grp('Giao diện')
    pl.add_sub('Giao diện chung')
    import qalib
    for loai, b, c, d in CASES:
        # ⚠️ so bằng `qalib.norm` — `b.lower()` KHÔNG bỏ dấu tiếng Việt, nên khớp chuỗi không
        # dấu là trượt im lặng (fixture thiếu 2 case mà bộ kiểm vẫn chạy tiếp).
        if 'day du cac thong tin' in qalib.norm(b) or 'thuc hien tab' in qalib.norm(b):
            pl.case(b, c, d)
    pl.add_sub('Validate các trường thông tin')
    for nhom, loc in (('Textbox Số bản ghi/trang', 'số bản ghi trên trang'),
                      ('Selectbox Trạng thái', 'Trạng thái'),
                      ('Thẻ số liệu Tổng bản ghi', 'Thẻ số liệu Tổng bản ghi'),
                      ('Thẻ số liệu Tổng ngân sách', 'Thẻ số liệu Tổng ngân sách'),
                      ('Button Thêm mới', 'nút "Thêm mới"')):
        pl.add_sub2(nhom)
        for loai, b, c, d in CASES:
            if qalib.norm(loc) in qalib.norm(b):
                pl.case(b, c, d)
    pl.add_cn('THÊM MỚI %s\n1. Vào hệ thống > Đăng nhập\n2. Bấm Thêm mới' % ten_man.upper())
    pl.add_grp('Chức năng')
    pl.add_sub('Lưu bản ghi')
    for loai, b, c, d in CASES:
        if loai in ('CHAN', 'PE_DB'):
            pl.case(b, c, d)
    tc.rebuild(pl).save(quiet=True, sync=False)
    json.dump({'title': ten_man, 'url': ['http://127.0.0.1:0/admin/%s' % ten_man],
               'nav': ['Danh mục', ten_man],
               'grounding': {'verbatim': ['Thêm mới', 'Xuất excel'], 'khong_co': [],
                             'hang_so': {}}},
              open(os.path.join(d_hs, os.path.basename(src).replace('.xlsx', '.json')), 'w',
                   encoding='utf-8'), ensure_ascii=False)
    return src


def dat_url(goc, ten_man, url, role='ChuyenVien'):
    p = os.path.join(goc, role, 'ho-so-man', 'Testcase-Role-%s-%s.json' % (role, ten_man))
    x = json.load(open(p, encoding='utf-8'))
    x['url'] = [url]
    json.dump(x, open(p, 'w', encoding='utf-8'), ensure_ascii=False)


def moi_truong(goc):
    """Môi trường cho tiến trình chạy live của bộ kiểm — CÁCH LY khỏi máy người chạy.

    ⚠️ VÁ 2026-09-17 lượt 2, cùng lớp với `kiem_qa_data.moi_truong`. Chép nguyên `os.environ`
    rồi chỉ ĐÈ `QA_USER`/`QA_PASS` là chưa đủ từ khi lớp tài khoản đổi sang khuôn `ROLE_*` +
    tệp env ngoài repo: tiến trình con thấy `ROLE_CHUYENVIEN_USER` thật của người chạy và
    ƯU TIÊN nó, nên nó đem tài khoản thật đi đăng nhập vào **app giả** và trượt —
    `đăng nhập KHÔNG vào được /admin`. Năm phép kiểm đỏ theo, và đỏ theo MÁY chứ không theo
    mã nguồn.
    """
    import cach_ly
    e = cach_ly.moi_truong_sach(goc)
    e.update({'QA_PROJECT': 'moetdl', 'QA_TESTCASE_DIR': goc,
              'QA_SESSION_DIR': os.path.join(goc, '_phien'),
              'QA_HOME_PREFIX': '/admin', 'QA_LOGIN_PATH': '/login',
              # Route đăng nhập CỦA APP GIẢ. Bắt buộc khai từ 16/09: `qalib.auth_endpoints()`
              # nay ưu tiên `auth_endpoints` của HỒ SƠ DỰ ÁN, và hồ sơ `moetdl` khai route
              # thật (`/api/authentication/v1/auth/login`) — không khớp `/api/login` của app
              # giả. Không khai thì POST đăng nhập bị xếp `WRITE` và MỌI phép chạy thật dừng
              # an toàn ngay ở bước đăng nhập (đo được: F1·F2·F3·F4 + B5* cùng đỏ).
              # `kiem_qa_data.moi_truong()` đã khai sẵn khoá này từ trước.
              'QA_AUTH_ENDPOINTS': '/api/login',
              'QA_USER': TK[0], 'QA_PASS': TK[1],
              'QA_BAK_DIR': os.path.join(goc, '_bak')})
    return e


def chay(args, goc, giay=600):
    return subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py')] + args,
                          capture_output=True, text=True, timeout=giay, env=moi_truong(goc))


def tao_ket_qua(goc, man):
    return subprocess.run([sys.executable, os.path.join(TOOLS, 'ket_qua.py'), 'ChuyenVien', man,
                           '--create', '--apply'],
                          capture_output=True, text=True, timeout=600, env=moi_truong(goc))


def f_kq(goc, man, role='ChuyenVien'):
    return os.path.join(goc, role, 'ket-qua-test',
                        'Testcase-Role-%s-%s_ket_qua.xlsx' % (role, man))


def f_src(goc, man, role='ChuyenVien'):
    return os.path.join(goc, role, 'testcase', 'Testcase-Role-%s-%s.xlsx' % (role, man))


def _md5(path):
    import hashlib
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()


# ══════════════════════════════════════════════════════════════════════════════
# A. ĐỌC WORKBOOK
# ══════════════════════════════════════════════════════════════════════════════
@kiem('A1 đọc workbook: đủ case · khoá DUY NHẤT · ngữ cảnh nhóm đúng')
def a1(goc, _app):
    import chay_live as cl
    src = dung_bo_case(goc, 'ManA')
    cs = cl.doc_cases(src)
    assert len(cs) == len(CASES), 'đọc %d case, chờ %d' % (len(cs), len(CASES))
    assert not cl.soat_mapping(cs), 'khoá case bị trùng'
    cn = {c.nhom['cn'].split('\n')[0] for c in cs}
    assert len(cn) == 2, 'ngữ cảnh CN đọc được: %s' % cn
    pv = {cl.pham_vi(c) for c in cs}
    assert pv == {'danh_sach', 'them'}, 'phạm vi đọc được: %s' % pv
    return '%d case · 2 khối CN · phạm vi %s' % (len(cs), '/'.join(sorted(pv)))


@kiem('A2 case TRÙNG NỘI DUNG vẫn ra 2 khoá khác nhau (không ghi đè nhau)')
def a2(goc, _app):
    import chay_live as cl
    src = dung_bo_case(goc, 'ManTrung')
    cs = cl.doc_cases(src)
    import qalib
    trung = [c for c in cs if 'day du cac thong tin' in qalib.norm(c.b)]
    assert len(trung) >= 2, 'fixture phải có ít nhất 2 case cùng tiêu đề'
    assert trung[0].key != trung[1].key, 'hai case trùng tiêu đề ra CÙNG một khoá'
    assert trung[0].bam == trung[0].bam
    return '%d case cùng tiêu đề -> %d khoá' % (len(trung), len({c.key for c in trung}))


@kiem('A3 chưa có file kết quả -> DỪNG kèm hướng dẫn, không chạy bừa')
def a3(goc, _app):
    dung_bo_case(goc, 'ManB')
    r = chay(['ChuyenVien', 'ManB', '--dry-run'], goc)
    ra = r.stdout + r.stderr
    assert 'ket_qua.py' in ra, 'không hướng dẫn cách dựng file kết quả:\n%s' % ra[-400:]
    assert r.returncode != 0, 'màn hỏng mà mã thoát vẫn 0'
    return 'mã thoát %d · có hướng dẫn `ket_qua.py --create`' % r.returncode


@kiem('A4 thiếu hồ sơ màn -> DỪNG (§0 của PROMPT), không tự dựng dữ kiện')
def a4(goc, _app):
    src = dung_bo_case(goc, 'ManC')
    tao_ket_qua(goc, 'ManC')
    os.remove(os.path.join(goc, 'ChuyenVien', 'ho-so-man',
                           os.path.basename(src).replace('.xlsx', '.json')))
    r = chay(['ChuyenVien', 'ManC', '--dry-run'], goc)
    ra = r.stdout + r.stderr
    assert 'hồ sơ màn' in ra and r.returncode != 0, ra[-400:]
    return 'mã thoát %d · nêu đúng §0' % r.returncode


@kiem('A5 dry-run THIẾU tài khoản -> BLOCKED, mã thoát ≠ 0, không mở Chrome, không in mật khẩu')
def a5(goc, _app):
    """PHẦN 11 của chỉ thị 15/09 lượt 3.

    Dry-run là phép TIỀN KIỂM. Bản trước in `✗ tài khoản: THIẾU` rồi vẫn trả `COMPLETED` +
    mã thoát 0: người đọc bảng tổng kết (và CI đọc mã thoát) hiểu là "kiểm xong, chạy được",
    đúng lúc phép kiểm vừa phát hiện lượt chạy thật sẽ chết ở bước đăng nhập.
    """
    man = 'ManDry'
    dung_bo_case(goc, man)
    dat_url(goc, man, 'http://127.0.0.1:1/admin/%s' % man)
    tao_ket_qua(goc, man)
    dst = f_kq(goc, man)
    truoc = _md5(dst)

    moi = moi_truong(goc)
    for k in ('QA_USER', 'QA_PASS', 'QA_USER_CHUYENVIEN', 'QA_PASS_CHUYENVIEN'):
        moi.pop(k, None)
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'), 'ChuyenVien', man,
                        '--dry-run'], capture_output=True, text=True, timeout=600, env=moi)
    ra = r.stdout + r.stderr
    assert r.returncode != 0, 'thiếu tài khoản mà dry-run vẫn mã thoát 0:\n%s' % ra[-700:]
    assert 'BLOCKED' in ra, 'không nói rõ BLOCKED:\n%s' % ra[-700:]
    assert 'KHÔNG mở browser' in ra, ra[-400:]
    assert _md5(dst) == truoc, 'dry-run ghi vào file kết quả'

    # có tài khoản -> đi tiếp, và MẬT KHẨU không bao giờ được in ra
    moi['QA_USER'], moi['QA_PASS'] = 'qa-nguoi-dung', 'mat-khau-khong-duoc-in'
    r2 = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'), 'ChuyenVien', man,
                         '--dry-run'], capture_output=True, text=True, timeout=600, env=moi)
    ra2 = r2.stdout + r2.stderr
    assert r2.returncode == 0, 'đủ tài khoản mà dry-run vẫn hỏng:\n%s' % ra2[-700:]
    assert 'mat-khau-khong-duoc-in' not in ra2, 'MẬT KHẨU bị in ra màn hình'
    assert _md5(dst) == truoc, 'dry-run ghi vào file kết quả'
    return 'thiếu tài khoản -> mã thoát %d + BLOCKED · đủ -> 0 · mật khẩu không lọt ra' % r.returncode


# ══════════════════════════════════════════════════════════════════════════════
# B. HÀNG RÀO AN TOÀN
# ══════════════════════════════════════════════════════════════════════════════
@kiem('B1 case ĐỌC không bị chặn · case có thao tác GHI bị chặn')
def b1(goc, _app):
    import chay_live as cl
    src = dung_bo_case(goc, 'ManD')
    cs = cl.doc_cases(src)
    cong = cl.Cong()
    lop = {}
    for c in cs:
        lop[c.b] = cl.phan_loai(c, cong)[0]
    for loai, b, _c, _d in CASES:
        if loai == 'CHAN':
            assert lop.get(b) == cl.CHAN, 'case ghi %r KHÔNG bị chặn (ra %s)' % (b[:40], lop.get(b))
        if loai == 'PE_DB':
            assert lop.get(b) == cl.PE_DB, 'case CSDL %r ra %s' % (b[:40], lop.get(b))
        if loai in ('P', 'F'):
            assert lop.get(b) is None, 'case đọc %r bị xếp nhầm vào %s' % (b[:40], lop.get(b))
    n_chan = sum(1 for v in lop.values() if v == cl.CHAN)
    return '%d case ghi bị chặn · %d case đọc đi tiếp' % (n_chan, sum(1 for v in lop.values() if v is None))


@kiem('B2 thao tác ngoài danh sách cho phép -> ChanAnToan (allowlist, không phải blacklist)')
def b2(goc, _app):
    import chay_live as cl
    cong = cl.Cong()
    cong.hanh_dong('doc_dom')                       # thao tác đọc: phải qua
    for xau in ('bam_luu', 'bam_xoa', 'goi_api_put', 'nhap_excel'):
        try:
            cong.hanh_dong(xau)
        except cl.ChanAnToan:
            continue
        raise AssertionError('thao tác %r KHÔNG bị chặn' % xau)
    return '4/4 thao tác lạ bị chặn · thao tác đọc vẫn qua'


@kiem('B3 PUT/DELETE không whitelist -> chặn; whitelist + dấu QA -> cho phép')
def b3(goc, _app):
    import chay_live as cl
    cong = cl.Cong()                                 # mặc định: không cho ghi
    for ma in ('123', 'ZZQA-1'):
        try:
            cong.ghi(ma, 'xóa bản ghi')
            raise AssertionError('ghi %r lọt khi chưa bật --cho-phep-ghi' % ma)
        except cl.ChanAnToan:
            pass
    c2 = cl.Cong(cho_phep_ghi=True, whitelist=['ZZQA-1'])
    try:
        c2.ghi('123', 'xóa bản ghi')
        raise AssertionError('bản ghi NGOÀI whitelist vẫn ghi được')
    except cl.ChanAnToan:
        pass
    # Từ 15/09 lượt 4 `ghi()` trả về **GIẤY THÔNG HÀNH** (dict) thay cho `True`: `live_ui.bam_ghi`
    # đòi vật chứng này, nên một đường ghi quên đi qua cổng sẽ ném lỗi ngay thay vì bấm được
    # nút Lưu. Phép kiểm theo đúng hợp đồng mới: truthy + mang đúng mã bản ghi.
    gp = c2.ghi('ZZQA-1', 'xóa bản ghi')
    assert gp and gp.get('ma') == 'ZZQA-1' and gp.get('thao_tac') == 'xóa bản ghi', gp
    c3 = cl.Cong(cho_phep_ghi=True, whitelist=['9999'])     # id trong whitelist nhưng KHÔNG mang dấu QA
    try:
        c3.ghi('9999', 'xóa bản ghi')
        raise AssertionError('id whitelist không mang dấu QA vẫn lọt (lưới thứ 3 hỏng)')
    except cl.ChanAnToan:
        pass
    return 'chặn 4 đường · cho phép đúng 1 đường (whitelist + dấu QA)'


@kiem('B4 bản ghi không mang dấu QA không được ghi nhận là của QA')
def b4(goc, _app):
    import chay_live as cl
    cong = cl.Cong(cho_phep_ghi=True)
    try:
        cong.them_ban_ghi_qa('42', 'Danh mục thật của khách hàng')
        raise AssertionError('bản ghi thật được ghi nhận là của QA')
    except cl.ChanAnToan:
        pass
    cong.them_ban_ghi_qa('42', 'ZZQA-test-42')
    assert cong.so_huu('42')
    return 'dấu QA là điều kiện cần để sở hữu'


def _sk(method, url):
    return {'method': 'Network.requestWillBeSent',
            'params': {'requestId': '1', 'type': 'XHR',
                       'request': {'method': method, 'url': url}}}


@kiem('B5 sổ mạng PHÂN LOẠI READ/AUTH/WRITE/UNKNOWN — KHÔNG xoá bản ghi nào')
def b5(goc, _app):
    import qalib
    sk = [_sk('GET', 'http://x/api/list'), _sk('POST', 'http://x/api/login'),
          _sk('POST', 'http://x/api/source-types'), _sk('PUT', 'http://x/api/source-types/1'),
          _sk('DELETE', 'http://x/api/source-types/1'), _sk('HEAD', 'http://x/favicon.ico'),
          _sk('PROPFIND', 'http://x/dav'), _sk('', 'http://x/?')]
    so = qalib.so_mang(sk)
    assert len(so) == len(sk), 'sổ mất bản ghi: %d/%d — bằng chứng không được xoá' % (len(so), len(sk))
    lop = [x['loai'] for x in so]
    assert lop == [qalib.READ, qalib.AUTH, qalib.GHI, qalib.GHI, qalib.GHI, qalib.READ,
                   qalib.LA, qalib.LA], lop
    auth = [x for x in so if x['loai'] == qalib.AUTH][0]
    assert 'explicitly allowed' in auth['ly_do'], auth
    vp = qalib.vi_pham_mang(so)
    assert [x['method'] for x in vp] == ['POST', 'PUT', 'DELETE', 'PROPFIND', '?'], vp
    # endpoint ĐỌC dựng bằng POST: chỉ được bỏ qua khi khai TƯỜNG MINH, và vẫn nằm trong sổ.
    # ⚠️ Khai `/api/source-types` mở ĐÚNG `POST /api/source-types` — KHÔNG mở `PUT` và `DELETE`
    # trên `/api/source-types/1`. Bản trước khớp chuỗi con nên một dòng khai endpoint ĐỌC kéo
    # theo cả hai thao tác GHI ở dưới nó, và phép kiểm này lúc ấy chốt đúng cái sai đó
    # (kỳ vọng cũ: chỉ còn PROPFIND + '?'). Sửa 15/09 lượt 3 cùng với `qalib.khop_endpoint`.
    so2 = qalib.so_mang(sk, cho_phep_read=('/api/source-types',))
    assert len(so2) == len(sk)
    assert [x['method'] for x in qalib.vi_pham_mang(so2)] == ['PUT', 'DELETE', 'PROPFIND', '?'], \
        [x['method'] for x in qalib.vi_pham_mang(so2)]
    assert so2[2]['loai'] == qalib.CHO_PHEP_READ, so2[2]
    return ('8/8 bản ghi được giữ · phân loại đúng · AUTH có lý do · khai 1 endpoint ĐỌC chỉ '
            'mở ĐÚNG nó (PUT/DELETE dưới cùng tiền tố VẪN là vi phạm)')


@kiem('B5b sổ mạng CHE bí mật: mật khẩu/token trong URL · không có header/cookie/body')
def b5b(goc, _app):
    import qalib
    import browser_manager as bm
    ev = {'method': 'Network.requestWillBeSent',
          'params': {'requestId': '7', 'type': 'XHR', 'timestamp': 1.0,
                     'request': {'method': 'POST',
                                 'url': 'https://x/api/login?password=sieu-bi-mat&token=abc123',
                                 'postData': '{"password":"sieu-bi-mat"}',
                                 'headers': {'Authorization': 'Bearer eyJhbGciOi.JIUzI1NiI.s5c',
                                             'Cookie': 'phien=xyz'}}}}
    gon = bm._gon_su_kien(ev)
    phang = json.dumps(gon, ensure_ascii=False)
    # Cắt tại NGUỒN: header/cookie/body không bao giờ vào bộ nhớ sổ. (URL thô còn ở đây vì che
    # URL là LUẬT — nằm ở `qalib.che_url` — và chỉ cần che trước khi ghi/in.)
    for xau in ('Authorization', 'Bearer', 'Cookie', 'phien=xyz', 'postData',
                '{"password"'):
        assert xau not in phang, 'bí mật %r còn trong sự kiện đã gọn' % xau
    assert gon['params']['request']['has_post_data'] is True, 'mất dấu vết "có body"'
    assert bm._gon_su_kien({'method': 'Network.requestWillBeSentExtraInfo',
                            'params': {'associatedCookies': [{'cookie': {'value': 'bi-mat'}}]}}) \
        is None, 'sự kiện KHÔNG phải request vẫn lọt vào sổ'
    so = qalib.so_mang([gon])
    phang = json.dumps(so, ensure_ascii=False)
    assert 'sieu-bi-mat' not in phang and 'abc123' not in phang, phang
    assert 'ĐÃ CHE' in phang, 'không thấy dấu che'
    assert so[0]['loai'] == qalib.AUTH
    jwt = qalib.che_url('https://x/cb#id_token=eyJhbGciOiJIUzI1NiI.eyJzdWIiOiIxIn0.s5cQ7Yk')
    assert 'eyJzdWIiOiIxIn0' not in jwt, jwt
    return 'header/cookie/body bị cắt tại nguồn · mật khẩu·token·JWT bị che khi ghi'


@kiem('B5c thấy request GHI -> DỪNG lượt chạy, ghi bằng chứng TRƯỚC khi dừng')
def b5c(goc, _app):
    import chay_live as cl
    import qalib
    import session_manager as sm
    ss = sm.Session('kiem-so-mang', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})
    cong = cl.Cong(ss=ss)
    sach = qalib.so_mang([_sk('GET', 'http://x/api/list'), _sk('POST', 'http://x/api/login')])
    assert cong.kiem_so_mang(sach, ss) is sach, 'sổ sạch mà vẫn chặn'
    ban = sach + qalib.so_mang([_sk('DELETE', 'http://x/api/source-types/9')])
    try:
        cong.kiem_so_mang(ban, ss)
        raise AssertionError('có DELETE mà lượt chạy vẫn đi tiếp')
    except cl.ChanAnToan as e:
        assert 'DELETE' in str(e)
    d = json.load(open(os.path.join(ss.d_evi, 'mang.json'), encoding='utf-8'))
    assert d['so_vi_pham'] == 1 and len(d['so_mang']) == 3, d['dem']
    return 'DELETE -> ChanAnToan · evidence có đủ 3 bản ghi (không xoá cái nào)'


@kiem('B5d allowlist khớp CHÍNH XÁC origin+path — không substring, không endswith')
def b5d(goc, _app):
    """TEST 2·9·10 của chỉ thị 15/09 lượt 3 (PHẦN 3+4).

    Lớp lỗi ở đây không phải "quên chặn" mà là "khớp rộng hơn thứ mình khai". Một dòng
    allowlist khớp rộng là một họ endpoint được mở mà không ai cố ý mở — và nó không bao
    giờ hiện ra ở kết quả chạy, vì kết quả chạy chỉ nói "0 WRITE".
    """
    import qalib
    hong = []

    def can(method, url, mong, cho_phep=(), vi_sao=''):
        that = qalib.phan_loai_request(method, url, cho_phep)[0]
        if that != mong:
            hong.append('%s %s -> %s (mong %s) %s' % (method, url, that, mong, vi_sao))

    # ── TEST 2 + TEST 9: endpoint ĐĂNG NHẬP ──────────────────────────────────────
    can('POST', 'https://app.vn/login', qalib.AUTH, (), 'đúng endpoint')
    can('POST', 'https://app.vn/login/', qalib.AUTH, (), 'dấu / cuối là cùng một endpoint')
    can('POST', 'https://app.vn/LOGIN', qalib.AUTH, (), 'path không phân biệt hoa thường ở đây')
    can('POST', 'https://app.vn/login?next=%2Fhome', qalib.AUTH, (), 'query không đổi endpoint')
    can('POST', 'https://app.vn/foo/login', qalib.GHI, (), '<- endswith cũ cho lọt')
    can('POST', 'https://app.vn/admin/login', qalib.GHI, (), '<- endswith cũ cho lọt')
    can('POST', 'https://app.vn/login-extra', qalib.GHI, (), 'tên dài hơn = endpoint khác')
    can('POST', 'https://app.vn/api/auth/users/9', qalib.GHI, (), 'auth chung chung phải KHÔNG nuốt')
    can('POST', 'https://app.vn/api%2Flogin', qalib.GHI, (),
        '%2F KHÔNG phải dấu ngăn đoạn — không được chuẩn hoá thành /api/login')

    # ── TEST 10: --mang-cho-phep ─────────────────────────────────────────────────
    cp = ('/api/source-types',)
    can('POST', 'https://app.vn/api/source-types', qalib.CHO_PHEP_READ, cp, 'ĐÚNG endpoint đã khai')
    can('POST', 'https://app.vn/api/source-types?page=2&q=a', qalib.CHO_PHEP_READ, cp,
        'query không biến nó thành endpoint khác')
    can('POST', 'https://app.vn/api/evil/source-types', qalib.GHI, cp, '<- `in url` cũ cho lọt')
    can('POST', 'https://app.vn/api/source-types-extra', qalib.GHI, cp, '<- `in url` cũ cho lọt')
    can('POST', 'https://app.vn/foo/api/source-types', qalib.GHI, cp, '<- `in url` cũ cho lọt')
    can('POST', 'https://app.vn/api/source-types/1', qalib.GHI, cp, 'bản ghi con KHÔNG được mở')
    can('POST', 'https://app.vn/api/evil?x=/api/source-types', qalib.GHI, cp,
        'query không được dùng để lách allowlist')
    can('PUT', 'https://app.vn/api/source-types', qalib.GHI, cp,
        'khai endpoint ĐỌC chỉ mở POST, không mở PUT')
    can('DELETE', 'https://app.vn/api/source-types', qalib.GHI, cp, 'càng không mở DELETE')

    # khai kèm ORIGIN -> origin khác/cổng khác là endpoint khác
    cp2 = ('https://app.vn/api/x',)
    can('POST', 'https://app.vn/api/x', qalib.CHO_PHEP_READ, cp2, 'đúng origin + path')
    can('POST', 'https://evil.vn/api/x', qalib.GHI, cp2, 'origin khác')
    can('POST', 'https://app.vn:8443/api/x', qalib.GHI, cp2, 'cổng khác = origin khác')
    can('POST', 'http://app.vn/api/x', qalib.GHI, cp2, 'scheme khác = origin khác')

    # dòng khai RỖNG không được mở gì
    for rong in ('', '   ', None):
        can('POST', 'https://app.vn/bat-ky', qalib.GHI, (rong,), 'khai rỗng')

    # ── QA_AUTH_ENDPOINTS: app đặt route khác thì ĐỌC từ env, không tự đoán ───────
    cu = os.environ.get('QA_AUTH_ENDPOINTS')
    os.environ['QA_AUTH_ENDPOINTS'] = '/sso/dang-nhap'
    try:
        can('POST', 'https://app.vn/sso/dang-nhap', qalib.AUTH, (), 'route khai qua env')
        can('POST', 'https://app.vn/login', qalib.GHI, (),
            'env ĐÈ danh sách mặc định — không cộng dồn')
        can('POST', 'https://app.vn/x/sso/dang-nhap', qalib.GHI, (), 'vẫn khớp chính xác')
    finally:
        if cu is None:
            os.environ.pop('QA_AUTH_ENDPOINTS', None)
        else:
            os.environ['QA_AUTH_ENDPOINTS'] = cu
    assert not hong, 'khớp SAI %d chỗ:\n     %s' % (len(hong), '\n     '.join(hong))
    return '25 phép khớp: AUTH · --mang-cho-phep · origin+cổng+scheme · env · khai rỗng'


@kiem('B5e TEST 1·3–8: GET sạch không dừng · POST/PUT/PATCH/DELETE/lạ -> DỪNG')
def b5e(goc, _app):
    import chay_live as cl
    import qalib
    import session_manager as sm
    ss = sm.Session('kiem-adv-mang', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})

    def chay(sk, cho_phep=()):
        """-> None nếu đi tiếp, hoặc câu lỗi nếu DỪNG."""
        cong = cl.Cong(ss=ss)
        try:
            cong.kiem_so_mang(qalib.so_mang(sk, cho_phep), ss)
            return None
        except cl.ChanAnToan as e:
            return str(e)

    # TEST 1 — ba GET: KHÔNG được dừng
    assert chay([_sk('GET', 'http://x/a'), _sk('GET', 'http://x/b'),
                 _sk('GET', 'http://x/c')]) is None, 'GET sạch mà vẫn dừng'
    # TEST 2 — POST đúng endpoint đăng nhập: KHÔNG dừng
    assert chay([_sk('GET', 'http://x/a'), _sk('POST', 'http://x/api/login')]) is None, \
        'POST đăng nhập đúng endpoint mà vẫn dừng'
    # TEST 3–7 — mỗi method một lần, phải DỪNG và phải NÊU TÊN method
    for m, u in (('POST', 'http://x/api/khong-khai'), ('PUT', 'http://x/api/x/1'),
                 ('PATCH', 'http://x/api/x/1'), ('DELETE', 'http://x/api/x/1'),
                 ('PROPFIND', 'http://x/dav'), ('BREW', 'http://x/coffee')):
        e = chay([_sk('GET', 'http://x/a'), _sk(m, u)])
        assert e and m in e, '%s KHÔNG làm dừng lượt chạy (%r)' % (m, e)
    # TEST 7b — method rỗng/không đọc được -> UNKNOWN -> dừng (không đoán là đọc)
    assert chay([_sk('', 'http://x/?')]), 'method rỗng mà vẫn đi tiếp'
    # TEST 9 — sai path đăng nhập thì KHÔNG được thành AUTH
    e = chay([_sk('POST', 'http://x/foo/login')])
    assert e and 'POST' in e, 'POST /foo/login mượn được suất của /login'
    # TEST 10 — sai path đã khai thì KHÔNG được thành ALLOWLISTED_READ
    e = chay([_sk('POST', 'http://x/api/evil/list')], cho_phep=('/api/list',))
    assert e, 'POST /api/evil/list mượn được suất của /api/list'
    return '3 GET đi tiếp · login đi tiếp · POST/PUT/PATCH/DELETE/PROPFIND/BREW/rỗng đều DỪNG'


@kiem('B5f TEST 8: requestWillBeSentExtraInfo KHÔNG đẻ ra UNKNOWN giả')
def b5f(goc, _app):
    import browser_manager as bm
    import qalib
    # Sự kiện này KHÔNG có `request` — nó mang `associatedCookies` + header. Lọt vào sổ thì
    # vừa đẻ vi phạm giả (dừng oan cả lượt chạy) vừa kéo theo cookie vào bằng chứng.
    xau = {'method': 'Network.requestWillBeSentExtraInfo',
           'params': {'requestId': '1', 'headers': {'Cookie': 'phien=bi-mat'},
                      'associatedCookies': [{'cookie': {'name': 'sid', 'value': 'bi-mat'}}]}}
    assert bm._gon_su_kien(xau) is None, 'ExtraInfo lọt vào sổ'
    tot = _sk('GET', 'http://x/a')
    so = qalib.so_mang([bm._gon_su_kien(tot)])
    assert [x['loai'] for x in so] == [qalib.READ], so
    assert not qalib.vi_pham_mang(so), 'GET sạch mà thành vi phạm'
    # và bộ lọc ở tầng WS khớp ĐÚNG TÊN, không khớp tiền tố
    ws = bm.WS.__new__(bm.WS)
    ws.su_kien, ws.su_kien_bo = __import__('collections').deque(maxlen=10), 0
    ws.loc_su_kien = ('Network.requestWillBeSent',)
    assert 'Network.requestWillBeSentExtraInfo' not in ws.loc_su_kien
    return 'ExtraInfo -> None (không vào sổ, không kéo cookie theo) · lọc khớp đúng tên'


@kiem('B5g TEST 11: 1200 request — evidence KHÔNG bị cắt âm thầm')
def b5g(goc, _app):
    import chay_live as cl
    import qalib
    import session_manager as sm
    ss = sm.Session('kiem-1200', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})
    sk = [_sk('GET', 'http://x/api/list?p=%d' % i) for i in range(1200)]
    so = qalib.so_mang(sk)
    assert len(so) == 1200, 'so_mang đã mất bản ghi: %d' % len(so)
    cl.Cong(ss=ss).kiem_so_mang(so, ss)
    d = json.load(open(os.path.join(ss.d_evi, 'mang.json'), encoding='utf-8'))
    # Bản trước ghi `so[-500:]` rồi vẫn in "sổ mạng 1200 request" — 700 bản ghi biến mất mà
    # không một dòng nào nói chúng đi đâu. Đây là phép chốt chặn chính xác chỗ đó.
    assert d['tong_request'] == 1200, d['tong_request']
    assert d['so_luu'] == 1200, 'evidence chỉ còn %d/1200 bản ghi' % d['so_luu']
    assert d['so_bo_qua'] == 0 and d['day_du'] is True, d
    assert d['canh_bao'] == [], d['canh_bao']
    assert len(d['so_mang']) == 1200, len(d['so_mang'])

    # Có ĐẶT hạn mức thì phải KÊU, và vi phạm KHÔNG bao giờ nằm trong phần bị cắt
    cu = cl.GIOI_HAN_EVIDENCE
    try:
        cl.GIOI_HAN_EVIDENCE = 500
        so2 = so + qalib.so_mang([_sk('DELETE', 'http://x/api/x/9')])
        cong = cl.Cong(ss=ss)
        try:
            cong.kiem_so_mang(so2, ss)
            raise AssertionError('DELETE giữa 1200 GET mà không dừng')
        except cl.ChanAnToan:
            pass
        d2 = json.load(open(os.path.join(ss.d_evi, 'mang.json'), encoding='utf-8'))
        assert d2['tong_request'] == 1201 and d2['so_luu'] == 500, d2
        assert d2['so_bo_qua'] == 701 and d2['day_du'] is False, d2
        assert 'EVIDENCE_TRUNCATED' in d2['canh_bao'], d2['canh_bao']
        assert [x['method'] for x in d2['so_mang'] if x['loai'] == qalib.GHI] == ['DELETE'], \
            'bản ghi VI PHẠM bị cắt mất khỏi evidence'
    finally:
        cl.GIOI_HAN_EVIDENCE = cu
    return ('1200/1200 bản ghi xuống đĩa · mặc định KHÔNG hạn mức · có hạn mức thì mang cờ '
            'EVIDENCE_TRUNCATED + đủ 3 con số, và giữ nguyên bản ghi vi phạm')


@kiem('B5h PHẦN 6: evidence CHỈ NỐI THÊM — buffer sự kiện xoá được, sổ tích luỹ thì KHÔNG')
def b5h(goc, _app):
    """Phân biệt hai thứ hay bị gọi chung là "xoá evidence".

    A (hợp lệ)  buffer sự kiện của Chrome: đã CHÉP sang sổ tích luỹ rồi mới clear.
    B (cấm)     sổ tích luỹ: không pop/remove/clear/ghi đè/cắt âm thầm.
    """
    import collections
    import browser_manager as bm
    import qalib

    ws = bm.WS.__new__(bm.WS)
    ws.su_kien, ws.su_kien_bo, ws.loc_su_kien = collections.deque(maxlen=10), 0, ('N',)
    c = bm.Chrome.__new__(bm.Chrome)
    c.ws = ws

    tich_luy = []
    ws.su_kien.extend([bm._gon_su_kien(_sk('GET', 'http://x/1')),
                       bm._gon_su_kien(_sk('GET', 'http://x/2'))])
    tich_luy += qalib.so_mang(c.lay_mang())                    # copy ...
    assert len(ws.su_kien) == 0, 'buffer chưa được dọn'        # ... rồi clear: HỢP LỆ
    assert len(tich_luy) == 2, tich_luy
    ws.su_kien.append(bm._gon_su_kien(_sk('POST', 'http://x/api/login')))
    tich_luy += qalib.so_mang(c.lay_mang())
    assert [x['method'] for x in tich_luy] == ['GET', 'GET', 'POST'], tich_luy
    assert len(ws.su_kien) == 0

    # Nguồn: không có chỗ nào đụng tới sổ TÍCH LUỸ ngoài phép nối.
    src = open(os.path.join(TOOLS, 'chay_live.py'), encoding='utf-8').read()
    for cam in ('so_mang.pop', 'so_mang.remove', 'so_mang.clear', 'del so_mang',
                'so_mang[-500:]', 'so_mang = []  #', 'so_mang[:] ='):
        assert cam not in src, 'chay_live.py có %r — sổ tích luỹ phải CHỈ NỐI THÊM' % cam
    # Phép NỐI phải còn. Từ 15/09 lượt 4 nó nằm trong `_vet_mang()` (một chỗ duy nhất, vì sổ
    # còn phải được phân loại kèm CỬA SỔ GHI đang mở) nên viết bằng `extend`; chấp nhận cả hai
    # lối viết, nhưng bắt buộc phải có ít nhất một.
    assert (src.count('so_mang = list(so_mang) + them')
            + src.count('so_mang.extend(them)')) >= 1, 'phép nối sổ biến mất'
    assert 'so_mang.extend' in src or 'list(so_mang) + them' in src

    # `deque(maxlen=)` vứt bản ghi cũ: phải ĐẾM được, và lượt chạy phải fail-closed.
    for i in range(14):
        gon = bm._gon_su_kien(_sk('GET', 'http://x/%d' % i))
        if ws.su_kien.maxlen and len(ws.su_kien) >= ws.su_kien.maxlen:
            ws.su_kien_bo += 1
        ws.su_kien.append(gon)
    assert c.so_su_kien_bo() == 4, c.so_su_kien_bo()

    import chay_live as cl
    import session_manager as sm
    ss = sm.Session('kiem-tran', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})
    try:
        cl.Cong(ss=ss).kiem_so_mang(qalib.so_mang([_sk('GET', 'http://x/a')]), ss, bo_roi=4)
        raise AssertionError('hàng đợi tràn 4 bản ghi mà lượt chạy vẫn báo sạch')
    except cl.ChanAnToan as e:
        assert 'vứt 4 request' in str(e), e
    d = json.load(open(os.path.join(ss.d_evi, 'mang.json'), encoding='utf-8'))
    assert d['su_kien_roi_hang_doi'] == 4 and d['day_du'] is False, d
    assert 'EVENT_QUEUE_OVERFLOW' in d['canh_bao'], d['canh_bao']

    # BƠM HỤT cũng phải fail-closed: "sổ rỗng vì không có request" và "sổ rỗng vì không đọc
    # được" đọc lên giống hệt nhau, nên không được phép trả lời "sạch" cho cái thứ hai.
    try:
        cl.Cong(ss=ss).kiem_so_mang(qalib.so_mang([_sk('GET', 'http://x/a')]), ss, bom_hong=2)
        raise AssertionError('bơm sổ hụt 2 lần mà lượt chạy vẫn báo sạch')
    except cl.ChanAnToan as e:
        assert 'KHÔNG ĐỌC ĐƯỢC sổ mạng 2 lần' in str(e), e
    d2 = json.load(open(os.path.join(ss.d_evi, 'mang.json'), encoding='utf-8'))
    assert d2['bom_hong'] == 2 and d2['day_du'] is False, d2
    return ('buffer copy-rồi-clear = hợp lệ · sổ tích luỹ chỉ nối thêm · hàng đợi tràn VÀ bơm '
            'hụt đều ĐẾM được và làm lượt chạy fail-closed (không nhận là sạch)')


@kiem('B5i TEST 7 (PHẦN 7): URL/JWT/header/body — không một bí mật nào xuống đĩa')
def b5i(goc, _app):
    import browser_manager as bm
    import chay_live as cl
    import qalib
    import session_manager as sm
    BI_MAT = ('sieu-bi-mat', 'abc123', 'Bearer', 'phien=xyz', 'eyJzdWIiOiIxIn0',
              'mk-cua-toi', 'otp-999', 'sk_live_41')
    ev = [{'method': 'Network.requestWillBeSent',
           'params': {'requestId': '1', 'type': 'XHR',
                      'request': {'method': 'POST',
                                  'url': 'https://x/api/x?token=abc123&password=sieu-bi-mat',
                                  'postData': '{"password":"mk-cua-toi"}',
                                  'headers': {'Authorization': 'Bearer eyJhbGciOi.JIUzI1NiI.s5c',
                                              'Cookie': 'phien=xyz'}}}},
          {'method': 'Network.requestWillBeSent',
           'params': {'requestId': '2', 'type': 'XHR',
                      'request': {'method': 'GET',
                                  'url': 'https://x/cb/eyJhbGciOiJIUzI1NiI.eyJzdWIiOiIxIn0.s5cQ7Yk'
                                         '?otp=otp-999&api_key=sk_live_41&secret=s'}}}]
    gon = [bm._gon_su_kien(e) for e in ev]
    so = qalib.so_mang(gon)
    ss = sm.Session('kiem-bi-mat', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})
    cong = cl.Cong(ss=ss)
    try:
        cong.kiem_so_mang(so, ss)          # có POST ngoài allowlist -> dừng, nhưng vẫn ghi sổ
    except cl.ChanAnToan:
        pass
    cong.cat_nhat_ky()
    # soi TOÀN BỘ những gì đã xuống đĩa của phiên này, không chỉ mang.json
    for thu_muc, _, ten in os.walk(os.path.dirname(ss.d_evi.rstrip('/'))):
        for t in ten:
            noi_dung = open(os.path.join(thu_muc, t), encoding='utf-8', errors='replace').read()
            for bm_ in BI_MAT:
                assert bm_ not in noi_dung, 'bí mật %r nằm trong %s' % (bm_, t)
    d = json.load(open(os.path.join(ss.d_evi, 'mang.json'), encoding='utf-8'))
    phang = json.dumps(d, ensure_ascii=False)
    for khoa in ('headers', 'postData', 'Cookie', 'Authorization'):
        assert khoa not in phang, '%r còn trong evidence' % khoa
    assert 'ĐÃ CHE' in phang, 'không thấy dấu che — URL bị ghi thô?'
    assert d['so_mang'][0]['method'] == 'POST' and d['so_mang'][1]['method'] == 'GET', d['so_mang']
    return '8 bí mật · 0 xuất hiện trong mọi file của phiên · URL còn đọc được, phần nhạy cảm bị che'


@kiem('B6 nhận dạng thao tác ghi: đúng câu lệnh, KHÔNG bắt nhầm danh từ')
def b6(goc, _app):
    import qalib
    phai_bat = ['1. Bấm nút "Lưu".', 'Nhập liệu > Lưu', '2. Bấm nút "Xác nhận xóa".',
                'Chọn bản ghi rồi bấm Duyệt.', '3. Click button Cập nhật']
    khong_bat = ['Đối chiếu với dữ liệu đang lưu của chính bản ghi đang mở.',
                 'Mở màn Vị trí lưu trữ, chưa lọc gì.',
                 '1. Xoá trắng ô "Số bản ghi/trang" rồi gõ 0.',
                 '2. Bấm nút "Xóa lọc".',
                 'Ghi lại dòng "Cập nhật: ..." ở góc phải phía trên bảng.',
                 '1. Kiểm tra hiển thị nút "Lưu".']
    sai = [t for t in phai_bat if not qalib.thao_tac_ghi(t)]
    oan = [t for t in khong_bat if qalib.thao_tac_ghi(t)]
    assert not sai, 'BỎ SÓT thao tác ghi: %s' % sai
    assert not oan, 'CHẶN OAN case đọc: %s' % oan
    return '%d/%d bắt đúng · %d/%d không chặn oan' % (len(phai_bat), len(phai_bat),
                                                      len(khong_bat), len(khong_bat))


# ══════════════════════════════════════════════════════════════════════════════
# C. PHÉP ĐO  (không cần Chrome — dựng sẵn dữ kiện màn)
# ══════════════════════════════════════════════════════════════════════════════
def _man_gia(perpage='20', trang_thai='-- Chọn Trạng thái --'):
    return {'url': 'http://x/admin/ManA', 'h1': 'Màn A', 'breadcrumb': ['Trang chủ', 'Màn A'],
            'sidebar_active': [], 'cot': ['STT', 'Mã', 'Tên', 'Trạng thái', 'Thao tác'],
            'icon_dong': [], 'the_so_lieu': [{'nhan': 'TỔNG BẢN GHI', 'gia_tri': '5'},
                                             {'nhan': 'ĐANG HOẠT ĐỘNG', 'gia_tri': '3'}],
            'phan_trang': {'so_ban_ghi_trang': perpage, 'tong': '5',
                           'o_so_ban_ghi': {'the': 'select', 'nhan': 'Số bản ghi trên trang',
                                            'gia_tri': perpage},
                           'o_nhap_trang': 'có, đang là 1'},
            'nut_dau_man': ['Thêm mới', 'Xuất excel', 'Tải lại'],
            'thanh_loc': [{'the': 'input[text]', 'nhan': 'Tìm kiếm', 'gia_tri': '',
                           'goi_y': 'Nhập từ khoá tìm kiếm'},
                          {'the': 'select', 'nhan': 'Trạng thái', 'gia_tri': trang_thai,
                           'goi_y': ''}],
            'form_them': {'tieu_de': 'Thêm mới', 'control': [
                {'the': 'input[text]', 'nhan': 'Mã', 'gia_tri': '', 'bat_buoc': True,
                 'maxlength': 20},
                {'the': 'select', 'nhan': 'Trạng thái', 'gia_tri': '-- Chọn --', 'goi_y': ''}]},
            'form_sua': None}


@kiem('B5j TEST 12+13: WRITE lộ ở case 4 -> case 5 trở đi KHÔNG chạy, workbook không bị ghi')
def b5j(goc, _app):
    """Phép kiểm CHỐT của chỉ thị 15/09 lượt 3 (PHẦN 2).

    Bản trước đối chiếu sổ mạng đúng HAI lần: trước case đầu và sau case CUỐI. Một `DELETE`
    phát sinh ở case 4 của 297 case chỉ lộ ra khi cả 297 case đã chạy xong — đó là biên bản
    khám nghiệm, không phải hàng rào.

    Chạy **vòng lặp thật** của `chay_mot_man` (phân loại · chấm · cất trạng thái · ghi
    workbook đều là mã thật), chỉ thay ĐÚNG ranh giới trình duyệt bằng một `Chrome` giả trả
    `DELETE` ở lần bơm thứ 4. Làm theo thời gian thật thì không đo được: mỗi case chấm xong
    trong chưa tới một phần nghìn giây nên không request nào kịp rơi vào đúng case số 4.
    """
    import chay_live as cl
    import qalib
    import session_manager as sm
    man = 'ManStop'
    dung_bo_case(goc, man)
    dat_url(goc, man, 'http://127.0.0.1:1/admin/%s' % man)
    tao_ket_qua(goc, man)
    dst = f_kq(goc, man)
    truoc = _md5(dst)

    class ChromeGia:
        """Ranh giới trình duyệt — KHÔNG thay gì khác của vòng lặp."""

        def __init__(self):
            self.lan = 0
            self.het_gio = False

        def so_su_kien_bo(self):
            return 0

        def so_bom_hong(self):
            return 0

        def bom_mang(self):
            self.lan += 1
            if self.lan == 4:                       # case thứ 4 làm app phát sinh DELETE
                return [_sk('DELETE', 'http://x/api/source-types/9')]
            return [_sk('GET', 'http://x/api/list?p=%d' % self.lan)]

        def close(self):
            pass

    chrome = ChromeGia()
    goi = {'n': 0}
    that_mo_man, that_ghi_chrome = cl._mo_man, cl.pl._ghi_chrome

    def mo_man_gia(v, ss, cong):
        cong.hanh_dong('dang_nhap', v.url)
        cong.hanh_dong('mo_man', v.url)
        cong.hanh_dong('doc_dom', 'soi()')
        cong.hanh_dong('doc_mang', 'Network.requestWillBeSent')
        ng = cl.Nguon(_man_gia('20'), qalib.ho_so_man(v.src), None, v.man, v.url)
        return ng, chrome, qalib.so_mang([_sk('POST', 'http://x/api/login')])

    def ghi_ket_qua_gia(*a, **k):
        goi['n'] += 1
        return that_ghi(*a, **k)

    that_ghi = cl.ghi_ket_qua
    cl._mo_man, cl.pl._ghi_chrome, cl.ghi_ket_qua = mo_man_gia, (lambda *a, **k: None), ghi_ket_qua_gia
    try:
        ss = sm.Session('kiem-stop-case4', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})
        v = cl.Viec('ChuyenVien', man, f_src(goc, man), dst, ss.sid,
                    url='http://127.0.0.1:1/admin/%s' % man, apply=True)
        try:
            cl.chay_mot_man(v, ss)
            raise AssertionError('DELETE ở case 4 mà lượt chạy vẫn chạy hết và ghi kết quả')
        except cl.ChanAnToan as e:
            assert 'DELETE' in str(e), e
            assert 'sau case 4' in str(e), 'không nêu được vi phạm lộ ra ở case nào: %s' % e
    finally:
        cl._mo_man, cl.pl._ghi_chrome, cl.ghi_ket_qua = that_mo_man, that_ghi_chrome, that_ghi

    # ① case 5 trở đi KHÔNG được chạy
    tt = (json.load(open(os.path.join(ss.d_kq, 'cases.json'), encoding='utf-8')) or {})
    # Đếm case đã CHẠY TRÊN APP = case mang kết luận do VÒNG LẶP sinh ra. Không đếm case bị
    # phân loại sẵn trước khi chạm app (PE-CSDL · chặn an toàn · không có phép đo nào khớp) —
    # chúng cũng nằm trong `cases.json` nhưng chưa bao giờ chạm tới màn.
    LOOP_CHUA_DO = 'phép đo không kết luận được trên dữ kiện đọc được'
    da_chay = [x for x in tt['cases'].values()
               if x.get('tt') in (cl.XONG, cl.LOI) or x.get('ly_do') == LOOP_CHUA_DO]
    assert chrome.lan == 4, 'bơm sổ mạng %d lần — phải dừng ngay sau case 4' % chrome.lan
    assert len(da_chay) == 4, 'đã chạy %d case trên app, phải đúng 4 rồi dừng' % len(da_chay)
    # ② vi phạm KHÔNG được biến thành một case FAIL nghiệp vụ
    assert not [x for x in tt['cases'].values() if x.get('ly_do', '').count('DELETE')], \
        'vi phạm mạng bị ghi thành lý do của một case'
    assert 'DUNG_AN_TOAN' in tt['tom_tat'], 'trạng thái phiên không nói đây là DỪNG AN TOÀN'
    # ③ TEST 13 — bằng chứng của chính request gây vi phạm còn nguyên
    d = json.load(open(os.path.join(ss.d_evi, 'mang.json'), encoding='utf-8'))
    assert d['moc'].startswith('sau case 4/'), 'mốc ghi sai chỗ vi phạm lộ ra: %r' % d['moc']
    assert d['day_du'] is True and d['so_bo_qua'] == 0, d
    vp = [x for x in d['so_mang'] if x['loai'] == qalib.GHI]
    assert [x['method'] for x in vp] == ['DELETE'], vp
    assert '/api/source-types/9' in vp[0]['url'], vp[0]
    assert [x['loai'] for x in d['so_mang']].count(qalib.AUTH) == 1, 'mất request đăng nhập'
    # ④ workbook KHÔNG bị chạm
    assert goi['n'] == 0, 'ghi_ket_qua() vẫn được gọi sau vi phạm'
    assert _md5(dst) == truoc, 'file kết quả bị sửa dù lượt chạy dừng an toàn'
    return ('dừng NGAY sau case 4/7 · 0 case sau chạy · DELETE còn trong evidence · '
            'workbook md5 không đổi · không biến vi phạm thành case FAIL')


@kiem('C1 phép đo luật cứng: 20 -> P · 50 -> F kèm khối [FIXED RULE VIOLATION]')
def c1(goc, _app):
    import chay_live as cl
    src = dung_bo_case(goc, 'ManE')
    cs = {c.b: c for c in cl.doc_cases(src)}
    case = cs['Kiểm tra giá trị mặc định ô số bản ghi trên trang']
    mark, note, _dk, _p = cl.do_case(case, cl.Nguon(_man_gia('20')))
    assert mark == 'P', 'màn đúng luật mà chấm %s' % mark
    mark, note, _dk, _p = cl.do_case(case, cl.Nguon(_man_gia('50')))
    assert mark == 'F' and 'FIXED RULE VIOLATION' in note, note[:200]
    return 'P/F đúng chiều · ghi chú đúng khuôn §0a-bis'


@kiem('C2 phép đo ô chọn: chữ gợi ý -> P · chọn sẵn giá trị nghiệp vụ -> F')
def c2(goc, _app):
    import chay_live as cl
    src = dung_bo_case(goc, 'ManF')
    cs = {c.b: c for c in cl.doc_cases(src)}
    case = cs['Kiểm tra giá trị mặc định Trạng thái']
    assert cl.do_case(case, cl.Nguon(_man_gia()))[0] == 'P'
    mark, note, _dk, _p = cl.do_case(case, cl.Nguon(_man_gia(trang_thai='Đang hoạt động')))
    assert mark == 'F' and 'FIXED RULE VIOLATION' in note, note[:200]
    return 'P/F đúng chiều'


@kiem('C3 màn đọc RỖNG -> không phép đo nào được chấm F (không kết luận từ dữ kiện trống)')
def c3(goc, _app):
    import chay_live as cl
    src = dung_bo_case(goc, 'ManG')
    ng = cl.Nguon({'h1': '', 'cot': [], 'breadcrumb': [], 'thanh_loc': [], 'nut_dau_man': [],
                   'the_so_lieu': [], 'phan_trang': {}, 'form_them': None})
    assert ng.rong, 'màn rỗng mà `rong` = False'
    xau = [c.b for c in cl.doc_cases(src)
           if (cl.do_case(c, ng) or ('', ''))[0] == 'F']
    assert not xau, 'chấm F trên màn không đọc được gì: %s' % xau[:3]
    return '0 kết luận F trên dữ kiện trống'


@kiem('C4 phạm vi CN: case của biểu mẫu CHỈNH SỬA không bị trả lời bằng ô của thanh lọc')
def c4(goc, _app):
    import chay_live as cl
    import phep_live

    class G:
        pass
    g = G()
    g.nhom = {'cn': 'CHỈNH SỬA MÀN A', 'grp': '', 'sub': '', 'sub2': 'Selectbox Trạng thái'}
    g.b = 'Kiểm tra giá trị mặc định Trạng thái'
    g.c, g.d, g.bp, g.rn = '', '', 'BP', 99
    assert cl.pham_vi(g) == 'sua'
    # ⚠️ Hợp đồng ĐỔI 15/09 lượt 4. Trước đây case này KHÔNG có phép nào vì lượt chạy chỉ-đọc
    # không mở được biểu mẫu Chỉnh sửa; nay nó đo được — nhưng chỉ bằng phép CẦN GHI, tức là
    # phải có bản ghi QA do chính lượt chạy tạo. Thứ phép kiểm này bảo vệ vẫn nguyên: **không
    # được trả lời case của biểu mẫu Chỉnh sửa bằng ô của thanh lọc**.
    assert cl._phep_cua(g, cho_phep_ghi=False) is None, \
        'lượt chạy CHỈ ĐỌC vẫn nhận đo case của biểu mẫu Chỉnh sửa'
    ten = cl._phep_cua(g, cho_phep_ghi=True)
    assert ten and phep_live.can_ghi(ten), \
        'case biểu mẫu Chỉnh sửa phải do phép CẦN GHI đảm nhiệm (được: %r)' % ten
    # Đường ĐỌC TĨNH (ảnh chụp DOM của màn danh sách) tuyệt đối không được trả lời case này.
    assert cl.do_case(g, cl.Nguon(_man_gia(trang_thai='Đang hoạt động'))) is None
    return ('khối CHỈNH SỬA: đường đọc tĩnh im lặng · chỉ-đọc không nhận · có dữ liệu QA thì '
            'phép `%s` đo bằng chính biểu mẫu Chỉnh sửa' % ten)


# ══════════════════════════════════════════════════════════════════════════════
# D. GHI KẾT QUẢ  (không cần Chrome — bơm trạng thái rồi gọi đúng pipeline ghi)
# ══════════════════════════════════════════════════════════════════════════════
def _doc_o(path, col, rn, bp=None):
    import tcfix
    return (tcfix.load(path, bp).c(rn, col) or '').strip()


def _o_xml(path, r_ref):
    z = zipfile.ZipFile(path)
    import tcfix
    tc = tcfix.load(path)
    s = z.read(tc.tcf).decode()
    m = re.search(r'<c r="%s"[^>]*?(?:/>|>.*?</c>)' % r_ref, s, re.S)
    return m.group(0) if m else ''


@kiem('D1 ghi đúng DÒNG theo nội dung · cột R vẫn là CÔNG THỨC · cột T có [Lần 1]')
def d1(goc, _app):
    import chay_live as cl
    dung_bo_case(goc, 'ManH')
    tao_ket_qua(goc, 'ManH')
    dst = f_kq(goc, 'ManH')
    cases = cl.doc_cases(dst)
    muc = {c.b: c for c in cases}
    b = 'Kiểm tra hiển thị nút "Thêm mới"'
    tt = {muc[b].key: {'bp': muc[b].bp, 'rn': muc[b].rn, 'tt': cl.XONG, 'mark': 'P',
                       'note': 'Màn thật có Button "Thêm mới".'}}
    n, _sh = cl.ghi_ket_qua(dst, cases, tt, 'F')
    assert n == 1, 'ghi %d dòng, chờ 1' % n
    assert _doc_o(dst, 'F', muc[b].rn) == 'P', 'ô F sai'
    assert '[Lần 1]' in _doc_o(dst, 'T', muc[b].rn), 'ghi chú thiếu tiền tố lượt chạy'
    khac = [c for c in cases if c.b != b]
    assert not [c for c in khac if _doc_o(dst, 'F', c.rn)], 'ghi lem sang dòng khác'
    xml = _o_xml(dst, 'R%d' % muc[b].rn)
    assert '<f>' in xml or '<f ' in xml, 'cột R KHÔNG còn công thức: %s' % xml[:120]
    return 'đúng 1 dòng · R còn công thức · T có [Lần 1]'


@kiem('D2 chạy hậu kỳ: cache cột R + sheet Tổng hợp dựng lại, formula_layer --check sạch')
def d2(goc, _app):
    import chay_live as cl
    dung_bo_case(goc, 'ManI')
    tao_ket_qua(goc, 'ManI')
    dst = f_kq(goc, 'ManI')
    cases = cl.doc_cases(dst)
    c0 = cases[0]
    cl.ghi_ket_qua(dst, cases, {c0.key: {'bp': c0.bp, 'rn': c0.rn, 'tt': cl.XONG,
                                         'mark': 'P', 'note': 'ok'}}, 'F')
    assert _doc_o(dst, 'R', c0.rn) == 'P', 'cache cột R chưa được dựng lại (đọc %r)' % _doc_o(dst, 'R', c0.rn)
    ma, dong = cl.nghiem_thu_ghi(dst)
    assert 'A-sai 0' in dong or 'A sai 0' in dong or ma == 0, dong
    return 'R cache = P · %s' % dong[:60]


@kiem('D3 ghi LẦN HAI bị chặn (không biến lượt 1 thành "[Lần 2]" oan)')
def d3(goc, _app):
    import chay_live as cl
    import session_manager as sm
    dung_bo_case(goc, 'ManJ')
    tao_ket_qua(goc, 'ManJ')
    dst = f_kq(goc, 'ManJ')
    cases = cl.doc_cases(dst)
    c0 = cases[0]
    tt = {c0.key: {'bp': c0.bp, 'rn': c0.rn, 'tt': cl.XONG, 'mark': 'P', 'note': 'ok'}}
    ss = sm.Session('kiem-ghi-2-lan', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})
    cl.ghi_ket_qua(dst, cases, tt, 'F', ss)
    n2, _ = cl.ghi_ket_qua(dst, cases, tt, 'F', ss)
    assert n2 == 0, 'ghi lại lần 2 vẫn ghi %d dòng' % n2
    assert '[Lần 2]' not in _doc_o(dst, 'T', c0.rn), 'ghi chú bị gắn [Lần 2] oan'
    n3, _ = cl.ghi_ket_qua(dst, cases, tt, 'F', ss, ghi_lai=True)
    assert n3 == 1, '--ghi-lai không ghi được'
    return 'lần 2 bỏ qua · --ghi-lai vẫn ghi được'


@kiem('D4 case CHƯA ĐO / bị CHẶN không được ghi gì vào file (ô trống là ô trống)')
def d4(goc, _app):
    import chay_live as cl
    dung_bo_case(goc, 'ManK')
    tao_ket_qua(goc, 'ManK')
    dst = f_kq(goc, 'ManK')
    cases = cl.doc_cases(dst)
    cong = cl.Cong()
    tt = {}
    for c in cases:
        lop, _ly = cl.phan_loai(c, cong)[:2]
        if lop == cl.CHAN:
            tt[c.key] = {'bp': c.bp, 'rn': c.rn, 'tt': cl.CHAN, 'mark': None, 'note': ''}
        elif lop == cl.CHUA_DO:
            tt[c.key] = {'bp': c.bp, 'rn': c.rn, 'tt': cl.CHUA_DO, 'mark': None}
    n, _ = cl.ghi_ket_qua(dst, cases, tt, 'F')
    assert n == 0, 'ghi %d dòng cho case chưa có kết luận' % n
    trong = [c for c in cases if _doc_o(dst, 'F', c.rn)]
    assert not trong, 'có ô kết quả bị điền: %s' % [c.rn for c in trong]
    return '0 ô bị điền cho %d case chưa kết luận' % len(tt)


# ══════════════════════════════════════════════════════════════════════════════
# E. RESUME
# ══════════════════════════════════════════════════════════════════════════════
@kiem('E1 resume: case đã XONG không chạy lại · case GHI đang dở -> CẦN KIỂM TAY')
def e1(goc, _app):
    import chay_live as cl
    import session_manager as sm
    src = dung_bo_case(goc, 'ManL')
    tao_ket_qua(goc, 'ManL')
    dst = f_kq(goc, 'ManL')
    cases = cl.doc_cases(dst)
    xong = [c for c in cases if c.b.startswith('Kiểm tra hiển thị nút')][0]
    ghi = [c for c in cases if c.thao_tac_ghi][0]
    ss = sm.Session('kiem-resume', os.path.join(goc, '_phien')).tao({'role': 'ChuyenVien'})
    sm.ghi_json(os.path.join(ss.d_kq, 'cases.json'),
                {'cases': {xong.key: {'bp': xong.bp, 'rn': xong.rn, 'tt': cl.XONG, 'mark': 'P',
                                      'note': 'từ lượt trước'},
                           ghi.key: {'bp': ghi.bp, 'rn': ghi.rn, 'tt': cl.DANG, 'mark': None}}})
    v = cl.Viec('ChuyenVien', 'ManL', src, dst, 'kiem-resume', url='http://127.0.0.1:1/x',
                dry=True, resume=True, goc=os.path.join(goc, '_phien'))
    kq = cl.chay_mot_man(v, ss.nap())
    tt = sm.doc_json(os.path.join(ss.d_kq, 'cases.json'))['cases']
    assert tt[xong.key]['tt'] == cl.XONG and tt[xong.key]['mark'] == 'P', 'case xong bị chạy lại'
    assert tt[ghi.key]['tt'] == cl.CAN_TAY, 'case ghi đang dở ra %s' % tt[ghi.key]['tt']
    return 'giữ nguyên case XONG · case ghi dở -> %s' % cl.CAN_TAY


# ══════════════════════════════════════════════════════════════════════════════
# F. CHẠY THẬT trên app giả  (cần Chrome)
# ══════════════════════════════════════════════════════════════════════════════
@kiem('F1 chạy thật: đăng nhập -> đọc màn -> chấm P/F đúng kỳ vọng -> ghi file')
def f1(goc, app):
    if not app:
        return None
    man = 'ManLive'
    dung_bo_case(goc, man)
    # `?bay=1` — biến thể KHÓ của app giả (thẻ số liệu đẩy thanh lọc xuống · nút `Tải lại` chỉ
    # có icon · ô số bản ghi/trang là Textbox nhập tự do). Chạy lớp B trên biến thể này để một
    # lượt kiểm chứng luôn cả hai lớp: lớp A đọc đủ control, lớp B chấm đúng trên dữ kiện đó.
    dat_url(goc, man, '%s/admin/%s?bay=1' % (app, man))
    tao_ket_qua(goc, man)
    # `--chi-doc`: bộ kiểm này chạy trên `app_gia.py` — app chỉ có HÌNH DẠNG DOM, không
    # có CRUD thật. Từ 16/09 lượt 2 chế độ mặc định là TỰ ĐỘNG (case GHI được chạy), nên
    # phải nói rõ đây là lượt CHỈ ĐỌC; vòng đời ghi có bộ kiểm riêng chạy trên
    # `app_gia_crud.py` (`kiem_qa_data` + `kiem_phep_moi`).
    r = chay(['ChuyenVien', man, '--apply', '--chi-doc', '--session', 'kiem-live'], goc)
    ra = r.stdout + r.stderr
    assert r.returncode == 0, 'mã thoát %d\n%s' % (r.returncode, ra[-1500:])
    dst = f_kq(goc, man)
    import chay_live as cl
    cases = {c.b: c for c in cl.doc_cases(dst)}
    kv = {}
    for loai, b, _c, _d in CASES:
        if loai in ('P', 'F'):
            kv.setdefault(b, []).append(loai)
    sai = []
    for b, mong in kv.items():
        rns = [c.rn for c in cl.doc_cases(dst) if c.b == b]
        thuc = [_doc_o(dst, 'F', rn) for rn in rns]
        if sorted(thuc) != sorted(mong):
            sai.append('%s: chờ %s được %s' % (b[:34], mong, thuc))
    assert not sai, 'kết quả lệch kỳ vọng:\n   ' + '\n   '.join(sai) + '\n' + ra[-900:]
    n_p = ra.count(' P  [')
    return 'ghi đúng %d case P/F như kỳ vọng (%d dòng P trong log)' % (sum(len(v) for v in kv.values()), n_p)


@kiem('F2 chạy thật: case CHẶN/CHƯA ĐO để TRỐNG · sổ mạng GIỮ login (AUTH) · 0 WRITE')
def f2(goc, app):
    if not app:
        return None
    import qalib
    man = 'ManLive'
    dst = f_kq(goc, man)
    import chay_live as cl
    cong = cl.Cong()
    for c in cl.doc_cases(dst):
        lop, _ = cl.phan_loai(c, cong)[:2]
        if lop in (cl.CHAN, cl.CHUA_DO):
            assert not _doc_o(dst, 'F', c.rn), 'case %s (%s) bị chấm %s' % (c.rn, lop, _doc_o(dst, 'F', c.rn))
    d_evi = os.path.join(goc, '_phien', 'kiem-live', 'evidence')
    at = json.load(open(os.path.join(d_evi, 'an-toan.json'), encoding='utf-8'))
    assert at['nhat_ky'], 'nhật ký hàng rào rỗng'
    assert all(x['cho_phep'] for x in at['nhat_ky']), 'có thao tác bị chặn mà lượt chạy vẫn tiếp'
    d = json.load(open(os.path.join(d_evi, 'mang.json'), encoding='utf-8'))
    dem, so = d['dem'], d['so_mang']
    assert d['so_vi_pham'] == 0, 'lượt chỉ-đọc mà có request ghi: %s' % [x for x in so
                                                                        if x['loai'] == qalib.GHI][:3]
    # Bằng chứng phải phản ánh thứ Chrome THẤY: request đăng nhập còn nguyên trong sổ, được
    # phân loại AUTH — không bị xoá để làm đẹp con số.
    auth = [x for x in so if x['loai'] == qalib.AUTH]
    assert auth, 'request đăng nhập biến mất khỏi sổ (bản 15/09 lượt 1 xoá nó — đã bỏ)'
    assert '/login' in auth[0]['url'], auth[0]
    assert dem[qalib.READ] > 0, dem
    phang = json.dumps(d, ensure_ascii=False)
    assert TK[1] not in phang and 'Authorization' not in phang and 'Cookie' not in phang, \
        'bí mật lọt vào evidence'
    return ('%d thao tác trong allowlist · sổ %d request: READ %d · AUTH %d · WRITE 0'
            % (len(at['nhat_ky']), len(so), dem[qalib.READ], dem[qalib.AUTH]))


@kiem('F3 chạy thật: PE-CSDL được chấm PE kèm khối [DB ACCESS REQUIRED]')
def f3(goc, app):
    if not app:
        return None
    dst = f_kq(goc, 'ManLive')
    import chay_live as cl
    import qalib
    pe = [c for c in cl.doc_cases(dst) if c.muc_db == 'toan_bo']
    assert pe, 'fixture không có case CSDL nào'
    for c in pe:
        assert _doc_o(dst, 'F', c.rn) == 'PE', 'case CSDL r%d chấm %r' % (c.rn, _doc_o(dst, 'F', c.rn))
        assert qalib.CO_PE_DB in _doc_o(dst, 'T', c.rn), 'thiếu khối %s' % qalib.CO_PE_DB
    return '%d case CSDL -> PE + khối đúng khuôn §4b' % len(pe)


@kiem('F5 Chrome THẬT: bơm sổ bắt được request phát sinh giữa hai case (lay_mang bỏ sót)')
def f5(goc, app):
    """Chứng minh phép đối chiếu sau mỗi case KHÔNG phải đồ trang trí.

    `WS` chỉ đọc socket trong lúc `call()` chờ phản hồi. Vòng chấm case đọc ảnh chụp DOM nên
    không gọi CDP lần nào ⇒ nếu chỉ `lay_mang()` thì sự kiện nằm nguyên trong socket của hệ
    điều hành và sổ luôn rỗng: đối chiếu sau mỗi case sẽ luôn nói "sạch", kể cả khi app vừa
    gửi `DELETE`. Phép này đo đúng khoảng chênh đó trên Chrome thật + app giả.
    """
    if not app:
        return None
    import browser_manager as bm
    import chay_live as cl
    import qalib
    prof = os.path.join(goc, '_chrome-f5')
    os.makedirs(prof, exist_ok=True)
    c = bm.Chrome(port='auto', profile=prof)
    try:
        c.go('%s/login' % app)
        time.sleep(0.6)
        assert c.bat_mang(), 'không bật được Network.enable'
        c.lay_mang()                                   # dọn phần phát sinh lúc mở trang
        # MỘT lệnh CDP đặt lịch: sau 300ms trang tự gửi 1 GET + 1 DELETE, rồi KHÔNG còn lệnh
        # CDP nào nữa — đúng hình dạng của vòng chấm case.
        c.js("setTimeout(function(){fetch('/api/nhip');"
             "fetch('/api/xoa/9',{method:'DELETE'});},300)")
        time.sleep(1.5)

        bo_sot = c.lay_mang()                          # đường CŨ: không bơm socket
        bom = c.bom_mang()                             # đường MỚI
        assert not bo_sot, ('lay_mang() đã thấy %d sự kiện — phép kiểm này không còn đo được '
                            'khoảng chênh (kiến trúc WS đã đổi?)' % len(bo_sot))
        so = qalib.so_mang(bom)
        ms = sorted(x['method'] for x in so)
        assert 'DELETE' in ms and 'GET' in ms, 'bơm sổ vẫn bỏ sót: %s' % ms
        vp = qalib.vi_pham_mang(so)
        assert [x['method'] for x in vp] == ['DELETE'], vp
        assert '/api/xoa/9' in vp[0]['url'], vp[0]
        # và hàng rào dừng thật khi cầm đúng cái sổ này
        try:
            cl.Cong().kiem_so_mang(so)
            raise AssertionError('sổ có DELETE mà hàng rào vẫn cho đi tiếp')
        except cl.ChanAnToan as e:
            assert 'DELETE' in str(e), e
        assert c.so_su_kien_bo() == 0, 'hàng đợi vứt bản ghi ngay ở lượt nhỏ này'
    finally:
        c.close()
    return ('lay_mang() bỏ sót 0/2 -> bơm sổ lấy đủ %d request (có DELETE) · hàng rào dừng đúng'
            % len(bom))


@kiem('F4 hai màn chạy SONG SONG: 2 phiên · 2 profile · kết quả riêng · 1 hỏng không kéo phiên kia')
def f4(goc, app):
    if not app:
        return None
    for man, url in (('ManP1', '%s/admin/ManP1?bay=1' % app),
                     ('ManP2', 'http://127.0.0.1:1/admin/x')):
        dung_bo_case(goc, man)
        dat_url(goc, man, url)
        tao_ket_qua(goc, man)
    r = chay(['ChuyenVien', 'ManP', '--parallel', '2', '--apply', '--chi-doc'],
             goc, giay=900)
    ra = r.stdout + r.stderr
    d = os.path.join(goc, '_phien')
    p1, p2 = os.path.join(d, 'live-ChuyenVien-ManP1'), os.path.join(d, 'live-ChuyenVien-ManP2')
    assert os.path.isdir(p1) and os.path.isdir(p2), 'thiếu thư mục phiên: %s' % os.listdir(d)
    st1 = json.load(open(os.path.join(p1, 'state.json'), encoding='utf-8'))
    st2 = json.load(open(os.path.join(p2, 'state.json'), encoding='utf-8'))
    assert st1['trang_thai'] == 'COMPLETED', 'phiên tốt lại hỏng: %s' % st1
    assert st2['trang_thai'] == 'FAILED', 'phiên trỏ URL chết lại báo %s' % st2['trang_thai']
    assert st1.get('cong') and st1.get('cong') != st2.get('cong'), 'hai phiên dùng chung cổng CDP'
    assert os.path.isdir(os.path.join(p1, 'chrome-profile'))
    n1 = len(json.load(open(os.path.join(p1, 'result', 'cases.json'),
                            encoding='utf-8'))['cases'])
    assert n1 > 0, 'phiên tốt không chấm được case nào'
    assert 'Failed:    1' in ra, 'bảng tổng kết không nêu phiên hỏng:\n%s' % ra[-400:]
    return 'phiên tốt COMPLETED (%d case) · phiên hỏng FAILED · cổng CDP %s ≠ %s' % (
        n1, st1.get('cong'), st2.get('cong'))


# ══════════════════════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--nhanh', action='store_true', help='bỏ các phép kiểm cần Chrome')
    a = ap.parse_args()

    if not os.path.exists(NEN):
        sys.exit('LỖI: không có file nền %s — bộ tự kiểm dựng fixture từ đó.' % NEN)
    import browser_manager as bm
    co_chrome = bool(shutil.which(bm.CHROME) or shutil.which('google-chrome')
                     or shutil.which('chromium'))
    goc = tempfile.mkdtemp(prefix='qa-kiem-chay-live-')
    # ⚠️ Bản lùi của các phép kiểm phải nằm TRONG thư mục tạm. Bản đầu chỉ đặt `QA_BAK_DIR` cho
    # tiến trình con, còn phép kiểm gọi `ghi_ket_qua()` NGAY TRONG tiến trình này — nên
    # `qalib.backup()` rơi về mặc định `<gốc repo>/bak` và một lượt tự kiểm để lại 364 file rác
    # trong `bak/_ngoai/tmp/...` của repo. Đặt ở đây là bịt cả hai đường.
    os.environ['QA_BAK_DIR'] = os.path.join(goc, '_bak')
    app = None
    sv = None
    print('TỰ KIỂM LỚP B — chạy case + ghi kết quả   ·   thư mục tạm %s' % goc)
    if not a.nhanh and co_chrome:
        import app_gia
        sv = app_gia.chay(0)
        app = 'http://127.0.0.1:%d' % sv.server_address[1]
        print('   app giả ở %s' % app)
    elif not a.nhanh:
        print('   (không có Chrome -> các phép kiểm chạy thật sẽ BỎ QUA, không tự nhận là đạt)')

    dat = hong = bo = 0
    try:
        for ten, f in KQ:
            t0 = time.time()
            try:
                ghi_chu = f(goc, app)
            except AssertionError as e:
                hong += 1
                _in(ten, False, str(e)[:200])
                continue
            except Exception as e:                       # noqa: BLE001
                hong += 1
                _in(ten, False, '%s: %s' % (type(e).__name__, str(e)[:160]))
                continue
            if ghi_chu is None:
                bo += 1
                _in(ten, False, 'BỎ QUA — không có Chrome, KHÔNG đo được', bo_qua=True)
            else:
                dat += 1
                _in(ten, True, '%5.1fs %s' % (time.time() - t0, ghi_chu))
    finally:
        if sv:
            sv.shutdown()
        shutil.rmtree(goc, ignore_errors=True)
    print('\n=== %d phép kiểm · %d ĐẠT · %d HỎNG · %d BỎ QUA ===' % (dat + hong + bo, dat, hong, bo))
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())
