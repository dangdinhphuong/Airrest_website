#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM BỘ CHỌN + PHÂN TRANG + VÒNG ĐỜI FIXTURE  (2026-09-17 lượt 2).

Bộ kiểm của đợt vá sau lượt chạy 500 case. Mỗi phép ở đây dựng lại ĐÚNG một sự cố đã đo được
trên app thật, và phép nào cũng phải HỎNG trên mã cũ thì mới có giá trị:

  ① `doc_phan_trang` đếm mọi nút chữ-là-số trên cả trang    -> 19 case phân trang CHƯA ĐO
  ② `TIM_CHON` không tìm nổi ô chọn hiện GIÁ TRỊ thay chữ gợi ý -> 11 case ô chọn CHƯA ĐO
  ③ đọc danh sách tuỳ chọn khi nó mới vẽ 1 mục               -> "bấm hết 1 tuỳ chọn…"
  ④ bấm theo mốc `data-qa-moc` qua hai lượt gọi trình duyệt  -> 18 case LỖI ở bước SETUP
  ⑤ báo thành công cho một cú bấm không đổi được giá trị     -> 115/115 case ghi hỏng (16/09)

Chạy trên `app_gia_crud.py` trong thư mục tạm — không đụng bộ case, không cần tài khoản thật.

    python3 tools/tu_kiem/kiem_bo_chon.py
