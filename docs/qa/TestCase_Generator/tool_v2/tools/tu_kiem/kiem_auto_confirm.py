#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM LỚP QUYẾT ĐỊNH TỰ ĐỘNG — chạy live KHÔNG hỏi người  (2026-09-16 lượt 2).

Bộ kiểm của một thay đổi có rủi ro đặc thù: bỏ câu hỏi xác nhận đi thì **chỗ duy nhất còn
chặn một mutation sai là hàng rào máy**. Nên 20 phép dưới đây chia đôi rành mạch:

  · nhóm A (①-⑥)  — chứng minh tool KHÔNG còn dừng lại hỏi;
  · nhóm B (⑦-⑯) — chứng minh hàng rào vẫn chặn đúng những thứ phải chặn, và **chặt hơn**
    trước ở ba ca mới (sổ QA không dọn được · thao tác không phân loại được · `--chi-doc`);
  · nhóm C (⑰-⑳) — bí mật · resume · song song · hồi quy.

Phép nào cũng chạy ở tầng LUẬT (không cần Chrome, không cần tài khoản) trừ ⑬⑭ có gắn nhãn.

    python3 tools/tu_kiem/kiem_auto_confirm.py
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
REPO = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
os.environ.setdefault('QA_PROJECT', 'moetdl')

KQ = []


def kiem(ten):
    def deco(f):
        KQ.append((ten, f))
        return f
    return deco


class Loi(AssertionError):
    pass


def can(dk, msg):
    if not dk:
        raise Loi(msg)


def _so_gia(run='abc123', ngan='_'):
    """Sổ dữ liệu QA thật, trong thư mục tạm — không cần app, không cần Chrome."""
    import qa_data
    import qalib
    d = tempfile.mkdtemp(prefix='ac-so-')
    return qa_data.SoQA(os.path.join(d, 'so.json'), run_id=qalib.qa_run_id(run),
                        tai_khoan='qa@gia.vn', origin='http://127.0.0.1:9',
                        thuc_the='LoaiNguon'), d


# ══════════════════════════════════════════════════════════════════════════════
# A. KHÔNG CÒN HỎI
# ══════════════════════════════════════════════════════════════════════════════
@kiem('① không còn `input()` CHẶN nào trong luồng live test')
def a1():
    import auto_confirm as ac
    vp = ac.quet_input_chan(TOOLS)
    can(not vp, 'còn input() chặn: %s' % vp)
    # và file được chừa phải chừa CÓ LÝ DO: nó không nằm trong luồng chạy case
    noi = open(os.path.join(TOOLS, 'chay_live.py'), encoding='utf-8').read()
    can('session_manager' in noi, 'chay_live không import session_manager?')
    can('sm.xoa(' not in noi, 'luồng chạy case gọi vào hàm xoá phiên (hàm duy nhất còn input())')
    return '0 input() chặn · chừa đúng session_manager.xoa (CLI --delete-session)'


@kiem('② dialog GHI -> tự chọn ALLOW_QA_WRITE, không hỏi')
def a2():
    import auto_confirm as ac
    cs = ac.ChinhSach(non_interactive=True, in_ra=False)
    qd = cs.cho_phep_ghi(48)
    can(qd and qd['quyet_dinh'] == ac.ALLOW_QA_WRITE, 'không tự chọn ALLOW_QA_WRITE: %r' % (qd,))
    can(qd['muc'] == 'AUTO-CONFIRM', 'sai mức log: %r' % qd['muc'])
    # chế độ tương tác thì KHÔNG tự mở — giữ nguyên hành vi cũ
    cs2 = ac.ChinhSach(non_interactive=False, in_ra=False)
    can(not cs2.cho_phep_ghi(48), 'chế độ tương tác vẫn tự mở quyền ghi')
    # --chi-doc thu hẹp được, kể cả ở chế độ tự động
    cs3 = ac.ChinhSach(non_interactive=True, chi_doc=True, in_ra=False)
    can(not cs3.cho_phep_ghi(48), '--chi-doc không tắt được phần ghi')
    return 'tự động=ALLOW · tương tác=READ_ONLY · --chi-doc=READ_ONLY'


