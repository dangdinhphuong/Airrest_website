# -*- coding: utf-8 -*-
"""Đưa CN NHẬP EXCEL / XUẤT EXCEL về ĐÚNG KHUNG MẪU (chốt 2026-09-04).

CN NHẬP EXCEL (mẫu r549–r578) — bổ sung phần còn thiếu:
    Chức năng ─ Chức năng Nhập excel (9) · **Chức năng Hủy bỏ (1)** · **Chức năng Đóng (1)**
    ATTT      ─ **File type (3)** · từng cột nhập (4)

CN XUẤT EXCEL (mẫu r579–r585) — `Giao diện chung` = **ĐÚNG 2 case của mẫu**, nói về FILE XUẤT RA
chứ không phải màn hình. Chỉ thị người đặt việc 2026-09-04 **đảo luật 1** (6 case) cho RIÊNG CN Xuất:
    · bỏ 4 case Tab · Shift Tab · zoom in · zoom out
    · 2 case còn lại đổi nội dung thành 2 case mẫu (đầy đủ thông tin trong file xuất ra · file excel xuất ra)

    python3 patch_excel_cn.py --role Admin          # xem trước
    python3 patch_excel_cn.py --role Admin --apply  # ghi
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases
import patch_giaodien          # chỉ để dùng `ho_so_man()` — một chỗ khai đường dẫn hồ sơ

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def kind_of_cn(t):
    n = norm(t)
    if any(k in n for k in ('nhap excel', 'import excel', 'import ')): return 'NHAP'
    if 'xuat' in n and not any(k in n for k in ('xuat ban', 'xuat xu')): return 'XUAT'
    return None

GDC_DROP = ['khi thuc hien tab', 'khi thuc hien shift tab',
            'khi thuc hien zoom in', 'khi thuc hien zoom out']

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

tot_add = tot_drop = tot_ret = tot_cn = tot_file = 0
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
        cn = None; kind = None; blk = None; sub = None
        info = {}
        for rn in tc.order:
            if rn < 12: continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'cn':
                cn = t; kind = kind_of_cn(t); blk = None; sub = None
                if kind: info[cn] = {'kind': kind, 'gdc': [], 'fn': {}, 'fn_last': None,
                                     'attt': {}, 'attt_last': None, 'attt_first': None}
            elif kind and lv == 'grp':
                blk = norm(t); sub = None
                if 'toan thong tin' in blk: info[cn]['attt_first'] = rn
            elif kind and lv in ('sub', 'sub2'):
                sub = t
                if blk and 'giao dien' in blk and 'giao dien chung' in norm(t): sub = '__GDC__'
                elif blk and 'chuc nang' in blk: info[cn]['fn'].setdefault(t, []); info[cn]['fn_last'] = rn
                elif blk and 'toan thong tin' in blk: info[cn]['attt'].setdefault(t, []); info[cn]['attt_last'] = rn
            elif kind and lv == 'case':
                if blk and 'giao dien' in blk and sub == '__GDC__': info[cn]['gdc'].append((rn, t))
                elif blk and 'chuc nang' in blk:
                    if sub in info[cn]['fn']: info[cn]['fn'][sub].append(t)
                    info[cn]['fn_last'] = rn
                elif blk and 'toan thong tin' in blk:
                    if sub in info[cn]['attt']: info[cn]['attt'][sub].append(t)
                    info[cn]['attt_last'] = rn

        # 2026-09-10: hai case `Giao diện chung` của CN Xuất phải nêu ĐÚNG tên cột / tên file
        # của MÀN NÀY. Có hồ sơ màn thì điền theo hồ sơ, không có thì `EXPORT_GDC` đã mang sẵn
        # chỗ giữ `<…>` để `[CẦN VERIFY]` lo — không bao giờ ghi ra chuỗi `{cot}` thô.
        _egdc = quota_cases.export_gdc(patch_giaodien.ho_so_man(getattr(tc, 'path', None)))
        add = {}; drop = set(); ret = {}; newgrp = {}
        for c, d in info.items():
            if d['kind'] == 'NHAP':
                fnblob = norm(' | '.join(d['fn'].keys()))
                anchor = d['fn_last']
                if anchor:
                    if 'huy' not in fnblob:
                        newgrp.setdefault(anchor, []).append(('sub', 'Chức năng Hủy bỏ',
                                                              quota_cases.IMPORT_FN_CANCEL))
                    if 'dong' not in fnblob:
                        newgrp.setdefault(anchor, []).append(('sub', 'Chức năng Đóng',
                                                              quota_cases.IMPORT_FN_CLOSE))
                aablob = norm(' | '.join(d['attt'].keys()))
                aanchor = d['attt_last'] or d['attt_first']
                if aanchor and 'file type' not in aablob:
                    newgrp.setdefault(aanchor, []).append(('sub', 'File type', quota_cases.ATTT_FILETYPE))
            else:                                            # XUAT — Giao diện chung về 2 case mẫu
                gdc = d['gdc']
                if not gdc: continue
                keep = [(rn, t) for rn, t in gdc if not any(k in norm(t) for k in GDC_DROP)]
                for rn, t in gdc:
                    if any(k in norm(t) for k in GDC_DROP): drop.add(rn)
                for i, (rn, t) in enumerate(keep[:2]):
                    _k, md, buoc, kq = _egdc[i]
                    if norm(t) != norm(md): ret[rn] = (md, buoc, kq)
                for rn, t in keep[2:]: drop.add(rn)          # thừa hơn 2 case -> bỏ
                if len(keep) < 2 and gdc:
                    anchor = keep[-1][0] if keep else gdc[-1][0]
                    miss = _egdc[len(keep):]
                    newgrp.setdefault(anchor, []).append(('case', None, miss))
            tot_cn += 1

        if not (newgrp or drop or ret): continue
        touched = True
        for a, items in newgrp.items():
            for _t, gname, spec in items:
                if gname: print('   %-20s + NHÓM "%s" (%d case)' % (nm[:20], gname, len(spec)))
                else:     print('   %-20s + %d case Giao diện chung (mẫu)' % (nm[:20], len(spec)))
                tot_add += len(spec)
        if drop: print('   %-20s − %d case Giao diện chung (Tab/zoom) ở CN Xuất' % (nm[:20], len(drop))); tot_drop += len(drop)
        if ret:  print('   %-20s ~ %d case Giao diện chung đổi về chữ mẫu' % (nm[:20], len(ret))); tot_ret += len(ret)

        if APPLY:
            for rn, (md, buoc, kq) in ret.items(): tc.retext(rn, md=md, buoc=buoc, kq=kq)
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12 or rn in drop: continue
                pl.keep(rn)
                for _t, gname, spec in newgrp.get(rn, []):
                    if gname: pl.add_sub(gname)
                    for _k, md, buoc, kq in spec: pl.case(md, buoc, kq)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if touched: tot_file += 1

print('\n=== %s: %d file · thêm %d case · bỏ %d case · sửa chữ %d case ===%s'
      % (ROLE, tot_file, tot_add, tot_drop, tot_ret, '' if APPLY else '   (xem trước, chưa ghi)'))
