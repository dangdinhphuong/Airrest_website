# -*- coding: utf-8 -*-
"""Đặt nhóm **Danh sách** (dạng BẢNG) = ĐÚNG 8 case Y CHANG MẪU (r23–r30), verbatim cả 3 cột.

Chỉ thị người đặt việc 2026-09-04: *"validate danh sách chỉ cần 8 case giống với mẫu"*.

⚠️ **CHỈ áp cho danh sách dạng BẢNG.** Danh sách dạng **THẺ/LƯỚI** được **GIỮ NGUYÊN** —
3 trong 8 case của mẫu nói về CỘT (*tiêu đề cột khớp label* · *dữ liệu đúng cột* · *độ rộng cột*),
màn thẻ không có cột nên bơm vào sẽ sinh case vô nghĩa (luật §0.4.4). Nhận diện thẻ qua tên nhóm:
*thẻ · card · lưới thẻ · dạng thẻ · (grid)*.

Đây là script GHI ĐÈ: case cũ trong nhóm bị xoá. Backup trước khi chạy.
Nội dung: `quota_cases.DANHSACH_YCHANG`.

    python3 set_danhsach_mau.py --role Admin          # xem trước
    python3 set_danhsach_mau.py --role Admin --apply  # ghi
    thêm --include-the  để áp cả nhóm dạng thẻ (KHÔNG khuyến nghị)
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

# tên nhóm cho biết danh sách dạng THẺ / LƯỚI (không có cột)
CARD_KW = ['the ', 'thes', 'card', 'luoi the', 'dang the', 'grid', '(the)', 'the:']

def is_card(gname):
    n = norm(gname)
    return any(k in n for k in CARD_KW)

APPLY = '--apply' in sys.argv
INC_CARD = '--include-the' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
CFG = roles.get(ROLE)

tot_grp = tot_skip = tot_del = tot_add = tot_file = 0
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
        # gom nhóm `Danh sách` NẰM TRONG khối Validate
        groups = []; cur = None; rows = []; blk = None; inval = False
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip(); n = norm(t)
            if lv == 'case':
                if cur is not None: rows.append(rn)
                continue
            if cur is not None: groups.append((cur, cur_name, rows)); cur, rows = None, []
            if lv == 'cn': blk = None; inval = False
            elif lv == 'grp': blk = norm(t); inval = False
            elif lv in ('sub', 'sub2') and blk and 'giao dien' in blk:
                if 'validate' in n: inval = True
                elif lv == 'sub': inval = False
                if inval and n.startswith('danh sach'):
                    cur, cur_name, rows = rn, t, []
        if cur is not None: groups.append((cur, cur_name, rows))
        if not groups: continue

        drop = set(); anchor = {}
        for grp_rn, gname, case_rows in groups:
            if is_card(gname) and not INC_CARD:
                tot_skip += 1
                print('   %-20s %-40s GIỮ NGUYÊN (dạng thẻ, %d case)' % (nm[:20], gname[:40], len(case_rows)))
                continue
            drop |= set(case_rows); anchor[grp_rn] = True
            tot_grp += 1; tot_del += len(case_rows); tot_add += len(quota_cases.DANHSACH_YCHANG)
            print('   %-20s %-40s %2d case → 8 case mẫu' % (nm[:20], gname[:40], len(case_rows)))
        if not anchor: continue
        touched = True
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12 or rn in drop: continue
                pl.keep(rn)
                if rn in anchor:
                    for _k, b, c, d in quota_cases.DANHSACH_YCHANG: pl.case(b, c, d)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if touched: tot_file += 1

print('\n=== %s: %d file · %d nhóm bảng (bỏ %d, thêm %d, chênh %+d) · %d nhóm thẻ giữ nguyên ===%s'
      % (ROLE, tot_file, tot_grp, tot_del, tot_add, tot_add - tot_del, tot_skip,
         '' if APPLY else '   (xem trước, chưa ghi)'))