@kiem('③ `hoi()` ở chế độ tự động trả mặc định NGAY, không chờ stdin')
def a3():
    import auto_confirm as ac
    cs = ac.ChinhSach(non_interactive=True, in_ra=False)
    # Cắt hẳn stdin: còn chờ đọc là treo/EOFError, không thể "tình cờ" qua được.
    cu, sys.stdin = sys.stdin, io.StringIO('')
    try:
        can(cs.hoi('Xoá phiên?', False, la_cli=True) is False, 'không trả mặc định False')
        can(cs.hoi('Chạy phần ghi?', True) is True, 'không trả mặc định True')
    finally:
        sys.stdin = cu
    return '2/2 câu trả lời mặc định, không đọc stdin'


@kiem('④ vai trò đối chứng: có credential -> USE_ROLE_B, thiếu -> không hỏi')
def a4():
    """⚠️ KỲ VỌNG ĐỔI 2026-09-17, có chủ đích — không phải bẻ test cho PASS.

    §7 của chỉ thị 17/09 đặt lại bảng mã quyết định: `USE_ROLE` -> `USE_ROLE_B`,
    `ROLE_ACCOUNT_MISSING` -> `ROLE_B_MISSING`. Giữ nguyên kỳ vọng cũ là chốt lại đúng bộ mã
    mà chỉ thị vừa thay, và che mất hai mã mới (`MOCK_403`, `LIVE_ROLE_REQUIRED`) — chúng
    mới là thứ quyết định case ra PE hay ra kết luận.
    """
    import auto_confirm as ac
    cs = ac.ChinhSach(in_ra=False)
    qd = cs.vai_tro('LanhDao', True)
    can(qd and qd['quyet_dinh'] == ac.USE_ROLE_B, 'có tài khoản mà không USE_ROLE_B: %r' % (qd,))
    can(qd['chi_tiet'].get('credential_source') == 'environment', 'không ghi nguồn credential')
    qd2 = cs.vai_tro('LanhDao', False)
    can(not qd2 and qd2['quyet_dinh'] == ac.ROLE_B_MISSING,
        'thiếu tài khoản mà không ra ROLE_B_MISSING: %r' % (qd2,))
    can(qd2['muc'] == 'AUTO-DECISION', 'sai mức log cho ca thiếu vai trò')
    # Hai mã MỚI: không có vai trò thì case mô phỏng được vẫn chạy, case đòi vai trò THẬT ra PE.
    can(bool(cs.mock_tu_choi('r1', 403)), 'MOCK_403 phải cho phép dựng trạng thái')
    can(not cs.can_role_that('r2', 'ChuyenVien'), 'LIVE_ROLE_REQUIRED phải là KHÔNG cho phép')
    return 'USE_ROLE_B / ROLE_B_MISSING / MOCK_403 / LIVE_ROLE_REQUIRED, không nhánh nào hỏi'


