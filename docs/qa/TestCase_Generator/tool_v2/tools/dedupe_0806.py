# -*- coding: utf-8 -*-
"""Dọn case TRÙNG TÊN trong cùng nhóm — mục ⑥ nghiệm thu §7 (DINH-MUC-VALIDATE-testcase.md).

Ba nhánh xử lý:
  1. Bước thực hiện GIỐNG HỆT           -> xoá bản sau (trùng lặp thật, do bơm 2 lượt).
  2. "Kiểm tra quyền truy cập màn"       -> xoá bản sau (chỉ khác cách diễn đạt, cùng một phép thử).
  3. Khác thao tác (thường là ATTT
     "Thao tác khi hết phiên")           -> GIỮ cả hai, đổi tiêu đề bản sau theo đúng thao tác
                                            ghi ở bước 2 để phân biệt.

    python3 dedupe_0806.py                       # xem trước, role Admin
    python3 dedupe_0806.py --apply               # ghi
    python3 dedupe_0806.py NCC BienSoanChuDe     # <ROLE> <tên file>
    python3 dedupe_0806.py --skip DonGia,GoiSTEM # đổi danh sách bỏ qua

Mặc định bỏ qua `DonGia` + `GoiSTEM` như đợt 2026-08-06 (hai file đó xử lý riêng).
Logic nằm ở `qalib.scan_dup_titles()` / `qalib.dedupe_titles()` để script khác gọi lại được.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402
import roles          # noqa: E402

SKIP_MAC_DINH = ('DonGia', 'GoiSTEM')


def main(argv):
    apply = '--apply' in argv
    skip = SKIP_MAC_DINH
    if '--skip' in argv:
        skip = tuple(s.strip() for s in argv[argv.index('--skip') + 1].split(',') if s.strip())
    args = [a for a in argv[1:] if not a.startswith('--')]
    args = [a for a in args if ','.join(skip) != a]
    role = 'Admin'
    if args and args[0] in roles.ROLES:
        role, args = args[0], args[1:]
    only = args[0] if args else None

    dele, ren, nsheet = qalib.dedupe_titles(role, only=only, skip=skip, apply=apply)
    print('=== %s: xoá %d case · đổi tên %d case (%d sheet) ==='
          % (role, dele, ren, nsheet) + ('' if apply else '  (DRY-RUN)'))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
