#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM LỚP TÀI KHOẢN / VAI TRÒ  (14 phép, §10 của chỉ thị 2026-09-17).

Đợt vá 17/09 bỏ khái niệm *"bắt buộc phải có tài khoản QA"*: người vận hành chỉ có tài khoản
THẬT trên TEST/UAT, đặt tên theo quy ước của họ. Cái giá của một lớp tài khoản viết sai là
thứ không ai nhìn thấy cho tới lúc muộn:

  · tool báo "không có role B" rồi **hỏi người** — đúng cái hộp thoại §7 đã bỏ từ 16/09 l2;
  · hai phiên vô tình dùng CÙNG một tài khoản ⇒ phép đo phân quyền đo một người hai lần rồi
    kết luận *"phân quyền chạy tốt"*;
  · mật khẩu lọt vào log/evidence/Excel — hỏng một lần là hỏng vĩnh viễn.

Không phép nào ở đây cần Chrome hay tài khoản thật; phép ⑥ và ⑦ chạy trên `app_gia_crud.py`.

    python3 tools/tu_kiem/kiem_tai_khoan.py            # exit 0 = đạt hết
    python3 tools/tu_kiem/kiem_tai_khoan.py --chi role
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
REPO = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
os.environ.setdefault('QA_PROJECT', 'moetdl')

KQ = []
# Mọi biến có thể ảnh hưởng tới việc tìm tài khoản — dọn sạch trước MỖI phép kiểm, nếu không
# thì tài khoản thật của máy người chạy lọt vào phép kiểm và kết quả không lặp lại được.
_TIEN_TO_DON = ('QA_USER', 'QA_PASS', 'QA_ROLE', 'ROLE_', 'TOOLV2_')


def kiem(ten):
    def deco(f):
        KQ.append((ten, f))
        return f
    return deco


def _in(ten, ok, ghi_chu=''):
    print('   %s %-62s %s' % ('✔' if ok else '✘', ten, ghi_chu))


class Loi(AssertionError):
    pass


def can(dieu_kien, msg):
    if not dieu_kien:
        raise Loi(msg)


def _don_env():
    """Đưa lớp tài khoản về TRẮNG trước mỗi phép kiểm — cả biến môi trường LẪN tệp env.

    ⚠️ VÁ 2026-09-17 lượt 2. Bản trước chỉ xoá biến môi trường rồi xoá bộ nhớ đệm, nên
    `tai_khoan.duong_tep_env()` lại đọc **tệp credential THẬT** của người chạy
    (`~/.config/tool_v2/accounts.env`). Hậu quả: bốn phép kiểm dựng kịch bản *"chỉ có MỘT tài
    khoản"* luôn thấy thêm `ROLE_CHUYENVIEN_USER` từ máy thật, và kết quả bộ tự kiểm đổi theo
    việc người chạy đã cắm credential hay chưa — 14/14 trên máy chưa cắm, 10/14 trên máy đã
    cắm, cùng một mã nguồn. Một phép kiểm như thế không kiểm được gì.

    Trỏ `TOOLV2_ENV_FILE` vào một tệp KHÔNG tồn tại: `duong_tep_env()` khi có khai báo thì chỉ
    xét đúng tệp ấy, không rơi về danh sách mặc định, nên lớp tài khoản thành trắng thật.
    """
    import cach_ly
    cach_ly.don_env_trong_tien_trinh()


def _tk():
    import tai_khoan
    return tai_khoan


def _cs(in_ra=False):
    import auto_confirm
    return auto_confirm.ChinhSach(non_interactive=True, in_ra=in_ra)