@kiem('⑤ `attt_live` đọc vai trò từ ENV, không hỏi — và không lộ giá trị')
def a5():
    import attt_live
    cu = dict(os.environ)
    try:
        for k in list(os.environ):
            if k.startswith(('QA_ROLE', 'QA_USER', 'QA_PASS')):
                os.environ.pop(k)
        # Xoá biến thôi là CHƯA trắng: lớp tài khoản còn một nguồn nữa là tệp env ngoài
        # repo, và trên máy đã cắm credential thật thì phép kiểm "thiếu env" luôn thấy có env.
        import cach_ly
        cach_ly.don_env_trong_tien_trinh()
        can(attt_live.vai_tro_doi_chung() == (None, None, None), 'thiếu env mà vẫn trả vai trò')
        # Khuôn CŨ `QA_ROLE_B` + `QA_USER_<TÊN>` vẫn phải đọc được: đợt 17/09 MỞ RỘNG khuôn
        # tên, không bỏ khuôn cũ — lượt chạy đang cấu hình theo lối cũ không được gãy.
        os.environ['QA_ROLE_B'] = 'LanhDao'
        os.environ['QA_USER_LANHDAO'] = 'u@x.vn'
        os.environ['QA_PASS_LANHDAO'] = 'mk-bi-mat'
        ten, u, p = attt_live.vai_tro_doi_chung()
        can((ten, u, p) == ('LanhDao', 'u@x.vn', 'mk-bi-mat'), 'không đọc được env: %r' % (ten,))
        mt = attt_live.ma_tran()
        can('LANHDAO' in mt, 'ma_tran không thấy vai trò: %r' % mt)
        can(all(v is True for v in mt.values()), 'ma_tran LỘ giá trị tài khoản: %r' % mt)
    finally:
        os.environ.clear()
        os.environ.update(cu)
    return 'đọc env đúng · ma_tran chỉ có TÊN + có/không'


@kiem('⑥ thiếu tài khoản đăng nhập -> BLOCKED có lý do, KHÔNG hỏi, KHÔNG in mật khẩu')
def a6():
    import auto_confirm as ac
    cs = ac.ChinhSach(in_ra=False)
    qd = cs.tai_khoan('ChuyenVien', None, None)
    # ⚠️ KỲ VỌNG ĐỔI 2026-09-17: mã `BLOCKED` trần tách thành `MISSING_CREDENTIAL:<role>` để
    # báo cáo đếm được *"thiếu tài khoản của vai trò NÀO"*. Tên biến nêu ra cũng theo khuôn
    # mới (`ROLE_<VAI TRÒ>_USER`) — khuôn `QA_` chỉ còn là lớp lùi, không còn là thứ tool bắt
    # người vận hành phải đặt.
    can(not qd, 'thiếu tài khoản mà vẫn cho qua: %r' % (qd,))
    can(qd['quyet_dinh'].startswith(ac.MISSING_CREDENTIAL),
        'không ra MISSING_CREDENTIAL: %r' % (qd['quyet_dinh'],))
    can('ChuyenVien' in qd['quyet_dinh'], 'mã không nêu vai trò nào thiếu: %r' % qd['quyet_dinh'])
    can('ROLE_CHUYENVIEN_USER' in qd['ly_do'], 'lý do không chỉ ra biến cần khai')
    qd2 = cs.tai_khoan('ChuyenVien', 'u@x.vn', 'mk-bi-mat')
    s = json.dumps(cs.khoi(), ensure_ascii=False)
    can(qd2 and 'mk-bi-mat' not in s and 'u@x.vn' not in s,
        'SỔ QUYẾT ĐỊNH lộ tài khoản: %s' % s[:200])
    import chay_live
    can(hasattr(chay_live, 'ThieuTaiKhoan'), 'chay_live thiếu lớp ThieuTaiKhoan')
    return 'BLOCKED có tên biến cần khai · sổ không lộ tài khoản'


# ══════════════════════════════════════════════════════════════════════════════
# B. HÀNG RÀO VẪN CHẶN
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑦ KHÔNG tồn tại cờ bỏ qua hàng rào (--force-real-write / --skip-guard …)')
def b1():
    import auto_confirm as ac
    vp = ac.khong_co_co_bypass(TOOLS)
    can(not vp, 'có cờ bỏ qua hàng rào: %s' % vp)
    # và không có đường nào đặt thẳng `cho_phep_ghi` mà bỏ qua `Cong.ghi`
    noi = open(os.path.join(TOOLS, 'chay_live.py'), encoding='utf-8').read()
    can(noi.count('def ghi(self, ma') == 1, 'có hơn một cổng ghi trong Cong')
    return '0 cờ bypass · 1 cổng ghi duy nhất'


