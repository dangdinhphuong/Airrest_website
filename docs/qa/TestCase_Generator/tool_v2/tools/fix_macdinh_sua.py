# -*- coding: utf-8 -*-
"""Sửa case "giá trị mặc định" ở CN SỬA đang ghi Ô RỖNG -> dữ liệu ĐANG LƯU (mẫu CN Chỉnh sửa).

Cùng một tiêu đề "Kiểm tra giá trị mặc định" mang hai nghĩa trái ngược: ở CN Thêm mới là ô rỗng,
ở CN Sửa là **nạp sẵn giá trị hiện tại của bản ghi**. §5.6 đã bỏ hẳn nhóm `Nạp sẵn dữ liệu` với
lý do "nội dung đã nằm trong case giá trị mặc định" — nhưng `patch_quota.py` bơm nhóm control ở
CN Sửa bằng đúng bộ chữ của CN Thêm, còn `patch_sua_validate.py` (nơi có sẵn chữ đúng) chỉ sửa
được nhóm nó CLONE. Kết quả: ngữ nghĩa nạp sẵn MẤT HẲN mà không phép rà nào thấy.
Đo 2026-09-08: Admin **13** case · `QuanTri/ChucVu` **4** · NCC 0 (bộ NCC diễn đạt đúng sẵn).

Chỉ đổi CHỮ ở cột C/D, không chèn/xoá dòng. NHƯNG vẫn phải đi qua `tc.rebuild()` để `save()`
dựng lại sheet, mà `rebuild()` **ghi đè cột A thành chữ chay** `prefix_N` -> mất lớp công thức 1.
⇒ **BẮT BUỘC chạy `formula_layer.py <file>` ngay sau khi `--apply`** (script tự nhắc).
Rà bằng `audit_sua.py` (phép [7]).

    python3 fix_macdinh_sua.py <Role> [Tên màn]            # xem trước
    python3 fix_macdinh_sua.py <Role> [Tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import roles


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    # `--mo-ho` (2026-09-08): sửa LUÔN tầng 2 `[MẶC ĐỊNH?]` mà `audit_sua` báo — case không nói
    # "ô rỗng" nhưng cũng không nói "giá trị đang lưu" (vd *"Ô hiện đúng trạng thái mặc định theo
    # nghiệp vụ"*, sinh ra bởi bank `CHECKBOX`). Trước đây tầng 2 KHÔNG có script nào vá nên
    # `audit_sua` mãi báo `+N mơ hồ`. Để tuỳ chọn vì tầng 2 có thể nhiễu (đo trên bộ thật: 1 ca).
    mo_ho = '--mo-ho' in sys.argv
    role = args[0] if args else 'Admin'
    only = args[1] if len(args) > 1 else None
    roles.get(role)

    tot_f = tot_c = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=apply_):
        tc = sh.tc
        cn = None
        sua = []
        for rn in tc.order:
            if rn < 12:
                continue
            lv = tc.lvl(rn)
            b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'cn':
                cn = b
            elif lv == 'case' and cn and qalib.la_case_mac_dinh(b):
                d = tc.c(rn, 'D') or ''
                if qalib.mac_dinh_sai_o_cn_sua(cn, d):
                    sua.append((rn, cn, d.split('\n')[0]))
                elif mo_ho and qalib.mac_dinh_mo_ho_o_cn_sua(cn, d):
                    sua.append((rn, cn, d.split('\n')[0]))
        if not sua:
            continue
        tot_f += 1
        tot_c += len(sua)
        print('#### %s' % sh.name)
        for rn, cn_, cu in sua:
            print('   r%-5d %-34s "%s"  ->  "%s"' % (rn, cn_[:34], cu[:34], qalib.MAC_DINH_KQ_SUA))
        if apply_:
            for rn, _cn, _cu in sua:
                tc.retext(rn, buoc=qalib.MAC_DINH_BUOC_SUA, kq=qalib.MAC_DINH_KQ_SUA)
            # `retext()` chỉ đổi `rows[rn]['body']`; phải qua `rebuild()` mới dựng lại sheet cho
            # `save()` (thiếu bước này: AttributeError 'TC' object has no attribute '_new_sheet').
            # Plan giữ NGUYÊN mọi dòng nên không chèn/xoá — nhưng `rebuild()` vẫn ghi lại cột A
            # thành chữ chay, nên sau đó PHẢI áp lại `formula_layer.py`.
            import tcfix
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn >= 12:
                    pl.keep(rn)
            tc.rebuild(pl).save(quiet=True, sync=not sh.multi)

    print('\n=== %s: %d file · %d case %s ===' % (role, tot_f, tot_c,
                                                  '' if apply_ else '(xem trước, chưa ghi)'))
    if apply_ and tot_f:
        print('⚠️  BẮT BUỘC chạy tiếp: python3 formula_layer.py <các file vừa sửa>')
        print('    `rebuild()` đã ghi đè cột A thành chữ chay — không áp lại là mất lớp công thức 1.')


if __name__ == '__main__':
    main()
