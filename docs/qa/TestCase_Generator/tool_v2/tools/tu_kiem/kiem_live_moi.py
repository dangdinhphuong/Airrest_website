#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM NĂNG LỰC LIVE MỚI — thao tác thật · mô phỏng mạng · hai phiên ATTT  (2026-09-16).

Bộ kiểm của phần vừa thêm cho lớp chạy case. Nguyên tắc giống `kiem_qa_data.py`: chạy trên
`app_gia_crud.py` trong thư mục tạm, không đụng bộ case, không cần tài khoản thật.

Vì sao phải có bộ này chứ không dựa vào lượt chạy thật: mọi năng lực dưới đây đều thuộc loại
**hỏng thì im lặng**. Một cú bấm chuột không tới nút đọc ra "0 request" rồi chấm P; một cửa sổ
mock không giữ được request nào đọc ra "màn không có dữ liệu" rồi chấm F; hai phiên lẫn cookie
thì phép ATTT đo đúng một tài khoản hai lần rồi kết luận "phân quyền chạy tốt". Không phép nào
trong số đó tự báo lỗi.

    python3 tools/tu_kiem/kiem_live_moi.py            # exit 0 = đạt hết
    python3 tools/tu_kiem/kiem_live_moi.py --chi mock # chỉ chạy phép có tên chứa 'mock'