@kiem('⑧ QA_CREATE / QA_UPDATE / QA_DELETE trên bản ghi QA -> AUTO_ALLOW')
def b2():
    import auto_confirm as ac
    import chay_live as cl
    so, d = _so_gia()
    try:
        ma, ten = so.cap_ma()
        so.khai_tao(ma, ten, 'case-1')
        so.xac_nhan_tao(ma, id_app='42')
        cong = cl.Cong(True, (), None, so=so)
        cs = ac.ChinhSach(in_ra=False)
        for loai in (ac.QA_CREATE, ac.QA_UPDATE, ac.QA_DELETE):
            qd = cs.mutation(loai, ma=ma, so_qa=so, cong=cong, case_key='c1')
            can(qd, '%s trên bản ghi QA bị chặn oan: %s' % (loai, qd['ly_do']))
        return 'CREATE/UPDATE/DELETE trên %s đều ALLOW' % ma
    finally:
        shutil.rmtree(d, ignore_errors=True)


@kiem('⑨ DELETE dữ liệu THẬT -> REAL_DATA_WRITE, BLOCK')
def b3():
    import auto_confirm as ac
    import chay_live as cl
    so, d = _so_gia()
    try:
        cong = cl.Cong(True, (), None, so=so)
        cs = ac.ChinhSach(in_ra=False)
        for ma in ('123', 'nguon_that_01', 'loai-nguon-7', 'QA-nhung-khong-phai-run-nay'):
            qd = cs.mutation(ac.QA_DELETE, ma=ma, so_qa=so, cong=cong)
            can(not qd, 'XOÁ %r KHÔNG bị chặn' % ma)
            can(qd['quyet_dinh'] in (ac.REAL_DATA_WRITE, ac.UNKNOWN_WRITE),
                'sai phân loại cho %r: %s' % (ma, qd['quyet_dinh']))
        # và cổng ghi thật cũng chặn
        try:
            cong.ghi('123', 'xoa dữ liệu QA')
        except cl.ChanAnToan:
            pass
        else:
            raise Loi('Cong.ghi() cho qua id dữ liệu thật')
        return '4/4 mã thật bị chặn ở cả bảng chính sách lẫn Cong.ghi()'
    finally:
        shutil.rmtree(d, ignore_errors=True)


@kiem('⑩ mã MANG dấu QA nhưng của LƯỢT KHÁC -> vẫn BLOCK')
def b4():
    import auto_confirm as ac
    import chay_live as cl
    so, d = _so_gia(run='aaa111')
    try:
        cong = cl.Cong(True, (), None, so=so)
        cs = ac.ChinhSach(in_ra=False)
        qd = cs.mutation(ac.QA_DELETE, ma='zzqa_bbb222_001', so_qa=so, cong=cong)
        can(not qd, 'mã QA của lượt khác KHÔNG bị chặn')
        can(qd['quyet_dinh'] == ac.UNKNOWN_WRITE, 'sai phân loại: %s' % qd['quyet_dinh'])
        return 'zzqa_bbb222_001 bị chặn ở lượt aaa111'
    finally:
        shutil.rmtree(d, ignore_errors=True)


@kiem('⑪ thiếu guard / thiếu sổ QA / thao tác lạ -> BLOCK')
def b5():
    import auto_confirm as ac
    so, d = _so_gia()
    try:
        cs = ac.ChinhSach(in_ra=False)
        q1 = cs.mutation(ac.QA_DELETE, ma='zzqa_abc123_001', so_qa=so, cong=None)
        can(not q1 and q1['quyet_dinh'] == ac.MISSING_GUARD, 'thiếu guard không BLOCK: %r' % (q1,))
        import chay_live as cl
        cong = cl.Cong(True, (), None, so=None)
        q2 = cs.mutation(ac.QA_DELETE, ma='zzqa_abc123_001', so_qa=None, cong=cong)
        can(not q2 and q2['quyet_dinh'] == ac.MISSING_QA_REGISTRY,
            'thiếu sổ QA không BLOCK: %r' % (q2,))
        q3 = cs.mutation('LAM_GI_DO_LA', ma='zzqa_abc123_001', so_qa=so, cong=cong)
        can(not q3 and q3['quyet_dinh'] == ac.UNKNOWN, 'thao tác lạ không BLOCK: %r' % (q3,))
        return 'MISSING_GUARD · MISSING_QA_REGISTRY · UNKNOWN đều BLOCK'
    finally:
        shutil.rmtree(d, ignore_errors=True)


