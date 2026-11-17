# -*- coding: utf-8 -*-
"""Đồng bộ chữ BANK đã đổi xuống bộ case ĐÃ SINH (mới 2026-09-14).

Vì sao phải có script riêng: `patch_quota.py` chỉ **bơm case còn THIẾU** so với định mức, nên
sửa chữ trong `quota_cases.py` chỉ có tác dụng với lượt sinh MỚI. Mọi bộ case đã giao giữ
nguyên chữ cũ vĩnh viễn — và nếu chữ cũ vi phạm một phép rà thì bộ rà báo đỏ mà **không lệnh
nào vá được**. Đúng lớp lỗi đã gỡ ở phép ⑳ (bộ rà đòi thứ bộ vá không làm được).
Đo 2026-09-14: chữ bank `PERPAGE` dài 182 ký tự phần thuật (ngưỡng ⑳ là 180) ⇒ **8 case / 6
màn** bị cờ `KQ TAY` mà `fix_kq_validate` ra `0 case`.

Bảng luật nằm ở `qalib.BANK_DOI_CHU` (chữ CŨ nguyên văn → chữ MỚI → lý do), KHÔNG nằm trong
script này — mỗi lần sửa chữ bank thì thêm một dòng vào đó.

⛔ So khớp TUYỆT ĐỐI cả ô. Chữ đã bị bước A6 hoặc người viết sửa khác đi thì KHÔNG khớp và
script bỏ qua — an toàn theo thiết kế, không đoán, không "gần đúng".

⚠️ `rebuild()` ghi đè cột A thành chữ chay ⇒ chạy `formula_layer.py` ngay sau `--apply`.

    python3 fix_bank_doi_chu.py <Role> [Tên màn]            # xem trước
    python3 fix_bank_doi_chu.py <Role> [Tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib                                                     # noqa: E402
import tcfix                                                     # noqa: E402


def quet(tc):
    """-> [(dòng, tiêu đề case, chữ mới, lý do)]."""
    ra = []
    for rn in tc.order:
        if rn < 12 or tc.lvl(rn) != 'case':
            continue
        hit = qalib.bank_doi_chu(tc.c(rn, 'D'))
        if hit:
            ra.append((rn, (tc.c(rn, 'B') or '').split('\n')[0].strip(), hit[0], hit[1]))
    return ra


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    role = args[0] if args else 'Admin'
    only = args[1] if len(args) > 1 else None

    n_file = n_case = 0
    ly_do = {}
    # Gom theo FILE: file nhiều sheet BP phải ghi lần lượt rồi NẠP LẠI, nếu không sheet lưu sau
    # xoá sạch thay đổi của sheet lưu trước (bẫy đã ghi ở `a6-BaoCaoDong.py`).
    theo_file = {}
    for sh in qalib.iter_role_files(role, only=only, skip_locked=apply_):
        theo_file.setdefault(sh.path, []).append(sh.bp)

    for path, bps in sorted(theo_file.items()):
        base = os.path.basename(path)
        viec = {}
        for bp in bps:
            tc = tcfix.load(path, bp=bp) if bp else tcfix.load(path)
            v = quet(tc)
            if v:
                viec[bp] = v
        if not viec:
            continue
        n_file += 1
        for bp, v in viec.items():
            print('#### %s%s' % (base.replace('.xlsx', ''),
                                 ' [%s]' % bp if bp and len(bps) > 1 else ''))
            for rn, td, _moi, why in v:
                print('   r%-4d %s' % (rn, td[:64]))
                ly_do[why] = ly_do.get(why, 0) + 1
                n_case += 1
        if not apply_:
            continue
        qalib.backup(path, tag='truoc_bank_doi_chu')
        for bp in bps:
            if bp not in viec:
                continue
            tc = tcfix.load(path, bp=bp) if bp else tcfix.load(path)
            for rn, _td, moi, _why in quet(tc):
                tc.retext(rn, None, None, moi)
            # `retext` chỉ đổi ô trong bộ nhớ; phải `rebuild` mới dựng lại sheet để `save`.
            # Plan khởi tạo RỖNG -> thiếu `keep_range` là XOÁ SẠCH nội dung sheet.
            tc.rebuild(tcfix.Plan(tc).keep_range(12, max(tc.order))).save(quiet=True, sync=False)

    for why, n in sorted(ly_do.items(), key=lambda x: -x[1]):
        print('\n   [%d case] %s' % (n, why))
    print('\n=== %s: %d file · %d case đồng bộ chữ bank ==='
          % (role, n_file, n_case) + ('' if apply_ else '   (XEM TRƯỚC, chưa ghi)'))
    if apply_ and n_case:
        print('⚠️  BẮT BUỘC chạy tiếp: python3 formula_layer.py <các file vừa sửa>')
    return 0


if __name__ == '__main__':
    sys.exit(main())
