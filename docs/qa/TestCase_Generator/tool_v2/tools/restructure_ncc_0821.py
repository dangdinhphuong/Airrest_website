# -*- coding: utf-8 -*-
"""Dọn bộ test case role NCC theo luật §0 (đợt 2026-08-21).

Chỉ CHUYỂN CHỖ / THÊM nhóm — **không xoá case nào**, nên cột F·G·R·T (kết quả đã chạy)
đi theo đúng dòng của nó.

Việc làm:
  1. `Giao diện chung` về ĐÚNG 6 case nền: case lạc chỗ chuyển đi, KHÔNG xoá.
     - case `nhấn Enter`  → khối `Chức năng` của chính CN đó (mục *Tab + Enter* của audit_func)
     - case hiển thị khác → nhóm mới `Hiển thị đặc thù của màn` trong khối `Giao diện`,
       đặt ngay sau nhóm `Giao diện chung` (tên không khớp QUOTA nào nên không bị áp định mức)

    python3 restructure_ncc_0821.py            # dry-run
    python3 restructure_ncc_0821.py --apply
    python3 restructure_ncc_0821.py TruongHoc --apply     # lọc theo tên file
"""
import os, re, sys, glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix, roles
from restructure_khaibao_0817 import Node, parse, idx_of, cn_span, block_span, group_span, norm

DIR = roles.ROLES['NCC']['dir']
SKIP = set(roles.ROLES['NCC']['skip'])

GDC_BASE = ['hien thi day du cac thong tin trong man hinh chuc nang',
            'tong the giao dien man hinh', 'khi thuc hien tab', 'khi thuc hien shift tab',
            'khi thuc hien zoom in', 'khi thuc hien zoom out']
ENTER = 'nhan enter'
NEW_GRP = 'Hiển thị đặc thù của màn'


def move_gdc_stray(seq, log):
    """Gỡ case lạc chỗ khỏi `Giao diện chung`, chèn lại vào đúng khối của cùng CN."""
    # ── gỡ hết trong một lượt (không vừa tìm vừa chèn — xem bẫy của move_enter)
    pending, keep, cur, ingdc = [], [], None, False
    for n in seq:
        if n.kind == 'cn':
            cur, ingdc = n.head(), False
        elif n.kind == 'grp':
            ingdc = False
        elif n.kind == 'sub':
            ingdc = 'giao dien chung' in norm(n.head())
        elif n.kind == 'sub2':
            ingdc = False
        elif n.kind == 'case' and ingdc and not any(b in norm(n.head()) for b in GDC_BASE):
            pending.append((cur, n))
            continue
        keep.append(n)
    seq[:] = keep

    # ── chèn lại, gom theo CN để giữ đúng thứ tự case trong nhóm đích
    for cn in dict.fromkeys(c for c, _ in pending):
        nodes = [n for c, n in pending if c == cn]
        enters = [n for n in nodes if ENTER in norm(n.head())]
        others = [n for n in nodes if ENTER not in norm(n.head())]
        i = idx_of(seq, lambda x: x.kind == 'cn' and x.head() == cn)
        if i < 0:
            seq.extend(nodes)
            log.append('  ⚠ KHÔNG THẤY CN "%s" — nối cuối bảng' % cn[:40])
            continue

        if others:                       # → nhóm mới trong khối Giao diện, sau Giao diện chung
            a, b = cn_span(seq, i)
            gi, gj = group_span(seq, a, b, 'Giao diện chung')
            at = gj if gi >= 0 else block_span(seq, a, b, 'Giao diện')[1]
            seq[at:at] = [Node('sub', NEW_GRP)] + others
            log.append('  %-38s %2d case → nhóm "%s"' % (cn[:38], len(others), NEW_GRP))

        if enters:                       # → cuối nhóm đầu tiên của khối Chức năng
            a, b = cn_span(seq, i)
            ci, cj = block_span(seq, a, b, 'Chức năng')
            if ci < 0:
                at, dest = b, 'cuối CN (không có khối Chức năng)'
            else:
                j = ci + 1
                while j < cj and seq[j].kind not in ('sub', 'sub2'):
                    j += 1
                if j < cj:               # có nhóm → chèn vào cuối nhóm đầu tiên
                    dest = seq[j].head()[:30]
                    k = j + 1
                    while k < cj and seq[k].kind == 'case':
                        k += 1
                    at = k
                else:
                    at, dest = cj, 'khối Chức năng'
            seq[at:at] = enters
            log.append('  %-38s %2d case "nhấn Enter" → %s' % (cn[:38], len(enters), dest))


