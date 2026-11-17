# -*- coding: utf-8 -*-
"""Đồng bộ bộ NGUỒN `testCase/NCC/testCase/` (đã chuẩn hoá 2026-08-21) sang 2 thư mục
kết quả, GIỮ NGUYÊN kết quả đã chạy.

Cách làm (bài học các đợt trước): map theo **NỘI DUNG** `(mục đích, các bước)` chứ không
theo mã case — mã case dịch mỗi khi chèn/xoá dòng nên map theo mã sẽ gán lệch hàng loạt.
Case trùng nội dung trong cùng file được gán theo thứ tự xuất hiện.

  · lấy khung = file nguồn mới (đã có đủ 6 lớp công thức)
  · bơm lại cột F (kết quả) · G (lượt chạy 2, bộ thủ công) · S · T (ghi chú) từ file cũ
  · case mới chưa có kết quả → để trống, sẽ chạy ở đợt sau

    python3 sync_ncc_0821.py            # dry-run: chỉ báo khớp/lệch
    python3 sync_ncc_0821.py --apply
"""
import os, re, sys, shutil, unicodedata, subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import qalib

LOST = []                              # case cũ CÓ kết quả nhưng không còn trong nguồn
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../testCase/NCC/')
SRC = BASE + 'testCase/'
DSTS = [BASE + 'Ket-qua-test/', BASE + 'Ket-qua-test-thu-cong/']
CARRY = ['F', 'G', 'S', 'T']          # cột mang kết quả đã chạy
APPLY = '--apply' in sys.argv
ONLY = [a for a in sys.argv[1:] if not a.startswith('--')]


def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()


def key(tc, rn):
    return (norm(tc.c(rn, 'B')), norm(tc.c(rn, 'C'))[:220])


def read_marks(path, bp):
    """({(B,C): [vals…]}, {B: [vals…]}) theo thứ tự xuất hiện — vòng 2 khớp lỏng theo B."""
    tc = tcfix.load(path, bp)
    strict, loose = {}, {}
    for rn in tc.order:
        if rn < 12 or not tc.c(rn, 'C'):
            continue
        vals = {c: tc.c(rn, c) for c in CARRY if tc.c(rn, c)}
        strict.setdefault(key(tc, rn), []).append(vals)
        loose.setdefault(norm(tc.c(rn, 'B')), []).append(vals)
    return strict, loose


def setcell(tc, rn, col, val):
    body = tc.rows[rn]['body']
    cm = re.search(r'<c r="%s%d"[^>]*?(?:/>|>.*?</c>)' % (col, rn), body, re.S)
    st = re.search(r's="(\d+)"', cm.group(0)).group(1) if cm and re.search(r's="(\d+)"', cm.group(0)) else '72'
    new = ('<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
           % (col, rn, st, tcfix.esc(val)))
    tc.rows[rn]['body'] = body.replace(cm.group(0), new) if cm else body + new