@kiem('⑫ `Cong.ghi()` phân loại đúng tên thao tác, KHÔNG bị `huy` khớp vào giữa chữ')
def b6():
    import auto_confirm as ac
    import chay_live as cl
    so, d = _so_gia()
    try:
        cong = cl.Cong(True, (), None, so=so)
        bang = {'tao dữ liệu QA': ac.QA_CREATE, 'sua dữ liệu QA': ac.QA_UPDATE,
                'xoa dữ liệu QA': ac.QA_DELETE, 'chuyển trạng thái': ac.UNKNOWN_WRITE}
        for t, mong in bang.items():
            got = cong._loai_mutation(t)
            can(got == mong, 'phân loại %r -> %s (mong %s)' % (t, got, mong))
        return '4/4 tên thao tác phân loại đúng'
    finally:
        shutil.rmtree(d, ignore_errors=True)


@kiem('⑬ --chi-doc: mọi mutation BLOCK kể cả trên bản ghi QA hợp lệ')
def b7():
    import auto_confirm as ac
    import chay_live as cl
    so, d = _so_gia()
    try:
        ma, ten = so.cap_ma()
        so.khai_tao(ma, ten, 'c')
        so.xac_nhan_tao(ma, id_app='7')
        cong = cl.Cong(True, (), None, so=so)
        cs = ac.ChinhSach(non_interactive=True, chi_doc=True, in_ra=False)
        qd = cs.mutation(ac.QA_UPDATE, ma=ma, so_qa=so, cong=cong)
        can(not qd and qd['quyet_dinh'] == ac.BLOCK_WRITE, '--chi-doc không chặn: %r' % (qd,))
        return 'BLOCK_WRITE trên chính bản ghi QA hợp lệ'
    finally:
        shutil.rmtree(d, ignore_errors=True)


@kiem('⑭ bảng chính sách CHỈ thu hẹp: mọi ca nó cho qua thì Cong.ghi() cũng cho qua')
def b8():
    """Bất biến chống *"auto-confirm nới quyền"*: quét toàn bộ tổ hợp (loại × mã) và đối
    chiếu hai tầng. Không được có ô nào *chính sách ALLOW mà cổng ghi từ chối* — nếu có thì
    một trong hai tầng đang hiểu sai phạm vi QA, và đó là chỗ lỗ mở ra."""
    import auto_confirm as ac
    import chay_live as cl
    so, d = _so_gia()
    try:
        ma, ten = so.cap_ma()
        so.khai_tao(ma, ten, 'c')
        so.xac_nhan_tao(ma, id_app='7')
        cong = cl.Cong(True, (), None, so=so)
        cs = ac.ChinhSach(in_ra=False)
        lech = []
        for loai in (ac.QA_CREATE, ac.QA_UPDATE, ac.QA_DELETE):
            for m in (ma, '123', 'nguon_that_01', 'zzqa_khac99_001', ''):
                pol = bool(cs.mutation(loai, ma=m, so_qa=so, cong=cong))
                try:
                    cong.ghi(m, '%s dữ liệu QA' % {ac.QA_CREATE: 'tao', ac.QA_UPDATE: 'sua',
                                                   ac.QA_DELETE: 'xoa'}[loai])
                    gate = True
                except cl.ChanAnToan:
                    gate = False
                if pol and not gate:
                    lech.append('%s %r: chính sách ALLOW mà cổng ghi CHẶN' % (loai, m))
        can(not lech, ' | '.join(lech))
        return '15 tổ hợp: không ô nào chính sách nới hơn cổng ghi'
    finally:
        shutil.rmtree(d, ignore_errors=True)