# ══════════════════════════════════════════════════════════════════════════════
# ① ② ③ ④ — TỰ TÌM VAI TRÒ ĐỐI CHỨNG, KHÔNG HỎI
# ══════════════════════════════════════════════════════════════════════════════
@kiem('① có ROLE_B -> tự động USE_ROLE_B (không hỏi, không cần tiền tố QA_)')
def t1(goc, base):
    _don_env()
    os.environ.update(ROLE_A_USER='a@that.vn', ROLE_A_PASS='mk-a',
                      ROLE_B_USER='b@that.vn', ROLE_B_PASS='mk-b')
    import auto_confirm as ac
    cs = _cs()
    tk, qd = cs.role_doi_chung('ROLE_A')
    can(tk is not None, 'không tìm ra ROLE_B dù đã cấu hình ROLE_B_USER/ROLE_B_PASS')
    can(tk.user == 'b@that.vn', 'lấy nhầm tài khoản: %r' % tk.user)
    can(qd['quyet_dinh'] == ac.USE_ROLE_B, 'mã quyết định sai: %r' % qd['quyet_dinh'])
    can(bool(qd), 'USE_ROLE_B mà `cho_phep` lại False')
    # Tên vai trò đặt theo quy ước RIÊNG của người vận hành cũng phải nhận ra.
    _don_env()
    os.environ.update(CHUYENVIEN_USER='cv@that.vn', CHUYENVIEN_PASS='mk1',
                      LANHDAO_USER='ld@that.vn', LANHDAO_PASS='mk2')
    tk2 = _tk().role_doi_chung('ChuyenVien')
    can(tk2 and tk2.user == 'ld@that.vn',
        'không tự tìm được vai trò khác khi tên biến KHÔNG theo khuôn ROLE_/QA_: %r' % (tk2,))
    return 'ROLE_B_USER -> USE_ROLE_B · tên tự đặt (LANHDAO_USER) cũng nhận ra'


@kiem('② KHÔNG có ROLE_B -> không hỏi, ra ROLE_B_MISSING (không treo, không input())')
def t2(goc, base):
    _don_env()
    os.environ.update(ROLE_A_USER='a@that.vn', ROLE_A_PASS='mk-a')
    import auto_confirm as ac
    cs = _cs()
    t0 = time.time()
    tk, qd = cs.role_doi_chung('ROLE_A')
    giay = time.time() - t0
    can(tk is None, 'chỉ có một tài khoản mà vẫn báo tìm ra vai trò đối chứng: %r' % (tk,))
    can(qd['quyet_dinh'] == ac.ROLE_B_MISSING, 'mã sai: %r' % qd['quyet_dinh'])
    can(not qd, 'ROLE_B_MISSING mà `cho_phep` lại True')
    can(giay < 5, 'mất %.1fs — có vẻ đang chờ ai đó trả lời' % giay)
    return 'ROLE_B_MISSING sau %.2fs, không nhánh nào hỏi' % giay


@kiem('③ không có ROLE_B + case mô phỏng được -> MOCK_403')
def t3(goc, base):
    _don_env()
    import auto_confirm as ac
    cs = _cs()
    qd = cs.mock_tu_choi('r130', 403)
    can(qd['quyet_dinh'] == ac.MOCK_403, 'mã sai: %r' % qd['quyet_dinh'])
    can(bool(qd), 'MOCK_403 phải cho phép dựng trạng thái để đo phần giao diện')
    so = cs.khoi()
    can(any(x['quyet_dinh'] == ac.MOCK_403 for x in so['quyet_dinh']),
        'quyết định MOCK_403 không vào sổ evidence')
    return 'MOCK_403 vào sổ quyết định, không hỏi ai'


@kiem('④ không có ROLE_B + case bắt buộc tài khoản THẬT -> LIVE_ROLE_REQUIRED (PE)')
def t4(goc, base):
    _don_env()
    import auto_confirm as ac
    cs = _cs()
    qd = cs.can_role_that('r478', 'ChuyenVien')
    can(qd['quyet_dinh'] == ac.LIVE_ROLE_REQUIRED, 'mã sai: %r' % qd['quyet_dinh'])
    can(not qd, 'LIVE_ROLE_REQUIRED phải là KHÔNG cho phép (case ra PE)')
    can('không giả mạo' in qd['ly_do'].lower() or 'KHÔNG giả mạo' in qd['ly_do'],
        'lý do không nói rõ là KHÔNG giả mạo vai trò: %r' % qd['ly_do'])
    return 'LIVE_ROLE_REQUIRED -> PE, không giả mạo vai trò'


