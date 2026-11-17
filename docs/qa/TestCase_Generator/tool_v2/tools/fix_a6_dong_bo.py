# -*- coding: utf-8 -*-
"""Hồi chữ đã chốt ở `.xlsx` NGƯỢC về nguồn `a6-<Màn>.py` — đóng lỗ *"A6 trôi khỏi bộ case"*.

Lỗ (đo 2026-09-14): các đợt rút gọn cột D 09-11 → 09-14 chỉ sửa `.xlsx`, không hồi vào nguồn A6.
Chạy lại A6 trên bộ đang giao làm ⑳ *cột D quá chi tiết* nhảy **0 → 149**, ⑳b **49 → 52**, và 6
phép rà khác rời 0 — tức **tool không tái tạo được chính sản phẩm nó đã giao**. Lỗ này không phép
rà nào thấy, vì mọi bộ rà đều soi `.xlsx` chứ không ai soi NGUỒN.

Bất biến mà script này thi hành:

    chạy `a6-<Màn>.py` trên bộ case đang giao phải đổi **0 ô**.

Đạt bất biến đó thì: sinh lại màn ra đúng bộ đang giao, và các bước rút gọn sau A9 thành không
việc (chúng đã ra 0 trên bộ đang giao).

⚠️ CHỈ hồi khi luật khớp **đúng một** case. Luật `tieu_de=None` khớp cả nhóm: mỗi case một chữ
   khác nhau thì không có literal nào diễn được cả nhóm — script BÁO rồi bỏ qua, không đoán.
⚠️ Bỏ qua luật bị `qalib.a6_chan_ghi` chặn: nó không ghi ô nào, chữ trong ô là của người/bước
   khác — hồi vào là chép nhầm chữ của thiên hạ thành luật A6.
⚠️ Chỉ hồi vế **C/D**. Vế T do `set_t` NỐI (không ghi đè) nên ô T trong file là chữ đã nối của
   nhiều nguồn — hồi ngược là nhân bản chồng chất qua mỗi lượt chạy.

    python3 fix_a6_dong_bo.py <đường/dẫn/a6-Màn.py> [...]            # XEM TRƯỚC
    python3 fix_a6_dong_bo.py <đường/dẫn/a6-Màn.py> [...] --apply    # ghi
"""
import ast
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import a6_src
import qalib
import tcfix
from a6_src import thay


def nap(script):
    """Nạp script A6 mà KHÔNG chạy `main()` -> không gian tên của nó."""
    src = open(script, encoding='utf-8').read().replace('\nmain()', '\n')
    g = {'__name__': 'dong_bo', '__file__': script}
    argv, sys.argv = sys.argv, ['fix_a6_dong_bo']
    try:
        exec(compile(src, script, 'exec'), g)
    finally:
        sys.argv = argv
    return g


def cay_case(tc):
    """-> {dòng: (tên CN, tên nhóm ghép, tiêu đề đầy đủ)} cho mọi dòng case."""
    ra = {}
    cn = sub = sub2 = None
    for rn in tc.order:
        if rn < 12:
            continue
        lv = tc.lvl(rn)
        b_full = (tc.c(rn, 'B') or '').strip()
        b = b_full.split('\n')[0].strip()
        if lv == 'cn':
            cn, sub, sub2 = b, None, None
        elif lv in ('grp', 'sub'):
            sub, sub2 = b, None
        elif lv == 'sub2':
            sub2 = b
        elif lv == 'case':
            ra[rn] = (cn, ' | '.join(x for x in (sub, sub2) if x), b_full)
    return ra


def khop_luat(tc, LUAT, tuy_chon=()):
    """-> {chỉ số luật: [dòng case mà luật đó THỰC SỰ ghi]} — theo đúng ngữ nghĩa của script A6.

    Chép ngữ nghĩa, không chép luật: một case chỉ bị MỘT luật sửa (luật đầu tiên khớp và không
    bị lưới chắn chặn), nên phải duyệt theo CASE rồi tìm luật, không phải ngược lại.
    """
    n = qalib.norm
    ra = {}
    for rn, (cn, nhom, b_full) in sorted(cay_case(tc).items()):
        k_cn, k_nh, k_td = n(cn or ''), n(nhom), n(b_full)
        for idx, (s_, c_, g_, t_, C, D, T) in enumerate(LUAT):
            if s_ is not None and s_ != tc.bpname:
                continue
            if c_ is not None and n(c_) not in k_cn:
                continue
            if g_ is not None and n(g_) not in k_nh:
                continue
            if t_ is not None and n(t_) not in k_td:
                continue
            if qalib.a6_chan_ghi(b_full, C, D, tc.c(rn, 'C'), tc.c(rn, 'D'), cn):
                continue
            ra.setdefault(idx, []).append(rn)
            break
    return ra


def _pham_luat(d):
    """Chữ này có vi phạm luật cột D khối Validate không (⑳ + ㉑ + ㉒)."""
    return bool(qalib.kq_qua_chi_tiet(d) + qalib.kq_co_so_lieu(d) + qalib.kq_co_trich_dan(d))


