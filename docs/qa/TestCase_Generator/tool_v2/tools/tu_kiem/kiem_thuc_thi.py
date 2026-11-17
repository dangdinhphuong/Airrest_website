#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM LỚP THỰC THI 100 % CASE  (2026-09-16 lượt 3).

Bộ kiểm của đợt vá *"live test phải THỰC THI được toàn bộ testcase"*. Mọi phép ở đây chạy
trên `app_gia_crud.py` trong thư mục tạm — không đụng bộ case, không đụng `sessions/`, không
cần tài khoản thật.

Vì sao phải có bộ này chứ không dựa vào lượt chạy thật: mười năng lực vừa thêm đều thuộc lớp
**hỏng thì im lặng**, và ba trong số đó từng hỏng đúng như vậy ở bản trước:

  · một vùng `aria-live` của bộ báo tin điều hướng bị đọc thành toast ⇒ 10 case chấm F oan
    mà không dòng log nào kêu;
  · một ô lọc dựng bằng `<button>` không tìm được bằng nhãn ⇒ 11 case về CHƯA ĐO với câu
    *"phép đo không kết luận được"* — đọc lên y hệt "app không có gì để đo";
  · một case không có phép đo và một case có phép đo nhưng không kết luận được dùng CHUNG
    một câu tiếng Việt ⇒ đọc báo cáo xong không biết phải làm gì tiếp.

    python3 tools/tu_kiem/kiem_thuc_thi.py            # exit 0 = đạt hết
    python3 tools/tu_kiem/kiem_thuc_thi.py --chi toast