"""
import argparse
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

KQ = []
TK_A = ('qa@gia.vn', 'matkhau-QA')
PHAN_HE = 'Phân hệ Cơ Sở Dữ Liệu'


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


def mo_chrome(goc, ten, base):
    import browser_manager as bm
    import probe_live as pl
    prof = os.path.join(goc, 'chrome-' + ten)
    os.makedirs(prof, exist_ok=True)
    c = bm.Chrome(hien=False, port='auto', profile=prof, diet_cu=False)
    c.bat_mang()
    pl.dang_nhap(c, base + '/admin/loai-nguon', TK_A[0], TK_A[1], PHAN_HE,
                 home='/admin', login='/login')
    c.wait("document.querySelectorAll('table tbody tr').length?1:0", 30)
    time.sleep(0.6)
    return c


# ══════════════════════════════════════════════════════════════════════════════
# A. PHÂN TRANG — đọc trong ĐÚNG cụm phân trang
# ══════════════════════════════════════════════════════════════════════════════
@kiem('① nút chữ-là-số NGOÀI cụm phân trang không bị đếm là nút trang')
def a1(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a1', base)
    try:
        co = ui._js(c, "return JSON.stringify(!!document.querySelector('#huy-hieu'));")
        can(co, 'app giả thiếu huy hiệu số ở header — phép kiểm này không chứng minh gì')
        pt = ui.doc_phan_trang(c)
        can(pt, 'không đọc được cụm phân trang')
        can('3' not in (pt.get('nut_trang') or []),
            'huy hiệu "3" ở header LỌT vào danh sách nút trang: %r' % pt.get('nut_trang'))
        can(pt.get('trang_hien') != '3',
            'đọc trang hiện tại thành "3" từ huy hiệu ở header (pt=%r)' % pt)
        return 'nút trang %r · trang hiện %r' % (pt.get('nut_trang'), pt.get('trang_hien'))
    finally:
        c.kill()


@kiem('② màn không vẽ nút số trang vẫn TÍNH được số trang từ tổng ÷ cỡ trang')
def a2(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'a2', base)
    try:
        pt = ui.doc_phan_trang(c)
        can(pt.get('moi_trang'), 'không đọc được cỡ trang (ô "Số bản ghi/trang") — %r' % pt)
        can(pt.get('tong_so') is not None, 'không đọc được tổng số bản ghi — %r' % pt)
        mong = max(1, -(-int(pt['tong_so']) // int(pt['moi_trang'])))
        can(pt.get('so_trang_tinh') == mong,
            'số trang tính sai: %r (tổng %s ÷ %s phải ra %d)'
            % (pt.get('so_trang_tinh'), pt['tong_so'], pt['moi_trang'], mong))
        can(ui.so_trang(pt) == pt['so_trang'], 'ui.so_trang không khớp bản đọc')
        return 'tổng %s ÷ %s = %d trang' % (pt['tong_so'], pt['moi_trang'], mong)
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# B. BỘ CHỌN — tìm · mở · chờ ổn định · bấm · verify
# ══════════════════════════════════════════════════════════════════════════════
@kiem('③ ô chọn hiện GIÁ TRỊ (không có nhãn, không có chữ gợi ý) tìm được bằng đường ⑥')
def b1(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'b1', base)
    try:
        khong = ui.tim_o_chon(c, 'Sắp xếp', 'loc')
        co = ui.tim_o_chon(c, 'Sắp xếp', 'loc', tuy_chon=['Mới nhất trước', 'Cũ nhất trước'])
        can(co, 'khai `tuy_chon` rồi vẫn không tìm ra ô Sắp xếp')
        can(co.get('duong') == 'tuy_chon_khai',
            'tìm ra bằng đường %r chứ không phải đường ⑥' % co.get('duong'))
        can(co.get('chu') == 'Mới nhất trước', 'tìm nhầm ô: %r' % co.get('chu'))
        # Chứng minh đường ⑥ mới là thứ làm nên việc: không khai `tuy_chon` thì đúng là
        # KHÔNG tìm ra — đây là trạng thái của bản cũ, và là nguồn của 11 case CHƯA ĐO.
        can(not khong, 'không khai tuy_chon mà vẫn tìm ra -> phép kiểm không chứng minh gì')
        return 'không khai tuy_chon: không thấy · khai rồi: thấy bằng %r' % co['duong']
    finally:
        c.kill()


@kiem('④ danh sách tuỳ chọn nạp chậm rồi vẽ lại: đọc ra ĐỦ mục, không đọc 1 mục')
def b2(goc, base):
    import live_ui as ui
    c = mo_chrome(goc, 'b2', base)
    try:
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu Thêm mới')
        time.sleep(0.4)
        op = ui.mo_o_chon(c, 'Loại kho', 'hop', 'Chọn loại kho')
        ds = [x['chu'] for x in (op or {}).get('option', [])]
        can(len(ds) >= 4, 'chỉ đọc được %d tuỳ chọn (%r) — danh sách chưa ổn định đã đọc'
            % (len(ds), ds))
        ui.dong_o_chon(c)
        ui.dong_hop(c)
        return '%d tuỳ chọn: %s' % (len(ds), ' · '.join(ds[:4]))
    finally:
        c.kill()


@kiem('⑤ BoChon đặt được giá trị vào ô VẼ LẠI giữa chừng, và VERIFY được ở trigger')
def b3(goc, base):
    import bo_chon
    import live_ui as ui
    c = mo_chrome(goc, 'b3', base)
    try:
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu Thêm mới')
        time.sleep(0.4)
        r = bo_chon.BoChon(c, 'Loại kho', 'hop', 'Chọn loại kho').chon('MongoDB')
        can(r.ok, 'không đặt được giá trị: %s || %r' % (r.get('ly_do'), r.get('buoc')))
        can('MongoDB' in (r.get('sau') or ''), 'trigger sau khi chọn là %r' % r.get('sau'))
        # Phải ăn ngay bằng BẤM TOẠ ĐỘ. App giả có tuỳ chọn là `div onclick` nên `dom_click`
        # cứu được, còn app THẬT dùng thư viện nghe `pointerdown` — ở đó `dom_click` không ăn
        # và case rơi vào lớp LỖI. Chốt ở `bam_toa_do` thì phép kiểm mới bắt được đúng cái đã
        # hỏng trên app thật: đo toạ độ khi popup còn nằm NGOÀI MÀN (x âm).
        can(r.get('cach') == 'bam_toa_do',
            'phải chọn được bằng bấm toạ độ, nhưng phải lùi tới %r sau %d bước — dấu hiệu đo '
            'toạ độ lúc popup chưa định vị' % (r.get('cach'), len(r['buoc'])))
        ten_buoc = [b['buoc'] for b in r['buoc']]
        for b in ('LOCATE', 'OPEN', 'VERIFY_OPEN', 'DISCOVER', 'SELECT', 'VERIFY_SELECTED'):
            can(b in ten_buoc, 'thiếu bước %s trong bản kê: %r' % (b, ten_buoc))
        ui.dong_hop(c)
        return 'ok bằng cách %r, %d bước ghi lại' % (r.get('cach'), len(r['buoc']))
    finally:
        c.kill()


@kiem('⑥ chọn giá trị KHÔNG có trong danh sách -> báo hỏng có mã, KHÔNG báo thành công')
def b4(goc, base):
    import bo_chon
    import live_ui as ui
    c = mo_chrome(goc, 'b4', base)
    try:
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu Thêm mới')
        time.sleep(0.4)
        r = bo_chon.BoChon(c, 'Loại kho', 'hop', 'Chọn loại kho').chon('KhôngHềCóLựaChọnNày')
        can(not r.ok, 'chọn một giá trị không tồn tại mà vẫn báo thành công: %r' % dict(r))
        can(r.get('ma_ly_do') == 'KHONG_CO_GIA_TRI',
            'mã lý do sai: %r' % r.get('ma_ly_do'))
        can(r.get('co'), 'không kê ra danh sách giá trị thật có -> người đọc không sửa được')
        ui.dong_hop(c)
        return 'mã %s · kê %d giá trị thật có' % (r['ma_ly_do'], len(r['co']))
    finally:
        c.kill()


@kiem('⑦ ô chọn <select> gốc vẫn đi đúng nhánh native và verify được')
def b5(goc, base):
    import bo_chon
    import live_ui as ui
    c = mo_chrome(goc, 'b5', base)
    try:
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu Thêm mới')
        time.sleep(0.4)
        b = bo_chon.BoChon(c, 'Trạng thái', 'hop')
        can(b.loai() == 'native', 'ô <select> gốc nhận nhầm loại: %r' % b.loai())
        r = b.chon(dau_tien=True)
        can(r.ok, 'không đặt được giá trị cho <select> gốc: %s' % r.get('ly_do'))
        can(r.get('cach') == 'native', 'đi nhầm nhánh: %r' % r.get('cach'))
        ui.dong_hop(c)
        return 'native · %r' % r.get('sau')
    finally:
        c.kill()


# ══════════════════════════════════════════════════════════════════════════════
# C. VÒNG ĐỜI FIXTURE — thuần logic, không cần trình duyệt
# ══════════════════════════════════════════════════════════════════════════════
@kiem('⑧ ô bắt buộc báo HỎNG thì bị chặn TRƯỚC khi bấm Lưu, ô đọc-lại-rỗng thì không')
def c1(goc, base):
    import bo_chon
    import phep_live as pl
    xau = pl._o_chua_dat({
        'Code': 'zzqa_x_001',
        'Loại database': bo_chon.KetQuaChon(ok=False, ly_do='bấm không ăn'),
        'Ghi chú': '',                       # đọc lại rỗng — KHÔNG được coi là chưa đặt
        'Chuỗi kết nối': 'HỎNG: gõ không vào',
    })
    can(len(xau) == 2, 'soát sai: %r' % xau)
    can(any('Loại database' in x for x in xau), 'bỏ sót ô chọn hỏng: %r' % xau)
    can(any('Chuỗi kết nối' in x for x in xau), 'bỏ sót ô báo HỎNG bằng chuỗi: %r' % xau)
    can(not any('Ghi chú' in x for x in xau),
        'coi ô đọc-lại-rỗng là chưa đặt -> chặn nhầm 169 lượt tạo đang chạy đúng: %r' % xau)
    return '2/4 ô bị chặn, ô rỗng không bị chặn'


@kiem('⑨ tạo dữ liệu QA có tạo lại, và cả ba lượt dùng LẠI một mã (không đẻ bản ghi trùng)')
def c2(goc, base):
    import inspect
    import phep_live as pl
    can(pl.SO_LAN_TAO >= 2, 'không có lượt tạo lại nào (SO_LAN_TAO=%r)' % pl.SO_LAN_TAO)
    src = inspect.getsource(pl.Ctx.tao_ban_ghi)
    can('cap_ma()' in src and src.count('cap_ma()') == 1,
        'cấp mã nhiều lần trong vòng tạo lại -> mỗi lượt một mã, đẻ bản ghi thừa')
    can('hien_ban_ghi_qa(ma, lam_moi=True)' in src,
        'không hỏi app trước khi tạo lại -> tạo trùng khi lượt trước đã tạo mà đọc hụt')
    return 'SO_LAN_TAO=%d · cấp mã 1 lần · có đối soát app trước mỗi lượt lại' % pl.SO_LAN_TAO


@kiem('⑩ kiem_ban_ghi phân biệt đủ 5 tình huống §F, không gộp về "không thấy"')
def c3(goc, base):
    import phep_live as pl
    ma = {pl.Ctx.CO, pl.Ctx.BI_XOA, pl.Ctx.KHONG_THAY, pl.Ctx.CHUA_NAP,
          pl.Ctx.BO_LOC_CHE, pl.Ctx.LECH_PHIEN}
    can(len(ma) == 6, 'các mã trạng thái trùng nhau: %r' % ma)
    import inspect
    src = inspect.getsource(pl.Ctx.ban_ghi)
    can('danh_dau_khong_thay' in src, 'không đánh dấu sạch cho bản ghi đã mất')
    can('self.CHUA_NAP' not in src.split('danh_dau_khong_thay')[0].split('if tt in')[-1],
        'CHUA_NAP bị đánh dấu sạch -> bỏ lại bản ghi QA thật trên hệ thống')
    return '6 mã phân biệt · CHUA_NAP/LECH_PHIEN không bị đánh dấu sạch'


@kiem('⑪ phép đo trả None phải kèm ảnh trạng thái — không còn evidence_count = 0')
def c4(goc, base):
    import inspect
    import phep_live as pl
    src = inspect.getsource(pl.chay)
    can('anh_trang_thai(ctx)' in src, 'nhánh None không chụp trạng thái màn')
    can("dv['so_bang_chung'] = dem_bang_chung(anh)" in src,
        'chụp rồi mà không đếm vào evidence_count')
    dv = pl._dau_vet_moi()
    for k in ('fixture_ten', 'fixture_trang_thai', 'thuc_thi_trang_thai',
              'fallback_da_thu', 'fallback_ket_qua'):
        can(k in dv, 'dấu vết thiếu trường §C: %s' % k)
    return 'có ảnh trạng thái · đủ 5 trường §C'


@kiem('⑭ chọn xong rồi VẪN tìm lại được ô, dù trigger đã đổi từ chữ gợi ý sang giá trị')
def b6(goc, base):
    """Cùng lớp với ô "Sắp xếp" nhưng nguy hơn: nó bịa ra một thất bại cho việc ĐÃ THÀNH CÔNG.

    Ô lọc hiện `-- Chọn trạng thái --` lúc đầu; chọn xong nó hiện `Đang hoạt động`. Năm đường
    tìm cũ đều bám chữ gợi ý, nên ngay sau cú chọn thành công thì ô "biến mất", bước đọc lại
    trả `None`, và hàm báo *"chọn xong nhưng trigger vẫn hiện None (thành công GIẢ)"* — tức
    chấm HỎNG cho một cú bấm đã ăn.
    """
    import live_ui as ui
    c = mo_chrome(goc, 'b6', base)
    try:
        truoc = ui.tim_o_chon(c, 'Trạng thái', 'loc')
        can(truoc and 'Chọn' in (truoc.get('chu') or ''),
            'ô lọc không ở trạng thái chữ gợi ý lúc đầu: %r' % truoc)
        r = ui.dat_o_chon(c, 'Trạng thái', 'Đang hoạt động', 'loc')
        can(r and r.get('ok'), 'không chọn được: %r' % r)
        can(r.get('sau'), 'chọn xong mà đọc lại ô ra None -> báo hỏng cho việc đã xong: %r' % r)
        can('Đang hoạt động' in (r.get('sau') or ''), 'đọc lại ra %r' % r.get('sau'))
        return 'trước %r -> sau %r' % (truoc.get('chu'), r.get('sau'))
    finally:
        c.kill()


@kiem('⑮ ô chọn nằm SÁT ĐÁY khung nhìn vẫn chọn được (cuộn trong popup, không cuộn trang)')
def b7(goc, base):
    """Gốc của 18 case LỖI ở lượt chạy 500: danh sách tuỳ chọn mở xuống dưới, tràn khỏi đáy
    khung nhìn. `scrollIntoView` cuộn TRANG, mà popup `position:fixed` không nhúc nhích — tuỳ
    chọn vẫn ngoài khung. Hỏng theo cụm: từ bản ghi thứ 65 trở đi (lúc bảng đã dài) là hỏng
    mọi lượt tạo dữ liệu QA.
    """
    import bo_chon
    import live_ui as ui
    c = mo_chrome(goc, 'b7', base)
    try:
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu Thêm mới')
        time.sleep(0.4)
        # Ép ô chọn xuống sát đáy khung nhìn — thu khung lại cho chắc.
        c.ws.call('Emulation.setDeviceMetricsOverride', width=1280, height=420,
                  deviceScaleFactor=1, mobile=False)
        time.sleep(0.5)
        vt = ui._js(c, """
          const e=[...document.querySelectorAll('#f-kho')][0]; if(!e) return 'null';
          e.scrollIntoView({block:'end'});
          return JSON.stringify({y:Math.round(e.getBoundingClientRect().top),
                                 cao_khung:innerHeight});""")
        can(vt, 'không thấy ô chọn trong biểu mẫu')
        r = bo_chon.BoChon(c, 'Loại kho', 'hop', 'Chọn loại kho').chon('PostgreSQL')
        can(r.ok, 'ô chọn sát đáy khung (y=%s/%s) mà không chọn được: %s'
            % (vt.get('y'), vt.get('cao_khung'), r.get('ly_do')))
        return 'trigger ở y=%s trong khung cao %s · chọn được bằng %r' % (
            vt.get('y'), vt.get('cao_khung'), r.get('cach'))
    finally:
        try:
            c.ws.call('Emulation.clearDeviceMetricsOverride')
        except Exception:
            pass
        c.kill()


@kiem('⑯ endpoint POST mang {id} phải vào nhóm `sua` — cửa sổ ghi khai được nó')
def c7(goc, base):
    """Hồ sơ màn khai `POST /targets/{id}/activate (activateTarget)`, nhưng bản trước chỉ xếp
    `POST` KHÔNG có `{id}` vào nhóm `tao` — endpoint này rơi ra ngoài MỌI nhóm, nên không cửa
    sổ ghi nào khai được. Hậu quả đo được 17/09: phép chuyển trạng thái mở cửa sổ `sua`, app
    bắn `/activate`, sổ mạng tố một request GHI ngoài danh sách và DỪNG cả lượt chạy ở case
    66/89 — mất trắng phần đã chấm.
    """
    import qalib
    hs = {'grounding': {'api': [
        'GET  /targets/{id}      (getTarget)',
        'POST /targets           (createTarget)',
        'PUT  /targets/{id}      (updateTarget)',
        'DEL  /targets/{id}      (deleteTarget)',
        'POST /targets/{id}/activate    (activateTarget)',
        'POST /targets/{id}/deactivate  (deactivateTarget)',
        'gốc REST: /api/db-tool/v1']}}
    e = qalib.endpoints_ghi(hs)
    can('/api/db-tool/v1/targets/{id}/activate' in e['sua'],
        'endpoint activate KHÔNG vào nhóm sua: %r' % e)
    can('/api/db-tool/v1/targets/{id}/deactivate' in e['sua'], 'thiếu deactivate: %r' % e)
    can(e['tao'] == ['/api/db-tool/v1/targets'], 'POST mang {id} lọt vào nhóm tao: %r' % e)
    can('/api/db-tool/v1/targets/{id}' in e['xoa'], 'mất endpoint xoá: %r' % e)
    return 'tao %d · sua %d · xoa %d' % (len(e['tao']), len(e['sua']), len(e['xoa']))


@kiem('⑰ hộp thoại đang TRƯỢT VÀO: không được lấy toạ độ giữa chừng rồi bấm vào chỗ trống')
def b8(goc, base):
    """ROOT CAUSE của 18 case LỖI trên app thật, chứng minh 18/09 bằng phép chụp theo mốc:

        t=0ms   x=1598  transform: translateX(798px)
        t=532ms x= 800  transform: none

    `mo_hop()` chờ hộp hiện ra rồi NGỦ 0,5s — sát ngay ranh giới 532ms. Máy nhàn thì kịp;
    lượt chạy dài tải nặng thì đo trúng giữa quãng trượt, toạ độ lệch gần 800px, và
    `Input.dispatchMouseEvent` bắn vào chỗ trống. `getBoundingClientRect` vẫn trả về một con
    số trông hoàn toàn hợp lệ, nên không chỗ nào kêu.

    App giả cho biểu mẫu trượt 900ms để phép kiểm này bắt được thật.
    """
    import bo_chon
    import live_ui as ui
    c = mo_chrome(goc, 'b8', base)
    try:
        # Bật quãng trượt 2000ms — dài hơn hẳn nhịp dò tự nhiên của `mo_hop` (~0,97s), nếu
        # không thì phép kiểm xanh cả khi gỡ bản vá và nó chứng minh 0.
        c.go(base + '/admin/loai-nguon?truot=2000')
        c.wait("document.querySelectorAll('table tbody tr').length?1:0", 20)
        time.sleep(0.6)
        import live_ui as _ui
        _ui.dong_hop_chan_ngang(c)
        t0 = time.time()
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu Thêm mới')
        cho = time.time() - t0
        # `mo_hop` phải TỰ chờ hộp yên vị — nếu nó trả về trước 900ms thì nó đang trả về một
        # hộp còn đang trượt.
        # `mo_hop` phải TỰ chờ hết quãng trượt 2000ms. Trả về sớm hơn nghĩa là nó đưa cho
        # người gọi một hộp đang chạy, và mọi toạ độ đọc sau đó đều là toạ độ cũ.
        can(cho >= 1.8, 'mo_hop trả về sau %.2fs — sớm hơn quãng trượt 2,0s, tức trả về một '
                        'hộp CHƯA yên vị' % cho)
        # KHÔNG chờ hộ ở đây: phép kiểm phải đo đúng thứ người gọi thật sẽ gặp — chọn ngay
        # sau khi `mo_hop` trả về. Chờ hộ là giấu mất chính lỗi cần bắt.
        r = bo_chon.BoChon(c, 'Loại kho', 'hop', 'Chọn loại kho').chon('MySQL')
        can(r.ok, 'không chọn được sau khi hộp trượt xong: %s' % r.get('ly_do'))
        can(r.get('cach') == 'bam_toa_do',
            'phải ăn bằng bấm toạ độ, lại lùi tới %r — dấu hiệu toạ độ đo lúc hộp còn trượt'
            % r.get('cach'))
        return 'mo_hop tự chờ %.2fs (quãng trượt 2,0s) · chọn bằng %r' % (cho, r.get('cach'))
    finally:
        c.kill()


@kiem('⑱ control CHỈ nghe pointerdown (không phím, không click) vẫn đặt được giá trị')
def b9(goc, base):
    """Đúng kiểu control của ô `Loại database` trên app thật — đo 18/09:

      · biểu mẫu KHÔNG có `<select>`/input ẩn nào mang giá trị (chỉ có state React);
      · focus trigger rồi Enter mở ra **0 tuỳ chọn**, `activeElement` vẫn là button
        ⇒ component KHÔNG nghe bàn phím;
      · `el.click()` không đổi giá trị ⇒ nó KHÔNG nghe `click`.

    Còn lại đúng một đường: bắn chuỗi PointerEvent thẳng vào phần tử. 11 case rơi vào lớp
    `LỖI` chỉ vì chuỗi lùi thiếu đúng đường này.
    """
    import bo_chon
    import live_ui as ui
    c = mo_chrome(goc, 'b9', base)
    try:
        can(ui.mo_hop(c, '+ Thêm loại nguồn'), 'không mở được biểu mẫu Thêm mới')
        time.sleep(0.4)
        op = ui.mo_o_chon(c, 'Loại kho', 'hop', 'Chọn loại kho')
        can((op or {}).get('option'), 'không mở được ô chọn')
        # `el.click()` một mình PHẢI thất bại — nếu nó ăn thì app giả chưa dựng đúng loại
        # control, và phép kiểm này không chứng minh được gì.
        ui._js(c, """const op=OPTION_HIEN();
          const t=op.find(o=>QN(TXT(o)).includes(QN('MySQL'))); if(t) t.click(); return '1';""")
        time.sleep(0.5)
        sau_click = (ui.tim_o_chon(c, 'Loại kho', 'hop', 'Chọn loại kho') or {}).get('chu') or ''
        can('MySQL' not in sau_click,
            'app giả nhận `el.click()` — chưa dựng đúng control chỉ-nghe-pointerdown')
        r = ui.bam_pointer_js(c, """(()=>{const op=OPTION_HIEN();
          return op.find(o=>QN(TXT(o)).includes(QN('MySQL')))||null;})()""")
        can(r and r.get('ok'), 'không bắn được PointerEvent: %r' % (r,))
        time.sleep(0.6)
        sau = (ui.tim_o_chon(c, 'Loại kho', 'hop', 'Chọn loại kho') or {}).get('chu') or ''
        can('MySQL' in sau, 'bắn PointerEvent rồi mà ô vẫn hiện %r' % sau)
        ui.dong_hop(c)
        return 'el.click() KHÔNG ăn (%r) · PointerEvent ăn (%r)' % (sau_click[:20], sau[:20])
    finally:
        c.kill()


@kiem('⑫ §T — số bản ghi cần dựng bám đúng con số CỦA CASE, không tự nghĩ ra N')
def c5(goc, base):
    """Ngưỡng 1 · 2 · 20 · 21 · 40 bản ghi đều phải ra từ chữ trong cột B/C, không từ tool."""
    import tien_dieu_kien as tdk

    class _Case(object):
        def __init__(self, b='', c='', d=''):
            self.b, self.c, self.d, self.key = b, c, d, 'T'
            self.ten_nhom = self.bp = self.rn = ''
            self.nhom = []

    bang = [
        # (cột B, cột C, cỡ trang, số bản ghi phải dựng, vì sao)
        (_Case('Kiểm tra lật sang trang 2', 'Bấm icon trang tiếp'), 20, 21, 'sàn ps+1'),
        (_Case('Kiểm tra lật sang trang 2', 'Bấm icon trang tiếp'), 5, 6, 'sàn theo cỡ trang 5'),
        (_Case('Kiểm tra phân trang', 'Chuẩn bị đủ 40 bản ghi rồi mở danh sách'), 20, 40,
         'case nêu đúng 40'),
        (_Case('Kiểm tra phân trang', 'Đang ở trang thứ 3'), 20, 41, '3 trang = 2*20+1'),
        (_Case('Kiểm tra căn lề của button', 'Mở màn'), 20, 0, 'case không đòi nhiều trang'),
    ]
    for cs, ps, mong, vi_sao in bang:
        ra = tdk.so_ban_ghi_can(cs, ps)
        can(ra == mong, 'cỡ trang %d, %r -> cần %d, mong %d (%s)'
            % (ps, cs.b[:40], ra, mong, vi_sao))
    # Con số MINH HOẠ nhỏ hơn một trang không được dùng làm tiền điều kiện.
    cs = _Case('Kiểm tra lật sang trang 2', 'Khi có 15 bản ghi thì bấm trang tiếp')
    can(tdk.so_ban_ghi_can(cs, 20) == 21,
        'lấy con số minh hoạ 15 làm tiền điều kiện -> dựng ra màn MỘT trang cho case hỏi về '
        'hai trang')
    return '5 ngưỡng + 1 bẫy số minh hoạ'


@kiem('⑬ §H — dựng xong phải ĐỌC LẠI tổng, không tin "đã tạo N bản ghi" là đã đủ trang')
def c6(goc, base):
    import inspect
    import tien_dieu_kien as tdk
    src = inspect.getsource(tdk.dung_nhieu_trang)
    can('tong_sau' in src and 'tong_sau >= can' in src,
        'không kiểm lại tổng sau khi tạo bù -> báo QA_DATA cho một màn vẫn một trang')
    can('chưa đạt' in src, 'không nói ra khi dựng hụt')
    return 'có đối chiếu tổng đọc lại với số bản ghi case cần'


def main():
    import app_gia_crud as ag
    a = argparse.ArgumentParser()
    a.add_argument('--chi', default='')
    a = a.parse_args()
    srv = ag.chay(0)
    base = 'http://127.0.0.1:%d' % srv.server_address[1]
    goc = tempfile.mkdtemp(prefix='kiem-bo-chon-')
    print('TỰ KIỂM BỘ CHỌN + PHÂN TRANG + VÒNG ĐỜI FIXTURE')
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
            print('   ✔ %-70s %s' % (ten, ghi or ''))
            dat += 1
        except Exception as e:
            print('   ✘ %-70s %s: %s' % (ten, type(e).__name__, str(e)[:300]))
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