@kiem('⑮ vi phạm sổ mạng vẫn DỪNG lượt chạy, không hỏi tiếp')
def b9():
    import chay_live as cl
    import qalib
    cong = cl.Cong(True, (), None, so=None)
    so = [{'method': 'DELETE', 'url': 'https://x/api/items/9', 'loai': qalib.GHI,
           'ly_do': 'mutating method ngoài allowlist', 'tai_nguyen': 'XHR', 'luc': 0}]
    try:
        cong.kiem_so_mang(so, None, 0, 'phép kiểm')
    except cl.ChanAnToan as e:
        can('DỪNG' in str(e) or 'dừng' in str(e), 'thông báo không nói DỪNG: %s' % e)
        return 'WRITE lạ -> ChanAnToan ngay, không nhánh nào hỏi'
    raise Loi('sổ mạng có WRITE mà lượt chạy KHÔNG dừng')


@kiem('⑯ mock 401/403 tự quyết, ghi sổ AUTO-DECISION')
def b10():
    import auto_confirm as ac
    cs = ac.ChinhSach(in_ra=False)
    qd = cs.mo_phong('403', 'không có tài khoản vai trò đối chứng', case_key='r111')
    can(qd and qd['quyet_dinh'] == 'MOCK_403', 'không ghi MOCK_403: %r' % (qd,))
    can(qd['muc'] == 'AUTO-DECISION', 'sai mức log: %r' % qd['muc'])
    return 'MOCK_403 vào sổ, không hộp thoại nào'


# ══════════════════════════════════════════════════════════════════════════════
# C. BÍ MẬT · RESUME · SONG SONG · HỒI QUY
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑰ sổ quyết định KHÔNG mang bí mật (quét toàn bộ khối)')
def c1():
    import auto_confirm as ac
    cs = ac.ChinhSach(in_ra=False)
    cs.cho_phep_ghi(48)
    cs.tai_khoan('ChuyenVien', 'admin@moet.gov.vn', 'MatKhauThat123!')
    cs.vai_tro('LanhDao', True)
    cs.mutation(ac.QA_DELETE, ma='zzqa_x_001', so_qa=None, cong=None)
    s = json.dumps(cs.khoi(), ensure_ascii=False)
    for k in ('MatKhauThat123!', 'admin@moet.gov.vn', 'Authorization', 'Cookie', 'eyJ'):
        can(k not in s, 'sổ quyết định lộ %r' % k)
    return 'quét 5 khoá nhạy cảm: 0'


@kiem('⑱ `--non-interactive` là MẶC ĐỊNH của chay_live; `--interactive` tắt được')
def c2():
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'), '--help'],
                       capture_output=True, text=True, timeout=120)
    out = r.stdout + r.stderr
    can('--non-interactive' in out, 'thiếu cờ --non-interactive')
    can('--interactive' in out, 'thiếu cờ --interactive')
    can('--chi-doc' in out, 'thiếu cờ --chi-doc')
    noi = open(os.path.join(TOOLS, 'chay_live.py'), encoding='utf-8').read()
    can(re.search(r"--non-interactive'.*?\n.*?default=True", noi, re.S) or
        "default=True" in noi.split('--non-interactive')[1][:400],
        'non-interactive KHÔNG phải mặc định')
    return '3 cờ có mặt · non-interactive mặc định BẬT'


@kiem('⑲ resume + parallel KHÔNG sinh thêm câu hỏi nào')
def c3():
    noi = open(os.path.join(TOOLS, 'chay_live.py'), encoding='utf-8').read()
    # Mỗi màn một `ChinhSach` riêng -> chạy song song không trộn sổ, cũng không có khoá chung
    can(noi.count('auto_confirm.ChinhSach(') >= 1, 'main không dựng ChinhSach cho từng Viec')
    can('input(' not in noi, 'chay_live có input()')
    for f in ('phep_live.py', 'truong_live.py', 'man_live.py', 'attt_live.py',
              'qa_data.py', 'live_ui.py', 'mock_live.py', 'hanh_dong.py'):
        n = open(os.path.join(TOOLS, f), encoding='utf-8').read()
        can(not re.search(r'(?<![\w.])input\s*\(', n), '%s có input()' % f)
    return '9 module của luồng live: 0 input() · mỗi màn một bảng chính sách'


