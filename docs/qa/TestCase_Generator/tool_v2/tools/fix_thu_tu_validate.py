# -*- coding: utf-8 -*-
"""Sắp lại THỨ TỰ các nhóm control trong khối `Validate các trường thông tin` theo BỐ CỤC MÀN
— Trái→Phải, Trên→Dưới.

Chỉ thị người đặt việc 2026-09-10 (nối tiếp chỉ thị cùng ngày về case `Kiểm tra hiển thị đầy đủ
các thông tin trong màn hình chức năng`): *"Các mục validate cũng phải theo thứ tự từ Trái→Phải,
Trên→Dưới"*. `patch_giaodien.py` mới chỉ sửa **chữ** ở cột C/D của case liệt kê; bản thân khối
`Validate` vẫn xếp theo mạch viết case, nên người chạy test rà theo cây bên trái vẫn nhảy cóc.

Thứ tự chuẩn = `cn[].controls` của hồ sơ màn (`qalib.sap_theo_bo_cuc` — DÙNG CHUNG với
`patch_giaodien.py` và phép ⑫ của `audit_extra.py`, để ba chỗ không bao giờ lệch luật nhau).
Nhóm không khớp tên nào trong hồ sơ (vd `Validate ràng buộc giữa các trường` — nhóm CASE chứ
không phải control trên màn) giữ nguyên thứ tự tương đối và dồn xuống cuối khối.

Script chỉ HOÁN VỊ các dải dòng đã có, không thêm/bớt/sửa một ô nào. `rebuild()` lo phần đánh
lại số dòng · `outlineLevel` · mã case cột A · vùng gộp ô.

    python3 fix_thu_tu_validate.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_thu_tu_validate.py <role> [tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import tcfix
import roles
import patch_giaodien

norm = qalib.norm


def khoi_validate(tc):
    """[(tên CN, [(tên nhóm, [dòng…])])] — mỗi CN một khối `Giao diện > Validate các trường`.

    Dải dòng của một nhóm chạy từ dòng `sub2` của nó tới ngay trước dòng tiêu đề kế tiếp cùng
    cấp hoặc cao hơn (`sub2`/`sub`/`grp`/`cn`) — tức gồm cả các case con của nhóm.
    """
    ra = []
    cn = None; grp = sub = None
    nhom = []          # [(tên, [dòng…])] của CN đang xét
    trong_kv = False

    def het_cn():
        if cn is not None and nhom:
            ra.append((cn, list(nhom)))

    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            het_cn(); cn = b; grp = sub = None; nhom = []; trong_kv = False
        elif lv == 'grp':
            grp = norm(b); sub = None; trong_kv = False
        elif lv == 'sub':
            sub = norm(b)
            trong_kv = bool(grp and 'giao dien' in grp and 'validate cac truong' in sub)
        elif lv == 'sub2':
            if trong_kv:
                nhom.append((b, [rn]))
            # `sub2` ngoài khối Validate không mở nhóm nào — và cũng không đóng khối,
            # vì khối đã bị đóng ở dòng `sub`/`grp` gần nhất.
        else:                                   # dòng case
            if trong_kv and nhom:
                nhom[-1][1].append(rn)
    het_cn()
    return ra


def viec_cua_file(tc, spec):
    """[(tên CN, [tên nhóm cũ], [tên nhóm mới], {tên nhóm: [dòng…]})] — chỉ CN cần đổi."""
    out = []
    for cn, nhom in khoi_validate(tc):
        cu = [t for t, _ in nhom]
        moi = qalib.sap_theo_bo_cuc(cu, spec, cn)
        if [norm(x) for x in moi] == [norm(x) for x in cu]:
            continue
        out.append((cn, cu, moi, nhom))
    return out


def sap(tc, viec):
    """Dựng `Plan` giữ MỌI dòng ≥12, chỉ hoán vị các dải dòng của nhóm cần đổi."""
    doi = {}                       # dòng đầu nhóm -> [dòng…] của nhóm sẽ đứng vào chỗ đó
    bo_qua = set()                 # dòng thuộc nhóm được dời (đã phát ở chỗ khác)
    for _cn, cu, moi, nhom in viec:
        dai = {t: rows for t, rows in nhom}
        vi_tri = [rows[0] for _t, rows in nhom]          # các mốc theo THỨ TỰ CŨ trong file
        for moc, ten in zip(vi_tri, moi):
            doi[moc] = dai[ten]
            bo_qua.update(dai[ten])

    pl = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12: continue
        if rn in doi:
            pl.keep(*doi[rn])
        elif rn not in bo_qua:
            pl.keep(rn)
    return pl


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_thu_tu_validate.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    tot = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name
        spec = patch_giaodien.ho_so_man(tc.path)
        if not spec:
            print('   %-18s -- không có hồ sơ màn, bỏ qua (không có căn cứ thứ tự)' % nm[:18])
            continue
        viec = viec_cua_file(tc, spec)
        if not viec:
            continue
        for cn, cu, moi, _nhom in viec:
            print('   %-18s %s' % (nm[:18], cn[:44]))
            print('      cũ : %s' % ' | '.join(cu))
            print('      mới: %s' % ' | '.join(moi))
        tot += len(viec); totf += 1
        if not apply_:
            continue
        qalib.backup(tc.path, tag='truoc_sap_validate')
        pl = sap(tc, viec)
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('=== %d file · %d CN đã sắp lại khối Validate%s ==='
          % (totf, tot, '' if apply_ else ' (XEM TRƯỚC)'))
    if tot and not apply_:
        print('Ghi thật: python3 fix_thu_tu_validate.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()
