# -*- coding: utf-8 -*-
"""Chuyển nhóm PHÂN TRANG nguyên khối từ khối Chức năng sang Validate.

Luật §2 luật 10 (DINH-MUC-VALIDATE-testcase.md, chốt 2026-08-06):
  - cả nhóm `Phân trang` / `Sắp xếp & Phân trang` -> chuyển nguyên nhóm sang Validate
  - case "đổi bộ lọc thì về trang 1" -> bỏ hẳn (trùng mục *vị trí trang sau khi thêm/xoá*)

Ba ca trong bộ Admin (tìm mốc THEO NỘI DUNG, không hardcode số dòng):
  LichTapHuan · NCC · Onboarding

Dùng:  python3 move_paging_0806.py [--apply]
"""
import os, sys, unicodedata, tcfix

# Đường dẫn dữ liệu lấy từ hồ sơ dự án (vá 2026-09-08). Bản cũ ghép cứng
# `../../testCase/Admin/testcase/` — chỉ đúng khi `tool_v2` nằm TRONG `qa-doc`; dời repo ra
# chỗ khác là script chết ngay lúc import (FileNotFoundError), không chạy nổi một dòng.
import roles
DIR = roles.get('Admin')['dir']
APPLY = '--apply' in sys.argv


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def find(tc, text, lv=None):
    """Dòng đầu tiên có cột B khớp text (khớp đầu chuỗi), tuỳ chọn lọc theo cấp."""
    for rn in tc.order:
        if rn < 12: continue
        if lv and tc.lvl(rn) != lv: continue
        if (tc.c(rn, 'B') or '').strip().startswith(text):
            return rn
    return None


def cn_of(tc, rn):
    """Dòng CN chứa dòng rn."""
    return max(r for r in tc.order if r <= rn and r >= 12 and tc.lvl(r) == 'cn')


def find_in_cn(tc, cn_row, text, lv=None):
    """Tìm nhóm theo tên NHƯNG chỉ trong phạm vi CN cn_row (bẫy §0.3 #6: nhóm trùng tên)."""
    for rn in tc.order:
        if rn <= cn_row: continue
        if tc.lvl(rn) == 'cn': return None
        if lv and tc.lvl(rn) != lv: continue
        if (tc.c(rn, 'B') or '').strip().startswith(text): return rn
    return None


def block(tc, hdr):
    """Các dòng case thuộc ngay dưới header hdr."""
    out = []
    seen = False
    for rn in tc.order:
        if rn == hdr: seen = True; continue
        if not seen: continue
        if tc.lvl(rn) == 'case': out.append(rn)
        else: break
    return out


def val_end(tc, cn_row):
    """Dòng cuối cùng của khối 'Validate các trường thông tin' trong CN bắt đầu ở cn_row."""
    rows = [r for r in tc.order if r >= cn_row]
    i = 0
    # tới header Validate của CN này
    while i < len(rows):
        rn = rows[i]
        if rn != cn_row and tc.lvl(rn) == 'cn': return None
        if tc.lvl(rn) == 'sub' and 'validate' in norm(tc.c(rn, 'B') or ''): break
        i += 1
    if i >= len(rows): return None
    last = rows[i]
    for rn in rows[i + 1:]:
        if tc.lvl(rn) in ('cn', 'grp', 'sub'): break
        last = rn
    return last


def report(nm, msg):
    print(f'  [{nm}] {msg}')


