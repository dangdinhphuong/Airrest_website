# -*- coding: utf-8 -*-
"""Bơm case còn thiếu cho khối **Chức năng của CN XÓA** — 8 mục của mẫu (r451–r458).

Trước 2026-09-04 bộ rà `audit_func.XOA` chỉ đòi 4 mục nên thiếu hẳn 6 mục mẫu:
hủy bỏ thao tác xóa · click icon đóng · chọn nhiều bản ghi · click liên tục ·
Tab+Enter liên tục · xóa trùng từ 2 tab/2 client.

Nội dung: `quota_cases.DELETE_FN` (bám wording mẫu). Từ khoá nhận diện dùng CHUNG với
`audit_func.XOA` để sau khi bơm bộ rà ra 0. Chỉ THÊM mục thiếu, không sửa/xoá case cũ (luật 8).

    python3 patch_xoa_fn.py --role Admin          # xem trước
    python3 patch_xoa_fn.py --role Admin --apply           # ghi CẢ ROLE
    python3 patch_xoa_fn.py --role Admin KhaoSat --apply   # chỉ 1 màn
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

# GIỐNG audit_func.XOA (6 mục mẫu đang thiếu)
NEEDLES = {
    'huy bo thao tac xoa':          ['huy bo thao tac xoa', 'huy bo xoa', 'huy xoa', 'huy bo'],
    'icon dong':                    ['icon dong', 'dong popup', 'dong hop thoai', 'icon x'],
    'chon nhieu ban ghi de xoa':    ['nhieu ban ghi', 'tu 2 ban ghi', 'hang loat', 'chon nhieu'],
    'click lien tuc vao button xoa':['lien tuc'],
    'tab va enter lien tuc':        ['tab + enter', 'tab va enter', 'tab vao button', 'enter lien tuc'],
    '2 tab hoac 2 client':          ['2 client', 'hai client', '2 tab', 'dong thoi'],
}

# Bằng chứng CẤU TRÚC cho màn có xoá hàng loạt: có nhóm control tích chọn DÒNG trong danh sách.
# Không có bằng chứng thì KHÔNG bơm mục 'chọn nhiều bản ghi để xóa' (chỉ thị 2026-09-04).
EV_BULK = ['checkbox ban ghi', 'checkbox chon dong', 'o tich chon dong', 'checkbox chon ban ghi']

def has_bulk_delete(tc):
    for rn in tc.order:
        if rn < 12 or tc.lvl(rn) not in ('sub', 'sub2'): continue
        if any(k in norm((tc.c(rn, 'B') or '').split('\n')[0]) for k in EV_BULK): return True
    return False


def is_delete_fn(gname):
    n = norm(gname)
    return n.startswith('chuc nang') and 'xoa' in n and 'khong xoa' not in n

APPLY = '--apply' in sys.argv
ROLE = 'Admin'
if '--role' in sys.argv: ROLE = sys.argv[sys.argv.index('--role') + 1]
# Lọc theo TÊN MÀN (2026-09-10). Trước bản này script chỉ nhận `--role` nên **chạy cả role** —
# đúng lớp lỗi đã trả giá với nhóm `complete_*` (đợt 17/08 sửa lây 13 file ngoài phạm vi, cách
# chữa duy nhất khi đó là tạm chuyển file sang `_hold/`). Nhận cả `--only <Màn>` lẫn tham số
# vị trí, giống các patcher khác, để người dùng không phải nhớ hai lối gọi.
ONLY = None
if '--only' in sys.argv:
    ONLY = sys.argv[sys.argv.index('--only') + 1]
else:
    _pos = [a for i, a in enumerate(sys.argv[1:], 1)
            if not a.startswith('--') and sys.argv[i - 1] != '--role']
    ONLY = _pos[0] if _pos else None
CFG = roles.get(ROLE)

tot_case = tot_grp = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']: continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base); continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    if ONLY and ONLY.lower() not in nm.lower(): continue
    try: bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e)); continue

    file_case = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        groups, cur, cases, last, ingrp = [], None, [], None, False
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'case':
                if cur: cases.append((t, tc.c(rn, 'C') or '')); last = rn
                continue
            if cur:
                groups.append((last, cur, cases)); cur, cases, last = None, [], None
            if lv == 'cn': ingrp = False
            elif lv == 'grp': ingrp = norm(t).startswith('chuc nang')
            elif lv in ('sub', 'sub2') and ingrp and is_delete_fn(t):
                cur, cases, last = t, [], rn
        if cur: groups.append((last, cur, cases))

        bulk_ok = has_bulk_delete(tc)
        add = {}
        for last_rn, gname, cs in groups:
            have   = norm(' | '.join(b + ' ¦ ' + c for b, c in cs))   # B+C: dedup vòng 1
            have_b = norm(' | '.join(b for b, _c in cs))              # chỉ B: khớp audit_func
            picked = []
            skipped = []
            for key, md, buoc, kq in quota_cases.DELETE_FN:
                if key == 'chon nhieu ban ghi de xoa' and not bulk_ok:
                    continue                      # màn không có xoá hàng loạt -> KHÔNG bơm
                if any(x in have for x in NEEDLES[key]):
                    skipped.append((key, md, buoc, kq)); continue
                picked.append((md, buoc, kq))
            # VÒNG 2 — bù khi MỘT case cũ khớp từ khoá của NHIỀU mục (dedup quá tay) nên mục vẫn
            # trống. Chỉ bơm nếu tiêu đề mục đó chưa xuất hiện nguyên văn. Cùng cơ chế patch_quota.
            for key, md, buoc, kq in skipped:
                if key == 'chon nhieu ban ghi de xoa' and not bulk_ok: continue
                if norm(md) in have_b: continue
                # đã có case nào NÓI RIÊNG về mục này chưa? (khớp cụm đặc trưng, hẹp hơn NEEDLES)
                tight = {'icon dong': ['icon dong', 'icon x', 'bam x'],
                         '2 tab hoac 2 client': ['2 client', 'hai client', '2 tab'],
                         'tab va enter lien tuc': ['tab + enter', 'tab va enter', 'tab vao button'],
                         'huy bo thao tac xoa': ['huy bo thao tac xoa', 'huy bo xoa', 'huy xoa'],
                         'chon nhieu ban ghi de xoa': ['nhieu ban ghi', 'tu 2 ban ghi', 'hang loat'],
                         'click lien tuc vao button xoa': ['click lien tuc', 'bam lien tuc', 'nhan lien tuc'],
                         }.get(key, NEEDLES[key])
                if not any(x in have_b for x in tight):
                    picked.append((md, buoc, kq))
            if picked:
                add.setdefault(last_rn, []).extend(picked); tot_grp += 1
                print('   %-20s %-30s +%d: %s' % (nm[:20], gname[:30], len(picked),
                      ', '.join(m[:26] for m, _, _ in picked)))
        if not add: continue
        file_case += sum(len(v) for v in add.values())
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12: continue
                pl.keep(rn)
                for c in add.get(rn, []): pl.case(*c)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if file_case: tot_file += 1; tot_case += file_case

print('\n=== %s: %d file · %d nhóm · +%d case ===%s'
      % (ROLE, tot_file, tot_grp, tot_case, '' if APPLY else '   (xem trước, chưa ghi)'))