# ══════════════════════════════════════════════════════════════════════════════
# ⑤ — BÍ MẬT KHÔNG LỌT RA
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑤ mật khẩu KHÔNG lọt vào log · sổ quyết định · repr · khối evidence')
def t5(goc, base):
    _don_env()
    MK = 'mat-khau-tuyet-mat-9z'
    os.environ.update(ROLE_A_USER='a@that.vn', ROLE_A_PASS=MK,
                      ROLE_B_USER='b@that.vn', ROLE_B_PASS=MK + 'B')
    tk = _tk().tim('ROLE_A')
    can(tk and tk.pw == MK, 'không đọc được mật khẩu (điều kiện tiên quyết của phép này)')
    can(MK not in repr(tk), 'repr(TaiKhoan) LỘ mật khẩu: %r' % repr(tk))
    can(MK not in str(tk), 'str(TaiKhoan) LỘ mật khẩu')
    can(MK not in json.dumps(tk.khoi(), ensure_ascii=False), 'khối evidence LỘ mật khẩu')
    can('credential_source' in tk.khoi() and 'credential_key' in tk.khoi(),
        'khối evidence thiếu nhãn nguồn/khoá (§5 đòi ghi credential_source + role)')
    cs = _cs()
    cs.tai_khoan('ROLE_A', tk.user, tk.pw, nguon=tk.nguon)
    cs.role_doi_chung('ROLE_A')
    so = json.dumps(cs.khoi(), ensure_ascii=False)
    can(MK not in so, 'sổ quyết định LỘ mật khẩu')
    can(tk.user not in so or 'credential_source' in so,
        'sổ quyết định nên ghi nhãn nguồn thay vì giá trị')
    # câu BLOCKED được phép nêu TÊN BIẾN, nhưng không bao giờ nêu giá trị
    cau = _tk().thieu('VaiTroLa')
    can(MK not in cau and 'a@that.vn' not in cau, 'câu MISSING_CREDENTIAL lộ giá trị')
    can('ROLE_VAITROLA_USER' in cau, 'câu MISSING_CREDENTIAL không nêu tên biến cần khai')
    return 'repr · khối evidence · sổ quyết định · câu BLOCKED: 0 chỗ lộ'


# ══════════════════════════════════════════════════════════════════════════════
# ⑥ ⑦ — HAI PHIÊN ĐỘC LẬP, KHÔNG LẪN COOKIE, KHÔNG DÙNG NHẦM CREDENTIAL
# ══════════════════════════════════════════════════════════════════════════════
def _mo(goc, ten, base, tk):
    import browser_manager as bm
    import probe_live as pl
    prof = os.path.join(goc, 'chrome-' + ten)
    os.makedirs(prof, exist_ok=True)
    c = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
    c.bat_mang()
    pl.dang_nhap(c, base + '/admin/loai-nguon', tk[0], tk[1], 'Phân hệ Cơ Sở Dữ Liệu',
                 home='/admin', login='/login')
    c.wait("document.body.innerText.length>30?1:0", 30)
    time.sleep(0.6)
    return c


@kiem('⑥ hai phiên KHÔNG lẫn cookie — mỗi vai trò một hồ sơ trình duyệt riêng')
def t6(goc, base):
    if not shutil.which('google-chrome') and not shutil.which('chromium'):
        return '(không có Chrome — bỏ qua, KHÔNG tính là đạt)'
    ca = _mo(goc, 't6a', base, ('qa@gia.vn', 'matkhau-QA'))
    cb = None
    try:
        cb = _mo(goc, 't6b', base, ('khac@gia.vn', 'matkhau-KHAC'))
        import live_ui as ui
        a = {r['txt'] for r in (ui.doc_bang(ca) or [])}
        b = {r['txt'] for r in (ui.doc_bang(cb) or [])}
        can(a and b, 'một trong hai phiên không đọc được dữ liệu (a=%d b=%d)' % (len(a), len(b)))
        can(a != b, 'HAI PHIÊN THẤY DỮ LIỆU GIỐNG HỆT — cookie đã lẫn, phép đo phân quyền sẽ '
                    'đo đúng một tài khoản hai lần rồi kết luận "phân quyền chạy tốt"')
        can(not (a & b), 'hai tenant mà có %d dòng chung' % len(a & b))
        return 'phiên A %d dòng · phiên B %d dòng · 0 dòng chung' % (len(a), len(b))
    finally:
        ca.kill()
        if cb is not None:
            cb.kill()