ATTT_CN_KW = ['an toan thong tin', 'phan quyen', 'quyen truy cap']


def is_attt_cn(head):
    """CN chuyên đề ATTT (không phải thao tác người dùng) — Admin không có dạng này."""
    n = norm(head)
    if not any(k in n for k in ATTT_CN_KW):
        return False
    return 'an toan thong tin' in n or n.startswith('phan quyen') or n.startswith('quyen ')


def merge_attt_cn(seq, log):
    """Hút CN chuyên đề ATTT vào khối `An toàn thông tin` của CN ĐẦU TIÊN, rồi bỏ CN đó.

    Giữ nguyên mọi nhóm + case (chỉ bỏ dòng tiêu đề CN và tiêu đề khối grp), nên
    cột F·G·R·T đi theo dòng của nó.
    """
    i = idx_of(seq, lambda n: n.kind == 'cn' and is_attt_cn(n.head()))
    if i < 0:
        return
    first = idx_of(seq, lambda n: n.kind == 'cn')
    if first == i:                        # CN ATTT là CN duy nhất/đầu tiên → không hút đi đâu
        log.append('  ⚠ CN ATTT là CN đầu tiên, bỏ qua: %s' % seq[i].head()[:50])
        return
    a, b = cn_span(seq, i)
    src_name = seq[a].head()
    body = [n for n in seq[a + 1:b] if n.kind != 'grp']      # bỏ header khối, giữ nhóm + case
    dropped_grp = (b - a - 1) - len(body)
    del seq[a:b]

    ai, aj = cn_span(seq, first)
    di, dj = block_span(seq, ai, aj, 'An toàn thông tin')
    if di < 0:                            # CN đích chưa có khối ATTT → tạo
        seq.insert(aj, Node('grp', 'An toàn thông tin'))
        dj = aj + 1
    seq[dj:dj] = body
    log.append('  CN "%s" (%d nhóm, %d case, bỏ %d dòng khối) → khối An toàn thông tin của "%s"'
               % (src_name[:38], sum(1 for n in body if n.kind != 'case'),
                  sum(1 for n in body if n.kind == 'case'), dropped_grp, seq[first].head()[:30]))


def run(path, bp, apply=False):
    tc = tcfix.load(path, bp)
    seq = parse(tc)
    before_case_rows = {n.row for n in seq if n.kind == 'case'}
    before_rows = {n.row for n in seq if n.row is not None}
    log = []
    move_gdc_stray(seq, log)
    if '--attt' in sys.argv:
        merge_attt_cn(seq, log)
    if not log:
        return 0

    after_rows = {n.row for n in seq if n.row is not None}
    lost = before_case_rows - after_rows
    assert not lost, 'MẤT CASE: %s' % sorted(lost)[:10]
    lost_hdr = before_rows - after_rows
    if lost_hdr:            # chỉ được phép mất dòng TIÊU ĐỀ (CN/khối bị hút đi)
        assert not (lost_hdr & before_case_rows), 'MẤT CASE'
        log.append('  bỏ %d dòng tiêu đề (CN ATTT + khối): %s' % (len(lost_hdr), sorted(lost_hdr)))

    print('##', os.path.basename(path)[18:-5], '/', bp,
          '(%d case, %d dòng)' % (len(before_case_rows), len(before_rows)))
    for l in log:
        print(l)
    if not apply:
        return len(log)

    p = tcfix.Plan(tc)
    for n in seq:
        if n.row is not None:
            p.keep(n.row)
        else:
            {'sub': p.add_sub, 'sub2': p.add_sub2, 'grp': p.add_grp, 'cn': p.add_cn}[n.kind](n.text)
    tc.rebuild(p).save(quiet=True, sync=False)
    print('   ĐÃ GHI (chạy formula_layer.py sau khi xong hết các sheet)')
    return len(log)


if __name__ == '__main__':
    ap = '--apply' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    tot = 0
    for f in sorted(glob.glob(DIR + '*.xlsx')):
        if os.path.basename(f) in SKIP:
            continue
        if only and not any(o.lower() in os.path.basename(f).lower() for o in only):
            continue
        for bp in tcfix.load(f).bpsheets:
            tot += run(f, bp, apply=ap)
    print('\n=== %s: %d nhóm case được chuyển chỗ ===' % ('ĐÃ GHI' if ap else 'DRY-RUN', tot))
