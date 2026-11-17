#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TỰ KIỂM LỚP ĐỌC CỘT C/D  (2026-09-18 lượt 2).

Bộ kiểm của đợt đóng 13 case còn trống. Mọi phép ở đây đo **hàm thuần** — không cần Chrome,
không cần tài khoản — nhưng mỗi phép dựng lại ĐÚNG một case đã nằm `CHƯA ĐO` trên app thật,
và phép nào cũng phải HỎNG trên mã trước khi vá:

  ① giá trị lọc ở cột C bị ngoạm hết phần còn lại của câu   -> r29 · r34 · r39 CHƯA ĐO
  ② mệnh đề cột D nói về Ô KHÁC bị đọc như nói về ô đang đo -> r299 · r453 CHƯA ĐO
  ③ "không khai giới hạn nào" không lọt khuôn "không chặn"  -> r299 · r453 CHƯA ĐO

Vì sao tách thành bộ riêng: ba lỗi trên đều là **đọc sai đề bài**, xảy ra TRƯỚC khi có cú
bấm nào. Một bộ kiểm chạy Chrome không chỉ ra được chúng — nó chỉ thấy "phép đo trả None".

    python3 tools/tu_kiem/kiem_doc_cot_cd.py
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
os.environ.setdefault('QA_PROJECT', 'moetdl')

import cach_ly                                                          # noqa: E402
cach_ly.don_env_trong_tien_trinh()

KQ = []


def kiem(ten):
    def deco(f):
        KQ.append((ten, f))
        return f
    return deco


def can(dk, msg):
    if not dk:
        raise AssertionError(msg)


class Case(object):
    """Bản tối giản của một dòng case — chỉ ba cột mà lớp đọc cần."""

    def __init__(self, b='', c='', d='', nhom=None):
        self.b, self.c, self.d = b, c, d
        self.nhom = nhom or {}
        self.key = 'kiem#1'


class CtxGia(object):
    """`Ctx` giả: chỉ trả lời `vb()` theo hồ sơ màn khai sẵn."""

    def __init__(self, verbatim=None):
        self.verbatim = verbatim or {}

    def vb(self, *duong):
        x = self.verbatim
        for k in duong:
            if not isinstance(x, dict) or k not in x:
                return None
            x = x[k]
        return x


# ── dữ kiện THẬT, chép nguyên văn từ bộ case ViTriLuuTru ─────────────────────
C_THE_SO_LIEU = ('1. Mở màn Vị trí lưu trữ.\n'
                 '2. Lọc "-- Chọn trạng thái --" = %s rồi đọc "Tổng số bản ghi:" ở thanh '
                 'phân trang.')
TUY_CHON_THAT = ['Chờ kết nối', 'Hoạt động', 'Ngừng hoạt động']

D_CHUOI_KET_NOI = ('1. Khác các ô chữ còn lại của biểu mẫu (hệ thống không cho nhập quá 250 '
                   'ký tự), ô này không khai giới hạn nào: nhận trọn 5.000 ký tự, hiện thanh '
                   'cuộn, giao diện không vỡ và không hiện thông báo lỗi độ dài nào, không '
                   'highlight, không focus vào ô.')


@kiem('① giá trị lọc cắt đúng ở từ nối — không ngoạm hết câu (r29·r34·r39)')
def a1():
    import phep_bosung as pb
    ctx = CtxGia({'form_them': {'tuy_chon_trang_thai': TUY_CHON_THAT}})
    for gt in TUY_CHON_THAT:
        c = Case(c=C_THE_SO_LIEU % gt)
        ra = pb._gia_tri_loc_cua_case(ctx, c)
        can(ra is not None, 'không đọc ra bộ lọc nào từ cột C của %r' % gt)
        o, doc = ra
        can(doc == gt, 'cột C nói lọc = %r mà lớp đọc ra %r — đúng cái làm '
                       '`chon_trong_o` trả "không thấy lựa chọn"' % (gt, doc))
        can(doc in TUY_CHON_THAT, 'giá trị %r không có trong danh sách tuỳ chọn thật %r'
            % (doc, TUY_CHON_THAT))
    # chốt chiều ngược: KHÔNG được cắt khi câu vốn không có từ nối
    ra = pb._gia_tri_loc_cua_case(ctx, Case(c='Lọc "-- Chọn trạng thái --" = Ngừng hoạt động'))
    can(ra and ra[1] == 'Ngừng hoạt động', 'cắt quá tay: %r' % (ra,))
    return 'cả 3 giá trị ra đúng tên tuỳ chọn thật, câu không có từ nối vẫn nguyên'