# ─────────────────────────── LichTapHuan ───────────────────────────
# nhóm `Phân trang (xử lý ở trình duyệt)` (sub, khối Chức năng) -> sub2 cuối khối Validate
# case `đổi bộ lọc quay về trang 1` -> bỏ hẳn
def do_lichtaphuan():
    p = DIR + 'Testcase-Role-Admin-LichTapHuan.xlsx'
    tc = tcfix.load(p)
    hdr = find(tc, 'Phân trang (xử lý ở trình duyệt)', 'sub')
    cases = block(tc, hdr)
    drop = [r for r in cases if 've trang 1' in norm(tc.c(r, 'B'))]
    keep = [r for r in cases if r not in drop]
    cn_row = max(r for r in tc.order if r < hdr and tc.lvl(r) == 'cn')
    tail = val_end(tc, cn_row)
    report('LichTapHuan', f'chuyển nhóm r{hdr} ({len(keep)} case) vào Validate sau r{tail}; '
                          f'bỏ {len(drop)} case về-trang-1')
    if not APPLY: return
    plan = tcfix.Plan(tc)
    moved = set([hdr] + cases)
    for rn in tc.order:
        if rn < 12 or rn in moved: continue
        plan.keep(rn)
        if rn == tail:
            plan.add_sub2('Phân trang (xử lý ở trình duyệt)')
            plan.keep(*keep)
    tc.rebuild(plan).save()


# ─────────────────────────── NCC ───────────────────────────
# nhóm `Chức năng Sắp xếp & Phân trang` -> đổi tên `Chức năng Sắp xếp`;
# case `tự động lùi về trang cuối…` -> chuyển vào nhóm `Phân trang` trong Validate
def do_ncc():
    p = DIR + 'Testcase-Role-Admin-NCC.xlsx'
    tc = tcfix.load(p)
    hdr = find(tc, 'Chức năng Sắp xếp & Phân trang', 'sub')
    cases = block(tc, hdr)
    move = [r for r in cases if 'lui ve trang cuoi' in norm(tc.c(r, 'B'))]
    pag = find_in_cn(tc, cn_of(tc, hdr), 'Phân trang', 'sub2')
    tail = block(tc, pag)[-1]
    report('NCC', f'r{hdr} -> "Chức năng Sắp xếp"; chuyển {len(move)} case sang nhóm Phân trang (r{pag}) sau r{tail}')
    if not APPLY: return
    tc.rename(hdr, 'Chức năng Sắp xếp')
    plan = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12 or rn in move: continue
        plan.keep(rn)
        if rn == tail: plan.keep(*move)
    tc.rebuild(plan).save()


# ─────────────────────────── Onboarding ───────────────────────────
# nhóm `Điều khiển chuyển trang` (Validate) -> đổi tên `Phân trang`
# nhóm `Kết hợp phân trang với thay đổi bộ lọc` (Chức năng):
#   - case phân trang thuần (tự điều chỉnh trang khi tổng bản ghi giảm) -> chuyển sang Validate
#   - 2 case còn lại đúng bản chất là LỌC KẾT HỢP -> giữ ở Chức năng, đổi tên nhóm cho đúng
def do_onboarding():
    p = DIR + 'Testcase-Role-Admin-Onboarding.xlsx'
    tc = tcfix.load(p)
    src = find(tc, 'Kết hợp phân trang với thay đổi bộ lọc', 'sub')
    cases = block(tc, src)
    move = [r for r in cases if 'tong so ban ghi giam' in norm(tc.c(r, 'B'))]
    dst = find_in_cn(tc, cn_of(tc, src), 'Điều khiển chuyển trang', 'sub2')
    tail = block(tc, dst)[-1]
    report('Onboarding', f'r{dst} -> "Phân trang"; chuyển {len(move)} case từ r{src} vào sau r{tail}; '
                         f'r{src} -> "Chức năng lọc kết hợp nhiều tiêu chí" (giữ {len(cases) - len(move)} case)')
    if not APPLY: return
    tc.rename(dst, 'Phân trang')
    tc.rename(src, 'Chức năng lọc kết hợp nhiều tiêu chí')
    plan = tcfix.Plan(tc)
    for rn in tc.order:
        if rn < 12 or rn in move: continue
        plan.keep(rn)
        if rn == tail: plan.keep(*move)
    tc.rebuild(plan).save()


do_lichtaphuan()
do_ncc()
do_onboarding()
print('=== xong ===' if APPLY else '=== DRY-RUN ===')