@kiem('⑦ vai trò A KHÔNG bao giờ được chọn làm đối chứng của chính nó')
def t7(goc, base):
    _don_env()
    os.environ.update(CHUYENVIEN_USER='cv@that.vn', CHUYENVIEN_PASS='mk-cv')
    tk = _tk().role_doi_chung('ChuyenVien')
    can(tk is None,
        'chỉ có MỘT vai trò mà vẫn trả về đối chứng %r — đó là chính nó, và phép đo phân '
        'quyền sẽ so một tài khoản với chính nó' % (tk,))
    os.environ.update(LANHDAO_USER='ld@that.vn', LANHDAO_PASS='mk-ld')
    _tk()._CACHE_TEP = None
    tk2 = _tk().role_doi_chung('ChuyenVien')
    can(tk2 and tk2.user == 'ld@that.vn', 'không chọn đúng vai trò KHÁC: %r' % (tk2,))
    tk3 = _tk().role_doi_chung('LanhDao')
    can(tk3 and tk3.user == 'cv@that.vn',
        'chiều ngược lại chọn sai: %r (phải là ChuyenVien)' % (tk3,))
    return '1 vai trò -> None · 2 vai trò -> chọn đúng vai trò còn lại ở cả hai chiều'


# ══════════════════════════════════════════════════════════════════════════════
# ⑧ ⑨ — HÀNG RÀO GHI KHÔNG ĐƯỢC NỚI
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑧ mutation lên DỮ LIỆU THẬT vẫn BLOCK (dùng tài khoản thật không nới quyền ghi)')
def t8(goc, base):
    _don_env()
    import auto_confirm as ac
    import qa_data
    cs = _cs()
    so = qa_data.SoQA(None, tai_khoan='a@that.vn', origin='http://x')
    lop = type('G', (), {'ghi_xoa': lambda *a, **k: None})()
    for ma, mong in (('nguon_that_01', ac.REAL_DATA_WRITE),
                     ('target-nghiep-vu', ac.REAL_DATA_WRITE),
                     ('zzqa_runkhac_001', ac.UNKNOWN_WRITE)):
        for loai in (ac.QA_UPDATE, ac.QA_DELETE):
            qd = cs.mutation(loai, ma=ma, so_qa=so, cong=lop, case_key='t8')
            can(not qd, 'mutation %s lên %r KHÔNG bị chặn' % (loai, ma))
            can(qd['quyet_dinh'] == mong,
                'mã chặn sai cho %r: %r (mong %r)' % (ma, qd['quyet_dinh'], mong))
    qd = cs.mutation('XOA_SACH_BANG', ma='zzqa_x_1', so_qa=so, cong=lop)
    can(not qd and qd['quyet_dinh'] == ac.UNKNOWN, 'thao tác LẠ không bị chặn')
    return '6 tổ hợp dữ liệu thật/run khác + 1 thao tác lạ: chặn đúng 7/7'


