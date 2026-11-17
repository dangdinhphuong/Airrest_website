# -*- coding: utf-8 -*-
"""Bơm case còn thiếu cho nhóm `Chức năng Tìm kiếm chung` — mẫu ĐÚNG 4 mục.

Khác `patch_quota.py`: bộ đó chỉ quét nhóm trong khối **Validate**, nên nhóm ở khối
**Chức năng** như "Chức năng Tìm kiếm chung" không bao giờ được bơm. Bộ rà `audit_func.py`
trước 2026-09-04 lại chỉ đòi 2 mục đầu ⇒ 41/43 nhóm thiếu 2 mục cuối mà vẫn báo sạch.

Nội dung lấy từ `quota_cases.SEARCH_COMMON` (bám wording mẫu r128–r131).
Chỉ THÊM mục còn thiếu, không sửa/xoá case cũ (luật 8).

    python3 patch_timkiemchung.py --role Admin          # xem trước
    python3 patch_timkiemchung.py --role Admin --apply  # ghi
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

# khoá nhận diện GIỐNG audit_func.TKC để sau khi bơm bộ rà ra 0
NEEDLES = {
    'gia tri mac dinh': ['gia tri mac dinh'],
    'khong ra ket qua': ['khong ra ket qua', 'khong co ket qua', 'khong tim thay'],
    'ket hop tat ca cac dieu kien': ['ket hop tat ca', 'ket hop moi dieu kien',
                                     'tat ca cac dieu kien', 'ket hop tat ca cac tieu chi'],
    '2 dieu kien khac nhau cung so ban ghi': ['2 dieu kien khac nhau', 'hai dieu kien khac nhau',
                                              'cung so ban ghi', 'so ban ghi ket qua giong nhau'],
}

APPLY = '--apply' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
CFG = roles.get(ROLE)
# Lọc TÊN MÀN — thêm 2026-09-09. Trước đó script chỉ nhận `--role` nên LUÔN chạy cho CẢ role:
# lần chạy 09/09 (sinh màn `Danh mục trình độ ngoại ngữ`) `patch_timkiem_donle` định sửa lây
# `TrinhDoDaoTao` (+1 case) — đúng lớp sự cố "sửa lây file ngoài phạm vi" mà 3 script `complete_*`
# đã vá 08/09. Cùng lối đặt tham số với `patch_cn_trangthai.py` / `audit_*`.
ONLY = None
for _a in sys.argv[1:]:
    if not _a.startswith('--') and _a != ROLE:
        ONLY = _a

tot_case = tot_grp = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']: continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base); continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    if ONLY and ONLY.lower() not in nm.lower():
        continue
    try: bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e)); continue

    file_case = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        # gom nhóm "Chức năng Tìm kiếm chung": (dòng case cuối, tên nhóm, [tiêu đề case])
        groups, cur, cases, last, ingrp = [], None, [], None, False
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn)
            txt = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'case':
                if cur: cases.append(txt); last = rn
                continue
            if cur:
                groups.append((last, cur, cases)); cur, cases, last = None, [], None
            if lv == 'cn':   ingrp = False
            elif lv == 'grp': ingrp = norm(txt).startswith('chuc nang')
            elif lv in ('sub', 'sub2') and ingrp and 'tim kiem chung' in norm(txt):
                cur, cases, last = txt, [], rn
        if cur: groups.append((last, cur, cases))

        add = {}
        for last_rn, gname, cs in groups:
            have = norm(' | '.join(cs))
            picked = []
            for key, md, buoc, kq in quota_cases.SEARCH_COMMON:
                if any(x in have for x in NEEDLES[key]): continue      # đã có mục này
                picked.append((md, buoc, kq))
            if picked:
                add[last_rn] = picked
                tot_grp += 1
                print('   %-24s %-38s +%d: %s' % (nm, gname[:38], len(picked),
                      ', '.join(m[:34] for m, _, _ in picked)))
        if not add: continue
        file_case += sum(len(v) for v in add.values())
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12: continue
                pl.keep(rn)
                for c in add.get(rn, []): pl.case(*c)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if file_case:
        tot_file += 1; tot_case += file_case

print('\n=== %s: %d file · %d nhóm · +%d case ===%s'
      % (ROLE, tot_file, tot_grp, tot_case, '' if APPLY else '   (xem trước, chưa ghi)'))