"""
import argparse
import json
import os
import re
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

TK_A = ('qa@gia.vn', 'matkhau-QA')          # tenant T1, CÓ quyền
TK_B = ('xem@gia.vn', 'matkhau-XEM')        # tenant T1, KHÔNG quyền  -> phân quyền vai trò
TK_C = ('khac@gia.vn', 'matkhau-KHAC')      # tenant T2, CÓ quyền     -> phạm vi dữ liệu
PHAN_HE = 'Phân hệ Cơ Sở Dữ Liệu'
KQ = []


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


# ══════════════════════════════════════════════════════════════════════════════
# HẠ TẦNG
# ══════════════════════════════════════════════════════════════════════════════
def mo_chrome(goc, ten, tk, base):
    """Chrome + đăng nhập. Mỗi lời gọi một HỒ SƠ RIÊNG — cách ly bằng cấu trúc, không bằng dọn."""
    import browser_manager as bm
    import probe_live as pl
    prof = os.path.join(goc, 'chrome-' + ten)
    os.makedirs(prof, exist_ok=True)
    c = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
    c.bat_mang()
    pl.dang_nhap(c, base + '/admin/loai-nguon', tk[0], tk[1], PHAN_HE,
                 home='/admin', login='/login')
    c.wait("document.body.innerText.length>30?1:0", 30)
    time.sleep(0.8)
    return c


def bang(c):
    import live_ui as ui
    return ui.doc_bang(c) or []


# ══════════════════════════════════════════════════════════════════════════════
# A. THAO TÁC NGƯỜI DÙNG THẬT
# ══════════════════════════════════════════════════════════════════════════════
@kiem('① bấm nút THẬT bằng chuột (Input.dispatchMouseEvent), không phải el.click()')
def a1(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a1', TK_A, base)
    try:
        # Đếm sự kiện chuột THẬT: `isTrusted` chỉ true khi sự kiện do trình duyệt sinh ra.
        # Đây là phép phân biệt duy nhất giữa "chuột thật" và `el.click()`.
        c.js("""window.__qa=[];document.getElementById('b-them')
             .addEventListener('click',e=>window.__qa.push(!!e.isTrusted));1""")
        r = ui.bam_chuot(c, '+ Thêm loại nguồn', 'man')
        time.sleep(0.8)
        ds = c.jsj('JSON.stringify(window.__qa||[])') or []
        can(r and r.get('ok'), 'bam_chuot không bấm được nút')
        can(ds == [True], 'sự kiện không phải chuột thật: %r' % (ds,))
        can(ui.co_hop_thoai(c), 'bấm xong mà biểu mẫu không mở')
        return 'isTrusted=True · biểu mẫu mở ra'
    finally:
        c.kill()


@kiem('② bấm 4 lần giãn 90 ms -> 4 sự kiện rời, KHÔNG bị gộp thành bấm đúp')
def a2(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a2', TK_A, base)
    try:
        c.js("""window.__d=[];document.getElementById('b-lam-moi')
             .addEventListener('click',e=>window.__d.push(e.detail));1""")
        t0 = time.time()
        r = ui.bam_nhieu_lan(c, 'Làm mới dữ liệu', 4, 90, 'man')
        giay = time.time() - t0
        time.sleep(0.6)
        ds = c.jsj('JSON.stringify(window.__d||[])') or []
        can(r and r.get('so_lan') == 4, 'không bấm đủ 4 lần: %r' % (r,))
        can(len(ds) == 4, 'trang chỉ nhận %d sự kiện bấm (phải 4)' % len(ds))
        can(giay >= 0.25, 'bốn cú bấm chỉ mất %.2fs — chưa giãn đủ 90 ms' % giay)
        return '4 sự kiện · %.2fs · detail=%s' % (giay, ds)
    finally:
        c.kill()


@kiem('③ bấm ĐÚP thật -> trang nhận click detail=2 KÈM dblclick')
def a3(goc, base):
    """⚠️ Bấm trên một nút CỦA APP không đo được cơ chế này: nút `Làm mới` tự đặt
    `disabled=true` ngay sau cú bấm đầu, nên cú thứ hai không tới nơi và phép kiểm tố sai
    `bam_dup`. Dựng một nút TRƠ để đo đúng cái đang đo — cơ chế dispatch, không phải app."""
    import live_ui as ui
    c = mo_chrome(goc, 'a3', TK_A, base)
    try:
        c.js("""const b=document.createElement('button'); b.id='qa-tro';
             b.textContent='NUT TRO QA';
             b.style.cssText='position:fixed;left:20px;top:200px;z-index:99;padding:10px';
             document.body.appendChild(b); window.__ev=[];
             ['click','dblclick'].forEach(t=>b.addEventListener(t,
                 e=>window.__ev.push([t,e.detail])));1""")
        r = ui.bam_dup(c, 'NUT TRO QA', 'man')
        time.sleep(0.6)
        ev = c.jsj('JSON.stringify(window.__ev||[])') or []
        can(r and r.get('ok'), 'bam_dup không bấm được: %r' % (r,))
        can(['dblclick', 2] in [list(x) for x in ev],
            'trang KHÔNG nhận dblclick (đọc được: %r)' % (ev,))
        return 'sự kiện: %s' % ev
    finally:
        c.kill()


@kiem('④ rê chuột THẬT bật được :hover của CSS')
def a4(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a4', TK_A, base)
    try:
        c.js("""const s=document.createElement('style');
             s.textContent='#b-xuat:hover{background:rgb(1,2,3)}';
             document.head.appendChild(s);1""")
        r = ui.re_chuot(c, 'Xuất Excel', 'man')
        can(r is not None, 're_chuot trả None')
        can(r['co_doi'] and 'nen' in r['doi'],
            'rê chuột KHÔNG bật :hover (trước=%s sau=%s)' % (r['truoc']['nen'], r['sau']['nen']))
        can('rgb(1, 2, 3)' in r['sau']['nen'], 'nền sau khi hover không đúng: %s' % r['sau']['nen'])
        return 'nền đổi %s -> %s' % (r['truoc']['nen'], r['sau']['nen'])
    finally:
        c.kill()


@kiem('⑤ nạp tệp vào input[type=file] (DOM.setFileInputFiles)')
def a5(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a5', TK_A, base)
    try:
        tep = os.path.join(goc, 'mau-qa.csv')
        open(tep, 'w', encoding='utf-8').write('ma,ten\nzzqa_1,QA\n')
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu')
        o = ui.o_chon_tep(c, 'hop')
        can(o, 'biểu mẫu không có ô chọn tệp')
        r = ui.nap_tep(c, tep, 0, 'hop')
        can(r and r.get('so_tep') == 1, 'không nạp được tệp: %r' % (r,))
        can(r.get('ten') == 'mau-qa.csv', 'tên tệp đọc lại sai: %r' % r.get('ten'))
        can(r.get('co', 0) > 0, 'tệp nạp vào rỗng')
        return 'ô %r nhận %s (%d byte)' % (r.get('nhan'), r.get('ten'), r.get('co'))
    finally:
        c.kill()


@kiem('⑥ cuộn trang + thao tác trong DÒNG bảng + đọc control trong dòng')
def a6(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a6', TK_A, base)
    try:
        b = bang(c)
        can(b, 'bảng rỗng')
        x = ui.cuon(c, 'cuoi')
        can(x and x.get('y', 0) >= 0, 'không cuộn được')
        ma = None
        for r in b:
            for v in (r.get('o') or {}).values():
                if str(v).startswith('nguon_that_'):
                    ma = str(v)
                    break
            if ma:
                break
        can(ma, 'không tìm được mã bản ghi trên bảng')
        ctl = ui.control_trong_dong(c, 0) or []
        nhan = [y['nhan'] for y in ctl if y.get('nhan')]
        can(any('Chỉnh sửa' in y for y in nhan), 'không đọc được icon trong dòng: %r' % nhan)
        r = ui.bam_trong_dong(c, ma, 'Chỉnh sửa')
        time.sleep(1.0)
        can(r and r.get('ok'), 'không bấm được icon trong dòng: %r' % (r,))
        can(ui.co_hop_thoai(c), 'bấm icon Chỉnh sửa mà hộp thoại không mở')
        hop = ui.doc_hop_thoai(c)
        can(ma.split('_')[-1] in json.dumps(hop, ensure_ascii=False) or 'Chỉnh sửa'
            in (hop.get('tieu_de') or ''), 'hộp mở không phải của dòng đã chọn')
        return 'cuộn y=%s · icon trong dòng: %s' % (x.get('y'), ' · '.join(nhan[:4]))
    finally:
        c.kill()


@kiem('⑦ lật trang THẬT + đọc cụm phân trang (thẳng hàng · nút vô hiệu)')
def a7(goc, base):
    import live_ui as ui
    import man_live as ml
    c = mo_chrome(goc, 'a7', TK_A, base)
    try:
        ui.dien(c, 'Số bản ghi/trang', '10', 'man')
        time.sleep(1.2)
        r = ui.lat_trang(c, 2)
        can(r and r.get('ok'), 'không lật được trang: %r' % (r,))
        can(r.get('doi'), 'lật trang mà DỮ LIỆU không đổi')
        cum = ml._cum_phan_trang(c)
        can(cum and cum.get('tp'), 'không đọc được cụm phân trang')
        vo_hieu = [x for x in cum['tp'] if x.get('vo_hieu')]
        chon = [x for x in cum['tp'] if x.get('dang_chon')]
        return ('%d dòng -> %d dòng · %d thành phần · %d nút vô hiệu · đang chọn %s'
                % (r['so_dong_truoc'], r['so_dong_sau'], len(cum['tp']), len(vo_hieu),
                   [x['chu'] for x in chon]))
    finally:
        c.kill()


@kiem('⑧ chờ TOAST bằng poll (không phải đo một lần sau 8 giây)')
def a8(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a8', TK_A, base)
    try:
        ui.bam(c, 'Làm mới dữ liệu', 'man', cho=0.1)
        r = ui.cho_thong_bao(c, giay=8.0, chua='Đã làm mới')
        can(r, 'không bắt được toast trong 8 giây')
        can(r['sau_giay'] < 5.0, 'toast bắt quá muộn: %.2fs' % r['sau_giay'])
        return 'bắt được %r sau %.2fs' % (r['chu'][0], r['sau_giay'])
    finally:
        c.kill()


@kiem('⑨ đọc breadcrumb + trạng thái màn (đang tải / rỗng / lỗi)')
def a9(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a9', TK_A, base)
    try:
        bc = ui.doc_breadcrumb(c)
        can(bc and len(bc.get('chang') or []) >= 2,
            'không đọc được breadcrumb: %r' % (bc,))
        can(bc['chang'][-1]['cuoi'], 'không đánh dấu được cấp cuối')
        tt = ui.trang_thai_tai(c)
        can(tt and tt.get('so_dong', 0) > 0, 'trạng thái màn đọc sai: %r' % (tt,))
        can(not tt.get('rong'), 'màn có dữ liệu mà báo RỖNG')
        return ('%s · %d dòng' % (' > '.join(x['chu'] for x in bc['chang']), tt['so_dong']))
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# B. MÔ PHỎNG MẠNG  (page.route)
# ══════════════════════════════════════════════════════════════════════════════
def _mock(c, base, kich_ban, so_ban_ghi=45):
    import mock_live, qalib
    import live_ui as ui
    cs = qalib.CuaSoMock('kiem', kich_ban, ['/api/items'])
    with mock_live.Mock(c, cs, so_ban_ghi=so_ban_ghi) as m:
        c.go(base + '/admin/loai-nguon')
        m.cho("document.body.innerText.length>50?1:0", giay=15)
        m.nghi(1.2)
        ra = {'dung': m.da_dung, 'dong': len(ui.doc_bang(c) or []),
              'phan_trang': ui.doc_phan_trang(c), 'trang_thai': ui.trang_thai_tai(c),
              'id_mang': m.id_mang(), 'khoi': cs.khoi(),
              'dai_nhat': max([len(v) for r in (ui.doc_bang(c) or [])
                               for v in r['o'].values()] or [0])}
    return ra


@kiem('⑩ mock DANH SÁCH RỖNG / NHIỀU BẢN GHI / DỮ LIỆU DÀI')
def b1(goc, base):
    c = mo_chrome(goc, 'b1', TK_A, base)
    try:
        goc_dong = len(bang(c))
        can(goc_dong > 0, 'app giả không có dữ liệu thật')
        rong = _mock(c, base, 'rong')
        can(rong['dung'], 'mock rỗng không giữ được request nào')
        can(rong['dong'] == 0, 'mock rỗng mà bảng còn %d dòng' % rong['dong'])
        nhieu = _mock(c, base, 'nhieu_ban_ghi', 45)
        can(str(nhieu['phan_trang'].get('tong')) == '45',
            'mock nhiều bản ghi: tổng đọc ra %r' % nhieu['phan_trang'].get('tong'))
        can(nhieu['phan_trang'].get('so_nut_trang', 0) >= 3,
            'mock 45 bản ghi mà chỉ có %d nút trang' % nhieu['phan_trang'].get('so_nut_trang'))
        dai = _mock(c, base, 'du_lieu_dai')
        can(dai['dai_nhat'] > 300, 'mock dữ liệu dài: ô dài nhất chỉ %d ký tự' % dai['dai_nhat'])
        return ('thật %d dòng · rỗng 0 dòng · nhiều 45/3 trang · dài %d ký tự'
                % (goc_dong, dai['dai_nhat']))
    finally:
        c.kill()


@kiem('⑪ mock LỖI 500/403 + ĐANG TẢI + TIMEOUT')
def b2(goc, base):
    c = mo_chrome(goc, 'b2', TK_A, base)
    try:
        ra = {}
        for kb in ('loi_500', 'loi_403', 'dang_tai', 'timeout'):
            ra[kb] = _mock(c, base, kb)
            can(ra[kb]['dung'], 'mock %s không giữ được request nào' % kb)
            can(ra[kb]['dong'] == 0, 'mock %s mà bảng vẫn có %d dòng' % (kb, ra[kb]['dong']))
        can(ra['dang_tai']['trang_thai'].get('dang_tai'),
            'mock "đang tải" mà màn KHÔNG ở trạng thái đang tải')
        return ' · '.join('%s: %d dòng' % (k, v['dong']) for k, v in ra.items())
    finally:
        c.kill()


@kiem('⑫ mock KHÔNG nói dối: khai endpoint SAI thì `da_dung`=False, không kết luận')
def b3(goc, base):
    import mock_live, qalib
    c = mo_chrome(goc, 'b3', TK_A, base)
    try:
        cs = qalib.CuaSoMock('kiem', 'rong', ['/api/khong-ton-tai'])
        with mock_live.Mock(c, cs) as m:
            c.go(base + '/admin/loai-nguon')
            m.cho("document.querySelectorAll('table tbody tr').length?1:0", giay=12)
            m.nghi(1.0)
            dung, dong = m.da_dung, len(bang(c))
        can(not dung, 'khai endpoint sai mà mock vẫn báo ĐÃ DÙNG — phép đo sẽ kết luận về một '
                      'trạng thái chưa từng dựng')
        can(dong > 0, 'request thật bị chặn oan (bảng %d dòng)' % dong)
        return 'da_dung=False · request thật vẫn đi (bảng %d dòng)' % dong
    finally:
        c.kill()


@kiem('⑬ sổ mạng nhận ra MOCKED bằng networkId, không phải bằng lời khai')
def b4(goc, base):
    import mock_live, qalib
    c = mo_chrome(goc, 'b4', TK_A, base)
    try:
        c.lay_mang()
        cs = qalib.CuaSoMock('kiem', 'rong', ['/api/items'])
        with mock_live.Mock(c, cs) as m:
            c.go(base + '/admin/loai-nguon')
            m.cho("document.body.innerText.length>50?1:0", giay=12)
            m.nghi(1.0)
            ids = m.id_mang()
        ev = c.bom_mang()
        can(ids, 'mock không ghi lại networkId nào')
        so = qalib.so_mang(ev, id_mock=ids)
        moc = [x for x in so if x['loai'] == qalib.MOCK]
        can(moc, 'sổ mạng KHÔNG nhận ra request nào là MOCKED')
        # bằng chứng ngược: KHÔNG đưa id vào thì chính request ấy phải mang lớp khác
        so2 = qalib.so_mang(ev, id_mock=())
        moc2 = [x for x in so2 if x['loai'] == qalib.MOCK]
        can(not moc2, 'không có id mà sổ vẫn gán MOCKED — đang tin lời khai chứ không tin id')
        return '%d request MOCKED (có id) · 0 (không id)' % len(moc)
    finally:
        c.kill()


@kiem('⑭ mock GHI: POST bị giữ tại trình duyệt thì KHÔNG tới máy chủ (đếm ở kho)')
def b5(goc, base):
    import mock_live, qalib
    import live_ui as ui
    import urllib.request
    c = mo_chrome(goc, 'b5', TK_A, base)
    try:
        def dem():
            return json.load(urllib.request.urlopen(base + '/api/_dem', timeout=5))
        try:
            truoc = dem()
        except Exception:
            truoc = None
        cs = qalib.CuaSoMock('kiem', 'loi_409', ['/api/items'])
        with mock_live.Mock(c, cs) as m:
            ui.mo_hop(c, '+ Thêm loại nguồn')
            ui.dien(c, 'Code', 'zzqa_mock_1', 'hop')
            ui.dien(c, 'Tên hiển thị', 'QA mock', 'hop')
            c.js("document.getElementById('f-luu').click();1")
            m.nghi(2.5)
            giu = [x for x in cs.da_chan if x['method'] == 'POST']
            ui.dong_hop(c)
        can(giu, 'POST của biểu mẫu KHÔNG bị mock giữ lại')
        if truoc is not None:
            sau = dem()
            can(sau['tao'] == truoc['tao'],
                'POST bị mock mà kho vẫn tăng số lần tạo (%s -> %s)' % (truoc['tao'], sau['tao']))
            return 'giữ %d POST · kho KHÔNG đổi (tao=%s)' % (len(giu), sau['tao'])
        return 'giữ %d POST tại trình duyệt' % len(giu)
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# C. HAI PHIÊN / ATTT
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑮ hai phiên KHÔNG lẫn cookie (cách ly bằng hồ sơ, không bằng dọn)')
def c1(goc, base):
    ca = mo_chrome(goc, 'c1a', TK_A, base)
    cb = mo_chrome(goc, 'c1b', TK_C, base)
    try:
        pa = ca.js("document.cookie")
        pb = cb.js("document.cookie")
        can('qa@gia.vn' in (pa or ''), 'phiên A không giữ cookie của A: %r' % pa)
        can('khac@gia.vn' in (pb or ''), 'phiên B không giữ cookie của B: %r' % pb)
        can('qa@gia.vn' not in (pb or ''), 'cookie của A LỌT sang phiên B')
        can('khac@gia.vn' not in (pa or ''), 'cookie của B LỌT sang phiên A')
        # và hai phiên phải thấy hai tập dữ liệu khác nhau (tenant khác nhau)
        a = {r['txt'] for r in bang(ca)}
        b = {r['txt'] for r in bang(cb)}
        can(a and b, 'một trong hai phiên không đọc được bảng')
        can(not (a & b), 'hai tenant thấy chung %d dòng' % len(a & b))
        return 'cookie riêng · %d vs %d dòng, giao nhau 0' % (len(a), len(b))
    finally:
        ca.kill()
        cb.kill()


@kiem('⑯ vai trò KHÔNG quyền: UI bị chặn VÀ API trả 403 (đo cả hai nửa)')
def c2(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'c2', TK_B, base)
    try:
        txt = ui.doc_van_ban(c) or ''
        can('Không đủ quyền' in txt, 'UI KHÔNG chặn vai trò không quyền: %r' % txt[:120])
        can(len(bang(c)) == 0, 'trang từ chối mà vẫn lộ %d dòng dữ liệu' % len(bang(c)))
        r = ui.goi_api_doc(c, base + '/api/items')
        can(r and r.get('ma') == 403, 'API không trả 403 cho vai trò không quyền: %r' % (r,))
        return 'UI chặn · API 403'
    finally:
        c.kill()


@kiem('⑰ IDOR: vai trò tenant khác GET bản ghi của tenant này -> 403')
def c3(goc, base):
    import live_ui as ui
    import urllib.request
    ca = mo_chrome(goc, 'c3a', TK_A, base)
    cb = mo_chrome(goc, 'c3b', TK_C, base)
    try:
        ds = json.loads(ui.goi_api_doc(ca, base + '/api/items')['tom_tat']
                        if False else '[]')  # không dùng tóm tắt: nó bị cắt 200 ký tự
        raw = urllib.request.Request(base + '/api/items')
        raw.add_header('Cookie', 'phien=%s' % TK_A[0])
        ds = json.load(urllib.request.urlopen(raw, timeout=5))['items']
        can(ds, 'tenant A không có bản ghi nào')
        id_a = ds[0]['id']
        ta = ui.goi_api_doc(ca, '%s/api/items/%s' % (base, id_a))
        tb = ui.goi_api_doc(cb, '%s/api/items/%s' % (base, id_a))
        can(ta and ta.get('ma') == 200, 'chủ sở hữu KHÔNG đọc được bản ghi của mình: %r' % (ta,))
        can(tb and tb.get('ma') == 403,
            'tenant khác đọc được bản ghi ngoài phạm vi (mã %r) — lỗ IDOR' % (tb or {}).get('ma'))
        return 'chủ 200 · tenant khác 403'
    finally:
        ca.kill()
        cb.kill()


@kiem('⑱ phát hiện MISMATCH: UI ẩn nút nhưng API vẫn cho (ca dựng bằng mock)')
def c4(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'c4', TK_A, base)
    try:
        # Dựng ca: giấu nút Xóa khỏi UI nhưng API không đổi -> phép đo phải thấy API CHO.
        c.js("""document.querySelectorAll('button[data-xoa]').forEach(b=>b.remove());1""")
        con = c.jsj("JSON.stringify([...document.querySelectorAll('button[data-xoa]')].length)")
        can(con == 0, 'không giấu được nút Xóa')
        r = ui.goi_api_doc(c, base + '/api/items')
        can(r and r.get('ma') == 200,
            'API phải vẫn cho ĐỌC — đây là nửa mà phép chỉ đọc DOM không bao giờ thấy')
        return 'UI 0 nút Xóa · API vẫn 200 -> phép đo có đủ dữ kiện để tố mismatch'
    finally:
        c.kill()


@kiem('⑲ `goi_api_doc` TỪ CHỐI mọi method ghi — không có đường ghi bằng fetch')
def c5(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'c5', TK_A, base)
    try:
        for m in ('POST', 'PUT', 'PATCH', 'DELETE'):
            try:
                ui.goi_api_doc(c, base + '/api/items', m)
            except ValueError:
                continue
            raise Loi('goi_api_doc CHO QUA method %s' % m)
        return '4/4 method ghi bị từ chối ngay ở hàm'
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# D. BỘ DỊCH BƯỚC + BÍ MẬT
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑳ cột C -> hành động: nút MỞ ≠ nút CHỐT, tên ô ≠ giá trị')
def d1(goc, base):
    import hanh_dong as hd
    ds = hd.dich('1. Bấm nút "Thêm mới".', 'man')
    can(ds[0]['loai'] == 'click' and not ds[0]['ghi'],
        '"Thêm mới" ở màn danh sách bị coi là nút ghi -> chặn mất đường mở biểu mẫu')
    ds = hd.dich('1. Bấm nút "Thêm mới".', 'hop')
    can(ds[0]['ghi'], '"Thêm mới" trong hộp thoại KHÔNG được coi là nút chốt')
    ds = hd.dich('1. Nhập "abc" vào ô "Tên hiển thị".', 'hop')
    can(ds[0]['muc_tieu'] == 'Tên hiển thị' and ds[0]['gia_tri'] == 'abc',
        'nhầm tên ô với giá trị: %r' % (ds[0],))
    ds = hd.dich('1. Chọn "Trạng thái" là "Hoạt động".', 'hop')
    can(ds[0]['loai'] == 'select' and ds[0]['gia_tri'] == 'Hoạt động',
        'bước CHỌN GIÁ TRỊ bị dịch sai: %r' % (ds[0],))
    ds = hd.dich('1. Bấm nút "Xóa".', 'man')
    can(ds[0]['ghi'], 'nút Xóa KHÔNG được đánh dấu là thao tác ghi')
    return '5/5 ca dịch đúng'
def _fail_neu(dk, msg):
    can(not dk, msg)


@kiem('㉑ bộ dịch bước chạy được TRỌN cột C của case thật (không còn bước "?")')
def d2(goc, base):
    import hanh_dong as hd
    mau = [
        '1. Để trống ô "Code".\n2. Các thông tin khác nhập hợp lệ.\n3. Bấm nút "Tạo loại nguồn".',
        '1. Nhập vào ô tìm kiếm một từ khoá (từ 3 ký tự).\n2. Nhấn Enter.',
        '1. Rê chuột vào icon "Xóa".\n2. Quan sát màu.',
        '1. Chuyển sang trang 2.\n2. Đối chiếu dữ liệu.',
        '1. Nhấn phím Tab lần lượt qua các ô.',
        '1. Bấm vào tiêu đề cột "Ngày tạo" để sắp xếp.',
        '1. Sao chép một đoạn chữ, dán vào ô "Mô tả".',
        '1. Tích chọn "Gộp nhóm còn lại thành Khác".',
        '1. Bỏ tích ô "Màu sắc".',
        '1. Cuộn xuống cuối trang.',
    ]
    hong = []
    for x in mau:
        for a in hd.dich(x, 'hop'):
            if a['loai'] == '?':
                hong.append(a['buoc'][:60])
    can(not hong, 'còn %d bước không dịch được: %s' % (len(hong), ' | '.join(hong[:3])))
    return '%d cột C · 0 bước không dịch được' % len(mau)


@kiem('㉒ KHÔNG bí mật nào lọt ra evidence của lớp mới')
def d3(goc, base):
    import live_ui as ui
    import qalib
    c = mo_chrome(goc, 'd3', TK_A, base)
    try:
        r = ui.goi_api_doc(c, base + '/api/items')
        s = json.dumps(r, ensure_ascii=False)
        for k in ('matkhau', 'password', 'phien=', 'Cookie', 'Authorization'):
            can(k.lower() not in s.lower(), 'evidence của goi_api_doc chứa %r: %s' % (k, s[:200]))
        # và bộ che phải cắt được token trong văn bản tự do
        bd = ui._che_bi_mat('{"access_token":"abc123","u":"x"} eyJhbGciOi.eyJzdWIi.sig')
        can('abc123' not in bd, 'không che được access_token: %s' % bd)
        can('eyJhbGciOi.eyJzdWIi.sig' not in bd, 'không che được JWT: %s' % bd)
        # sổ chặn của browser_manager không được mang header/cookie
        import browser_manager as bm
        g = bm._gon_chan({'params': {'requestId': 'r1', 'networkId': 'n1',
                                     'request': {'method': 'POST', 'url': base + '/api/login',
                                                 'headers': {'Cookie': 'phien=x'},
                                                 'postData': 'p=matkhau-QA'}}})
        can('matkhau' not in json.dumps(g), 'sổ chặn giữ postData: %r' % g)
        can('Cookie' not in json.dumps(g), 'sổ chặn giữ header: %r' % g)
        return 'API · JWT · sổ chặn: 0 bí mật'
    finally:
        c.kill()


@kiem('㉓ mock KHÔNG được dùng cho case hỏi nghiệp vụ máy chủ (§4e luật ①)')
def d4(goc, base):
    import qalib
    can(qalib.la_case_cam_mock('Kiểm tra lưu đúng vào database'),
        'case "lưu đúng vào database" KHÔNG bị cấm dùng mock')
    can(qalib.la_case_cam_mock('Kiểm tra thẻ số liệu khớp DB'),
        'case "khớp DB" KHÔNG bị cấm dùng mock')
    can(not qalib.la_case_cam_mock('Kiểm tra danh sách khi không có dữ liệu'),
        'case hiển thị danh sách rỗng bị cấm oan')
    can(not qalib.la_case_cam_mock('SQL Injection (Insert) qua ô tìm kiếm'),
        'case SQL Injection bị cấm oan — nó là chuỗi nhập vào ô')
    return '4/4 ca phân loại đúng'


@kiem('㉔ cửa sổ mock có HẠN MỨC và có sổ — không mở toang')
def d5(goc, base):
    import qalib
    cs = qalib.CuaSoMock('r1', 'rong', ['/api/items'], so_toi_da=2)
    can(cs.khop('http://x/api/items'), 'không khớp endpoint đã khai')
    can(not cs.khop('http://x/api/items-extra'), 'khớp LỎNG sang endpoint khác')
    can(not cs.khop('http://x/api/evil/items'), 'khớp LỎNG theo chuỗi con')
    cs.ghi_chan('GET', 'http://x/api/items', 'r1', 'n1', 'trả rỗng')
    cs.ghi_chan('GET', 'http://x/api/items', 'r2', 'n2', 'trả rỗng')
    try:
        cs.ghi_chan('GET', 'http://x/api/items', 'r3', 'n3', 'trả rỗng')
    except qalib.LoiHangRao:
        pass
    else:
        raise Loi('vượt hạn mức mà cửa sổ mock không dừng')
    can(cs.id_mang == {'n1', 'n2'}, 'sổ networkId sai: %r' % cs.id_mang)
    can('[MOCK]' in cs.nhan_xet(), 'ghi chú không mang dấu [MOCK]')
    return 'khớp đúng bằng · hạn mức 2 · sổ 2 networkId'


# ══════════════════════════════════════════════════════════════════════════════

@kiem('Enter qua CDP phải KÍCH HOẠT được nút đang giữ tiêu điểm (r472)')
def k_enter_kich_hoat(goc, base):
    """`keyDown` không kèm `text` chỉ là phím THÔ — hành vi mặc định không chạy.

    Đo 21/09 trên chính app giả này: cùng một nút, cùng một tiêu điểm, bản không có `text`
    cho 0 lần kích hoạt còn bản có `text='\r'` cho đúng 1. Trên app thật, đó là lý do case
    *"Tab tới nút Cập nhật rồi Enter liên tục"* đo ra `so_request_ghi: 0` mà nút không hề bị
    vô hiệu — và không vòng chẩn đoán nào phân biệt nổi với "nút chống bấm trùng".
    """
    import live_ui as ui
    c = mo_chrome(goc, 'enter-kich-hoat', TK_A, base)
    try:
        ui._js(c, """
          document.body.insertAdjacentHTML('afterbegin',
            '<button id=qaEnter style="position:fixed;top:0;left:0;z-index:99999">THỬ</button>');
          window.__qaDem=0;
          document.getElementById('qaEnter').addEventListener('click',()=>{window.__qaDem++;});
          return '1';""")

        def dem():
            return int(ui._js(c, "return JSON.stringify(window.__qaDem||0);") or 0)

        def focus():
            ui._js(c, "document.getElementById('qaEnter').focus(); return '1';")

        can(dem() == 0, 'bộ đếm không sạch lúc bắt đầu')
        focus()
        ui.go_phim(c, 'Enter')
        time.sleep(0.35)
        can(dem() == 1, 'Enter KHÔNG kích hoạt được nút đang giữ tiêu điểm (đếm=%d) — thiếu '
                        '`text` trong Input.dispatchKeyEvent' % dem())
        focus()
        ui.go_phim(c, 'Enter', so_lan=3)
        time.sleep(0.35)
        can(dem() == 4, 'gõ Enter 3 lần mà nút chỉ nhận %d lần' % (dem() - 1))
        # Space cũng là phím SINH KÝ TỰ — cùng một lỗ.
        focus()
        ui.go_phim(c, 'Space')
        time.sleep(0.35)
        can(dem() == 5, 'Space không kích hoạt được nút (đếm=%d)' % dem())
        return 'Enter x1 -> 1 · Enter x3 -> +3 · Space -> +1'
    finally:
        c.kill()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--chi', help='chỉ chạy phép có tên chứa chuỗi này')
    a = ap.parse_args()

    import app_gia_crud as ag
    srv = ag.chay(0)
    port = srv.server_address[1]
    base = 'http://127.0.0.1:%d' % port
    goc = tempfile.mkdtemp(prefix='kiem-live-moi-')
    os.environ['QA_BAK_DIR'] = os.path.join(goc, '_bak')
    print('TỰ KIỂM NĂNG LỰC LIVE MỚI (thao tác thật · mock · hai phiên)')
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
            _in(ten, False, '%s: %s' % (type(e).__name__, str(e)[:260]))
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