def sync(src_path, dst_path):
    name = os.path.basename(dst_path)
    sheets = tcfix.load(src_path).bpsheets
    _m = {bp: read_marks(dst_path, bp) for bp in tcfix.load(dst_path).bpsheets}
    old = {bp: v[0] for bp, v in _m.items()}
    loose_all = {bp: v[1] for bp, v in _m.items()}
    n_old = sum(len(v) for m in old.values() for v in m.values())

    hit = hit2 = miss = new = 0
    plan = {}                                    # bp -> {rn: {cột: giá trị}}
    for bp in sheets:
        tc = tcfix.load(src_path, bp)
        pool = old.get(bp) or (list(old.values())[0] if len(old) == 1 and len(sheets) == 1 else {})
        loose = loose_all.get(bp) or (list(loose_all.values())[0] if len(loose_all) == 1 and len(sheets) == 1 else {})
        used, used_l, rows, pending = {}, {}, {}, []
        for rn in tc.order:
            if rn < 12 or not tc.c(rn, 'C'):
                continue
            k = key(tc, rn)
            lst = pool.get(k)
            i = used.get(k, 0)
            if lst and i < len(lst):
                used[k] = i + 1
                used_l[norm(tc.c(rn, 'B'))] = used_l.get(norm(tc.c(rn, 'B')), 0) + 1
                if lst[i]:
                    rows[rn] = lst[i]; hit += 1
                else:
                    new += 1
            else:
                pending.append(rn)
        for rn in pending:                       # vòng 2: khớp lỏng theo mục đích (cột B)
            b = norm(tc.c(rn, 'B'))
            lst = loose.get(b); i = used_l.get(b, 0)
            if lst and i < len(lst) and lst[i]:
                used_l[b] = i + 1
                rows[rn] = lst[i]; hit2 += 1
            else:
                new += 1
        plan[bp] = rows
        for k, v in pool.items():
            for vals in v[used.get(k, 0):]:
                if vals.get('F'):
                    LOST.append((name, bp, k[0][:90], vals.get('F', ''), (vals.get('T') or '')[:150]))
        miss += sum(max(0, len(v) - used.get(k, 0)) for k, v in pool.items())

    print('%-52s cũ=%4d  khớp=%4d (+%3d lỏng)  chưa chạy=%4d  không còn=%3d'
          % (name[:52], n_old, hit, hit2, new, max(0, miss - hit2)))
    if not APPLY:
        return

    bak = qalib.backup(dst_path, tag='sync0821')
    shutil.copy2(src_path, dst_path)             # khung = nguồn mới (đủ lớp công thức)
    for bp, rows in plan.items():
        if not rows:
            continue
        tc = tcfix.load(dst_path, bp)
        for rn, vals in rows.items():
            for col, v in vals.items():
                setcell(tc, rn, col, v)
        pl = tcfix.Plan(tc)
        pl.items = [r for r in tc.order if r >= 12]
        tc.rebuild(pl).save(quiet=True, sync=False)
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                 'formula_layer.py'), dst_path],
                   check=True, capture_output=True)
    print('    → ĐÃ GHI (bản lùi: %s)' % (qalib.bak_show(bak) if bak else 'không có bản cũ'))


if __name__ == '__main__':
    for dst_dir in DSTS:
        if not os.path.isdir(dst_dir):
            continue
        print('\n### %s' % os.path.basename(dst_dir.rstrip('/')))
        for f in sorted(os.listdir(dst_dir)):
            if not f.endswith('.xlsx') or f.startswith('~'):
                continue
            stem = f.replace('_ket_qua _test_thu_cong', '').replace('_ket_qua_test_thu_cong', '') \
                    .replace('_ket_qua', '').replace('.xlsx', '')
            cand = [SRC + stem + '.xlsx', SRC + stem + '-mau.xlsx']
            if stem == 'Testcase-Role-NCC-ThietBi':
                cand = [SRC + 'Testcase-Role-NCC-mau.xlsx']
            src = next((c for c in cand if os.path.exists(c)), None)
            if not src:
                print('%-52s ⚠ KHÔNG THẤY file nguồn' % f[:52]); continue
            if os.path.basename(src) == 'Testcase-Role-NCC-mau.xlsx':
                print('%-52s BỎ QUA (file mẫu, ngoài phạm vi đợt này)' % f[:52]); continue
            if ONLY and not any(o.lower() in f.lower() for o in ONLY):
                continue
            sync(src, dst_dir + f)
    if LOST:
        rp = BASE + 'bao-cao/_CASE-CU-KHONG-CON-2026-08-21.md'
        with open(rp, 'w', encoding='utf-8') as fh:
            fh.write('# Case cũ có kết quả nhưng KHÔNG còn trong bộ nguồn sau đợt chuẩn hoá 2026-08-21\n\n')
            fh.write('Phần lớn là case bị luật mới loại bỏ (nhóm "đang tải / lỗi tải", case phân trang\n'
                     'đặt sai khối) hoặc case đã đổi lời văn. Giữ lại đây để tra cứu, bản kết quả cũ\n'
                     'nằm trong thư mục bản lùi `bak/` (xem `qalib.bak_dir()`).\n\n')
            fh.write('| File | Sheet | Mục đích | KQ | Ghi chú |\n|---|---|---|---|---|\n')
            for r in LOST:
                fh.write('| %s | %s | %s | %s | %s |\n' % tuple(
                    str(x).replace('|', '/').replace('\n', ' ') for x in r))
        print('\n→ %d case cũ không còn trong nguồn: đã ghi %s' % (len(LOST), os.path.basename(rp)))
    print('\n=== %s ===' % ('ĐÃ GHI' if APPLY else 'DRY-RUN'))