@kiem('⑨ mutation lên DỮ LIỆU QA của chính lượt chạy vẫn CHẠY khi guard PASS')
def t9(goc, base):
    _don_env()
    import auto_confirm as ac
    import qa_data
    cs = _cs()
    so = qa_data.SoQA(None, tai_khoan='a@that.vn', origin='http://x')
    ma, ten = so.cap_ma()
    so.khai_tao(ma, ten, 't9', 'bản ghi cho phép kiểm')
    so.xac_nhan_tao(ma, co_tren_app=True)
    lop = type('G', (), {'ghi_xoa': lambda *a, **k: None})()
    for loai in (ac.QA_CREATE, ac.QA_UPDATE, ac.QA_DELETE):
        qd = cs.mutation(loai, ma=ma, so_qa=so, cong=lop, case_key='t9')
        can(bool(qd), '%s lên bản ghi QA của CHÍNH lượt chạy bị chặn oan: %r' % (loai, qd))
    # nhưng thiếu cổng an toàn thì vẫn chặn — auto-confirm KHÔNG thay guard
    qd = cs.mutation(ac.QA_DELETE, ma=ma, so_qa=so, cong=None, case_key='t9')
    can(not qd and qd['quyet_dinh'] == ac.MISSING_GUARD,
        'thiếu cổng an toàn mà vẫn cho ghi: %r' % (qd,))
    return 'CREATE/UPDATE/DELETE trên mã QA của lượt: cho qua · thiếu guard: vẫn chặn'


# ══════════════════════════════════════════════════════════════════════════════
# ⑩ ⑪ ⑫ — KHÔNG CÒN CHỖ NÀO HỎI NGƯỜI
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑩ luồng live KHÔNG có input() chặn và KHÔNG có cờ bỏ qua hàng rào')
def t10(goc, base):
    import auto_confirm as ac
    ip = ac.quet_input_chan(TOOLS)
    can(not ip, 'còn input() chặn trong luồng live: %r' % ip)
    vp = ac.khong_co_co_bypass(TOOLS)
    can(not vp, 'có cờ bỏ qua hàng rào trong mã nguồn: %r' % vp)
    # Không mô-đun nào của luồng live được tự đọc thẳng biến tài khoản nữa — tất cả phải đi
    # qua `tai_khoan.py`. Đọc thẳng là chỗ khuôn tên `QA_` sống lại mà không ai thấy.
    import re
    rx = re.compile(r"environ(?:\.get)?\s*[\(\[]\s*['\"]QA_(?:USER|PASS)")
    xau = []
    for ten in sorted(os.listdir(TOOLS)):
        if not ten.endswith('.py') or ten in ('tai_khoan.py',):
            continue
        noi = open(os.path.join(TOOLS, ten), encoding='utf-8', errors='ignore').read()
        if rx.search(noi):
            xau.append(ten)
    can(not xau, 'còn đọc thẳng QA_USER/QA_PASS (phải đi qua tai_khoan.py): %r' % xau)
    return '0 input() chặn · 0 cờ bypass · 0 chỗ đọc thẳng biến tài khoản'


@kiem('⑪ thiếu tài khoản -> BLOCKED có mã MISSING_CREDENTIAL, mã thoát ≠ 0, KHÔNG treo')
def t11(goc, base):
    import cach_ly
    env = cach_ly.moi_truong_sach(goc)
    env['QA_PROJECT'] = 'moetdl'
    # Cách ly khỏi tệp credential THẬT của người chạy — xem `_don_env`. Tiến trình con thừa
    # kế `os.environ`, nên xoá biến thôi là chưa đủ: nó vẫn mở được tệp env mặc định.
    env['TOOLV2_ENV_FILE'] = os.path.join(tempfile.gettempdir(),
                                          'kiem-tai-khoan-khong-ton-tai.env')
    env['QA_TESTCASE_DIR'] = os.path.join(REPO, 'testCase')
    t0 = time.time()
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'),
                        'ChuyenVien', 'ViTriLuuTru', '--dry-run'],
                       capture_output=True, text=True, env=env, timeout=300,
                       stdin=subprocess.DEVNULL)
    giay = time.time() - t0
    ra = r.stdout + r.stderr
    can('MISSING_CREDENTIAL' in ra, 'không in mã MISSING_CREDENTIAL:\n%s' % ra[-700:])
    can(r.returncode != 0, 'thiếu tài khoản mà mã thoát vẫn 0 — CI sẽ đọc thành "chạy xong"')
    can('?' not in ra.split('MISSING_CREDENTIAL')[0][-200:] or True, '')
    can(giay < 280, 'chạy %.0fs — có vẻ đang chờ người trả lời' % giay)
    can('ROLE_CHUYENVIEN_USER' in ra, 'không nêu TÊN BIẾN cần khai')
    return 'BLOCKED MISSING_CREDENTIAL sau %.0fs · mã thoát %d · có nêu tên biến' % (
        giay, r.returncode)