"""
import argparse
import json
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
REPO = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
os.environ.setdefault('QA_PROJECT', 'moetdl')

TK_A = ('qa@gia.vn', 'matkhau-QA')
PHAN_HE = 'Phân hệ Cơ Sở Dữ Liệu'

KQ = []


def kiem(ten):
    def deco(f):
        KQ.append((ten, f))
        return f
    return deco


def _in(ten, ok, ghi_chu=''):
    print('   %s %-64s %s' % ('✔' if ok else '✘', ten, ghi_chu))


class Loi(AssertionError):
    pass


def can(dieu_kien, msg):
    if not dieu_kien:
        raise Loi(msg)


def mo_chrome(goc, ten, base, tk=TK_A):
    import browser_manager as bm
    import probe_live as pl
    prof = os.path.join(goc, 'chrome-' + ten)
    os.makedirs(prof, exist_ok=True)
    c = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
    c.bat_mang()
    pl.dang_nhap(c, base + '/admin/loai-nguon', tk[0], tk[1], PHAN_HE,
                 home='/admin', login='/login')
    c.wait("document.querySelectorAll('table tbody tr').length?1:0", 30)
    time.sleep(0.8)
    return c


# ══════════════════════════════════════════════════════════════════════════════
# A. §13 — TOAST ≠ VÙNG PHÂN TRANG ≠ VÙNG TRỢ NĂNG
# ══════════════════════════════════════════════════════════════════════════════
@kiem('① toast THẬT vẫn đọc được, mà câu điều hướng/phân trang KHÔNG bị nhận là toast')
def a1(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a1', base)
    try:
        d0 = ui.doc_bao_theo_loai(c)
        can(d0, 'không đọc được ba vùng thông báo')
        # App giả dựng sẵn: route announcer sr-only + vùng aria-live của cụm phân trang.
        can(any('chuyển đến trang' in x for x in d0['TRO_NANG']),
            'không nhận ra câu của bộ báo tin điều hướng (TRO_NANG=%r)' % d0['TRO_NANG'])
        can(any('sang trang' in x for x in d0['PHAN_TRANG']),
            'không nhận ra vùng aria-live của cụm phân trang (PHAN_TRANG=%r)' % d0['PHAN_TRANG'])
        can(not d0['TOAST'], 'chưa bấm gì mà đã có toast: %r' % d0['TOAST'])
        # ĐÂY là phép chốt của §13: `doc_thong_bao` KHÔNG được trả hai câu kia.
        tb0 = ui.doc_thong_bao(c)
        can(tb0 == [], 'doc_thong_bao trả %r khi chưa có toast nào' % tb0)
        # Toast thật -> phải đọc được (không được "vá quá tay" thành mù luôn cả toast).
        ui.bam(c, 'Làm mới dữ liệu', 'man', cho=0.4)
        r = ui.cho_thong_bao(c, giay=8.0)
        can(r and any('Đã làm mới' in x for x in r['chu']),
            'toast THẬT "Đã làm mới" không đọc được nữa (r=%r)' % (r,))
        d1 = ui.doc_bao_theo_loai(c)
        can('Đã làm mới' in ' '.join(d1['TOAST']), 'toast thật không vào nhóm TOAST')
        can(not any('chuyển đến trang' in x for x in d1['TOAST']),
            'câu điều hướng LỌT vào nhóm TOAST: %r' % d1['TOAST'])
        return ('toast %r · phân trang %r · trợ năng %r'
                % (d1['TOAST'][:1], d1['PHAN_TRANG'][:1], d1['TRO_NANG'][:1]))
    finally:
        c.kill()


@kiem('② sang trang 2 -> vùng phân trang đổi chữ, `doc_thong_bao` vẫn KHÔNG thấy toast nào')
def a2(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a2', base)
    try:
        r = ui.lat_trang(c, 2)
        can(r and r.get('ok'), 'không lật được sang trang 2 (r=%r)' % (r,))
        time.sleep(0.8)
        d = ui.doc_bao_theo_loai(c)
        can(any('sang trang 2' in x for x in d['PHAN_TRANG']),
            'vùng phân trang không cập nhật: %r' % d['PHAN_TRANG'])
        tb = ui.doc_thong_bao(c)
        can(tb == [], 'lật trang mà `doc_thong_bao` trả %r — đúng lớp false F của §13' % tb)
        return 'phân trang %r · toast []' % d['PHAN_TRANG'][:1]
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# B. §5 — Ô LỌC DỰNG BẰNG <button> TÌM ĐƯỢC VÀ THAO TÁC ĐƯỢC
# ══════════════════════════════════════════════════════════════════════════════
@kiem('③ ô lọc `<button>` chỉ có chữ gợi ý: bộ tìm CŨ trượt, bộ tìm MỚI tìm được')
def b1(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'b1', base)
    try:
        # Bộ tìm CŨ (`TIM` theo nhãn) trượt — đây chính là nguyên nhân 11 case CHƯA ĐO.
        cu = ui.doc_o(c, 'Trạng thái', 'man')
        # Bộ tìm MỚI phải tìm được, và phải nói ra nó đi đường nào.
        moi = ui.tim_o_chon(c, 'Trạng thái', 'loc')
        can(moi, 'bộ tìm MỚI cũng không tìm được ô lọc Trạng thái')
        can(moi.get('duong'), 'tìm được nhưng không ghi lại ĐƯỜNG tìm')
        can(moi.get('loai') == 'custom', 'nhận nhầm loại ô: %r' % moi.get('loai'))
        return 'bộ cũ %s · bộ mới tìm được qua đường `%s`' % (
            'trượt' if not cu else 'cũng tìm được', moi['duong'])
    finally:
        c.kill()


@kiem('④ mở ô lọc bằng CHUỘT THẬT rồi đọc + chọn được lựa chọn')
def b2(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'b2', base)
    try:
        op = ui.mo_o_chon(c, 'Trạng thái', 'loc')
        can(op and op.get('option'), 'mở ô lọc nhưng không đọc được lựa chọn nào (op=%r)' % (op,))
        ds = [x['chu'] for x in op['option'] if x.get('chu')]
        can(len(ds) >= 2, 'chỉ đọc được %d lựa chọn' % len(ds))
        can(all(x.get('can_le') for x in op['option']),
            'không đọc được căn lề của lựa chọn — case "căn lề các giá trị" sẽ lại CHƯA ĐO')
        r = ui.dat_o_chon(c, 'Trạng thái', ds[0], 'loc')
        can(r and r.get('ok'), 'không chọn được giá trị %r (r=%r)' % (ds[0], r))
        can(r.get('sau') and ds[0] in r['sau'],
            'chọn xong nhưng trigger vẫn hiện %r (thành công GIẢ)' % r.get('sau'))
        time.sleep(1.2)
        n = len(ui.doc_bang(c) or [])
        return '%d lựa chọn · chọn %r -> ô hiện %r · danh sách còn %d dòng' % (
            len(ds), ds[0], r['sau'], n)
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# C. §6 — HỘP THOẠI XEM CHI TIẾT
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑤ mở hộp Chi tiết bằng thao tác thật · đọc cặp nhãn→giá trị · đóng lại được')
def c1(goc, base):
    import live_ui as ui
    import phep_bosung as pb
    c = mo_chrome(goc, 'c1', base)
    try:
        ctx = _ctx_gia(c, base)
        hop, bam = pb._mo_hop_chi_tiet(ctx)
        can(hop, 'bấm biểu tượng Xem chi tiết mà hộp thoại không mở (bam=%r)' % (bam,))
        can('Chi tiết' in (hop.get('tieu_de') or ''),
            'tiêu đề hộp đọc được là %r' % hop.get('tieu_de'))
        cap = {x['nhan']: x['gia_tri'] for x in (hop.get('cap') or [])}
        can(len(cap) >= 4, 'chỉ đọc được %d cặp nhãn→giá trị: %r' % (len(cap), cap))
        can(any(v == '—' for v in cap.values()),
            'không đọc được ô rỗng hiện dấu "—" — nhánh "trường không có dữ liệu" sẽ mù')
        can(hop.get('cao') and hop.get('ti_le_cao'),
            'không đo được kích thước hộp — nhánh "dữ liệu quá dài" sẽ mù')
        can(pb._dong_hop_chi_tiet(ctx, bang_nen=True), 'không đóng được hộp bằng nền mờ')
        # Hỏi câu HẸP. Câu rộng `co_hop_thoai()` luôn trả lời CÓ trên màn có hộp app tự mở,
        # nên nó không bao giờ chứng minh được là hộp CỦA TA đã đóng.
        can(not ui.co_hop_thoai(c, 'Chi tiết'), 'báo đã đóng nhưng hộp Chi tiết vẫn còn')
        can(not ui.hop_cua_ta_con_mo(c), 'còn hộp nào đó không phải của app đang mở')
        return '%d dòng thông tin · cao %d%% màn hình · đóng bằng nền mờ OK' % (
            len(cap), hop['ti_le_cao'])
    finally:
        c.kill()


def _ctx_gia(c, base, cho_phep_ghi=False):
    """`Ctx` tối thiểu cho phép đo chỉ-đọc — không sổ QA, không cổng ghi."""
    import chay_live as cl
    import phep_live
    hs = {'grounding': {'verbatim': {'icon_ban_ghi': ['Xem chi tiết', 'Chỉnh sửa', 'Xóa'],
                                     'xem_chi_tiet': {'tieu_de': 'Chi tiết',
                                                      'gia_tri_rong': '—'}},
                        'api': ['GET /api/items (danh sách loại nguồn)'],
                        'hang_so': {'page_size_mac_dinh': 20}}}
    cong = cl.Cong(False, set(), None)
    ctx = phep_live.Ctx(c, None, hs, None, cong, base + '/admin/loai-nguon', 'LoaiNguon',
                        cho_phep_ghi=cho_phep_ghi)
    return ctx


# ══════════════════════════════════════════════════════════════════════════════
# D. §9/§11 — HÌNH HỌC + THẺ SỐ LIỆU
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑥ hình học: đo được SỐ THẬT của hộp chữ trong nút (không phải nhận xét bằng mắt)')
def d1(goc, base):
    import phep_bosung as pb
    c = mo_chrome(goc, 'd1', base)
    try:
        kq = pb._do_nut(c, 'Xuất Excel', 'man')
        can(kq, 'không đo được nút Xuất Excel')
        for k in ('rong', 'cao', 'chu_x', 'chu_rong', 'lech_trai', 'lech_phai'):
            can(kq.get(k) is not None, 'thiếu số đo %r trong kết quả: %r' % (k, kq))
        can(abs(kq['lech_trai'] - kq['lech_phai']) <= 2,
            'app giả căn giữa mà đo ra lệch trái %s ≠ lệch phải %s'
            % (kq['lech_trai'], kq['lech_phai']))
        return 'nút %dx%d · chữ cách trái %dpx / phải %dpx' % (
            kq['rong'], kq['cao'], kq['lech_trai'], kq['lech_phai'])
    finally:
        c.kill()


@kiem('⑦ chú thích: đọc được kích thước THẬT hoặc nói rõ đó là chú thích GỐC của trình duyệt')
def d2(goc, base):
    import live_ui as ui
    from phep_live import JS_ICON_DONG_DAU
    c = mo_chrome(goc, 'd2', base)
    try:
        tt = ui.tooltip_cua(c, JS_ICON_DONG_DAU)
        can(tt, 'không rê được chuột lên biểu tượng đầu dòng')
        can(tt.get('loai') in ('dom', 'native'),
            'app giả CÓ chú thích mà phép đo báo không có (loai=%r, thuộc tính=%r)'
            % (tt.get('loai'), tt.get('thuoc_tinh')))
        if tt['loai'] == 'dom':
            can(tt.get('rong') and tt.get('cao'), 'chú thích DOM mà không đo được kích thước')
            can(tt.get('can'), 'không đọc được căn lề của chú thích')
        return 'loại %s · %r%s' % (tt['loai'], (tt.get('txt') or '')[:28],
                                   ' · %dx%d' % (tt['rong'], tt['cao'])
                                   if tt['loai'] == 'dom' else '')
    finally:
        c.kill()


@kiem('⑧ thẻ số liệu: đọc được con số trên thẻ rồi đối chiếu với tổng ở thanh phân trang')
def d3(goc, base):
    import live_ui as ui
    import phep_bosung as pb
    c = mo_chrome(goc, 'd3', base)
    try:
        the = pb._so_tren_the(c, 'TỔNG NGUỒN')
        can(the and isinstance(the.get('so'), int), 'không đọc được số trên thẻ (%r)' % (the,))
        pt = ui.doc_phan_trang(c) or {}
        tong = int((pt.get('tong') or '0').replace('.', '').replace(',', '') or 0)
        can(the['so'] == tong,
            'thẻ %d ≠ tổng phân trang %d (app giả dựng hai số này bằng nhau)'
            % (the['so'], tong))
        return 'thẻ %d = tổng %d' % (the['so'], tong)
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# E. §8 — HAI TAB, MỘT SỔ MẠNG
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑨ tab thứ hai: cùng phiên đăng nhập, và request của nó VÀO CÙNG sổ mạng')
def e1(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'e1', base)
    try:
        c.bom_mang()                      # vét sạch sổ trước khi đo
        tab = c.mo_tab_phu(base + '/admin/loai-nguon')
        can(tab is not None, 'không mở được tab thứ hai')
        tab.wait("document.querySelectorAll('table tbody tr').length?1:0", 25)
        time.sleep(1.0)
        n = len(ui.doc_bang(tab) or [])
        can(n > 0, 'tab 2 mở được nhưng KHÔNG thấy dữ liệu — nghĩa là chưa dùng chung phiên')
        so = c.bom_mang()
        url = [((x.get('params') or {}).get('request') or {}).get('url', '') for x in so]
        can(any('/api/items' in u for u in url),
            'sổ mạng KHÔNG thấy request của tab 2 (%d bản ghi) — một phiên ghi mà sổ không '
            'nhìn thấy là đúng lỗ mà hàng rào sinh ra để bịt' % len(so))
        can(c.so_su_kien_bo() == 0, 'sổ mạng đã vứt %d sự kiện' % c.so_su_kien_bo())
        c.dong_tab_phu()
        return 'tab 2 thấy %d dòng · sổ chung nhận %d request' % (n, len(so))
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# F. §17 — TIỀN ĐIỀU KIỆN + DỰNG TRẠNG THÁI
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑩ tiền điều kiện đọc ĐÚNG: cụm ngắn không ăn cụm dài (chuyển TRẠNG thái ≠ chuyển trang)')
def f1(goc, base):
    import tien_dieu_kien as tdk
    mau = [
        ('Kiểm tra chuyển trạng thái thành công',
         '1. Bấm biểu tượng nút tam giác.', 'Đổi trạng thái thành công.', False),
        ('Kiểm tra icon Trang tiếp > (next page)',
         '1. Kiểm tra dữ liệu đủ 21 bản ghi / 2. Click vào icon >', 'Hiển thị page 2', True),
        ('Kiểm tra cách tải dữ liệu khi danh sách Loại DB lớn',
         '1. Mở ô chọn rồi cuộn.', 'load theo trang, mỗi trang 20 bản ghi', False),
        ('Kiểm tra ô Tìm kiếm cắt khoảng trắng hai đầu',
         '1. Nhập chuỗi có khoảng trắng đầu và cuối.', 'Cắt khoảng trắng', False),
        ('Kiểm tra vị trí trang sau khi thực hiện 1 thao tác',
         '1. Đang ở trang thứ 4, click nút "Thêm mới"', 'Vẫn ở lại trang thứ 4', True),
    ]
    sai = []
    for b, cc, d, mong in mau:
        cs = _case_gia(b, cc, d)
        that = tdk.CAN_NHIEU_TRANG in tdk.doc(cs)
        if that != mong:
            sai.append('%r: mong %s, được %s' % (b[:44], mong, that))
    can(not sai, 'phân tích tiền điều kiện sai:\n      ' + '\n      '.join(sai))
    cs4 = _case_gia('Kiểm tra vị trí trang sau khi thực hiện 1 thao tác',
                    '1. Đang ở trang thứ 4, click nút "Thêm mới"', 'Vẫn ở lại trang thứ 4')
    n4 = tdk.so_ban_ghi_can(cs4, 20)
    can(n4 == 61, '"trang thứ 4" phải cần 61 bản ghi, tính ra %d' % n4)
    cs2 = _case_gia('Kiểm tra icon Trang tiếp >', 'đủ 21 bản ghi', 'page 2')
    can(tdk.so_ban_ghi_can(cs2, 20) == 21,
        '"đủ 21 bản ghi" phải cần đúng 21, tính ra %d' % tdk.so_ban_ghi_can(cs2, 20))
    # SÀN: con số nhỏ hơn một mức/trang đọc được ở cột C là ví dụ MINH HOẠ, không phải nhu cầu
    cs3 = _case_gia('Kiểm tra chọn số bản ghi mỗi trang lớn hơn tổng số',
                    '1. Khi có 15 bản ghi.', 'Hiển thị toàn bộ')
    can(tdk.so_ban_ghi_can(cs3, 20) == 21,
        'sàn không áp: "có 15 bản ghi" ra %d thay vì 21' % tdk.so_ban_ghi_can(cs3, 20))
    return '5/5 mẫu đúng · trang thứ 4 -> 61 · "đủ 21" -> 21 · sàn -> 21'


def _case_gia(b, c, d, nhom=None):
    import chay_live as cl
    cs = cl.Case('BP', 10, b, c, d, nhom or {'cn': 'CN', 'grp': '', 'sub': '', 'sub2': ''}, 0)
    import qalib
    cs.thao_tac_ghi = [t for _, t in qalib.thao_tac_ghi(c, b)]
    return cs


@kiem('⑪ dựng trạng thái NHIỀU TRANG: tạo bù bản ghi QA thật, chạm trần thì rơi sang mock')
def f2(goc, base):
    import tien_dieu_kien as tdk
    c = mo_chrome(goc, 'f2', base)
    try:
        ctx = _ctx_gia(c, base)
        # Lượt CHỈ ĐỌC: không tạo được -> phải rơi sang mock, và phải NÓI RA là mock.
        cs = _case_gia('Kiểm tra icon Trang tiếp >', '1. Kiểm tra dữ liệu đủ 500 bản ghi',
                       'Hiển thị page 2')
        bd = tdk.dung_nhieu_trang(ctx, cs, page_size=20)
        can(bd.get('loai') in (tdk.MOCK, tdk.KHONG_DUNG_DUOC),
            'lượt chỉ-đọc mà lại báo dựng bằng %r' % bd.get('loai'))
        if bd.get('loai') == tdk.MOCK:
            can(bd.get('fallback') == 'MOCK', 'dùng mock mà không ghi cờ fallback')
        # Màn đã sẵn nhiều trang (app giả có 25 bản ghi, 20/trang) -> KHÔNG được tạo thêm gì.
        cs2 = _case_gia('Kiểm tra icon Trang tiếp >', '1. Kiểm tra dữ liệu đủ 21 bản ghi',
                        'Hiển thị page 2')
        bd2 = tdk.dung_nhieu_trang(ctx, cs2, page_size=20)
        can(bd2.get('loai') == tdk.DA_CO,
            'màn đã có 25 bản ghi ≥ 21 mà vẫn đi dựng (%r — %s)'
            % (bd2.get('loai'), bd2.get('mo_ta')))
        return 'cần 500 -> %s · cần 21 (đã có 25) -> DA_CO, không tạo gì' % bd.get('loai')
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# G. §2 — BẢN GHI THỰC THI PHÂN BIỆT ĐƯỢC BỐN NGUYÊN NHÂN
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑫ `NO_MEASUREMENT_IMPLEMENTED` ≠ `measurement_returned_none` ≠ `precondition_unmet`')
def g1(goc, base):
    import chay_live as cl
    import phep_live
    ma = set()
    # ① case không phép đo nào nhận
    cs = _case_gia('Một lớp case hoàn toàn lạ không ai viết phép đo', 'Làm gì đó.', 'Kỳ vọng.')
    dv = {'tien_dieu_kien': [], 'ly_do': phep_live.NO_MEASUREMENT}
    bg = cl.ban_ghi_thuc_thi(cs, cl.CHUA_DO, None, dv)
    can(bg['reason'] == phep_live.NO_MEASUREMENT, 'sai mã lý do: %r' % bg['reason'])
    can(bg['measurement_attempted'] is False, 'case chưa có phép đo mà báo đã thử')
    can(bg['measurement_name'] is None, 'case chưa có phép đo mà có tên phép')
    ma.add(bg['reason'])
    # ② phép đo có, đã chạy, trả None
    dv2 = {'tien_dieu_kien': [], 'phep_chay': 'tim_kiem', 'phep_da_thu': ['tim_kiem'],
           'loai_phep': 'UI', 'ly_do': phep_live.PHEP_TRA_NONE,
           'chi_tiet_ly_do': 'đã thử 1 phép'}
    bg2 = cl.ban_ghi_thuc_thi(cs, cl.CHUA_DO, None, dv2)
    can(bg2['reason'] == phep_live.PHEP_TRA_NONE, 'sai mã lý do: %r' % bg2['reason'])
    can(bg2['measurement_attempted'] is True, 'đã chạy phép đo mà báo chưa thử')
    can(bg2['measurement_name'] == 'tim_kiem', 'không ghi tên phép đo')
    ma.add(bg2['reason'])
    # ③ dựng trạng thái không nổi
    dv3 = {'tien_dieu_kien': ['requires_multiple_pages'], 'phep_da_thu': ['lat_trang'],
           'ly_do': phep_live.TIEN_DK_THIEU, 'chi_tiet_ly_do': 'không tạo nổi 21 bản ghi',
           'fixture_loai': 'KHONG_DUNG_DUOC'}
    bg3 = cl.ban_ghi_thuc_thi(cs, cl.CHUA_DO, None, dv3)
    can(bg3['reason'] == phep_live.TIEN_DK_THIEU, 'sai mã lý do: %r' % bg3['reason'])
    can(bg3['precondition'] == ['requires_multiple_pages'], 'mất bản kê tiền điều kiện')
    ma.add(bg3['reason'])
    can(len(ma) == 3, 'ba nguyên nhân KHÁC nhau lại dùng chung mã: %r' % ma)
    # ④ mọi trường của §2 phải CÓ MẶT, kể cả khi chưa biết
    can_co = ('tc_id', 'measurement_attempted', 'measurement_name', 'measurement_type',
              'precondition', 'fixture_created', 'action_executed', 'evidence_count',
              'result', 'reason', 'fallback_used')
    thieu = [k for k in can_co if k not in bg]
    can(not thieu, 'bản ghi thực thi thiếu trường: %r' % thieu)
    return '3 mã lý do tách bạch · %d trường bắt buộc đều có mặt' % len(can_co)


@kiem('⑬ 100 % case của một bộ THẬT đều có phép đo hoặc lý do PE-CSDL (không còn ô trắng)')
def g2(goc, base):
    import chay_live as cl
    import glob
    f = glob.glob(os.path.join(REPO, 'testCase', 'ChuyenVien', 'ket-qua-test', '*.xlsx'))
    f = [x for x in f if not os.path.basename(x).startswith('~')]
    if not f:
        raise Loi('không tìm thấy bộ case thật để đối chiếu')
    tong = kh = pedb = 0
    for duong in sorted(f):
        for c in cl.doc_cases(duong):
            tong += 1
            if c.muc_db == 'toan_bo':
                pedb += 1
            elif not cl._phep_cua(c, True):
                kh += 1
    can(kh == 0, '%d/%d case KHÔNG có phép đo nào nhận' % (kh, tong))
    return '%d case · 0 case không phép đo · %d case PE-CSDL (lý do riêng)' % (tong, pedb)


# ══════════════════════════════════════════════════════════════════════════════
# H. §14 — ĐÓNG BĂNG MÃ NGUỒN
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑭ mốc mã nguồn: sửa một tệp giữa chừng là bị phát hiện, không sửa thì báo sạch')
def h1(goc, base):
    import dong_bang_ma as db
    tam = os.path.join(goc, 'gia-tools')
    os.makedirs(tam, exist_ok=True)
    p = os.path.join(tam, 'a.py')
    with open(p, 'w') as f:
        f.write('x = 1\n')
    moc = db.moc_ma(tam)
    can(moc['so_tep'] == 1, 'chốt mốc sai số tệp: %r' % moc['so_tep'])
    can(not db.doi_chieu(moc, tam), 'chưa sửa gì mà đã báo lệch')
    time.sleep(0.01)
    with open(p, 'w') as f:
        f.write('x = 2\n')
    lech = db.doi_chieu(moc, tam)
    can(len(lech) == 1 and lech[0]['viec'] == 'SỬA',
        'sửa tệp mà không bị bắt: %r' % lech)
    with open(os.path.join(tam, 'b.py'), 'w') as f:
        f.write('y = 1\n')
    lech2 = db.doi_chieu(moc, tam)
    can(len(lech2) == 2, 'thêm tệp mới không bị bắt: %r' % lech2)
    return 'không đổi -> 0 lệch · sửa 1 + thêm 1 -> 2 lệch'


# ══════════════════════════════════════════════════════════════════════════════
# I. BẤT BIẾN AN TOÀN VẪN NGUYÊN
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑮ AUTO-CONFIRM vẫn CHẶN ghi dữ liệu thật · UNKNOWN · thiếu guard (không nới một ly)')
def i1(goc, base):
    import auto_confirm as ac
    import qa_data
    cs = ac.ChinhSach(non_interactive=True, in_ra=False)
    so = qa_data.SoQA(None, run_id=None, tai_khoan='qa@gia.vn', origin='http://x')
    ma_qa, _ = so.cap_ma()
    lop = type('G', (), {'ghi_xoa': lambda *a, **k: None})()
    # ① dữ liệu thật -> BLOCK
    qd = cs.mutation(ac.QA_DELETE, ma='nguon_that_01', so_qa=so, cong=lop, case_key='t')
    can(not qd and qd['quyet_dinh'] == ac.REAL_DATA_WRITE,
        'xoá dữ liệu thật KHÔNG bị chặn: %r' % (qd,))
    # ② mã QA của LƯỢT KHÁC -> BLOCK
    qd2 = cs.mutation(ac.QA_DELETE, ma='zzqa_khac00_001', so_qa=so, cong=lop, case_key='t')
    can(not qd2, 'mã QA của lượt khác KHÔNG bị chặn: %r' % (qd2,))
    # ③ thiếu cổng an toàn -> BLOCK
    qd3 = cs.mutation(ac.QA_CREATE, ma=ma_qa, so_qa=so, cong=None, case_key='t')
    can(not qd3 and qd3['quyet_dinh'] == ac.MISSING_GUARD,
        'thiếu guard mà vẫn cho ghi: %r' % (qd3,))
    # ④ loại thao tác lạ -> BLOCK
    qd4 = cs.mutation('XOA_TAT_CA_DU_LIEU', ma=ma_qa, so_qa=so, cong=lop, case_key='t')
    can(not qd4 and qd4['quyet_dinh'] == ac.UNKNOWN, 'thao tác lạ không bị chặn: %r' % (qd4,))
    # ⑤ KHÔNG tồn tại cờ bỏ qua hàng rào — kể cả trong mã MỚI thêm đợt này
    vp = ac.khong_co_co_bypass(TOOLS)
    can(not vp, 'có cờ bỏ qua hàng rào trong mã nguồn: %r' % vp)
    # ⑥ không có `input()` chặn trong luồng live
    ip = ac.quet_input_chan(TOOLS)
    can(not ip, 'có input() chặn trong luồng live: %r' % ip)
    return '4/4 nhánh ghi bị chặn đúng · 0 cờ bypass · 0 input() chặn'


@kiem('⑯ phép đo MỚI không cướp case của phép đang đo đúng (thứ tự ưu tiên còn nguyên)')
def i2(goc, base):
    import chay_live as cl
    import phep_live
    import phep_bosung
    moi = {p['ten'] for p in phep_bosung.PHEP_BOSUNG}
    j = os.path.join(REPO, 'sessions', 'live-VTLT-full2', 'result', 'cases.json')
    if not os.path.exists(j):
        return '(không có lượt chạy cũ để đối chiếu — bỏ qua)'
    cu = json.load(open(j, encoding='utf-8'))['cases']
    f = os.path.join(REPO, 'testCase', 'ChuyenVien', 'ket-qua-test',
                     'Testcase-Role-ChuyenVien-ViTriLuuTru_ket_qua.xlsx')
    cases = cl.doc_cases(f)
    cuop = []
    for c in cases:
        st = cu.get(c.key) or {}
        if st.get('tt') != 'XONG':
            continue
        ds = []
        for p in phep_live.PHEP:
            try:
                if p['nhan'](c):
                    ds.append(p['ten'])
            except Exception:
                pass
        da = st.get('phep')
        if da in ds and any(x in moi for x in ds[:ds.index(da)]):
            cuop.append((c.rn, da))
    # `do_case` (bộ phép TĨNH của `chay_live`) chạy TRƯỚC `phep_live.chay`, nên case nào
    # bộ tĩnh đã kết luận thì phép mới không với tới — loại chúng ra khỏi danh sách nghi.
    cuop = [(rn, da) for rn, da in cuop
            if da not in [t for t, _ in cl.PHEP]]
    can(not cuop, 'phép MỚI chen trước phép đang đo đúng ở %d case: %r' % (len(cuop), cuop[:5]))
    return '0/%d case đã kết luận bị phép mới chen trước' % len(cases)


@kiem('⑰ lô PILOT (§20) lấy được case cho ĐỦ 10 nhóm năng lực, không nhóm nào rỗng')
def i3(goc, base):
    import subprocess
    import cach_ly
    env = cach_ly.moi_truong_sach(goc)
    env.update(QA_PROJECT='moetdl', QA_TESTCASE_DIR=os.path.join(REPO, 'testCase'),
               ROLE_CHUYENVIEN_USER='cv@that.vn', ROLE_CHUYENVIEN_PASS='mk-cv',
               QA_SESSION_DIR=os.path.join(goc, 'phien-pilot'))
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'chay_live.py'),
                        'ChuyenVien', 'ViTriLuuTru', '--dry-run', '--pilot'],
                       capture_output=True, text=True, env=env, timeout=300,
                       stdin=subprocess.DEVNULL)
    ra = r.stdout + r.stderr
    can('LÔ PILOT' in ra, 'không in bảng pilot:\n%s' % ra[-500:])
    rong = [d.strip() for d in ra.splitlines() if 'KHÔNG có case nào' in d]
    can(not rong, 'có nhóm pilot KHÔNG lấy được case nào: %r' % rong)
    # Đếm số nhóm in ra — thiếu một nhóm là bảng pilot nói dối về phạm vi đã thử.
    import re as _re
    so = len([d for d in ra.splitlines() if _re.match(r'\s+\d+\. ', d)])
    can(so >= 10, 'bảng pilot chỉ có %d nhóm (phải đủ 10)' % so)
    return '%d/10 nhóm đều có case · 0 nhóm rỗng' % so


@kiem('⑱ hộp thoại APP TỰ MỞ không được biến thao tác THÀNH CÔNG thành "LỖI"')
def i4(goc, base):
    """Lỗ bắt được ở PILOT 17/09 trên app thật, và là lớp sai nguy nhất gặp hôm đó.

    Màn bật hộp "Hướng dẫn sử dụng" sau mỗi lần nạp trang. Nó KHÔNG chặn gì —
    `mo_hop()` vẫn mở đúng form. Nhưng `tao_ban_ghi` kết luận thành/bại bằng câu hỏi
    *"còn hộp thoại nào đang mở không?"*, mà câu đó luôn đúng vì hộp hướng dẫn chưa bao giờ
    đóng. Kết quả: `POST /targets` ĐÃ bay đi, bản ghi ĐÃ tạo (bước dọn xoá được nó), mà tool
    vẫn ném `LoiThaoTac` ⇒ case vào lớp `LỖI`. Báo thất bại cho một việc đã thành công.
    """
    import live_ui as ui
    c = mo_chrome(goc, 'i4', base)
    try:
        # ① app giả dựng sẵn hộp tự mở -> phải thấy nó
        ds = ui.hop_dang_mo(c)
        can(any('Hướng dẫn' in (x.get('tieu_de') or '') for x in ds),
            'app giả không bật hộp onboarding (điều kiện tiên quyết): %r' % ds)
        can(ui.co_hop_thoai(c) is True, 'co_hop_thoai() rộng phải thấy hộp app')
        # ② câu hỏi HẸP theo tiêu đề phải phân biệt được hộp của ta với hộp của app
        can(not ui.co_hop_thoai(c, 'Thêm loại nguồn mới'),
            'co_hop_thoai(tiêu đề) nhận nhầm hộp của APP thành hộp của ta — đây chính là lỗ')
        can(ui.co_hop_thoai(c, 'Hướng dẫn'), 'co_hop_thoai(tiêu đề) không khớp được hộp app')
        # ③ mở form CỦA TA khi hộp app còn đó -> vẫn mở được, và phân biệt được
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'hộp app chặn mất form của ta')
        can(ui.co_hop_thoai(c, 'Thêm loại nguồn mới'), 'không nhận ra form của ta đang mở')
        ui.dong_hop(c)
        time.sleep(0.6)
        can(not ui.co_hop_thoai(c, 'Thêm loại nguồn mới'),
            'đóng form của ta rồi mà câu hỏi HẸP vẫn bảo còn mở')
        # ③b BẤT BIẾN của 12 chỗ hỏi "hộp của ta đã đóng chưa": khi chỉ còn hộp APP thì câu
        #    hẹp phải trả lời KHÔNG. Hỏng chỗ này là mọi chỗ kia kết luận ngược — đúng cách
        #    `tao_ban_ghi` từng báo THẤT BẠI cho một bản ghi đã tạo xong trên app thật.
        can(not ui.hop_cua_ta_con_mo(c),
            'chỉ còn hộp của APP mà câu hẹp vẫn bảo hộp của ta đang mở')
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở lại được form của ta')
        can(ui.hop_cua_ta_con_mo(c), 'form của ta đang mở mà câu hẹp bảo không')
        ui.dong_hop(c)
        time.sleep(0.5)
        can(not ui.hop_cua_ta_con_mo(c), 'đóng form của ta rồi mà câu hẹp vẫn bảo còn mở')
        # ④ đóng hộp app -> nêu đúng tên, và chỉ bấm nút trong danh sách ĐÓNG
        da = ui.dong_hop_chan_ngang(c)
        can(any('Hướng dẫn' in x for x in da), 'không đóng được hộp app: %r' % da)
        can(not ui.co_hop_thoai(c), 'báo đã đóng nhưng hộp app vẫn còn')
        return 'hộp app hiện -> câu hỏi HẸP phân biệt đúng · đóng được, nêu tên %r' % da[:1]
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--chi', help='chỉ chạy phép có tên chứa chuỗi này')
    a = ap.parse_args()

    import app_gia_crud as ag
    srv = ag.chay(0)
    base = 'http://127.0.0.1:%d' % srv.server_address[1]
    goc = tempfile.mkdtemp(prefix='kiem-thuc-thi-')
    print('TỰ KIỂM LỚP THỰC THI 100 % CASE')
    print('   app giả: %s  ·  thư mục tạm: %s' % (base, goc))
    if not shutil.which('google-chrome') and not shutil.which('chromium'):
        print('   ⚠ KHÔNG có Chrome — bộ kiểm này KHÔNG chạy được, không tính là đạt.')
        return 2
    dat = hong = 0
    for ten, f in KQ:
        if a.chi and a.chi not in ten:
            continue
        try:
            ghi = f(goc, base)
            _in(ten, True, ghi or '')
            dat += 1
        except Exception as e:
            _in(ten, False, '%s: %s' % (type(e).__name__, str(e)[:300]))
            hong += 1
    print('\n   ĐẠT %d · HỎNG %d' % (dat, hong))
    srv.shutdown()
    if not hong:
        shutil.rmtree(goc, ignore_errors=True)
    else:
        print('   (giữ thư mục tạm để soi: %s)' % goc)
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())
