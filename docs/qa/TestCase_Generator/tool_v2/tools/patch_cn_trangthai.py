# -*- coding: utf-8 -*-
"""Bơm khối **Chức năng** cho các CN mà `complete_func.py` KHÔNG phân loại được.

Vì sao cần: `complete_func.kind()` trả `None` cho mọi nhóm mở đầu bằng `huy` / `dong ` và
KHÔNG có nhánh `chuyen trang thai` (dòng 289–291 của `complete_func.py`). Họ màn danh mục
MOET (`CategoryCrudPage` + `deleteAsStatus: true`) bỏ hẳn thao tác Xoá — biểu tượng trên dòng
gọi `changeStatus` — nên các nhóm dưới đây LUÔN RỖNG và `audit_extra` báo "Nhóm rỗng":

    Chức năng Chuyển trạng thái            -> quota_cases.STATUS_FN        (§6, bộ CN Xóa đổi động từ)
    Chức năng Chuyển trạng thái hàng loạt  -> quota_cases.STATUS_BULK_FN
    Chức năng Hủy bỏ                       -> theo CN cha:
        THÊM MỚI   -> FORM_FN_CANCEL_ADD     CHỈNH SỬA -> FORM_FN_CANCEL_EDIT
        CHUYỂN TT  -> STATUS_FN_CANCEL       NHẬP EXCEL -> IMPORT_FN_CANCEL
    Chức năng Đóng                         -> quota_cases.IMPORT_FN_CLOSE

Chỉ THÊM mục còn thiếu, không sửa/xoá case cũ (luật 8). Mốc chèn tìm THEO NỘI DUNG cột B
(không hardcode số dòng) nên chạy lại nhiều vòng vẫn đúng.

    python3 patch_cn_trangthai.py --role QuanTri          # xem trước
    python3 patch_cn_trangthai.py --role QuanTri --apply  # ghi
    python3 patch_cn_trangthai.py --role QuanTri MonHoc --apply   # lọc theo tên file
"""
import os, sys, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles, quota_cases


# App gọi thao tác này là "Chuyển trạng thái" (toast/confirm của FE), nhưng người viết case hay
# gõ "Đổi trạng thái" / "Thay đổi trạng thái". Khớp cứng một cách gọi thì nhóm mang tên khác
# LUÔN RỖNG mà chỉ `audit_extra` báo chung chung "Nhóm rỗng" (đã dính ở `QuanTri/ChucVu`).
TRANG_THAI_KW = ('chuyen trang thai', 'doi trang thai', 'thay doi trang thai',
                 'cap nhat trang thai', 'bat tat trang thai')


def _la_trang_thai(n):
    return any(k in n for k in TRANG_THAI_KW)


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def cn_kind(cn):
    """Loại CN cha — quyết định bộ case 'Hủy bỏ' nào được dùng."""
    n = norm(cn)
    if 'nhap excel' in n:                       return 'NHAP'
    if 'hang loat' in n:                        return 'BULK'
    if _la_trang_thai(n):                       return 'STATUS'
    if n.startswith(('them', 'tao')) or 'them moi' in n:   return 'ADD'
    if 'chinh sua' in n or n.startswith('sua'): return 'EDIT'
    return None


CANCEL_SRC = {'ADD':    quota_cases.FORM_FN_CANCEL_ADD,
              'EDIT':   quota_cases.FORM_FN_CANCEL_EDIT,
              'STATUS': quota_cases.STATUS_FN_CANCEL,
              'BULK':   quota_cases.STATUS_FN_CANCEL,
              'NHAP':   quota_cases.IMPORT_FN_CANCEL}


def src_for(gname, cn):
    """Bộ case nguồn cho một nhóm chức năng, theo tên nhóm + CN cha."""
    n, k = norm(gname), cn_kind(cn)
    if not n.startswith('chuc nang'):
        return None
    if _la_trang_thai(n):
        return quota_cases.STATUS_BULK_FN if 'hang loat' in n else quota_cases.STATUS_FN
    if n.startswith('chuc nang dong') or ' dong' == n[len('chuc nang'):][:5]:
        return quota_cases.IMPORT_FN_CLOSE
    if 'huy' in n.replace('chuyen', '~'):        # 'chuyen' chứa chuỗi con 'huy' -> phải che trước
        return CANCEL_SRC.get(k)
    return None


APPLY = '--apply' in sys.argv
ROLE = 'QuanTri'
if '--role' in sys.argv:
    ROLE = sys.argv[sys.argv.index('--role') + 1]
ONLY = None
for a in sys.argv[1:]:
    if not a.startswith('--') and a != ROLE:
        ONLY = a
CFG = roles.get(ROLE)

tot_case = tot_grp = tot_file = 0
for p in sorted(glob.glob(CFG['dir'] + '*.xlsx')):
    base = os.path.basename(p)
    if base in CFG['skip']:
        continue
    if ONLY and ONLY not in base:
        continue
    if os.path.exists(os.path.join(os.path.dirname(p), '.~lock.%s#' % base)):
        print('  BỎ QUA (đang mở):', base); continue
    nm = base.replace(CFG['strip'], '').replace('.xlsx', '')
    try:
        bps = tcfix.load(p).bpsheets
    except Exception as e:
        print('  LỖI đọc %s: %s' % (base, e)); continue

    file_case = 0
    for bp in bps:
        tc = tcfix.load(p, bp)
        # gom nhóm chức năng: (dòng chèn sau, tên nhóm, CN cha, [tiêu đề case])
        groups, cur, cases, last, cn, ingrp = [], None, [], None, None, False
        for rn in tc.order:
            if rn < 12:
                continue
            lv = tc.lvl(rn); t = (tc.c(rn, 'B') or '').split('\n')[0].strip()
            if lv == 'case':
                if cur:
                    cases.append(t); last = rn
                continue
            if cur:
                groups.append((last, cur, cn, cases)); cur, cases, last = None, [], None
            if lv == 'cn':
                cn, ingrp = t, False
            elif lv == 'grp':
                ingrp = norm(t).startswith('chuc nang')
            elif lv in ('sub', 'sub2') and ingrp:
                cur, cases, last = t, [], rn
        if cur:
            groups.append((last, cur, cn, cases))

        add = {}
        for last_rn, gname, cncha, cs in groups:
            src = src_for(gname, cncha or '')
            if not src:
                continue
            have = norm(' | '.join(cs))
            picked = [(md, buoc, kq) for key, md, buoc, kq in src if norm(md) not in have]
            if picked:
                add.setdefault(last_rn, []).extend(picked); tot_grp += 1
                print('   %-14s %-38s %-30s +%d' % (nm[:14], (cncha or '')[:38], gname[:30], len(picked)))
        if not add:
            continue
        file_case += sum(len(v) for v in add.values())
        if APPLY:
            pl = tcfix.Plan(tc)
            for rn in tc.order:
                if rn < 12:
                    continue
                pl.keep(rn)
                for c in add.get(rn, []):
                    pl.case(*c)
            tc.rebuild(pl).save(quiet=True, sync=len(bps) == 1)
    if file_case:
        tot_file += 1; tot_case += file_case

print('\n=== %s: %d file · %d nhóm · +%d case ===%s'
      % (ROLE, tot_file, tot_grp, tot_case, '' if APPLY else '   (xem trước, chưa ghi)'))
