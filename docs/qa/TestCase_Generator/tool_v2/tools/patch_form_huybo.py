# -*- coding: utf-8 -*-
"""Bơm nhóm **`Chức năng Hủy bỏ`** còn thiếu ở CN THÊM MỚI / CHỈNH SỬA (mẫu r279 · r418–r419).

Mẫu cho MỖI CN Thêm mới và Chỉnh sửa một nhóm `Chức năng Hủy bỏ` gồm 1 case
(*hủy bỏ thêm mới* / *hủy bỏ chỉnh sửa*). `audit_func` chỉ soi nhóm ĐÃ CÓ nên CN thiếu hẳn
nhóm này không bao giờ bị bắt — đợt rà 2026-09-04 phát hiện 35 CN thiếu.

Bỏ qua CN không phải thao tác lưu: wizard/bước, Deploy, "phiên bản cập nhật" (cập nhật là danh từ).

    python3 patch_form_huybo.py --role Admin          # xem trước
    python3 patch_form_huybo.py --role Admin --apply  # ghi
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def cn_kind(t):
    n = norm(t)
    if any(k in n for k in ('nhap excel', 'import', 'xuat')): return None
    if 'wizard' in n: return None
    if 'buoc' in n and any(k in n for k in ('buoc 1','buoc 2','buoc 3','buoc 4','buoc 5')): return None
    if any(k in n for k in ('phien ban cap nhat', 'danh sach phien ban', 'deploy')): return None
    if any(k in n for k in ('chinh sua', 'cap nhat')) or n.startswith('sua ') or ' sua ' in n: return 'SUA'
    if any(k in n for k in ('them moi', 'tao moi', 'them ', 'tao ', 'khoi tao')): return 'THEM'
    return None

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

tot_cn = tot_file = 0
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

    touched = False
    for bp in bps:
        tc = tcfix.load(p, bp)
        cn = None; kind = None; blk = None
        info = {}
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip(); n = norm(t)
            if lv == 'cn':
                cn = t; kind = cn_kind(t); blk = None
                if kind: info[cn] = {'kind': kind, 'has_huy': False, 'last': None}
            elif kind and lv == 'grp':
                blk = norm(t)
            elif kind and blk and 'chuc nang' in blk:
                if lv in ('sub', 'sub2'):
                    info[cn]['last'] = rn
                    if 'huy' in n or 'thoat' in n: info[cn]['has_huy'] = True
                elif lv == 'case':
                    info[cn]['last'] = rn

        add = {}
        for c, d in info.items():
            if d['has_huy'] or not d['last']: continue
            spec = (quota_cases.FORM_FN_CANCEL_EDIT if d['kind'] == 'SUA'
                    else quota_cases.FORM_FN_CANCEL_ADD)
            add.setdefault(d['last'], []).append(('Chức năng Hủy bỏ', spec))
            tot_cn += 1
            print('   %-20s %-40s + nhóm "Chức năng Hủy bỏ" (1 case)' % (nm[:20], c[:40]))
        if not add: continue
        touched = True
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12: continue
                pl.keep(rn)
                for gname, spec in add.get(rn, []):
                    pl.add_sub(gname)
                    for _k, md, buoc, kq in spec: pl.case(md, buoc, kq)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if touched: tot_file += 1

print('\n=== %s: %d file · %d CN · +%d case ===%s'
      % (ROLE, tot_file, tot_cn, tot_cn, '' if APPLY else '   (xem trước, chưa ghi)'))
