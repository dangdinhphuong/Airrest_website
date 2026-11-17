# -*- coding: utf-8 -*-
"""Sửa các dòng do script sinh ở vòng trước bị thiếu ô F..T (mất viền nửa phải bảng).

Giữ nguyên nội dung MỌI cột đang có, chỉ bù các ô còn thiếu theo khuôn cột của chính file đó.
Bỏ qua file đang mở (có `.~lock…#`) và toàn bộ nhóm file KẾT QUẢ.

    python3 repair_cells.py                       # xem trước TOÀN BỘ testCase/ (không ghi)
    python3 repair_cells.py --apply               # ghi
    python3 repair_cells.py <thư mục|file> …      # giới hạn phạm vi
    python3 repair_cells.py Admin/testcase --apply

Mặc định là XEM TRƯỚC (trước đây chạy là ghi thẳng ~130 file — gõ nhầm một lần là hỏng cả bộ).
"""
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tcfix
import qalib

# Lấy từ hồ sơ dự án (tôn trọng `QA_PROJECT` + `QA_TESTCASE_DIR`), KHÔNG cắm cứng đường máy.
# Bản cũ ghi thẳng `/home/khuetm/projects/gstem/...` nên đổi máy / đổi chỗ checkout là `glob`
# ra RỖNG và script báo "0 file" — số 0 giả, đúng lớp điểm mù của README.
import roles                                                        # noqa: E402
ROOT = roles.PROJECT_BASE if hasattr(roles, 'PROJECT_BASE') else None
if not ROOT:
    _r = next(iter(roles.ROLES.values()))
    ROOT = _r['dir'].split(os.sep + list(roles.ROLES)[0] + os.sep)[0] + os.sep
if not os.path.isdir(ROOT):
    raise SystemExit('KHÔNG thấy thư mục bộ case: %s — đặt QA_TESTCASE_DIR.' % ROOT)

# Một regex duy nhất quét cả dòng: trước đây mỗi cột gọi một `re.search` với pattern
# ghép sẵn số dòng ⇒ cache regex của Python luôn trượt, phải biên dịch lại hàng chục nghìn lần.
COL_RE = re.compile(r'<c r="([A-Z]+)\d+"')          # đếm cột — chạy cho MỌI dòng, phải rẻ
CELL_RE = re.compile(r'<c r="([A-Z]+)\d+"[^>]*?(?:/>|>(.*?)</c>)', re.S)
TEXT_RE = re.compile(r'<t[^>]*>(.*?)</t>', re.S)
B_STYLE_RE = re.compile(r'<c r="B(\d+)" s="(\d+)"')


def scan_row(body):
    """Đọc một dòng XML đúng MỘT lần → {cột: nội dung} (chỉ cột có nội dung).

    Chỉ gọi khi dòng THIẾU ô — dòng đủ ô đã bị `COL_RE` loại từ trước, nên đường chạy
    thường xuyên vẫn chỉ tốn một phép đếm cột.
    """
    out = {}
    for col, inner in CELL_RE.findall(body):
        t = TEXT_RE.search(inner) if inner else None
        if t and t.group(1):
            out[col] = t.group(1)
    return out


def repair_file(path, apply=False):
    """Vá một file. Trả về (số dòng đã vá, số case sau khi vá, lỗi verify) hoặc None nếu bỏ qua."""
    tc = tcfix.load(path)
    if not tc.tpl.get('case'):
        return None
    st2lv = {v: k for k, v in tc.LV.items()}
    fixed = 0
    for rn in tc.order:
        if rn < 12:
            continue
        body = tc.rows[rn]['body']
        if len(COL_RE.findall(body)) >= len(tc.tpl['case']):
            continue
        # xác định loại dòng để lấy đúng khuôn cột
        if tc.c(rn, 'C'):
            key = 'case'
        else:
            bs = B_STYLE_RE.search(body)
            key = st2lv.get(bs.group(2)) if bs else None
            if key not in tc.tpl:
                continue
        keep = scan_row(body)                             # GIỮ NỘI DUNG MỌI CỘT
        out = []
        for col, st in tc.tpl[key]:
            if col in keep:
                out.append('<c r="%s%d" s="%s" t="inlineStr">'
                           '<is><t xml:space="preserve">%s</t></is></c>'
                           % (col, rn, st, keep[col]))
            else:
                out.append('<c r="%s%d" s="%s"/>' % (col, rn, st))
        tc.rows[rn]['body'] = ''.join(out)
        fixed += 1
    if not fixed:
        return None
    if not apply:
        return fixed, None, None
    tc.rebuild(tcfix.Plan(tc).keep_rest(12)).save(quiet=True)
    n, errs = tcfix.verify(path)
    return fixed, n, errs


def targets(argv):
    args = [a for a in argv[1:] if not a.startswith('--')]
    if not args:
        return sorted(glob.glob(ROOT + '**/*.xlsx', recursive=True))
    out = []
    for a in args:
        p = a if os.path.isabs(a) else os.path.join(ROOT, a)
        out += sorted(glob.glob(p + '/**/*.xlsx', recursive=True)) if os.path.isdir(p) else [p]
    return out


def main(argv):
    apply = '--apply' in argv
    tot_files = tot_rows = 0
    skipped = []
    for path in targets(argv):
        base = os.path.basename(path)
        if base.startswith('~$') or '/~$' in path:
            continue
        # KHÔNG chạm nhóm file KẾT QUẢ test (có thêm cột chứa dữ liệu chạy thật)
        if 'ket-qua' in path.lower() or 'ket_qua' in path.lower():
            skipped.append('%s (file kết quả — không xử lý)' % base)
            continue
        if qalib.is_locked(path):
            skipped.append('%s (đang mở)' % base)
            continue
        try:
            r = repair_file(path, apply)
        except Exception as e:
            skipped.append('%s (%s)' % (base, e))
            continue
        if not r:
            continue
        fixed, n, errs = r
        rel = path.replace(ROOT, '')
        if apply:
            print('  %-58s vá %3d dòng → %4d case %s' % (rel, fixed, n, 'OK' if not errs else errs))
        else:
            print('  %-58s sẽ vá %3d dòng' % (rel, fixed))
        tot_files += 1
        tot_rows += fixed

    print('\n=== %s %d dòng trong %d file ===%s'
          % ('ĐÃ VÁ' if apply else 'SẼ VÁ', tot_rows, tot_files,
             '' if apply else '   (xem trước, chưa ghi — thêm --apply để ghi)'))
    if skipped:
        print('BỎ QUA (đang mở / lỗi / file kết quả): %d' % len(skipped))
        for s in skipped[:15]:
            print('   -', s)
        if len(skipped) > 15:
            print('   … và %d file nữa' % (len(skipped) - 15))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
