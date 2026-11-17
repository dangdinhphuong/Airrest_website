#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sửa BƯỚC 1 ở dòng CN: ghi ĐÚNG vai trò của bộ case.

Chỉ thị người đặt việc 2026-09-12: *"khi chọn role nào thì ghi đúng role đó không tràn lan"*.
Sinh cho `ChuyenVien` mà bước 1 ghi `Quản trị viên/ Chuyên viên/ Lãnh đạo Bộ/ Đơn vị nguồn/
Sở GD&ĐT/ Trường học` (hoặc ghi nhầm `Quản trị viên`) thì người test không biết đăng nhập bằng
tài khoản nào.

Nguồn gốc lỗi: `new_from_base.cn_text()` lấy `role_xem` cho CN chỉ-đọc và `role_ghi` cho CN có
ghi — cả hai đều là hằng của DỰ ÁN, không liên quan tới vai trò đang sinh. Đã vá tại gốc
(`vai_tro_buoc1()` + `ten_vai_tro` trong hồ sơ dự án); lệnh này vá các bộ case đã sinh trước đó.

CHỈ đụng phần chữ SAU `Đăng nhập tài khoản` của dòng CN, ở cột B. Không đổi tên CN, không đổi
bước 2/3, không đụng cột C/D.

    python3 fix_vai_tro_buoc1.py ChuyenVien              # xem trước
    python3 fix_vai_tro_buoc1.py ChuyenVien ViTriLuuTru --apply
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib    # noqa: E402
import roles    # noqa: E402
import tcfix    # noqa: E402

MOC = 'Đăng nhập tài khoản'


def sua_khoi(b, vai_tro):
    """-> (cột B mới, chữ cũ) hoặc (None, None) nếu không có gì phải sửa."""
    dong = b.split('\n')
    for i, x in enumerate(dong):
        if MOC not in x:
            continue
        dau, _, sau = x.partition(MOC)
        cu = sau.strip()
        # giữ nguyên dấu chấm câu cuối nếu có
        duoi = '.' if cu.endswith('.') else ''
        if qalib.norm(cu.rstrip('.')) == qalib.norm(vai_tro):
            return None, None
        dong[i] = '%s%s %s%s' % (dau, MOC, vai_tro, duoi)
        return '\n'.join(dong), cu
    return None, None


def main(argv):
    role = argv[1] if len(argv) > 1 else None
    only = argv[2] if len(argv) > 2 and not argv[2].startswith('--') else None
    apply_ = '--apply' in argv
    if not role:
        raise SystemExit(__doc__)
    vai_tro = (roles.ROLES.get(role) or {}).get('ten_vai_tro')
    if not vai_tro:
        raise SystemExit(
            'DỪNG — vai trò "%s" chưa khai "ten_vai_tro" trong hồ sơ dự án (%s).\n'
            '   Khai nguyên văn tên tài khoản rồi chạy lại; KHÔNG tự đặt tên ở đây.'
            % (role, roles.PROJECT.get('name')))

    tot_file = tot_cn = 0
    broken = []
    # Gom theo FILE trước, nhưng XỬ LÝ TỪNG SHEET MỘT rồi lưu ngay và NẠP LẠI.
    # `TC.save()` dựng file mới từ `self.z` — bản zip mở lúc LOAD — nên giữ 2 TC của 2 sheet
    # BP rồi lưu lần lượt là sheet lưu sau ghi đè mất thay đổi của sheet lưu trước.
    # Đo 2026-09-12 trên `BaoCaoDong` (2 sheet): báo "20 dòng đã sửa" mà bộ rà vẫn còn 12.
    theo_file = {}
    for sh in qalib.iter_role_files(role, only=only, broken=broken):
        theo_file.setdefault(sh.tc.path, []).append(sh.bp)

    for path, bps in sorted(theo_file.items()):
        base = os.path.basename(path)
        if os.path.exists(os.path.join(os.path.dirname(path), '.~lock.%s#' % base)):
            print('  BỎ QUA (đang mở):', base)
            continue
        n_file = 0
        da_lui = False
        for bp in bps:
            tc = tcfix.load(path, bp)
            n_sheet = 0
            for rn in tc.order:
                if rn < 12 or tc.lvl(rn) != 'cn':
                    continue
                b = tc.c(rn, 'B') or ''
                moi, cu = sua_khoi(b, vai_tro)
                if moi is None:
                    continue
                n_sheet += 1
                print('   %-26s r%-4d %s' % (base.replace('.xlsx', '')[-26:], rn,
                                             b.split('\n')[0][:34]))
                print('        %s  ->  %s' % (cu[:62], vai_tro))
                if apply_:
                    tc.retext(rn, md=moi)
            if not n_sheet:
                continue
            n_file += n_sheet
            if apply_:
                if not da_lui:
                    qalib.backup(path, tag='truoc-vai-tro-buoc1')
                    da_lui = True
                # `retext` chỉ đổi ô trong bộ nhớ; phải `rebuild` mới dựng lại sheet để `save`.
                # Plan khởi tạo RỖNG -> quên `keep_range` là XOÁ SẠCH nội dung file.
                tc.rebuild(tcfix.Plan(tc).keep_range(12, max(tc.order)))
                tc.save(quiet=True, sync=len(bps) == 1)
        if n_file:
            tot_file += 1
            tot_cn += n_file

    print('\n=== %s: %d file · %d dòng CN sửa bước 1 -> "%s" ==='
          % (role, tot_file, tot_cn, vai_tro))
    if not apply_ and tot_cn:
        print('(XEM TRƯỚC — thêm --apply để ghi)')
    if apply_ and tot_cn:
        print('⚠️  BẮT BUỘC chạy tiếp: python3 formula_layer.py <các file vừa sửa> '
              '(rebuild đã ghi đè cột A thành chữ chay)')
    if broken:
        print('!!! %d file KHÔNG đọc được:' % len(broken))
        for b, why in broken:
            print('    -', b, why)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
