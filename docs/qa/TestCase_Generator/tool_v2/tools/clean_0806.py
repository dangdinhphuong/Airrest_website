# -*- coding: utf-8 -*-
"""Dọn test case theo LUẬT MỚI chốt 2026-08-06 (DINH-MUC-VALIDATE-testcase.md §2 luật 10 & 11).

Ba việc:
  1. Xoá hẳn nhóm TRỪU TƯỢNG bị cấm (6 tên) + toàn bộ case con.
  2. Xoá case phân trang lạc sang khối Chức năng / An toàn thông tin
     (nhóm phân trang nguyên khối được xử lý riêng ở move_paging_0806.py).
  3. Xoá case "đang tải / lỗi tải" và "cột đặc thù" (mẫu Danh sách 8 case không có 2 mục này).

Dùng:  python3 clean_0806.py            # dry-run, chỉ in
       python3 clean_0806.py --apply    # ghi file
"""
import os, sys, glob, unicodedata, tcfix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roles

APPLY = '--apply' in sys.argv
_args = [a for a in sys.argv[1:] if not a.startswith('--')]
ROLE = _args[0] if _args and _args[0] in roles.ROLES else 'Admin'
SKIP = {'DonGia', 'GoiSTEM'} if ROLE == 'Admin' else set()
DIR = roles.ROLES[ROLE]['dir']
SKIP |= {os.path.basename(f)[:-5].split('-')[-1] for f in roles.ROLES[ROLE]['skip']}


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def is_banned_group(txt):
    n = norm(txt)
    if 'tai khoan' in n or 'tai lieu' in n: return False
    if 'trang thai tai' in n and ('rong' in n or 'loi' in n): return True
    if 'bo cuc' in n and 'tieu de man' in n: return True
    if 'hien thi thanh phan tren man' in n: return True
    if 'thao tac mo' in n and 'dong' in n: return True
    if 'dau trang' in n and ('trang thai tai' in n or 'chi tiet' in n): return True
    if 'tep xuat ra' in n or 'file xuat ra' in n: return True
    return False


PAGING_KW = ['phan trang', 'sang trang', 've trang', 'trang sau', 'trang truoc', 'chuyen trang',
             'so ban ghi moi trang', 'so dong moi trang', 'trang dau', 'trang cuoi',
             'trang 1', 'trang 2', 'reset trang']
PAGING_BLACK = ['trang thai', 'tai lai trang', 'trang chu', 'trang thiet bi']


def is_paging(txt):
    n = norm(txt)
    for b in PAGING_BLACK: n = n.replace(b, '~')
    return any(k in n for k in PAGING_KW)


def is_loading_case(txt):
    n = norm(txt)
    return ('dang tai' in n or 'loi tai' in n or 'chi bao dang tai' in n
            or ('khi tai' in n and 'loi' in n))


def is_speccol_case(txt):
    return 'cot dac thu' in norm(txt)


# Nhóm phân trang nguyên khối ở khối Chức năng — KHÔNG xoá ở đây, chuyển ở bước sau
MOVE_GROUPS = {
    ('LichTapHuan', 'Phân trang (xử lý ở trình duyệt)'),
    ('NCC', 'Chức năng Sắp xếp & Phân trang'),
    ('Onboarding', 'Kết hợp phân trang với thay đổi bộ lọc'),
}

tot_g = tot_c = 0
_files = []
for path in sorted(glob.glob(DIR + '*.xlsx')):
    nm = os.path.basename(path).replace(roles.ROLES[ROLE]['strip'], '').replace('.xlsx', '')
    if nm in SKIP or os.path.basename(path) in set(roles.ROLES[ROLE]['skip']): continue
    for _bp in tcfix.load(path).bpsheets:
        _files.append((path, nm, _bp))

for path, nm, _bp in _files:
    tc = tcfix.load(path, _bp)

    drop = set()          # dòng bị xoá
    reason = {}
    grp = None            # khối cấp 1 (Giao diện / Chức năng / An toàn thông tin)
    in_banned = False     # đang ở trong nhóm bị cấm
    in_move = False       # đang ở trong nhóm sẽ chuyển (giữ nguyên ở bước này)
    cur_sub2 = None

    for rn in tc.order:
        if rn < 12: continue
        lv = tc.lvl(rn)
        txt = (tc.c(rn, 'B') or '').split('\n')[0].strip()
        if lv == 'cn':
            grp = None; in_banned = in_move = False; cur_sub2 = None
            continue
        if lv == 'grp':
            grp = norm(txt); in_banned = in_move = False; cur_sub2 = None
            continue
        if lv in ('sub', 'sub2'):
            in_banned = is_banned_group(txt)
            in_move = (nm, txt) in MOVE_GROUPS
            cur_sub2 = txt
            if in_banned:
                drop.add(rn); reason[rn] = 'NHÓM LẠ'
            elif grp and ('chuc nang' in grp or 'an toan thong tin' in grp) \
                    and is_paging(txt) and not in_move:
                drop.add(rn); reason[rn] = 'NHÓM PHÂN TRANG SAI KHỐI'
                in_banned = True          # xoá cả case con
            continue
        # lv == 'case'
        if in_banned:
            drop.add(rn); reason[rn] = 'case trong nhóm bị xoá'
        elif grp and ('chuc nang' in grp or 'an toan thong tin' in grp) \
                and is_paging(txt) and not in_move:
            drop.add(rn); reason[rn] = 'PHÂN TRANG SAI KHỐI'
        elif is_loading_case(txt):
            drop.add(rn); reason[rn] = 'ĐANG TẢI / LỖI TẢI'
        elif is_speccol_case(txt):
            drop.add(rn); reason[rn] = 'CỘT ĐẶC THÙ'

    # nhóm rỗng sau khi xoá case -> xoá luôn header (không để nhóm rỗng).
    # NGOẠI LỆ: giữ header "Validate các trường thông tin" — khối bắt buộc của mỗi CN;
    # nhóm control thật được bù ngay sau bằng fix_validate_0806.py.
    changed = True
    while changed:
        changed = False
        rows = [r for r in tc.order if r >= 12 and r not in drop]
        for i, rn in enumerate(rows):
            lv = tc.lvl(rn)
            if lv not in ('sub', 'sub2'): continue
            if lv == 'sub' and 'validate' in norm(tc.c(rn, 'B') or ''): continue
            has_child = False
            for nxt in rows[i + 1:]:
                lv2 = tc.lvl(nxt)
                if lv2 == 'case': has_child = True; break
                if lv2 == 'sub2' and lv == 'sub': has_child = True; break
                break
            if not has_child:
                drop.add(rn); reason[rn] = 'nhóm rỗng sau khi dọn'
                changed = True

    if not drop:
        continue
    ng = sum(1 for r in drop if tc.lvl(r) != 'case')
    nc = sum(1 for r in drop if tc.lvl(r) == 'case')
    tot_g += ng; tot_c += nc
    print(f'### {nm} / {_bp}: xoá {ng} nhóm · {nc} case')
    if not APPLY:
        for r in sorted(drop):
            print(f'    r{r:<5} [{reason[r]:26s}] {(tc.c(r, "B") or "")[:60]}')
    else:
        plan = tcfix.Plan(tc)
        plan.items = [r for r in tc.order if r >= 12 and r not in drop]
        tc.rebuild(plan).save(quiet=False, sync=False)

print(f'=== TỔNG: {tot_g} nhóm · {tot_c} case ===' + ('' if APPLY else '  (DRY-RUN)'))
