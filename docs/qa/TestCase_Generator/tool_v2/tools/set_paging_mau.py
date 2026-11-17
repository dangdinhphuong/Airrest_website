# -*- coding: utf-8 -*-
"""Đặt nhóm **Phân trang** = ĐÚNG 14 case Y CHANG MẪU (r50–r63), verbatim cả 3 cột.

Chỉ thị người đặt việc 2026-09-04: *"tạm thời làm y chang như này"*. Khác các script trước
(chỉ BƠM mục thiếu), script này **THAY TOÀN BỘ** case của nhóm:
  · bỏ mọi case riêng của dự án trong nhóm (biên vô hiệu · ngoài biên · > 100 mục ·
    1 trang · nhiều trang · giữ trang khi thao tác · chặn mở trang ngoài phạm vi …);
  · chèn đúng 14 case mẫu, giữ nguyên thứ tự và chữ của mẫu — kể cả 4 case *vị trí trang*
    DÙNG CHUNG một tiêu đề (chỉ khác cột C/D) và cột D case Style ghi *"Hiển thị như hình"*.

⚠️ Đây là script GHI ĐÈ nội dung: case cũ trong nhóm Phân trang **bị xoá**. Backup trước khi chạy.
Nội dung: `quota_cases.PAGING_YCHANG`.

    python3 set_paging_mau.py --role Admin          # xem trước
    python3 set_paging_mau.py --role Admin --apply  # ghi
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

APPLY = '--apply' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
CFG = roles.get(ROLE)

tot_grp = tot_del = tot_add = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']: continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base); continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    try: bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e)); continue

    touched = False
    for bp in bps:
        tc = tcfix.load(p, bp)
        # gom: dòng nhóm Phân trang -> [dòng case thuộc nhóm]
        groups = []; cur = None; rows = []
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'case':
                if cur is not None: rows.append(rn)
                continue
            if cur is not None: groups.append((cur, rows)); cur, rows = None, []
            if lv in ('sub', 'sub2') and norm(t).startswith('phan trang'):
                cur, rows = rn, []
        if cur is not None: groups.append((cur, rows))
        if not groups: continue

        drop = set(); anchor = {}
        for grp_rn, case_rows in groups:
            drop |= set(case_rows)
            anchor[grp_rn] = len(case_rows)
            tot_grp += 1; tot_del += len(case_rows); tot_add += len(quota_cases.PAGING_YCHANG)
            print('   %-20s nhóm r%-5d %2d case → 14 case mẫu' % (nm[:20], grp_rn, len(case_rows)))
        touched = True
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12 or rn in drop: continue
                pl.keep(rn)
                if rn in anchor:
                    for _k, b, c, d in quota_cases.PAGING_YCHANG: pl.case(b, c, d)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if touched: tot_file += 1

print('\n=== %s: %d file · %d nhóm · bỏ %d case · thêm %d case (chênh %+d) ===%s'
      % (ROLE, tot_file, tot_grp, tot_del, tot_add, tot_add - tot_del,
         '' if APPLY else '   (xem trước, chưa ghi)'))