@kiem('② mệnh đề cột D nói về Ô KHÁC không được đọc thành kỳ vọng của ô đang đo (r299·r453)')
def a2():
    import truong_live as T
    kv = T.ky_vong(D_CHUOI_KET_NOI)
    can(kv['chan'] is not True,
        'cột D nói ô NÀY không khai giới hạn, mà lớp đọc chốt chan=True — kỳ vọng ngược hẳn; '
        'mệnh đề "(hệ thống không cho nhập quá 250 ký tự)" là nói về CÁC Ô KHÁC')
    con = T._bo_menh_de_o_khac(D_CHUOI_KET_NOI)
    can('250' not in con, 'chưa cắt được mệnh đề về ô khác: %r' % con[:120])
    can('5.000' in con, 'cắt quá tay, mất luôn phần nói về ô đang đo: %r' % con[:120])
    return 'mệnh đề "(… quá 250 ký tự)" bị loại, phần "nhận trọn 5.000" giữ nguyên'


@kiem('③ "không khai giới hạn nào / nhận trọn N" = không chặn (r299·r453)')
def a3():
    import truong_live as T
    can(T.ky_vong(D_CHUOI_KET_NOI)['khong_chan'] is True,
        'cột D nói rõ ô không khai giới hạn và nhận trọn 5.000 ký tự, mà khong_chan vẫn None '
        '⇒ `truong_do_dai` không thấy ngưỡng nào, không thấy cờ không-chặn, và bỏ cuộc câm')
    for d in ('Ô này không khai giới hạn nào.', 'Ô nhận trọn 5.000 ký tự.',
              'Hệ thống không đặt giới hạn cho ô này.'):
        can(T.ky_vong(d)['khong_chan'] is True, 'bỏ sót khuôn không-chặn: %r' % d)
    return '4 khuôn "không chặn" đọc được, trong đó 3 khuôn mới'


@kiem('④ câu CHẶN thật vẫn phải ra chan=True (chống vá quá tay)')
def a4():
    import truong_live as T
    for d in ('Hệ thống không cho nhập quá 250 ký tự, ô chỉ nhận 250.',
              'Ô bị chặn, không vào được ký tự thứ 251.',
              'Không thể nhập ký tự vượt ngưỡng.'):
        kv = T.ky_vong(d)
        can(kv['chan'] is True, 'câu chặn thật mà đọc ra chan=%r: %r' % (kv['chan'], d))
        can(kv['khong_chan'] is not True,
            'câu chặn thật mà đọc ra khong_chan=True: %r' % d)
    return '3 câu chặn thật vẫn chốt chan=True, không câu nào lật thành không-chặn'


@kiem('⑤ nút CHỈ-CÓ-ICON có đường đo riêng, không rơi về "không có chữ để đo" (r581)')
def a5():
    import inspect
    import phep_bosung as pb
    can(callable(getattr(pb, '_hinh_hoc_icon_dong', None)),
        'chưa có đường đo cho nút chỉ-có-icon trên dòng')
    src = inspect.getsource(pb.p_hinh_hoc_nut)
    can('_hinh_hoc_icon_dong' in src,
        'phép hình học nút không gọi tới đường đo icon ⇒ nút icon vẫn về CHƯA ĐO')
    can(src.count('return None') == 1,
        'còn %d chỗ `return None` câm trong phép hình học nút (chỉ được còn nhánh "không có '
        'tên nút")' % src.count('return None'))
    s2 = inspect.getsource(pb._hinh_hoc_icon_dong)
    can('bo_qua(' in s2, 'đường đo icon vẫn bỏ cuộc câm, không giữ dữ kiện')
    can('tooltip_cua' in s2, 'không đọc chú thích ⇒ không có chữ nào để soi chính tả, mà cột '
                             'D đòi "đúng chính tả"')
    return 'có nhánh icon riêng · giữ dữ kiện khi bỏ cuộc · đọc chú thích để soi chính tả'


@kiem('⑥ phép bấm/Enter liên tục phải điền ĐỦ ô bắt buộc của biểu mẫu Sửa (r471·r472)')
def a6():
    import inspect
    import phep_live as pl
    for f, ten in ((pl.p_click_lien_tuc, 'click_lien_tuc'), (pl.p_tab_enter, 'tab_enter')):
        src = inspect.getsource(f)
        can("dien_o_bat_buoc(form='form_sua'" in src,
            'phép %s mở hộp Sửa rồi bấm luôn — ô bắt buộc còn rỗng thì validate chặn, '
            '0 request ghi, phép bỏ cuộc (đúng số đo của r471/r472)' % ten)
        can('loi_tren_bieu_mau' in src,
            'phép %s bỏ cuộc mà không ghi lại lỗi trên biểu mẫu ⇒ vòng chẩn đoán sau vẫn mù'
            % ten)
    return 'cả hai phép điền đủ ô bắt buộc trước khi bấm, và giữ lại lỗi biểu mẫu khi bỏ cuộc'


