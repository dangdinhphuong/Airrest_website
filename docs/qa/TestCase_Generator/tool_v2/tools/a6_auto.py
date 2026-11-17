# -*- coding: utf-8 -*-
"""BƯỚC A6 TỰ ĐỘNG — bơm dữ kiện đã ground ở hồ sơ màn vào cột C/D (mọi dự án, mọi màn).

Vì sao có script này (2026-09-12): A6 là bước DUY NHẤT đưa nhãn/thông báo/giá trị THẬT của màn
vào cột C/D, nhưng trước bản này nó chỉ tồn tại dưới dạng script viết tay từng màn
(`<Role>/ho-so-man/a6-<Màn>.py`, 856–1515 dòng/màn). Đo trên đường sinh của một dự án TRẮNG
(xoá sạch mọi dữ liệu dự án rồi sinh cho web khác): chuỗi chạy trọn, bộ rà cấu trúc ra 0, mà
cột D còn nguyên chỗ giữ `<số ký tự tối đa>` và thông báo lỗi tự chế — `audit_noi_dung` đo phủ
grounding 59%, 20 case "chữ chay". Nghĩa là bộ case ĐỦ KHUNG nhưng KHÔNG ĐỦ NỘI DUNG.

Script này bơm phần dữ kiện mà khuôn case chỉ có MỘT chỗ đặt (ngưỡng độ dài · câu báo lỗi ·
tên cột · dòng chữ rỗng · bộ giá trị ô chọn · thông báo ATTT · thông báo thành công…). Luật bơm
để ở `qalib.A6_BINDER` — dùng chung, không nằm trong script.

KHÔNG thay thế A6 viết tay: hành vi riêng của màn (ô bị khoá khi sửa · xoá mềm · wizard…) vẫn
phải viết ở `a6-<Màn>.py`. Chuỗi sinh chạy script này TRƯỚC nên A6 tay ghi đè được.

    python3 a6_auto.py <Vai trò> [Tên màn]            # XEM TRƯỚC (mặc định)
    python3 a6_auto.py <Vai trò> [Tên màn] --apply    # ghi
    python3 a6_auto.py <Vai trò> [Tên màn] --chi-tiet # in từng case bị sửa
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import tcfix


def ho_so_cua(path):
    """Hồ sơ màn đặt CẠNH bộ case: `<Role>/ho-so-man/<tên file .xlsx>.json` (HDSD §B)."""
    d = os.path.dirname(os.path.abspath(path))
    p = os.path.join(os.path.dirname(d), 'ho-so-man',
                     os.path.basename(path).replace('.xlsx', '.json'))
    if not os.path.exists(p):
        return None, p
    try:
        return json.load(open(p, encoding='utf-8')), p
    except Exception as e:
        print('  !! hồ sơ màn hỏng (%s): %s' % (os.path.basename(p), e))
        return None, p


def main():
    apply_ = '--apply' in sys.argv
    chi_tiet = '--chi-tiet' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else 'Admin'
    only = args[1] if len(args) > 1 else None

    n_file = n_cd = n_t = 0
    thieu_ho_so = []
    # Gom theo FILE: file hai sheet phải ghi lần lượt rồi NẠP LẠI, nếu không sheet lưu sau xoá
    # sạch thay đổi của sheet lưu trước (bẫy đã ghi ở `a6-BaoCaoDong.py`).
    theo_file = {}
    for sh in qalib.iter_role_files(role, only=only, skip_locked=apply_):
        theo_file.setdefault(sh.path, []).append(sh.bp)

    for path, bps in sorted(theo_file.items()):
        spec, p_spec = ho_so_cua(path)
        base = os.path.basename(path)
        if not spec:
            thieu_ho_so.append((base, p_spec))
            continue
        # Lượt 1 — RÀ KHÔ trên bản nạp lại, không ghi gì.
        cd = t = 0
        dung = set()
        for bp in bps:
            tc = tcfix.load(path, bp=bp) if bp else tcfix.load(path)
            a, b, d, ca = qalib.a6_chay(tc, spec, ghi=False)
            cd += a; t += b; dung |= d
            if chi_tiet and ca:
                print('#### %s%s' % (base, ' [%s]' % bp if bp and len(bps) > 1 else ''))
                for rn, td, phep in ca:
                    print('   r%-4d %-58s %s' % (rn, td, phep.lstrip('_')))
        tong = qalib.a6_khoa_ho_so(spec)
        chua = [k for k in tong if k not in dung]
        print('\n#### %-34s %3d case sửa C/D · %d case gắn cờ · dùng %d/%d khoá hồ sơ'
              % (base.replace('.xlsx', ''), cd, t, len(dung), len(tong)))
        if chua and chi_tiet:
            print('   [KHÔNG GẮN ĐƯỢC] %d khoá — phần này phải viết tay ở a6-<Màn>.py:'
                  % len(chua))
            for k in chua[:40]:
                print('        · %s' % k)
        n_file += 1; n_cd += cd; n_t += t
        if not apply_ or not cd:
            continue
        # Lượt 2 — GHI TỪNG SHEET rồi nạp lại.
        qalib.backup(path, tag='truoc_a6_auto')
        for bp in bps:
            tc = tcfix.load(path, bp=bp) if bp else tcfix.load(path)
            qalib.a6_chay(tc, spec, ghi=True)
            # `retext` chỉ đổi ô trong bộ nhớ; phải `rebuild` mới dựng lại sheet để `save`.
            # Plan khởi tạo RỖNG -> thiếu `keep_range` là XOÁ SẠCH nội dung sheet.
            tc.rebuild(tcfix.Plan(tc).keep_range(12, max(tc.order))).save(quiet=True, sync=False)

    if thieu_ho_so:
        print('\n!! %d file KHÔNG có hồ sơ màn — KHÔNG bơm được nội dung thật (bộ case sẽ là chữ '
              'chung chung):' % len(thieu_ho_so))
        for b, p in thieu_ho_so:
            print('   %-44s cần: %s' % (b[:44], p))
    print('\n=== %s: %d file · %d case sửa cột C/D · %d case gắn cờ ==='
          % (role, n_file, n_cd, n_t))
    if apply_ and n_cd:
        print('⚠️  BẮT BUỘC chạy tiếp: python3 formula_layer.py <các file vừa sửa> '
              '(rebuild đã ghi đè cột A thành chữ chay)')
    elif not apply_:
        print('(XEM TRƯỚC — thêm --apply để ghi;  --chi-tiet để xem từng case + khoá chưa dùng)')


main()
