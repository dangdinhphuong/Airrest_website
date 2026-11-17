# -*- coding: utf-8 -*-
"""Bơm case cho MỌI nhóm control còn dưới ĐỊNH MỨC (../luat/DINH-MUC-VALIDATE-testcase.md §3).

THAY THẾ `complete_quota.py` — script cũ dùng bảng ALIAS khớp quá rộng nên coi mọi mục là
"đã có" và bơm +0 dù còn 61 nhóm thiếu. Bộ này so theo TIÊU ĐỀ case trong chính nhóm đó,
và có VÒNG 2 bơm bù cho trường hợp một case gộp nhiều mục ("Kiểm tra sắp xếp / căn lề / quá dài"
đếm là 1 nhưng chuẩn đòi 3 case riêng).

    python3 patch_quota.py Admin DonGia            # XEM TRƯỚC (mặc định, không ghi)
    python3 patch_quota.py Admin DonGia --apply    # ghi thật
    python3 patch_quota.py NCC                     # cả role, xem trước

⛔ **ĐẢO MẶC ĐỊNH 2026-09-08 — mặc định là XEM TRƯỚC, phải `--apply` mới ghi.**
Trước đó script GHI THẲNG và `--dry` mới là xem — ngược với `repair_cells.py` (đã đảo 04/09) và
6 script `patch_*` khác. Hậu quả đã xảy ra: một lệnh tưởng là xem trước đã **ghi vào 41 file của
bộ case thật** (+709 Admin · +411 NCC) và `rebuild()` xoá sạch lớp công thức cột A trên cả 41 file.
`--dry` vẫn nhận để lệnh cũ không gãy, nhưng nay là thừa.

Logic nằm ở `qalib.plan_quota_fill()` / `qalib.patch_quota()` để script khác gọi lại được.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib          # noqa: E402
import roles          # noqa: E402


def parse(argv):
    """(role, only, dry). Nhận cả `<ROLE> <FILE>` lẫn `<FILE>` (role mặc định Admin).

    Trước đây chỉ nhận `<FILE>`, nên lệnh `patch_quota.py Admin DonGia` mà §9 của
    `PROMPT-gen-testcase-v3.md` dạy bị hiểu thành lọc tên file = "Admin" ⇒ chạy 0 file, im lặng.
    """
    args = [a for a in argv[1:] if not a.startswith('--')]
    role = 'Admin'
    if '--role' in argv:
        role = argv[argv.index('--role') + 1]
        args = [a for a in args if a != role]
    elif args and args[0] in roles.ROLES:          # dạng <ROLE> <FILE>
        role, args = args[0], args[1:]
    # MẶC ĐỊNH KHÔNG GHI. `--dry` giữ lại cho tương thích ngược nhưng không còn cần thiết.
    return role, (args[0] if args else None), not ('--apply' in argv)


def main(argv):
    role, only, dry = parse(argv)
    tot, nsheet, bo_qua = qalib.patch_quota(role, only=only, apply=not dry)
    print('=== %s: +%d case ở %d sheet · %d nhóm BỎ QUA ===%s'
          % (role, tot, nsheet, len(bo_qua),
             '   (XEM TRƯỚC — thêm --apply để ghi)' if dry else ''))
    # Trước 2026-09-10 hai `continue` của `plan_quota_fill` im lặng, nên nhóm không có luật /
    # không có bank chỉ hiện ra dưới dạng `+0 case` — không phân biệt được với "đã đủ định mức".
    if bo_qua:
        print('    ⇒ %d nhóm trên sẽ nằm RỖNG. Chốt bằng `audit_validate_quota.py` (ô thứ 7'
              ' "Nhóm không rõ loại"), đừng coi `+0 case` là đã đủ.' % len(bo_qua))
    if not dry and tot:
        print('⚠️  Đã GHI. Chạy tiếp `formula_layer.py` trên các file vừa sửa —')
        print('    `rebuild()` ghi đè cột A thành chữ chay, không áp lại là mất lớp công thức 1.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