@kiem('⑦ nút chỉ-có-icon KHÔNG bị chấm F vì "sai chính tả" (ký tự hình ≠ chữ)')
def a7():
    import phep_live as P
    import phep_bosung as pb
    import qalib
    for ky_tu in ('\u23f9', '\u270e', '\U0001f5d1', '\U0001f441', '', ' ', '\u25be'):
        can(not qalib.co_chu(ky_tu),
            'ký tự hình %r bị coi là CHỮ ⇒ đem đi soi chính tả ⇒ F sai cho một nút không hề '
            'sai chính tả (đúng ca `kiem_phep_moi` bắt được 18/09)' % ky_tu)
    for chu in ('Ngừng hoạt động', 'Xóa', '+ Thêm mới', '20', 'Đóng'):
        can(qalib.co_chu(chu), 'chữ thật %r lại bị coi là không có chữ ⇒ phép đo bỏ cuộc '
                               'trên nút bình thường' % chu)
    import inspect
    # CẢ HAI phép phải hỏi cùng một câu. Lần vá đầu chỉ chữa `can_le_chinh_ta_nut`, và
    # `hinh_hoc_nut` lặp lại y nguyên câu F sai ở lượt chạy sau — nên phép kiểm này soi cả hai.
    s1 = inspect.getsource(P.p_can_le_nut)
    can('co_chu(' in s1 and 'bo_qua(' in s1,
        'phép căn lề nút vẫn chấm thẳng trên nút không có chữ')
    s2 = inspect.getsource(pb.p_hinh_hoc_nut)
    can('co_chu(' in s2,
        'phép hình học nút vẫn dùng `chu_x is None` làm tín hiệu — SAI, vì ký tự hình vẫn có '
        'hộp bao chữ, nên nút chỉ-có-icon lại rơi vào nhánh đối chiếu chính tả')
    can('_CO_CHU' not in s1 and '_CO_CHU' not in s2,
        'luật "có chữ" bị chép tay lại trong phép đo thay vì gọi qalib')
    return 'ký tự hình không bị soi chính tả · chữ thật vẫn đo bình thường · cả 2 phép dùng qalib'


@kiem('⑧ icon là KÝ TỰ HÌNH (không có <svg> con) vẫn đo được căn giữa (r581)')
def a8():
    import inspect
    import phep_bosung as pb
    src = inspect.getsource(pb._hinh_hoc_icon_dong)
    can('chu_lech_trai' in src,
        'phép đo chỉ biết icon là PHẦN TỬ CON (<svg>/<img>/<i>). Nút dùng ký tự hình (⏹) thì '
        '`querySelector` trả null, phép trả "nút không chứa phần tử icon nào" rồi bỏ cuộc — '
        'đúng dữ kiện `the_icon: null` đo được ở lượt 3 (18/09)')
    can('theo_ky_tu' in src, 'không phân biệt hai hình hài icon trong bằng chứng')
    can('lt is None or lp is None' in src,
        'điều kiện bỏ cuộc vẫn đòi số đo CHIỀU DỌC — ký tự hình không có số ấy, nên nút hợp '
        'lệ vẫn bị bỏ cuộc')
    js = inspect.getsource(pb).split('_JS_DO_ICON_DONG')[1][:2000]
    can('chu_lech_trai' in js, 'đoạn JS không trả hộp bao chữ ⇒ không có gì để đo cho ký tự hình')
    return 'đo được cả icon-phần-tử lẫn icon-ký-tự · bằng chứng nói rõ đo trên cái nào'


@kiem('⑨ hai phép chống-thao-tác-trùng phải đòi ĐỦ điều kiện cột D (r471 vs r472)')
def a9():
    import inspect
    import phep_live as P
    for f, ten in ((P.p_click_lien_tuc, 'click_lien_tuc'), (P.p_tab_enter, 'tab_enter')):
        src = inspect.getsource(f)
        can('nut_doi_chu' in src and 'nut_bi_vo_hieu' in src,
            'phép %s không đọc trạng thái nút sau thao tác đầu' % ten)
        i = src.find('so_ghi == 1')
        can(i > 0, 'phép %s không có nhánh "đúng 1 request"' % ten)
        nhanh = src[i:i + 1400]
        can('doi_chu and vo_hieu' in nhanh,
            'phép %s chấm P chỉ vì "1 request ghi" — bỏ qua hai điều còn lại của cột D (nút '
            'đổi chữ · nút bị vô hiệu). Đo 21/09 trên cùng nút "Cập nhật": `click_lien_tuc` '
            'ra F vì nút không đổi chữ, còn `tab_enter` ra P — hai kết luận ngược nhau.' % ten)
    return 'cả hai phép đòi đủ 3 điều: đổi chữ · bị vô hiệu · đúng 1 request'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--chi', help='chỉ chạy phép có tên chứa chuỗi này')
    a = ap.parse_args()
    print('TỰ KIỂM LỚP ĐỌC CỘT C/D')
    dat = hong = 0
    for ten, f in KQ:
        if a.chi and a.chi not in ten:
            continue
        try:
            ghi = f()
            print('   ✔ %-72s %s' % (ten, ghi or ''))
            dat += 1
        except Exception as e:
            print('   ✘ %-72s %s: %s' % (ten, type(e).__name__, str(e)[:320]))
            hong += 1
    print('\n   ĐẠT %d · HỎNG %d' % (dat, hong))
    return 1 if hong else 0


if __name__ == '__main__':
    sys.exit(main())