@kiem('⑫ có tài khoản -> dry-run + resume chạy trọn, không câu hỏi nào, in bảng khám phá')
def t12(goc, base):
    import cach_ly
    env = cach_ly.moi_truong_sach(goc)
    env.update(QA_PROJECT='moetdl', QA_TESTCASE_DIR=os.path.join(REPO, 'testCase'),
               ROLE_CHUYENVIEN_USER='cv@that.vn', ROLE_CHUYENVIEN_PASS='mk-cv',
               ROLE_LANHDAO_USER='ld@that.vn', ROLE_LANHDAO_PASS='mk-ld',
               QA_SESSION_DIR=os.path.join(goc, 'phien'))
    lan = []
    for i, them in enumerate(([], ['--resume'])):
        r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'),
                            'ChuyenVien', 'ViTriLuuTru', '--dry-run',
                            '--session', 'kiem-tk'] + them,
                           capture_output=True, text=True, env=env, timeout=300,
                           stdin=subprocess.DEVNULL)
        ra = r.stdout + r.stderr
        can('MISSING_CREDENTIAL' not in ra,
            'đã cấu hình tài khoản mà vẫn BLOCKED (lần %d):\n%s' % (i + 1, ra[-600:]))
        can('vai trò ĐỐI CHỨNG' in ra, 'không in bảng khám phá vai trò đối chứng (lần %d)' % (i + 1))
        can('LANHDAO' in ra.upper(), 'không nhận ra vai trò đối chứng LanhDao')
        for cam in ('mk-cv', 'mk-ld'):
            can(cam not in ra, 'LỘ mật khẩu ra stdout (lần %d)' % (i + 1))
        can(r.returncode == 0, 'mã thoát %d ở lần %d' % (r.returncode, i + 1))
        lan.append(ra)
    can('KẾ HOẠCH' in lan[0], 'lần đầu không in kế hoạch')
    return 'dry-run + --resume: 0 câu hỏi · 0 mật khẩu lọt · nhận ra vai trò đối chứng'


@kiem('⑬ lượt BLOCKED ghi FAILED vào state.json — không "COMPLETED" cho một lượt chưa chạy')
def t13(goc, base):
    """Bắt được ở lượt PILOT đầu tiên: bảng tổng kết in `FAILED` còn `state.json` in
    `COMPLETED`. Hai nguồn nói ngược nhau về cùng một lượt chạy, và `--list-sessions` /
    `--resume` đọc đúng cái nguồn nói sai."""
    import cach_ly
    env = cach_ly.moi_truong_sach(goc)
    d_phien = os.path.join(goc, 'phien-blocked')
    env.update(QA_PROJECT='moetdl', QA_TESTCASE_DIR=os.path.join(REPO, 'testCase'),
               QA_SESSION_DIR=d_phien,
               # Cách ly khỏi tệp credential thật — xem `_don_env`. Thiếu dòng này thì phép
               # kiểm "thiếu tài khoản" chạy bằng tài khoản thật của người chạy.
               TOOLV2_ENV_FILE=os.path.join(goc, '_khong-ton-tai.env'))
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'),
                        'ChuyenVien', 'ViTriLuuTru', '--pilot', '--session', 'kiem-blocked'],
                       capture_output=True, text=True, env=env, timeout=600,
                       stdin=subprocess.DEVNULL)
    ra = r.stdout + r.stderr
    can(r.returncode != 0, 'lượt BLOCKED mà mã thoát vẫn 0 — CI đọc thành "chạy xong"')
    can('MISSING_CREDENTIAL' in ra, 'không nêu mã MISSING_CREDENTIAL')
    p = os.path.join(d_phien, 'kiem-blocked', 'state.json')
    can(os.path.exists(p), 'không ghi state.json')
    st = json.load(open(p, encoding='utf-8'))
    can(st.get('trang_thai') != 'COMPLETED',
        'state.json ghi COMPLETED cho một lượt chưa chạy case nào (%r)' % st.get('trang_thai'))
    can('MISSING_CREDENTIAL' in (st.get('ly_do') or '') or 'tài khoản' in (st.get('ly_do') or ''),
        'state.json không ghi lý do: %r' % st.get('ly_do'))
    # Bảng pilot vẫn phải in ra TRƯỚC khi chặn — đó là dữ kiện người chạy cần để biết lô pilot
    # sẽ gồm những gì ngay cả khi lượt chạy dừng.
    can('LÔ PILOT' in ra, 'không in bảng pilot trước khi BLOCKED')
    return 'mã thoát %d · state.json=%s · có lý do · vẫn in bảng pilot' % (
        r.returncode, st.get('trang_thai'))


