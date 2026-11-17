# -*- coding: utf-8 -*-
"""Trả HẬU TỐ ĐIỀU KIỆN `"nếu có"` cho những case BẮT BUỘC phải có (chỉ thị 2026-09-10).

Vì sao: tiêu đề nói tới một thao tác / thành phần mà **không phải màn nào cũng có** — 4 case
`vị trí trang sau khi thực hiện 1 thao tác(sửa, xóa, thêm mới,…)` của nhóm `Phân trang`,
`Kiểm tra màu icon xóa` của bộ `Icon` — mà viết trống hậu tố thì case đọc thành lời KHẲNG
ĐỊNH màn có đủ sửa/xoá/thêm mới. Màn chỉ-đọc hoặc màn bỏ hẳn một thao tác (họ
`CategoryCrudPage` + `deleteAsStatus`) sẽ fail một case vốn không áp dụng cho nó.

Bank `quota_cases.PAGING_YCHANG` đã mang sẵn hậu tố từ 2026-09-10 nên bộ case **sinh mới**
không còn lỗi; script này lo bộ **đã sinh trước đó**. Luật dùng chung ở
`qalib.CASE_CAN_HAU_TO` / `them_hau_to_dieu_kien()`; phép rà là `audit_extra` ⑪.

⚠️ Chỉ NỐI hậu tố vào cuối cột B — KHÔNG viết lại wording, KHÔNG đụng C/D, không thêm/xoá case.
Wording RÚT GỌN sai mẫu (`"Kiểm tra màu biểu tượng xoá"`) cố ý KHÔNG khớp luật ở đây: nối hậu tố
vào đó là che mất phát hiện của `audit_extra` ⑥ — chỗ đó phải trả về nguyên văn mẫu.

    python3 fix_hau_to.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_hau_to.py <role> [tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles
import tcfix


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_hau_to.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    tot = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name + ('/' + sh.bp if sh.multi else '')
        sua = []
        for rn in tc.order:
            if rn < 12 or tc.lvl(rn) != 'case':
                continue
            b = tc.c(rn, 'B') or ''
            # Chỉ thị 2026-09-12: hậu tố `nếu có` phải nằm **CẢ TRONG NGOẶC** liệt kê thao
            # tác — `(sửa, xóa, thêm mới,... nếu có)` — chứ không chỉ ở cuối tiêu đề. Lý do
            # cùng lý do đã chốt cho hậu tố ngoài: bản thân DANH SÁCH thao tác trong ngoặc
            # cũng là lời khẳng định màn có đủ sửa/xoá/thêm mới.
            if qalib.HAU_TO_TRONG_NGOAC_CU in b:
                sua.append((rn, b, b.replace(qalib.HAU_TO_TRONG_NGOAC_CU,
                                             qalib.HAU_TO_TRONG_NGOAC_MOI),
                            'hậu tố trong ngoặc'))
                continue
            nhan = qalib.thieu_hau_to_dieu_kien(b)
            if nhan:
                sua.append((rn, b, qalib.them_hau_to_dieu_kien(b), nhan))
        if not sua:
            continue
        tot += len(sua); totf += 1
        print('#### %s' % nm)
        for rn, b, moi, nhan in sua:
            print('   r%-5d [%s] %s' % (rn, nhan, moi[-58:]))
        if not apply_:
            continue
        for rn, _b, moi, _nhan in sua:
            tc.retext(rn, md=moi)
        pl = tcfix.Plan(tc)
        pl.keep_range(12, max(tc.order))
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('\n=== %d file · %d case được trả hậu tố "nếu có"%s ==='
          % (totf, tot, '' if apply_ else '   (XEM TRƯỚC, chưa ghi)'))
    if tot and not apply_:
        print('Ghi thật: python3 fix_hau_to.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()