def viec_r(path, g):
    """Khuôn `r()`/`ro()` -> [(chỉ số luật, vế, chữ cũ, chữ mới, [dòng])] + [lý do bỏ qua]."""
    LUAT = g['LUAT']
    bo = []
    ra = []
    for bp in tcfix.load(g['XLSX']).bpsheets:
        tc = tcfix.load(g['XLSX'], bp)
        dung = khop_luat(tc, LUAT)
        for idx, dong in dung.items():
            _s, _c, _g, _t, C, D, T = LUAT[idx]
            for ten, val in (('C', C), ('D', D)):
                if val is None:
                    continue
                thay_the = {tc.c(rn, ten) for rn in dong}
                if len(thay_the) > 1:
                    bo.append((idx, ten, 'khớp %d case mà chữ trong file khác nhau' % len(dong)))
                    continue
                moi = thay_the.pop()
                if moi is None or moi == val:
                    continue
                # ── TIÊU CHÍ HẸP: chỉ hồi khi chữ NGUỒN VI PHẠM LUẬT mà chữ trong file thì
                #    không. Hồi tất cả là sai: nhiều ô cột D trong file là **bản chữ cố định
                #    của mẫu** do `fix_kq_mau` cố ý ghi đè lên chữ A6 (§7.3) — hồi ngược là
                #    thay dữ kiện đã ground bằng câu chung chung, đúng thứ luật cấm. Ở những ô
                #    đó chuỗi sinh TỰ HỘI TỤ (A6 ghi chữ dài, bước 11a ghi đè lại), nên lệch
                #    là VÔ HẠI. Thứ KHÔNG hội tụ là ô cột D quá chi tiết mà mọi phép cắt cơ
                #    giới đã bó tay — đúng 149 ô làm ⑳ nhảy 0 -> 149 khi chạy lại A6.
                if ten == 'D' and not (_pham_luat(val) and not _pham_luat(moi)):
                    bo.append((idx, ten, 'lệch nhưng chuỗi sinh tự hội tụ (chữ mẫu ghi đè sau)'))
                    continue
                if ten == 'C':
                    bo.append((idx, ten, 'vế C: chưa có phép đo nào nói chữ nguồn sai'))
                    continue
                ra.append((idx, ten, val, moi, dong))
    # ── GỘP theo (luật, vế): file NHIỀU SHEET thì cùng một luật được xét ở từng sheet, nên
    #    cùng một vế có thể vào danh sách 2 lần. Ghi 2 lần trên cùng một vùng mã nguồn là lần
    #    sau dùng toạ độ đã cũ -> cắt giữa ký tự UTF-8 và tệp nguồn nát. Hai sheet cho hai chữ
    #    KHÁC nhau thì không literal nào diễn được cả hai: BÁO rồi bỏ qua, không đoán.
    gop, dup = {}, []
    for idx, ten, val, moi_, dong in ra:
        khoa = (idx, ten)
        if khoa in gop and gop[khoa][3] != moi_:
            dup.append(khoa)
        gop.setdefault(khoa, (idx, ten, val, moi_, dong))
    for khoa in set(dup):
        gop.pop(khoa, None)
        bo.append((khoa[0], khoa[1], 'hai sheet cho hai chữ khác nhau'))
    return list(gop.values()), bo


def span_r(path, can):
    """-> [(span, chữ mới)] cho khuôn `r()`: dò lại node theo chỉ số luật + vế."""
    src = open(path, encoding='utf-8').read()
    cay = ast.parse(src, path)
    goi = [nd for nd in ast.walk(cay)
           if isinstance(nd, ast.Call) and isinstance(nd.func, ast.Name)
           and nd.func.id in ('r', 'ro')]
    goi.sort(key=lambda nd: (nd.lineno, nd.col_offset))
    ra = []
    for idx, ten, cu, moi, dong in can:
        if idx >= len(goi):
            continue
        nd = dict(a6_src.o_cd(goi[idx])).get(ten)
        if not (isinstance(nd, ast.Constant) and isinstance(nd.value, str)):
            continue
        if nd.value != cu:            # lưới chắn: node dò ra phải ĐÚNG là chữ cũ
            continue
        ra.append(((nd.lineno, nd.col_offset, nd.end_lineno, nd.end_col_offset), moi))
    return src, ra


def main():
    paths = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    if not paths:
        raise SystemExit(__doc__)
    tong = tong_bo = 0
    for p in paths:
        g = nap(os.path.abspath(p))
        if 'LUAT' not in g:
            print('#### %s  — khuôn bảng `SUA`, chưa hỗ trợ hồi ngược (xem §CÒN NỢ)'
                  % os.path.basename(p))
            continue
        can, bo = viec_r(os.path.abspath(p), g)
        if not can and not bo:
            continue
        print('#### %s  (%d vế lệch · %d vế bỏ qua)' % (os.path.basename(p), len(can), len(bo)))
        for idx, ten, cu, moi, dong in can[:6]:
            print('   L%-4d vế %s  r%s' % (idx, ten, ','.join(str(x) for x in dong[:3])))
            print('        nguồn: %s' % cu.replace('\n', ' ⏎ ')[:96])
            print('        file : %s' % moi.replace('\n', ' ⏎ ')[:96])
        if len(can) > 6:
            print('   … còn %d vế nữa' % (len(can) - 6))
        for idx, ten, ly_do in bo[:4]:
            print('   L%-4d vế %s  BỎ QUA: %s' % (idx, ten, ly_do))
        tong += len(can)
        tong_bo += len(bo)
        if not apply_:
            continue
        src, spans = span_r(os.path.abspath(p), can)
        for span, moi in sorted(spans, key=lambda x: (x[0][0], x[0][1]), reverse=True):
            src = thay(src, span, moi)
        try:
            ast.parse(src, p)
        except SyntaxError as e:
            raise SystemExit('DỪNG — bản hồi làm %s hỏng cú pháp (dòng %s): %s  [KHÔNG ghi gì]'
                             % (os.path.basename(p), e.lineno, e.msg))
        qalib.backup(p)
        open(p, 'w', encoding='utf-8').write(src)
        print('   ĐÃ GHI %d/%d vế -> %s' % (len(spans), len(can), p))
    print('\n=== %d vế cần hồi · %d vế bỏ qua (phải soi tay)%s ==='
          % (tong, tong_bo, '' if apply_ else '   (XEM TRƯỚC, chưa ghi)'))


if __name__ == '__main__':
    main()