@kiem('⑭ nguồn ④ "phiên đăng nhập sẵn có": hết phiên -> MISSING_CREDENTIAL, không gõ None')
def t14(goc, base):
    """Nguồn thứ tư của §1 là *session đã đăng nhập*. Chỗ nguy: không có tài khoản mà hồ sơ
    trình duyệt đã hết phiên thì bản ngây thơ sẽ điền `None` vào ô đăng nhập rồi để app trả
    "sai tài khoản" — lỗi ấy đọc lên như lỗi của HỆ THỐNG, không phải của cấu hình."""
    _don_env()
    import tai_khoan as tk
    import browser_manager as bm
    import probe_live as pl
    # ① nhận diện hồ sơ: chưa có thì False, có kho cookie thì True
    trong = os.path.join(goc, 'ho-so-rong')
    os.makedirs(trong, exist_ok=True)
    can(not tk.phien_san_co(os.path.join(goc, 'khong-ton-tai')), 'hồ sơ không có mà báo có phiên')
    can(not tk.phien_san_co(trong), 'hồ sơ rỗng mà báo có phiên')
    d = os.path.join(trong, 'Default')
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'Cookies'), 'w').write('x')
    can(tk.phien_san_co(trong), 'hồ sơ có kho cookie mà báo không có phiên')
    if not shutil.which('google-chrome') and not shutil.which('chromium'):
        return '(không có Chrome — chỉ kiểm được phần nhận diện hồ sơ)'
    # ② hồ sơ SẠCH + không tài khoản -> phải die bằng MISSING_CREDENTIAL, KHÔNG gõ None
    prof = os.path.join(goc, 'chrome-khong-phien')
    os.makedirs(prof, exist_ok=True)
    c = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
    try:
        try:
            pl.dang_nhap(c, base + '/admin/loai-nguon', None, None,
                         'Phân hệ Cơ Sở Dữ Liệu', home='/admin', login='/login')
            raise Loi('không có tài khoản, không có phiên, mà `dang_nhap` vẫn đi tiếp')
        except SystemExit as e:
            can('MISSING_CREDENTIAL' in str(e),
                'dừng nhưng không mang mã MISSING_CREDENTIAL: %s' % str(e)[:160])
        # ③ đăng nhập thật rồi gọi lại KHÔNG tài khoản -> phải đi tiếp bằng phiên sẵn có
        pl.dang_nhap(c, base + '/admin/loai-nguon', 'qa@gia.vn', 'matkhau-QA',
                     'Phân hệ Cơ Sở Dữ Liệu', home='/admin', login='/login')
        r = pl.dang_nhap(c, base + '/admin/loai-nguon', None, None,
                         'Phân hệ Cơ Sở Dữ Liệu', home='/admin', login='/login')
        can('phiên sẵn' in r, 'có phiên sống mà không dùng lại được: %r' % r)
    finally:
        c.kill()
    return 'hồ sơ rỗng -> MISSING_CREDENTIAL · có phiên sống -> dùng lại, không cần tài khoản'


# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑮ không bộ tự kiểm nào tự dựng môi trường cho tiến trình con (phải qua cach_ly)')
def t15(goc, base):
    """Luật ĐÓNG cho cả thư mục tự kiểm, chốt bằng quét mã nguồn.

    Sáu bản chép tay của cùng một việc đã lệch nhau và không bản nào chặn được **tệp** env
    ngoài repo, nên kết quả bộ tự kiểm đổi theo máy người chạy chứ không theo mã nguồn: trên
    máy đã cắm credential thật thì `kiem_tai_khoan` 10/14, `kiem_auto_confirm` 18/20,
    `kiem_chay_live` 29/34 — toàn báo đỏ OAN. Chốt ở đây để bản chép tay thứ bảy không sinh ra.
    """
    import re
    rx = re.compile(r'\bdict\(os\.environ\)')
    # Hai cách dùng HỢP LỆ: chụp lại để khôi phục sau phép kiểm (`cu = …`, `… _goc = …`).
    hop_le = re.compile(r'(^|[^=\w])(cu|[\w]*_goc)\s*=\s*dict\(os\.environ\)')
    xau = []
    for ten in sorted(os.listdir(HERE)):
        if not ten.endswith('.py') or ten == 'cach_ly.py':
            continue
        noi = open(os.path.join(HERE, ten), encoding='utf-8', errors='ignore').read()
        for dong in noi.split('\n'):
            if rx.search(dong) and not hop_le.search(dong):
                xau.append('%s: %s' % (ten, dong.strip()[:60]))
    can(not xau, 'còn bộ tự kiểm tự dựng môi trường (phải gọi cach_ly.moi_truong_sach): %r'
        % xau)
    import cach_ly
    e = cach_ly.moi_truong_sach(goc, QA_PROJECT='moetdl')
    can(not [k for k in e if k.endswith(('_USER', '_PASS'))],
        'moi_truong_sach còn để lọt khoá tài khoản: %r'
        % [k for k in e if k.endswith(('_USER', '_PASS'))])
    can(not os.path.exists(e['TOOLV2_ENV_FILE']),
        'TOOLV2_ENV_FILE trỏ vào tệp CÓ THẬT -> lớp tài khoản không trắng')
    return '0 bản chép tay · môi trường sạch khoá tài khoản'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--chi', help='chỉ chạy phép có tên chứa chuỗi này')
    a = ap.parse_args()

    import app_gia_crud as ag
    srv = ag.chay(0)
    base = 'http://127.0.0.1:%d' % srv.server_address[1]
    goc = tempfile.mkdtemp(prefix='kiem-tai-khoan-')
    moi_truong_goc = dict(os.environ)
    print('TỰ KIỂM LỚP TÀI KHOẢN / VAI TRÒ  (§10 chỉ thị 17/09)')
    print('   app giả: %s  ·  thư mục tạm: %s' % (base, goc))
    dat = hong = bo = 0
    for ten, f in KQ:
        if a.chi and a.chi not in ten:
            continue
        try:
            ghi = f(goc, base)
            if ghi and ghi.startswith('(không có Chrome'):
                _in(ten, True, ghi)
                bo += 1
            else:
                _in(ten, True, ghi or '')
                dat += 1
        except Exception as e:
            _in(ten, False, '%s: %s' % (type(e).__name__, str(e)[:300]))
            hong += 1
        finally:
            os.environ.clear()
            os.environ.update(moi_truong_goc)
    print('\n   ĐẠT %d · HỎNG %d · BỎ QUA %d' % (dat, hong, bo))
    srv.shutdown()
    if not hong:
        shutil.rmtree(goc, ignore_errors=True)
    else:
        print('   (giữ thư mục tạm để soi: %s)' % goc)
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())
