# -*- coding: utf-8 -*-
"""Bốn việc sửa NỘI DUNG case theo chỉ thị người đặt việc 2026-09-10.

  ④ *"Bỏ case Tải danh sách mặc định"* — case không kiểm được gì mà `Kiểm tra hiển thị đầy
     đủ …` và `Kiểm tra dữ liệu danh sách khớp DB` chưa kiểm.
  ② *"case Kiểm tra nhập vượt độ dài cho phép, phần kết quả mong muốn chưa đúng"* — đưa cột D
     về khuôn: thông báo lỗi · highlight/focus · hoặc chặn ngay khi nhập.
  ⑰ *"ở kết quả mong muốn chỉ ghi 1. abc 2. cdf — KHÔNG GHI BƯỚC 1, BƯỚC 2"* — cột C đã đánh số
     bước rồi; cột D chỉ đánh số trần, giữ nguyên số để vẫn khớp bước tương ứng.
  ⑤ *"Chỉ kiểm tra các giá trị trong selectbox, phần này đang bị thừa"* — bỏ câu mô tả hai nút
     `Chọn tất cả` / `Bỏ chọn tất cả` khỏi case liệt kê giá trị (đã có case riêng cho hai nút).

Số ký tự tối đa và câu thông báo lấy từ CHÍNH cột C/D đang có (chúng đã được ground lúc sinh),
không đoán lại từ hồ sơ màn — chỗ nào không đọc được thì để CHỖ GIỮ để `[CẦN VERIFY]` lo.

    python3 fix_chi_thi_0910.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_chi_thi_0910.py <role> [tên màn] --apply    # ghi
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import tcfix
import roles

norm = qalib.norm
RX_GIOI_HAN = re.compile(r'giới hạn\s+(\d+)\s+ký tự', re.I)
RX_TRONG_NGOAC = re.compile(r'"([^"]{3,80})"')
CHO_GIU = '<số ký tự tối đa>'


def so_gioi_han(c, d):
    """Số ký tự tối đa đọc từ cột C/D — None nếu không có căn cứ."""
    for t in (c, d):
        m = RX_GIOI_HAN.search(t or '')
        if m:
            return m.group(1)
    return None


def thong_bao_loi(d):
    """Câu thông báo verbatim đang nằm trong cột D (chuỗi trong ngoặc kép) — None nếu không có.

    Ưu tiên chuỗi có chữ *tối đa* / *ký tự*: cột D còn nhắc tên nút (`"Tạo loại nguồn"`) và
    tên ô (`"Tên hiển thị"`) trong ngoặc kép, lấy nhầm là ghi ra một thông báo không tồn tại.
    """
    ung = RX_TRONG_NGOAC.findall(d or '')
    for t in ung:
        n = norm(t)
        if 'toi da' in n or 'ky tu' in n or 'do dai' in n:
            return t
    return None


def viec_vuot_do_dai(tc):
    """[(dòng, cột D mới, ghi chú)] cho case `nhập vượt độ dài cho phép` chưa đúng khuôn."""
    ra = []
    for rn in tc.order:
        if rn < 12 or tc.lvl(rn) != 'case':
            continue
        b = tc.c(rn, 'B') or ''
        if not qalib.la_case_vuot_do_dai(b):
            continue
        c, d = tc.c(rn, 'C') or '', tc.c(rn, 'D') or ''
        if qalib.o_bi_khoa(c, d):
            # Ô mã ở biểu mẫu Chỉnh sửa bị khoá — không gõ được thì không có thông báo lỗi
            # nào để mà đòi. Giữ nguyên cột D đang mô tả đúng hành vi thật.
            continue
        if qalib.dung_khuon_vuot_do_dai(d):
            continue
        so = so_gioi_han(c, d)
        tb = thong_bao_loi(d)
        ghi_chu = None
        if not so:
            so = CHO_GIU
        if not tb:
            # Không có câu thông báo đã ground ⇒ dựng theo khuôn của người đặt việc và để
            # `[CẦN VERIFY]` (chỗ giữ `<…>` kích hoạt `Plan._can_verify`).
            tb = '<tên trường> tối đa %s ký tự' % so
        ra.append((rn, qalib.KHUON_VUOT_DO_DAI % (tb, so), ghi_chu))
    return ra


def viec_bo_nut_phu_tro(tc):
    """[(dòng, cột D mới)] — bỏ dòng mô tả `Chọn tất cả` / `Bỏ chọn tất cả` ở case liệt kê giá trị."""
    ra = []
    for rn in tc.order:
        if rn < 12 or tc.lvl(rn) != 'case':
            continue
        if not qalib.la_case_liet_ke_gia_tri(tc.c(rn, 'B') or ''):
            continue
        d = tc.c(rn, 'D') or ''
        giu = [x for x in d.split('\n')
               if not all(k in norm(x) for k in qalib.NUT_PHU_TRO_KW)]
        moi = '\n'.join(giu).strip()
        if moi and moi != d.strip():
            ra.append((rn, moi))
    return ra


def viec_bo_tien_to_buoc(tc):
    """[(dòng, cột D mới)] — cột D còn viết `Bước N:` thay vì đánh số trần `N.`."""
    ra = []
    for rn in tc.order:
        if rn < 12 or tc.lvl(rn) != 'case':
            continue
        d = tc.c(rn, 'D') or ''
        if qalib.co_tien_to_buoc(d):
            ra.append((rn, qalib.bo_tien_to_buoc(d)))
    return ra


def dong_case_bi_bo(tc):
    """[dòng] của case nằm trong danh sách ĐÃ BỎ (`qalib.CASE_DA_BO`)."""
    ra = []
    for rn in tc.order:
        if rn < 12 or tc.lvl(rn) != 'case':
            continue
        n = norm(tc.c(rn, 'B') or '')
        if any(khoa in n for khoa, _t in qalib.CASE_DA_BO):
            ra.append(rn)
    return ra


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_chi_thi_0910.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    t_bo = t_dd = t_nut = t_buoc = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name
        bo = dong_case_bi_bo(tc)
        dd = viec_vuot_do_dai(tc)
        nut = viec_bo_nut_phu_tro(tc)
        # Case đã bị `dd` viết lại cột D thì KHÔNG xử lý tiếp ở đây: `buoc` tính trên cột D
        # CŨ, hai lần `retext` liên tiếp thì lần sau dán lại đúng bản cũ vừa được thay.
        # (Khuôn `dd` vốn không chứa chữ "Bước" nên bỏ qua là đúng, không phải nhân nhượng.)
        _da_sua = {rn for rn, _d, _g in dd}
        buoc = [x for x in viec_bo_tien_to_buoc(tc) if x[0] not in _da_sua]
        if not (bo or dd or nut or buoc):
            continue
        for rn in bo:
            print('   %-18s [BỎ CASE]  dòng %-4d %s' % (nm[:18], rn, (tc.c(rn, 'B') or '')[:44]))
        for rn, _d, _g in dd:
            print('   %-18s [ĐỘ DÀI]   dòng %-4d %s' % (nm[:18], rn, (tc.c(rn, 'B') or '')[:44]))
        for rn, _d in nut:
            print('   %-18s [BỎ 2 NÚT] dòng %-4d %s' % (nm[:18], rn, (tc.c(rn, 'B') or '')[:44]))
        for rn, _d in buoc:
            print('   %-18s [BỎ "BƯỚC"] dòng %-4d %s' % (nm[:18], rn, (tc.c(rn, 'B') or '')[:43]))
        t_bo += len(bo); t_dd += len(dd); t_nut += len(nut); t_buoc += len(buoc); totf += 1
        if not apply_:
            continue
        qalib.backup(tc.path, tag='truoc_chithi_0910')
        for rn, d, _g in dd:
            tc.retext(rn, None, None, d)
        for rn, d in nut:
            tc.retext(rn, None, None, d)
        for rn, d in buoc:
            tc.retext(rn, None, None, d)
        pl = tcfix.Plan(tc)
        for rn in tc.order:
            if rn >= 12 and rn not in set(bo):
                pl.keep(rn)
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('=== %d file · bỏ %d case · sửa %d case độ dài · gỡ mô tả 2 nút ở %d case '
          '· bỏ tiền tố "Bước" ở %d case%s ==='
          % (totf, t_bo, t_dd, t_nut, t_buoc, '' if apply_ else ' (XEM TRƯỚC)'))
    if (t_bo or t_dd or t_nut or t_buoc) and not apply_:
        print('Ghi thật: python3 fix_chi_thi_0910.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()