@kiem('⑳ dry-run non-interactive chạy trọn, tự quyết, mã thoát đúng')
def c4():
    goc = tempfile.mkdtemp(prefix='ac-dry-')
    try:
        import kiem_qa_data as kq
        src = kq.dung_bo_case(goc)
        p_hs = os.path.join(goc, 'ChuyenVien', 'ho-so-man',
                            os.path.basename(src).replace('.xlsx', '.json'))
        hs = json.load(open(p_hs, encoding='utf-8'))
        hs['url'] = ['http://127.0.0.1:9/admin/loai-nguon']
        json.dump(hs, open(p_hs, 'w', encoding='utf-8'), ensure_ascii=False)
        env = kq.moi_truong(goc)
        subprocess.run([sys.executable, os.path.join(TOOLS, 'ket_qua.py'), 'ChuyenVien',
                        'LoaiNguon', '--create', '--apply'],
                       capture_output=True, text=True, timeout=600, env=env)
        cu = io.StringIO()
        r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'), 'ChuyenVien',
                            'LoaiNguon', '--dry-run', '--session', 'ac-dry'],
                           capture_output=True, text=True, timeout=600, env=env)
        out = r.stdout + r.stderr
        can('[AUTO-CONFIRM] decision=ALLOW_QA_WRITE' in out,
            'dry-run không tự quyết ALLOW_QA_WRITE:\n%s' % out[-800:])
        can('TỰ ĐỘNG — không hỏi' in out, 'không in chế độ tự động')
        can('chặn an toàn' in out, 'không in kế hoạch')
        m = re.search(r'(\d+) chặn an toàn', out)
        can(m and m.group(1) == '0', 'còn case bị chặn ở chế độ tự động: %s' % (m and m.group(1)))
        # thiếu tài khoản -> BLOCKED, mã thoát khác 0, KHÔNG treo
        env2 = dict(env)
        env2.pop('QA_USER', None)
        env2.pop('QA_PASS', None)
        r2 = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'), 'ChuyenVien',
                             'LoaiNguon', '--dry-run', '--session', 'ac-dry2'],
                            capture_output=True, text=True, timeout=600, env=env2,
                            stdin=subprocess.DEVNULL)
        can(r2.returncode != 0, 'thiếu tài khoản mà mã thoát vẫn 0')
        # ⚠️ KỲ VỌNG ĐỔI 2026-09-17 cùng lý do với phép ⑥: khuôn log nay mang tên vai trò.
        can('[SAFETY-BLOCK] decision=MISSING_CREDENTIAL' in (r2.stdout + r2.stderr),
            'không ghi quyết định MISSING_CREDENTIAL:<role>')
        for k in ('matkhau', 'MatKhau', env.get('QA_PASS', 'zzz-khong-co')):
            can(k not in (r2.stdout + r2.stderr), 'log lộ %r' % k)
        return '0 case chặn · BLOCKED khi thiếu tài khoản · mã thoát ≠ 0 · không lộ bí mật'
    finally:
        shutil.rmtree(goc, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--chi', help='chỉ chạy phép có tên chứa chuỗi này')
    a = ap.parse_args()
    print('TỰ KIỂM LỚP QUYẾT ĐỊNH TỰ ĐỘNG (non-interactive live test)')
    dat = hong = 0
    for ten, f in KQ:
        if a.chi and a.chi not in ten:
            continue
        try:
            ghi = f()
            print('   ✔ %-62s %s' % (ten, ghi or ''))
            dat += 1
        except Exception as e:
            print('   ✘ %-62s %s: %s' % (ten, type(e).__name__, str(e)[:260]))
            hong += 1
    print('\n   ĐẠT %d · HỎNG %d' % (dat, hong))
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())
