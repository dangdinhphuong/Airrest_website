# -*- coding: utf-8 -*-
"""Chuẩn hoá CN XUẤT EXCEL theo chỉ thị người đặt việc 2026-09-10.

Ba việc, đúng nguyên văn chỉ thị:

  ① *"Liệt kê đầy đủ tên các cột của case Kiểm tra đầy đủ thông tin trong file xuất ra"*
  ② *"case Kiểm tra file excel xuất ra cần đầy đủ như ảnh"* — tên file · tiêu đề file · thời
     gian xuất · quy tắc trình bày dữ liệu · quy tắc tiêu đề cột · ghim tiêu đề khi cuộn
  ③ *"bỏ ATTT tại chức năng Xuất excel, bỏ validate tại chức năng Xuất excel"*

①② lấy nội dung từ `quota_cases.export_gdc(spec)` — CÙNG bank với bộ sinh mới, nên file sinh
mới và file vá lại không bao giờ lệch chữ.

③ chỉ xoá khi khối RỖNG hoặc chỉ chứa case ATTT khuôn mẫu: khối Validate của CN xuất mà có
case thật thì script NÓI RA rồi bỏ qua — mất case im lặng là lỗi nặng hơn thừa một khối.

    python3 fix_cn_xuatexcel.py <role> [tên màn]            # XEM TRƯỚC
    python3 fix_cn_xuatexcel.py <role> [tên màn] --apply    # ghi
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
import tcfix
import roles
import quota_cases
import patch_giaodien

norm = qalib.norm


def quet(tc):
    """[(tên CN, {việc})] cho từng CN Xuất excel của sheet.

    Việc gồm: `gdc` [(dòng, khoá bank)] · `bo_validate` [dòng…] · `bo_attt` [dòng…] ·
    `validate_co_case` bool (khối Validate có case thật ⇒ KHÔNG xoá).
    """
    ra = []
    cn = None; grp = sub = None
    v = None

    def het():
        if cn is not None and v is not None and qalib.is_export_cn(cn):
            ra.append((cn, v))

    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn)
        b = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            het(); cn = b; grp = sub = None
            v = {'gdc': [], 'bo_validate': [], 'bo_attt': [], 'validate_co_case': False}
            continue
        if v is None or not qalib.is_export_cn(cn):
            continue
        if lv == 'grp':
            grp = norm(b); sub = None
            if 'an toan thong tin' in grp:
                v['bo_attt'].append(rn)
        elif lv == 'sub':
            sub = norm(b)
            if 'validate cac truong' in sub:
                v['bo_validate'].append(rn)
            elif 'an toan thong tin' in (grp or ''):
                v['bo_attt'].append(rn)
        elif lv == 'sub2':
            if 'validate cac truong' in (sub or ''):
                v['bo_validate'].append(rn); v['validate_co_case'] = True
            elif 'an toan thong tin' in (grp or ''):
                v['bo_attt'].append(rn)
        else:                                   # case
            if 'an toan thong tin' in (grp or ''):
                v['bo_attt'].append(rn)
            elif 'validate cac truong' in (sub or ''):
                v['bo_validate'].append(rn); v['validate_co_case'] = True
            elif 'giao dien chung' in (sub or ''):
                for khoa, tieu_de, _c, _d in quota_cases.EXPORT_GDC:
                    if norm(b) == norm(tieu_de):
                        v['gdc'].append((rn, khoa)); break
    het()
    return ra


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    role = args[0] if args else None
    if role not in roles.ROLES:
        raise SystemExit('Dùng: python3 fix_cn_xuatexcel.py <%s> [tên màn] [--apply]'
                         % '|'.join(roles.ROLES))
    only = args[1] if len(args) > 1 else None
    apply_ = '--apply' in sys.argv

    tot_gdc = tot_bo = totf = 0
    for sh in qalib.iter_role_files(role, only, skip_locked=True):
        tc, nm = sh.tc, sh.name
        spec = patch_giaodien.ho_so_man(tc.path)
        viec = quet(tc)
        if not viec:
            continue
        noi_dung = {k: (c, d) for k, _t, c, d in quota_cases.export_gdc(spec)}
        bo = set()
        n_gdc = 0
        for cn, v in viec:
            for rn, khoa in v['gdc']:
                c, d = noi_dung[khoa]
                if (tc.c(rn, 'C') or '') == c and (tc.c(rn, 'D') or '') == d:
                    continue
                print('   %-18s %-28s ghi lại case dòng %d' % (nm[:18], cn[:28], rn))
                if apply_: tc.retext(rn, None, c, d)
                n_gdc += 1
            if v['validate_co_case']:
                print('   %-18s %-28s !! khối Validate CÓ case thật — KHÔNG xoá, soi tay'
                      % (nm[:18], cn[:28]))
            elif v['bo_validate']:
                print('   %-18s %-28s bỏ khối Validate rỗng (%d dòng)'
                      % (nm[:18], cn[:28], len(v['bo_validate'])))
                bo.update(v['bo_validate'])
            if v['bo_attt']:
                print('   %-18s %-28s bỏ khối An toàn thông tin (%d dòng)'
                      % (nm[:18], cn[:28], len(v['bo_attt'])))
                bo.update(v['bo_attt'])
        if not (n_gdc or bo):
            continue
        tot_gdc += n_gdc; tot_bo += len(bo); totf += 1
        if not apply_:
            continue
        qalib.backup(tc.path, tag='truoc_xuatexcel')
        pl = tcfix.Plan(tc)
        for rn in tc.order:
            if rn >= 12 and rn not in bo:
                pl.keep(rn)
        tc.rebuild(pl).save(quiet=True, sync=len(tc.bpsheets) == 1)

    print('=== %d file · %d case Giao diện chung ghi lại · %d dòng đã bỏ%s ==='
          % (totf, tot_gdc, tot_bo, '' if apply_ else ' (XEM TRƯỚC)'))
    if (tot_gdc or tot_bo) and not apply_:
        print('Ghi thật: python3 fix_cn_xuatexcel.py %s%s --apply'
              % (role, ' ' + only if only else ''))


if __name__ == '__main__':
    main()
