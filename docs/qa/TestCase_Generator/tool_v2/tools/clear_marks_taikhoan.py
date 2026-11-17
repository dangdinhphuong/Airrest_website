# -*- coding: utf-8 -*-
"""Xoá kết quả Lần 1 (cột F + ghi chú T) của các case ĐÃ ĐỔI KỲ VỌNG ở đợt rà 25/08.

Cách xác định: so NGUỒN MỚI với BACKUP nguồn cũ theo cặp (mục đích, các bước) —
case nào giữ nguyên cặp đó nhưng cột D (kết quả mong muốn) đã khác thì kết quả chạy cũ
không còn căn cứ, phải chạy lại. Chỉ đụng bộ `Ket-qua-test`; bộ `Ket-qua-test-thu-cong`
là kết quả người thật nên giữ nguyên.
"""
import sys, re, os, zipfile, unicodedata
import tcfix
import qalib

SRC = '../../testCase/NCC/testCase/Testcase-Role-NCC-TaiKhoan.xlsx'
OLD = os.path.expanduser('~/qa-backups/2026-08/bak_taikhoan_0825_1508/Testcase-Role-NCC-TaiKhoan.xlsx')
DST = '../../testCase/NCC/Ket-qua-test/Testcase-Role-NCC-TaiKhoan_ket_qua.xlsx'

def norm(s):
    s = (s or '').lower().replace('đ', 'd')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()

def cases(tc):
    out = {}
    for rn in tc.order:
        if rn >= 12 and tc.c(rn, 'C'):
            out.setdefault((norm(tc.c(rn, 'B')), norm(tc.c(rn, 'C'))[:220]), []).append(rn)
    return out

def main(apply=False):
    new, old = tcfix.load(SRC), tcfix.load(OLD)
    cn, co = cases(new), cases(old)
    changed = set()
    for k, rns in cn.items():
        if k not in co:
            continue
        for i, rn in enumerate(rns):
            if i >= len(co[k]):
                continue
            if norm(new.c(rn, 'D')) != norm(old.c(co[k][i], 'D')):
                changed.add(k)
    dst = tcfix.load(DST)
    hits = []
    for rn in dst.order:
        if rn < 12 or not dst.c(rn, 'C'):
            continue
        k = (norm(dst.c(rn, 'B')), norm(dst.c(rn, 'C'))[:220])
        if k in changed and (dst.c(rn, 'F') or '').strip():
            hits.append(rn)
    print('case doi ky vong:', len(changed), '| con mang ket qua Lan 1:', len(hits))
    print(hits)
    if not apply:
        return 0
    qalib.backup(DST, tag='clear_marks_0825', quiet=False)
    z = zipfile.ZipFile(DST)
    sheet = dst.sheet
    for rn in hits:
        for col in ('F', 'T'):
            sheet = re.sub(r'<c r="%s%d"([^>]*?)(?:/>|>.*?</c>)' % (col, rn),
                           lambda m: '<c r="%s%d"%s/>' % (col, rn, re.sub(r' t="[^"]*"', '', m.group(1))),
                           sheet, count=1, flags=re.S)
    tmp = DST + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for it in z.infolist():
            data = sheet.encode() if it.filename == dst.tcf else z.read(it.filename)
            out.writestr(it, data)
    z.close(); os.replace(tmp, DST)
    print('DA GHI', DST)
    return 0

if __name__ == '__main__':
    sys.exit(main('--apply' in sys.argv))
